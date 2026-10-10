// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The servers the desktop app signed in to (ADR 0073 item 2, ADR 0074
//! item 8; the maintainer's answer K of 2026-10-09): the address, the
//! device's token the server gave when the person approved it in the
//! browser, and whose account it is. Kept beside the indexes in the
//! configuration directory, never in a folder (ADR 0011), `0600`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{CoreError, config_dir, sidecar};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerLogin {
    /// The server's address, `https://…` with no path.
    pub url: String,
    pub token: String,
    pub email: String,
    pub name: String,
}

fn dir(config: Option<&Path>) -> Result<PathBuf, CoreError> {
    match config {
        Some(dir) => Ok(dir.to_path_buf()),
        None => config_dir(),
    }
}

/// Every server signed in to.
pub fn list(config: Option<&Path>) -> Result<Vec<ServerLogin>, CoreError> {
    Ok(sidecar::read_servers(&dir(config)?).servers)
}

/// The sign-in to `url`, if there is one.
pub fn find(config: Option<&Path>, url: &str) -> Result<Option<ServerLogin>, CoreError> {
    Ok(list(config)?.into_iter().find(|s| s.url == url))
}

/// Keep a sign-in, replacing an earlier one to the same address.
pub fn keep(config: Option<&Path>, login: ServerLogin) -> Result<(), CoreError> {
    let dir = dir(config)?;
    let mut servers = sidecar::read_servers(&dir);
    servers.servers.retain(|s| s.url != login.url);
    servers.servers.push(login);
    sidecar::write_servers(&dir, &servers).map_err(CoreError::Sidecar)
}

/// Forget the sign-in to `url` (the token is also revoked on the server,
/// by the caller, when it can reach it).
pub fn forget(config: Option<&Path>, url: &str) -> Result<(), CoreError> {
    let dir = dir(config)?;
    let mut servers = sidecar::read_servers(&dir);
    servers.servers.retain(|s| s.url != url);
    sidecar::write_servers(&dir, &servers).map_err(CoreError::Sidecar)
}
