//! The commands as the UI calls them: through Tauri's IPC, on the
//! mock runtime, with the JSON the bindings send. What crosses is
//! the contract; nothing here touches a window.

use std::io::Write;

use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::InvokeRequest;

#[allow(unused_imports)]
use super::*;

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
fn app_with(
    initial: Option<PathBuf>,
) -> (tauri::App<MockRuntime>, tauri::WebviewWindow<MockRuntime>) {
    let config = tempfile::tempdir().unwrap();
    let app = mock_builder()
        .plugin(navigation_guard())
        .manage(App {
            config: Some(config.path().to_path_buf()),
            ..App::new(initial)
        })
        .manage(TestConfig { _dir: config })
        .invoke_handler(commands_for!(MockRuntime).invoke_handler())
        // The app's own context: its capabilities decide what a window may call.
        .build(context())
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (app, webview)
}

fn app() -> (tauri::App<MockRuntime>, tauri::WebviewWindow<MockRuntime>) {
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

    let info = call(&webview, "open_initial", json!({})).unwrap();
    assert_eq!(
        info["name"],
        vault.path().file_name().unwrap().to_str().unwrap()
    );
    assert!(!info.to_string().contains(vault.path().to_str().unwrap()));
    assert!(call(&webview, "open_initial", json!({})).unwrap().is_null());
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
    let info = call(&main, "open_initial", json!({})).unwrap();
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
    let info = call(&main, "open_initial", json!({})).unwrap();
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
    changed_outside(app.handle(), info["key"].as_str().unwrap(), &missed);
    assert_eq!(told.load(Ordering::SeqCst), 1);
    assert!(!missed.load(Ordering::SeqCst));
    // A batch for a folder that is not the open one tells nobody, and
    // says it missed.
    changed_outside(app.handle(), "outra-0123456789abcdef", &missed);
    assert_eq!(told.load(Ordering::SeqCst), 1);
    assert!(missed.load(Ordering::SeqCst));
}

fn call(
    webview: &tauri::WebviewWindow<MockRuntime>,
    cmd: &str,
    body: Value,
) -> Result<Value, Value> {
    call_from(webview, "tauri://localhost", cmd, body)
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
fn note(dir: &std::path::Path, name: &str, content: &str) -> tempfile::NamedTempFile {
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
    let _barao = note(
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
    let info = call(&webview, "open_initial", json!({})).unwrap();
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
    let config = app.state::<App>().config.clone().unwrap();
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
    let key = call(&main, "open_initial", json!({})).unwrap()["key"]
        .as_str()
        .unwrap()
        .to_owned();
    lock(&app.state::<App>().sessions)
        .windows
        .insert("note-0".to_owned(), key.clone());
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
    lock(&app.state::<App>().sessions)
        .windows
        .insert("window-7".to_owned(), key);
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
    *lock(&app.state::<App>().initial_folder) = Some(two.path().to_path_buf());
    call(&other, "open_initial", json!({})).unwrap();
    assert_eq!(
        call(&main, "list_notes", json!({})).unwrap(),
        json!(["Uma.md"])
    );
    assert_eq!(
        call(&other, "list_notes", json!({})).unwrap(),
        json!(["Duas.md"])
    );
    assert_eq!(lock(&app.state::<App>().sessions).by_key.len(), 2);
    // The other window goes: its folder closes; the main window's stays.
    lock(&app.state::<App>().sessions).release("window-3");
    assert_eq!(lock(&app.state::<App>().sessions).by_key.len(), 1);
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
    *lock(&app.state::<App>().initial_folder) = Some(two.path().to_path_buf());
    call(&other, "open_initial", json!({})).unwrap();
    let mine = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let theirs = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let (m, t) = (Arc::clone(&mine), Arc::clone(&theirs));
    main.listen("index-progress", move |_| {
        m.fetch_add(1, Ordering::SeqCst);
    });
    other.listen("index-progress", move |_| {
        t.fetch_add(1, Ordering::SeqCst);
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
    let boom = with(&state, &window, |_| -> Result<(), CoreError> {
        panic!("boom in the core")
    });
    let err = boom.unwrap_err();
    assert_eq!(err.kind, ErrorKind::Failed);
    assert!(err.message.contains("boom in the core"), "{}", err.message);
    assert!(call(&main, "list_notes", json!({})).is_ok());
    // A panic while holding the lock, elsewhere: the lock is poisoned
    // and still answers.
    let app_ref = &state;
    let poisoned = std::thread::scope(|s| {
        s.spawn(|| {
            let _guard = app_ref.sessions.lock().unwrap();
            panic!("poison");
        })
        .join()
    });
    assert!(poisoned.is_err());
    assert!(state.sessions.is_poisoned());
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

fn header<'a>(served: &'a Served, name: &str) -> Option<&'a str> {
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
