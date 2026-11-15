// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A copy of a server's folder (the maintainer, 2026-11-15) against a real
//! `verso serve` on this machine: the size asked first, a new folder made,
//! bound and synced, everything downloaded, the copy found again for the
//! next pick — and a reader's copy holding only what the server lets it
//! read.

use serde_json::json;
use verso_core::servers::ServerLogin;

use super::*;
use crate::sync::{Ctx, Syncer, link, pass};
use crate::tests_live_table::browser;
use crate::tests_sync::{Running, serve};

/// This device: signed in to the server with `token`, its configuration in
/// a directory of its own.
struct Here {
    service: Arc<Service>,
    login: ServerLogin,
    config: tempfile::TempDir,
}

fn here(r: &Running, token: &str) -> Here {
    let config = tempfile::tempdir().unwrap();
    let login = ServerLogin {
        url: r.url.clone(),
        token: token.to_owned(),
        email: "ana@casa.lan".into(),
        name: "Ana".into(),
    };
    verso_core::servers::keep(Some(config.path()), login.clone()).unwrap();
    Here {
        service: Service::new(Some(config.path().to_path_buf())),
        login,
        config,
    }
}

impl Here {
    fn config(&self) -> Option<&Path> {
        Some(self.config.path())
    }

    /// The copy made in `parent` as the command makes it, opened, bound and
    /// synced once: its key.
    fn copy(&self, r: &Running, parent: &Path) -> String {
        let (name, _, _) = tauri::async_runtime::block_on(plan_of(&self.login, &r.folder)).unwrap();
        let dir = new_folder(parent, &name).unwrap();
        let opened = self
            .service
            .open("w", move |c| Workspace::open(&dir, c))
            .unwrap();
        let (info, _) = self.service.attach("w", opened);
        let state = bind(self.config(), &info.key, &r.url, &r.folder).unwrap();
        let ctx = Ctx {
            service: Arc::clone(&self.service),
            secrets: Arc::new(crate::secrets::Memory::default()),
            config: self.config().map(Path::to_path_buf),
            device: Box::new(|| "Celular".into()),
            pt: Box::new(|| true),
            shown: Box::new(|_, _| {}),
            told: Arc::new(|_, _, _| {}),
            all: Box::new(|_, _| {}),
        };
        let s = Syncer::new(&info.key, &state);
        tauri::async_runtime::block_on(async {
            let mut l = link(&ctx, &s).await.unwrap();
            pass(&ctx, &s, &mut l).await.unwrap();
        });
        info.key
    }

    /// The copy's files, the folder walked again first.
    fn files(&self, key: &str) -> Vec<String> {
        self.service.reindex("w").unwrap();
        self.service
            .with_key(key, |ws| {
                Ok(ws
                    .entries()
                    .iter()
                    .filter(|e| e.kind != verso_core::FileKind::Folder)
                    .map(|e| e.path.clone())
                    .collect())
            })
            .unwrap()
    }

    fn text(&self, key: &str, path: &str) -> String {
        let p = path.to_owned();
        let bytes = self
            .service
            .with_key(key, move |ws| Ok(ws.read_with_revision(&p)?.0))
            .unwrap();
        String::from_utf8(bytes).unwrap()
    }
}

#[test]
fn a_copy_never_takes_a_folder_that_is_there_and_names_itself_as_a_folder_may() {
    let parent = tempfile::tempdir().unwrap();
    let first = new_folder(parent.path(), "RPG").unwrap();
    assert_eq!(first, parent.path().join("RPG"));
    // An Obsidian vault of the same name is never merged into.
    assert_eq!(
        new_folder(parent.path(), "RPG").unwrap(),
        parent.path().join("RPG (2)")
    );
    assert_eq!(
        new_folder(parent.path(), "RPG").unwrap(),
        parent.path().join("RPG (3)")
    );
    assert_eq!(
        new_folder(parent.path(), "Mesa/Sessões: 1").unwrap(),
        parent.path().join("Mesa-Sessões- 1")
    );
    assert_eq!(
        new_folder(parent.path(), ".oculta").unwrap(),
        parent.path().join("oculta")
    );
    assert_eq!(
        new_folder(parent.path(), "  ").unwrap(),
        parent.path().join("Verso")
    );
}

#[test]
fn a_copy_into_an_empty_folder_downloads_everything_and_is_found_for_the_next_pick() {
    let r = serve(&[
        ("Sessao.md", "# Sessao\n"),
        ("Mapa.md", "# Mapa de Ravel\n"),
    ]);
    let phone = here(&r, &r.owner);
    // The size, asked before: both files, their bytes added.
    let (name, files, bytes) =
        tauri::async_runtime::block_on(plan_of(&phone.login, &r.folder)).unwrap();
    assert_eq!((name.as_str(), files), ("Campanha", 2));
    assert_eq!(
        bytes,
        ("# Sessao\n".len() + "# Mapa de Ravel\n".len()) as u64
    );
    // No copy yet: the question is put.
    assert_eq!(copy_of(phone.config(), &r.url, &r.folder), None);

    let parent = tempfile::tempdir().unwrap();
    let key = phone.copy(&r, parent.path());
    assert_eq!(phone.files(&key), ["Mapa.md", "Sessao.md"]);
    assert_eq!(phone.text(&key, "Mapa.md"), "# Mapa de Ravel\n");

    // The next pick opens it, whatever the address's last slash.
    let found = copy_of(phone.config(), &r.url, &r.folder).unwrap();
    assert_eq!(verso_core::folder_key(&found), key);
    assert!(found.ends_with("Campanha"), "{found:?}");
    let slashed = format!("{}/", r.url);
    assert!(copy_of(phone.config(), &slashed, &r.folder).is_some());
    // Another server's folder is not it.
    assert_eq!(copy_of(phone.config(), &r.url, "outra"), None);
    // Turned off, it is no copy to open in the server's place: its notes
    // may be behind.
    sync::off(phone.config(), &key).unwrap();
    assert_eq!(copy_of(phone.config(), &r.url, &r.folder), None);
}

#[test]
fn a_readers_copy_holds_only_what_the_server_lets_it_read() {
    let r = serve(&[
        ("Edita.md", "# Edita\n"),
        ("Le.md", "# Le\n"),
        ("Oculta.md", "# Oculta\n"),
    ]);
    let owner = browser(&r, &r.owner);
    owner.call("reindex", json!({})).unwrap();
    owner.call("campaign_make", json!({ "root": "" })).unwrap();
    owner
        .call("campaign_settings", json!({ "root": "", "open": true }))
        .unwrap();
    let set = |path: &str| {
        let change =
            json!({ "kind": "set", "secret_name": null, "set": { "whole": "see", "rows": [] } });
        owner
            .call("access_set", json!({ "paths": [path], "change": change }))
            .unwrap();
    };
    set("Edita.md");
    set("Le.md");
    let phone = here(&r, &r.reader);
    // The size counts what it will receive, never the hidden note.
    let (_, files, bytes) =
        tauri::async_runtime::block_on(plan_of(&phone.login, &r.folder)).unwrap();
    assert_eq!(files, 2);
    assert_eq!(bytes, ("# Edita\n".len() + "# Le\n".len()) as u64);
    let parent = tempfile::tempdir().unwrap();
    let key = phone.copy(&r, parent.path());
    assert_eq!(phone.files(&key), ["Edita.md", "Le.md"]);
}

/// The pick as the window makes it, through the IPC and the window's
/// capability: no copy of that folder here is `null` (the window asks
/// where to make one); a copy bound to it opens, with nothing asked of the
/// server — offline too.
#[test]
fn picking_a_folder_with_a_copy_here_opens_the_copy_through_the_ipc() {
    use crate::tests::{app, call, note};
    let (app, webview) = app();
    let parent = tempfile::tempdir().unwrap();
    let dir = new_folder(parent.path(), "RPG").unwrap();
    let _n = note(&dir, "Sessao.md", "# Sessao\n");
    let service = Arc::clone(&app.state::<App>().service);
    let config = service.config().map(Path::to_path_buf);
    let opened = service
        .open("elsewhere", move |c| Workspace::open(&dir, c))
        .unwrap();
    let (info, _) = service.attach("elsewhere", opened);
    service.reindex("elsewhere").unwrap();
    let none = call(
        &webview,
        "server_copy_open",
        json!({ "url": "https://notas.casa", "folder": "f1" }),
    )
    .unwrap();
    assert!(none.is_null(), "{none}");
    bind(config.as_deref(), &info.key, "https://notas.casa", "f1").unwrap();
    let shown = call(
        &webview,
        "server_copy_open",
        json!({ "url": "https://notas.casa", "folder": "f1" }),
    )
    .unwrap();
    assert_eq!(shown["name"], "RPG");
    assert_eq!(shown["key"], json!(info.key));
    // A folder of a server this app is not signed in to is not sized.
    let unsigned = call(
        &webview,
        "server_copy_plan",
        json!({ "url": "https://notas.casa", "folder": "f1" }),
    )
    .unwrap_err();
    assert_eq!(unsigned["kind"], "refused", "{unsigned}");
}
