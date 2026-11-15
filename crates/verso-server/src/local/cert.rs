// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The app's own certificate (ADR 0096 item 5 (a)): self-signed, made the
//! first time "this app is a server" is turned on, naming the machine's
//! private addresses, its key kept in the local database (`0600`, in the
//! configuration directory, item 16). A phone's browser warns once and the
//! person accepts it; the pairing dialog says the limit in words
//! (trust on first use). A native Verso client pins the fingerprint the QR
//! carries.
//!
//! The key outlives the addresses: when the machine's addresses change the
//! certificate is made again over the same key, so the identity a paired
//! phone has accepted does not change under it; "Replace this computer's
//! identity" (item 15) makes a new key, which ends every pairing.

use std::net::IpAddr;
use std::path::Path;

use rcgen::{CertificateParams, DnType, ExtendedKeyUsagePurpose, IsCa, KeyPair, SanType};
use rustls_pki_types::pem::PemObject;
use rustls_pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use sha2::{Digest, Sha256};

use crate::db::Db;

/// How long a certificate lives: Apple's browsers refuse a certificate
/// valid for longer than 398 days when it is not chained to a root they
/// ship, and a certificate this app makes is made again when it nears its
/// end, so shorter costs nothing.
const VALID_DAYS: i64 = 398;

/// A certificate nearer its end than this is made again at the next start.
const RENEW_BEFORE_DAYS: i64 = 30;

const DAY: i64 = 24 * 60 * 60;

const KEY: &str = "local.identity.key";
const CERT: &str = "local.identity.cert";
const SANS: &str = "local.identity.sans";
const ENDS: &str = "local.identity.ends";

/// The certificate and key the listeners speak TLS with.
#[derive(Clone)]
pub struct Identity {
    pub cert: Vec<u8>,
    pub key: Vec<u8>,
    /// SHA-256 of the certificate, 64 lower-case hexadecimal digits: what
    /// the QR carries and the dialog shows.
    pub fingerprint: String,
}

impl Identity {
    /// The chain and key as rustls takes them.
    #[must_use]
    pub fn der(&self) -> (Vec<CertificateDer<'static>>, PrivateKeyDer<'static>) {
        (
            vec![CertificateDer::from(self.cert.clone())],
            PrivateKeyDer::from(PrivatePkcs8KeyDer::from(self.key.clone())),
        )
    }
}

/// The fingerprint of a certificate: SHA-256 of its DER, in hexadecimal.
#[must_use]
pub fn fingerprint(der: &[u8]) -> String {
    Sha256::digest(der)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// The fingerprint in the form a person compares by eye: upper case in
/// pairs, colon-separated.
#[must_use]
pub fn spaced(fingerprint: &str) -> String {
    fingerprint
        .as_bytes()
        .chunks(2)
        .map(|c| String::from_utf8_lossy(c).to_uppercase())
        .collect::<Vec<_>>()
        .join(":")
}

fn make(key: &KeyPair, addresses: &[IpAddr], now: i64) -> Result<(Vec<u8>, String, i64), String> {
    let mut params = CertificateParams::new(Vec::<String>::new()).map_err(|e| e.to_string())?;
    params.subject_alt_names = addresses.iter().map(|ip| SanType::IpAddress(*ip)).collect();
    params
        .distinguished_name
        .push(DnType::CommonName, "Verso on this computer");
    params.is_ca = IsCa::NoCa;
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let ends = now + VALID_DAYS * DAY;
    let (y, m, d) = ymd(now - DAY)?;
    params.not_before = rcgen::date_time_ymd(y, m, d);
    let (y, m, d) = ymd(ends)?;
    params.not_after = rcgen::date_time_ymd(y, m, d);
    let cert = params.self_signed(key).map_err(|e| e.to_string())?;
    let der = cert.der().to_vec();
    let pem = cert.pem();
    Ok((der, pem, ends))
}

/// `secs` as year, month and day.
fn ymd(secs: i64) -> Result<(i32, u8, u8), String> {
    let stamp = crate::log::stamp_at(secs);
    let part = |from: usize, to: usize| stamp.get(from..to).and_then(|s| s.parse::<i32>().ok());
    let (Some(y), Some(m), Some(d)) = (part(0, 4), part(5, 7), part(8, 10)) else {
        return Err(format!("not a date: {stamp}"));
    };
    let m = u8::try_from(m).map_err(|e| e.to_string())?;
    let d = u8::try_from(d).map_err(|e| e.to_string())?;
    Ok((y, m, d))
}

/// The identity for `addresses`: the one kept when it names them all and is
/// not near its end; else a new certificate over the kept key (or over a
/// new key, at the first time). Kept in `db` before it is returned.
pub fn load_or_make(db: &Db, addresses: &[IpAddr], now: i64) -> Result<Identity, String> {
    let key_pem = db.setting(KEY)?;
    let key = match key_pem.as_deref().map(KeyPair::from_pem) {
        Some(Ok(k)) => k,
        _ => {
            let k = KeyPair::generate().map_err(|e| e.to_string())?;
            db.set_setting(KEY, &k.serialize_pem())?;
            // A key that is new has no certificate worth keeping.
            db.set_setting(CERT, "")?;
            k
        }
    };
    let kept_sans: Vec<IpAddr> = db
        .setting(SANS)?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let ends: i64 = db.setting(ENDS)?.and_then(|s| s.parse().ok()).unwrap_or(0);
    let cert_pem = db.setting(CERT)?.unwrap_or_default();
    let covers = addresses.iter().all(|a| kept_sans.contains(a));
    if covers
        && ends - now > RENEW_BEFORE_DAYS * DAY
        && !cert_pem.is_empty()
        && let Some(der) = CertificateDer::pem_slice_iter(cert_pem.as_bytes()).next()
    {
        let der = der.map_err(|e| e.to_string())?.to_vec();
        return Ok(Identity {
            fingerprint: fingerprint(&der),
            cert: der,
            key: key.serialize_der(),
        });
    }
    // Every address served and every address already named: a phone that
    // paired on one address keeps being served when the machine has two.
    let mut names: Vec<IpAddr> = addresses.to_vec();
    for ip in kept_sans {
        if !names.contains(&ip) && names.len() < 8 {
            names.push(ip);
        }
    }
    names.sort();
    let (der, pem, ends) = make(&key, &names, now)?;
    db.set_setting(CERT, &pem)?;
    db.set_setting(
        SANS,
        &serde_json::to_string(&names).map_err(|e| e.to_string())?,
    )?;
    db.set_setting(ENDS, &ends.to_string())?;
    Ok(Identity {
        fingerprint: fingerprint(&der),
        cert: der,
        key: key.serialize_der(),
    })
}

/// "Replace this computer's identity" (ADR 0096 item 15): the key and the
/// certificate forgotten, so that the next start makes new ones. The
/// caller ends every pairing: a phone that accepted the old certificate
/// would otherwise meet a stranger's.
pub fn forget(db: &Db) -> Result<(), String> {
    for key in [KEY, CERT, SANS, ENDS] {
        db.set_setting(key, "")?;
    }
    Ok(())
}

/// The certificate and key a person gave as files (ADR 0096 item 5 (d),
/// `VERSO_TLS_CERT_FILE` as in ADR 0073 item 6): the fingerprint of the
/// first certificate in the chain, after the files were read as an
/// acceptor would read them, and the pin of its key (`pin.rs`).
pub fn from_files(cert: &Path, key: &Path) -> Result<(String, String), String> {
    crate::tls::acceptor(cert, key)?;
    let first = CertificateDer::pem_file_iter(cert)
        .map_err(|e| e.to_string())?
        .next()
        .ok_or_else(|| "no certificate".to_owned())?
        .map_err(|e| e.to_string())?;
    Ok((fingerprint(&first), super::pin::of_cert(&first)?))
}

/// Every address the certificate of this computer names: the ones it serves
/// on and the ones it served on since its key was made, at most eight
/// ([`load_or_make`]). Where a paired Verso app looks for it (ADR 0117,
/// "The Verso app paired").
#[must_use]
pub fn named(db: &Db) -> Vec<IpAddr> {
    db.setting(SANS)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    fn secret_of(db: &Db) -> String {
        db.setting(KEY).unwrap().unwrap()
    }

    /// The first time makes a key and a certificate; the same addresses
    /// later keep both, so a phone that accepted the certificate is still
    /// served the same one.
    #[test]
    fn the_same_addresses_keep_the_same_certificate() {
        let db = Db::memory().unwrap();
        let now = 1_800_000_000;
        let a = load_or_make(&db, &[ip("192.168.1.20")], now).unwrap();
        let b = load_or_make(&db, &[ip("192.168.1.20")], now + DAY).unwrap();
        assert_eq!(a.fingerprint, b.fingerprint);
        assert_eq!(a.fingerprint.len(), 64);
        assert_eq!(a.fingerprint, fingerprint(&a.cert));
    }

    /// A new address makes a new certificate (the browser checks the
    /// address against it) over the same key, and names the old address
    /// too: the identity is the key's.
    #[test]
    fn a_new_address_is_named_over_the_same_key() {
        let db = Db::memory().unwrap();
        let now = 1_800_000_000;
        let a = load_or_make(&db, &[ip("192.168.1.20")], now).unwrap();
        let key = secret_of(&db);
        let b = load_or_make(&db, &[ip("10.0.0.7")], now + DAY).unwrap();
        assert_ne!(a.fingerprint, b.fingerprint);
        assert_eq!(key, secret_of(&db), "the key stays");
        let names: Vec<IpAddr> = serde_json::from_str(&db.setting(SANS).unwrap().unwrap()).unwrap();
        assert!(names.contains(&ip("10.0.0.7")) && names.contains(&ip("192.168.1.20")));
        // The key is the same, so the certificates carry the same public key.
        assert_eq!(a.key, b.key);
    }

    /// A certificate near its end is made again before a phone meets an
    /// expired one.
    #[test]
    fn a_certificate_near_its_end_is_made_again() {
        let db = Db::memory().unwrap();
        let now = 1_800_000_000;
        let a = load_or_make(&db, &[ip("192.168.1.20")], now).unwrap();
        let b = load_or_make(&db, &[ip("192.168.1.20")], now + (VALID_DAYS - 10) * DAY).unwrap();
        assert_ne!(a.fingerprint, b.fingerprint);
        assert_eq!(a.key, b.key);
    }

    /// "Replace this computer's identity": a new key, so a new fingerprint.
    #[test]
    fn replacing_the_identity_makes_a_new_key() {
        let db = Db::memory().unwrap();
        let now = 1_800_000_000;
        let a = load_or_make(&db, &[ip("192.168.1.20")], now).unwrap();
        forget(&db).unwrap();
        let b = load_or_make(&db, &[ip("192.168.1.20")], now).unwrap();
        assert_ne!(a.key, b.key);
        assert_ne!(a.fingerprint, b.fingerprint);
    }

    /// The certificate really is one a TLS server can speak with.
    #[test]
    fn the_certificate_builds_an_acceptor() {
        let db = Db::memory().unwrap();
        let id = load_or_make(&db, &[ip("192.168.1.20"), ip("fd00::5")], 1_800_000_000).unwrap();
        let (chain, key) = id.der();
        let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();
        crate::tls::acceptor_from(chain, key).unwrap();
    }

    #[test]
    fn a_fingerprint_is_spaced_for_the_eye() {
        assert_eq!(spaced("0a1b2c"), "0A:1B:2C");
    }
}
