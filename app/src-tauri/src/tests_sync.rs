// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync (ADR 0079) against a real `verso serve` on this machine: two
//! folders of this computer, each a device of its own, and a folder of the
//! server between them.

use std::io::Write;

use verso_contract::SyncStatus;
use verso_core::sync as engine;

use super::sync::{Ctx, Passed, Syncer, link, pass};
use super::*;

struct Loopback;

/// A test server listens on the loopback and never runs the update check:
/// `VERSO_UPDATE_CHECK=off` through this table, not the process's
/// environment, so no test reaches GitHub's release feed.
impl verso_server::config::Env for Loopback {
    fn var(&self, name: &str) -> Option<String> {
        match name {
            "VERSO_LISTEN" => Some("127.0.0.1:0".to_owned()),
            "VERSO_UPDATE_CHECK" => Some("off".to_owned()),
            _ => None,
        }
    }
}

/// A running server with a folder "Campanha" holding `files`, and a
/// device token per account: the owner's, then a reader's. Dropped, the
/// server stops: its runtime, its database and its connections go with
/// it. A server left running holds a few dozen descriptors — its sockets,
/// its runtime's, its database's — and the tests that each start one (a
/// property test starts one per case) ran a Linux runner out of them
/// (`ulimit -n` 1024: "Too many open files", 2026-10-12).
pub(super) struct Running {
    pub(super) url: String,
    pub(super) folder: String,
    pub(super) owner: String,
    pub(super) reader: String,
    /// Dropped with the server's handle: the server stops.
    _stop: tokio::sync::oneshot::Sender<()>,
    /// The server, while anything holds it.
    pub(super) server: std::sync::Weak<verso_server::state::Server>,
    pub(super) _dirs: (tempfile::TempDir, tempfile::TempDir),
}

pub(super) fn serve(files: &[(&str, &str)]) -> Running {
    let data = tempfile::tempdir().unwrap();
    let folders = tempfile::tempdir().unwrap();
    let campanha = tempfile::Builder::new()
        .prefix("Campanha")
        .rand_bytes(0)
        .tempdir_in(folders.path())
        .unwrap();
    for (name, text) in files {
        let mut f = tempfile::Builder::new()
            .prefix(*name)
            .rand_bytes(0)
            .tempfile_in(campanha.path())
            .unwrap();
        f.write_all(text.as_bytes()).unwrap();
        f.keep().unwrap();
    }
    let config = verso_server::config::Config::from_env(
        &Loopback,
        &verso_server::config::Defaults {
            data_dir: data.path().to_owned(),
            folders_dir: folders.path().to_owned(),
            ui_dir: data.path().join("ui"),
        },
    )
    .unwrap();
    assert!(
        !config.update_check,
        "a test server never asks the release feed"
    );
    let db = verso_server::db::Db::open(data.path()).unwrap();
    let ana = db
        .create_account("ana@casa.lan", "Ana", "pt", Some("uma senha longa"), true)
        .unwrap();
    let bia = db
        .create_account(
            "bia@casa.lan",
            "Bia",
            "pt",
            Some("outra senha longa"),
            false,
        )
        .unwrap();
    let folder = db.create_folder("Campanha", &ana.id).unwrap();
    db.grant(&folder.id, &bia.id, verso_server::db::Role::Reader)
        .unwrap();
    let (owner, _) = db
        .create_session(&ana.id, "device", "Verso · teste", "127.0.0.1")
        .unwrap();
    let (reader, _) = db
        .create_session(&bia.id, "device", "Verso · leitora", "127.0.0.1")
        .unwrap();
    let server = verso_server::state::Server::new(
        config,
        db,
        verso_server::contract_version(),
        "test".into(),
    );
    let weak = Arc::downgrade(&server);
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            // Stopped when the test lets its server go, at once: a
            // connection still open is not waited for.
            tokio::select! {
                _ = verso_server::run(server, listener, std::future::pending()) => {}
                _ = stopped => {}
            }
        });
        rt.shutdown_background();
    });
    let addr = addr_rx.recv().unwrap();
    // The folder's directory stays: `campanha` is dropped with `folders`.
    let _ = campanha.keep();
    Running {
        url: format!("http://localhost:{}", addr.port()),
        folder: folder.id,
        owner,
        reader,
        _stop: stop,
        server: weak,
        _dirs: (data, folders),
    }
}

/// What a room told a device's windows (ADR 0082): to whom, the event, its
/// payload.
pub(super) type Told = Vec<(Vec<String>, String, serde_json::Value)>;

/// A folder of this computer, open, set to sync with the server's.
pub(super) struct Device {
    pub(super) ctx: Arc<Ctx>,
    pub(super) s: Arc<Syncer>,
    pub(super) key: String,
    pub(super) shown: Arc<Mutex<Vec<SyncStatus>>>,
    pub(super) told: Arc<Mutex<Told>>,
    /// What every window heard (ADR 0084 item 7): the event, its payload.
    pub(super) all: Arc<Mutex<Vec<(String, serde_json::Value)>>>,
    pub(super) _dirs: (tempfile::TempDir, tempfile::TempDir),
}

pub(super) fn device(r: &Running, token: &str, files: &[(&str, &str)]) -> Device {
    device_at(&r.url, &r.folder, token, files)
}

pub(super) fn device_at(url: &str, folder: &str, token: &str, files: &[(&str, &str)]) -> Device {
    let config = tempfile::tempdir().unwrap();
    let dir = tempfile::tempdir().unwrap();
    verso_core::servers::keep(
        Some(config.path()),
        verso_core::servers::ServerLogin {
            url: url.to_owned(),
            token: token.to_owned(),
            email: "ana@casa.lan".into(),
            name: "Ana".into(),
        },
    )
    .unwrap();
    let service = Service::new(Some(config.path().to_path_buf()));
    let path = dir.path().to_path_buf();
    let opened = service
        .open("w", move |c| Workspace::open(&path, c))
        .unwrap();
    let (info, _) = service.attach("w", opened);
    let state = engine::State {
        server: url.to_owned(),
        folder: folder.to_owned(),
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
            secrets: Arc::new(crate::secrets::Memory::default()),
            config: Some(config.path().to_path_buf()),
            device: Box::new(|| "Mac".into()),
            pt: Box::new(|| true),
            shown: Box::new(move |_, s| lock(&heard).push(s.clone())),
            told: Arc::new(move |to, event, payload| {
                lock(&rooms).push((to.to_vec(), event.to_owned(), payload.clone()));
            }),
            all: Box::new(move |event, payload| {
                lock(&everyone).push((event.to_owned(), payload.clone()));
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

pub(super) fn sync(d: &Device) -> Passed {
    tauri::async_runtime::block_on(async {
        let mut l = link(&d.ctx, &d.s).await.unwrap();
        pass(&d.ctx, &d.s, &mut l).await.unwrap()
    })
}

/// A connection kept across passes, as the app keeps one: only its first
/// pass walks the folder again (and the scan's, which these tests do not
/// wait for) — a later one compares the listing as the last batch left it.
pub(super) fn kept(d: &Device) -> super::sync::Link {
    tauri::async_runtime::block_on(link(&d.ctx, &d.s)).unwrap()
}

pub(super) fn on(d: &Device, l: &mut super::sync::Link) -> Passed {
    tauri::async_runtime::block_on(pass(&d.ctx, &d.s, l)).unwrap()
}

pub(super) fn read(d: &Device, path: &str) -> Option<Vec<u8>> {
    let p = path.to_owned();
    match d
        .ctx
        .service
        .with_key(&d.key, move |ws| Ok(ws.read_with_revision(&p)?.0))
    {
        Ok(b) => Some(b),
        Err(e) if e.kind == ErrorKind::NotFound => None,
        Err(e) => panic!("{path}: {e:?}"),
    }
}

pub(super) fn text(d: &Device, path: &str) -> Option<String> {
    read(d, path).map(|b| String::from_utf8(b).unwrap())
}

/// A change made here, as the watcher reports it to the sync.
pub(super) fn write(d: &Device, path: &str, bytes: &[u8]) {
    let (p, b) = (path.to_owned(), bytes.to_vec());
    d.ctx
        .service
        .with_key(&d.key, move |ws| {
            let revision = ws.read_with_revision(&p).ok().map(|(_, r)| r);
            ws.write_bytes(&p, &b, revision.as_deref())?;
            Ok(())
        })
        .unwrap();
    changed(d, &[path]);
}

pub(super) fn changed(d: &Device, paths: &[&str]) {
    d.ctx.service.reindex("w").unwrap();
    d.s.touched(paths.iter().map(|p| (*p).to_owned()));
}

pub(super) fn files(d: &Device) -> Vec<String> {
    d.ctx
        .service
        .with_key(&d.key, |ws| {
            Ok(ws
                .entries()
                .iter()
                .filter(|e| e.kind != verso_core::FileKind::Folder)
                .map(|e| e.path.clone())
                .collect())
        })
        .unwrap()
}

/// A file made in the device's folder by another program, not by Verso.
fn made_outside(d: &Device, name: &str, bytes: &[u8]) -> tempfile::NamedTempFile {
    let mut f = tempfile::Builder::new()
        .prefix(name)
        .rand_bytes(0)
        .tempfile_in(d._dirs.1.path())
        .unwrap();
    f.write_all(bytes).unwrap();
    f
}

pub(super) fn copy_of(d: &Device, path: &str) -> String {
    let stem = path.trim_end_matches(".md");
    files(d)
        .into_iter()
        .find(|p| p.starts_with(&format!("{stem} (conflito, Mac, ")))
        .unwrap_or_else(|| panic!("no conflict copy of {path} in {:?}", files(d)))
}

#[test]
fn the_first_sync_copies_both_ways_deletes_nothing_and_keeps_both_versions() {
    let r = serve(&[("Sessao.md", "# Sessao\n"), ("Mapa.md", "# Mapa\n")]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Sessao.md", "# Sessao local\n"),
            ("Notas/Ideia.md", "# Ideia\n"),
        ],
    );
    let passed = sync(&a);
    assert!(passed.actions >= 3, "{passed:?}");
    // The server's own crossed; the server's version kept the name, this
    // computer's is beside it (item 8).
    assert_eq!(text(&a, "Mapa.md").as_deref(), Some("# Mapa\n"));
    assert_eq!(text(&a, "Sessao.md").as_deref(), Some("# Sessao\n"));
    let copy = copy_of(&a, "Sessao.md");
    assert_eq!(text(&a, &copy).as_deref(), Some("# Sessao local\n"));
    // A second device finds everything, the copy too.
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(text(&b, "Notas/Ideia.md").as_deref(), Some("# Ideia\n"));
    assert_eq!(text(&b, &copy).as_deref(), Some("# Sessao local\n"));
    assert_eq!(text(&b, "Sessao.md").as_deref(), Some("# Sessao\n"));
    // Nothing left to do: the base agrees with both sides.
    changed(&a, &[]);
    assert_eq!(sync(&a).actions, 0);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert_eq!(status.state, "synced");
    assert_eq!(status.conflicts, vec![copy]);
}

#[test]
fn edits_deletions_renames_and_conflicts_cross_between_two_devices() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Uma.md", "# Uma\n"),
            ("Duas.md", "# Duas\n"),
            ("Tres.md", "# Tres\n"),
            ("Quatro.md", "# Quatro\n"),
            ("Cinco.md", "# Cinco\n"),
            ("Seis.md", "# Seis\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(text(&b, "Seis.md").as_deref(), Some("# Seis\n"));

    // An edit here crosses to the other device.
    write(&a, "Uma.md", b"# Uma\n\neditada em A\n");
    sync(&a);
    sync(&b);
    assert_eq!(
        text(&b, "Uma.md").as_deref(),
        Some("# Uma\n\neditada em A\n")
    );

    // A deletion there arrives here, to the folder's bin.
    b.ctx
        .service
        .with_key(&b.key, |ws| Ok(ws.delete_entry("Duas.md").map(|_| ())?))
        .unwrap();
    changed(&b, &["Duas.md"]);
    sync(&b);
    changed(&a, &[]);
    sync(&a);
    assert_eq!(text(&a, "Duas.md"), None);

    // A rename crosses as one.
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            Ok(ws.rename_entry("Tres.md", "Pasta/Tres.md").map(|_| ())?)
        })
        .unwrap();
    changed(&a, &["Tres.md", "Pasta/Tres.md"]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, "Tres.md"), None);
    assert_eq!(text(&b, "Pasta/Tres.md").as_deref(), Some("# Tres\n"));

    // Both edit one note: the first to sync keeps the name on the
    // server; the other's is kept beside it, and reaches the first.
    // (Each rewrites its line: two appends would be joined instead.)
    write(&a, "Quatro.md", b"# Quatro de A\n");
    write(&b, "Quatro.md", b"# Quatro de B\n");
    sync(&a);
    sync(&b);
    assert_eq!(text(&b, "Quatro.md").as_deref(), Some("# Quatro de A\n"));
    let copy = copy_of(&b, "Quatro.md");
    assert_eq!(text(&b, &copy).as_deref(), Some("# Quatro de B\n"));
    changed(&a, &[]);
    sync(&a);
    assert_eq!(text(&a, &copy).as_deref(), Some("# Quatro de B\n"));

    // An edit against a deletion: the edit wins, the file comes back.
    a.ctx
        .service
        .with_key(&a.key, |ws| Ok(ws.delete_entry("Cinco.md").map(|_| ())?))
        .unwrap();
    changed(&a, &["Cinco.md"]);
    write(&b, "Cinco.md", b"# Cinco\n\nmudou\n");
    sync(&b);
    sync(&a);
    assert_eq!(text(&a, "Cinco.md").as_deref(), Some("# Cinco\n\nmudou\n"));
}

/// Two appends to one note's end, made apart, are joined (item 8, decided
/// 2026-10-11): the server's tail first, then this computer's — on both
/// devices and on the server, with no copy, and the log says "merged".
/// The middle edited on one side still makes the copy; so do two appends
/// to a file that is not a note.
#[test]
fn two_appends_to_a_notes_end_are_joined_not_a_copy() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Diario.md", "# Diario\n\nsegunda\n"),
            ("Plano.md", "# Plano\n\nfazer\n"),
            ("Lista.txt", "um\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);

    write(&a, "Diario.md", b"# Diario\n\nsegunda\nterca, de A\n");
    write(&b, "Diario.md", b"# Diario\n\nsegunda\nterca, de B\n");
    sync(&a);
    sync(&b);
    let both = "# Diario\n\nsegunda\nterca, de A\nterca, de B\n";
    assert_eq!(text(&b, "Diario.md").as_deref(), Some(both));
    changed(&a, &[]);
    sync(&a);
    assert_eq!(text(&a, "Diario.md").as_deref(), Some(both));
    // The server holds it too: a device that arrives now receives it.
    let c = device(&r, &r.owner, &[]);
    sync(&c);
    assert_eq!(text(&c, "Diario.md").as_deref(), Some(both));
    for d in [&a, &b, &c] {
        let names = files(d);
        assert!(
            !names.iter().any(|p| super::sync::is_conflict_copy(p)),
            "{names:?}"
        );
    }
    let log = lock(&b.shown).last().cloned().unwrap().log;
    assert!(
        log.iter()
            .any(|e| e.what == "merged" && e.path == "Diario.md"),
        "{log:?}"
    );
    assert!(!log.iter().any(|e| e.what == "conflict"), "{log:?}");
    quiet(&a, &b);

    // The middle edited on one side: the copy, as before.
    write(&a, "Plano.md", b"# Plano\n\nfazer\nde A\n");
    write(&b, "Plano.md", b"# Plano\n\nrefazer\nde B\n");
    sync(&a);
    sync(&b);
    assert_eq!(
        text(&b, "Plano.md").as_deref(),
        Some("# Plano\n\nfazer\nde A\n")
    );
    let copy = copy_of(&b, "Plano.md");
    assert_eq!(
        text(&b, &copy).as_deref(),
        Some("# Plano\n\nrefazer\nde B\n")
    );

    // Not a note: two appends are a copy too.
    write(&a, "Lista.txt", b"um\ndois\n");
    write(&b, "Lista.txt", b"um\ntres\n");
    sync(&a);
    sync(&b);
    assert_eq!(text(&b, "Lista.txt").as_deref(), Some("um\ndois\n"));
    let names = files(&b);
    let copy = names
        .iter()
        .find(|p| p.starts_with("Lista (conflito, Mac, "))
        .unwrap_or_else(|| panic!("no copy of Lista.txt in {names:?}"));
    assert_eq!(text(&b, copy).as_deref(), Some("um\ntres\n"));
}

#[test]
fn a_mass_deletion_pauses_until_the_person_says_yes() {
    let r = serve(&[]);
    let names: Vec<String> = (0..10).map(|i| format!("Nota {i}.md")).collect();
    let list: Vec<(&str, &str)> = names.iter().map(|n| (n.as_str(), "# Nota\n")).collect();
    let a = device(&r, &r.owner, &list);
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    for n in &names[..6] {
        let p = n.clone();
        a.ctx
            .service
            .with_key(&a.key, move |ws| Ok(ws.delete_entry(&p).map(|_| ())?))
            .unwrap();
    }
    changed(&a, &[]);
    // More than a fifth: nothing is deleted until the person says (item 9).
    let paused = sync(&a);
    assert_eq!(paused.paused, Some(6));
    sync(&b);
    assert_eq!(text(&b, "Nota 0.md").as_deref(), Some("# Nota\n"));
    assert_eq!(lock(&a.shown).last().unwrap().deletions, Some(6));
    a.s.confirm();
    sync(&a);
    // The other device is asked too, then follows.
    changed(&b, &[]);
    assert_eq!(sync(&b).paused, Some(6));
    b.s.confirm();
    sync(&b);
    assert_eq!(text(&b, "Nota 0.md"), None);
    assert_eq!(text(&b, "Nota 9.md").as_deref(), Some("# Nota\n"));
}

#[test]
fn a_reader_receives_and_its_own_changes_stay_here_said() {
    let r = serve(&[("Sessao.md", "# Sessao\n")]);
    let reader = device(&r, &r.reader, &[]);
    sync(&reader);
    assert_eq!(text(&reader, "Sessao.md").as_deref(), Some("# Sessao\n"));
    write(&reader, "Sessao.md", b"# Sessao\n\nda leitora\n");
    sync(&reader);
    let status = lock(&reader.shown).last().cloned().unwrap();
    assert_eq!(status.role, "reader");
    assert!(
        status
            .refused
            .iter()
            .any(|f| f.path == "Sessao.md" && f.reason == "reader"),
        "{status:?}"
    );
    // The server's file is as it was.
    let owner = device(&r, &r.owner, &[]);
    sync(&owner);
    assert_eq!(text(&owner, "Sessao.md").as_deref(), Some("# Sessao\n"));
}

#[test]
fn offline_is_said_and_the_folder_is_compared_from_its_base_when_back() {
    // Nothing listens on this port: the server is out of reach.
    let gone = device_at(
        "http://localhost:9",
        "nenhuma",
        "token",
        &[("A.md", "# A\n")],
    );
    let e = tauri::async_runtime::block_on(link(&gone.ctx, &gone.s))
        .err()
        .unwrap();
    // Out of reach, said as such with the server's address (2026-10-14):
    // offline to the sync, which tries again.
    assert_eq!(e.kind, ErrorKind::Unreachable, "{e:?}");
    assert_eq!(e.message, "localhost:9");
    // Changes made while out of reach are a difference from the base,
    // found on the next pass whenever it comes.
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("A.md", "# A\n")]);
    sync(&a);
    write(&a, "A.md", b"# A\n\nsem rede\n");
    write(&a, "B.md", b"# B\n");
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(text(&b, "A.md").as_deref(), Some("# A\n"));
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, "A.md").as_deref(), Some("# A\n\nsem rede\n"));
    assert_eq!(text(&b, "B.md").as_deref(), Some("# B\n"));
}

/// One connection kept across passes, as the app keeps it: after the first
/// pass, the server's files come from its log of changes.
#[test]
fn a_kept_connection_follows_the_servers_log() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        // Enough files that one deletion is not a mass deletion (item 9).
        &[
            ("Uma.md", "# Uma\n"),
            ("Duas.md", "# Duas\n"),
            ("Quatro.md", "# Quatro\n"),
            ("Cinco.md", "# Cinco\n"),
            ("Seis.md", "# Seis\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    let mut l = tauri::async_runtime::block_on(link(&b.ctx, &b.s)).unwrap();
    let on =
        |l: &mut super::sync::Link| tauri::async_runtime::block_on(pass(&b.ctx, &b.s, l)).unwrap();
    on(&mut l);
    assert_eq!(text(&b, "Uma.md").as_deref(), Some("# Uma\n"));
    // A renames one, deletes the other and writes a third.
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            Ok(ws.rename_entry("Uma.md", "Pasta/Uma.md").map(|_| ())?)
        })
        .unwrap();
    a.ctx
        .service
        .with_key(&a.key, |ws| Ok(ws.delete_entry("Duas.md").map(|_| ())?))
        .unwrap();
    write(&a, "Tres.md", b"# Tres\n");
    changed(&a, &["Uma.md", "Pasta/Uma.md", "Duas.md"]);
    sync(&a);
    changed(&b, &[]);
    on(&mut l);
    assert_eq!(text(&b, "Uma.md"), None);
    assert_eq!(text(&b, "Pasta/Uma.md").as_deref(), Some("# Uma\n"));
    assert_eq!(text(&b, "Duas.md"), None);
    assert_eq!(text(&b, "Tres.md").as_deref(), Some("# Tres\n"));
    // And nothing more to do on the same connection.
    changed(&b, &[]);
    assert_eq!(on(&mut l).actions, 0);
}

/// A rename that changes only the case of a name (ADR 0079 item 10), on a
/// file system that folds names (APFS): it crosses as a rename, and the old
/// name, which a read through the folding still opens, is not taken for a
/// second file.
#[cfg(target_os = "macos")]
#[test]
fn a_rename_of_the_case_alone_crosses() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Nota.md", "# Nota\n"),
            ("Outra.md", "# Outra\n"),
            ("Mais.md", "# Mais\n"),
            ("Ainda.md", "# Ainda\n"),
            ("Fim.md", "# Fim\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            Ok(ws.rename_entry("Nota.md", "nota.md").map(|_| ())?)
        })
        .unwrap();
    changed(&a, &["Nota.md", "nota.md"]);
    let passed = sync(&a);
    assert_eq!(passed.actions, 1, "{passed:?}");
    changed(&b, &[]);
    sync(&b);
    assert!(files(&b).contains(&"nota.md".to_owned()), "{:?}", files(&b));
    assert!(
        !files(&b).contains(&"Nota.md".to_owned()),
        "{:?}",
        files(&b)
    );
    // Nothing more to do on either side, and nothing refused.
    changed(&a, &[]);
    assert_eq!(sync(&a).actions, 0);
    changed(&b, &[]);
    assert_eq!(sync(&b).actions, 0);
    let status = lock(&b.shown).last().cloned().unwrap();
    assert!(status.refused.is_empty(), "{status:?}");
}

/// Five notes, one of them `Bem-vindo.md`, on two devices of this computer
/// in step with the server.
fn two_in_step() -> (Running, Device, Device) {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Bem-vindo.md", "# v1\n"),
            ("Outra.md", "# Outra\n"),
            ("Mais.md", "# Mais\n"),
            ("Ainda.md", "# Ainda\n"),
            ("Fim.md", "# Fim\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    (r, a, b)
}

/// The listing as a fresh walk spells it. Only the tests on a file system
/// that folds names read the spelling back.
#[cfg(target_os = "macos")]
fn spelled(d: &Device) -> Vec<String> {
    changed(d, &[]);
    files(d)
}

/// Nothing more to do on either device, and nothing refused.
fn quiet(a: &Device, b: &Device) {
    for d in [a, b] {
        changed(d, &[]);
        assert_eq!(sync(d).actions, 0);
        let status = lock(&d.shown).last().cloned().unwrap();
        assert!(status.refused.is_empty(), "{status:?}");
        assert!(status.conflicts.is_empty(), "{status:?}");
    }
}

/// A name respelled on one device while the file was edited on the other
/// (found by the test plan's reading, 2026-10-10): where names fold, the
/// two spellings are one file; the edit wins, and every side ends with one
/// file of one spelling — never a fetch and a send refused on every pass.
#[cfg(target_os = "macos")]
#[test]
fn a_respelling_here_yields_to_an_edit_there() {
    let (_r, a, b) = two_in_step();
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            Ok(ws
                .rename_entry("Bem-vindo.md", "bem-vindo.md")
                .map(|_| ())?)
        })
        .unwrap();
    write(&b, "Bem-vindo.md", b"# v2\n");
    sync(&b);
    changed(&a, &["Bem-vindo.md", "bem-vindo.md"]);
    sync(&a);
    assert_eq!(text(&a, "Bem-vindo.md").as_deref(), Some("# v2\n"));
    assert!(
        spelled(&a).contains(&"Bem-vindo.md".to_owned()),
        "{:?}",
        files(&a)
    );
    quiet(&a, &b);
    assert!(
        spelled(&b).contains(&"Bem-vindo.md".to_owned()),
        "{:?}",
        files(&b)
    );
}

/// The reversed order: the respelling reached the server first, and the
/// other device, its base still the old spelling, had edited the file —
/// both the new spelling and the edit are kept.
#[cfg(target_os = "macos")]
#[test]
fn a_respelling_there_and_an_edit_here_are_both_kept() {
    let (_r, a, b) = two_in_step();
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            Ok(ws
                .rename_entry("Bem-vindo.md", "bem-vindo.md")
                .map(|_| ())?)
        })
        .unwrap();
    changed(&a, &["Bem-vindo.md", "bem-vindo.md"]);
    sync(&a);
    write(&b, "Bem-vindo.md", b"# v2\n");
    sync(&b);
    assert!(
        spelled(&b).contains(&"bem-vindo.md".to_owned()),
        "{:?}",
        files(&b)
    );
    changed(&a, &[]);
    sync(&a);
    assert_eq!(text(&a, "bem-vindo.md").as_deref(), Some("# v2\n"));
    quiet(&a, &b);
    assert_eq!(text(&b, "bem-vindo.md").as_deref(), Some("# v2\n"));
}

/// A file gone between the listing and its read (F22): not "failed", and
/// not a deletion on that pass — the next pass sees it as it is.
#[test]
fn a_file_gone_while_the_pass_lists_it_is_read_again_not_failed() {
    let (_r, a, b) = two_in_step();
    // Made by another program and listed; dropped, the file goes from the
    // disk while the listing still has it.
    let outside = made_outside(&a, "Fugaz.md", b"# Fugaz\n");
    changed(&a, &["Fugaz.md"]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, "Fugaz.md").as_deref(), Some("# Fugaz\n"));
    // On a connection kept since before: its passes after the first trust
    // the listing.
    let mut la = kept(&a);
    on(&a, &mut la);
    drop(outside);
    a.s.touched(["Fugaz.md".to_owned()]);
    on(&a, &mut la);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(
        !status.refused.iter().any(|f| f.reason == "failed"),
        "{status:?}"
    );
    // The listing catches up: the deletion crosses.
    changed(&a, &["Fugaz.md"]);
    on(&a, &mut la);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, "Fugaz.md"), None);
    quiet(&a, &b);
}

/// A file deleted here while another device, offline, renamed it (C17,
/// the live campaign, 2026-10-10): the rename the server then pushes
/// finds no file here to move. Not "failed": the next pass sees the folder
/// as it is now, and the file arrives under its new name.
#[test]
fn a_file_deleted_here_while_renamed_there_arrives_under_its_new_name() {
    let (_r, a, b) = two_in_step();
    let (old, new) = ("com espaços  duplos.md", "espaços.md");
    // Made by another program, old enough that a pass trusts its size and
    // time without reading it — as any file listed long ago.
    let outside = made_outside(&a, old, b"# Duplos\n");
    outside
        .as_file()
        .set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(3600))
        .unwrap();
    changed(&a, &[old]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, old).as_deref(), Some("# Duplos\n"));
    // A's connection is kept from before the rename: its passes after the
    // first trust the listing.
    let mut la = kept(&a);
    on(&a, &mut la);
    b.ctx
        .service
        .with_key(&b.key, move |ws| {
            Ok(ws.rename_entry(old, new).map(|_| ())?)
        })
        .unwrap();
    changed(&b, &[old, new]);
    sync(&b);
    // Deleted here; the listing has not caught up yet.
    drop(outside);
    on(&a, &mut la);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(status.refused.is_empty(), "{status:?}");
    // The pass the refusal asked for, before any watcher or scan.
    on(&a, &mut la);
    assert_eq!(text(&a, new).as_deref(), Some("# Duplos\n"));
    assert_eq!(text(&a, old), None);
    quiet(&a, &b);
}

/// A note made in the app and synced, then deleted on this computer's disk
/// while its tab, holding unsaved text, stayed open — the tab's autosave
/// failing on the file gone — with the server out of reach meanwhile and
/// the watcher's batch for the deletion never reaching the listing (C15 of
/// the live campaign, 2026-10-11: the first pass after the reconnection
/// carried no deletion, and the next reconnection's did, twelve minutes
/// later). The listing still had the file at the size and time the last
/// pass remembered, so the pass took its hash without reading it. The
/// first pass of a new connection walks the folder first: the deletion
/// crosses then, and a failed write of a window holds nothing apart.
#[test]
fn a_deletion_the_listing_missed_crosses_on_the_first_pass_after_reconnecting() {
    let (_r, a, b) = two_in_step();
    let path = "Ideia nova.md";
    // Old enough that a pass trusts its size and time without reading it.
    let mut made = tempfile::Builder::new()
        .prefix(path)
        .rand_bytes(0)
        .tempfile_in(a._dirs.1.path())
        .unwrap();
    made.write_all(b"# Ideia nova\n").unwrap();
    made.as_file()
        .set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(3600))
        .unwrap();
    changed(&a, &[path]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, path).as_deref(), Some("# Ideia nova\n"));
    // The tab read the note; then the file goes from the disk, and no
    // batch of the watcher reaches the listing.
    let revision = a
        .ctx
        .service
        .with_key(&a.key, move |ws| Ok(ws.read_note(path)?.revision))
        .unwrap();
    drop(made);
    // The tab's autosave: refused, the file is gone.
    let failed = a.ctx.service.with_key(&a.key, move |ws| {
        Ok(ws
            .write_note(path, "# Ideia nova\n\ndigitado\n", &revision)
            .map(|_| ())?)
    });
    assert!(failed.is_err(), "{failed:?}");
    // The server back: a new connection, and its first pass.
    sync(&a);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(status.refused.is_empty(), "{status:?}");
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, path), None);
    quiet(&a, &b);
}

/// A file sync made here, deleted on this computer's disk by another
/// program, with no batch of the watcher to say so — on macOS FSEvents
/// never reports the removal of a file whose name was given by `link`, as
/// `verso-fs` gives every file it creates — while another device edits it
/// (C13 of the live campaign, 2026-10-11: the pass planned a fetch over the
/// file the listing still held, its read answered "No such file", and the
/// file was listed as changed until a later pass). The step that finds it
/// gone walks the folder and asks for a pass at once: that pass fetches
/// the edit, and nothing is listed as changed.
#[test]
fn a_file_gone_here_unseen_by_the_watcher_takes_the_edit_on_the_pass_right_after() {
    let (_r, a, b) = two_in_step();
    let path = "vazio.md";
    write(&b, path, b"");
    sync(&b);
    let mut la = kept(&a);
    on(&a, &mut la);
    assert_eq!(text(&a, path).as_deref(), Some(""));
    // Listed, and old enough that a pass trusts its size and time without
    // reading it, as in the campaign (received 90 s before).
    std::thread::sleep(std::time::Duration::from_millis(3100));
    changed(&a, &[path]);
    on(&a, &mut la);
    write(&b, path, b"# agora com texto\n");
    sync(&b);
    // Gone from the disk; the listing still has it.
    let on_disk = a._dirs.1.path().join(path);
    drop(tempfile::TempPath::try_from_path(on_disk).unwrap());
    on(&a, &mut la);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(status.refused.is_empty(), "{status:?}");
    // The pass the step asked for, before any watcher or scan.
    on(&a, &mut la);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(status.refused.is_empty(), "{status:?}");
    assert_eq!(text(&a, path).as_deref(), Some("# agora com texto\n"));
    quiet(&a, &b);
}

/// A folder moved on one device: on the other, its notes arrive at the new
/// place and the old folders, emptied, go too — nothing empty is left
/// behind (found with two installed apps, 2026-10-10).
#[test]
fn a_moved_folder_leaves_no_empty_folder_behind() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Pasta/Sub/Funda.md", "# Funda\n"),
            ("Um.md", "# Um\n"),
            ("Dois.md", "# Dois\n"),
            ("Tres.md", "# Tres\n"),
            ("Quatro.md", "# Quatro\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            Ok(ws
                .rename_entry("Pasta/Sub/Funda.md", "Outra/Funda.md")
                .map(|_| ())?)
        })
        .unwrap();
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            ws.prune_empty_parents("Pasta/Sub/Funda.md");
            Ok(())
        })
        .unwrap();
    changed(&a, &["Pasta/Sub/Funda.md", "Outra/Funda.md"]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, "Outra/Funda.md").as_deref(), Some("# Funda\n"));
    let folders = b
        .ctx
        .service
        .with_key(&b.key, |ws| {
            ws.index_with_progress(|_| {})?;
            Ok(ws.folders())
        })
        .unwrap();
    assert!(
        !folders.iter().any(|f| f.starts_with("Pasta")),
        "{folders:?}"
    );
}

/// A file made outside Verso with a name not every system can keep is
/// listed here with its reason and never sent: the server would refuse it
/// (ADR 0070 item 3; found in the four-device campaign, 2026-10-10).
// Windows cannot make a file named "hora 10:30.md" to begin with.
#[cfg(not(windows))]
#[test]
fn a_name_not_every_system_keeps_is_said_here_not_sent() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Uma.md", "# Uma\n")]);
    sync(&a);
    let _outside = made_outside(&a, "hora 10:30.md", b"# hora\n");
    changed(&a, &["hora 10:30.md"]);
    assert_eq!(sync(&a).actions, 0);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(
        status
            .refused
            .iter()
            .any(|f| f.path == "hora 10:30.md" && f.reason == "name_invalid"),
        "{status:?}"
    );
}

/// A file of the base whose name a folder now holds is gone here, never
/// read as a file and listed as failed: the unit of sync is a file (ADR
/// 0079 item 2; the server's side of it found 2026-10-10).
#[test]
fn a_folder_where_a_file_was_is_that_file_gone_not_failed() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Anexos", "anexos\n"),
            ("Um.md", "# Um\n"),
            ("Dois.md", "# Dois\n"),
            ("Tres.md", "# Tres\n"),
            ("Quatro.md", "# Quatro\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(text(&b, "Anexos").as_deref(), Some("anexos\n"));
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            ws.delete_entry("Anexos")?;
            ws.create_folder("Anexos")?;
            Ok(())
        })
        .unwrap();
    write(&a, "Anexos/mapa.md", b"# Mapa\n");
    changed(&a, &["Anexos", "Anexos/mapa.md"]);
    sync(&a);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(
        !status.refused.iter().any(|f| f.reason == "failed"),
        "{status:?}"
    );
    // The file's deletion and the new note both cross.
    for _ in 0..2 {
        changed(&a, &[]);
        sync(&a);
        changed(&b, &[]);
        sync(&b);
    }
    assert_eq!(text(&b, "Anexos/mapa.md").as_deref(), Some("# Mapa\n"));
}

/// `Café.md` with its accent composed (NFC) and decomposed (NFD).
const COMPOSED: &str = "Caf\u{e9}.md";
const DECOMPOSED: &str = "Cafe\u{301}.md";

/// The names of `d`'s files that are `Café.md` in either form.
fn cafes(d: &Device) -> Vec<String> {
    changed(d, &[]);
    files(d)
        .into_iter()
        .filter(|p| verso_core::sync::folded_form(p) == COMPOSED)
        .collect()
}

/// One name is one file everywhere (spec Q7, decided 2026-10-10; finding
/// F20 of the sync campaign): a device that keeps `Café.md` decomposed and
/// the server that keeps it composed hold one file — on ext4 too, where
/// the two forms would be two files — and the device keeps its spelling
/// while the edits cross both ways.
#[test]
fn the_two_forms_of_a_name_are_one_file_and_each_device_keeps_its_own() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[(COMPOSED, "# v1\n"), ("Outra.md", "# Outra\n")],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[(DECOMPOSED, "# v1\n")]);
    sync(&b);
    assert_eq!(cafes(&b), vec![DECOMPOSED.to_owned()]);
    // Edited on the device that keeps it composed: arrives under the
    // other's spelling.
    write(&a, COMPOSED, b"# v2\n");
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, DECOMPOSED).as_deref(), Some("# v2\n"));
    assert_eq!(cafes(&b), vec![DECOMPOSED.to_owned()]);
    // And back.
    write(&b, DECOMPOSED, b"# v3\n");
    sync(&b);
    changed(&a, &[]);
    sync(&a);
    assert_eq!(text(&a, COMPOSED).as_deref(), Some("# v3\n"));
    assert_eq!(cafes(&a), vec![COMPOSED.to_owned()]);
    quiet(&a, &b);
}

/// A device on ext4 holding both forms as two files — the state the
/// campaign left (F20): one is sent, the other is listed as a name taken,
/// the same on every pass, and nothing loops. Verso no longer makes the
/// second form beside the first (its new-name check folds case and the
/// accents' form, spec Q7 and Q8), so it is made as another program would.
#[cfg(target_os = "linux")]
#[test]
fn both_forms_as_two_files_here_send_one_and_say_the_other() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[(COMPOSED, "# composto\n")]);
    made_outside(&a, DECOMPOSED, b"# decomposto\n")
        .keep()
        .unwrap();
    changed(&a, &[DECOMPOSED]);
    sync(&a);
    for _ in 0..2 {
        changed(&a, &[]);
        assert_eq!(sync(&a).actions, 0);
        let status = lock(&a.shown).last().cloned().unwrap();
        assert!(
            status
                .refused
                .iter()
                .any(|f| f.path == DECOMPOSED && f.reason == "name_taken"),
            "{status:?}"
        );
    }
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(text(&b, COMPOSED).as_deref(), Some("# composto\n"));
    assert_eq!(cafes(&b), vec![COMPOSED.to_owned()]);
}

/// A file larger than sync carries, here (R1 of 2026-10-11, the device's
/// side): known by the listing's size and never read — a file of
/// gigabytes read and hashed at every pass takes the computer's memory —
/// listed with its reason on every pass, and never sent.
#[test]
fn a_file_larger_than_sync_carries_is_listed_here_never_read() {
    const NAME: &str = "Grande-demais.bin";
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Uma.md", "# Uma\n")]);
    sync(&a);
    // Sparse: its size says more than 1 GiB, and it takes no disk. An
    // hour old, so that a read of it would be remembered by its size and
    // time (`seen`).
    let f = tempfile::Builder::new()
        .prefix(NAME)
        .rand_bytes(0)
        .tempfile_in(a._dirs.1.path())
        .unwrap();
    f.as_file().set_len((1 << 30) + 1).unwrap();
    f.as_file()
        .set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(3600))
        .unwrap();
    f.keep().unwrap();
    changed(&a, &[NAME]);
    for _ in 0..2 {
        assert_eq!(sync(&a).actions, 0);
        let status = lock(&a.shown).last().cloned().unwrap();
        assert!(
            status
                .refused
                .iter()
                .any(|f| f.path == NAME && f.reason == "too_large"),
            "{status:?}"
        );
    }
    let state = engine::load(a.ctx.config.as_deref(), &a.key)
        .unwrap()
        .unwrap();
    assert!(!state.seen.contains_key(NAME), "read: {:?}", state.seen);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(text(&b, "Uma.md").as_deref(), Some("# Uma\n"));
    assert!(read(&b, NAME).is_none());
}

/// A server whose sync this app cannot follow (ADR 0079 item 5): this
/// app says its own sync as it connects, and a server that answers it
/// takes it no longer is said in words — the folder's state is an error,
/// a version problem naming both Verso versions — as a contract that
/// differs is, never a connection lost. The server here is a stand-in: a
/// real one two sync versions ahead does not exist yet.
#[test]
fn a_server_that_does_not_follow_this_apps_sync_is_said_in_words() {
    use futures_util::SinkExt;
    use serde_json::json;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio_tungstenite::tungstenite::Message;
    use tokio_tungstenite::tungstenite::handshake::server::{
        Callback, ErrorResponse, Request, Response,
    };

    /// What the device said of its sync as it connected.
    struct Said(Arc<Mutex<Option<String>>>);

    impl Callback for Said {
        fn on_request(self, r: &Request, a: Response) -> Result<Response, ErrorResponse> {
            *lock(&self.0) = r
                .headers()
                .get(engine::PROTOCOL_HEADER)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);
            Ok(a)
        }
    }

    let listener =
        tauri::async_runtime::block_on(tokio::net::TcpListener::bind("127.0.0.1:0")).unwrap();
    let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let said: Arc<Mutex<Option<String>>> = Arc::default();
    let heard = Arc::clone(&said);
    tauri::async_runtime::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let heard = Arc::clone(&heard);
            tauri::async_runtime::spawn(async move {
                let mut head = [0_u8; 32];
                let n = stream.peek(&mut head).await.unwrap();
                // The folders the account reaches, over HTTP.
                if head[..n].starts_with(b"GET /api/folders") {
                    let mut request = Vec::new();
                    let mut buf = [0_u8; 1024];
                    while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                        let n = stream.read(&mut buf).await.unwrap();
                        request.extend_from_slice(&buf[..n]);
                    }
                    let body =
                        json!({ "folders": [{ "id": "f", "name": "Campanha", "role": "owner" }] })
                            .to_string();
                    let answer = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    stream.write_all(answer.as_bytes()).await.unwrap();
                    return;
                }
                let mut ws = tokio_tungstenite::accept_hdr_async(stream, Said(heard))
                    .await
                    .unwrap();
                let hello = json!({ "hello": {
                    "version": "9.0.0",
                    "commit": "abc1234",
                    "contract": crate::compat::contract_version(),
                    "sync": 3,
                    "syncRefused": "this app speaks sync 1, the server sync 3 and 2: update the one that is behind",
                }});
                ws.send(Message::Text(hello.to_string().into()))
                    .await
                    .unwrap();
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            });
        }
    });
    let d = device_at(&url, "f", "um token", &[]);
    tauri::async_runtime::spawn(super::sync::run(Arc::clone(&d.ctx), Arc::clone(&d.s)));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    let status = loop {
        let last = lock(&d.shown).last().cloned();
        if let Some(s) = last.filter(|s| s.state != "starting" && s.state != "syncing") {
            break s;
        }
        assert!(std::time::Instant::now() < deadline, "no state said");
        std::thread::sleep(std::time::Duration::from_millis(50));
    };
    d.s.stop();
    assert_eq!(status.state, "error", "{status:?}");
    assert_eq!(status.problem.as_deref(), Some("version"), "{status:?}");
    let message = status.message.clone().unwrap_or_default();
    assert!(message.contains("sync 3"), "{message}");
    assert!(
        message.ends_with("update the one that is behind"),
        "{message}"
    );
    assert_eq!(
        status.versions.as_ref().map(|v| v.server_version.as_str()),
        Some("9.0.0"),
        "{status:?}"
    );
    assert_eq!(
        lock(&said).as_deref(),
        Some(engine::PROTOCOL.to_string().as_str())
    );
}

/// More changes on the server than one answer of its log carries (a page
/// of 1000) while a kept connection waits — a burst of changes, or a
/// device back after a long time: the device reads every page from the
/// last change it received, and only then takes the head as its cursor.
/// A rename, a deletion and an edit on the second page cross too.
#[test]
fn more_than_a_page_of_changes_is_read_page_by_page_not_skipped() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Uma.md", "# Uma\n"),
            ("Duas.md", "# Duas\n"),
            ("Quatro.md", "# Quatro\n"),
            ("Cinco.md", "# Cinco\n"),
            ("Seis.md", "# Seis\n"),
        ],
    );
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    let mut l = kept(&b);
    on(&b, &mut l);
    assert_eq!(text(&b, "Uma.md").as_deref(), Some("# Uma\n"));
    // A thousand new notes: the first page, whole.
    let many: Vec<String> = (0..1000).map(|i| format!("Nota {i:04}.md")).collect();
    for name in &many {
        let mut f = tempfile::Builder::new()
            .prefix(name.as_str())
            .rand_bytes(0)
            .tempfile_in(a._dirs.1.path())
            .unwrap();
        f.write_all(name.as_bytes()).unwrap();
        f.keep().unwrap();
    }
    changed(&a, &[]);
    sync(&a);
    // Then a rename, a deletion and an edit: the second page.
    a.ctx
        .service
        .with_key(&a.key, |ws| {
            Ok(ws.rename_entry("Uma.md", "Pasta/Uma.md").map(|_| ())?)
        })
        .unwrap();
    a.ctx
        .service
        .with_key(&a.key, |ws| Ok(ws.delete_entry("Duas.md").map(|_| ())?))
        .unwrap();
    write(&a, "Quatro.md", b"# Quatro\n\neditada\n");
    changed(&a, &["Uma.md", "Pasta/Uma.md", "Duas.md"]);
    sync(&a);
    // B, on the connection it kept.
    changed(&b, &[]);
    on(&b, &mut l);
    for name in &many {
        assert_eq!(text(&b, name).as_deref(), Some(name.as_str()), "{name}");
    }
    assert_eq!(text(&b, "Uma.md"), None);
    assert_eq!(text(&b, "Pasta/Uma.md").as_deref(), Some("# Uma\n"));
    assert_eq!(text(&b, "Duas.md"), None);
    assert_eq!(
        text(&b, "Quatro.md").as_deref(),
        Some("# Quatro\n\neditada\n")
    );
    // Its cursor at the server's head, as a new connection finds it.
    let mut fresh = kept(&a);
    on(&a, &mut fresh);
    assert_eq!(l.cursor(), fresh.cursor());
    // And nothing more to do on the same connection.
    changed(&b, &[]);
    assert_eq!(on(&b, &mut l).actions, 0);
}

/// The folder's settings, `.verso/settings.json` (ADR 0070 items 1–2),
/// cross like any file though the walk never lists them: written on one
/// device, they arrive on the other; changed on both, the server's keeps
/// the name and this computer's is kept beside it, in `.verso/` too —
/// never in the listing the tree and the index read.
#[test]
fn the_folders_settings_cross_like_a_file_and_a_conflict_keeps_both() {
    let r = serve(&[("Nota.md", "# Nota\n")]);
    let a = device(&r, &r.owner, &[]);
    let b = device(&r, &r.owner, &[]);
    sync(&a);
    sync(&b);
    let starred = |d: &Device, list: &[&str]| {
        let change = verso_core::FolderSettings {
            bookmarks: Some(list.iter().map(|s| (*s).to_owned()).collect()),
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
        changed(d, &[".verso/settings.json"]);
    };
    let bookmarks = |d: &Device| {
        d.ctx
            .service
            .with_key(&d.key, |ws| Ok(ws.folder_settings().settings.bookmarks))
            .unwrap()
    };
    starred(&a, &["Nota.md"]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(bookmarks(&b), Some(vec!["Nota.md".to_owned()]));
    assert!(files(&b).iter().all(|p| !p.starts_with(".verso")));

    // Both change them: a conflict, kept beside the file, in `.verso/`.
    starred(&a, &["Nota.md", "De A.md"]);
    starred(&b, &["De B.md"]);
    sync(&a);
    sync(&b);
    assert_eq!(
        bookmarks(&b),
        Some(vec!["Nota.md".to_owned(), "De A.md".to_owned()])
    );
    let copies: Vec<String> = b
        .ctx
        .service
        .with_key(&b.key, |ws| {
            Ok(ws
                .settings_entries()
                .iter()
                .map(|e| e.path.clone())
                .filter(|p| p.starts_with(".verso/settings (conflito, Mac, "))
                .collect())
        })
        .unwrap();
    assert_eq!(copies.len(), 1, "{copies:?}");
    assert!(
        text(&b, &copies[0]).unwrap().contains("\"De B.md\""),
        "the copy is this computer's version"
    );
    assert!(files(&b).iter().all(|p| !p.starts_with(".verso")));
    // The copy reaches the first device too.
    changed(&a, &[]);
    sync(&a);
    assert!(text(&a, &copies[0]).is_some());
}

/// A test's server stops when the test lets it go: a property test starts
/// one per case, and servers left running took a Linux runner's file
/// descriptors (2026-10-12).
#[test]
fn a_test_server_stops_when_it_is_let_go() {
    let r = serve(&[]);
    let addr = r
        .url
        .trim_start_matches("http://localhost:")
        .parse::<u16>()
        .unwrap();
    let reaches = || std::net::TcpStream::connect(("127.0.0.1", addr)).is_ok();
    assert!(reaches());
    // A device synced with it: its connection, its folder.
    let d = device(&r, &r.owner, &[("Uma.md", "# Uma\n")]);
    sync(&d);
    let server = r.server.clone();
    drop(r);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while (reaches() || server.strong_count() > 0) && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert!(!reaches(), "the server still listens");
    assert_eq!(server.strong_count(), 0, "the server is still held");
    drop(d);
}
