// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder synced with a cloud the person already has (ADR 0104): the
//! window's commands to check a WebDAV folder or an S3 prefix, connect the
//! folder to it and disconnect, and the link a sync pass runs over. The
//! adapters are `verso-cloud`'s; the secrets are the system's keychain's
//! (`secrets`); the plan, the state and the pass are the sync's of ADR 0079
//! (`sync`), which does not know which remote it syncs with.

use std::sync::Arc;

use verso_cloud::{Deletions, Report};
use verso_contract::{CloudCheck, CloudSettings, CloudStatus, SyncStatus};
use verso_core::sync as engine;
use verso_core::sync::remote::{RemoteError, RemoteErrorKind};

use super::secrets::{LONGEST, SecretError, Secrets};
use super::sync::{Ctx, Link, Syncer};
use super::*;

/// The keychain account of a folder's cloud.
pub(crate) fn account(key: &str) -> String {
    format!("cloud:{key}")
}

/// A cloud as the state keeps it, from what the person typed.
fn cloud_of(s: &CloudSettings) -> engine::Cloud {
    engine::Cloud {
        provider: s.provider.clone(),
        endpoint: s.endpoint.trim().to_owned(),
        bucket: s.bucket.trim().to_owned(),
        prefix: s.prefix.trim().trim_matches('/').to_owned(),
        region: s.region.trim().to_owned(),
        user: s.user.trim().to_owned(),
        path_style: s.path_style,
        plain_http: s.plain_http,
        ..engine::Cloud::default()
    }
}

/// Where a cloud is, in a few words: the server and folder, or the bucket
/// and prefix.
pub(crate) fn label(c: &engine::Cloud) -> String {
    match c.provider.as_str() {
        "s3" => {
            if c.prefix.is_empty() {
                format!("s3://{}", c.bucket)
            } else {
                format!("s3://{}/{}", c.bucket, c.prefix)
            }
        }
        _ => c
            .endpoint
            .split_once("://")
            .map_or(c.endpoint.as_str(), |(_, rest)| rest)
            .trim_end_matches('/')
            .to_owned(),
    }
}

/// The cloud a folder's state syncs with, as its window shows it.
pub(crate) fn status_of(c: &engine::Cloud) -> CloudStatus {
    CloudStatus {
        provider: c.provider.clone(),
        label: label(c),
        deletions: if c.deletions.is_empty() {
            "unknown".to_owned()
        } else {
            c.deletions.clone()
        },
        notes: c.notes.clone(),
    }
}

/// What is wrong with the form, said in English; `None` when it can be
/// checked against the service.
fn invalid(s: &CloudSettings, secret: &str) -> Option<&'static str> {
    let empty = |t: &str| t.trim().is_empty();
    match s.provider.as_str() {
        "webdav" if empty(&s.endpoint) => Some("name the folder's address"),
        "s3" if empty(&s.bucket) => Some("name the bucket"),
        "webdav" | "s3" if empty(&s.user) => Some("name the user (for S3, the access key id)"),
        "webdav" | "s3" if secret.is_empty() => Some("type the password (for S3, the secret key)"),
        "webdav" | "s3" => None,
        _ => Some("choose WebDAV or S3"),
    }
}

fn refuse(problem: &str, message: impl Into<String>) -> CloudCheck {
    let message = message.into();
    log::write(
        "WARN",
        "sync",
        &format!("cloud not accepted ({problem}): {message}"),
    );
    CloudCheck {
        accepted: false,
        problem: Some(problem.to_owned()),
        message: Some(message),
        deletions: "unknown".to_owned(),
        ..CloudCheck::default()
    }
}

/// A probe's failure as the answer to the form.
fn refusal(e: &RemoteError) -> CloudCheck {
    let problem = match (&e.kind, e.detail.as_deref()) {
        (_, Some(d @ ("plain_http_unconfirmed" | "plain_http_refused"))) => d,
        (RemoteErrorKind::Refused, _) if e.message.starts_with("cloud sign-in refused") => "auth",
        (RemoteErrorKind::Refused, _) => "service_refused",
        (RemoteErrorKind::Unreachable | RemoteErrorKind::RateLimited(_), _) => "unreachable",
        _ => "failed",
    };
    refuse(problem, e.message.clone())
}

/// The check of ADR 0104 items 7 and 16, run where blocking is allowed:
/// the form valid, the keychain there, the service asked (a write against
/// a version that is not there must be refused, and the ETags strong). On
/// acceptance the secret is kept in the keychain under the folder's
/// account — it is not asked for again — and the cloud with what the check
/// found is returned for the start to use.
pub(crate) fn check(
    secrets: &dyn Secrets,
    key: &str,
    settings: &CloudSettings,
    secret: &str,
) -> (CloudCheck, Option<engine::Cloud>) {
    if let Some(why) = invalid(settings, secret) {
        return (refuse("invalid", why), None);
    }
    if secret.len() > LONGEST {
        return (refuse("invalid", SecretError::TooLong.message()), None);
    }
    if let Err(e) = secrets.available() {
        return (refuse("no_keyring", e.message()), None);
    }
    let mut cloud = cloud_of(settings);
    let report: Report = match verso_cloud::probe(&cloud, secret) {
        Ok(report) => report,
        Err(e) => return (refusal(&e), None),
    };
    if let Err(e) = secrets.set(&account(key), secret) {
        let problem = if matches!(e, SecretError::NoKeyring(_)) {
            "no_keyring"
        } else {
            "failed"
        };
        return (refuse(problem, e.message()), None);
    }
    let (deletions, mut notes) = match &report.deletions {
        Deletions::Final => ("final", Vec::new()),
        Deletions::Kept(note) => ("kept", vec![note.clone()]),
        Deletions::Unknown => ("unknown", Vec::new()),
    };
    notes.extend(report.notes.iter().cloned());
    cloud.caps.clone_from(&report.caps);
    cloud.deletions = deletions.to_owned();
    cloud.notes.clone_from(&notes);
    let answer = CloudCheck {
        accepted: true,
        problem: None,
        message: None,
        label: label(&cloud),
        deletions: deletions.to_owned(),
        notes,
        free: report.free.map(|f| f as f64),
        remote_files: report.files as f64,
        remote_bytes: report.bytes as f64,
    };
    (answer, Some(cloud))
}

/// The link a pass runs over for a folder synced with a cloud: the remote
/// opened with the secret from the keychain. Nothing is asked of the
/// service yet; the pass lists it.
pub(crate) async fn link(ctx: &Ctx, s: &Syncer) -> Result<Link, ContractError> {
    let cloud = s
        .cloud
        .clone()
        .ok_or_else(|| refused("this folder does not sync with a cloud"))?;
    let secret = match ctx.secrets.get(&account(&s.key)) {
        Ok(Some(secret)) => secret,
        Ok(None) => {
            return Err(refused(
                "cloud sign-in refused: the password is not in this computer's keychain: connect the cloud again in Settings › Sync",
            ));
        }
        Err(e) => return Err(refused(e.message())),
    };
    // The blocking client is made, and later dropped, off the runtime.
    let remote = tauri::async_runtime::spawn_blocking(move || verso_cloud::open(&cloud, &secret))
        .await
        .map_err(|e| verso_service::failed(e.to_string()))?
        .map_err(super::sync::contract_of)?;
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
    Ok(Link {
        remote: Arc::from(remote),
        #[cfg(test)]
        socket: None,
        heard: rx,
        _quiet: Some(tx),
        role: "owner".to_owned(),
        name: s.cloud.as_ref().map(label).unwrap_or_default(),
        known: None,
        walk: true,
        share: false,
    })
}

/// The cloud a folder's window syncs with, once checked and not started.
pub(crate) type Pending = Mutex<std::collections::HashMap<String, engine::Cloud>>;

/// Check a cloud for the window's folder. Nothing is saved unless it is
/// accepted; then the secret is kept in the system's keychain and the
/// check's findings wait for [`folder_sync_cloud_start`].
#[tauri::command]
#[specta::specta]
pub(crate) async fn folder_sync_cloud_check<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    settings: CloudSettings,
    secret: String,
) -> Result<CloudCheck, ContractError> {
    let key = sync_commands::key_of(&app, &window)?;
    if sync_commands::running(&app, &key).is_some() {
        return Err(refused("this folder syncs already: turn it off first"));
    }
    let secrets = Arc::clone(&app.state::<App>().secrets);
    let kept = key.clone();
    let (answer, cloud) =
        tauri::async_runtime::spawn_blocking(move || check(&*secrets, &kept, &settings, &secret))
            .await
            .map_err(|e| failed(e.to_string()))?;
    let pending = &app.state::<App>().pending_clouds;
    match cloud {
        Some(cloud) => {
            lock(pending).insert(key, cloud);
        }
        None => {
            lock(pending).remove(&key);
        }
    }
    Ok(answer)
}

/// Sync the window's folder with the cloud just checked (ADR 0104 item
/// 16): the first sync deletes nothing (ADR 0079 item 11).
#[tauri::command]
#[specta::specta]
pub(crate) fn folder_sync_cloud_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<SyncStatus, ContractError> {
    let key = sync_commands::key_of(&app, &window)?;
    if sync_commands::running(&app, &key).is_some() {
        return Err(refused("this folder syncs already: turn it off first"));
    }
    let cloud = lock(&app.state::<App>().pending_clouds)
        .remove(&key)
        .ok_or_else(|| refused("check the cloud first"))?;
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    let state = engine::State {
        server: label(&cloud),
        folder: label(&cloud),
        cloud: Some(cloud),
        ..engine::State::default()
    };
    engine::save(config.as_deref(), &key, &state).map_err(verso_service::convert)?;
    log::write(
        "INFO",
        "sync",
        &format!("turned on: folder {key} with the cloud {}", state.server),
    );
    Ok(sync_commands::start(&app, &key, &state).status())
}

/// The window's folder will not sync with the cloud it just checked: its
/// secret leaves the keychain.
#[tauri::command]
#[specta::specta]
pub(crate) fn folder_sync_cloud_cancel<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    let key = sync_commands::key_of(&app, &window)?;
    let was = lock(&app.state::<App>().pending_clouds).remove(&key);
    if was.is_some() {
        let _ = app.state::<App>().secrets.delete(&account(&key));
    }
    Ok(())
}

/// What turning a cloud folder's sync off forgets: the secret in the
/// keychain, and the cloud in the state (ADR 0104 item 14: disconnecting
/// deletes the secrets). A later connection is a first sync again, which
/// deletes nothing.
pub(crate) fn forget(secrets: &dyn Secrets, config: Option<&Path>, key: &str) {
    if let Err(e) = secrets.delete(&account(key)) {
        log::write(
            "WARN",
            "sync",
            &format!(
                "deleting the cloud's secret from the keychain: {}",
                e.message()
            ),
        );
    }
    let off = engine::State {
        off: true,
        ..engine::State::default()
    };
    if let Err(e) = engine::save(config, key, &off) {
        log::write("ERROR", "sync", &format!("forgetting the cloud: {e}"));
    }
}
