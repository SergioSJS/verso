// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync's side on the server (ADR 0079), against a running server.

use base64::Engine;
use serde_json::{Value, json};

use crate::sync::{PIECE, sha256};
use crate::tests::{
    Socket, block_on, call, connect, folder_id, get, next, post, put, sign_in, start,
};

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

async fn opened(r: &crate::tests::Running, b: &crate::tests::Browser) -> Socket {
    let id = folder_id(r, b).await;
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    ws
}

/// Send a file in pieces, as a device does.
async fn send(ws: &mut Socket, id: u64, path: &str, bytes: &[u8], base: Option<&str>) -> Value {
    let hash = sha256(bytes);
    let mut offset = 0usize;
    let mut n = id;
    loop {
        let end = (offset + PIECE).min(bytes.len());
        let answer = call(
            ws,
            n,
            "sync_put",
            json!({ "path": path, "offset": offset, "size": bytes.len(), "hash": hash, "base": base, "data": b64(&bytes[offset..end]) }),
        )
        .await;
        n += 1;
        if answer.get("err").is_some() || answer["ok"]["done"] == true {
            return answer;
        }
        offset = end;
    }
}

/// Read a file in pieces, as a device does.
async fn fetch(ws: &mut Socket, id: u64, path: &str) -> (Vec<u8>, String) {
    let mut out = Vec::new();
    let mut hash = String::new();
    let mut n = id;
    loop {
        let a = call(
            ws,
            n,
            "sync_read",
            json!({ "path": path, "offset": out.len() }),
        )
        .await;
        n += 1;
        if out.is_empty() {
            hash = a["ok"]["hash"].as_str().unwrap().to_owned();
        }
        out.extend(
            base64::engine::general_purpose::STANDARD
                .decode(a["ok"]["data"].as_str().unwrap())
                .unwrap(),
        );
        if a["ok"]["done"] == true {
            break;
        }
    }
    (out, hash)
}

#[test]
fn every_write_path_ends_in_the_folders_log() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &b).await;
        let state = call(&mut ws, 2, "sync_state", json!({})).await;
        let head = state["ok"]["head"].as_i64().unwrap();
        assert!(
            state["ok"]["files"].to_string().contains("Sessao.md"),
            "{state}"
        );
        // A note made in the window.
        call(
            &mut ws,
            3,
            "create_note",
            json!({ "name": "Nova", "text": "# Nova\n" }),
        )
        .await;
        let after = call(&mut ws, 4, "sync_changes", json!({ "since": head })).await;
        let c = &after["ok"]["changes"][0];
        assert_eq!(c["path"], "Nova.md", "{after}");
        assert_eq!(c["hash"], sha256(b"# Nova\n"));
        // Renamed in the window: the old path gone, the new one naming it.
        let head = after["ok"]["head"].as_i64().unwrap();
        call(
            &mut ws,
            5,
            "rename_note",
            json!({ "from": "Nova.md", "to": "Outra.md" }),
        )
        .await;
        let after = call(&mut ws, 6, "sync_changes", json!({ "since": head })).await;
        let list = after["ok"]["changes"].as_array().unwrap();
        assert!(
            list.iter()
                .any(|c| c["path"] == "Nova.md" && c["deleted"] == true),
            "{after}"
        );
        assert!(
            list.iter()
                .any(|c| c["path"] == "Outra.md" && c["renamedFrom"] == "Nova.md"),
            "{after}"
        );
        // Deleted in the window.
        let head = after["ok"]["head"].as_i64().unwrap();
        call(&mut ws, 7, "delete_note", json!({ "path": "Outra.md" })).await;
        let after = call(&mut ws, 8, "sync_changes", json!({ "since": head })).await;
        assert_eq!(after["ok"]["changes"][0]["deleted"], true, "{after}");
    });
}

#[test]
fn a_device_writes_only_over_the_file_it_based_its_change_on() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &b).await;
        // New: no base.
        let made = send(
            &mut ws,
            10,
            "notas/do-aparelho.md",
            b"# Do aparelho\n",
            None,
        )
        .await;
        assert_eq!(made["ok"]["done"], true, "{made}");
        let (bytes, hash) = fetch(&mut ws, 20, "notas/do-aparelho.md").await;
        assert_eq!(bytes, b"# Do aparelho\n");
        // Over it, from the right base.
        let edited = send(
            &mut ws,
            30,
            "notas/do-aparelho.md",
            b"# Do aparelho\n\nmais\n",
            Some(&hash),
        )
        .await;
        assert_eq!(edited["ok"]["done"], true, "{edited}");
        // From a base that is no longer the file: refused, nothing written,
        // the hash of now in the message.
        let stale = send(
            &mut ws,
            40,
            "notas/do-aparelho.md",
            b"# Velho\n",
            Some(&hash),
        )
        .await;
        assert_eq!(stale["err"]["kind"], "changed", "{stale}");
        assert_eq!(stale["err"]["message"], sha256(b"# Do aparelho\n\nmais\n"));
        let (bytes, now) = fetch(&mut ws, 50, "notas/do-aparelho.md").await;
        assert_eq!(bytes, b"# Do aparelho\n\nmais\n");
        // A new file where one stands: refused too.
        let twice = send(&mut ws, 60, "notas/do-aparelho.md", b"x", None).await;
        assert_eq!(twice["err"]["kind"], "changed", "{twice}");
        // A rename and a deletion name their base.
        let wrong = call(
            &mut ws,
            70,
            "sync_delete",
            json!({ "path": "notas/do-aparelho.md", "base": hash }),
        )
        .await;
        assert_eq!(wrong["err"]["kind"], "changed", "{wrong}");
        let moved = call(
            &mut ws,
            71,
            "sync_rename",
            json!({ "from": "notas/do-aparelho.md", "to": "notas/movida.md", "base": now }),
        )
        .await;
        assert!(moved.get("ok").is_some(), "{moved}");
        let gone = call(
            &mut ws,
            72,
            "sync_delete",
            json!({ "path": "notas/movida.md", "base": now }),
        )
        .await;
        assert!(gone.get("ok").is_some(), "{gone}");
    });
}

#[test]
fn a_large_file_goes_and_comes_back_in_pieces() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &b).await;
        // Over two pieces: 9 MiB of bytes that are not text.
        let bytes: Vec<u8> = (0..9 * 1024 * 1024u32)
            .map(|i| (i.wrapping_mul(2_654_435_761) >> 24) as u8)
            .collect();
        let sent = send(&mut ws, 100, "anexos/grande.bin", &bytes, None).await;
        assert_eq!(sent["ok"]["done"], true, "{sent}");
        let (back, hash) = fetch(&mut ws, 200, "anexos/grande.bin").await;
        assert_eq!(back.len(), bytes.len());
        assert_eq!(hash, sha256(&bytes));
        assert!(back == bytes);
        // A piece out of order starts nothing.
        let out_of_order = call(
            &mut ws,
            300,
            "sync_put",
            json!({ "path": "anexos/x.bin", "offset": 10, "size": 20, "hash": "h", "base": null, "data": b64(b"0123456789") }),
        )
        .await;
        assert_eq!(out_of_order["err"]["kind"], "refused", "{out_of_order}");
    });
}

#[test]
fn a_reader_syncs_to_read_and_the_quota_holds_for_sync() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (_, made) = post(
            &r,
            "/api/admin/accounts",
            json!({ "email": "leitor@casa.lan", "name": "Leitor", "lang": "pt" }),
            Some(&admin),
        )
        .await;
        let token = made["link"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .to_owned();
        post(
            &r,
            &format!("/api/reset/{token}"),
            json!({ "password": "a senha do leitor" }),
            None,
        )
        .await;
        put(
            &r,
            &format!("/api/folders/{id}/members/leitor@casa.lan"),
            json!({ "role": "reader" }),
            &admin,
        )
        .await;
        let reader = sign_in(&r, "leitor@casa.lan", "a senha do leitor").await;
        let mut ws = connect(&r, Some(&reader.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let state = call(&mut ws, 2, "sync_state", json!({})).await;
        assert!(state.get("ok").is_some(), "{state}");
        let refused = send(&mut ws, 3, "x.md", b"x", None).await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        // Removed by e-mail, as granted: their connection is told the
        // folder is gone, and removing them again is said, not done.
        let gone = remove(
            &r,
            &format!("/api/folders/{id}/members/leitor@casa.lan"),
            &admin,
        )
        .await;
        assert_eq!(gone, 200);
        let told = next(&mut ws).await;
        assert_eq!(told["gone"], "folder", "{told}");
        let again = remove(
            &r,
            &format!("/api/folders/{id}/members/leitor@casa.lan"),
            &admin,
        )
        .await;
        assert_eq!(again, 404);
        // The admin's device under a quota.
        put(
            &r,
            &format!("/api/admin/folders/{id}/quota"),
            json!({ "quota": 100 }),
            &admin,
        )
        .await;
        let mut mine = opened(&r, &admin).await;
        let over = send(&mut mine, 10, "grande.md", &[b'a'; 500], None).await;
        assert_eq!(over["err"]["kind"], "quota", "{over}");
    });
}

async fn remove(r: &crate::tests::Running, path: &str, b: &crate::tests::Browser) -> u16 {
    reqwest::Client::new()
        .delete(r.url(path))
        .header("origin", r.origin())
        .header("cookie", &b.cookie)
        .header("x-verso-csrf", &b.csrf)
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

/// On a file system that folds names (APFS, NTFS), a new file whose name
/// another one holds but for its case is refused as a name taken, said as
/// such — not as a change of that other file (found in the sync campaign
/// with a Linux device, 2026-10-10).
#[cfg(any(target_os = "macos", windows))]
#[test]
fn a_name_taken_but_for_its_case_is_said_as_such() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &admin).await;
        let first = send(&mut ws, 10, "Receita.md", b"# Receita\n", None).await;
        assert_eq!(first["ok"]["done"], true, "{first}");
        call(&mut ws, 20, "reindex", json!({})).await;
        let twin = send(&mut ws, 30, "receita.md", b"# receita\n", None).await;
        assert_eq!(twin["err"]["kind"], "exists", "{twin}");
    });
}

/// On a file system that folds names, a device that has not yet heard of a
/// respelling sends its edit under the old spelling: the write lands on
/// the file the disk keeps under the new one, and the log follows the
/// disk's spelling — one file, never two spellings of it in the manifest.
#[cfg(any(target_os = "macos", windows))]
#[test]
fn a_write_through_another_spelling_keeps_one_entry_in_the_log() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &admin).await;
        // The folder walked now: the next walk is a minute away, and the
        // log is as the writes keep it.
        call(&mut ws, 5, "sync_state", json!({})).await;
        let first = send(&mut ws, 10, "Receita.md", b"# v1\n", None).await;
        assert_eq!(first["ok"]["done"], true, "{first}");
        call(&mut ws, 20, "reindex", json!({})).await;
        let renamed = call(
            &mut ws,
            21,
            "sync_rename",
            json!({ "from": "Receita.md", "to": "receita.md", "base": sha256(b"# v1\n") }),
        )
        .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        let late = send(
            &mut ws,
            30,
            "Receita.md",
            b"# v2\n",
            Some(&sha256(b"# v1\n")),
        )
        .await;
        assert_eq!(late["ok"]["done"], true, "{late}");
        // Said where it landed: a device's picture keeps one entry.
        assert_eq!(late["ok"]["path"], "receita.md", "{late}");
        let state = call(&mut ws, 40, "sync_state", json!({})).await;
        let spellings: Vec<(String, String)> = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|f| f["path"].as_str().unwrap().to_lowercase() == "receita.md")
            .map(|f| {
                (
                    f["path"].as_str().unwrap().to_owned(),
                    f["hash"].as_str().unwrap().to_owned(),
                )
            })
            .collect();
        assert_eq!(
            spellings,
            vec![("receita.md".to_owned(), sha256(b"# v2\n"))],
            "{state}"
        );
    });
}

/// One name is one file on the server (spec Q7, decided 2026-10-10;
/// finding F20 of the sync campaign): a device whose file system keeps
/// `Café.md` decomposed sends, fetches and deletes the file the server
/// keeps composed — on every server, ext4 included, where the two forms
/// would be two files. The log keeps one entry, spelled as the disk keeps
/// it; a new file under the other form is a name taken, said as such.
#[test]
fn the_other_form_of_a_name_addresses_the_file_the_server_keeps() {
    const COMPOSED: &str = "Caf\u{e9}.md";
    const DECOMPOSED: &str = "Cafe\u{301}.md";
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &admin).await;
        // The folder walked now: the next walk is a minute away, and the
        // log is as the writes keep it.
        call(&mut ws, 5, "sync_state", json!({})).await;
        let first = send(&mut ws, 10, COMPOSED, b"# v1\n", None).await;
        assert_eq!(first["ok"]["done"], true, "{first}");
        // The edit of a device that keeps the name decomposed.
        let edit = send(&mut ws, 20, DECOMPOSED, b"# v2\n", Some(&sha256(b"# v1\n"))).await;
        assert_eq!(edit["ok"]["done"], true, "{edit}");
        let entries = |state: &Value| -> Vec<(String, String)> {
            state["ok"]["files"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| {
                    (
                        f["path"].as_str().unwrap().to_owned(),
                        f["hash"].as_str().unwrap().to_owned(),
                    )
                })
                .filter(|(p, _)| p.starts_with("Caf"))
                .collect()
        };
        let state = call(&mut ws, 30, "sync_state", json!({})).await;
        assert_eq!(
            entries(&state),
            vec![(COMPOSED.to_owned(), sha256(b"# v2\n"))],
            "{state}"
        );
        // Fetched through the other form: the same file.
        let (bytes, hash) = fetch(&mut ws, 40, DECOMPOSED).await;
        assert_eq!(bytes, b"# v2\n");
        assert_eq!(hash, sha256(b"# v2\n"));
        // A new file under the other form: the name is taken.
        let twin = send(&mut ws, 50, DECOMPOSED, b"# outro\n", None).await;
        assert_eq!(twin["err"]["kind"], "exists", "{twin}");
        // A new file in a folder named in the other form goes into that
        // folder, never a second one beside it.
        let a = send(&mut ws, 60, "C\u{e9}u/a.md", b"a", None).await;
        assert_eq!(a["ok"]["done"], true, "{a}");
        let b = send(&mut ws, 70, "Ce\u{301}u/b.md", b"b", None).await;
        assert_eq!(b["ok"]["done"], true, "{b}");
        let state = call(&mut ws, 80, "sync_state", json!({})).await;
        let in_folder: Vec<String> = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["path"].as_str())
            .filter(|p| p.starts_with("C"))
            .map(str::to_owned)
            .collect();
        assert!(in_folder.contains(&"C\u{e9}u/a.md".to_owned()), "{state}");
        assert!(in_folder.contains(&"C\u{e9}u/b.md".to_owned()), "{state}");
        // Deleted through the other form: gone, one entry less.
        let gone = call(
            &mut ws,
            90,
            "sync_delete",
            json!({ "path": DECOMPOSED, "base": sha256(b"# v2\n") }),
        )
        .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let state = call(&mut ws, 100, "sync_state", json!({})).await;
        assert_eq!(entries(&state), vec![], "{state}");
    });
}

/// A name in two files on the server's disk, its accents in two Unicode
/// forms, from before one name was one file (spec Q7; C8b of the live
/// campaign, 2026-10-11, on an ext4 server): the walk keeps one in the log
/// and holds the other — said, never synced, and never entered by a write
/// that names it. Only a file system that tells the forms apart can hold
/// both (ext4; APFS cannot).
#[cfg(target_os = "linux")]
#[test]
fn a_name_in_two_files_on_the_servers_disk_syncs_one_and_holds_the_other() {
    const COMPOSED: &str = "Caf\u{e9}.md";
    const DECOMPOSED: &str = "Cafe\u{301}.md";
    block_on(async {
        let r = start().await;
        let dir = r.server.folder_path("Campanha").unwrap();
        for (name, text) in [(COMPOSED, "# composto\n"), (DECOMPOSED, "# decomposto\n")] {
            use std::io::Write;
            let mut f = tempfile::NamedTempFile::new_in(&dir).unwrap();
            f.write_all(text.as_bytes()).unwrap();
            f.persist(dir.join(name)).unwrap();
        }
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let mut ws = opened(&r, &admin).await;
        let cafes = |state: &Value| -> Vec<(String, String)> {
            state["ok"]["files"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| {
                    (
                        f["path"].as_str().unwrap().to_owned(),
                        f["hash"].as_str().unwrap().to_owned(),
                    )
                })
                .filter(|(p, _)| p.starts_with("Caf"))
                .collect()
        };
        let state = call(&mut ws, 5, "sync_state", json!({})).await;
        assert_eq!(
            cafes(&state),
            vec![(COMPOSED.to_owned(), sha256(b"# composto\n"))],
            "{state}"
        );
        assert_eq!(
            crate::twins::of_folder(&r.server, &id),
            vec![crate::twins::Twin {
                kept: COMPOSED.to_owned(),
                held: DECOMPOSED.to_owned(),
            }]
        );
        // A write the server knows names the held one: still not in the log.
        let key = verso_service::lock(&r.server.keys)
            .iter()
            .find(|(_, f)| **f == id)
            .map(|(k, _)| k.clone())
            .unwrap();
        crate::sync::reconcile_written(&r.server, &id, &key, None, &[DECOMPOSED.to_owned()])
            .unwrap();
        let state = call(&mut ws, 6, "sync_state", json!({})).await;
        assert_eq!(cafes(&state).len(), 1, "{state}");
    });
}

/// The unit of sync is a file (ADR 0079 item 2): a folder the window makes
/// — as the window in a browser and the demo's import do, the folder
/// first, then the files in it — is never read as a file nor said as one
/// kept as it was, and the folder's log holds the file in it, never the
/// folder (found 2026-10-10: a WARN "Is a directory" per new folder).
#[test]
fn a_folder_made_in_the_window_is_no_entry_of_the_log() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &admin).await;
        call(&mut ws, 2, "sync_state", json!({})).await;
        for (n, path) in [(3, "Pasta-de-anexos"), (4, "Pasta-de-anexos-vazia")] {
            let made = call(&mut ws, n, "create_folder", json!({ "path": path })).await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let file = call(
            &mut ws,
            5,
            "create_file",
            json!({ "path": "Pasta-de-anexos/mapa.png", "base64": b64(b"png") }),
        )
        .await;
        assert_eq!(file["ok"], "Pasta-de-anexos/mapa.png", "{file}");
        // The folder named again: a folder is the path the write names.
        let renamed = call(
            &mut ws,
            6,
            "rename_entry",
            json!({ "from": "Pasta-de-anexos", "to": "Pasta-de-anexos-2" }),
        )
        .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        // And the whole folder walked again.
        call(&mut ws, 7, "reindex", json!({})).await;
        let state = call(&mut ws, 8, "sync_state", json!({})).await;
        let ours: Vec<&str> = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["path"].as_str())
            .filter(|p| p.starts_with("Pasta-de-anexos"))
            .collect();
        assert_eq!(ours, vec!["Pasta-de-anexos-2/mapa.png"], "{state}");
        let said = crate::log::said("Pasta-de-anexos");
        assert!(said.is_empty(), "{said:?}");
    });
}

/// The next `folder-changed` the window hears that `wanted` accepts; the
/// others (the watcher's own batches) are passed over.
async fn heard(ws: &mut Socket, wanted: impl Fn(&Value) -> bool) -> Value {
    loop {
        let payload = crate::tests::event_named(ws, "folder-changed").await;
        if wanted(&payload) {
            return payload;
        }
    }
}

/// A device's rename and deletion reach the windows open on the folder as
/// the watcher's change does on the desktop (ADR 0073 item 7, ADR 0079
/// items 7 and 13; found 2026-10-10, scenario C1): the tree is drawn again,
/// a tab of the renamed note follows it to its new name, and one of the
/// deleted note is told it is gone.
#[test]
fn a_devices_rename_and_deletion_reach_the_folders_windows() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut window = opened(&r, &admin).await;
        let mut device = opened(&r, &admin).await;
        let state = call(&mut device, 2, "sync_state", json!({})).await;
        let base = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == "Sessao.md")
            .map(|f| f["hash"].as_str().unwrap().to_owned())
            .unwrap();
        let renamed = call(
            &mut device,
            3,
            "sync_rename",
            json!({ "from": "Sessao.md", "to": "Compras.md", "base": base }),
        )
        .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        let told = heard(&mut window, |p| {
            p["moved"].as_array().is_some_and(|m| !m.is_empty())
        })
        .await;
        assert_eq!(
            told["moved"],
            json!([{ "from": "Sessao.md", "to": "Compras.md" }]),
            "{told}"
        );
        assert_eq!(told["removed"], json!(["Sessao.md"]), "{told}");
        assert_eq!(told["changed"], json!(["Compras.md"]), "{told}");
        assert_eq!(told["listing"], true, "{told}");
        assert!(told["key"].as_str().is_some_and(|k| !k.is_empty()));
        // What the tree draws, asked when told: the new name, not the old.
        let notes = call(&mut window, 4, "list_notes", json!({})).await;
        let listed = notes["ok"].to_string();
        assert!(listed.contains("Compras.md"), "{notes}");
        assert!(!listed.contains("Sessao.md"), "{notes}");
        // Deleted on the device: the window hears it gone.
        let gone = call(
            &mut device,
            5,
            "sync_delete",
            json!({ "path": "Compras.md", "base": base }),
        )
        .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let told = heard(&mut window, |p| {
            p["removed"]
                .as_array()
                .is_some_and(|m| m.iter().any(|x| x == "Compras.md"))
        })
        .await;
        assert_eq!(told["moved"], json!([]), "{told}");
        let notes = call(&mut window, 6, "list_notes", json!({})).await;
        assert!(!notes["ok"].to_string().contains("Compras.md"), "{notes}");
    });
}

/// Two devices of one account told apart (the live campaign, R5,
/// 2026-10-10): a device's change keeps the device's name in the folder's
/// log, read back on the console's folder page, and a refusal of its
/// change names it in the server's log.
#[test]
fn a_devices_change_and_its_refusal_name_the_device() {
    const COMPOSED: &str = "Caf\u{e9} do Ubuntu.md";
    const DECOMPOSED: &str = "Cafe\u{301} do Ubuntu.md";
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let account = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap();
        let (token, _) = r
            .server
            .db
            .create_session(&account.id, "device", "verso-ubuntu", "127.0.0.1")
            .unwrap();
        let mut ws = connect(&r, None, None, Some(&token)).await.unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        call(&mut ws, 2, "sync_state", json!({})).await;
        let sent = send(&mut ws, 10, COMPOSED, b"# ubuntu\n", None).await;
        assert_eq!(sent["ok"]["done"], true, "{sent}");
        // A new file under the other form of that name: refused, and said.
        let twin = send(&mut ws, 20, DECOMPOSED, b"# outro\n", None).await;
        assert_eq!(twin["err"]["kind"], "exists", "{twin}");
        let said = crate::log::said("do Ubuntu.md");
        assert!(
            said.iter()
                .any(|l| l.contains("by admin@casa.lan (verso-ubuntu) refused")),
            "{said:?}"
        );
        // The console's folder page: who made the change, and on which device.
        let (_, folder) = get(&r, &format!("/api/admin/folders/{id}"), Some(&admin)).await;
        let change = folder["changes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["path"] == COMPOSED)
            .cloned()
            .unwrap_or_else(|| panic!("{folder}"));
        assert_eq!(change["who"], "admin@casa.lan", "{change}");
        assert_eq!(change["device"], "verso-ubuntu", "{change}");
        // A change made in a browser names the account, and no device.
        let mut browser = opened(&r, &admin).await;
        let made = call(
            &mut browser,
            30,
            "create_note",
            json!({ "name": "Do navegador", "text": "# n\n" }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
        let (_, folder) = get(&r, &format!("/api/admin/folders/{id}"), Some(&admin)).await;
        let change = folder["changes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["path"] == "Do navegador.md")
            .cloned()
            .unwrap_or_else(|| panic!("{folder}"));
        assert_eq!(change["who"], "admin@casa.lan", "{change}");
        assert_eq!(change["device"], Value::Null, "{change}");
    });
}

/// A device's session ended by its person (the live campaign, R2,
/// 2026-10-10: the device learned it only at its next exchange, minutes
/// later): its open connection is told and closed at once; another
/// session's stays.
#[test]
fn an_ended_sessions_connection_is_closed_at_once() {
    use futures_util::StreamExt;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let account = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap();
        let device = |name: &str| {
            let (token, _) = r
                .server
                .db
                .create_session(&account.id, "device", name, "127.0.0.1")
                .unwrap();
            let id = r.server.db.session(&token).unwrap().unwrap().id;
            (token, id)
        };
        let (win, win_id) = device("VERSO-WIN");
        let (mac, _) = device("MacBook");
        let mut on_win = connect(&r, None, None, Some(&win)).await.unwrap();
        next(&mut on_win).await;
        let mut on_mac = connect(&r, None, None, Some(&mac)).await.unwrap();
        next(&mut on_mac).await;
        assert_eq!(
            remove(&r, &format!("/api/me/sessions/{win_id}"), &admin).await,
            200
        );
        // Told, then closed — with no question asked.
        let told = next(&mut on_win).await;
        assert_eq!(told["gone"], "session", "{told}");
        let closed = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                match on_win.next().await {
                    None | Some(Err(_)) => break,
                    Some(Ok(m)) if m.is_close() => break,
                    Some(Ok(_)) => {}
                }
            }
        })
        .await;
        assert!(closed.is_ok(), "the ended session's connection stayed open");
        // The other device's connection still answers.
        let answered = call(&mut on_mac, 1, "sync_state", json!({})).await;
        assert!(answered.get("id").is_some(), "{answered}");
        // "Sign out everywhere else": the rest go too.
        let others = reqwest::Client::new()
            .delete(r.url("/api/me/sessions/others"))
            .header("origin", r.origin())
            .header("cookie", &admin.cookie)
            .header("x-verso-csrf", &admin.csrf)
            .send()
            .await
            .unwrap();
        assert_eq!(others.status().as_u16(), 200);
        let told = next(&mut on_mac).await;
        assert_eq!(told["gone"], "session", "{told}");
    });
}
