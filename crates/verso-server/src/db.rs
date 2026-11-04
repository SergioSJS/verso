// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The server's database (ADR 0074 item 10): accounts, sessions,
//! invitations, personal access tokens, the folders and who may do what in
//! each, and the audit log. SQLite in `VERSO_DATA_DIR`, beside the folders
//! and never inside them. Unlike the index it is **not a cache**: nothing
//! rebuilds it from the files, and the backup names it beside the folders.
//! No note and no setting of a note is kept here (ADR 0012).
//!
//! Tokens are kept as their SHA-256 only (`crypto::hash`); a password as
//! its Argon2id hash. Times are seconds since the Unix epoch.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};

use crate::crypto;

/// The schema's version, in `PRAGMA user_version`.
const SCHEMA: i64 = 21;

/// Schema 8: sharing a folder inside a folder (ADR 0081 items 1, 2, 9, 11
/// and 15): a share is a path of one folder with an id of its own, its
/// people and their roles, the attachments folder it may also show
/// read-only, the shares a personal access token names, an invitation's
/// share, and the path an entry of the audit log concerns.
const SHARES: &str = r"
CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  attachments TEXT,
  created INTEGER NOT NULL,
  UNIQUE (folder, path)
);
CREATE TABLE share_grants (
  share TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'reader')),
  PRIMARY KEY (share, account)
);
CREATE INDEX share_grants_account ON share_grants(account);
CREATE TABLE token_shares (
  token TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  share TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  PRIMARY KEY (token, share)
);
ALTER TABLE invitations ADD COLUMN share TEXT REFERENCES shares(id) ON DELETE SET NULL;
ALTER TABLE audit ADD COLUMN path TEXT;
";

/// Schema 10: what an invitation was made for, kept apart from the share
/// it names (ADR 0081 items 4 and 8): `invitations.share` is set to null
/// when its share goes, and an invitation to a share must not then read as
/// one to the whole folder. Invitations made before it that still name
/// their share are marked as a share's.
const INVITATION_SCOPE: &str = r"
ALTER TABLE invitations ADD COLUMN scope TEXT NOT NULL DEFAULT 'folder' CHECK (scope IN ('folder', 'share'));
UPDATE invitations SET scope = 'share' WHERE share IS NOT NULL;
";

/// Run with schema 10, in its transaction: a share's invitation orphaned
/// before it (its share deleted, `share` set to null) cannot be told from
/// a folder's, and would grant the whole folder. Every invitation still
/// pending that names a folder and no share is ended; the admin sends it
/// again. Used, expired and folderless links are left as they are.
const END_UNSCOPED: &str = "UPDATE invitations SET ended = ?1
 WHERE folder IS NOT NULL AND share IS NULL AND used IS NULL AND ended IS NULL AND expires > ?1";

/// Schema 11: what a reader of a note with secret blocks is told of it
/// (ADR 0087 item 4): the hash and size of its projection, beside the
/// file's, and whether a change was one for a reader at all — a change
/// only inside a secret block is none. Every note is read again by the
/// next reconciliation (its quick key emptied), so that a note that held a
/// secret before this schema gets its reader's hash.
const SECRETS: &str = r"
ALTER TABLE manifest ADD COLUMN reader_hash TEXT;
ALTER TABLE manifest ADD COLUMN reader_size INTEGER;
ALTER TABLE changes ADD COLUMN reader_hash TEXT;
ALTER TABLE changes ADD COLUMN reader_size INTEGER;
ALTER TABLE changes ADD COLUMN reader_same INTEGER NOT NULL DEFAULT 0;
UPDATE manifest SET quick = '' WHERE lower(path) LIKE '%.md';
";

/// Schema 6: the device that made a change of a folder's log, by its name
/// (ADR 0079 item 4, "who made it"): two devices of one account told apart.
const DEVICES: &str = r"
ALTER TABLE changes ADD COLUMN device TEXT;
";

/// Schema 5: each folder's files as sync last saw them, and the log of
/// their changes a device reads from a cursor (ADR 0079 items 4 and 5).
const SYNC: &str = r"
CREATE TABLE manifest (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  quick TEXT NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (folder, path)
);
CREATE TABLE changes (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  path TEXT NOT NULL,
  hash TEXT,
  size INTEGER NOT NULL,
  deleted INTEGER NOT NULL,
  renamed_from TEXT,
  actor TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (folder, seq)
);
";

/// Schema 4: a folder's quota, and the indexes the administration console
/// pages by (ADR 0077 items 4 and 5).
const CONSOLE: &str = r"
ALTER TABLE folders ADD COLUMN quota INTEGER;
CREATE INDEX sessions_account ON sessions(account, last_used);
CREATE INDEX grants_account ON grants(account, role);
CREATE INDEX audit_actor ON audit(actor, at);
CREATE INDEX audit_action ON audit(action, at);
CREATE INDEX invitations_created ON invitations(kind, created);
";

/// Schema 3: the person's settings, with the account (ADR 0073 item 5).
const SETTINGS: &str = r"
CREATE TABLE account_settings (
  account TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  json TEXT NOT NULL,
  updated INTEGER NOT NULL
);
";

/// Schema 2: the passkeys (ADR 0074 item 3).
const PASSKEYS: &str = r"
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  credential TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER
);
";

const CREATE: &str = r"
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_fold TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  lang TEXT NOT NULL,
  password TEXT,
  admin INTEGER NOT NULL,
  may_create INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  hash BLOB NOT NULL UNIQUE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('browser', 'device')),
  device TEXT NOT NULL,
  csrf TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER NOT NULL,
  address TEXT NOT NULL
);
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  dir TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
CREATE TABLE grants (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'reader')),
  PRIMARY KEY (folder, account)
);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  hash BLOB NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('invite', 'reset', 'setup')),
  email TEXT,
  account TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  folder TEXT REFERENCES folders(id) ON DELETE SET NULL,
  role TEXT,
  created_by TEXT,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  used INTEGER,
  used_by TEXT,
  ended INTEGER
);
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  hash BLOB NOT NULL UNIQUE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  write INTEGER NOT NULL,
  expires INTEGER,
  created INTEGER NOT NULL,
  last_used INTEGER
);
CREATE TABLE token_folders (
  token TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (token, folder)
);
CREATE TABLE audit (
  at INTEGER NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  subject TEXT,
  folder TEXT,
  address TEXT,
  ok INTEGER NOT NULL
);
CREATE INDEX audit_at ON audit(at);
CREATE INDEX audit_folder ON audit(folder, at);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// A browser session lasts this long without use (ADR 0074 item 7)…
pub const SESSION_IDLE: i64 = 14 * 24 * 3600;
/// …and this long at most.
pub const SESSION_MAX: i64 = 90 * 24 * 3600;
/// A device's session (the desktop app signed in through the browser): as
/// long as a browser's at most, renewed by use.
pub const DEVICE_MAX: i64 = SESSION_MAX;
/// An invitation's life (ADR 0074 item 4).
pub const INVITE_LIFE: i64 = 7 * 24 * 3600;
/// A reset link's life (item 5) and the setup link's (item 1).
pub const RESET_LIFE: i64 = 24 * 3600;
pub const SETUP_LIFE: i64 = 3600;

#[must_use]
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// An e-mail as it is compared: trimmed, NFC, lower-cased (ADR 0074 item
/// 2). It is shown as typed.
#[must_use]
pub fn fold_email(email: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    email.trim().nfc().collect::<String>().to_lowercase()
}

/// Whether `email` looks like an address: something, one `@`, something
/// with a dot. Nothing more is promised without a mail server.
#[must_use]
pub fn is_email(email: &str) -> bool {
    let e = email.trim();
    let mut parts = e.split('@');
    matches!((parts.next(), parts.next(), parts.next()),
        (Some(local), Some(domain), None)
            if !local.is_empty() && domain.contains('.') && !domain.starts_with('.')
                && !domain.ends_with('.') && !e.chars().any(char::is_whitespace))
}

/// A member's role in a folder (ADR 0073 item 5).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Reader,
    Editor,
    Owner,
}

impl Role {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Reader => "reader",
            Self::Editor => "editor",
            Self::Owner => "owner",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "reader" => Some(Self::Reader),
            "editor" => Some(Self::Editor),
            "owner" => Some(Self::Owner),
            _ => None,
        }
    }

    /// Whether the role may change the folder.
    #[must_use]
    pub fn writes(self) -> bool {
        self >= Self::Editor
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub name: String,
    pub lang: String,
    pub admin: bool,
    pub may_create: bool,
    pub created: i64,
    #[serde(skip)]
    pub password: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionRow {
    pub id: String,
    pub account: String,
    pub kind: String,
    pub csrf: String,
    pub created: i64,
    pub last_used: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub kind: String,
    pub device: String,
    pub created: i64,
    pub last_used: i64,
    pub address: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Folder {
    pub id: String,
    pub dir: String,
    pub created: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Invitation {
    pub id: String,
    pub kind: String,
    pub email: Option<String>,
    pub account: Option<String>,
    pub folder: Option<String>,
    pub role: Option<String>,
    pub created_by: Option<String>,
    pub created: i64,
    pub expires: i64,
    pub used: Option<i64>,
    pub used_by: Option<String>,
    pub ended: Option<i64>,
    /// The share it carries, when it carries one (ADR 0081 item 4).
    pub share: Option<String>,
    /// Whether it was made for a share: `share` is null once the share is
    /// gone, and the invitation then gives nothing.
    #[serde(skip)]
    pub for_share: bool,
}

impl Invitation {
    /// Pending, used, ended or expired, as the admin page shows it.
    #[must_use]
    pub fn state(&self, now: i64) -> &'static str {
        if self.used.is_some() {
            "used"
        } else if self.ended.is_some() || (self.for_share && self.share.is_none()) {
            "ended"
        } else if now >= self.expires {
            "expired"
        } else {
            "pending"
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TokenInfo {
    pub id: String,
    pub name: String,
    pub write: bool,
    pub expires: Option<i64>,
    pub created: i64,
    pub last_used: Option<i64>,
    pub folders: Vec<String>,
}

/// A passkey as kept.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PasskeyRow {
    pub id: String,
    pub name: String,
    #[serde(skip)]
    pub credential: String,
    pub created: i64,
    pub last_used: Option<i64>,
}

/// What a live token lets in.
#[derive(Debug, Clone)]
pub struct TokenGrant {
    pub id: String,
    pub account: String,
    pub write: bool,
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AuditEntry {
    pub at: i64,
    pub actor: Option<String>,
    pub action: String,
    pub subject: Option<String>,
    pub folder: Option<String>,
    pub address: Option<String>,
    pub ok: bool,
    /// The path inside the folder a share's entry concerns (ADR 0081
    /// item 9).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// A single-use link before it is made: an invitation, a password reset or
/// the first admin's setup.
#[derive(Clone, Copy, Default)]
pub struct NewLink<'a> {
    pub kind: &'a str,
    pub email: Option<&'a str>,
    pub account: Option<&'a str>,
    pub folder: Option<&'a str>,
    pub role: Option<Role>,
    pub created_by: Option<&'a str>,
    pub life: i64,
    /// A share of `folder` the invitation carries (ADR 0081 item 4).
    pub share: Option<&'a str>,
}

/// One line of the audit log, before it is written.
pub struct Audit<'a> {
    pub actor: Option<&'a str>,
    pub action: &'a str,
    pub subject: Option<&'a str>,
    pub folder: Option<&'a str>,
    pub address: Option<&'a str>,
    pub ok: bool,
}

/// The database, one connection behind a lock: the server writes little,
/// and each statement is short.
pub struct Db {
    /// The one connection that writes.
    conn: Mutex<Connection>,
    /// Connections that only read (WAL lets them read while the writer
    /// writes): the questions every device asks often — the change log,
    /// the manifest, a file as sync knows it — do not wait for another
    /// folder's write. Empty for a database in memory.
    readers: Vec<Mutex<Connection>>,
    next_reader: std::sync::atomic::AtomicUsize,
    /// The (folder, account) pairs let send images at some table (ADR 0107
    /// item 3 as amended 2026-10-24), kept made again by every writer of
    /// `campaign_images` (`refresh_images`).
    images: Mutex<std::collections::HashSet<(String, String)>>,
}

/// How many reading connections a server keeps.
const READERS: usize = 4;

type R<T> = Result<T, String>;

fn e(err: rusqlite::Error) -> String {
    err.to_string()
}

impl Db {
    /// Open the database in `dir`, creating it at the first start.
    pub fn open(dir: &Path) -> R<Self> {
        let path = dir.join("server.sqlite");
        let mut db = Self::from(Connection::open(&path).map_err(e)?)?;
        // The accounts' hashes are for this server's user alone
        // (threat-model.md, gap 13), whatever the umask made them.
        for name in ["server.sqlite", "server.sqlite-wal", "server.sqlite-shm"] {
            verso_fs::server::owner_only(&dir.join(name))
                .map_err(|err| format!("{name}: {err}"))?;
        }
        for _ in 0..READERS {
            let reader = Connection::open_with_flags(
                &path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                    | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .map_err(e)?;
            reader
                .execute_batch("PRAGMA busy_timeout = 5000; PRAGMA query_only = ON;")
                .map_err(e)?;
            db.readers.push(Mutex::new(reader));
        }
        Ok(db)
    }

    /// A database in memory, for tests.
    pub fn memory() -> R<Self> {
        Self::from(Connection::open_in_memory().map_err(e)?)
    }

    fn from(mut conn: Connection) -> R<Self> {
        // NORMAL in WAL: a crash or a power cut never corrupts the
        // database, and may lose the last commits before it — what a
        // reconciliation finds again on the disk for sync's log, and a
        // moment of sessions and audit lines; FULL would sync the disk on
        // every commit, the cost of each device's write (measured, sync
        // lab, 2026-10-10).
        conn.execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
        )
        .map_err(e)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(e)?;
        if version > SCHEMA {
            return Err(format!(
                "the database is of a newer Verso (schema {version}, this one knows {SCHEMA})"
            ));
        }
        // Each schema after the one found, in one transaction.
        let steps: String = [
            (1, CREATE),
            (2, PASSKEYS),
            (3, SETTINGS),
            (4, CONSOLE),
            (5, SYNC),
            (6, DEVICES),
            (7, trash::TRASH),
            (8, SHARES),
            (9, proof::PROOF),
            (10, INVITATION_SCOPE),
            (11, SECRETS),
            (12, local::PHONES),
            (13, readlinks::READ_LINKS),
            (14, table::TABLE),
            (15, campaign::CAMPAIGN),
            (16, table::TABLE_PER_TABLE),
            (17, campaign::AUDIENCE),
            (18, campaign::EPOCHS),
            (19, campaign::IMAGES),
            (20, access::ACCESS),
            (21, access::RIGHTS),
        ]
        .iter()
        .filter(|(at, _)| *at > version)
        .map(|(_, sql)| *sql)
        .collect();
        if !steps.is_empty() {
            let tx = conn.transaction().map_err(e)?;
            tx.execute_batch(&steps).map_err(e)?;
            let ended = if version < 10 {
                tx.execute(END_UNSCOPED, [now()]).map_err(e)?
            } else {
                0
            };
            tx.execute_batch(&format!("PRAGMA user_version = {SCHEMA};"))
                .map_err(e)?;
            tx.commit().map_err(e)?;
            if ended > 0 {
                crate::log::info(&format!(
                    "{ended} pending folder invitations ended at upgrade; send them again"
                ));
            }
        }
        let db = Self {
            conn: Mutex::new(conn),
            readers: Vec::new(),
            next_reader: std::sync::atomic::AtomicUsize::new(0),
            images: Mutex::new(std::collections::HashSet::new()),
        };
        db.refresh_images(&db.conn());
        Ok(db)
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        verso_service::lock(&self.conn)
    }

    /// A connection to read with: a free reader, else the next one in
    /// turn; the writer when there are none (in memory).
    fn reader(&self) -> std::sync::MutexGuard<'_, Connection> {
        if self.readers.is_empty() {
            return self.conn();
        }
        for r in &self.readers {
            if let Ok(free) = r.try_lock() {
                return free;
            }
        }
        let at = self
            .next_reader
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            % self.readers.len();
        verso_service::lock(&self.readers[at])
    }

    /* ---------- accounts ---------- */

    pub fn account_count(&self) -> R<i64> {
        self.conn()
            .query_row("SELECT count(*) FROM accounts", [], |r| r.get(0))
            .map_err(e)
    }

    pub fn create_account(
        &self,
        email: &str,
        name: &str,
        lang: &str,
        password: Option<&str>,
        admin: bool,
    ) -> R<Account> {
        let hashed = password.map(crypto::hash_password).transpose()?;
        self.create_account_hashed(email, name, lang, hashed, admin)
    }

    /// [`Db::create_account`] with the password already hashed — by a
    /// request, in one of the hashes' places (`crate::hashes`).
    pub fn create_account_hashed(
        &self,
        email: &str,
        name: &str,
        lang: &str,
        hashed: Option<String>,
        admin: bool,
    ) -> R<Account> {
        let id = crypto::id()?;
        let created = now();
        self.conn()
            .execute(
                "INSERT INTO accounts (id, email, email_fold, name, lang, password, admin, may_create, created)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8)",
                params![id, email.trim(), fold_email(email), name.trim(), lang, hashed, admin, created],
            )
            .map_err(|err| match err {
                rusqlite::Error::SqliteFailure(f, _)
                    if f.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    "exists".to_owned()
                }
                other => other.to_string(),
            })?;
        self.account(&id)?
            .ok_or_else(|| "account vanished".to_owned())
    }

    fn account_from(r: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
        Ok(Account {
            id: r.get(0)?,
            email: r.get(1)?,
            name: r.get(2)?,
            lang: r.get(3)?,
            password: r.get(4)?,
            admin: r.get(5)?,
            may_create: r.get(6)?,
            created: r.get(7)?,
        })
    }

    const ACCOUNT: &'static str =
        "SELECT id, email, name, lang, password, admin, may_create, created FROM accounts";

    pub fn account(&self, id: &str) -> R<Option<Account>> {
        self.conn()
            .query_row(
                &format!("{} WHERE id = ?1", Self::ACCOUNT),
                [id],
                Self::account_from,
            )
            .optional()
            .map_err(e)
    }

    pub fn account_by_email(&self, email: &str) -> R<Option<Account>> {
        self.conn()
            .query_row(
                &format!("{} WHERE email_fold = ?1", Self::ACCOUNT),
                [fold_email(email)],
                Self::account_from,
            )
            .optional()
            .map_err(e)
    }

    pub fn accounts(&self) -> R<Vec<Account>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(&format!("{} ORDER BY email_fold", Self::ACCOUNT))
            .map_err(e)?;
        st.query_map([], Self::account_from)
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }

    pub fn set_password(&self, account: &str, password: &str) -> R<()> {
        self.set_hashed_password(account, &crypto::hash_password(password)?)
    }

    /// [`Db::set_password`] with the password already hashed.
    pub fn set_hashed_password(&self, account: &str, hashed: &str) -> R<()> {
        self.conn()
            .execute(
                "UPDATE accounts SET password = ?2 WHERE id = ?1",
                params![account, hashed],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn set_profile(&self, account: &str, name: &str, lang: &str) -> R<()> {
        self.conn()
            .execute(
                "UPDATE accounts SET name = ?2, lang = ?3 WHERE id = ?1",
                params![account, name.trim(), lang],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn set_powers(&self, account: &str, admin: bool, may_create: bool) -> R<()> {
        self.conn()
            .execute(
                "UPDATE accounts SET admin = ?2, may_create = ?3 WHERE id = ?1",
                params![account, admin, may_create],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn delete_account(&self, account: &str) -> R<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM accounts WHERE id = ?1", [account])
            .map_err(e)?;
        self.refresh_images(&conn);
        Ok(())
    }

    pub fn admin_count(&self) -> R<i64> {
        self.conn()
            .query_row("SELECT count(*) FROM accounts WHERE admin", [], |r| {
                r.get(0)
            })
            .map_err(e)
    }

    /* ---------- sessions ---------- */

    /// A new session for `account`: the token to hand over, once, and the
    /// session's CSRF token. A browser's is proved now — it is a sign-in
    /// (ADR 0083 item 6); a device's is not: its approval proved the
    /// browser that approved it, not the app that holds the token, which
    /// proves itself before a sensitive action as any session does.
    pub fn create_session(
        &self,
        account: &str,
        kind: &str,
        device: &str,
        address: &str,
    ) -> R<(String, String)> {
        let token = crypto::token()?;
        let csrf = crypto::token()?;
        let at = now();
        let proved = if kind == "device" { 0 } else { at };
        self.conn()
            .execute(
                "INSERT INTO sessions (id, hash, account, kind, device, csrf, created, last_used, address, proved_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9)",
                params![crypto::id()?, crypto::hash(&token), account, kind, device, csrf, at, address, proved],
            )
            .map_err(e)?;
        Ok((token, csrf))
    }

    /// The live session a token opens, its use recorded; an expired one is
    /// ended here.
    pub fn session(&self, token: &str) -> R<Option<SessionRow>> {
        let conn = self.conn();
        let row = conn
            .query_row(
                "SELECT id, account, kind, csrf, created, last_used FROM sessions WHERE hash = ?1",
                [crypto::hash(token)],
                |r| {
                    Ok(SessionRow {
                        id: r.get(0)?,
                        account: r.get(1)?,
                        kind: r.get(2)?,
                        csrf: r.get(3)?,
                        created: r.get(4)?,
                        last_used: r.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(e)?;
        let Some(row) = row else { return Ok(None) };
        let at = now();
        let max = if row.kind == "device" {
            DEVICE_MAX
        } else {
            SESSION_MAX
        };
        if at - row.last_used > SESSION_IDLE || at - row.created > max {
            conn.execute("DELETE FROM sessions WHERE id = ?1", [&row.id])
                .map_err(e)?;
            return Ok(None);
        }
        // Written at most once a minute: a session used constantly does not
        // write on every request.
        if at - row.last_used > 60 {
            conn.execute(
                "UPDATE sessions SET last_used = ?2 WHERE id = ?1",
                params![row.id, at],
            )
            .map_err(e)?;
        }
        Ok(Some(row))
    }

    pub fn sessions_of(&self, account: &str) -> R<Vec<SessionInfo>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT id, kind, device, created, last_used, address FROM sessions
                 WHERE account = ?1 ORDER BY last_used DESC",
            )
            .map_err(e)?;
        st.query_map([account], |r| {
            Ok(SessionInfo {
                id: r.get(0)?,
                kind: r.get(1)?,
                device: r.get(2)?,
                created: r.get(3)?,
                last_used: r.get(4)?,
                address: r.get(5)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /// End one session of `account`; false when it has none of that id.
    pub fn end_session(&self, account: &str, id: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "DELETE FROM sessions WHERE account = ?1 AND id = ?2",
                params![account, id],
            )
            .map_err(e)?
            > 0)
    }

    /// End every session of `account` but `keep`.
    pub fn end_sessions(&self, account: &str, keep: Option<&str>) -> R<usize> {
        self.conn()
            .execute(
                "DELETE FROM sessions WHERE account = ?1 AND id IS NOT ?2",
                params![account, keep],
            )
            .map_err(e)
    }

    /* ---------- folders and grants ---------- */

    pub fn folders(&self) -> R<Vec<Folder>> {
        let conn = self.conn();
        let mut st = conn
            .prepare("SELECT id, dir, created FROM folders ORDER BY dir")
            .map_err(e)?;
        st.query_map([], |r| {
            Ok(Folder {
                id: r.get(0)?,
                dir: r.get(1)?,
                created: r.get(2)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    pub fn folder(&self, id: &str) -> R<Option<Folder>> {
        self.conn()
            .query_row(
                "SELECT id, dir, created FROM folders WHERE id = ?1",
                [id],
                |r| {
                    Ok(Folder {
                        id: r.get(0)?,
                        dir: r.get(1)?,
                        created: r.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(e)
    }

    pub fn folder_by_dir(&self, dir: &str) -> R<Option<Folder>> {
        self.conn()
            .query_row(
                "SELECT id, dir, created FROM folders WHERE dir = ?1",
                [dir],
                |r| {
                    Ok(Folder {
                        id: r.get(0)?,
                        dir: r.get(1)?,
                        created: r.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(e)
    }

    /// Register the directory `dir` (a name under `VERSO_FOLDERS_DIR`) as a
    /// folder owned by `owner` (ADR 0075, the maintainer's answer J).
    pub fn create_folder(&self, dir: &str, owner: &str) -> R<Folder> {
        let id = crypto::id()?;
        let at = now();
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        tx.execute(
            "INSERT INTO folders (id, dir, created) VALUES (?1, ?2, ?3)",
            params![id, dir, at],
        )
        .map_err(e)?;
        tx.execute(
            "INSERT INTO grants (folder, account, role) VALUES (?1, ?2, 'owner')",
            params![id, owner],
        )
        .map_err(e)?;
        tx.commit().map_err(e)?;
        Ok(Folder {
            id,
            dir: dir.to_owned(),
            created: at,
        })
    }

    pub fn rename_folder(&self, id: &str, dir: &str) -> R<()> {
        self.conn()
            .execute(
                "UPDATE folders SET dir = ?2 WHERE id = ?1",
                params![id, dir],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn forget_folder(&self, id: &str) -> R<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM folders WHERE id = ?1", [id])
            .map_err(e)?;
        self.refresh_images(&conn);
        Ok(())
    }

    pub fn role(&self, folder: &str, account: &str) -> R<Option<Role>> {
        let role: Option<String> = self
            .conn()
            .query_row(
                "SELECT role FROM grants WHERE folder = ?1 AND account = ?2",
                params![folder, account],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)?;
        Ok(role.as_deref().and_then(Role::parse))
    }

    pub fn grant(&self, folder: &str, account: &str, role: Role) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO grants (folder, account, role) VALUES (?1, ?2, ?3)
                 ON CONFLICT (folder, account) DO UPDATE SET role = excluded.role",
                params![folder, account, role.as_str()],
            )
            .map_err(e)?;
        // A role that writes makes it a game master, not a player.
        self.campaign_account_left(folder, account)
    }

    pub fn revoke(&self, folder: &str, account: &str) -> R<()> {
        self.conn()
            .execute(
                "DELETE FROM grants WHERE folder = ?1 AND account = ?2",
                params![folder, account],
            )
            .map_err(e)?;
        self.campaign_account_left(folder, account)
    }

    /// The folders `account` may enter, with its role in each.
    pub fn folders_of(&self, account: &str) -> R<Vec<(Folder, Role)>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT f.id, f.dir, f.created, g.role FROM folders f
                 JOIN grants g ON g.folder = f.id WHERE g.account = ?1 ORDER BY f.dir",
            )
            .map_err(e)?;
        st.query_map([account], |r| {
            Ok((
                Folder {
                    id: r.get(0)?,
                    dir: r.get(1)?,
                    created: r.get(2)?,
                },
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(e)?
        .filter_map(|row| match row {
            Ok((f, role)) => Role::parse(&role).map(|r| Ok((f, r))),
            Err(err) => Some(Err(err)),
        })
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /// The members of a folder: account and role.
    pub fn members(&self, folder: &str) -> R<Vec<(Account, Role)>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT a.id, a.email, a.name, a.lang, a.password, a.admin, a.may_create, a.created, g.role
                 FROM grants g JOIN accounts a ON a.id = g.account WHERE g.folder = ?1
                 ORDER BY a.email_fold",
            )
            .map_err(e)?;
        st.query_map([folder], |r| {
            Ok((Self::account_from(r)?, r.get::<_, String>(8)?))
        })
        .map_err(e)?
        .filter_map(|row| match row {
            Ok((a, role)) => Role::parse(&role).map(|r| Ok((a, r))),
            Err(err) => Some(Err(err)),
        })
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /* ---------- invitations, resets, the setup link ---------- */

    /// A single-use link's token, made now; its row says what it does.
    pub fn create_invitation(&self, link: &NewLink<'_>) -> R<(String, Invitation)> {
        let NewLink {
            kind,
            email,
            account,
            folder,
            role,
            created_by,
            life,
            share,
        } = *link;
        let token = crypto::token()?;
        let id = crypto::id()?;
        let at = now();
        self.conn()
            .execute(
                "INSERT INTO invitations (id, hash, kind, email, account, folder, role, created_by, created, expires, share, scope)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    id,
                    crypto::hash(&token),
                    kind,
                    email.map(str::trim),
                    account,
                    folder,
                    role.map(Role::as_str),
                    created_by,
                    at,
                    at + life,
                    share,
                    if share.is_some() { "share" } else { "folder" }
                ],
            )
            .map_err(e)?;
        let invitation = self
            .invitation(&id)?
            .ok_or_else(|| "invitation vanished".to_owned())?;
        Ok((token, invitation))
    }

    const INVITATION: &'static str = "SELECT id, kind, email, account, folder, role, created_by, created, expires, used, used_by, ended, share, scope FROM invitations";

    fn invitation_from(r: &rusqlite::Row<'_>) -> rusqlite::Result<Invitation> {
        Ok(Invitation {
            id: r.get(0)?,
            kind: r.get(1)?,
            email: r.get(2)?,
            account: r.get(3)?,
            folder: r.get(4)?,
            role: r.get(5)?,
            created_by: r.get(6)?,
            created: r.get(7)?,
            expires: r.get(8)?,
            used: r.get(9)?,
            used_by: r.get(10)?,
            ended: r.get(11)?,
            share: r.get(12)?,
            for_share: r.get::<_, String>(13)? == "share",
        })
    }

    pub fn invitation(&self, id: &str) -> R<Option<Invitation>> {
        self.conn()
            .query_row(
                &format!("{} WHERE id = ?1", Self::INVITATION),
                [id],
                Self::invitation_from,
            )
            .optional()
            .map_err(e)
    }

    /// The pending link of `kind` a token opens: not used, not ended, not
    /// expired.
    pub fn pending(&self, token: &str, kind: &str) -> R<Option<Invitation>> {
        let found = self
            .conn()
            .query_row(
                &format!("{} WHERE hash = ?1 AND kind = ?2", Self::INVITATION),
                params![crypto::hash(token), kind],
                Self::invitation_from,
            )
            .optional()
            .map_err(e)?;
        Ok(found.filter(|i| i.state(now()) == "pending"))
    }

    /// Mark a link used by `account`; false when it was not pending any
    /// more (two tabs racing for one link: one wins).
    pub fn use_invitation(&self, id: &str, account: &str) -> R<bool> {
        let at = now();
        Ok(self
            .conn()
            .execute(
                "UPDATE invitations SET used = ?2, used_by = ?3
                 WHERE id = ?1 AND used IS NULL AND ended IS NULL AND expires > ?2",
                params![id, at, account],
            )
            .map_err(e)?
            > 0)
    }

    pub fn end_invitation(&self, id: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "UPDATE invitations SET ended = ?2 WHERE id = ?1 AND used IS NULL AND ended IS NULL",
                params![id, now()],
            )
            .map_err(e)?
            > 0)
    }

    /// End every pending link of `kind` for `account` (a new reset link
    /// replaces the old one).
    pub fn end_links_of(&self, account: &str, kind: &str) -> R<()> {
        self.conn()
            .execute(
                "UPDATE invitations SET ended = ?3
                 WHERE account = ?1 AND kind = ?2 AND used IS NULL AND ended IS NULL",
                params![account, kind, now()],
            )
            .map_err(e)?;
        Ok(())
    }

    /// End every pending setup link (an admin now exists).
    pub fn end_setup_links(&self) -> R<()> {
        self.conn()
            .execute(
                "UPDATE invitations SET ended = ?1 WHERE kind = 'setup' AND used IS NULL AND ended IS NULL",
                [now()],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn invitations(&self) -> R<Vec<Invitation>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(&format!(
                "{} WHERE kind = 'invite' ORDER BY created DESC",
                Self::INVITATION
            ))
            .map_err(e)?;
        st.query_map([], Self::invitation_from)
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }

    /* ---------- a session's device, and whether it stands (the tokens: db/tokens.rs) ---------- */

    /// The name of the device behind session `id`, when it is a device's.
    pub fn session_device(&self, id: &str) -> R<Option<String>> {
        self.reader()
            .query_row(
                "SELECT device FROM sessions WHERE id = ?1 AND kind = 'device'",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    /// Name the device behind session `id` again; false when it is no
    /// device's session.
    pub fn rename_device(&self, id: &str, device: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "UPDATE sessions SET device = ?2 WHERE id = ?1 AND kind = 'device'",
                params![id, device],
            )
            .map_err(e)?
            > 0)
    }

    /// Whether session `id` still stands (not ended, not expired by the
    /// last look at it).
    pub fn session_alive(&self, id: &str) -> R<bool> {
        let row: Option<(String, i64, i64)> = self
            .conn()
            .query_row(
                "SELECT kind, created, last_used FROM sessions WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(e)?;
        let at = now();
        let alive = row.as_ref().is_some_and(|(kind, created, last)| {
            let max = if kind == "device" {
                DEVICE_MAX
            } else {
                SESSION_MAX
            };
            at - last <= SESSION_IDLE && at - created <= max
        });
        // A window that only speaks over its WebSocket is in use too: its
        // session is touched as a request's is, at most once a minute.
        if alive && row.is_some_and(|(_, _, last)| at - last > 60) {
            self.conn()
                .execute(
                    "UPDATE sessions SET last_used = ?2 WHERE id = ?1",
                    params![id, at],
                )
                .map_err(e)?;
        }
        Ok(alive)
    }

    /* ---------- the person's settings (ADR 0073 item 5) ---------- */

    pub fn person_settings(&self, account: &str) -> R<Option<String>> {
        self.conn()
            .query_row(
                "SELECT json FROM account_settings WHERE account = ?1",
                [account],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    pub fn set_person_settings(&self, account: &str, json: &str) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO account_settings (account, json, updated) VALUES (?1, ?2, ?3)
                 ON CONFLICT (account) DO UPDATE SET json = excluded.json, updated = excluded.updated",
                params![account, json, now()],
            )
            .map_err(e)?;
        Ok(())
    }

    /* ---------- passkeys (ADR 0074 item 3) ---------- */

    /// The passkeys of an account: id, name, the credential as webauthn-rs
    /// serializes it, dates.
    pub fn passkeys(&self, account: &str) -> R<Vec<PasskeyRow>> {
        let conn = self.conn();
        let mut st = conn
            .prepare("SELECT id, name, credential, created, last_used FROM passkeys WHERE account = ?1 ORDER BY created")
            .map_err(e)?;
        st.query_map([account], |r| {
            Ok(PasskeyRow {
                id: r.get(0)?,
                name: r.get(1)?,
                credential: r.get(2)?,
                created: r.get(3)?,
                last_used: r.get(4)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    pub fn add_passkey(&self, account: &str, name: &str, credential: &str) -> R<String> {
        let id = crypto::id()?;
        self.conn()
            .execute(
                "INSERT INTO passkeys (id, account, name, credential, created) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, account, name.trim(), credential, now()],
            )
            .map_err(e)?;
        Ok(id)
    }

    /// The credential after a sign-in (its counter moved).
    pub fn used_passkey(&self, id: &str, credential: &str) -> R<()> {
        self.conn()
            .execute(
                "UPDATE passkeys SET credential = ?2, last_used = ?3 WHERE id = ?1",
                params![id, credential, now()],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn remove_passkey(&self, account: &str, id: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "DELETE FROM passkeys WHERE account = ?1 AND id = ?2",
                params![account, id],
            )
            .map_err(e)?
            > 0)
    }

    /* ---------- the audit log (ADR 0074 item 9) ---------- */

    pub fn audit(&self, a: &Audit<'_>) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO audit (at, actor, action, subject, folder, address, ok) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![now(), a.actor, a.action, a.subject, a.folder, a.address, a.ok],
            )
            .map_err(e)?;
        Ok(())
    }

    /// The last `limit` entries, of one folder or of all.
    pub fn audit_log(&self, folder: Option<&str>, limit: i64) -> R<Vec<AuditEntry>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT at, actor, action, subject, folder, address, ok, path FROM audit
                 WHERE ?1 IS NULL OR folder = ?1 ORDER BY at DESC, rowid DESC LIMIT ?2",
            )
            .map_err(e)?;
        st.query_map(params![folder, limit], |r| {
            Ok(AuditEntry {
                at: r.get(0)?,
                actor: r.get(1)?,
                action: r.get(2)?,
                subject: r.get(3)?,
                folder: r.get(4)?,
                address: r.get(5)?,
                ok: r.get(6)?,
                path: r.get(7)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /* ---------- settings of the server ---------- */

    pub fn setting(&self, key: &str) -> R<Option<String>> {
        self.conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
                r.get(0)
            })
            .optional()
            .map_err(e)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map_err(e)?;
        Ok(())
    }
}

mod access;
pub use access::words_of;
mod audit;
mod campaign;
pub use campaign::{
    Audience, Campaign, Grant, IMAGE_DEFAULT, IMAGE_LEAST, IMAGE_MOST, LOG_DEFAULT, LOG_LEAST,
    LOG_MOST, NoteState,
};
mod console;
mod local;
mod proof;
mod readlinks;
mod shares;
mod sync;
mod table;
pub use table::{ROWS_MOST, Row as TableRow};
mod tokens;
mod trash;
pub use console::{AccountRow, AuditFilter, FolderRow, Page, PageQuery};
pub use local::{LOCAL_OWNER, LOCAL_OWNER_UNNAMED, Phone, VAULT_HOLDER, is_this_computer};
pub use readlinks::{NewReadLink, ReadLink};
pub use shares::{Share, covers};
pub use sync::{Change, Known, Made, Notice, Notices, ReaderOf, Recorded};
pub use trash::FolderBook;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_access;
