// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The pure half of Share audio on Linux (ADR 0116 item 17, as narrowed on
//! 2026-11-01, and the 2026-11-02 note on A2): the only source is the pages
//! open in Verso. No system call here, so it is tested everywhere;
//! `linux_source.rs` feeds it.
//!
//! The pages Verso embeds as child web views run in a WebKitGTK web context
//! of their own (`web.rs`, the "pages" profile), so in a `WebKitWebProcess`
//! of their own. A stream that process plays is a PulseAudio *sink input*
//! (PipeWire serves the same protocol), whose properties name the pid of the
//! process that made it. A stream is a page's only when ALL of these hold,
//! and anything else is left out (fail closed):
//! - its process is a `WebKitWebProcess` (its name in `/proc`);
//! - that process descends from Verso's own (the chain of parents in
//!   `/proc` reaches Verso's pid): a browser's, another app's,
//!   never;
//! - it is not Verso's own process (the host's playback of the window's own
//!   sounds, which is a child of ours that is no web process anyway);
//! - the process is the pages' one, not the window's: it holds a file or a
//!   mapping under the pages' profile directory (`PAGES_PROFILE`).

use std::collections::VecDeque;

/// The folder of the pages' profile (`web.rs` `PAGES_PROFILE`): the one thing
/// that tells the pages' web process from the window's.
pub const PAGES_PROFILE: &str = "pages-profile";

/// What the list and a start refuse with where the tools of the sound server
/// (`pactl`, `parec`) are not installed: the window knows these exact words
/// and says them in its own language (`HOST_NEEDS_PULSE` in `shareWords.ts`).
pub const NEEDS_PULSE_TOOLS: &str = "audio capture needs the PulseAudio tools (pactl, parec)";

/// A playback stream the sound server knows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SinkInput {
    /// Its index, what a recording of that one stream names.
    pub index: u32,
    /// The pid of the process that made it (`application.process.id`).
    pub pid: u32,
}

/// The sink inputs in the text of `pactl list sink-inputs` (run with
/// `LC_ALL=C`, so the headings are not translated). A stream with no pid
/// property is dropped: it cannot be tied to Verso.
#[must_use]
pub fn parse_sink_inputs(text: &str) -> Vec<SinkInput> {
    let mut out = Vec::new();
    let mut index: Option<u32> = None;
    let mut pid: Option<u32> = None;
    let mut close = |index: &mut Option<u32>, pid: &mut Option<u32>| {
        if let (Some(i), Some(p)) = (index.take(), pid.take()) {
            out.push(SinkInput { index: i, pid: p });
        }
        *index = None;
        *pid = None;
    };
    for line in text.lines() {
        let line = line.trim();
        if let Some(n) = line.strip_prefix("Sink Input #") {
            close(&mut index, &mut pid);
            index = n.trim().parse().ok();
        } else if let Some(v) = line.strip_prefix("application.process.id") {
            let v = v.trim_start().strip_prefix('=').unwrap_or("").trim();
            pid = v.trim_matches('"').parse().ok();
        }
    }
    close(&mut index, &mut pid);
    out
}

/// Whether a process name (`/proc/<pid>/comm`) is WebKitGTK's web process
/// (the kernel keeps 15 characters).
#[must_use]
pub fn is_web_process_name(comm: &str) -> bool {
    matches!(comm.trim(), "WebKitWebProces" | "WebKitWebProcess")
}

/// Whether `pid` has `root` among its ancestors, by `parent_of`; a loop or a
/// chain past 64 steps is a no.
pub fn descends_from(pid: u32, root: u32, parent_of: impl Fn(u32) -> Option<u32>) -> bool {
    let mut at = pid;
    for _ in 0..64 {
        match parent_of(at) {
            Some(p) if p == root => return true,
            Some(p) if p > 1 && p != at => at = p,
            _ => return false,
        }
    }
    false
}

/// Whether any of these paths (open files, mappings, the working directory)
/// has the pages' profile folder as a whole component.
pub fn mentions_profile<'a>(paths: impl IntoIterator<Item = &'a str>) -> bool {
    paths
        .into_iter()
        .any(|p| p.split('/').any(|c| c == PAGES_PROFILE))
}

/// The streams that are Verso's pages: not Verso's own process (`own`), and
/// whose process `is_page` vouches for.
#[must_use]
pub fn page_streams(
    inputs: &[SinkInput],
    own: u32,
    is_page: impl Fn(u32) -> bool,
) -> Vec<SinkInput> {
    inputs
        .iter()
        .filter(|s| s.pid != own)
        .filter(|s| is_page(s.pid))
        .copied()
        .collect()
}

/// The most a stream's queue keeps: 250 ms of interleaved stereo at 48 kHz.
pub const QUEUE_MOST: usize = 48_000 / 4 * 2;

/// Take `samples` interleaved values from each queue (silence where one is
/// short), add them and keep the sum inside -1 to 1.
#[must_use]
pub fn mix<'a>(
    queues: impl IntoIterator<Item = &'a mut VecDeque<f32>>,
    samples: usize,
) -> Vec<f32> {
    let mut out = vec![0.0_f32; samples];
    for q in queues {
        for o in out.iter_mut() {
            match q.pop_front() {
                Some(v) if v.is_finite() => *o += v,
                Some(_) => {}
                None => break,
            }
        }
    }
    for o in &mut out {
        *o = o.clamp(-1.0, 1.0);
    }
    out
}

/// Add `bytes` (little-endian `f32`) to a queue, dropping the oldest past
/// [`QUEUE_MOST`]. `carry` holds a partial sample between calls.
pub fn push_bytes(queue: &mut VecDeque<f32>, carry: &mut Vec<u8>, bytes: &[u8]) {
    carry.extend_from_slice(bytes);
    let whole = carry.len() / 4 * 4;
    for c in carry[..whole].as_chunks::<4>().0 {
        queue.push_back(f32::from_le_bytes(*c));
    }
    carry.drain(..whole);
    while queue.len() > QUEUE_MOST {
        queue.pop_front();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PACTL: &str = "Sink Input #12\n\tDriver: protocol-native.c\n\tProperties:\n\t\tapplication.name = \"WebKitWebProcess\"\n\t\tapplication.process.id = \"4242\"\n\nSink Input #15\n\tProperties:\n\t\tmedia.name = \"no pid\"\n\nSink Input #20\n\tProperties:\n\t\tapplication.process.id = \"77\"\n";

    #[test]
    fn sink_inputs_are_read_with_their_pids_and_those_without_are_dropped() {
        assert_eq!(
            parse_sink_inputs(PACTL),
            vec![
                SinkInput {
                    index: 12,
                    pid: 4242
                },
                SinkInput { index: 20, pid: 77 }
            ]
        );
        assert!(parse_sink_inputs("").is_empty());
    }

    #[test]
    fn only_the_web_process_name_counts() {
        assert!(is_web_process_name("WebKitWebProces\n"));
        assert!(!is_web_process_name("firefox"));
        assert!(!is_web_process_name("pacat"));
        assert!(!is_web_process_name("WebKitNetworkProcess"));
    }

    #[test]
    fn descent_follows_parents_and_stops_at_loops_and_init() {
        let parent = |p: u32| match p {
            30 => Some(20),
            20 => Some(10),
            10 => Some(1),
            50 => Some(60),
            60 => Some(50),
            _ => None,
        };
        assert!(descends_from(30, 10, parent));
        assert!(descends_from(20, 10, parent));
        assert!(!descends_from(30, 99, parent));
        assert!(!descends_from(10, 10, parent));
        assert!(!descends_from(50, 10, parent));
        assert!(!descends_from(7, 10, parent));
    }

    #[test]
    fn the_profile_must_be_a_whole_path_component() {
        assert!(mentions_profile(["/x/y/pages-profile/Cache/a.db"]));
        assert!(!mentions_profile([
            "/x/my-pages-profile/a",
            "/usr/lib/a.so"
        ]));
        assert!(!mentions_profile([]));
    }

    #[test]
    fn a_stream_is_a_page_only_if_every_rule_holds() {
        let inputs = [
            SinkInput { index: 1, pid: 100 }, // Verso's own
            SinkInput { index: 2, pid: 200 }, // a page
            SinkInput { index: 3, pid: 300 }, // anything else
        ];
        let got = page_streams(&inputs, 100, |p| p == 200 || p == 100);
        assert_eq!(got, vec![SinkInput { index: 2, pid: 200 }]);
        assert!(page_streams(&inputs, 100, |_| false).is_empty());
    }

    #[test]
    fn mixing_adds_pads_with_silence_and_clamps() {
        let mut a: VecDeque<f32> = [0.5, 0.5, 0.9, 0.9].into();
        let mut b: VecDeque<f32> = [0.25, 0.25].into();
        let mixed = mix([&mut a, &mut b], 4);
        assert_eq!(mixed, vec![0.75, 0.75, 0.9, 0.9]);
        let mut loud: VecDeque<f32> = [0.9, f32::NAN].into();
        let mut loud2: VecDeque<f32> = [0.9, 0.1].into();
        assert_eq!(mix([&mut loud, &mut loud2], 2), vec![1.0, 0.1]);
    }

    #[test]
    fn bytes_become_samples_across_split_reads_and_the_queue_is_bounded() {
        let mut q = VecDeque::new();
        let mut carry = Vec::new();
        let b = 0.5_f32.to_le_bytes();
        push_bytes(&mut q, &mut carry, &b[..3]);
        assert!(q.is_empty());
        push_bytes(&mut q, &mut carry, &b[3..]);
        assert_eq!(q, VecDeque::from([0.5]));
        let big: Vec<u8> = (0..QUEUE_MOST + 100).flat_map(|_| b).collect();
        push_bytes(&mut q, &mut carry, &big);
        assert_eq!(q.len(), QUEUE_MOST);
    }
}
