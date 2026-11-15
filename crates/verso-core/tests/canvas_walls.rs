// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a reader is served of a board beyond its secret pins (fix of
//! 2026-11-15, ADR 0120 "As built"): the projection keeps an allowlist of
//! the board's keys — `nodes`, `edges`, and of `verso` only `version`,
//! `drawing` and `background` — so the walls an imported map keeps
//! (`verso.walls`, its secret doors named) and any key Verso does not know
//! never reach a reader; and a drawn element marked secret, or the secret
//! door an import drew before it marked them, is left out of the drawing.

use verso_core::canvas::{Canvas, Json};
use verso_core::canvas_secret::{has_secret, index_split, project};

/// A dungeon board as the import of 0.9.0-beta.2 wrote it: the floor, a
/// wall line, a plain door, a secret door drawn as a dashed line (no mark),
/// the walls under `verso` with the door's kind, and keys nobody knows.
const DUNGEON: &str = r##"{
	"nodes":[
		{"id":"wb-note","type":"file","file":"Cripta.md","x":800,"y":0,"width":480,"height":480}
	],
	"edges":[],
	"zqtop":{"plan":"zqplano"},
	"verso":{"version":1,"background":"#fdf6e3","zqverso":"zqoutro","drawing":[
		{"id":"wb-0","type":"rectangle","x":0,"y":0,"width":200,"height":120,"groupIds":["wb-dungeon"],"strokeStyle":"solid","strokeWidth":1},
		{"id":"wb-1","type":"line","x":0,"y":0,"width":200,"height":120,"groupIds":["wb-dungeon"],"strokeStyle":"solid","strokeWidth":4,"points":[[0,0],[200,0],[200,120]]},
		{"id":"wb-2","type":"rectangle","x":86,"y":115,"width":28,"height":10,"groupIds":["wb-dungeon"],"strokeStyle":"solid","strokeWidth":2},
		{"id":"wb-3","type":"line","x":7001,"y":7002,"width":0,"height":40,"groupIds":["wb-dungeon"],"strokeStyle":"dashed","strokeWidth":3,"roughness":0,"points":[[0,0],[0,40]]},
		{"id":"wb-4","type":"text","x":20,"y":20,"width":14,"height":32,"groupIds":["wb-dungeon"],"text":"1","originalText":"1"}
	],"walls":{"version":1,"generator":"one-page-dungeon","cell":40,
		"lines":[[0,0,200,0],[200,0,200,120]],
		"doors":[{"line":[7001,7002,7001,7042],"type":6,"kind":"secret"},{"line":[80,120,120,120],"type":1,"kind":"door"}]}}
}
"##;

fn drawing_ids(text: &str) -> Vec<String> {
    let read = Canvas::parse(text).unwrap();
    match read.root.get("verso").and_then(|v| v.get("drawing")) {
        Some(Json::Array(items)) => items
            .iter()
            .filter_map(|e| e.get("id").and_then(Json::as_str).map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

#[test]
fn the_walls_and_unknown_keys_never_reach_a_reader() {
    assert!(has_secret(DUNGEON), "a board with walls is projected");
    let shown = project(DUNGEON).into_owned();
    for word in [
        "walls",
        "one-page-dungeon",
        "\"kind\"",
        "zqtop",
        "zqplano",
        "zqverso",
        "zqoutro",
    ] {
        assert!(!shown.contains(word), "{word} reached the reader: {shown}");
    }
    // What a reader may see stays, as it was.
    for word in ["wb-note", "Cripta.md", "#fdf6e3", "\"version\""] {
        assert!(shown.contains(word), "{word} was lost: {shown}");
    }
    assert_eq!(project(&shown), shown, "idempotent");
}

#[test]
fn the_imported_secret_door_is_not_drawn_for_a_reader() {
    let shown = project(DUNGEON).into_owned();
    assert!(
        !shown.contains("7001") && !shown.contains("dashed"),
        "{shown}"
    );
    // The rest of the dungeon, grouped with the door, is the reader's: a
    // secret drawn element hides itself, not the strokes it moves with.
    assert_eq!(drawing_ids(&shown), ["wb-0", "wb-1", "wb-2", "wb-4"]);
}

#[test]
fn a_drawn_element_marked_secret_is_not_drawn_for_a_reader() {
    for mark in [
        r#""customData":{"verso":{"secret":true}}"#,
        r#""verso":{"secret":"yes"}"#,
        r#""customData":{"verso":{"secret":true}},"customData":{}"#,
    ] {
        let board = format!(
            r#"{{"nodes":[],"edges":[],"verso":{{"version":1,"drawing":[
                {{"id":"a","type":"rectangle","x":1,"y":1,"groupIds":["g"]}},
                {{"id":"zqmarked","type":"rectangle","x":9,"y":9,"groupIds":["g"],{mark}}},
                {{"id":"zqlabel","type":"text","x":9,"y":9,"containerId":"zqmarked","text":"zqword"}}
            ]}}}}"#
        );
        let shown = project(&board).into_owned();
        assert!(
            !shown.contains("zqmarked") && !shown.contains("zqword"),
            "{mark}: {shown}"
        );
        assert_eq!(drawing_ids(&shown), ["a"], "{mark}");
    }
}

#[test]
fn a_board_with_only_public_keys_is_served_as_it_is() {
    let plain = r##"{"nodes":[{"id":"a","type":"text","text":"x","x":0,"y":0,"width":9,"height":9}],"edges":[],"verso":{"version":1,"background":"#fff","drawing":[{"id":"d","type":"line","x":0,"y":0,"strokeStyle":"dashed","strokeWidth":2}]}}"##;
    assert!(matches!(project(plain), std::borrow::Cow::Borrowed(_)));
    assert!(!has_secret(plain));
    assert!(index_split(plain).is_none());
}

#[test]
fn the_index_serves_a_reader_the_projection_of_a_board_with_walls() {
    let split = index_split(DUNGEON).unwrap();
    let shown = project(DUNGEON).into_owned();
    assert_eq!(split.served.0, shown.len());
    assert!(split.nodes.is_empty());
}
