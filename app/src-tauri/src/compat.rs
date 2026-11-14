// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What this app takes of a server of another release (ADR 0073 item 2
//! and ADR 0079 item 5, revised 2026-11-02; the maintainer: *"não temos
//! controle disso quando lançado"* — after a release apps update
//! themselves and self-hosted servers do not). A window on a server's
//! folder takes a server whose contract version is this app's or one
//! apart ([`verso_contract::compat`]); a synced folder is judged only by
//! the sync's version. The hash of the generated bindings never refuses:
//! when it differs it is written to the log. A command the older side
//! does not know is answered "update the server".

use serde_json::Value;
use verso_contract::{ContractError, SyncVersions, compat};

use crate::log;
use verso_service::refused;

/// The generated bindings this app was built with: their hash names the
/// build of the contract, for the log (answer D of 2026-10-09).
const BINDINGS: &str = include_str!("../../ui/src/bindings.ts");

pub(crate) fn contract_version() -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(BINDINGS.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A number of the server's hello; one it does not say is 0, the version
/// before the first.
fn said_number(hello: &Value, field: &str) -> u32 {
    hello[field]
        .as_u64()
        .map_or(0, |v| u32::try_from(v).unwrap_or(u32::MAX))
}

/// The server's contract version, as its hello says it: a release before
/// 0.8.5 says none.
pub(crate) fn server_contract(hello: &Value) -> u32 {
    said_number(hello, "contractVersion")
}

/// What each side runs, as the server's hello says it and this app knows.
pub(crate) fn versions(hello: &Value) -> SyncVersions {
    let said = |field: &str| hello[field].as_str().unwrap_or("?").to_owned();
    SyncVersions {
        server_version: said("version"),
        server_build: said("commit"),
        server_contract: said("contract"),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        app_build: env!("VERSO_COMMIT").to_owned(),
        app_contract: contract_version(),
    }
}

/// The refusal of a server whose contract version this app does not take,
/// in English for the log: the version, build and contract version of
/// each side.
pub(crate) fn contract_refused(hello: &Value) -> Option<ContractError> {
    let theirs = server_contract(hello);
    if compat::takes(compat::VERSION, theirs) {
        return None;
    }
    let v = versions(hello);
    Some(refused(format!(
        "the server runs Verso {} (build {}, contract {theirs}), this app {} (build {}, contract {}): update the one that is behind",
        v.server_version,
        v.server_build,
        v.app_version,
        v.app_build,
        compat::VERSION
    )))
}

/// Why this app's sync and the server's do not follow each other, in
/// English for the log (ADR 0079 item 5): the server said this app's is
/// older than it takes, or the server's is older than the version before
/// this app's. A server that says no version speaks the one before the
/// first.
pub(crate) fn sync_refused(hello: &Value) -> Option<String> {
    use verso_core::sync::{PROTOCOL, follows};
    let theirs = said_number(hello, "sync");
    (hello.get("syncRefused").is_some() || !follows(PROTOCOL, theirs)).then(|| {
        format!(
            "the server speaks sync {theirs}, this app sync {PROTOCOL}: update the one that is behind"
        )
    })
}

/// A server whose build of the contract is not this app's, written to the
/// log once per connection: never a refusal.
pub(crate) fn note(url: &str, hello: &Value) {
    let theirs = hello["contract"].as_str().unwrap_or("?");
    let ours = contract_version();
    if theirs == ours {
        return;
    }
    log::write(
        "INFO",
        "host",
        &format!(
            "the server at {url} runs Verso {} (contract {}, hash {theirs}), this app {} (contract {}, hash {ours})",
            hello["version"].as_str().unwrap_or("?"),
            server_contract(hello),
            env!("CARGO_PKG_VERSION"),
            compat::VERSION
        ),
    );
}

/// A server's error, with "no such command" said as what it is: a server
/// older than this app, which does not know the command yet (the
/// contract changes only by adding).
pub(crate) fn older_server(mut err: Value, server: &str) -> Value {
    if err["message"]
        .as_str()
        .is_some_and(|m| m.starts_with("no such command"))
    {
        err["message"] = Value::from(format!(
            "the server runs Verso {server}, which does not do this yet: update the server"
        ));
    }
    err
}
