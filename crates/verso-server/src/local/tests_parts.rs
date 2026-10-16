// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder served in part (ADR 0096 item 3, amended 2026-10-16), as a
//! phone drives it: only the folders chosen inside `Campanha` reach the
//! phone, each as a folder of its own, by the confinement of a share. The
//! vault itself, and everything beside the chosen folders, stays out.

use serde_json::{Value, json};

use super::tests::{Lab, Ws, call, lab, next, run};
use super::{LocalSettings, allow};
use crate::db::Role;

/// The secret marker: it is in the notes outside the chosen folder, and no
/// answer to a phone may carry it.
const NEEDLE: &str = "agulhasecreta";

fn put(lab: &Lab, rel: &str, text: &str) {
    let at = lab.notes.path().join("Campanha").join(rel);
    crate::data::ensure_dir(at.parent().unwrap()).unwrap();
    crate::data::write_for_tests(&at, text);
}

fn vault(lab: &Lab) -> String {
    lab.notes
        .path()
        .join("Campanha")
        .to_string_lossy()
        .into_owned()
}

/// `Campanha`: `Projetos` and `Diario` to be chosen, `Segredo` and a root
/// note never, and `Anexos` where the pictures are kept.
fn lab_in_part(chosen: &[&str]) -> Lab {
    let lab = lab();
    put(
        &lab,
        "Raiz.md",
        &format!("# Raiz\n{NEEDLE} [[Segredo/c]]\n"),
    );
    put(
        &lab,
        "Projetos/a.md",
        "# A\nlinha de projeto #pro\n![[pic.png]]\n[[Segredo/c]]\n",
    );
    put(&lab, "Projetos/img.png", "png");
    put(&lab, "Projetos/Sub/s.md", "# S\nsub #pro\n");
    put(&lab, "Diario/b.md", "# B\ndiario #dia\n");
    put(
        &lab,
        "Segredo/c.md",
        &format!("# C\n{NEEDLE} #segredo\n[[a]]\n"),
    );
    put(&lab, "Anexos/pic.png", "png");
    put(&lab, "Anexos/outra.png", "png");
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

async fn folders(lab: &Lab, cookie: &str) -> Vec<Value> {
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
async fn open_part(lab: &Lab, cookie: &str, name: &str) -> Ws {
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
fn the_attachments_folder_goes_along_read_only() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        let files = call(&mut ws, 2, "list_files", json!({})).await;
        let files: Vec<&str> = files["ok"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f.as_str().unwrap())
            .collect();
        assert!(files.contains(&"Anexos/pic.png"), "{files:?}");
        // A reading through the mount works; a writing does not.
        let (status, _) = lab
            .get(
                &format!(
                    "/f/{}/Anexos/pic.png",
                    folders(&lab, &cookie).await[0]["id"].as_str().unwrap()
                ),
                Some(&cookie),
            )
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
        assert!(!all.contains("Segredo") && !all.contains("Raiz"), "{all}");
        // It is the share's, in the database too.
        let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
        let share = db
            .shares_of(&vault_id(&lab))
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert_eq!(share.attachments.as_deref(), Some("Anexos"));
    });
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

/// Every command a phone may run, on a chosen folder, asked three ways —
/// out of the folder, beside it, inside it — answers scoped or is refused:
/// no answer carries what is outside, and the vault outside the chosen
/// folder is byte for byte what it was.
#[test]
fn every_command_a_phone_may_run_is_scoped_or_refused_on_a_chosen_folder() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let cookie = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let before = outside_snapshot(&lab);
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        let vault_name = "Campanha";
        let host = lab.notes.path().to_string_lossy().into_owned();
        let mut verdicts: Vec<String> = Vec::new();
        let mut id = 100;
        for cmd in allow::READ.iter().chain(allow::EDIT.iter()) {
            // Not a command of a window on a folder, or one that ends it.
            if matches!(*cmd, "open_server_folder" | "reopen_folder") {
                continue;
            }
            let mut answered = 0;
            for path in ["../Segredo/c.md", "Segredo/c.md", "a.md"] {
                id += 1;
                let args = json!({
                    "path": path, "from": path, "to": format!("{path}.moved"), "name": path,
                    "source": path, "target": path, "folder": path, "paths": [path],
                    "text": "zzechozz", "base64": "AQ==", "revision": "r", "limit": 50, "words": NEEDLE,
                    "query": { "path": path, "this": path }, "json": "{}", "at": path,
                    "keep": "mine", "update": "AA", "notation": "1d6", "key": "k",
                    "id": "x", "bytes": [1], "entries": [], "change": {}, "days": 1,
                    "level": "INFO", "message": "m", "ids": [], "focuses": [], "stamp": null,
                    "force": false, "keepIt": false, "x": 0, "y": 0, "z": 0, "format": "png",
                });
                let reply = call(&mut ws, id, cmd, args).await;
                let text = reply.to_string();
                // What the vault holds outside the chosen folder, its name and
                // where it is on the disk: none of it comes back, in an answer
                // or in a refusal.
                for leak in [NEEDLE, "Raiz", vault_name, host.as_str()] {
                    assert!(!text.contains(leak), "{cmd} {path}: carries {leak}: {text}");
                }
                if reply.get("ok").is_some() {
                    answered += 1;
                }
            }
            verdicts.push(format!(
                "{cmd}: {}",
                if answered == 0 { "refused" } else { "scoped" }
            ));
        }
        println!("{}", verdicts.join("\n"));
        assert_eq!(
            before,
            outside_snapshot(&lab),
            "a command wrote outside the chosen folder"
        );
    });
}

/// Every file of the vault as the walk sees it, with its bytes — read
/// through `verso-fs`, the only crate that touches a folder's files.
fn on_disk(lab: &Lab) -> Vec<(String, Vec<u8>)> {
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

fn has(lab: &Lab, rel: &str) -> bool {
    on_disk(lab).iter().any(|(p, _)| p == rel)
}

/// Everything under the vault but the chosen folder, with its bytes.
fn outside_snapshot(lab: &Lab) -> Vec<(String, Vec<u8>)> {
    on_disk(lab)
        .into_iter()
        .filter(|(rel, _)| !(rel == "Projetos" || rel.starts_with("Projetos/")))
        .collect()
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
        lab.local.set_parts(&path, &[]).unwrap();
        assert!(lab.local.settings().unwrap().parts.is_empty());
        lab.local
            .set_parts(&path, &["Projetos".to_owned()])
            .unwrap();
        put(&lab, "Projetos/a.md", "# a\n");
        lab.serve();
        let err = lab.local.set_parts(&path, &[]).unwrap_err();
        assert!(err.contains("turn serving off"), "{err}");
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
        "folder_space",
    ];
    // Not a command of the folder: handled by the server's own dispatch.
    const SERVER: &[(&str, &str)] = &[
        (
            "open_server_folder",
            "opens a share by its id; the folder's id is refused",
        ),
        (
            "reopen_folder",
            "finds a share by its key; the folder's key is not found",
        ),
        ("pick_folder", "answers nothing"),
        ("open_initial", "answers nothing"),
        ("current_folder", "the share's name and counts"),
        ("capabilities", "the role in the share"),
        ("app_info", "the version, no folder"),
        (
            "reindex",
            "the share's counts; the summary of a reader is emptied",
        ),
        ("render_markdown", "a pure function of the text sent"),
        ("project_secrets", "a pure function of the text sent"),
        ("project_board", "a pure function of the text sent"),
        ("board_text", "a pure function of the text sent"),
        ("set_embed_origins", "answered without acting"),
        ("set_menu_language", "answered without acting"),
        ("note_made_from_template", "answered without acting"),
        ("set_history_days", "answered without acting"),
        ("fetch_file", "answered without acting"),
        ("set_walk_rules", "heard, dropped, for a phone"),
        ("set_folder_note_name", "heard, dropped, for a phone"),
        ("log_write", "heard, dropped, for a phone"),
        ("collab_join", "the path joined to the share's and confined"),
        (
            "collab_leave",
            "the path joined to the share's and confined",
        ),
        (
            "collab_awareness",
            "the path joined to the share's and confined",
        ),
        (
            "collab_present",
            "the path joined to the share's and confined",
        ),
        (
            "collab_update",
            "the path joined to the share's and confined",
        ),
        ("collab_save", "the path joined to the share's and confined"),
        (
            "collab_resolve",
            "the path joined to the share's and confined",
        ),
        (
            "collab_canvas",
            "the path joined to the share's and confined",
        ),
        ("collab_roll", "the path joined to the share's and confined"),
        ("trash_list", "the share's part of the bin only"),
        ("trash_restore", "the share's part of the bin only"),
        ("trash_delete", "the share's part of the bin only"),
        (
            "history_list",
            "the path joined to the share's and confined",
        ),
        (
            "history_read",
            "the path joined to the share's and confined",
        ),
        (
            "history_restore",
            "the path joined to the share's and confined",
        ),
        (
            "history_copy",
            "the path joined to the share's and confined",
        ),
    ];
    let scope = crate::scope::Scope {
        share: "s".into(),
        key: "share-s".into(),
        name: "P".into(),
        root: "Projetos".into(),
        mount: None,
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
                SERVER.iter().any(|(c, _)| c == cmd),
                "{cmd} is on the phones' allowlist and has no verdict on a chosen folder"
            );
        }
    }
    assert_eq!(
        refused_by_scope,
        ["set_focuses"],
        "the commands a share refuses"
    );
}
