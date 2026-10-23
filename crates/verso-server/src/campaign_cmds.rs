// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The commands of a table's game master (ADR 0110 items 1 to 5): make a
//! folder a table and turn it back, open or close it, release and hide
//! notes, mark a note's name a secret, grant a note to the group or to
//! one player, invite. Only the folder's owner runs them, from a window
//! on the folder itself — never through a share, never from a phone — and
//! a status read tells a player what it may know of its own table.
//!
//! Whatever they change is told at once: the veil is made again, the
//! reader's hashes of sync follow, the rooms of the players are closed
//! to be joined again over the new text, and every window hears
//! `campaign-changed`.

use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::{
    CampaignGrant, CampaignInvite, CampaignNote, CampaignPlayer, CampaignStatus, CampaignTable,
    ContractError,
};
use verso_service::lock;

use crate::auth::Who;
use crate::campaign;
use crate::db::{Grant, Role};
use crate::rpc::{arg, blocking, role_here, to_value};
use crate::state::Server;

/// What the commands of a table's game master are.
pub const COMMANDS: [&str; 9] = [
    "campaign_status",
    "campaign_make",
    "campaign_unmake",
    "campaign_settings",
    "campaign_release",
    "campaign_release_all",
    "campaign_secret_name",
    "campaign_grant",
    "campaign_invite",
];

#[must_use]
pub fn is_command(cmd: &str) -> bool {
    COMMANDS.contains(&cmd)
}

fn refused(message: &str) -> ContractError {
    verso_service::refused(message)
}

fn failed(e: impl std::fmt::Display) -> ContractError {
    verso_service::failed(e.to_string())
}

/// The folder of a window that is its game master: the owner, on the
/// folder itself, with a credential that writes.
fn game_master(
    server: &Server,
    who: &Who,
    client: &str,
) -> Result<(String, String), ContractError> {
    let (folder, role) = role_here(server, client)?;
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    if role != Role::Owner
        || crate::shares::scope_here(server, client).is_some()
        || who.phone.is_some()
        || !who.reaches(&folder).1
    {
        return Err(refused("only the folder's owner runs its table"));
    }
    Ok((folder, key))
}

/// A table's folder as the window names it: `""` or a folder path inside
/// the folder, nothing hidden, nothing that leaves it.
fn root_arg(args: &Value) -> Result<String, ContractError> {
    let root: String = arg(args, "root")?;
    if crate::scope::checked(&root).is_err() || root.split('/').any(|p| p.starts_with('.')) {
        return Err(refused("not a folder inside this folder"));
    }
    Ok(root)
}

pub async fn command(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    cmd: &str,
    args: Value,
) -> Result<Value, ContractError> {
    if cmd == "campaign_status" {
        return status(server, who, client).await;
    }
    let (folder, key) = game_master(server, who, client)?;
    // The notes whose state changed, for what the players are told.
    let mut touched: Vec<String> = Vec::new();
    match cmd {
        "campaign_make" => {
            let root = root_arg(&args)?;
            let (s, k, r) = (Arc::clone(server), key.clone(), root.clone());
            let exists = blocking(move || {
                Ok(r.is_empty() || s.service.with_key(&k, |ws| Ok(ws.is_folder(&r)))?)
            })
            .await?;
            if !exists {
                return Err(refused("no folder there"));
            }
            let (s, f, r) = (Arc::clone(server), folder.clone(), root);
            blocking(move || s.db.campaign_make(&f, &r).map_err(failed)).await?;
        }
        "campaign_unmake" => {
            let root = root_arg(&args)?;
            let (s, f) = (Arc::clone(server), folder.clone());
            blocking(move || s.db.campaign_drop(&f, &root).map_err(failed)).await?;
        }
        "campaign_settings" => settings(server, &folder, &args).await?,
        "campaign_release" | "campaign_release_all" => {
            touched = release(server, &folder, &key, cmd, &args).await?;
        }
        "campaign_secret_name" => {
            let path = note_arg(server, &folder, &args)?;
            let on: bool = arg(&args, "on")?;
            let (s, f, p) = (Arc::clone(server), folder.clone(), path.clone());
            blocking(move || s.db.campaign_secret_name(&f, &p, on).map_err(failed)).await?;
            touched.push(path);
        }
        "campaign_grant" => touched = vec![grant(server, &folder, &key, &args).await?],
        "campaign_invite" => return invite(server, who, &folder, &args).await,
        _ => return Err(refused("no such command")),
    }
    changed(server, &folder, &key, touched).await;
    status(server, who, client).await
}

/// A note of a table named by the window: confined, and inside a table.
fn note_arg(server: &Server, folder: &str, args: &Value) -> Result<String, ContractError> {
    let path: String = arg(args, "path")?;
    if crate::scope::checked(&path).is_err() || path.is_empty() {
        return Err(refused("not a note of this folder"));
    }
    match campaign::veil_of(server, folder) {
        Some(v) if v.in_table(&path) => Ok(path),
        _ => Err(refused("not inside a table")),
    }
}

async fn settings(server: &Arc<Server>, folder: &str, args: &Value) -> Result<(), ContractError> {
    let root = root_arg(args)?;
    let open: Option<bool> = arg(args, "open")?;
    let log_max: Option<i64> = arg(args, "logMax")?;
    let image_max: Option<i64> = arg(args, "imageMax")?;
    if log_max.is_some_and(|n| !(crate::db::LOG_LEAST..=crate::db::LOG_MOST).contains(&n)) {
        return Err(refused(&format!(
            "the log keeps {} to {} entries",
            crate::db::LOG_LEAST,
            crate::db::LOG_MOST
        )));
    }
    if image_max.is_some_and(|n| !(crate::db::IMAGE_LEAST..=crate::db::IMAGE_MOST).contains(&n)) {
        return Err(refused(&format!(
            "an image is {} to {} MB",
            crate::db::IMAGE_LEAST / (1024 * 1024),
            crate::db::IMAGE_MOST / (1024 * 1024)
        )));
    }
    let (s, f) = (Arc::clone(server), folder.to_owned());
    let found = blocking(move || {
        s.db.campaign_set(&f, &root, open, log_max, image_max)
            .map_err(failed)
    })
    .await?;
    if !found {
        return Err(refused("that folder is not a table"));
    }
    Ok(())
}

/// The notes (paths of the folder) `paths` name: a folder stands for the
/// notes under it. Only those inside a table.
fn expand(
    server: &Server,
    key: &str,
    folder: &str,
    paths: &[String],
) -> Result<Vec<String>, ContractError> {
    let veil = campaign::veil_of(server, folder).ok_or_else(|| refused("not inside a table"))?;
    let given = paths.to_vec();
    let found = server.service.with_key(key, move |ws| {
        let mut out = Vec::new();
        let all = crate::campaign_serve::all_files(ws);
        for p in &given {
            if crate::scope::checked(p).is_err() {
                return Err(refused("not a note of this folder").into());
            }
            if p.is_empty() || ws.is_folder(p) {
                let under = format!("{p}/");
                out.extend(
                    all.iter()
                        .filter(|f| p.is_empty() || f.starts_with(&under))
                        .cloned(),
                );
            } else {
                out.push(p.clone());
            }
        }
        Ok(out)
    })?;
    Ok(found
        .into_iter()
        .filter(|p| campaign::note_like(p) && veil.in_table(p))
        .collect())
}

async fn release(
    server: &Arc<Server>,
    folder: &str,
    key: &str,
    cmd: &str,
    args: &Value,
) -> Result<Vec<String>, ContractError> {
    let (paths, released): (Vec<String>, bool) = if cmd == "campaign_release_all" {
        (vec![root_arg(args)?], true)
    } else {
        (arg(args, "paths")?, arg(args, "released")?)
    };
    if paths.len() > 5000 {
        return Err(refused("too many at once"));
    }
    let (s, f, k) = (Arc::clone(server), folder.to_owned(), key.to_owned());
    blocking(move || {
        let notes = expand(&s, &k, &f, &paths)?;
        s.db.campaign_release(&f, &notes, released)
            .map_err(failed)?;
        // Hidden again: nobody edits what the table cannot see.
        if !released {
            for n in &notes {
                s.db.campaign_grant(&f, n, &Grant::None).map_err(failed)?;
            }
        }
        Ok(notes)
    })
    .await
}

async fn grant(
    server: &Arc<Server>,
    folder: &str,
    key: &str,
    args: &Value,
) -> Result<String, ContractError> {
    let path = note_arg(server, folder, args)?;
    let given: CampaignGrant = arg(args, "grant")?;
    // A board holds cards of hidden notes the player is shown locked: a
    // write of what it was served would put the locks in the board.
    if !crate::readers::is_note(&path) {
        return Err(refused("only a note can be edited by players"));
    }
    let grant = match given {
        CampaignGrant::None => Grant::None,
        CampaignGrant::Group => Grant::Group,
        CampaignGrant::Player { account } => {
            if !players_of(server, folder, &path)?
                .iter()
                .any(|p| p.id == account)
            {
                return Err(refused("not a player of this table"));
            }
            Grant::Player(account)
        }
    };
    let (s, f, k, p) = (
        Arc::clone(server),
        folder.to_owned(),
        key.to_owned(),
        path.clone(),
    );
    blocking(move || {
        // Only a note that is there.
        if grant != Grant::None && !s.service.with_key(&k, |ws| Ok(ws.confined(&p).is_ok()))? {
            return Err(refused("no such note"));
        }
        // A note someone may edit is released: the one who edits it reads it.
        if grant != Grant::None {
            s.db.campaign_release(&f, std::slice::from_ref(&p), true)
                .map_err(failed)?;
        }
        s.db.campaign_grant(&f, &p, &grant).map_err(failed)?;
        Ok(p)
    })
    .await
}

/// The players of the table that holds `path`: the members of the folder
/// who are not owners, when the table is the folder; the people of the
/// share at the table's folder otherwise.
fn players_of(
    server: &Server,
    folder: &str,
    path: &str,
) -> Result<Vec<CampaignPlayer>, ContractError> {
    let veil = campaign::veil_of(server, folder).ok_or_else(|| refused("not inside a table"))?;
    let root = veil.table(path).map(|t| t.root.clone()).unwrap_or_default();
    let people: Vec<(crate::db::Account, Role)> = if root.is_empty() {
        server.db.members(folder).map_err(failed)?
    } else {
        match server.db.share_at(folder, &root).map_err(failed)? {
            Some(s) => server.db.share_people(&s.id).map_err(failed)?,
            None => Vec::new(),
        }
    };
    Ok(people
        .into_iter()
        .filter(|(_, r)| *r != Role::Owner)
        .map(|(a, _)| CampaignPlayer {
            id: a.id,
            name: a.name,
        })
        .collect())
}

/// A table as the contract has it.
fn table_of(t: &crate::db::Campaign) -> CampaignTable {
    CampaignTable {
        root: t.root.clone(),
        open: t.open,
        log_max: u32::try_from(t.log_max).unwrap_or(u32::MAX),
        image_max: u32::try_from(t.image_max).unwrap_or(u32::MAX),
    }
}

fn grant_of(g: &Grant) -> CampaignGrant {
    match g {
        Grant::None => CampaignGrant::None,
        Grant::Group => CampaignGrant::Group,
        Grant::Player(a) => CampaignGrant::Player { account: a.clone() },
    }
}

/// What a window may know of the folder's tables.
async fn status(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
) -> Result<Value, ContractError> {
    let (folder, role) = role_here(server, client)?;
    let owner = role == Role::Owner
        && crate::shares::scope_here(server, client).is_none()
        && who.phone.is_none();
    let (s, w, c) = (Arc::clone(server), Arc::clone(who), client.to_owned());
    let status = blocking(move || {
        let Some(veil) = campaign::veil_of(&s, &folder) else {
            return Ok(CampaignStatus {
                viewer: "none".to_owned(),
                tables: Vec::new(),
                notes: Vec::new(),
                players: Vec::new(),
                can_invite: false,
            });
        };
        if owner {
            let mut players: Vec<CampaignPlayer> = Vec::new();
            for t in &veil.tables {
                for p in players_of(&s, &folder, &format!("{}/x", t.root))? {
                    if !players.iter().any(|q| q.id == p.id) {
                        players.push(p);
                    }
                }
            }
            let mut notes: Vec<CampaignNote> = veil
                .states()
                .map(|n| CampaignNote {
                    path: n.path.clone(),
                    released: n.released || n.grant != Grant::None,
                    secret_name: n.secret_name,
                    grant: grant_of(&n.grant),
                })
                .collect();
            notes.sort_by(|a, b| a.path.cmp(&b.path));
            return Ok(CampaignStatus {
                viewer: "owner".to_owned(),
                tables: veil.tables.iter().map(table_of).collect(),
                notes,
                players,
                can_invite: w.account.admin,
            });
        }
        // A player: the tables, and the notes it may edit — only those.
        let reads = crate::readers::reads_only(&s, &w, &c)?;
        let notes = veil
            .states()
            .filter(|n| veil.may_edit(&n.path, &w.account.id))
            .map(|n| CampaignNote {
                path: n.path.clone(),
                released: true,
                secret_name: false,
                grant: grant_of(&n.grant),
            })
            .collect();
        Ok(CampaignStatus {
            viewer: if reads { "player" } else { "none" }.to_owned(),
            tables: veil.tables.iter().map(table_of).collect(),
            notes,
            players: Vec::new(),
            can_invite: false,
        })
    })
    .await?;
    to_value(status)
}

/// An invitation to the table: a reader's, for the folder itself or for
/// the share at the table's folder. Only the server's admin invites a
/// person who has no account (ADR 0081 item 4), and wants a fresh proof
/// (ADR 0083 item 6), as the console's invitation to a folder does.
async fn invite(
    server: &Arc<Server>,
    who: &Arc<Who>,
    folder: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let root = root_arg(args)?;
    let (s, w, f) = (Arc::clone(server), Arc::clone(who), folder.to_owned());
    let made = blocking(move || {
        let Some(session) = w.session() else {
            return Err(refused("not with an access token"));
        };
        let at = s.db.proved_at(session).map_err(failed)?.unwrap_or(0);
        if crate::db::now().saturating_sub(at) > crate::proof::PROVE_WITHIN {
            return Err(ContractError {
                kind: verso_contract::ErrorKind::ProveFirst,
                message: "prove it is you first".to_owned(),
            });
        }
        if !w.account.admin {
            return Err(refused(
                "only the server's admin invites a person who has no account: ask for one, or give an account of this server a place at the table",
            ));
        }
        let veil = campaign::veil_of(&s, &f).ok_or_else(|| refused("not a table"))?;
        if !veil.tables.iter().any(|t| t.root == root) {
            return Err(refused("that folder is not a table"));
        }
        let share = if root.is_empty() {
            None
        } else {
            Some(s.db.make_share(&f, &root).map_err(failed)?)
        };
        let (token, inv) = s
            .db
            .create_invitation(&crate::db::NewLink {
                kind: "invite",
                email: None,
                account: None,
                folder: Some(&f),
                role: Some(Role::Reader),
                created_by: Some(&w.account.id),
                life: crate::db::INVITE_LIFE,
                share: share.as_ref().map(|x| x.id.as_str()),
            })
            .map_err(failed)?;
        let _ = s.db.audit(&crate::db::Audit {
            actor: Some(&w.account.id),
            action: "invitation_created",
            subject: Some(&inv.id),
            folder: Some(&f),
            address: None,
            ok: true,
        });
        let base = crate::base_url(&s.config);
        let base = base.trim_end_matches('/');
        Ok(CampaignInvite {
            link: format!("{base}/invite/{token}"),
            expires: u32::try_from(inv.expires).unwrap_or(u32::MAX),
        })
    })
    .await?;
    to_value(made)
}

/// The table's state changed: the veil is made again, what players are
/// told follows, and every window hears it.
pub async fn changed(server: &Arc<Server>, folder: &str, key: &str, touched: Vec<String>) {
    campaign::forget(server, folder);
    let (s, f, k) = (Arc::clone(server), folder.to_owned(), key.to_owned());
    let _ = blocking(move || {
        refresh(&s, &f, &k, &touched);
        Ok(())
    })
    .await;
}

/// The synchronous part of [`changed`].
pub fn refresh(server: &Server, folder: &str, key: &str, touched: &[String]) {
    campaign::forget(server, folder);
    // A closed table keeps its players out at once.
    close_out(server, folder);
    crate::campaign_sync::refresh_readers(server, folder, key, false);
    crate::collab::readers::veil_changed(server, key);
    let clients: Vec<(String, bool)> = lock(&server.clients)
        .iter()
        .filter(|(_, c)| c.folder.as_ref().is_some_and(|(f, _)| f == folder))
        .map(|(id, c)| {
            (
                id.clone(),
                c.folder.as_ref().is_some_and(|(_, r)| *r == Role::Owner),
            )
        })
        .collect();
    let (owners, players): (Vec<_>, Vec<_>) = clients.into_iter().partition(|(_, o)| *o);
    let owners: Vec<String> = owners.into_iter().map(|(c, _)| c).collect();
    let players: Vec<String> = players.into_iter().map(|(c, _)| c).collect();
    let event =
        |paths: Value| json!({ "event": "campaign-changed", "payload": { "paths": paths } });
    server.push(&owners, &event(json!(touched)));
    // A player is told no path in that event: it reads its list again, and
    // is told as a folder is, of the notes it now has or has lost.
    server.push(&players, &event(json!([])));
    let veil = campaign::veil_for_key(server, key);
    let (mut now, mut gone): (Vec<&String>, Vec<&String>) = (Vec::new(), Vec::new());
    for p in touched {
        match &veil {
            Some(v) if v.hides_note(p) => gone.push(p),
            _ => now.push(p),
        }
    }
    server.push(
        &players,
        &json!({ "event": "folder-changed", "payload": {
            "key": key, "changed": now, "removed": gone, "moved": [], "listing": true,
            "index": { "indexed": 0, "unchanged": 0, "removed": 0, "placeholders": 0,
                       "problems": [], "unwatched": null, "unindexed": null } } }),
    );
}

/// The windows of non-owners of a folder that holds a closed table the
/// window reaches leave it, told why.
fn close_out(server: &Server, folder: &str) {
    let mut gone = Vec::new();
    {
        let mut table = lock(&server.clients);
        for (id, c) in table.iter_mut() {
            let Some((f, role)) = c.folder.clone() else {
                continue;
            };
            if f != folder || role == Role::Owner {
                continue;
            }
            let root = c.scope.as_ref().map_or("", |s| s.root.as_str()).to_owned();
            let reads = !(role.writes() && c.token_write);
            if campaign::closed_for(server, folder, &root, reads) {
                c.folder = None;
                c.scope = None;
                c.tx.send(&json!({ "gone": "folder", "reason": "closed" }));
                gone.push(id.clone());
            }
        }
    }
    server.left(&gone);
}

/// A rename, a move or a deletion made through the server carries what the
/// table keeps about the notes (ADR 0110 item 4): the state follows the
/// note, and goes with it.
pub fn after_write(server: &Server, folder: &str, cmd: &str, args: &Value, answer: &Value) {
    if campaign::veil_of(server, folder).is_none() {
        return;
    }
    let mut touched = false;
    let mut moves: Vec<(String, String)> = Vec::new();
    match cmd {
        "rename_entry" | "rename_note" => {
            if let (Some(from), Some(to)) = (args["from"].as_str(), answer["path"].as_str()) {
                moves.push((from.to_owned(), to.to_owned()));
            }
        }
        "move_entries" => {
            for m in answer["moved"].as_array().into_iter().flatten() {
                if let (Some(from), Some(to)) = (m["from"].as_str(), m["to"].as_str()) {
                    moves.push((from.to_owned(), to.to_owned()));
                }
            }
        }
        "delete_entry" | "delete_note" => {
            if let Some(path) = args["path"].as_str() {
                touched = server.db.campaign_deleted(folder, path).unwrap_or(0) > 0;
            }
        }
        _ => {}
    }
    for (from, to) in moves {
        touched |= server.db.campaign_move(folder, &from, &to).unwrap_or(0) > 0;
    }
    if touched {
        campaign::forget(server, folder);
    }
}
