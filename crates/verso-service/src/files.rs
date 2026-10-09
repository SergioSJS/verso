// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file of the open folder that is not a note, served to the window —
//! an image an embed names, a PDF, an HTML page shown without scripts —
//! read through the core, so the only door to the disk stays `verso-fs`
//! (ADR 0026 rule 5) and every path is confined. The desktop serves it as
//! `verso://`, the server under `/f/`; what each answers is decided here,
//! apart from the transport, so the rules are tested directly.

use verso_contract::ErrorKind;
use verso_core::Workspace;

/// What one request is answered: the status, the headers, the body.
pub struct Served {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

/// `%XX` sequences of a URL path back to bytes, then to text.
#[must_use]
pub fn percent_decode(s: &str) -> String {
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

/// The media type of a file, by its extension.
#[must_use]
pub fn mime_of(path: &str) -> &'static str {
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
        // 1): as a document, under the policy's sandbox. Served as bytes,
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

/// How a host serves the folder's files.
pub struct Policy<'a> {
    /// The policy every response carries: whatever the file is, a document
    /// made of it runs no script, submits no form and reaches nothing but
    /// the folder's own files (SVG and HTML are active content; review
    /// `docs/review/phase-2.md`, B1).
    pub csp: &'a str,
    /// The origin allowed to read a response from script (the PDF reader),
    /// when the request comes from it.
    pub cors_origin: Option<&'a str>,
}

/// Serve `relative` from `ws`. `allowed` is the host's judgement of the
/// requester — an app view on the desktop, a member with read access on
/// the server; refused otherwise, whatever it asks for.
pub fn serve(
    ws: Option<&mut Workspace>,
    allowed: bool,
    relative: &str,
    policy: &Policy<'_>,
) -> Served {
    let mut headers = vec![
        ("Content-Security-Policy", policy.csp.to_owned()),
        ("X-Content-Type-Options", "nosniff".to_owned()),
        ("Cache-Control", "no-store".to_owned()),
    ];
    if let Some(o) = policy.cors_origin {
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
    if !allowed {
        return refuse(403, "not a view of this app", headers);
    }
    // A note's text crosses through `read_note`, with its revision; never
    // as a bare file.
    if relative.to_lowercase().ends_with(".md") {
        return refuse(403, "a note is read through read_note", headers);
    }
    let Some(ws) = ws else {
        return refuse(404, "no folder is open", headers);
    };
    // And judged again on the path as confinement reads it: `Nota.md/` and
    // `./Nota.md` name the note too.
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
            let e = crate::convert(e);
            let status = match e.kind {
                ErrorKind::NotFound | ErrorKind::Refused | ErrorKind::NoFolder => 404,
                _ => 500,
            };
            refuse(status, &e.message, headers)
        }
    }
}

/// A file of the folder only in the cloud, which a request for it brings
/// down first (ADR 0043, amended on 2026-09-30); never a note.
pub fn placeholder_of(ws: &mut Workspace, relative: &str) -> Option<verso_core::Placeholder> {
    if relative.to_lowercase().ends_with(".md")
        || ws
            .confined(relative)
            .is_ok_and(|key| key.to_lowercase().ends_with(".md"))
    {
        return None;
    }
    ws.placeholder(relative).ok().flatten()
}
