// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! macOS: the source of Share audio (ADR 0116 item 17, as narrowed on
//! 2026-11-01): only the pages open in Verso, safe code over `macos.rs`'s
//! taps. The tap names the audio objects of Verso's WebKit GPU process
//! (`macpages.rs` says how they are found). Verso's own sounds are not in
//! them while a share runs: the window sends them to the host's own output
//! (`macos_play.rs`).
//!
//! A capture runs on two threads: the system's audio thread, which only
//! copies a block into a bounded channel (`macos.rs`), and a thread of ours
//! that converts it to 48 kHz stereo (`convert.rs`) and hands it to the
//! sink (the encoder and the connection). Stopping drops the tap first, so
//! no block comes after, then waits for ours.

use std::sync::mpsc::{channel, sync_channel};

use verso_contract::{AudioSource, AudioSourceKind};

use super::convert::Converter;
use super::macos::{self, Failure, Who};
use super::macpages::{self, AudioProc};
use super::source::{NEEDS_NEWER_MAC, PERMISSION_DENIED, PcmSink, Running, Source};
use super::winpages::{NO_PAGES, PAGES_ID, PAGES_NAME};

/// Blocks the channel holds: about a second of audio at the system's usual
/// 10 ms blocks. More means the sink is far behind; the newest are dropped.
const BACKLOG: usize = 100;

fn own_pid() -> i32 {
    i32::try_from(std::process::id()).unwrap_or(0)
}

/// Why nothing can be captured here, if it is the macOS version.
#[must_use]
pub fn unavailable() -> Option<&'static str> {
    (!macos::supported()).then_some(NEEDS_NEWER_MAC)
}

/// The audio objects of Verso's pages now (none until a page made sound).
fn page_objects() -> Result<Vec<u32>, String> {
    let procs: Vec<AudioProc> = macos::audio_processes()?;
    let found = macpages::page_objects(&procs, own_pid(), macos::responsible_of);
    if found.is_empty() {
        // Said once a minute at most would be nicer; the picker asks rarely.
        crate::log::write(
            "INFO",
            "host",
            &format!(
                "share audio: none of the {} audio processes is Verso's page process (responsible pid must be {}; a build started from a terminal has none)",
                procs.len(),
                own_pid()
            ),
        );
    }
    Ok(found)
}

/// Whether some page of Verso has an audio object, for the picker.
#[must_use]
pub fn has_pages() -> bool {
    page_objects().is_ok_and(|o| !o.is_empty())
}

/// The one source, *Pages open in Verso*, when macOS can capture and a page
/// has made sound; else why none (as Windows says it).
///
/// # Errors
/// The reason, in the words the window knows.
pub fn list() -> Result<Vec<AudioSource>, &'static str> {
    if let Some(why) = unavailable() {
        return Err(why);
    }
    if !has_pages() {
        return Err(NO_PAGES);
    }
    Ok(vec![Pages.describe()])
}

/// The source `id` names, or `None`.
#[must_use]
pub fn open(id: &str) -> Option<Box<dyn Source>> {
    (id == PAGES_ID).then(|| Box::new(Pages) as Box<dyn Source>)
}

/// The pages source, resolved to audio objects when it starts.
struct Pages;

impl Source for Pages {
    fn describe(&self) -> AudioSource {
        AudioSource {
            id: PAGES_ID.to_owned(),
            name: PAGES_NAME.to_owned(),
            kind: AudioSourceKind::Page,
        }
    }

    fn start(self: Box<Self>, mut sink: PcmSink) -> Result<Running, String> {
        if !macos::supported() {
            return Err(NEEDS_NEWER_MAC.to_owned());
        }
        let objects = page_objects()?;
        if objects.is_empty() {
            return Err(NO_PAGES.to_owned());
        }
        let who = Who::Only(objects);
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
    fn only_the_pages_source_opens() {
        assert!(open("pages").is_some());
        assert!(open("system").is_none());
        assert!(open("app:com.spotify.client").is_none());
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
    fn with_no_page_sound_it_is_refused_with_the_no_pages_words() {
        if !macos::supported() {
            assert_eq!(list().err(), Some(NEEDS_NEWER_MAC));
            return;
        }
        // Under `cargo test` no WebKit process is responsible-to-this-test.
        assert_eq!(list().err(), Some(NO_PAGES));
        let err = Box::new(Pages)
            .start(Box::new(|_| {}))
            .err()
            .unwrap_or_default();
        assert_eq!(err, NO_PAGES);
    }

    /// The real thing, for the maintainer's Mac, from the installed app only
    /// (a terminal-launched run finds no pages by design): not a unit test.
    /// Run by hand with a page playing: `cargo test -p verso-app -- --ignored
    /// mac_real_capture`; it asks for System Audio Recording the first time.
    #[test]
    #[ignore = "needs a Mac, System Audio Recording allowed, and a page of Verso playing"]
    fn mac_real_capture_of_pages_delivers_audio_and_stops() {
        use std::sync::{Arc, Mutex};
        let got = Arc::new(Mutex::new((0_usize, 0.0_f32)));
        let seen = Arc::clone(&got);
        let running = Box::new(Pages)
            .start(Box::new(move |pcm| {
                if let Ok(mut g) = seen.lock() {
                    g.0 += pcm.len() / 2;
                    g.1 = pcm.iter().fold(g.1, |m, x| m.max(x.abs()));
                }
            }))
            .expect("capture starts (a page of Verso playing? permission allowed?)");
        std::thread::sleep(std::time::Duration::from_secs(3));
        drop(running);
        let (frames, peak) = *got.lock().expect("lock");
        println!("frames {frames}, peak {peak}");
        assert!(
            (100_000..=190_000).contains(&frames),
            "about 3 s of 48 kHz: {frames}"
        );
    }
}
