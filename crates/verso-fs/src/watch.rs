// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The watcher (ADR 0044: after feature 2; built on 2026-09-24 and
//! provisional until the maintainer decides on
//! `docs/reference/watcher-decision.md`): what changes in the open folder
//! while it is open, whoever changed it — another app, a sync client, git —
//! reported in batches of paths relative to the root, so that the caller
//! brings its index and its views up to date without the folder being
//! opened again.
//!
//! One `notify` watcher on the root, recursive: FSEvents on macOS, inotify
//! on Linux. Its events go through a channel to a thread of ours, which
//! keeps only what the walk would list — no hidden entry, no ignored path
//! (ADR 0044) — and only the events that change something: opening or
//! reading a file is not a change, and on Linux each read is an event, so a
//! caller that reindexes on every batch (and reindexing reads every note)
//! would otherwise wake itself for ever. A batch is handed over once the
//! folder has been quiet for the caller's `quiet`, or after [`MAX_WAIT`] of
//! changes that do not stop.
//!
//! What it does not see: the inside of a directory reached through a
//! symlink that points outside the folder — the walk follows the link
//! (ADR 0044), the operating system does not watch through it — and what
//! happens while no watch runs. A caller that reindexes the whole folder on
//! every batch catches the second at the next change; "reindex" covers both.

use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use notify::event::{AccessKind, AccessMode, MetadataKind, ModifyKind};
use notify::{Event, EventKind, RecursiveMode, Watcher as _};

use crate::placeholder;

/// The longest a batch waits for the folder to go quiet: changes that do
/// not stop (a sync, a checkout) are still handed over this often.
pub const MAX_WAIT: Duration = Duration::from_secs(2);

/// How often an idle watch looks whether it was stopped, when the
/// operating system's watcher has not already ended it.
const IDLE_CHECK: Duration = Duration::from_millis(500);

/// One batch of changes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Changes {
    /// Paths relative to the root that something happened to — created,
    /// written, removed, renamed from or to — each once, sorted. A path may
    /// name a directory, or a file that is gone by now. An iCloud Drive
    /// placeholder `.Name.ext.icloud` is reported as `Name.ext`, the name
    /// the walk gives it (ADR 0043).
    pub paths: Vec<PathBuf>,
    /// The operating system lost track — events were dropped, or it asks
    /// for the tree to be scanned again, or the root itself moved: anything
    /// under the root may have changed, whatever `paths` says.
    pub rescan: bool,
}

/// A running watch. Dropping it stops it: the operating system's watcher
/// goes at once, and the thread that batches its events ends at its next
/// wake-up, never waiting for the caller — a caller that holds a lock its
/// own `on_change` takes can drop a watch under that lock.
pub struct Watch {
    stop: Arc<AtomicBool>,
    _watcher: notify::RecommendedWatcher,
}

impl std::fmt::Debug for Watch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Watch")
            .field("stopped", &self.stop.load(Ordering::SeqCst))
            .finish_non_exhaustive()
    }
}

impl Drop for Watch {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

/// What a watch needs to turn an event's path into a path the walk lists.
struct Filter {
    /// The root as the caller named it, and as the operating system names
    /// it — FSEvents reports real paths, so `/tmp/x` comes back as
    /// `/private/tmp/x`.
    roots: Vec<PathBuf>,
    ignored: Vec<PathBuf>,
}

impl Filter {
    /// The event's path relative to the root, if the walk would list it;
    /// `Some(None)` for the root itself.
    fn relative(&self, path: &Path) -> Option<Option<PathBuf>> {
        let rel = self.roots.iter().find_map(|r| path.strip_prefix(r).ok())?;
        if rel.as_os_str().is_empty() {
            return Some(None);
        }
        let mut out = PathBuf::new();
        let count = rel.components().count();
        for (i, c) in rel.components().enumerate() {
            let Component::Normal(name) = c else {
                return None;
            };
            if name.as_encoded_bytes().starts_with(b".") {
                // The placeholder form outranks the hidden rule, as in the
                // walk: `.Name.md.icloud` stands for `Name.md`.
                match placeholder::icloud_placeholder_of(name) {
                    Some(real) if i + 1 == count => out.push(real),
                    _ => return None,
                }
            } else {
                out.push(name);
            }
        }
        if self.ignored.iter().any(|i| out == *i || out.starts_with(i)) {
            return None;
        }
        Some(Some(out))
    }
}

/// Whether an event can mean the folder changed. Opening, reading and
/// closing a file read-only change nothing, nor does a new access time.
fn changes_something(kind: &EventKind) -> bool {
    match kind {
        EventKind::Access(AccessKind::Close(AccessMode::Write)) => true,
        EventKind::Access(_)
        | EventKind::Modify(ModifyKind::Metadata(MetadataKind::AccessTime)) => false,
        EventKind::Create(_)
        | EventKind::Modify(_)
        | EventKind::Remove(_)
        | EventKind::Any
        | EventKind::Other => true,
    }
}

/// The batch being gathered.
#[derive(Default)]
struct Pending {
    paths: BTreeSet<PathBuf>,
    rescan: bool,
    /// When the first change of the batch came in, and the last one.
    first: Option<Instant>,
    last: Option<Instant>,
}

impl Pending {
    fn add(&mut self, filter: &Filter, event: &Event) {
        if !event.need_rescan() && !changes_something(&event.kind) {
            return;
        }
        let mut relevant = event.need_rescan();
        if event.need_rescan() {
            self.rescan = true;
        }
        for path in &event.paths {
            match filter.relative(path) {
                Some(Some(rel)) => {
                    self.paths.insert(rel);
                    relevant = true;
                }
                // The root itself: removed, moved, or its attributes; the
                // caller looks again at everything.
                Some(None) => {
                    self.rescan = true;
                    relevant = true;
                }
                None => {}
            }
        }
        if relevant {
            let now = Instant::now();
            self.first.get_or_insert(now);
            self.last = Some(now);
        }
    }

    fn lost_track(&mut self) {
        self.rescan = true;
        let now = Instant::now();
        self.first.get_or_insert(now);
        self.last = Some(now);
    }

    /// How long to wait for the next event before handing the batch over.
    fn timeout(&self, quiet: Duration) -> Duration {
        match (self.first, self.last) {
            (Some(first), Some(last)) => {
                let now = Instant::now();
                let by_quiet = (last + quiet).saturating_duration_since(now);
                let by_max = (first + MAX_WAIT).saturating_duration_since(now);
                by_quiet.min(by_max)
            }
            _ => IDLE_CHECK,
        }
    }

    fn take(&mut self) -> Option<Changes> {
        self.first?;
        let changes = Changes {
            paths: std::mem::take(&mut self.paths).into_iter().collect(),
            rescan: self.rescan,
        };
        *self = Self::default();
        Some(changes)
    }
}

/// Start watching `root` (absolute, as [`crate::Root`] keeps it), with
/// `ignored` confined as the root keeps them.
pub(crate) fn start(
    root: &Path,
    ignored: Vec<PathBuf>,
    quiet: Duration,
    on_change: impl FnMut(Changes) + Send + 'static,
) -> Result<Watch, std::io::Error> {
    let mut roots = vec![root.to_path_buf()];
    if let Ok(real) = std::fs::canonicalize(root)
        && real != root
    {
        roots.push(real);
    }
    let filter = Filter { roots, ignored };
    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        // The receiving thread is gone once the watch stopped: nothing to
        // hand the event to, and nothing to report it to.
        let _ = tx.send(event);
    })
    .map_err(std::io::Error::other)?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(std::io::Error::other)?;
    let stop = Arc::new(AtomicBool::new(false));
    let stopped = Arc::clone(&stop);
    std::thread::Builder::new()
        .name("verso-watch".to_owned())
        .spawn(move || run(&rx, &stopped, &filter, quiet, on_change))?;
    Ok(Watch {
        stop,
        _watcher: watcher,
    })
}

fn run(
    rx: &Receiver<notify::Result<Event>>,
    stop: &AtomicBool,
    filter: &Filter,
    quiet: Duration,
    mut on_change: impl FnMut(Changes),
) {
    let mut pending = Pending::default();
    loop {
        if stop.load(Ordering::SeqCst) {
            return;
        }
        match rx.recv_timeout(pending.timeout(quiet)) {
            Ok(Ok(event)) => pending.add(filter, &event),
            // An error of the operating system's watcher: events may have
            // been lost.
            Ok(Err(_)) => pending.lost_track(),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        if pending.timeout(quiet).is_zero()
            && !stop.load(Ordering::SeqCst)
            && let Some(changes) = pending.take()
        {
            on_change(changes);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filter(root: &str, ignored: &[&str]) -> Filter {
        Filter {
            roots: vec![
                PathBuf::from(root),
                PathBuf::from(format!("/private{root}")),
            ],
            ignored: ignored.iter().map(PathBuf::from).collect(),
        }
    }

    #[test]
    fn only_what_the_walk_lists_is_reported() {
        let f = filter("/tmp/v", &["Arquivo"]);
        let rel = |p: &str| f.relative(Path::new(p));
        assert_eq!(rel("/tmp/v/Taverna.md"), Some(Some("Taverna.md".into())));
        assert_eq!(
            rel("/private/tmp/v/Lugares/Porto.md"),
            Some(Some("Lugares/Porto.md".into()))
        );
        assert_eq!(rel("/tmp/v"), Some(None));
        // Hidden at any depth, ignored paths, outside the root: not listed.
        assert_eq!(rel("/tmp/v/.obsidian/workspace.json"), None);
        assert_eq!(rel("/tmp/v/Lugares/.verso-tmp-1-2"), None);
        assert_eq!(rel("/tmp/v/Arquivo/Velho.md"), None);
        assert_eq!(rel("/tmp/w/Taverna.md"), None);
        // The iCloud placeholder form names the real file (ADR 0043).
        assert_eq!(
            rel("/tmp/v/Lugares/.Porto.md.icloud"),
            Some(Some("Lugares/Porto.md".into()))
        );
    }

    #[test]
    fn reading_is_not_a_change() {
        use notify::event::{CreateKind, DataChange, RemoveKind};
        assert!(!changes_something(&EventKind::Access(AccessKind::Open(
            notify::event::AccessMode::Any
        ))));
        assert!(!changes_something(&EventKind::Access(AccessKind::Close(
            AccessMode::Read
        ))));
        assert!(!changes_something(&EventKind::Modify(
            ModifyKind::Metadata(MetadataKind::AccessTime)
        )));
        assert!(changes_something(&EventKind::Access(AccessKind::Close(
            AccessMode::Write
        ))));
        assert!(changes_something(&EventKind::Create(CreateKind::File)));
        assert!(changes_something(&EventKind::Modify(ModifyKind::Data(
            DataChange::Content
        ))));
        assert!(changes_something(&EventKind::Remove(RemoveKind::Any)));
    }

    #[test]
    fn a_batch_waits_for_quiet_but_not_for_ever() {
        let f = filter("/tmp/v", &[]);
        let mut p = Pending::default();
        assert_eq!(p.timeout(Duration::from_millis(200)), IDLE_CHECK);
        assert!(p.take().is_none());
        let event = Event::new(EventKind::Create(notify::event::CreateKind::File))
            .add_path("/tmp/v/Nova.md".into());
        p.add(&f, &event);
        let t = p.timeout(Duration::from_millis(200));
        assert!(
            t > Duration::ZERO && t <= Duration::from_millis(200),
            "{t:?}"
        );
        // Continuous changes: never longer than MAX_WAIT from the first.
        p.first = Some(Instant::now() - MAX_WAIT);
        assert!(p.timeout(Duration::from_millis(200)).is_zero());
        let changes = p.take().unwrap();
        assert_eq!(changes.paths, vec![PathBuf::from("Nova.md")]);
        assert!(!changes.rescan);
        assert!(p.take().is_none());
    }

    #[test]
    fn an_event_nothing_lists_starts_no_batch() {
        let f = filter("/tmp/v", &[]);
        let mut p = Pending::default();
        let event = Event::new(EventKind::Modify(ModifyKind::Any))
            .add_path("/tmp/v/.obsidian/workspace.json".into());
        p.add(&f, &event);
        assert!(p.take().is_none());
        let read = Event::new(EventKind::Access(AccessKind::Open(
            notify::event::AccessMode::Any,
        )))
        .add_path("/tmp/v/Taverna.md".into());
        p.add(&f, &read);
        assert!(p.take().is_none());
    }
}
