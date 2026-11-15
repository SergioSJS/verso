// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a player is shown of a board's room, and what they may change of it
//! (ADR 0113 section H). Two properties, in the manner of ADR 0087's — a
//! canary in everything hidden, found nowhere a player hears —, over rooms
//! made at random:
//!
//! 1. **no hidden id or text reaches a player**: of what the player does not
//!    see, nothing they are shown holds its id, its text or its file;
//! 2. **an update to an id not seen is refused**: any edit that puts or
//!    removes an entry of an element the player does not see, makes a secret
//!    pin or a locked card, or changes what another element is to them.

use serde_json::{Value, json};

use super::*;

const LOCKED_WORDS: &str = "🔒 (not revealed yet)";

/// A deterministic source of numbers.
struct Dice(u64);

impl Dice {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n as u64)).unwrap_or(0)
    }
    fn one_in(&mut self, n: usize) -> bool {
        self.below(n) == 0
    }
}

fn hides_file(f: &str) -> Option<String> {
    f.starts_with("Cripta").then(|| LOCKED_WORDS.to_owned())
}

fn sees_file(f: &str) -> bool {
    f.starts_with("Livre") && f.ends_with(".md")
}

fn entry(v: &Value) -> (String, String) {
    let id = v["id"].as_str().unwrap();
    let ver = v["version"].as_i64().unwrap_or(1);
    let nonce = v["versionNonce"].as_i64().unwrap_or(7);
    (format!("{id}\n{ver}\n{nonce}"), v.to_string())
}

fn card(id: &str, file: &str) -> Value {
    json!({ "id": id, "type": "embeddable", "x": 10, "y": 20, "width": 100, "height": 50,
        "version": 3, "versionNonce": 9, "index": "a1", "isDeleted": false,
        "strokeColor": "#ff0000", "link": "https://verso.invalid/board-node",
        "customData": { "canvas": { "id": id, "type": "file", "file": file, "color": "1" } } })
}

fn text_card(id: &str, text: &str, secret: bool) -> Value {
    let mut canvas = json!({ "id": id, "type": "text", "text": text });
    if secret {
        canvas["verso"] = json!({ "secret": true });
    }
    json!({ "id": id, "type": "embeddable", "x": 0, "y": 0, "width": 10, "height": 10,
        "version": 2, "versionNonce": 5, "index": "a2", "isDeleted": false,
        "customData": { "canvas": canvas } })
}

fn edge(id: &str, from: &str, to: &str) -> Value {
    json!({ "id": id, "type": "arrow", "x": 0, "y": 0, "width": 5, "height": 5,
        "version": 4, "versionNonce": 3, "index": "a3", "isDeleted": false,
        "startBinding": { "elementId": from }, "endBinding": { "elementId": to },
        "customData": { "canvas": { "id": id, "fromNode": from, "toNode": to } } })
}

fn room(items: &[Value]) -> Entries {
    items.iter().map(entry).collect()
}

fn none(_: &str) -> Option<String> {
    None
}

#[test]
fn a_card_of_a_file_not_seen_is_a_marker_with_the_same_id_and_nothing_else() {
    let r = room(&[card("c1", "Cripta Zq.md"), card("c2", "Livre.md")]);
    let s = see(&r, &hides_file);
    assert_eq!(s.class["c1"], Class::Locked);
    assert_eq!(s.class["c2"], Class::Open);
    let m: Value = serde_json::from_str(&s.shown["c1\n3\n9"]).unwrap();
    assert_eq!(m["id"], "c1");
    assert_eq!(
        (m["x"].as_i64(), m["width"].as_i64()),
        (Some(10), Some(100))
    );
    assert_eq!(m["locked"], true);
    assert_eq!(m["customData"]["canvas"]["type"], "text");
    assert_eq!(m["customData"]["canvas"]["text"], LOCKED_WORDS);
    let all = s.shown["c1\n3\n9"].as_str();
    for leak in ["Cripta", "file", "#ff0000", "\"color\""] {
        assert!(!all.contains(leak), "{leak} in {all}");
    }
    // The card of a file they see is the element as it is.
    assert_eq!(s.shown["c2\n3\n9"], r["c2\n3\n9"]);
}

#[test]
fn a_secret_pin_is_not_there_nor_what_belongs_to_it() {
    let pin = text_card("pin", "zqpintext", true);
    let other = text_card("other", "visible", false);
    let drawn = json!({ "id": "arrow", "type": "arrow", "version": 1, "versionNonce": 1,
        "startBinding": { "elementId": "pin" }, "endBinding": null, "boundElements": [{ "id": "arrow-label", "type": "text" }] });
    let label = json!({ "id": "arrow-label", "type": "text", "text": "zqlabel", "containerId": "arrow", "version": 1, "versionNonce": 1 });
    let mut near = other.clone();
    near["boundElements"] =
        json!([{ "id": "e1", "type": "arrow" }, { "id": "e2", "type": "arrow" }]);
    let r = room(&[
        pin,
        near,
        edge("e1", "pin", "other"),
        edge("e2", "other", "other"),
        drawn,
        label,
    ]);
    let s = see(&r, &none);
    for gone in ["pin", "e1", "arrow", "arrow-label"] {
        assert_eq!(s.class[gone], Class::Gone, "{gone}");
    }
    assert_eq!(s.class["other"], Class::Open);
    assert_eq!(s.class["e2"], Class::Open);
    let all: String = s.shown.values().cloned().collect();
    for leak in ["pin", "zqpintext", "\"e1\"", "arrow-label", "zqlabel"] {
        assert!(!all.contains(leak), "{leak} in {all}");
    }
    // The card keeps its own edge listed, not the hidden one.
    let o: Value = serde_json::from_str(&s.shown["other\n2\n5"]).unwrap();
    assert_eq!(o["boundElements"], json!([{ "id": "e2", "type": "arrow" }]));
}

#[test]
fn a_group_only_secret_pins_carry_hides_its_members_and_one_shared_with_a_card_does_not() {
    let mut pin = text_card("pin", "x", true);
    pin["customData"]["canvas"]["verso"]["groups"] = json!(["g-secret", "g-map"]);
    let mut map = text_card("map", "m", false);
    map["customData"]["canvas"]["verso"]["groups"] = json!(["g-map"]);
    let mut under = json!({ "id": "d1", "type": "rectangle", "version": 1, "versionNonce": 1, "groupIds": ["g-secret"] });
    let mut shared = json!({ "id": "d2", "type": "rectangle", "version": 1, "versionNonce": 1, "groupIds": ["g-map"] });
    under["x"] = json!(1);
    shared["x"] = json!(2);
    let s = see(&room(&[pin, map, under, shared]), &none);
    assert_eq!(s.class["d1"], Class::Gone);
    assert_eq!(s.class["d2"], Class::Open);
    assert!(s.shut.contains("g-secret") && !s.shut.contains("g-map"));
}

#[test]
fn an_entry_that_is_not_its_keys_element_is_not_shown() {
    let mut r = room(&[text_card("a", "fine", false)]);
    r.insert("b\n1\n1".to_owned(), "not json zqbad".to_owned());
    r.insert("c\n1\n1".to_owned(), json!({ "id": "other" }).to_string());
    r.insert("no-key".to_owned(), "{}".to_owned());
    let s = see(&r, &none);
    assert_eq!(s.class["b"], Class::Gone);
    assert_eq!(s.class["c"], Class::Gone);
    assert!(
        !s.shown
            .keys()
            .any(|k| k.starts_with('b') || k.starts_with('c') || k == "no-key")
    );
}

#[test]
fn a_flag_written_twice_counts_as_the_file_reads_it() {
    // `JSON.parse` keeps the last `verso`; the file's projection counts every
    // one, and so does the room's.
    let mut r = room(&[text_card("ok", "x", false)]);
    r.insert(
        "pin\n1\n1".to_owned(),
        r#"{"id":"pin","customData":{"canvas":{"id":"pin","type":"text","verso":{"secret":true},"verso":{}}}}"#.to_owned(),
    );
    r.insert(
        "pin2\n1\n1".to_owned(),
        r#"{"id":"pin2","customData":{"canvas":{"id":"pin2"}, "canvas":{"id":"pin2","verso":{"secret":"yes"}, "verso":{"secret":false}}}}"#.to_owned(),
    );
    let s = see(&r, &none);
    assert_eq!(s.class["pin"], Class::Gone);
    assert_eq!(s.class["pin2"], Class::Gone);
    assert_eq!(s.class["ok"], Class::Open);
}

#[test]
fn a_flag_that_is_not_understood_counts_as_set() {
    let mut pin = text_card("pin", "x", false);
    pin["customData"]["canvas"]["verso"] = json!({ "secret": "yes" });
    let mut not = text_card("not", "x", false);
    not["customData"]["canvas"]["verso"] = json!({ "secret": false });
    let s = see(&room(&[pin, not]), &none);
    assert_eq!(s.class["pin"], Class::Gone);
    assert_eq!(s.class["not"], Class::Open);
}

#[test]
fn the_file_of_a_board_is_shaped_the_same_way() {
    let canvas = json!({
        "nodes": [
            { "id": "n1", "type": "file", "file": "Cripta Zq.md", "x": 1, "y": 2, "width": 3, "height": 4, "color": "2" },
            { "id": "n2", "type": "text", "text": "> [!secret] kept\n> seen by who edits", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "pin", "type": "text", "text": "zqpin", "verso": { "secret": true }, "x": 0, "y": 0, "width": 1, "height": 1 },
        ],
        "edges": [ { "id": "e1", "fromNode": "n2", "toNode": "pin" }, { "id": "e2", "fromNode": "n1", "toNode": "n2" } ],
        "verso": { "version": 1, "drawing": [ { "id": "d1", "type": "arrow", "startBinding": { "elementId": "pin" } }, { "id": "d2", "type": "rectangle" } ] },
    });
    let shaped = shape_canvas(&canvas, &hides_file);
    let ids = |v: &Value| {
        v.as_array()
            .unwrap()
            .iter()
            .map(|x| x["id"].as_str().unwrap().to_owned())
            .collect::<Vec<_>>()
    };
    assert_eq!(ids(&shaped["nodes"]), ["n1", "n2"]);
    assert_eq!(shaped["nodes"][0]["type"], "text");
    assert_eq!(shaped["nodes"][0]["text"], LOCKED_WORDS);
    assert!(shaped["nodes"][0].get("file").is_none());
    // The board draws it locked: nothing of it is selected, moved or sent.
    assert_eq!(shaped["nodes"][0]["verso"]["locked"], true);
    assert!(
        shaped["nodes"][1]["text"]
            .as_str()
            .unwrap()
            .contains("[!secret] kept")
    );
    assert_eq!(ids(&shaped["edges"]), ["e2"]);
    assert_eq!(ids(&shaped["verso"]["drawing"]), ["d2"]);
    assert!(!shaped.to_string().contains("zqpin"));
}

/// A dungeon as the import of 0.9.0-beta.2 drew it: the floor, the secret
/// door as a dashed line of stroke 3 (unmarked), a stroke marked secret,
/// all in the drawing's one group; its walls under `verso`, and keys Verso
/// does not know.
fn dungeon() -> Value {
    json!({
        "nodes": [ { "id": "n1", "type": "text", "text": "sala", "x": 0, "y": 0, "width": 1, "height": 1 } ],
        "edges": [],
        "zqtop": { "plan": 1 },
        "verso": { "version": 1, "background": "#fdf6e3", "zqverso": 2,
            "drawing": [
                { "id": "floor", "type": "rectangle", "groupIds": ["wb-dungeon"], "strokeStyle": "solid", "strokeWidth": 1 },
                { "id": "zqdoor", "type": "line", "groupIds": ["wb-dungeon"], "strokeStyle": "dashed", "strokeWidth": 3 },
                { "id": "zqmarked", "type": "line", "groupIds": ["wb-dungeon"], "customData": { "verso": { "secret": true } } },
                { "id": "zqlabel", "type": "text", "text": "zqlabeltext", "containerId": "zqmarked" },
            ],
            "walls": { "version": 1, "doors": [ { "kind": "secret", "zqwall": true } ] } },
    })
}

const DUNGEON_LEAKS: [&str; 7] = [
    "zqtop", "zqverso", "zqwall", "walls", "zqdoor", "zqmarked", "zqlabel",
];

#[test]
fn a_player_is_served_only_the_keys_of_a_board_a_reader_is() {
    let shaped = shape_canvas(&dungeon(), &none);
    let text = shaped.to_string();
    for leak in DUNGEON_LEAKS {
        assert!(!text.contains(leak), "{leak} reached a player: {text}");
    }
    let drawn: Vec<&str> = shaped["verso"]["drawing"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|d| d["id"].as_str())
        .collect();
    // The floor is grouped with the secret door and stays: a secret stroke
    // hides itself, not the strokes it moves with.
    assert_eq!(drawn, ["floor"]);
    assert_eq!(shaped["verso"]["background"], "#fdf6e3");
    assert_eq!(shaped["verso"]["version"], 1);
    assert_eq!(shaped["nodes"][0]["id"], "n1");
    // The text in the file's own layout says the same.
    let laid = shaped_text(&dungeon().to_string(), &none);
    for leak in DUNGEON_LEAKS {
        assert!(!laid.contains(leak), "{leak} in the text: {laid}");
    }
    // A `verso` that is no object is not served either.
    let odd = shape_canvas(&json!({ "nodes": [], "verso": "zqodd" }), &none);
    assert!(odd.get("verso").is_none(), "{odd}");
}

#[test]
fn the_secret_door_in_a_room_is_gone_and_its_group_stays_open() {
    let mut items: Vec<Value> = dungeon()["verso"]["drawing"].as_array().unwrap().clone();
    items.push(card("c1", "Livre.md"));
    let s = see(&room(&items), &none);
    assert_eq!(s.class["floor"], Class::Open);
    for id in ["zqdoor", "zqmarked", "zqlabel"] {
        assert_eq!(s.class[id], Class::Gone, "{id}");
    }
    assert!(s.shut.is_empty(), "{:?}", s.shut);
    let shown: String = s.shown.values().cloned().collect();
    for leak in ["zqdoor", "zqmarked", "zqlabel"] {
        assert!(!shown.contains(leak), "{leak}: {shown}");
    }
    // A player does not draw one, nor change the floor into one.
    let mut door = items[1].clone();
    door["id"] = json!("mine");
    door["version"] = json!(1);
    door["versionNonce"] = json!(7);
    let (k, v) = entry(&door);
    let disk = BTreeMap::new();
    assert!(
        check(
            &[Op::Put(k, v)],
            &room(&items),
            &s,
            &disk,
            &none,
            &sees_file
        )
        .is_err()
    );
}

#[test]
fn a_players_canvas_never_writes_over_what_they_do_not_see() {
    let disk = json!({
        "nodes": [
            { "id": "n1", "type": "file", "file": "Cripta Zq.md", "x": 1, "y": 2, "width": 3, "height": 4 },
            { "id": "n2", "type": "text", "text": "old", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "pin", "type": "text", "text": "zqpin", "verso": { "secret": true }, "x": 5, "y": 5, "width": 1, "height": 1 },
            { "id": "n3", "type": "file", "file": "Livre.md", "x": 0, "y": 0, "width": 1, "height": 1 },
        ],
        "edges": [ { "id": "e1", "fromNode": "n2", "toNode": "pin" } ],
        "verso": { "version": 1, "drawing": [] },
    });
    // What her window made of her room: the marker where the card is, her
    // text changed, her card deleted, a card new.
    let hers = json!({
        "nodes": [
            { "id": "n1", "type": "text", "text": LOCKED_WORDS, "x": 99, "y": 99, "width": 3, "height": 4 },
            { "id": "n2", "type": "text", "text": "new", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "n4", "type": "text", "text": "hers", "x": 7, "y": 7, "width": 1, "height": 1 },
        ],
        "edges": [],
        "verso": { "version": 1, "drawing": [], "background": "#eeeeee" },
    });
    let out = lay_over(&disk, &hers, &hides_file, &sees_file).expect("laid over");
    let ids = |v: &Value| {
        v.as_array()
            .unwrap()
            .iter()
            .map(|x| x["id"].as_str().unwrap().to_owned())
            .collect::<Vec<_>>()
    };
    assert_eq!(ids(&out["nodes"]), ["n1", "n2", "pin", "n4"]);
    // The hidden are the disk's, byte for byte.
    assert_eq!(out["nodes"][0], disk["nodes"][0]);
    assert_eq!(out["nodes"][2], disk["nodes"][2]);
    assert_eq!(out["edges"], disk["edges"]);
    assert_eq!(out["nodes"][1]["text"], "new");
    assert_eq!(out["verso"]["background"], "#eeeeee");
    // A canvas that makes a pin, a card of a file she does not see, or one of
    // a file that is not there is none.
    for bad in [
        json!({ "id": "x", "type": "text", "text": "p", "verso": { "secret": true } }),
        json!({ "id": "x", "type": "file", "file": "Cripta Zq.md" }),
        json!({ "id": "x", "type": "file", "file": "Nada.md" }),
    ] {
        let mut mine = hers.clone();
        mine["nodes"].as_array_mut().unwrap().push(bad);
        assert!(lay_over(&disk, &mine, &hides_file, &sees_file).is_none());
    }
}

// ---- the two properties ----

/// A room made at random, and what the construction says a player must not
/// hear: every hidden element's tokens.
struct Made {
    entries: Entries,
    /// Ids of what is Gone, and the words only they carry.
    gone: Vec<(String, String)>,
    /// Locked cards: id, and the words and path only they carry.
    locked: Vec<(String, String)>,
    open: Vec<String>,
}

fn made(d: &mut Dice) -> Made {
    let mut items: Vec<Value> = Vec::new();
    let (mut gone, mut locked, mut open) = (Vec::new(), Vec::new(), Vec::new());
    let mut pins: Vec<String> = Vec::new();
    let mut cards: Vec<String> = Vec::new();
    for i in 0..(3 + d.below(20)) {
        match d.below(4) {
            0 => {
                let id = format!("pin-{i}");
                let mut c = text_card(&id, &format!("zqtext{i} secret pin"), true);
                if d.one_in(2) {
                    c["customData"]["canvas"]["verso"]["groups"] = json!([format!("gs{i}")]);
                    items.push(json!({ "id": format!("dg-{i}"), "type": "rectangle", "version": 1, "versionNonce": 1,
                        "groupIds": [format!("gs{i}")], "text": format!("zqgroup{i}") }));
                    gone.push((format!("dg-{i}"), format!("zqgroup{i}")));
                }
                gone.push((id.clone(), format!("zqtext{i}")));
                pins.push(id);
                items.push(c);
            }
            1 => {
                let id = format!("lock-{i}");
                items.push(card(&id, &format!("Cripta zqfile{i}.md")));
                locked.push((id.clone(), format!("zqfile{i}")));
                cards.push(id);
            }
            2 => {
                let id = format!("open-{i}");
                items.push(card(&id, &format!("Livre{i}.md")));
                open.push(id.clone());
                cards.push(id);
            }
            _ => {
                let id = format!("note-{i}");
                items.push(text_card(&id, &format!("palavra{i}"), false));
                open.push(id.clone());
                cards.push(id);
            }
        }
    }
    // Edges, and drawn arrows bound to the pins, with their labels.
    for (i, pin) in pins.iter().enumerate() {
        if let Some(c) = cards.get(d.below(cards.len().max(1))) {
            let id = format!("ed-{i}");
            items.push(edge(&id, c, pin));
            gone.push((id.clone(), id.to_string()));
            let lab = format!("lab-{i}");
            items.push(json!({ "id": lab, "type": "text", "text": format!("zqlabel{i}"), "containerId": id, "version": 1, "versionNonce": 1 }));
            gone.push((lab, format!("zqlabel{i}")));
        }
        items.push(
            json!({ "id": format!("ar-{i}"), "type": "arrow", "version": 1, "versionNonce": 1,
            "endBinding": { "elementId": pin }, "text": format!("zqarrow{i}") }),
        );
        gone.push((format!("ar-{i}"), format!("zqarrow{i}")));
    }
    // A card lists, among its bound elements, every edge to a pin.
    for it in &mut items {
        let Some(id) = it["id"].as_str().map(str::to_owned) else {
            continue;
        };
        let ends: Vec<Value> = gone
            .iter()
            .filter(|(g, _)| g.starts_with("ed-"))
            .map(|(g, _)| json!({ "id": g, "type": "arrow" }))
            .collect();
        if cards.contains(&id) {
            it["boundElements"] = Value::Array(ends);
        }
    }
    // The hidden edges bind to a card at one end; that card is not hidden.
    let entries = room(&items);
    Made {
        entries,
        gone,
        locked,
        open,
    }
}

#[test]
fn no_hidden_id_or_text_reaches_a_player() {
    for seed in 1..400_u64 {
        let mut d = Dice(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
        let m = made(&mut d);
        let s = see(&m.entries, &hides_file);
        let heard: String = s
            .shown
            .keys()
            .chain(s.shown.values())
            .cloned()
            .collect::<Vec<_>>()
            .join("\u{1}");
        for (id, words) in &m.gone {
            assert_eq!(s.class[id], Class::Gone, "seed {seed}: {id}");
            assert!(
                !heard.contains(id.as_str()),
                "seed {seed}: the id {id} reached a player"
            );
            assert!(
                !heard.contains(words.as_str()),
                "seed {seed}: {words} reached a player"
            );
        }
        for (id, tokens) in &m.locked {
            assert_eq!(s.class[id], Class::Locked, "seed {seed}: {id}");
            assert!(
                !heard.contains(tokens.as_str()),
                "seed {seed}: {tokens} reached a player"
            );
            assert!(
                heard.contains(id.as_str()),
                "seed {seed}: the marker keeps the id"
            );
        }
        for id in &m.open {
            assert_eq!(s.class[id], Class::Open, "seed {seed}: {id}");
        }
    }
}

#[test]
fn an_update_to_an_id_not_seen_is_refused() {
    let mut refused_at_least = 0;
    for seed in 1..400_u64 {
        let mut d = Dice(seed.wrapping_mul(0xC2B2_AE3D_27D4_EB4F) | 1);
        let m = made(&mut d);
        let s = see(&m.entries, &hides_file);
        let hidden: Vec<&String> = m
            .gone
            .iter()
            .map(|(i, _)| i)
            .chain(m.locked.iter().map(|(i, _)| i))
            .collect();
        let disk = BTreeMap::new();
        // An element of theirs changed: accepted.
        for id in m.open.iter().take(3) {
            let key = m
                .entries
                .keys()
                .find(|k| k.starts_with(&format!("{id}\n")))
                .unwrap()
                .clone();
            let mut v: Value = serde_json::from_str(&m.entries[&key]).unwrap();
            v["version"] = json!(10);
            v["versionNonce"] = json!(11);
            v["x"] = json!(500);
            let ops = [
                Op::Put(format!("{id}\n10\n11"), v.to_string()),
                Op::Del(key),
            ];
            assert_eq!(
                check(&ops, &m.entries, &s, &disk, &hides_file, &sees_file),
                Ok(()),
                "seed {seed}: {id}"
            );
        }
        // A new one: accepted.
        let new =
            json!({ "id": "brand-new", "type": "rectangle", "version": 1, "versionNonce": 2 });
        let ops = [Op::Put("brand-new\n1\n2".to_owned(), new.to_string())];
        assert_eq!(
            check(&ops, &m.entries, &s, &disk, &hides_file, &sees_file),
            Ok(())
        );
        // Any change to what they do not see: refused, whatever it is.
        for id in hidden {
            let key = m
                .entries
                .keys()
                .find(|k| k.starts_with(&format!("{id}\n")))
                .unwrap()
                .clone();
            let mut v: Value = serde_json::from_str(&m.entries[&key]).unwrap();
            v["version"] = json!(99);
            v["versionNonce"] = json!(98);
            for ops in [
                vec![Op::Del(key.clone())],
                vec![Op::Put(format!("{id}\n99\n98"), v.to_string())],
                vec![
                    Op::Put(format!("{id}\n99\n98"), v.to_string()),
                    Op::Del(key.clone()),
                ],
            ] {
                assert!(
                    check(&ops, &m.entries, &s, &disk, &hides_file, &sees_file).is_err(),
                    "seed {seed}: {id} was touched"
                );
                refused_at_least += 1;
            }
            // Mixed with a change of their own, the whole edit is refused.
            if let Some(mine) = m.open.first() {
                let own =
                    json!({ "id": mine, "type": "rectangle", "version": 50, "versionNonce": 51 });
                let ops = [
                    Op::Put(format!("{mine}\n50\n51"), own.to_string()),
                    Op::Del(key),
                ];
                assert!(check(&ops, &m.entries, &s, &disk, &hides_file, &sees_file).is_err());
            }
        }
        // What the room does not hold yet but the file does (a disk id).
        let mut disk = BTreeMap::new();
        disk.insert("on-disk-only".to_owned(), Class::Gone);
        let ops = [Op::Put(
            "on-disk-only\n1\n1".to_owned(),
            json!({ "id": "on-disk-only", "version": 1, "versionNonce": 1 }).to_string(),
        )];
        assert!(check(&ops, &m.entries, &s, &disk, &hides_file, &sees_file).is_err());
    }
    assert!(refused_at_least > 1000);
}

#[test]
fn an_edit_that_makes_a_pin_a_locked_card_or_opens_a_group_is_refused() {
    let mut pin = text_card("pin", "zq", true);
    pin["customData"]["canvas"]["verso"]["groups"] = json!(["gs"]);
    let hid = json!({ "id": "d1", "type": "rectangle", "version": 1, "versionNonce": 1, "groupIds": ["gs"] });
    let r = room(&[pin, hid, text_card("a", "ok", false)]);
    let s = see(&r, &hides_file);
    let d = BTreeMap::new();
    let go = |v: Value| {
        let id = v["id"].as_str().unwrap().to_owned();
        let k = format!("{id}\n{}\n{}", v["version"], v["versionNonce"]);
        check(
            &[Op::Put(k, v.to_string())],
            &r,
            &s,
            &d,
            &hides_file,
            &sees_file,
        )
    };
    let base = |id: &str| json!({ "id": id, "type": "rectangle", "version": 1, "versionNonce": 3 });
    // A pin of theirs.
    let mut p = text_card("n1", "x", true);
    p["version"] = json!(1);
    p["versionNonce"] = json!(3);
    assert!(go(p).is_err());
    // A card of a file they do not see, or of one that is not there.
    for f in ["Cripta Zq.md", "Nada.md"] {
        let mut c = card("n2", f);
        c["version"] = json!(1);
        c["versionNonce"] = json!(3);
        assert!(go(c).is_err(), "{f}");
    }
    // An element naming the pin, or in its group.
    let mut e = base("n3");
    e["startBinding"] = json!({ "elementId": "pin" });
    assert!(go(e).is_err());
    let mut e = base("n4");
    e["groupIds"] = json!(["gs"]);
    assert!(go(e).is_err());
    // A card that opens the secret group: the elements it hid come back.
    let mut opens = text_card("n5", "x", false);
    opens["version"] = json!(1);
    opens["versionNonce"] = json!(3);
    opens["customData"]["canvas"]["verso"] = json!({ "groups": ["gs"] });
    assert!(go(opens).is_err());
    // A key that says one thing and an element that says another.
    let ops = [Op::Put("n6\n1\n3".to_owned(), base("other").to_string())];
    assert!(check(&ops, &r, &s, &d, &hides_file, &sees_file).is_err());
    let mut off = base("n7");
    off["version"] = json!(2);
    let ops = [Op::Put("n7\n1\n3".to_owned(), off.to_string())];
    assert!(check(&ops, &r, &s, &d, &hides_file, &sees_file).is_err());
}

/// The rule, not the incident: an element sent again as it is, whatever
/// version noise Excalidraw put on it, is an echo; nothing else is.
#[test]
fn any_echo_of_what_the_player_holds_is_no_change_and_a_real_change_is() {
    // The maintainer's board: cards to paths that are not there, a card of
    // a file hidden, a card of one they see, a marker's twin.
    let items = [
        card("c1", "Lugares/Taverna do Corvo.md"),
        card("c2", "Fichas/Ficha da Ana — Lyra.md"),
        card("c3", "Cripta Zq.md"),
        card("c4", "Livre 1.md"),
        text_card("t1", "hello", false),
    ];
    let held = room(&items);
    let mut dice = Dice(0x9E37_79B9_7F4A_7C15);
    for _ in 0..200 {
        let mut ops = Vec::new();
        for v in &items {
            if dice.one_in(2) {
                continue;
            }
            let mut e = v.clone();
            e["version"] = json!(dice.below(50) + 4);
            e["versionNonce"] = json!(dice.below(10_000));
            e["seed"] = json!(dice.below(1000));
            e["updated"] = json!(dice.below(1_000_000));
            let (k, j) = entry(&e);
            ops.push(Op::Put(k, j));
        }
        let want: BTreeSet<String> = ops
            .iter()
            .filter_map(|o| match o {
                Op::Put(k, _) => key_of(k).map(|(i, _, _)| i.to_owned()),
                Op::Del(_) => None,
            })
            .collect();
        assert_eq!(echoes(&ops, &held), want);
    }
    // Bringing a card to the front (its z-order) is a change, judged.
    let mut front = card("c4", "Livre 1.md");
    front["version"] = json!(8);
    front["index"] = json!("zz");
    let (k, j) = entry(&front);
    assert!(echoes(&[Op::Put(k, j)], &held).is_empty());
    // Going back to an older version is a change, not an echo of the latest.
    let mut known = held.clone();
    let mut newer = card("c4", "Livre 1.md");
    newer["version"] = json!(9);
    newer["x"] = json!(500);
    let (k, j) = entry(&newer);
    known.insert(k, j);
    let (k, j) = entry(&card("c4", "Livre 1.md"));
    assert!(echoes(&[Op::Put(k, j)], &known).is_empty());
    // A changed card (its file) is no echo; a deletion never is.
    let mut moved = card("c4", "Cripta Zq.md");
    moved["version"] = json!(9);
    let (k, j) = entry(&moved);
    assert!(echoes(&[Op::Put(k, j)], &held).is_empty());
    let mut gone = card("c1", "Lugares/Taverna do Corvo.md");
    gone["isDeleted"] = json!(true);
    let (k, j) = entry(&gone);
    assert!(echoes(&[Op::Put(k, j)], &held).is_empty());
    assert!(echoes(&[Op::Del("c1\n3\n9".to_owned())], &held).is_empty());
}

/// A card of a file that is not there reads as hidden: the same marker.
#[test]
fn a_card_of_a_file_that_is_not_there_is_judged_as_one_hidden() {
    let r = room(&[card("c1", "Lugares/Taverna.md"), card("c4", "Livre 1.md")]);
    let s = see(&r, &|f| (!sees_file(f)).then(|| LOCKED_WORDS.to_owned()));
    assert_eq!(s.class["c1"], Class::Locked);
    assert_eq!(s.class["c4"], Class::Open);
}

#[test]
fn elements_that_share_an_id_are_laid_over_unless_one_is_hidden_from_the_player() {
    let player = json!({ "nodes": [ { "id": "x", "type": "text", "text": "c" } ], "edges": [] });
    // Both open to the player: the file is laid over.
    let open = json!({ "nodes": [
        { "id": "x", "type": "text", "text": "a" },
        { "id": "x", "type": "text", "text": "b" },
    ], "edges": [] });
    assert!(lay_over(&open, &player, &|_| None, &|_| true).is_some());
    // One is a card of a file the player does not see: not laid over.
    let hidden = json!({ "nodes": [
        { "id": "x", "type": "file", "file": "oculta.md" },
        { "id": "x", "type": "text", "text": "b" },
    ], "edges": [] });
    let lock = |f: &str| (f == "oculta.md").then(|| "trancado".to_owned());
    assert!(lay_over(&hidden, &player, &lock, &|_| true).is_none());
}
