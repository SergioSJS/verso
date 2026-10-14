// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file's text crosses UniVerso 16 MB at most (the review of
//! 2026-10-13). `read_note`, `read_text` and `read_file_text` read the
//! whole file, and the server escapes it into JSON and sends it in one
//! message: one read of a large file held several times its size on a
//! host of 1 GB. The server asks the file's length on disk before the
//! core reads it, and refuses a text to write past the same size, so that
//! what is written reads back. The desktop app reads the person's own
//! files without this bound: it is the server's (ADR 0083).

use serde_json::Value;
use verso_contract::{ContractError, ErrorKind};
use verso_core::Workspace;

/// The most of a file's text one answer or one write carries whole:
/// 16 MB, more than any note or text a person edits by hand. A larger file
/// is still a file of the folder — synced, served under `/f/`, listed —
/// only not opened as text.
pub const TEXT_MOST: u64 = 16 * 1024 * 1024;

fn too_large(len: u64) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: format!(
            "a file of {} MB is too large to open as text: 16 MB at most",
            len.div_ceil(1024 * 1024)
        ),
    }
}

/// The file `path` within [`TEXT_MOST`], by its length on disk, before a
/// byte of it is read; a note by the path its command reads
/// (`source_key`). A path the folder refuses or that names nothing is left
/// to the read, which says why.
pub fn readable(ws: &mut Workspace, note: bool, path: &str) -> Result<(), ContractError> {
    let key = if note {
        match ws.source_key(path) {
            Ok(key) => key,
            Err(_) => return Ok(()),
        }
    } else {
        path.to_owned()
    };
    match ws.file_len(&key) {
        Some(len) if len > TEXT_MOST => Err(too_large(len)),
        _ => Ok(()),
    }
}

/// A text to write within [`TEXT_MOST`].
pub fn writable(text: &str) -> Result<(), ContractError> {
    let len = u64::try_from(text.len()).unwrap_or(u64::MAX);
    if len > TEXT_MOST {
        return Err(too_large(len));
    }
    Ok(())
}

/// The folder command `name` with `args` judged before the core runs it:
/// a read of a text past [`TEXT_MOST`], or a write of one, refused.
pub fn judged(ws: &mut Workspace, name: &str, args: &Value) -> Result<(), ContractError> {
    let field = |f: &str| args.get(f).and_then(Value::as_str);
    match name {
        "read_note" => field("path").map_or(Ok(()), |p| readable(ws, true, p)),
        "read_text" | "read_file_text" => field("path").map_or(Ok(()), |p| readable(ws, false, p)),
        "write_note" | "write_text" | "create_note" => field("text").map_or(Ok(()), writable),
        "write_board" => field("json").map_or(Ok(()), writable),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A text to write past the bound is refused, by the commands that
    /// write one; a smaller one and the other commands pass.
    #[test]
    fn a_text_to_write_past_16_mb_is_refused() {
        let big = "a".repeat(usize::try_from(TEXT_MOST).unwrap() + 1);
        assert!(writable(&big).is_err());
        assert!(writable("# Nota\n").is_ok());
        let dir = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        let mut ws = Workspace::open(dir.path(), Some(config.path())).unwrap();
        for (name, field) in [
            ("write_note", "text"),
            ("write_text", "text"),
            ("create_note", "text"),
            ("write_board", "json"),
        ] {
            let refused = judged(&mut ws, name, &serde_json::json!({ field: big }));
            assert!(
                refused.as_ref().is_err_and(|e| e.message.contains("16 MB")),
                "{name}: {refused:?}"
            );
        }
        assert!(judged(&mut ws, "list_notes", &serde_json::json!({ "x": big })).is_ok());
    }
}
