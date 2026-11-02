// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The pure half of Share audio on the Mac (ADR 0116 item 17, as narrowed on
//! 2026-11-01): the only source is the pages open in Verso, as on Windows
//! (`winpages.rs`). No system call here, so it is tested everywhere;
//! `macos_source.rs` feeds it.
//!
//! The pages Verso embeds are child web views. On macOS every `WKWebView` of
//! an app, whatever its data store, plays through ONE `com.apple.WebKit.GPU`
//! process, and that process (not the web content processes) is the one with
//! an audio object (measured on 2026-11-02, ADR 0116). It is a child of
//! launchd, so its parent says nothing; the system's *responsible process*
//! for it is the application that launched it. So the pages' audio objects
//! are the audio objects, other than Verso's own process, whose responsible
//! pid is Verso's own, and nothing else: what plays outside Verso (a
//! browser, another app) is never shared. A dev build started from a
//! terminal has the terminal as responsible process, so it finds no pages
//! and refuses (the log says why).
//!
//! Verso's own sounds are not here: while a share runs they leave the window
//! through the host's own output (`macos_play.rs`), a process of Verso's
//! own, which this rule leaves out.

/// A process the audio system knows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioProc {
    /// Its object in the audio system, what a tap names.
    pub object: u32,
    pub pid: i32,
}

/// The audio objects that are Verso's pages: not Verso's own process
/// (`own_pid`), and whose responsible process (`responsible_of`) is exactly
/// `own_pid`.
#[must_use]
pub fn page_objects(
    procs: &[AudioProc],
    own_pid: i32,
    responsible_of: impl Fn(i32) -> Option<i32>,
) -> Vec<u32> {
    procs
        .iter()
        .filter(|p| p.pid != own_pid)
        .filter(|p| responsible_of(p.pid) == Some(own_pid))
        .map(|p| p.object)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(object: u32, pid: i32) -> AudioProc {
        AudioProc { object, pid }
    }

    #[test]
    fn the_pages_are_the_audio_objects_verso_is_responsible_for() {
        // 7 is Verso; 70 its WebKit GPU process; 9 another app's helper.
        let procs = [proc(1, 7), proc(2, 70), proc(3, 90), proc(4, 91)];
        let resp = |pid: i32| match pid {
            70 => Some(7),
            90 => Some(9),
            _ => None,
        };
        assert_eq!(page_objects(&procs, 7, resp), [2]);
    }

    #[test]
    fn verso_own_process_is_never_a_page() {
        // Its own output (the window's sounds, played by the host) is Verso's.
        let procs = [proc(1, 7)];
        assert!(page_objects(&procs, 7, |_| Some(7)).is_empty());
    }

    #[test]
    fn what_plays_outside_verso_is_never_a_page() {
        // A browser, another app, a terminal that launched a dev build.
        let procs = [proc(2, 70), proc(3, 71)];
        assert!(page_objects(&procs, 7, |_| Some(500)).is_empty());
        assert!(page_objects(&procs, 7, |_| None).is_empty());
    }
}
