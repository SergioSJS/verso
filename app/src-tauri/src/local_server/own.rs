// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! *Use my own address* (ADR 0117 D10 (a), S6b): the person's domain at
//! Cloudflare, a named tunnel made by this computer's `cloudflared`. By
//! hand the person owns the domain, adds it to Cloudflare, clicks through
//! the login and types the hostname; the app does the rest
//! (`crate::tunnel::named`). The hostname and the tunnel's id are kept in
//! the mode's settings (`LocalSettings::own_address`); the tunnel's
//! credentials in the app's data directory; the Cloudflare login where
//! `cloudflared` keeps it. The log holds no hostname and no login page.

use verso_contract::LocalOwnLogin;
use verso_server::local::{LocalSettings, OwnAddress};

use super::platform::{blocking, server, status_of};
use super::*;
use crate::tunnel::named::Login;

/// What the person typed, as a hostname: no scheme, no path, no final dot,
/// lower case.
pub(crate) fn hostname_of(typed: &str) -> String {
    let t = typed.trim();
    let t = t
        .strip_prefix("https://")
        .or_else(|| t.strip_prefix("http://"))
        .unwrap_or(t);
    t.split('/')
        .next()
        .unwrap_or_default()
        .trim_end_matches('.')
        .to_ascii_lowercase()
}

/// `cloudflared tunnel login`: the browser opens on Cloudflare's page and
/// the person picks the domain. Not through [`blocking`]: a failure's
/// words may carry that page's address with its one-time callback, which
/// is shown to the person and never logged.
pub(super) async fn login<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalOwnLogin, ContractError> {
    let done = tauri::async_runtime::spawn_blocking(move || crate::tunnel::own_login(&app))
        .await
        .map_err(|e| failed(e.to_string()))?;
    let said = match done {
        Ok((Login::Done, _)) => LocalOwnLogin {
            signed_in: true,
            already: false,
            url: None,
            why: None,
        },
        Ok((Login::AlreadyThere, _)) => LocalOwnLogin {
            signed_in: true,
            already: true,
            url: None,
            why: None,
        },
        Ok((Login::Failed(words), url)) => LocalOwnLogin {
            signed_in: false,
            already: false,
            url,
            why: Some(words),
        },
        Err(words) => LocalOwnLogin {
            signed_in: false,
            already: false,
            url: None,
            why: Some(crate::tunnel::run::redact(&words)),
        },
    };
    log::write(
        if said.signed_in { "INFO" } else { "WARN" },
        "host",
        if said.signed_in {
            "the own address: the Cloudflare login is in place"
        } else {
            "the own address: the Cloudflare login did not end"
        },
    );
    Ok(said)
}

/// Make the tunnel for `hostname` and route the hostname to it, then use
/// the own address for the link from now on. One own address at a time.
pub(super) async fn set_up<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    hostname: String,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let set = local.settings()?;
        if set.own_address.is_some() {
            return Err("remove the address set up before first".to_owned());
        }
        let hostname = hostname_of(&hostname);
        let tunnel = crate::tunnel::own_set_up(&app, &hostname)?;
        local.set_settings(&LocalSettings {
            own_address: Some(OwnAddress { hostname, tunnel }),
            link_own: true,
            ..set
        })?;
        log::write("INFO", "host", "the own address was set up");
        status_of(&app, &local)
    })
    .await
}

/// Forget the own address: its link stops, its tunnel is deleted at
/// Cloudflare with its credentials — or, with `here_only` (after a delete
/// that failed: no connection, the login gone), forgotten on this computer
/// alone, the tunnel left for Cloudflare's dashboard. Either way the
/// tunnel's credentials leave this computer: they could still run a
/// connector for the hostname.
pub(super) async fn remove<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    here_only: bool,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let set = local.settings()?;
        let Some(own) = set.own_address.clone() else {
            return status_of(&app, &local);
        };
        if crate::tunnel::link_view(&app).own {
            crate::tunnel::link_off(&app);
        }
        if !here_only {
            crate::tunnel::own_delete(&app, &own.tunnel)?;
        }
        crate::tunnel::own_forget(&app, &own.tunnel)?;
        local.set_settings(&LocalSettings {
            own_address: None,
            link_own: false,
            ..set
        })?;
        log::write(
            "INFO",
            "host",
            if here_only {
                "the own address was forgotten on this computer"
            } else {
                "the own address was removed"
            },
        );
        status_of(&app, &local)
    })
    .await
}
