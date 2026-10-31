// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! WebDAV as a remote of sync (ADR 0104 items 6 to 11): a folder of a
//! WebDAV server (Nextcloud and the like), listed with `PROPFIND` at depth
//! one per folder, files read with `GET`, written with `PUT` against the
//! base's strong ETag (`If-Match`) or `If-None-Match: *` for a new file,
//! deleted with `DELETE`, moved with `MOVE` and `Overwrite: F`. A server
//! that does not honour those preconditions, or gives no strong ETag, is
//! refused when the person connects ([`WebDav::probe`]).

use std::collections::{BTreeSet, HashSet, VecDeque};
use std::io::Read as _;
use std::sync::Mutex;

use reqwest::Url;
use reqwest::blocking::Response;
use verso_core::sync::remote::{
    Change, Condition, Entry, HashingSink, Listing, Meta, Read, Remote, RemoteError,
    RemoteErrorKind, Result, Sink, Source, Written,
};

use crate::http::{Http, check_transport};
use crate::names;
use crate::xml::{self, Ev};
use crate::{Deletions, Report, fail, pct_decode, pct_path};

/// The deepest folder nesting listed.
const DEPTH: usize = 64;
/// The most a listing's answer may be, in bytes.
const LISTING_MAX: usize = 256 << 20;

const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getcontentlength/></d:prop></d:propfind>"#;
const QUOTA_BODY: &str = r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:quota-available-bytes/></d:prop></d:propfind>"#;

/// A folder of a WebDAV server.
pub struct WebDav {
    http: Http,
    /// The folder's address, without a trailing slash.
    base: Url,
    user: String,
    password: String,
    /// Folders known to exist, so a write makes each once.
    made: Mutex<HashSet<String>>,
}

/// What a `PROPFIND` found for one resource.
#[derive(Debug, Default, Clone)]
struct Found {
    path: String,
    folder: bool,
    etag: Option<String>,
    size: Option<u64>,
}

impl WebDav {
    /// A client for the folder at `address`.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Refused`] when the address cannot carry a
    /// password (plain HTTP outside the local network, or not confirmed).
    pub fn new(address: &str, user: &str, password: &str, plain_http: bool) -> Result<Self> {
        let mut base = Url::parse(address.trim())
            .map_err(|_| RemoteError::new(RemoteErrorKind::Refused, "this is not an address"))?;
        if !base.username().is_empty() || base.password().is_some() {
            return Err(RemoteError::new(
                RemoteErrorKind::Refused,
                "do not put the user and password in the address: they have fields of their own",
            ));
        }
        check_transport(&base, plain_http)?;
        base.set_query(None);
        base.set_fragment(None);
        let trimmed = base.path().trim_end_matches('/').to_owned();
        base.set_path(&trimmed);
        Ok(Self {
            http: Http::new()?,
            base,
            user: user.to_owned(),
            password: password.to_owned(),
            made: Mutex::new(HashSet::new()),
        })
    }

    /// For the tests: waits of a few milliseconds.
    pub fn quick(mut self) -> Self {
        self.http.backoff = crate::http::Backoff {
            base: std::time::Duration::from_millis(1),
            cap: std::time::Duration::from_millis(10),
            tries: 5,
        };
        self
    }

    fn url(&self, path: &str) -> String {
        let mut url = self.base.clone();
        let mut full = url.path().to_owned();
        if !path.is_empty() {
            full.push('/');
            full.push_str(&pct_path(path));
        }
        // The path is already percent-encoded: set it as it is.
        url.set_path(&full);
        url.to_string()
    }

    /// The address of a collection: with the trailing slash RFC 4918 §8.3
    /// allows to be left out but some servers (Apache's `mod_dav`) answer
    /// with a redirect, which is refused.
    fn dir_url(&self, path: &str) -> String {
        let url = self.url(path);
        if url.ends_with('/') {
            url
        } else {
            format!("{url}/")
        }
    }

    /// A request on a collection (a folder).
    fn req_dir(&self, method: &str, path: &str) -> reqwest::blocking::RequestBuilder {
        self.http
            .request(method, &self.dir_url(path))
            .basic_auth(&self.user, Some(&self.password))
            .header("Accept-Encoding", "identity")
    }

    fn req(&self, method: &str, path: &str) -> reqwest::blocking::RequestBuilder {
        self.http
            .request(method, &self.url(path))
            .basic_auth(&self.user, Some(&self.password))
            .header("Accept-Encoding", "identity")
    }

    /// `PROPFIND` the resource at `path`, `depth` 0 or 1; `collection`
    /// when it is a folder.
    fn propfind(
        &self,
        path: &str,
        depth: u8,
        body: &'static str,
        collection: bool,
    ) -> Result<Response> {
        self.http.send(&mut || {
            let r = if collection {
                self.req_dir("PROPFIND", path)
            } else {
                self.req("PROPFIND", path)
            };
            Ok(r.header("Depth", depth.to_string())
                .header("Content-Type", "application/xml")
                .body(body))
        })
    }

    /// The resources a multistatus answer names, `path` relative to the
    /// folder.
    fn found(&self, response: Response) -> Result<Vec<Found>> {
        let text = capped_text(response)?;
        let events = xml::events(&text);
        let root = self.base.path().to_owned();
        let mut out = Vec::new();
        let mut at = 0;
        while at < events.len() {
            if !matches!(&events[at], Ev::Open(n) if n == "response") {
                at += 1;
                continue;
            }
            let end = events[at..]
                .iter()
                .position(|e| matches!(e, Ev::Close(n) if n == "response"))
                .map_or(events.len(), |p| at + p);
            let one = &events[at..end];
            at = end;
            let Some(href) = xml::first_text(one, "href") else {
                continue;
            };
            // The address may be whole or only a path; either way, its path
            // below the folder's.
            let raw = if href.contains("://") {
                Url::parse(&href)
                    .map(|u| u.path().to_owned())
                    .unwrap_or(href)
            } else {
                href
            };
            let decoded = pct_decode(&raw);
            let rel = decoded
                .strip_prefix(&pct_decode(&root))
                .unwrap_or(&decoded)
                .trim_matches('/')
                .to_owned();
            // Only a propstat that says 200 describes the resource.
            let ok = one
                .split(|e| matches!(e, Ev::Open(n) if n == "propstat"))
                .skip(1)
                .find(|p| xml::first_text(p, "status").is_none_or(|s| s.contains(" 200")))
                .unwrap_or(one);
            out.push(Found {
                path: rel,
                folder: ok
                    .iter()
                    .any(|e| matches!(e, Ev::Open(n) if n == "collection")),
                etag: xml::first_text(ok, "getetag").filter(|e| !e.trim().is_empty()),
                size: xml::first_text(ok, "getcontentlength").and_then(|s| s.trim().parse().ok()),
            });
        }
        Ok(out)
    }

    /// What is at `path`: its ETag and size, or `None` when nothing.
    fn stat(&self, path: &str) -> Result<Option<Found>> {
        let response = self.propfind(path, 0, PROPFIND_BODY, path.is_empty())?;
        match response.status().as_u16() {
            404 => Ok(None),
            207 | 200 => Ok(self.found(response)?.into_iter().next()),
            other => Err(fail(other, "looking at a file", response)),
        }
    }

    /// Make the folders above `path`, once each.
    fn ensure_parents(&self, path: &str) -> Result<()> {
        let mut dir = String::new();
        let parts: Vec<&str> = path.split('/').collect();
        for part in &parts[..parts.len().saturating_sub(1)] {
            if !dir.is_empty() {
                dir.push('/');
            }
            dir.push_str(part);
            self.mkcol(&dir)?;
        }
        Ok(())
    }

    /// Make the folder `dir` (relative to the base; empty is the base).
    fn mkcol(&self, dir: &str) -> Result<()> {
        if self.made.lock().is_ok_and(|m| m.contains(dir)) {
            return Ok(());
        }
        let response = self.http.send(&mut || Ok(self.req_dir("MKCOL", dir)))?;
        match response.status().as_u16() {
            // 405: it exists already.
            200 | 201 | 204 | 405 => {
                if let Ok(mut m) = self.made.lock() {
                    m.insert(dir.to_owned());
                }
                Ok(())
            }
            409 => Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "the folder above this one does not exist on the server",
            )),
            other => Err(fail(other, "making a folder", response)),
        }
    }

    /// Whether `etag` is one this adapter can condition on: strong.
    fn strong(etag: &str) -> bool {
        !etag.trim().is_empty() && !etag.trim_start().starts_with("W/")
    }

    /// The version a file left on the server by a write has (ADR 0104 item
    /// 11, and never another device's).
    ///
    /// The answer's ETag is the version our write made. When a `PROPFIND`
    /// afterwards shows another, a later write of another device (made
    /// against ours) landed in between: ours is answered still, so the
    /// next listing shows a version the host has not seen and the file is
    /// fingerprinted. When the answer gave none, a stat could only guess,
    /// and might attribute a later version to our bytes: the file is read
    /// back instead, and its hash must be the hash sent; the ETag of that
    /// very read is the version. A different hash is a change.
    fn landed(&self, response: &Response, path: &str, meta: &Meta) -> Result<String> {
        let sent = response
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let version = match sent {
            Some(sent) => {
                let there = self.stat(path)?.ok_or_else(|| {
                    RemoteError::new(
                        RemoteErrorKind::Failed,
                        "the file is not on the server after it was sent",
                    )
                })?;
                let ours = there.etag.as_deref().is_none_or(|e| same_etag(e, &sent));
                if ours && there.size.is_some_and(|s| s != meta.size) {
                    return Err(RemoteError::new(
                        RemoteErrorKind::Failed,
                        "the server kept a different number of bytes than were sent",
                    ));
                }
                sent
            }
            None => {
                let mut sink = HashingSink::default();
                let read = self.read(path, &mut sink).map_err(|e| {
                    if e.kind == RemoteErrorKind::NotFound {
                        RemoteError::new(
                            RemoteErrorKind::Failed,
                            "the file is not on the server after it was sent",
                        )
                    } else {
                        e
                    }
                })?;
                if read.size != meta.size {
                    return Err(RemoteError::new(
                        RemoteErrorKind::Failed,
                        "the server kept a different number of bytes than were sent",
                    ));
                }
                if sink.finish() != meta.hash {
                    return Err(RemoteError::new(
                        RemoteErrorKind::Changed,
                        "the file on the server changed while it was being sent",
                    ));
                }
                read.version
            }
        };
        if !Self::strong(&version) {
            return Err(RemoteError::new(
                RemoteErrorKind::Refused,
                "the server gives only weak ETags, which cannot guard a write",
            ));
        }
        Ok(version)
    }

    /// The checks of ADR 0104 item 7 (C.3b), on an object of ours under
    /// `.verso-probe`: a write against a wrong ETag must be refused, one
    /// against the right ETag kept, `If-None-Match: *` honoured, and a
    /// delete against a wrong ETag refused; the ETags must be strong. The
    /// object is deleted after.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Refused`] with the reason, when the server
    /// cannot be trusted with a person's files; other kinds when the
    /// server could not be asked.
    pub fn probe(&self) -> Result<Report> {
        // The folder itself: made if its parent is there.
        if self.stat("")?.is_none() {
            self.mkcol("")?;
        }
        let dir = names::PROBE_DIR;
        self.mkcol(dir)?;
        let key = format!("{dir}/probe-{}", crate::nonce());
        let mut notes = Vec::new();
        let result = self.probe_object(&key, &mut notes);
        // Cleaned up whatever happened.
        // Its own object only: the folder is shared with any other device
        // connecting at the same moment, and deleting it would take that
        // device's check file from under it. It stays, empty.
        let _ = self.http.send(&mut || Ok(self.req("DELETE", &key)));
        result?;
        let (files, bytes) = self.count()?;
        let free = self
            .http
            .send(&mut || {
                Ok(self
                    .req_dir("PROPFIND", "")
                    .header("Depth", "0")
                    .header("Content-Type", "application/xml")
                    .body(QUOTA_BODY))
            })
            .ok()
            .filter(|r| r.status().as_u16() == 207)
            .and_then(|r| capped_text(r).ok())
            .and_then(|t| xml::first_text(&xml::events(&t), "quota-available-bytes"))
            .and_then(|t| t.trim().parse::<i64>().ok())
            .and_then(|n| u64::try_from(n).ok());
        Ok(Report {
            provider: "webdav".to_owned(),
            deletions: Deletions::Final,
            notes,
            free,
            files,
            bytes,
            caps: Vec::new(),
        })
    }

    fn probe_object(&self, key: &str, notes: &mut Vec<String>) -> Result<()> {
        let refused = |why: &str| RemoteError::new(RemoteErrorKind::Refused, why.to_owned());
        let put = |condition: Option<(&str, &str)>, body: &'static [u8]| -> Result<Response> {
            self.http.send(&mut || {
                let mut r = self.req("PUT", key).body(body);
                if let Some((name, value)) = condition {
                    r = r.header(name, value);
                }
                Ok(r)
            })
        };
        let first = put(Some(("If-None-Match", "*")), b"verso 1")?;
        if !matches!(first.status().as_u16(), 200 | 201 | 204) {
            return Err(fail(
                first.status().as_u16(),
                "writing the check file",
                first,
            ));
        }
        let etag = first
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .or_else(|| self.stat(key).ok().flatten().and_then(|f| f.etag))
            .ok_or_else(|| refused("the server gives no ETag, so no write can be guarded"))?;
        if !Self::strong(&etag) {
            return Err(refused(
                "the server gives only weak ETags, which cannot guard a write",
            ));
        }
        // A new file against one that exists: refused, or the service
        // overwrites without asking.
        let again = put(Some(("If-None-Match", "*")), b"verso 2")?;
        if again.status().as_u16() != 412 {
            return Err(refused(
                "the server does not honour If-None-Match: it would overwrite a file another device just made",
            ));
        }
        // A write against a version that is not there: refused.
        let wrong = put(Some(("If-Match", "\"verso-not-the-etag\"")), b"verso 3")?;
        if wrong.status().as_u16() != 412 {
            return Err(refused(
                "the server does not honour If-Match: it would overwrite a version it was told not to",
            ));
        }
        // And against the right one: kept.
        let right = put(Some(("If-Match", &etag)), b"verso 4")?;
        if !matches!(right.status().as_u16(), 200 | 201 | 204) {
            return Err(refused(
                "the server refused a write against the right ETag: it cannot guard writes",
            ));
        }
        let now = right
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .or_else(|| self.stat(key).ok().flatten().and_then(|f| f.etag))
            .unwrap_or(etag);
        // A delete against a wrong ETag: refused.
        let del = self.http.send(&mut || {
            Ok(self
                .req("DELETE", key)
                .header("If-Match", "\"verso-not-the-etag\""))
        })?;
        if del.status().as_u16() != 412 {
            return Err(refused(
                "the server does not honour If-Match on a delete: it would delete a file another device just changed",
            )
            .detailed(crate::DETAIL_NO_CONDITIONAL_DELETE));
        }
        let ok = self
            .http
            .send(&mut || Ok(self.req("DELETE", key).header("If-Match", now.as_str())))?;
        if !matches!(ok.status().as_u16(), 200 | 204) {
            notes.push("the server refused to delete the check file".to_owned());
        }
        Ok(())
    }

    /// How many files and bytes the folder holds now.
    fn count(&self) -> Result<(u64, u64)> {
        let listing = self.list(None)?;
        let mut bytes = 0;
        let files = listing.changes.len() as u64;
        for c in &listing.changes {
            if let Change::Present(e) = c {
                bytes += e.size;
            }
        }
        Ok((files, bytes))
    }
}

/// Whether two ETags name the same version, whatever quotes the answers
/// put on them.
fn same_etag(a: &str, b: &str) -> bool {
    let bare = |e: &str| {
        e.trim()
            .trim_start_matches("W/")
            .trim_matches('"')
            .to_owned()
    };
    bare(a) == bare(b)
}

/// The body of an answer as text, no more than the listing's cap.
fn capped_text(response: Response) -> Result<String> {
    crate::capped_text(response, LISTING_MAX).map_err(|mut e| {
        if e.kind == RemoteErrorKind::Failed {
            e.message = "the server's listing is too large to read".to_owned();
        }
        e
    })
}

impl Remote for WebDav {
    fn list(&self, _after: Option<&str>) -> Result<Listing> {
        let mut changes = Vec::new();
        let mut queue = VecDeque::from([(String::new(), 0_usize)]);
        let mut seen = BTreeSet::new();
        while let Some((dir, depth)) = queue.pop_front() {
            let response = self.propfind(&dir, 1, PROPFIND_BODY, true)?;
            match response.status().as_u16() {
                // The folder is not there: not an empty folder (every file
                // would look deleted there) but a folder to find again. It
                // was made when the person connected.
                404 if dir.is_empty() => {
                    return Err(RemoteError::new(
                        RemoteErrorKind::NotFound,
                        "the folder is not on the server: it was moved or deleted there",
                    ));
                }
                // A folder that went while the listing ran.
                404 => continue,
                207 | 200 => {}
                other => return Err(fail(other, "listing the folder", response)),
            }
            for f in self.found(response)? {
                if f.path == dir || f.path.is_empty() {
                    continue;
                }
                if names::internal(&f.path) {
                    continue;
                }
                if f.folder {
                    if depth + 1 < DEPTH && seen.insert(f.path.clone()) {
                        queue.push_back((f.path, depth + 1));
                    }
                    continue;
                }
                let Some(etag) = f.etag.clone().filter(|e| Self::strong(e)) else {
                    return Err(RemoteError::new(
                        RemoteErrorKind::Refused,
                        format!(
                            "the server gives no strong ETag for {}, so its writes cannot be guarded",
                            f.path
                        ),
                    ));
                };
                changes.push(Change::Present(Entry {
                    path: f.path,
                    version: etag,
                    hash: None,
                    size: f.size.unwrap_or(0),
                    by: None,
                    device: None,
                }));
            }
        }
        Ok(Listing {
            full: true,
            changes,
            cursor: None,
        })
    }

    /// A `PROPFIND` at depth zero, never the file: a deletion here that a
    /// lagging listing asks for must not download a recording to learn it
    /// is still there. A folder is not a file.
    fn exists(&self, path: &str) -> Result<bool> {
        Ok(self.stat(path)?.is_some_and(|f| !f.folder))
    }

    fn read(&self, path: &str, sink: &mut dyn Sink) -> Result<Read> {
        let mut response = self
            .http
            .send(&mut || Ok(Http::bulk(self.req("GET", path))))?;
        match response.status().as_u16() {
            200 => {}
            404 => {
                return Err(RemoteError::new(
                    RemoteErrorKind::NotFound,
                    "not on the server",
                ));
            }
            other => return Err(fail(other, "reading a file", response)),
        }
        let version = response
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .filter(|e| Self::strong(e))
            .ok_or_else(|| {
                RemoteError::new(
                    RemoteErrorKind::Refused,
                    "the server gives no strong ETag for this file",
                )
            })?;
        let expected = response.content_length();
        let mut total = 0_u64;
        let mut buf = vec![0_u8; 1 << 16];
        loop {
            let n = response
                .read(&mut buf)
                .map_err(|e| RemoteError::new(RemoteErrorKind::Unreachable, e.to_string()))?;
            if n == 0 {
                break;
            }
            sink.put(&buf[..n])?;
            total += n as u64;
        }
        if expected.is_some_and(|e| e != total) {
            return Err(RemoteError::new(
                RemoteErrorKind::Unreachable,
                "the transfer ended before the whole file arrived",
            ));
        }
        Ok(Read {
            version,
            hash: None,
            size: total,
        })
    }

    fn write(
        &self,
        path: &str,
        condition: &Condition,
        meta: &Meta,
        source: &mut dyn Source,
    ) -> Result<Written> {
        let path = names::nfc(path);
        if let Some(why) = names::refused(false, &path) {
            return Err(RemoteError::new(RemoteErrorKind::NameInvalid, why));
        }
        let mut parents_made = false;
        loop {
            let response = self.http.upload(source, meta.size, &mut |body| {
                let r = Http::bulk(self.req("PUT", &path)).body(body);
                Ok(match condition {
                    Condition::Absent => r.header("If-None-Match", "*"),
                    Condition::Version(v) => r.header("If-Match", v.as_str()),
                })
            })?;
            match response.status().as_u16() {
                200 | 201 | 204 => {
                    let version = self.landed(&response, &path, meta)?;
                    return Ok(Written { path, version });
                }
                412 => {
                    return Err(RemoteError::new(
                        RemoteErrorKind::Changed,
                        "the file on the server is not the version this was made from",
                    ));
                }
                // A folder above is missing (409 by the RFC, 404 by some).
                404 | 409 if !parents_made => {
                    parents_made = true;
                    self.ensure_parents(&path)?;
                }
                other => return Err(fail(other, "sending a file", response)),
            }
        }
    }

    fn delete(&self, path: &str, condition: &Condition) -> Result<()> {
        let Condition::Version(version) = condition else {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "a deletion names the version it deletes",
            ));
        };
        let response = self.http.send(&mut || {
            Ok(self
                .req("DELETE", path)
                .header("If-Match", version.as_str()))
        })?;
        match response.status().as_u16() {
            200 | 202 | 204 | 404 => Ok(()),
            412 => Err(RemoteError::new(
                RemoteErrorKind::Changed,
                "the file on the server changed before it was deleted",
            )),
            other => Err(fail(other, "deleting a file", response)),
        }
    }

    fn rename(&self, from: &str, to: &str, condition: &Condition) -> Result<Written> {
        let Condition::Version(version) = condition else {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "a rename names the version it moves",
            ));
        };
        let to = names::nfc(to);
        if let Some(why) = names::refused(false, &to) {
            return Err(RemoteError::new(RemoteErrorKind::NameInvalid, why));
        }
        let mut parents_made = false;
        loop {
            let destination = self.url(&to);
            let response = self.http.send(&mut || {
                Ok(self
                    .req("MOVE", from)
                    .header("Destination", destination.as_str())
                    .header("Overwrite", "F")
                    .header("If-Match", version.as_str()))
            })?;
            match response.status().as_u16() {
                201 | 204 | 200 => {
                    let there = self.stat(&to)?.ok_or_else(|| {
                        RemoteError::new(
                            RemoteErrorKind::Failed,
                            "the file is not on the server after it was moved",
                        )
                    })?;
                    let version = there.etag.filter(|e| Self::strong(e)).ok_or_else(|| {
                        RemoteError::new(
                            RemoteErrorKind::Refused,
                            "the server gives no strong ETag for the file it just moved",
                        )
                    })?;
                    return Ok(Written { path: to, version });
                }
                // Either precondition: the source is not that version, or
                // the destination exists. Look at the source to tell.
                412 => {
                    let changed = self
                        .stat(from)?
                        .is_none_or(|f| f.etag.as_deref() != Some(version.as_str()));
                    return Err(if changed {
                        RemoteError::new(
                            RemoteErrorKind::Changed,
                            "the file on the server changed before it was moved",
                        )
                    } else {
                        RemoteError::new(
                            RemoteErrorKind::Exists,
                            "the new name is taken on the server",
                        )
                    });
                }
                404 => {
                    return Err(RemoteError::new(
                        RemoteErrorKind::Changed,
                        "the file is gone from the server",
                    ));
                }
                409 if !parents_made => {
                    parents_made = true;
                    self.ensure_parents(&to)?;
                }
                other => return Err(fail(other, "moving a file", response)),
            }
        }
    }
}

#[cfg(test)]
mod tests;
