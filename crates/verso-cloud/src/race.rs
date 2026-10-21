// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The feature's guardrail (ADR 0104, Consequences; ADR 0029): two
//! simulated devices race writes, deletes and renames on each adapter,
//! against a fake service that records what every write said about the
//! version it replaced, and no version is ever lost — every write the
//! service accepted asserted the version that was there, and every file
//! it removed was removed by someone who had seen that version. A device
//! whose write is refused as changed keeps its bytes beside the other's
//! (the conflict copy of ADR 0079 item 8), as the host does.
//!
//! The same property is shown to *fail* against a service that ignores the
//! preconditions, so the test is not one that passes whatever the adapter
//! does.

use std::collections::BTreeMap;
use std::sync::{Arc, Barrier};

use proptest::prelude::*;
use verso_core::sync::FileState;
use verso_core::sync::remote::{Condition, Known, Remote, RemoteErrorKind, refresh};

use crate::fake::{Dav, DavMode, Removed, S3 as FakeS3, S3Mode, Write, agrees, removal_agrees};
use crate::s3::{S3, Settings};
use crate::testkit::{Bytes, meta, sha};
use crate::webdav::WebDav;

const PATHS: [&str; 3] = ["a.md", "pasta/b.md", "c.md"];

type Pair = (Arc<dyn Remote>, Arc<dyn Remote>);

#[derive(Debug, Clone)]
enum Op {
    Refresh,
    Write(usize),
    Delete(usize),
    Rename(usize, usize),
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![
        2 => Just(Op::Refresh),
        5 => (0..PATHS.len()).prop_map(Op::Write),
        2 => (0..PATHS.len()).prop_map(Op::Delete),
        2 => (0..PATHS.len(), 0..PATHS.len()).prop_map(|(a, b)| Op::Rename(a, b)),
    ]
}

/// One device: what it last saw of the remote, and what it holds.
struct Device {
    name: &'static str,
    remote: Arc<dyn Remote>,
    known: Option<Known>,
    n: u32,
    /// Bytes it made and the remote has not taken: kept here.
    kept: Vec<Vec<u8>>,
}

impl Device {
    fn refresh(&mut self) {
        let _ = refresh(&*self.remote, &mut self.known, &BTreeMap::new());
    }

    fn write(&mut self, path: &str) {
        self.n += 1;
        let bytes = format!("{}#{}", self.name, self.n).into_bytes();
        let known = self.known.get_or_insert_with(Known::default);
        // On the version it saw — or as a new file when it saw none.
        let base = known.files.get(path).map(|f| f.hash.clone());
        let condition = known
            .condition(path, base.as_deref())
            .unwrap_or(Condition::Absent);
        let sent = self
            .remote
            .write(path, &condition, &meta(&bytes), &mut Bytes::new(&bytes, 3));
        match sent {
            Ok(w) => known.put(
                w.path,
                FileState {
                    hash: sha(&bytes),
                    size: bytes.len() as u64,
                },
                w.version,
            ),
            Err(e) if e.kind == RemoteErrorKind::Changed => {
                // Both are kept: this device's bytes beside the other's.
                let copy = format!("{path}.conflict-{}-{}", self.name, self.n);
                let sent = self.remote.write(
                    &copy,
                    &Condition::Absent,
                    &meta(&bytes),
                    &mut Bytes::new(&bytes, 3),
                );
                if sent.is_err() {
                    self.kept.push(bytes);
                }
                self.refresh();
            }
            Err(_) => self.kept.push(bytes),
        }
    }

    fn delete(&mut self, path: &str) {
        let Some(known) = self.known.as_mut() else {
            return;
        };
        let Some(hash) = known.files.get(path).map(|f| f.hash.clone()) else {
            return;
        };
        let Ok(condition) = known.condition(path, Some(&hash)) else {
            return;
        };
        if self.remote.delete(path, &condition).is_ok() {
            known.remove(path);
        } else {
            self.refresh();
        }
    }

    fn rename(&mut self, from: &str, to: &str) {
        if from == to {
            return;
        }
        let Some(known) = self.known.as_mut() else {
            return;
        };
        let Some(hash) = known.files.get(from).map(|f| f.hash.clone()) else {
            return;
        };
        let Ok(condition) = known.condition(from, Some(&hash)) else {
            return;
        };
        match self.remote.rename(from, to, &condition) {
            Ok(w) => {
                if let Some((f, _)) = known.remove(from) {
                    known.put(w.path, f, w.version);
                }
            }
            Err(_) => self.refresh(),
        }
    }

    fn step(&mut self, op: &Op) {
        match op {
            Op::Refresh => self.refresh(),
            Op::Write(p) => self.write(PATHS[*p]),
            Op::Delete(p) => self.delete(PATHS[*p]),
            Op::Rename(a, b) => self.rename(PATHS[*a], PATHS[*b]),
        }
    }
}

/// Both devices take step `k` together, until the steps are done. What each
/// device believes of the remote at the end is returned.
fn race(pair: Pair, steps: &[(Op, Op)]) -> Vec<Known> {
    let barrier = Barrier::new(2);
    let (a, b) = pair;
    std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for (name, remote, mine) in [("A", a, 0), ("B", b, 1)] {
            let barrier = &barrier;
            handles.push(scope.spawn(move || {
                let mut device = Device {
                    name,
                    remote,
                    known: None,
                    n: 0,
                    kept: Vec::new(),
                };
                for step in steps {
                    barrier.wait();
                    device.step(if mine == 0 { &step.0 } else { &step.1 });
                }
                device.known.unwrap_or_default()
            }));
        }
        handles
            .into_iter()
            .map(|h| h.join().unwrap_or_default())
            .collect()
    })
}

/// What a device believes must not contradict the service: a file it holds
/// as (hash, version) is never a different hash at that same version. A
/// version recorded for bytes it did not write (another device's ETag kept
/// for ours) shows up here once nothing has written after.
fn mistaken(
    known: &Known,
    state: &BTreeMap<String, (String, String)>,
    prefix: &str,
) -> Vec<String> {
    known
        .files
        .iter()
        .filter_map(|(path, file)| {
            let version = known.versions.get(path)?;
            let (etag, hash) = state.get(&format!("{prefix}{path}"))?;
            (etag == version && *hash != file.hash)
                .then(|| format!("{path}: believed {} at {version}, holds {hash}", file.hash))
        })
        .collect()
}

/// What the property says of a service's log: nothing was written over a
/// version its writer had not seen, nothing removed unseen. Our own check
/// files are not the person's.
fn lost(writes: &[Write], removed: &[Removed]) -> Vec<String> {
    let mut out: Vec<String> = writes
        .iter()
        .filter(|w| !w.path.contains(".verso-"))
        .filter(|w| !agrees(w))
        .map(|w| format!("write {w:?}"))
        .collect();
    out.extend(
        removed
            .iter()
            .filter(|r| !r.path.contains(".verso-"))
            .filter(|r| !removal_agrees(r))
            .map(|r| format!("removal {r:?}")),
    );
    out
}

fn dav_pair(dav: &Dav) -> Pair {
    let one = || -> Arc<dyn Remote> {
        Arc::new(WebDav::new(&dav.address, "", "", true).unwrap().quick())
    };
    (one(), one())
}

fn s3_pair(fake: &FakeS3, probe: bool) -> Pair {
    let settings = Settings {
        endpoint: fake.address.clone(),
        bucket: crate::fake::BUCKET.to_owned(),
        prefix: "Cofre".to_owned(),
        region: "test-1".to_owned(),
        access: "AKIATEST".to_owned(),
        secret: "secret-test-key".to_owned(),
        path_style: true,
        plain_http: true,
        ..Settings::default()
    };
    let caps = if probe {
        S3::new(settings.clone())
            .unwrap()
            .quick()
            .probe()
            .unwrap()
            .caps
    } else {
        Vec::new()
    };
    let one = || -> Arc<dyn Remote> {
        Arc::new(
            S3::new(Settings {
                caps: caps.clone(),
                ..settings.clone()
            })
            .unwrap()
            .quick(),
        )
    };
    (one(), one())
}

/// Two devices write the same file from the same version at the same
/// moment.
fn both_write_the_same_file(pair: Pair) {
    let seed = b"semente";
    pair.0
        .write(
            "a.md",
            &Condition::Absent,
            &meta(seed),
            &mut Bytes::new(seed, 100),
        )
        .unwrap();
    // Neither device has seen the file when it writes: both assume it is
    // theirs to make or, after listing, theirs to replace.
    let steps = vec![(Op::Refresh, Op::Refresh), (Op::Write(0), Op::Write(0))];
    race(pair, &steps);
}

fn made_by_devices(all: &[Vec<u8>]) -> usize {
    all.iter()
        .filter(|b| b.starts_with(b"A#") || b.starts_with(b"B#"))
        .count()
}

#[test]
fn on_webdav_two_devices_writing_one_file_lose_nothing() {
    for _ in 0..20 {
        let dav = Dav::start(DavMode::default());
        both_write_the_same_file(dav_pair(&dav));
        assert_eq!(lost(&dav.writes(), &dav.removed()), Vec::<String>::new());
        // Both devices' bytes are in the folder: the winner under the
        // name, the other beside it.
        let all: Vec<Vec<u8>> = dav.paths().iter().filter_map(|p| dav.get(p)).collect();
        assert_eq!(made_by_devices(&all), 2, "{:?}", dav.paths());
    }
}

#[test]
fn on_s3_two_devices_writing_one_file_lose_nothing() {
    for _ in 0..20 {
        let fake = FakeS3::start(S3Mode::default());
        both_write_the_same_file(s3_pair(&fake, true));
        assert_eq!(lost(&fake.writes(), &fake.removed()), Vec::<String>::new());
        let all: Vec<Vec<u8>> = fake.keys().iter().filter_map(|k| fake.get(k)).collect();
        assert_eq!(made_by_devices(&all), 2, "{:?}", fake.keys());
    }
}

/// The guardrail seen failing: a service that ignores `If-Match` loses a
/// version when two devices race, and the property says so. (The probe
/// would have refused such a service; it is skipped here on purpose.)
#[test]
fn a_service_that_ignores_the_preconditions_loses_a_version_and_the_test_sees_it() {
    let mut seen = 0;
    for _ in 0..20 {
        let dav = Dav::start(DavMode {
            ignore_if_match: true,
            ignore_if_none_match: true,
            ..DavMode::default()
        });
        both_write_the_same_file(dav_pair(&dav));
        if !lost(&dav.writes(), &dav.removed()).is_empty() {
            seen += 1;
        }
    }
    assert!(seen > 0, "the race was never lost: the test sees nothing");
    let mut seen = 0;
    for _ in 0..20 {
        let fake = FakeS3::start(S3Mode {
            ignore_if_match: true,
            ignore_if_none_match: true,
            ..S3Mode::default()
        });
        both_write_the_same_file(s3_pair(&fake, false));
        if !lost(&fake.writes(), &fake.removed()).is_empty() {
            seen += 1;
        }
    }
    assert!(
        seen > 0,
        "the race was never lost on S3: the test sees nothing"
    );
}

fn steps() -> impl Strategy<Value = Vec<(Op, Op)>> {
    prop::collection::vec((op(), op()), 1..9)
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 48,
        failure_persistence: None,
        ..ProptestConfig::default()
    })]

    /// Any interleaving of writes, deletes and renames by two devices on a
    /// WebDAV folder: no version lost, and no device believing a version
    /// of bytes it did not write. A third writer lands right after every
    /// `intrude`-th `PUT` (0: never), between a `PUT` and the next
    /// request: the interleaving of review I-1.
    #[test]
    fn webdav_loses_no_version(steps in steps(), intrude in 0_u32..4) {
        let dav = Dav::start(DavMode { intrude, ..DavMode::default() });
        let knowns = race(dav_pair(&dav), &steps);
        prop_assert_eq!(lost(&dav.writes(), &dav.removed()), Vec::<String>::new());
        for k in &knowns {
            prop_assert_eq!(mistaken(k, &dav.state(), ""), Vec::<String>::new());
        }
    }

    /// The same on an S3 prefix.
    #[test]
    fn s3_loses_no_version(steps in steps(), intrude in 0_u32..4) {
        let fake = FakeS3::start(S3Mode { intrude, ..S3Mode::default() });
        let knowns = race(s3_pair(&fake, true), &steps);
        prop_assert_eq!(lost(&fake.writes(), &fake.removed()), Vec::<String>::new());
        for k in &knowns {
            prop_assert_eq!(mistaken(k, &fake.state(), "Cofre/"), Vec::<String>::new());
        }
    }
}
