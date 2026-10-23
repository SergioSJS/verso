// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table (ADR 0107): one channel per folder beside the notes' rooms.
//! A roll in a note's room reaches the room and the table, rolled once;
//! messages and images join it; the log is kept in the database, paged,
//! pinned and cleared by the rules of the roles; a secret roll is the
//! owners'; a look is checked against the closed form; a message is
//! bounded, paced, and refused unparsed when it is too long.

use base64::Engine;
use futures_util::SinkExt;
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use crate::db::{Role, TableRow};
use crate::tests::{
    Running, Socket, block_on, call, connect, event_named, folder_id, next, sign_in, start,
};

const NOTE: &str = "Sessao.md";

/// Three people at the folder: the admin (owner), Bia (editor), Ana
/// (reader), each in a window that has opened it. Not yet at the table.
struct Cast {
    folder: String,
    owner: Socket,
    editor: Socket,
    reader: Socket,
}

async fn open(r: &Running, email: &str, password: &str, folder: &str) -> Socket {
    let b = sign_in(r, email, password).await;
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": folder })).await;
    assert!(opened.get("ok").is_some(), "{opened}");
    ws
}

async fn cast(r: &Running) -> Cast {
    let admin = sign_in(r, "admin@casa.lan", "senha muito longa").await;
    let folder = folder_id(r, &admin).await;
    for (email, name, password, role) in [
        ("bia@casa.lan", "Bia", "a senha da bia", Role::Editor),
        ("ana@casa.lan", "Ana", "a senha da ana", Role::Reader),
    ] {
        let a = r
            .server
            .db
            .create_account(email, name, "pt", Some(password), false)
            .unwrap();
        r.server.db.grant(&folder, &a.id, role).unwrap();
    }
    Cast {
        owner: open(r, "admin@casa.lan", "senha muito longa", &folder).await,
        editor: open(r, "bia@casa.lan", "a senha da bia", &folder).await,
        reader: open(r, "ana@casa.lan", "a senha da ana", &folder).await,
        folder,
    }
}

/// `ws` joins the table: the answer.
async fn join(ws: &mut Socket) -> Value {
    let joined = call(
        ws,
        2,
        "table_join",
        json!({ "color": "#3b82f6", "styles": null }),
    )
    .await;
    assert!(joined.get("ok").is_some(), "{joined}");
    joined["ok"].clone()
}

async fn seated(r: &Running) -> Cast {
    let mut c = cast(r).await;
    for ws in [&mut c.owner, &mut c.editor, &mut c.reader] {
        join(ws).await;
    }
    c
}

fn look() -> Value {
    let one = json!({
        "body": "#8C1F2B", "number": "#f7e8e2", "outline": "#2b0a0e",
        "texture": "marble", "material": "plastic"
    });
    json!({ "1": one, "2": one, "3": one })
}

fn png() -> String {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend_from_slice(&[0, 0, 0, 13, b'I', b'H', b'D', b'R', 0, 0, 0, 1, 0, 0, 0, 1]);
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn err_of(answer: &Value) -> String {
    answer["err"]["message"].as_str().unwrap_or("").to_owned()
}

/// A roll in a note's room is relayed to the room as before and appended to
/// the folder's table, rolled once: the table's entry is the answer's roll,
/// and one entry is kept. An oracle draw goes the same way.
#[test]
fn a_roll_in_a_note_reaches_the_room_and_the_table_once() {
    block_on(async {
        let r = start().await;
        let mut c = seated(&r).await;
        // Bia and the owner are in the note's room; Ana is at the table only.
        for ws in [&mut c.owner, &mut c.editor] {
            let joined = call(ws, 3, "collab_join", json!({ "path": NOTE })).await;
            assert!(joined.get("ok").is_some(), "{joined}");
        }
        let answer = call(
            &mut c.editor,
            4,
            "collab_roll",
            json!({ "path": NOTE, "notation": "2d6+1", "source": null, "styles": look(), "secret": null }),
        )
        .await;
        let roll = answer["ok"].clone();
        assert_eq!(roll["by"], "Bia");
        // The room hears it, as before, in the roller's look.
        let heard = event_named(&mut c.owner, "collab-roll").await;
        assert_eq!(heard["roll"], roll);
        assert_eq!(
            heard["roll"]["styles"]["1"]["body"], "#8c1f2b",
            "lower case"
        );
        // The table too, to the owner (in the room), and to Ana (who is not).
        for ws in [&mut c.owner, &mut c.reader] {
            let entry = event_named(ws, "table-entry").await;
            assert_eq!(entry["kind"], "roll");
            assert_eq!(entry["by"], "Bia");
            assert_eq!(entry["path"], NOTE);
            assert_eq!(entry["roll"]["total"], roll["total"], "rolled once");
            assert_eq!(entry["roll"]["terms"], roll["terms"]);
            assert_eq!(entry["roll"]["styles"]["2"]["texture"], "marble");
        }
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 1);
        // An oracle draw: the room and the table.
        let drawn = call(
            &mut c.editor,
            5,
            "collab_oracle",
            json!({ "path": NOTE, "ask": { "kind": "table", "entries": ["um", "dois"] } }),
        )
        .await;
        let draw = drawn["ok"].clone();
        let heard = event_named(&mut c.owner, "collab-oracle").await;
        assert_eq!(heard["draw"], draw);
        let entry = event_named(&mut c.reader, "table-entry").await;
        assert_eq!(
            (entry["kind"].as_str(), entry["draw"].clone()),
            (Some("oracle"), draw)
        );
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 2);
    });
}

/// A roll made at the table, from no note, is the server's too; a reader
/// rolls and writes a message; the entries are kept for whoever comes.
#[test]
fn a_reader_rolls_and_writes_and_the_log_is_kept_and_paged() {
    block_on(async {
        let r = start().await;
        let mut c = seated(&r).await;
        let said = call(
            &mut c.reader,
            10,
            "table_say",
            json!({ "text": "  oi, mesa  " }),
        )
        .await;
        assert_eq!(said["ok"]["text"], "oi, mesa", "{said}");
        assert_eq!(said["ok"]["by"], "Ana");
        let rolled = call(
            &mut c.reader,
            11,
            "table_roll",
            json!({ "notation": "1d20", "source": null, "path": null, "secret": null, "styles": null }),
        )
        .await;
        assert_eq!(rolled["ok"]["kind"], "roll", "{rolled}");
        let heard = event_named(&mut c.owner, "table-entry").await;
        assert_eq!(heard["text"], "oi, mesa");
        let heard = event_named(&mut c.owner, "table-entry").await;
        assert_eq!(heard["roll"]["total"], rolled["ok"]["roll"]["total"]);
        // The clicked die's place (ADR 0107) rides on the roll, bounded.
        let placed = call(
            &mut c.reader,
            13,
            "table_roll",
            json!({ "notation": "1d20", "source": null, "path": "Sessao.md", "secret": null, "styles": null, "occurrence": 2 }),
        )
        .await;
        assert_eq!(placed["ok"]["roll"]["occurrence"], 2, "{placed}");
        let heard = event_named(&mut c.owner, "table-entry").await;
        assert_eq!(heard["roll"]["occurrence"], 2, "{heard}");
        let absurd = call(
            &mut c.reader,
            14,
            "table_roll",
            json!({ "notation": "1d20", "source": null, "path": "Sessao.md", "secret": null, "styles": null, "occurrence": 99999 }),
        )
        .await;
        assert!(absurd["ok"]["roll"]["occurrence"].is_null(), "{absurd}");
        event_named(&mut c.owner, "table-entry").await;
        // A hundred and thirty more, straight into the log.
        for i in 0..130 {
            let row = TableRow {
                id: 0,
                kind: "say".into(),
                account: "x".into(),
                by_name: "X".into(),
                at: "2026-10-21T10:00:00Z".into(),
                path: None,
                pinned: false,
                secret: false,
                readers_hidden: false,
                body: json!({ "text": format!("m{i}") }).to_string(),
            };
            r.server.db.table_add(&c.folder, &row).unwrap();
        }
        // The pinned one among the oldest comes with the join, too.
        let first = said["ok"]["id"].as_str().unwrap();
        let pin = call(
            &mut c.editor,
            12,
            "table_pin",
            json!({ "id": first, "pinned": true }),
        )
        .await;
        assert!(pin.get("ok").is_some(), "{pin}");
        let late = open(&r, "bia@casa.lan", "a senha da bia", &c.folder).await;
        let mut late = late;
        let joined = join(&mut late).await;
        let entries = joined["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 101, "the latest 100 and the pinned one");
        assert_eq!(entries[0]["text"], "oi, mesa");
        assert_eq!(entries[0]["pinned"], true);
        assert_eq!(entries[100]["text"], "m129");
        assert_eq!(joined["more"], true);
        assert_eq!(joined["role"], "editor");
        // The page before the oldest of the latest.
        let cursor = entries[1]["id"].as_str().unwrap();
        let page = call(
            &mut late,
            3,
            "table_history",
            json!({ "before": cursor, "limit": 5 }),
        )
        .await;
        let older = page["ok"]["entries"].as_array().unwrap();
        assert_eq!(older.len(), 5, "{page}");
        assert!(
            older.iter().all(
                |e| e["id"].as_str().unwrap().parse::<i64>().unwrap() < cursor.parse().unwrap()
            )
        );
        assert_eq!(page["ok"]["more"], true);
        let rest = call(
            &mut late,
            4,
            "table_history",
            json!({ "before": cursor, "limit": 200 }),
        )
        .await;
        assert_eq!(rest["ok"]["more"], false);
        // A page is at most 200, and the number is a number.
        let bad = call(
            &mut late,
            5,
            "table_history",
            json!({ "before": "x", "limit": null }),
        )
        .await;
        assert_eq!(bad["err"]["kind"], "refused", "{bad}");
    });
}

/// Pins are anyone's; a message or an image is deleted by its author or an
/// owner, a roll never; the table is cleared by an owner only, the pinned
/// kept unless he says otherwise.
#[test]
fn pin_delete_and_clear_follow_the_roles() {
    block_on(async {
        let r = start().await;
        let mut c = seated(&r).await;
        let bia =
            call(&mut c.editor, 10, "table_say", json!({ "text": "da Bia" })).await["ok"].clone();
        let ana =
            call(&mut c.reader, 11, "table_say", json!({ "text": "da Ana" })).await["ok"].clone();
        let roll = call(
            &mut c.editor,
            12,
            "table_roll",
            json!({ "notation": "d6", "source": null, "path": null, "secret": null, "styles": null }),
        )
        .await["ok"]
            .clone();
        let (bia_id, ana_id, roll_id) = (bia["id"].clone(), ana["id"].clone(), roll["id"].clone());
        // Anyone pins; the others hear it.
        let pin = call(
            &mut c.reader,
            13,
            "table_pin",
            json!({ "id": roll_id, "pinned": true }),
        )
        .await;
        assert!(pin.get("ok").is_some(), "{pin}");
        let heard = event_named(&mut c.owner, "table-pinned").await;
        assert_eq!(heard, json!({ "id": roll_id, "pinned": true }));
        // Not another's message, unless an owner; a roll, never.
        let no = call(&mut c.editor, 14, "table_delete", json!({ "id": ana_id })).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        let no = call(&mut c.reader, 15, "table_delete", json!({ "id": bia_id })).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        let no = call(&mut c.reader, 16, "table_delete", json!({ "id": roll_id })).await;
        assert!(err_of(&no).contains("owner deletes a roll"), "{no}");
        let no = call(&mut c.editor, 17, "table_delete", json!({ "id": roll_id })).await;
        assert!(err_of(&no).contains("owner deletes a roll"), "{no}");
        // Its author: their own.
        let own = call(&mut c.reader, 18, "table_delete", json!({ "id": ana_id })).await;
        assert!(own.get("ok").is_some(), "{own}");
        let heard = event_named(&mut c.owner, "table-removed").await;
        assert_eq!(heard["id"], ana_id);
        // An owner: anyone's.
        let any = call(&mut c.owner, 19, "table_delete", json!({ "id": bia_id })).await;
        assert!(any.get("ok").is_some(), "{any}");
        // An unknown entry.
        let gone = call(&mut c.owner, 20, "table_delete", json!({ "id": "999999" })).await;
        assert_eq!(gone["err"]["kind"], "not_found", "{gone}");
        // Clearing: owners only.
        for ws in [&mut c.editor, &mut c.reader] {
            let no = call(ws, 21, "table_clear", json!({ "keepPinned": true })).await;
            assert_eq!(no["err"]["kind"], "refused", "{no}");
        }
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 1);
        // The game master (an owner) deletes a roll; a player could not (ADR 0107, 2026-10-23).
        let roll2 = call(
            &mut c.editor,
            25,
            "table_roll",
            json!({ "notation": "d6", "source": null, "path": null, "secret": null, "styles": null }),
        )
        .await["ok"]
            .clone();
        let no = call(
            &mut c.editor,
            26,
            "table_delete",
            json!({ "id": roll2["id"] }),
        )
        .await;
        assert!(err_of(&no).contains("owner deletes a roll"), "{no}");
        let del = call(
            &mut c.owner,
            27,
            "table_delete",
            json!({ "id": roll2["id"] }),
        )
        .await;
        assert!(del.get("ok").is_some(), "{del}");
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 1);
        let say = call(&mut c.editor, 22, "table_say", json!({ "text": "outra" })).await;
        assert!(say.get("ok").is_some());
        let cleared = call(
            &mut c.owner,
            23,
            "table_clear",
            json!({ "keepPinned": true }),
        )
        .await;
        assert!(cleared.get("ok").is_some(), "{cleared}");
        assert_eq!(
            r.server.db.table_count(&c.folder).unwrap(),
            1,
            "the pinned roll stays"
        );
        let heard = event_named(&mut c.reader, "table-cleared").await;
        assert_eq!(heard, json!({ "keep_pinned": true }));
        call(
            &mut c.owner,
            24,
            "table_clear",
            json!({ "keepPinned": false }),
        )
        .await;
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 0);
    });
}

/// An image is a file of the folder, by the sender's action: an editor's
/// PNG lands in the attachments place and the entry names it; a reader
/// sends none (refused before it is parsed); an SVG, a name's lie and an
/// oversize image are refused, whatever they are called.
#[test]
fn an_image_is_a_file_of_the_folder_and_not_a_readers() {
    block_on(async {
        let r = start().await;
        let mut c = seated(&r).await;
        let sent = call(
            &mut c.editor,
            10,
            "table_send_image",
            json!({ "base64": png() }),
        )
        .await;
        assert_eq!(sent["ok"]["kind"], "image", "{sent}");
        let path = sent["ok"]["image"].as_str().unwrap().to_owned();
        assert!(
            path.starts_with("attachments/mesa-") && path.ends_with(".png"),
            "{path}"
        );
        let listed = call(&mut c.owner, 90, "list_files", json!({})).await;
        assert!(
            listed.to_string().contains(&path),
            "written into the folder: {listed}"
        );
        let heard = event_named(&mut c.reader, "table-entry").await;
        assert_eq!(heard["image"], path);
        // A reader writes no file.
        let no = call(
            &mut c.reader,
            11,
            "table_send_image",
            json!({ "base64": png() }),
        )
        .await;
        assert!(err_of(&no).contains("only read"), "{no}");
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 1);
        // By the bytes, never a name; never an SVG.
        let b64 = |b: &[u8]| base64::engine::general_purpose::STANDARD.encode(b);
        for bytes in [
            b"<svg xmlns='http://www.w3.org/2000/svg'/>".to_vec(),
            b"GIF90a nope".to_vec(),
            b"just text".to_vec(),
            Vec::new(),
        ] {
            let no = call(
                &mut c.editor,
                12,
                "table_send_image",
                json!({ "base64": b64(&bytes) }),
            )
            .await;
            assert!(err_of(&no).contains("PNG, JPEG, WebP or GIF"), "{no}");
        }
        let mut webp = b"RIFF\0\0\0\0WEBPVP8 ".to_vec();
        webp.resize(64, 0);
        let ok = call(
            &mut c.editor,
            13,
            "table_send_image",
            json!({ "base64": b64(&webp) }),
        )
        .await;
        assert!(
            ok["ok"]["image"].as_str().unwrap().ends_with(".webp"),
            "{ok}"
        );
        let mut big = b"\x89PNG\r\n\x1a\n".to_vec();
        big.resize(crate::table::IMAGE_BYTES + 1, 0);
        let no = call(
            &mut c.editor,
            14,
            "table_send_image",
            json!({ "base64": b64(&big) }),
        )
        .await;
        assert!(err_of(&no).contains("at most"), "{no}");
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 2);
    });
}

/// A roll "to the owner": its roller and the owners see it, the others see
/// that someone rolled in secret, without notation or number — in the event
/// and in the log they read after.
#[test]
fn a_secret_roll_is_the_owners() {
    block_on(async {
        let r = start().await;
        let mut c = seated(&r).await;
        let rolled = call(
            &mut c.editor,
            10,
            "table_roll",
            json!({ "notation": "1d20+5", "source": null, "path": "Sessao.md", "secret": true, "styles": null }),
        )
        .await;
        assert_eq!(rolled["ok"]["secret"], true);
        assert_eq!(
            rolled["ok"]["roll"]["notation"], "1d20+5",
            "its roller sees it"
        );
        let owner = event_named(&mut c.owner, "table-entry").await;
        assert_eq!(owner["roll"]["notation"], "1d20+5");
        assert_eq!(owner["roll"]["total"], rolled["ok"]["roll"]["total"]);
        let other = event_named(&mut c.reader, "table-entry").await;
        assert_eq!(other["kind"], "secret");
        assert_eq!(other["by"], "Bia");
        assert_eq!(other["roll"], Value::Null);
        assert_eq!(other["path"], Value::Null);
        // The log, read later, says the same.
        let mut late = open(&r, "ana@casa.lan", "a senha da ana", &c.folder).await;
        let joined = join(&mut late).await;
        assert_eq!(joined["entries"][0]["kind"], "secret");
        assert_eq!(joined["entries"][0]["roll"], Value::Null);
        // A roll in a note's room, to the owner: the room is told nothing.
        for ws in [&mut c.owner, &mut c.editor] {
            call(ws, 11, "collab_join", json!({ "path": NOTE })).await;
        }
        let quiet = call(
            &mut c.editor,
            12,
            "collab_roll",
            json!({ "path": NOTE, "notation": "1d4", "source": null, "styles": null, "secret": true }),
        )
        .await;
        assert!(quiet.get("ok").is_some(), "{quiet}");
        let after = call(&mut c.editor, 13, "collab_join", json!({ "path": NOTE })).await;
        assert_eq!(
            after["ok"]["rolls"],
            json!([]),
            "the room keeps no secret roll"
        );
        let entry = event_named(&mut c.owner, "table-entry").await;
        assert_eq!(entry["roll"]["notation"], "1d4");
    });
}

/// The dice a roller sends with a roll are the closed form or nothing: a
/// colour that is not `#rrggbb`, a texture off the list, a field beyond the
/// form — refused, nothing rolled, kept or relayed. A good look travels
/// with the roll and the roster.
#[test]
fn a_dice_look_outside_the_closed_form_is_refused() {
    block_on(async {
        let r = start().await;
        let mut c = seated(&r).await;
        let mut bad_colour = look();
        bad_colour["2"]["body"] = json!("url(https://x/y)");
        let mut bad_texture = look();
        bad_texture["1"]["texture"] = json!("https://x/y.png");
        let mut extra = look();
        extra["3"]["src"] = json!("x");
        let mut missing = look();
        missing.as_object_mut().unwrap().remove("3");
        for styles in [bad_colour, bad_texture, extra, missing] {
            let no = call(
                &mut c.editor,
                10,
                "table_roll",
                json!({ "notation": "d6", "source": null, "path": null, "secret": null, "styles": styles }),
            )
            .await;
            assert_eq!(no["err"]["kind"], "refused", "{no}");
            let no = call(
                &mut c.editor,
                11,
                "table_look",
                json!({ "color": null, "styles": styles }),
            )
            .await;
            assert_eq!(no["err"]["kind"], "refused", "{no}");
        }
        let no = call(
            &mut c.editor,
            12,
            "table_look",
            json!({ "color": "red", "styles": null }),
        )
        .await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 0);
        let ok = call(
            &mut c.editor,
            13,
            "table_look",
            json!({ "color": "#AABBCC", "styles": look() }),
        )
        .await;
        assert!(ok.get("ok").is_some(), "{ok}");
        // The joins came first: the roster that carries the new look.
        let bia = loop {
            let roster = event_named(&mut c.owner, "table-roster").await;
            let bia = roster
                .as_array()
                .unwrap()
                .iter()
                .find(|m| m["name"] == "Bia")
                .cloned();
            if let Some(b) = bia.filter(|b| b["color"] == "#aabbcc") {
                break b;
            }
        };
        assert_eq!(bia["styles"]["1"]["body"], "#8c1f2b");
    });
}

/// A message is at most 500 characters of plain text; one past the bound
/// is refused, and one far past it is refused before it is parsed. The
/// connection's pace stops a burst.
#[test]
fn a_message_is_bounded_and_paced() {
    block_on(async {
        let r = start().await;
        let mut c = seated(&r).await;
        let exact = "é".repeat(500);
        let ok = call(&mut c.editor, 10, "table_say", json!({ "text": exact })).await;
        assert!(ok.get("ok").is_some(), "{ok}");
        let long = "a".repeat(501);
        let no = call(&mut c.editor, 11, "table_say", json!({ "text": long })).await;
        assert!(err_of(&no).contains("500"), "{no}");
        for text in ["", "   ", "a\u{0}b", "a\u{1b}[31m"] {
            let no = call(&mut c.editor, 12, "table_say", json!({ "text": text })).await;
            assert_eq!(no["err"]["kind"], "refused", "{text:?}: {no}");
        }
        // Far past: refused from its name, before the arguments are read.
        let huge = json!({ "id": 13, "cmd": "table_say", "args": { "text": "a".repeat(100_000) } });
        c.editor
            .send(Message::Text(huge.to_string().into()))
            .await
            .unwrap();
        let no = next(&mut c.editor).await;
        assert_eq!(no["id"], 13, "{no}");
        assert!(err_of(&no).contains("message of"), "{no}");
        // Only one at the table speaks: a window that never joined.
        let mut away = open(&r, "bia@casa.lan", "a senha da bia", &c.folder).await;
        let no = call(&mut away, 14, "table_say", json!({ "text": "oi" })).await;
        assert!(err_of(&no).contains("join the table"), "{no}");
        // The burst: twenty at once, then the pace.
        let mut refused = 0;
        for i in 0..40 {
            let a = call(&mut c.reader, 100 + i, "table_say", json!({ "text": "x" })).await;
            if a.get("err").is_some() {
                assert!(err_of(&a).contains("too fast"), "{a}");
                refused += 1;
            }
        }
        assert!(refused >= 15, "{refused} refused of 40");
        // Another connection has its own pace.
        let ok = call(&mut c.owner, 200, "table_say", json!({ "text": "x" })).await;
        assert!(ok.get("ok").is_some(), "{ok}");
    });
}

/// Who is at the table: one entry per account, told when one comes or goes
/// — a window closed too.
#[test]
fn the_roster_follows_who_is_at_the_table() {
    block_on(async {
        let r = start().await;
        let mut c = cast(&r).await;
        let joined = join(&mut c.owner).await;
        assert_eq!(joined["roster"].as_array().unwrap().len(), 1);
        let again = join(&mut c.editor).await;
        let names: Vec<_> = again["roster"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["name"].as_str().unwrap().to_owned())
            .collect();
        assert_eq!(names.len(), 2, "{names:?}");
        let heard = event_named(&mut c.owner, "table-roster").await;
        assert_eq!(heard.as_array().unwrap().len(), 2);
        // The same account in a second window is one at the table.
        let mut second = open(&r, "bia@casa.lan", "a senha da bia", &c.folder).await;
        let both = join(&mut second).await;
        assert_eq!(both["roster"].as_array().unwrap().len(), 2);
        // Leaving, and a window that closes.
        call(&mut c.editor, 9, "table_leave", json!({})).await;
        call(&mut second, 9, "table_leave", json!({})).await;
        drop(second);
        let mut last = Value::Null;
        for _ in 0..3 {
            last = event_named(&mut c.owner, "table-roster").await;
            if last.as_array().unwrap().len() == 1 {
                break;
            }
        }
        assert_eq!(last.as_array().unwrap().len(), 1, "{last}");
        // Nothing is said to a window that left.
        call(&mut c.owner, 10, "table_say", json!({ "text": "sozinho" })).await;
        assert_eq!(r.server.db.table_count(&c.folder).unwrap(), 1);
    });
}

/// What the readers of a folder are not told: a roll made inside a note's
/// secret block is kept for the owners and editors only, in the event and
/// in the page they read.
#[test]
fn what_the_readers_are_not_told_stays_off_their_table() {
    let row = |hidden: bool, secret: bool| TableRow {
        id: 7,
        kind: "roll".into(),
        account: "bia".into(),
        by_name: "Bia".into(),
        at: "2026-10-21T10:00:00Z".into(),
        path: Some("N.md".into()),
        pinned: false,
        secret,
        readers_hidden: hidden,
        body: json!({ "roll": null }).to_string(),
    };
    use crate::table::seen;
    assert!(seen(&row(true, false), "ana", Role::Reader).is_none());
    assert!(seen(&row(true, false), "bia", Role::Editor).is_some());
    assert!(seen(&row(false, false), "ana", Role::Reader).is_some());
    // A secret roll: its roller and the owners, nobody else.
    let masked = seen(&row(false, true), "ana", Role::Reader).unwrap();
    assert_eq!((masked.kind.as_str(), masked.path), ("secret", None));
    assert_eq!(
        seen(&row(false, true), "bia", Role::Editor).unwrap().kind,
        "roll"
    );
    assert_eq!(
        seen(&row(false, true), "dono", Role::Owner).unwrap().kind,
        "roll"
    );
    assert_eq!(
        seen(&row(false, true), "cid", Role::Editor).unwrap().kind,
        "secret"
    );
    // And the database pages them out for a reader.
    let db = crate::db::Db::memory().unwrap();
    let a = db
        .create_account("a@x.org", "A", "pt", Some("uma senha longa"), true)
        .unwrap();
    let folder = db.create_folder("f", &a.id).unwrap();
    for hidden in [true, false] {
        db.table_add(&folder.id, &row(hidden, false)).unwrap();
    }
    assert_eq!(
        db.table_page(&folder.id, None, 10, true).unwrap().0.len(),
        1
    );
    assert_eq!(
        db.table_page(&folder.id, None, 10, false).unwrap().0.len(),
        2
    );
    assert_eq!(db.table_pinned(&folder.id, true).unwrap().len(), 0);
}

/// The log has a ceiling per folder: past it the oldest unpinned entries go,
/// the pinned ones stay.
#[test]
fn the_logs_ceiling_drops_the_oldest_unpinned() {
    let db = crate::db::Db::memory().unwrap();
    let a = db
        .create_account("a@x.org", "A", "pt", Some("uma senha longa"), true)
        .unwrap();
    let folder = db.create_folder("f", &a.id).unwrap();
    let mut row = TableRow {
        id: 0,
        kind: "say".into(),
        account: "a".into(),
        by_name: "A".into(),
        at: "2026-10-21T10:00:00Z".into(),
        path: None,
        pinned: true,
        secret: false,
        readers_hidden: false,
        body: "{}".into(),
    };
    let pinned = db.table_add(&folder.id, &row).unwrap();
    row.pinned = false;
    for _ in 0..crate::db::ROWS_MOST + 5 {
        db.table_add(&folder.id, &row).unwrap();
    }
    assert_eq!(db.table_count(&folder.id).unwrap(), crate::db::ROWS_MOST);
    assert!(
        db.table_get(&folder.id, pinned).unwrap().is_some(),
        "the pinned stays"
    );
}
