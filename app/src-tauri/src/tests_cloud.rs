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
use super::secrets::Memory;
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
    let (answer, cloud) = cloud::check(&*secrets, &info.key, &fake.settings(), fake.secret());
    assert!(answer.accepted, "{answer:?}");
    let cloud = cloud.unwrap();
    let state = engine::State {
        server: cloud::label(&cloud),
        folder: cloud::label(&cloud),
        cloud: Some(cloud),
        ..engine::State::default()
    };
    engine::save(Some(config.path()), &info.key, &state).unwrap();
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
            device: Box::new(|| "Mac".into()),
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
        cloud::check(secrets, "k", &s, secret)
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
    // Accepted: the secret is kept under the folder's account, and the
    // answer says what is there and what a deletion means.
    if let Fake::Dav(d) = &fake {
        d.put("ja.md", b"1234");
    }
    let (answer, cloud) = ask(&|_| {}, "segredo", &secrets);
    assert!(answer.accepted, "{answer:?}");
    assert_eq!((answer.remote_files, answer.remote_bytes), (1.0, 4.0));
    assert_eq!(answer.deletions, "final");
    assert_eq!(secrets.accounts(), vec![account("k")]);
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
    let (answer, cloud) = cloud::check(&secrets, "k", &fake.settings(), "segredo");
    assert!(!answer.accepted);
    assert_eq!(answer.problem.as_deref(), Some("service_refused"));
    assert!(answer.message.unwrap().contains("If-Match"));
    assert!(cloud.is_none());
    assert!(secrets.accounts().is_empty());
}

#[test]
fn turning_a_cloud_folder_off_forgets_the_secret_and_the_cloud() {
    let fake = s3();
    let a = device_on(&fake, &[("a.md", "um")]);
    csync(&a);
    assert_eq!(
        a.ctx.secrets.get(&account(&a.key)).unwrap().as_deref(),
        Some("secret-test-key")
    );
    assert!(super::sync::cloud_of(a.ctx.config.as_deref(), &a.key));
    cloud::forget(&*a.ctx.secrets, a.ctx.config.as_deref(), &a.key);
    assert_eq!(a.ctx.secrets.get(&account(&a.key)).unwrap(), None);
    assert!(super::sync::synced(a.ctx.config.as_deref(), &a.key).is_none());
    assert!(!super::sync::cloud_of(a.ctx.config.as_deref(), &a.key));
}

#[test]
fn the_state_keeps_no_secret_and_the_versions_it_learned() {
    let fake = dav();
    let a = device_on(&fake, &[("a.md", "um")]);
    csync(&a);
    let saved = std::fs::read_to_string(
        a.ctx
            .config
            .as_ref()
            .unwrap()
            .join(format!("sync-{}.json", a.key)),
    )
    .unwrap();
    assert!(!saved.contains("segredo"), "{saved}");
    let state = engine::load(a.ctx.config.as_deref(), &a.key)
        .unwrap()
        .unwrap();
    assert!(state.tokens.contains_key("a.md"));
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
