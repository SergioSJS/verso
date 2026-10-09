//! Files and folders: created, renamed, binned, revealed, their paths copied,
//! listed with their details, and text files read and written.

use super::*;

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
    with(&state, &window, |ws| ws.create_note(&name, &text)).map(note_out)
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
    let bytes = decode_base64(&base64).ok_or_else(|| failed("the bytes are not base64"))?;
    with(&state, &window, |ws| ws.create_file(&path, &bytes))
}

/// Standard base64 (with or without padding) to bytes; `None` on a
/// character outside the alphabet. Small enough to own, so no crate.
fn decode_base64(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b'\n' | b'\r' => continue,
            _ => return None,
        };
        acc = (acc << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(u8::try_from((acc >> bits) & 0xff).unwrap_or(0));
        }
    }
    Some(out)
}

/// Create a folder inside the open folder; returns its confined path.
#[tauri::command]
#[specta::specta]
pub(crate) fn create_folder<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<String, ContractError> {
    with(&state, &window, |ws| ws.create_folder(&path))
}

fn trashed_out(t: verso_core::Trashed) -> Trashed {
    Trashed {
        path: t.path,
        warnings: t.warnings,
    }
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
    with(&state, &window, |ws| ws.delete_note(&path)).map(trashed_out)
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
    with(&state, &window, |ws| ws.rename_note(&from, &to)).map(renamed_out)
}

fn renamed_out(r: verso_core::Renamed) -> Renamed {
    Renamed {
        path: r.path,
        rewrites: r
            .rewrites
            .into_iter()
            .map(|w| LinkRewrite {
                path: w.path,
                revision: w.revision,
                before: w.before,
                after: w.after,
            })
            .collect(),
        skipped: r
            .skipped
            .into_iter()
            .map(|s| Skipped {
                path: s.path,
                reason: match s.reason {
                    verso_core::SkipReason::Unavailable => SkipReason::Unavailable,
                    verso_core::SkipReason::NotText => SkipReason::NotText,
                    verso_core::SkipReason::Failed => SkipReason::Failed,
                },
            })
            .collect(),
        warnings: r.warnings,
        also: r
            .also
            .into_iter()
            .map(|(from, to)| verso_contract::Moved { from, to })
            .collect(),
    }
}

/// Every entry of the folder as the last walk saw it, with kind, size
/// and date: what a folder view lists and sorts.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_entries<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<FileEntry>, ContractError> {
    with(&state, &window, |ws| {
        let labels = ws.labels()?;
        // A folder's labels are its folder note's: the first of the core's
        // candidates that is a note, compared without case — the note the
        // window takes for the folder's, labelled or not.
        let notes: std::collections::HashMap<String, &str> = ws
            .entries()
            .iter()
            .filter(|e| matches!(e.kind, verso_core::FileKind::Note))
            .map(|e| (e.path.to_lowercase(), e.path.as_str()))
            .collect();
        Ok(ws
            .entries()
            .iter()
            .map(|e| {
                let label = match e.kind {
                    verso_core::FileKind::Folder => {
                        verso_core::folder_note_candidates(&e.path, ws.folder_note_name())
                            .iter()
                            .find_map(|c| notes.get(&c.to_lowercase()))
                            .and_then(|found| labels.get(*found))
                    }
                    _ => labels.get(&e.path),
                }
                .map(|l| EntryLabel {
                    sticker: l.sticker.clone(),
                    color: l.color.clone(),
                    alias: l.alias.clone(),
                    order: l.order.clone(),
                    pinned: l.pinned.clone(),
                });
                FileEntry {
                    path: e.path.clone(),
                    kind: match e.kind {
                        verso_core::FileKind::Note => FileKind::Note,
                        verso_core::FileKind::File => FileKind::File,
                        verso_core::FileKind::Folder => FileKind::Folder,
                        verso_core::FileKind::Placeholder => FileKind::Placeholder,
                    },
                    size: e.len as f64,
                    modified: e.modified as f64,
                    label,
                }
            })
            .collect())
    })
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
    with(&state, &window, |ws| ws.rename_entry(&from, &to)).map(renamed_out)
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
    with(&state, &window, |ws| ws.move_entries(&paths, &folder)).map(|m| {
        let renamed = renamed_out(verso_core::Renamed {
            path: String::new(),
            rewrites: m.rewrites,
            skipped: m.skipped,
            warnings: m.warnings,
            also: m.also,
        });
        MovedEntries {
            moved: m
                .moved
                .into_iter()
                .map(|(from, to)| verso_contract::Moved { from, to })
                .collect(),
            refused: m
                .refused
                .into_iter()
                .map(|(path, e)| RefusedEntry {
                    path,
                    error: convert(e),
                })
                .collect(),
            rewrites: renamed.rewrites,
            skipped: renamed.skipped,
            warnings: renamed.warnings,
            also: renamed.also,
        }
    })
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
    with(&state, &window, |ws| ws.delete_entry(&path)).map(trashed_out)
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
    let absolute = with(&state, &window, |ws| ws.absolute(&path))?;
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
    let absolute = with(&state, &window, |ws| ws.absolute(&path))?;
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

pub(crate) fn text_out(t: verso_core::TextFile) -> TextFile {
    TextFile {
        path: t.path,
        text: t.text,
        revision: t.revision,
        warnings: t.warnings,
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
    let Some(placeholder) = with(&state, &window, |ws| ws.placeholder(&path))? else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || placeholder.fetch())
        .await
        .map_err(|e| failed(format!("fetching {path}: {e}")))?
        .map_err(|e| failed(format!("fetching {path} from the cloud: {e}")))?;
    Ok(true)
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
    with(&state, &window, |ws| ws.read_text(&path)).map(text_out)
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
    with(&state, &window, |ws| ws.write_text(&path, &text, &revision)).map(text_out)
}
