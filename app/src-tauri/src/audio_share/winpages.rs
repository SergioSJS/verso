// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The pure half of Share audio on Windows (ADR 0116 item 17, as narrowed on
//! 2026-11-01): the only source is the pages open in Verso, and the words and
//! rules around it that need no system call, so they are tested on every
//! system. `windows_source.rs` feeds it.
//!
//! The pages Verso embeds as child web views live in a WebView2 environment
//! of their own (`web.rs`, the "pages" profile), apart from the window's.
//! That environment has one browser process and one audio service under it,
//! so one process loopback of its tree carries the sound of every open page
//! and never Verso's own (the dice, the chimes, the table's music), which
//! play in the window's environment.

#[cfg(any(windows, test))]
use verso_contract::{SOURCE_NAME_MOST, name_ok};

/// The id of the one source.
pub const PAGES_ID: &str = "pages";

#[cfg(any(windows, test))]
/// The first Windows build with process loopback (Windows 11 and Server
/// 2022; the API is documented from build 20348).
pub const PER_APP_BUILD: u32 = 20_348;

#[cfg(any(windows, test))]
/// What the list refuses with on a Windows without process loopback: the
/// window knows these exact words and says them in its own language
/// (`HOST_NEEDS_WINDOWS` in `shareWords.ts`).
pub const NEEDS_WINDOWS_11: &str = "audio capture needs Windows 11 or later";

/// What the list and a start refuse with when no page is open in Verso (on
/// the Mac: when no page has made sound yet).
pub const NO_PAGES: &str = "no page is open in Verso to share";

/// The source's name when no site is named (the Mac names none).
pub const PAGES_NAME: &str = "Pages open in Verso";

#[cfg(any(windows, test))]
/// Whether this build of Windows can capture one process tree.
#[must_use]
pub const fn per_app(build: u32) -> bool {
    build >= PER_APP_BUILD
}

#[cfg(any(windows, test))]
/// A page open in Verso, as WebView2 tells it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page {
    /// The pages environment's browser process: the root of the tree to capture.
    pub pid: u32,
    /// Whether the page is playing sound now.
    pub playing: bool,
    /// The site's host name (`www.youtube.com`), or empty.
    pub host: String,
}

#[cfg(any(windows, test))]
/// The host name of a page's address, without `www.`; empty if none.
#[must_use]
pub fn host_of(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .rsplit('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    host.strip_prefix("www.").unwrap_or(host).to_lowercase()
}

#[cfg(any(windows, test))]
/// What the picker calls the source: *Pages open in Verso*, and the sites
/// that play now when some do (`Pages open in Verso: open.spotify.com`).
/// Always a name the contract accepts.
#[must_use]
pub fn source_name(pages: &[Page]) -> String {
    let mut hosts: Vec<&str> = Vec::new();
    for p in pages.iter().filter(|p| p.playing && !p.host.is_empty()) {
        if !hosts.contains(&p.host.as_str()) {
            hosts.push(&p.host);
        }
    }
    let base = PAGES_NAME;
    let name = if hosts.is_empty() {
        base.to_owned()
    } else {
        format!("{base}: {}", hosts.join(", "))
    };
    let cut: String = name.chars().take(SOURCE_NAME_MOST).collect();
    if name_ok(&cut) { cut } else { base.to_owned() }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(playing: bool, host: &str) -> Page {
        Page {
            pid: 7,
            playing,
            host: host.to_owned(),
        }
    }

    /// The window compares the host's refusals to these exact words
    /// (`shareWords.ts`, tested by `shareHost.test.mjs`), and tells the
    /// source by this id.
    #[test]
    fn the_words_the_window_knows_are_these() {
        assert_eq!(PAGES_ID, "pages");
        assert_eq!(NEEDS_WINDOWS_11, "audio capture needs Windows 11 or later");
        assert_eq!(NO_PAGES, "no page is open in Verso to share");
    }

    #[test]
    fn process_loopback_starts_at_build_20348() {
        assert!(!per_app(19_045));
        assert!(!per_app(20_347));
        assert!(per_app(20_348));
        assert!(per_app(22_631));
    }

    #[test]
    fn the_host_of_an_address_is_the_site_without_www() {
        assert_eq!(host_of("https://www.youtube.com/watch?v=1"), "youtube.com");
        assert_eq!(host_of("https://open.spotify.com/"), "open.spotify.com");
        assert_eq!(
            host_of("http://user:pw@Example.com:8080/x#y"),
            "example.com"
        );
        assert_eq!(host_of(""), "");
    }

    #[test]
    fn the_name_says_which_sites_play_and_stays_fit_for_the_contract() {
        assert_eq!(source_name(&[]), "Pages open in Verso");
        assert_eq!(source_name(&[page(false, "a.com")]), "Pages open in Verso");
        assert_eq!(
            source_name(&[
                page(true, "a.com"),
                page(true, "a.com"),
                page(true, "b.org"),
                page(false, "c.net")
            ]),
            "Pages open in Verso: a.com, b.org"
        );
        let long = page(true, &"x".repeat(300));
        let name = source_name(&[long]);
        assert!(name_ok(&name));
        assert!(name.starts_with("Pages open in Verso"));
    }
}
