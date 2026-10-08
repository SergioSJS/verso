// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which folders agents may reach through the all-of-Verso MCP server, and
//! the log of what they read (ADR 0054, revised 2026-10-08). A folder is
//! hidden until the person marks it visible; the marks live in the
//! configuration directory, beside the indexes, because the server runs
//! without the app. Folders are named by their key; their names are for
//! people, and two folders may share one.

use std::path::{Path, PathBuf};

use crate::{CoreError, config_dir, key_for, sidecar, well_formed_key};

/// A folder Verso has opened, as an agent is shown it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownFolder {
    pub key: String,
    pub name: String,
    pub visible: bool,
}

fn dir(config: Option<&Path>) -> Result<PathBuf, CoreError> {
    match config {
        Some(dir) => Ok(dir.to_path_buf()),
        None => config_dir(),
    }
}

/// The folders Verso has opened (their indexes' sidecars), most recently
/// indexed first, each with its mark.
pub fn known(config: Option<&Path>) -> Result<Vec<KnownFolder>, CoreError> {
    let dir = dir(config)?;
    let visible = sidecar::read_agents(&dir).unwrap_or_default();
    Ok(sidecar::known_folders(&dir.join("index"))
        .into_iter()
        .map(|folder| {
            let key = key_for(&folder);
            KnownFolder {
                name: folder
                    .file_name()
                    .map_or_else(|| key.clone(), |n| n.to_string_lossy().into_owned()),
                visible: visible.contains(&key),
                key,
            }
        })
        .collect())
}

/// Whether the folder with `key` is marked visible to agents.
pub fn is_visible(config: Option<&Path>, key: &str) -> Result<bool, CoreError> {
    Ok(sidecar::read_agents(&dir(config)?)
        .unwrap_or_default()
        .iter()
        .any(|k| k == key))
}

/// Mark the folder with `key` visible to agents, or hidden again.
pub fn set_visible(config: Option<&Path>, key: &str, visible: bool) -> Result<(), CoreError> {
    if !well_formed_key(key) {
        return Err(CoreError::InvalidKey);
    }
    let dir = dir(config)?;
    let mut keys = sidecar::read_agents(&dir).ok_or_else(|| {
        CoreError::Sidecar(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "agents.json does not read: the marks in it are not written over",
        ))
    })?;
    keys.retain(|k| k != key);
    if visible {
        keys.push(key.to_owned());
    }
    keys.sort();
    sidecar::write_agents(&dir, &keys).map_err(CoreError::Sidecar)
}

/// Record a tool call of an agent in `<config>/agents.log`: which tool,
/// which folder, and what it asked for (a note's path, the words
/// searched). A log that cannot be written does not stop the answer.
pub fn log_call(config: Option<&Path>, tool: &str, folder: &str, what: &str) {
    let Ok(dir) = dir(config) else {
        return;
    };
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(0));
    let line = format!(
        "{} {tool} on {}: {}",
        stamp(secs),
        one_line(folder),
        one_line(what)
    );
    let _ = sidecar::append_agent_log(&dir, &line);
}

/// An agent's string as the log keeps it: one line, at most
/// [`LOGGED_CHARS`] characters — the log is rewritten whole on every call,
/// so a huge argument must not grow it.
fn one_line(text: &str) -> String {
    let mut out: String = text
        .chars()
        .take(LOGGED_CHARS)
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .collect();
    if text.chars().nth(LOGGED_CHARS).is_some() {
        out.push('…');
    }
    out
}

/// The characters of an argument an agent's call keeps in the log.
const LOGGED_CHARS: usize = 300;

/// The agents' calls recorded, one a line, newest last.
pub fn calls(config: Option<&Path>) -> Result<String, CoreError> {
    Ok(sidecar::read_agent_log(&dir(config)?))
}

/// `YYYY-MM-DDTHH:MM:SSZ`, as the app's log writes it.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stamp_is_the_civil_date() {
        assert_eq!(stamp(0), "1970-01-01T00:00:00Z");
        assert_eq!(stamp(1_791_486_000), "2026-10-08T19:00:00Z");
    }
}
