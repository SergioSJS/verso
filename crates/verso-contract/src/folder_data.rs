// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's data files (ADR 0099 item 2: layouts; ADR 0098 item 2:
//! bundles) and the oracle's keys in its settings (ADR 0102 item 2).
//!
//! A data file is one JSON object, named by an id, in `.verso/layouts/` or
//! `.verso/bundles/`; the window never names a path, only a kind and an id.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Which directory of the folder's data a file is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum FolderDataKind {
    /// `.verso/layouts/<id>.json`: a card's or statblock's layout.
    Layouts,
    /// `.verso/bundles/<id>.json`: a world's or campaign's template bundle.
    Bundles,
}

/// One data file listed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderDataEntry {
    /// `^[a-z0-9][a-z0-9-]{0,63}$`.
    pub id: String,
    /// What to hand back to change or remove the file; empty when the file
    /// cannot be read now (a placeholder of on-demand storage, or past
    /// 256 KiB): reading it says why.
    pub revision: String,
}

/// A data file read: its text as it is on disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderDataFile {
    pub text: String,
    pub revision: String,
}

/// The revision of the bytes a write left.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderDataWritten {
    pub revision: String,
}

/// The spark word lists of the oracle, or a change to them: all four at
/// once, each of 1 to 200 words of 1 to 60 characters.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct OracleSparks {
    pub action: Vec<String>,
    pub theme: Vec<String>,
    pub descriptor: Vec<String>,
    pub focus: Vec<String>,
}

/// The oracle's odds table and spark words when the folder changed them
/// (ADR 0102 item 2), or a change to them: `None` is "not set here".
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct OracleSettings {
    /// Five rows (nearly certain, likely, even, unlikely, nearly
    /// impossible), each six non-negative integers adding to 100: yes-and,
    /// yes, yes-but, no-but, no, no-and.
    pub odds: Option<Vec<Vec<u8>>>,
    pub sparks: Option<OracleSparks>,
}
