//! The app's windows: a note popped out and returned, a new window on a folder,
//! downloads.

use super::*;

static POPOUTS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// A note in a window of its own: the same UI, which asks which note
/// by its window's label.
#[tauri::command]
#[specta::specta]
pub(crate) fn open_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<(), ContractError> {
    let n = POPOUTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let label = format!("note-{n}");
    // The note belongs to the folder of the window it came from (ADR 0065).
    {
        let mut sessions = lock(&state.sessions);
        let key = sessions
            .windows
            .get(window.label())
            .cloned()
            .ok_or_else(no_folder)?;
        sessions.windows.insert(label.clone(), key);
    }
    let title = path
        .rsplit('/')
        .next()
        .unwrap_or(&path)
        .trim_end_matches(".md")
        .to_owned();
    lock(&state.popouts).insert(label.clone(), path);
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(920.0, 720.0)
        .min_inner_size(360.0, 400.0)
        .disable_drag_drop_handler()
        .on_download(on_download)
        .build()
        .map_err(|e| failed(e.to_string()))?;
    Ok(())
}

static WINDOWS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);

/// Another window (ADR 0049; ADR 0065): on the folder of the window that
/// asks (`same_folder`), with its own tabs over the same session — what one
/// window writes, the other reads as it reads any change made outside, and
/// a write over a note the other changed is refused (invariant 11) — or on
/// no folder, to open one of its own.
#[tauri::command]
#[specta::specta]
pub(crate) fn new_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    same_folder: bool,
) -> Result<(), ContractError> {
    // On this window's folder, or on none: the new window then shows the
    // start page, to open one (ADR 0065).
    let key = if same_folder {
        Some(
            lock(&state.sessions)
                .windows
                .get(window.label())
                .cloned()
                .ok_or_else(no_folder)?,
        )
    } else {
        None
    };
    open_folder_window(&app, key).map_err(|e| failed(e.to_string()))
}

/// A window of a folder: `key` the folder it joins, bound before the
/// window starts and asks which folder it shows; none, the start page.
pub(crate) fn open_folder_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: Option<String>,
) -> tauri::Result<()> {
    let n = WINDOWS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let label = format!("window-{n}");
    if let Some(key) = key {
        lock(&app.state::<App>().sessions)
            .windows
            .insert(label.clone(), key);
    }
    tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App("index.html".into()))
        .title("Verso")
        .inner_size(1180.0, 760.0)
        .min_inner_size(360.0, 480.0)
        .disable_drag_drop_handler()
        .on_download(on_download)
        .build()?;
    Ok(())
}

/// What a window of the app downloads — a picture's "Baixar imagem", the
/// board's export "Baixar" — goes to the Downloads folder, under a name not
/// taken there (WebKit's choice, made by wry); without a hook WebKit drops
/// every download unseen. The window is told the file's name, never its
/// path (ADR 0026 rule 4), to say where it went. A web page's own window
/// has no such hook: what a site downloads is the network's (ADR 0050).
pub(crate) fn on_download<R: tauri::Runtime>(
    webview: tauri::Webview<R>,
    event: tauri::webview::DownloadEvent<'_>,
) -> bool {
    match event {
        tauri::webview::DownloadEvent::Requested { destination, .. } => {
            let name = destination
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            log::write("INFO", "host", &format!("download to Downloads: {name}"));
            let _ = webview
                .app_handle()
                .emit("downloaded", (webview.label().to_owned(), name, true));
            true
        }
        tauri::webview::DownloadEvent::Finished { success, .. } => {
            if !success {
                log::write("WARN", "host", "a download did not finish");
                let _ = webview.app_handle().emit(
                    "downloaded",
                    (webview.label().to_owned(), String::new(), false),
                );
            }
            true
        }
        _ => true,
    }
}

/// Which note this window shows, when it is one popped out; `None` for
/// the main window.
#[tauri::command]
#[specta::specta]
pub(crate) fn popout_target<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Option<String>, ContractError> {
    Ok(lock(&state.popouts).get(window.label()).cloned())
}

/// The note goes back into the main window: the main window is told,
/// then this one closes.
#[tauri::command]
#[specta::specta]
pub(crate) fn return_to_main<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<(), ContractError> {
    // Back to a window of its folder: the main one if it shows it, else
    // the first other that does (ADR 0065).
    let home = {
        let sessions = lock(&state.sessions);
        let key = sessions.windows.get(window.label()).cloned();
        let mut folder_windows: Vec<&String> = sessions
            .windows
            .iter()
            .filter(|(l, k)| Some(*k) == key.as_ref() && (*l == "main" || l.starts_with("window-")))
            .map(|(l, _)| l)
            .collect();
        folder_windows.sort_by_key(|l| (*l != "main", (*l).clone()));
        folder_windows
            .first()
            .map(|l| (*l).clone())
            .unwrap_or_else(|| "main".to_owned())
    };
    app.emit("open-note", (home.clone(), path))
        .map_err(|e| failed(e.to_string()))?;
    if let Some(w) = app.get_window(&home) {
        let _ = w.set_focus();
    }
    lock(&state.popouts).remove(window.label());
    window.close().map_err(|e| failed(e.to_string()))
}
