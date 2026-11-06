// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Read links (ADR 0105): what a link is judged by, what it reaches, and
//! the owner's and the administrator's side of it. The public routes a
//! link opens are `crate::visit`.
//!
//! A link reaches a folder, or one note (item 2), through the same
//! [`Scope`] a share is, so that nothing outside it crosses and every path
//! is confined before `verso-fs` acts: for a folder, the folder's path is
//! the scope's root; for one note, the scope only allows the note and what
//! it embeds. A visitor is a reader
//! (ADR 0087): what it is served is the notes' projection, without a
//! secret block. The switch that turns links on is the administrator's and
//! starts off (item 3); every link is judged again by every request, so
//! that turning it off, revoking, or the expiry ends an open page at once
//! (item 5).

use std::collections::{BTreeSet, HashMap};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Path, Query};
use axum::response::Response;
use serde::Deserialize;
use serde_json::{Value, json};
use verso_service::lock;

use crate::db::{Folder, NewReadLink, ReadLink, Role, covers};
use crate::http::{ApiError, ApiResult, Ctx, ok};
use crate::scope::{Guard, Only, Scope, share_key};
use crate::state::{Outbox, Server};

/// How long a correct passphrase keeps a browser in, held in memory: the
/// server's restart asks it again.
pub const UNLOCK_LIFE: Duration = Duration::from_secs(12 * 3600);

/// How deep the notes a note embeds are followed, and how many paths a
/// link to one note reaches at most.
const EMBED_DEPTH: usize = 4;
const EMBED_MOST: usize = 300;

/// The notes counted for the warning of secrets, at most.
const COUNTED_MOST: usize = 5000;

/// The shortest passphrase a link takes.
pub const PASSPHRASE_LEAST: usize = 6;

/// What the server holds of the links open now: the connections of each,
/// to end them at once, and the browsers that proved the passphrase.
#[derive(Default)]
pub struct Open {
    conns: Mutex<HashMap<String, Vec<(String, Outbox)>>>,
    unlocks: Mutex<HashMap<Vec<u8>, (String, Instant)>>,
}

impl Open {
    pub fn add(&self, link: &str, client: &str, tx: &Outbox) {
        lock(&self.conns)
            .entry(link.to_owned())
            .or_default()
            .push((client.to_owned(), tx.clone()));
    }

    pub fn remove(&self, link: &str, client: &str) {
        let mut conns = lock(&self.conns);
        if let Some(list) = conns.get_mut(link) {
            list.retain(|(c, _)| c != client);
            if list.is_empty() {
                conns.remove(link);
            }
        }
    }

    /// The connections open on `link`.
    pub fn count(&self, link: &str) -> usize {
        lock(&self.conns).get(link).map_or(0, Vec::len)
    }

    /// `link` ended: every connection on it is told and closed, and the
    /// browsers that proved its passphrase are forgotten. How many
    /// connections were open.
    pub fn end(&self, link: &str) -> usize {
        lock(&self.unlocks).retain(|_, (l, _)| l != link);
        let gone = lock(&self.conns).remove(link).unwrap_or_default();
        let message = json!({ "gone": "link" });
        for (_, tx) in &gone {
            tx.send(&message);
        }
        gone.len()
    }

    /// Every link ended (the administrator turned them off).
    pub fn end_all(&self) {
        let links: Vec<String> = lock(&self.conns).keys().cloned().collect();
        for l in links {
            self.end(&l);
        }
        lock(&self.unlocks).clear();
    }

    /// A browser proved the passphrase of `link`: the secret it keeps.
    pub fn unlock(&self, link: &str) -> Result<String, String> {
        let secret = crate::crypto::token()?;
        let mut unlocks = lock(&self.unlocks);
        unlocks.retain(|_, (_, at)| at.elapsed() < UNLOCK_LIFE);
        crate::limit::make_room(&mut unlocks, crate::limit::PENDING, |(_, at)| *at);
        unlocks.insert(
            crate::crypto::hash(&secret),
            (link.to_owned(), Instant::now()),
        );
        Ok(secret)
    }

    /// Whether `secret` is one `link` gave a browser, still in its life.
    pub fn unlocked(&self, link: &str, secret: &str) -> bool {
        lock(&self.unlocks)
            .get(&crate::crypto::hash(secret))
            .is_some_and(|(l, at)| l == link && at.elapsed() < UNLOCK_LIFE)
    }
}

/// Whether `token` is shaped like one: what the address of a link can
/// hold, checked before the database is asked (item 5: 256 bits as
/// base64url is 43 characters; a longer word is no token).
#[must_use]
pub fn token_shaped(token: &str) -> bool {
    token.len() <= 64
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// A link that opens something now, and the folder it points into.
pub struct Live {
    pub link: ReadLink,
    pub folder: Folder,
}

/// The link a token names, when it opens anything: the feature on, the
/// link not revoked or expired. Every refusal alike: `None` (item 6: a
/// link says nothing of why it does not open).
pub fn live(server: &Server, token: &str) -> Result<Option<Live>, String> {
    if !token_shaped(token) {
        return Ok(None);
    }
    if !server.db.read_links_on()? {
        return Ok(None);
    }
    let Some(link) = server.db.read_link_by_token(token)? else {
        return Ok(None);
    };
    if !link.live(crate::db::now()) {
        return Ok(None);
    }
    let Some(folder) = server.db.folder(&link.folder)? else {
        return Ok(None);
    };
    // "This app is a server" (ADR 0117 D9, S12): a link opens what its
    // maker shared, in a folder served whole or in part — the owner's
    // (R1, 2026-11-05); the hide lock is the owner's phones' only. A folder
    // no longer served has no folder for the link to open.
    Ok(Some(Live { link, folder }))
}

/// The name a link's window shows: the note's own, without `.md`, for a
/// link to one note — never the folder's, which was not shared (ADR 0105
/// item 6); the window does not take a note named as the link's window for
/// a folder note — and for a folder link the folder's last part, never a
/// path above it. A link to the whole folder is named by the folder, which
/// was shared on purpose.
fn name_of(live: &Live) -> String {
    if live.link.path.is_empty() {
        return live.folder.dir.clone();
    }
    let last = live.link.path.rsplit('/').next().unwrap_or("");
    if live.link.kind == "note" {
        return last.strip_suffix(".md").unwrap_or(last).to_owned();
    }
    last.to_owned()
}

/// What the link reaches, as the scope every command and every file goes
/// through. A link to one note reaches the note until [`refresh`] adds
/// what it embeds.
pub fn scope_of(server: &Server, live: &Live) -> Result<Scope, String> {
    let vault = server
        .folder_path(&live.folder.dir)
        .ok_or_else(|| format!("not a folder name: {}", live.folder.dir))?;
    let share = format!("link-{}", live.link.id);
    // A note's embeds are often in an attachments folder elsewhere: the
    // scope of a link to one note is the whole folder, narrowed to the
    // paths it reaches ([`Only`]).
    let (root, only) = if live.link.kind == "note" {
        let only = Only::default();
        only.set([live.link.path.clone()]);
        (String::new(), Some(only))
    } else {
        (live.link.path.clone(), None)
    };
    Ok(Scope {
        key: share_key(&share),
        share,
        name: name_of(live),
        guard: Some(Arc::new(Guard {
            vault,
            // A whole folder has no folder to be inside of on the disk;
            // the core opens it with its links kept inside
            // (`rpc::open`, `set_links_inside`).
            disk: !root.is_empty(),
            public: true,
            only,
        })),
        root,
        mount: None,
    })
}

/// The note, and the notes and files it embeds as a reader sees them
/// (never one embedded inside a secret block), followed [`EMBED_DEPTH`]
/// deep.
fn embedded(ws: &mut verso_core::Workspace, note: &str) -> BTreeSet<String> {
    let mut seen = BTreeSet::from([note.to_owned()]);
    let mut queue = vec![(note.to_owned(), 0_usize)];
    while let Some((at, depth)) = queue.pop() {
        if depth >= EMBED_DEPTH {
            continue;
        }
        let Ok(Some(links)) = ws.reader_links(&at) else {
            continue;
        };
        for l in links.iter().filter(|l| l.embed) {
            let found = l
                .resolved
                .clone()
                .or_else(|| ws.resolve_file(&at, &l.target));
            let Some(path) = found else { continue };
            if seen.len() < EMBED_MOST && seen.insert(path.clone()) && ws.reader_names_note(&path) {
                queue.push((path, depth + 1));
            }
        }
    }
    seen
}

/// A link to one note: the paths it reaches follow the note as it is now.
/// Nothing for a link to a folder.
pub fn refresh(server: &Server, live: &Live, scope: &Scope) {
    let Some(only) = scope.guard.as_ref().and_then(|g| g.only.as_ref()) else {
        return;
    };
    let Ok(key) = crate::access::key(server, &live.folder) else {
        return;
    };
    let note = live.link.path.clone();
    if let Ok(paths) = server
        .service
        .with_key(&key, move |ws| Ok(embedded(ws, &note)))
    {
        only.set(paths);
    }
}

/// How many notes under a link's target hold something a reader is not
/// served — a secret block, or a board's secret pin (ADR 0105 item 7).
pub fn secrets_under(ws: &mut verso_core::Workspace, kind: &str, path: &str) -> usize {
    let candidates: Vec<String> = if kind == "note" {
        embedded(ws, path)
            .into_iter()
            .filter(|p| ws.reader_names_note(p))
            .collect()
    } else {
        // The index's notes (the walk's list may not have a note made a
        // moment ago), and the walk's boards.
        let mut all: BTreeSet<String> = ws.notes().unwrap_or_default().into_iter().collect();
        all.extend(
            ws.entries()
                .iter()
                .filter(|e| crate::readers::is_served(&e.path))
                .map(|e| e.path.clone()),
        );
        all.into_iter()
            .filter(|p| covers(path, p) && crate::readers::is_served(p))
            .take(COUNTED_MOST)
            .collect()
    };
    candidates
        .iter()
        .filter(|p| {
            if ws
                .file_len(p)
                .is_none_or(|len| len > crate::texts::TEXT_MOST)
            {
                return false;
            }
            ws.read_file(p).is_ok_and(|bytes| {
                ws.reader_view(p, &String::from_utf8_lossy(&bytes))
                    .is_some()
            })
        })
        .count()
}

/// What a write through the server did to the links of `folder`: a rename
/// or a move carries the links of what moved, a deletion ends the links of
/// what it deleted (as a share's, ADR 0081 item 13).
pub fn after_write(server: &Server, folder: &str, cmd: &str, args: &Value, answer: &Value) {
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
                deleted(server, folder, path);
            }
            return;
        }
        _ => return,
    }
    for (from, to) in moves {
        if let Err(e) = server.db.move_read_links(folder, &from, &to) {
            crate::log::error(&format!("carrying a read link: {e}"));
        }
    }
}

/// `path` of `folder` deleted through the server: the links to it end.
pub fn deleted(server: &Server, folder: &str, path: &str) {
    match server.db.drop_read_links_under(folder, path) {
        Ok(ids) => {
            for id in ids {
                server.links.end(&id);
            }
        }
        Err(e) => crate::log::error(&format!("ending a read link: {e}")),
    }
}

/* ---------- the owner's side ---------- */

fn link_json(server: &Server, l: &ReadLink) -> Value {
    let by = server
        .db
        .account(&l.made_by)
        .ok()
        .flatten()
        .map_or_else(|| "?".to_owned(), |a| a.name);
    json!({
        "id": l.id,
        "kind": l.kind,
        "path": l.path,
        "madeBy": by,
        "madeAt": l.made_at,
        "expires": l.expires,
        "hasPassword": l.password.is_some(),
        "lastOpened": l.last_opened,
        "open": server.links.count(&l.id),
    })
}

fn owned(ctx: &Ctx, id: &str) -> ApiResult<Folder> {
    let who = ctx.person()?;
    Ok(crate::access::at_least(&ctx.server, who, id, Role::Owner)?.0)
}

fn audit(ctx: &Ctx, action: &str, link: &ReadLink) {
    let actor = ctx.who.as_ref().map(|w| w.account.id.clone());
    let address = ctx.address();
    if let Err(e) = ctx.server.db.audit_share(
        &crate::db::Audit {
            actor: actor.as_deref(),
            action,
            subject: Some(&link.id),
            folder: Some(&link.folder),
            address: Some(&address),
            ok: true,
        },
        &link.path,
    ) {
        crate::log::error(&format!("audit log: {e}"));
    }
}

fn off(server: &Server) -> ApiError {
    ApiError::new(
        axum::http::StatusCode::FORBIDDEN,
        "read_links_off",
        if server.local.is_some() {
            // The app's own section is this server's console (ADR 0117 D9).
            "read links are turned off on this computer's server: turn them on in Settings, where it serves"
        } else {
            "read links are turned off on this server: an administrator turns them on in the console"
        },
    )
}

/// The live links of a folder, for its owner (item 5), and whether the
/// feature is on.
pub async fn list(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    let folder = owned(&ctx, &id)?;
    let links: Vec<Value> = ctx
        .server
        .db
        .read_links_of(&folder.id)?
        .iter()
        .map(|l| link_json(&ctx.server, l))
        .collect();
    Ok(ok(json!({
        "enabled": ctx.server.db.read_links_on()?,
        "links": links,
    })))
}

#[derive(Deserialize)]
pub struct Target {
    kind: String,
    #[serde(default)]
    path: String,
}

/// A link's target, checked: a folder inside the folder (or the whole
/// folder), or a note; not hidden, confined, existing.
fn target_ok(ctx: &Ctx, folder: &Folder, t: &Target) -> ApiResult<()> {
    let bad = |m: &str| ApiError::bad("bad_path", m.to_owned());
    if crate::scope::checked(&t.path).is_err() || t.path.split('/').any(|p| p.starts_with('.')) {
        return Err(bad("not a path inside this folder"));
    }
    let key = crate::access::key(&ctx.server, folder)?;
    let (path, kind) = (t.path.clone(), t.kind.clone());
    let found = ctx
        .server
        .service
        .with_key(&key, move |ws| {
            Ok(match kind.as_str() {
                "folder" => path.is_empty() || ws.is_folder(&path),
                "note" => {
                    !path.is_empty()
                        && crate::readers::is_served(&path)
                        && ws.file_len(&path).is_some()
                }
                _ => false,
            })
        })
        // The owner's window has the folder open when it makes a link; when
        // nothing does (a program, a window just closed), the disk answers,
        // through `verso-fs`, with the same confinement.
        .or_else(|_| {
            let vault = ctx
                .server
                .folder_path(&folder.dir)
                .ok_or_else(|| ApiError::from(format!("not a folder name: {}", folder.dir)))?;
            Ok::<bool, ApiError>(match t.kind.as_str() {
                "folder" => t.path.is_empty() || verso_fs::is_folder(&vault, &t.path),
                "note" => {
                    crate::readers::is_served(&t.path)
                        && verso_fs::Root::open(vault, Vec::new())
                            .ok()
                            .and_then(|mut root| {
                                let handle = root.handle(std::path::Path::new(&t.path)).ok()?;
                                root.length_and_time(handle).ok()
                            })
                            .is_some()
                }
                _ => false,
            })
        })?;
    if found {
        Ok(())
    } else {
        Err(ApiError::new(
            axum::http::StatusCode::NOT_FOUND,
            "no_target",
            "nothing there to share",
        ))
    }
}

/// How many notes under the target hold a secret block, before a link is
/// made (item 7): "N notes have secrets; readers will not see them".
pub async fn secrets(
    ctx: Ctx,
    Path(id): Path<String>,
    Query(t): Query<Target>,
) -> ApiResult<Response> {
    let folder = owned(&ctx, &id)?;
    target_ok(&ctx, &folder, &t)?;
    let key = crate::access::key(&ctx.server, &folder)?;
    let server = Arc::clone(&ctx.server);
    let (kind, path) = (t.kind.clone(), t.path.clone());
    let count = tokio::task::spawn_blocking(move || {
        server
            .service
            .with_key(&key, move |ws| Ok(secrets_under(ws, &kind, &path)))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| ApiError::from(e.message))?;
    Ok(ok(json!({ "notes": count })))
}

#[derive(Deserialize)]
pub struct Make {
    kind: String,
    #[serde(default)]
    path: String,
    /// 1, 7 or 30 days from now.
    #[serde(default, rename = "expiresDays")]
    expires_days: Option<i64>,
    /// A date, in seconds since the epoch.
    #[serde(default, rename = "expiresAt")]
    expires_at: Option<i64>,
    #[serde(default)]
    password: Option<String>,
}

/// The owner makes a read link (item 3); the token is in this answer and
/// nowhere else, ever (item 5).
pub async fn make(ctx: Ctx, Path(id): Path<String>, Json(body): Json<Make>) -> ApiResult<Response> {
    ctx.changes()?;
    // A power given to whoever holds an address: proved again first (ADR
    // 0083 item 6).
    ctx.proved()?;
    let folder = owned(&ctx, &id)?;
    if !ctx.server.db.read_links_on()? {
        return Err(off(&ctx.server));
    }
    // "This app is a server": links are the owner's, made from the app's
    // window at the table (ADR 0117 D9, S12); an invited account owns no
    // folder here, and none makes one.
    if ctx.server.local.is_some() && !crate::db::is_this_computer(&ctx.person()?.account.email) {
        return Err(ApiError::forbidden("read links are the owner's here"));
    }
    target_ok(
        &ctx,
        &folder,
        &Target {
            kind: body.kind.clone(),
            path: body.path.clone(),
        },
    )?;
    let at = crate::db::now();
    let expires = match (body.expires_days, body.expires_at) {
        (Some(_), Some(_)) => {
            return Err(ApiError::bad(
                "bad_request",
                "an expiry in days or a date, not both",
            ));
        }
        (Some(d @ (1 | 7 | 30)), None) => Some(at + d * 86_400),
        (Some(_), None) => {
            return Err(ApiError::bad(
                "bad_request",
                "an expiry of 1, 7 or 30 days, or a date",
            ));
        }
        (None, Some(x)) if x > at && x < at + 10 * 365 * 86_400 => Some(x),
        (None, Some(_)) => {
            return Err(ApiError::bad("bad_request", "a date in the future"));
        }
        (None, None) => None,
    };
    let password = body.password.as_deref().filter(|p| !p.is_empty());
    if let Some(p) = password
        && !(PASSPHRASE_LEAST..=200).contains(&p.chars().count())
    {
        return Err(ApiError::bad(
            "bad_passphrase",
            format!("a passphrase of {PASSPHRASE_LEAST} to 200 characters"),
        ));
    }
    let server = Arc::clone(&ctx.server);
    let (folder_id, kind, path, by) = (
        folder.id.clone(),
        body.kind.clone(),
        body.path.clone(),
        ctx.person()?.account.id.clone(),
    );
    let password = password.map(str::to_owned);
    let (token, link) = ctx
        .server
        .hashes
        .run(move || {
            server.db.make_read_link(&NewReadLink {
                folder: &folder_id,
                kind: &kind,
                path: &path,
                made_by: &by,
                expires,
                password: password.as_deref(),
            })
        })
        .await??;
    audit(&ctx, "read_link_made", &link);
    Ok(ok(json!({
        "token": token,
        "path": format!("/r/{token}"),
        "link": link_json(&ctx.server, &link),
    })))
}

/// The owner revokes a link: it ends at once, open pages included.
pub async fn revoke(ctx: Ctx, Path((id, link)): Path<(String, String)>) -> ApiResult<Response> {
    ctx.changes()?;
    let folder = owned(&ctx, &id)?;
    let found = ctx
        .server
        .db
        .read_link(&link)?
        .filter(|l| l.folder == folder.id)
        .ok_or_else(ApiError::not_found)?;
    ctx.server.db.revoke_read_link(&found.id)?;
    let open = ctx.server.links.end(&found.id);
    audit(&ctx, "read_link_revoked", &found);
    Ok(ok(json!({ "revoked": found.id, "closed": open })))
}

/* ---------- the administrator's side ---------- */

/// Whether links are on, for the console.
pub async fn switch(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    Ok(ok(json!({
        "enabled": ctx.server.db.read_links_on()?,
        "live": ctx.server.db.live_read_link_ids()?.len(),
    })))
}

#[derive(Deserialize)]
pub struct Switch {
    enabled: bool,
}

/// The administrator turns links on or off for the server (item 3). Off
/// ends every link at once, open pages included; the links themselves are
/// kept, and open again if it is turned on.
pub async fn set_switch(ctx: Ctx, Json(body): Json<Switch>) -> ApiResult<Response> {
    ctx.changes()?;
    ctx.proved()?;
    let admin = ctx.admin()?.account.id.clone();
    let address = ctx.address();
    let by = crate::admin::acts::By {
        actor: Some(&admin),
        address: Some(&address),
    };
    turn(&ctx.server.db, Some(&ctx.server.links), body.enabled, &by)?;
    Ok(ok(json!({ "enabled": body.enabled })))
}

/// Read links on or off for the whole server (item 3), the act of the
/// console's switch and of the app's section where it serves (ADR 0117
/// D9): off ends every open link at once (`open`, the running server's;
/// none while the app does not serve), the links kept to open again when
/// it is turned on. In the audit, on behalf of `by`.
pub fn turn(
    db: &crate::db::Db,
    open: Option<&Open>,
    on: bool,
    by: &crate::admin::acts::By<'_>,
) -> Result<(), String> {
    db.set_read_links_on(on)?;
    if !on && let Some(open) = open {
        open.end_all();
    }
    by.audit(
        db,
        if on {
            "read_links_on"
        } else {
            "read_links_off"
        },
        None,
        None,
    );
    Ok(())
}
