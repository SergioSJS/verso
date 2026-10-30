// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The guardrail of ADR 0087 item 9, end to end: secret blocks never reach
//! an account that may only read the note. A reader's window calls every
//! command of the contract — each name the generated bindings know, and
//! the server's own — with arguments that reach the notes holding secret
//! blocks; no answer, no event and no piece of a file it receives holds a
//! word only a secret block holds. A command a reader is not refused must
//! be on the list that says how it answers a reader
//! (`verso_service::reader::READER_COMMANDS`, `crate::readers::SERVER_READS`):
//! a new read command fails here until it says so.
//!
//! Then the paths where a reader follows a note: a room (its own document,
//! the projection, who is present and not where, a roll), sync (the
//! bytes, the hashes, a change only inside a secret block that is none)
//! and a share.

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use crate::db::Role;
use crate::tests::{Socket, block_on, call, connect, folder_id, next, sign_in, start};

/// Words only the secret blocks of [`TAVERNA`] and [`PORTO`] hold.
pub(crate) const SECRET: &[&str] = &[
    "zqtitle", "zqhead", "zqbody", "zqlink", "zqtag", "zqtable", "zqid", "zqnested", "zqlazy",
    "zqitem", "zqdeep",
];

pub(crate) const TAVERNA: &str = "# Taverna\n\nO barão governa. [[Porto]] #publico\n\n> [!secret] zqtitle\n> # zqhead\n> zqbody [[zqlink]] [[Alvo]] ![[Alvo]] #zqtag `dice: 3d7`\n> | d6 | zqtable |\n> ^zqid\nzqlazy\n\n> [!note] Rumores\n> O barão não come.\n>\n> > [!SECRET]-\n> > zqnested [[Alvo#Fundo]]\n> >\n> > > [!tip] zqdeep\n>\n> Fim dos rumores. `dice: 1d20`\n\n- Mansão\n  > [!secret]\n  > zqitem\n\nFim. ^fim\n";

pub(crate) const PORTO: &str = "# Porto\n\nO barão desembarca.\n";

/// A text heard by a reader: the JSON and, for a piece of a file sent as
/// base64 or a room's update, its bytes decoded too.
pub(crate) fn heard(text: &str) -> String {
    let mut all = text.to_owned();
    if let Ok(v) = serde_json::from_str::<Value>(text) {
        let b64 = |s: &str| {
            base64::engine::general_purpose::STANDARD
                .decode(s)
                .ok()
                .map(|b| String::from_utf8_lossy(&b).into_owned())
        };
        for field in [
            &v["ok"]["data"],
            &v["ok"]["update"],
            &v["payload"]["update"],
        ] {
            if let Some(d) = field.as_str().and_then(b64) {
                all.push_str(&d);
            }
        }
    }
    all
}

fn clean(what: &str, text: &str) {
    let all = heard(text);
    for s in SECRET {
        assert!(!all.contains(s), "{what}: {s:?} reached a reader: {text}");
    }
}

/// Every message the socket hears until the answer to `id`, each checked.
pub(crate) async fn ask(ws: &mut Socket, id: u64, cmd: &str, args: Value) -> Value {
    ws.send(Message::Text(
        json!({ "id": id, "cmd": cmd, "args": args })
            .to_string()
            .into(),
    ))
    .await
    .unwrap();
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        let text = match m {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            _ => continue,
        };
        clean(&format!("{cmd} (or an event before its answer)"), &text);
        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if v.get("id").and_then(Value::as_u64) == Some(id) {
            return v;
        }
    }
}

/// What the reader hears for `ms` milliseconds, each checked; the events.
pub(crate) async fn listen(ws: &mut Socket, ms: u64) -> Vec<Value> {
    let mut out = Vec::new();
    let until = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
    while let Ok(Some(Ok(m))) = tokio::time::timeout_at(until, ws.next()).await {
        if let Message::Text(t) = m {
            clean("an event", &t);
            out.push(serde_json::from_str(&t).unwrap_or(Value::Null));
        }
    }
    out
}

/// Every command a window may send: the generated bindings', and the
/// server's own a window or a device sends that the bindings do not name.
pub(crate) fn every_command() -> Vec<String> {
    let bindings = include_str!("../../../app/ui/src/bindings.ts");
    // `__TAURI_INVOKE("name"` or `__TAURI_INVOKE<Type>("name"`.
    let mut names: Vec<String> = bindings
        .split("__TAURI_INVOKE")
        .skip(1)
        .filter_map(|rest| rest.split_once("(\"").map(|(_, name)| name))
        .filter_map(|rest| rest.split('"').next())
        .filter(|name| name.chars().all(|c| c.is_ascii_lowercase() || c == '_'))
        .map(str::to_owned)
        .collect();
    assert!(names.len() > 100, "the bindings' commands: {names:?}");
    for extra in [
        "open_server_folder",
        "sync_state",
        "sync_changes",
        "sync_read",
    ] {
        names.push(extra.to_owned());
    }
    names.sort();
    names.dedup();
    names
}

/// Arguments that reach the secret blocks for any command that reads a
/// note: unknown fields are ignored by each command.
pub(crate) fn reaching(id: &str) -> Value {
    json!({
        "id": id, "path": "Taverna.md", "words": "zqbody", "limit": 50, "since": 0, "offset": 0,
        "name": "Taverna", "text": "nada", "json": "{}", "notation": "3d7", "source": "Taverna.md",
        "target": "Alvo", "key": "nenhuma", "keep": "disk", "at": "", "update": "",
        "builtinIgnores": true, "gitignore": true, "level": "INFO", "message": "x", "revision": "x",
        "from": "Taverna.md", "to": "Outra.md", "paths": [], "folder": "", "base64": "",
        "enabled": false, "focuses": [], "stamp": null, "days": 30,
        "query": {
            "text": "views:\n  - type: table\n    name: T\n    order: [file.name, file.tags, file.links, file.size]\n",
            "extra": [], "now": 0, "offset": 0, "lang": "en"
        },
    })
}

pub(crate) async fn folder_with_a_reader() -> (crate::tests::Running, Socket, Socket, String) {
    let r = start().await;
    let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &admin).await;
    let le = r
        .server
        .db
        .create_account("le@casa.lan", "Le", "en", Some("senha muito longa"), false)
        .unwrap();
    r.server.db.grant(&id, &le.id, Role::Reader).unwrap();
    let mut owner = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut owner).await;
    assert!(
        call(&mut owner, 1, "open_server_folder", json!({ "id": id }))
            .await
            .get("ok")
            .is_some()
    );
    for (n, (name, text)) in [
        ("Taverna", TAVERNA),
        ("Porto", PORTO),
        ("Alvo", "# Alvo\n\n## Fundo\n"),
    ]
    .iter()
    .enumerate()
    {
        let made = call(
            &mut owner,
            2 + n as u64,
            "create_note",
            json!({ "name": name, "text": text }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
    }
    let le = sign_in(&r, "le@casa.lan", "senha muito longa").await;
    let mut reader = connect(&r, Some(&le.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut reader).await;
    let o = ask(&mut reader, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    (r, owner, reader, id)
}

#[test]
fn no_command_of_the_contract_hands_a_reader_a_secret_block() {
    block_on(async {
        let (_r, mut owner, mut reader, id) = folder_with_a_reader().await;
        // The owner sees the secret: the test's notes hold what it says.
        let whole = call(&mut owner, 9, "read_note", json!({ "path": "Taverna.md" })).await;
        assert!(whole["ok"]["text"].as_str().unwrap().contains("zqbody"));
        let mut n = 10;
        let listed = |cmd: &str| {
            verso_service::reader::READER_COMMANDS
                .iter()
                .any(|(c, _)| *c == cmd)
                || crate::readers::SERVER_READS.iter().any(|(c, _)| *c == cmd)
        };
        for cmd in every_command() {
            n += 1;
            let answer = ask(&mut reader, n, &cmd, reaching(&id)).await;
            if answer.get("ok").is_some() {
                assert!(
                    listed(&cmd),
                    "a reader may call {cmd}: say how it answers a reader (READER_COMMANDS or SERVER_READS, ADR 0087)"
                );
            }
        }
        // Each secret word searched for, alone; the excerpts of a word on
        // both sides.
        for word in SECRET.iter().chain(&["barão", "fim"]) {
            n += 1;
            let found = ask(
                &mut reader,
                n,
                "search",
                json!({ "words": word, "limit": 50 }),
            )
            .await;
            if SECRET.contains(word) {
                assert_eq!(found["ok"], json!([]), "{word}: {found}");
            }
        }
        // The note as a reader reads it: the projection; a heading or an
        // id inside a secret block is no target.
        n += 1;
        let note = ask(&mut reader, n, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(
            note["ok"]["text"],
            verso_core::secret::project(TAVERNA).as_ref()
        );
        n += 1;
        let alvo = ask(&mut reader, n, "backlinks", json!({ "path": "Alvo.md" })).await;
        assert_eq!(alvo["ok"], json!([]), "{alvo}");
        n += 1;
        let porto = ask(&mut reader, n, "backlinks", json!({ "path": "Porto.md" })).await;
        assert_eq!(porto["ok"].as_array().map(Vec::len), Some(1), "{porto}");
        // What the reader's device syncs: the projection's bytes and hash.
        n += 1;
        let state = ask(&mut reader, n, "sync_state", json!({})).await;
        let shown = verso_core::secret::project(TAVERNA).into_owned();
        let listed_hash = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == "Taverna.md")
            .map(|f| (f["hash"].clone(), f["size"].clone()))
            .unwrap();
        assert_eq!(listed_hash.0, crate::sync::sha256(shown.as_bytes()));
        assert_eq!(listed_hash.1, shown.len());
        n += 1;
        let piece = ask(
            &mut reader,
            n,
            "sync_read",
            json!({ "path": "Taverna.md", "offset": 0 }),
        )
        .await;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(piece["ok"]["data"].as_str().unwrap())
            .unwrap();
        assert_eq!(bytes, shown.as_bytes());
        assert_eq!(piece["ok"]["hash"], crate::sync::sha256(shown.as_bytes()));
        listen(&mut reader, 300).await;
    });
}

#[test]
fn a_change_only_inside_a_secret_block_is_none_for_a_reader() {
    block_on(async {
        let (_r, mut owner, mut reader, _id) = folder_with_a_reader().await;
        let before = ask(&mut reader, 2, "sync_changes", json!({ "since": 0 })).await;
        let head = before["ok"]["head"].as_i64().unwrap();
        let note = ask(&mut reader, 3, "read_note", json!({ "path": "Taverna.md" })).await;
        let w = call(&mut owner, 20, "read_note", json!({ "path": "Taverna.md" })).await;
        let changed = TAVERNA.replace("zqbody", "zqbody segue");
        let written = call(
            &mut owner,
            21,
            "write_note",
            json!({ "path": "Taverna.md", "text": changed, "revision": w["ok"]["revision"] }),
        )
        .await;
        assert!(written.get("ok").is_some(), "{written}");
        // Nothing heard of it; nothing new in the log; the same revision.
        let events = listen(&mut reader, 600).await;
        assert!(
            !events
                .iter()
                .any(|e| e["event"] == "sync-changed" || e["event"] == "folder-changed"),
            "{events:?}"
        );
        let after = ask(&mut reader, 4, "sync_changes", json!({ "since": head })).await;
        assert_eq!(after["ok"]["head"], head, "{after}");
        assert_eq!(after["ok"]["changes"], json!([]));
        let again = ask(&mut reader, 5, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(again["ok"]["revision"], note["ok"]["revision"]);
        // The owner's log has it.
        let mine = call(&mut owner, 22, "sync_changes", json!({ "since": 0 })).await;
        assert!(mine["ok"]["head"].as_i64().unwrap() > head);
        // A change a reader sees is one.
        let w = call(&mut owner, 23, "read_note", json!({ "path": "Taverna.md" })).await;
        let public = changed.replace("Fim.", "Fim, enfim.");
        call(
            &mut owner,
            24,
            "write_note",
            json!({ "path": "Taverna.md", "text": public, "revision": w["ok"]["revision"] }),
        )
        .await;
        let later = ask(&mut reader, 6, "sync_changes", json!({ "since": head })).await;
        assert_eq!(
            later["ok"]["changes"].as_array().map(Vec::len),
            Some(1),
            "{later}"
        );
    });
}

/// A window's document from a join's state, and the text it holds.
fn doc_of(joined: &Value) -> (yrs::Doc, String) {
    use yrs::updates::decoder::Decode;
    use yrs::{GetString, Transact};
    let doc = yrs::Doc::with_options(yrs::Options {
        offset_kind: yrs::OffsetKind::Utf16,
        ..Default::default()
    });
    let state = base64::engine::general_purpose::STANDARD
        .decode(joined["update"].as_str().unwrap())
        .unwrap();
    doc.transact_mut()
        .apply_update(yrs::Update::decode_v1(&state).unwrap())
        .unwrap();
    let text = doc
        .get_or_insert_text(crate::collab::TEXT)
        .get_string(&doc.transact());
    (doc, text)
}

/// `doc` with `what` typed at its end: the update, base64.
fn typed(doc: &yrs::Doc, what: &str) -> String {
    use yrs::{GetString, Text, Transact};
    let text = doc.get_or_insert_text(crate::collab::TEXT);
    let mut txn = doc.transact_mut();
    let len = text.get_string(&txn).encode_utf16().count() as u32;
    text.insert(&mut txn, len, what);
    base64::engine::general_purpose::STANDARD.encode(txn.encode_update_v1())
}

fn apply(doc: &yrs::Doc, update: &str) -> String {
    use yrs::updates::decoder::Decode;
    use yrs::{GetString, Transact};
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(update)
        .unwrap();
    doc.transact_mut()
        .apply_update(yrs::Update::decode_v1(&bytes).unwrap())
        .unwrap();
    doc.get_or_insert_text(crate::collab::TEXT)
        .get_string(&doc.transact())
}

#[test]
fn a_reader_in_a_live_note_follows_its_projection_and_who_is_there() {
    block_on(async {
        let (_r, mut owner, mut reader, _id) = folder_with_a_reader().await;
        let mine = call(
            &mut owner,
            30,
            "collab_join",
            json!({ "path": "Taverna.md" }),
        )
        .await;
        let (owner_doc, _) = doc_of(&mine["ok"]);
        let theirs = ask(
            &mut reader,
            2,
            "collab_join",
            json!({ "path": "Taverna.md" }),
        )
        .await;
        // A reader is told so: it follows the room, it does not type.
        assert_eq!(theirs["ok"]["read_only"], true, "{theirs}");
        assert_ne!(
            theirs["ok"]["epoch"], mine["ok"]["epoch"],
            "a reader joined the note's own document"
        );
        let (reader_doc, text) = doc_of(&theirs["ok"]);
        assert_eq!(text, verso_core::secret::project(TAVERNA));
        // The owner types inside a secret block, then in the open.
        let secret_edit = typed(&owner_doc, "\n> [!secret]\n> zqbody de novo\n");
        call(
            &mut owner,
            31,
            "collab_update",
            json!({ "path": "Taverna.md", "update": secret_edit }),
        )
        .await;
        let open_edit = typed(&owner_doc, "\nÀ vista de todos.\n");
        call(
            &mut owner,
            32,
            "collab_update",
            json!({ "path": "Taverna.md", "update": open_edit }),
        )
        .await;
        // Its presence, with a cursor.
        let awareness = presence_with_cursor();
        call(
            &mut owner,
            33,
            "collab_awareness",
            json!({ "path": "Taverna.md", "update": awareness }),
        )
        .await;
        // The reader hears the projection once the room writes, and the
        // owner's name, never a cursor.
        let mut shown = text.clone();
        let mut named = false;
        for e in listen(&mut reader, 2500).await {
            if e["event"] == "collab-update" {
                shown = apply(&reader_doc, e["payload"]["update"].as_str().unwrap());
            }
            if e["event"] == "collab-awareness" {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(e["payload"]["update"].as_str().unwrap())
                    .unwrap();
                let seen = String::from_utf8_lossy(&bytes).into_owned();
                assert!(seen.contains("Admin") && !seen.contains("cursor"), "{seen}");
                named = true;
            }
        }
        assert!(named, "the reader was not told who is in the note");
        assert!(shown.contains("À vista de todos."), "{shown}");
        let on_disk = call(&mut owner, 34, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(
            shown,
            verso_core::secret::project(on_disk["ok"]["text"].as_str().unwrap())
        );
        // A roll of dice written only in a secret block is the block's; one
        // written in the open is told.
        call(
            &mut owner,
            35,
            "collab_roll",
            json!({ "path": "Taverna.md", "notation": "3d7", "source": null }),
        )
        .await;
        call(
            &mut owner,
            36,
            "collab_roll",
            json!({ "path": "Taverna.md", "notation": "1d20", "source": null }),
        )
        .await;
        let rolls: Vec<String> = listen(&mut reader, 600)
            .await
            .into_iter()
            .filter(|e| e["event"] == "collab-roll")
            .map(|e| {
                e["payload"]["roll"]["notation"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned()
            })
            .collect();
        assert_eq!(rolls, ["1d20"]);
    });
}

/// A presence of the owner's window with a cursor in it, base64.
fn presence_with_cursor() -> String {
    let state =
        r##"{"user":{"name":"x","color":"#2e7d32"},"cursor":{"anchor":{"zq":1},"head":{"zq":2}}}"##;
    let mut out = vec![1u8, 42, 1];
    out.push(u8::try_from(state.len()).unwrap());
    out.extend_from_slice(state.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(out)
}

#[test]
fn a_reader_in_a_note_that_turns_secret_leaves_its_document_first() {
    block_on(async {
        let (_r, mut owner, mut reader, _id) = folder_with_a_reader().await;
        // Porto holds no secret: the reader is in the room's own document.
        let mine = call(&mut owner, 40, "collab_join", json!({ "path": "Porto.md" })).await;
        let (owner_doc, _) = doc_of(&mine["ok"]);
        let theirs = ask(&mut reader, 2, "collab_join", json!({ "path": "Porto.md" })).await;
        assert_eq!(theirs["ok"]["epoch"], mine["ok"]["epoch"]);
        // The owner pastes a secret block whole: the reader is told the room
        // closed, and never hears the edit (`listen` checks every word).
        let pasted = typed(&owner_doc, "\n> [!secret] zqtitle\n> zqbody\n");
        call(
            &mut owner,
            41,
            "collab_update",
            json!({ "path": "Porto.md", "update": pasted }),
        )
        .await;
        let events = listen(&mut reader, 1500).await;
        assert!(
            events.iter().any(|e| e["event"] == "collab-closed"),
            "{events:?}"
        );
        // It joins again: the projection's document.
        let again = ask(&mut reader, 3, "collab_join", json!({ "path": "Porto.md" })).await;
        assert_ne!(again["ok"]["epoch"], mine["ok"]["epoch"]);
        let (_, text) = doc_of(&again["ok"]);
        assert!(!text.contains("zq"), "{text}");
        listen(&mut reader, 1500).await;
    });
}

#[test]
fn a_reader_through_a_share_reads_the_projection_too() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let mut owner = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut owner).await;
        call(&mut owner, 1, "open_server_folder", json!({ "id": id })).await;
        let made = call(
            &mut owner,
            2,
            "create_note",
            json!({ "name": "Mesa/Taverna", "text": TAVERNA }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
        r.server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        let (status, shared) = crate::tests::put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{shared}");
        let share = shared["id"].as_str().unwrap().to_owned();
        let ana = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let mut reader = connect(&r, Some(&ana.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut reader).await;
        let o = ask(&mut reader, 1, "open_server_folder", json!({ "id": share })).await;
        assert!(o.get("ok").is_some(), "{o}");
        let mut n = 10;
        for cmd in every_command() {
            n += 1;
            ask(&mut reader, n, &cmd, reaching(&share)).await;
        }
        for word in SECRET {
            n += 1;
            let found = ask(
                &mut reader,
                n,
                "search",
                json!({ "words": word, "limit": 50 }),
            )
            .await;
            assert_eq!(found["ok"], json!([]), "{word}: {found}");
        }
        n += 1;
        let note = ask(&mut reader, n, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(
            note["ok"]["text"],
            verso_core::secret::project(TAVERNA).as_ref(),
            "{note}"
        );
        n += 1;
        let state = ask(&mut reader, n, "sync_state", json!({})).await;
        assert!(state.get("ok").is_some(), "{state}");
        n += 1;
        let changes = ask(&mut reader, n, "sync_changes", json!({ "since": 0 })).await;
        assert!(changes.get("ok").is_some(), "{changes}");
        n += 1;
        let piece = ask(
            &mut reader,
            n,
            "sync_read",
            json!({ "path": "Taverna.md", "offset": 0 }),
        )
        .await;
        assert!(piece.get("ok").is_some(), "{piece}");
        listen(&mut reader, 300).await;
    });
}

#[test]
fn a_writer_made_a_reader_leaves_the_rooms_it_wrote_in() {
    block_on(async {
        let (r, mut owner, _reader, id) = folder_with_a_reader().await;
        let ed = r
            .server
            .db
            .create_account("ed@casa.lan", "Ed", "en", Some("senha muito longa"), false)
            .unwrap();
        r.server.db.grant(&id, &ed.id, Role::Editor).unwrap();
        let b = sign_in(&r, "ed@casa.lan", "senha muito longa").await;
        let mut editor = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut editor).await;
        call(&mut editor, 1, "open_server_folder", json!({ "id": id })).await;
        let mine = call(
            &mut owner,
            50,
            "collab_join",
            json!({ "path": "Taverna.md" }),
        )
        .await;
        let (owner_doc, _) = doc_of(&mine["ok"]);
        // The editor is in the note's own document: it may write.
        let joined = call(
            &mut editor,
            2,
            "collab_join",
            json!({ "path": "Taverna.md" }),
        )
        .await;
        assert_eq!(joined["ok"]["epoch"], mine["ok"]["epoch"]);
        // Made a reader: told the room closed, and nothing typed after
        // reaches it (`listen` checks every word).
        r.server.db.grant(&id, &ed.id, Role::Reader).unwrap();
        r.server
            .role_changed(&id, &ed.id, Some(Role::Reader), "changed");
        let events = listen(&mut editor, 800).await;
        assert!(
            events.iter().any(|e| e["event"] == "collab-closed"),
            "{events:?}"
        );
        let secret_edit = typed(&owner_doc, "\n> [!secret]\n> zqbody outra vez\n");
        call(
            &mut owner,
            51,
            "collab_update",
            json!({ "path": "Taverna.md", "update": secret_edit }),
        )
        .await;
        listen(&mut editor, 1500).await;
        // Joining again, it is a reader: the projection's document.
        let again = ask(
            &mut editor,
            3,
            "collab_join",
            json!({ "path": "Taverna.md" }),
        )
        .await;
        assert_ne!(again["ok"]["epoch"], mine["ok"]["epoch"]);
    });
}
