// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Servers found on the home network (ADR 0097): while Settings › Servers
//! is open the window asks the host to browse `_verso._tcp` and lists what
//! is found ("Encontrados nesta rede"). The browse ends when the section
//! closes (`discover_servers_stop`) — nothing listens on the network the
//! rest of the time. What is found is an unauthenticated announcement: the
//! list gives the window an address to show, and a click fills it in;
//! nothing here connects, signs in or sends anything.

use super::*;
use verso_contract::FoundServer;
use verso_server::discovery::{Browser, Found};

/// How long a browse outlives the last time a window asked for the list: a
/// window that closes, or a section that is left, stops asking, and nothing
/// browses the network for it any longer (a window that did not say it
/// closed is no leak). A list is asked for every 2 seconds.
#[cfg(not(test))]
const LEASE: std::time::Duration = std::time::Duration::from_secs(10);
#[cfg(test)]
const LEASE: std::time::Duration = std::time::Duration::from_millis(300);

/// Something held only while it is asked for.
pub(crate) struct Lease<T> {
    slot: Mutex<Option<(T, std::time::Instant)>>,
}

impl<T> Lease<T> {
    pub(crate) const fn new() -> Self {
        Self {
            slot: Mutex::new(None),
        }
    }

    /// Renew the lease, making the thing first if there is none; `true`
    /// when it was made now.
    pub(crate) fn hold<E>(&self, make: impl FnOnce() -> Result<T, E>) -> Result<bool, E> {
        let mut slot = lock(&self.slot);
        let now = std::time::Instant::now();
        match slot.as_mut() {
            Some((_, at)) => {
                *at = now;
                Ok(false)
            }
            None => {
                *slot = Some((make()?, now));
                Ok(true)
            }
        }
    }

    /// Use the thing, renewing the lease; `None` when there is none.
    pub(crate) fn with<R>(&self, f: impl FnOnce(&T) -> R) -> Option<R> {
        let mut slot = lock(&self.slot);
        slot.as_mut().map(|(t, at)| {
            *at = std::time::Instant::now();
            f(t)
        })
    }

    /// Drop the thing if nobody renewed the lease within `after` of `now`;
    /// `true` when there is nothing left to watch.
    pub(crate) fn expire(&self, now: std::time::Instant, after: std::time::Duration) -> bool {
        let mut slot = lock(&self.slot);
        if slot
            .as_ref()
            .is_some_and(|(_, at)| now.duration_since(*at) >= after)
        {
            slot.take();
        }
        slot.is_none()
    }

    pub(crate) fn release(&self) {
        lock(&self.slot).take();
    }

    #[cfg(test)]
    pub(crate) fn held(&self) -> bool {
        lock(&self.slot).is_some()
    }
}

/// The running browse, if a window is asking for it.
static BROWSE: Lease<Browser> = Lease::new();

/// Browse (once; asking again renews the lease), and watch the lease: the
/// browse ends on its own when no window asks any more.
fn ensure() -> Result<bool, ContractError> {
    let started = BROWSE.hold(Browser::start).map_err(|e| {
        log::write(
            "WARN",
            "discover",
            &format!("cannot browse the network: {e}"),
        );
        failed(e)
    })?;
    if started {
        std::thread::spawn(|| {
            loop {
                std::thread::sleep(LEASE / 5);
                if BROWSE.expire(std::time::Instant::now(), LEASE) {
                    break;
                }
            }
        });
    }
    Ok(started)
}

/// What the last list held and when: shown again while a browse that was
/// stopped (by another window) starts over, so the list does not flash
/// "none found" in between.
static LAST: Mutex<Option<(std::time::Instant, Vec<FoundServer>)>> = Mutex::new(None);

/// How long the last list stands in for a browse that has just restarted.
const LAST_FOR: std::time::Duration = std::time::Duration::from_secs(15);

/// The list to give: the fresh one; when there is none yet because the browse
/// has just (re)started, the last one if it is recent.
pub(crate) fn list_or_last(
    started: bool,
    fresh: Vec<FoundServer>,
    last: Option<&(std::time::Instant, Vec<FoundServer>)>,
    now: std::time::Instant,
) -> Vec<FoundServer> {
    if !fresh.is_empty() || !started {
        return fresh;
    }
    last.filter(|(at, _)| now.duration_since(*at) < LAST_FOR)
        .map(|(_, l)| l.clone())
        .unwrap_or_default()
}

/// What the window shows of one announcement: a row with the address a
/// click uses, or, for a TLS server announced with no public address, a row
/// that says to set it.
pub(crate) fn shown(found: &[Found]) -> Vec<FoundServer> {
    found
        .iter()
        .filter_map(|f| {
            let url = f.url();
            if url.is_none() && !f.needs_public_url() {
                return None;
            }
            Some(FoundServer {
                name: f.name.clone(),
                host: f.host.clone(),
                needs_public_url: url.is_none(),
                url: url.unwrap_or_default(),
                https: f.https,
                version: f.version.clone(),
            })
        })
        .collect()
}

/// Begin browsing (once; asking again keeps the browse that runs).
#[tauri::command]
#[specta::specta]
pub(crate) fn discover_servers_start() -> Result<(), ContractError> {
    // A phone hears mDNS only while a multicast lock is held.
    #[cfg(target_os = "android")]
    crate::phone::multicast("discover", true);
    ensure().map(|_| ())
}

/// What has been found so far. Asking renews the browse's lease, and starts
/// the browse if it ended (another window stopped it, or the lease ran out
/// between two asks).
#[tauri::command]
#[specta::specta]
pub(crate) fn discover_servers_list() -> Result<Vec<FoundServer>, ContractError> {
    let Ok(started) = ensure() else {
        return Ok(Vec::new());
    };
    let fresh = BROWSE.with(|b| shown(&b.list())).unwrap_or_default();
    let mut last = lock(&LAST);
    let now = std::time::Instant::now();
    let given = list_or_last(started, fresh.clone(), last.as_ref(), now);
    if !fresh.is_empty() {
        *last = Some((now, fresh));
    }
    Ok(given)
}

/// Stop browsing; the network is left alone.
#[tauri::command]
#[specta::specta]
pub(crate) fn discover_servers_stop() -> Result<(), ContractError> {
    BROWSE.release();
    #[cfg(target_os = "android")]
    crate::phone::multicast("discover", false);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn a_lease_ends_the_thing_when_nobody_asks() {
        let lease: Lease<u8> = Lease::new();
        assert!(lease.hold(|| Ok::<_, ()>(7)).unwrap(), "made now");
        assert!(
            !lease.hold(|| Ok::<_, ()>(9)).unwrap(),
            "asking again renews"
        );
        let now = Instant::now();
        assert!(
            !lease.expire(now, Duration::from_secs(10)),
            "asked a moment ago"
        );
        assert!(lease.held());
        // Nobody asked for 10 seconds: it ends, and the watcher is done.
        assert!(lease.expire(now + Duration::from_secs(11), Duration::from_secs(10)));
        assert!(!lease.held());
        // One window's stop is not forever: the next ask starts it again.
        lease.release();
        assert!(lease.hold(|| Ok::<_, ()>(1)).unwrap());
        assert_eq!(lease.with(|t| *t), Some(1));
        lease.release();
        assert_eq!(lease.with(|t| *t), None);
    }

    #[test]
    fn a_restarted_browse_shows_the_last_list_not_none() {
        let row = FoundServer {
            name: "UniVerso-1".to_owned(),
            host: "h.local".to_owned(),
            url: "http://192.168.1.9:7340".to_owned(),
            https: false,
            version: String::new(),
            needs_public_url: false,
        };
        let now = std::time::Instant::now();
        let last = (now, vec![row.clone()]);
        let again = std::slice::from_ref(&row);
        // Just restarted, nothing found yet: the last list stands in.
        assert_eq!(list_or_last(true, Vec::new(), Some(&last), now), again);
        // Running, and nothing is there: none is the truth.
        assert!(list_or_last(false, Vec::new(), Some(&last), now).is_empty());
        // A stale last list is no list.
        let later = now + LAST_FOR + std::time::Duration::from_secs(1);
        assert!(list_or_last(true, Vec::new(), Some(&last), later).is_empty());
        // Something found wins.
        assert_eq!(list_or_last(true, vec![row.clone()], None, now), [row]);
    }

    #[test]
    fn a_failure_to_make_it_is_said_and_nothing_is_held() {
        let lease: Lease<u8> = Lease::new();
        assert_eq!(
            lease.hold(|| Err::<u8, _>("no multicast")),
            Err("no multicast")
        );
        assert!(!lease.held());
    }

    /// TLS with no public address is listed for what it is, not offered.
    #[test]
    fn a_tls_server_with_no_public_address_is_listed_without_an_address() {
        let f = |https, public: Option<&str>| Found {
            fullname: "UniVerso-1._verso._tcp.local.".to_owned(),
            name: "UniVerso-1".to_owned(),
            host: "h.local".to_owned(),
            port: 7340,
            https,
            version: String::new(),
            id: String::new(),
            addresses: vec!["192.168.1.9".parse().unwrap()],
            public: public.map(str::to_owned),
        };
        let rows = shown(&[
            f(true, None),
            f(true, Some("https://u.casa")),
            f(false, None),
        ]);
        assert_eq!(rows.len(), 3);
        assert!(rows[0].needs_public_url && rows[0].url.is_empty());
        assert_eq!(rows[1].url, "https://u.casa");
        assert!(!rows[1].needs_public_url);
        assert_eq!(rows[2].url, "http://192.168.1.9:7340");
    }
}
