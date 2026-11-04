// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Read links in "this app is a server" (ADR 0117 D9, S12; ADR 0105): the
//! owner makes one from the window at the table, its click the proof;
//! whoever holds it reads what it names and nothing else, on the network
//! and through the link; no player and no phone makes one; and a link
//! never opens a folder served in part, nor one not served. See
//! `read_links.rs`.

use std::sync::Arc;

use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use super::seat::Seat;
use super::tests::{Lab, Ws, call, run};
use super::tests_accounts::{NAME, accept};
use super::tests_parts::{NEEDLE, lab_in_part, set_chosen};
use super::{LocalSettings, lock};
use crate::db::{NewReadLink, Role};
use crate::state::Server;

fn server_of(lab: &Lab) -> Arc<Server> {
    Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server)
}

fn campanha(lab: &Lab) -> std::path::PathBuf {
    lab.notes.path().join("Campanha")
}

/// The owner makes a link from the window at the table: the click is the
/// proof. Its token.
fn make(seat: &Seat, kind: &str, path: &str) -> String {
    seat.acted("read_link_create").unwrap();
    let answer = seat
        .request(
            "POST",
            &format!("/api/folders/{}/readlinks", seat.folder()),
            Some(&json!({ "kind": kind, "path": path })),
        )
        .unwrap();
    let body: Value = serde_json::from_slice(&answer.body).unwrap();
    assert_eq!(answer.status, 200, "{body}");
    body["token"].as_str().unwrap().to_owned()
}

/// A visitor's GET on the network, with no credential: the status and the
/// body as text.
async fn visit(lab: &Lab, path: &str) -> (u16, String) {
    let res = lab.client.get(lab.url(path)).send().await.unwrap();
    let status = res.status().as_u16();
    (status, res.text().await.unwrap_or_default())
}

/// A visitor's window on link `token`, on the network.
async fn visitor_ws(lab: &Lab, token: &str) -> Result<Ws, u16> {
    let mut req = format!("wss://127.0.0.1:{}/r/{token}/ws", lab.port)
        .into_client_request()
        .unwrap();
    req.headers_mut()
        .insert("origin", lab.origin().parse().unwrap());
    let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
    let config = tokio_rustls::rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_root_certificates(Arc::clone(&lab.roots))
        .with_no_client_auth();
    let connector = tokio_tungstenite::Connector::Rustls(Arc::new(config));
    match tokio_tungstenite::connect_async_tls_with_config(req, None, false, Some(connector)).await
    {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
        Err(e) => panic!("{e}"),
    }
}

/// A visitor's window opened on link `token`, as its page opens it.
async fn reader(lab: &Lab, token: &str) -> Ws {
    let mut ws = visitor_ws(lab, token).await.unwrap();
    let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": "any" })).await;
    assert!(opened.get("ok").is_some(), "{opened}");
    ws
}

/// A visitor's window on link `token` through the internet link's
/// listener on `port`, as the tunnel forwards it.
async fn visitor_ws_by_link(port: u16, token: &str) -> Result<(), u16> {
    let mut req = format!("ws://127.0.0.1:{port}/r/{token}/ws")
        .into_client_request()
        .unwrap();
    let h = req.headers_mut();
    h.insert("host", NAME.parse().unwrap());
    h.insert("origin", super::tests_accounts::ORIGIN.parse().unwrap());
    h.insert("x-forwarded-for", "203.0.113.40".parse().unwrap());
    h.insert("x-forwarded-proto", "https".parse().unwrap());
    match tokio_tungstenite::connect_async(req).await {
        Ok(_) => Ok(()),
        Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
        Err(e) => panic!("{e}"),
    }
}

/// A read link's WebSockets are a few in "this app is a server" (64 in
/// all, shared by the network and the owner's window; the link's listener
/// has places of its own): past them the next is refused with 429, on the
/// network and through the link alike, and the owner's window is still
/// answered.
#[test]
fn a_read_link_holds_a_few_connections() {
    run(async {
        let mut lab = lab_in_part(&[]);
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local
            .set_link_origin(Some(super::tests_accounts::ORIGIN))
            .unwrap();
        lab.local.set_read_links(true).unwrap();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let token = make(&seat, "folder", "Projetos");
        let mut held = Vec::new();
        for _ in 0..crate::fair::LOCAL_PER_ACCOUNT {
            held.push(visitor_ws(&lab, &token).await.unwrap());
        }
        assert_eq!(visitor_ws(&lab, &token).await.err(), Some(429));
        assert_eq!(
            visitor_ws_by_link(port, &token).await.err(),
            Some(429),
            "through the link too"
        );
        let state = seat.request("GET", "/api/state", None).unwrap();
        assert_eq!(state.status, 200);
        drop(held);
    });
}

/// The owner turns links on and makes one to a note and one to a folder
/// from the window at the table — refused until the click proves it —
/// and a visitor with no account reads what each names and nothing else,
/// on the network and through the internet link; off ends them, on brings
/// them back. A player and a phone make none.
#[test]
fn the_owner_makes_a_link_and_it_opens_only_what_it_names() {
    run(async {
        let mut lab = lab_in_part(&[]);
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local
            .set_link_origin(Some(super::tests_accounts::ORIGIN))
            .unwrap();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let path = format!("/api/folders/{}/readlinks", seat.folder());
        let body = json!({ "kind": "folder", "path": "Projetos" });
        // Off until the owner turns links on (ADR 0105 item 3).
        assert!(!lab.local.read_links_on().unwrap());
        seat.acted("read_link_create").unwrap();
        let off = seat.request("POST", &path, Some(&body)).unwrap();
        assert_eq!(off.status, 403);
        assert!(String::from_utf8_lossy(&off.body).contains("read_links_off"));
        lab.local.set_read_links(true).unwrap();
        // The seat's session is a device's: no proof until the click.
        server_of(&lab)
            .db
            .age_proofs(&server_of(&lab).db.local_owner().unwrap().id, 24 * 3600)
            .unwrap();
        let unproved = seat.request("POST", &path, Some(&body)).unwrap();
        assert_eq!(unproved.status, 403, "made without the click");
        let folder = make(&seat, "folder", "Projetos");
        let note = make(&seat, "note", "Raiz.md");
        // A link to a folder: its files, by its own paths; nothing beside.
        let (status, state) = visit(&lab, &format!("/r/{folder}/state")).await;
        assert_eq!(status, 200, "{state}");
        // The visitor's page opens its window first, as it does.
        let mut seen = reader(&lab, &folder).await;
        let listed = call(&mut seen, 2, "list_notes", json!({})).await;
        assert!(listed.to_string().contains("a.md"), "{listed}");
        assert!(!listed.to_string().contains("Raiz"), "{listed}");
        assert_eq!(visit(&lab, &format!("/r/{folder}/f/img.png")).await.0, 200);
        for outside in [
            "..%2FSegredo%2Fx.png",
            "Segredo/x.png",
            "..%2FAnexos%2Foutra.png",
            "..%2FRaiz.md",
        ] {
            let (status, text) = visit(&lab, &format!("/r/{folder}/f/{outside}")).await;
            assert_eq!(status, 404, "{outside}");
            assert!(!text.contains(NEEDLE), "{outside}");
        }
        // A link to a note: the note, and nothing it does not embed.
        let (status, state) = visit(&lab, &format!("/r/{note}/state")).await;
        assert_eq!(status, 200);
        assert!(state.contains("Raiz"), "{state}");
        for outside in ["Segredo/x.png", "Anexos/outra.png", "Projetos/img.png"] {
            assert_eq!(
                visit(&lab, &format!("/r/{note}/f/{outside}")).await.0,
                404,
                "{outside}"
            );
        }
        let mut ws = reader(&lab, &note).await;
        let read = call(&mut ws, 3, "read_note", json!({ "path": "Segredo/c.md" })).await;
        assert!(read.get("ok").is_none(), "{read}");
        assert!(!read.to_string().contains(NEEDLE), "{read}");
        let wrote = call(
            &mut ws,
            4,
            "write_note",
            json!({ "path": "Raiz.md", "text": "x" }),
        )
        .await;
        assert!(wrote.get("ok").is_none(), "{wrote}");
        // Through the internet link, as on the network.
        let res = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/r/{folder}/state"))
            .header("host", NAME)
            .header("x-forwarded-for", "203.0.113.50")
            .header("x-forwarded-proto", "https")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200, "through the link");
        // Off: every link ends; on: they open again.
        lab.local.set_read_links(false).unwrap();
        assert_eq!(visit(&lab, &format!("/r/{folder}/state")).await.0, 404);
        lab.local.set_read_links(true).unwrap();
        assert_eq!(visit(&lab, &format!("/r/{folder}/state")).await.0, 200);
        // A player and a phone make none.
        let made = lab
            .local
            .invite_for_tests(Some("Campanha"), Some(Role::Editor))
            .unwrap();
        let player = accept(&lab, &made.link, "rui@example.org", "Rui").await;
        // Even owning the folder by a grant made by mistake.
        let server = server_of(&lab);
        let rui = server
            .db
            .account_by_email("rui@example.org")
            .unwrap()
            .unwrap();
        server
            .db
            .grant(seat.folder(), &rui.id, Role::Owner)
            .unwrap();
        let (_, st) = lab.get("/api/state", Some(&player)).await;
        let res = lab
            .client
            .post(lab.url(&path))
            .header("origin", lab.origin())
            .header("cookie", &player)
            .header("x-verso-csrf", st["csrf"].as_str().unwrap())
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 403, "a player made a link");
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let (status, _) = lab.post(&path, body.clone(), Some(&phone)).await;
        assert_eq!(status, 404, "a phone made a link");
        let actions: Vec<String> = lab
            .local
            .audit()
            .unwrap()
            .into_iter()
            .map(|a| a.action)
            .collect();
        for action in ["read_links_on", "read_links_off", "read_link_made"] {
            assert!(actions.iter().any(|a| a == action), "{action}");
        }
        assert!(crate::log::said(&folder).is_empty(), "a link in the log");
    });
}

/// A link never opens a folder served in part (the hide lock, ADR 0117 D3
/// item 1, for a link's reader): links made while the folder was served
/// whole — to all of it, to a note, to the very sub-folder later chosen —
/// open nothing once it is served in part, and neither does one made by
/// mistake on its id; a link to a folder no longer served opens nothing.
#[test]
fn a_read_link_never_opens_a_part_nor_a_folder_not_served() {
    run(async {
        let mut lab = lab_in_part(&[]);
        lab.serve();
        lab.local.set_read_links(true).unwrap();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let links = [
            make(&seat, "folder", ""),
            make(&seat, "note", "Raiz.md"),
            make(&seat, "folder", "Projetos"),
        ];
        for t in &links {
            assert_eq!(visit(&lab, &format!("/r/{t}/state")).await.0, 200);
        }
        drop(seat);
        lab.local.stop();
        set_chosen(&lab, &["Projetos"]);
        lab.serve();
        let server = server_of(&lab);
        let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        let owner = server.db.local_owner().unwrap();
        let (mistake, _) = server
            .db
            .make_read_link(&NewReadLink {
                folder: &vault.id,
                kind: "folder",
                path: "",
                made_by: &owner.id,
                expires: None,
                password: None,
            })
            .unwrap();
        for t in links.iter().chain([&mistake]) {
            for path in [
                format!("/r/{t}/state"),
                format!("/r/{t}/f/Segredo/x.png"),
                format!("/r/{t}/f/img.png"),
                format!("/r/{t}/f/Projetos/img.png"),
            ] {
                let (status, text) = visit(&lab, &path).await;
                assert_eq!(status, 404, "{path}");
                assert!(!text.contains(NEEDLE), "{path}");
            }
            assert_eq!(visitor_ws(&lab, t).await.err(), Some(404), "{t}");
        }
        // The folder no longer served at all: its links open nothing.
        lab.local.stop();
        set_chosen(&lab, &[]);
        let mesa = lab.notes.path().join("Mesa");
        crate::data::ensure_dir(&mesa).unwrap();
        lab.local
            .set_settings(&LocalSettings {
                folders: vec![mesa.to_string_lossy().into_owned()],
                ..lab.local.settings().unwrap()
            })
            .unwrap();
        lab.serve();
        for t in &links {
            assert_eq!(visit(&lab, &format!("/r/{t}/state")).await.0, 404);
        }
    });
}
