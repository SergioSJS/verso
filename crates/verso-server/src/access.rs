// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Who may do what in a folder (ADR 0073 item 5, ADR 0074 items 6 and 8):
//! the member's role, narrowed by a personal access token to its folders
//! and to reading when it reads only. An admin has no role in a folder
//! that was not granted (ADR 0074 item 6, decided 2026-10-09).

use crate::auth::Who;
use crate::db::{Folder, Role};
use crate::http::{ApiError, ApiResult};
use crate::state::Server;

/// The folder `id` and the role `who` has in it; 404 when it has none —
/// a folder one may not see is one that does not exist, to them.
pub fn role(server: &Server, who: &Who, id: &str) -> ApiResult<(Folder, Role)> {
    let folder = server.db.folder(id)?.ok_or_else(ApiError::not_found)?;
    let (reaches, writes) = who.reaches(id);
    if !reaches {
        return Err(ApiError::not_found());
    }
    let role = server
        .db
        .role(id, &who.account.id)?
        .ok_or_else(ApiError::not_found)?;
    let role = if writes { role } else { role.min(Role::Reader) };
    // A phone is never an owner, whatever the owner's role in the folder
    // (ADR 0096 item 12).
    let role = if who.phone.is_some() {
        role.min(Role::Editor)
    } else {
        role
    };
    Ok((folder, role))
}

/// The folder and the member's role, which must be at least `least`.
pub fn at_least(server: &Server, who: &Who, id: &str, least: Role) -> ApiResult<(Folder, Role)> {
    let (folder, role) = role(server, who, id)?;
    if role < least {
        return Err(ApiError::forbidden(format!("{} only", least.as_str())));
    }
    Ok((folder, role))
}

/// The key the core opens a registered folder under.
pub fn key(server: &Server, folder: &Folder) -> ApiResult<String> {
    let path = server
        .folder_path(&folder.dir)
        .ok_or_else(|| ApiError::from(format!("not a folder name: {}", folder.dir)))?;
    Ok(verso_core::folder_key(&path))
}
