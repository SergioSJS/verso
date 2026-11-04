// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sharing in "this app is a server" (ADR 0117 D9; ADR 0081): the owner
//! shares a folder inside a served one with a person invited, from the
//! window at the table, its click the proof; the person opens it and
//! reads what it holds and nothing beside; a revocation holds at once; a
//! share outlives a restart. No player and no phone shares, and no share
//! is made of, or opens, a folder served in part.

use std::sync::Arc;

use serde_json::{Value, json};

use super::seat::Seat;
use super::tests::{Lab, call, next, run};
use super::tests_accounts::accept;
use super::tests_devices::csrf;
use super::tests_parts::{NEEDLE, lab_in_part, set_chosen};
use super::{LocalSettings, lock};
use crate::db::Role;
use crate::state::Server;

const RUI: &str = "rui@example.org";

fn server_of(lab: &Lab) -> Arc<Server> {
    Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server)
}

fn campanha(lab: &Lab) -> std::path::PathBuf {
    lab.notes.path().join("Campanha")
}

fn shares_of(id: &str) -> String {
    format!("/api/folders/{id}/shares")
}

/// A request of the window at the table, through the seat's door: the
/// status and the body.
fn seat_asks(seat: &Seat, method: &str, path: &str, body: Option<&Value>) -> (u16, Value) {
    let a = seat.request(method, path, body).unwrap();
    (
        a.status,
        serde_json::from_slice(&a.body).unwrap_or(Value::Null),
    )
}

/// The owner shares `path` of the seat's folder with `email` from the
/// window at the table: the click is the proof.
fn share(seat: &Seat, path: &str, email: &str, role: &str) -> (u16, Value) {
    seat.acted("share_grant").unwrap();
    seat_asks(
        seat,
        "PUT",
        &shares_of(seat.folder()),
        Some(&json!({ "path": path, "email": email, "role": role })),
    )
}

/// A page signed in with `cookie` sends `method` to `path`.
async fn as_page(lab: &Lab, method: reqwest::Method, path: &str, body: Value, cookie: &str) -> u16 {
    lab.client
        .request(method, lab.url(path))
        .header("origin", lab.origin())
        .header("cookie", cookie)
        .header("x-verso-csrf", csrf(lab, cookie).await)
        .json(&body)
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

/// The shares a person's list of folders has.
async fn shared_with(lab: &Lab, cookie: &str) -> Vec<Value> {
    let (status, mine) = lab.get("/api/folders", Some(cookie)).await;
    assert_eq!(status, 200, "{mine}");
    mine["folders"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|f| f["share"] == true)
        .cloned()
        .collect()
}

/// A person invited with no folder: their cookie.
async fn invited(lab: &Lab, email: &str) -> String {
    let made = lab.local.invite_for_tests(None, None).unwrap();
    accept(lab, &made.link, email, "Rui").await
}

/// The owner shares `Projetos` with an invited player from the window at
/// the table — refused until the click proves it, and never as an owner —
/// and the player opens it and reads its notes and nothing beside; the
/// share outlives a restart; revoked, the player's open window loses it at
/// once and their list no longer has it.
#[test]
fn the_owner_shares_a_folder_from_the_table_and_the_player_opens_it() {
    run(async {
        let mut lab = lab_in_part(&[]);
        lab.serve();
        let player = invited(&lab, RUI).await;
        assert!(shared_with(&lab, &player).await.is_empty());
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        // The seat's session is a device's: no proof until the click.
        let server = server_of(&lab);
        server
            .db
            .age_proofs(&server.db.local_owner().unwrap().id, 24 * 3600)
            .unwrap();
        let body = json!({ "path": "Projetos", "email": RUI, "role": "editor" });
        let (status, unproved) = seat_asks(&seat, "PUT", &shares_of(seat.folder()), Some(&body));
        assert_eq!(status, 403, "shared without the click: {unproved}");
        // The whole folder is given reading or editing, never the folder.
        let (status, owner) = share(&seat, "", RUI, "owner");
        assert_eq!(status, 400, "made an owner: {owner}");
        let (status, made) = share(&seat, "Projetos", RUI, "editor");
        assert_eq!(status, 200, "{made}");
        assert_eq!(made["people"][0]["email"], RUI, "{made}");
        let (status, listed) = seat_asks(&seat, "GET", &shares_of(seat.folder()), None);
        assert_eq!(status, 200, "{listed}");
        assert_eq!(listed["shares"][0]["path"], "Projetos", "{listed}");
        // Kept from one start to the next, as a UniVerso keeps it.
        drop(seat);
        lab.local.stop();
        lab.serve();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let shares = shared_with(&lab, &player).await;
        assert_eq!(shares.len(), 1, "{shares:?}");
        let id = shares[0]["id"].as_str().unwrap().to_owned();
        assert_eq!(shares[0]["role"], "editor", "{shares:?}");
        // The player opens it and reads its notes, by its own paths.
        let mut ws = lab.connect(&player).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let read = call(&mut ws, 2, "read_note", json!({ "path": "a.md" })).await;
        assert!(
            read.to_string().contains("linha de projeto"),
            "the shared note: {read}"
        );
        for outside in ["../Raiz.md", "Segredo/c.md", "../Segredo/c.md"] {
            let read = call(&mut ws, 3, "read_note", json!({ "path": outside })).await;
            assert!(read.get("ok").is_none(), "{outside}: {read}");
            assert!(!read.to_string().contains(NEEDLE), "{outside}: {read}");
        }
        // Revoked: the open window loses it at once, the list no longer has
        // it.
        let (status, revoked) = seat_asks(
            &seat,
            "POST",
            &format!("{}/revoke", shares_of(seat.folder())),
            Some(&json!({ "path": "Projetos", "account": RUI })),
        );
        assert_eq!(status, 200, "{revoked}");
        let read = call(&mut ws, 4, "read_note", json!({ "path": "a.md" })).await;
        assert!(
            read.get("ok").is_none(),
            "read after the revocation: {read}"
        );
        assert!(shared_with(&lab, &player).await.is_empty());
        let actions: Vec<String> = lab
            .local
            .audit()
            .unwrap()
            .into_iter()
            .map(|a| a.action)
            .collect();
        for action in ["share_editor", "share_revoke"] {
            assert!(actions.iter().any(|a| a == action), "{action}: {actions:?}");
        }
    });
}

/// No one but the owner's window shares here: a player with no part in the
/// folder, one invited to edit it, one made its owner by a grant made by
/// mistake — each refused, and none of them sees its shares; a phone is
/// answered as an unknown route.
#[test]
fn a_player_and_a_phone_share_nothing() {
    run(async {
        let mut lab = lab_in_part(&[]);
        lab.serve();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let path = shares_of(seat.folder());
        let body = json!({ "path": "Diario", "email": RUI, "role": "editor" });
        let player = invited(&lab, RUI).await;
        let put = reqwest::Method::PUT;
        // Nothing in the folder: it does not exist, to them.
        assert_eq!(
            as_page(&lab, put.clone(), &path, body.clone(), &player).await,
            404
        );
        let made = lab
            .local
            .invite_for_tests(Some("Campanha"), Some(Role::Editor))
            .unwrap();
        let editor = accept(&lab, &made.link, "ana@example.org", "Ana").await;
        let body = json!({ "path": "Diario", "email": "ana@example.org", "role": "editor" });
        assert_eq!(
            as_page(&lab, put.clone(), &path, body.clone(), &editor).await,
            403
        );
        // Even an owner by a grant made by mistake.
        let server = server_of(&lab);
        let ana = server
            .db
            .account_by_email("ana@example.org")
            .unwrap()
            .unwrap();
        server
            .db
            .grant(seat.folder(), &ana.id, Role::Owner)
            .unwrap();
        assert_eq!(
            as_page(&lab, put.clone(), &path, body.clone(), &editor).await,
            403,
            "an invited account shared the owner's folder"
        );
        let (status, _) = lab.get(&path, Some(&editor)).await;
        assert_eq!(status, 403, "an invited account listed the shares");
        assert!(
            server
                .db
                .share_at(seat.folder(), "Diario")
                .unwrap()
                .is_none()
        );
        // A phone: none of the routes.
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let (status, _) = lab.get(&path, Some(&phone)).await;
        assert_eq!(status, 404, "a phone listed the shares");
        let (status, _) = lab
            .post(
                &format!("{path}/revoke"),
                json!({ "path": "Diario" }),
                Some(&phone),
            )
            .await;
        assert_eq!(status, 404, "a phone revoked a share");
    });
}

/// `Campanha` served in part (`Projetos` chosen) beside `Mesa` served
/// whole, the owner's window at Mesa's table; Rui invited.
async fn in_part_beside_a_table() -> (Lab, Seat, String) {
    let mut lab = lab_in_part(&["Projetos"]);
    let mesa = lab.notes.path().join("Mesa");
    crate::data::ensure_dir(&mesa).unwrap();
    crate::data::write_for_tests(&mesa.join("Cena.md"), "# Cena\n");
    let mut folders = lab.local.settings().unwrap().folders;
    folders.push(mesa.to_string_lossy().into_owned());
    lab.local
        .set_settings(&LocalSettings {
            folders,
            ..lab.local.settings().unwrap()
        })
        .unwrap();
    lab.serve();
    let seat = lab.local.sit(&mesa).unwrap();
    let player = invited(&lab, RUI).await;
    (lab, seat, player)
}

/// A folder served in part has no shares to show or make, the owner's
/// window's included, even with a grant on it made by mistake (the hide
/// lock, `crate::access::role`): no answer names a path inside it, and
/// none of its parts' ids is a folder to share.
#[test]
fn no_share_is_made_of_a_folder_served_in_part() {
    run(async {
        let (lab, seat, _player) = in_part_beside_a_table().await;
        let server = server_of(&lab);
        let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        let owner = server.db.local_owner().unwrap();
        let part = server.db.share_at(&vault.id, "Projetos").unwrap().unwrap();
        // A grant on the vault made by mistake: the lock still holds.
        server.db.grant(&vault.id, &owner.id, Role::Owner).unwrap();
        for id in [vault.id.as_str(), part.id.as_str()] {
            let (status, listed) = seat_asks(&seat, "GET", &shares_of(id), None);
            assert_eq!(status, 404, "{id}: {listed}");
            assert!(!listed.to_string().contains("Projetos"), "{listed}");
            for path in ["Projetos", "Segredo", "Diario"] {
                seat.acted("share_grant").unwrap();
                let (status, made) = seat_asks(
                    &seat,
                    "PUT",
                    &shares_of(id),
                    Some(&json!({ "path": path, "email": RUI, "role": "reader" })),
                );
                assert_eq!(status, 404, "{id} {path}: {made}");
            }
        }
        assert!(server.db.share_at(&vault.id, "Segredo").unwrap().is_none());
        assert!(server.db.share_at(&vault.id, "Diario").unwrap().is_none());
        let rui = server.db.account_by_email(RUI).unwrap().unwrap();
        assert!(server.db.share_role(&part.id, &rui.id).unwrap().is_none());
        // The table beside it is shared as any whole folder is.
        crate::data::ensure_dir(&lab.notes.path().join("Mesa/Pistas")).unwrap();
        let (status, made) = share(&seat, "Pistas", RUI, "reader");
        assert_eq!(status, 200, "{made}");
    });
}

/// A part's share given to a player by mistake opens nothing for them: not
/// listed, not opened by its id, no note of it read (the hide lock for
/// every account, `shares::scope_for`).
#[test]
fn a_part_given_to_a_player_by_mistake_opens_nothing() {
    run(async {
        let (lab, _seat, player) = in_part_beside_a_table().await;
        let server = server_of(&lab);
        let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        let part = server.db.share_at(&vault.id, "Projetos").unwrap().unwrap();
        let rui = server.db.account_by_email(RUI).unwrap().unwrap();
        server
            .db
            .grant_share(&part.id, &rui.id, Role::Editor)
            .unwrap();
        let (_, mine) = lab.get("/api/folders", Some(&player)).await;
        assert!(!mine.to_string().contains(&part.id), "{mine}");
        assert!(!mine.to_string().contains("Projetos"), "{mine}");
        let mut ws = lab.connect(&player).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": part.id })).await;
        assert!(opened.get("ok").is_none(), "{opened}");
        let read = call(&mut ws, 2, "read_note", json!({ "path": "a.md" })).await;
        assert!(read.get("ok").is_none(), "{read}");
        assert!(!read.to_string().contains("linha de projeto"), "{read}");
        let (status, _) = lab
            .get(&format!("/f/{}/img.png", part.id), Some(&player))
            .await;
        assert_ne!(status, 200, "a part's file to a player");
    });
}

/// A share of a folder served whole ends when the folder is narrowed to
/// parts — even of the very folder then chosen — and does not come back.
#[test]
fn a_share_made_while_whole_ends_when_the_folder_is_served_in_part() {
    run(async {
        let mut lab = lab_in_part(&[]);
        lab.serve();
        let player = invited(&lab, RUI).await;
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        for path in ["Projetos", "Diario"] {
            let (status, made) = share(&seat, path, RUI, "reader");
            assert_eq!(status, 200, "{made}");
        }
        assert_eq!(shared_with(&lab, &player).await.len(), 2);
        drop(seat);
        lab.local.stop();
        set_chosen(&lab, &["Projetos"]);
        lab.serve();
        let (_, mine) = lab.get("/api/folders", Some(&player)).await;
        assert_eq!(
            shared_with(&lab, &player).await,
            Vec::<Value>::new(),
            "{mine}"
        );
        assert!(!mine.to_string().contains("Projetos"), "{mine}");
    });
}

/// A person with no account, invited to a folder from the share dialog of
/// the window at the table (decided 2026-11-04: as on a UniVerso, the
/// console's act `admin::acts::make_invitation`): the grant says the owner
/// may make an invitation link, the click is the proof; the link
/// opens where the table's invitations do (`Policy::links_base`) and carries
/// the share at its role, never the owner's; whoever accepts reaches that
/// folder and nothing beside, and the invitation is in Settings' list.
#[test]
fn the_window_at_the_table_invites_a_person_with_no_account_to_a_share() {
    run(async {
        let mut lab = lab_in_part(&[]);
        lab.serve();
        let seat = lab.local.sit(&campanha(&lab)).unwrap();
        let invite = format!("{}/invite", shares_of(seat.folder()));
        let to_rui = json!({ "path": "Projetos", "email": RUI, "role": "editor" });
        let (status, said) = share(&seat, "Projetos", RUI, "editor");
        assert_eq!(status, 400, "{said}");
        assert!(
            said["message"]
                .as_str()
                .unwrap()
                .contains("make an invitation link"),
            "{said}"
        );
        seat.acted("share_invite").unwrap();
        let (status, made) = seat_asks(&seat, "POST", &invite, Some(&to_rui));
        assert_eq!(status, 200, "{made}");
        let link = made["link"].as_str().unwrap().to_owned();
        let base = lab.local.links_base().unwrap();
        assert!(link.starts_with(&format!("{base}/invite/")), "{link}");
        seat.acted("share_invite").unwrap();
        let (status, owner) = seat_asks(
            &seat,
            "POST",
            &invite,
            Some(&json!({ "path": "", "email": "outra@example.org", "role": "owner" })),
        );
        assert_eq!(status, 400, "{owner}");
        let cookie = accept(&lab, &link, RUI, "Rui").await;
        let shares = shared_with(&lab, &cookie).await;
        assert_eq!(shares.len(), 1, "{shares:?}");
        let server = server_of(&lab);
        let rui = server.db.account_by_email(RUI).unwrap().unwrap();
        let folder = server.db.folder(seat.folder()).unwrap().unwrap();
        assert_eq!(server.db.role(&folder.id, &rui.id).unwrap(), None);
        let projetos = server.db.share_at(&folder.id, "Projetos").unwrap().unwrap();
        assert_eq!(
            server.db.share_role(&projetos.id, &rui.id).unwrap(),
            Some(Role::Editor)
        );
        let rows = lab.local.invitations().unwrap();
        assert!(rows.iter().any(|r| r.state == "used"), "{rows:?}");
    });
}
