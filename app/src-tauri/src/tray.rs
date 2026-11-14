//! The mark of "this app is a server" in the menu bar (macOS) or the
//! notification area (Windows), ADR 0096 item 1, built on 2026-10-15 at the
//! maintainer's word ("aceito todas recomendações"): while the app serves
//! to a phone, nothing listens without being visible outside the window
//! too. A tray icon with the app's mark, and a menu — how many folders it
//! serves, the internet link while it is on (ADR 0117 D3 item 6), *Stop*
//! (the link and serving), *Open Settings*. It exists only while serving: stopping
//! (from the menu, from Settings, by itself when the network changes, or
//! with the app) removes it.
//!
//! Not on Linux: Tauri's tray there loads `libayatana-appindicator` at run
//! time, a native library the packages do not depend on and that GNOME does
//! not show without an extension (ADR 0096 item 1 keeps the status bar's
//! mark and Settings there, which every system has).
//!
//! The words come in the window's language, as the native menu's do; the
//! icon is a template image on macOS (the system tints it for the light and
//! dark menu bar) and the app's own icon on Windows, whose area has no
//! templates. The accessible name of the icon is its tooltip, and every
//! item of the menu is plain text a screen reader reads.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;

use super::*;

/// The tray icon's id: one, ever.
const ID: &str = "verso-serving";
const STOP: &str = "verso-tray-stop";
const SETTINGS: &str = "verso-tray-settings";

/// The mark, as a template: black where the book is, transparent elsewhere
/// (`icons/source/verso-mark.svg`, pages cut out), as raw RGBA, `MARK_SIDE`
/// pixels each way — `icons/tray-template.png` decoded, so that no image
/// decoder joins the tree. Made with, from `icons/`:
/// `python3 -c "from PIL import Image; open('tray-template.rgba','wb').write(Image.open('tray-template.png').convert('RGBA').tobytes())"`.
#[cfg(target_os = "macos")]
const MARK: &[u8] = include_bytes!("../icons/tray-template.rgba");
#[cfg(target_os = "macos")]
const MARK_SIDE: u32 = 72;

/// What the tray says in one language.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Words {
    /// The first, disabled, line of the menu: what is being served.
    pub(crate) serving: String,
    /// A second disabled line while the internet link is on (ADR 0117 D3
    /// item 6: while on, always visible).
    pub(crate) link: Option<&'static str>,
    pub(crate) stop: &'static str,
    pub(crate) settings: &'static str,
    /// The icon's tooltip and accessible name: what it is, what it serves
    /// and how many phones are connected.
    pub(crate) tooltip: String,
}

/// The tray's words for `folders` served and `phones` connected, the
/// internet `link` on or not, in `lang` ("en", or anything else for pt-BR,
/// the product's own).
pub(crate) fn words(lang: &str, folders: usize, phones: u32, link: bool) -> Words {
    if lang == "en" {
        let folders = match folders {
            1 => "1 folder".to_owned(),
            n => format!("{n} folders"),
        };
        let phones = match phones {
            0 => "no phone connected".to_owned(),
            1 => "1 phone connected".to_owned(),
            n => format!("{n} phones connected"),
        };
        Words {
            serving: format!("Serving {folders}…"),
            link: link.then_some("Internet link on"),
            stop: "Stop",
            settings: "Open Settings",
            tooltip: if link {
                format!("Verso is serving {folders}, by an internet link too, {phones}")
            } else {
                format!("Verso is serving {folders} to your phone, {phones}")
            },
        }
    } else {
        let folders = match folders {
            1 => "1 pasta".to_owned(),
            n => format!("{n} pastas"),
        };
        let phones = match phones {
            0 => "nenhum celular conectado".to_owned(),
            1 => "1 celular conectado".to_owned(),
            n => format!("{n} celulares conectados"),
        };
        Words {
            serving: format!("Servindo {folders}…"),
            link: link.then_some("Link pela internet ligado"),
            stop: "Parar",
            settings: "Abrir Ajustes",
            tooltip: if link {
                format!("O Verso está servindo {folders}, também por um link na internet, {phones}")
            } else {
                format!("O Verso está servindo {folders} ao seu celular, {phones}")
            },
        }
    }
}

/// What the tray follows: whether the server serves, how many folders it
/// serves and how many phones are connected.
struct Serving {
    on: bool,
    folders: usize,
    phones: u32,
    link: bool,
}

/// Make the tray agree with the server, after any change of it (`Changed`,
/// `Stopped`… of `verso_server::local::Event`): off the thread that said
/// it, which may hold the server's locks, and on the main thread for the
/// system's part.
pub(crate) fn follow<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some((on, folders, phones)) = local_server::serving_now(&app) else {
            return;
        };
        let serving = Serving {
            on,
            folders,
            phones,
            link: crate::tunnel::link_up(&app),
        };
        let main = app.clone();
        let _ = app.run_on_main_thread(move || show(&main, &serving));
    });
}

/// What the icon must do to agree with the server.
#[derive(Debug, PartialEq, Eq)]
enum Plan {
    /// Not serving, and no icon: nothing.
    Nothing,
    /// Not serving: the icon goes.
    Remove,
    /// Serving, and no icon yet: it appears.
    Make,
    /// Serving, and the icon is there: its words are updated in place.
    Update,
}

fn plan(serving: bool, shown: bool) -> Plan {
    match (serving, shown) {
        (false, false) => Plan::Nothing,
        (false, true) => Plan::Remove,
        (true, false) => Plan::Make,
        (true, true) => Plan::Update,
    }
}

/// Draw, update or remove the icon. On the main thread.
fn show<R: tauri::Runtime>(app: &tauri::AppHandle<R>, serving: &Serving) {
    let shown = app.tray_by_id(ID);
    if plan(serving.on, shown.is_some()) == Plan::Remove {
        let _ = app.remove_tray_by_id(ID);
    }
    if !serving.on {
        return;
    }
    let lang = lock(&app.state::<App>().menu_language).clone();
    let say = words(&lang, serving.folders, serving.phones, serving.link);
    let Ok(menu) = menu_of(app, &say) else {
        log::write("WARN", "host", "the tray's menu could not be made");
        return;
    };
    if let Some(tray) = shown {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_tooltip(Some(say.tooltip));
        return;
    }
    let built = TrayIconBuilder::with_id(ID)
        .icon(mark(app))
        .icon_as_template(true)
        .tooltip(say.tooltip)
        .menu(&menu)
        .on_menu_event(|app, event| answer(app, event.id().as_ref()))
        .build(app);
    if let Err(why) = built {
        log::write(
            "WARN",
            "host",
            &format!("the tray's icon could not be made: {why}"),
        );
    }
}

fn menu_of<R: tauri::Runtime>(app: &tauri::AppHandle<R>, say: &Words) -> tauri::Result<Menu<R>> {
    // Lines of information, not commands.
    let serving = MenuItem::new(app, &say.serving, false, None::<&str>)?;
    let link = say
        .link
        .map(|l| MenuItem::new(app, l, false, None::<&str>))
        .transpose()?;
    let separator = PredefinedMenuItem::separator(app)?;
    let stop = MenuItem::with_id(app, STOP, say.stop, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, SETTINGS, say.settings, true, None::<&str>)?;
    let mut items: Vec<&dyn tauri::menu::IsMenuItem<R>> = vec![&serving];
    if let Some(l) = &link {
        items.push(l);
    }
    items.extend([
        &separator as &dyn tauri::menu::IsMenuItem<R>,
        &stop,
        &settings,
    ]);
    Menu::with_items(app, &items)
}

/// The mark: a template on macOS, the app's own icon on Windows.
fn mark<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Image<'static> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        Image::new_owned(MARK.to_vec(), MARK_SIDE, MARK_SIDE)
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.default_window_icon()
            .cloned()
            .map(Image::to_owned)
            .unwrap_or_else(|| Image::new_owned(vec![0, 0, 0, 0], 1, 1))
    }
}

/// A click on the menu: *Stop* stops the server, *Open Settings* brings a
/// window forward and shows the section.
fn answer<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str) {
    match id {
        STOP => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                // The window's mark and the tray follow the stop: the server
                // says `Changed` itself (`platform::server`'s sink).
                local_server::stop_now(&app);
            });
        }
        SETTINGS => {
            let windows = app.webview_windows();
            if let Some(w) = windows
                .get("main")
                .cloned()
                .or_else(|| windows.into_values().next())
            {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
                let _ = app.emit("tray-settings", w.label().to_owned());
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn the_mark_is_a_template_with_a_book_in_it() {
        assert_eq!(MARK.len(), (MARK_SIDE * MARK_SIDE * 4) as usize);
        let alphas: Vec<u8> = MARK.chunks(4).map(|p| p[3]).collect();
        assert!(alphas.contains(&0), "transparent around the book");
        assert!(alphas.contains(&255), "opaque where the book is");
        // A template carries its shape in the alpha alone: every pixel black.
        assert!(MARK.chunks(4).all(|p| p[..3] == [0, 0, 0]));
    }

    #[test]
    fn the_tray_speaks_the_windows_language() {
        let pt = words("pt", 2, 1, false);
        assert_eq!(pt.serving, "Servindo 2 pastas…");
        assert_eq!((pt.stop, pt.settings), ("Parar", "Abrir Ajustes"));
        assert!(pt.tooltip.contains("1 celular conectado"), "{}", pt.tooltip);
        let en = words("en", 2, 0, false);
        assert_eq!(en.serving, "Serving 2 folders…");
        assert_eq!((en.stop, en.settings), ("Stop", "Open Settings"));
        assert!(en.tooltip.contains("no phone connected"), "{}", en.tooltip);
    }

    #[test]
    fn one_folder_is_singular_and_every_name_is_there_for_a_screen_reader() {
        assert_eq!(words("pt", 1, 0, false).serving, "Servindo 1 pasta…");
        assert_eq!(words("en", 1, 3, false).serving, "Serving 1 folder…");
        for lang in ["pt", "en"] {
            let w = words(lang, 3, 2, false);
            assert!(!w.tooltip.is_empty() && !w.stop.is_empty() && !w.settings.is_empty());
        }
    }

    #[test]
    fn the_internet_link_is_said_on_its_own_line_and_in_the_tooltip() {
        let pt = words("pt", 1, 0, true);
        assert_eq!(pt.link, Some("Link pela internet ligado"));
        assert!(pt.tooltip.contains("link na internet"), "{}", pt.tooltip);
        let en = words("en", 1, 0, true);
        assert_eq!(en.link, Some("Internet link on"));
        assert!(en.tooltip.contains("internet link"), "{}", en.tooltip);
        assert_eq!(words("en", 1, 0, false).link, None);
    }

    #[test]
    fn the_icon_exists_only_while_serving() {
        assert_eq!(plan(true, false), Plan::Make);
        // A phone connecting, a folder list or the language changing:
        // updated in place, still one icon.
        assert_eq!(plan(true, true), Plan::Update);
        // Stopped, from the menu, Settings, the network or the app's end.
        assert_eq!(plan(false, true), Plan::Remove);
        // Stopping twice, or with no icon, is no error.
        assert_eq!(plan(false, false), Plan::Nothing);
    }
}
