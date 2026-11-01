// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a player of a table is served (ADR 0110 items 4, 7 and 18): the
//! reads of a folder with a table in it, filtered by the table's veil on
//! every path a player has. Three steps, in `folder_run`:
//!
//! 1. the path a command names is judged: a hidden note answers as a note
//!    that does not exist does, never "hidden" (an answer that told them
//!    apart would tell a player which names exist);
//! 2. a command that reads a note's text answers from the text as the
//!    veil leaves it ([`crate::campaign_text`]: links to hidden notes
//!    drawn as text with a lock) — `read_note`, `read_text`,
//!    `read_file_text`; the rest answer as every reader's do
//!    (`verso_service::reader`);
//! 3. every list is filtered: a path the veil hides is not in it, and what
//!    the list says of a path that stays (a search excerpt, a link's
//!    target, a mention's words) is read again from the veiled text.
//!
//! A player who may edit a note (a grant) reads it whole, as a writer
//! does (ADR 0087 item 5): an edit of the text it was served would write
//! the lock marks into the game master's note.

use std::collections::HashSet;

use serde_json::{Value, json};
use verso_contract::{ContractError, ErrorKind};
use verso_core::Workspace;
use verso_service::{OpError, Service};

use crate::campaign::{Player, Veil, key, note_like};
use crate::campaign_text::{self, Fate, REDACTED};

/// What a hidden note answers: what a note that does not exist does.
fn absent() -> ContractError {
    ContractError {
        kind: ErrorKind::NotFound,
        message: "not found".to_owned(),
    }
}

fn is_board(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".canvas")
}

fn is_note(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".md")
}

/// The attachments the released notes and boards of the tables link or
/// embed: made once per veil, from the folder as it is.
pub fn opened<'v>(ws: &mut Workspace, veil: &'v Veil) -> &'v HashSet<String> {
    veil.files_with(|| {
        let mut out = HashSet::new();
        let released: Vec<String> = all_files(ws)
            .into_iter()
            .filter(|p| note_like(p) && veil.in_table(p) && !veil.hides_note(p))
            .collect();
        for path in released {
            let reached = veil.opens_of(&path, || opens_of_file(ws, &path));
            out.extend(reached.iter().cloned());
        }
        out
    })
}

/// The attachments the note or board at `path` links or embeds, by key.
fn opens_of_file(ws: &mut Workspace, path: &str) -> HashSet<String> {
    let Ok(bytes) = ws.read_file(path) else {
        return HashSet::new();
    };
    if bytes.len() > 4 * 1024 * 1024 {
        return HashSet::new();
    }
    let text = String::from_utf8_lossy(&bytes).into_owned();
    let mut reached: Vec<String> = Vec::new();
    if is_board(path) {
        for (file, words) in board_refs(&text) {
            if let Some(f) = file
                && let Some(r) = ws.reached_exact(&f)
            {
                reached.push(r);
            }
            for t in campaign_text::targets(&words) {
                reached.extend(ws.reached_path(path, &t));
            }
        }
    } else if is_note(path) {
        for t in campaign_text::targets(&text) {
            reached.extend(ws.reached_path(path, &t));
        }
    }
    reached
        .into_iter()
        .filter(|r| !note_like(r))
        .map(|r| key(&r))
        .collect()
}

/// Every file of the folder (not a folder), as the index and the last walk
/// know them: the walk alone is stale until the watcher catches up.
pub(crate) fn all_files(ws: &Workspace) -> Vec<String> {
    let mut all: Vec<String> = ws.notes().unwrap_or_default();
    all.extend(ws.files());
    all.extend(
        ws.entries()
            .iter()
            .filter(|e| e.kind != verso_core::FileKind::Folder)
            .map(|e| e.path.clone()),
    );
    all.sort();
    all.dedup();
    all
}

/// A board's nodes: the `file` of each file node, and the text of each
/// text node.
fn board_refs(json: &str) -> Vec<(Option<String>, String)> {
    let Ok(v) = serde_json::from_str::<Value>(json) else {
        return Vec::new();
    };
    v["nodes"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|n| {
            (
                n["file"].as_str().map(str::to_owned),
                n["text"].as_str().unwrap_or_default().to_owned(),
            )
        })
        .collect()
}

/// Whether the player is kept from `path` (a file; `files` the attachments
/// opened).
fn hidden(veil: &Veil, files: &HashSet<String>, path: &str) -> bool {
    veil.hides(path, &|| files.contains(&key(path)))
}

/// The visible folders: the table's own, and every folder with a visible
/// file under it; outside the tables all.
fn shown_folders(ws: &Workspace, veil: &Veil, files: &HashSet<String>) -> HashSet<String> {
    let mut out = HashSet::new();
    for path in all_files(ws) {
        if hidden(veil, files, &path) {
            continue;
        }
        let mut parts: Vec<&str> = path.split('/').collect();
        parts.pop();
        while !parts.is_empty() {
            out.insert(key(&parts.join("/")));
            parts.pop();
        }
    }
    out
}

fn folder_shown(veil: &Veil, shown: &HashSet<String>, folder: &str) -> bool {
    if folder.is_empty() || !veil.in_table(folder) {
        return true;
    }
    veil.table(folder)
        .is_some_and(|t| key(&t.root) == key(folder))
        || shown.contains(&key(folder))
}

/// What a link written in `source` is, to a player.
fn fate(ws: &Workspace, veil: &Veil, files: &HashSet<String>, source: &str, target: &str) -> Fate {
    let Some(reached) = ws.reached_path(source, target) else {
        return Fate::Open;
    };
    if !hidden(veil, files, &reached) {
        return Fate::Open;
    }
    if veil.secret_name(&reached) {
        Fate::SecretName
    } else {
        Fate::Locked
    }
}

/// `text`, the text of the note at `source`, as the veil leaves it.
pub fn veil_text(
    ws: &Workspace,
    veil: &Veil,
    files: &HashSet<String>,
    source: &str,
    text: &str,
) -> String {
    if is_board(source) {
        return veil_board(ws, veil, files, source, text);
    }
    campaign_text::veil(text, &|t| fate(ws, veil, files, source, t), &veil.lang)
}

/// A board as the veil leaves it: a card of a hidden note is a locked
/// text card in its place (ADR 0110 item 4), the text cards as notes.
fn veil_board(
    ws: &Workspace,
    veil: &Veil,
    files: &HashSet<String>,
    source: &str,
    json: &str,
) -> String {
    let Ok(mut v) = serde_json::from_str::<Value>(json) else {
        return json.to_owned();
    };
    let lang = &veil.lang;
    if let Some(nodes) = v["nodes"].as_array_mut() {
        for n in nodes {
            if let Some(file) = n["file"].as_str().map(str::to_owned) {
                // A file that is not there is locked like a hidden one.
                let reached = ws.reached_exact(&file);
                if reached.as_ref().is_none_or(|r| hidden(veil, files, r)) {
                    let text = campaign_text::locked_card(lang);
                    let (id, x, y, w, h) = (
                        n["id"].clone(),
                        n["x"].clone(),
                        n["y"].clone(),
                        n["width"].clone(),
                        n["height"].clone(),
                    );
                    *n = json!({ "id": id, "type": "text", "x": x, "y": y, "width": w, "height": h, "text": text });
                    continue;
                }
            }
            if let Some(t) = n["text"].as_str() {
                let veiled = campaign_text::veil(t, &|x| fate(ws, veil, files, source, x), lang);
                n["text"] = Value::String(veiled);
            }
        }
    }
    serde_json::to_string(&v).unwrap_or_else(|_| json.to_owned())
}

/// The fields of a command's arguments that name a path to read.
fn path_fields(name: &str) -> &'static [&'static str] {
    match name {
        "read_note" | "links" | "backlinks" | "read_file_text" | "read_text" | "board_preview"
        | "unlinked_mentions" | "map_open" | "map_tile" => &["path"],
        "resolve_attachment" => &["source"],
        _ => &[],
    }
}

/// What is added to a hidden note's path to ask for one that is not there.
const ABSENT: &str = ".verso-absent.md";

enum Verdict {
    /// The path named is hidden: answer as for an absent one.
    Hidden,
    /// A note the player may edit: read whole.
    Edits,
    /// A board the player may edit: read as the room is told them — the text
    /// cards whole, the card of a file they do not see locked, no secret pin
    /// (ADR 0113 H).
    Board,
    Fine,
}

fn judge(ws: &mut Workspace, p: &Player, name: &str, args: &Value) -> Verdict {
    let mut named: Vec<String> = path_fields(name)
        .iter()
        .filter_map(|f| args[*f].as_str().map(str::to_owned))
        .collect();
    if name == "query_base" {
        for f in ["path", "this"] {
            if let Some(x) = args["query"][f].as_str() {
                named.push(x.to_owned());
            }
        }
    }
    let mut edits = false;
    let mut board = false;
    for given in named {
        for path in [given.clone(), ws.confined(&given).unwrap_or(given)] {
            if !p.veil.in_table(&path) {
                // Outside a table whoever edits reads whole, as a writer does.
                edits |= p.sees_secrets(&path);
                continue;
            }
            if note_like(&path) {
                if p.edits(&path) {
                    if is_board(&path) {
                        board = true;
                    } else {
                        edits = true;
                    }
                } else if p.veil.hides_note(&path) {
                    return Verdict::Hidden;
                }
            } else {
                let files = opened(ws, &p.veil);
                if hidden(&p.veil, files, &path) {
                    return Verdict::Hidden;
                }
            }
        }
    }
    if board {
        Verdict::Board
    } else if edits {
        Verdict::Edits
    } else {
        Verdict::Fine
    }
}

/// A command a player calls, answered; `None` when a reader may not call
/// it (the caller refuses).
pub fn answer(
    service: &Service,
    client: &str,
    p: &Player,
    name: &str,
    args: Value,
) -> Option<Result<Value, ContractError>> {
    verso_service::reader::for_reader(name)?;
    Some(run(service, client, p, name, args))
}

fn run(
    service: &Service,
    client: &str,
    p: &Player,
    name: &str,
    args: Value,
) -> Result<Value, ContractError> {
    let verdict = service.with(client, |ws| Ok(judge(ws, p, name, &args)))?;
    match verdict {
        Verdict::Hidden => {
            // As a note that does not exist answers: the command run on
            // a path that is not there, its message without our suffix.
            let mut args = args;
            for f in path_fields(name) {
                if let Some(path) = args[*f].as_str() {
                    args[*f] = Value::String(format!("{path}{ABSENT}"));
                }
            }
            if name == "query_base" || path_fields(name).is_empty() {
                return Err(absent());
            }
            return service
                .dispatch_reader(client, name, args)
                .unwrap_or_else(|| Err(absent()))
                .map_err(|mut e| {
                    e.message = e.message.replace(ABSENT, "");
                    e
                });
        }
        // Whole, as a writer reads it.
        Verdict::Edits if matches!(name, "read_note" | "read_text" | "read_file_text") => {
            return service
                .dispatch(client, name, args)
                .unwrap_or_else(|| Err(absent()));
        }
        Verdict::Board if matches!(name, "read_text" | "read_file_text") => {
            return service.with(client, |ws| read_board_edited(ws, p, name, &args));
        }
        Verdict::Edits | Verdict::Board | Verdict::Fine => {}
    }
    match name {
        "read_note" | "read_text" | "read_file_text" => {
            service.with(client, |ws| read_veiled(ws, p, name, &args))
        }
        "get_focuses" => {
            // The focuses' paths are the game master's.
            serde_json::to_value(verso_contract::FocusesSummary {
                focuses: Vec::new(),
                has_file: false,
                format_known: true,
                read_only_reason: None,
                read_only_code: None,
                stamp: None,
            })
            .map_err(|e| verso_service::failed(e.to_string()))
        }
        _ => {
            let answered = service
                .dispatch_reader(client, name, args.clone())
                .unwrap_or_else(|| Err(absent()))?;
            service.with(client, |ws| Ok(filter(ws, p, name, &args, answered)))
        }
    }
}

/// A board the player edits, read: what the room is told them
/// (`board_sight::shaped_text`), in the file's own layout.
fn read_board_edited(
    ws: &mut Workspace,
    p: &Player,
    name: &str,
    args: &Value,
) -> Result<Value, OpError> {
    let path = args["path"].as_str().unwrap_or_default().to_owned();
    let to = |v: Result<Value, serde_json::Error>| {
        v.map_err(|e| OpError::Contract(verso_service::failed(e.to_string())))
    };
    if name == "read_text" {
        let mut file = ws.read_text(&path)?;
        let locks = crate::collab::players::Locks::new(ws, &p.veil);
        file.text = crate::board_sight::shaped_text(&file.text, &|f| locks.text(f));
        file.revision = crate::board_sight::revision_of(&file.text);
        return to(serde_json::to_value(verso_service::convert::text_out(file)));
    }
    let bytes = ws.read_file(&path)?;
    let locks = crate::collab::players::Locks::new(ws, &p.veil);
    Ok(Value::String(crate::board_sight::shaped_text(
        &String::from_utf8_lossy(&bytes),
        &|f| locks.text(f),
    )))
}

fn read_veiled(ws: &mut Workspace, p: &Player, name: &str, args: &Value) -> Result<Value, OpError> {
    let path = args["path"].as_str().unwrap_or_default().to_owned();
    let veil = &p.veil;
    let served = |ws: &mut Workspace, path: &str, text: &str| -> Option<String> {
        let _ = opened(ws, veil);
        let files = opened(ws, veil);
        let veiled = veil_text(ws, veil, files, path, text);
        (veiled != text).then_some(veiled)
    };
    let to = |v: Result<Value, serde_json::Error>| {
        v.map_err(|e| OpError::Contract(verso_service::failed(e.to_string())))
    };
    match name {
        "read_note" => {
            let note = ws.reader_read_note(&path)?;
            let note = match served(ws, &note.path, &note.text) {
                Some(shown) => ws.note_as_veiled(note, shown)?,
                None => note,
            };
            let mut v = to(serde_json::to_value(verso_service::convert::note_out(note)))?;
            // A type whose schema is a hidden note names it.
            let files = opened(ws, veil);
            if let Some(state) = v["note_type"]["state"].as_object() {
                let mut paths: Vec<&str> = state
                    .get("schemas")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .collect();
                paths.extend(state.get("schema").and_then(Value::as_str));
                if paths.iter().any(|s| hidden(veil, files, s)) {
                    v["note_type"] = Value::Null;
                }
            }
            Ok(v)
        }
        "read_text" => {
            let mut file = ws.reader_read_text(&path)?;
            if let Some(shown) = served(ws, &file.path, &file.text) {
                file.text = shown;
            }
            to(serde_json::to_value(verso_service::convert::text_out(file)))
        }
        _ => {
            let bytes = ws.reader_read_file(&path)?;
            let mut text = String::from_utf8_lossy(&bytes).into_owned();
            if (is_note(&path) || is_board(&path))
                && let Some(shown) = served(ws, &path, &text)
            {
                text = shown;
            }
            Ok(Value::String(text))
        }
    }
}

/// The paths of a list, `field` of each, kept when visible.
fn keep(v: &mut Value, keep: &dyn Fn(&str) -> bool, field: Option<&str>) {
    let Some(list) = v.as_array_mut() else {
        return;
    };
    list.retain(|item| {
        let path = match field {
            Some(f) => item[f].as_str(),
            None => item.as_str(),
        };
        path.is_some_and(keep)
    });
}

/// A list answered, filtered to what the player may see.
fn filter(ws: &mut Workspace, p: &Player, name: &str, args: &Value, mut v: Value) -> Value {
    let veil = &p.veil;
    let _ = opened(ws, veil);
    let files = opened(ws, veil);
    let shown = shown_folders(ws, veil, files);
    let visible = |path: &str| !hidden(veil, files, path);
    match name {
        "list_notes" | "list_files" | "notes_of_type" => keep(&mut v, &visible, None),
        "list_folders" => keep(
            &mut v,
            &|f| f.is_empty() || folder_shown(veil, &shown, f),
            None,
        ),
        "list_entries" => {
            if let Some(list) = v.as_array_mut() {
                list.retain(|e| {
                    let Some(path) = e["path"].as_str() else {
                        return false;
                    };
                    if e["kind"]
                        .as_str()
                        .is_some_and(|k| k.eq_ignore_ascii_case("folder"))
                    {
                        path.is_empty() || folder_shown(veil, &shown, path)
                    } else {
                        visible(path)
                    }
                });
            }
        }
        "list_web_notes" => keep(&mut v, &visible, Some("path")),
        "list_block_ids" => keep(&mut v["blocks"], &visible, Some("path")),
        "backlinks" => keep(&mut v, &visible, Some("from")),
        "graph_unresolved" => keep(&mut v, &visible, Some("from")),
        "unlinked_mentions" => {
            keep(&mut v["mentions"], &visible, Some("path"));
            // The words around a mention may hold a link cut in half.
            for m in v["mentions"].as_array_mut().into_iter().flatten() {
                for f in ["before", "after", "text"] {
                    let cut = m[f]
                        .as_str()
                        .is_some_and(|s| s.contains("[[") || s.contains("]]") || s.contains("]("));
                    if cut {
                        m[f] = Value::String(String::new());
                    }
                }
            }
        }
        "graph" => {
            if let Some(list) = v.as_array_mut() {
                list.retain(|e| {
                    e["from"].as_str().is_some_and(&visible)
                        && e["to"].as_str().is_some_and(&visible)
                });
            }
        }
        "list_tags" => {
            if let Some(list) = v.as_array_mut() {
                list.retain_mut(|t| {
                    keep(&mut t["notes"], &visible, None);
                    t["notes"].as_array().is_some_and(|n| !n.is_empty())
                });
            }
        }
        "search" => search(ws, p, files, args, &mut v),
        "links" => {
            let source = args["path"].as_str().unwrap_or_default().to_owned();
            if let Some(list) = v.as_array_mut() {
                for l in list {
                    // A note's link is resolved by the index; an attachment's
                    // (a picture, a sound file) is not, and is reached here as
                    // the veil of the text reaches it (`fate`), so its name
                    // never passes when the player does not see it.
                    let res = match l["resolved"].as_str() {
                        Some(r) => r.to_owned(),
                        None => match l["target"]
                            .as_str()
                            .and_then(|t| ws.reached_path(&source, t))
                        {
                            Some(r) => r,
                            None => continue,
                        },
                    };
                    if !hidden(veil, files, &res) {
                        continue;
                    }
                    let shown = if veil.secret_name(&res) {
                        REDACTED.to_owned()
                    } else if l["embed"] == true {
                        campaign_text::placeholder(&veil.lang)
                    } else {
                        l["alias"]
                            .as_str()
                            .map(str::to_owned)
                            .filter(|a| !a.trim().is_empty())
                            .unwrap_or_else(|| {
                                let t = l["target"].as_str().unwrap_or_default();
                                t.rsplit('/')
                                    .next()
                                    .unwrap_or(t)
                                    .trim_end_matches(".md")
                                    .to_owned()
                            })
                    };
                    l["target"] = Value::String(shown);
                    l["resolved"] = Value::Null;
                    l["heading"] = Value::Null;
                    l["block"] = Value::Null;
                    l["alias"] = Value::Null;
                }
            }
        }
        "resolve_attachment" => {
            if v.as_str().is_some_and(|r| !visible(r)) {
                v = Value::Null;
            }
        }
        "query_base" => base(veil, files, &mut v),
        "folder_space" => v = space(ws, veil, files),
        "board_preview" | "read_file_text" | "read_note" | "read_text" => {}
        _ => {}
    }
    v
}

/// The space the player's files take: never the hidden ones'.
fn space(ws: &Workspace, veil: &Veil, files: &HashSet<String>) -> Value {
    let (mut notes, mut attachments, mut count) = (0.0_f64, 0.0_f64, 0_u32);
    let sizes: std::collections::HashMap<&str, (u64, bool)> = ws
        .entries()
        .iter()
        .map(|e| {
            (
                e.path.as_str(),
                (e.len, e.kind == verso_core::FileKind::Note),
            )
        })
        .collect();
    for path in all_files(ws) {
        if hidden(veil, files, &path) {
            continue;
        }
        let (len, is_note) = sizes
            .get(path.as_str())
            .copied()
            .unwrap_or((0, is_note(&path)));
        if is_note {
            notes += len as f64;
        } else {
            attachments += len as f64;
        }
        count = count.saturating_add(1);
    }
    json!({ "total": notes + attachments, "notes": notes, "attachments": attachments, "files": count, "index": 0.0 })
}

/// A search answered: the hits of hidden paths gone, the excerpt of each
/// other cut again from the veiled text, and a hit whose words are no
/// longer there (they were inside a link now drawn as text) dropped.
fn search(ws: &mut Workspace, p: &Player, files: &HashSet<String>, args: &Value, v: &mut Value) {
    let words: Vec<String> = args["words"]
        .as_str()
        .unwrap_or_default()
        .split_whitespace()
        .map(|w| {
            w.trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase()
        })
        .filter(|w| !w.is_empty() && !matches!(w.as_str(), "and" | "or" | "not" | "near"))
        .collect();
    let Some(list) = v.as_array_mut() else {
        return;
    };
    let veil = &p.veil;
    let mut kept = Vec::new();
    for hit in std::mem::take(list) {
        let Some(path) = hit["path"].as_str().map(str::to_owned) else {
            continue;
        };
        if hidden(veil, files, &path) {
            continue;
        }
        if !veil.in_table(&path) || !(is_note(&path) || is_board(&path)) {
            kept.push(hit);
            continue;
        }
        let Ok(file) = ws.reader_read_text(&path) else {
            continue;
        };
        let text = veil_text(ws, veil, files, &path, &file.text);
        let lower = text.to_lowercase();
        let at = words
            .iter()
            .filter_map(|w| lower.find(w.as_str()).map(|i| (i, w.len())))
            .min();
        let name_hit = hit["snippet"].as_str().is_some_and(str::is_empty);
        let Some((i, n)) = at else {
            // A hit by the note's name, or by words the veil took out.
            if name_hit {
                kept.push(hit);
            }
            continue;
        };
        let mut h = hit;
        if !name_hit {
            h["snippet"] = Value::String(excerpt(&text, i, n));
        }
        kept.push(h);
    }
    *list = kept;
}

/// About 60 characters either side of the match at `i..i+n`, the match
/// in brackets, on one line.
fn excerpt(text: &str, i: usize, n: usize) -> String {
    let lower_len = text.to_lowercase().len();
    // The text lowercased may differ in length from the text for some
    // scripts: fall back to the start then.
    if lower_len != text.len() || !text.is_char_boundary(i) || !text.is_char_boundary(i + n) {
        return text
            .chars()
            .take(100)
            .collect::<String>()
            .replace('\n', " ");
    }
    let before: String = text[..i]
        .chars()
        .rev()
        .take(60)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let after: String = text[i + n..].chars().take(60).collect();
    format!("…{before}[{}]{after}…", &text[i..i + n]).replace(['\n', '\r'], " ")
}

/// A base's answer: the rows of hidden notes gone, the summaries of a
/// group that lost one unsaid, the links to hidden files empty.
fn base(veil: &Veil, files: &HashSet<String>, v: &mut Value) {
    let mut removed = 0_u64;
    let visible = |p: &str| !hidden(veil, files, p);
    if let Some(groups) = v["groups"].as_array_mut() {
        groups.retain_mut(|g| {
            let Some(rows) = g["rows"].as_array_mut() else {
                return true;
            };
            let before = rows.len();
            rows.retain(|r| r["path"].as_str().is_some_and(&visible));
            for r in rows.iter_mut() {
                for c in r["cells"].as_array_mut().into_iter().flatten() {
                    cell(veil, files, c);
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
                cell(veil, files, k);
            }
            before == 0 || !g["rows"].as_array().is_some_and(Vec::is_empty)
        });
    }
    let total = v["total"].as_u64().unwrap_or(0).saturating_sub(removed);
    v["total"] = json!(total);
}

fn cell(veil: &Veil, files: &HashSet<String>, c: &mut Value) {
    let visible = |p: &str| !hidden(veil, files, p);
    match c["kind"].as_str() {
        Some("link") => {
            if c["value"]["path"].as_str().is_some_and(|p| !visible(p)) {
                *c = json!({ "kind": "empty" });
            }
        }
        Some("file") | Some("image") => {
            if c["value"]
                .as_str()
                .is_some_and(|p| !p.contains("://") && !visible(p))
            {
                *c = json!({ "kind": "empty" });
            }
        }
        Some("list") => {
            for x in c["value"].as_array_mut().into_iter().flatten() {
                cell(veil, files, x);
            }
        }
        Some("object") => {
            for pair in c["value"].as_array_mut().into_iter().flatten() {
                if let Some(x) = pair.get_mut(1) {
                    cell(veil, files, x);
                }
            }
        }
        _ => {}
    }
}

/// Whether the player is kept from `path`, asked of the folder behind
/// `key_of_folder` (for the routes that are not commands). Fails closed:
/// a folder that cannot be asked hides the path.
pub fn is_hidden(
    server: &crate::state::Server,
    key_of_folder: &str,
    account: Option<&str>,
    path: &str,
) -> bool {
    let Some(veil) = crate::campaign::veil_for_key(server, key_of_folder) else {
        return false;
    };
    // Whose eyes: the account's, else the public's (fails closed).
    let veil = account.map_or(veil.clone(), |a| veil.view(a));
    let p = path.to_owned();
    server
        .service
        .with_key(key_of_folder, move |ws| Ok(is_hidden_in(ws, &veil, &p)))
        .unwrap_or(true)
}

/// Whether `path` is hidden from a player (the veil's own judgement,
/// with the attachments a released note opens).
pub fn is_hidden_in(ws: &mut Workspace, veil: &Veil, path: &str) -> bool {
    if !veil.in_table(path) {
        return false;
    }
    if note_like(path) {
        return veil.hides_note(path);
    }
    let files = opened(ws, veil);
    hidden(veil, files, path)
}

/// The text a reader's device is given for the file at `path`, when the
/// veil changes the `text` it would have been given: links to hidden
/// notes drawn as text. `None` when it is not changed (or the file is not
/// a note or a board).
pub fn device_text(ws: &mut Workspace, veil: &Veil, path: &str, text: &str) -> Option<String> {
    if !veil.in_table(path) || !(is_note(path) || is_board(path)) {
        return None;
    }
    let files = opened(ws, veil);
    let shown = veil_text(ws, veil, files, path, text);
    (shown != text).then_some(shown)
}

/// The bytes a reader's device is given of `path`: `bytes`, a reader's,
/// run through the veil. A hidden file is not served at all.
pub fn device_bytes(
    ws: &mut Workspace,
    veil: &Veil,
    path: &str,
    bytes: Vec<u8>,
) -> Result<Vec<u8>, OpError> {
    if is_hidden_in(ws, veil, path) {
        return Err(OpError::Contract(absent()));
    }
    if veil.serves_whole(path) {
        return Ok(ws.read_file(path)?);
    }
    let text = String::from_utf8_lossy(&bytes);
    Ok(match device_text(ws, veil, path, &text) {
        Some(shown) => shown.into_bytes(),
        None => bytes,
    })
}

/// A folder's event with the paths a player may not be told taken out of
/// it: a hidden note, and an attachment of a table (whose release depends
/// on the notes, which the event cannot judge: the player's list is read
/// again at `campaign-changed`).
pub fn event_paths(veil: &Veil, event: &mut Value) {
    let ok = |p: &str| !(veil.in_table(p) && (!note_like(p) || veil.hides_note(p)));
    for field in ["changed", "removed"] {
        if let Some(list) = event[field].as_array_mut() {
            list.retain(|p| p.as_str().is_some_and(ok));
        }
    }
    if let Some(list) = event["moved"].as_array_mut() {
        list.retain(|m| m["from"].as_str().is_some_and(ok) && m["to"].as_str().is_some_and(ok));
    }
}

/// The folder's summary (`info`, what `open_server_folder` and
/// `current_folder` answer) as a player of a table is told it: the notes
/// it can see, none of the walk's problems (they name paths), and no
/// placeholders. No-op for a window that is not a player.
pub fn tell_summary(server: &crate::state::Server, client: &str, info: &mut Value) {
    let reads = {
        let table = verso_service::lock(&server.clients);
        let Some(c) = table.get(client) else {
            return;
        };
        let Some((folder, _)) = c.folder.clone() else {
            return;
        };
        (folder, c.account.clone(), crate::access::asker_of(c))
    };
    let (folder, account, asker) = reads;
    if !crate::access::filtered(&asker, crate::access::has_table(server, &folder)) {
        return;
    }
    let Some(veil) = crate::campaign::veil_of(server, &folder).map(|v| v.view(&account)) else {
        return;
    };
    let scope = crate::shares::scope_here(server, client);
    let visible = server
        .service
        .with(client, |ws| {
            let files = opened(ws, &veil);
            Ok(ws
                .notes()
                .unwrap_or_default()
                .iter()
                .filter(|p| !hidden(&veil, files, p))
                .filter(|p| scope.as_ref().is_none_or(|s| s.to_rel(p).is_some()))
                .count())
        })
        .map_or(0, |n| u32::try_from(n).unwrap_or(u32::MAX));
    if info["index"].is_object() {
        info["index"]["unchanged"] = json!(visible);
        info["index"]["indexed"] = json!(0);
        info["index"]["removed"] = json!(0);
        info["index"]["placeholders"] = json!(0);
        info["index"]["problems"] = json!([]);
    }
}
