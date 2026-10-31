// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board a player edits: a room by element (ADR 0113 section H, step S7).
//!
//! The board's room holds every element, a secret pin's and a hidden
//! file's card among them, and a game master's window joins it as ever. A
//! player who may edit the board joins a *shadow* of it instead — a
//! document of its own, one per account, made of what the account sees of
//! the room (`board_sight.rs`): a card of a file they do not see is a
//! locked marker with the same id, a secret pin is not there. The shadow
//! follows the room each time the room changes, and the room follows the
//! shadow, element by element:
//!
//! - what the player does reaches the room only as entries of the elements
//!   it judges theirs (`board_sight::check`): an edit that touches an id
//!   they do not see, a locked marker or a secret pin, makes one, or changes
//!   what another element is to them, is refused whole, and nothing of it
//!   reaches the room;
//! - what the room does reaches the player only as the same projection —
//!   the snapshot at the join and every update after it are one function;
//! - the file the room writes is made by a window of the room's: when the
//!   game master's is in it, theirs; when only players are, the file a
//!   player's window made of its shadow is laid over the file on disk
//!   (`board_sight::lay_over`), so that what the player does not see is the
//!   disk's, byte for byte.
//!
//! When what an element is to a player changes — a pin made secret, a file
//! released or hidden — the shadow is made again: the player's windows are
//! told the room closed and join anew. A player's window never writes the
//! whole file of a board (`write_text`, `sync_put`), and is never asked to.

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::{CollabJoin, CollabKind, ContractError};
use verso_service::lock;
use yrs::types::ToJson;
use yrs::updates::decoder::Decode;
use yrs::{Any, Doc, Map, ReadTxn, StateVector, Transact};

use super::{Kind, Room, b64, event, refused, state};
use crate::board_sight::{self, Class, Entries, Op, Sight};
use crate::collab_board::{ELEMENTS, META};
use crate::scope::Scope;
use crate::share_board;
use crate::state::Server;

/// The board's own facts, as the shadow holds them.
type Meta = BTreeMap<String, Any>;

/// What a document holds, as maps.
type Held = (Entries, Meta);

/// One account's view of a board room.
pub struct Shadow {
    /// The account the shadow is of.
    account: String,
    /// The share the windows in it opened, when they opened one: the room
    /// holds the owner's paths, the shadow the share's (`share_board.rs`).
    scope: Option<Scope>,
    doc: Doc,
    epoch: String,
    /// The windows of the account in the shadow.
    clients: HashSet<String>,
    /// The Yjs clients each account writes as, in the shadow.
    writers: crate::writers::Writers,
    /// What the shadow's document holds now.
    now: Held,
    /// What the room last told it, the room's projection: an element of the
    /// player's own is in `now` and in the room, so in `told` too.
    told: Held,
    /// What the window drew of the file when it seeded the shadow: judged by
    /// nobody, never the room's, only what a later echo is compared to. It
    /// goes with the shadow (a rejoin makes the shadow anew).
    seeded: Entries,
    /// What the account sees of the room, as of the last change.
    sight: Sight,
    /// What the account sees of the file the room was made from: ids the
    /// room may not hold yet.
    disk: BTreeMap<String, Class>,
    /// The revision the account is told of the file: a hash of the file as
    /// it is shown them, never the file's own — that one moves when only
    /// what they do not see changes.
    rev: String,
}

/// The shadows of a room, by account.
#[derive(Default)]
pub struct Shadows {
    by: HashMap<String, Shadow>,
}

impl Shadows {
    pub fn is_empty(&self) -> bool {
        self.by.is_empty()
    }

    /// Whether `client` is in a shadow: it hears nothing of the room's own
    /// document.
    pub fn holds(&self, client: &str) -> bool {
        self.by.values().any(|s| s.clients.contains(client))
    }

    /// `client` left; a shadow no one is in goes.
    pub fn forget(&mut self, client: &str) {
        for s in self.by.values_mut() {
            s.clients.remove(client);
        }
        self.by.retain(|_, s| !s.clients.is_empty());
    }

    fn account_of(&self, client: &str) -> Option<String> {
        self.by
            .iter()
            .find(|(_, s)| s.clients.contains(client))
            .map(|(a, _)| a.clone())
    }
}

/// What a player is told of the files cards name, asked of the folder.
pub(crate) struct Locks<'a> {
    ws: RefCell<&'a mut verso_core::Workspace>,
    veil: &'a crate::campaign::Veil,
    /// A window of a share is told nothing of a file outside it: the card
    /// of one is locked, as one of a hidden file is.
    scope: Option<&'a Scope>,
    cache: RefCell<HashMap<String, Option<String>>>,
}

impl<'a> Locks<'a> {
    pub(crate) fn new(ws: &'a mut verso_core::Workspace, veil: &'a crate::campaign::Veil) -> Self {
        Self {
            ws: RefCell::new(ws),
            veil,
            scope: None,
            cache: RefCell::new(HashMap::new()),
        }
    }

    /// [`Locks::new`] for a window that opened `scope`, if it opened one.
    pub(crate) fn within(mut self, scope: Option<&'a Scope>) -> Self {
        self.scope = scope;
        self
    }

    fn outside(&self, file: &str) -> bool {
        self.scope.is_some_and(|s| s.to_rel(file).is_none())
    }

    /// The words of the locked card for `file`, when the account does not
    /// see it.
    pub(crate) fn text(&self, file: &str) -> Option<String> {
        if let Some(t) = self.cache.borrow().get(file) {
            return t.clone();
        }
        let mut ws = self.ws.borrow_mut();
        // One rule for the file a card names (`reached_exact`, ADR 0057):
        // one that is not there is the same to a player as one hidden from
        // them — a locked card, never an answer to "does it exist". So is
        // one outside the share the window opened.
        let reached = ws.reached_exact(file);
        let hidden = self.outside(file)
            || reached
                .as_ref()
                .is_none_or(|r| crate::campaign_serve::is_hidden_in(&mut ws, self.veil, r));
        // One text for every locked card, whatever the reason (hidden,
        // hidden with a secret name, not there): a card never says which.
        let told = hidden.then(|| crate::campaign_text::locked_card(&self.veil.lang));
        self.cache
            .borrow_mut()
            .insert(file.to_owned(), told.clone());
        told
    }

    /// Whether the account sees `file`: it is there and not hidden from it.
    /// A file that is not there is not one they see — a card of one is no
    /// way to ask whether a hidden file exists.
    fn sees(&self, file: &str) -> bool {
        if self.outside(file) {
            return false;
        }
        let mut ws = self.ws.borrow_mut();
        match ws.reached_exact(file) {
            Some(reached) => !crate::campaign_serve::is_hidden_in(&mut ws, self.veil, &reached),
            None => false,
        }
    }
}

/// What `doc` holds: the entries, and the facts of the board. `None` when
/// it holds anything else.
fn read_doc(doc: &Doc) -> Option<Held> {
    let elements = doc.get_or_insert_map(ELEMENTS);
    let meta = doc.get_or_insert_map(META);
    let txn = doc.transact();
    let mut entries = Entries::new();
    for (k, v) in elements.iter(&txn) {
        match v.to_json(&txn) {
            Any::String(s) => entries.insert(k.to_owned(), s.to_string()),
            _ => return None,
        };
    }
    let mut facts = Meta::new();
    for (k, v) in meta.iter(&txn) {
        facts.insert(k.to_owned(), v.to_json(&txn));
    }
    Some((entries, facts))
}

/// The update that makes `doc` hold `puts` and lack `dels`, if any.
fn apply_ops(
    doc: &Doc,
    entries: (&[(String, String)], &[String]),
    facts: &[(String, Any)],
) -> Option<Vec<u8>> {
    if entries.0.is_empty() && entries.1.is_empty() && facts.is_empty() {
        return None;
    }
    let elements = doc.get_or_insert_map(ELEMENTS);
    let meta = doc.get_or_insert_map(META);
    let mut txn = doc.transact_mut();
    for k in entries.1 {
        elements.remove(&mut txn, k);
    }
    for (k, v) in entries.0 {
        elements.insert(&mut txn, k.as_str(), v.as_str());
    }
    for (k, v) in facts {
        meta.insert(&mut txn, k.as_str(), v.clone());
    }
    Some(txn.encode_update_v1())
}

/// An element's JSON as the projection serialises it.
fn normalized(json: &str) -> String {
    serde_json::from_str::<Value>(json).map_or_else(|_| json.to_owned(), |v| v.to_string())
}

/// The id an entry's key names.
fn key_id(key: &str) -> Option<&str> {
    crate::collab_board::parse_key(key).map(|(i, _, _)| i)
}

/// A copy of `doc`, to try an update on.
fn copy_of(doc: &Doc) -> Result<Doc, ContractError> {
    let copy = Doc::new();
    let bytes = super::caught(|| {
        doc.transact()
            .encode_state_as_update_v1(&StateVector::default())
    })?;
    let update = super::decode(&bytes)?;
    let applied = super::caught(|| copy.transact_mut().apply_update(update).is_ok())?;
    if !applied {
        return Err(refused(super::BROKEN));
    }
    Ok(copy)
}

/// The facts of the room a shadow is told: that the file was drawn in and its
/// background, nothing else. Not the edits of the others — their count tells
/// when something nobody shows the account changed — nor what was saved: that
/// one is made for the account (`saved_for`).
fn told_facts(room: &Meta) -> Meta {
    room.iter()
        .filter(|(k, _)| matches!(k.as_str(), "seeded" | "background"))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect()
}

/// The count of the edits in `facts`, as `collab_board::edits` counts them.
fn edits_in(facts: &Meta) -> String {
    facts
        .iter()
        .filter(|(k, _)| k.starts_with("edit:"))
        .map(|(k, v)| format!("{k}={v};"))
        .collect()
}

/// The `saved` a shadow is told: the count of its own edits when nothing waits
/// in the room, what it was told before while something does.
fn saved_for(waiting: bool, now: &Meta, told: &Meta) -> Option<Any> {
    let was = told.get("saved");
    if waiting {
        return was.is_none().then(|| Any::String(String::new().into()));
    }
    let own = edits_in(now);
    (was != Some(&Any::String(own.clone().into()))).then(|| Any::String(own.into()))
}

/// The classes of the ids a canvas file holds, for `locks`.
fn disk_classes(
    base: &str,
    lock: &dyn Fn(&str) -> Option<String>,
) -> (Value, BTreeMap<String, Class>) {
    let canvas: Value = serde_json::from_str(base)
        .ok()
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({ "nodes": [], "edges": [] }));
    let sight = board_sight::classes_of(&board_sight::entries_of_canvas(&canvas), lock);
    let shaped = board_sight::shape_canvas_seen(&canvas, &sight, lock);
    (shaped, sight.class)
}

/// Every string under a `file` key in `json`, wherever it is: the names a
/// card may name. More than the cards' is harmless (each is only asked of
/// the folder); fewer would lock the card.
fn file_names_in(json: &str, out: &mut BTreeSet<String>) {
    fn walk(v: &Value, out: &mut BTreeSet<String>) {
        match v {
            Value::Object(m) => {
                for (k, x) in m {
                    match (k.as_str(), x) {
                        ("file", Value::String(s)) => {
                            out.insert(s.clone());
                        }
                        _ => walk(x, out),
                    }
                }
            }
            Value::Array(a) => a.iter().for_each(|x| walk(x, out)),
            _ => {}
        }
    }
    if let Ok(v) = serde_json::from_str::<Value>(json) {
        walk(&v, out);
    }
}

/// The key a shadow is kept under: the account, and the share it opened if
/// it opened one — one account may be in the board through the whole folder
/// and through a share, and the two see the paths of the room differently.
fn shadow_key(account: &str, scope: Option<&Scope>) -> String {
    match scope {
        Some(s) => format!("{account}\u{0}{}", s.share),
        None => account.to_owned(),
    }
}

/// What the room holds of `sight`, the elements told as the share's window
/// knows them: the card of a file's path re-rooted at the share.
fn rooted_at(scope: Option<&Scope>, sight: &mut Sight) {
    let Some(scope) = scope else { return };
    sight.shown = std::mem::take(&mut sight.shown)
        .into_iter()
        .filter_map(|(k, v)| share_board::element_out(scope, &v).map(|v| (k, v)))
        .collect();
}

/// A shadow of `r` for `account`, made of what it sees now.
fn make(
    server: &Server,
    r: &Room,
    account: &str,
    scope: Option<&Scope>,
) -> Result<Shadow, ContractError> {
    let veil = crate::campaign::veil_for_key(server, &r.key)
        .ok_or_else(|| refused("this board is not at a table"))?
        .view(account);
    let Some((entries, facts)) = read_doc(&r.doc) else {
        return Err(refused(super::BROKEN));
    };
    let base = match facts.get("base") {
        Some(Any::String(s)) => s.to_string(),
        _ => String::new(),
    };
    let path = r.path.clone();
    let (file, told_files, plain_files) = server.service.with_key(&r.key, |ws| {
        let file = ws.read_text(&path)?;
        // What the account is told of each file a card names, asked of the
        // folder here, under its lock — the one thing that needs it. The
        // judging of the board itself (parsing, classing, shaping: CPU that
        // grows with the board) is done after, so that a read or a join of
        // another note is never held behind it.
        let mut names = BTreeSet::new();
        for json in entries.values() {
            file_names_in(json, &mut names);
        }
        file_names_in(&base, &mut names);
        if base != file.text {
            file_names_in(&file.text, &mut names);
        }
        let told: HashMap<String, Option<String>> = {
            let locks = Locks::new(ws, &veil).within(scope);
            names
                .into_iter()
                .map(|n| {
                    let t = locks.text(&n);
                    (n, t)
                })
                .collect()
        };
        // The file's revision is that of the file as a window of the whole
        // folder is served it (`campaign_serve`): the share a window
        // opened does not change it.
        let plain = {
            let mut own = BTreeSet::new();
            file_names_in(&file.text, &mut own);
            let locks = Locks::new(ws, &veil);
            own.into_iter()
                .map(|n| {
                    let t = locks.text(&n);
                    (n, t)
                })
                .collect::<HashMap<_, _>>()
        };
        Ok((file, told, plain))
    })?;
    // A name not asked above is locked: nothing is said by guessing.
    let lock = |f: &str| match told_files.get(f) {
        Some(t) => t.clone(),
        None => Some(crate::campaign_text::locked_card(&veil.lang)),
    };
    let mut sight = board_sight::see(&entries, &lock);
    let (mut shaped, disk) = disk_classes(&base, &lock);
    let plain = |f: &str| match plain_files.get(f) {
        Some(t) => t.clone(),
        None => Some(crate::campaign_text::locked_card(&veil.lang)),
    };
    // The room's base is nearly always the file as it is: when it is, and
    // the window opened no share (so `lock` and `plain` tell the same of
    // every name), the board was just judged and is not judged again.
    let same = scope.is_none()
        && (base == file.text
            || matches!((serde_json::from_str::<Value>(&base), serde_json::from_str::<Value>(&file.text)),
                (Ok(a), Ok(b)) if a.is_object() && a == b));
    let shown = if same {
        board_sight::shaped_text_from(&file.text, &shaped)
    } else {
        board_sight::shaped_text(&file.text, &plain)
    };
    if let Some(scope) = scope {
        share_board::canvas_out(
            scope,
            &mut shaped,
            &crate::campaign_text::locked_card(&veil.lang),
        );
    }
    rooted_at(scope, &mut sight);
    let rev = board_sight::revision_of(&shown);
    let mut told = told_facts(&facts);
    told.insert("saved".to_owned(), Any::String(String::new().into()));
    told.insert("base".to_owned(), Any::String(shaped.to_string().into()));
    // What the window reads to know it is in a shadow (boardRoom.ts).
    told.insert("shadow".to_owned(), Any::Bool(true));
    let doc = Doc::new();
    let puts: Vec<(String, String)> = sight
        .shown
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let facts_put: Vec<(String, Any)> = told.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    apply_ops(&doc, (&puts, &[]), &facts_put);
    let epoch = crate::crypto::id().map_err(verso_service::failed)?;
    Ok(Shadow {
        account: account.to_owned(),
        scope: scope.cloned(),
        doc,
        epoch,
        clients: HashSet::new(),
        writers: crate::writers::Writers::new(),
        now: (sight.shown.clone(), told.clone()),
        told: (sight.shown.clone(), told),
        seeded: Entries::new(),
        sight,
        disk,
        rev,
    })
}

/// A player who may edit the board at `path` joins the shadow of its room:
/// the elements they see, a locked marker for a card of a file they do not,
/// no secret pin (ADR 0113 section H; `collab_players.rs`).
pub fn join_shadow(
    server: &Arc<Server>,
    who: (&str, &str),
    key: &str,
    path: &str,
    user: &str,
    scope: Option<&Scope>,
) -> Result<CollabJoin, ContractError> {
    match shadow_room(server, who, key, path, user, scope) {
        Err(e) if e.message == super::BROKEN => {
            super::reload(server, key, path, "its state could not be made");
            shadow_room(server, who, key, path, user, scope)
        }
        joined => joined,
    }
}

fn shadow_room(
    server: &Arc<Server>,
    (client, account): (&str, &str),
    key: &str,
    path: &str,
    user: &str,
    scope: Option<&Scope>,
) -> Result<CollabJoin, ContractError> {
    if server.rooms.joined_elsewhere(client, key, path) >= super::JOINED_MOST {
        return Err(refused(&format!(
            "a window is in {} shared notes at most at once: close one first",
            super::JOINED_MOST
        )));
    }
    let Some(room) = super::room_for(server, key, path)? else {
        return Err(refused("not a board"));
    };
    let mut r = lock(&room);
    // Asked again under the room's lock, as `join_room` does.
    match super::readers::admitted(server, (client, false), key, path) {
        Ok(false) => {}
        other => {
            drop(r);
            super::leave(server, client, key, path);
            return Err(other.err().unwrap_or_else(|| {
                refused("you may only read this board: you see it as it is saved")
            }));
        }
    }
    join(server, &mut r, (client, account), user, scope)
}

/// `client`, a player of `account` who may edit the board, joins the
/// shadow of the room `r`.
pub(super) fn join(
    server: &Server,
    r: &mut Room,
    (client, account): (&str, &str),
    user: &str,
    scope: Option<&Scope>,
) -> Result<CollabJoin, ContractError> {
    let at = shadow_key(account, scope);
    // A window that joins again, alone in its shadow (after a refusal, or a
    // dropped link), gets the room's state as it is now, projected for the
    // account anew when its shadow drifted from the room (what it drew when
    // it seeded, the versions it only echoed): none of that is carried over.
    // A shadow other windows are in, or that did not drift, stays.
    let alone = r.readers.players.by.get(&at).is_some_and(|sh| {
        sh.clients.iter().all(|c| c == client) && (!sh.seeded.is_empty() || sh.now.0 != sh.told.0)
    });
    if alone {
        r.readers.players.by.remove(&at);
    }
    if !r.readers.players.by.contains_key(&at) {
        let shadow = make(server, r, account, scope)?;
        r.readers.players.by.insert(at.clone(), shadow);
    }
    let Some(sh) = r.readers.players.by.get_mut(&at) else {
        return Err(refused(super::BROKEN));
    };
    sh.clients.insert(client.to_owned());
    r.clients.insert(client.to_owned());
    Ok(CollabJoin {
        kind: CollabKind::Board,
        update: b64(&state(&sh.doc, Kind::Board)?),
        revision: sh.rev.clone(),
        read_only: false,
        crlf: false,
        user: user.to_owned(),
        epoch: sh.epoch.clone(),
        rolls: r.rolls.iter().cloned().collect(),
    })
}

/// The room's change, told to every shadow: what each account sees of it
/// differently now goes to its windows as an update of its shadow. A shadow
/// for which an element became another thing (a pin made secret, a file
/// hidden) is closed: its windows read the board again and join anew.
pub(super) fn sync(server: &Server, r: &mut Room) {
    refresh(server, r, false);
}

/// [`sync`], and — when the table's rules changed (`fresh`) — the file's own
/// ids judged anew: a shadow whose file's cards are other things now is closed.
pub(super) fn refresh(server: &Server, r: &mut Room, fresh: bool) {
    if r.readers.players.is_empty() {
        return;
    }
    let Some(veil) = crate::campaign::veil_for_key(server, &r.key) else {
        return;
    };
    let Some((entries, facts)) = read_doc(&r.doc) else {
        crate::log::warn("a board room's shadows could not read it");
        return;
    };
    let accounts: Vec<(String, String, Option<Scope>)> = r
        .readers
        .players
        .by
        .iter()
        .map(|(k, sh)| (k.clone(), sh.account.clone(), sh.scope.clone()))
        .collect();
    let base = match facts.get("base") {
        Some(Any::String(s)) => s.to_string(),
        _ => String::new(),
    };
    let sights = server.service.with_key(&r.key, |ws| {
        let mut out = Vec::new();
        for (at, a, scope) in &accounts {
            let v = veil.view(a);
            let locks = Locks::new(ws, &v).within(scope.as_ref());
            let mut sight = board_sight::see(&entries, &|f| locks.text(f));
            rooted_at(scope.as_ref(), &mut sight);
            let disk = fresh.then(|| disk_classes(&base, &|f| locks.text(f)));
            out.push((at.clone(), sight, disk));
        }
        Ok(out)
    });
    let Ok(sights) = sights else {
        return;
    };
    let mut closed: Vec<String> = Vec::new();
    let waiting = r.board.waiting(&r.doc);
    for (account, sight, disk) in sights {
        let Some(sh) = r.readers.players.by.get_mut(&account) else {
            continue;
        };
        let moved = sh
            .sight
            .class
            .iter()
            .any(|(id, c)| sight.class.get(id).is_some_and(|n| n != c))
            || disk.as_ref().is_some_and(|(_, d)| *d != sh.disk);
        if moved {
            closed.extend(sh.clients.iter().cloned());
            r.readers.players.by.remove(&account);
            continue;
        }
        let puts: Vec<(String, String)> = sight
            .shown
            .iter()
            .filter(|(k, v)| sh.told.0.get(*k) != Some(*v))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        let dels: Vec<String> = sh
            .told
            .0
            .keys()
            .filter(|k| !sight.shown.contains_key(*k))
            .cloned()
            .collect();
        let mut facts_put: Vec<(String, Any)> = told_facts(&facts)
            .into_iter()
            .filter(|(k, v)| sh.told.1.get(k) != Some(v))
            .collect();
        facts_put
            .extend(saved_for(waiting, &sh.now.1, &sh.told.1).map(|v| ("saved".to_owned(), v)));
        for (k, v) in &puts {
            sh.told.0.insert(k.clone(), v.clone());
            sh.now.0.insert(k.clone(), v.clone());
        }
        for k in &dels {
            sh.told.0.remove(k);
            sh.now.0.remove(k);
        }
        for (k, v) in &facts_put {
            sh.told.1.insert(k.clone(), v.clone());
            sh.now.1.insert(k.clone(), v.clone());
        }
        sh.sight = sight;
        if let Some(bytes) = apply_ops(&sh.doc, (&puts, &dels), &facts_put) {
            let to: Vec<String> = sh.clients.iter().cloned().collect();
            server.push(
                &to,
                &event("collab-update", &r.path, "update", &json!(b64(&bytes))),
            );
        }
    }
    close(server, r, &closed);
}

/// The room wrote its file: each shadow's windows are told it was saved — with
/// the revision of the file as the account is shown it, and only when that
/// moved: a save of what they do not see is none to them.
pub(super) fn saved(server: &Server, r: &mut Room) {
    if r.readers.players.is_empty() {
        return;
    }
    let Some(veil) = crate::campaign::veil_for_key(server, &r.key) else {
        return;
    };
    let accounts: Vec<(String, String, Option<Scope>)> = r
        .readers
        .players
        .by
        .iter()
        .map(|(k, sh)| (k.clone(), sh.account.clone(), sh.scope.clone()))
        .collect();
    let path = r.path.clone();
    let revs = server.service.with_key(&r.key, |ws| {
        let file = ws.read_text(&path)?;
        let mut out = Vec::new();
        for (at, a, _) in &accounts {
            let v = veil.view(a);
            let locks = Locks::new(ws, &v);
            let shown = board_sight::shaped_text(&file.text, &|f| locks.text(f));
            out.push((at.clone(), board_sight::revision_of(&shown)));
        }
        Ok(out)
    });
    for (account, rev) in revs.unwrap_or_default() {
        let Some(sh) = r.readers.players.by.get_mut(&account) else {
            continue;
        };
        if sh.rev == rev {
            continue;
        }
        sh.rev.clone_from(&rev);
        let to: Vec<String> = sh.clients.iter().cloned().collect();
        server.push(
            &to,
            &event("collab-saved", &r.path, "revision", &json!(rev)),
        );
    }
}

/// `clients`, windows of shadows, told the room closed: out of it.
pub(super) fn close(server: &Server, r: &mut Room, clients: &[String]) {
    if clients.is_empty() {
        return;
    }
    for c in clients {
        r.clients.remove(c);
        r.readers.forget(c);
    }
    server.push(
        clients,
        &event("collab-closed", &r.path, "revision", &json!(null)),
    );
}

/// A share changed (its folder moved, its paths narrowed) or went: the
/// shadows made with the share as it was are closed, so that their windows
/// join anew with the share as it is — a shadow never keeps an old root.
pub(crate) fn share_moved(server: &Server, share: &str, now: &dyn Fn(&str) -> Option<Scope>) {
    let rooms: Vec<_> = lock(&server.rooms.map).values().map(Arc::clone).collect();
    // The share as each account has it now is asked first, with no room
    // locked: that reads the database and the folder.
    let mut accounts: BTreeSet<String> = BTreeSet::new();
    for room in &rooms {
        let r = lock(room);
        for sh in r.readers.players.by.values() {
            if sh.scope.as_ref().is_some_and(|s| s.share == share) {
                accounts.insert(sh.account.clone());
            }
        }
    }
    let fresh: HashMap<String, Option<Scope>> = accounts
        .into_iter()
        .map(|a| {
            let s = now(&a);
            (a, s)
        })
        .collect();
    for room in rooms {
        let mut r = lock(&room);
        // Each shadow is judged against the share as its own account has it.
        let stale = |sh: &Shadow| {
            sh.scope.as_ref().is_some_and(|s| {
                s.share == share && fresh.get(&sh.account).and_then(Option::as_ref) != Some(s)
            })
        };
        let clients: Vec<String> = r
            .readers
            .players
            .by
            .values()
            .filter(|sh| stale(sh))
            .flat_map(|sh| sh.clients.iter().cloned())
            .collect();
        r.readers.players.by.retain(|_, sh| !stale(sh));
        close(server, &mut r, &clients);
    }
}

/// What the table lets an account see changed (a release, a hide, a level):
/// the shadows that see the room otherwise now are closed, the others follow.
pub(super) fn veil_changed(server: &Server, r: &mut Room) {
    refresh(server, r, true);
}

/// The facts of the board a player may change: their count of edits and
/// the background; the first time, also that the file was drawn in.
fn fact_ok(k: &str, v: &Any, seeding: bool) -> bool {
    match k {
        "seeded" => seeding && matches!(v, Any::Bool(true)),
        "background" => matches!(v, Any::String(_)),
        _ => k.starts_with("edit:") && matches!(v, Any::Number(_)),
    }
}

/// An update from `client`, a window in a shadow: judged, taken into the
/// shadow, and — what is the player's to change — into the room. Whether
/// the room changed.
pub(super) fn update(
    server: &Server,
    r: &mut Room,
    (client, account): (&str, &str),
    bytes: &[u8],
) -> Result<bool, ContractError> {
    let decoded = super::decode(bytes)?;
    let who = crate::writers::Writer {
        connection: client,
        account,
    };
    let room_held = read_doc(&r.doc).ok_or_else(|| refused(super::BROKEN))?;
    let veil = crate::campaign::veil_for_key(server, &r.key)
        .ok_or_else(|| refused("this board is not at a table"))?
        .view(account);
    let Some(shadow) = r.readers.players.account_of(client) else {
        return Err(refused("join the board first"));
    };
    let Some(sh) = r.readers.players.by.get_mut(&shadow) else {
        return Err(refused("join the board first"));
    };
    let scope = sh.scope.clone();
    let clients =
        super::caught(|| crate::writers::judged(&sh.doc, &decoded, who, &sh.writers, &sh.clients))?
            .map_err(|why| refused(&why))?;
    if super::caught(|| super::ahead_of_room(&sh.doc, &decoded))? {
        return Err(refused("an update the room cannot read"));
    }
    r.board.admits(&sh.doc, bytes, &decoded)?;
    // Tried on a copy: nothing of an update refused stays in the shadow.
    let scratch = copy_of(&sh.doc)?;
    let tried = super::decode(bytes)?;
    if !matches!(
        super::caught(|| super::integrate(&scratch, tried))?,
        Ok(true)
    ) {
        return Err(refused(super::BROKEN));
    }
    let after = read_doc(&scratch).ok_or_else(|| refused("an element that is no JSON"))?;
    // What the update changed of the shadow.
    let puts: Vec<(String, String)> = after
        .0
        .iter()
        .filter(|(k, v)| sh.now.0.get(*k) != Some(*v))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let dels: Vec<String> = sh
        .now
        .0
        .keys()
        .filter(|k| !after.0.contains_key(*k))
        .cloned()
        .collect();
    let facts_put: Vec<(String, Any)> = after
        .1
        .iter()
        .filter(|(k, v)| sh.now.1.get(*k) != Some(*v))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if sh.now.1.keys().any(|k| !after.1.contains_key(k)) {
        return Err(refused("the facts of the board are not yours to remove"));
    }
    let seeding = !sh.now.1.contains_key("seeded") && after.1.contains_key("seeded");
    for (k, v) in &facts_put {
        if !fact_ok(k, v, seeding) {
            return Err(refused("a fact of the board that is not yours to change"));
        }
    }
    let all_ops: Vec<Op> = puts
        .iter()
        .map(|(k, v)| Op::Put(k.clone(), v.clone()))
        .chain(dels.iter().map(|k| Op::Del(k.clone())))
        .collect();
    // An element sent again as it already is, in substance, is no change
    // (Excalidraw bumps versions on load and render): never judged, never
    // refused, and not the room's either — it is already what it holds.
    let echoed = if seeding {
        BTreeSet::new()
    } else {
        // What the room told the account, and what the window drew of the
        // file when it seeded — not the shadow's whole document, which also
        // holds versions the room never had.
        let mut known = sh.told.0.clone();
        known.extend(sh.seeded.iter().map(|(k, v)| (k.clone(), v.clone())));
        board_sight::echoes(&all_ops, &known)
    };
    let is_echo = |k: &str| key_id(k).is_some_and(|i| echoed.contains(i));
    let puts: Vec<(String, String)> = puts.into_iter().filter(|(k, _)| !is_echo(k)).collect();
    let dels: Vec<String> = dels.into_iter().filter(|k| !is_echo(k)).collect();
    let ops: Vec<Op> = all_ops
        .into_iter()
        .filter(|o| match o {
            Op::Put(k, _) | Op::Del(k) => !is_echo(k),
        })
        .collect();
    // What the room is given of it: the share's paths joined to the share's
    // (`share_board.rs`), so that an edit can name nothing outside it.
    let (puts_room, ops_room) = match (&scope, seeding) {
        (Some(sc), false) => {
            let rooted = |v: &str| share_board::element_in(sc, v);
            let puts = puts
                .iter()
                .map(|(k, v)| rooted(v).map(|v| (k.clone(), v)))
                .collect::<Result<Vec<_>, _>>()?;
            let ops = ops
                .iter()
                .map(|o| match o {
                    Op::Put(k, v) => rooted(v).map(|v| Op::Put(k.clone(), v)),
                    Op::Del(k) => Ok(Op::Del(k.clone())),
                })
                .collect::<Result<Vec<_>, _>>()?;
            (puts, ops)
        }
        _ => (puts.clone(), ops.clone()),
    };
    // The first update of a window that draws the board in is the file's
    // own elements, made of the projection: it goes into the shadow only.
    if !seeding {
        let judged = server.service.with_key(&r.key, |ws| {
            let locks = Locks::new(ws, &veil).within(scope.as_ref());
            Ok(board_sight::check(
                &ops_room,
                &room_held.0,
                &sh.sight,
                &sh.disk,
                &|f| locks.text(f),
                &|f| locks.sees(f),
            ))
        })?;
        if let Err(why) = judged {
            crate::log::warn(&format!(
                "board room {}: an edit from account {account} refused: {why}",
                r.path
            ));
            return Err(refused(why));
        }
    }
    // Taken: into the shadow, and — the player's own — into the room.
    let taken = super::decode(bytes)?;
    if !matches!(
        super::caught(|| super::integrate(&sh.doc, taken))?,
        Ok(true)
    ) {
        return Err(refused(super::BROKEN));
    }
    sh.now = after;
    crate::writers::claim(who, &clients, &mut sh.writers, &sh.clients);
    let others: Vec<String> = sh
        .clients
        .iter()
        .filter(|c| c.as_str() != client)
        .cloned()
        .collect();
    server.push(
        &others,
        &event("collab-update", &r.path, "update", &json!(b64(bytes))),
    );
    if seeding {
        sh.seeded.extend(puts.iter().cloned());
        return Ok(false);
    }
    // Kept as the projection writes an element (keys sorted, as `see`
    // serialises it), not as the window did: the next projection of the
    // same element is then the same text, and is not sent back to its own
    // window.
    for (k, v) in &puts {
        let v = normalized(v);
        sh.now.0.insert(k.clone(), v.clone());
        sh.told.0.insert(k.clone(), v);
    }
    for k in &dels {
        sh.told.0.remove(k);
    }
    for (k, v) in &facts_put {
        sh.told.1.insert(k.clone(), v.clone());
    }
    if !r.authors.iter().any(|a| a == account) {
        r.authors.push(account.to_owned());
    }
    let Some(main) = apply_ops(&r.doc, (&puts_room, &dels), &facts_put) else {
        return Ok(false);
    };
    r.board.bytes = r.board.bytes.saturating_add(main.len());
    let to: Vec<String> = r
        .clients
        .iter()
        .filter(|c| !r.readers.players.holds(c))
        .cloned()
        .collect();
    server.push(
        &to,
        &event("collab-update", &r.path, "update", &json!(b64(&main))),
    );
    // The other shadows hear it as they see it.
    sync(server, r);
    Ok(true)
}

/// A presence `stamped` from `sender` told to the windows in shadows, the
/// selection each shows cut to the elements its account sees: the id of an
/// element a player does not see is never told them, not even as a
/// selection.
pub(super) fn presence(server: &Server, r: &Room, sender: &str, stamped: &[u8]) {
    for sh in r.readers.players.by.values() {
        let to: Vec<String> = sh
            .clients
            .iter()
            .filter(|c| c.as_str() != sender)
            .cloned()
            .collect();
        if to.is_empty() {
            continue;
        }
        let Ok(cut) = crate::presence::for_player(stamped, &|id| {
            matches!(sh.sight.class.get(id), Some(Class::Open | Class::Locked))
        }) else {
            continue;
        };
        server.push(
            &to,
            &event("collab-awareness", &r.path, "update", &json!(b64(&cut))),
        );
    }
}

/// Whether the window `client` may type in the folder: its role and its
/// credential write.
fn types(server: &Server, client: &str) -> bool {
    let table = lock(&server.clients);
    table.get(client).is_some_and(|c| {
        let a = crate::access::asker_of(c);
        a.cap == crate::access::Cap::Write && a.role.is_some_and(|r| r.writes())
    })
}

/// The count of the edits of the windows that wrote into the room itself —
/// the ones that see the whole board — as `collab_board::edits` counts them.
pub(super) fn whole_edits(doc: &Doc, writers: &crate::writers::Writers) -> String {
    let own: HashSet<String> = writers
        .keys()
        .map(|c| format!("edit:{}", c.get()))
        .collect();
    let Some((_, facts)) = read_doc(doc) else {
        return String::new();
    };
    facts
        .iter()
        .filter(|(k, _)| own.contains(*k))
        .map(|(k, v)| format!("{k}={v};"))
        .collect()
}

/// The file a window in a shadow made of it, at the state `at`, kept for
/// the room to write: laid over the file as it is on disk, and only when
/// no window that sees the whole board is in the room to make it itself.
pub(super) fn canvas(
    server: &Server,
    r: &mut Room,
    client: &str,
    at: &[u8],
    json: &str,
) -> Result<(), ContractError> {
    let Some(account) = r.readers.players.account_of(client) else {
        return Err(refused("join the board first"));
    };
    // A window that sees the whole board and may type makes the file of it
    // itself. One that only reads (a phone as a reader) never will.
    if r.clients
        .iter()
        .any(|c| !r.readers.players.holds(c) && types(server, c))
    {
        return Ok(());
    }
    // The room holds edits of the whole board's windows that the file lacks
    // (one left before its file was kept): laid over the disk's, theirs would
    // be lost. The players' stay in the room, and the file is written when a
    // window that sees the whole board makes it.
    if whole_edits(&r.doc, &r.writers) != r.board.whole_saved {
        crate::log::warn(&format!(
            "board room {}: a file made by account {account} waits: the room holds edits of a window that sees the whole board that the file lacks",
            r.path
        ));
        return Ok(());
    }
    super::readable_vector(at)?;
    let at =
        super::caught(|| StateVector::decode_v1(at))?.map_err(|_| refused("not a state vector"))?;
    let Some(sh) = r.readers.players.by.get(&account) else {
        return Ok(());
    };
    let account = sh.account.clone();
    if sh.doc.transact().state_vector() != at {
        return Ok(());
    }
    if json.len() > crate::collab_board::CANVAS_MOST {
        return Err(refused("a board's file of 16 MB at most"));
    }
    let Ok(mut theirs) = serde_json::from_str::<Value>(json) else {
        return Ok(());
    };
    let scope = sh.scope.clone();
    if let Some(sc) = &scope {
        share_board::canvas_in(sc, &mut theirs)?;
    }
    let disk = super::read(server, &r.key, &r.path)?;
    if disk.revision != r.revision {
        crate::log::warn(&format!(
            "board room {}: a file made by account {account} waits: the file changed on disk since the room read it",
            r.path
        ));
        return Ok(());
    }
    let Ok(mine) = serde_json::from_str::<Value>(&disk.text) else {
        return Ok(());
    };
    let Some(veil) = crate::campaign::veil_for_key(server, &r.key) else {
        return Ok(());
    };
    let veil = veil.view(&account);
    let laid = server.service.with_key(&r.key, |ws| {
        let locks = Locks::new(ws, &veil).within(scope.as_ref());
        Ok(board_sight::lay_over(
            &mine,
            &theirs,
            &|f| locks.text(f),
            &|f| locks.sees(f),
        ))
    })?;
    match laid {
        Some(file) => r.board.keep_now(&r.doc, file.to_string()),
        None => {
            crate::log::warn(&format!(
                "board room {}: a file made by account {account} was not taken: it changes what an element is to them",
                r.path
            ));
            // Said to the window, which shows it as a refusal of the room
            // (`boardRoom.ts`): never a save that did not happen in silence.
            Err(refused(
                "the file of this board could not be made from your window: an element of it is not yours to change",
            ))
        }
    }
}
