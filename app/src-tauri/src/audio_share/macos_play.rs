// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! macOS: the window's own sounds while a share runs (ADR 0116, the
//! 2026-11-02 note on decision A2). The pages' audio and the window's come
//! out of one WebKit GPU process, so the tap cannot tell them apart. While a
//! share runs, the window therefore sends its own final output here as PCM
//! (`audio_share_own_pcm`), and this plays it with Core Audio from Verso's
//! own process, which the tap leaves out (`macpages.rs`). Safe code over
//! `macos.rs`'s output.
//!
//! It begins before the share's capture does and ends with the share. The
//! device lives on a thread of its own (its objects are not `Send`); the
//! blocks wait in a bounded queue (`ownqueue.rs`) that drops the oldest.

use std::collections::HashMap;
use std::sync::mpsc::{Sender, channel};
use std::sync::{Arc, LazyLock, Mutex};
use std::thread::JoinHandle;

use verso_service::lock;

use super::macos::{self, Failure};
use super::ownqueue::{OwnQueue, parse_block};

/// One window's output.
struct Playing {
    queue: Arc<Mutex<OwnQueue>>,
    stop: Sender<()>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for Playing {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// The windows that route their own sounds here, by label.
static OUTPUTS: LazyLock<Mutex<HashMap<String, Playing>>> = LazyLock::new(Mutex::default);

/// Open the output for window `label`. Whether the window should route its
/// sounds here: false where macOS cannot capture at all (the share will say so).
///
/// # Errors
/// Why the device did not start, in words for the log.
pub fn begin(label: &str) -> Result<bool, String> {
    if !macos::supported() {
        return Ok(false);
    }
    if let Some(p) = lock(&OUTPUTS).get(label) {
        lock(&p.queue).clear();
        return Ok(true);
    }
    let rate = macos::output_rate()?;
    let queue = Arc::new(Mutex::new(OwnQueue::default()));
    let pulled = Arc::clone(&queue);
    let (ready_tx, ready_rx) = channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = channel::<()>();
    let thread = std::thread::Builder::new()
        .name("audio-share-own".to_owned())
        .spawn(move || {
            let out = macos::start_output(move |frames| {
                // The buffer is silence already; a push in progress costs a
                // block of silence, never a wait.
                if let Ok(mut q) = pulled.try_lock() {
                    q.pull(frames, rate);
                }
            });
            match out {
                Ok(out) => {
                    let _ = ready_tx.send(Ok(()));
                    let _ = stop_rx.recv();
                    drop(out);
                }
                Err(Failure::Denied) => {
                    let _ = ready_tx.send(Err("the output device refused".to_owned()));
                }
                Err(Failure::Other(why)) => {
                    let _ = ready_tx.send(Err(why));
                }
            }
        })
        .map_err(|e| e.to_string())?;
    let started = ready_rx
        .recv()
        .unwrap_or_else(|_| Err("the output thread ended before it began".to_owned()));
    let playing = Playing {
        queue,
        stop: stop_tx,
        thread: Some(thread),
    };
    // On a failure `playing` drops here and joins the finished thread.
    started?;
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
