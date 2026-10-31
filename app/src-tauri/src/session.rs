// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder windows that come back at the next start (ADR 0065). The
//! set of folders the windows show is kept in the configuration directory
//! (`verso_core::session`) as they open and close, and read once at start,
//! where each folder opens in a window of its own again.
//!
//! A window the person closes leaves the set; the windows that close
//! because the app quits — ⌘Q, the updater's restart — do not, and neither
//! does the last window of all, whose closing is the quit on Windows and
//! Linux (and Tauri's on macOS too). Keys only: a path never leaves this
//! side (ADR 0026 rule 4).

use std::path::Path;
use std::sync::atomic::Ordering;

use tauri::Manager;
use verso_core::session as kept;

use crate::{App, Handed, hand_over, log, protocol::is_app_view, remote};

/// The key a window with a server's folder is kept under.
pub(crate) fn server_key(url: &str, folder: &str) -> String {
    format!("server:{url}#{folder}")
}

/// The address and folder a key names, if it is a server's.
fn parse_server_key(key: &str) -> Option<(String, String)> {
    let rest = key.strip_prefix("server:")?;
    let (url, folder) = rest.split_once('#')?;
    (!url.is_empty() && !folder.is_empty()).then(|| (url.to_owned(), folder.to_owned()))
}

/// The windows' order: the main window first, then the others as opened.
fn order(label: &str) -> (bool, usize, String) {
    let n = label
        .strip_prefix("window-")
        .and_then(|n| n.parse().ok())
        .unwrap_or(0);
    (label != "main", n, label.to_owned())
}

/// The folders the windows show now, except the window `except`'s.
fn shown<R: tauri::Runtime>(app: &tauri::AppHandle<R>, except: Option<&str>) -> Vec<String> {
    let state = app.state::<App>();
    let mut labels: Vec<String> = app
        .windows()
        .into_keys()
        .filter(|l| (l == "main" || l.starts_with("window-")) && Some(l.as_str()) != except)
        .collect();
    labels.sort_by_key(|l| order(l));
    labels
        .iter()
        .filter_map(|label| match remote::of(app, label) {
            Some(r) => Some(server_key(&r.url, &r.folder)),
            None => state
                .service
                .folder_of(label)
                .or_else(|| crate::lock(&state.pending_servers).get(label).cloned()),
        })
        .collect()
}

/// A window shows a folder: the set is what the windows show now, and an
/// app that was quitting is not (a quit the person cancelled).
pub(crate) fn remember<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let state = app.state::<App>();
    state.quitting.store(false, Ordering::SeqCst);
    // A window that shows a folder now no longer waits for its server's.
    for label in app.windows().into_keys() {
        if state.service.folder_of(&label).is_some() || remote::of(app, &label).is_some() {
            crate::lock(&state.pending_servers).remove(&label);
        }
    }
    let config = state.service.config().map(Path::to_path_buf);
    write(config.as_deref(), &shown(app, None));
}

/// The app is quitting: the windows that close from here on stay in the set.
pub(crate) fn quitting<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    app.state::<App>().quitting.store(true, Ordering::SeqCst);
}

/// Why each window is closing, as the side that asked said it, until the
/// window is gone (`close_line`): label → cause.
static CAUSES: std::sync::Mutex<Vec<(String, &'static str)>> = std::sync::Mutex::new(Vec::new());

/// A window is about to close, and why. The first cause said stands: a
/// close request that follows a menu item's is the same close.
pub(crate) fn closing(label: &str, cause: &'static str) {
    if let Ok(mut causes) = CAUSES.lock()
        && !causes.iter().any(|(l, _)| l == label)
    {
        causes.push((label.to_owned(), cause));
    }
}

/// The log line for a window that is gone: its label, whether it showed a
/// folder (never which), and the cause. The app quitting outranks any
/// other; with none said, "destroyed with no request seen".
pub(crate) fn close_line(label: &str, showed_folder: bool, quitting: bool) -> String {
    let said = CAUSES.lock().ok().and_then(|mut causes| {
        causes
            .iter()
            .position(|(l, _)| l == label)
            .map(|i| causes.remove(i).1)
    });
    let cause = if quitting {
        "the app is quitting"
    } else {
        said.unwrap_or("destroyed with no request seen")
    };
    let shown = if showed_folder {
        "showed a folder"
    } else {
        "showed no folder"
    };
    format!("window closed: {label} ({shown}; cause: {cause})")
}

/// A window closed. Called for every window; only a folder window the
/// person closed leaves the set.
pub(crate) fn window_gone<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    if !is_app_view(label) || label.starts_with("note-") {
        return;
    }
    let state = app.state::<App>();
    // The person closed it: its server's folder is not waited for.
    crate::lock(&state.pending_servers).remove(label);
    let config = state.service.config().map(Path::to_path_buf);
    let others = shown(app, Some(label));
    after_close(
        config.as_deref(),
        state.quitting.load(Ordering::SeqCst),
        &others,
    );
}

/// What a closing window does to the set: nothing while the app quits, and
/// nothing when it is the last (the one the next start brings back);
/// otherwise the set becomes the folders the other windows show.
fn after_close(config: Option<&Path>, quitting: bool, others: &[String]) {
    if quitting || others.is_empty() {
        return;
    }
    write(config, others);
}

fn write(config: Option<&Path>, keys: &[String]) {
    if let Err(e) = kept::keep_open_windows(config, keys) {
        log::write(
            "WARN",
            "host",
            &format!("the open windows were not kept: {e}"),
        );
    }
}

/// At start: open again in a window each folder the last session had open.
/// A folder that is gone or unreachable is skipped and logged. The folders
/// wait for windows as a folder handed by a second launch does: the main
/// window takes the first.
pub(crate) fn restore<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    let keys = kept::open_windows(config.as_deref());
    if keys.is_empty() {
        return;
    }
    log::write(
        "INFO",
        "host",
        &format!("reopening {} window(s) of the last session", keys.len()),
    );
    for key in keys {
        if let Some((url, folder)) = parse_server_key(&key) {
            hand_over(app, Handed::Server(url, folder));
        } else if let Some(path) = kept::folder_for_key(&key, config.as_deref()) {
            // The folder named on the command line is already waiting.
            let waiting = crate::lock(&app.state::<App>().initial_folder).contains(&path);
            if !waiting {
                hand_over(app, Handed::Path(path));
            }
        } else {
            log::write(
                "WARN",
                "host",
                &format!("a window of the last session is not reopened: folder {key} is gone"),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "notas-0123456789abcdef";
    const B: &str = "diario-fedcba9876543210";

    fn kept_in(config: &Path) -> Vec<String> {
        kept::open_windows(Some(config))
    }

    #[test]
    fn two_windows_open_and_the_app_quits_both_come_back() {
        let config = tempfile::tempdir().unwrap();
        write(Some(config.path()), &[A.into(), B.into()]);
        // ⌘Q: the windows close one after the other, the app quitting.
        after_close(Some(config.path()), true, &[B.into()]);
        after_close(Some(config.path()), true, &[]);
        assert_eq!(kept_in(config.path()), [A, B]);
    }

    #[test]
    fn a_window_closed_before_the_quit_does_not_come_back() {
        let config = tempfile::tempdir().unwrap();
        write(Some(config.path()), &[A.into(), B.into()]);
        // The person closes the second window...
        after_close(Some(config.path()), false, &[A.into()]);
        // ... then quits: the last window goes with the app.
        after_close(Some(config.path()), true, &[]);
        assert_eq!(kept_in(config.path()), [A]);
    }

    #[test]
    fn the_last_window_closed_by_hand_is_the_one_that_comes_back() {
        let config = tempfile::tempdir().unwrap();
        write(Some(config.path()), &[A.into(), B.into()]);
        after_close(Some(config.path()), false, &[A.into()]);
        // Closing it is the quit on Windows and Linux: it stays.
        after_close(Some(config.path()), false, &[]);
        assert_eq!(kept_in(config.path()), [A]);
    }

    #[test]
    fn a_server_folder_keeps_its_address() {
        let key = server_key("https://notas.casa", "casa");
        assert_eq!(
            parse_server_key(&key),
            Some(("https://notas.casa".into(), "casa".into()))
        );
        assert_eq!(parse_server_key("server:#x"), None);
        assert_eq!(parse_server_key(A), None);
    }

    #[test]
    fn windows_are_ordered_main_first_then_as_opened() {
        let mut labels = vec!["window-10", "window-2", "main"];
        labels.sort_by_key(|l| order(l));
        assert_eq!(labels, ["main", "window-2", "window-10"]);
    }

    /// Hand `folder` to the app and take the window made for it.
    fn a_window_for(
        app: &tauri::App<tauri::test::MockRuntime>,
        folder: &Path,
    ) -> tauri::WebviewWindow<tauri::test::MockRuntime> {
        let before: Vec<String> = app.webview_windows().into_keys().collect();
        crate::folder_handed(app.handle(), folder.to_path_buf());
        let label = app
            .webview_windows()
            .into_keys()
            .find(|l| !before.contains(l))
            // Or an empty one it was handed to (a mock window that was
            // destroyed lingers in the manager).
            .or_else(|| {
                crate::lock(&app.state::<App>().opening)
                    .iter()
                    .next()
                    .cloned()
            })
            .expect("a window took it");
        app.get_webview_window(&label).unwrap()
    }

    /// The host's side whole, on the mock runtime: two windows with a
    /// folder each are the set; the one the person closes leaves it; the
    /// app quitting keeps the rest; and a start reads the set and hands
    /// each folder that is still there to a window, skipping the gone.
    #[test]
    fn the_windows_of_a_session_come_back_at_the_next_start() {
        use serde_json::json;
        let one = tempfile::tempdir().unwrap();
        let two = tempfile::tempdir().unwrap();
        let _a = crate::tests::note(one.path(), "A.md", "# A\n");
        let _b = crate::tests::note(two.path(), "B.md", "# B\n");
        let (app, main) = crate::tests::app_with(Some(one.path().to_path_buf()));
        let key_a = crate::tests::call(&main, "open_initial", json!({})).unwrap()["info"]["key"]
            .as_str()
            .unwrap()
            .to_owned();
        // Main shows a folder, so the handed one gets a window of its own.
        let second = a_window_for(&app, two.path());
        let second_label = second.label().to_owned();
        let key_b = crate::tests::call(&second, "open_initial", json!({})).unwrap()["info"]["key"]
            .as_str()
            .unwrap()
            .to_owned();
        let config = app.state::<App>().service.config().map(Path::to_path_buf);
        let config = config.as_deref();
        assert_eq!(kept::open_windows(config), [key_a.clone(), key_b.clone()]);

        // The person closes the second window: only the first stays.
        second.destroy().unwrap();
        // What the host's event handler does, in this order (lib.rs).
        app.state::<App>().service.release(&second_label);
        window_gone(app.handle(), &second_label);
        assert_eq!(kept::open_windows(config), std::slice::from_ref(&key_a));

        // A second window again, then the app quits: both stay.
        let again = a_window_for(&app, two.path());
        let again_label = again.label().to_owned();
        crate::tests::call(&again, "open_initial", json!({})).unwrap();
        assert_eq!(kept::open_windows(config), [key_a.clone(), key_b.clone()]);
        quitting(app.handle());
        again.destroy().unwrap();
        window_gone(app.handle(), &again_label);
        main.destroy().unwrap();
        window_gone(app.handle(), "main");
        assert_eq!(kept::open_windows(config), [key_a.clone(), key_b.clone()]);

        // The next start: a folder that is gone is skipped, the others wait
        // for a window each.
        kept::keep_open_windows(
            config,
            &["perdida-0123456789abcdef".to_owned(), key_a, key_b],
        )
        .unwrap();
        crate::lock(&app.state::<App>().initial_folder).clear();
        // The windows are gone, as at a start: their folders are released
        // (what the host's event handler does).
        app.state::<App>().service.release("main");
        app.state::<App>().service.release(&again_label);
        restore(app.handle());
        let waiting: Vec<_> = crate::lock(&app.state::<App>().initial_folder)
            .iter()
            .map(|p| p.file_name().unwrap().to_owned())
            .collect();
        assert_eq!(
            waiting,
            [
                one.path().file_name().unwrap(),
                two.path().file_name().unwrap()
            ]
        );
    }

    /// A server that is down at start does not take its window out of the
    /// set (an update restarts the app and the server together); a local
    /// folder that is gone does, and so does a server window the person
    /// closes.
    #[test]
    fn a_server_folder_offline_at_start_keeps_its_key() {
        use serde_json::json;
        let here = tempfile::tempdir().unwrap();
        let _a = crate::tests::note(here.path(), "A.md", "# A\n");
        let (app, main) = crate::tests::app_with(None);
        let server = server_key("https://nada.invalid", "casa");
        let gone = "perdida-0123456789abcdef".to_owned();
        let config = app.state::<App>().service.config().map(Path::to_path_buf);
        let config = config.as_deref();
        kept::keep_open_windows(config, &[server.clone(), gone]).unwrap();
        restore(app.handle());
        // The server window cannot open: no sign-in for that address.
        assert!(crate::tests::call(&main, "open_initial", json!({})).is_err());
        assert_eq!(kept::open_windows(config), std::slice::from_ref(&server));
        // Another window opens a local folder: the rewritten set still has
        // the server's key, and not the gone folder's.
        crate::folder_handed(app.handle(), here.path().to_path_buf());
        let other = app
            .webview_windows()
            .into_keys()
            .find(|l| l != "main")
            .map(|l| app.get_webview_window(&l).unwrap())
            .unwrap();
        let key = crate::tests::call(&other, "open_initial", json!({})).unwrap()["info"]["key"]
            .as_str()
            .unwrap()
            .to_owned();
        assert_eq!(kept::open_windows(config), [server.clone(), key.clone()]);
        // The person closes the server's window: it leaves the set.
        main.destroy().unwrap();
        window_gone(app.handle(), "main");
        assert_eq!(kept::open_windows(config), [key]);
    }

    /// A running app handed a folder while a window shows another: that
    /// window keeps its folder and stays open, the handed one gets a window
    /// of its own; handed again, the window that shows it comes forward and
    /// no third is made.
    #[test]
    fn a_folder_handed_to_a_running_app_leaves_the_windows_that_show_folders() {
        let one = tempfile::tempdir().unwrap();
        let two = tempfile::tempdir().unwrap();
        let _a = crate::tests::note(one.path(), "A.md", "# A\n");
        let _b = crate::tests::note(two.path(), "B.md", "# B\n");
        let (app, main) = crate::tests::app_with(Some(one.path().to_path_buf()));
        let first =
            crate::tests::call(&main, "open_initial", serde_json::json!({})).unwrap()["info"]["key"]
                .as_str()
                .unwrap()
                .to_owned();
        let other = a_window_for(&app, two.path());
        assert_ne!(other.label(), "main", "main was told the folder");
        assert_eq!(
            app.state::<App>().service.folder_of("main").as_deref(),
            Some(first.as_str())
        );
        assert!(app.get_webview_window("main").is_some());
        let second =
            crate::tests::call(&other, "open_initial", serde_json::json!({})).unwrap()["info"]["key"]
                .as_str()
                .unwrap()
                .to_owned();
        // Handed again: both windows stay, and none is added.
        let windows = app.webview_windows().len();
        crate::folder_handed(app.handle(), one.path().to_path_buf());
        crate::folder_handed(app.handle(), two.path().to_path_buf());
        assert_eq!(app.webview_windows().len(), windows);
        assert!(crate::lock(&app.state::<App>().initial_folder).is_empty());
        assert_eq!(
            app.state::<App>()
                .service
                .folder_of(other.label())
                .as_deref(),
            Some(second.as_str())
        );
    }

    /// A window that waits for its server's folder (the server is down)
    /// shows a folder though the service has none: a folder handed to the
    /// app is not given to it.
    #[test]
    fn a_window_waiting_for_its_server_is_not_handed_a_folder() {
        use tauri::Listener;
        let vault = tempfile::tempdir().unwrap();
        let _a = crate::tests::note(vault.path(), "A.md", "# A\n");
        let (app, _main) = crate::tests::app_with(None);
        crate::lock(&app.state::<App>().pending_servers)
            .insert("main".to_owned(), server_key("http://s:1", "f"));
        let told = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let seen = told.clone();
        app.listen_any("folder-handed", move |_| {
            seen.fetch_add(1, Ordering::SeqCst);
        });
        let windows = app.webview_windows().len();
        crate::folder_handed(app.handle(), vault.path().to_path_buf());
        assert_eq!(told.load(Ordering::SeqCst), 0);
        assert_eq!(app.webview_windows().len(), windows + 1);
    }

    /// Every folder window's close says why in one line, with the label and
    /// whether it showed a folder, never which: the person's close request,
    /// the app quitting, a menu item, and a window gone unasked.
    #[test]
    fn a_closing_window_says_why_in_the_log() {
        closing(
            "window-901",
            "a close request (the frame's button or the system's)",
        );
        closing("window-901", "the Close Window menu item");
        assert_eq!(
            close_line("window-901", true, false),
            "window closed: window-901 (showed a folder; cause: a close request (the frame's button or the system's))"
        );
        // The cause is spent: a second close with none said is unexplained.
        assert_eq!(
            close_line("window-901", false, false),
            "window closed: window-901 (showed no folder; cause: destroyed with no request seen)"
        );
        closing("window-902", "the Close Window menu item");
        assert_eq!(
            close_line("window-902", true, true),
            "window closed: window-902 (showed a folder; cause: the app is quitting)"
        );
    }
}
