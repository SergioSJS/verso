// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One Markdown file opened without a folder (ADR 0114 item 18): what
//! `open_initial` answers when the system handed the app a file, and what
//! the loose-files window shows of it. Never a path: a name, an opaque key
//! and a display label for the parent folder (rule 4).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::FolderInfo;

/// What the app was handed and opened: a folder, as always, or one file
/// (ADR 0114 item 18).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "info", rename_all = "snake_case")]
pub enum Opened {
    Folder(FolderInfo),
    File(LooseFileInfo),
}

/// Why a loose file opens for reading only (ADR 0114 items 12 and 13).
/// A file that mixes line endings, or whose bytes are not UTF-8, is said
/// by the note's own text as in a folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ReadOnlyReason {
    /// The file or its folder cannot be written by this person:
    /// permissions, a locked file, a read-only volume.
    Permissions,
    /// Above the bound a loose file is edited under (8 MiB, as built;
    /// Q9): shown in Source, read only.
    TooLarge,
}

/// One file the loose-files window shows (ADR 0114 item 18).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LooseFileInfo {
    /// The file's name with its extension, as the window names the tab
    /// and asks for the note (`read_note`, `write_note`): a second file of
    /// the same name in the same window is told apart by a numbered name
    /// (`nota (2).md`), never by a path.
    pub name: String,
    /// An opaque, stable name for the file that carries no path — letters,
    /// digits and `-`, as `FolderInfo::key` — what the window keeps its
    /// state under and what the `folder-changed` event names.
    pub key: String,
    /// The parent folder's own name, as a label beside the title: never
    /// its path.
    pub place: String,
    /// Why the file is read only, when it is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only: Option<ReadOnlyReason>,
    /// The file's size in bytes (saturated at 4 GiB; such a file is read
    /// only anyway).
    pub size: u32,
    /// The name of a folder Verso has opened before that this file lies
    /// in, when there is one (ADR 0114 item 7 ii, Q3): the window offers
    /// to open it. Never its path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub known_folder: Option<String>,
}

/// A file opened without a folder lately (ADR 0114 item 15, Q4), for the
/// window's own menu on Windows and Linux: its name, where it sits (the
/// shortened label `RecentFolder::place` uses) and its place in the host's
/// list, which `open_recent_file` takes back. Never a path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RecentFile {
    pub index: u32,
    pub name: String,
    pub place: String,
}
