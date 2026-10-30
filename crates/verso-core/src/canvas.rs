// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! JSON Canvas files: the board (spec §5.11, ADR 0057).
//!
//! A `.canvas` is JSON. Verso reads it into a tree that keeps what a
//! general JSON library forgets — the order of the keys, each number as
//! written, each string's token as written — so that a file Verso did not
//! change is written back byte for byte, and one it changed differs only
//! where it changed. The layout is Obsidian's, as observed on 1.13.7
//! (`docs/reference/board-decision.md` §3.2): an object or array whose
//! values are all scalars on one line, any other one entry per line,
//! indented with tabs, no space after `:` or `,`.
//!
//! This lives here and not in `verso-dialect` because it writes, and the
//! dialect's parser is read-only (spec Q18). Nothing here touches the disk.

use std::fmt::Write as _;

/// Nesting deeper than this is refused: a board is a few levels deep, a
/// freehand stroke's points four or five; the parser recurses per level.
const MAX_DEPTH: usize = 64;

/// A JSON value as read, in document order.
#[derive(Debug, Clone)]
pub enum Json {
    Null,
    Bool(bool),
    /// As written: `400`, `-1.5e3`. Compared by value.
    Number(String),
    String(Str),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

/// A string with its token as written, when it came from a file: written
/// back as it was while its value is unchanged.
#[derive(Debug, Clone)]
pub struct Str {
    pub value: String,
    raw: Option<String>,
    /// Byte offset of the opening quote in the file it came from.
    pub at: Option<usize>,
}

impl Str {
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            raw: None,
            at: None,
        }
    }
}

impl PartialEq for Json {
    /// By value: the token a string or a number was written with does not
    /// count, nor where it was.
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Null, Self::Null) => true,
            (Self::Bool(a), Self::Bool(b)) => a == b,
            (Self::Number(a), Self::Number(b)) => {
                a == b || matches!((a.parse::<f64>(), b.parse::<f64>()), (Ok(x), Ok(y)) if x == y)
            }
            (Self::String(a), Self::String(b)) => a.value == b.value,
            (Self::Array(a), Self::Array(b)) => a == b,
            (Self::Object(a), Self::Object(b)) => a == b,
            _ => false,
        }
    }
}

impl Json {
    /// The value under `key` of an object; of a key written twice, the
    /// last, as `JSON.parse` — the window's and Obsidian's — reads it.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Self::Object(entries) => entries.iter().rev().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// The text of a string value.
    #[must_use]
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(s) => Some(&s.value),
            _ => None,
        }
    }

    fn is_scalar(&self) -> bool {
        !matches!(self, Self::Array(_) | Self::Object(_))
    }
}

/// Why a text is not a canvas this module can read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonError {
    pub at: usize,
    pub what: &'static str,
}

impl std::fmt::Display for JsonError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "not JSON at byte {}: {}", self.at, self.what)
    }
}

impl std::error::Error for JsonError {}

/// A canvas file as read: the tree, and what followed it (a final newline,
/// or nothing), to be written back as it was.
#[derive(Debug, Clone)]
pub struct Canvas {
    pub root: Json,
    pub trailing: String,
}

impl Canvas {
    /// Read a canvas. Anything but one JSON value, with whitespace around
    /// it, is an error; the value does not have to be an object.
    pub fn parse(text: &str) -> Result<Self, JsonError> {
        let mut p = Parser {
            src: text,
            bytes: text.as_bytes(),
            pos: 0,
        };
        p.space();
        let root = p.value(0)?;
        let end = p.pos;
        p.space();
        if p.pos != p.bytes.len() {
            return Err(p.error("text after the value"));
        }
        Ok(Self {
            root,
            trailing: text.get(end..).unwrap_or_default().to_owned(),
        })
    }

    /// The file's text, in Obsidian's layout.
    #[must_use]
    pub fn write(&self) -> String {
        let mut out = String::new();
        layout(&self.root, 0, &mut out);
        out.push_str(&self.trailing);
        out
    }

    /// The nodes, in the file's order (which is the stacking order).
    #[must_use]
    pub fn nodes(&self) -> &[Json] {
        match self.root.get("nodes") {
            Some(Json::Array(nodes)) => nodes,
            _ => &[],
        }
    }

    /// The links the canvas makes, as Obsidian counts them (spec Q16 for
    /// `.canvas`, ADR 0057 point 6): each `file` node, and each wikilink
    /// or embed inside a `text` node.
    #[must_use]
    pub fn links(&self) -> Vec<CanvasLink> {
        let mut out = Vec::new();
        for (index, node) in self.nodes().iter().enumerate() {
            match node.get("type").and_then(Json::as_str) {
                Some("file") => {
                    let Some(Json::String(file)) = node.get("file") else {
                        continue;
                    };
                    let subpath = node.get("subpath").and_then(Json::as_str).unwrap_or("");
                    let fragment = subpath.strip_prefix('#').unwrap_or(subpath);
                    let (heading, block) = match fragment.strip_prefix('^') {
                        Some(b) if !b.is_empty() => (None, Some(b.to_owned())),
                        _ if !fragment.is_empty() => (Some(fragment.to_owned()), None),
                        _ => (None, None),
                    };
                    out.push(CanvasLink {
                        node: index,
                        place: Place::FileNode,
                        embed: true,
                        target: file.value.clone(),
                        heading,
                        block,
                        alias: None,
                        at: file.at.unwrap_or(0),
                    });
                }
                Some("text") => {
                    let Some(Json::String(text)) = node.get("text") else {
                        continue;
                    };
                    let doc = verso_dialect::parse(&text.value);
                    let links = doc
                        .links
                        .iter()
                        .map(|l| (false, l.span, &l.target, &l.heading, &l.block, &l.alias));
                    let embeds = doc
                        .embeds
                        .iter()
                        .map(|e| (true, e.span, &e.target, &e.heading, &e.block, &e.alias));
                    for (embed, span, target, heading, block, alias) in links.chain(embeds) {
                        out.push(CanvasLink {
                            node: index,
                            place: Place::Text {
                                start: span.start,
                                end: span.end,
                            },
                            embed,
                            target: target.clone(),
                            heading: heading.clone(),
                            block: block.clone(),
                            alias: alias.clone(),
                            at: text.at.unwrap_or(0),
                        });
                    }
                }
                _ => {}
            }
        }
        out
    }

    /// The text a search finds the canvas by: its text nodes, group
    /// labels, link addresses and the free texts of the drawing, one per
    /// line.
    #[must_use]
    pub fn searchable_text(&self) -> String {
        let mut out = String::new();
        for node in self.nodes() {
            for key in ["text", "label", "url"] {
                if let Some(s) = node.get(key).and_then(Json::as_str) {
                    out.push_str(s);
                    out.push('\n');
                }
            }
        }
        if let Some(Json::Array(drawing)) = self.root.get("verso").and_then(|v| v.get("drawing")) {
            for element in drawing {
                if element.get("type").and_then(Json::as_str) == Some("text")
                    && let Some(s) = element.get("text").and_then(Json::as_str)
                {
                    out.push_str(s);
                    out.push('\n');
                }
            }
        }
        out
    }

    /// Replace a string field of the node at `index`, keeping everything
    /// else as it was. Returns whether the node had that field as a string.
    pub fn set_node_string(&mut self, index: usize, key: &str, value: String) -> bool {
        let Json::Object(root) = &mut self.root else {
            return false;
        };
        let Some((_, Json::Array(nodes))) = root.iter_mut().find(|(k, _)| k == "nodes") else {
            return false;
        };
        let Some(Json::Object(node)) = nodes.get_mut(index) else {
            return false;
        };
        match node.iter_mut().find(|(k, _)| k == key) {
            Some((_, slot @ Json::String(_))) => {
                *slot = Json::String(Str::new(value));
                true
            }
            _ => false,
        }
    }

    /// The canvas the window sends on save, laid over this one: every
    /// value equal to the one read keeps its token and every object its key
    /// order, so a save changes only what changed (ADR 0057 point 2). The
    /// window's tree decides which keys and which nodes exist; nodes and
    /// edges are matched by `id`. Node geometry the window changed is
    /// rounded to integers, as JSON Canvas asks; what it sent back as read
    /// keeps its token.
    #[must_use]
    pub fn merged(&self, new: Json) -> Self {
        let mut root = merge(Some(&self.root), new);
        round_geometry(&mut root, &self.root);
        Self {
            root,
            trailing: self.trailing.clone(),
        }
    }
}

/// Where a link of a canvas is written.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Place {
    /// The `file` field of a file node.
    FileNode,
    /// Inside the `text` field of a text node, at this byte range of the
    /// field's decoded text.
    Text { start: usize, end: usize },
}

/// A link of a canvas.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanvasLink {
    /// The node's position in `nodes`.
    pub node: usize,
    pub place: Place,
    pub embed: bool,
    pub target: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    /// Byte offset, in the file, of the string that holds the link.
    pub at: usize,
}

fn merge(old: Option<&Json>, new: Json) -> Json {
    match (old, new) {
        (Some(o), n) if *o == n => o.clone(),
        (Some(Json::Object(old_entries)), Json::Object(new_entries)) => {
            let mut out: Vec<(String, Json)> = Vec::with_capacity(new_entries.len());
            let mut pending: Vec<Option<(String, Json)>> =
                new_entries.into_iter().map(Some).collect();
            for (key, old_value) in old_entries {
                if let Some(slot) = pending
                    .iter_mut()
                    .find(|s| s.as_ref().is_some_and(|(k, _)| k == key))
                    && let Some((k, v)) = slot.take()
                {
                    out.push((k, merge(Some(old_value), v)));
                }
            }
            out.extend(pending.into_iter().flatten());
            Json::Object(out)
        }
        (Some(Json::Array(old_items)), Json::Array(new_items)) => {
            let id = |v: &Json| v.get("id").and_then(Json::as_str).map(str::to_owned);
            let by_id = new_items.iter().all(|v| id(v).is_some());
            // The first old item of each id, found once (a board of a few
            // hundred cards must not cost a scan of the old list per item).
            let mut first: std::collections::HashMap<&str, &Json> =
                std::collections::HashMap::new();
            if by_id {
                for o in old_items {
                    if let Some(i) = o.get("id").and_then(Json::as_str) {
                        first.entry(i).or_insert(o);
                    }
                }
            }
            Json::Array(
                new_items
                    .into_iter()
                    .enumerate()
                    .map(|(i, item)| {
                        let counterpart = if by_id {
                            let wanted = item.get("id").and_then(Json::as_str);
                            wanted.and_then(|w| first.get(w).copied())
                        } else {
                            old_items.get(i)
                        };
                        merge(counterpart, item)
                    })
                    .collect(),
            )
        }
        (_, n) => n,
    }
}

/// Whole numbers for the geometry the window changed, as Obsidian writes
/// it; a value the file already had is kept as written, a fraction
/// included: a save changes only what the user changed (decided on
/// 2026-10-01, review `board.md` §6 item 5). `-0` is written `0`.
fn round_geometry(root: &mut Json, old: &Json) {
    // The first old node of each id.
    let mut old_nodes: std::collections::HashMap<&str, &Json> = std::collections::HashMap::new();
    if let Some(Json::Array(items)) = old.get("nodes") {
        for o in items {
            if let Some(i) = o.get("id").and_then(Json::as_str) {
                old_nodes.entry(i).or_insert(o);
            }
        }
    }
    let Json::Object(entries) = root else {
        return;
    };
    let Some((_, Json::Array(nodes))) = entries.iter_mut().rev().find(|(k, _)| k == "nodes") else {
        return;
    };
    for node in nodes {
        let before = node
            .get("id")
            .and_then(Json::as_str)
            .and_then(|i| old_nodes.get(i).copied());
        let Json::Object(fields) = node else {
            continue;
        };
        for (key, value) in fields.iter_mut() {
            if !matches!(key.as_str(), "x" | "y" | "width" | "height") {
                continue;
            }
            let kept = before.and_then(|b| b.get(key)).is_some_and(|b| b == value);
            if !kept
                && let Json::Number(n) = value
                && let Ok(f) = n.parse::<f64>()
                && f.is_finite()
                && (f.fract() != 0.0 || n.starts_with("-0"))
            {
                let r = f.round();
                *n = if r == 0.0 {
                    "0".to_owned()
                } else {
                    format!("{r}")
                };
            }
        }
    }
}

fn layout(value: &Json, depth: usize, out: &mut String) {
    match value {
        Json::Null => out.push_str("null"),
        Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Json::Number(n) => out.push_str(n),
        Json::String(s) => match &s.raw {
            Some(raw) => out.push_str(raw),
            None => quote(&s.value, out),
        },
        Json::Array(items) => {
            if items.iter().all(Json::is_scalar) {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    layout(item, depth + 1, out);
                }
                out.push(']');
            } else {
                out.push('[');
                out.push('\n');
                for (i, item) in items.iter().enumerate() {
                    indent(depth + 1, out);
                    layout(item, depth + 1, out);
                    if i + 1 < items.len() {
                        out.push(',');
                    }
                    out.push('\n');
                }
                indent(depth, out);
                out.push(']');
            }
        }
        Json::Object(entries) => {
            if entries.iter().all(|(_, v)| v.is_scalar()) {
                out.push('{');
                for (i, (key, v)) in entries.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    quote(key, out);
                    out.push(':');
                    layout(v, depth + 1, out);
                }
                out.push('}');
            } else {
                out.push('{');
                out.push('\n');
                for (i, (key, v)) in entries.iter().enumerate() {
                    indent(depth + 1, out);
                    quote(key, out);
                    out.push(':');
                    layout(v, depth + 1, out);
                    if i + 1 < entries.len() {
                        out.push(',');
                    }
                    out.push('\n');
                }
                indent(depth, out);
                out.push('}');
            }
        }
    }
}

fn indent(depth: usize, out: &mut String) {
    for _ in 0..depth {
        out.push('\t');
    }
}

/// A string as JavaScript's `JSON.stringify` writes it, which is what
/// Obsidian writes: `"`, `\` and the control characters escaped, nothing
/// else.
fn quote(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

struct Parser<'a> {
    src: &'a str,
    bytes: &'a [u8],
    pos: usize,
}

impl Parser<'_> {
    fn error(&self, what: &'static str) -> JsonError {
        JsonError { at: self.pos, what }
    }

    fn space(&mut self) {
        while let Some(b' ' | b'\t' | b'\n' | b'\r') = self.bytes.get(self.pos) {
            self.pos += 1;
        }
    }

    fn eat(&mut self, byte: u8) -> bool {
        if self.bytes.get(self.pos) == Some(&byte) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn literal(&mut self, word: &str, value: Json) -> Result<Json, JsonError> {
        if self.src.get(self.pos..self.pos + word.len()) == Some(word) {
            self.pos += word.len();
            Ok(value)
        } else {
            Err(self.error("unknown word"))
        }
    }

    fn value(&mut self, depth: usize) -> Result<Json, JsonError> {
        if depth > MAX_DEPTH {
            return Err(self.error("nested too deep"));
        }
        match self.bytes.get(self.pos) {
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"') => self.string().map(Json::String),
            Some(b't') => self.literal("true", Json::Bool(true)),
            Some(b'f') => self.literal("false", Json::Bool(false)),
            Some(b'n') => self.literal("null", Json::Null),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(_) => Err(self.error("unexpected character")),
            None => Err(self.error("unexpected end")),
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, JsonError> {
        self.pos += 1;
        let mut entries = Vec::new();
        self.space();
        if self.eat(b'}') {
            return Ok(Json::Object(entries));
        }
        loop {
            self.space();
            if self.bytes.get(self.pos) != Some(&b'"') {
                return Err(self.error("expected a key"));
            }
            let key = self.string()?.value;
            self.space();
            if !self.eat(b':') {
                return Err(self.error("expected ':'"));
            }
            self.space();
            let value = self.value(depth + 1)?;
            entries.push((key, value));
            self.space();
            if self.eat(b',') {
                continue;
            }
            if self.eat(b'}') {
                return Ok(Json::Object(entries));
            }
            return Err(self.error("expected ',' or '}'"));
        }
    }

    fn array(&mut self, depth: usize) -> Result<Json, JsonError> {
        self.pos += 1;
        let mut items = Vec::new();
        self.space();
        if self.eat(b']') {
            return Ok(Json::Array(items));
        }
        loop {
            self.space();
            items.push(self.value(depth + 1)?);
            self.space();
            if self.eat(b',') {
                continue;
            }
            if self.eat(b']') {
                return Ok(Json::Array(items));
            }
            return Err(self.error("expected ',' or ']'"));
        }
    }

    fn number(&mut self) -> Result<Json, JsonError> {
        let start = self.pos;
        self.eat(b'-');
        let digits = |p: &mut Self| {
            let from = p.pos;
            while let Some(b'0'..=b'9') = p.bytes.get(p.pos) {
                p.pos += 1;
            }
            p.pos > from
        };
        if self.eat(b'0') {
            // A leading zero stands alone.
        } else if !digits(self) {
            return Err(self.error("expected a digit"));
        }
        if self.eat(b'.') && !digits(self) {
            return Err(self.error("expected a digit after '.'"));
        }
        if matches!(self.bytes.get(self.pos), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.bytes.get(self.pos), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            if !digits(self) {
                return Err(self.error("expected a digit in the exponent"));
            }
        }
        Ok(Json::Number(
            self.src.get(start..self.pos).unwrap_or("0").to_owned(),
        ))
    }

    fn hex4(&mut self) -> Result<u32, JsonError> {
        let digits = self
            .src
            .get(self.pos..self.pos + 4)
            .ok_or_else(|| self.error("short \\u escape"))?;
        // Four hex digits, nothing else: `from_str_radix` alone takes a
        // sign (`\\u+123`), which no JSON reader accepts.
        if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(self.error("bad \\u escape"));
        }
        let n = u32::from_str_radix(digits, 16).map_err(|_| self.error("bad \\u escape"))?;
        self.pos += 4;
        Ok(n)
    }

    fn string(&mut self) -> Result<Str, JsonError> {
        let start = self.pos;
        self.pos += 1;
        let mut value = String::new();
        loop {
            let Some(&b) = self.bytes.get(self.pos) else {
                return Err(self.error("unterminated string"));
            };
            match b {
                b'"' => {
                    self.pos += 1;
                    break;
                }
                b'\\' => {
                    self.pos += 1;
                    let Some(&e) = self.bytes.get(self.pos) else {
                        return Err(self.error("unterminated escape"));
                    };
                    self.pos += 1;
                    match e {
                        b'"' => value.push('"'),
                        b'\\' => value.push('\\'),
                        b'/' => value.push('/'),
                        b'b' => value.push('\u{8}'),
                        b'f' => value.push('\u{c}'),
                        b'n' => value.push('\n'),
                        b'r' => value.push('\r'),
                        b't' => value.push('\t'),
                        b'u' => {
                            let first = self.hex4()?;
                            let c = if (0xD800..0xDC00).contains(&first)
                                && self.src.get(self.pos..self.pos + 2) == Some("\\u")
                            {
                                let back = self.pos;
                                self.pos += 2;
                                let second = self.hex4()?;
                                if (0xDC00..0xE000).contains(&second) {
                                    char::from_u32(
                                        0x10000 + ((first - 0xD800) << 10) + (second - 0xDC00),
                                    )
                                } else {
                                    self.pos = back;
                                    None
                                }
                            } else {
                                char::from_u32(first)
                            };
                            // A lone surrogate is valid JSON and no Rust
                            // character: the value gets U+FFFD, the token
                            // keeps what was written.
                            value.push(c.unwrap_or('\u{FFFD}'));
                        }
                        _ => return Err(self.error("unknown escape")),
                    }
                }
                0x00..=0x1F => return Err(self.error("control character in a string")),
                _ => {
                    // Copy the whole run up to the next quote or escape at
                    // once; both are ASCII, so the run ends on a character
                    // boundary.
                    let run_end = self.bytes[self.pos..]
                        .iter()
                        .position(|&c| c == b'"' || c == b'\\' || c < 0x20)
                        .map_or(self.bytes.len(), |n| self.pos + n);
                    value.push_str(self.src.get(self.pos..run_end).unwrap_or_default());
                    self.pos = run_end;
                }
            }
        }
        Ok(Str {
            value,
            raw: self.src.get(start..self.pos).map(str::to_owned),
            at: Some(start),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A file as Obsidian 1.13.7 wrote it (the Sandbox's own
    /// `Quadro do Mestre.canvas`, and the probes of the memo's §3.2).
    const OBSIDIAN: &str = "{\n\t\"nodes\":[\n\t\t{\"id\":\"1928977c126ed30f\",\"x\":-417,\"y\":-304,\"width\":400,\"height\":400,\"type\":\"file\",\"file\":\"2. Escudo do Mestre/1. Painel de Criação.md\"},\n\t\t{\"id\":\"7a3c81f1b86cad3a\",\"x\":40,\"y\":-304,\"width\":400,\"height\":400,\"type\":\"file\",\"file\":\"2. Escudo do Mestre/2. Tabelas de Nomes.md\"}\n\t],\n\t\"edges\":[]\n}";

    const PROBE: &str = "{\n\t\"nodes\":[\n\t\t{\n\t\t\t\"id\":\"a1\",\n\t\t\t\"type\":\"file\",\n\t\t\t\"file\":\"verso-board-probe/Alvo Tres.md\",\n\t\t\t\"versoExtra\":{\"k\":1},\n\t\t\t\"x\":0,\n\t\t\t\"y\":0,\n\t\t\t\"width\":400,\n\t\t\t\"height\":200\n\t\t},\n\t\t{\"id\":\"t1\",\"type\":\"text\",\"text\":\"texto\",\"versoNote\":\"n\",\"x\":500,\"y\":70,\"width\":250,\"height\":60,\"color\":\"4\"}\n\t],\n\t\"edges\":[\n\t\t{\"id\":\"e1\",\"versoRel\":\"conhece\",\"fromNode\":\"a1\",\"fromSide\":\"right\",\"toNode\":\"t1\",\"toSide\":\"left\",\"label\":\"liga\"}\n\t],\n\t\"verso\":{\n\t\t\"drawing\":[\n\t\t\t{\n\t\t\t\t\"id\":\"d1\",\n\t\t\t\t\"type\":\"freedraw\",\n\t\t\t\t\"points\":[\n\t\t\t\t\t[0,0],\n\t\t\t\t\t[1,2]\n\t\t\t\t]\n\t\t\t},\n\t\t\t{\"id\":\"d2\",\"type\":\"text\",\"text\":\"anotação\"}\n\t\t]\n\t}\n}";

    #[test]
    fn obsidian_layout_round_trips_byte_for_byte() {
        for text in [
            OBSIDIAN,
            PROBE,
            "{\n\t\"nodes\":[],\n\t\"edges\":[]\n}",
            "{}",
        ] {
            assert_eq!(Canvas::parse(text).unwrap().write(), text);
        }
    }

    #[test]
    fn a_final_newline_is_kept() {
        let text = format!("{OBSIDIAN}\n");
        assert_eq!(Canvas::parse(&text).unwrap().write(), text);
    }

    #[test]
    fn a_string_keeps_its_token_while_unchanged() {
        let text = r#"{"a":"café","b":"x\/y"}"#;
        assert_eq!(Canvas::parse(text).unwrap().write(), text);
    }

    #[test]
    fn a_new_string_is_written_as_javascript_writes_it() {
        let mut out = String::new();
        quote("a\"b\\c\nd\u{1}é/", &mut out);
        assert_eq!(out, "\"a\\\"b\\\\c\\nd\\u0001é/\"");
    }

    #[test]
    fn merge_keeps_order_tokens_and_unknown_fields() {
        let old = Canvas::parse(PROBE).unwrap();
        // The window's tree: same nodes, t1 moved, keys in another order,
        // the unknown fields carried over.
        let new = Canvas::parse(
            r#"{"nodes":[{"id":"a1","x":0,"y":0,"width":400,"height":200,"type":"file","file":"verso-board-probe/Alvo Tres.md","versoExtra":{"k":1}},{"id":"t1","x":500,"y":140.4,"width":250,"height":60,"type":"text","text":"texto","color":"4","versoNote":"n"}],"edges":[{"id":"e1","fromNode":"a1","fromSide":"right","toNode":"t1","toSide":"left","label":"liga","versoRel":"conhece"}],"verso":{"drawing":[{"id":"d1","type":"freedraw","points":[[0,0],[1,2]]},{"id":"d2","type":"text","text":"anotação"}]}}"#,
        )
        .unwrap()
        .root;
        let merged = old.merged(new).write();
        assert_eq!(merged, PROBE.replace("\"y\":70", "\"y\":140"));
    }

    #[test]
    fn merge_follows_the_window_on_what_exists() {
        let old = Canvas::parse(OBSIDIAN).unwrap();
        let new = Canvas::parse(
            r#"{"nodes":[{"id":"7a3c81f1b86cad3a","x":40,"y":-304,"width":400,"height":400,"type":"file","file":"2. Escudo do Mestre/2. Tabelas de Nomes.md"},{"id":"n","type":"text","text":"novo","x":1,"y":2,"width":3,"height":4}],"edges":[]}"#,
        )
        .unwrap()
        .root;
        let merged = old.merged(new).write();
        assert_eq!(
            merged,
            "{\n\t\"nodes\":[\n\t\t{\"id\":\"7a3c81f1b86cad3a\",\"x\":40,\"y\":-304,\"width\":400,\"height\":400,\"type\":\"file\",\"file\":\"2. Escudo do Mestre/2. Tabelas de Nomes.md\"},\n\t\t{\"id\":\"n\",\"type\":\"text\",\"text\":\"novo\",\"x\":1,\"y\":2,\"width\":3,\"height\":4}\n\t],\n\t\"edges\":[]\n}"
        );
    }

    #[test]
    fn links_are_file_nodes_and_text_node_links() {
        let text = r##"{"nodes":[{"id":"a","type":"file","file":"p/N.md","subpath":"#Porão","x":0,"y":0,"width":1,"height":1},{"id":"b","type":"text","text":"ver [[C]] e ![[img.png]]","x":0,"y":0,"width":1,"height":1},{"id":"c","type":"link","url":"https://x","x":0,"y":0,"width":1,"height":1}]}"##;
        let canvas = Canvas::parse(text).unwrap();
        let links = canvas.links();
        assert_eq!(links.len(), 3);
        assert_eq!(links[0].target, "p/N.md");
        assert_eq!(links[0].heading.as_deref(), Some("Porão"));
        assert_eq!(links[0].place, Place::FileNode);
        assert_eq!(links[1].target, "C");
        assert!(!links[1].embed);
        assert_eq!(links[2].target, "img.png");
        assert!(links[2].embed);
        assert_eq!(text.get(links[1].at..links[1].at + 5), Some("\"ver "));
    }

    #[test]
    fn set_node_string_rewrites_one_field() {
        let mut canvas = Canvas::parse(OBSIDIAN).unwrap();
        assert!(canvas.set_node_string(0, "file", "novo/Painel.md".to_owned()));
        assert_eq!(
            canvas.write(),
            OBSIDIAN.replace(
                "2. Escudo do Mestre/1. Painel de Criação.md",
                "novo/Painel.md"
            )
        );
    }

    #[test]
    fn what_is_not_json_is_refused() {
        for bad in [
            "",
            "{",
            "{\"a\":}",
            "[1,]",
            "{\"a\":1} x",
            "\"\u{1}\"",
            "01x",
            "\u{feff}{}",
        ] {
            assert!(Canvas::parse(bad).is_err(), "{bad:?}");
        }
        let deep = "[".repeat(MAX_DEPTH + 2) + &"]".repeat(MAX_DEPTH + 2);
        assert!(Canvas::parse(&deep).is_err());
    }

    #[test]
    fn surrogate_pairs_and_lone_surrogates() {
        let pair = Canvas::parse(r#""😀""#).unwrap();
        assert_eq!(pair.root.as_str(), Some("😀"));
        let lone = r#""\ud800x""#;
        let parsed = Canvas::parse(lone).unwrap();
        assert_eq!(parsed.root.as_str(), Some("\u{FFFD}x"));
        assert_eq!(parsed.write(), lone);
    }

    #[test]
    fn a_signed_unicode_escape_is_not_json() {
        assert!(Canvas::parse(r#""\u+123""#).is_err());
        assert!(Canvas::parse(r#""é""#).is_ok());
    }

    #[test]
    fn a_key_written_twice_is_read_as_its_last() {
        let c = Canvas::parse(r#"{"nodes":[{"id":"a"}],"nodes":[{"id":"b"}]}"#).unwrap();
        assert_eq!(c.nodes()[0].get("id").and_then(Json::as_str), Some("b"));
    }

    #[test]
    fn a_save_rounds_only_the_geometry_that_changed() {
        let read = "{\n\t\"nodes\":[\n\t\t{\"id\":\"a\",\"x\":10.5,\"y\":-0.4,\"width\":250.5,\"height\":60},\n\t\t{\"id\":\"b\",\"x\":0,\"y\":0,\"width\":10,\"height\":10}\n\t],\n\t\"edges\":[]\n}";
        let old = Canvas::parse(read).unwrap();
        let sent = r#"{"nodes":[{"id":"a","x":10.5,"y":-0.4,"width":250.5,"height":60},{"id":"b","x":12.6,"y":-0.3,"width":10,"height":10}],"edges":[]}"#;
        let written = old.merged(Canvas::parse(sent).unwrap().root).write();
        assert_eq!(
            written,
            read.replace(
                "\"x\":0,\"y\":0,\"width\":10",
                "\"x\":13,\"y\":0,\"width\":10"
            )
        );
    }

    #[test]
    fn merging_a_big_board_does_not_scan_the_old_list_per_card() {
        // 6000 cards: a scan of the old list per card (with an owned id per
        // step) is tens of millions of allocations, seconds in a debug build.
        let body = |shift: i32| {
            let nodes: Vec<String> = (0..6000)
                .map(|i| {
                    format!(
                        "{{\"id\":\"n{i}\",\"type\":\"text\",\"text\":\"c{i}\",\"x\":{},\"y\":0.5,\"width\":10,\"height\":10}}",
                        i + shift
                    )
                })
                .collect();
            format!("{{\"nodes\":[{}],\"edges\":[]}}", nodes.join(","))
        };
        let old = Canvas::parse(&body(0)).unwrap();
        let new = Canvas::parse(&body(1)).unwrap();
        let start = std::time::Instant::now();
        let written = old.merged(new.root).write();
        assert!(
            start.elapsed() < std::time::Duration::from_secs(3),
            "{:?}",
            start.elapsed()
        );
        // Matched by id: the card whose x moved by one is the moved one,
        // the fraction the file had (`y`) kept as written.
        assert!(written.contains("\"id\":\"n5999\""));
        assert!(written.contains("\"x\":6000,"));
        assert!(written.contains("\"y\":0.5"));
    }

    #[test]
    fn the_first_old_card_of_an_id_is_the_one_a_save_matches() {
        let read = r#"{"nodes":[{"id":"a","x":1.5,"y":0,"width":1,"height":1},{"id":"a","x":2.5,"y":0,"width":1,"height":1}],"edges":[]}"#;
        let old = Canvas::parse(read).unwrap();
        let sent = r#"{"nodes":[{"id":"a","x":1.5,"y":0,"width":1,"height":1}],"edges":[]}"#;
        let written = old.merged(Canvas::parse(sent).unwrap().root).write();
        assert!(written.contains("\"x\":1.5"), "{written}");
    }
}
