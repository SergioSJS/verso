// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Who the person is at a synced folder (ADR 0113 sections A–C, S8): the
//! window never derives its seat, it is the server's `FolderAccess`, asked
//! over the sync's link as the server's own `capabilities` and kept with the
//! folder's sync, so that the last answer holds while the server is out of
//! reach.

use serde_json::Value;

use super::*;

impl Syncer {
    /// The server's answer for this folder, as last kept (`None` before any).
    pub(crate) fn seat(&self) -> Option<Value> {
        lock(&self.seat).clone()
    }
}

/// Ask the server who this device is at the folder, if that is stale; the
/// windows are told when the answer differs from the one kept. A question
/// that fails leaves the last answer standing and stale.
pub(super) async fn refresh(ctx: &Ctx, s: &Syncer) {
    if !s.seat_stale.load(Ordering::Relaxed) {
        return;
    }
    let Some(remote) = s.live.remote() else {
        return;
    };
    let answer = match remote.call("capabilities", json!({})).await {
        Ok(a) => a,
        Err(e) => {
            log::write(
                "WARN",
                "sync",
                &format!("asking the server who this device is here: {e}"),
            );
            return;
        }
    };
    s.seat_stale.store(false, Ordering::Relaxed);
    let next = Some(answer["access"].clone()).filter(|a| !a.is_null());
    let changed = {
        let mut kept = lock(&s.seat);
        let changed = *kept != next;
        *kept = next;
        changed
    };
    if changed {
        let windows = ctx.service.clients_of(&s.key);
        (ctx.told)(&windows, "seat-changed", &Value::Null);
    }
}

#[cfg(test)]
impl Syncer {
    pub(crate) fn forget_seat(&self) {
        *lock(&self.seat) = None;
    }
}
