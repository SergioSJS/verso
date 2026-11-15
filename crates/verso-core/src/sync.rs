// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync's engine (ADR 0079): what to send, fetch, delete and rename so a
//! folder on this computer and its folder on a server hold the same files,
//! decided from three pictures — the files here, the files there, and the
//! **base**, what both sides last agreed on — per file, by hash. No
//! network and no disk: the host reads the pictures and carries out the
//! plan through `verso-fs` and the device's session.
//!
//! The rules, per path (L here, R there, B the base):
//! - L = R: agreed.
//! - only one side changed since B: that change crosses (an edit, a new
//!   file, a deletion);
//! - both changed: a deletion against an edit keeps the edit (the file
//!   comes back); two edits are a **conflict** — the server's version
//!   keeps the name, this computer's is kept beside it as a copy that
//!   syncs too (item 8);
//! - the first sync of a folder (no base) never deletes (item 11);
//! - a plan that would delete more than a fifth of the folder's files, or
//!   more than 50, pauses and asks — never for fewer than 3 (item 9);
//! - a file gone here and a new one of the same bytes since the base, on
//!   one side, is a rename (item 10);
//! - one name is one file everywhere (spec Q7): a path here and a path
//!   there that differ only in their accents' Unicode form (NFC, NFD) are
//!   one file on every system, planned under this computer's spelling —
//!   the server writes to the file it keeps; two such files here (ext4
//!   keeps both) are one synced and the other held, said;
//! - where this computer's file system folds names (APFS, NTFS), a path
//!   here and a path there that differ only in case are one file: a
//!   respelling here crosses as a rename when the server's file is as the
//!   base left it; otherwise the server's spelling is taken here first and
//!   the file is planned as one — its edit wins over a respelling, two
//!   edits are a conflict. The base, too, keeps one entry per name: two
//!   spellings a step left in it are one again before anything is
//!   planned.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

mod append;
pub use append::{append_merge, merges_by_append, template_merge};
pub mod remote;

/// A file as one side holds it: its bytes' SHA-256 and size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileState {
    pub hash: String,
    pub size: u64,
}

/// One side's files, by path relative to the folder.
pub type Files = BTreeMap<String, FileState>;

/// What sync keeps of a folder between runs, outside it (ADR 0011): the
/// server and the folder there, the cursor in its log, and the base.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct State {
    pub server: String,
    pub folder: String,
    pub cursor: i64,
    /// Path → the hash both sides last agreed on.
    pub base: BTreeMap<String, String>,
    pub paused: bool,
    /// Turned off by the person (item 1): kept with its base, so that
    /// turning it on again with the same folder of the server goes on
    /// from where it stopped instead of a first sync.
    #[serde(default)]
    pub off: bool,
    /// Path → the size and time a file of this computer had when its hash
    /// was read, and that hash: a file unchanged since is not read again.
    /// Kept only for files older than the moment they were read by a
    /// margin, so an edit in the same second is never taken for the same
    /// file.
    #[serde(default)]
    pub seen: BTreeMap<String, Seen>,
    /// Turned off because the folder's owner revoked the share (ADR 0081
    /// item 8): when, and the folder's name there, for the window to say
    /// it until the person turns sync on again.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revoked: Option<Revoked>,
    /// Path → the SHA-256 of the text a note was made with on this
    /// computer from its template — a periodic note filled from its
    /// template (ADR 0093 item 12) — kept until the server has the path:
    /// the base of [`template_merge`] when the server holds a note of the
    /// same name another device made apart.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub made: BTreeMap<String, String>,
    /// The cloud this folder syncs with, when it is not a UniVerso (ADR
    /// 0104): which service and where, never a secret — those are in the
    /// system's keychain. `server` then holds a name for it, not an
    /// address to sign in to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cloud: Option<Cloud>,
    /// A cloud's files as last listed: the version each had and the hash
    /// found for it, so that a listing that shows the same version needs
    /// no read (ADR 0104 item 8).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub tokens: BTreeMap<String, remote::Token>,
    /// Path → what the server last said this device may change there (ADR
    /// 0113 S8), only the files it may change. The last answer holds while
    /// offline: a file with no entry is a file the device only reads.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub access: BTreeMap<String, remote::Rights>,
    /// Who the server says this device is at the folder (its `FolderAccess`
    /// as JSON, ADR 0113 S8): the last answer holds while offline.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seat: Option<serde_json::Value>,
    /// The state saved before did not read (empty, cut short, not JSON —
    /// a power cut or a phone that died while it was written): it was set
    /// aside, never deleted, and this state stands in for it, off, so that
    /// the window says why instead of a plain "off" ([`load_checked`]).
    /// Turning sync on again writes a state without it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unreadable: Option<Unreadable>,
}

/// A saved state found unreadable, and where it was kept.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Unreadable {
    /// Seconds since the Unix epoch when it was found.
    pub at: i64,
    /// The name it was set aside under, in the configuration directory.
    pub aside: String,
}

/// What [`load_checked`] found of a folder's saved state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Loaded {
    /// None saved: the folder never synced here, or was forgotten.
    Missing,
    /// The state as last saved (boxed: a state is large, the other
    /// answers small).
    Found(Box<State>),
    /// What was saved did not read: set aside as [`Unreadable::aside`],
    /// never deleted. Sync is off until the person turns it on again —
    /// then a first sync, which deletes nothing (item 11).
    Unreadable(Unreadable),
}

/// When a long pass saves the state it has reached: after every
/// [`Checkpoint::STEPS`] steps carried out, or [`Checkpoint::EVERY`]
/// since the last save, whichever comes first — so that a pass cut short
/// (a first download of a whole folder, a link that drops) goes on from
/// there instead of starting over. The host saves only after a step
/// completed, whose base entry is then true; a step not carried out has
/// none.
#[derive(Debug, Clone)]
pub struct Checkpoint {
    steps: usize,
    since: std::time::Instant,
    every_steps: usize,
    every: std::time::Duration,
}

impl Default for Checkpoint {
    fn default() -> Self {
        Self::new(Self::STEPS, Self::EVERY)
    }
}

impl Checkpoint {
    /// The steps between two saves.
    pub const STEPS: usize = 50;
    /// The longest time between two saves while steps complete.
    pub const EVERY: std::time::Duration = std::time::Duration::from_secs(30);

    #[must_use]
    pub fn new(every_steps: usize, every: std::time::Duration) -> Self {
        Self {
            steps: 0,
            since: std::time::Instant::now(),
            every_steps: every_steps.max(1),
            every,
        }
    }

    /// One step carried out: whether to save now. Saying yes starts the
    /// count again.
    pub fn step(&mut self) -> bool {
        self.steps += 1;
        if self.steps >= self.every_steps || self.since.elapsed() >= self.every {
            self.steps = 0;
            self.since = std::time::Instant::now();
            return true;
        }
        false
    }
}

/// A cloud a folder syncs with (ADR 0104 item 6): WebDAV or S3, and where.
/// The secret — a password, an S3 secret key — is kept apart, in the
/// system's keychain (item 14).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cloud {
    /// `webdav` or `s3`.
    pub provider: String,
    /// WebDAV: the folder's address. S3: the endpoint's address (empty for
    /// AWS, whose address follows from the region).
    pub endpoint: String,
    /// S3: the bucket.
    #[serde(default)]
    pub bucket: String,
    /// S3: the prefix inside the bucket (a folder of keys); WebDAV: unused.
    #[serde(default)]
    pub prefix: String,
    /// S3: the region the requests are signed for.
    #[serde(default)]
    pub region: String,
    /// WebDAV: the user. S3: the access key's id.
    #[serde(default)]
    pub user: String,
    /// S3: the bucket is named in the path, not the host (MinIO and most
    /// self-hosted services).
    #[serde(default)]
    pub path_style: bool,
    /// The person confirmed that a plain-HTTP address on the local network
    /// is theirs (ADR 0104 item 6).
    #[serde(default)]
    pub plain_http: bool,
    /// What the capability probe found the service can do (ADR 0104 item
    /// 7), as the adapter's own names for them; kept so that the probe
    /// runs when the person connects, not at every start.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub caps: Vec<String>,
    /// What deleting a file there means, found when the person connected
    /// (item 9): `final`, `kept` or `unknown`.
    #[serde(default)]
    pub deletions: String,
    /// What the checks found that the person should know, said again in
    /// the folder's settings.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
}

/// A share revoked by its owner, as the device heard it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Revoked {
    /// `YYYY-MM-DDTHH:MM:SSZ`.
    pub at: String,
    /// The server's folder's name, as the sync last knew it.
    pub name: String,
}

/// A file of this computer as last hashed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Seen {
    pub size: u64,
    pub modified: i64,
    pub hash: String,
}

/// One step of a plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// Send this computer's file; `base` is the server's hash it replaces
    /// (none for a new file there).
    Upload { path: String, base: Option<String> },
    /// Fetch the server's file over this computer's (or as new).
    Download { path: String, hash: String },
    /// Delete the server's file, which must still be `base`.
    DeleteRemote { path: String, base: String },
    /// Delete this computer's file (to the system's bin).
    DeleteLocal { path: String },
    /// Rename on the server; the file there must still be `base`.
    RenameRemote {
        from: String,
        to: String,
        base: String,
    },
    /// Rename here.
    RenameLocal { from: String, to: String },
    /// Both changed: this computer's file is renamed to `copy` and sent as
    /// new, then the server's fetched under `path`.
    Conflict {
        path: String,
        copy: String,
        hash: String,
    },
    /// Both hold the same bytes, or neither the file: the base records it.
    Agree { path: String, hash: Option<String> },
}

/// A plan, and whether it waits for the person.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Plan {
    pub actions: Vec<Action>,
    /// How many files the plan would delete, when that is many enough to
    /// ask first (item 9): nothing is carried out until the person says.
    pub pause: Option<usize>,
    /// Paths sync leaves alone on this pass: another file has the same
    /// name in the other Unicode form (spec Q7).
    pub held: Vec<Held>,
}

/// A path sync leaves alone: another file holds its name in the other
/// Unicode form — two files here on a file system that tells the forms
/// apart (`here`), or two on the server from before the decision — or,
/// on the server (`case`), another file holds a name that differs from it
/// only in case: two files on its disk, and this computer keeps one
/// (spec Q8: a new name differing only in case is refused where it is
/// made, so the second would be refused here on every pass).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Held {
    pub path: String,
    pub here: bool,
    pub case: bool,
}

/// The fewest deletions in one pass that pause it (item 9, revised
/// 2026-10-10).
pub const PAUSE_FLOOR: usize = 3;

/// The sync protocol's version (item 5, decided 2026-10-11): an integer
/// each side says as the WebSocket opens — a device in its request's
/// [`PROTOCOL_HEADER`], the server in its hello. The sync's commands are
/// not in the generated bindings, so the contract's version does not
/// cover their wire: this number is raised before any change to it.
///
/// 2 (2026-10-12, one version for both changes): each change
/// `sync_changes` answers may carry `device`, the name of the device whose
/// sync made it, and `by`, the person's — fields a device of sync 1
/// ignores; and a piece of a
/// file crosses as a binary WebSocket message ([`frame`]) instead of
/// base64 inside the JSON text, both ways (item 12 revised) — a side that
/// speaks 1, or says no version, is still sent and taken base64, as the
/// version before is followed (item 5). Also in 2, still unreleased when
/// added: a change the server refuses because its new name differs only
/// in case from a sibling (spec Q8) answers with the error kind
/// `case_twin`, which a device of 2 lists as a name taken; a device of 1
/// does not know the kind, cannot read the error, and lists the file as
/// failed ("the server refused") — as it lists any refusal it cannot read.
/// And through a share, `head` and each change's `seq` count the share's
/// own changes, never the folder's (3.18); the cursor is opaque to the
/// device, which keeps it only while connected.
pub const PROTOCOL: u32 = 2;

/// The first sync whose pieces cross as binary messages.
pub const BINARY_PIECES: u32 = 2;

/// Whether a side that speaks sync `version` takes and sends a piece of a
/// file as a binary message ([`frame`]) rather than base64 in the JSON.
#[must_use]
pub const fn binary_pieces(version: u32) -> bool {
    version >= BINARY_PIECES
}

/// A piece of a file in one binary message: the length of a JSON header
/// in four bytes (big-endian), the header — a request's `{id, cmd, args}`
/// or an answer's `{id, ok}` / `{id, err}`, as the text messages carry
/// them — then the piece's bytes as they are, no base64.
#[must_use]
pub fn frame(header: &[u8], data: &[u8]) -> Vec<u8> {
    let len = u32::try_from(header.len()).unwrap_or(u32::MAX);
    let mut out = Vec::with_capacity(4 + header.len() + data.len());
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(header);
    out.extend_from_slice(data);
    out
}

/// A binary message's header and piece ([`frame`]); `None` when it is not
/// one — shorter than its header says.
#[must_use]
pub fn unframe(message: &[u8]) -> Option<(&[u8], &[u8])> {
    let (len, rest) = message.split_first_chunk::<4>()?;
    let len = usize::try_from(u32::from_be_bytes(*len)).ok()?;
    (len <= rest.len()).then(|| rest.split_at(len))
}

/// The header of the WebSocket's request a device says its [`PROTOCOL`]
/// in.
pub const PROTOCOL_HEADER: &str = "x-verso-sync";

/// Whether a side that speaks sync `ours` follows one that speaks
/// `theirs`: the newer side decides, and takes its own version and the
/// one before (item 5); one older than that is refused. A side newer than
/// `ours` is not this side's to judge.
#[must_use]
pub const fn follows(ours: u32, theirs: u32) -> bool {
    theirs.saturating_add(1) >= ours
}

/// Whether a path can cross to every system (ADR 0070 item 3): one that
/// cannot is listed by sync instead of sent, since the server would refuse
/// it.
#[must_use]
pub fn portable(path: &str) -> bool {
    verso_fs::is_portable(std::path::Path::new(path))
}

/// Whether `path` is in the folder's own settings directory, `.verso/`
/// (ADR 0070 items 1–2): synced with a folder of one's own, but this
/// machine's business in a share's folder — a share carries the shared
/// folder's notes and files, never the receiver's settings.
#[must_use]
pub fn settings_path(path: &str) -> bool {
    verso_fs::is_settings_path(path)
}

/// Whether this system's file systems fold names by default (APFS, NTFS):
/// where they do not (Linux), two names differing in case are two files.
pub const FOLDS_NAMES: bool = cfg!(any(target_os = "macos", windows));

/// A path as every device and the server compare names (spec Q7, decided
/// 2026-10-10): its accents in one Unicode form, the composed one (NFC).
/// Two paths of one `folded_form` are one file everywhere, whatever the
/// file system — ext4 tells `Café.md` composed and decomposed apart, sync
/// does not. Case is not folded here, only where the file system folds it
/// ([`folded`], [`FOLDS_NAMES`]; spec Q8, decided 2026-10-12: a new name
/// differing only in case is refused where it is made, by `verso-fs`).
#[must_use]
pub fn folded_form(path: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    path.nfc().collect()
}

/// A path as a file system that ignores case and Unicode normalization
/// compares it — APFS, NTFS: `Nota.md`, `nota.md` and `Nota.md` written in
/// decomposed form are one file there. A path the listing lacks whose
/// folded form is a listed path's is that file renamed, not a second one.
#[must_use]
pub fn folded(path: &str) -> String {
    folded_form(path).to_lowercase()
}

/// The key under which a picture of the server's files holds the file
/// `path` names: `path` itself, or the spelling in the other Unicode form
/// the server keeps for that name. A plan names a file by this computer's
/// spelling and the server writes to the file it keeps; a host that
/// updates its picture of the server after a step updates this entry, so
/// the picture keeps one entry per file, as the server does.
#[must_use]
pub fn spelled_there(files: &Files, path: &str) -> String {
    if files.contains_key(path) {
        return path.to_owned();
    }
    let name = folded_form(path);
    // A name all ASCII is its own composed form: only another spelling
    // with an accent (or a sign NFC turns into a letter) can match.
    files
        .keys()
        .find(|p| !p.is_ascii() && folded_form(p) == name)
        .cloned()
        .unwrap_or_else(|| path.to_owned())
}

/// The name a conflict's copy takes (item 8): `<stem> (conflict, <device>,
/// <when>).<ext>`, in the person's language, with characters every system
/// keeps (ADR 0070 item 3), not one of `taken` — compared as a file system
/// that folds names compares them, so that every device can hold it.
#[must_use]
pub fn conflict_name(
    path: &str,
    device: &str,
    when: &str,
    pt: bool,
    taken: &BTreeSet<String>,
) -> String {
    let (dir, file) = path.rsplit_once('/').map_or(("", path), |(d, f)| (d, f));
    let (stem, ext) = match file.rfind('.') {
        Some(at) if at > 0 => (&file[..at], &file[at..]),
        _ => (file, ""),
    };
    let safe: String = device
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim()
        .chars()
        .take(40)
        .collect();
    let word = if pt { "conflito" } else { "conflict" };
    let at = |n: usize| {
        let more = if n > 1 {
            format!(" {n}")
        } else {
            String::new()
        };
        let name = format!("{stem} ({word}, {safe}, {when}{more}){ext}");
        if dir.is_empty() {
            name
        } else {
            format!("{dir}/{name}")
        }
    };
    let taken: BTreeSet<String> = taken.iter().map(|t| folded(t)).collect();
    let mut n = 1;
    while taken.contains(&folded(&at(n))) {
        n += 1;
    }
    at(n)
}

/// What the files and the base say to do. `folds`: whether this
/// computer's file system takes two names differing only in case or in
/// their accents' form for one ([`FOLDS_NAMES`]).
#[must_use]
pub fn plan(
    local: &Files,
    remote: &Files,
    state: &State,
    confirmed: bool,
    folds: bool,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
) -> Plan {
    plan_moved(
        local,
        remote,
        state,
        confirmed,
        folds,
        &BTreeMap::new(),
        copy_name,
    )
}

/// [`plan`], told what the server's log says was renamed since the base:
/// `moved` maps a name there now to the name the base knows it by (a chain
/// of renames already followed back to its start). A rename the log names
/// is a rename here even when its bytes changed too, which no pairing by
/// hash can tell from a deletion and a new file (decided 2026-10-31, B12:
/// a rename in the server's change log is applied on the device as one
/// rename, never as a delete and a create).
#[must_use]
pub fn plan_moved(
    local: &Files,
    remote: &Files,
    state: &State,
    confirmed: bool,
    folds: bool,
    moved: &BTreeMap<String, String>,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
) -> Plan {
    let first = state.base.is_empty();
    let size = local.len().max(remote.len()).max(state.base.len());
    let mut taken: BTreeSet<String> = local.keys().chain(remote.keys()).cloned().collect();
    // One name, one file (spec Q7): the three pictures under this
    // computer's spelling of each name.
    let Named {
        local,
        mut remote,
        base,
        rebased,
        mut held,
    } = one_name_one_file(local, remote, &state.base);
    case_twins_there(&local, &mut remote, &base, &mut held);
    let mut base = base;
    let mut actions = Vec::new();
    let mut done: BTreeSet<String> = held.iter().map(|h| h.path.clone()).collect();
    // A base kept under another form of the name moves to this
    // computer's spelling first, so that a step refused below leaves it
    // there.
    for (from, to, hash) in rebased {
        actions.push(Action::Agree {
            path: to,
            hash: Some(hash),
        });
        actions.push(Action::Agree {
            path: from,
            hash: None,
        });
    }
    // Where names fold, one base entry per name too: a step that recorded
    // a second spelling beside the first is undone here, before anything
    // is planned from it.
    if folds {
        one_base_per_name(&local, &remote, &mut base, &mut actions);
    }
    let (local, remote, base) = (&local, &remote, &base);
    let hash = |files: &Files, p: &str| files.get(p).map(|f| f.hash.clone());

    if folds {
        respelled(
            local,
            remote,
            base,
            &mut done,
            &mut taken,
            copy_name,
            &mut actions,
        );
    }

    // The renames the server's log names, first: followed whatever the
    // bytes did since.
    if !first {
        moved_there(
            (local, remote, base),
            moved,
            &mut done,
            &mut taken,
            copy_name,
            &mut actions,
        );
    }

    // Renames first: a base path gone on one side, a new path there with
    // its bytes, the other side unchanged at the old path.
    if !first {
        for (old, b) in base {
            if done.contains(old) {
                continue;
            }
            let (l, r) = (hash(local, old), hash(remote, old));
            // Renamed here: gone here, unchanged there.
            if l.is_none()
                && r.as_deref() == Some(b.as_str())
                && let Some((new, _)) = local.iter().find(|(p, f)| {
                    &f.hash == b
                        && !base.contains_key(*p)
                        && !remote.contains_key(*p)
                        && !done.contains(*p)
                })
            {
                actions.push(Action::RenameRemote {
                    from: old.clone(),
                    to: new.clone(),
                    base: b.clone(),
                });
                done.insert(old.clone());
                done.insert(new.clone());
                continue;
            }
            // Renamed there: gone there, unchanged here.
            if r.is_none()
                && l.as_deref() == Some(b.as_str())
                && let Some((new, _)) = remote.iter().find(|(p, f)| {
                    &f.hash == b
                        && !base.contains_key(*p)
                        && !local.contains_key(*p)
                        && !done.contains(*p)
                })
            {
                actions.push(Action::RenameLocal {
                    from: old.clone(),
                    to: new.clone(),
                });
                done.insert(old.clone());
                done.insert(new.clone());
            }
        }
    }

    let paths: BTreeSet<&String> = local
        .keys()
        .chain(remote.keys())
        .chain(base.keys())
        .collect();
    for path in paths {
        if done.contains(path) {
            continue;
        }
        let hashes = (
            hash(local, path),
            hash(remote, path),
            base.get(path).cloned(),
        );
        decide(path, hashes, first, &mut taken, copy_name, &mut actions);
    }

    let deletions = actions
        .iter()
        .filter(|a| matches!(a, Action::DeleteLocal { .. } | Action::DeleteRemote { .. }))
        .count();
    // At least 3 (item 9, revised 2026-10-10): in a small folder a fifth
    // is one or two files, and one or two deletions are no folder gone.
    let many = deletions >= PAUSE_FLOOR && (deletions > 50 || deletions * 5 > size);
    Plan {
        pause: (many && !confirmed).then_some(deletions),
        actions,
        held,
    }
}

/// The three pictures with one entry per name (spec Q7), each under this
/// computer's spelling of it, and what that took.
#[derive(Default)]
struct Named {
    local: Files,
    remote: Files,
    base: BTreeMap<String, String>,
    /// Base entries moved to this computer's spelling: from, to, hash.
    rebased: Vec<(String, String, String)>,
    held: Vec<Held>,
}

/// One name, one file (spec Q7, decided 2026-10-10): two paths that differ
/// only in their accents' Unicode form are one file, here, there and in the
/// base, whatever the file systems. Each name is planned under the
/// spelling this computer's file system gave it — the server writes to the
/// file it keeps, under its own — or under the server's when this
/// computer has no such file.
///
/// Where this computer holds both forms as two files (ext4 tells them
/// apart; the state the campaign of 2026-10-10 left, finding F20), one
/// syncs — the one the base knows, else the one on the server, else the
/// composed spelling — and the other is held, the same one on every pass:
/// never sent to be refused again and again, never taken for a deletion.
/// Two forms on the server, from before the decision, the same.
fn one_name_one_file(local: &Files, remote: &Files, base: &BTreeMap<String, String>) -> Named {
    let mut named = Named::default();
    let by_name = |files: &Files| {
        let mut out: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for p in files.keys() {
            out.entry(folded_form(p)).or_default().push(p.clone());
        }
        out
    };
    // Which of a name's spellings is planned; the others are held.
    let pick = |name: &str, paths: &[String], first: Option<&String>, other: &Files| {
        first
            .filter(|f| paths.contains(f))
            .or_else(|| paths.iter().find(|p| base.contains_key(*p)))
            .or_else(|| paths.iter().find(|p| other.contains_key(*p)))
            .or_else(|| paths.iter().find(|p| p.as_str() == name))
            .or_else(|| paths.first())
            .cloned()
    };
    // Name → the spelling it is planned under.
    let mut spelling: BTreeMap<String, String> = BTreeMap::new();
    for (name, paths) in by_name(local) {
        let Some(kept) = pick(&name, &paths, None, remote) else {
            continue;
        };
        for p in paths.iter().filter(|p| **p != kept) {
            named.held.push(Held {
                path: p.clone(),
                here: true,
                case: false,
            });
        }
        if let Some(f) = local.get(&kept) {
            named.local.insert(kept.clone(), f.clone());
        }
        spelling.insert(name, kept);
    }
    for (name, paths) in by_name(remote) {
        let mine = spelling.get(&name).cloned();
        let Some(chosen) = pick(&name, &paths, mine.as_ref(), local) else {
            continue;
        };
        for p in paths.iter().filter(|p| **p != chosen) {
            named.held.push(Held {
                path: p.clone(),
                here: false,
                case: false,
            });
        }
        let at = mine.unwrap_or_else(|| chosen.clone());
        if let Some(f) = remote.get(&chosen) {
            named.remote.insert(at.clone(), f.clone());
        }
        spelling.entry(name).or_insert(at);
    }
    for (p, h) in base {
        let to = spelling.get(&folded_form(p)).unwrap_or(p);
        if to == p || base.contains_key(to) || named.base.contains_key(to) {
            // Its own spelling, or another entry has the name's: kept as
            // it is, and dropped by the rules by path (nothing on either
            // side under it).
            named.base.insert(p.clone(), h.clone());
        } else {
            named.base.insert(to.clone(), h.clone());
            named.rebased.push((p.clone(), to.clone(), h.clone()));
        }
    }
    named
}

/// Two files on the server whose names differ only in case (its disk
/// tells case apart; they were made before spec Q8 was decided, or
/// outside Verso): this computer keeps one of them, the same on every
/// pass, and holds the others — said once in the list of what is not
/// synced, never fetched to be refused here (a new name differing only in
/// case is refused where it is made, on every system), never taken for a
/// deletion. The ones this computer has, spelled exactly, or synced
/// before (the base knows them) stay in play — a Linux device may hold
/// both, and its edits and deletions cross; when none does, the first in
/// byte order.
fn case_twins_there(
    local: &Files,
    remote: &mut Files,
    base: &BTreeMap<String, String>,
    held: &mut Vec<Held>,
) {
    let mut by_name: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for p in remote.keys() {
        by_name.entry(folded(p)).or_default().push(p.clone());
    }
    for paths in by_name.into_values().filter(|p| p.len() > 1) {
        // What this computer has or had synced stays in play: its edits
        // and deletions cross as before.
        let mut kept: Vec<&String> = paths
            .iter()
            .filter(|p| local.contains_key(*p) || base.contains_key(*p))
            .collect();
        if kept.is_empty() {
            kept.extend(paths.first());
        }
        for p in paths.iter().filter(|p| !kept.contains(p)) {
            remote.remove(p);
            held.push(Held {
                path: p.clone(),
                here: false,
                case: true,
            });
        }
    }
}

/// One path's hashes here, there and in the base.
type Hashes = (Option<String>, Option<String>, Option<String>);

/// The key a picture holds a path under: the path itself, or its spelling
/// in the other Unicode form (spec Q7: the pictures are under this
/// computer's spelling, the log under the server's).
fn key_in<'a, V>(map: &'a BTreeMap<String, V>, path: &str) -> Option<&'a String> {
    if let Some((k, _)) = map.get_key_value(path) {
        return Some(k);
    }
    let name = folded_form(path);
    map.keys().find(|k| !k.is_ascii() && folded_form(k) == name)
}

/// The renames the server's log names (`moved`: the name there now → the
/// name the base knows), carried out here as renames (decided 2026-10-31,
/// B12): the file here is moved to the new name, and then planned there as
/// one file from its base — the server's newer bytes fetched, an edit made
/// here sent over the server's file as the base left it (invariant 11), two
/// edits a conflict under the new name (item 8). Nothing is followed that
/// could lose a file: the old name still on the server, the new name taken
/// here or known to the base, the file gone here — those are left to the
/// rules below (a name taken here keeps both, as a conflict's copy).
fn moved_there(
    (local, remote, base): (&Files, &Files, &BTreeMap<String, String>),
    moved: &BTreeMap<String, String>,
    done: &mut BTreeSet<String>,
    taken: &mut BTreeSet<String>,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
    actions: &mut Vec<Action>,
) {
    for (to, from) in moved {
        // Only the accents' form changing: one name, one file (spec Q7).
        if folded_form(to) == folded_form(from) {
            continue;
        }
        let (Some(old), Some(new)) = (key_in(base, from), key_in(remote, to)) else {
            continue;
        };
        let (old, new) = (old.clone(), new.clone());
        let usable = !done.contains(&old)
            && !done.contains(&new)
            && !remote.contains_key(&old)
            && !base.contains_key(&new)
            && !local.contains_key(&new)
            // Where names fold, a new name another file here holds in
            // another case is taken too.
            && !local.keys().any(|p| *p != old && folded(p) == folded(&new));
        let (Some(here), Some(b), Some(theirs)) =
            (local.get(&old), base.get(&old), remote.get(&new))
        else {
            continue;
        };
        if !usable {
            continue;
        }
        actions.push(Action::RenameLocal {
            from: old.clone(),
            to: new.clone(),
        });
        let hashes = (
            Some(here.hash.clone()),
            Some(theirs.hash.clone()),
            Some(b.clone()),
        );
        decide(&new, hashes, false, taken, copy_name, actions);
        done.insert(old);
        done.insert(new);
    }
}

/// What one path's hashes — here, there, in the base — say to do, renames
/// set aside.
fn decide(
    path: &str,
    (l, r, b): Hashes,
    first: bool,
    taken: &mut BTreeSet<String>,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
    actions: &mut Vec<Action>,
) {
    let path = path.to_owned();
    let mut conflict = |path: String, hash: String, actions: &mut Vec<Action>| {
        let copy = copy_name(&path, taken);
        taken.insert(copy.clone());
        actions.push(Action::Conflict { path, copy, hash });
    };
    if l == r {
        if b != l {
            actions.push(Action::Agree { path, hash: l });
        }
        return;
    }
    if first {
        // No base: copy what one side alone has, conflict on both.
        match (l, r) {
            (Some(_), None) => actions.push(Action::Upload { path, base: None }),
            (None, Some(hash)) => actions.push(Action::Download { path, hash }),
            (Some(_), Some(hash)) => conflict(path, hash, actions),
            (None, None) => {}
        }
        return;
    }
    let local_changed = l != b;
    let remote_changed = r != b;
    match (local_changed, remote_changed) {
        (false, true) => match r {
            Some(hash) => actions.push(Action::Download { path, hash }),
            None => {
                if l.is_some() {
                    actions.push(Action::DeleteLocal { path });
                }
            }
        },
        (true, false) => match (l, r) {
            (Some(_), base) => actions.push(Action::Upload { path, base }),
            (None, Some(base)) => actions.push(Action::DeleteRemote { path, base }),
            (None, None) => {}
        },
        _ => match (l, r) {
            // Deleted here, edited there: the edit wins.
            (None, Some(hash)) => actions.push(Action::Download { path, hash }),
            // Edited here, deleted there: the file comes back.
            (Some(_), None) => actions.push(Action::Upload { path, base: None }),
            (Some(_), Some(hash)) => conflict(path, hash, actions),
            (None, None) => actions.push(Action::Agree { path, hash: None }),
        },
    }
}

/// Where this computer's file system folds names: a path here and a path
/// there that differ only in case are one file (this computer cannot hold
/// both), whichever side spelled it anew. (Their accents' form alone is
/// one file everywhere, and paired before: [`one_name_one_file`].)
/// - Respelled here, the server's file as the base left it: the new
///   spelling crosses as a rename, then this computer's edit if any.
/// - Otherwise — respelled there, made on both sides apart, or respelled
///   here while the server's file changed — the server's spelling is taken
///   here first, and the file is planned as one under it: an edit wins
///   over a respelling (item 9), two edits are a conflict (item 8).
///
/// Without this, the two spellings would each be a file of one side only:
/// fetching the server's would find this computer's in its place, sending
/// this computer's would find the server's — refused on every pass, the
/// server's edit never arriving.
fn respelled(
    local: &Files,
    remote: &Files,
    base: &BTreeMap<String, String>,
    done: &mut BTreeSet<String>,
    taken: &mut BTreeSet<String>,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
    actions: &mut Vec<Action>,
) {
    for (here, mine) in local {
        if remote.contains_key(here) || done.contains(here) {
            continue;
        }
        let key = folded(here);
        let Some((there, theirs)) = remote
            .iter()
            .find(|(p, _)| !local.contains_key(*p) && !done.contains(*p) && folded(p) == key)
        else {
            continue;
        };
        match (base.get(here), base.get(there)) {
            (None, Some(b)) if &theirs.hash == b => {
                actions.push(Action::RenameRemote {
                    from: there.clone(),
                    to: here.clone(),
                    base: b.clone(),
                });
                if &mine.hash != b {
                    actions.push(Action::Upload {
                        path: here.clone(),
                        base: Some(b.clone()),
                    });
                }
            }
            // Both spellings in the base too (one_base_per_name leaves
            // them where the server holds the name more than once): still
            // one file, planned from the base `agreed` picks — never two
            // files of one side each, refused on every pass.
            (b_here, b_there) => {
                actions.push(Action::RenameLocal {
                    from: here.clone(),
                    to: there.clone(),
                });
                let hashes = (
                    Some(mine.hash.clone()),
                    Some(theirs.hash.clone()),
                    agreed(
                        Some(&mine.hash),
                        Some(&theirs.hash),
                        b_there.into_iter().chain(b_here),
                    ),
                );
                decide(there, hashes, base.is_empty(), taken, copy_name, actions);
            }
        }
        done.insert(here.clone());
        done.insert(there.clone());
    }
}

/// Where this computer's file system folds names, two base entries whose
/// names differ only in case are one file's: a step recorded its new
/// spelling while the old one stayed — a respelling refused on the server
/// and the edit after it sent through the new spelling, which a server
/// that folds names writes to the file it keeps. Planned as two, each
/// would be a file of one side only, the upload refused there and the
/// fetch here, on every pass: a device working forever. They become one
/// entry, under the spelling the server keeps (else this computer's),
/// with the hash [`agreed`] picks; the others go. A name with two files
/// on the server (one that tells case apart) is left as it is: two that
/// exist are kept (spec Q8, decided 2026-10-12, refuses only a new one).
fn one_base_per_name(
    local: &Files,
    remote: &Files,
    base: &mut BTreeMap<String, String>,
    actions: &mut Vec<Action>,
) {
    let mut by_name: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for p in base.keys() {
        by_name.entry(folded(p)).or_default().push(p.clone());
    }
    let spellings = |files: &Files, name: &str| -> Vec<String> {
        files
            .keys()
            .filter(|p| folded(p) == name)
            .cloned()
            .collect()
    };
    for (name, paths) in by_name.into_iter().filter(|(_, p)| p.len() > 1) {
        let (here, there) = (spellings(local, &name), spellings(remote, &name));
        if here.len() > 1 || there.len() > 1 {
            continue;
        }
        // On neither side: the rules by path drop every entry.
        let Some(kept) = there.first().or(here.first()).cloned() else {
            continue;
        };
        let l = here.first().and_then(|p| local.get(p)).map(|f| &f.hash);
        let r = there.first().and_then(|p| remote.get(p)).map(|f| &f.hash);
        let hash = agreed(l, r, paths.iter().filter_map(|p| base.get(p)));
        for p in &paths {
            base.remove(p);
            if *p != kept {
                actions.push(Action::Agree {
                    path: p.clone(),
                    hash: None,
                });
            }
        }
        if let Some(h) = &hash {
            base.insert(kept.clone(), h.clone());
        }
        actions.push(Action::Agree { path: kept, hash });
    }
}

/// Which of a file's base hashes to plan from when it has more than one
/// (two spellings of its name): one alone is itself; of several, the one
/// this computer's file still has, or the server's — the side unchanged
/// since — when only one side has one of them. When both sides have one,
/// apart, or neither, nothing is taken as unchanged: two edits are a
/// conflict, an edit against a deletion keeps the edit. No base is ever
/// picked that would let one side's file be written over unseen.
fn agreed<'a>(
    l: Option<&String>,
    r: Option<&String>,
    hashes: impl Iterator<Item = &'a String>,
) -> Option<String> {
    let hashes: BTreeSet<&String> = hashes.collect();
    if hashes.len() < 2 {
        return hashes.first().map(|h| (*h).clone());
    }
    let has = |h: Option<&String>| h.is_some_and(|h| hashes.contains(h));
    match (has(l), has(r)) {
        (true, false) => l.cloned(),
        (false, true) => r.cloned(),
        (true, true) if l == r => l.cloned(),
        (true, true) => None,
        // Both changed since any of them: whichever, the same outcome.
        (false, false) => hashes.first().map(|h| (*h).clone()),
    }
}

/// The folder's sync state, as last saved (none: never synced). A state
/// that does not read is set aside, never deleted, and an off state that
/// says so ([`State::unreadable`]) stands in for it: this answers that one
/// — off, as before — and [`load_checked`] tells it apart.
///
/// # Errors
/// The configuration directory is unknown, or the file could not be read
/// or set aside.
pub fn load(
    config: Option<&std::path::Path>,
    key: &str,
) -> Result<Option<State>, crate::CoreError> {
    let dir = match config {
        Some(d) => d.to_path_buf(),
        None => crate::config_dir()?,
    };
    crate::sidecar::read_sync(&dir, key).map_err(crate::CoreError::Sidecar)
}

/// [`load`], telling a state that did not read from none: what the host
/// asks to say "sync state unreadable" instead of "off".
///
/// # Errors
/// As [`load`].
pub fn load_checked(
    config: Option<&std::path::Path>,
    key: &str,
) -> Result<Loaded, crate::CoreError> {
    Ok(match load(config, key)? {
        None => Loaded::Missing,
        Some(State {
            unreadable: Some(u),
            ..
        }) => Loaded::Unreadable(u),
        Some(state) => Loaded::Found(Box::new(state)),
    })
}

pub fn save(
    config: Option<&std::path::Path>,
    key: &str,
    state: &State,
) -> Result<(), crate::CoreError> {
    let dir = match config {
        Some(d) => d.to_path_buf(),
        None => crate::config_dir()?,
    };
    crate::sidecar::write_sync(&dir, key, state).map_err(crate::CoreError::Sidecar)
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_moved;
#[cfg(test)]
mod vectors;
