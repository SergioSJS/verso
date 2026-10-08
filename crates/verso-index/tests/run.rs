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
