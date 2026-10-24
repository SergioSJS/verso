// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a door of the server knows to ask [`may`](super::may) (ADR 0113
//! section A): the window's [`Asker`] — its role at the folder or share,
//! the ceiling of its credential, whether it is a phone or a read link —
//! and the table's [`AccessFacts`], made once for the request.
//!
//! Every place that used to decide by itself — the window's command, the
//! room, the device's sync, the table's log, the folder's files — builds a
//! [`Door`] and asks it, instead of reading `role.writes()` and the
//! credential's write bit and the veil's grants.

use std::sync::Arc;

use serde_json::Value;
use verso_contract::ContractError;

use super::{AccessFacts, Action, Asker, Cap, Kind, Seat, Target, Verdict, may};
use crate::auth::Who;
use crate::campaign::{self, Veil};
use crate::db::Role;
use crate::state::Server;

/// What the window gets when a write is refused: unchanged since before
/// ADR 0113, so that the window's notices and the tests keep their words.
const READS: &str = "you may only read this folder";

/// The window behind a request, as the rules need it.
pub struct Door {
    /// The folder's id.
    pub folder: String,
    pub asker: Asker,
    /// The share the window opened, if any.
    pub scope: Option<crate::scope::Scope>,
    /// The folder's tables as the rules see them; none when it has none.
    pub veil: Option<Arc<Veil>>,
    facts: Arc<AccessFacts>,
}

impl Door {
    /// The door of window `client` of `who`. The role is the one the
    /// window holds at its folder or share; the folder's owner is the
    /// game master whatever the credential (ADR 0113 item 6).
    pub fn of(server: &Server, who: &Who, client: &str) -> Result<Self, ContractError> {
        let (folder, role) = crate::rpc::role_here(server, client)?;
        let (scope, owner) = {
            let clients = verso_service::lock(&server.clients);
            let c = clients.get(client);
            (
                c.and_then(|c| c.scope.clone()),
                // Kept in memory with the window: no database is read per
                // command.
                c.is_some_and(|c| c.owner),
            )
        };
        Ok(Self::build(server, who, (folder, role, owner), scope))
    }

    /// The door of `who` at `folder` with `role` there (through `scope`, a
    /// share); `owner` whether it is the folder's own owner. For a request
    /// that has no window, the folder's files over HTTP.
    pub fn build(
        server: &Server,
        who: &Who,
        (folder, role, owner): (String, Role, bool),
        scope: Option<crate::scope::Scope>,
    ) -> Self {
        let visible = scope
            .as_ref()
            .map_or_else(|| folder.clone(), |s| s.share.clone());
        let link = who.account.id.starts_with("link:");
        // The owner of the folder itself, not through a share.
        let owner = owner && scope.is_none() && !link;
        let veil = campaign::veil_of(server, &folder);
        let facts = Arc::new(facts_for(server, &folder, veil.as_deref(), &who.account.id));
        Self {
            asker: Asker {
                account: who.account.id.clone(),
                role: if link {
                    None
                } else if owner {
                    Some(Role::Owner)
                } else {
                    Some(role)
                },
                cap: if who.reaches(&visible).1 {
                    Cap::Write
                } else {
                    Cap::Read
                },
                phone: who.phone.is_some(),
                link,
                admin: who.account.admin,
            },
            folder,
            scope,
            veil,
            facts,
        }
    }

    /// The seat at the folder's table.
    #[must_use]
    pub fn seat(&self) -> Seat {
        self.asker.seat()
    }

    /// Whether the folder has a table.
    #[must_use]
    pub fn has_table(&self) -> bool {
        self.veil.is_some()
    }

    /// Whether the window is a player or a visitor of a folder with a
    /// table: what it is told of the folder goes through the veil
    /// (ADR 0110). The game master is not, whatever the credential.
    #[must_use]
    pub fn veiled(&self) -> bool {
        self.has_table() && self.seat() != Seat::Master
    }

    /// Whether the window is told the notes' **projections**, the secret
    /// blocks left out (ADR 0087): it edits nothing in a folder with no
    /// table, and in a table it edits no file — the game master of a table
    /// sees every secret block whatever the credential (item 6), and an
    /// editor edits, and so sees, every file they see (K.1).
    #[must_use]
    pub fn projects(&self) -> bool {
        if self.seat() == Seat::Master && self.has_table() {
            return false;
        }
        !(self.asker.cap == Cap::Write && self.editor_or_more())
    }

    /// Whether the role is an editor's or more.
    #[must_use]
    pub fn editor_or_more(&self) -> bool {
        !self.asker.link && self.asker.role.is_some_and(Role::writes)
    }

    /// Whether the window may write in the folder at all, as the role and
    /// the credential say: what the old `role.writes() && token_writes`
    /// said, and what a window's `write` capability means.
    #[must_use]
    pub fn writes_here(&self) -> bool {
        self.editor_or_more() && self.asker.cap == Cap::Write
    }

    /// The rules' answer for `path` (a path of the folder, not of a share).
    #[must_use]
    pub fn may(&self, action: Action, path: &str, kind: Kind) -> Verdict {
        may(&self.facts, &self.asker, action, &Target::new(path, kind))
    }

    /// [`Door::may`] for a path, its kind told by its name.
    #[must_use]
    pub fn may_path(&self, action: Action, path: &str) -> Verdict {
        self.may(action, path, Kind::of_path(path))
    }

    /// The path in the folder of a path the window sent.
    fn full(&self, given: &str) -> String {
        match &self.scope {
            Some(s) => s.to_full_write(given).unwrap_or_else(|_| given.to_owned()),
            None => given.to_owned(),
        }
    }

    /// The folder a path is in, as the rules take it: `""` is the folder.
    fn parent(path: &str) -> String {
        let p = campaign::key(path);
        p.rsplit_once('/')
            .map_or_else(String::new, |(d, _)| d.to_owned())
    }

    /// The path a new note named `name` will have.
    fn note_path(name: &str) -> String {
        if name
            .trim_end_matches(['.', ' '])
            .to_lowercase()
            .ends_with(".md")
        {
            name.to_owned()
        } else {
            format!("{name}.md")
        }
    }

    /// Whether the window may run the write `name` with `args`, as the
    /// rules say (ADR 0113 section B): editing a file needs its level,
    /// creating and renaming inside a folder needs the folder's, deleting
    /// and moving are the game master's — and an editor's outside a table
    /// (K.5). A command with no path is the folder's own, an edit of the
    /// folder.
    pub fn check_write(&self, name: &str, args: &Value) -> Result<(), ContractError> {
        let path_of = |field: &str| args[field].as_str().map(|g| self.full(g));
        let verdict: Verdict = match name {
            "write_note" | "write_text" | "write_board" => {
                let Some(path) = path_of("path") else {
                    return Err(crate::rpc::refused(READS));
                };
                // A board a player edits is edited in its room, by element,
                // never written whole: what the player was served is the
                // projection (ADR 0113 H).
                if self.veiled() && Kind::of_path(&path) == Kind::Board {
                    return Err(crate::rpc::refused(READS));
                }
                self.may_path(Action::Edit, &path)
            }
            "create_note" => match args["name"].as_str() {
                Some(n) => self.create_in(&Self::note_path(&self.full(n))),
                None => return Err(crate::rpc::refused(READS)),
            },
            "create_file" | "create_folder" => match path_of("path") {
                Some(p) => self.create_in(&p),
                None => return Err(crate::rpc::refused(READS)),
            },
            "rename_note" | "rename_entry" => match (path_of("from"), path_of("to")) {
                (Some(from), Some(to)) => {
                    let (a, b) = (Self::parent(&from), Self::parent(&to));
                    if a == b {
                        // A rename inside a folder: the player sees the file
                        // and edits the folder (K.5).
                        and(
                            self.may_path(Action::See, &from),
                            self.may(Action::Rename, &a, Kind::Folder),
                        )
                    } else {
                        self.may_path(Action::Move, &from)
                    }
                }
                _ => return Err(crate::rpc::refused(READS)),
            },
            "move_entries" => {
                let Some(paths) = args["paths"].as_array().filter(|p| !p.is_empty()) else {
                    return Err(crate::rpc::refused(READS));
                };
                let mut all = Verdict::Allow;
                for p in paths {
                    all = and(
                        all,
                        match p.as_str() {
                            Some(p) => self.may_path(Action::Move, &self.full(p)),
                            None => Verdict::Deny(super::Reason::NotSeen),
                        },
                    );
                }
                all
            }
            "delete_note" | "delete_entry" => match path_of("path") {
                Some(p) => self.may_path(Action::Delete, &p),
                None => return Err(crate::rpc::refused(READS)),
            },
            // The folder's own: its settings, its focuses, its data.
            _ => self.may(Action::Edit, "", Kind::Folder),
        };
        if verdict.allowed() {
            Ok(())
        } else {
            Err(crate::rpc::refused(READS))
        }
    }

    /// Whether a device may run the sync change `cmd` with `args`, as the
    /// rules say. A put of a note goes the way a write of it does; a
    /// player's device holds the veiled, projected copy of whatever it
    /// does not edit whole, and a put of that would write the projection
    /// over the game master's text: only a file the whole group edits is
    /// served whole (ADR 0110 item 5; ADR 0113 S8 lifts it), and a board
    /// is never put whole by a player (H).
    pub fn check_sync(&self, cmd: &str, args: &Value) -> Result<(), ContractError> {
        match cmd {
            "sync_put" => {
                let Some(path) = args["path"].as_str().map(|p| self.full(p)) else {
                    return Err(crate::rpc::refused(READS));
                };
                let mut verdict = self.may_path(Action::Edit, &path);
                if verdict.allowed() && self.veiled() {
                    // Notes and boards are what a device holds projected.
                    let whole = match Kind::of_path(&path) {
                        Kind::Board => false,
                        Kind::Note => self.veil.as_ref().is_some_and(|v| v.group_edits(&path)),
                        _ => true,
                    };
                    if !whole {
                        verdict = Verdict::Deny(super::Reason::ReadOnly);
                    }
                }
                if verdict.allowed() {
                    Ok(())
                } else {
                    Err(crate::rpc::refused(READS))
                }
            }
            "sync_delete" => self.check_write("delete_entry", args),
            _ => self.check_write("rename_entry", args),
        }
    }

    fn create_in(&self, path: &str) -> Verdict {
        let folder = Self::parent(path);
        self.may(Action::Create, &folder, Kind::Folder)
    }
}

/// Both allowed, else the first refusal.
fn and(a: Verdict, b: Verdict) -> Verdict {
    if a.allowed() { b } else { a }
}

/// The asker a connected window is, from what the server keeps of it in
/// memory (no database is read): the role it holds at its folder or share,
/// the folder's owner being the game master whatever the ceiling of its
/// credential (ADR 0113 item 6).
#[must_use]
pub fn asker_of(c: &crate::state::Client) -> Asker {
    let link = c.account.starts_with("link:");
    Asker {
        account: c.account.clone(),
        role: if link {
            None
        } else if c.owner {
            Some(Role::Owner)
        } else {
            c.folder.as_ref().map(|(_, r)| *r)
        },
        cap: if c.token_write { Cap::Write } else { Cap::Read },
        phone: c.phone,
        link,
        admin: false,
    }
}

/// Whether a window with this asker is veiled in a folder that has a table
/// (`has_table`): a player or a visitor, never the game master.
#[must_use]
pub fn veiled(a: &Asker, has_table: bool) -> bool {
    has_table && a.seat() != Seat::Master
}

/// Whether a window with this asker is told the projections of the notes
/// ([`Door::projects`]).
#[must_use]
pub fn projects(a: &Asker, has_table: bool) -> bool {
    if a.seat() == Seat::Master && has_table {
        return false;
    }
    !(a.cap == Cap::Write && !a.link && a.role.is_some_and(Role::writes))
}

/// Whether what a window is told of the folder is cut for it: by the veil
/// of a table, or by the projections. The game master of a table never is.
#[must_use]
pub fn filtered(a: &Asker, has_table: bool) -> bool {
    veiled(a, has_table) || projects(a, has_table)
}

/// Whether the folder `folder` has a table, as the server knows without
/// reading the database: `None` when it has not been asked yet.
#[must_use]
pub fn has_table_cached(server: &Server, folder: &str) -> Option<bool> {
    campaign::cached(server, folder).map(|v| v.is_some())
}

/// Whether the folder `folder` has a table (reads the database once if the
/// answer is not at hand; an unreadable table counts as one).
#[must_use]
pub fn has_table(server: &Server, folder: &str) -> bool {
    campaign::veil_of(server, folder).is_some()
}

/// The role the table's log speaks of for a window: the game master is an
/// owner there, a player is a reader — an editor of the folder inside a
/// table too (ADR 0113 item 3) — and an editor of a folder with no table is
/// an editor, as the log has always had it.
#[must_use]
pub fn log_role(a: &Asker, has_table: bool) -> Role {
    if a.seat() == Seat::Master {
        Role::Owner
    } else if veiled(a, has_table) {
        Role::Reader
    } else {
        a.role.unwrap_or(Role::Reader)
    }
}

/// Whether the window `c` may do `action` on `path`, from what the server
/// keeps in memory (no database is read when the folder's table is cached).
#[must_use]
pub fn may_client(
    server: &Server,
    c: &crate::state::Client,
    action: Action,
    path: &str,
    kind: Kind,
) -> bool {
    let Some((folder, _)) = c.folder.as_ref() else {
        return false;
    };
    let veil = campaign::veil_of(server, folder);
    let facts = facts_for(server, folder, veil.as_deref(), &c.account);
    may(&facts, &asker_of(c), action, &Target::new(path, kind)).allowed()
}

/// The facts of `folder` for `account`: the veil's snapshot of the tables
/// and the sets (cheap to clone), and the rights of `account` read now — a
/// right given or taken back holds at the next door, not at the next time
/// the veil is made.
fn facts_for(server: &Server, folder: &str, veil: Option<&Veil>, account: &str) -> AccessFacts {
    let Some(veil) = veil else {
        return AccessFacts::default();
    };
    let mut facts = (**veil.facts()).clone();
    facts.files_right.clear();
    // A failed read gives no right: nobody is admitted on a guess.
    for root in server
        .db
        .campaign_files_roots(folder, account)
        .unwrap_or_default()
    {
        facts
            .files_right
            .insert((campaign::key(&root), account.to_owned()));
    }
    facts
}
