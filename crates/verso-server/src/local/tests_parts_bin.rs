// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder served in part (ADR 0096 item 2): what the bin and a rename
//! give a phone (`tests_parts.rs` has the rest, and the helpers).

use serde_json::json;

use super::tests::{Lab, call, run};
use super::tests_parts::{NEEDLE, NEVER_SAID, has, lab_in_part, on_disk, open_part, put, vault};
// Only the tests of symbolic links use these, and those run on Unix.
#[cfg(unix)]
use super::tests_parts::{folders, read_disk};
use crate::db::Role;

/// Move `rel` of the vault into its bin, as its owner would.
fn binned(lab: &Lab, rel: &str) {
    let mut root = verso_fs::Root::open(lab.notes.path().join("Campanha"), Vec::new()).unwrap();
    let _report = root.trash(std::path::Path::new(rel)).unwrap();
}

/// Move `rel` into the bin with the record a deletion through the server
/// leaves (who, from where), so that a share's bin knows it as its own.
fn binned_recorded(lab: &Lab, rel: &str) {
    use verso_core::trash::TrashBook as _;
    let mut root = verso_fs::Root::open(lab.notes.path().join("Campanha"), Vec::new()).unwrap();
    let (at, _report) = root.trash(std::path::Path::new(rel)).unwrap();
    let path = at.to_string_lossy().replace('\\', "/");
    let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
    let folder = db.folder_by_dir("Campanha").unwrap().unwrap().id;
    let mut book = crate::db::FolderBook {
        db: &db,
        folder: &folder,
    };
    let now = verso_core::trash::now();
    book.put(&verso_core::trash::record(
        &path,
        rel,
        now,
        Some("Dono"),
        false,
    ))
    .unwrap();
}

/// The bin a phone sees is the chosen folder's own entries: what the vault's
/// owner deleted from the attachments folder or from beside the folder is
/// not listed, and cannot be given back — into the vault's root or
/// anywhere else.
#[test]
fn the_bin_gives_a_phone_only_what_was_the_chosen_folders() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        binned(&lab, "Anexos/outra.png");
        binned(&lab, "Segredo/c.md");
        lab.serve();
        let cookie = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        // The phone is an editor of the chosen folder, and outside a table
        // only the folder's owner deletes (ADR 0113 section B, amended
        // 2026-10-31; provisional for a phone, see there): the entry is the
        // vault owner's deletion, recorded as the server records one.
        let kept = call(&mut ws, 2, "delete_note", json!({ "path": "Sub/s.md" })).await;
        assert_eq!(kept["err"]["kind"], "refused", "{kept}");
        binned_recorded(&lab, "Projetos/Sub/s.md");
        let list = call(&mut ws, 3, "trash_list", json!({})).await;
        let entries = list["ok"]["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 1, "{list}");
        assert_eq!(entries[0]["original"], "Sub/s.md", "{list}");
        let text = list.to_string();
        assert!(
            !text.contains("Anexos") && !text.contains("Segredo") && !text.contains("outra"),
            "{text}"
        );
        // Asked for by the names the owner's bin gives them.
        for asked in [
            ".trash/Anexos/outra.png",
            "Anexos/outra.png",
            ".trash/Segredo/c.md",
            "Segredo/c.md",
        ] {
            let r = call(
                &mut ws,
                4,
                "trash_restore",
                json!({ "path": asked, "today": "2026-10-16" }),
            )
            .await;
            assert!(r.get("err").is_some(), "{asked}: {r}");
        }
        assert!(
            !has(&lab, "Anexos/outra.png"),
            "given back at the vault's root"
        );
        assert!(!has(&lab, "Segredo/c.md"));
        assert!(!has(&lab, "Anexos (restaurado)/outra.png"));
        // Its own entry is given back, inside the folder.
        let path = entries[0]["path"].as_str().unwrap().to_owned();
        let back = call(
            &mut ws,
            5,
            "trash_restore",
            json!({ "path": path, "today": "2026-10-16" }),
        )
        .await;
        assert!(back.get("ok").is_some(), "{back}");
        assert!(has(&lab, "Projetos/Sub/s.md"));
    });
}

/// A rename through the chosen folder rewrites the links to it in notes
/// outside — as on the desktop (asked 2026-10-16: "Um celular renomeia uma
/// nota numa pasta servida… o servidor reescreve os links delas?" —
/// "Reescreve") — and the phone's answer never names them.
#[test]
fn a_rename_rewrites_links_outside_and_the_phone_is_never_told_which() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let cookie = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        let done = call(
            &mut ws,
            2,
            "rename_note",
            json!({ "from": "a.md", "to": "b.md" }),
        )
        .await;
        assert!(done.get("ok").is_some(), "{done}");
        let text = done.to_string();
        for never in NEVER_SAID.iter().chain(&["c.md"]) {
            assert!(!text.contains(never), "the answer names {never}: {text}");
        }
        assert!(has(&lab, "Projetos/b.md") && !has(&lab, "Projetos/a.md"));
        let rewritten = on_disk(&lab)
            .into_iter()
            .find(|(p, _)| p == "Segredo/c.md")
            .unwrap()
            .1;
        assert_eq!(
            String::from_utf8(rewritten).unwrap(),
            format!("# C\n{NEEDLE} #segredo\n[[Projetos/b]]\n"),
            "the link in the note outside follows the rename"
        );
    });
}

/// A symbolic link under a chosen folder to somewhere outside it — a folder
/// or a file, in the folder or in its attachments folder — is left out
/// whole: not listed, not found, not read, not written through; a link to
/// something inside the folder still works.
#[cfg(unix)]
#[test]
fn a_link_that_leads_out_of_a_chosen_folder_is_left_out() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        let at = |rel: &str| lab.notes.path().join("Campanha").join(rel);
        verso_fs::link_for_tests(std::path::Path::new("../Segredo"), &at("Projetos/dir")).unwrap();
        verso_fs::link_for_tests(
            std::path::Path::new("../../Segredo/c.md"),
            &at("Projetos/Sub/f.md"),
        )
        .unwrap();
        verso_fs::link_for_tests(
            std::path::Path::new("../Segredo/x.png"),
            &at("Anexos/esc.png"),
        )
        .unwrap();
        verso_fs::link_for_tests(std::path::Path::new("Sub"), &at("Projetos/alias")).unwrap();
        // The other direction: a link outside that points in.
        verso_fs::link_for_tests(
            std::path::Path::new("../Projetos/a.md"),
            &at("Segredo/in.md"),
        )
        .unwrap();
        lab.serve();
        let editor = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let reader = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let share = folders(&lab, &editor).await[0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        for cookie in [&reader, &editor] {
            let mut ws = open_part(&lab, cookie, "Projetos").await;
            let mut id = 10;
            for (cmd, args) in [
                ("list_notes", json!({})),
                ("list_files", json!({})),
                ("list_folders", json!({})),
                ("list_entries", json!({})),
                ("list_tags", json!({})),
                ("graph", json!({})),
                ("search", json!({ "words": NEEDLE, "limit": 50 })),
                ("search", json!({ "words": "linha", "limit": 50 })),
            ] {
                id += 1;
                let r = call(&mut ws, id, cmd, args).await.to_string();
                for out in [
                    "Segredo/c.md",
                    "dir/",
                    "\"dir\"",
                    "f.md",
                    "esc.png",
                    "in.md",
                    NEEDLE,
                ] {
                    assert!(!r.contains(out), "{cmd} says {out}: {r}");
                }
            }
            for path in ["dir/c.md", "Sub/f.md", "Anexos/esc.png", "dir"] {
                for cmd in [
                    "read_note",
                    "read_text",
                    "read_file_text",
                    "links",
                    "resolve_attachment",
                ] {
                    id += 1;
                    let args = if cmd == "resolve_attachment" {
                        json!({ "source": "a.md", "target": path })
                    } else {
                        json!({ "path": path })
                    };
                    let r = call(&mut ws, id, cmd, args).await;
                    let t = r.to_string();
                    assert!(
                        r.get("err").is_some()
                            || (!t.contains(NEEDLE) && !t.contains("Segredo/c.md")),
                        "{cmd} {path}: {r}"
                    );
                    assert!(!t.contains(NEEDLE), "{cmd} {path}: {r}");
                }
            }
            for path in ["dir/c.md", "Sub/f.md", "Anexos/esc.png"] {
                let (status, body) = lab.get(&format!("/f/{share}/{path}"), Some(cookie)).await;
                assert_ne!(status, 200, "/f/<share>/{path}: {body}");
            }
            // What stays inside still works through a link.
            id += 1;
            let ok = call(&mut ws, id, "read_note", json!({ "path": "Sub/s.md" })).await;
            assert!(ok.get("ok").is_some(), "{ok}");
        }
        // Writing through a link out of the folder is refused, in both its shapes.
        let mut ws = open_part(&lab, &editor, "Projetos").await;
        for (cmd, args) in [
            ("create_note", json!({ "name": "dir/novo.md", "text": "x" })),
            (
                "create_file",
                json!({ "path": "dir/novo.png", "base64": "AQ==" }),
            ),
            ("create_folder", json!({ "path": "dir/pasta" })),
            ("rename_entry", json!({ "from": "a.md", "to": "dir/a.md" })),
            ("delete_entry", json!({ "path": "dir/c.md" })),
            ("delete_note", json!({ "path": "Sub/f.md" })),
            (
                "write_text",
                json!({ "path": "Sub/f.md", "text": "x", "revision": "r" }),
            ),
        ] {
            let r = call(&mut ws, 99, cmd, args).await;
            assert!(r.get("err").is_some(), "{cmd}: {r}");
        }
        assert!(read_disk(&lab, "Segredo/novo.md").is_none());
        assert!(read_disk(&lab, "Segredo/novo.png").is_none());
        assert!(read_disk(&lab, "Segredo/pasta/x").is_none());
        let c = read_disk(&lab, "Segredo/c.md").unwrap();
        assert_eq!(
            String::from_utf8(c).unwrap(),
            format!("# C\n{NEEDLE} #segredo\n[[a]]\n")
        );
    });
}

/// The chosen folders a start leaves out are kept, and said while serving is
/// off, until the choice changes; the start says so as an event even when
/// it is the app's own (keep on).
#[test]
fn the_folders_left_out_are_kept_until_the_choice_changes() {
    run(async {
        let mut lab = lab_in_part(&["Projetos", "Diario"]);
        let mut root = verso_fs::Root::open(lab.notes.path().join("Campanha"), Vec::new()).unwrap();
        let _report = root.trash(std::path::Path::new("Diario")).unwrap();
        lab.serve();
        let path = vault(&lab);
        let say = |lab: &Lab| lab.local.status().unwrap().dropped;
        assert_eq!(say(&lab), [(path.clone(), "Diario".to_owned())]);
        assert!(
            super::tests::said(&lab).iter().any(
                |e| matches!(e, super::Event::Dropped { what } if what == &["Campanha/Diario"])
            ),
            "the start said it"
        );
        // Off, the line stays for the person to act on.
        lab.local.stop();
        assert_eq!(say(&lab).len(), 1);
        // Until the choice changes.
        lab.local
            .set_parts(&path, &["Projetos".to_owned()])
            .unwrap();
        assert!(say(&lab).is_empty());
    });
}

/// A symbolic link that leads out of a chosen folder is judged by where it
/// really is, at every use: not by its name (a case or Unicode form the
/// file system folds), and not by a list looked at earlier (a folder moved
/// since turned an inside link into one that leaves).
#[cfg(unix)]
#[test]
fn a_link_is_judged_where_it_really_is_when_it_is_used() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        let at = |rel: &str| lab.notes.path().join("Campanha").join(rel);
        let link = |target: &str, rel: &str| {
            verso_fs::link_for_tests(std::path::Path::new(target), &at(rel)).unwrap();
        };
        link("../Segredo", "Projetos/dir");
        link("../../Segredo/c.md", "Projetos/Sub/f.md");
        link("../Segredo", "Projetos/caf\u{e9}");
        link("../Segredo/x.png", "Anexos/esc.txt");
        // Inside now; outside once its folder is moved up a level.
        put(&lab, "Projetos/Raiz.md", "dentro\n");
        put(&lab, "Projetos/A/B/x.md", "x\n");
        link("../../Raiz.md", "Projetos/A/B/l.md");
        lab.serve();
        let editor = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let mut ws = open_part(&lab, &editor, "Projetos").await;
        let mut id = 10;
        // The names as the file system folds them, and as typed.
        for path in [
            "dir/c.md",
            "DIR/c.md",
            "Dir/c.md",
            "Sub/f.md",
            "SUB/F.MD",
            "sub/f.md",
            "caf\u{e9}/c.md",
            "cafe\u{301}/c.md",
            "CAFE\u{301}/c.md",
            "Anexos/esc.txt",
            "Anexos/ESC.TXT",
        ] {
            for cmd in ["read_note", "read_text", "read_file_text", "links"] {
                id += 1;
                let r = call(&mut ws, id, cmd, json!({ "path": path }))
                    .await
                    .to_string();
                assert!(!r.contains(NEEDLE), "{cmd} {path}: {r}");
            }
            id += 1;
            let r = call(&mut ws, id, "read_note", json!({ "path": path })).await;
            let refused_or_missing = r.get("err").is_some();
            assert!(refused_or_missing, "read_note {path}: {r}");
        }
        for name in [
            "dir/novo.md",
            "DIR/novo.md",
            "cafe\u{301}/novo.md",
            "CAF\u{c9}/novo.md",
        ] {
            id += 1;
            let _made = call(
                &mut ws,
                id,
                "create_note",
                json!({ "name": name, "text": "x" }),
            )
            .await;
            assert!(
                read_disk(&lab, "Segredo/novo.md").is_none(),
                "{name} created a note in Segredo"
            );
        }
        // Moved: the link that was inside leaves, and the very next use sees it.
        id += 1;
        let listed = call(&mut ws, id, "list_notes", json!({})).await.to_string();
        assert!(listed.contains("A/B/l.md"), "inside it is listed: {listed}");
        id += 1;
        let moved = call(
            &mut ws,
            id,
            "move_entries",
            json!({ "folder": "", "paths": ["A/B"] }),
        )
        .await;
        assert!(moved.get("ok").is_some(), "{moved}");
        id += 1;
        let read = call(&mut ws, id, "read_note", json!({ "path": "B/l.md" })).await;
        assert!(read.get("err").is_some(), "{read}");
        id += 1;
        let listed = call(&mut ws, id, "list_notes", json!({})).await.to_string();
        assert!(!listed.contains("B/l.md"), "{listed}");
        let outside_raiz = read_disk(&lab, "Raiz.md").unwrap();
        id += 1;
        let note = call(&mut ws, id, "read_text", json!({ "path": "B/x.md" })).await;
        assert!(note.get("ok").is_some(), "{note}");
        for cmd in ["write_text", "write_note"] {
            id += 1;
            let r = call(
                &mut ws,
                id,
                cmd,
                json!({ "path": "B/l.md", "text": "ESCRITO", "revision": "r" }),
            )
            .await;
            assert!(r.get("err").is_some(), "{cmd}: {r}");
        }
        assert_eq!(
            read_disk(&lab, "Raiz.md").unwrap(),
            outside_raiz,
            "the vault's Raiz.md was written through the link"
        );
        assert_eq!(
            read_disk(&lab, "Segredo/c.md").unwrap(),
            format!("# C\n{NEEDLE} #segredo\n[[a]]\n").into_bytes()
        );
    });
}

/// The bin of a chosen folder hands back what was in the folder, not the
/// folder: an owner who binned `Projetos` and made another has a root entry
/// a phone neither sees nor restores (it would land at the vault's top).
#[test]
fn the_chosen_folders_own_root_in_the_bin_is_not_a_phones_to_restore() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        binned(&lab, "Projetos");
        put(&lab, "Projetos/a.md", "# A\nlinha de projeto\n");
        lab.serve();
        let cookie = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let mut ws = open_part(&lab, &cookie, "Projetos").await;
        let list = call(&mut ws, 2, "trash_list", json!({})).await;
        assert_eq!(list["ok"]["entries"], json!([]), "{list}");
        for asked in [".trash/Projetos", "Projetos", ""] {
            let r = call(
                &mut ws,
                3,
                "trash_restore",
                json!({ "path": asked, "today": "2026-10-16" }),
            )
            .await;
            assert!(r.get("err").is_some(), "{asked}: {r}");
        }
        assert!(
            on_disk(&lab).iter().all(|(p, _)| !p.contains("restaurado")),
            "something was given back at the vault's top"
        );
    });
}
