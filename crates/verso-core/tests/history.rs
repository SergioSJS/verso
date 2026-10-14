// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The computer's history of a folder (ADR 0091 item 8), and the
//! feature's guardrail (Consequences; ADR 0029): restoring a version
//! writes exactly its bytes, thinning never removes a file's newest
//! version, and nothing of the history touches the folder.

use std::path::Path;

use proptest::prelude::*;
use verso_core::Workspace;
use verso_core::history::{self, DAY, Kind, LOCAL, thinning};

#[cfg(test)]
mod helpers {
    use super::*;

    /// A folder and a configuration directory apart from it, the history in
    /// the latter.
    pub fn opened() -> (tempfile::TempDir, tempfile::TempDir, Workspace) {
        let folder = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        let mut ws = Workspace::open(folder.path(), Some(config.path())).unwrap();
        ws.index().unwrap();
        ws.keep_history(
            &config.path().join("history").join("f.sqlite"),
            "Mac de Ana",
        )
        .unwrap();
        (folder, config, ws)
    }

    /// Every entry of the folder, the bin's included, as `verso-fs` sees it.
    pub fn everything(folder: &Path) -> Vec<String> {
        let mut root = verso_fs::Root::open(folder, vec![]).unwrap();
        let mut all: Vec<String> = root
            .walk()
            .entries
            .into_iter()
            .map(|e| e.relative.to_string_lossy().replace('\\', "/"))
            .collect();
        all.extend(root.trash_walk().unwrap().into_iter().map(|b| b.path));
        all.sort();
        all
    }

    pub fn revision(ws: &mut Workspace, path: &str) -> String {
        ws.read_with_revision(path).unwrap().1
    }
}
use helpers::*;

#[test]
fn writes_are_versions_and_follow_a_rename_and_a_deletion() {
    let (folder, _config, mut ws) = opened();
    ws.write_bytes("n.md", b"um\n", None).unwrap();
    ws.history_flush();
    let r = revision(&mut ws, "n.md");
    ws.write_bytes("n.md", b"um\ndois\n", Some(&r)).unwrap();
    ws.history_flush();
    let l = ws.history_store().unwrap().versions(LOCAL, "n.md").unwrap();
    // The editor's saves coalesce: one version, the newest bytes.
    assert_eq!(l.versions.len(), 1);
    assert_eq!(l.versions[0].kind, Kind::Edit);
    assert_eq!(l.versions[0].authors[0].name, "Mac de Ana");
    ws.rename_entry("n.md", "m.md").unwrap();
    ws.history_flush();
    let l = ws.history_store().unwrap().versions(LOCAL, "m.md").unwrap();
    assert_eq!(l.versions.len(), 1, "a rename keeps the history (item 9)");
    let gone = ws.delete_entry("m.md").unwrap();
    ws.history_flush();
    let l = ws.history_store().unwrap().versions(LOCAL, "m.md").unwrap();
    assert!(l.gone.is_some());
    assert_eq!(l.versions.len(), 1, "reached from the trash (item 9)");
    // Back from the trash: the same line, live again.
    ws.restore_from_trash(&gone.path, "m.md", false, "2026-10-14", true)
        .unwrap();
    ws.history_flush();
    let l = ws.history_store().unwrap().versions(LOCAL, "m.md").unwrap();
    assert_eq!((l.gone, l.versions.len()), (None, 1));
    assert_eq!(everything(folder.path()), vec!["m.md".to_owned()]);
}

#[test]
fn a_file_read_before_its_first_write_is_kept_as_found() {
    let folder = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    {
        let mut plain = Workspace::open(folder.path(), Some(config.path())).unwrap();
        plain.write_bytes("velha.md", b"de antes\n", None).unwrap();
    }
    let mut ws = Workspace::open(folder.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    ws.keep_history(&config.path().join("h.sqlite"), "pc")
        .unwrap();
    let n = ws.read_note("velha.md").unwrap();
    ws.write_note("velha.md", "depois\n", &n.revision).unwrap();
    ws.history_flush();
    let l = ws
        .history_store()
        .unwrap()
        .versions(LOCAL, "velha.md")
        .unwrap();
    let kinds: Vec<Kind> = l.versions.iter().map(|v| v.kind).collect();
    assert_eq!(kinds, vec![Kind::Edit, Kind::Found]);
}

#[test]
fn a_change_from_outside_names_nobody_and_attachments_have_no_history() {
    let (folder, _config, mut ws) = opened();
    ws.write_bytes("a.md", b"x", None).unwrap();
    ws.write_bytes("foto.png", b"\x89PNG", None).unwrap();
    ws.history_flush();
    // Written behind the core's back, then found by the watcher.
    let mut other = verso_fs::Root::open(folder.path(), vec![]).unwrap();
    let h = other.handle(Path::new("a.md")).unwrap();
    let (_, stamp) = other.read(h).unwrap();
    let _ = other.write(h, b"y", &stamp).unwrap();
    ws.history_outside(&["a.md".to_owned()], &[]);
    let l = ws.history_store().unwrap().versions(LOCAL, "a.md").unwrap();
    assert_eq!(l.versions[0].kind, Kind::Outside);
    assert_eq!(l.versions[0].authors[0].kind, "outside");
    assert!(
        ws.history_store()
            .unwrap()
            .versions(LOCAL, "foto.png")
            .unwrap()
            .versions
            .is_empty(),
        "item 2"
    );
}

#[test]
fn a_restore_is_refused_when_the_file_changed_since_it_was_read() {
    let (_folder, _config, mut ws) = opened();
    ws.write_bytes("a.md", b"1", None).unwrap();
    let old = revision(&mut ws, "a.md");
    let r = old.clone();
    ws.write_bytes("a.md", b"2", Some(&r)).unwrap();
    let e = ws.restore_bytes("a.md", b"1", Some(&old)).unwrap_err();
    assert!(
        matches!(
            e,
            verso_core::CoreError::Write(verso_fs::WriteError::Changed { .. })
        ),
        "{e}"
    );
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 24, .. ProptestConfig::default() })]

    /// The guardrail: whatever the writes, every version reads back as the
    /// bytes written, a restore writes exactly a version's bytes, and the
    /// folder holds only the files written — nothing of the history.
    #[test]
    fn restoring_writes_exactly_a_versions_bytes_and_the_folder_holds_nothing_else(
        writes in prop::collection::vec(
            (0usize..3, prop::collection::vec(any::<u8>(), 0..300)),
            1..12,
        ),
        pick in any::<prop::sample::Index>(),
    ) {
        let (folder, _config, mut ws) = opened();
        let names = ["a.md", "b/c.txt", "d.canvas"];
        let mut written: Vec<(String, Vec<u8>)> = Vec::new();
        for (n, bytes) in &writes {
            let path = names[*n];
            let rev = ws.read_with_revision(path).ok().map(|(_, r)| r);
            ws.write_bytes(path, bytes, rev.as_deref()).unwrap();
            written.push((path.to_owned(), bytes.clone()));
            ws.history_flush();
        }
        let store = ws.history_store().unwrap();
        let mut all = Vec::new();
        for path in names {
            for v in store.versions(LOCAL, path).unwrap().versions {
                let (_, bytes) = store.read(LOCAL, v.id).unwrap().unwrap();
                prop_assert!(written.iter().any(|(p, b)| p == path && *b == bytes));
                // The newest version is the file as it is.
                all.push((path.to_owned(), v.id, bytes));
            }
        }
        let (path, id, bytes) = all[pick.index(all.len())].clone();
        let (version, read) = ws.history_store().unwrap().read(LOCAL, id).unwrap().unwrap();
        prop_assert_eq!(&read, &bytes);
        let rev = revision(&mut ws, &path);
        ws.restore_bytes(&path, &read, Some(&rev)).unwrap();
        ws.history_flush();
        prop_assert_eq!(verso_core::history::sha256(&ws.read_file(&path).unwrap()), version.hash);
        let mut expected: Vec<String> = names
            .iter()
            .filter(|p| written.iter().any(|(w, _)| w == *p))
            .map(|p| (*p).to_owned())
            .collect();
        if expected.iter().any(|p| p.starts_with("b/")) {
            expected.push("b".to_owned());
        }
        expected.sort();
        prop_assert_eq!(everything(folder.path()), expected);
        // Thinning with a clock moved a year and more on touches only the
        // store.
        ws.history_store().unwrap().thin(LOCAL, history::now_ms() + 400 * DAY, 365, Some(1)).unwrap();
        let mut again = everything(folder.path());
        again.sort();
        let mut before = names
            .iter()
            .filter(|p| written.iter().any(|(w, _)| w == *p))
            .map(|p| (*p).to_owned())
            .collect::<Vec<_>>();
        if before.iter().any(|p| p.starts_with("b/")) {
            before.push("b".to_owned());
        }
        before.sort();
        prop_assert_eq!(again, before);
    }

    /// The guardrail: thinning never removes the newest version of a file
    /// that is there, whatever the clock, the versions and the retention.
    #[test]
    fn thinning_never_removes_a_files_newest_version(
        mut ats in prop::collection::vec(0i64..(800 * DAY), 1..200),
        later in 0i64..(800 * DAY),
        days in 0u32..800,
    ) {
        ats.sort_unstable_by(|a, b| b.cmp(a));
        let versions: Vec<(i64, i64)> = ats.iter().enumerate().map(|(i, at)| (i64::try_from(i).unwrap(), *at)).collect();
        let now = ats[0] + later;
        let out = thinning(&versions, now, days, None);
        prop_assert!(!out.contains(&0));
        // And through the store: the newest bytes of each file stay.
        let mut s = history::Store::memory().unwrap();
        for (i, at) in ats.iter().rev().enumerate() {
            s.record("f", "n.md", format!("{i}").as_bytes(), *at, &[], Kind::Write).unwrap();
        }
        let newest = s.versions("f", "n.md").unwrap().versions[0].clone();
        s.thin("f", now, days, Some(0)).unwrap();
        let after = s.versions("f", "n.md").unwrap().versions;
        prop_assert_eq!(after.first(), Some(&newest));
    }
}
