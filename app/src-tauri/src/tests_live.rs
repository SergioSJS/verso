// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Live co-editing of a synced folder (ADR 0082) against a real
//! `verso serve` on this machine, with no window: two folders of this
//! computer that sync with one folder of the server, a tab on each — a Yjs
//! document, as the window's — and a third connection playing the browser,
//! all in the room of one note.

// The server is not built for Windows (crates/verso-cli/Cargo.toml).
#![cfg(not(windows))]

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
        let joined = cmd(d, "collab_join", json!({ "path": NOTE })).unwrap();
        assert_eq!(joined["read_only"], false, "{joined}");
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
            if let remote::Heard::Event(event, payload) = h
                && event == "collab-update"
                && payload["path"] == self.path.as_str()
            {
                apply(&self.doc, &payload["update"]);
            }
        }
    }

    /// The note as the server's file holds it.
    fn file(&self) -> String {
        let note = self
            .call("read_note", json!({ "path": self.path }))
            .unwrap();
        note["text"].as_str().unwrap().to_owned()
    }
}

/// The room wrote what it holds, `must` among it: the server's file is the
/// browser's text, as heard — not a fixed wait, which a loaded machine
/// outruns.
fn saved(c: &mut Browser, must: &[&str]) {
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    loop {
        c.hear();
        let room = text_of(&c.doc);
        if must.iter().all(|w| room.contains(w)) && c.file() == room {
            return;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "the room did not write: {room:?} {:?}",
            c.file()
        );
        sleep(Duration::from_millis(100));
    }
}

/// The device's link dropped, as a network drops it (item 8).
fn drop_link(d: &Device, l: Link) {
    l.remote.hang_up();
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
    let t = Tab::open(&reader);
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
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            let _ = verso_server::run(server, listener, std::future::pending()).await;
        });
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
