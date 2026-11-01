// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Music at the table (ADR 0116 section A, phase 1: files): a playback
//! state per table and channel that every window plays from its own copy
//! of the file. The server keeps it **in memory** beside the roster —
//! never in the database, never in a file (ADR 0012) — and drops it when
//! the last window leaves the table; the game master's window closing does
//! not stop it (Q8 a).
//!
//! The game master alone changes it (`may(Play)`, item 22); the server
//! stamps the instant with its own clock and grows the revision, and a
//! control naming an older revision is refused. Each window is told the
//! state as its person may know it: a player who does not see the file
//! (`may(See)`, the same judgement as `/f/`, Q3 a) is told that a track
//! plays and nothing of it — no path, no name — and its window fetches
//! nothing. The game master is told who does not hear.
//!
//! Bounds (ADR 0083, item 28): the controls are paced as messages are; a
//! path is a path inside the folder and an audio file by its name, never a
//! URL; the clock's answer is paced on its own. Nothing of a track is
//! written to the server's log.

use std::collections::{BTreeMap, HashMap};
use std::sync::Mutex;

use serde_json::{Value, json};
use verso_contract::{ContractError, PlaybackSource, TablePlayback, TablePlayed, TableTime};
use verso_service::lock;

use crate::access::{Action, Door, Kind};
use crate::auth::Who;
use crate::db::Role;
use crate::rpc::{arg, blocking, to_value};
use crate::state::Server;

/// The channels V1 plays (item 23; ambience after V1, Q4 a).
pub const CHANNELS: [&str; 1] = ["music"];

/// The commands of the table's music.
pub const COMMANDS: [&str; 4] = [
    "table_play",
    "table_sound",
    "table_time",
    "table_cannot_play",
];

/// What the file's name must end with: the audio the window's engines
/// may decode (item 13: no transcoding; the window says who cannot).
const AUDIO: [&str; 8] = [
    ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".flac",
];

#[must_use]
pub fn is_command(cmd: &str) -> bool {
    COMMANDS.contains(&cmd)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Playing,
    Paused,
    Stopped,
}

impl State {
    fn as_str(self) -> &'static str {
        match self {
            Self::Playing => "playing",
            Self::Paused => "paused",
            Self::Stopped => "stopped",
        }
    }
}

/// One channel as the server keeps it. `path` is the folder's (not a
/// share's), `key` the folder's key in the service, for the veil's
/// judgement of who sees it.
#[derive(Debug, Clone)]
struct Channel {
    revision: u32,
    path: String,
    key: String,
    state: State,
    position_ms: f64,
    anchor_ms: f64,
    master: u8,
    looping: bool,
    duration_ms: Option<f64>,
    by: String,
    by_id: String,
    /// The accounts whose window cannot play this track, and their names.
    cannot: BTreeMap<String, String>,
}

impl Channel {
    /// Where the track is at the server's instant `now`.
    fn position_at(&self, now: f64) -> f64 {
        let at = if self.state == State::Playing {
            self.position_ms + (now - self.anchor_ms).max(0.0)
        } else {
            self.position_ms
        };
        match self.duration_ms {
            Some(d) if d > 0.0 && self.looping => at % d,
            Some(d) if d > 0.0 => at.min(d),
            _ => at,
        }
    }
}

/// A table: the folder's id and the table's root in it.
type Key = (String, String);

/// The playback of every table that has one, by table and channel.
#[derive(Default)]
pub struct Sounds {
    map: Mutex<HashMap<Key, BTreeMap<String, Channel>>>,
}

/// The server's clock, Unix milliseconds.
#[must_use]
pub fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

fn refused(message: &str) -> ContractError {
    verso_service::refused(message)
}

/// A path the window names as a track: relative to the folder it opened,
/// never absolute or with `..` (ADR 0026 rule 4), an audio file by its
/// name, never a URL.
fn track_path(path: &str) -> Result<(), ContractError> {
    let lower = path.to_lowercase();
    let ok = !path.is_empty()
        && path.chars().count() <= 512
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.contains("://")
        && !path.chars().any(char::is_control)
        && path
            .split('/')
            .all(|p| p != ".." && p != "." && !p.is_empty())
        && AUDIO.iter().any(|e| lower.ends_with(e));
    if ok {
        Ok(())
    } else {
        Err(refused("a sound file inside the folder"))
    }
}

fn channel_named(args: &Value) -> Result<String, ContractError> {
    let channel: Option<String> = arg(args, "channel")?;
    let channel = channel.unwrap_or_else(|| CHANNELS[0].to_owned());
    if CHANNELS.contains(&channel.as_str()) {
        Ok(channel)
    } else {
        Err(refused("no such channel"))
    }
}

/// Whether the person behind `account` does not see `path` (a path of the
/// folder): the veil's own judgement, the one `/f/` makes (no second door).
fn hidden_from(server: &Server, key: &str, account: &str, path: &str) -> bool {
    crate::campaign_serve::is_hidden(server, key, Some(account), path)
}

/// The channel as the window `client` may know it; none when the window is
/// not one of the folder's now.
fn view_for(
    server: &Server,
    client: &str,
    (folder, table): (&str, &str),
    channel: &str,
    c: &Channel,
) -> Option<TablePlayback> {
    let (account, role, root) = crate::table::viewer_of(server, client, folder)?;
    let master = role == Role::Owner;
    // A window on a share knows the folder from the share's root.
    let shown = match root.as_deref() {
        None => Some(c.path.clone()),
        Some(r) => crate::db::covers(r, &c.path)
            .then(|| c.path[r.len()..].trim_start_matches('/').to_owned()),
    };
    let unseen = !master && (shown.is_none() || hidden_from(server, &c.key, &account, &c.path));
    let (unheard, cannot) = if master {
        (
            unheard(server, folder, &c.key, &c.path),
            c.cannot.values().cloned().collect(),
        )
    } else {
        (Vec::new(), Vec::new())
    };
    Some(TablePlayback {
        table: if root.is_some() {
            String::new()
        } else {
            table.to_owned()
        },
        channel: channel.to_owned(),
        revision: f64::from(c.revision),
        source: if unseen {
            None
        } else {
            shown.map(|path| PlaybackSource {
                kind: "file".to_owned(),
                path,
            })
        },
        unseen,
        state: c.state.as_str().to_owned(),
        position_ms: c.position_ms,
        anchor_ms: c.anchor_ms,
        master: c.master,
        looping: c.looping,
        duration_ms: c.duration_ms,
        by: c.by.clone(),
        by_id: c.by_id.clone(),
        unheard,
        cannot,
    })
}

/// The names of the table's players who do not see `path`: whom the game
/// master is told of before playing it, and while it plays.
fn unheard(server: &Server, folder: &str, key: &str, path: &str) -> Vec<String> {
    let Some(veil) = crate::campaign::veil_of(server, folder) else {
        return Vec::new();
    };
    let Some(root) = veil.table(path).map(|t| t.root.clone()) else {
        return Vec::new();
    };
    let Ok(players) = crate::campaign_cmds::players_in(server, folder, &root) else {
        return Vec::new();
    };
    players
        .into_iter()
        .filter(|p| hidden_from(server, key, &p.id, path))
        .map(|p| p.name)
        .collect()
}

/// The playback of every channel of the table, as window `client` knows it:
/// what a join answers.
#[must_use]
pub fn joined(server: &Server, client: &str, (folder, table): (&str, &str)) -> Vec<TablePlayback> {
    let channels = lock(&server.sounds.map)
        .get(&(folder.to_owned(), table.to_owned()))
        .cloned()
        .unwrap_or_default();
    channels
        .iter()
        .filter_map(|(name, c)| view_for(server, client, (folder, table), name, c))
        .collect()
}

/// Tell every window at the table the channel, each as it may know it.
fn tell(server: &Server, (folder, table): (&str, &str), channel: &str, c: &Channel) {
    for client in crate::table::members(server, folder, table) {
        if let Some(view) = view_for(server, &client, (folder, table), channel, c) {
            server.push(
                &[client],
                &json!({ "event": "table-playback", "payload": view }),
            );
        }
    }
}

/// What the folder's people see changed (a release, an access set, a
/// table opened or closed): every table of it that plays is told again,
/// so a player who now sees the track hears it, and one who lost it stops.
pub fn retell(server: &Server, folder: &str) {
    let all: Vec<(Key, BTreeMap<String, Channel>)> = lock(&server.sounds.map)
        .iter()
        .filter(|(k, _)| k.0 == folder)
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    for ((f, t), channels) in all {
        for (name, c) in &channels {
            tell(server, (&f, &t), name, c);
        }
    }
}

/// The table emptied: its music goes with it (item 8).
pub fn dropped(server: &Server, (folder, table): (&str, &str)) {
    lock(&server.sounds.map).remove(&(folder.to_owned(), table.to_owned()));
}

/// Whether anything is kept for the table (for the tests).
#[must_use]
pub fn plays(server: &Server, (folder, table): (&str, &str)) -> bool {
    lock(&server.sounds.map).contains_key(&(folder.to_owned(), table.to_owned()))
}

/// The commands of the table's music, for a window at `table` of `folder`
/// (`table.rs` checked that it is at it).
pub async fn command(
    server: &std::sync::Arc<Server>,
    who: &Who,
    client: &str,
    door: &Door,
    (folder, table): (&str, &str),
    cmd: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    if cmd == "table_time" {
        if let Some(wait) = server.table_pace.take(&format!("time:{client}")) {
            return Err(refused(&format!("too fast: wait {wait} s")));
        }
        return to_value(TableTime { now_ms: now_ms() });
    }
    let channel = channel_named(args)?;
    if cmd == "table_cannot_play" {
        let revision: f64 = arg(args, "revision")?;
        crate::table::pace(server, client)?;
        let (s, f, t, c) = (
            std::sync::Arc::clone(server),
            folder.to_owned(),
            table.to_owned(),
            client.to_owned(),
        );
        let (account, name) = (who.account.id.clone(), who.account.name.clone());
        blocking(move || {
            cannot_play(&s, &c, (&f, &t), &channel, revision, (&account, &name));
            Ok(())
        })
        .await?;
        return Ok(Value::Null);
    }
    if !door.may(Action::Play, table, Kind::Table).allowed() {
        return Err(refused("only the game master plays music at the table"));
    }
    crate::table::pace(server, client)?;
    let (s, f, t, c) = (
        std::sync::Arc::clone(server),
        folder.to_owned(),
        table.to_owned(),
        client.to_owned(),
    );
    let (by, by_id) = (who.account.name.clone(), who.account.id.clone());
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    match cmd {
        "table_play" => {
            let given: String = arg(args, "path")?;
            track_path(&given)?;
            let path = door
                .full_checked(&given)
                .ok_or_else(|| refused("a sound file inside the folder"))?;
            let wish = Play {
                position_ms: arg::<Option<f64>>(args, "positionMs")?.unwrap_or(0.0),
                looping: arg::<Option<bool>>(args, "looping")?.unwrap_or(false),
                duration_ms: arg(args, "durationMs")?,
                ask: arg::<Option<bool>>(args, "ask")?.unwrap_or(false),
            };
            let played = blocking(move || {
                Ok(play(
                    &s,
                    &c,
                    (&f, &t),
                    &channel,
                    (&path, &key),
                    &wish,
                    (&by, &by_id),
                ))
            })
            .await?;
            to_value(played)
        }
        "table_sound" => {
            let revision: f64 = arg(args, "revision")?;
            let wish: String = arg(args, "wish")?;
            let change = Change::read(&wish, args)?;
            let view = blocking(move || {
                change_channel(&s, &c, (&f, &t), &channel, revision, &change, (&by, &by_id))
            })
            .await?;
            to_value(view)
        }
        _ => Err(refused("no such command")),
    }
}

/// What `table_play` asks for.
struct Play {
    position_ms: f64,
    looping: bool,
    duration_ms: Option<f64>,
    ask: bool,
}

fn finite_ms(v: f64) -> f64 {
    if v.is_finite() {
        v.clamp(0.0, 1e10)
    } else {
        0.0
    }
}

fn play(
    server: &Server,
    client: &str,
    (folder, table): (&str, &str),
    channel: &str,
    (path, key): (&str, &str),
    wish: &Play,
    (by, by_id): (&str, &str),
) -> TablePlayed {
    let unheard_now = unheard(server, folder, key, path);
    if wish.ask && !unheard_now.is_empty() {
        return TablePlayed {
            playback: None,
            unheard: unheard_now,
        };
    }
    let made = {
        let mut map = lock(&server.sounds.map);
        let channels = map
            .entry((folder.to_owned(), table.to_owned()))
            .or_default();
        let revision = channels
            .get(channel)
            .map_or(0, |c| c.revision)
            .saturating_add(1);
        let master = channels.get(channel).map_or(100, |c| c.master);
        let c = Channel {
            revision,
            path: path.to_owned(),
            key: key.to_owned(),
            state: State::Playing,
            position_ms: finite_ms(wish.position_ms),
            anchor_ms: now_ms(),
            master,
            looping: wish.looping,
            duration_ms: wish.duration_ms.map(finite_ms).filter(|d| *d > 0.0),
            by: by.to_owned(),
            by_id: by_id.to_owned(),
            cannot: BTreeMap::new(),
        };
        channels.insert(channel.to_owned(), c.clone());
        c
    };
    tell(server, (folder, table), channel, &made);
    TablePlayed {
        playback: view_for(server, client, (folder, table), channel, &made),
        unheard: unheard_now,
    }
}

/// A change of a channel that plays.
enum Change {
    Pause,
    Resume,
    Seek(f64),
    Stop,
    Master(u8),
    Loop(bool),
    Duration(f64),
}

impl Change {
    fn read(wish: &str, args: &Value) -> Result<Self, ContractError> {
        let value = || -> Result<f64, ContractError> {
            let v: Option<f64> = arg(args, "value")?;
            v.ok_or_else(|| refused("this change needs a value"))
        };
        Ok(match wish {
            "pause" => Self::Pause,
            "resume" => Self::Resume,
            "stop" => Self::Stop,
            "seek" => Self::Seek(finite_ms(value()?)),
            "master" => Self::Master(volume(value()?)),
            "loop" => Self::Loop(arg(args, "looping")?),
            "duration" => Self::Duration(finite_ms(value()?)),
            _ => return Err(refused("no such change")),
        })
    }
}

/// A volume of 0 to 100 from what the window sent.
fn volume(v: f64) -> u8 {
    if !v.is_finite() {
        return 100;
    }
    (0..=100u8)
        .min_by(|a, b| {
            (f64::from(*a) - v)
                .abs()
                .total_cmp(&(f64::from(*b) - v).abs())
        })
        .unwrap_or(100)
}

fn change_channel(
    server: &Server,
    client: &str,
    (folder, table): (&str, &str),
    channel: &str,
    revision: f64,
    change: &Change,
    (by, by_id): (&str, &str),
) -> Result<Option<TablePlayback>, ContractError> {
    let now = now_ms();
    let made = {
        let mut map = lock(&server.sounds.map);
        let c = map
            .get_mut(&(folder.to_owned(), table.to_owned()))
            .and_then(|m| m.get_mut(channel))
            .ok_or_else(|| refused("nothing plays at the table"))?;
        // A wish made on an older state is refused: two of the master's
        // windows never undo each other unseen.
        if (revision - f64::from(c.revision)).abs() > 0.5 {
            return Err(refused("the music changed meanwhile"));
        }
        let at = c.position_at(now);
        match *change {
            Change::Pause => {
                c.position_ms = at;
                c.state = State::Paused;
            }
            Change::Resume => {
                c.position_ms = if c.state == State::Stopped { 0.0 } else { at };
                c.state = State::Playing;
            }
            Change::Seek(p) => {
                c.position_ms = match c.duration_ms {
                    Some(d) if d > 0.0 => p.min(d),
                    _ => p,
                };
                if c.state == State::Stopped {
                    c.state = State::Paused;
                }
            }
            Change::Stop => {
                c.position_ms = 0.0;
                c.state = State::Stopped;
            }
            Change::Master(v) => {
                c.position_ms = at;
                c.master = v;
            }
            Change::Loop(on) => {
                c.position_ms = at;
                c.looping = on;
            }
            Change::Duration(d) => {
                c.position_ms = at;
                c.duration_ms = (d > 0.0).then_some(d);
            }
        }
        c.anchor_ms = now;
        c.revision = c.revision.saturating_add(1);
        c.by = by.to_owned();
        c.by_id = by_id.to_owned();
        c.clone()
    };
    tell(server, (folder, table), channel, &made);
    Ok(view_for(server, client, (folder, table), channel, &made))
}

/// A listener's window cannot play the track at `revision`: the game
/// master's windows are told who (item 13). Nothing when the track
/// changed meanwhile, or when the person does not see it.
fn cannot_play(
    server: &Server,
    client: &str,
    (folder, table): (&str, &str),
    channel: &str,
    revision: f64,
    (account, name): (&str, &str),
) {
    let key = (folder.to_owned(), table.to_owned());
    let Some(now) = lock(&server.sounds.map)
        .get(&key)
        .and_then(|m| m.get(channel))
        .cloned()
    else {
        return;
    };
    if (revision - f64::from(now.revision)).abs() > 0.5 || now.cannot.contains_key(account) {
        return;
    }
    let Some((_, role, _)) = crate::table::viewer_of(server, client, folder) else {
        return;
    };
    if role != Role::Owner && hidden_from(server, &now.key, account, &now.path) {
        return;
    }
    let made = {
        let mut map = lock(&server.sounds.map);
        let Some(c) = map.get_mut(&key).and_then(|m| m.get_mut(channel)) else {
            return;
        };
        // Still the same track: the mark is for the revision it was made on.
        if c.revision != now.revision {
            return;
        }
        c.cannot.insert(account.to_owned(), name.to_owned());
        c.clone()
    };
    tell(server, (folder, table), channel, &made);
}
