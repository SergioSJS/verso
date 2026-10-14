// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A roll of dice in a room (ADR 0088 item 4, decided 2026-10-14): the
//! window asks, the server rolls with its own generator (`dice.rs`) and
//! relays the roll stamped with the account's name, as it stamps presence,
//! so no window can show the others a roll it chose. The room keeps its
//! last [`ROLLS_KEPT`](super::ROLLS_KEPT) rolls in memory for whoever
//! joins; nothing is written, to the file or the database. A reader rolls
//! too: a roll writes nothing.

use serde_json::json;
use verso_contract::{CollabRoll, ContractError, DiceRoll};
use verso_service::lock;

use super::{ROLLS_KEPT, refused, tell};
use crate::state::Server;

/// `notation` rolled in the room of `path` for `who`, a window in it:
/// the roll, told to the room's other windows and kept for those who
/// join. `source` is the random table rolled, as the note writes it.
pub fn roll(
    server: &Server,
    who: &crate::presence::Sender,
    key: &str,
    path: &str,
    notation: &str,
    source: Option<String>,
) -> Result<DiceRoll, ContractError> {
    let read = crate::dice::read(notation).map_err(|e| refused(&e))?;
    let source = crate::dice::source(source).map_err(|e| refused(&e))?;
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let mut r = lock(&room);
    if !r.clients.contains(who.client) {
        return Err(refused("join the note first"));
    }
    let rolled = crate::dice::roll(
        &read,
        source,
        who.name,
        &crate::log::stamp(),
        &mut crate::dice::system,
    )
    .map_err(|e| verso_service::failed(e.as_str()))?;
    if r.rolls.len() >= ROLLS_KEPT {
        r.rolls.pop_front();
    }
    r.rolls.push_back(rolled.clone());
    let heard = CollabRoll {
        path: path.to_owned(),
        roll: rolled.clone(),
    };
    tell(
        server,
        &r,
        Some(who.client),
        &json!({ "event": "collab-roll", "payload": heard }),
    );
    Ok(rolled)
}
