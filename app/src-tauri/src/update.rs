//! The self-update system and its OS-edge filesystem work: the one
//! module of `verso-app` allowed to use `std::fs` (temporary download
//! files, the application bundle, the Downloads folder — never a file
//! of the open folder; ADR 0026 rule 5, ADR 0029). `scripts/check.sh`
//! greps for `std::fs` outside this file, as it does for
//! `verso-core`'s sidecar.

use tauri::Emitter;
use verso_contract::{ContractError, ErrorKind, InstallResult, UpdateInfo, UpdateProgress};

#[derive(Debug, PartialEq, Eq, Clone)]
pub(crate) struct ParsedVersion {
    pub(crate) major: u64,
    pub(crate) minor: u64,
    pub(crate) patch: u64,
    pub(crate) prerelease: Option<(String, u64)>,
}

impl ParsedVersion {
    pub(crate) fn parse(s: &str) -> Option<Self> {
        let s = s
            .trim()
            .strip_prefix('v')
            .or_else(|| s.trim().strip_prefix('V'))
            .unwrap_or(s.trim());
        let (ver_part, pre_part) = match s.split_once('-') {
            Some((v, p)) => (v, Some(p)),
            None => (s, None),
        };
        let parts: Vec<&str> = ver_part.split('.').collect();
        if parts.is_empty() || parts.len() > 3 {
            return None;
        }
        let major = parts[0].parse().ok()?;
        let minor = if parts.len() > 1 {
            parts[1].parse().ok()?
        } else {
            0
        };
        let patch = if parts.len() > 2 {
            parts[2].parse().ok()?
        } else {
            0
        };
        let prerelease = match pre_part {
            None => None,
            Some(pre) => {
                let (tag, num) = if let Some((t, n)) = pre.split_once('.') {
                    (t.to_string(), n.parse::<u64>().unwrap_or(0))
                } else if let Some((t, n)) = pre.split_once('-') {
                    (t.to_string(), n.parse::<u64>().unwrap_or(0))
                } else {
                    let idx = pre.find(|c: char| c.is_ascii_digit()).unwrap_or(pre.len());
                    let t = &pre[..idx];
                    let n = pre[idx..].parse::<u64>().unwrap_or(0);
                    (t.to_string(), n)
                };
                Some((tag, num))
            }
        };
        Some(Self {
            major,
            minor,
            patch,
            prerelease,
        })
    }

    pub(crate) fn is_newer_than(&self, other: &Self) -> bool {
        if self.major != other.major {
            return self.major > other.major;
        }
        if self.minor != other.minor {
            return self.minor > other.minor;
        }
        if self.patch != other.patch {
            return self.patch > other.patch;
        }
        match (&self.prerelease, &other.prerelease) {
            (None, Some(_)) => true,
            (Some(_), None) => false,
            (None, None) => false,
            (Some((tag1, num1)), Some((tag2, num2))) => {
                if tag1 == tag2 {
                    num1 > num2
                } else {
                    let rank = |t: &str| match t {
                        "alpha" => 1,
                        "beta" => 2,
                        "rc" => 3,
                        _ => 0,
                    };
                    let r1 = rank(tag1);
                    let r2 = rank(tag2);
                    if r1 != r2 { r1 > r2 } else { tag1 > tag2 }
                }
            }
        }
    }
}

pub(crate) fn github_token() -> Option<String> {
    if let Ok(tok) = std::env::var("GITHUB_TOKEN").or_else(|_| std::env::var("GH_TOKEN")) {
        let t = tok.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    // An app the Dock launches inherits none of the shell's PATH, so
    // `gh` is looked for where its installers put it too — without
    // this, a private repository answers 404 and the check says the
    // repository does not exist.
    for gh in ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"] {
        let Ok(output) = std::process::Command::new(gh)
            .args(["auth", "token"])
            .output()
        else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let t = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !t.is_empty() {
            return Some(t);
        }
    }
    None
}

#[derive(serde::Deserialize)]
pub(crate) struct GhRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

#[derive(serde::Deserialize)]
pub(crate) struct GhAsset {
    name: String,
    url: String,
    browser_download_url: String,
    size: u64,
    /// `sha256:<hex>`, computed by GitHub at upload time. The install
    /// refuses an asset without it: nothing is installed unverified.
    digest: Option<String>,
}

/// The one repository updates come from. The API URL is built from this
/// constant and every asset URL is checked against it — the UI never
/// chooses where an update is downloaded from.
pub(crate) const UPDATE_REPO: &str = "SergioSJS/verso";

/// Fetches the releases of `UPDATE_REPO` — the only place updates are
/// looked for.
pub(crate) fn fetch_releases() -> Result<Vec<GhRelease>, ContractError> {
    let current_str = env!("CARGO_PKG_VERSION");
    let client = reqwest::blocking::Client::builder()
        .user_agent(format!("Verso-App/{current_str}"))
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Failed to create HTTP client: {e}"),
        })?;

    let mut req = client
        .get(format!(
            "https://api.github.com/repos/{UPDATE_REPO}/releases"
        ))
        .header("Accept", "application/vnd.github.v3+json");
    if let Some(token) = github_token() {
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    let res = req.send().map_err(|e| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Não foi possível verificar atualizações: {e}"),
    })?;

    if !res.status().is_success() {
        let status = res.status();
        let message = if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
        {
            "Limite de requisições da API do GitHub atingido. Tente novamente mais tarde."
                .to_string()
        } else if status == reqwest::StatusCode::NOT_FOUND {
            // A private repository answers 404 to a request without a
            // credential; the likeliest cause is the missing token, not
            // a repository that vanished.
            "Sem acesso ao repositório de atualizações: entre com `gh auth login` no terminal (o repositório é privado).".to_string()
        } else {
            format!("GitHub API returned HTTP {status}")
        };
        return Err(ContractError {
            kind: ErrorKind::Failed,
            message,
        });
    }

    res.json().map_err(|e| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Failed to parse GitHub releases response: {e}"),
    })
}

/// Checks GitHub releases for a new version of the application.
#[tauri::command]
#[specta::specta]
pub(crate) async fn check_for_updates() -> Result<UpdateInfo, ContractError> {
    tauri::async_runtime::spawn_blocking(check_for_updates_blocking)
        .await
        .map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Update check failed: {e}"),
        })?
}

pub(crate) fn check_for_updates_blocking() -> Result<UpdateInfo, ContractError> {
    let current_str = env!("CARGO_PKG_VERSION");
    let current_ver = ParsedVersion::parse(current_str).ok_or_else(|| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Could not parse current app version: {current_str}"),
    })?;

    let releases = fetch_releases()?;

    let mut best_release: Option<&GhRelease> = None;
    let mut best_ver = current_ver.clone();
    let mut latest_seen_ver = current_ver.clone();
    let mut latest_seen_tag = current_str.to_string();

    for rel in &releases {
        if rel.draft {
            continue;
        }
        if let Some(parsed) = ParsedVersion::parse(&rel.tag_name) {
            if parsed.is_newer_than(&latest_seen_ver) {
                latest_seen_ver = parsed.clone();
                latest_seen_tag = rel.tag_name.trim_start_matches(['v', 'V']).to_string();
            }
            if parsed.is_newer_than(&best_ver) {
                best_ver = parsed;
                best_release = Some(rel);
            }
        }
    }

    if let Some(rel) = best_release {
        let asset = pick_asset(rel);
        let download_url = asset.map(|a| a.browser_download_url.clone());
        let asset_url = asset.map(|a| a.url.clone());
        let asset_name = asset.map(|a| a.name.clone());
        let asset_size = asset.map(|a| a.size as f64);
        let latest_ver_str = rel.tag_name.trim_start_matches(['v', 'V']).to_string();

        Ok(UpdateInfo {
            current_version: current_str.to_string(),
            latest_version: latest_ver_str,
            has_update: true,
            release_name: rel.name.clone().unwrap_or_else(|| rel.tag_name.clone()),
            release_notes: rel.body.clone().unwrap_or_default(),
            download_url,
            asset_url,
            asset_name,
            asset_size,
            published_at: rel.published_at.clone(),
        })
    } else {
        Ok(UpdateInfo {
            current_version: current_str.to_string(),
            latest_version: latest_seen_tag,
            has_update: false,
            release_name: String::new(),
            release_notes: String::new(),
            download_url: None,
            asset_url: None,
            asset_name: None,
            asset_size: None,
            published_at: None,
        })
    }
}

/// Picks the release asset for this platform and architecture.
pub(crate) fn pick_asset(rel: &GhRelease) -> Option<&GhAsset> {
    // Detect current platform + arch to pick the right release asset.
    // These are resolved at compile time — no runtime overhead.
    let os_keywords: &[&str] = if cfg!(target_os = "macos") {
        &["macos", "darwin", "osx"]
    } else if cfg!(target_os = "windows") {
        &["windows", "win"]
    } else {
        &["linux"]
    };

    let arch_keywords: &[&str] = if cfg!(target_arch = "aarch64") {
        &["aarch64", "arm64"]
    } else {
        &["x86_64", "x64", "amd64"]
    };

    // Preferred extension per platform
    let preferred_exts: &[&str] = if cfg!(target_os = "windows") {
        &[".msi", ".exe", ".zip"]
    } else if cfg!(target_os = "macos") {
        &[".dmg", ".zip"]
    } else {
        &[".appimage", ".deb", ".rpm", ".tar.gz", ".zip"]
    };

    // Try to find the best asset: correct OS + arch + preferred extension
    preferred_exts.iter().find_map(|ext| {
        // 1st pass: OS + arch + extension
        rel.assets
            .iter()
            .find(|a| {
                let n = a.name.to_lowercase();
                n.ends_with(ext)
                    && os_keywords.iter().any(|k| n.contains(k))
                    && arch_keywords.iter().any(|k| n.contains(k))
            })
            // 2nd pass: OS + extension (any arch)
            .or_else(|| {
                rel.assets.iter().find(|a| {
                    let n = a.name.to_lowercase();
                    n.ends_with(ext) && os_keywords.iter().any(|k| n.contains(k))
                })
            })
    })
}

/// A download URL is trusted only when it names an asset of
/// `UPDATE_REPO`'s own releases — not merely any GitHub URL. The
/// redirect GitHub answers with is followed by the client internally;
/// what is validated is where the download starts.
pub(crate) fn is_trusted_update_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    let release_download = format!("https://github.com/{UPDATE_REPO}/releases/download/");
    let api_asset = format!("https://api.github.com/repos/{UPDATE_REPO}/releases/assets/");
    let s = parsed.as_str();
    s.starts_with(&release_download) || s.starts_with(&api_asset)
}

/// Whether a release asset is an installer run as downloaded (Windows'
/// NSIS `-setup.exe`, or an `.msi`) rather than an archive to extract.
pub(crate) fn is_installer_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.ends_with(".exe") || n.ends_with(".msi")
}

/// The public half of the key Verso's release files are signed with (ADR
/// 0055, revised 2026-10-09): a minisign key made by `tauri signer
/// generate`, base64 as Tauri writes it. The private half signs each file
/// in the release workflow and lives only as the repository's secret and
/// in the maintainer's keeping; an update whose signature does not verify
/// against this key is not installed.
pub(crate) const UPDATE_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDgzRTdDRkJFQTdGRENFQjUKUldTMXp2Mm52cy9uZzFoQTBZc3B3T2c3d0dkYTk4emtYalZmeDhtOUN0VDVvYlJXNXphYk5IYVQK";

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

/// `verso-app --verify-signature FILE`: whether FILE's `FILE.sig`, beside
/// it, verifies against [`UPDATE_PUBLIC_KEY`] for FILE's name — what the
/// release workflow runs on each file it signed, before anything is
/// published, so a secret that is not the key the app carries stops the
/// release instead of shipping one no app will install.
pub fn verify_release_file(path: &std::path::Path) -> Result<(), String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or("no file name")?;
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut sig_path = path.as_os_str().to_owned();
    sig_path.push(".sig");
    let signature = std::fs::read_to_string(&sig_path).map_err(|e| e.to_string())?;
    verify_signature(&data, &signature, UPDATE_PUBLIC_KEY, &name)
}

pub(crate) struct TempDirCleaner(std::path::PathBuf);
impl Drop for TempDirCleaner {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The most an update download or extraction may hold. An update is a
/// few hundred megabytes at most; past this, the archive is wrong or
/// hostile, and the install stops rather than fill the disk.
pub(crate) const UPDATE_MAX_BYTES: u64 = 1024 * 1024 * 1024; // 1 GiB

/// Downloads and installs an update directly from within the app.
///
/// The command takes no URL: the host asks `UPDATE_REPO`'s API for the
/// releases again, picks the asset for this platform itself, and
/// verifies the download against the `sha256` digest the API reports,
/// before anything is installed. A compromised web view can therefore
/// ask *that* an update run, but never *what* it installs or from where.
#[tauri::command]
#[specta::specta]
pub(crate) async fn download_and_install_update<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<InstallResult, ContractError> {
    tauri::async_runtime::spawn_blocking(move || download_and_install_update_blocking(&app))
        .await
        .map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Update install failed: {e}"),
        })?
}

pub(crate) fn download_and_install_update_blocking<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<InstallResult, ContractError> {
    let current_str = env!("CARGO_PKG_VERSION");
    let current_ver = ParsedVersion::parse(current_str).ok_or_else(|| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Could not parse current app version: {current_str}"),
    })?;

    let releases = fetch_releases()?;
    let mut best_release: Option<&GhRelease> = None;
    let mut best_ver = current_ver;
    for rel in &releases {
        if rel.draft {
            continue;
        }
        if let Some(parsed) = ParsedVersion::parse(&rel.tag_name)
            && parsed.is_newer_than(&best_ver)
        {
            best_ver = parsed;
            best_release = Some(rel);
        }
    }
    let Some(rel) = best_release else {
        return Err(ContractError {
            kind: ErrorKind::Failed,
            message: "Nenhuma atualização disponível.".to_string(),
        });
    };
    let Some(asset) = pick_asset(rel) else {
        return Err(ContractError {
            kind: ErrorKind::Failed,
            message: "A versão nova não tem um pacote para esta plataforma.".to_string(),
        });
    };
    if !is_trusted_update_url(&asset.browser_download_url) || !is_trusted_update_url(&asset.url) {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: "URL de download não permitida.".to_string(),
        });
    }
    // The digest GitHub computed at upload. Without it nothing is
    // installed: the release page in the browser is the fallback.
    let expected_sha256 = asset
        .digest
        .as_deref()
        .and_then(|d| d.strip_prefix("sha256:"))
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| ContractError {
            kind: ErrorKind::Refused,
            message:
                "O pacote não tem checksum publicado; baixe a atualização pela página de releases."
                    .to_string(),
        })?;
    if asset.size > UPDATE_MAX_BYTES {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: "O pacote de atualização é grande demais.".to_string(),
        });
    }
    // The package names its release's version: a file of another release
    // (an older one, genuinely signed) is not installed under this tag.
    let version = rel.tag_name.trim_start_matches('v');
    if version.is_empty() || !asset.name.contains(&format!("-{version}-")) {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: "O pacote não é desta versão; baixe a atualização pela página de releases."
                .to_string(),
        });
    }
    // The package's signature, published beside it: without it nothing is
    // installed (ADR 0055, revised 2026-10-09).
    let sig_name = format!("{}.sig", asset.name);
    let Some(sig_asset) = rel.assets.iter().find(|a| a.name == sig_name) else {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: "O pacote não tem assinatura publicada; baixe a atualização pela página de releases."
                .to_string(),
        });
    };
    if !is_trusted_update_url(&sig_asset.browser_download_url)
        || !is_trusted_update_url(&sig_asset.url)
    {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: "URL de download não permitida.".to_string(),
        });
    }

    let token = github_token();
    let (url, use_auth) = if token.is_some() {
        (asset.url.as_str(), true)
    } else {
        (asset.browser_download_url.as_str(), false)
    };

    let client = reqwest::blocking::Client::builder()
        .user_agent("Verso-App")
        .connect_timeout(std::time::Duration::from_secs(15))
        // The whole download, connect to last byte: a stalled transfer
        // ends instead of hanging the update forever.
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Failed to create HTTP client: {e}"),
        })?;

    let signature = {
        let sig_url = if use_auth {
            sig_asset.url.as_str()
        } else {
            sig_asset.browser_download_url.as_str()
        };
        let mut req = client.get(sig_url);
        if let Some(t) = token.as_deref().filter(|_| use_auth) {
            req = req
                .header("Authorization", format!("Bearer {t}"))
                .header("Accept", "application/octet-stream");
        }
        let res = req.send().map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Erro ao baixar a assinatura: {e}"),
        })?;
        if !res.status().is_success() {
            return Err(ContractError {
                kind: ErrorKind::Failed,
                message: format!("Erro no download da assinatura: HTTP {}", res.status()),
            });
        }
        // At most a few hundred bytes: read no more than 4 KiB and a byte.
        let mut text = String::new();
        {
            use std::io::Read;
            res.take(4097)
                .read_to_string(&mut text)
                .map_err(|e| ContractError {
                    kind: ErrorKind::Failed,
                    message: format!("Erro ao ler a assinatura: {e}"),
                })?;
        }
        if text.len() > 4096 {
            return Err(ContractError {
                kind: ErrorKind::Refused,
                message: "A assinatura publicada não é uma assinatura.".to_string(),
            });
        }
        text
    };

    let mut req = client.get(url);
    if let Some(t) = token.as_deref().filter(|_| use_auth) {
        req = req
            .header("Authorization", format!("Bearer {t}"))
            .header("Accept", "application/octet-stream");
    }

    let mut res = req.send().map_err(|e| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Erro ao baixar atualização: {e}"),
    })?;

    if !res.status().is_success() {
        return Err(ContractError {
            kind: ErrorKind::Failed,
            message: format!("Erro no download: HTTP {}", res.status()),
        });
    }

    let total_bytes = res.content_length();
    let temp_dir = std::env::temp_dir().join(format!("verso-update-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).map_err(|e| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Não foi possível criar pasta temporária: {e}"),
    })?;
    let _cleaner = TempDirCleaner(temp_dir.clone());

    let zip_path = temp_dir.join("update.zip");
    let mut file = std::fs::File::create(&zip_path).map_err(|e| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Não foi possível criar arquivo temporário: {e}"),
    })?;

    let mut buffer = [0u8; 131072]; // 128 KB
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let mut hasher = <sha2::Sha256 as sha2::Digest>::new();

    loop {
        use std::io::Read;
        let bytes_read = res.read(&mut buffer).map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Erro ao ler dados da atualização: {e}"),
        })?;
        if bytes_read == 0 {
            break;
        }
        use std::io::Write;
        file.write_all(&buffer[..bytes_read])
            .map_err(|e| ContractError {
                kind: ErrorKind::Failed,
                message: format!("Erro ao salvar dados da atualização: {e}"),
            })?;
        sha2::Digest::update(&mut hasher, &buffer[..bytes_read]);
        downloaded += bytes_read as u64;
        if downloaded > UPDATE_MAX_BYTES {
            return Err(ContractError {
                kind: ErrorKind::Refused,
                message: "O download excedeu o tamanho máximo de uma atualização.".to_string(),
            });
        }

        if last_emit.elapsed() > std::time::Duration::from_millis(150) {
            last_emit = std::time::Instant::now();
            let _ = app.emit(
                "verso://update-progress",
                UpdateProgress {
                    downloaded_bytes: downloaded as f64,
                    total_bytes: total_bytes.map(|t| t as f64),
                    percent: total_bytes.map(|t| {
                        if t > 0 {
                            (downloaded as f64 / t as f64) * 100.0
                        } else {
                            0.0
                        }
                    }),
                    status: "downloading".to_string(),
                    message: None,
                },
            );
        }
    }
    use std::io::Write;
    let _ = file.flush();

    // The download is what GitHub says it is, or it is nothing.
    let got_sha256 = format!("{:x}", sha2::Digest::finalize(hasher));
    if got_sha256 != expected_sha256 {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: format!(
                "O checksum do download não confere com o publicado (esperado sha256:{expected_sha256}, obtido sha256:{got_sha256}). Nada foi instalado."
            ),
        });
    }
    // And it is what Verso's release key signed: the checksum says the file
    // is the one GitHub holds; the signature, that we published it.
    let bytes = std::fs::read(&zip_path).map_err(|e| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Não foi possível reler o download: {e}"),
    })?;
    if let Err(e) = verify_signature(&bytes, &signature, UPDATE_PUBLIC_KEY, &asset.name) {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: format!("A assinatura do pacote não confere ({e}). Nada foi instalado."),
        });
    }
    drop(bytes);

    let _ = app.emit(
        "verso://update-progress",
        UpdateProgress {
            downloaded_bytes: downloaded as f64,
            total_bytes: Some(downloaded as f64),
            percent: Some(100.0),
            status: "extracting".to_string(),
            message: Some("Descompactando arquivos...".to_string()),
        },
    );

    // ── Extract ────────────────────────────────────────────────────────────
    //
    // We use the `zip` crate (pure Rust) instead of shelling out to `ditto`
    // or `unzip`, so this works identically on macOS, Windows, and Linux.
    let extract_dir = temp_dir.join("extracted");
    std::fs::create_dir_all(&extract_dir).map_err(|e| ContractError {
        kind: ErrorKind::Failed,
        message: format!("Não foi possível criar pasta de extração: {e}"),
    })?;

    // Windows' asset is the installer itself (release.yml), not an archive:
    // it goes where the install step looks for an installer, unextracted.
    if is_installer_name(&asset.name) {
        drop(file);
        let ext = if asset.name.to_ascii_lowercase().ends_with(".msi") {
            "msi"
        } else {
            "exe"
        };
        std::fs::rename(&zip_path, extract_dir.join(format!("verso-setup.{ext}"))).map_err(
            |e| ContractError {
                kind: ErrorKind::Failed,
                message: format!("Não foi possível preparar o instalador: {e}"),
            },
        )?;
        return install_extracted_update(app, &extract_dir, &temp_dir, downloaded);
    }

    {
        let zip_file = std::fs::File::open(&zip_path).map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Não foi possível abrir o arquivo baixado: {e}"),
        })?;
        let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Arquivo ZIP inválido: {e}"),
        })?;

        let mut extracted_total: u64 = 0;
        for i in 0..archive.len() {
            let mut zf = archive.by_index(i).map_err(|e| ContractError {
                kind: ErrorKind::Failed,
                message: format!("Erro ao ler entrada do ZIP: {e}"),
            })?;

            // Sanitise path: strip leading `/` or `..` segments to prevent
            // path-traversal attacks (Zip Slip).
            let out_path = match zf.enclosed_name() {
                Some(p) => extract_dir.join(p),
                None => continue, // skip suspicious entries
            };

            if zf.is_dir() {
                std::fs::create_dir_all(&out_path).map_err(|e| ContractError {
                    kind: ErrorKind::Failed,
                    message: format!("Erro ao criar diretório: {e}"),
                })?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| ContractError {
                        kind: ErrorKind::Failed,
                        message: format!("Erro ao criar diretório pai: {e}"),
                    })?;
                }
                let mut out_file = std::fs::File::create(&out_path).map_err(|e| ContractError {
                    kind: ErrorKind::Failed,
                    message: format!("Erro ao criar arquivo extraído: {e}"),
                })?;
                let written = std::io::copy(&mut zf, &mut out_file).map_err(|e| ContractError {
                    kind: ErrorKind::Failed,
                    message: format!("Erro ao escrever arquivo extraído: {e}"),
                })?;
                extracted_total += written;
                if extracted_total > UPDATE_MAX_BYTES {
                    return Err(ContractError {
                        kind: ErrorKind::Refused,
                        message: "O conteúdo extraído excedeu o tamanho máximo de uma atualização."
                            .to_string(),
                    });
                }

                // Restore Unix permissions (execute bit for binaries)
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Some(mode) = zf.unix_mode() {
                        let _ = std::fs::set_permissions(
                            &out_path,
                            std::fs::Permissions::from_mode(mode),
                        );
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "verso://update-progress",
        UpdateProgress {
            downloaded_bytes: downloaded as f64,
            total_bytes: Some(downloaded as f64),
            percent: Some(100.0),
            status: "installing".to_string(),
            message: Some("Instalando a nova versão...".to_string()),
        },
    );

    // ── Install ────────────────────────────────────────────────────────────
    //
    // Each platform has a different package format and install strategy.
    // All branches use only `std::fs` — no platform-specific CLI tools.
    install_extracted_update(app, &extract_dir, &temp_dir, downloaded)
}

/// Locates the extracted payload and installs it in a platform-specific way.
///
/// - **macOS**: finds the `.app` bundle, moves the running one aside, copies
///   the new one in place, and clears the quarantine attribute via
///   `std::fs` + `xattr` crate (no shell).
/// - **Windows**: finds the `.msi`/`.exe` installer and launches it.
/// - **Linux**: finds the `.AppImage` or binary, marks it executable, and
///   replaces the running one in place.
pub(crate) fn install_extracted_update<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    extract_dir: &std::path::Path,
    temp_dir: &std::path::Path,
    downloaded: u64,
) -> Result<InstallResult, ContractError> {
    let emit_done = |msg: &str, path: Option<String>, restart: bool| {
        let _ = app.emit(
            "verso://update-progress",
            UpdateProgress {
                downloaded_bytes: downloaded as f64,
                total_bytes: Some(downloaded as f64),
                percent: Some(100.0),
                status: "done".to_string(),
                message: Some(msg.to_string()),
            },
        );
        InstallResult {
            success: true,
            message: msg.to_string(),
            app_path: path,
            requires_restart: restart,
        }
    };

    // ── macOS ──────────────────────────────────────────────────────────────
    #[cfg(target_os = "macos")]
    {
        // The backup lives beside the bundle, not in the temp dir.
        let _ = temp_dir;
        // Find *.app bundle in the extracted directory (any depth level 1)
        let extracted_app = std::fs::read_dir(extract_dir)
            .ok()
            .and_then(|mut entries| {
                entries.find_map(|e| {
                    let p = e.ok()?.path();
                    if p.is_dir() && p.extension().is_some_and(|x| x == "app") {
                        Some(p)
                    } else {
                        None
                    }
                })
            })
            .ok_or_else(|| ContractError {
                kind: ErrorKind::Failed,
                message: "Nenhum pacote .app encontrado no arquivo baixado.".to_string(),
            })?;

        // Remove the macOS quarantine attribute (Gatekeeper) from the
        // bundle, through the xattr crate — no shell (ADR 0029). In
        // practice the attribute is the browser's; a zip this code
        // extracted in /tmp rarely has it, so this is mostly a no-op,
        // kept for correctness when the bundle moves to ~/Applications.
        clear_quarantine_tree(&extracted_app);

        // Try to replace the running bundle in-place
        let current_exe = std::env::current_exe().ok();
        let running_bundle = current_exe.as_deref().and_then(|exe| {
            let mut p = exe.parent();
            loop {
                match p {
                    Some(dir) if dir.extension().is_some_and(|x| x == "app") => {
                        return Some(dir.to_path_buf());
                    }
                    Some(dir) => p = dir.parent(),
                    None => return None,
                }
            }
        });

        if let Some(ref running_app) = running_bundle {
            // The backup is a sibling of the bundle: the rename stays on
            // one volume, and a failed install never leaves its only
            // intact copy in a temp dir that is cleaned on return.
            let backup = running_app.with_extension("app.update-backup");
            let _ = std::fs::remove_dir_all(&backup);

            if std::fs::rename(running_app, &backup).is_ok() {
                // Copy with std::fs (recursive) — no ditto needed.
                if copy_dir_all(&extracted_app, running_app).is_ok() {
                    let _ = std::fs::remove_dir_all(&backup);
                    return Ok(emit_done(
                        "Atualização instalada com sucesso! Reinicie o aplicativo para usar a nova versão.",
                        Some(running_app.display().to_string()),
                        true,
                    ));
                }
                // Roll back if the copy failed: the partial bundle must
                // leave first, or the rename lands on a non-empty
                // directory and the user is left with a broken app.
                let _ = std::fs::remove_dir_all(running_app);
                if std::fs::rename(&backup, running_app).is_err() {
                    return Err(ContractError {
                        kind: ErrorKind::Failed,
                        message: format!(
                            "A instalação falhou e o aplicativo anterior não pôde voltar ao lugar. Uma cópia intacta está em: {}",
                            backup.display()
                        ),
                    });
                }
            }
        }

        // Fallback: place in ~/Downloads and reveal in Finder
        let downloads = get_downloads_dir();
        let dest_name = extracted_app
            .file_name()
            .unwrap_or(std::ffi::OsStr::new("Verso.app"));
        let dest = downloads.join(dest_name);
        let _ = std::fs::remove_dir_all(&dest);
        copy_dir_all(&extracted_app, &dest).map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Não foi possível copiar o app para Downloads: {e}"),
        })?;

        // Reveal in Finder via `open -R` (macOS-specific UI nicety)
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&dest)
            .spawn();

        return Ok(emit_done(
            &format!("Nova versão copiada para Downloads: {}", dest.display()),
            Some(dest.display().to_string()),
            false,
        ));
    }

    // ── Windows ────────────────────────────────────────────────────────────
    #[cfg(target_os = "windows")]
    {
        // The installer replaces the app itself: nothing is backed up here.
        let _ = temp_dir;
        // Look for installer (.msi preferred, then .exe)
        let installer =
            find_file_by_exts(extract_dir, &[".msi", ".exe"]).ok_or_else(|| ContractError {
                kind: ErrorKind::Failed,
                message: "Nenhum instalador (.msi/.exe) encontrado no arquivo baixado.".to_string(),
            })?;

        // Out of the temporary folder first: it is removed when this
        // returns, while the installer still runs.
        let msi = installer
            .extension()
            .is_some_and(|x| x.eq_ignore_ascii_case("msi"));
        let kept = std::env::temp_dir().join(if msi {
            "verso-update-setup.msi"
        } else {
            "verso-update-setup.exe"
        });
        std::fs::copy(&installer, &kept).map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Não foi possível preparar o instalador: {e}"),
        })?;
        // Launch the installer — it handles the actual replacement. An
        // .msi is not a program: Windows Installer runs it.
        let mut command = if msi {
            let mut c = std::process::Command::new("msiexec");
            c.arg("/i").arg(&kept);
            c
        } else {
            std::process::Command::new(&kept)
        };
        command.spawn().map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Não foi possível executar o instalador: {e}"),
        })?;

        return Ok(emit_done(
            "Instalador iniciado. Siga as instruções na tela para concluir a atualização.",
            Some(kept.display().to_string()),
            false,
        ));
    }

    // ── Linux ──────────────────────────────────────────────────────────────
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;

        // Prefer AppImage, then deb, then any binary
        let payload = find_file_by_exts(extract_dir, &[".AppImage", ".appimage", ".deb", ".rpm"])
            .ok_or_else(|| ContractError {
            kind: ErrorKind::Failed,
            message: "Nenhum pacote Linux (.AppImage/.deb/.rpm) encontrado.".to_string(),
        })?;

        // Make it executable
        let meta = std::fs::metadata(&payload).map_err(|e| ContractError {
            kind: ErrorKind::Failed,
            message: format!("Não foi possível ler metadados: {e}"),
        })?;
        let mut perms = meta.permissions();
        perms.set_mode(perms.mode() | 0o755);
        let _ = std::fs::set_permissions(&payload, perms);

        if payload
            .extension()
            .is_some_and(|x| x.eq_ignore_ascii_case("AppImage"))
        {
            // Try to replace the running AppImage
            if let Ok(current) = std::env::current_exe() {
                let backup = temp_dir.join("running_backup.AppImage");
                if std::fs::rename(&current, &backup).is_ok() {
                    if std::fs::copy(&payload, &current).is_ok() {
                        let _ = std::fs::remove_file(&backup);
                        return Ok(emit_done(
                            "Atualização instalada com sucesso! Reinicie o aplicativo.",
                            Some(current.display().to_string()),
                            true,
                        ));
                    }
                    let _ = std::fs::rename(&backup, &current);
                }
            }
        } else {
            // For .deb/.rpm: copy to Downloads and advise the user
            let downloads = get_downloads_dir();
            let dest = downloads.join(
                payload
                    .file_name()
                    .unwrap_or(std::ffi::OsStr::new("verso-update")),
            );
            std::fs::copy(&payload, &dest).map_err(|e| ContractError {
                kind: ErrorKind::Failed,
                message: format!("Erro ao copiar pacote para Downloads: {e}"),
            })?;
            return Ok(emit_done(
                &format!(
                    "Pacote de atualização salvo em Downloads: {}. Instale manualmente com seu gerenciador de pacotes.",
                    dest.display()
                ),
                Some(dest.display().to_string()),
                false,
            ));
        }

        return Ok(emit_done(
            "Atualização baixada. Reinicie o aplicativo para usar a nova versão.",
            None,
            true,
        ));
    }

    // Unreachable on supported platforms, but required for compilation
    #[allow(unreachable_code)]
    Err(ContractError {
        kind: ErrorKind::Failed,
        message: "Plataforma não suportada para atualização automática.".to_string(),
    })
}

/// Recursively copies `src` directory into `dst` using only `std::fs`.
/// Equivalent to `cp -r src dst` — no shell, no platform tools.
/// Only used on macOS (the other platforms delegate to a system installer).
#[cfg(target_os = "macos")]
pub(crate) fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else if ty.is_symlink() {
            let link_target = std::fs::read_link(entry.path())?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(&link_target, &target)?;
            #[cfg(windows)]
            {
                if link_target.is_dir() {
                    std::os::windows::fs::symlink_dir(&link_target, &target)?;
                } else {
                    std::os::windows::fs::symlink_file(&link_target, &target)?;
                }
            }
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Returns the first file found in `dir` (non-recursive) whose name ends
/// with one of the given `extensions` (case-insensitive).
#[cfg(any(target_os = "windows", target_os = "linux"))]
pub(crate) fn find_file_by_exts(
    dir: &std::path::Path,
    extensions: &[&str],
) -> Option<std::path::PathBuf> {
    let entries: Vec<_> = std::fs::read_dir(dir).ok()?.flatten().collect();
    for ext in extensions {
        if let Some(found) = entries.iter().find(|e| {
            e.path()
                .to_string_lossy()
                .to_lowercase()
                .ends_with(&ext.to_lowercase())
        }) {
            return Some(found.path());
        }
    }
    None
}

/// The user's Downloads folder, where the macOS and Linux fallbacks leave
/// an update they could not put in place. Windows has no such fallback:
/// its installer does the replacing (ADR 0069, item 9: the updater's
/// Windows path is still to be exercised).
#[cfg(not(target_os = "windows"))]
pub(crate) fn get_downloads_dir() -> std::path::PathBuf {
    // $HOME/Downloads
    let home = std::env::var("HOME")
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
    std::path::PathBuf::from(home).join("Downloads")
}

// ── The OS edge the CLI install needs ──────────────────────────────────
//
// The settings' CLI link (`install_cli` and friends in lib.rs) checks and
// makes a symlink in `/usr/local/bin`. Its filesystem work lives here, the
// one module of this crate allowed `std::fs` (ADR 0029, revision of
// 2026-09-29: a subprocess doing filesystem work counts as the same
// violation, so `test`, `readlink`, `ln`, `rm` and `xattr` are gone).
// The elevated fallback still runs a shell through the system's
// administrator prompt: privilege, not filesystem dodging.

/// Whether `path` is an executable file (the `test -x` this replaces).
pub(crate) fn executable_file(path: &std::path::Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        std::fs::metadata(path).is_ok_and(|m| m.is_file())
    }
}

/// Claude Desktop's settings folder in a Store (MSIX) install, where
/// Windows keeps the package's `%APPDATA%`: the first package of Claude's
/// (`Claude_<publisher>`) under `%LOCALAPPDATA%\Packages` that has one.
/// Here because this crate reads directories in this file only (ADR 0029).
#[cfg(windows)]
pub(crate) fn msix_claude_dir() -> Option<std::path::PathBuf> {
    let packages = std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("Packages");
    let mut found: Vec<std::path::PathBuf> = std::fs::read_dir(packages)
        .ok()?
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("Claude_"))
        .map(|e| e.path().join("LocalCache").join("Roaming").join("Claude"))
        .filter(|dir| dir.is_dir())
        .collect();
    found.sort();
    found.into_iter().next()
}

/// Where the symlink at `path` points, if it is one. Not on Windows, where
/// the command line is not linked (`cli_state_now`).
#[cfg(not(windows))]
pub(crate) fn link_target(path: &std::path::Path) -> Option<std::path::PathBuf> {
    std::fs::read_link(path).ok()
}

/// Whether anything sits at `path` — a file, a directory, or a symlink,
/// even a broken one (the `test -e` this replaces, without following).
#[cfg(not(windows))]
pub(crate) fn something_at(path: &std::path::Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// Point `link` at `target`, replacing whatever symlink or file was
/// there (the `ln -sfn` this replaces). Unix only; the CLI link is not
/// offered elsewhere yet.
#[cfg(unix)]
pub(crate) fn replace_symlink(
    target: &std::path::Path,
    link: &std::path::Path,
) -> std::io::Result<()> {
    if std::fs::symlink_metadata(link).is_ok() {
        std::fs::remove_file(link)?;
    }
    std::os::unix::fs::symlink(target, link)
}

/// Take the file or symlink at `path` away (the `rm` this replaces).
pub(crate) fn remove_file_at(path: &std::path::Path) -> std::io::Result<()> {
    std::fs::remove_file(path)
}

/// Clear the download quarantine from one file, through the xattr crate,
/// not a shell. Nothing to clear is fine.
#[cfg(target_os = "macos")]
pub(crate) fn clear_quarantine(path: &std::path::Path) {
    let _ = xattr::remove(path, "com.apple.quarantine");
}

/// [`clear_quarantine`] over a whole tree (the `xattr -dr` this
/// replaces). Best effort, as the shell call was: an entry that cannot
/// be listed is skipped, not an error.
#[cfg(target_os = "macos")]
pub(crate) fn clear_quarantine_tree(path: &std::path::Path) {
    clear_quarantine(path);
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let child = entry.path();
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            clear_quarantine_tree(&child);
        } else {
            clear_quarantine(&child);
        }
    }
}

/// The identifier the app had before `com.versomd.app` (ADR 0004, decided
/// on 2026-10-07): `dev.verso.app`, and `dev.verso.app.beta` for the betas.
fn former_identifier(identifier: &str) -> Option<String> {
    identifier
        .strip_prefix("com.versomd.app")
        .map(|rest| format!("dev.verso.app{rest}"))
}

/// What the web view keeps per app — the window's settings, its keys, the
/// tables' column widths, the local focuses, in its local storage — lives
/// under the app's identifier, in `~/Library/WebKit/<identifier>`. On the
/// first start under `com.versomd.app`, the former identifier's is copied
/// there, once, before any window opens, so an update keeps them (ADR 0004,
/// the maintainer on 2026-10-07: "migrar uma vez"). Nothing of the open
/// folder is touched. Answers whether it copied; a failure is said in the
/// log and the window starts with its defaults.
pub(crate) fn migrate_web_data(identifier: &str) -> bool {
    let (Some(home), Some(former)) = (std::env::var_os("HOME"), former_identifier(identifier))
    else {
        return false;
    };
    let webkit = std::path::Path::new(&home).join("Library").join("WebKit");
    match copy_web_data(&webkit.join(former), &webkit.join(identifier)) {
        Ok(copied) => {
            if copied {
                crate::log::write(
                    "INFO",
                    "host",
                    &format!("window data carried over to {identifier}"),
                );
            }
            copied
        }
        Err(e) => {
            crate::log::write(
                "WARN",
                "host",
                &format!("window data not carried over to {identifier}: {e}"),
            );
            false
        }
    }
}

/// Copy the directory `from` to `to` when `from` exists and `to` does not.
fn copy_web_data(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<bool> {
    if !from.is_dir() || to.exists() {
        return Ok(false);
    }
    copy_dir(from, to)?;
    Ok(true)
}

fn copy_dir(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let target = to.join(entry.file_name());
        if kind.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), &target)?;
        }
        // A link is left behind: WebKit keeps none there.
    }
    Ok(())
}

#[cfg(test)]
mod migration_tests {
    use super::*;

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
        assert!(ok(data, TEST_SIGNATURE, UPDATE_PUBLIC_KEY, "payload.bin").is_err());
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

    /// The key the app carries reads as a minisign public key: a typo in it
    /// would refuse every update.
    #[test]
    fn the_release_public_key_reads() {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(UPDATE_PUBLIC_KEY)
            .unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(minisign_verify::PublicKey::decode(&text).is_ok());
    }

    #[test]
    fn the_windows_installer_is_run_as_downloaded_and_an_archive_is_extracted() {
        assert!(is_installer_name(
            "Verso-Beta-0.5.0-beta.1-windows-x64-setup.exe"
        ));
        assert!(is_installer_name("Verso-1.0.0-windows-x64.MSI"));
        assert!(!is_installer_name(
            "Verso-Beta-0.5.0-beta.1-macos-arm64.zip"
        ));
        assert!(!is_installer_name("verso-cli-0.5.0-windows-x64.zip"));
    }

    #[test]
    fn the_former_identifier_is_named_for_the_app_and_the_beta() {
        assert_eq!(
            former_identifier("com.versomd.app").as_deref(),
            Some("dev.verso.app")
        );
        assert_eq!(
            former_identifier("com.versomd.app.beta").as_deref(),
            Some("dev.verso.app.beta")
        );
        assert_eq!(former_identifier("dev.verso.app"), None);
    }

    #[test]
    fn the_window_data_is_copied_once_and_never_over_what_is_there() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("dev.verso.app");
        let new = root.path().join("com.versomd.app");
        std::fs::create_dir_all(old.join("WebsiteData/LocalStorage")).unwrap();
        std::fs::write(old.join("WebsiteData/LocalStorage/settings"), b"theme=dark").unwrap();

        assert!(copy_web_data(&old, &new).unwrap());
        assert_eq!(
            std::fs::read(new.join("WebsiteData/LocalStorage/settings")).unwrap(),
            b"theme=dark"
        );
        // Once: the new identifier's own data is never overwritten.
        std::fs::write(
            new.join("WebsiteData/LocalStorage/settings"),
            b"theme=light",
        )
        .unwrap();
        assert!(!copy_web_data(&old, &new).unwrap());
        assert_eq!(
            std::fs::read(new.join("WebsiteData/LocalStorage/settings")).unwrap(),
            b"theme=light"
        );
        // Nothing to carry: nothing done.
        assert!(!copy_web_data(&root.path().join("absent"), &root.path().join("x")).unwrap());
        assert!(!root.path().join("x").exists());
    }
}
