// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! AWS Signature Version 4 for S3 (ADR 0104 item 6), written out because
//! the whole of it is a hash chain over `sha2`, already in the tree, and
//! a signing crate would bring a client with it. Tested against Amazon's
//! published example (the "GET Object" request of the documentation).

use sha2::{Digest, Sha256};

use crate::{hex, pct_component};

/// HMAC-SHA256 (RFC 2104) over `sha2`.
#[must_use]
pub fn hmac(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut k = [0_u8; BLOCK];
    if key.len() > BLOCK {
        k[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut inner = Sha256::new();
    inner.update(k.map(|b| b ^ 0x36));
    inner.update(message);
    let mut outer = Sha256::new();
    outer.update(k.map(|b| b ^ 0x5c));
    outer.update(inner.finalize());
    outer.finalize().into()
}

/// The credentials a request is signed with, and where they are valid.
pub struct Signer<'a> {
    pub access: &'a str,
    pub secret: &'a str,
    pub region: &'a str,
}

impl Signer<'_> {
    /// The `Authorization` header's value for a request: `path` as it is
    /// sent (percent-encoded), `query` as pairs not yet encoded, `headers`
    /// every header to sign (names lower case; `host`, `x-amz-date` and
    /// `x-amz-content-sha256` among them), `payload` the body's SHA-256 in
    /// hex, `stamp` the request's time as `YYYYMMDDTHHMMSSZ`.
    #[must_use]
    pub fn authorization(
        &self,
        method: &str,
        path: &str,
        query: &[(String, String)],
        headers: &[(String, String)],
        payload: &str,
        stamp: &str,
    ) -> String {
        let mut query: Vec<(String, String)> = query
            .iter()
            .map(|(k, v)| (pct_component(k), pct_component(v)))
            .collect();
        query.sort();
        let query = query
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("&");
        let mut headers: Vec<(String, String)> = headers
            .iter()
            .map(|(k, v)| {
                (
                    k.to_lowercase(),
                    v.split_whitespace().collect::<Vec<_>>().join(" "),
                )
            })
            .collect();
        headers.sort();
        let canonical_headers: String = headers.iter().map(|(k, v)| format!("{k}:{v}\n")).collect();
        let signed = headers
            .iter()
            .map(|(k, _)| k.as_str())
            .collect::<Vec<_>>()
            .join(";");
        let canonical =
            format!("{method}\n{path}\n{query}\n{canonical_headers}\n{signed}\n{payload}");
        let date = &stamp[..8];
        let scope = format!("{date}/{}/s3/aws4_request", self.region);
        let to_sign = format!(
            "AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{}",
            hex(&Sha256::digest(canonical.as_bytes()))
        );
        let mut key = hmac(format!("AWS4{}", self.secret).as_bytes(), date.as_bytes()).to_vec();
        for part in [self.region.as_bytes(), b"s3", b"aws4_request"] {
            key = hmac(&key, part).to_vec();
        }
        let signature = hex(&hmac(&key, to_sign.as_bytes()));
        format!(
            "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed}, Signature={signature}",
            self.access
        )
    }
}

/// The time now as SigV4 writes it: `YYYYMMDDTHHMMSSZ`.
#[must_use]
pub fn stamp_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(0));
    stamp_of(secs)
}

/// Seconds since the epoch as `YYYYMMDDTHHMMSSZ` (UTC), by the civil-date
/// algorithm of Howard Hinnant.
#[must_use]
pub fn stamp_of(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}{m:02}{d:02}T{:02}{:02}{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmac_matches_rfc_4231_case_2() {
        let mac = hmac(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            hex(&mac),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn the_stamp_is_the_civil_date() {
        assert_eq!(stamp_of(0), "19700101T000000Z");
        assert_eq!(stamp_of(1_369_353_600), "20130524T000000Z");
        assert_eq!(stamp_of(1_709_164_800), "20240229T000000Z");
        assert_eq!(stamp_of(1_709_164_800 + 86_399), "20240229T235959Z");
    }

    /// Amazon's documented "GET Object" example (Signature Calculations
    /// for the Authorization Header): the signature it ends with.
    #[test]
    fn amazons_get_object_example_signs_as_documented() {
        let signer = Signer {
            access: "AKIAIOSFODNN7EXAMPLE",
            secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            region: "us-east-1",
        };
        let empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let h = |k: &str, v: &str| (k.to_owned(), v.to_owned());
        let auth = signer.authorization(
            "GET",
            "/test.txt",
            &[],
            &[
                h("host", "examplebucket.s3.amazonaws.com"),
                h("range", "bytes=0-9"),
                h("x-amz-content-sha256", empty),
                h("x-amz-date", "20130524T000000Z"),
            ],
            empty,
            "20130524T000000Z",
        );
        assert_eq!(
            auth,
            "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, \
SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, \
Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
        );
    }

    /// Amazon's documented "GET Bucket (List Objects)" example: a query
    /// string, signed and sorted.
    #[test]
    fn amazons_list_objects_example_signs_as_documented() {
        let signer = Signer {
            access: "AKIAIOSFODNN7EXAMPLE",
            secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            region: "us-east-1",
        };
        let empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let h = |k: &str, v: &str| (k.to_owned(), v.to_owned());
        let auth = signer.authorization(
            "GET",
            "/",
            &[h("max-keys", "2"), h("prefix", "J")],
            &[
                h("host", "examplebucket.s3.amazonaws.com"),
                h("x-amz-content-sha256", empty),
                h("x-amz-date", "20130524T000000Z"),
            ],
            empty,
            "20130524T000000Z",
        );
        assert!(
            auth.ends_with(
                "Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"
            ),
            "{auth}"
        );
    }
}
