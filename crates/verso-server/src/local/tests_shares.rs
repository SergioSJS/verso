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

use super::lock;
use super::seat::Seat;
use super::tests::{Lab, call, next, run};
use super::tests_accounts::accept;
use super::tests_devices::csrf;
use super::tests_parts::{NEEDLE, lab_in_part, set_chosen};
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

/// `Campanha` served in part (`Projetos` chosen, the owner's phones'), the
/// owner's window at it (ADR 0117 R1, 2026-11-05: the folder is the
/// owner's, whole or in part); Rui invited, given nothing yet.
async fn in_part_at_its_table() -> (Lab, Seat, String) {
    let mut lab = lab_in_part(&["Projetos"]);
    lab.serve();
    let seat = lab.local.sit(&campanha(&lab)).unwrap();
    let player = invited(&lab, RUI).await;
    (lab, seat, player)
}

/// The owner's window shares inside a folder served in part as on a
/// UniVerso: the phones' part is listed with no person in it (the owner's
/// own grant is the phones' mark, never a person the folder was shared
/// with); a folder not chosen is shared, and its player reaches it alone.
#[test]
fn the_owners_window_shares_inside_a_folder_served_in_part() {
    run(async {
        let (lab, seat, player) = in_part_at_its_table().await;
        let server = server_of(&lab);
        let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        assert_eq!(seat.folder(), vault.id);
        let (status, listed) = seat_asks(&seat, "GET", &shares_of(&vault.id), None);
        assert_eq!(status, 200, "{listed}");
        assert!(
            !listed["shares"]
                .to_string()
                .contains(crate::db::LOCAL_OWNER),
            "{listed}"
        );
        assert!(shared_with(&lab, &player).await.is_empty());
        let (status, made) = share(&seat, "Segredo", RUI, "reader");
        assert_eq!(status, 200, "{made}");
        let shares = shared_with(&lab, &player).await;
        assert_eq!(shares.len(), 1, "{shares:?}");
        let segredo = server.db.share_at(&vault.id, "Segredo").unwrap().unwrap();
        assert_eq!(shares[0]["id"], segredo.id.as_str());
        let mut ws = lab.connect(&player).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        let part = server.db.share_at(&vault.id, "Projetos").unwrap().unwrap();
        for (n, id) in [&vault.id, &part.id].into_iter().enumerate() {
            let opened = call(
                &mut ws,
                n as u64 + 1,
                "open_server_folder",
                json!({ "id": id }),
            )
            .await;
            assert!(opened.get("ok").is_none(), "{id}: {opened}");
        }
        let opened = call(
            &mut ws,
            5,
            "open_server_folder",
            json!({ "id": segredo.id }),
        )
        .await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let read = call(&mut ws, 6, "read_note", json!({ "path": "c.md" })).await;
        assert!(read.get("ok").is_some(), "{read}");
        let out = call(&mut ws, 7, "read_note", json!({ "path": "../Raiz.md" })).await;
        assert!(out.get("ok").is_none(), "{out}");
    });
}

/// A chosen folder — the phones' part — shared with a player opens for
/// them, that folder alone, and stays the phones' part: one share, two
/// kinds of people, each kept at the next start.
#[test]
fn a_chosen_folder_shared_with_a_player_opens_that_folder_alone() {
    run(async {
        let (mut lab, seat, player) = in_part_at_its_table().await;
        let (status, made) = share(&seat, "Projetos", RUI, "editor");
        assert_eq!(status, 200, "{made}");
        let shares = shared_with(&lab, &player).await;
        assert_eq!(shares.len(), 1, "{shares:?}");
        let mut ws = lab.connect(&player).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        let opened = call(
            &mut ws,
            1,
            "open_server_folder",
            json!({ "id": shares[0]["id"] }),
        )
        .await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let read = call(&mut ws, 2, "read_note", json!({ "path": "a.md" })).await;
        assert!(read.to_string().contains("linha de projeto"), "{read}");
        for path in ["../Raiz.md", "../Segredo/c.md", "Raiz.md"] {
            let out = call(&mut ws, 3, "read_note", json!({ "path": path })).await;
            assert!(out.get("ok").is_none(), "{path}: {out}");
            assert!(!out.to_string().contains(NEEDLE), "{path}");
        }
        drop(ws);
        drop(seat);
        lab.local.stop();
        lab.serve();
        assert_eq!(shared_with(&lab, &player).await.len(), 1);
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let (_, theirs) = lab.get("/api/folders", Some(&phone)).await;
        assert_eq!(
            theirs["folders"].as_array().map(Vec::len),
            Some(1),
            "{theirs}"
        );
    });
}

/// A share made while the folder was served whole stays when it is served
/// in part, as a UniVerso keeps it (R1: the chosen folders are the phones'
/// alone), and back to whole the phones' part goes while the player's
/// share stays.
#[test]
fn a_share_made_while_whole_stays_when_the_folder_is_served_in_part() {
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
        assert_eq!(shared_with(&lab, &player).await.len(), 2);
        lab.local.stop();
        set_chosen(&lab, &[]);
        lab.serve();
        assert_eq!(shared_with(&lab, &player).await.len(), 2);
        let server = server_of(&lab);
        let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        let owner = server.db.local_owner().unwrap();
        for share in server.db.shares_of(&vault.id).unwrap() {
            assert_eq!(
                server.db.share_role(&share.id, &owner.id).unwrap(),
                None,
                "{}",
                share.path
            );
        }
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
