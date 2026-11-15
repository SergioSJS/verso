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
//!
//! What else a reader is not served (fix of 2026-11-15, ADR 0120 "As
//! built"): the projection is an **allowlist** of the board's keys, not a
//! denylist. A reader is served `nodes`, `edges` and, of the top-level
//! `verso`, only `version`, `drawing` and `background` ([`PUBLIC_KEYS`],
//! [`PUBLIC_VERSO_KEYS`]); any other key — the walls an imported map keeps
//! (`verso.walls`, ADR 0120 item 3, its secret doors named), a key of a
//! later Verso or of a plugin — is left out (fails closed). And a drawn
//! element that is secret itself ([`drawn_is_secret`]: marked
//! `"verso": {"secret": …}` on it or in its `customData`, or the secret door
//! the dungeon import drew before it marked them) is left out with its bound
//! text and what is bound to it; its groups hide nothing else.

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

/// The top-level keys of a board a reader is served (the rest is left out).
pub const PUBLIC_KEYS: [&str; 3] = ["nodes", "edges", "verso"];

/// The keys of a board's top-level `verso` a reader is served: the version
/// of the key, the drawing (cut as the module says) and the board's
/// background. Not `walls` (ADR 0120 item 3: an imported map's walls and
/// doors, secret ones named), nor any key this build does not know.
pub const PUBLIC_VERSO_KEYS: [&str; 3] = ["version", "drawing", "background"];

/// Whether `n`, a JSON number, is `want`.
fn number_is(n: &Json, want: f64) -> bool {
    matches!(n, Json::Number(s) if s.parse::<f64>().is_ok_and(|x| (x - want).abs() < 1e-9))
}

/// Whether the drawn element is the secret door the dungeon import of ADR
/// 0120 drew before it marked its secret doors (0.9.0-beta.2 and before):
/// a line, dashed, of stroke 3 — a width Excalidraw's own menu never gives
/// (1, 2, 4), so the import is the only one that draws it. Read the way
/// [`all`] reads: any value of a key written twice counts (fails closed).
fn imported_secret_door(element: &Json) -> bool {
    let is = |key: &str, want: &str| all(element, key).any(|v| v.as_str() == Some(want));
    is("type", "line")
        && is("strokeStyle", "dashed")
        && all(element, "strokeWidth").any(|w| number_is(w, 3.0))
}

/// Whether a drawn element of the board is secret itself: marked
/// `"verso": {"secret": …}` on it, or in its `customData` (where Excalidraw
/// keeps what is not its own, and where the dungeon import marks a secret
/// door), or the secret door an earlier import drew unmarked.
#[must_use]
pub fn drawn_is_secret(element: &Json) -> bool {
    node_is_secret(element)
        || all(element, "customData")
            .any(|cd| node_is_secret(cd) || all(cd, "canvas").any(node_is_secret))
        || imported_secret_door(element)
}

/// Whether the root holds a key a reader is not served: outside
/// [`PUBLIC_KEYS`], a `verso` that is no object, or a key of `verso`
/// outside [`PUBLIC_VERSO_KEYS`].
fn holds_unserved_key(root: &Json) -> bool {
    let Json::Object(entries) = root else {
        return false;
    };
    entries.iter().any(|(k, v)| {
        !PUBLIC_KEYS.contains(&k.as_str())
            || (k == "verso"
                && match v {
                    Json::Object(inner) => inner
                        .iter()
                        .any(|(ik, _)| !PUBLIC_VERSO_KEYS.contains(&ik.as_str())),
                    _ => true,
                })
    })
}

/// The drawn elements of every `verso.drawing` of the root (a key written
/// twice included).
fn drawn_of(root: &Json) -> Vec<&Json> {
    let mut out = Vec::new();
    for verso in all(root, "verso") {
        for list in all(verso, "drawing") {
            if let Json::Array(items) = list {
                out.extend(items.iter());
            }
        }
    }
    out
}

/// The secret callouts of a text node's `text`: none for any other node.
/// A node's text is Markdown, so the note's projection applies to it as it
/// stands (`verso_dialect::Secrets`); a file node's note is served by its
/// own path, projected on its own.
#[must_use]
pub fn text_secrets(node: &Json) -> verso_dialect::Secrets {
    if node.get("type").and_then(Json::as_str) != Some("text") {
        return verso_dialect::Secrets::default();
    }
    all(node, "text")
        .filter_map(Json::as_str)
        .map(verso_dialect::Secrets::of)
        .find(|s| !s.is_empty())
        .unwrap_or_default()
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
    /// Whether some text node that is not secret holds a `> [!secret]`
    /// callout: a Markdown card on a board is a Markdown card (ADR 0087,
    /// decided 2026-10-15), so a reader is served the card's text as a
    /// note's projection.
    pub texts: bool,
    /// Whether the board holds a key a reader is not served (the module's
    /// allowlist): `verso.walls`, or any key this build does not know.
    pub keys: bool,
    /// Whether some drawn element is secret itself ([`drawn_is_secret`]).
    pub drawn: bool,
}

impl Hidden {
    /// Whether nothing is hidden.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty() && !self.anonymous && !self.texts && !self.keys && !self.drawn
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
        if !secret && !text_secrets(node).is_empty() {
            hidden.texts = true;
        }
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
    hidden.keys = holds_unserved_key(root);
    hidden.drawn = drawn_of(root).into_iter().any(drawn_is_secret);
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

/// The drawn elements to hide: those [`drawn_is_hidden`] names, the secret
/// ones ([`drawn_is_secret`]), and — to a fixed point — the bound text and
/// members of what is hidden, and what is bound to it.
fn hidden_drawing(drawing: &[Json], hidden: &Hidden) -> Vec<bool> {
    let mut gone: Vec<bool> = drawing
        .iter()
        .map(|e| drawn_is_hidden(e, hidden) || drawn_is_secret(e))
        .collect();
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
            let bound = ["startBinding", "endBinding"].iter().any(|b| {
                all(e, b).any(|b| {
                    all(b, "elementId")
                        .filter_map(Json::as_str)
                        .any(|id| ids.contains(id))
                })
            });
            if by("containerId") || by("frameId") || by("under") || bound {
                gone[i] = true;
                changed = true;
            }
        }
        if !changed {
            return gone;
        }
    }
}

/// A text node's `text` as a note's projection has it. A card whose text
/// is all secret stays, empty, with its place and its edges: a wholly
/// secret note is served the same way (an empty note that exists), and
/// removing the card instead would show the edges that ended at it
/// ending nowhere, which says more.
fn project_text(node: &mut Json) {
    if node.get("type").and_then(Json::as_str) != Some("text") {
        return;
    }
    let Json::Object(entries) = node else {
        return;
    };
    for (key, value) in entries.iter_mut() {
        if key != "text" {
            continue;
        }
        if let Json::String(s) = value {
            let secrets = verso_dialect::Secrets::of(&s.value);
            if !secrets.is_empty() {
                let projected = secrets.project(&s.value).into_owned();
                *value = Json::String(crate::canvas::Str::new(projected));
            }
        }
    }
}

/// `root` without the secret nodes and what belongs to them, and without
/// the keys a reader is not served.
fn project_root(root: &mut Json, hidden: &Hidden) {
    let Json::Object(entries) = root else {
        return;
    };
    entries.retain(|(k, v)| {
        PUBLIC_KEYS.contains(&k.as_str()) && (k != "verso" || matches!(v, Json::Object(_)))
    });
    for (key, value) in entries.iter_mut() {
        match (key.as_str(), value) {
            ("nodes", Json::Array(items)) => {
                items.retain(|n| !node_is_secret(n));
                for node in items.iter_mut() {
                    project_text(node);
                }
            }
            ("edges", Json::Array(items)) => items.retain(|e| {
                let touches = |side: &str| {
                    all(e, side)
                        .filter_map(Json::as_str)
                        .any(|id| hidden.nodes.contains(id))
                };
                !(touches("fromNode") || touches("toNode"))
            }),
            ("verso", Json::Object(inner)) => {
                inner.retain(|(k, _)| PUBLIC_VERSO_KEYS.contains(&k.as_str()));
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

    const CARD: &str = "{\"nodes\":[\
		{\"id\":\"a\",\"type\":\"text\",\"text\":\"aberto\\n\\n> [!secret]\\n> zqcallout\\n\\nfim\",\"x\":1,\"y\":2,\"width\":9,\"height\":9},\
		{\"id\":\"b\",\"type\":\"text\",\"text\":\"> [!secret]\\n> tudo zqtudo\",\"x\":3,\"y\":4,\"width\":9,\"height\":9}\
	],\"edges\":[{\"id\":\"e\",\"fromNode\":\"a\",\"toNode\":\"b\"}]}";

    #[test]
    fn a_secret_callout_in_a_text_card_is_hidden_as_in_a_note() {
        assert!(has_secret(CARD));
        let shown = project(CARD).into_owned();
        assert!(
            !shown.contains("zqcallout") && !shown.contains("zqtudo"),
            "{shown}"
        );
        assert!(!shown.contains("[!secret]"), "{shown}");
        let read = Canvas::parse(&shown).unwrap();
        // Both cards stay, with their geometry and the edge between them;
        // a card that was all secret is an empty card, as a note is an
        // empty note (the projection says no more than a note's does).
        assert_eq!(read.nodes().len(), 2);
        let text = |i: usize| {
            read.nodes()[i]
                .get("text")
                .and_then(Json::as_str)
                .unwrap()
                .to_owned()
        };
        assert_eq!(
            text(0),
            verso_dialect::project("aberto\n\n> [!secret]\n> zqcallout\n\nfim")
        );
        assert!(text(0).contains("aberto") && text(0).contains("fim"));
        assert_eq!(text(1), "");
        assert!(
            shown.contains("\"fromNode\"") && shown.contains("\"x\": 3")
                || shown.contains("\"x\":3")
        );
        assert_eq!(project(&shown), shown);
        let split = index_split(CARD).unwrap();
        assert!(split.secret.contains("zqcallout") && !split.public.contains("zqcallout"));
        assert!(split.public.contains("aberto"));
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
