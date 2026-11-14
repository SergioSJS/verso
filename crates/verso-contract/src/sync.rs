// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder's sync (ADR 0079) and its cloud (ADR 0104), as its window
//! shows them: the status bar's state, the section's lists, and the form
//! that checks a cloud before the folder syncs with it.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A folder's sync with a server, as its window shows it (ADR 0079 item
/// 13): the status bar's state and the folder settings' section.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SyncStatus {
    /// The folder of this computer it is of (`FolderInfo::key`): every
    /// window hears every folder's, and shows its own.
    pub key: String,
    /// Whether the folder syncs at all.
    pub on: bool,
    /// The server, as signed in to (Settings › Servers).
    pub server: String,
    /// The server's folder: its id and its name there.
    pub folder: String,
    pub folder_name: String,
    /// The role there: `owner`, `editor` or `reader` (a reader only
    /// receives, item 1).
    pub role: String,
    /// `off`, `starting`, `synced`, `syncing`, `offline`, `paused` or
    /// `error`.
    pub state: String,
    /// Files on their way in this pass.
    pub sending: u32,
    pub receiving: u32,
    /// When paused for deletions, how many it would delete (item 9).
    pub deletions: Option<u32>,
    /// The conflict copies in the folder (item 8), by path.
    pub conflicts: Vec<String>,
    /// Files not synced, each with its reason (item 13).
    pub refused: Vec<SyncRefused>,
    /// Files that are only in the cloud on this computer (a placeholder of
    /// on-demand storage) and that sync already has a copy of: the server
    /// holds it, nothing is asked of the person, and the window says so
    /// quietly, apart from `refused` (ADR 0043, decided 2026-10-27).
    pub cloud_only: Vec<String>,
    /// What crossed lately, newest first.
    pub log: Vec<SyncLogEntry>,
    /// When the last pass ended, `YYYY-MM-DDTHH:MM:SSZ`.
    pub last: Option<String>,
    /// The last error, said (in English, for the log).
    pub message: Option<String>,
    /// What the last error was, for the window to say in its language:
    /// `not_signed_in`, `signed_out`, `version`, `folder_gone`, `table_closed`, `table_moved`, `failed`;
    /// with the state `off`, `revoked`.
    pub problem: Option<String>,
    /// With the problem `version`: what each side runs — two builds of one
    /// version can differ in their contracts, and the window names both.
    pub versions: Option<SyncVersions>,
    /// When the folder's owner revoked the share this folder synced,
    /// `YYYY-MM-DDTHH:MM:SSZ`: sync was turned off then, the files here
    /// kept (ADR 0081 item 8). Said until sync is turned on again.
    pub revoked: Option<String>,
    /// With a cloud (ADR 0104) instead of a UniVerso: which one and where,
    /// and what a deletion there means. `None` for a UniVerso.
    pub cloud: Option<CloudStatus>,
}

/// A cloud a folder syncs with, as its window shows it (ADR 0104 item
/// 16). The secret is not here and never will be: it is in the system's
/// keychain, and the window sends it once and never reads it back (ADR
/// 0026).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CloudStatus {
    /// `webdav` or `s3`.
    pub provider: String,
    /// Where, in a few words: the server and folder, or the bucket and
    /// prefix.
    pub label: String,
    /// What deleting a file there means (item 9, said when the person
    /// connected): `final`, `kept` (the bucket keeps earlier versions) or
    /// `unknown`.
    pub deletions: String,
    /// What the checks at connecting found that the person should know.
    pub notes: Vec<String>,
}

/// What the person typed into the form to sync a folder with a cloud
/// (ADR 0104 item 6), except the secret — a password, an S3 secret key —
/// which crosses once in the check ([`CloudCheck`]) and is kept by the
/// host in the system's keychain.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CloudSettings {
    /// `webdav` or `s3`.
    pub provider: String,
    /// WebDAV: the folder's address. S3: the endpoint's address, empty
    /// for AWS.
    pub endpoint: String,
    /// S3: the bucket, and a prefix inside it.
    pub bucket: String,
    pub prefix: String,
    /// S3: the region requests are signed for.
    pub region: String,
    /// WebDAV: the user. S3: the access key's id.
    pub user: String,
    /// S3: the bucket in the path (MinIO and most self-hosted services).
    pub path_style: bool,
    /// The person confirmed that a plain-HTTP address on the local
    /// network is theirs.
    pub plain_http: bool,
}

/// The answer to checking a cloud before the folder syncs with it (ADR
/// 0104 items 7 and 16): whether the service can keep the folder's edits
/// safe, and what is there already. Nothing is saved when it is not
/// `accepted`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
pub struct CloudCheck {
    pub accepted: bool,
    /// When not accepted, why, for the window to say in its language:
    /// `plain_http_unconfirmed`, `plain_http_refused`, `invalid`,
    /// `auth`, `unreachable`, `service_refused`, `no_conditional_delete`,
    /// `no_keyring`, `failed`.
    pub problem: Option<String>,
    /// The reason in English, for the log and as the window's fallback.
    pub message: Option<String>,
    /// Where, in a few words.
    pub label: String,
    /// What a deletion there means: `final`, `kept` or `unknown`.
    pub deletions: String,
    /// Things found that are not a refusal.
    pub notes: Vec<String>,
    /// The space left on the service, when it says (bytes).
    pub free: Option<f64>,
    /// What is in the cloud's folder already.
    pub remote_files: f64,
    pub remote_bytes: f64,
}

/// What the server and this app run, when their contracts differ: the
/// version, the commit it was built from, and the contract's hash.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SyncVersions {
    pub server_version: String,
    pub server_build: String,
    pub server_contract: String,
    pub app_version: String,
    pub app_build: String,
    pub app_contract: String,
}

/// A file sync left out, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SyncRefused {
    pub path: String,
    /// `reader`, `quota`, `placeholder`, `too_large`, `name_taken`,
    /// `case_twin_there` (two names on the server that differ only in
    /// case: this computer keeps one, spec Q8), `name_invalid`, `changed`
    /// or `failed`.
    pub reason: String,
    pub message: String,
}

/// What bringing placeholders down would take, asked before it starts (ADR
/// 0043, decided 2026-10-27): the size of the files named, and the room the
/// disk has left. Bytes are `f64`, as everywhere in the contract.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
pub struct PlaceholderPlan {
    /// The files named that are placeholders now, and their logical sizes
    /// added.
    pub count: u32,
    pub bytes: f64,
    /// The bytes the disk under the folder can still take; `None` when the
    /// system would not say (the window then refuses to download: it
    /// cannot tell the files fit).
    pub free: Option<f64>,
}

/// One thing that crossed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SyncLogEntry {
    /// `YYYY-MM-DDTHH:MM:SSZ`.
    pub at: String,
    /// `sent`, `received`, `deleted_there`, `deleted_here`,
    /// `renamed_there`, `renamed_here`, `conflict` or `merged` (two
    /// appends to a note joined, ADR 0079 item 8).
    pub what: String,
    pub path: String,
    /// The other path of a rename, or a conflict's copy.
    pub other: Option<String>,
    /// For what came from the server — received, deleted or renamed here,
    /// a conflict, a merge — who made the change there, as the server's
    /// log says it (sync 2): the person's name, and the name of the
    /// device whose sync made it. Either may be unknown: a change made in
    /// a browser has no device, one found on the server's disk no one, a
    /// share says neither.
    pub by: Option<String>,
    pub device: Option<String>,
}
