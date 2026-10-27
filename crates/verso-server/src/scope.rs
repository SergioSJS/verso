// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A window that opened a share (ADR 0081 item 2): to it the share is a
//! folder of its own, and the server keeps one folder. Every path the
//! window sends is relative to the shared folder: it is checked — no `..`,
//! no `.`, no empty part, nothing absolute — and joined to the share's
//! path before `verso-fs` acts (ADR 0026 rule 4, ADR 0073 item 3); every
//! answer, and every event pushed to the window, is filtered to the share
//! and re-rooted at it, so that nothing above or beside the share crosses
//! (item 11): not a path, not a name, not whether a note exists. A command
//! this module does not know is refused: the boundary fails closed.
//!
//! The share's attachments folder, when the owner added it (item 11), is
//! shown read-only at the share's root under its own name.

use serde_json::{Value, json};
use verso_contract::ContractError;

use crate::db::covers;

/// What a window that opened a share sees.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scope {
    /// The share's id: the folder id the window knows.
    pub share: String,
    /// The key the window keeps its state under.
    pub key: String,
    /// "Campanha (Sérgio)" (item 3).
    pub name: String,
    /// The shared folder's path in the owner's folder; never `""`.
    pub root: String,
    /// The attachments folder shown read-only: the name it has at the
    /// share's root, and its path in the owner's folder.
    pub mount: Option<(String, String)>,
    /// A share of a folder this computer serves to a phone (ADR 0096 item
    /// 2, amended 2026-10-16): the attachments folder shows files, never a
    /// note, and what a link under the share leads out of it is left out.
    /// None for a share between people on a server.
    pub guard: Option<std::sync::Arc<Guard>>,
}

/// What a share is kept from beyond its folder. Of a phone's share of this
/// computer's folder: judged by where a path really is on the disk, at
/// every use (`verso_fs::resolves_within`), never by its name and never
/// from a list kept. Of a read link (ADR 0105): the window of someone with
/// no account, shown no hidden path and, for one note, only that note and
/// what it embeds.
#[derive(Debug, PartialEq, Eq)]
pub struct Guard {
    /// The folder the share is a part of, on the disk.
    pub vault: std::path::PathBuf,
    /// Whether a path is judged by where it is on the disk (a phone's, and
    /// a read link of a folder inside the folder; not a link of the whole
    /// folder, which has no root to be inside of).
    pub disk: bool,
    /// A read link's window (ADR 0105): nothing hidden — no part of a path
    /// beginning with `.` — and not the quota's events.
    pub public: bool,
    /// A read link to one note: the owner's paths it may reach.
    pub only: Option<Only>,
}

impl Guard {
    /// A phone's guard: judged on the disk.
    #[must_use]
    pub fn phone(vault: std::path::PathBuf) -> Self {
        Self {
            vault,
            disk: true,
            public: false,
            only: None,
        }
    }
}

/// The paths of the owner's folder a read link to one note reaches (ADR
/// 0105 item 2): the note and what it embeds. Shared by the scope and the
/// connection that refreshes it as the note changes.
#[derive(Debug, Clone, Default)]
pub struct Only(std::sync::Arc<std::sync::Mutex<std::collections::BTreeSet<String>>>);

impl PartialEq for Only {
    fn eq(&self, other: &Self) -> bool {
        std::sync::Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for Only {}

impl Only {
    /// The paths now reached, in place of the ones before.
    pub fn set(&self, paths: impl IntoIterator<Item = String>) {
        *verso_service::lock(&self.0) = paths.into_iter().collect();
    }

    /// Whether `full` is one of them.
    #[must_use]
    pub fn allows(&self, full: &str) -> bool {
        verso_service::lock(&self.0).contains(full)
    }
}

/// Whether a part of `path` is hidden: begins with `.`.
fn hidden(path: &str) -> bool {
    path.split('/').any(|p| p.starts_with('.'))
}

/// Whether a path names a note, a board or a base — what the attachments
/// folder of a phone's share does not show.
fn note_like(path: &str) -> bool {
    path.rsplit_once('.').is_some_and(|(_, ext)| {
        ["md", "canvas", "base"]
            .iter()
            .any(|e| ext.eq_ignore_ascii_case(e))
    })
}

/// What the index's summary counts, of a share (ADR 0081 item 11).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Counts {
    pub notes: u32,
    pub placeholders: u32,
}

fn refused(message: &str) -> ContractError {
    verso_service::refused(message)
}

/// The key a share is opened under: an opaque name of letters, digits and
/// `-`, never the owner's.
#[must_use]
pub fn share_key(share: &str) -> String {
    let id: String = share
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    format!("share-{id}")
}

/// The last part of a path.
#[must_use]
pub fn last(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// A path the window sent, relative to the shared folder: `""` is its
/// root; no part empty, `.` or `..`, nothing absolute, no backslash or
/// NUL.
pub fn checked(rel: &str) -> Result<(), ContractError> {
    if rel.is_empty() {
        return Ok(());
    }
    if rel.starts_with('/') || rel.contains(['\\', '\0']) {
        return Err(refused("not a path inside the shared folder"));
    }
    if rel
        .split('/')
        .any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err(refused("not a path inside the shared folder"));
    }
    Ok(())
}

/// Whether a link's target, by its text alone, names a note or a board —
/// what `links` resolves — rather than a file: its last part has no
/// extension, or `.md`, `.canvas` or `.base`.
fn names_a_note(target: &str) -> bool {
    let last = target.rsplit('/').next().unwrap_or(target);
    match last.rsplit_once('.') {
        None => true,
        Some((_, ext)) => ["md", "canvas", "base"]
            .iter()
            .any(|e| ext.eq_ignore_ascii_case(e)),
    }
}

/// What a command may do at a path.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Use {
    Read,
    Write,
    /// A write that may not be the shared folder itself (a rename, a
    /// deletion).
    Below,
}

impl Scope {
    /// The path in the owner's folder of `rel`, for `how`.
    fn full(&self, rel: &str, how: Use) -> Result<String, ContractError> {
        checked(rel)?;
        if let Some((name, path)) = &self.mount {
            let first = rel.split('/').next().unwrap_or(rel);
            if first == name {
                if how != Use::Read {
                    return Err(refused("the attachments folder is shared to be read only"));
                }
                let full = format!("{path}{}", &rel[name.len()..]);
                self.allowed(&full, true)?;
                return Ok(full);
            }
        }
        if rel.is_empty() {
            if how == Use::Below {
                return Err(refused("the shared folder itself is its owner's"));
            }
            return Ok(self.root.clone());
        }
        let full = if self.root.is_empty() {
            rel.to_owned()
        } else {
            format!("{}/{rel}", self.root)
        };
        self.allowed(&full, false)?;
        Ok(full)
    }

    /// Refuse a path a phone is kept from (see [`Guard`]).
    fn allowed(&self, full: &str, in_mount: bool) -> Result<(), ContractError> {
        if self.blocked(full, in_mount) {
            return Err(refused("not in the shared folder"));
        }
        Ok(())
    }

    fn blocked(&self, full: &str, in_mount: bool) -> bool {
        let Some(g) = &self.guard else {
            return false;
        };
        if g.public && hidden(full) {
            return true;
        }
        if g.only.as_ref().is_some_and(|only| !only.allows(full)) {
            return true;
        }
        if !g.disk {
            return false;
        }
        let within = match (&self.mount, in_mount) {
            (Some((_, path)), true) => path,
            _ => &self.root,
        };
        (in_mount && note_like(full)) || !verso_fs::resolves_within(&g.vault, full, within)
    }

    /// The path in the owner's folder of a path the window sent, to read.
    pub fn to_full(&self, rel: &str) -> Result<String, ContractError> {
        self.full(rel, Use::Read)
    }

    /// The same, to write.
    pub fn to_full_write(&self, rel: &str) -> Result<String, ContractError> {
        self.full(rel, Use::Below)
    }

    /// The path the window knows of a path of the owner's folder; `None`
    /// when it is not in the share.
    #[must_use]
    pub fn to_rel(&self, full: &str) -> Option<String> {
        if covers(&self.root, full) {
            if self.blocked(full, false) {
                return None;
            }
            return Some(full[self.root.len()..].trim_start_matches('/').to_owned());
        }
        if let Some((name, path)) = &self.mount
            && covers(path, full)
        {
            if self.blocked(full, true) {
                return None;
            }
            return Some(format!("{name}{}", &full[path.len()..]));
        }
        None
    }

    /// Whether `full` is strictly under the shared folder — not the folder
    /// itself (a bin entry of the folder's own root is the owner's), and never the
    /// attachments folder shown with it, which is the owner's to keep
    /// (ADR 0081 item 16): what the bin gives back lands in the share.
    #[must_use]
    pub fn in_root(&self, full: &str) -> bool {
        full != self.root && covers(&self.root, full) && !self.blocked(full, false)
    }

    fn rel_value(&self, v: &Value) -> Option<Value> {
        v.as_str().and_then(|p| self.to_rel(p)).map(Value::String)
    }

    /// A message of the core said to the window: the owner's paths written
    /// as the window knows them.
    #[must_use]
    pub fn said(&self, message: &str) -> String {
        let mut out = if self.root.is_empty() {
            message.to_owned()
        } else {
            message.replace(&format!("{}/", self.root), "")
        };
        if let Some((name, path)) = &self.mount {
            out = out.replace(&format!("{path}/"), &format!("{name}/"));
        }
        out
    }

    /// An error answered to the window, in its own paths.
    #[must_use]
    pub fn error(&self, mut e: ContractError) -> ContractError {
        e.message = self.said(&e.message);
        e
    }

    /// A warning of the core kept only when it begins with a path inside
    /// the share — the shared folder's, or the attachments folder shown
    /// with it — re-rooted there. Any other is dropped (ADR 0081 item
    /// 11): a note at the owner's root names no `/` and is still outside
    /// (threat model, gap closed 2026-10-12), and a warning that names no
    /// path cannot be said to be the share's.
    ///
    /// The rest of the line is the core's message about that path, and may
    /// name another — `Mesa/x.md: the link [[Segredo]] could not be
    /// pointed at Segredo.md`. Every name it holds must be inside the share
    /// too, or the whole warning is dropped: a name cannot be cut out of a
    /// sentence safely, and a warning lost is only less said.
    fn warning(&self, w: &str) -> Option<String> {
        let (said, rest) = if self.root.is_empty() && !w.starts_with('/') {
            (w.to_owned(), w)
        } else if let Some(rest) = w.strip_prefix(&format!("{}/", self.root)) {
            (self.said(rest), rest)
        } else if let Some((name, path)) = &self.mount
            && let Some(rest) = w.strip_prefix(&format!("{path}/"))
        {
            (format!("{name}/{}", self.said(rest)), rest)
        } else {
            return None;
        };
        // The path the warning is about ends at the first ": "; what
        // follows is the message.
        let message = rest.split_once(": ").map_or("", |(_, m)| m);
        if self.names_outside(message) {
            return None;
        }
        Some(said)
    }

    /// Whether `message` holds a name that is not a path inside the share:
    /// a link (`[[…]]`), or a word that looks like a path — a `/` or `\`
    /// in it, or a name with an extension (`Segredo.md`) — that is not, as
    /// the owner's path, in the share or its attachments folder. Erring
    /// towards a name: `e.g.` counts as one.
    fn names_outside(&self, message: &str) -> bool {
        if message.contains("[[") {
            return true;
        }
        message.split_whitespace().any(|word| {
            let word = word.trim_matches(|c: char| {
                matches!(
                    c,
                    '"' | '\''
                        | '`'
                        | '('
                        | ')'
                        | '['
                        | ']'
                        | '{'
                        | '}'
                        | '<'
                        | '>'
                        | ','
                        | ';'
                        | ':'
                        | '.'
                        | '!'
                        | '?'
                )
            });
            let pathlike = word.contains(['/', '\\'])
                || word.rsplit_once('.').is_some_and(|(stem, ext)| {
                    !stem.is_empty()
                        && !ext.is_empty()
                        && ext.len() <= 10
                        && ext.chars().all(char::is_alphanumeric)
                        && ext.chars().any(char::is_alphabetic)
                });
            pathlike && self.to_rel(word).is_none()
        })
    }

    fn warnings(&self, v: &mut Value) {
        if let Some(list) = v.as_array_mut() {
            *list = list
                .iter()
                .filter_map(|w| w.as_str().and_then(|w| self.warning(w)))
                .map(Value::String)
                .collect();
        }
    }

    /// Rewrite the field `field` of `v` in place; false when it is not in
    /// the share.
    fn field(&self, v: &mut Value, field: &str) -> bool {
        match self.rel_value(&v[field]) {
            Some(rel) => {
                v[field] = rel;
                true
            }
            None => false,
        }
    }

    /// Keep the objects of the list `v` whose `field` is in the share,
    /// re-rooted.
    fn keep(&self, v: &mut Value, field: &str) {
        if let Some(list) = v.as_array_mut() {
            list.retain_mut(|item| self.field(item, field));
        }
    }

    fn keep_strings(&self, v: &mut Value) {
        if let Some(list) = v.as_array_mut() {
            *list = list.iter().filter_map(|p| self.rel_value(p)).collect();
        }
    }

    /// Moves: kept when both ends are in the share.
    fn moves(&self, v: &mut Value) {
        if let Some(list) = v.as_array_mut() {
            list.retain_mut(|m| {
                let (Some(from), Some(to)) = (self.rel_value(&m["from"]), self.rel_value(&m["to"]))
                else {
                    return false;
                };
                m["from"] = from;
                m["to"] = to;
                true
            });
        }
    }

    /// The arguments of a command of the folder, with its paths joined to
    /// the share's. A command not known here is refused.
    pub fn args_in(&self, cmd: &str, mut args: Value) -> Result<Value, ContractError> {
        if args.is_null() {
            args = json!({});
        }
        let set = |args: &mut Value, field: &str, how: Use| -> Result<(), ContractError> {
            let rel = args[field]
                .as_str()
                .ok_or_else(|| refused(&format!("{field}: a path")))?
                .to_owned();
            args[field] = Value::String(self.full(&rel, how)?);
            Ok(())
        };
        match cmd {
            "list_notes" | "list_files" | "list_tags" | "list_block_ids" | "list_web_notes"
            | "graph" | "list_folders" | "list_entries" | "notes_of_type" => {}
            "search" => args["limit"] = json!(200),
            "read_note" | "links" | "backlinks" | "read_file_text" | "read_text"
            | "board_preview" | "unlinked_mentions" | "map_open" | "map_tile" => {
                set(&mut args, "path", Use::Read)?;
            }
            "resolve_attachment" => {
                let bare = args["source"].as_str() == Some("");
                set(&mut args, "source", Use::Read)?;
                // No note says where the target is written from (the table's
                // pictures): the share's root, a folder. A file's target is
                // looked up from the source's folder, so the folder's own
                // path (not its parent) is what the source must name.
                if bare && !self.root.is_empty() {
                    let at = args["source"].as_str().unwrap_or_default().to_owned();
                    args["source"] = json!(format!("{at}/"));
                }
            }
            "write_note" | "create_file" | "create_folder" | "write_text" | "write_board" => {
                set(&mut args, "path", Use::Below)?;
            }
            "create_note" => set(&mut args, "name", Use::Below)?,
            "delete_note" | "delete_entry" => set(&mut args, "path", Use::Below)?,
            "rename_note" | "rename_entry" => {
                set(&mut args, "from", Use::Below)?;
                set(&mut args, "to", Use::Below)?;
            }
            "move_entries" => {
                set(&mut args, "folder", Use::Write)?;
                let paths: Vec<String> = args["paths"]
                    .as_array()
                    .ok_or_else(|| refused("paths: a list"))?
                    .iter()
                    .map(|p| {
                        p.as_str()
                            .ok_or_else(|| refused("paths: a list of paths"))
                            .and_then(|p| self.full(p, Use::Below))
                    })
                    .collect::<Result<_, _>>()?;
                args["paths"] = json!(paths);
            }
            "query_base" => {
                // A base walks the folder's entries; one with a link out of
                // it under the share is not answered.
                if let Some(g) = self.guard.as_ref().filter(|g| g.disk) {
                    let clean = self.roots().iter().all(|r| {
                        verso_fs::escaping_links(&g.vault, r).is_ok_and(|found| found.is_empty())
                    });
                    if !clean {
                        return Err(refused("a link leads out of this folder"));
                    }
                }
                for field in ["path", "this"] {
                    if args["query"][field].is_string() {
                        set(&mut args["query"], field, Use::Read)?;
                    }
                }
            }
            _ => return Err(refused("not in a shared folder")),
        }
        Ok(args)
    }

    /// The answer of a command of the folder, filtered to the share and
    /// re-rooted at it. `limit` is what a search asked for.
    #[must_use]
    pub fn answer_out(&self, cmd: &str, mut v: Value, limit: usize) -> Value {
        match cmd {
            "list_notes" | "list_files" | "notes_of_type" => self.keep_strings(&mut v),
            "list_folders" => {
                self.keep_strings(&mut v);
                if let Some(list) = v.as_array_mut() {
                    list.retain(|p| p != "");
                }
            }
            "list_entries" => {
                self.keep(&mut v, "path");
                if let Some(list) = v.as_array_mut() {
                    list.retain(|e| e["path"] != "");
                }
            }
            "search" => {
                self.keep(&mut v, "path");
                if let Some(list) = v.as_array_mut() {
                    list.truncate(limit);
                }
            }
            "list_web_notes" => self.keep(&mut v, "path"),
            // A block of a note outside the share is not said.
            "list_block_ids" => self.keep(&mut v["blocks"], "path"),
            "backlinks" => self.keep(&mut v, "from"),
            // A mention in a note outside the share is not said (ADR 0089).
            "unlinked_mentions" => self.keep(&mut v["mentions"], "path"),
            "graph" => {
                if let Some(list) = v.as_array_mut() {
                    list.retain_mut(|e| self.field(e, "from") && self.field(e, "to"));
                }
            }
            "list_tags" => {
                if let Some(list) = v.as_array_mut() {
                    list.retain_mut(|t| {
                        self.keep_strings(&mut t["notes"]);
                        t["notes"].as_array().is_some_and(|n| !n.is_empty())
                    });
                }
            }
            // A link that resolves outside the share and one that resolves
            // nowhere cross alike: told apart, they would say whether a
            // note of that name exists outside (ADR 0081 item 11). Both
            // are "not in what was shared with you" when the target names
            // a note, by its text alone; a file's target (`p.png`) is
            // never resolved here, and `resolve_attachment` answers alike
            // for outside and nowhere, so it stays as it was — a file
            // inside the share still opens.
            "links" => {
                if let Some(list) = v.as_array_mut() {
                    for l in list {
                        if !(l["resolved"].is_string() && self.field(l, "resolved")) {
                            l["resolved"] = Value::Null;
                            l["outside"] = json!(names_a_note(l["target"].as_str().unwrap_or("")));
                        }
                    }
                }
            }
            "read_note" | "create_note" | "read_text" | "write_text" | "write_board" => {
                self.field(&mut v, "path");
                self.note_type(&mut v);
                // A warning of the core names the owner's paths: kept only
                // when it is about the share's own (ADR 0081 item 11).
                if v.get("warnings").is_some() {
                    self.warnings(&mut v["warnings"]);
                }
            }
            "write_note" => {
                self.field(&mut v["note"], "path");
                self.note_type(&mut v["note"]);
                self.warnings(&mut v["warnings"]);
            }
            "resolve_attachment" | "create_file" | "create_folder" => {
                v = self.rel_value(&v).unwrap_or(Value::Null);
            }
            "delete_note" | "delete_entry" => {
                // Where in the owner's folder the bin put it is the owner's.
                v["path"] = json!(".trash");
                self.warnings(&mut v["warnings"]);
            }
            "rename_note" | "rename_entry" | "move_entries" => {
                self.field(&mut v, "path");
                self.keep(&mut v["rewrites"], "path");
                self.keep(&mut v["skipped"], "path");
                self.keep(&mut v["refused"], "path");
                self.moves(&mut v["moved"]);
                self.moves(&mut v["also"]);
                self.warnings(&mut v["warnings"]);
            }
            "query_base" => self.base(&mut v),
            _ => {}
        }
        v
    }

    /// A note's type, resolved over the share's schemas only
    /// ([`Scope::typed_within`]): this is the second fence — the schemas
    /// it names re-rooted at the share, and no type at all when one of
    /// them is outside it (ADR 0081 item 11).
    fn note_type(&self, note: &mut Value) {
        let Some(t) = note.get_mut("note_type").filter(|t| !t.is_null()) else {
            return;
        };
        let state = &mut t["state"];
        let inside = match state.get_mut("schemas").and_then(Value::as_array_mut) {
            Some(list) => list.iter_mut().all(|p| match self.rel_value(p) {
                Some(rel) => {
                    *p = rel;
                    true
                }
                None => false,
            }),
            None => self.field(state, "schema"),
        };
        if !inside {
            *t = Value::Null;
        }
    }

    /// The answer of `cmd` (`read_note`, `create_note`, `write_note`) with
    /// the note's type resolved again over the share's folders only (ADR
    /// 0081 item 11): a schema the owner keeps outside the share types
    /// nothing in it and is never named. In the owner's paths, before
    /// [`Scope::answer_out`].
    #[must_use]
    pub fn typed_within(&self, ws: &verso_core::Workspace, cmd: &str, mut v: Value) -> Value {
        let note = if cmd == "write_note" {
            &mut v["note"]
        } else {
            &mut v
        };
        if note.get("note_type").is_none_or(Value::is_null) {
            return v;
        }
        let text = note["text"].as_str().unwrap_or_default().to_owned();
        note["note_type"] = ws
            .note_type_within(&text, &self.roots())
            .ok()
            .flatten()
            .map(verso_service::convert::note_type_out)
            .and_then(|t| serde_json::to_value(t).ok())
            .unwrap_or(Value::Null);
        v
    }

    /// A base's answer, re-rooted at the share. The base was evaluated
    /// over the share only (`query_base_within`, ADR 0081 item 11), so its
    /// rows, property names, formulas and summaries are the share's; this
    /// is the second fence: a row outside gone, the summaries of a group
    /// that lost one unsaid, a link or a file outside saying nothing.
    fn base(&self, v: &mut Value) {
        let mut removed = 0_u64;
        if let Some(groups) = v["groups"].as_array_mut() {
            groups.retain_mut(|g| {
                let Some(rows) = g["rows"].as_array_mut() else {
                    return true;
                };
                let before = rows.len();
                rows.retain_mut(|r| self.field(r, "path"));
                for r in rows.iter_mut() {
                    if let Some(cells) = r["cells"].as_array_mut() {
                        for c in cells {
                            self.cell(c);
                        }
                    }
                }
                let lost = before - rows.len();
                removed += lost as u64;
                if lost > 0
                    && let Some(s) = g["summaries"].as_array_mut()
                {
                    s.iter_mut().for_each(|x| *x = Value::Null);
                }
                if let Some(k) = g.get_mut("key") {
                    self.cell(k);
                }
                before == 0 || !g["rows"].as_array().is_some_and(Vec::is_empty)
            });
        }
        let total = v["total"].as_u64().unwrap_or(0).saturating_sub(removed);
        v["total"] = json!(total);
    }

    /// A value of a base: a link or a file outside the share says nothing
    /// of where it leads.
    fn cell(&self, c: &mut Value) {
        match c["kind"].as_str() {
            Some("link") => {
                if c["value"]["path"].is_string() && !self.field(&mut c["value"], "path") {
                    c["value"]["path"] = Value::Null;
                }
            }
            Some("file") => match self.rel_value(&c["value"]) {
                Some(rel) => c["value"] = rel,
                None => *c = json!({ "kind": "empty" }),
            },
            Some("image") => {
                let url = c["value"]
                    .as_str()
                    .is_some_and(|p| p.contains("://") || p.starts_with("data:"));
                if !url {
                    match self.rel_value(&c["value"]) {
                        Some(rel) => c["value"] = rel,
                        None => *c = json!({ "kind": "empty" }),
                    }
                }
            }
            Some("list") => {
                if let Some(items) = c["value"].as_array_mut() {
                    items.iter_mut().for_each(|x| self.cell(x));
                }
            }
            Some("object") => {
                if let Some(items) = c["value"].as_array_mut() {
                    for pair in items {
                        if let Some(x) = pair.get_mut(1) {
                            self.cell(x);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    /// The space the share's files take (ADR 0075 item 4): the shared
    /// folder's, never the owner's whole folder's.
    #[must_use]
    pub fn space(&self, entries: &[verso_core::FileEntry]) -> verso_contract::FolderSpace {
        let mut space = verso_contract::FolderSpace {
            total: 0.0,
            notes: 0.0,
            attachments: 0.0,
            files: 0,
            index: 0.0,
        };
        for e in entries {
            if !covers(&self.root, &e.path) || self.blocked(&e.path, false) {
                continue;
            }
            let len = e.len as f64;
            match e.kind {
                verso_core::FileKind::Note => space.notes += len,
                verso_core::FileKind::File | verso_core::FileKind::Placeholder => {
                    space.attachments += len;
                }
                verso_core::FileKind::Folder => continue,
            }
            space.total += len;
            space.files = space.files.saturating_add(1);
        }
        space
    }

    /// The folders of the owner's a base through the share sees: the
    /// shared folder, and the attachments folder shown with it.
    #[must_use]
    pub fn roots(&self) -> Vec<String> {
        let mut roots = vec![self.root.clone()];
        // A phone's attachments folder holds files, which a base has no
        // rows from.
        if self.guard.is_none() {
            roots.extend(self.mount.as_ref().map(|(_, path)| path.clone()));
        }
        roots
    }

    /// The share's own counts, as the index's summary says the folder's
    /// (ADR 0081 item 11, decided 2026-10-12): the notes the window sees,
    /// and how many of them are still only in the cloud (ADR 0043).
    ///
    /// The notes are the index's, as `list_notes` answers them; the
    /// placeholders the last walk's.
    pub fn counts(&self, ws: &verso_core::Workspace) -> Result<Counts, verso_core::CoreError> {
        let visible = |p: &str| self.to_rel(p).is_some();
        let count = |n: usize| u32::try_from(n).unwrap_or(u32::MAX);
        let notes = ws.notes()?.iter().filter(|p| visible(p)).count();
        let placeholders = ws
            .entries()
            .iter()
            .filter(|e| {
                e.kind == verso_core::FileKind::Placeholder
                    && e.path.to_lowercase().ends_with(".md")
                    && visible(&e.path)
            })
            .count();
        Ok(Counts {
            notes: count(notes),
            placeholders: count(placeholders),
        })
    }

    /// The folder as the window knows it: the share's name and key, the
    /// index's problems and counts of the share only.
    #[must_use]
    pub fn info(&self, mut info: Value, counts: Option<Counts>) -> Value {
        info["name"] = json!(self.name);
        info["key"] = json!(self.key);
        self.summary(&mut info["index"], counts);
        info
    }

    /// An index run's summary: its problems in the share only, and its
    /// counts the share's — every note of it as up to date, when they are
    /// known; zero when they are not, never the owner's folder's.
    pub fn summary(&self, index: &mut Value, counts: Option<Counts>) {
        self.warnings(&mut index["problems"]);
        if index.is_object() {
            let c = counts.unwrap_or_default();
            index["indexed"] = json!(0);
            index["removed"] = json!(0);
            index["unchanged"] = json!(c.notes);
            index["placeholders"] = json!(c.placeholders);
        }
    }

    /// A message pushed to the window, in its paths; `None` when nothing of
    /// it is the share's. An event not known here is not sent.
    #[must_use]
    pub fn push(&self, message: &Value) -> Option<Value> {
        let Some(event) = message["event"].as_str() else {
            // What the server says of the connection itself.
            return Some(message.clone());
        };
        let mut m = message.clone();
        match event {
            "folder-changed" => {
                let p = &mut m["payload"];
                p["key"] = json!(self.key);
                let mut changed: Vec<Value> = Vec::new();
                let mut removed: Vec<Value> = Vec::new();
                let mut moved: Vec<Value> = Vec::new();
                for c in p["changed"].as_array().into_iter().flatten() {
                    changed.extend(self.rel_value(c));
                }
                for c in p["removed"].as_array().into_iter().flatten() {
                    removed.extend(self.rel_value(c));
                }
                for mv in p["moved"].as_array().into_iter().flatten() {
                    match (self.rel_value(&mv["from"]), self.rel_value(&mv["to"])) {
                        (Some(from), Some(to)) => moved.push(json!({ "from": from, "to": to })),
                        // Moved out of the share: gone, to the window.
                        (Some(from), None) => removed.push(from),
                        // Moved in: new, to the window.
                        (None, Some(to)) => changed.push(to),
                        (None, None) => {}
                    }
                }
                if changed.is_empty() && removed.is_empty() && moved.is_empty() {
                    return None;
                }
                p["changed"] = json!(changed);
                p["removed"] = json!(removed);
                p["moved"] = json!(moved);
                // The run's counts are the owner's folder's: zero here.
                self.summary(&mut p["index"], None);
            }
            "index-progress" => {
                let file = self.rel_value(&m["payload"]["file"]).unwrap_or(Value::Null);
                m["payload"]["file"] = file;
                // How far a walk of the owner's whole folder is: not the
                // share's to know (item 11). Left out, not zero — a zero
                // would read as a count; the window shows the walk
                // without one.
                if let Some(p) = m["payload"].as_object_mut() {
                    p.remove("current");
                    p.remove("total");
                }
            }
            "collab-update" | "collab-awareness" | "collab-saved" | "collab-conflict"
            | "collab-closed" | "collab-roll" | "collab-oracle" => {
                if !self.field(&mut m["payload"], "path") {
                    return None;
                }
            }
            // The folder's head is not the share's (3.18): a device asks
            // the share for its own. (`push_sync_changed` already sends
            // the share's windows only its own changes, without it.)
            "sync-changed" => {
                if let Some(p) = m["payload"].as_object_mut() {
                    p.remove("head");
                }
            }
            // The folder's quota is the owner's to know, and a read link's
            // window has no owner (ADR 0105 item 6).
            "folder-quota" => {
                if self.guard.as_ref().is_some_and(|g| g.public) {
                    return None;
                }
            }
            // A folder given to the person (ADR 0084 item 7): theirs to
            // know whichever folder this window shows, and nothing of the
            // owner's folder beyond what was given.
            "share-given" => {}
            // A table's state changed (ADR 0110): the window asks its status
            // again; no path of the owner's folder goes with it.
            "campaign-changed" => m["payload"]["paths"] = json!([]),
            // The table's events (ADR 0107, 0110): a window on a share at a
            // table hears what a member hears. `table.rs` already wrote the
            // table as `""` and the paths from the share's root before it
            // pushed, so nothing of the owner's folder is in them.
            "table-entry" | "table-roster" | "table-pinned" | "table-removed" | "table-cleared"
            | "table-images" => {}
            _ => return None,
        }
        Some(m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> Scope {
        Scope {
            share: "s1".into(),
            key: share_key("s1"),
            name: "Campanha (Sérgio)".into(),
            root: "Mesa/Campanha".into(),
            mount: Some(("Anexos".into(), "Anexos".into())),
            guard: None,
        }
    }

    #[test]
    fn a_path_from_the_window_never_leaves_the_share() {
        let s = scope();
        assert_eq!(s.to_full("a.md").unwrap(), "Mesa/Campanha/a.md");
        assert_eq!(s.to_full("").unwrap(), "Mesa/Campanha");
        assert_eq!(s.to_full("Anexos/p.png").unwrap(), "Anexos/p.png");
        for bad in [
            "..",
            "../x.md",
            "a/../../x.md",
            "a/./b.md",
            "/etc/passwd",
            "a//b.md",
            "a/",
            "a\\..\\b",
            "a\0b",
            ".",
        ] {
            assert!(s.to_full(bad).is_err(), "{bad:?}");
        }
        // The share's root and the attachments are not written.
        assert!(s.to_full_write("").is_err());
        // A target written from the share's root, with no note to say it: looked up from there.
        let asked = s
            .args_in(
                "resolve_attachment",
                json!({ "source": "", "target": "a/p.png" }),
            )
            .unwrap();
        assert_eq!(asked["source"], "Mesa/Campanha/", "{asked}");
        let from_note = s
            .args_in(
                "resolve_attachment",
                json!({ "source": "n.md", "target": "p.png" }),
            )
            .unwrap();
        assert_eq!(from_note["source"], "Mesa/Campanha/n.md", "{from_note}");
        assert!(s.to_full_write("Anexos/p.png").is_err());
        assert!(s.args_in("delete_entry", json!({ "path": "" })).is_err());
        assert!(
            s.args_in("rename_entry", json!({ "from": "a.md", "to": "../a.md" }))
                .is_err()
        );
        assert!(
            s.args_in("move_entries", json!({ "paths": ["a.md"], "folder": ".." }))
                .is_err()
        );
        // A command this module does not know is refused.
        assert!(s.args_in("set_focuses", json!({})).is_err());
        assert!(s.args_in("anything_new", json!({})).is_err());
    }

    /// The second fence of a note's type: a schema outside the share
    /// takes the type with it; one inside is re-rooted.
    #[test]
    fn a_notes_type_names_no_schema_outside_the_share() {
        let s = scope();
        let typed = |schema: &str| {
            json!({ "path": "Mesa/Campanha/x.md", "note_type": { "written": "pessoa",
                "state": { "kind": "typed", "schema": schema, "name": "pessoa" } } })
        };
        let outside = s.answer_out("read_note", typed("Schemas/pessoa.md"), 0);
        assert_eq!(outside["note_type"], Value::Null, "{outside}");
        let inside = s.answer_out("read_note", typed("Mesa/Campanha/T/pessoa.md"), 0);
        assert_eq!(inside["note_type"]["state"]["schema"], "T/pessoa.md");
        let conflict = s.answer_out(
            "write_note",
            json!({ "note": { "path": "Mesa/Campanha/x.md", "note_type": { "written": "p",
                "state": { "kind": "conflict", "schemas": ["Mesa/Campanha/a.md", "Mesa/b.md"] } } },
                "warnings": [] }),
            0,
        );
        assert_eq!(conflict["note"]["note_type"], Value::Null, "{conflict}");
        let plain = s.answer_out(
            "create_note",
            json!({ "path": "Mesa/Campanha/x.md", "note_type": null }),
            0,
        );
        assert_eq!(plain["note_type"], Value::Null);
    }

    #[test]
    fn an_answer_says_nothing_outside_the_share() {
        let s = scope();
        assert_eq!(s.to_rel("Mesa/Campanha/x.md").as_deref(), Some("x.md"));
        assert_eq!(s.to_rel("Mesa/Campanha2/x.md"), None);
        assert_eq!(s.to_rel("Mesa"), None);
        assert_eq!(s.to_rel("Mesa/x.md"), None);
        assert_eq!(s.to_rel("Anexos/p.png").as_deref(), Some("Anexos/p.png"));
        let notes = s.answer_out(
            "list_notes",
            json!(["Mesa/Campanha/a.md", "Mesa/Segredo.md", "Diario/b.md"]),
            0,
        );
        assert_eq!(notes, json!(["a.md"]));
        let links = s.answer_out(
            "links",
            json!([
                { "target": "a", "resolved": "Mesa/Campanha/a.md" },
                { "target": "Segredo", "resolved": "Mesa/Segredo.md" },
                { "target": "nada", "resolved": null }
            ]),
            0,
        );
        assert_eq!(links[0]["resolved"], "a.md");
        assert_eq!(links[1]["resolved"], Value::Null);
        assert_eq!(links[1]["outside"], true);
        // Resolved nowhere: the same as outside.
        assert_eq!(links[2]["resolved"], Value::Null);
        assert_eq!(links[2]["outside"], true);
        // A file's target is left to `resolve_attachment`, whatever is
        // behind it.
        let files = s.answer_out(
            "links",
            json!([{ "target": "p.png", "resolved": null }, { "target": "B.Canvas", "resolved": null }]),
            0,
        );
        assert_eq!(files[0]["outside"], false, "{files}");
        assert_eq!(files[1]["outside"], true, "{files}");
        let graph = s.answer_out(
            "graph",
            json!([
                { "from": "Mesa/Campanha/a.md", "to": "Mesa/Segredo.md" },
                { "from": "Mesa/Campanha/a.md", "to": "Mesa/Campanha/b.md" }
            ]),
            0,
        );
        assert_eq!(graph, json!([{ "from": "a.md", "to": "b.md" }]));
        let tags = s.answer_out(
            "list_tags",
            json!([{ "name": "x", "notes": ["Mesa/Segredo.md"] }]),
            0,
        );
        assert_eq!(tags, json!([]));
        let renamed = s.answer_out(
            "rename_entry",
            json!({ "path": "Mesa/Campanha/b.md", "rewrites": [{ "path": "Mesa/Segredo.md" }],
                    "skipped": [], "warnings": ["Mesa/Segredo.md: x", "Mesa/Campanha/c.md: y"],
                    "also": [] }),
            0,
        );
        assert_eq!(renamed["path"], "b.md");
        assert_eq!(renamed["rewrites"], json!([]));
        assert_eq!(renamed["warnings"], json!(["c.md: y"]));
        assert_eq!(s.said("not found: Mesa/Campanha/x.md"), "not found: x.md");
    }

    #[test]
    fn a_warning_reaches_the_window_only_about_a_path_inside_the_share() {
        let s = Scope {
            share: "s1".into(),
            key: share_key("s1"),
            name: "Mesa (Sérgio)".into(),
            root: "Mesa".into(),
            mount: Some(("Anexos".into(), "Anexos".into())),
            guard: None,
        };
        // A rename's examination warns of the notes it read: one at the
        // owner's root has no `/` and is still outside.
        let renamed = s.answer_out(
            "rename_entry",
            json!({ "path": "Mesa/b.md", "rewrites": [], "skipped": [], "also": [],
                    "warnings": [
                        "Segredo.md: not JSON, its links were not followed",
                        "Mesa2/Fora.md: permission denied",
                        "Mesa/x.md: permission denied",
                        "Anexos/p.png: not readable",
                        "the index could not follow it"
                    ] }),
            0,
        );
        assert_eq!(
            renamed["warnings"],
            json!(["x.md: permission denied", "Anexos/p.png: not readable"])
        );
        let mut index = json!({ "problems": ["Segredo.md: bad", "Mesa/x.md: bad"] });
        s.summary(&mut index, None);
        assert_eq!(index["problems"], json!(["x.md: bad"]));
    }

    /// A warning about a path inside the share that names an outside path
    /// later in the line is dropped whole (threat model, gap closed
    /// 2026-10-12): `Mesa/x.md: links to Segredo.md` says that the owner
    /// has a `Segredo.md`. One whose message names only paths inside the
    /// share, or none, is kept.
    #[test]
    fn a_warning_naming_an_outside_path_later_in_the_line_is_dropped() {
        let s = Scope {
            share: "s1".into(),
            key: share_key("s1"),
            name: "Mesa (Sérgio)".into(),
            root: "Mesa".into(),
            mount: Some(("Anexos".into(), "Anexos".into())),
            guard: None,
        };
        let renamed = s.answer_out(
            "rename_entry",
            json!({ "path": "Mesa/b.md", "rewrites": [], "skipped": [], "also": [],
                    "warnings": [
                        "Mesa/x.md: links to Segredo.md",
                        "Mesa/x.md: the link [[Segredo]] could not be pointed at Segredo.md",
                        "Mesa/x.md: moved beside Fora/y.md",
                        "Anexos/p.png: read through /Users/owner/Notas/Segredo.md",
                        "Mesa/x.md: links to Mesa/y.md",
                        "Mesa/x.md: links to Anexos/p.png",
                        "Mesa/Minha nota.md: permission denied (os error 13)"
                    ] }),
            0,
        );
        assert_eq!(
            renamed["warnings"],
            json!([
                "x.md: links to y.md",
                "x.md: links to Anexos/p.png",
                "Minha nota.md: permission denied (os error 13)"
            ])
        );
    }

    #[test]
    fn an_event_reaches_the_window_only_with_the_share_in_it() {
        let s = scope();
        let outside = json!({ "event": "folder-changed", "payload": {
            "key": "owner", "changed": ["Mesa/Segredo.md"], "removed": [], "moved": [],
            "listing": true, "index": { "problems": ["Mesa/Segredo.md: bad"] } } });
        assert_eq!(s.push(&outside), None);
        let mixed = json!({ "event": "folder-changed", "payload": {
            "key": "owner", "changed": ["Mesa/Segredo.md", "Mesa/Campanha/a.md"], "removed": [],
            "moved": [{ "from": "Mesa/Campanha/b.md", "to": "Mesa/Segredo2.md" }],
            "listing": false, "index": { "problems": ["Mesa/Segredo.md: bad"],
            "indexed": 2, "unchanged": 480, "removed": 1, "placeholders": 7 } } });
        let seen = s.push(&mixed).unwrap();
        assert_eq!(seen["payload"]["key"], s.key);
        assert_eq!(seen["payload"]["changed"], json!(["a.md"]));
        assert_eq!(seen["payload"]["removed"], json!(["b.md"]));
        assert_eq!(seen["payload"]["index"]["problems"], json!([]));
        // The run's counts are the owner's folder's: zero to the share
        // (ADR 0081 item 11), never the folder's total.
        for count in ["indexed", "unchanged", "removed", "placeholders"] {
            assert_eq!(seen["payload"]["index"][count], 0, "{count}");
        }
        let walk = json!({ "event": "index-progress", "payload": {
            "phase": "indexing", "current": 120, "total": 480, "file": "Mesa/Segredo.md" } });
        let seen = s.push(&walk).unwrap();
        assert!(seen["payload"].get("current").is_none(), "{seen}");
        assert!(seen["payload"].get("total").is_none(), "{seen}");
        assert_eq!(seen["payload"]["phase"], "indexing");
        assert_eq!(seen["payload"]["file"], Value::Null);
        let room = json!({ "event": "collab-update", "payload": { "path": "Mesa/Segredo.md" } });
        assert_eq!(s.push(&room), None);
        // A roll of dice in a shared note (ADR 0088 item 4), in the
        // share's path; one outside it never reaches the window.
        let roll = json!({ "event": "collab-roll", "payload": {
            "path": "Mesa/Campanha/a.md", "roll": { "total": 7 } } });
        let seen = s.push(&roll).unwrap();
        assert_eq!(seen["payload"]["path"], "a.md");
        assert_eq!(seen["payload"]["roll"]["total"], 7);
        let roll = json!({ "event": "collab-roll", "payload": { "path": "Mesa/Segredo.md" } });
        assert_eq!(s.push(&roll), None);
        assert_eq!(
            s.push(&json!({ "event": "something-new", "payload": { "path": "x" } })),
            None
        );
        assert!(s.push(&json!({ "gone": "folder" })).is_some());
    }

    /// The bin gives a share only what was strictly under its folder: the
    /// folder's own root (made anew after the owner binned it) and the
    /// attachments folder are not the share's to restore.
    #[test]
    fn the_bin_is_strictly_under_the_shared_folder() {
        let s = scope();
        assert!(s.in_root(&format!("{}/a.md", s.root)));
        assert!(!s.in_root(&s.root.clone()));
        assert!(!s.in_root("Anexos/x.png"));
        assert!(!s.in_root("Outra/a.md"));
    }
    /// A read link's scope (ADR 0105): nothing hidden, whatever the core
    /// would say; and a link to one note reaches the paths it was given.
    #[test]
    fn a_read_links_scope_reaches_nothing_hidden_and_only_what_it_was_given() {
        let public = |root: &str, only: Option<Only>| Scope {
            share: "link-1".into(),
            key: "share-link-1".into(),
            name: "L".into(),
            root: root.into(),
            mount: None,
            guard: Some(std::sync::Arc::new(Guard {
                vault: std::path::PathBuf::new(),
                disk: false,
                public: true,
                only,
            })),
        };
        // The whole folder: a root of "" covers every path but a hidden one.
        let whole = public("", None);
        assert_eq!(whole.to_full("a/b.md").unwrap(), "a/b.md");
        assert_eq!(whole.to_rel("a/b.md").as_deref(), Some("a/b.md"));
        for hidden in [".verso/x.json", "a/.trash/b.md", ".git/config"] {
            assert!(whole.to_full(hidden).is_err(), "{hidden}");
            assert_eq!(whole.to_rel(hidden), None, "{hidden}");
            assert!(!whole.in_root(hidden), "{hidden}");
        }
        assert!(whole.to_full("../x.md").is_err());
        // A folder inside the folder: its own paths, not its sibling's.
        let sub = public("Mesa", None);
        assert_eq!(sub.to_full("Notas.md").unwrap(), "Mesa/Notas.md");
        assert_eq!(sub.to_rel("Mesa2/x.md"), None);
        // One note: the paths it was given, and no other, until it is
        // given more.
        let only = Only::default();
        only.set(["Mesa/Notas.md".to_owned()]);
        let one = public("", Some(only.clone()));
        assert!(one.to_full("Mesa/Notas.md").is_ok());
        assert!(one.to_full("Mesa/Outra.md").is_err());
        assert_eq!(one.to_rel("Mesa/Outra.md"), None);
        only.set(["Mesa/Notas.md".to_owned(), "Anexos/q.png".to_owned()]);
        assert!(one.to_full("Anexos/q.png").is_ok());
        assert_eq!(one.to_rel("Anexos/q.png").as_deref(), Some("Anexos/q.png"));
        // The quota's events are the owner's: a visitor hears none.
        assert!(
            one.push(&json!({ "event": "folder-quota", "payload": {} }))
                .is_none()
        );
        assert!(
            scope()
                .push(&json!({ "event": "folder-quota", "payload": {} }))
                .is_some()
        );
    }
}
