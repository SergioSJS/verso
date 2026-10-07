//! The command line tool and the MCP: the bundled verso installed on the PATH,
//! and the MCP server added to Claude.

use super::*;

/// Where the command line is linked: the one directory on the PATH of
/// every shell on macOS (`/etc/paths`), as editors install theirs.
pub(crate) const CLI_LINK: &str = "/usr/local/bin/verso";

/// The command line this app carries: beside its own binary — the
/// bundle's `Contents/MacOS`, or `target/<profile>` in a development tree.
/// A path at the edge, for the operating system's tools only: it never
/// crosses to the window (ADR 0026 rule 4).
fn bundled_cli() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(cli) = std::env::current_exe() {
        candidates.push(cli.with_file_name("verso"));
        if let Some(parent) = cli.parent() {
            candidates.push(parent.join("verso"));
            if let Some(bundle) = parent.parent() {
                candidates.push(bundle.join("Resources").join("verso"));
                candidates.push(bundle.join("MacOS").join("verso"));
            }
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        candidates
            .push(PathBuf::from(&home).join("Applications/Verso Beta.app/Contents/MacOS/verso"));
        candidates.push(PathBuf::from(&home).join("Applications/Verso.app/Contents/MacOS/verso"));
    }
    candidates.push(PathBuf::from(
        "/Applications/Verso Beta.app/Contents/MacOS/verso",
    ));
    candidates.push(PathBuf::from(
        "/Applications/Verso.app/Contents/MacOS/verso",
    ));

    candidates.into_iter().find(|cli| executable_file(cli))
}

fn cli_state_now() -> CliState {
    let Some(ours) = bundled_cli() else {
        return CliState::Unbundled;
    };
    if let Some(target) = link_target(Path::new(CLI_LINK)) {
        return if target == ours {
            CliState::Ours
        } else {
            CliState::Elsewhere
        };
    }
    if something_at(Path::new(CLI_LINK)) {
        CliState::Elsewhere
    } else {
        CliState::Missing
    }
}

/// A text as an AppleScript string literal.
#[cfg(target_os = "macos")]
pub(crate) fn applescript_string(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Run `shell` as an administrator: macOS asks for the password, as an
/// installer does. `Ok(false)` when the person said no.
#[cfg(target_os = "macos")]
fn as_administrator(shell: &str) -> Result<bool, ContractError> {
    let script = format!(
        "do shell script {} with administrator privileges",
        applescript_string(shell)
    );
    let out = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| failed(e.to_string()))?;
    if out.status.success() {
        return Ok(true);
    }
    let said = String::from_utf8_lossy(&out.stderr);
    // -128: "User canceled."
    if said.contains("-128") {
        return Ok(false);
    }
    Err(failed(said.trim().to_owned()))
}

/// A path as one shell word, single-quoted.
#[cfg(target_os = "macos")]
pub(crate) fn shell_word(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}

#[tauri::command]
#[specta::specta]
pub(crate) fn cli_status() -> CliState {
    cli_state_now()
}

/// Link the command line into `/usr/local/bin`. Something else there is
/// replaced only when the window says so (`replace`), after asking. The
/// download's quarantine is taken off the command line first: a shell
/// asks no Gatekeeper question, it refuses to run it.
#[tauri::command]
#[specta::specta]
pub(crate) fn install_cli(replace: bool) -> Result<CliState, ContractError> {
    let Some(ours) = bundled_cli() else {
        return Err(refused("this build carries no command line"));
    };
    if cli_state_now() == CliState::Elsewhere && !replace {
        return Err(ContractError {
            kind: ErrorKind::Exists,
            message: "another verso is on the PATH".to_owned(),
        });
    }
    #[cfg(target_os = "macos")]
    clear_quarantine(&ours);
    // Without privileges first: the directory may be the person's own.
    #[cfg(unix)]
    let plain = replace_symlink(&ours, Path::new(CLI_LINK));
    #[cfg(not(unix))]
    let plain: std::io::Result<()> = Err(std::io::Error::other("no CLI link on this platform"));
    if let Err(error) = plain {
        #[cfg(target_os = "macos")]
        {
            // The error itself is not shown here: the administrator
            // prompt is the answer to it.
            let _ = error;
            let shell = format!(
                "mkdir -p /usr/local/bin && ln -sfn {} {CLI_LINK}",
                shell_word(&ours)
            );
            if !as_administrator(&shell)? {
                return Err(refused("cancelled"));
            }
        }
        #[cfg(not(target_os = "macos"))]
        return Err(failed(error.to_string()));
    }
    Ok(cli_state_now())
}

/// Take the link away — only this app's own.
#[tauri::command]
#[specta::specta]
pub(crate) fn uninstall_cli() -> Result<CliState, ContractError> {
    if cli_state_now() != CliState::Ours {
        return Ok(cli_state_now());
    }
    if let Err(error) = remove_file_at(Path::new(CLI_LINK)) {
        #[cfg(target_os = "macos")]
        {
            let _ = error;
            if !as_administrator(&format!("rm {CLI_LINK}"))? {
                return Err(refused("cancelled"));
            }
        }
        #[cfg(not(target_os = "macos"))]
        return Err(failed(error.to_string()));
    }
    Ok(cli_state_now())
}

/// Claude Desktop's configuration folder.
fn claude_dir() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME").filter(|h| !h.is_empty())?);
    #[cfg(target_os = "macos")]
    return Some(home.join("Library/Application Support/Claude"));
    #[cfg(not(target_os = "macos"))]
    return Some(home.join(".config/Claude"));
}

fn client_state(e: verso_core::clients::Entry) -> McpClientState {
    use verso_core::clients::Entry as E;
    match e {
        E::NoClient => McpClientState::NoClient,
        E::Absent => McpClientState::Absent,
        E::Same => McpClientState::Same,
        E::Different => McpClientState::Different,
    }
}

/// The open folder's server as clients name it, and whether Claude
/// Desktop starts it. The entry the app writes starts the linked command
/// line with the folder's key: the folder's path goes nowhere
/// (ADR 0026 rule 4).
#[tauri::command]
#[specta::specta]
pub(crate) fn mcp_status<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<McpStatus, ContractError> {
    let key = with(&state, &window, |ws| Ok(ws.key()))?;
    let server = verso_core::clients::server_name(&key);
    let entry = verso_core::clients::verso_entry(CLI_LINK, &key);
    let claude = match claude_dir() {
        None => McpClientState::NoClient,
        Some(dir) => {
            client_state(verso_core::clients::claude_entry(&dir, &server, &entry).map_err(convert)?)
        }
    };
    Ok(McpStatus { server, claude })
}

/// Add the open folder's server to Claude Desktop — after the window has
/// shown what goes in and the person agreed. Needs the command line
/// linked: the entry starts it.
#[tauri::command]
#[specta::specta]
pub(crate) fn mcp_add_claude<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<McpAdded, ContractError> {
    if cli_state_now() != CliState::Ours {
        return Err(refused("install the command line first"));
    }
    let key = with(&state, &window, |ws| Ok(ws.key()))?;
    let server = verso_core::clients::server_name(&key);
    let entry = verso_core::clients::verso_entry(CLI_LINK, &key);
    let dir = claude_dir().ok_or_else(|| refused("Claude Desktop is not installed"))?;
    let added = verso_core::clients::add_to_claude(&dir, &server, entry).map_err(convert)?;
    Ok(McpAdded {
        server,
        replaced: added.replaced,
        backup: added.backup,
        warnings: added.warnings,
    })
}
