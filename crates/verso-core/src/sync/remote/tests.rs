// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use std::sync::Mutex;

use super::*;

/// A remote with no feed, whose files are bytes in memory and whose
/// version is a counter: what a cloud looks like to the engine.
#[derive(Default)]
struct Fake {
    files: Mutex<BTreeMap<String, (Vec<u8>, u64)>>,
    reads: Mutex<Vec<String>>,
    lose_cursor: Mutex<bool>,
    feed: bool,
    log: Mutex<Vec<Change>>,
}

impl Fake {
    fn set(&self, path: &str, bytes: &[u8], version: u64) {
        self.files
            .lock()
            .unwrap()
            .insert(path.to_owned(), (bytes.to_vec(), version));
    }

    fn entry(path: &str, bytes: &[u8], version: u64) -> Entry {
        Entry {
            path: path.to_owned(),
            version: version.to_string(),
            hash: None,
            size: bytes.len() as u64,
            by: None,
            device: None,
        }
    }
}

impl Remote for Fake {
    fn list(&self, after: Option<&str>) -> Result<Listing> {
        if after.is_some() && std::mem::take(&mut *self.lose_cursor.lock().unwrap()) {
            return Err(RemoteError::new(RemoteErrorKind::CursorLost, "gone"));
        }
        if self.feed && after.is_some() {
            return Ok(Listing {
                full: false,
                changes: std::mem::take(&mut *self.log.lock().unwrap()),
                cursor: Some("2".to_owned()),
            });
        }
        Ok(Listing {
            full: true,
            changes: self
                .files
                .lock()
                .unwrap()
                .iter()
                .map(|(p, (b, v))| Change::Present(Fake::entry(p, b, *v)))
                .collect(),
            cursor: self.feed.then(|| "1".to_owned()),
        })
    }

    fn read(&self, path: &str, sink: &mut dyn Sink) -> Result<Read> {
        self.reads.lock().unwrap().push(path.to_owned());
        let files = self.files.lock().unwrap();
        let (bytes, version) = files
            .get(path)
            .ok_or_else(|| RemoteError::new(RemoteErrorKind::NotFound, "no"))?;
        sink.put(bytes)?;
        Ok(Read {
            version: version.to_string(),
            hash: None,
            size: bytes.len() as u64,
        })
    }

    fn write(&self, _: &str, _: &Condition, _: &Meta, _: &mut dyn Source) -> Result<Written> {
        unreachable!()
    }

    fn delete(&self, _: &str, _: &Condition) -> Result<()> {
        unreachable!()
    }

    fn rename(&self, _: &str, _: &str, _: &Condition) -> Result<Written> {
        unreachable!()
    }
}

fn sha(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

#[test]
fn a_new_version_is_read_once_to_find_its_hash() {
    let remote = Fake::default();
    remote.set("a.md", b"one", 1);
    let mut known = None;
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    let k = known.clone().unwrap();
    assert_eq!(k.files["a.md"].hash, sha(b"one"));
    assert_eq!(k.versions["a.md"], "1");
    assert_eq!(remote.reads.lock().unwrap().len(), 1);
    // Same version again: the picture's own memory, no read.
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    assert_eq!(remote.reads.lock().unwrap().len(), 1);
    // A new run of the app: the state's tokens do the same.
    let mut fresh = None;
    refresh(&remote, &mut fresh, &k.tokens()).unwrap();
    assert_eq!(remote.reads.lock().unwrap().len(), 1);
    assert_eq!(fresh.unwrap().files, k.files);
    // Another version is read again.
    remote.set("a.md", b"two", 2);
    refresh(&remote, &mut known, &k.tokens()).unwrap();
    assert_eq!(known.unwrap().files["a.md"].hash, sha(b"two"));
    assert_eq!(remote.reads.lock().unwrap().len(), 2);
}

#[test]
fn a_listing_in_full_drops_what_is_not_there() {
    let remote = Fake::default();
    remote.set("a.md", b"one", 1);
    remote.set("b.md", b"two", 1);
    let mut known = None;
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    remote.files.lock().unwrap().remove("b.md");
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    let k = known.unwrap();
    assert!(k.files.contains_key("a.md") && !k.files.contains_key("b.md"));
    assert!(!k.versions.contains_key("b.md"));
}

#[test]
fn a_lost_cursor_is_a_full_comparison_not_a_first_sync() {
    let remote = Fake {
        feed: true,
        ..Fake::default()
    };
    remote.set("a.md", b"one", 1);
    let mut known = None;
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    assert_eq!(known.as_ref().unwrap().cursor.as_deref(), Some("1"));
    remote.set("b.md", b"two", 1);
    *remote.lose_cursor.lock().unwrap() = true;
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    let k = known.unwrap();
    assert_eq!(k.files.len(), 2);
    assert_eq!(k.cursor.as_deref(), Some("1"));
}

#[test]
fn changes_are_applied_to_the_picture() {
    let remote = Fake {
        feed: true,
        ..Fake::default()
    };
    remote.set("a.md", b"one", 1);
    remote.set("b.md", b"two", 1);
    let mut known = None;
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    remote.set("c.md", b"three", 1);
    *remote.log.lock().unwrap() = vec![
        Change::Gone {
            path: "a.md".to_owned(),
            by: None,
            device: None,
        },
        Change::Renamed {
            from: "b.md".to_owned(),
            entry: Fake::entry("c.md", b"three", 1),
        },
    ];
    refresh(&remote, &mut known, &BTreeMap::new()).unwrap();
    let k = known.unwrap();
    assert_eq!(k.files.keys().collect::<Vec<_>>(), vec!["c.md"]);
    assert_eq!(k.cursor.as_deref(), Some("2"));
}

#[test]
fn a_failed_refresh_leaves_the_picture_as_it_was() {
    struct Down;
    impl Remote for Down {
        fn list(&self, _: Option<&str>) -> Result<Listing> {
            Err(RemoteError::new(RemoteErrorKind::Unreachable, "down"))
        }
        fn read(&self, _: &str, _: &mut dyn Sink) -> Result<Read> {
            unreachable!()
        }
        fn write(&self, _: &str, _: &Condition, _: &Meta, _: &mut dyn Source) -> Result<Written> {
            unreachable!()
        }
        fn delete(&self, _: &str, _: &Condition) -> Result<()> {
            unreachable!()
        }
        fn rename(&self, _: &str, _: &str, _: &Condition) -> Result<Written> {
            unreachable!()
        }
    }
    let mut known = Some(Known::default());
    let before = known.clone();
    let e = refresh(&Down, &mut known, &BTreeMap::new()).unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Unreachable);
    assert_eq!(known, before);
}

#[test]
fn a_write_is_conditional_on_the_version_the_plan_was_made_on() {
    let mut known = Known::default();
    known.put(
        "a.md".to_owned(),
        FileState {
            hash: "h1".to_owned(),
            size: 1,
        },
        "v1".to_owned(),
    );
    assert_eq!(known.condition("a.md", None).unwrap(), Condition::Absent);
    assert_eq!(
        known.condition("a.md", Some("h1")).unwrap(),
        Condition::Version("v1".to_owned())
    );
    // The picture holds another hash than the plan's base: refused.
    assert_eq!(
        known.condition("a.md", Some("h0")).unwrap_err().kind,
        RemoteErrorKind::Changed
    );
    assert_eq!(
        known.condition("gone.md", Some("h1")).unwrap_err().kind,
        RemoteErrorKind::Changed
    );
}
