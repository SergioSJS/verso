// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "Import files…" (A11Y.10): what the host's file picker hands the window.

use serde::{Deserialize, Serialize};
use specta::Type;

/// One file the person chose with the system's file picker ("Import
/// files…", A11Y.10): its name and either its bytes or a token, never the
/// path it came from (ADR 0026 rule 4). On a window of this computer's own
/// folder the file stays where it is and the token stands for it:
/// `create_picked` copies it into the folder on the host's side, so that a
/// large file never crosses as base64. On a window of a server's folder the
/// bytes are in `base64` and the window creates the file through
/// `create_file`, as a file dropped on the tree. Exactly one of the two.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PickedFile {
    pub name: String,
    pub base64: Option<String>,
    pub token: Option<String>,
}

/// Why a chosen file was not read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PickSkip {
    /// A directory or another entry that is not a file.
    NotAFile,
    /// Kept in the cloud, not on this computer (ADR 0043).
    Placeholder,
    /// Larger than one file may be (or the choice as a whole was).
    TooLarge,
    /// The system refused the read.
    Unreadable,
}

/// A chosen file that was left out, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SkippedPick {
    pub name: String,
    pub reason: PickSkip,
}

/// What the system's file picker gave: the files read, and those left out.
/// Both empty when the picker was cancelled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PickedFiles {
    pub files: Vec<PickedFile>,
    pub skipped: Vec<SkippedPick>,
}

/// A folder of this computer opened before, for the folder switcher's
/// "On this computer" (ADR 0081 item 5): its name, the key
/// `reopen_folder` takes and a short label of where it lives — never its
/// path (ADR 0026 rule 4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RecentFolder {
    pub key: String,
    pub name: String,
    /// Where the folder sits, to tell two of one name apart: its parent
    /// shortened to `~/…/Documents/obsidian`, `…/Volumes/Disco` — never
    /// absolute, never with `..`, and empty when there is nothing to say.
    pub place: String,
}

/// Files dropped on a window from the system's file manager (T.11, decided
/// 2026-10-22; event `files-dropped`). The host catches the drop itself —
/// the web view only ever hands bytes — and keeps the paths: the window is
/// told where in it the drop fell (whole CSS pixels from the window's top left)
/// and the files' names, and then asks `take_dropped` for them (rule 4: no
/// path crosses).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FilesDropped {
    pub x: i32,
    pub y: i32,
    pub names: Vec<String>,
}

/// Files being dragged over a window (event `files-over`), for the window to
/// show where a drop would land: `over` is false when the drag left. The
/// position is in CSS pixels from the window's top left; the names are not
/// known until the drop.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FilesOver {
    pub over: bool,
    pub x: i32,
    pub y: i32,
}
