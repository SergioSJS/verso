// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Who writes as which Yjs client in a room (ADR 0083 item 14, decided by
//! the maintainer on 2026-10-14, "sim para os 2"). Yjs names an item by
//! its client and clock and skips one it already holds, so a window that
//! writes as another window's client, ahead of it, has the room keep its
//! item and that window its own: the two read different notes and boards
//! until the window joins again (the fuzz target `board`,
//! `one-item-two-contents.bin`). A room now ties each Yjs client to the
//! account, and the connection, that first wrote as it, as a presence
//! ties its clients (`presence.rs`): an update that makes items, or
//! deletes clocks, past what the room holds of a client another account
//! writes as is refused. What the room holds already — another window's
//! items in a whole state sent back, a deletion of another person's
//! element when it is moved or removed — is judged by no one. The room's
//! own client is `collab::ahead_of_room`'s.

use std::collections::{HashMap, HashSet};

use yrs::{ClientID, Doc, IdSet, ReadTxn, Transact, Update};

/// How many Yjs clients one connection may write as in a room: a window
/// is one, a few more are a note or a board opened again, or drawn in
/// from a document of its own.
pub const CLIENTS_MOST: usize = 64;
/// How many a room keeps: past it, those of connections no longer in the
/// room are let go first.
pub const ROOM_CLIENTS_MOST: usize = 4096;

/// The Yjs clients written as in a room: id → (account, connection).
pub type Writers = HashMap<ClientID, (String, String)>;

/// Who sends an update: the connection and its account.
#[derive(Clone, Copy)]
pub struct Writer<'a> {
    pub connection: &'a str,
    pub account: &'a str,
}

/// What a room answers an update that writes as another person's window.
pub const NOT_YOURS: &str = "an edit that writes as another person's window";

/// The clients `update` makes items of, or deletes clocks of, past what
/// `doc` holds — the room's own client left out.
fn ahead(doc: &Doc, update: &Update) -> Vec<ClientID> {
    let own = doc.client_id();
    let held = doc.transact().state_vector();
    let mut out = Vec::new();
    let mut past = |set: &IdSet| {
        for (client, ranges) in set.iter() {
            let made = held.get(client);
            if *client != own && !out.contains(client) && ranges.iter().any(|r| r.end > made) {
                out.push(*client);
            }
        }
    };
    past(&update.insertions(true));
    past(update.delete_set());
    out
}

/// Whether `who` may send `update` to the room of `doc`: the clients it
/// writes as past what the room holds, to [`claim`] once the room took
/// it, or why not. `present` are the room's connections.
pub fn judged(
    doc: &Doc,
    update: &Update,
    who: Writer,
    writers: &Writers,
    present: &HashSet<String>,
) -> Result<Vec<ClientID>, String> {
    let clients = ahead(doc, update);
    let mut new = 0;
    for client in &clients {
        match writers.get(client) {
            Some((account, _)) if account != who.account => return Err(NOT_YOURS.to_owned()),
            Some(_) => {}
            None => new += 1,
        }
    }
    if new > 0 {
        let held = writers
            .values()
            .filter(|(_, c)| c == who.connection)
            .count();
        if held + new > CLIENTS_MOST {
            return Err(format!(
                "a window writes as {CLIENTS_MOST} Yjs clients at most in a room"
            ));
        }
        let room = writers
            .values()
            .filter(|(_, c)| present.contains(c))
            .count();
        if room + new > ROOM_CLIENTS_MOST {
            return Err(format!(
                "a room holds {ROOM_CLIENTS_MOST} Yjs clients at most"
            ));
        }
    }
    Ok(clients)
}

/// What `who` wrote, taken: the `clients` [`judged`] named are its
/// account's, written as on its connection — the same person's window
/// back on a new connection, or on one the server has not yet seen drop,
/// speaks for those it wrote as before. Past [`ROOM_CLIENTS_MOST`], the
/// clients of connections no longer in the room are let go first.
pub fn claim(who: Writer, clients: &[ClientID], writers: &mut Writers, present: &HashSet<String>) {
    if writers.len() + clients.len() > ROOM_CLIENTS_MOST {
        writers.retain(|_, (_, c)| present.contains(c) || c == who.connection);
    }
    for client in clients {
        writers.insert(*client, (who.account.to_owned(), who.connection.to_owned()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yrs::updates::decoder::Decode;
    use yrs::{Map, StateVector};

    const ANA: Writer = Writer {
        connection: "c1",
        account: "ana",
    };
    const BETO: Writer = Writer {
        connection: "c2",
        account: "beto",
    };

    fn present() -> HashSet<String> {
        ["c1", "c2"].map(String::from).into()
    }

    /// An edit of the window whose Yjs client is `client`, holding the
    /// room's state: `key` set in the room's map.
    fn edit(room: &Doc, client: u64, key: &str) -> Update {
        let window = Doc::with_client_id(client);
        let state = room
            .transact()
            .encode_state_as_update_v1(&StateVector::default());
        window
            .transact_mut()
            .apply_update(Update::decode_v1(&state).unwrap())
            .unwrap();
        let map = window.get_or_insert_map("m");
        let mut txn = window.transact_mut();
        map.insert(&mut txn, key, 1);
        Update::decode_v1(&txn.encode_update_v1()).unwrap()
    }

    fn taken(room: &Doc, who: Writer, update: Update, writers: &mut Writers) -> bool {
        let Ok(clients) = judged(room, &update, who, writers, &present()) else {
            return false;
        };
        room.transact_mut().apply_update(update).unwrap();
        claim(who, &clients, writers, &present());
        true
    }

    #[test]
    fn a_client_is_its_first_accounts() {
        let room = Doc::with_client_id(1);
        let mut writers = Writers::new();
        assert!(taken(&room, ANA, edit(&room, 10, "a"), &mut writers));
        assert!(!taken(&room, BETO, edit(&room, 10, "b"), &mut writers));
        // A deletion of clocks of Ana's client the room does not hold.
        let ahead = Update::decode_v1(&[0, 1, 10, 1, 5, 1]).unwrap();
        assert!(!taken(&room, BETO, ahead, &mut writers));
        // Beto's own, and Ana's on another connection of hers.
        assert!(taken(&room, BETO, edit(&room, 20, "b"), &mut writers));
        let back = Writer {
            connection: "c3",
            account: "ana",
        };
        assert!(taken(&room, back, edit(&room, 10, "c"), &mut writers));
        assert_eq!(writers[&ClientID::new(10)].1, "c3");
    }

    #[test]
    fn a_connection_writes_as_a_few_clients_at_most() {
        let room = Doc::with_client_id(1);
        let mut writers: Writers = (0..CLIENTS_MOST as u64)
            .map(|c| (ClientID::new(100 + c), ("ana".to_owned(), "c1".to_owned())))
            .collect();
        assert!(!taken(&room, ANA, edit(&room, 10, "a"), &mut writers));
        assert!(taken(&room, BETO, edit(&room, 20, "b"), &mut writers));
        // Those of connections gone are let go when the room is full.
        let mut full: Writers = (0..ROOM_CLIENTS_MOST as u64)
            .map(|c| (ClientID::new(100 + c), ("x".to_owned(), "gone".to_owned())))
            .collect();
        assert!(taken(&room, ANA, edit(&room, 11, "c"), &mut full));
        assert_eq!(full.len(), 1);
    }
}
