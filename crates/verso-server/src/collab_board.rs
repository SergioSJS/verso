// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board open in the windows of several people is a room too (ADR 0082
//! item 12, decided by the maintainer on 2026-10-12: "Deveria estar").
//! Its Yjs document holds the board's elements, as Excalidraw draws them,
//! in one map: an entry per element **and version**, keyed
//! `id\nversion\nversionNonce`, its value the element as JSON. Two windows
//! that change different elements both land; two that change the same one
//! leave two entries, and everyone reads the one Excalidraw's own
//! reconciliation keeps — the higher `version`, on a tie the lower
//! `versionNonce` — whatever order the edits arrived in. A deletion is the
//! element with `isDeleted` (a tombstone, at a higher version), so a move
//! made at the same time does not bring it back. A window that writes a
//! version removes the entries of that element it outranks.
//!
//! The server cannot draw a board, so it neither makes the elements from
//! the file nor the file from the elements: the first window to join draws
//! the file the room was made from (`meta.base`) and puts it in
//! (`meta.seeded`), and the windows that edit hand the room the file as
//! their own converter makes it of the room's state (`collab_canvas`),
//! with that state's vector. The room writes the one made of exactly the
//! state it holds — the bytes the converter makes of the merged scene —
//! through the core's board writer (ADR 0057 point 2), atomically and over
//! the revision it read (invariant 11). What a window adjusts by itself —
//! a text measured again once its font is in — goes into the room too, so
//! that every window keeps the same versions; only an edit of a person's
//! counts (`meta["edit:<client>"]`), so opening a board writes nothing
//! (invariant 7).

use std::collections::BTreeMap;

use verso_contract::ContractError;
use yrs::types::ToJson;
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{Doc, Map, ReadTxn, StateVector, Transact, Update};

/// The elements' map in the document, as the window's binding names it.
pub const ELEMENTS: &str = "elements";
/// The board's own facts: the file it was made from (`base`), whether a
/// window drew it in (`seeded`), its background, each window's count of
/// edits (`edit:<client>`), and the count written last (`saved`).
pub const META: &str = "meta";

/// The largest update taken in, decoded (threat-model.md, the board
/// room's limits): a paste of a large drawing fits; more is refused. A
/// note room shares it (ADR 0083 item 8), checked before decoding
/// (`crate::collab::update`).
pub const UPDATE_MOST: usize = 4 * 1024 * 1024;
/// The most element entries one update may put in.
pub const INSERTS_MOST: u32 = 10_000;
/// The most entries a board room holds, versions not yet outranked
/// included.
pub const ENTRIES_MOST: u32 = 100_000;
/// The most a board room's state may grow to, in bytes.
pub const ROOM_MOST: usize = 64 * 1024 * 1024;
/// The largest file a window may hand the room to write.
pub const CANVAS_MOST: usize = 16 * 1024 * 1024;
/// How many files made by windows the room keeps, newest last: one per
/// window that edits, at the state it last saw.
const CANVASES_KEPT: usize = 8;

/// A board room's own state, beside the document.
#[derive(Default)]
pub struct Board {
    /// The edits written last (`meta.saved`): the room holds edits not yet
    /// written exactly when the document's count differs from this one.
    pub saved: String,
    /// The files windows made of the room's state, with that state.
    canvases: Vec<(StateVector, String)>,
    /// What the room's state may have grown to since it was last measured.
    pub bytes: usize,
    /// The count of the edits of the windows that see the whole board, as
    /// they stood when the file was last written: while the room holds more,
    /// the file on disk lacks something of theirs (ADR 0113 H).
    pub whole_saved: String,
}

fn refused(message: &str) -> ContractError {
    ContractError {
        kind: verso_contract::ErrorKind::Refused,
        message: message.to_owned(),
    }
}

/// A new board room's document: the file it is made from, nothing drawn.
pub fn new_doc(base: &str) -> Doc {
    based(Doc::new(), base)
}

/// `doc` made a new board room's, of the file `base`.
pub(crate) fn based(doc: Doc, base: &str) -> Doc {
    {
        let meta = doc.get_or_insert_map(META);
        let mut txn = doc.transact_mut();
        meta.insert(&mut txn, "base", base);
        meta.insert(&mut txn, "saved", "");
    }
    doc
}

/// The count of the people's edits in `doc`: each window's entry, in order.
pub fn edits(doc: &Doc) -> String {
    let meta = doc.get_or_insert_map(META);
    let txn = doc.transact();
    let mut out: Vec<(String, String)> = meta
        .iter(&txn)
        .filter(|(k, _)| k.starts_with("edit:"))
        .map(|(k, v)| (k.to_owned(), v.to_string(&txn)))
        .collect();
    out.sort();
    out.iter()
        .map(|(k, v)| format!("{k}={v};"))
        .collect::<String>()
}

impl Board {
    /// A board room's state as it is made: nothing waits, its size the
    /// document's.
    pub fn of(doc: &Doc) -> Self {
        Self {
            saved: edits(doc),
            canvases: Vec::new(),
            bytes: doc
                .transact()
                .encode_state_as_update_v1(&StateVector::default())
                .len(),
            whole_saved: String::new(),
        }
    }

    /// A note room's size, the state of `doc` measured: a note keeps none
    /// of a board's own facts, only how large its room may have grown.
    pub fn measured(doc: &Doc) -> Self {
        Self {
            bytes: doc
                .transact()
                .encode_state_as_update_v1(&StateVector::default())
                .len(),
            ..Self::default()
        }
    }

    /// Whether the room holds edits not yet written.
    pub fn waiting(&self, doc: &Doc) -> bool {
        edits(doc) != self.saved
    }

    /// An update `bytes` may go in: its size, how many entries it puts in,
    /// and the room's size after it, within the limits.
    pub fn admits(&self, doc: &Doc, bytes: &[u8], update: &Update) -> Result<(), ContractError> {
        if bytes.len() > UPDATE_MOST {
            return Err(refused("a board update of 4 MB at most"));
        }
        let inserts: u32 = update
            .insertions(true)
            .iter()
            .map(|(_, ranges)| ranges.into_iter().map(|r| r.end - r.start).sum::<u32>())
            .sum();
        if inserts > INSERTS_MOST {
            return Err(refused("at most 10000 elements in one board update"));
        }
        let entries = {
            let map = doc.get_or_insert_map(ELEMENTS);
            map.len(&doc.transact())
        };
        if inserts > 0 && entries.saturating_add(inserts) > ENTRIES_MOST {
            return Err(refused(
                "a board edited together holds 100000 elements at most",
            ));
        }
        if self.bytes.saturating_add(bytes.len()) > ROOM_MOST {
            return Err(refused("a board edited together holds 64 MB at most"));
        }
        Ok(())
    }

    /// A window's file of the board at the state `at` (a Yjs state vector).
    pub fn keep(&mut self, at: &[u8], json: String) -> Result<(), ContractError> {
        if json.len() > CANVAS_MOST {
            return Err(refused("a board's file of 16 MB at most"));
        }
        crate::collab::readable_vector(at)?;
        let at = crate::collab::caught(|| StateVector::decode_v1(at))?
            .map_err(|_| refused("not a state vector"))?;
        self.canvases.retain(|(sv, _)| *sv != at);
        self.canvases.push((at, json));
        if self.canvases.len() > CANVASES_KEPT {
            self.canvases.remove(0);
        }
        Ok(())
    }

    /// The file a player's window made, laid over the disk's, kept for the
    /// state `doc` holds now.
    pub fn keep_now(&mut self, doc: &Doc, json: String) -> Result<(), ContractError> {
        if json.len() > CANVAS_MOST {
            return Err(refused("a board's file of 16 MB at most"));
        }
        let at = doc.transact().state_vector();
        self.canvases.retain(|(sv, _)| *sv != at);
        self.canvases.push((at, json));
        if self.canvases.len() > CANVASES_KEPT {
            self.canvases.remove(0);
        }
        Ok(())
    }

    /// The file a window made of exactly the state `doc` holds now.
    pub fn canvas_now(&self, doc: &Doc) -> Option<String> {
        let now = doc.transact().state_vector();
        self.canvases
            .iter()
            .rev()
            .find(|(sv, _)| *sv == now)
            .map(|(_, json)| json.clone())
    }

    /// Written: the count of edits it held is the one written, the files
    /// made of older states go, and the room's size is measured again.
    /// The update that tells the windows (`meta.saved`).
    pub fn written(&mut self, doc: &Doc) -> Vec<u8> {
        self.saved = edits(doc);
        self.canvases.clear();
        let meta = doc.get_or_insert_map(META);
        let update = {
            let mut txn = doc.transact_mut();
            meta.insert(&mut txn, "saved", self.saved.as_str());
            txn.encode_update_v1()
        };
        self.bytes = doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default())
            .len();
        update
    }

    /// Kept as the disk's choice made it: nothing waits.
    pub fn forget(&mut self, doc: &Doc) {
        self.saved = edits(doc);
        self.canvases.clear();
    }

    /// "Mine" chosen over the disk's: whatever the room holds is written.
    pub fn force(&mut self) {
        self.saved = "\u{0}".to_owned();
    }
}

/// An entry's key: the element's id, its version and its nonce.
pub(crate) fn parse_key(key: &str) -> Option<(&str, i64, i64)> {
    let mut parts = key.rsplitn(3, '\n');
    let nonce = parts.next()?.parse().ok()?;
    let version = parts.next()?.parse().ok()?;
    let id = parts.next()?;
    Some((id, version, nonce))
}

/// The board's elements as every window reads them: per element, the
/// entry of the higher version, on a tie the lower nonce (Excalidraw's
/// reconciliation), deleted ones included.
pub fn elements(doc: &Doc) -> BTreeMap<String, serde_json::Value> {
    let map = doc.get_or_insert_map(ELEMENTS);
    let txn = doc.transact();
    let mut best: BTreeMap<String, ((i64, i64), String)> = BTreeMap::new();
    for (key, value) in map.iter(&txn) {
        let Some((id, version, nonce)) = parse_key(key) else {
            continue;
        };
        let json = match value.to_json(&txn) {
            yrs::Any::String(s) => s.to_string(),
            _ => continue,
        };
        let rank = (version, -nonce);
        let better = best
            .get(id)
            .is_none_or(|(r, j)| rank > *r || (rank == *r && json < *j));
        if better {
            best.insert(id.to_owned(), (rank, json));
        }
    }
    best.into_iter()
        .filter_map(|(id, (_, json))| serde_json::from_str(&json).ok().map(|v| (id, v)))
        .collect()
}

/// The document's state vector, as a window sends its own with a file.
pub fn state_vector(doc: &Doc) -> Vec<u8> {
    doc.transact().state_vector().encode_v1()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A window's write of `element` at `version` and `nonce`: the entries
    /// of that element it outranks go.
    pub fn put(
        doc: &Doc,
        id: &str,
        version: i64,
        nonce: i64,
        element: &serde_json::Value,
    ) -> Vec<u8> {
        let map = doc.get_or_insert_map(ELEMENTS);
        let mut txn = doc.transact_mut();
        let lower: Vec<String> = map
            .keys(&txn)
            .filter(|k| {
                parse_key(k).is_some_and(|(i, v, n)| i == id && (v, -n) < (version, -nonce))
            })
            .map(str::to_owned)
            .collect();
        for k in lower {
            map.remove(&mut txn, &k);
        }
        let mut el = element.clone();
        el["id"] = serde_json::json!(id);
        el["version"] = serde_json::json!(version);
        el["versionNonce"] = serde_json::json!(nonce);
        map.insert(
            &mut txn,
            format!("{id}\n{version}\n{nonce}"),
            el.to_string(),
        );
        txn.encode_update_v1()
    }

    fn apply(doc: &Doc, update: &[u8]) {
        doc.transact_mut()
            .apply_update(Update::decode_v1(update).unwrap())
            .unwrap();
    }

    #[test]
    fn the_higher_version_wins_and_a_tie_goes_to_the_lower_nonce() {
        let base = new_doc("{}");
        let seed = put(&base, "a", 1, 0, &serde_json::json!({ "x": 0 }));
        let one = Doc::new();
        let two = Doc::new();
        apply(&one, &seed);
        apply(&two, &seed);
        // Both move the element at once: one to version 3, the other to 2.
        let u1 = put(&one, "a", 3, 70, &serde_json::json!({ "x": 30 }));
        let u2 = put(&two, "a", 2, 5, &serde_json::json!({ "x": 20 }));
        apply(&one, &u2);
        apply(&two, &u1);
        assert_eq!(elements(&one)["a"]["x"], 30);
        assert_eq!(elements(&two)["a"]["x"], 30);
        // A tie: the lower nonce, on both sides.
        let u1 = put(&one, "a", 4, 9, &serde_json::json!({ "x": 41 }));
        let u2 = put(&two, "a", 4, 2, &serde_json::json!({ "x": 42 }));
        apply(&one, &u2);
        apply(&two, &u1);
        assert_eq!(elements(&one)["a"]["x"], 42);
        assert_eq!(elements(&two)["a"]["x"], 42);
    }

    /// A window sends a deletion a million versions ahead (the window's
    /// `roomModel.ts`, `DELETE_JUMP`): a drag made meanwhile, forty frames
    /// and forty versions, does not bring the element back.
    #[test]
    fn a_deletion_is_not_undone_by_a_move_at_the_same_time() {
        let one = Doc::new();
        let seed = put(&one, "a", 1, 0, &serde_json::json!({ "x": 0 }));
        let two = Doc::new();
        apply(&two, &seed);
        let gone = put(
            &one,
            "a",
            2 + 1_000_000,
            1,
            &serde_json::json!({ "x": 0, "isDeleted": true }),
        );
        let moved = put(&two, "a", 41, 1, &serde_json::json!({ "x": 99 }));
        apply(&one, &moved);
        apply(&two, &gone);
        assert_eq!(elements(&one)["a"]["isDeleted"], true);
        assert_eq!(elements(&two)["a"]["isDeleted"], true);
    }

    #[test]
    fn a_board_room_keeps_its_limits() {
        let doc = new_doc("{}");
        let small = put(&Doc::new(), "a", 1, 0, &serde_json::json!({}));
        let update = Update::decode_v1(&small).unwrap();
        let mut board = Board::of(&doc);
        assert!(board.admits(&doc, &small, &update).is_ok());
        // Too large an update, and a room grown to its most.
        let big = vec![0_u8; UPDATE_MOST + 1];
        assert!(board.admits(&doc, &big, &update).is_err());
        board.bytes = ROOM_MOST;
        assert!(board.admits(&doc, &small, &update).is_err());
        // A file past its size.
        assert!(
            board
                .keep(&state_vector(&doc), "x".repeat(CANVAS_MOST + 1))
                .is_err()
        );
    }

    #[test]
    fn only_a_persons_edit_leaves_something_to_write() {
        let doc = new_doc("{}");
        let mut board = Board {
            saved: edits(&doc),
            ..Board::default()
        };
        // Drawn in by the first window: nothing to write.
        put(&doc, "a", 1, 0, &serde_json::json!({}));
        assert!(!board.waiting(&doc));
        {
            let meta = doc.get_or_insert_map(META);
            let mut txn = doc.transact_mut();
            meta.insert(&mut txn, "edit:7", 1);
        }
        assert!(board.waiting(&doc));
        // A file made of an older state is not the one written.
        let old = state_vector(&doc);
        put(&doc, "b", 1, 0, &serde_json::json!({}));
        board.keep(&old, "old".to_owned()).unwrap();
        assert_eq!(board.canvas_now(&doc), None);
        board.keep(&state_vector(&doc), "now".to_owned()).unwrap();
        assert_eq!(board.canvas_now(&doc).as_deref(), Some("now"));
        board.written(&doc);
        assert!(!board.waiting(&doc));
    }
}
