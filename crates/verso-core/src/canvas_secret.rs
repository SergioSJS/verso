// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Secret pins: ADR 0087's projection applied to a board (ADR 0090 item 5,
//! decided 2026-10-14). A node of a `.canvas` marked
//! `"verso": {"secret": true}` is hidden from whoever may only read the
//! board on a UniVerso: the reader is served the board **without** it — and
//! without the edges that touch it and the drawn elements that belong to
//! it — so that no byte of its id, its text, its file, its address or its
//! place ever reaches the reader. In Obsidian, and for whoever holds the
//! file, the node is an ordinary card.
//!
//! One pure function, [`project`]: text in, text out, no IO. It
//!
//! - leaves a board with no secret node **as it is, byte for byte**, so a
//!   reader's hash, size and time are the file's;
//! - leaves every other node, edge and drawn element exactly as read (the
//!   file is written back in Obsidian's layout with every token that did
//!   not change kept, `canvas.rs`);
//! - is idempotent: the projection of a projection is itself;
//! - **fails closed**: a board it cannot read as JSON that mentions a
//!   `secret` anywhere is served as an empty board, and a flag it does not
//!   understand (`"secret": "yes"`) counts as set.
//!
//! What is hidden along with a secret node, because it would place it:
//!
//! - the edges whose `fromNode` or `toNode` names it;
//! - the drawn elements (`verso.drawing`) that lie `under` it, that are
//!   bound to it (an arrow's `startBinding`/`endBinding`), that name it as
//!   their container or frame, that are bound text of one of these, or that
//!   carry a group shared **only** with secret nodes. A group that also
//!   holds a node that is not secret — the map a pin is grouped with
//!   (ADR 0090 item 3) — is the map's, not the pin's, and hides nothing.
//!
//! The index flags the same nodes (`index_split`) so that a reader's
//! search, backlinks and counts do not see a secret pin either.

use std::borrow::Cow;
use std::collections::BTreeSet;

use crate::canvas::{Canvas, Json};

/// The board a reader is served when the file cannot be read and may hold
/// a secret.
const EMPTY: &str = "{\"nodes\":[],\"edges\":[]}\n";

/// Whether `value` is a `verso` object that marks its owner secret: a
/// `secret` key holding anything but `false` or `null`.
fn flags_secret(verso: &Json) -> bool {
    match verso {
        Json::Object(entries) => entries
            .iter()
            .any(|(k, v)| k == "secret" && !matches!(v, Json::Bool(false) | Json::Null)),
        _ => false,
    }
}

/// Every value of `key` in the object `of`, a key written twice included
/// (`JSON.parse` keeps the last; a flag in the first is not trusted away).
fn all<'a>(of: &'a Json, key: &'a str) -> impl Iterator<Item = &'a Json> {
    let entries: &[(String, Json)] = match of {
        Json::Object(e) => e,
        _ => &[],
    };
    entries
        .iter()
        .filter(move |(k, _)| k == key)
        .map(|(_, v)| v)
}

/// Whether the node is marked secret.
#[must_use]
pub fn node_is_secret(node: &Json) -> bool {
    all(node, "verso").any(flags_secret)
}

fn id_of(node: &Json) -> Option<&str> {
    node.get("id").and_then(Json::as_str)
}

fn groups_of(item: &Json) -> Vec<&str> {
    let mut out = Vec::new();
    for verso in all(item, "verso") {
        for list in all(verso, "groups") {
            if let Json::Array(items) = list {
                out.extend(items.iter().filter_map(Json::as_str));
            }
        }
    }
    out
}

/// The nodes of every `nodes` array of the root (a key written twice
/// included).
fn nodes_of(root: &Json) -> Vec<&Json> {
    let mut out = Vec::new();
    for list in all(root, "nodes") {
        if let Json::Array(items) = list {
            out.extend(items.iter());
        }
    }
    out
}

/// What a canvas hides from a reader.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Hidden {
    /// The ids of the secret nodes.
    pub nodes: BTreeSet<String>,
    /// Whether some secret node has no id to name it by.
    pub anonymous: bool,
    /// The groups only secret nodes carry.
    pub groups: BTreeSet<String>,
}

impl Hidden {
    /// Whether nothing is hidden.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty() && !self.anonymous
    }
}

/// What the root of a canvas hides.
#[must_use]
pub fn hidden_of(root: &Json) -> Hidden {
    let nodes = nodes_of(root);
    let mut hidden = Hidden::default();
    let mut open: BTreeSet<&str> = BTreeSet::new();
    let mut shut: BTreeSet<&str> = BTreeSet::new();
    for node in &nodes {
        let secret = node_is_secret(node);
        if secret {
            match id_of(node) {
                Some(id) => {
                    hidden.nodes.insert(id.to_owned());
                }
                None => hidden.anonymous = true,
            }
        }
        for g in groups_of(node) {
            if secret {
                shut.insert(g);
            } else {
                open.insert(g);
            }
        }
    }
    hidden.groups = shut.difference(&open).map(|g| (*g).to_owned()).collect();
    hidden
}

/// Whether the drawn element is bound to a secret node, lies under one,
/// or shares a group only secret nodes hold.
fn drawn_is_hidden(element: &Json, hidden: &Hidden) -> bool {
    let named = |key: &str| {
        all(element, key)
            .filter_map(Json::as_str)
            .any(|id| hidden.nodes.contains(id))
    };
    if named("under") || named("containerId") || named("frameId") {
        return true;
    }
    for binding in ["startBinding", "endBinding"] {
        if all(element, binding).any(|b| {
            all(b, "elementId")
                .filter_map(Json::as_str)
                .any(|id| hidden.nodes.contains(id))
        }) {
            return true;
        }
    }
    all(element, "groupIds").any(|list| match list {
        Json::Array(items) => items
            .iter()
            .filter_map(Json::as_str)
            .any(|g| hidden.groups.contains(g)),
        _ => false,
    })
}

/// The drawn elements to hide: those [`drawn_is_hidden`] names, and — to a
/// fixed point — the bound text and members of what is hidden.
fn hidden_drawing(drawing: &[Json], hidden: &Hidden) -> Vec<bool> {
    let mut gone: Vec<bool> = drawing.iter().map(|e| drawn_is_hidden(e, hidden)).collect();
    loop {
        let ids: BTreeSet<&str> = drawing
            .iter()
            .zip(&gone)
            .filter(|(_, g)| **g)
            .filter_map(|(e, _)| id_of(e))
            .collect();
        let mut changed = false;
        for (i, e) in drawing.iter().enumerate() {
            if gone[i] {
                continue;
            }
            let by = |key: &str| {
                all(e, key)
                    .filter_map(Json::as_str)
                    .any(|id| ids.contains(id))
            };
            if by("containerId") || by("frameId") {
                gone[i] = true;
                changed = true;
            }
        }
        if !changed {
            return gone;
        }
    }
}

/// `root` without the secret nodes and what belongs to them.
fn project_root(root: &mut Json, hidden: &Hidden) {
    let Json::Object(entries) = root else {
        return;
    };
    for (key, value) in entries.iter_mut() {
        match (key.as_str(), value) {
            ("nodes", Json::Array(items)) => items.retain(|n| !node_is_secret(n)),
            ("edges", Json::Array(items)) => items.retain(|e| {
                let touches = |side: &str| {
                    all(e, side)
                        .filter_map(Json::as_str)
                        .any(|id| hidden.nodes.contains(id))
                };
                !(touches("fromNode") || touches("toNode"))
            }),
            ("verso", Json::Object(inner)) => {
                for (k, v) in inner.iter_mut() {
                    if k != "drawing" {
                        continue;
                    }
                    if let Json::Array(drawing) = v {
                        let gone = hidden_drawing(drawing, hidden);
                        let mut at = 0;
                        drawing.retain(|_| {
                            let keep = !gone[at];
                            at += 1;
                            keep
                        });
                    }
                }
            }
            _ => {}
        }
    }
}

impl Canvas {
    /// What this canvas hides from a reader.
    #[must_use]
    pub fn hidden(&self) -> Hidden {
        hidden_of(&self.root)
    }

    /// The canvas as a reader is served it: without its secret nodes and
    /// what belongs to them. Unchanged when it has none.
    #[must_use]
    pub fn projected(&self) -> Self {
        let hidden = self.hidden();
        if hidden.is_empty() {
            return self.clone();
        }
        let mut root = self.root.clone();
        project_root(&mut root, &hidden);
        Self {
            root,
            trailing: self.trailing.clone(),
        }
    }
}

/// Whether an unreadable canvas may hold a secret: it names one. A word
/// is enough; the cost of a false alarm is a reader seeing an empty board
/// where there was a board nobody could read.
fn may_hold_secret(text: &str) -> bool {
    text.to_ascii_lowercase().contains("secret")
}

/// `text`, a `.canvas` file, as a UniVerso serves a reader (see the
/// module's documentation): the text itself when the board has no secret
/// node.
#[must_use]
pub fn project(text: &str) -> Cow<'_, str> {
    match Canvas::parse(text) {
        Ok(canvas) => {
            if canvas.hidden().is_empty() {
                Cow::Borrowed(text)
            } else {
                Cow::Owned(canvas.projected().write())
            }
        }
        Err(_) if may_hold_secret(text) => Cow::Borrowed(EMPTY),
        Err(_) => Cow::Borrowed(text),
    }
}

/// Whether the board `text` holds a secret node (or may, being unreadable).
#[must_use]
pub fn has_secret(text: &str) -> bool {
    match Canvas::parse(text) {
        Ok(canvas) => !canvas.hidden().is_empty(),
        Err(_) => may_hold_secret(text),
    }
}

/// What the index keeps of a board with secret nodes (ADR 0087 item 6,
/// applied to ADR 0090 item 5): the text a reader's search may find it
/// by, the text it may not, and the nodes whose links a reader does not
/// have.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexSplit {
    /// The board's searchable text as a reader's projection holds it.
    pub public: String,
    /// The searchable text of what the projection took out.
    pub secret: String,
    /// The positions, in [`Canvas::nodes`], of the secret nodes.
    pub nodes: BTreeSet<usize>,
    /// What a reader is served: its length and FNV-1a hash.
    pub served: (usize, u64),
    /// The lines (1-based, first and last) the secret nodes take in the
    /// file, so a reader's line numbers are the projection's, not the
    /// file's: a count that included them would say how many there are.
    pub lines: Vec<(u32, u32)>,
}

/// The split of `text`; `None` when it holds nothing a reader is not
/// served (and when it cannot be read, which the index holds as empty).
#[must_use]
pub fn index_split(text: &str) -> Option<IndexSplit> {
    let canvas = Canvas::parse(text).ok()?;
    let hidden = canvas.hidden();
    if hidden.is_empty() {
        return None;
    }
    let shown = canvas.projected();
    let served = shown.write();
    let nodes = canvas
        .nodes()
        .iter()
        .enumerate()
        .filter(|(_, n)| node_is_secret(n))
        .map(|(i, _)| i)
        .collect();
    let whole = canvas.searchable_text();
    let public = shown.searchable_text();
    // What the projection took out: the lines of the whole not in the
    // public text, once each as many times as they are gone.
    let mut left: Vec<&str> = public.lines().collect();
    let mut gone = String::new();
    for line in whole.lines() {
        if let Some(at) = left.iter().position(|l| *l == line) {
            left.swap_remove(at);
        } else {
            gone.push_str(line);
            gone.push('\n');
        }
    }
    let lines = secret_lines(text, &canvas, &nodes);
    Some(IndexSplit {
        public,
        secret: gone,
        nodes,
        served: (served.len(), crate::reader::fnv(served.as_bytes())),
        lines,
    })
}

/// The first string field a node holds at its own level, where it is
/// written: a point inside the node's object.
fn point_in(node: &Json) -> Option<usize> {
    match node {
        Json::Object(entries) => entries.iter().find_map(|(_, v)| match v {
            Json::String(s) => s.at,
            _ => None,
        }),
        _ => None,
    }
}

/// The lines of `text` taken by the objects of the secret nodes at
/// `secret` (positions in `canvas.nodes()`), merged. One pass over the
/// text, tracking the objects it opens, skipping strings.
fn secret_lines(text: &str, canvas: &Canvas, secret: &BTreeSet<usize>) -> Vec<(u32, u32)> {
    let points: BTreeSet<usize> = canvas
        .nodes()
        .iter()
        .enumerate()
        .filter(|(i, _)| secret.contains(i))
        .filter_map(|(_, n)| point_in(n))
        .collect();
    if points.is_empty() {
        return Vec::new();
    }
    let bytes = text.as_bytes();
    let newlines: Vec<usize> = bytes
        .iter()
        .enumerate()
        .filter(|(_, b)| **b == b'\n')
        .map(|(i, _)| i)
        .collect();
    // The line of a byte offset: the newlines before it, and one.
    let line_at = |pos: usize| -> u32 {
        u32::try_from(newlines.partition_point(|n| *n < pos) + 1).unwrap_or(u32::MAX)
    };
    // (start of the object, whether the point of a secret node is in it).
    let mut stack: Vec<(usize, bool)> = Vec::new();
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'"' => {
                if points.contains(&i)
                    && let Some(top) = stack.last_mut()
                {
                    top.1 = true;
                }
                i += 1;
                while i < bytes.len() && bytes[i] != b'"' {
                    i += if bytes[i] == b'\\' { 2 } else { 1 };
                }
            }
            b'{' | b'[' => stack.push((i, false)),
            b'}' | b']' => {
                if let Some((start, marked)) = stack.pop()
                    && marked
                {
                    spans.push((start, i));
                }
            }
            _ => {}
        }
        i += 1;
    }
    let mut lines: Vec<(u32, u32)> = spans
        .iter()
        .map(|(a, b)| (line_at(*a), line_at(*b)))
        .collect();
    lines.sort_unstable();
    let mut merged: Vec<(u32, u32)> = Vec::new();
    for (a, b) in lines {
        match merged.last_mut() {
            Some(last) if a <= last.1 + 1 => last.1 = last.1.max(b),
            _ => merged.push((a, b)),
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    const BOARD: &str = r#"{
	"nodes":[
		{"id":"map","type":"file","file":"Mapa.png","x":0,"y":0,"width":1000,"height":800,"verso":{"map":true,"locked":true,"groups":["g1"]}},
		{"id":"open","type":"file","file":"Taverna.md","x":100,"y":100,"width":24,"height":24,"verso":{"pin":true,"groups":["g1"]}},
		{"id":"hid","type":"file","file":"Cripta.md","x":7001,"y":7002,"width":24,"height":24,"verso":{"pin":true,"secret":true,"groups":["g1","g2"]}}
	],
	"edges":[
		{"id":"e1","fromNode":"open","toNode":"map"},
		{"id":"e2","fromNode":"hid","toNode":"open","label":"tunel"}
	],
	"verso":{"version":1,"drawing":[
		{"id":"d1","type":"rectangle","x":5,"y":5,"groupIds":["g1"]},
		{"id":"d2","type":"text","x":8000,"y":8001,"text":"portao","groupIds":["g2"]},
		{"id":"d3","type":"arrow","x":1,"y":1,"endBinding":{"elementId":"hid"}},
		{"id":"d4","type":"line","x":2,"y":2,"under":"hid"},
		{"id":"d5","type":"text","x":3,"y":3,"containerId":"d3","text":"rota"}
	]}
}
"#;

    #[test]
    fn a_board_with_no_secret_is_served_as_it_is() {
        let text = BOARD.replace("\"secret\":true,", "");
        assert!(matches!(project(&text), Cow::Borrowed(_)));
        assert!(!has_secret(&text));
    }

    #[test]
    fn the_secret_pin_and_all_that_places_it_are_taken_out() {
        let shown = project(BOARD).into_owned();
        for word in [
            "hid", "Cripta", "7001", "7002", "tunel", "portao", "8000", "rota",
        ] {
            assert!(!shown.contains(word), "{word} reached the reader: {shown}");
        }
        for word in ["map", "open", "Taverna.md", "e1", "d1"] {
            assert!(shown.contains(word), "{word} was lost: {shown}");
        }
        let read = Canvas::parse(&shown).unwrap();
        assert_eq!(read.nodes().len(), 2);
    }

    #[test]
    fn it_is_idempotent_and_leaves_the_rest_untouched() {
        let once = project(BOARD).into_owned();
        assert_eq!(project(&once), once);
        let whole = Canvas::parse(BOARD).unwrap();
        let shown = Canvas::parse(&once).unwrap();
        assert_eq!(shown.nodes()[0], whole.nodes()[0]);
        assert_eq!(shown.nodes()[1], whole.nodes()[1]);
    }

    #[test]
    fn a_group_the_map_holds_hides_nothing() {
        let shown = project(BOARD).into_owned();
        // d1 is in g1, which the map and the open pin hold too.
        assert!(shown.contains("\"d1\""));
        assert!(!shown.contains("\"d2\""));
    }

    #[test]
    fn it_fails_closed() {
        assert_eq!(project("{\"nodes\": [ {\"secret\"").as_ref(), EMPTY);
        assert_eq!(project("not json at all").as_ref(), "not json at all");
        let odd = r#"{"nodes":[{"id":"a","type":"text","text":"x","x":1,"y":1,"width":1,"height":1,"verso":{"secret":"yes"}}]}"#;
        assert!(!project(odd).contains("\"a\""));
        // A key written twice: neither is trusted away.
        let twice = r#"{"nodes":[{"id":"a","type":"text","x":1,"y":1,"width":1,"height":1,"verso":{"secret":true},"verso":{}}]}"#;
        assert!(!project(twice).contains("\"a\""));
        let anonymous = r#"{"nodes":[{"type":"text","text":"sigilo","verso":{"secret":true}}]}"#;
        assert!(!project(anonymous).contains("sigilo"));
    }

    #[test]
    fn the_index_splits_what_a_reader_may_search() {
        let board = r#"{"nodes":[
			{"id":"a","type":"text","text":"praça","x":0,"y":0,"width":9,"height":9},
			{"id":"b","type":"text","text":"cripta","x":0,"y":0,"width":9,"height":9,"verso":{"secret":true}}
		]}"#;
        let split = index_split(board).unwrap();
        assert!(split.public.contains("praça") && !split.public.contains("cripta"));
        assert!(split.secret.contains("cripta") && !split.secret.contains("praça"));
        assert_eq!(split.nodes.into_iter().collect::<Vec<_>>(), vec![1]);
        assert!(index_split(&board.replace("true", "false")).is_none());
    }
}
