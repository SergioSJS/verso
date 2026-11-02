// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Linux: the source of Share audio (ADR 0116 item 17, as narrowed on
//! 2026-11-01, "As built (S9)"): only the pages open in Verso. Safe code;
//! `linuxpages.rs` says which streams are the pages' and why.
//!
//! The sound server is PipeWire or PulseAudio, both through the PulseAudio
//! protocol. With the standard tools of that protocol (`pactl`, `parec`;
//! package `pulseaudio-utils`, which PipeWire systems carry too) this:
//! - lists the playback streams (`pactl list sink-inputs`) once a second and
//!   keeps the ones `linuxpages::page_streams` accepts;
//! - records each of those streams ALONE (`parec --monitor-stream`), as
//!   48 kHz stereo `f32`, never a whole output device and never any other
//!   stream: what plays outside Verso (a browser, another app) is not a
//!   stream of a Verso process, so it is not even asked for;
//! - mixes them every 10 ms and hands the sum to the sink.
//!
//! Where the tools are missing the picker says so (`NEEDS_PULSE_TOOLS`);
//! there is no other way to capture here, and no guess.

use std::collections::HashMap;
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use procfs::process::{FDTarget, MMapPath, Process, all_processes};
use verso_contract::{AudioSource, AudioSourceKind};
use verso_service::lock;

use super::linuxpages::{
    self, NEEDS_PULSE_TOOLS, SinkInput, descends_from, is_web_process_name, mentions_profile,
    page_streams, parse_sink_inputs, push_bytes,
};
use super::source::{PcmSink, Running, Source};
use super::winpages::{NO_PAGES, PAGES_ID, PAGES_NAME};

/// How often the streams are listed again.
const POLL: Duration = Duration::from_millis(1000);
/// The mix's step: 10 ms of interleaved stereo at 48 kHz.
const TICK: Duration = Duration::from_millis(10);
const TICK_SAMPLES: usize = 960;

fn own_pid() -> u32 {
    std::process::id()
}

fn pid_i32(pid: u32) -> Option<i32> {
    i32::try_from(pid).ok()
}

fn parent_of(pid: u32) -> Option<u32> {
    let stat = Process::new(pid_i32(pid)?).ok()?.stat().ok()?;
    u32::try_from(stat.ppid).ok()
}

/// Every path the process holds: working directory, open files, mappings.
fn held_paths(p: &Process) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(cwd) = p.cwd() {
        out.push(cwd.to_string_lossy().into_owned());
    }
    if let Ok(fds) = p.fd() {
        for fd in fds.flatten() {
            if let FDTarget::Path(path) = fd.target {
                out.push(path.to_string_lossy().into_owned());
            }
        }
    }
    if let Ok(maps) = p.maps() {
        for m in maps {
            if let MMapPath::Path(path) = m.pathname {
                out.push(path.to_string_lossy().into_owned());
            }
        }
    }
    out
}

/// Whether `pid` is the web process of Verso's pages: a `WebKitWebProcess`,
/// a descendant of Verso, holding something of the pages' profile. Anything
/// the system will not tell (a process gone, a file unreadable) is a no.
fn is_pages_process(pid: u32) -> bool {
    let Some(raw) = pid_i32(pid) else {
        return false;
    };
    let Ok(p) = Process::new(raw) else {
        return false;
    };
    let named = p.stat().is_ok_and(|s| is_web_process_name(&s.comm));
    named
        && descends_from(pid, own_pid(), parent_of)
        && mentions_profile(held_paths(&p).iter().map(String::as_str))
}

/// Whether some web process of Verso's pages exists now.
fn pages_exist() -> bool {
    all_processes().is_ok_and(|all| {
        all.flatten()
            .filter_map(|p| u32::try_from(p.pid).ok())
            .any(is_pages_process)
    })
}

/// Whether a tool of the PulseAudio protocol runs here.
fn have(tool: &str) -> bool {
    Command::new(tool)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

/// Whether the tools this source needs are installed.
#[must_use]
pub fn tools_present() -> bool {
    have("pactl") && have("parec")
}

/// The sink inputs now.
fn sink_inputs() -> Option<Vec<SinkInput>> {
    let out = Command::new("pactl")
        .args(["list", "sink-inputs"])
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| parse_sink_inputs(&String::from_utf8_lossy(&out.stdout)))
}

/// The one source, *Pages open in Verso*, when a page's web process exists;
/// else why none, in the words the window knows.
///
/// # Errors
/// The reason.
pub fn list() -> Result<Vec<AudioSource>, &'static str> {
    if !tools_present() {
        return Err(NEEDS_PULSE_TOOLS);
    }
    if !pages_exist() {
        crate::log::write(
            "INFO",
            "host",
            "share audio: no WebKitWebProcess of the pages' profile is a child of Verso",
        );
        return Err(NO_PAGES);
    }
    Ok(vec![Pages.describe()])
}

/// The source `id` names, or `None`.
#[must_use]
pub fn open(id: &str) -> Option<Box<dyn Source>> {
    (id == PAGES_ID).then(|| Box::new(Pages) as Box<dyn Source>)
}

/// Whether a page plays sound now, for naming the source only (S10):
/// WebKitGTK's `is_playing_audio`, on the main thread inside `with_webview`.
pub fn ask_playing(pw: &tauri::webview::PlatformWebview, tx: std::sync::mpsc::Sender<bool>) {
    use webkit2gtk::WebViewExt;
    let _ = tx.send(pw.inner().is_playing_audio());
}

struct Pages;

impl Source for Pages {
    fn describe(&self) -> AudioSource {
        AudioSource {
            id: PAGES_ID.to_owned(),
            name: PAGES_NAME.to_owned(),
            kind: AudioSourceKind::Page,
        }
    }

    fn start(self: Box<Self>, sink: PcmSink) -> Result<Running, String> {
        if !tools_present() {
            return Err(NEEDS_PULSE_TOOLS.to_owned());
        }
        if !pages_exist() {
            return Err(NO_PAGES.to_owned());
        }
        let stop = Arc::new(AtomicBool::new(false));
        let queues: Queues = Arc::default();
        let supervisor = {
            let (stop, queues) = (Arc::clone(&stop), Arc::clone(&queues));
            std::thread::Builder::new()
                .name("audio-share-streams".to_owned())
                .spawn(move || supervise(&stop, &queues))
                .map_err(|e| e.to_string())?
        };
        let mixer = {
            let (stop, queues) = (Arc::clone(&stop), Arc::clone(&queues));
            std::thread::Builder::new()
                .name("audio-share-mix".to_owned())
                .spawn(move || mixer(&stop, &queues, sink))
        };
        let mixer = match mixer {
            Ok(m) => m,
            Err(e) => {
                stop.store(true, Ordering::SeqCst);
                let _ = supervisor.join();
                return Err(e.to_string());
            }
        };
        Ok(Running::new(move || {
            stop.store(true, Ordering::SeqCst);
            let _ = supervisor.join();
            let _ = mixer.join();
        }))
    }
}

/// What each recorded stream has delivered and the mixer has not taken.
type Queues = Arc<Mutex<Vec<Arc<Mutex<std::collections::VecDeque<f32>>>>>>;

/// One stream being recorded.
struct Recording {
    child: Child,
    reader: Option<JoinHandle<()>>,
    queue: Arc<Mutex<std::collections::VecDeque<f32>>>,
}

impl Recording {
    fn begin(index: u32) -> Option<Self> {
        let mut child = Command::new("parec")
            .arg(format!("--monitor-stream={index}"))
            .args([
                "--raw",
                "--format=float32le",
                "--rate=48000",
                "--channels=2",
                "--latency-msec=20",
                "--client-name=Verso Share audio",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let mut out = child.stdout.take()?;
        let queue = Arc::<Mutex<std::collections::VecDeque<f32>>>::default();
        let fill = Arc::clone(&queue);
        let reader = std::thread::Builder::new()
            .name("audio-share-parec".to_owned())
            .spawn(move || {
                let mut buf = [0_u8; 4096];
                let mut carry = Vec::new();
                while let Ok(n) = out.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    push_bytes(&mut lock(&fill), &mut carry, &buf[..n]);
                }
            })
            .ok();
        if reader.is_none() {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        Some(Self {
            child,
            reader,
            queue,
        })
    }

    fn running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for Recording {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(r) = self.reader.take() {
            let _ = r.join();
        }
    }
}

/// Keep exactly the pages' streams recorded until `stop`.
fn supervise(stop: &AtomicBool, queues: &Queues) {
    let mut open: HashMap<u32, Recording> = HashMap::new();
    while !stop.load(Ordering::SeqCst) {
        open.retain(|_, r| r.running());
        // A pactl that fails leaves what is recorded as it is for a second.
        if let Some(inputs) = sink_inputs() {
            let wanted = page_streams(&inputs, own_pid(), is_pages_process);
            open.retain(|index, _| wanted.iter().any(|s| s.index == *index));
            for s in &wanted {
                if !open.contains_key(&s.index)
                    && let Some(r) = Recording::begin(s.index)
                {
                    open.insert(s.index, r);
                }
            }
            *lock(queues) = open.values().map(|r| Arc::clone(&r.queue)).collect();
        }
        let until = Instant::now() + POLL;
        while Instant::now() < until && !stop.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(50));
        }
    }
    lock(queues).clear();
    drop(open);
}

/// Every 10 ms: the sum of what the streams delivered, to the sink.
fn mixer(stop: &AtomicBool, queues: &Queues, mut sink: PcmSink) {
    let mut next = Instant::now() + TICK;
    while !stop.load(Ordering::SeqCst) {
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else if now - next > Duration::from_millis(200) {
            next = now;
        }
        next += TICK;
        let list = lock(queues).clone();
        let mut guards: Vec<_> = list.iter().map(|q| lock(q)).collect();
        let block = linuxpages::mix(guards.iter_mut().map(|g| &mut **g), TICK_SAMPLES);
        drop(guards);
        sink(&block);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_pages_source_opens() {
        assert!(open("pages").is_some());
        assert!(open("system").is_none());
        assert!(open("app:firefox").is_none());
        assert!(open("test-tone").is_none());
    }

    #[test]
    fn the_source_is_a_page_source_with_the_name_windows_has() {
        let d = Pages.describe();
        assert_eq!(d.id, "pages");
        assert_eq!(d.kind, AudioSourceKind::Page);
        assert_eq!(d.name, "Pages open in Verso");
    }

    #[test]
    fn this_test_process_is_not_a_page_process() {
        assert!(!is_pages_process(own_pid()));
        assert!(!is_pages_process(1));
        assert!(!is_pages_process(u32::MAX));
    }

    /// The real thing, for a desktop session with the installed app: not a
    /// unit test. A development build started from a terminal has pages
    /// whose process still descends from it, so it works there too. Run it
    /// from inside Verso's process tree only; from `cargo test` there is no
    /// page and it refuses. Kept for the maintainer's manual check
    /// (`docs/reference/manual-checks.md`).
    #[test]
    #[ignore = "needs a desktop session with a page of Verso playing"]
    fn linux_real_capture_of_pages_delivers_audio_and_stops() {
        use std::sync::Mutex;
        let got = Arc::new(Mutex::new((0_usize, 0.0_f32)));
        let seen = Arc::clone(&got);
        let running = Box::new(Pages)
            .start(Box::new(move |pcm| {
                let mut g = lock(&seen);
                g.0 += pcm.len() / 2;
                g.1 = pcm.iter().fold(g.1, |m, x| m.max(x.abs()));
            }))
            .expect("capture starts (a page of Verso open? pactl and parec installed?)");
        std::thread::sleep(Duration::from_secs(3));
        drop(running);
        let (frames, peak) = *lock(&got);
        println!("frames {frames}, peak {peak}");
        assert!(
            (100_000..=190_000).contains(&frames),
            "about 3 s of 48 kHz: {frames}"
        );
    }
}
