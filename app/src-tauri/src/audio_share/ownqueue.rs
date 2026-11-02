// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The window's own sounds while a share runs on the Mac (ADR 0116, the
//! 2026-11-02 note): the window's final output stops going to the web view's
//! audio output and goes, as PCM, to the host, which plays it with Core
//! Audio from Verso's own process (`macos_play.rs`) so the tap that carries
//! the pages' sound never hears it. This is the pure half: the wire format
//! of a block and the bounded queue between the IPC and the audio thread.
//! No system call, so it is tested everywhere.
//!
//! A block is `f32` little-endian: the sample rate first (an integer, exact
//! in `f32`), then interleaved stereo frames. The window sends the rate its
//! audio context runs at; the playback converts to the device's by linear
//! interpolation, the one the latency allows.

use std::collections::VecDeque;

/// The least and the most rate a block may name.
const RATE_LEAST: u32 = 8_000;
const RATE_MOST: u32 = 192_000;

/// The most one block may hold: 100 ms of 192 kHz stereo and its rate.
pub const BLOCK_MOST_BYTES: usize = 4 * (1 + 2 * 19_200);

/// What a queue holds at most, in milliseconds of sound: past it the oldest
/// go, so a stalled device never makes the sounds late.
pub const QUEUE_MS: u32 = 250;

/// A block read from the wire: its rate and its interleaved stereo samples.
///
/// # Errors
/// Why the bytes are not a block, in words for the log.
pub fn parse_block(bytes: &[u8]) -> Result<(u32, Vec<f32>), &'static str> {
    if bytes.len() > BLOCK_MOST_BYTES {
        return Err("the block is larger than a block may be");
    }
    if bytes.len() < 4 || !bytes.len().is_multiple_of(4) {
        return Err("the block is not whole samples");
    }
    let mut it = bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|c| f32::from_le_bytes(*c));
    let rate = it.next().unwrap_or(0.0);
    if !rate.is_finite()
        || rate.fract() != 0.0
        || rate < RATE_LEAST as f32
        || rate > RATE_MOST as f32
    {
        return Err("the block names a sample rate that makes no sense");
    }
    let samples: Vec<f32> = it
        .map(|s| {
            if s.is_finite() {
                s.clamp(-1.0, 1.0)
            } else {
                0.0
            }
        })
        .collect();
    if !samples.len().is_multiple_of(2) {
        return Err("the block is not whole stereo frames");
    }
    Ok((rate as u32, samples))
}

/// Stereo frames waiting for the audio thread.
pub struct OwnQueue {
    frames: VecDeque<[f32; 2]>,
    rate: u32,
    /// Where the next output frame falls between the first and the second.
    pos: f64,
    /// Frames dropped for being past the bound, since the start.
    pub dropped: u64,
}

impl Default for OwnQueue {
    fn default() -> Self {
        Self {
            frames: VecDeque::new(),
            rate: 48_000,
            pos: 0.0,
            dropped: 0,
        }
    }
}

impl OwnQueue {
    /// Frames waiting.
    #[cfg(test)]
    fn len(&self) -> usize {
        self.frames.len()
    }

    /// The most frames kept at the current rate.
    fn bound(&self) -> usize {
        (u64::from(self.rate) * u64::from(QUEUE_MS) / 1000) as usize
    }

    /// Add interleaved stereo `samples` at `rate`; past the bound the oldest go.
    pub fn push(&mut self, rate: u32, samples: &[f32]) {
        if rate != self.rate {
            // A new rate: what waits was another one's; start from the new.
            self.frames.clear();
            self.pos = 0.0;
            self.rate = rate;
        }
        self.frames
            .extend(samples.as_chunks::<2>().0.iter().copied());
        let bound = self.bound();
        while self.frames.len() > bound {
            self.frames.pop_front();
            self.dropped += 1;
        }
    }

    /// Fill `out` (interleaved stereo) for a device at `device_rate`; what
    /// the queue cannot give is silence.
    pub fn pull(&mut self, out: &mut [f32], device_rate: u32) {
        let step = f64::from(self.rate) / f64::from(device_rate.max(1));
        for o in out.as_chunks_mut::<2>().0 {
            if self.frames.len() < 2 {
                o.fill(0.0);
                continue;
            }
            let (a, b) = (self.frames[0], self.frames[1]);
            let f = self.pos as f32;
            o[0] = a[0] + (b[0] - a[0]) * f;
            o[1] = a[1] + (b[1] - a[1]) * f;
            self.pos += step;
            while self.pos >= 1.0 && self.frames.len() > 1 {
                self.frames.pop_front();
                self.pos -= 1.0;
            }
        }
    }

    /// Forget everything waiting.
    pub fn clear(&mut self) {
        self.frames.clear();
        self.pos = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(rate: f32, samples: &[f32]) -> Vec<u8> {
        std::iter::once(rate)
            .chain(samples.iter().copied())
            .flat_map(f32::to_le_bytes)
            .collect()
    }

    #[test]
    fn a_block_is_its_rate_then_stereo_frames() {
        let (rate, s) = parse_block(&block(44_100.0, &[0.5, -0.5, 1.0, 0.0])).expect("block");
        assert_eq!(rate, 44_100);
        assert_eq!(s, [0.5, -0.5, 1.0, 0.0]);
    }

    #[test]
    fn what_is_not_a_block_is_refused() {
        assert!(parse_block(&[]).is_err());
        assert!(parse_block(&[1, 2, 3]).is_err());
        assert!(parse_block(&block(48_000.5, &[0.0, 0.0])).is_err());
        assert!(parse_block(&block(10.0, &[0.0, 0.0])).is_err());
        assert!(parse_block(&block(f32::NAN, &[0.0, 0.0])).is_err());
        // An odd number of samples is half a frame.
        assert!(parse_block(&block(48_000.0, &[0.0, 0.0, 0.0])).is_err());
        assert!(parse_block(&vec![0; BLOCK_MOST_BYTES + 4]).is_err());
    }

    #[test]
    fn samples_are_kept_within_range_and_finite() {
        let (_, s) = parse_block(&block(48_000.0, &[9.0, f32::INFINITY])).expect("block");
        assert_eq!(s, [1.0, 0.0]);
    }

    #[test]
    fn the_queue_is_bounded_and_drops_the_oldest() {
        let mut q = OwnQueue::default();
        // 48 kHz: 250 ms is 12000 frames. Push 15000 numbered by left channel.
        let samples: Vec<f32> = (0..15_000)
            .flat_map(|i| [i as f32 / 15_000.0, 0.0])
            .collect();
        q.push(48_000, &samples);
        assert_eq!(q.len(), 12_000);
        assert_eq!(q.dropped, 3_000);
        let mut out = [0.0_f32; 2];
        q.pull(&mut out, 48_000);
        // The first one kept is frame 3000.
        assert!((out[0] - 3_000.0 / 15_000.0).abs() < 1e-6);
    }

    #[test]
    fn an_empty_queue_plays_silence() {
        let mut q = OwnQueue::default();
        let mut out = [0.7_f32; 8];
        q.pull(&mut out, 48_000);
        assert_eq!(out, [0.0; 8]);
    }

    #[test]
    fn the_same_rate_passes_through_and_another_is_interpolated() {
        let mut q = OwnQueue::default();
        q.push(48_000, &[0.0, 0.0, 1.0, 1.0, 2.0, 2.0, 3.0, 3.0]);
        let mut out = [0.0_f32; 4];
        q.pull(&mut out, 48_000);
        assert_eq!(out, [0.0, 0.0, 1.0, 1.0]);

        let mut q = OwnQueue::default();
        q.push(24_000, &[0.0, 0.0, 1.0, 1.0, 2.0, 2.0]);
        let mut out = [0.0_f32; 6];
        // A device at twice the rate: half steps between the frames.
        q.pull(&mut out, 48_000);
        assert_eq!(out, [0.0, 0.0, 0.5, 0.5, 1.0, 1.0]);
    }

    #[test]
    fn a_new_rate_starts_the_queue_afresh() {
        let mut q = OwnQueue::default();
        q.push(48_000, &[1.0; 100]);
        q.push(44_100, &[0.5, 0.5]);
        assert_eq!(q.len(), 1);
    }
}
