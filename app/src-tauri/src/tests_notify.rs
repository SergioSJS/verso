// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the connection of a synced folder hears that a window says (ADR
//! 0084 item 7), against a real `verso serve` on this machine: the folder
//! near its quota goes to that folder's windows, a folder given on the
//! server to every window, naming the server.

use std::time::Duration;

use serde_json::{Value, json};

use super::tests_sync::{device, kept, on, serve, write};
use super::*;

/// The next event named `name` the device's connection heard, within 30 s.
fn heard(l: &mut sync::Link, name: &str) -> Value {
    tauri::async_runtime::block_on(async {
        tokio::time::timeout(Duration::from_secs(30), async {
            loop {
                match l.heard.recv().await {
                    Some(remote::Heard::Event(e, payload)) if e == name => return payload,
                    Some(_) => {}
                    None => panic!("the connection closed before {name}"),
                }
            }
        })
        .await
        .unwrap_or_else(|_| panic!("no {name} in time"))
    })
}

#[test]
fn a_synced_folder_near_its_quota_is_told_to_its_own_windows() {
    let r = serve(&[]);
    r.server
        .upgrade()
        .unwrap()
        .db
        .set_quota(&r.folder, Some(1000))
        .unwrap();
    let a = device(&r, &r.owner, &[]);
    write(&a, "Nota.md", "a".repeat(950).as_bytes());
    let mut l = kept(&a);
    on(&a, &mut l);
    // Pushed by the server after the device's write (ADR 0077 item 5).
    let payload = heard(&mut l, "folder-quota");
    sync::tell(&a.ctx, &a.s, "folder-quota", payload);
    // (The seat the first pass asked is said too: not what this is about.)
    let mut told = lock(&a.told).clone();
    told.retain(|(_, e, _)| e != "seat-changed");
    assert_eq!(told.len(), 1, "{told:?}");
    let (windows, event, quota) = &told[0];
    assert_eq!(windows, &["w".to_owned()]);
    assert_eq!(event, "folder-quota");
    assert_eq!(quota["quota"], json!(1000.0));
    assert!(
        quota["used"].as_f64().is_some_and(|u| u >= 950.0),
        "{quota}"
    );
    // Not every window's: only the folder's.
    assert!(lock(&a.all).is_empty());
}

#[test]
fn a_folder_given_on_the_server_is_told_to_every_window_naming_the_server() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[]);
    let mut l = kept(&a);
    {
        // As the server says it when Caio gives Ana a share (the server's
        // tests_share_given).
        let server = r.server.upgrade().unwrap();
        let ana = server.db.account_by_email("ana@casa.lan").unwrap().unwrap();
        server.push_sessions(
            &ana.id,
            &json!({ "event": "share-given", "payload": {
                "id": "s1", "name": "Mesa", "role": "reader", "by": "Caio",
                "share": true, "server": null,
            } }),
        );
    }
    let payload = heard(&mut l, "share-given");
    sync::tell(&a.ctx, &a.s, "share-given", payload);
    assert_eq!(
        *lock(&a.all),
        vec![(
            "share-given".to_owned(),
            json!({
                "id": "s1", "name": "Mesa", "role": "reader", "by": "Caio",
                "share": true, "server": r.url,
            })
        )]
    );
    assert!(lock(&a.told).is_empty());
}

/// The same naming for a window on a server's folder, whose connection
/// passes every other event as it came; one that does not read as a share
/// given is not said half.
#[test]
fn only_a_share_given_is_named_after_its_server() {
    let changed = json!({ "key": "k", "changed": [] });
    assert_eq!(
        remote::with_server("folder-changed", changed.clone(), "https://u"),
        Some(changed)
    );
    assert_eq!(
        remote::with_server("share-given", json!({ "id": 1 }), "https://u"),
        None
    );
}
