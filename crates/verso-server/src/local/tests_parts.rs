// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder served in part (ADR 0096 item 2, amended 2026-10-16), as a
//! phone drives it: only the folders chosen inside `Campanha` reach the
//! phone, each as a folder of its own, by the confinement of a share. The
//! vault itself, and everything beside the chosen folders, stays out.

use serde_json::{Value, json};

use super::tests::{Lab, Ws, call, lab, next, run};
use super::{LocalSettings, allow};
use crate::db::Role;

/// The secret marker: it is in the notes outside the chosen folder, and no
/// answer to a phone may carry it.
pub(super) const NEEDLE: &str = "agulhasecreta";

pub(super) fn put(lab: &Lab, rel: &str, text: &str) {
    let at = lab.notes.path().join("Campanha").join(rel);
    crate::data::ensure_dir(at.parent().unwrap()).unwrap();
    crate::data::write_for_tests(&at, text);
}

pub(super) fn vault(lab: &Lab) -> String {
    lab.notes
        .path()
        .join("Campanha")
        .to_string_lossy()
        .into_owned()
}

/// `Campanha`: `Projetos` and `Diario` to be chosen, `Segredo` and a root
/// note never, and `Anexos` where the pictures are kept.
pub(super) fn lab_in_part(chosen: &[&str]) -> Lab {
    let lab = lab();
    put(
        &lab,
        "Raiz.md",
        &format!("# Raiz\n{NEEDLE} [[Segredo/c]]\n"),
    );
    put(
        &lab,
        "Projetos/a.md",
        "# A\nlinha de projeto #pro\n![[pic.png]]\n![[Segredo/x.png]]\n[[Segredo/c]]\n",
    );
    put(&lab, "Projetos/img.png", "png");
    put(&lab, "Projetos/Sub/s.md", "# S\nsub #pro\n");
    put(&lab, "Diario/b.md", "# B\ndiario #dia\n");
    put(
        &lab,
        "Segredo/c.md",
        &format!("# C\n{NEEDLE} #segredo\n[[a]]\n"),
    );
    put(&lab, "Segredo/x.png", "png");
    put(&lab, "Marcador/m.md", &format!("# M\n{NEEDLE}\n"));
    put(&lab, "Anexos/pic.png", "png");
    put(&lab, "Anexos/outra.png", "png");
    put(&lab, "Anexos/nota.md", "# Nota dos anexos\nanexonota\n");
    // The vault's own setting: the one folder that goes along.
    put(
        &lab,
        ".obsidian/app.json",
        r#"{"attachmentFolderPath":"Anexos"}"#,
    );
    set_chosen(&lab, chosen);
    lab
}

fn set_chosen(lab: &Lab, chosen: &[&str]) {
    let mut settings = lab.local.settings().unwrap();
    settings.parts.clear();
    if !chosen.is_empty() {
        settings
            .parts
            .insert(vault(lab), chosen.iter().map(|s| (*s).to_owned()).collect());
    }
    lab.local.set_settings(&settings).unwrap();
}

pub(super) async fn folders(lab: &Lab, cookie: &str) -> Vec<Value> {
    let (_, mine) = lab.get("/api/folders", Some(cookie)).await;
    mine["folders"].as_array().unwrap().clone()
}

async fn connected(lab: &Lab, cookie: &str) -> Ws {
    let mut ws = lab.connect(cookie).await.unwrap();
    let hello = next(&mut ws).await;
    assert!(hello.get("hello").is_some(), "{hello}");
    ws
}

/// A phone with `name`'s share open.
pub(super) async fn open_part(lab: &Lab, cookie: &str, name: &str) -> Ws {
    let list = folders(lab, cookie).await;
    let id = list
        .iter()
        .find(|f| f["name"] == name)
        .unwrap_or_else(|| panic!("no folder {name} in {list:?}"))["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut ws = connected(lab, cookie).await;
    let info = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert_eq!(info["ok"]["name"], name, "{info}");
    ws
}

/// The id the vault itself has in the phone's database.
fn vault_id(lab: &Lab) -> String {
    let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
    db.folder_by_dir("Campanha").unwrap().unwrap().id
}

/// Every chosen folder is a folder of the phone's own, named as on the
/// computer; the vault is not among them and no path shows.
#[test]
fn each_chosen_folder_is_a_folder_of_its_own_and_the_vault_is_not() {
    run(async {
        let mut lab = lab_in_part(&["Projetos", "Diario"]);
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let list = folders(&lab, &cookie).await;
        let names: Vec<&str> = list.iter().map(|f| f["name"].as_str().unwrap()).collect();
        assert_eq!(names.len(), 2, "{list:?}");
        assert!(
            names.contains(&"Projetos") && names.contains(&"Diario"),
            "{names:?}"
        );
        assert!(
            list.iter()
                .all(|f| f["share"] == true && f["role"] == "editor")
        );
        let said = serde_json::to_string(&list).unwrap();
        assert!(!said.contains("Campanha") && !said.contains(lab.notes.path().to_str().unwrap()));
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        let notes = call(&mut ws, 2, "list_notes", json!({})).await;
        assert_eq!(notes["ok"], json!(["Sub/s.md", "a.md"]));
        let _ = ();
        let info = call(&mut ws, 3, "current_folder", json!({})).await;
        assert_eq!(info["ok"]["name"], "Projetos", "{info}");
    });
}

/// Two chosen folders of one name, in different places, are told apart as
/// the switcher does: `Notas`, `Notas (2)`.
#[test]
fn two_chosen_folders_of_one_name_are_made_unique() {
    run(async {
        let mut lab = lab_in_part(&["A/Notas", "B/Notas"]);
        put(&lab, "A/Notas/x.md", "# x\n");
        put(&lab, "B/Notas/y.md", "# y\n");
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let list = folders(&lab, &cookie).await;
        let mut names: Vec<&str> = list.iter().map(|f| f["name"].as_str().unwrap()).collect();
        names.sort_unstable();
        assert_eq!(names, ["Notas", "Notas (2)"]);
    });
}

/// The vault's own id opens nothing for a phone, by any door: the window's
/// command, a key kept from before, its files, and a share's `..`.
#[test]
fn the_vault_itself_opens_nothing_for_a_phone() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let id = vault_id(&lab);
        let mut ws = connected(&lab, &cookie).await;
        let by_id = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert!(by_id.get("err").is_some(), "{by_id}");
        let key = verso_core::folder_key(&lab.notes.path().join("Campanha"));
        let by_key = call(&mut ws, 2, "reopen_folder", json!({ "key": key })).await;
        assert!(by_key.get("err").is_some(), "{by_key}");
        // Nothing was opened by those: the folder commands have none.
        let none = call(&mut ws, 3, "list_notes", json!({})).await;
        assert!(none.get("err").is_some(), "{none}");
        // Its files, by the vault's id.
        for path in ["Segredo/c.md", "Projetos/a.md", "Raiz.md"] {
            let (status, _) = lab.get(&format!("/f/{id}/{path}"), Some(&cookie)).await;
            assert_eq!(status, 404, "/f/<vault>/{path}");
        }
        // Its files, by a share's id (open, as the files are served from an
        // open folder) and a way out of the share.
        let _open = open_part(&lab, &cookie, "Projetos").await;
        let share = folders(&lab, &cookie).await[0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        for path in [
            "%2e%2e/Segredo/c.md",
            "..%2fSegredo%2fc.md",
            "%2e%2e%2fRaiz.md",
            "Sub%2f..%2f..%2fRaiz.md",
            "Segredo/c.md",
        ] {
            let (status, body) = lab.get(&format!("/f/{share}/{path}"), Some(&cookie)).await;
            assert_ne!(status, 200, "/f/<share>/{path}: {body}");
            assert!(!body.to_string().contains(NEEDLE));
        }
        // And what is inside is served.
        let (status, _) = lab.get(&format!("/f/{share}/img.png"), Some(&cookie)).await;
        assert_eq!(status, 200);
    });
}

/// The second lock: even a grant of the vault to the phones' account made
/// by mistake does not let a phone in.
#[test]
fn a_grant_of_the_vault_by_mistake_still_opens_nothing() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let id = vault_id(&lab);
        let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
        let owner = db.local_owner().unwrap();
        db.grant(&id, &owner.id, Role::Owner).unwrap();
        let mut ws = connected(&lab, &cookie).await;
        let by_id = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert!(by_id.get("err").is_some(), "{by_id}");
        let (status, _) = lab.get(&format!("/f/{id}/Raiz.md"), Some(&cookie)).await;
        assert_eq!(status, 404);
    });
}

/// What a phone reads of a chosen folder is the folder: its notes, files,
/// tags, links, backlinks, graph, search and the folders' list — nothing
/// beside it, not even by name.
#[test]
fn a_chosen_folder_reads_only_itself() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        let mut id = 10;
        let mut ask = async |cmd: &str, args: Value| {
            id += 1;
            call(&mut ws, id, cmd, args).await
        };
        let tags = ask("list_tags", json!({})).await;
        assert_eq!(tags["ok"].as_array().unwrap().len(), 1, "{tags}");
        assert_eq!(tags["ok"][0]["name"], "pro");
        let hits = ask("search", json!({ "words": NEEDLE, "limit": 20 })).await;
        assert_eq!(hits["ok"], json!([]), "{hits}");
        let hits = ask("search", json!({ "words": "projeto", "limit": 20 })).await;
        assert_eq!(hits["ok"][0]["path"], "a.md", "{hits}");
        let back = ask("backlinks", json!({ "path": "a.md" })).await;
        assert_eq!(back["ok"], json!([]), "Segredo/c links to a: {back}");
        let graph = ask("graph", json!({})).await;
        assert!(!graph.to_string().contains("Segredo"), "{graph}");
        let folders = ask("list_folders", json!({})).await;
        // The attachments folder the notes embed from goes along, read-only.
        assert_eq!(folders["ok"], json!(["Anexos", "Sub"]), "{folders}");
        let files = ask("list_files", json!({})).await;
        assert!(!files.to_string().contains("Raiz"), "{files}");
        let links = ask("links", json!({ "path": "a.md" })).await;
        let outside = links["ok"]
            .as_array()
            .unwrap()
            .iter()
            .find(|l| l["target"] == "Segredo/c")
            .unwrap();
        assert_eq!(outside["resolved"], Value::Null, "{links}");
        for path in [
            "../Raiz.md",
            "../Segredo/c.md",
            "Segredo/c.md",
            "/etc/passwd",
            "",
        ] {
            let r = ask("read_note", json!({ "path": path })).await;
            assert!(r.get("err").is_some(), "{path}: {r}");
        }
    });
}

/// The attachments the notes embed from outside the chosen folder go with
/// it, read-only, at its root under their own name; the rest of the vault
/// stays out, and nothing can be written there.
#[test]
fn the_attachments_folder_goes_along_as_files_only_and_read_only() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        let share = folders(&lab, &cookie).await[0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let strings = |v: &Value| -> Vec<String> {
            v["ok"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| f.as_str().unwrap().to_owned())
                .collect()
        };
        // Files, yes; a note, a board or a base of that folder, never.
        let files = strings(&call(&mut ws, 2, "list_files", json!({})).await);
        assert!(files.contains(&"Anexos/pic.png".to_owned()), "{files:?}");
        let notes = strings(&call(&mut ws, 3, "list_notes", json!({})).await);
        assert!(notes.iter().all(|n| !n.starts_with("Anexos/")), "{notes:?}");
        let found = call(
            &mut ws,
            4,
            "search",
            json!({ "words": "anexonota", "limit": 20 }),
        )
        .await;
        assert_eq!(found["ok"], json!([]), "{found}");
        for (cmd, args) in [
            ("read_note", json!({ "path": "Anexos/nota.md" })),
            ("read_text", json!({ "path": "Anexos/nota.md" })),
            ("read_file_text", json!({ "path": "Anexos/nota.md" })),
            ("links", json!({ "path": "Anexos/nota.md" })),
            ("backlinks", json!({ "path": "Anexos/nota.md" })),
        ] {
            let r = call(&mut ws, 5, cmd, args).await;
            assert!(
                r.get("err").is_some(),
                "{cmd} on a note of the attachments folder: {r}"
            );
        }
        let (status, _) = lab
            .get(&format!("/f/{share}/Anexos/nota.md"), Some(&cookie))
            .await;
        assert_ne!(status, 200, "a note through the files route");
        // A file is read through the mount; nothing is written there.
        let (status, _) = lab
            .get(&format!("/f/{share}/Anexos/pic.png"), Some(&cookie))
            .await;
        assert_eq!(status, 200);
        for (cmd, args) in [
            (
                "create_file",
                json!({ "path": "Anexos/novo.png", "base64": "AQ==" }),
            ),
            ("create_note", json!({ "name": "Anexos/n.md", "text": "x" })),
            (
                "write_text",
                json!({ "path": "Anexos/outra.png", "text": "x", "revision": "r" }),
            ),
            ("delete_entry", json!({ "path": "Anexos/pic.png" })),
            (
                "rename_entry",
                json!({ "from": "Anexos/pic.png", "to": "Anexos/q.png" }),
            ),
            (
                "rename_entry",
                json!({ "from": "a.md", "to": "Anexos/a.md" }),
            ),
            ("create_folder", json!({ "path": "Anexos/x" })),
        ] {
            let r = call(&mut ws, 20, cmd, args).await;
            assert!(r.get("err").is_some(), "{cmd} through the mount: {r}");
        }
        assert!(has(&lab, "Anexos/pic.png"));
        assert!(!has(&lab, "Anexos/novo.png"));
        // The mount is the one folder; the rest of the vault is not there.
        let all = call(&mut ws, 21, "list_entries", json!({}))
            .await
            .to_string();
        assert!(
            !all.contains("Segredo") && !all.contains("Raiz") && !all.contains("nota.md"),
            "{all}"
        );
        assert_eq!(attachments_of(&lab).as_deref(), Some("Anexos"));
    });
}

/// The folder that goes along is the vault's own setting, fixed at the
/// start: a note a phone writes that embeds from another folder steers
/// nothing, and the reader gets no note of the folder it points at.
#[test]
fn what_a_phone_writes_cannot_choose_the_attachments_folder() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let editor = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let reader = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        // `a.md` already embeds `Segredo/x.png`; the editor writes more.
        let mut e = open_part(&lab, &editor, "Projetos").await;
        for (i, name) in ["e1.md", "e2.md", "e3.md", "e4.md", "e5.md"]
            .iter()
            .enumerate()
        {
            let made = call(
                &mut e,
                2 + i as u64,
                "create_note",
                json!({ "name": name, "text": "![[Segredo/x.png]] ![[Segredo/c]]\n" }),
            )
            .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        drop(e);
        let mut r = open_part(&lab, &reader, "Projetos").await;
        let notes = call(&mut r, 2, "list_notes", json!({})).await.to_string();
        assert!(
            !notes.contains("Segredo/") && !notes.contains("c.md"),
            "{notes}"
        );
        let read = call(&mut r, 3, "read_note", json!({ "path": "Segredo/c.md" })).await;
        assert!(read.get("err").is_some(), "{read}");
        let found = call(&mut r, 4, "search", json!({ "words": NEEDLE, "limit": 20 })).await;
        assert_eq!(found["ok"], json!([]), "{found}");
        assert_eq!(attachments_of(&lab).as_deref(), Some("Anexos"));
    });
}

/// The vault's setting decides, read again at every start: a value kept
/// from before is replaced, and a setting that names no folder of the
/// vault outside the chosen ones leaves none.
#[test]
fn the_attachments_folder_is_the_vaults_setting_read_at_each_start() {
    run(async {
        for (setting, want) in [
            (r#"{"attachmentFolderPath":"Anexos"}"#, Some("Anexos")),
            (r#"{"attachmentFolderPath":"/Anexos/"}"#, Some("Anexos")),
            (r#"{"attachmentFolderPath":"Segredo"}"#, Some("Segredo")),
            (r#"{"attachmentFolderPath":"/"}"#, None),
            (r#"{"attachmentFolderPath":""}"#, None),
            (r#"{"attachmentFolderPath":"./"}"#, None),
            (r#"{"attachmentFolderPath":"./imagens"}"#, None),
            (r#"{"attachmentFolderPath":"Anexos/../Segredo"}"#, None),
            (r#"{"attachmentFolderPath":".obsidian"}"#, None),
            // Inside, or holding, a chosen folder.
            (r#"{"attachmentFolderPath":"Projetos/Sub"}"#, None),
            // Not on the disk.
            (r#"{"attachmentFolderPath":"Inexistente"}"#, None),
            ("{}", None),
            ("not json", None),
        ] {
            let mut lab = lab_in_part(&["Projetos"]);
            put(&lab, ".obsidian/app.json", setting);
            lab.serve();
            assert_eq!(attachments_of(&lab).as_deref(), want, "{setting}");
        }
        // A kept value is replaced at the next start, and cleared with the setting.
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        assert_eq!(attachments_of(&lab).as_deref(), Some("Anexos"));
        lab.local.stop();
        let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
        let share = db.shares_of(&vault_id(&lab)).unwrap().remove(0);
        db.set_share_attachments(&share.id, Some("Segredo"))
            .unwrap();
        lab.serve();
        assert_eq!(attachments_of(&lab).as_deref(), Some("Anexos"));
        lab.local.stop();
        put(&lab, ".obsidian/app.json", "{}");
        lab.serve();
        assert_eq!(attachments_of(&lab), None);
    });
}

/// The attachments folder of the chosen folder `Projetos`, as kept.
fn attachments_of(lab: &Lab) -> Option<String> {
    let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
    db.shares_of(&vault_id(lab))
        .unwrap()
        .into_iter()
        .find(|s| s.path == "Projetos")
        .unwrap()
        .attachments
}

/// The phone's role bounds what it does inside the chosen folder: an
/// editor writes there, a reader does not.
#[test]
fn an_editor_writes_inside_and_a_reader_does_not() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let editor = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let reader = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let mut e = open_part(&lab, &editor, "Projetos").await;
        let made = call(
            &mut e,
            2,
            "create_note",
            json!({ "name": "Nova.md", "text": "# n\n" }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
        assert!(has(&lab, "Projetos/Nova.md"));
        let outside = call(
            &mut e,
            3,
            "create_note",
            json!({ "name": "../Nova.md", "text": "# n\n" }),
        )
        .await;
        assert!(outside.get("err").is_some(), "{outside}");
        assert!(!has(&lab, "Nova.md"));
        let mut r = open_part(&lab, &reader, "Projetos").await;
        for (cmd, args) in [
            (
                "create_note",
                json!({ "name": "Outra.md", "text": "# o\n" }),
            ),
            ("delete_note", json!({ "path": "a.md" })),
        ] {
            let denied = call(&mut r, 2, cmd, args).await;
            assert_eq!(denied["err"]["kind"], "phone_reads", "{cmd}: {denied}");
        }
        assert!(has(&lab, "Projetos/a.md"));
    });
}

/// What each command of the phones' allowlist does on a chosen folder, with
/// arguments that are valid for it: `true` when it answers (inside the
/// folder, in the share's own paths), `false` when the share refuses it.
/// `{rev}` is the revision of `a.md`, read first. A command added to the
/// allowlist has to be given a row here (the table test below), and the
/// verdict is the one these rows say or this test fails.
const VERDICTS: &[(&str, &str, bool)] = &[
    ("pick_folder", "{}", true),
    ("open_initial", "{}", true),
    ("current_folder", "{}", true),
    ("capabilities", "{}", true),
    ("app_info", "{}", true),
    ("reindex", "{}", true),
    ("render_markdown", r#"{"text":"oi"}"#, true),
    ("project_secrets", r#"{"text":"oi"}"#, true),
    ("project_board", r#"{"text":"{}"}"#, true),
    ("board_text", r#"{"json":"{}"}"#, true),
    ("list_notes", "{}", true),
    ("read_note", r#"{"path":"a.md"}"#, true),
    ("notes_of_type", r#"{"name":"x"}"#, true),
    ("search", r#"{"words":"projeto","limit":10}"#, true),
    ("links", r#"{"path":"a.md"}"#, true),
    ("backlinks", r#"{"path":"a.md"}"#, true),
    ("unlinked_mentions", r#"{"path":"a.md"}"#, true),
    ("list_files", "{}", true),
    ("list_tags", "{}", true),
    ("list_block_ids", r#"{"kinds":["table","list"]}"#, true),
    ("list_web_notes", "{}", true),
    ("graph", "{}", true),
    // A share refuses it: told apart from a link that resolves outside the
    // share, a missing name would say whether a note of that name exists
    // outside (ADR 0081 item 11).
    ("graph_unresolved", "{}", false),
    ("list_folders", "{}", true),
    ("read_file_text", r#"{"path":"a.md"}"#, true),
    (
        "resolve_attachment",
        r#"{"source":"a.md","target":"img.png"}"#,
        true,
    ),
    ("list_entries", "{}", true),
    ("read_text", r#"{"path":"a.md"}"#, true),
    ("board_preview", r#"{"path":"a.md"}"#, false),
    ("map_open", r#"{"path":"a.md"}"#, true),
    ("map_tile", r#"{"path":"a.md","z":0,"x":0,"y":0}"#, false),
    (
        "query_base",
        r#"{"query":{"path":"a.md","this":"a.md"}}"#,
        false,
    ),
    ("get_focuses", "{}", true),
    ("can_sync_focuses", "{}", true),
    ("folder_space", "{}", true),
    ("get_folder_settings", "{}", true),
    ("get_obsidian_periodic", "{}", true),
    ("list_folder_data", r#"{"kind":"layouts"}"#, true),
    ("read_folder_data", r#"{"kind":"layouts","id":"x"}"#, false),
    ("collab_join", r#"{"path":"a.md"}"#, true),
    ("collab_leave", r#"{"path":"a.md"}"#, true),
    (
        "collab_awareness",
        r#"{"path":"a.md","update":"AA"}"#,
        false,
    ),
    ("collab_present", r#"{"path":"a.md"}"#, true),
    ("set_embed_origins", r#"{"origins":[]}"#, true),
    ("set_menu_language", r#"{"lang":"pt"}"#, true),
    ("note_made_from_template", r#"{"path":"a.md"}"#, true),
    ("set_history_days", r#"{"days":1}"#, true),
    ("fetch_file", r#"{"url":"x"}"#, true),
    ("fetch_focuses_file", "{}", true),
    ("set_walk_rules", "{}", true),
    ("set_folder_note_name", "{}", true),
    ("log_write", r#"{"level":"INFO","message":"m"}"#, true),
    ("embed_frameable", r#"{"url":"https://example.com"}"#, true),
    (
        "write_note",
        r#"{"path":"a.md","text":"A mudou","revision":"{rev}"}"#,
        true,
    ),
    ("create_note", r#"{"name":"Nova.md","text":"n"}"#, true),
    (
        "create_file",
        r#"{"path":"novo.png","base64":"AQ=="}"#,
        true,
    ),
    ("create_folder", r#"{"path":"Pasta"}"#, true),
    // A phone is an editor of the chosen folder, signed in as the folder's
    // owner: outside a table the owner deletes, even on a folder served in
    // part (ADR 0113 section B, amended 2026-11-01: "celular do dono apaga
    // sempre").
    ("delete_note", r#"{"path":"a.md"}"#, true),
    ("rename_note", r#"{"from":"a.md","to":"b.md"}"#, true),
    (
        "rename_entry",
        r#"{"from":"img.png","to":"img2.png"}"#,
        true,
    ),
    (
        "move_entries",
        r#"{"folder":"Sub","paths":["img.png"]}"#,
        true,
    ),
    ("delete_entry", r#"{"path":"img.png"}"#, true),
    (
        "write_text",
        r#"{"path":"a.md","text":"t","revision":"{rev}"}"#,
        true,
    ),
    (
        "write_board",
        r#"{"path":"q.canvas","json":"{}","revision":""}"#,
        false,
    ),
    (
        "write_folder_data",
        r#"{"kind":"layouts","id":"x","text":"{}","revision":null}"#,
        false,
    ),
    (
        "remove_folder_data",
        r#"{"kind":"layouts","id":"x","revision":"r"}"#,
        false,
    ),
    ("set_focuses", r#"{"focuses":[],"stamp":null}"#, false),
    ("collab_update", r#"{"path":"a.md","update":"AA"}"#, false),
    ("collab_save", r#"{"path":"a.md"}"#, false),
    ("collab_resolve", r#"{"path":"a.md","keep":"mine"}"#, false),
    (
        "collab_canvas",
        r#"{"path":"q.canvas","at":"x","json":"{}"}"#,
        false,
    ),
    (
        "collab_roll",
        r#"{"path":"a.md","notation":"1d6","source":null}"#,
        false,
    ),
    (
        "collab_oracle",
        r#"{"path":"a.md","ask":{"kind":"table","entries":["a","b"]}}"#,
        false,
    ),
    ("table_join", r#"{"color":null,"styles":null}"#, false),
    ("table_leave", "{}", false),
    ("table_look", r#"{"color":null,"styles":null}"#, false),
    ("table_history", r#"{"before":null,"limit":null}"#, false),
    ("table_say", r#"{"text":"oi"}"#, false),
    ("table_send_image", r#"{"base64":""}"#, false),
    (
        "table_attach",
        r#"{"base64":"","into":"a.md","sub":"assets"}"#,
        false,
    ),
    (
        "table_roll",
        r#"{"notation":"1d6","source":null,"path":null,"secret":null,"styles":null}"#,
        false,
    ),
    ("table_pin", r#"{"id":"1","pinned":true}"#, false),
    ("table_delete", r#"{"id":"1"}"#, false),
    ("table_time", "{}", false),
    (
        "table_cannot_play",
        r#"{"channel":"music","revision":1}"#,
        false,
    ),
    ("table_share_listen", r#"{"listen":true}"#, false),
    ("campaign_status", "{}", true),
    ("trash_list", "{}", true),
    (
        "trash_restore",
        r#"{"path":"nada","today":"2026-10-16"}"#,
        false,
    ),
    (
        "trash_delete",
        r#"{"path":"nada","today":"2026-10-16"}"#,
        false,
    ),
    ("history_list", r#"{"path":"a.md"}"#, true),
    ("history_read", r#"{"path":"a.md","id":"x"}"#, false),
    ("history_restore", r#"{"path":"a.md","id":"x"}"#, false),
    ("history_copy", r#"{"path":"a.md","id":"x"}"#, false),
];

/// The same commands asked with a way out of the folder, and with a path
/// that is not a path: each is refused or answers without anything of the
/// vault beyond the chosen folder. None of these names the folders
/// `Marcador` or `Segredo`, nor `Raiz`: if one comes back in a reply it
/// came from the disk, not from what was asked.
const OUTSIDE: &[&str] = &[
    "../x.md",
    "../../x.md",
    "/x.md",
    "Sub/../../x.md",
    "..",
    ".",
];

/// Paths that are not outside by their look: a note of the attachments
/// folder, and (on Unix) links in the folder that lead to the vault's other
/// folders, in the case the file system folds too.
#[cfg(target_os = "macos")]
const LINKED: &[&str] = &[
    "Anexos/nota.md",
    "Anexos/NOTA.MD",
    "dir/c.md",
    "DIR/c.md",
    "Sub/f.md",
    "SUB/F.MD",
];
#[cfg(all(unix, not(target_os = "macos")))]
const LINKED: &[&str] = &["Anexos/nota.md", "Anexos/NOTA.MD", "dir/c.md", "Sub/f.md"];
#[cfg(not(unix))]
const LINKED: &[&str] = &["Anexos/nota.md", "Anexos/NOTA.MD"];

/// What the vault outside the chosen folder holds, that no reply may say.
pub(super) const NEVER_SAID: &[&str] = &[
    "Marcador",
    "Raiz",
    "Segredo/c.md",
    "agulhasecreta",
    "anexonota",
];

fn args_for(template: &str, rev: &str) -> Value {
    serde_json::from_str(&template.replace("{rev}", rev)).unwrap()
}

/// Every command a phone may run, on its own fresh server so that a write
/// really runs inside the folder, answers as the table says, in the
/// share's paths, with nothing of the vault outside the folder in any
/// reply — and leaves the vault outside it as it was, but for the links a
/// rename rewrites there (the maintainer's decision, 2026-10-16), which
/// the phone is never told.
#[test]
fn every_command_a_phone_may_run_behaves_as_the_table_says_on_a_chosen_folder() {
    run(async {
        let mut ours: Vec<&str> = VERDICTS.iter().map(|(c, _, _)| *c).collect();
        ours.sort_unstable();
        for cmd in allow::READ.iter().chain(allow::EDIT.iter()) {
            if !matches!(*cmd, "open_server_folder" | "reopen_folder") {
                assert!(
                    ours.binary_search(cmd).is_ok(),
                    "{cmd} has no row in VERDICTS"
                );
            }
        }
        let mut seen = Vec::new();
        let mut wrong: Vec<String> = Vec::new();
        for (cmd, template, answers) in VERDICTS {
            let mut lab = lab_in_part(&["Projetos"]);
            #[cfg(unix)]
            {
                let at = |rel: &str| lab.notes.path().join("Campanha").join(rel);
                verso_fs::link_for_tests(std::path::Path::new("../Segredo"), &at("Projetos/dir"))
                    .unwrap();
                verso_fs::link_for_tests(
                    std::path::Path::new("../../Segredo/c.md"),
                    &at("Projetos/Sub/f.md"),
                )
                .unwrap();
            }
            lab.serve();
            let cookie = lab.pair("iPad", true, Role::Editor).await.unwrap();
            let before = outside_snapshot(&lab);
            let mut ws = open_part(&lab, &cookie, "Projetos").await;
            let note = call(&mut ws, 2, "read_note", json!({ "path": "a.md" })).await;
            let rev = note["ok"]["revision"].as_str().unwrap().to_owned();
            // Inside, valid: the verdict.
            let reply = call(&mut ws, 3, cmd, args_for(template, &rev)).await;
            let text = reply.to_string();
            for never in NEVER_SAID {
                assert!(!text.contains(never), "{cmd}: said {never}: {text}");
            }
            if reply.get("ok").is_some() != *answers {
                wrong.push(format!("{cmd}: {reply}"));
            }
            seen.push(format!(
                "{cmd}: {}",
                if *answers { "scoped" } else { "refused" }
            ));
            // A way out of the folder: refused, whatever the command.
            const PATHS: [&str; 6] = ["path", "from", "to", "name", "source", "folder"];
            let valid = args_for(template, &rev);
            let has_path = valid.as_object().is_some_and(|o| {
                PATHS.iter().any(|k| o.contains_key(*k)) || o.contains_key("paths")
            });
            for out in OUTSIDE.iter().chain(LINKED) {
                let mut args = valid.clone();
                if let Some(q) = args.get_mut("query").and_then(Value::as_object_mut) {
                    for key in ["path", "this"] {
                        q.insert(key.to_owned(), json!(out));
                    }
                }
                if let Some(o) = args.as_object_mut() {
                    for key in PATHS {
                        if o.contains_key(key) {
                            o.insert(key.to_owned(), json!(out));
                        }
                    }
                    if o.contains_key("paths") {
                        o.insert("paths".to_owned(), json!([out]));
                    }
                }
                let reply = call(&mut ws, 4, cmd, args).await;
                let text = reply.to_string();
                for never in NEVER_SAID {
                    assert!(!text.contains(never), "{cmd} {out}: said {never}: {text}");
                }
                // `notes_of_type` has a name, not a path; `note_made_from_template` is
                // answered without acting, whatever it is asked.
                if has_path && !matches!(*cmd, "notes_of_type" | "note_made_from_template") {
                    assert!(reply.get("err").is_some(), "{cmd} {out} answered: {reply}");
                }
            }
            let after = outside_snapshot(&lab);
            if *cmd == "rename_note" {
                // The link `[[a]]` in a note outside is rewritten to follow
                // the rename, as on the desktop; nothing else changes.
                let changed: Vec<&str> = after
                    .iter()
                    .filter(|f| !before.contains(f))
                    .map(|(p, _)| p.as_str())
                    .collect();
                // (With a link in the folder the core may leave the rewrite undone;
                // the dedicated rename test has none and sees it made.)
                assert!(
                    changed.iter().all(|p| *p == "Segredo/c.md"),
                    "{cmd}: {changed:?}"
                );
            } else {
                assert_eq!(before, after, "{cmd} wrote outside the chosen folder");
            }
        }
        println!("{}", seen.join("\n"));
        assert!(
            wrong.is_empty(),
            "verdicts that are not the table's:\n{}",
            wrong.join("\n")
        );
    });
}

/// Every file of the vault as the walk sees it, with its bytes — read
/// through `verso-fs`, the only crate that touches a folder's files.
pub(super) fn on_disk(lab: &Lab) -> Vec<(String, Vec<u8>)> {
    let mut root = verso_fs::Root::open(lab.notes.path().join("Campanha"), Vec::new()).unwrap();
    let walk = root.walk();
    let mut out: Vec<(String, Vec<u8>)> = walk
        .entries
        .iter()
        .filter(|e| !matches!(e.kind, verso_fs::EntryKind::Directory))
        .map(|e| {
            let rel = e.relative.to_string_lossy().replace('\\', "/");
            (rel, root.read(e.handle).unwrap().0)
        })
        .collect();
    out.sort();
    out
}

/// One file of the vault by its path — through a handle, so that a folder
/// the walk lists once under another name (a link to it) is still read.
pub(super) fn read_disk(lab: &Lab, rel: &str) -> Option<Vec<u8>> {
    let mut root = verso_fs::Root::open(lab.notes.path().join("Campanha"), Vec::new()).unwrap();
    let handle = root.handle(std::path::Path::new(rel)).ok()?;
    root.read(handle).ok().map(|r| r.0)
}

pub(super) fn has(lab: &Lab, rel: &str) -> bool {
    on_disk(lab).iter().any(|(p, _)| p == rel)
}

/// Everything under the vault but the chosen folder, with its bytes. The
/// walk lists a folder once, under the first name a link gives it, so the
/// files the fixtures hold are also read by name.
fn outside_snapshot(lab: &Lab) -> Vec<(String, Vec<u8>)> {
    let mut out: Vec<(String, Vec<u8>)> = on_disk(lab)
        .into_iter()
        .filter(|(rel, _)| !(rel == "Projetos" || rel.starts_with("Projetos/")))
        .collect();
    for known in [
        "Raiz.md",
        "Segredo/c.md",
        "Segredo/x.png",
        "Marcador/m.md",
        "Diario/b.md",
        "Anexos/pic.png",
        "Anexos/outra.png",
        "Anexos/nota.md",
    ] {
        if let Some(bytes) = read_disk(lab, known)
            && !out.iter().any(|(p, _)| p == known)
        {
            out.push((known.to_owned(), bytes));
        }
    }
    out.sort();
    out
}

/// Changing what is chosen takes effect at the next start: a share no
/// longer chosen is gone, a new one is there; and a folder chosen back to
/// whole is the vault again, with nothing of its parts left.
#[test]
fn a_change_of_choice_is_followed_at_the_next_start() {
    run(async {
        let mut lab = lab_in_part(&["Projetos", "Diario"]);
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        assert_eq!(folders(&lab, &cookie).await.len(), 2);
        let old = vault_id(&lab);
        lab.local.stop();
        set_chosen(&lab, &["Diario"]);
        lab.serve();
        let list = folders(&lab, &cookie).await;
        assert_eq!(list.len(), 1, "{list:?}");
        assert_eq!(list[0]["name"], "Diario");
        assert_eq!(vault_id(&lab), old, "the registered folder is kept");
        lab.local.stop();
        set_chosen(&lab, &[]);
        lab.serve();
        let list = folders(&lab, &cookie).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["name"], "Campanha");
        assert_eq!(list[0]["share"], false);
        let mut ws = open_part_whole(&lab, &cookie).await;
        let notes = call(&mut ws, 2, "list_notes", json!({})).await;
        assert!(notes.to_string().contains("Segredo/c.md"), "{notes}");
        // And back to a part: the vault is hidden again.
        lab.local.stop();
        set_chosen(&lab, &["Projetos"]);
        lab.serve();
        let list = folders(&lab, &cookie).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["name"], "Projetos");
        let mut ws = connected(&lab, &cookie).await;
        let by_id = call(
            &mut ws,
            1,
            "open_server_folder",
            json!({ "id": vault_id(&lab) }),
        )
        .await;
        assert!(by_id.get("err").is_some(), "{by_id}");
    });
}

async fn open_part_whole(lab: &Lab, cookie: &str) -> Ws {
    let id = folders(lab, cookie).await[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut ws = connected(lab, cookie).await;
    let info = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert_eq!(info["ok"]["name"], "Campanha", "{info}");
    ws
}

/// A folder served in part whose chosen folders are all gone does not start
/// as the whole vault in their place.
#[test]
fn it_will_not_start_whole_when_nothing_chosen_is_left() {
    run(async {
        let lab = lab_in_part(&["Projetos"]);
        let mut root = verso_fs::Root::open(lab.notes.path().join("Campanha"), Vec::new()).unwrap();
        let _report = root.trash(std::path::Path::new("Projetos")).unwrap();
        let err = lab.local.start().unwrap_err();
        assert!(err.contains("none of the folders chosen"), "{err}");
        assert!(!lab.local.status().unwrap().serving);
    });
}

/// The choice is kept like the rest of the settings, is refused while
/// serving, and a settings file from before it still loads whole.
#[test]
fn the_choice_is_a_setting_that_waits_for_serving_to_be_off() {
    run(async {
        let mut lab = lab();
        let old: LocalSettings = serde_json::from_str(
            r#"{"keepOn":true,"folders":["/x"],"certFile":null,"keyFile":null,"hostName":null,"maxConnected":4}"#,
        )
        .unwrap();
        assert!(old.parts.is_empty());
        let path = vault(&lab);
        let kept = lab
            .local
            .set_parts(&path, &["B".to_owned(), "A/".to_owned(), "A/C".to_owned()])
            .unwrap();
        assert_eq!(kept, ["A", "B"]);
        assert_eq!(lab.local.settings().unwrap().parts[&path], ["A", "B"]);
        assert!(lab.local.set_parts(&path, &["../x".to_owned()]).is_err());
        assert!(
            lab.local
                .set_parts("/not/ticked", &["A".to_owned()])
                .is_err()
        );
        // Unticking the last chosen folder stops serving the folder, and its
        // choice goes (the maintainer, 2026-10-16: "Para de servir o cofre");
        // the whole folder is a separate, explicit act.
        lab.local.set_parts(&path, &[]).unwrap();
        let after = lab.local.settings().unwrap();
        assert!(
            after.parts.is_empty() && after.folders.is_empty(),
            "{after:?}"
        );
        assert!(lab.local.set_whole(&path).is_err(), "not ticked any more");
        lab.local
            .set_settings(&LocalSettings {
                folders: vec![path.clone()],
                ..after
            })
            .unwrap();
        lab.local.set_parts(&path, &["A".to_owned()]).unwrap();
        lab.local.set_whole(&path).unwrap();
        let whole = lab.local.settings().unwrap();
        assert!(
            whole.parts.is_empty() && whole.folders == [path.clone()],
            "{whole:?}"
        );
        lab.local
            .set_parts(&path, &["Projetos".to_owned()])
            .unwrap();
        put(&lab, "Projetos/a.md", "# a\n");
        lab.serve();
        let err = lab.local.set_parts(&path, &[]).unwrap_err();
        assert!(err.contains("turn serving off"), "{err}");
        assert!(
            lab.local
                .set_whole(&path)
                .unwrap_err()
                .contains("turn serving off")
        );
        assert_eq!(lab.local.settings().unwrap().parts[&path], ["Projetos"]);
    });
}

/// How a window on a chosen folder meets each command a phone may run,
/// decided in the code and pinned here: a command added to the allowlist
/// tomorrow has to be given a verdict in this table, or this test fails.
#[test]
fn every_allowlisted_command_has_a_verdict_on_a_chosen_folder() {
    // A command of the folder (`ops`): its paths joined to the share's and
    // confined (`Scope::args_in`), or answered by the share's own branch of
    // `folder_command`, or refused by `args_in` ("not in a shared folder").
    const OWN_BRANCH: &[&str] = &[
        "get_focuses",
        "can_sync_focuses",
        "query_base",
        "get_folder_settings",
        "get_obsidian_periodic",
        "list_folder_data",
        "read_folder_data",
        "folder_space",
    ];
    // Not a command of the folder: handled by the server's own dispatch.
    const SERVER: &[&str] = &[
        "open_server_folder",
        "reopen_folder",
        "pick_folder",
        "open_initial",
        "current_folder",
        "capabilities",
        "app_info",
        "reindex",
        "render_markdown",
        "project_secrets",
        "project_board",
        "board_text",
        "set_embed_origins",
        "set_menu_language",
        "note_made_from_template",
        "set_history_days",
        "fetch_file",
        "fetch_focuses_file",
        "set_walk_rules",
        "set_folder_note_name",
        "log_write",
        "embed_frameable",
        "collab_join",
        "collab_leave",
        "collab_awareness",
        "collab_present",
        "collab_update",
        "collab_save",
        "collab_resolve",
        "collab_canvas",
        "collab_roll",
        "collab_oracle",
        "table_join",
        "table_leave",
        "table_look",
        "table_history",
        "table_say",
        "table_send_image",
        "table_attach",
        "table_roll",
        "table_pin",
        "table_delete",
        "table_time",
        "table_cannot_play",
        "table_share_listen",
        "campaign_status",
        "trash_list",
        "trash_restore",
        "trash_delete",
        "history_list",
        "history_read",
        "history_restore",
        "history_copy",
    ];
    // The scope of a phone's share: with the attachments mount and the guard.
    let vault_dir = tempfile::tempdir().unwrap();
    let scope = crate::scope::Scope {
        share: "s".into(),
        key: "share-s".into(),
        name: "P".into(),
        root: "Projetos".into(),
        mount: Some(("Anexos".into(), "Anexos".into())),
        guard: Some(std::sync::Arc::new(crate::scope::Guard::phone(
            vault_dir.path().to_path_buf(),
        ))),
    };
    let mut refused_by_scope = Vec::new();
    for cmd in allow::READ.iter().chain(allow::EDIT.iter()) {
        if verso_service::ops::access(cmd).is_some() {
            if OWN_BRANCH.contains(cmd) {
                continue;
            }
            let asked = scope.args_in(cmd, json!({}));
            if asked.is_err_and(|e| e.message == "not in a shared folder") {
                refused_by_scope.push(*cmd);
            }
        } else {
            assert!(
                SERVER.contains(cmd),
                "{cmd} is on the phones' allowlist and has no verdict on a chosen folder"
            );
        }
    }
    assert_eq!(
        refused_by_scope,
        [
            "graph_unresolved",
            "write_folder_data",
            "remove_folder_data",
            "set_focuses"
        ],
        "the commands a share refuses"
    );
}
