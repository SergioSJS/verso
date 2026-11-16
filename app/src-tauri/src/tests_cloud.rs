// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync with a cloud (ADR 0104) through the same pass as a UniVerso's
//! (ADR 0079): two folders of this computer, each a device of its own,
//! and a fake WebDAV server or S3 service between them — never a real
//! provider. And the checks the window's form runs, with the keychain
//! held in memory.

use verso_cloud::fake::{BUCKET, Dav, DavMode, S3 as FakeS3, S3Mode};
use verso_contract::CloudSettings;
use verso_core::sync as engine;

use super::cloud::{self, account};
use super::secrets::{Memory, Secrets};
use super::sync::{Ctx, Passed, Syncer, pass};
use super::tests_sync::{Device, changed, files, text, write};
use super::*;

/// A fake service, either kind.
enum Fake {
    Dav(Dav),
    S3(FakeS3),
}

impl Fake {
    fn settings(&self) -> CloudSettings {
        match self {
            Self::Dav(d) => CloudSettings {
                provider: "webdav".into(),
                endpoint: d.address.clone(),
                user: "ana".into(),
                plain_http: true,
                ..CloudSettings::default()
            },
            Self::S3(s) => CloudSettings {
                provider: "s3".into(),
                endpoint: s.address.clone(),
                bucket: BUCKET.into(),
                prefix: "Cofre".into(),
                region: "test-1".into(),
                user: "AKIATEST".into(),
                path_style: true,
                plain_http: true,
            },
        }
    }

    fn secret(&self) -> &'static str {
        match self {
            Self::Dav(_) => "segredo",
            Self::S3(_) => "secret-test-key",
        }
    }

    fn get(&self, path: &str) -> Option<Vec<u8>> {
        match self {
            Self::Dav(d) => d.get(path),
            Self::S3(s) => s.get(&format!("Cofre/{path}")),
        }
    }

    fn paths(&self) -> Vec<String> {
        match self {
            Self::Dav(d) => d.paths(),
            Self::S3(s) => s
                .keys()
                .into_iter()
                .filter_map(|k| k.strip_prefix("Cofre/").map(str::to_owned))
                .collect(),
        }
    }
}

fn dav() -> Fake {
    Fake::Dav(Dav::start(DavMode {
        user: "ana".into(),
        password: "segredo".into(),
        ..DavMode::default()
    }))
}

fn s3() -> Fake {
    Fake::S3(FakeS3::start(S3Mode::default()))
}

/// A folder of this computer, open, set to sync with the fake cloud: the
/// form's check run, its secret in the (memory) keychain, the state saved.
fn device_on(fake: &Fake, files: &[(&str, &str)]) -> Device {
    let config = tempfile::tempdir().unwrap();
    let dir = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_path_buf()));
    let path = dir.path().to_path_buf();
    let opened = service
        .open("w", move |c| Workspace::open(&path, c))
        .unwrap();
    let (info, _) = service.attach("w", opened);
    let secrets = Arc::new(Memory::default());
    let (answer, cloud) = cloud::check(&*secrets, &fake.settings(), fake.secret());
    assert!(answer.accepted, "{answer:?}");
    let state = cloud::begin(
        &*secrets,
        Some(config.path()),
        &info.key,
        cloud.unwrap(),
        fake.secret(),
    )
    .unwrap();
    let shown = Arc::new(Mutex::new(Vec::new()));
    let heard = Arc::clone(&shown);
    let told = Arc::new(Mutex::new(Vec::new()));
    let rooms = Arc::clone(&told);
    let all = Arc::new(Mutex::new(Vec::new()));
    let everyone = Arc::clone(&all);
    let d = Device {
        ctx: Arc::new(Ctx {
            service,
            secrets,
            config: Some(config.path().to_path_buf()),
            device: Box::new({
                let config = config.path().to_path_buf();
                // The person's name for this computer when they set one
                // (Settings, no server needed), else a fixed one.
                move || {
                    if verso_core::servers::device_name(Some(&config))
                        .ok()
                        .flatten()
                        .is_some()
                    {
                        crate::device::name(Some(&config))
                    } else {
                        "Mac".into()
                    }
                }
            }),
            pt: Box::new(|| true),
            shown: Box::new(move |_, s| crate::lock(&heard).push(s.clone())),
            told: Arc::new(move |to, event, payload| {
                crate::lock(&rooms).push((to.to_vec(), event.to_owned(), payload.clone()));
            }),
            all: Box::new(move |event, payload| {
                crate::lock(&everyone).push((event.to_owned(), payload.clone()));
            }),
        }),
        s: Syncer::new(&info.key, &state),
        key: info.key,
        shown,
        told,
        all,
        _dirs: (config, dir),
    };
    for (p, text) in files {
        write(&d, p, text.as_bytes());
    }
    d
}

fn csync(d: &Device) -> Passed {
    tauri::async_runtime::block_on(async {
        let mut l = cloud::link(&d.ctx, &d.s).await.unwrap();
        pass(&d.ctx, &d.s, &mut l).await.unwrap()
    })
}

fn delete(d: &Device, path: &str) {
    let p = path.to_owned();
    d.ctx
        .service
        .with_key(&d.key, move |ws| Ok(ws.delete_entry(&p).map(|_| ())?))
        .unwrap();
    changed(d, &[path]);
}

fn rename(d: &Device, from: &str, to: &str) {
    let (f, t) = (from.to_owned(), to.to_owned());
    d.ctx
        .service
        .with_key(&d.key, move |ws| Ok(ws.rename_entry(&f, &t).map(|_| ())?))
        .unwrap();
    changed(d, &[from, to]);
}

/// The first sync copies up what is here and down what is there, deletes
/// nothing, and the folders then follow each other: edits, a deletion, a
/// rename, and two edits of one file kept beside each other — on both kinds
/// of service.
fn two_devices_converge(fake: &Fake) {
    let a = device_on(
        fake,
        &[
            ("Uma.md", "# Uma\n"),
            ("Duas.md", "# Duas\n"),
            ("Tres.md", "# Tres\n"),
            ("Quatro.md", "# Quatro\n"),
            ("Notas/Café & chá.md", "# Café\n"),
        ],
    );
    let first = csync(&a);
    assert!(first.actions >= 5, "{first:?}");
    assert_eq!(fake.get("Uma.md").unwrap(), b"# Uma\n");
    assert_eq!(
        fake.get("Notas/Café & chá.md").unwrap(),
        "# Café\n".as_bytes()
    );
    // Nothing of the sync's own is left on the service.
    assert!(
        fake.paths().iter().all(|p| !p.starts_with(".verso-")),
        "{:?}",
        fake.paths()
    );

    let b = device_on(fake, &[]);
    csync(&b);
    assert_eq!(text(&b, "Tres.md").as_deref(), Some("# Tres\n"));
    assert_eq!(text(&b, "Notas/Café & chá.md").as_deref(), Some("# Café\n"));

    // An edit crosses.
    write(&a, "Uma.md", b"# Uma\n\neditada em A\n");
    csync(&a);
    changed(&b, &[]);
    csync(&b);
    assert_eq!(
        text(&b, "Uma.md").as_deref(),
        Some("# Uma\n\neditada em A\n")
    );

    // A deletion crosses (to the folder's bin there, final here).
    delete(&b, "Duas.md");
    csync(&b);
    assert!(fake.get("Duas.md").is_none());
    changed(&a, &[]);
    csync(&a);
    assert_eq!(text(&a, "Duas.md"), None);

    // A rename crosses as one.
    rename(&a, "Tres.md", "Pasta/Tres.md");
    csync(&a);
    assert!(fake.get("Tres.md").is_none());
    assert_eq!(fake.get("Pasta/Tres.md").unwrap(), b"# Tres\n");
    changed(&b, &[]);
    csync(&b);
    assert_eq!(text(&b, "Tres.md"), None);
    assert_eq!(text(&b, "Pasta/Tres.md").as_deref(), Some("# Tres\n"));

    // Both edit one file: the first to sync keeps the name; the other's
    // is kept beside it, and reaches the first. Nothing is lost.
    write(&a, "Quatro.md", b"# Quatro de A\n");
    write(&b, "Quatro.md", b"# Quatro de B\n");
    csync(&a);
    csync(&b);
    assert_eq!(text(&b, "Quatro.md").as_deref(), Some("# Quatro de A\n"));
    let copy = files(&b)
        .into_iter()
        .find(|p| p.starts_with("Quatro (conflito, Mac, "))
        .unwrap();
    assert_eq!(text(&b, &copy).as_deref(), Some("# Quatro de B\n"));
    assert_eq!(fake.get(&copy).unwrap(), b"# Quatro de B\n");
    changed(&a, &[]);
    csync(&a);
    assert_eq!(text(&a, &copy).as_deref(), Some("# Quatro de B\n"));
    // An edit against a deletion: the edit wins, the file comes back.
    delete(&a, "Quatro.md");
    write(&b, "Quatro.md", b"# Quatro de B outra vez\n");
    csync(&b);
    csync(&a);
    assert_eq!(
        text(&a, "Quatro.md").as_deref(),
        Some("# Quatro de B outra vez\n")
    );
    // The nonce of a kept connection: the second pass of an unchanged
    // folder does nothing.
    assert_eq!(csync(&a).actions, 0);
}

#[test]
fn two_devices_converge_through_a_webdav_folder() {
    two_devices_converge(&dav());
}

#[test]
fn two_devices_converge_through_an_s3_prefix() {
    two_devices_converge(&s3());
}

#[test]
fn a_name_the_service_keeps_for_itself_is_said_here_not_sent() {
    let fake = dav();
    let a = device_on(&fake, &[("boa.md", "ok"), ("rascunho.part", "x")]);
    csync(&a);
    assert_eq!(fake.paths(), vec!["boa.md".to_owned()]);
    let st = a.s.status();
    let refused = st
        .refused
        .iter()
        .find(|r| r.path == "rascunho.part")
        .unwrap();
    assert_eq!(refused.reason, "name_invalid");
    // The file stays here, as it was.
    assert_eq!(text(&a, "rascunho.part").as_deref(), Some("x"));
}

#[test]
fn a_lost_secret_is_said_and_a_service_that_turned_unsafe_is_refused() {
    let fake = dav();
    let a = device_on(&fake, &[("a.md", "um")]);
    csync(&a);
    // The keychain lost it.
    a.ctx.secrets.delete(&account(&a.key)).unwrap();
    let e = tauri::async_runtime::block_on(cloud::link(&a.ctx, &a.s))
        .err()
        .unwrap();
    assert_eq!(e.kind, ErrorKind::Refused);
    assert!(
        e.message.starts_with("cloud sign-in refused"),
        "{}",
        e.message
    );
    assert_eq!(super::sync::problem_of(&e, true), "cloud_auth");
    // It is back; the server now gives weak ETags: the next file sent
    // ends the pass, refused, saying the service cannot guard a write.
    a.ctx.secrets.set(&account(&a.key), "segredo").unwrap();
    if let Fake::Dav(d) = &fake {
        d.mode(|m| m.weak_etags = true);
    }
    write(&a, "novo.md", b"dois");
    let e = tauri::async_runtime::block_on(async {
        let mut l = cloud::link(&a.ctx, &a.s).await.unwrap();
        pass(&a.ctx, &a.s, &mut l).await
    })
    .unwrap_err();
    assert_eq!(e.kind, ErrorKind::Refused);
    assert!(e.message.contains("weak"), "{}", e.message);
    assert_eq!(super::sync::problem_of(&e, true), "cloud_refused");
}

#[test]
fn the_form_is_checked_before_anything_is_asked_or_kept() {
    let fake = dav();
    let secrets = Memory::default();
    let ask = |f: &dyn Fn(&mut CloudSettings), secret: &str, secrets: &Memory| {
        let mut s = fake.settings();
        f(&mut s);
        cloud::check(secrets, &s, secret)
    };
    // Missing pieces.
    for (change, why) in [
        (
            &(|s: &mut CloudSettings| s.endpoint.clear()) as &dyn Fn(&mut CloudSettings),
            "address",
        ),
        (&|s: &mut CloudSettings| s.user.clear(), "user"),
        (
            &|s: &mut CloudSettings| s.provider = "ftp".into(),
            "WebDAV or S3",
        ),
    ] {
        let (answer, cloud) = ask(change, "segredo", &secrets);
        assert_eq!(answer.problem.as_deref(), Some("invalid"), "{why}");
        assert!(answer.message.unwrap().contains(why));
        assert!(cloud.is_none());
    }
    assert_eq!(
        ask(&|_| {}, "", &secrets).0.problem.as_deref(),
        Some("invalid")
    );
    // Plain HTTP to an address that is not local, and one not confirmed.
    let (answer, _) = ask(
        &|s| s.endpoint = "http://nuvem.example.com/dav".into(),
        "x",
        &secrets,
    );
    assert_eq!(answer.problem.as_deref(), Some("plain_http_refused"));
    let (answer, _) = ask(&|s| s.plain_http = false, "segredo", &secrets);
    assert_eq!(answer.problem.as_deref(), Some("plain_http_unconfirmed"));
    // A wrong password.
    let (answer, _) = ask(&|_| {}, "errada", &secrets);
    assert_eq!(answer.problem.as_deref(), Some("auth"));
    // A server nobody answers.
    let (answer, _) = ask(
        &|s| s.endpoint = "http://127.0.0.1:1/dav".into(),
        "segredo",
        &secrets,
    );
    assert_eq!(answer.problem.as_deref(), Some("unreachable"));
    // Nothing was kept by any of it.
    assert!(secrets.accounts().is_empty());
    // A Linux with no keyring: refused before the service is asked.
    let none = Memory::without_keyring();
    let (answer, _) = ask(&|_| {}, "segredo", &none);
    assert_eq!(answer.problem.as_deref(), Some("no_keyring"));
    assert!(answer.message.unwrap().starts_with("no keyring"));
    // A secret over the keychain's limit.
    let (answer, _) = ask(&|_| {}, &"x".repeat(3000), &secrets);
    assert_eq!(answer.problem.as_deref(), Some("invalid"));
    // Accepted: the answer says what is there and what a deletion means.
    // The secret is not in the keychain yet: it goes there when the person
    // starts (and a closed dialog leaves nothing behind).
    if let Fake::Dav(d) = &fake {
        d.put("ja.md", b"1234");
    }
    let (answer, cloud) = ask(&|_| {}, "segredo", &secrets);
    assert!(answer.accepted, "{answer:?}");
    assert_eq!((answer.remote_files, answer.remote_bytes), (1.0, 4.0));
    assert_eq!(answer.deletions, "final");
    assert!(secrets.accounts().is_empty(), "{:?}", secrets.accounts());
    assert_eq!(cloud.unwrap().deletions, "final");
}

#[test]
fn a_service_that_would_lose_an_edit_is_refused_with_the_reason() {
    let fake = Fake::Dav(Dav::start(DavMode {
        user: "ana".into(),
        password: "segredo".into(),
        ignore_if_match: true,
        ..DavMode::default()
    }));
    let secrets = Memory::default();
    let (answer, cloud) = cloud::check(&secrets, &fake.settings(), "segredo");
    assert!(!answer.accepted);
    assert_eq!(answer.problem.as_deref(), Some("service_refused"));
    assert!(answer.message.unwrap().contains("If-Match"));
    assert!(cloud.is_none());
    assert!(secrets.accounts().is_empty());
}

#[test]
fn a_service_without_a_conditional_delete_is_refused_with_its_own_reason() {
    // I-3 (decided 2026-10-22): WebDAV and S3 alike; the window says it
    // with `no_conditional_delete`, the English reason stays the message.
    let secrets = Memory::default();
    let dav = Fake::Dav(Dav::start(DavMode {
        user: "ana".into(),
        password: "segredo".into(),
        ignore_delete_if_match: true,
        ..DavMode::default()
    }));
    let s3 = Fake::S3(FakeS3::start(S3Mode {
        ignore_delete_if_match: true,
        ..S3Mode::default()
    }));
    for fake in [dav, s3] {
        let (answer, cloud) = cloud::check(&secrets, &fake.settings(), fake.secret());
        assert!(!answer.accepted);
        assert_eq!(answer.problem.as_deref(), Some("no_conditional_delete"));
        assert!(answer.message.unwrap().contains("If-Match on a delete"));
        assert!(cloud.is_none());
    }
    assert!(secrets.accounts().is_empty());
}

#[test]
fn the_secret_reaches_the_keychain_only_when_the_person_starts() {
    let fake = dav();
    let secrets = Memory::default();
    let config = tempfile::tempdir().unwrap();
    let (answer, cloud) = cloud::check(&secrets, &fake.settings(), "segredo");
    assert!(answer.accepted, "{answer:?}");
    // Checked, and the dialog closed here: nothing was kept.
    assert!(secrets.accounts().is_empty());
    assert!(engine::load(Some(config.path()), "k").unwrap().is_none());
    // Started.
    let state = cloud::begin(
        &secrets,
        Some(config.path()),
        "k",
        cloud.unwrap(),
        "segredo",
    )
    .unwrap();
    assert_eq!(
        secrets.get(&account("k")).unwrap().as_deref(),
        Some("segredo")
    );
    assert!(!state.off && state.base.is_empty());
    assert!(!serde_json::to_string(&state).unwrap().contains("segredo"));
    assert_eq!(
        engine::load(Some(config.path()), "k").unwrap().unwrap(),
        state
    );
}

/// A pass over the cloud with the syncer given (the one a start makes).
fn csync_with(d: &Device, s: &Arc<Syncer>) -> Passed {
    tauri::async_runtime::block_on(async {
        let mut l = cloud::link(&d.ctx, s).await.unwrap();
        pass(&d.ctx, s, &mut l).await.unwrap()
    })
}

#[test]
fn turning_a_cloud_folder_off_deletes_the_secret_and_keeps_the_base() {
    for fake in [dav(), s3()] {
        let a = device_on(&fake, &[("a.md", "um"), ("b.md", "outro")]);
        csync(&a);
        assert_eq!(
            a.ctx.secrets.get(&account(&a.key)).unwrap().as_deref(),
            Some(fake.secret())
        );
        assert!(super::sync::cloud_of(a.ctx.config.as_deref(), &a.key));
        // What turning it off does: marked off, then the secret goes.
        super::sync::off(a.ctx.config.as_deref(), &a.key).unwrap();
        cloud::forget(&*a.ctx.secrets, &a.key);
        assert_eq!(a.ctx.secrets.get(&account(&a.key)).unwrap(), None);
        let kept = engine::load(a.ctx.config.as_deref(), &a.key)
            .unwrap()
            .unwrap();
        assert!(kept.off);
        assert!(kept.cloud.is_some(), "the place stays, to connect it again");
        assert!(kept.base.contains_key("a.md"), "{:?}", kept.base);
        assert!(kept.tokens.contains_key("a.md"));

        // An edit while it is off, then the same cloud again: it goes on
        // from the base, so the edit is an edit and not a conflict.
        write(&a, "a.md", b"dois");
        let (answer, cloud) = cloud::check(&*a.ctx.secrets, &fake.settings(), fake.secret());
        assert!(answer.accepted, "{answer:?}");
        let state = cloud::begin(
            &*a.ctx.secrets,
            a.ctx.config.as_deref(),
            &a.key,
            cloud.unwrap(),
            fake.secret(),
        )
        .unwrap();
        assert!(!state.off);
        assert_eq!(state.base, kept.base);
        assert_eq!(state.tokens, kept.tokens);
        let again = Syncer::new(&a.key, &state);
        changed(&a, &["a.md"]);
        csync_with(&a, &again);
        assert_eq!(fake.get("a.md").unwrap(), b"dois");
        let mut paths = fake.paths();
        paths.sort();
        assert_eq!(paths, vec!["a.md".to_owned(), "b.md".to_owned()]);
        assert!(
            files(&a).iter().all(|p| !p.contains("conflito")),
            "{:?}",
            files(&a)
        );
    }
}

#[test]
fn another_cloud_or_another_folder_is_a_first_sync() {
    let fake = dav();
    let a = device_on(&fake, &[("a.md", "um")]);
    csync(&a);
    super::sync::off(a.ctx.config.as_deref(), &a.key).unwrap();
    cloud::forget(&*a.ctx.secrets, &a.key);
    let other = dav();
    let (_, cloud) = cloud::check(&*a.ctx.secrets, &other.settings(), other.secret());
    let state = cloud::begin(
        &*a.ctx.secrets,
        a.ctx.config.as_deref(),
        &a.key,
        cloud.unwrap(),
        other.secret(),
    )
    .unwrap();
    assert!(state.base.is_empty() && state.tokens.is_empty());
}

#[test]
fn the_conflict_copy_carries_the_name_set_without_a_server() {
    let fake = dav();
    let a = device_on(&fake, &[("Quatro.md", "# Quatro\n")]);
    csync(&a);
    let b = device_on(&fake, &[]);
    csync(&b);
    // No server is signed in to on this computer: the name is set where
    // the cloud's form sets it, the same setting a server's session uses.
    assert!(
        verso_core::servers::list(b.ctx.config.as_deref())
            .unwrap()
            .is_empty()
    );
    verso_core::servers::set_device_name(b.ctx.config.as_deref(), Some("Estudio da Ana")).unwrap();
    write(&a, "Quatro.md", b"# de A\n");
    write(&b, "Quatro.md", b"# de B\n");
    csync(&a);
    csync(&b);
    let copy = files(&b)
        .into_iter()
        .find(|p| p.contains("conflito"))
        .unwrap();
    assert!(
        copy.starts_with("Quatro (conflito, Estudio da Ana, "),
        "{copy}"
    );
}

#[test]
fn the_state_keeps_no_secret_and_the_versions_it_learned() {
    let fake = dav();
    let a = device_on(&fake, &[("a.md", "um")]);
    csync(&a);
    let state = engine::load(a.ctx.config.as_deref(), &a.key)
        .unwrap()
        .unwrap();
    assert!(state.tokens.contains_key("a.md"));
    // What is written to the state file is this value, and it holds no
    // secret anywhere.
    assert!(!serde_json::to_string(&state).unwrap().contains("segredo"));
    assert_eq!(state.cloud.unwrap().provider, "webdav");
    // The status says where, and that nothing in it is a server.
    let st = a.s.status();
    let cloud = st.cloud.unwrap();
    assert_eq!(cloud.provider, "webdav");
    assert_eq!(cloud.deletions, "final");
}

#[test]
fn a_service_that_asks_to_slow_down_is_waited_for_not_failed() {
    let fake = dav();
    let a = device_on(&fake, &[("a.md", "um")]);
    if let Fake::Dav(d) = &fake {
        d.throttle(3);
    }
    csync(&a);
    assert_eq!(fake.get("a.md").unwrap(), b"um");
}

/// A service whose listing lags behind its writes does not tell a device
/// that a file is gone: asked for the file itself, the cloud still has it,
/// and it stays on this computer.
fn a_listing_that_lags_deletes_nothing(fake: &Fake, hide: impl Fn(&str)) {
    let a = device_on(fake, &[("a.md", "um"), ("b.md", "dois"), ("c.md", "tres")]);
    csync(&a);
    hide("a.md");
    changed(&a, &[]);
    let passed = csync(&a);
    // The pass found `a.md` missing from the listing and did not delete it.
    assert_eq!(passed.actions, 0);
    assert_eq!(text(&a, "a.md").as_deref(), Some("um"));
    assert!(fake.get("a.md").is_some());
    // A file really gone there is deleted here, as before.
    match fake {
        Fake::Dav(d) => d.remove("b.md"),
        Fake::S3(s) => s.remove("Cofre/b.md"),
    }
    changed(&a, &[]);
    csync(&a);
    assert_eq!(text(&a, "b.md"), None);
}

#[test]
fn a_webdav_listing_that_lags_deletes_nothing() {
    let fake = dav();
    let Fake::Dav(d) = &fake else { unreachable!() };
    a_listing_that_lags_deletes_nothing(&fake, |p| d.hide(p));
}

#[test]
fn an_s3_listing_that_lags_deletes_nothing() {
    let fake = s3();
    let Fake::S3(s) = &fake else { unreachable!() };
    a_listing_that_lags_deletes_nothing(&fake, |p| s.hide(&format!("Cofre/{p}")));
}

#[test]
fn a_webdav_folder_that_is_gone_is_an_error_not_an_empty_folder() {
    let fake = dav();
    let a = device_on(&fake, &[("a.md", "um"), ("b.md", "dois"), ("c.md", "tres")]);
    csync(&a);
    let Fake::Dav(d) = &fake else { unreachable!() };
    d.remove_folder();
    let e = tauri::async_runtime::block_on(async {
        let mut l = cloud::link(&a.ctx, &a.s).await.unwrap();
        pass(&a.ctx, &a.s, &mut l).await
    })
    .unwrap_err();
    assert_eq!(e.kind, ErrorKind::NotFound);
    // Nothing here was deleted for it.
    assert_eq!(files(&a).len(), 3);
}

/// The files of the folder the fake WebDAV server was asked to send, in
/// order of the asking (its own probe left out).
fn fetched(fake: &Fake) -> Vec<String> {
    let Fake::Dav(d) = fake else {
        return Vec::new();
    };
    d.requests()
        .into_iter()
        .filter_map(|r| r.strip_prefix("GET /dav/").map(str::to_owned))
        .filter(|p| !p.starts_with(".verso-"))
        .collect()
}

/// How many times each of `fetched` was asked for.
fn times(fetched: &[String]) -> std::collections::BTreeMap<String, usize> {
    let mut out = std::collections::BTreeMap::new();
    for p in fetched {
        *out.entry(p.clone()).or_insert(0) += 1;
    }
    out
}

/// A WebDAV folder with `names` only there, and a device that has two files
/// of its own: one the same as there, one not.
fn first_sync_folder(names: &[&str]) -> (Fake, Device) {
    let fake = dav();
    if let Fake::Dav(d) = &fake {
        for (i, p) in names.iter().enumerate() {
            d.put(p, format!("# {i}\n").as_bytes());
        }
        d.put("Igual.md", b"# igual\n");
        d.put("Outra.md", b"# de la\n");
    }
    let b = device_on(
        &fake,
        &[("Igual.md", "# igual\n"), ("Outra.md", "# daqui\n")],
    );
    (fake, b)
}

/// A first sync with a WebDAV folder fetches each file that is only there
/// once — not once to learn its hash and again to keep it (I4 of the sync
/// review, part 2, 2026-11-15) — and keeps the version it fetched, so the
/// next pass reads nothing. A file of the same name here is still read for
/// its hash and compared: the same, agreed without a fetch; another, kept
/// beside as a conflict.
#[test]
fn a_first_sync_fetches_each_file_once() {
    let names = ["Uma.md", "Duas.md", "Notas/Tres.md", "Notas/Café & chá.md"];
    let (fake, b) = first_sync_folder(&names);
    csync(&b);
    for (i, p) in names.iter().enumerate() {
        assert_eq!(text(&b, p), Some(format!("# {i}\n")), "{p}");
    }
    let got = times(&fetched(&fake));
    for p in names {
        assert_eq!(got.get(p), Some(&1), "{p}: {got:?}");
    }
    // Read once for its hash, the same as here: nothing more.
    assert_eq!(got.get("Igual.md"), Some(&1), "{got:?}");
    // Read for its hash, then fetched as the conflict's winner.
    assert_eq!(got.get("Outra.md"), Some(&2), "{got:?}");
    assert_eq!(text(&b, "Outra.md").as_deref(), Some("# de la\n"));
    assert!(files(&b).iter().any(|p| p.starts_with("Outra (conflito, ")));
    // The versions fetched are what the state keeps: nothing read again.
    let state = engine::load(b.ctx.config.as_deref(), &b.key)
        .unwrap()
        .unwrap();
    for p in names {
        assert!(state.tokens.contains_key(p), "{p}");
    }
    let before = fetched(&fake).len();
    changed(&b, &[]);
    assert_eq!(csync(&b).actions, 0);
    assert_eq!(fetched(&fake).len(), before);
}

/// A first sync whose link drops at a download keeps what it fetched
/// before (I4 part 1, with part 2): the next try fetches only the rest,
/// each once, and the file whose fetch failed once more.
#[test]
fn a_first_sync_cut_short_fetches_only_the_rest_on_the_next_try() {
    let names: Vec<String> = (1..=6).map(|i| format!("n{i}.md")).collect();
    let refs: Vec<&str> = names.iter().map(String::as_str).collect();
    let (fake, b) = first_sync_folder(&refs);
    if let Fake::Dav(d) = &fake {
        // The GETs of files so far are none of the folder's; the fourth
        // from now fails as a dropped link (500).
        let so_far = d
            .requests()
            .iter()
            .filter(|r| r.starts_with("GET "))
            .count();
        d.mode(|m| m.fail_get = u32::try_from(so_far).unwrap() + 4);
    }
    let cut = tauri::async_runtime::block_on(async {
        let mut l = cloud::link(&b.ctx, &b.s).await.unwrap();
        pass(&b.ctx, &b.s, &mut l).await
    });
    assert!(cut.is_err(), "{cut:?}");
    changed(&b, &[]);
    csync(&b);
    for (i, p) in names.iter().enumerate() {
        assert_eq!(text(&b, p), Some(format!("# {i}\n")), "{p}");
    }
    let got = times(&fetched(&fake));
    let twice: Vec<&String> = got
        .iter()
        .filter(|(_, n)| **n == 2)
        .map(|(p, _)| p)
        .collect();
    // The one whose fetch failed, and Outra.md (its hash, then the
    // conflict's fetch); every other once.
    assert_eq!(twice.len(), 2, "{got:?}");
    assert!(twice.iter().any(|p| *p == "Outra.md"), "{got:?}");
    assert!(got.values().all(|n| *n <= 2), "{got:?}");
    for p in &names {
        assert!(got.contains_key(p), "{p}: {got:?}");
    }
}
