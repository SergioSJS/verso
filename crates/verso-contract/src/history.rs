// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file's version history as the window sees it (ADR 0091): the
//! versions, newest first, with when, who and the size of the change; a
//! version's text; and a version brought back. Times are milliseconds
//! since the epoch, shown in the computer's own time zone by the window.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Who a version names (item 4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AuthorKind {
    /// An account of the server, by its name.
    Account,
    /// A device of an account, by the device's name.
    Device,
    /// An agent's token, by the token's name.
    Agent,
    /// This computer, by its name: a version of a folder of the computer.
    Computer,
    /// A change the watcher found, made outside Verso.
    Outside,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct VersionAuthor {
    pub kind: AuthorKind,
    /// Empty for [`AuthorKind::Outside`].
    pub name: String,
}

/// What made a version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum VersionKind {
    /// A write through Verso: a device's sync, a token, a panel.
    Write,
    /// The editor's saves, ten minutes of them in one version.
    Edit,
    /// Writing together in a note's room, ten minutes in one version.
    Room,
    /// A version brought back: itself a version.
    Restore,
    /// Changed outside Verso.
    Outside,
    /// The file as it was when its history began.
    Found,
}

/// One version of a file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct VersionEntry {
    /// Opaque: what `history_read`, `history_restore` and
    /// `history_delete` take back.
    pub id: String,
    /// When it was written, in milliseconds since the epoch.
    pub at: f64,
    pub authors: Vec<VersionAuthor>,
    pub kind: VersionKind,
    /// The bytes of this version.
    pub size: f64,
    /// Their SHA-256, lowercase hex: a synced folder's computer tells by
    /// it what has crossed to the server (item 8).
    pub hash: String,
    /// Lines added and removed against the version before it.
    pub added: u32,
    pub removed: u32,
    /// The file's path when this version was written (a rename since
    /// shows here).
    pub path: String,
    /// Only on this computer: not yet crossed to the server of a synced
    /// folder (item 8).
    pub here_only: bool,
}

/// A file's history (items 5 to 8).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct HistoryListing {
    pub path: String,
    /// Newest first.
    pub versions: Vec<VersionEntry>,
    /// When the file went to the trash, in milliseconds; none while it is
    /// there (item 9).
    pub gone: Option<f64>,
    /// Whether this person may delete a version: the folder's owner and
    /// the admin on a server; on the computer, always (item 6).
    pub can_delete: bool,
    /// How many days versions are kept; 0: no limit (item 3).
    pub days: u32,
    /// The bytes the folder's history takes — shown, not counted against
    /// the quota (item 7).
    pub size: f64,
    /// The folder's quota on its server, in bytes; none without one.
    pub quota: Option<f64>,
    /// The history alone passed the quota: its oldest versions go early.
    pub early: bool,
    /// Why part of the history could not be shown: a synced folder whose
    /// server is out of reach shows this computer's versions only.
    pub partial: Option<String>,
}

/// A version's text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct VersionText {
    pub id: String,
    /// None when its bytes are not UTF-8: shown by its size only.
    pub text: Option<String>,
    pub size: f64,
}

/// Where a version brought back landed, and its revision now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct VersionRestored {
    pub path: String,
    pub revision: String,
}
