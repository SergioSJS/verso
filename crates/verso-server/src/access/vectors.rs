// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The exhaustive table test of ADR 0113 section J (S1), and the shared
//! vectors it writes.
//!
//! Every combination of role x credential x table state x where the level
//! comes from x level x kind x the four rights x action is asked of
//! [`may`], and the answer is compared with one written by hand
//! ([`expected`]): a second statement of the ADR's rules in the ADR's own
//! words (section B), not a copy of the function. The same product, with
//! the dimensions an action does not depend on left out, is written to
//! `app/ui/test/access-vectors.json` (as `sync-vectors.json` serves
//! ADR 0092): the window's test and the e2e harness read the same file, so
//! the harness stops being a fourth implementation of the rules (C10).
//!
//! A guardrail of the feature (ADR 0029): the file is checked in, and
//! `vectors_are_up_to_date` fails when the rules and the file disagree.
//! `VERSO_WRITE_VECTORS=1 cargo test -p verso-server access::vectors`
//! writes it again.

use std::collections::BTreeMap;

use super::rules::{
    AccessFacts, Action, Asker, Cap, Kind, Level, Made, NodeSet, Right, TableFact, Target, Verdict,
    may,
};
use crate::db::Role;

/// The vectors as they are checked in.
const CHECKED_IN: &str = include_str!("../../../../app/ui/test/access-vectors.json");

/// The account of every player of the matrix, and the visitor's.
const ANA: &str = "ana";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Cred {
    /// A password session or a token that writes.
    Write,
    /// A read-only token.
    ReadToken,
    /// A phone paired as a reader.
    PhoneReader,
    /// A phone paired as an editor.
    PhoneEditor,
}

impl Cred {
    const ALL: [Self; 4] = [
        Self::Write,
        Self::ReadToken,
        Self::PhoneReader,
        Self::PhoneEditor,
    ];

    fn name(self) -> &'static str {
        match self {
            Self::Write => "write",
            Self::ReadToken => "read-token",
            Self::PhoneReader => "phone-reader",
            Self::PhoneEditor => "phone-editor",
        }
    }
}

/// The people the matrix asks as: a role (or none, or a read link) behind
/// a credential, and whether the account is the server's admin.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Person {
    /// `None` is a stranger; with `link`, a read link's visitor.
    role: Option<Role>,
    link: bool,
    cred: Cred,
    admin: bool,
    /// Not Ana, whose rows the sets name, but another player: she falls to
    /// the whole table's row.
    other: bool,
}

impl Person {
    fn who(self) -> Asker {
        Asker {
            account: if self.link {
                "link:1".to_owned()
            } else if self.other {
                "bia".to_owned()
            } else {
                ANA.to_owned()
            },
            role: self.role,
            cap: match self.cred {
                Cred::Write | Cred::PhoneEditor => Cap::Write,
                Cred::ReadToken | Cred::PhoneReader => Cap::Read,
            },
            phone: matches!(self.cred, Cred::PhoneReader | Cred::PhoneEditor),
            link: self.link,
            admin: self.admin,
        }
    }

    fn name(self) -> String {
        let role = if self.link {
            "link"
        } else {
            self.role.map_or("stranger", Role::as_str)
        };
        format!(
            "{role}{}/{}{}",
            if self.other { "-other" } else { "" },
            if self.link {
                "read-link"
            } else {
                self.cred.name()
            },
            if self.admin { "/admin" } else { "" }
        )
    }

    fn all() -> Vec<Self> {
        let mut out = Vec::new();
        for admin in [false, true] {
            for role in [Role::Owner, Role::Editor, Role::Reader] {
                for cred in Cred::ALL {
                    out.push(Self {
                        role: Some(role),
                        link: false,
                        cred,
                        admin,
                        other: false,
                    });
                }
            }
            out.push(Self {
                role: None,
                link: false,
                cred: Cred::Write,
                admin,
                other: false,
            });
            out.push(Self {
                role: None,
                link: true,
                cred: Cred::ReadToken,
                admin,
                other: false,
            });
            out.push(Self {
                role: Some(Role::Reader),
                link: false,
                cred: Cred::Write,
                admin,
                other: true,
            });
        }
        out
    }

    fn master(self) -> bool {
        self.role == Some(Role::Owner) && !self.link
    }

    fn writes(self) -> bool {
        matches!(self.cred, Cred::Write | Cred::PhoneEditor)
    }

    fn phone(self) -> bool {
        matches!(self.cred, Cred::PhoneReader | Cred::PhoneEditor)
    }

    fn has_role(self) -> bool {
        self.link || self.role.is_some()
    }

    fn editor_or_more(self) -> bool {
        !self.link && self.role.is_some_and(|r| r >= Role::Editor)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum TableState {
    /// The path is in no table: the folder's role decides.
    None,
    Open,
    Closed,
}

impl TableState {
    fn name(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Open => "open",
            Self::Closed => "closed",
        }
    }
}

/// Where the level of the path comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Source {
    /// No set on the path nor above it.
    Nothing,
    /// The file's own set.
    FileSet,
    /// Its folder's set, none of its own.
    FolderSet,
    /// Its own set under a folder's set that says something else.
    Exception,
    /// Its own set: the whole table at edit, the player below it.
    PerPlayerBelow,
    /// A file moved in with its own set, under a set higher up that says
    /// something else (K.2).
    MovedIn,
}

impl Source {
    const ALL: [Self; 6] = [
        Self::Nothing,
        Self::FileSet,
        Self::FolderSet,
        Self::Exception,
        Self::PerPlayerBelow,
        Self::MovedIn,
    ];

    fn name(self) -> &'static str {
        match self {
            Self::Nothing => "nothing",
            Self::FileSet => "file",
            Self::FolderSet => "folder",
            Self::Exception => "exception",
            Self::PerPlayerBelow => "below-whole",
            Self::MovedIn => "moved-in",
        }
    }
}

const KINDS: [Kind; 7] = [
    Kind::Note,
    Kind::Board,
    Kind::Base,
    Kind::Attachment,
    Kind::OtherFile,
    Kind::Folder,
    Kind::Table,
];

fn kind_name(k: Kind) -> &'static str {
    match k {
        Kind::Note => "note",
        Kind::Board => "board",
        Kind::Base => "base",
        Kind::Attachment => "attachment",
        Kind::OtherFile => "other-file",
        Kind::Folder => "folder",
        Kind::Table => "table",
    }
}

fn path_of(kind: Kind) -> &'static str {
    match kind {
        Kind::Note => "t/d/f.md",
        Kind::Board => "t/d/f.canvas",
        Kind::Base => "t/d/f.base",
        Kind::Attachment => "t/d/f.png",
        Kind::OtherFile => "t/d/f.txt",
        Kind::Folder => "t/d/g",
        Kind::Table => "t",
    }
}

const ACTIONS: [Action; 30] = [
    Action::See,
    Action::Edit,
    Action::Attach { image: true },
    Action::Attach { image: false },
    Action::Create(Made::Note),
    Action::Create(Made::Board),
    Action::Create(Made::Image),
    Action::Create(Made::File),
    Action::Rename,
    Action::Move,
    Action::Delete,
    Action::Say,
    Action::Roll,
    Action::RollSecret,
    Action::SeeSecretRolls,
    Action::DeleteEntry {
        own: true,
        roll: false,
    },
    Action::DeleteEntry {
        own: true,
        roll: true,
    },
    Action::DeleteEntry {
        own: false,
        roll: false,
    },
    Action::DeleteEntry {
        own: false,
        roll: true,
    },
    Action::Clear,
    Action::SendFile { image: true },
    Action::SendFile { image: false },
    Action::SeeSecretBlocks,
    Action::ManageAccess,
    Action::ManageTable,
    Action::Share,
    Action::Invite,
    Action::InviteNew,
    Action::Play,
    Action::Broadcast,
];

fn action_name(a: Action) -> String {
    match a {
        Action::See => "see",
        Action::Edit => "edit",
        Action::Attach { image: true } => "attach-image",
        Action::Attach { image: false } => "attach",
        Action::Create(Made::Note) => "create-note",
        Action::Create(Made::Board) => "create-board",
        Action::Create(Made::Image) => "create-image",
        Action::Create(Made::File) => "create-file",
        Action::Rename => "rename",
        Action::Move => "move",
        Action::Delete => "delete",
        Action::Say => "say",
        Action::Roll => "roll",
        Action::RollSecret => "roll-secret",
        Action::SeeSecretRolls => "see-secret-rolls",
        Action::DeleteEntry { own, roll } => {
            return format!(
                "delete-entry/{}/{}",
                if own { "own" } else { "others" },
                if roll { "roll" } else { "message" }
            );
        }
        Action::Clear => "clear",
        Action::SendFile { image: true } => "send-image",
        Action::SendFile { image: false } => "send-file",
        Action::SeeSecretBlocks => "see-secret-blocks",
        Action::ManageAccess => "manage-access",
        Action::ManageTable => "manage-table",
        Action::Share => "share",
        Action::Invite => "invite",
        Action::InviteNew => "invite-new",
        Action::Play => "play",
        Action::Broadcast => "broadcast",
    }
    .to_owned()
}

/// Which of the four rights (K.6) Ana was given at the table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
struct Rights {
    images: bool,
    files: bool,
    notes: bool,
    boards: bool,
}

impl Rights {
    /// Every one of the sixteen combinations.
    fn all() -> Vec<Self> {
        (0..16)
            .map(|n| Self {
                images: n & 1 != 0,
                files: n & 2 != 0,
                notes: n & 4 != 0,
                boards: n & 8 != 0,
            })
            .collect()
    }

    fn has(self, right: Right) -> bool {
        match right {
            Right::Images => self.images,
            Right::Files => self.files,
            Right::CreatesNotes => self.notes,
            Right::CreatesBoards => self.boards,
        }
    }
}

/// One cell of the matrix, apart from who asks and what.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Setting {
    table: TableState,
    source: Source,
    level: Level,
    kind: Kind,
    rights: Rights,
    derived: bool,
}

impl Setting {
    /// The facts of the setting, and the path to ask about.
    fn facts(self) -> (AccessFacts, &'static str) {
        let path = path_of(self.kind);
        let mut f = AccessFacts::default();
        if self.table == TableState::None {
            return (f, path);
        }
        f.tables.push(TableFact {
            root: "t".to_owned(),
            open: self.table == TableState::Open,
        });
        let whole = |l| NodeSet {
            whole: l,
            rows: BTreeMap::new(),
        };
        // Something else than `level`, for a set that a file's own set
        // must override.
        let other = if self.level == Level::Edit {
            Level::None
        } else {
            Level::Edit
        };
        // A set on the table itself, for the table's own cells.
        let at = |kind| {
            if kind == Kind::Table {
                "t"
            } else {
                path_of(kind)
            }
        };
        match self.source {
            Source::Nothing => {}
            Source::FileSet => {
                std::sync::Arc::make_mut(&mut f.sets)
                    .insert(at(self.kind).to_owned(), whole(self.level));
            }
            Source::FolderSet => {
                let folder = if self.kind == Kind::Table { "t" } else { "t/d" };
                std::sync::Arc::make_mut(&mut f.sets).insert(folder.to_owned(), whole(self.level));
            }
            Source::Exception => {
                let folder = if self.kind == Kind::Table { "t" } else { "t/d" };
                std::sync::Arc::make_mut(&mut f.sets).insert(folder.to_owned(), whole(other));
                std::sync::Arc::make_mut(&mut f.sets)
                    .insert(at(self.kind).to_owned(), whole(self.level));
            }
            Source::PerPlayerBelow => {
                let mut rows = BTreeMap::new();
                rows.insert(ANA.to_owned(), self.level);
                std::sync::Arc::make_mut(&mut f.sets).insert(
                    at(self.kind).to_owned(),
                    NodeSet {
                        whole: Level::Edit,
                        rows,
                    },
                );
            }
            Source::MovedIn => {
                std::sync::Arc::make_mut(&mut f.sets).insert("t".to_owned(), whole(other));
                std::sync::Arc::make_mut(&mut f.sets)
                    .insert(at(self.kind).to_owned(), whole(self.level));
            }
        }
        for right in Right::ALL {
            if self.rights.has(right) {
                f.rights.insert(("t".to_owned(), ANA.to_owned(), right));
            }
        }
        (f, path)
    }

    /// The settings of the matrix, the redundant ones left out: outside a
    /// table nothing about sets or rights exists.
    fn all() -> Vec<Self> {
        let mut out = Vec::new();
        for kind in KINDS {
            for derived in [false, true] {
                // Outside a table: one setting per kind.
                out.push(Self {
                    table: TableState::None,
                    source: Source::Nothing,
                    level: Level::None,
                    kind,
                    rights: Rights::default(),
                    derived,
                });
                for table in [TableState::Open, TableState::Closed] {
                    for source in Source::ALL {
                        for level in [Level::None, Level::See, Level::Edit] {
                            // With no set the level is none by definition.
                            if source == Source::Nothing && level != Level::None {
                                continue;
                            }
                            for rights in Rights::all() {
                                out.push(Self {
                                    table,
                                    source,
                                    level,
                                    kind,
                                    rights,
                                    derived,
                                });
                            }
                        }
                    }
                }
            }
        }
        out
    }
}

/// The level the setting gives the asker **by construction** — the sets of
/// [`Setting::facts`] are built so that it is known without the function.
fn set_level(s: Setting, visitor: bool) -> Level {
    let shown_by_files =
        matches!(s.kind, Kind::Attachment | Kind::OtherFile | Kind::Folder) && s.derived;
    match s.source {
        Source::Nothing if shown_by_files => Level::See,
        Source::Nothing => Level::None,
        // The whole table's row was Edit, the player's own row below it:
        // a visitor has the whole table's.
        Source::PerPlayerBelow if visitor => Level::Edit,
        _ => s.level,
    }
}

/// What the person may do on the target, by the ADR: section A's level.
fn level_of(p: Person, s: Setting) -> Level {
    if !p.has_role() {
        return Level::None;
    }
    if s.table == TableState::None {
        // The folder's role.
        return if p.editor_or_more() {
            Level::Edit
        } else {
            Level::See
        };
    }
    if p.master() {
        return Level::Edit;
    }
    if s.table == TableState::Closed {
        return Level::None;
    }
    let level = set_level(s, p.link || p.other);
    if p.link {
        // A visitor never edits.
        return level.min(Level::See);
    }
    // A folder editor edits every file they see (K.1).
    if p.role == Some(Role::Editor) && level >= Level::See {
        Level::Edit
    } else {
        level
    }
}

/// The answer the ADR gives (section B), written by hand, row by row.
#[allow(clippy::too_many_lines)]
fn expected(p: Person, s: Setting, action: Action) -> bool {
    let in_table = s.table != TableState::None;
    let closed_to_player = s.table == TableState::Closed && !p.master();
    let level = level_of(p, s);
    let w = p.writes();
    // The rights hold at the table, for a player. They are Ana's: another
    // player has none.
    let right = |r: Right| s.rights.has(r) && !p.other;
    let sends = |r: Right| p.master() || (!in_table && p.editor_or_more()) || right(r);
    // What a player makes or attaches at a table needs a right; the game
    // master and a folder's editor outside a table need none.
    let granted = |r: Right| !in_table || p.master() || right(r);
    match action {
        // See a file or folder: the table open and the level at least see.
        Action::See => {
            if s.kind == Kind::Table && in_table && !p.master() {
                p.has_role() && s.table == TableState::Open
            } else {
                level >= Level::See
            }
        }
        Action::Edit => w && level == Level::Edit,
        // A new image into a file the person edits: nothing more; another
        // file, for a player, the right *Files* (K.6).
        Action::Attach { image: true } => w && level == Level::Edit,
        Action::Attach { image: false } => w && level == Level::Edit && granted(Right::Files),
        // Create inside a folder one edits: the right for what is made.
        // Rename: *Edits* on the file (K.6).
        Action::Create(made) => {
            let r = match made {
                Made::Note => Right::CreatesNotes,
                Made::Board => Right::CreatesBoards,
                Made::Image => Right::Images,
                Made::File => Right::Files,
            };
            w && level == Level::Edit && granted(r)
        }
        Action::Rename => w && level == Level::Edit,
        // Move: the game master, or the folder's editor outside a table; a
        // player of a table never (K.5).
        Action::Move => w && p.has_role() && (p.master() || (!in_table && p.editor_or_more())),
        // Delete: the folder's owner alone, in a table or outside one
        // (section B, amended 2026-10-31: "apenas o dono da pasta pode
        // apagar").
        Action::Delete => w && p.has_role() && p.master(),
        Action::Say | Action::Roll | Action::RollSecret => {
            p.has_role() && !p.link && !closed_to_player
        }
        Action::SeeSecretRolls => p.master(),
        Action::Clear => p.master() && w,
        // A message of one's own anyone deletes, a roll or another's the
        // game master, with a credential that writes.
        Action::DeleteEntry { own, roll } => {
            p.has_role() && !p.link && ((!closed_to_player && own && !roll) || (p.master() && w))
        }
        Action::SendFile { image } => {
            let r = if image { Right::Images } else { Right::Files };
            p.has_role() && !p.link && !closed_to_player && w && sends(r)
        }
        // Whoever edits sees the secret blocks; the game master of a table
        // sees them whatever the credential.
        Action::SeeSecretBlocks => {
            if p.master() && in_table {
                true
            } else {
                !p.link && w && level == Level::Edit
            }
        }
        Action::ManageAccess | Action::ManageTable | Action::Share | Action::Invite => {
            p.master() && w && !p.phone()
        }
        Action::InviteNew => p.master() && w && !p.phone() && p.admin,
        // The table's music: the game master, whatever the credential
        // (ADR 0116 item 22).
        Action::Play | Action::Broadcast => p.master(),
    }
}

fn answer(p: Person, s: Setting, built: &(AccessFacts, &'static str), a: Action) -> bool {
    let (facts, path) = built;
    let t = Target::new(path, s.kind).derived(s.derived);
    may(facts, &p.who(), a, &t) == Verdict::Allow
}

#[test]
fn every_cell_of_the_matrix_is_as_the_adr_says() {
    let people = Person::all();
    let settings = Setting::all();
    let mut wrong: Vec<String> = Vec::new();
    let mut cells = 0_usize;
    for s in &settings {
        let built = s.facts();
        for a in ACTIONS {
            // The table's own actions are asked of the table; a file's of a
            // file; the ones that name no path (a level) of either.
            let table_action = matches!(
                a,
                Action::Say
                    | Action::Roll
                    | Action::RollSecret
                    | Action::SeeSecretRolls
                    | Action::DeleteEntry { .. }
                    | Action::Clear
                    | Action::SendFile { .. }
                    | Action::ManageAccess
                    | Action::ManageTable
                    | Action::Share
                    | Action::Invite
                    | Action::InviteNew
                    | Action::Play
                    | Action::Broadcast
            );
            if table_action != (s.kind == Kind::Table) && a != Action::See {
                continue;
            }
            for p in &people {
                cells += 1;
                let (got, want) = (answer(*p, *s, &built, a), expected(*p, *s, a));
                if got != want && wrong.len() < 20 {
                    wrong.push(format!(
                        "{} / {:?} / {} -> got {got}, the ADR says {want}",
                        p.name(),
                        s,
                        action_name(a)
                    ));
                }
            }
        }
    }
    assert!(cells > 100_000, "the matrix shrank: {cells} cells");
    assert!(
        wrong.is_empty(),
        "{} of the first cells disagree:\n{}",
        wrong.len(),
        wrong.join("\n")
    );
}

/// The dimensions an answer depends on, with their values: the kind, the
/// four rights, whether a file the person sees shows it.
type Needed = (Option<Kind>, [Option<bool>; 4], Option<bool>);

/// The dimensions of a cell an answer may depend on, besides who asks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Dims {
    kind: bool,
    rights: [bool; 4],
    derived: bool,
}

fn right_bits(r: Rights) -> [bool; 4] {
    [r.images, r.files, r.notes, r.boards]
}

/// The vectors: per action, table state, source and level, the answers of
/// every person as a string of `y` and `n`, with the dimensions the answer
/// does not depend on left out.
fn vectors() -> String {
    let people = Person::all();
    let settings = Setting::all();
    let mut out = String::from("{\n");
    out.push_str(concat!(
        "  \"doc\": \"ADR 0113 section A and B. Generated by crates/verso-server/src/access/vectors.rs; ",
        "regenerate with VERSO_WRITE_VECTORS=1 cargo test -p verso-server access::vectors. ",
        "A case is a table state (none: the path is in no table; open; closed), where the level comes from ",
        "(source) and its level, then a kind, which of the four rights of ADR 0113 K.6 the person has (images, files, creates_notes, creates_boards), ",
        "whether a file the person sees shows the attachment or folder (derived), and an action; ",
        "allow holds one letter per entry of who, in order: y allowed, n refused. A key a case does not name is one ",
        "the answer does not depend on. Sources: nothing = no set on the path nor above it; file = the file's ",
        "own set (whole table = level); folder = the folder's set only; exception = the file's own set under a ",
        "folder's set that says something else; below-whole = the file's set with the whole table at edit and the ",
        "player's own row at level; moved-in = the file's own set under a set on the table that says something ",
        "else (K.2). The player is ana; a reader-other is another player, who falls to the whole table's row; the visitor of a read link has only the whole table's row.\",\n"
    ));
    out.push_str("  \"who\": [\n");
    let names: Vec<String> = people
        .iter()
        .map(|p| {
            format!(
                "    {{\"name\": \"{}\", \"role\": {}, \"link\": {}, \"cap\": \"{}\", \"phone\": {}, \"admin\": {}, \"other\": {}}}",
                p.name(),
                p.role
                    .map_or_else(|| "null".to_owned(), |r| format!("\"{}\"", r.as_str())),
                p.link,
                if p.writes() { "write" } else { "read" },
                p.phone(),
                p.admin,
                p.other
            )
        })
        .collect();
    out.push_str(&names.join(",\n"));
    out.push_str("\n  ],\n  \"cases\": [\n");
    // Group: (action, table, source, level) -> kind/right/derived -> answers.
    type Key = (usize, TableState, Source, Level);
    let mut groups: BTreeMap<Key, Vec<(Setting, String)>> = BTreeMap::new();
    for s in &settings {
        let built = s.facts();
        for (i, a) in ACTIONS.iter().enumerate() {
            let table_action = matches!(
                a,
                Action::Say
                    | Action::Roll
                    | Action::RollSecret
                    | Action::SeeSecretRolls
                    | Action::DeleteEntry { .. }
                    | Action::Clear
                    | Action::SendFile { .. }
                    | Action::ManageAccess
                    | Action::ManageTable
                    | Action::Share
                    | Action::Invite
                    | Action::InviteNew
                    | Action::Play
                    | Action::Broadcast
            );
            if table_action != (s.kind == Kind::Table) && *a != Action::See {
                continue;
            }
            let row: String = people
                .iter()
                .map(|p| if answer(*p, *s, &built, *a) { 'y' } else { 'n' })
                .collect();
            groups
                .entry((i, s.table, s.source, s.level))
                .or_default()
                .push((*s, row));
        }
    }
    let mut cases: Vec<String> = Vec::new();
    for ((i, table, source, level), cells) in &groups {
        // Which of kind, the rights, derived change the answers: a dimension
        // is needed when, holding the others, two values give two rows.
        let mut needed = Dims {
            kind: false,
            rights: [false; 4],
            derived: false,
        };
        for (a, ra) in cells {
            for (b, rb) in cells {
                if ra == rb {
                    continue;
                }
                let (ba, bb) = (right_bits(a.rights), right_bits(b.rights));
                let changed: Vec<usize> = (0..4).filter(|i| ba[*i] != bb[*i]).collect();
                let (kind, derived) = (a.kind != b.kind, a.derived != b.derived);
                // Differ in exactly one dimension: that one matters.
                match (kind, changed.as_slice(), derived) {
                    (true, [], false) => needed.kind = true,
                    (false, [i], false) => needed.rights[*i] = true,
                    (false, [], true) => needed.derived = true,
                    _ => {}
                }
            }
        }
        let mut seen: BTreeMap<Needed, &str> = BTreeMap::new();
        let mut order: Vec<Needed> = Vec::new();
        for (s, row) in cells {
            let bits = right_bits(s.rights);
            let k = (
                needed.kind.then_some(s.kind),
                std::array::from_fn(|i| needed.rights[i].then_some(bits[i])),
                needed.derived.then_some(s.derived),
            );
            match seen.get(&k) {
                Some(r) => assert_eq!(r, row, "a dimension left out matters: {s:?}"),
                None => {
                    seen.insert(k, row);
                    order.push(k);
                }
            }
        }
        for k in order {
            let mut c = format!(
                "    {{\"action\": \"{}\", \"table\": \"{}\"",
                action_name(ACTIONS[*i]),
                table.name()
            );
            if *table != TableState::None {
                c.push_str(&format!(
                    ", \"source\": \"{}\", \"level\": \"{}\"",
                    source.name(),
                    level.as_str()
                ));
            }
            if let Some(kind) = k.0 {
                c.push_str(&format!(", \"kind\": \"{}\"", kind_name(kind)));
            }
            for (key, value) in ["images", "files", "creates_notes", "creates_boards"]
                .iter()
                .zip(k.1)
            {
                if let Some(r) = value {
                    c.push_str(&format!(", \"{key}\": {r}"));
                }
            }
            if let Some(d) = k.2 {
                c.push_str(&format!(", \"derived\": {d}"));
            }
            c.push_str(&format!(", \"allow\": \"{}\"}}", seen[&k]));
            cases.push(c);
        }
    }
    out.push_str(&cases.join(",\n"));
    out.push_str("\n  ]\n}\n");
    out
}

#[test]
fn vectors_are_up_to_date() {
    let made = vectors();
    if std::env::var_os("VERSO_WRITE_VECTORS").is_some() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../app/ui/test/access-vectors.json");
        crate::data::write_for_tests(&path, &made);
        return;
    }
    assert!(
        made == CHECKED_IN,
        "app/ui/test/access-vectors.json is out of date with the rules: \
         VERSO_WRITE_VECTORS=1 cargo test -p verso-server access::vectors"
    );
}

/// The window's `access.ts` has to read the file; it must stay small enough
/// to be checked in and read by a test.
#[test]
fn vectors_stay_small() {
    assert!(
        CHECKED_IN.len() < 900_000,
        "the vectors grew to {} bytes: leave out dimensions an answer does not depend on",
        CHECKED_IN.len()
    );
}
