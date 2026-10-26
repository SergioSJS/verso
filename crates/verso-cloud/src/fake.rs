// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! In-process fakes of a WebDAV server and an S3 service, for the tests
//! (ADR 0104, Consequences: no test reaches a real provider). Each is a
//! small HTTP/1.1 server on a loopback port over an in-memory store, with
//! switches for the behaviours the adapters must survive or refuse: a
//! service that ignores `If-Match`, weak ETags, 429s, and so on. They keep
//! a log of every successful write — what it asserted and what it
//! replaced — which is what the race property test checks.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Write as _};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use sha2::{Digest, Sha256};

use crate::sigv4::Signer;
use crate::{hex, pct_decode, pct_path};

/// A request as the fakes see it.
#[derive(Debug, Clone, Default)]
pub struct Req {
    pub method: String,
    /// The path, percent-decoded.
    pub path: String,
    pub query: Vec<(String, String)>,
    /// Header names in lower case.
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

impl Req {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).map(String::as_str)
    }

    fn q(&self, name: &str) -> Option<&str> {
        self.query
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }
}

/// A response.
#[derive(Debug, Clone, Default)]
pub struct Resp {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    /// After `body`, go on writing filler (64 MiB, or until the client
    /// hangs up): a misconfigured or hostile endpoint; no `Content-Length`.
    pub endless: bool,
}

impl Resp {
    fn new(status: u16) -> Self {
        Self {
            status,
            ..Self::default()
        }
    }

    fn header(mut self, k: &str, v: impl Into<String>) -> Self {
        self.headers.push((k.to_owned(), v.into()));
        self
    }

    fn body(mut self, b: impl Into<Vec<u8>>) -> Self {
        self.body = b.into();
        self
    }

    fn xml(self, text: impl Into<String>) -> Self {
        self.header("Content-Type", "application/xml")
            .body(text.into())
    }
}

type Handler = dyn Fn(&Req) -> Resp + Send + Sync;

/// A lock held through a panic of another thread: the fakes go on.
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// A running fake server; it stops when dropped.
pub struct Server {
    pub address: String,
    stop: Arc<AtomicBool>,
}

impl Server {
    fn start(handler: Arc<Handler>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .unwrap_or_else(|e| panic!("a loopback port for the fake: {e}"));
        let address = listener
            .local_addr()
            .map(|a| a.to_string())
            .unwrap_or_default();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = Arc::clone(&stop);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                if stopped.load(Ordering::Relaxed) {
                    break;
                }
                let Ok(stream) = stream else { continue };
                let handler = Arc::clone(&handler);
                std::thread::spawn(move || serve(stream, &*handler));
            }
        });
        Self { address, stop }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        // Wake the accept loop so it sees the flag.
        let _ = TcpStream::connect(&self.address);
    }
}

fn serve(mut stream: TcpStream, handler: &Handler) {
    // Requests on a connection the client keeps, one after another.
    while let Some(req) = read_request(&mut stream) {
        let resp = handler(&req);
        let mut out = format!(
            "HTTP/1.1 {} {}\r\n",
            resp.status,
            if resp.status < 400 { "OK" } else { "Error" }
        );
        let head = req.method == "HEAD";
        let mut has_length = false;
        for (k, v) in &resp.headers {
            has_length |= k.eq_ignore_ascii_case("content-length");
            out.push_str(&format!("{k}: {v}\r\n"));
        }
        if resp.endless {
            out.push_str("Connection: close\r\n");
        } else if !has_length {
            out.push_str(&format!("Content-Length: {}\r\n", resp.body.len()));
        }
        out.push_str("\r\n");
        if stream.write_all(out.as_bytes()).is_err() {
            return;
        }
        if !head && stream.write_all(&resp.body).is_err() {
            return;
        }
        if resp.endless && !head {
            // Far past any cap, and not truly endless: a client with no
            // cap fails the test, it does not eat the machine.
            let filler = vec![b' '; 1 << 16];
            for _ in 0..(64 << 20) / filler.len() {
                if stream.write_all(&filler).is_err() {
                    break;
                }
            }
            return;
        }
        let _ = stream.flush();
    }
}

fn read_request(stream: &mut TcpStream) -> Option<Req> {
    let mut buf = Vec::new();
    let mut byte = [0_u8; 1];
    while !buf.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte).ok()? == 0 {
            return None;
        }
        buf.push(byte[0]);
        if buf.len() > 1 << 20 {
            return None;
        }
    }
    let head = String::from_utf8_lossy(&buf).into_owned();
    let mut lines = head.split("\r\n");
    let mut first = lines.next()?.split(' ');
    let method = first.next()?.to_owned();
    let target = first.next()?;
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let query = query
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (k, v) = p.split_once('=').unwrap_or((p, ""));
            (pct_decode(k), pct_decode(v))
        })
        .collect();
    let mut headers = BTreeMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_lowercase(), v.trim().to_owned());
        }
    }
    let length: usize = headers
        .get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let mut body = vec![0_u8; length];
    stream.read_exact(&mut body).ok()?;
    Some(Req {
        method,
        path: pct_decode(path),
        query,
        headers,
        body,
    })
}

/// A write the fake accepted: the path, what the request asserted about the
/// file it replaced (`If-Match` etag, or that it must be absent), and what
/// it did replace. The race property is that these agree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Write {
    pub path: String,
    pub asserted: Asserted,
    pub replaced: Option<String>,
    pub etag: String,
    pub hash: String,
}

/// A file the fake removed: what the request asserted about it, and the
/// version it was. As with a write, the two must agree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Removed {
    pub path: String,
    pub asserted: Asserted,
    pub etag: String,
}

/// Whether a removal asserted the version it removed.
#[must_use]
pub fn removal_agrees(r: &Removed) -> bool {
    r.asserted == Asserted::Etag(r.etag.clone())
}

/// What a write said about the file it was replacing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Asserted {
    Nothing,
    Absent,
    Etag(String),
}

/// Whether a write agrees with what it replaced: it asserted the version
/// that was there, or that nothing was.
#[must_use]
pub fn agrees(w: &Write) -> bool {
    match (&w.asserted, &w.replaced) {
        (Asserted::Absent, None) => true,
        (Asserted::Etag(a), Some(r)) => a == r,
        _ => false,
    }
}

fn asserted(r: &Req) -> Asserted {
    match (r.header("if-match"), r.header("if-none-match")) {
        (Some(e), _) => Asserted::Etag(e.to_owned()),
        (None, Some("*")) => Asserted::Absent,
        _ => Asserted::Nothing,
    }
}

/// Someone else's write landing right after a request of ours is answered:
/// the interleaving a client cannot see (a `PUT` answered, and before its
/// next request another device's conditional write — made against the
/// version our `PUT` just created — lands). One-shot.
#[derive(Debug, Clone)]
struct Intrusion {
    method: String,
    path: String,
    bytes: Vec<u8>,
}

/// The bytes the periodic intruder writes: unlike a device's own, of a
/// length of their own.
fn intruder_bytes(n: u32) -> Vec<u8> {
    format!("X#{n}{}", "x".repeat((n % 3) as usize)).into_bytes()
}

// ---------------------------------------------------------------- WebDAV

/// What the fake WebDAV server does wrong, on purpose.
#[derive(Debug, Clone, Default)]
pub struct DavMode {
    /// Ignore `If-Match` on `PUT` (and `DELETE`, `MOVE`).
    pub ignore_if_match: bool,
    /// Ignore `If-None-Match: *` on `PUT`.
    pub ignore_if_none_match: bool,
    /// Ignore `If-Match` on `DELETE` only.
    pub ignore_delete_if_match: bool,
    /// ETags are weak (`W/"…"`).
    pub weak_etags: bool,
    /// No ETags at all.
    pub no_etags: bool,
    /// A `PUT` answers without an `ETag` header (the client must ask).
    pub no_put_etag: bool,
    /// A wrong user or password is 401 (when a user is set).
    pub user: String,
    pub password: String,
    /// Every this-many-th `PUT` of a file is followed at once by another
    /// device's conditional write on the same file; 0 is never.
    pub intrude: u32,
}

#[derive(Default)]
struct DavStore {
    files: BTreeMap<String, (Vec<u8>, String)>,
    dirs: BTreeSet<String>,
    counter: u64,
    writes: Vec<Write>,
    removed: Vec<Removed>,
    /// Files a listing leaves out though they are there (a service that
    /// lags behind its writes).
    hidden: BTreeSet<String>,
    after: Vec<Intrusion>,
    puts: u32,
}

/// A fake WebDAV server rooted at `/dav`.
pub struct Dav {
    _server: Server,
    store: Arc<Mutex<DavStore>>,
    mode: Arc<Mutex<DavMode>>,
    throttle: Arc<AtomicU32>,
    requests: Arc<Mutex<Vec<String>>>,
    pub address: String,
}

const DAV_ROOT: &str = "/dav";

impl Dav {
    #[must_use]
    pub fn start(mode: DavMode) -> Self {
        let store = Arc::new(Mutex::new(DavStore::default()));
        lock(&store).dirs.insert(String::new());
        let mode = Arc::new(Mutex::new(mode));
        let throttle = Arc::new(AtomicU32::new(0));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let handler = {
            let (store, mode, throttle, requests) = (
                Arc::clone(&store),
                Arc::clone(&mode),
                Arc::clone(&throttle),
                Arc::clone(&requests),
            );
            Arc::new(move |r: &Req| {
                lock(&requests).push(format!("{} {}", r.method, r.path));
                if throttle
                    .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1))
                    .is_ok()
                {
                    return Resp::new(429).header("Retry-After", "0");
                }
                let mode = lock(&mode).clone();
                let mut store = lock(&store);
                let resp = dav(&mut store, &mode, r);
                if resp.status < 300 {
                    dav_intrusion(&mut store, &mode, r);
                }
                resp
            })
        };
        let server = Server::start(handler);
        let address = format!("http://{}{DAV_ROOT}", server.address);
        Self {
            _server: server,
            store,
            mode,
            throttle,
            requests,
            address,
        }
    }

    /// The next `n` requests are answered 429, `Retry-After: 0`.
    pub fn throttle(&self, n: u32) {
        self.throttle.store(n, Ordering::SeqCst);
    }

    pub fn mode(&self, f: impl FnOnce(&mut DavMode)) {
        f(&mut lock(&self.mode));
    }

    /// A file put there by someone else, bypassing every check.
    pub fn put(&self, path: &str, bytes: &[u8]) {
        let mut s = lock(&self.store);
        let mut dir = String::new();
        let parts: Vec<&str> = path.split('/').collect();
        for p in &parts[..parts.len() - 1] {
            if !dir.is_empty() {
                dir.push('/');
            }
            dir.push_str(p);
            s.dirs.insert(dir.clone());
        }
        s.counter += 1;
        let etag = format!("\"e{}\"", s.counter);
        s.files.insert(path.to_owned(), (bytes.to_vec(), etag));
    }

    /// A listing leaves `path` out from now on, though it is there.
    pub fn hide(&self, path: &str) {
        lock(&self.store).hidden.insert(path.to_owned());
    }

    /// Right after the next successful `method` request on `path`,
    /// another device's conditional write puts `bytes` there.
    pub fn after(&self, method: &str, path: &str, bytes: &[u8]) {
        lock(&self.store).after.push(Intrusion {
            method: method.to_owned(),
            path: path.to_owned(),
            bytes: bytes.to_vec(),
        });
    }

    /// Every file with its ETag and the SHA-256 of what it holds.
    #[must_use]
    pub fn state(&self) -> BTreeMap<String, (String, String)> {
        lock(&self.store)
            .files
            .iter()
            .map(|(p, (b, e))| (p.clone(), (e.clone(), hex(&Sha256::digest(b)))))
            .collect()
    }

    /// Whether a folder is there.
    #[must_use]
    pub fn has_dir(&self, path: &str) -> bool {
        lock(&self.store).dirs.contains(path)
    }

    /// Someone deleted `path` there.
    pub fn remove(&self, path: &str) {
        lock(&self.store).files.remove(path);
    }

    /// The whole folder is gone from the server.
    pub fn remove_folder(&self) {
        let mut s = lock(&self.store);
        s.files.clear();
        s.dirs.clear();
    }

    #[must_use]
    pub fn get(&self, path: &str) -> Option<Vec<u8>> {
        lock(&self.store).files.get(path).map(|(b, _)| b.clone())
    }

    #[must_use]
    pub fn paths(&self) -> Vec<String> {
        lock(&self.store).files.keys().cloned().collect()
    }

    #[must_use]
    pub fn writes(&self) -> Vec<Write> {
        lock(&self.store).writes.clone()
    }

    #[must_use]
    pub fn removed(&self) -> Vec<Removed> {
        lock(&self.store).removed.clone()
    }

    #[must_use]
    pub fn requests(&self) -> Vec<String> {
        lock(&self.requests).clone()
    }
}

fn dav_rel(path: &str) -> Option<String> {
    path.strip_prefix(DAV_ROOT)
        .map(|r| r.trim_matches('/').to_owned())
}

fn dav_etag(mode: &DavMode, n: u64) -> String {
    if mode.weak_etags {
        format!("W/\"e{n}\"")
    } else {
        format!("\"e{n}\"")
    }
}

fn parent(path: &str) -> String {
    path.rsplit_once('/')
        .map_or(String::new(), |(p, _)| p.to_owned())
}

/// The write of another device, made against the version that is there.
fn dav_land(s: &mut DavStore, mode: &DavMode, path: &str, bytes: Vec<u8>) {
    let Some((_, there)) = s.files.get(path).cloned() else {
        return;
    };
    s.counter += 1;
    let etag = dav_etag(mode, s.counter);
    s.writes.push(Write {
        path: path.to_owned(),
        asserted: Asserted::Etag(there.clone()),
        replaced: Some(there),
        etag: etag.clone(),
        hash: hex(&Sha256::digest(&bytes)),
    });
    s.files.insert(path.to_owned(), (bytes, etag));
}

fn dav_intrusion(s: &mut DavStore, mode: &DavMode, r: &Req) {
    let Some(rel) = dav_rel(&r.path) else { return };
    if let Some(at) = s
        .after
        .iter()
        .position(|i| i.method == r.method && i.path == rel)
    {
        let i = s.after.remove(at);
        dav_land(s, mode, &rel, i.bytes);
        return;
    }
    if mode.intrude > 0 && r.method == "PUT" && !rel.contains(".verso-") {
        s.puts += 1;
        if s.puts.is_multiple_of(mode.intrude) {
            dav_land(s, mode, &rel, intruder_bytes(s.puts));
        }
    }
}

fn dav(s: &mut DavStore, mode: &DavMode, r: &Req) -> Resp {
    if !mode.user.is_empty() {
        use base64::Engine as _;
        let want = base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", mode.user, mode.password));
        if r.header("authorization") != Some(&format!("Basic {want}")) {
            return Resp::new(401);
        }
    }
    let Some(rel) = dav_rel(&r.path) else {
        return Resp::new(404);
    };
    match r.method.as_str() {
        "PROPFIND" => {
            let is_dir = s.dirs.contains(&rel);
            let file = s.files.get(&rel).cloned();
            if !is_dir && file.is_none() {
                return Resp::new(404);
            }
            let quota = String::from_utf8_lossy(&r.body).contains("quota-available-bytes");
            let mut out = String::from(r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">"#);
            let entry = |out: &mut String, path: &str, dir: bool, f: Option<&(Vec<u8>, String)>| {
                let href = if path.is_empty() {
                    format!("{DAV_ROOT}/")
                } else {
                    format!("{DAV_ROOT}/{}", pct_path(path))
                };
                out.push_str(&format!(
                    "<d:response><d:href>{href}</d:href><d:propstat><d:prop>"
                ));
                if quota {
                    out.push_str("<d:quota-available-bytes>987654321</d:quota-available-bytes>");
                } else if dir {
                    out.push_str("<d:resourcetype><d:collection/></d:resourcetype>");
                } else if let Some((bytes, etag)) = f {
                    out.push_str("<d:resourcetype/>");
                    out.push_str(&format!(
                        "<d:getcontentlength>{}</d:getcontentlength>",
                        bytes.len()
                    ));
                    if !mode.no_etags {
                        out.push_str(&format!(
                            "<d:getetag>{}</d:getetag>",
                            etag.replace('"', "&quot;")
                        ));
                    }
                }
                out.push_str(
                    "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>",
                );
            };
            entry(&mut out, &rel, is_dir, file.as_ref());
            if is_dir && r.header("depth") != Some("0") {
                for d in &s.dirs {
                    if !d.is_empty() && parent(d) == rel {
                        entry(&mut out, d, true, None);
                    }
                }
                for (p, f) in &s.files {
                    if parent(p) == rel && !s.hidden.contains(p) {
                        entry(&mut out, p, false, Some(f));
                    }
                }
            }
            out.push_str("</d:multistatus>");
            Resp::new(207).xml(out)
        }
        "GET" | "HEAD" => match s.files.get(&rel) {
            Some((bytes, etag)) => {
                let mut resp = Resp::new(200).body(bytes.clone());
                if !mode.no_etags {
                    resp = resp.header("ETag", etag.clone());
                }
                if r.method == "HEAD" {
                    resp = resp.header("Content-Length", bytes.len().to_string());
                }
                resp
            }
            None => Resp::new(404),
        },
        "MKCOL" => {
            if s.dirs.contains(&rel) || s.files.contains_key(&rel) {
                Resp::new(405)
            } else if !s.dirs.contains(&parent(&rel)) {
                Resp::new(409)
            } else {
                s.dirs.insert(rel);
                Resp::new(201)
            }
        }
        "PUT" => {
            if !s.dirs.contains(&parent(&rel)) {
                return Resp::new(409);
            }
            let there = s.files.get(&rel).map(|(_, e)| e.clone());
            if let Some(m) = r.header("if-match")
                && !mode.ignore_if_match
                && there.as_deref() != Some(m)
            {
                return Resp::new(412);
            }
            if r.header("if-none-match") == Some("*")
                && !mode.ignore_if_none_match
                && there.is_some()
            {
                return Resp::new(412);
            }
            s.counter += 1;
            let etag = dav_etag(mode, s.counter);
            s.writes.push(Write {
                path: rel.clone(),
                asserted: asserted(r),
                replaced: there.clone(),
                etag: etag.clone(),
                hash: hex(&Sha256::digest(&r.body)),
            });
            s.files.insert(rel, (r.body.clone(), etag.clone()));
            let mut resp = Resp::new(if there.is_some() { 204 } else { 201 });
            if !mode.no_etags && !mode.no_put_etag {
                resp = resp.header("ETag", etag);
            }
            resp
        }
        "DELETE" => {
            if let Some((_, etag)) = s.files.get(&rel).cloned() {
                if let Some(m) = r.header("if-match")
                    && !mode.ignore_if_match
                    && !mode.ignore_delete_if_match
                    && etag != m
                {
                    return Resp::new(412);
                }
                s.removed.push(Removed {
                    path: rel.clone(),
                    asserted: asserted(r),
                    etag,
                });
                s.files.remove(&rel);
                Resp::new(204)
            } else if s.dirs.contains(&rel) && !rel.is_empty() {
                let prefix = format!("{rel}/");
                s.files.retain(|p, _| !p.starts_with(&prefix));
                s.dirs.retain(|d| *d != rel && !d.starts_with(&prefix));
                Resp::new(204)
            } else {
                Resp::new(404)
            }
        }
        "MOVE" => {
            let Some(dest) = r
                .header("destination")
                .and_then(|d| d.split_once("://"))
                .and_then(|(_, rest)| rest.find('/').map(|i| pct_decode(&rest[i..])))
                .and_then(|p| dav_rel(&p))
            else {
                return Resp::new(400);
            };
            let Some((bytes, etag)) = s.files.get(&rel).cloned() else {
                return Resp::new(404);
            };
            if let Some(m) = r.header("if-match")
                && !mode.ignore_if_match
                && etag != m
            {
                return Resp::new(412);
            }
            if !s.dirs.contains(&parent(&dest)) {
                return Resp::new(409);
            }
            if s.files.contains_key(&dest) && r.header("overwrite") == Some("F") {
                return Resp::new(412);
            }
            s.removed.push(Removed {
                path: rel.clone(),
                asserted: asserted(r),
                etag: etag.clone(),
            });
            s.counter += 1;
            let landed = dav_etag(mode, s.counter);
            let replaced = s.files.get(&dest).map(|(_, e)| e.clone());
            s.writes.push(Write {
                path: dest.clone(),
                asserted: if r.header("overwrite") == Some("F") {
                    Asserted::Absent
                } else {
                    Asserted::Nothing
                },
                replaced,
                etag: landed.clone(),
                hash: hex(&Sha256::digest(&bytes)),
            });
            s.files.remove(&rel);
            s.files.insert(dest, (bytes, landed));
            Resp::new(201)
        }
        _ => Resp::new(405),
    }
}

// -------------------------------------------------------------------- S3

/// What the fake S3 does wrong, on purpose.
#[derive(Debug, Clone)]
pub struct S3Mode {
    pub ignore_if_match: bool,
    pub ignore_if_none_match: bool,
    /// Answer 501 to a conditional header on a write (Backblaze's way).
    pub not_implemented: bool,
    pub ignore_delete_if_match: bool,
    /// Do not honour conditions on a copy.
    pub ignore_copy_conditions: bool,
    /// Do not honour conditions on `CompleteMultipartUpload`.
    pub ignore_multipart_conditions: bool,
    /// Verify `x-amz-checksum-sha256` (a wrong one is a 400).
    pub checksum: bool,
    pub versioning: bool,
    /// `ListObjectsV2` answers this many keys a page.
    pub page: usize,
    pub access: String,
    pub secret: String,
    pub region: String,
    /// Every this-many-th single `PUT` or finished multipart upload of a
    /// file is followed at once by another device's conditional write on
    /// the same key; 0 is never.
    pub intrude: u32,
    /// A copy keeps one byte fewer than its source (a service that
    /// corrupts a copy).
    pub corrupt_copy: bool,
    /// A listing page is answered with a body that never ends.
    pub endless_listing: bool,
    /// An object's `PUT` is answered 500 with a body that never ends.
    pub endless_error: bool,
}

impl Default for S3Mode {
    fn default() -> Self {
        Self {
            ignore_if_match: false,
            ignore_if_none_match: false,
            not_implemented: false,
            ignore_delete_if_match: false,
            ignore_copy_conditions: false,
            ignore_multipart_conditions: false,
            checksum: true,
            versioning: false,
            page: 2,
            access: "AKIATEST".to_owned(),
            secret: "secret-test-key".to_owned(),
            region: "test-1".to_owned(),
            intrude: 0,
            corrupt_copy: false,
            endless_listing: false,
            endless_error: false,
        }
    }
}

type Upload = (String, BTreeMap<String, String>, BTreeMap<u32, Vec<u8>>);

#[derive(Default, Clone)]
struct Object {
    bytes: Vec<u8>,
    etag: String,
    meta: BTreeMap<String, String>,
}

#[derive(Default)]
struct S3Store {
    objects: BTreeMap<String, Object>,
    uploads: BTreeMap<String, Upload>,
    counter: u64,
    writes: Vec<Write>,
    removed: Vec<Removed>,
    hidden: BTreeSet<String>,
    after: Vec<Intrusion>,
    puts: u32,
}

/// A fake S3 service with one bucket, `bucket`, in path style.
pub struct S3 {
    _server: Server,
    store: Arc<Mutex<S3Store>>,
    mode: Arc<Mutex<S3Mode>>,
    throttle: Arc<AtomicU32>,
    requests: Arc<Mutex<Vec<String>>>,
    pub address: String,
}

pub const BUCKET: &str = "bucket";

impl S3 {
    #[must_use]
    pub fn start(mode: S3Mode) -> Self {
        let store = Arc::new(Mutex::new(S3Store::default()));
        let mode = Arc::new(Mutex::new(mode));
        let throttle = Arc::new(AtomicU32::new(0));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let handler = {
            let (store, mode, throttle, requests) = (
                Arc::clone(&store),
                Arc::clone(&mode),
                Arc::clone(&throttle),
                Arc::clone(&requests),
            );
            Arc::new(move |r: &Req| {
                let what = r
                    .query
                    .iter()
                    .map(|(k, _)| k.as_str())
                    .collect::<Vec<_>>()
                    .join("&");
                lock(&requests).push(format!(
                    "{} {}{}",
                    r.method,
                    r.path,
                    if what.is_empty() {
                        String::new()
                    } else {
                        format!("?{what}")
                    }
                ));
                if throttle
                    .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1))
                    .is_ok()
                {
                    return Resp::new(503).header("Retry-After", "0");
                }
                let mode = lock(&mode).clone();
                if let Some(denied) = s3_auth(&mode, r) {
                    return denied;
                }
                let mut store = lock(&store);
                let resp = s3(&mut store, &mode, r);
                if resp.status < 300 {
                    s3_intrusion(&mut store, &mode, r);
                }
                resp
            })
        };
        let server = Server::start(handler);
        let address = format!("http://{}", server.address);
        Self {
            _server: server,
            store,
            mode,
            throttle,
            requests,
            address,
        }
    }

    pub fn throttle(&self, n: u32) {
        self.throttle.store(n, Ordering::SeqCst);
    }

    /// A listing leaves `key` out from now on, though it is there.
    pub fn hide(&self, key: &str) {
        lock(&self.store).hidden.insert(key.to_owned());
    }

    /// Someone deleted `key` there.
    pub fn remove(&self, key: &str) {
        lock(&self.store).objects.remove(key);
    }

    /// Right after the next successful `method` request on `key`, another
    /// device's conditional write puts `bytes` there.
    pub fn after(&self, method: &str, key: &str, bytes: &[u8]) {
        lock(&self.store).after.push(Intrusion {
            method: method.to_owned(),
            path: key.to_owned(),
            bytes: bytes.to_vec(),
        });
    }

    /// Every object with its ETag and the SHA-256 of what it holds.
    #[must_use]
    pub fn state(&self) -> BTreeMap<String, (String, String)> {
        lock(&self.store)
            .objects
            .iter()
            .map(|(k, o)| (k.clone(), (o.etag.clone(), hex(&Sha256::digest(&o.bytes)))))
            .collect()
    }

    /// How many multipart uploads are open.
    #[must_use]
    pub fn open_uploads(&self) -> usize {
        lock(&self.store).uploads.len()
    }

    /// An upload someone started and never finished.
    pub fn start_upload(&self, key: &str) -> String {
        let mut s = lock(&self.store);
        s.counter += 1;
        let id = format!("upload{}", s.counter);
        s.uploads.insert(
            id.clone(),
            (key.to_owned(), BTreeMap::new(), BTreeMap::new()),
        );
        id
    }

    pub fn mode(&self, f: impl FnOnce(&mut S3Mode)) {
        f(&mut lock(&self.mode));
    }

    /// An object put there by someone else, bypassing every check.
    pub fn put(&self, key: &str, bytes: &[u8]) {
        let mut s = lock(&self.store);
        s.counter += 1;
        let etag = format!("\"c{}\"", s.counter);
        s.objects.insert(
            key.to_owned(),
            Object {
                bytes: bytes.to_vec(),
                etag,
                meta: BTreeMap::new(),
            },
        );
    }

    #[must_use]
    pub fn get(&self, key: &str) -> Option<Vec<u8>> {
        lock(&self.store).objects.get(key).map(|o| o.bytes.clone())
    }

    #[must_use]
    pub fn keys(&self) -> Vec<String> {
        lock(&self.store).objects.keys().cloned().collect()
    }

    #[must_use]
    pub fn writes(&self) -> Vec<Write> {
        lock(&self.store).writes.clone()
    }

    #[must_use]
    pub fn removed(&self) -> Vec<Removed> {
        lock(&self.store).removed.clone()
    }

    #[must_use]
    pub fn requests(&self) -> Vec<String> {
        lock(&self.requests).clone()
    }
}

/// The write of another device, made against the version that is there.
fn s3_land(s: &mut S3Store, key: &str, bytes: Vec<u8>) {
    let Some(there) = s.objects.get(key).map(|o| o.etag.clone()) else {
        return;
    };
    s.counter += 1;
    let etag = format!("\"c{}\"", s.counter);
    let hash = hex(&Sha256::digest(&bytes));
    s.writes.push(Write {
        path: key.to_owned(),
        asserted: Asserted::Etag(there.clone()),
        replaced: Some(there),
        etag: etag.clone(),
        hash: hash.clone(),
    });
    let meta = BTreeMap::from([("x-amz-meta-verso-sha256".to_owned(), hash)]);
    s.objects
        .insert(key.to_owned(), Object { bytes, etag, meta });
}

fn s3_intrusion(s: &mut S3Store, mode: &S3Mode, r: &Req) {
    let Some(key) = key_of(r) else { return };
    if let Some(at) = s
        .after
        .iter()
        .position(|i| i.method == r.method && i.path == key)
        .filter(|_| r.q("uploads").is_none() && r.q("partNumber").is_none())
    {
        let i = s.after.remove(at);
        s3_land(s, &key, i.bytes);
        return;
    }
    let finishes = (r.method == "PUT"
        && r.q("partNumber").is_none()
        && r.header("x-amz-copy-source").is_none())
        || (r.method == "POST" && r.q("uploadId").is_some());
    if mode.intrude > 0 && finishes && !key.contains(".verso-") {
        s.puts += 1;
        if s.puts.is_multiple_of(mode.intrude) {
            s3_land(s, &key, intruder_bytes(s.puts));
        }
    }
}

fn s3_error(status: u16, code: &str) -> Resp {
    Resp::new(status).xml(format!(
        "<?xml version=\"1.0\"?><Error><Code>{code}</Code><Message>{code}</Message></Error>"
    ))
}

/// The request must be signed as SigV4 says, with the payload hash it
/// names being the hash of the body it carries.
fn s3_auth(mode: &S3Mode, r: &Req) -> Option<Resp> {
    let Some(auth) = r.header("authorization") else {
        return Some(s3_error(403, "AccessDenied"));
    };
    let field = |name: &str| {
        auth.split([',', ' '])
            .find_map(|p| p.strip_prefix(name))
            .map(str::to_owned)
    };
    let credential = field("Credential=")?;
    if !credential.starts_with(&format!("{}/", mode.access)) {
        return Some(s3_error(403, "InvalidAccessKeyId"));
    }
    let signed = field("SignedHeaders=")?;
    let given = field("Signature=")?;
    let payload = r.header("x-amz-content-sha256")?.to_owned();
    let stamp = r.header("x-amz-date")?;
    let headers: Vec<(String, String)> = signed
        .split(';')
        .map(|n| (n.to_owned(), r.header(n).unwrap_or_default().to_owned()))
        .collect();
    // The path as the client sent it: encoded again the way it was.
    let path = pct_path(&r.path);
    let expected = Signer {
        access: &mode.access,
        secret: &mode.secret,
        region: &mode.region,
    }
    .authorization(&r.method, &path, &r.query, &headers, &payload, stamp);
    if !expected.ends_with(&format!("Signature={given}")) {
        return Some(s3_error(403, "SignatureDoesNotMatch"));
    }
    if payload != "UNSIGNED-PAYLOAD" && payload != hex(&Sha256::digest(&r.body)) {
        return Some(s3_error(400, "XAmzContentSHA256Mismatch"));
    }
    None
}

fn key_of(r: &Req) -> Option<String> {
    r.path
        .strip_prefix(&format!("/{BUCKET}/"))
        .map(str::to_owned)
        .filter(|k| !k.is_empty())
}

fn meta_of(r: &Req) -> BTreeMap<String, String> {
    r.headers
        .iter()
        .filter(|(k, _)| k.starts_with("x-amz-meta-"))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect()
}

fn s3(s: &mut S3Store, mode: &S3Mode, r: &Req) -> Resp {
    if r.path != format!("/{BUCKET}") && !r.path.starts_with(&format!("/{BUCKET}/")) {
        return s3_error(404, "NoSuchBucket");
    }
    let Some(key) = key_of(r) else {
        return s3_bucket(s, mode, r);
    };
    let conditions = r.header("if-match").is_some() || r.header("if-none-match").is_some();
    match r.method.as_str() {
        "GET" | "HEAD" => match s.objects.get(&key) {
            None => {
                if r.method == "HEAD" {
                    Resp::new(404)
                } else {
                    s3_error(404, "NoSuchKey")
                }
            }
            Some(o) => {
                let mut resp = Resp::new(200)
                    .body(o.bytes.clone())
                    .header("ETag", o.etag.clone());
                for (k, v) in &o.meta {
                    resp = resp.header(k, v.clone());
                }
                if mode.checksum
                    && r.header("x-amz-checksum-mode") == Some("ENABLED")
                    && !o.etag.contains("mp-")
                {
                    use base64::Engine as _;
                    resp = resp.header(
                        "x-amz-checksum-sha256",
                        base64::engine::general_purpose::STANDARD.encode(Sha256::digest(&o.bytes)),
                    );
                }
                if r.method == "HEAD" {
                    resp = resp.header("Content-Length", o.bytes.len().to_string());
                }
                resp
            }
        },
        "PUT" if r.q("partNumber").is_some() => {
            let (Some(id), Some(n)) = (
                r.q("uploadId"),
                r.q("partNumber").and_then(|n| n.parse().ok()),
            ) else {
                return s3_error(400, "InvalidArgument");
            };
            let Some(up) = s.uploads.get_mut(id) else {
                return s3_error(404, "NoSuchUpload");
            };
            up.2.insert(n, r.body.clone());
            Resp::new(200).header(
                "ETag",
                format!("\"part{n}-{}\"", &hex(&Sha256::digest(&r.body))[..8]),
            )
        }
        "PUT" if r.header("x-amz-copy-source").is_some() => {
            let source = pct_decode(r.header("x-amz-copy-source").unwrap_or_default());
            let Some(source) = source.strip_prefix(&format!("/{BUCKET}/")) else {
                return s3_error(404, "NoSuchBucket");
            };
            let Some(from) = s.objects.get(source).cloned() else {
                return s3_error(404, "NoSuchKey");
            };
            if r.header("x-amz-copy-source-if-match")
                .is_some_and(|m| m != from.etag)
            {
                return s3_error(412, "PreconditionFailed");
            }
            let there = s.objects.get(&key).map(|o| o.etag.clone());
            if !mode.ignore_copy_conditions {
                if r.header("if-none-match") == Some("*") && there.is_some() {
                    return s3_error(412, "PreconditionFailed");
                }
                if let Some(m) = r.header("if-match")
                    && there.as_deref() != Some(m)
                {
                    return s3_error(412, "PreconditionFailed");
                }
            }
            s.counter += 1;
            let etag = format!("\"c{}\"", s.counter);
            s.writes.push(Write {
                path: key.clone(),
                asserted: asserted(r),
                replaced: there,
                etag: etag.clone(),
                hash: hex(&Sha256::digest(&from.bytes)),
            });
            let mut bytes = from.bytes;
            if mode.corrupt_copy {
                bytes.pop();
            }
            s.objects.insert(
                key,
                Object {
                    bytes,
                    etag: etag.clone(),
                    meta: from.meta,
                },
            );
            Resp::new(200).xml(format!(
                "<CopyObjectResult><ETag>{}</ETag></CopyObjectResult>",
                etag.replace('"', "&quot;")
            ))
        }
        "PUT" => {
            if mode.endless_error {
                let mut resp = s3_error(500, "InternalError");
                resp.endless = true;
                return resp;
            }
            if mode.not_implemented && conditions {
                return s3_error(501, "NotImplemented");
            }
            let there = s.objects.get(&key).map(|o| o.etag.clone());
            if let Some(m) = r.header("if-match")
                && !mode.ignore_if_match
                && there.as_deref() != Some(m)
            {
                return s3_error(412, "PreconditionFailed");
            }
            if r.header("if-none-match") == Some("*")
                && !mode.ignore_if_none_match
                && there.is_some()
            {
                return s3_error(412, "PreconditionFailed");
            }
            if mode.checksum
                && let Some(c) = r.header("x-amz-checksum-sha256")
            {
                use base64::Engine as _;
                if c != base64::engine::general_purpose::STANDARD.encode(Sha256::digest(&r.body)) {
                    return s3_error(400, "BadDigest");
                }
            }
            s.counter += 1;
            let etag = format!("\"c{}\"", s.counter);
            s.writes.push(Write {
                path: key.clone(),
                asserted: asserted(r),
                replaced: there,
                etag: etag.clone(),
                hash: hex(&Sha256::digest(&r.body)),
            });
            s.objects.insert(
                key,
                Object {
                    bytes: r.body.clone(),
                    etag: etag.clone(),
                    meta: meta_of(r),
                },
            );
            Resp::new(200).header("ETag", etag)
        }
        "POST" if r.q("uploads").is_some() => {
            s.counter += 1;
            let id = format!("upload{}", s.counter);
            s.uploads
                .insert(id.clone(), (key, meta_of(r), BTreeMap::new()));
            Resp::new(200).xml(format!(
                "<InitiateMultipartUploadResult><UploadId>{id}</UploadId></InitiateMultipartUploadResult>"
            ))
        }
        "POST" if r.q("uploadId").is_some() => {
            if mode.not_implemented && conditions {
                return s3_error(501, "NotImplemented");
            }
            let id = r.q("uploadId").unwrap_or_default().to_owned();
            // A completion that is refused leaves the upload open, as S3
            // does; one that succeeds closes it.
            let Some((target, meta, parts)) = s.uploads.get(&id).cloned() else {
                return s3_error(404, "NoSuchUpload");
            };
            let there = s.objects.get(&target).map(|o| o.etag.clone());
            if !mode.ignore_multipart_conditions {
                if let Some(m) = r.header("if-match")
                    && there.as_deref() != Some(m)
                {
                    // S3 can say this in a 200.
                    return Resp::new(200).xml("<Error><Code>PreconditionFailed</Code></Error>");
                }
                if r.header("if-none-match") == Some("*") && there.is_some() {
                    return s3_error(412, "PreconditionFailed");
                }
            }
            s.uploads.remove(&id);
            let bytes: Vec<u8> = parts.values().flatten().copied().collect();
            s.counter += 1;
            let etag = format!("\"mp-{}-{}\"", s.counter, parts.len());
            s.writes.push(Write {
                path: target.clone(),
                asserted: asserted(r),
                replaced: there,
                etag: etag.clone(),
                hash: hex(&Sha256::digest(&bytes)),
            });
            s.objects.insert(
                target,
                Object {
                    bytes,
                    etag: etag.clone(),
                    meta,
                },
            );
            Resp::new(200).xml(format!(
                "<CompleteMultipartUploadResult><ETag>{}</ETag></CompleteMultipartUploadResult>",
                etag.replace('"', "&quot;")
            ))
        }
        "DELETE" if r.q("uploadId").is_some() => {
            s.uploads.remove(r.q("uploadId").unwrap_or_default());
            Resp::new(204)
        }
        "DELETE" => {
            if let Some(o) = s.objects.get(&key) {
                if let Some(m) = r.header("if-match")
                    && !mode.ignore_if_match
                    && !mode.ignore_delete_if_match
                    && o.etag != m
                {
                    return s3_error(412, "PreconditionFailed");
                }
                let etag = o.etag.clone();
                s.removed.push(Removed {
                    path: key.clone(),
                    asserted: asserted(r),
                    etag,
                });
                s.objects.remove(&key);
            }
            Resp::new(204)
        }
        _ => s3_error(405, "MethodNotAllowed"),
    }
}

fn s3_bucket(s: &S3Store, mode: &S3Mode, r: &Req) -> Resp {
    if r.q("versioning").is_some() {
        return Resp::new(200).xml(format!(
            "<VersioningConfiguration><Status>{}</Status></VersioningConfiguration>",
            if mode.versioning { "Enabled" } else { "" }
        ));
    }
    if r.q("uploads").is_some() {
        let prefix = r.q("prefix").unwrap_or_default();
        let mut out = String::from("<?xml version=\"1.0\"?><ListMultipartUploadsResult>");
        for (id, (key, _, _)) in &s.uploads {
            if key.starts_with(prefix) {
                out.push_str(&format!(
                    "<Upload><Key>{}</Key><UploadId>{id}</UploadId></Upload>",
                    key.replace('&', "&amp;")
                ));
            }
        }
        out.push_str("<IsTruncated>false</IsTruncated></ListMultipartUploadsResult>");
        return Resp::new(200).xml(out);
    }
    if r.q("list-type") != Some("2") {
        return s3_error(400, "InvalidRequest");
    }
    if mode.endless_listing {
        let mut resp = Resp::new(200).xml("<?xml version=\"1.0\"?><ListBucketResult>");
        resp.endless = true;
        return resp;
    }
    let prefix = r.q("prefix").unwrap_or_default();
    let after = r.q("continuation-token").unwrap_or_default();
    let keys: Vec<&String> = s
        .objects
        .keys()
        .filter(|k| k.starts_with(prefix) && k.as_str() > after && !s.hidden.contains(*k))
        .collect();
    let page = &keys[..keys.len().min(mode.page)];
    let mut out = String::from("<?xml version=\"1.0\"?><ListBucketResult>");
    for k in page {
        let o = &s.objects[*k];
        out.push_str(&format!(
            "<Contents><Key>{}</Key><ETag>{}</ETag><Size>{}</Size></Contents>",
            k.replace('&', "&amp;"),
            o.etag.replace('"', "&quot;"),
            o.bytes.len()
        ));
    }
    if keys.len() > page.len() {
        out.push_str(&format!(
            "<IsTruncated>true</IsTruncated><NextContinuationToken>{}</NextContinuationToken>",
            page.last()
                .map(|k| k.replace('&', "&amp;"))
                .unwrap_or_default()
        ));
    } else {
        out.push_str("<IsTruncated>false</IsTruncated>");
    }
    out.push_str("</ListBucketResult>");
    Resp::new(200).xml(out)
}
