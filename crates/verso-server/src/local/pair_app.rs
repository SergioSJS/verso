// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The laptop's answer to "Was it you?" (ADR 0096 item 6, moved out of
//! `mod.rs`, ADR 0067), and the Verso app paired (ADR 0117, "The Verso app
//! paired"): a phone's or a tablet's Verso — or another computer's — pairs
//! with this computer on the home network by the dialog's eight letters,
//! learns this computer's key without trusting the network (`pin.rs`), and
//! keeps a copy of what it is given that it syncs whenever it is home.
//!
//! What the app is, here: one of the owner's phones — the same row, the same
//! four at most, reader or editor and never the owner, the hide lock of a
//! folder served in part, *Revoke*, *Forget all devices* and *Replace this
//! computer's identity* — whose session is a device's, a bearer token the
//! app keeps instead of a cookie, and which runs the sync's commands at its
//! role besides a phone's (`allow.rs`). Never through the internet link:
//! there the phone's browser pairs (ADR 0117 D5); the app pins this
//! computer's own key, which the tunnel does not show.

use std::net::IpAddr;
use std::time::Instant;

use super::pairing::{Ready, Redeemed};
use super::pin::{self, Side};
use super::{Event, LocalServer, PAIRED, Policy, link_pair, lock, owner_of};
use crate::db::{Db, Role};
use crate::state::Server;

/// The Verso app's proof, as `/api/pair` takes it.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct AppProof {
    /// The app's fresh nonce: the salt of the code's key.
    pub nonce: String,
    /// The app's proof over the key it saw (`pin::proof`, `Side::Phone`).
    pub proof: String,
}

impl Policy {
    /// The pin of this computer's key on the network, while it serves there.
    #[must_use]
    pub fn pin(&self) -> Option<String> {
        self.pin
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub(super) fn set_pin(&self, pin: Option<String>) {
        *self
            .pin
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = pin;
    }

    /// The name a paired app reaches this computer by, with the port.
    #[must_use]
    pub fn paired_host(&self, port: u16) -> Option<String> {
        self.pin().map(|p| format!("{}:{port}", pin::name(&p)))
    }

    /// A Verso app presented `ask`: its proof checked against this
    /// window's code over this computer's key, outside the pairing's lock
    /// (Argon2id takes a third of a second). Logged and audited as a
    /// token is ([`Policy::redeem`]); never the proof or the code.
    pub async fn redeem_app(
        &self,
        server: &Server,
        ask: &AppProof,
        device: &str,
        address: &str,
        now: Instant,
    ) -> Result<Redeemed, String> {
        let Some(own) = self.pin() else {
            return Ok(Redeemed::Closed);
        };
        let Some((code, opened)) = self.pairing().for_app(now) else {
            return Ok(Redeemed::Closed);
        };
        let nonce: String = ask.nonce.chars().take(128).collect();
        let presented: String = ask.proof.chars().take(128).collect();
        let checked = tokio::task::spawn_blocking(move || {
            let key = pin::key(&code, &nonce)?;
            let held = pin::same(&pin::proof(&key, Side::Phone, &nonce, &own), &presented);
            Ok::<_, String>(held.then(|| pin::proof(&key, Side::Computer, &nonce, &own)))
        })
        .await
        .map_err(|e| e.to_string())?;
        // A nonce too short is a proof that did not hold, counted.
        let back = checked.unwrap_or(None);
        let result = self.pairing().redeem_app(
            opened,
            back,
            device,
            address,
            &crate::log::stamp(),
            Instant::now(),
        )?;
        match &result {
            Redeemed::Asked { .. } => {
                crate::log::info(&format!(
                    "the Verso app at {address} proved the code; the computer is asked"
                ));
                self.audit(server, "pair_asked_app", Some(device), Some(address));
                self.emit(Event::Asked);
            }
            Redeemed::Refused { ended } => {
                crate::log::warn(&format!(
                    "a Verso app's pairing from {address} was refused: its proof did not hold"
                ));
                self.audit(server, "pair_refused_app", Some(device), Some(address));
                if let Some(why) = ended {
                    self.ended(server, *why);
                }
            }
            Redeemed::Closed => {}
        }
        Ok(result)
    }
}

/// The addresses a paired app may find this computer at, the ones it serves
/// on now first, then every one its certificate has named (`cert.rs` keeps
/// up to eight): a laptop at its desk on the cable and on the sofa on the
/// Wi-Fi is the same computer. With the port, which is kept (ADR 0096 item
/// 4).
pub(super) fn whereabouts(db: &Db, policy: &Policy) -> (Vec<String>, u16) {
    let (port, now) = policy
        .listening
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone();
    let mut all: Vec<IpAddr> = now;
    for ip in super::cert::named(db) {
        if !all.contains(&ip) {
            all.push(ip);
        }
    }
    (all.iter().map(ToString::to_string).collect(), port)
}

impl LocalServer {
    /// How many days a paired Verso app lasts without speaking to this
    /// computer; `0` for never (ADR 0117 D19 item 3; `db::APP_IDLE_DAYS`).
    pub fn app_idle_days(&self) -> Result<u32, String> {
        self.with_db(Db::app_idle_days)
    }

    /// Set that limit (Settings › Turn into a server, under *Paired
    /// phones*): at once, for the apps paired before as well. Logged and in
    /// the audit; serving on or off.
    pub fn set_app_idle_days(&self, days: u32) -> Result<(), String> {
        self.with_db(|db| {
            db.set_app_idle_days(days)?;
            let said = if days == 0 {
                "never".to_owned()
            } else {
                format!("{days} days")
            };
            // The value is the log's: the audit's subject is shown as it
            // is, and "90 days" is in one language.
            db.audit(&crate::db::Audit {
                actor: None,
                action: "app_idle_set",
                subject: None,
                folder: None,
                address: None,
                ok: true,
            })?;
            crate::log::info(&format!(
                "a paired app now leaves after {said} without speaking to this computer"
            ));
            Ok(())
        })?;
        (self.shared.events)(Event::Changed);
        Ok(())
    }

    /// The laptop's answer to "Was it you?": Allow, at a role, or Refuse.
    pub fn answer(&self, allow: bool, role: Role) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .ok_or_else(|| "serving is off".to_owned())?;
        let asked = r
            .policy
            .pairing()
            .pending()
            .ok_or_else(|| "no phone is waiting".to_owned())?;
        if !allow {
            r.policy.pairing().answer(None);
            r.policy.audit(
                &r.server,
                "pair_refused",
                Some(&asked.device),
                Some(&asked.address),
            );
            crate::log::info(&format!(
                "a pairing was refused at the computer: {} ({})",
                asked.device, asked.address
            ));
            drop(running);
            (self.shared.events)(Event::Changed);
            return Ok(());
        }
        let quick = match link_pair::before_allowing(r, &asked) {
            Ok(quick) => quick,
            Err(why) => {
                r.policy.pairing().answer(None);
                crate::log::warn(&format!("a pairing through the internet link: {why}"));
                return Err(why);
            }
        };
        let owner = owner_of(&r.server);
        // Never an owner: a phone reads or edits (item 12), through the
        // link as on the network (ADR 0117 D5), and the Verso app as well.
        let role = if role.writes() {
            Role::Editor
        } else {
            Role::Reader
        };
        let (token, csrf, session) = r
            .server
            .db
            .pair_phone(
                &owner,
                &asked.device,
                &asked.address,
                role,
                PAIRED,
                asked.app,
            )
            .map_err(|e| {
                if e == "full" {
                    format!("{PAIRED} phones are paired already: revoke one first")
                } else {
                    e
                }
            })?;
        // Kept, or the pairing is not made: a quick link's phone that
        // outlived its address would hold a place (D5 (3)).
        if quick && let Err(why) = link_pair::remember(&r.server.db, &session) {
            let _ = r.server.db.end_session(&owner, &session);
            r.policy.pairing().answer(None);
            return Err(why);
        }
        r.policy.pairing().answer(Some(Ready {
            token,
            csrf,
            session,
            proof: asked.proof.clone(),
        }));
        let what = if asked.app { "app_" } else { "" };
        r.policy.audit(
            &r.server,
            &format!("pair_allowed_{what}{}", role.as_str()),
            Some(&asked.device),
            Some(&asked.address),
        );
        crate::log::info(&format!(
            "a pairing was approved at the computer: {} ({}) as {}{}",
            asked.device,
            asked.address,
            role.as_str(),
            if asked.app { ", the Verso app" } else { "" }
        ));
        drop(running);
        (self.shared.events)(Event::Changed);
        Ok(())
    }
}
