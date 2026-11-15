// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The wait for the person to approve this device on the server's page
//! (`server_sign_in`, ADR 0083 As built), split from `remote.rs` (ADR
//! 0067): the app asks the server every few seconds within the code's ten
//! minutes, keeps the token when it comes and says so
//! (`server-signed-in`); every other end is said too
//! (`server-sign-in-failed`, review I1, 2026-11-15) — refused on the page,
//! the minutes run out, an answer that does not read, a sign-in that could
//! not be kept — so the window never waits for nothing.

use verso_contract::ServerSignInFailed;

use super::*;

#[cfg(test)]
mod tests;

/// The code's life, as the server gives it (`expires`), when it says none.
const LIFE: u64 = 600;

/// What a sign-in's server answered at its start, for the wait.
pub(super) struct Started {
    pub(super) url: String,
    pub(super) code: String,
    pub(super) poll: String,
    pub(super) interval: u64,
    pub(super) life: u64,
}

impl Started {
    pub(super) fn of(url: &str, started: &Value) -> Self {
        Self {
            url: url.to_owned(),
            code: started["code"].as_str().unwrap_or_default().to_owned(),
            poll: started["poll"].as_str().unwrap_or_default().to_owned(),
            interval: started["interval"].as_u64().unwrap_or(2).max(1),
            life: started["expires"].as_u64().unwrap_or(LIFE).max(1),
        }
    }
}

/// Ask until the person approves this device or the sign-in ends: the
/// device's sign-in, or why not (`refused`, `expired`, `failed`).
async fn approved(s: &Started) -> Result<ServerLogin, &'static str> {
    let began = std::time::Instant::now();
    for _ in 0..(s.life / s.interval) {
        tokio::time::sleep(std::time::Duration::from_secs(s.interval)).await;
        let (c, p, u) = (s.code.clone(), s.poll.clone(), s.url.clone());
        let r = tauri::async_runtime::spawn_blocking(move || -> Result<Value, ContractError> {
            answer(
                http()?
                    .post(format!("{u}/api/device/poll"))
                    .json(&json!({ "code": c, "poll": p }))
                    .send_retrying()
                    .map_err(|e| reach::unsent(&u, &e))?,
            )
        })
        .await;
        let body = match r {
            Ok(Ok(body)) => body,
            // Out of reach for a moment — the iOS app suspended while the
            // person signs in in Safari (ADR 0119 Phase 0), a network that
            // dropped: asked again at the next turn, within the ten minutes.
            Ok(Err(e)) if e.kind == ErrorKind::Unreachable => continue,
            // The code is gone (`link_gone`): expired ("this code
            // expired"), or, within its minutes, refused on the page — the
            // server forgets a refused code, and says of it what it says of
            // a used one ("this code is used or expired").
            Ok(Err(e)) if e.kind == ErrorKind::NotFound => {
                let late =
                    began.elapsed().as_secs() >= s.life || e.message.ends_with("code expired");
                log::write(
                    "INFO",
                    "host",
                    &format!("the sign-in to {}: {}", s.url, e.message),
                );
                return Err(if late { "expired" } else { "refused" });
            }
            Ok(Err(e)) => {
                log::write(
                    "WARN",
                    "host",
                    &format!("the sign-in to {}: {}", s.url, e.message),
                );
                return Err("failed");
            }
            Err(e) => {
                log::write("ERROR", "host", &format!("the sign-in to {}: {e}", s.url));
                return Err("failed");
            }
        };
        if body["pending"] == true {
            continue;
        }
        let (Some(token), Some(account)) = (body["token"].as_str(), body.get("account")) else {
            log::write(
                "WARN",
                "host",
                &format!("the sign-in to {}: an answer with no token", s.url),
            );
            return Err("failed");
        };
        return Ok(ServerLogin {
            url: s.url.clone(),
            token: token.to_owned(),
            email: account["email"].as_str().unwrap_or_default().to_owned(),
            name: account["name"].as_str().unwrap_or_default().to_owned(),
        });
    }
    Err("expired")
}

/// Wait for the approval, keep the sign-in, and tell the windows how it
/// ended; the folders that sync with the server try again at once.
pub(super) async fn follow<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    config: Option<PathBuf>,
    started: Started,
) {
    let why = match approved(&started).await {
        Ok(login) => {
            let shown = ServerAccount {
                url: login.url.clone(),
                email: login.email.clone(),
                name: login.name.clone(),
                paired: false,
            };
            match servers::keep(config.as_deref(), login) {
                Ok(()) => {
                    log::write("INFO", "host", &format!("signed in to {}", shown.url));
                    crate::sync::signed_in(&app, &shown.url);
                    let _ = app.emit("server-signed-in", shown);
                    return;
                }
                Err(e) => {
                    log::write(
                        "ERROR",
                        "host",
                        &format!("keeping the server's sign-in: {e}"),
                    );
                    "failed"
                }
            }
        }
        Err(why) => why,
    };
    log::write(
        "INFO",
        "host",
        &format!("the sign-in to {} ended: {why}", started.url),
    );
    let _ = app.emit(
        "server-sign-in-failed",
        ServerSignInFailed {
            url: started.url,
            why: why.to_owned(),
        },
    );
}
