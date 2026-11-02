// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! macOS: the sources of Share audio (ADR 0116 item 17), safe code over
//! `macos.rs`'s taps: "Everything this Mac plays" (the system minus Verso's
//! own process and what it started, so its dice and chimes are not sent
//! back to the table) and each running application that has made sound, by
//! the name the person knows it by, never a window title.
//!
//! A capture runs on two threads: the system's audio thread, which only
//! copies a block into a bounded channel (`macos.rs`), and a thread of ours
//! that converts it to 48 kHz stereo (`convert.rs`) and hands it to the
//! sink (the encoder and the connection). Stopping drops the tap first, so
//! no block comes after, then waits for ours.

use std::sync::mpsc::{channel, sync_channel};

use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication, NSWorkspace};
use verso_contract::{AudioSource, AudioSourceKind};

use super::apps::{self, AudioProc, RunApp};
use super::convert::Converter;
use super::macos::{self, Failure, Who};
use super::source::{NEEDS_NEWER_MAC, PERMISSION_DENIED, PcmSink, Running, Source};

/// Blocks the channel holds: about a second of audio at the system's usual
/// 10 ms blocks. More means the sink is far behind; the newest are dropped.
const BACKLOG: usize = 100;

/// The applications that run with a window and a Dock icon.
fn running_apps() -> Vec<RunApp> {
    NSWorkspace::sharedWorkspace()
        .runningApplications()
        .iter()
        .filter(|a| a.activationPolicy() == NSApplicationActivationPolicy::Regular)
        .filter_map(|a| {
            Some(RunApp {
                pid: a.processIdentifier(),
                bundle_id: a.bundleIdentifier()?.to_string(),
                name: a.localizedName()?.to_string(),
            })
        })
        .collect()
}

/// Verso's own bundle identifier.
fn own_bundle() -> String {
    NSRunningApplication::currentApplication()
        .bundleIdentifier()
        .map(|b| b.to_string())
        .unwrap_or_default()
}

fn own_pid() -> i32 {
    i32::try_from(std::process::id()).unwrap_or(0)
}

/// Why nothing can be captured here, if it is the macOS version.
#[must_use]
pub fn unavailable() -> Option<&'static str> {
    (!macos::supported()).then_some(NEEDS_NEWER_MAC)
}

/// Everything this Mac plays, and each application that has made sound.
#[must_use]
pub fn list() -> Vec<AudioSource> {
    if !macos::supported() {
        return Vec::new();
    }
    let procs = macos::audio_processes().unwrap_or_default();
    let groups = apps::group(&procs, &running_apps(), own_pid(), &own_bundle());
    apps::sources(&groups)
}

/// The source `id` names, or `None`.
#[must_use]
pub fn open(id: &str) -> Option<Box<dyn Source>> {
    if id == apps::SYSTEM_ID {
        return Some(Box::new(MacSource::System));
    }
    let bundle = apps::bundle_of(id)?;
    let name = running_apps()
        .into_iter()
        .find(|a| a.bundle_id == bundle)
        .map_or_else(|| bundle.to_owned(), |a| a.name);
    Some(Box::new(MacSource::App {
        bundle: bundle.to_owned(),
        name,
    }))
}

/// A source, resolved to processes when it starts (an application's helper
/// processes come and go).
enum MacSource {
    System,
    App { bundle: String, name: String },
}

impl MacSource {
    /// Whom to tap, and what to call the source for a message.
    fn who(&self) -> Result<(Who, String), String> {
        let procs: Vec<AudioProc> = macos::audio_processes()?;
        match self {
            Self::System => {
                let own = apps::own_objects(&procs, own_pid(), macos::parent_of);
                Ok((Who::AllBut(own), "Everything this Mac plays".to_owned()))
            }
            Self::App { bundle, .. } => {
                let groups = apps::group(&procs, &running_apps(), own_pid(), &own_bundle());
                let found = groups.into_iter().find(|g| &g.bundle_id == bundle);
                match found {
                    Some(g) => Ok((Who::Only(g.objects), g.name)),
                    None => Err(format!(
                        "{bundle} is not making sound right now: start playing in it, then choose it again"
                    )),
                }
            }
        }
    }
}

impl Source for MacSource {
    fn describe(&self) -> AudioSource {
        match self {
            Self::System => AudioSource {
                id: apps::SYSTEM_ID.to_owned(),
                name: "Everything this Mac plays".to_owned(),
                kind: AudioSourceKind::System,
            },
            Self::App { bundle, name } => AudioSource {
                id: format!("{}{bundle}", apps::APP_PREFIX),
                name: name.clone(),
                kind: AudioSourceKind::App,
            },
        }
    }

    fn start(self: Box<Self>, mut sink: PcmSink) -> Result<Running, String> {
        if !macos::supported() {
            return Err(NEEDS_NEWER_MAC.to_owned());
        }
        let (who, _name) = self.who()?;
        let (tx, rx) = sync_channel(BACKLOG);
        let (ready_tx, ready_rx) = channel::<Result<u32, String>>();
        let (stop_tx, stop_rx) = channel::<()>();
        // The tap lives on a thread of its own: its objects are not `Send`,
        // and they are made and destroyed in the one place.
        let owner = std::thread::Builder::new()
            .name("audio-share-tap".to_owned())
            .spawn(move || match macos::start(&who, "Verso Share audio", tx) {
                Ok(chain) => {
                    let _ = ready_tx.send(Ok(chain.rate));
                    // A message, or the handle dropped: either ends it.
                    let _ = stop_rx.recv();
                    // The tap first: no block arrives after it, and its
                    // block drops the sender, which ends the converter.
                    drop(chain);
                }
                Err(Failure::Denied) => {
                    let _ = ready_tx.send(Err(PERMISSION_DENIED.to_owned()));
                }
                Err(Failure::Other(why)) => {
                    let _ = ready_tx.send(Err(why));
                }
            })
            .map_err(|e| e.to_string())?;
        let rate = match ready_rx.recv() {
            Ok(Ok(rate)) => rate,
            Ok(Err(why)) => {
                let _ = owner.join();
                return Err(why);
            }
            Err(_) => {
                let _ = owner.join();
                return Err("the capture thread ended before it began".to_owned());
            }
        };
        let converter = std::thread::Builder::new()
            .name("audio-share-mac".to_owned())
            .spawn(move || {
                let mut at: Option<(usize, Converter)> = None;
                let mut out = Vec::new();
                for block in rx {
                    if at.as_ref().map(|(c, _)| *c) != Some(block.channels) {
                        match Converter::new(rate, block.channels) {
                            Ok(c) => at = Some((block.channels, c)),
                            Err(_) => continue,
                        }
                    }
                    if let Some((_, converter)) = at.as_mut() {
                        out.clear();
                        converter.push(&block.samples, &mut out);
                        if !out.is_empty() {
                            sink(&out);
                        }
                    }
                }
            });
        let converter = match converter {
            Ok(c) => c,
            Err(e) => {
                let _ = stop_tx.send(());
                let _ = owner.join();
                return Err(e.to_string());
            }
        };
        Ok(Running::new(move || {
            let _ = stop_tx.send(());
            let _ = owner.join();
            let _ = converter.join();
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_open_to_the_sources_they_name() {
        assert!(open("system").is_some());
        assert!(open("app:com.spotify.client").is_some());
        assert!(open("app:").is_none());
        assert!(open("test-tone").is_none());
        assert!(open("nothing").is_none());
    }

    #[test]
    fn the_list_always_has_everything_first_on_a_supported_mac() {
        if !macos::supported() {
            assert!(list().is_empty());
            assert_eq!(unavailable(), Some(NEEDS_NEWER_MAC));
            return;
        }
        let list = list();
        assert_eq!(list[0].id, "system");
        assert_eq!(list[0].kind, AudioSourceKind::System);
        assert!(
            list[1..]
                .iter()
                .all(|s| s.kind == AudioSourceKind::App && s.id.starts_with("app:"))
        );
        // Verso is never offered to itself.
        assert!(
            list.iter()
                .all(|s| s.id != format!("app:{}", own_bundle()) || own_bundle().is_empty())
        );
    }

    #[test]
    fn an_application_that_makes_no_sound_is_told_so_not_started() {
        if !macos::supported() {
            return;
        }
        let src = Box::new(MacSource::App {
            bundle: "com.verso.nobody-runs-this".into(),
            name: "Nobody".into(),
        });
        let err = src.start(Box::new(|_| {})).err().unwrap_or_default();
        assert!(err.contains("not making sound"), "{err}");
    }

    /// The real thing, for the maintainer's Mac: `cargo test -p verso-app
    /// -- --ignored mac_real_capture` while something plays. The first run
    /// asks for System Audio Recording (the prompt names the program that
    /// runs the tests: the terminal). It captures "Everything this Mac
    /// plays" for 3 seconds and checks that 48 kHz stereo arrives and that
    /// stopping returns.
    #[test]
    #[ignore = "needs a Mac, System Audio Recording allowed, and something playing"]
    fn mac_real_capture_of_everything_delivers_audio_and_stops() {
        use std::sync::{Arc, Mutex};
        let got = Arc::new(Mutex::new((0_usize, 0.0_f32)));
        let seen = Arc::clone(&got);
        let running = Box::new(MacSource::System)
            .start(Box::new(move |pcm| {
                if let Ok(mut g) = seen.lock() {
                    g.0 += pcm.len() / 2;
                    g.1 = pcm.iter().fold(g.1, |m, x| m.max(x.abs()));
                }
            }))
            .expect("capture starts (System Audio Recording allowed?)");
        std::thread::sleep(std::time::Duration::from_secs(3));
        drop(running);
        let (frames, peak) = *got.lock().expect("lock");
        println!("frames {frames}, peak {peak}");
        assert!(
            (100_000..=190_000).contains(&frames),
            "about 3 s of 48 kHz: {frames}"
        );
        assert!(
            peak > 0.0,
            "silence: nothing was playing or the permission is off"
        );
    }
}
