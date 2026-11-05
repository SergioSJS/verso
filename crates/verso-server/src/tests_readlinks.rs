// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Read links (ADR 0105), against a running server: the switch, the token
//! kept as a hash, what a visitor with no account is served and refused,
//! the confinement of a folder link and of a note link, the passphrase as a
//! refused sign-in, the end of a link — revoked, expired, turned off — with
//! its pages open, and the paces. Tried the way someone holding only the
//! address would try it.

use reqwest::Method;
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::db::Role;
use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, folder_id, next, post, sign_in, start,
};
use crate::tests_secret::{PORTO, SECRET, TAVERNA, ask, every_command, listen, reaching};

/// The owner's window on the folder, and the notes the tests read.
async fn furnish(r: &Running, admin: &Browser) -> (String, Socket) {
    let id = folder_id(r, admin).await;
    let mut owner = connect(r, Some(&admin.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut owner).await;
    let opened = call(&mut owner, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(opened.get("ok").is_some(), "{opened}");
    let mut n = 1;
    for (name, text) in [
        ("Taverna", TAVERNA),
        ("Porto", PORTO),
        ("Alvo", "# Alvo\n\n## Fundo\n"),
        (
            "Mesa/Notas",
            "# Notas\n\nVer [[Longe]] e [[Outra]].\n\n> [!secret] zqtitle\n> zqbody\n\nvisivelpalavra\n\n![[p.png]]\n\n![[Outra]]\n",
        ),
        ("Mesa/Outra", "Outra visivelpalavra ![[q.png]]\n"),
        ("Mesa/Sub/Funda", "Funda visivelpalavra\n"),
        ("Longe", "# Longe\n\nforadamesa visivelpalavra [[Notas]]\n"),
        ("Mesa2/Fora", "Fora visivelpalavra\n"),
    ] {
        n += 1;
        let made = call(
            &mut owner,
            n,
            "create_note",
            json!({ "name": name, "text": text }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
    }
    for path in ["Mesa/p.png", "Anexos/q.png", "Anexos/solto.png"] {
        n += 1;
        let made = call(
            &mut owner,
            n,
            "create_file",
            json!({ "path": path, "base64": "iVBORw0KGgo=" }),
        )
        .await;
        assert_eq!(made["ok"], path, "{made}");
    }
    (id, owner)
}

async fn admin(r: &Running) -> Browser {
    sign_in(r, "admin@casa.lan", "senha muito longa").await
}

async fn send(
    r: &Running,
    method: Method,
    path: &str,
    body: Option<Value>,
    b: &Browser,
) -> (u16, Value) {
    let mut req = reqwest::Client::new()
        .request(method, r.url(path))
        .header("origin", r.origin())
        .header("cookie", &b.cookie)
        .header("x-verso-csrf", &b.csrf);
    if let Some(body) = body {
        req = req.json(&body);
    }
    let res = req.send().await.unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

/// Turn the feature on, as the administrator does in the console.
async fn on(r: &Running, admin: &Browser) {
    let (status, said) = send(
        r,
        Method::PUT,
        "/api/admin/read-links",
        Some(json!({ "enabled": true })),
        admin,
    )
    .await;
    assert_eq!(status, 200, "{said}");
}

/// A link made by the owner of `id`.
async fn made(r: &Running, b: &Browser, id: &str, body: Value) -> Value {
    let (status, said) = post(r, &format!("/api/folders/{id}/readlinks"), body, Some(b)).await;
    assert_eq!(status, 200, "{said}");
    said
}

fn token_of(made: &Value) -> String {
    made["token"].as_str().unwrap().to_owned()
}

async fn visit(r: &Running, token: &str, cookie: Option<&str>) -> Result<Socket, u16> {
    let mut req = format!("ws://localhost:{}/r/{token}/ws", r.addr().port())
        .into_client_request()
        .unwrap();
    req.headers_mut()
        .insert("origin", r.origin().parse().unwrap());
    if let Some(c) = cookie {
        req.headers_mut().insert("cookie", c.parse().unwrap());
    }
    match tokio_tungstenite::connect_async(req).await {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
        Err(e) => panic!("{e}"),
    }
}

/// A visitor's window, the link's folder opened.
async fn reader(r: &Running, token: &str) -> (Socket, Value) {
    let mut ws = visit(r, token, None).await.unwrap();
    let hello = next(&mut ws).await;
    assert_eq!(hello["hello"]["link"], true, "{hello}");
    assert_eq!(hello["hello"]["account"], Value::Null);
    let info = ask(&mut ws, 1, "open_server_folder", json!({ "id": "any" })).await;
    assert!(info.get("ok").is_some(), "{info}");
    (ws, info)
}

async fn get_at(r: &Running, path: &str) -> (u16, String) {
    let res = reqwest::Client::new()
        .get(r.url(path))
        .send()
        .await
        .unwrap();
    (res.status().as_u16(), res.text().await.unwrap_or_default())
}

fn paths(v: &Value) -> Vec<String> {
    let mut out: Vec<String> = v
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p.as_str().unwrap().to_owned())
        .collect();
    out.sort();
    out
}

/// The feature starts off (ADR 0105 item 3): the owner is told to ask the
/// administrator, and once it is on, off ends the pages that are open.
#[test]
fn the_switch_starts_off_and_off_ends_open_pages() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        let body = json!({ "kind": "folder", "path": "Mesa" });
        let (status, refused) = post(
            &r,
            &format!("/api/folders/{id}/readlinks"),
            body.clone(),
            Some(&admin),
        )
        .await;
        assert_eq!(
            (status, &refused["error"]),
            (403, &json!("read_links_off")),
            "{refused}"
        );
        let (_, listed) =
            crate::tests::get(&r, &format!("/api/folders/{id}/readlinks"), Some(&admin)).await;
        assert_eq!(listed["enabled"], false);
        on(&r, &admin).await;
        let link = made(&r, &admin, &id, body).await;
        let token = token_of(&link);
        let (status, state) = get_at(&r, &format!("/r/{token}/state")).await;
        assert_eq!(status, 200);
        let gate: Value = serde_json::from_str(&state).unwrap();
        assert_eq!(gate["local"], false, "a UniVerso's link: {state}");
        let (mut ws, _) = reader(&r, &token).await;
        // Off: the open page is told and closed at once; the address
        // answers 404 as if it had never been.
        let (status, said) = send(
            &r,
            Method::PUT,
            "/api/admin/read-links",
            Some(json!({ "enabled": false })),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{said}");
        let gone = next(&mut ws).await;
        assert_eq!(gone["gone"], "link", "{gone}");
        assert_eq!(get_at(&r, &format!("/r/{token}/state")).await.0, 404);
        assert_eq!(visit(&r, &token, None).await.err(), Some(404));
        // On again: the link, kept, opens again.
        on(&r, &admin).await;
        assert_eq!(get_at(&r, &format!("/r/{token}/state")).await.0, 200);
    });
}

/// Only the folder's owner makes a link; making one, or turning the
/// feature on, wants a fresh proof (ADR 0083 item 6); who made it is kept.
#[test]
fn only_the_owner_makes_a_link_and_it_is_proved_and_recorded() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let ana = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &ana.id, Role::Editor).unwrap();
        let ana_b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let body = json!({ "kind": "folder", "path": "Mesa" });
        let (status, said) = post(
            &r,
            &format!("/api/folders/{id}/readlinks"),
            body.clone(),
            Some(&ana_b),
        )
        .await;
        assert_eq!(status, 403, "an editor does not make one: {said}");
        // The owner, with a stale proof: prove first.
        let me = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap()
            .id;
        crate::tests_prove::stale(&r, &me);
        let gated = post(
            &r,
            &format!("/api/folders/{id}/readlinks"),
            body.clone(),
            Some(&admin),
        )
        .await;
        assert_eq!(gated, crate::tests_prove::prove_first());
        let (status, said) = send(
            &r,
            Method::PUT,
            "/api/admin/read-links",
            Some(json!({ "enabled": false })),
            &admin,
        )
        .await;
        assert_eq!((status, said), crate::tests_prove::prove_first());
        crate::tests_prove::prove(&r, &admin, "senha muito longa").await;
        let link = made(&r, &admin, &id, body).await;
        // The panel lists it, with who made it, and never the address.
        let (_, listed) =
            crate::tests::get(&r, &format!("/api/folders/{id}/readlinks"), Some(&admin)).await;
        assert_eq!(listed["links"][0]["madeBy"], "Admin", "{listed}");
        assert_eq!(listed["links"][0]["kind"], "folder");
        assert!(!listed.to_string().contains(&token_of(&link)), "{listed}");
        // Someone who is not the owner lists nothing; nobody signed in, the
        // same.
        let (status, _) =
            crate::tests::get(&r, &format!("/api/folders/{id}/readlinks"), Some(&ana_b)).await;
        assert_eq!(status, 403);
        let (status, _) =
            crate::tests::get(&r, &format!("/api/folders/{id}/readlinks"), None).await;
        assert_eq!(status, 401);
    });
}

/// The token is 256 bits, in the address, and the database keeps its hash
/// alone (item 5).
#[test]
fn the_token_is_kept_as_a_hash_and_shown_once() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let link = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "folder", "path": "Mesa", "password": "abra cadabra" }),
        )
        .await;
        let token = token_of(&link);
        assert_eq!(link["path"], format!("/r/{token}"));
        // 256 bits as base64url without padding: 43 characters.
        assert_eq!(token.len(), 43, "{token}");
        let dump = r.server.db.read_links_dump().unwrap();
        assert!(
            !dump.contains(&token),
            "the token is in the database: {dump}"
        );
        assert!(
            !dump.contains("abra cadabra"),
            "the passphrase is in the database"
        );
        let hex: String = crate::crypto::hash(&token)
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect();
        assert!(dump.contains(&hex), "its hash is: {dump}");
        assert!(
            dump.contains("$argon2id$"),
            "the passphrase is an Argon2id hash"
        );
        // The address is the only way back to it.
        assert!(r.server.db.read_link_by_token(&token).unwrap().is_some());
        assert!(
            r.server
                .db
                .read_link_by_token("not-the-token")
                .unwrap()
                .is_none()
        );
    });
}

/// A visitor calls every command of the contract: the ones on the list
/// answer, from the notes' projections; the rest — writes, sync, rooms,
/// history, the bin — are refused before the core acts; and no answer, no
/// event holds a word only a secret block holds (the guardrail of ADR 0087
/// item 9, for a reader with no account).
#[test]
fn no_command_hands_a_visitor_a_secret_block_or_a_write() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let whole = made(&r, &admin, &id, json!({ "kind": "folder", "path": "" })).await;
        let (mut ws, _) = reader(&r, &token_of(&whole)).await;
        let seen = call(&mut owner, 90, "read_note", json!({ "path": "Taverna.md" })).await;
        assert!(seen["ok"]["text"].as_str().unwrap().contains("zqbody"));
        let mut n = 10;
        for cmd in every_command() {
            n += 1;
            let answer = ask(&mut ws, n, &cmd, reaching(&id)).await;
            if answer.get("ok").is_some() {
                assert!(
                    crate::visit::allowed(&cmd),
                    "a visitor may call {cmd}: it is not on the list of a read link (ADR 0105 item 4)"
                );
            } else {
                assert!(answer.get("err").is_some(), "{cmd}: {answer}");
            }
        }
        // Each is refused by name, with the link's words, not the core's.
        for cmd in [
            "write_note",
            "create_note",
            "delete_note",
            "rename_note",
            "write_text",
            "create_file",
            "sync_state",
            "sync_put",
            "collab_join",
            "collab_roll",
            "history_list",
            "trash_list",
            "trash_empty",
            "set_folder_settings",
        ] {
            n += 1;
            let answer = ask(&mut ws, n, cmd, reaching(&id)).await;
            assert_eq!(
                answer["err"]["message"], "not through a read link",
                "{cmd}: {answer}"
            );
        }
        for word in SECRET {
            n += 1;
            let found = ask(&mut ws, n, "search", json!({ "words": word, "limit": 50 })).await;
            assert_eq!(found["ok"], json!([]), "{word}: {found}");
        }
        n += 1;
        let note = ask(&mut ws, n, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(
            note["ok"]["text"],
            verso_core::secret::project(TAVERNA).as_ref()
        );
        n += 1;
        let backlinks = ask(&mut ws, n, "backlinks", json!({ "path": "Alvo.md" })).await;
        assert_eq!(backlinks["ok"], json!([]), "{backlinks}");
        n += 1;
        let caps = ask(&mut ws, n, "capabilities", json!({})).await;
        assert_eq!(caps["ok"]["can"], json!([]), "{caps}");
        // Nothing was written: the owner's note is as it was.
        let after = call(&mut owner, 91, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(after["ok"]["text"], seen["ok"]["text"]);
        listen(&mut ws, 300).await;
    });
}

/// A visitor's `reindex` walks nothing: it answers with the summary the
/// folder has, and no window of the owner is told of a run (review I1).
#[test]
fn a_visitors_reindex_walks_nothing() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let whole = made(&r, &admin, &id, json!({ "kind": "folder", "path": "" })).await;
        let (mut ws, _) = reader(&r, &token_of(&whole)).await;
        // What the owner's window heard until now is not the question.
        while !listen(&mut owner, 800).await.is_empty() {}
        let before = ask(&mut ws, 2, "current_folder", json!({})).await;
        let answer = ask(&mut ws, 3, "reindex", json!({})).await;
        assert!(answer.get("ok").is_some(), "{answer}");
        assert_eq!(
            answer["ok"]["indexed"], before["ok"]["index"]["indexed"],
            "{answer}"
        );
        let heard = listen(&mut owner, 500).await;
        assert!(
            !heard.iter().any(|e| e["event"] == "index-progress"),
            "a visitor made the owner's folder walk: {heard:?}"
        );
    });
}

/// A link to a folder reaches that folder and nothing above, beside or
/// outside it; search and backlinks cover only what was shared (item 4).
#[test]
fn a_folder_link_cannot_leave_its_folder() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let link = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let token = token_of(&link);
        let (mut ws, info) = reader(&r, &token).await;
        assert_eq!(info["ok"]["name"], "Mesa", "{info}");
        // Nothing of the server's disk, the owner or the folder's place
        // crosses (item 6): not in the folder's info, not in its summary.
        let folders_dir = r.server.config.folders_dir.display().to_string();
        let said = info.to_string();
        for leak in [folders_dir.as_str(), "admin@casa.lan", "Campanha", "Admin"] {
            assert!(!said.contains(leak), "{leak} crossed: {said}");
        }
        let listed = ask(&mut ws, 2, "list_notes", json!({})).await;
        assert_eq!(
            paths(&listed["ok"]),
            ["Notas.md", "Outra.md", "Sub/Funda.md"]
        );
        for (n, path) in [
            "../Longe.md",
            "Longe.md",
            "/etc/passwd",
            "Sub/../../Longe.md",
            "..",
            "./Notas.md",
            "Notas.md/../../Longe.md",
            "Mesa2/Fora.md",
            "../Mesa2/Fora.md",
            "C:\\Longe.md",
            ".verso/settings.json",
            ".trash/x.md",
        ]
        .into_iter()
        .enumerate()
        {
            let answer = ask(&mut ws, 10 + n as u64, "read_note", json!({ "path": path })).await;
            assert!(answer.get("err").is_some(), "{path}: {answer}");
            assert!(
                !answer.to_string().contains("foradamesa"),
                "{path}: {answer}"
            );
        }
        let found = ask(
            &mut ws,
            30,
            "search",
            json!({ "words": "visivelpalavra", "limit": 50 }),
        )
        .await;
        let hits: Vec<&str> = found["ok"]
            .as_array()
            .unwrap()
            .iter()
            .map(|h| h["path"].as_str().unwrap())
            .collect();
        assert!(!hits.is_empty(), "{found}");
        assert!(
            hits.iter()
                .all(|h| !h.contains("Longe") && !h.contains("Fora") && !h.contains("Mesa")),
            "{hits:?}"
        );
        let back = ask(&mut ws, 31, "backlinks", json!({ "path": "Notas.md" })).await;
        assert_eq!(
            back["ok"],
            json!([]),
            "Longe links to Notas, outside: {back}"
        );
        // The files: the link's own, by the link's own paths.
        assert_eq!(get_at(&r, &format!("/r/{token}/f/p.png")).await.0, 200);
        for path in [
            "..%2FAnexos%2Fq.png",
            "Anexos/q.png",
            "..%2FLonge.md",
            ".verso%2Fx",
        ] {
            assert_eq!(
                get_at(&r, &format!("/r/{token}/f/{path}")).await.0,
                404,
                "{path}"
            );
        }
        // A note is no file to be sent: its bytes hold the secrets.
        assert_eq!(get_at(&r, &format!("/r/{token}/f/Notas.md")).await.0, 403);
        // Only reading: any other method on a file is refused.
        let res = reqwest::Client::new()
            .post(r.url(&format!("/r/{token}/f/p.png")))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 405);
    });
}

/// A link to one note reaches the note and what it embeds — the notes and
/// the pictures, wherever they lie — and nothing else; a link out of what
/// was shared is plain text (item 2).
#[test]
fn a_note_link_reaches_the_note_and_what_it_embeds() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let link = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "Mesa/Notas.md" }),
        )
        .await;
        let token = token_of(&link);
        let (_, state) = crate::tests::get(&r, &format!("/r/{token}/state"), None).await;
        assert_eq!(state["open"], "Mesa/Notas.md", "{state}");
        let (mut ws, info) = reader(&r, &token).await;
        // Named for the note, never for the owner's folder, whose name was
        // not shared (item 6; review I2).
        assert_eq!(info["ok"]["name"], "Notas", "{info}");
        assert!(!info.to_string().contains("Campanha"), "{info}");
        let (_, state) = crate::tests::get(&r, &format!("/r/{token}/state"), None).await;
        assert!(!state.to_string().contains("Campanha"), "{state}");
        let listed = ask(&mut ws, 2, "list_notes", json!({})).await;
        assert_eq!(paths(&listed["ok"]), ["Mesa/Notas.md", "Mesa/Outra.md"]);
        let note = ask(&mut ws, 3, "read_note", json!({ "path": "Mesa/Notas.md" })).await;
        assert!(
            note["ok"]["text"]
                .as_str()
                .unwrap()
                .contains("visivelpalavra")
        );
        let embedded = ask(&mut ws, 4, "read_note", json!({ "path": "Mesa/Outra.md" })).await;
        assert!(embedded.get("ok").is_some(), "{embedded}");
        for (n, path) in [
            "Longe.md",
            "Mesa/Sub/Funda.md",
            "Taverna.md",
            "../Longe.md",
            "Mesa2/Fora.md",
        ]
        .into_iter()
        .enumerate()
        {
            let answer = ask(&mut ws, 10 + n as u64, "read_note", json!({ "path": path })).await;
            assert!(answer.get("err").is_some(), "{path}: {answer}");
        }
        // The link to a note that was not shared is told apart from none
        // only as "outside", and resolves to nothing.
        let links = ask(&mut ws, 30, "links", json!({ "path": "Mesa/Notas.md" })).await;
        let find = |target: &str| {
            links["ok"]
                .as_array()
                .unwrap()
                .iter()
                .find(|l| l["target"] == target)
                .cloned()
                .unwrap()
        };
        assert_eq!(find("Longe")["resolved"], Value::Null, "{links}");
        assert_eq!(find("Longe")["outside"], true, "{links}");
        assert_eq!(find("Outra")["resolved"], "Mesa/Outra.md");
        // Search and backlinks: the shared part only.
        let found = ask(
            &mut ws,
            31,
            "search",
            json!({ "words": "visivelpalavra", "limit": 50 }),
        )
        .await;
        let hits: Vec<&str> = found["ok"]
            .as_array()
            .unwrap()
            .iter()
            .map(|h| h["path"].as_str().unwrap())
            .collect();
        assert!(
            hits.iter()
                .all(|h| ["Mesa/Notas.md", "Mesa/Outra.md"].contains(h)),
            "{hits:?}"
        );
        let back = ask(&mut ws, 32, "backlinks", json!({ "path": "Mesa/Notas.md" })).await;
        assert_eq!(back["ok"], json!([]), "{back}");
        // The pictures it embeds, itself or through an embedded note.
        assert_eq!(get_at(&r, &format!("/r/{token}/f/Mesa/p.png")).await.0, 200);
        assert_eq!(
            get_at(&r, &format!("/r/{token}/f/Anexos/q.png")).await.0,
            200
        );
        for path in ["Anexos/solto.png", "Longe.md", "Mesa/Sub/Funda.md"] {
            assert_eq!(
                get_at(&r, &format!("/r/{token}/f/{path}")).await.0,
                404,
                "{path}"
            );
        }
        // A note is no file to be sent, though it is reached: its bytes
        // hold the secrets.
        for path in ["Mesa/Notas.md", "Mesa/Outra.md"] {
            assert_eq!(
                get_at(&r, &format!("/r/{token}/f/{path}")).await.0,
                403,
                "{path}"
            );
        }
        // The note changes: what it embeds now is reached, what it no
        // longer embeds is not.
        let was = call(
            &mut owner,
            70,
            "read_note",
            json!({ "path": "Mesa/Notas.md" }),
        )
        .await;
        let text = "# Notas\n\n![[solto.png]]\n";
        let wrote = call(
            &mut owner,
            71,
            "write_note",
            json!({ "path": "Mesa/Notas.md", "text": text, "revision": was["ok"]["revision"] }),
        )
        .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        assert_eq!(
            get_at(&r, &format!("/r/{token}/f/Anexos/solto.png"))
                .await
                .0,
            200
        );
        assert_eq!(get_at(&r, &format!("/r/{token}/f/Mesa/p.png")).await.0, 404);
    });
}

/// Revoking ends the link at once: a page that is open is told and
/// closed, the address answers 404, and the panel no longer lists it.
#[test]
fn revoking_closes_an_open_page_at_once() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let link = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let token = token_of(&link);
        let other = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let (mut ws, _) = reader(&r, &token).await;
        let (mut kept, _) = reader(&r, &token_of(&other)).await;
        let link_id = link["link"]["id"].as_str().unwrap();
        let (status, said) = send(
            &r,
            Method::DELETE,
            &format!("/api/folders/{id}/readlinks/{link_id}"),
            None,
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{said}");
        assert_eq!(said["closed"], 1, "{said}");
        let gone = next(&mut ws).await;
        assert_eq!(gone["gone"], "link", "{gone}");
        // Closed after it.
        let end = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            futures_util::StreamExt::next(&mut ws),
        )
        .await
        .expect("closed in time");
        assert!(
            matches!(end, None | Some(Ok(Message::Close(_)) | Err(_))),
            "{end:?}"
        );
        assert_eq!(get_at(&r, &format!("/r/{token}/state")).await.0, 404);
        assert_eq!(get_at(&r, &format!("/r/{token}/f/p.png")).await.0, 404);
        assert_eq!(visit(&r, &token, None).await.err(), Some(404));
        let (_, listed) =
            crate::tests::get(&r, &format!("/api/folders/{id}/readlinks"), Some(&admin)).await;
        assert_eq!(listed["links"].as_array().unwrap().len(), 1, "{listed}");
        // The other link of the folder is untouched.
        let still = ask(&mut kept, 5, "list_notes", json!({})).await;
        assert!(still.get("ok").is_some(), "{still}");
        let (status, _) = send(
            &r,
            Method::DELETE,
            &format!("/api/folders/{id}/readlinks/nolink"),
            None,
            &admin,
        )
        .await;
        assert_eq!(status, 404);
    });
}

/// An expired link opens nothing, and a page open when it expires is
/// closed when it does (item 5).
#[test]
fn an_expired_link_opens_nothing_and_closes_open_pages() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        // A date in the past, and expiries that are not an option, are
        // refused.
        for bad in [
            json!({ "expiresAt": 1 }),
            json!({ "expiresDays": 2 }),
            json!({ "expiresDays": 1, "expiresAt": 9_999_999_999_i64 }),
        ] {
            let mut body = json!({ "kind": "folder", "path": "Mesa" });
            body.as_object_mut()
                .unwrap()
                .extend(bad.as_object().unwrap().clone());
            let (status, _) = post(
                &r,
                &format!("/api/folders/{id}/readlinks"),
                body,
                Some(&admin),
            )
            .await;
            assert_eq!(status, 400);
        }
        // Far enough ahead for a slow machine to open the page first (2 s
        // expired before the connect on the Windows VM under load).
        let soon = crate::db::now() + 8;
        let link = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "folder", "path": "Mesa", "expiresAt": soon }),
        )
        .await;
        let token = token_of(&link);
        let (mut ws, _) = reader(&r, &token).await;
        let gone = next(&mut ws).await;
        assert_eq!(gone["gone"], "link", "closed when it expires: {gone}");
        assert_eq!(get_at(&r, &format!("/r/{token}/state")).await.0, 404);
        let (_, listed) =
            crate::tests::get(&r, &format!("/api/folders/{id}/readlinks"), Some(&admin)).await;
        assert_eq!(
            listed["links"],
            json!([]),
            "an expired link is not live: {listed}"
        );
        // The options: 1, 7 and 30 days.
        for days in [1, 7, 30] {
            let l = made(
                &r,
                &admin,
                &id,
                json!({ "kind": "folder", "path": "Mesa", "expiresDays": days }),
            )
            .await;
            let at = l["link"]["expires"].as_i64().unwrap();
            assert!((at - crate::db::now() - days * 86_400).abs() <= 5, "{l}");
        }
        // Changed under the page: the next command is refused, whatever
        // the page believes.
        let l = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let (mut open, _) = reader(&r, &token_of(&l)).await;
        r.server
            .db
            .set_read_link_expiry(l["link"]["id"].as_str().unwrap(), Some(1))
            .unwrap();
        let refused = ask(&mut open, 9, "list_notes", json!({})).await;
        assert_eq!(
            refused["err"]["message"], "this link no longer opens",
            "{refused}"
        );
    });
}

/// A passphrase: the page asks for it, a wrong one is a refused sign-in —
/// the log line the fail2ban filter reads, under the owner's account — and
/// the 20th in an hour is the one that tells the owner; the right one opens
/// the socket for that browser only (items 5 and 6).
#[test]
fn a_passphrase_is_a_sign_in_that_can_be_refused() {
    block_on(async {
        let r = start().await;
        let dono = r
            .server
            .db
            .create_account(
                "dono@f2b-link.example",
                "Dono",
                "pt",
                Some("senha do dono 1"),
                true,
            )
            .unwrap();
        let dono_b = sign_in(&r, "dono@f2b-link.example", "senha do dono 1").await;
        let (status, folder) = post(
            &r,
            "/api/folders",
            json!({ "name": "Cofre" }),
            Some(&dono_b),
        )
        .await;
        assert_eq!(status, 200, "{folder}");
        let id = folder["id"].as_str().unwrap().to_owned();
        on(&r, &dono_b).await;
        let link = made(
            &r,
            &dono_b,
            &id,
            json!({ "kind": "folder", "path": "", "password": "abra cadabra" }),
        )
        .await;
        let token = token_of(&link);
        let link_id = link["link"]["id"].as_str().unwrap().to_owned();
        let (_, state) = crate::tests::get(&r, &format!("/r/{token}/state"), None).await;
        assert_eq!(
            state,
            json!({ "kind": "folder", "password": true, "locked": true, "name": null, "open": null, "local": null })
        );
        assert_eq!(visit(&r, &token, None).await.err(), Some(401));
        assert_eq!(
            visit(&r, &token, Some("verso-link=nao-e-isto")).await.err(),
            Some(401)
        );
        let try_it = |password: &'static str| {
            let url = r.url(&format!("/r/{token}/unlock"));
            let origin = r.origin();
            async move {
                reqwest::Client::new()
                    .post(url)
                    .header("origin", origin)
                    .json(&json!({ "password": password }))
                    .send()
                    .await
                    .unwrap()
            }
        };
        let reset = || {
            r.server.limiter.succeeded("link-in:127.0.0.1");
            r.server.limiter.succeeded(&format!("link-in:{link_id}"));
        };
        // The first nineteen: lines for the host's tools, the owner not
        // yet told.
        for _ in 0..19 {
            reset();
            assert_eq!(try_it("errada errada").await.status().as_u16(), 401);
        }
        let told = || {
            r.server
                .db
                .last_action_of(&dono.id, crate::signin::NOTICED)
                .unwrap()
        };
        assert!(told().is_none());
        reset();
        assert_eq!(try_it("errada errada").await.status().as_u16(), 401);
        for _ in 0..50 {
            if told().is_some() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        assert!(
            told().is_some(),
            "the 20th refused passphrase tells the owner"
        );
        let lines = crate::log::said("for d***@f2b-link.example");
        assert_eq!(lines.len(), 20, "{lines:?}");
        let stamped: Vec<String> = lines
            .iter()
            .map(|l| format!("{} {l}", crate::log::stamp()))
            .collect();
        let hits: Vec<_> = crate::tests_bounds::banned(&stamped)
            .into_iter()
            .flatten()
            .flatten()
            .collect();
        assert_eq!(
            hits,
            vec!["127.0.0.1"; 40],
            "the shipped fail2ban filter catches each"
        );
        // The right one, for this browser only.
        reset();
        let right = try_it("abra cadabra").await;
        assert_eq!(right.status().as_u16(), 200);
        let cookie = right
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned();
        assert!(
            cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict"),
            "{cookie}"
        );
        assert!(cookie.contains(&format!("Path=/r/{token}")), "{cookie}");
        let secret = cookie.split(';').next().unwrap().to_owned();
        let mut ws = visit(&r, &token, Some(&secret)).await.unwrap();
        next(&mut ws).await;
        let info = ask(&mut ws, 1, "open_server_folder", json!({ "id": "x" })).await;
        assert_eq!(info["ok"]["name"], "Cofre", "{info}");
        // Not for another link: its secret is this link's.
        let again = made(
            &r,
            &dono_b,
            &id,
            json!({ "kind": "folder", "path": "", "password": "outra senha boa" }),
        )
        .await;
        assert_eq!(
            visit(&r, &token_of(&again), Some(&secret)).await.err(),
            Some(401)
        );
        // Ended with the link.
        let (status, _) = send(
            &r,
            Method::DELETE,
            &format!("/api/folders/{id}/readlinks/{link_id}"),
            None,
            &dono_b,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(visit(&r, &token, Some(&secret)).await.err(), Some(404));
    });
}

/// Past a burst, a link answers 429: by address, and by link across
/// addresses (item 6).
#[test]
fn past_a_burst_a_link_answers_429_by_address_and_by_link() {
    block_on(async {
        let r = crate::tests_bounds::behind_proxy().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let link = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let token = token_of(&link);
        r.server.pace.freeze();
        r.server.link_pace.freeze();
        let client = reqwest::Client::new();
        let from = |address: String| {
            let c = client.clone();
            let url = r.url(&format!("/r/{token}/state"));
            async move {
                c.get(url)
                    .header("x-forwarded-for", address)
                    .send()
                    .await
                    .unwrap()
                    .status()
                    .as_u16()
            }
        };
        for i in 1..=100 {
            assert_eq!(from("203.0.113.7".into()).await, 200, "request {i}");
        }
        assert_eq!(
            from("203.0.113.7".into()).await,
            429,
            "the 101st from one address"
        );
        // The link's own bucket was spent by those hundred: every other
        // address is refused too.
        let mut refused = 0;
        for i in 0..40 {
            if from(format!("198.51.100.{i}")).await == 429 {
                refused += 1;
            }
        }
        assert_eq!(refused, 40, "the link's burst is spent");
        // Another link is untouched.
        let other = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let status = client
            .get(r.url(&format!("/r/{}/state", token_of(&other))))
            .header("x-forwarded-for", "192.0.2.9")
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        assert_eq!(status, 200);
    });
}

/// A rename carries the link of what moved; a deletion ends it (as a
/// share's, ADR 0081 item 13).
#[test]
fn a_link_follows_a_rename_and_ends_with_a_deletion() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let link = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let token = token_of(&link);
        let (mut ws, _) = reader(&r, &token).await;
        let renamed = call(
            &mut owner,
            60,
            "rename_entry",
            json!({ "from": "Mesa", "to": "Salao" }),
        )
        .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        let (_, listed) =
            crate::tests::get(&r, &format!("/api/folders/{id}/readlinks"), Some(&admin)).await;
        assert_eq!(listed["links"][0]["path"], "Salao", "{listed}");
        assert_eq!(get_at(&r, &format!("/r/{token}/state")).await.0, 200);
        let deleted = call(&mut owner, 61, "delete_entry", json!({ "path": "Salao" })).await;
        assert!(deleted.get("ok").is_some(), "{deleted}");
        let gone = next(&mut ws).await;
        assert_eq!(gone["gone"], "link", "{gone}");
        assert_eq!(get_at(&r, &format!("/r/{token}/state")).await.0, 404);
    });
}

/// How many notes hold secrets, said before the link is made (item 7).
#[test]
fn the_owner_is_told_how_many_notes_hold_secrets_before_making_a_link() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, _owner) = furnish(&r, &admin).await;
        let count = |query: &'static str| {
            let (r, admin, id) = (&r, &admin, id.clone());
            async move {
                crate::tests::get(
                    r,
                    &format!("/api/folders/{id}/readlinks/secrets?{query}"),
                    Some(admin),
                )
                .await
            }
        };
        assert_eq!(count("kind=folder&path=").await.1, json!({ "notes": 2 }));
        assert_eq!(
            count("kind=folder&path=Mesa").await.1,
            json!({ "notes": 1 })
        );
        assert_eq!(
            count("kind=folder&path=Mesa2").await.1,
            json!({ "notes": 0 })
        );
        assert_eq!(
            count("kind=note&path=Mesa%2FNotas.md").await.1,
            json!({ "notes": 1 })
        );
        assert_eq!(
            count("kind=note&path=Mesa%2FOutra.md").await.1,
            json!({ "notes": 0 })
        );
        assert_eq!(count("kind=folder&path=Nada").await.0, 404);
        assert_eq!(count("kind=folder&path=..%2F..").await.0, 400);
        assert_eq!(count("kind=note&path=.verso%2Fx.md").await.0, 400);
    });
}

/// A hidden path — a part beginning with a dot, where the folder's own
/// settings and its bin live — is no link's, though the link is of the
/// whole folder; and a page of another site cannot open the socket.
#[test]
fn a_link_of_the_whole_folder_reaches_nothing_hidden_and_wants_this_servers_origin() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        // The core refuses to make a hidden file; one that is there all the
        // same (a tool of the host's) is put on the disk by hand.
        let dir = r.campanha().join(".guardado");
        crate::data::ensure_dir(&dir).unwrap();
        crate::data::write_for_tests(&dir.join("segredo.txt"), "segredo");
        let _ = &mut owner;
        let link = made(&r, &admin, &id, json!({ "kind": "folder", "path": "" })).await;
        let token = token_of(&link);
        let (mut ws, _) = reader(&r, &token).await;
        for (n, (cmd, path)) in [
            ("read_file_text", ".guardado/segredo.txt"),
            ("read_text", ".guardado/segredo.txt"),
            ("read_note", ".guardado/segredo.txt"),
            ("map_tile", ".guardado/segredo.txt"),
        ]
        .into_iter()
        .enumerate()
        {
            let answer = ask(&mut ws, 10 + n as u64, cmd, json!({ "path": path })).await;
            assert!(answer.get("err").is_some(), "{cmd}: {answer}");
            assert!(!answer.to_string().contains("segredo"), "{cmd}: {answer}");
        }
        let files = ask(&mut ws, 20, "list_files", json!({})).await;
        assert!(
            !files.to_string().contains(".guardado"),
            "a hidden file is not listed: {files}"
        );
        assert_eq!(
            get_at(&r, &format!("/r/{token}/f/.guardado/segredo.txt"))
                .await
                .0,
            404
        );
        // The whole folder is read, though: a note at its root.
        let note = ask(&mut ws, 21, "read_note", json!({ "path": "Longe.md" })).await;
        assert!(note.get("ok").is_some(), "{note}");
        // No Origin, or another site's: refused before the upgrade.
        for origin in [None, Some("https://outro.site")] {
            let mut req = format!("ws://localhost:{}/r/{token}/ws", r.addr().port())
                .into_client_request()
                .unwrap();
            if let Some(o) = origin {
                req.headers_mut().insert("origin", o.parse().unwrap());
            }
            let refused = match tokio_tungstenite::connect_async(req).await {
                Err(tokio_tungstenite::tungstenite::Error::Http(res)) => res.status().as_u16(),
                other => panic!("{origin:?}: {:?}", other.map(|_| ())),
            };
            assert_eq!(refused, 403, "{origin:?}");
        }
        // A cookie-less page cannot POST a passphrase from another site.
        let res = reqwest::Client::new()
            .post(r.url(&format!("/r/{token}/unlock")))
            .header("origin", "https://outro.site")
            .json(&json!({ "password": "x" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 403);
    });
}

/// The tree of a link's window is drawn from the folder's entries: a link
/// to one note lists that note and nothing else of the folder; a link to a
/// folder lists what is in it (the notes were on the disk when the folder
/// was opened).
#[test]
fn the_tree_of_a_links_window_lists_what_the_link_reaches() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let id = folder_id(&r, &admin).await;
        // A name with spaces, a digit and an accent, as the tutorial's.
        crate::data::write_for_tests(
            &r.campanha().join("25 - Dados e Tabelas Sorteadas.md"),
            "# Dados\n\nrola\n",
        );
        // The owner's window has the folder open, as it has when it makes a link.
        let mut owner = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut owner).await;
        call(&mut owner, 1, "open_server_folder", json!({ "id": id })).await;
        on(&r, &admin).await;
        let note = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "Sessao.md" }),
        )
        .await;
        let (mut ws, _) = reader(&r, &token_of(&note)).await;
        let entries = ask(&mut ws, 5, "list_entries", json!({})).await;
        let shown: Vec<&str> = entries["ok"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["path"].as_str().unwrap())
            .collect();
        assert_eq!(shown, ["Sessao.md"], "{entries}");
        let spaced = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "25 - Dados e Tabelas Sorteadas.md" }),
        )
        .await;
        let (mut ws2, _) = reader(&r, &token_of(&spaced)).await;
        let entries = ask(&mut ws2, 5, "list_entries", json!({})).await;
        assert_eq!(
            entries["ok"][0]["path"], "25 - Dados e Tabelas Sorteadas.md",
            "{entries}"
        );
        let folder = made(&r, &admin, &id, json!({ "kind": "folder", "path": "" })).await;
        let (mut all, _) = reader(&r, &token_of(&folder)).await;
        let entries = ask(&mut all, 5, "list_entries", json!({})).await;
        let mut shown: Vec<&str> = entries["ok"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["path"].as_str().unwrap())
            .collect();
        shown.sort_unstable();
        assert_eq!(
            shown,
            ["25 - Dados e Tabelas Sorteadas.md", "Sessao.md", "mapa.svg"],
            "{entries}"
        );
    });
}

/// A link is made for what is on the disk, whether or not a window has the
/// folder open (a program through the API, a window just closed).
#[test]
fn a_link_is_made_for_what_is_on_the_disk_with_no_window_open() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let id = folder_id(&r, &admin).await;
        on(&r, &admin).await;
        let at = format!("/api/folders/{id}/readlinks");
        let note = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(note["link"]["kind"], "note");
        for (body, want) in [
            (json!({ "kind": "note", "path": "Nada.md" }), 404),
            (json!({ "kind": "note", "path": "mapa.svg" }), 404),
            (json!({ "kind": "folder", "path": "Nada" }), 404),
            (json!({ "kind": "folder", "path": "../.." }), 400),
            (json!({ "kind": "note", "path": ".verso/x.md" }), 400),
            (json!({ "kind": "other", "path": "" }), 404),
        ] {
            let (status, said) = post(&r, &at, body.clone(), Some(&admin)).await;
            assert_eq!(status, want, "{body}: {said}");
        }
        let whole = made(&r, &admin, &id, json!({ "kind": "folder", "path": "" })).await;
        assert_eq!(whole["link"]["path"], "");
    });
}

/// The hash the server's log has of `path`, as a device's base.
async fn base_of(owner: &mut Socket, n: u64, path: &str) -> Value {
    let state = call(owner, n, "sync_state", json!({})).await;
    state["ok"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["path"] == path)
        .map(|f| f["hash"].clone())
        .unwrap_or_else(|| panic!("{path} in {state}"))
}

/// A page open on a link whose note or folder then moves is not served
/// what is made at the old place after it (the audit of 2026-11-05): the
/// link follows its target (`readlinks::after_write`), and the page's own
/// reach must too.
#[test]
fn an_open_links_page_is_not_served_what_is_made_where_its_target_was() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let note = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "Alvo.md" }),
        )
        .await;
        let (mut page, _) = reader(&r, &token_of(&note)).await;
        let folder = made(&r, &admin, &id, json!({ "kind": "folder", "path": "Mesa" })).await;
        let (mut shelf, _) = reader(&r, &token_of(&folder)).await;
        for (n, cmd, args) in [
            (
                60,
                "rename_entry",
                json!({ "from": "Alvo.md", "to": "Alvo antigo.md" }),
            ),
            (
                61,
                "create_note",
                json!({ "name": "Alvo", "text": "zqnova privada\n" }),
            ),
            (
                62,
                "rename_entry",
                json!({ "from": "Mesa", "to": "Mesa velha" }),
            ),
            (
                63,
                "create_note",
                json!({ "name": "Mesa/Nova", "text": "zqnova privada\n" }),
            ),
        ] {
            let done = call(&mut owner, n, cmd, args).await;
            assert!(done.get("ok").is_some(), "{cmd}: {done}");
        }
        let read = ask(&mut page, 2, "read_note", json!({ "path": "Alvo.md" })).await;
        assert!(!read.to_string().contains("zqnova"), "{read}");
        let listed = ask(&mut shelf, 2, "list_notes", json!({})).await;
        assert!(!listed.to_string().contains("Nova"), "{listed}");
        let read = ask(&mut shelf, 3, "read_note", json!({ "path": "Nova.md" })).await;
        assert!(!read.to_string().contains("zqnova"), "{read}");
    });
}

/// A device's rename carries the links of what it renamed, and a device's
/// deletion ends them, as a window's do (`readlinks::after_write`): a link left at
/// the old path would open whatever is made there next.
#[test]
fn a_devices_rename_or_deletion_takes_its_links_along() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let moved = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "Alvo.md" }),
        )
        .await;
        let gone = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "Porto.md" }),
        )
        .await;
        let base = base_of(&mut owner, 70, "Alvo.md").await;
        let done = call(
            &mut owner,
            71,
            "sync_rename",
            json!({ "from": "Alvo.md", "to": "Alvo antigo.md", "base": base }),
        )
        .await;
        assert!(done.get("ok").is_some(), "{done}");
        let base = base_of(&mut owner, 72, "Porto.md").await;
        let done = call(
            &mut owner,
            73,
            "sync_delete",
            json!({ "path": "Porto.md", "base": base }),
        )
        .await;
        assert!(done.get("ok").is_some(), "{done}");
        for (n, name) in [(74, "Alvo"), (75, "Porto")] {
            let made = call(
                &mut owner,
                n,
                "create_note",
                json!({ "name": name, "text": "zqnova privada\n" }),
            )
            .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let (_, state) =
            crate::tests::get(&r, &format!("/r/{}/state", token_of(&moved)), None).await;
        assert_eq!(state["open"], "Alvo antigo.md", "{state}");
        let (mut page, _) = reader(&r, &token_of(&moved)).await;
        let read = ask(
            &mut page,
            2,
            "read_note",
            json!({ "path": "Alvo antigo.md" }),
        )
        .await;
        assert!(read.get("ok").is_some(), "{read}");
        let read = ask(&mut page, 3, "read_note", json!({ "path": "Alvo.md" })).await;
        assert!(!read.to_string().contains("zqnova"), "{read}");
        assert!(visit(&r, &token_of(&gone), None).await.is_err());
    });
}

/// A window's deletion ends the links of what it deleted before anyone
/// reads the folder again: a note made at that name in the moment is not
/// opened by the old link.
#[test]
fn a_deletions_links_end_before_a_note_made_at_its_name_could_be_opened() {
    block_on(async {
        let r = start().await;
        let admin = admin(&r).await;
        let (id, mut owner) = furnish(&r, &admin).await;
        on(&r, &admin).await;
        let link = made(
            &r,
            &admin,
            &id,
            json!({ "kind": "note", "path": "Porto.md" }),
        )
        .await;
        let token = token_of(&link);
        let (heard, go) = crate::pause::hold("window-deleted", &id);
        let server = std::sync::Arc::clone(&r.server);
        let deleter = call(
            &mut owner,
            80,
            "delete_entry",
            json!({ "path": "Porto.md" }),
        );
        let visitor = async {
            crate::pause::arrived(heard).await;
            let key = verso_service::lock(&server.keys)
                .iter()
                .find(|(_, f)| **f == id)
                .map(|(k, _)| k.clone())
                .unwrap();
            let made = server.service.with_key(&key, |ws| {
                verso_service::ops::dispatch(
                    ws,
                    "create_note",
                    json!({ "name": "Porto", "text": "zqnova privada\n" }),
                )
                .unwrap()
            });
            assert!(made.is_ok(), "{made:?}");
            let opened = match visit(&r, &token, None).await {
                Ok(mut ws) => {
                    next(&mut ws).await;
                    let _ = ask(&mut ws, 1, "open_server_folder", json!({ "id": "any" })).await;
                    Some(ask(&mut ws, 2, "read_note", json!({ "path": "Porto.md" })).await)
                }
                Err(_) => None,
            };
            let _ = go.send(());
            opened
        };
        let (gone, opened) = tokio::join!(deleter, visitor);
        assert!(gone.get("ok").is_some(), "{gone}");
        if let Some(read) = opened {
            assert!(!read.to_string().contains("zqnova"), "{read}");
        }
    });
}
