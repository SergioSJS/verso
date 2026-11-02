// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The renames the server's log names, followed here as renames (ADR 0079,
//! decided 2026-10-31, B12) — whatever the bytes did since — and the
//! fallbacks that lose nothing.

use std::collections::{BTreeMap, BTreeSet};

use super::{Action, FileState, Files, State, conflict_name, plan_moved};

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

fn moves(list: &[(&str, &str)]) -> BTreeMap<String, String> {
    list.iter()
        .map(|(to, from)| ((*to).to_owned(), (*from).to_owned()))
        .collect()
}

fn copy(p: &str, taken: &BTreeSet<String>) -> String {
    conflict_name(p, "Mac", "2026-10-31 10.00", true, taken)
}

fn plan_of(
    local: &Files,
    remote: &Files,
    s: &State,
    moved: &BTreeMap<String, String>,
) -> Vec<Action> {
    plan_moved(local, remote, s, true, false, moved, &copy).actions
}

fn rename(from: &str, to: &str) -> Action {
    Action::RenameLocal {
        from: from.into(),
        to: to.into(),
    }
}

/// Edited in the window, then renamed, before this computer's pass: the
/// bytes there are not the base's, so no pairing by hash sees a rename —
/// the log does.
#[test]
fn a_rename_the_log_names_is_a_rename_here_though_the_bytes_changed() {
    let s = state(&[("alvo.md", "1")]);
    let local = files(&[("alvo.md", "1")]);
    let remote = files(&[("alvo-renomeado.md", "2")]);
    let moved = moves(&[("alvo-renomeado.md", "alvo.md")]);
    assert_eq!(
        plan_of(&local, &remote, &s, &moved),
        vec![
            rename("alvo.md", "alvo-renomeado.md"),
            Action::Download {
                path: "alvo-renomeado.md".into(),
                hash: "2".into()
            }
        ]
    );
    // Without the log, as before: the old name deleted, the new fetched.
    let plain = plan_of(&local, &remote, &s, &BTreeMap::new());
    assert!(plain.contains(&Action::DeleteLocal {
        path: "alvo.md".into()
    }));
}

/// Renamed there, edited here: renamed here, and the edit sent over the
/// server's file as the base left it; both edited: a conflict under the
/// new name.
#[test]
fn an_edit_here_goes_with_the_file_to_its_new_name() {
    let s = state(&[("a.md", "1")]);
    let moved = moves(&[("b.md", "a.md")]);
    assert_eq!(
        plan_of(
            &files(&[("a.md", "3")]),
            &files(&[("b.md", "1")]),
            &s,
            &moved
        ),
        vec![
            rename("a.md", "b.md"),
            Action::Upload {
                path: "b.md".into(),
                base: Some("1".into())
            }
        ]
    );
    let both = plan_of(
        &files(&[("a.md", "3")]),
        &files(&[("b.md", "2")]),
        &s,
        &moved,
    );
    assert_eq!(both[0], rename("a.md", "b.md"));
    assert!(
        matches!(&both[1], Action::Conflict { path, hash, .. } if path == "b.md" && hash == "2"),
        "{both:?}"
    );
    assert_eq!(both.len(), 2, "{both:?}");
    // The same edit on both sides: agreed under the new name.
    assert_eq!(
        plan_of(
            &files(&[("a.md", "2")]),
            &files(&[("b.md", "2")]),
            &s,
            &moved
        ),
        vec![
            rename("a.md", "b.md"),
            Action::Agree {
                path: "b.md".into(),
                hash: Some("2".into())
            }
        ]
    );
}

/// Nothing followed that could lose a file: the new name taken here, the
/// old name back on the server, the file gone here, the new name known to
/// the base — the rules by path decide, as without the log.
#[test]
fn a_rename_that_could_lose_a_file_is_left_to_the_rules_by_path() {
    let s = state(&[("a.md", "1")]);
    let moved = moves(&[("b.md", "a.md")]);
    let alone = |local: &Files, remote: &Files, s: &State| {
        assert_eq!(
            plan_of(local, remote, s, &moved),
            plan_of(local, remote, s, &BTreeMap::new())
        );
    };
    // Taken here.
    let taken = plan_of(
        &files(&[("a.md", "1"), ("b.md", "9")]),
        &files(&[("b.md", "2")]),
        &s,
        &moved,
    );
    assert!(
        !taken
            .iter()
            .any(|a| matches!(a, Action::RenameLocal { .. }))
    );
    assert!(
        taken
            .iter()
            .any(|a| matches!(a, Action::Conflict { path, .. } if path == "b.md")),
        "{taken:?}"
    );
    alone(
        &files(&[("a.md", "1"), ("b.md", "9")]),
        &files(&[("b.md", "2")]),
        &s,
    );
    // A new file under the old name there.
    alone(
        &files(&[("a.md", "1")]),
        &files(&[("a.md", "5"), ("b.md", "2")]),
        &s,
    );
    // Gone here.
    alone(&files(&[]), &files(&[("b.md", "2")]), &s);
    // The new name in the base.
    alone(
        &files(&[("a.md", "1")]),
        &files(&[("b.md", "2")]),
        &state(&[("a.md", "1"), ("b.md", "7")]),
    );
    // The first sync: no base, no rename.
    alone(
        &files(&[("a.md", "1")]),
        &files(&[("b.md", "2")]),
        &state(&[]),
    );
}

/// Two files of the same bytes renamed at once — a folder of empty notes:
/// the log says which went where, and each follows its own; a pairing by
/// hash could swap them.
#[test]
fn files_of_the_same_bytes_follow_the_log_not_the_first_match() {
    let s = state(&[("P/a.md", "0"), ("P/b.md", "0")]);
    let local = files(&[("P/a.md", "0"), ("P/b.md", "0")]);
    let remote = files(&[("Q/x.md", "0"), ("Q/y.md", "0")]);
    let moved = moves(&[("Q/x.md", "P/b.md"), ("Q/y.md", "P/a.md")]);
    let p = plan_of(&local, &remote, &s, &moved);
    assert!(p.contains(&rename("P/b.md", "Q/x.md")), "{p:?}");
    assert!(p.contains(&rename("P/a.md", "Q/y.md")), "{p:?}");
    assert_eq!(p.len(), 2, "{p:?}");
}

/// Only the accents' form changing is one name, one file (spec Q7): nothing
/// to rename. Where names fold, a new name another file here holds in
/// another case is taken.
#[test]
fn the_forms_of_one_name_and_a_case_twin_here() {
    let nfd = "Cafe\u{301}.md";
    let s = state(&[(nfd, "1")]);
    let p = plan_moved(
        &files(&[(nfd, "1")]),
        &files(&[("Caf\u{e9}.md", "2")]),
        &s,
        true,
        true,
        &moves(&[("Caf\u{e9}.md", nfd)]),
        &copy,
    )
    .actions;
    assert!(
        !p.iter().any(|a| matches!(a, Action::RenameLocal { .. })),
        "{p:?}"
    );
    let s = state(&[("a.md", "1")]);
    let p = plan_moved(
        &files(&[("a.md", "1"), ("Nota.md", "8")]),
        &files(&[("nota.md", "2")]),
        &s,
        true,
        true,
        &moves(&[("nota.md", "a.md")]),
        &copy,
    )
    .actions;
    assert!(
        !p.iter()
            .any(|a| matches!(a, Action::RenameLocal { from, .. } if from == "a.md")),
        "{p:?}"
    );
}

/// A small deterministic generator.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n.max(1) as u64)).unwrap_or(0)
    }
}

/// Seeded: the server renames (chains too, onto names this computer may
/// hold), edits; this computer edits. The plan carried out over the
/// pictures never deletes here a file the log moved to a name free here,
/// and no edit is lost: every version this computer made and every one the
/// server holds ends on one side or the other — under the new name, or in
/// a conflict's copy.
#[test]
fn the_logs_renames_in_random_pictures_delete_nothing_and_lose_nothing() {
    for seed in 1..=400_u64 {
        let mut rng = Rng(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1);
        let n = 1 + rng.below(4);
        let base: Vec<(String, String)> = (0..n)
            .map(|i| (format!("f{i}.md"), format!("b{i}")))
            .collect();
        let s = State {
            base: base.iter().cloned().collect(),
            ..State::default()
        };
        let mut local: Files = base.iter().map(|(p, h)| (p.clone(), f(h))).collect();
        let mut remote: Files = local.clone();
        let mut moved: BTreeMap<String, String> = BTreeMap::new();
        for (i, (p, _)) in base.iter().enumerate() {
            if rng.below(3) == 0 {
                local.insert(p.clone(), f(&format!("l{i}")));
            }
            if rng.below(2) == 0 {
                let to = format!("g{}.md", rng.below(6));
                if remote.contains_key(&to) || moved.contains_key(&to) {
                    continue;
                }
                let theirs = remote.remove(p).unwrap();
                let bytes = if rng.below(2) == 0 {
                    f(&format!("r{i}"))
                } else {
                    theirs
                };
                remote.insert(to.clone(), bytes);
                moved.insert(to.clone(), p.clone());
                // A file of this computer's own under the new name.
                if rng.below(4) == 0 {
                    local.insert(to, f(&format!("mine{i}")));
                }
            }
        }
        let plan = plan_moved(&local, &remote, &s, true, false, &moved, &copy);
        // Carried out over the pictures.
        let (mut here, mut there) = (local.clone(), remote.clone());
        for a in &plan.actions {
            match a {
                Action::RenameLocal { from, to } => {
                    assert!(!here.contains_key(to), "seed {seed}: over {to}");
                    let v = here.remove(from).unwrap();
                    here.insert(to.clone(), v);
                }
                Action::Download { path, .. } => {
                    here.insert(path.clone(), there[path].clone());
                }
                Action::Upload { path, .. } => {
                    there.insert(path.clone(), here[path].clone());
                }
                Action::Conflict { path, copy, .. } => {
                    let mine = here.remove(path).unwrap();
                    here.insert(copy.clone(), mine.clone());
                    there.insert(copy.clone(), mine);
                    here.insert(path.clone(), there[path].clone());
                }
                Action::DeleteLocal { path } => {
                    // A file the log moved, its new name free here.
                    let followed = moved
                        .iter()
                        .any(|(to, from)| from == path && !local.contains_key(to));
                    assert!(
                        !followed,
                        "seed {seed}: {path}, which the log moved, went to the bin: {plan:?}"
                    );
                    here.remove(path);
                }
                Action::DeleteRemote { path, .. } => {
                    there.remove(path);
                }
                Action::RenameRemote { from, to, .. } => {
                    let v = there.remove(from).unwrap();
                    there.insert(to.clone(), v);
                }
                Action::Agree { .. } => {}
            }
        }
        let kept: BTreeSet<&String> = here
            .values()
            .chain(there.values())
            .map(|f| &f.hash)
            .collect();
        // Every version nobody saw on the other side: this computer's own,
        // and the server's (a base's version, superseded, is in the
        // server's history and this computer's bin).
        let agreed: BTreeSet<&String> = s.base.values().collect();
        let unseen = |files: &Files| -> Vec<(String, String)> {
            files
                .iter()
                .filter(|(_, v)| !agreed.contains(&v.hash))
                .map(|(p, v)| (p.clone(), v.hash.clone()))
                .collect()
        };
        for (p, v) in unseen(&local).into_iter().chain(unseen(&remote)) {
            assert!(kept.contains(&v), "seed {seed}: {p} ({v}) lost: {plan:?}");
        }
    }
}
