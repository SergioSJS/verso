// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Personal access tokens (ADR 0074 item 8): made, looked up by their
//! hash, listed and revoked. Moved out of `db.rs` whole, which was near
//! the size limit (ADR 0067).

use rusqlite::{OptionalExtension, params};

use super::{Db, R, TokenGrant, TokenInfo, crypto, e, now};

impl Db {
    pub fn create_token(
        &self,
        account: &str,
        name: &str,
        write: bool,
        expires: Option<i64>,
        folders: &[String],
    ) -> R<(String, TokenInfo)> {
        let secret = format!("verso_pat_{}", crypto::token()?);
        let id = crypto::id()?;
        let at = now();
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        tx.execute(
            "INSERT INTO tokens (id, hash, account, name, write, expires, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, crypto::hash(&secret), account, name.trim(), write, expires, at],
        )
        .map_err(e)?;
        for folder in folders {
            // A share is named beside the folders (ADR 0081 item 15).
            let share: Option<String> = tx
                .query_row("SELECT id FROM shares WHERE id = ?1", [folder], |r| {
                    r.get(0)
                })
                .optional()
                .map_err(e)?;
            let sql = if share.is_some() {
                "INSERT INTO token_shares (token, share) VALUES (?1, ?2)"
            } else {
                "INSERT INTO token_folders (token, folder) VALUES (?1, ?2)"
            };
            tx.execute(sql, params![id, folder]).map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok((
            secret,
            TokenInfo {
                id,
                name: name.trim().to_owned(),
                write,
                expires,
                created: at,
                last_used: None,
                folders: folders.to_vec(),
            },
        ))
    }

    /// Whether token `id` still stands.
    pub fn token_alive(&self, id: &str) -> R<bool> {
        let expires: Option<Option<i64>> = self
            .conn()
            .query_row("SELECT expires FROM tokens WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(e)?;
        Ok(expires.is_some_and(|x| x.is_none_or(|x| now() < x)))
    }

    /// The id, the account, the write bit and the folders of a live token.
    pub fn token(&self, secret: &str) -> R<Option<TokenGrant>> {
        let conn = self.conn();
        let row: Option<(String, String, bool, Option<i64>)> = conn
            .query_row(
                "SELECT id, account, write, expires FROM tokens WHERE hash = ?1",
                [crypto::hash(secret)],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(e)?;
        let Some((id, account, write, expires)) = row else {
            return Ok(None);
        };
        let at = now();
        if expires.is_some_and(|x| at >= x) {
            return Ok(None);
        }
        conn.execute(
            "UPDATE tokens SET last_used = ?2 WHERE id = ?1",
            params![id, at],
        )
        .map_err(e)?;
        let mut st = conn
            .prepare(
                "SELECT folder FROM token_folders WHERE token = ?1
                 UNION ALL SELECT share FROM token_shares WHERE token = ?1",
            )
            .map_err(e)?;
        let folders = st
            .query_map([&id], |r| r.get(0))
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)?;
        Ok(Some(TokenGrant {
            id,
            account,
            write,
            folders,
        }))
    }

    pub fn tokens_of(&self, account: &str) -> R<Vec<TokenInfo>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT id, name, write, expires, created, last_used FROM tokens
                 WHERE account = ?1 ORDER BY created DESC",
            )
            .map_err(e)?;
        let mut tokens: Vec<TokenInfo> = st
            .query_map([account], |r| {
                Ok(TokenInfo {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    write: r.get(2)?,
                    expires: r.get(3)?,
                    created: r.get(4)?,
                    last_used: r.get(5)?,
                    folders: Vec::new(),
                })
            })
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)?;
        let mut st = conn
            .prepare(
                "SELECT folder FROM token_folders WHERE token = ?1
                 UNION ALL SELECT share FROM token_shares WHERE token = ?1",
            )
            .map_err(e)?;
        for t in &mut tokens {
            t.folders = st
                .query_map([&t.id], |r| r.get(0))
                .map_err(e)?
                .collect::<rusqlite::Result<_>>()
                .map_err(e)?;
        }
        Ok(tokens)
    }

    pub fn revoke_token(&self, account: &str, id: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "DELETE FROM tokens WHERE account = ?1 AND id = ?2",
                params![account, id],
            )
            .map_err(e)?
            > 0)
    }
}
