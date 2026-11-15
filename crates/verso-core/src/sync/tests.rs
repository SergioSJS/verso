// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The engine's rules, one by one, and its guardrail (ADR 0079,
//! Consequences): two devices and a server editing at random and syncing
//! in random orders end with the same files and lose no edit nobody saw.

use std::collections::{BTreeMap, BTreeSet};

use super::{Action, FileState, Files, Held, State, conflict_name, follows, plan};

fn f(hash: &str) -> FileState {
    FileState {
        hash: hash.to_owned(),
        size: hash.len() as u64,
    }
}

fn files(list: &[(&str, &str)]) -> Files {
    list.iter().map(|(p, h)| ((*p).to_owned(), f(h))).collect()
}

fn state(base: &[(&str, &str)]) -> State {
    State {
        base: base
            .iter()
            .map(|(p, h)| ((*p).to_owned(), (*h).to_owned()))
            .collect(),
        ..State::default()
    }
}

fn copy(p: &str, taken: &BTreeSet<String>) -> String {
    conflict_name(p, "Mac", "2026-10-10 15.34", true, taken)
}

#[test]
fn one_side_changed_crosses_and_both_changed_is_a_conflict() {
    let s = state(&[
        ("a.md", "1"),
        ("b.md", "1"),
        ("c.md", "1"),
        ("d.md", "1"),
        ("e.md", "1"),
    ]);
    let local = files(&[("a.md", "2"), ("b.md", "1"), ("d.md", "1"), ("e.md", "4")]);
    let remote = files(&[("a.md", "1"), ("b.md", "3"), ("c.md", "1"), ("e.md", "5")]);
    let p = plan(&local, &remote, &s, true, false, &copy);
    assert!(p.actions.contains(&Action::Upload {
        path: "a.md".into(),
        base: Some("1".into())
    }));
    assert!(p.actions.contains(&Action::Download {
        path: "b.md".into(),
        hash: "3".into()
    }));
    assert!(p.actions.contains(&Action::DeleteRemote {
        path: "c.md".into(),
        base: "1".into()
    }));
    assert!(p.actions.contains(&Action::DeleteLocal {
        path: "d.md".into()
    }));
    assert!(p.actions.contains(&Action::Conflict {
        path: "e.md".into(),
        copy: "e (conflito, Mac, 2026-10-10 15.34).md".into(),
        hash: "5".into()
    }));
}

#[test]
fn an_edit_wins_over_a_deletion_on_the_other_side() {
    let s = state(&[("a.md", "1"), ("b.md", "1")]);
    let local = files(&[("a.md", "2")]);
    let remote = files(&[("b.md", "3")]);
    let p = plan(&local, &remote, &s, true, false, &copy);
    assert!(p.actions.contains(&Action::Upload {
        path: "a.md".into(),
        base: None
    }));
    assert!(p.actions.contains(&Action::Download {
        path: "b.md".into(),
        hash: "3".into()
    }));
}

#[test]
fn the_first_sync_never_deletes() {
    let s = State::default();
    let local = files(&[
        ("so-aqui.md", "1"),
        ("igual.md", "2"),
        ("diferente.md", "3"),
    ]);
    let remote = files(&[("so-la.md", "4"), ("igual.md", "2"), ("diferente.md", "5")]);
    let p = plan(&local, &remote, &s, false, false, &copy);
    assert!(
        p.actions
            .iter()
            .all(|a| !matches!(a, Action::DeleteLocal { .. } | Action::DeleteRemote { .. }))
    );
    assert!(p.actions.contains(&Action::Upload {
        path: "so-aqui.md".into(),
        base: None
    }));
    assert!(p.actions.contains(&Action::Download {
        path: "so-la.md".into(),
        hash: "4".into()
    }));
    assert!(
        p.actions
            .iter()
            .any(|a| matches!(a, Action::Conflict { path, .. } if path == "diferente.md"))
    );
    assert_eq!(p.pause, None);
}

#[test]
fn many_deletions_pause_until_confirmed() {
    let all: Vec<(String, String)> = (0..60)
        .map(|n| (format!("n{n}.md"), "1".to_owned()))
        .collect();
    let base: Vec<(&str, &str)> = all.iter().map(|(p, h)| (p.as_str(), h.as_str())).collect();
    let s = state(&base);
    let remote = files(&base);
    // The folder here is gone (a drive not mounted, a cloud folder
    // evicted): every file looks deleted.
    let p = plan(&Files::new(), &remote, &s, false, false, &copy);
    assert_eq!(p.pause, Some(60));
    let p = plan(&Files::new(), &remote, &s, true, false, &copy);
    assert_eq!(p.pause, None);
}

/// A folder of `size` files, `gone` of them deleted here since the base:
/// whether the plan pauses for them.
fn pauses(size: usize, gone: usize) -> Option<usize> {
    let all: Vec<(String, String)> = (0..size)
        .map(|n| (format!("n{n}.md"), "1".to_owned()))
        .collect();
    let base: Vec<(&str, &str)> = all.iter().map(|(p, h)| (p.as_str(), h.as_str())).collect();
    let local = files(&base[gone..]);
    plan(&local, &files(&base), &state(&base), false, false, &copy).pause
}

/// The pause needs at least 3 deletions in one pass (item 9, revised
/// 2026-10-10): in a small folder, where a fifth is one or two files, one
/// or two deletions do not pause; past the floor, more than a fifth or
/// more than 50 still do.
#[test]
fn the_pause_needs_at_least_three_deletions() {
    assert_eq!(pauses(4, 1), None);
    assert_eq!(pauses(4, 2), None);
    assert_eq!(pauses(4, 3), Some(3));
    assert_eq!(pauses(1000, 3), None);
    assert_eq!(pauses(1000, 50), None);
    assert_eq!(pauses(1000, 51), Some(51));
}

#[test]
fn a_rename_on_one_side_is_a_rename_on_the_other() {
    let s = state(&[("velho.md", "1")]);
    let p = plan(
        &files(&[("novo.md", "1")]),
        &files(&[("velho.md", "1")]),
        &s,
        true,
        false,
        &copy,
    );
    assert_eq!(
        p.actions,
        vec![Action::RenameRemote {
            from: "velho.md".into(),
            to: "novo.md".into(),
            base: "1".into()
        }]
    );
    let p = plan(
        &files(&[("velho.md", "1")]),
        &files(&[("novo.md", "1")]),
        &s,
        true,
        false,
        &copy,
    );
    assert_eq!(
        p.actions,
        vec![Action::RenameLocal {
            from: "velho.md".into(),
            to: "novo.md".into()
        }]
    );
}

#[test]
fn a_conflicts_copy_takes_a_free_name_every_system_keeps() {
    let taken: BTreeSet<String> =
        ["pasta/n (conflict, a-b, 2026-10-10 15.34).md".to_owned()].into();
    assert_eq!(
        conflict_name("pasta/n.md", "a:b", "2026-10-10 15.34", false, &taken),
        "pasta/n (conflict, a-b, 2026-10-10 15.34 2).md"
    );
    assert_eq!(
        conflict_name("LEIAME", "PC", "x", true, &BTreeSet::new()),
        "LEIAME (conflito, PC, x)"
    );
}

/* ---------- Names a file system folds: one file, two spellings ---------- */

/// A plan as a device whose file system folds names (APFS, NTFS) or does
/// not (ext4) makes it.
fn plan_on(local: &Files, remote: &Files, s: &State, folds: bool) -> Vec<Action> {
    plan(local, remote, s, true, folds, &copy).actions
}

#[test]
fn a_respelling_here_yields_to_an_edit_there_where_names_fold() {
    // A, offline, renamed `Bem-vindo.md` to `bem-vindo.md` (same bytes);
    // W edited `Bem-vindo.md` on the server meanwhile.
    let s = state(&[("Bem-vindo.md", "1")]);
    let local = files(&[("bem-vindo.md", "1")]);
    let remote = files(&[("Bem-vindo.md", "2")]);
    // Folding: one file. It takes the server's spelling back, then W's
    // edit: one file, one name, everywhere.
    assert_eq!(
        plan_on(&local, &remote, &s, true),
        vec![
            Action::RenameLocal {
                from: "bem-vindo.md".into(),
                to: "Bem-vindo.md".into()
            },
            Action::Download {
                path: "Bem-vindo.md".into(),
                hash: "2".into()
            },
        ]
    );
    // Not folding (ext4): two files — the edit comes back under its name,
    // the renamed one is new; nothing is lost.
    let p = plan_on(&local, &remote, &s, false);
    assert_eq!(p.len(), 2, "{p:?}");
    assert!(p.contains(&Action::Download {
        path: "Bem-vindo.md".into(),
        hash: "2".into()
    }));
    assert!(p.contains(&Action::Upload {
        path: "bem-vindo.md".into(),
        base: None
    }));
    // The accents' form alone (decomposed here, composed there) is no
    // respelling: one name, one file everywhere (spec Q7), and this
    // computer keeps the spelling its file system gave the name.
    let s = state(&[("A\u{e7}\u{e3}o.md", "1")]);
    assert_eq!(
        plan_on(
            &files(&[("Ac\u{327}a\u{303}o.md", "1")]),
            &files(&[("A\u{e7}\u{e3}o.md", "2")]),
            &s,
            true
        ),
        vec![
            // The base moves to this computer's spelling first.
            Action::Agree {
                path: "Ac\u{327}a\u{303}o.md".into(),
                hash: Some("1".into())
            },
            Action::Agree {
                path: "A\u{e7}\u{e3}o.md".into(),
                hash: None
            },
            Action::Download {
                path: "Ac\u{327}a\u{303}o.md".into(),
                hash: "2".into()
            },
        ]
    );
}

#[test]
fn a_respelling_and_an_edit_here_against_an_edit_there_is_a_conflict() {
    let s = state(&[("Bem-vindo.md", "1")]);
    let local = files(&[("bem-vindo.md", "3")]);
    let remote = files(&[("Bem-vindo.md", "2")]);
    assert_eq!(
        plan_on(&local, &remote, &s, true),
        vec![
            Action::RenameLocal {
                from: "bem-vindo.md".into(),
                to: "Bem-vindo.md".into()
            },
            Action::Conflict {
                path: "Bem-vindo.md".into(),
                copy: "Bem-vindo (conflito, Mac, 2026-10-10 15.34).md".into(),
                hash: "2".into()
            },
        ]
    );
    let p = plan_on(&local, &remote, &s, false);
    assert_eq!(p.len(), 2, "{p:?}");
    assert!(p.contains(&Action::Download {
        path: "Bem-vindo.md".into(),
        hash: "2".into()
    }));
    assert!(p.contains(&Action::Upload {
        path: "bem-vindo.md".into(),
        base: None
    }));
}

#[test]
fn a_respelling_here_with_an_edit_crosses_as_a_rename_and_the_edit() {
    let s = state(&[("Bem-vindo.md", "1")]);
    assert_eq!(
        plan_on(
            &files(&[("bem-vindo.md", "3")]),
            &files(&[("Bem-vindo.md", "1")]),
            &s,
            true
        ),
        vec![
            Action::RenameRemote {
                from: "Bem-vindo.md".into(),
                to: "bem-vindo.md".into(),
                base: "1".into()
            },
            Action::Upload {
                path: "bem-vindo.md".into(),
                base: Some("1".into())
            },
        ]
    );
}

#[test]
fn a_respelling_there_and_an_edit_here_keep_both_where_names_fold() {
    // The reversed order: A's respelling reached the server first; W,
    // whose base still says `Bem-vindo.md`, edited it.
    let s = state(&[("Bem-vindo.md", "1")]);
    let local = files(&[("Bem-vindo.md", "2")]);
    let remote = files(&[("bem-vindo.md", "1")]);
    assert_eq!(
        plan_on(&local, &remote, &s, true),
        vec![
            Action::RenameLocal {
                from: "Bem-vindo.md".into(),
                to: "bem-vindo.md".into()
            },
            Action::Upload {
                path: "bem-vindo.md".into(),
                base: Some("1".into())
            },
        ]
    );
    // Edited there too: a conflict under the server's spelling.
    assert_eq!(
        plan_on(&local, &files(&[("bem-vindo.md", "3")]), &s, true),
        vec![
            Action::RenameLocal {
                from: "Bem-vindo.md".into(),
                to: "bem-vindo.md".into()
            },
            Action::Conflict {
                path: "bem-vindo.md".into(),
                copy: "bem-vindo (conflito, Mac, 2026-10-10 15.34).md".into(),
                hash: "3".into()
            },
        ]
    );
    // Not folding: two files, each crossing.
    let p = plan_on(&local, &remote, &s, false);
    assert_eq!(p.len(), 2, "{p:?}");
    assert!(p.contains(&Action::Upload {
        path: "Bem-vindo.md".into(),
        base: None
    }));
    assert!(p.contains(&Action::Download {
        path: "bem-vindo.md".into(),
        hash: "1".into()
    }));
}

#[test]
fn two_spellings_made_apart_are_one_file_where_names_fold() {
    // Made on each side before any sync: the server's spelling is kept,
    // the same bytes agree, different bytes are a conflict.
    let s = State::default();
    assert_eq!(
        plan_on(
            &files(&[("nota.md", "1")]),
            &files(&[("Nota.md", "1")]),
            &s,
            true
        ),
        vec![
            Action::RenameLocal {
                from: "nota.md".into(),
                to: "Nota.md".into()
            },
            Action::Agree {
                path: "Nota.md".into(),
                hash: Some("1".into())
            },
        ]
    );
    let p = plan_on(
        &files(&[("nota.md", "1")]),
        &files(&[("Nota.md", "2")]),
        &s,
        true,
    );
    assert_eq!(p.len(), 2, "{p:?}");
    assert!(matches!(&p[1], Action::Conflict { path, .. } if path == "Nota.md"));
}

/* ---------- One name is one file everywhere: the accents' two forms ---------- */

/// `Café.md` with its `é` composed (NFC), as Windows, Linux and the
/// server mostly write it…
const COMPOSED: &str = "Caf\u{e9}.md";
/// …and decomposed (NFD), `e` and a combining accent, as HFS+ wrote it and
/// as a file copied from a Mac may keep it.
const DECOMPOSED: &str = "Cafe\u{301}.md";

/// A device whose file system does not fold names (ext4) holding the
/// decomposed spelling, the server the composed one: one file (spec Q7,
/// decided 2026-10-10), on a device that folds names as on one that does
/// not — never a second file, never a rename for the form alone.
#[test]
fn the_two_forms_of_a_name_are_one_file_on_every_device() {
    for folds in [false, true] {
        // The first sync: the same bytes agree under this device's
        // spelling.
        assert_eq!(
            plan_on(
                &files(&[(DECOMPOSED, "1")]),
                &files(&[(COMPOSED, "1")]),
                &State::default(),
                folds
            ),
            vec![Action::Agree {
                path: DECOMPOSED.into(),
                hash: Some("1".into())
            }],
            "folds {folds}"
        );
        // Edited there: fetched under this device's spelling.
        let s = state(&[(DECOMPOSED, "1")]);
        assert_eq!(
            plan_on(
                &files(&[(DECOMPOSED, "1")]),
                &files(&[(COMPOSED, "2")]),
                &s,
                folds
            ),
            vec![Action::Download {
                path: DECOMPOSED.into(),
                hash: "2".into()
            }],
            "folds {folds}"
        );
        // Edited here: sent under this device's spelling, based on the
        // server's bytes; the server writes it to the file it keeps.
        assert_eq!(
            plan_on(
                &files(&[(DECOMPOSED, "3")]),
                &files(&[(COMPOSED, "1")]),
                &s,
                folds
            ),
            vec![Action::Upload {
                path: DECOMPOSED.into(),
                base: Some("1".into())
            }],
            "folds {folds}"
        );
        // Deleted here: deleted there — its base under the spelling the
        // file has left, the server's, first.
        assert_eq!(
            plan_on(&Files::new(), &files(&[(COMPOSED, "1")]), &s, folds),
            vec![
                Action::Agree {
                    path: COMPOSED.into(),
                    hash: Some("1".into())
                },
                Action::Agree {
                    path: DECOMPOSED.into(),
                    hash: None
                },
                Action::DeleteRemote {
                    path: COMPOSED.into(),
                    base: "1".into()
                },
            ],
            "folds {folds}"
        );
    }
}

/// A base the device kept under the server's spelling before the decision
/// — a device that fetched `Café.md` composed, then had its file
/// respelled decomposed by a copy — is the same file's base: the device's
/// spelling stays, and nothing crosses for the form.
#[test]
fn a_base_under_the_other_form_is_the_files_base() {
    let s = state(&[(COMPOSED, "1")]);
    let p = plan(
        &files(&[(DECOMPOSED, "1")]),
        &files(&[(COMPOSED, "1")]),
        &s,
        false,
        false,
        &copy,
    );
    assert_eq!(
        p.actions,
        vec![
            Action::Agree {
                path: DECOMPOSED.into(),
                hash: Some("1".into())
            },
            Action::Agree {
                path: COMPOSED.into(),
                hash: None
            },
        ]
    );
    assert_eq!(p.pause, None);
}

/// Changed on both sides under the two forms: a conflict (ADR 0079 item
/// 8) — the server's version under this device's spelling, this device's
/// beside it as a copy.
#[test]
fn both_forms_changed_is_a_conflict() {
    let s = state(&[(DECOMPOSED, "1")]);
    assert_eq!(
        plan_on(
            &files(&[(DECOMPOSED, "2")]),
            &files(&[(COMPOSED, "3")]),
            &s,
            false
        ),
        vec![Action::Conflict {
            path: DECOMPOSED.into(),
            copy: "Cafe\u{301} (conflito, Mac, 2026-10-10 15.34).md".into(),
            hash: "3".into()
        }]
    );
    // Made apart on each side, different bytes: the same.
    assert!(matches!(
        plan_on(
            &files(&[(DECOMPOSED, "2")]),
            &files(&[(COMPOSED, "3")]),
            &State::default(),
            false
        )
        .as_slice(),
        [Action::Conflict { path, hash, .. }] if path == DECOMPOSED && hash == "3"
    ));
}

/// A device on ext4 that holds both forms as two files — the state the
/// sync campaign of 2026-10-10 left on its Linux and Windows devices
/// (finding F20): one of them syncs, the other is held and said, the same
/// one on every pass — never sent to be refused, never looping.
#[test]
fn both_forms_as_two_files_here_send_one_and_hold_the_other() {
    let local = files(&[(COMPOSED, "1"), (DECOMPOSED, "2")]);
    // Neither known: the composed spelling, the server's, syncs.
    let p = plan(
        &local,
        &Files::new(),
        &State::default(),
        false,
        false,
        &copy,
    );
    assert_eq!(
        p.actions,
        vec![Action::Upload {
            path: COMPOSED.into(),
            base: None
        }]
    );
    assert_eq!(
        p.held,
        vec![Held {
            path: DECOMPOSED.into(),
            here: true,
            case: false
        }]
    );
    // The next pass: the same one held, nothing else to do.
    let p = plan(
        &local,
        &files(&[(COMPOSED, "1")]),
        &state(&[(COMPOSED, "1")]),
        false,
        false,
        &copy,
    );
    assert_eq!(p.actions, vec![]);
    assert_eq!(
        p.held,
        vec![Held {
            path: DECOMPOSED.into(),
            here: true,
            case: false
        }]
    );
    // The one the base knows syncs, whichever its form; the other is held
    // and never taken for a deletion of the first.
    let p = plan(
        &local,
        &files(&[(COMPOSED, "2")]),
        &state(&[(DECOMPOSED, "2")]),
        false,
        false,
        &copy,
    );
    assert_eq!(p.actions, vec![]);
    assert_eq!(
        p.held,
        vec![Held {
            path: COMPOSED.into(),
            here: true,
            case: false
        }]
    );
    // The held one deleted by the person: the other syncs as before.
    let p = plan(
        &files(&[(DECOMPOSED, "4")]),
        &files(&[(COMPOSED, "2")]),
        &state(&[(DECOMPOSED, "2")]),
        false,
        false,
        &copy,
    );
    assert_eq!(
        p.actions,
        vec![Action::Upload {
            path: DECOMPOSED.into(),
            base: Some("2".into())
        }]
    );
    assert_eq!(p.held, vec![]);
}

/// Where names fold, a base holding two spellings of one name (a
/// respelling refused, the edit after it sent through the new spelling)
/// is one entry again before anything is planned: under the server's
/// spelling, with the hash the server's file still has — so the
/// respelling and the edit cross, instead of an upload and a fetch
/// refused on every pass.
#[test]
fn two_spellings_in_the_base_are_one_entry_where_names_fold() {
    let s = state(&[("a.md", "3"), ("A.md", "6")]);
    let local = files(&[("A.md", "19")]);
    let remote = files(&[("a.md", "6")]);
    assert_eq!(
        plan_on(&local, &remote, &s, true),
        vec![
            Action::Agree {
                path: "A.md".into(),
                hash: None
            },
            Action::Agree {
                path: "a.md".into(),
                hash: Some("6".into())
            },
            Action::RenameRemote {
                from: "a.md".into(),
                to: "A.md".into(),
                base: "6".into()
            },
            Action::Upload {
                path: "A.md".into(),
                base: Some("6".into())
            },
        ]
    );
    // Each side still has one of the base's hashes, apart: neither is
    // taken as unchanged — a conflict, nothing written over.
    let local = files(&[("A.md", "6")]);
    let remote = files(&[("a.md", "3")]);
    let p = plan_on(&local, &remote, &s, true);
    assert_eq!(
        p[..2],
        [
            Action::Agree {
                path: "A.md".into(),
                hash: None
            },
            Action::Agree {
                path: "a.md".into(),
                hash: None
            },
        ]
    );
    assert!(
        p.iter()
            .any(|a| matches!(a, Action::Conflict { path, .. } if path == "a.md")),
        "{p:?}"
    );
    assert!(
        !p.iter()
            .any(|a| matches!(a, Action::Upload { .. } | Action::Download { .. })),
        "{p:?}"
    );
}

/* ---------- The guardrail: two devices, a server, random orders ---------- */

/// A small deterministic generator: the same seed, the same run.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

/// A file's content is its hash here: each edit writes a new, unique one.
type Disk = BTreeMap<String, String>;

struct Device {
    name: &'static str,
    disk: Disk,
    state: State,
}

fn picture(disk: &Disk) -> Files {
    disk.iter().map(|(p, c)| (p.clone(), f(c))).collect()
}

/// The path other than `path` that a file system folding names (`folds`)
/// takes for the same file, if `disk` holds one.
fn twin(disk: &Disk, path: &str, folds: bool) -> Option<String> {
    let key = super::folded(path);
    disk.keys()
        .find(|p| folds && p.as_str() != path && super::folded(p) == key)
        .cloned()
}

/// The file the server's disk keeps for a path a device names: the path,
/// or the spelling of its name in the other Unicode form — on every
/// server (spec Q7), as `verso-server` resolves a device's path — and, on
/// a server whose file system folds names (`folds`), the spelling of its
/// name in another case: a write, read, deletion or rename through any
/// spelling reaches the one file the server keeps, under its own spelling
/// (`as_spelled` in `verso-server`).
fn on_server(server: &Disk, path: &str, folds: bool) -> String {
    if server.contains_key(path) {
        return path.to_owned();
    }
    let same = |p: &str| {
        if folds {
            super::folded(p) == super::folded(path)
        } else {
            super::folded_form(p) == super::folded_form(path)
        }
    };
    server
        .keys()
        .find(|p| same(p))
        .cloned()
        .unwrap_or_else(|| path.to_owned())
}

/// How a sync goes: whether the person said yes to deletions, and the
/// chance in a hundred that the server refuses a change (another write
/// landed first) — the host then plans it again on the next pass — and
/// that it refuses a rename in particular. And whether the devices' file
/// systems fold names, and the server's.
struct Go<'a> {
    confirmed: bool,
    refuse: u64,
    refuse_renames: u64,
    rng: &'a mut Rng,
    folds: bool,
    server_folds: bool,
}

/// One device's sync against the server, as the host carries a plan out:
/// a change the server refuses (its base moved) leaves the base as it was,
/// to be planned again; a plan that pauses for deletions does nothing.
/// What a device downloads is not "seen" by a person: only an edit or a
/// deletion made on a device marks what it replaced as seen. Where names
/// fold, a new file whose name another holds is refused on either side,
/// as `verso-fs` and the server refuse it. The server addresses a path by
/// the file it keeps for the name ([`on_server`]); a device writes under
/// the path the plan names, its own spelling.
fn sync(d: &mut Device, server: &mut Disk, go: &mut Go<'_>) {
    let p = plan(
        &picture(&d.disk),
        &picture(server),
        &d.state,
        go.confirmed,
        go.folds,
        &|p: &str, t: &BTreeSet<String>| conflict_name(p, d.name, "t", true, t),
    );
    if p.pause.is_some() {
        return;
    }
    let (folds, server_folds) = (go.folds, go.server_folds);
    let at = |server: &Disk, p: &str| on_server(server, p, server_folds);
    for a in p.actions {
        // The server refuses this one: nothing of it happens. The steps
        // after it go on, even on the same file — harsher than the host,
        // which leaves those to the next pass.
        if go.rng.below(100) < go.refuse
            || (go.refuse_renames > 0
                && matches!(a, Action::RenameRemote { .. })
                && go.rng.below(100) < go.refuse_renames)
        {
            continue;
        }
        match a {
            Action::Upload { path, base } => {
                let there = at(server, &path);
                if server.get(&there) == base.as_ref()
                    && let Some(c) = d.disk.get(&path).cloned()
                {
                    server.insert(there, c.clone());
                    d.state.base.insert(path, c);
                }
            }
            Action::Download { path, hash } => {
                if server.get(&at(server, &path)) == Some(&hash)
                    && (d.disk.contains_key(&path) || twin(&d.disk, &path, folds).is_none())
                {
                    d.disk.insert(path.clone(), hash.clone());
                    d.state.base.insert(path, hash);
                }
            }
            Action::DeleteRemote { path, base } => {
                let there = at(server, &path);
                if server.get(&there) == Some(&base) {
                    server.remove(&there);
                    d.state.base.remove(&path);
                }
            }
            Action::DeleteLocal { path } => {
                d.disk.remove(&path);
                d.state.base.remove(&path);
            }
            Action::RenameRemote { from, to, base } => {
                let (old, new) = (at(server, &from), at(server, &to));
                if server.get(&old) == Some(&base) && (!server.contains_key(&new) || new == old) {
                    // The accents' form alone: the same name, nothing to
                    // move on the server. Its case alone, where the server
                    // folds names: the file itself takes the new spelling.
                    if super::folded_form(&from) != super::folded_form(&to) {
                        let c = server.remove(&old).unwrap_or_default();
                        server.insert(to.clone(), c);
                    }
                    d.state.base.remove(&from);
                    d.state.base.insert(to, base);
                }
            }
            // As the host: the file moves, and its base with it.
            Action::RenameLocal { from, to } => {
                if !d.disk.contains_key(&to)
                    && twin(&d.disk, &to, folds).is_none_or(|t| t == from)
                    && let Some(c) = d.disk.remove(&from)
                {
                    d.disk.insert(to.clone(), c);
                    if let Some(b) = d.state.base.remove(&from) {
                        d.state.base.insert(to, b);
                    }
                }
            }
            Action::Conflict { path, copy, hash } => {
                if server.get(&at(server, &path)) == Some(&hash)
                    && !server.contains_key(&at(server, &copy))
                    && let Some(mine) = d.disk.remove(&path)
                {
                    d.disk.insert(copy.clone(), mine.clone());
                    server.insert(copy.clone(), mine.clone());
                    d.state.base.insert(copy, mine);
                    d.disk.insert(path.clone(), hash.clone());
                    d.state.base.insert(path, hash);
                }
            }
            Action::Agree { path, hash } => match hash {
                Some(h) => {
                    d.state.base.insert(path, h);
                }
                None => {
                    d.state.base.remove(&path);
                }
            },
        }
    }
}

/// A path with its accents in the other Unicode form, if it has any.
fn other_form(path: &str) -> Option<String> {
    if path.contains('\u{e9}') {
        Some(path.replace('\u{e9}', "e\u{301}"))
    } else if path.contains("e\u{301}") {
        Some(path.replace("e\u{301}", "\u{e9}"))
    } else {
        None
    }
}

/// Files by name as sync compares them (spec Q7): one name, one file.
fn by_name(disk: &Disk) -> BTreeMap<String, String> {
    disk.iter()
        .map(|(p, c)| (super::folded_form(p), c.clone()))
        .collect()
}

/// Where a run happens: whether the devices' file systems fold names, the
/// server's, and whether names differing in case are in play — not
/// against a server that folds names from devices that do not (spec Q8:
/// two files that exist there are one here; a new one is refused since
/// 2026-10-12, where it is made, which this model of the disks leaves out). And the chance in a hundred
/// that the server refuses a rename while the person works, on top of
/// any change refused.
#[derive(Clone, Copy)]
struct Systems {
    folds: bool,
    server_folds: bool,
    cases: bool,
    refuse_renames: u64,
}

/// Two devices and a server, 40 random steps from a seed, then syncs
/// until quiet: the devices end with the server's files, name by name —
/// each keeps its own spelling of an accent's form, and a file a device
/// holds apart (both forms of a name, as two files) stays apart —, the
/// server holds one file per name, and no edit is lost that nobody saw.
fn run(seed: u64, on: Systems) {
    let Systems {
        folds,
        server_folds,
        cases,
        refuse_renames,
    } = on;
    let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
    let mut server: Disk = BTreeMap::new();
    let mut devices = [
        Device {
            name: "Mac",
            disk: BTreeMap::new(),
            state: State::default(),
        },
        Device {
            name: "PC",
            disk: BTreeMap::new(),
            state: State::default(),
        },
    ];
    // Every content ever written, and every content a person or a
    // device came to see: an edit may replace only what was seen.
    let mut written: BTreeSet<String> = BTreeSet::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut counter = 0u64;
    // Two of them one file where names fold; two of them one name, its
    // accent composed and decomposed, everywhere.
    let mut names = vec!["a.md", "b.md", "pasta/d.md", "e.png", COMPOSED, DECOMPOSED];
    if cases {
        names.push("A.md");
    }
    let what = if cases { "case, accents" } else { "accents" };
    let said = format!("seed {seed} (folds {folds}, server {server_folds}, {what})");
    for _ in 0..40 {
        let who = usize::try_from(rng.below(2)).unwrap_or(0);
        let d = &mut devices[who];
        match rng.below(6) {
            // Edit or create: where names fold, a name another file holds
            // is that file. Where they do not, both forms of a name can be
            // two files.
            0 | 1 => {
                counter += 1;
                let content = format!("v{counter}");
                let named =
                    names[usize::try_from(rng.below(names.len() as u64)).unwrap_or(0)].to_owned();
                let path = twin(&d.disk, &named, folds).unwrap_or(named);
                if let Some(old) = d.disk.get(&path) {
                    seen.insert(old.clone());
                }
                written.insert(content.clone());
                d.disk.insert(path, content);
            }
            // Delete.
            2 => {
                let list: Vec<String> = d.disk.keys().cloned().collect();
                if !list.is_empty() {
                    let path = &list[usize::try_from(rng.below(list.len() as u64)).unwrap_or(0)];
                    if let Some(old) = d.disk.remove(path) {
                        seen.insert(old);
                    }
                }
            }
            // Rename: to another name, or the same name respelled — its
            // first letter's case swapped, or its accent's form.
            3 => {
                let list: Vec<String> = d.disk.keys().cloned().collect();
                if !list.is_empty() {
                    let from =
                        list[usize::try_from(rng.below(list.len() as u64)).unwrap_or(0)].clone();
                    let to = match rng.below(4) {
                        3 if other_form(&from).is_some() => other_form(&from).unwrap_or_default(),
                        3 if cases => {
                            let mut chars = from.chars();
                            let first = chars.next().unwrap_or('x');
                            let swapped: String = if first.is_uppercase() {
                                first.to_lowercase().collect()
                            } else {
                                first.to_uppercase().collect()
                            };
                            format!("{swapped}{}", chars.as_str())
                        }
                        n => format!("renomeada-{n}.md"),
                    };
                    if !d.disk.contains_key(&to)
                        && twin(&d.disk, &to, folds).is_none_or(|t| t == from)
                        && let Some(c) = d.disk.remove(&from)
                    {
                        d.disk.insert(to, c);
                    }
                }
            }
            // Sync: now and then without a yes to deletions, now and
            // then with the server refusing some changes.
            _ => {
                let confirmed = rng.below(3) != 0;
                let refuse = if rng.below(2) == 0 { 0 } else { 30 };
                let before = (d.disk.clone(), server.clone());
                let paused = plan(
                    &picture(&d.disk),
                    &picture(&server),
                    &d.state,
                    confirmed,
                    folds,
                    &|p: &str, t: &BTreeSet<String>| conflict_name(p, d.name, "t", true, t),
                )
                .pause
                .is_some();
                sync(
                    d,
                    &mut server,
                    &mut Go {
                        confirmed,
                        refuse,
                        refuse_renames,
                        rng: &mut rng,
                        folds,
                        server_folds,
                    },
                );
                if paused {
                    assert_eq!(
                        (d.disk.clone(), server.clone()),
                        before,
                        "{said}: a paused plan changed files"
                    );
                }
            }
        }
    }
    // Quiet: sync until nothing moves.
    for _ in 0..6 {
        for d in &mut devices {
            sync(
                d,
                &mut server,
                &mut Go {
                    confirmed: true,
                    refuse: 0,
                    refuse_renames: 0,
                    rng: &mut rng,
                    folds,
                    server_folds,
                },
            );
        }
    }
    // One name, one file on the server (spec Q7) — and, where its file
    // system folds names, one file per name whatever its case.
    assert_eq!(by_name(&server).len(), server.len(), "{said}: {server:?}");
    if server_folds {
        let folded: BTreeSet<String> = server.keys().map(|p| super::folded(p)).collect();
        assert_eq!(folded.len(), server.len(), "{said}: {server:?}");
    }
    for d in &devices {
        let last = plan(
            &picture(&d.disk),
            &picture(&server),
            &d.state,
            true,
            folds,
            &copy,
        );
        assert!(
            last.actions
                .iter()
                .all(|a| matches!(a, Action::Agree { .. })),
            "{said}: {} still has work: {:?}",
            d.name,
            last.actions
        );
        // Where names fold, one base entry per name, as one file.
        if folds {
            let named: BTreeSet<String> = d.state.base.keys().map(|p| super::folded(p)).collect();
            assert_eq!(
                named.len(),
                d.state.base.len(),
                "{said}: {} keeps two spellings of a name: {:?}",
                d.name,
                d.state.base
            );
        }
        let mut synced = d.disk.clone();
        let mut there = server.clone();
        for h in &last.held {
            // Two files on the server whose names differ only in case:
            // this device keeps one and holds the other there (spec Q8).
            if h.case {
                assert!(!h.here && cases && !server_folds, "{said}: {h:?}");
                there.remove(&h.path);
                continue;
            }
            assert!(h.here, "{said}: the server holds both forms: {server:?}");
            synced.remove(&h.path);
        }
        assert_eq!(
            by_name(&synced),
            by_name(&there),
            "{said}: {} differs from the server",
            d.name
        );
    }
    let present: BTreeSet<&String> = server
        .values()
        .chain(devices.iter().flat_map(|d| d.disk.values()))
        .collect();
    for c in &written {
        assert!(
            present.contains(c) || seen.contains(c),
            "{said}: the edit {c} was lost unseen"
        );
    }
}

#[test]
fn two_devices_and_a_server_end_alike_and_lose_no_edit() {
    for seed in 1..=300u64 {
        run(
            seed,
            Systems {
                folds: false,
                server_folds: false,
                cases: true,
                refuse_renames: 0,
            },
        );
    }
}

/// The same where the devices' file systems fold names (two Macs, or a
/// Mac and a Windows PC), against a server on Linux (ext4) and on a Mac:
/// a name respelled on one device and the file edited on the other end as
/// one file everywhere.
#[test]
fn where_names_fold_two_devices_and_a_server_end_alike_and_lose_no_edit() {
    for seed in 1..=300u64 {
        for server_folds in [false, true] {
            run(
                seed,
                Systems {
                    folds: true,
                    server_folds,
                    cases: true,
                    refuse_renames: 0,
                },
            );
        }
    }
}

/// Devices on ext4, which keep a name's two Unicode forms as two files,
/// against a server on a Mac (APFS, which folds them) — the other pairing
/// runs above: one name is one file everywhere (spec Q7). Case stays out:
/// against a server that folds it, two names differing in case on ext4
/// are spec Q8 (a new one refused where it is made since 2026-10-12).
#[test]
fn the_two_forms_of_a_name_end_as_one_file_against_a_server_that_folds_names() {
    for seed in 1..=300u64 {
        run(
            seed,
            Systems {
                folds: false,
                server_folds: true,
                cases: false,
                refuse_renames: 0,
            },
        );
    }
}

/// Devices that fold names against a server that folds them, names
/// respelled in case and the server refusing half the renames: a respelling
/// refused and the edit after it sent through the new spelling — which
/// the server writes to the file it keeps — once left both spellings in a
/// device's base, and the device sent and fetched the file forever. No
/// device has work left after the quiet passes, and none keeps two
/// spellings of a name in its base.
#[test]
fn where_names_fold_a_refused_respelling_never_leaves_a_device_working() {
    for seed in 1..=500u64 {
        run(
            seed,
            Systems {
                folds: true,
                server_folds: true,
                cases: true,
                refuse_renames: 50,
            },
        );
    }
}

/// The sync protocol's versions (item 5): the newer side takes its own
/// and the one before, and refuses an older one.
#[test]
fn a_side_follows_its_own_sync_and_the_one_before_not_older() {
    assert!(follows(1, 1));
    assert!(follows(1, 0));
    assert!(follows(3, 3));
    assert!(follows(3, 2));
    assert!(!follows(3, 1));
    assert!(!follows(3, 0));
    // Newer than this side: the newer side's to judge.
    assert!(follows(1, 2));
}

/// A piece of a file in a binary message (item 12, revised 2026-10-12):
/// its header and its bytes come back as they went, whatever the bytes —
/// no base64 — and a message shorter than its header says is no frame.
#[test]
fn a_piece_crosses_in_a_frame_as_it_is() {
    use super::{binary_pieces, frame, unframe};
    let header = br#"{"id":7,"cmd":"sync_put","args":{"path":"a.bin","offset":0}}"#;
    let bytes: Vec<u8> = (0..=255).cycle().take(70_000).collect();
    let message = frame(header, &bytes);
    assert_eq!(message.len(), 4 + header.len() + bytes.len());
    let (h, data) = unframe(&message).unwrap();
    assert_eq!(h, header);
    assert_eq!(data, bytes.as_slice());
    // An empty piece (the end of a file of a whole number of pieces).
    let empty = frame(b"{}", &[]);
    let (h, data) = unframe(&empty).unwrap();
    assert_eq!((h, data), (&b"{}"[..], &[][..]));
    // Cut short: refused, never read past its end.
    assert_eq!(unframe(&message[..4 + header.len() - 1]), None);
    assert_eq!(unframe(&[0, 0, 0]), None);
    assert_eq!(unframe(&[0xff, 0xff, 0xff, 0xff, b'{']), None);
    // Sync 2 sends pieces as frames; sync 1 and a side that says none,
    // base64.
    assert!(binary_pieces(2));
    assert!(!binary_pieces(1));
    assert!(!binary_pieces(0));
}

/// Two files on the server whose names differ only in case (spec Q8: its
/// disk keeps both; a new one is refused where it is made): this computer
/// keeps one and holds the other, said once, the same on every pass —
/// never fetched to be refused here. One it has or synced before stays in
/// play, on a computer that folds names or not.
#[test]
fn case_twins_on_the_server_keep_one_here_and_hold_the_other() {
    let remote = files(&[("Nota.md", "1"), ("nota.md", "2")]);
    let held = |p: &str| Held {
        path: p.into(),
        here: false,
        case: true,
    };
    for folds in [false, true] {
        // First sync: the first in byte order comes, the other is held.
        let p = plan(
            &Files::new(),
            &remote,
            &State::default(),
            false,
            folds,
            &copy,
        );
        assert_eq!(
            p.actions,
            vec![Action::Download {
                path: "Nota.md".into(),
                hash: "1".into()
            }],
            "folds: {folds}"
        );
        assert_eq!(p.held, vec![held("nota.md")], "folds: {folds}");
        // Next pass: nothing to do, the same one held.
        let p = plan(
            &files(&[("Nota.md", "1")]),
            &remote,
            &state(&[("Nota.md", "1")]),
            false,
            folds,
            &copy,
        );
        assert_eq!(p.actions, vec![], "folds: {folds}");
        assert_eq!(p.held, vec![held("nota.md")], "folds: {folds}");
        // The one this computer has, whichever, is the one kept.
        let p = plan(
            &files(&[("nota.md", "2")]),
            &remote,
            &state(&[("nota.md", "2")]),
            false,
            folds,
            &copy,
        );
        assert_eq!(p.actions, vec![], "folds: {folds}");
        assert_eq!(p.held, vec![held("Nota.md")], "folds: {folds}");
    }
    // A Linux device holding both syncs both, and a deletion of one of
    // them here still crosses.
    let both = state(&[("Nota.md", "1"), ("nota.md", "2")]);
    let p = plan(&remote, &remote, &both, false, false, &copy);
    assert_eq!((p.actions, p.held), (vec![], vec![]));
    let p = plan(
        &files(&[("Nota.md", "1")]),
        &remote,
        &both,
        false,
        false,
        &copy,
    );
    assert_eq!(
        p.actions,
        vec![Action::DeleteRemote {
            path: "nota.md".into(),
            base: "2".into()
        }]
    );
    assert_eq!(p.held, vec![]);
}

/// A long pass saved as it goes ([`super::Checkpoint`]) and cut short:
/// the next pass does only what was not done and saved — each file
/// fetched once more at most, the one done after the last save agreed,
/// not a conflict — and the saved base never names a step not done.
#[test]
fn a_pass_cut_short_goes_on_from_its_last_save() {
    use super::{Checkpoint, Loaded, load_checked, save};
    let config = tempfile::tempdir().unwrap();
    let remote = files(&[
        ("1.md", "a"),
        ("2.md", "b"),
        ("3.md", "c"),
        ("4.md", "d"),
        ("5.md", "e"),
    ]);
    let mut local = Files::new();
    let mut st = State::default();
    let p = plan(&local, &remote, &st, false, false, &copy);
    assert_eq!(p.actions.len(), 5);
    let mut checkpoint = Checkpoint::new(2, std::time::Duration::from_secs(3600));
    // The host's loop: a step carried out, its base entry, then perhaps a
    // save; the link drops after the third step.
    for action in p.actions.iter().take(3) {
        let Action::Download { path, hash } = action else {
            panic!("{action:?}")
        };
        local.insert(path.clone(), f(hash));
        st.base.insert(path.clone(), hash.clone());
        if checkpoint.step() {
            save(Some(config.path()), "k", &st).unwrap();
        }
    }
    let Loaded::Found(kept) = load_checked(Some(config.path()), "k").unwrap() else {
        panic!("no state saved");
    };
    assert_eq!(kept.base.len(), 2);
    assert!(kept.base.keys().all(|p| local.contains_key(p)));
    let again = plan(&local, &remote, &kept, false, false, &copy);
    let downloads: Vec<&str> = again
        .actions
        .iter()
        .filter_map(|a| match a {
            Action::Download { path, .. } => Some(path.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(downloads, vec!["4.md", "5.md"]);
    assert!(
        again
            .actions
            .iter()
            .all(|a| matches!(a, Action::Download { .. } | Action::Agree { .. }))
    );
    assert!(again.pause.is_none());
}

#[test]
fn a_checkpoint_comes_by_steps_or_by_time() {
    use super::Checkpoint;
    let mut by_steps = Checkpoint::new(3, std::time::Duration::from_secs(3600));
    let said: Vec<bool> = (0..7).map(|_| by_steps.step()).collect();
    assert_eq!(said, [false, false, true, false, false, true, false]);
    let mut by_time = Checkpoint::new(1000, std::time::Duration::ZERO);
    assert!(by_time.step() && by_time.step());
    // Never zero steps: every step at most.
    let mut every = Checkpoint::new(0, std::time::Duration::from_secs(3600));
    assert!(every.step());
}
