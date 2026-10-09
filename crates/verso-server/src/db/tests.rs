// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;

fn db() -> Db {
    Db::memory().unwrap()
}

#[test]
fn an_email_is_one_account_whatever_its_case_or_form() {
    let db = db();
    let a = db
        .create_account(
            "  Ana@Exemplo.com ",
            "Ana",
            "pt",
            Some("uma senha longa"),
            true,
        )
        .unwrap();
    assert_eq!(a.email, "Ana@Exemplo.com");
    assert!(a.admin && a.may_create);
    assert_eq!(
        db.create_account("ana@exemplo.COM", "Outra", "pt", None, false)
            .unwrap_err(),
        "exists"
    );
    let found = db.account_by_email("ANA@exemplo.com").unwrap().unwrap();
    assert_eq!(found.id, a.id);
    assert!(crate::crypto::verify_password(
        "uma senha longa",
        found.password.as_deref().unwrap()
    ));
    assert!(is_email("a@b.co") && !is_email("a@b") && !is_email("a b@c.d") && !is_email("@b.c"));
}

#[test]
fn a_session_opens_by_its_token_and_ends() {
    let db = db();
    let a = db.create_account("a@b.co", "A", "en", None, false).unwrap();
    let (token, csrf) = db
        .create_session(&a.id, "browser", "Firefox", "10.0.0.2")
        .unwrap();
    let s = db.session(&token).unwrap().unwrap();
    assert_eq!(s.account, a.id);
    assert!(db.session_alive(&s.id).unwrap());
    assert_eq!(s.csrf, csrf);
    assert!(db.session("outro").unwrap().is_none());
    let (_other, _) = db
        .create_session(&a.id, "device", "Mac", "10.0.0.3")
        .unwrap();
    assert_eq!(db.sessions_of(&a.id).unwrap().len(), 2);
    assert_eq!(db.end_sessions(&a.id, Some(&s.id)).unwrap(), 1);
    assert!(db.session(&token).unwrap().is_some());
    assert!(db.end_session(&a.id, &s.id).unwrap());
    assert!(db.session(&token).unwrap().is_none());
}

#[test]
fn an_idle_session_expires() {
    let db = db();
    let a = db.create_account("a@b.co", "A", "en", None, false).unwrap();
    let (token, _) = db.create_session(&a.id, "browser", "x", "y").unwrap();
    db.conn()
        .execute(
            "UPDATE sessions SET last_used = last_used - ?1",
            [SESSION_IDLE + 1],
        )
        .unwrap();
    assert!(db.session(&token).unwrap().is_none());
    assert!(db.sessions_of(&a.id).unwrap().is_empty());
}

#[test]
fn a_folder_has_an_owner_and_grants() {
    let db = db();
    let owner = db.create_account("o@b.co", "O", "en", None, false).unwrap();
    let guest = db.create_account("g@b.co", "G", "en", None, false).unwrap();
    let f = db.create_folder("Campanha", &owner.id).unwrap();
    assert_eq!(db.role(&f.id, &owner.id).unwrap(), Some(Role::Owner));
    assert_eq!(db.role(&f.id, &guest.id).unwrap(), None);
    db.grant(&f.id, &guest.id, Role::Reader).unwrap();
    assert_eq!(db.role(&f.id, &guest.id).unwrap(), Some(Role::Reader));
    db.grant(&f.id, &guest.id, Role::Editor).unwrap();
    assert_eq!(db.folders_of(&guest.id).unwrap()[0].1, Role::Editor);
    assert_eq!(db.members(&f.id).unwrap().len(), 2);
    db.revoke(&f.id, &guest.id).unwrap();
    assert!(db.folders_of(&guest.id).unwrap().is_empty());
    assert!(db.create_folder("Campanha", &owner.id).is_err());
    assert!(Role::Editor.writes() && !Role::Reader.writes());
}

#[test]
fn a_link_is_used_once_and_expires() {
    let db = db();
    let admin = db.create_account("a@b.co", "A", "en", None, true).unwrap();
    let (token, inv) = db
        .create_invitation(&NewLink {
            kind: "invite",
            email: Some("novo@b.co"),
            created_by: Some(&admin.id),
            life: INVITE_LIFE,
            ..NewLink::default()
        })
        .unwrap();
    assert_eq!(db.pending(&token, "invite").unwrap().unwrap().id, inv.id);
    assert!(db.pending(&token, "reset").unwrap().is_none());
    assert!(db.use_invitation(&inv.id, &admin.id).unwrap());
    assert!(!db.use_invitation(&inv.id, &admin.id).unwrap());
    assert!(db.pending(&token, "invite").unwrap().is_none());
    assert_eq!(
        db.invitation(&inv.id).unwrap().unwrap().state(now()),
        "used"
    );
    let (late, old) = db
        .create_invitation(&NewLink {
            kind: "invite",
            life: -1,
            ..NewLink::default()
        })
        .unwrap();
    assert!(db.pending(&late, "invite").unwrap().is_none());
    assert_eq!(
        db.invitation(&old.id).unwrap().unwrap().state(now()),
        "expired"
    );
    assert_eq!(db.invitations().unwrap().len(), 2);
}

#[test]
fn a_token_reaches_its_folders_until_it_expires() {
    let db = db();
    let a = db.create_account("a@b.co", "A", "en", None, false).unwrap();
    let f = db.create_folder("Notas", &a.id).unwrap();
    let (secret, info) = db
        .create_token(&a.id, "script", false, None, std::slice::from_ref(&f.id))
        .unwrap();
    assert!(secret.starts_with("verso_pat_"));
    let grant = db.token(&secret).unwrap().unwrap();
    assert_eq!(
        (grant.account.as_str(), grant.write, grant.folders),
        (a.id.as_str(), false, vec![f.id.clone()])
    );
    assert!(db.token_alive(&info.id).unwrap());
    assert_eq!(db.tokens_of(&a.id).unwrap()[0].folders, vec![f.id.clone()]);
    let (old, _) = db
        .create_token(&a.id, "velho", true, Some(now() - 1), &[])
        .unwrap();
    assert!(db.token(&old).unwrap().is_none());
    assert!(db.revoke_token(&a.id, &info.id).unwrap());
    assert!(db.token(&secret).unwrap().is_none());
    assert!(!db.token_alive(&info.id).unwrap());
}

#[test]
fn the_audit_log_keeps_who_did_what() {
    let db = db();
    db.audit(&Audit {
        actor: Some("x"),
        action: "sign_in",
        subject: None,
        folder: Some("f"),
        address: Some("1.2.3.4"),
        ok: false,
    })
    .unwrap();
    db.audit(&Audit {
        actor: Some("x"),
        action: "grant",
        subject: Some("y"),
        folder: None,
        address: None,
        ok: true,
    })
    .unwrap();
    assert_eq!(db.audit_log(None, 10).unwrap().len(), 2);
    let of_f = db.audit_log(Some("f"), 10).unwrap();
    assert_eq!(of_f.len(), 1);
    assert!(!of_f[0].ok);
}
