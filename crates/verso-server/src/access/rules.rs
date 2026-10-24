// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One answer to "may this person do this here?" (ADR 0113 section A):
//! `may(facts, who, action, target)`, a pure function. It reads a snapshot
//! of the table, [`AccessFacts`], and does no IO; the server builds the
//! snapshot once per request (the veil of a folder is one) and every door
//! asks the same function.
//!
//! Three things are kept apart, under a credential ceiling:
//!
//! - the **seat**, who the person is at the table: derived from the role
//!   alone, never from the credential (item 6) — the owner is the game
//!   master, an editor or a reader is a player, a read link a visitor;
//! - the **access of each path**, per player: *does not see*, *sees*,
//!   *edits* ([`Level`]), set on a file or on a folder, the folder's set
//!   replacing what is inside it, a file's own set being an exception
//!   (items 1 and 2);
//! - the **rights** of a player at a table: today *Send files* (K.4);
//! - the **ceiling**: a read token, a phone paired as a reader and a read
//!   link only remove writing, never change the seat (item 6).

use std::collections::{BTreeMap, HashMap, HashSet};

use crate::db::Role;

/// How much of a path a player has. Ordered: `None < See < Edit`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub enum Level {
    /// Does not see it: to them it does not exist.
    #[default]
    None,
    /// Sees it, reads it.
    See,
    /// Sees it and edits it.
    Edit,
}

impl Level {
    /// The word the database and the vectors keep.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::See => "see",
            Self::Edit => "edit",
        }
    }

    /// The level a word names.
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "none" => Some(Self::None),
            "see" => Some(Self::See),
            "edit" => Some(Self::Edit),
            _ => None,
        }
    }
}

/// The access a path (a file or a folder) has been given: one **whole
/// set** (ADR 0113 section A, item 2). `whole` is the *Whole table* row;
/// `rows` are the players whose row differs from it. Changing a path writes
/// its whole set, so a path never mixes its own rows with its folder's.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct NodeSet {
    pub whole: Level,
    pub rows: BTreeMap<String, Level>,
}

impl NodeSet {
    /// The level of `account` here: its own row, else the whole table's.
    #[must_use]
    pub fn of(&self, account: &str) -> Level {
        self.rows.get(account).copied().unwrap_or(self.whole)
    }

    /// The set without the rows that say what the whole table's row says:
    /// two sets that give every player the same are equal.
    #[must_use]
    pub fn normalized(mut self) -> Self {
        let whole = self.whole;
        self.rows.retain(|_, l| *l != whole);
        self
    }

    /// The most any player has here: what the sync log keeps for the
    /// players together.
    #[must_use]
    pub fn most(&self) -> Level {
        self.rows
            .values()
            .copied()
            .fold(self.whole, std::cmp::Ord::max)
    }

    /// Whether every player has the same level: a row of the set that says
    /// the same as the whole table's changes nothing.
    #[must_use]
    pub fn uniform(&self) -> Option<Level> {
        self.rows
            .values()
            .all(|l| *l == self.whole)
            .then_some(self.whole)
    }
}

/// A table of the folder, as the rules need it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableFact {
    /// The table's folder inside the server folder; `""` is the folder.
    pub root: String,
    pub open: bool,
}

/// The state `may` reads: the tables, the access sets and the rights.
/// A snapshot of the database, made again whenever one of them changes.
#[derive(Debug, Clone, Default)]
pub struct AccessFacts {
    pub tables: Vec<TableFact>,
    /// The sets, by [`crate::campaign::key`] of the path they are on.
    pub sets: std::sync::Arc<HashMap<String, NodeSet>>,
    /// Asker may send files, by the table's root (as a key) and the account
    /// (K.4).
    pub files_right: HashSet<(String, String)>,
}

/// What kind of thing a target is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Kind {
    Note,
    Board,
    Base,
    /// A file that is not a note, a board or a base, embedded or linked
    /// (an image, a PDF, a sound).
    Attachment,
    /// Any other file.
    OtherFile,
    Folder,
    /// The table itself (its root).
    Table,
}

impl Kind {
    /// A note, a board or a base: what a table keeps hidden until given.
    #[must_use]
    pub fn is_note_like(self) -> bool {
        matches!(self, Self::Note | Self::Board | Self::Base)
    }

    /// The kind a path's name says (a folder is told by the caller).
    #[must_use]
    pub fn of_path(path: &str) -> Self {
        let p = path.trim_end_matches(['.', ' ']).to_lowercase();
        if p.ends_with(".md") {
            Self::Note
        } else if p.ends_with(".canvas") {
            Self::Board
        } else if p.ends_with(".base") {
            Self::Base
        } else if [
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".pdf", ".mp3", ".ogg", ".wav",
            ".m4a", ".mp4", ".webm",
        ]
        .iter()
        .any(|e| p.ends_with(e))
        {
            Self::Attachment
        } else {
            Self::OtherFile
        }
    }
}

/// What is asked of a target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Action {
    /// Know it is there and read it.
    See,
    /// Change a note's text, a board's elements, a base's rows, a file's
    /// bytes.
    Edit,
    /// Put a **new** file into a file the person edits (item 5).
    Attach,
    /// Make a file or a folder inside a folder.
    Create,
    /// Rename a file inside its folder.
    Rename,
    /// Move into or out of a folder.
    Move,
    Delete,
    Say,
    Roll,
    RollSecret,
    SeeSecretRolls,
    /// Delete an entry of the table's log: `own` is its author's, `roll`
    /// that it is a roll.
    DeleteEntry {
        own: bool,
        roll: bool,
    },
    /// Clear the table's log.
    Clear,
    /// Send a file to the table's chat (K.4).
    SendFile,
    /// See the secret blocks of a file (0087).
    SeeSecretBlocks,
    /// Change who sees and who edits (the access of a path).
    ManageAccess,
    /// Make a table, open it, close it, set its limits.
    ManageTable,
    Share,
    /// Invite someone who has an account.
    Invite,
    /// Invite someone who has none: the server's admin (0081 item 4).
    InviteNew,
}

/// What a credential may do at most (item 6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Cap {
    Write,
    /// A read-only token, a phone paired as a reader, a read link: only
    /// writing goes.
    Read,
}

/// Asker asks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asker {
    pub account: String,
    /// The role in the folder or the share, the highest covering grant
    /// (0081 item 14); the folder's owner is `Owner` whatever the
    /// credential. `None` for a stranger.
    pub role: Option<Role>,
    pub cap: Cap,
    /// A paired phone: never manages, shares or invites.
    pub phone: bool,
    /// A read link's visitor (0105).
    pub link: bool,
    pub admin: bool,
}

/// The seat at a table, from the role alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Seat {
    /// The folder's owner.
    Master,
    /// An editor or a reader. An editor edits every file they see (K.1).
    Player,
    /// A read link: a player with no name, only the *Whole table* rows.
    Visitor,
    /// No place here.
    Stranger,
}

impl Asker {
    /// The seat (item 3 and 6: the role decides, never the credential).
    #[must_use]
    pub fn seat(&self) -> Seat {
        if self.link {
            return Seat::Visitor;
        }
        match self.role {
            Some(Role::Owner) => Seat::Master,
            Some(_) => Seat::Player,
            None => Seat::Stranger,
        }
    }

    fn writes(&self) -> bool {
        self.cap == Cap::Write
    }

    fn edits_all(&self) -> bool {
        !self.link && self.role == Some(Role::Editor)
    }

    fn at_least_editor(&self) -> bool {
        !self.link && self.role.is_some_and(|r| r >= Role::Editor)
    }
}

/// What is asked about.
#[derive(Debug, Clone, Copy)]
pub struct Target<'a> {
    pub path: &'a str,
    pub kind: Kind,
    /// An attachment with no access set: a file the person sees links or
    /// embeds it, or the table shows it (K.3, ADR 0110 "chosen in the
    /// code" (5)). For a folder: it holds a file the person sees.
    pub derived: bool,
}

impl<'a> Target<'a> {
    #[must_use]
    pub fn new(path: &'a str, kind: Kind) -> Self {
        Self {
            path,
            kind,
            derived: false,
        }
    }

    #[must_use]
    pub fn derived(mut self, on: bool) -> Self {
        self.derived = on;
        self
    }
}

/// Why it was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Reason {
    /// No place here.
    NoRole,
    /// The table is closed to players.
    TableClosed,
    /// The person does not see it.
    NotSeen,
    /// The person sees it and may not change it.
    ReadOnly,
    /// The credential only reads.
    Credential,
    /// A right the game master has not given.
    NoRight,
    /// Only the game master (or the owner).
    NotMaster,
    /// A paired phone does not do this.
    Phone,
    /// Only the server's admin.
    NotAdmin,
    /// A visitor does nothing but read.
    Visitor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Allow,
    Deny(Reason),
}

impl Verdict {
    #[must_use]
    pub fn allowed(self) -> bool {
        self == Self::Allow
    }
}

/// Where a level comes from, so that the window can word it and never
/// recompute it (ADR 0113 section C).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Why {
    /// The game master: always.
    Master,
    /// No table: the folder's role decides.
    Role,
    /// The path's own set.
    Own,
    /// A folder's set, the nearest above (its key).
    Folder(String),
    /// No set anywhere: the table's default, hidden.
    Default,
    /// An attachment no set covers, opened by a file the person sees.
    Derived,
    /// The table is closed.
    Closed,
}

fn parts(key: &str) -> Vec<&str> {
    key.split('/').filter(|p| !p.is_empty()).collect()
}

impl AccessFacts {
    /// The table that holds `path`, the deepest.
    #[must_use]
    pub fn table_of(&self, path: &str) -> Option<&TableFact> {
        self.tables
            .iter()
            .filter(|t| crate::campaign::covers(&t.root, path))
            .max_by_key(|t| crate::campaign::key(&t.root).len())
    }

    /// The nearest node with a set: the path itself, else its folder, else
    /// each folder above it, up to the table's root (ADR 0113 section A).
    /// Its key, and the set.
    #[must_use]
    pub fn nearest_set(&self, path: &str, root: &str) -> Option<(&str, &NodeSet)> {
        let key = crate::campaign::key(path);
        let ps = parts(&key);
        for n in (0..=ps.len()).rev() {
            let k = ps[..n].join("/");
            if !crate::campaign::covers(root, &k) {
                break;
            }
            if let Some((found, set)) = self.sets.get_key_value(&k) {
                return Some((found.as_str(), set));
            }
        }
        None
    }

    /// The level of `path` for a **player** who is `account` (`None`: a
    /// visitor, who has only the *Whole table* rows) and why, ignoring the
    /// table's openness and the role's edit-all: the access sets alone.
    #[must_use]
    pub fn set_level(
        &self,
        path: &str,
        root: &str,
        account: Option<&str>,
        kind: Kind,
        derived: bool,
    ) -> (Level, Why) {
        match self.nearest_set(path, root) {
            Some((k, set)) => {
                let level = match account {
                    Some(a) => set.of(a),
                    None => set.whole,
                };
                let own = k == crate::campaign::key(path);
                (
                    level,
                    if own {
                        Why::Own
                    } else {
                        Why::Folder(k.to_owned())
                    },
                )
            }
            // An attachment no set covers follows the files that show it.
            None if matches!(kind, Kind::Attachment | Kind::OtherFile) && derived => {
                (Level::See, Why::Derived)
            }
            // A folder is shown by what it holds.
            None if kind == Kind::Folder && derived => (Level::See, Why::Derived),
            None => (Level::None, Why::Default),
        }
    }

    /// The level `who` has on the target and why: the one place the seat,
    /// the table's state, the sets and the role's edit-all come together.
    #[must_use]
    pub fn level(&self, who: &Asker, t: &Target<'_>) -> (Level, Why) {
        let seat = who.seat();
        if seat == Seat::Stranger {
            return (Level::None, Why::Default);
        }
        let Some(table) = self.table_of(t.path) else {
            // Outside a table the folder's role holds as it always did.
            let level = if who.at_least_editor() {
                Level::Edit
            } else {
                Level::See
            };
            return (level, Why::Role);
        };
        if seat == Seat::Master {
            return (Level::Edit, Why::Master);
        }
        if !table.open {
            return (Level::None, Why::Closed);
        }
        let account = (seat == Seat::Player).then_some(who.account.as_str());
        let (level, why) = self.set_level(t.path, &table.root, account, t.kind, t.derived);
        // A folder editor is a player who edits everything they see (K.1).
        let level = if who.edits_all() && level >= Level::See {
            Level::Edit
        } else if seat == Seat::Visitor {
            level.min(Level::See)
        } else {
            level
        };
        (level, why)
    }

    /// Whether `account` has the right to send files at the table rooted at
    /// `root` (K.4).
    #[must_use]
    pub fn may_send_files(&self, root: &str, account: &str) -> bool {
        self.files_right
            .contains(&(crate::campaign::key(root), account.to_owned()))
    }
}

/// The one answer (ADR 0113 section A).
#[must_use]
pub fn may(f: &AccessFacts, who: &Asker, action: Action, t: &Target<'_>) -> Verdict {
    use Action::{
        Attach, Clear, Create, Delete, DeleteEntry, Edit, Invite, InviteNew, ManageAccess,
        ManageTable, Move, Rename, Roll, RollSecret, Say, See, SeeSecretBlocks, SeeSecretRolls,
        SendFile, Share,
    };
    use Reason::{
        Credential, NoRight, NoRole, NotAdmin, NotMaster, NotSeen, Phone, ReadOnly, TableClosed,
        Visitor,
    };
    use Verdict::{Allow, Deny};

    let seat = who.seat();
    if seat == Seat::Stranger {
        return Deny(NoRole);
    }
    let master = seat == Seat::Master;
    let table = f.table_of(t.path);
    let in_table = table.is_some();
    let (level, why) = f.level(who, t);
    let closed = why == Why::Closed;
    // Seen: the table closed to a player is "not there" to them.
    let unseen = || Deny(if closed { TableClosed } else { NotSeen });
    let needs_write = || {
        if who.writes() {
            Allow
        } else {
            Deny(Credential)
        }
    };
    // Changes a file: the level says edit, the credential writes.
    let edit = |level: Level| {
        if level < Level::See {
            unseen()
        } else if level < Level::Edit {
            Deny(if seat == Seat::Visitor {
                Visitor
            } else {
                ReadOnly
            })
        } else {
            needs_write()
        }
    };
    // The owner of the folder, with a credential that writes, not a phone.
    let owner = || {
        if !master {
            Deny(NotMaster)
        } else if who.phone {
            Deny(Phone)
        } else {
            needs_write()
        }
    };

    match action {
        See => {
            if t.kind == Kind::Table && in_table && seat != Seat::Master {
                // Entering the table: open to its players.
                return if table.is_some_and(|x| x.open) {
                    Allow
                } else {
                    Deny(TableClosed)
                };
            }
            if level >= Level::See { Allow } else { unseen() }
        }
        Edit => edit(level),
        // A new file into a file the person edits: the level, the credential
        // and, at a table, the right to send files; the game master and the
        // folder's editors outside a table need none.
        Attach => match edit(level) {
            Allow if in_table && !master => {
                let root = table.map_or("", |x| x.root.as_str());
                if f.may_send_files(root, &who.account) {
                    Allow
                } else {
                    Deny(NoRight)
                }
            }
            other => other,
        },
        // Edits on a folder: create and rename inside, never delete, never
        // move in or out (K.5).
        Create | Rename => edit(level),
        Move | Delete => {
            if master || (!in_table && who.at_least_editor()) {
                needs_write()
            } else if level < Level::See {
                unseen()
            } else if seat == Seat::Visitor {
                Deny(Visitor)
            } else if !who.at_least_editor() {
                Deny(ReadOnly)
            } else {
                // A player of a table never moves nor deletes (K.5).
                Deny(NotMaster)
            }
        }
        Say | Roll | RollSecret => {
            if seat == Seat::Visitor {
                Deny(Visitor)
            } else if closed_for_player(f, who, t) {
                Deny(TableClosed)
            } else {
                Allow
            }
        }
        SeeSecretRolls => {
            if master {
                Allow
            } else {
                Deny(NotMaster)
            }
        }
        Clear => {
            if master {
                needs_write()
            } else {
                Deny(NotMaster)
            }
        }
        // A message or a file of one's own, anyone deletes; a roll, and
        // another's entry, the game master (with a credential that writes).
        DeleteEntry { own, roll } => {
            if seat == Seat::Visitor {
                Deny(Visitor)
            } else if !master && closed_for_player(f, who, t) {
                Deny(TableClosed)
            } else if own && !roll {
                Allow
            } else if master {
                needs_write()
            } else {
                Deny(NotMaster)
            }
        }
        SendFile => {
            if seat == Seat::Visitor {
                Deny(Visitor)
            } else if closed_for_player(f, who, t) {
                Deny(TableClosed)
            } else if !who.writes() {
                Deny(Credential)
            } else if master || (!in_table && who.at_least_editor()) {
                Allow
            } else {
                let root = table.map_or("", |x| x.root.as_str());
                if f.may_send_files(root, &who.account) {
                    Allow
                } else {
                    Deny(NoRight)
                }
            }
        }
        // Whoever edits a file sees its secret blocks (0087 item 5); the
        // game master of a table sees them all, whatever the credential
        // (item 6). A visitor never does.
        SeeSecretBlocks => {
            if master && in_table {
                Allow
            } else if seat == Seat::Visitor {
                Deny(Visitor)
            } else {
                edit(level)
            }
        }
        ManageAccess | ManageTable | Share | Invite => owner(),
        InviteNew => match owner() {
            Allow if !who.admin => Deny(NotAdmin),
            other => other,
        },
    }
}

/// A closed table keeps its players out of every action at it.
fn closed_for_player(f: &AccessFacts, who: &Asker, t: &Target<'_>) -> bool {
    who.seat() != Seat::Master && f.table_of(t.path).is_some_and(|x| !x.open)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(whole: Level) -> NodeSet {
        NodeSet {
            whole,
            rows: BTreeMap::new(),
        }
    }

    fn player(role: Role) -> Asker {
        Asker {
            account: "ana".to_owned(),
            role: Some(role),
            cap: Cap::Write,
            phone: false,
            link: false,
            admin: false,
        }
    }

    fn facts(root: &str, sets: &[(&str, NodeSet)]) -> AccessFacts {
        AccessFacts {
            tables: vec![TableFact {
                root: root.to_owned(),
                open: true,
            }],
            sets: std::sync::Arc::new(
                sets.iter()
                    .map(|(k, s)| ((*k).to_owned(), s.clone()))
                    .collect(),
            ),
            files_right: HashSet::new(),
        }
    }

    #[test]
    fn the_nearest_set_wins_up_to_the_tables_root() {
        // A table that is the whole folder: the set on "" is the root's.
        let f = facts("", &[("", set(Level::See)), ("places", set(Level::None))]);
        fn t(p: &str) -> Target<'_> {
            Target::new(p, Kind::Note)
        }
        let ana = player(Role::Reader);
        assert_eq!(f.level(&ana, &t("a.md")).0, Level::See);
        assert_eq!(f.level(&ana, &t("places/crypt.md")).0, Level::None);
        assert_eq!(
            f.level(&ana, &t("places/deep/er/crypt.md")).1,
            Why::Folder("places".to_owned())
        );
        // A table rooted lower never looks above its root.
        let f = facts("camp", &[("", set(Level::Edit))]);
        assert_eq!(
            f.level(&ana, &Target::new("camp/a.md", Kind::Note)).0,
            Level::None
        );
    }

    #[test]
    fn a_folders_edit_is_create_and_rename_never_delete_nor_move() {
        let f = facts("t", &[("t/places", set(Level::Edit))]);
        let ana = player(Role::Reader);
        let folder = Target::new("t/places", Kind::Folder);
        assert_eq!(may(&f, &ana, Action::Create, &folder), Verdict::Allow);
        assert_eq!(may(&f, &ana, Action::Rename, &folder), Verdict::Allow);
        assert!(!may(&f, &ana, Action::Delete, &folder).allowed());
        assert!(!may(&f, &ana, Action::Move, &folder).allowed());
        // A folder she only sees is a folder she does not create in.
        let f = facts("t", &[("t/places", set(Level::See))]);
        assert!(!may(&f, &ana, Action::Create, &folder).allowed());
    }

    #[test]
    fn the_masters_read_only_credential_stays_the_master() {
        let f = facts("t", &[]);
        let mut gm = player(Role::Owner);
        gm.cap = Cap::Read;
        let hidden = Target::new("t/secret.md", Kind::Note);
        assert_eq!(may(&f, &gm, Action::See, &hidden), Verdict::Allow);
        assert_eq!(
            may(&f, &gm, Action::SeeSecretBlocks, &hidden),
            Verdict::Allow
        );
        assert_eq!(
            may(&f, &gm, Action::Edit, &hidden),
            Verdict::Deny(Reason::Credential)
        );
        // The same credential on a player removes nothing but writing.
        let mut ana = player(Role::Reader);
        ana.cap = Cap::Read;
        let seen = facts("t", &[("t/secret.md", set(Level::Edit))]);
        assert_eq!(may(&seen, &ana, Action::See, &hidden), Verdict::Allow);
        assert_eq!(
            may(&seen, &ana, Action::Edit, &hidden),
            Verdict::Deny(Reason::Credential)
        );
    }

    #[test]
    fn a_closed_table_shuts_players_out_and_not_the_master() {
        let mut f = facts("t", &[("t/a.md", set(Level::Edit))]);
        f.tables[0].open = false;
        let a = Target::new("t/a.md", Kind::Note);
        assert_eq!(
            may(&f, &player(Role::Editor), Action::See, &a),
            Verdict::Deny(Reason::TableClosed)
        );
        assert_eq!(
            may(&f, &player(Role::Owner), Action::Edit, &a),
            Verdict::Allow
        );
    }
}
