// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Writes the versioned seeds of the server's fuzz targets, one valid input
//! or more each, into `seeds-<target>/`: real Yjs updates of windows that
//! joined a room — made with `yrs`, as the window's Yjs makes them — a
//! real presence, real requests and frames, real headers. Run once from
//! `crates/verso-server` when a target's input changes:
//! `cargo +nightly run --manifest-path fuzz/Cargo.toml --example seeds`.

use std::path::Path;

use serde_json::json;
use verso_core::sync::frame;
use verso_server::collab::TEXT;
use verso_server::collab_board::{ELEMENTS, META, state_vector};
use verso_server::fuzz_api::{BoardRoom, NoteRoom};
use yrs::updates::decoder::Decode;
use yrs::{ClientID, Doc, Map, OffsetKind, Options, Text, Transact, Update};

/// The targets' fixed Yjs clients: the room's, then the windows'.
const ROOM: u64 = 1;

fn write(target: &str, name: &str, bytes: &[u8]) {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("seeds-{target}"));
    std::fs::create_dir_all(&dir).expect("the seeds' directory");
    std::fs::write(dir.join(name), bytes).expect("a seed written");
}

/// Records as `fuzz_targets/records.rs` reads them.
fn records(parts: &[&[u8]]) -> Vec<u8> {
    let mut out = Vec::new();
    for part in parts {
        let len = u16::try_from(part.len()).expect("a record under 64 KiB");
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(part);
    }
    out
}

fn apply(doc: &Doc, update: &[u8]) {
    doc.transact_mut()
        .apply_update(Update::decode_v1(update).expect("an update"))
        .expect("it applies");
}

/// A window on a note that joined the room whose state is `state`.
fn note_window(client: u64, state: &[u8]) -> Doc {
    let doc = Doc::with_options(Options {
        offset_kind: OffsetKind::Utf16,
        ..Options::with_client_id(ClientID::new(client))
    });
    apply(&doc, state);
    doc
}

fn notes() {
    let file = "# Nota\r\n\r\nolá 😀 mundo\r\n";
    let mut room = NoteRoom::open(file, ROOM).expect("a note");
    let state = room.state();
    // One window types after the emoji and deletes a word; another,
    // joined at the same state, adds a line at the end meanwhile.
    let one = note_window(2, &state);
    let text = one.get_or_insert_text(TEXT);
    let typed = {
        let mut txn = one.transact_mut();
        text.insert(&mut txn, 11, " grande");
        txn.encode_update_v1()
    };
    let deleted = {
        let mut txn = one.transact_mut();
        text.remove_range(&mut txn, 0, 2);
        txn.encode_update_v1()
    };
    let two = note_window(3, &state);
    let added = {
        let text = two.get_or_insert_text(TEXT);
        let mut txn = two.transact_mut();
        text.insert(&mut txn, 21, "- [ ] tarefa\n");
        txn.encode_update_v1()
    };
    let outside = "# Nota\r\n\r\nolá 😀 mundo de fora\r\n";
    let through = "# Nota\n\nolá 😀 mundo\n\nlinha nova\n";
    write(
        "note",
        "two-windows-crlf.bin",
        &records(&[
            file.as_bytes(),
            outside.as_bytes(),
            through.as_bytes(),
            &typed,
            &deleted,
            &added,
        ]),
    );
    // The same edits arriving in the other order: the later first.
    write(
        "note",
        "out-of-order.bin",
        &records(&[file.as_bytes(), b"", b"", &deleted, &added, &typed]),
    );
}

/// A window's write of an element, as the window's `roomModel.ts` makes
/// it (the server's `collab_board::tests::put`): its entry keyed
/// `id\nversion\nnonce`, the entries it outranks removed, its count of
/// edits moved.
fn put(doc: &Doc, client: u64, id: &str, version: i64, nonce: i64, x: i64) -> Vec<u8> {
    let elements = doc.get_or_insert_map(ELEMENTS);
    let meta = doc.get_or_insert_map(META);
    let mut txn = doc.transact_mut();
    let lower: Vec<String> = elements
        .keys(&txn)
        .filter(|k| k.starts_with(&format!("{id}\n")))
        .map(str::to_owned)
        .collect();
    for k in lower {
        elements.remove(&mut txn, &k);
    }
    let element = json!({ "id": id, "type": "rectangle", "x": x, "y": 0, "width": 10,
        "height": 10, "version": version, "versionNonce": nonce, "isDeleted": false });
    elements.insert(
        &mut txn,
        format!("{id}\n{version}\n{nonce}"),
        element.to_string(),
    );
    meta.insert(&mut txn, format!("edit:{client}"), version);
    txn.encode_update_v1()
}

fn boards() {
    let base = r#"{"nodes":[],"edges":[]}"#;
    let mut room = BoardRoom::open(base, ROOM);
    let state = {
        use yrs::{ReadTxn, StateVector};
        room.doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default())
    };
    let one = Doc::with_client_id(2);
    apply(&one, &state);
    let two = Doc::with_client_id(3);
    apply(&two, &state);
    let a1 = put(&one, 2, "a", 1, 0, 0);
    apply(&two, &a1);
    // Both move `a` at once; the higher version wins.
    let a3 = put(&one, 2, "a", 3, 70, 30);
    let a2 = put(&two, 3, "a", 2, 5, 20);
    let b1 = put(&two, 3, "b", 1, 9, 50);
    for u in [&a1, &a3, &a2, &b1] {
        room.update(u).expect("a window's update is taken");
    }
    let at = state_vector(&room.doc);
    let file = r#"{"type":"excalidraw","version":2,"elements":[]}"#;
    write(
        "board",
        "two-windows.bin",
        &records(&[base.as_bytes(), file.as_bytes(), &at, &a1, &a3, &a2, &b1]),
    );
}

/// A y-protocols awareness update: a count, then per client its id, its
/// clock and its state as JSON, each number a lib0 varint.
fn awareness(entries: &[(u64, u64, &str)]) -> Vec<u8> {
    fn var(out: &mut Vec<u8>, mut n: u64) {
        loop {
            let low = (n & 0x7f) as u8;
            n >>= 7;
            if n == 0 {
                out.push(low);
                return;
            }
            out.push(low | 0x80);
        }
    }
    let mut out = Vec::new();
    var(&mut out, entries.len() as u64);
    for (id, clock, state) in entries {
        var(&mut out, *id);
        var(&mut out, *clock);
        var(&mut out, state.len() as u64);
        out.extend_from_slice(state.as_bytes());
    }
    out
}

fn presences() {
    let cursor = r##"{"user":{"name":"Ana","color":"#2e7d32","colorLight":"#2e7d3233"},"cursor":{"anchor":3,"head":5}}"##;
    // Ana's window; Bia's, claiming Ana's client too; Ana's leaving.
    let ana = [&[0_u8][..], &awareness(&[(7, 1, cursor)])].concat();
    let bia = [
        &[2_u8][..],
        &awareness(&[(9, 1, r#"{"user":{"name":"Ana"}}"#), (7, 2, "{}")]),
    ]
    .concat();
    let gone = [&[1_u8][..], &awareness(&[(7, 3, "null")])].concat();
    write(
        "presence",
        "two-accounts.bin",
        &records(&[&ana, &bia, &gone]),
    );
}

fn requests() {
    let text = json!({ "id": 7, "cmd": "read_note", "args": { "path": "Notas/Olá.md" } });
    write("request", "read-note.json", text.to_string().as_bytes());
    let header = json!({ "id": 8, "cmd": "sync_put", "args": {
        "path": "Notas/Olá.md", "offset": 0, "size": 5, "hash": "ab", "base": null } });
    let piece = frame(header.to_string().as_bytes(), b"hello");
    write("request", "sync-put.frame", &piece);
    write("unframe", "sync-put.frame", &piece);
    write("unframe", "cut-short.frame", &piece[..piece.len() / 2]);
}

fn hosts() {
    let local = b"\x00\x00host: localhost:7340\norigin: http://localhost:7340\n";
    let proxied = b"\x02\x00host: notes.example.org\norigin: https://notes.example.org\n\
x-forwarded-for: 198.51.100.7, 203.0.113.9\nx-forwarded-proto: https\n";
    let ipv6 = b"\x01\x02host: [::1]:7340\norigin: https://[::1]:7340\n";
    write("host", "loopback.txt", local);
    write("host", "behind-proxy.txt", proxied);
    write("host", "ipv6-tls.txt", ipv6);
}

fn sizes() {
    write("size", "megabytes.txt", b"500MB");
    write("size", "comma.txt", b"1,5 GB");
    write("size", "bytes.txt", b"1073741824");
}

/// What `fuzz_targets/link.rs` reads: a read link's token, a command, an
/// address under `/r/`.
fn links() {
    write("link", "token.txt", b"3vZQxQGWqq0yHtjJQ1G4zU8Yj7mXr0nYk9y0wq2oH1A");
    write("link", "command.txt", b"read_note");
    write("link", "write.txt", b"write_note");
    write("link", "file.txt", b"/r/3vZQxQGWqq0yHtjJQ1G4zU8Yj7mXr0nYk9y0wq2oH1A/f/Mesa/p.png");
    write("link", "page.txt", b"/r/3vZQxQGWqq0yHtjJQ1G4zU8Yj7mXr0nYk9y0wq2oH1A");
    write("link", "traversal.txt", b"/r/x/f/../../etc/passwd");
}

/// What `fuzz_targets/table.rs` reads: a first byte that picks the input
/// (0 a message, 1 a dice look, 2 an image's bytes, 3 a command's name),
/// then the input.
fn tables() {
    let with = |pick: u8, rest: &[u8]| {
        let mut v = vec![pick];
        v.extend_from_slice(rest);
        v
    };
    write("table", "message.bin", &with(0, "Rolei em segredo, mestre 🎲".as_bytes()));
    write("table", "message-control.bin", &with(0, b"a[31mb"));
    write("table", "message-long.bin", &with(0, "á".repeat(501).as_bytes()));
    let one = json!({ "body": "#8C1F2B", "number": "#f7e8e2", "outline": "#2b0a0e",
        "texture": "marble", "material": "plastic", "app": true });
    let look = json!({ "1": one, "2": one, "3": one });
    write("table", "look.bin", &with(1, look.to_string().as_bytes()));
    let mut bad = look.clone();
    bad["2"]["texture"] = json!("https://example.org/x.png");
    write("table", "look-url.bin", &with(1, bad.to_string().as_bytes()));
    let mut extra = look;
    extra["3"]["src"] = json!("x");
    write("table", "look-extra.bin", &with(1, extra.to_string().as_bytes()));
    write("table", "png.bin", &with(2, b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"));
    write("table", "svg.bin", &with(2, b"<svg xmlns='http://www.w3.org/2000/svg'/>"));
    write("table", "webp.bin", &with(2, b"RIFF\0\0\0\0WEBPVP8 "));
    write("table", "say.bin", &with(3, b"table_say"));
    write("table", "image.bin", &with(3, b"table_send_image"));
    write("table", "request.bin", &with(3, br#"{"id":1,"cmd":"table_say","args":{"text":"oi"}}"#));
}

fn main() {
    tables();
    notes();
    boards();
    presences();
    requests();
    hosts();
    sizes();
    links();
}
