// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync with a cloud the person already has (ADR 0104): WebDAV and S3 as
//! implementations of [`verso_core::sync::remote::Remote`], the checks
//! made when the person connects (a service that cannot guard a write
//! against another device's is refused), and nothing else. The desktop
//! host owns the secrets, the disk and the window; this crate owns the
//! requests. It reads and writes no file.

pub mod http;
pub mod names;
pub mod s3;
pub mod sigv4;
pub mod webdav;
pub mod xml;

#[cfg(any(test, feature = "fake"))]
pub mod testkit;

#[cfg(any(test, feature = "fake"))]
pub mod fake;
#[cfg(test)]
mod race;

use reqwest::blocking::Response;
use verso_core::sync::Cloud;
use verso_core::sync::remote::{Remote, RemoteError, RemoteErrorKind, Result};

pub use verso_core::sync::remote::hex;

/// The body of an answer as text, no more than `max` bytes of it: a
/// misconfigured or hostile endpoint answering a body that never ends must
/// not take the app's memory.
///
/// # Errors
/// [`RemoteErrorKind::Unreachable`] when the body cannot be read,
/// [`RemoteErrorKind::Failed`] when it is past `max`.
pub fn capped_text(response: Response, max: usize) -> Result<String> {
    use std::io::Read as _;
    let mut text = Vec::new();
    response
        .take(max as u64 + 1)
        .read_to_end(&mut text)
        .map_err(|e| RemoteError::new(RemoteErrorKind::Unreachable, e.to_string()))?;
    if text.len() > max {
        return Err(RemoteError::new(
            RemoteErrorKind::Failed,
            "the service's answer is too large to read",
        ));
    }
    Ok(String::from_utf8_lossy(&text).into_owned())
}

/// What happens to a file deleted from the cloud (ADR 0104 item 9),
/// said when the person connects.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Deletions {
    /// Final: the bucket or the server keeps nothing.
    Final,
    /// Kept, and how to get it back.
    Kept(String),
    /// The service did not say.
    Unknown,
}

/// The `detail` of the refusal of a service that cannot make a delete
/// conditional on the file's version (I-3, decided 2026-10-22): the window
/// says it in its language.
pub const DETAIL_NO_CONDITIONAL_DELETE: &str = "no_conditional_delete";

/// What connecting found, for the window to show before the first sync.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Report {
    pub provider: String,
    pub deletions: Deletions,
    /// Things the person should know that are not a refusal.
    pub notes: Vec<String>,
    /// The space left on the server, when it says.
    pub free: Option<u64>,
    /// What is in the cloud's folder already.
    pub files: u64,
    pub bytes: u64,
    /// What the service honours (the adapter's own names), kept in the
    /// folder's sync state.
    pub caps: Vec<String>,
}

/// The secret and the settings of a cloud, as the adapters take them.
fn s3_settings(cloud: &Cloud, secret: &str) -> s3::Settings {
    s3::Settings {
        endpoint: cloud.endpoint.clone(),
        bucket: cloud.bucket.clone(),
        prefix: cloud.prefix.clone(),
        region: cloud.region.clone(),
        access: cloud.user.clone(),
        secret: secret.to_owned(),
        path_style: cloud.path_style,
        plain_http: cloud.plain_http,
        caps: cloud.caps.clone(),
        ..s3::Settings::default()
    }
}

/// A remote for `cloud`, signed in with `secret`. Nothing is asked of the
/// service yet.
///
/// # Errors
/// [`RemoteErrorKind::Refused`] when the settings cannot be used (an
/// address that cannot carry a password, an unknown provider).
pub fn open(cloud: &Cloud, secret: &str) -> Result<Box<dyn Remote>> {
    match cloud.provider.as_str() {
        "webdav" => Ok(Box::new(webdav::WebDav::new(
            &cloud.endpoint,
            &cloud.user,
            secret,
            cloud.plain_http,
        )?)),
        "s3" => Ok(Box::new(s3::S3::new(s3_settings(cloud, secret))?)),
        other => Err(RemoteError::new(
            RemoteErrorKind::Refused,
            format!("{other} is not a cloud Verso syncs with yet"),
        )),
    }
}

/// The checks made when the person connects `cloud` (ADR 0104 item 7,
/// C.3b): the service must refuse a write against a version that is not
/// there, honour a new-file-only write, and give strong ETags. The report
/// says what else it found.
///
/// # Errors
/// [`RemoteErrorKind::Refused`] with the reason when the service cannot
/// keep a person's edits safe; [`RemoteErrorKind::Unreachable`] when it
/// could not be asked.
pub fn probe(cloud: &Cloud, secret: &str) -> Result<Report> {
    match cloud.provider.as_str() {
        "webdav" => {
            webdav::WebDav::new(&cloud.endpoint, &cloud.user, secret, cloud.plain_http)?.probe()
        }
        "s3" => s3::S3::new(s3_settings(cloud, secret))?.probe(),
        other => Err(RemoteError::new(
            RemoteErrorKind::Refused,
            format!("{other} is not a cloud Verso syncs with yet"),
        )),
    }
}

/// A short unique word for the names of our check files.
#[must_use]
pub fn nonce() -> String {
    use sha2::{Digest, Sha256};
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let mut h = Sha256::new();
    h.update(nanos.to_le_bytes());
    h.update(N.fetch_add(1, Ordering::Relaxed).to_le_bytes());
    h.update(std::process::id().to_le_bytes());
    hex(&h.finalize())[..16].to_owned()
}

const fn unreserved(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~')
}

fn encode(text: &str, keep_slash: bool) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(text.len());
    for b in text.bytes() {
        if unreserved(b) || (keep_slash && b == b'/') {
            out.push(char::from(b));
        } else {
            let _ = write!(out, "%{b:02X}");
        }
    }
    out
}

/// A path for a request: every byte but the unreserved ones and `/`
/// percent-encoded, as SigV4 canonicalizes it.
#[must_use]
pub fn pct_path(path: &str) -> String {
    encode(path, true)
}

/// A query component or a path segment: `/` encoded too.
#[must_use]
pub fn pct_component(text: &str) -> String {
    encode(text, false)
}

/// Percent-decoded text (a server's `href`).
#[must_use]
pub fn pct_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(hex) = text.get(i + 1..i + 3)
            && let Ok(b) = u8::from_str_radix(hex, 16)
        {
            out.push(b);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A response that is not the one expected, as an error: what the status
/// means for the person, never the server's words or the address.
#[must_use]
pub fn fail(status: u16, what: &str, _response: Response) -> RemoteError {
    status_error(status, what)
}

/// [`fail`] for an answer that has no body to read (a `HEAD`).
#[must_use]
pub fn fail_body(status: u16, what: &str, response: Response) -> RemoteError {
    fail(status, what, response)
}

fn status_error(status: u16, what: &str) -> RemoteError {
    match status {
        401 | 403 => RemoteError::new(
            RemoteErrorKind::Refused,
            format!(
                "cloud sign-in refused ({status}) while {what}: check the user and the password, and that the account may write here"
            ),
        ),
        404 => RemoteError::new(RemoteErrorKind::NotFound, format!("not found while {what}")),
        405 => RemoteError::new(
            RemoteErrorKind::Refused,
            format!("the server does not allow this while {what}: is the address a WebDAV folder?"),
        ),
        412 => RemoteError::new(
            RemoteErrorKind::Changed,
            "the file there is not the version this was made from",
        ),
        423 => RemoteError::new(
            RemoteErrorKind::Failed,
            format!("the file is locked on the server ({what})"),
        ),
        507 => RemoteError::new(RemoteErrorKind::Quota, "the server has no space left"),
        500 | 502 | 504 => RemoteError::new(
            RemoteErrorKind::Unreachable,
            format!("the server answered {status} while {what}"),
        ),
        _ => RemoteError::new(
            RemoteErrorKind::Failed,
            format!("the server answered {status} while {what}"),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_encoded_as_sigv4_wants_and_decoded_back() {
        assert_eq!(pct_path("a b/é.md"), "a%20b/%C3%A9.md");
        assert_eq!(pct_component("a/b"), "a%2Fb");
        assert_eq!(pct_path("A-z_0.9~"), "A-z_0.9~");
        assert_eq!(pct_decode(&pct_path("a b/é+&.md")), "a b/é+&.md");
        assert_eq!(pct_decode("100%"), "100%");
    }

    #[test]
    fn an_unknown_provider_is_refused() {
        let cloud = Cloud {
            provider: "ftp".to_owned(),
            ..Cloud::default()
        };
        assert_eq!(
            open(&cloud, "").err().unwrap().kind,
            RemoteErrorKind::Refused
        );
    }
}
