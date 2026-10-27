// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board's card paths at a share's boundary (ADR 0081 item 2 and 11).
//!
//! A card of a board (JSON Canvas, ADR 0057) names its note by `file`, a
//! path from the root of the *owner's* folder, matched exactly. A window
//! that opened a share sees the share as a folder of its own, and every
//! path crossing the contract is relative to it (`scope.rs`): the paths
//! inside a board's content cross the same boundary, the same way.
//!
//! - **Out**: a card of a file under the share has its path re-rooted at
//!   the share. A card of a file that is not under it becomes the locked
//!   card every veiled card has — no path, no name — so that nothing
//!   beside or above the share is said.
//! - **In**: a card's path from the window is joined to the share's, by the
//!   same rule as every other path (`Scope::to_full`: no `..`, nothing
//!   absolute), so it can only name something in the share. The cards the
//!   window was shown locked are not the window's to change: they are the
//!   file's, as they are.
//!
//! The text of a board is rewritten only where a `file` string is: every
//! other byte is kept (invariant 7), and the revision of a file is that of
//! its bytes on disk, never of what the window was shown.

use serde_json::{Value, json};
use verso_contract::ContractError;
use verso_core::canvas::{Canvas, Json};

use crate::scope::Scope;

/// The path of the file a card of an element names, if it names one.
fn element_file(v: &mut Value) -> Option<&mut Value> {
    v.get_mut("customData")?
        .get_mut("canvas")?
        .get_mut("file")
        .filter(|f| f.is_string())
}

/// An element of a board room (`customData.canvas.file` in the owner's
/// folder) as a window of `scope` is told it. `None` when its file is not
/// in the share: the element is not told at all (the projection has made a
/// locked card of it already; this is the net).
#[must_use]
pub fn element_out(scope: &Scope, json: &str) -> Option<String> {
    let Ok(mut v) = serde_json::from_str::<Value>(json) else {
        return Some(json.to_owned());
    };
    let Some(slot) = element_file(&mut v) else {
        return Some(json.to_owned());
    };
    let rel = scope.to_rel(slot.as_str()?)?;
    *slot = Value::String(rel);
    Some(v.to_string())
}

/// An element a window of `scope` made, as the room holds it: its card's
/// path joined to the share's.
pub fn element_in(scope: &Scope, json: &str) -> Result<String, ContractError> {
    let Ok(mut v) = serde_json::from_str::<Value>(json) else {
        return Ok(json.to_owned());
    };
    let Some(slot) = element_file(&mut v) else {
        return Ok(json.to_owned());
    };
    let full = scope.to_full(slot.as_str().unwrap_or_default())?;
    *slot = Value::String(full);
    Ok(v.to_string())
}

/// The locked text card standing for `node`, a card of a file outside the
/// share: its id, place and size, the words, nothing else.
fn locked(node: &Value, words: &str) -> Value {
    json!({
        "id": node["id"], "type": "text",
        "x": node["x"], "y": node["y"], "width": node["width"], "height": node["height"],
        "text": words, "verso": { "locked": true },
    })
}

/// The `file` of `node`, if it is a string.
fn file_of(node: &Value) -> Option<&str> {
    node.get("file").and_then(Value::as_str)
}

/// A board file's canvas, as a window of `scope` is told it: `canvas` (a
/// parsed board whose cards name files of the owner's folder) re-rooted.
pub fn canvas_out(scope: &Scope, canvas: &mut Value, words: &str) {
    let Some(nodes) = canvas.get_mut("nodes").and_then(Value::as_array_mut) else {
        return;
    };
    for n in nodes {
        let Some(file) = file_of(n) else { continue };
        match scope.to_rel(file) {
            Some(rel) => n["file"] = Value::String(rel),
            None => *n = locked(n, words),
        }
    }
}

/// A board file's canvas a window of `scope` made, for the owner's folder.
pub fn canvas_in(scope: &Scope, canvas: &mut Value) -> Result<(), ContractError> {
    let Some(nodes) = canvas.get_mut("nodes").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    for n in nodes {
        if let Some(rel) = file_of(n) {
            n["file"] = Value::String(scope.to_full(rel)?);
        }
    }
    Ok(())
}

/// The byte range of the string token that opens at `at` in `text`.
fn token(text: &str, at: usize) -> Option<std::ops::Range<usize>> {
    let bytes = text.as_bytes();
    if bytes.get(at) != Some(&b'"') {
        return None;
    }
    let mut i = at + 1;
    while let Some(&b) = bytes.get(i) {
        match b {
            b'\\' => i += 2,
            b'"' => return Some(at..i + 1),
            _ => i += 1,
        }
    }
    None
}

/// The `file` strings of the nodes of `board`, with where each is written.
fn file_tokens(text: &str, board: &Canvas) -> Vec<(std::ops::Range<usize>, String)> {
    board
        .nodes()
        .iter()
        .filter_map(|n| match n.get("file") {
            Some(Json::String(s)) => Some((token(text, s.at?)?, s.value.clone())),
            _ => None,
        })
        .collect()
}

/// `text` with the `file` of each node replaced by `swap` of it, every other
/// byte as it was. `None` when a node's string cannot be found where the
/// parse said it was.
fn spliced(
    text: &str,
    board: &Canvas,
    swap: &mut dyn FnMut(&str) -> Result<String, ContractError>,
) -> Result<Option<String>, ContractError> {
    let mut found = file_tokens(text, board);
    // As many as the nodes that have one: otherwise the position of one is
    // not known, and the caller lays the whole tree over instead.
    let wanted = board
        .nodes()
        .iter()
        .filter(|n| matches!(n.get("file"), Some(Json::String(_))))
        .count();
    if found.len() != wanted {
        return Ok(None);
    }
    found.sort_by_key(|(r, _)| std::cmp::Reverse(r.start));
    let mut out = text.to_owned();
    for (range, was) in found {
        let now = swap(&was)?;
        if now != was {
            let quoted = serde_json::to_string(&now).unwrap_or_else(|_| "\"\"".to_owned());
            out.replace_range(range, &quoted);
        }
    }
    Ok(Some(out))
}

/// `value` laid over `text`'s own layout: every token that did not change
/// kept (the way `board_sight::shaped_text` does).
fn laid(text: &str, value: &Value) -> Option<String> {
    let board = Canvas::parse(text).ok()?;
    let new = Canvas::parse(&value.to_string()).ok()?;
    Some(board.merged(new.root).write())
}

/// Whether a node of `board` writes `file` twice: readers differ on which
/// counts, so the splice does not guess.
fn duplicate_file(board: &Canvas) -> bool {
    board.nodes().iter().any(|n| match n {
        Json::Object(e) => e.iter().filter(|(k, _)| k == "file").count() > 1,
        _ => false,
    })
}

/// The `file` strings of the cards of a board file's text.
#[must_use]
pub fn card_files(text: &str) -> std::collections::BTreeSet<String> {
    let mut out = std::collections::BTreeSet::new();
    if let Ok(v) = serde_json::from_str::<Value>(text) {
        for n in v["nodes"].as_array().into_iter().flatten() {
            if let Some(f) = file_of(n) {
                out.insert(f.to_owned());
            }
        }
    }
    if let Ok(board) = Canvas::parse(text) {
        for n in board.nodes() {
            if let Json::Object(e) = n {
                for (k, v) in e {
                    if k == "file"
                        && let Some(f) = v.as_str()
                    {
                        out.insert(f.to_owned());
                    }
                }
            }
        }
    }
    out
}

/// The text of a board file as a window of `scope` is told it. Not a board
/// (not JSON): served as it is — it names no card.
#[must_use]
pub fn text_out(scope: &Scope, text: &str, words: &str) -> String {
    let Ok(board) = Canvas::parse(text) else {
        return text.to_owned();
    };
    let nodes: Vec<&str> = board
        .nodes()
        .iter()
        .filter_map(|n| n.get("file").and_then(Json::as_str))
        .collect();
    if nodes.is_empty() {
        return text.to_owned();
    }
    if !duplicate_file(&board) && nodes.iter().all(|f| scope.to_rel(f).is_some()) {
        let mut swap = |f: &str| Ok(scope.to_rel(f).unwrap_or_default());
        if let Ok(Some(done)) = spliced(text, &board, &mut swap) {
            return done;
        }
    }
    let Ok(mut value) = serde_json::from_str::<Value>(text) else {
        return String::new();
    };
    canvas_out(scope, &mut value, words);
    // A board that cannot be laid is not served: fails closed.
    laid(text, &value).unwrap_or_default()
}

/// The text of a board file a window of `scope` made (`theirs`), for the
/// owner's folder, over the file as it is on disk (`disk`): the cards'
/// paths joined to the share's, and the cards the window was shown locked
/// (a file outside the share) as the file has them. A text that is not a
/// board is kept as it is.
pub fn text_in(scope: &Scope, disk: Option<&str>, theirs: &str) -> Result<String, ContractError> {
    let Ok(board) = Canvas::parse(theirs) else {
        return Ok(theirs.to_owned());
    };
    if duplicate_file(&board) {
        return Err(verso_service::refused("a card names its file once"));
    }
    let outside: Vec<Value> = disk
        .and_then(|d| serde_json::from_str::<Value>(d).ok())
        .and_then(|d| d.get("nodes").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|n| file_of(n).is_some_and(|f| scope.to_rel(f).is_none()))
        .collect();
    // Cards put back are matched by id: ones that cannot be told apart (an
    // id twice, or none) could be replaced by what the window holds, and
    // the file would lose them. Never written.
    if !outside.is_empty() && !ids_tell_apart(disk, &outside) {
        return Err(verso_service::refused(
            "this board has cards that cannot be told apart (an id used twice or missing): edit it in the folder",
        ));
    }
    let has_files = board
        .nodes()
        .iter()
        .any(|n| matches!(n.get("file"), Some(Json::String(_))));
    if outside.is_empty() {
        if !has_files {
            return Ok(theirs.to_owned());
        }
        let mut swap = |f: &str| scope.to_full(f);
        if let Some(done) = spliced(theirs, &board, &mut swap)? {
            return Ok(done);
        }
    }
    let mut value: Value =
        serde_json::from_str(theirs).map_err(|_| verso_service::refused("not a board"))?;
    canvas_in(scope, &mut value)?;
    lay_back(&mut value, &outside);
    laid(theirs, &value).ok_or_else(|| verso_service::refused("not a board"))
}

/// Whether every card of `outside` has an id no other node of `disk` has.
fn ids_tell_apart(disk: Option<&str>, outside: &[Value]) -> bool {
    let all: Vec<Value> = disk
        .and_then(|d| serde_json::from_str::<Value>(d).ok())
        .and_then(|d| d.get("nodes").and_then(Value::as_array).cloned())
        .unwrap_or_default();
    outside.iter().all(|o| {
        o.get("id").and_then(Value::as_str).is_some_and(|id| {
            !id.is_empty() && all.iter().filter(|n| n.get("id") == o.get("id")).count() == 1
        })
    })
}

/// The cards of `outside` put back into `value`'s: where the window had its
/// locked card (same id), else at the end. Whatever the window made of one
/// of those ids is the file's to have.
fn lay_back(value: &mut Value, outside: &[Value]) {
    if outside.is_empty() {
        return;
    }
    if !value["nodes"].is_array() {
        value["nodes"] = json!([]);
    }
    let Some(nodes) = value["nodes"].as_array_mut() else {
        return;
    };
    for o in outside {
        let at = nodes.iter().position(|n| n.get("id") == o.get("id"));
        match at {
            Some(i) => nodes[i] = o.clone(),
            None => nodes.push(o.clone()),
        }
    }
}

/// Whether `path` names a board.
#[must_use]
pub fn is_board(path: &str) -> bool {
    path.rsplit_once('.')
        .is_some_and(|(_, e)| e.eq_ignore_ascii_case("canvas"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> Scope {
        Scope {
            share: "s1".into(),
            key: crate::scope::share_key("s1"),
            name: "Ruínas (Sérgio)".into(),
            root: "Ruínas de Valdor".into(),
            mount: None,
            guard: None,
        }
    }

    /// A board in Obsidian's layout, tabs and all.
    const DISK: &str = "{\n\t\"nodes\":[\n\t\t{\"id\":\"a\",\"type\":\"file\",\"file\":\"Ruínas de Valdor/Lugares/Taverna do Corvo.md\",\"x\":0,\"y\":0,\"width\":400,\"height\":300},\n\t\t{\"id\":\"b\",\"type\":\"file\",\"file\":\"Fora/Segredo \\\"x\\\".md\",\"x\":9,\"y\":9,\"width\":4,\"height\":4},\n\t\t{\"id\":\"t\",\"type\":\"text\",\"text\":\"oi\",\"x\":1,\"y\":1,\"width\":2,\"height\":2}\n\t],\n\t\"edges\":[]\n}";

    #[test]
    fn an_element_crosses_the_boundary_both_ways() {
        let s = scope();
        let held = r#"{"id":"c","customData":{"canvas":{"id":"c","type":"file","file":"Ruínas de Valdor/Lugares/X.md"}}}"#;
        let told = element_out(&s, held).unwrap();
        assert!(told.contains("\"Lugares/X.md\""), "{told}");
        assert!(!told.contains("Valdor"), "{told}");
        let back = element_in(&s, &told).unwrap();
        let v: Value = serde_json::from_str(&back).unwrap();
        assert_eq!(
            v["customData"]["canvas"]["file"],
            "Ruínas de Valdor/Lugares/X.md"
        );
        // An element of a file outside is not told at all; one with no file
        // is as it is.
        let outside = held.replace("Ruínas de Valdor/", "Fora/");
        assert!(element_out(&s, &outside).is_none());
        let drawn = r#"{"id":"d","type":"rectangle"}"#;
        assert_eq!(element_out(&s, drawn).as_deref(), Some(drawn));
        assert_eq!(element_in(&s, drawn).unwrap(), drawn);
        // A path from the window never leaves the share.
        for bad in ["../Fora/X.md", "/Fora/X.md", "a/../../X.md"] {
            let e = held.replace("Ruínas de Valdor/Lugares/X.md", bad);
            assert!(element_in(&s, &e).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_boards_text_is_re_rooted_and_nothing_else_changes() {
        let s = scope();
        // All the cards in the share: only the strings change.
        let inside = DISK.replace("Fora/Segredo \\\"x\\\".md", "Ruínas de Valdor/Ponte.md");
        let out = text_out(&s, &inside, "locked");
        assert_eq!(
            out,
            inside
                .replace("Ruínas de Valdor/Lugares", "Lugares")
                .replace("Ruínas de Valdor/Ponte", "Ponte")
        );
        let back = text_in(&s, Some(&inside), &out).unwrap();
        assert_eq!(back, inside, "a round trip is the file, byte for byte");
        // A text with no card is returned as it is, and so is one that is no
        // board.
        let plain = "{\"nodes\":[],\"edges\":[]}\n";
        assert_eq!(text_out(&s, plain, "l"), plain);
        assert_eq!(text_in(&s, None, plain).unwrap(), plain);
        assert_eq!(text_out(&s, "not json", "l"), "not json");
    }

    #[test]
    fn a_card_outside_the_share_is_locked_out_and_kept_in() {
        let s = scope();
        let out = text_out(&s, DISK, "LOCKED");
        for leak in ["Fora", "Segredo", "Valdor"] {
            assert!(!out.contains(leak), "{leak} in {out}");
        }
        assert!(out.contains("LOCKED") && out.contains("\"Lugares/Taverna do Corvo.md\""));
        // The window moves the locked card and adds one of its own; saving
        // gives the file's card back as it is, not the window's.
        let mut v: Value = serde_json::from_str(&out).unwrap();
        v["nodes"][1]["x"] = json!(500);
        v["nodes"][1]["text"] = json!("tomei");
        v["nodes"].as_array_mut().unwrap().push(
            json!({ "id": "n", "type": "file", "file": "Lugares/Ponte.md", "x": 1, "y": 1, "width": 1, "height": 1 }),
        );
        let saved = text_in(&s, Some(DISK), &v.to_string()).unwrap();
        let w: Value = serde_json::from_str(&saved).unwrap();
        let disk: Value = serde_json::from_str(DISK).unwrap();
        assert_eq!(w["nodes"][1], disk["nodes"][1]);
        assert_eq!(w["nodes"][0], disk["nodes"][0]);
        assert_eq!(w["nodes"][3]["file"], "Ruínas de Valdor/Lugares/Ponte.md");
        // A window that dropped the locked card does not delete it.
        let mut v: Value = serde_json::from_str(&out).unwrap();
        v["nodes"].as_array_mut().unwrap().remove(1);
        let saved = text_in(&s, Some(DISK), &v.to_string()).unwrap();
        assert!(saved.contains("Fora/Segredo"), "{saved}");
    }
}
