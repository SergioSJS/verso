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

use crate::access::{Action, Door, Kind, Right};
use crate::auth::Who;
use crate::campaign;
use crate::db::{Audience, Grant, Role};
use crate::rpc::{arg, blocking, to_value};
use crate::state::Server;

/// What the commands of a table's game master are.
pub const COMMANDS: [&str; 14] = [
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
    // ADR 0113: the one model's commands.
    "access_get",
    "access_set",
    "table_rights_set",
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
/// folder itself, with a credential that writes, not a phone — the rules'
/// `ManageTable` and `ManageAccess` (ADR 0113 section B), one condition.
fn game_master(
    server: &Server,
    who: &Who,
    client: &str,
    action: Action,
) -> Result<(String, String), ContractError> {
    let door = Door::of(server, who, client)?;
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    if !door.may(action, "", Kind::Folder).allowed() {
        return Err(refused("only the folder's owner runs its table"));
    }
    Ok((door.folder, key))
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
    if cmd == "access_get" {
        return crate::access_cmds::get(server, who, client, &args).await;
    }
    if cmd == "access_set" {
        return crate::access_cmds::set(server, who, client, &args).await;
    }
    // Who changes who sees and edits (the access of a path) and who runs the
    // table (open, close, limits, rights) is one: the folder's owner.
    let action = if matches!(
        cmd,
        "campaign_release"
            | "campaign_release_all"
            | "campaign_audience"
            | "campaign_secret_name"
            | "campaign_grant"
    ) {
        Action::ManageAccess
    } else {
        Action::ManageTable
    };
    let (folder, key) = game_master(server, who, client, action)?;
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
    // Whom the command was about, for the audit log.
    let mut subject: Option<String> = None;
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
        "table_rights_set" => {
            // One of the four rights of a player (ADR 0113 K.6): `images`,
            // `files`, `create_notes`, `create_boards`.
            let word: String = arg(&args, "right")?;
            let Some(right) = crate::access::Right::parse(&word) else {
                return Err(refused("no such right"));
            };
            let given = json!({
                "root": args["root"], "accounts": args["accounts"], "on": args["on"],
            });
            subject = Some(permission(server, &folder, &given, right).await?);
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
            subject: subject.as_deref(),
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
    // A table opened: the players waiting outside hear it at once, not at
    // their next try.
    if cmd == "campaign_settings" && args["open"] == true {
        let root: String = arg(&args, "root")?;
        opened(server, &folder, &root, &who.account.id).await;
    }
    status(server, who, client).await
}

/// The table at `root` of `folder` was opened by `owner`: every other
/// member's signed-in windows are told, and those of the people on a share
/// that reaches the table (a share inside the table, the table's own, or
/// one over it — never another subfolder's), which is what a player shut
/// out by a closed table waits for (their window tries to enter again on
/// it). The message names the id the person opens (the folder's, or the
/// share's) and nothing else.
async fn opened(server: &Arc<Server>, folder: &str, root: &str, owner: &str) {
    let (s, f, r) = (Arc::clone(server), folder.to_owned(), root.to_owned());
    let (members, shared) = blocking(move || {
        let members = s.db.members(&f).map_err(failed)?;
        let mut shared = Vec::new();
        for share in s.db.shares_of(&f).map_err(failed)? {
            // A share inside the table, the table's own, or one over it,
            // compared as the veil compares paths (`campaign::covers`).
            if campaign::covers(&r, &share.path) || campaign::covers(&share.path, &r) {
                for (account, _) in s.db.share_people(&share.id).map_err(failed)? {
                    shared.push((account.id, share.id.clone()));
                }
            }
        }
        Ok((members, shared))
    })
    .await
    .unwrap_or_default();
    let told = |id: &str| json!({ "event": "table-opened", "payload": { "folder": id } });
    for (account, _) in members.iter().filter(|(a, _)| a.id != owner) {
        server.push_sessions(&account.id, &told(folder));
    }
    for (account, share) in shared.iter().filter(|(a, _)| a != owner) {
        server.push_sessions(account, &told(share));
    }
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

/// A right of the table, given to some of its players or taken from them
/// (ADR 0107 item 3 as amended 2026-10-24, ADR 0113 K.6). Only the table's
/// players: the game masters always may. Told at once to the windows
/// concerned. Answers whom it was about, for the audit log:
/// `<right>:on:<accounts>` or `<right>:off:<accounts>`.
async fn permission(
    server: &Arc<Server>,
    folder: &str,
    args: &Value,
    right: crate::access::Right,
) -> Result<String, ContractError> {
    let root = root_arg(args)?;
    let accounts: Vec<String> = arg(args, "accounts")?;
    let images: bool = arg(args, "on")?;
    if accounts.is_empty() || accounts.len() > 500 {
        return Err(refused("name between 1 and 500 players"));
    }
    let (s, f) = (Arc::clone(server), folder.to_owned());
    let (r, a) = (root.clone(), accounts.clone());
    blocking(move || {
        if !s
            .db
            .campaigns_of(&f)
            .map_err(failed)?
            .iter()
            .any(|t| t.root == r)
        {
            return Err(refused("that folder is not a table"));
        }
        let players = players_in(&s, &f, &r)?;
        if !a.iter().all(|x| players.iter().any(|p| &p.id == x)) {
            return Err(refused("not a player of this table"));
        }
        s.db.campaign_right_set(&f, &r, &a, right, images)
            .map_err(failed)?;
        crate::table::tell_images(&s, (&f, &r), &a);
        Ok(())
    })
    .await?;
    Ok(format!(
        "{}:{}:{}",
        right.as_str(),
        if images { "on" } else { "off" },
        accounts.join(",")
    ))
}

/// The notes (paths of the folder) `paths` name: a folder stands for the
/// notes under it. Only those inside a table.
pub(crate) fn expand(
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
    // A board a player edits is edited by element, in a room of its own
    // (ADR 0113 H): never written whole, so the locks of the cards of hidden
    // notes never reach the file.
    if !crate::readers::is_note(&path) && !crate::readers::is_board(&path) {
        return Err(refused("only a note or a board can be edited by players"));
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
/// the table's folder and is not its owner — the readers and the editors of
/// the folder, and the people of a share at the table's folder, above it or
/// inside it. The folder's owner, the game master, is never one, whatever
/// else it holds; an editor is a player who edits every file they see
/// (ADR 0113 item 3, K.1).
pub(crate) fn players_of(
    server: &Server,
    folder: &str,
    path: &str,
) -> Result<Vec<CampaignPlayer>, ContractError> {
    let veil = campaign::veil_of(server, folder).ok_or_else(|| refused("not inside a table"))?;
    let root = veil.table(path).map(|t| t.root.clone()).unwrap_or_default();
    players_in(server, folder, &root)
}

/// The players of the table rooted at `root` (see [`players_of`]).
pub(crate) fn players_in(
    server: &Server,
    folder: &str,
    root: &str,
) -> Result<Vec<CampaignPlayer>, ContractError> {
    Ok(seats_in(server, folder, root)?
        .into_iter()
        .map(|(p, _)| p)
        .collect())
}

/// The players of the table rooted at `root`, each with whether the folder
/// or a share gives them the role of an editor.
pub(crate) fn seats_in(
    server: &Server,
    folder: &str,
    root: &str,
) -> Result<Vec<(CampaignPlayer, bool)>, ContractError> {
    let mut masters: HashSet<String> = HashSet::new();
    let mut players: Vec<(CampaignPlayer, bool)> = Vec::new();
    let mut take = |a: crate::db::Account, r: Role| {
        if r == Role::Owner {
            masters.insert(a.id);
        } else if let Some(p) = players.iter_mut().find(|p| p.0.id == a.id) {
            // The highest covering grant (0081 item 14).
            p.1 |= r == Role::Editor;
        } else {
            players.push((
                CampaignPlayer {
                    id: a.id,
                    name: a.name,
                    roots: Vec::new(),
                },
                r == Role::Editor,
            ));
        }
    };
    for (a, r) in server.db.members(folder).map_err(failed)? {
        take(a, r);
    }
    for share in server.db.shares_of(folder).map_err(failed)? {
        if campaign::covers(&share.path, root) || campaign::covers(root, &share.path) {
            for (a, r) in server.db.share_people(&share.id).map_err(failed)? {
                take(a, r);
            }
        }
    }
    players.retain(|p| !masters.contains(&p.0.id));
    Ok(players)
}

/// A table as the contract has it.
fn table_of(t: &crate::db::Campaign) -> CampaignTable {
    CampaignTable {
        root: t.root.clone(),
        open: t.open,
        log_max: u32::try_from(t.log_max).unwrap_or(u32::MAX),
        image_max: u32::try_from(t.image_max).unwrap_or(u32::MAX),
        image_players: Vec::new(),
        file_players: Vec::new(),
        note_players: Vec::new(),
        board_players: Vec::new(),
        images: true,
        files: true,
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
    let door = Door::of(server, who, client)?;
    let folder = door.folder.clone();
    // The game master's view: the folder's owner, whatever the ceiling of
    // its credential (ADR 0113 item 6); a phone runs no table.
    let owner = door.seat() == crate::access::Seat::Master && !door.asker.phone;
    let (s, w) = (Arc::clone(server), Arc::clone(who));
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
            // A folder's editor edits every file they see (ADR 0113 K.1).
            let mut editors: HashSet<String> = HashSet::new();
            for t in &veil.tables {
                for (p, editor) in seats_in(&s, &folder, &t.root)? {
                    if editor {
                        editors.insert(p.id.clone());
                    }
                    match players.iter_mut().find(|q| q.id == p.id) {
                        Some(q) => q.roots.push(t.root.clone()),
                        None => players.push(CampaignPlayer {
                            roots: vec![t.root.clone()],
                            ..p
                        }),
                    }
                }
            }
            let mut notes: Vec<CampaignNote> = veil
                .states()
                .map(|n| {
                    // Who sees and who edits it, each by what the rules give
                    // them: the audience and the grant cannot say a player
                    // who falls below the whole table's row.
                    let sees: Vec<String> = players
                        .iter()
                        .filter(|p| veil.view(&p.id).released(&n.path))
                        .map(|p| p.id.clone())
                        .collect();
                    let edits: Vec<String> = sees
                        .iter()
                        .filter(|id| editors.contains(*id) || veil.may_edit(&n.path, id))
                        .cloned()
                        .collect();
                    CampaignNote {
                        path: n.path.clone(),
                        released: n.audience.any() || n.grant != Grant::None,
                        audience: audience_of(&n.audience),
                        secret_name: n.secret_name,
                        grant: grant_of(&n.grant),
                        sees,
                        edits,
                    }
                })
                .collect();
            notes.sort_by(|a, b| a.path.cmp(&b.path));
            return Ok(CampaignStatus {
                viewer: "owner".to_owned(),
                tables: veil
                    .tables
                    .iter()
                    .map(|t| {
                        let who = |right| {
                            s.db.campaign_right_players(&folder, &t.root, right)
                                .unwrap_or_default()
                        };
                        CampaignTable {
                            image_players: who(Right::Images),
                            file_players: who(Right::Files),
                            note_players: who(Right::CreatesNotes),
                            board_players: who(Right::CreatesBoards),
                            ..table_of(t)
                        }
                    })
                    .collect(),
                notes,
                players,
                can_invite: w.account.admin,
            });
        }
        // A player: the tables, and the notes it may edit — only those. A
        // window on a share knows the share as a folder of its own: the
        // paths are its own, and a table above the share's folder is the
        // share's whole.
        let reads = door.veiled();
        let scope = door.scope.clone();
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
                    images: door
                        .may(Action::SendFile { image: true }, &t.root, Kind::Table)
                        .allowed(),
                    files: door
                        .may(Action::SendFile { image: false }, &t.root, Kind::Table)
                        .allowed(),
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
                    sees: Vec::new(),
                    edits: Vec::new(),
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
    let door = Door::of(server, who, client)?;
    let folder = door.folder.clone();
    // The game master's own phone is the game master, and may read who has
    // access (ADR 0113 item 6); changing it is `game_master`'s.
    let owner = door.seat() == crate::access::Seat::Master;
    let given: String = arg(args, "path")?;
    let (s, w) = (Arc::clone(server), Arc::clone(who));
    let found = blocking(move || {
        let scope = door.scope.clone();
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
            if !door.veiled() || veil.hides_note_from(&path, &w.account.id) {
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
    // The table's music is told again: who sees the track may have changed
    // (ADR 0116 item 9).
    crate::table_sound::retell(server, folder);
    let ids: Vec<String> = lock(&server.clients)
        .iter()
        .filter(|(_, c)| c.folder.as_ref().is_some_and(|(f, _)| f == folder))
        .map(|(id, _)| id.clone())
        .collect();
    // The windows that may only read are players; the others — the owner
    // and any editor, the game masters — see the folder whole.
    let (players, masters) = crate::readers::split(server, &ids);
    // `access-changed` (ADR 0113 section C) is told beside `campaign-changed`
    // until the window has moved off the latter: the same windows, the same
    // paths.
    let event = |paths: Value| {
        json!([
            { "event": "campaign-changed", "payload": { "paths": paths } },
            { "event": "access-changed", "payload": { "paths": paths } },
        ])
    };
    let push = |to: &[String], paths: Value| {
        if let Some(both) = event(paths).as_array() {
            for e in both {
                server.push(to, e);
            }
        }
    };
    push(&masters, json!(touched));
    let Some(after) = campaign::veil_of(server, folder) else {
        push(&players, json!([]));
        return;
    };
    // Each player is told of the notes it now has or has lost: what one
    // player sees is not what another does, and a player who saw a note
    // neither before nor now is told nothing of it, not even that something
    // moved.
    for player in &players {
        let Some((account, editor)) = lock(&server.clients).get(player).map(|c| {
            (
                c.account.clone(),
                c.folder.as_ref().is_some_and(|(_, r)| *r == Role::Editor),
            )
        }) else {
            continue;
        };
        let (was, is) = (
            before.as_ref().map(|v| v.view(&account)),
            after.view(&account),
        );
        let seen = |v: Option<&Arc<campaign::Veil>>, p: &str| v.is_none_or(|v| !v.hides_note(p));
        // An editor of the folder edits every note they see (ADR 0113 K.1).
        let edits = |v: Option<&Arc<campaign::Veil>>, p: &str| {
            v.is_some_and(|v| v.may_edit(p, &account) || (editor && !v.hides_note(p)))
        };
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
            push(std::slice::from_ref(player), json!([]));
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
            let Some((f, _)) = c.folder.clone() else {
                continue;
            };
            // The game master enters any table, open or not.
            if f != folder || crate::access::asker_of(c).seat() == crate::access::Seat::Master {
                continue;
            }
            let root = c.scope.as_ref().map_or("", |s| s.root.as_str()).to_owned();
            if campaign::closed_for(server, folder, &root, true) {
                c.folder = None;
                c.scope = None;
                c.tx.send(&json!({ "gone": "folder", "reason": "closed" }));
                gone.push(id.clone());
            }
        }
    }
    server.left(&gone);
}

/// A window's rename or move (`cmd`), run in the folder's session with what
/// the table keeps of what moved carried along ([`after_write`]) before the
/// session is let go: every read of the folder waits for the session, a
/// player's too, so none finds a moved file under its new folder's access
/// before its own has followed it (ADR 0113 K.2). Until 2026-11-05 the
/// table followed only after the session was free, and a player asking
/// then read a hidden note moved into a folder it sees (the audit's
/// `tests_access_gaps`). Any other command runs as the service runs it.
pub fn carrying(
    server: &Server,
    (service, client): (&verso_service::Service, &str),
    folder: &str,
    cmd: &str,
    args: Value,
) -> Result<Value, ContractError> {
    if !matches!(cmd, "rename_note" | "rename_entry" | "move_entries") {
        return service
            .dispatch(client, cmd, args)
            .unwrap_or_else(|| Err(refused("no such command")));
    }
    let asked = args.clone();
    service.with(client, |ws| {
        let answer = verso_service::ops::dispatch(ws, cmd, args)
            .unwrap_or_else(|| Err(verso_service::OpError::Contract(refused("no such command"))))?;
        after_write(server, folder, cmd, &asked, &answer);
        Ok(answer)
    })
}

/// A rename, a move or a deletion made through the server carries what the
/// table keeps about the notes (ADR 0110 item 4): the state follows the
/// note, and goes with it.
pub fn after_write(server: &Server, folder: &str, cmd: &str, args: &Value, answer: &Value) {
    let Some(before) = campaign::veil_of(server, folder) else {
        return;
    };
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
                // Into the bin, what the file kept at the table goes with
                // it, for a restore to give back (`Db::campaign_binned`).
                if let Some(bin) = answer["path"].as_str().filter(|b| crate::trash::in_bin(b)) {
                    touched = server.db.campaign_binned(folder, path, bin).unwrap_or(0) > 0;
                    // One that followed its folder takes along what it
                    // followed, as a move does (K.2): restored alone, its
                    // folder may be gone, or another's.
                    if let Some(set) = before.inherited_set(path) {
                        match server.db.access_put(folder, bin, set) {
                            Ok(()) => touched = true,
                            Err(e) => {
                                crate::log::warn(&format!("keeping a deleted file's access: {e}"))
                            }
                        }
                    }
                }
                touched |= server.db.campaign_deleted(folder, path).unwrap_or(0) > 0;
            }
        }
        _ => {}
    }
    // A file moved keeps the access it had (ADR 0113 K.2): one that had a
    // set of its own takes it along with its path; one that followed its
    // folder takes along what it followed, as a set of its own, so that a
    // move never changes who sees it. `before` is the table as it was.
    let carried: Vec<(String, crate::access::NodeSet)> = moves
        .iter()
        .filter_map(|(from, to)| Some((to.clone(), before.inherited_set(from)?)))
        .collect();
    for (from, to) in moves {
        touched |= server.db.campaign_move(folder, &from, &to).unwrap_or(0) > 0;
    }
    if touched || !carried.is_empty() {
        campaign::forget(server, folder);
    }
    if !carried.is_empty()
        && let Some(after) = campaign::veil_of(server, folder)
    {
        let mut changed = false;
        for (to, set) in carried {
            if after.in_table(&to) && after.effective_set(&to) != set {
                match server.db.access_put(folder, &to, set) {
                    Ok(()) => changed = true,
                    Err(e) => crate::log::warn(&format!("keeping the access of a moved file: {e}")),
                }
            }
        }
        if changed {
            campaign::forget(server, folder);
        }
    }
}

/// The version of `path` a device's write replaced went into the bin at
/// `bin` (ADR 0080 item 12): it keeps the access `path` has, its own or
/// the one it follows, for a restore beside the file to give back — a
/// restore is a move (item 5), and a move keeps a file's access (ADR 0113
/// K.2). Without it the version came back as a new file of its folder.
pub fn version_kept(server: &Server, folder: &str, path: &str, bin: &str) {
    let Some(veil) = campaign::veil_of(server, folder) else {
        return;
    };
    if !veil.in_table(path) {
        return;
    }
    if let Err(e) = server.db.access_put(folder, bin, veil.effective_set(path)) {
        crate::log::warn(&format!("keeping a replaced version's access: {e}"));
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
/// naming the path, `to` where it went (for a deletion, its place in the
/// bin, or empty).
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
