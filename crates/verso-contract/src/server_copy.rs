// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder of a UniVerso picked in the app (the maintainer, 2026-11-15):
//! the whole folder is downloaded into a folder of this device, kept in
//! step with the server's by sync (ADR 0079), and that copy is what opens —
//! offline too. Where the copy goes is asked as it is made; the window
//! names the place by one of these words, never by a path (ADR 0026 rule
//! 4): the host knows where each is.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Where this device can keep a copy of a server's folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum CopyPlace {
    /// Android: the app's own storage, beside its `Verso` folder — no
    /// other app sees it, and it goes when the app is uninstalled.
    InApp,
    /// Android: `Documents` of the phone's shared storage, which Obsidian
    /// and the other apps see (ADR 0118 item 4.4: Android's *All files
    /// access*).
    Phone,
    /// iOS and iPadOS: the app's `Documents`, which the Files app shows
    /// (ADR 0119 A5).
    Documents,
    /// A desktop: a folder the person chooses with the system's dialog; the
    /// copy is made inside it.
    Choose,
}

/// What a copy of a server's folder would take, asked before it is made:
/// the folder's name (the copy's), how many files the server would send
/// this account — a reader's count leaves out what it may not read, as the
/// sync does — and their size, and where this device can keep it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ServerCopyPlan {
    pub name: String,
    pub files: u32,
    /// Bytes, `f64` as everywhere in the contract.
    pub bytes: f64,
    /// This device's places, the first the one offered first.
    pub places: Vec<CopyPlace>,
}
