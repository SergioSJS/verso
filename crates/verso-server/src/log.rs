// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The server's log: one line per event on standard error, which Docker,
//! systemd's journal and a terminal all keep. Never a password, a token or
//! a link's secret (ADR 0074 item 9); the setup link is the one secret it
//! prints, once, by design (item 1).

/// The time as `YYYY-MM-DDTHH:MM:SSZ`, from the system clock.
#[must_use]
pub fn stamp() -> String {
    let secs = crate::db::now();
    let days = secs.div_euclid(86_400);
    let rest = secs.rem_euclid(86_400);
    // Civil date from days since the epoch (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest / 60 % 60,
        rest % 60
    )
}

/// One line of the log: the time, the level, the message. A newline or
/// another control character in the message becomes a space, so that no
/// message — a file's name in an error, a window's words — writes a second
/// line a host's tool would read as the server's own (ADR 0083 item 1).
pub fn line(level: &str, message: &str) {
    let message: String = message
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let said = format!("{level} {message}");
    eprintln!("{} {said}", stamp());
    #[cfg(test)]
    if let Ok(mut kept) = SAID.lock() {
        kept.push(said);
    }
}

/// Every line said while the tests run, for a test to look for its own
/// (the tests share the process: each looks for a name only it uses).
#[cfg(test)]
static SAID: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// The lines said so far that name `what`.
#[cfg(test)]
pub(crate) fn said(what: &str) -> Vec<String> {
    SAID.lock()
        .map(|s| s.iter().filter(|l| l.contains(what)).cloned().collect())
        .unwrap_or_default()
}

pub fn info(message: &str) {
    line("INFO", message);
}

pub fn warn(message: &str) {
    line("WARN", message);
}

pub fn error(message: &str) {
    line("ERROR", message);
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_stamp_is_a_utc_time() {
        let s = super::stamp();
        assert_eq!(s.len(), 20, "{s}");
        assert!(s.starts_with("20") && s.ends_with('Z'), "{s}");
    }
}
