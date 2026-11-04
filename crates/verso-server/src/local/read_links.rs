// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Read links in "this app is a server" (ADR 0117 D9, build step S12; ADR
//! 0105): the owner makes them from the window at the table, as on a
//! UniVerso (`crate::readlinks`, through the seat's door); whoever holds
//! one reads what it names at `/r/<token>`, on the network and through
//! the internet link (`crate::visit`).
//!
//! The switch that turns links on is the administrator's and starts off
//! (ADR 0105 item 3); here the owner is the administrator and the app's
//! section is the console (ADR 0117 D9), so it is [`LocalServer::set_read_links`].
//! `[OPEN]` for the maintainer: whether the section shows it as a switch
//! or the first link turns it on — the smallest choice is kept: a switch,
//! off.
//!
//! A link never opens a folder served in part, whatever was made before
//! (`crate::readlinks::live`), nor one no longer served.

use super::{LocalServer, lock};
use crate::db::Audit;

impl LocalServer {
    /// Whether read links are on for this computer's server.
    pub fn read_links_on(&self) -> Result<bool, String> {
        self.with_db(crate::db::Db::read_links_on)
    }

    /// Where this server's links are opened now: the internet link's
    /// origin while it has one, else the network's address, as an
    /// invitation's (`invites.rs`); `None` while it does not serve. A read
    /// link made from the window at the table is said with it, so a link
    /// turned on after the window sat is the one handed out.
    #[must_use]
    pub fn links_base(&self) -> Option<String> {
        lock(&self.shared.inner)
            .as_ref()
            .and_then(super::invites::base)
    }

    /// Read links on or off (ADR 0105 item 3). Off ends every link at once,
    /// open pages included; the links are kept and open again when it is
    /// turned on. In the audit.
    pub fn set_read_links(&self, on: bool) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        let action = if on {
            "read_links_on"
        } else {
            "read_links_off"
        };
        let audited = Audit {
            actor: None,
            action,
            subject: None,
            folder: None,
            address: None,
            ok: true,
        };
        if let Some(r) = running.as_ref() {
            r.server.db.set_read_links_on(on)?;
            if !on {
                r.server.links.end_all();
            }
            r.server.db.audit(&audited)?;
        } else {
            drop(running);
            let db = self.open_db()?;
            db.set_read_links_on(on)?;
            db.audit(&audited)?;
        }
        crate::log::info(&format!(
            "read links are now {}",
            if on { "on" } else { "off" }
        ));
        (self.shared.events)(super::Event::Changed);
        Ok(())
    }
}
