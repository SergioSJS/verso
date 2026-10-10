// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync (ADR 0079) against a real `verso serve` on this machine: two
//! folders of this computer, each a device of its own, and a folder of the
//! server between them.

// The server is not built for Windows (crates/verso-cli/Cargo.toml).
#![cfg(not(windows))]

use std::io::Write;

use verso_contract::SyncStatus;
use verso_core::sync as engine;

use super::sync::{Ctx, Passed, Syncer, link, pass};
use super::*;

struct Loopback;

impl verso_server::config::Env for Loopback {
    fn var(&self, name: &str) -> Option<String> {
        (name == "VERSO_LISTEN").then(|| "127.0.0.1:0".to_owned())
    }
}

/// A running server with a folder "Campanha" holding `files`, and a
/// device token per account: the owner's, then a reader's.
struct Running {
    url: String,
    folder: String,
    owner: String,
    reader: String,
    _dirs: (tempfile::TempDir, tempfile::TempDir),
}

fn serve(files: &[(&str, &str)]) -> Running {
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
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            let _ = verso_server::run(server, listener, std::future::pending()).await;
        });
    });
    let addr = addr_rx.recv().unwrap();
    // The folder's directory stays: `campanha` is dropped with `folders`.
    let _ = campanha.keep();
    Running {
        url: format!("http://localhost:{}", addr.port()),
        folder: folder.id,
        owner,
        reader,
        _dirs: (data, folders),
    }
}

/// A folder of this computer, open, set to sync with the server's.
struct Device {
    ctx: Arc<Ctx>,
    s: Arc<Syncer>,
    key: String,
    shown: Arc<Mutex<Vec<SyncStatus>>>,
    _dirs: (tempfile::TempDir, tempfile::TempDir),
}

fn device(r: &Running, token: &str, files: &[(&str, &str)]) -> Device {
    device_at(&r.url, &r.folder, token, files)
}

fn device_at(url: &str, folder: &str, token: &str, files: &[(&str, &str)]) -> Device {
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
    let d = Device {
        ctx: Arc::new(Ctx {
            service,
            config: Some(config.path().to_path_buf()),
            device: "Mac".into(),
            pt: Box::new(|| true),
            shown: Box::new(move |_, s| lock(&heard).push(s.clone())),
        }),
        s: Syncer::new(&info.key, &state),
        key: info.key,
        shown,
        _dirs: (config, dir),
    };
    for (p, text) in files {
        write(&d, p, text.as_bytes());
    }
    d
}

fn sync(d: &Device) -> Passed {
    tauri::async_runtime::block_on(async {
        let mut l = link(&d.ctx, &d.s).await.unwrap();
        pass(&d.ctx, &d.s, &mut l).await.unwrap()
    })
}

fn read(d: &Device, path: &str) -> Option<Vec<u8>> {
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

fn text(d: &Device, path: &str) -> Option<String> {
    read(d, path).map(|b| String::from_utf8(b).unwrap())
}

/// A change made here, as the watcher reports it to the sync.
fn write(d: &Device, path: &str, bytes: &[u8]) {
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

fn changed(d: &Device, paths: &[&str]) {
    d.ctx.service.reindex("w").unwrap();
    d.s.touched(paths.iter().map(|p| (*p).to_owned()));
}

fn files(d: &Device) -> Vec<String> {
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

fn copy_of(d: &Device, path: &str) -> String {
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
    write(&a, "Quatro.md", b"# Quatro\n\nde A\n");
    write(&b, "Quatro.md", b"# Quatro\n\nde B\n");
    sync(&a);
    sync(&b);
    assert_eq!(text(&b, "Quatro.md").as_deref(), Some("# Quatro\n\nde A\n"));
    let copy = copy_of(&b, "Quatro.md");
    assert_eq!(text(&b, &copy).as_deref(), Some("# Quatro\n\nde B\n"));
    changed(&a, &[]);
    sync(&a);
    assert_eq!(text(&a, &copy).as_deref(), Some("# Quatro\n\nde B\n"));

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
fn a_file_larger_than_a_message_crosses_in_pieces() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[]);
    let big: Vec<u8> = (0..(9_u32 << 20))
        .map(|i| u8::try_from(i % 251).unwrap())
        .collect();
    write(&a, "anexos/mapa.bin", &big);
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(read(&b, "anexos/mapa.bin").as_deref(), Some(big.as_slice()));
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
    assert_eq!(e.kind, ErrorKind::Unavailable, "{e:?}");
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

/// The listing as a fresh walk spells it.
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
    let mut outside = tempfile::Builder::new()
        .prefix("Fugaz.md")
        .rand_bytes(0)
        .tempfile_in(a._dirs.1.path())
        .unwrap();
    outside.write_all(b"# Fugaz\n").unwrap();
    changed(&a, &["Fugaz.md"]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, "Fugaz.md").as_deref(), Some("# Fugaz\n"));
    drop(outside);
    a.s.touched(["Fugaz.md".to_owned()]);
    sync(&a);
    let status = lock(&a.shown).last().cloned().unwrap();
    assert!(
        !status.refused.iter().any(|f| f.reason == "failed"),
        "{status:?}"
    );
    // The listing catches up: the deletion crosses.
    changed(&a, &["Fugaz.md"]);
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(text(&b, "Fugaz.md"), None);
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
#[cfg(not(windows))]
#[test]
fn a_name_not_every_system_keeps_is_said_here_not_sent() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Uma.md", "# Uma\n")]);
    sync(&a);
    let mut outside = tempfile::Builder::new()
        .prefix("hora 10:30.md")
        .rand_bytes(0)
        .tempfile_in(a._dirs.1.path())
        .unwrap();
    outside.write_all(b"# hora\n").unwrap();
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
