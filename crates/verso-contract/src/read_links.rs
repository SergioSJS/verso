// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Read links of a UniVerso folder (ADR 0105): what the owner's window
//! lists, makes and revokes. The link's token crosses once, in the answer
//! that makes it; the server keeps its hash alone.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A live read link, as the owner's panel lists it (ADR 0105 item 5).
/// Times are seconds since the Unix epoch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ReadLinkInfo {
    pub id: String,
    /// `folder` or `note`.
    pub kind: String,
    /// The folder's or the note's path in the open folder; `""` is the
    /// whole folder.
    pub path: String,
    /// Who made it (item 3).
    pub made_by: String,
    pub made_at: f64,
    pub expires: Option<f64>,
    pub has_password: bool,
    pub last_opened: Option<f64>,
    /// How many pages hold it open now.
    pub open: u32,
}

/// The read links of the open folder, and whether the server has them on
/// (the administrator's switch, item 3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ReadLinks {
    pub enabled: bool,
    pub links: Vec<ReadLinkInfo>,
}

/// A link just made: its address is in `url`, once and nowhere else.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ReadLinkMade {
    /// The whole address, `<server>/r/<token>`, to give to whoever reads.
    pub url: String,
    pub link: ReadLinkInfo,
}
