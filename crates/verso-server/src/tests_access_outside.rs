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
