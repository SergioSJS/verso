//! The verso:// protocol: the window's own files, and the open folder's files
//! the window shows, served with their type and policy.

use super::*;

/// `%XX` sequences of a URL path back to bytes, then to text.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16)
        {
            out.push(v);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime_of(path: &str) -> &'static str {
    match path
        .rsplit('.')
        .next()
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        // The HTML-file viewer's page (review phase-2, reading 1, finding
        // 1): as a document, under `FILE_CSP`'s sandbox. Served as bytes,
        // `nosniff` kept the frame from showing it at all.
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("pdf") => "application/pdf",
        Some("mp3") => "audio/mpeg",
        Some("m4a") => "audio/mp4",
        Some("ogg") => "audio/ogg",
        Some("wav") => "audio/wav",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        _ => "application/octet-stream",
    }
}

/// Whether a web view of this app is one of its own windows' — the main
/// window, another window of the folder, or a note popped out — as opposed
/// to a web page (`web-*`).
pub(crate) fn is_app_view(label: &str) -> bool {
    label == "main" || label.starts_with("window-") || label.starts_with("note-")
}

/// What `verso://` answers to one request, apart from the transport: the
/// status, the headers, the body. Kept free of Tauri's types so the
/// rules are tested directly.
pub(crate) struct Served {
    pub(crate) status: u16,
    pub(crate) headers: Vec<(&'static str, String)>,
    pub(crate) body: Vec<u8>,
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

pub(crate) fn serve(
    ws: Option<&mut Workspace>,
    requester: &str,
    relative: &str,
    origin: Option<&str>,
) -> Served {
    let mut headers = vec![
        ("Content-Security-Policy", FILE_CSP.to_owned()),
        ("X-Content-Type-Options", "nosniff".to_owned()),
        ("Cache-Control", "no-store".to_owned()),
    ];
    if let Some(o) = origin.filter(|o| is_app_origin(o)) {
        headers.push(("Access-Control-Allow-Origin", o.to_owned()));
        headers.push(("Vary", "Origin".to_owned()));
    }
    let refuse = |status: u16, why: &str, mut headers: Vec<(&'static str, String)>| {
        headers.push(("Content-Type", "text/plain; charset=utf-8".to_owned()));
        Served {
            status,
            headers,
            body: why.as_bytes().to_vec(),
        }
    };
    // A web page's view never reads the folder, whatever it asks for.
    if !is_app_view(requester) {
        return refuse(403, "not a view of this app", headers);
    }
    // A note's text crosses through `read_note`, with its revision;
    // never as a bare file.
    if relative.to_lowercase().ends_with(".md") {
        return refuse(403, "a note is read through read_note", headers);
    }
    let Some(ws) = ws else {
        return refuse(404, "no folder is open", headers);
    };
    // And judged again on the path as confinement reads it: `Nota.md/`
    // and `./Nota.md` name the note too.
    if ws
        .confined(relative)
        .is_ok_and(|key| key.to_lowercase().ends_with(".md"))
    {
        return refuse(403, "a note is read through read_note", headers);
    }
    match ws.read_file(relative) {
        Ok(bytes) => {
            headers.push(("Content-Type", mime_of(relative).to_owned()));
            Served {
                status: 200,
                headers,
                body: bytes,
            }
        }
        Err(e) => {
            let e = convert(e);
            let status = match e.kind {
                ErrorKind::NotFound | ErrorKind::Refused | ErrorKind::NoFolder => 404,
                _ => 500,
            };
            refuse(status, &e.message, headers)
        }
    }
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
        if fetch && is_app_view(&label) && !relative.to_lowercase().ends_with(".md") {
            let placeholder = {
                let mut guard = lock(&state.sessions);
                guard.of(&label).and_then(|s| {
                    let note = s
                        .workspace
                        .confined(&relative)
                        .is_ok_and(|key| key.to_lowercase().ends_with(".md"));
                    if note {
                        None
                    } else {
                        s.workspace.placeholder(&relative).ok().flatten()
                    }
                })
            };
            if let Some(Err(e)) = placeholder.map(|p| p.fetch()) {
                log::write(
                    "ERROR",
                    "host",
                    &format!("fetching {relative} from the cloud: {e}"),
                );
            }
        }
        let served = {
            // The folder of the view that asked (ADR 0065).
            let mut guard = lock(&state.sessions);
            serve(
                guard.of(&label).map(|s| &mut s.workspace),
                &label,
                &relative,
                origin.as_deref(),
            )
        };
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
