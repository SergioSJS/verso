// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A computer at home this app is paired with (ADR 0117, "The Verso app
//! paired"; ADR 0096 item 5 (a): "a native Verso client pins the
//! fingerprint"). The computer speaks TLS with a certificate of its own,
//! which no system trusts: this app trusts **exactly its key** there and
//! nothing else — not the system's roots, not another certificate, not the
//! name or the dates of this one.
//!
//! - **The name.** A paired computer is reached at
//!   `https://verso-<pin>.home.arpa:<port>`, made of its key's pin
//!   (`verso_server::local::pin::name`). The URL never changes when the
//!   computer's address does, so the sync bound to it and the copy made of
//!   it stay bound. This app resolves the name itself (`dns.rs`), to the
//!   addresses the computer was found at, in turn; no DNS server is ever
//!   asked for it.
//! - **The pin.** Every HTTP request ([`http_client`]) and WebSocket
//!   ([`ws_connector`]) to such a name goes through [`Pinned`]: the
//!   certificate's key must hash to the pin, and the handshake's signature
//!   is checked with that very key (`verify_tls13_signature_with_raw_key`),
//!   so nothing read elsewhere in the certificate counts. TLS 1.3 only, no
//!   SNI (the name stays on this device).
//! - **A key that changed** — "Replace this computer's identity", or
//!   another device answering at the address — is refused, remembered, and
//!   said as [`CHANGED`] wherever "out of reach" would be said
//!   ([`changed`], `reach.rs`): the sync waits on it as on a refusal, not
//!   as a network to retry every few seconds.
//! - **Pairing** (`pair.rs`) is the only place a key is learnt: by the code's
//!   proofs, through [`FirstSight`].
//! - **Found again** (`find.rs`): when none of the addresses known answers,
//!   the computer is looked for on the network by its pin, and an address
//!   found is kept only once a handshake there showed the pinned key.

use std::collections::{BTreeMap, BTreeSet};
use std::net::IpAddr;
use std::path::Path;
use std::sync::{Arc, Mutex};

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{CryptoProvider, WebPkiSupportedAlgorithms};
use rustls::pki_types::{CertificateDer, ServerName, SubjectPublicKeyInfoDer, UnixTime};
use rustls::{CertificateError, DigitallySignedStruct, SignatureScheme};
use verso_contract::ContractError;
use verso_server::local::pin;
use verso_service::lock;

mod find;
pub(crate) mod pair;

pub(crate) use find::find_again;

#[cfg(test)]
mod tests;

/// How a key that is not the pinned one is said: the start of the message,
/// which the sync reads as its problem (`sync::problem_of`).
pub(crate) const CHANGED: &str = "this computer's identity changed";

/// A paired computer as this app holds it in memory: with the address it
/// is kept under and the configuration it is kept in, to keep an address
/// found for it (`find.rs`).
#[derive(Debug, Clone)]
struct Entry {
    pin: String,
    addresses: Vec<IpAddr>,
    url: String,
    config: Option<std::path::PathBuf>,
}

/// The paired computers, by name (lower case, no port).
static TABLE: Mutex<BTreeMap<String, Entry>> = Mutex::new(BTreeMap::new());

/// The names whose last handshake showed a key that is not their pin.
static CHANGED_AT: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

/// The host of `url`, lower case.
fn host_of(url: &str) -> Option<String> {
    reqwest::Url::parse(url)
        .ok()?
        .host_str()
        .map(str::to_ascii_lowercase)
}

/// Whether `url` is a paired computer's address.
#[must_use]
pub(crate) fn is_paired_url(url: &str) -> bool {
    host_of(url).is_some_and(|h| pin::is_name(&h))
}

/// The paired computers kept in `config`, read into memory: added to what
/// is there (each test runs its own configuration in one process).
pub(crate) fn load(config: Option<&Path>) {
    let Ok(all) = verso_core::servers::paired(config) else {
        return;
    };
    let mut table = lock(&TABLE);
    for p in all {
        let Some(host) = host_of(&p.url) else {
            continue;
        };
        let addresses = p.addresses.iter().filter_map(|a| a.parse().ok()).collect();
        table.insert(
            host,
            Entry {
                pin: p.pin,
                addresses,
                url: p.url,
                config: config.map(Path::to_path_buf),
            },
        );
    }
}

/// `url`'s computer is no longer held (its sign-in forgotten).
pub(crate) fn unload(url: &str) {
    if let Some(host) = host_of(url) {
        lock(&TABLE).remove(&host);
        lock(&CHANGED_AT).remove(&host);
    }
}

/// The addresses to try for `host`, when it is a paired computer's name:
/// none when it is such a name and no computer is held under it — a name
/// of this kind is never asked of a DNS server (`dns.rs`).
#[must_use]
pub(crate) fn addresses(host: &str) -> Option<Vec<IpAddr>> {
    let host = host.to_ascii_lowercase();
    if !pin::is_name(&host) {
        return None;
    }
    Some(
        lock(&TABLE)
            .get(&host)
            .map(|e| e.addresses.clone())
            .unwrap_or_default(),
    )
}

/// The pin `host` is held to.
fn pin_of(host: &str) -> Option<String> {
    lock(&TABLE).get(host).map(|e| e.pin.clone())
}

/// What is said when the last handshake with `url`'s computer showed another
/// key: in place of "out of reach" (`reach.rs`).
#[must_use]
pub(crate) fn changed(url: &str) -> Option<ContractError> {
    let host = host_of(url)?;
    lock(&CHANGED_AT).contains(&host).then(|| {
        verso_service::refused(format!(
            "{CHANGED}: it was replaced on the computer, or another device answers at its address — nothing was sent to it. Pair this device again in Settings › Servers › Pair with a computer at home"
        ))
    })
}

fn provider() -> Arc<CryptoProvider> {
    Arc::new(rustls::crypto::ring::default_provider())
}

fn algorithms() -> WebPkiSupportedAlgorithms {
    provider().signature_verification_algorithms
}

fn bad_certificate() -> rustls::Error {
    rustls::Error::InvalidCertificate(CertificateError::ApplicationVerificationFailure)
}

/// The handshake's signature checked with `spki` itself, as a raw key: the
/// key whose pin was compared is the key that signed.
fn signed_by(
    spki: &[u8],
    message: &[u8],
    dss: &DigitallySignedStruct,
    algs: &WebPkiSupportedAlgorithms,
) -> Result<HandshakeSignatureValid, rustls::Error> {
    rustls::crypto::verify_tls13_signature_with_raw_key(
        message,
        &SubjectPublicKeyInfoDer::from(spki),
        dss,
        algs,
    )
}

/// A paired computer's certificate: its key, and nothing else of it.
#[derive(Debug)]
pub(crate) struct Pinned {
    host: String,
    pin: String,
    algs: WebPkiSupportedAlgorithms,
    /// A probe of an address found on the network (`find.rs`): another key
    /// there is someone else announcing the pin, refused and not said as
    /// this computer's identity changed.
    quiet: bool,
}

impl Pinned {
    pub(crate) fn new(host: &str, pin: &str) -> Self {
        Self {
            host: host.to_owned(),
            pin: pin.to_owned(),
            algs: algorithms(),
            quiet: false,
        }
    }

    /// The verifier of a probe: the same check, without its say.
    pub(crate) fn probe(host: &str, pin: &str) -> Self {
        Self {
            quiet: true,
            ..Self::new(host, pin)
        }
    }

    /// The certificate's key, when it is the pinned one.
    fn key_of(&self, cert: &CertificateDer<'_>) -> Result<Vec<u8>, rustls::Error> {
        let spki = pin::spki(cert).map_err(|_| bad_certificate())?;
        if self.pin.is_empty() || !pin::same(&pin::of_key(&spki), &self.pin) {
            if self.quiet {
                return Err(bad_certificate());
            }
            lock(&CHANGED_AT).insert(self.host.clone());
            crate::log::write(
                "WARN",
                "host",
                &format!(
                    "a paired computer ({}) showed another key: refused",
                    self.host
                ),
            );
            return Err(bad_certificate());
        }
        Ok(spki)
    }
}

impl ServerCertVerifier for Pinned {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        // Not the name (the name is this app's own) nor the dates (the
        // computer makes its certificate again over the same key): the key.
        self.key_of(end_entity)?;
        if !self.quiet {
            lock(&CHANGED_AT).remove(&self.host);
        }
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        // The configuration offers TLS 1.3 alone ([`config`]).
        Err(rustls::Error::General(
            "a paired computer is spoken to over TLS 1.3".to_owned(),
        ))
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        let spki = self.key_of(cert)?;
        signed_by(&spki, message, dss, &self.algs)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.algs.supported_schemes()
    }
}

/// The first sight of a computer being paired (`pair.rs`): any key is
/// accepted **once**, remembered, and every later handshake of the same
/// pairing must show the same one. Nothing is sent over it but the code's
/// proof, made over that key, and nothing it answers is kept until the
/// computer's own proof over that key holds.
#[derive(Debug)]
pub(crate) struct FirstSight {
    seen: Mutex<Option<Vec<u8>>>,
    algs: WebPkiSupportedAlgorithms,
}

impl FirstSight {
    pub(crate) fn new() -> Self {
        Self {
            seen: Mutex::new(None),
            algs: algorithms(),
        }
    }

    /// The key seen, once a handshake was made.
    pub(crate) fn seen(&self) -> Option<Vec<u8>> {
        lock(&self.seen).clone()
    }

    fn same_key(&self, cert: &CertificateDer<'_>) -> Result<Vec<u8>, rustls::Error> {
        let spki = pin::spki(cert).map_err(|_| bad_certificate())?;
        let mut seen = lock(&self.seen);
        match seen.as_ref() {
            None => *seen = Some(spki.clone()),
            Some(first) if *first == spki => {}
            Some(_) => return Err(bad_certificate()),
        }
        Ok(spki)
    }
}

impl ServerCertVerifier for FirstSight {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        self.same_key(end_entity)?;
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Err(rustls::Error::General(
            "a computer is paired over TLS 1.3".to_owned(),
        ))
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        let spki = self.same_key(cert)?;
        signed_by(&spki, message, dss, &self.algs)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.algs.supported_schemes()
    }
}

/// A TLS configuration over `verifier`: TLS 1.3, HTTP/1.1 (the computer's
/// listener speaks it, and a WebSocket is opened over it), no SNI.
/// `dangerous()` is rustls's name for a verifier of one's own, which is
/// what pinning is; nothing here accepts a certificate the verifier did not.
pub(crate) fn config(
    verifier: Arc<dyn ServerCertVerifier>,
) -> Result<rustls::ClientConfig, ContractError> {
    let mut made = rustls::ClientConfig::builder_with_provider(provider())
        .with_protocol_versions(&[&rustls::version::TLS13])
        .map_err(|e| verso_service::failed(e.to_string()))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    made.enable_sni = false;
    made.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(made)
}

/// An HTTP client over `config`, as `remote::http_within` makes one.
pub(crate) fn client_over(
    tls: rustls::ClientConfig,
    total: std::time::Duration,
) -> Result<reqwest::blocking::Client, ContractError> {
    reqwest::blocking::Client::builder()
        .user_agent(concat!("Verso/", env!("CARGO_PKG_VERSION")))
        .timeout(total)
        .connect_timeout(total.mul_f32(0.75))
        .dns_resolver(Arc::new(crate::dns::Resolver))
        .tls_backend_preconfigured(tls)
        .build()
        .map_err(|e| verso_service::failed(e.to_string()))
}

/// The HTTP client for `url` when it is a paired computer's: pinned to its
/// key. `None` for any other address, which `remote::http_within` serves as
/// before.
pub(crate) fn http_client(
    url: &str,
    total: std::time::Duration,
) -> Option<Result<reqwest::blocking::Client, ContractError>> {
    let host = host_of(url).filter(|h| pin::is_name(h))?;
    // A name of this kind with no pin held gets a pin nothing matches.
    let pinned = Pinned::new(&host, &pin_of(&host).unwrap_or_default());
    Some(config(Arc::new(pinned)).and_then(|tls| client_over(tls, total)))
}

/// The client every request to a server is sent with (`remote::http`), for
/// a request to `url`: a paired computer's pinned to its key, any other
/// server's as before. The paths that may reach a paired computer — its
/// folders, files, sync, sign-out, shares, this device's name — use it.
pub(crate) fn http_to(url: &str) -> Result<reqwest::blocking::Client, ContractError> {
    http_to_within(url, std::time::Duration::from_secs(20))
}

/// [`http_to`] with its own total time.
pub(crate) fn http_to_within(
    url: &str,
    total: std::time::Duration,
) -> Result<reqwest::blocking::Client, ContractError> {
    http_client(url, total).unwrap_or_else(|| crate::remote::http_within(total))
}

/// The WebSocket's TLS for `host` when it is a paired computer's name.
pub(crate) fn ws_connector(host: &str) -> Option<tokio_tungstenite::Connector> {
    let host = host.to_ascii_lowercase();
    if !pin::is_name(&host) {
        return None;
    }
    let pinned = Pinned::new(&host, &pin_of(&host).unwrap_or_default());
    match config(Arc::new(pinned)) {
        Ok(tls) => Some(tokio_tungstenite::Connector::Rustls(Arc::new(tls))),
        Err(e) => {
            crate::log::write(
                "ERROR",
                "host",
                &format!("no TLS for a paired computer: {}", e.message),
            );
            None
        }
    }
}

/// Where the paired computer at `url` says it is now (`/api/paired`), kept
/// when it changed: the next time its address changes, those are tried.
/// Quiet on failure — the sync it runs beside says what it must.
pub(crate) fn refresh(config_dir: Option<&Path>, url: &str, token: &str) {
    let Some(Ok(client)) = http_client(url, std::time::Duration::from_secs(10)) else {
        return;
    };
    let Ok(answer) = client
        .get(format!("{url}/api/paired"))
        .bearer_auth(token)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .and_then(reqwest::blocking::Response::json::<serde_json::Value>)
    else {
        return;
    };
    let told: Vec<String> = answer["addresses"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| a.as_str())
        .filter(|a| a.parse::<IpAddr>().is_ok())
        .map(str::to_owned)
        .collect();
    remember(config_dir, url, &told);
}

/// Keep `told` as where the computer at `url` is, the ones known before
/// and not told after them (the computer may be on its other network now).
pub(crate) fn remember(config_dir: Option<&Path>, url: &str, told: &[String]) {
    let Ok(all) = verso_core::servers::paired(config_dir) else {
        return;
    };
    let Some(mut kept) = all.into_iter().find(|p| p.url == url) else {
        return;
    };
    let mut addresses: Vec<String> = told.to_vec();
    for a in &kept.addresses {
        if !addresses.contains(a) {
            addresses.push(a.clone());
        }
    }
    addresses.truncate(16);
    if addresses == kept.addresses {
        return;
    }
    kept.addresses = addresses;
    if verso_core::servers::keep_paired(config_dir, kept).is_ok() {
        load(config_dir);
    }
}
