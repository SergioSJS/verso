// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the writes through a [`crate::Root`] changed, kept only while a
//! caller asks: the computer's history of a folder's files (ADR 0091 item
//! 8) records each file a write left, wherever in the core the write came
//! from. Paths relative to the root, `/` between their parts on every OS.
//! Nothing here touches the disk.

use std::path::{Component, Path};
use std::sync::Mutex;

/// One change a write made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Touched {
    /// A file written or made.
    Written(String),
    /// An entry moved: a file or a folder with what it holds.
    Moved(String, String),
    /// An entry gone to the bin.
    Gone(String),
}

/// The changes kept while a caller asks for them.
#[derive(Debug, Default)]
pub(crate) struct Journal {
    kept: Mutex<Option<Vec<Touched>>>,
}

/// `relative` as one string, `/` between its parts.
pub(crate) fn slashed(relative: &Path) -> String {
    relative
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

impl Journal {
    fn with<T>(&self, f: impl FnOnce(&mut Option<Vec<Touched>>) -> T) -> T {
        let mut kept = self
            .kept
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        f(&mut kept)
    }

    pub(crate) fn keep(&self, on: bool) {
        self.with(|k| *k = on.then(Vec::new));
    }

    pub(crate) fn push(&self, t: Touched) {
        self.with(|k| {
            if let Some(list) = k {
                list.push(t);
            }
        });
    }

    pub(crate) fn take(&self) -> Vec<Touched> {
        self.with(|k| k.as_mut().map(std::mem::take).unwrap_or_default())
    }
}
