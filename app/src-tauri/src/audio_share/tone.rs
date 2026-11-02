// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The test tone: a source that needs no capture permission and no sound
//! card, so the whole path (encoder, frames, channel, the table's
//! WebSocket, the listeners) runs on any machine, a CI container included.
//! A 440 Hz sine in both channels at a modest level, generated in 20 ms
//! blocks at real time on a thread of its own.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use verso_contract::{AudioSource, AudioSourceKind, SAMPLE_RATE};

use super::encode::FRAME_SAMPLES;
use super::source::{PcmSink, Running, Source};

/// The id the list gives it. The window may localise its name by this id
/// ("Test tone" / "Tom de teste"); the host has no language.
pub const ID: &str = "test-tone";

/// The tone's pitch, in Hz.
pub const HZ: u64 = 440;

/// The tone's level (0.0 to 1.0), well under full scale.
const LEVEL: f32 = 0.25;

/// A sine of [`HZ`], phase kept from block to block.
pub struct Tone {
    next: u64,
}

impl Tone {
    pub fn new() -> Self {
        Self { next: 0 }
    }

    /// The next `n` samples a channel, interleaved in both channels.
    pub fn block(&mut self, n: usize) -> Vec<f32> {
        let rate = u64::from(SAMPLE_RATE);
        let mut out = Vec::with_capacity(n * 2);
        for i in self.next..self.next + n as u64 {
            // The phase in turns, from whole numbers: no drift in a long share.
            let turns = (i * HZ % rate) as f32 / rate as f32;
            let v = LEVEL * (2.0 * std::f32::consts::PI * turns).sin();
            out.push(v);
            out.push(v);
        }
        self.next += n as u64;
        out
    }
}

/// The source the list shows.
pub struct TestTone;

impl Source for TestTone {
    fn describe(&self) -> AudioSource {
        AudioSource {
            id: ID.to_owned(),
            name: "Test tone".to_owned(),
            kind: AudioSourceKind::System,
        }
    }

    fn start(self: Box<Self>, mut sink: PcmSink) -> Result<Running, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);
        let thread = std::thread::Builder::new()
            .name("audio-test-tone".to_owned())
            .spawn(move || {
                let mut tone = Tone::new();
                let step = Duration::from_millis(20);
                let mut due = Instant::now();
                while !flag.load(Ordering::SeqCst) {
                    sink(&tone.block(FRAME_SAMPLES));
                    due += step;
                    let now = Instant::now();
                    if due > now {
                        std::thread::sleep(due - now);
                    } else if now - due > Duration::from_millis(200) {
                        // Far behind (the machine slept): do not burst.
                        due = now;
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Running::new(move || {
            stop.store(true, Ordering::SeqCst);
            let _ = thread.join();
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn the_tone_is_a_continuous_440_hz_sine() {
        let mut t = Tone::new();
        let mut all = Vec::new();
        for _ in 0..5 {
            all.extend(t.block(FRAME_SAMPLES));
        }
        let left: Vec<f32> = all.chunks(2).map(|s| s[0]).collect();
        let crossings = left
            .windows(2)
            .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
            .count();
        // 100 ms of 440 Hz is 44 cycles.
        assert!((43..=45).contains(&crossings), "{crossings}");
        assert!(left.iter().all(|v| v.abs() <= LEVEL + 1e-4));
        // No step at a block boundary.
        let jump = (left[FRAME_SAMPLES] - left[FRAME_SAMPLES - 1]).abs();
        assert!(jump < 0.1, "{jump}");
    }

    #[test]
    fn it_runs_at_real_time_and_stops_when_dropped() {
        let got = Arc::new(Mutex::new(0_usize));
        let seen = Arc::clone(&got);
        let running = Box::new(TestTone)
            .start(Box::new(move |b| *seen.lock().unwrap() += b.len() / 2))
            .unwrap();
        std::thread::sleep(Duration::from_millis(500));
        drop(running);
        let after = *got.lock().unwrap();
        // About half a second of samples (24 000), give or take the timer.
        assert!((16_000..=34_000).contains(&after), "{after}");
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(*got.lock().unwrap(), after, "it kept going after the drop");
    }
}
