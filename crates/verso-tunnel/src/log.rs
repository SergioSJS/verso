// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Where the link's lines go: the host's own log. The desktop app writes
//! them in its diagnostic log (`app/src-tauri/src/log.rs`), a UniVerso in
//! the server's (`verso_server::log`); each says so once, at its start,
//! with [`set`]. Before that (and in a host that never says) a line goes
//! nowhere. No line holds a link, a hostname or a token (ADR 0117 D11
//! item 8): the callers write none, and `cloudflared`'s own lines are
//! [`crate::run::redact`]ed first.

use std::sync::OnceLock;

/// The host's log: `level` (`INFO`, `WARN`), `source` (the part of the
/// host that speaks, the app's log column), the line.
pub type Sink = Box<dyn Fn(&str, &str, &str) + Send + Sync>;

static SINK: OnceLock<Sink> = OnceLock::new();

/// Send the link's lines to `sink` from now on. Once per process: a second
/// call keeps the first.
pub fn set(sink: Sink) {
    let _ = SINK.set(sink);
}

/// One line.
pub(crate) fn write(level: &str, source: &str, text: &str) {
    #[cfg(test)]
    if let Ok(mut said) = SAID.lock() {
        said.push(format!("{level} {source} {text}"));
    }
    if let Some(sink) = SINK.get() {
        sink(level, source, text);
    }
}

/// Every line written under test, `LEVEL source message`.
#[cfg(test)]
static SAID: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// The lines written so far that name `what` (a test's). Unix only, as
/// the one test that reads it: on Windows it would be dead code.
#[cfg(all(test, unix))]
pub(crate) fn said(what: &str) -> Vec<String> {
    SAID.lock()
        .map(|s| s.iter().filter(|l| l.contains(what)).cloned().collect())
        .unwrap_or_default()
}
