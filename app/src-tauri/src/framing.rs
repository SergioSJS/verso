//! Whether a web page may be shown in a frame of the app (ADR 0056,
//! revised 2026-10-15): an embed is a real `<iframe>` when the site
//! allows being framed by the app's origin, and a child web view when it
//! does not. The decision is the site's own headers, read here with
//! the rules a browser applies; nothing of the page is fetched.

use super::*;

/// The origin of the app's own page, the ancestor a site is asked about:
/// `tauri://localhost` on macOS and Linux, `http(s)://tauri.localhost` on
/// Windows, the dev server's in a debug build.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Ancestor {
    pub(crate) scheme: String,
    pub(crate) host: String,
    pub(crate) port: Option<u16>,
}

impl Ancestor {
    pub(crate) fn of(url: &tauri::Url) -> Option<Ancestor> {
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
fn source_matches(source: &str, app: &Ancestor) -> bool {
    let source = source.to_ascii_lowercase();
    if source == "*" {
        return app.is_network();
    }
    // 'none', 'self' (the site's own origin is not the app's), nonces,
    // hashes and keywords: none of them names the app.
    if source.starts_with('\'') {
        return false;
    }
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
fn frame_ancestors_allow(values: &[String], app: &Ancestor) -> bool {
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
pub(crate) fn may_be_framed(
    x_frame_options: &[String],
    content_security_policy: &[String],
    app: &Ancestor,
) -> bool {
    !x_frame_options_forbids(x_frame_options) && frame_ancestors_allow(content_security_policy, app)
}

/// Whether `host` names this machine or its network: the names a
/// redirect from a public page may not send the check to.
fn is_local_host(host: &str) -> bool {
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
pub(crate) struct Verdict {
    pub(crate) frameable: bool,
    pub(crate) origins: Vec<String>,
}

const MAX_REDIRECTS: usize = 5;

fn headers_of(response: &reqwest::blocking::Response, name: &str) -> Vec<String> {
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
pub(crate) fn check(url: &tauri::Url, app: &Ancestor, user_agent: &str) -> Verdict {
    let no = Verdict {
        frameable: false,
        origins: Vec::new(),
    };
    let Ok(client) = reqwest::blocking::Client::builder()
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
        let mut response = client.head(current.clone()).send();
        let refused = match &response {
            Ok(r) => r.status().as_u16() >= 400 && !r.status().is_redirection(),
            Err(_) => true,
        };
        if refused {
            response = client.get(current.clone()).send();
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
    fn framed(xfo: &[&str], csp: &[&str], app: &Ancestor) -> bool {
        let x: Vec<String> = xfo.iter().map(|v| (*v).to_owned()).collect();
        let c: Vec<String> = csp.iter().map(|v| (*v).to_owned()).collect();
        may_be_framed(&x, &c, app)
    }

    #[test]
    fn no_headers_means_the_page_may_be_framed() {
        assert!(framed(&[], &[], &mac()));
        assert!(framed(&[""], &[], &mac()));
        assert!(framed(&[], &["default-src 'self'; img-src *"], &mac()));
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
            assert!(!framed(&[v], &[], &mac()), "{v}");
        }
        assert!(!framed(
            &["ALLOW-FROM https://tauri.localhost"],
            &[],
            &windows()
        ));
        assert!(!framed(&["allow-from https://x.test"], &[], &mac()));
        // Several values, or a list: one is enough.
        assert!(!framed(&["", "DENY"], &[], &mac()));
        assert!(!framed(&["SAMEORIGIN, SAMEORIGIN"], &[], &mac()));
        // A value no one can read stays on the safe side.
        assert!(!framed(&["whatever"], &[], &mac()));
    }

    #[test]
    fn frame_ancestors_none_self_and_other_hosts_forbid() {
        assert!(!framed(&[], &["frame-ancestors 'none'"], &windows()));
        assert!(!framed(&[], &["frame-ancestors 'self'"], &windows()));
        assert!(!framed(
            &[],
            &["frame-ancestors https://example.com"],
            &windows()
        ));
        assert!(!framed(
            &[],
            &["frame-ancestors 'self' *.owlbear.rodeo"],
            &mac()
        ));
        assert!(!framed(&[], &["frame-ancestors"], &mac()), "empty = none");
        assert!(!framed(&[], &["FRAME-ANCESTORS 'NONE'"], &windows()));
    }

    #[test]
    fn frame_ancestors_wildcard_covers_network_schemes_only() {
        assert!(framed(&[], &["frame-ancestors *"], &windows()));
        assert!(framed(&[], &["frame-ancestors *"], &dev()));
        // tauri:// is no network scheme: the spec's `*` does not cover it.
        assert!(!framed(&[], &["frame-ancestors *"], &mac()));
    }

    #[test]
    fn frame_ancestors_names_the_app_by_scheme_host_or_wildcard_host() {
        assert!(framed(&[], &["frame-ancestors http:"], &windows()));
        assert!(!framed(&[], &["frame-ancestors https:"], &windows()));
        assert!(framed(&[], &["frame-ancestors tauri:"], &mac()));
        assert!(framed(&[], &["frame-ancestors tauri://localhost"], &mac()));
        assert!(framed(
            &[],
            &["frame-ancestors http://tauri.localhost"],
            &windows()
        ));
        assert!(framed(
            &[],
            &["frame-ancestors http://*.localhost"],
            &windows()
        ));
        assert!(
            !framed(&[], &["frame-ancestors http://*.localhost"], &dev()),
            "no subdomain"
        );
        assert!(framed(
            &[],
            &["frame-ancestors http://localhost:5173"],
            &dev()
        ));
        assert!(!framed(
            &[],
            &["frame-ancestors http://localhost:3000"],
            &dev()
        ));
        assert!(framed(&[], &["frame-ancestors http://localhost:*"], &dev()));
        assert!(
            !framed(&[], &["frame-ancestors http://localhost"], &dev()),
            "port 5173 is not 80"
        );
        // A path is ignored; a scheme-less source needs a network app.
        assert!(framed(
            &[],
            &["frame-ancestors http://tauri.localhost/x"],
            &windows()
        ));
        assert!(framed(
            &[],
            &["frame-ancestors tauri.localhost"],
            &windows()
        ));
        assert!(!framed(&[], &["frame-ancestors localhost"], &mac()));
        // One matching source among others is enough.
        assert!(framed(
            &[],
            &["frame-ancestors 'self' https://a.test http://tauri.localhost"],
            &windows()
        ));
    }

    #[test]
    fn every_policy_and_every_header_must_allow() {
        assert!(!framed(
            &[],
            &["frame-ancestors *", "frame-ancestors 'none'"],
            &windows()
        ));
        assert!(!framed(
            &[],
            &["frame-ancestors *, frame-ancestors 'none'"],
            &windows()
        ));
        assert!(framed(
            &[],
            &["default-src 'none'", "frame-ancestors *"],
            &windows()
        ));
        // The directive is found among others, and only the first counts.
        assert!(framed(
            &[],
            &["default-src 'self'; frame-ancestors *; img-src 'none'"],
            &windows()
        ));
        // A directive that only mentions the word is not the directive.
        assert!(framed(&[], &["script-src frame-ancestors"], &windows()));
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
