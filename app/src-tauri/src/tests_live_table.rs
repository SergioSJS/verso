// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table and the campaign's controls of a synced folder (ADR 0107 item
//! 9, ADR 0110) against a real `verso serve` on this machine, with no
//! window: a folder of this computer that syncs with one folder of the
//! server, its window's `table_*` and `campaign_*` commands answered over
//! the sync's connection, and a second connection playing the browser at
//! the same table.

use std::time::{Duration, Instant};

use serde_json::{Value, json};

use super::sync::Link;
use super::sync::live;
use super::tests_sync::{Device, Running, device, kept, serve};
use super::*;

const WINDOW: &str = "w";

/// A window's command on device `d`, as the window sends it.
fn cmd(d: &Device, cmd: &str, args: Value) -> Result<Value, Value> {
    tauri::async_runtime::block_on(live::command(&d.ctx, &d.s, WINDOW, cmd, args))
}

/// Events the sync told the window `WINDOW`, with this name.
fn told(d: &Device, event: &str) -> Vec<Value> {
    lock(&d.told)
        .iter()
        .filter(|(to, e, _)| e == event && to.iter().any(|w| w == WINDOW))
        .map(|(_, _, p)| p.clone())
        .collect()
}

/// Wait until the window has been told at least `n` of `event`.
fn heard(d: &Device, event: &str, n: usize) -> Vec<Value> {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let got = told(d, event);
        if got.len() >= n {
            return got;
        }
        assert!(
            Instant::now() < deadline,
            "{event}: told {} of {n}",
            got.len()
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// The browser: a second connection on the server's folder.
pub(super) struct Browser {
    remote: Arc<remote::Remote>,
    heard: tokio::sync::mpsc::UnboundedReceiver<remote::Heard>,
}

pub(super) fn browser(r: &Running, token: &str) -> Browser {
    let login = verso_core::servers::ServerLogin {
        url: r.url.clone(),
        token: token.to_owned(),
        email: "x@casa.lan".into(),
        name: "X".into(),
    };
    tauri::async_runtime::block_on(async {
        let (remote, heard) = remote::dial(&login, r.folder.clone()).await.unwrap();
        remote
            .call("open_server_folder", json!({ "id": r.folder }))
            .await
            .unwrap();
        Browser { remote, heard }
    })
}

impl Browser {
    pub(super) fn call(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        tauri::async_runtime::block_on(self.remote.call(cmd, args))
    }

    /// The roster, once it is told with `n` at the table.
    fn roster(&mut self, n: usize) -> Value {
        loop {
            let told = self.event("table-roster");
            let list = told["members"].clone();
            if list.as_array().is_some_and(|l| l.len() == n) {
                return list;
            }
        }
    }

    /// The next event of this name, waited for.
    fn event(&mut self, name: &str) -> Value {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            while let Ok(h) = self.heard.try_recv() {
                if let remote::Heard::Event(e, p) = h
                    && e == name
                {
                    return p;
                }
            }
            assert!(Instant::now() < deadline, "{name} was not told");
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

/// A device with its link up, the folder in step.
fn linked(r: &Running, token: &str) -> (Device, Link) {
    let d = device(r, token, &[]);
    let l = kept(&d);
    (d, l)
}

#[test]
fn a_synced_folders_window_is_at_the_servers_table_rolls_says_and_hears() {
    let r = serve(&[("Sessao.md", "# Sessao\n")]);
    let (d, _l) = linked(&r, &r.owner);
    let mut web = browser(&r, &r.reader);
    web.call("table_join", json!({})).unwrap();

    let joined = cmd(&d, "table_join", json!({ "color": null, "styles": null })).unwrap();
    assert_eq!(joined["role"], "owner", "{joined}");
    // The browser is told who came.
    web.roster(2);

    // A message and a roll of the device: the table's entries, the sender's
    // window told its own too (the window holds an entry once, by number).
    let said = cmd(&d, "table_say", json!({ "text": "Boa noite" })).unwrap();
    assert_eq!(said["text"], "Boa noite");
    let rolled = cmd(
        &d,
        "table_roll",
        json!({ "notation": "1d20+3", "source": null, "path": "Sessao.md", "secret": false, "styles": null }),
    )
    .unwrap();
    assert_eq!(rolled["path"], "Sessao.md");
    assert!(rolled["roll"]["total"].is_number(), "{rolled}");
    assert_eq!(heard(&d, "table-entry", 2).len(), 2);

    // The browser says something: the device's window hears it live.
    web.call("table_say", json!({ "text": "Oi, mestre" }))
        .unwrap();
    let entries = heard(&d, "table-entry", 3);
    assert_eq!(entries[2]["text"], "Oi, mestre", "{entries:?}");
    // And the browser heard the device's two.
    assert_eq!(web.event("table-entry")["text"], "Boa noite");

    // History, a pin, a deletion of its own message, and a clear (owner).
    let page = cmd(&d, "table_history", json!({ "before": null, "limit": 50 })).unwrap();
    assert_eq!(page["entries"].as_array().unwrap().len(), 3, "{page}");
    let id = said["id"].clone();
    cmd(&d, "table_pin", json!({ "id": id, "pinned": true })).unwrap();
    assert_eq!(heard(&d, "table-pinned", 1)[0]["pinned"], true);
    cmd(&d, "table_delete", json!({ "id": id })).unwrap();
    assert_eq!(heard(&d, "table-removed", 1).len(), 1);
    cmd(&d, "table_clear", json!({ "keepPinned": false })).unwrap();
    assert_eq!(heard(&d, "table-cleared", 1).len(), 1);
}

#[test]
fn a_reader_synced_to_the_folder_is_at_the_table_with_a_readers_powers() {
    let r = serve(&[]);
    let (d, _l) = linked(&r, &r.reader);
    let joined = cmd(&d, "table_join", json!({})).unwrap();
    assert_eq!(joined["role"], "reader");
    cmd(&d, "table_say", json!({ "text": "Posso falar" })).unwrap();
    // Not an image, not a clear, and none of the game master's controls.
    assert!(cmd(&d, "table_send_image", json!({ "base64": "AAAA" })).is_err());
    assert!(cmd(&d, "table_clear", json!({ "keepPinned": true })).is_err());
    for (c, a) in [
        ("campaign_make", json!({ "root": "" })),
        ("campaign_release_all", json!({ "root": "" })),
        ("campaign_invite", json!({ "root": "" })),
    ] {
        let e = cmd(&d, c, a).unwrap_err();
        assert_eq!(e["kind"], "refused", "{c}: {e}");
    }
}

#[test]
fn the_campaign_controls_act_on_the_synced_server_folder_for_its_owner() {
    let r = serve(&[("Sessao.md", "# Sessao\n")]);
    // Made as tests_sync.rs makes the folder: no `std::fs` in the app's
    // crate (ADR 0029).
    let mapa = tempfile::Builder::new()
        .prefix("Mapa")
        .rand_bytes(0)
        .tempdir_in(r._dirs.1.path().join("Campanha"))
        .unwrap()
        .keep();
    let mut cidade = tempfile::Builder::new()
        .prefix("Cidade.md")
        .rand_bytes(0)
        .tempfile_in(&mapa)
        .unwrap();
    std::io::Write::write_all(&mut cidade, b"# Cidade\n").unwrap();
    cidade.keep().unwrap();
    let (d, _l) = linked(&r, &r.owner);

    let none = cmd(&d, "campaign_status", json!({})).unwrap();
    assert!(none["tables"].as_array().unwrap().is_empty(), "{none}");

    // A folder inside is made a table, by its path relative to the folder.
    let made = cmd(&d, "campaign_make", json!({ "root": "Mapa" })).unwrap();
    assert_eq!(made["viewer"], "owner", "{made}");
    assert_eq!(made["tables"][0]["root"], "Mapa", "{made}");
    assert_eq!(heard(&d, "campaign-changed", 1).len(), 1);
    let released = cmd(
        &d,
        "campaign_release",
        json!({ "paths": ["Mapa/Cidade.md"], "released": true }),
    )
    .unwrap();
    let cidade = released["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["path"] == "Mapa/Cidade.md")
        .unwrap();
    assert_eq!(cidade["released"], true, "{released}");
    cmd(
        &d,
        "campaign_secret_name",
        json!({ "path": "Mapa/Cidade.md", "on": true }),
    )
    .unwrap();
    cmd(
        &d,
        "campaign_grant",
        json!({ "path": "Mapa/Cidade.md", "grant": { "kind": "group" } }),
    )
    .unwrap();
    let closed = cmd(
        &d,
        "campaign_settings",
        json!({ "root": "Mapa", "open": false }),
    )
    .unwrap();
    assert_eq!(closed["tables"][0]["open"], false, "{closed}");
    cmd(
        &d,
        "campaign_settings",
        json!({ "root": "Mapa", "open": true }),
    )
    .unwrap();
    cmd(&d, "campaign_release_all", json!({ "root": "Mapa" })).unwrap();
    assert!(heard(&d, "campaign-changed", 5).len() >= 5);

    // Confinement: a path that leaves the folder, or a hidden one, is
    // refused as it is for a window on the server's folder.
    for root in ["../Outra", "/etc", ".verso", "Nada/Aqui"] {
        assert!(
            cmd(&d, "campaign_make", json!({ "root": root })).is_err(),
            "{root}"
        );
    }
    cmd(&d, "campaign_unmake", json!({ "root": "Mapa" })).unwrap();
    let after = cmd(&d, "campaign_status", json!({})).unwrap();
    assert!(after["tables"].as_array().unwrap().is_empty(), "{after}");
}

#[test]
fn an_invitation_asks_for_the_proof_first_over_the_device_session_too() {
    let r = serve(&[]);
    let (d, _l) = linked(&r, &r.owner);
    cmd(&d, "campaign_make", json!({ "root": "" })).unwrap();
    let e = cmd(&d, "campaign_invite", json!({ "root": "" })).unwrap_err();
    assert_eq!(e["kind"], "prove_first", "{e}");
    // The device's session proves itself (`server_prove`), and asks again.
    let (url, token) = (r.url.clone(), r.owner.clone());
    let sent = remote::http()
        .unwrap()
        .post(format!("{url}/api/me/prove"))
        .bearer_auth(token)
        .json(&json!({ "password": "uma senha longa" }))
        .send()
        .unwrap();
    assert!(sent.status().is_success(), "{}", sent.status());
    let link = cmd(&d, "campaign_invite", json!({ "root": "" })).unwrap();
    assert!(
        link["link"].as_str().is_some_and(|u| !u.is_empty()),
        "{link}"
    );
}

#[test]
fn without_the_link_the_table_is_unavailable_and_the_campaign_says_none() {
    let r = serve(&[]);
    let (d, l) = linked(&r, &r.owner);
    cmd(&d, "table_join", json!({})).unwrap();
    // The link drops, as a network drops it.
    l.socket.as_ref().unwrap().hang_up();
    drop(l);
    d.s.live.lost();
    assert!(live::up(&d.s).is_none());

    let e = cmd(&d, "table_join", json!({})).unwrap_err();
    assert_eq!(e["kind"], "unavailable", "{e}");
    for (c, a) in [
        ("table_say", json!({ "text": "oi" })),
        ("table_roll", json!({ "notation": "1d6" })),
        ("table_history", json!({})),
        ("campaign_make", json!({ "root": "" })),
    ] {
        assert_eq!(cmd(&d, c, a).unwrap_err()["kind"], "unavailable", "{c}");
    }
    // Leaving needs no connection; the status is "none", not an error.
    assert!(cmd(&d, "table_leave", json!({})).is_ok());
    let status = cmd(&d, "campaign_status", json!({})).unwrap();
    assert_eq!(status["viewer"], "none");
    assert_eq!(status["can_invite"], false);
}

#[test]
fn a_new_link_is_at_no_table_until_the_window_joins_again() {
    let r = serve(&[]);
    let (d, l) = linked(&r, &r.owner);
    let mut web = browser(&r, &r.reader);
    web.call("table_join", json!({})).unwrap();
    cmd(&d, "table_join", json!({})).unwrap();
    l.socket.as_ref().unwrap().hang_up();
    drop(l);
    d.s.live.lost();
    // Back: the server knows a new connection, at no table.
    let _l = kept(&d);
    let e = cmd(&d, "table_say", json!({ "text": "ainda" })).unwrap_err();
    assert!(e["message"].as_str().unwrap().contains("join"), "{e}");
    // The window joins again and is heard again.
    cmd(&d, "table_join", json!({})).unwrap();
    cmd(&d, "table_say", json!({ "text": "de volta" })).unwrap();
    assert_eq!(web.event("table-entry")["text"], "de volta");
}

#[test]
fn the_last_window_to_leave_takes_the_connection_out_of_the_table() {
    let r = serve(&[]);
    let (d, _l) = linked(&r, &r.owner);
    let mut web = browser(&r, &r.reader);
    web.call("table_join", json!({})).unwrap();
    cmd(&d, "table_join", json!({})).unwrap();
    web.roster(2);
    cmd(&d, "table_leave", json!({})).unwrap();
    // The roster the browser is told has only itself.
    web.roster(1);
    let e = cmd(&d, "table_say", json!({ "text": "fora" })).unwrap_err();
    assert!(e["message"].as_str().unwrap().contains("join"), "{e}");
}

#[test]
fn a_synced_folders_window_is_told_the_server_its_link_reaches() {
    let r = serve(&[]);
    let (d, _l) = linked(&r, &r.owner);
    // The address the sync's link was made to, not the app's own origin: what
    // a table's relative link (`/invite/<token>`) is opened at.
    let at = remote::server_window(&d.s.live.remote().unwrap());
    assert_eq!(at.url, r.url.trim_end_matches('/'));
    assert!(!at.folder.is_empty());
}

/// One chat per table, over the sync's link too (ADR 0107 as amended
/// 2026-10-23): the window at one table is told that table's entries, a
/// browser at the other one is told the other's, and neither hears across.
#[test]
fn two_tables_keep_their_chats_apart_over_the_sync_link() {
    let r = serve(&[("Sessao.md", "# Sessao\n")]);
    for name in ["Mapa", "Cripta"] {
        let _kept = tempfile::Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempdir_in(r._dirs.1.path().join("Campanha"))
            .unwrap()
            .keep();
    }
    let (d, _l) = linked(&r, &r.owner);
    for root in ["Mapa", "Cripta"] {
        let made = cmd(&d, "campaign_make", json!({ "root": root })).unwrap();
        assert_eq!(made["viewer"], "owner", "{made}");
    }
    let mut web = browser(&r, &r.reader);
    let there = web
        .call("table_join", json!({ "table": "Cripta" }))
        .unwrap();
    assert_eq!(there["table"], "Cripta", "{there}");
    let here = cmd(&d, "table_join", json!({ "table": "Mapa" })).unwrap();
    assert_eq!(here["table"], "Mapa", "{here}");

    // Said at one table, heard at that one only.
    cmd(
        &d,
        "table_say",
        json!({ "text": "no mapa", "table": "Mapa" }),
    )
    .unwrap();
    assert_eq!(heard(&d, "table-entry", 1)[0]["table"], "Mapa");
    web.call(
        "table_say",
        json!({ "text": "na cripta", "table": "Cripta" }),
    )
    .unwrap();
    assert_eq!(web.event("table-entry")["text"], "na cripta");
    std::thread::sleep(Duration::from_millis(500));
    assert_eq!(
        told(&d, "table-entry").len(),
        1,
        "the other table was heard"
    );
    // The roster of each is its own.
    assert_eq!(here["roster"].as_array().unwrap().len(), 1);

    // The window goes to the other table: the connection leaves the first
    // when no window of this app is left at it, and hears the second.
    cmd(&d, "table_leave", json!({ "table": "Mapa" })).unwrap();
    cmd(&d, "table_join", json!({ "table": "Cripta" })).unwrap();
    web.roster(2);
    web.call("table_say", json!({ "text": "de novo", "table": "Cripta" }))
        .unwrap();
    assert_eq!(heard(&d, "table-entry", 2)[1]["text"], "de novo");
}

/// The same account on two devices (2026-10-24, the game master on the phone
/// and on the Mac): what one rolls or says, the other hears live, at the
/// folder's own table and at a table in a subfolder. The entry names the one
/// account both times, so the window can tell "mine" (the account's) from
/// "made here" only by its own commands' answers.
fn same_account_hears_the_other_device(table: &str) {
    let r = serve(&[("Sessao.md", "# Sessao\n")]);
    if !table.is_empty() {
        let _kept = tempfile::Builder::new()
            .prefix(table)
            .rand_bytes(0)
            .tempdir_in(r._dirs.1.path().join("Campanha"))
            .unwrap()
            .keep();
    }
    let (d, _l) = linked(&r, &r.owner);
    if !table.is_empty() {
        let made = cmd(&d, "campaign_make", json!({ "root": table })).unwrap();
        assert_eq!(made["viewer"], "owner", "{made}");
    }
    // The phone: another connection of the SAME account.
    let mut web = browser(&r, &r.owner);
    let there = web.call("table_join", json!({ "table": table })).unwrap();
    let here = cmd(&d, "table_join", json!({ "table": table })).unwrap();
    assert_eq!(there["you"], here["you"], "one account on both devices");

    // The phone rolls: the Mac's window is told, the entry the account's own.
    let rolled = web
        .call(
            "table_roll",
            json!({ "notation": "1d20", "source": null, "path": null, "secret": false, "styles": null, "table": table }),
        )
        .unwrap();
    let got = heard(&d, "table-entry", 1);
    assert_eq!(got[0]["id"], rolled["id"], "{got:?}");
    assert_eq!(got[0]["by_id"], here["you"]);
    assert_eq!(got[0]["table"], table);

    // The Mac rolls: the phone is told.
    let mine = cmd(
        &d,
        "table_roll",
        json!({ "notation": "1d6", "source": null, "path": null, "secret": false, "styles": null, "table": table }),
    )
    .unwrap();
    let mut on_phone = web.event("table-entry");
    while on_phone["id"] != mine["id"] {
        on_phone = web.event("table-entry");
    }
    assert_eq!(on_phone["by_id"], here["you"]);
}

#[test]
fn the_same_account_on_two_devices_hears_each_others_rolls_at_the_folders_table() {
    same_account_hears_the_other_device("");
}

#[test]
fn the_same_account_on_two_devices_hears_each_others_rolls_at_a_subfolders_table() {
    same_account_hears_the_other_device("Mapa");
}
