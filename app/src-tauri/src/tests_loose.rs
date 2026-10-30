// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A Markdown file handed to the app (ADR 0114 item 29): classified,
//! routed to its folder's window or the loose-files window, refused in
//! words when it is neither; the loose window's own commands and refusals.

use serde_json::json;

use super::*;
use crate::tests::{app, app_alone, app_with, call, note};

/// A Markdown file handed to the running app (ADR 0114 items 6, 7 and
/// 18): the empty main window becomes the loose-files window and opens it
/// as `Opened::File`; a second file is a second tab of the same window;
/// what crosses carries no path; the folder's commands are refused there
/// and the capabilities say what the side cannot do.
#[test]
fn a_file_handed_to_the_running_app_opens_in_the_loose_window() {
    use tauri::Listener;
    let dir = tempfile::tempdir().unwrap();
    let _a = note(dir.path(), "Avulsa.md", "# Avulsa\n\n![[foto.png]]\n");
    let other = tempfile::tempdir().unwrap();
    let _b = note(other.path(), "Outra.md", "# Outra\n");
    let (app, webview) = app();
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
    let told = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = told.clone();
    app.listen_any("file-handed", move |_| {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    path_handed(app.handle(), dir.path().join("Avulsa.md"));
    assert_eq!(told.load(std::sync::atomic::Ordering::SeqCst), 1);
    let opened = call(&webview, "open_initial", json!({})).unwrap();
    assert_eq!(opened["kind"], "file");
    let info = &opened["info"];
    assert_eq!(info["name"], "Avulsa.md");
    assert_eq!(
        info["place"],
        dir.path().file_name().unwrap().to_str().unwrap()
    );
    assert!(!opened.to_string().contains(dir.path().to_str().unwrap()));
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
    // The window is the loose-files window: the next file is its tab.
    // (A listener of its own: the mock runtime delivers an event to each
    // listener once.)
    let told_again = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = told_again.clone();
    app.listen_any("file-handed", move |_| {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    path_handed(app.handle(), other.path().join("Outra.md"));
    assert_eq!(told_again.load(std::sync::atomic::Ordering::SeqCst), 1);
    let second = call(&webview, "open_initial", json!({})).unwrap();
    assert_eq!(second["info"]["name"], "Outra.md");
    let files = call(&webview, "loose_files", json!({})).unwrap();
    assert_eq!(files.as_array().unwrap().len(), 2);
    assert!(
        call(&webview, "current_folder", json!({}))
            .unwrap()
            .is_null()
    );
    // Its own commands answer; the folder's are refused, not "no folder".
    let read = call(&webview, "read_note", json!({"path": "Avulsa.md"})).unwrap();
    assert_eq!(read["headings"][0]["text"], "Avulsa");
    let err = call(&webview, "list_notes", json!({})).unwrap_err();
    assert_eq!(err["kind"], "refused");
    let err = call(&webview, "create_note", json!({"name": "x", "text": ""})).unwrap_err();
    assert_eq!(err["kind"], "refused");
    let can = call(&webview, "capabilities", json!({})).unwrap();
    let can: Vec<String> = serde_json::from_value(can["can"].clone()).unwrap();
    for gone in [
        "index",
        "search",
        "backlinks",
        "create",
        "rename",
        "delete",
        "trash",
        "history",
        "sync",
        "table",
        "board",
        "reveal",
    ] {
        assert!(!can.iter().any(|c| c == gone), "{gone} in {can:?}");
    }
    assert!(can.iter().any(|c| c == "write"));
    // A folder handed now is not this window's to take.
    let vault = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "Nota.md", "# Nota\n");
    folder_handed(app.handle(), vault.path().to_path_buf());
    assert_eq!(lock(&app.state::<App>().initial_folder).len(), 1);
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
    // Closing both tabs makes it a plain window again.
    call(&webview, "loose_close", json!({"name": "Avulsa.md"})).unwrap();
    call(&webview, "loose_close", json!({"name": "Outra.md"})).unwrap();
    assert!(!app.state::<App>().service.is_loose("main"));
    let can = call(&webview, "capabilities", json!({})).unwrap();
    assert!(can["can"].as_array().unwrap().iter().any(|c| c == "index"));
}

/// A file inside a folder a window shows is that window's tab (ADR 0114
/// item 7 i): `open-note` with the path relative to the folder; nothing
/// loose is opened.
#[test]
fn a_file_of_an_open_folder_is_opened_as_a_tab_of_its_window() {
    use tauri::Listener;
    let vault = tempfile::tempdir().unwrap();
    let sub = tempfile::Builder::new()
        .prefix("Sub")
        .rand_bytes(0)
        .tempdir_in(vault.path())
        .unwrap();
    let _n = note(sub.path(), "Nota.md", "# Nota\n");
    let (app, webview) = app_with(Some(vault.path().to_path_buf()));
    let opened = call(&webview, "open_initial", json!({})).unwrap();
    assert_eq!(opened["kind"], "folder");
    let heard = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let seen = heard.clone();
    app.listen_any("open-note", move |e| {
        lock(&seen).push(e.payload().to_owned());
    });
    path_handed(app.handle(), sub.path().join("Nota.md"));
    let heard = lock(&heard).clone();
    assert_eq!(heard.len(), 1, "{heard:?}");
    assert!(
        heard[0].contains("\"main\"") && heard[0].contains("Sub/Nota.md"),
        "{heard:?}"
    );
    assert!(!app.state::<App>().service.is_loose("main"));
    assert!(lock(&app.state::<App>().initial_file).is_empty());
}

/// What is not a folder or a Markdown file is said, and nothing opens
/// (ADR 0114 item 6); a second launch hands a `.md` argument over as a
/// file, a `file://` form included (Windows and Linux).
#[test]
fn what_is_neither_folder_nor_markdown_is_refused_in_words() {
    use tauri::Listener;
    let dir = tempfile::tempdir().unwrap();
    let _t = note(dir.path(), "dados.txt", "x");
    let _m = note(dir.path(), "Nota.md", "# Nota\n");
    let (app, webview) = app();
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
    let refused = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let seen = refused.clone();
    app.listen_any("handed-refused", move |e| {
        lock(&seen).push(e.payload().to_owned());
    });
    let files = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = files.clone();
    app.listen_any("file-handed", move |_| {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    path_handed(app.handle(), dir.path().join("dados.txt"));
    path_handed(app.handle(), dir.path().join("nao-existe.md"));
    let said = lock(&refused).clone();
    assert_eq!(said.len(), 2, "{said:?}");
    assert!(said[0].contains("\"other\"") && said[0].contains("dados.txt"));
    assert!(said[1].contains("\"missing\""));
    assert_eq!(files.load(std::sync::atomic::Ordering::SeqCst), 0);
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
    // The second launch's argument, relative and as a URL.
    second_launch(
        app.handle(),
        vec!["verso-app".into(), "Nota.md".into()],
        dir.path().to_string_lossy().into_owned(),
    );
    assert_eq!(files.load(std::sync::atomic::Ordering::SeqCst), 1);
    let opened = call(&webview, "open_initial", json!({})).unwrap();
    assert_eq!(opened["kind"], "file");
    let url = format!(
        "file://{}",
        dir.path()
            .join("Nota.md")
            .to_string_lossy()
            .replace(' ', "%20")
    );
    second_launch(app.handle(), vec!["verso-app".into(), url], String::new());
    assert_eq!(files.load(std::sync::atomic::Ordering::SeqCst), 2);
    let again = call(&webview, "open_initial", json!({})).unwrap();
    assert_eq!(again["info"]["name"], "Nota.md");
    assert_eq!(
        call(&webview, "loose_files", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

/// A file handed before the setup made the main window (a double-click
/// that launches the app): the main window opens it at start, and no other
/// window is made for it.
#[test]
fn a_file_handed_before_the_main_window_is_opened_by_it_alone() {
    let dir = tempfile::tempdir().unwrap();
    let _m = note(dir.path(), "Nota.md", "# Nota\n");
    let app = app_alone(None);
    path_handed(app.handle(), dir.path().join("Nota.md"));
    assert!(app.webview_windows().is_empty());
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = call(&webview, "open_initial", json!({})).unwrap();
    assert_eq!(opened["kind"], "file");
    assert_eq!(opened["info"]["name"], "Nota.md");
    assert_eq!(app.webview_windows().len(), 1);
}
