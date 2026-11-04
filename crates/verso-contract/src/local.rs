// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "This app is a server" (ADR 0096; ADR 0117, one feature with the internet
//! link): what Settings and the pairing dialog of the desktop app read and
//! say. These are the desktop's own commands —
//! a phone never runs them (the allowlist refuses the `local_server_`
//! prefix whole) — so they cross between the host and its window only.
//! No path crosses: a folder is named by its name and an opaque key; the
//! address and the port are the ones a phone types.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Where "this app is a server" stands.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalServerStatus {
    /// Whether this build of the app can serve: every system (ADR 0096
    /// item 17, revised 2026-10-15); `false` only in a stand-in that cannot.
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
    /// Phones connected at once, at most, 1 to 16 (item 13, amended
    /// 2026-10-16: the ceiling is a setting; the default is 4).
    pub max_connected: u32,
    /// Chosen folders this start left out for not being on the disk, each as
    /// `folder/chosen`: the window says so.
    pub dropped: Vec<String>,
    /// The box *On my network* (ADR 0117 D1, D4 Q2): serve on the private
    /// addresses, as ADR 0096 built. Kept; on by default.
    pub network: bool,
    /// The box *By an internet link* (ADR 0117 D3): where the link stands.
    /// Never kept across starts (item 6).
    pub link: LocalLink,
    /// The link is turned on with the person's own address, not a quick
    /// link (ADR 0117 D10, `local_server_link_mode`).
    pub link_own: bool,
    /// The own address, once set up (D10 (a)); none before.
    pub own_address: Option<LocalOwnAddress>,
    /// `cloudflared tunnel login` was done on this computer: the person's
    /// Cloudflare credential is where `cloudflared` keeps it (D10 item 2).
    pub cloudflare_signed_in: bool,
}

/// Where the internet link stands (ADR 0117 D3 item 6).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum LocalLinkState {
    #[default]
    Off,
    /// Fetching `cloudflared`, or waiting for its first connection.
    Starting,
    On,
    /// `cloudflared` ended by itself: no link until it is turned on again
    /// (a new link, for a quick one); nothing restarts it silently.
    Offline,
}

/// Why the link last ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum LocalLinkEnd {
    /// The person stopped it, or serving stopped.
    Stopped,
    /// A quick link's twelve hours ran out (D4 Q6).
    Ceiling,
    /// `cloudflared` ended by itself.
    Exited,
    /// It never came up; the command said why.
    Failed,
    /// The app ended.
    Quit,
}

/// The internet link, as Settings shows it and the event
/// `local-server-link` says it at each change.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalLink {
    pub state: LocalLinkState,
    /// The link's origin while on (`https://…`), to copy and to show as a
    /// QR. Never logged.
    pub origin: Option<String>,
    /// A quick link's ceiling, in seconds since the epoch; none for an own
    /// address, which has none (D10).
    pub until: Option<u32>,
    /// The link is the person's own address.
    pub own: bool,
    /// Why it last ended.
    pub ended: Option<LocalLinkEnd>,
    /// How `cloudflared` reaches Cloudflare while on: `quic`, or `http2`
    /// when QUIC (UDP) found no way out and it tried again over TCP.
    pub protocol: Option<String>,
    /// The origin as a QR, rows of `1` (dark) and `0`, for a phone at the
    /// table to scan (D3 item 6); empty while off. The window draws it.
    pub qr: Vec<String>,
}

/// The person's own address for the link (ADR 0117 D10 (a)): a hostname of
/// their domain, routed at Cloudflare to a tunnel this computer made.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalOwnAddress {
    /// `mesa.example.com`.
    pub hostname: String,
}

/// How `cloudflared tunnel login` ended (D10 item 2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalOwnLogin {
    /// The person's Cloudflare credential is in place now.
    pub signed_in: bool,
    /// It was there already, from an earlier login (`cloudflared` does not
    /// overwrite it).
    pub already: bool,
    /// When the login did not end: Cloudflare's page to open by hand, if
    /// `cloudflared` gave it. It carries a one-time callback: shown, never
    /// logged.
    pub url: Option<String>,
    /// Why not, in `cloudflared`'s words with every address taken out.
    pub why: Option<String>,
}

/// An invitation just made (ADR 0117 D3 item 2, D4 Q8): its single-use link
/// is said this once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalInvite {
    pub id: String,
    pub link: String,
    /// Seconds since the epoch.
    pub expires: u32,
}

/// One invitation of this computer's server, as the section lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalInvitation {
    pub id: String,
    /// The served folder it carries, by the name a person is shown.
    pub folder: Option<String>,
    /// `reader` or `editor`; none with no folder.
    pub role: Option<String>,
    /// Seconds since the epoch.
    pub created: u32,
    pub expires: u32,
    /// `pending`, `used`, `ended` or `expired`.
    pub state: String,
    /// The name of the account that used it.
    pub used_by: Option<String>,
}

/// A folder the person may tick to serve.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalFolder {
    /// The folder's opaque key (`FolderInfo.key`).
    pub key: String,
    pub name: String,
    /// The NAME of the directory the folder lives in (`obsidian` for
    /// `~/Documents/obsidian/Caderno`), empty when it has none: a label
    /// to tell two folders of the same name apart and to group the list.
    /// A name, not a path (ADR 0026 rule 4): nothing above that one
    /// directory crosses.
    pub place: String,
    pub ticked: bool,
    /// The folders inside it chosen to be served, relative to it and
    /// `/`-joined (ADR 0096 item 2, amended 2026-10-16); none when all of it
    /// is served. Each reaches the phone as a folder of its own.
    pub parts: Vec<String>,
    /// Chosen folders the last start left out for not being on the disk any
    /// more (they are in `parts` until the person changes them).
    pub missing: Vec<String>,
    /// The vault's attachments folder that goes with the chosen folders,
    /// read-only and files only (Obsidian's own setting, read at each
    /// start); none when it names none, or overlaps a chosen folder.
    pub attachments: Option<String>,
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
    /// Every address that could be shown, best first (the default route's,
    /// then real networks, then virtual ones), so the person can pick
    /// another. Empty when the host's own certificate and name are used.
    pub choices: Vec<LocalAddressChoice>,
    /// The address (no port) this QR and link are for.
    pub chosen: String,
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

/// One address the pairing dialog may show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LocalAddressChoice {
    pub address: String,
    /// The interface's name (`en7`, `feth237`).
    pub interface: String,
    /// `lan` (Wi-Fi, Ethernet) or `virtual` (a VPN, ZeroTier, a bridge...).
    pub kind: String,
    /// What a virtual interface probably is (`ZeroTier`, `VPN`): a guess
    /// from its name, shown with a question mark.
    pub hint: Option<String>,
    /// The address the system uses for its default route.
    pub default_route: bool,
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
