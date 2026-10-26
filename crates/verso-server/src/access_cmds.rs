// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The access of a table's paths, read and changed (ADR 0113 section C):
//! `access_get` answers, for each path, its own set, what applies, where it
//! comes from and, for a folder, how many files lie under it and which
//! have a set of their own; `access_set` writes a path's whole set — on a
//! folder it replaces everything inside — or deletes it (*Follow the
//! folder*). Only the game master changes access; a player is told who
//! sees a path it sees, and nothing else.

use std::collections::BTreeSet;
use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::{
    AccessChange, AccessException, AccessInfo, AccessLevel, AccessPlayer, AccessRow,
    AccessSetResult, AccessSetView, AccessWhy, ContractError, ErrorKind,
};

use crate::access::{Action, Door, Kind, Level, NodeSet};
use crate::auth::Who;
use crate::campaign::{self, Veil};
use crate::campaign_cmds::{self, Event};
use crate::rpc::{arg, blocking, to_value};
use crate::state::Server;

/// The most paths one call names.
const MOST: usize = 500;

fn refused(message: &str) -> ContractError {
    verso_service::refused(message)
}

fn failed(e: impl std::fmt::Display) -> ContractError {
    verso_service::failed(e.to_string())
}

fn absent() -> ContractError {
    ContractError {
        kind: ErrorKind::NotFound,
        message: "not found".to_owned(),
    }
}

fn level_out(l: Level) -> AccessLevel {
    match l {
        Level::None => AccessLevel::None,
        Level::See => AccessLevel::See,
        Level::Edit => AccessLevel::Edit,
    }
}

fn level_in(l: AccessLevel) -> Level {
    match l {
        AccessLevel::None => Level::None,
        AccessLevel::See => Level::See,
        AccessLevel::Edit => Level::Edit,
    }
}

fn view_of(set: &NodeSet) -> AccessSetView {
    AccessSetView {
        whole: level_out(set.whole),
        rows: set
            .rows
            .iter()
            .map(|(a, l)| AccessRow {
                account: a.clone(),
                level: level_out(*l),
            })
            .collect(),
    }
}

fn set_of(view: &AccessSetView) -> NodeSet {
    NodeSet {
        whole: level_in(view.whole),
        rows: view
            .rows
            .iter()
            .map(|r| (r.account.clone(), level_in(r.level)))
            .collect(),
    }
}

/// A path the window named, in the folder's own words: confined, and
/// through a share's root when the window is on one.
fn full_path(door: &Door, given: &str) -> Result<String, ContractError> {
    let full = match &door.scope {
        Some(s) => s.to_full(given)?,
        None => given.to_owned(),
    };
    if crate::scope::checked(&full).is_err() {
        return Err(refused("not a path of this folder"));
    }
    Ok(full)
}

/// How many secret blocks (0087) a note's text holds.
fn secret_blocks(text: &str) -> u32 {
    let mut n = 0;
    for line in text.lines() {
        let mut l = line.trim_start();
        while let Some(rest) = l.strip_prefix('>') {
            l = rest.trim_start();
        }
        if l.len() >= 8 && l.is_char_boundary(8) && l[..8].eq_ignore_ascii_case("[!secret") {
            n += 1;
        }
    }
    n
}

/// The text of the text cards of a board that a player who edits it is
/// shown: every text node but a secret pin.
fn board_texts(json: &str) -> String {
    let Ok(v) = serde_json::from_str::<Value>(json) else {
        return String::new();
    };
    v["nodes"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|n| {
            matches!(
                n.pointer("/verso/secret"),
                None | Some(Value::Null | Value::Bool(false))
            )
        })
        .filter_map(|n| n["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// `access_get`: the access of each path named.
pub async fn get(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let door = Door::of(server, who, client)?;
    let paths: Vec<String> = arg(args, "paths")?;
    if paths.is_empty() || paths.len() > MOST {
        return Err(refused("name between 1 and 500 paths"));
    }
    // A synced device asks only what its own changes may do (ADR 0113 S8).
    if args["brief"] == true {
        let (s, key) = (
            Arc::clone(server),
            server
                .service
                .folder_of(client)
                .ok_or_else(verso_service::no_folder)?,
        );
        return to_value(blocking(move || Ok(brief(&s, &key, &door, &paths))).await?);
    }
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let (s, w) = (Arc::clone(server), Arc::clone(who));
    let infos = blocking(move || {
        let mut out = Vec::new();
        for given in &paths {
            out.push(info(&s, &w, &door, &key, given)?);
        }
        Ok(out)
    })
    .await?;
    to_value(infos)
}

/// What a synced device may do with each path, answered by the one
/// judgement its writes meet (`Door::check_sync`): a path it does not see
/// is told as a free name is — nothing of it, never an error that says it
/// is there. `access_get` with `brief` (ADR 0113 S8).
fn brief(server: &Server, key: &str, door: &Door, paths: &[String]) -> Vec<Value> {
    paths
        .iter()
        .map(|given| {
            let full = door.full_checked(given);
            let there = full.as_ref().is_some_and(|p| {
                let p = p.clone();
                server
                    .service
                    .with_key(key, move |ws| {
                        Ok(ws.file_len(&p).is_some() || ws.is_folder(&p))
                    })
                    .unwrap_or(false)
            });
            let seen = there
                && full
                    .as_ref()
                    .is_some_and(|p| door.may_path(Action::See, p).allowed());
            if !seen {
                // A hidden file and a free name: one fixed answer.
                return json!({
                    "path": given, "see": false, "put": door.may_put_new(given),
                    "delete": false, "rename": false,
                });
            }
            json!({
                "path": given,
                "see": true,
                "put": door.check_sync("sync_put", &json!({ "path": given })).is_ok(),
                "delete": door.check_sync("sync_delete", &json!({ "path": given })).is_ok(),
                "rename": door.may_rename_here(given),
            })
        })
        .collect()
}

fn info(
    server: &Server,
    who: &Who,
    door: &Door,
    key: &str,
    given: &str,
) -> Result<AccessInfo, ContractError> {
    let full = full_path(door, given)?;
    let veil: Arc<Veil> = door
        .veil
        .clone()
        .ok_or_else(|| refused("not inside a table"))?;
    let table = veil
        .table(&full)
        .map(|t| t.root.clone())
        .ok_or_else(|| refused("not inside a table"))?;
    let manage = door.may(Action::ManageAccess, "", Kind::Folder).allowed();
    let me = who.account.id.clone();
    // A player is told of a path it sees, as a path that is not there else.
    if !manage && (!door.veiled() || veil.hides_note_from(&full, &me)) {
        return Err(absent());
    }
    let (k, p, f) = (key.to_owned(), full.clone(), door.folder.clone());
    let sees_secrets = manage || door.may_path(Action::SeeSecretBlocks, &full).allowed();
    let viewer = veil.view(&me);
    let (folder, files, text) = server.service.with_key(&k, |ws| {
        let folder = ws.is_folder(&p);
        let mut under = if folder {
            campaign_files(ws, &veil, &p)
        } else {
            Vec::new()
        };
        // A player is told of the files it sees, never the count of the rest.
        if !manage {
            under.retain(|f| !crate::campaign_serve::is_hidden_in(ws, &viewer, f));
        }
        let text = match Kind::of_path(&p) {
            Kind::Note if !folder => ws.read_note(&p).ok().map(|n| n.text),
            // A board's text cards are notes to whoever edits it (ADR 0113
            // H); a secret pin is not shown to them at all.
            Kind::Board if !folder => ws.read_text(&p).ok().map(|t| board_texts(&t.text)),
            _ => None,
        };
        Ok((folder, under, text))
    })?;
    let facts = veil.facts();
    let nearest = facts.nearest_set(&full, &table);
    let own = facts.sets.get(&campaign::key(&full)).map(view_of);
    let (set, why) = match nearest {
        Some((nk, set)) if nk == campaign::key(&full) => (set.clone(), AccessWhy::Own),
        Some((nk, set)) => (
            set.clone(),
            AccessWhy::Folder {
                path: nk.to_owned(),
            },
        ),
        None => (NodeSet::default(), AccessWhy::Default),
    };
    let seats = campaign_cmds::seats_in(server, &f, &table)?;
    let sees = |id: &str| id == me || veil.view(id).released(&full) || set.of(id) >= Level::See;
    let players: Vec<AccessPlayer> = seats
        .into_iter()
        .filter(|(p, _)| manage || sees(&p.id))
        .map(|(p, editor)| {
            let you = p.id == me;
            AccessPlayer {
                // A player is told who else has access by name; the
                // accounts of the others are the game master's to know.
                id: if manage || you { p.id } else { String::new() },
                name: p.name,
                editor,
                you,
            }
        })
        .collect();
    let exceptions: Vec<AccessException> = if manage && folder {
        let mut out = Vec::new();
        for st in veil.states() {
            let p = &st.path;
            let pk = campaign::key(p);
            if pk != campaign::key(&full)
                && campaign::covers(&full, p)
                && !facts.migrated.contains(&pk)
                && let Some(s) = facts.sets.get(&pk)
            {
                let is_folder = server
                    .service
                    .with_key(key, |ws| Ok(ws.is_folder(p)))
                    .unwrap_or(false);
                out.push(AccessException {
                    path: p.clone(),
                    folder: is_folder,
                    set: view_of(s),
                });
            }
        }
        out
    } else {
        Vec::new()
    };
    let shown = |set: &NodeSet| {
        if manage {
            view_of(set)
        } else {
            // Who sees, and the whole table's level; not the others' rows.
            AccessSetView {
                whole: level_out(set.whole),
                rows: set
                    .rows
                    .iter()
                    .filter(|(a, _)| **a == me)
                    .map(|(a, l)| AccessRow {
                        account: a.clone(),
                        level: level_out(*l),
                    })
                    .collect(),
            }
        }
    };
    Ok(AccessInfo {
        path: given.to_owned(),
        folder,
        table,
        own: if manage { own } else { None },
        set: shown(&set),
        why,
        files: u32::try_from(files.len()).unwrap_or(u32::MAX),
        exceptions,
        secret_name: manage && veil.secret_name(&full),
        secret_blocks: if sees_secrets {
            text.as_deref().map_or(0, secret_blocks)
        } else {
            0
        },
        players,
        manage,
        // Never an e-mail: a player is told a name, or the window words it.
        master: master_name(server, &f),
    })
}

/// The game master's name; empty when it has none (the window words it).
fn master_name(server: &Server, folder: &str) -> String {
    server
        .db
        .members(folder)
        .unwrap_or_default()
        .into_iter()
        .find(|(_, r)| *r == crate::db::Role::Owner)
        .map(|(a, _)| a.name)
        .unwrap_or_default()
}

/// The files (not folders) of the folder lying under `under`, in a table.
fn campaign_files(ws: &mut verso_core::Workspace, veil: &Veil, under: &str) -> Vec<String> {
    crate::campaign_serve::all_files(ws)
        .into_iter()
        .filter(|f| {
            veil.in_table(f)
                && campaign::covers(under, f)
                && campaign::key(f) != campaign::key(under)
        })
        .collect()
}

/// The paths of a path or a folder that change who sees them, for what the
/// sync log tells each player: compared by what each player sees of the
/// table before and after, not by an audience (ADR 0113 item 6).
fn events_between(
    server: &Server,
    folder: &str,
    before: &Veil,
    after: &Veil,
    notes: &[String],
) -> Result<Vec<Event>, ContractError> {
    let mut out = Vec::new();
    for path in notes {
        let players: Vec<String> = campaign_cmds::players_of(server, folder, path)?
            .into_iter()
            .map(|p| p.id)
            .collect();
        let sees = |v: &Veil, a: &str| v.view(a).released(path);
        let lost: Vec<String> = players
            .iter()
            .filter(|a| sees(before, a) && !sees(after, a))
            .cloned()
            .collect();
        let gained: Vec<String> = players
            .iter()
            .filter(|a| !sees(before, a) && sees(after, a))
            .cloned()
            .collect();
        let restricted = before.has_player_rows(path) || after.has_player_rows(path);
        if !lost.is_empty()
            || !gained.is_empty()
            || (restricted && before.effective_set(path) != after.effective_set(path))
        {
            out.push(Event {
                path: path.clone(),
                lost,
                gained,
                restricted,
            });
        }
    }
    Ok(out)
}

/// `access_set`: write the whole access of each path named, or delete it.
pub async fn set(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let door = Door::of(server, who, client)?;
    if !door.may(Action::ManageAccess, "", Kind::Folder).allowed() {
        return Err(refused("only the folder's owner runs its table"));
    }
    let paths: Vec<String> = arg(args, "paths")?;
    let change: AccessChange = arg(args, "change")?;
    if paths.is_empty() || paths.len() > MOST {
        return Err(refused("name between 1 and 500 paths"));
    }
    let folder = door.folder.clone();
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let (s, f) = (Arc::clone(server), folder.clone());
    blocking(move || {
        crate::campaign_sync::replay_pending(&s, &f);
        Ok(())
    })
    .await?;
    let before = campaign::veil_of(server, &folder);
    if before.as_ref().is_some_and(|v| v.is_unreadable()) {
        return Err(failed("the table's state cannot be read now"));
    }
    let (s, f, k, p, c) = (
        Arc::clone(server),
        folder.clone(),
        key.clone(),
        paths.clone(),
        change.clone(),
    );
    let before_for = before.clone();
    let (touched, events, changed) = blocking(move || {
        let veil = before_for.ok_or_else(|| refused("not inside a table"))?;
        let mut fulls = Vec::new();
        let known: std::collections::HashSet<String> = s.service.with_key(&k, |ws| {
            let mut all: std::collections::HashSet<String> = crate::campaign_serve::all_files(ws)
                .iter()
                .map(|f| campaign::key(f))
                .collect();
            all.extend(ws.folders().iter().map(|f| campaign::key(f)));
            Ok(all)
        })?;
        for given in &p {
            let full = full_path_plain(given)?;
            if !veil.in_table(&full) {
                return Err(refused("not inside a table"));
            }
            if !full.is_empty() && !known.contains(&campaign::key(&full)) {
                return Err(refused("not a path of this folder"));
            }
            fulls.push(full);
        }
        // Only the players of the table can be given a row of their own.
        if let AccessChange::Set { set, .. } = &c {
            for full in &fulls {
                let table = veil.table(full).map(|t| t.root.clone()).unwrap_or_default();
                let players: BTreeSet<String> = campaign_cmds::players_in(&s, &f, &table)?
                    .into_iter()
                    .map(|p| p.id)
                    .collect();
                if set.rows.iter().any(|r| !players.contains(&r.account)) {
                    return Err(refused("not a player of this table"));
                }
            }
        }
        let notes = campaign_cmds::expand(&s, &k, &f, &fulls)?;
        let mut changed = 0_u32;
        for full in &fulls {
            let is_folder = s.service.with_key(&k, |ws| Ok(ws.is_folder(full)))?;
            match &c {
                AccessChange::Set {
                    set,
                    secret_name,
                    keep_exceptions,
                } => {
                    let node = set_of(set);
                    if is_folder {
                        let under = s
                            .service
                            .with_key(&k, |ws| Ok(campaign_files(ws, &veil, full)))?;
                        changed += u32::try_from(under.len()).unwrap_or(u32::MAX);
                        s.db.access_replace_under(&f, full, node, *keep_exceptions)
                            .map_err(failed)?;
                    } else {
                        if veil.effective_set(full) != node.clone().normalized() {
                            changed += 1;
                        }
                        s.db.access_put(&f, full, node).map_err(failed)?;
                    }
                    if let Some(on) = secret_name {
                        s.db.campaign_secret_name(&f, full, *on).map_err(failed)?;
                    }
                }
                AccessChange::Follow => {
                    if veil.facts().sets.contains_key(&campaign::key(full)) {
                        changed += 1;
                    }
                    s.db.access_follow(&f, full).map_err(failed)?;
                }
            }
        }
        campaign::forget(&s, &f);
        let after = campaign::veil_of(&s, &f).ok_or_else(|| failed("the table vanished"))?;
        let events = events_between(&s, &f, &veil, &after, &notes)?;
        let mut touched = notes;
        touched.extend(fulls);
        Ok((touched, events, changed))
    })
    .await?;
    let (s, actor, f) = (Arc::clone(server), who.account.id.clone(), folder.clone());
    let subject = paths.first().cloned();
    let _ = blocking(move || {
        let _ = s.db.audit(&crate::db::Audit {
            actor: Some(&actor),
            action: "access_set",
            subject: subject.as_deref(),
            folder: Some(&f),
            address: None,
            ok: true,
        });
        Ok(())
    })
    .await;
    if !events.is_empty() {
        campaign::forget(server, &folder);
        let (s, f, k, b) = (
            Arc::clone(server),
            folder.clone(),
            key.clone(),
            before.clone(),
        );
        let _ = blocking(move || {
            crate::campaign_sync::audience_events(&s, &f, &k, &events, b);
            Ok(())
        })
        .await;
    }
    campaign_cmds::changed(server, &folder, &key, touched, before).await;
    to_value(AccessSetResult { changed })
}

/// A path the game master named: never through a share.
fn full_path_plain(given: &str) -> Result<String, ContractError> {
    if crate::scope::checked(given).is_err() {
        return Err(refused("not a path of this folder"));
    }
    Ok(given.to_owned())
}
