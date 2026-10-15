// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the pairing QR carries, and nothing else (ADR 0096 item 7): the
//! address and port, the one-time token, the certificate's fingerprint
//! (for a native client to pin; a browser ignores it) and the contract's
//! hash. The token and the rest travel in the URL's **fragment**, which a
//! browser never sends in a request: it reaches no proxy's log and no
//! `Referer`. No folder path, no account, no name of the person, no
//! long-lived secret.
//!
//! `https://<address>:<port>/pair#t=<token>&fp=<fingerprint>&c=<contract>`

use qrcode::{Color, EcLevel, QrCode};

/// The four things a QR carries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Payload {
    /// `address:port` as a URL writes it (an IPv6 address in brackets).
    pub authority: String,
    pub token: String,
    /// SHA-256 of the certificate, hexadecimal.
    pub fingerprint: String,
    /// The contract version's hash (`crate::contract_version`).
    pub contract: String,
}

/// The URL the QR encodes.
#[must_use]
pub fn url(p: &Payload) -> String {
    format!(
        "https://{}/pair#t={}&fp={}&c={}",
        p.authority, p.token, p.fingerprint, p.contract
    )
}

/// The URL read back into its fields; `None` when it has any other: a
/// query, another fragment key, a path that is not `/pair`.
#[must_use]
pub fn parse(text: &str) -> Option<Payload> {
    let rest = text.strip_prefix("https://")?;
    let (authority, rest) = rest.split_once('/')?;
    let (path, fragment) = rest.split_once('#')?;
    if path != "pair" || authority.is_empty() || authority.contains(['@', '?', '#', ' ']) {
        return None;
    }
    let mut token = None;
    let mut fingerprint = None;
    let mut contract = None;
    let mut keys = 0;
    for pair in fragment.split('&') {
        let (key, value) = pair.split_once('=')?;
        keys += 1;
        let slot = match key {
            "t" => &mut token,
            "fp" => &mut fingerprint,
            "c" => &mut contract,
            _ => return None,
        };
        if slot.replace(value.to_owned()).is_some() {
            return None;
        }
    }
    (keys == 3).then_some(())?;
    Some(Payload {
        authority: authority.to_owned(),
        token: token?,
        fingerprint: fingerprint?,
        contract: contract?,
    })
}

/// The QR as rows of `1` (dark) and `0`, a quiet zone of four modules
/// around it included, for the window to draw as an SVG it builds itself —
/// no markup crosses from here.
pub fn matrix(text: &str) -> Result<Vec<String>, String> {
    // Medium error correction: it prints and is scanned off a screen, and
    // a denser symbol is harder for a phone's camera across a desk.
    let code = QrCode::with_error_correction_level(text.as_bytes(), EcLevel::M)
        .map_err(|e| e.to_string())?;
    let n = code.width();
    let colors = code.to_colors();
    let quiet = 4;
    let side = n + 2 * quiet;
    let mut rows = Vec::with_capacity(side);
    for y in 0..side {
        let mut row = String::with_capacity(side);
        for x in 0..side {
            let dark = x >= quiet
                && y >= quiet
                && x < quiet + n
                && y < quiet + n
                && colors[(y - quiet) * n + (x - quiet)] == Color::Dark;
            row.push(if dark { '1' } else { '0' });
        }
        rows.push(row);
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload() -> Payload {
        Payload {
            authority: "192.168.1.20:51234".to_owned(),
            token: "t0k3n_-abc".to_owned(),
            fingerprint: "ab".repeat(32),
            contract: "0123456789abcdef".to_owned(),
        }
    }

    /// Item 7's guardrail: the QR carries the address and port, the token,
    /// the fingerprint and the contract hash, and exactly that. The text
    /// read back has those four fields; the URL has no query, and its
    /// fragment has three keys and no other.
    #[test]
    fn the_qr_carries_only_the_fields_of_item_7() {
        let p = payload();
        let text = url(&p);
        assert_eq!(
            text,
            format!(
                "https://192.168.1.20:51234/pair#t=t0k3n_-abc&fp={}&c=0123456789abcdef",
                "ab".repeat(32)
            )
        );
        assert!(!text.contains('?'), "a query reaches the server's log");
        assert_eq!(parse(&text), Some(p));
        // Anything more is not a pairing QR.
        for more in [
            format!("{text}&folder=/Users/me/Notes"),
            format!("{text}&name=Sergio"),
            format!("{text}&t=again"),
            text.replacen("/pair#", "/pair?x=1#", 1),
            text.replacen("/pair#", "/other#", 1),
            text.replacen("https://", "https://me@", 1),
            text.replace("&c=0123456789abcdef", ""),
        ] {
            assert_eq!(parse(&more), None, "{more}");
        }
    }

    /// The matrix is what a QR encoder makes of that text: square, with a
    /// quiet zone, the finder pattern in the corner, and the same text
    /// always the same symbol.
    #[test]
    fn the_matrix_is_the_encoding_of_the_url() {
        let text = url(&payload());
        let m = matrix(&text).unwrap();
        let side = m.len();
        assert!(side >= 29 + 8, "version 3 or more: {side}");
        assert!(m.iter().all(|r| r.len() == side), "square");
        assert!(m[..4].iter().all(|r| !r.contains('1')), "quiet zone above");
        assert!(m.iter().all(|r| r[..4] == *"0000"), "quiet zone left");
        // The finder pattern: a 7-wide dark ring at the top left.
        assert_eq!(&m[4][4..11], "1111111");
        assert_eq!(&m[5][4..11], "1000001");
        assert_eq!(&m[7][4..11], "1011101");
        assert_eq!(m, matrix(&text).unwrap());
        assert_ne!(m, matrix(&text.replace("51234", "51235")).unwrap());
    }

    #[test]
    fn an_ipv6_address_is_in_brackets_in_the_url() {
        let mut p = payload();
        p.authority = "[fd00::5]:51234".to_owned();
        assert_eq!(parse(&url(&p)), Some(p));
    }
}
