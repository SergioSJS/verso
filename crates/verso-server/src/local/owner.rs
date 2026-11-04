// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The owner's name as the players see it (ADR 0117; the test of
//! 2026-11-04: players read "This computer", in English, as the game
//! master's name in the chat, the rolls, the roster and a read link's
//! "made by"). It is the UniVerso's own account name — what `PATCH
//! /api/me` sets for a person on a UniVerso (`Db::set_profile`) — of the
//! local owner's account; the host sets it from the system's user at the
//! first use, and the person in Settings. Its e-mail is this computer's
//! inner address and is never shown to a player (`crate::shares`).
//! `[OPEN]` for the maintainer: the smallest choice, one field in Settings
//! defaulting to the system's user; ADR 0117 does not say.

use super::LocalServer;
use crate::db::{Db, LOCAL_OWNER_UNNAMED};

/// The most a name takes, as a UniVerso account's (`api::check_name`).
const NAME_MOST: usize = 200;

/// `name` as an account's name: trimmed, not empty, 200 characters at
/// most, on one line.
fn clean(name: &str) -> Result<String, String> {
    let name: String = name.trim().chars().filter(|c| !c.is_control()).collect();
    if name.is_empty() {
        return Err("a name for the players".to_owned());
    }
    if name.chars().count() > NAME_MOST {
        return Err("a name of 200 characters at most".to_owned());
    }
    Ok(name)
}

fn rename(db: &Db, name: &str) -> Result<(), String> {
    let owner = db.local_owner()?;
    db.set_profile(&owner.id, name, &owner.lang)
}

impl LocalServer {
    /// The name the players see for this computer's owner.
    pub fn owner_name(&self) -> Result<String, String> {
        self.with_db(|db| Ok(db.local_owner()?.name))
    }

    /// The owner's name for the players, from Settings: what they see from
    /// now on — on the next answer or event that names the owner.
    pub fn set_owner_name(&self, name: &str) -> Result<String, String> {
        let name = clean(name)?;
        self.with_db(|db| rename(db, &name))?;
        crate::log::info("the owner's name for the players was changed at the computer");
        (self.shared.events)(super::Event::Changed);
        Ok(name)
    }

    /// The owner's name from the system's user (`name`, the host's), when
    /// the owner has none yet — a new server, or one a build before this
    /// one named "This computer". A name the person gave is kept.
    pub fn name_owner_if_unnamed(&self, name: &str) -> Result<(), String> {
        let Ok(name) = clean(name) else {
            return Ok(());
        };
        self.with_db(|db| {
            if db.local_owner()?.name == LOCAL_OWNER_UNNAMED {
                rename(db, &name)?;
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::clean;

    #[test]
    fn a_name_is_trimmed_on_one_line_and_bounded() {
        assert_eq!(clean("  Sérgio Sousa \n").unwrap(), "Sérgio Sousa");
        assert_eq!(clean("Ana\u{7}").unwrap(), "Ana");
        assert!(clean("   ").is_err());
        assert!(clean(&"x".repeat(201)).is_err());
        assert!(clean(&"x".repeat(200)).is_ok());
    }
}
