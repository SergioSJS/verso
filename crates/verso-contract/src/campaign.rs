// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table is a campaign folder (ADR 0110): the folder's owner turns a
//! folder of a server into a table, invites the players, releases notes
//! to them one by one and says who may edit which note. All of it is the
//! server's: a desktop folder of this computer alone has no table. What
//! the window asks and what the server answers.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A folder made a table (ADR 0110 item 1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignTable {
    /// The table's folder, relative to the open folder; `""` is the whole
    /// folder.
    pub root: String,
    /// Open to sign-in; closed, the players cannot open it (MC.1 = A).
    pub open: bool,
    /// The table log's ceiling (1,000 to 200,000 entries; MS.1).
    pub log_max: u32,
    /// The file size limit, in bytes (1 to 30 MB; MS.1): any file *Images* or *Files* carries.
    pub image_max: u32,
    /// To the game master: the players this table lets send an image to its
    /// chat (the right *Images*, ADR 0113 K.6). Empty to a player.
    #[serde(default)]
    pub image_players: Vec<String>,
    /// To the game master: the players given *Files* — a file that is not an
    /// image, to the chat and into the files they edit (K.6).
    #[serde(default)]
    pub file_players: Vec<String>,
    /// To the game master: the players given *Creates notes* (K.6).
    #[serde(default)]
    pub note_players: Vec<String>,
    /// To the game master: the players given *Creates boards* (K.6).
    #[serde(default)]
    pub board_players: Vec<String>,
    /// Whether this account may send an image at the table: always the
    /// game master, a player only when it was given the right.
    #[serde(default)]
    pub images: bool,
    /// Whether this account may send a file that is not an image.
    #[serde(default)]
    pub files: bool,
    /// Moved to the other host (ADR 0117 D8, R9): closed to its players for
    /// good here, who are told it moved; its chat, rolls and rights stay
    /// here until it is undone. Absent from a server before R9: not moved.
    #[serde(default)]
    pub moved: bool,
}

/// Who may edit a note besides the game master (ADR 0110 item 5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CampaignGrant {
    /// Nobody: the players read it.
    None,
    /// Every player at the table.
    Group,
    /// One player, by account.
    Player { account: String },
}

/// Who a note is released to (ADR 0110 item 4, amended 2026-10-23): nobody,
/// the whole table, or a set of the table's players.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CampaignAudience {
    /// Nobody but the game master.
    Hidden,
    /// Every player at the table, and those who join later.
    Table,
    /// These players, by account.
    Players { accounts: Vec<String> },
}

/// What the server keeps about a note of a table (ADR 0110 items 4, 5, 7).
/// A note with no entry is hidden, with no grant and an ordinary name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignNote {
    pub path: String,
    /// Whether any player sees it: the audience is not `hidden`.
    pub released: bool,
    /// Who sees it.
    pub audience: CampaignAudience,
    /// Every link to it is drawn as four blocks, whatever was written.
    pub secret_name: bool,
    pub grant: CampaignGrant,
    /// The players who see it, by account (ADR 0113): every one of them,
    /// whatever the audience can say. To the game master.
    #[serde(default)]
    pub sees: Vec<String>,
    /// The players who edit it, by account.
    #[serde(default)]
    pub edits: Vec<String>,
}

/// A player of a table: an account that may open the table's folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignPlayer {
    pub id: String,
    pub name: String,
    /// The tables (their `root`) this account plays at; to the game master
    /// only, empty when the server did not say (an older one).
    #[serde(default)]
    pub roots: Vec<String>,
}

/// What `campaign_status` answers. To the folder's owner: every table of
/// the folder, the state of its notes and its players. To a player: the
/// tables it can open, and only the notes it may edit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignStatus {
    /// `owner`, `player` or `none` (a folder with no table).
    pub viewer: String,
    pub tables: Vec<CampaignTable>,
    pub notes: Vec<CampaignNote>,
    pub players: Vec<CampaignPlayer>,
    /// Whether this account may make an invitation link for a person who
    /// has no account yet (only the server's admin may: ADR 0081 item 4).
    pub can_invite: bool,
    /// Only in the answer of `campaign_make`: how many people were live on
    /// boards of the new table's folder through a share, who now join them
    /// again as players (ADR 0081 item 11). 0 everywhere else.
    #[serde(default)]
    pub rejoined: u32,
}

/// An invitation to a table (`campaign_invite`): a link to copy, single
/// use, seven days.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignInvite {
    pub link: String,
    /// Unix seconds.
    pub expires: u32,
}

/// Notes released or hidden, told to every window on the folder (event
/// `campaign-changed`): the window reads `campaign_status` again, and a
/// player's file tree reloads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignChanged {
    /// The paths whose state changed (empty when a table changed).
    pub paths: Vec<String>,
}

/// What one person at a table can do with a note (`campaign_access`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignPerson {
    pub id: String,
    pub name: String,
    /// `edits`, `sees` or `none`.
    pub access: String,
    /// Whether this person is the one asking: a player's own row, which the
    /// window words as "you". Always false for the game master's list.
    pub you: bool,
}

/// Who has access to a note of a table (`campaign_access`, ADR 0110
/// item 4 as amended 2026-10-23): the note's audience and, per player, what
/// they can do. To the game master every player is listed, those without
/// access too; to a player only the ones who have it, and never the
/// game master's controls.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignAccess {
    pub path: String,
    /// `owner` or `player`.
    pub viewer: String,
    pub audience: CampaignAudience,
    pub people: Vec<CampaignPerson>,
    /// The game master's name: the one who always has access.
    pub master: String,
}

/// The other host of the window's table (ADR 0117 D8, R9): a folder of this
/// computer served from here that also syncs with a UniVerso has two, and a
/// table lives on one. Where the table may move to, and where it went.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TableHost {
    /// `universo`: the UniVerso the folder syncs with, for a window at this
    /// computer's own table; `here`: this computer's own server, for a
    /// window on that UniVerso's folder.
    pub to: String,
    /// The UniVerso's address as the person reads it (no scheme); empty for
    /// this computer, which the window names in its own words.
    pub name: String,
    /// To open the new host's folder: the UniVerso's address as signed in
    /// to and its folder's id there (`to` = `universo`)…
    pub url: Option<String>,
    pub folder: Option<String>,
    /// …or the key of this computer's folder (`to` = `here`).
    pub key: Option<String>,
}
