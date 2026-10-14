//! The release's signed checksums list (ADR 0055, revised 2026-10-14):
//! one file, `verso-<version>-SHA256SUMS`, with the sha256 of each of the
//! release's files, as `sha256sum` writes it, and one signature for it,
//! `verso-<version>-SHA256SUMS.sig`, made with the release key — in place
//! of a `.sig` beside every file. An update is installed only when the
//! list's signature verifies against the key the app carries, the signed
//! comment names the list of the release's own version, the update's file
//! is in it exactly once, and the download's sha256 is the one it gives.
//!
//! And the minisign verifier itself, `verify_signature`: the list's
//! signature is checked with it, and so is a `.sig` beside one file — what
//! releases up to 0.8.3 (the bridge, which publishes both) carry, and what
//! `verso-app --verify-signature` checks in the release workflow.
//!
//! No IO: the updater (`update.rs`) downloads, this checks.

/// Whether `signature` — a `.sig` file as `tauri signer sign` writes it,
/// base64 of minisign's text — is `data` signed by `public_key`, and was
/// made for a file named `file`: `tauri signer` writes `file:<name>` in the
/// signed trusted comment, so an older release's genuine file cannot be
/// passed off under a newer release's name. Only prehashed signatures, the
/// kind `tauri signer` writes.
pub(crate) fn verify_signature(
    data: &[u8],
    signature: &str,
    public_key: &str,
    file: &str,
) -> Result<(), String> {
    use base64::Engine;
    let text = |b64: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(b64.trim())
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
    };
    let key = text(public_key).ok_or("the public key does not read")?;
    let key = minisign_verify::PublicKey::decode(&key).map_err(|e| e.to_string())?;
    let sig = text(signature).ok_or("the signature does not read")?;
    let sig = minisign_verify::Signature::decode(&sig).map_err(|e| e.to_string())?;
    key.verify(data, &sig, false).map_err(|e| e.to_string())?;
    let named = format!("file:{file}");
    if !sig
        .trusted_comment()
        .split('\t')
        .any(|field| field == named)
    {
        return Err(format!("signed for another file than {file}"));
    }
    Ok(())
}

/// The list's name for release `version` (without the `v`), as the release
/// workflow writes it. The version in the name is what binds the list to
/// its release: the signature's comment names the file it signed
/// (`file:<name>`), so a genuine list of another version does not verify
/// under this one's name.
pub(crate) fn sums_name(version: &str) -> String {
    format!("verso-{version}-SHA256SUMS")
}

/// The sha256 (lowercase hex) the signed `list` of release `version`
/// gives for the file `asset`: refused when `signature` is not the list's
/// signature by `public_key`, when it was made for another release's list,
/// or when `asset` is missing from the list or listed twice.
pub(crate) fn listed_sha256(
    list: &[u8],
    signature: &str,
    public_key: &str,
    version: &str,
    asset: &str,
) -> Result<String, String> {
    verify_signature(list, signature, public_key, &sums_name(version))?;
    let text = std::str::from_utf8(list).map_err(|_| "the list is not text".to_string())?;
    let mut listed = None;
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        // `sha256sum`'s lines: the hash, two spaces (or a space and `*`,
        // binary mode), the name.
        let (hash, name) = line
            .split_once("  ")
            .or_else(|| line.split_once(" *"))
            .ok_or_else(|| format!("a line of the list does not read: {line}"))?;
        if name != asset {
            continue;
        }
        if listed.is_some() {
            return Err(format!("{asset} is in the list twice"));
        }
        if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(format!("the list gives {asset} no sha256 that reads"));
        }
        listed = Some(hash.to_ascii_lowercase());
    }
    listed.ok_or_else(|| format!("{asset} is not in the list of {version}"))
}

/// Whether the download's sha256, `got`, is the one the list gave
/// (both lowercase hex, as `listed_sha256` and the updater write them).
pub(crate) fn check_listed(listed: &str, got: &str) -> Result<(), String> {
    if listed.len() == 64 && listed == got {
        Ok(())
    } else {
        Err(format!(
            "the download's sha256 ({got}) is not the one the signed list gives ({listed})"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    const TEST_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDhDMkYxODdBREEzNTVDQjUKUldTMVhEWGFlaGd2akpudkVwZlVXUm9majRneE1mTTlJYzdPSkFrQ0dZV2loNHh0ODl2ZUZjcmQK";
    const TEST_SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTMVhEWGFlaGd2ak9Eem50OHJibCtoOWIzYitBckhiL1lCQlZhWktxWWhqc1d2OXBuRlV6aDZCb0hUQzBMbEI2ZTFYUG4xNWN2ZXNnQlRqMWF1d2tSaHU2VHVYemsxN1FvPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkxNTE1MjI0CWZpbGU6cGF5bG9hZC5iaW4KdVo2SDFFdS8yMGpPQWtYa0ZEWndRZlVMSzA0RVdUaXBnd3RRbFcwVWhWbXhMOVdPYk5ZcHI5cWs0UGMwdHE5VkFvWjNlUUY0dCtNWnRsdUc4YmpYQWc9PQo=";

    /// A file signed by the key verifies; changed by a byte, or checked
    /// against another key, it does not (ADR 0055, revised 2026-10-09).
    #[test]
    fn an_update_installs_only_with_its_signature() {
        let data = b"Verso update payload\n";
        let ok = |d: &[u8], sig: &str, key: &str, file: &str| verify_signature(d, sig, key, file);
        assert_eq!(
            ok(data, TEST_SIGNATURE, TEST_PUBLIC_KEY, "payload.bin"),
            Ok(())
        );
        // Changed by a byte; another key; not base64.
        assert!(
            ok(
                b"Verso update payload!\n",
                TEST_SIGNATURE,
                TEST_PUBLIC_KEY,
                "payload.bin"
            )
            .is_err()
        );
        assert!(
            ok(
                data,
                TEST_SIGNATURE,
                crate::update::UPDATE_PUBLIC_KEY,
                "payload.bin"
            )
            .is_err()
        );
        assert!(ok(data, "not base64", TEST_PUBLIC_KEY, "payload.bin").is_err());
        // A genuine signature made for another file's name.
        assert!(
            ok(
                data,
                TEST_SIGNATURE,
                TEST_PUBLIC_KEY,
                "Verso-0.9.0-macos-arm64.zip"
            )
            .is_err()
        );
    }

    const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

    /// A throwaway minisign key, made here for the test and never kept:
    /// its public half as `tauri signer` writes one (base64 of minisign's
    /// text), and a signer that writes signatures as `tauri signer sign`
    /// does — prehashed, the trusted comment naming the file.
    struct TestKey {
        pair: ring::signature::Ed25519KeyPair,
        id: [u8; 8],
    }

    impl TestKey {
        fn new() -> Self {
            let rng = ring::rand::SystemRandom::new();
            let pkcs8 = ring::signature::Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
            let pair = ring::signature::Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap();
            let mut id = [0u8; 8];
            ring::rand::SecureRandom::fill(&rng, &mut id).unwrap();
            Self { pair, id }
        }

        fn public(&self) -> String {
            use ring::signature::KeyPair;
            let mut bin = b"Ed".to_vec();
            bin.extend_from_slice(&self.id);
            bin.extend_from_slice(self.pair.public_key().as_ref());
            let text = format!(
                "untrusted comment: minisign public key\n{}\n",
                B64.encode(bin)
            );
            B64.encode(text)
        }

        fn sign(&self, data: &[u8], file: &str) -> String {
            use blake2::Digest;
            let hash = blake2::Blake2b512::digest(data);
            let sig = self.pair.sign(&hash);
            let mut bin = b"ED".to_vec();
            bin.extend_from_slice(&self.id);
            bin.extend_from_slice(sig.as_ref());
            let comment = format!("timestamp:1791515224\tfile:{file}");
            let mut global = sig.as_ref().to_vec();
            global.extend_from_slice(comment.as_bytes());
            let text = format!(
                "untrusted comment: signature from tauri secret key\n{}\ntrusted comment: {comment}\n{}\n",
                B64.encode(bin),
                B64.encode(self.pair.sign(&global).as_ref())
            );
            B64.encode(text)
        }
    }

    fn sha256_hex(data: &[u8]) -> String {
        use sha2::Digest;
        format!("{:x}", sha2::Sha256::digest(data))
    }

    const V: &str = "0.8.4-beta.1";
    const ZIP: &str = "Verso-Beta-0.8.4-beta.1-macos-arm64.zip";
    const DEB: &str = "universo-0.8.4-beta.1-amd64.deb";
    const UPDATE: &[u8] = b"Verso update payload\n";

    /// The list as the release workflow writes it, two of its files.
    fn list_of(entries: &[(&[u8], &str)]) -> Vec<u8> {
        entries
            .iter()
            .map(|(data, name)| format!("{}  {name}\n", sha256_hex(data)))
            .collect::<String>()
            .into_bytes()
    }

    #[test]
    fn the_list_is_named_for_its_version() {
        assert_eq!(sums_name(V), "verso-0.8.4-beta.1-SHA256SUMS");
    }

    #[test]
    fn a_signed_list_gives_the_file_its_sha256() {
        let key = TestKey::new();
        let list = list_of(&[(UPDATE, ZIP), (b"server", DEB)]);
        let sig = key.sign(&list, &sums_name(V));
        let listed = listed_sha256(&list, &sig, &key.public(), V, ZIP).unwrap();
        assert_eq!(listed, sha256_hex(UPDATE));
        assert_eq!(check_listed(&listed, &sha256_hex(UPDATE)), Ok(()));
    }

    #[test]
    fn a_download_whose_hash_is_not_the_listed_one_is_refused() {
        let key = TestKey::new();
        let list = list_of(&[(b"another build", ZIP)]);
        let sig = key.sign(&list, &sums_name(V));
        let listed = listed_sha256(&list, &sig, &key.public(), V, ZIP).unwrap();
        assert!(check_listed(&listed, &sha256_hex(UPDATE)).is_err());
        // Nor is an empty or malformed listed hash ever a match.
        assert!(check_listed("", "").is_err());
    }

    #[test]
    fn a_list_whose_signature_does_not_verify_is_refused() {
        let key = TestKey::new();
        let list = list_of(&[(UPDATE, ZIP)]);
        let sig = key.sign(&list, &sums_name(V));
        // The list changed after it was signed: another hash for the file.
        let forged = list_of(&[(b"a forged build", ZIP)]);
        assert!(listed_sha256(&forged, &sig, &key.public(), V, ZIP).is_err());
        // Signed by another key than the one the app carries.
        let other = TestKey::new();
        assert!(listed_sha256(&list, &sig, &other.public(), V, ZIP).is_err());
        // No signature at all.
        assert!(listed_sha256(&list, "", &key.public(), V, ZIP).is_err());
    }

    #[test]
    fn the_list_of_another_version_is_refused() {
        let key = TestKey::new();
        // A genuine list of 0.8.3-beta.1, offered as 0.8.4-beta.1's: its
        // signed comment names its own version's list.
        let old = "0.8.3-beta.1";
        let list = list_of(&[(UPDATE, ZIP)]);
        let sig = key.sign(&list, &sums_name(old));
        assert!(listed_sha256(&list, &sig, &key.public(), V, ZIP).is_err());
        assert!(listed_sha256(&list, &sig, &key.public(), old, ZIP).is_ok());
    }

    #[test]
    fn a_file_missing_from_the_list_or_listed_twice_is_refused() {
        let key = TestKey::new();
        let list = list_of(&[(b"server", DEB)]);
        let sig = key.sign(&list, &sums_name(V));
        assert!(listed_sha256(&list, &sig, &key.public(), V, ZIP).is_err());
        let twice = list_of(&[(UPDATE, ZIP), (b"another build", ZIP)]);
        let sig = key.sign(&twice, &sums_name(V));
        assert!(listed_sha256(&twice, &sig, &key.public(), V, ZIP).is_err());
        // A name that only contains the file's is not the file's.
        let longer = list_of(&[(UPDATE, &format!("{ZIP}.old"))]);
        let sig = key.sign(&longer, &sums_name(V));
        assert!(listed_sha256(&longer, &sig, &key.public(), V, ZIP).is_err());
    }
}
