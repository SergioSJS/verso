// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The owner pairs his own browser or phone through the internet link
//! (ADR 0117 D5, decided 2026-11-04 and 2026-11-13; R3). The window is the
//! network's own (`pairing.rs`): opened by *Pair a phone* in the app, two
//! minutes, three attempts for the window whoever makes them, one token or
//! its eight-letter code, *Was it you?* answered in the app, a reader or an
//! editor and never the owner (ADR 0096 item 12). What is the link's alone:
//!
//! - the pairing dialog shows the link's address, and with the link alone
//!   (*On my network* unticked) its QR is the link's (`view`);
//! - the address the question shows is the one the tunnel forwarded, and
//!   the question says it came through the link (`PendingView::link`);
//! - a phone paired through a **quick link** ends with that link's address
//!   (D5 (3)): its cookie is the quick link's name's alone and no later
//!   link's, and its session ends here when that address ends — the link
//!   turned off, its address forgotten or replaced, serving stopped, or at
//!   the next start for one a crash left (the quick link never outlives a
//!   run, D11 item 6) — so that it holds no place among the four. A phone
//!   paired through the person's own address stays, as a network's does.

use super::pairing::{Opened, PendingView};
use super::{Event, PairView, Running, Shared, qr};
use crate::db::Db;
use crate::state::Server;

/// The pairing window's address through the internet link: the link's
/// pairing address with the one-time token in its fragment, and its QR.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct PairLink {
    pub url: String,
    pub qr: Vec<String>,
}

/// The link's [`PairLink`] for `token`.
pub(super) fn pair_link(origin: &str, token: &str) -> Result<PairLink, String> {
    let url = url(origin, token);
    let qr = qr::matrix(&url)?;
    Ok(PairLink { url, qr })
}

/// Where the sessions of the phones paired through a quick link are kept,
/// until that link's address ends: in the settings of this computer's own
/// database (`0600`, the configuration directory), a JSON list of ids.
const KEY: &str = "local_link_phones";

/// A quick link's names: Cloudflare's testing service gives no other
/// (`tunnel/run.rs` reads `https://<name>.trycloudflare.com` alone), and
/// nobody's own address is under it.
const QUICK: &str = ".trycloudflare.com";

/// Whether `origin` (the link's, `https://<name>`) is a quick link's.
#[must_use]
pub(super) fn is_quick(origin: &str) -> bool {
    origin
        .strip_prefix("https://")
        .map(|a| a.split(':').next().unwrap_or(a).to_ascii_lowercase())
        .is_some_and(|name| name.ends_with(QUICK))
}

/// The link's pairing address for `token`: the token in the fragment, which
/// no request carries (as the network's QR, `qr.rs`). No fingerprint: the
/// tunnel's certificate is a public authority's.
#[must_use]
pub(super) fn url(origin: &str, token: &str) -> String {
    format!("{origin}/pair#t={token}")
}

/// The dialog of a window opened while the link alone serves: the link's
/// address, its QR, the code.
pub(super) fn view(
    shared: &Shared,
    r: &Running,
    origin: &str,
    opened: Opened,
) -> Result<PairView, String> {
    let link = pair_link(origin, &opened.token)?;
    let authority = origin.strip_prefix("https://").unwrap_or(origin).to_owned();
    r.policy.audit(&r.server, "pair_open", None, None);
    crate::log::info("the pairing window opened, for the internet link");
    (shared.events)(Event::Changed);
    Ok(PairView {
        url: link.url.clone(),
        address: authority.clone(),
        choices: Vec::new(),
        chosen: authority,
        code: opened.code,
        qr: link.qr.clone(),
        expires_in: opened.expires_in.as_secs(),
        fingerprint: String::new(),
        certificate: "link".to_owned(),
        link: Some(link),
    })
}

/// Before a pairing asked through the link is allowed: the link still has
/// an address (`Err` when it ended while the question waited — the phone's
/// page is on an address that is gone). `Some(true)` when it is a quick
/// link's, whose phones end with it.
pub(super) fn before_allowing(r: &Running, asked: &PendingView) -> Result<bool, String> {
    if !asked.link {
        return Ok(false);
    }
    let origin = r.policy.link_origin().ok_or_else(|| {
        "the internet link ended while the phone waited: turn it on and pair again".to_owned()
    })?;
    Ok(is_quick(&origin))
}

/// Session `session` was paired through a quick link: it ends with that
/// link's address.
pub(super) fn remember(db: &Db, session: &str) -> Result<(), String> {
    let mut ids = kept(db);
    ids.push(session.to_owned());
    let text = serde_json::to_string(&ids).map_err(|e| e.to_string())?;
    db.set_setting(KEY, &text)
}

fn kept(db: &Db) -> Vec<String> {
    db.setting(KEY)
        .ok()
        .flatten()
        .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
        .unwrap_or_default()
}

/// End the sessions of the phones paired through a quick link, of
/// `owner`; the list is emptied. Says how many were still standing.
fn end_kept(db: &Db, owner: &str) -> Result<usize, String> {
    let ids = kept(db);
    if ids.is_empty() {
        return Ok(0);
    }
    let mut ended = 0;
    for id in &ids {
        if db.end_session(owner, id)? {
            ended += 1;
        }
    }
    db.set_setting(KEY, "[]")?;
    Ok(ended)
}

/// At a start: the phones a quick link of a run before paired (a crash,
/// or a build before this one ended them), whose address is gone.
pub(super) fn end_left(db: &Db, owner: &str) -> Result<(), String> {
    let ended = end_kept(db, owner)?;
    if ended > 0 {
        crate::log::info(&format!(
            "{ended} phone(s) paired through a quick link of an earlier run ended"
        ));
    }
    Ok(())
}

/// The quick link's address ended (turned off, forgotten, replaced, or
/// serving stopped): the phones paired through it end now — their windows
/// are told, the audit log and the log say so. Errors are logged: the link
/// ends whatever happens here.
pub(super) fn end(server: &Server, policy: &super::Policy) {
    let owner = server.db.local_owner().map(|a| a.id).unwrap_or_default();
    let ids = kept(&server.db);
    match end_kept(&server.db, &owner) {
        Ok(0) => {}
        Ok(n) => {
            for id in &ids {
                server.sessions_ended(&owner, Some(id), None);
            }
            crate::log::info(&format!(
                "{n} phone(s) paired through the quick link ended with its address"
            ));
            policy.audit(server, "phone_link_ended", Some(&n.to_string()), None);
            policy.emit(Event::Changed);
        }
        Err(e) => crate::log::error(&format!("ending the quick link's phones: {e}")),
    }
}

/// Whether `old` → `new` ends a quick link's address: it was a quick link,
/// and the new one is none or another.
#[must_use]
pub(super) fn ends(old: Option<&str>, new: Option<&str>) -> bool {
    old.is_some_and(|o| is_quick(o) && new.is_none_or(|n| !n.eq_ignore_ascii_case(o)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_quick_link_is_known_by_its_name() {
        assert!(is_quick(
            "https://abstract-simpson-player.trycloudflare.com"
        ));
        assert!(is_quick("https://A-B.TRYCLOUDFLARE.COM"));
        for own in [
            "https://mesa.example.com",
            "https://trycloudflare.com.example.com",
            "https://eviltrycloudflare.com",
            "http://a.trycloudflare.com",
        ] {
            assert!(!is_quick(own), "{own}");
        }
    }

    #[test]
    fn only_a_quick_links_address_ending_ends_its_phones() {
        let q = "https://a-b.trycloudflare.com";
        assert!(ends(Some(q), None));
        assert!(ends(Some(q), Some("https://c-d.trycloudflare.com")));
        assert!(!ends(Some(q), Some(q)));
        assert!(!ends(Some("https://mesa.example.com"), None));
        assert!(!ends(None, Some(q)));
    }

    #[test]
    fn the_links_pairing_address_carries_the_token_in_its_fragment() {
        assert_eq!(
            url("https://a-b.trycloudflare.com", "tok"),
            "https://a-b.trycloudflare.com/pair#t=tok"
        );
    }
}
