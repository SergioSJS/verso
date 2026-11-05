// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The app's diagnostic log: one file under the configuration
//! directory, never the open folder.
//!
//! Verso wrote nothing down before this. A command that failed said so
//! in the status bar and was gone; a panic, a rejected promise and a
//! failed update check left no trace at all, so a bug the user met
//! could only be found by running the binary from a terminal and
//! watching its `stderr` (2026-09-29, the maintainer, on being told
//! there was no log: "se der algum erro, a gente reza pra tentar
//! achar?").
//!
//! This is `verso-app`'s second declared `std::fs` exception, beside
//! `update.rs` (ADR 0029): the file sits in the configuration directory
//! `verso-core` names — the index sidecars' own (ADR 0011) — and the
//! grep in `scripts/check.sh` and in CI holds disk access to these two
//! modules alone. Nothing here touches a file of the open folder, and
//! nothing leaves the machine: the file is the user's, for them to read
//! or to paste into a report.

use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// Small enough to read whole and to paste into a report: past this the
/// file becomes `verso.log.1` and the older one is dropped, so the log
/// cannot grow without bound on a machine nobody is watching.
const MAX_BYTES: u64 = 512 * 1024;

/// One writer at a time: two threads never interleave a line.
static WRITING: Mutex<()> = Mutex::new(());

/// Where the log goes, fixed once, when the app starts. Nothing else
/// finds the file on its own: a test harness never calls [`open`], so a
/// test run — which exercises the very errors this module records —
/// never writes a line into the user's own log.
static DEST: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Name the file and let the log begin: `<config>/logs/verso.log`.
/// `None` inside when there is no configuration directory to write in —
/// the app runs all the same, it just keeps no diary.
pub(crate) fn open() {
    let _ = DEST.set(
        verso_core::config_dir()
            .ok()
            .map(|dir| dir.join("logs").join("verso.log")),
    );
}

/// Where the log lives, once [`open`] has said so.
pub(crate) fn path() -> Option<PathBuf> {
    DEST.get().cloned().flatten()
}

/// `YYYY-MM-DDTHH:MM:SSZ` from the seconds since the Unix epoch, in UTC
/// and without a date library: the civil-from-days algorithm, so the
/// log gains no dependency of its own.
/// Now, as the log writes it.
pub(crate) fn now() -> String {
    stamp(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(0)),
    )
}

fn stamp(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rest = secs.rem_euclid(86_400);
    let (hour, minute, second) = (rest / 3600, (rest % 3600) / 60, rest % 60);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// The most a message takes of its line, in bytes.
const MAX_LINE: usize = 4 * 1024;

/// One line: when, how bad, where from, and what happened. A message of
/// several lines is flattened, so one entry is always one line and the
/// file stays readable by eye and by `tail`.
pub(crate) fn write(level: &str, source: &str, message: &str) {
    #[cfg(test)]
    if let Ok(mut kept) = SAID.lock() {
        kept.push(format!("{level} {source} {message}"));
    }
    let Some(file) = path() else {
        return;
    };
    // A poisoned lock still serializes: a panic while logging must not
    // silence every later line (the panic hook writes here too).
    let _writing = WRITING
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if std::fs::metadata(&file).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = std::fs::rename(&file, file.with_extension("log.1"));
    }
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64);
    let mut flat = message.replace(['\n', '\r'], " · ");
    // One runaway message is one line of the log, not the whole log.
    if flat.len() > MAX_LINE {
        let mut cut = MAX_LINE;
        while !flat.is_char_boundary(cut) {
            cut -= 1;
        }
        let more = flat.len() - cut;
        flat.truncate(cut);
        flat.push_str(&format!(" … ({more} bytes more)"));
    }
    let Ok(mut out) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
    else {
        return;
    };
    // The user's own diagnostics, readable by the user alone, as the
    // index and its sidecar are (ADR 0046).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = out.set_permissions(std::fs::Permissions::from_mode(0o600));
    }
    let _ = writeln!(out, "{} {level:<5} {source:<6} {flat}", stamp(secs));
}

/// Every line written under test, `LEVEL source message`: a test never
/// has a file to read (see [`DEST`]), so what it asks of the log is kept
/// here, as `verso_server::log` keeps its own.
#[cfg(test)]
static SAID: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// The lines written so far that name `what` (a test's). Unix only, as
/// the one test that reads it (`tunnel::tests`, which runs a stand-in
/// `cloudflared` script): on Windows it would be dead code.
#[cfg(all(test, unix))]
pub(crate) fn said(what: &str) -> Vec<String> {
    SAID.lock()
        .map(|s| s.iter().filter(|l| l.contains(what)).cloned().collect())
        .unwrap_or_default()
}

/// The end of the log, whole lines, at most `bytes` of it: what a bug
/// report carries.
pub(crate) fn tail(bytes: usize) -> String {
    let Some(file) = path() else {
        return String::new();
    };
    let Ok(text) = std::fs::read_to_string(&file) else {
        return String::new();
    };
    if text.len() <= bytes {
        return text;
    }
    let mut cut = text.len() - bytes;
    while cut < text.len() && !text.is_char_boundary(cut) {
        cut += 1;
    }
    match text[cut..].find('\n') {
        Some(i) => text[cut + i + 1..].to_owned(),
        None => text[cut..].to_owned(),
    }
}

/// A panic used to vanish with the thread that took it. It is written
/// down first now, and then handed to the hook that was there, so the
/// terminal still shows what it always showed.
pub(crate) fn install_panic_hook() {
    let earlier = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write("PANIC", "host", &info.to_string());
        earlier(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::stamp;

    /// The formatter against dates a calendar can be checked against,
    /// including a leap day and the epoch itself.
    #[test]
    fn stamps_are_the_civil_dates() {
        assert_eq!(stamp(0), "1970-01-01T00:00:00Z");
        assert_eq!(stamp(1), "1970-01-01T00:00:01Z");
        assert_eq!(stamp(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(stamp(1_767_225_600), "2026-01-01T00:00:00Z");
        assert_eq!(stamp(1_790_000_645), "2026-09-21T14:24:05Z");
    }
}
