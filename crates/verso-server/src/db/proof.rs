// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! When each session last proved who it is (ADR 0083 item 6): its sign-in
//! — a password, a passkey, a link — or its last `POST /api/me/prove`. A
//! device's session is stamped when the person approves it, which itself
//! needs a fresh proof, and proves again like any other session after. The
//! mark lives here, on the server, and only here: the window is told
//! `prove_first`, never the time.

use rusqlite::{OptionalExtension, params};

use super::{Db, R, e, now};

/// Schema 9: the session's last proof, in seconds since the epoch. A
/// session from before it has 0, and proves before its next sensitive
/// action.
pub(super) const PROOF: &str = r"
ALTER TABLE sessions ADD COLUMN proved_at INTEGER NOT NULL DEFAULT 0;
";

impl Db {
    /// When session `id` last proved who it is; `None` when there is no
    /// such session.
    pub fn proved_at(&self, id: &str) -> R<Option<i64>> {
        self.reader()
            .query_row("SELECT proved_at FROM sessions WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(e)
    }

    /// Session `id` proved who it is, now; false when it is gone.
    pub fn prove(&self, id: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "UPDATE sessions SET proved_at = ?2 WHERE id = ?1",
                params![id, now()],
            )
            .map_err(e)?
            > 0)
    }

    /// Every session of `account` proved `seconds` earlier than it did: the
    /// tests' way to move the mark past the window (no route does this).
    #[cfg(test)]
    pub fn age_proofs(&self, account: &str, seconds: i64) -> R<()> {
        self.conn()
            .execute(
                "UPDATE sessions SET proved_at = proved_at - ?2 WHERE account = ?1",
                params![account, seconds],
            )
            .map_err(e)?;
        Ok(())
    }
}
