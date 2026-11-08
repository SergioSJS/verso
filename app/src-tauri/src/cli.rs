//! The command line tool and the MCP: the bundled verso installed on the PATH,
//! and the MCP server added to Claude.

use super::*;

/// Where the command line is linked: the one directory on the PATH of
/// every shell on macOS (`/etc/paths`), as editors install theirs.
pub(crate) const CLI_LINK: &str = "/usr/local/bin/verso";

/// Where an AppImage puts its command line on Linux: `~/.local/bin`, on
/// PATH without root in the XDG base directory specification (ADR 0071),
/// under the name it carries — `verso`, or `verso-beta` for the beta, so
/// the two sit side by side.
#[cfg(target_os = "linux")]
fn local_bin_cli() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME").filter(|h| !h.is_empty())?);
    let name = bundled_cli()?.file_name()?.to_owned();
    Some(home.join(".local/bin").join(name))
}

/// The line that marks the script in `~/.local/bin` as an AppImage's own.
#[cfg(target_os = "linux")]
const APPIMAGE_MARK: &str = "# verso: the command line inside this AppImage";

/// What an AppImage puts in `~/.local/bin`: not a copy of its command line,
/// which would be the old one after the AppImage updates itself, but a
/// script that runs the one inside the AppImage, by `$APPIMAGE` — the file
/// an update replaces in place.
#[cfg(target_os = "linux")]
fn appimage_script() -> Option<String> {
    let image = PathBuf::from(std::env::var_os("APPIMAGE").filter(|v| !v.is_empty())?);
    Some(script_for(&image))
}

/// The script that runs the command line inside the AppImage at `image`.
#[cfg(target_os = "linux")]
fn script_for(image: &Path) -> String {
    format!(
        "#!/bin/sh\n{APPIMAGE_MARK}\nexec {} --cli \"$@\"\n",
        shell_word(image)
    )
}

/// What `~/.local/bin` holds under the command's name, for an AppImage:
/// `found` the start of the file there (`None`: nothing readable),
/// `expected` this AppImage's script, `something` whether anything is there.
#[cfg(target_os = "linux")]
fn script_state(found: Option<&str>, expected: Option<&str>, something: bool) -> CliState {
    match found {
        Some(text) if Some(text) == expected => CliState::Ours,
        // This AppImage's script from where the AppImage was before
        // (moved, renamed): installing writes it again, without asking.
        Some(text) if text.contains(APPIMAGE_MARK) => CliState::Missing,
        _ if something => CliState::Elsewhere,
        _ => CliState::Missing,
    }
}

/// `verso-app --cli ARGS…`: the command line this app carries, in this
/// process's place — how the script an AppImage puts in `~/.local/bin`
/// runs it. Returns only when it could not be started.
#[cfg(target_os = "linux")]
pub(crate) fn run_bundled_cli(args: &[String]) -> std::io::Error {
    use std::os::unix::process::CommandExt;
    match bundled_cli() {
        Some(cli) => std::process::Command::new(cli).args(args).exec(),
        None => std::io::Error::other("this build carries no command line"),
    }
}

/// Whether this app runs from an AppImage (mounted only while it runs).
#[cfg(target_os = "linux")]
fn in_appimage() -> bool {
    std::env::var_os("APPIMAGE").is_some_and(|v| !v.is_empty())
}

/// The command line this app carries: beside its own binary — the
/// bundle's `Contents/MacOS`, or `target/<profile>` in a development tree.
/// A path at the edge, for the operating system's tools only: it never
/// crosses to the window (ADR 0026 rule 4).
fn bundled_cli() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    // `verso.exe` on Windows, which the installer puts beside the app
    // (ADR 0069).
    let name = format!("verso{}", std::env::consts::EXE_SUFFIX);
    if let Ok(cli) = std::env::current_exe() {
        // The beta's package names its command line `verso-beta`, so the
        // beta and the release install side by side in /usr/bin (ADR 0071,
        // item 7): the beta (`verso-app-beta`) takes its own first, never
        // the release's beside it.
        #[cfg(target_os = "linux")]
        if cli
            .file_name()
            .is_some_and(|n| n.to_string_lossy().ends_with("-beta"))
        {
            candidates.push(cli.with_file_name("verso-beta"));
        }
        candidates.push(cli.with_file_name(&name));
        if let Some(parent) = cli.parent() {
            candidates.push(parent.join(&name));
            if let Some(bundle) = parent.parent() {
                candidates.push(bundle.join("Resources").join("verso"));
                candidates.push(bundle.join("MacOS").join("verso"));
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(
                PathBuf::from(&home).join("Applications/Verso Beta.app/Contents/MacOS/verso"),
            );
            candidates
                .push(PathBuf::from(&home).join("Applications/Verso.app/Contents/MacOS/verso"));
        }
        candidates.push(PathBuf::from(
            "/Applications/Verso Beta.app/Contents/MacOS/verso",
        ));
        candidates.push(PathBuf::from(
            "/Applications/Verso.app/Contents/MacOS/verso",
        ));
    }

    candidates.into_iter().find(|cli| executable_file(cli))
}

fn cli_state_now() -> CliState {
    // Nothing is linked on Windows: the installer put verso.exe beside the
    // app (ADR 0069, item 9).
    #[cfg(windows)]
    return bundled_cli().map_or(CliState::Unbundled, |_| CliState::Bundled);
    // On Linux a package puts the command line beside the app, in /usr/bin,
    // on PATH already; an AppImage's is copied to ~/.local/bin.
    #[cfg(target_os = "linux")]
    {
        if bundled_cli().is_none() {
            return CliState::Unbundled;
        }
        if !in_appimage() {
            return CliState::Bundled;
        }
        let Some(dest) = local_bin_cli() else {
            return CliState::Missing;
        };
        script_state(
            read_head(&dest).as_deref(),
            appimage_script().as_deref(),
            something_at(&dest),
        )
    }
    // A phone has no command line to link (the Android app, Phase 0).
    #[cfg(target_os = "android")]
    return CliState::Unbundled;
    #[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
    {
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
#[cfg(any(target_os = "macos", target_os = "linux"))]
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
    if cfg!(windows) {
        return Err(refused("on Windows the command line comes with the app"));
    }
    #[cfg(target_os = "linux")]
    if !in_appimage() {
        return Err(refused("the package put the command line on the PATH"));
    }
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
    // An AppImage's script in ~/.local/bin: no root, and no link into an
    // image mounted only while the app runs.
    // The script runs the AppImage itself, which finds `ours` inside it.
    #[cfg(target_os = "linux")]
    let _ = &ours;
    #[cfg(target_os = "linux")]
    let plain = local_bin_cli()
        .zip(appimage_script())
        .ok_or_else(|| std::io::Error::other("HOME or APPIMAGE is not set"))
        .and_then(|(dest, script)| write_executable_text(&dest, &script));
    // Without privileges first: the directory may be the person's own.
    #[cfg(target_os = "macos")]
    let plain = replace_symlink(&ours, Path::new(CLI_LINK));
    // The command line on PATH on Windows is an item of the port, not done
    // yet (ADR 0069, item 9).
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let plain: std::io::Result<()> = {
        let _ = &ours;
        Err(std::io::Error::other("no CLI link on this platform"))
    };
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
    #[cfg(target_os = "linux")]
    let installed = local_bin_cli().unwrap_or_else(|| PathBuf::from(CLI_LINK));
    #[cfg(not(target_os = "linux"))]
    let installed = PathBuf::from(CLI_LINK);
    if let Err(error) = remove_file_at(&installed) {
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

/// Claude Desktop's configuration folder: on Windows the Store (MSIX)
/// install's, whose `%APPDATA%` Windows redirects into the package
/// (`%LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming\Claude`,
/// observed on Windows 11 on 2026-10-08: no `%APPDATA%\Claude` exists
/// there), else `%APPDATA%\Claude` (Anthropic's MCP guide; HOME is usually
/// unset there — ADR 0069); `~/Library/Application Support/Claude` on
/// macOS, `~/.config/Claude` elsewhere.
fn claude_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    return msix_claude_dir().or_else(|| {
        Some(PathBuf::from(std::env::var_os("APPDATA").filter(|v| !v.is_empty())?).join("Claude"))
    });
    #[cfg(not(windows))]
    {
        let home = PathBuf::from(std::env::var_os("HOME").filter(|h| !h.is_empty())?);
        #[cfg(target_os = "macos")]
        return Some(home.join("Library/Application Support/Claude"));
        #[cfg(not(target_os = "macos"))]
        return Some(home.join(".config/Claude"));
    }
}

/// What a client starts for the MCP server: the linked command line on
/// macOS and Linux (installed from the settings), and on Windows, where
/// nothing is linked onto a PATH, the `verso.exe` the installer put beside
/// the app, by its absolute path (the maintainer, 2026-10-08). `None` when
/// there is none to start.
fn mcp_command() -> Option<String> {
    #[cfg(windows)]
    return bundled_cli().map(|cli| cli.to_string_lossy().into_owned());
    // Linux: the package's /usr/bin/verso, or the AppImage's script in
    // ~/.local/bin, by its absolute path.
    #[cfg(target_os = "linux")]
    return match cli_state_now() {
        CliState::Bundled => bundled_cli().map(|cli| cli.to_string_lossy().into_owned()),
        CliState::Ours => local_bin_cli().map(|cli| cli.to_string_lossy().into_owned()),
        _ => None,
    };
    #[cfg(not(any(windows, target_os = "linux")))]
    return (cli_state_now() == CliState::Ours).then(|| CLI_LINK.to_owned());
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
    all: bool,
) -> Result<McpStatus, ContractError> {
    let command = mcp_command().unwrap_or_else(|| CLI_LINK.to_owned());
    let folder = mcp_key(&window, &state, all)?;
    let (names, entry) = verso_core::clients::names_and_entry(
        &command,
        folder.as_ref().map(|(k, p)| (k.as_str(), p.as_deref())),
    );
    let (server, claude) = match claude_dir() {
        None => (names[0].clone(), McpClientState::NoClient),
        Some(dir) => {
            let (server, found) = verso_core::clients::pick_server(&dir, &names, &entry)
                .map_err(verso_service::convert)?;
            (server, client_state(found))
        }
    };
    Ok(McpStatus {
        server,
        claude,
        command,
    })
}

/// The folder a client's entry names, by the mode (ADR 0054, revised
/// 2026-10-08): the open folder's key, with the name of the folder it sits
/// in, for its own server; `None` for the one server for all of Verso,
/// which needs no folder open.
fn mcp_key<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    state: &State<'_, App>,
    all: bool,
) -> Result<Option<(String, Option<String>)>, ContractError> {
    if all {
        return Ok(None);
    }
    with(state, window, |ws| {
        let parent = ws
            .folder()
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().into_owned());
        Ok((ws.key(), parent))
    })
    .map(Some)
}

/// Whether the open folder is marked visible to agents (the server for all
/// of Verso reads only those; ADR 0054).
#[tauri::command]
#[specta::specta]
pub(crate) fn agent_visible<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<bool, ContractError> {
    let key = with(&state, &window, |ws| Ok(ws.key()))?;
    verso_core::agents::is_visible(state.service.config(), &key).map_err(verso_service::convert)
}

/// Mark the open folder visible to agents, or hidden again.
#[tauri::command]
#[specta::specta]
pub(crate) fn set_agent_visible<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    visible: bool,
) -> Result<bool, ContractError> {
    let key = with(&state, &window, |ws| Ok(ws.key()))?;
    verso_core::agents::set_visible(state.service.config(), &key, visible)
        .map_err(verso_service::convert)?;
    Ok(visible)
}

/// Claude Desktop's download page, in the system's browser: where Claude
/// Desktop is not installed, the settings offer it instead of a dead
/// "not found" (the maintainer, 2026-10-08). One fixed address, nothing
/// from the window: the command takes no argument.
#[tauri::command]
#[specta::specta]
pub(crate) fn open_claude_download() -> Result<(), ContractError> {
    open_page("https://claude.com/download")
}

/// A fixed address of this app's own, opened in the system's browser:
/// Claude Desktop's download, an AI tool's install page (ADR 0115 item 14).
pub(crate) fn open_page(page: &str) -> Result<(), ContractError> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    // Explorer hands an address to the default browser.
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer");
    #[cfg(not(any(target_os = "macos", windows)))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(page)
        .spawn()
        .map(|_| ())
        .map_err(|e| failed(e.to_string()))
}

/// Add the open folder's server to Claude Desktop — after the window has
/// shown what goes in and the person agreed. Needs the command line
/// linked: the entry starts it.
#[tauri::command]
#[specta::specta]
pub(crate) fn mcp_add_claude<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    all: bool,
) -> Result<McpAdded, ContractError> {
    let Some(command) = mcp_command() else {
        return Err(refused("install the command line first"));
    };
    let folder = mcp_key(&window, &state, all)?;
    let (names, entry) = verso_core::clients::names_and_entry(
        &command,
        folder.as_ref().map(|(k, p)| (k.as_str(), p.as_deref())),
    );
    let dir = claude_dir().ok_or_else(|| refused("Claude Desktop is not installed"))?;
    let (server, _) =
        verso_core::clients::pick_server(&dir, &names, &entry).map_err(verso_service::convert)?;
    let added =
        verso_core::clients::add_to_claude(&dir, &server, entry).map_err(verso_service::convert)?;
    Ok(McpAdded {
        server,
        replaced: added.replaced,
        backup: added.backup,
        warnings: added.warnings,
    })
}

#[cfg(all(test, target_os = "linux"))]
mod linux_tests {
    use super::*;

    #[test]
    fn an_appimage_s_command_is_a_script_told_as_ours_by_its_mark_and_path() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("bin/verso-beta");
        // A quote in the AppImage's path stays one shell word.
        let image = Path::new("/home/ana/Apps/it's/Verso Beta.AppImage");
        let script = script_for(image);
        assert!(script.contains("exec '/home/ana/Apps/it'\\''s/Verso Beta.AppImage' --cli \"$@\""));
        write_executable_text(&dest, &script).unwrap();
        assert!(executable_file(&dest));
        let found = read_head(&dest);
        assert_eq!(
            script_state(found.as_deref(), Some(&script), true),
            CliState::Ours
        );
        // The same script after the AppImage moved: written again, unasked.
        let moved = script_for(Path::new("/opt/Verso Beta.AppImage"));
        assert_eq!(
            script_state(found.as_deref(), Some(&moved), true),
            CliState::Missing
        );
        // Another program under that name: asked before it is replaced.
        assert_eq!(
            script_state(Some("\u{7f}ELF\u{2}\u{1}"), Some(&script), true),
            CliState::Elsewhere
        );
        assert_eq!(script_state(None, Some(&script), false), CliState::Missing);
    }
}
