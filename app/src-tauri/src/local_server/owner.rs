// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The owner's name for the players (`verso_server::local`'s `owner`):
//! the system's user at first — the full name the system keeps for the
//! account, else the account's name — and what the person types in the
//! section. `[OPEN]` for the maintainer: ADR 0117 does not say.

use super::platform::{blocking, server, status_of};
use super::*;

/// The section's field: the name the players see from now on.
pub(super) async fn set<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        local.set_owner_name(&name)?;
        status_of(&app, &local)
    })
    .await
}

/// The person at this computer as the system names them: the account's
/// full name (macOS `id -F`, Linux the passwd entry's first comment
/// field), else the account's name; none when the system says nothing.
pub(crate) fn system_person() -> Option<String> {
    full_name()
        .or_else(account_name)
        .filter(|n| !n.trim().is_empty())
}

fn account_name() -> Option<String> {
    ["USER", "USERNAME", "LOGNAME"]
        .iter()
        .find_map(|v| std::env::var(v).ok().filter(|n| !n.trim().is_empty()))
}

#[cfg(target_os = "macos")]
fn full_name() -> Option<String> {
    let out = std::process::Command::new("/usr/bin/id")
        .arg("-F")
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_owned())
}

#[cfg(target_os = "linux")]
fn full_name() -> Option<String> {
    let user = account_name()?;
    let out = std::process::Command::new("getent")
        .args(["passwd", &user])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    gecos_name(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(windows)]
fn full_name() -> Option<String> {
    None
}

/// The full name in a passwd line: its fifth field up to the first comma.
#[cfg(any(target_os = "linux", test))]
fn gecos_name(line: &str) -> Option<String> {
    let name = line.trim().split(':').nth(4)?.split(',').next()?.trim();
    (!name.is_empty()).then(|| name.to_owned())
}

#[cfg(test)]
mod tests {
    use super::gecos_name;

    #[test]
    fn the_full_name_is_the_passwd_entrys_first_comment() {
        assert_eq!(
            gecos_name("sergio:x:1000:1000:Sérgio Sousa,,,:/home/sergio:/bin/bash\n").as_deref(),
            Some("Sérgio Sousa")
        );
        assert_eq!(gecos_name("svc:x:999:999::/var:/bin/false"), None);
        assert_eq!(gecos_name("broken"), None);
    }
}
