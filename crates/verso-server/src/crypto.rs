// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Secrets: random tokens, their hash at rest, and passwords hashed with
//! Argon2id (ADR 0074 items 3, 7 and 8).

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};

/// `n` random bytes from the operating system.
fn random(n: usize) -> Result<Vec<u8>, String> {
    let mut bytes = vec![0_u8; n];
    getrandom::fill(&mut bytes).map_err(|e| format!("no randomness: {e}"))?;
    Ok(bytes)
}

/// A secret of 256 bits, as text that travels in a cookie, a header or a
/// link.
pub fn token() -> Result<String, String> {
    Ok(URL_SAFE_NO_PAD.encode(random(32)?))
}

/// An identifier: random, of no meaning, short enough for an address.
pub fn id() -> Result<String, String> {
    Ok(URL_SAFE_NO_PAD.encode(random(12)?))
}

/// What the database keeps of a token: its SHA-256, never the token.
#[must_use]
pub fn hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// A password hashed with Argon2id at the crate's defaults — m = 19 MiB,
/// t = 2, p = 1, OWASP's first recommendation for Argon2id in its
/// Password Storage Cheat Sheet (checked on 2026-10-09) — in the PHC
/// string, which carries its own parameters: a later change of parameters
/// still verifies the old hashes.
pub fn hash_password(password: &str) -> Result<String, String> {
    use argon2::password_hash::{PasswordHasher, SaltString};
    let salt_bytes = random(16)?;
    let salt = SaltString::encode_b64(&salt_bytes).map_err(|e| e.to_string())?;
    argon2::Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

/// Whether `password` is the one `hashed` was made from.
#[must_use]
pub fn verify_password(password: &str, hashed: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    PasswordHash::new(hashed).is_ok_and(|h| {
        argon2::Argon2::default()
            .verify_password(password.as_bytes(), &h)
            .is_ok()
    })
}

/// A password hashed and thrown away, so that an unknown address takes the
/// time a known one takes: the answer's delay says nothing of who has an
/// account.
pub fn waste_time(password: &str) {
    let _ = hash_password(password);
}

/// Two secrets compared in time that does not depend on where they differ.
#[must_use]
pub fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0_u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_password_verifies_against_its_hash_only() {
        let h = hash_password("uma senha longa").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(verify_password("uma senha longa", &h));
        assert!(!verify_password("outra senha", &h));
        assert!(!verify_password("uma senha longa", "lixo"));
    }

    #[test]
    fn tokens_are_long_random_and_kept_as_hashes() {
        let a = token().unwrap();
        let b = token().unwrap();
        assert_ne!(a, b);
        assert_eq!(a.len(), 43);
        assert_eq!(hash(&a).len(), 32);
        assert!(same(&hash(&a), &hash(&a)));
        assert!(!same(&hash(&a), &hash(&b)));
    }
}
