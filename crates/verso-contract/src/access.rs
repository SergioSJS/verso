// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One access model for a table (ADR 0113 section C): what the server says
//! of who a person is in a folder (`FolderAccess`, in the capabilities), of
//! what they may do with a file (`FileAccess`, in every read answer and on
//! every entry of a listing), and the commands that read and change the
//! access of a path (`access_get`, `access_set`, `table_rights_set`). The
//! window shows, enables and guards from these and never derives a
//! permission from a role, a flag or an error.

use serde::{Deserialize, Serialize};
use specta::Type;

/// How much of a path a person has.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AccessLevel {
    /// Does not see it: to them it does not exist.
    None,
    /// Sees it, reads it.
    See,
    /// Sees it and edits it.
    Edit,
}

/// Where a level comes from, so the window can word it and never
/// recompute it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AccessWhy {
    /// The game master: always.
    Master,
    /// No table: the folder's role decides.
    Role,
    /// The path's own set.
    Own,
    /// A folder's set, the nearest above.
    Folder { path: String },
    /// No set anywhere: the table's default, hidden.
    Default,
    /// An attachment no set covers, shown by a file the person sees.
    Derived,
    /// The table is closed to players.
    Closed,
}

/// What the person asking may do with a file, answered with every read and
/// on each entry of a listing. `attach_image` is whether they may put a new
/// image into it (*Edits* on the file, ADR 0113 K.6), `attach` a new file
/// that is not an image (*Edits* and the right *Files*). For a folder,
/// `create_note` and `create_board` say whether they may create a note (a
/// base, a folder) or a board (a drawing) in it: *Edits* on the folder and
/// the right *Creates notes* or *Creates boards*.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FileAccess {
    pub level: AccessLevel,
    pub attach: bool,
    #[serde(default)]
    pub attach_image: bool,
    #[serde(default)]
    pub create_note: bool,
    #[serde(default)]
    pub create_board: bool,
    pub why: AccessWhy,
}

/// Who a person is at a folder's table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AccessSeat {
    /// The folder's owner.
    Master,
    /// An editor or a reader of the folder.
    Player,
    /// A read link's visitor.
    Visitor,
    /// No place here (a folder with no table counts the role below).
    None,
}

/// What the credential may do at most.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AccessCap {
    Write,
    /// A read-only token, a phone paired as a reader, a read link.
    Read,
}

/// The one source of "who am I here" (ADR 0113 section C), in the
/// capabilities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderAccess {
    pub seat: AccessSeat,
    /// The role at the folder or share: `owner`, `editor`, `reader`; empty
    /// for a visitor or a stranger.
    pub role: String,
    pub cap: AccessCap,
    /// Whether the folder has a table at all.
    pub table: bool,
}

/// One player's level in a set.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccessRow {
    pub account: String,
    pub level: AccessLevel,
}

/// The whole access of a path: the *Whole table* level and the players
/// whose level differs (ADR 0113 item 2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccessSetView {
    pub whole: AccessLevel,
    pub rows: Vec<AccessRow>,
}

/// A file or subfolder with an access set of its own inside a folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccessException {
    pub path: String,
    pub folder: bool,
    pub set: AccessSetView,
}

/// A player of the table, as the access dialog lists them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccessPlayer {
    pub id: String,
    pub name: String,
    /// A folder's editor: a player who edits every file they see.
    pub editor: bool,
    /// The one asking (a player's own row).
    pub you: bool,
}

/// The access of one path (`access_get`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccessInfo {
    pub path: String,
    pub folder: bool,
    /// The table that holds the path (its `root`); empty when none.
    pub table: String,
    /// The path's own set; none while it follows its folder.
    pub own: Option<AccessSetView>,
    /// What applies now: its own, else its folder's, else hidden.
    pub set: AccessSetView,
    pub why: AccessWhy,
    /// For a folder: how many files lie under it (what *Apply* changes).
    pub files: u32,
    /// For a folder: the files and subfolders with a set of their own.
    pub exceptions: Vec<AccessException>,
    /// The note's name is a secret (links to it show as blocks).
    pub secret_name: bool,
    /// How many secret blocks the note holds: whoever edits sees them.
    pub secret_blocks: u32,
    /// The table's players (to a player, only the ones who have access).
    pub players: Vec<AccessPlayer>,
    /// Whether the person asking may change it (the game master).
    pub manage: bool,
    /// The game master's name: the one who always has access.
    pub master: String,
}

/// What `access_set` writes on each path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AccessChange {
    /// The path's whole set; on a folder, it replaces everything inside
    /// (earlier exceptions included) unless `keep_exceptions` is true.
    Set {
        set: AccessSetView,
        /// `Some` to turn the secret name on or off; `None` leaves it.
        secret_name: Option<bool>,
        /// On a folder: the files and folders inside that have a set of
        /// their own keep it, untouched, in the same transaction (the
        /// window's *Manter*). False: everything inside is replaced.
        #[serde(default)]
        keep_exceptions: bool,
    },
    /// *Follow the folder*: the path's own set is deleted.
    Follow,
}

/// What `access_set` answers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccessSetResult {
    /// How many files changed their access.
    pub changed: u32,
}

/// Access changed, told to every window on the folder (event
/// `access-changed`), per player as `campaign-changed` is: the window asks
/// again what it shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AccessChanged {
    /// The paths whose access changed (empty when a table or a right did).
    pub paths: Vec<String>,
}

/// What the synced desktop last heard of one file (ADR 0113 S8): the same
/// answer the server gives a window, kept by the host while the link is
/// down.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SyncRight {
    pub path: String,
    pub access: FileAccess,
}

/// `sync_rights`: the files of the open synced folder the host knows what
/// the person may do with. A path it has no answer for is left out, and
/// the window keeps to its default. `fresh` is false while the server's
/// answer is being asked again (access or the role changed): the window
/// asks once more when the sync has passed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SyncRights {
    pub fresh: bool,
    pub files: Vec<SyncRight>,
}
