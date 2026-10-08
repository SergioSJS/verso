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
//! What it does not see: on macOS, the inside of a directory reached
//! through a symlink that points outside the folder — the walk follows the
//! link (ADR 0044), FSEvents does not watch through it (on Linux `notify`
//! follows it, and watches all that lies beneath) — and what happens while
//! no watch runs. A caller that reindexes the whole folder on every batch
//! catches the second at the next change; "reindex" covers both.
//!
//! The caller names directories whose events are dropped whatever their
//! names — the index's own, when the configuration directory lies inside
//! the open folder: every index run writes there, and a caller that indexes
//! on each batch would otherwise wake itself for ever. An error of the
//! operating system's watcher is reported without the paths `notify`
//! attaches to it: an absolute path must not reach the contract
//! (ADR 0026, rule 4).

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
    /// Absolute directories whose events are dropped, in both forms too.
    excluded: Vec<PathBuf>,
    /// Whether the built-in ignored directories are dropped here too, as
    /// the walk drops them (the root's rules). Events under a
    /// `.gitignore`d path still pass: the walk that answers them leaves
    /// the path out, at the cost of a spare reindex — the matchers'
    /// directory context does not exist here.
    builtin_ignores: bool,
}

impl Filter {
    /// The event's path relative to the root, if the walk would list it;
    /// `Some(None)` for the root itself.
    fn relative(&self, path: &Path) -> Option<Option<PathBuf>> {
        if self.excluded.iter().any(|x| path.starts_with(x)) {
            return None;
        }
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
            let name_str = name.to_string_lossy();
            if self.builtin_ignores && crate::walk::is_default_ignored_dir(&name_str) {
                return None;
            }
            if name.as_encoded_bytes().starts_with(b".") {
                // The placeholder form outranks the hidden rule, as in the
                // walk: `.Name.md.icloud` stands for `Name.md`, and a
                // directory of that form is walked under its own name.
                match placeholder::icloud_placeholder_of(name) {
                    Some(real) if i + 1 == count => out = crate::rel_join(&out, real),
                    Some(_) => out = crate::rel_join(&out, name),
                    None => return None,
                }
            } else {
                out = crate::rel_join(&out, name);
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

/// On Windows a directory's own "modified" — `ReadDirectoryChangesW`'s
/// `FILE_ACTION_MODIFIED`, which notify reports as `Modify(Any)` — comes
/// when its last-access time or attributes change, as reading the notes in
/// it does; a change of what it holds comes as that entry's own event, and
/// its rename as `Modify(Name)`. Counted, every pass of the index would
/// cause the next (ADR 0069, item 9).
#[cfg(windows)]
fn directory_touched_only(kind: &EventKind, path: &Path) -> bool {
    matches!(kind, EventKind::Modify(ModifyKind::Any)) && path.is_dir()
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
            #[cfg(windows)]
            if directory_touched_only(&event.kind, path) {
                continue;
            }
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

/// A path and, when it differs, the name the operating system gives it.
fn both_forms(path: &Path) -> Vec<PathBuf> {
    let mut forms = vec![path.to_path_buf()];
    if let Ok(real) = std::fs::canonicalize(path)
        && real != path
    {
        forms.push(real);
    }
    forms
}

/// The watcher's error as its kind alone: `notify` names the paths it was
/// watching in its message, and the caller hands the message to a window.
fn without_paths(e: notify::Error) -> std::io::Error {
    use std::io::{Error, ErrorKind};
    match e.kind {
        notify::ErrorKind::Io(io) => match io.raw_os_error() {
            Some(code) => Error::from_raw_os_error(code),
            None => Error::from(io.kind()),
        },
        notify::ErrorKind::MaxFilesWatch => {
            Error::other("the system's limit on watched folders was reached")
        }
        notify::ErrorKind::PathNotFound => {
            Error::new(ErrorKind::NotFound, "a folder went away as watching began")
        }
        notify::ErrorKind::Generic(_)
        | notify::ErrorKind::WatchNotFound
        | notify::ErrorKind::InvalidConfig(_) => {
            Error::other("the operating system would not watch the folder")
        }
    }
}

/// Start watching `root` (absolute, as [`crate::Root`] keeps it), with
/// `ignored` confined as the root keeps them and `excluded` absolute.
pub(crate) fn start(
    root: &Path,
    ignored: Vec<PathBuf>,
    rules: crate::WalkRules,
    excluded: &[PathBuf],
    quiet: Duration,
    on_change: impl FnMut(Changes) + Send + 'static,
) -> Result<Watch, std::io::Error> {
    let filter = Filter {
        roots: both_forms(root),
        ignored,
        excluded: excluded.iter().flat_map(|x| both_forms(x)).collect(),
        builtin_ignores: rules.builtin_ignores,
    };
    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        // The receiving thread is gone once the watch stopped: nothing to
        // hand the event to, and nothing to report it to.
        let _ = tx.send(event);
    })
    .map_err(without_paths)?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(without_paths)?;
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
            excluded: vec![PathBuf::from(format!("{root}/Library/verso"))],
            builtin_ignores: true,
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
        // The iCloud placeholder form names the real file (ADR 0043); a
        // directory of that form is walked, so it is watched too.
        assert_eq!(
            rel("/tmp/v/Lugares/.Porto.md.icloud"),
            Some(Some("Lugares/Porto.md".into()))
        );
        assert_eq!(
            rel("/tmp/v/.Arquivo.icloud/Velho.md"),
            Some(Some(".Arquivo.icloud/Velho.md".into()))
        );
        // The index's own directory, inside the folder: never reported.
        assert_eq!(rel("/tmp/v/Library/verso/index/v-0123.json"), None);
        assert_eq!(
            rel("/tmp/v/Library/Outro.md"),
            Some(Some("Library/Outro.md".into()))
        );
    }

    /// `notify` names the paths it was watching in its errors; the error
    /// the caller gets does not (ADR 0026 rule 4).
    #[test]
    fn an_error_carries_no_path() {
        let secret = "/Users/u/cofre/Privada";
        for e in [
            notify::Error::io(std::io::Error::from_raw_os_error(13)),
            notify::Error::new(notify::ErrorKind::MaxFilesWatch),
            notify::Error::path_not_found(),
            notify::Error::generic(&format!("could not watch {secret}")),
        ] {
            let e = without_paths(e.add_path(PathBuf::from(secret)));
            assert!(!e.to_string().contains("cofre"), "{e}");
        }
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
