// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! S3 and S3-compatible services as a remote of sync (ADR 0104 items 6 to
//! 11): a bucket and a prefix, listed with `ListObjectsV2`, objects read
//! with `GET`, written with `PUT` against the base's ETag (`If-Match`) or
//! `If-None-Match: *` for a new file — multipart for a large one, its
//! `CompleteMultipartUpload` conditional where the service honours that —
//! deleted with `DELETE` and moved by a conditional `CopyObject` and a
//! delete after the copy's size and hash were checked. Requests are signed
//! with SigV4 ([`crate::sigv4`]). What the service honours is found when
//! the person connects ([`S3::probe`]); one that does not honour
//! `If-Match` and `If-None-Match` on a write is refused.

use std::io::Read as _;

use reqwest::Url;
use reqwest::blocking::{Body, RequestBuilder, Response};
use sha2::{Digest, Sha256};
use verso_core::sync::remote::{
    Change, Condition, Entry, Listing, Meta, Read, Remote, RemoteError, RemoteErrorKind, Result,
    Sink, Source, Written, hex,
};

use crate::http::{Http, check_transport};
use crate::names;
use crate::sigv4::{Signer, stamp_now};
use crate::xml::{self, Ev};
use crate::{
    DETAIL_NO_CONDITIONAL_DELETE, Deletions, Report, capped_text, fail_body, nonce, pct_component,
    pct_path,
};

/// Names of what the probe found the service honours, as the state keeps
/// them.
pub const CAP_CHECKSUM: &str = "checksum";
pub const CAP_DELETE_IF_MATCH: &str = "delete_if_match";
pub const CAP_COPY_IF_NONE_MATCH: &str = "copy_if_none_match";
pub const CAP_MULTIPART_CONDITIONAL: &str = "multipart_conditional";

/// The metadata that carries a file's SHA-256, so that another device need
/// not read the file to know it.
const META_HASH: &str = "x-amz-meta-verso-sha256";
/// The most an answer may be, in bytes: every one but a listing page is a
/// few lines of XML.
const ANSWER_MAX: usize = 1 << 20;
/// The most a page of a listing may be: a thousand keys of 1024 bytes
/// with their metadata fit many times over.
const LISTING_PAGE_MAX: usize = 16 << 20;
/// A file past this many bytes crosses in parts.
const SINGLE_MAX: u64 = 100 << 20;
/// A part: well past S3's 5 MiB minimum, and ten thousand of them reach
/// far beyond the 1 GiB sync carries.
const PART: usize = 16 << 20;
const EMPTY: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/// What the person gave, and found about the service.
#[derive(Debug, Clone, Default)]
pub struct Settings {
    /// Empty: AWS, whose address follows from the region.
    pub endpoint: String,
    pub bucket: String,
    pub prefix: String,
    pub region: String,
    pub access: String,
    pub secret: String,
    /// The bucket in the path, not the host.
    pub path_style: bool,
    pub plain_http: bool,
    pub caps: Vec<String>,
    /// A file past this many bytes crosses in parts; 0 is the default,
    /// 100 MiB. For the tests, which cannot send a hundred megabytes.
    pub single_max: u64,
    /// The size of a part; 0 is the default, 16 MiB.
    pub part_size: usize,
}

/// A prefix of a bucket.
pub struct S3 {
    http: Http,
    s: Settings,
    /// `scheme://host[:port]` of requests, and the path they start with
    /// (`/bucket` in path style).
    origin: Url,
    base_path: String,
}

impl S3 {
    /// A client for the bucket and prefix in `settings`.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Refused`] when the address cannot carry a secret.
    pub fn new(settings: Settings) -> Result<Self> {
        let bad = |why: &str| RemoteError::new(RemoteErrorKind::Refused, why.to_owned());
        if settings.bucket.trim().is_empty() {
            return Err(bad("name the bucket"));
        }
        let region = if settings.region.trim().is_empty() {
            "us-east-1".to_owned()
        } else {
            settings.region.trim().to_owned()
        };
        let mut settings = Settings { region, ..settings };
        settings.prefix = settings.prefix.trim_matches('/').to_owned();
        let (mut origin, path_style) = if settings.endpoint.trim().is_empty() {
            let dotted = settings.bucket.contains('.');
            if settings.path_style || dotted {
                (
                    format!("https://s3.{}.amazonaws.com", settings.region),
                    true,
                )
            } else {
                (
                    format!(
                        "https://{}.s3.{}.amazonaws.com",
                        settings.bucket, settings.region
                    ),
                    false,
                )
            }
        } else {
            (
                settings.endpoint.trim().trim_end_matches('/').to_owned(),
                true,
            )
        };
        if !origin.contains("://") {
            origin = format!("https://{origin}");
        }
        let origin = Url::parse(&origin).map_err(|_| bad("this is not an address"))?;
        if !origin.username().is_empty() || origin.password().is_some() || origin.path() != "/" {
            return Err(bad(
                "the endpoint is an address without a path, a user or a password: the bucket and the prefix have fields of their own",
            ));
        }
        check_transport(&origin, settings.plain_http)?;
        let base_path = if path_style {
            format!("/{}", pct_component(&settings.bucket))
        } else {
            String::new()
        };
        Ok(Self {
            http: Http::new()?,
            s: settings,
            origin,
            base_path,
        })
    }

    /// For the tests: waits of a few milliseconds.
    #[must_use]
    pub fn quick(mut self) -> Self {
        self.http.backoff = crate::http::Backoff {
            base: std::time::Duration::from_millis(1),
            cap: std::time::Duration::from_millis(10),
            tries: 5,
        };
        self
    }

    fn single_max(&self) -> u64 {
        if self.s.single_max == 0 {
            SINGLE_MAX
        } else {
            self.s.single_max
        }
    }

    fn part_size(&self) -> usize {
        if self.s.part_size == 0 {
            PART
        } else {
            self.s.part_size
        }
    }

    fn can(&self, cap: &str) -> bool {
        self.s.caps.iter().any(|c| c == cap)
    }

    /// The object key of `path`.
    fn key(&self, path: &str) -> String {
        if self.s.prefix.is_empty() {
            path.to_owned()
        } else {
            format!("{}/{path}", self.s.prefix)
        }
    }

    /// A signed request: `key` empty is the bucket. `headers` are signed
    /// too; the body's SHA-256 is `payload`.
    fn signed(
        &self,
        method: &str,
        key: &str,
        query: &[(&str, &str)],
        headers: &[(&str, String)],
        payload: &str,
    ) -> RequestBuilder {
        let path = if key.is_empty() {
            format!("{}/", self.base_path)
        } else {
            format!("{}/{}", self.base_path, pct_path(key))
        };
        let pairs: Vec<(String, String)> = query
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        let qs = pairs
            .iter()
            .map(|(k, v)| {
                if v.is_empty() {
                    pct_component(k)
                } else {
                    format!("{}={}", pct_component(k), pct_component(v))
                }
            })
            .collect::<Vec<_>>()
            .join("&");
        let mut url = self.origin.clone();
        url.set_path(&path);
        url.set_query((!qs.is_empty()).then_some(qs.as_str()));
        let host = url.port().map_or_else(
            || url.host_str().unwrap_or("").to_owned(),
            |p| format!("{}:{p}", url.host_str().unwrap_or("")),
        );
        let stamp = stamp_now();
        let mut signed: Vec<(String, String)> = vec![
            ("host".to_owned(), host),
            ("x-amz-content-sha256".to_owned(), payload.to_owned()),
            ("x-amz-date".to_owned(), stamp.clone()),
        ];
        for (k, v) in headers {
            signed.push(((*k).to_lowercase(), v.clone()));
        }
        // A key with an empty value (`?uploads`) signs as `uploads=`.
        let query_signed: Vec<(String, String)> = pairs;
        let authorization = Signer {
            access: &self.s.access,
            secret: &self.s.secret,
            region: &self.s.region,
        }
        .authorization(method, &path, &query_signed, &signed, payload, &stamp);
        let mut request = self
            .http
            .request(method, url.as_str())
            .header("Accept-Encoding", "identity")
            .header("x-amz-content-sha256", payload)
            .header("x-amz-date", stamp)
            .header("Authorization", authorization);
        for (k, v) in headers {
            request = request.header(*k, v.as_str());
        }
        request
    }

    fn send(
        &self,
        method: &str,
        key: &str,
        query: &[(&str, &str)],
        headers: &[(&str, String)],
    ) -> Result<Response> {
        self.http
            .send(&mut || Ok(self.signed(method, key, query, headers, EMPTY)))
    }

    /// The object's ETag, size and kept hash, or `None` when it is not
    /// there.
    fn head(&self, key: &str) -> Result<Option<Head>> {
        let response = self.send("HEAD", key, &[], &[])?;
        match response.status().as_u16() {
            404 => Ok(None),
            200 => {
                let h = response.headers();
                let text = |n: &str| h.get(n).and_then(|v| v.to_str().ok()).map(str::to_owned);
                Ok(Some(Head {
                    etag: text("etag").ok_or_else(|| {
                        RemoteError::new(RemoteErrorKind::Refused, "the service gives no ETag")
                    })?,
                    size: text("content-length")
                        .and_then(|n| n.trim().parse().ok())
                        .unwrap_or(0),
                    hash: text(META_HASH),
                }))
            }
            other => Err(fail_body(other, "looking at a file", response)),
        }
    }

    /// An `Error` document's code, when `body` is one.
    fn error_code(body: &str) -> Option<String> {
        let events = xml::events(body);
        events
            .iter()
            .any(|e| matches!(e, Ev::Open(n) if n == "Error"))
            .then(|| xml::first_text(&events, "Code").unwrap_or_default())
    }

    /// The answer `response` is, as an error, when it is one: S3 says some
    /// failures in a 200 (a copy, the end of a multipart upload).
    fn answer_error(&self, what: &str, response: Response) -> RemoteError {
        let status = response.status().as_u16();
        let body = capped_text(response, ANSWER_MAX).unwrap_or_default();
        let code = Self::error_code(&body).unwrap_or_default();
        match (status, code.as_str()) {
            (412, _) | (_, "PreconditionFailed" | "ConditionalRequestConflict") => {
                RemoteError::new(
                    RemoteErrorKind::Changed,
                    "the file in the bucket is not the version this was made from",
                )
            }
            (_, "NoSuchKey") => RemoteError::new(RemoteErrorKind::NotFound, "not in the bucket"),
            (_, "XAmzContentSHA256Mismatch" | "BadDigest" | "InvalidDigest") => RemoteError::new(
                RemoteErrorKind::Changed,
                "the bytes that arrived are not the bytes that were hashed",
            ),
            (_, "NotImplemented") | (501, _) => RemoteError::new(
                RemoteErrorKind::Refused,
                "the service does not support conditional writes",
            ),
            (_, "SignatureDoesNotMatch") => RemoteError::new(
                RemoteErrorKind::Refused,
                "cloud sign-in refused: the secret key does not match the access key, or the region is wrong",
            ),
            (_, "InvalidAccessKeyId") => RemoteError::new(
                RemoteErrorKind::Refused,
                "cloud sign-in refused: the service does not know this access key",
            ),
            (_, "RequestTimeTooSkewed") => RemoteError::new(
                RemoteErrorKind::Refused,
                "cloud sign-in refused: this computer's clock is more than 15 minutes off",
            ),
            (_, "AccessDenied") | (403, _) => RemoteError::new(
                RemoteErrorKind::Refused,
                "cloud sign-in refused: this key may not do that in the bucket (it needs to list, read, write and delete under the prefix)",
            ),
            (_, "NoSuchBucket") => RemoteError::new(
                RemoteErrorKind::Failed,
                "the bucket does not exist (or the region is wrong)",
            ),
            (_, "EntityTooLarge") => RemoteError::new(
                RemoteErrorKind::Failed,
                "the file is too large for the service",
            ),
            (_, "QuotaExceeded" | "MaxMessageLengthExceeded") | (507, _) => {
                RemoteError::new(RemoteErrorKind::Quota, "the bucket is full")
            }
            (s, c) => RemoteError::new(
                if matches!(s, 500 | 502 | 504) {
                    RemoteErrorKind::Unreachable
                } else {
                    RemoteErrorKind::Failed
                },
                format!(
                    "the service answered {s}{} while {what}",
                    if c.is_empty() {
                        String::new()
                    } else {
                        format!(" ({c})")
                    }
                ),
            ),
        }
    }

    fn checked(&self, what: &str, response: Response) -> Result<Response> {
        if response.status().is_success() {
            Ok(response)
        } else {
            Err(self.answer_error(what, response))
        }
    }

    /// The conditional headers a write holds.
    fn conditional(condition: &Condition) -> Vec<(&'static str, String)> {
        match condition {
            Condition::Absent => vec![("if-none-match", "*".to_owned())],
            Condition::Version(v) => vec![("if-match", v.clone())],
        }
    }

    /// A single `PutObject` of `meta.size` bytes streamed from `source`.
    fn put(
        &self,
        key: &str,
        condition: Option<&Condition>,
        meta: &Meta,
        source: &mut dyn Source,
    ) -> Result<String> {
        let checksum = base64_of_hex(&meta.hash);
        let mut headers = vec![(META_HASH, meta.hash.clone())];
        if self.can(CAP_CHECKSUM) {
            headers.push(("x-amz-checksum-sha256", checksum));
        }
        if let Some(c) = condition {
            headers.extend(Self::conditional(c));
        }
        let response = self.http.upload(source, meta.size, &mut |body: Body| {
            Ok(Http::bulk(self.signed("PUT", key, &[], &headers, &meta.hash)).body(body))
        })?;
        let response = self.checked("sending a file", response)?;
        let etag = response
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .ok_or_else(|| {
                RemoteError::new(
                    RemoteErrorKind::Refused,
                    "the service gives no ETag for the file it kept",
                )
            })?;
        Ok(etag)
    }

    /// The same bytes in parts, completed against `condition` where the
    /// service honours that, or under a temporary key and copied.
    fn multipart(
        &self,
        key: &str,
        condition: &Condition,
        meta: &Meta,
        source: &mut dyn Source,
    ) -> Result<String> {
        let direct = self.can(CAP_MULTIPART_CONDITIONAL);
        if !direct && !self.can(CAP_COPY_IF_NONE_MATCH) {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "this service cannot carry a file this large without risking another device's edit: it honours no condition on a multipart upload nor on a copy",
            ));
        }
        let target = if direct {
            key.to_owned()
        } else {
            self.key(&format!("{}/{}", names::TEMP_DIR, nonce()))
        };
        let upload = self.create_upload(&target, meta)?;
        let sent =
            self.parts_and_complete(&target, &upload, condition.clone(), direct, meta, source);
        let result = match sent {
            Ok(etag) if direct => Ok(etag),
            Ok(temp_etag) => self.copy_into(key, &target, &temp_etag, condition),
            Err(e) => {
                let _ = self.send("DELETE", &target, &[("uploadId", upload.as_str())], &[]);
                Err(e)
            }
        };
        if !direct {
            let _ = self.send("DELETE", &target, &[], &[]);
        }
        result
    }

    fn create_upload(&self, key: &str, meta: &Meta) -> Result<String> {
        let response = self.http.send(&mut || {
            Ok(self.signed(
                "POST",
                key,
                &[("uploads", "")],
                &[(META_HASH, meta.hash.clone())],
                EMPTY,
            ))
        })?;
        let body = capped_text(
            self.checked("starting a large upload", response)?,
            ANSWER_MAX,
        )?;
        xml::first_text(&xml::events(&body), "UploadId").ok_or_else(|| {
            RemoteError::new(RemoteErrorKind::Failed, "the service gave no upload id")
        })
    }

    fn parts_and_complete(
        &self,
        key: &str,
        upload: &str,
        condition: Condition,
        conditional: bool,
        meta: &Meta,
        source: &mut dyn Source,
    ) -> Result<String> {
        source.rewind()?;
        let mut etags = Vec::new();
        let part_size = self.part_size();
        let mut part: Vec<u8> = Vec::with_capacity(part_size);
        let mut number = 1_u32;
        let mut finished = false;
        while !finished {
            while part.len() < part_size {
                match source.next()? {
                    Some(piece) => part.extend_from_slice(&piece),
                    None => {
                        finished = true;
                        break;
                    }
                }
            }
            if part.is_empty() && number > 1 {
                break;
            }
            let digest = hex(&Sha256::digest(&part));
            let n = number.to_string();
            let response = self.http.send(&mut || {
                Ok(Http::bulk(self.signed(
                    "PUT",
                    key,
                    &[("partNumber", n.as_str()), ("uploadId", upload)],
                    &[],
                    &digest,
                ))
                .body(part.clone()))
            })?;
            let response = self.checked("sending a part of a large file", response)?;
            etags.push(
                response
                    .headers()
                    .get("etag")
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_owned)
                    .ok_or_else(|| {
                        RemoteError::new(
                            RemoteErrorKind::Failed,
                            "the service gave no ETag for a part",
                        )
                    })?,
            );
            part.clear();
            number += 1;
        }
        let mut doc = String::from("<CompleteMultipartUpload>");
        for (i, etag) in etags.iter().enumerate() {
            doc.push_str(&format!(
                "<Part><PartNumber>{}</PartNumber><ETag>{}</ETag></Part>",
                i + 1,
                etag.replace('"', "&quot;")
            ));
        }
        doc.push_str("</CompleteMultipartUpload>");
        let digest = hex(&Sha256::digest(doc.as_bytes()));
        let headers = if conditional {
            Self::conditional(&condition)
        } else {
            Vec::new()
        };
        let response = self.http.send(&mut || {
            Ok(self
                .signed("POST", key, &[("uploadId", upload)], &headers, &digest)
                .body(doc.clone()))
        })?;
        if !response.status().is_success() {
            return Err(self.answer_error("finishing a large upload", response));
        }
        let body = capped_text(response, ANSWER_MAX)?;
        // A failure can come in a 200.
        if let Some(code) = Self::error_code(&body) {
            return Err(match code.as_str() {
                "PreconditionFailed" | "ConditionalRequestConflict" => RemoteError::new(
                    RemoteErrorKind::Changed,
                    "the file in the bucket changed while the large upload went",
                ),
                other => RemoteError::new(
                    RemoteErrorKind::Failed,
                    format!("the service could not finish the large upload ({other})"),
                ),
            });
        }
        let etag = xml::first_text(&xml::events(&body), "ETag").ok_or_else(|| {
            RemoteError::new(
                RemoteErrorKind::Failed,
                "the service gave no ETag for the large file",
            )
        })?;
        let size = self.head(key)?.map(|h| h.size);
        if size.is_some_and(|s| s != meta.size) {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "the service kept a different number of bytes than were sent",
            ));
        }
        Ok(etag)
    }

    /// `CopyObject` from `from_key` (at `from_etag`) to `to_key`, only if
    /// the destination is as `condition` says: the temporary key of a
    /// large file becoming the file.
    fn copy_into(
        &self,
        to_key: &str,
        from_key: &str,
        from_etag: &str,
        condition: &Condition,
    ) -> Result<String> {
        let source = format!("/{}/{}", pct_component(&self.s.bucket), pct_path(from_key));
        let mut headers = vec![
            ("x-amz-copy-source", source),
            ("x-amz-copy-source-if-match", from_etag.to_owned()),
        ];
        headers.extend(Self::conditional(condition));
        let response = self
            .http
            .send(&mut || Ok(self.signed("PUT", to_key, &[], &headers, EMPTY)))?;
        if !response.status().is_success() {
            return Err(self.answer_error("copying a file", response));
        }
        let body = capped_text(response, ANSWER_MAX)?;
        if let Some(code) = Self::error_code(&body) {
            return Err(match code.as_str() {
                "PreconditionFailed" | "ConditionalRequestConflict" => RemoteError::new(
                    RemoteErrorKind::Changed,
                    "the file in the bucket changed while the large upload went",
                ),
                other => RemoteError::new(
                    RemoteErrorKind::Failed,
                    format!("the service could not copy the large file ({other})"),
                ),
            });
        }
        xml::first_text(&xml::events(&body), "ETag").ok_or_else(|| {
            RemoteError::new(
                RemoteErrorKind::Failed,
                "the service gave no ETag for the copy",
            )
        })
    }

    /// The checks of ADR 0104 item 7 (C.3b) on objects of ours under
    /// `.verso-probe`, and what else the service honours (the capabilities
    /// the adapter uses).
    ///
    /// # Errors
    /// [`RemoteErrorKind::Refused`] with the reason, when the service
    /// cannot be trusted with a person's files.
    pub fn probe(&self) -> Result<Report> {
        // The bucket and the key: a listing under the prefix.
        let first = self.list_page("", None)?;
        let _ = first;
        let key = self.key(&format!("{}/{}", names::PROBE_DIR, nonce()));
        let mut report = Report {
            provider: "s3".to_owned(),
            deletions: Deletions::Unknown,
            notes: Vec::new(),
            free: None,
            files: 0,
            bytes: 0,
            caps: Vec::new(),
        };
        let result = self.probe_objects(&key, &mut report);
        // Cleaned up whatever happened.
        for k in [key.clone(), format!("{key}-copy"), format!("{key}-multi")] {
            let _ = self.send("DELETE", &k, &[], &[]);
        }
        self.abort_uploads_under(&key);
        result?;
        report.deletions = self.versioning();
        let listing = self.list(None)?;
        report.files = listing.changes.len() as u64;
        report.bytes = listing
            .changes
            .iter()
            .map(|c| {
                if let Change::Present(e) = c {
                    e.size
                } else {
                    0
                }
            })
            .sum();
        Ok(report)
    }

    fn versioning(&self) -> Deletions {
        let Ok(response) = self.send("GET", "", &[("versioning", "")], &[]) else {
            return Deletions::Unknown;
        };
        if !response.status().is_success() {
            return Deletions::Unknown;
        }
        let body = capped_text(response, ANSWER_MAX).unwrap_or_default();
        match xml::first_text(&xml::events(&body), "Status").as_deref() {
            Some("Enabled") => Deletions::Kept(
                "the bucket keeps earlier versions: a deleted file can be restored from the bucket"
                    .to_owned(),
            ),
            Some("Suspended") => Deletions::Final,
            _ => Deletions::Final,
        }
    }

    fn probe_objects(&self, key: &str, report: &mut Report) -> Result<()> {
        let refused = |why: &str| RemoteError::new(RemoteErrorKind::Refused, why.to_owned());
        let body = |text: &str| Meta {
            size: text.len() as u64,
            hash: hex(&Sha256::digest(text.as_bytes())),
        };
        let write = |condition: Condition, text: &str, checksum: bool| -> Result<Response> {
            let meta = body(text);
            let mut headers = Self::conditional(&condition);
            if checksum {
                headers.push(("x-amz-checksum-sha256", base64_of_hex(&meta.hash)));
            }
            let bytes = text.as_bytes().to_vec();
            self.http.send(&mut || {
                Ok(self
                    .signed("PUT", key, &[], &headers, &meta.hash)
                    .body(bytes.clone()))
            })
        };
        let first = write(Condition::Absent, "verso 1", false)?;
        if !first.status().is_success() {
            let status = first.status().as_u16();
            return Err(match status {
                412 | 501 | 400 => {
                    refused("the service does not accept a conditional write (If-None-Match)")
                }
                _ => self.answer_error("writing the check file", first),
            });
        }
        let etag = first
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .filter(|e| !e.starts_with("W/"))
            .ok_or_else(|| {
                refused("the service gives no strong ETag, so no write can be guarded")
            })?;
        if write(Condition::Absent, "verso 2", false)?
            .status()
            .as_u16()
            != 412
        {
            return Err(refused(
                "the service does not honour If-None-Match: it would overwrite a file another device just made",
            ));
        }
        if write(
            Condition::Version("\"verso-not-the-etag\"".to_owned()),
            "verso 3",
            false,
        )?
        .status()
        .as_u16()
            != 412
        {
            return Err(refused(
                "the service does not honour If-Match: it would overwrite a version it was told not to",
            ));
        }
        let right = write(Condition::Version(etag), "verso 4", false)?;
        if !right.status().is_success() {
            return Err(refused(
                "the service refused a write against the right ETag: it cannot guard writes",
            ));
        }
        let etag = right
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .unwrap_or_default();
        // The checksum header: honoured (a wrong one is refused) or not
        // used at all.
        let good = write(Condition::Version(etag.clone()), "verso 5", true)?;
        let etag = if good.status().is_success() {
            good.headers()
                .get("etag")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
                .unwrap_or(etag)
        } else {
            etag
        };
        if good.status().is_success() {
            let meta = body("verso 6");
            let wrong = base64_of_hex(&hex(&Sha256::digest(b"not those bytes")));
            let headers = vec![("if-match", etag.clone()), ("x-amz-checksum-sha256", wrong)];
            let bytes = b"verso 6".to_vec();
            let bad = self.http.send(&mut || {
                Ok(self
                    .signed("PUT", key, &[], &headers, &meta.hash)
                    .body(bytes.clone()))
            })?;
            if bad.status().as_u16() == 400 {
                report.caps.push(CAP_CHECKSUM.to_owned());
            } else {
                report
                    .notes
                    .push("the service ignores the checksum header: the signed payload hash guards the bytes instead".to_owned());
            }
        }
        let etag = self.head(key)?.map(|h| h.etag).unwrap_or(etag);
        // A delete against a wrong ETag.
        let del = self.send(
            "DELETE",
            key,
            &[],
            &[("if-match", "\"verso-not-the-etag\"".to_owned())],
        )?;
        if del.status().as_u16() == 412 {
            report.caps.push(CAP_DELETE_IF_MATCH.to_owned());
        } else {
            // The service ignored it (and deleted) or does not know it. A
            // delete that cannot hold to the version would lose an edit
            // another device makes in the short window between looking and
            // deleting: refused at connection (I-3, decided 2026-10-22),
            // like a service without a conditional write.
            return Err(refused(
                "the service does not honour If-Match on a delete: a delete could remove an edit another device just made",
            )
            .detailed(DETAIL_NO_CONDITIONAL_DELETE));
        }
        let _ = etag;
        // A copy to a name that is taken.
        let copy_key = format!("{key}-copy");
        let source = format!("/{}/{}", pct_component(&self.s.bucket), pct_path(key));
        let copy = |dest: &str| -> Result<Response> {
            let headers = vec![
                ("x-amz-copy-source", source.clone()),
                ("if-none-match", "*".to_owned()),
            ];
            self.http
                .send(&mut || Ok(self.signed("PUT", dest, &[], &headers, EMPTY)))
        };
        let a = copy(&copy_key)?;
        let a_ok = a.status().is_success()
            && Self::error_code(&capped_text(a, ANSWER_MAX).unwrap_or_default()).is_none();
        if a_ok {
            let b = copy(&copy_key)?;
            let twice = b.status().as_u16();
            let b_text = capped_text(b, ANSWER_MAX).unwrap_or_default();
            if twice == 412 || Self::error_code(&b_text).as_deref() == Some("PreconditionFailed") {
                report.caps.push(CAP_COPY_IF_NONE_MATCH.to_owned());
            }
        }
        // A multipart upload completed against a name that is taken.
        let multi_key = format!("{key}-multi");
        if self.multipart_probe(&multi_key)? {
            report.caps.push(CAP_MULTIPART_CONDITIONAL.to_owned());
        } else if !report.caps.iter().any(|c| c == CAP_COPY_IF_NONE_MATCH) {
            report.notes.push(
                "a file of more than 100 MiB cannot be carried safely by this service, and is listed as not synced".to_owned(),
            );
        }
        Ok(())
    }

    /// Whether a multipart upload's completion is refused when the key
    /// exists and `If-None-Match: *` is sent.
    fn multipart_probe(&self, key: &str) -> Result<bool> {
        let meta = Meta {
            size: 4,
            hash: hex(&Sha256::digest(b"verso")),
        };
        let one = |expect_taken: bool| -> Result<bool> {
            let Ok(upload) = self.create_upload(key, &meta) else {
                return Ok(false);
            };
            let outcome = self.probe_upload(key, &upload, expect_taken);
            // Open on every exit: a refused completion leaves the upload
            // open, and an open upload is billed until it is aborted. (After
            // a completion the abort is a 404, which is nothing.)
            self.abort_upload(key, &upload);
            outcome
        };
        // First: nothing there, so it must succeed. Second: taken, so it
        // must be refused.
        Ok(one(false)? && one(true)?)
    }

    /// Send one part and try to complete `upload` of `key` against
    /// `If-None-Match: *`: whether it ended as `expect_taken` says.
    fn probe_upload(&self, key: &str, upload: &str, expect_taken: bool) -> Result<bool> {
        let digest = hex(&Sha256::digest(b"verso"));
        let response = self.http.send(&mut || {
            Ok(self
                .signed(
                    "PUT",
                    key,
                    &[("partNumber", "1"), ("uploadId", upload)],
                    &[],
                    &digest,
                )
                .body(b"verso".to_vec()))
        })?;
        let Some(etag) = response
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
        else {
            return Ok(false);
        };
        let doc = format!(
            "<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>{}</ETag></Part></CompleteMultipartUpload>",
            etag.replace('"', "&quot;")
        );
        let digest = hex(&Sha256::digest(doc.as_bytes()));
        let headers = vec![("if-none-match", "*".to_owned())];
        let done = self.http.send(&mut || {
            Ok(self
                .signed("POST", key, &[("uploadId", upload)], &headers, &digest)
                .body(doc.clone()))
        })?;
        let status = done.status().as_u16();
        let text = capped_text(done, ANSWER_MAX).unwrap_or_default();
        let code = Self::error_code(&text);
        let refused = status == 412 || code.as_deref() == Some("PreconditionFailed");
        if expect_taken {
            Ok(refused)
        } else {
            Ok(status == 200 && code.is_none())
        }
    }

    /// Abort an open multipart upload; what the service answers does not
    /// matter.
    fn abort_upload(&self, key: &str, upload: &str) {
        let _ = self.send("DELETE", key, &[("uploadId", upload)], &[]);
    }

    /// Abort every open upload whose key starts with `key`: what the probe
    /// may have left, whatever way it ended.
    fn abort_uploads_under(&self, key: &str) {
        let Ok(response) = self.send("GET", "", &[("uploads", ""), ("prefix", key)], &[]) else {
            return;
        };
        if !response.status().is_success() {
            return;
        }
        let Ok(body) = capped_text(response, LISTING_PAGE_MAX) else {
            return;
        };
        let events = xml::events(&body);
        let mut at = 0;
        while at < events.len() {
            if !matches!(&events[at], Ev::Open(n) if n == "Upload") {
                at += 1;
                continue;
            }
            let end = events[at..]
                .iter()
                .position(|e| matches!(e, Ev::Close(n) if n == "Upload"))
                .map_or(events.len(), |p| at + p);
            let one = &events[at..end];
            at = end;
            if let (Some(k), Some(id)) = (
                xml::first_text(one, "Key"),
                xml::first_text(one, "UploadId"),
            ) {
                // The service's key is the whole key: the bucket's prefix
                // included, as the probe's was.
                if k.starts_with(key) {
                    self.abort_upload(&k, &id);
                }
            }
        }
    }

    fn list_page(&self, token: &str, _limit: Option<u32>) -> Result<(Vec<Entry>, Option<String>)> {
        let prefix = if self.s.prefix.is_empty() {
            String::new()
        } else {
            format!("{}/", self.s.prefix)
        };
        let mut query = vec![("list-type", "2"), ("prefix", prefix.as_str())];
        if !token.is_empty() {
            query.push(("continuation-token", token));
        }
        let response = self.send("GET", "", &query, &[])?;
        let response = self.checked("listing the bucket", response)?;
        let body = capped_text(response, LISTING_PAGE_MAX)?;
        let events = xml::events(&body);
        let mut out = Vec::new();
        let mut at = 0;
        while at < events.len() {
            if !matches!(&events[at], Ev::Open(n) if n == "Contents") {
                at += 1;
                continue;
            }
            let end = events[at..]
                .iter()
                .position(|e| matches!(e, Ev::Close(n) if n == "Contents"))
                .map_or(events.len(), |p| at + p);
            let one = &events[at..end];
            at = end;
            let (Some(key), Some(etag)) =
                (xml::first_text(one, "Key"), xml::first_text(one, "ETag"))
            else {
                continue;
            };
            let Some(rel) = key.strip_prefix(&prefix) else {
                continue;
            };
            if rel.is_empty() || rel.ends_with('/') || names::internal(rel) {
                continue;
            }
            out.push(Entry {
                path: rel.to_owned(),
                version: etag,
                hash: None,
                size: xml::first_text(one, "Size")
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0),
                by: None,
                device: None,
            });
        }
        let next = (xml::first_text(&events, "IsTruncated").as_deref() == Some("true"))
            .then(|| xml::first_text(&events, "NextContinuationToken"))
            .flatten();
        Ok((out, next))
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

/// What a `HEAD` found.
struct Head {
    etag: String,
    size: u64,
    hash: Option<String>,
}

/// A hash in hex as the base64 of its bytes, which is how S3 writes a
/// checksum.
fn base64_of_hex(hash: &str) -> String {
    use base64::Engine as _;
    let bytes: Vec<u8> = (0..hash.len() / 2)
        .filter_map(|i| u8::from_str_radix(&hash[2 * i..2 * i + 2], 16).ok())
        .collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn hex_of_base64(text: &str) -> Option<String> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(text.trim())
        .ok()
        .filter(|b| b.len() == 32)
        .map(|b| hex(&b))
}

impl Remote for S3 {
    fn list(&self, _after: Option<&str>) -> Result<Listing> {
        let mut changes = Vec::new();
        let mut token = String::new();
        loop {
            let (entries, next) = self.list_page(&token, None)?;
            changes.extend(entries.into_iter().map(Change::Present));
            match next {
                Some(t) => token = t,
                None => break,
            }
        }
        Ok(Listing {
            full: true,
            changes,
            cursor: None,
        })
    }

    fn fingerprint(&self, path: &str) -> Result<(String, String)> {
        if let Some(head) = self.head(&self.key(path))? {
            if let Some(hash) = head.hash.filter(|h| h.len() == 64) {
                return Ok((head.etag, hash));
            }
        } else {
            return Err(RemoteError::new(
                RemoteErrorKind::NotFound,
                "not in the bucket",
            ));
        }
        let mut sink = verso_core::sync::remote::HashingSink::default();
        let read = self.read(path, &mut sink)?;
        Ok((read.version, sink.finish()))
    }

    fn exists(&self, path: &str) -> Result<bool> {
        Ok(self.head(&self.key(path))?.is_some())
    }

    fn read(&self, path: &str, sink: &mut dyn Sink) -> Result<Read> {
        let key = self.key(path);
        let headers = [("x-amz-checksum-mode", "ENABLED".to_owned())];
        let mut response = self
            .http
            .send(&mut || Ok(Http::bulk(self.signed("GET", &key, &[], &headers, EMPTY))))?;
        match response.status().as_u16() {
            200 => {}
            404 => {
                return Err(RemoteError::new(
                    RemoteErrorKind::NotFound,
                    "not in the bucket",
                ));
            }
            _ => return Err(self.answer_error("reading a file", response)),
        }
        let text = |n: &str| {
            response
                .headers()
                .get(n)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
        };
        let version = text("etag").ok_or_else(|| {
            RemoteError::new(
                RemoteErrorKind::Refused,
                "the service gives no ETag for this file",
            )
        })?;
        // S3's own checksum of the whole object, when it keeps one.
        let hash = text("x-amz-checksum-sha256").and_then(|c| hex_of_base64(&c));
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
            hash,
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
        if let Some(why) = names::refused(true, &path) {
            return Err(RemoteError::new(RemoteErrorKind::NameInvalid, why));
        }
        let key = self.key(&path);
        let etag = if meta.size <= self.single_max() {
            self.put(&key, Some(condition), meta, source)?
        } else {
            self.multipart(&key, condition, meta, source)?
        };
        // Size and ETag after the transfer (ADR 0104 item 11).
        let there = self.head(&key)?.ok_or_else(|| {
            RemoteError::new(
                RemoteErrorKind::Failed,
                "the file is not in the bucket after it was sent",
            )
        })?;
        // The version answered is always the one our own write made, never
        // the `HEAD`'s: when they differ, another device's write (made
        // against the version ours created) landed in between, and
        // recording its ETag for our bytes would hide it for ever. With
        // ours, the next listing shows a different version, so the file is
        // fingerprinted and compared, and nothing is overwritten unseen.
        // The size says nothing then: the file is not ours any more.
        if same_etag(&there.etag, &etag) && there.size != meta.size {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "the service kept a different number of bytes than were sent",
            ));
        }
        Ok(Written {
            path,
            version: etag,
        })
    }

    fn delete(&self, path: &str, condition: &Condition) -> Result<()> {
        let Condition::Version(version) = condition else {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "a deletion names the version it deletes",
            ));
        };
        let key = self.key(path);
        let headers = if self.can(CAP_DELETE_IF_MATCH) {
            vec![("if-match", version.clone())]
        } else {
            // A connection made before the probe refused such a service
            // (I-3, 2026-10-22): look at the file just before. A short
            // window remains. A new connection to one is refused.
            match self.head(&key)? {
                None => return Ok(()),
                Some(h) if h.etag != *version => {
                    return Err(RemoteError::new(
                        RemoteErrorKind::Changed,
                        "the file in the bucket changed before it was deleted",
                    ));
                }
                Some(_) => Vec::new(),
            }
        };
        let response = self.send("DELETE", &key, &[], &headers)?;
        match response.status().as_u16() {
            200 | 204 | 404 => Ok(()),
            _ => Err(self.answer_error("deleting a file", response)),
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
        if let Some(why) = names::refused(true, &to) {
            return Err(RemoteError::new(RemoteErrorKind::NameInvalid, why));
        }
        let (from_key, to_key) = (self.key(from), self.key(&to));
        let source = self.head(&from_key)?;
        let source = match source {
            Some(h) if h.etag == *version => h,
            _ => {
                return Err(RemoteError::new(
                    RemoteErrorKind::Changed,
                    "the file in the bucket changed before it was moved",
                ));
            }
        };
        let mut headers = vec![
            (
                "x-amz-copy-source",
                format!("/{}/{}", pct_component(&self.s.bucket), pct_path(&from_key)),
            ),
            ("x-amz-copy-source-if-match", version.clone()),
        ];
        if self.can(CAP_COPY_IF_NONE_MATCH) {
            headers.push(("if-none-match", "*".to_owned()));
        } else if self.head(&to_key)?.is_some() {
            return Err(RemoteError::new(
                RemoteErrorKind::Exists,
                "the new name is taken in the bucket",
            ));
        }
        let response = self
            .http
            .send(&mut || Ok(self.signed("PUT", &to_key, &[], &headers, EMPTY)))?;
        if !response.status().is_success() {
            let e = self.answer_error("copying a file", response);
            return Err(
                if e.kind == RemoteErrorKind::Changed && self.can(CAP_COPY_IF_NONE_MATCH) {
                    // Either precondition: the source changed, or the name is
                    // taken. Look at the source to tell.
                    match self.head(&from_key)? {
                        Some(h) if h.etag == *version => RemoteError::new(
                            RemoteErrorKind::Exists,
                            "the new name is taken in the bucket",
                        ),
                        _ => e,
                    }
                } else {
                    e
                },
            );
        }
        let body = capped_text(response, ANSWER_MAX)?;
        if let Some(code) = Self::error_code(&body) {
            return Err(match code.as_str() {
                "PreconditionFailed" => RemoteError::new(
                    RemoteErrorKind::Changed,
                    "the file in the bucket changed before it was moved, or the new name is taken",
                ),
                other => RemoteError::new(
                    RemoteErrorKind::Failed,
                    format!("the copy failed ({other})"),
                ),
            });
        }
        // The copy's own ETag, as the service answered it: what is at the
        // new name after, if it is not that, is another device's.
        let copy_etag = xml::first_text(&xml::events(&body), "ETag").ok_or_else(|| {
            RemoteError::new(
                RemoteErrorKind::Failed,
                "the service gave no ETag for the copy",
            )
        })?;
        // The copy's size and hash, before the original goes.
        let copied = self.head(&to_key)?.ok_or_else(|| {
            RemoteError::new(RemoteErrorKind::Failed, "the copy is not in the bucket")
        })?;
        if !same_etag(&copied.etag, &copy_etag) {
            // Another device wrote the new name right after our copy (it
            // saw the copy in a listing). That file is theirs: it stays,
            // and so does the original; the next pass lists both.
            return Err(RemoteError::new(
                RemoteErrorKind::Changed,
                "the new name was written by another device while the file was moved",
            ));
        }
        if copied.size != source.size || copied.hash != source.hash {
            // A bad copy goes only against its own ETag. Without a
            // conditional delete it stays: a duplicate is recoverable, a
            // deleted file is not.
            if self.can(CAP_DELETE_IF_MATCH) {
                let _ = self.send("DELETE", &to_key, &[], &[("if-match", copy_etag)]);
            }
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "the copy is not the file that was copied",
            ));
        }
        self.delete(from, &Condition::Version(version.clone()))?;
        Ok(Written {
            path: to,
            version: copy_etag,
        })
    }
}

#[cfg(test)]
mod tests;
