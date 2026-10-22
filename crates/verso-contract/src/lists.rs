// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's lists: its tags, its web pages and the `^id` blocks of its
//! notes (`list_block_ids`, ADR 0102 item 3: what the oracle looks for
//! tables in).

use serde::{Deserialize, Serialize};
use specta::Type;

/// A tag and the notes that carry it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Tag {
    pub name: String,
    pub notes: Vec<String>,
}

/// A note that is a web page: its path and the address in its `url`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WebNote {
    pub path: String,
    pub url: String,
}

/// What a block with an `^id` is, read from its first line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum BlockKind {
    Paragraph,
    List,
    Table,
    Heading,
    Quote,
    Code,
}

/// A block with an `^id` in a note of the folder (`list_block_ids`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderBlock {
    /// The note's path, relative to the open folder.
    pub path: String,
    pub id: String,
    pub kind: BlockKind,
    /// The heading above the block, else its first line, short.
    pub label: String,
    /// `label` is the heading above the block (else its first line).
    pub under_heading: bool,
    /// A table's body rows, or a list's top-level items (0 for the rest).
    pub rows: u32,
    /// A list with a task item (`- [ ]`, `- [x]`).
    pub tasks: bool,
}

/// The `^id` blocks of the folder, and whether more were left out of a
/// list that is bounded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderBlocks {
    pub blocks: Vec<FolderBlock>,
    pub truncated: bool,
}
