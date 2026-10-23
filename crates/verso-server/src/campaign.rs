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

use crate::db::{Campaign, Grant, NoteState, Role};
use crate::state::Server;

/// What a closed table answers a player who tries to open it (MC.1 = A).
pub const CLOSED: &str = "a mesa está fechada";

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

/// The state of the tables of one folder, as a player is concerned.
pub struct Veil {
    pub folder: String,
    pub tables: Vec<Campaign>,
    notes: HashMap<String, NoteState>,
    /// The table's language: its game master's.
    pub lang: String,
    /// The images the table shows: open to everyone at it.
    images: HashSet<String>,
    /// The attachments a released note opens; made on first need, from
    /// the folder itself (`campaign_serve::opened`).
    files: OnceLock<HashSet<String>>,
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

    fn state(&self, path: &str) -> Option<&NoteState> {
        self.notes.get(&key(path))
    }

    /// Whether a note is released: by its row, or because someone may edit
    /// it (a grant implies the grantee sees it).
    #[must_use]
    pub fn released(&self, path: &str) -> bool {
        self.state(path)
            .is_some_and(|n| n.released || n.grant != Grant::None)
    }

    /// Whether the name of the note at `path` is a secret.
    #[must_use]
    pub fn secret_name(&self, path: &str) -> bool {
        self.state(path).is_some_and(|n| n.secret_name)
    }

    /// Who may edit the note at `path`.
    #[must_use]
    pub fn grant(&self, path: &str) -> Grant {
        self.state(path)
            .map(|n| n.grant.clone())
            .unwrap_or_default()
    }

    /// Whether `account` may edit the note at `path`: the owner's grant to
    /// the group, or to this account.
    #[must_use]
    pub fn may_edit(&self, path: &str, account: &str) -> bool {
        match self.grant(path) {
            Grant::None => false,
            Grant::Group => true,
            Grant::Player(a) => a == account,
        }
    }

    /// Whether the note at `path` is edited by the whole group: served to
    /// everyone as it is, since all who read it may edit it.
    #[must_use]
    pub fn group_edits(&self, path: &str) -> bool {
        self.grant(path) == Grant::Group
    }

    /// The attachments released notes link or embed, built by `make` the
    /// first time they are asked for.
    pub fn files_with(&self, make: impl FnOnce() -> HashSet<String>) -> &HashSet<String> {
        self.files.get_or_init(make)
    }

    /// Whether a player is kept from `path`. `files` is the attachments a
    /// released note opens ([`Veil::files_with`]).
    #[must_use]
    pub fn hides(&self, path: &str, files: &dyn Fn() -> bool) -> bool {
        let Some(table) = self.table_of(path) else {
            return false;
        };
        if !table.open {
            return true;
        }
        if note_like(path) {
            return !self.released(path);
        }
        // An attachment is a file of the table too: served only through a
        // released note, or as an image the table shows. A folder's own
        // path is none (see `folder_shown` in the serving).
        !(files() || self.images.contains(&key(path)))
    }

    /// Whether a note (by its name, not an attachment) is hidden.
    #[must_use]
    pub fn hides_note(&self, path: &str) -> bool {
        self.hides(path, &|| false)
    }

    /// The paths of notes with a row: for the owner's listing.
    pub fn states(&self) -> impl Iterator<Item = &NoteState> {
        self.notes.values()
    }

    /// The table that holds `path`, for the limits.
    #[must_use]
    pub fn table(&self, path: &str) -> Option<&Campaign> {
        self.table_of(path)
    }
}

/// The veils of the folders, by folder id; `None` is a folder with no
/// table.
#[derive(Default)]
pub struct Cache {
    map: Mutex<HashMap<String, Option<Arc<Veil>>>>,
}

/// The veil of `folder`, if it has a table.
pub fn veil_of(server: &Server, folder: &str) -> Option<Arc<Veil>> {
    if let Some(found) = lock(&server.campaigns.map).get(folder) {
        return found.clone();
    }
    let made = make(server, folder).unwrap_or_else(|e| {
        crate::log::error(&format!("reading a table's state: {e}"));
        None
    });
    lock(&server.campaigns.map).insert(folder.to_owned(), made.clone());
    made
}

fn make(server: &Server, folder: &str) -> Result<Option<Arc<Veil>>, String> {
    let tables = server.db.campaigns_of(folder)?;
    if tables.is_empty() {
        return Ok(None);
    }
    let notes = server
        .db
        .campaign_notes(folder)?
        .into_iter()
        .map(|n| (key(&n.path), n))
        .collect();
    let images = server
        .db
        .table_images(folder)?
        .iter()
        .map(|p| key(p))
        .collect();
    let lang = server
        .db
        .members(folder)?
        .into_iter()
        .find(|(_, r)| *r == Role::Owner)
        .map_or_else(|| "en".to_owned(), |(a, _)| a.lang);
    Ok(Some(Arc::new(Veil {
        folder: folder.to_owned(),
        tables,
        notes,
        lang,
        images,
        files: OnceLock::new(),
    })))
}

/// The folder's files or its tables changed: the veil is made again at
/// the next ask.
pub fn forget(server: &Server, folder: &str) {
    lock(&server.campaigns.map).remove(folder);
}

/// The folder's key (as the service names it) behind the folder id.
pub fn folder_of_key(server: &Server, key: &str) -> Option<String> {
    lock(&server.keys).get(key).cloned()
}

/// The veil for the folder behind a service key.
pub fn veil_for_key(server: &Server, key: &str) -> Option<Arc<Veil>> {
    veil_of(server, &folder_of_key(server, key)?)
}

/// What a player is, to the commands: the veil, the account, the grants
/// it holds.
pub struct Player {
    pub veil: Arc<Veil>,
    pub account: String,
}

/// The player behind `client`, when it is one: a window that may only
/// read a folder with a table.
pub fn player(
    server: &Server,
    who: &crate::auth::Who,
    client: &str,
) -> Result<Option<Player>, ContractError> {
    let (folder, _) = crate::rpc::role_here(server, client)?;
    let Some(veil) = veil_of(server, &folder) else {
        return Ok(None);
    };
    if !crate::readers::reads_only(server, who, client)? {
        return Ok(None);
    }
    Ok(Some(Player {
        veil,
        account: who.account.id.clone(),
    }))
}

/// Whether what a window reaches of `folder` is closed to it: a table
/// that holds what the window reaches is closed and the window only reads (a
/// player; the folder's owner and its editors, the game masters, always
/// enter). `root` is what the window reaches: the share's path, `""` for
/// the whole folder.
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

/// Before a command of a window on a folder: a player of a table that was
/// closed meanwhile is refused (MC.1 = A).
pub fn guard(server: &Server, client: &str) -> Result<(), ContractError> {
    let (folder, role, root, token_write) = {
        let table = lock(&server.clients);
        let Some(c) = table.get(client) else {
            return Ok(());
        };
        let Some((folder, role)) = c.folder.clone() else {
            return Ok(());
        };
        (
            folder,
            role,
            c.scope
                .as_ref()
                .map_or_else(String::new, |s| s.root.clone()),
            c.token_write,
        )
    };
    if closed_for(server, &folder, &root, !(role.writes() && token_write)) {
        return Err(closed_error());
    }
    Ok(())
}

/// The error a player trying to open a closed table gets.
#[must_use]
pub fn closed_error() -> ContractError {
    verso_service::refused(CLOSED)
}

/// The table's limit for the image size, in bytes: the folder's
/// shortest-rooted table's, else the default.
#[must_use]
pub fn image_limit(server: &Server, folder: &str) -> usize {
    let bytes = veil_of(server, folder)
        .and_then(|v| v.tables.first().map(|t| t.image_max))
        .unwrap_or(crate::db::IMAGE_DEFAULT);
    usize::try_from(bytes).unwrap_or(crate::table::IMAGE_BYTES)
}

/// Whether the command `name` is a write of a note the account may edit by
/// a grant (ADR 0110 item 5): `write_note` or `write_text` of a note of a
/// table granted to the group or to it. The one write a reader makes.
#[must_use]
pub fn granted_write(
    server: &Server,
    who: &crate::auth::Who,
    folder: &str,
    scope: Option<&crate::scope::Scope>,
    name: &str,
    args: &serde_json::Value,
) -> bool {
    if !matches!(name, "write_note" | "write_text") {
        return false;
    }
    let Some(given) = args["path"].as_str() else {
        return false;
    };
    let full = match scope {
        Some(s) => match s.to_full_write(given) {
            Ok(f) => f,
            Err(_) => return false,
        },
        None => given.to_owned(),
    };
    crate::readers::is_note(&full)
        && veil_of(server, folder)
            .is_some_and(|v| v.in_table(&full) && v.may_edit(&full, &who.account.id))
}

/// Whether a device of a player puts a note granted to the whole group
/// (`sync_put`): a note granted to one player is edited in the window,
/// since the device holds the projection every other reader holds
/// (ADR 0110 item 5).
#[must_use]
pub fn group_put(
    server: &Server,
    who: &crate::auth::Who,
    folder: &str,
    scope: Option<&crate::scope::Scope>,
    cmd: &str,
    args: &serde_json::Value,
) -> bool {
    let _ = who;
    if cmd != "sync_put" {
        return false;
    }
    let Some(given) = args["path"].as_str() else {
        return false;
    };
    let full = match scope {
        Some(s) => match s.to_full_write(given) {
            Ok(f) => f,
            Err(_) => return false,
        },
        None => given.to_owned(),
    };
    crate::readers::is_note(&full)
        && veil_of(server, folder).is_some_and(|v| v.in_table(&full) && v.group_edits(&full))
}
