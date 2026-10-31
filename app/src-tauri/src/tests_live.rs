// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Live co-editing of a synced folder (ADR 0082) against a real
//! `verso serve` on this machine, with no window: two folders of this
//! computer that sync with one folder of the server, a tab on each — a Yjs
//! document, as the window's — and a third connection playing the browser,
//! all in the room of one note.

use std::collections::BTreeSet;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use proptest::prelude::*;
use serde_json::{Value, json};
use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, OffsetKind, Options, ReadTxn, StateVector, Text, Transact, Update};

use super::sync::Link;
use super::sync::live;
use super::tests_sync::{
    Device, Running, changed, copy_of, device, files, kept, on, serve, text, write,
};
use super::*;

const NOTE: &str = "Sessao.md";
/// A window's label: one per device here.
const WINDOW: &str = "w";
/// Longer than a room waits before it writes (`QUIET`, 900 ms).
const SETTLE: Duration = Duration::from_millis(1500);

fn doc() -> Doc {
    Doc::with_options(Options {
        offset_kind: OffsetKind::Utf16,
        ..Options::default()
    })
}

fn text_of(doc: &Doc) -> String {
    let t = doc.get_or_insert_text("verso");
    let txn = doc.transact();
    t.get_string(&txn)
}

fn apply(doc: &Doc, update: &Value) {
    let bytes = STANDARD
        .decode(update.as_str().unwrap_or_default())
        .unwrap();
    doc.transact_mut()
        .apply_update(Update::decode_v1(&bytes).unwrap())
        .unwrap();
}

/// `what` (ending in a newline) typed at the start of line `line`, or at
/// the end: a whole line, never inside another's word. The update, base64.
fn insert(doc: &Doc, line: usize, what: &str) -> String {
    let now = text_of(doc);
    let starts: Vec<usize> = std::iter::once(0)
        .chain(now.match_indices('\n').map(|(i, _)| i + 1))
        .collect();
    let at = starts[line % starts.len()];
    let at = u32::try_from(now[..at].encode_utf16().count()).unwrap();
    let t = doc.get_or_insert_text("verso");
    let mut txn = doc.transact_mut();
    t.insert(&mut txn, at, what);
    STANDARD.encode(txn.encode_update_v1())
}

fn whole(doc: &Doc) -> String {
    STANDARD.encode(
        doc.transact()
            .encode_state_as_update_v1(&StateVector::default()),
    )
}

fn sleep(d: Duration) {
    std::thread::sleep(d);
}

/// A window's room command on device `d`, as the window sends it.
fn cmd(d: &Device, cmd: &str, args: Value) -> Result<Value, Value> {
    tauri::async_runtime::block_on(live::command(&d.ctx, &d.s, WINDOW, cmd, args))
}

/// A note's tab in a device's window.
struct Tab {
    doc: Doc,
    epoch: String,
    /// How much of what the device told its windows this tab has heard.
    seen: usize,
}

impl Tab {
    /// The note opened: into its room (item 5).
    fn open(d: &Device) -> Tab {
        Tab::joined(d, false)
    }

    /// The note opened by someone who only reads it: in its room all the
    /// same, told it is read-only (night round 2026-10-30: the server said
    /// `false` to a reader, whose editor then took no room text).
    fn open_reading(d: &Device) -> Tab {
        Tab::joined(d, true)
    }

    fn joined(d: &Device, read_only: bool) -> Tab {
        let joined = cmd(d, "collab_join", json!({ "path": NOTE })).unwrap();
        assert_eq!(joined["read_only"], read_only, "{joined}");
        let doc = doc();
        apply(&doc, &joined["update"]);
        Tab {
            doc,
            epoch: joined["epoch"].as_str().unwrap().to_owned(),
            seen: lock(&d.told).len(),
        }
    }

    fn text(&self) -> String {
        text_of(&self.doc)
    }

    /// Typed while in the room: sent.
    fn type_live(&self, d: &Device, line: usize, what: &str) {
        let update = insert(&self.doc, line, what);
        cmd(
            d,
            "collab_update",
            json!({ "path": NOTE, "update": update }),
        )
        .unwrap();
    }

    /// What the room told this tab since it last listened.
    fn hear(&mut self, d: &Device) {
        let told = lock(&d.told);
        for (to, event, payload) in &told[self.seen..] {
            if to.iter().any(|w| w == WINDOW) && event == "collab-update" && payload["path"] == NOTE
            {
                apply(&self.doc, &payload["update"]);
            }
        }
        self.seen = told.len();
    }

    /// Out of the room (item 8): the text kept, and written here by the
    /// tab's autosave when the file differs — as `write_note` does, which
    /// tells the sync it is the tab's own.
    fn local(&self, d: &Device) {
        let mine = self.text();
        if text(d, NOTE).as_deref() != Some(mine.as_str()) {
            write(d, NOTE, mine.as_bytes());
            live::wrote(&d.s, WINDOW, NOTE, mine.as_bytes());
        }
    }

    /// Back in the room (item 9): the same room takes the tab's whole
    /// state; another one is left, and the tab reads the note anew after
    /// the pass compared it from the base. True for the same room.
    fn rejoin(&mut self, d: &Device, l: &mut Link) -> bool {
        let joined = cmd(d, "collab_join", json!({ "path": NOTE })).unwrap();
        if joined["epoch"] == self.epoch.as_str() {
            apply(&self.doc, &joined["update"]);
            let all = whole(&self.doc);
            cmd(d, "collab_update", json!({ "path": NOTE, "update": all })).unwrap();
            return true;
        }
        cmd(d, "collab_leave", json!({ "path": NOTE })).unwrap();
        changed(d, &[NOTE]);
        on(d, l);
        *self = Tab::open(d);
        false
    }
}

/// The third connection: a browser's window on the server's folder.
struct Browser {
    remote: Arc<remote::Remote>,
    heard: tokio::sync::mpsc::UnboundedReceiver<remote::Heard>,
    doc: Doc,
    /// The note's path in the folder the browser opened.
    path: String,
    /// The revision of the file the room last wrote or read, as heard.
    revision: String,
}

fn browser(r: &Running) -> Browser {
    browser_at(&r.url, &r.owner, &r.folder, NOTE)
}

fn browser_at(url: &str, token: &str, folder: &str, path: &str) -> Browser {
    let login = verso_core::servers::ServerLogin {
        url: url.to_owned(),
        token: token.to_owned(),
        email: "ana@casa.lan".into(),
        name: "Ana".into(),
    };
    tauri::async_runtime::block_on(async {
        let (remote, heard) = remote::dial(&login, folder.to_owned()).await.unwrap();
        remote
            .call("open_server_folder", json!({ "id": folder }))
            .await
            .unwrap();
        let joined = remote
            .call("collab_join", json!({ "path": path }))
            .await
            .unwrap();
        let doc = doc();
        apply(&doc, &joined["update"]);
        Browser {
            remote,
            heard,
            doc,
            path: path.to_owned(),
            revision: joined["revision"].as_str().unwrap().to_owned(),
        }
    })
}

impl Browser {
    fn call(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        tauri::async_runtime::block_on(self.remote.call(cmd, args))
    }

    fn type_live(&self, line: usize, what: &str) {
        let update = insert(&self.doc, line, what);
        self.call(
            "collab_update",
            json!({ "path": self.path, "update": update }),
        )
        .unwrap();
    }

    fn hear(&mut self) {
        while let Ok(h) = self.heard.try_recv() {
            let remote::Heard::Event(event, payload) = h else {
                continue;
            };
            if payload["path"] != self.path.as_str() {
                continue;
            }
            match event.as_str() {
                "collab-update" => apply(&self.doc, &payload["update"]),
                "collab-saved" => {
                    payload["revision"]
                        .as_str()
                        .unwrap()
                        .clone_into(&mut self.revision);
                }
                _ => {}
            }
        }
    }

    /// The note as the server's file holds it, and its revision.
    fn note(&self) -> (String, String) {
        let note = self
            .call("read_note", json!({ "path": self.path }))
            .unwrap();
        (
            note["text"].as_str().unwrap().to_owned(),
            note["revision"].as_str().unwrap().to_owned(),
        )
    }

    /// The note as the server's file holds it.
    fn file(&self) -> String {
        self.note().0
    }
}

/// The room wrote what it holds, `must` among it: the server's file is the
/// browser's text, as heard, and the save that made it is heard too — the
/// room tells it once the folder's log has it, so a device's pass right
/// after finds it. Not a fixed wait, which a loaded machine outruns; nor
/// the file alone, which is on disk a moment before the log knows it.
fn saved(c: &mut Browser, must: &[&str]) {
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    loop {
        c.hear();
        let room = text_of(&c.doc);
        let (file, revision) = c.note();
        if must.iter().all(|w| room.contains(w)) && file == room && revision == c.revision {
            return;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "the room did not write: {room:?} {file:?} (heard {}, on disk {revision})",
            c.revision
        );
        sleep(Duration::from_millis(100));
    }
}

/// The device's link dropped, as a network drops it (item 8).
fn drop_link(d: &Device, l: Link) {
    l.socket.as_ref().unwrap().hang_up();
    drop(l);
    d.s.live.lost();
}

/// Two devices in step with the server's folder, a note on both.
fn two() -> (Running, Device, Device) {
    let r = serve(&[(NOTE, "# Sessao\n")]);
    let a = device(&r, &r.owner, &[]);
    let b = device(&r, &r.owner, &[]);
    for d in [&a, &b] {
        let mut l = kept(d);
        on(d, &mut l);
        drop_link(d, l);
    }
    assert_eq!(text(&a, NOTE).as_deref(), Some("# Sessao\n"));
    assert_eq!(text(&b, NOTE).as_deref(), Some("# Sessao\n"));
    (r, a, b)
}

fn copies(d: &Device) -> Vec<String> {
    files(d)
        .into_iter()
        .filter(|p| super::sync::is_conflict_copy(p))
        .collect()
}

#[test]
fn two_devices_and_a_browser_edit_one_note_live_and_the_files_follow() {
    let (r, a, b) = two();
    let (mut la, mut lb) = (kept(&a), kept(&b));
    // The link up: the folder's notes may be live, as far as it says.
    assert!(live::up(&a.s).is_some());
    let (mut ta, mut tb) = (Tab::open(&a), Tab::open(&b));
    let mut c = browser(&r);
    assert!(a.s.live.holds(NOTE) && b.s.live.holds(NOTE));

    ta.type_live(&a, 9, "de A\n");
    tb.type_live(&b, 9, "de B\n");
    c.type_live(0, "do navegador\n");
    sleep(Duration::from_millis(300));
    ta.hear(&a);
    tb.hear(&b);
    c.hear();
    // Each saw the others', letter by letter.
    assert_eq!(ta.text(), tb.text());
    assert_eq!(ta.text(), text_of(&c.doc));
    for word in ["de A", "de B", "do navegador"] {
        assert!(ta.text().contains(word), "{}", ta.text());
    }
    // The room writes the server's file; each device's sync brings it
    // down over the local file, which no tab wrote meanwhile.
    saved(&mut c, &[]);
    on(&a, &mut la);
    on(&b, &mut lb);
    let room = ta.text();
    assert_eq!(c.file(), room);
    assert_eq!(text(&a, NOTE).as_deref(), Some(room.as_str()));
    assert_eq!(text(&b, NOTE).as_deref(), Some(room.as_str()));
    assert!(copies(&a).is_empty() && copies(&b).is_empty());
    // The tab leaves: the device is out of the room.
    cmd(&a, "collab_leave", json!({ "path": NOTE })).unwrap();
    assert!(!a.s.live.holds(NOTE));
}

#[test]
fn a_drop_and_a_return_within_the_grace_keep_every_edit_and_make_no_copy() {
    let (r, a, b) = two();
    let (la, mut lb) = (kept(&a), kept(&b));
    let (mut ta, mut tb) = (Tab::open(&a), Tab::open(&b));
    let mut c = browser(&r);

    // A's link drops: the tab goes local, keeps its text and goes on
    // typing, saved here (item 8). B types live meanwhile.
    drop_link(&a, la);
    assert!(live::up(&a.s).is_none());
    let refused = cmd(&a, "collab_update", json!({ "path": NOTE, "update": "" })).unwrap_err();
    assert_eq!(refused["kind"], "unavailable", "{refused}");
    ta.local(&a);
    insert(&ta.doc, 99, "sem rede, de A\n");
    ta.local(&a);
    tb.type_live(&b, 0, "enquanto A estava fora\n");
    saved(&mut c, &["enquanto A estava fora"]);
    on(&b, &mut lb);

    // A comes back: the same room, the tab's whole state into it.
    let mut la = kept(&a);
    assert!(ta.rejoin(&a, &mut la), "the same room");
    on(&a, &mut la);
    saved(&mut c, &["sem rede, de A", "enquanto A estava fora"]);
    on(&a, &mut la);
    on(&b, &mut lb);
    ta.hear(&a);
    tb.hear(&b);
    c.hear();
    let room = tb.text();
    for word in ["sem rede, de A", "enquanto A estava fora"] {
        assert!(room.contains(word), "{room}");
    }
    assert_eq!(room.matches("sem rede, de A").count(), 1, "{room}");
    assert_eq!(ta.text(), room);
    assert_eq!(c.file(), room);
    assert_eq!(text(&a, NOTE).as_deref(), Some(room.as_str()));
    assert_eq!(text(&b, NOTE).as_deref(), Some(room.as_str()));
    assert!(
        copies(&a).is_empty() && copies(&b).is_empty(),
        "{:?}",
        files(&a)
    );
}

#[test]
fn a_return_to_another_room_keeps_the_text_in_the_file_or_in_a_copy() {
    let (r, a, _b) = two();
    let la = kept(&a);
    let mut ta = Tab::open(&a);

    // A alone in the room drops and types on; the room is written and
    // then made again, with the browser's edit, while A is away.
    drop_link(&a, la);
    ta.local(&a);
    insert(&ta.doc, 99, "sem rede, de A\n");
    ta.local(&a);
    sleep(Duration::from_millis(300));
    let c = browser(&r);
    c.type_live(0, "do navegador\n");
    c.call("collab_leave", json!({ "path": NOTE })).unwrap();

    // Back: another room. Both sides changed: the server's version keeps
    // the name, A's text is beside it in a copy — nothing lost.
    let mut la = kept(&a);
    assert!(!ta.rejoin(&a, &mut la), "another room");
    let named = text(&a, NOTE).unwrap();
    assert!(named.contains("do navegador"), "{named}");
    assert!(!named.contains("sem rede"), "{named}");
    let copy = copy_of(&a, NOTE);
    assert!(text(&a, &copy).unwrap().contains("sem rede, de A"));
    // The tab is in the new room, over the server's version.
    assert_eq!(ta.text(), named);
    assert!(a.s.live.holds(NOTE));

    // Again, with nothing typed on the server meanwhile: the server's file
    // unmoved since the base, A's text is sent — no copy.
    drop_link(&a, la);
    insert(&ta.doc, 99, "de novo sem rede\n");
    ta.local(&a);
    sleep(Duration::from_millis(300));
    let c = browser(&r);
    c.call("collab_leave", json!({ "path": NOTE })).unwrap();
    let mut la = kept(&a);
    assert!(!ta.rejoin(&a, &mut la), "another room");
    assert!(ta.text().contains("de novo sem rede"), "{}", ta.text());
    assert_eq!(c.file(), ta.text());
    assert_eq!(copies(&a), vec![copy]);
}

#[test]
fn a_return_to_another_room_after_the_rooms_own_saves_makes_no_copy() {
    // The maintainer's 2026-10-23 report: a note only this device edited,
    // the server restarted while the room's last saves had not come down
    // yet. The server's file moved since the base, but by this tab's own
    // room: the tab's text holds it, so it is sent, not set aside.
    let (r, a, _b) = two();
    let la = kept(&a);
    let mut ta = Tab::open(&a);

    // Typed in the room; the room writes it and tells the tab it did, but
    // no pass has carried it down (the link goes before one does).
    ta.type_live(&a, 99, "digitado ao vivo\n");
    // Until this app has heard the save, not for a fixed time: the room
    // writes after its quiet moment (900 ms) and the write and the event
    // take as long as the machine is busy. A link dropped first never
    // hears the save, and the pass then finds two changes and makes a
    // copy, as it should (seen on Windows under load, 2026-10-24: the
    // save landed 4 ms after the hang-up).
    let waited = std::time::Instant::now();
    while a.s.live.saves_heard(NOTE) == 0 {
        assert!(
            waited.elapsed() < Duration::from_secs(30),
            "the room's save was never heard"
        );
        sleep(Duration::from_millis(20));
    }
    drop_link(&a, la);
    assert_eq!(text(&a, NOTE).as_deref(), Some("# Sessao\n"));

    // The link is gone: the tab goes local and types on.
    insert(&ta.doc, 99, "digitado depois, sem rede\n");
    ta.local(&a);
    sleep(Duration::from_millis(300));
    // The server's room is made again (a restart's effect on it).
    let c = browser(&r);
    c.call("collab_leave", json!({ "path": NOTE })).unwrap();

    let mut la = kept(&a);
    assert!(!ta.rejoin(&a, &mut la), "another room");
    assert_eq!(copies(&a), Vec::<String>::new(), "no conflict copy");
    assert!(ta.text().contains("digitado ao vivo"), "{}", ta.text());
    assert!(ta.text().contains("sem rede"), "{}", ta.text());
    assert_eq!(c.file(), ta.text());
    assert_eq!(text(&a, NOTE).as_deref(), Some(ta.text().as_str()));
}

#[test]
fn an_outside_program_on_a_device_with_a_live_note_is_merged_or_kept_as_a_copy() {
    let (r, a, b) = two();
    let (mut la, mut lb) = (kept(&a), kept(&b));
    let (mut ta, mut tb) = (Tab::open(&a), Tab::open(&b));
    let mut c = browser(&r);

    // Nothing waits in the room: the outside edit is sent and enters the
    // room as one edit, which every tab sees.
    let now = text(&a, NOTE).unwrap();
    write(&a, NOTE, format!("{now}de outro programa\n").as_bytes());
    on(&a, &mut la);
    sleep(Duration::from_millis(300));
    ta.hear(&a);
    tb.hear(&b);
    assert!(tb.text().contains("de outro programa"), "{}", tb.text());
    assert!(copies(&a).is_empty());
    saved(&mut c, &["de outro programa"]);
    on(&a, &mut la);
    on(&b, &mut lb);

    // The room saved meanwhile: the server's file moved since A's base, so
    // the outside version is kept beside the note, the room's under the
    // name, and A's tab stays in the room (item 11).
    let now = text(&a, NOTE).unwrap();
    write(&a, NOTE, format!("{now}outra vez de fora\n").as_bytes());
    tb.type_live(&b, 0, "de B, ao vivo\n");
    saved(&mut c, &["de B, ao vivo"]);
    on(&a, &mut la);
    on(&a, &mut la);
    let named = text(&a, NOTE).unwrap();
    assert!(named.contains("de B, ao vivo"), "{named}");
    let copy = copy_of(&a, NOTE);
    assert!(text(&a, &copy).unwrap().contains("outra vez de fora"));
    assert!(a.s.live.holds(NOTE));
}

#[test]
fn a_reader_is_present_in_the_room_and_writes_nothing() {
    let r = serve(&[(NOTE, "# Sessao\n")]);
    let reader = device(&r, &r.reader, &[]);
    let mut l = kept(&reader);
    on(&reader, &mut l);
    let mut c = browser(&r);
    let t = Tab::open_reading(&reader);
    assert!(reader.s.live.holds(NOTE));
    // Present: the cursor and the name reach the others…
    cmd(
        &reader,
        "collab_awareness",
        json!({ "path": NOTE, "update": "AA==" }),
    )
    .unwrap();
    sleep(Duration::from_millis(300));
    let mut present = false;
    while let Ok(h) = c.heard.try_recv() {
        present |= matches!(h, remote::Heard::Event(ref e, _) if e == "collab-awareness");
    }
    assert!(present);
    // …and an edit is refused by the server.
    let update = insert(&t.doc, 0, "da leitora\n");
    let refused = cmd(
        &reader,
        "collab_update",
        json!({ "path": NOTE, "update": update }),
    )
    .unwrap_err();
    assert_eq!(refused["kind"], "refused", "{refused}");
    c.hear();
    assert!(!text_of(&c.doc).contains("da leitora"));
}

/// Dice in a synced note's room (ADR 0088 item 4): the server rolls, a
/// reader too; a person in the room by the browser hears it, and so does
/// another window of this app holding the note — the server tells the
/// others, not this app's own link.
#[test]
fn a_roll_in_a_synced_note_is_the_servers_and_every_window_hears_it() {
    let r = serve(&[(NOTE, "# Sessao\n")]);
    let reader = device(&r, &r.reader, &[]);
    let mut l = kept(&reader);
    on(&reader, &mut l);
    let c = browser(&r);
    let _t = Tab::open_reading(&reader);
    tauri::async_runtime::block_on(live::command(
        &reader.ctx,
        &reader.s,
        "other",
        "collab_join",
        json!({ "path": NOTE }),
    ))
    .unwrap();
    let seen = lock(&reader.told).len();
    let roll = cmd(
        &reader,
        "collab_roll",
        json!({ "path": NOTE, "notation": "1d20+2", "source": null }),
    )
    .unwrap();
    assert!(!roll["by"].as_str().unwrap().is_empty(), "{roll}");
    let total = roll["total"].as_i64().unwrap();
    assert!((3..=22).contains(&total), "{roll}");
    sleep(Duration::from_millis(300));
    let mut heard = None;
    let mut c = c;
    while let Ok(h) = c.heard.try_recv() {
        if let remote::Heard::Event(e, payload) = h
            && e == "collab-roll"
        {
            heard = Some(payload);
        }
    }
    let heard = heard.expect("the browser heard the roll");
    assert_eq!(heard["roll"], roll);
    let told = lock(&reader.told);
    assert!(
        told[seen..]
            .iter()
            .any(|(to, e, p)| to.iter().any(|w| w == "other")
                && e == "collab-roll"
                && p["roll"] == roll),
        "the other window heard nothing"
    );
}

/// What device `d` told its window for `path` since `seen`, applied.
fn hear_path(d: &Device, seen: &mut usize, path: &str, doc: &Doc) {
    let told = lock(&d.told);
    for (to, event, payload) in &told[*seen..] {
        if to.iter().any(|w| w == WINDOW) && event == "collab-update" && payload["path"] == path {
            apply(doc, &payload["update"]);
        }
    }
    *seen = told.len();
}

/// A board's element written into the room as a window's board writes
/// it: an entry per element and version, the entries it outranks gone.
fn put_element(doc: &Doc, id: &str, version: i64, nonce: i64, el: &Value) -> String {
    use yrs::Map;
    let map = doc.get_or_insert_map(verso_server::collab_board::ELEMENTS);
    let mut txn = doc.transact_mut();
    let older: Vec<String> = map
        .keys(&txn)
        .filter(|k| k.starts_with(&format!("{id}\n")))
        .map(str::to_owned)
        .collect();
    for k in older {
        map.remove(&mut txn, &k);
    }
    let mut el = el.clone();
    el["id"] = json!(id);
    el["version"] = json!(version);
    el["versionNonce"] = json!(nonce);
    map.insert(
        &mut txn,
        format!("{id}\n{version}\n{nonce}"),
        el.to_string(),
    );
    STANDARD.encode(txn.encode_update_v1())
}

/// A meta entry of a board's room: drawn in, a person's edit.
fn put_meta(doc: &Doc, key: &str, value: yrs::Any) -> String {
    use yrs::Map;
    let meta = doc.get_or_insert_map(verso_server::collab_board::META);
    let mut txn = doc.transact_mut();
    meta.insert(&mut txn, key, value);
    STANDARD.encode(txn.encode_update_v1())
}

/// A text file and a board of a synced folder are live as a note is (ADR
/// 0082 item 12): their rooms over the sync's link, the edits of two
/// devices merged — the text letter by letter, the board element by
/// element — the room writing the server's file and sync bringing it
/// down over each local one, no copy made.
#[test]
fn a_synced_text_file_and_board_are_live_and_the_files_follow() {
    const TXT: &str = "lista.txt";
    const BOARD: &str = "Mesa.canvas";
    let r = serve(&[(TXT, "um\n"), (BOARD, "{\"nodes\":[],\"edges\":[]}")]);
    let a = device(&r, &r.owner, &[]);
    let b = device(&r, &r.owner, &[]);
    for d in [&a, &b] {
        let mut l = kept(d);
        on(d, &mut l);
        drop_link(d, l);
    }
    let (mut la, mut lb) = (kept(&a), kept(&b));
    let (mut sa, mut sb) = (lock(&a.told).len(), lock(&b.told).len());

    // The text file: a room of text, typed on both devices at once.
    let ja = cmd(&a, "collab_join", json!({ "path": TXT })).unwrap();
    let jb = cmd(&b, "collab_join", json!({ "path": TXT })).unwrap();
    assert_eq!(ja["kind"], "text", "{ja}");
    let (ta, tb) = (doc(), doc());
    apply(&ta, &ja["update"]);
    apply(&tb, &jb["update"]);
    let ua = insert(&ta, 0, "zero\n");
    let ub = insert(&tb, 9, "dois\n");
    cmd(&a, "collab_update", json!({ "path": TXT, "update": ua })).unwrap();
    cmd(&b, "collab_update", json!({ "path": TXT, "update": ub })).unwrap();
    sleep(Duration::from_millis(300));
    hear_path(&a, &mut sa, TXT, &ta);
    hear_path(&b, &mut sb, TXT, &tb);
    assert_eq!(text_of(&ta), "zero\num\ndois\n");
    assert_eq!(text_of(&ta), text_of(&tb));
    cmd(&a, "collab_save", json!({ "path": TXT })).unwrap();

    // The board: drawn in by the first device, then a shape moved on one
    // and a text added on the other, at once.
    let ba = cmd(&a, "collab_join", json!({ "path": BOARD })).unwrap();
    assert_eq!(ba["kind"], "board", "{ba}");
    let (da, db) = (doc(), doc());
    apply(&da, &ba["update"]);
    let seed = put_element(
        &da,
        "r1",
        1,
        0,
        &json!({ "type": "rectangle", "x": 0, "index": "a1" }),
    );
    cmd(
        &a,
        "collab_update",
        json!({ "path": BOARD, "update": seed }),
    )
    .unwrap();
    let seeded = put_meta(&da, "seeded", yrs::Any::Bool(true));
    cmd(
        &a,
        "collab_update",
        json!({ "path": BOARD, "update": seeded }),
    )
    .unwrap();
    let bb = cmd(&b, "collab_join", json!({ "path": BOARD })).unwrap();
    apply(&db, &bb["update"]);
    let moved = put_element(
        &da,
        "r1",
        2,
        5,
        &json!({ "type": "rectangle", "x": 80, "index": "a1" }),
    );
    let mark_a = put_meta(&da, &format!("edit:{}", da.client_id()), yrs::Any::from(1));
    let added = put_element(
        &db,
        "t1",
        1,
        9,
        &json!({ "type": "text", "text": "olá", "index": "a2" }),
    );
    let mark_b = put_meta(&db, &format!("edit:{}", db.client_id()), yrs::Any::from(1));
    for u in [&moved, &mark_a] {
        cmd(&a, "collab_update", json!({ "path": BOARD, "update": u })).unwrap();
    }
    for u in [&added, &mark_b] {
        cmd(&b, "collab_update", json!({ "path": BOARD, "update": u })).unwrap();
    }
    sleep(Duration::from_millis(300));
    hear_path(&a, &mut sa, BOARD, &da);
    hear_path(&b, &mut sb, BOARD, &db);
    let room = verso_server::collab_board::elements(&da);
    assert_eq!(room, verso_server::collab_board::elements(&db));
    assert_eq!(room["r1"]["x"], 80);
    assert_eq!(room["t1"]["text"], "olá");
    // The file, as a window's converter makes it of the room's state,
    // handed over the sync's link; the room writes it.
    let drawing: Vec<Value> = room.values().cloned().collect();
    let canvas = json!({ "nodes": [], "edges": [], "verso": { "version": 1, "drawing": drawing } });
    let at = STANDARD.encode(verso_server::collab_board::state_vector(&da));
    cmd(
        &a,
        "collab_canvas",
        json!({ "path": BOARD, "at": at, "json": canvas.to_string() }),
    )
    .unwrap();
    let saved = cmd(&a, "collab_save", json!({ "path": BOARD }));
    assert!(saved.is_ok(), "{saved:?}");

    // Sync brings both saves down over each device's files: no copy.
    sleep(SETTLE);
    on(&a, &mut la);
    on(&b, &mut lb);
    for d in [&a, &b] {
        assert_eq!(text(d, TXT).as_deref(), Some("zero\num\ndois\n"));
        let board: Value = serde_json::from_str(&text(d, BOARD).unwrap()).unwrap();
        let drawn = board["verso"]["drawing"].as_array().unwrap();
        assert_eq!(drawn.len(), 2, "{board}");
        assert!(copies(d).is_empty(), "{:?}", copies(d));
    }
}

#[test]
fn pausing_sync_takes_a_live_note_out_of_its_room_and_resuming_brings_it_back() {
    let (_r, a, _b) = two();
    let mut la = kept(&a);
    let mut ta = Tab::open(&a);
    a.s.pause(true);
    assert!(live::up(&a.s).is_none());
    assert!(!a.s.live.holds(NOTE));
    let refused = cmd(&a, "collab_update", json!({ "path": NOTE, "update": "" })).unwrap_err();
    assert_eq!(refused["kind"], "unavailable", "{refused}");
    // The tab goes local: its text saved here.
    insert(&ta.doc, 99, "pausada\n");
    ta.local(&a);
    sleep(Duration::from_millis(300));
    // Resumed: the room was left and written, so it is another — the
    // ordinary comparison sends the text, and the tab joins anew.
    a.s.pause(false);
    assert!(live::up(&a.s).is_some());
    ta.rejoin(&a, &mut la);
    assert!(ta.text().contains("pausada"), "{}", ta.text());
    assert!(a.s.live.holds(NOTE));
    assert!(copies(&a).is_empty());
}

/// A test server listens on the loopback and never asks the release feed.
struct Loopback;

impl verso_server::config::Env for Loopback {
    fn var(&self, name: &str) -> Option<String> {
        match name {
            "VERSO_LISTEN" => Some("127.0.0.1:0".to_owned()),
            "VERSO_UPDATE_CHECK" => Some("off".to_owned()),
            _ => None,
        }
    }
}

/// A receiver who synced a share as a folder of this computer (ADR 0082
/// item 13, ADR 0081 items 6 and 12) edits its note in the owner's room:
/// the server re-roots the share's path under the owner's folder, both
/// ways, so the owner in the browser and the receiver's tab are one room.
#[test]
fn a_synced_shares_note_is_live_in_the_owners_room() {
    let data = tempfile::tempdir().unwrap();
    let folders = tempfile::tempdir().unwrap();
    // The server's folder on disk, made as tests_sync.rs makes it: no
    // `std::fs` in the app's crate (ADR 0029).
    let named = |prefix: &str, at: &std::path::Path| {
        tempfile::Builder::new()
            .prefix(prefix)
            .rand_bytes(0)
            .tempdir_in(at)
            .unwrap()
            .keep()
    };
    let mesa = named("Mesa", &named("Campanha", folders.path()));
    let mut note = tempfile::Builder::new()
        .prefix(NOTE)
        .rand_bytes(0)
        .tempfile_in(&mesa)
        .unwrap();
    std::io::Write::write_all(&mut note, b"# Sessao\n").unwrap();
    note.keep().unwrap();
    let config = verso_server::config::Config::from_env(
        &Loopback,
        &verso_server::config::Defaults {
            data_dir: data.path().to_owned(),
            folders_dir: folders.path().to_owned(),
            ui_dir: data.path().join("ui"),
        },
    )
    .unwrap();
    let db = verso_server::db::Db::open(data.path()).unwrap();
    let ana = db
        .create_account("ana@casa.lan", "Ana", "pt", Some("uma senha longa"), true)
        .unwrap();
    let caio = db
        .create_account(
            "caio@casa.lan",
            "Caio",
            "pt",
            Some("outra senha longa"),
            false,
        )
        .unwrap();
    let folder = db.create_folder("Campanha", &ana.id).unwrap();
    let share = db.make_share(&folder.id, "Mesa").unwrap();
    db.grant_share(&share.id, &caio.id, verso_server::db::Role::Editor)
        .unwrap();
    let (owner, _) = db
        .create_session(&ana.id, "device", "Verso · teste", "127.0.0.1")
        .unwrap();
    let (receiver, _) = db
        .create_session(&caio.id, "device", "Verso · Caio", "127.0.0.1")
        .unwrap();
    let server = verso_server::state::Server::new(
        config,
        db,
        verso_server::contract_version(),
        "test".into(),
    );
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    // Stopped when the test ends is let go (tests_sync::Running): a server left
    // running holds its descriptors until the test process ends.
    let (_stop, stopped) = tokio::sync::oneshot::channel::<()>();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            tokio::select! {
                _ = verso_server::run(server, listener, std::future::pending()) => {}
                _ = stopped => {}
            }
        });
        rt.shutdown_background();
    });
    let url = format!("http://localhost:{}", addr_rx.recv().unwrap().port());

    // Caio syncs the share — its id is the folder's, to the device — and
    // opens its note, live; Ana has it open in the browser, in her folder.
    let d = super::tests_sync::device_at(&url, &share.id, &receiver, &[]);
    let mut l = kept(&d);
    on(&d, &mut l);
    assert_eq!(text(&d, NOTE).as_deref(), Some("# Sessao\n"));
    let mut tab = Tab::open(&d);
    let mut c = browser_at(&url, &owner, &folder.id, "Mesa/Sessao.md");

    tab.type_live(&d, 9, "do Caio\n");
    c.type_live(0, "da Ana\n");
    saved(&mut c, &["do Caio", "da Ana"]);
    tab.hear(&d);
    assert_eq!(tab.text(), text_of(&c.doc));
    // The room wrote the owner's file; Caio's sync brings it down.
    on(&d, &mut l);
    assert_eq!(text(&d, NOTE), Some(c.file()));
    assert!(copies(&d).is_empty());
    drop_link(&d, l);
    c.remote.hang_up();
}

/* ---------- The feature's guardrail (ADR 0082 item 16) ---------- */

#[derive(Debug, Clone)]
enum Op {
    /// A device's tab (0, 1) or the browser (2) types a line at a line.
    Type(usize, usize),
    /// A program outside Verso adds a line to the note on a device.
    Outside(usize),
    /// A device's link drops.
    Drop(usize),
    /// A device's link comes back.
    Return(usize),
    /// A device's sync runs a pass.
    Sync(usize),
    /// The room settles and writes.
    Wait,
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![
        4 => (0..3_usize, 0..8_usize).prop_map(|(w, at)| Op::Type(w, at)),
        1 => (0..2_usize).prop_map(Op::Outside),
        2 => (0..2_usize).prop_map(Op::Drop),
        2 => (0..2_usize).prop_map(Op::Return),
        2 => (0..2_usize).prop_map(Op::Sync),
        1 => Just(Op::Wait),
    ]
}

/// One device in the run: its sync, its link while up, its tab.
struct Side {
    d: Device,
    l: Option<Link>,
    tab: Tab,
}

fn run(ops: &[Op]) {
    let (r, a, b) = two();
    let mut c = browser(&r);
    let mut sides: Vec<Side> = [a, b]
        .into_iter()
        .map(|d| {
            let l = kept(&d);
            let tab = Tab::open(&d);
            Side { d, l: Some(l), tab }
        })
        .collect();
    let mut typed: BTreeSet<String> = BTreeSet::new();
    let mut outside = false;
    let mut n = 0;
    let mut word = |typed: &mut BTreeSet<String>| {
        n += 1;
        let w = format!("t{n}");
        typed.insert(w.clone());
        format!("{w}\n")
    };
    for op in ops {
        for s in &mut sides {
            s.tab.hear(&s.d);
        }
        c.hear();
        match *op {
            Op::Type(2, at) => c.type_live(at, &word(&mut typed)),
            Op::Type(i, at) => {
                let w = word(&mut typed);
                let s = &mut sides[i];
                if s.l.is_some() {
                    s.tab.type_live(&s.d, at, &w);
                } else {
                    insert(&s.tab.doc, at, &w);
                    s.tab.local(&s.d);
                }
            }
            Op::Outside(i) => {
                // Only on a device whose tab is in the room: one out of it
                // would take the change in as the window does, which this
                // run does not play.
                if sides[i].l.is_none() {
                    continue;
                }
                // Written with nothing waiting in the room, and its pass
                // right after: sent into the room as one edit, or kept as
                // a copy — never a room stopped for the people in it to
                // choose, which this run does not play.
                saved(&mut c, &[]);
                let w = word(&mut typed);
                let s = &mut sides[i];
                let now = text(&s.d, NOTE).unwrap_or_default();
                write(&s.d, NOTE, format!("{now}{w}").as_bytes());
                if let Some(l) = s.l.as_mut() {
                    on(&s.d, l);
                }
                outside = true;
            }
            Op::Drop(i) => {
                let s = &mut sides[i];
                if let Some(l) = s.l.take() {
                    drop_link(&s.d, l);
                    s.tab.local(&s.d);
                }
            }
            Op::Return(i) => {
                let s = &mut sides[i];
                if s.l.is_none() {
                    let mut l = kept(&s.d);
                    s.tab.rejoin(&s.d, &mut l);
                    s.l = Some(l);
                }
            }
            Op::Sync(i) => {
                let s = &mut sides[i];
                if let Some(l) = s.l.as_mut() {
                    changed(&s.d, &[]);
                    on(&s.d, l);
                }
            }
            Op::Wait => sleep(SETTLE),
        }
        sleep(Duration::from_millis(100));
    }
    // Everyone back, the room settled, both devices in step.
    for s in &mut sides {
        if s.l.is_none() {
            let mut l = kept(&s.d);
            s.tab.rejoin(&s.d, &mut l);
            s.l = Some(l);
        }
    }
    for _ in 0..3 {
        saved(&mut c, &[]);
        for s in &mut sides {
            s.tab.hear(&s.d);
            changed(&s.d, &[]);
            if let Some(l) = s.l.as_mut() {
                on(&s.d, l);
            }
        }
    }
    c.hear();
    let server = c.file();
    let mut kept_somewhere = server.clone();
    for s in &sides {
        assert_eq!(
            text(&s.d, NOTE).as_deref(),
            Some(server.as_str()),
            "{ops:?}"
        );
        for copy in copies(&s.d) {
            kept_somewhere.push_str(&text(&s.d, &copy).unwrap_or_default());
        }
    }
    // No edit lost: every line typed, in the room or out of it, is in the
    // note or in a conflict's copy.
    for w in &typed {
        assert!(
            kept_somewhere.lines().any(|l| l == w),
            "{w} lost: {server:?} {ops:?}"
        );
    }
    // And a copy only for an outside program's edit: a note live on a
    // device makes none of its own text (ADR 0079 items 7 and 8, revised).
    if !outside {
        for s in &sides {
            assert!(copies(&s.d).is_empty(), "{:?} {ops:?}", files(&s.d));
        }
    }
    // The connections let go: a run is one of many.
    for s in &mut sides {
        if let Some(l) = s.l.take() {
            drop_link(&s.d, l);
        }
    }
    c.remote.hang_up();
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 6,
        failure_persistence: None,
        max_shrink_iters: 4,
        ..ProptestConfig::default()
    })]

    #[test]
    fn live_notes_end_the_same_everywhere_and_lose_no_edit(ops in prop::collection::vec(op(), 6..14)) {
        run(&ops);
    }
}

/// Opening a note of a folder of 500 notes, with sync settled, joins its
/// room in a moment: the join waits for nothing but the server's answer
/// (night round 2026-10-30: 1–2 s on an idle server).
#[test]
fn a_join_in_a_folder_of_500_notes_is_prompt() {
    let bodies: Vec<(String, String)> = (0..500)
        .map(|i| {
            (
                format!("Nota {i:03}.md"),
                format!("# Nota {i}\n\nTexto {i}\n"),
            )
        })
        .collect();
    let refs: Vec<(&str, &str)> = bodies
        .iter()
        .map(|(n, t)| (n.as_str(), t.as_str()))
        .collect();
    let r = serve(&refs);
    let d = device(&r, &r.owner, &[]);
    let mut l = kept(&d);
    for _ in 0..20 {
        on(&d, &mut l);
        if files(&d).len() == 500 {
            break;
        }
    }
    assert_eq!(files(&d).len(), 500);
    // A reconnection, as an app start makes it: the link new, the first
    // pass not yet run.
    drop_link(&d, l);
    let _l = kept(&d);
    let mut worst = Duration::ZERO;
    for i in [7, 123, 499] {
        let path = format!("Nota {i:03}.md");
        let t = std::time::Instant::now();
        let joined = cmd(&d, "collab_join", json!({ "path": path })).unwrap();
        let took = t.elapsed();
        eprintln!("join {path}: {took:?}");
        assert!(joined["epoch"].as_str().is_some_and(|e| !e.is_empty()));
        worst = worst.max(took);
        cmd(&d, "collab_leave", json!({ "path": path })).unwrap();
    }
    // A generous bound (a loaded Windows VM runs the whole suite at once):
    // before the fix a join sat out the sync's pauses for seconds. That a
    // join ends the settling pause exactly is the `settle_*` tests' job.
    assert!(worst < Duration::from_millis(2000), "joined in {worst:?}");
}

/// A note changed on this device a moment before its tab joins: the join
/// waits for the pass that sends the text, and that pass does not wait out
/// the pause that lets a burst of changes settle (500 ms).
#[test]
fn a_join_after_a_local_change_does_not_wait_out_the_settling_pause() {
    let r = serve(&[(NOTE, "# Sessao\n")]);
    let d = device(&r, &r.owner, &[]);
    tauri::async_runtime::spawn(sync::run(Arc::clone(&d.ctx), Arc::clone(&d.s)));
    // In step, and the loop in its pause after the pass.
    let deadline = std::time::Instant::now() + Duration::from_secs(20);
    while text(&d, NOTE).is_none() {
        assert!(std::time::Instant::now() < deadline, "the note never came");
        sleep(Duration::from_millis(50));
    }
    sleep(Duration::from_millis(700));
    write(&d, NOTE, b"# Sessao\n\nescrito aqui\n");
    // The watcher's wake has been taken and the pause is on.
    sleep(Duration::from_millis(100));
    write(&d, NOTE, b"# Sessao\n\nescrito aqui, de novo\n");
    let t = std::time::Instant::now();
    let joined = cmd(&d, "collab_join", json!({ "path": NOTE })).unwrap();
    let took = t.elapsed();
    d.s.stop();
    assert!(joined["epoch"].as_str().is_some_and(|e| !e.is_empty()));
    // Generous (see `a_join_in_a_folder_of_500_notes_is_prompt`): the exact
    // property is in `settle_is_skipped_only_while_a_join_waits`.
    assert!(took < Duration::from_millis(1500), "joined in {took:?}");
    let doc = doc();
    apply(&doc, &joined["update"]);
    assert!(text_of(&doc).contains("de novo"), "{}", text_of(&doc));
}

/// A hurry nobody was waiting for leaves nothing behind: the next, unrelated
/// settling pause is whole (a rename done by another program as a delete
/// and a create settles into one pass).
#[test]
fn a_stray_hurry_does_not_shorten_the_next_settling_pause() {
    let live = live::Live::default();
    live.hurry();
    let t = std::time::Instant::now();
    tauri::async_runtime::block_on(live.settle(Duration::from_millis(300)));
    assert!(
        t.elapsed() >= Duration::from_millis(290),
        "paused {:?}",
        t.elapsed()
    );
}

/// While a join waits the pause is skipped, and it is whole again once the
/// join has ended.
#[test]
fn settle_is_skipped_only_while_a_join_waits() {
    let live = live::Live::default();
    let waiting = live.wait_for_pass();
    let t = std::time::Instant::now();
    tauri::async_runtime::block_on(live.settle(Duration::from_secs(5)));
    assert!(
        t.elapsed() < Duration::from_secs(2),
        "paused {:?}",
        t.elapsed()
    );
    drop(waiting);
    let t = std::time::Instant::now();
    tauri::async_runtime::block_on(live.settle(Duration::from_millis(300)));
    assert!(t.elapsed() >= Duration::from_millis(290));
}
