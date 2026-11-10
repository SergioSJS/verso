// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One Markdown file handed to the app (ADR 0114, sections B and D, item
//! 20), or a structured-data file (`.json`, `.yaml`, `.yml`, `.toml`,
//! `.xml`, `.csv`; item 32, amended 2026-10-31, which the window opens in
//! the diagram): what the system hands over is classified by one look at the disk
//! (in `verso-fs`), a file is routed — to the window of a folder it lies
//! in, else to the loose-files window — and the loose window's own
//! commands live here. Every path stays on this side (rule 4): the window
//! gets a name, a key and a label.

use super::*;
use verso_contract::{LooseFileInfo, Opened, RecentFile, Written};

/// The path an argument of the command line names: a `file://` URL as the
/// system's "open with" may pass it (percent-decoded, as Tauri's own
/// example reads it), or a path, relative to `cwd` when it is not absolute.
/// A phone has no command line and no second launch.
#[cfg(desktop)]
pub(crate) fn path_from_arg(arg: &str, cwd: &Path) -> PathBuf {
    if let Some(rest) = arg.strip_prefix("file://") {
        // `file:///Users/x/n.md`, `file://localhost/Users/x/n.md` and, on
        // Windows, `file:///C:/x/n.md`.
        let rest = rest.strip_prefix("localhost").unwrap_or(rest);
        // A query or a fragment is not part of the name (a `?` or `#` in a
        // name is written `%3F` and `%23`, decoded below).
        let rest = rest.split(['?', '#']).next().unwrap_or(rest);
        // `file://server/share/n.md` names a network share on Windows.
        #[cfg(windows)]
        if !rest.starts_with('/') && !rest.is_empty() {
            return PathBuf::from(format!(
                r"\\{}",
                verso_service::files::percent_decode(rest).replace('/', "\\")
            ));
        }
        let decoded = verso_service::files::percent_decode(rest);
        #[cfg(windows)]
        let decoded = decoded
            .strip_prefix('/')
            .filter(|r| r.as_bytes().get(1) == Some(&b':'))
            .map_or(decoded.clone(), |r| r.replace('/', "\\"));
        return PathBuf::from(decoded);
    }
    let path = Path::new(arg);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    }
}

/// What the system handed the app, said to the window in front when it
/// is not a folder, a Markdown file or a data file (items 6 and 32): the
/// kind, and the name.
fn say_refused<R: tauri::Runtime>(app: &tauri::AppHandle<R>, kind: &str, path: &Path) {
    let name = path
        .file_name()
        .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
    log::write(
        "WARN",
        "host",
        &format!("handed {kind}: not opened ({name})"),
    );
    let label = focused_window(app)
        .map(|w| w.label().to_owned())
        .filter(|l| is_app_view(l))
        .or_else(|| app.get_window("main").map(|_| "main".to_owned()));
    if let Some(label) = label {
        let _ = app.emit("handed-refused", (label, kind.to_owned(), name));
    }
}

/// A path the system handed the app — the command line, a second launch,
/// macOS's open event, the menu's recents: a folder opens as today, a
/// Markdown file or a data file as a loose file (items 6 and 32); anything
/// else is said and the window stays as it was (ADR 0114 item 6).
pub(crate) fn path_handed<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: PathBuf) {
    let path = verso_core::canonical_path(&path);
    match verso_core::kind_of(&path) {
        verso_core::PathKind::Directory => hand_over(app, Handed::Path(path)),
        verso_core::PathKind::MarkdownFile | verso_core::PathKind::DataFile => {
            file_handed(app, path);
        }
        verso_core::PathKind::OtherFile => say_refused(app, "other", &path),
        verso_core::PathKind::Missing => {
            // A recent file that is gone leaves the menu (Q4).
            let _ =
                verso_core::session::forget_recent_file(app.state::<App>().service.config(), &path);
            say_refused(app, "missing", &path);
        }
        verso_core::PathKind::Placeholder => say_refused(app, "placeholder", &path),
        verso_core::PathKind::Unreadable(_) => say_refused(app, "unreadable", &path),
    }
}

/// The window a loose file goes to (item 7 iii): the loose-files window —
/// the one showing files, or the one just picked or made for a file and
/// not yet showing it —, else a window of the app that shows nothing.
fn loose_target<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    let state = app.state::<App>();
    if let Some(label) = state.service.loose_window()
        && app.get_window(&label).is_some()
    {
        return Some(label);
    }
    if let Some(label) = lock(&state.loose_window).clone()
        && app.get_window(&label).is_some()
    {
        return Some(label);
    }
    let opening = lock(&state.opening);
    let mut labels: Vec<String> = app
        .windows()
        .into_keys()
        .filter(|l| {
            (l == "main" || l.starts_with("window-"))
                && state.service.folder_of(l).is_none()
                && remote::of(app, l).is_none()
                && !lock(&state.pending_servers).contains_key(l)
                && !opening.contains(l)
        })
        .collect();
    labels.sort_by_key(|l| (l != "main", l.clone()));
    labels.into_iter().next()
}

/// A Markdown or data file handed to the app, routed (item 7): inside a folder a
/// window shows, that window opens it as a tab; else the loose-files
/// window takes it as a tab, made when there is none. Before the setup made
/// the main window (a double-click that launches the app), the main window
/// opens it at start.
pub(crate) fn file_handed<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: PathBuf) {
    let state = app.state::<App>();
    // (i) A file of an open folder: that folder's window, as a tab.
    if let Some((key, relative)) = state.service.folder_containing(&path)
        && let Some(label) = window_showing(app, &key)
    {
        log::write(
            "INFO",
            "host",
            "a file handed: opened in its folder's window",
        );
        let _ = app.emit("open-note", (label.clone(), relative));
        if let Some(w) = app.get_window(&label) {
            crate::mobile::raise(&w);
        }
        return;
    }
    lock(&state.initial_file).push_back(path);
    if !state.started.load(std::sync::atomic::Ordering::SeqCst) && app.get_window("main").is_none()
    {
        log::write(
            "INFO",
            "host",
            "a file handed at launch: the main window opens it",
        );
        return;
    }
    match loose_target(app) {
        Some(label) => {
            *lock(&state.loose_window) = Some(label.clone());
            if let Some(w) = app.get_window(&label) {
                crate::mobile::raise(&w);
            }
            let _ = app.emit("file-handed", label);
        }
        None => match open_folder_window(app, None) {
            Ok(label) => *lock(&state.loose_window) = Some(label),
            Err(e) => log::write("ERROR", "host", &format!("no window for the file: {e}")),
        },
    }
}

/// Whether `label` is the loose-files window: showing files, or picked for
/// one not yet opened.
pub(crate) fn is_loose_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> bool {
    let state = app.state::<App>();
    state.service.is_loose(label) || lock(&state.loose_window).as_deref() == Some(label)
}

/// `label` shows a folder now, or closed: not the loose-files window.
pub(crate) fn left<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    let state = app.state::<App>();
    let mut loose = lock(&state.loose_window);
    if loose.as_deref() == Some(label) {
        *loose = None;
    }
}

/// A folder opened before that `path` lies in, the deepest (item 7 ii):
/// its path, at the edge.
pub(crate) fn known_folder_of(config: Option<&Path>, path: &Path) -> Option<PathBuf> {
    let path = verso_core::canonical_path(path);
    verso_core::recent_folders(config)
        .into_iter()
        .filter(|folder| {
            verso_core::strip_root(&path, &verso_core::canonical_path(folder))
                .is_some_and(|r| !r.as_os_str().is_empty())
        })
        .max_by_key(|folder| folder.components().count())
}

/// Open `path` as a loose file of `window` (off the event loop: the disk
/// is asked), and make the window the loose-files window.
pub(crate) async fn install_loose<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
    path: PathBuf,
) -> Result<LooseFileInfo, ContractError> {
    may_switch(app, window)?;
    let _opening = Opening::mark(app, window.label());
    let service = Arc::clone(&app.state::<App>().service);
    let label = window.label().to_owned();
    let known = known_folder_of(service.config(), &path)
        .and_then(|f| f.file_name().map(|n| n.to_string_lossy().into_owned()));
    let for_open = path.clone();
    let info =
        tauri::async_runtime::spawn_blocking(move || service.open_loose(&label, &for_open, known))
            .await
            .map_err(|e| failed(e.to_string()))??;
    remote::release(app, window.label());
    crate::local_server::seat::stand(app, window.label());
    settle(app);
    *lock(&app.state::<App>().loose_window) = Some(window.label().to_owned());
    let _ = window.set_title(&format!("{} — Verso", info.name));
    if let Err(e) =
        verso_core::session::remember_recent_file(app.state::<App>().service.config(), &path)
    {
        log::write(
            "WARN",
            "host",
            &format!("the recent files were not kept: {e}"),
        );
    }
    #[cfg(target_os = "macos")]
    refresh_menu(app);
    Ok(info)
}

/// The next file waiting for `label`, if any (`open_initial`).
pub(crate) fn take_initial_file<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    lock(&app.state::<App>().initial_file).pop_front()
}

/// What `open_initial` answers when a file, not a folder, waits.
pub(crate) async fn open_initial_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Option<Result<Opened, ContractError>> {
    let path = take_initial_file(app)?;
    Some(install_loose(app, window, path).await.map(Opened::File))
}

/// A command of a loose window answered by the service's own dispatch,
/// by name with the arguments as the window sends them: `None` when the
/// window is not a loose one (the folder's command runs as today).
pub(crate) fn via_loose<T: serde::de::DeserializeOwned, R: tauri::Runtime>(
    state: &State<'_, App>,
    window: &tauri::Window<R>,
    name: &str,
    args: serde_json::Value,
) -> Option<Result<T, ContractError>> {
    if !state.service.is_loose(window.label()) {
        return None;
    }
    let answer = state
        .service
        .loose_dispatch(window.label(), name, &args)
        .unwrap_or_else(|| Err(verso_service::not_available()));
    Some(answer.and_then(|v| serde_json::from_value(v).map_err(|e| failed(e.to_string()))))
}

/// The window closed: if it was the loose-files window, there is none.
pub(crate) fn window_gone<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    left(app, label);
}

/// What File › Open File… offers (ADR 0114 item 34, 2026-10-31): the
/// Markdown extensions and the structured-data ones of item 31, as one
/// filter so that every system shows the same list. Each is one the disk
/// look ([`verso_core::kind_of`]) opens loose, which a test holds.
const PICKER_EXTENSIONS: [&str; 8] = [
    "md", "markdown", "json", "yaml", "yml", "toml", "xml", "csv",
];

/// The system's file picker for one Markdown or data file (File › Open
/// File…), handed over as a double-click is.
pub(crate) fn pick_file_and_hand<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    parent: Option<&tauri::Window<R>>,
) {
    let handle = app.clone();
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Markdown, JSON, YAML, TOML, XML, CSV", &PICKER_EXTENSIONS);
    if let Some(parent) = parent {
        dialog = crate::mobile::dialog_over(dialog, parent);
    }
    dialog.pick_file(move |picked| {
        if let Some(path) = picked.and_then(|p| p.into_path().ok()) {
            path_handed(&handle, path);
        }
    });
}

/* ---------- What the system hands over: folders as today ---------- */

/// The app launched again while it runs — `verso <folder>`, which starts
/// `verso-app <folder>`, or the app's icon: the running app takes the
/// folder into a window of its own (`folder_handed`, ADR 0065), or, with
/// none, brings a window forward. The second process exits; its arguments
/// are its command line, a relative folder read from its own directory.
#[cfg(desktop)]
pub(crate) fn second_launch<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    argv: Vec<String>,
    cwd: String,
) {
    // The first argument, as `main` reads its own (main.rs).
    let handed = argv
        .get(1)
        .filter(|a| !a.starts_with("--"))
        .map(|a| loose::path_from_arg(a, std::path::Path::new(&cwd)));
    log::write("INFO", "host", "launched again: handed to the running app");
    match handed {
        // A folder, or a Markdown file (ADR 0114 item 6).
        Some(path) => loose::path_handed(app, path),
        None => {
            // A window of a folder (the main one first), never a note's
            // popout or a web page's.
            let windows = app.windows();
            let window = windows.get("main").or_else(|| {
                windows
                    .iter()
                    .filter(|(l, _)| l.starts_with("window-"))
                    .min_by_key(|(l, _)| l.as_str())
                    .map(|(_, w)| w)
            });
            if let Some(w) = window {
                crate::mobile::raise(w);
            }
        }
    }
}

/// macOS hands the app a folder by an open event — `open -a Verso
/// <folder>`, which is how `verso <folder>` starts the installed app —
/// both when it launches the app and when the app is already running; the
/// folder never reaches the command line, and before this it was lost on
/// a running app (`docs/review/phase-2.md`, reading 3, finding 20). It
/// takes the command line's place: the main window, if it is up, is told
/// to open it (`open_initial`, after saving its tabs), and one that starts
/// later opens it at start-up. What is not a folder fails there, as a
/// command-line argument would. A second launch on any system (the
/// single-instance plugin, `second_launch`) hands its folder here too.
/// Only macOS hands a folder by an open event; the tests hand one on every
/// system.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn folder_handed<R: tauri::Runtime>(app: &tauri::AppHandle<R>, folder: PathBuf) {
    hand_over(app, Handed::Path(folder));
}

/// What is handed to the app to open in a window: a folder of this
/// computer, a path at the edge, or a folder of a server (address, folder).
pub(crate) enum Handed {
    Path(PathBuf),
    /// Only the last session's windows hand a server's folder (a phone
    /// restores none: one window, on its own folder).
    #[cfg(desktop)]
    Server(String, String),
}

/// The window of a folder (the main one first) that already shows the
/// folder `key`, on this computer or on a server, or waits for the server
/// that will show it.
pub(crate) fn window_showing<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: &str,
) -> Option<String> {
    let state = app.state::<App>();
    let mut labels: Vec<String> = app
        .windows()
        .into_keys()
        .filter(|l| l == "main" || l.starts_with("window-"))
        .filter(|l| match remote::of(app, l) {
            Some(r) => session::server_key(&r.url, &r.folder) == key,
            None => {
                state.service.folder_of(l).as_deref() == Some(key)
                    || lock(&state.pending_servers).get(l).map(String::as_str) == Some(key)
            }
        })
        .collect();
    labels.sort_by_key(|l| (l != "main", l.clone()));
    labels.into_iter().next()
}

pub(crate) fn hand_over<R: tauri::Runtime>(app: &tauri::AppHandle<R>, handed: Handed) {
    // A folder a window already shows is that window's to bring forward: a
    // second window on it, or the one that shows another folder swapped
    // for it, is never what handing a folder to the running app means.
    let key = match &handed {
        Handed::Path(folder) => verso_core::folder_key(folder),
        #[cfg(desktop)]
        Handed::Server(url, folder) => session::server_key(url, folder),
    };
    if let Some(label) = window_showing(app, &key)
        && let Some(w) = app.get_window(&label)
    {
        crate::mobile::raise(&w);
        return;
    }
    // Folders wait in line: two handed before a window took the first
    // (`verso a; verso b`) are both opened, never one lost.
    let waiting = {
        let state = app.state::<App>();
        let mut queue = lock(&state.initial_folder);
        let waiting = !queue.is_empty() || !lock(&state.initial_server).is_empty();
        match handed {
            Handed::Path(folder) => queue.push_back(folder),
            #[cfg(desktop)]
            Handed::Server(url, folder) => lock(&state.initial_server).push_back((url, folder)),
        }
        waiting
    };
    // Handed before the setup made the main window (macOS's open event
    // at launch): the main window, made next, opens it at start-up — a
    // window made here as well left an empty "Verso" beside the folder's.
    if !app
        .state::<App>()
        .started
        .load(std::sync::atomic::Ordering::SeqCst)
        && app.get_window("main").is_none()
    {
        log::write(
            "INFO",
            "host",
            "a folder handed at launch: the main window opens it",
        );
        return;
    }
    // A window of the app that shows no folder takes it; with none — or
    // when that window has a folder waiting for it already — a new window
    // does, which opens it as it starts (ADR 0065).
    let empty = if waiting {
        None
    } else {
        let state = app.state::<App>();
        let opening = lock(&state.opening);
        let mut labels: Vec<String> = app
            .windows()
            .into_keys()
            .filter(|l| {
                (l == "main" || l.starts_with("window-"))
                    && state.service.folder_of(l).is_none()
                    // A window on a server's folder, or waiting for the
                    // server's, shows a folder though the service has none.
                    && remote::of(app, l).is_none()
                    && !lock(&state.pending_servers).contains_key(l)
                    && !opening.contains(l)
                    // The loose-files window keeps its files (ADR 0114).
                    && !state.service.is_loose(l)
                    && lock(&state.loose_window).as_deref() != Some(l.as_str())
            })
            .collect();
        labels.sort_by_key(|l| (l != "main", l.clone()));
        labels.into_iter().next()
    };
    match empty {
        Some(label) => {
            if let Some(w) = app.get_window(&label) {
                let _ = w.set_focus();
            }
            // Told: it opens the folder now, and is not handed another.
            lock(&app.state::<App>().opening).insert(label.clone());
            let _ = app.emit("folder-handed", label);
        }
        None => {
            let _ = open_folder_window(app, None);
        }
    }
}

/// The window of a folder that has the focus, for the menu's items that
/// act on one: the main window when none of them has it.
#[cfg(target_os = "macos")]
pub(crate) fn folder_window_in_focus<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> String {
    focused_window(app)
        .map(|w| w.label().to_owned())
        .filter(|l| l == "main" || l.starts_with("window-"))
        .unwrap_or_else(|| "main".to_owned())
}

/* ---------- The loose window's commands ---------- */

/// The files this window shows without a folder, for a window that joins
/// or reloads (ADR 0114 item 9); empty for a folder's window.
#[tauri::command]
#[specta::specta]
pub(crate) fn loose_files<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<LooseFileInfo>, ContractError> {
    Ok(state.service.loose_files(window.label()))
}

/// The tab of `name` closed: the file is let go.
#[tauri::command]
#[specta::specta]
pub(crate) fn loose_close<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    name: String,
) -> Result<(), ContractError> {
    state.service.close_loose(window.label(), &name);
    if !state.service.is_loose(window.label()) {
        left(&app, window.label());
        let _ = window.set_title("Verso");
    }
    Ok(())
}

/// "Open the whole folder in Verso" (item 9), or the folder opened before
/// that the file lies in (item 7 ii, `known`): opened as a handed folder
/// is — in the window that shows it, an empty one, or a new one (ADR 0065
/// item 4). The path never crosses: the window names the file, the host
/// has its folder.
#[tauri::command]
#[specta::specta]
pub(crate) fn open_folder_of_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    name: String,
    known: bool,
) -> Result<(), ContractError> {
    let file = state
        .service
        .loose_path(window.label(), &name)
        .ok_or_else(|| refused("no such file in this window"))?;
    let folder = if known {
        known_folder_of(state.service.config(), &file)
            .ok_or_else(|| refused("no folder opened before holds this file"))?
    } else {
        file.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| refused("the file has no folder"))?
    };
    hand_over(&app, Handed::Path(folder));
    Ok(())
}

/// A sibling note the file `from` links to, opened as a tab of its own in
/// this window (item 14): `not_found` when nothing of that name is beside it.
#[tauri::command]
#[specta::specta]
pub(crate) async fn open_sibling<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    from: String,
    target: String,
) -> Result<LooseFileInfo, ContractError> {
    let service = Arc::clone(&state.service);
    let label = window.label().to_owned();
    let info =
        tauri::async_runtime::spawn_blocking(move || service.open_sibling(&label, &from, &target))
            .await
            .map_err(|e| failed(e.to_string()))??;
    Ok(info)
}

/// "Save here again" (item 11): the file made again at its name after it
/// was deleted or moved outside; `exists` when something reappeared there.
#[tauri::command]
#[specta::specta]
pub(crate) fn loose_save_again<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    name: String,
    text: String,
) -> Result<Written, ContractError> {
    let shown = name.clone();
    state.service.with_loose(window.label(), &name, |l| {
        let w = l.save_again(&shown, &text)?;
        Ok(Written {
            note: verso_service::convert::note_out(w.note),
            warnings: w.warnings,
        })
    })
}

/// "Save a copy…" (items 11 and 12): the system's save dialog, at the
/// entry edge; the text written there atomically, never over what stands
/// there. `false` when the person cancelled.
#[tauri::command]
#[specta::specta]
pub(crate) async fn loose_save_copy<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    name: String,
    text: String,
) -> Result<bool, ContractError> {
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let parent = window.clone();
    let (filter_name, filter_exts) = copy_filter(&name);
    crate::mobile::dialog_over(app.dialog().file(), &parent)
        .set_file_name(&name)
        .add_filter(filter_name, filter_exts)
        .save_file(move |picked| {
            let _ = tx.try_send(picked);
        });
    let Some(picked) = rx.recv().await.flatten() else {
        return Ok(false);
    };
    let path = picked.into_path().map_err(|e| failed(e.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || verso_service::loose::save_copy(&path, &text))
        .await
        .map_err(|e| failed(e.to_string()))??;
    Ok(true)
}

/// The save dialog's filter for a copy of `name` (item 11): Markdown for a
/// note, the file's own extension for a data file (item 32), so that a
/// copy of `dados.json` is not offered as Markdown.
fn copy_filter(name: &str) -> (&'static str, &'static [&'static str]) {
    let ext = Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "json" => ("JSON", &["json"]),
        "yaml" | "yml" => ("YAML", &["yaml", "yml"]),
        "toml" => ("TOML", &["toml"]),
        "xml" => ("XML", &["xml"]),
        "csv" => ("CSV", &["csv"]),
        _ => ("Markdown", &["md", "markdown"]),
    }
}

/// File › Open File… from the window: the picker, then the file handed
/// over as a double-click is.
#[tauri::command]
#[specta::specta]
pub(crate) fn pick_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    pick_file_and_hand(&app, Some(&window));
    Ok(())
}

/// The files opened without a folder lately (Q4), for the window's own
/// menu on Windows and Linux: names and places, and an index into the
/// host's list; never a path.
#[tauri::command]
#[specta::specta]
pub(crate) fn recent_files(state: State<'_, App>) -> Result<Vec<RecentFile>, ContractError> {
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    Ok(verso_core::session::recent_files(state.service.config())
        .iter()
        .enumerate()
        .map(|(i, path)| RecentFile {
            index: u32::try_from(i).unwrap_or(u32::MAX),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            place: shares::place_of(path, home.as_deref()),
        })
        .collect())
}

/// A recent file picked from the window's menu: handed over as a
/// double-click is; one that is gone leaves the list (Q4).
#[tauri::command]
#[specta::specta]
pub(crate) fn open_recent_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, App>,
    index: u32,
) -> Result<(), ContractError> {
    let path = verso_core::session::recent_files(state.service.config())
        .get(index as usize)
        .cloned()
        .ok_or_else(|| refused("no such recent file"))?;
    path_handed(&app, path);
    Ok(())
}

/// Settings › "To open .md files with Verso by default" (item 5, Q12): on
/// Windows, the system's Default apps page; elsewhere the line says the
/// gesture and there is nothing to open.
#[tauri::command]
#[specta::specta]
pub(crate) fn open_default_apps() -> Result<(), ContractError> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg("ms-settings:defaultapps")
            .spawn()
            .map(|_| ())
            .map_err(|e| failed(e.to_string()))
    }
    #[cfg(not(windows))]
    {
        Err(refused(
            "the default app for .md is set in the system, not from here",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_argument_is_a_path_or_a_file_url() {
        let cwd = Path::new("/home/ana");
        assert_eq!(
            path_from_arg("notas/a.md", cwd),
            PathBuf::from("/home/ana/notas/a.md")
        );
        assert_eq!(path_from_arg("/tmp/a.md", cwd), PathBuf::from("/tmp/a.md"));
        assert_eq!(
            path_from_arg("file:///Users/ana/My%20Note%20%C3%A7.md", cwd),
            PathBuf::from("/Users/ana/My Note ç.md")
        );
        assert_eq!(
            path_from_arg("file://localhost/Users/ana/n.md", cwd),
            PathBuf::from("/Users/ana/n.md")
        );
        // A query and a fragment are not the name; an encoded `#` is.
        assert_eq!(
            path_from_arg("file:///Users/ana/n.md?x=1#top", cwd),
            PathBuf::from("/Users/ana/n.md")
        );
        assert_eq!(
            path_from_arg("file:///Users/ana/a%23b.md", cwd),
            PathBuf::from("/Users/ana/a#b.md")
        );
        #[cfg(windows)]
        assert_eq!(
            path_from_arg("file://servidor/share/n.md", cwd),
            PathBuf::from(r"\\servidor\share\n.md")
        );
        #[cfg(windows)]
        assert_eq!(
            path_from_arg("file:///C:/Users/ana/n.md", cwd),
            PathBuf::from(r"C:\Users\ana\n.md")
        );
    }

    #[test]
    fn the_picker_offers_exactly_what_opens_loose() {
        // Every extension the picker lists is one the disk look sends to
        // the loose window, and every kind it opens is in the list.
        let dir = tempfile::tempdir().unwrap();
        for ext in PICKER_EXTENSIONS {
            let file = tempfile::Builder::new()
                .prefix("arquivo")
                .suffix(&format!(".{}", ext.to_uppercase()))
                .rand_bytes(0)
                .tempfile_in(dir.path())
                .unwrap()
                .into_temp_path()
                .keep()
                .unwrap();
            let kind = verso_core::kind_of(&file);
            assert!(
                matches!(
                    kind,
                    verso_core::PathKind::MarkdownFile | verso_core::PathKind::DataFile
                ),
                "{ext}: {kind:?}"
            );
        }
        for ext in ["txt", "pdf", "png"] {
            assert!(!PICKER_EXTENSIONS.contains(&ext));
        }
    }

    #[test]
    fn a_copy_is_offered_under_the_file_s_own_kind() {
        assert_eq!(copy_filter("nota.md").0, "Markdown");
        assert_eq!(copy_filter("dados.JSON"), ("JSON", &["json"][..]));
        assert_eq!(copy_filter("c.yml").1, &["yaml", "yml"]);
        assert_eq!(copy_filter("c.toml").0, "TOML");
        assert_eq!(copy_filter("c.xml").0, "XML");
        assert_eq!(copy_filter("c.csv").0, "CSV");
        assert_eq!(copy_filter("sem extensão").0, "Markdown");
    }

    #[test]
    fn the_deepest_known_folder_holding_the_file_is_the_one_offered() {
        let config = tempfile::tempdir().unwrap();
        let outer = tempfile::tempdir().unwrap();
        let inner = tempfile::Builder::new()
            .prefix("Dentro")
            .rand_bytes(0)
            .tempdir_in(outer.path())
            .unwrap();
        // Known once indexed: a workspace of each, with its sidecar.
        for folder in [outer.path(), inner.path()] {
            let mut ws = Workspace::open(folder, Some(config.path())).unwrap();
            ws.index().unwrap();
        }
        let file = inner.path().join("nota.md");
        assert_eq!(
            known_folder_of(Some(config.path()), &file).as_deref(),
            Some(inner.path())
        );
        assert_eq!(
            known_folder_of(Some(config.path()), Path::new("/elsewhere/n.md")),
            None
        );
    }
}
