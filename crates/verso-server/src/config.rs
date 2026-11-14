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
    /// The window's files from memory in place of `ui_dir`: a phone's app,
    /// which carries them inside itself (ADR 0118 item 7). `None` for a
    /// server.
    pub ui_files: Option<crate::ui_files::UiFiles>,
    /// The window served to a browser (`verso serve --web`, ADR 0073 item
    /// 2); without it, the contract and the API only, for the desktop app.
    pub web: bool,
    /// The first admin, read on the first start only (ADR 0074 item 1).
    pub admin: Option<(String, String)>,
    /// The reverse proxies whose forwarded headers are believed
    /// (`VERSO_TRUSTED_PROXY`, ADR 0073 item 6): addresses and CIDRs,
    /// separated by commas (ADR 0083 item 5); empty when unset.
    pub trusted_proxy: crate::proxy::Proxies,
    /// The certificate and key the server serves TLS with itself
    /// (`VERSO_TLS_CERT_FILE`, `VERSO_TLS_KEY_FILE`; the maintainer's answer
    /// F of 2026-10-09).
    pub tls: Option<(PathBuf, PathBuf)>,
    /// Whether the server looks for a new version for the admin
    /// (`VERSO_UPDATE_CHECK=off` turns it off; answer E of 2026-10-09).
    pub update_check: bool,
    /// Whether the server announces itself on the local network by mDNS
    /// when it listens beyond loopback (`VERSO_ANNOUNCE=off` turns it
    /// off; ADR 0097).
    pub announce: bool,
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
    /// The most a folder's bin may hold, in bytes (`VERSO_TRASH_MAX`, ADR
    /// 0080, decided 2026-10-31): 1 GiB when unset, `0` or `none` for no
    /// cap. Past it the oldest entries go first.
    pub trash_max: Option<u64>,
    /// How many days a folder's version history keeps versions unless the
    /// console says otherwise (`VERSO_HISTORY_DAYS`, ADR 0091 item 3): 365
    /// when unset, 0 for no limit.
    pub history_days: u32,
    /// How many days the audit log keeps a row (`VERSO_AUDIT_DAYS`, ADR
    /// 0083 item 10): 365 when unset, 0 for ever. Swept once a day by time
    /// alone (`crate::audit`); nothing else deletes a row.
    pub audit_days: u32,
    /// The UniVerso's own Cloudflare link (ADR 0117 D4 item 2, decided
    /// 2026-11-13): `VERSO_TUNNEL`, `VERSO_TUNNEL_HOSTNAME`,
    /// `VERSO_TUNNEL_TOKEN` and `VERSO_TUNNEL_PORT`.
    pub tunnel: Tunnel,
}

/// The link at the start (`VERSO_TUNNEL=off|quick|own`, off when unset).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TunnelAtStart {
    #[default]
    Off,
    /// A quick link, new at each start, twelve hours with *Extend*.
    Quick,
    /// The own address: `VERSO_TUNNEL_HOSTNAME` by `VERSO_TUNNEL_TOKEN`.
    Own,
}

/// The UniVerso's own link, as the environment gives it (ADR 0117 D4 item
/// 2). The console turns it on and off as well, for this run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tunnel {
    pub at_start: TunnelAtStart,
    /// The own address's hostname (`VERSO_TUNNEL_HOSTNAME`), the one
    /// Cloudflare's dashboard routes to the tunnel.
    pub hostname: Option<String>,
    /// The tunnel's token made in Cloudflare's dashboard
    /// (`VERSO_TUNNEL_TOKEN`, or the file `VERSO_TUNNEL_TOKEN_FILE`
    /// names): handed to `cloudflared` in its environment, never logged,
    /// shown in the console as set or not.
    pub token: Option<String>,
    /// The loopback port the link listens on for an own address
    /// (`VERSO_TUNNEL_PORT`, [`DEFAULT_TUNNEL_PORT`] when unset): the
    /// service the dashboard names, `http://localhost:<port>`. A quick
    /// link takes a port the system picks.
    pub port: u16,
}

/// The own address's loopback port when `VERSO_TUNNEL_PORT` is unset:
/// beside the server's 7340. `[OPEN]` for the maintainer (R5).
pub const DEFAULT_TUNNEL_PORT: u16 = 7341;

impl Default for Tunnel {
    fn default() -> Self {
        Self {
            at_start: TunnelAtStart::Off,
            hostname: None,
            token: None,
            port: DEFAULT_TUNNEL_PORT,
        }
    }
}

/// `VERSO_TUNNEL`, `VERSO_TUNNEL_HOSTNAME`, `VERSO_TUNNEL_TOKEN[_FILE]`,
/// `VERSO_TUNNEL_PORT`: each checked here, so that a server that cannot
/// start its link says so at its start, in words, naming the variable.
fn tunnel(env: &dyn Env) -> Result<Tunnel, ConfigError> {
    let at_start = match value(env, "VERSO_TUNNEL")?
        .map(|v| v.trim().to_ascii_lowercase())
        .as_deref()
    {
        None | Some("" | "off" | "0" | "false" | "no") => TunnelAtStart::Off,
        Some("quick") => TunnelAtStart::Quick,
        Some("own") => TunnelAtStart::Own,
        Some(other) => {
            return Err(ConfigError(format!(
                "VERSO_TUNNEL: off, quick or own, not {other}"
            )));
        }
    };
    let hostname = value(env, "VERSO_TUNNEL_HOSTNAME")?
        .map(|h| h.trim().trim_end_matches('.').to_ascii_lowercase());
    if let Some(h) = &hostname
        && !verso_tunnel::named::valid_hostname(h)
    {
        return Err(ConfigError(format!(
            "VERSO_TUNNEL_HOSTNAME: a hostname such as mesa.example.com, not {h}"
        )));
    }
    let token = value(env, "VERSO_TUNNEL_TOKEN")?.map(|t| t.trim().to_owned());
    if token
        .as_deref()
        .is_some_and(|t| !verso_tunnel::named::valid_token(t))
    {
        // The token itself is never repeated in an error.
        return Err(ConfigError(
            "VERSO_TUNNEL_TOKEN: not a tunnel's token (the long word Cloudflare's dashboard shows after --token)".to_owned(),
        ));
    }
    let port = value(env, "VERSO_TUNNEL_PORT")?
        .map(|p| {
            p.trim()
                .parse::<u16>()
                .ok()
                .filter(|p| *p != 0)
                .ok_or_else(|| ConfigError(format!("VERSO_TUNNEL_PORT: a port, not {p}")))
        })
        .transpose()?
        .unwrap_or(DEFAULT_TUNNEL_PORT);
    if at_start == TunnelAtStart::Own && (hostname.is_none() || token.is_none()) {
        return Err(ConfigError(
            "VERSO_TUNNEL=own needs VERSO_TUNNEL_HOSTNAME and VERSO_TUNNEL_TOKEN (or VERSO_TUNNEL_TOKEN_FILE): the tunnel made in Cloudflare's dashboard and its token".to_owned(),
        ));
    }
    Ok(Tunnel {
        at_start,
        hostname,
        token,
        port,
    })
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

/// The size cap of a folder's bin when `VERSO_TRASH_MAX` is not set: 1 GiB.
pub const DEFAULT_TRASH_MAX: u64 = 1 << 30;

/// `VERSO_TRASH_MAX`: a size such as 500MB or 2GB; `0` or `none` for no cap.
fn trash_max(env: &dyn Env) -> Result<Option<u64>, ConfigError> {
    let Some(v) = value(env, "VERSO_TRASH_MAX")? else {
        return Ok(Some(DEFAULT_TRASH_MAX));
    };
    let t = v.trim();
    if t == "0" || t.eq_ignore_ascii_case("none") {
        return Ok(None);
    }
    size(t)
        .and_then(|b| u64::try_from(b).ok())
        .map(Some)
        .ok_or_else(|| {
            ConfigError(format!(
                "VERSO_TRASH_MAX: a size such as 500MB or 2GB, 0 or none for no cap, not {v}"
            ))
        })
}

/// A size as a person writes it: bytes, or a number with KB, MB, GB or TB
/// (powers of 1024, as the console shows them); `None` when it is none,
/// or under one byte.
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
    // Under a byte is no size: it would read as a quota of 0.
    let bytes = value * factor as f64;
    (bytes >= 1.0).then(|| bytes.round() as i64)
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
                // As a password chosen in the window is (ADR 0083 item 3).
                if let Some(why) = crate::passwords::weak(&p, &e) {
                    return Err(ConfigError(format!(
                        "VERSO_ADMIN_PASSWORD: {}",
                        why.words()
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
        // Empty or unset: loopback and the private networks are believed,
        // so that nobody has to know a proxy's address; `none` believes no
        // proxy (ADR 0073 item 6, amended 2026-10-16).
        let trusted_proxy = value(env, "VERSO_TRUSTED_PROXY")?
            .filter(|a| !a.trim().is_empty())
            .map(|a| {
                crate::proxy::Proxies::parse(&a)
                    .map_err(|e| ConfigError(format!("VERSO_TRUSTED_PROXY: {e}")))
            })
            .transpose()?
            .unwrap_or_else(crate::proxy::Proxies::private_networks);
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
        let announce = !value(env, "VERSO_ANNOUNCE")?.is_some_and(|v| {
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
            ui_files: None,
            admin,
            trusted_proxy,
            tls,
            update_check,
            announce,
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
            trash_max: trash_max(env)?,
            history_days: days(env, "VERSO_HISTORY_DAYS", verso_core::history::DEFAULT_DAYS)?,
            audit_days: days(env, "VERSO_AUDIT_DAYS", DEFAULT_AUDIT_DAYS)?,
            tunnel: tunnel(env)?,
        })
    }

    /// The configuration of "this app is a server" (ADR 0096): the local
    /// database and indexes in `data_dir`, the window's files in `ui_dir`,
    /// no accounts to make, no mail, no update check, no proxy — the
    /// addresses it listens on are the mode's own (`crate::local`), not
    /// `listen`, which only names the first of them.
    #[must_use]
    pub fn for_local(data_dir: PathBuf, ui_dir: PathBuf, listen: SocketAddr) -> Self {
        Self {
            listen,
            public_url: None,
            folders_dir: data_dir.join("no-folders-here"),
            data_dir,
            ui_dir,
            ui_files: None,
            web: true,
            admin: None,
            trusted_proxy: crate::proxy::Proxies::default(),
            tls: None,
            update_check: false,
            announce: false,
            update_token: None,
            smtp_url: None,
            mail_from: None,
            folder_quota: None,
            trash_days: verso_core::trash::DEFAULT_DAYS,
            trash_max: Some(DEFAULT_TRASH_MAX),
            history_days: verso_core::history::DEFAULT_DAYS,
            audit_days: DEFAULT_AUDIT_DAYS,
            tunnel: Tunnel::default(),
        }
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
        // From the lists attackers try first, or the e-mail itself (ADR
        // 0083 item 3): refused, naming the variable.
        for common in ["password1234", "A.Long.Admin@b.c"] {
            let refused = read(&[
                ("VERSO_ADMIN_EMAIL", "a.long.admin@b.c"),
                ("VERSO_ADMIN_PASSWORD", common),
            ]);
            let why = refused.err().map(|e| e.0).unwrap_or_default();
            assert!(
                why.contains("VERSO_ADMIN_PASSWORD") && why.contains("lists attackers try first"),
                "{common}: {why}"
            );
        }
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

    /// Seen writing the fuzz target `size` (ADR 0083 item 14): a size under
    /// one byte read as a quota of 0 bytes, which refuses every write.
    #[test]
    fn a_size_under_one_byte_is_none() {
        assert_eq!(size("0.3"), None);
        assert_eq!(size("0,4 B"), None);
        assert_eq!(size("1"), Some(1));
        assert_eq!(size("0.5KB"), Some(512));
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
        // The bin's size cap (ADR 0080, 2026-10-31): 1 GiB unless told.
        assert_eq!(read(&[]).unwrap().trash_max, Some(1 << 30));
        assert_eq!(
            read(&[("VERSO_TRASH_MAX", "500MB")]).unwrap().trash_max,
            Some(500 << 20)
        );
        for off in ["0", "none", "None"] {
            assert_eq!(read(&[("VERSO_TRASH_MAX", off)]).unwrap().trash_max, None);
        }
        for bad in ["", "lots", "-5", "0.1", "12XB"] {
            let e = read(&[("VERSO_TRASH_MAX", bad)]).unwrap_err().0;
            assert!(e.starts_with("VERSO_TRASH_MAX:"), "{e}");
        }
        assert_eq!(read(&[]).unwrap().history_days, 365);
        assert_eq!(
            read(&[("VERSO_HISTORY_DAYS", "0")]).unwrap().history_days,
            0
        );
        assert!(read(&[("VERSO_HISTORY_DAYS", "um ano")]).is_err());
    }

    #[test]
    fn update_check_and_tls_and_addresses() {
        assert!(!read(&[("VERSO_UPDATE_CHECK", "off")]).unwrap().update_check);
        assert!(read(&[]).unwrap().announce);
        assert!(!read(&[("VERSO_ANNOUNCE", "off")]).unwrap().announce);
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

    #[test]
    fn the_trusted_proxies_are_a_list_or_one_address() {
        // Unset or empty: this machine and the private networks.
        for env in [&[][..], &[("VERSO_TRUSTED_PROXY", "")][..]] {
            let default = read(env).unwrap().trusted_proxy;
            assert!(default.is_implicit());
            assert!(default.trusts("192.168.1.9".parse().unwrap()));
            assert!(default.trusts("127.0.0.1".parse().unwrap()));
            assert!(!default.trusts("203.0.113.9".parse().unwrap()));
        }
        let none = read(&[("VERSO_TRUSTED_PROXY", "none")]).unwrap();
        assert!(none.trusted_proxy.is_empty());
        let one = read(&[("VERSO_TRUSTED_PROXY", "127.0.0.1")]).unwrap();
        assert!(one.trusted_proxy.trusts("127.0.0.1".parse().unwrap()));
        let many = read(&[(
            "VERSO_TRUSTED_PROXY",
            "127.0.0.1, 10.0.0.0/8, 2001:db8::/32",
        )])
        .unwrap()
        .trusted_proxy;
        assert!(many.trusts("10.1.2.3".parse().unwrap()));
        assert!(many.trusts("2001:db8::9".parse().unwrap()));
        let bad = read(&[("VERSO_TRUSTED_PROXY", "10.0.0.0/40")]).unwrap_err();
        assert!(bad.0.starts_with("VERSO_TRUSTED_PROXY"), "{bad}");
    }

    /// `VERSO_TUNNEL` and its companions (ADR 0117 D4 item 2, decided
    /// 2026-11-13): off unless asked; an own address needs its hostname
    /// and its token; each wrong value refused naming its variable, the
    /// token never repeated.
    #[test]
    fn the_link_is_off_unless_asked_and_an_own_address_needs_its_token() {
        let token = "eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYiLCJ0IjoiNmZmNDJhZTIifQ==";
        let c = read(&[]).unwrap();
        assert_eq!(c.tunnel, Tunnel::default());
        assert_eq!(c.tunnel.port, DEFAULT_TUNNEL_PORT);
        for off in ["off", "OFF", "0", "no", "false"] {
            assert_eq!(
                read(&[("VERSO_TUNNEL", off)]).unwrap().tunnel.at_start,
                TunnelAtStart::Off
            );
        }
        assert_eq!(
            read(&[("VERSO_TUNNEL", "Quick")]).unwrap().tunnel.at_start,
            TunnelAtStart::Quick
        );
        let why = read(&[("VERSO_TUNNEL", "always")]).unwrap_err().0;
        assert!(why.starts_with("VERSO_TUNNEL:"), "{why}");
        let why = read(&[("VERSO_TUNNEL", "own")]).unwrap_err().0;
        assert!(why.contains("VERSO_TUNNEL_HOSTNAME") && why.contains("VERSO_TUNNEL_TOKEN"));
        let own = read(&[
            ("VERSO_TUNNEL", "own"),
            ("VERSO_TUNNEL_HOSTNAME", "Mesa.Example.com."),
            ("VERSO_TUNNEL_TOKEN", token),
            ("VERSO_TUNNEL_PORT", "7399"),
        ])
        .unwrap()
        .tunnel;
        assert_eq!(own.at_start, TunnelAtStart::Own);
        assert_eq!(own.hostname.as_deref(), Some("mesa.example.com"));
        assert_eq!(own.token.as_deref(), Some(token));
        assert_eq!(own.port, 7399);
        assert!(read(&[("VERSO_TUNNEL_HOSTNAME", "localhost")]).is_err());
        assert!(read(&[("VERSO_TUNNEL_PORT", "0")]).is_err());
        assert!(read(&[("VERSO_TUNNEL_PORT", "http")]).is_err());
        let bad = "not a token at all, a sentence";
        let why = read(&[("VERSO_TUNNEL_TOKEN", bad)]).unwrap_err().0;
        assert!(
            why.starts_with("VERSO_TUNNEL_TOKEN") && !why.contains(bad),
            "{why}"
        );
        // From a file, as Docker's secrets give it, its line end trimmed.
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("token");
        crate::data::write_for_tests(&file, &format!("{token}\n"));
        let path = file.display().to_string();
        let from_file = read(&[
            ("VERSO_TUNNEL", "own"),
            ("VERSO_TUNNEL_HOSTNAME", "mesa.example.com"),
            ("VERSO_TUNNEL_TOKEN_FILE", &path),
        ])
        .unwrap()
        .tunnel;
        assert_eq!(from_file.token.as_deref(), Some(token));
    }
}
