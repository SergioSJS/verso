// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A share at work on this computer (ADR 0116 items 17 to 19): a source,
//! the encoder, and the frames handed to the server on that window's connection. One share a
//! host at a time (the server allows one a table; a second start here ends
//! the first). A window closing, the person pressing Stop and the app
//! exiting all end it, and no frame is handed over after `end` returns.

use std::sync::Mutex;

use verso_contract::{
    AudioCaptureStarted, AudioSource, CHANNELS, FRAME_MS, FrameHeader, SAMPLE_RATE,
};
use verso_service::lock;

use super::encode::Encoder;
use super::source::{PcmSink, Running, Source};

/// Opus packets, framed: the 12-byte header (item 19) and the packet.
pub struct Framer {
    encoder: Encoder,
    share: u32,
    sequence: u32,
}

impl Framer {
    pub fn new(encoder: Encoder, share: u32) -> Self {
        Self {
            encoder,
            share,
            sequence: 0,
        }
    }

    /// The frames that `pcm` completes. The capture timestamp is the
    /// frame's first sample counted from the share's start, so it is exact
    /// and gap-free whatever the thread's scheduling (the back-ends' blocks
    /// are contiguous).
    ///
    /// # Errors
    /// The encoder failing.
    pub fn push(&mut self, pcm: &[f32]) -> Result<Vec<Vec<u8>>, String> {
        let mut out = Vec::new();
        for packet in self.encoder.push_f32(pcm)? {
            let header = FrameHeader {
                share: self.share,
                sequence: self.sequence,
                timestamp_ms: self.sequence.wrapping_mul(u32::from(FRAME_MS)),
            };
            self.sequence = self.sequence.wrapping_add(1);
            if let Some(frame) = header.frame(&packet) {
                out.push(frame);
            }
        }
        Ok(out)
    }
}

/// Takes a frame to the server; false once the connection is closed.
pub type Deliver = Box<dyn FnMut(Vec<u8>) -> bool + Send>;

struct Active {
    owner: String,
    /// Dropped outside the lock: it waits for the source's thread.
    _running: Running,
    /// Tells the server the share is over when its window goes without
    /// having stopped it (the server knows the connection, not the window).
    farewell: Option<Farewell>,
}

/// What the host does at the server when it ends a share on its own.
pub type Farewell = Box<dyn FnOnce() + Send>;

/// The share of this run of the app, if any.
#[derive(Default)]
pub struct Shares {
    active: Mutex<Option<Active>>,
}

impl Shares {
    /// Start `source` for window `owner`, encoding at `kbps`.
    ///
    /// # Errors
    /// A bitrate out of range, or the source or the encoder failing to begin.
    pub fn start(
        &self,
        owner: &str,
        source: Box<dyn Source>,
        kbps: u16,
        share: u32,
        mut deliver: Deliver,
    ) -> Result<AudioCaptureStarted, String> {
        let described: AudioSource = source.describe();
        let mut framer = Framer::new(Encoder::new(Some(kbps))?, share);
        // One share a host: the one running ends first.
        self.end_all();
        let sink: PcmSink = Box::new(move |pcm| match framer.push(pcm) {
            Ok(frames) => {
                for frame in frames {
                    if !deliver(frame) {
                        break;
                    }
                }
            }
            Err(e) => crate::log::write("ERROR", "audio-share", &e),
        });
        let running = source.start(sink)?;
        *lock(&self.active) = Some(Active {
            owner: owner.to_owned(),
            _running: running,
            farewell: None,
        });
        Ok(AudioCaptureStarted {
            source: described,
            bitrate_kbps: kbps,
            sample_rate: SAMPLE_RATE,
            channels: CHANNELS,
            frame_ms: FRAME_MS,
        })
    }

    /// Whether window `owner` has a share running.
    #[cfg(test)]
    pub fn is_running_for(&self, owner: &str) -> bool {
        lock(&self.active)
            .as_ref()
            .is_some_and(|a| a.owner == owner)
    }

    /// What to tell the server if window `owner`'s running share ends
    /// because the window went (`end_of`), so its listeners see it stop
    /// (ADR 0116 item 16) while the link stays up for other windows.
    pub fn on_window_gone(&self, owner: &str, farewell: Farewell) {
        if let Some(a) = lock(&self.active).as_mut().filter(|a| a.owner == owner) {
            a.farewell = Some(farewell);
        }
    }

    /// End the share of window `owner`, if it has one, because the window
    /// is gone: the capture stops, then the server is told.
    pub fn end_of(&self, owner: &str) {
        if let Some(mut ended) = self.take_of(owner) {
            let farewell = ended.farewell.take();
            drop(ended);
            if let Some(tell) = farewell {
                tell();
            }
        }
    }

    /// End the share of window `owner`, if it has one, because the person
    /// pressed Stop: the window stops it at the server itself.
    pub fn stop_of(&self, owner: &str) {
        drop(self.take_of(owner));
    }

    fn take_of(&self, owner: &str) -> Option<Active> {
        let mut active = lock(&self.active);
        if active.as_ref().is_some_and(|a| a.owner == owner) {
            active.take()
        } else {
            None
        }
    }

    /// End the share, whoever's it is.
    pub fn end_all(&self) {
        let ended = lock(&self.active).take();
        drop(ended);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_share::tone::TestTone;
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn frames_carry_a_counting_header_and_decode_to_the_tone() {
        let mut framer = Framer::new(Encoder::new(None).unwrap(), 7);
        let mut tone = crate::audio_share::tone::Tone::new();
        let mut frames = Vec::new();
        for _ in 0..50 {
            frames.extend(framer.push(&tone.block(960)).unwrap());
        }
        assert_eq!(frames.len(), 50);
        for (i, f) in frames.iter().enumerate() {
            let (h, packet) = FrameHeader::decode(f).unwrap();
            assert_eq!(h.share, 7);
            assert_eq!(h.sequence as usize, i);
            assert_eq!(h.timestamp_ms as usize, i * 20);
            assert!(!packet.is_empty());
        }
    }

    #[test]
    fn the_sequence_and_the_clock_wrap() {
        let mut framer = Framer::new(Encoder::new(None).unwrap(), 1);
        framer.sequence = u32::MAX;
        let mut tone = crate::audio_share::tone::Tone::new();
        let mut frames = framer.push(&tone.block(960)).unwrap();
        frames.extend(framer.push(&tone.block(960)).unwrap());
        let (a, _) = FrameHeader::decode(&frames[0]).unwrap();
        let (b, _) = FrameHeader::decode(&frames[1]).unwrap();
        assert_eq!(a.sequence, u32::MAX);
        assert_eq!(b.sequence, 0);
        assert_eq!(b.timestamp_ms, 0);
    }

    #[test]
    fn a_share_streams_in_real_time_and_stops_with_its_window() {
        let shares = Shares::default();
        let got = Arc::new(Mutex::new(Vec::<Vec<u8>>::new()));
        let seen = Arc::clone(&got);
        let started = shares
            .start(
                "main",
                Box::new(TestTone),
                96,
                0x8000_0007,
                Box::new(move |f| {
                    seen.lock().unwrap().push(f);
                    true
                }),
            )
            .unwrap();
        assert_eq!(started.bitrate_kbps, 96);
        assert_eq!(
            (started.sample_rate, started.channels, started.frame_ms),
            (48_000, 2, 20)
        );
        assert_eq!(started.source.id, "test-tone");
        assert!(shares.is_running_for("main"));
        // Another window's closing does not end it.
        shares.end_of("note-1");
        assert!(shares.is_running_for("main"));
        std::thread::sleep(Duration::from_millis(600));
        shares.end_of("main");
        assert!(!shares.is_running_for("main"));
        let n = got.lock().unwrap().len();
        // About 30 frames in 600 ms, give or take the timer.
        assert!((20..=40).contains(&n), "{n} frames");
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(got.lock().unwrap().len(), n, "frames after the end");
        for (i, f) in got.lock().unwrap().iter().enumerate() {
            let (h, _) = FrameHeader::decode(f).unwrap();
            assert_eq!(h.sequence as usize, i);
            assert_eq!(
                h.share, 0x8000_0007,
                "the server's number is in every header"
            );
        }
    }

    #[test]
    fn a_second_start_ends_the_first_and_a_bad_bitrate_starts_nothing() {
        let shares = Shares::default();
        let first = Arc::new(Mutex::new(0_usize));
        let a = Arc::clone(&first);
        shares
            .start(
                "a",
                Box::new(TestTone),
                96,
                0x8000_0001,
                Box::new(move |_| {
                    *a.lock().unwrap() += 1;
                    true
                }),
            )
            .unwrap();
        assert!(
            shares
                .start(
                    "b",
                    Box::new(TestTone),
                    500,
                    0x8000_0002,
                    Box::new(|_| true)
                )
                .is_err()
        );
        assert!(shares.is_running_for("a"), "a refused start kept the first");
        shares
            .start("b", Box::new(TestTone), 64, 0x8000_0003, Box::new(|_| true))
            .unwrap();
        assert!(!shares.is_running_for("a") && shares.is_running_for("b"));
        shares.end_all();
        assert!(!shares.is_running_for("b"));
    }
}
