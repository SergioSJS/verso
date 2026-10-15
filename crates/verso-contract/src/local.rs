// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "This app is a server" (ADR 0096): what Settings and the pairing dialog
//! of the desktop app read and say. These are the desktop's own commands —
//! a phone never runs them (the allowlist refuses the `local_server_`
//! prefix whole) — so they cross between the host and its window only.
//! No path crosses: a folder is named by its name and an opaque key; the
//! address and the port are the ones a phone types.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Where "this app is a server" stands.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalServerStatus {
    /// Whether this build of the app can serve: macOS and Linux today; the
    /// section says so on Windows and offers nothing (ADR 0096 item 17,
    /// option a).
    pub supported: bool,
    pub serving: bool,
    pub port: Option<u32>,
    /// The private addresses it listens on.
    pub addresses: Vec<String>,
    pub phones_paired: u32,
    pub phones_connected: u32,
    pub pairing_open: bool,
    /// The certificate's SHA-256, in pairs and upper case, for the person
    /// to compare.
    pub fingerprint: Option<String>,
    /// `own` (self-signed: trust on first use) or `files` (the host's).
    pub certificate: String,
    /// Tailscale seems to run here: its own `tailscale serve` gives a
    /// certificate a phone trusts (ADR 0073 item 6).
    pub tailscale: bool,
    /// Why serving last stopped by itself (the network changed), for the
    /// person to read; none once it was turned on or off by hand.
    pub stopped_because: Option<String>,
    /// This computer could not connect to its own address: a firewall is
    /// refusing what comes in, and the section shows the steps to allow it
    /// (item 9). The app never adds the rule itself.
    pub unreachable: bool,
    /// "Keep on at start" (item 1's separate, off-by-default switch).
    pub keep_on: bool,
    /// The host's own certificate and key, when given (item 5 (d)), and the
    /// name it is for.
    pub cert_file: Option<String>,
    pub key_file: Option<String>,
    pub host_name: Option<String>,
}

/// A folder the person may tick to serve.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalFolder {
    /// The folder's opaque key (`FolderInfo.key`).
    pub key: String,
    pub name: String,
    pub ticked: bool,
    /// The server this folder also syncs with: such a folder cannot be
    /// served in V1 (item 11), and the row says to open that address on
    /// the phone instead.
    pub syncs_with: Option<String>,
}

/// A phone paired with this computer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalPhone {
    pub id: String,
    pub name: String,
    /// `reader` or `editor`; never more.
    pub role: String,
    /// Seconds since the epoch (a `u32` lasts until 2106).
    pub paired: u32,
    pub last_seen: u32,
    pub address: String,
}

/// What the pairing dialog shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalPairing {
    /// The text the QR encodes (also copied by hand when the phone cannot
    /// scan).
    pub url: String,
    /// `address:port`, to type.
    pub address: String,
    /// The code to type when the phone cannot scan: eight letters.
    pub code: String,
    /// The QR as rows of `1` (dark) and `0`; the window draws it.
    pub qr: Vec<String>,
    pub expires_in: u32,
    pub fingerprint: String,
    /// `own` or `files`: with `own`, the dialog says the limit in words
    /// (trust on first use, for a network the person trusts).
    pub certificate: String,
}

/// A phone that presented the token and waits for the laptop's answer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalAsked {
    /// The phone's name, as it sent it, made safe.
    pub device: String,
    pub address: String,
    /// When it asked, `YYYY-MM-DDTHH:MM:SSZ`.
    pub asked: String,
}

/// The dialog's state, asked while it is open.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalPairState {
    pub open: bool,
    pub remaining: u32,
    pub asked: Option<LocalAsked>,
}

/// One line of the log of what happened, kept 365 days.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalAudit {
    pub at: u32,
    pub action: String,
    pub subject: Option<String>,
    pub address: Option<String>,
}
