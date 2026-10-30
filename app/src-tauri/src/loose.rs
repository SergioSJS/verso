// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One Markdown file handed to the app (ADR 0114, sections B and D, item
//! 20): what the system hands over is classified by one look at the disk
//! (in `verso-fs`), a file is routed — to the window of a folder it lies
//! in, else to the loose-files window — and the loose window's own
//! commands live here. Every path stays on this side (rule 4): the window
//! gets a name, a key and a label.

use super::*;
use verso_contract::{LooseFileInfo, Opened, RecentFile, Written};

/// The path an argument of the command line names: a `file://` URL as the
/// system's "open with" may pass it (percent-decoded, as Tauri's own
/// example reads it), or a path, relative to `cwd` when it is not absolute.
pub(crate) fn path_from_arg(arg: &str, cwd: &Path) -> PathBuf {
    if let Some(rest) = arg.strip_prefix("file://") {
        // `file:///Users/x/n.md`, `file://localhost/Users/x/n.md` and, on
        // Windows, `file:///C:/x/n.md`.
        let rest = rest.strip_prefix("localhost").unwrap_or(rest);
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
/// is not a folder or a Markdown file (item 6): the kind, and the name.
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
/// Markdown file as a loose file; anything else is said and the window
/// stays as it was (ADR 0114 item 6).
pub(crate) fn path_handed<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: PathBuf) {
    let path = std::path::absolute(&path).unwrap_or(path);
    match verso_core::kind_of(&path) {
        verso_core::PathKind::Directory => hand_over(app, Handed::Path(path)),
        verso_core::PathKind::MarkdownFile => file_handed(app, path),
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

/// A Markdown file handed to the app, routed (item 7): inside a folder a
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
            let _ = w.unminimize();
            let _ = w.set_focus();
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
                let _ = w.unminimize();
                let _ = w.set_focus();
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
    verso_core::recent_folders(config)
        .into_iter()
        .filter(|folder| {
            path.strip_prefix(folder)
                .is_ok_and(|r| !r.as_os_str().is_empty())
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

/// The system's file picker for one Markdown file (File › Open File…),
/// handed over as a double-click is.
pub(crate) fn pick_file_and_hand<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    parent: Option<&tauri::Window<R>>,
) {
    let handle = app.clone();
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"]);
    if let Some(parent) = parent {
        dialog = dialog.set_parent(parent);
    }
    dialog.pick_file(move |picked| {
        if let Some(path) = picked.and_then(|p| p.into_path().ok()) {
            path_handed(&handle, path);
        }
    });
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
    app.dialog()
        .file()
        .set_parent(&parent)
        .set_file_name(&name)
        .add_filter("Markdown", &["md", "markdown"])
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
        #[cfg(windows)]
        assert_eq!(
            path_from_arg("file:///C:/Users/ana/n.md", cwd),
            PathBuf::from(r"C:\Users\ana\n.md")
        );
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
