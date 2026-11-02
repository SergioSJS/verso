// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Windows: the sources of Share audio (ADR 0116 item 17), safe code over the
//! `wasapi` crate and the few calls of `windows.rs`.
//!
//! - **Windows 11 (build 20348 and later)**: *Everything this PC plays* is
//!   process loopback that **leaves out Verso's own process tree** (the web
//!   view's processes are in it), so the dice and chimes are not sent back
//!   to the table; each running application that holds an audio session is
//!   one more source, captured as its process tree (a browser's sound comes
//!   from helper processes), by the name its program's file description
//!   gives, never a window title. No prompt: Windows asks nothing.
//! - **Windows 10**: process loopback does not exist. The one source is the
//!   default output's device loopback, *everything*, Verso's sounds
//!   included; its id is [`winapps::SYSTEM_ALL_ID`] so the window says so and
//!   mutes Verso's own sounds (dice, chimes) while the share runs.
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

use verso_contract::{AudioSource, AudioSourceKind, CHANNELS, SAMPLE_RATE};
use wasapi::{
    AudioClient, Direction, SampleType, SessionState, StreamMode, WaveFormat, deinitialize,
    initialize_mta,
};

use super::convert::Converter;
use super::source::{PcmSink, Running, Source};
use super::winapps::{self, App, Proc};
use super::windows;

/// How long the capture waits for a packet before it sends silence and looks
/// at its stop flag again.
const QUIET: Duration = Duration::from_millis(100);

/// The name of "everything", in the host's own words (the window shows its
/// own in the person's language).
const EVERYTHING: &str = "Everything this PC plays";

/// Runs `work` on a thread with COM initialised (multithreaded) and
/// released after, and answers what it answered. COM is per thread, and the
/// threads that run commands have not initialised it.
fn with_com<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> Option<T> {
    std::thread::Builder::new()
        .name("audio-share-com".to_owned())
        .spawn(move || {
            let ok = initialize_mta().is_ok();
            let out = work();
            if ok {
                deinitialize();
            }
            out
        })
        .ok()?
        .join()
        .ok()
}

/// The processes that hold an audio session on the default output now
/// (playing or paused; not expired ones).
fn session_pids() -> Vec<u32> {
    with_com(|| {
        let sessions = wasapi::DeviceEnumerator::new()
            .and_then(|e| e.get_default_device(&Direction::Render))
            .and_then(|d| d.get_iaudiosessionmanager())
            .and_then(|m| m.get_audiosessionenumerator())
            .ok()?;
        let count = sessions.get_count().ok()?;
        let mut out = Vec::new();
        for i in 0..count {
            let Ok(session) = sessions.get_session(i) else {
                continue;
            };
            if matches!(session.get_state(), Ok(SessionState::Expired)) {
                continue;
            }
            if let Ok(pid) = session.get_process_id() {
                out.push(pid);
            }
        }
        Some(out)
    })
    .flatten()
    .unwrap_or_default()
}

/// The applications with sound now, and the process table they were found
/// in.
fn running() -> (Vec<App>, Vec<Proc>) {
    let procs = windows::processes();
    let apps = winapps::apps(&session_pids(), &procs, std::process::id());
    (apps, procs)
}

/// The name a person knows `app` by: its program's file description.
fn name_of(app: &App) -> String {
    let said = windows::description_of(app.root).unwrap_or_default();
    winapps::clean(&said, &app.exe)
}

/// Why nothing can be listed that the person could fix: nothing here (every
/// supported Windows lists at least *everything*).
#[must_use]
pub fn unavailable() -> Option<&'static str> {
    None
}

/// *Everything* first, then (Windows 11) each application that has an audio
/// session.
#[must_use]
pub fn list() -> Vec<AudioSource> {
    let build = windows::os_build();
    if !winapps::per_app(build) {
        return vec![everything(winapps::SYSTEM_ALL_ID)];
    }
    let mut out = vec![everything(winapps::SYSTEM_ID)];
    let (apps, _) = running();
    let mut named: Vec<AudioSource> = apps
        .iter()
        .map(|a| AudioSource {
            id: winapps::id_of(a),
            name: name_of(a),
            kind: AudioSourceKind::App,
        })
        .collect();
    named.sort_by_key(|s| s.name.to_lowercase());
    out.extend(named);
    out
}

fn everything(id: &str) -> AudioSource {
    AudioSource {
        id: id.to_owned(),
        name: EVERYTHING.to_owned(),
        kind: AudioSourceKind::System,
    }
}

/// The source `id` names on this Windows, or `None`.
#[must_use]
pub fn open(id: &str) -> Option<Box<dyn Source>> {
    let per_app = winapps::per_app(windows::os_build());
    if id == winapps::SYSTEM_ID && per_app {
        return Some(Box::new(WinSource::EverythingButVerso));
    }
    if id == winapps::SYSTEM_ALL_ID && !per_app {
        return Some(Box::new(WinSource::Device));
    }
    let key = winapps::exe_of(id).filter(|_| per_app)?;
    Some(Box::new(WinSource::App {
        key: key.to_owned(),
    }))
}

/// What a capture listens to.
enum Target {
    /// Everything but the process tree of this pid.
    ButTree(u32),
    /// Only the process tree of this pid.
    OnlyTree(u32),
    /// The default output as it is.
    Device,
}

enum WinSource {
    EverythingButVerso,
    Device,
    App { key: String },
}

impl WinSource {
    /// Whom to capture, resolved when the share starts (an application's
    /// processes come and go).
    fn target(&self) -> Result<Target, String> {
        match self {
            Self::EverythingButVerso => Ok(Target::ButTree(std::process::id())),
            Self::Device => Ok(Target::Device),
            Self::App { key } => {
                let (apps, _) = running();
                match apps.into_iter().find(|a| &a.key == key) {
                    Some(app) => Ok(Target::OnlyTree(app.root)),
                    None => Err(format!(
                        "{key} is not making sound right now: start playing in it, then choose it again"
                    )),
                }
            }
        }
    }
}

impl Source for WinSource {
    fn describe(&self) -> AudioSource {
        match self {
            Self::EverythingButVerso => everything(winapps::SYSTEM_ID),
            Self::Device => everything(winapps::SYSTEM_ALL_ID),
            Self::App { key } => AudioSource {
                id: format!("{}{key}", winapps::APP_PREFIX),
                name: winapps::pretty(key),
                kind: AudioSourceKind::App,
            },
        }
    }

    fn start(self: Box<Self>, sink: PcmSink) -> Result<Running, String> {
        let target = self.target()?;
        let stop = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = channel::<Result<(), String>>();
        let flag = Arc::clone(&stop);
        let thread = std::thread::Builder::new()
            .name("audio-share-win".to_owned())
            .spawn(move || capture(&target, &flag, sink, &ready_tx))
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
}

/// The capture thread: COM in, the stream, the loop, everything out in the
/// reverse order. `ready` hears once whether the stream began.
fn capture(
    target: &Target,
    stop: &AtomicBool,
    mut sink: PcmSink,
    ready: &std::sync::mpsc::Sender<Result<(), String>>,
) {
    let com = initialize_mta();
    if com.is_err() {
        let _ = ready.send(Err(format!("COM could not start: {com:?}")));
        return;
    }
    if let Err(why) = run(target, stop, &mut sink, ready) {
        // `ready` may have been told already; a second answer is ignored.
        let _ = ready.send(Err(why));
    }
    deinitialize();
}

fn run(
    target: &Target,
    stop: &AtomicBool,
    sink: &mut PcmSink,
    ready: &std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    let e = |what: &str| {
        let what = what.to_owned();
        move |err: wasapi::WasapiError| format!("{what}: {err}")
    };
    let mut client = match target {
        Target::ButTree(pid) => AudioClient::new_application_loopback_client(*pid, false),
        Target::OnlyTree(pid) => AudioClient::new_application_loopback_client(*pid, true),
        Target::Device => wasapi::DeviceEnumerator::new()
            .and_then(|en| en.get_default_device(&Direction::Render))
            .and_then(|d| d.get_iaudioclient()),
    }
    .map_err(e("no audio client"))?;
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
    client.start_stream().map_err(e("the stream did not start"))?;
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
    fn the_list_has_everything_first_and_only_apps_after_it() {
        let list = list();
        assert!(!list.is_empty());
        assert_eq!(list[0].kind, AudioSourceKind::System);
        let per_app = winapps::per_app(windows::os_build());
        assert_eq!(
            list[0].id,
            if per_app {
                winapps::SYSTEM_ID
            } else {
                winapps::SYSTEM_ALL_ID
            }
        );
        if !per_app {
            assert_eq!(list.len(), 1, "Windows 10 lists only everything");
        }
        assert!(
            list[1..]
                .iter()
                .all(|s| s.kind == AudioSourceKind::App && s.id.starts_with("app:"))
        );
        // Verso is never offered to itself.
        assert!(list.iter().all(|s| !s.id.contains("verso")));
    }

    #[test]
    fn ids_open_only_where_the_system_can_capture_them() {
        let per_app = winapps::per_app(windows::os_build());
        assert_eq!(open("system").is_some(), per_app);
        assert_eq!(open("system-all").is_some(), !per_app);
        assert_eq!(open("app:spotify.exe").is_some(), per_app);
        assert!(open("app:").is_none());
        assert!(open("test-tone").is_none());
        assert!(open("nothing").is_none());
    }

    #[test]
    fn the_build_is_read() {
        // Windows 10 1809 (17763) is the oldest this app runs on.
        assert!(windows::os_build() >= 17_763, "{}", windows::os_build());
        assert!(!windows::processes().is_empty());
        let own = std::process::id();
        assert!(windows::processes().iter().any(|p| p.pid == own));
    }

    #[test]
    fn an_application_that_makes_no_sound_is_told_so_not_started() {
        if !winapps::per_app(windows::os_build()) {
            return;
        }
        let src = Box::new(WinSource::App {
            key: "verso-nobody-runs-this.exe".into(),
        });
        let err = src.start(Box::new(|_| {})).err().unwrap_or_default();
        assert!(err.contains("not making sound"), "{err}");
    }

    /// Plays a 440 Hz tone on the default output until `stop` is set, from a
    /// thread with COM of its own. Answers false if there is no output.
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

    /// Captures `source` for 3 s while the tone plays; the frames and peak.
    fn capture_while_tone(source: Box<dyn Source>) -> Option<(usize, f32)> {
        use std::sync::Mutex;
        let stop = Arc::new(AtomicBool::new(false));
        let player = play_tone(Arc::clone(&stop))?;
        std::thread::sleep(Duration::from_millis(500));
        let got = Arc::new(Mutex::new((0_usize, 0.0_f32)));
        let seen = Arc::clone(&got);
        let running = source
            .start(Box::new(move |pcm| {
                if let Ok(mut g) = seen.lock() {
                    g.0 += pcm.len() / 2;
                    g.1 = pcm.iter().fold(g.1, |m, x| m.max(x.abs()));
                }
            }))
            .expect("capture starts");
        std::thread::sleep(Duration::from_secs(3));
        drop(running);
        stop.store(true, Ordering::SeqCst);
        let _ = player.join();
        let out = *got.lock().expect("lock");
        Some(out)
    }

    /// The real thing, for a Windows machine with an audio output: `cargo
    /// test -p verso-app --lib win_real_capture -- --ignored --nocapture`.
    /// The test plays a tone through the default output, and captures it by
    /// the default output's device loopback (every Windows) and, on Windows
    /// 11, by process loopback of its own process tree. Each must deliver
    /// about 3 s of 48 kHz stereo with the tone's level, and stopping must
    /// return.
    #[test]
    #[ignore = "needs a Windows machine with an audio output device"]
    fn win_real_capture_of_a_tone_delivers_audio_and_stops() {
        let Some((frames, peak)) = capture_while_tone(Box::new(WinSource::Device)) else {
            println!("NO AUDIO OUTPUT DEVICE: the real capture could not be tested here");
            return;
        };
        println!("device loopback: frames {frames}, peak {peak}");
        assert!(
            (100_000..=190_000).contains(&frames),
            "about 3 s of 48 kHz: {frames}"
        );
        assert!(peak > 0.05, "the tone did not arrive: peak {peak}");
        if winapps::per_app(windows::os_build()) {
            let own = std::process::id();
            let source = Box::new(WinTree(own));
            let (frames, peak) = capture_while_tone(source).expect("an output, as before");
            println!("process loopback (own tree): frames {frames}, peak {peak}");
            assert!((100_000..=190_000).contains(&frames), "{frames}");
            assert!(peak > 0.05, "the tone did not arrive: peak {peak}");
        }
    }

    /// A source of one process tree by pid, for the test above.
    struct WinTree(u32);

    impl Source for WinTree {
        fn describe(&self) -> AudioSource {
            everything("test")
        }

        fn start(self: Box<Self>, sink: PcmSink) -> Result<Running, String> {
            let stop = Arc::new(AtomicBool::new(false));
            let (ready_tx, ready_rx) = channel::<Result<(), String>>();
            let flag = Arc::clone(&stop);
            let target = Target::OnlyTree(self.0);
            let thread = std::thread::spawn(move || capture(&target, &flag, sink, &ready_tx));
            match ready_rx.recv() {
                Ok(Ok(())) => Ok(Running::new(move || {
                    stop.store(true, Ordering::SeqCst);
                    let _ = thread.join();
                })),
                Ok(Err(why)) => {
                    let _ = thread.join();
                    Err(why)
                }
                Err(_) => Err("ended".to_owned()),
            }
        }
    }
}
