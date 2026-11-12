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
    // `about:blank` too: what a closing page is emptied to (`SILENCE`).
    matches!(url.scheme(), "http" | "https") || url.as_str() == "about:blank"
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

/// The guard with one more allowance (ADR 0056, revised 2026-10-15): an
/// app view's frame may load an origin that the frameability check judged
/// frameable and recorded in `framed`, and no other page of the web. The
/// handler is asked for every frame and cannot tell a frame from the
/// window itself (wry passes it the address only), so the allowance is as
/// narrow as it can be made: the exact origins of pages the user already
/// approved to embed and whose servers allow framing.
pub(crate) fn may_navigate_framed(
    label: &str,
    url: &tauri::Url,
    dev_url: Option<&tauri::Url>,
    framed: &std::collections::HashSet<String>,
) -> bool {
    may_navigate(label, url, dev_url)
        || (is_app_view(label)
            && web_only(url)
            && embed_origin_of(url).is_some_and(|o| framed.contains(&o)))
        || (is_app_view(label) && blob_origin(url).is_some_and(|o| framed.contains(&o)))
}

/// The origin of a `blob:` address made by a page of the web
/// (`blob:https://site/…`): a framed page's download is one (ADR 0120 item
/// 6, revising ADR 0056) — the engine hands it to the download hook only
/// once the guard has let it through. None for any other address.
pub(crate) fn blob_origin(url: &tauri::Url) -> Option<String> {
    if url.scheme() != "blob" {
        return None;
    }
    let inner = tauri::Url::parse(url.path()).ok()?;
    if !matches!(inner.scheme(), "http" | "https") {
        return None;
    }
    embed_origin_of(&inner)
}

/// The navigation guard as a plugin: a plugin's `on_navigation` is asked
/// for every web view, the main window included, which a builder's own
/// handler cannot reach.
pub(crate) fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("verso-navigation")
        .on_navigation(|webview, url| {
            let dev_url = webview.app_handle().config().build.dev_url.clone();
            let app = webview.app_handle();
            let framed = app
                .try_state::<App>()
                .map(|state| lock(&state.framed_origins).clone())
                .unwrap_or_default();
            may_navigate_framed(webview.label(), url, dev_url.as_ref(), &framed)
        })
        // A window's page loading again (a reload, ⌘R) forgets the web
        // pages it opened, but their child views stay: drawn over the new
        // page and closed by nothing (the maintainer, 2026-10-16). They go
        // with the page that opened them.
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started
                && crate::protocol::is_app_view(webview.label())
            {
                close_web_views_of(webview.app_handle(), webview.window().label());
            }
        })
        .build()
}

/// What a page is told before its view goes: every sound element stopped
/// and emptied, then the page replaced by an empty one, which ends whatever
/// the page still played (a video that autoplays, a stream). A view that
/// the engine keeps alive a while after `close` (the maintainer, 2026-11-02:
/// a YouTube page's sound went on after its tab closed, until the web
/// engine's GPU process was killed) then has nothing left to play.
const SILENCE: &str = "try{document.querySelectorAll('video,audio').forEach(function(m){m.pause();m.muted=true;m.removeAttribute('src');m.load();});}catch(e){}location.replace('about:blank');";

/// How long the emptied page gets to unload before its view is closed.
const UNLOAD_MS: u64 = 400;

/// Destroy a page's view for good: silenced first, hidden and out of its
/// container at once, closed when the empty page has loaded.
pub(crate) fn destroy_web_view<R: tauri::Runtime>(wv: tauri::Webview<R>) {
    crate::log::write("INFO", "host", &format!("web page closed: {}", wv.label()));
    let _ = wv.with_webview(|pw| crate::audio_share::suspend_page_media(&pw));
    let _ = wv.eval(SILENCE);
    let _ = crate::mobile::show_view(&wv, false);
    web_clip::release(&wv);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(UNLOAD_MS));
        if let Err(e) = crate::mobile::close_view(&wv) {
            crate::log::write(
                "WARN",
                "host",
                &format!("closing the web view {}: {e}", wv.label()),
            );
        }
    });
}

/// Close every web page's view a window opened, and forget them.
pub(crate) fn close_web_views_of<R: tauri::Runtime>(app: &tauri::AppHandle<R>, window: &str) {
    let Some(state) = app.try_state::<App>() else {
        return;
    };
    let mine: Vec<String> = {
        let mut views = lock(&state.web_views);
        let labels: Vec<String> = views
            .iter()
            .filter(|(_, owner)| owner.as_str() == window)
            .map(|(label, _)| label.clone())
            .collect();
        for label in &labels {
            views.remove(label);
        }
        labels
    };
    for label in mine {
        if let Some(wv) = app.get_webview(&label) {
            destroy_web_view(wv);
        }
    }
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

/// A rectangle in the window's logical pixels, from the top-left of the
/// window's page.
#[derive(Debug, Clone, Copy, serde::Deserialize, specta::Type)]
pub(crate) struct WebRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl From<WebRect> for web_clip::geometry::Rect {
    fn from(r: WebRect) -> Self {
        Self {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
        }
    }
}

/// Where a web page goes, as an iframe would put it. `slot` is the
/// page's whole box: its size is the page's viewport (`100vh` is its
/// height), and it may reach outside its pane or the window. `visible` is
/// the part of the slot that shows — inside every scroller around it and
/// the window, clear of the tab bar and the status bar (`embedPlace`,
/// app/ui/src/leaves/embedClip.ts). The page is drawn at `slot` and only
/// inside `visible` (`web_clip`); scrolling the note moves the slot and
/// never scrolls the page. A web note's own view sends one rectangle
/// twice.
#[derive(Debug, Clone, Copy, serde::Deserialize, specta::Type)]
pub(crate) struct WebPlace {
    slot: WebRect,
    visible: WebRect,
}

/// The place's two rectangles, or `refused` when either is not a place on
/// a screen (not finite, negative in size, or past any screen).
fn rects(
    place: WebPlace,
) -> Result<(web_clip::geometry::Rect, web_clip::geometry::Rect), ContractError> {
    let (slot, visible) = (place.slot.into(), place.visible.into());
    if web_clip::geometry::sane(slot) && web_clip::geometry::sane(visible) {
        Ok((slot, visible))
    } else {
        Err(refused("not a place for a web page"))
    }
}

/// A web page inside the window, as a child web view over the area the
/// UI names: the browser behind a tab whose note holds the address, or an
/// embedded page. Only `http(s)`; the page cannot navigate anywhere else,
/// nor open windows. Answers with the label the other `web_*` commands
/// take.
///
/// The view is made over the visible part, as it was before the page
/// could be clipped, and then put at its slot inside a clipping container
/// (`web_clip`): never over the window's chrome, even for a frame.
#[tauri::command]
#[specta::specta]
pub(crate) async fn web_open<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    url: String,
    place: WebPlace,
) -> Result<String, ContractError> {
    let (slot, visible) = rects(place)?;
    let url = http_url(&url)?;
    let host = url.host_str().unwrap_or("").to_owned();
    let label = next_web_label();
    // The window that asks hosts the page: the main one, or a note's own.
    let chrome = chrome_offset(&window);
    let wv = crate::mobile::add_view(
        &window,
        pages_profile(
            tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(url)),
            &window,
        )
        .user_agent(WEB_USER_AGENT)
        .on_navigation(web_only)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny),
        tauri::LogicalPosition::new(visible.x, visible.y + chrome),
        tauri::LogicalSize::new(visible.w.max(1.0), visible.h.max(1.0)),
    )
    .map_err(|e| failed(e.to_string()))?;
    lock(&state.web_views).insert(label.clone(), window.label().to_owned());
    crate::log::write(
        "INFO",
        "host",
        &format!("web page opened: {label} ({host}) in {}", window.label()),
    );
    web_clip::place(
        &wv,
        slot,
        visible,
        chrome,
        window.scale_factor().unwrap_or(1.0),
    )
    .map_err(failed)?;
    Ok(label)
}

/// The pages' profile: every embedded page runs in a web engine
/// environment of its own, apart from the window's (ADR 0056 amendment of
/// 2026-11-01; ADR 0116). The window's own sounds (the dice, the chimes, the
/// table's music) then play in a process the pages do not share, so sharing
/// the sound of the pages (Share audio) can never carry them. All pages
/// share the one profile, so a login made in one page holds in the others.
/// - Windows and Linux: a data directory of its own under the app's local
///   data (WebView2 starts a second environment, with its own browser and
///   audio processes; WebKitGTK a second web context).
/// - macOS 14 and later: a named `WKWebsiteDataStore`; before 14 the system
///   has none to give and the pages keep the window's store.
fn pages_profile<R: tauri::Runtime>(
    builder: tauri::webview::WebviewBuilder<R>,
    window: &tauri::Window<R>,
) -> tauri::webview::WebviewBuilder<R> {
    use tauri::Manager;
    let builder = builder.data_store_identifier(PAGES_STORE);
    match window.path().app_local_data_dir() {
        Ok(dir) => builder.data_directory(dir.join(PAGES_PROFILE)),
        Err(_) => builder,
    }
}

/// The folder of the pages' profile, under the app's local data directory.
const PAGES_PROFILE: &str = "pages-profile";

/// The pages' website data store on macOS (a fixed identifier, the UUID
/// `7c4b7d2e-3f9a-4e0b-9a51-5a2d6f0c8e11`).
const PAGES_STORE: [u8; 16] = [
    0x7c, 0x4b, 0x7d, 0x2e, 0x3f, 0x9a, 0x4e, 0x0b, 0x9a, 0x51, 0x5a, 0x2d, 0x6f, 0x0c, 0x8e, 0x11,
];

/// Move a web page's view to follow its box: the page at `slot`, drawn
/// only inside `visible` (`WebPlace`). The page's own scroll is never
/// touched.
#[tauri::command]
#[specta::specta]
pub(crate) fn web_bounds<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    label: String,
    place: WebPlace,
) -> Result<(), ContractError> {
    let (slot, visible) = rects(place)?;
    let wv = own_web_view(&window, &state, &label)?;
    web_clip::place(
        &wv,
        slot,
        visible,
        chrome_offset(&window),
        window.scale_factor().unwrap_or(1.0),
    )
    .map_err(failed)
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
    web_clip::show(&wv, visible);
    crate::mobile::show_view(&wv, visible).map_err(|e| failed(e.to_string()))
}

/// Close a web page's view (its tab closed).
#[tauri::command]
#[specta::specta]
pub(crate) fn web_close<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    label: String,
) -> Result<(), ContractError> {
    // A window closes only its own pages; a refusal is written down, as a
    // page left open plays on with nothing to stop it.
    let wv = own_web_view(&window, &state, &label).inspect_err(|e| {
        crate::log::write(
            "WARN",
            "host",
            &format!("web page {label} not closed from {}: {e:?}", window.label()),
        );
    })?;
    lock(&state.web_views).remove(&label);
    destroy_web_view(wv);
    Ok(())
}

/// Whether the page at `url` may be shown in a real `<iframe>` of the
/// window: its server's headers allow being framed by the window's origin
/// (`X-Frame-Options`, `frame-ancestors`, judged on the final response of
/// a short chain of redirects). The window then draws the embed as a
/// frame, which scrolls and clips with the note; otherwise it keeps the
/// child web view. One request (`HEAD`, a `GET` read only as far as its
/// headers when that fails), to an address a note wrote and the user
/// approved to embed (ADR 0050, 0056); answered once per origin for the
/// session. A timeout or an error answers no.
///
/// An origin judged frameable is also what the navigation guard lets an
/// app view's frame load, and nothing else of the web.
#[tauri::command]
#[specta::specta]
pub(crate) async fn embed_frameable<R: tauri::Runtime>(
    webview: tauri::Webview<R>,
    state: State<'_, App>,
    url: String,
) -> Result<bool, ContractError> {
    if !is_app_view(webview.label()) {
        return Err(refused("only the app's own views ask this"));
    }
    let parsed = http_url(&url)?;
    let origin = embed_origin_of(&parsed).ok_or_else(|| refused("the address has no host"))?;
    let cached = lock(&state.frame_verdicts).get(&origin).copied();
    if let Some(answer) = cached {
        return Ok(answer);
    }
    let app = webview
        .url()
        .ok()
        .and_then(|u| crate::framing::Ancestor::of(&u))
        .ok_or_else(|| failed("the window has no address"))?;
    let verdict = crate::framing::check(&parsed, Some(&app), WEB_USER_AGENT).await;
    if verdict.frameable {
        lock(&state.framed_origins).extend(verdict.origins);
    }
    lock(&state.frame_verdicts).insert(origin, verdict.frameable);
    Ok(verdict.frameable)
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

    /// A page's sound ends with its view (the maintainer, 2026-11-02: a YouTube
    /// page went on playing after its tab closed): closing a view silences the
    /// page first, and a window that is destroyed closes the views it opened.
    #[test]
    fn a_page_is_silenced_when_its_view_closes_and_a_destroyed_window_closes_its_views() {
        let web = include_str!("web.rs");
        assert!(web.contains("location.replace('about:blank')"));
        assert!(web.contains("m.pause()"));
        let close = web.split("fn web_close").nth(1).unwrap_or_default();
        assert!(
            close
                .split("#[tauri::command]")
                .next()
                .unwrap_or_default()
                .contains("destroy_web_view(wv)")
        );
        let lib = include_str!("lib.rs");
        let destroyed = lib
            .split("tauri::WindowEvent::Destroyed")
            .nth(1)
            .unwrap_or_default();
        assert!(
            destroyed
                .chars()
                .take(700)
                .collect::<String>()
                .contains("close_web_views_of(app, label)")
        );
    }
}
