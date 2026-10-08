// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An index run's transaction: committed in chunks, so another process
//! sees the notes as they are done and is not locked out for the whole
//! run; and never left open by a run that did not end.

use verso_index::{Index, IndexError, NoteStamp};

fn stamp(hash: u64) -> NoteStamp {
    NoteStamp {
        modified: 100,
        len: 100,
        hash,
    }
}

fn put(index: &mut Index, n: u64) -> Result<(), IndexError> {
    let (path, text) = (format!("nota-{n}.md"), format!("# Nota {n}\n"));
    index.upsert(&path, stamp(n), &text, &verso_dialect::parse(&text))
}

#[test]
fn a_run_commits_in_chunks_and_at_its_end() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    let mut run = Index::open(&file).unwrap();
    // Another process, reading the same file.
    let other = Index::open(&file).unwrap();
    run.begin().unwrap();
    for n in 0..250 {
        put(&mut run, n).unwrap();
        run.step().unwrap();
    }
    // The first chunk is committed; the rest is not, yet.
    assert_eq!(other.stamp_of("nota-0.md").unwrap(), Some(stamp(0)));
    assert_eq!(other.stamp_of("nota-249.md").unwrap(), None);
    run.commit().unwrap();
    assert_eq!(other.stamp_of("nota-249.md").unwrap(), Some(stamp(249)));
}

#[test]
fn a_run_that_never_ended_is_committed_by_the_next() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    let mut run = Index::open(&file).unwrap();
    let other = Index::open(&file).unwrap();
    run.begin().unwrap();
    put(&mut run, 1).unwrap();
    // No commit: the run stopped (a panic the app caught). The next run
    // begins anyway, and what the first one did is kept.
    run.begin().unwrap();
    put(&mut run, 2).unwrap();
    run.commit().unwrap();
    assert_eq!(other.stamp_of("nota-1.md").unwrap(), Some(stamp(1)));
    assert_eq!(other.stamp_of("nota-2.md").unwrap(), Some(stamp(2)));
}

#[test]
fn a_change_outside_a_run_is_committed_on_its_own() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    let mut index = Index::open(&file).unwrap();
    let other = Index::open(&file).unwrap();
    put(&mut index, 7).unwrap();
    index.step().unwrap();
    assert_eq!(other.stamp_of("nota-7.md").unwrap(), Some(stamp(7)));
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

fn put_at(index: &mut Index, path: &str, modified: i64) -> Result<(), IndexError> {
    let text = "# Nota\n";
    let stamp = NoteStamp {
        modified,
        len: 7,
        hash: 1,
    };
    index.upsert(path, stamp, text, &verso_dialect::parse(text))
}

/// A note modified well before the run that read it is trusted by its
/// modified time and length; one modified in the same second is read again
/// (a change in that second could keep both), and so is one written
/// outside a run, until a run reads it and finds it unchanged.
#[test]
fn a_note_is_trusted_by_its_stat_only_when_modified_before_its_read() {
    let mut index = Index::in_memory().unwrap();
    let old = now() - 100;
    index.begin().unwrap();
    put_at(&mut index, "velha.md", old).unwrap();
    put_at(&mut index, "agora.md", now()).unwrap();
    index.commit().unwrap();
    assert!(index.unchanged_by_stat("velha.md", old, 7).unwrap());
    assert!(!index.unchanged_by_stat("velha.md", old, 8).unwrap());
    assert!(!index.unchanged_by_stat("velha.md", old + 1, 7).unwrap());
    assert!(!index.unchanged_by_stat("agora.md", now(), 7).unwrap());
    assert!(!index.unchanged_by_stat("ausente.md", old, 7).unwrap());

    // Written outside a run (Verso's own save): read again once.
    put_at(&mut index, "salva.md", old).unwrap();
    assert!(!index.unchanged_by_stat("salva.md", old, 7).unwrap());
    index.begin().unwrap();
    index.confirm("salva.md").unwrap();
    index.commit().unwrap();
    assert!(index.unchanged_by_stat("salva.md", old, 7).unwrap());

    // A placeholder's last known version is never trusted by its stat.
    assert!(index.mark_placeholder("velha.md").unwrap());
    assert!(!index.unchanged_by_stat("velha.md", old, 7).unwrap());
}

/// A clock set back (a restored virtual machine) leaves a row vouched for
/// in the future: the next run reads it again instead of trusting it.
#[test]
fn a_row_vouched_for_in_the_future_is_read_again() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    let mut index = Index::open(&file).unwrap();
    let old = now() - 100;
    index.begin().unwrap();
    put_at(&mut index, "nota.md", old).unwrap();
    index.commit().unwrap();
    let raw = rusqlite::Connection::open(&file).unwrap();
    raw.execute(
        "UPDATE notes SET indexed_at = ?1 WHERE path = 'nota.md'",
        [now() + 3600],
    )
    .unwrap();
    assert!(index.unchanged_by_stat("nota.md", old, 7).unwrap());
    index.begin().unwrap();
    assert!(!index.unchanged_by_stat("nota.md", old, 7).unwrap());
    index.commit().unwrap();
}
