// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! This computer's name (ADR 0079 item 8, ADR 0074 item 8; the
//! maintainer's *"Sim para todos"* of 2026-10-11): the one the person sets
//! in Settings › Servers, kept with the sign-ins in the configuration
//! directory (`servers.json`, never in a folder — ADR 0011), or the
//! system's. A conflict's copy carries it — made by sync or by the
//! editor's "keep both" — and a server keeps it with this device's
//! session, so that its list of sessions and its folders' change log say
//! which computer it was: taken from the system only, two computers with
//! one host name are one name.

use std::path::Path;

use serde_json::json;
use verso_contract::{DeviceName, DeviceRenamed};
use verso_core::servers;

use super::remote::answer;
use super::*;
use crate::dns::SendRetrying;

/// This computer's name as the system says it, asked once.
pub(crate) fn system() -> &'static str {
    static SYSTEM: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    SYSTEM.get_or_init(host_name)
}

/// This computer's name: the person's, when set, or the system's.
pub(crate) fn name(config: Option<&Path>) -> String {
    servers::device_name(config)
        .ok()
        .flatten()
        .unwrap_or_else(|| system().to_owned())
}

/// The name this device's session carries on a server: the same name a
/// conflict's copy carries, so that a person matches the two.
pub(crate) fn session_name(config: Option<&Path>) -> String {
    format!("Verso · {}", name(config))
}

fn described(config: Option<&Path>) -> DeviceName {
    let custom = servers::device_name(config).ok().flatten();
    DeviceName {
        name: custom.clone().unwrap_or_else(|| system().to_owned()),
        system: system().to_owned(),
        custom: custom.is_some(),
    }
}

/// This computer's name as the system knows it.
fn host_name() -> String {
    // A phone's name is the system's to say (`hostname` answers
    // `localhost` there): the one the person gave it, else its model.
    #[cfg(target_os = "android")]
    if let Some(name) = crate::phone::device_name() {
        return name;
    }
    #[cfg(target_os = "ios")]
    if let Some(name) = crate::ios::device_name() {
        return name;
    }
    for var in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(v) = std::env::var(var)
            && !v.trim().is_empty()
        {
            return v.trim().to_owned();
        }
    }
    #[cfg(target_os = "macos")]
    let asked = std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output();
    #[cfg(not(target_os = "macos"))]
    let asked = std::process::Command::new("hostname").output();
    asked
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| std::env::consts::OS.to_owned())
}

/// This computer's name, for Settings › Servers.
#[tauri::command]
#[specta::specta]
pub(crate) fn device_name(state: State<'_, App>) -> Result<DeviceName, ContractError> {
    Ok(described(state.service.config()))
}

/// Name this computer: kept here, and told to every server it is signed in
/// to, whose session of this device takes the new name at once. A server
/// that cannot be reached now — or one older than this — keeps the old
/// name until the next sign-in there, and is listed so. A name with
/// nothing in it, or the system's own, goes back to following the system.
#[tauri::command]
#[specta::specta]
pub(crate) async fn set_device_name<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
) -> Result<DeviceRenamed, ContractError> {
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    let wanted = servers::clean_device_name(&name).filter(|n| n != system());
    servers::set_device_name(config.as_deref(), wanted.as_deref())
        .map_err(verso_service::convert)?;
    let device = described(config.as_deref());
    // The versions this computer writes from now on carry its new name
    // (ADR 0091 item 4).
    {
        let service = &app.state::<App>().service;
        let days = service
            .history_days()
            .unwrap_or(verso_core::history::DEFAULT_DAYS);
        service.keep_local_history(&device.name, days);
    }
    let session = session_name(config.as_deref());
    let logins = servers::list(config.as_deref()).map_err(verso_service::convert)?;
    let unreached = tauri::async_runtime::spawn_blocking(move || {
        logins
            .into_iter()
            .filter_map(|login| {
                let told = crate::paired::http_to(&login.url).and_then(|c| {
                    answer(
                        c.put(format!("{}/api/me/device", login.url))
                            .bearer_auth(&login.token)
                            .json(&json!({ "device": session }))
                            .send_retrying()
                            .map_err(|e| reach::unsent(&login.url, &e))?,
                    )
                });
                match told {
                    Ok(_) => None,
                    Err(e) => {
                        log::write(
                            "WARN",
                            "host",
                            &format!("telling {} this device's name: {}", login.url, e.message),
                        );
                        Some(login.url)
                    }
                }
            })
            .collect()
    })
    .await
    .map_err(|e| failed(e.to_string()))?;
    log::write(
        "INFO",
        "host",
        &format!("this device is named {}", device.name),
    );
    Ok(DeviceRenamed { device, unreached })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_name_the_person_set_wins_over_the_systems() {
        let config = tempfile::tempdir().unwrap();
        let at = Some(config.path());
        assert_eq!(name(at), system());
        assert!(!described(at).custom);
        servers::set_device_name(at, Some("Estúdio")).unwrap();
        assert_eq!(name(at), "Estúdio");
        assert_eq!(session_name(at), "Verso · Estúdio");
        let d = described(at);
        assert_eq!((d.name.as_str(), d.custom), ("Estúdio", true));
        assert_eq!(d.system, system());
        servers::set_device_name(at, None).unwrap();
        assert_eq!(name(at), system());
    }
}
