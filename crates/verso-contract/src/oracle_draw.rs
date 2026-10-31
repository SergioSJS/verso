// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The oracle drawn in a room (ADR 0102 item 5): what the window asks, what
//! the server answers and what the room hears.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::OracleSparks;

/// What a window asks the server of a room to draw for the oracle (ADR
/// 0102 item 5): the window sends what it draws from, the server draws —
/// its generator, never the window's — and the room hears the result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OracleAsk {
    /// A yes/no question: the odds row it is asked at, six whole numbers
    /// adding to 100 (yes-and, yes, yes-but, no-but, no, no-and); a d100
    /// is read against it.
    Question { odds: Vec<u32> },
    /// Two pairs of words from the lists in use, one word of each list.
    Spark { lists: OracleSparks },
    /// One entry of a table, as many sides as it has entries.
    Table { entries: Vec<String> },
}

/// What the server drew for an [`OracleAsk`], stamped with the account's
/// name; nothing is written, to the file or the database. The question's
/// own text never reaches the server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct OracleDraw {
    /// `question`, `spark` or `table`.
    pub kind: String,
    /// A question: the d100 face, 1 to 100. A table: the entry's place,
    /// counted from 1. A spark: 0.
    pub roll: u32,
    /// A question: the answer's column, 0 (yes-and) to 5 (no-and).
    pub answer: Option<u32>,
    /// A spark: action, theme, descriptor, focus. A table: the entry.
    pub words: Vec<String>,
    /// The name of the account that asked.
    pub by: String,
    /// When, RFC 3339 in UTC.
    pub at: String,
}

/// An oracle draw in a room, heard by the others in it (event
/// `collab-oracle`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CollabOracle {
    pub path: String,
    pub draw: OracleDraw,
}
