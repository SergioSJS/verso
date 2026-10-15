//! Web pages: the child web views of web notes and embeds, what they may
//! navigate to, and links opened outside.

use super::*;

/// Every web view and web window gets its label here, from one counter,
/// so two windows never hand out the same label.
static WEB_SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

fn next_web_label() -> String {
    format!(
        "web-{}",
        WEB_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    )
}

/// What a web page may navigate to: the web, and nothing of the app's.
/// A page that could load `verso://` or `tauri://` would become a local
/// document in the eyes of Tauri's access control.
fn web_only(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

/// Whether `url` is one of the app's own pages: `tauri://localhost` on
/// macOS and Linux, `http(s)://tauri.localhost` on Windows.
fn is_app_url(url: &tauri::Url) -> bool {
    matches!(
        (url.scheme(), url.host_str()),
        ("tauri", Some("localhost")) | ("http" | "https", Some("tauri.localhost"))
    )
}

/// Whether `url` is the folder's file protocol (`verso://localhost`, or
/// `http(s)://verso.localhost` on Windows).
fn is_file_url(url: &tauri::Url) -> bool {
    matches!(
        (url.scheme(), url.host_str()),
        ("verso", Some("localhost")) | ("http" | "https", Some("verso.localhost"))
    )
}

/// Where each web view of this app may navigate (the reading of the
/// Phase 2 host): an app view — the main window or a note popped out —
/// stays on the app's own pages (plus the dev server's, in a debug
/// build) and the folder's file protocol, so a `<form>`, an `<area>`, a
/// meta refresh or a link annotation in a PDF cannot take it to a remote
/// page; a web view (`web-*`) keeps to the web; anything else goes
/// nowhere. `about:blank` is an empty page and is allowed everywhere.
///
/// The file protocol is allowed because the handler is asked for every
/// frame, not only the window's own (wry passes no frame to it): the
/// HTML-file viewer is a frame that loads through the protocol, and a
/// guard that refused it would refuse the viewer. What the protocol
/// serves runs no script (`CSP: sandbox`) and is never a note.
pub(crate) fn may_navigate(label: &str, url: &tauri::Url, dev_url: Option<&tauri::Url>) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    if is_app_view(label) {
        is_app_url(url)
            || is_file_url(url)
            || (cfg!(debug_assertions) && dev_url.is_some_and(|dev| dev.origin() == url.origin()))
    } else if label.starts_with("web-") {
        web_only(url)
    } else {
        false
    }
}

/// The navigation guard as a plugin: a plugin's `on_navigation` is asked
/// for every web view, the main window included, which a builder's own
/// handler cannot reach.
pub(crate) fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("verso-navigation")
        .on_navigation(|webview, url| {
            let dev_url = webview.app_handle().config().build.dev_url.clone();
            may_navigate(webview.label(), url, dev_url.as_ref())
        })
        .build()
}

/// Open the web inspector — console, elements, network — of the window
/// that asks: View › Open console (⌥⌘I), in the installed app as in
/// development (ADR 0051, 2026-09-30). The window asks only when its
/// setting allows it. The web view, not a `WebviewWindow`: a window
/// that shows a site inside it (a web note, an embed) holds child web
/// views, and Tauri no longer counts it as one — the command failed
/// there with "current webview is not a WebviewWindow".
#[tauri::command]
#[specta::specta]
pub(crate) fn open_devtools<R: tauri::Runtime>(webview: tauri::Webview<R>) {
    webview.open_devtools();
}

/// Open a web page in a window of its own inside the app: a note with a
/// `url` property is the bookmark, this is the browser. Only `http(s)`;
/// the page cannot navigate anywhere else, nor open windows.
#[tauri::command]
#[specta::specta]
pub(crate) async fn open_url<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
) -> Result<(), ContractError> {
    let parsed = http_url(&url)?;
    let title = parsed.host_str().unwrap_or("web").to_owned();
    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        next_web_label(),
        tauri::WebviewUrl::External(parsed),
    )
    .user_agent(WEB_USER_AGENT)
    .title(title);
    sized(&app, builder, (1100.0, 800.0), (0.0, 0.0))
        .on_navigation(web_only)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()
        .map_err(|e| failed(e.to_string()))?;
    Ok(())
}

/// A web view this process opened for the calling window, or `refused`:
/// a window moves, hides, closes and steers only its own pages, and never
/// an app view.
fn own_web_view<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    state: &State<'_, App>,
    label: &str,
) -> Result<tauri::Webview<R>, ContractError> {
    let owner = lock(&state.web_views).get(label).cloned();
    if owner.as_deref() != Some(window.label()) {
        return Err(refused(format!("{label} is not a web view of this window")));
    }
    window
        .app_handle()
        .get_webview(label)
        .ok_or_else(|| failed(format!("no web view {label}")))
}

/// A child web view is placed from the window's frame; the page's
/// coordinates start under the title bar. The difference, in logical
/// pixels.
fn chrome_offset<R: tauri::Runtime>(window: &tauri::Window<R>) -> f64 {
    let scale = window.scale_factor().unwrap_or(1.0);
    let measured = match (window.outer_position(), window.inner_position()) {
        (Ok(outer), Ok(inner)) => f64::from(inner.y.saturating_sub(outer.y).max(0)) / scale,
        _ => 0.0,
    };
    // macOS reports the same point for both. Its windows have had no
    // title bar since ADR 0072 (the overlay style): the content starts
    // at the window's top, so nothing is added there.
    measured
}

/// The user agent a web page's view presents: Safari's own, current
/// form. WKWebView's default carries no browser token, and a site that
/// sniffs it serves broken pages — YouTube's embed player answers
/// "configuration error" to it, whole and entire.
const WEB_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

fn http_url(url: &str) -> Result<tauri::Url, ContractError> {
    let parsed: tauri::Url = url.parse().map_err(|e| failed(format!("{e}")))?;
    if !web_only(&parsed) {
        return Err(refused("only http(s) pages open here"));
    }
    Ok(parsed)
}

/// Where a web view goes (logical pixels from the window's top-left) and
/// how far its page is scrolled: `scroll_x`/`scroll_y` is, for `web_open`,
/// how far the page is scrolled once it has loaded (the first load only);
/// for `web_bounds`, the change in it since the last call. Zero for a web
/// note's own view, which shows its page whole.
#[derive(Debug, Clone, Copy, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebPlace {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    scroll_x: f64,
    scroll_y: f64,
}

/// The script that scrolls a page by `(dx, dy)`: only two finite numbers
/// go into it, nothing the page or the UI wrote as text.
fn scroll_script(dx: f64, dy: f64) -> Option<String> {
    (dx.is_finite() && dy.is_finite() && (dx != 0.0 || dy != 0.0))
        .then(|| format!("window.scrollBy({dx}, {dy})"))
}

/// A web page inside the window, as a child web view over the area the
/// UI names (logical pixels from the window's top-left): the browser
/// behind a tab whose note holds the address. Only `http(s)`; the page
/// cannot navigate anywhere else, nor open windows. Answers with the
/// label the other `web_*` commands take.
///
/// An embed partly scrolled out of its note is cut to what shows, and its
/// page must show the same part: `scroll_x`/`scroll_y` is how far the page
/// is scrolled once it has loaded (the first load only, not the pages the
/// embed later navigates to).
#[tauri::command]
#[specta::specta]
pub(crate) async fn web_open<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    url: String,
    place: WebPlace,
) -> Result<String, ContractError> {
    let WebPlace {
        x,
        y,
        w,
        h,
        scroll_x,
        scroll_y,
    } = place;
    let url = http_url(&url)?;
    let first_load = std::sync::atomic::AtomicBool::new(true);
    let label = next_web_label();
    // The window that asks hosts the page: the main one, or a note's own.
    let y = y + chrome_offset(&window);
    window
        .add_child(
            tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(url))
                .user_agent(WEB_USER_AGENT)
                .on_navigation(web_only)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_page_load(move |wv, payload| {
                    if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
                        && first_load.swap(false, std::sync::atomic::Ordering::Relaxed)
                        && let Some(script) = scroll_script(scroll_x, scroll_y)
                    {
                        let _ = wv.eval(script);
                    }
                }),
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(w.max(1.0), h.max(1.0)),
        )
        .map_err(|e| failed(e.to_string()))?;
    lock(&state.web_views).insert(label.clone(), window.label().to_owned());
    Ok(label)
}

/// Move and size a web page's view to follow its tab, and scroll its page
/// by `(scroll_x, scroll_y)` — the change in how much of the page lies
/// above/left of the view (an embed cut at its pane's top shows the page
/// from there, as an iframe would). Zero for a web note's own view.
#[tauri::command]
#[specta::specta]
pub(crate) fn web_bounds<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    label: String,
    place: WebPlace,
) -> Result<(), ContractError> {
    let WebPlace {
        x,
        y,
        w,
        h,
        scroll_x,
        scroll_y,
    } = place;
    let wv = own_web_view(&window, &state, &label)?;
    let y = y + chrome_offset(&window);
    wv.set_position(tauri::LogicalPosition::new(x, y))
        .and_then(|()| wv.set_size(tauri::LogicalSize::new(w.max(1.0), h.max(1.0))))
        .and_then(|()| match scroll_script(scroll_x, scroll_y) {
            Some(script) => wv.eval(script),
            None => Ok(()),
        })
        .map_err(|e| failed(e.to_string()))
}

/// Show or hide a web page's view (its tab left the front, an overlay opened).
#[tauri::command]
#[specta::specta]
pub(crate) fn web_visible<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    label: String,
    visible: bool,
) -> Result<(), ContractError> {
    let wv = own_web_view(&window, &state, &label)?;
    (if visible { wv.show() } else { wv.hide() }).map_err(|e| failed(e.to_string()))
}

/// Close a web page's view (its tab closed).
#[tauri::command]
#[specta::specta]
pub(crate) fn web_close<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    label: String,
) -> Result<(), ContractError> {
    let wv = own_web_view(&window, &state, &label)?;
    lock(&state.web_views).remove(&label);
    wv.close().map_err(|e| failed(e.to_string()))
}

/// Back, forward, reload, or go to another http(s) address.
#[tauri::command]
#[specta::specta]
pub(crate) fn web_nav<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    label: String,
    action: String,
    url: Option<String>,
) -> Result<(), ContractError> {
    let wv = own_web_view(&window, &state, &label)?;
    match action.as_str() {
        "back" => wv.eval("history.back()"),
        "forward" => wv.eval("history.forward()"),
        "reload" => wv.eval("location.reload()"),
        "go" => wv.navigate(http_url(url.as_deref().unwrap_or(""))?),
        other => return Err(failed(format!("unknown action {other}"))),
    }
    .map_err(|e| failed(e.to_string()))
}

/// The address a web page's view is at now.
#[tauri::command]
#[specta::specta]
pub(crate) fn web_url<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    label: String,
) -> Result<String, ContractError> {
    own_web_view(&window, &state, &label)?
        .url()
        .map(|u| u.to_string())
        .map_err(|e| failed(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::scroll_script;

    #[test]
    fn the_scroll_script_carries_two_finite_numbers_or_nothing() {
        assert_eq!(
            scroll_script(0.0, 120.5).as_deref(),
            Some("window.scrollBy(0, 120.5)")
        );
        assert_eq!(scroll_script(0.0, 0.0), None);
        assert_eq!(scroll_script(f64::NAN, 1.0), None);
        assert_eq!(scroll_script(1.0, f64::INFINITY), None);
    }
}
