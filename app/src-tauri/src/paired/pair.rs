// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "Pair with a computer at home" (ADR 0117, "The Verso app paired"): the
//! address and the eight letters the computer's *Pair a phone* dialog
//! shows, typed here; the computer's key learnt by the code's proofs
//! (`verso_server::local::pin`), never by trusting the network; then the
//! computer is one of the servers of Settings › Servers, whose folders are
//! picked as any server's — a copy here, synced while home, open offline.
//!
//! Why typed, not scanned: the QR the dialog shows opens the phone's
//! browser (its pairing, which keeps no copy); an app of this project reads
//! no camera, and a scanner would be a new dependency of each phone's
//! system. The code's proofs make the eight letters as strong against a
//! person in the middle as the QR's whole fingerprint would be: they get
//! one try, in two minutes, at 20⁸ codes.

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use verso_contract::{ContractError, ServerAccount};
use verso_core::servers::{self, Paired, ServerLogin};
use verso_server::local::pairing::read_code;
use verso_server::local::pin::{self, Side};
use verso_service::{failed, refused};

use super::{FirstSight, client_over, config, load};
use crate::App;
use tauri::Manager;

/// How long the app waits for the person at the computer: the window's two
/// minutes and a little more.
const WAIT_FOR_ANSWER: Duration = Duration::from_secs(150);

/// The address as the person typed it — `192.168.1.20:51234`, with or
/// without `https://`, the dialog's whole link — as `https://host:port`.
pub(crate) fn address_of(typed: &str) -> Result<(String, String, u16), ContractError> {
    let typed = typed.trim();
    let with_scheme = if typed.contains("://") {
        typed.to_owned()
    } else {
        format!("https://{typed}")
    };
    let url = reqwest::Url::parse(&with_scheme).map_err(|_| {
        refused("type the address as the computer shows it, like 192.168.1.20:51234")
    })?;
    if url.scheme() != "https" {
        return Err(refused("the computer is reached over https"));
    }
    let host = url
        .host_str()
        .filter(|h| !h.is_empty())
        .ok_or_else(|| {
            refused("type the address as the computer shows it, like 192.168.1.20:51234")
        })?
        .to_owned();
    let port = url.port().ok_or_else(|| {
        refused("the address has its port after a colon, like 192.168.1.20:51234: type it as the computer shows it")
    })?;
    Ok((format!("https://{host}:{port}"), host, port))
}

/// The computer's refusal, said as the person can act on it.
fn said(status: u16, body: &Value, at: &str) -> ContractError {
    match status {
        404 => refused(
            "the computer is not pairing now: on it, open Settings › Turn into a server › Pair a phone, then type the code it shows",
        ),
        410 => refused(
            "the code was not right, was used, or its two minutes ran out: type the code the computer shows now (after three wrong tries, open Pair a phone again)",
        ),
        403 => refused(
            body["message"]
                .as_str()
                .unwrap_or("the computer refused to pair")
                .to_owned(),
        ),
        _ => crate::remote::error_of(status, body).with_context(at),
    }
}

trait Context {
    fn with_context(self, at: &str) -> ContractError;
}

impl Context for ContractError {
    fn with_context(mut self, at: &str) -> ContractError {
        self.message = format!("{at}: {}", self.message);
        self
    }
}

fn send(
    request: reqwest::blocking::RequestBuilder,
    base: &str,
) -> Result<(u16, Value), ContractError> {
    let response = request.send().map_err(|e| crate::reach::unsent(base, &e))?;
    let status = response.status().as_u16();
    Ok((status, response.json().unwrap_or(Value::Null)))
}

/// What a pairing that held gives: the sign-in and the pin to keep.
pub(crate) struct Made {
    pub(crate) login: ServerLogin,
    pub(crate) paired: Paired,
}

/// Pair with the computer at `typed` by `code`, asking it under `device`:
/// the whole exchange, blocking — up to the person's answer at the
/// computer. Nothing is kept here; [`keep`] keeps it.
pub(crate) fn pair(typed: &str, code: &str, device: &str) -> Result<Made, ContractError> {
    let (base, host, port) = address_of(typed)?;
    let code = read_code(code).ok_or_else(|| {
        refused("the code is eight letters, as the computer shows it, like BCDF-GHJK")
    })?;
    let sight = Arc::new(FirstSight::new());
    let client = client_over(config(sight.clone())?, Duration::from_secs(20))?;
    // A handshake first: the key the computer shows is the one every proof
    // below is made over.
    let (status, state) = send(client.get(format!("{base}/api/state")), &base)?;
    if status != 200 || state["local"] != true {
        return Err(refused(
            "no Verso computer answers at that address: check it on the computer's Pair a phone dialog",
        ));
    }
    let seen = sight
        .seen()
        .ok_or_else(|| failed("the computer's key was not seen"))?;
    let seen_pin = pin::of_key(&seen);
    let nonce = verso_server::crypto::token().map_err(failed)?;
    let key = pin::key(&code, &nonce).map_err(failed)?;
    let proof = pin::proof(&key, Side::Phone, &nonce, &seen_pin);
    let (status, asked) = send(
        client
            .post(format!("{base}/api/pair"))
            .header("origin", &base)
            .json(&json!({ "app": { "nonce": nonce, "proof": proof }, "device": device })),
        &base,
    )?;
    if status != 200 {
        return Err(said(status, &asked, &base));
    }
    let poll = asked["poll"]
        .as_str()
        .ok_or_else(|| failed("the computer answered no pairing to wait for"))?
        .to_owned();
    let every = Duration::from_secs(asked["interval"].as_u64().unwrap_or(2).clamp(1, 10));
    let started = Instant::now();
    let answer = loop {
        let (status, answer) = send(
            client
                .post(format!("{base}/api/pair/poll"))
                .header("origin", &base)
                .json(&json!({ "poll": poll })),
            &base,
        )?;
        if status == 410 || status == 404 {
            return Err(refused(
                "the computer said no, or its two minutes ran out: nothing was paired",
            ));
        }
        if status != 200 {
            return Err(said(status, &answer, &base));
        }
        if answer["state"] == "allowed" {
            break answer;
        }
        if started.elapsed() > WAIT_FOR_ANSWER {
            return Err(refused(
                "the computer did not answer in time: nothing was paired",
            ));
        }
        std::thread::sleep(every);
    };
    // The computer's proof over the key this app saw: only the computer
    // that knows the code, and shows that key, can make it.
    let back = answer["proof"].as_str().unwrap_or_default();
    if !pin::same(back, &pin::proof(&key, Side::Computer, &nonce, &seen_pin)) {
        crate::log::write(
            "WARN",
            "host",
            &format!(
                "a pairing with {base} was dropped: the computer's answer did not prove the code over the key this device saw"
            ),
        );
        return Err(refused(
            "the answer did not come from the computer that shows this code: another device on this network may be in between. Nothing was paired; try again on a network you trust",
        ));
    }
    let token = answer["token"]
        .as_str()
        .filter(|t| !t.is_empty())
        .ok_or_else(|| failed("the computer allowed and gave no session"))?
        .to_owned();
    let name = answer["name"].as_str().unwrap_or_default().to_owned();
    let url = format!("https://{}:{port}", pin::name(&seen_pin));
    let addresses = match host.trim_matches(['[', ']']).parse::<std::net::IpAddr>() {
        Ok(ip) => vec![ip.to_string()],
        Err(_) => crate::dns::system_ips(&host)
            .into_iter()
            .map(|ip| ip.to_string())
            .collect(),
    };
    Ok(Made {
        login: ServerLogin {
            url: url.clone(),
            token,
            email: String::new(),
            name,
        },
        paired: Paired {
            url,
            pin: seen_pin,
            addresses,
        },
    })
}

/// Keep what a pairing gave. Paired again with the same computer — the
/// same key, so the same name — its earlier session is ended there over
/// the pinned connection, the new one kept under the same address: the
/// copies bound to it stay bound. A port that changed moves them to the
/// new address.
pub(crate) fn keep(config: Option<&Path>, made: Made) -> Result<ServerAccount, ContractError> {
    let Made { login, paired } = made;
    let host = paired
        .url
        .rsplit_once(':')
        .map_or(paired.url.as_str(), |(h, _)| h);
    let earlier: Vec<ServerLogin> = servers::list(config)
        .map_err(verso_service::convert)?
        .into_iter()
        .filter(|s| s.url.rsplit_once(':').is_some_and(|(h, _)| h == host))
        .collect();
    servers::keep_paired(config, paired.clone()).map_err(verso_service::convert)?;
    load(config);
    for old in &earlier {
        // Ended over the pinned connection; a computer out of reach ends it
        // by its idle limit.
        if let Some(Ok(client)) = super::http_client(&old.url, Duration::from_secs(10)) {
            let _ = client
                .post(format!("{}/api/signout", old.url))
                .bearer_auth(&old.token)
                .header("origin", &old.url)
                .json(&json!({}))
                .send();
        }
        if old.url != login.url {
            moved(config, &old.url, &login.url);
            servers::forget(config, &old.url).map_err(verso_service::convert)?;
        }
    }
    servers::keep(config, login.clone()).map_err(verso_service::convert)?;
    // Where the computer is besides the address typed.
    super::refresh(config, &login.url, &login.token);
    crate::log::write(
        "INFO",
        "host",
        &format!("paired with a computer at home: {}", login.url),
    );
    Ok(ServerAccount {
        url: login.url,
        email: login.email,
        name: login.name,
        paired: true,
    })
}

/// The folders of this device that sync with `from`, bound to `to`: the
/// same computer at another port.
fn moved(config: Option<&Path>, from: &str, to: &str) {
    for path in verso_core::recent_folders(config) {
        let key = verso_core::folder_key(&path);
        if let Some(mut state) = verso_core::sync::load(config, &key)
            .ok()
            .flatten()
            .filter(|s| s.server == from)
        {
            state.server = to.to_owned();
            if verso_core::sync::save(config, &key, &state).is_ok() {
                crate::log::write(
                    "INFO",
                    "sync",
                    &format!("folder {key} follows its computer to {to}"),
                );
            }
        }
    }
}

/// Pair this device with the computer at home whose *Pair a phone* dialog
/// shows `address` and `code` (ADR 0117, "The Verso app paired"). Answers
/// once the person at the computer allowed it; the computer is then a
/// server of Settings › Servers, its folders picked as any server's.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_pair<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    address: String,
    code: String,
) -> Result<ServerAccount, ContractError> {
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    let device = crate::device::session_name(config.as_deref());
    let account = tauri::async_runtime::spawn_blocking(move || {
        let made = pair(&address, &code, &device)?;
        keep(config.as_deref(), made)
    })
    .await
    .map_err(|e| failed(e.to_string()))??;
    // A sync that waited for this computer (paired again) goes on now.
    crate::sync::signed_in(&app, &account.url);
    Ok(account)
}
