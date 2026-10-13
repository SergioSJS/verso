// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `/.well-known/security.txt` (RFC 9116; ADR 0083 item 15): where to
//! report a vulnerability, served by every server so that whoever finds
//! one on a host's server finds the project's address there. It says the
//! address, the languages, the policy and, behind an HTTPS public address,
//! the file's own address — nothing of the server, its accounts or its
//! configuration. Static text, behind the same `Host` check and headers as
//! every other answer (`http::guard`).
//!
//! `Expires` is a year after the release of the version this binary
//! carries: its date is the one `scripts/release.mjs prepare` writes into
//! `CHANGELOG.md` beside the version, read here at build time. A build
//! never released afresh tells a reader, a year on, that its contact may
//! be stale — which is what the field is for.

use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};

use crate::http::Ctx;

/// The address that takes reports (ADR 0083 item 15, decided 2026-10-13).
pub const CONTACT: &str = "mailto:security@versomd.com";

/// The policy: the repository's `SECURITY.md`.
pub const POLICY: &str = "https://github.com/SergioSJS/verso/blob/main/SECURITY.md";

const CHANGELOG: &str = include_str!("../../../CHANGELOG.md");

/// The date `version` was released on, as the changelog's heading says it
/// (`## 0.8.0-beta.1 — 2026-10-13`); `None` when the changelog has no such
/// heading.
#[must_use]
pub fn released(changelog: &str, version: &str) -> Option<String> {
    let heading = format!("## {version} — ");
    changelog.lines().find_map(|line| {
        let date = line.strip_prefix(&heading)?.trim();
        let ok = date.len() == 10
            && date.bytes().enumerate().all(|(i, b)| {
                if i == 4 || i == 7 {
                    b == b'-'
                } else {
                    b.is_ascii_digit()
                }
            });
        ok.then(|| date.to_owned())
    })
}

/// A year after `date` (`YYYY-MM-DD`), at midnight UTC, as RFC 9116 writes
/// it; 29 February moves to the 28th.
#[must_use]
pub fn a_year_after(date: &str) -> Option<String> {
    let year: u32 = date.get(..4)?.parse().ok()?;
    let rest = match date.get(4..)? {
        "-02-29" => "-02-28",
        r => r,
    };
    Some(format!("{}{rest}T00:00:00Z", year + 1))
}

/// The file, for a server whose public address is `public_url`.
#[must_use]
pub fn text(public_url: Option<&str>) -> String {
    let expires = released(CHANGELOG, env!("CARGO_PKG_VERSION"))
        .as_deref()
        .and_then(a_year_after);
    let mut out = format!("Contact: {CONTACT}\n");
    if let Some(e) = expires {
        out.push_str(&format!("Expires: {e}\n"));
    }
    out.push_str("Preferred-Languages: pt-BR, en\n");
    // RFC 9116 section 2.5.2: a canonical address is an HTTPS one.
    if let Some(u) = public_url.filter(|u| u.starts_with("https://")) {
        out.push_str(&format!("Canonical: {u}/.well-known/security.txt\n"));
    }
    out.push_str(&format!("Policy: {POLICY}\n"));
    out
}

/// `GET /.well-known/security.txt`.
pub async fn serve(ctx: Ctx) -> Response {
    let mut response = text(ctx.server.config.public_url.as_deref()).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{block_on, start};

    #[test]
    fn the_version_built_has_its_release_date_in_the_changelog() {
        let date = released(CHANGELOG, env!("CARGO_PKG_VERSION"));
        assert!(
            date.is_some(),
            "CHANGELOG.md has no '## {} — YYYY-MM-DD' heading",
            env!("CARGO_PKG_VERSION")
        );
        assert_eq!(
            released("## 0.1.0 — 2026-01-31\n", "0.1.0").as_deref(),
            Some("2026-01-31")
        );
        assert_eq!(released("## 0.1.0 — soon\n", "0.1.0"), None);
        assert_eq!(
            a_year_after("2026-10-13").as_deref(),
            Some("2027-10-13T00:00:00Z")
        );
        assert_eq!(
            a_year_after("2028-02-29").as_deref(),
            Some("2029-02-28T00:00:00Z")
        );
        assert_eq!(a_year_after("soon"), None);
    }

    #[test]
    fn a_canonical_address_only_behind_https() {
        assert!(
            text(Some("https://notas.casa"))
                .contains("\nCanonical: https://notas.casa/.well-known/security.txt\n")
        );
        assert!(!text(Some("http://notas.casa")).contains("Canonical:"));
        assert!(!text(None).contains("Canonical:"));
    }

    /// The route answers with the fields RFC 9116 asks, `Expires` a year
    /// after the release the changelog dates — not checked against today:
    /// a stale `Expires` is what a reader of an old build should see, and
    /// a test that turned red with the calendar would have no PR to blame
    /// (ADR 0029) — the server's headers, and nothing for a name not the
    /// server's.
    #[test]
    fn the_route_says_where_to_report_and_until_when() {
        block_on(async {
            let r = start().await;
            let res = reqwest::get(r.url("/.well-known/security.txt"))
                .await
                .unwrap();
            assert_eq!(res.status().as_u16(), 200);
            let h = res.headers().clone();
            assert!(
                h["content-type"]
                    .to_str()
                    .unwrap()
                    .starts_with("text/plain")
            );
            assert_eq!(h["x-content-type-options"], "nosniff");
            assert!(h.contains_key("content-security-policy"));
            let body = res.text().await.unwrap();
            let field = |name: &str| {
                body.lines()
                    .find_map(|l| l.strip_prefix(&format!("{name}: ")))
                    .map(str::to_owned)
            };
            assert_eq!(
                field("Contact").as_deref(),
                Some("mailto:security@versomd.com")
            );
            assert_eq!(field("Preferred-Languages").as_deref(), Some("pt-BR, en"));
            assert_eq!(field("Policy").as_deref(), Some(POLICY));
            // RFC 9116's form, the changelog's date with the year after
            // (29 February to the 28th), worked out here on its own.
            let date = released(CHANGELOG, env!("CARGO_PKG_VERSION")).unwrap();
            let year: u32 = date[..4].parse().unwrap();
            let day = if &date[4..] == "-02-29" {
                "-02-28"
            } else {
                &date[4..]
            };
            assert_eq!(
                field("Expires"),
                Some(format!("{}{day}T00:00:00Z", year + 1))
            );
            // Only what RFC 9116 asks: five fields at most, no comment.
            assert!(body.lines().all(|l| l.contains(": ")));
            assert!(body.lines().count() <= 5);

            let other = reqwest::Client::new()
                .get(r.url("/.well-known/security.txt"))
                .header("host", "outro.exemplo")
                .send()
                .await
                .unwrap();
            assert_eq!(other.status().as_u16(), 421);
        });
    }
}
