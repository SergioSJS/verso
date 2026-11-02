//! The commands as the UI calls them: through Tauri's IPC, on the
//! mock runtime, with the JSON the bindings send. What crosses is
//! the contract; nothing here touches a window.

use std::io::Write;

use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::InvokeRequest;

#[allow(unused_imports)]
use super::*;
use crate::version::ParsedVersion;

/// A window keeps its size on a large screen, and on a small one fits the
/// work area, centred, never under its minimum: 1180×760 on a 1280×800
/// screen at 125% (a work area of 1024×592 under the task bar) was taller
/// than the screen.
#[test]
fn a_window_fits_the_screens_work_area() {
    let main = (1180.0, 760.0);
    let min = (360.0, 480.0);
    assert_eq!(fit_to_area(main, min, (0.0, 25.0, 1920.0, 1055.0)), None);
    assert_eq!(
        fit_to_area(main, min, (0.0, 0.0, 1024.0, 592.0)),
        Some((1024.0, 592.0, 0.0, 0.0))
    );
    // Only the side that does not fit shrinks, and the window is centred
    // in what is left: 1280×752 at 100% under a 48 px task bar.
    assert_eq!(
        fit_to_area(main, min, (0.0, 0.0, 1280.0, 752.0)),
        Some((1180.0, 752.0, 50.0, 0.0))
    );
    // A work area below the minimum keeps the minimum.
    assert_eq!(
        fit_to_area(main, min, (0.0, 0.0, 800.0, 400.0)),
        Some((800.0, 480.0, 0.0, 0.0))
    );
    // A screen that says nothing changes nothing.
    assert_eq!(fit_to_area(main, min, (0.0, 0.0, 0.0, 0.0)), None);
}

/// What the install hands the shell and AppleScript stays one word and
/// one string, whatever the app's path holds — a space in "Verso Beta",
/// a quote someone put in a folder's name.
#[cfg(target_os = "macos")]
#[test]
fn install_quotes_the_path_once() {
    assert_eq!(
        shell_word(Path::new(
            "/Applications/Verso Beta.app/Contents/MacOS/verso"
        )),
        "'/Applications/Verso Beta.app/Contents/MacOS/verso'"
    );
    assert_eq!(
        shell_word(Path::new("/tmp/it's/verso")),
        r"'/tmp/it'\''s/verso'"
    );
    assert_eq!(applescript_string(r#"a "b" \ c"#), r#""a \"b\" \\ c""#);
    let shell = format!("ln -sfn {} {CLI_LINK}", shell_word(Path::new("/x/it's")));
    assert_eq!(
        applescript_string(&shell),
        r#""ln -sfn '/x/it'\\''s' /usr/local/bin/verso""#
    );
}

/// The temporary directory a test's indexes go to, managed beside the
/// state. The tests' app is never torn down — a folder's watch holds a
/// handle to it — so the directory stays in the system's temporary
/// directory, like any test's; what matters is that it is never the
/// user's configuration directory.
struct TestConfig {
    _dir: tempfile::TempDir,
}

/// The app with the folder the command line would have named, and its
/// indexes in a temporary directory: never the user's.
pub(super) fn app_with(
    initial: Option<PathBuf>,
) -> (tauri::App<MockRuntime>, tauri::WebviewWindow<MockRuntime>) {
    let app = app_alone(initial);
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (app, webview)
}

/// The app as it stands before its setup made the main window.
pub(super) fn app_alone(initial: Option<PathBuf>) -> tauri::App<MockRuntime> {
    let config = tempfile::tempdir().unwrap();
    let app = mock_builder()
        .plugin(navigation_guard())
        .plugin(tauri_plugin_notification::init())
        .manage(App {
            service: Service::new(Some(config.path().to_path_buf())),
            ..App::new(initial)
        })
        .manage(TestConfig { _dir: config })
        .invoke_handler(commands_for!(MockRuntime).invoke_handler())
        // The app's own context: its capabilities decide what a window may call.
        .build(context())
        .unwrap();
    hear(app.handle());
    app
}

pub(super) fn app() -> (tauri::App<MockRuntime>, tauri::WebviewWindow<MockRuntime>) {
    app_with(None)
}

/// A folder macOS hands the running app (`open -a Verso <folder>`) is
/// the main window's to open, once, as the command line's would be;
/// the window is told, and what crosses is still a name and a key.
#[test]
fn a_folder_handed_to_the_running_app_is_opened_once_by_the_main_window() {
    use tauri::Listener;
    let vault = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "# Nota\n");
    let (app, webview) = app();
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());

    let told = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = told.clone();
    app.listen_any("folder-handed", move |_| {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    folder_handed(app.handle(), vault.path().to_path_buf());
    assert_eq!(told.load(std::sync::atomic::Ordering::SeqCst), 1);

    let info = call(&webview, "open_initial", json!({})).unwrap()["info"].clone();
    assert_eq!(
        info["name"],
        vault.path().file_name().unwrap().to_str().unwrap()
    );
    assert!(!info.to_string().contains(vault.path().to_str().unwrap()));
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
}

/// macOS hands `open -a Verso <folder>` to an app that is launching before
/// its setup has made the main window (the live campaign, 2026-10-11: after
/// a quit, the folder's window opened and an empty "Verso" one beside it):
/// no window is made for the folder; the main window, made next, opens it.
#[test]
fn a_folder_handed_before_the_main_window_is_opened_by_it_alone() {
    let vault = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "# Nota\n");
    let app = app_alone(None);
    folder_handed(app.handle(), vault.path().to_path_buf());
    assert!(app.webview_windows().is_empty());
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let info = call(&webview, "open_initial", json!({})).unwrap()["info"].clone();
    assert_eq!(
        info["name"],
        vault.path().file_name().unwrap().to_str().unwrap()
    );
    assert_eq!(app.webview_windows().len(), 1);
}

/// The app launched again (`verso <folder>`, any system): the second
/// launch's folder, relative to its own directory, is handed to the
/// running app as macOS's open event hands it — the same window takes it.
#[test]
fn a_second_launch_hands_its_folder_to_the_running_app() {
    use tauri::Listener;
    let parent = tempfile::tempdir().unwrap();
    // The folder made by tempfile, named exactly: this crate's code may not
    // call std::fs outside update.rs and log.rs (ADR 0029).
    let cofre = tempfile::Builder::new()
        .prefix("Cofre")
        .rand_bytes(0)
        .tempdir_in(parent.path())
        .unwrap();
    let _nota = note(cofre.path(), "Nota.md", "# Nota\n");
    let (app, webview) = app();
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
    let told = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = told.clone();
    app.listen_any("folder-handed", move |_| {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    second_launch(
        app.handle(),
        vec!["verso-app".into(), "Cofre".into()],
        parent.path().to_string_lossy().into_owned(),
    );
    assert_eq!(told.load(std::sync::atomic::Ordering::SeqCst), 1);
    let info = call(&webview, "open_initial", json!({})).unwrap()["info"].clone();
    assert_eq!(info["name"], "Cofre");
    // Launched again with no folder: nothing is handed.
    second_launch(app.handle(), vec!["verso-app".into()], String::new());
    assert_eq!(told.load(std::sync::atomic::Ordering::SeqCst), 1);
}

/// Two folders handed before a window took the first (`verso a; verso b`
/// in a row): both wait in line and both are opened, in order — before,
/// the second overwrote the first.
#[test]
fn two_folders_handed_at_once_are_both_opened() {
    let one = tempfile::tempdir().unwrap();
    let two = tempfile::tempdir().unwrap();
    let _a = note(one.path(), "A.md", "# A\n");
    let _b = note(two.path(), "B.md", "# B\n");
    let (app, webview) = app();
    folder_handed(app.handle(), one.path().to_path_buf());
    folder_handed(app.handle(), two.path().to_path_buf());
    assert_eq!(lock(&app.state::<App>().initial_folder).len(), 2);
    let first = call(&webview, "open_initial", json!({})).unwrap()["info"].clone();
    assert_eq!(
        first["name"],
        one.path().file_name().unwrap().to_str().unwrap()
    );
    assert_eq!(lock(&app.state::<App>().initial_folder).len(), 1);
}

/// A window told a folder is not told another while it opens the first
/// (`verso a` then `verso b` while `a` indexes): the second gets a window
/// of its own, and the first window opens the first folder.
#[test]
fn a_window_opening_a_folder_is_not_handed_another() {
    use tauri::Listener;
    let one = tempfile::tempdir().unwrap();
    let two = tempfile::tempdir().unwrap();
    let _a = note(one.path(), "A.md", "# A\n");
    let _b = note(two.path(), "B.md", "# B\n");
    let (app, webview) = app();
    let told = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = told.clone();
    app.listen_any("folder-handed", move |_| {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    folder_handed(app.handle(), one.path().to_path_buf());
    // The main window took it and installs it (what open_initial and
    // install do), so no folder waits in line any more.
    let taken = lock(&app.state::<App>().initial_folder).pop_front();
    assert_eq!(taken.as_deref(), Some(one.path()));
    lock(&app.state::<App>().opening).insert("main".to_owned());
    let windows = app.webview_windows().len();
    folder_handed(app.handle(), two.path().to_path_buf());
    // Told once; the second folder gets a window of its own and waits for it.
    assert_eq!(told.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert_eq!(app.webview_windows().len(), windows + 1);
    assert_eq!(
        lock(&app.state::<App>().initial_folder)
            .front()
            .map(PathBuf::as_path),
        Some(two.path())
    );
    let _ = webview;
}

/// A note another app writes while the folder is open: the index finds
/// it and the app's windows are told, by its path relative to the
/// folder; a note Verso wrote itself is never reported as changed
/// outside (the watcher, provisional: `docs/reference/watcher-decision.md`).
#[test]
fn a_change_made_outside_reaches_the_windows() {
    use std::time::{Duration, Instant};
    use tauri::Listener;
    let vault = tempfile::tempdir().unwrap();
    let _uma = note(vault.path(), "Uma.md", "# Uma\n");
    let (app, main) = app_with(Some(vault.path().to_path_buf()));
    let (tx, rx) = std::sync::mpsc::channel::<Value>();
    app.listen_any("folder-changed", move |event| {
        let _ = tx.send(serde_json::from_str(event.payload()).unwrap());
    });
    let info = call(&main, "open_initial", json!({})).unwrap()["info"].clone();
    // What the system still had to say about the folder's creation.
    while rx.recv_timeout(Duration::from_millis(700)).is_ok() {}

    let read = call(&main, "read_note", json!({ "path": "Uma" })).unwrap();
    call(
        &main,
        "write_note",
        json!({ "path": "Uma", "text": "# Uma\n\nDito aqui.\n", "revision": read["revision"] }),
    )
    .unwrap();
    let _duas = note(vault.path(), "Duas.md", "O caminho para [[Uma]].\n");

    let names = |event: &Value, field: &str, note: &str| {
        event[field].as_array().unwrap().iter().any(|p| p == note)
    };
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut seen = Vec::new();
    while let Ok(event) = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
        seen.push(event.clone());
        if names(&event, "changed", "Duas.md") {
            break;
        }
    }
    let told = seen.iter().find(|e| names(e, "changed", "Duas.md"));
    let told = told.unwrap_or_else(|| panic!("the windows were never told: {seen:?}"));
    assert_eq!(told["key"], info["key"], "{told}");
    assert!(
        !seen.iter().any(|e| names(e, "changed", "Uma.md")),
        "Verso's own write reported as a change made outside: {seen:?}"
    );
    let back = call(&main, "backlinks", json!({ "path": "Uma" })).unwrap();
    assert_eq!(back.as_array().unwrap().len(), 1, "{back}");
}

/// One batch reaches the windows once, however many there are: `emit_to`
/// a label also reaches whoever listens to all, as the windows do, so a
/// loop over the windows delivered each batch once per window.
#[test]
fn one_batch_is_told_once_whatever_the_windows() {
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;
    use tauri::Listener;
    let vault = tempfile::tempdir().unwrap();
    let _uma = note(vault.path(), "Uma.md", "# Uma\n");
    let (app, main) = app_with(Some(vault.path().to_path_buf()));
    let info = call(&main, "open_initial", json!({})).unwrap()["info"].clone();
    for label in ["note-0", "note-1"] {
        tauri::WebviewWindowBuilder::new(&app, label, Default::default())
            .build()
            .unwrap();
    }
    let told = Arc::new(AtomicUsize::new(0));
    let seen = Arc::clone(&told);
    // What the system still had to say about the folder's creation.
    std::thread::sleep(Duration::from_millis(700));
    app.listen_any("folder-changed", move |_| {
        seen.fetch_add(1, Ordering::SeqCst);
    });
    let missed = AtomicBool::new(false);
    let service = &app.state::<App>().service;
    service.changed_outside(info["key"].as_str().unwrap(), &missed);
    assert_eq!(told.load(Ordering::SeqCst), 1);
    assert!(!missed.load(Ordering::SeqCst));
    // A batch for a folder that is not the open one tells nobody, and
    // says it missed.
    service.changed_outside("outra-0123456789abcdef", &missed);
    assert_eq!(told.load(Ordering::SeqCst), 1);
    assert!(missed.load(Ordering::SeqCst));
}

/// The app's own pages, at the origin each platform's web view serves them
/// from: WebView2 serves a custom scheme as `http://tauri.localhost`, which
/// is what the capability's "local" means there (ADR 0069).
const APP_ORIGIN: &str = if cfg!(windows) {
    "http://tauri.localhost"
} else {
    "tauri://localhost"
};

pub(super) fn call(
    webview: &tauri::WebviewWindow<MockRuntime>,
    cmd: &str,
    body: Value,
) -> Result<Value, Value> {
    call_from(webview, APP_ORIGIN, cmd, body)
}

/// A call as a document at `origin` would make it.
fn call_from(
    webview: &tauri::WebviewWindow<MockRuntime>,
    origin: &str,
    cmd: &str,
    body: Value,
) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.to_owned(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: origin.parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_owned(),
        },
    )
    .map(|b| b.deserialize::<Value>().unwrap())
}

/// A note with exactly this name in `dir`, kept until dropped.
pub(super) fn note(dir: &std::path::Path, name: &str, content: &str) -> tempfile::NamedTempFile {
    let mut file = tempfile::Builder::new()
        .prefix(name)
        .rand_bytes(0)
        .tempfile_in(dir)
        .unwrap();
    file.write_all(content.as_bytes()).unwrap();
    file.flush().unwrap();
    file
}

#[test]
fn the_commands_answer_through_the_contract() {
    let vault = tempfile::tempdir().unwrap();
    let _taverna = note(
        vault.path(),
        "Taverna.md",
        "# Taverna\n\nO [[Barão]] bebe aqui.\n",
    );
    let barao_file = note(
        vault.path(),
        "Barão.md",
        "---\ntags: [npc]\nurl: https://example.org\nmeta: {a: 1}\n---\n",
    );
    let (app, webview) = app_with(Some(vault.path().to_path_buf()));

    // Which app this is answers with no folder open, through the
    // capability like every command (ADR 0051).
    let info = call(&webview, "app_info", json!({})).unwrap();
    assert_eq!(info["version"], env!("CARGO_PKG_VERSION"), "{info}");
    assert!(!info["commit"].as_str().unwrap().is_empty(), "{info}");
    // This computer's name, as a conflict's copy carries it (ADR 0079
    // item 8): the editor's "keep both" names its copy with it.
    assert!(!info["device"].as_str().unwrap().is_empty(), "{info}");

    // Nothing open yet: every command says so, in the contract's words.
    let err = call(&webview, "list_notes", json!({})).unwrap_err();
    assert_eq!(err["kind"], "no_folder", "{err}");
    assert!(
        call(&webview, "current_folder", json!({}))
            .unwrap()
            .is_null()
    );

    // The command line's folder opens once; what crosses is a name
    // and a key, never the path (rule 4).
    let info = call(&webview, "open_initial", json!({})).unwrap()["info"].clone();
    assert_eq!(info["index"]["indexed"], 2, "{info}");
    assert_eq!(
        info["name"],
        vault.path().file_name().unwrap().to_str().unwrap()
    );
    let key = info["key"].as_str().unwrap().to_owned();
    assert!(
        !key.contains('/') && !info.to_string().contains(vault.path().to_str().unwrap()),
        "{info}"
    );
    // Its index went to the app's configuration directory — here the
    // test's temporary one, never the user's: the key opens the folder
    // again from there.
    let config = app.state::<App>().service.config().unwrap().to_path_buf();
    let reopened = Workspace::reopen(&key, Some(&config));
    assert!(reopened.is_ok(), "{:?}", reopened.err());
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
    assert_eq!(
        call(&webview, "current_folder", json!({})).unwrap()["key"],
        key
    );

    let notes = call(&webview, "list_notes", json!({})).unwrap();
    assert!(
        notes.as_array().unwrap().iter().any(|n| n == "Taverna.md"),
        "{notes}"
    );

    let read = call(&webview, "read_note", json!({ "path": "Taverna" })).unwrap();
    assert_eq!(read["path"], "Taverna.md");
    assert!(
        read["html"].as_str().unwrap().contains("wikilink"),
        "{read}"
    );
    let revision = read["revision"].as_str().unwrap().to_owned();
    let links = call(&webview, "links", json!({ "path": "Taverna" })).unwrap();
    assert_eq!(links[0]["resolved"], "Barão.md", "{links}");
    // Every `^id` block of the folder: the command is allowed to the window
    // (build.rs and the capability) and answers in the contract's shape.
    let ids = call(
        &webview,
        "list_block_ids",
        json!({ "kinds": ["table", "list"] }),
    )
    .unwrap();
    assert_eq!(ids["truncated"], false, "{ids}");
    assert!(ids["blocks"].is_array(), "{ids}");
    let graph = call(&webview, "graph", json!({})).unwrap();
    assert_eq!(graph[0]["to"], "Barão.md", "{graph}");

    // A write over the revision that was read; the same revision again is refused (invariant 11).
    let written = call(
        &webview,
        "write_note",
        json!({ "path": "Taverna", "text": "# Taverna\n\nNovo.\n", "revision": revision }),
    )
    .unwrap();
    assert_eq!(written["note"]["text"], "# Taverna\n\nNovo.\n");
    let stale = call(
        &webview,
        "write_note",
        json!({ "path": "Taverna", "text": "x", "revision": revision }),
    )
    .unwrap_err();
    assert_eq!(stale["kind"], "changed", "{stale}");

    // Identity is a path under the folder; anything else never crosses (rule 4).
    let out = call(&webview, "read_note", json!({ "path": "../fora" })).unwrap_err();
    assert_eq!(out["kind"], "refused", "{out}");

    // The properties and the web notes come typed; the link is gone
    // with the text that held it.
    let barao = call(&webview, "read_note", json!({ "path": "Barão" })).unwrap();
    assert_eq!(barao["properties"][0]["value"]["kind"], "list", "{barao}");
    assert_eq!(barao["properties"][2]["value"]["kind"], "nested", "{barao}");
    let web = call(&webview, "list_web_notes", json!({})).unwrap();
    assert_eq!(web[0]["url"], "https://example.org", "{web}");
    let graph = call(&webview, "graph", json!({})).unwrap();
    assert_eq!(graph.as_array().unwrap().len(), 0, "{graph}");

    // Deleted outside the app while a tab still holds it: the tab's save
    // finds it not found, as a read of it would — the window's state,
    // which it says in words, never a failure of the disk.
    let held = barao["revision"].as_str().unwrap().to_owned();
    drop(barao_file);
    let late = call(
        &webview,
        "write_note",
        json!({ "path": "Barão", "text": "x", "revision": held }),
    )
    .unwrap_err();
    assert_eq!(late["kind"], "not_found", "{late}");

    // A deletion answers where the note went, and any warning.
    let gone = call(&webview, "delete_note", json!({ "path": "Taverna" })).unwrap();
    assert_eq!(gone["path"], ".trash/Taverna.md", "{gone}");
    assert_eq!(gone["warnings"], json!([]), "{gone}");

    // The same folder again, by its key; a key that is not one is
    // refused before anything is looked up, an unknown one not found.
    let again = call(&webview, "reopen_folder", json!({ "key": key })).unwrap();
    assert_eq!(again["key"], key, "{again}");
    let bad = call(&webview, "reopen_folder", json!({ "key": "../x" })).unwrap_err();
    assert_eq!(bad["kind"], "refused", "{bad}");
    let none = call(
        &webview,
        "reopen_folder",
        json!({ "key": "nada-0123456789abcdef" }),
    )
    .unwrap_err();
    assert_eq!(none["kind"], "not_found", "{none}");
}

/// Only the app's own views reach the commands: not a web page loaded
/// from the internet, not a view labelled as a web page even when its
/// document is local (review `docs/review/phase-2.md`, B3).
#[test]
fn only_the_apps_own_views_reach_the_commands() {
    let (app, main) = app();
    assert!(call(&main, "current_folder", json!({})).is_ok());
    let remote = call_from(&main, "https://example.org", "current_folder", json!({}));
    assert!(remote.is_err(), "{remote:?}");
    let page = tauri::WebviewWindowBuilder::new(&app, "web-7", Default::default())
        .build()
        .unwrap();
    let local_in_page = call(&page, "current_folder", json!({}));
    assert!(local_in_page.is_err(), "{local_in_page:?}");
    let popout = tauri::WebviewWindowBuilder::new(&app, "note-3", Default::default())
        .build()
        .unwrap();
    assert!(call(&popout, "current_folder", json!({})).is_ok());
}

/// A note window never switches folders, and a window of a folder does
/// not while a note of it is popped out and no other window shows the
/// folder: the note window names its note by a path of that folder
/// (ADR 0065).
#[test]
fn switching_folders_is_refused_from_a_note_window_and_while_its_folder_has_one() {
    let vault = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "Uma.md", "# Uma\n");
    let (app, main) = app_with(Some(vault.path().to_path_buf()));
    let popout = tauri::WebviewWindowBuilder::new(&app, "note-0", Default::default())
        .build()
        .unwrap();
    // A note window never opens a folder.
    for cmd in ["open_initial", "pick_folder"] {
        let from_popout = call(&popout, cmd, json!({})).unwrap_err();
        assert_eq!(from_popout["kind"], "refused", "{cmd}: {from_popout}");
    }
    let from_popout = call(
        &popout,
        "reopen_folder",
        json!({ "key": "x-0123456789abcdef" }),
    )
    .unwrap_err();
    assert_eq!(from_popout["kind"], "refused", "{from_popout}");
    // The main window opens its folder; a note of it in a window of its
    // own (as `open_window` binds one) keeps the main window on it.
    let key = call(&main, "open_initial", json!({})).unwrap()["info"]["key"]
        .as_str()
        .unwrap()
        .to_owned();
    app.state::<App>().service.bind("note-0", &key);
    let while_open = may_switch(app.handle(), &main.as_ref().window()).unwrap_err();
    assert_eq!(while_open.kind, ErrorKind::Refused);
    assert!(
        while_open.message.contains("note windows"),
        "{}",
        while_open.message
    );
    // Another window on that folder keeps it for the note: the main
    // window may switch (ADR 0065).
    let other = tauri::WebviewWindowBuilder::new(&app, "window-7", Default::default())
        .build()
        .unwrap();
    app.state::<App>().service.bind("window-7", &key);
    assert!(may_switch(app.handle(), &main.as_ref().window()).is_ok());
    assert!(call(&other, "current_folder", json!({})).unwrap()["key"].is_string());
}

/// Each window shows a folder of its own (ADR 0065): two windows on two
/// folders answer from their own; a window with none has none; a folder
/// no window shows any more is closed.
#[test]
fn each_window_answers_from_its_own_folder() {
    let one = tempfile::tempdir().unwrap();
    let two = tempfile::tempdir().unwrap();
    let _a = note(one.path(), "Uma.md", "# Uma\n");
    let _b = note(two.path(), "Duas.md", "# Duas\n");
    let (app, main) = app_with(Some(one.path().to_path_buf()));
    call(&main, "open_initial", json!({})).unwrap();
    let other = tauri::WebviewWindowBuilder::new(&app, "window-3", Default::default())
        .build()
        .unwrap();
    assert_eq!(
        call(&other, "current_folder", json!({})).unwrap(),
        json!(null)
    );
    assert_eq!(
        call(&other, "list_notes", json!({})).unwrap_err()["kind"],
        "no_folder"
    );
    lock(&app.state::<App>().initial_folder).push_back(two.path().to_path_buf());
    call(&other, "open_initial", json!({})).unwrap();
    assert_eq!(
        call(&main, "list_notes", json!({})).unwrap(),
        json!(["Uma.md"])
    );
    assert_eq!(
        call(&other, "list_notes", json!({})).unwrap(),
        json!(["Duas.md"])
    );
    let service = &app.state::<App>().service;
    assert_eq!(service.open_folders(), 2);
    // The other window goes: its folder closes; the main window's stays.
    service.release("window-3");
    assert_eq!(service.open_folders(), 1);
    assert_eq!(
        call(&main, "list_notes", json!({})).unwrap(),
        json!(["Uma.md"])
    );
}

/// A folder's index progress is heard by the windows of that folder
/// only: a window on another folder showed it as its own (2026-10-06).
#[test]
fn a_folders_index_progress_reaches_only_its_windows() {
    use tauri::Listener;
    let one = tempfile::tempdir().unwrap();
    let two = tempfile::tempdir().unwrap();
    let _a = note(one.path(), "Uma.md", "# Uma\n");
    let _b = note(two.path(), "Duas.md", "# Duas\n");
    let (app, main) = app_with(Some(one.path().to_path_buf()));
    call(&main, "open_initial", json!({})).unwrap();
    let other = tauri::WebviewWindowBuilder::new(&app, "window-3", Default::default())
        .build()
        .unwrap();
    lock(&app.state::<App>().initial_folder).push_back(two.path().to_path_buf());
    call(&other, "open_initial", json!({})).unwrap();
    let mine = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let theirs = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let (m, t) = (Arc::clone(&mine), Arc::clone(&theirs));
    main.listen("index-progress", move |_| {
        m.fetch_add(1, Ordering::SeqCst);
    });
    // The other window may still hear its own folder being indexed (seen on
    // Windows, where that pass is slower): what must never reach it is a
    // progress of the main window's folder, which names `Uma.md`.
    other.listen("index-progress", move |e| {
        if e.payload().contains("Uma.md") {
            t.fetch_add(1, Ordering::SeqCst);
        }
    });
    call(&main, "reindex", json!({})).unwrap();
    assert!(mine.load(Ordering::SeqCst) > 0);
    assert_eq!(theirs.load(Ordering::SeqCst), 0);
}

/// A web page's view answers only the window that opened it: another
/// window cannot move, steer, read or close it, and an app view's own
/// label is not a web view at all.
#[test]
fn a_web_view_answers_only_the_window_that_opened_it() {
    let (app, main) = app();
    let popout = tauri::WebviewWindowBuilder::new(&app, "note-0", Default::default())
        .build()
        .unwrap();
    lock(&app.state::<App>().web_views).insert("web-9".to_owned(), "main".to_owned());
    for cmd in ["web_close", "web_url"] {
        let e = call(&popout, cmd, json!({ "label": "web-9" })).unwrap_err();
        assert_eq!(e["kind"], "refused", "{cmd}: {e}");
    }
    let e = call(&main, "web_url", json!({ "label": "main" })).unwrap_err();
    assert_eq!(e["kind"], "refused", "{e}");
}

/// A window's page loading again (⌘R) takes the web pages it opened with
/// it: their views close and are forgotten, another window's stay (the
/// maintainer, 2026-10-16: a reload left them drawn over everything).
#[test]
fn a_reloaded_window_closes_the_web_pages_it_opened() {
    let (app, main) = app();
    let popout = tauri::WebviewWindowBuilder::new(&app, "note-0", Default::default())
        .build()
        .unwrap();
    let child = |window: &tauri::Window<tauri::test::MockRuntime>, label: &str| {
        window
            .add_child(
                tauri::webview::WebviewBuilder::new(
                    label,
                    tauri::WebviewUrl::External("https://example.com".parse().unwrap()),
                ),
                tauri::LogicalPosition::new(0.0, 0.0),
                tauri::LogicalSize::new(10.0, 10.0),
            )
            .unwrap();
    };
    let (main_window, popout_window) = (main.as_ref().window(), popout.as_ref().window());
    child(&main_window, "web-1");
    child(&popout_window, "web-2");
    let state = app.state::<App>();
    lock(&state.web_views).insert("web-1".to_owned(), "main".to_owned());
    lock(&state.web_views).insert("web-2".to_owned(), "note-0".to_owned());
    crate::web::close_web_views_of(app.handle(), "main");
    let views = lock(&state.web_views).clone();
    assert!(!views.contains_key("web-1"), "{views:?}");
    assert_eq!(
        views.get("web-2").map(String::as_str),
        Some("note-0"),
        "{views:?}"
    );
}

/// A web page's place is its slot — the page's whole box, which may
/// reach outside the window — and the part of it that shows (ADR 0056,
/// revised 2026-10-15): the host lays the page out at the slot and draws
/// only the visible part. The old place, one rectangle and a scroll, is
/// not one any more, and what is not a place on a screen is refused.
#[test]
fn a_web_page_is_placed_by_its_slot_and_the_part_that_shows() {
    let (app, main) = app();
    main.as_ref()
        .window()
        .add_child(
            tauri::webview::WebviewBuilder::new(
                "web-4",
                tauri::WebviewUrl::External("https://example.com".parse().unwrap()),
            ),
            tauri::LogicalPosition::new(0.0, 0.0),
            tauri::LogicalSize::new(10.0, 10.0),
        )
        .unwrap();
    lock(&app.state::<App>().web_views).insert("web-4".to_owned(), "main".to_owned());
    let rect = |x: f64, y: f64, w: f64, h: f64| json!({ "x": x, "y": y, "w": w, "h": h });
    let bounds = |place: Value| {
        call(
            &main,
            "web_bounds",
            json!({ "label": "web-4", "place": place }),
        )
    };
    // Half above its pane: 300 tall, the top 100 out of sight.
    let half = json!({ "slot": rect(100.0, -60.0, 800.0, 300.0), "visible": rect(100.0, 40.0, 800.0, 200.0) });
    assert!(bounds(half).is_ok());
    assert!(
        call(
            &main,
            "web_visible",
            json!({ "label": "web-4", "visible": true })
        )
        .is_ok()
    );

    let old = json!({ "x": 0.0, "y": 0.0, "w": 10.0, "h": 10.0, "scrollX": 0.0, "scrollY": 0.0 });
    assert!(
        bounds(old).is_err(),
        "a rectangle and a scroll is no longer a place"
    );
    let negative =
        json!({ "slot": rect(0.0, 0.0, -1.0, 10.0), "visible": rect(0.0, 0.0, 1.0, 1.0) });
    let far = json!({ "slot": rect(0.0, 0.0, 10.0, 10.0), "visible": rect(0.0, 2e6, 1.0, 1.0) });
    for bad in [negative.clone(), far] {
        let e = bounds(bad.clone()).unwrap_err();
        assert_eq!(e["kind"], "refused", "{bad}: {e}");
    }
    // Refused before any view is made, too.
    let e = call(
        &main,
        "web_open",
        json!({ "url": "https://example.com", "place": negative }),
    )
    .unwrap_err();
    assert_eq!(e["kind"], "refused", "{e}");

    assert!(call(&main, "web_close", json!({ "label": "web-4" })).is_ok());
}

/// A window that shows a site inside it (a web note, an embed) holds
/// child web views, and Tauri stops counting it as a `WebviewWindow`:
/// the console still opens there, a quit still asks it to save, and a
/// folder switch still sees it (the console failed with "current
/// webview is not a WebviewWindow", 2026-10-01).
#[test]
fn a_window_showing_a_site_inside_it_is_still_one_of_the_apps_windows() {
    use tauri::Listener;
    let (app, main) = app();
    main.as_ref()
        .window()
        .add_child(
            tauri::webview::WebviewBuilder::new(
                "web-1",
                tauri::WebviewUrl::External("https://example.com".parse().unwrap()),
            ),
            tauri::LogicalPosition::new(0.0, 0.0),
            tauri::LogicalSize::new(10.0, 10.0),
        )
        .unwrap();
    assert!(
        app.get_webview_window("main").is_none(),
        "Tauri's rule changed"
    );
    assert!(call(&main, "open_devtools", json!({})).is_ok());

    let told = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = told.clone();
    app.listen_any("quit-requested", move |_| {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    ask_windows_to_quit(app.handle());
    assert_eq!(told.load(std::sync::atomic::Ordering::SeqCst), 1);

    let other = tauri::WebviewWindowBuilder::new(&app, "window-1", Default::default())
        .build()
        .unwrap();
    // Another window may open a folder of its own (ADR 0065).
    assert!(may_switch(app.handle(), &other.as_ref().window()).is_ok());
}

/// A panic inside a core call is answered as `failed` and leaves the
/// session usable; so does a lock poisoned by a panic elsewhere.
#[test]
fn a_panic_in_the_core_does_not_take_the_session_down() {
    let vault = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "Uma.md", "# Uma\n");
    let (app, main) = app_with(Some(vault.path().to_path_buf()));
    call(&main, "open_initial", json!({})).unwrap();
    let state = app.state::<App>();
    let window = main.as_ref().window();
    let boom = with(&state, &window, |_| -> Result<(), OpError> {
        panic!("boom in the core")
    });
    let err = boom.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Failed);
    assert!(err.message.contains("boom in the core"), "{}", err.message);
    assert!(call(&main, "list_notes", json!({})).is_ok());
    let notes = call(&main, "list_notes", json!({})).unwrap();
    assert_eq!(notes, json!(["Uma.md"]));
}

/// The app's own views stay on the app's pages; a web view keeps to
/// the web; nothing else goes anywhere. The mock runtime does not run
/// navigation handlers, so the rule is tested as the plugin calls it.
#[test]
fn navigation_stays_within_each_views_own_world() {
    let url = |s: &str| tauri::Url::parse(s).unwrap();
    let dev = url("http://localhost:5173/");
    for label in ["main", "note-3"] {
        assert!(may_navigate(
            label,
            &url("tauri://localhost/index.html"),
            None
        ));
        assert!(may_navigate(
            label,
            &url("http://tauri.localhost/index.html"),
            None
        ));
        assert!(may_navigate(label, &url("https://tauri.localhost/"), None));
        assert!(may_navigate(label, &url("about:blank"), None));
        assert!(!may_navigate(label, &url("https://example.org/"), None));
        // The HTML-file viewer's frame: the handler cannot tell it
        // from the window, and the protocol runs no script.
        assert!(may_navigate(
            label,
            &url("verso://localhost/pagina.html"),
            None
        ));
        assert!(may_navigate(
            label,
            &url("http://verso.localhost/pagina.html"),
            None
        ));
        assert!(!may_navigate(label, &url("verso://evil/x.html"), None));
        assert!(!may_navigate(label, &url("file:///etc/passwd"), None));
        assert!(!may_navigate(label, &url("tauri://evil/"), None));
        assert!(!may_navigate(label, &url("http://localhost:5173/"), None));
        assert_eq!(
            may_navigate(label, &url("http://localhost:5173/x"), Some(&dev)),
            cfg!(debug_assertions)
        );
    }
    assert!(may_navigate("web-1", &url("https://example.org/"), None));
    assert!(may_navigate("web-1", &url("http://example.org/"), None));
    assert!(!may_navigate(
        "web-1",
        &url("tauri://localhost/index.html"),
        None
    ));
    assert!(!may_navigate(
        "web-1",
        &url("verso://localhost/mapa.svg"),
        None
    ));
    assert!(!may_navigate("other", &url("https://example.org/"), None));
    assert!(!may_navigate("other", &url("tauri://localhost/"), None));
}

fn header<'a>(served: &'a verso_service::files::Served, name: &str) -> Option<&'a str> {
    served
        .headers
        .iter()
        .find(|(n, _)| n.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

/// `verso://` answers the app's views only, never with a note, always
/// with a sandboxing policy, and lets only the app's origin read it
/// from script (review `docs/review/phase-2.md`, B1, B2, B4).
#[test]
fn the_file_protocol_serves_the_app_only_and_never_active_content() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _img = note(
        vault.path(),
        "mapa.svg",
        "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
    );
    let _note = note(vault.path(), "Segredo.md", "# Segredo\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let ok = serve(Some(&mut ws), "main", "mapa.svg", Some("tauri://localhost"));
    assert_eq!(ok.status, 200);
    assert!(header(&ok, "Content-Security-Policy").is_some_and(|v| v.starts_with("sandbox;")));

    // An HTML file is a page for its viewer, sandboxed as every file.
    let _page = note(vault.path(), "pagina.html", "<h1>ola</h1>");
    let page = serve(Some(&mut ws), "main", "pagina.html", None);
    assert_eq!(page.status, 200);
    assert_eq!(
        header(&page, "Content-Type"),
        Some("text/html; charset=utf-8")
    );
    assert!(header(&page, "Content-Security-Policy").is_some_and(|v| v.starts_with("sandbox;")));
    assert_eq!(
        header(&ok, "Access-Control-Allow-Origin"),
        Some("tauri://localhost")
    );
    assert_eq!(header(&ok, "X-Content-Type-Options"), Some("nosniff"));

    let foreign = serve(
        Some(&mut ws),
        "main",
        "mapa.svg",
        Some("https://evil.example"),
    );
    assert_eq!(foreign.status, 200);
    assert_eq!(header(&foreign, "Access-Control-Allow-Origin"), None);

    let page = serve(
        Some(&mut ws),
        "web-2",
        "mapa.svg",
        Some("tauri://localhost"),
    );
    assert_eq!(page.status, 403);
    assert!(page.body.len() < 64, "a refusal carries no file");

    let a_note = serve(Some(&mut ws), "note-1", "Segredo.md", None);
    assert_eq!(a_note.status, 403);
    let a_note_upper = serve(Some(&mut ws), "main", "Segredo.MD", None);
    assert_eq!(a_note_upper.status, 403);
    // Spellings that confinement folds into the note's own path.
    for spelled in ["Segredo.md/", "Segredo.md/.", "./Segredo.md/"] {
        let served = serve(Some(&mut ws), "main", spelled, None);
        assert_eq!(served.status, 403, "{spelled}");
    }

    let outside = serve(Some(&mut ws), "main", "../fora.png", None);
    assert_eq!(outside.status, 404);
    let nothing_open = serve(None, "main", "mapa.svg", None);
    assert_eq!(nothing_open.status, 404);
}

#[test]
fn version_comparison_works_for_releases_and_betas() {
    let v020b2 = ParsedVersion::parse("0.2.0-beta.2").unwrap();
    let v020b1 = ParsedVersion::parse("v0.2.0-beta.1").unwrap();
    let v020b3 = ParsedVersion::parse("0.2.0-beta.3").unwrap();
    let v020 = ParsedVersion::parse("v0.2.0").unwrap();
    let v021 = ParsedVersion::parse("0.2.1").unwrap();
    let v030 = ParsedVersion::parse("v0.3.0").unwrap();
    let v100 = ParsedVersion::parse("1.0.0").unwrap();
    let v1 = ParsedVersion::parse("v1").unwrap();
    let v12 = ParsedVersion::parse("v1.2").unwrap();

    assert_eq!(v1.major, 1);
    assert_eq!(v1.minor, 0);
    assert_eq!(v1.patch, 0);
    assert_eq!(v12.major, 1);
    assert_eq!(v12.minor, 2);
    assert_eq!(v12.patch, 0);

    assert!(!v020b2.is_newer_than(&v020b2));
    assert!(!v020b1.is_newer_than(&v020b2));
    assert!(v020b2.is_newer_than(&v020b1));
    assert!(v020b3.is_newer_than(&v020b2));
    assert!(v020.is_newer_than(&v020b2)); // stable > beta
    assert!(!v020b2.is_newer_than(&v020)); // beta < stable
    assert!(v021.is_newer_than(&v020));
    assert!(v030.is_newer_than(&v021));
    assert!(v100.is_newer_than(&v030));
}

#[test]
fn trusted_update_urls_allow_this_repo_only() {
    assert!(is_trusted_update_url(
        "https://github.com/SergioSJS/verso/releases/download/v0.2.0/verso.zip"
    ));
    assert!(is_trusted_update_url(
        "https://api.github.com/repos/SergioSJS/verso/releases/assets/12345"
    ));

    // Any other GitHub repository is someone else's code.
    assert!(!is_trusted_update_url(
        "https://github.com/attacker/verso/releases/download/v9.9.9/verso.zip"
    ));
    assert!(!is_trusted_update_url(
        "https://api.github.com/repos/attacker/verso/releases/assets/12345"
    ));
    assert!(!is_trusted_update_url(
        "https://objects.githubusercontent.com/github-production-release-asset-2e65be/12345"
    ));
    assert!(!is_trusted_update_url(
        "https://gist.github.com/x/raw/a.zip"
    ));
    assert!(!is_trusted_update_url("http://github.com/fake.zip")); // HTTP disallowed
    assert!(!is_trusted_update_url("https://malicious.com/virus.zip"));
    assert!(!is_trusted_update_url(
        "https://github.com.evil.com/fake.zip"
    ));
    assert!(!is_trusted_update_url("file:///tmp/update.zip"));
}

#[test]
fn app_views_never_navigate_to_the_web_even_approved() {
    // An embed renders in a child web view (`web_open`); the app
    // view itself has no business on the web, approved origin or
    // not (ADR 0056, revised 2026-09-29 — the child view is the
    // page's place, as it always was for web notes).
    let url = |s: &str| tauri::Url::parse(s).unwrap();
    for label in ["main", "note-3"] {
        assert!(!may_navigate(label, &url("https://rolai.app/x"), None));
        assert!(!may_navigate(
            label,
            &url("http://192.168.3.100:8083/category/x"),
            None
        ));
    }
    // The child web view is where a page loads, any http(s) page.
    assert!(may_navigate("web-1", &url("https://rolai.app/x"), None));
}

/// The frameability check answers the app's own views only, from the
/// session's record once it has one, and refuses what is not a web page.
/// A page loaded from the internet — an embedded one included — gets no
/// answer to this or any other command: Tauri's ACL gives a remote
/// origin nothing (the capability has no `remote` urls), and a frame of
/// the window is a remote origin to it (ADR 0056, revised 2026-10-15).
#[test]
fn the_frame_check_answers_the_apps_views_and_refuses_a_remote_origin() {
    let (app, main) = app();
    {
        let state = app.state::<App>();
        let mut seen = lock(&state.frame_verdicts);
        seen.insert("https://open.example".to_owned(), true);
        seen.insert("https://shut.example".to_owned(), false);
    }
    let ask = |url: &str| call(&main, "embed_frameable", json!({ "url": url }));
    assert_eq!(ask("https://open.example/a/page").unwrap(), json!(true));
    assert_eq!(ask("https://shut.example/").unwrap(), json!(false));
    for bad in [
        "file:///etc/passwd",
        "verso://localhost/x",
        "javascript:1",
        "nonsense",
    ] {
        assert!(ask(bad).is_err(), "{bad}");
    }
    // A frame of the window, or any page of the web, is a remote origin.
    for origin in ["https://open.example", "https://evil.example/frame.html"] {
        let e = call_from(
            &main,
            origin,
            "embed_frameable",
            json!({ "url": "https://open.example/" }),
        );
        assert!(e.is_err(), "{origin}: {e:?}");
        let e = call_from(
            &main,
            origin,
            "web_open",
            json!({ "url": "https://x.test" }),
        );
        assert!(e.is_err(), "{origin}: {e:?}");
    }
    // A web view is no app view.
    let page = tauri::WebviewWindowBuilder::new(&app, "web-8", Default::default())
        .build()
        .unwrap();
    assert!(
        call(
            &page,
            "embed_frameable",
            json!({ "url": "https://open.example/" })
        )
        .is_err()
    );
}

/// An app view's frame loads the origins the frame check judged
/// frameable, exactly, and no other page of the web; a web view keeps to
/// the web as before.
#[test]
fn an_app_view_frames_only_the_origins_judged_frameable() {
    let url = |s: &str| tauri::Url::parse(s).unwrap();
    let mut framed = std::collections::HashSet::new();
    framed.insert("https://open.example".to_owned());
    framed.insert("http://192.168.3.100:8083".to_owned());
    for label in ["main", "window-2", "note-3"] {
        let may = |s: &str| may_navigate_framed(label, &url(s), None, &framed);
        assert!(may("https://open.example/a?b=1"));
        assert!(may("http://192.168.3.100:8083/x"));
        // Another site, scheme, port or subdomain is refused.
        assert!(!may("https://shut.example/"));
        assert!(!may("http://open.example/"));
        assert!(!may("https://open.example:8443/"));
        assert!(!may("https://www.open.example/"));
        assert!(!may("http://192.168.3.100:9000/"));
        // The app's own pages still load; nothing but the web is added.
        assert!(may("tauri://localhost/index.html"));
        assert!(!may("file:///etc/passwd"));
        assert!(!may("verso://evil/x"));
        // With nothing judged, the guard is the closed one.
        assert!(!may_navigate_framed(
            label,
            &url("https://open.example/"),
            None,
            &Default::default()
        ));
    }
    assert!(!may_navigate_framed(
        "other",
        &url("https://open.example/"),
        None,
        &framed
    ));
}

/// Several entries moved through the contract (ADR 0048, revised
/// 2026-10-07): those that move come back with where they went, one the
/// disk refuses with the contract's error kind, and the plan once.
#[test]
fn several_entries_move_through_the_contract_with_one_plan() {
    let vault = tempfile::tempdir().unwrap();
    let dir = |name: &str| {
        tempfile::Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempdir_in(vault.path())
            .unwrap()
    };
    let (_velha, _nova) = (dir("Velha"), dir("Nova"));
    let _pa = note(&vault.path().join("Velha"), "Pa.md", "a\n");
    let _pb = note(&vault.path().join("Velha"), "Pb.md", "b\n");
    let _taken = note(&vault.path().join("Nova"), "Pb.md", "outra\n");
    let _ref = note(vault.path(), "Ref.md", "[[Velha/Pa]] e [[Velha/Pb]]\n");
    let (_app, webview) = app_with(Some(vault.path().to_path_buf()));
    call(&webview, "open_initial", json!({})).unwrap();

    let done = call(
        &webview,
        "move_entries",
        json!({ "paths": ["Velha/Pa.md", "Velha/Pb.md"], "folder": "Nova" }),
    )
    .unwrap();
    assert_eq!(
        done["moved"],
        json!([{ "from": "Velha/Pa.md", "to": "Nova/Pa.md" }]),
        "{done}"
    );
    assert_eq!(done["refused"][0]["path"], "Velha/Pb.md", "{done}");
    assert_eq!(done["refused"][0]["error"]["kind"], "exists", "{done}");
    assert_eq!(done["rewrites"].as_array().unwrap().len(), 1, "{done}");
    assert_eq!(done["rewrites"][0]["path"], "Ref.md");
    assert_eq!(done["rewrites"][0]["after"], "[[Nova/Pa]] e [[Velha/Pb]]\n");

    // A path that cannot name an entry is refused before anything moves.
    let err = call(
        &webview,
        "move_entries",
        json!({ "paths": ["../fora.md"], "folder": "Nova" }),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "refused", "{err}");
}

/// The window controls of a window without the system's title bar (ADR
/// 0072, app/ui/src/frame.ts) are allowed: without them the app's own
/// buttons and its drag regions do nothing in the app, while the harness
/// passes.
#[test]
fn the_window_controls_are_allowed() {
    let capability = include_str!("../capabilities/default.json");
    let frame = include_str!("../../ui/src/frame.ts");
    for (call, permission) in [
        ("minimize()", "core:window:allow-minimize"),
        ("toggleMaximize()", "core:window:allow-toggle-maximize"),
        ("close()", "core:window:allow-close"),
        ("data-tauri-drag-region", "core:window:allow-start-dragging"),
    ] {
        assert!(frame.contains(call), "frame.ts no longer uses {call}");
        assert!(
            capability.contains(&format!("\"{permission}\"")),
            "{permission} missing"
        );
    }
}

/// The window's zoom (ADR 0072, revised 2026-10-20) is allowed: without
/// the webview's permission the keys do nothing in the app, while the
/// harness, which keeps the call, passes.
#[test]
fn the_window_zoom_is_allowed() {
    let capability = include_str!("../capabilities/default.json");
    let zoom = include_str!("../../ui/src/zoom.ts");
    assert!(zoom.contains("setZoom("), "zoom.ts no longer sets the zoom");
    assert!(capability.contains("\"core:webview:allow-set-webview-zoom\""));
}

/// The system's notifications (ADR 0084 item 9) are the window's to ask
/// and to send: without the plugin's permissions in the capability the
/// app answers "not allowed" while the browser harness, which has its
/// own, passes. Asked here through the app's own capability; a
/// notification is not sent, which would show one on this computer.
#[test]
fn the_system_notifications_are_allowed() {
    let (_app, webview) = app();
    let granted = call(
        &webview,
        "plugin:notification|is_permission_granted",
        json!({}),
    );
    assert_eq!(granted, Ok(json!(true)));
    let asked = call(
        &webview,
        "plugin:notification|request_permission",
        json!({}),
    );
    assert_eq!(asked, Ok(json!("granted")));
    let capability = include_str!("../capabilities/default.json");
    assert!(capability.contains("\"notification:allow-notify\""));
    // The app's own builder has the plugin, as this test's has.
    assert!(include_str!("lib.rs").contains(".plugin(tauri_plugin_notification::init())"));
}

/// Every command the bindings call is allowed by the window's capability
/// and listed in build.rs: a command missing there answers "not allowed"
/// in the app, while the browser harness, which has no capabilities,
/// passes (`move_entries` did, on 2026-10-07).
#[test]
fn every_command_of_the_bindings_is_allowed() {
    let bindings = include_str!("../../ui/src/bindings.ts");
    let capability = include_str!("../capabilities/default.json");
    let build = include_str!("../build.rs");
    let mut missing = Vec::new();
    for part in bindings.split("TAURI_INVOKE(\"").skip(1) {
        let Some(name) = part.split('"').next() else {
            continue;
        };
        let allow = format!("\"allow-{}\"", name.replace('_', "-"));
        if !capability.contains(&allow) {
            missing.push(format!("{name}: not in capabilities/default.json"));
        }
        if !build.contains(&format!("\"{name}\"")) {
            missing.push(format!("{name}: not in build.rs"));
        }
    }
    assert!(missing.is_empty(), "{missing:#?}");
}

/// A server whose contract is not this app's (the live campaign,
/// 2026-10-11, read "the server runs Verso 0.7.0-beta.1, another version
/// than this app's 0.7.0-beta.1"): with one version on both sides, the
/// refusal names the build and the contract of each, and the window gets
/// them to say in its language; still the `version` problem.
#[test]
fn a_contract_of_another_build_names_both_builds() {
    let ours = json!({ "version": env!("CARGO_PKG_VERSION"), "commit": "d416898", "contract": remote::contract_version() });
    assert_eq!(remote::mismatch(&ours), None);
    let other = json!({ "version": env!("CARGO_PKG_VERSION"), "commit": "d416898", "contract": "0123456789abcdef" });
    let v = remote::mismatch(&other).unwrap();
    assert_eq!(
        (v.server_build.as_str(), v.server_contract.as_str()),
        ("d416898", "0123456789abcdef")
    );
    assert_eq!(v.app_build, env!("VERSO_COMMIT"));
    let said = remote::mismatch_refused(&v).message;
    assert_eq!(
        said,
        format!(
            "the server runs Verso {0} (build d416898, contract 0123456789abcdef), this app {0} (build {1}, contract {2}): their contracts differ — update the one that is behind",
            env!("CARGO_PKG_VERSION"),
            env!("VERSO_COMMIT"),
            remote::contract_version()
        )
    );
    // Another version: the two versions say it.
    let older =
        remote::mismatch(&json!({ "version": "0.6.0", "contract": "0123456789abcdef" })).unwrap();
    assert_eq!(
        remote::mismatch_refused(&older).message,
        format!(
            "the server runs Verso 0.6.0, this app {}: update the one that is behind",
            env!("CARGO_PKG_VERSION")
        )
    );
}

/// A server's `prove_first` (ADR 0083 item 6) reaches the window as a kind
/// of its own, for it to ask the person and send the command once more;
/// every other refusal is said as before.
#[test]
fn a_servers_prove_first_is_its_own_kind() {
    let prove = remote::error_of(
        403,
        &json!({ "error": "prove_first", "message": "prove it is you first" }),
    );
    assert_eq!(
        prove.kind,
        verso_contract::ErrorKind::ProveFirst,
        "a fresh proof wanted is told apart from a refusal"
    );
    let other = remote::error_of(
        403,
        &json!({ "error": "forbidden", "message": "owners only" }),
    );
    assert_eq!(other.kind, verso_contract::ErrorKind::Refused);
    assert_eq!(other.message, "owners only");
    let wrong = remote::error_of(
        403,
        &json!({ "error": "signin_failed", "message": "wrong" }),
    );
    assert_eq!(wrong.kind, verso_contract::ErrorKind::Refused);
    assert_eq!(
        remote::error_of(410, &json!({})).kind,
        verso_contract::ErrorKind::NotFound
    );
}

/// The window opens the server's page only after it copied the code, and
/// only the page a sign-in was handed (decided 2026-10-14, ADR 0083 As
/// built): with none waiting, the command opens nothing.
#[test]
fn the_sign_in_page_opens_nothing_a_server_did_not_name() {
    let none = remote::server_sign_in_page().unwrap_err();
    assert_eq!(none.kind, verso_contract::ErrorKind::Refused, "{none:?}");
}

/// A file's history through the contract (ADR 0091 item 8): a folder of
/// this computer keeps its versions under the configuration directory,
/// named by this computer; a restore is a new write over the revision the
/// window read, refused when the file moved on (invariant 11).
#[test]
fn a_folder_of_this_computer_keeps_and_restores_its_versions() {
    let vault = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "um\n");
    let (app, webview) = app_with(Some(vault.path().to_path_buf()));
    app.state::<App>()
        .service
        .keep_local_history("Mac de Teste", 365);
    call(&webview, "open_initial", json!({})).unwrap();
    let read = call(&webview, "read_note", json!({ "path": "Nota.md" })).unwrap();
    let first = read["revision"].clone();
    call(
        &webview,
        "write_note",
        json!({ "path": "Nota.md", "text": "dois\n", "revision": first }),
    )
    .unwrap();
    let list = call(&webview, "history_list", json!({ "path": "Nota.md" })).unwrap();
    let versions = list["versions"].as_array().unwrap().clone();
    // As found at the reading, then this computer's edit.
    assert_eq!(versions.len(), 2, "{list}");
    assert_eq!(versions[0]["authors"][0]["name"], "Mac de Teste");
    assert_eq!(versions[1]["kind"], "found");
    let found = versions[1]["id"].clone();
    assert!(found.as_str().unwrap().starts_with("c:"));
    let text = call(
        &webview,
        "history_read",
        json!({ "path": "Nota.md", "id": found }),
    )
    .unwrap();
    assert_eq!(text["text"], "um\n");
    let stale = call(
        &webview,
        "history_restore",
        json!({ "path": "Nota.md", "id": found, "revision": first }),
    )
    .unwrap_err();
    assert_eq!(stale["kind"], "changed", "{stale}");
    let now = call(&webview, "read_note", json!({ "path": "Nota.md" })).unwrap();
    let back = call(
        &webview,
        "history_restore",
        json!({ "path": "Nota.md", "id": found, "revision": now["revision"] }),
    )
    .unwrap();
    let after = call(&webview, "read_note", json!({ "path": "Nota.md" })).unwrap();
    assert_eq!(after["text"], "um\n");
    assert_eq!(after["revision"], back["revision"]);
    call(&webview, "set_history_days", json!({ "days": 30 })).unwrap();
    assert!(call(&webview, "set_history_days", json!({ "days": 40_000 })).is_err());
}

/// A sound the window takes into Web Audio (`crossorigin` on the element, so
/// the table's music and the audio players in notes can be routed to the host
/// while a Mac shares, ADR 0116) is read by the window's origin on every
/// system, whichever way the file comes, and by no other.
#[test]
fn an_audio_file_is_readable_from_the_windows_origin_on_every_path() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _song = note(vault.path(), "taverna.mp3", "ID3-not-really-audio");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    for origin in [
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ] {
        let local = serve(Some(&mut ws), "main", "taverna.mp3", Some(origin));
        assert_eq!(local.status, 200);
        assert_eq!(header(&local, "Access-Control-Allow-Origin"), Some(origin));
        assert_eq!(header(&local, "Vary"), Some("Origin"));
        // A server's file, which answers without CORS, gets it from the host.
        let mut remote = verso_service::files::Served {
            status: 206,
            headers: vec![("Content-Range", "bytes 0-3/10".to_owned())],
            body: Vec::new(),
        };
        crate::protocol::allow_app_origin(&mut remote.headers, Some(origin));
        assert_eq!(header(&remote, "Access-Control-Allow-Origin"), Some(origin));
    }
    let mut other = verso_service::files::Served {
        status: 200,
        headers: Vec::new(),
        body: Vec::new(),
    };
    crate::protocol::allow_app_origin(&mut other.headers, Some("https://evil.example"));
    crate::protocol::allow_app_origin(&mut other.headers, None);
    assert!(other.headers.is_empty());
}
