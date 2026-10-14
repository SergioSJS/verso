// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A version brought back while its note is live (ADR 0091 item 5): it
//! goes through the room — one edit every window in it sees at once, then
//! written — never behind the room's back, where the room would take it
//! for a change from outside and stop for its people to choose.

use super::*;

/// Bring `bytes`, a version of the file at `path`, back through its room:
/// over the revision the window read — refused as `changed`, nothing
/// written, when the room has written since or stopped on a change from
/// outside (invariant 11) — as one edit, then written at once; the
/// revision written. `Ok(None)` when no room takes it and the caller
/// writes the file: no room; a board with nothing waiting (its windows
/// draw the file again, as after any change from outside); a text whose
/// line ends are mixed, which a room cannot hold.
pub fn restore_through(
    server: &Server,
    key: &str,
    path: &str,
    bytes: &[u8],
    revision: Option<&str>,
) -> Result<Option<String>, ContractError> {
    let Some(room) = server.rooms.get(key, path) else {
        return Ok(None);
    };
    {
        let mut r = lock(&room);
        if r.conflict {
            return Err(changed("the file changed on disk: choose first"));
        }
        if revision != Some(r.revision.as_str()) {
            return Err(changed("the note changed since it was read"));
        }
        if r.kind == Kind::Board {
            if r.waiting() {
                return Err(changed(
                    "the board is being edited: restore once its edits are saved",
                ));
            }
            return Ok(None);
        }
        let Some((text, crlf)) = std::str::from_utf8(bytes).ok().and_then(normalized) else {
            return Ok(None);
        };
        if let Some(update) = apply_text(&r.doc, &text) {
            tell(
                server,
                &r,
                None,
                &event("collab-update", path, "update", &json!(b64(&update))),
            );
        }
        r.crlf = crlf;
    }
    write(server, &room).map(Some)
}
