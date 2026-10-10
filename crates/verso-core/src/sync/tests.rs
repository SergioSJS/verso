// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The engine's rules, one by one, and its guardrail (ADR 0079,
//! Consequences): two devices and a server editing at random and syncing
//! in random orders end with the same files and lose no edit nobody saw.

use std::collections::{BTreeMap, BTreeSet};

use super::{Action, FileState, Files, State, conflict_name, plan};

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
    let p = plan(&local, &remote, &s, true, &copy);
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
    let p = plan(&local, &remote, &s, true, &copy);
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
    let p = plan(&local, &remote, &s, false, &copy);
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
    let p = plan(&Files::new(), &remote, &s, false, &copy);
    assert_eq!(p.pause, Some(60));
    let p = plan(&Files::new(), &remote, &s, true, &copy);
    assert_eq!(p.pause, None);
}

#[test]
fn a_rename_on_one_side_is_a_rename_on_the_other() {
    let s = state(&[("velho.md", "1")]);
    let p = plan(
        &files(&[("novo.md", "1")]),
        &files(&[("velho.md", "1")]),
        &s,
        true,
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

/// One device's sync against the server, as the host carries a plan out:
/// a change the server refuses (its base moved) leaves the base as it was,
/// to be planned again.
fn sync(d: &mut Device, server: &mut Disk, seen: &mut BTreeSet<String>) {
    // What this device holds is not "seen" by anyone else until it crosses:
    // an edit only it has, overwritten here, is an edit lost.
    let p = plan(
        &picture(&d.disk),
        &picture(server),
        &d.state,
        true,
        &|p: &str, t: &BTreeSet<String>| conflict_name(p, d.name, "t", true, t),
    );
    for a in p.actions {
        match a {
            Action::Upload { path, base } => {
                if server.get(&path) == base.as_ref() {
                    let c = d.disk[&path].clone();
                    server.insert(path.clone(), c.clone());
                    d.state.base.insert(path, c);
                }
            }
            Action::Download { path, hash } => {
                if server.get(&path) == Some(&hash) {
                    seen.insert(hash.clone());
                    d.disk.insert(path.clone(), hash.clone());
                    d.state.base.insert(path, hash);
                }
            }
            Action::DeleteRemote { path, base } => {
                if server.get(&path) == Some(&base) {
                    server.remove(&path);
                    d.state.base.remove(&path);
                }
            }
            Action::DeleteLocal { path } => {
                d.disk.remove(&path);
                d.state.base.remove(&path);
            }
            Action::RenameRemote { from, to, base } => {
                if server.get(&from) == Some(&base) && !server.contains_key(&to) {
                    let c = server.remove(&from).unwrap_or_default();
                    server.insert(to.clone(), c.clone());
                    d.state.base.remove(&from);
                    d.state.base.insert(to, c);
                }
            }
            Action::RenameLocal { from, to } => {
                if let Some(c) = d.disk.remove(&from) {
                    d.disk.insert(to.clone(), c.clone());
                    d.state.base.remove(&from);
                    d.state.base.insert(to, c);
                }
            }
            Action::Conflict { path, copy, hash } => {
                if server.get(&path) == Some(&hash) && !server.contains_key(&copy) {
                    let mine = d.disk.remove(&path).unwrap_or_default();
                    d.disk.insert(copy.clone(), mine.clone());
                    server.insert(copy.clone(), mine.clone());
                    d.state.base.insert(copy, mine);
                    seen.insert(hash.clone());
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

#[test]
fn two_devices_and_a_server_end_alike_and_lose_no_edit() {
    for seed in 1..=300u64 {
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
        let names = ["a.md", "b.md", "c.md", "pasta/d.md", "e.png"];
        for _ in 0..40 {
            let who = usize::try_from(rng.below(2)).unwrap_or(0);
            let d = &mut devices[who];
            match rng.below(6) {
                // Edit or create.
                0 | 1 => {
                    counter += 1;
                    let content = format!("v{counter}");
                    let path = names[usize::try_from(rng.below(5)).unwrap_or(0)].to_owned();
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
                        let path =
                            &list[usize::try_from(rng.below(list.len() as u64)).unwrap_or(0)];
                        if let Some(old) = d.disk.remove(path) {
                            seen.insert(old);
                        }
                    }
                }
                // Rename.
                3 => {
                    let list: Vec<String> = d.disk.keys().cloned().collect();
                    if !list.is_empty() {
                        let from = list[usize::try_from(rng.below(list.len() as u64)).unwrap_or(0)]
                            .clone();
                        let to = format!("renomeada-{}.md", rng.below(3));
                        if !d.disk.contains_key(&to)
                            && let Some(c) = d.disk.remove(&from)
                        {
                            d.disk.insert(to, c);
                        }
                    }
                }
                // Sync.
                _ => sync(d, &mut server, &mut seen),
            }
        }
        // Quiet: sync until nothing moves.
        for _ in 0..6 {
            for d in &mut devices {
                sync(d, &mut server, &mut seen);
            }
        }
        for d in &devices {
            assert_eq!(
                d.disk, server,
                "seed {seed}: {} differs from the server",
                d.name
            );
        }
        let present: BTreeSet<&String> = server.values().collect();
        for c in &written {
            assert!(
                present.contains(c) || seen.contains(c),
                "seed {seed}: the edit {c} was lost unseen"
            );
        }
    }
}
