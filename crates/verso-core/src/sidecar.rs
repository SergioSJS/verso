// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The sidecar of an index: `<key>.json` beside `<key>.sqlite` under the
//! configuration directory (`docs/reference/index-decision.md` §2.4,
//! `cli-decision.md` §3.4). The index file is named by a hash of the
//! folder's path, so nothing in the directory says which folder an index
//! belongs to; the sidecar does — the folder's absolute path, when it was
//! last indexed and which schema the index has — so that orphans can be
//! listed and forgotten one day. It says nothing the index does not hold.
//!
//! This is bookkeeping of the configuration directory, so it is this
//! crate's (ADR 0028: `verso-fs` owns the open folder, `verso-index` the
//! index file), and this module is the crate's one exception to the
//! `std::fs` lint (ADR 0029, `crates/verso-core/clippy.toml`): a write to
//! a temporary name, a chmod of it, a rename over the sidecar, a read. The
//! rename means a reader never sees half a file. There is no fsync: losing
//! a sidecar costs an entry in a listing, not a note — the requirements of
//! ADR 0029 are for notes and live in `verso-fs`. The directory is the
//! index's, created at 0700, and the sidecar is `0600` like the index file
//! (ADR 0046) — set on the temporary, so the name it takes is never wider.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// What the sidecar records.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Sidecar {
    /// The folder, absolute and normalized, as `Workspace::folder` has it.
    /// A path that is not UTF-8 cannot be written and is an error, never
    /// a lossy string.
    pub folder: PathBuf,
    /// Seconds since the Unix epoch of the last `index` run.
    pub indexed_at: i64,
    /// The schema version of the index beside it.
    pub schema: i64,
}

impl Sidecar {
    /// Where the sidecar of the index at `index` is: the same name, `.json`.
    #[must_use]
    pub fn path_for(index: &Path) -> PathBuf {
        index.with_extension("json")
    }

    /// Write beside `index`; a reader sees the old file or the new one.
    pub(crate) fn write(&self, index: &Path) -> std::io::Result<()> {
        let temporary = index.with_extension("json.tmp");
        std::fs::write(&temporary, serde_json::to_vec_pretty(self)?)?;
        private(&temporary)?;
        std::fs::rename(&temporary, Self::path_for(index))
    }

    /// Read the sidecar of the index at `index`.
    pub fn read(index: &Path) -> std::io::Result<Self> {
        let text = std::fs::read_to_string(Self::path_for(index))?;
        Ok(serde_json::from_str(&text)?)
    }
}

/// The folders whose indexes live under `config`, most recently indexed
/// first: the sidecars say which folder each index belongs to, so the
/// window can offer them as its recent folders. A sidecar that cannot be
/// read is left out quietly — this is a menu, not an audit; a folder that
/// no longer exists fails at the click, with its ordinary error.
#[must_use]
pub fn known_folders(config: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(config) else {
        return Vec::new();
    };
    let mut found: Vec<(i64, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(sidecar) = serde_json::from_str::<Sidecar>(&text) else {
            continue;
        };
        found.push((sidecar.indexed_at, sidecar.folder));
    }
    found.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    found.dedup_by(|a, b| a.1 == b.1);
    found.into_iter().map(|(_, f)| f).collect()
}

/// `0600`, as the index file (ADR 0046). On a platform that is not Unix,
/// nothing is set — the same as the index.
#[cfg(unix)]
fn private(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn private(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

/// The folders marked visible to agents, in `<config>/agents.json`
/// (ADR 0054, revised 2026-10-08): read by the all-of-Verso MCP server,
/// which runs without the app. Written as the sidecar is: a temporary, a
/// chmod to `0600`, a rename.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Agents {
    #[serde(default)]
    visible: Vec<String>,
}

/// The keys marked visible: none when the file is missing; `None` when it
/// is there but does not read — the readers then see no folder (fail
/// closed), and a mark is not written over it.
pub(crate) fn read_agents(config: &Path) -> Option<Vec<String>> {
    match std::fs::read_to_string(config.join("agents.json")) {
        Ok(text) => serde_json::from_str::<Agents>(&text)
            .ok()
            .map(|a| a.visible),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Some(Vec::new()),
        Err(_) => None,
    }
}

/// A temporary name of this process's own: two processes writing at once
/// (the app and a server, two servers) never write into one temporary.
fn temporary(config: &Path, name: &str) -> std::path::PathBuf {
    config.join(format!("{name}.{}.tmp", std::process::id()))
}

pub(crate) fn write_agents(config: &Path, visible: &[String]) -> std::io::Result<()> {
    let temporary = temporary(config, "agents.json");
    let agents = Agents {
        visible: visible.to_vec(),
    };
    std::fs::write(&temporary, serde_json::to_vec_pretty(&agents)?)?;
    private(&temporary)?;
    std::fs::rename(&temporary, config.join("agents.json"))
}

/// The servers this app signed in to (ADR 0074 item 8; the maintainer's
/// answer K of 2026-10-09): each one's address, the device's token and the
/// account, in `<config>/servers.json`, `0600` as the index. The token is
/// a session of this device on that server, revocable there.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub(crate) struct Servers {
    #[serde(default)]
    pub(crate) servers: Vec<crate::servers::ServerLogin>,
    /// This computer's name as the person set it in Settings › Servers
    /// (ADR 0079 item 8, ADR 0074 item 8, decided 2026-10-11); none, the
    /// system's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) device: Option<String>,
}

/// The servers signed in to: none when the file is missing or does not
/// read (a sign-in again writes it anew).
pub(crate) fn read_servers(config: &Path) -> Servers {
    std::fs::read_to_string(config.join("servers.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub(crate) fn write_servers(config: &Path, servers: &Servers) -> std::io::Result<()> {
    let temporary = temporary(config, "servers.json");
    std::fs::write(&temporary, serde_json::to_vec_pretty(servers)?)?;
    private(&temporary)?;
    std::fs::rename(&temporary, config.join("servers.json"))
}

/// The folders the windows showed at the last remembering
/// (`<config>/open-windows.json`, `0600`): none when the file is missing or
/// does not read.
pub(crate) fn read_open_windows(config: &Path) -> Vec<String> {
    #[derive(Deserialize)]
    struct Windows {
        #[serde(default)]
        windows: Vec<String>,
    }
    std::fs::read_to_string(config.join("open-windows.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Windows>(&text).ok())
        .map(|w| w.windows)
        .unwrap_or_default()
}

/// Written as the other files of the configuration directory are: a
/// temporary of this process's own, a chmod to `0600`, a rename.
pub(crate) fn write_open_windows(config: &Path, windows: &[String]) -> std::io::Result<()> {
    let temporary = temporary(config, "open-windows.json");
    let body = serde_json::to_vec_pretty(&serde_json::json!({ "windows": windows }))?;
    std::fs::write(&temporary, body)?;
    private(&temporary)?;
    std::fs::rename(&temporary, config.join("open-windows.json"))
}

/// The files opened without a folder lately (ADR 0114 item 15, Q4):
/// `<config>/recent-files.json`, paths at the edge, read by the host for
/// its File › Open Recent menu and never sent to a window.
pub(crate) fn read_recent_files(config: &Path) -> Vec<PathBuf> {
    #[derive(Deserialize)]
    struct Files {
        #[serde(default)]
        files: Vec<PathBuf>,
    }
    std::fs::read_to_string(config.join("recent-files.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Files>(&text).ok())
        .map(|f| f.files)
        .unwrap_or_default()
}

pub(crate) fn write_recent_files(config: &Path, files: &[PathBuf]) -> std::io::Result<()> {
    let temporary = temporary(config, "recent-files.json");
    let body = serde_json::to_vec_pretty(&serde_json::json!({ "files": files }))?;
    std::fs::write(&temporary, body)?;
    private(&temporary)?;
    std::fs::rename(&temporary, config.join("recent-files.json"))
}

/// A synced folder's state (ADR 0079 item 3): `<config>/sync-<key>.json`,
/// `0600` as the index, beside the folder's index and never in the folder.
/// None when the file is missing or does not read: the folder then syncs
/// as if for the first time, which never deletes (item 11).
pub(crate) fn read_sync(config: &Path, key: &str) -> Option<crate::sync::State> {
    std::fs::read_to_string(config.join(format!("sync-{key}.json")))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

pub(crate) fn write_sync(
    config: &Path,
    key: &str,
    state: &crate::sync::State,
) -> std::io::Result<()> {
    let name = format!("sync-{key}.json");
    let temporary = temporary(config, &name);
    std::fs::write(&temporary, serde_json::to_vec(state)?)?;
    private(&temporary)?;
    std::fs::rename(&temporary, config.join(name))
}

/// The calls agents made, newest last: `<config>/agents.log` (ADR 0054).
/// Each call appends its line in one write, so two processes logging at
/// once both keep theirs (allowed 2026-10-09, the crate's clippy.toml). Past
/// [`AGENT_LOG_TRIM`] bytes the file is cut to its last [`AGENT_LOG_LINES`]
/// lines — a temporary of this process's own, a chmod to `0600`, a rename;
/// a line appended by another process during that rare cut can be lost.
pub(crate) fn append_agent_log(config: &Path, line: &str) -> std::io::Result<()> {
    use std::io::Write;
    let file = config.join("agents.log");
    let mut log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)?;
    private(&file)?;
    log.write_all(format!("{line}\n").as_bytes())?;
    if log.metadata()?.len() <= AGENT_LOG_TRIM {
        return Ok(());
    }
    drop(log);
    // A log that does not read whole is left as it is, never replaced by
    // nothing.
    let Ok(text) = std::fs::read_to_string(&file) else {
        return Ok(());
    };
    let lines: Vec<&str> = text.lines().collect();
    let kept = lines[lines.len().saturating_sub(AGENT_LOG_LINES)..].join("\n") + "\n";
    let temporary = temporary(config, "agents.log");
    std::fs::write(&temporary, kept)?;
    private(&temporary)?;
    std::fs::rename(&temporary, file)
}

/// The size past which `agents.log` is cut back to its last lines: about
/// twice what [`AGENT_LOG_LINES`] lines of at most 300 characters take.
const AGENT_LOG_TRIM: u64 = 1024 * 1024;

/// What `agents.log` holds; empty when there is none.
pub(crate) fn read_agent_log(config: &Path) -> String {
    std::fs::read_to_string(config.join("agents.log")).unwrap_or_default()
}

/// The agents' calls `agents.log` keeps.
const AGENT_LOG_LINES: usize = 2000;
