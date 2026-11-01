// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table is a campaign folder (ADR 0110): the state of the tables of a
//! folder, as the rest of the server asks it.
//!
//! A **player** is a window that may only read a folder with a table in
//! it (`readers::reads_only`): an invited reader, a token that reads. The
//! game master — the owner, and any editor: a co-master — sees the folder
//! whole. Everything a player is told of a path inside a table goes
//! through the [`Veil`]: a note with no row is hidden, a released one is
//! served, a closed table serves nothing, an attachment is served only
//! when a released note links or embeds it (decided in the code, ADR 0110
//! item 4). The veil is a snapshot of the database, cached per folder
//! and made again whenever a table, a release or a grant changes
//! ([`changed`]) or a file of the folder does (`sync::record_changes`).
//!
//! The commands that read are filtered in `campaign_serve.rs`; the owner's
//! own commands are `campaign_cmds.rs`.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use verso_contract::ContractError;
use verso_service::lock;

use crate::access::{
    AccessFacts, Action, Asker, Cap, Kind, Level, NodeSet, TableFact, Target, may,
};
use crate::db::{Audience, Campaign, Grant, NoteState, Role};
use crate::state::Server;

/// What a closed table answers a player who tries to open it (MC.1 = A).
pub const CLOSED: &str = verso_contract::TABLE_CLOSED;

/// The key a path is looked up by: case folded, the separators of any
/// system made `/`, and `.` and `..` resolved as the path reads (a `..`
/// that would leave the folder is dropped), so that every name that
/// reaches a file reaches the same state (fails closed).
#[must_use]
pub fn key(path: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    for p in path.replace('\\', "/").split('/') {
        match p {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            p => parts.push(p.to_lowercase()),
        }
    }
    parts.join("/")
}

/// Whether `path` names a note, a board or a base: what a table keeps
/// hidden until released. Judged by the name, case and trailing dots and
/// spaces ignored, as `readers::is_note` does.
#[must_use]
pub fn note_like(path: &str) -> bool {
    let p = path.trim_end_matches(['.', ' ']).to_lowercase();
    p.ends_with(".md") || p.ends_with(".canvas") || p.ends_with(".base")
}

/// Whether `root` (a table's folder, `""` the folder) covers `path`.
pub(crate) fn covers(root: &str, path: &str) -> bool {
    let (root, path) = (key(root), key(path));
    root.is_empty() || path == root || path.starts_with(&format!("{root}/"))
}

/// Whose eyes a [`Veil`] is. A note's audience (ADR 0110 item 4, amended
/// 2026-10-23) is a question asked of someone: what the veil of a folder
/// answers without being told who asks is the **public** one, which sees
/// only what the whole table sees — it fails closed.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Viewer {
    /// Anyone at the table: only what is released to the whole table.
    Public,
    /// Any player at all: what at least one player sees. What sync keeps
    /// of a file for its readers is told for this one; each player's own
    /// answer is cut from it ([`Veil::view`]).
    Union,
    /// This account.
    Account(String),
    /// This account with a credential that writes: served whole the notes
    /// it edits (ADR 0113 S8).
    Writer(String),
    /// This account, a folder's editor, with a credential that writes: a
    /// player who edits every file they see (ADR 0113 K.1).
    Editor(String),
}

/// The state of the tables of one folder, as a player is concerned: the
/// access sets of its files ([`AccessFacts`], ADR 0113), and what the
/// tables keep besides.
pub struct Veil {
    pub folder: String,
    pub tables: Vec<Campaign>,
    /// The rules' facts: the tables, the sets, the rights.
    facts: Arc<AccessFacts>,
    /// The paths the table keeps a state for, as kept: the owner's listing.
    notes: Arc<Vec<NoteState>>,
    /// The paths whose name is a secret, by key.
    secrets: Arc<HashSet<String>>,
    /// The table's language: its game master's.
    pub lang: String,
    /// The images the table shows: open to everyone at it.
    images: Arc<HashSet<String>>,
    /// The attachments a released note opens; made on first need, from
    /// the folder itself (`campaign_serve::opened`).
    files: OnceLock<HashSet<String>>,
    /// What each note or board of the folder opens (the attachments it
    /// links or embeds), by path: read from the file once per veil of the
    /// folder's state, for every viewer's view of it. It depends on the
    /// file alone, never on who looks; the viewer only chooses which notes
    /// count (`campaign_serve::opened`). A change of the folder's files
    /// makes the veil again, and this with it.
    opens: Arc<Mutex<HashMap<String, Arc<HashSet<String>>>>>,
    viewer: Viewer,
    /// Whether the players of the folder each have a sync log of their
    /// own (`campaign_epoch`).
    restricted: bool,
    /// The tables could not be read: this veil serves nothing and is never
    /// written from ([`Veil::is_unreadable`]).
    unreadable: bool,
    /// The veil as each player sees it, made on first need.
    views: Mutex<HashMap<String, Arc<Veil>>>,
    union: OnceLock<Arc<Veil>>,
}

impl Veil {
    /// The table that holds `path`, the deepest.
    fn table_of(&self, path: &str) -> Option<&Campaign> {
        self.tables
            .iter()
            .filter(|t| covers(&t.root, path))
            .max_by_key(|t| key(&t.root).len())
    }

    /// Whether `path` lies inside a table.
    #[must_use]
    pub fn in_table(&self, path: &str) -> bool {
        self.table_of(path).is_some()
    }

    /// The rules' facts (ADR 0113 section A): what `access::may` reads.
    #[must_use]
    pub fn facts(&self) -> &Arc<AccessFacts> {
        &self.facts
    }

    /// The nearest set of `path` inside its table: its own, else its
    /// folder's (ADR 0113 item 2).
    fn set_of(&self, path: &str) -> Option<&NodeSet> {
        let table = self.table_of(path)?;
        self.facts.nearest_set(path, &table.root).map(|(_, s)| s)
    }

    /// What this veil's viewer has of the set at `path`: the whole
    /// table's row for the public, the most any player has for the union,
    /// the account's own row else the whole table's.
    fn level(&self, path: &str) -> Level {
        let Some(set) = self.set_of(path) else {
            return Level::None;
        };
        match &self.viewer {
            Viewer::Public => set.whole,
            Viewer::Union => set.most(),
            Viewer::Account(a) | Viewer::Writer(a) | Viewer::Editor(a) => set.of(a),
        }
    }

    /// Whether the viewer sees the note at `path`: its set gives the viewer
    /// at least *sees* (a player who edits a note sees it).
    #[must_use]
    pub fn released(&self, path: &str) -> bool {
        self.in_table(path) && self.level(path) >= Level::See
    }

    /// This veil as `account` sees the folder.
    #[must_use]
    pub fn view(&self, account: &str) -> Arc<Veil> {
        let mut views = lock(&self.views);
        Arc::clone(
            views
                .entry(account.to_owned())
                .or_insert_with(|| Arc::new(self.derive(Viewer::Account(account.to_owned())))),
        )
    }

    /// This veil as `account` sees the folder through a credential that
    /// `writes` (or reads only), `editor` being a folder's editor. Whoever
    /// edits a note is served it whole only with a credential that writes,
    /// as the window is (`SeeSecretBlocks`). The role is read live by the
    /// caller, never kept: a demoted editor is served the projection at once.
    #[must_use]
    pub fn view_for(&self, account: &str, editor: bool, writes: bool) -> Arc<Veil> {
        if !writes {
            return self.view(account);
        }
        let (name, viewer) = if editor {
            (
                format!("\u{0}editor:{account}"),
                Viewer::Editor(account.to_owned()),
            )
        } else {
            (
                format!("\u{0}writer:{account}"),
                Viewer::Writer(account.to_owned()),
            )
        };
        let mut views = lock(&self.views);
        Arc::clone(
            views
                .entry(name)
                .or_insert_with(|| Arc::new(self.derive(viewer))),
        )
    }

    /// This veil as the folder's players together see it: a note is seen
    /// when any player sees it (what sync keeps for readers).
    #[must_use]
    pub fn union(&self) -> Arc<Veil> {
        Arc::clone(
            self.union
                .get_or_init(|| Arc::new(self.derive(Viewer::Union))),
        )
    }

    fn derive(&self, viewer: Viewer) -> Veil {
        Veil {
            folder: self.folder.clone(),
            tables: self.tables.clone(),
            facts: Arc::clone(&self.facts),
            notes: Arc::clone(&self.notes),
            secrets: Arc::clone(&self.secrets),
            lang: self.lang.clone(),
            images: Arc::clone(&self.images),
            files: OnceLock::new(),
            opens: Arc::clone(&self.opens),
            viewer,
            restricted: self.restricted,
            unreadable: self.unreadable,
            views: Mutex::new(HashMap::new()),
            union: OnceLock::new(),
        }
    }

    /// Whether the folder has notes released to some players, or ever had:
    /// what its players are told of the sync log is then each its own.
    #[must_use]
    pub fn restricted(&self) -> bool {
        self.restricted
    }

    /// Whether the tables could not be read ([`unreadable`]): every door
    /// fails closed, and nothing is recorded, settled or sent from it.
    #[must_use]
    pub fn is_unreadable(&self) -> bool {
        self.unreadable
    }

    /// The rules' asker for a player who is `account`: a reader of the
    /// folder, whatever else it is (the veil judges what a player is told,
    /// never what a role may do).
    fn player_asker(account: &str) -> Asker {
        Asker {
            account: account.to_owned(),
            role: Some(Role::Reader),
            cap: Cap::Write,
            phone: false,
            link: false,
            admin: false,
            owns_folder: false,
        }
    }

    /// The visitor of a read link, a player with no name: only the *Whole
    /// table* rows.
    fn visitor_asker() -> Asker {
        Asker {
            account: String::new(),
            role: None,
            cap: Cap::Read,
            phone: false,
            link: true,
            admin: false,
            owns_folder: false,
        }
    }

    /// `may(See)` for `asker` on `path`, `derived` told by the caller.
    fn sees_as(&self, asker: &Asker, path: &str, derived: bool) -> bool {
        may(
            &self.facts,
            asker,
            Action::See,
            &Target::new(path, Kind::of_path(path)).derived(derived),
        )
        .allowed()
    }

    /// Whether the note at `path` is hidden from `account`, a player:
    /// the question of a place that has no [`Veil::view`] at hand.
    #[must_use]
    pub fn hides_note_from(&self, path: &str, account: &str) -> bool {
        if !self.in_table(path) {
            return false;
        }
        // An attachment no set covers is hidden, unless the table shows it.
        let derived =
            !note_like(path) && self.set_of(path).is_none() && self.images.contains(&key(path));
        !self.sees_as(&Self::player_asker(account), path, derived)
    }

    /// Who the note at `path` is released to (hidden when it has no set).
    #[must_use]
    pub fn audience_of(&self, path: &str) -> Audience {
        self.set_of(path)
            .map(|s| crate::db::words_of(s).0)
            .unwrap_or_default()
    }

    /// Whether the name of the note at `path` is a secret.
    #[must_use]
    pub fn secret_name(&self, path: &str) -> bool {
        self.secrets.contains(&key(path))
    }

    /// Who may edit the note at `path`.
    #[must_use]
    pub fn grant(&self, path: &str) -> Grant {
        self.set_of(path)
            .map(|s| crate::db::words_of(s).1)
            .unwrap_or_default()
    }

    /// Whether `account` may edit the note at `path` by its set: the
    /// whole table's row or its own says *edits*.
    #[must_use]
    pub fn may_edit(&self, path: &str, account: &str) -> bool {
        self.set_of(path)
            .is_some_and(|s| s.of(account) == Level::Edit)
    }

    /// Whether the note at `path` is edited by the whole group: served to
    /// everyone as it is, since all who read it may edit it.
    #[must_use]
    pub fn group_edits(&self, path: &str) -> bool {
        // A board a player edits is edited by element, in a room of its
        // own: it is never served whole (ADR 0113 H).
        !crate::readers::is_board(path)
            && self
                .set_of(path)
                .is_some_and(|s| s.whole == Level::Edit && s.rows.is_empty())
    }

    /// Whether this veil's viewer is served the note at `path` whole,
    /// secret blocks and all, since it edits it (ADR 0113 S8): the whole
    /// group edits it, its own row says *edits*, or it is a folder's editor
    /// who sees it. A board is never served whole to one who edits it
    /// alone: its room cuts it by element (H).
    #[must_use]
    pub fn serves_whole(&self, path: &str) -> bool {
        if matches!(self.viewer, Viewer::Union) && self.group_edits(path) {
            return true;
        }
        if !crate::readers::is_note(path) {
            return matches!(self.viewer, Viewer::Writer(_) | Viewer::Editor(_))
                && self.group_edits(path);
        }
        match &self.viewer {
            Viewer::Writer(a) => {
                (self.group_edits(path) || self.may_edit(path, a)) && !self.hides_note(path)
            }
            Viewer::Editor(_) => self.in_table(path) && !self.hides_note(path),
            _ => false,
        }
    }

    /// The attachments released notes link or embed, built by `make` the
    /// first time they are asked for.
    /// What the note or board at `path` opens, read by `make` the first
    /// time and kept for this state of the folder.
    pub fn opens_of(
        &self,
        path: &str,
        make: impl FnOnce() -> HashSet<String>,
    ) -> Arc<HashSet<String>> {
        if let Some(found) = lock(&self.opens).get(path) {
            return Arc::clone(found);
        }
        let made = Arc::new(make());
        Arc::clone(lock(&self.opens).entry(path.to_owned()).or_insert(made))
    }

    pub fn files_with(&self, make: impl FnOnce() -> HashSet<String>) -> &HashSet<String> {
        self.files.get_or_init(make)
    }

    /// Whether a player is kept from `path`. `files` is the attachments a
    /// released note opens ([`Veil::files_with`]). One decision: the rules'
    /// `may(See)` (ADR 0113), for the veil's viewer.
    #[must_use]
    pub fn hides(&self, path: &str, files: &dyn Fn() -> bool) -> bool {
        if !self.in_table(path) {
            return false;
        }
        // An attachment is a file of the table too: an access of its own
        // (or its folder's) wins (ADR 0113 K.3); with none, it is served
        // only through a released note, or as an image the table shows. A
        // folder's own path is none (see `folder_shown` in the serving).
        let derived = !note_like(path)
            && self.set_of(path).is_none()
            && (files() || self.images.contains(&key(path)));
        match &self.viewer {
            Viewer::Public => !self.sees_as(&Self::visitor_asker(), path, derived),
            Viewer::Account(a) | Viewer::Writer(a) | Viewer::Editor(a) => {
                !self.sees_as(&Self::player_asker(a), path, derived)
            }
            // The players together: seen when any player sees it.
            Viewer::Union => {
                let table_open = self.table_of(path).is_some_and(|t| t.open);
                !(table_open
                    && match self.set_of(path) {
                        Some(set) => set.most() >= Level::See,
                        None => derived,
                    })
            }
        }
    }

    /// Whether a note (by its name, not an attachment) is hidden.
    #[must_use]
    pub fn hides_note(&self, path: &str) -> bool {
        self.hides(path, &|| false)
    }

    /// The access `path` has through its folder, when it has none of its
    /// own — what a move carries along (ADR 0113 K.2): the nearest set above
    /// it, else hidden. `None` when `path` has a set of its own (it travels
    /// with the move) or lies in no table.
    #[must_use]
    pub fn inherited_set(&self, path: &str) -> Option<NodeSet> {
        let table = self.table_of(path)?;
        if self.facts.sets.contains_key(&key(path)) {
            return None;
        }
        Some(
            self.facts
                .nearest_set(path, &table.root)
                .map(|(_, s)| s.clone())
                .unwrap_or_default()
                .normalized(),
        )
    }

    /// The set `path` follows now: its own, else its folder's, else hidden.
    #[must_use]
    pub fn effective_set(&self, path: &str) -> NodeSet {
        self.set_of(path)
            .map(|s| s.clone().normalized())
            .unwrap_or_default()
    }

    /// Whether `path` is told apart by player: its set has a row of a
    /// player's own.
    #[must_use]
    pub fn has_player_rows(&self, path: &str) -> bool {
        self.set_of(path).is_some_and(|s| !s.rows.is_empty())
    }

    /// The paths of notes with a state: for the owner's listing.
    pub fn states(&self) -> impl Iterator<Item = &NoteState> {
        self.notes.iter()
    }

    /// The table that holds `path`, for the limits.
    #[must_use]
    pub fn table(&self, path: &str) -> Option<&Campaign> {
        self.table_of(path)
    }
}

/// A change of a table whose telling waits for its state to be readable.
pub(crate) enum Pending {
    /// What players and windows are told (`campaign_cmds::refresh`).
    Refresh {
        key: String,
        touched: Vec<String>,
        before: Option<Arc<Veil>>,
    },
    /// What the sync log says of audiences (`campaign_sync::audience_events`).
    Audience {
        key: String,
        events: Vec<crate::campaign_cmds::Event>,
        before: Option<Arc<Veil>>,
        /// Where the table's state was (`state_generation`) when it waited:
        /// what moved since is derived again, not replayed.
        at: u64,
    },
}

impl Pending {
    /// Two entries as one: the same kind joins its notes and players; a
    /// window's refresh joins an audience's by being kept as the audience.
    fn merged(self, other: Self) -> Self {
        use crate::campaign_cmds::Event;
        match (self, other) {
            (
                Self::Audience {
                    key,
                    mut events,
                    before,
                    ..
                },
                Self::Audience { events: more, .. },
            ) => {
                for e in more {
                    match events.iter_mut().find(|x| x.path == e.path) {
                        Some(x) => {
                            let Event { lost, gained, .. } = e;
                            for a in lost {
                                if !x.lost.contains(&a) {
                                    x.lost.push(a);
                                }
                            }
                            for a in gained {
                                if !x.gained.contains(&a) {
                                    x.gained.push(a);
                                }
                            }
                        }
                        None => events.push(e),
                    }
                }
                // A state generation that no table has: derived again.
                Self::Audience {
                    key,
                    events,
                    before,
                    at: u64::MAX,
                }
            }
            (
                Self::Refresh {
                    key,
                    mut touched,
                    before,
                },
                Self::Refresh { touched: more, .. },
            ) => {
                for p in more {
                    if !touched.contains(&p) {
                        touched.push(p);
                    }
                }
                Self::Refresh {
                    key,
                    touched,
                    before,
                }
            }
            // A refresh only tells windows what to read again; an audience is
            // what the devices' logs say. The audience stays.
            (a @ Self::Audience { .. }, Self::Refresh { .. })
            | (Self::Refresh { .. }, a @ Self::Audience { .. }) => a,
        }
    }
}

/// How much waits for one folder's table at most: past it, entries are made
/// one.
const PENDING_MOST: usize = 64;

/// How many players' locks and told files the server keeps at most (a
/// 1 GB host, ADR 0083): past it the unused are let go, the told files
/// all.
const VIEWERS_MOST: usize = 2048;

/// A player of a folder: the folder's id and the account's.
type Account = (String, String);

/// The files a player was told of, kept between its asks: where the log was
/// and which generation of the veils they were told at, the files' names
/// (as a digest) and, per file, what the manifest held and what the player
/// was told — a file whose manifest row and neighbours are as they were is
/// not told again.
#[derive(Default)]
pub(crate) struct FilesTold {
    pub head: i64,
    pub generation: u64,
    pub digest: u64,
    pub per_file: HashMap<String, ((String, i64), Option<serde_json::Value>)>,
    pub files: Arc<Vec<serde_json::Value>>,
}
type Told = FilesTold;

/// The veils of the folders, by folder id; `None` is a folder with no
/// table.
#[derive(Default)]
pub struct Cache {
    map: Mutex<HashMap<String, Option<Arc<Veil>>>>,
    /// How many times each folder's veil was forgotten, and how many of
    /// those were of its tables' state (not only of its files): a veil read
    /// before a forgetting is not kept after it (it may be of the state
    /// before), and what was decided from the state is decided again when
    /// that moved.
    generations: Mutex<HashMap<String, (u64, u64)>>,
    /// What was to be told of a table's change when its state could not be
    /// read, by folder: told once it can ([`crate::campaign_sync::replay_pending`]).
    pending: Mutex<HashMap<String, Vec<Pending>>>,
    /// One at a time, per folder and account, the decision of what a
    /// player's log holds (`campaign_sync::viewer_*`).
    viewers: Mutex<HashMap<Account, Arc<Mutex<()>>>>,
    /// The files a player is told of, by folder and account, with the log
    /// head and the generation they were told at.
    pub(crate) told_files: Mutex<HashMap<Account, Told>>,
}

impl Cache {
    /// Keep `what` for `folder` until its table can be read.
    pub(crate) fn defer(&self, folder: &str, what: Pending) {
        let mut all = lock(&self.pending);
        let list = all.entry(folder.to_owned()).or_default();
        list.push(what);
        // Bounded, and nothing is let go: past the bound the two oldest are
        // made one (their notes and the players they named together, to be
        // derived again from the table as it is when they are told).
        while list.len() > PENDING_MOST {
            let (a, b) = (list.remove(0), list.remove(0));
            list.insert(0, a.merged(b));
        }
    }

    /// How much waits for `folder`.
    #[cfg(test)]
    pub(crate) fn pending_len(&self, folder: &str) -> usize {
        lock(&self.pending).get(folder).map_or(0, Vec::len)
    }

    /// What waits for `folder`, taken.
    pub(crate) fn take_pending(&self, folder: &str) -> Vec<Pending> {
        lock(&self.pending).remove(folder).unwrap_or_default()
    }

    /// The lock of one player's log of `folder`.
    pub(crate) fn viewer_lock(&self, folder: &str, account: &str) -> Arc<Mutex<()>> {
        let mut viewers = lock(&self.viewers);
        // Bounded: the locks nobody holds are let go past a few thousand.
        if viewers.len() > VIEWERS_MOST {
            viewers.retain(|_, l| Arc::strong_count(l) > 1);
        }
        Arc::clone(
            viewers
                .entry((folder.to_owned(), account.to_owned()))
                .or_default(),
        )
    }

    /// Where the forgettings of `folder`'s veil are.
    pub(crate) fn generation(&self, folder: &str) -> u64 {
        lock(&self.generations).get(folder).map_or(0, |g| g.0)
    }

    /// Where the changes of `folder`'s tables are (a file written is none).
    pub(crate) fn state_generation(&self, folder: &str) -> u64 {
        lock(&self.generations).get(folder).map_or(0, |g| g.1)
    }
}

/// What is known of `folder`'s table without reading the database: `None`
/// when the folder has not been asked about yet.
pub(crate) fn cached(server: &Server, folder: &str) -> Option<Option<Arc<Veil>>> {
    lock(&server.campaigns.map).get(folder).cloned()
}

/// The veil of `folder`, if it has a table. A folder whose tables cannot
/// be read is a closed table, not a folder with none ([`unreadable`]):
/// every door fails closed, and the failure is not kept.
pub fn veil_of(server: &Server, folder: &str) -> Option<Arc<Veil>> {
    if let Some(found) = lock(&server.campaigns.map).get(folder) {
        return found.clone();
    }
    let generation = server.campaigns.generation(folder);
    let made = match make(server, folder) {
        Ok(made) => made,
        Err(e) => {
            crate::log::error(&format!("reading a table's state: {e}"));
            return Some(unreadable(folder));
        }
    };
    let mut map = lock(&server.campaigns.map);
    // Forgotten while it was read: the next ask reads again.
    if server.campaigns.generation(folder) == generation {
        map.insert(folder.to_owned(), made.clone());
    }
    made
}

/// The folders whose tables a test makes unreadable.
#[cfg(test)]
pub(crate) static FAIL_READS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// The tables of a folder could not be read.
#[derive(Debug, Clone, Copy)]
pub struct Unreadable;

/// The veil of `folder` for a step that writes (records, settles, tells):
/// `None` when it has no table, and a warning, `Err`, when its tables
/// cannot be read — such a step leaves everything as it was.
pub fn veil_to_write(
    server: &Server,
    folder: &str,
    step: &str,
) -> Result<Option<Arc<Veil>>, Unreadable> {
    match veil_of(server, folder) {
        Some(v) if v.is_unreadable() => {
            crate::log::warn(&format!(
                "a table's state cannot be read: {step} waits for the next change"
            ));
            Err(Unreadable)
        }
        other => Ok(other),
    }
}

fn make(server: &Server, folder: &str) -> Result<Option<Arc<Veil>>, String> {
    #[cfg(test)]
    if lock(&FAIL_READS).iter().any(|f| f == folder) {
        return Err("a read made to fail".to_owned());
    }
    build(&server.db, folder)
}

/// The veil of `folder` as the database has it now, if it has a table.
pub(crate) fn build(db: &crate::db::Db, folder: &str) -> Result<Option<Arc<Veil>>, String> {
    let tables = db.campaigns_of(folder)?;
    if tables.is_empty() {
        return Ok(None);
    }
    let (mut facts, notes) = db.campaign_snapshot(folder)?;
    // The tables are the veil's own, read once: the rules see the same.
    facts.tables = tables
        .iter()
        .map(|t| TableFact {
            root: t.root.clone(),
            open: t.open,
        })
        .collect();
    let secrets: HashSet<String> = notes
        .iter()
        .filter(|n| n.secret_name)
        .map(|n| key(&n.path))
        .collect();
    let images = db.table_images(folder)?.iter().map(|p| key(p)).collect();
    let lang = db
        .members(folder)?
        .into_iter()
        .find(|(_, r)| *r == Role::Owner)
        .map_or_else(|| "en".to_owned(), |(a, _)| a.lang);
    // The players' logs are each their own wherever there is a table: a
    // note a table keeps from its players has a name, a history and a count
    // that no shared log may carry, and a log that is the same for everyone
    // cannot be cut afterwards without moving the numbers a device counted.
    let restricted = true;
    Ok(Some(Arc::new(Veil {
        folder: folder.to_owned(),
        tables,
        facts: Arc::new(facts),
        notes: Arc::new(notes),
        secrets: Arc::new(secrets),
        lang,
        images: Arc::new(images),
        files: OnceLock::new(),
        opens: Arc::default(),
        viewer: Viewer::Public,
        restricted,
        unreadable: false,
        views: Mutex::new(HashMap::new()),
        union: OnceLock::new(),
    })))
}

/// What a folder whose tables cannot be read is to a player: one closed
/// table that holds the whole folder, whose notes are all hidden and whose
/// players' logs are each their own. A failed read is not "no table"
/// (which would open every door): it is the most restrictive answer, and
/// it is never kept, so the next ask reads again.
#[must_use]
pub fn unreadable(folder: &str) -> Arc<Veil> {
    Arc::new(Veil {
        folder: folder.to_owned(),
        facts: Arc::new(AccessFacts {
            tables: vec![TableFact {
                root: String::new(),
                open: false,
            }],
            ..AccessFacts::default()
        }),
        secrets: Arc::new(HashSet::new()),
        notes: Arc::new(Vec::new()),
        tables: vec![Campaign {
            folder: folder.to_owned(),
            root: String::new(),
            open: false,
            log_max: crate::db::LOG_DEFAULT,
            image_max: crate::db::IMAGE_DEFAULT,
        }],
        lang: "en".to_owned(),
        images: Arc::new(HashSet::new()),
        files: OnceLock::new(),
        opens: Arc::default(),
        viewer: Viewer::Public,
        restricted: true,
        unreadable: true,
        views: Mutex::new(HashMap::new()),
        union: OnceLock::new(),
    })
}

/// The folder's tables changed: the veil is made again at the next ask,
/// and what was decided from the state before is decided again.
pub fn forget(server: &Server, folder: &str) {
    forgetting(server, folder, true);
}

/// The folder's files changed: the veil is made again at the next ask (the
/// attachments a note opens are read from them), the tables' state is as it
/// was.
pub fn forget_files(server: &Server, folder: &str) {
    forgetting(server, folder, false);
}

fn forgetting(server: &Server, folder: &str, state: bool) {
    let mut map = lock(&server.campaigns.map);
    {
        let mut g = lock(&server.campaigns.generations);
        let e = g.entry(folder.to_owned()).or_default();
        e.0 += 1;
        e.1 += u64::from(state);
    }
    map.remove(folder);
}

/// The folder's key (as the service names it) behind the folder id.
pub fn folder_of_key(server: &Server, key: &str) -> Option<String> {
    lock(&server.keys).get(key).cloned()
}

/// Whether `account` is an editor of `folder`, read now from the members:
/// what decides if a note is served to it whole (ADR 0113 S8). A share's
/// grant does not count: a device synced through a share is a player of
/// the shared notes alone.
#[must_use]
pub fn is_editor(server: &Server, folder: &str, account: &str) -> bool {
    server
        .db
        .role(folder, account)
        .ok()
        .flatten()
        .is_some_and(|r| r == Role::Editor)
}

/// The veil of the folder behind `key` as `account` sees it, a folder's
/// editor read live ([`Veil::view_for`]).
#[must_use]
pub fn viewer_of(server: &Server, key: &str, account: &str, writes: bool) -> Option<Arc<Veil>> {
    let folder = folder_of_key(server, key)?;
    let veil = veil_of(server, &folder)?;
    Some(veil.view_for(account, is_editor(server, &folder, account), writes))
}

/// The veil for the folder behind a service key, as its **public** sees
/// it (see [`Viewer`]); ask [`veil_for_client`] for a window's own.
pub fn veil_for_key(server: &Server, key: &str) -> Option<Arc<Veil>> {
    veil_of(server, &folder_of_key(server, key)?)
}

/// The veil of the folder behind `key` as the account behind the window
/// `client` sees it; the public one when the window is not known (fails
/// closed).
pub fn veil_for_client(server: &Server, key: &str, client: &str) -> Option<Arc<Veil>> {
    let veil = veil_for_key(server, key)?;
    let seen = lock(&server.clients)
        .get(client)
        .map(|c| (c.account.clone(), crate::access::asker_of(c).cap));
    Some(match seen {
        Some((a, cap)) => {
            let editor = folder_of_key(server, key).is_some_and(|f| is_editor(server, &f, &a));
            veil.view_for(&a, editor, cap == Cap::Write)
        }
        None => veil,
    })
}

/// What a player is, to the commands: the veil, the account, the grants
/// it holds.
pub struct Player {
    /// The folder as this player sees it.
    pub veil: Arc<Veil>,
    pub account: String,
    /// A folder's editor is a player who edits every file they see
    /// (ADR 0113 K.1).
    pub editor: bool,
    /// Who asks, for the rules (role, credential's ceiling).
    pub asker: Asker,
}

impl Player {
    /// Whether the player is served the text of `path` whole, secret blocks
    /// and all: the rules' one statement of it (`SeeSecretBlocks`, ADR 0087
    /// item 5) — whoever edits a file sees them, with a credential that
    /// writes.
    #[must_use]
    pub fn sees_secrets(&self, path: &str) -> bool {
        may(
            self.veil.facts(),
            &self.asker,
            Action::SeeSecretBlocks,
            &Target::new(path, Kind::of_path(path)),
        )
        .allowed()
    }

    /// Whether the player edits the note at `path` (served whole).
    #[must_use]
    pub fn edits(&self, path: &str) -> bool {
        self.sees_secrets(path)
    }
}

/// The player behind `client`, when it is one: a window that is not the
/// game master of a folder with a table (ADR 0113 item 3).
pub fn player(
    server: &Server,
    who: &crate::auth::Who,
    client: &str,
) -> Result<Option<Player>, ContractError> {
    let door = crate::access::Door::of(server, who, client)?;
    let Some(veil) = door.veil.clone() else {
        return Ok(None);
    };
    if !door.veiled() {
        return Ok(None);
    }
    let account = who.account.id.clone();
    Ok(Some(Player {
        veil: veil.view(&account),
        account,
        editor: door.asker.role == Some(Role::Editor),
        asker: door.asker.clone(),
    }))
}

/// Whether what a window reaches of `folder` is closed to it: a table
/// that holds what the window reaches is closed and the window is a player
/// (the folder's owner, the game master, always enters). `root` is what
/// the window reaches: the share's path, `""` for the whole folder.
#[must_use]
pub fn closed_for(server: &Server, folder: &str, root: &str, player: bool) -> bool {
    if !player {
        return false;
    }
    let Some(veil) = veil_of(server, folder) else {
        return false;
    };
    veil.tables.iter().any(|t| !t.open && covers(&t.root, root))
}

/// Whether `account` is the owner of `folder` itself: its game master.
#[must_use]
pub fn is_master(server: &Server, folder: &str, account: &str) -> bool {
    server
        .db
        .role(folder, account)
        .ok()
        .flatten()
        .is_some_and(|r| r == Role::Owner)
}

/// Before a command of a window on a folder: a player of a table that was
/// closed meanwhile is refused (MC.1 = A).
pub fn guard(server: &Server, who: &crate::auth::Who, client: &str) -> Result<(), ContractError> {
    // A window with no folder yet is shut out of nothing.
    let Ok(door) = crate::access::Door::of(server, who, client) else {
        return Ok(());
    };
    let root = door
        .scope
        .as_ref()
        .map_or_else(String::new, |s| s.root.clone());
    if closed_for(
        server,
        &door.folder,
        &root,
        door.seat() != crate::access::Seat::Master,
    ) {
        return Err(closed_error());
    }
    Ok(())
}

/// The error a player trying to open a closed table gets.
#[must_use]
pub fn closed_error() -> ContractError {
    verso_service::refused(CLOSED)
}

/// The table's limit for the image size, in bytes: the limit of the table
/// rooted at `table` (its own, since 2026-10-23), else the default.
#[must_use]
pub fn image_limit(server: &Server, folder: &str, table: &str) -> usize {
    let bytes = veil_of(server, folder)
        .and_then(|v| {
            v.tables
                .iter()
                .find(|t| t.root == table)
                .map(|t| t.image_max)
        })
        .unwrap_or(crate::db::IMAGE_DEFAULT);
    usize::try_from(bytes).unwrap_or(crate::table::IMAGE_BYTES)
}
