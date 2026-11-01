// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Share audio at the table (ADR 0116 section B), the server's side: the
//! commands that start, stop and hear a table's live share, and what every
//! window at the table is told. The frames themselves are
//! `audio_relay.rs`'s.
//!
//! The game master alone starts and stops a share (`may(Broadcast)`, item
//! 22); one share per table, and a second asks to replace the first (item
//! 16). A share is the master's performance to the table, not a file: every
//! window at the table hears of it, and each one that asks receives its
//! frames (item 21). The sharer is told how many receive and the rate that
//! leaves the server for them; the others are not.
//!
//! A share ends on *Stop*, when the sharer's connection goes (closed, on
//! another folder, or no longer let into this one), when the table
//! empties, or when another replaces it — `table-share-stopped` says which.
//!
//! Bounds (ADR 0083, item 28): the commands are paced as the table's
//! messages are; the share is a closed form ([`name_ok`], [`bitrate_ok`]);
//! nothing of a frame, and no source's name, reaches the server's log.

use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::{
    AudioShare, AudioShareBehind, AudioShareStart, AudioShareStopped, ContractError, ErrorKind,
    bitrate_ok, name_ok,
};

use crate::access::{Action, Door, Kind};
use crate::audio_relay::{Ended, Heard, Key, Now};
use crate::auth::Who;
use crate::rpc::{arg, to_value};
use crate::state::Server;

/// The commands of a table's live share.
pub const COMMANDS: [&str; 3] = [
    "table_share_start",
    "table_share_stop",
    "table_share_listen",
];

#[must_use]
pub fn is_command(cmd: &str) -> bool {
    COMMANDS.contains(&cmd)
}

/// What a second share is answered without `replace`.
pub const SHARING_ALREADY: &str = "the table shares audio already: replace it?";

fn refused(message: &str) -> ContractError {
    verso_service::refused(message)
}

fn key_of(folder: &str, table: &str) -> Key {
    (folder.to_owned(), table.to_owned())
}

/// Whether window `client` knows the table as its share's root, `""`.
fn on_share(server: &Server, client: &str, folder: &str) -> bool {
    crate::table::viewer_of(server, client, folder).is_some_and(|v| v.2.is_some())
}

/// The share as window `client` is told it: the count and the rate to the
/// sharer's connection only.
fn view_for(server: &Server, client: &str, folder: &str, now: &Now) -> AudioShare {
    let mut share = now.share.clone();
    if on_share(server, client, folder) {
        share.table = String::new();
    }
    if client == now.sharer {
        share.listeners = Some(now.listeners);
        share.rate_bps = Some(now.rate_bps);
    } else {
        share.listeners = None;
        share.rate_bps = None;
    }
    share
}

/// The windows at the table, and the sharer's connection when it left the
/// table's panel and still shares.
fn told(server: &Server, (folder, table): (&str, &str), sharer: &str) -> Vec<String> {
    let mut all = crate::table::members(server, folder, table);
    if !all.iter().any(|c| c == sharer) {
        all.push(sharer.to_owned());
    }
    all
}

fn tell_started(server: &Server, key: &Key, now: &Now) {
    for client in told(server, (&key.0, &key.1), &now.sharer) {
        let view = view_for(server, &client, &key.0, now);
        server.push(
            &[client],
            &json!({ "event": "table-share-started", "payload": view }),
        );
    }
}

/// The sharer told its count and rate (`table-share-state`).
fn tell_state(server: &Server, key: &Key) {
    if let Some(now) = server.relay.current(key) {
        let view = view_for(server, &now.sharer, &key.0, &now);
        server.push(
            &[now.sharer],
            &json!({ "event": "table-share-state", "payload": view }),
        );
    }
}

/// A share ended: everyone at the table and its sharer told why, and one
/// line of counts in the log — never a name, never a byte of a frame.
fn tell_ended(server: &Server, ended: &Ended) {
    let (folder, table) = (&ended.key.0, &ended.key.1);
    for client in told(server, (folder, table), &ended.sharer) {
        let payload = AudioShareStopped {
            table: if on_share(server, &client, folder) {
                String::new()
            } else {
                table.clone()
            },
            id: ended.id,
            reason: ended.reason,
        };
        server.push(
            &[client],
            &json!({ "event": "table-share-stopped", "payload": payload }),
        );
    }
    let c = ended.counts;
    crate::log::info(&format!(
        "a live share ended ({:?}): {} frames relayed, {} refused, {} dropped for slow listeners",
        ended.reason, c.relayed, c.refused, c.dropped
    ));
}

/// The table's share as window `client` joining it is told (`TableJoin.share`).
#[must_use]
pub fn joined(server: &Server, client: &str, (folder, table): (&str, &str)) -> Option<AudioShare> {
    let now = server.relay.current(&key_of(folder, table))?;
    Some(view_for(server, client, folder, &now))
}

/// Connection `client` left the table's panel: it no longer receives.
pub fn left(server: &Server, client: &str, (folder, table): (&str, &str)) {
    let key = key_of(folder, table);
    if server.relay.left(&key, client) {
        tell_state(server, &key);
    }
}

/// The last window left the table: its share ends.
pub fn emptied(server: &Server, (folder, table): (&str, &str)) {
    if let Some(ended) = server.relay.emptied(&key_of(folder, table)) {
        tell_ended(server, &ended);
    }
}

/// Connection `client` went: the shares it started end.
pub fn gone(server: &Server, client: &str) {
    for ended in server.relay.gone(client) {
        tell_ended(server, &ended);
    }
}

/// A binary message of connection `client` that is an audio frame
/// (`verso_contract::is_audio_frame`): relayed, or dropped and counted with
/// no answer.
pub fn frame(server: &Server, client: &str, frame: axum::body::Bytes) {
    if let Heard::Relayed {
        key,
        behind,
        tell_sharer,
    } = server.relay.frame(client, frame)
    {
        if let Some(now) = server.relay.current(&key) {
            for listener in behind {
                let payload = AudioShareBehind {
                    table: if on_share(server, &listener, &key.0) {
                        String::new()
                    } else {
                        key.1.clone()
                    },
                    id: now.share.id,
                };
                server.push(
                    &[listener],
                    &json!({ "event": "table-share-behind", "payload": payload }),
                );
            }
        }
        if tell_sharer {
            tell_state(server, &key);
        }
    }
}

/// The commands of a table's live share, for a window of `folder` at
/// `table` (`member`: whether it is at the table's panel now).
pub async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    door: &Door,
    (folder, table, member): (&str, &str, bool),
    cmd: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let key = key_of(folder, table);
    let sharer = server
        .relay
        .current(&key)
        .is_some_and(|n| n.sharer == client);
    // The sharer may stop from outside the table's panel; everything else
    // is for a window at the table.
    if !member && !(cmd == "table_share_stop" && sharer) {
        return Err(refused("join the table first"));
    }
    if cmd != "table_share_listen" && !door.may(Action::Broadcast, table, Kind::Table).allowed() {
        return Err(refused("only the game master shares audio at the table"));
    }
    crate::table::pace(server, client)?;
    match cmd {
        "table_share_start" => {
            let wish: AudioShareStart = arg(args, "share")?;
            if !name_ok(&wish.name) {
                return Err(refused("a source's name: 1 to 80 characters of plain text"));
            }
            if !bitrate_ok(wish.bitrate_kbps) {
                return Err(refused("a bitrate of 64 to 128 kbit/s"));
            }
            let share = AudioShare {
                table: table.to_owned(),
                id: 0,
                name: wish.name,
                kind: wish.kind,
                by: who.account.name.clone(),
                by_id: who.account.id.clone(),
                started_ms: crate::table_sound::now_ms(),
                bitrate_kbps: wish.bitrate_kbps,
                listeners: None,
                rate_bps: None,
            };
            let Ok((now, replaced)) = server.relay.start(&key, client, share, wish.replace) else {
                return Err(ContractError {
                    kind: ErrorKind::Exists,
                    message: SHARING_ALREADY.to_owned(),
                });
            };
            if let Some(ended) = replaced {
                tell_ended(server, &ended);
            }
            tell_started(server, &key, &now);
            to_value(view_for(server, client, folder, &now))
        }
        "table_share_stop" => {
            if let Some(ended) = server
                .relay
                .stop(&key, verso_contract::AudioShareEnd::Stopped)
            {
                tell_ended(server, &ended);
            }
            Ok(Value::Null)
        }
        "table_share_listen" => {
            let on: bool = arg(args, "listen")?;
            if on && sharer {
                return Err(refused("the sharer hears its source itself"));
            }
            if server.relay.listen(&key, client, on) {
                tell_state(server, &key);
            }
            Ok(Value::Null)
        }
        _ => Err(refused("no such command")),
    }
}
