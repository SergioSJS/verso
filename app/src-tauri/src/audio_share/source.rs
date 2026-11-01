// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Where the sound comes from (ADR 0116 item 17). A [`Source`] gives
//! interleaved 48 kHz stereo `f32` blocks to a sink, from a thread of its
//! own, until its [`Running`] handle is dropped. The capture back-ends of
//! each system (later tasks: `macos.rs`, `windows.rs`, `linux.rs`) plug in
//! by being listed in [`list`] and opened in [`open`]; nothing else in the
//! module knows what a source is.
//!
//! The test tone is the first source (`tone.rs`). It is a development aid,
//! so it is listed only where [`test_tone_listed`] says.

use verso_contract::AudioSource;

/// What a source hands its sink: interleaved stereo `f32` at 48 kHz, in
/// blocks of any length.
pub type PcmSink = Box<dyn FnMut(&[f32]) + Send>;

/// A source that can start.
pub trait Source: Send {
    /// What the list shows.
    fn describe(&self) -> AudioSource;

    /// Start handing blocks to `sink`, from a thread of the source's own.
    ///
    /// # Errors
    /// The reason the capture could not begin, in words for the log.
    fn start(self: Box<Self>, sink: PcmSink) -> Result<Running, String>;
}

/// A source at work. Dropping it stops the source and waits for its thread
/// to end, so no block reaches the sink afterwards.
pub struct Running {
    stop: Option<Box<dyn FnOnce() + Send>>,
}

impl Running {
    /// A handle that runs `stop` when dropped.
    pub fn new(stop: impl FnOnce() + Send + 'static) -> Self {
        Self {
            stop: Some(Box::new(stop)),
        }
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            stop();
        }
    }
}

/// Whether this build lists the test tone: debug builds always; a release
/// build only when it was compiled with the cargo feature `test-tone`,
/// which no workflow of the repository sets. The shipped app never shows it.
#[must_use]
pub fn test_tone_listed() -> bool {
    cfg!(debug_assertions) || cfg!(feature = "test-tone")
}

/// Every source this build can capture now.
#[must_use]
pub fn list() -> Vec<AudioSource> {
    let mut out = Vec::new();
    if test_tone_listed() {
        out.push(super::tone::TestTone.describe());
    }
    out
}

/// The source `id` names, or `None`.
#[must_use]
pub fn open(id: &str) -> Option<Box<dyn Source>> {
    if test_tone_listed() && id == super::tone::ID {
        return Some(Box::new(super::tone::TestTone));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_test_tone_is_listed_and_opened_only_where_the_build_allows() {
        let allowed = cfg!(debug_assertions) || cfg!(feature = "test-tone");
        assert_eq!(test_tone_listed(), allowed);
        assert_eq!(list().iter().any(|s| s.id == "test-tone"), allowed);
        assert_eq!(open("test-tone").is_some(), allowed);
        assert!(open("nothing-by-this-name").is_none());
    }
}
