// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The audit log's retention (ADR 0083 item 10): rows older than a time
//! go, by time alone. There is no other delete of `audit` and no update
//! (security review 2026-10-13, section 4.5).

use rusqlite::params;

use super::{Db, R, e};

impl Db {
    /// Every row of the audit log written before `before` (seconds since
    /// the epoch) deleted; how many.
    pub fn expire_audit(&self, before: i64) -> R<usize> {
        self.conn()
            .execute("DELETE FROM audit WHERE at < ?1", params![before])
            .map_err(e)
    }

    /// A row written at `at`, for a test of the retention.
    #[cfg(test)]
    pub(crate) fn audit_at(&self, at: i64, a: &super::Audit<'_>) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO audit (at, actor, action, subject, folder, address, ok) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![at, a.actor, a.action, a.subject, a.folder, a.address, a.ok],
            )
            .map_err(e)?;
        Ok(())
    }
}
