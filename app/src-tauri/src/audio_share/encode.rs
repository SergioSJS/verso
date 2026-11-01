// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Opus encoder of Share audio (ADR 0116 item 18): pure, no IO, no
//! thread. PCM blocks of any length go in; whole 20 ms packets come out
//! (48 kHz, stereo, 960 samples a channel), the remainder waiting for the
//! next block. A capture back-end (later tasks) calls it from its own
//! thread; the host's tests call it with a sine.

use verso_contract::{
    BITRATE_DEFAULT, CHANNELS, FRAME_HEADER_LEN, FRAME_MOST, SAMPLE_RATE, bitrate_ok,
};

/// Samples in one frame, per channel: 20 ms at 48 kHz.
pub const FRAME_SAMPLES: usize = (SAMPLE_RATE as usize) * 20 / 1000;

/// Interleaved values in one frame, all channels.
const FRAME_VALUES: usize = FRAME_SAMPLES * CHANNELS as usize;

/// A stereo Opus encoder that cuts what it is given into 20 ms packets.
pub struct Encoder {
    inner: opus::Encoder,
    /// Interleaved samples waiting for a whole frame.
    pending: Vec<f32>,
}

impl Encoder {
    /// An encoder at `kbps` (64 to 128, [`BITRATE_DEFAULT`] when none).
    ///
    /// # Errors
    /// A bitrate out of range, or libopus refusing to start.
    pub fn new(kbps: Option<u16>) -> Result<Self, String> {
        let kbps = kbps.unwrap_or(BITRATE_DEFAULT);
        if !bitrate_ok(kbps) {
            return Err(format!(
                "{kbps} kbit/s is not a bitrate a share may ask for"
            ));
        }
        let mut inner = opus::Encoder::new(
            SAMPLE_RATE,
            opus::Channels::Stereo,
            opus::Application::Audio,
        )
        .map_err(|e| e.to_string())?;
        inner
            .set_bitrate(opus::Bitrate::Bits(i32::from(kbps) * 1000))
            .map_err(|e| e.to_string())?;
        Ok(Self {
            inner,
            pending: Vec::with_capacity(FRAME_VALUES * 2),
        })
    }

    /// Interleaved stereo `f32` samples (-1.0 to 1.0): every whole frame
    /// they complete, as Opus packets.
    ///
    /// # Errors
    /// libopus failing on a frame.
    pub fn push_f32(&mut self, pcm: &[f32]) -> Result<Vec<Vec<u8>>, String> {
        self.pending.extend_from_slice(pcm);
        let mut out = Vec::new();
        let mut buf = [0_u8; FRAME_MOST - FRAME_HEADER_LEN];
        let mut used = 0;
        let mut failed = None;
        while self.pending.len() - used >= FRAME_VALUES {
            let frame = &self.pending[used..used + FRAME_VALUES];
            match self.inner.encode_float(frame, &mut buf) {
                Ok(n) => out.push(buf[..n].to_vec()),
                Err(e) => {
                    failed = Some(e.to_string());
                    used += FRAME_VALUES;
                    break;
                }
            }
            used += FRAME_VALUES;
        }
        self.pending.drain(..used);
        match failed {
            Some(e) => Err(e),
            None => Ok(out),
        }
    }

    /// The same for interleaved stereo `i16` samples.
    ///
    /// # Errors
    /// As [`Encoder::push_f32`].
    #[cfg(test)]
    pub fn push_i16(&mut self, pcm: &[i16]) -> Result<Vec<Vec<u8>>, String> {
        let floats: Vec<f32> = pcm.iter().map(|&s| f32::from(s) / 32768.0).collect();
        self.push_f32(&floats)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `n` interleaved stereo samples of a sine of `hz`, from sample `from`.
    fn sine(hz: f32, from: usize, n: usize) -> Vec<f32> {
        let mut out = Vec::with_capacity(n * 2);
        for i in from..from + n {
            let v = 0.5 * (2.0 * std::f32::consts::PI * hz * i as f32 / SAMPLE_RATE as f32).sin();
            out.push(v);
            out.push(v);
        }
        out
    }

    /// The frequency of a mono signal, by counting rising zero crossings.
    fn hz_of(mono: &[f32]) -> f32 {
        let crossings = mono
            .windows(2)
            .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
            .count();
        crossings as f32 * SAMPLE_RATE as f32 / mono.len() as f32
    }

    #[test]
    fn a_second_of_sine_is_fifty_bounded_packets() {
        let mut enc = Encoder::new(None).unwrap();
        let packets = enc.push_f32(&sine(440.0, 0, 48_000)).unwrap();
        assert_eq!(packets.len(), 50);
        let steady: Vec<usize> = packets[10..].iter().map(Vec::len).collect();
        let mean = steady.iter().sum::<usize>() as f32 / steady.len() as f32;
        // 96 kbit/s allows 240 bytes a 20 ms frame; a pure tone needs less
        // under constrained VBR, never more than the bound.
        assert!((10.0..=300.0).contains(&mean), "mean {mean}");
        assert!(
            packets
                .iter()
                .all(|p| !p.is_empty() && p.len() <= FRAME_MOST - FRAME_HEADER_LEN)
        );
    }

    #[test]
    fn a_busy_signal_fills_the_budget_of_96_kbit_s() {
        // Noise cannot be squeezed: the packet size is the bitrate's.
        let mut enc = Encoder::new(Some(96)).unwrap();
        let packets = enc.push_f32(&noise(96_000)).unwrap();
        let mean =
            packets[10..].iter().map(Vec::len).sum::<usize>() as f32 / packets[10..].len() as f32;
        assert!((200.0..=280.0).contains(&mean), "mean {mean} (about 240)");
    }

    fn noise(n: usize) -> Vec<f32> {
        let mut x = 12345_u32;
        (0..n)
            .map(|_| {
                x = x.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((x >> 8) as f32 / 8_388_608.0 - 1.0) * 0.3
            })
            .collect()
    }

    #[test]
    fn blocks_of_any_length_make_the_same_packets() {
        let pcm = sine(440.0, 0, 9_600);
        let mut whole = Encoder::new(None).unwrap();
        let a = whole.push_f32(&pcm).unwrap();
        let mut odd = Encoder::new(None).unwrap();
        let mut b = Vec::new();
        for chunk in pcm.chunks(2 * 333) {
            b.extend(odd.push_f32(chunk).unwrap());
        }
        assert_eq!(a.len(), 10);
        assert_eq!(a, b);
    }

    #[test]
    fn what_is_decoded_is_the_tone() {
        let mut enc = Encoder::new(Some(96)).unwrap();
        let packets = enc.push_f32(&sine(440.0, 0, 48_000)).unwrap();
        let mut dec = opus::Decoder::new(SAMPLE_RATE, opus::Channels::Stereo).unwrap();
        let mut pcm = Vec::new();
        let mut frame = vec![0_f32; FRAME_VALUES];
        for p in &packets {
            let n = dec.decode_float(p, &mut frame, false).unwrap();
            assert_eq!(n, FRAME_SAMPLES);
            pcm.extend_from_slice(&frame);
        }
        // Left channel, the first 100 ms (codec delay) skipped.
        let left: Vec<f32> = pcm.chunks(2).skip(4_800).map(|s| s[0]).collect();
        let hz = hz_of(&left);
        assert!((hz - 440.0).abs() < 5.0, "decoded {hz} Hz");
        let peak = left.iter().fold(0.0_f32, |m, v| m.max(v.abs()));
        assert!((0.3..=0.7).contains(&peak), "peak {peak}");
    }

    #[test]
    fn i16_blocks_work_and_the_bitrate_is_bounded() {
        let mut enc = Encoder::new(Some(64)).unwrap();
        let pcm: Vec<i16> = sine(440.0, 0, 960)
            .iter()
            .map(|v| (v * 32767.0) as i16)
            .collect();
        assert_eq!(enc.push_i16(&pcm).unwrap().len(), 1);
        assert!(enc.push_i16(&pcm[..100]).unwrap().is_empty());
        assert!(Encoder::new(Some(63)).is_err());
        assert!(Encoder::new(Some(129)).is_err());
        assert!(Encoder::new(Some(128)).is_ok());
    }

    #[test]
    fn higher_bitrates_make_bigger_packets() {
        let size = |kbps| {
            let mut enc = Encoder::new(Some(kbps)).unwrap();
            let p = enc.push_f32(&noise(96_000)).unwrap();
            p.iter().skip(10).map(Vec::len).sum::<usize>()
        };
        assert!(size(128) > size(64));
    }
}
