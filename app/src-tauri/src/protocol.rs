//! The verso:// protocol: the window's own files, and the open folder's files
//! the window shows, served with their type and policy.

use super::*;
use verso_service::files::{self, Served, percent_decode};

/// Whether a web view of this app is one of its own windows' — the main
/// window, another window of the folder, or a note popped out — as opposed
/// to a web page (`web-*`).
pub(crate) fn is_app_view(label: &str) -> bool {
    label == "main" || label.starts_with("window-") || label.starts_with("note-")
}

/// The policy every `verso://` response carries: whatever the file is,
/// a document made of it runs no script, submits no form and reaches
/// nothing but the folder's own files (SVG and HTML are active content;
/// review `docs/review/phase-2.md`, B1).
const FILE_CSP: &str = "sandbox; default-src 'none'; img-src verso: http://verso.localhost data:; media-src verso: http://verso.localhost; style-src 'unsafe-inline' verso: http://verso.localhost; font-src verso: http://verso.localhost data:";

/// The origins of the app's own pages, the only ones allowed to read a
/// response with `fetch` (the PDF reader): `tauri://localhost` on macOS
/// and Linux, `http(s)://tauri.localhost` on Windows.
fn is_app_origin(origin: &str) -> bool {
    matches!(
        origin,
        "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
    )
}

/// What `verso://` answers to one request, apart from the transport
/// (`verso_service::files::serve`): only the app's own views are
/// answered, and only their origin may read a response from script.
pub(crate) fn serve(
    ws: Option<&mut Workspace>,
    requester: &str,
    relative: &str,
    origin: Option<&str>,
) -> Served {
    files::serve(
        ws,
        is_app_view(requester),
        relative,
        &files::Policy {
            csp: FILE_CSP,
            cors_origin: origin.filter(|o| is_app_origin(o)),
        },
    )
}

/// The origin of a URL, in the form the approval list stores:
/// `scheme://host` with the port when it is not the scheme's default.
pub(crate) fn embed_origin_of(url: &reqwest::Url) -> Option<String> {
    let host = url.host_str()?;
    match url.port() {
        Some(p) => Some(format!("{}://{}:{}", url.scheme(), host.to_lowercase(), p)),
        None => Some(format!("{}://{}", url.scheme(), host.to_lowercase())),
    }
}

/// `verso://localhost/<relative path>`: a file of the folder that is not
/// a note — an image an embed names, a PDF, an HTML page shown without
/// scripts — read through the core, so the only door to the disk stays
/// `verso-fs` (ADR 0026 rule 5) and every path is confined. Only the
/// app's own views are answered, and only their origin may read a
/// response from script.
pub(crate) fn serve_file<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let relative = percent_decode(request.uri().path().trim_start_matches('/'));
    let origin = request
        .headers()
        .get("Origin")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let label = ctx.webview_label().to_owned();
    // A picture the window shows is the user opening it: one only in the
    // cloud is brought down first (ADR 0043, amended on 2026-09-30). A
    // thumbnail in a folder's view is not (`?thumb`): opening a folder
    // never pulls it from the cloud.
    let fetch = !request
        .uri()
        .query()
        .is_some_and(|q| q.split('&').any(|p| p == "thumb"));
    let app = ctx.app_handle().clone();
    // Off the main thread: a file is read, and may be downloaded.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<App>();
        // A window on a server's folder reads its files from the server.
        if is_app_view(&label)
            && let Some(served) = remote::file(&app, &label, &relative)
        {
            let mut response = tauri::http::Response::builder().status(served.status);
            for (name, value) in &served.headers {
                response = response.header(*name, value);
            }
            responder.respond(
                response
                    .body(served.body)
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
            );
            return;
        }
        // A window of files without a folder: an attachment beside one of
        // them, read only, inside its parent (ADR 0114 item 14).
        if is_app_view(&label) && state.service.is_loose(&label) {
            let bytes = state.service.loose_attachment(&label, &relative);
            let served = files::serve_bytes(
                bytes,
                true,
                &relative,
                &files::Policy {
                    csp: FILE_CSP,
                    cors_origin: origin.as_deref().filter(|o| is_app_origin(o)),
                },
            );
            let mut response = tauri::http::Response::builder().status(served.status);
            for (name, value) in &served.headers {
                response = response.header(*name, value);
            }
            responder.respond(
                response
                    .body(served.body)
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
            );
            return;
        }
        if fetch && is_app_view(&label) && !relative.to_lowercase().ends_with(".md") {
            let placeholder = state
                .service
                .with(&label, |ws| Ok(files::placeholder_of(ws, &relative)))
                .ok()
                .flatten();
            if let Some(Err(e)) = placeholder.map(|p| p.fetch()) {
                log::write(
                    "ERROR",
                    "host",
                    &format!("fetching {relative} from the cloud: {e}"),
                );
            }
        }
        // The folder of the view that asked (ADR 0065).
        let served = state
            .service
            .with(&label, |ws| {
                Ok(serve(Some(ws), &label, &relative, origin.as_deref()))
            })
            .unwrap_or_else(|_| serve(None, &label, &relative, origin.as_deref()));
        let mut response = tauri::http::Response::builder().status(served.status);
        for (name, value) in &served.headers {
            response = response.header(*name, value);
        }
        responder.respond(
            response
                .body(served.body)
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
        );
    });
}
