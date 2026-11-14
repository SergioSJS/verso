// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Undoing a table that moved to the other host (ADR 0117 D8, R9): the
//! decided way to clean up the old host. An undo as ADR 0110 item 1 built
//! it leaves the table's players as ordinary readers of the folder, who
//! would then read every note the table kept from them; on a moved table
//! nobody plays any more — its players were told it moved and to ask for a
//! new invitation on the new host — so what the table gave them goes with
//! it instead (the coordinator's review of R9, 2026-11-14: a visibility
//! leak, blocking). The undo of a table that did not move is unchanged.
//!
//! What goes is every place **at or inside** the table's folder that is not
//! an owner's: for a table of the whole folder, the folder's readers and
//! editors and the people of every share in it; for a table of a subfolder,
//! the people of the shares at that subfolder or inside it (the share a
//! table's invitation makes, and any other inside the table, whose people
//! read it through the table). A place beside the table, or one above it
//! (the folder's own grant, a share of a folder that holds the table) was
//! not made by the table and stays as it is. The invitations still pending
//! into the table end. Each removal and each ending is in the audit.

use crate::admin::acts::By;
use crate::campaign;
use crate::db::Role;
use crate::state::Server;

/// The windows a removal must reach, once the database has changed: the
/// folder's members taken out, and whether a share lost someone.
#[derive(Debug, Default)]
pub struct Freed {
    pub members: Vec<String>,
    pub shares: bool,
}

/// Take out of `folder` what the moved table at `root` gave its players,
/// acting as `actor`, before the table is dropped. Database only: the
/// caller tells the windows ([`tell`]).
pub fn free(server: &Server, folder: &str, root: &str, actor: &str) -> Result<Freed, String> {
    let db = &server.db;
    let by = By {
        actor: Some(actor),
        address: None,
    };
    let mut freed = Freed::default();
    if root.is_empty() {
        for (account, role) in db.members(folder)? {
            if role == Role::Owner {
                continue;
            }
            db.revoke(folder, &account.id)?;
            by.audit(db, "table_moved_revoke", Some(&account.id), Some(folder));
            freed.members.push(account.id);
        }
    }
    for share in db.shares_of(folder)? {
        if !campaign::covers(root, &share.path) {
            continue;
        }
        for (account, role) in db.share_people(&share.id)? {
            if role == Role::Owner {
                continue;
            }
            if db.revoke_share(&share.id, &account.id)? {
                by.audit(db, "table_moved_revoke", Some(&account.id), Some(folder));
                freed.shares = true;
            }
        }
    }
    for id in db.end_invitations_into(folder, root)? {
        by.audit(db, "invitation_ended", Some(&id), Some(folder));
    }
    Ok(freed)
}

/// The windows of the people taken out leave, told their place was revoked.
pub fn tell(server: &Server, folder: &str, freed: &Freed) {
    for account in &freed.members {
        server.role_changed(folder, account, None, "revoked");
    }
    if freed.shares {
        crate::shares::refresh(server, folder, "revoked");
    }
}
