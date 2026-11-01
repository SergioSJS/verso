// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! ADR 0113 S4, against a running server: who the person is (the
//! capabilities), what they may do with a file (every read answer and every
//! entry of a listing), and the commands that read and change the access of
//! a path.

use serde_json::{Value, json};

use crate::tests::{block_on, call, connect, next};
use crate::tests_campaign::mesa;

fn refused(v: &Value) -> bool {
    v["err"]["kind"] == "refused"
}

#[test]
fn the_capabilities_say_who_the_person_is_at_the_table() {
    block_on(async {
        let mut m = mesa().await;
        let owner = m.owner.call("capabilities", json!({})).await;
        assert_eq!(owner["ok"]["access"]["seat"], "master", "{owner}");
        assert_eq!(owner["ok"]["access"]["cap"], "write", "{owner}");
        // A server never lists the capture of audio: the desktop host's alone
        // (ADR 0116 item 27).
        for who in [&owner, &m.ana.call("capabilities", json!({})).await] {
            let can = who["ok"]["can"].as_array().unwrap();
            assert!(!can.iter().any(|c| c == "audio_share"), "{who}");
            assert!(can.iter().any(|c| c == "table"), "{who}");
        }
        let ana = m.ana.call("capabilities", json!({})).await;
        assert_eq!(ana["ok"]["access"]["seat"], "player", "{ana}");
        assert_eq!(ana["ok"]["access"]["role"], "reader", "{ana}");
        assert_eq!(ana["ok"]["access"]["table"], true, "{ana}");
        // The owner's own read-only token is still the game master.
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        let (secret, _) =
            m.r.server
                .db
                .create_token(&admin.id, "so le", false, None, std::slice::from_ref(&m.id))
                .unwrap();
        let mut ws = connect(&m.r, None, None, Some(&secret)).await.unwrap();
        next(&mut ws).await;
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": m.id })).await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let caps = call(&mut ws, 2, "capabilities", json!({})).await;
        assert_eq!(caps["ok"]["access"]["seat"], "master", "{caps}");
        assert_eq!(caps["ok"]["access"]["cap"], "read", "{caps}");
    });
}

#[test]
fn every_read_says_what_the_person_may_do_with_the_file() {
    block_on(async {
        let mut m = mesa().await;
        let read = m.ana.call("read_note", json!({ "path": "Livre.md" })).await;
        assert_eq!(read["ok"]["access"]["level"], "see", "{read}");
        assert_eq!(read["ok"]["access"]["attach"], false, "{read}");
        let own = m
            .owner
            .call("read_note", json!({ "path": "Livre.md" }))
            .await;
        assert_eq!(own["ok"]["access"]["level"], "edit", "{own}");
        assert_eq!(own["ok"]["access"]["why"]["kind"], "master", "{own}");
        let listed = m.ana.call("list_entries", json!({})).await;
        let entries = listed["ok"].as_array().unwrap();
        assert!(!entries.is_empty(), "{listed}");
        for e in entries {
            assert!(e["access"]["level"].is_string(), "no access on {e}");
        }
        let livre = entries.iter().find(|e| e["path"] == "Livre.md").unwrap();
        assert_eq!(livre["access"]["why"]["kind"], "own", "{livre}");
    });
}

#[test]
fn the_game_master_reads_and_changes_the_access_of_a_file_and_a_folder() {
    block_on(async {
        let mut m = mesa().await;
        let (ana, bia) = (m.ana_id.clone(), m.bia_id.clone());
        let got = m
            .owner
            .call(
                "access_get",
                json!({ "paths": ["Barão Zq.md", "Mundo Zq"] }),
            )
            .await;
        let infos = got["ok"].as_array().unwrap();
        assert_eq!(infos[0]["why"]["kind"], "default", "{got}");
        assert_eq!(infos[0]["manage"], true, "{got}");
        assert_eq!(infos[1]["folder"], true, "{got}");
        assert_eq!(infos[1]["files"], 1, "{got}");
        assert_eq!(infos[0]["players"].as_array().unwrap().len(), 2, "{got}");
        // Ana edits it, Bia sees it, the whole table does not.
        let set = |whole: &str, rows: Value| json!({ "kind": "set", "set": { "whole": whole, "rows": rows }, "secret_name": null });
        let done = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Barão Zq.md"], "change": set("none", json!([
                    { "account": ana, "level": "edit" },
                    { "account": bia, "level": "see" },
                ])) }),
            )
            .await;
        assert_eq!(done["ok"]["changed"], 1, "{done}");
        let told = crate::tests::event_named(&mut m.ana.ws, "access-changed").await;
        assert!(told["paths"].is_array(), "{told}");
        let read = m
            .ana
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert_eq!(read["ok"]["access"]["level"], "edit", "{read}");
        let revision = read["ok"]["revision"].as_str().unwrap().to_owned();
        let wrote = m
            .ana
            .call(
                "write_note",
                json!({ "path": "Barão Zq.md", "text": "da Ana\n", "revision": revision }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        let bia_read = m
            .bia
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert_eq!(bia_read["ok"]["access"]["level"], "see", "{bia_read}");
        let bia_wrote = m
            .bia
            .call(
                "write_note",
                json!({ "path": "Barão Zq.md", "text": "x\n", "revision": "x" }),
            )
            .await;
        assert!(refused(&bia_wrote), "{bia_wrote}");
        // A player of no table cannot be given a row.
        let no = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Barão Zq.md"], "change": set("none", json!([
                    { "account": "nobody", "level": "see" },
                ])) }),
            )
            .await;
        assert!(refused(&no), "{no}");
        // A player changes nothing, and is told who sees what it sees.
        let no = m
            .ana
            .call(
                "access_set",
                json!({ "paths": ["Barão Zq.md"], "change": set("edit", json!([])) }),
            )
            .await;
        assert!(refused(&no), "{no}");
        let mine = m
            .ana
            .call("access_get", json!({ "paths": ["Barão Zq.md"] }))
            .await;
        assert_eq!(mine["ok"][0]["manage"], false, "{mine}");
        assert!(mine["ok"][0]["own"].is_null(), "{mine}");
        let hidden = m
            .bia
            .call("access_get", json!({ "paths": ["Mapa Zq.md"] }))
            .await;
        assert_eq!(hidden["err"]["kind"], "not_found", "{hidden}");
        // A folder's apply replaces what is inside, exceptions included; the
        // count says how many files.
        let applied = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq"], "change": set("see", json!([])) }),
            )
            .await;
        assert_eq!(applied["ok"]["changed"], 1, "{applied}");
        let crypt = m
            .bia
            .call("read_note", json!({ "path": "Mundo Zq/Cripta Zq.md" }))
            .await;
        assert_eq!(crypt["ok"]["access"]["level"], "see", "{crypt}");
        assert_eq!(crypt["ok"]["access"]["why"]["kind"], "folder", "{crypt}");
        // An exception, listed in the folder's access, then back to the folder.
        let alone = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq/Cripta Zq.md"], "change": set("none", json!([])) }),
            )
            .await;
        assert!(alone.get("ok").is_some(), "{alone}");
        let folder = m
            .owner
            .call("access_get", json!({ "paths": ["Mundo Zq"] }))
            .await;
        assert_eq!(
            folder["ok"][0]["exceptions"][0]["path"], "Mundo Zq/Cripta Zq.md",
            "{folder}"
        );
        let gone = m
            .bia
            .call("read_note", json!({ "path": "Mundo Zq/Cripta Zq.md" }))
            .await;
        assert_eq!(gone["err"]["kind"], "not_found", "{gone}");
        let back = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq/Cripta Zq.md"], "change": { "kind": "follow" } }),
            )
            .await;
        assert_eq!(back["ok"]["changed"], 1, "{back}");
        let again = m
            .bia
            .call("read_note", json!({ "path": "Mundo Zq/Cripta Zq.md" }))
            .await;
        assert_eq!(again["ok"]["access"]["level"], "see", "{again}");
    });
}

/// The four rights of a player (ADR 0113 K.6) are given by the one command,
/// each into its own list, and by the game master alone.
#[test]
fn the_four_rights_are_given_by_the_one_command() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        let no = m
            .ana
            .call(
                "table_rights_set",
                json!({ "root": "", "accounts": [ana], "right": "files", "on": true }),
            )
            .await;
        assert!(refused(&no), "{no}");
        let bad = m
            .owner
            .call(
                "table_rights_set",
                json!({ "root": "", "accounts": [ana], "right": "dice", "on": true }),
            )
            .await;
        assert!(refused(&bad), "{bad}");
        // A new player has none of the four.
        let none = m.owner.call("campaign_status", json!({})).await;
        for list in [
            "image_players",
            "file_players",
            "note_players",
            "board_players",
        ] {
            assert_eq!(none["ok"]["tables"][0][list], json!([]), "{list}: {none}");
        }
        for (right, list) in [
            ("images", "image_players"),
            ("files", "file_players"),
            ("create_notes", "note_players"),
            ("create_boards", "board_players"),
        ] {
            let done = m
                .owner
                .call(
                    "table_rights_set",
                    json!({ "root": "", "accounts": [ana], "right": right, "on": true }),
                )
                .await;
            assert_eq!(
                done["ok"]["tables"][0][list],
                json!([ana]),
                "{right}: {done}"
            );
        }
        // Taking one back leaves the others.
        let done = m
            .owner
            .call(
                "table_rights_set",
                json!({ "root": "", "accounts": [ana], "right": "files", "on": false }),
            )
            .await;
        assert_eq!(done["ok"]["tables"][0]["file_players"], json!([]), "{done}");
        assert_eq!(
            done["ok"]["tables"][0]["image_players"],
            json!([ana]),
            "{done}"
        );
    });
}

/// A new file into a note the person edits (ADR 0113 item 5, D, K.6): the
/// rules' Attach — a new image needs the level *edits* on that note and no
/// right; another file also the right *Files* — and the file is the server's,
/// written into the table's attachments place with no entry in the chat.
#[test]
fn an_image_put_into_a_note_one_edits_needs_only_the_edit() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        let png = crate::tests_campaign::PNG;
        let edit = |rows: Value| json!({ "kind": "set", "set": { "whole": "none", "rows": rows }, "secret_name": null });
        // Sees it only: nothing is attached.
        let seen = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Livre.md"], "change": { "kind": "set",
                    "set": { "whole": "see", "rows": [] }, "secret_name": null } }),
            )
            .await;
        assert!(seen.get("ok").is_some(), "{seen}");
        let no = m
            .ana
            .call("table_attach", json!({ "base64": png, "into": "Livre.md" }))
            .await;
        assert!(refused(&no), "{no}");
        // Edits it, with no right at all: the image is written, and the chat
        // has no entry of it.
        let g = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Livre.md"], "change": edit(json!([{ "account": ana, "level": "edit" }])) }),
            )
            .await;
        assert!(g.get("ok").is_some(), "{g}");
        let made = m
            .ana
            .call("table_attach", json!({ "base64": png, "into": "Livre.md" }))
            .await;
        let path = made["ok"].as_str().unwrap_or_default().to_owned();
        assert!(path.starts_with("assets/mesa-"), "{made}");
        let files = m.owner.call("list_files", json!({})).await;
        assert!(files.to_string().contains(&path), "{files}");
        assert_eq!(
            m.r.server.db.table_count(&m.id, "").unwrap(),
            0,
            "an attached file is not a message"
        );
        // The chat is another right: *Images*.
        let chat = m
            .ana
            .call("table_send_image", json!({ "base64": png }))
            .await;
        assert!(refused(&chat), "{chat}");
        // The note says so to the person who edits it.
        let read = m.ana.call("read_note", json!({ "path": "Livre.md" })).await;
        assert_eq!(read["ok"]["access"]["attach_image"], true, "{read}");
        assert_eq!(read["ok"]["access"]["attach"], false, "{read}");
    });
}

/// What a player is told of a path counts only what it sees: the files
/// under a folder, the secret blocks of a note, and the game master is
/// never named by an e-mail (the review of 2026-10-24).
#[test]
fn a_player_is_told_counts_of_what_it_sees_and_no_email() {
    block_on(async {
        let mut m = mesa().await;
        let made = m
            .owner
            .call(
                "create_note",
                json!({ "name": "Mundo Zq/Aberto Zq", "text": "x\n\n> [!secret]\n> zqsegredo\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let set = |whole: &str| json!({ "kind": "set", "set": { "whole": whole, "rows": [] }, "secret_name": null });
        for (path, whole) in [("Mundo Zq", "see"), ("Mundo Zq/Cripta Zq.md", "none")] {
            let done = m
                .owner
                .call(
                    "access_set",
                    json!({ "paths": [path], "change": set(whole) }),
                )
                .await;
            assert!(done.get("ok").is_some(), "{done}");
        }
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        m.r.server.db.set_profile(&admin.id, "", "pt").unwrap();
        let paths = json!({ "paths": ["Mundo Zq", "Mundo Zq/Aberto Zq.md"] });
        let mine = m.owner.call("access_get", paths.clone()).await;
        assert_eq!(mine["ok"][0]["files"], 2, "{mine}");
        assert_eq!(mine["ok"][1]["secret_blocks"], 1, "{mine}");
        let hers = m.ana.call("access_get", paths).await;
        assert_eq!(hers["ok"][0]["files"], 1, "{hers}");
        assert_eq!(hers["ok"][1]["secret_blocks"], 0, "{hers}");
        assert!(!hers.to_string().contains('@'), "{hers}");
        assert_eq!(hers["ok"][0]["master"], "", "{hers}");
        // A path that is not there cannot be given a set.
        let no = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq/Nao existe.md"], "change": set("see") }),
            )
            .await;
        assert!(refused(&no), "{no}");
    });
}

/// *Files* (ADR 0113 K.4, K.6) covers a PDF and audio: through the chat (a
/// `file` entry) and into a note one edits, with the same checks, the file
/// always written under the table's attachments place; and nothing without
/// the right. It is not *Images*: a picture is judged by the other right.
#[test]
fn send_files_covers_a_pdf_and_audio_in_the_chat_and_in_a_note() {
    use base64::Engine;
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        let b64 = |b: &[u8]| base64::engine::general_purpose::STANDARD.encode(b);
        let pdf = b64(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\n");
        let mp3 = b64(b"ID3\x04\0\0\0\0\0\0 audio");
        let ogg = b64(b"OggS\0\x02 audio");
        let html = b64(b"<html><script>1</script></html>");
        let joined = m
            .ana
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let edit = json!({ "kind": "set", "set": { "whole": "none",
            "rows": [{ "account": ana, "level": "edit" }] }, "secret_name": null });
        let g = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Livre.md"], "change": edit }),
            )
            .await;
        assert!(g.get("ok").is_some(), "{g}");
        // Without the right: nothing, in the chat or in the note (an image
        // goes into the note, it needs no right).
        for (what, data) in [("pdf", &pdf), ("audio", &mp3)] {
            let no = m
                .ana
                .call("table_send_image", json!({ "base64": data }))
                .await;
            assert!(refused(&no), "{what}: {no}");
            let no = m
                .ana
                .call(
                    "table_attach",
                    json!({ "base64": data, "into": "Livre.md" }),
                )
                .await;
            assert!(refused(&no), "{what}: {no}");
        }
        let given = m
            .owner
            .call(
                "table_rights_set",
                json!({ "root": "", "accounts": [ana], "right": "files", "on": true }),
            )
            .await;
        assert!(given.get("ok").is_some(), "{given}");
        // *Files* does not carry a picture to the chat: that is *Images*.
        let png = crate::tests_campaign::PNG;
        let pic = m
            .ana
            .call("table_send_image", json!({ "base64": png }))
            .await;
        assert!(refused(&pic), "{pic}");
        // In the chat: a file entry, written under the attachments place.
        for (data, ext) in [(&pdf, ".pdf"), (&mp3, ".mp3"), (&ogg, ".ogg")] {
            let sent = m
                .ana
                .call("table_send_image", json!({ "base64": data }))
                .await;
            assert_eq!(sent["ok"]["kind"], "file", "{sent}");
            let path = sent["ok"]["image"].as_str().unwrap_or_default();
            assert!(
                path.starts_with("attachments/mesa-") && path.ends_with(ext),
                "{path}"
            );
            let files = m.owner.call("list_files", json!({})).await;
            assert!(files.to_string().contains(path), "{files}");
        }
        // Into the note she edits: beside it, in `assets`.
        let made = m
            .ana
            .call("table_attach", json!({ "base64": pdf, "into": "Livre.md" }))
            .await;
        let path = made["ok"].as_str().unwrap_or_default();
        assert!(
            path.starts_with("assets/mesa-") && path.ends_with(".pdf"),
            "{made}"
        );
        // The same checks: a page is no file, whatever it is called.
        for call_ in [
            ("table_send_image", json!({ "base64": html })),
            (
                "table_attach",
                json!({ "base64": html, "into": "Livre.md" }),
            ),
        ] {
            let no = m.ana.call(call_.0, call_.1).await;
            assert!(refused(&no), "{no}");
        }
        // As a file she makes herself: the name must say what the bytes are.
        let lie = m
            .ana
            .call(
                "create_file",
                json!({ "path": "attachments/x.html", "base64": pdf }),
            )
            .await;
        assert!(refused(&lie), "{lie}");
        assert_eq!(
            m.r.server.db.table_count(&m.id, "").unwrap(),
            3,
            "three entries in the chat, the attached file is none"
        );
    });
}

/// A name is not a way round *Images* and *Files* (ADR 0113 K.4, K.6): a player who
/// makes a note in a folder they edit cannot rename it to a PDF, a page or
/// an SVG, nor write such a file with `write_text`, whatever the right.
#[test]
fn a_player_cannot_make_a_file_by_a_rename_or_a_text_write() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        let g = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq"], "change": { "kind": "set", "set": { "whole": "none",
                    "rows": [{ "account": ana, "level": "edit" }] }, "secret_name": null } }),
            )
            .await;
        assert!(g.get("ok").is_some(), "{g}");
        for right in [false, true] {
            if right {
                for given in ["images", "files"] {
                    let r = m
                        .owner
                        .call(
                            "table_rights_set",
                            json!({ "root": "", "accounts": [ana], "right": given, "on": true }),
                        )
                        .await;
                    assert!(r.get("ok").is_some(), "{r}");
                }
            }
            // A note keeps being a note under any name (the core adds .md);
            // a file she was let send keeps its kind: a rename to another
            // extension would serve the same bytes as a page or an SVG.
            if right {
                let sent = m
                    .ana
                    .call(
                        "create_file",
                        json!({ "path": "Mundo Zq/foto.png", "base64": crate::tests_campaign::PNG }),
                    )
                    .await;
                assert!(sent.get("ok").is_some(), "{sent}");
                for to in [
                    "Mundo Zq/foto.html",
                    "Mundo Zq/foto.svg",
                    "Mundo Zq/foto.pdf",
                    "Mundo Zq/foto.md",
                ] {
                    for cmd in ["rename_entry", "rename_note"] {
                        let no = m
                            .ana
                            .call(cmd, json!({ "from": "Mundo Zq/foto.png", "to": to }))
                            .await;
                        // (`rename_note` of a non-note names a note; the list below holds the proof.)
                        assert!(refused(&no) || cmd == "rename_note", "{cmd} {to}: {no}");
                    }
                }
                let files = m.owner.call("list_files", json!({})).await;
                let list = files.to_string();
                assert!(list.contains("foto.png"), "{list}");
                for bad in [".html", ".svg", ".pdf"] {
                    assert!(!list.contains(&format!("foto{bad}\"")), "{bad}: {list}");
                }
            }
            for path in [
                "Mundo Zq/novo.html",
                "Mundo Zq/novo.svg",
                "Mundo Zq/novo.pdf",
            ] {
                let no = m
                    .ana
                    .call(
                        "write_text",
                        json!({ "path": path, "text": "<script>1</script>", "revision": null }),
                    )
                    .await;
                assert!(refused(&no), "write_text {path} (right {right}): {no}");
                let files = m.owner.call("list_files", json!({})).await;
                assert!(!files.to_string().contains(path), "{path} exists: {files}");
            }
        }
    });
}

#[test]
fn file_ext_wants_a_real_mpeg_frame_for_an_mp3() {
    use crate::table::file_ext;
    assert_eq!(file_ext(&[0xff, 0xfb, 0x90, 0x00]), Some("mp3"));
    assert_eq!(file_ext(b"ID3\x04\0\0\0\0\0\0"), Some("mp3"));
    // A UTF-16 text starts FF FE; a reserved version or layer is none.
    assert_eq!(file_ext(&[0xff, 0xfe, b'h', 0, b'i', 0]), None);
    assert_eq!(file_ext(&[0xff, 0xe8, 0x90, 0x00]), None);
    assert_eq!(file_ext(&[0xff, 0xf9, 0x90, 0x00]), None);
}

/// *Manter* (the Access dialog's choice on a folder with files of their own):
/// with `keep_exceptions` the folder's set is replaced and a file with a set
/// of its own keeps it, in the one write, so it never follows the folder, not
/// even for a moment; without it everything inside is replaced as before.
#[test]
fn keep_exceptions_leaves_the_files_with_their_own_set_untouched() {
    block_on(async {
        let mut m = mesa().await;
        let set = |whole: &str, keep: bool| json!({ "kind": "set", "set": { "whole": whole, "rows": [] }, "secret_name": null, "keep_exceptions": keep });
        for (path, whole) in [("Mundo Zq", "see"), ("Mundo Zq/Cripta Zq.md", "none")] {
            let done = m
                .owner
                .call(
                    "access_set",
                    json!({ "paths": [path], "change": set(whole, false) }),
                )
                .await;
            assert!(done.get("ok").is_some(), "{done}");
        }
        let hidden_from_ana = |r: &Value| r.get("ok").is_none();
        let ana_sees = m
            .ana
            .call("access_get", json!({ "paths": ["Mundo Zq/Cripta Zq.md"] }))
            .await;
        assert!(hidden_from_ana(&ana_sees), "{ana_sees}");
        // Keep: the folder gives Edits to all, the hidden file stays hidden.
        let kept = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq"], "change": set("edit", true) }),
            )
            .await;
        assert!(kept.get("ok").is_some(), "{kept}");
        let file = m
            .owner
            .call(
                "access_get",
                json!({ "paths": ["Mundo Zq/Cripta Zq.md", "Mundo Zq"] }),
            )
            .await;
        assert_eq!(file["ok"][0]["own"]["whole"], "none", "{file}");
        assert_eq!(file["ok"][1]["own"]["whole"], "edit", "{file}");
        let ana_sees = m
            .ana
            .call("access_get", json!({ "paths": ["Mundo Zq/Cripta Zq.md"] }))
            .await;
        assert!(hidden_from_ana(&ana_sees), "{ana_sees}");
        // Without it: the file follows the folder again, as always.
        let all = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq"], "change": set("edit", false) }),
            )
            .await;
        assert!(all.get("ok").is_some(), "{all}");
        let file = m
            .owner
            .call("access_get", json!({ "paths": ["Mundo Zq/Cripta Zq.md"] }))
            .await;
        assert!(file["ok"][0]["own"].is_null(), "{file}");
    });
}
