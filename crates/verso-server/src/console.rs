// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The administration console's API (ADR 0077): every list searched,
//! sorted and paged here; an account's and a folder's own page; a folder's
//! quota; the overview; the configuration in effect, read only. Admins
//! only, never through a token (`Ctx::admin`).

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::db::{self, AuditFilter, PageQuery};
use crate::http::{ApiError, ApiResult, Ctx, ok};

/// How many of a folder's latest changes its page shows.
const LATEST_CHANGES: i64 = 50;

/// What a list is asked with.
#[derive(Debug, Default, Deserialize)]
pub struct List {
    q: Option<String>,
    sort: Option<String>,
    desc: Option<bool>,
    offset: Option<i64>,
    limit: Option<i64>,
    state: Option<String>,
    actor: Option<String>,
    action: Option<String>,
    folder: Option<String>,
    from: Option<i64>,
    to: Option<i64>,
    format: Option<String>,
}

impl List {
    fn page(&self) -> PageQuery {
        PageQuery {
            q: self.q.clone().unwrap_or_default(),
            sort: self.sort.clone().unwrap_or_default(),
            desc: self.desc.unwrap_or(false),
            offset: self.offset.unwrap_or(0).max(0),
            limit: self.limit.unwrap_or(0),
        }
    }
}

pub async fn accounts(ctx: Ctx, Query(list): Query<List>) -> ApiResult<Response> {
    ctx.admin()?;
    Ok(ok(ctx.server.db.page_accounts(&list.page())?))
}

/// One account: what it owns and belongs to, its sessions and its tokens.
pub async fn account(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.admin()?;
    let db = &ctx.server.db;
    let account = db.account(&id)?.ok_or_else(ApiError::not_found)?;
    let folders: Vec<Value> = db
        .folders_of(&id)?
        .into_iter()
        .map(|(f, role)| {
            json!({ "id": f.id, "name": f.dir, "role": role, "space": crate::folders::space(&ctx, &f.id) })
        })
        .collect();
    Ok(ok(json!({
        "account": crate::api::account_json(&account),
        "created": account.created,
        "password": account.password.is_some(),
        "folders": folders,
        "sessions": db.sessions_of(&id)?,
        "tokens": db.tokens_of(&id)?,
    })))
}

pub async fn folders(ctx: Ctx, Query(list): Query<List>) -> ApiResult<Response> {
    ctx.admin()?;
    Ok(ok(ctx.server.db.page_folders(&list.page())?))
}

/// Directories under the folders root that no folder is registered for.
pub async fn unregistered(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    let root = ctx.server.config.folders_dir.clone();
    let dirs = tokio::task::spawn_blocking(move || verso_fs::server::folders_under(&root))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("listing VERSO_FOLDERS_DIR: {e}"))?;
    let known: std::collections::HashSet<String> = ctx
        .server
        .db
        .folders()?
        .into_iter()
        .map(|f| f.dir)
        .collect();
    let loose: Vec<String> = dirs.into_iter().filter(|d| !known.contains(d)).collect();
    Ok(ok(loose))
}

/// One folder: its members, what it takes, its quota, the files its last
/// walk held as another's name in another form (`crate::twins`) or left out
/// for their size (`crate::large`), and its
/// latest changes with who made each — the account and, for a device's
/// sync, the device (ADR 0079 item 4).
pub async fn folder(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.admin()?;
    let db = &ctx.server.db;
    let folder = db.folder(&id)?.ok_or_else(ApiError::not_found)?;
    let members: Vec<Value> = db
        .members(&id)?
        .into_iter()
        .map(|(a, role)| json!({ "id": a.id, "name": a.name, "email": a.email, "role": role }))
        .collect();
    let mut shares: Vec<Value> = Vec::new();
    for share in db.shares_of(&id)? {
        let people: Vec<Value> = db
            .share_people(&share.id)?
            .into_iter()
            .map(|(a, role)| json!({ "id": a.id, "name": a.name, "email": a.email, "role": role }))
            .collect();
        shares.push(json!({
            "id": share.id, "path": share.path, "attachments": share.attachments, "people": people,
        }));
    }
    let mut emails: HashMap<String, String> = HashMap::new();
    let mut changes: Vec<Value> = Vec::new();
    for c in db.latest_changes(&id, LATEST_CHANGES)? {
        let who = match &c.actor {
            Some(actor) => {
                if !emails.contains_key(actor)
                    && let Some(a) = db.account(actor)?
                {
                    emails.insert(actor.clone(), a.email);
                }
                Some(emails.get(actor).cloned().unwrap_or_else(|| actor.clone()))
            }
            None => None,
        };
        changes.push(json!({
            "seq": c.seq, "at": c.at, "path": c.path, "deleted": c.deleted,
            "renamedFrom": c.renamed_from, "who": who, "device": c.device,
        }));
    }
    // The bin (ADR 0080 items 4 and 8): walked off the event loop.
    let trash = {
        let s = std::sync::Arc::clone(&ctx.server);
        let f = id.clone();
        tokio::task::spawn_blocking(move || crate::trash::console_view(&s, &f))
            .await
            .map_err(|e| e.to_string())??
    };
    // The version history (ADR 0091 items 3 and 7): shown, not counted.
    let history = {
        let s = std::sync::Arc::clone(&ctx.server);
        let f = id.clone();
        tokio::task::spawn_blocking(move || crate::history::console_view(&s, &f))
            .await
            .map_err(|e| e.to_string())??
    };
    Ok(ok(json!({
        "id": folder.id,
        "name": folder.dir,
        "created": folder.created,
        "trash": trash,
        "history": history,
        "members": members,
        // Its shares by path, with their people (ADR 0081 item 7).
        "shares": shares,
        "space": crate::folders::space(&ctx, &id),
        "quota": db.quota(&id)?,
        "twins": crate::twins::of_folder(&ctx.server, &id),
        "tooLarge": ctx.server.transfers.large.of_folder(&id),
        "changes": changes,
    })))
}

#[derive(Deserialize)]
pub struct SetQuota {
    /// Bytes, a size such as "10GB", or null for none.
    quota: Value,
}

/// A folder's quota, set by an admin (ADR 0077 item 5), in the log.
pub async fn set_quota(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<SetQuota>,
) -> ApiResult<Response> {
    ctx.changes()?;
    ctx.admin()?;
    let db = &ctx.server.db;
    db.folder(&id)?.ok_or_else(ApiError::not_found)?;
    let bytes = match &body.quota {
        Value::Null => None,
        Value::Number(n) => Some(n.as_i64().filter(|b| *b > 0).ok_or_else(bad_size)?),
        Value::String(s) if s.trim().is_empty() => None,
        Value::String(s) => Some(crate::config::size(s).ok_or_else(bad_size)?),
        _ => return Err(bad_size()),
    };
    db.set_quota(&id, bytes)?;
    ctx.audit(
        "folder_quota",
        Some(&bytes.map_or_else(|| "none".to_owned(), |b| b.to_string())),
        Some(&id),
        true,
    );
    Ok(ok(json!({ "quota": bytes })))
}

#[derive(Deserialize)]
pub struct SetTrash {
    /// Days the folder's bin keeps deleted files, 0 for ever, or null for
    /// the server's default (`VERSO_TRASH_DAYS`).
    days: Option<u32>,
}

/// How long a folder's bin keeps deleted files, set by an admin (ADR 0080
/// item 3): the admin lengthens it or turns expiry off; an owner's shorter
/// choice stays under it. In the log; what is past the new time goes now.
pub async fn set_trash(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<SetTrash>,
) -> ApiResult<Response> {
    ctx.changes()?;
    ctx.admin()?;
    let db = &ctx.server.db;
    db.folder(&id)?.ok_or_else(ApiError::not_found)?;
    if body.days.is_some_and(|d| d > 36_500) {
        return Err(ApiError::bad(
            "bad_days",
            "a number of days, 0 for ever, or none",
        ));
    }
    db.set_trash_days(&id, body.days)?;
    // An owner's choice the admin's new days no longer bound is kept only
    // while it is shorter.
    if let (_, Some(owner)) = db.trash_days(&id)? {
        let admin = body.days.unwrap_or(ctx.server.config.trash_days);
        if admin != 0 && owner >= admin {
            db.set_trash_owner_days(&id, None)?;
        }
    }
    ctx.audit(
        "trash_days",
        Some(
            &body
                .days
                .map_or_else(|| "default".to_owned(), |d| d.to_string()),
        ),
        Some(&id),
        true,
    );
    let s = std::sync::Arc::clone(&ctx.server);
    let f = id.clone();
    let view = tokio::task::spawn_blocking(move || {
        crate::trash::sweep(&s, &f);
        crate::trash::console_view(&s, &f)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(ok(view))
}

#[derive(Deserialize)]
pub struct SetHistory {
    /// Days the folder's history keeps versions, 0 for no limit, or null
    /// for the server's default (`VERSO_HISTORY_DAYS`).
    days: Option<u32>,
}

/// How long a folder's history keeps versions, set by an admin (ADR 0091
/// item 3, "set per folder in the console as the trash's is"), in the log;
/// what is past the new time goes now.
pub async fn set_history(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<SetHistory>,
) -> ApiResult<Response> {
    ctx.changes()?;
    ctx.admin()?;
    ctx.server.db.folder(&id)?.ok_or_else(ApiError::not_found)?;
    if body.days.is_some_and(|d| d > 36_500) {
        return Err(ApiError::bad(
            "bad_days",
            "a number of days, 0 for no limit, or none",
        ));
    }
    ctx.audit(
        "history_days",
        Some(
            &body
                .days
                .map_or_else(|| "default".to_owned(), |d| d.to_string()),
        ),
        Some(&id),
        true,
    );
    let s = std::sync::Arc::clone(&ctx.server);
    let f = id.clone();
    let view =
        tokio::task::spawn_blocking(move || crate::history::set_from_console(&s, &f, body.days))
            .await
            .map_err(|e| e.to_string())??;
    Ok(ok(view))
}

/// Empty a folder's bin from the console (ADR 0080 item 4), in the log.
pub async fn empty_trash(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    ctx.admin()?;
    ctx.server.db.folder(&id)?.ok_or_else(ApiError::not_found)?;
    let actor = ctx.who()?.account.id.clone();
    let s = std::sync::Arc::clone(&ctx.server);
    let f = id.clone();
    let view = tokio::task::spawn_blocking(move || {
        crate::trash::empty_from_console(&s, &f, &actor)?;
        crate::trash::console_view(&s, &f)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(ok(view))
}

fn bad_size() -> ApiError {
    ApiError::bad("bad_size", "a size such as 500MB or 10GB, or none")
}

pub async fn invitations(ctx: Ctx, Query(list): Query<List>) -> ApiResult<Response> {
    ctx.admin()?;
    let db = &ctx.server.db;
    let page = db.page_invitations(&list.page(), list.state.as_deref().unwrap_or(""))?;
    let rows = crate::admin::acts::invitation_rows(db, &page.rows, db::now())?;
    Ok(ok(
        json!({ "rows": rows, "total": page.total, "next": page.next }),
    ))
}

/// The audit log, filtered and paged; `format=csv` gives the whole filtered
/// log as a file.
pub async fn audit(ctx: Ctx, Query(list): Query<List>) -> ApiResult<Response> {
    ctx.admin()?;
    let db = &ctx.server.db;
    let filter = AuditFilter {
        actor: list.actor.clone(),
        action: list.action.clone().filter(|a| !a.is_empty()),
        folder: list.folder.clone().filter(|f| !f.is_empty()),
        from: list.from,
        to: list.to,
    };
    let csv = list.format.as_deref() == Some("csv");
    // The CSV has no page: every row the filter finds, read a page at a
    // time.
    let page = if csv {
        let mut all = db.page_audit(
            &PageQuery {
                offset: 0,
                limit: 200,
                ..list.page()
            },
            &filter,
        )?;
        while let Some(next) = all.next {
            let more = db.page_audit(
                &PageQuery {
                    offset: next,
                    limit: 200,
                    ..list.page()
                },
                &filter,
            )?;
            all.rows.extend(more.rows);
            all.next = more.next;
        }
        all
    } else {
        db.page_audit(&list.page(), &filter)?
    };
    let mut emails: HashMap<String, String> = HashMap::new();
    let mut names: HashMap<String, String> = HashMap::new();
    for e in &page.rows {
        if let Some(id) = &e.actor
            && !emails.contains_key(id)
            && let Some(a) = db.account(id)?
        {
            emails.insert(id.clone(), a.email);
        }
        if let Some(id) = &e.folder
            && !names.contains_key(id)
            && let Some(f) = db.folder(id)?
        {
            names.insert(id.clone(), f.dir);
        }
    }
    // Who or what each line is about, said for a person: the raw subject
    // stays beside it, for the CSV and for the console's title.
    let mut abouts: HashMap<String, Option<Value>> = HashMap::new();
    for e in &page.rows {
        if let Some(subject) = &e.subject
            && !abouts.contains_key(subject)
        {
            abouts.insert(subject.clone(), about(db, subject)?);
        }
    }
    let about_of = |e: &db::AuditEntry| {
        e.subject
            .as_ref()
            .and_then(|s| abouts.get(s).cloned().flatten())
    };
    let who = |e: &db::AuditEntry| {
        e.actor
            .as_ref()
            .map(|id| emails.get(id).cloned().unwrap_or_else(|| id.clone()))
    };
    let where_ = |e: &db::AuditEntry| {
        e.folder
            .as_ref()
            .map(|id| names.get(id).cloned().unwrap_or_else(|| id.clone()))
    };
    if csv {
        // The first seven columns as they always were; who or what the
        // subject names comes last, so that a sheet made from an earlier
        // export still reads its columns where they were.
        let mut out = String::from("at,who,action,subject,folder,address,ok,subject_name\n");
        for e in &page.rows {
            let cells = [
                e.at.to_string(),
                who(e).unwrap_or_default(),
                e.action.clone(),
                e.subject.clone().unwrap_or_default(),
                where_(e).unwrap_or_default(),
                e.address.clone().unwrap_or_default(),
                e.ok.to_string(),
                about_of(e).map(|a| about_text(&a)).unwrap_or_default(),
            ];
            out.push_str(
                &cells
                    .iter()
                    .map(|c| csv_cell(c))
                    .collect::<Vec<_>>()
                    .join(","),
            );
            out.push('\n');
        }
        return Ok((
            [
                (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"audit.csv\"",
                ),
            ],
            out,
        )
            .into_response());
    }
    let rows: Vec<Value> = page
        .rows
        .iter()
        .map(|e| {
            json!({
                "at": e.at, "who": who(e), "action": e.action, "subject": e.subject,
                "about": about_of(e), "folder": where_(e), "address": e.address, "ok": e.ok,
            })
        })
        .collect();
    Ok(ok(
        json!({ "rows": rows, "total": page.total, "next": page.next }),
    ))
}

/// What a log line's subject names, when it is an id a person cannot
/// read: an account (its name and e-mail), an invitation (the e-mail it
/// was for, and its folder), or a token, a passkey or a session (its
/// name). None when the subject is already words — an e-mail, a device's
/// name, a folder's name, a size — or names what is gone.
fn about(db: &db::Db, subject: &str) -> Result<Option<Value>, String> {
    if let Some(a) = db.account(subject)? {
        return Ok(Some(
            json!({ "kind": "account", "name": a.name, "email": a.email }),
        ));
    }
    if let Some(i) = db.invitation(subject)? {
        let folder = match &i.folder {
            Some(id) => db.folder(id)?.map(|f| f.dir),
            None => None,
        };
        return Ok(Some(
            json!({ "kind": "invitation", "email": i.email, "folder": folder }),
        ));
    }
    Ok(db
        .subject_name(subject)?
        .map(|name| json!({ "kind": "named", "name": name })))
}

/// The same, as one cell of the CSV.
fn about_text(about: &Value) -> String {
    let text = |k: &str| about[k].as_str().unwrap_or_default().to_owned();
    match about["kind"].as_str() {
        Some("account") => format!("{} <{}>", text("name"), text("email")),
        Some("invitation") => [text("email"), text("folder")]
            .into_iter()
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
        _ => text("name"),
    }
}

/// A CSV cell: quoted when it holds a comma, a quote or a line end; a
/// leading `=`, `+`, `-`, `@`, tab or carriage return is kept as text,
/// never a spreadsheet's formula (OWASP's list).
fn csv_cell(text: &str) -> String {
    let text = if text.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{text}")
    } else {
        text.to_owned()
    };
    if text.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text
    }
}

/// The actions the log holds, for the console's filter.
pub async fn actions(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    Ok(ok(ctx.server.db.audit_actions()?))
}

/// The server at a glance: its version and update, where its data lives,
/// mail and TLS, totals, and what needs a look.
pub async fn overview(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    let config = &ctx.server.config;
    let data = config.data_dir.clone();
    let folders = config.folders_dir.clone();
    let (data_net, folders_net) = tokio::task::spawn_blocking(move || {
        (
            verso_fs::server::network_file_system(&data),
            verso_fs::server::network_file_system(&folders),
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    let (accounts, folder_count, space) = ctx.server.db.totals()?;
    // The bins, as last seen: shown beside the space, not counted in it
    // (ADR 0080 items 4 and 8).
    let mut trash = (0_u64, 0_u64);
    for f in ctx.server.db.folders()? {
        let (count, size) = crate::trash::kept_size(&ctx.server, &f.id);
        trash.0 += count;
        trash.1 += size;
    }
    // The version histories: shown beside the space too (ADR 0091 item 7).
    let history = {
        let s = std::sync::Arc::clone(&ctx.server);
        tokio::task::spawn_blocking(move || {
            let mut total = (0_u64, 0_u64);
            for f in s.db.folders().unwrap_or_default() {
                let (count, size) = crate::history::kept_size(&s, &f.id);
                total.0 += count;
                total.1 += size;
            }
            total
        })
        .await
        .map_err(|e| e.to_string())?
    };
    let near: Vec<Value> = ctx
        .server
        .db
        .folders_near_quota()?
        .into_iter()
        .map(|(id, name, space, quota)| json!({ "id": id, "name": name, "space": space, "quota": quota }))
        .collect();
    // The folders whose last walk held a file as another's name in another
    // form: each a line of what needs a look.
    let mut twins: Vec<Value> = Vec::new();
    for (id, count) in crate::twins::counts(&ctx.server) {
        if let Some(f) = ctx.server.db.folder(&id)? {
            twins.push(json!({ "id": id, "name": f.dir, "count": count }));
        }
    }
    // The accounts told of 20 refused sign-ins within an hour, in the last
    // day (ADR 0083 item 2): each is told once a day at most.
    let under_attack = ctx.server.db.actors_since(
        crate::signin::NOTICED,
        crate::db::now() - crate::signin::NOTICE_EVERY,
    )?;
    let tls = if config.tls.is_some() {
        "own"
    } else if ctx.peer.https
        || config
            .public_url
            .as_deref()
            .is_some_and(|u| u.starts_with("https://"))
        || (!config.trusted_proxy.is_empty() && !config.trusted_proxy.is_implicit())
    {
        // An https address, a named proxy, or this very request having come
        // over HTTPS through the default list's proxy: HTTPS is in front.
        "proxy"
    } else if config.loopback_only() {
        "loopback"
    } else {
        "none"
    };
    Ok(ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "newer": verso_service::lock(&ctx.server.newer).clone(),
        "updateCheck": config.update_check,
        "publicUrl": config.public_url,
        // The directories the server could not write at start: the page
        // says it and how to mend it (`crate::storage`).
        "unwritable": ctx.server.unwritable.get().map(|v| v.iter().map(|u| json!({ "dir": u.dir, "owner": u.owner })).collect::<Vec<_>>()).unwrap_or_default(),
        "dataDir": config.data_dir,
        "foldersDir": config.folders_dir,
        "dataOnNetwork": data_net,
        "foldersOnNetwork": folders_net,
        "mail": ctx.server.mail.get().is_some_and(crate::mail::Mail::sends),
        "tls": tls,
        "accounts": accounts,
        "folders": folder_count,
        "space": space,
        "trash": { "count": trash.0, "size": trash.1 },
        "history": { "count": history.0, "size": history.1 },
        "defaultHistoryDays": config.history_days,
        "defaultTrashDays": config.trash_days,
        // How long the audit log keeps a row, 0 for ever (ADR 0083 item 10).
        "auditDays": config.audit_days,
        "nearQuota": near,
        "twins": twins,
        "underAttack": under_attack,
        "defaultQuota": config.folder_quota,
    })))
}

/// The configuration in effect, read only (ADR 0077 item 6): each
/// variable and its value; a secret only as set or not.
pub async fn config(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    let c = &ctx.server.config;
    let path = |p: &std::path::Path| Some(p.display().to_string());
    let rows: Vec<Value> = [
        ("VERSO_LISTEN", Some(c.listen.to_string()), false),
        ("VERSO_PUBLIC_URL", c.public_url.clone(), false),
        ("VERSO_DATA_DIR", path(&c.data_dir), false),
        ("VERSO_FOLDERS_DIR", path(&c.folders_dir), false),
        ("VERSO_UI_DIR", path(&c.ui_dir), false),
        (
            "VERSO_TRUSTED_PROXY",
            (!c.trusted_proxy.is_empty() && !c.trusted_proxy.is_implicit())
                .then(|| c.trusted_proxy.to_string()),
            false,
        ),
        (
            "VERSO_TLS_CERT_FILE",
            c.tls.as_ref().map(|(cert, _)| cert.display().to_string()),
            false,
        ),
        (
            "VERSO_TLS_KEY_FILE",
            c.tls.as_ref().map(|(_, key)| key.display().to_string()),
            false,
        ),
        (
            "VERSO_UPDATE_CHECK",
            Some(if c.update_check { "on" } else { "off" }.to_owned()),
            false,
        ),
        ("VERSO_UPDATE_TOKEN", c.update_token.clone(), true),
        ("VERSO_SMTP_URL", c.smtp_url.clone(), true),
        ("VERSO_MAIL_FROM", c.mail_from.clone(), false),
        (
            "VERSO_FOLDER_QUOTA",
            c.folder_quota.map(|q| q.to_string()),
            false,
        ),
        ("VERSO_TRASH_DAYS", Some(c.trash_days.to_string()), false),
        (
            "VERSO_HISTORY_DAYS",
            Some(c.history_days.to_string()),
            false,
        ),
        ("VERSO_AUDIT_DAYS", Some(c.audit_days.to_string()), false),
    ]
    .into_iter()
    .map(|(name, value, secret)| {
        json!({
            "name": name,
            "set": value.is_some(),
            "secret": secret,
            "value": if secret { None } else { value },
        })
    })
    .collect();
    Ok(ok(rows))
}
