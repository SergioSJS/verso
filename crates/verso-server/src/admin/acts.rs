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

use crate::db::{Audit, Db};

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
