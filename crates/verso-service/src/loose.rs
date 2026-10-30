// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The loose-files window's files (ADR 0114 item 19): a client that shows
//! one or more files without a folder, each a [`Loose`] of its own,
//! named in the window by its file name (a second file of the same name
//! by a numbered one). A loose client is not a folder client: every
//! folder command asked of it is refused with [`not_available`], so a
//! stale window cannot reach the index, the tree or the bin; the few
//! commands a file answers — `read_note`, `write_note`, `links`,
//! `backlinks`, `resolve_attachment` — are answered here.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak};

use verso_contract::{
    ContractError, ErrorKind, FolderChanged, IndexSummary, LooseFileInfo, ReadOnlyReason,
};
use verso_core::{Loose, LooseReadOnly};

use crate::convert::note_out;
use crate::ops::OpError;
use crate::ops::links_out;
use crate::{Service, lock};

/// One file of a loose window.
pub struct LooseSession {
    pub loose: Loose,
    pub info: LooseFileInfo,
    _watch: Option<verso_core::Watch>,
}

/// The files of one loose window: the name in the window and the file.
type Files = Vec<(String, Arc<Mutex<LooseSession>>)>;

/// Every loose window's files, by the client that shows them.
#[derive(Default)]
pub(crate) struct LooseWindows {
    by_client: HashMap<String, Files>,
}

/// What a folder command is answered with on a loose client (ADR 0114
/// item 19): the window hides it; this refuses it.
#[must_use]
pub fn not_available() -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: "not available for a file opened without its folder".to_owned(),
    }
}

fn no_such_file(name: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::NotFound,
        message: format!("no file named {name} in this window"),
    }
}

fn info_of(loose: &Loose, name: &str, known_folder: Option<String>) -> LooseFileInfo {
    LooseFileInfo {
        name: name.to_owned(),
        key: loose.key(),
        place: loose.place(),
        read_only: loose.read_only().map(|why| match why {
            LooseReadOnly::Permissions(_) => ReadOnlyReason::Permissions,
            LooseReadOnly::TooLarge => ReadOnlyReason::TooLarge,
        }),
        size: u32::try_from(loose.size()).unwrap_or(u32::MAX),
        known_folder,
    }
}

/// The name `wanted` gets in a window whose files are `taken`: itself, or
/// `stem (n).ext` for the first free `n` from 2.
fn free_name(wanted: &str, taken: &[String]) -> String {
    if !taken.iter().any(|t| t == wanted) {
        return wanted.to_owned();
    }
    let (stem, ext) = match wanted.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (wanted, String::new()),
    };
    (2..)
        .map(|n| format!("{stem} ({n}){ext}"))
        .find(|c| !taken.iter().any(|t| t == c))
        .unwrap_or_else(|| wanted.to_owned())
}

/// A summary with nothing in it: a loose file has no index.
fn no_index() -> IndexSummary {
    IndexSummary {
        indexed: 0,
        unchanged: 0,
        removed: 0,
        placeholders: 0,
        problems: Vec::new(),
        unwatched: None,
        unindexed: None,
    }
}

impl Service {
    /// Whether `client` shows files without a folder.
    #[must_use]
    pub fn is_loose(&self, client: &str) -> bool {
        lock(&self.loose)
            .by_client
            .get(client)
            .is_some_and(|files| !files.is_empty())
    }

    /// The loose-files window of the app, if one has files open: the main
    /// window first, then by label.
    #[must_use]
    pub fn loose_window(&self) -> Option<String> {
        let loose = lock(&self.loose);
        let mut labels: Vec<&String> = loose
            .by_client
            .iter()
            .filter(|(_, files)| !files.is_empty())
            .map(|(c, _)| c)
            .collect();
        labels.sort_by_key(|l| (l.as_str() != "main", (*l).clone()));
        labels.first().map(|l| (*l).clone())
    }

    /// The files `client` shows, in the order they were opened.
    #[must_use]
    pub fn loose_files(&self, client: &str) -> Vec<LooseFileInfo> {
        lock(&self.loose)
            .by_client
            .get(client)
            .map(|files| files.iter().map(|(_, s)| lock(s).info.clone()).collect())
            .unwrap_or_default()
    }

    /// The absolute path of the file `client` shows as `name`: the
    /// host's, for "open the whole folder" and the recents; never the
    /// window's.
    #[must_use]
    pub fn loose_path(&self, client: &str, name: &str) -> Option<PathBuf> {
        let session = self.loose_session(client, name)?;
        let path = lock(&session).loose.file_path().to_path_buf();
        Some(path)
    }

    /// Whether `client` already shows the file at `path`: its name there.
    #[must_use]
    pub fn loose_name_of(&self, client: &str, path: &Path) -> Option<String> {
        let loose = lock(&self.loose);
        let files = loose.by_client.get(client)?;
        files
            .iter()
            .find(|(_, s)| lock(s).loose.file_path() == path)
            .map(|(name, _)| name.clone())
    }

    fn loose_session(&self, client: &str, name: &str) -> Option<Arc<Mutex<LooseSession>>> {
        let loose = lock(&self.loose);
        let files = loose.by_client.get(client)?;
        files
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, s)| Arc::clone(s))
    }

    /// Open the file at `path` (the entry edge, on the host's side) in
    /// `client`, which leaves any folder it showed; a file the client
    /// already shows is answered again, not opened twice. `known_folder`
    /// is the name of a folder opened before that the file lies in, when
    /// the host found one (item 7 ii).
    pub fn open_loose(
        self: &Arc<Self>,
        client: &str,
        path: &Path,
        known_folder: Option<String>,
    ) -> Result<LooseFileInfo, ContractError> {
        if let Some(name) = self.loose_name_of(client, path) {
            return self
                .loose_files(client)
                .into_iter()
                .find(|f| f.name == name)
                .ok_or_else(|| no_such_file(&name));
        }
        let loose = Loose::open(path).map_err(crate::convert)?;
        self.release(client);
        Ok(self.add_loose(client, loose, known_folder))
    }

    /// A sibling note the file `from` names, opened as a file of its own
    /// in the same window (item 14): `not_found` when nothing of that name
    /// is a note beside it.
    pub fn open_sibling(
        self: &Arc<Self>,
        client: &str,
        from: &str,
        target: &str,
    ) -> Result<LooseFileInfo, ContractError> {
        let session = self
            .loose_session(client, from)
            .ok_or_else(|| no_such_file(from))?;
        let sibling = lock(&session)
            .loose
            .open_sibling(target)
            .map_err(crate::convert)?;
        if let Some(name) = self.loose_name_of(client, sibling.file_path()) {
            return self
                .loose_files(client)
                .into_iter()
                .find(|f| f.name == name)
                .ok_or_else(|| no_such_file(&name));
        }
        Ok(self.add_loose(client, sibling, None))
    }

    fn add_loose(
        self: &Arc<Self>,
        client: &str,
        loose: Loose,
        known: Option<String>,
    ) -> LooseFileInfo {
        let taken: Vec<String> = lock(&self.loose)
            .by_client
            .get(client)
            .map(|files| files.iter().map(|(n, _)| n.clone()).collect())
            .unwrap_or_default();
        let name = free_name(&loose.name(), &taken);
        let info = info_of(&loose, &name, known);
        let watch = self.watch_loose(&loose, client, &name, &info.key);
        let session = Arc::new(Mutex::new(LooseSession {
            loose,
            info: info.clone(),
            _watch: watch,
        }));
        lock(&self.loose)
            .by_client
            .entry(client.to_owned())
            .or_default()
            .push((name, session));
        info
    }

    /// The file watched for changes made outside (item 11): each batch is
    /// told to the client as a `folder-changed` of the file's key, the
    /// file named among `changed`, or among `removed` when it is gone.
    fn watch_loose(
        self: &Arc<Self>,
        loose: &Loose,
        client: &str,
        name: &str,
        key: &str,
    ) -> Option<verso_core::Watch> {
        let service: Weak<Self> = Arc::downgrade(self);
        let shown = name.to_owned();
        let (client, name, key) = (client.to_owned(), name.to_owned(), key.to_owned());
        match loose.watch(move |_changes| {
            let Some(service) = service.upgrade() else {
                return;
            };
            let Some(session) = service.loose_session(&client, &name) else {
                return;
            };
            let gone = {
                let mut s = lock(&session);
                let gone = !s.loose.exists();
                // The file's size and whether it can be written may have
                // changed with it.
                s.info = info_of(&s.loose, &name, s.info.known_folder.clone());
                gone
            };
            let (changed, removed) = if gone {
                (Vec::new(), vec![name.clone()])
            } else {
                (vec![name.clone()], Vec::new())
            };
            service.events().folder_changed(
                std::slice::from_ref(&client),
                &FolderChanged {
                    key: key.clone(),
                    changed,
                    removed,
                    moved: Vec::new(),
                    listing: false,
                    index: no_index(),
                },
            );
        }) {
            Ok(watch) => Some(watch),
            Err(e) => {
                self.events().log(
                    "WARN",
                    &format!("file {shown}: not watched for outside changes: {e}"),
                );
                None
            }
        }
    }

    /// `client` closed the tab of `name`: the file is let go.
    pub fn close_loose(&self, client: &str, name: &str) {
        let mut loose = lock(&self.loose);
        if let Some(files) = loose.by_client.get_mut(client) {
            files.retain(|(n, _)| n != name);
            if files.is_empty() {
                loose.by_client.remove(client);
            }
        }
    }

    /// `client` shows no loose file any more (it closed, or opened a folder).
    pub(crate) fn release_loose(&self, client: &str) {
        lock(&self.loose).by_client.remove(client);
    }

    /// Run `f` on the file `client` shows as `name`.
    pub fn with_loose<T, F: FnOnce(&mut Loose) -> Result<T, OpError>>(
        &self,
        client: &str,
        name: &str,
        f: F,
    ) -> Result<T, ContractError> {
        let session = self
            .loose_session(client, name)
            .ok_or_else(|| no_such_file(name))?;
        let mut session = lock(&session);
        let out = f(&mut session.loose).map_err(OpError::into_contract);
        session.info = info_of(&session.loose, name, session.info.known_folder.clone());
        out
    }

    /// The bytes of an attachment one of `client`'s files names beside
    /// itself (`verso://` for the loose window): the first file whose
    /// parent has it.
    pub fn loose_attachment(&self, client: &str, relative: &str) -> Result<Vec<u8>, ContractError> {
        let sessions: Vec<Arc<Mutex<LooseSession>>> = lock(&self.loose)
            .by_client
            .get(client)
            .map(|files| files.iter().map(|(_, s)| Arc::clone(s)).collect())
            .unwrap_or_default();
        let mut last = ContractError {
            kind: ErrorKind::NotFound,
            message: "no such attachment beside the open files".to_owned(),
        };
        for session in sessions {
            match lock(&session).loose.read_attachment(relative) {
                Ok(bytes) => return Ok(bytes),
                Err(e) => last = crate::convert(e),
            }
        }
        Err(last)
    }

    /// The commands a loose file answers, by name with the window's JSON
    /// arguments; `None` for any other command of a folder, which the
    /// caller refuses with [`not_available`].
    pub fn loose_dispatch(
        &self,
        client: &str,
        name: &str,
        args: &serde_json::Value,
    ) -> Option<Result<serde_json::Value, ContractError>> {
        let text = |k: &str| args.get(k).and_then(|v| v.as_str()).map(str::to_owned);
        let json = |v: Result<serde_json::Value, serde_json::Error>| {
            v.map_err(|e| crate::failed(e.to_string()))
        };
        Some(match name {
            "read_note" => {
                let path = text("path")?;
                self.with_loose(client, &path, |l| Ok(note_out(l.read(&path)?)))
                    .and_then(|n| json(serde_json::to_value(n)))
            }
            "write_note" => {
                let (path, body, revision) = (text("path")?, text("text")?, text("revision")?);
                self.with_loose(client, &path, |l| {
                    let w = l.write(&path, &body, &revision)?;
                    Ok(verso_contract::Written {
                        note: note_out(w.note),
                        warnings: w.warnings,
                    })
                })
                .and_then(|w| json(serde_json::to_value(w)))
            }
            "resolve_attachment" => {
                let (source, target) = (text("source")?, text("target")?);
                self.with_loose(client, &source, |l| Ok(l.resolve_attachment(&target)))
                    .and_then(|r| json(serde_json::to_value(r)))
            }
            "links" => {
                let path = text("path")?;
                self.with_loose(client, &path, |l| Ok(links_out(Some(l.links(&path)?))))
                    .and_then(|r| json(serde_json::to_value(r)))
            }
            "backlinks" | "unlinked_mentions" | "list_block_ids" => Err(not_available()),
            _ => return None,
        })
    }
}

/// Save `text` as a new file at `path` (the system's save dialog, on the
/// host's side: ADR 0114 item 11, "Save a copy…"): through `verso-fs`,
/// atomically, refusing to replace what stands there.
pub fn save_copy(path: &Path, text: &str) -> Result<(), ContractError> {
    Loose::save_copy_at(path, text).map_err(crate::convert)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_file_of_the_same_name_gets_a_number() {
        let taken = vec!["nota.md".to_owned(), "nota (2).md".to_owned()];
        assert_eq!(free_name("nota.md", &[]), "nota.md");
        assert_eq!(free_name("nota.md", &taken), "nota (3).md");
        assert_eq!(free_name("outra.md", &taken), "outra.md");
        assert_eq!(free_name("README", &["README".to_owned()]), "README (2)");
    }
}
