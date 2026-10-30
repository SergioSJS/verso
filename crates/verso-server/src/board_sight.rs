// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a player who edits a board sees of its room (ADR 0113 section H,
//! step S7). Pure: entries in, entries out, no IO, no Yjs.
//!
//! A board's room keeps its elements in one map, an entry per element and
//! version (`collab_board.rs`). A player who edits the board is told only
//! the elements they see, each element as one of three:
//!
//! - **Open**: the element as it is, a card of a file they see, a text
//!   card (whoever edits sees its secret blocks, ADR 0087 item 5), a
//!   drawing;
//! - **Locked**: a card of a file they do not see, as a marker with the
//!   **same id**, its place and its size, and the words every veiled card
//!   has — never the file's path, its name, its colour, its text;
//! - **Gone**: nothing at all, not even a tombstone — a secret pin (ADR
//!   0090 item 5) and what belongs to it: the edges that touch it, the
//!   drawn elements bound to it, in it or grouped only with secret pins.
//!
//! The same function answers the other way: [`check`] judges an edit of the
//! player's — a set of entries put and removed — against what they see,
//! and refuses any that touches an id they do not see, makes a secret pin
//! or a locked card, or changes what another element is to them.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Map, Value, json};

/// The board's entries: `id\nversion\nversionNonce` → the element, JSON.
pub type Entries = BTreeMap<String, String>;

/// What a player sees of one element.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Class {
    Open,
    Locked,
    Gone,
}

/// What a player is shown of a room, and what they are not.
#[derive(Debug, Clone, Default)]
pub struct Sight {
    /// The entries shown: the key of an element's entry is the room's.
    pub shown: Entries,
    /// What each element of the room is to the player.
    pub class: BTreeMap<String, Class>,
    /// The groups only secret pins carry.
    pub shut: BTreeSet<String>,
}

impl Sight {
    /// Whether the element is one the player does not see as it is: a
    /// locked card or nothing.
    #[must_use]
    pub fn unseen(&self, id: &str) -> bool {
        matches!(self.class.get(id), Some(Class::Locked | Class::Gone))
    }
}

/// The `link` of a card's element: it names nothing on the network.
const LINK: &str = "https://verso.invalid/board-node";

fn truthy(v: Option<&Value>) -> bool {
    !matches!(v, None | Some(Value::Null | Value::Bool(false)))
}

fn at<'a>(v: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter().try_fold(v, |v, k| v.get(*k))
}

/// The canvas node an element carries, if any.
fn node(v: &Value) -> Option<&Value> {
    at(v, &["customData", "canvas"]).filter(|n| n.is_object())
}

/// Whether the element is a secret pin: its node is marked
/// `"verso": {"secret": …}` with anything but `false` or `null` (a flag it
/// does not understand counts as set, as the file's projection does).
fn is_secret(v: &Value) -> bool {
    truthy(node(v).and_then(|n| at(n, &["verso", "secret"])))
        || truthy(at(v, &["verso", "secret"]))
        || truthy(at(v, &["customData", "verso", "secret"]))
}

/// Whether the element's JSON, read as the file's projection reads it (every
/// key written twice counted, not only the last), marks a node secret.
fn secret_as_the_file_reads_it(json: &str) -> bool {
    use verso_core::canvas::{Canvas, Json};
    // The flag is a key spelled `secret`: an element that does not hold the
    // word, and writes no escape that could spell it, cannot carry one. The
    // parse below (a copy of the whole element) is for the rest.
    if !json.contains("secret") && !json.contains('\\') {
        return false;
    }
    let Ok(c) = Canvas::parse(json) else {
        return false;
    };
    let each = |of: &Json, key: &str| -> Vec<Json> {
        match of {
            Json::Object(e) => e
                .iter()
                .filter(|(k, _)| k == key)
                .map(|(_, v)| v.clone())
                .collect(),
            _ => Vec::new(),
        }
    };
    if verso_core::canvas_secret::node_is_secret(&c.root) {
        return true;
    }
    each(&c.root, "customData").iter().any(|cd| {
        verso_core::canvas_secret::node_is_secret(cd)
            || each(cd, "canvas")
                .iter()
                .any(verso_core::canvas_secret::node_is_secret)
    })
}

/// The ids an element names: the ends of an edge, the container and the
/// frame, what an arrow is bound to, what a drawn element lies under.
fn refs(v: &Value) -> Vec<&str> {
    fn push<'a>(out: &mut Vec<&'a str>, x: Option<&'a Value>) {
        if let Some(s) = x.and_then(Value::as_str) {
            out.push(s);
        }
    }
    let mut out = Vec::new();
    if let Some(n) = node(v) {
        push(&mut out, n.get("fromNode"));
        push(&mut out, n.get("toNode"));
    }
    push(&mut out, at(v, &["startBinding", "elementId"]));
    push(&mut out, at(v, &["endBinding", "elementId"]));
    push(&mut out, v.get("containerId"));
    push(&mut out, v.get("frameId"));
    push(&mut out, v.get("under"));
    out
}

/// The groups an element is in.
fn groups(v: &Value) -> Vec<&str> {
    let mut out = Vec::new();
    for list in [
        node(v).and_then(|n| at(n, &["verso", "groups"])),
        v.get("groupIds"),
    ] {
        if let Some(items) = list.and_then(Value::as_array) {
            out.extend(items.iter().filter_map(Value::as_str));
        }
    }
    out
}

/// Whether the element is a canvas node (a card, a group), not an edge.
fn is_node(v: &Value) -> bool {
    node(v)
        .is_some_and(|n| n.get("type").is_some_and(Value::is_string) && n.get("fromNode").is_none())
}

/// The file a card names, if it names one.
fn file_of(v: &Value) -> Option<&str> {
    node(v).and_then(|n| n.get("file")).and_then(Value::as_str)
}

/// An entry's key, taken apart: the element's id, its version, its nonce.
fn key_of(key: &str) -> Option<(&str, i64, i64)> {
    crate::collab_board::parse_key(key)
}

/// The locked card an element is to a player who does not see `file`: the
/// same id, the same place and size, the words every veiled card has.
fn marker(v: &Value, text: &str, gone: &BTreeSet<String>) -> Value {
    let mut m = Map::new();
    for k in [
        "id",
        "x",
        "y",
        "width",
        "height",
        "angle",
        "opacity",
        "seed",
        "version",
        "versionNonce",
        "index",
        "isDeleted",
    ] {
        if let Some(x) = v.get(k) {
            m.insert(k.to_owned(), x.clone());
        }
    }
    m.insert("type".to_owned(), json!("embeddable"));
    m.insert("link".to_owned(), json!(LINK));
    m.insert("locked".to_owned(), json!(true));
    m.insert("groupIds".to_owned(), json!([]));
    if let Some(f) = v.get("frameId").and_then(Value::as_str)
        && !gone.contains(f)
    {
        m.insert("frameId".to_owned(), json!(f));
    }
    if let Some(b) = bound(v, gone) {
        m.insert("boundElements".to_owned(), b);
    }
    let get = |k: &str| v.get(k).cloned().unwrap_or(Value::Null);
    m.insert(
        "customData".to_owned(),
        json!({ "canvas": {
            "id": get("id"), "type": "text",
            "x": get("x"), "y": get("y"), "width": get("width"), "height": get("height"),
            "text": text,
        } }),
    );
    Value::Object(m)
}

/// The element's `boundElements` without what the player does not see.
fn bound(v: &Value, gone: &BTreeSet<String>) -> Option<Value> {
    let list = v.get("boundElements")?.as_array()?;
    Some(Value::Array(
        list.iter()
            .filter(|b| {
                !b.get("id")
                    .and_then(Value::as_str)
                    .is_some_and(|i| gone.contains(i))
            })
            .cloned()
            .collect(),
    ))
}

/// What a player sees of `entries`. `lock` says, of the file a card names,
/// the words its locked card carries when the player does not see it
/// (`None`: they do).
#[must_use]
pub fn see(entries: &Entries, lock: &dyn Fn(&str) -> Option<String>) -> Sight {
    see_as(entries, lock, true)
}

/// [`see`] for the classes alone (`Sight::class`, `Sight::shut`): the
/// elements' shown text is not made. For a board judged only to say what each
/// id is to the player, as a file's cards are.
#[must_use]
pub fn classes_of(entries: &Entries, lock: &dyn Fn(&str) -> Option<String>) -> Sight {
    see_as(entries, lock, false)
}

fn see_as(entries: &Entries, lock: &dyn Fn(&str) -> Option<String>, want_shown: bool) -> Sight {
    // Taken apart; an entry that is no element of its key is read as none,
    // and its id is not shown at all (fails closed).
    let mut parsed: Vec<(&str, &str, Value)> = Vec::new();
    let mut gone: BTreeSet<String> = BTreeSet::new();
    let mut ids: BTreeSet<String> = BTreeSet::new();
    for (key, json) in entries {
        let Some((id, _, _)) = key_of(key) else {
            continue;
        };
        ids.insert(id.to_owned());
        match serde_json::from_str::<Value>(json) {
            Ok(v) if v.is_object() && v.get("id").and_then(Value::as_str) == Some(id) => {
                parsed.push((key, id, v));
            }
            _ => {
                gone.insert(id.to_owned());
            }
        }
    }
    // The secret pins, and the groups only they carry.
    let mut shut: BTreeSet<String> = BTreeSet::new();
    let mut open: BTreeSet<&str> = BTreeSet::new();
    for (key, id, v) in &parsed {
        if is_secret(v) || secret_as_the_file_reads_it(&entries[*key]) {
            gone.insert((*id).to_owned());
            shut.extend(groups(v).into_iter().map(str::to_owned));
        }
    }
    for (_, id, v) in &parsed {
        if is_node(v) && !gone.contains(*id) {
            open.extend(groups(v));
        }
    }
    shut.retain(|g| !open.contains(g.as_str()));
    // What belongs to them, to a fixed point.
    loop {
        let mut grew = false;
        for (_, id, v) in &parsed {
            if gone.contains(*id) {
                continue;
            }
            let touches = refs(v).iter().any(|r| gone.contains(*r));
            let grouped = groups(v).iter().any(|g| shut.contains(*g));
            if touches || grouped {
                gone.insert((*id).to_owned());
                grew = true;
            }
        }
        if !grew {
            break;
        }
    }
    let mut sight = Sight {
        shut,
        ..Sight::default()
    };
    for id in &ids {
        let class = if gone.contains(id) {
            Class::Gone
        } else {
            Class::Open
        };
        sight.class.insert(id.clone(), class);
    }
    for (key, id, v) in &parsed {
        if gone.contains(*id) {
            continue;
        }
        let locked = file_of(v).and_then(lock);
        if locked.is_some() {
            sight.class.insert((*id).to_owned(), Class::Locked);
        }
        if !want_shown {
            continue;
        }
        let shown = match locked {
            Some(text) => marker(v, &text, &gone),
            None => {
                let mut v = v.clone();
                if let Some(b) = bound(&v, &gone) {
                    v["boundElements"] = b;
                }
                v
            }
        };
        sight.shown.insert((*key).to_owned(), shown.to_string());
    }
    sight
}

/// A pseudo-room of a canvas file: its nodes, edges and drawn elements as
/// the entries [`see`] reads, so that the file's ids are classed by the same
/// rules as the room's.
#[must_use]
pub fn entries_of_canvas(canvas: &Value) -> Entries {
    let mut out = Entries::new();
    let mut put = |v: Value| {
        if let Some(id) = v.get("id").and_then(Value::as_str) {
            out.insert(format!("{id}\n0\n0"), v.to_string());
        }
    };
    for n in canvas["nodes"].as_array().into_iter().flatten() {
        if n.get("id").is_some() {
            put(json!({ "id": n["id"], "type": "embeddable", "customData": { "canvas": n } }));
        }
    }
    for e in canvas["edges"].as_array().into_iter().flatten() {
        if e.get("id").is_some() {
            put(json!({
                "id": e["id"], "type": "arrow", "customData": { "canvas": e },
                "startBinding": { "elementId": e["fromNode"] },
                "endBinding": { "elementId": e["toNode"] },
            }));
        }
    }
    for d in canvas["verso"]["drawing"].as_array().into_iter().flatten() {
        if d.is_object() {
            put(d.clone());
        }
    }
    out
}

/// `canvas`, a board file, as the player sees it: the secret pins and what
/// belongs to them left out, a card of a file they do not see a locked text
/// card. The text of every other node is whole.
#[must_use]
pub fn shape_canvas(canvas: &Value, lock: &dyn Fn(&str) -> Option<String>) -> Value {
    let sight = classes_of(&entries_of_canvas(canvas), lock);
    shape_canvas_seen(canvas, &sight, lock)
}

/// [`shape_canvas`] for a `sight` already made of `canvas`'s own entries
/// (`see(&entries_of_canvas(canvas), lock)`): the board is judged once.
#[must_use]
pub fn shape_canvas_seen(
    canvas: &Value,
    sight: &Sight,
    lock: &dyn Fn(&str) -> Option<String>,
) -> Value {
    let mut out = canvas.clone();
    let class = |v: &Value| {
        v.get("id")
            .and_then(Value::as_str)
            .map_or(Class::Gone, |id| {
                sight.class.get(id).copied().unwrap_or(Class::Gone)
            })
    };
    if let Some(nodes) = out["nodes"].as_array_mut() {
        let mut kept = Vec::new();
        for n in nodes.drain(..) {
            match class(&n) {
                Class::Gone => {}
                Class::Open => kept.push(n),
                Class::Locked => {
                    let text = n["file"].as_str().and_then(lock).unwrap_or_default();
                    kept.push(json!({
                        "id": n["id"], "type": "text",
                        "x": n["x"], "y": n["y"], "width": n["width"], "height": n["height"],
                        "text": text, "verso": { "locked": true },
                    }));
                }
            }
        }
        *nodes = kept;
    }
    if let Some(Value::Array(items)) = out.get_mut("edges") {
        items.retain(|v| class(v) == Class::Open);
    }
    if let Some(Value::Array(items)) = out.pointer_mut("/verso/drawing") {
        items.retain(|v| class(v) == Class::Open);
    }
    out
}

/// The text of the board file `whole` as a player who edits it is served it:
/// [`shape_canvas`], laid over the file in its own layout (every token that
/// did not change kept). Fails closed: a file that is not a canvas is served
/// as an empty one.
#[must_use]
pub fn shaped_text(whole: &str, lock: &dyn Fn(&str) -> Option<String>) -> String {
    use verso_core::canvas::Canvas;
    const EMPTY: &str = "{\"nodes\":[],\"edges\":[]}\n";
    let (Ok(canvas), Ok(value)) = (Canvas::parse(whole), serde_json::from_str::<Value>(whole))
    else {
        return EMPTY.to_owned();
    };
    laid_over(&canvas, &shape_canvas(&value, lock))
}

/// [`shaped_text`] for a canvas already shaped: `shaped` is
/// `shape_canvas(whole)` for the `lock` of the asker, the board judged once.
#[must_use]
pub fn shaped_text_from(whole: &str, shaped: &Value) -> String {
    match verso_core::canvas::Canvas::parse(whole) {
        Ok(canvas) => laid_over(&canvas, shaped),
        Err(_) => "{\"nodes\":[],\"edges\":[]}\n".to_owned(),
    }
}

fn laid_over(canvas: &verso_core::canvas::Canvas, shaped: &Value) -> String {
    match verso_core::canvas::Canvas::parse(&shaped.to_string()) {
        Ok(new) => canvas.merged(new.root).write(),
        Err(_) => "{\"nodes\":[],\"edges\":[]}\n".to_owned(),
    }
}

/// The revision a player who edits a board is told of the file: a hash of the
/// text they are shown, so that it moves only when what they see does (the
/// file's own moves with an edit of a secret pin).
#[must_use]
pub fn revision_of(shaped: &str) -> String {
    format!("v{}", crate::sync::sha256(shaped.as_bytes()))
}

/// Whether two elements of `canvas` share an id and one of them is not
/// open to the player: a locked card, a secret pin, or something that
/// touches one.
fn shared_id_hides(canvas: &Value, lock: &dyn Fn(&str) -> Option<String>) -> bool {
    let whole = classes_of(&entries_of_canvas(canvas), lock);
    let hidden: BTreeSet<&str> = whole
        .class
        .iter()
        .filter(|(_, c)| **c != Class::Open)
        .map(|(i, _)| i.as_str())
        .collect();
    let lists: [(&str, Vec<Value>); 3] = [
        (
            "nodes",
            canvas["nodes"].as_array().cloned().unwrap_or_default(),
        ),
        (
            "edges",
            canvas["edges"].as_array().cloned().unwrap_or_default(),
        ),
        (
            "drawing",
            canvas["verso"]["drawing"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
        ),
    ];
    for (kind, items) in lists {
        let mut count: BTreeMap<&str, usize> = BTreeMap::new();
        for v in &items {
            if let Some(i) = v.get("id").and_then(Value::as_str) {
                *count.entry(i).or_default() += 1;
            }
        }
        for v in &items {
            let Some(i) = v.get("id").and_then(Value::as_str) else {
                continue;
            };
            if count[i] < 2 {
                continue;
            }
            let wrapped = match kind {
                "nodes" => {
                    json!({ "id": v["id"], "type": "embeddable", "customData": { "canvas": v } })
                }
                "edges" => json!({
                    "id": v["id"], "type": "arrow", "customData": { "canvas": v },
                    "startBinding": { "elementId": v["fromNode"] },
                    "endBinding": { "elementId": v["toNode"] },
                }),
                _ => v.clone(),
            };
            let alone: Entries = [(format!("{i}\n0\n0"), wrapped.to_string())].into();
            let own = classes_of(&alone, lock);
            if hidden.contains(i)
                || own.class.get(i) != Some(&Class::Open)
                || refs(&wrapped).iter().any(|r| hidden.contains(r))
            {
                return true;
            }
        }
    }
    false
}

/// The board file a player's window made of its room, laid over the file as
/// it is on disk: what the player does not see is the disk's, whatever the
/// window sent; what they see is the window's; what the window dropped, they
/// deleted; what is new is appended. `None` when the result changes what
/// any element is to the player (a player's canvas never makes a pin, a
/// locked card, or hides one).
#[must_use]
pub fn lay_over(
    disk: &Value,
    player: &Value,
    lock: &dyn Fn(&str) -> Option<String>,
    sees_file: &dyn Fn(&str) -> bool,
) -> Option<Value> {
    if !disk.is_object() || !player.is_object() {
        return None;
    }
    // Matched by id: elements that share an id cannot be told apart, which
    // is harmless among what the player sees and not when one is hidden
    // from them (the player's could take its place).
    if shared_id_hides(disk, lock) {
        return None;
    }
    let before = classes_of(&entries_of_canvas(disk), lock);
    let mut out = disk.clone();
    let id = |v: &Value| v.get("id").and_then(Value::as_str).map(str::to_owned);
    let lists: [(&str, &str); 3] = [("nodes", ""), ("edges", ""), ("verso", "drawing")];
    for (top, inner) in lists {
        let theirs: Vec<Value> = if inner.is_empty() {
            player[top].as_array().cloned().unwrap_or_default()
        } else {
            player[top][inner].as_array().cloned().unwrap_or_default()
        };
        let mine: Vec<Value> = if inner.is_empty() {
            disk[top].as_array().cloned().unwrap_or_default()
        } else {
            disk[top][inner].as_array().cloned().unwrap_or_default()
        };
        let by_id: BTreeMap<String, &Value> = theirs
            .iter()
            .filter_map(|v| id(v).map(|i| (i, v)))
            .collect();
        let mut merged: Vec<Value> = Vec::new();
        let mut placed: BTreeSet<String> = BTreeSet::new();
        for v in &mine {
            let Some(i) = id(v) else {
                // Without an id it is nobody's to change.
                merged.push(v.clone());
                continue;
            };
            placed.insert(i.clone());
            match before.class.get(&i) {
                Some(Class::Open) | None => {
                    if let Some(t) = by_id.get(&i) {
                        merged.push((*t).clone());
                    }
                }
                Some(_) => merged.push(v.clone()),
            }
        }
        for v in &theirs {
            let Some(i) = id(v) else { continue };
            if !placed.contains(&i) && placed.insert(i.clone()) {
                merged.push(v.clone());
            }
        }
        if inner.is_empty() {
            out[top] = Value::Array(merged);
        } else {
            if !out[top].is_object() {
                out[top] = json!({});
            }
            out[top][inner] = Value::Array(merged);
        }
    }
    // The background is the window's to change; the rest of `verso` and of
    // the file is the disk's.
    match player["verso"].get("background") {
        Some(b) if out["verso"].is_object() => out["verso"]["background"] = b.clone(),
        None if out["verso"].is_object() => {
            if let Some(m) = out["verso"].as_object_mut() {
                m.remove("background");
            }
        }
        _ => {}
    }
    // The net: nothing the window sent changed what an element is to the
    // player, and a file card of theirs names a file they see.
    let after = classes_of(&entries_of_canvas(&out), lock);
    for (i, c) in &after.class {
        match before.class.get(i) {
            Some(was) if was != c => return None,
            None if *c != Class::Open => return None,
            _ => {}
        }
    }
    for n in out["nodes"].as_array().into_iter().flatten() {
        let Some(i) = id(n) else { continue };
        if before.class.get(&i).is_none_or(|c| *c == Class::Open)
            && let Some(f) = n.get("file").and_then(Value::as_str)
            && disk["nodes"].as_array().into_iter().flatten().all(|d| {
                d.get("id") != n.get("id") || d.get("file").and_then(Value::as_str) != Some(f)
            })
            && !sees_file(f)
        {
            return None;
        }
    }
    if after.shut != before.shut {
        return None;
    }
    Some(out)
}

/// One change to a room's entries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Op {
    Put(String, String),
    Del(String),
}

/// The keys of an element Excalidraw moves by itself, on load and on render,
/// without the person changing anything: they are no part of its substance.
/// Not the `index`: bringing an element to the front or back is a change.
const NOISE: [&str; 4] = ["version", "versionNonce", "updated", "seed"];

/// An element's JSON without its noise.
fn substance(json: &str) -> Option<Value> {
    let mut v: Value = serde_json::from_str(json).ok()?;
    let m = v.as_object_mut()?;
    for k in NOISE {
        m.remove(k);
    }
    Some(v)
}

/// The ids of the elements an edit only repeats: every entry the edit puts
/// for the id is, in substance, the *latest* one `known` holds for it (what
/// the room told the account, and what the window drew of the file when it
/// seeded). An older version is not it: going back to one is a change. An
/// echo changes nothing, so it is judged by nobody. Deleting an id is a
/// change, always.
#[must_use]
pub fn echoes(ops: &[Op], known: &Entries) -> BTreeSet<String> {
    let mut latest: BTreeMap<&str, (i64, i64, &str)> = BTreeMap::new();
    for (k, e) in known {
        if let Some((id, v, n)) = key_of(k)
            && latest.get(id).is_none_or(|(lv, ln, _)| (v, n) > (*lv, *ln))
        {
            latest.insert(id, (v, n, e));
        }
    }
    let mut put: BTreeMap<&str, bool> = BTreeMap::new();
    for op in ops {
        if let Op::Put(k, json) = op
            && let Some((id, _, _)) = key_of(k)
        {
            let same = latest.get(id).is_some_and(|(_, _, e)| {
                substance(json).is_some_and(|now| substance(e).is_some_and(|was| was == now))
            });
            let all = put.entry(id).or_insert(true);
            *all &= same;
        }
    }
    put.into_iter()
        .filter(|(_, all)| *all)
        .map(|(id, _)| id.to_owned())
        .collect()
}

/// An edit of a player's, judged against what they see of the room.
///
/// `room` is the room's entries as they are, `sight` what the player sees
/// of them, `disk` the classes of the file's own ids (the room may not hold
/// them all yet), `lock` as for [`see`], and `sees_file` whether the player
/// sees a file (it exists and is not hidden from them). The reason why not,
/// when it is refused.
pub fn check(
    ops: &[Op],
    room: &Entries,
    sight: &Sight,
    disk: &BTreeMap<String, Class>,
    lock: &dyn Fn(&str) -> Option<String>,
    sees_file: &dyn Fn(&str) -> bool,
) -> Result<(), &'static str> {
    const NOT_YOURS: &str = "an element you do not see";
    let unseen =
        |id: &str| sight.unseen(id) || matches!(disk.get(id), Some(Class::Locked | Class::Gone));
    let mut touched: BTreeSet<&str> = BTreeSet::new();
    let mut after = room.clone();
    for op in ops {
        let key = match op {
            Op::Put(k, _) | Op::Del(k) => k,
        };
        let Some((id, version, nonce)) = key_of(key) else {
            return Err("an entry that is no element's");
        };
        if unseen(id) {
            return Err(NOT_YOURS);
        }
        touched.insert(id);
        match op {
            Op::Put(k, json) => {
                let v: Value =
                    serde_json::from_str(json).map_err(|_| "an element that is no JSON")?;
                let same = |name: &str, want: i64| {
                    v.get(name)
                        .and_then(Value::as_f64)
                        .is_some_and(|x| (x - want as f64).abs() < 0.5)
                };
                if !v.is_object()
                    || v.get("id").and_then(Value::as_str) != Some(id)
                    || !same("version", version)
                    || !same("versionNonce", nonce)
                {
                    return Err("an element that is not its entry's");
                }
                if is_secret(&v) {
                    return Err("a secret pin is the game master's");
                }
                // A file card they make or change names a file they see.
                if let Some(f) = file_of(&v) {
                    let held = room.iter().any(|(k, e)| {
                        key_of(k).is_some_and(|(i, _, _)| i == id)
                            && serde_json::from_str::<Value>(e)
                                .ok()
                                .is_some_and(|e| file_of(&e) == Some(f))
                    });
                    if !held && !sees_file(f) {
                        return Err("a card of a file you do not see");
                    }
                }
                after.insert(k.clone(), json.clone());
            }
            Op::Del(k) => {
                after.remove(k);
            }
        }
    }
    // What it changes of what anything is to them: the touched elements
    // are open, nothing else moved, no group opened.
    let now = see(&after, lock);
    for (id, class) in &now.class {
        if touched.contains(id.as_str()) {
            if *class != Class::Open {
                return Err("an element they would not see");
            }
        } else if sight.class.get(id) != Some(class) {
            return Err("an element they would not see");
        }
    }
    if now.shut != sight.shut {
        return Err("a group that is not theirs");
    }
    Ok(())
}

#[cfg(test)]
#[path = "board_sight_tests.rs"]
mod tests;
