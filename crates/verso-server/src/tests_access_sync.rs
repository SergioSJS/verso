// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! ADR 0113 S8: the synced desktop is one more door of the one model. A
//! device is told a note whole, and may put it back, exactly when the
//! person edits it (a row of its own, the whole table's row, or a folder's
//! editor who sees it); otherwise it is told the projection and its put is
//! refused. What it may do is answered by `access_get` (`brief`), and a
//! path it does not see is answered as a free name is.

use base64::Engine as _;
use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{block_on, sign_in};
use crate::tests_campaign::{Mesa, Win, mesa};

const SECRET: &str = "zqsegredo";

fn refused(v: &Value) -> bool {
    v["err"]["kind"] == "refused"
}

fn hash_of(files: &Value, path: &str) -> Option<String> {
    files["ok"]["files"]
        .as_array()?
        .iter()
        .find(|f| f["path"] == path)
        .and_then(|f| f["hash"].as_str().map(str::to_owned))
}

/// A note read by the device: the text of the first piece.
async fn read(w: &mut Win, path: &str) -> String {
    let a = w
        .call("sync_read", json!({ "path": path, "offset": 0 }))
        .await;
    let data = a["ok"]["data"].as_str().unwrap_or_default();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .unwrap_or_default();
    String::from_utf8_lossy(&bytes).into_owned()
}

fn put(path: &str, text: &str, base: Option<&str>) -> Value {
    let bytes = text.as_bytes();
    json!({
        "path": path, "offset": 0, "size": bytes.len(),
        "hash": crate::sync::sha256(bytes), "base": base,
        "data": base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

/// `Livre.md` holds a secret block; Ana edits it by a row of her own, the
/// whole table sees it.
async fn livre_for_ana(m: &mut Mesa) -> String {
    let read = m
        .owner
        .call("read_note", json!({ "path": "Livre.md" }))
        .await;
    let text = format!("Livre palavrachave\n\n> [!secret]\n> {SECRET}\n");
    let wrote = m
        .owner
        .call(
            "write_note",
            json!({ "path": "Livre.md", "text": text, "revision": read["ok"]["revision"] }),
        )
        .await;
    assert!(wrote.get("ok").is_some(), "{wrote}");
    let set = json!({ "kind": "set", "secret_name": null, "set": {
        "whole": "see", "rows": [{ "account": m.ana_id, "level": "edit" }] } });
    let a = m
        .owner
        .call(
            "access_set",
            json!({ "paths": ["Livre.md"], "change": set }),
        )
        .await;
    assert!(a.get("ok").is_some(), "{a}");
    text
}

async fn cid(m: &Mesa) -> Win {
    let c =
        m.r.server
            .db
            .create_account("cid@casa.lan", "Cid", "pt", Some("a senha do cid"), false)
            .unwrap();
    m.r.server.db.grant(&m.id, &c.id, Role::Editor).unwrap();
    let b = sign_in(&m.r, "cid@casa.lan", "a senha do cid").await;
    let (w, o) = Win::open(&m.r, &b, &m.id).await;
    assert!(o.get("ok").is_some(), "{o}");
    w
}

#[test]
fn a_device_is_told_a_note_it_edits_whole_and_puts_it_back_and_the_others_a_projection() {
    block_on(async {
        let mut m = mesa().await;
        let text = livre_for_ana(&mut m).await;
        // Ana edits it: whole, hash of the file itself.
        let state = m.ana.call("sync_state", json!({})).await;
        let hash = hash_of(&state, "Livre.md").expect("Livre is listed");
        assert_eq!(hash, crate::sync::sha256(text.as_bytes()), "{state}");
        assert!(read(&mut m.ana, "Livre.md").await.contains(SECRET));
        // Bia only sees it: the projection, in her count.
        let state = m.bia.call("sync_state", json!({})).await;
        let theirs = hash_of(&state, "Livre.md").expect("Bia sees Livre");
        assert_ne!(theirs, hash);
        assert!(!read(&mut m.bia, "Livre.md").await.contains(SECRET));
        // Ana puts her edit back; Bia's put is refused, so is Ana's on a
        // note she only sees.
        let edited = format!("{text}\ndo Ana\n");
        let done = m
            .ana
            .call("sync_put", put("Livre.md", &edited, Some(&hash)))
            .await;
        assert!(done.get("ok").is_some(), "{done}");
        let owner = m
            .owner
            .call("read_note", json!({ "path": "Livre.md" }))
            .await;
        assert_eq!(owner["ok"]["text"], edited.as_str(), "{owner}");
        let no = m
            .bia
            .call("sync_put", put("Livre.md", "do Bia\n", Some(&theirs)))
            .await;
        assert!(refused(&no), "{no}");
        let no = m
            .ana
            .call("sync_put", put("Aberta.md", "do Ana\n", None))
            .await;
        assert!(refused(&no), "{no}");
        // Her right taken away: the next listing is the projection again
        // and the put is refused.
        let see =
            json!({ "kind": "set", "secret_name": null, "set": { "whole": "see", "rows": [] } });
        let a = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Livre.md"], "change": see }),
            )
            .await;
        assert!(a.get("ok").is_some(), "{a}");
        let state = m.ana.call("sync_state", json!({})).await;
        let now = hash_of(&state, "Livre.md").expect("still seen");
        assert!(!read(&mut m.ana, "Livre.md").await.contains(SECRET));
        let no = m
            .ana
            .call("sync_put", put("Livre.md", "outra\n", Some(&now)))
            .await;
        assert!(refused(&no), "{no}");
    });
}

#[test]
fn a_folders_editor_device_writes_what_it_sees_and_is_told_nothing_of_the_rest() {
    block_on(async {
        let mut m = mesa().await;
        let text = livre_for_ana(&mut m).await;
        let mut cid = cid(&m).await;
        let state = cid.call("sync_state", json!({})).await;
        // Sees what the table released; the hidden is not even named.
        assert!(!state.to_string().contains("Barão"), "{state}");
        let hash = hash_of(&state, "Livre.md").expect("Cid sees Livre");
        assert_eq!(hash, crate::sync::sha256(text.as_bytes()));
        assert!(read(&mut cid, "Livre.md").await.contains(SECRET));
        let done = cid
            .call("sync_put", put("Livre.md", "do Cid\n", Some(&hash)))
            .await;
        assert!(done.get("ok").is_some(), "{done}");
        // A demoted editor is a reader: the projection at once.
        m.r.server
            .db
            .grant(
                &m.id,
                &m.r.server
                    .db
                    .account_by_email("cid@casa.lan")
                    .unwrap()
                    .unwrap()
                    .id,
                Role::Reader,
            )
            .unwrap();
        let state = cid.call("sync_state", json!({})).await;
        assert_ne!(hash_of(&state, "Livre.md").unwrap(), hash, "{state}");
    });
}

#[test]
fn what_a_device_may_do_is_answered_by_the_one_judgement_and_a_hidden_path_like_a_free_name() {
    block_on(async {
        let mut m = mesa().await;
        livre_for_ana(&mut m).await;
        let paths = json!(["Livre.md", "Aberta.md", "Barão Zq.md", "Nada Zq.md"]);
        let a = m
            .ana
            .call("access_get", json!({ "paths": paths, "brief": true }))
            .await;
        let list = a["ok"].as_array().expect("an array").clone();
        let of = |p: &str| list.iter().find(|r| r["path"] == p).unwrap().clone();
        assert_eq!(of("Livre.md")["put"], true, "{a}");
        assert_eq!(of("Aberta.md")["put"], false, "{a}");
        assert_eq!(of("Aberta.md")["see"], true, "{a}");
        // A hidden note and a note that is not there answer alike.
        let (h, n) = (of("Barão Zq.md"), of("Nada Zq.md"));
        for k in ["see", "put", "delete", "rename"] {
            assert_eq!(h[k], n[k], "{k}: {a}");
        }
        assert_eq!(h["see"], false);
        assert!(!a.to_string().contains("zqbody"), "{a}");
        // The game master may everything.
        let o = m
            .owner
            .call(
                "access_get",
                json!({ "paths": ["Barão Zq.md"], "brief": true }),
            )
            .await;
        assert_eq!(o["ok"][0]["put"], true, "{o}");
    });
}

fn same_but_path(a: &Value, b: &Value) -> bool {
    ["see", "put", "delete", "rename"]
        .iter()
        .all(|k| a[k] == b[k])
}

/// A hidden file and a free name are one answer, whatever the folder's set
/// and the role: nothing in `brief` tells them apart (BLOCKING if it did).
#[test]
fn a_hidden_file_and_a_free_name_are_one_answer_across_sets_and_roles() {
    block_on(async {
        let mut m = mesa().await;
        let mut cid = cid(&m).await;
        for whole in ["none", "see", "edit"] {
            let folder = json!({ "kind": "set", "secret_name": null,
                "set": { "whole": whole, "rows": [] } });
            let a = m
                .owner
                .call("access_set", json!({ "paths": [""], "change": folder }))
                .await;
            assert!(a.get("ok").is_some(), "{a}");
            // The hidden note keeps an own set of none under every folder set.
            let none = json!({ "kind": "set", "secret_name": null,
                "set": { "whole": "none", "rows": [] } });
            let a = m
                .owner
                .call(
                    "access_set",
                    json!({ "paths": ["Barão Zq.md"], "change": none }),
                )
                .await;
            assert!(a.get("ok").is_some(), "{a}");
            let paths = json!(["Barão Zq.md", "Nada Zq.md", "Mundo Zq/Nada Zq.md"]);
            for (who, w) in [("ana", &mut m.ana), ("cid", &mut cid)] {
                let r = w
                    .call("access_get", json!({ "paths": paths, "brief": true }))
                    .await;
                let list = r["ok"].as_array().expect("an array").clone();
                assert!(
                    same_but_path(&list[0], &list[1]),
                    "{who}, folder {whole}: {} / {}",
                    list[0],
                    list[1]
                );
                assert_eq!(list[0]["see"], false);
                assert_eq!(list[0]["delete"], false);
                assert_eq!(list[0]["rename"], false);
            }
        }
    });
}

/// A read-only credential of an account that edits a note is told the
/// projection, as its window is, and puts nothing.
#[test]
fn a_read_only_credential_of_an_editing_account_is_told_the_projection() {
    block_on(async {
        let mut m = mesa().await;
        let text = livre_for_ana(&mut m).await;
        let mut cid = cid(&m).await;
        let whole = crate::sync::sha256(text.as_bytes());
        for w in [&mut m.ana, &mut cid] {
            let state = w.call("sync_state", json!({})).await;
            assert_eq!(hash_of(&state, "Livre.md").unwrap(), whole);
        }
        for c in verso_service::lock(&m.r.server.clients).values_mut() {
            if c.account == m.ana_id || c.account != m.bia_id {
                c.token_write = false;
            }
        }
        for w in [&mut m.ana, &mut cid] {
            let state = w.call("sync_state", json!({})).await;
            let h = hash_of(&state, "Livre.md").unwrap();
            assert_ne!(h, whole, "{state}");
            assert!(!read(w, "Livre.md").await.contains(SECRET));
            let no = w.call("sync_put", put("Livre.md", "x\n", Some(&h))).await;
            assert!(refused(&no), "{no}");
        }
    });
}
