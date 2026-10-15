// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's boards as a reader of a UniVerso sees them (ADR 0090 item
//! 5): a secret pin is no part of what the core hands a reader — not the
//! file's text, not a search, not a backlink, not a count, not a line
//! number — and a board with none is read as it is.

use super::*;

/// A board in Obsidian's layout: a map, an open pin, and a secret pin to a
/// note of the folder.
const COMPACT: &str = "{\n\t\"nodes\":[\n\t\t{\"id\":\"mapa\",\"type\":\"file\",\"file\":\"Mapa.png\",\"x\":0,\"y\":0,\"width\":900,\"height\":700,\"verso\":{\"map\":true}},\n\t\t{\n\t\t\t\"id\":\"zqcripta\",\n\t\t\t\"type\":\"file\",\n\t\t\t\"file\":\"Cripta.md\",\n\t\t\t\"x\":777001,\n\t\t\t\"y\":777002,\n\t\t\t\"width\":24,\n\t\t\t\"height\":24,\n\t\t\t\"verso\":{\"pin\":true,\"secret\":true}\n\t\t},\n\t\t{\"id\":\"taverna\",\"type\":\"file\",\"file\":\"Taverna.md\",\"x\":10,\"y\":20,\"width\":24,\"height\":24,\"verso\":{\"pin\":true}},\n\t\t{\"id\":\"nota\",\"type\":\"text\",\"text\":\"praca zqcenario\",\"x\":5,\"y\":5,\"width\":50,\"height\":50}\n\t],\n\t\"edges\":[]\n}\n";

/// The board as Obsidian lays it out (a node with a `verso` object takes
/// a line to a field).
#[cfg(test)]
fn board() -> String {
    verso_core::canvas::Canvas::parse(COMPACT).unwrap().write()
}

#[cfg(test)]
fn folder() -> (TempDir, TempDir, Vec<Kept>, Workspace) {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let mut kept = vec![note(vault.path(), "Mesa.canvas", &board())];
    for name in ["Taverna", "Cripta"] {
        kept.push(note(
            vault.path(),
            &format!("{name}.md"),
            &format!("# {name}\n"),
        ));
    }
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    (vault, config, kept, ws)
}

#[test]
fn a_reader_is_served_the_board_without_its_secret_pins_and_everything_derived() {
    let (_v, _c, _k, mut ws) = folder();
    let whole = ws.read_text("Mesa.canvas").unwrap();
    assert!(whole.text.contains("777001"));
    let shown = ws.reader_read_text("Mesa.canvas").unwrap();
    for word in ["zqcripta", "Cripta.md", "777001", "777002"] {
        assert!(!shown.text.contains(word), "{word} reached a reader");
    }
    assert!(shown.text.contains("Taverna.md") && shown.text.contains("praca"));
    assert_ne!(shown.revision, whole.revision);
    // The bytes, whatever the way they are asked for.
    let bytes = ws.reader_read_file("Mesa.canvas").unwrap();
    assert_eq!(String::from_utf8(bytes).unwrap(), shown.text);
    let note = ws.reader_read_note("Mesa.canvas").unwrap();
    assert_eq!(note.text, shown.text);
    // Search: a public word is found.
    assert_eq!(ws.reader_search("zqcenario", 10).unwrap().len(), 1);
    // The note the secret pin names has no backlink for a reader; the
    // owner has it.
    assert!(
        ws.reader_backlinks("Cripta.md")
            .unwrap()
            .unwrap()
            .is_empty()
    );
    assert_eq!(ws.backlinks("Cripta.md").unwrap().unwrap().len(), 1);
    // The open pin's note has one, numbered as the projection numbers it:
    // the secret pin's lines are not counted.
    let open = ws.reader_backlinks("Taverna.md").unwrap().unwrap();
    assert_eq!(open.len(), 1);
    let line_of = |text: &str| text.lines().position(|l| l.contains("Taverna.md")).unwrap() + 1;
    assert_eq!(open[0].line as usize, line_of(&shown.text));
    assert!(line_of(&whole.text) > line_of(&shown.text));
    // The listing: the length is the projection's.
    let entry = ws
        .reader_entries()
        .unwrap()
        .into_iter()
        .find(|e| e.path == "Mesa.canvas")
        .unwrap();
    assert_eq!(entry.len as usize, shown.text.len());
    // The preview of a save, over what the reader is served.
    let preview = ws
        .reader_board_preview("Mesa.canvas", "{\"nodes\":[],\"edges\":[]}")
        .unwrap();
    assert!(!preview.contains("zqcripta"));
}

#[test]
fn a_board_with_no_secret_pin_is_a_reader_s_as_it_is() {
    let (v, _c, _k, mut ws) = folder();
    let open = board()
        .replace(",\"secret\":true", "")
        .replace("\"secret\":true", "\"secret\":false");
    let _plain = note(v.path(), "Aberta.canvas", &open);
    ws.index().unwrap();
    let whole = ws.read_text("Aberta.canvas").unwrap();
    let shown = ws.reader_read_text("Aberta.canvas").unwrap();
    assert_eq!(shown.text, whole.text);
    assert_eq!(shown.revision, whole.revision);
    // Mesa's secret pin is hidden; Aberta's is an ordinary pin.
    assert_eq!(ws.reader_backlinks("Cripta.md").unwrap().unwrap().len(), 1);
}
