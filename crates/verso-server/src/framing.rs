// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Whether a web page may be shown in a frame of the app (ADR 0056,
//! revised 2026-10-15): an embed is a real `<iframe>` when the site
//! allows being framed by the app's origin, and a child web view when it
//! does not (or a card on the web). The decision is the site's own
//! headers, read here with the rules a browser applies; nothing of the
//! page is fetched.

use reqwest::Url;

pub const WEB_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/// The origin of the app's own page, the ancestor a site is asked about:
/// `tauri://localhost` on macOS and Linux, `http(s)://tauri.localhost` on
/// Windows, the dev server's in a debug build, or None when asked by a
/// browser on the web.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ancestor {
    pub scheme: String,
    pub host: String,
    pub port: Option<u16>,
}

impl Ancestor {
    pub fn of(url: &Url) -> Option<Ancestor> {
        Some(Ancestor {
            scheme: url.scheme().to_ascii_lowercase(),
            host: url.host_str()?.to_ascii_lowercase(),
            port: url.port(),
        })
    }

    fn default_port(&self) -> Option<u16> {
        match self.scheme.as_str() {
            "http" | "ws" => Some(80),
            "https" | "wss" => Some(443),
            _ => None,
        }
    }

    /// The schemes the CSP spec calls network schemes: all `*` matches.
    fn is_network(&self) -> bool {
        matches!(self.scheme.as_str(), "http" | "https" | "ws" | "wss")
    }
}

pub fn embed_origin_of(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    match url.port() {
        Some(p) => Some(format!("{}://{}:{}", url.scheme(), host.to_lowercase(), p)),
        None => Some(format!("{}://{}", url.scheme(), host.to_lowercase())),
    }
}

/// Whether any `X-Frame-Options` value forbids the frame. `DENY`,
/// `SAMEORIGIN` and `ALLOW-FROM` all do (the app's origin is never the
/// site's, and `ALLOW-FROM` is not honoured by current browsers), and so
/// does a value nobody can read: a frame that stays empty is worse than
/// the child view. Only an empty header, which is no header, lets it by.
fn x_frame_options_forbids(values: &[String]) -> bool {
    values
        .iter()
        .flat_map(|v| v.split(','))
        .any(|v| !v.trim().is_empty())
}

/// Whether one source of a `frame-ancestors` list matches the app.
fn source_matches(source: &str, app: Option<&Ancestor>) -> bool {
    let source = source.to_ascii_lowercase();
    if source == "*" {
        return app.is_none_or(|a| a.is_network());
    }
    // 'none', 'self' (the site's own origin is not the app's), nonces,
    // hashes and keywords: none of them names the app.
    if source.starts_with('\'') {
        return false;
    }
    let Some(app) = app else {
        return false;
    };
    // A scheme alone: `https:`. `http:` also covers `https`.
    if let Some(scheme) = source.strip_suffix(':')
        && !scheme.contains('/')
    {
        return scheme == app.scheme || (scheme == "http" && app.scheme == "https");
    }
    let (scheme, rest) = match source.split_once("://") {
        Some((s, r)) => (Some(s), r),
        None => (None, source.as_str()),
    };
    match scheme {
        Some(s) if s != app.scheme && !(s == "http" && app.scheme == "https") => return false,
        // No scheme in the source: the page's own scheme, which is a
        // network one; a custom-scheme app is not covered by it.
        None if !matches!(app.scheme.as_str(), "http" | "https") => return false,
        _ => {}
    }
    // Paths do not count in `frame-ancestors`.
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) if p == "*" || (!p.is_empty() && p.bytes().all(|b| b.is_ascii_digit())) => {
            (h, Some(p))
        }
        _ => (authority, None),
    };
    let host_ok = if host == "*" {
        true
    } else if let Some(suffix) = host.strip_prefix("*.") {
        app.host.len() > suffix.len() + 1 && app.host.ends_with(&format!(".{suffix}"))
    } else {
        host == app.host
    };
    let port_ok = match port {
        Some("*") => true,
        Some(p) => p.parse::<u16>().ok().is_some_and(|p| {
            app.port == Some(p) || (app.port.is_none() && app.default_port() == Some(p))
        }),
        None => app.port.is_none() || app.port == app.default_port(),
    };
    host_ok && port_ok
}

/// Whether every `Content-Security-Policy` of the response lets the app
/// frame it. A header may carry several policies separated by commas, and
/// every one of them must allow; a policy without `frame-ancestors` has
/// no say. An empty `frame-ancestors` list allows nobody.
fn frame_ancestors_allow(values: &[String], app: Option<&Ancestor>) -> bool {
    values.iter().flat_map(|v| v.split(',')).all(|policy| {
        let directive = policy.split(';').map(str::trim).find(|d| {
            d.split_ascii_whitespace()
                .next()
                .is_some_and(|n| n.eq_ignore_ascii_case("frame-ancestors"))
        });
        match directive {
            None => true,
            Some(d) => d
                .split_ascii_whitespace()
                .skip(1)
                .any(|source| source_matches(source, app)),
        }
    })
}

/// Whether a response with these headers may be framed by the app.
pub fn may_be_framed(
    x_frame_options: &[String],
    content_security_policy: &[String],
    app: Option<&Ancestor>,
) -> bool {
    !x_frame_options_forbids(x_frame_options) && frame_ancestors_allow(content_security_policy, app)
}

/// Whether `host` names this machine or its network: the names a
/// redirect from a public page may not send the check to.
pub fn is_local_host(host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(v4) => is_local_v4(v4),
            std::net::IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
                Some(v4) => is_local_v4(v4),
                None => {
                    v6.is_loopback()
                        || v6.is_unspecified()
                        || (v6.segments()[0] & 0xfe00) == 0xfc00
                        || (v6.segments()[0] & 0xffc0) == 0xfe80
                }
            },
        };
    }
    let host = host.to_ascii_lowercase();
    !host.contains('.')
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
}

fn is_local_v4(ip: std::net::Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || (o[0] == 100 && (o[1] & 0xc0) == 64)
}

/// What the check found: whether the page may be framed, and the origins
/// the frame will visit (its own, and where redirects end), which the
/// navigation guard then lets an app view's frame load.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Verdict {
    pub frameable: bool,
    pub origins: Vec<String>,
}

const MAX_REDIRECTS: usize = 5;

fn headers_of(response: &reqwest::Response, name: &str) -> Vec<String> {
    response
        .headers()
        .get_all(name)
        .iter()
        .filter_map(|v| v.to_str().ok().map(str::to_owned))
        .collect()
}

/// Ask `url` — `HEAD`, and a `GET` read only as far as its headers when
/// `HEAD` fails or is refused — and judge the final response after at
/// most five redirects. A redirect to the local network from a public
/// page, a timeout, an error: not frameable (the child view takes it).
pub async fn check(url: &Url, app: Option<&Ancestor>, user_agent: &str) -> Verdict {
    let no = Verdict {
        frameable: false,
        origins: Vec::new(),
    };
    let Ok(client) = reqwest::Client::builder()
        .user_agent(user_agent)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(6))
        .build()
    else {
        return no;
    };
    let started_local = url.host_str().is_some_and(is_local_host);
    let mut origins: Vec<String> = embed_origin_of(url).into_iter().collect();
    let mut current = url.clone();
    for _ in 0..=MAX_REDIRECTS {
        let mut response = client.head(current.clone()).send().await;
        let refused = match &response {
            Ok(r) => r.status().as_u16() >= 400 && !r.status().is_redirection(),
            Err(_) => true,
        };
        if refused {
            response = client.get(current.clone()).send().await;
        }
        let Ok(response) = response else {
            return no;
        };
        if response.status().is_redirection() {
            let Some(next) = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|l| current.join(l).ok())
            else {
                return no;
            };
            if !matches!(next.scheme(), "http" | "https")
                || (!started_local && next.host_str().is_some_and(is_local_host))
            {
                return no;
            }
            origins.extend(embed_origin_of(&next));
            current = next;
            continue;
        }
        let frameable = may_be_framed(
            &headers_of(&response, "x-frame-options"),
            &headers_of(&response, "content-security-policy"),
            app,
        );
        origins.sort();
        origins.dedup();
        return Verdict {
            frameable,
            origins: if frameable { origins } else { Vec::new() },
        };
    }
    no
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mac() -> Ancestor {
        Ancestor {
            scheme: "tauri".into(),
            host: "localhost".into(),
            port: None,
        }
    }
    fn windows() -> Ancestor {
        Ancestor {
            scheme: "http".into(),
            host: "tauri.localhost".into(),
            port: None,
        }
    }
    fn dev() -> Ancestor {
        Ancestor {
            scheme: "http".into(),
            host: "localhost".into(),
            port: Some(5173),
        }
    }
    fn framed(xfo: &[&str], csp: &[&str], app: Option<&Ancestor>) -> bool {
        let x: Vec<String> = xfo.iter().map(|v| (*v).to_owned()).collect();
        let c: Vec<String> = csp.iter().map(|v| (*v).to_owned()).collect();
        may_be_framed(&x, &c, app)
    }

    #[test]
    fn no_headers_means_the_page_may_be_framed() {
        assert!(framed(&[], &[], Some(&mac())));
        assert!(framed(&[""], &[], Some(&mac())));
        assert!(framed(
            &[],
            &["default-src 'self'; img-src *"],
            Some(&mac())
        ));
        assert!(framed(&[], &[], None));
        assert!(framed(&[], &["default-src 'self'"], None));
    }

    #[test]
    fn x_frame_options_forbids_in_any_case() {
        for v in [
            "DENY",
            "deny",
            "Deny",
            "SAMEORIGIN",
            "sameorigin",
            " SameOrigin ",
        ] {
            assert!(!framed(&[v], &[], Some(&mac())), "{v}");
            assert!(!framed(&[v], &[], None), "{v}");
        }
        assert!(!framed(
            &["ALLOW-FROM https://tauri.localhost"],
            &[],
            Some(&windows())
        ));
        assert!(!framed(&["allow-from https://x.test"], &[], Some(&mac())));
        // Several values, or a list: one is enough.
        assert!(!framed(&["", "DENY"], &[], Some(&mac())));
        assert!(!framed(&["SAMEORIGIN, SAMEORIGIN"], &[], Some(&mac())));
        // A value no one can read stays on the safe side.
        assert!(!framed(&["whatever"], &[], Some(&mac())));
    }

    #[test]
    fn frame_ancestors_none_self_and_other_hosts_forbid() {
        assert!(!framed(&[], &["frame-ancestors 'none'"], Some(&windows())));
        assert!(!framed(&[], &["frame-ancestors 'self'"], Some(&windows())));
        assert!(!framed(
            &[],
            &["frame-ancestors https://example.com"],
            Some(&windows())
        ));
        assert!(!framed(
            &[],
            &["frame-ancestors 'self' *.owlbear.rodeo"],
            Some(&mac())
        ));
        assert!(
            !framed(&[], &["frame-ancestors"], Some(&mac())),
            "empty = none"
        );
        assert!(!framed(&[], &["FRAME-ANCESTORS 'NONE'"], Some(&windows())));
        assert!(!framed(&[], &["frame-ancestors 'none'"], None));
        assert!(!framed(&[], &["frame-ancestors 'self'"], None));
        assert!(!framed(&[], &["frame-ancestors https://example.com"], None));
    }

    #[test]
    fn frame_ancestors_wildcard_covers_network_schemes_only() {
        assert!(framed(&[], &["frame-ancestors *"], Some(&windows())));
        assert!(framed(&[], &["frame-ancestors *"], Some(&dev())));
        // tauri:// is no network scheme: the spec's `*` does not cover it.
        assert!(!framed(&[], &["frame-ancestors *"], Some(&mac())));
        assert!(framed(&[], &["frame-ancestors *"], None));
    }

    #[test]
    fn frame_ancestors_names_the_app_by_scheme_host_or_wildcard_host() {
        assert!(framed(&[], &["frame-ancestors http:"], Some(&windows())));
        assert!(!framed(&[], &["frame-ancestors https:"], Some(&windows())));
        assert!(framed(&[], &["frame-ancestors tauri:"], Some(&mac())));
        assert!(framed(
            &[],
            &["frame-ancestors tauri://localhost"],
            Some(&mac())
        ));
        assert!(framed(
            &[],
            &["frame-ancestors http://tauri.localhost"],
            Some(&windows())
        ));
        assert!(framed(
            &[],
            &["frame-ancestors http://*.localhost"],
            Some(&windows())
        ));
        assert!(
            !framed(&[], &["frame-ancestors http://*.localhost"], Some(&dev())),
            "no subdomain"
        );
        assert!(framed(
            &[],
            &["frame-ancestors http://localhost:5173"],
            Some(&dev())
        ));
        assert!(!framed(
            &[],
            &["frame-ancestors http://localhost:3000"],
            Some(&dev())
        ));
        assert!(framed(
            &[],
            &["frame-ancestors http://localhost:*"],
            Some(&dev())
        ));
        assert!(
            !framed(&[], &["frame-ancestors http://localhost"], Some(&dev())),
            "port 5173 is not 80"
        );
        // A path is ignored; a scheme-less source needs a network app.
        assert!(framed(
            &[],
            &["frame-ancestors http://tauri.localhost/x"],
            Some(&windows())
        ));
        assert!(framed(
            &[],
            &["frame-ancestors tauri.localhost"],
            Some(&windows())
        ));
        assert!(!framed(&[], &["frame-ancestors localhost"], Some(&mac())));
        // One matching source among others is enough.
        assert!(framed(
            &[],
            &["frame-ancestors 'self' https://a.test http://tauri.localhost"],
            Some(&windows())
        ));
    }

    #[test]
    fn every_policy_and_every_header_must_allow() {
        assert!(!framed(
            &[],
            &["frame-ancestors *", "frame-ancestors 'none'"],
            Some(&windows())
        ));
        assert!(!framed(
            &[],
            &["frame-ancestors *, frame-ancestors 'none'"],
            Some(&windows())
        ));
        assert!(framed(
            &[],
            &["default-src 'none'", "frame-ancestors *"],
            Some(&windows())
        ));
        // The directive is found among others, and only the first counts.
        assert!(framed(
            &[],
            &["default-src 'self'; frame-ancestors *; img-src 'none'"],
            Some(&windows())
        ));
        // A directive that only mentions the word is not the directive.
        assert!(framed(
            &[],
            &["script-src frame-ancestors"],
            Some(&windows())
        ));
    }

    #[test]
    fn local_names_are_recognised() {
        for h in [
            "localhost",
            "app.localhost",
            "nas.local",
            "router",
            "127.0.0.1",
            "10.0.0.5",
            "192.168.1.1",
            "172.16.0.1",
            "169.254.1.1",
            "100.64.0.1",
            "[::1]",
            "[fd00::1]",
            "[fe80::1]",
            "[::ffff:192.168.0.1]",
            "0.0.0.0",
        ] {
            assert!(is_local_host(h), "{h}");
        }
        for h in [
            "rolai.app",
            "example.com",
            "8.8.8.8",
            "100.128.0.1",
            "[2606:4700::1]",
        ] {
            assert!(!is_local_host(h), "{h}");
        }
    }
}
