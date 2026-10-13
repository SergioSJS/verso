// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The server's configuration, by environment only, the same in the three
//! forms of installation (ADR 0075 item 6): a value given as `NAME_FILE`
//! is read from that file (Docker and Kubernetes secrets).

use std::net::SocketAddr;
use std::path::PathBuf;

/// Where the server listens when nothing says otherwise: loopback only,
/// so that a server started by hand is never reachable from the network
/// before its owner chose to put it there (ADR 0073 item 6).
pub const DEFAULT_LISTEN: &str = "127.0.0.1:7340";

#[derive(Debug, Clone)]
pub struct Config {
    /// The address and port it listens on (`VERSO_LISTEN`).
    pub listen: SocketAddr,
    /// The address people use (`VERSO_PUBLIC_URL`): the passkeys' origin,
    /// the `Origin` check, the links in invitations (ADR 0074).
    pub public_url: Option<String>,
    /// The accounts, the sessions, the audit log, the indexes
    /// (`VERSO_DATA_DIR`, a local disk; ADR 0075 item 3).
    pub data_dir: PathBuf,
    /// The root under which the folders of notes live
    /// (`VERSO_FOLDERS_DIR`, which may be a NAS).
    pub folders_dir: PathBuf,
    /// The window's files (`VERSO_UI_DIR`): the build of `app/ui`.
    pub ui_dir: PathBuf,
    /// The window served to a browser (`verso serve --web`, ADR 0073 item
    /// 2); without it, the contract and the API only, for the desktop app.
    pub web: bool,
    /// The first admin, read on the first start only (ADR 0074 item 1).
    pub admin: Option<(String, String)>,
    /// The reverse proxy whose forwarded headers are believed
    /// (`VERSO_TRUSTED_PROXY`, ADR 0073 item 6).
    pub trusted_proxy: Option<std::net::IpAddr>,
    /// The certificate and key the server serves TLS with itself
    /// (`VERSO_TLS_CERT_FILE`, `VERSO_TLS_KEY_FILE`; the maintainer's answer
    /// F of 2026-10-09).
    pub tls: Option<(PathBuf, PathBuf)>,
    /// Whether the server looks for a new version for the admin
    /// (`VERSO_UPDATE_CHECK=off` turns it off; answer E of 2026-10-09).
    pub update_check: bool,
    /// A token that reads the release feed while the repository is private
    /// (`VERSO_UPDATE_TOKEN`).
    pub update_token: Option<String>,
    /// The host's mail server (`VERSO_SMTP_URL`, ADR 0074 item 2) and the
    /// sender's address (`VERSO_MAIL_FROM`).
    pub smtp_url: Option<String>,
    pub mail_from: Option<String>,
    /// The quota a new folder gets, in bytes (`VERSO_FOLDER_QUOTA`, ADR
    /// 0077 item 5): none when unset; the console changes it per folder.
    pub folder_quota: Option<i64>,
    /// How many days a folder's bin keeps deleted files unless the console
    /// says otherwise (`VERSO_TRASH_DAYS`, ADR 0080 item 3): 30 when unset,
    /// 0 for ever.
    pub trash_days: u32,
    /// How many days the audit log keeps a row (`VERSO_AUDIT_DAYS`, ADR
    /// 0083 item 10): 365 when unset, 0 for ever. Swept once a day by time
    /// alone (`crate::audit`); nothing else deletes a row.
    pub audit_days: u32,
}

/// The audit log's retention when `VERSO_AUDIT_DAYS` is unset (ADR 0083
/// item 10, decided 2026-10-13).
pub const DEFAULT_AUDIT_DAYS: u32 = 365;

/// A number of days, 0 for never, at most a century — `VERSO_TRASH_DAYS`
/// and `VERSO_AUDIT_DAYS` alike; `default` when unset.
fn days(env: &dyn Env, name: &str, default: u32) -> Result<u32, ConfigError> {
    value(env, name)?
        .map(|v| {
            v.trim()
                .parse::<u32>()
                .ok()
                .filter(|d| *d <= 36_500)
                .ok_or_else(|| {
                    ConfigError(format!("{name}: a number of days, 0 for never, not {v}"))
                })
        })
        .transpose()
        .map(|d| d.unwrap_or(default))
}

/// A size as a person writes it: bytes, or a number with KB, MB, GB or TB
/// (powers of 1024, as the console shows them); `None` when it is none.
#[must_use]
pub fn size(text: &str) -> Option<i64> {
    let t = text.trim().to_ascii_uppercase();
    let (number, unit) = t
        .find(|c: char| c.is_ascii_alphabetic())
        .map_or((t.as_str(), ""), |at| (t[..at].trim(), t[at..].trim()));
    let factor: i64 = match unit {
        "" | "B" => 1,
        "K" | "KB" => 1 << 10,
        "M" | "MB" => 1 << 20,
        "G" | "GB" => 1 << 30,
        "T" | "TB" => 1 << 40,
        _ => return None,
    };
    let value: f64 = number.replace(',', ".").parse().ok()?;
    if !value.is_finite() || value <= 0.0 {
        return None;
    }
    Some((value * factor as f64).round() as i64)
}

/// What went wrong reading the environment, naming the variable.
#[derive(Debug)]
pub struct ConfigError(pub String);

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// The variables, from wherever they come: the process's environment, or a
/// test's own table.
pub trait Env {
    fn var(&self, name: &str) -> Option<String>;
}

pub struct ProcessEnv;

impl Env for ProcessEnv {
    fn var(&self, name: &str) -> Option<String> {
        std::env::var(name).ok().filter(|v| !v.is_empty())
    }
}

/// `NAME`, or the contents of the file `NAME_FILE` names, trimmed of the
/// line end a secret file usually carries. Both set is an error.
fn value(env: &dyn Env, name: &str) -> Result<Option<String>, ConfigError> {
    let direct = env.var(name);
    let file_var = format!("{name}_FILE");
    match (direct, env.var(&file_var)) {
        (Some(_), Some(_)) => Err(ConfigError(format!(
            "{name} and {file_var} are both set: give one"
        ))),
        (Some(v), None) => Ok(Some(v)),
        (None, Some(path)) => crate::data::read_secret(&PathBuf::from(&path))
            .map(|s| Some(s.trim_end_matches(['\n', '\r']).to_owned()))
            .map_err(|e| ConfigError(format!("{file_var}: {e}"))),
        (None, None) => Ok(None),
    }
}

/// The least length of the first admin's password (ADR 0074 item 1).
pub const MIN_PASSWORD: usize = 12;

impl Config {
    /// Read the configuration; `defaults` gives the directories when their
    /// variables are not set (the image sets them; a binary run by hand
    /// uses the user's data directory).
    pub fn from_env(env: &dyn Env, defaults: &Defaults) -> Result<Self, ConfigError> {
        let listen = value(env, "VERSO_LISTEN")?
            .unwrap_or_else(|| DEFAULT_LISTEN.to_owned())
            .parse()
            .map_err(|e| ConfigError(format!("VERSO_LISTEN: {e}")))?;
        let public_url =
            value(env, "VERSO_PUBLIC_URL")?.map(|u| u.trim_end_matches('/').to_owned());
        if let Some(u) = &public_url
            && !(u.starts_with("https://") || u.starts_with("http://"))
        {
            return Err(ConfigError(format!(
                "VERSO_PUBLIC_URL: not an http(s) address: {u}"
            )));
        }
        let email = value(env, "VERSO_ADMIN_EMAIL")?;
        let password = value(env, "VERSO_ADMIN_PASSWORD")?;
        let admin = match (email, password) {
            (Some(e), Some(p)) => {
                if p.chars().count() < MIN_PASSWORD {
                    return Err(ConfigError(format!(
                        "VERSO_ADMIN_PASSWORD: at least {MIN_PASSWORD} characters"
                    )));
                }
                Some((e, p))
            }
            (Some(_), None) => {
                return Err(ConfigError(
                    "VERSO_ADMIN_EMAIL is set without VERSO_ADMIN_PASSWORD".to_owned(),
                ));
            }
            (None, Some(_)) => {
                return Err(ConfigError(
                    "VERSO_ADMIN_PASSWORD is set without VERSO_ADMIN_EMAIL".to_owned(),
                ));
            }
            (None, None) => None,
        };
        let trusted_proxy = value(env, "VERSO_TRUSTED_PROXY")?
            .map(|a| {
                a.parse()
                    .map_err(|e| ConfigError(format!("VERSO_TRUSTED_PROXY: {e}")))
            })
            .transpose()?;
        let tls = match (
            value(env, "VERSO_TLS_CERT_FILE")?,
            value(env, "VERSO_TLS_KEY_FILE")?,
        ) {
            (Some(c), Some(k)) => Some((PathBuf::from(c), PathBuf::from(k))),
            (None, None) => None,
            _ => {
                return Err(ConfigError(
                    "VERSO_TLS_CERT_FILE and VERSO_TLS_KEY_FILE go together".to_owned(),
                ));
            }
        };
        let update_check = !value(env, "VERSO_UPDATE_CHECK")?.is_some_and(|v| {
            matches!(
                v.to_ascii_lowercase().as_str(),
                "off" | "0" | "false" | "no"
            )
        });
        Ok(Self {
            listen,
            public_url,
            data_dir: value(env, "VERSO_DATA_DIR")?
                .map_or_else(|| defaults.data_dir.clone(), PathBuf::from),
            folders_dir: value(env, "VERSO_FOLDERS_DIR")?
                .map_or_else(|| defaults.folders_dir.clone(), PathBuf::from),
            web: false,
            ui_dir: value(env, "VERSO_UI_DIR")?
                .map_or_else(|| defaults.ui_dir.clone(), PathBuf::from),
            admin,
            trusted_proxy,
            tls,
            update_check,
            update_token: value(env, "VERSO_UPDATE_TOKEN")?,
            smtp_url: value(env, "VERSO_SMTP_URL")?,
            mail_from: value(env, "VERSO_MAIL_FROM")?,
            folder_quota: value(env, "VERSO_FOLDER_QUOTA")?
                .map(|v| {
                    size(&v).ok_or_else(|| {
                        ConfigError(format!(
                            "VERSO_FOLDER_QUOTA: a size such as 500MB, 10GB or 1073741824, not {v}"
                        ))
                    })
                })
                .transpose()?,
            trash_days: days(env, "VERSO_TRASH_DAYS", verso_core::trash::DEFAULT_DAYS)?,
            audit_days: days(env, "VERSO_AUDIT_DAYS", DEFAULT_AUDIT_DAYS)?,
        })
    }

    /// Whether the server is reached only from this machine: loopback, no
    /// public address given.
    #[must_use]
    pub fn loopback_only(&self) -> bool {
        self.listen.ip().is_loopback()
    }
}

/// The directories when no variable names them.
pub struct Defaults {
    pub data_dir: PathBuf,
    pub folders_dir: PathBuf,
    pub ui_dir: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct Table(HashMap<&'static str, String>);

    impl Env for Table {
        fn var(&self, name: &str) -> Option<String> {
            self.0.get(name).cloned()
        }
    }

    fn defaults() -> Defaults {
        Defaults {
            data_dir: "/d".into(),
            folders_dir: "/f".into(),
            ui_dir: "/u".into(),
        }
    }

    fn read(pairs: &[(&'static str, &str)]) -> Result<Config, ConfigError> {
        let table = Table(pairs.iter().map(|(k, v)| (*k, (*v).to_owned())).collect());
        Config::from_env(&table, &defaults())
    }

    #[test]
    fn nothing_set_is_loopback_with_the_defaults() {
        let c = read(&[]).unwrap();
        assert!(c.loopback_only());
        assert_eq!(c.data_dir, PathBuf::from("/d"));
        assert!(c.admin.is_none());
        assert!(c.update_check);
    }

    #[test]
    fn the_admin_needs_both_variables_and_a_long_password() {
        assert!(read(&[("VERSO_ADMIN_EMAIL", "a@b.c")]).is_err());
        assert!(read(&[("VERSO_ADMIN_PASSWORD", "123456789012")]).is_err());
        let short = read(&[
            ("VERSO_ADMIN_EMAIL", "a@b.c"),
            ("VERSO_ADMIN_PASSWORD", "curta"),
        ]);
        assert!(short.unwrap_err().0.contains("VERSO_ADMIN_PASSWORD"));
        let ok = read(&[
            ("VERSO_ADMIN_EMAIL", "a@b.c"),
            ("VERSO_ADMIN_PASSWORD", "uma senha longa"),
        ])
        .unwrap();
        assert_eq!(ok.admin.unwrap().0, "a@b.c");
    }

    #[test]
    fn a_secret_comes_from_a_file_and_never_from_both() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("senha");
        crate::data::write_for_tests(&file, "uma senha longa\n");
        let file = file.to_str().unwrap();
        let ok = read(&[
            ("VERSO_ADMIN_EMAIL", "a@b.c"),
            ("VERSO_ADMIN_PASSWORD_FILE", file),
        ])
        .unwrap();
        assert_eq!(ok.admin.unwrap().1, "uma senha longa");
        assert!(
            read(&[
                ("VERSO_ADMIN_EMAIL", "a@b.c"),
                ("VERSO_ADMIN_PASSWORD", "uma senha longa"),
                ("VERSO_ADMIN_PASSWORD_FILE", file),
            ])
            .is_err()
        );
    }

    #[test]
    fn the_audit_log_keeps_a_year_unless_told_and_is_bounded_as_the_trash() {
        assert_eq!(read(&[]).unwrap().audit_days, 365);
        assert_eq!(read(&[("VERSO_AUDIT_DAYS", "0")]).unwrap().audit_days, 0);
        assert_eq!(
            read(&[("VERSO_AUDIT_DAYS", " 90 ")]).unwrap().audit_days,
            90
        );
        for bad in ["-1", "36501", "um ano", "1.5"] {
            let e = read(&[("VERSO_AUDIT_DAYS", bad)]).unwrap_err().0;
            assert!(e.starts_with("VERSO_AUDIT_DAYS:"), "{e}");
            assert!(read(&[("VERSO_TRASH_DAYS", bad)]).is_err());
        }
        assert_eq!(read(&[]).unwrap().trash_days, 30);
    }

    #[test]
    fn update_check_and_tls_and_addresses() {
        assert!(!read(&[("VERSO_UPDATE_CHECK", "off")]).unwrap().update_check);
        assert!(read(&[("VERSO_TLS_CERT_FILE", "/c")]).is_err());
        assert!(read(&[("VERSO_PUBLIC_URL", "ftp://x")]).is_err());
        let c = read(&[
            ("VERSO_LISTEN", "0.0.0.0:80"),
            ("VERSO_PUBLIC_URL", "https://notas.casa/"),
        ])
        .unwrap();
        assert!(!c.loopback_only());
        assert_eq!(c.public_url.as_deref(), Some("https://notas.casa"));
    }
}
