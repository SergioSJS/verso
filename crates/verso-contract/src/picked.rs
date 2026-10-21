// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "Import files…" (A11Y.10): what the host's file picker hands the window.

use serde::{Deserialize, Serialize};
use specta::Type;

/// One file the person chose with the system's file picker ("Import
/// files…", A11Y.10): its name and its bytes, never the path it came from
/// (ADR 0026 rule 4). The window creates it in the folder through
/// `create_file`, as a file dropped on the tree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PickedFile {
    pub name: String,
    pub base64: String,
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
