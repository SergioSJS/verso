// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The administrator's acts, one implementation each, for both places that
//! act as the administrator: a UniVerso's console (`crate::admin`, behind
//! its routes) and "this app is a server" (`crate::local`, whose section of
//! Settings is its console, ADR 0117 D9). The caller checks who acts — the
//! console's admin with a fresh proof (ADR 0083 item 6), the owner's click
//! in the app (ADR 0117 D13 Q4) — and adds its own rules on top; what the
//! act does to the database, the open connections and the audit log is
//! here, the same on both.

use axum::http::StatusCode;
use serde::Serialize;
use serde_json::json;

use crate::db::{self, Account, Audit, Db, Invitation, NewLink, Role};
use crate::http::ApiError;
use crate::state::Server;

/// Who acts, as the audit log names them: the account and the address, or
/// none (the app, at the computer).
#[derive(Debug, Clone, Copy, Default)]
pub struct By<'a> {
    pub actor: Option<&'a str>,
    pub address: Option<&'a str>,
}

impl By<'_> {
    /// A line of the audit log, on behalf of whoever acts. A failure to
    /// write it is logged and the act stands, as a request's audit does
    /// (`crate::http::Ctx::audit`).
    pub fn audit(&self, db: &Db, action: &str, subject: Option<&str>, folder: Option<&str>) {
        if let Err(e) = db.audit(&Audit {
            actor: self.actor,
            action,
            subject,
            folder,
            address: self.address,
            ok: true,
        }) {
            crate::log::error(&format!("audit log: {e}"));
        }
    }
}

/// Why an act was refused: a code and words for the console's page, the
/// words alone for the app's section.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refused {
    /// Not an e-mail address.
    NotEmail,
    /// An account has this e-mail already.
    Exists,
    /// No such account, folder or share.
    NotFound,
    /// The folder named would be left with no owner.
    LastOwner(String),
    /// Not one who invites a person who has no account ([`Inviter`]).
    NotInviter,
    /// A game master who is not the admin invites to read only.
    ReadersOnly,
    /// That many invitations of a game master are pending already.
    TooMany(usize),
    /// The database failed.
    Failed(String),
}

impl From<String> for Refused {
    fn from(e: String) -> Self {
        Self::Failed(e)
    }
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotEmail => f.write_str("not an e-mail address"),
            Self::Exists => f.write_str("an account has this e-mail"),
            Self::NotFound => f.write_str("not found"),
            Self::LastOwner(dir) => write!(f, "{dir} keeps an owner: give it another first"),
            Self::NotInviter => f.write_str(
                "only the server's admin, or an account the admin lets make folders, invites a person who has no account",
            ),
            Self::ReadersOnly => f.write_str(
                "a game master's invitation gives reading: invite them as a reader, and give more once they have come in",
            ),
            Self::TooMany(n) => write!(
                f,
                "{n} invitations of yours are waiting already: wait until one is used or expires, or ask the server's admin to end one"
            ),
            Self::Failed(e) => f.write_str(e),
        }
    }
}

impl From<Refused> for ApiError {
    fn from(r: Refused) -> Self {
        match r {
            Refused::NotEmail => ApiError::bad("not_email", r.to_string()),
            Refused::Exists => ApiError::new(StatusCode::CONFLICT, "exists", r.to_string()),
            Refused::NotFound => ApiError::not_found(),
            Refused::LastOwner(_) => ApiError::bad("last_owner", r.to_string()),
            Refused::NotInviter => ApiError::forbidden(r.to_string()),
            Refused::ReadersOnly => ApiError::bad("readers_only", r.to_string()),
            Refused::TooMany(_) => ApiError::bad("too_many_invitations", r.to_string()),
            Refused::Failed(e) => ApiError::from(e),
        }
    }
}

/// An invitation to make: to whom (an e-mail, or anyone holding the link),
/// to what (a folder, or a share of one, ADR 0081 item 4) and at what role.
/// `most_pending`: refused when its maker has that many pending already
/// (a game master's, [`Inviter::invitee`]).
#[derive(Debug, Clone, Copy, Default)]
pub struct Invitee<'a> {
    pub email: Option<&'a str>,
    pub folder: Option<&'a str>,
    pub role: Option<Role>,
    pub share: Option<&'a str>,
    pub most_pending: Option<usize>,
}

/// The most invitations a game master who is not the admin has pending at
/// once (ADR 0117 D7 (e), decided 2026-11-13).
pub const GAME_MASTER_PENDING_MOST: usize = 20;

/// Who invites a person who has no account (ADR 0081 item 4, revised by
/// ADR 0117 D7 (e)). The caller checks first that the folder is the
/// inviter's own — its owner, never an editor or a member of another's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Inviter {
    /// The server's admin: any role, no number.
    Admin,
    /// On a UniVerso, an account the admin lets make folders (ADR 0074
    /// item 6): into a folder of its own, to read, at most
    /// [`GAME_MASTER_PENDING_MOST`] pending at once. On this computer only
    /// the owner owns folders, and nobody else invites.
    GameMaster,
}

impl Inviter {
    /// What `account` may be here, on this computer when `local`.
    #[must_use]
    pub fn of(account: &Account, local: bool) -> Option<Self> {
        if account.admin {
            Some(Self::Admin)
        } else if account.may_create && !local {
            Some(Self::GameMaster)
        } else {
            None
        }
    }

    /// The invitation as this inviter may make it: the admin's as asked; a
    /// game master's carries a folder, at reading, within the number.
    pub fn invitee<'a>(self, to: Invitee<'a>) -> Result<Invitee<'a>, Refused> {
        match self {
            Self::Admin => Ok(to),
            Self::GameMaster if to.folder.is_none() && to.share.is_none() => {
                Err(Refused::NotInviter)
            }
            Self::GameMaster if to.role.is_some_and(|r| r != Role::Reader) => {
                Err(Refused::ReadersOnly)
            }
            Self::GameMaster => Ok(Invitee {
                role: Some(Role::Reader),
                most_pending: Some(GAME_MASTER_PENDING_MOST),
                ..to
            }),
        }
    }
}

/// Refused before anything is made — a share for the invitation — when
/// `maker` has `to.most_pending` invitations waiting already;
/// [`make_invitation`] counts again under its lock.
pub fn room_for(db: &Db, maker: &str, to: &Invitee<'_>) -> Result<(), Refused> {
    match to.most_pending {
        Some(most) if db.pending_invitations_by(maker)? >= most => Err(Refused::TooMany(most)),
        _ => Ok(()),
    }
}

/// An invitation: a single-use link for seven days (ADR 0074 item 4), made
/// by `created_by`, which may carry a folder at a role (reading when none
/// is said) or a share of one (its folder the share's, its role at most
/// editing). An e-mail given is one no account has. In the audit. The
/// token is said once, to the caller, who builds the link.
pub fn make_invitation(
    db: &Db,
    by: &By<'_>,
    created_by: Option<&str>,
    to: &Invitee<'_>,
) -> Result<(String, Invitation), Refused> {
    let email = to.email.map(str::trim).filter(|e| !e.is_empty());
    if let Some(e) = email {
        if !db::is_email(e) {
            return Err(Refused::NotEmail);
        }
        if db.account_by_email(e)?.is_some() {
            return Err(Refused::Exists);
        }
    }
    let shared = match to.share {
        Some(s) => Some(db.share(s)?.ok_or(Refused::NotFound)?),
        None => None,
    };
    let folder = shared
        .as_ref()
        .map(|s| s.folder.clone())
        .or(to.folder.map(str::to_owned));
    if let Some(f) = &folder {
        db.folder(f)?.ok_or(Refused::NotFound)?;
    }
    let role = folder.as_ref().map(|_| {
        let r = to.role.unwrap_or(Role::Reader);
        if shared.is_some() {
            r.min(Role::Editor)
        } else {
            r
        }
    });
    let (token, inv) = db
        .create_invitation_within(
            &NewLink {
                kind: "invite",
                email,
                account: None,
                folder: folder.as_deref(),
                role,
                created_by,
                life: db::INVITE_LIFE,
                share: shared.as_ref().map(|s| s.id.as_str()),
            },
            to.most_pending,
        )?
        .ok_or(Refused::TooMany(to.most_pending.unwrap_or_default()))?;
    by.audit(db, "invitation_created", Some(&inv.id), folder.as_deref());
    Ok((token, inv))
}

/// End an invitation not used yet: its link opens nothing from now. False
/// when it is used, ended or not there. In the audit.
pub fn end_invitation(db: &Db, by: &By<'_>, id: &str) -> Result<bool, String> {
    let ended = db.end_invitation(id)?;
    if ended {
        by.audit(db, "invitation_ended", Some(id), None);
    }
    Ok(ended)
}

/// Every pending invitation `maker` made, ended now — when the admin takes
/// *may create folders* away from a game master (ADR 0117 D7 (e)): whoever
/// accepted one keeps their place. Each in the audit. How many.
pub fn end_invitations_of(db: &Db, by: &By<'_>, maker: &str) -> Result<usize, String> {
    let ended = db.end_invitations_by(maker)?;
    for id in &ended {
        by.audit(db, "invitation_ended", Some(id), None);
    }
    Ok(ended.len())
}

/// An invitation as the console and the app's section list it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvitationRow {
    pub id: String,
    /// `pending`, `used`, `ended` or `expired`.
    pub state: String,
    pub email: Option<String>,
    /// The folder it carries, by its name.
    pub folder: Option<String>,
    pub role: Option<String>,
    pub created: i64,
    pub expires: i64,
    pub used: Option<i64>,
    /// The e-mail of the account that used it.
    pub used_by: Option<String>,
    /// The name of the account that used it.
    pub used_by_name: Option<String>,
    /// The e-mail of the account that made it: the admin's, or a game
    /// master's (ADR 0117 D7 (e)).
    pub made_by: Option<String>,
}

/// Each of `invitations` as a list shows it, at `now`.
pub fn invitation_rows(
    db: &Db,
    invitations: &[Invitation],
    now: i64,
) -> Result<Vec<InvitationRow>, String> {
    invitations
        .iter()
        .map(|i| {
            let user = match &i.used_by {
                Some(id) => db.account(id)?,
                None => None,
            };
            let folder = match &i.folder {
                Some(id) => db.folder(id)?.map(|f| f.dir),
                None => None,
            };
            let made_by = match &i.created_by {
                Some(id) => db.account(id)?.map(|a| a.email),
                None => None,
            };
            Ok(InvitationRow {
                id: i.id.clone(),
                state: i.state(now).to_owned(),
                email: i.email.clone(),
                folder,
                role: i.role.clone(),
                created: i.created,
                expires: i.expires,
                used: i.used,
                used_by: user.as_ref().map(|a| a.email.clone()),
                used_by_name: user.map(|a| a.name),
                made_by,
            })
        })
        .collect()
}

/// The account's open connections told `gone: session` and closed at once
/// — its tokens' too; all but the session `keep` (the asker's own, when an
/// admin acts on their own account).
fn told(server: Option<&Server>, account: &str, keep: Option<&str>) {
    match (server, keep) {
        (Some(s), None) => s.push_account(account, &json!({ "gone": "session" })),
        (Some(s), Some(keep)) => s.sessions_ended(account, None, Some(keep)),
        (None, _) => {}
    }
}

/// A new password's link made by an admin, in the console or the app.
pub const RESET_LINK: &str = "reset_link";
/// A new password's link made on the server's machine.
pub const RESET_ON_MACHINE: &str = "reset_on_machine";

/// A new password for account `id` (ADR 0074 item 5): a single-use link
/// for a day, made by `created_by`, which replaces an earlier one. As `verso
/// serve admin reset` does on the machine (decided 2026-11-04 for the
/// console and the app alike), every session of the account ends now but
/// `keep` — the asker's own, when an admin resets their own account — and
/// its tokens are revoked, each in the audit; its open connections close
/// at once (`server`, while one runs). The old password works until the
/// new one is set from the link. The token is said once, to the caller.
/// `action` names the act in the audit: [`RESET_LINK`] from the console and
/// the app, [`RESET_ON_MACHINE`] from `verso serve admin reset`.
pub fn reset_link(
    db: &Db,
    server: Option<&Server>,
    by: &By<'_>,
    created_by: Option<&str>,
    id: &str,
    keep: Option<&str>,
    action: &str,
) -> Result<(String, Invitation), Refused> {
    db.account(id)?.ok_or(Refused::NotFound)?;
    db.end_links_of(id, "reset")?;
    db.end_sessions(id, keep)?;
    for token in db.revoke_tokens_of(id)? {
        by.audit(db, "token_revoked", Some(&token), None);
    }
    told(server, id, keep);
    let made = db.create_invitation(&NewLink {
        kind: "reset",
        account: Some(id),
        created_by,
        life: db::RESET_LIFE,
        ..NewLink::default()
    })?;
    by.audit(db, action, Some(id), None);
    Ok(made)
}

/// End every session of account `id` — browsers and devices — and revoke
/// its personal access tokens (ADR 0077 item 3): its open connections are
/// told `gone: session` and closed at once (`server`, while one runs). How
/// many of each. In the audit.
pub fn end_sessions(
    db: &Db,
    server: Option<&Server>,
    by: &By<'_>,
    id: &str,
) -> Result<(usize, usize), Refused> {
    db.account(id)?.ok_or(Refused::NotFound)?;
    let ended = db.end_all_of(id)?;
    told(server, id, None);
    by.audit(db, "account_sessions_ended", Some(id), None);
    Ok(ended)
}

/// Remove account `id`: its sessions, devices, tokens, passkeys, grants
/// and shares go with it (the database's cascade), its connections closed
/// first (`server`, while one runs). A folder whose only owner it is
/// refuses it: the folder keeps an owner, given another first. In the
/// audit by its e-mail, which is all that is left to name it by.
pub fn remove_account(
    db: &Db,
    server: Option<&Server>,
    by: &By<'_>,
    id: &str,
) -> Result<(), Refused> {
    let target = db.account(id)?.ok_or(Refused::NotFound)?;
    for (f, role) in db.folders_of(id)? {
        if role == Role::Owner
            && !db
                .members(&f.id)?
                .iter()
                .any(|(a, r)| *r == Role::Owner && a.id != id)
        {
            return Err(Refused::LastOwner(f.dir));
        }
    }
    told(server, id, None);
    db.delete_account(id)?;
    by.audit(db, "account_deleted", Some(&target.email), None);
    Ok(())
}
