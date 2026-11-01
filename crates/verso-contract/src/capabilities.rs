// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the side a window talks to is, and what it can do (ADR 0027; ADR
//! 0076 item 11): split from `lib.rs` (ADR 0067) when the terminal's
//! ability came (ADR 0115).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::FolderAccess;

/// Which side the window talks to (ADR 0027, ADR 0073 item 2): the app on
/// this computer, or a server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Host {
    Desktop,
    Server,
}

/// What the side the window talks to can do (ADR 0027; ADR 0076 item 11):
/// the window hides what is absent instead of showing it and failing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Can {
    /// Change the open folder (a reader on a server cannot).
    Write,
    /// Show a file in the system's file manager.
    Reveal,
    /// Copy a file's full path.
    CopyPath,
    /// Open windows of the app: a note in one of its own, a new window.
    Windows,
    /// Show web pages inside the window (child web views).
    WebViews,
    /// The command line and the agents of the settings (ADR 0054).
    Agents,
    /// The app's own updates (ADR 0055).
    Updates,
    /// The window's console.
    Devtools,
    /// Open folders from this computer's disk.
    LocalFolders,
    /// An account signed in on a server: the account's page.
    Account,
    /// The account is the server's admin: the admin page.
    Admin,
    /// Several people editing one note at once (ADR 0073 item 7).
    Collab,
    /// The side shows a folder, with its index: the tree, the graph, the
    /// bases, the tags, the files. Absent for one file opened without a
    /// folder (ADR 0114 items 18 and 25), as are the rest below.
    Index,
    /// Full-text search over the folder.
    Search,
    /// Backlinks and unlinked mentions.
    Backlinks,
    /// New notes, files and folders.
    Create,
    /// Renaming and moving entries.
    Rename,
    /// Deleting entries (into the bin).
    Delete,
    /// The folder's bin (ADR 0080).
    Trash,
    /// Version history (ADR 0091).
    History,
    /// Sync with a server or a cloud (ADR 0079, ADR 0104).
    Sync,
    /// The table: rolls and chat (ADR 0107).
    Table,
    /// Boards and drawings (ADR 0057).
    Board,
    /// A shell of this computer in a tab (ADR 0115 item 6): the desktop
    /// host alone lists it, in every window of a folder — of this computer,
    /// or a server's, whose shell starts in the person's home directory —
    /// and never a server, the web window, the phone, or a window of files
    /// opened without their folder (ADR 0114 item 9).
    Terminal,
    /// Share the sound of an application, a page or the system with the
    /// table (ADR 0116 section B, item 27): captured by the desktop host
    /// only. Not in [`Can::FOLDER`]: a server, a phone and a window of loose
    /// files never list it, and where it is absent *Share audio…* is not
    /// drawn.
    AudioShare,
}

impl Can {
    /// What a side that shows a whole folder can do, and a side that shows
    /// one file cannot (ADR 0114 items 18 and 25): every host that opens
    /// folders adds all of these.
    pub const FOLDER: &[Can] = &[
        Can::Index,
        Can::Search,
        Can::Backlinks,
        Can::Create,
        Can::Rename,
        Can::Delete,
        Can::Trash,
        Can::History,
        Can::Sync,
        Can::Table,
        Can::Board,
    ];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Capabilities {
    pub host: Host,
    pub can: Vec<Can>,
    /// The round trip to the side, in milliseconds, when it is across a
    /// network (the desktop app on a server's folder, ADR 0073 item 2): the
    /// window learns how far the core is (ADR 0026 rule 2).
    pub latency_ms: Option<u32>,
    /// Who the person is at the open folder's table (ADR 0113): the one
    /// source of "who am I here". A host with no server says nothing: the
    /// folder is the person's own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access: Option<FolderAccess>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The terminal's ability crosses as one word, and no host that opens
    /// folders gets it by being one (ADR 0115 item 6): it is not of
    /// `Can::FOLDER`, which the server adds to every answer.
    #[test]
    fn the_terminal_is_its_own_word_and_not_a_folders() {
        assert_eq!(
            serde_json::to_string(&Can::Terminal).ok().as_deref(),
            Some("\"terminal\"")
        );
        assert!(!Can::FOLDER.contains(&Can::Terminal));
    }
}
