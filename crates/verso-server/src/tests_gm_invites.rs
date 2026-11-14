// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A game master the admin lets make folders invites people who have no
//! account into the tables of their own folders (ADR 0117 D7 (e), revising
//! ADR 0081 item 4): readers, audited, in the console's invitations, at
//! most 20 waiting, never into another's folder; the account made starts
//! without *may create folders*; the admin taking that power away ends the
//! invitations waiting and leaves whoever came in at their place.

use serde_json::{Value, json};

use crate::admin::acts::{GAME_MASTER_PENDING_MOST, Invitee, Inviter, Refused};
use crate::db::Role;
use crate::tests::{Browser, Running, block_on, folder_id, get, post, sign_in, start};
use crate::tests_campaign::Win;

const GIL: &str = "gil@casa.lan";
const GIL_PASSWORD: &str = "a senha do gil aqui";

/// Gil, an account the admin lets make folders, signed in, and a folder
/// Gil made, a table with a note, open in Gil's window.
struct Gm {
    r: Running,
    admin: Browser,
    gil: Browser,
    gil_id: String,
    folder: String,
    win: Win,
}

async fn gm() -> Gm {
    let r = start().await;
    let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let a = r
        .server
        .db
        .create_account(GIL, "Gil", "pt", Some(GIL_PASSWORD), false)
        .unwrap();
    r.server.db.set_powers(&a.id, false, true).unwrap();
    let gil = sign_in(&r, GIL, GIL_PASSWORD).await;
    let (status, made) = post(
        &r,
        "/api/folders",
        json!({ "name": "Mesa do Gil" }),
        Some(&gil),
    )
    .await;
    assert_eq!(status, 200, "{made}");
    let folder = made["id"].as_str().unwrap().to_owned();
    let (mut win, o) = Win::open(&r, &gil, &folder).await;
    assert!(o.get("ok").is_some(), "{o}");
    let note = win
        .call(
            "create_note",
            json!({ "name": "Abertura", "text": "Olá\n" }),
        )
        .await;
    assert!(note.get("ok").is_some(), "{note}");
    let table = win.call("campaign_make", json!({ "root": "" })).await;
    assert_eq!(table["ok"]["viewer"], "owner", "{table}");
    Gm {
        r,
        admin,
        gil,
        gil_id: a.id,
        folder,
        win,
    }
}

/// The token of a table's invitation, or the refusal.
fn token(made: &Value) -> Result<String, String> {
    match made["ok"]["link"].as_str() {
        Some(link) => Ok(link.rsplit('/').next().unwrap_or_default().to_owned()),
        None => Err(made["err"]["message"].as_str().unwrap_or("").to_owned()),
    }
}

async fn invite(win: &mut Win) -> Result<String, String> {
    token(&win.call("campaign_invite", json!({ "root": "" })).await)
}

/// A new account made through the link: its id.
async fn accept(r: &Running, token: &str, email: &str) -> String {
    let (status, joined) = post(
        r,
        &format!("/api/invite/{token}"),
        json!({ "email": email, "name": "Nova", "password": "uma senha longa aqui", "lang": "pt" }),
        None,
    )
    .await;
    assert_eq!(status, 200, "{joined}");
    r.server.db.account_by_email(email).unwrap().unwrap().id
}

async fn patch(r: &Running, path: &str, body: Value, b: &Browser) -> u16 {
    reqwest::Client::new()
        .patch(r.url(path))
        .header("origin", r.origin())
        .header("cookie", &b.cookie)
        .header("x-verso-csrf", &b.csrf)
        .json(&body)
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

#[test]
fn a_game_master_invites_a_reader_into_their_own_table() {
    block_on(async {
        let mut m = gm().await;
        let status = m.win.call("campaign_status", json!({})).await;
        assert_eq!(status["ok"]["can_invite"], true, "{status}");
        let t = invite(&mut m.win).await.unwrap();
        // The link opens, and gives reading of Gil's table.
        let (status, offer) = get(&m.r, &format!("/api/invite/{t}"), None).await;
        assert_eq!(status, 200, "{offer}");
        let nova = accept(&m.r, &t, "nova@casa.lan").await;
        assert_eq!(
            m.r.server.db.role(&m.folder, &nova).unwrap(),
            Some(Role::Reader)
        );
        // A player at the table, who makes no folders.
        let account = m.r.server.db.account(&nova).unwrap().unwrap();
        assert!(!account.may_create && !account.admin);
        let b = sign_in(&m.r, "nova@casa.lan", "uma senha longa aqui").await;
        let (status, _) = post(&m.r, "/api/folders", json!({ "name": "Da Nova" }), Some(&b)).await;
        assert_eq!(status, 403);
        let (mut w, o) = Win::open(&m.r, &b, &m.folder).await;
        assert!(o.get("ok").is_some(), "{o}");
        let seat = w.call("campaign_status", json!({})).await;
        assert_eq!(seat["ok"]["viewer"], "player", "{seat}");
        assert_eq!(seat["ok"]["can_invite"], false, "{seat}");
        // In the audit, by Gil, and in the console's list, made by Gil.
        let (_, log) = get(
            &m.r,
            &format!("/api/admin/audit?action=invitation_created&actor={GIL}"),
            Some(&m.admin),
        )
        .await;
        assert_eq!(log["total"], 1, "{log}");
        let (_, list) = get(&m.r, "/api/admin/invitations", Some(&m.admin)).await;
        let row = &list["rows"][0];
        assert_eq!(row["madeBy"], GIL, "{list}");
        assert_eq!(row["state"], "used", "{list}");
        assert_eq!(row["role"], "reader", "{list}");
        assert_eq!(row["usedBy"], "nova@casa.lan", "{list}");
    });
}

#[test]
fn the_share_dialog_invites_readers_only_for_a_game_master() {
    block_on(async {
        let m = gm().await;
        let at = format!("/api/folders/{}/shares", m.folder);
        // An e-mail no account has: Gil is told an invitation link may be
        // made, as the admin is.
        let (status, said) = crate::tests::put(
            &m.r,
            &at,
            json!({ "path": "", "email": "duda@casa.lan", "role": "reader" }),
            &m.gil,
        )
        .await;
        assert_eq!(status, 400, "{said}");
        assert!(
            said["message"]
                .as_str()
                .unwrap_or("")
                .contains("make an invitation link"),
            "{said}"
        );
        // Editing is the admin's to give by a link: refused, nothing made.
        let (status, said) = post(
            &m.r,
            &format!("{at}/invite"),
            json!({ "path": "", "email": "duda@casa.lan", "role": "editor" }),
            Some(&m.gil),
        )
        .await;
        assert_eq!(status, 400, "{said}");
        assert_eq!(said["error"], "readers_only", "{said}");
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 0);
        let (status, made) = post(
            &m.r,
            &format!("{at}/invite"),
            json!({ "path": "", "email": "duda@casa.lan", "role": "reader" }),
            Some(&m.gil),
        )
        .await;
        assert_eq!(status, 200, "{made}");
        let t = made["link"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .to_owned();
        let duda = accept(&m.r, &t, "duda@casa.lan").await;
        assert_eq!(
            m.r.server.db.role(&m.folder, &duda).unwrap(),
            Some(Role::Reader)
        );
    });
}

#[test]
fn without_may_create_folders_a_folders_owner_invites_no_one() {
    block_on(async {
        let mut m = gm().await;
        // The admin takes the power away: Gil keeps the folder, and invites
        // no one into it.
        let status = patch(
            &m.r,
            &format!("/api/admin/accounts/{}", m.gil_id),
            json!({ "admin": false, "mayCreate": false }),
            &m.admin,
        )
        .await;
        assert_eq!(status, 200);
        // A new sign-in reads the account again.
        let gil = sign_in(&m.r, GIL, GIL_PASSWORD).await;
        let (mut win, _) = Win::open(&m.r, &gil, &m.folder).await;
        let status = win.call("campaign_status", json!({})).await;
        assert_eq!(status["ok"]["viewer"], "owner", "{status}");
        assert_eq!(status["ok"]["can_invite"], false, "{status}");
        let refused = invite(&mut win).await.unwrap_err();
        assert!(refused.contains("only the server's admin"), "{refused}");
        let (status, said) = post(
            &m.r,
            &format!("/api/folders/{}/shares/invite", m.folder),
            json!({ "path": "", "email": "duda@casa.lan", "role": "reader" }),
            Some(&gil),
        )
        .await;
        assert_eq!(status, 403, "{said}");
        let _ = &mut m.win;
    });
}

#[test]
fn a_game_master_never_invites_into_another_accounts_folder() {
    block_on(async {
        let m = gm().await;
        // The admin's folder, a table, with Gil as an editor of it.
        let theirs = folder_id(&m.r, &m.admin).await;
        assert_ne!(theirs, m.folder);
        let (mut owner, _) = Win::open(&m.r, &m.admin, &theirs).await;
        let made = owner.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(made["ok"]["viewer"], "owner", "{made}");
        m.r.server
            .db
            .grant(&theirs, &m.gil_id, Role::Editor)
            .unwrap();
        let (mut win, o) = Win::open(&m.r, &m.gil, &theirs).await;
        assert!(o.get("ok").is_some(), "{o}");
        let status = win.call("campaign_status", json!({})).await;
        assert_eq!(status["ok"]["can_invite"], false, "{status}");
        let refused = invite(&mut win).await.unwrap_err();
        assert!(refused.contains("owner"), "{refused}");
        let (status, said) = post(
            &m.r,
            &format!("/api/folders/{theirs}/shares/invite"),
            json!({ "path": "", "email": "duda@casa.lan", "role": "reader" }),
            Some(&m.gil),
        )
        .await;
        assert!(status == 403 || status == 404, "{status} {said}");
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 0);
    });
}

#[test]
fn at_most_twenty_invitations_of_a_game_master_wait_at_once() {
    block_on(async {
        let mut m = gm().await;
        let mut made = Vec::new();
        for _ in 0..GAME_MASTER_PENDING_MOST {
            made.push(invite(&mut m.win).await.unwrap());
        }
        // The 21st is refused in words, from the table and the dialog.
        let refused = invite(&mut m.win).await.unwrap_err();
        assert!(refused.contains("20 invitations"), "{refused}");
        let (status, said) = post(
            &m.r,
            &format!("/api/folders/{}/shares/invite", m.folder),
            json!({ "path": "", "role": "reader" }),
            Some(&m.gil),
        )
        .await;
        assert_eq!(status, 400, "{said}");
        assert_eq!(said["error"], "too_many_invitations", "{said}");
        // One used frees a place; the admin is not counted.
        accept(&m.r, &made[0], "nova@casa.lan").await;
        invite(&mut m.win).await.unwrap();
        assert!(invite(&mut m.win).await.is_err());
        let (status, _) = post(
            &m.r,
            "/api/admin/invitations",
            json!({ "email": null }),
            Some(&m.admin),
        )
        .await;
        assert_eq!(status, 200);
    });
}

#[test]
fn taking_may_create_folders_away_ends_the_waiting_invitations_only() {
    block_on(async {
        let mut m = gm().await;
        let used = invite(&mut m.win).await.unwrap();
        let nova = accept(&m.r, &used, "nova@casa.lan").await;
        let waiting = [
            invite(&mut m.win).await.unwrap(),
            invite(&mut m.win).await.unwrap(),
        ];
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 2);
        let status = patch(
            &m.r,
            &format!("/api/admin/accounts/{}", m.gil_id),
            json!({ "admin": false, "mayCreate": false }),
            &m.admin,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 0);
        for t in &waiting {
            let (status, _) = get(&m.r, &format!("/api/invite/{t}"), None).await;
            assert_eq!(status, 404);
        }
        // Whoever came in keeps their place.
        assert_eq!(
            m.r.server.db.role(&m.folder, &nova).unwrap(),
            Some(Role::Reader)
        );
        let (_, log) = get(
            &m.r,
            "/api/admin/audit?action=invitation_ended",
            Some(&m.admin),
        )
        .await;
        assert_eq!(log["total"], 2, "{log}");
        let (_, list) = get(&m.r, "/api/admin/invitations?state=ended", Some(&m.admin)).await;
        assert_eq!(list["total"], 2, "{list}");
        // Given back, Gil invites again; nothing ended comes back.
        let status = patch(
            &m.r,
            &format!("/api/admin/accounts/{}", m.gil_id),
            json!({ "admin": false, "mayCreate": true }),
            &m.admin,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 0);
    });
}

/// A DELETE as the browser `b` sends it; the status.
async fn delete(r: &Running, path: &str, b: &Browser) -> u16 {
    reqwest::Client::new()
        .delete(r.url(path))
        .header("origin", r.origin())
        .header("cookie", &b.cookie)
        .header("x-verso-csrf", &b.csrf)
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

/// The power taken away counts at the next command of a window opened
/// before (review B3): the window's connection holds the account as it was
/// when it opened, and the invitation reads it again.
#[test]
fn a_window_open_before_the_power_goes_invites_no_one_after() {
    block_on(async {
        let mut m = gm().await;
        invite(&mut m.win).await.unwrap();
        let status = patch(
            &m.r,
            &format!("/api/admin/accounts/{}", m.gil_id),
            json!({ "admin": false, "mayCreate": false }),
            &m.admin,
        )
        .await;
        assert_eq!(status, 200);
        // The same window, its connection from before.
        let status = m.win.call("campaign_status", json!({})).await;
        assert_eq!(status["ok"]["can_invite"], false, "{status}");
        let refused = invite(&mut m.win).await.unwrap_err();
        assert!(refused.contains("only the server's admin"), "{refused}");
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 0);
    });
}

/// An admin made a member, their window open: an invitation is refused
/// from the next command on, and the row is never written for a power the
/// maker lost before it.
#[test]
fn a_demoted_admins_open_window_invites_no_one() {
    block_on(async {
        let m = gm().await;
        let ze =
            m.r.server
                .db
                .create_account("ze@casa.lan", "Zé", "pt", Some("a senha do zé aqui"), true)
                .unwrap();
        let zb = sign_in(&m.r, "ze@casa.lan", "a senha do zé aqui").await;
        let (_, made) = post(
            &m.r,
            "/api/folders",
            json!({ "name": "Mesa do Zé" }),
            Some(&zb),
        )
        .await;
        let folder = made["id"].as_str().unwrap().to_owned();
        let (mut win, _) = Win::open(&m.r, &zb, &folder).await;
        let table = win.call("campaign_make", json!({ "root": "" })).await;
        assert!(table.get("ok").is_some(), "{table}");
        invite(&mut win).await.unwrap();
        let status = patch(
            &m.r,
            &format!("/api/admin/accounts/{}", ze.id),
            json!({ "admin": false, "mayCreate": false }),
            &m.admin,
        )
        .await;
        assert_eq!(status, 200);
        assert!(invite(&mut win).await.is_err());
        // The row checks the power under its lock: an admin's invitation
        // whose maker is no admin any more is not written.
        let refused = crate::admin::acts::make_invitation(
            &m.r.server.db,
            &crate::admin::acts::By::default(),
            Some(&ze.id),
            &Invitee {
                folder: Some(&folder),
                inviter: Some(Inviter::Admin),
                owned: true,
                ..Invitee::default()
            },
        )
        .unwrap_err();
        assert_eq!(refused, Refused::NotInviter);
        let refused = crate::admin::acts::make_invitation(
            &m.r.server.db,
            &crate::admin::acts::By::default(),
            Some(&m.gil_id),
            &Invitee {
                folder: Some(&folder),
                inviter: Some(Inviter::GameMaster),
                owned: true,
                ..Invitee::default()
            },
        )
        .unwrap_err();
        assert_eq!(refused, Refused::NotOwner, "Gil does not own Zé's folder");
    });
}

/// A game master no longer an owner of the folder: what they invited into
/// it waits no more (review I3), in the audit; into their other folders it
/// still does.
#[test]
fn an_owner_no_more_leaves_no_invitation_into_the_folder() {
    block_on(async {
        let mut m = gm().await;
        let into = [
            invite(&mut m.win).await.unwrap(),
            invite(&mut m.win).await.unwrap(),
        ];
        // A second folder of Gil's, with one of its own.
        let (_, made) = post(
            &m.r,
            "/api/folders",
            json!({ "name": "Outra do Gil" }),
            Some(&m.gil),
        )
        .await;
        let other = made["id"].as_str().unwrap().to_owned();
        let (mut win2, _) = Win::open(&m.r, &m.gil, &other).await;
        win2.call("campaign_make", json!({ "root": "" })).await;
        invite(&mut win2).await.unwrap();
        // Another owner, then Gil made an editor of the first.
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        m.r.server
            .db
            .grant(&m.folder, &admin.id, Role::Owner)
            .unwrap();
        m.r.server
            .db
            .grant(&m.folder, &m.gil_id, Role::Editor)
            .unwrap();
        for t in &into {
            let (status, _) = get(&m.r, &format!("/api/invite/{t}"), None).await;
            assert_eq!(status, 404);
        }
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 1);
        let (_, log) = get(
            &m.r,
            "/api/admin/audit?action=invitation_ended",
            Some(&m.admin),
        )
        .await;
        assert_eq!(log["total"], 2, "{log}");
        // Taken out of the second: its invitation ends too.
        m.r.server.db.grant(&other, &admin.id, Role::Owner).unwrap();
        m.r.server.db.revoke(&other, &m.gil_id).unwrap();
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 0);
        // Their windows invite no more there either.
        assert!(invite(&mut m.win).await.is_err());
    });
}

/// An account removed: the invitations it made that wait end with it
/// (review I3: `invitations.created_by` has no key to cascade by); in the
/// audit, by the admin.
#[test]
fn a_removed_accounts_invitations_end_with_it() {
    block_on(async {
        let mut m = gm().await;
        let waiting = invite(&mut m.win).await.unwrap();
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        // The folder keeps an owner, so the account may go.
        m.r.server
            .db
            .grant(&m.folder, &admin.id, Role::Owner)
            .unwrap();
        let before = m.r.server.db.pending_invitations_by(&m.gil_id).unwrap();
        assert_eq!(before, 1);
        let status = delete(&m.r, &format!("/api/admin/accounts/{}", m.gil_id), &m.admin).await;
        assert_eq!(status, 200);
        let (status, _) = get(&m.r, &format!("/api/invite/{waiting}"), None).await;
        assert_eq!(status, 404);
        assert_eq!(m.r.server.db.pending_invitations_by(&m.gil_id).unwrap(), 0);
        let (_, log) = get(
            &m.r,
            "/api/admin/audit?action=invitation_ended&actor=admin@casa.lan",
            Some(&m.admin),
        )
        .await;
        assert_eq!(log["total"], 1, "{log}");
    });
}

/// The 21st refused leaves no share made for it behind (review M1).
#[test]
fn a_refused_invitation_leaves_no_empty_share() {
    block_on(async {
        let mut m = gm().await;
        let made = m
            .win
            .call("create_folder", json!({ "path": "Pasta" }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        for _ in 0..GAME_MASTER_PENDING_MOST {
            invite(&mut m.win).await.unwrap();
        }
        let (status, said) = post(
            &m.r,
            &format!("/api/folders/{}/shares/invite", m.folder),
            json!({ "path": "Pasta", "role": "reader" }),
            Some(&m.gil),
        )
        .await;
        assert_eq!(status, 400, "{said}");
        assert!(
            m.r.server
                .db
                .share_at(&m.folder, "Pasta")
                .unwrap()
                .is_none()
        );
    });
}

/// The one answer (ADR 0113, `InviteNew`): the owner who is the admin at
/// any role; one the admin lets make folders, to read; nobody else. On
/// this computer the door never says *may create folders*
/// (`Door::build`), so only the owner, its admin, invites there.
#[test]
fn who_invites_by_the_one_answer() {
    use crate::access::{Action, Asker, Cap, Kind, Reason, Target, Verdict, may};
    let ask = |admin: bool, may_create: bool, role: Option<Role>, invited: Role| {
        let who = Asker {
            account: "a".into(),
            role,
            cap: Cap::Write,
            phone: false,
            link: false,
            admin,
            may_create,
            owns_folder: false,
        };
        may(
            &crate::access::AccessFacts::default(),
            &who,
            Action::InviteNew { role: invited },
            &Target::new("", Kind::Folder),
        )
    };
    let owner = Some(Role::Owner);
    for r in [Role::Reader, Role::Editor, Role::Owner] {
        assert_eq!(ask(true, true, owner, r), Verdict::Allow);
        assert_eq!(ask(false, false, owner, r), Verdict::Deny(Reason::NotAdmin));
        assert_eq!(
            ask(true, true, Some(Role::Editor), r),
            Verdict::Deny(Reason::NotMaster)
        );
    }
    assert_eq!(ask(false, true, owner, Role::Reader), Verdict::Allow);
    assert_eq!(
        ask(false, true, owner, Role::Editor),
        Verdict::Deny(Reason::NotAdmin)
    );
    assert_eq!(
        ask(false, true, Some(Role::Editor), Role::Reader),
        Verdict::Deny(Reason::NotMaster)
    );
}
