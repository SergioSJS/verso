// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the Verso app on a phone pins of this computer, and how it learns
//! it with nothing but the eight letters the pairing dialog shows (ADR
//! 0117, "The Verso app paired"; ADR 0096 item 5 (a): "a native Verso
//! client pins the fingerprint"). Both sides call these functions — this
//! computer's server and the app's client — so the two compute the same
//! thing from the same bytes.
//!
//! **What is pinned** is the SHA-256 of the certificate's public key (its
//! SubjectPublicKeyInfo), not of the certificate: the certificate is made
//! again over the same key when the computer's addresses change or it
//! nears its end (`cert.rs`), and a phone keeps reaching it; "Replace this
//! computer's identity" makes a new key, which no pin matches.
//!
//! **How the phone learns it** without a camera: the phone opens TLS to
//! the address typed, accepting whatever certificate it is shown, and
//! remembers that key. Then both sides prove they know the code — never
//! sending it — over *the key each of them sees*: the phone proves
//! `HMAC(K, "phone" | nonce | key it saw)`, the computer checks it against
//! its own key and, only then, answers `HMAC(K, "computer" | nonce | its
//! key)`, which the phone checks against the key it saw. `K` is Argon2id
//! of the code, salted by the phone's fresh nonce. A person in the middle
//! shows the phone their own key: the phone's proof names it, the computer
//! refuses it (one of the window's three attempts), and the person in the
//! middle, who has not the code, cannot make either proof for the other
//! key. What they hold is one proof to guess the code from, offline: with
//! 20⁸ (≈ 2.6 × 10¹⁰) codes, each guess an Argon2id of 32 MiB, against a
//! window that ends in two minutes, at one try.

use argon2::{Algorithm, Argon2, Params, Version};
use ring::hmac;
use sha2::{Digest, Sha256};
use tokio_rustls::rustls::pki_types::CertificateDer;
use tokio_rustls::rustls::server::ParsedCertificate;

/// The end of every name a paired app gives this computer: `.home.arpa`,
/// the names of a home network (RFC 8375), which no public registry sells
/// and no page on the internet can make resolve here.
pub const NAME_END: &str = ".home.arpa";

/// The start of that name.
pub const NAME_START: &str = "verso-";

/// Hexadecimal digits of the pin the name keeps: 80 bits, a name no other
/// computer of the house shares.
const NAME_DIGITS: usize = 20;

/// Argon2id's cost for the code: 32 MiB, three passes, one lane — about a
/// third of a second on a phone, and on a machine that would guess the
/// code from a proof, 2.6 × 10¹⁰ times that.
const MEMORY_KIB: u32 = 32 * 1024;
const PASSES: u32 = 3;

/// Which side makes a proof: the two never prove the same message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Phone,
    Computer,
}

impl Side {
    fn label(self) -> &'static str {
        match self {
            Self::Phone => "phone",
            Self::Computer => "computer",
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The certificate's public key, its SubjectPublicKeyInfo as rustls reads
/// it — the same reading that checks the handshake's signature.
pub fn spki(cert: &[u8]) -> Result<Vec<u8>, String> {
    let der = CertificateDer::from(cert);
    let parsed = ParsedCertificate::try_from(&der).map_err(|e| e.to_string())?;
    Ok(parsed.subject_public_key_info().as_ref().to_vec())
}

/// The pin of a public key: SHA-256 of its SubjectPublicKeyInfo, 64
/// lower-case hexadecimal digits.
#[must_use]
pub fn of_key(spki: &[u8]) -> String {
    hex(&Sha256::digest(spki))
}

/// The pin of the key a certificate carries.
pub fn of_cert(cert: &[u8]) -> Result<String, String> {
    spki(cert).map(|k| of_key(&k))
}

/// The name a paired app reaches this computer by, whatever its address
/// (ADR 0117, "The Verso app paired", item 5): made from the pin, so a new
/// key is a new name. The app resolves it itself, to the addresses this
/// computer served from; nothing asks a DNS server for it.
#[must_use]
pub fn name(pin: &str) -> String {
    let digits: String = pin.chars().take(NAME_DIGITS).collect();
    format!("{NAME_START}{digits}{NAME_END}")
}

/// Whether `host` (no port) is such a name.
#[must_use]
pub fn is_name(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host.strip_prefix(NAME_START)
        .and_then(|rest| rest.strip_suffix(NAME_END))
        .is_some_and(|d| d.len() == NAME_DIGITS && d.bytes().all(|b| b.is_ascii_hexdigit()))
}

/// The key both sides make of the code: Argon2id of the code as the
/// dialog shows it (`BCDF-GHJK`), salted by the phone's nonce.
pub fn key(code: &str, nonce: &str) -> Result<[u8; 32], String> {
    if nonce.len() < 16 {
        return Err("a nonce that short is no salt".to_owned());
    }
    let params = Params::new(MEMORY_KIB, PASSES, 1, Some(32)).map_err(|e| e.to_string())?;
    let mut out = [0_u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(code.as_bytes(), nonce.as_bytes(), &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// One side's proof that it knows the code, over the key `pin` it sees:
/// HMAC-SHA256 in hexadecimal.
#[must_use]
pub fn proof(key: &[u8; 32], side: Side, nonce: &str, pin: &str) -> String {
    let k = hmac::Key::new(hmac::HMAC_SHA256, key);
    let message = format!("verso pair 1|{}|{nonce}|{pin}", side.label());
    hex(hmac::sign(&k, message.as_bytes()).as_ref())
}

/// Whether two proofs are the same, in time that does not say where they
/// differ.
#[must_use]
pub fn same(a: &str, b: &str) -> bool {
    crate::crypto::same(a.as_bytes(), b.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cert_over(key: &rcgen::KeyPair, ip: &str) -> Vec<u8> {
        let mut params = rcgen::CertificateParams::new(Vec::<String>::new()).unwrap();
        params.subject_alt_names = vec![rcgen::SanType::IpAddress(ip.parse().unwrap())];
        params.self_signed(key).unwrap().der().to_vec()
    }

    /// Two certificates over one key have one pin; another key another.
    #[test]
    fn the_pin_is_the_keys_and_survives_a_new_certificate() {
        let key = rcgen::KeyPair::generate().unwrap();
        let a = cert_over(&key, "192.168.1.20");
        let b = cert_over(&key, "10.0.0.7");
        assert_ne!(a, b);
        assert_eq!(of_cert(&a).unwrap(), of_cert(&b).unwrap());
        use rcgen::PublicKeyData as _;
        assert_eq!(of_cert(&a).unwrap(), of_key(&key.subject_public_key_info()));
        let other = cert_over(&rcgen::KeyPair::generate().unwrap(), "192.168.1.20");
        assert_ne!(of_cert(&a).unwrap(), of_cert(&other).unwrap());
        assert_eq!(of_cert(&a).unwrap().len(), 64);
        assert!(of_cert(b"not a certificate").is_err());
    }

    #[test]
    fn the_name_is_made_of_the_pin_and_read_back() {
        let pin = "ab".repeat(32);
        let n = name(&pin);
        assert_eq!(n, "verso-abababababababababab.home.arpa");
        assert!(is_name(&n));
        assert!(is_name(&n.to_uppercase()));
        for not in [
            "verso-abab.home.arpa",
            "verso-zzzzzzzzzzzzzzzzzzzz.home.arpa",
            "abababababababababab.home.arpa",
            "verso-abababababababababab.home.arpa.evil.com",
            "192.168.1.20",
        ] {
            assert!(!is_name(not), "{not}");
        }
    }

    /// The proofs: the same code, nonce and key make the same proof on
    /// both sides; another key, code, nonce or side another.
    #[test]
    fn a_proof_binds_the_code_the_nonce_the_key_and_the_side() {
        let nonce = "n0nce-of-the-phone-123";
        let k = key("BCDF-GHJK", nonce).unwrap();
        let p = proof(&k, Side::Phone, nonce, "aa");
        assert!(same(
            &p,
            &proof(&key("BCDF-GHJK", nonce).unwrap(), Side::Phone, nonce, "aa")
        ));
        assert!(
            !same(&p, &proof(&k, Side::Phone, nonce, "bb")),
            "another key"
        );
        assert!(
            !same(&p, &proof(&k, Side::Computer, nonce, "aa")),
            "another side"
        );
        let other = key("BCDF-GHJL", nonce).unwrap();
        assert!(
            !same(&p, &proof(&other, Side::Phone, nonce, "aa")),
            "another code"
        );
        let salt = "another-nonce-of-it-456";
        assert_ne!(k, key("BCDF-GHJK", salt).unwrap(), "another nonce");
        assert!(key("BCDF-GHJK", "short").is_err());
    }
}
