// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The secrets of a folder's sync with a cloud — a WebDAV password, an S3
//! secret key — kept in the system's keychain (ADR 0104 item 14, C.4;
//! ADR 0019 item 2): macOS Keychain, Windows Credential Manager, the
//! Linux Secret Service. Never in the folder, the configuration, a log or
//! the window: the window sends a secret once, when the person types it,
//! and never reads it back (ADR 0026). Behind a trait so that the tests
//! hold theirs in memory and never touch the real keychain.

#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

/// The name the secrets are kept under in the system's store.
const SERVICE: &str = "com.versomd.app";

/// The Credential Manager keeps no secret over 2560 bytes (ADR 0104 item
/// 14): one past a little less is refused whole, with a message, on every
/// system, so that a secret that fits here fits there.
pub(crate) const LONGEST: usize = 2000;

/// Why a secret could not be kept or found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SecretError {
    /// The system has no keychain to keep it in: on Linux, no Secret
    /// Service (GNOME Keyring, KWallet) is running.
    NoKeyring(String),
    /// Too long for the system's store.
    TooLong,
    /// Anything else the store said.
    Failed(String),
}

impl SecretError {
    /// What to tell the person, in English; the window says it in its own
    /// language by the kind.
    pub(crate) fn message(&self) -> String {
        match self {
            Self::NoKeyring(_) => "no keyring: cloud sync keeps its password in the system's keyring, and this computer has none running. Install one (GNOME Keyring or KWallet), sign in to it, and connect again".to_owned(),
            Self::TooLong => format!(
                "the secret is longer than {LONGEST} bytes, which the system's keychain cannot keep"
            ),
            Self::Failed(why) => format!("the system's keychain refused: {why}"),
        }
    }
}

/// A place to keep secrets by account name.
pub(crate) trait Secrets: Send + Sync {
    /// Whether the store can be used at all.
    fn available(&self) -> Result<(), SecretError>;
    fn set(&self, account: &str, secret: &str) -> Result<(), SecretError>;
    fn get(&self, account: &str) -> Result<Option<String>, SecretError>;
    /// Delete; a secret that is not there is deleted already.
    fn delete(&self, account: &str) -> Result<(), SecretError>;
}

/// The system's keychain.
pub(crate) struct Keychain;

fn of(e: &keyring::Error) -> SecretError {
    match e {
        keyring::Error::NoDefaultStore
        | keyring::Error::NoStorageAccess(_)
        | keyring::Error::PlatformFailure(_) => SecretError::NoKeyring(e.to_string()),
        other => SecretError::Failed(other.to_string()),
    }
}

impl Keychain {
    fn entry(account: &str) -> Result<keyring::Entry, SecretError> {
        keyring::Entry::new(SERVICE, account).map_err(|e| of(&e))
    }
}

impl Secrets for Keychain {
    fn available(&self) -> Result<(), SecretError> {
        match keyring::Entry::store_status() {
            Ok(()) => Ok(()),
            Err(e) => Err(of(e)),
        }
    }

    fn set(&self, account: &str, secret: &str) -> Result<(), SecretError> {
        if secret.len() > LONGEST {
            return Err(SecretError::TooLong);
        }
        Self::entry(account)?
            .set_password(secret)
            .map_err(|e| of(&e))
    }

    fn get(&self, account: &str) -> Result<Option<String>, SecretError> {
        match Self::entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(of(&e)),
        }
    }

    fn delete(&self, account: &str) -> Result<(), SecretError> {
        match Self::entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(of(&e)),
        }
    }
}

/// Secrets in memory, for the tests; one that says it has no keyring, for
/// the test of a Linux without a Secret Service.
#[cfg(test)]
#[derive(Default)]
pub(crate) struct Memory {
    held: Mutex<HashMap<String, String>>,
    without_keyring: bool,
}

#[cfg(test)]
impl Memory {
    /// A computer with no keyring running.
    pub(crate) fn without_keyring() -> Self {
        Self {
            without_keyring: true,
            ..Self::default()
        }
    }

    /// What is held, for a test to look at.
    pub(crate) fn accounts(&self) -> Vec<String> {
        let mut out: Vec<String> = crate::lock(&self.held).keys().cloned().collect();
        out.sort();
        out
    }
}

#[cfg(test)]
impl Secrets for Memory {
    fn available(&self) -> Result<(), SecretError> {
        if self.without_keyring {
            Err(SecretError::NoKeyring("no Secret Service".to_owned()))
        } else {
            Ok(())
        }
    }

    fn set(&self, account: &str, secret: &str) -> Result<(), SecretError> {
        self.available()?;
        if secret.len() > LONGEST {
            return Err(SecretError::TooLong);
        }
        crate::lock(&self.held).insert(account.to_owned(), secret.to_owned());
        Ok(())
    }

    fn get(&self, account: &str) -> Result<Option<String>, SecretError> {
        self.available()?;
        Ok(crate::lock(&self.held).get(account).cloned())
    }

    fn delete(&self, account: &str) -> Result<(), SecretError> {
        crate::lock(&self.held).remove(account);
        Ok(())
    }
}
