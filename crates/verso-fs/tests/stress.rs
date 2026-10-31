// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Writers racing on one file (night round of 2026-10-29). Several
//! `Root`s on one folder — two windows of an app, a host and an editor
//! beside it — each reading, adding a line and writing against the stamp it
//! read. What one asserts: the file is never torn (every read is whole
//! lines, from the first to the last), no temporary file is left, a write
//! that returned `Ok` replaced exactly the content it read, and a refusal
//! leaves the file as the other writer made it. Writers of one process
//! never lose an update to each other: `TargetLock` serialises the check
//! and the rename of one target, and the test asserts `lost == 0`. Another
//! program writing the same file is only caught by the stamp checks, which
//! the optimistic check is (ADR 0029): the server also takes its own lock
//! per folder (`one_at_a_time`).

#[cfg(test)]
mod racing {
    use std::fs;
    use std::path::Path;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use verso_fs::{Root, WriteError};

    fn lines_whole(bytes: &[u8]) -> bool {
        let text = std::str::from_utf8(bytes).expect("utf-8");
        text.is_empty() || (text.ends_with('\n') && text.lines().all(|l| l.starts_with("w")))
    }

    pub fn run(seed: usize, writers: usize, rounds: usize) -> (usize, usize) {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("nota.md");
        fs::write(&file, "w0 start\n").unwrap();
        let ok = AtomicUsize::new(0);
        let refused = AtomicUsize::new(0);
        let accepted = std::sync::Mutex::new(Vec::<String>::new());
        std::thread::scope(|s| {
            for w in 0..writers {
                let (ok, refused, accepted) = (&ok, &refused, &accepted);
                let path = dir.path();
                s.spawn(move || {
                    let mut root = Root::open(path, vec![]).unwrap();
                    let h = root.handle(Path::new("nota.md")).unwrap();
                    for k in 0..rounds {
                        let (bytes, stamp) = root.read(h).unwrap();
                        assert!(lines_whole(&bytes), "seed {seed}: torn read {bytes:?}");
                        let line = format!("w{w} s{seed} k{k}\n");
                        let mut new = bytes.clone();
                        new.extend_from_slice(line.as_bytes());
                        match root.write(h, &new, &stamp) {
                            Ok(_) => {
                                ok.fetch_add(1, Ordering::SeqCst);
                                accepted.lock().unwrap().push(line);
                            }
                            Err(WriteError::Changed { .. }) => {
                                refused.fetch_add(1, Ordering::SeqCst);
                            }
                            Err(e) => panic!("seed {seed}: {e:?}"),
                        }
                    }
                });
            }
        });
        let end = fs::read(&file).unwrap();
        assert!(lines_whole(&end), "seed {seed}: torn end {end:?}");
        let text = String::from_utf8(end).unwrap();
        let lost = accepted
            .lock()
            .unwrap()
            .iter()
            .filter(|l| !text.contains(l.as_str()))
            .count();
        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n != "nota.md")
            .collect();
        assert!(leftovers.is_empty(), "seed {seed}: {leftovers:?}");
        assert!(ok.load(Ordering::SeqCst) > 0, "somebody always wins");
        (
            lost,
            ok.load(Ordering::SeqCst) + refused.load(Ordering::SeqCst),
        )
    }
}
use racing::run;

#[test]
fn racing_writers_never_tear_the_file_and_leave_nothing_behind() {
    let (mut lost, mut tried) = (0, 0);
    for seed in 0..5 {
        let (l, t) = run(seed, 4, 60);
        lost += l;
        tried += t;
    }
    assert_eq!(
        lost, 0,
        "{lost} of {tried} accepted writes were replaced unseen"
    );
}

/// Two `Root`s reaching one folder by different spellings (a symlinked
/// parent) are one writer to the lock too: no accepted write is lost.
#[cfg(unix)]
#[test]
fn roots_spelling_one_folder_differently_do_not_lose_each_others_writes() {
    use std::path::Path;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use verso_fs::{Root, WriteError};

    let mut lost = 0;
    for seed in 0..5 {
        let base = tempfile::tempdir().unwrap();
        let real = base.path().join("real");
        std::fs::create_dir(&real).unwrap();
        let alias = base.path().join("alias");
        std::os::unix::fs::symlink(&real, &alias).unwrap();
        std::fs::write(real.join("nota.md"), "w0 start\n").unwrap();
        let accepted = std::sync::Mutex::new(Vec::<String>::new());
        let ok = AtomicUsize::new(0);
        std::thread::scope(|s| {
            for w in 0..4 {
                let (accepted, ok) = (&accepted, &ok);
                let dir = if w % 2 == 0 {
                    real.clone()
                } else {
                    alias.clone()
                };
                s.spawn(move || {
                    let mut root = Root::open(&dir, vec![]).unwrap();
                    let h = root.handle(Path::new("nota.md")).unwrap();
                    for k in 0..60 {
                        let (bytes, stamp) = root.read(h).unwrap();
                        let line = format!("w{w} s{seed} k{k}\n");
                        let mut new = bytes.clone();
                        new.extend_from_slice(line.as_bytes());
                        match root.write(h, &new, &stamp) {
                            Ok(_) => {
                                ok.fetch_add(1, Ordering::SeqCst);
                                accepted.lock().unwrap().push(line);
                            }
                            Err(WriteError::Changed { .. }) => {}
                            Err(e) => panic!("{e:?}"),
                        }
                    }
                });
            }
        });
        let text = std::fs::read_to_string(real.join("nota.md")).unwrap();
        lost += accepted
            .lock()
            .unwrap()
            .iter()
            .filter(|l| !text.contains(l.as_str()))
            .count();
        assert!(ok.load(Ordering::SeqCst) > 0);
    }
    assert_eq!(lost, 0, "{lost} accepted writes were replaced unseen");
}
