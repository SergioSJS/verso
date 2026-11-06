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
    // A folder served in part is no phone's by its own id: only the shares
    // of the folders chosen inside it are the owner's phones' (ADR 0096
    // item 2, amended 2026-10-16), whatever grant was made. The folder is
    // its owner's (ADR 0117 R1, 2026-11-05): the owner's window sits at it,
    // and a player reaches what a share or a table gives them, as on a
    // UniVerso — the role below says it.
    if who.phone.is_some() && server.local.as_ref().is_some_and(|p| p.hides(id)) {
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

mod door;
pub use door::{
    Door, NO_DELETE_OWNER, NO_MOVE_OUT_OF_SHARE, asker_of, filtered, has_table, has_table_cached,
    log_role, may_client, projects, veiled,
};
mod rules;
pub use rules::{
    AccessFacts, Action, Asker, Cap, Kind, Level, Made, NodeSet, Reason, Right, Seat, TableFact,
    Target, Verdict, Why, may,
};

#[cfg(test)]
mod vectors;
