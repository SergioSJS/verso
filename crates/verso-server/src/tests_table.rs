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
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
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
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 2);
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
                table: String::new(),
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
        assert_eq!(heard, json!({ "table": "", "id": roll_id, "pinned": true }));
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
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
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
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
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
            r.server.db.table_count(&c.folder, "").unwrap(),
            1,
            "the pinned roll stays"
        );
        let heard = event_named(&mut c.reader, "table-cleared").await;
        assert_eq!(heard, json!({ "table": "", "keep_pinned": true }));
        call(
            &mut c.owner,
            24,
            "table_clear",
            json!({ "keepPinned": false }),
        )
        .await;
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 0);
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
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
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
            assert!(
                err_of(&no).contains("an image, a PDF or an audio file"),
                "{no}"
            );
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
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 2);
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
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 0);
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
            let bia = roster["members"]
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
        assert_eq!(heard["members"].as_array().unwrap().len(), 2);
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
            if last["members"].as_array().unwrap().len() == 1 {
                break;
            }
        }
        assert_eq!(last["members"].as_array().unwrap().len(), 1, "{last}");
        // Nothing is said to a window that left.
        call(&mut c.owner, 10, "table_say", json!({ "text": "sozinho" })).await;
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
    });
}

/// What the readers of a folder are not told: a roll made inside a note's
/// secret block is kept for the owners and editors only, in the event and
/// in the page they read.
#[test]
fn what_the_readers_are_not_told_stays_off_their_table() {
    let row = |hidden: bool, secret: bool| TableRow {
        table: String::new(),
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
    assert!(seen(&row(true, false), "ana", Role::Reader, None).is_none());
    assert!(seen(&row(true, false), "bia", Role::Editor, None).is_some());
    assert!(seen(&row(false, false), "ana", Role::Reader, None).is_some());
    // A secret roll: its roller and the owners, nobody else.
    let masked = seen(&row(false, true), "ana", Role::Reader, None).unwrap();
    assert_eq!((masked.kind.as_str(), masked.path), ("secret", None));
    assert_eq!(
        seen(&row(false, true), "bia", Role::Editor, None)
            .unwrap()
            .kind,
        "roll"
    );
    assert_eq!(
        seen(&row(false, true), "dono", Role::Owner, None)
            .unwrap()
            .kind,
        "roll"
    );
    assert_eq!(
        seen(&row(false, true), "cid", Role::Editor, None)
            .unwrap()
            .kind,
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
        db.table_page(&folder.id, "", None, 10, true)
            .unwrap()
            .0
            .len(),
        1
    );
    assert_eq!(
        db.table_page(&folder.id, "", None, 10, false)
            .unwrap()
            .0
            .len(),
        2
    );
    assert_eq!(db.table_pinned(&folder.id, "", true).unwrap().len(), 0);
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
        table: String::new(),
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
    assert_eq!(
        db.table_count(&folder.id, "").unwrap(),
        crate::db::ROWS_MOST
    );
    assert!(
        db.table_get(&folder.id, "", pinned).unwrap().is_some(),
        "the pinned stays"
    );
}

/// One log per table (ADR 0107 as amended 2026-10-23: "o chat deve ser 1
/// por mesa"). Two tables in one folder keep their own entries, presence,
/// pins and ceilings; a call that names no table goes to the folder's
/// default (its shortest-rooted table), a name that is no table of the
/// folder is refused.
mod per_table {
    use super::*;

    const CRIPTA: &str = "Cripta";
    const SALA: &str = "Sala";

    /// The folder made two tables, `Cripta` and `Sala` (the default: the
    /// shortest root), as the game master's `campaign_make` would.
    fn two_tables(r: &Running, folder: &str) {
        r.server.db.campaign_make(folder, CRIPTA).unwrap();
        r.server.db.campaign_make(folder, SALA).unwrap();
        crate::campaign::forget(&r.server, folder);
    }

    /// Nothing of the table reaches `ws` in a moment: a leak would be
    /// queued already.
    async fn quiet(ws: &mut Socket) {
        use futures_util::StreamExt;
        while let Ok(Some(Ok(Message::Text(t)))) =
            tokio::time::timeout(std::time::Duration::from_millis(400), ws.next()).await
        {
            let v: Value = serde_json::from_str(&t).unwrap();
            assert!(
                v["event"] != "table-entry",
                "an entry of another table: {v}"
            );
        }
    }

    async fn join_at(ws: &mut Socket, id: u64, table: Option<&str>) -> Value {
        let joined = call(
            ws,
            id,
            "table_join",
            json!({ "color": null, "styles": null, "table": table }),
        )
        .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        joined["ok"].clone()
    }

    async fn say_at(ws: &mut Socket, id: u64, table: Option<&str>, text: &str) -> Value {
        let said = call(ws, id, "table_say", json!({ "text": text, "table": table })).await;
        assert!(said.get("ok").is_some(), "{said}");
        said["ok"].clone()
    }

    #[test]
    fn two_tables_of_a_folder_keep_apart_their_entries_and_their_roster() {
        block_on(async {
            let r = start().await;
            let mut c = cast(&r).await;
            two_tables(&r, &c.folder);
            let a = join_at(&mut c.owner, 2, Some(CRIPTA)).await;
            assert_eq!(a["table"], CRIPTA);
            join_at(&mut c.reader, 2, Some(CRIPTA)).await;
            let b = join_at(&mut c.editor, 2, Some(SALA)).await;
            assert_eq!(b["table"], SALA);
            // Who is at each: the roster is the table's own.
            assert_eq!(b["roster"].as_array().unwrap().len(), 1, "{b}");
            let heard = event_named(&mut c.owner, "table-roster").await;
            assert_eq!(heard["table"], CRIPTA);
            assert_eq!(heard["members"].as_array().unwrap().len(), 2, "{heard}");
            // A message in one reaches that table's windows only.
            let first = say_at(&mut c.owner, 3, Some(CRIPTA), "na cripta").await;
            assert_eq!(first["table"], CRIPTA);
            say_at(&mut c.editor, 3, Some(SALA), "na sala").await;
            let heard = event_named(&mut c.reader, "table-entry").await;
            assert_eq!(
                (heard["text"].as_str(), heard["table"].as_str()),
                (Some("na cripta"), Some(CRIPTA))
            );
            // The editor's own entry was heard while it called; the
            // cripta's never reaches it.
            quiet(&mut c.editor).await;
            // Kept apart, and a new join gets only its table's.
            assert_eq!(r.server.db.table_count(&c.folder, CRIPTA).unwrap(), 1);
            assert_eq!(r.server.db.table_count(&c.folder, SALA).unwrap(), 1);
            assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 0);
            let again = join_at(&mut c.editor, 4, Some(CRIPTA)).await;
            let texts: Vec<_> = again["entries"]
                .as_array()
                .unwrap()
                .iter()
                .map(|e| e["text"].as_str().unwrap().to_owned())
                .collect();
            assert_eq!(texts, ["na cripta"]);
            // History pages the table named.
            let page = call(
                &mut c.editor,
                5,
                "table_history",
                json!({ "before": null, "limit": null, "table": SALA }),
            )
            .await;
            assert_eq!(page["ok"]["entries"][0]["text"], "na sala", "{page}");
            // Leaving one table leaves the other: the roster of Cripta shrinks.
            call(&mut c.editor, 6, "table_leave", json!({ "table": CRIPTA })).await;
            say_at(&mut c.editor, 7, Some(SALA), "ainda na sala").await;
        });
    }

    #[test]
    fn a_pin_a_delete_and_a_clear_reach_only_their_own_table() {
        block_on(async {
            let r = start().await;
            let mut c = cast(&r).await;
            two_tables(&r, &c.folder);
            for ws in [&mut c.owner, &mut c.editor] {
                join_at(ws, 2, Some(CRIPTA)).await;
                join_at(ws, 3, Some(SALA)).await;
            }
            let in_sala = say_at(&mut c.editor, 4, Some(SALA), "sala").await;
            let id = in_sala["id"].clone();
            say_at(&mut c.editor, 5, Some(CRIPTA), "cripta").await;
            // The entry of Sala is no entry of Cripta.
            for cmd in ["table_pin", "table_delete"] {
                let no = call(
                    &mut c.owner,
                    6,
                    cmd,
                    json!({ "id": id, "pinned": true, "table": CRIPTA }),
                )
                .await;
                assert_eq!(no["err"]["kind"], "not_found", "{cmd}: {no}");
            }
            let yes = call(
                &mut c.owner,
                7,
                "table_pin",
                json!({ "id": id, "pinned": true, "table": SALA }),
            )
            .await;
            assert!(yes.get("ok").is_some(), "{yes}");
            // Clearing Cripta leaves Sala whole, pinned and all.
            let cleared = call(
                &mut c.owner,
                8,
                "table_clear",
                json!({ "keepPinned": false, "table": CRIPTA }),
            )
            .await;
            assert!(cleared.get("ok").is_some(), "{cleared}");
            assert_eq!(r.server.db.table_count(&c.folder, CRIPTA).unwrap(), 0);
            assert_eq!(r.server.db.table_count(&c.folder, SALA).unwrap(), 1);
        });
    }

    #[test]
    fn a_call_naming_no_table_goes_to_the_default_and_a_name_that_is_none_is_refused() {
        block_on(async {
            let r = start().await;
            let mut c = cast(&r).await;
            // No table in the folder: the folder's own, `""`, and only it.
            let joined = join_at(&mut c.owner, 2, None).await;
            assert_eq!(joined["table"], "");
            for bad in [CRIPTA, "../x", "/x", "a/../b", "a\\b"] {
                let no = call(
                    &mut c.editor,
                    3,
                    "table_join",
                    json!({ "color": null, "styles": null, "table": bad }),
                )
                .await;
                assert_eq!(no["err"]["kind"], "refused", "{bad}: {no}");
            }
            say_at(&mut c.owner, 4, None, "da pasta").await;
            assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
            // Tables made: what the folder kept moves to the first one (the
            // old peer's calls go there), and `""` is no table now.
            two_tables(&r, &c.folder);
            r.server.db.campaign_drop(&c.folder, CRIPTA).unwrap();
            r.server.db.campaign_drop(&c.folder, SALA).unwrap();
            r.server.db.campaign_make(&c.folder, CRIPTA).unwrap();
            crate::campaign::forget(&r.server, &c.folder);
            assert_eq!(r.server.db.table_count(&c.folder, CRIPTA).unwrap(), 1);
            r.server.db.campaign_make(&c.folder, SALA).unwrap();
            crate::campaign::forget(&r.server, &c.folder);
            let old = join_at(&mut c.reader, 5, None).await;
            assert_eq!(old["table"], SALA, "the shortest root is the default");
            let nope = call(
                &mut c.reader,
                6,
                "table_join",
                json!({ "color": null, "styles": null, "table": "" }),
            )
            .await;
            assert_eq!(nope["err"]["kind"], "refused", "{nope}");
            // The table is named however the folder spells it.
            let upper = join_at(&mut c.reader, 7, Some("cripta/")).await;
            assert_eq!(upper["table"], CRIPTA);
            assert_eq!(upper["entries"].as_array().unwrap().len(), 1);
            // Unmade, the last table gives the log back to the folder.
            r.server.db.campaign_drop(&c.folder, CRIPTA).unwrap();
            r.server.db.campaign_drop(&c.folder, SALA).unwrap();
            assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
        });
    }

    #[test]
    fn a_roll_from_a_note_lands_in_the_table_that_holds_the_note() {
        block_on(async {
            let r = start().await;
            let mut c = cast(&r).await;
            two_tables(&r, &c.folder);
            join_at(&mut c.reader, 2, Some(CRIPTA)).await;
            join_at(&mut c.reader, 3, Some(SALA)).await;
            for name in ["Cripta/Sessao", "Fora"] {
                let made = call(
                    &mut c.owner,
                    9,
                    "create_note",
                    json!({ "name": name, "text": "x\n" }),
                )
                .await;
                assert!(made.get("ok").is_some(), "{made}");
            }
            // The editor is a player (ADR 0113 item 3): the notes are theirs
            // to join once the game master released them to the table.
            let released = call(
                &mut c.owner,
                9,
                "campaign_release",
                json!({ "paths": ["Cripta/Sessao.md", "Fora.md"], "released": true }),
            )
            .await;
            assert!(released.get("ok").is_some(), "{released}");
            for path in ["Cripta/Sessao.md", "Fora.md"] {
                let joined = call(&mut c.editor, 4, "collab_join", json!({ "path": path })).await;
                assert!(joined.get("ok").is_some(), "{joined}");
                let rolled = call(
                    &mut c.editor,
                    5,
                    "collab_roll",
                    json!({ "path": path, "notation": "1d6", "source": null, "styles": null, "secret": null }),
                )
                .await;
                assert!(rolled.get("ok").is_some(), "{rolled}");
            }
            let heard = event_named(&mut c.reader, "table-entry").await;
            // (A reader is not told the path of a note not released.)
            assert_eq!(heard["table"], CRIPTA, "{heard}");
            // A note outside every table goes to the default one.
            let heard = event_named(&mut c.reader, "table-entry").await;
            assert_eq!(
                (heard["path"].as_str(), heard["table"].as_str()),
                (Some("Fora.md"), Some(SALA))
            );
        });
    }

    /// A player invited to a table of a subfolder is a window on a share
    /// rooted at that table (ADR 0110 item 2): it is at that table, the
    /// owner sees the same log from the whole folder, and no other table of
    /// the folder is reached through it. A share that is no table has none.
    #[test]
    fn a_player_of_a_table_is_at_that_table_only_and_a_plain_share_has_none() {
        block_on(async {
            let r = start().await;
            let mut c = cast(&r).await;
            two_tables(&r, &c.folder);
            let ana = r
                .server
                .db
                .account_by_email("ana@casa.lan")
                .unwrap()
                .unwrap();
            let share = r.server.db.make_share(&c.folder, CRIPTA).unwrap();
            r.server
                .db
                .grant_share(&share.id, &ana.id, Role::Reader)
                .unwrap();
            let mut win = open(&r, "ana@casa.lan", "a senha da ana", &share.id).await;
            join_at(&mut c.owner, 2, Some(CRIPTA)).await;
            // Named or not, the player is at Cripta; Sala is refused.
            // The player knows its table as the share's own root, `""`.
            let mine = join_at(&mut win, 3, None).await;
            assert_eq!(mine["table"], "");
            let again = join_at(&mut win, 4, Some("")).await;
            assert_eq!(again["table"], "");
            let named = call(
                &mut win,
                4,
                "table_join",
                json!({ "color": null, "styles": null, "table": CRIPTA }),
            )
            .await;
            assert_eq!(named["err"]["kind"], "refused", "{named}");
            let no = call(
                &mut win,
                5,
                "table_join",
                json!({ "color": null, "styles": null, "table": SALA }),
            )
            .await;
            assert_eq!(no["err"]["kind"], "refused", "{no}");
            for (cmd, args) in [
                ("table_say", json!({ "text": "oi", "table": SALA })),
                (
                    "table_history",
                    json!({ "before": null, "limit": null, "table": SALA }),
                ),
            ] {
                let no = call(&mut win, 6, cmd, args).await;
                assert_eq!(no["err"]["kind"], "refused", "{cmd}: {no}");
            }
            // The player says and rolls at Cripta; the owner reads the same log.
            say_at(&mut win, 7, None, "da cripta").await;
            let heard = event_named(&mut c.owner, "table-entry").await;
            assert_eq!(
                (heard["text"].as_str(), heard["table"].as_str()),
                (Some("da cripta"), Some(CRIPTA))
            );
            let rolled = call(
                &mut win,
                8,
                "table_roll",
                json!({ "notation": "1d6", "source": null, "path": "Cripta/Ata.md", "secret": null, "styles": null, "table": null }),
            )
            .await;
            assert!(rolled.get("ok").is_some(), "{rolled}");
            // The note is written from the share's root, as the player knows it.
            assert_eq!(rolled["ok"]["path"], "Ata.md", "{rolled}");
            assert_eq!(r.server.db.table_count(&c.folder, CRIPTA).unwrap(), 2);
            assert_eq!(r.server.db.table_count(&c.folder, SALA).unwrap(), 0);
            // A reader sends no image, from a share or as a member alike.
            let img = call(&mut win, 9, "table_send_image", json!({ "base64": png() })).await;
            assert_eq!(img["err"]["kind"], "refused", "{img}");
            assert!(err_of(&img).contains("read"), "{img}");
            // A share that is no table has no table channel.
            let plain = r.server.db.make_share(&c.folder, "Livre").unwrap();
            r.server
                .db
                .grant_share(&plain.id, &ana.id, Role::Reader)
                .unwrap();
            let mut other = open(&r, "ana@casa.lan", "a senha da ana", &plain.id).await;
            for table in [Some(CRIPTA), None] {
                let no = call(
                    &mut other,
                    3,
                    "table_join",
                    json!({ "color": null, "styles": null, "table": table }),
                )
                .await;
                assert_eq!(no["err"]["kind"], "refused", "{no}");
                assert!(err_of(&no).contains("share"), "{no}");
            }
        });
    }

    /// A window on a share at a table behaves as a member at it (ADR 0110,
    /// 2026-10-23): it hears the table live — others' entries, its own roll
    /// from a note, the roster — through a second window of the account and
    /// after that one is gone, and an editor sends an image, kept inside the
    /// table's folder. Only the paths are the share's own.
    #[test]
    fn a_window_on_a_share_hears_the_table_live_as_a_member_does() {
        block_on(async {
            let r = start().await;
            let mut c = cast(&r).await;
            two_tables(&r, &c.folder);
            let bia = r
                .server
                .db
                .account_by_email("bia@casa.lan")
                .unwrap()
                .unwrap();
            let share = r.server.db.make_share(&c.folder, CRIPTA).unwrap();
            r.server
                .db
                .grant_share(&share.id, &bia.id, Role::Editor)
                .unwrap();
            let made = call(
                &mut c.owner,
                9,
                "create_note",
                json!({ "name": "Cripta/Ata", "text": "x\n" }),
            )
            .await;
            assert!(made.get("ok").is_some(), "{made}");
            // Bia is an editor of the share: a player who edits the files
            // they see (ADR 0113 item 3), so the note is released to her.
            let released = call(
                &mut c.owner,
                9,
                "campaign_release",
                json!({ "paths": ["Cripta/Ata.md"], "released": true }),
            )
            .await;
            assert!(released.get("ok").is_some(), "{released}");
            let mut first = open(&r, "bia@casa.lan", "a senha da bia", &share.id).await;
            join_at(&mut first, 2, None).await;
            join_at(&mut c.owner, 2, Some(CRIPTA)).await;
            // The owner speaks: the share's window hears it, the table as `""`.
            say_at(&mut c.owner, 3, Some(CRIPTA), "da mesa").await;
            let heard = event_named(&mut first, "table-entry").await;
            assert_eq!(
                (heard["text"].as_str(), heard["table"].as_str()),
                (Some("da mesa"), Some(""))
            );
            // A second window of the same account joins, and goes.
            let mut second = open(&r, "bia@casa.lan", "a senha da bia", &share.id).await;
            join_at(&mut second, 2, None).await;
            say_at(&mut c.owner, 4, Some(CRIPTA), "de novo").await;
            assert_eq!(
                event_named(&mut first, "table-entry").await["text"],
                "de novo"
            );
            assert_eq!(
                event_named(&mut second, "table-entry").await["text"],
                "de novo"
            );
            call(&mut second, 3, "table_leave", json!({ "table": "" })).await;
            drop(second);
            say_at(&mut c.owner, 5, Some(CRIPTA), "so a primeira").await;
            assert_eq!(
                event_named(&mut first, "table-entry").await["text"],
                "so a primeira"
            );
            // Its own roll from the note's room comes back to it, live.
            let joined = call(&mut first, 4, "collab_join", json!({ "path": "Ata.md" })).await;
            assert!(joined.get("ok").is_some(), "{joined}");
            {
                use futures_util::SinkExt;
                // Sent, not awaited: the table's entry comes before the answer.
                first
                    .send(Message::Text(
                        json!({ "id": 5, "cmd": "collab_roll", "args": { "path": "Ata.md", "notation": "1d6", "source": null, "styles": null, "secret": null } })
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
            }
            let mut own = event_named(&mut first, "table-entry").await;
            while own["kind"] != "roll" {
                own = event_named(&mut first, "table-entry").await;
            }
            assert_eq!(
                (own["path"].as_str(), own["table"].as_str()),
                (Some("Ata.md"), Some(""))
            );
            // An editor on a share is a player (ADR 0113 item 3): she sends an
            // image once the game master lets her (K.4). The file is kept
            // inside the table's folder.
            let let_her = call(
                &mut c.owner,
                10,
                "table_rights_set",
                json!({ "root": CRIPTA, "accounts": [bia.id], "right": "images", "on": true }),
            )
            .await;
            assert!(let_her.get("ok").is_some(), "{let_her}");
            let sent = call(
                &mut first,
                6,
                "table_send_image",
                json!({ "base64": png() }),
            )
            .await;
            assert!(sent.get("ok").is_some(), "{sent}");
            let image = sent["ok"]["image"].as_str().unwrap();
            assert!(image.starts_with("attachments/mesa-"), "{sent}");
            let mut told = event_named(&mut c.owner, "table-entry").await;
            while told["kind"] != "image" {
                told = event_named(&mut c.owner, "table-entry").await;
            }
            assert_eq!(told["image"], format!("{CRIPTA}/{image}"), "{told}");
        });
    }

    #[test]
    fn each_table_has_its_own_ceiling_and_its_own_image_limit() {
        block_on(async {
            let r = start().await;
            let c = cast(&r).await;
            two_tables(&r, &c.folder);
            r.server
                .db
                .campaign_set(&c.folder, CRIPTA, None, Some(1000), Some(1_048_576))
                .unwrap();
            crate::campaign::forget(&r.server, &c.folder);
            let row = |table: &str, i: usize| TableRow {
                table: table.to_owned(),
                id: 0,
                kind: "say".into(),
                account: "x".into(),
                by_name: "X".into(),
                at: "2026-10-23T00:00:00Z".into(),
                path: None,
                pinned: false,
                secret: false,
                readers_hidden: false,
                body: format!("{{\"text\":\"m{i}\"}}"),
            };
            for i in 0..1010 {
                r.server.db.table_add(&c.folder, &row(CRIPTA, i)).unwrap();
                r.server.db.table_add(&c.folder, &row(SALA, i)).unwrap();
            }
            assert_eq!(r.server.db.table_count(&c.folder, CRIPTA).unwrap(), 1000);
            assert_eq!(r.server.db.table_count(&c.folder, SALA).unwrap(), 1010);
            assert_eq!(
                crate::campaign::image_limit(&r.server, &c.folder, CRIPTA),
                1_048_576
            );
            assert_eq!(
                crate::campaign::image_limit(&r.server, &c.folder, SALA),
                10 * 1024 * 1024
            );
        });
    }

    /// A folder moved: its table's log goes with it.
    #[test]
    fn a_table_renamed_takes_its_log_along() {
        block_on(async {
            let r = start().await;
            let c = cast(&r).await;
            two_tables(&r, &c.folder);
            let row = TableRow {
                table: CRIPTA.to_owned(),
                id: 0,
                kind: "say".into(),
                account: "x".into(),
                by_name: "X".into(),
                at: "2026-10-23T00:00:00Z".into(),
                path: None,
                pinned: false,
                secret: false,
                readers_hidden: false,
                body: "{\"text\":\"oi\"}".into(),
            };
            r.server.db.table_add(&c.folder, &row).unwrap();
            r.server
                .db
                .campaign_move(&c.folder, CRIPTA, "Catacumba")
                .unwrap();
            assert_eq!(r.server.db.table_count(&c.folder, "Catacumba").unwrap(), 1);
            assert_eq!(r.server.db.table_count(&c.folder, CRIPTA).unwrap(), 0);
        });
    }
}
