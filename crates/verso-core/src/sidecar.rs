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

/// The keys marked visible; none when the file is missing or unreadable.
pub(crate) fn read_agents(config: &Path) -> Vec<String> {
    std::fs::read_to_string(config.join("agents.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Agents>(&text).ok())
        .map(|a| a.visible)
        .unwrap_or_default()
}

pub(crate) fn write_agents(config: &Path, visible: &[String]) -> std::io::Result<()> {
    let temporary = config.join("agents.json.tmp");
    let agents = Agents {
        visible: visible.to_vec(),
    };
    std::fs::write(&temporary, serde_json::to_vec_pretty(&agents)?)?;
    private(&temporary)?;
    std::fs::rename(&temporary, config.join("agents.json"))
}

/// The calls agents made, newest last, kept to the last [`AGENT_LOG_LINES`]:
/// `<config>/agents.log` (ADR 0054). Rewritten whole each time — a
/// temporary, a chmod to `0600`, a rename — with the calls this crate may
/// make on the configuration directory (its clippy.toml): no appending.
pub(crate) fn append_agent_log(config: &Path, line: &str) -> std::io::Result<()> {
    let file = config.join("agents.log");
    let mut text = std::fs::read_to_string(&file).unwrap_or_default();
    text.push_str(line);
    text.push('\n');
    let lines: Vec<&str> = text.lines().collect();
    let kept = lines[lines.len().saturating_sub(AGENT_LOG_LINES)..].join("\n") + "\n";
    let temporary = config.join("agents.log.tmp");
    std::fs::write(&temporary, kept)?;
    private(&temporary)?;
    std::fs::rename(&temporary, file)
}

/// What `agents.log` holds; empty when there is none.
pub(crate) fn read_agent_log(config: &Path) -> String {
    std::fs::read_to_string(config.join("agents.log")).unwrap_or_default()
}

/// The agents' calls `agents.log` keeps.
const AGENT_LOG_LINES: usize = 2000;
