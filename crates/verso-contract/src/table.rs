// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table (ADR 0107): one log of everyone's rolls, oracle draws,
//! messages and images for a table of a UniVerso folder (one log per
//! table, 2026-10-23; every command names its table, none means the
//! folder's default), beside the notes' rooms.
//! What the window asks of it, what the server answers and what the
//! windows at the table hear. The server stamps the name, the time and
//! the number; a window sends only what it chose (a text, an image, the
//! notation, its dice's appearance).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{DiceRoll, OracleDraw};

/// One of a person's dice looks (ADR 0101, ADR 0107 item 11): colours as
/// `#rrggbb`, a texture and a material from the fixed lists, nothing
/// else — never a URL or a file. The server checks the closed form and
/// refuses the rest; `app` makes the colours follow the viewer's palette
/// (the "Do Verso" preset).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct DiceStyle {
    pub body: String,
    pub number: String,
    pub outline: String,
    pub texture: String,
    pub material: String,
    #[serde(default)]
    pub app: Option<bool>,
}

/// A person's dice: a style for each of the three colour slots.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct DiceStyles {
    #[serde(rename = "1")]
    pub s1: DiceStyle,
    #[serde(rename = "2")]
    pub s2: DiceStyle,
    #[serde(rename = "3")]
    pub s3: DiceStyle,
}

/// One entry of the table, as a window may see it. `kind` is `roll`
/// (`roll` set, also a random table's: `roll.source`), `oracle` (`draw`
/// set), `say` (`text` set), `image` (`image` set: the file's path in the
/// folder), `file` (a PDF or audio: `image` holds the file's path too; ADR
/// 0113 K.4) or `secret` ("<name> rolled in secret": nothing else set).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableEntry {
    /// The table it belongs to: its folder inside the server's folder,
    /// `""` for the folder itself.
    pub table: String,
    /// The server's number for it: decimal digits, growing; the cursor of
    /// `table_history`.
    pub id: String,
    pub kind: String,
    /// The author's name, stamped by the server.
    pub by: String,
    /// The author's account, opaque: `TableJoin.you` is the window's own.
    pub by_id: String,
    /// When, RFC 3339 in UTC, the server's clock.
    pub at: String,
    /// The note it was made from, relative to the folder.
    pub path: Option<String>,
    pub pinned: bool,
    /// A roll "to the owner": shown in full to its roller and the folder's
    /// owners only.
    pub secret: bool,
    pub roll: Option<DiceRoll>,
    pub draw: Option<OracleDraw>,
    pub text: Option<String>,
    pub image: Option<String>,
}

/// Who is at the table: one per account, however many windows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableMember {
    pub name: String,
    pub by_id: String,
    /// The presence colour, `#rrggbb`.
    pub color: String,
    pub styles: Option<DiceStyles>,
}

/// What `table_join` answers: who the window is, its role, the latest
/// entries with every pinned one (oldest first), whether older ones
/// exist, and who is at the table.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableJoin {
    /// The table joined, as the server names it (`""`: the folder itself).
    pub table: String,
    pub you: String,
    /// `owner`, `editor` or `reader`.
    pub role: String,
    pub entries: Vec<TableEntry>,
    pub more: bool,
    pub roster: Vec<TableMember>,
    /// Whether this account may send an image to the table: an owner always,
    /// a player when the game master gave it *Images* (ADR 0113 K.6).
    #[serde(default)]
    pub images: bool,
    /// Whether this account may send a file that is not an image: an owner
    /// always, a player when given *Files* (K.6).
    #[serde(default)]
    pub files: bool,
}

/// A right to send to the chat changed for this account (event
/// `table-images`): told to its windows at the table at once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableImages {
    pub table: String,
    pub images: bool,
    #[serde(default)]
    pub files: bool,
}

/// A page of older entries (`table_history`), oldest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TablePage {
    pub entries: Vec<TableEntry>,
    pub more: bool,
}

/// Who is at a table (event `table-roster`): one per account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableRoster {
    pub table: String,
    pub members: Vec<TableMember>,
}

/// An entry pinned or unpinned (event `table-pinned`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TablePinned {
    pub table: String,
    pub id: String,
    pub pinned: bool,
}

/// An entry deleted (event `table-removed`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableRemoved {
    pub table: String,
    pub id: String,
}

/// The table cleared (event `table-cleared`); `keep_pinned` says whether
/// the pinned entries stayed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableCleared {
    pub table: String,
    pub keep_pinned: bool,
}
