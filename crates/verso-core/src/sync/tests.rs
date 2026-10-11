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
    // The accents' form alone (decomposed here, composed there): the same.
    let s = state(&[("A\u{e7}\u{e3}o.md", "1")]);
    assert_eq!(
        plan_on(
            &files(&[("Ac\u{327}a\u{303}o.md", "1")]),
            &files(&[("A\u{e7}\u{e3}o.md", "2")]),
            &s,
            true
        ),
        vec![
            Action::RenameLocal {
                from: "Ac\u{327}a\u{303}o.md".into(),
                to: "A\u{e7}\u{e3}o.md".into()
            },
            Action::Download {
                path: "A\u{e7}\u{e3}o.md".into(),
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

/// How a sync goes: whether the person said yes to deletions, and the
/// chance in a hundred that the server refuses a change (another write
/// landed first) — the host then plans it again on the next pass. And
/// whether the devices' file systems fold names, and the server's.
struct Go<'a> {
    confirmed: bool,
    refuse: u64,
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
/// as `verso-fs` and the server refuse it.
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
    for a in p.actions {
        // The server refuses this one: nothing of it happens.
        if go.rng.below(100) < go.refuse {
            continue;
        }
        match a {
            Action::Upload { path, base } => {
                if server.get(&path) == base.as_ref()
                    && (base.is_some() || twin(server, &path, server_folds).is_none())
                    && let Some(c) = d.disk.get(&path).cloned()
                {
                    server.insert(path.clone(), c.clone());
                    d.state.base.insert(path, c);
                }
            }
            Action::Download { path, hash } => {
                if server.get(&path) == Some(&hash)
                    && (d.disk.contains_key(&path) || twin(&d.disk, &path, folds).is_none())
                {
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
                if server.get(&from) == Some(&base)
                    && !server.contains_key(&to)
                    && twin(server, &to, server_folds).is_none_or(|t| t == from)
                {
                    let c = server.remove(&from).unwrap_or_default();
                    server.insert(to.clone(), c.clone());
                    d.state.base.remove(&from);
                    d.state.base.insert(to, c);
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
                if server.get(&path) == Some(&hash)
                    && !server.contains_key(&copy)
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

/// Two devices and a server, 40 random steps from a seed, then syncs
/// until quiet: the devices end with the server's files, and no edit is
/// lost that nobody saw. `folds`: the devices' file systems fold names;
/// `server_folds`: the server's does.
fn run(seed: u64, folds: bool, server_folds: bool) {
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
    // Two of them one file where names fold.
    let names = ["a.md", "A.md", "b.md", "pasta/d.md", "e.png"];
    for _ in 0..40 {
        let who = usize::try_from(rng.below(2)).unwrap_or(0);
        let d = &mut devices[who];
        match rng.below(6) {
            // Edit or create: where names fold, a name another file holds
            // is that file.
            0 | 1 => {
                counter += 1;
                let content = format!("v{counter}");
                let named = names[usize::try_from(rng.below(5)).unwrap_or(0)].to_owned();
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
            // Rename: to another name, or the same name respelled (its
            // first letter's case swapped).
            3 => {
                let list: Vec<String> = d.disk.keys().cloned().collect();
                if !list.is_empty() {
                    let from =
                        list[usize::try_from(rng.below(list.len() as u64)).unwrap_or(0)].clone();
                    let to = match rng.below(4) {
                        3 => {
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
                        rng: &mut rng,
                        folds,
                        server_folds,
                    },
                );
                if paused {
                    assert_eq!(
                        (d.disk.clone(), server.clone()),
                        before,
                        "seed {seed}: a paused plan changed files"
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
                    rng: &mut rng,
                    folds,
                    server_folds,
                },
            );
        }
    }
    for d in &devices {
        assert_eq!(
            d.disk, server,
            "seed {seed} (folds {folds}, server {server_folds}): {} differs from the server",
            d.name
        );
    }
    let present: BTreeSet<&String> = server.values().collect();
    for c in &written {
        assert!(
            present.contains(c) || seen.contains(c),
            "seed {seed} (folds {folds}, server {server_folds}): the edit {c} was lost unseen"
        );
    }
}

#[test]
fn two_devices_and_a_server_end_alike_and_lose_no_edit() {
    for seed in 1..=300u64 {
        run(seed, false, false);
    }
}

/// The same where the devices' file systems fold names (two Macs, or a
/// Mac and a Windows PC), against a server on Linux (ext4) and on a Mac:
/// a name respelled on one device and the file edited on the other end as
/// one file everywhere.
#[test]
fn where_names_fold_two_devices_and_a_server_end_alike_and_lose_no_edit() {
    for seed in 1..=300u64 {
        run(seed, true, false);
        run(seed, true, true);
    }
}
