// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The temporary files a stopped process left behind, removed when a host
//! opens the folder ([`crate::Root::sweep_temporaries`]). Every atomic
//! write and every transfer in pieces writes to `.verso-tmp-<pid>-<n>`
//! beside its target before the rename (invariant 9); a crash, a power
//! loss or a killed process between the two leaves that file there. The
//! walk never lists it (its name is hidden), so nothing else would ever
//! remove it.
//!
//! Whose files may go. At the opening no write or transfer of the folder
//! is in flight in the opening host — but the same process may hold the
//! folder under another [`crate::Root`] (a second window of the app on the
//! same folder; a server folder closed with its last client while a
//! transfer in pieces it accepted is kept, and opened again): the files
//! named with this process's id are left alone. A file named with another
//! process's id belongs to a process that is gone: the only hosts that
//! sweep are the desktop app, which runs as a single instance (ADR 0042),
//! and the server, whose folders live in its own data directory, written
//! by it alone (ADR 0073); the command line and the MCP never write the
//! folder (ADR 0066) and never sweep. Another process writing the same
//! folder with this prefix at the same time is a case the ADRs do not
//! allow; if it happened, its write would fail at its rename and leave its
//! target as it was — no file of the folder is lost either way.

use std::path::{Path, PathBuf};

use crate::{MAX_DEPTH, Root, on_disk, rel_join};

/// The prefix of every temporary file of a write here.
pub(crate) const PREFIX: &str = ".verso-tmp-";

/// The hidden directories at the root Verso itself writes in, which the
/// sweep enters with everything below them:
/// the folder's settings (ADR 0070), its bin (ADR 0080, which keeps a
/// deleted folder whole), make.md's focuses (ADR 0062). Every other hidden directory (`.git`, `.obsidian`)
/// holds no file Verso wrote.
const WRITTEN_HIDDEN: [&str; 3] = [crate::SETTINGS_DIR, crate::trashbin::BIN, ".space"];

/// The process id a temporary file's name carries, if it is one of ours.
fn writer_of(name: &str) -> Option<u32> {
    name.strip_prefix(PREFIX)?.split('-').next()?.parse().ok()
}

impl Root {
    /// Remove the temporary files that writes and transfers of a stopped
    /// process left in the folder, and say how many went (see the module).
    /// For a host that opens the folder as its writer — the desktop app,
    /// the server — never for a reader beside it. The folders it enters:
    /// every one the walk would enter, ignoring nothing the user's rules
    /// may have changed since, plus Verso's own hidden ones; a symlink is
    /// not followed. A file that cannot be removed now stays, for the next
    /// opening.
    pub fn sweep_temporaries(&self) -> std::io::Result<usize> {
        let mine = std::process::id();
        let mut removed = 0;
        let mut stack = vec![(PathBuf::new(), 0usize)];
        while let Some((rel, depth)) = stack.pop() {
            let listing = match std::fs::read_dir(on_disk(&self.path, &rel)) {
                Ok(listing) => listing,
                // The root itself must be readable; a folder below that is
                // not is left for the walk to report.
                Err(e) if rel.as_os_str().is_empty() => return Err(e),
                Err(_) => continue,
            };
            for entry in listing.flatten() {
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if kind.is_dir() {
                    if depth < MAX_DEPTH && self.enters(&rel, &name) {
                        stack.push((rel_join(&rel, name.as_ref()), depth + 1));
                    }
                } else if kind.is_file()
                    && writer_of(&name).is_some_and(|pid| pid != mine)
                    && std::fs::remove_file(entry.path()).is_ok()
                {
                    removed += 1;
                }
            }
        }
        Ok(removed)
    }

    /// Whether the sweep enters the directory `name` under `rel`.
    fn enters(&self, rel: &Path, name: &str) -> bool {
        if name.starts_with('.') {
            return rel.as_os_str().is_empty() && WRITTEN_HIDDEN.contains(&name);
        }
        let at = rel_join(rel, name);
        if self.is_ignored(&at) {
            return false;
        }
        !(self.rules.builtin_ignores && crate::walk::is_default_ignored_dir(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_writer_is_read_from_the_name() {
        assert_eq!(writer_of(".verso-tmp-123-4"), Some(123));
        assert_eq!(writer_of(".verso-tmp-x-4"), None);
        assert_eq!(writer_of("verso-tmp-123-4"), None);
        assert_eq!(writer_of(".verso-tmp-"), None);
    }
}
