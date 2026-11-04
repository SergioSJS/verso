// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "My own address" (ADR 0117 D10 (a)): a named Cloudflare Tunnel on the
//! person's account and domain. The app runs `cloudflared`'s own steps —
//! log in, create, route the hostname, run, delete — with the same pinned
//! binary; by hand the person only owns a domain, adds it to Cloudflare,
//! clicks through the login and types the hostname.
//!
//! Files: `cloudflared tunnel login` writes `~/.cloudflared/cert.pem` (it
//! has no flag to write elsewhere, D10 item 2); the app hands that path back
//! with `--origincert` and never copies it. The tunnel's credentials are
//! written in the app's own data directory, `<dir>/<uuid>.json`, `0600`
//! (item 3). Nothing else is read or written ([`paths_of`]'s test).
//!
//! The words parsed are `cloudflared`'s, as its source writes them
//! (`cmd/cloudflared/tunnel/{login,subcommands}.go`, read for D10); the
//! spike of an own address has not run yet (`RESULTS.md`, "What remains
//! untested" 1), so the success of each step is first its exit status.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use super::files;
use super::run::{self, Step};

/// `~/.cloudflared/cert.pem`, where `cloudflared tunnel login` leaves the
/// person's Cloudflare credential.
#[must_use]
pub fn cert_path(home: &Path) -> PathBuf {
    home.join(".cloudflared").join("cert.pem")
}

/// The person's home (`HOME`, or `USERPROFILE` on Windows), as
/// `cloudflared` finds it.
#[must_use]
pub fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|h| !h.is_empty())
        .map(PathBuf::from)
}

/// A tunnel's credentials in the app's data directory: `<dir>/<uuid>.json`.
#[must_use]
pub fn credentials_path(dir: &Path, uuid: &str) -> PathBuf {
    dir.join(format!("{uuid}.json"))
}

/// Where `create` is told to write before the uuid is known.
#[must_use]
pub fn staging_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!(".new-{name}.json"))
}

/// A hostname the person may give: lower-case DNS labels, at least two,
/// each 1 to 63 of `a-z0-9-` not starting or ending with `-`.
#[must_use]
pub fn valid_hostname(host: &str) -> bool {
    let labels: Vec<&str> = host.split('.').collect();
    host.len() <= 253
        && labels.len() >= 2
        && labels.iter().all(|l| {
            (1..=63).contains(&l.len())
                && !l.starts_with('-')
                && !l.ends_with('-')
                && l.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}

/// A tunnel's name: 1 to 64 of `A-Za-z0-9-_`.
#[must_use]
pub fn valid_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// A tunnel's id as Cloudflare writes it (8-4-4-4-12 lower-case hex).
#[must_use]
pub fn valid_uuid(id: &str) -> bool {
    let parts: Vec<&str> = id.split('-').collect();
    parts.len() == 5
        && parts.iter().zip([8, 4, 4, 4, 12]).all(|(p, n)| {
            p.len() == n
                && p.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
}

fn os(s: impl Into<OsString>) -> OsString {
    s.into()
}

/// `cloudflared tunnel login`: it opens the browser itself and waits.
#[must_use]
pub fn login_args() -> Vec<OsString> {
    vec![os("tunnel"), os("login")]
}

/// `cloudflared tunnel --origincert <cert> create --credentials-file <file> <name>`.
#[must_use]
pub fn create_args(cert: &Path, credentials: &Path, name: &str) -> Vec<OsString> {
    vec![
        os("tunnel"),
        os("--origincert"),
        os(cert),
        os("create"),
        os("--credentials-file"),
        os(credentials),
        os(name),
    ]
}

/// `cloudflared tunnel --origincert <cert> route dns <uuid> <hostname>`: a
/// CNAME from the hostname to `<uuid>.cfargotunnel.com`.
#[must_use]
pub fn route_dns_args(cert: &Path, uuid: &str, hostname: &str) -> Vec<OsString> {
    vec![
        os("tunnel"),
        os("--origincert"),
        os(cert),
        os("route"),
        os("dns"),
        os(uuid),
        os(hostname),
    ]
}

/// `cloudflared tunnel --no-autoupdate [--protocol http2] run --url
/// http://127.0.0.1:<port> --credentials-file <file> <uuid>`: the same
/// loopback listener as the quick link. `--no-autoupdate` and `--protocol`
/// are `tunnel`'s own flags, written before `run` as Cloudflare's own
/// install line does (`cloudflared tunnel --no-autoupdate run --token …`).
#[must_use]
pub fn run_args(port: u16, credentials: &Path, uuid: &str, http2: bool) -> Vec<OsString> {
    let mut args = vec![os("tunnel"), os("--no-autoupdate")];
    if http2 {
        args.push(os("--protocol"));
        args.push(os("http2"));
    }
    args.extend([
        os("run"),
        os("--url"),
        os(format!("http://127.0.0.1:{port}")),
        os("--credentials-file"),
        os(credentials),
        os(uuid),
    ]);
    args
}

/// `cloudflared tunnel --origincert <cert> delete <uuid>`.
#[must_use]
pub fn delete_args(cert: &Path, uuid: &str) -> Vec<OsString> {
    vec![
        os("tunnel"),
        os("--origincert"),
        os(cert),
        os("delete"),
        os(uuid),
    ]
}

/// How the login ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Login {
    /// `cert.pem` was written.
    Done,
    /// One was there already; `cloudflared` does not overwrite it, and the
    /// app uses it.
    AlreadyThere,
    /// Words to show (redacted).
    Failed(String),
}

/// Read what `tunnel login` said.
#[must_use]
pub fn parse_login(step: &Step) -> Login {
    if step.text.contains("You have an existing certificate at") {
        return Login::AlreadyThere;
    }
    if step.ok && step.text.contains("You have successfully logged in") {
        return Login::Done;
    }
    Login::Failed(tail(&step.text))
}

/// The address `tunnel login` asks the person to open, for the window to
/// show if the browser did not open by itself. It carries a one-time
/// callback: shown to the person, never logged.
#[must_use]
pub fn login_url(text: &str) -> Option<String> {
    text.split_whitespace()
        .find(|w| w.starts_with("https://dash.cloudflare.com/argotunnel"))
        .map(str::to_owned)
}

/// The id of the tunnel `create` made ("Created tunnel <name> with id <uuid>").
pub fn parse_create(step: &Step) -> Result<String, String> {
    if step.ok {
        for line in step.text.lines() {
            if let Some((_, id)) = line
                .split_once("Created tunnel ")
                .and_then(|(_, r)| r.split_once(" with id "))
            {
                let id = id.trim();
                if valid_uuid(id) {
                    return Ok(id.to_owned());
                }
            }
        }
    }
    if step.text.contains("tunnel with name already exists") {
        return Err("a tunnel of that name already exists on this Cloudflare account".to_owned());
    }
    Err(format!("the tunnel was not made: {}", tail(&step.text)))
}

/// How `route dns` ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// "Added CNAME <host> which will route to this tunnel".
    Added,
    /// "<host> is already configured to route to your tunnel".
    AlreadyOurs,
    /// Another record holds the hostname: the person chooses another or
    /// removes it at Cloudflare (the app removes nothing it did not make).
    Taken,
    Failed(String),
}

#[must_use]
pub fn parse_route(step: &Step) -> Route {
    if step
        .text
        .contains("is already configured to route to your tunnel")
    {
        return Route::AlreadyOurs;
    }
    if step.ok && step.text.contains("Added CNAME") {
        return Route::Added;
    }
    if step.text.contains("record with that host already exists") {
        return Route::Taken;
    }
    Route::Failed(tail(&step.text))
}

/// `delete` succeeded, or why not.
pub fn parse_delete(step: &Step) -> Result<(), String> {
    if step.ok {
        Ok(())
    } else {
        Err(format!("the tunnel was not deleted: {}", tail(&step.text)))
    }
}

/// The last words of an output, every address taken out, for a failure's
/// message.
fn tail(text: &str) -> String {
    let last = text
        .lines()
        .map(str::trim)
        .rfind(|l| !l.is_empty())
        .unwrap_or("no words from cloudflared");
    run::redact(last)
}

/// How long the login waits for the person in the browser.
pub const LOGIN_WAIT: Duration = Duration::from_secs(10 * 60);
/// How long the other steps may take.
pub const STEP_WAIT: Duration = Duration::from_secs(60);

/// Log in: the browser opens on Cloudflare's page; `cert.pem` lands in
/// `~/.cloudflared`.
pub fn login(program: &Path) -> Result<Login, String> {
    Ok(parse_login(&run::run_step(
        program,
        &login_args(),
        LOGIN_WAIT,
    )?))
}

/// Make the tunnel `name`; its credentials end at `<dir>/<uuid>.json`
/// (`0600`). Says the uuid.
pub fn create(program: &Path, home: &Path, dir: &Path, name: &str) -> Result<String, String> {
    if !valid_name(name) {
        return Err("a tunnel's name is letters, digits, - and _".to_owned());
    }
    files::make_dir(dir)?;
    let staging = staging_path(dir, name);
    files::remove(&staging);
    let made = run::run_step(
        program,
        &create_args(&cert_path(home), &staging, name),
        STEP_WAIT,
    )
    .and_then(|step| parse_create(&step))
    .and_then(|uuid| {
        files::settle_credentials(&staging, &credentials_path(dir, &uuid))?;
        Ok(uuid)
    });
    files::remove(&staging);
    made
}

/// Point `hostname` at the tunnel `uuid`.
pub fn route_dns(program: &Path, home: &Path, uuid: &str, hostname: &str) -> Result<Route, String> {
    if !valid_uuid(uuid) || !valid_hostname(hostname) {
        return Err("not a tunnel's id and a hostname".to_owned());
    }
    let step = run::run_step(
        program,
        &route_dns_args(&cert_path(home), uuid, hostname),
        STEP_WAIT,
    )?;
    Ok(parse_route(&step))
}

/// Delete the tunnel `uuid` and forget its credentials. Its DNS record is
/// Cloudflare's to keep or not (`[OPEN]`, the D10 spike: does the CNAME
/// stay?).
pub fn delete(program: &Path, home: &Path, dir: &Path, uuid: &str) -> Result<(), String> {
    if !valid_uuid(uuid) {
        return Err("not a tunnel's id".to_owned());
    }
    let step = run::run_step(program, &delete_args(&cert_path(home), uuid), STEP_WAIT)?;
    parse_delete(&step)?;
    files::remove(&credentials_path(dir, uuid));
    Ok(())
}

/// Every path a command line names (the arguments that are absolute
/// paths), for the test that the app reads and writes nothing but
/// `cert.pem` and its own directory.
#[must_use]
pub fn paths_of(args: &[OsString]) -> Vec<PathBuf> {
    args.iter()
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .collect()
}
