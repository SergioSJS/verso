// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Linux: the window's own sounds while a share runs (ADR 0116, the
//! 2026-11-02 note on decision A2, applied here the same way). While a share
//! runs, the window sends its own final output as PCM
//! (`audio_share_own_pcm`) and this plays it from a process of Verso's own,
//! `pacat` (the playback tool of the PulseAudio protocol, which PipeWire
//! serves too), a child of Verso that is no web process: the pages' capture
//! (`linux_source.rs`) never takes a stream of it, and no sound of the
//! window comes out of any `WebKitWebProcess`.
//!
//! It begins before the share's capture does and ends with the share. If
//! `pacat` is missing the window keeps its own output (`false`), which is
//! safe here: the window's web process is not the pages', so the capture
//! never takes it.

use std::collections::HashMap;
use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use verso_service::lock;

use super::ownqueue::{OwnQueue, parse_block};

/// The device's rate: `pacat` is told this one, the queue converts to it.
const RATE: u32 = 48_000;
/// 10 ms of stereo frames per write.
const STEP: Duration = Duration::from_millis(10);
const STEP_FRAMES: usize = 480;

/// One window's output.
struct Playing {
    queue: Arc<Mutex<OwnQueue>>,
    stop: Arc<AtomicBool>,
    child: Child,
    thread: Option<JoinHandle<()>>,
}

impl Drop for Playing {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// The windows that route their own sounds here, by label.
static OUTPUTS: LazyLock<Mutex<HashMap<String, Playing>>> = LazyLock::new(Mutex::default);

/// Open the output for window `label`. Whether the window should route its
/// sounds here: false when `pacat` is not there to play them.
///
/// # Errors
/// Why the output did not start, in words for the log.
pub fn begin(label: &str) -> Result<bool, String> {
    if let Some(p) = lock(&OUTPUTS).get(label) {
        lock(&p.queue).clear();
        return Ok(true);
    }
    let spawned = Command::new("pacat")
        .args([
            "--playback",
            "--raw",
            "--format=float32le",
            "--rate=48000",
            "--channels=2",
            "--latency-msec=40",
            "--client-name=Verso",
            "--stream-name=Verso (own sounds while sharing)",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    let mut child = match spawned {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };
    let Some(mut stdin) = child.stdin.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("pacat gave no input".to_owned());
    };
    let queue = Arc::new(Mutex::new(OwnQueue::default()));
    let pulled = Arc::clone(&queue);
    let stop = Arc::new(AtomicBool::new(false));
    let halt = Arc::clone(&stop);
    let thread = std::thread::Builder::new()
        .name("audio-share-own".to_owned())
        .spawn(move || {
            let mut frames = vec![0.0_f32; STEP_FRAMES * 2];
            let mut bytes = Vec::with_capacity(frames.len() * 4);
            let mut next = Instant::now();
            while !halt.load(Ordering::SeqCst) {
                // Never ahead of the clock: the pipe stays nearly empty, so a
                // sound waits a few milliseconds, not the pipe's 64 KiB.
                let now = Instant::now();
                if next > now {
                    std::thread::sleep(next - now);
                } else if now - next > Duration::from_millis(200) {
                    next = now;
                }
                next += STEP;
                if let Ok(mut q) = pulled.try_lock() {
                    q.pull(&mut frames, RATE);
                } else {
                    frames.fill(0.0);
                }
                bytes.clear();
                bytes.extend(frames.iter().flat_map(|s| s.to_le_bytes()));
                if stdin.write_all(&bytes).is_err() {
                    break;
                }
            }
        });
    let thread = match thread {
        Ok(t) => t,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e.to_string());
        }
    };
    let playing = Playing {
        queue,
        stop,
        child,
        thread: Some(thread),
    };
    lock(&OUTPUTS).insert(label.to_owned(), playing);
    Ok(true)
}

/// A block of the window's sound (`ownqueue.rs` says its shape). A window
/// that is not routing here has its blocks dropped.
///
/// # Errors
/// Why the bytes are not a block.
pub fn push(label: &str, bytes: &[u8]) -> Result<(), &'static str> {
    let (rate, samples) = parse_block(bytes)?;
    if let Some(p) = lock(&OUTPUTS).get(label) {
        lock(&p.queue).push(rate, &samples);
    }
    Ok(())
}

/// Close window `label`'s output (the share ended, or the window went).
pub fn end(label: &str) {
    let gone = lock(&OUTPUTS).remove(label);
    drop(gone);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_for_a_window_that_is_not_routing_are_dropped_not_kept() {
        let bytes: Vec<u8> = [48_000.0_f32, 0.1, 0.1]
            .into_iter()
            .flat_map(f32::to_le_bytes)
            .collect();
        assert!(push("nobody", &bytes).is_ok());
        assert!(lock(&OUTPUTS).get("nobody").is_none());
        assert!(push("nobody", &[1, 2]).is_err());
    }

    #[test]
    fn ending_what_never_began_is_nothing() {
        end("nobody");
    }
}
