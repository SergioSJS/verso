// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A synced folder held open for a window seated at the table served from
//! it (ADR 0117 D13 Q3), when the hold cannot open the folder again: the
//! sync cannot run, and every window of the folder — the seated one
//! included — is told so, in its language, and may try again (the rule
//! that every act gives visible feedback, 2026-10-14).

use super::*;

impl Syncer {
    /// The seat could not open the folder for its hold (`why`, for the
    /// log): the sync's state is an error the windows say as `held`, with
    /// Sync now to try again.
    pub(crate) fn hold_failed(&self, ctx: &Ctx, why: &str) {
        let message = format!("the seat could not hold its folder for its sync: {why}");
        log::write("ERROR", "host", &message);
        self.set(ctx, |st| {
            st.state = "error".to_owned();
            st.message = Some(message);
            st.problem = Some("held".to_owned());
        });
    }

    /// Whether the sync waits for its hold (`hold_failed`).
    pub(crate) fn holding(&self) -> bool {
        lock(&self.status).problem.as_deref() == Some("held")
    }

    /// Wait for a reason to try the hold again — Sync now, a pause, a
    /// change seen — or for the sync's end: false once it ended.
    pub(crate) async fn woken(&self) -> bool {
        if !self.stopped() {
            self.wake.notified().await;
        }
        !self.stopped()
    }
}
