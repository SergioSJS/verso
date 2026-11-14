// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Whether a newer version exists, for the admin page (the maintainer's
//! answer E of 2026-10-09; ADR 0075 item 7). The server never updates
//! itself: the host pulls the new image or installs the new package. Once
//! at start and once a day it asks the project's release feed — the only
//! place it reaches (ADR 0050 as revised that day) — and nothing about the
//! server goes with the request but its version, in the `User-Agent`.
//! `VERSO_UPDATE_CHECK=off` turns it off. The repository is public
//! (2026-11-14): a token (`VERSO_UPDATE_TOKEN`) only raises GitHub's limit
//! for questions without one.

use std::sync::Arc;
use std::time::Duration;

use crate::state::Server;

const FEED: &str = "https://api.github.com/repos/SergioSJS/verso/releases?per_page=30";
const EVERY: Duration = Duration::from_secs(24 * 3600);

/// A version as `0.6.0-beta.1` writes it: the three numbers, and the
/// pre-release's parts; a release is newer than its pre-releases.
#[derive(Debug, PartialEq, Eq)]
struct Version {
    core: [u64; 3],
    pre: Vec<String>,
}

fn parse(v: &str) -> Option<Version> {
    let v = v.trim_start_matches('v');
    let (core, pre) = v.split_once('-').map_or((v, None), |(c, p)| (c, Some(p)));
    let mut n = core.split('.').map(|x| x.parse::<u64>().ok());
    let core = [n.next()??, n.next()??, n.next()??];
    Some(Version {
        core,
        pre: pre
            .map(|p| p.split('.').map(str::to_owned).collect())
            .unwrap_or_default(),
    })
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        use std::cmp::Ordering;
        self.core
            .cmp(&other.core)
            .then_with(|| match (self.pre.is_empty(), other.pre.is_empty()) {
                (true, true) => Ordering::Equal,
                (true, false) => Ordering::Greater,
                (false, true) => Ordering::Less,
                (false, false) => {
                    for (a, b) in self.pre.iter().zip(&other.pre) {
                        let o = match (a.parse::<u64>(), b.parse::<u64>()) {
                            (Ok(x), Ok(y)) => x.cmp(&y),
                            (Ok(_), Err(_)) => Ordering::Less,
                            (Err(_), Ok(_)) => Ordering::Greater,
                            (Err(_), Err(_)) => a.cmp(b),
                        };
                        if o != Ordering::Equal {
                            return o;
                        }
                    }
                    self.pre.len().cmp(&other.pre.len())
                }
            })
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(serde::Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// The newest version of the feed above `current`: a test release counts
/// only for a server that runs one.
fn newest(current: &str, releases: &[Release]) -> Option<String> {
    let now = parse(current)?;
    let betas = !now.pre.is_empty();
    releases
        .iter()
        .filter(|r| !r.draft && (betas || !r.prerelease))
        .filter_map(|r| {
            parse(&r.tag_name).map(|v| (v, r.tag_name.trim_start_matches('v').to_owned()))
        })
        .filter(|(v, _)| *v > now)
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(_, tag)| tag)
}

/// The client the feed is asked with. It follows no redirect (ADR 0083
/// item 8, F23): the feed is one fixed address, and a redirect — to a
/// private address, the cloud's metadata — is answered as the error it
/// is, never fetched.
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("verso-server/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())
}

async fn ask(token: Option<&str>) -> Result<Vec<Release>, String> {
    let client = client()?;
    let mut request = client
        .get(FEED)
        .header("Accept", "application/vnd.github+json");
    if let Some(t) = token {
        request = request.bearer_auth(t);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(if status.as_u16() == 404 && token.is_none() {
            "the release feed answered 404: no release is published there yet".to_owned()
        } else if matches!(status.as_u16(), 403 | 429) && token.is_none() {
            // GitHub limits questions without a token by address: a
            // server restarted often, or behind a shared address, meets it.
            format!(
                "the release feed answered {status}: too many checks without a token from this address; it is asked again later, or set VERSO_UPDATE_TOKEN"
            )
        } else {
            format!("the release feed answered {status}")
        });
    }
    response.json().await.map_err(|e| e.to_string())
}

/// Ask now and then once a day, for as long as the server runs.
pub async fn watch(server: Arc<Server>, token: Option<String>) {
    let mut said = false;
    loop {
        match ask(token.as_deref()).await {
            Ok(releases) => {
                let found = newest(env!("CARGO_PKG_VERSION"), &releases);
                if let Some(v) = &found {
                    crate::log::info(&format!("a newer version is out: {v}"));
                }
                *verso_service::lock(&server.newer) = found;
                said = false;
            }
            Err(e) if !said => {
                crate::log::warn(&format!("update check: {e}"));
                said = true;
            }
            Err(_) => {}
        }
        tokio::time::sleep(EVERY).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(tag: &str, prerelease: bool) -> Release {
        Release {
            tag_name: tag.to_owned(),
            draft: false,
            prerelease,
        }
    }

    #[test]
    fn versions_order_as_semver_does() {
        let v = |s: &str| parse(s).unwrap();
        assert!(v("0.6.0") > v("0.6.0-beta.2"));
        assert!(v("0.6.0-beta.10") > v("0.6.0-beta.2"));
        assert!(v("0.7.0-beta.1") > v("0.6.0"));
        assert!(v("v1.0.0") > v("0.99.99"));
        assert!(parse("x.y").is_none());
    }

    #[test]
    fn a_beta_server_sees_betas_and_a_release_server_releases() {
        let feed = [
            r("v0.6.0-beta.1", true),
            r("v0.7.0-beta.1", true),
            r("v0.6.1", false),
        ];
        assert_eq!(
            newest("0.6.0-beta.1", &feed).as_deref(),
            Some("0.7.0-beta.1")
        );
        assert_eq!(newest("0.6.0", &feed).as_deref(), Some("0.6.1"));
        assert_eq!(newest("0.6.1", &feed), None);
    }

    /// The feed's client follows no redirect (ADR 0083 item 8, F23): a
    /// feed that answered with one to a private address would otherwise
    /// have it fetched.
    #[test]
    fn the_feeds_client_follows_no_redirect() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        crate::tests::block_on(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            tokio::spawn(async move {
                while let Ok((mut tcp, _)) = listener.accept().await {
                    let mut buf = [0_u8; 1024];
                    let n = tcp.read(&mut buf).await.unwrap_or(0);
                    let asked = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let answer = if asked.starts_with("GET /private") {
                        "HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nsecret"
                            .to_owned()
                    } else {
                        format!(
                            "HTTP/1.1 302 Found\r\nLocation: http://{addr}/private\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        )
                    };
                    let _ = tcp.write_all(answer.as_bytes()).await;
                }
            });
            let res = client()
                .unwrap()
                .get(format!("http://{addr}/feed"))
                .send()
                .await
                .unwrap();
            assert_eq!(res.status().as_u16(), 302);
        });
    }
}
