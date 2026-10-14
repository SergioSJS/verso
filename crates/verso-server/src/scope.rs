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
                return Ok(format!("{path}{}", &rel[name.len()..]));
            }
        }
        if rel.is_empty() {
            if how == Use::Below {
                return Err(refused("the shared folder itself is its owner's"));
            }
            return Ok(self.root.clone());
        }
        Ok(format!("{}/{rel}", self.root))
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
            return Some(full[self.root.len()..].trim_start_matches('/').to_owned());
        }
        if let Some((name, path)) = &self.mount
            && covers(path, full)
        {
            return Some(format!("{name}{}", &full[path.len()..]));
        }
        None
    }

    fn rel_value(&self, v: &Value) -> Option<Value> {
        v.as_str().and_then(|p| self.to_rel(p)).map(Value::String)
    }

    /// A message of the core said to the window: the owner's paths written
    /// as the window knows them.
    #[must_use]
    pub fn said(&self, message: &str) -> String {
        let mut out = message.replace(&format!("{}/", self.root), "");
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
        let (said, rest) = if let Some(rest) = w.strip_prefix(&format!("{}/", self.root)) {
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
            "list_notes" | "list_files" | "list_tags" | "list_web_notes" | "graph"
            | "list_folders" | "list_entries" | "notes_of_type" => {}
            "search" => args["limit"] = json!(200),
            "read_note" | "links" | "backlinks" | "read_file_text" | "read_text"
            | "board_preview" => set(&mut args, "path", Use::Read)?,
            "resolve_attachment" => set(&mut args, "source", Use::Read)?,
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
            "backlinks" => self.keep(&mut v, "from"),
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
    pub fn space(&self, ws: &verso_core::Workspace) -> verso_contract::FolderSpace {
        let mut space = verso_contract::FolderSpace {
            total: 0.0,
            notes: 0.0,
            attachments: 0.0,
            files: 0,
            index: 0.0,
        };
        for e in ws.entries() {
            if !covers(&self.root, &e.path) {
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
        roots.extend(self.mount.as_ref().map(|(_, path)| path.clone()));
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
            | "collab-closed" => {
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
            "folder-quota" => {}
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
        assert_eq!(
            s.push(&json!({ "event": "something-new", "payload": { "path": "x" } })),
            None
        );
        assert!(s.push(&json!({ "gone": "folder" })).is_some());
    }
}
