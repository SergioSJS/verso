// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a door of the server knows to ask [`may`](super::may) (ADR 0113
//! section A): the window's [`Asker`] — its role at the folder or share,
//! the ceiling of its credential, whether it is a phone or a read link —
//! and the table's [`AccessFacts`], made once for the request.
//!
//! Every place that used to decide by itself — the window's command, the
//! room, the device's sync, the table's log, the folder's files — builds a
//! [`Door`] and asks it, instead of reading `role.writes()` and the
//! credential's write bit and the veil's grants.

use std::sync::Arc;

use serde_json::Value;
use verso_contract::ContractError;

use super::{AccessFacts, Action, Asker, Cap, Kind, Made, Seat, Target, Verdict, may};
use crate::auth::Who;
use crate::campaign::{self, Veil};
use crate::db::Role;
use crate::state::Server;

/// What the window gets when a write is refused: unchanged since before
/// ADR 0113, so that the window's notices and the tests keep their words.
const READS: &str = "you may only read this folder";

/// What the window gets when the refused write is a creation, a rename, a
/// move or a delete: the right it lacks, not "only read" (a player may edit
/// a file and still not make, move or delete one, ADR 0113 K.6). The
/// window says each in its own language (`errors.ts`); none names a file,
/// so a hidden one is not told by them.
pub const NO_CREATE: &str = "you may not create files here";
pub const NO_RENAME: &str = "you may not rename this";
pub const NO_MOVE: &str = "you may not move this";
pub const NO_DELETE: &str = "you may not delete this";
/// An editor's delete outside a table: only the folder's owner deletes
/// there (ADR 0113 section B, amended 2026-10-31). Said apart from
/// [`NO_DELETE`] so that the window can say why; outside a table nothing is
/// hidden, so it tells nothing of a file.
pub const NO_DELETE_OWNER: &str = "only the folder's owner deletes here";
/// A move that takes a file out of a shared folder: for that share a
/// deletion, so the folder's owner's alone (ADR 0113 section B, amended
/// 2026-10-31).
pub const NO_MOVE_OUT_OF_SHARE: &str = "only the folder's owner moves files out of a shared folder";

/// The refusal of the write `name`: the right it needed.
fn refusal_of(name: &str) -> &'static str {
    match name {
        "create_note" | "create_folder" | "create_file" => NO_CREATE,
        "rename_note" | "rename_entry" => NO_RENAME,
        "move_entries" => NO_MOVE,
        "delete_note" | "delete_entry" => NO_DELETE,
        _ => READS,
    }
}

/// The window behind a request, as the rules need it.
#[derive(Clone)]
pub struct Door {
    /// The folder's id.
    pub folder: String,
    pub asker: Asker,
    /// The share the window opened, if any.
    pub scope: Option<crate::scope::Scope>,
    /// The folder's tables as the rules see them; none when it has none.
    pub veil: Option<Arc<Veil>>,
    /// Whether the account is an editor of the folder itself (read when the
    /// door was made, not through a share): such a device is served the
    /// notes it sees whole ([`Veil::serves_whole`]).
    editor_live: bool,
    facts: Arc<AccessFacts>,
    /// The paths of the folder's shared folders, for a move that takes a
    /// file out of one (for that share a deletion, ADR 0113 section B,
    /// amended 2026-10-31). Read only for one who may move and is not the
    /// owner; `None` when the read failed, and then every move out of a
    /// folder is judged as one out of a share: closed, never open on a
    /// guess.
    shared: Option<Arc<Vec<String>>>,
}

impl Door {
    /// The door of window `client` of `who`. The role is the one the
    /// window holds at its folder or share; the folder's owner is the
    /// game master whatever the credential (ADR 0113 item 6).
    pub fn of(server: &Server, who: &Who, client: &str) -> Result<Self, ContractError> {
        let (folder, role) = crate::rpc::role_here(server, client)?;
        let (scope, owner, writes) = {
            let clients = verso_service::lock(&server.clients);
            let c = clients.get(client);
            (
                c.and_then(|c| c.scope.clone()),
                // Kept in memory with the window: no database is read per
                // command.
                c.is_some_and(|c| c.owner),
                c.is_some_and(|c| c.token_write),
            )
        };
        let mut door = Self::build(server, who, (folder, role, owner), scope);
        // The ceiling is the window's own, as the connection holds it now: a
        // paired phone made a reader from the computer reads from its next
        // command, over the WebSocket too, not from its next connection.
        if who.phone.is_some() || !writes {
            door.asker.cap = if writes { Cap::Write } else { Cap::Read };
        }
        Ok(door)
    }

    /// The door of `who` at `folder` with `role` there (through `scope`, a
    /// share); `owner` whether it is the folder's own owner. For a request
    /// that has no window, the folder's files over HTTP.
    pub fn build(
        server: &Server,
        who: &Who,
        (folder, role, owner): (String, Role, bool),
        scope: Option<crate::scope::Scope>,
    ) -> Self {
        let visible = scope
            .as_ref()
            .map_or_else(|| folder.clone(), |s| s.share.clone());
        let link = who.account.id.starts_with("link:");
        // The owner of the folder itself, not through a share.
        let owner = owner && scope.is_none() && !link;
        let veil = campaign::veil_of(server, &folder);
        let facts = Arc::new(facts_for(server, &folder, veil.as_deref(), &who.account.id));
        let editor_live = veil.is_some() && campaign::is_editor(server, &folder, &who.account.id);
        let shared = if owner || link || !role.writes() {
            Some(Arc::new(Vec::new()))
        } else {
            server
                .db
                .shares_of(&folder)
                .ok()
                .map(|all| Arc::new(all.into_iter().map(|s| s.path).collect()))
        };
        Self {
            asker: Asker {
                account: who.account.id.clone(),
                role: if link {
                    None
                } else if owner {
                    Some(Role::Owner)
                } else {
                    Some(role)
                },
                cap: if who.reaches(&visible).1 {
                    Cap::Write
                } else {
                    Cap::Read
                },
                phone: who.phone.is_some(),
                link,
                admin: who.account.admin,
            },
            folder,
            scope,
            veil,
            editor_live,
            facts,
            shared,
        }
    }

    /// Whether moving `from` to `to` takes it out of a shared folder: `from`
    /// inside one (not the shared folder itself, whose share goes with it)
    /// and `to` not.
    fn leaves_share(&self, from: &str, to: &str) -> bool {
        let Some(shared) = &self.shared else {
            return true;
        };
        shared.iter().any(|root| {
            campaign::covers(root, from)
                && campaign::key(from) != campaign::key(root)
                && !campaign::covers(root, to)
        })
    }

    /// A move of `from` to `to` that takes it out of a shared folder counts
    /// as deleting it for that share (ADR 0113 section B, amended
    /// 2026-10-31): asked as a delete, the folder's owner's alone.
    fn out_of_share(&self, from: &str, to: &str) -> Verdict {
        if self.leaves_share(from, to) {
            self.may_path(Action::Delete, from)
        } else {
            Verdict::Allow
        }
    }

    /// The moves a write `name` makes, each `(from, to)` in the folder's
    /// paths: a rename into another folder, or each entry of
    /// `move_entries`.
    fn moves_of(&self, name: &str, args: &Value) -> Vec<(String, String)> {
        let path_of = |field: &str| args[field].as_str().map(|g| self.full(g));
        match name {
            "rename_note" | "rename_entry" => match (path_of("from"), path_of("to")) {
                (Some(from), Some(to)) => {
                    let to = Self::rename_target(&from, to);
                    if Self::parent(&from) == Self::parent(&to) {
                        Vec::new()
                    } else {
                        vec![(from, to)]
                    }
                }
                _ => Vec::new(),
            },
            "move_entries" => {
                // The folder moved into may be the share's own root, which
                // `full` (a path to write) does not name.
                let given = args["folder"].as_str().unwrap_or_default();
                let into = match &self.scope {
                    Some(s) => s.to_full(given).unwrap_or_else(|_| given.to_owned()),
                    None => given.to_owned(),
                };
                args["paths"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(|p| {
                        let from = self.full(p);
                        let leaf = campaign::key(&from)
                            .rsplit('/')
                            .next()
                            .unwrap_or_default()
                            .to_owned();
                        (from, format!("{into}/{leaf}"))
                    })
                    .collect()
            }
            _ => Vec::new(),
        }
    }

    /// The seat at the folder's table.
    #[must_use]
    pub fn seat(&self) -> Seat {
        self.asker.seat()
    }

    /// Whether the folder has a table.
    #[must_use]
    pub fn has_table(&self) -> bool {
        self.veil.is_some()
    }

    /// Whether the window is a player or a visitor of a folder with a
    /// table: what it is told of the folder goes through the veil
    /// (ADR 0110). The game master is not, whatever the credential.
    #[must_use]
    pub fn veiled(&self) -> bool {
        self.has_table() && self.seat() != Seat::Master
    }

    /// Whether the window is told the notes' **projections**, the secret
    /// blocks left out (ADR 0087): it edits nothing in a folder with no
    /// table, and in a table it edits no file — the game master of a table
    /// sees every secret block whatever the credential (item 6), and an
    /// editor edits, and so sees, every file they see (K.1).
    #[must_use]
    pub fn projects(&self) -> bool {
        if self.seat() == Seat::Master && self.has_table() {
            return false;
        }
        !(self.asker.cap == Cap::Write && self.editor_or_more())
    }

    /// Whether the role is an editor's or more.
    #[must_use]
    pub fn editor_or_more(&self) -> bool {
        !self.asker.link && self.asker.role.is_some_and(Role::writes)
    }

    /// Whether the window may write in the folder at all, as the role and
    /// the credential say: what the old `role.writes() && token_writes`
    /// said, and what a window's `write` capability means.
    #[must_use]
    pub fn writes_here(&self) -> bool {
        self.editor_or_more() && self.asker.cap == Cap::Write
    }

    /// Whether the credential writes: only then is a device served what the
    /// person edits whole, as a window is (`SeeSecretBlocks`).
    #[must_use]
    pub fn sends_whole_cap(&self) -> bool {
        self.asker.cap == Cap::Write
    }

    /// Whether a device of the asker is served the note at `path` whole
    /// (ADR 0113 S8): the pipeline of `sync_state` / `sync_read` and the
    /// judgement of `sync_put` ask this one statement.
    #[must_use]
    pub fn serves_whole(&self, path: &str) -> bool {
        self.veil.as_ref().is_some_and(|v| {
            v.view_for(
                &self.asker.account,
                self.editor_live,
                self.sends_whole_cap(),
            )
            .serves_whole(path)
        })
    }

    /// The rules' answer for `path` (a path of the folder, not of a share).
    #[must_use]
    pub fn may(&self, action: Action, path: &str, kind: Kind) -> Verdict {
        may(&self.facts, &self.asker, action, &Target::new(path, kind))
    }

    /// [`Door::may`] for a path, its kind told by its name.
    #[must_use]
    pub fn may_path(&self, action: Action, path: &str) -> Verdict {
        self.may(action, path, Kind::of_path(path))
    }

    /// The path in the folder of a path the window sent.
    fn full(&self, given: &str) -> String {
        match &self.scope {
            Some(s) => s.to_full_write(given).unwrap_or_else(|_| given.to_owned()),
            None => given.to_owned(),
        }
    }

    /// The path in the folder of `given`, confined; none when it leaves the
    /// folder or the share.
    #[must_use]
    pub fn full_checked(&self, given: &str) -> Option<String> {
        let full = match &self.scope {
            Some(s) => s.to_full(given).ok()?,
            None => given.to_owned(),
        };
        crate::scope::checked(&full).ok()?;
        Some(full)
    }

    /// The folder a path is in, as the rules take it: `""` is the folder.
    fn parent(path: &str) -> String {
        let p = campaign::key(path);
        p.rsplit_once('/')
            .map_or_else(String::new, |(d, _)| d.to_owned())
    }

    /// Where a rename of `from` to `to` lands: a note is named without its
    /// extension by the window, and the core gives it `.md` as it does at
    /// `note_key`, so the name that is judged — and looked for among the
    /// taken ones — is the one that will be made.
    fn rename_target(from: &str, to: String) -> String {
        if from.ends_with(".md") && !to.ends_with(".md") {
            format!("{to}.md")
        } else {
            to
        }
    }

    /// The path a new note named `name` will have.
    fn note_path(name: &str) -> String {
        if name
            .trim_end_matches(['.', ' '])
            .to_lowercase()
            .ends_with(".md")
        {
            name.to_owned()
        } else {
            format!("{name}.md")
        }
    }

    /// Whether the window may run the write `name` with `args`, as the
    /// rules say (ADR 0113 section B): editing a file needs its level,
    /// creating and renaming inside a folder needs the folder's, deleting
    /// and moving are the game master's — and an editor's outside a table
    /// (K.5). A command with no path is the folder's own, an edit of the
    /// folder.
    pub fn check_write(&self, name: &str, args: &Value) -> Result<(), ContractError> {
        let path_of = |field: &str| args[field].as_str().map(|g| self.full(g));
        let verdict: Verdict = match name {
            "write_note" | "write_text" | "write_board" => {
                let Some(path) = path_of("path") else {
                    return Err(crate::rpc::refused(READS));
                };
                // A board a player edits is edited in its room, by element,
                // never written whole: what the player was served is the
                // projection (ADR 0113 H).
                if self.veiled() && Kind::of_path(&path) == Kind::Board {
                    return Err(crate::rpc::refused(READS));
                }
                self.write_verdict(&path)
            }
            "create_note" => match args["name"].as_str() {
                Some(n) => self.create_in(&Self::note_path(&self.full(n)), false),
                None => return Err(crate::rpc::refused(READS)),
            },
            // A new folder is covered by *Creates notes* (K.6 item 4).
            "create_folder" => match path_of("path") {
                Some(p) => self.create_in(&p, true),
                None => return Err(crate::rpc::refused(READS)),
            },
            // A new file: a note, base, board or drawing by *Creates notes* or
            // *Creates boards*; any other is a file sent (K.6), at a table, by
            // a player, by *Images* or *Files* (its bytes are judged by
            // `check_bytes`).
            "create_file" => match path_of("path") {
                Some(p) => self.create_in(&p, false),
                None => return Err(crate::rpc::refused(READS)),
            },
            "rename_note" | "rename_entry" => match (path_of("from"), path_of("to")) {
                (Some(from), Some(to)) => {
                    let to = Self::rename_target(&from, to);
                    let (a, b) = (Self::parent(&from), Self::parent(&to));
                    if a == b {
                        // A rename inside a folder: the player edits the
                        // file (K.6). A table's root, or a folder above one,
                        // is the game master's.
                        self.rename_in_place(&from, &to)
                    } else {
                        // Out of one folder into another: a move. Into a table
                        // it is the game master's (K.5), and always the new
                        // folder must be one the person makes files in.
                        and(self.may_path(Action::Move, &from), self.arrives(&to))
                    }
                }
                _ => return Err(crate::rpc::refused(READS)),
            },
            "move_entries" => {
                let Some(paths) = args["paths"].as_array().filter(|p| !p.is_empty()) else {
                    return Err(crate::rpc::refused(READS));
                };
                let into = self.full(args["folder"].as_str().unwrap_or_default());
                let mut all = self.arrives(&format!("{into}/x"));
                for p in paths {
                    all = and(
                        all,
                        match p.as_str() {
                            Some(p) => self.may_path(Action::Move, &self.full(p)),
                            None => Verdict::Deny(super::Reason::NotSeen),
                        },
                    );
                }
                all
            }
            "delete_note" | "delete_entry" => match path_of("path") {
                Some(p) => self.may_path(Action::Delete, &p),
                None => return Err(crate::rpc::refused(READS)),
            },
            // The folder's own: its settings, its focuses, its data. Where the
            // folder is a table's, they are the game master's: a folder set
            // that gives a player *Edits* gives them files, not the folder.
            "remove_folder_data" => self.folder_own(Action::Delete),
            _ => self.folder_own(Action::Edit),
        };
        // A move out of a shared folder is, for that share, a deletion: the
        // owner's alone, whatever the move itself allows.
        let moves_ok = verdict.allowed();
        let verdict = self
            .moves_of(name, args)
            .iter()
            .fold(verdict, |v, (from, to)| and(v, self.out_of_share(from, to)));
        if verdict.allowed() {
            Ok(())
        } else if moves_ok {
            Err(crate::rpc::refused(NO_MOVE_OUT_OF_SHARE))
        } else {
            {
                // A rename into another folder is a move.
                let moved = matches!(name, "rename_note" | "rename_entry")
                    && match (path_of("from"), path_of("to")) {
                        (Some(from), Some(to)) => {
                            Self::parent(&from) != Self::parent(&Self::rename_target(&from, to))
                        }
                        _ => false,
                    };
                // A delete an editor may not make outside a table: said as
                // the owner's, so the window can tell them why.
                let deleted = match name {
                    "delete_note" | "delete_entry" => path_of("path"),
                    "remove_folder_data" => Some(String::new()),
                    _ => None,
                };
                Err(crate::rpc::refused(if moved {
                    NO_MOVE
                } else if deleted.is_some_and(|p| self.owner_deletes(&p)) {
                    NO_DELETE_OWNER
                } else {
                    refusal_of(name)
                }))
            }
        }
    }

    /// Whether a delete of `path` is refused to this person only because,
    /// outside a table, the folder's owner alone deletes (ADR 0113 section
    /// B, amended 2026-10-31): an editor of the folder or of a share, not
    /// the owner, and `path` neither in a table nor above one.
    fn owner_deletes(&self, path: &str) -> bool {
        self.editor_or_more()
            && self.seat() != Seat::Master
            && self.facts.table_of(path).is_none()
            && !self.facts.holds_table(path)
    }

    /// Whether a device may run the sync change `cmd` with `args`, as the
    /// rules say. A put of a note goes the way a write of it does; a
    /// player's device holds the veiled, projected copy of whatever it
    /// does not edit whole, and a put of that would write the projection
    /// over the game master's text: only a note the person edits is served
    /// whole ([`Door::serves_whole`], ADR 0113 S8), so only that one is put
    /// back, and a board is never put whole by a player (H).
    pub fn check_sync(&self, cmd: &str, args: &Value) -> Result<(), ContractError> {
        match cmd {
            "sync_put" => {
                let Some(path) = args["path"].as_str().map(|p| self.full(p)) else {
                    return Err(crate::rpc::refused(READS));
                };
                let mut verdict = self.write_verdict(&path);
                // A file that is no note, board or base is a file sent: a
                // player's device sends none this way (S8).
                if verdict.allowed()
                    && self.veiled()
                    && self.seat() != Seat::Master
                    && !Kind::of_path(&path).is_note_like()
                {
                    verdict = Verdict::Deny(super::Reason::NoRight);
                }
                // A board is never put whole by a player, seen or not (H).
                if self.veiled() && Kind::of_path(&path) == Kind::Board {
                    verdict = Verdict::Deny(super::Reason::ReadOnly);
                }
                // A path the person does not see is a new file to them (the
                // name is kept off the hidden one): judged like a free name.
                let unseen = self.veiled() && !self.may_path(Action::See, &path).allowed();
                if verdict.allowed() && self.veiled() && !unseen {
                    // Notes and boards are what a device holds projected.
                    // A note is put only by one who is served it whole: the
                    // projection written back would erase its secret blocks.
                    let whole = match Kind::of_path(&path) {
                        Kind::Board => false,
                        Kind::Note => self.serves_whole(&path),
                        _ => true,
                    };
                    if !whole {
                        verdict = Verdict::Deny(super::Reason::ReadOnly);
                    }
                }
                if verdict.allowed() {
                    Ok(())
                } else {
                    Err(crate::rpc::refused(READS))
                }
            }
            "sync_delete" => self.check_write("delete_entry", args),
            _ => self.check_write("rename_entry", args),
        }
    }

    /// A write to `path`: editing it. A player writing to a path they do not
    /// see is told what they would be told of a free name — it is judged as
    /// making a file in its folder — so that "you may only read" never says
    /// that something hidden is there; [`Door::guard_names`] then keeps the
    /// hidden file from being overwritten.
    fn write_verdict(&self, path: &str) -> Verdict {
        if self.veiled() && !self.may_path(Action::See, path).allowed() {
            // A new file that is no note, board or base is a file sent: only
            // `create_file` judges its right and its bytes, never a text
            // write (K.4).
            if self.seat() != Seat::Master
                && self.facts.table_of(path).is_some()
                && !Kind::of_path(path).is_note_like()
            {
                return Verdict::Deny(super::Reason::NoRight);
            }
            self.create_in(path, false)
        } else {
            self.may_path(Action::Edit, path)
        }
    }

    /// The folder's own, as a command with no path asks it.
    fn folder_own(&self, action: Action) -> Verdict {
        if self.seat() != Seat::Master && self.facts.table_of("").is_some() {
            return Verdict::Deny(super::Reason::NotMaster);
        }
        self.may(action, "", Kind::Folder)
    }

    /// A file or folder arrives at `path` by a move or a rename out of
    /// another folder: into a table only the game master brings anything
    /// (K.5), and into any folder only the person who makes files there.
    fn arrives(&self, path: &str) -> Verdict {
        if self.seat() != Seat::Master && self.facts.table_of(path).is_some() {
            return Verdict::Deny(super::Reason::NotMaster);
        }
        self.create_in(path, false)
    }

    /// The bytes of a new file a player makes at a table are judged as
    /// those sent to the chat are (K.4, K.6): an image, a PDF or audio by its
    /// first bytes (`table::file_ext`), at most the table's limit, under a
    /// name whose extension says the same — never an SVG, a page or a
    /// script.
    pub fn check_bytes(&self, server: &Server, args: &Value) -> Result<(), ContractError> {
        let Some(path) = args["path"].as_str().map(|p| self.full(p)) else {
            return Ok(());
        };
        let Some(table) = self.facts.table_of(&path) else {
            return Ok(());
        };
        // A note, a base, a board or a drawing is not a file sent.
        if self.seat() == Seat::Master
            || matches!(Made::of_path(&path, false), Made::Note | Made::Board)
        {
            return Ok(());
        }
        let limit = campaign::image_limit(server, &self.folder, &table.root);
        let data = args["base64"].as_str().unwrap_or_default();
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data)
            .map_err(|_| crate::rpc::refused("the bytes are not base64"))?;
        let ext = path.rsplit('.').next().map(str::to_ascii_lowercase);
        let named = |e: &str| match e {
            "jpg" => matches!(ext.as_deref(), Some("jpg" | "jpeg")),
            e => ext.as_deref() == Some(e),
        };
        if bytes.len() > limit || !crate::table::file_ext(&bytes).is_some_and(named) {
            return Err(crate::rpc::refused(
                "an image, a PDF or an audio file (not SVG, a page or a script)",
            ));
        }
        Ok(())
    }

    /// Whether `path` is a file of the folder (not a folder, not absent).
    pub fn is_file(ws: &mut verso_core::Workspace, path: &str) -> bool {
        let k = campaign::key(path);
        !ws.is_folder(path)
            && crate::campaign_serve::all_files(ws)
                .iter()
                .any(|f| campaign::key(f) == k)
    }

    /// Whether a file may be made in `dir` for a player whose file lies in
    /// the table rooted at `table` without the answer telling anything of
    /// what the player does not see (ADR 0113 item 5, where the file goes):
    /// `dir` is in that same table, and each of its folders is either new or
    /// the one folder of that exact name which the player sees — never a file,
    /// a hidden folder, or a twin that differs by case or by Unicode form
    /// (those would fail, or not, by what is hidden). Always true for whom the
    /// veil does not cover.
    pub fn dir_clear(&self, ws: &mut verso_core::Workspace, dir: &str, table: &str) -> bool {
        use unicode_normalization::UnicodeNormalization;
        let Some(veil) = self.veil.clone().filter(|_| self.veiled()) else {
            return true;
        };
        if !veil.in_table(dir)
            || veil
                .table(dir)
                .is_none_or(|t| campaign::key(&t.root) != campaign::key(table))
        {
            return false;
        }
        let view = veil.view(&self.asker.account);
        let files = crate::campaign_serve::all_files(ws);
        let mut dirs: std::collections::BTreeSet<String> =
            ws.folders().iter().map(ToString::to_string).collect();
        for f in &files {
            let mut up = f.as_str();
            while let Some((parent, _)) = up.rsplit_once('/') {
                dirs.insert(parent.to_owned());
                up = parent;
            }
        }
        let nfc = |s: &str| -> String { s.nfc().collect() };
        let fold = |s: &str| nfc(s).to_lowercase();
        let mut prefix = String::new();
        for seg in dir.split('/').filter(|s| !s.is_empty()) {
            if !prefix.is_empty() {
                prefix.push('/');
            }
            prefix.push_str(seg);
            let want = fold(&prefix);
            if files.iter().any(|f| fold(f) == want) {
                return false;
            }
            let twins: Vec<&String> = dirs.iter().filter(|d| fold(d) == want).collect();
            match twins.as_slice() {
                [] => {}
                [one] if nfc(one) == nfc(&prefix) => {
                    let seen = veil
                        .tables
                        .iter()
                        .any(|t| campaign::key(&t.root) == campaign::key(&prefix))
                        || files.iter().any(|f| {
                            campaign::covers(&prefix, f)
                                && !crate::campaign_serve::is_hidden_in(ws, &view, f)
                        });
                    if !seen {
                        return false;
                    }
                }
                _ => return false,
            }
        }
        true
    }

    /// What a player is not told of a name (ADR 0113, the maintainer on
    /// 2026-10-24, "sufixo automático"): a name taken by something the
    /// player cannot see is never answered as taken — the next free one is
    /// used, as a duplicate gets its own — and a folder that holds what they
    /// cannot see, or a table, is not theirs to rename. Runs for a window
    /// that is not the game master of a folder with a table; `args` are
    /// changed to the name used.
    pub fn guard_names(
        &self,
        ws: &mut verso_core::Workspace,
        name: &str,
        args: &mut Value,
    ) -> Result<(), ContractError> {
        let Some(veil) = self.veil.clone() else {
            return Ok(());
        };
        let view = veil.view(&self.asker.account);
        let to_rel = |full: &str| -> String {
            self.scope
                .as_ref()
                .and_then(|s| s.to_rel(full))
                .unwrap_or_else(|| full.to_owned())
        };
        if matches!(name, "rename_note" | "rename_entry")
            && let Some(from) = args["from"].as_str().map(|f| self.full(f))
            && ws.is_folder(&from)
        {
            // A table's root, or a folder holding one, is the game master's.
            if veil.tables.iter().any(|t| campaign::covers(&from, &t.root)) {
                return Err(crate::rpc::refused(READS));
            }
            // And a folder moves everything in it: all must be the person's to see.
            for f in crate::campaign_serve::all_files(ws) {
                if campaign::covers(&from, &f)
                    && veil.in_table(&f)
                    && crate::campaign_serve::is_hidden_in(ws, &view, &f)
                {
                    return Err(crate::rpc::refused(READS));
                }
            }
        }
        let (field, wanted, is_note) = match name {
            "create_note" => (
                "name",
                args["name"]
                    .as_str()
                    .map(|n| Self::note_path(&self.full(n))),
                true,
            ),
            "write_note" | "write_text" | "sync_put" => {
                ("path", args["path"].as_str().map(|p| self.full(p)), false)
            }
            "create_file" | "create_folder" => {
                ("path", args["path"].as_str().map(|p| self.full(p)), false)
            }
            "rename_note" | "rename_entry" => (
                "to",
                match (args["from"].as_str(), args["to"].as_str()) {
                    (Some(from), Some(to)) => {
                        Some(Self::rename_target(&self.full(from), self.full(to)))
                    }
                    _ => None,
                },
                false,
            ),
            _ => return Ok(()),
        };
        let Some(wanted) = wanted else {
            return Ok(());
        };
        let _ = is_note;
        // A write to a path the person sees is theirs to make as it is; the
        // directory is read only for one they do not.
        if matches!(name, "write_note" | "write_text" | "sync_put")
            && self.may_path(Action::See, &wanted).allowed()
        {
            return Ok(());
        }
        let mut taken: std::collections::HashSet<String> = crate::campaign_serve::all_files(ws)
            .iter()
            .map(|f| campaign::key(f))
            .collect();
        taken.extend(ws.folders().iter().map(|f| campaign::key(f)));
        let key = campaign::key(&wanted);
        if !taken.contains(&key) {
            return Ok(());
        }
        // Taken by something the person sees: refused as taken, as ever.
        let folder = ws.is_folder(&wanted);
        let seen = if folder {
            crate::campaign_serve::all_files(ws).iter().any(|f| {
                campaign::covers(&wanted, f) && !crate::campaign_serve::is_hidden_in(ws, &view, f)
            }) || veil.tables.iter().any(|t| campaign::key(&t.root) == key)
        } else {
            !crate::campaign_serve::is_hidden_in(ws, &view, &wanted)
        };
        if seen || !veil.in_table(&wanted) {
            return Ok(());
        }
        let (stem, ext) = match wanted.rsplit_once('.') {
            Some((s, e)) if !folder && !e.contains('/') => (s.to_owned(), format!(".{e}")),
            _ => (wanted.clone(), String::new()),
        };
        for n in 2..10_000 {
            let candidate = format!("{stem} {n}{ext}");
            let k = campaign::key(&candidate);
            // Nor a name a stale set of the table still holds.
            if !taken.contains(&k) && !self.facts.sets.contains_key(&k) {
                args[field] = Value::String(to_rel(&candidate));
                return Ok(());
            }
        }
        Err(crate::rpc::refused(READS))
    }

    /// What a rename or a move tells a player of notes it may not edit
    /// (ADR 0113, the maintainer on 2026-10-24, "o servidor corrige sem
    /// contar"): the rewrites of those notes are taken out of the answer —
    /// the server writes them itself — and what is left names only what the
    /// person sees. The rewrites to write, still in the folder's own paths.
    pub fn take_unowned(&self, answer: &mut Value) -> Vec<crate::share_links::Outside> {
        let mut out = Vec::new();
        if let Some(list) = answer["rewrites"].as_array_mut() {
            list.retain(|w| {
                let path = w["path"].as_str().unwrap_or_default();
                if self.may_path(Action::Edit, path).allowed() {
                    return true;
                }
                if let (Some(revision), Some(after)) = (w["revision"].as_str(), w["after"].as_str())
                {
                    out.push(crate::share_links::Outside {
                        path: path.to_owned(),
                        revision: revision.to_owned(),
                        after: after.to_owned(),
                    });
                }
                false
            });
        }
        let sees = |door: &Self, p: &Value| {
            door.may_path(Action::See, p.as_str().unwrap_or_default())
                .allowed()
        };
        if let Some(list) = answer["skipped"].as_array_mut() {
            list.retain(|k| sees(self, &k["path"]));
        }
        for field in ["also"] {
            if let Some(list) = answer[field].as_array_mut() {
                list.retain(|m| sees(self, &m["from"]) || sees(self, &m["to"]));
            }
        }
        // A warning names paths in words (the index forgetting a note): what
        // a player cannot see is not named, so none is told.
        if let Some(list) = answer["warnings"].as_array_mut() {
            list.clear();
        }
        if let Some(list) = answer["refused"].as_array_mut() {
            list.retain(|k| sees(self, &k["path"]));
        }
        out
    }

    /// A rename of `from` inside its folder: the person edits the file
    /// (K.6); a table's root, or a folder above one, is the game master's.
    fn rename_in_place(&self, from: &str, to: &str) -> Verdict {
        if self.seat() != Seat::Master && self.facts.holds_table(from) {
            return Verdict::Deny(super::Reason::NotMaster);
        }
        // A name is no way round *Images* or *Files* (K.6): at a table, a file
        // keeps its kind — the same extension, or both the same sort of
        // note — so a sent PNG is never served as a page, an SVG or a PDF.
        if self.seat() != Seat::Master && self.facts.table_of(to).is_some() && !same_kind(from, to)
        {
            return Verdict::Deny(super::Reason::NoRight);
        }
        and(
            self.may_path(Action::See, from),
            self.may_path(Action::Rename, from),
        )
    }

    /// Whether a device may rename `given` where it is (ADR 0113 S8).
    #[must_use]
    pub fn may_rename_here(&self, given: &str) -> bool {
        let from = self.full(given);
        self.rename_in_place(&from, &from).allowed()
    }

    /// Whether a device may put a file at `given` that is new to it: a free
    /// name, or one it does not see — the same answer for both, so that no
    /// answer tells a hidden file from a name nobody holds.
    #[must_use]
    pub fn may_put_new(&self, given: &str) -> bool {
        if !self.veiled() {
            return self
                .check_sync("sync_put", &serde_json::json!({ "path": given }))
                .is_ok();
        }
        let path = self.full(given);
        let kind = Kind::of_path(&path);
        self.create_in(&path, false).allowed() && kind.is_note_like() && kind != Kind::Board
    }

    /// A new file (or `folder`) at `path`: the folder is one the person
    /// edits and, at a table, they were given the right for what is made
    /// (K.6).
    fn create_in(&self, path: &str, folder: bool) -> Verdict {
        let parent = Self::parent(path);
        self.may(
            Action::Create(Made::of_path(path, folder)),
            &parent,
            Kind::Folder,
        )
    }
}

/// Whether renaming `from` to `to` keeps what the file is: the same
/// extension, or both notes (or both boards, both bases).
fn same_kind(from: &str, to: &str) -> bool {
    let ext = |p: &str| {
        p.rsplit('/')
            .next()
            .and_then(|n| n.rsplit_once('.'))
            .map(|(_, e)| e.to_lowercase())
    };
    ext(from) == ext(to)
        || (Kind::of_path(from).is_note_like() && Kind::of_path(from) == Kind::of_path(to))
}

/// Both allowed, else the first refusal.
fn and(a: Verdict, b: Verdict) -> Verdict {
    if a.allowed() { b } else { a }
}

/// The asker a connected window is, from what the server keeps of it in
/// memory (no database is read): the role it holds at its folder or share,
/// the folder's owner being the game master whatever the ceiling of its
/// credential (ADR 0113 item 6).
#[must_use]
pub fn asker_of(c: &crate::state::Client) -> Asker {
    let link = c.account.starts_with("link:");
    Asker {
        account: c.account.clone(),
        role: if link {
            None
        } else if c.owner {
            Some(Role::Owner)
        } else {
            c.folder.as_ref().map(|(_, r)| *r)
        },
        cap: if c.token_write { Cap::Write } else { Cap::Read },
        phone: c.phone,
        link,
        admin: false,
    }
}

/// Whether a window with this asker is veiled in a folder that has a table
/// (`has_table`): a player or a visitor, never the game master.
#[must_use]
pub fn veiled(a: &Asker, has_table: bool) -> bool {
    has_table && a.seat() != Seat::Master
}

/// Whether a window with this asker is told the projections of the notes
/// ([`Door::projects`]).
#[must_use]
pub fn projects(a: &Asker, has_table: bool) -> bool {
    if a.seat() == Seat::Master && has_table {
        return false;
    }
    !(a.cap == Cap::Write && !a.link && a.role.is_some_and(Role::writes))
}

/// Whether what a window is told of the folder is cut for it: by the veil
/// of a table, or by the projections. The game master of a table never is.
#[must_use]
pub fn filtered(a: &Asker, has_table: bool) -> bool {
    veiled(a, has_table) || projects(a, has_table)
}

/// Whether the folder `folder` has a table, as the server knows without
/// reading the database: `None` when it has not been asked yet.
#[must_use]
pub fn has_table_cached(server: &Server, folder: &str) -> Option<bool> {
    campaign::cached(server, folder).map(|v| v.is_some())
}

/// Whether the folder `folder` has a table (reads the database once if the
/// answer is not at hand; an unreadable table counts as one).
#[must_use]
pub fn has_table(server: &Server, folder: &str) -> bool {
    campaign::veil_of(server, folder).is_some()
}

/// The role the table's log speaks of for a window: the game master is an
/// owner there, a player is a reader — an editor of the folder inside a
/// table too (ADR 0113 item 3) — and an editor of a folder with no table is
/// an editor, as the log has always had it.
#[must_use]
pub fn log_role(a: &Asker, has_table: bool) -> Role {
    if a.seat() == Seat::Master {
        Role::Owner
    } else if veiled(a, has_table) {
        Role::Reader
    } else {
        a.role.unwrap_or(Role::Reader)
    }
}

/// Whether the window `c` may do `action` on `path`, from what the server
/// keeps in memory (no database is read when the folder's table is cached).
#[must_use]
pub fn may_client(
    server: &Server,
    c: &crate::state::Client,
    action: Action,
    path: &str,
    kind: Kind,
) -> bool {
    let Some((folder, _)) = c.folder.as_ref() else {
        return false;
    };
    let veil = campaign::veil_of(server, folder);
    let facts = facts_for(server, folder, veil.as_deref(), &c.account);
    may(&facts, &asker_of(c), action, &Target::new(path, kind)).allowed()
}

/// The facts of `folder` for `account`: the veil's snapshot of the tables
/// and the sets (cheap to clone), and the rights of `account` read now — a
/// right given or taken back holds at the next door, not at the next time
/// the veil is made.
fn facts_for(server: &Server, folder: &str, veil: Option<&Veil>, account: &str) -> AccessFacts {
    let Some(veil) = veil else {
        return AccessFacts::default();
    };
    let mut facts = (**veil.facts()).clone();
    facts.rights.clear();
    // A failed read gives no right: nobody is admitted on a guess.
    for (root, right) in server
        .db
        .campaign_rights_of(folder, account)
        .unwrap_or_default()
    {
        facts
            .rights
            .insert((campaign::key(&root), account.to_owned(), right));
    }
    facts
}

fn why_out(w: &super::Why) -> verso_contract::AccessWhy {
    use verso_contract::AccessWhy as W;
    match w {
        super::Why::Master => W::Master,
        super::Why::Role => W::Role,
        super::Why::Own => W::Own,
        super::Why::Folder(p) => W::Folder { path: p.clone() },
        super::Why::Default => W::Default,
        super::Why::Derived => W::Derived,
        super::Why::Closed => W::Closed,
    }
}

fn level_out(l: super::Level) -> verso_contract::AccessLevel {
    match l {
        super::Level::None => verso_contract::AccessLevel::None,
        super::Level::See => verso_contract::AccessLevel::See,
        super::Level::Edit => verso_contract::AccessLevel::Edit,
    }
}

impl Door {
    /// What the asker may do with `path`, as every read answer says it
    /// (ADR 0113 section C). `derived`: the file is shown by one the person
    /// sees (it is in a list they were given).
    #[must_use]
    pub fn file_access(&self, path: &str, kind: Kind, derived: bool) -> verso_contract::FileAccess {
        let t = Target::new(path, kind).derived(derived);
        let (level, why) = self.facts.level(&self.asker, &t);
        let ask = |a: Action| may(&self.facts, &self.asker, a, &t).allowed();
        // What can be made is told of a folder only (K.6).
        let folder = matches!(kind, Kind::Folder | Kind::Table);
        verso_contract::FileAccess {
            level: level_out(level),
            attach: ask(Action::Attach { image: false }),
            attach_image: ask(Action::Attach { image: true }),
            create_note: folder && ask(Action::Create(Made::Note)),
            create_board: folder && ask(Action::Create(Made::Board)),
            why: why_out(&why),
        }
    }

    /// Who the asker is at the folder (the capabilities').
    #[must_use]
    pub fn folder_access(&self) -> verso_contract::FolderAccess {
        use verso_contract::{AccessCap, AccessSeat};
        verso_contract::FolderAccess {
            seat: match self.seat() {
                Seat::Master => AccessSeat::Master,
                Seat::Player => AccessSeat::Player,
                Seat::Visitor => AccessSeat::Visitor,
                Seat::Stranger => AccessSeat::None,
            },
            role: if self.asker.link {
                String::new()
            } else {
                self.asker
                    .role
                    .map_or_else(String::new, |r| r.as_str().to_owned())
            },
            cap: if self.asker.cap == Cap::Write {
                AccessCap::Write
            } else {
                AccessCap::Read
            },
            table: self.has_table(),
        }
    }

    /// Put `access` on what `answer` (of the command `name`, in the
    /// folder's own paths) says of a file: a read of a note or a text, a
    /// write's, each entry of a listing.
    pub fn inject(&self, name: &str, answer: &mut Value) {
        let put = |door: &Self, v: &mut Value, kind: Option<Kind>, derived: bool| {
            let Some(path) = v["path"].as_str().map(str::to_owned) else {
                return;
            };
            let kind = kind.unwrap_or_else(|| Kind::of_path(&path));
            if let Ok(a) = serde_json::to_value(door.file_access(&path, kind, derived)) {
                v["access"] = a;
            }
        };
        match name {
            "read_note" | "read_text" | "create_note" | "write_text" | "write_board" => {
                put(self, answer, None, false);
            }
            "write_note" => put(self, &mut answer["note"], None, false),
            "list_entries" => {
                for e in answer.as_array_mut().into_iter().flatten() {
                    let kind = match e["kind"].as_str() {
                        Some("folder") => Some(Kind::Folder),
                        _ => None,
                    };
                    // What is listed is seen: an attachment or a folder is
                    // shown by a file the person sees.
                    put(self, e, kind, true);
                }
            }
            _ => {}
        }
    }
}
