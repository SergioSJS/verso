//! The native menu, in the interface's language, and what its items do.

use super::menu_spec;
#[cfg(target_os = "macos")]
use super::menu_spec::{Own, Row, System};
use super::*;

/// What the window last pushed about itself: the features that are on,
/// the keys bound to commands (already as accelerators) and the commands
/// that can run just now. `enabled` is `None` until the window says.
#[derive(Default, Clone)]
pub(crate) struct MenuState {
    pub(crate) features: std::collections::HashSet<String>,
    pub(crate) keys: std::collections::HashMap<String, String>,
    pub(crate) enabled: Option<std::collections::HashSet<String>>,
}

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
    // The tray's words follow the language too (when it is showing).
    #[cfg(any(target_os = "macos", windows))]
    crate::tray::follow(&app);
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = app;
    Ok(())
}

/// The menus of the in-window menu of Windows and Linux, in the window's
/// language (`menu_spec::window_menu`): the same menus as the Mac bar,
/// from the same data, the rows whose feature is off already left out. The
/// window greys those the palette cannot run and writes the keys as bound.
#[tauri::command]
#[specta::specta]
pub(crate) fn menu_sections(
    language: String,
    features: Vec<String>,
) -> Vec<menu_spec::MenuSection> {
    let state = MenuState {
        features: features.into_iter().collect(),
        ..MenuState::default()
    };
    menu_spec::window_menu(&language, &state)
}

/// Quit from the in-window menu (File › Quit): the windows are asked to
/// save their tabs first, as the Mac's Quit and the last window's close do.
#[tauri::command]
#[specta::specta]
pub(crate) fn quit_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    ask_windows_to_quit(&app);
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

/// The id of "Open File…" (ADR 0114 item 20): the system's picker for one
/// Markdown file, run by the host.
#[cfg(target_os = "macos")]
pub(crate) const OPEN_FILE: &str = "verso-open-file";

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
/// went deaf in it — no ⌘W, ⌘Z or console. The loose-files routing asks it
/// on every system (ADR 0114).
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

/// The id prefix of the "Open Recent" items that are files (ADR 0114 Q4):
/// `verso-recent-file-<i>`, an index into `App::menu_recent_files`.
#[cfg(target_os = "macos")]
pub(crate) const RECENT_FILE_PREFIX: &str = "verso-recent-file-";

/// The menu's words in the window's language (`menu_spec::word`).
#[cfg(target_os = "macos")]
fn menu_label(lang: &str, key: &str) -> &'static str {
    menu_spec::word(lang, key)
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
    let (lang, recents, menu_state) = {
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
        // And the files opened without a folder (ADR 0114 Q4), a group
        // under the folders.
        let files = verso_core::session::recent_files(state.service.config());
        let mut keep_files = lock(&state.menu_recent_files);
        keep_files.clear();
        keep_files.extend(files.iter().cloned());
        (
            lang,
            (keep.clone(), keep_files.clone()),
            lock(&state.menu_state).clone(),
        )
    };
    let (recents, recent_files) = recents;
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
    let mut recent_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = recent_items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    let mut file_items: Vec<MenuItem<R>> = Vec::new();
    for (i, file) in recent_files.iter().enumerate() {
        let name = file
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let place = file
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let text = if place.is_empty() {
            name
        } else {
            format!("{name} ({place})")
        };
        file_items.push(MenuItem::with_id(
            app,
            format!("{RECENT_FILE_PREFIX}{i}"),
            text,
            true,
            None::<&str>,
        )?);
    }
    let between = PredefinedMenuItem::separator(app)?;
    if !recents.is_empty() && !file_items.is_empty() {
        recent_refs.push(&between);
    }
    recent_refs.extend(
        file_items
            .iter()
            .map(|i| i as &dyn tauri::menu::IsMenuItem<R>),
    );
    let open_recent = Submenu::with_items(
        app,
        l("open-recent"),
        !recents.is_empty() || !recent_files.is_empty(),
        &recent_refs,
    )?;
    let mut menus: Vec<Submenu<R>> = vec![verso];
    for (key, rows) in menu_spec::sections() {
        let title = menu_spec::title(&lang, key);
        let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<R>>> = Vec::new();
        for row in menu_spec::visible(&rows, &menu_state) {
            let item: Box<dyn tauri::menu::IsMenuItem<R>> = match row {
                Row::Sep => Box::new(PredefinedMenuItem::separator(app)?),
                Row::System(System::Cut) => Box::new(PredefinedMenuItem::cut(app, None)?),
                Row::System(System::Copy) => Box::new(PredefinedMenuItem::copy(app, None)?),
                Row::System(System::Paste) => Box::new(PredefinedMenuItem::paste(app, None)?),
                Row::System(System::Fullscreen) => {
                    Box::new(PredefinedMenuItem::fullscreen(app, None)?)
                }
                Row::System(System::Minimize) => Box::new(PredefinedMenuItem::minimize(app, None)?),
                Row::System(System::Maximize) => Box::new(PredefinedMenuItem::maximize(app, None)?),
                Row::Own(Own::NewWindow) => Box::new(MenuItem::with_id(
                    app,
                    NEW_WINDOW,
                    l("new-window"),
                    true,
                    None::<&str>,
                )?),
                Row::Own(Own::OpenFolder) => {
                    // The key the window binds to its command "open-folder"
                    // (keys.ts, ⌘O unless the person changed it), as every
                    // command row takes it: never a key of the bar's own.
                    let accelerator = menu_state.keys.get("open-folder").map(String::as_str);
                    let text = l("open-folder");
                    Box::new(
                        MenuItem::with_id(app, OPEN_FOLDER, text, true, accelerator).or_else(
                            |_| MenuItem::with_id(app, OPEN_FOLDER, text, true, None::<&str>),
                        )?,
                    )
                }
                Row::Own(Own::OpenFile) => Box::new(MenuItem::with_id(
                    app,
                    OPEN_FILE,
                    l("open-file"),
                    true,
                    None::<&str>,
                )?),
                Row::Own(Own::OpenRecent) => Box::new(open_recent.clone()),
                Row::Own(Own::CloseTab) => Box::new(MenuItem::with_id(
                    app,
                    CLOSE_TAB,
                    l("close-tab"),
                    true,
                    Some("CmdOrCtrl+W"),
                )?),
                Row::Own(Own::CloseWindow) => Box::new(MenuItem::with_id(
                    app,
                    CLOSE_WINDOW,
                    l("close-window"),
                    true,
                    None::<&str>,
                )?),
                Row::Own(Own::Undo) => Box::new(MenuItem::with_id(
                    app,
                    format!("{EDIT_PREFIX}undo"),
                    l("undo"),
                    true,
                    Some("CmdOrCtrl+Z"),
                )?),
                Row::Own(Own::Redo) => Box::new(MenuItem::with_id(
                    app,
                    format!("{EDIT_PREFIX}redo"),
                    l("redo"),
                    true,
                    Some("CmdOrCtrl+Shift+Z"),
                )?),
                Row::Own(Own::SelectAll) => Box::new(MenuItem::with_id(
                    app,
                    format!("{EDIT_PREFIX}select-all"),
                    l("select-all"),
                    true,
                    Some("CmdOrCtrl+A"),
                )?),
                Row::Own(Own::Devtools) => Box::new(MenuItem::with_id(
                    app,
                    DEVTOOLS,
                    l("devtools"),
                    true,
                    Some("CmdOrCtrl+Alt+I"),
                )?),
                Row::Command(id, _) => {
                    let text = menu_spec::label(&lang, id);
                    let enabled = menu_spec::is_enabled(&menu_state, id);
                    let item_id = menu_spec::item_id(id);
                    // A key the platform cannot parse leaves the item with
                    // no key instead of leaving the bar without the menu.
                    let accelerator = menu_state.keys.get(id).map(String::as_str);
                    Box::new(
                        MenuItem::with_id(app, &item_id, text, enabled, accelerator).or_else(
                            |_| MenuItem::with_id(app, &item_id, text, enabled, None::<&str>),
                        )?,
                    )
                }
            };
            items.push(item);
        }
        let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = items.iter().map(AsRef::as_ref).collect();
        let submenu = Submenu::with_items(app, title, true, &refs)?;
        if key == "window" {
            submenu.set_as_windows_menu_for_nsapp()?;
        }
        menus.push(submenu);
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = menus
        .iter()
        .map(|m| m as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    Menu::with_items(app, &refs)
}

/// Set one command's item enabled or not, in the bar as it stands: no
/// rebuild, so the window can say it at every change of tab.
#[cfg(target_os = "macos")]
fn set_enabled_in<R: tauri::Runtime>(items: Vec<tauri::menu::MenuItemKind<R>>, state: &MenuState) {
    for kind in items {
        match &kind {
            tauri::menu::MenuItemKind::Submenu(sub) => {
                if let Ok(inner) = sub.items() {
                    set_enabled_in(inner, state);
                }
            }
            tauri::menu::MenuItemKind::MenuItem(item) => {
                if let Some(command) = item.id().as_ref().strip_prefix(menu_spec::COMMAND_PREFIX) {
                    let _ = item.set_enabled(menu_spec::is_enabled(state, command));
                }
            }
            _ => {}
        }
    }
}

/// What the window says about itself for the menu: the features that are
/// on and the keys bound to commands (a change rebuilds the bar, as a
/// change of language does).
#[tauri::command]
#[specta::specta]
pub(crate) fn set_menu_commands<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, App>,
    features: Vec<String>,
    keys: std::collections::HashMap<String, String>,
) -> Result<(), ContractError> {
    {
        let mut menu = lock(&state.menu_state);
        let features: std::collections::HashSet<String> = features.into_iter().collect();
        if menu.features == features && menu.keys == keys {
            return Ok(());
        }
        menu.features = features;
        menu.keys = keys;
    }
    #[cfg(target_os = "macos")]
    refresh_menu(&app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(())
}

/// The commands that can run just now (the palette's own list, from the
/// window in focus): the other items are greyed, in place.
#[tauri::command]
#[specta::specta]
pub(crate) fn set_menu_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, App>,
    enabled: Vec<String>,
) -> Result<(), ContractError> {
    let snapshot = {
        let mut menu = lock(&state.menu_state);
        let enabled: std::collections::HashSet<String> = enabled.into_iter().collect();
        if menu.enabled.as_ref() == Some(&enabled) {
            return Ok(());
        }
        menu.enabled = Some(enabled);
        menu.clone()
    };
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(menu) = handle.menu()
                && let Ok(items) = menu.items()
            {
                set_enabled_in(items, &snapshot);
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, snapshot);
    Ok(())
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
