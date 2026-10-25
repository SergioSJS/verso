// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A presence in a shared note — a window's cursor, its name and colour —
//! stamped by the server before it is relayed (threat-model.md, gap 11;
//! the maintainer, 2026-10-12: "temos que ser seguros desde o dia 0").
//! The window sends a Yjs awareness update; the name in it is whatever
//! the sender wrote, so a member could have their cursor wear another
//! member's name. The server reads the update, sets each state's `user`
//! to the sender's account name and a colour that is only a colour, and
//! lets a connection speak only for the Yjs clients it holds: a client id
//! another account already speaks for in the room is dropped, so nobody
//! moves or removes someone else's cursor.
//!
//! The update's form is y-protocols' (`encodeAwarenessUpdate`): a count,
//! then per client its id, its clock and its state as a JSON string, each
//! number a lib0 variable-length unsigned integer. It is read here rather
//! than by `yrs`, whose decoder asserts in a debug build on an id past 53
//! bits — a peer's bytes never reach an assertion.

use std::collections::{HashMap, HashSet};

use serde_json::{Value, json};

/// How many Yjs clients one connection may speak for in a room: a window
/// is one, a few more cover a note opened again in a new document.
pub const CLIENTS_MOST: usize = 8;
/// The colour a presence gets when it sends none that is a colour: the
/// window's first (collab.ts, `COLORS`).
const COLOUR: &str = "#b5651d";

/// Who sends a presence: the connection, its account, the account's name.
pub struct Sender<'a> {
    pub client: &'a str,
    pub account: &'a str,
    pub name: &'a str,
}

/// The Yjs clients spoken for in a room: id → (account, connection).
pub type Claims = HashMap<u64, (String, String)>;

/// One client's entry in an update: its id, clock and state.
struct Entry {
    id: u64,
    clock: u64,
    state: String,
}

fn var(bytes: &[u8], at: &mut usize) -> Result<u64, String> {
    let mut n: u64 = 0;
    let mut shift = 0_u32;
    loop {
        let b = *bytes.get(*at).ok_or("a presence cut short")?;
        *at += 1;
        if shift > 63 || (shift == 63 && b & 0x7e != 0) {
            return Err("a number too large in a presence".to_owned());
        }
        n |= u64::from(b & 0x7f) << shift;
        if b & 0x80 == 0 {
            return Ok(n);
        }
        shift += 7;
    }
}

fn put_var(out: &mut Vec<u8>, mut n: u64) {
    loop {
        let low = u8::try_from(n & 0x7f).unwrap_or(0);
        n >>= 7;
        if n == 0 {
            out.push(low);
            return;
        }
        out.push(low | 0x80);
    }
}

fn decode(bytes: &[u8]) -> Result<Vec<Entry>, String> {
    let mut at = 0;
    let count = var(bytes, &mut at)?;
    let mut entries = Vec::new();
    for _ in 0..count {
        let id = var(bytes, &mut at)?;
        let clock = var(bytes, &mut at)?;
        let len = usize::try_from(var(bytes, &mut at)?).map_err(|e| e.to_string())?;
        let end = at
            .checked_add(len)
            .filter(|e| *e <= bytes.len())
            .ok_or("a presence cut short")?;
        let state = std::str::from_utf8(&bytes[at..end])
            .map_err(|_| "a presence that is not text")?
            .to_owned();
        at = end;
        entries.push(Entry { id, clock, state });
    }
    if at != bytes.len() {
        return Err("bytes after a presence".to_owned());
    }
    Ok(entries)
}

fn encode(entries: &[Entry]) -> Vec<u8> {
    let mut out = Vec::new();
    put_var(&mut out, entries.len() as u64);
    for e in entries {
        put_var(&mut out, e.id);
        put_var(&mut out, e.clock);
        put_var(&mut out, e.state.len() as u64);
        out.extend_from_slice(e.state.as_bytes());
    }
    out
}

fn is_colour(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

/// A state with its `user` set by the server: the account's name, the
/// colour sent when it is `#rrggbb`, the window's first otherwise. A
/// state that is not an object, nor `null` (a window gone), is dropped.
fn stamp(state: &str, name: &str) -> Option<String> {
    let mut v: Value = serde_json::from_str(state).ok()?;
    if v.is_null() {
        return Some("null".to_owned());
    }
    let fields = v.as_object_mut()?;
    let colour = fields
        .get("user")
        .and_then(|u| u.get("color"))
        .and_then(Value::as_str)
        .filter(|c| is_colour(c))
        .unwrap_or(COLOUR)
        .to_owned();
    fields.insert(
        "user".to_owned(),
        json!({ "name": name, "color": colour, "colorLight": format!("{colour}33") }),
    );
    Some(v.to_string())
}

/// The update `bytes` from `who`, as the room relays it: each state
/// stamped, the clients another account speaks for dropped, at most
/// [`CLIENTS_MOST`] clients per connection. `present` are the room's
/// connections: a claim of one that left is let go. `Err` when the bytes
/// are not a presence.
pub fn stamped(
    bytes: &[u8],
    who: &Sender,
    claims: &mut Claims,
    present: &HashSet<String>,
) -> Result<Vec<u8>, String> {
    let entries = decode(bytes)?;
    claims.retain(|_, (_, c)| present.contains(c));
    let mut out = Vec::new();
    for e in entries {
        let held = claims.values().filter(|(_, c)| c == who.client).count();
        match claims.get_mut(&e.id) {
            Some((account, _)) if account.as_str() != who.account => continue,
            // Already this connection's.
            Some((_, client)) if client.as_str() == who.client => {}
            // The same person's window again on a new connection: it
            // speaks for its client from now on, within its own bound.
            Some((_, client)) => {
                if held >= CLIENTS_MOST {
                    continue;
                }
                who.client.clone_into(client);
            }
            None => {
                if held >= CLIENTS_MOST {
                    continue;
                }
                claims.insert(e.id, (who.account.to_owned(), who.client.to_owned()));
            }
        }
        if let Some(state) = stamp(&e.state, who.name) {
            out.push(Entry {
                id: e.id,
                clock: e.clock,
                state,
            });
        }
    }
    Ok(encode(&out))
}

/// A presence already stamped, each state kept to its `user` alone — who
/// is there, never where their cursor or selection is: what a reader in a
/// note with secret blocks hears, and what the others hear of it (ADR
/// 0087 item 4). A window gone (`null`) stays gone.
pub fn named_only(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let entries = decode(bytes)?
        .into_iter()
        .filter_map(|e| {
            let v: Value = serde_json::from_str(&e.state).ok()?;
            let state = if v.is_null() {
                "null".to_owned()
            } else {
                json!({ "user": v.get("user")? }).to_string()
            };
            Some(Entry {
                id: e.id,
                clock: e.clock,
                state,
            })
        })
        .collect::<Vec<_>>();
    Ok(encode(&entries))
}

/// A presence already stamped, as a player in a board's shadow is told it: only
/// the fields a board draws — who (`user`), where the pointer is, which button,
/// and the `selected` ids `keep` names. An allowlist, so that a field a window
/// adds later, with the id of an element in it, is never told (ADR 0113
/// section H). A window gone (`null`) stays gone.
pub fn for_player(bytes: &[u8], keep: &dyn Fn(&str) -> bool) -> Result<Vec<u8>, String> {
    let entries = decode(bytes)?
        .into_iter()
        .map(|mut e| {
            if let Ok(v) = serde_json::from_str::<Value>(&e.state)
                && let Some(fields) = v.as_object()
            {
                let mut out = serde_json::Map::new();
                for k in ["user", "pointer", "button"] {
                    if let Some(x) = fields.get(k) {
                        out.insert(k.to_owned(), x.clone());
                    }
                }
                if let Some(list) = fields.get("selected").and_then(Value::as_array) {
                    let kept: Vec<Value> = list
                        .iter()
                        .filter(|x| x.as_str().is_some_and(keep))
                        .cloned()
                        .collect();
                    out.insert("selected".to_owned(), Value::Array(kept));
                }
                e.state = Value::Object(out).to_string();
            }
            e
        })
        .collect::<Vec<_>>();
    Ok(encode(&entries))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn update(entries: &[(u64, &str)]) -> Vec<u8> {
        encode(
            &entries
                .iter()
                .map(|(id, s)| Entry {
                    id: *id,
                    clock: 1,
                    state: (*s).to_owned(),
                })
                .collect::<Vec<_>>(),
        )
    }

    fn states(bytes: &[u8]) -> Vec<(u64, Value)> {
        decode(bytes)
            .unwrap()
            .into_iter()
            .map(|e| (e.id, serde_json::from_str(&e.state).unwrap()))
            .collect()
    }

    fn present(clients: &[&str]) -> HashSet<String> {
        clients.iter().map(|c| (*c).to_owned()).collect()
    }

    const BIA: Sender<'static> = Sender {
        client: "c-bia",
        account: "bia",
        name: "Bia",
    };

    #[test]
    fn a_presence_wears_its_senders_name_whatever_it_says() {
        let mut claims = Claims::new();
        let sent = update(&[(
            7,
            r##"{"user":{"name":"Ana","color":"#2e7d32","colorLight":"x"},"cursor":{"anchor":3}}"##,
        )]);
        let out = stamped(&sent, &BIA, &mut claims, &present(&["c-bia"])).unwrap();
        let got = states(&out);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].1["user"]["name"], "Bia");
        assert_eq!(got[0].1["user"]["color"], "#2e7d32");
        assert_eq!(got[0].1["user"]["colorLight"], "#2e7d3233");
        assert_eq!(got[0].1["cursor"]["anchor"], 3);
    }

    #[test]
    fn a_colour_that_is_not_one_is_replaced() {
        let mut claims = Claims::new();
        let sent = update(&[(
            7,
            r#"{"user":{"name":"Bia","color":"red;background:url(x)"}}"#,
        )]);
        let out = stamped(&sent, &BIA, &mut claims, &present(&["c-bia"])).unwrap();
        assert_eq!(states(&out)[0].1["user"]["color"], COLOUR);
    }

    #[test]
    fn another_accounts_client_is_not_spoken_for() {
        let mut claims = Claims::new();
        let ana = Sender {
            client: "c-ana",
            account: "ana",
            name: "Ana",
        };
        let room = present(&["c-ana", "c-bia"]);
        stamped(&update(&[(1, "{}")]), &ana, &mut claims, &room).unwrap();
        // Bia sends a presence, and one as Ana's client, and removes it.
        let out = stamped(
            &update(&[(2, "{}"), (1, r#"{"cursor":null}"#)]),
            &BIA,
            &mut claims,
            &room,
        )
        .unwrap();
        assert_eq!(states(&out).iter().map(|s| s.0).collect::<Vec<_>>(), [2]);
        let out = stamped(&update(&[(1, "null")]), &BIA, &mut claims, &room).unwrap();
        assert!(states(&out).is_empty());
        // Ana gone from the room, her client is free again.
        let out = stamped(
            &update(&[(1, "{}")]),
            &BIA,
            &mut claims,
            &present(&["c-bia"]),
        )
        .unwrap();
        assert_eq!(states(&out).len(), 1);
    }

    #[test]
    fn one_connection_speaks_for_a_few_clients_at_most() {
        let mut claims = Claims::new();
        let many: Vec<(u64, &str)> = (0..20).map(|i| (i, "{}")).collect();
        let out = stamped(&update(&many), &BIA, &mut claims, &present(&["c-bia"])).unwrap();
        assert_eq!(states(&out).len(), CLIENTS_MOST);
    }

    /// Found by the fuzz target `presence` on main (2026-10-14): a window
    /// of the same person on another connection took over the first's
    /// clients past the bound, and one connection spoke for more than
    /// `CLIENTS_MOST`.
    #[test]
    fn taking_over_a_persons_clients_keeps_the_bound() {
        let mut claims = Claims::new();
        let other = Sender {
            client: "c-bia-2",
            ..BIA
        };
        let room = present(&["c-bia", "c-bia-2"]);
        let first: Vec<(u64, &str)> = (0..8).map(|i| (i, "{}")).collect();
        let second: Vec<(u64, &str)> = (100..108).map(|i| (i, "{}")).collect();
        stamped(&update(&first), &BIA, &mut claims, &room).unwrap();
        stamped(&update(&second), &other, &mut claims, &room).unwrap();
        // The second window speaks again for its own, and for the first's.
        let both: Vec<(u64, &str)> = (0..8).chain(100..108).map(|i| (i, "{}")).collect();
        stamped(&update(&both), &other, &mut claims, &room).unwrap();
        let held = claims.values().filter(|(_, c)| c == "c-bia-2").count();
        assert!(held <= CLIENTS_MOST, "{held} clients for one connection");
    }

    #[test]
    fn a_reader_hears_who_is_there_and_never_where() {
        let state =
            r##"{"user":{"name":"Ana","color":"#2e7d32"},"cursor":{"anchor":"x","head":"y"}}"##;
        let bytes = encode(&[
            Entry {
                id: 7,
                clock: 3,
                state: state.to_owned(),
            },
            Entry {
                id: 8,
                clock: 1,
                state: "null".to_owned(),
            },
        ]);
        let named = named_only(&bytes).unwrap();
        let back = decode(&named).unwrap();
        assert_eq!(back.len(), 2);
        let kept: Value = serde_json::from_str(&back[0].state).unwrap();
        assert_eq!(
            kept,
            json!({ "user": { "name": "Ana", "color": "#2e7d32" } })
        );
        assert!(!back[0].state.contains("cursor"));
        assert_eq!(back[1].state, "null");
    }

    #[test]
    fn bytes_that_are_not_a_presence_are_refused() {
        let mut claims = Claims::new();
        let room = present(&["c-bia"]);
        assert!(stamped(&[1], &BIA, &mut claims, &room).is_err());
        assert!(stamped(&[0xff; 12], &BIA, &mut claims, &room).is_err());
        assert!(stamped(&[1, 1, 1, 9, b'{'], &BIA, &mut claims, &room).is_err());
        // An empty one is a presence, relayed empty.
        assert_eq!(stamped(&[0], &BIA, &mut claims, &room).unwrap(), [0]);
        // An id past 53 bits is only a number here.
        let big = update(&[(u64::MAX, "{}")]);
        assert_eq!(
            states(&stamped(&big, &BIA, &mut claims, &room).unwrap())[0].0,
            u64::MAX
        );
    }
}
