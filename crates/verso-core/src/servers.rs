// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The servers the desktop app signed in to (ADR 0073 item 2, ADR 0074
//! item 8; the maintainer's answer K of 2026-10-09): the address, the
//! device's token the server gave when the person approved it in the
//! browser, and whose account it is; and this computer's name, when the
//! person set one (ADR 0079 item 8, ADR 0074 item 8, decided 2026-10-11).
//! Kept beside the indexes in the configuration directory, never in a
//! folder (ADR 0011), `0600`.

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

/// A computer at home this app is paired with (ADR 0117, "The Verso app
/// paired"): its sign-in is a [`ServerLogin`] at `url` — a name made of
/// the pin, which this app resolves itself — and its key's pin, the only
/// certificate this app accepts there; with the addresses it was last
/// found at, tried in turn.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Paired {
    pub url: String,
    /// SHA-256 of the computer's public key, hexadecimal.
    pub pin: String,
    /// IP addresses, the one that answered last first.
    #[serde(default)]
    pub addresses: Vec<String>,
}

/// The computers this app is paired with.
pub fn paired(config: Option<&Path>) -> Result<Vec<Paired>, CoreError> {
    Ok(sidecar::read_servers(&dir(config)?).paired)
}

/// Keep a computer's pin and addresses, replacing what was kept for its
/// address; its sign-in is kept by [`keep`].
pub fn keep_paired(config: Option<&Path>, paired: Paired) -> Result<(), CoreError> {
    let dir = dir(config)?;
    let mut servers = sidecar::read_servers(&dir);
    servers.paired.retain(|p| p.url != paired.url);
    servers.paired.push(paired);
    sidecar::write_servers(&dir, &servers).map_err(CoreError::Sidecar)
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
    // A paired computer's pin goes with its sign-in.
    servers.paired.retain(|p| p.url != url);
    sidecar::write_servers(&dir, &servers).map_err(CoreError::Sidecar)
}

/// The most characters a device's name keeps: the server keeps 80 of
/// "Verso · " and the name.
pub const DEVICE_NAME_MOST: usize = 60;

/// A device's name as it is kept: on one line, trimmed, at most
/// [`DEVICE_NAME_MOST`] characters; none when nothing is left.
#[must_use]
pub fn clean_device_name(name: &str) -> Option<String> {
    let one_line: String = name
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let kept: String = one_line.trim().chars().take(DEVICE_NAME_MOST).collect();
    let kept = kept.trim_end().to_owned();
    (!kept.is_empty()).then_some(kept)
}

/// The name the person gave this computer, if any.
pub fn device_name(config: Option<&Path>) -> Result<Option<String>, CoreError> {
    Ok(sidecar::read_servers(&dir(config)?).device)
}

/// Keep the name the person gave this computer; none (or a name with
/// nothing in it) goes back to the system's.
pub fn set_device_name(config: Option<&Path>, name: Option<&str>) -> Result<(), CoreError> {
    let dir = dir(config)?;
    let mut servers = sidecar::read_servers(&dir);
    servers.device = name.and_then(clean_device_name);
    sidecar::write_servers(&dir, &servers).map_err(CoreError::Sidecar)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_device_name_is_kept_beside_the_sign_ins_and_survives_them() {
        let config = tempfile::tempdir().unwrap();
        let at = Some(config.path());
        assert_eq!(device_name(at).unwrap(), None);
        set_device_name(at, Some("  Estúdio\n da Ana  ")).unwrap();
        assert_eq!(device_name(at).unwrap().as_deref(), Some("Estúdio  da Ana"));
        // A sign-in kept and forgotten leaves the name alone.
        let login = ServerLogin {
            url: "https://notas.casa".into(),
            token: "t".into(),
            email: "ana@casa.lan".into(),
            name: "Ana".into(),
        };
        keep(at, login).unwrap();
        forget(at, "https://notas.casa").unwrap();
        assert_eq!(device_name(at).unwrap().as_deref(), Some("Estúdio  da Ana"));
        // Nothing in it: the system's again.
        set_device_name(at, Some("   ")).unwrap();
        assert_eq!(device_name(at).unwrap(), None);
        assert_eq!(
            clean_device_name(&"x".repeat(100)).map(|n| n.chars().count()),
            Some(DEVICE_NAME_MOST)
        );
    }

    /// A paired computer's pin is kept beside its sign-in, replaced for the
    /// same address, and forgotten with it.
    #[test]
    fn a_paired_computers_pin_is_kept_and_goes_with_its_sign_in() {
        let config = tempfile::tempdir().unwrap();
        let at = Some(config.path());
        let url = "https://verso-0123456789abcdef0123.home.arpa:51234";
        let p = |pin: &str| Paired {
            url: url.into(),
            pin: pin.into(),
            addresses: vec!["192.168.1.20".into()],
        };
        keep_paired(at, p("aa")).unwrap();
        keep_paired(at, p("bb")).unwrap();
        assert_eq!(paired(at).unwrap(), vec![p("bb")]);
        forget(at, url).unwrap();
        assert!(paired(at).unwrap().is_empty());
    }
}
