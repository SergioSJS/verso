// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table's files changed outside Verso — renamed or deleted on the
//! server's disk, seen by the watcher or the walk — keep who sees them (the
//! maintainer, 2026-11-05, "pode seguir as recomendações"): a rename the
//! walk is sure of carries the file's access along; one it cannot be sure
//! of leaves the new file hidden where a file gone in the same step had
//! narrower access of its own; a deletion takes the access it left behind.

use std::path::Path;

use serde_json::{Value, json};

use crate::tests_campaign::{Mesa, mesa, strings};

fn set(whole: &str) -> Value {
    json!({ "kind": "set", "set": { "whole": whole, "rows": [] }, "secret_name": null })
}

async fn access(m: &mut Mesa, path: &str, whole: &str) {
    let done = m
        .owner
        .call(
            "access_set",
            json!({ "paths": [path], "change": set(whole) }),
        )
        .await;
    assert!(done.get("ok").is_some(), "{done}");
}

async fn note(m: &mut Mesa, name: &str, text: &str) {
    let made = m
        .owner
        .call("create_note", json!({ "name": name, "text": text }))
        .await;
    assert!(made.get("ok").is_some(), "{made}");
}

/// "Praça", seen by every player.
async fn praca(m: &mut Mesa) {
    note(m, "Praça/Fonte", "água\n").await;
    access(m, "Praça", "see").await;
}

/// What Ana is shown of `path`.
async fn ana_sees(m: &mut Mesa, path: &str) -> bool {
    let listed = m.ana.call("list_notes", json!({})).await;
    let read = m.ana.call("read_note", json!({ "path": path })).await;
    strings(&listed["ok"]).contains(&path.to_owned()) || read.get("ok").is_some()
}

/// The folder's key, as the service names it.
fn key_of(m: &Mesa) -> String {
    verso_service::lock(&m.r.server.keys)
        .iter()
        .find(|(_, f)| **f == m.id)
        .map(|(k, _)| k.clone())
        .unwrap()
}

/// Renames on the server's disk, by hand, and the watcher's reconciling of
/// the paths it saw.
fn outside(m: &Mesa, renames: &[(&str, &str)], deletions: &[&str]) {
    let mut root = verso_fs::Root::open(m.r.campanha(), Vec::new()).unwrap();
    let mut seen: Vec<String> = Vec::new();
    for (from, to) in renames {
        let (_, report) = root.rename(Path::new(from), Path::new(to)).unwrap();
        assert!(report.warnings().is_empty());
        seen.extend([(*from).to_owned(), (*to).to_owned()]);
    }
    for path in deletions {
        let (_, report) = root.trash(Path::new(path)).unwrap();
        assert!(report.warnings().is_empty());
        seen.push((*path).to_owned());
    }
    crate::sync::reconcile(&m.r.server, &m.id, &key_of(m), None, &seen).unwrap();
}

/// A rename the walk is sure of: one file gone, one new of its bytes.
#[test]
fn a_rename_outside_verso_carries_the_files_access() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zq carta\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        assert!(!ana_sees(&mut m, "Praça/Carta Zq.md").await);
        outside(&m, &[("Praça/Carta Zq.md", "Praça/Carta velha Zq.md")], &[]);
        assert!(!ana_sees(&mut m, "Praça/Carta velha Zq.md").await);
    });
}

/// Two files of the same bytes renamed at once: which new is which old
/// the walk cannot tell, and the old ones were hidden by access of their
/// own — the new ones are born hidden. A file new outside with no such
/// file gone keeps its folder's access, as every new file does.
#[test]
fn a_rename_outside_verso_the_walk_cannot_be_sure_of_leaves_the_file_hidden() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        for name in ["Praça/Um Zq", "Praça/Dois Zq"] {
            note(&mut m, name, "zq igual\n").await;
            access(&mut m, &format!("{name}.md"), "none").await;
        }
        {
            use std::io::Write;
            let mut f = tempfile::NamedTempFile::new_in(m.r.campanha()).unwrap();
            f.write_all(b"nova de fora\n").unwrap();
            f.persist(m.r.campanha().join("Praça").join("Aviso.md"))
                .unwrap();
        }
        outside(
            &m,
            &[
                ("Praça/Um Zq.md", "Praça/Três Zq.md"),
                ("Praça/Dois Zq.md", "Praça/Quatro Zq.md"),
            ],
            &[],
        );
        crate::sync::reconcile(
            &m.r.server,
            &m.id,
            &key_of(&m),
            None,
            &["Praça/Aviso.md".to_owned()],
        )
        .unwrap();
        for path in ["Praça/Três Zq.md", "Praça/Quatro Zq.md"] {
            assert!(!ana_sees(&mut m, path).await, "{path}");
        }
        assert!(ana_sees(&mut m, "Praça/Aviso.md").await);
    });
}

/// A file deleted outside Verso leaves no access behind for the next file
/// made at its name.
#[test]
fn a_deletion_outside_verso_leaves_no_access_behind() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Cofre Zq/Placa", "aberta\n").await;
        access(&mut m, "Praça/Cofre Zq", "none").await;
        access(&mut m, "Praça/Cofre Zq/Placa.md", "see").await;
        assert!(ana_sees(&mut m, "Praça/Cofre Zq/Placa.md").await);
        outside(&m, &[], &["Praça/Cofre Zq/Placa.md"]);
        note(&mut m, "Praça/Cofre Zq/Placa", "zq nova secreta\n").await;
        assert!(!ana_sees(&mut m, "Praça/Cofre Zq/Placa.md").await);
    });
}

/// Renames on the server's disk, by hand, then the watcher's batches as
/// they may come (seen on Windows, 2026-11-06): a batch named one side of
/// the rename only — a file's earlier write, read again once it was gone,
/// or the new name alone — and the other side in a later batch.
fn outside_in_two(m: &Mesa, (from, to): (&str, &str), first: &str) {
    let mut root = verso_fs::Root::open(m.r.campanha(), Vec::new()).unwrap();
    let (_, report) = root.rename(Path::new(from), Path::new(to)).unwrap();
    assert!(report.warnings().is_empty());
    let then = if first == from { to } else { from };
    for path in [first, then] {
        crate::sync::reconcile(&m.r.server, &m.id, &key_of(m), None, &[path.to_owned()]).unwrap();
    }
}

/// A rename outside Verso whose old name a batch reports alone: the walk
/// looks again before it records a file kept from someone as gone, and
/// finds the new one — never a deletion, then a new file of its folder's.
#[test]
fn a_rename_outside_verso_seen_first_as_a_deletion_keeps_the_file_hidden() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zq carta\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        let (from, to) = ("Praça/Carta Zq.md", "Praça/Carta velha Zq.md");
        outside_in_two(&m, (from, to), from);
        assert!(!ana_sees(&mut m, to).await);
    });
}

/// The same, its new name reported alone: the file it may be, still
/// listed, is looked at again before the new one takes its folder's.
#[test]
fn a_rename_outside_verso_seen_first_as_a_new_file_keeps_the_file_hidden() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zq carta\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        // Settled: the log's quick key of the old name is kept, and a
        // listing that still names it vouches for it unread.
        std::thread::sleep(crate::sync::SETTLED + std::time::Duration::from_millis(200));
        let walked = m.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        crate::sync::reconcile(&m.r.server, &m.id, &key_of(&m), None, &[]).unwrap();
        let (from, to) = ("Praça/Carta Zq.md", "Praça/Carta velha Zq.md");
        outside_in_two(&m, (from, to), to);
        assert!(!ana_sees(&mut m, to).await);
    });
}

/// A file of `text` put at `path` on the server's disk, by hand.
fn by_hand(m: &Mesa, path: &str, text: &str) {
    use std::io::Write;
    let mut f = tempfile::NamedTempFile::new_in(m.r.campanha()).unwrap();
    f.write_all(text.as_bytes()).unwrap();
    f.persist(m.r.campanha().join(path)).unwrap();
}

/// A rename outside Verso whose new name no step found with the old one —
/// on Windows a file is renamed by `link` then `unlink`, and the old name
/// was read gone after the listing was taken, before the new name was in
/// it (2026-11-06): the new file of those bytes, found later, is born
/// hidden. A note of the same bytes written through Verso is not.
#[test]
fn a_rename_outside_verso_whose_new_name_comes_a_step_later_leaves_the_file_hidden() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zq carta\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        outside(&m, &[], &["Praça/Carta Zq.md"]);
        by_hand(&m, "Praça/Carta velha Zq.md", "zq carta\n");
        let found = ["Praça/Carta velha Zq.md".to_owned()];
        crate::sync::reconcile(&m.r.server, &m.id, &key_of(&m), None, &found).unwrap();
        assert!(!ana_sees(&mut m, "Praça/Carta velha Zq.md").await);
        note(&mut m, "Praça/Carta nova", "zq carta\n").await;
        assert!(ana_sees(&mut m, "Praça/Carta nova.md").await);
    });
}

/// The rename's middle, two names for one file's bytes, found before the
/// old name goes: the new one is born hidden, and stays so once the old
/// one has gone.
#[test]
fn a_rename_outside_verso_found_with_both_names_leaves_the_file_hidden() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zq carta\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        by_hand(&m, "Praça/Carta velha Zq.md", "zq carta\n");
        let found = ["Praça/Carta velha Zq.md".to_owned()];
        crate::sync::reconcile(&m.r.server, &m.id, &key_of(&m), None, &found).unwrap();
        assert!(!ana_sees(&mut m, "Praça/Carta velha Zq.md").await);
        outside(&m, &[], &["Praça/Carta Zq.md"]);
        assert!(!ana_sees(&mut m, "Praça/Carta velha Zq.md").await);
    });
}

/// A note written through Verso of the bytes of a file kept from someone
/// that went outside, its write found first by the watcher's step (C3,
/// seen on Windows): kept hidden by that step, it follows its folder once
/// its writer's own step names it.
#[test]
fn a_note_written_through_verso_found_first_by_the_watcher_follows_its_folder() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zq carta\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        outside(&m, &[], &["Praça/Carta Zq.md"]);
        let path = "Praça/Carta nova.md";
        by_hand(&m, path, "zq carta\n");
        let named = [path.to_owned()];
        crate::sync::reconcile(&m.r.server, &m.id, &key_of(&m), None, &named).unwrap();
        assert!(!ana_sees(&mut m, path).await);
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        let (server, key) = (&m.r.server, key_of(&m));
        crate::sync::reconcile(server, &m.id, &key, Some(&admin.id), &named).unwrap();
        assert!(ana_sees(&mut m, path).await);
    });
}

/// A rename outside Verso the index has learned and the folder's log not
/// yet: the watcher's batch walked, its reconciliation held before it reads
/// anything. Until it records the rename, the new name is a path the
/// server has not judged — hidden from a player by every door (list,
/// search, read, graph, backlinks, entries); the game master sees it.
#[test]
fn a_rename_outside_verso_not_yet_reconciled_is_hidden_from_a_player() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zqjanela [[Fonte]]\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": "Praça/Selo Zq.png", "base64": crate::tests_campaign::PNG }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        access(&mut m, "Praça/Selo Zq.png", "none").await;
        let (from, to) = ("Praça/Carta Zq.md", "Praça/Carta velha Zq.md");
        let (heard, go) = crate::pause::hold("reconcile-begun", &m.id);
        let mut root = verso_fs::Root::open(m.r.campanha(), Vec::new()).unwrap();
        for (from, to) in [(from, to), ("Praça/Selo Zq.png", "Praça/Selo velho Zq.png")] {
            let (_, report) = root.rename(Path::new(from), Path::new(to)).unwrap();
            assert!(report.warnings().is_empty());
        }
        // The watcher's batch: the index walks, then its reconciliation.
        m.r.server.service.walk_quietly(&key_of(&m));
        crate::pause::arrived(heard).await;
        let gm = m.owner.call("list_notes", json!({})).await;
        assert!(strings(&gm["ok"]).contains(&to.to_owned()), "{gm}");
        let told = [
            ("list_notes", json!({})),
            ("list_files", json!({})),
            ("list_entries", json!({})),
            ("search", json!({ "words": "zqjanela", "limit": 20 })),
            ("read_note", json!({ "path": to })),
            ("read_text", json!({ "path": to })),
            ("read_file_text", json!({ "path": to })),
            ("graph", json!({})),
            ("backlinks", json!({ "path": "Praça/Fonte.md" })),
            ("links", json!({ "path": to })),
        ];
        let mut shown = Vec::new();
        for (cmd, args) in told {
            let text = m.ana.call(cmd, args).await.to_string();
            if ["Carta velha", "zqjanela", "Selo velho"]
                .iter()
                .any(|w| text.contains(w))
            {
                shown.push(format!("{cmd}: {text}"));
            }
        }
        let ana = crate::tests::sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        for path in [to, "Praça/Selo velho Zq.png"] {
            let (status, _) =
                crate::tests::get(&m.r, &format!("/f/{}/{path}", m.id), Some(&ana)).await;
            let none = path.replace("velh", "nunc");
            let (absent, _) =
                crate::tests::get(&m.r, &format!("/f/{}/{none}", m.id), Some(&ana)).await;
            if status != absent {
                shown.push(format!("/f/{path}: {status}, {absent} for none"));
            }
        }
        assert!(shown.is_empty(), "{shown:#?}");
        go.send(()).unwrap();
        crate::sync::reconcile(&m.r.server, &m.id, &key_of(&m), None, &[]).unwrap();
        assert!(!ana_sees(&mut m, to).await);
        let files = m.ana.call("list_files", json!({})).await;
        assert!(!files.to_string().contains("Selo velho"), "{files}");
        // Ana was told nothing of them on the way.
        for heard in m.ana.hear(300).await {
            let heard = heard.to_string();
            assert!(
                !heard.contains("Carta velha") && !heard.contains("Selo velho"),
                "{heard}"
            );
        }
    });
}

/// The level `who` is given of `path` when reading it, `None` when not
/// shown it.
async fn level(who: &mut crate::tests_campaign::Win, path: &str) -> Option<String> {
    let read = who.call("read_note", json!({ "path": path })).await;
    read["ok"]["access"]["level"].as_str().map(str::to_owned)
}

/// The rows of a set: each account with its level.
fn rows(whole: &str, rows: &[(&str, &str)]) -> Value {
    let rows: Vec<Value> = rows
        .iter()
        .map(|(who, level)| json!({ "account": who, "level": level }))
        .collect();
    json!({ "kind": "set", "set": { "whole": whole, "rows": rows }, "secret_name": null })
}

async fn access_rows(m: &mut Mesa, path: &str, whole: &str, of: &[(&str, &str)]) {
    let done = m
        .owner
        .call(
            "access_set",
            json!({ "paths": [path], "change": rows(whole, of) }),
        )
        .await;
    assert!(done.get("ok").is_some(), "{done}");
}

/// A file copied by hand on the server's disk, its original still in the
/// table, and the watcher's reconciling of the copy.
fn copied(m: &Mesa, text: &str, to: &str) {
    by_hand(m, to, text);
    let found = [to.to_owned()];
    crate::sync::reconcile(&m.r.server, &m.id, &key_of(m), None, &found).unwrap();
}

/// A copy of a hidden note (the maintainer, 2026-11-06: "Cópia herda do
/// original") is hidden: one hidden by a set of its own, and one hidden by
/// its folder, the copy put where the players see.
#[test]
fn a_copy_outside_verso_of_a_hidden_note_is_hidden() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Carta Zq", "zq carta\n").await;
        access(&mut m, "Praça/Carta Zq.md", "none").await;
        note(&mut m, "Cofre Zq/Mapa Zq", "zq mapa do cofre\n").await;
        access(&mut m, "Cofre Zq", "none").await;
        copied(&m, "zq carta\n", "Praça/Carta cópia Zq.md");
        copied(&m, "zq mapa do cofre\n", "Praça/Mapa cópia Zq.md");
        for path in ["Praça/Carta cópia Zq.md", "Praça/Mapa cópia Zq.md"] {
            assert!(!ana_sees(&mut m, path).await, "{path}");
        }
    });
}

/// A copy of a note Ana edits and Bia sees: Ana edits the copy, Bia sees
/// it. A note of the same bytes written through Verso follows its folder.
#[test]
fn a_copy_outside_verso_of_a_note_ana_edits_is_edited_by_ana() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Diário Zq", "zq diário\n").await;
        let ana = m.ana_id.clone();
        access_rows(&mut m, "Praça/Diário Zq.md", "see", &[(&ana, "edit")]).await;
        copied(&m, "zq diário\n", "Praça/Diário cópia Zq.md");
        let copy = "Praça/Diário cópia Zq.md";
        assert_eq!(level(&mut m.ana, copy).await.as_deref(), Some("edit"));
        assert_eq!(level(&mut m.bia, copy).await.as_deref(), Some("see"));
        note(&mut m, "Praça/Diário novo", "zq diário\n").await;
        let new = "Praça/Diário novo.md";
        assert_eq!(level(&mut m.ana, new).await.as_deref(), Some("see"));
    });
}

/// A copy of a visible note is visible: one shown by its folder, copied
/// beside it, and one shown by a set of its own, copied into a folder the
/// players do not see.
#[test]
fn a_copy_outside_verso_of_a_visible_note_is_visible() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Cofre Zq/Aviso", "aviso a todos\n").await;
        access(&mut m, "Cofre Zq", "none").await;
        note(&mut m, "Praça/Edital", "edital da praça\n").await;
        access(&mut m, "Praça/Edital.md", "see").await;
        copied(&m, "água\n", "Praça/Fonte cópia.md");
        copied(&m, "edital da praça\n", "Cofre Zq/Edital cópia.md");
        for path in ["Praça/Fonte cópia.md", "Cofre Zq/Edital cópia.md"] {
            assert!(ana_sees(&mut m, path).await, "{path}");
        }
        assert!(!ana_sees(&mut m, "Cofre Zq/Aviso.md").await);
    });
}

/// Several notes of the copy's bytes, of different access: the copy takes
/// the narrowest, each player at the lowest level any of them gives.
#[test]
fn a_copy_outside_verso_of_notes_of_different_access_takes_the_narrowest() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let (ana, bia) = (m.ana_id.clone(), m.bia_id.clone());
        note(&mut m, "Praça/Selo um Zq", "zq selo\n").await;
        access_rows(&mut m, "Praça/Selo um Zq.md", "see", &[(&ana, "edit")]).await;
        note(&mut m, "Praça/Selo dois Zq", "zq selo\n").await;
        access_rows(
            &mut m,
            "Praça/Selo dois Zq.md",
            "none",
            &[(&ana, "edit"), (&bia, "see")],
        )
        .await;
        note(&mut m, "Praça/Selo três Zq", "zq selo\n").await;
        access_rows(&mut m, "Praça/Selo três Zq.md", "edit", &[(&ana, "see")]).await;
        copied(&m, "zq selo\n", "Praça/Selo cópia Zq.md");
        let copy = "Praça/Selo cópia Zq.md";
        assert_eq!(level(&mut m.ana, copy).await.as_deref(), Some("see"));
        assert_eq!(level(&mut m.bia, copy).await.as_deref(), Some("see"));
    });
}

/// A note written through Verso of the bytes of a note Ana edits, its
/// write found first by the watcher's step (C3): given the copy's access by
/// that step, it follows its folder once its writer's own step names it.
#[test]
fn a_note_written_through_verso_found_first_as_a_copy_follows_its_folder() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        note(&mut m, "Praça/Diário Zq", "zq diário\n").await;
        let ana = m.ana_id.clone();
        access_rows(&mut m, "Praça/Diário Zq.md", "see", &[(&ana, "edit")]).await;
        let path = "Praça/Diário novo.md";
        copied(&m, "zq diário\n", path);
        assert_eq!(level(&mut m.ana, path).await.as_deref(), Some("edit"));
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        let (server, key) = (&m.r.server, key_of(&m));
        crate::sync::reconcile(server, &m.id, &key, Some(&admin.id), &[path.to_owned()]).unwrap();
        assert_eq!(level(&mut m.ana, path).await.as_deref(), Some("see"));
    });
}
