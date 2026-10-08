// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! End to end: a folder is built with `tempfile` (the `std::fs` guardrail
//! holds for this crate's tests too), edited through `verso-fs`, and
//! indexed and queried through the workspace.

use std::ffi::OsStr;
use std::io::Write;
use std::path::Path;

use tempfile::{Builder, TempDir};
use verso_core::{CoreError, PropertyValue, Sidecar, SkipReason, Workspace};

#[cfg(test)]
mod support;
use support::*;

#[cfg(test)]
mod shell;

mod agents;
mod indexing;
mod order;
mod rename;
