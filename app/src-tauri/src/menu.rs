//! The native menu, in the interface's language, and what its items do.

use super::*;

/// The window's language, for the native menu ("pt" or "en"); pushed at
/// start-up and when the setting changes.
#[tauri::command]
#[specta::specta]
pub(crate) fn set_menu_language<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, App>,
    language: String,
) -> Result<(), ContractError> {
    *lock(&state.menu_language) = language;
    #[cfg(target_os = "macos")]
    refresh_menu(&app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(())
}

/// The id of the app menu's own Quit item.
#[cfg(target_os = "macos")]
pub(crate) const QUIT: &str = "verso-quit";

/// The id of the File menu's "New Window" item: another window — on the
/// open folder, or an empty one that offers the picker when none is
/// open. No shortcut of its own — ⌘⇧N is the window's "new note…" — one
/// can be bound in the settings.
#[cfg(target_os = "macos")]
pub(crate) const NEW_WINDOW: &str = "verso-new-window";

/// The id of "Open Folder…": the window's own picker flow, asked for
/// from the menu.
#[cfg(target_os = "macos")]
pub(crate) const OPEN_FOLDER: &str = "verso-open-folder";

/// The id of "Settings…" (⌘,), which the main window answers.
#[cfg(target_os = "macos")]
pub(crate) const SETTINGS: &str = "verso-settings";

/// The prefix of the Edit menu's Undo, Redo and Select All: the system's
/// own items run the web view's editing command, which does nothing on a
/// board, and they take ⌘Z, ⌘⇧Z and ⌘A before the page sees the key. These
/// tell the focused window instead (`menu-edit`), which runs the editing
/// command where the focus is, or hands the key to the board.
#[cfg(target_os = "macos")]
pub(crate) const EDIT_PREFIX: &str = "verso-edit-";

/// The script that runs an Edit menu command in a web page, where the
/// page has the focus and only there: the web view's own `undo`, `redo` or
/// `selectAll`, as the system's item would have run it.
#[cfg(target_os = "macos")]
pub(crate) fn page_edit(command: &str) -> String {
    let name = match command {
        "redo" => "redo",
        "select-all" => "selectAll",
        _ => "undo",
    };
    format!("document.hasFocus() && document.execCommand('{name}')")
}

/// The window that has the focus, if one of the app's has it. Every
/// window, not only the `WebviewWindow`s: one that shows a site inside it
/// holds child web views and is no longer counted as one, and the menu
/// went deaf in it — no ⌘W, ⌘Z or console.
#[cfg(target_os = "macos")]
pub(crate) fn focused_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<tauri::Window<R>> {
    app.windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
}

/// The id of View › Open console (⌥⌘I): the focused window is told
/// (`menu-devtools`), and opens its inspector if its setting allows it.
#[cfg(target_os = "macos")]
pub(crate) const DEVTOOLS: &str = "verso-devtools";

/// The id of File › Close Tab (⌘W). The system's Close Window took ⌘W
/// before the page saw it, so the window's "close tab" never ran, and with
/// one window open ⌘W quit the app; the focused window is told instead
/// (`menu-close-tab`).
#[cfg(target_os = "macos")]
pub(crate) const CLOSE_TAB: &str = "verso-close-tab";

/// The id of File › Close Window, with no key of its own: ⌘W closes a tab.
#[cfg(target_os = "macos")]
pub(crate) const CLOSE_WINDOW: &str = "verso-close-window";

/// The prefix of an "Open Recent" item's id; the rest is the item's
/// index into `App::menu_recents`.
#[cfg(target_os = "macos")]
pub(crate) const RECENT_PREFIX: &str = "verso-recent-";

/// The menu's words in the window's language ("pt" is the default, as
/// the product's; ADR 0035). Predefined items keep the system's own.
#[cfg(target_os = "macos")]
fn menu_label(lang: &str, key: &str) -> &'static str {
    let pt = lang != "en";
    match key {
        "quit" => {
            if pt {
                "Encerrar o Verso"
            } else {
                "Quit Verso"
            }
        }
        "settings" => {
            if pt {
                "Ajustes…"
            } else {
                "Settings…"
            }
        }
        "file" => {
            if pt {
                "Arquivo"
            } else {
                "File"
            }
        }
        "new-window" => {
            if pt {
                "Nova janela"
            } else {
                "New Window"
            }
        }
        "open-folder" => {
            if pt {
                "Abrir pasta…"
            } else {
                "Open Folder…"
            }
        }
        "open-recent" => {
            if pt {
                "Abrir recente"
            } else {
                "Open Recent"
            }
        }
        "close-tab" => {
            if pt {
                "Fechar aba"
            } else {
                "Close Tab"
            }
        }
        "close-window" => {
            if pt {
                "Fechar janela"
            } else {
                "Close Window"
            }
        }
        "edit" => {
            if pt {
                "Edição"
            } else {
                "Edit"
            }
        }
        "undo" => {
            if pt {
                "Desfazer"
            } else {
                "Undo"
            }
        }
        "redo" => {
            if pt {
                "Refazer"
            } else {
                "Redo"
            }
        }
        "select-all" => {
            if pt {
                "Selecionar tudo"
            } else {
                "Select All"
            }
        }
        "devtools" => {
            if pt {
                "Abrir console"
            } else {
                "Open Console"
            }
        }
        "view" => {
            if pt {
                "Visualização"
            } else {
                "View"
            }
        }
        "window" => {
            if pt {
                "Janela"
            } else {
                "Window"
            }
        }
        _ => "",
    }
}

/// The macOS menu bar: the system's own items, except Quit and the Edit
/// menu's Undo, Redo and Select All (`EDIT_PREFIX`). The system's Quit
/// terminates the process without an event the app can answer (the run
/// loop goes from ready to exit), so what was typed since the last
/// autosave was lost; this Quit, on the same ⌘Q, asks the windows to save
/// first (`on_event`).
#[cfg(target_os = "macos")]
pub(crate) fn app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
    let (lang, recents) = {
        let state = app.state::<App>();
        let lang = lock(&state.menu_language).clone();
        // The menu's recents come from the index sidecars: the folders
        // opened before, freshest first (verso_core::recent_folders).
        // What the menu shows and what a click opens are the same list,
        // kept here so the id `verso-recent-<i>` stays meaningful.
        let recents = verso_core::recent_folders(state.service.config());
        let mut keep = lock(&state.menu_recents);
        keep.clear();
        keep.extend(recents.iter().take(9).cloned());
        (lang, keep.clone())
    };
    let l = |key: &str| menu_label(&lang, key);
    let quit = MenuItem::with_id(app, QUIT, l("quit"), true, Some("CmdOrCtrl+Q"))?;
    let verso = Submenu::with_items(
        app,
        "Verso",
        true,
        &[
            &PredefinedMenuItem::about(
                app,
                None,
                Some(tauri::menu::AboutMetadata {
                    // macOS shows "Version <version> (<short_version>)": the
                    // version, then the commit in parentheses as the build.
                    version: Some(env!("CARGO_PKG_VERSION").to_owned()),
                    short_version: Some(env!("VERSO_COMMIT").to_owned()),
                    ..Default::default()
                }),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, SETTINGS, l("settings"), true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    // Each recent folder by its name, the parent in parentheses to tell
    // two "Notas" apart; the id carries the index into `menu_recents`.
    let mut recent_items: Vec<MenuItem<R>> = Vec::new();
    for (i, folder) in recents.iter().enumerate() {
        let name = folder
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| folder.to_string_lossy().into_owned());
        let parent = folder
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        let home = std::env::var("HOME").unwrap_or_default();
        let parent = if !home.is_empty() && parent.starts_with(&home) {
            parent.replacen(&home, "~", 1)
        } else {
            parent
        };
        let text = if parent.is_empty() {
            name
        } else {
            format!("{name} ({parent})")
        };
        recent_items.push(MenuItem::with_id(
            app,
            format!("{RECENT_PREFIX}{i}"),
            text,
            true,
            None::<&str>,
        )?);
    }
    let recent_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = recent_items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    let open_recent =
        Submenu::with_items(app, l("open-recent"), !recents.is_empty(), &recent_refs)?;
    let file = Submenu::with_items(
        app,
        l("file"),
        true,
        &[
            &MenuItem::with_id(app, NEW_WINDOW, l("new-window"), true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                OPEN_FOLDER,
                l("open-folder"),
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &open_recent,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, CLOSE_TAB, l("close-tab"), true, Some("CmdOrCtrl+W"))?,
            &MenuItem::with_id(app, CLOSE_WINDOW, l("close-window"), true, None::<&str>)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        l("edit"),
        true,
        &[
            &MenuItem::with_id(
                app,
                format!("{EDIT_PREFIX}undo"),
                l("undo"),
                true,
                Some("CmdOrCtrl+Z"),
            )?,
            &MenuItem::with_id(
                app,
                format!("{EDIT_PREFIX}redo"),
                l("redo"),
                true,
                Some("CmdOrCtrl+Shift+Z"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &MenuItem::with_id(
                app,
                format!("{EDIT_PREFIX}select-all"),
                l("select-all"),
                true,
                Some("CmdOrCtrl+A"),
            )?,
        ],
    )?;
    let view = Submenu::with_items(
        app,
        l("view"),
        true,
        &[
            &PredefinedMenuItem::fullscreen(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, DEVTOOLS, l("devtools"), true, Some("CmdOrCtrl+Alt+I"))?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        l("window"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;
    #[cfg(target_os = "macos")]
    window.set_as_windows_menu_for_nsapp()?;
    Menu::with_items(app, &[&verso, &file, &edit, &view, &window])
}

/// Build the menu again — the recents moved, or the language did. Menu
/// items exist on the main thread only, so the work is sent there; an
/// app without a menu bar (the tests' mock runtime) is left alone.
#[cfg(target_os = "macos")]
pub(crate) fn refresh_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if app.menu().is_none() {
        return;
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(menu) = app_menu(&handle) {
            let _ = handle.set_menu(menu);
        }
    });
}
