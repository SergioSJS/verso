// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A Yjs client in a room is the account's that first wrote as it
//! (`writers.rs`; ADR 0083 item 14, decided by the maintainer on
//! 2026-10-14, "sim para os 2"). Against a real server, as
//! `tests_board_rooms.rs`: two people on one board, one writing as the
//! other's window; a window back on a new connection; a window's whole
//! state sent back with the other's items in it.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

use crate::collab_board::{self, tests::put};
use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, folder_id, next, post, sign_in, start,
};

/// The Yjs clients of the two people's windows: fixed, so that the other
/// can name one.
const ANA: u64 = 1001;
const BETO: u64 = 2002;

async fn window(r: &Running, b: &Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

/// A second person, invited to the folder as an editor.
async fn editor(r: &Running, admin: &Browser, id: &str) -> Browser {
    let (status, inv) = post(
        r,
        "/api/admin/invitations",
        json!({ "email": "beto@casa.lan", "folder": id, "role": "editor" }),
        Some(admin),
    )
    .await;
    assert_eq!(status, 200, "{inv}");
    let token = inv["link"].as_str().unwrap().rsplit('/').next().unwrap();
    let (status, accepted) = post(
        r,
        &format!("/api/invite/{token}"),
        json!({ "email": "beto@casa.lan", "name": "Beto", "password": "outra senha longa", "lang": "pt-BR" }),
        None,
    )
    .await;
    assert_eq!(status, 200, "{accepted}");
    sign_in(r, "beto@casa.lan", "outra senha longa").await
}

/// Into the room of `path`, as a window whose Yjs client is `client`.
async fn join(ws: &mut Socket, n: u64, path: &str, client: u64) -> Doc {
    let joined = call(ws, n, "collab_join", json!({ "path": path })).await;
    let state = STANDARD
        .decode(joined["ok"]["update"].as_str().unwrap())
        .unwrap();
    let doc = Doc::with_client_id(client);
    doc.transact_mut()
        .apply_update(Update::decode_v1(&state).unwrap())
        .unwrap();
    doc
}

async fn send(ws: &mut Socket, n: u64, path: &str, update: &[u8]) -> Value {
    call(
        ws,
        n,
        "collab_update",
        json!({ "path": path, "update": STANDARD.encode(update) }),
    )
    .await
}

fn whole(doc: &Doc) -> Vec<u8> {
    doc.transact()
        .encode_state_as_update_v1(&StateVector::default())
}

fn rect(x: i64) -> Value {
    json!({ "type": "rectangle", "x": x, "index": "a1" })
}

/// A board both people have joined: Ana's window drew `r1` in.
async fn board(r: &Running) -> (Browser, Browser, String, Socket, Socket, Doc, Doc) {
    let admin = sign_in(r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(r, &admin).await;
    let beto = editor(r, &admin, &id).await;
    let mut one = window(r, &admin, &id).await;
    let made = call(
        &mut one,
        2,
        "create_file",
        json!({ "path": "Mesa.canvas", "base64": STANDARD.encode("{\"nodes\":[],\"edges\":[]}") }),
    )
    .await;
    assert!(made.get("ok").is_some(), "{made}");
    let a = join(&mut one, 3, "Mesa.canvas", ANA).await;
    let drawn = put(&a, "r1", 1, 0, &rect(0));
    assert!(
        send(&mut one, 4, "Mesa.canvas", &drawn)
            .await
            .get("ok")
            .is_some()
    );
    let mut two = window(r, &beto, &id).await;
    let b = join(&mut two, 2, "Mesa.canvas", BETO).await;
    assert_eq!(collab_board::elements(&b).len(), 1);
    (admin, beto, id, one, two, a, b)
}

/// (a) Beto's window writes as Ana's, an element the room does not hold:
/// refused. Ana's window, the room and a window that joins agree; Ana's
/// next edit is taken. Ana's window gone, her client is still hers.
#[test]
fn a_window_that_writes_as_another_persons_window_is_refused() {
    block_on(async {
        let r = start().await;
        let (admin, beto, id, mut one, mut two, a, _) = board(&r).await;
        let forged = join(&mut two, 3, "Mesa.canvas", ANA).await;
        let as_ana = put(&forged, "r2", 1, 0, &rect(90));
        let refused = send(&mut two, 4, "Mesa.canvas", &as_ana).await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        let mut third = window(&r, &admin, &id).await;
        let t = join(&mut third, 2, "Mesa.canvas", 3003).await;
        assert_eq!(collab_board::elements(&t), collab_board::elements(&a));
        let moved = put(&a, "r1", 2, 5, &rect(40));
        assert!(
            send(&mut one, 5, "Mesa.canvas", &moved)
                .await
                .get("ok")
                .is_some()
        );
        let t = join(&mut third, 3, "Mesa.canvas", 3004).await;
        assert_eq!(collab_board::elements(&t), collab_board::elements(&a));
        // Ana's window closes; her client is not Beto's to take.
        drop(one);
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let mut again = window(&r, &beto, &id).await;
        let forged = join(&mut again, 2, "Mesa.canvas", ANA).await;
        let as_ana = put(&forged, "r3", 1, 0, &rect(120));
        let refused = send(&mut again, 3, "Mesa.canvas", &as_ana).await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
    });
}

/// (b) Ana's window back on a new connection, with an edit made while it
/// was away: its whole state goes to the room, and is taken.
#[test]
fn a_window_back_on_a_new_connection_sends_its_whole_state() {
    block_on(async {
        let r = start().await;
        let (admin, _, id, one, _two, a, _) = board(&r).await;
        drop(one);
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let _away = put(&a, "r2", 1, 0, &rect(60));
        let mut back = window(&r, &admin, &id).await;
        let state = call(
            &mut back,
            2,
            "collab_join",
            json!({ "path": "Mesa.canvas" }),
        )
        .await;
        assert!(state.get("ok").is_some(), "{state}");
        let taken = send(&mut back, 3, "Mesa.canvas", &whole(&a)).await;
        assert!(taken.get("ok").is_some(), "{taken}");
        // And it goes on editing on the new connection.
        let moved = put(&a, "r2", 2, 7, &rect(70));
        assert!(
            send(&mut back, 4, "Mesa.canvas", &moved)
                .await
                .get("ok")
                .is_some()
        );
    });
}

/// (c) Beto's window sends its whole state back, Ana's element in it:
/// what the room holds already is no one's to judge, and it is taken.
#[test]
fn a_whole_state_with_another_persons_items_is_taken() {
    block_on(async {
        let r = start().await;
        let (_, _, _, _one, mut two, a, b) = board(&r).await;
        let drawn = put(&b, "r2", 1, 0, &rect(30));
        assert!(
            send(&mut two, 3, "Mesa.canvas", &drawn)
                .await
                .get("ok")
                .is_some()
        );
        // Beto moves Ana's element: her item deleted, under her client.
        let moved = put(&b, "r1", 2, 9, &rect(10));
        assert!(
            send(&mut two, 4, "Mesa.canvas", &moved)
                .await
                .get("ok")
                .is_some()
        );
        let taken = send(&mut two, 5, "Mesa.canvas", &whole(&b)).await;
        assert!(taken.get("ok").is_some(), "{taken}");
        assert_eq!(collab_board::elements(&b).len(), 2);
        assert!(a.transact().state_vector().get(&yrs::ClientID::new(ANA)) > 0);
    });
}
