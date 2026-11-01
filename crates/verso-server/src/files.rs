// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `/f/<folder>/<path>`: a file of a folder that is not a note — a picture,
//! a PDF, an HTML page shown without scripts — for a member who may read
//! the folder (the maintainer's answer G of 2026-10-09: the session and its
//! role are the capability, checked on every request). Read through the
//! core, served with the policy `verso://` has on the desktop: whatever
//! the file is, a document made of it runs no script (an HTML or SVG file
//! another member shares is otherwise a stored XSS on the server's
//! origin, ADR 0073 item 6). Sent a piece at a time from the disk, never
//! whole in memory (the review of 2026-10-13: a host of 1 GB held a whole
//! video per request), with a single `Range` taken as browsers ask it to
//! play a video or a sound from where the person seeks.

use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use axum::body::{Body, Bytes};
use axum::extract::Path;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use tokio::sync::mpsc;
use verso_service::files::{Opened, Policy, Served, open, refuse_note, serve};

use crate::http::{ApiError, ApiResult, Ctx};
use crate::state::Server;

const FILE_CSP: &str = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:";

/// The bytes read from the disk at once: a piece small beside the host's
/// memory, large enough that a file of hundreds of megabytes is a few
/// thousand reads. At most two are held per file being sent — one read,
/// one waiting for the connection — whatever the file's size.
pub const PIECE: usize = 256 * 1024;

pub async fn file(ctx: Ctx, Path((folder, path)): Path<(String, String)>) -> ApiResult<Response> {
    let who = ctx.who()?;
    // A share's file, by its path in the shared folder, behind the same
    // check (ADR 0081 item 2).
    let (found, path, role, scope) = match crate::shares::opening(&ctx.server, who, &folder)? {
        crate::shares::Opening::Folder(found, role) => (found, path, role, None),
        crate::shares::Opening::Share(found, scope, role) => {
            let full = scope.to_full(&path).map_err(|_| ApiError::not_found())?;
            (found, full, role, Some(scope))
        }
    };
    let owner =
        scope.is_none() && crate::campaign::is_master(&ctx.server, &found.id, &who.account.id);
    let door = crate::access::Door::build(
        &ctx.server,
        who,
        (found.id.clone(), role, owner),
        owner,
        scope,
    );
    // One who is told the projections is sent no note, under any name: a
    // link to one is refused as the note is (ADR 0087 item 4).
    let reads_only = door.projects();
    // A file a table's game master has not released is not there to a
    // player: not found, as a file that does not exist (ADR 0110 item 4).
    if door.veiled() {
        let key = crate::access::key(&ctx.server, &found)?;
        let (s, p, who_is) = (
            Arc::clone(&ctx.server),
            path.clone(),
            who.account.id.clone(),
        );
        let hidden = tokio::task::spawn_blocking(move || {
            crate::campaign_serve::is_hidden(&s, &key, Some(&who_is), &p)
        })
        .await
        .map_err(|e| e.to_string())?;
        if hidden {
            return Err(ApiError::not_found());
        }
    }
    send(&ctx.server, &ctx.headers, found, path, reads_only).await
}

/// `path` of `found`, sent a piece at a time: to a member by `file`, and
/// to a read link (`crate::visit`), always as a reader.
pub(crate) async fn send(
    server: &Arc<Server>,
    headers: &HeaderMap,
    found: crate::db::Folder,
    path: String,
    reads_only: bool,
) -> ApiResult<Response> {
    let key = crate::access::key(server, &found)?;
    let server = Arc::clone(server);
    let (k, p) = (key.clone(), path.clone());
    let s = Arc::clone(&server);
    let opened = tokio::task::spawn_blocking(move || {
        let policy = Policy {
            csp: FILE_CSP,
            cors_origin: None,
        };
        s.service
            .with_key(&k, |ws| {
                if reads_only && ws.reader_may_not_stream(&p) {
                    return Ok(Err(refuse_note(&policy)));
                }
                Ok(open(Some(ws), true, &p, &policy))
            })
            .unwrap_or_else(|_| Err(serve(None, true, &p, &policy)))
    })
    .await
    .map_err(|e| e.to_string())?;
    let opened = match opened {
        Ok(opened) => opened,
        Err(refused) => return Ok(whole(refused)),
    };
    let len = opened.mark.len;
    let range = match ranged(headers, len) {
        Ok(range) => range,
        Err(()) => {
            let mut response = respond(
                StatusCode::RANGE_NOT_SATISFIABLE,
                opened.headers,
                Body::empty(),
            );
            put(
                &mut response,
                header::CONTENT_RANGE,
                &format!("bytes */{len}"),
            );
            return Ok(response);
        }
    };
    let (start, end, status) = match range {
        Some((start, end)) => (start, end, StatusCode::PARTIAL_CONTENT),
        None => (0, len, StatusCode::OK),
    };
    let body = Body::new(Pieces::sent(server, (key, path), &opened, (start, end)));
    let mut response = respond(status, opened.headers, body);
    put(&mut response, header::ACCEPT_RANGES, "bytes");
    put(
        &mut response,
        header::CONTENT_LENGTH,
        &(end - start).to_string(),
    );
    if status == StatusCode::PARTIAL_CONTENT {
        put(
            &mut response,
            header::CONTENT_RANGE,
            &format!("bytes {start}-{}/{len}", end - 1),
        );
    }
    Ok(response)
}

/// A refusal, its body whole: a few words.
fn whole(served: Served) -> Response {
    let status = StatusCode::from_u16(served.status).unwrap_or(StatusCode::OK);
    respond(status, served.headers, Body::from(served.body))
}

fn respond(status: StatusCode, headers: Vec<(&'static str, String)>, body: Body) -> Response {
    let mut response = Response::new(body);
    *response.status_mut() = status;
    for (name, value) in headers {
        if let Ok(v) = HeaderValue::from_str(&value) {
            response.headers_mut().insert(name, v);
        }
    }
    response.into_response()
}

fn put(response: &mut Response, name: header::HeaderName, value: &str) {
    if let Ok(v) = HeaderValue::from_str(value) {
        response.headers_mut().insert(name, v);
    }
}

/// The one range of `bytes=` a request asks, as `[start, end)` of a file of
/// `len` bytes: `None` for no `Range`, or one this server does not take
/// (another unit, several ranges) — the whole file is sent then, as RFC
/// 9110 allows; `Err` for a range past the end (416).
fn ranged(headers: &HeaderMap, len: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(asked) = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().strip_prefix("bytes="))
    else {
        return Ok(None);
    };
    if asked.contains(',') {
        return Ok(None);
    }
    let Some((from, to)) = asked.split_once('-') else {
        return Ok(None);
    };
    let (from, to) = (from.trim(), to.trim());
    let number = |s: &str| s.parse::<u64>().ok();
    let (start, last) = match (from.is_empty(), to.is_empty()) {
        // The last `to` bytes.
        (true, false) => {
            let Some(n) = number(to) else { return Ok(None) };
            if n == 0 {
                return Err(());
            }
            (len.saturating_sub(n), len.saturating_sub(1))
        }
        (false, _) => {
            let Some(start) = number(from) else {
                return Ok(None);
            };
            let last = if to.is_empty() {
                len.saturating_sub(1)
            } else {
                match number(to) {
                    Some(last) if last >= start => last.min(len.saturating_sub(1)),
                    _ => return Ok(None),
                }
            };
            (start, last)
        }
        (true, true) => return Ok(None),
    };
    if start >= len {
        return Err(());
    }
    Ok(Some((start, last + 1)))
}

/// A file's bytes as the connection takes them, each piece read from the
/// disk when the one before has gone: a task reads, the body hands each
/// piece to the connection. A piece read at another length or time than
/// the file had when it was opened ends the answer with an error — the
/// connection is cut, never sent a mix of two files.
struct Pieces {
    rx: mpsc::Receiver<Result<Bytes, std::io::Error>>,
}

impl Pieces {
    fn sent(
        server: Arc<Server>,
        (key, path): (String, String),
        opened: &Opened,
        (start, end): (u64, u64),
    ) -> Self {
        // One piece waits while the next is read: two held at most.
        let (tx, rx) = mpsc::channel(1);
        let mark = opened.mark;
        tokio::spawn(async move {
            let mut at = start;
            while at < end {
                let want = usize::try_from(end - at).unwrap_or(PIECE).min(PIECE);
                let (s, k, p) = (Arc::clone(&server), key.clone(), path.clone());
                let read = tokio::task::spawn_blocking(move || {
                    s.service
                        .with_key(&k, |ws| Ok(ws.read_piece(&p, at, want)?))
                })
                .await;
                let piece = match read {
                    Ok(Ok((bytes, now))) if now == mark && !bytes.is_empty() => bytes,
                    _ => {
                        let _ = tx
                            .send(Err(std::io::Error::other(
                                "the file changed or went while it was sent",
                            )))
                            .await;
                        return;
                    }
                };
                at += piece.len() as u64;
                held(piece.len(), true);
                if tx.send(Ok(Bytes::from(piece))).await.is_err() {
                    // The connection went: nothing more is read.
                    return;
                }
            }
        });
        Self { rx }
    }
}

impl hyper::body::Body for Pieces {
    type Data = Bytes;
    type Error = std::io::Error;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<hyper::body::Frame<Bytes>, std::io::Error>>> {
        self.rx.poll_recv(cx).map(|piece| {
            piece.map(|piece| {
                piece.map(|bytes| {
                    held(bytes.len(), false);
                    hyper::body::Frame::data(bytes)
                })
            })
        })
    }
}

/// The bytes of files being sent that the server holds, and the most it
/// held at once, for the tests: a piece counts from its read until the
/// connection takes it.
#[cfg(test)]
static HELD: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
#[cfg(test)]
static PEAK: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn held(bytes: usize, read: bool) {
    #[cfg(test)]
    {
        use std::sync::atomic::Ordering;
        if read {
            let now = HELD.fetch_add(bytes, Ordering::SeqCst) + bytes;
            PEAK.fetch_max(now, Ordering::SeqCst);
        } else {
            HELD.fetch_sub(bytes, Ordering::SeqCst);
        }
    }
    let _ = (bytes, read);
}

#[cfg(test)]
pub(crate) fn held_peak() -> usize {
    PEAK.load(std::sync::atomic::Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asking(range: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(header::RANGE, HeaderValue::from_str(range).unwrap());
        h
    }

    #[test]
    fn a_single_range_is_read_as_browsers_ask_it() {
        assert_eq!(ranged(&HeaderMap::new(), 100), Ok(None));
        assert_eq!(ranged(&asking("bytes=10-19"), 100), Ok(Some((10, 20))));
        assert_eq!(ranged(&asking("bytes=90-"), 100), Ok(Some((90, 100))));
        assert_eq!(ranged(&asking("bytes=-10"), 100), Ok(Some((90, 100))));
        assert_eq!(ranged(&asking("bytes=50-500"), 100), Ok(Some((50, 100))));
        assert_eq!(ranged(&asking("bytes=100-"), 100), Err(()));
        assert_eq!(ranged(&asking("bytes=-0"), 100), Err(()));
        // Several ranges, another unit, nonsense: the whole file.
        assert_eq!(ranged(&asking("bytes=0-1,5-6"), 100), Ok(None));
        assert_eq!(ranged(&asking("lines=1-2"), 100), Ok(None));
        assert_eq!(ranged(&asking("bytes=9-3"), 100), Ok(None));
        assert_eq!(ranged(&asking("bytes=x-3"), 100), Ok(None));
    }
}
