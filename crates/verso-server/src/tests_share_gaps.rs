// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A share's window in the moment its shared folder moves or goes (the
//! audit of 2026-11-05): what is made at the shared folder's old place in
//! that moment is no longer the share's, and reaching it is BLOCKING. Each
//! test stops the step at that moment (`crate::pause`), writes a note at
//! the old place through the core as another window's write would land,
//! and asks as the person the folder was shared with.

use std::sync::Arc;

use serde_json::{Value, json};

use crate::pause::{arrived, hold};
use crate::state::Server;
use crate::tests::{Browser, Running, block_on, folder_id, put, sign_in, start};
use crate::tests_campaign::Win;

/// The owner's window on "Campanha", "Mesa" shared with Ana, and Ana's
/// window on the share.
async fn shared(r: &Running) -> (String, Win, Win) {
    let admin = sign_in(r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(r, &admin).await;
    let (mut owner, _) = Win::open(r, &admin, &id).await;
    let made = owner
        .call(
            "create_note",
            json!({ "name": "Mesa/Notas", "text": "notas\n" }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    r.server
        .db
        .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
        .unwrap();
    let (status, share) = put(
        r,
        &format!("/api/folders/{id}/shares"),
        json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
        &admin,
    )
    .await;
    assert_eq!(status, 200, "{share}");
    let ana: Browser = sign_in(r, "ana@casa.lan", "a senha da ana").await;
    let (ana, info) = Win::open(r, &ana, share["id"].as_str().unwrap()).await;
    assert!(info.get("ok").is_some(), "{info}");
    (id, owner, ana)
}

/// A note written at `name` through the core, as another window's create
/// lands on disk before its own bookkeeping.
fn written(server: &Arc<Server>, id: &str, name: &str) {
    let key = verso_service::lock(&server.keys)
        .iter()
        .find(|(_, f)| *f == id)
        .map(|(k, _)| k.clone())
        .unwrap();
    let made = server.service.with_key(&key, |ws| {
        verso_service::ops::dispatch(
            ws,
            "create_note",
            json!({ "name": name, "text": "zqnova privada\n" }),
        )
        .unwrap()
    });
    assert!(made.is_ok(), "{made:?}");
}

/// What Ana is shown of the note made at the old place.
async fn shown(ana: &mut Win) -> Vec<Value> {
    let listed = ana.call("list_notes", json!({})).await;
    let read = ana.call("read_note", json!({ "path": "Nova.md" })).await;
    [listed, read]
        .into_iter()
        .filter(|v| v.to_string().contains("Nova") || v.to_string().contains("zqnova"))
        .collect()
}

/// The owner's step `cmd` on "Mesa", stopped at `point`: a note made at
/// "Mesa/Nova" then, and Ana asking.
async fn in_the_moment(point: &'static str, cmd: &str, args: Value) {
    let r = start().await;
    let (id, mut owner, mut ana) = shared(&r).await;
    let base = owner.call("sync_state", json!({})).await["ok"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["path"] == "Mesa/Notas.md")
        .map(|f| f["hash"].clone())
        .unwrap();
    let mut args = args;
    if cmd == "sync_delete" {
        args["base"] = base;
    }
    let (heard, go) = hold(point, &id);
    let server = Arc::clone(&r.server);
    let step = owner.call(cmd, args);
    let asked = async {
        arrived(heard).await;
        written(&server, &id, "Mesa/Nova");
        let seen = shown(&mut ana).await;
        let _ = go.send(());
        seen
    };
    let (done, seen) = tokio::join!(step, asked);
    assert!(done.get("ok").is_some(), "{cmd}: {done}");
    assert_eq!(seen, Vec::<Value>::new(), "the new note reached Ana");
    assert_eq!(shown(&mut ana).await, Vec::<Value>::new());
}

#[test]
fn a_moved_shared_folders_old_place_is_not_the_shares_in_the_moment() {
    block_on(in_the_moment(
        "window-moved",
        "rename_entry",
        json!({ "from": "Mesa", "to": "Mesa velha" }),
    ));
}

#[test]
fn a_deleted_shared_folders_old_place_is_not_the_shares_in_the_moment() {
    block_on(in_the_moment(
        "window-deleted",
        "delete_entry",
        json!({ "path": "Mesa" }),
    ));
}
