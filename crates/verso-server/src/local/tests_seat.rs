// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The game master's own window at the table (ADR 0117 D4 Q3 and Q4): a
//! client of its own server through the door in memory, as the owner; at
//! the same table as a player on the network; its token nothing anywhere
//! else; the hide lock as for everyone; gone with serving. See `seat.rs`.

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use super::seat::{SEAT_DEVICE, Seat};
use super::tests::{Lab, lab, run};
use super::tests_parts::lab_in_part;
use super::{LocalSettings, lock};
use crate::db::Role;
use crate::state::Server;

const PASSWORD: &str = "uma senha longa da mesa 2026";

/// The running server, as the tests look into it.
pub(super) fn server_of(lab: &Lab) -> Arc<Server> {
    Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server)
}

fn campanha(lab: &Lab) -> std::path::PathBuf {
    lab.notes.path().join("Campanha")
}

/// The window's connection, as the host makes it: the contract's WebSocket
/// over a connection in memory, with the seat's token.
async fn window(seat: &Seat) -> WebSocketStream<tokio::io::DuplexStream> {
    let mut req = "ws://127.0.0.1/api/ws".into_client_request().unwrap();
    req.headers_mut().insert(
        "authorization",
        format!("Bearer {}", seat.token()).parse().unwrap(),
    );
    let (ws, _) = tokio_tungstenite::client_async(req, seat.connect().unwrap())
        .await
        .unwrap();
    ws
}

/// The next text message, whatever it is.
pub(super) async fn message<S>(ws: &mut WebSocketStream<S>) -> Value
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
            .await
            .expect("a message in time")
            .expect("the socket is open")
            .unwrap();
        if let Message::Text(t) = m {
            return serde_json::from_str(&t).unwrap();
        }
    }
}

/// A command's answer; what comes before it is passed over.
pub(super) async fn ask<S>(ws: &mut WebSocketStream<S>, id: u64, cmd: &str, args: Value) -> Value
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let text = json!({ "id": id, "cmd": cmd, "args": args }).to_string();
    ws.send(Message::Text(text.into())).await.unwrap();
    loop {
        let v = message(ws).await;
        if v["id"].as_u64() == Some(id) {
            return v;
        }
    }
}

/// The next event `name` whose payload `wanted` takes.
async fn heard<S>(ws: &mut WebSocketStream<S>, name: &str, wanted: impl Fn(&Value) -> bool) -> Value
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    loop {
        let v = message(ws).await;
        if v["event"] == name && wanted(&v["payload"]) {
            return v["payload"].clone();
        }
    }
}

/// The seat's connection with its folder open.
pub(super) async fn seated(seat: &Seat) -> WebSocketStream<tokio::io::DuplexStream> {
    let mut ws = window(seat).await;
    let hello = message(&mut ws).await;
    assert!(hello.get("hello").is_some(), "{hello}");
    let opened = ask(
        &mut ws,
        1,
        "open_server_folder",
        json!({ "id": seat.folder() }),
    )
    .await;
    assert!(opened.get("ok").is_some(), "{opened}");
    ws
}

/// A player accepts the table's invitation `link` on the network: their
/// cookie.
async fn accept(lab: &Lab, link: &str) -> String {
    let token = link.rsplit_once("/invite/").unwrap().1;
    let res = lab
        .client
        .post(lab.url(&format!("/api/invite/{token}")))
        .header("origin", lab.origin())
        .json(&json!({ "email": "ana@example.org", "name": "Ana", "password": PASSWORD, "lang": "pt" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 200, "accepting");
    res.headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .unwrap()
        .to_owned()
}

/// The seat's session, as the database has it.
fn seat_session(server: &Server) -> Option<String> {
    let owner = server.db.local_owner().unwrap();
    server
        .db
        .sessions_of(&owner.id)
        .unwrap()
        .into_iter()
        .find(|s| s.kind == "device" && s.device == SEAT_DEVICE)
        .map(|s| s.id)
}

/// The game master's window makes the folder a table, invites — its click
/// the fresh proof, and nothing else stamped — and sits at it with a
/// player who came in on the network: the player hears the master's
/// message, the master the player's roll. As the owner: the admin, the
/// folder's owner, no phone.
#[test]
fn the_owners_window_is_at_the_table_with_a_player() {
    run(async {
        let mut lab = lab();
        crate::data::write_for_tests(&campanha(&lab).join("mapa.png"), "png");
        lab.serve();
        let server = server_of(&lab);
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        // Through its door the seat is the owner, the server's admin.
        let me = seat.get("/api/me").unwrap();
        assert_eq!(me.status, 200);
        let me: Value = serde_json::from_slice(&me.body).unwrap();
        assert_eq!(me["account"]["email"], crate::db::LOCAL_OWNER, "{me}");
        assert_eq!(me["account"]["admin"], true, "{me}");

        let mut gm = seated(&seat).await;
        // A file of the folder the window opened, asked in process as the
        // window's are.
        let file = seat.get(&format!("/f/{}/mapa.png", seat.folder())).unwrap();
        assert_eq!((file.status, file.body.as_slice()), (200, &b"png"[..]));
        let made = ask(&mut gm, 2, "campaign_make", json!({ "root": "" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        // The proof is the click: unstamped, the invitation is refused, as a
        // UniVerso refuses it; a command that needs none stamps nothing.
        let early = ask(&mut gm, 3, "campaign_invite", json!({ "root": "" })).await;
        assert_eq!(early["err"]["kind"], "prove_first", "{early}");
        seat.acted("table_say").unwrap();
        let session = seat_session(&server).unwrap();
        assert_eq!(server.db.proved_at(&session).unwrap(), Some(0));
        seat.acted("campaign_invite").unwrap();
        let invited = ask(&mut gm, 4, "campaign_invite", json!({ "root": "" })).await;
        let link = invited["ok"]["link"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        assert!(link.contains("/invite/"), "{invited}");

        let cookie = accept(&lab, &link).await;
        let mut ana = lab.connect(&cookie).await.unwrap();
        assert!(message(&mut ana).await.get("hello").is_some());
        let opened = ask(
            &mut ana,
            1,
            "open_server_folder",
            json!({ "id": seat.folder() }),
        )
        .await;
        assert!(opened.get("ok").is_some(), "{opened}");

        let look = json!({ "color": "#3b82f6", "styles": null });
        let joined = ask(&mut gm, 5, "table_join", look.clone()).await;
        assert_eq!(joined["ok"]["role"], "owner", "{joined}");
        let joined = ask(&mut ana, 2, "table_join", look).await;
        assert!(joined.get("ok").is_some(), "{joined}");

        let said = ask(
            &mut gm,
            6,
            "table_say",
            json!({ "text": "Boa noite, mesa" }),
        )
        .await;
        assert_eq!(said["ok"]["text"], "Boa noite, mesa", "{said}");
        let entry = heard(&mut ana, "table-entry", |p| p["text"] == "Boa noite, mesa").await;
        assert_eq!(entry["by"], said["ok"]["by"]);

        let rolled = ask(
            &mut ana,
            3,
            "table_roll",
            json!({ "notation": "1d20", "source": null, "path": null, "secret": null, "styles": null }),
        )
        .await;
        assert_eq!(rolled["ok"]["kind"], "roll", "{rolled}");
        let entry = heard(&mut gm, "table-entry", |p| p["by"] == "Ana").await;
        assert_eq!(entry["roll"]["total"], rolled["ok"]["roll"]["total"]);
        // The seat is no phone: no row, none of the phones' places.
        assert_eq!(server.db.phone_role(&session).unwrap(), None);
        assert_eq!(lab.local.status().unwrap().phones_connected, 0);
    });
}

/// The owner renamed for the players while sitting at the table (the
/// re-test of 2026-11-04: new lines kept the old name until the window
/// left the table and sat again): the next line on the same connection
/// carries the new name; a line said before keeps the name it had.
#[test]
fn a_new_name_for_the_players_reaches_the_seats_next_lines() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let mut gm = seated(&seat).await;
        let made = ask(&mut gm, 2, "campaign_make", json!({ "root": "" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        let look = json!({ "color": "#3b82f6", "styles": null });
        let joined = ask(&mut gm, 3, "table_join", look).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        seat.acted("table_say").unwrap();
        let before = ask(&mut gm, 4, "table_say", json!({ "text": "antes" })).await;
        let old = before["ok"]["by"].as_str().unwrap_or_default().to_owned();
        assert!(!old.is_empty() && old != "Mestre Sérgio", "{before}");

        lab.local.set_owner_name("Mestre Sérgio").unwrap();
        seat.acted("table_say").unwrap();
        let after = ask(&mut gm, 5, "table_say", json!({ "text": "depois" })).await;
        assert_eq!(after["ok"]["by"], "Mestre Sérgio", "{after}");
        seat.acted("table_roll").unwrap();
        let rolled = ask(
            &mut gm,
            6,
            "table_roll",
            json!({ "notation": "1d20", "source": null, "path": null, "secret": null, "styles": null }),
        )
        .await;
        assert_eq!(rolled["ok"]["by"], "Mestre Sérgio", "{rolled}");
        // What was said before keeps the name it was said under.
        let history = ask(&mut gm, 7, "table_history", json!({})).await;
        let rows = history["ok"]["entries"]
            .as_array()
            .or_else(|| history["ok"].as_array())
            .cloned()
            .unwrap_or_default();
        let said = |text: &str| {
            rows.iter()
                .find(|r| r["text"] == text)
                .map(|r| r["by"].clone())
        };
        assert_eq!(said("antes"), Some(Value::String(old)), "{history}");
        assert_eq!(said("depois"), Some(json!("Mestre Sérgio")), "{history}");
    });
}

/// A player of this app's server renames themself on their account page
/// (the maintainer, 2026-11-05: *"o NOME … NÃO CONSIGO ALTERAR"*): the
/// app's server routes `PATCH /api/me` as a UniVerso does, the account
/// says the new name, and the table's next line from them carries it. A
/// paired phone renames no one: it is the owner's device.
#[test]
fn a_player_renames_themself_and_the_table_says_the_new_name() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let mut gm = seated(&seat).await;
        let made = ask(&mut gm, 2, "campaign_make", json!({ "root": "" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        seat.acted("campaign_invite").unwrap();
        let invited = ask(&mut gm, 3, "campaign_invite", json!({ "root": "" })).await;
        let link = invited["ok"]["link"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        let cookie = accept(&lab, &link).await;

        let renamed = lab
            .client
            .patch(lab.url("/api/me"))
            .header("origin", lab.origin())
            .header("cookie", &cookie)
            .header(
                "x-verso-csrf",
                super::tests_devices::csrf(&lab, &cookie).await,
            )
            .json(&json!({ "name": "Ana Clara", "lang": "pt" }))
            .send()
            .await
            .unwrap();
        assert_eq!(renamed.status().as_u16(), 200, "the name is routed");
        let (_, me) = lab.get("/api/me", Some(&cookie)).await;
        assert_eq!(me["account"]["name"], "Ana Clara", "{me}");

        let mut ana = lab.connect(&cookie).await.unwrap();
        assert!(message(&mut ana).await.get("hello").is_some());
        let opened = ask(
            &mut ana,
            1,
            "open_server_folder",
            json!({ "id": seat.folder() }),
        )
        .await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let look = json!({ "color": "#3b82f6", "styles": null });
        assert!(
            ask(&mut gm, 4, "table_join", look.clone())
                .await
                .get("ok")
                .is_some()
        );
        assert!(
            ask(&mut ana, 2, "table_join", look)
                .await
                .get("ok")
                .is_some()
        );
        let said = ask(&mut ana, 3, "table_say", json!({ "text": "Oi, mesa" })).await;
        assert_eq!(said["ok"]["by"], "Ana Clara", "{said}");
        let entry = heard(&mut gm, "table-entry", |p| p["text"] == "Oi, mesa").await;
        assert_eq!(entry["by"], "Ana Clara", "{entry}");

        // A phone is the owner's device: the route is not its.
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let res = lab
            .client
            .patch(lab.url("/api/me"))
            .header("origin", lab.origin())
            .header("cookie", &phone)
            .header(
                "x-verso-csrf",
                super::tests_devices::csrf(&lab, &phone).await,
            )
            .json(&json!({ "name": "Outro", "lang": "pt" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 404);
        assert_ne!(lab.local.owner_name().unwrap(), "Outro");
    });
}

/// The seat's token opens nothing but through its door: not on the
/// network's listener, not through the internet link's, not beside a
/// phone's cookie; a phone runs no `local_server_` command, the seat's
/// included.
#[test]
fn the_seats_token_opens_nothing_outside_its_door() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let file = format!("/f/{}/Sessao.md", seat.folder());
        for path in ["/api/me", "/api/folders", file.as_str()] {
            let res = lab
                .client
                .get(lab.url(path))
                .bearer_auth(seat.token())
                .send()
                .await
                .unwrap();
            assert_eq!(res.status().as_u16(), 401, "{path} on the network");
        }
        // Through the link's listener, with the link's own name.
        let port = lab.local.link_open().unwrap();
        lab.local
            .set_link_origin(Some("https://tidy-otter-quiet-lamp.trycloudflare.com"))
            .unwrap();
        let res = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/api/me"))
            .header("host", "tidy-otter-quiet-lamp.trycloudflare.com")
            .header("x-forwarded-for", "198.51.100.7")
            .header("x-forwarded-proto", "https")
            .bearer_auth(seat.token())
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401, "through the link");
        // A phone that presents it beside its own cookie is no one.
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let res = lab
            .client
            .get(lab.url("/api/me"))
            .header("cookie", &cookie)
            .bearer_auth(seat.token())
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401, "a phone with the seat's token");
        // And on its own, the phone runs none of the computer's commands.
        let mut phone = super::tests::open(&lab, &cookie).await;
        let refused =
            super::tests::call(&mut phone, 7, "local_server_sit_at_table", json!({})).await;
        assert_eq!(refused["err"]["kind"], "not_on_phone", "{refused}");
        assert_eq!(
            super::allow::verdict("local_server_sit_at_table"),
            super::allow::Verdict::Refuse
        );
        // Its own door still lets it in.
        assert_eq!(seat.get("/api/me").unwrap().status, 200);
    });
}

/// The window sits with only the internet link serving, the network's box
/// unticked: the door needs no listener of either.
#[test]
fn the_window_sits_with_the_link_alone() {
    run(async {
        let lab = lab();
        let settings = lab.local.settings().unwrap();
        lab.local
            .set_settings(&LocalSettings {
                network: false,
                ..settings
            })
            .unwrap();
        lab.local.link_open().unwrap();
        assert!(lab.local.status().unwrap().port.is_none(), "no network");
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let mut gm = seated(&seat).await;
        let joined = ask(
            &mut gm,
            2,
            "table_join",
            json!({ "color": null, "styles": null }),
        )
        .await;
        assert_eq!(joined["ok"]["role"], "owner", "{joined}");
    });
}

/// The owner's window sits at a folder served in part (ADR 0117 R1,
/// 2026-11-05; before, it was refused and the maintainer's *Campanha
/// Fractal* had no table): all of it, its id, its files and the list; the
/// hide lock is the owner's phones' alone.
#[test]
fn the_window_sits_at_a_folder_served_in_part() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let vault = server_of(&lab)
            .db
            .folder_by_dir("Campanha")
            .unwrap()
            .unwrap()
            .id;
        assert_eq!(seat.folder(), vault);
        let mut gm = seated(&seat).await;
        let made = ask(&mut gm, 2, "campaign_make", json!({ "root": "Segredo" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        assert_eq!(
            seat.get(&format!("/f/{vault}/Segredo/x.png"))
                .unwrap()
                .status,
            200
        );
        let listed = seat.get("/api/folders").unwrap();
        let listed: Value = serde_json::from_slice(&listed.body).unwrap();
        let ids: Vec<&str> = listed["folders"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["id"].as_str())
            .collect();
        // The vault alone: the phones' part is not the window's.
        assert_eq!(ids, [vault.as_str()], "{listed}");
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let (status, _) = lab
            .get(&format!("/f/{vault}/Segredo/x.png"), Some(&phone))
            .await;
        assert_eq!(status, 404, "the phone by the vault's id");
    });
}

/// Only a folder served, while serving, has a seat; the seat ends with
/// serving — its connections, its token — and a start sweeps one a crash
/// left.
#[test]
fn a_seat_is_a_served_folders_and_ends_with_serving() {
    run(async {
        let mut lab = lab();
        let off = lab.local.sit(&campanha(&lab)).unwrap_err();
        assert!(off.contains("serving on"), "{off}");
        lab.serve();
        let elsewhere = lab.notes.path().join("Outra");
        crate::data::ensure_dir(&elsewhere).unwrap();
        let not_served = lab.local.sit(&elsewhere).unwrap_err();
        assert!(not_served.contains("not served"), "{not_served}");

        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        // A second window sits on the same session.
        let again = lab.local.sit(&campanha(&lab)).unwrap();
        assert_eq!(seat.token(), again.token());
        let mut gm = seated(&seat).await;
        let server = server_of(&lab);
        // *Forget all devices* forgets the phones: the owner's own window
        // at the table is none of them, and is not told its session ended.
        lab.local.forget_all().unwrap();
        let text = json!({ "id": 8, "cmd": "list_notes", "args": {} }).to_string();
        gm.send(Message::Text(text.into())).await.unwrap();
        loop {
            let v = message(&mut gm).await;
            assert!(v.get("gone").is_none(), "{v}");
            if v["id"] == 8 {
                assert_eq!(v["ok"], json!(["Sessao.md"]), "{v}");
                break;
            }
        }
        lab.local.stop();
        assert!(server.db.session(seat.token()).unwrap().is_none(), "ended");
        assert!(seat.connect().is_err(), "the door is closed");
        let closed = tokio::time::timeout(std::time::Duration::from_secs(10), async {
            while let Some(Ok(_)) = gm.next().await {}
        })
        .await;
        assert!(closed.is_ok(), "the window's connection closed");

        // One a crash left behind is swept at the next start.
        let owner = server.db.local_owner().unwrap();
        let (stale, _) = server
            .db
            .create_session(&owner.id, "device", SEAT_DEVICE, "127.0.0.1")
            .unwrap();
        drop(server);
        lab.serve();
        let server = server_of(&lab);
        assert!(server.db.session(&stale).unwrap().is_none(), "swept");
        let fresh = lab.local.sit(&campanha(&lab)).unwrap();
        assert_ne!(fresh.token(), seat.token());
        assert_eq!(fresh.get("/api/me").unwrap().status, 200);
    });
}
