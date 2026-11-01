// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a window on a server's folder can do besides what the server says
//! (split from `remote.rs`, ADR 0067).

use serde_json::{Value, json};

/// What this app can do whatever folder a window shows, as the contract
/// names it: its own windows, child web views, updates, console and the
/// opening of folders of this computer (ADR 0027, ADR 0076 item 11), and
/// the capture of audio to share with the table (ADR 0116 item 27: only the
/// desktop host lists it, a server never does).
/// "Show in Finder", "Copy full path" and the agents work on a path of this
/// computer, which a server's folder has not: they stay absent there
/// (ADR 0076 item 11; the agents are an open question, kept absent). The
/// terminal is this computer's shell, started in the person's home
/// directory there (ADR 0115, Q4 decided 2026-10-31).
const APP_ABILITIES: [&str; 7] = [
    "windows",
    "web_views",
    "updates",
    "devtools",
    "local_folders",
    "terminal",
    "audio_share",
];

/// The server's answer for a folder it holds, plus the abilities of this
/// app that do not depend on the folder's side. `write`, `collab`,
/// `account`, `admin` and `host` stay the server's (ADR 0026: the UI does
/// not assume the side, the host merges).
pub(crate) fn with_app_abilities(caps: &mut Value) {
    let Some(can) = caps.get_mut("can").and_then(Value::as_array_mut) else {
        return;
    };
    for ability in APP_ABILITIES {
        if !can.iter().any(|c| c == ability) {
            can.push(json!(ability));
        }
    }
    // A window on a server's folder is a folder window. A server older than
    // ADR 0114 does not say so (it never had a loose session), and the
    // window would hide the tree, the search and the bin: the folder's
    // abilities are the default here.
    for ability in verso_contract::Can::FOLDER {
        let ability = json!(ability);
        if !can.contains(&ability) {
            can.push(ability);
        }
    }
}
