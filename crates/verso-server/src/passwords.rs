// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which passwords the server takes (ADR 0074 item 3, ADR 0083 item 3):
//! 12 characters at least, not all spaces, not one of the 10 000 commonest
//! passwords that long (`passwords.txt`, its source and licence in
//! `passwords.LICENSE`), and neither the account's e-mail nor its local
//! part. Checked where a password is chosen — the first admin's setup,
//! an invitation's acceptance, a reset, a change, and
//! `VERSO_ADMIN_PASSWORD` at start — never at sign-in.

use std::collections::HashSet;
use std::sync::OnceLock;

use crate::config::MIN_PASSWORD;

/// The list, lower-cased, one a line; in the binary.
const LIST: &str = include_str!("../passwords.txt");

/// Why a password is refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Weak {
    /// Under [`MIN_PASSWORD`] characters, or only spaces.
    Short,
    /// On the lists attackers try first, or the account's own e-mail.
    Common,
}

/// The words the server answers with, in English; the window says them in
/// the person's language from the code (`weak_password`,
/// `common_password`).
impl Weak {
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            Self::Short => "weak_password",
            Self::Common => "common_password",
        }
    }

    #[must_use]
    pub fn words(self) -> String {
        match self {
            Self::Short => format!("at least {MIN_PASSWORD} characters"),
            Self::Common => "this password is on the lists attackers try first".to_owned(),
        }
    }
}

/// Whether `password` may be the password of the account `email`.
#[must_use]
pub fn weak(password: &str, email: &str) -> Option<Weak> {
    if password.chars().count() < MIN_PASSWORD || password.trim().is_empty() {
        return Some(Weak::Short);
    }
    // Compared as an e-mail is: trimmed, NFC, lower-cased.
    let folded = crate::db::fold_email(password);
    let email = crate::db::fold_email(email);
    let local = email.split('@').next().unwrap_or("");
    if common().contains(folded.as_str())
        || folded == email
        || (!local.is_empty() && folded == local)
    {
        return Some(Weak::Common);
    }
    None
}

/// The list as a set, built the first time it is asked.
fn common() -> &'static HashSet<&'static str> {
    static SET: OnceLock<HashSet<&'static str>> = OnceLock::new();
    SET.get_or_init(|| LIST.lines().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_password_from_the_lists_is_refused_and_a_passphrase_taken() {
        let email = "ana.souza@example.org";
        assert_eq!(weak("password1234", email), Some(Weak::Common));
        assert_eq!(weak("qwertyuiop12", email), Some(Weak::Common));
        assert_eq!(weak("Password1234", email), Some(Weak::Common));
        assert_eq!(weak("lontra azul canta baixinho", email), None);
        assert_eq!(weak("curta", email), Some(Weak::Short));
        assert_eq!(weak("            ", email), Some(Weak::Short));
        // The account's own e-mail, and its local part, whatever the case.
        assert_eq!(weak("Ana.Souza@Example.org", email), Some(Weak::Common));
        assert_eq!(
            weak("ana.souza.da.silva", "Ana.Souza.da.Silva@example.org"),
            Some(Weak::Common)
        );
    }

    #[test]
    fn the_list_is_ten_thousand_lines_and_under_200_kb() {
        assert!(LIST.len() < 200 * 1024, "{} bytes", LIST.len());
        assert_eq!(LIST.lines().count(), 10_000);
        // Lower-cased, and none the floor would refuse already.
        assert!(LIST.lines().all(|l| l == l.to_lowercase()));
        assert!(LIST.lines().all(|l| l.chars().count() >= MIN_PASSWORD));
    }
}
