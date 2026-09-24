// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An MCP client told where Verso is (ADR 0054): the entry of
//! `mcpServers` in Claude Desktop's configuration that starts
//! `verso mcp --key <key>` for a folder. Read and written through
//! `verso-fs`, as every file this app writes (ADR 0026 rule 5): atomically,
//! and only over the version that was read — the rule invariant 11 gives
//! the notes, applied to another app's file — with a copy of that version
//! left beside it first.
//!
//! The file is the client's: its other keys and servers are kept. It is
//! written back as JSON, two-space indented, keys in name order — the
//! order `serde_json` keeps — so what changes besides the one entry is
//! layout, never content, and the copy has the file as it was.

use std::path::Path;

use serde_json::Value;
use verso_fs::{ReadError, Root};

use crate::CoreError;

/// Claude Desktop's configuration file, in its configuration folder.
pub const CLAUDE_CONFIG: &str = "claude_desktop_config.json";

/// How a client's configuration stands with the entry the app would write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Entry {
    /// The client's configuration folder is not there: it is not installed.
    NoClient,
    /// No server by that name.
    Absent,
    /// The server by that name is the entry.
    Same,
    /// A server by that name starts something else.
    Different,
}

/// What a write did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Added {
    /// A server by that name was there and was replaced.
    pub replaced: bool,
    /// The name of the copy of the file as it was, beside it; `None` when
    /// there was no file.
    pub backup: Option<String>,
    /// What the atomic write could not guarantee (`verso_fs`'s reports).
    pub warnings: Vec<String>,
}

/// The name of a folder's server in a client: `verso-<the folder's name>`,
/// from its key (`Workspace::key`: the name, then a hash).
#[must_use]
pub fn server_name(key: &str) -> String {
    let name = key.rsplit_once('-').map_or(key, |(n, _)| n);
    format!("verso-{name}")
}

/// What a client starts for a folder: `command` — the linked command line
/// — with `mcp --key <key>`, so that the folder's path is written nowhere.
#[must_use]
pub fn verso_entry(command: &str, key: &str) -> Value {
    serde_json::json!({ "command": command, "args": ["mcp", "--key", key] })
}

fn not_json(e: &serde_json::Error) -> CoreError {
    CoreError::Client(format!(
        "the configuration is not JSON, and was not changed: {e}"
    ))
}

/// The configuration folder `dir` as a root, or `None` when it is not
/// there.
fn root(dir: &Path) -> Option<Root> {
    Root::open(dir, Vec::new()).ok()
}

/// The file's JSON, or `None` when there is no file.
fn read(root: &mut Root) -> Result<Option<(Value, verso_fs::Stamp, Vec<u8>)>, CoreError> {
    let handle = root
        .handle(Path::new(CLAUDE_CONFIG))
        .map_err(CoreError::Confined)?;
    match root.read(handle) {
        Ok((bytes, stamp)) => {
            let value: Value = serde_json::from_slice(&bytes).map_err(|e| not_json(&e))?;
            Ok(Some((value, stamp, bytes)))
        }
        Err(ReadError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(CoreError::Read(e)),
    }
}

/// How the configuration in `dir` stands with `entry` as the server
/// `server`.
pub fn claude_entry(dir: &Path, server: &str, entry: &Value) -> Result<Entry, CoreError> {
    let Some(mut root) = root(dir) else {
        return Ok(Entry::NoClient);
    };
    let Some((value, _, _)) = read(&mut root)? else {
        return Ok(Entry::Absent);
    };
    Ok(match value.get("mcpServers").and_then(|m| m.get(server)) {
        None => Entry::Absent,
        Some(found) if found == entry => Entry::Same,
        Some(_) => Entry::Different,
    })
}

/// Write `entry` as the server `server` of the configuration in `dir`.
pub fn add_to_claude(dir: &Path, server: &str, entry: Value) -> Result<Added, CoreError> {
    let Some(mut root) = root(dir) else {
        return Err(CoreError::Client("the client is not installed".to_owned()));
    };
    let current = read(&mut root)?;
    let mut value = match &current {
        Some((v, _, _)) => v.clone(),
        None => Value::Object(serde_json::Map::new()),
    };
    let Some(object) = value.as_object_mut() else {
        return Err(CoreError::Client(
            "the configuration is not a JSON object, and was not changed".to_owned(),
        ));
    };
    let servers = object
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(servers) = servers.as_object_mut() else {
        return Err(CoreError::Client(
            "`mcpServers` is not a JSON object, and was not changed".to_owned(),
        ));
    };
    let replaced = servers.insert(server.to_owned(), entry).is_some();
    let mut bytes = serde_json::to_vec_pretty(&value).map_err(|e| not_json(&e))?;
    bytes.push(b'\n');
    match current {
        None => {
            let (_, report) = root
                .create(Path::new(CLAUDE_CONFIG), &bytes)
                .map_err(CoreError::Write)?;
            Ok(Added {
                replaced,
                backup: None,
                warnings: report.warnings(),
            })
        }
        Some((_, stamp, old)) => {
            // The copy first, under a name nothing else uses: a later write
            // that fails leaves both.
            let mut backup = None;
            let mut warnings = Vec::new();
            for n in 1..1000 {
                let name = format!("claude_desktop_config.verso-backup-{n}.json");
                match root.create(Path::new(&name), &old) {
                    Ok((_, report)) => {
                        warnings.extend(report.warnings());
                        backup = Some(name);
                        break;
                    }
                    Err(verso_fs::WriteError::Exists) => {}
                    Err(e) => return Err(CoreError::Write(e)),
                }
            }
            if backup.is_none() {
                return Err(CoreError::Client(
                    "no free name for the copy of the configuration".to_owned(),
                ));
            }
            let handle = root
                .handle(Path::new(CLAUDE_CONFIG))
                .map_err(CoreError::Confined)?;
            let report = root
                .write(handle, &bytes, &stamp)
                .map_err(CoreError::Write)?;
            warnings.extend(report.warnings());
            Ok(Added {
                replaced,
                backup,
                warnings,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(key: &str) -> Value {
        verso_entry("/usr/local/bin/verso", key)
    }

    #[test]
    fn a_server_is_named_after_the_folder() {
        assert_eq!(server_name("Campanha-0123456789abcdef"), "verso-Campanha");
        assert_eq!(server_name("a-b-0123456789abcdef"), "verso-a-b");
        assert_eq!(
            entry("k"),
            json!({ "command": "/usr/local/bin/verso", "args": ["mcp", "--key", "k"] })
        );
    }

    #[test]
    fn no_folder_is_no_client() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("Claude");
        assert_eq!(
            claude_entry(&missing, "verso", &entry("k")).unwrap(),
            Entry::NoClient
        );
        assert!(matches!(
            add_to_claude(&missing, "verso", entry("k")),
            Err(CoreError::Client(_))
        ));
    }

    #[test]
    fn a_new_file_an_added_server_and_a_copy_of_what_was_there() {
        let dir = tempfile::tempdir().unwrap();
        let mut root = Root::open(dir.path(), Vec::new()).unwrap();
        assert_eq!(
            claude_entry(dir.path(), "verso-a", &entry("a")).unwrap(),
            Entry::Absent
        );
        let added = add_to_claude(dir.path(), "verso-a", entry("a")).unwrap();
        assert_eq!((added.replaced, added.backup), (false, None));
        assert_eq!(
            claude_entry(dir.path(), "verso-a", &entry("a")).unwrap(),
            Entry::Same
        );
        assert_eq!(
            claude_entry(dir.path(), "verso-a", &entry("b")).unwrap(),
            Entry::Different
        );
        // Another server and a key of the client's own are kept.
        let h = root.handle(Path::new(CLAUDE_CONFIG)).unwrap();
        let (_, stamp) = root.read(h).unwrap();
        let theirs = br#"{"globalShortcut":"Cmd+Space","mcpServers":{"other":{"command":"x","env":{"TOKEN":"s"}}}}"#;
        let _ = root.write(h, theirs, &stamp).unwrap();
        let added = add_to_claude(dir.path(), "verso-a", entry("a")).unwrap();
        assert!(!added.replaced);
        let backup = added.backup.unwrap();
        let (now, _) = root.read(h).unwrap();
        let v: Value = serde_json::from_slice(&now).unwrap();
        assert_eq!(v["globalShortcut"], "Cmd+Space");
        assert_eq!(v["mcpServers"]["other"]["env"]["TOKEN"], "s");
        assert_eq!(v["mcpServers"]["verso-a"], entry("a"));
        let b = root.handle(Path::new(&backup)).unwrap();
        assert_eq!(root.read(b).unwrap().0, theirs.to_vec());
        // Replaced, with a second copy.
        let again = add_to_claude(dir.path(), "verso-a", entry("b")).unwrap();
        assert!(again.replaced);
        assert_ne!(again.backup.unwrap(), backup);
    }

    #[test]
    fn a_file_that_is_not_json_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let mut root = Root::open(dir.path(), Vec::new()).unwrap();
        let _ = root
            .create(Path::new(CLAUDE_CONFIG), b"{ not json")
            .unwrap();
        assert!(matches!(
            claude_entry(dir.path(), "v", &entry("a")),
            Err(CoreError::Client(_))
        ));
        assert!(matches!(
            add_to_claude(dir.path(), "v", entry("a")),
            Err(CoreError::Client(_))
        ));
        let h = root.handle(Path::new(CLAUDE_CONFIG)).unwrap();
        assert_eq!(root.read(h).unwrap().0, b"{ not json".to_vec());
    }
}
