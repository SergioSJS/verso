// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An own address by a tunnel's token (ADR 0117 D4 item 2, decided
//! 2026-11-13; R5), with a fake `cloudflared` that prints what the spike
//! of 2026-11-13 saw (`RESULTS-R5.md`). No test reaches the network.

use super::*;

const REFUSED: &str = "2026-11-14T02:59:52Z ERR Register tunnel error from server side error=\"Failed to get tunnel\" connIndex=0 event=0 ip=2606:4700:a0::9";

#[test]
fn the_token_run_names_the_listener_and_never_the_token() {
    let args: Vec<String> = named::token_run_args(7341, false)
        .iter()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    assert_eq!(
        args,
        [
            "tunnel",
            "--no-autoupdate",
            "run",
            "--url",
            "http://127.0.0.1:7341"
        ]
    );
    let h2: Vec<String> = named::token_run_args(7341, true)
        .iter()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    assert_eq!(&h2[2..4], ["--protocol", "http2"]);
    assert!(!args.iter().any(|a| a.contains("token")));
}

#[test]
fn a_token_is_one_word_of_base64() {
    let token = "eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYiLCJ0IjoiNmZmNDJhZTIifQ==";
    assert!(named::valid_token(token));
    for bad in [
        "",
        "short",
        "cloudflared service install eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlh",
        "eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYi\n",
    ] {
        assert!(!named::valid_token(bad), "{bad:?}");
    }
}

#[test]
fn cloudflare_refusing_the_tunnel_is_read_as_a_refusal() {
    assert_eq!(
        run::parse_line(REFUSED, false),
        Some(run::Seen::Refused("Failed to get tunnel".to_owned()))
    );
    assert!(
        Mode::Token {
            token: "t".repeat(40),
            hostname: "mesa.example.com".to_owned()
        }
        .own()
    );
    assert!(!Mode::Quick.own());
}

#[cfg(unix)]
mod unix {
    use std::time::{Duration, Instant};

    use super::*;
    use crate::tests::{FakeDoor, manager_with};

    const TOKEN: &str =
        "eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYiLCJ0IjoiNmZmNDJhZTIifQ==";

    /// The token reaches `cloudflared` in its environment, and its command
    /// line holds none: the fake registers only when `TUNNEL_TOKEN` is the
    /// token and no argument is.
    #[test]
    fn the_token_goes_in_the_environment_and_the_link_is_the_hostname() {
        let dir = tempfile::tempdir().unwrap();
        let seen = dir.path().join("args");
        let program = files::write_script(
            dir.path(),
            "cloudflared",
            &format!(
                "#!/bin/sh\necho \"$*\" > '{}'\nfor a in \"$@\"; do [ \"$a\" = '{TOKEN}' ] && exit 3; done\n[ \"$TUNNEL_TOKEN\" = '{TOKEN}' ] || exit 4\necho '2026-11-14T03:00:00Z INF Registered tunnel connection connIndex=0 location=gru20 protocol=quic' >&2\nexec sleep 600\n",
                seen.display()
            ),
        );
        let (m, _) = manager_with(CEILING);
        let door = FakeDoor::default();
        let view = m
            .start(
                Box::new(door.clone()),
                &program,
                Mode::Token {
                    token: TOKEN.to_owned(),
                    hostname: "mesa.example.com".to_owned(),
                },
            )
            .unwrap();
        assert_eq!(view.state, LinkState::On);
        assert_eq!(view.origin.as_deref(), Some("https://mesa.example.com"));
        assert!(view.own && view.until_ms.is_none(), "no ceiling");
        assert_eq!(door.calls(), ["open", "origin https://mesa.example.com"]);
        let args = String::from_utf8(files::read(&seen)).unwrap();
        assert!(args.contains("run --url http://127.0.0.1:4242"), "{args}");
        assert!(!args.contains(TOKEN));
        m.stop(LinkEnd::Stopped);
    }

    /// A token Cloudflare refuses ends the start at once, in its words —
    /// `cloudflared` itself retries it for ever — and closes the door.
    #[test]
    fn a_refused_token_fails_at_once_and_says_why() {
        let dir = tempfile::tempdir().unwrap();
        let program = files::write_script(
            dir.path(),
            "cloudflared",
            &format!("#!/bin/sh\necho '{REFUSED}' >&2\nexec sleep 600\n"),
        );
        let (m, _) = manager_with(CEILING);
        let door = FakeDoor::default();
        let started = Instant::now();
        let why = m
            .start(
                Box::new(door.clone()),
                &program,
                Mode::Token {
                    token: TOKEN.to_owned(),
                    hostname: "mesa.example.com".to_owned(),
                },
            )
            .unwrap_err();
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "no wait for the protocols"
        );
        assert!(
            why.contains("Cloudflare refused the tunnel: Failed to get tunnel"),
            "{why}"
        );
        assert_eq!(m.view().state, LinkState::Off);
        assert_eq!(m.view().ended, Some(LinkEnd::Failed));
        assert_eq!(door.calls().last().map(String::as_str), Some("close"));
    }
}
