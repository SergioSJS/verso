// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Windows: the source of Share audio (ADR 0116 item 17, as narrowed on
//! 2026-11-01: only what plays inside Verso's pages), safe code over the
//! `wasapi` crate and the few calls of `windows.rs`.
//!
//! The one source is *Pages open in Verso*: the child web views (ADR 0056)
//! live in a WebView2 environment of their own (`web.rs`), so they have a
//! browser process and an audio service apart from the window's, whose
//! dice, chimes and table music stay out. The capture is **process
//! loopback of that browser process's tree** (Windows 11, build 20348 and
//! later); Windows asks no permission. On Windows 10 there is no process
//! loopback, and device loopback would carry every application and the dice,
//! so the share is not available there and the picker says so.
//!
//! The pages' audio is one stream: the audio service mixes every page of the
//! environment, so a share carries all open pages' sound together; the
//! picker names the sites that play now (`IsDocumentPlayingAudio`).
//!
//! A capture is event driven on a thread of its own, which owns every COM
//! object it makes and releases them before it ends. It asks Windows for
//! 48 kHz stereo `f32` (the engine converts), runs the blocks through
//! `convert.rs` and hands them to the sink. Loopback gives no packet while
//! nothing plays, so a quiet moment of 100 ms is sent as silence, which keeps
//! the stream's clock and lets the meter say *Silence*.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::time::Duration;

use tauri::Manager;
use verso_contract::{AudioSource, AudioSourceKind, CHANNELS, SAMPLE_RATE};
use wasapi::{
    AudioClient, Direction, SampleType, StreamMode, WaveFormat, deinitialize, initialize_mta,
};

use super::convert::Converter;
use super::source::{PcmSink, Running, Source};
use super::windows;
use super::winpages::{self, NEEDS_WINDOWS_11, NO_PAGES, PAGES_ID, Page};

/// The pages open in `label`'s window, asked of WebView2 on the main thread.
/// Blocks for the answers, so it must not run on the main thread: the audio
/// commands are async for this.
fn pages_blocking<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> Vec<Page> {
    let labels: Vec<String> = crate::lock(&app.state::<crate::App>().web_views)
        .iter()
        .filter(|(_, owner)| owner.as_str() == label)
        .map(|(view, _)| view.clone())
        .collect();
    let mut out = Vec::new();
    for view in labels {
        let Some(wv) = app.get_webview(&view) else {
            continue;
        };
        let host = wv
            .url()
            .map(|u| winpages::host_of(u.as_str()))
            .unwrap_or_default();
        let (tx, rx) = channel();
        if wv
            .with_webview(move |pw| {
                let _ = tx.send(windows::page_facts(&pw));
            })
            .is_err()
        {
            continue;
        }
        if let Ok(Ok((pid, playing))) = rx.recv_timeout(Duration::from_secs(2)) {
            out.push(Page { pid, playing, host });
        }
    }
    out
}

async fn pages<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> Vec<Page> {
    let (app, label) = (app.clone(), label.to_owned());
    tauri::async_runtime::spawn_blocking(move || pages_blocking(&app, &label))
        .await
        .unwrap_or_default()
}

/// The sources of this window now, or why there are none that the person
/// can fix: a Windows older than 11, or no page open.
pub async fn list<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> Result<Vec<AudioSource>, &'static str> {
    if !winpages::per_app(windows::os_build()) {
        return Err(NEEDS_WINDOWS_11);
    }
    let pages = pages(app, label).await;
    if pages.is_empty() {
        return Err(NO_PAGES);
    }
    Ok(vec![AudioSource {
        id: PAGES_ID.to_owned(),
        name: winpages::source_name(&pages),
        kind: AudioSourceKind::Page,
    }])
}

/// The source `id` names for this window, or `None`.
pub async fn open<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    id: &str,
) -> Option<Box<dyn Source>> {
    if id != PAGES_ID {
        return None;
    }
    if !winpages::per_app(windows::os_build()) {
        return Some(Box::new(Pages(Err(NEEDS_WINDOWS_11))));
    }
    let pid = pages(app, label).await.first().map(|p| p.pid);
    Some(Box::new(Pages(pid.ok_or(NO_PAGES))))
}

/// The pages source, resolved when the share starts: the pages
/// environment's browser process, or why there is none.
struct Pages(Result<u32, &'static str>);

impl Source for Pages {
    fn describe(&self) -> AudioSource {
        AudioSource {
            id: PAGES_ID.to_owned(),
            name: winpages::source_name(&[]),
            kind: AudioSourceKind::Page,
        }
    }

    fn start(self: Box<Self>, sink: PcmSink) -> Result<Running, String> {
        let pid = self.0.map_err(str::to_owned)?;
        start_tree(pid, sink)
    }
}

/// Capture the process tree of `pid` on a thread of its own.
fn start_tree(pid: u32, sink: PcmSink) -> Result<Running, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = channel::<Result<(), String>>();
    let flag = Arc::clone(&stop);
    let thread = std::thread::Builder::new()
        .name("audio-share-win".to_owned())
        .spawn(move || capture(pid, &flag, sink, &ready_tx))
        .map_err(|e| e.to_string())?;
    match ready_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(why)) => {
            let _ = thread.join();
            return Err(why);
        }
        Err(_) => {
            let _ = thread.join();
            return Err("the capture thread ended before it began".to_owned());
        }
    }
    Ok(Running::new(move || {
        stop.store(true, Ordering::SeqCst);
        let _ = thread.join();
    }))
}

/// The capture thread: COM in, the stream, the loop, everything out in the
/// reverse order. `ready` hears once whether the stream began.
fn capture(
    pid: u32,
    stop: &AtomicBool,
    mut sink: PcmSink,
    ready: &std::sync::mpsc::Sender<Result<(), String>>,
) {
    let com = initialize_mta();
    if com.is_err() {
        let _ = ready.send(Err(format!("COM could not start: {com:?}")));
        return;
    }
    if let Err(why) = run(pid, stop, &mut sink, ready) {
        // `ready` may have been told already; a second answer is ignored.
        let _ = ready.send(Err(why));
    }
    deinitialize();
}

fn run(
    pid: u32,
    stop: &AtomicBool,
    sink: &mut PcmSink,
    ready: &std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    let e = |what: &str| {
        let what = what.to_owned();
        move |err: wasapi::WasapiError| format!("{what}: {err}")
    };
    // The pages environment's browser process and everything under it: its
    // audio service is in the tree.
    let mut client =
        AudioClient::new_application_loopback_client(pid, true).map_err(e("no audio client"))?;
    let format = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        SAMPLE_RATE as usize,
        usize::from(CHANNELS),
        None,
    );
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: 0,
    };
    client
        .initialize_client(&format, &Direction::Capture, &mode)
        .map_err(e("the capture would not start"))?;
    let event = client
        .set_get_eventhandle()
        .map_err(e("no capture event"))?;
    let capture = client
        .get_audiocaptureclient()
        .map_err(e("no capture client"))?;
    let mut converter = Converter::new(SAMPLE_RATE, usize::from(CHANNELS))?;
    client
        .start_stream()
        .map_err(e("the stream did not start"))?;
    let _ = ready.send(Ok(()));

    let frame_bytes = format.get_blockalign() as usize;
    let mut bytes: Vec<u8> = Vec::new();
    let mut pcm: Vec<f32> = Vec::new();
    let mut out: Vec<f32> = Vec::new();
    let quiet = vec![0.0_f32; (SAMPLE_RATE as usize / 10) * usize::from(CHANNELS)];
    while !stop.load(Ordering::SeqCst) {
        if event.wait_for_event(100).is_err() {
            // Nothing played for a moment: the time passes as silence.
            if !stop.load(Ordering::SeqCst) {
                sink(&quiet);
            }
            continue;
        }
        loop {
            let frames = match capture.get_next_packet_size() {
                Ok(Some(n)) if n > 0 => n as usize,
                Ok(_) => break,
                Err(err) => return Err(format!("the capture failed: {err}")),
            };
            bytes.resize(frames * frame_bytes, 0);
            let (got, info) = capture
                .read_from_device(&mut bytes)
                .map_err(e("the capture failed"))?;
            let used = got as usize * frame_bytes;
            pcm.clear();
            if info.flags.silent {
                pcm.resize(got as usize * usize::from(CHANNELS), 0.0);
            } else {
                pcm.extend(
                    bytes[..used]
                        .chunks_exact(4)
                        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])),
                );
            }
            out.clear();
            converter.push(&pcm, &mut out);
            if !out.is_empty() && !stop.load(Ordering::SeqCst) {
                sink(&out);
            }
        }
    }
    let _ = client.stop_stream();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_build_is_read() {
        // Windows 10 1809 (17763) is the oldest this app runs on.
        assert!(windows::os_build() >= 17_763, "{}", windows::os_build());
    }

    #[test]
    fn a_share_with_no_page_or_an_old_windows_is_refused_not_started() {
        let err = Box::new(Pages(Err(NO_PAGES)))
            .start(Box::new(|_| {}))
            .err()
            .unwrap_or_default();
        assert_eq!(err, NO_PAGES);
        let err = Box::new(Pages(Err(NEEDS_WINDOWS_11)))
            .start(Box::new(|_| {}))
            .err()
            .unwrap_or_default();
        assert_eq!(err, NEEDS_WINDOWS_11);
    }

    /// Plays a 440 Hz tone on the default output until `stop` is set, from a
    /// thread with COM of its own. `None` if there is no output.
    fn play_tone(stop: Arc<AtomicBool>) -> Option<std::thread::JoinHandle<()>> {
        let (ok_tx, ok_rx) = channel::<bool>();
        let handle = std::thread::spawn(move || {
            let _ = initialize_mta();
            let started = (|| -> Result<(), wasapi::WasapiError> {
                let device =
                    wasapi::DeviceEnumerator::new()?.get_default_device(&Direction::Render)?;
                let mut client = device.get_iaudioclient()?;
                let format = WaveFormat::new(32, 32, &SampleType::Float, 48_000, 2, None);
                let mode = StreamMode::PollingShared {
                    autoconvert: true,
                    buffer_duration_hns: 1_000_000,
                };
                client.initialize_client(&format, &Direction::Render, &mode)?;
                let render = client.get_audiorenderclient()?;
                client.start_stream()?;
                let _ = ok_tx.send(true);
                let mut tone = super::super::tone::Tone::new();
                while !stop.load(Ordering::SeqCst) {
                    let free = client.get_available_space_in_frames()? as usize;
                    if free > 0 {
                        let block = tone.block(free);
                        let data: Vec<u8> = block.iter().flat_map(|v| v.to_le_bytes()).collect();
                        render.write_to_device(free, &data, None)?;
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
                client.stop_stream()?;
                Ok(())
            })();
            if let Err(err) = started {
                println!("tone player: {err}");
                let _ = ok_tx.send(false);
            }
            deinitialize();
        });
        if ok_rx.recv().unwrap_or(false) {
            Some(handle)
        } else {
            let _ = handle.join();
            None
        }
    }

    /// The real thing, for a Windows 11 machine with an audio output: `cargo
    /// test -p verso-app --lib win_real_capture -- --ignored --nocapture`.
    /// The test plays a tone through the default output from its own
    /// process, and captures that process's tree by process loopback, as a
    /// share captures the pages' browser process. It must deliver about 3 s
    /// of 48 kHz stereo with the tone's level, and stopping must return.
    /// (Which process the pages' audio comes from is the manual check.)
    #[test]
    #[ignore = "needs Windows 11 with an audio output device"]
    fn win_real_capture_of_a_tone_delivers_audio_and_stops() {
        use std::sync::Mutex;
        if !winpages::per_app(windows::os_build()) {
            println!(
                "WINDOWS {}: no process loopback, nothing to test",
                windows::os_build()
            );
            return;
        }
        let stop = Arc::new(AtomicBool::new(false));
        let Some(player) = play_tone(Arc::clone(&stop)) else {
            println!("NO AUDIO OUTPUT DEVICE: the real capture could not be tested here");
            return;
        };
        std::thread::sleep(Duration::from_millis(500));
        let got = Arc::new(Mutex::new((0_usize, 0.0_f32)));
        let seen = Arc::clone(&got);
        let running = start_tree(
            std::process::id(),
            Box::new(move |pcm| {
                if let Ok(mut g) = seen.lock() {
                    g.0 += pcm.len() / 2;
                    g.1 = pcm.iter().fold(g.1, |m, x| m.max(x.abs()));
                }
            }),
        )
        .expect("capture starts");
        std::thread::sleep(Duration::from_secs(3));
        drop(running);
        stop.store(true, Ordering::SeqCst);
        let _ = player.join();
        let (frames, peak) = *got.lock().expect("lock");
        println!("process loopback (own tree): frames {frames}, peak {peak}");
        assert!(
            (100_000..=190_000).contains(&frames),
            "about 3 s of 48 kHz: {frames}"
        );
        assert!(peak > 0.05, "the tone did not arrive: peak {peak}");
    }
}
