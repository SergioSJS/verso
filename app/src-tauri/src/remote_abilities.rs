// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a window on a server's folder can do besides what the server says
//! (split from `remote.rs`, ADR 0067).

use serde_json::{Value, json};
use verso_contract::Can;

/// What this app can do whatever folder a window shows, as the contract
/// names it: its own windows, child web views, updates, console and the
/// opening of folders of this computer (ADR 0027, ADR 0076 item 11) — of
/// an Android phone's shared storage too (ADR 0118 item 4.4) — and
/// the capture of audio to share with the table (ADR 0116 item 27: only the
/// desktop host lists it, a server never does).
/// "Show in Finder", "Copy full path" and the agents work on a path of this
/// computer, which a server's folder has not: they stay absent there
/// (ADR 0076 item 11; the agents are an open question, kept absent). The
/// terminal is this computer's shell, started in the person's home
/// directory there (ADR 0115, Q4 decided 2026-10-31).
const APP_ABILITIES: [Can; 8] = [
    Can::Windows,
    Can::WebViews,
    Can::Updates,
    Can::Devtools,
    Can::LocalFolders,
    Can::SharedStorage,
    Can::Terminal,
    Can::AudioShare,
];

/// The server's answer for a folder it holds, plus the abilities of this
/// app that do not depend on the folder's side. `write`, `collab`,
/// `account`, `admin` and `host` stay the server's (ADR 0026: the UI does
/// not assume the side, the host merges).
pub(crate) fn with_app_abilities(caps: &mut Value) {
    with_abilities_of(caps, &crate::mobile::local_can(false));
}

/// [`with_app_abilities`] for an app whose own window lists `here`: an
/// ability of the app comes along only where the app has it — a phone
/// has no terminal, no second window, no page inside a note (ADR 0118
/// item 5), and iOS no updater, no capture, no link, no mDNS, no serving
/// off the screen either (ADR 0119 B14 and A13). A window on a server's
/// folder offered them on a phone before, and failed when used.
pub(crate) fn with_abilities_of(caps: &mut Value, here: &[Can]) {
    let Some(can) = caps.get_mut("can").and_then(Value::as_array_mut) else {
        return;
    };
    for ability in APP_ABILITIES.iter().chain(Can::APP_SERVER) {
        let word = json!(ability);
        if here.contains(ability) && !can.contains(&word) {
            can.push(word);
        }
    }
    // A window on a server's folder is a folder window. A server older than
    // ADR 0114 does not say so (it never had a loose session), and the
    // window would hide the tree, the search and the bin: the folder's
    // abilities are the default here.
    for ability in Can::FOLDER {
        let ability = json!(ability);
        if !can.contains(&ability) {
            can.push(ability);
        }
    }
}
