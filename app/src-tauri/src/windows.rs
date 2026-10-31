//! The app's windows: a note popped out and returned, a new window on a folder,
//! downloads.

use super::*;

static POPOUTS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

// Async: a window or web view made inside a synchronous command blanks or
// deadlocks on Windows (Tauri's docs, wry#583) — "New window" showed a white
// window there (ADR 0069). An async command runs off the main thread.
/// A note in a window of its own: the same UI, which asks which note
/// by its window's label.
#[tauri::command]
#[specta::specta]
pub(crate) async fn open_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<(), ContractError> {
    let n = POPOUTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let label = format!("note-{n}");
    // The note belongs to the folder of the window it came from (ADR 0065).
    let key = state
        .service
        .folder_of(window.label())
        .ok_or_else(no_folder)?;
    state.service.bind(&label, &key);
    let title = path
        .rsplit('/')
        .next()
        .unwrap_or(&path)
        .trim_end_matches(".md")
        .to_owned();
    lock(&state.popouts).insert(label.clone(), path);
    let builder =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(title)
            .min_inner_size(360.0, 400.0);
    sized(&app, builder, (920.0, 720.0), (360.0, 400.0))
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
pub(crate) async fn new_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    same_folder: bool,
) -> Result<(), ContractError> {
    // On this window's folder, or on none: the new window then shows the
    // start page, to open one (ADR 0065).
    let key = if same_folder {
        Some(
            state
                .service
                .folder_of(window.label())
                .ok_or_else(no_folder)?,
        )
    } else {
        None
    };
    open_folder_window(&app, key)
        .map(|_| ())
        .map_err(|e| failed(e.to_string()))
}

/// A window of a folder: `key` the folder it joins, bound before the
/// window starts and asks which folder it shows; none, the start page.
pub(crate) fn open_folder_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: Option<String>,
) -> tauri::Result<String> {
    let n = WINDOWS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let label = format!("window-{n}");
    if let Some(key) = key {
        app.state::<App>().service.bind(&label, &key);
    }
    let made = label.clone();
    // From the main window's configuration, under its own label: the same
    // size, and on macOS the same title bar, whose buttons only a window's
    // configuration places (tauri.macos.conf.json; ADR 0072).
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .unwrap_or_default();
    config.label = label;
    fit_config(app, &mut config);
    open_frameless(
        tauri::WebviewWindowBuilder::from_config(app, &config)?.on_download(on_download),
    )?;
    Ok(made)
}

/// A window's size, fitted to a screen's work area — the screen less its
/// task bar, dock or menu bar — in logical pixels `(x, y, width, height)`.
/// None when the size asked fits: the window keeps it and the system's
/// placement, as on any large screen. Otherwise the largest size that
/// fits, never under the window's minimum, centred in the work area: on a
/// 1280×800 screen (the Windows VM, at 100% or 125%) the first window was
/// taller than the screen and its status bar under the task bar.
pub(crate) fn fit_to_area(
    asked: (f64, f64),
    min: (f64, f64),
    area: (f64, f64, f64, f64),
) -> Option<(f64, f64, f64, f64)> {
    let (x, y, w, h) = area;
    if w <= 0.0 || h <= 0.0 || (asked.0 <= w && asked.1 <= h) {
        return None;
    }
    let width = asked.0.min(w).max(min.0);
    let height = asked.1.min(h).max(min.1);
    Some((
        width,
        height,
        x + ((w - width) / 2.0).max(0.0),
        y + ((h - height) / 2.0).max(0.0),
    ))
}

/// The primary screen's work area in logical pixels, where a new window
/// opens; none when the system does not say. Asked on the main thread:
/// AppKit and GTK answer only there, and a window made by a command is
/// made from another one (run at once when already on it, as at the
/// start).
fn work_area<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<(f64, f64, f64, f64)> {
    // The tests' mock runtime has no screen: its handle panics when asked.
    if cfg!(test) {
        return None;
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let area = handle.primary_monitor().ok().flatten().map(|monitor| {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let at = area.position.to_logical::<f64>(scale);
            let size = area.size.to_logical::<f64>(scale);
            (at.x, at.y, size.width, size.height)
        });
        let _ = tx.send(area);
    })
    .ok()?;
    rx.recv_timeout(std::time::Duration::from_secs(2))
        .ok()
        .flatten()
}

/// A window's size asked, fitted to the screen (`fit_to_area`): what the
/// builder is given, and where, when it had to change.
pub(crate) fn fitted<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    asked: (f64, f64),
    min: (f64, f64),
) -> Option<(f64, f64, f64, f64)> {
    let area = work_area(app)?;
    let fit = fit_to_area(asked, min, area)?;
    log::write(
        "INFO",
        "host",
        &format!(
            "window fitted to the screen: {:.0}×{:.0} asked, {:.0}×{:.0} given in a work area of {:.0}×{:.0}",
            asked.0, asked.1, fit.0, fit.1, area.2, area.3
        ),
    );
    Some(fit)
}

/// A folder's window configuration fitted to the screen (`fitted`).
pub(crate) fn fit_config<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    config: &mut tauri::utils::config::WindowConfig,
) {
    let min = (
        config.min_width.unwrap_or(0.0),
        config.min_height.unwrap_or(0.0),
    );
    if let Some((width, height, x, y)) = fitted(app, (config.width, config.height), min) {
        config.width = width;
        config.height = height;
        config.x = Some(x);
        config.y = Some(y);
        config.center = false;
    }
}

/// A builder given a size fitted to the screen (`fitted`): the size asked
/// on a large one.
pub(crate) fn sized<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    app: &tauri::AppHandle<R>,
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
    asked: (f64, f64),
    min: (f64, f64),
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    match fitted(app, asked, min) {
        Some((width, height, x, y)) => builder.inner_size(width, height).position(x, y),
        None => builder.inner_size(asked.0, asked.1),
    }
}

/// A folder's window without the system's title bar (ADR 0072). On macOS
/// the window's configuration does it (tauri.macos.conf.json: the title bar
/// overlaid; the buttons' position asked there, centred in the app's top
/// row, is kept for a Tauri that applies it — on macOS 26 they stay at the
/// system's place, inside the corner frame.ts keeps either way; a
/// webview's own position is ignored where child web views are on, as
/// here); on Windows and, since its port, on Linux (ADR 0071; the
/// maintainer, 2026-10-09: on GNOME and KDE the system's bar was "muito
/// espaço inútil") the app draws its own buttons (app/ui/src/frame.ts); a
/// note's popout and a web page's window keep theirs everywhere.
pub(crate) fn frameless<R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'_, R, M>,
) -> tauri::WebviewWindowBuilder<'_, R, M> {
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let builder = builder.decorations(false);
    builder
}

/// Build a folder's window without the system's title bar (`frameless`).
/// On Linux it is built hidden and shown once built: GTK settles a
/// window's decorations with the compositor when the window first shows,
/// and tao shows it before it turns them off — KDE's KWin then kept its own
/// title bar above the app's (tao's issue "with_decorations(false) doesn't
/// work on wayland kde", seen on Fedora 44 on 2026-10-09). Every folder's
/// window is configured visible (tauri.conf.json), so showing it here
/// overrides nothing.
pub(crate) fn open_frameless<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::Result<tauri::WebviewWindow<R>> {
    #[cfg(target_os = "linux")]
    let builder = builder.visible(false);
    let window = frameless(builder).build()?;
    #[cfg(target_os = "linux")]
    window.show()?;
    Ok(window)
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
        let key = state.service.folder_of(window.label());
        let mut folder_windows: Vec<String> = state
            .service
            .clients()
            .into_iter()
            .filter(|(l, k)| Some(k) == key.as_ref() && (l == "main" || l.starts_with("window-")))
            .map(|(l, _)| l)
            .collect();
        folder_windows.sort_by_key(|l| (l != "main", l.clone()));
        folder_windows
            .into_iter()
            .next()
            .unwrap_or_else(|| "main".to_owned())
    };
    app.emit("open-note", (home.clone(), path))
        .map_err(|e| failed(e.to_string()))?;
    if let Some(w) = app.get_window(&home) {
        let _ = w.set_focus();
    }
    lock(&state.popouts).remove(window.label());
    session::closing(
        window.label(),
        "return_to_main (a note back to its folder's window)",
    );
    window.close().map_err(|e| failed(e.to_string()))
}
