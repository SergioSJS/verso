// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The bin's rules (ADR 0080): entries grouped from a walk and the
//! records, expiry, the quota's guard, the sweep's guardrail, a restore
//! beside a taken name, and the copy a write keeps.

use std::collections::BTreeMap;
use std::path::Path;

use verso_core::Workspace;
use verso_core::trash::*;
use verso_fs::trashbin::{self, Binned};

/// A book in memory.
#[derive(Default)]
struct Book(BTreeMap<String, TrashRecord>);

impl TrashBook for Book {
    fn records(&mut self) -> Result<Vec<TrashRecord>, String> {
        Ok(self.0.values().cloned().collect())
    }
    fn put(&mut self, r: &TrashRecord) -> Result<(), String> {
        self.0.insert(r.path.clone(), r.clone());
        Ok(())
    }
    fn forget(&mut self, path: &str) -> Result<(), String> {
        self.0.remove(path);
        Ok(())
    }
}

fn binned(path: &str, dir: bool, len: u64) -> Binned {
    Binned {
        path: path.into(),
        dir,
        len,
    }
}

#[test]
fn the_walk_is_grouped_by_what_was_recorded() {
    let mut book = Book::default();
    book.put(&record(
        ".trash/Projetos",
        "Projetos",
        100,
        Some("Ana"),
        false,
    ))
    .unwrap();
    book.put(&record(".trash/a/b.md", "a/b.md", 200, None, false))
        .unwrap();
    // Gone by hand: forgotten.
    book.put(&record(".trash/sumiu.md", "sumiu.md", 50, None, false))
        .unwrap();
    let found = vec![
        binned(".trash/Projetos", true, 0),
        binned(".trash/Projetos/x.md", false, 3),
        binned(".trash/Projetos/sub", true, 0),
        binned(".trash/Projetos/sub/y.png", false, 7),
        binned(".trash/a", true, 0),
        binned(".trash/a/b.md", false, 5),
        binned(".trash/a/c.md", false, 2),
        binned(".trash/Velha", true, 0),
        binned(".trash/Velha/z.md", false, 4),
        binned(".trash/vazia", true, 0),
    ];
    let items = reconcile(&found, &mut book, 1000).unwrap();
    let got: Vec<(&str, bool, u64, Option<i64>)> = items
        .iter()
        .map(|i| (i.record.path.as_str(), i.dir, i.size, i.record.deleted))
        .collect();
    // Newest first; an unknown date counts from now.
    assert_eq!(
        got,
        vec![
            (".trash/Velha", true, 4, None),
            (".trash/a/c.md", false, 2, None),
            (".trash/a/b.md", false, 5, Some(200)),
            (".trash/Projetos", true, 10, Some(100)),
        ]
    );
    assert!(!book.0.contains_key(".trash/sumiu.md"));
    // What was found is recorded, its clock started now.
    assert_eq!(book.0[".trash/Velha"].seen, 1000);
    assert_eq!(book.0[".trash/Velha"].original, "Velha");
    // The next listing keeps that first sight.
    let again = reconcile(&found, &mut book, 5000).unwrap();
    assert_eq!(again[0].since(), 1000);
}

fn item(path: &str, since: i64, size: u64) -> TrashItem {
    TrashItem {
        record: record(path, path, since, None, false),
        dir: false,
        size,
    }
}

#[test]
fn an_entry_goes_after_its_time_and_never_before() {
    let items = vec![item(".trash/a", 0, 1), item(".trash/b", 10 * DAY, 1)];
    let at = |days: i64| days * DAY;
    assert!(due(&items, at(29), 30, None, None).is_empty());
    assert_eq!(
        due(&items, at(30), 30, None, None),
        vec![(".trash/a".to_owned(), Why::Expired)]
    );
    // Forever keeps everything.
    assert!(due(&items, at(10_000), 0, None, None).is_empty());
}

#[test]
fn the_oldest_go_early_while_the_bin_alone_passes_the_quota() {
    let items = vec![
        item(".trash/nova", 3 * DAY, 40),
        item(".trash/media", 2 * DAY, 40),
        item(".trash/velha", DAY, 40),
    ];
    assert!(over_quota(&items, Some(100)));
    assert_eq!(
        due(&items, 4 * DAY, 30, Some(100), None),
        vec![(".trash/velha".to_owned(), Why::OverQuota)]
    );
    assert!(due(&items, 4 * DAY, 30, Some(120), None).is_empty());
    assert!(!over_quota(&items, None));
}

/// B11 (ADR 0080, 2026-10-31): a size cap of the server, the oldest out first,
/// under the age cap and beside the quota's guard.
#[test]
fn the_oldest_go_first_while_the_bin_passes_the_size_cap() {
    let items = vec![
        item(".trash/nova", 3 * DAY, 40),
        item(".trash/media", 2 * DAY, 40),
        item(".trash/velha", DAY, 40),
    ];
    // 120 bytes against a cap of 100: only the oldest goes, and it is the
    // cap's doing.
    assert_eq!(
        due(&items, 4 * DAY, 30, None, Some(100)),
        vec![(".trash/velha".to_owned(), Why::OverCap)]
    );
    // Two to go: the oldest two, oldest first.
    assert_eq!(
        due(&items, 4 * DAY, 30, None, Some(40)),
        vec![
            (".trash/velha".to_owned(), Why::OverCap),
            (".trash/media".to_owned(), Why::OverCap),
        ]
    );
    // Exactly at the cap stays.
    assert!(due(&items, 4 * DAY, 30, None, Some(120)).is_empty());
    // The age still goes first, and its entries do not count against the cap.
    assert_eq!(
        due(&items, 31 * DAY + DAY, 30, None, Some(100)),
        vec![
            (".trash/media".to_owned(), Why::Expired),
            (".trash/velha".to_owned(), Why::Expired),
        ]
    );
    // With a quota too, the smaller bound rules and names itself.
    assert_eq!(
        due(&items, 4 * DAY, 30, Some(100), Some(500)),
        vec![(".trash/velha".to_owned(), Why::OverQuota)]
    );
    assert_eq!(
        due(&items, 4 * DAY, 30, Some(500), Some(100)),
        vec![(".trash/velha".to_owned(), Why::OverCap)]
    );
}

/// I5 (ADR 0080, decided 2026-11-01): the size cap counts an entry younger
/// than a day but never removes it; the age cap is unchanged.
#[test]
fn the_size_cap_waits_for_an_entry_younger_than_a_day() {
    let now = 10 * DAY;
    let items = vec![
        item(".trash/velha", now - 3 * DAY, 40),
        item(".trash/enorme", now - 60, 500),
    ];
    // The newest alone passes the cap: it stays; the older one still goes.
    assert_eq!(
        due(&items, now, 30, None, Some(100)),
        vec![(".trash/velha".to_owned(), Why::OverCap)]
    );
    // Only the newest in the bin: nothing goes.
    assert!(due(&items[1..], now, 30, None, Some(100)).is_empty());
    // A day later it is fair game.
    assert_eq!(
        due(&items[1..], now + DAY, 30, None, Some(100)),
        vec![(".trash/enorme".to_owned(), Why::OverCap)]
    );
    // The age cap is unchanged: past the retention it goes at once.
    assert_eq!(
        due(&items[1..], now + 31 * DAY, 30, None, Some(100)),
        vec![(".trash/enorme".to_owned(), Why::Expired)]
    );
}

#[test]
fn a_restored_name_beside_says_when_in_the_persons_language() {
    assert_eq!(
        beside_name("pasta/Nota.md", false, "2026-10-11", true, 1),
        "pasta/Nota (restaurado 2026-10-11).md"
    );
    assert_eq!(
        beside_name("Nota.md", false, "2026-10-11", false, 2),
        "Nota (restored 2026-10-11 2).md"
    );
    assert_eq!(
        beside_name("Projetos.v2", true, "2026-10-11", false, 1),
        "Projetos.v2 (restored 2026-10-11)"
    );
}

#[cfg(test)]
mod disk {
    use super::*;

    /// A directory named `name` under `parent`: this crate's tests may not
    /// call `std::fs` to make one (ADR 0026 rule 5, ADR 0029).
    pub fn make_dir(parent: &Path, name: &str) -> std::path::PathBuf {
        tempfile::Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempdir_in(parent)
            .unwrap()
            .keep()
    }

    /// What the folder's bin holds, through verso-fs.
    pub fn in_bin(root: &Path) -> Vec<String> {
        trashbin::walk(root)
            .unwrap()
            .into_iter()
            .map(|b| b.path)
            .collect()
    }
}
use disk::*;

/// The feature's guardrail (ADR 0080, Consequences; ADR 0029): the sweep
/// removes nothing outside `.trash/` and nothing before its time; that it
/// follows no symlink is `verso-fs`'s test of the removal it calls
/// (`trashbin/tests.rs`).
#[test]
fn the_sweep_removes_only_what_is_due_and_only_in_the_bin() {
    let folder = tempfile::tempdir().unwrap();
    let root = folder.path();
    let bin = make_dir(root, ".trash");
    let old = make_dir(&bin, "velha");
    std::fs::write(old.join("a.md"), "a").unwrap();
    std::fs::write(bin.join("nova.md"), "n").unwrap();
    std::fs::write(root.join("viva.md"), "v").unwrap();
    let empty = make_dir(&bin, "vazia");
    make_dir(&empty, "funda");
    let mut book = Book::default();
    book.put(&record(".trash/velha", "velha", 0, None, false))
        .unwrap();
    book.put(&record(".trash/nova.md", "nova.md", 20 * DAY, None, false))
        .unwrap();
    let swept = sweep(root, &mut book, 31 * DAY, 30, None, None).unwrap();
    let gone: Vec<&str> = swept
        .removed
        .iter()
        .map(|(i, _)| i.record.path.as_str())
        .collect();
    assert_eq!(gone, vec![".trash/velha"]);
    // The empty folders the bin held are pruned; the rest stays.
    assert_eq!(in_bin(root), vec![".trash/nova.md"]);
    assert_eq!(std::fs::read_to_string(root.join("viva.md")).unwrap(), "v");
    assert_eq!((swept.count, swept.size), (1, 1));
    // Later, its time come.
    let swept = sweep(root, &mut book, 50 * DAY, 30, None, None).unwrap();
    assert!(swept.failed.is_empty(), "{:?}", swept.failed);
    assert!(in_bin(root).is_empty());
    assert_eq!(std::fs::read_to_string(root.join("viva.md")).unwrap(), "v");
    // The bin itself stays: walked, it is there and empty.
    assert!(std::fs::read_dir(&bin).unwrap().next().is_none());
}

/// A book that, asked for its records — after the sweep's walk, before it
/// removes what it found empty — sees a file land in the bin: what a
/// deletion or a version a write replaced does when it runs beside the
/// server's sweep, which holds no lock of the window's.
struct Landing<'a> {
    book: Book,
    at: &'a Path,
    landed: bool,
}

impl TrashBook for Landing<'_> {
    fn records(&mut self) -> Result<Vec<TrashRecord>, String> {
        if !self.landed {
            self.landed = true;
            std::fs::write(self.at, "kept").map_err(|e| e.to_string())?;
        }
        self.book.records()
    }
    fn put(&mut self, r: &TrashRecord) -> Result<(), String> {
        self.book.put(r)
    }
    fn forget(&mut self, path: &str) -> Result<(), String> {
        self.book.forget(path)
    }
}

/// A folder of the bin the sweep's walk found empty is removed only if it
/// still is: a file put in it since — a version a device's write replaced,
/// a note deleted — stays (the night stress, 2026-11-04: "P3-5 was accepted
/// and is on the disk nowhere, nor in the trash", the version of
/// `d/Fundo/C.md` a write replaced lost with the folder the sweep removed
/// whole).
#[test]
fn the_sweep_never_removes_a_file_put_in_a_folder_it_found_empty() {
    let folder = tempfile::tempdir().unwrap();
    let root = folder.path();
    let bin = make_dir(root, ".trash");
    let d = make_dir(&bin, "d");
    let fundo = make_dir(&d, "Fundo");
    let at = fundo.join("C (2).md");
    let mut book = Landing {
        book: Book::default(),
        at: &at,
        landed: false,
    };
    let swept = sweep(root, &mut book, DAY, 30, None, None).unwrap();
    assert!(swept.failed.is_empty(), "{:?}", swept.failed);
    assert_eq!(std::fs::read_to_string(&at).unwrap(), "kept");
    assert_eq!(
        in_bin(root),
        vec![".trash/d", ".trash/d/Fundo", ".trash/d/Fundo/C (2).md"]
    );
}

#[test]
fn a_restore_beside_a_taken_name_and_a_copy_before_a_write() {
    let folder = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    std::fs::write(folder.path().join("Nota.md"), "primeira").unwrap();
    let mut ws = Workspace::open(folder.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let gone = ws.delete_entry("Nota.md").unwrap();
    assert_eq!(gone.path, ".trash/Nota.md");
    ws.create_note("Nota.md", "segunda").unwrap();
    let back = ws
        .restore_from_trash(&gone.path, "Nota.md", false, "2026-10-11", true)
        .unwrap();
    assert_eq!(back.path, "Nota (restaurado 2026-10-11).md");
    assert!(back.beside);
    assert!(ws.notes().unwrap().contains(&back.path));
    assert_eq!(
        std::fs::read_to_string(folder.path().join("Nota.md")).unwrap(),
        "segunda"
    );
    // The version a write is about to replace, kept.
    let kept = ws.keep_replaced("Nota.md").unwrap();
    assert_eq!(kept, ".trash/Nota.md");
    assert_eq!(
        std::fs::read_to_string(folder.path().join(".trash/Nota.md")).unwrap(),
        "segunda"
    );
    // A path outside the bin is never restored from.
    assert!(
        ws.restore_from_trash("Nota.md", "Outra.md", false, "2026-10-11", true)
            .is_err()
    );
    assert!(
        ws.restore_from_trash(&kept, "Nota.md", false, "../x", true)
            .is_err()
    );
}

/// A restore is a move inside the folder, and the names it makes are
/// checked as a rename's (ADR 0070 item 3, ADR 0080 item 5): its original
/// name now the case twin of an entry there — two files on Linux, one on
/// a Mac or Windows (spec Q8) — counts as taken, and the entry goes beside
/// it; a folder it goes back into that only a case twin stands for is
/// refused with the reason (a name beside would be under it too), unless
/// the file system reaches it; a name not every OS can keep is refused.
#[test]
fn a_restore_checks_the_names_it_makes() {
    let folder = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let root = folder.path();
    std::fs::write(root.join("Nota.md"), "primeira").unwrap();
    let mut ws = Workspace::open(root, Some(config.path())).unwrap();
    ws.index().unwrap();
    ws.create_file("Pasta/x.md", b"x").unwrap();
    let nota = ws.delete_entry("Nota.md").unwrap();
    ws.create_note("nota.md", "segunda").unwrap();
    let back = ws
        .restore_from_trash(&nota.path, "Nota.md", false, "2026-10-12", false)
        .unwrap();
    assert_eq!(back.path, "Nota (restored 2026-10-12).md");
    assert!(back.beside);
    assert_eq!(
        std::fs::read_to_string(root.join("nota.md")).unwrap(),
        "segunda"
    );
    // Its folder respelled meanwhile: on a file system that folds names
    // the restore reaches it; on one that tells case apart, `Pasta` would
    // be a second folder beside `pasta`, refused.
    let x = ws.delete_entry("Pasta/x.md").unwrap();
    ws.rename_entry("Pasta", "pasta").unwrap();
    let folds = std::fs::read_to_string(root.join("NOTA.md")).is_ok();
    let restored = ws.restore_from_trash(&x.path, "Pasta/x.md", false, "2026-10-12", false);
    if folds {
        restored.unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("pasta/x.md")).unwrap(),
            "x"
        );
    } else {
        match restored {
            Err(verso_core::CoreError::Write(verso_core::WriteError::Confined(
                verso_core::ConfinementError::CaseTwin,
            ))) => {}
            other => panic!("a parent's case twin: {other:?}"),
        }
        assert!(
            std::fs::read_to_string(root.join(&x.path)).is_ok(),
            "still in the bin"
        );
    }
}

/// A name Windows would not keep is refused when a restore would make it,
/// as a rename's is (ADR 0070 item 3); the entry stays in the bin. Not on
/// Windows, where such a file cannot exist at all.
#[cfg(not(windows))]
#[test]
fn a_restore_to_a_name_not_every_os_keeps_is_refused() {
    let folder = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let root = folder.path();
    std::fs::write(root.join("Reunião: pauta.md"), "p").unwrap();
    let mut ws = Workspace::open(root, Some(config.path())).unwrap();
    ws.index().unwrap();
    let gone = ws.delete_entry("Reunião: pauta.md").unwrap();
    match ws.restore_from_trash(&gone.path, "Reunião: pauta.md", false, "2026-10-12", true) {
        Err(verso_core::CoreError::Write(verso_core::WriteError::Confined(
            verso_core::ConfinementError::UnportableName,
        ))) => {}
        other => panic!("{other:?}"),
    }
    assert!(
        std::fs::read_to_string(root.join(&gone.path)).is_ok(),
        "still in the bin"
    );
}
