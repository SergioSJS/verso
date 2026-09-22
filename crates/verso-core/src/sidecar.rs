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
//! a temporary name, a rename over the sidecar, a read. The rename means a
//! reader never sees half a file. There is no fsync: losing a sidecar
//! costs an entry in a listing, not a note — the requirements of ADR 0029
//! are for notes and live in `verso-fs`. The directory is the index's,
//! created at 0700, so the sidecar is as private as the index.

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
        std::fs::rename(&temporary, Self::path_for(index))
    }

    /// Read the sidecar of the index at `index`.
    pub fn read(index: &Path) -> std::io::Result<Self> {
        let text = std::fs::read_to_string(Self::path_for(index))?;
        Ok(serde_json::from_str(&text)?)
    }
}
