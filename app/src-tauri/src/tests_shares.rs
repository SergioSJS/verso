// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A share synced as a folder of this computer, against a real `verso
//! serve` on this machine (ADR 0081 item 8): its owner revokes it, and the
//! device's sync turns off with a notice, the files kept.

use std::time::{Duration, Instant};

use serde_json::json;
use verso_core::sync as engine;

use super::tests_sync::{changed, device_at, sync as pass_once, text};
use super::*;

const NOTE: &str = "Sessao.md";

struct Loopback;

impl verso_server::config::Env for Loopback {
    fn var(&self, name: &str) -> Option<String> {
        match name {
            "VERSO_LISTEN" => Some("127.0.0.1:0".to_owned()),
            "VERSO_UPDATE_CHECK" => Some("off".to_owned()),
            _ => None,
        }
    }
}

/// A server whose folder "Campanha" (Ana's) shares "Mesa", holding
/// [`NOTE`], with Caio as an editor: its address, the folder's id, the
/// share's id, Ana's device token and Caio's.
struct Shared {
    url: String,
    folder: String,
    share: String,
    owner: String,
    receiver: String,
    /// Dropped with it: the server stops.
    _stop: tokio::sync::oneshot::Sender<()>,
    _dirs: (tempfile::TempDir, tempfile::TempDir),
}

fn shared() -> Shared {
    let data = tempfile::tempdir().unwrap();
    let folders = tempfile::tempdir().unwrap();
    // Made as tests_sync.rs makes it: no `std::fs` in the app's crate
    // (ADR 0029).
    let named = |prefix: &str, at: &std::path::Path| {
        tempfile::Builder::new()
            .prefix(prefix)
            .rand_bytes(0)
            .tempdir_in(at)
            .unwrap()
            .keep()
    };
    let mesa = named("Mesa", &named("Campanha", folders.path()));
    let mut note = tempfile::Builder::new()
        .prefix(NOTE)
        .rand_bytes(0)
        .tempfile_in(&mesa)
        .unwrap();
    std::io::Write::write_all(&mut note, b"# Sessao\n").unwrap();
    note.keep().unwrap();
    let config = verso_server::config::Config::from_env(
        &Loopback,
        &verso_server::config::Defaults {
            data_dir: data.path().to_owned(),
            folders_dir: folders.path().to_owned(),
            ui_dir: data.path().join("ui"),
        },
    )
    .unwrap();
    let db = verso_server::db::Db::open(data.path()).unwrap();
    let ana = db
        .create_account("ana@casa.lan", "Ana", "pt", Some("uma senha longa"), true)
        .unwrap();
    let caio = db
        .create_account(
            "caio@casa.lan",
            "Caio",
            "pt",
            Some("outra senha longa"),
            false,
        )
        .unwrap();
    let folder = db.create_folder("Campanha", &ana.id).unwrap();
    let share = db.make_share(&folder.id, "Mesa").unwrap();
    db.grant_share(&share.id, &caio.id, verso_server::db::Role::Editor)
        .unwrap();
    let (owner, _) = db
        .create_session(&ana.id, "device", "Verso · Ana", "127.0.0.1")
        .unwrap();
    let (receiver, _) = db
        .create_session(&caio.id, "device", "Verso · Caio", "127.0.0.1")
        .unwrap();
    let server = verso_server::state::Server::new(
        config,
        db,
        verso_server::contract_version(),
        "test".into(),
    );
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    // Stopped when the share is let go (tests_sync::Running): a server left
    // running holds its descriptors until the test process ends.
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            tokio::select! {
                _ = verso_server::run(server, listener, std::future::pending()) => {}
                _ = stopped => {}
            }
        });
        rt.shutdown_background();
    });
    let url = format!("http://localhost:{}", addr_rx.recv().unwrap().port());
    Shared {
        url,
        folder: folder.id,
        share: share.id,
        owner,
        receiver,
        _stop: stop,
        _dirs: (data, folders),
    }
}

/// Wait for `done`, at most `secs` seconds.
fn until(secs: u64, what: &str, mut done: impl FnMut() -> bool) {
    let started = Instant::now();
    while !done() {
        assert!(
            started.elapsed() < Duration::from_secs(secs),
            "not in time: {what}"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// The owner revokes the share a device syncs (ADR 0081 item 8; the
/// maintainer, 2026-10-12): the device's sync turns off — not left in
/// error — its state says the share was revoked and when, the window
/// hears it, and the files here stay.
#[test]
fn a_revoked_shares_sync_turns_off_with_a_notice_and_keeps_the_files() {
    let r = shared();
    let d = device_at(&r.url, &r.share, &r.receiver, &[]);
    let task = tauri::async_runtime::spawn(sync::run(Arc::clone(&d.ctx), Arc::clone(&d.s)));
    until(30, "the first pass", || {
        d.s.status().state == "synced" && text(&d, NOTE).is_some()
    });
    assert_eq!(text(&d, NOTE).as_deref(), Some("# Sessao\n"));

    let answer = remote::http()
        .unwrap()
        .post(format!("{}/api/folders/{}/shares/revoke", r.url, r.folder))
        .bearer_auth(&r.owner)
        .json(&json!({ "path": "Mesa", "account": "caio@casa.lan" }))
        .send()
        .unwrap();
    assert_eq!(answer.status().as_u16(), 200);

    // The window hears sync off, and why.
    until(30, "sync turned off", || {
        lock(&d.shown)
            .iter()
            .any(|s| s.state == "off" && s.problem.as_deref() == Some("revoked"))
    });
    tauri::async_runtime::block_on(task).unwrap();
    let said = sync::off_status(d.ctx.config.as_deref(), &d.key);
    assert!(!said.on);
    assert_eq!(said.state, "off");
    assert_eq!(said.problem.as_deref(), Some("revoked"));
    assert_eq!(said.folder, r.share);
    assert_eq!(said.folder_name, "Mesa (Ana)");
    let at = said.revoked.unwrap();
    assert_eq!(at.len(), "2026-10-12T21:30:00Z".len(), "{at}");
    // Off as the person's own turning off: kept off, its base kept, so
    // the folder does not start syncing again when shown.
    let state = engine::load(d.ctx.config.as_deref(), &d.key)
        .unwrap()
        .unwrap();
    assert!(state.off);
    assert!(state.base.contains_key(NOTE));
    assert!(sync::synced(d.ctx.config.as_deref(), &d.key).is_none());
    // The files here stay.
    assert_eq!(text(&d, NOTE).as_deref(), Some("# Sessao\n"));
    // Turned off by the person, the notice is forgotten.
    sync::off(d.ctx.config.as_deref(), &d.key).unwrap();
    assert_eq!(
        sync::off_status(d.ctx.config.as_deref(), &d.key).problem,
        None
    );
}

/// A receiver's own folder settings (`.verso/settings.json`, ADR 0070)
/// are this machine's business in a share's folder: never sent — the
/// server would refuse them, and they are not the shared folder's — and
/// never listed as not synced, pass after pass; said once in the log.
#[test]
fn a_receivers_own_settings_stay_here_quietly() {
    let r = shared();
    let d = device_at(&r.url, &r.share, &r.receiver, &[]);
    pass_once(&d);
    assert_eq!(text(&d, NOTE).as_deref(), Some("# Sessao\n"));
    let change = verso_core::FolderSettings {
        bookmarks: Some(vec![NOTE.to_owned()]),
        ..verso_core::FolderSettings::default()
    };
    d.ctx
        .service
        .with_key(&d.key, move |ws| {
            let revision = ws.folder_settings().revision;
            Ok(ws
                .set_folder_settings(&change, revision.as_deref())
                .map(|_| ())?)
        })
        .unwrap();
    assert!(text(&d, ".verso/settings.json").is_some());
    for _ in 0..3 {
        changed(&d, &[".verso/settings.json"]);
        let passed = pass_once(&d);
        assert_eq!(passed.actions, 0, "nothing to send or fetch");
        let status = d.s.status();
        assert!(
            status.refused.is_empty(),
            "nothing listed as not synced: {:?}",
            status.refused
        );
    }
    assert!(d.s.settings_said.load(std::sync::atomic::Ordering::Relaxed));
    // Never agreed with the server: nothing of `.verso/` in the base.
    let base = engine::load(d.ctx.config.as_deref(), &d.key)
        .unwrap()
        .unwrap();
    assert!(
        base.base.keys().all(|p| !p.starts_with(".verso")),
        "{:?}",
        base.base
    );
    assert!(base.base.contains_key(NOTE));
}

/// The folder switcher tells two folders of one name apart by where they
/// sit: a label, never a path (ADR 0026 rule 4).
#[test]
fn a_folders_place_is_a_short_label_never_an_absolute_path() {
    use crate::shares::place_of;
    let home = Path::new("/Users/ana");
    let at = |p: &str| place_of(Path::new(p), Some(home));
    assert_eq!(at("/Users/ana/Caderno"), "~");
    assert_eq!(at("/Users/ana/Documents/Caderno"), "~/Documents");
    assert_eq!(
        at("/Users/ana/Documents/obsidian/Caderno"),
        "~/Documents/obsidian"
    );
    assert_eq!(at("/Users/ana/a/b/c/Caderno"), "~/…/b/c");
    assert_eq!(at("/Volumes/Disco/Notas/Caderno"), "…/Disco/Notas");
    assert_eq!(at("/Caderno"), "");
    for label in [
        at("/Users/ana/x/Caderno"),
        at("/Volumes/Disco/Caderno"),
        at("/mnt/a/b/c/Caderno"),
    ] {
        assert!(!label.starts_with('/') && !label.contains(".."), "{label}");
    }
    // With no home known, nothing is home-relative.
    assert_eq!(
        place_of(Path::new("/Users/ana/Documents/Caderno"), None),
        "…/ana/Documents"
    );
}
