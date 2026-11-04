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

use crate::db::{self, Audit, Db, Invitation, NewLink, Role};
use crate::http::ApiError;

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
            Refused::Failed(e) => ApiError::from(e),
        }
    }
}

/// An invitation to make: to whom (an e-mail, or anyone holding the link),
/// to what (a folder, or a share of one, ADR 0081 item 4) and at what role.
#[derive(Debug, Clone, Copy, Default)]
pub struct Invitee<'a> {
    pub email: Option<&'a str>,
    pub folder: Option<&'a str>,
    pub role: Option<Role>,
    pub share: Option<&'a str>,
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
    let (token, inv) = db.create_invitation(&NewLink {
        kind: "invite",
        email,
        account: None,
        folder: folder.as_deref(),
        role,
        created_by,
        life: db::INVITE_LIFE,
        share: shared.as_ref().map(|s| s.id.as_str()),
    })?;
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
            })
        })
        .collect()
}
