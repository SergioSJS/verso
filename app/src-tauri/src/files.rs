//! Files and folders: created, renamed, binned, revealed, their paths copied,
//! listed with their details, and text files read and written.

use super::*;
use verso_contract::{FilesDropped, FilesOver, PickSkip, PickedFile, PickedFiles, SkippedPick};

/// Create a note (`name`, with or without `.md`, folders created) with
/// `text`; `exists` when something stands there (ADR 0048).
#[tauri::command]
#[specta::specta]
pub(crate) fn create_note<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    name: String,
    text: String,
) -> Result<NoteText, ContractError> {
    with(&state, &window, |ws| ops::create_note(ws, name, text))
}

/// Create a file that is not a note (an image pasted into a note) from
/// base64 bytes, at `path` relative to the folder; returns the confined
/// path. `exists` when something stands there.
#[tauri::command]
#[specta::specta]
pub(crate) fn create_file<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
    base64: String,
) -> Result<String, ContractError> {
    with(&state, &window, |ws| ops::create_file(ws, path, base64))
}

/// The most bytes of one chosen file the window of a server's folder
/// receives (a server's message is 48 MiB and bytes cross as base64: the
/// window's `MAX_IMAGE_BYTES`), and of the whole choice.
pub(crate) const PICK_FILE_MAX: u64 = 32 * 1024 * 1024;
const PICK_TOTAL_MAX: u64 = 256 * 1024 * 1024;
/// The most the person may set for one file of this computer's own folder:
/// 1 GiB (Settings › Files and links). The whole choice may be 8 times it.
const PICK_CEILING_MB: u32 = 1024;
const PICK_TOTAL_TIMES: u64 = 8;

/// The files a window chose and has not had copied yet: token → what it
/// stands for. The path stays here (rule 4); a token serves once, only the
/// window it was given to, and a new choice by that window drops its old
/// ones.
pub(crate) struct Held {
    window: String,
    path: PathBuf,
    max: u64,
}
pub(crate) static HELD: std::sync::LazyLock<Mutex<std::collections::HashMap<String, Held>>> =
    std::sync::LazyLock::new(Mutex::default);
static NEXT_TOKEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn skip_reason(e: verso_core::PickedError) -> PickSkip {
    use verso_core::PickedError;
    match e {
        PickedError::NotAFile => PickSkip::NotAFile,
        PickedError::Placeholder => PickSkip::Placeholder,
        PickedError::TooLarge => PickSkip::TooLarge,
        PickedError::Io(_) => PickSkip::Unreadable,
    }
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Read what the person chose for a window on a server's folder: a file by
/// its name and bytes, a path never handed on. A directory, a cloud
/// placeholder, a file too large (alone or with the rest) or one the system
/// will not read is named in `skipped`, not failed on: the others are still
/// imported. Split out of the command so a test can give it paths without a
/// dialog.
pub(crate) fn read_picks(paths: &[PathBuf]) -> PickedFiles {
    use base64::Engine;
    let mut out = PickedFiles {
        files: Vec::new(),
        skipped: Vec::new(),
    };
    let mut total = 0u64;
    for path in paths {
        let name = name_of(path);
        let room = PICK_FILE_MAX.min(PICK_TOTAL_MAX - total);
        let reason = match verso_core::read_picked(path, room) {
            Ok(bytes) if !name.is_empty() => {
                total += bytes.len() as u64;
                out.files.push(PickedFile {
                    name,
                    base64: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
                    token: None,
                });
                continue;
            }
            Ok(_) => PickSkip::NotAFile,
            Err(e) => skip_reason(e),
        };
        out.skipped.push(SkippedPick { name, reason });
    }
    out
}

/// A closed window's choices go with it: a token holds a path for the life
/// of the process otherwise.
pub(crate) fn drop_picks(window: &str) {
    if let Ok(mut held) = HELD.lock() {
        held.retain(|_, h| h.window != window);
    }
    if let Ok(mut dropped) = DROPPED.lock() {
        dropped.remove(window);
    }
}

/// The files dropped on a window from the system's file manager and not
/// taken yet (T.11): window → their paths. Tauri's own drop event carries
/// the paths to this side; they stay here (rule 4) and the window gets the
/// names, then asks `take_dropped`. A new drop replaces an untaken one.
static DROPPED: std::sync::LazyLock<Mutex<std::collections::HashMap<String, Vec<PathBuf>>>> =
    std::sync::LazyLock::new(Mutex::default);

/// How many files of one drop are kept: a drop of a whole disk is not a
/// list the window should be handed.
const DROP_MOST: usize = 500;

/// Keep what was dropped on `window` and answer the files' names (a drop
/// of a folder holds the folder: `take_dropped` names it as skipped).
pub(crate) fn stash_drop(window: &str, paths: Vec<PathBuf>) -> Vec<String> {
    let paths: Vec<PathBuf> = paths.into_iter().take(DROP_MOST).collect();
    let names = paths.iter().map(|p| name_of(p)).collect();
    if let Ok(mut dropped) = DROPPED.lock() {
        dropped.insert(window.to_owned(), paths);
    }
    names
}

/// The paths a window has not taken, taken now.
fn take_stash(window: &str) -> Vec<PathBuf> {
    DROPPED
        .lock()
        .ok()
        .and_then(|mut d| d.remove(window))
        .unwrap_or_default()
}

/// A file drag over a window of a folder, or its drop (T.11). Tauri's drag
/// and drop handler hands the host the paths: a drop is kept here
/// (`stash_drop`) and the window is told its position and the files'
/// names; a drag over is told as a position only. A window that is not a
/// folder's — a note's, a web page's — takes no files.
pub(crate) fn dragged<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    drag: &tauri::DragDropEvent,
) {
    use tauri::DragDropEvent;
    if label != "main" && !label.starts_with("window-") {
        return;
    }
    let scale = app
        .get_window(label)
        .and_then(|w| w.scale_factor().ok())
        .filter(|s| *s > 0.0)
        .unwrap_or(1.0);
    // Whole CSS pixels: the window's coordinates, not the screen's.
    let at = |p: &tauri::PhysicalPosition<f64>| {
        ((p.x / scale).round() as i32, (p.y / scale).round() as i32)
    };
    let _ = match drag {
        DragDropEvent::Enter { position, .. } | DragDropEvent::Over { position } => {
            let (x, y) = at(position);
            app.emit_to(label, "files-over", FilesOver { over: true, x, y })
        }
        DragDropEvent::Leave => app.emit_to(
            label,
            "files-over",
            FilesOver {
                over: false,
                x: 0,
                y: 0,
            },
        ),
        DragDropEvent::Drop { paths, position } => {
            let (x, y) = at(position);
            let names = stash_drop(label, paths.clone());
            app.emit_to(label, "files-dropped", FilesDropped { x, y, names })
        }
        _ => Ok(()),
    };
}

#[cfg(test)]
pub(crate) fn take_stash_for_test(window: &str) -> Vec<PathBuf> {
    take_stash(window)
}

#[cfg(test)]
pub(crate) fn settle_picks_for_test(
    window: &str,
    on_server: bool,
    as_bytes: bool,
    paths: &[PathBuf],
    max_mb: u32,
) -> PickedFiles {
    settle_picks(window, on_server, as_bytes, paths, max_mb)
}

/// What a set of paths becomes for a window: on a server's folder, or when
/// the window wants the bytes, each file's name and bytes (at most 32 MiB
/// each); otherwise a name and a token, with the limit the person set.
fn settle_picks(
    window: &str,
    on_server: bool,
    as_bytes: bool,
    paths: &[PathBuf],
    max_mb: u32,
) -> PickedFiles {
    if on_server || as_bytes {
        read_picks(paths)
    } else {
        hold_picks(window, paths, max_mb)
    }
}

/// What the person chose for a window on this computer's own folder: each
/// file measured (no byte read) and held under a token, for `create_picked`
/// to copy. One past `max_mb` — or the rest past 8 times it — is named in
/// `skipped`.
pub(crate) fn hold_picks(window: &str, paths: &[PathBuf], max_mb: u32) -> PickedFiles {
    let max = u64::from(max_mb.clamp(1, PICK_CEILING_MB)) * 1024 * 1024;
    let mut out = PickedFiles {
        files: Vec::new(),
        skipped: Vec::new(),
    };
    let Ok(mut held) = HELD.lock() else {
        return out;
    };
    held.retain(|_, h| h.window != window);
    let mut total = 0u64;
    for path in paths {
        let name = name_of(path);
        let room = max.min((max * PICK_TOTAL_TIMES).saturating_sub(total));
        let reason = match verso_core::check_picked(path, room) {
            Ok(len) if !name.is_empty() => {
                total += len;
                let token = format!(
                    "pick-{}",
                    NEXT_TOKEN.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
                );
                held.insert(
                    token.clone(),
                    Held {
                        window: window.to_owned(),
                        path: path.clone(),
                        max,
                    },
                );
                out.files.push(PickedFile {
                    name,
                    base64: None,
                    token: Some(token),
                });
                continue;
            }
            Ok(_) => PickSkip::NotAFile,
            Err(e) => skip_reason(e),
        };
        out.skipped.push(SkippedPick { name, reason });
    }
    out
}

/// Open the system's file picker, several files at once ("Import files…",
/// A11Y.10). The paths stay on this side (rule 4). For a window on this
/// computer's own folder, what comes back is each file's name and a token
/// (`max_mb`: the most the person allows one file, 1 to 1024): no byte
/// crosses, `create_picked` copies it. For a window on a server's folder it
/// is the name and the bytes (at most 32 MiB each), and the window creates
/// them with `create_file`. Empty when cancelled. The picker and the reads
/// run off the event loop.
#[tauri::command]
#[specta::specta]
pub(crate) async fn pick_files<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    state: State<'_, App>,
    max_mb: u32,
) -> Result<PickedFiles, ContractError> {
    let on_server = state
        .remotes
        .lock()
        .map(|r| r.contains_key(window.label()))
        .unwrap_or(false);
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let parent = window.clone();
    app.dialog()
        .file()
        .set_parent(&parent)
        .pick_files(move |picked| {
            let _ = tx.try_send(picked);
        });
    let picked = rx.recv().await.flatten().unwrap_or_default();
    let paths: Vec<PathBuf> = picked
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .collect();
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        settle_picks(&label, on_server, false, &paths, max_mb)
    })
    .await
    .map_err(|e| failed(format!("reading the chosen files: {e}")))
}

/// The files the person dropped on this window from the system's file
/// manager (T.11), after the host told the window `files-dropped`: what
/// `pick_files` answers for a chosen file — a name and a token for a
/// window on this computer's own folder (`max_mb`: the most the person
/// allows one file, up to 1 GiB; no byte crosses, `create_picked` copies
/// it), a name and the bytes (at most 32 MiB each) when the window asks
/// `as_bytes` — a note or a board taking the file in — or shows a server's
/// folder. Empty when nothing is waiting: a drop is taken once.
#[tauri::command]
#[specta::specta]
pub(crate) async fn take_dropped<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    max_mb: u32,
    as_bytes: bool,
) -> Result<PickedFiles, ContractError> {
    let on_server = state
        .remotes
        .lock()
        .map(|r| r.contains_key(window.label()))
        .unwrap_or(false);
    let paths = take_stash(window.label());
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        settle_picks(&label, on_server, as_bytes, &paths, max_mb)
    })
    .await
    .map_err(|e| failed(format!("reading the dropped files: {e}")))
}

/// Copy a file `pick_files` named by token into the open folder at `path`
/// (relative, confined, written atomically, `exists` when something stands
/// there), and answer the confined path. The bytes are read here and handed
/// to the core: they never cross to the window. A token serves once (a
/// name taken is not a use).
#[tauri::command]
#[specta::specta]
pub(crate) async fn create_picked<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    token: String,
    path: String,
) -> Result<String, ContractError> {
    let (file, max) = {
        let held = HELD
            .lock()
            .map_err(|_| failed("the chosen files are not readable".to_owned()))?;
        let h = held
            .get(&token)
            .filter(|h| h.window == window.label())
            .ok_or_else(|| {
                refused("that file was not chosen by this window, or was already copied")
            })?;
        (h.path.clone(), h.max)
    };
    // Copied in pieces (`PICK_CHUNK`) off the event loop: the file is never
    // whole in memory, and a name taken answers before a byte is read.
    let service = Arc::clone(&state.service);
    let label = window.label().to_owned();
    let made = tauri::async_runtime::spawn_blocking(move || {
        service.with(&label, |ws| {
            ws.create_file_from_picked(&path, &file, max)
                .map_err(|e| match e {
                    verso_core::PickedCreateError::Picked(verso_core::PickedError::TooLarge) => {
                        refused("the file is larger than the limit").into()
                    }
                    verso_core::PickedCreateError::Picked(e) => failed(e.to_string()).into(),
                    verso_core::PickedCreateError::Core(e) => OpError::from(e),
                })
        })
    })
    .await
    .map_err(|e| failed(format!("copying the chosen file: {e}")))?;
    // A name taken leaves the token, so that the window may try the next
    // free name; anything else ends it.
    if !matches!(&made, Err(e) if e.kind == ErrorKind::Exists)
        && let Ok(mut held) = HELD.lock()
    {
        held.remove(&token);
    }
    made
}

/// Create a folder inside the open folder; returns its confined path.
#[tauri::command]
#[specta::specta]
pub(crate) fn create_folder<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<String, ContractError> {
    with(&state, &window, |ws| ops::create_folder(ws, path))
}

/// Move a note to `.trash/` at the root, Obsidian's bin; answers where it
/// went, with what could not be confirmed once it was there.
#[tauri::command]
#[specta::specta]
pub(crate) fn delete_note<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<Trashed, ContractError> {
    with(&state, &window, |ws| {
        let gone = ws.delete_note(&path)?;
        crate::trash::record(ws, &gone, None);
        Ok(verso_service::convert::trashed_out(gone))
    })
}

/// Rename or move a note. The file moves; the notes whose links reached
/// it come back as rewrites — before, after, revision — for the UI to
/// show and apply through `write_note` (ADR 0048, option (b)); the ones
/// that could not be planned are listed as skipped.
#[tauri::command]
#[specta::specta]
pub(crate) fn rename_note<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    from: String,
    to: String,
) -> Result<Renamed, ContractError> {
    with(&state, &window, |ws| ops::rename_note(ws, from, to))
}

/// Every entry of the folder as the last walk saw it, with kind, size
/// and date: what a folder view lists and sorts.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_entries<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<FileEntry>, ContractError> {
    with(&state, &window, ops::list_entries)
}

/// Rename or move anything of the folder: a note, another file or a
/// folder with everything under it. Links to what moved come back as
/// rewrites, like `rename_note` (ADR 0048, option (b)).
#[tauri::command]
#[specta::specta]
pub(crate) fn rename_entry<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    from: String,
    to: String,
) -> Result<Renamed, ContractError> {
    with(&state, &window, |ws| ops::rename_entry(ws, from, to))
}

/// Move several entries of the folder into `folder` (`""` the root) at
/// once, with one plan of link rewrites (ADR 0048, revised 2026-10-07).
#[tauri::command]
#[specta::specta]
pub(crate) fn move_entries<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    paths: Vec<String>,
    folder: String,
) -> Result<MovedEntries, ContractError> {
    with(&state, &window, |ws| ops::move_entries(ws, paths, folder))
}

/// Move anything of the folder — a file or a whole folder — to `.trash/`
/// at the root; answers where it went.
#[tauri::command]
#[specta::specta]
pub(crate) fn delete_entry<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<Trashed, ContractError> {
    with(&state, &window, |ws| {
        let gone = ws.delete_entry(&path)?;
        crate::trash::record(ws, &gone, None);
        Ok(verso_service::convert::trashed_out(gone))
    })
}

/// Show an entry in the system's file manager. The absolute path is
/// formed here, at the edge, and goes to the operating system only; it
/// never crosses back to the UI (ADR 0026 rule 4).
#[tauri::command]
#[specta::specta]
pub(crate) fn reveal<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<(), ContractError> {
    let absolute = with(&state, &window, |ws| Ok(ws.absolute(&path)?))?;
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.arg("-R").arg(&absolute);
        c
    };
    // Explorer selects the entry in its folder; `/select,` takes the path
    // in quotes, which Rust's own quoting would put around the whole
    // argument (ADR 0069).
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("explorer");
        c.raw_arg(format!("/select,\"{}\"", absolute.display()));
        c
    };
    // The file manager's own D-Bus interface selects the entry (Nautilus,
    // Dolphin and others implement org.freedesktop.FileManager1, ADR 0071);
    // without it, the folder is opened.
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let uri = file_uri(&absolute);
        let selected = std::process::Command::new("gdbus")
            .args([
                "call",
                "--session",
                // A file manager that does not answer must not hold the
                // window: this command runs on its main thread.
                "--timeout",
                "3",
                "--dest",
                "org.freedesktop.FileManager1",
                "--object-path",
                "/org/freedesktop/FileManager1",
                "--method",
                "org.freedesktop.FileManager1.ShowItems",
                &format!("['{uri}']"),
                "",
            ])
            .output()
            .is_ok_and(|o| o.status.success());
        if selected {
            return Ok(());
        }
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    let mut command = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(absolute.parent().unwrap_or(&absolute));
        c
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| failed(e.to_string()))
}

/// A path as a `file://` URI, every byte outside the unreserved set and `/`
/// percent-encoded (a quote in a name cannot end the D-Bus argument).
#[cfg(not(any(target_os = "macos", windows)))]
fn file_uri(path: &Path) -> String {
    use std::os::unix::ffi::OsStrExt;
    let mut uri = String::from("file://");
    for &b in path.as_os_str().as_bytes() {
        if b.is_ascii_alphanumeric() || b"-._~/".contains(&b) {
            uri.push(char::from(b));
        } else {
            uri.push_str(&format!("%{b:02X}"));
        }
    }
    uri
}

/// Copy the absolute path of an entry to the system clipboard.
/// Formed here at the edge, goes to the operating system's clipboard directly;
/// no absolute path crosses back to the UI (ADR 0026 rule 4).
#[tauri::command]
#[specta::specta]
pub(crate) fn copy_full_path<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<(), ContractError> {
    let absolute = with(&state, &window, |ws| Ok(ws.absolute(&path)?))?;
    let text = absolute.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        let mut child = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| failed(e.to_string()))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .map_err(|e| failed(e.to_string()))?;
        }
        child.wait().map_err(|e| failed(e.to_string()))?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        let mut child = std::process::Command::new("clip")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| failed(e.to_string()))?;
        // `clip` reads the ANSI code page unless the text opens with a
        // UTF-16 byte order mark: "Capitão" would arrive mangled (ADR 0069).
        let utf16: Vec<u8> = std::iter::once(0xFEFF_u16)
            .chain(text.encode_utf16())
            .flat_map(u16::to_le_bytes)
            .collect();
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(&utf16).map_err(|e| failed(e.to_string()))?;
        }
        child.wait().map_err(|e| failed(e.to_string()))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        use std::io::Write;
        let cmd = if std::process::Command::new("which")
            .arg("wl-copy")
            .output()
            .is_ok_and(|o| o.status.success())
        {
            "wl-copy"
        } else {
            "xclip"
        };
        let mut c = std::process::Command::new(cmd);
        if cmd == "xclip" {
            c.args(["-selection", "clipboard"]);
        }
        // Neither is there: say what to install (ADR 0071, item 7).
        let mut child =
            c.stdin(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| match e.kind() {
                    std::io::ErrorKind::NotFound => failed(
                        "no clipboard tool: install wl-clipboard (Wayland) or xclip (X11)"
                            .to_owned(),
                    ),
                    _ => failed(format!("{cmd}: {e}")),
                })?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .map_err(|e| failed(e.to_string()))?;
        }
        child.wait().map_err(|e| failed(e.to_string()))?;
        Ok(())
    }
}

/// Bring down a file of the folder whose content is only in the cloud,
/// because the user opened it (ADR 0043, amended on 2026-09-30): true when
/// it was fetched, false when there was nothing to fetch; the window then
/// reads it again. Off the main thread and outside the folder's lock — a
/// download takes seconds, and the rest of the window goes on meanwhile.
#[tauri::command]
#[specta::specta]
pub(crate) async fn fetch_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
) -> Result<bool, ContractError> {
    let state = app.state::<App>();
    let Some(placeholder) = with(&state, &window, |ws| Ok(ws.placeholder(&path)?))? else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || placeholder.fetch())
        .await
        .map_err(|e| failed(format!("fetching {path}: {e}")))?
        .map_err(|e| failed(format!("fetching {path} from the cloud: {e}")))?;
    Ok(true)
}

/// What bringing the placeholders among `paths` down would take: how many
/// of them still are, their sizes added, and the room the disk has left
/// (ADR 0043, decided 2026-10-27). Asked before a download from the sync
/// card starts; reads the listing, never the files.
#[tauri::command]
#[specta::specta]
pub(crate) fn placeholder_plan<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    paths: Vec<String>,
) -> Result<verso_contract::PlaceholderPlan, ContractError> {
    with(&state, &window, |ws| {
        let wanted: std::collections::HashSet<&str> = paths.iter().map(String::as_str).collect();
        let mut plan = verso_contract::PlaceholderPlan::default();
        for e in ws.entries() {
            if e.kind == verso_core::FileKind::Placeholder && wanted.contains(e.path.as_str()) {
                plan.count = plan.count.saturating_add(1);
                plan.bytes += e.len as f64;
            }
        }
        plan.free = match ws.free_space() {
            Ok(n) => Some(n as f64),
            Err(e) => {
                log::write(
                    "WARN",
                    "host",
                    &format!("could not tell the free space of the folder's disk: {e:?}"),
                );
                None
            }
        };
        Ok(plan)
    })
}

/// Any file as text with its revision, for the editor of files that are
/// not notes; `not_text` when its bytes are not UTF-8.
#[tauri::command]
#[specta::specta]
pub(crate) fn read_text<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<TextFile, ContractError> {
    with(&state, &window, |ws| ops::read_text(ws, path))
}

/// Write any file's text over the revision that was read; a changed file
/// is refused (invariant 11) and the UI shows the difference. The answer
/// is the text that was sent, with the revision of those bytes.
#[tauri::command]
#[specta::specta]
pub(crate) fn write_text<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
    text: String,
    revision: String,
) -> Result<TextFile, ContractError> {
    let (p, t) = (path.clone(), text.clone());
    let written = with(&state, &window, |ws| {
        ops::write_text(ws, path, text, revision)
    })?;
    // A live text file of a synced folder, written by its tab while out of
    // its room: the tab's own (ADR 0082 items 6 and 8, item 12).
    wrote(window.app_handle(), window.label(), &p, &t);
    Ok(written)
}
