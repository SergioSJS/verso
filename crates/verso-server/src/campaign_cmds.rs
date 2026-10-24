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

use std::collections::HashSet;
use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::{
    CampaignAccess, CampaignAudience, CampaignGrant, CampaignInvite, CampaignNote, CampaignPerson,
    CampaignPlayer, CampaignStatus, CampaignTable, ContractError,
};
use verso_service::lock;

use crate::auth::Who;
use crate::campaign;
use crate::db::{Audience, Grant, Role};
use crate::rpc::{arg, blocking, role_here, to_value};
use crate::state::Server;

/// What the commands of a table's game master are.
pub const COMMANDS: [&str; 11] = [
    "campaign_status",
    "campaign_make",
    "campaign_unmake",
    "campaign_settings",
    "campaign_release",
    "campaign_release_all",
    "campaign_audience",
    "campaign_access",
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
    if cmd == "campaign_access" {
        return access(server, who, client, &args).await;
    }
    let (folder, key) = game_master(server, who, client)?;
    // What waited for the table to be readable is told before anything new.
    let (s, f) = (Arc::clone(server), folder.clone());
    blocking(move || {
        crate::campaign_sync::replay_pending(&s, &f);
        Ok(())
    })
    .await?;
    // The table as it was before this command: what each player saw then,
    // against what it sees after, is what the player is told.
    let before = campaign::veil_of(server, &folder);
    // What a command changes is told from the table as it was: a table that
    // cannot be read now is not changed by a command.
    if before.as_ref().is_some_and(|v| v.is_unreadable()) {
        return Err(failed("the table's state cannot be read now"));
    }
    // The notes whose state changed, for what the players are told, and
    // who lost which (what their devices are told).
    let mut touched: Vec<String> = Vec::new();
    let mut events: Vec<Event> = Vec::new();
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
            let (paths, released): (Vec<String>, bool) = if cmd == "campaign_release_all" {
                (vec![root_arg(&args)?], true)
            } else {
                (arg(&args, "paths")?, arg(&args, "released")?)
            };
            let audience = if released {
                Audience::Table
            } else {
                Audience::Hidden
            };
            (touched, events) = release(server, &folder, &key, paths, audience).await?;
        }
        "campaign_audience" => {
            let paths: Vec<String> = arg(&args, "paths")?;
            let given: CampaignAudience = arg(&args, "audience")?;
            let audience = match given {
                CampaignAudience::Hidden => Audience::Hidden,
                CampaignAudience::Table => Audience::Table,
                CampaignAudience::Players { accounts } if accounts.is_empty() => Audience::Hidden,
                CampaignAudience::Players { accounts } => {
                    Audience::Players(accounts.into_iter().collect())
                }
            };
            (touched, events) = release(server, &folder, &key, paths, audience).await?;
        }
        "campaign_secret_name" => {
            let path = note_arg(server, &folder, &args)?;
            let on: bool = arg(&args, "on")?;
            let (s, f, p) = (Arc::clone(server), folder.clone(), path.clone());
            blocking(move || s.db.campaign_secret_name(&f, &p, on).map_err(failed)).await?;
            touched.push(path);
        }
        "campaign_grant" => {
            let (path, lost) = grant(server, &folder, &key, &args).await?;
            touched = vec![path];
            events = lost;
        }
        "campaign_invite" => return invite(server, who, &folder, &args).await,
        _ => return Err(refused("no such command")),
    }
    // Who made, opened, closed, released, granted: in the audit log.
    let (s, actor, f) = (Arc::clone(server), who.account.id.clone(), folder.clone());
    let action = cmd.to_owned();
    let _ = blocking(move || {
        let _ = s.db.audit(&crate::db::Audit {
            actor: Some(&actor),
            action: &action,
            subject: None,
            folder: Some(&f),
            address: None,
            ok: true,
        });
        Ok(())
    })
    .await;
    // A note released to some players: their devices are told of what they
    // gained and lost, each its own (`campaign_sync`).
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
    changed(server, &folder, &key, touched, before).await;
    status(server, who, client).await
}

/// A note whose audience changed, for what the players' devices are told:
/// the players who lost it, those who gained it, and whether a set of
/// players is involved (before or after), which makes each player's log its
/// own.
#[derive(Debug, Clone)]
pub struct Event {
    pub path: String,
    pub lost: Vec<String>,
    pub gained: Vec<String>,
    pub restricted: bool,
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
    paths: Vec<String>,
    audience: Audience,
) -> Result<(Vec<String>, Vec<Event>), ContractError> {
    if paths.len() > 5000 {
        return Err(refused("too many at once"));
    }
    let (s, f, k) = (Arc::clone(server), folder.to_owned(), key.to_owned());
    blocking(move || {
        let notes = expand(&s, &k, &f, &paths)?;
        // Only players of the table: an audience of someone who is not
        // one would be a name no window can have.
        if let Audience::Players(set) = &audience {
            for n in &notes {
                let players = players_of(&s, &f, n)?;
                if set.iter().any(|a| !players.iter().any(|p| p.id == *a)) {
                    return Err(refused("not a player of this table"));
                }
            }
        }
        let before = snapshot(&s, &f, &notes);
        s.db.campaign_audience(&f, &notes, &audience)
            .map_err(failed)?;
        let events = events_of(&s, &f, before, &notes)?;
        Ok((notes, events))
    })
    .await
}

/// The audience of each of `paths` now.
fn snapshot(server: &Server, folder: &str, paths: &[String]) -> Vec<(String, Audience)> {
    let veil = campaign::veil_of(server, folder);
    paths
        .iter()
        .map(|p| {
            (
                p.clone(),
                veil.as_ref().map(|v| v.audience_of(p)).unwrap_or_default(),
            )
        })
        .collect()
}

/// What changed of `before`, after the database was changed: who lost
/// what. Only the notes whose audience moved are named.
fn events_of(
    server: &Server,
    folder: &str,
    before: Vec<(String, Audience)>,
    notes: &[String],
) -> Result<Vec<Event>, ContractError> {
    campaign::forget(server, folder);
    let after = snapshot(server, folder, notes);
    let mut out = Vec::new();
    for ((path, was), (_, is)) in before.into_iter().zip(after) {
        if was == is {
            continue;
        }
        let players: Vec<String> = players_of(server, folder, &path)?
            .into_iter()
            .map(|p| p.id)
            .collect();
        let lost = |a: &&String| was.includes(a) && !is.includes(a);
        let gained = |a: &&String| !was.includes(a) && is.includes(a);
        out.push(Event {
            restricted: was.is_players() || is.is_players(),
            lost: players.iter().filter(lost).cloned().collect(),
            gained: players.iter().filter(gained).cloned().collect(),
            path,
        });
    }
    Ok(out)
}

async fn grant(
    server: &Arc<Server>,
    folder: &str,
    key: &str,
    args: &Value,
) -> Result<(String, Vec<Event>), ContractError> {
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
        let before = snapshot(&s, &f, std::slice::from_ref(&p));
        // A note the whole group edits is the whole table's; one a player
        // edits is seen by that player (their edit grant adds them to its
        // audience, whatever it was).
        if grant == Grant::Group {
            s.db.campaign_release(&f, std::slice::from_ref(&p), true)
                .map_err(failed)?;
        }
        s.db.campaign_grant(&f, &p, &grant).map_err(failed)?;
        let events = events_of(&s, &f, before, std::slice::from_ref(&p))?;
        Ok((p, events))
    })
    .await
}

/// The players of the table that holds `path`: every account that reaches
/// the table's folder and only reads there — the readers of the folder, and
/// the readers of a share at the table's folder, above it or inside it. The
/// game masters, the owners and the editors, are never players, whatever
/// else they hold.
pub(crate) fn players_of(
    server: &Server,
    folder: &str,
    path: &str,
) -> Result<Vec<CampaignPlayer>, ContractError> {
    let veil = campaign::veil_of(server, folder).ok_or_else(|| refused("not inside a table"))?;
    let root = veil.table(path).map(|t| t.root.clone()).unwrap_or_default();
    let mut masters: HashSet<String> = HashSet::new();
    let mut players: Vec<CampaignPlayer> = Vec::new();
    let mut take = |a: crate::db::Account, r: Role| {
        if r.writes() {
            masters.insert(a.id);
        } else if !players.iter().any(|p| p.id == a.id) {
            players.push(CampaignPlayer {
                id: a.id,
                name: a.name,
            });
        }
    };
    for (a, r) in server.db.members(folder).map_err(failed)? {
        take(a, r);
    }
    for share in server.db.shares_of(folder).map_err(failed)? {
        if campaign::covers(&share.path, &root) || campaign::covers(&root, &share.path) {
            for (a, r) in server.db.share_people(&share.id).map_err(failed)? {
                take(a, r);
            }
        }
    }
    players.retain(|p| !masters.contains(&p.id));
    Ok(players)
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

fn audience_of(a: &Audience) -> CampaignAudience {
    match a {
        Audience::Hidden => CampaignAudience::Hidden,
        Audience::Table => CampaignAudience::Table,
        Audience::Players(set) => CampaignAudience::Players {
            accounts: set.iter().cloned().collect(),
        },
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
        // A table that cannot be read is not a table of the folder: the
        // window asks again, and is told nothing made up.
        if veil.is_unreadable() {
            return Err(failed("the table's state cannot be read now"));
        }
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
                    released: n.audience.any() || n.grant != Grant::None,
                    audience: audience_of(&n.audience),
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
        // A player: the tables, and the notes it may edit — only those. A
        // window on a share knows the share as a folder of its own: the
        // paths are its own, and a table above the share's folder is the
        // share's whole.
        let reads = crate::readers::reads_only(&s, &w, &c)?;
        let scope = crate::shares::scope_here(&s, &c);
        let own = |path: &str| -> Option<String> {
            match &scope {
                Some(sc) => sc.to_rel(path),
                None => Some(path.to_owned()),
            }
        };
        let tables = veil
            .tables
            .iter()
            .filter_map(|t| {
                let root = match &scope {
                    Some(sc) if campaign::covers(&t.root, &sc.root) => Some(String::new()),
                    Some(sc) => sc.to_rel(&t.root),
                    None => Some(t.root.clone()),
                }?;
                Some(CampaignTable {
                    root,
                    ..table_of(t)
                })
            })
            .collect();
        let notes = veil
            .states()
            .filter(|n| veil.may_edit(&n.path, &w.account.id))
            .filter_map(|n| {
                Some(CampaignNote {
                    path: own(&n.path)?,
                    released: true,
                    audience: if n.audience == Audience::Table {
                        CampaignAudience::Table
                    } else {
                        CampaignAudience::Players {
                            accounts: vec![w.account.id.clone()],
                        }
                    },
                    secret_name: false,
                    grant: grant_of(&n.grant),
                })
            })
            .collect();
        Ok(CampaignStatus {
            viewer: if reads { "player" } else { "none" }.to_owned(),
            tables,
            notes,
            players: Vec::new(),
            can_invite: false,
        })
    })
    .await?;
    to_value(status)
}

/// Who has access to a note (`campaign_access`): to the game master every
/// player of the note's table with what they can do; to a player, the
/// people who have access, nobody else.
async fn access(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let (folder, role) = role_here(server, client)?;
    let owner = role == Role::Owner
        && crate::shares::scope_here(server, client).is_none()
        && who.phone.is_none();
    let given: String = arg(args, "path")?;
    let (s, w, c) = (Arc::clone(server), Arc::clone(who), client.to_owned());
    let found = blocking(move || {
        let scope = crate::shares::scope_here(&s, &c);
        let path = match &scope {
            Some(sc) => sc.to_full(&given)?,
            None => given.clone(),
        };
        let veil = campaign::veil_of(&s, &folder).ok_or_else(|| refused("not inside a table"))?;
        if crate::scope::checked(&path).is_err() || !veil.in_table(&path) {
            return Err(refused("not inside a table"));
        }
        let viewer = if owner {
            "owner"
        } else {
            // A player sees who has access to a note it has access to.
            if !crate::readers::reads_only(&s, &w, &c)?
                || veil.hides_note_from(&path, &w.account.id)
            {
                return Err(ContractError {
                    kind: verso_contract::ErrorKind::NotFound,
                    message: "not found".to_owned(),
                });
            }
            "player"
        };
        let audience = veil.audience_of(&path);
        let grant = veil.grant(&path);
        let master =
            s.db.members(&folder)
                .map_err(failed)?
                .into_iter()
                .find(|(_, r)| *r == Role::Owner)
                .map(|(a, _)| if a.name.is_empty() { a.email } else { a.name })
                .unwrap_or_default();
        let mut people: Vec<CampaignPerson> = Vec::new();
        for p in players_of(&s, &folder, &path)? {
            let edits = match &grant {
                Grant::None => false,
                Grant::Group => true,
                Grant::Player(a) => *a == p.id,
            };
            let access = if edits {
                "edits"
            } else if audience.includes(&p.id) {
                "sees"
            } else {
                "none"
            };
            if viewer == "player" && access == "none" {
                continue;
            }
            let you = viewer == "player" && p.id == w.account.id;
            people.push(CampaignPerson {
                you,
                // A player is told who else has access by name; the accounts
                // of the others are the game master's to know.
                id: if viewer == "player" && !you {
                    String::new()
                } else {
                    p.id
                },
                name: p.name,
                access: access.to_owned(),
            });
        }
        Ok(CampaignAccess {
            path: given,
            viewer: viewer.to_owned(),
            audience: audience_of(&audience),
            people,
            master,
        })
    })
    .await?;
    to_value(found)
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
        Ok(CampaignInvite {
            link: crate::window_link(&s.config, &format!("/invite/{token}")),
            expires: u32::try_from(inv.expires).unwrap_or(u32::MAX),
        })
    })
    .await?;
    to_value(made)
}

/// The table's state changed: the veil is made again, what players are
/// told follows, and every window hears it. `before` is the table as it
/// was before the change: a player is told of what it gained or lost, never
/// of a note it did not see before and does not now.
pub async fn changed(
    server: &Arc<Server>,
    folder: &str,
    key: &str,
    touched: Vec<String>,
    before: Option<Arc<campaign::Veil>>,
) {
    campaign::forget(server, folder);
    let (s, f, k) = (Arc::clone(server), folder.to_owned(), key.to_owned());
    let _ = blocking(move || {
        refresh(&s, &f, &k, &touched, before);
        Ok(())
    })
    .await;
}

/// The synchronous part of [`changed`].
pub fn refresh(
    server: &Server,
    folder: &str,
    key: &str,
    touched: &[String],
    before: Option<Arc<campaign::Veil>>,
) {
    campaign::forget(server, folder);
    // A table that cannot be read now tells no one anything and sends no
    // one out; the change is told by the next one.
    if campaign::veil_to_write(server, folder, "what players are told").is_err() {
        // The rooms close all the same: an unreadable table hides every note,
        // so no player stays in a document it may no longer be in. The rest
        // is told when the table can be read.
        crate::collab::readers::veil_changed(server, key);
        server.campaigns.defer(
            folder,
            campaign::Pending::Refresh {
                key: key.to_owned(),
                touched: touched.to_vec(),
                before,
            },
        );
        return;
    }
    // A closed table keeps its players out at once.
    close_out(server, folder);
    crate::campaign_sync::refresh_readers(server, folder, key, false);
    crate::collab::readers::veil_changed(server, key);
    let ids: Vec<String> = lock(&server.clients)
        .iter()
        .filter(|(_, c)| c.folder.as_ref().is_some_and(|(f, _)| f == folder))
        .map(|(id, _)| id.clone())
        .collect();
    // The windows that may only read are players; the others — the owner
    // and any editor, the game masters — see the folder whole.
    let (players, masters) = crate::readers::split(server, &ids);
    let event =
        |paths: Value| json!({ "event": "campaign-changed", "payload": { "paths": paths } });
    server.push(&masters, &event(json!(touched)));
    let Some(after) = campaign::veil_of(server, folder) else {
        server.push(&players, &event(json!([])));
        return;
    };
    // Each player is told of the notes it now has or has lost: what one
    // player sees is not what another does, and a player who saw a note
    // neither before nor now is told nothing of it, not even that something
    // moved.
    for player in &players {
        let Some(account) = lock(&server.clients).get(player).map(|c| c.account.clone()) else {
            continue;
        };
        let (was, is) = (
            before.as_ref().map(|v| v.view(&account)),
            after.view(&account),
        );
        let seen = |v: Option<&Arc<campaign::Veil>>, p: &str| v.is_none_or(|v| !v.hides_note(p));
        let edits =
            |v: Option<&Arc<campaign::Veil>>, p: &str| v.is_some_and(|v| v.may_edit(p, &account));
        let (mut now, mut gone): (Vec<&String>, Vec<&String>) = (Vec::new(), Vec::new());
        let mut moved = touched.is_empty();
        for p in touched {
            let (b, a) = (seen(was.as_ref(), p), seen(Some(&is), p));
            if a {
                now.push(p);
            } else if b {
                gone.push(p);
            }
            moved |= a || b || edits(was.as_ref(), p) != edits(Some(&is), p);
        }
        if moved {
            server.push(std::slice::from_ref(player), &event(json!([])));
        }
        if now.is_empty() && gone.is_empty() {
            continue;
        }
        server.push(
            std::slice::from_ref(player),
            &json!({ "event": "folder-changed", "payload": {
                "key": key, "changed": now, "removed": gone, "moved": [], "listing": true,
                "index": { "indexed": 0, "unchanged": 0, "removed": 0, "placeholders": 0,
                           "problems": [], "unwatched": null, "unindexed": null } } }),
        );
    }
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

/// The paths a command that deletes, renames or moves names, which the
/// players who see them are remembered for before it runs.
fn losing(cmd: &str, args: &Value) -> Vec<String> {
    let one = |field: &str| {
        args[field]
            .as_str()
            .map(str::to_owned)
            .into_iter()
            .collect()
    };
    match cmd {
        "delete_entry" | "delete_note" | "sync_delete" => one("path"),
        "rename_entry" | "rename_note" | "sync_rename" => one("from"),
        "move_entries" => args["paths"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

/// A deletion, a rename or a move is about to run (ADR 0110 item 4, amended
/// 2026-10-23): the players who see what it names are remembered now, while
/// the files and the table's state are still there, so that the sync log
/// tells their devices the old names are gone — the notes of a folder, the
/// whole table's and the attachments their notes open too. Only a folder
/// with per-player logs needs it; the others' shared log tells everyone.
pub fn before_write(server: &Server, folder: &str, key: &str, cmd: &str, args: &Value) {
    let named = losing(cmd, args);
    if named.is_empty() || !campaign::veil_of(server, folder).is_some_and(|v| v.restricted()) {
        return;
    }
    for (path, accounts) in crate::campaign_sync::seers_under(server, folder, key, &named) {
        if let Err(e) = server.db.campaign_gone_add(folder, &path, &accounts) {
            crate::log::warn(&format!("remembering who saw a note that goes: {e}"));
        }
    }
}

/// The write `before_write` ran for did not happen: what it remembered of
/// who saw the paths is dropped, so that a later deletion is not told to a
/// player from a time the table had since left.
pub fn write_failed(server: &Server, folder: &str, cmd: &str, args: &Value) {
    for path in losing(cmd, args) {
        if let Err(e) = server.db.campaign_gone_clear(folder, &path) {
            crate::log::warn(&format!("dropping who saw a path that stayed: {e}"));
        }
    }
}

/// `result`, the write `before_write` ran for: when it failed, what was
/// remembered is dropped ([`write_failed`]).
pub fn drop_if_failed<T>(
    server: &Server,
    folder: &str,
    (cmd, args): (&str, &Value),
    result: Result<T, ContractError>,
) -> Result<T, ContractError> {
    if result.is_err() {
        write_failed(server, folder, cmd, args);
    }
    result
}

/// A device is about to delete or rename `path` (`field` of the command
/// `cmd`): [`before_write`].
pub fn device_will(
    server: &Server,
    (folder, key): (&str, &str),
    cmd: &str,
    field: &str,
    path: &str,
) {
    before_write(server, folder, key, cmd, &json!({ field: path }));
}

/// A device did: what the table keeps of the path follows ([`after_write`]).
/// `cmd` is the window's command that does the same, `field` its argument
/// naming the path, `to` where it went (empty for a deletion).
pub fn device_did(
    server: &Server,
    folder: &str,
    (cmd, field): (&str, &str),
    (path, to): (&str, &str),
) {
    let answer = if to.is_empty() {
        Value::Null
    } else {
        json!({ "path": to })
    };
    after_write(server, folder, cmd, &json!({ field: path }), &answer);
}
