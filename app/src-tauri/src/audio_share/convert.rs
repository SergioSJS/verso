// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! From what a system's capture gives to what the encoder takes (ADR 0116
//! item 18): interleaved stereo `f32` at 48 kHz. Pure code, no system call,
//! so it is tested on every machine; only macOS uses it today (the other
//! back-ends will).
//!
//! - [`join_buffers`] makes one interleaved block of the buffers a capture
//!   callback hands out, whether the system gave one interleaved buffer or
//!   a buffer a channel;
//! - [`Converter`] turns that into 48 kHz stereo: a mono source is copied
//!   to both channels, a source of more than two channels keeps its first
//!   two, and another sample rate is resampled linearly, with its position
//!   kept from block to block so no click sits at a boundary.

use verso_contract::SAMPLE_RATE;

/// One interleaved block out of the buffers of a capture callback. Each
/// buffer holds `channels` interleaved channels; the channels of all the
/// buffers follow one another (one interleaved buffer of two channels, or
/// two buffers of one, both give left then right). Frames beyond the
/// shortest buffer's are dropped. Answers the channel count and the block.
#[must_use]
pub fn join_buffers(buffers: &[(usize, &[f32])]) -> (usize, Vec<f32>) {
    let total: usize = buffers.iter().map(|(c, _)| *c).sum();
    let frames = buffers
        .iter()
        .filter(|(c, _)| *c > 0)
        .map(|(c, b)| b.len() / c)
        .min()
        .unwrap_or(0);
    if total == 0 || frames == 0 {
        return (total, Vec::new());
    }
    if let [(c, only)] = buffers {
        return (total, only[..frames * c].to_vec());
    }
    let mut out = Vec::with_capacity(frames * total);
    for f in 0..frames {
        for (c, b) in buffers {
            out.extend_from_slice(&b[f * c..f * c + c]);
        }
    }
    (total, out)
}

/// Interleaved `channels`-channel `f32` at `rate` Hz in, 48 kHz stereo out.
pub struct Converter {
    channels: usize,
    /// Input frames to step for each output frame.
    step: f64,
    /// Where the next output sample falls, in input frames from the start of
    /// the next block; -1.0 is the previous block's last frame.
    at: f64,
    prev: [f32; 2],
}

impl Converter {
    /// A converter for a capture at `rate` Hz with `channels` channels.
    ///
    /// # Errors
    /// A zero rate or no channel.
    pub fn new(rate: u32, channels: usize) -> Result<Self, String> {
        if rate == 0 || channels == 0 {
            return Err(format!(
                "the capture format ({rate} Hz, {channels} channels) cannot be converted"
            ));
        }
        Ok(Self {
            channels,
            step: f64::from(rate) / f64::from(SAMPLE_RATE),
            at: 0.0,
            prev: [0.0; 2],
        })
    }

    fn frame(&self, input: &[f32], i: usize) -> [f32; 2] {
        let at = i * self.channels;
        let left = input[at];
        let right = if self.channels > 1 {
            input[at + 1]
        } else {
            left
        };
        [left, right]
    }

    /// Convert `input` (whole frames; a partial one is ignored), appending
    /// the stereo samples to `out`.
    pub fn push(&mut self, input: &[f32], out: &mut Vec<f32>) {
        let n = input.len() / self.channels;
        if n == 0 {
            return;
        }
        let last = (n - 1) as f64;
        while self.at < last {
            let floor = self.at.floor();
            let frac = (self.at - floor) as f32;
            let (a, b) = if floor < 0.0 {
                (self.prev, self.frame(input, 0))
            } else {
                let i = floor as usize;
                (self.frame(input, i), self.frame(input, i + 1))
            };
            out.push(a[0] + (b[0] - a[0]) * frac);
            out.push(a[1] + (b[1] - a[1]) * frac);
            self.at += self.step;
        }
        self.at -= n as f64;
        self.prev = self.frame(input, n - 1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(hz: f32, rate: u32, from: usize, n: usize) -> Vec<f32> {
        (from..from + n)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * hz * i as f32 / rate as f32).sin())
            .collect()
    }

    fn convert(rate: u32, channels: usize, input: &[f32], chunk: usize) -> Vec<f32> {
        let mut c = Converter::new(rate, channels).unwrap();
        let mut out = Vec::new();
        for block in input.chunks(chunk * channels) {
            c.push(block, &mut out);
        }
        out
    }

    fn hz_of_left(stereo: &[f32]) -> f32 {
        let left: Vec<f32> = stereo.chunks(2).map(|s| s[0]).collect();
        let crossings = left
            .windows(2)
            .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
            .count();
        crossings as f32 * SAMPLE_RATE as f32 / left.len() as f32
    }

    #[test]
    fn a_48_khz_stereo_source_passes_through_unchanged() {
        let mono = sine(440.0, 48_000, 0, 4_800);
        let stereo: Vec<f32> = mono.iter().flat_map(|v| [*v, -*v]).collect();
        let out = convert(48_000, 2, &stereo, 480);
        // Each block's last frame waits for the next: a few frames behind.
        assert!(out.len() <= stereo.len() && out.len() + 2 * 20 >= stereo.len());
        assert!(out.chunks(2).all(|s| (s[0] + s[1]).abs() < 1e-6));
        // Same signal, at most one frame late per block, never altered.
        assert!(out.iter().all(|v| v.abs() <= 0.5 + 1e-6));
    }

    #[test]
    fn mono_is_copied_to_both_channels() {
        let mono = sine(300.0, 48_000, 0, 960);
        let out = convert(48_000, 1, &mono, 960);
        assert!(!out.is_empty());
        assert!(out.chunks(2).all(|s| s[0] == s[1]));
    }

    #[test]
    fn more_than_two_channels_keep_the_first_two() {
        let input: Vec<f32> = (0..40)
            .flat_map(|i| [i as f32, -(i as f32), 9.0, 9.0])
            .collect();
        let out = convert(48_000, 4, &input, 40);
        assert_eq!(&out[..6], &[0.0, 0.0, 1.0, -1.0, 2.0, -2.0]);
    }

    #[test]
    fn other_rates_come_out_at_48_khz_with_the_same_pitch() {
        for rate in [44_100_u32, 96_000, 32_000, 24_000] {
            let secs = 2;
            let input = sine(440.0, rate, 0, rate as usize * secs);
            let out = convert(rate, 1, &input, 1024);
            let frames = out.len() / 2;
            let want = 48_000 * secs;
            assert!(frames.abs_diff(want) <= 2, "{rate}: {frames} vs {want}");
            let hz = hz_of_left(&out);
            assert!((hz - 440.0).abs() < 3.0, "{rate}: {hz}");
        }
    }

    #[test]
    fn the_blocks_size_does_not_change_the_result() {
        let input = sine(1000.0, 44_100, 0, 20_000);
        let whole = convert(44_100, 1, &input, 20_000);
        for chunk in [1, 7, 441, 4096] {
            let split = convert(44_100, 1, &input, chunk);
            assert_eq!(split.len(), whole.len(), "chunk {chunk}");
            let worst = split
                .iter()
                .zip(&whole)
                .map(|(a, b)| (a - b).abs())
                .fold(0.0_f32, f32::max);
            assert!(worst < 1e-4, "chunk {chunk}: {worst}");
        }
    }

    #[test]
    fn a_block_boundary_leaves_no_step() {
        let input = sine(200.0, 44_100, 0, 44_100);
        let out = convert(44_100, 1, &input, 512);
        let left: Vec<f32> = out.chunks(2).map(|s| s[0]).collect();
        let worst = left
            .windows(2)
            .map(|w| (w[1] - w[0]).abs())
            .fold(0.0_f32, f32::max);
        // 200 Hz at amplitude 0.5 moves 0.013 a sample at most.
        assert!(worst < 0.02, "{worst}");
    }

    #[test]
    fn a_format_that_cannot_be_converted_is_refused() {
        assert!(Converter::new(0, 2).is_err());
        assert!(Converter::new(48_000, 0).is_err());
    }

    #[test]
    fn buffers_become_one_interleaved_block() {
        // One interleaved buffer of two channels.
        let (c, out) = join_buffers(&[(2, &[1.0, 2.0, 3.0, 4.0])]);
        assert_eq!((c, out), (2, vec![1.0, 2.0, 3.0, 4.0]));
        // A buffer a channel.
        let (c, out) = join_buffers(&[(1, &[1.0, 3.0]), (1, &[2.0, 4.0])]);
        assert_eq!((c, out), (2, vec![1.0, 2.0, 3.0, 4.0]));
        // A partial frame and a shorter buffer are cut.
        let (c, out) = join_buffers(&[(2, &[1.0, 2.0, 3.0]), (1, &[9.0, 9.0])]);
        assert_eq!((c, out), (3, vec![1.0, 2.0, 9.0]));
        // Nothing at all.
        assert!(join_buffers(&[]).1.is_empty());
        assert!(join_buffers(&[(0, &[1.0])]).1.is_empty());
    }
}
