// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A synced folder's task (split from `sync.rs`, ADR 0067): connected, a
//! pass, then waiting for the next reason; offline, trying again with a
//! growing wait. And what the server pushes that a window says.

use super::*;

#[cfg(test)]
mod tests;

/// What the server pushed on the device's connection that a window says
/// (ADR 0084 item 7): the folder near its quota, to this folder's windows
/// (pushed only to connections on the server's folder, so it is this
/// one's); a folder given to the account, to every window, naming the
/// server. A pass needs neither. One that does not read as its type is
/// not said.
pub(crate) fn tell(ctx: &Ctx, s: &Syncer, event: &str, payload: Value) {
    match event {
        "folder-quota" => {
            let windows = ctx.service.clients_of(&s.key);
            let quota = serde_json::from_value::<FolderQuota>(payload)
                .ok()
                .and_then(|q| serde_json::to_value(q).ok());
            if let (false, Some(quota)) = (windows.is_empty(), quota) {
                (ctx.told)(&windows, event, &quota);
            }
        }
        "share-given" => {
            if let Some(given) = remote::with_server(event, payload, &s.url) {
                (ctx.all)(event, &given);
            }
        }
        _ => {}
    }
}

/// Run a folder's sync until it is turned off or no window shows the
/// folder: connected, a pass, then waiting for a reason — the watcher, the
/// server's push, the person, the scan's five minutes — for the next;
/// offline, trying again with a growing wait (`reach::Backoff`: 5 s to 5
/// min), from the start again once a pass went through or when the person
/// asks. A connection made is not yet a success: one whose first pass
/// fails on the connection (an answer larger than a frame, a proxy that
/// drops the socket) waits its turn like a server out of reach, never
/// connecting again at once in a loop.
pub(crate) async fn run(ctx: Arc<Ctx>, s: Arc<Syncer>) {
    let mut wait = reach::Backoff::new();
    let gone = |s: &Syncer| s.stopped() || ctx.service.clients_of(&s.key).is_empty();
    while !gone(&s) {
        if s.asked.swap(false, Ordering::Relaxed) {
            wait.reset();
        }
        let linked = if s.cloud.is_some() {
            cloud::link(&ctx, &s).await
        } else {
            link(&ctx, &s).await
        };
        let mut l = match linked {
            Ok(l) => l,
            Err(e) => {
                // The network is down, or the server: offline either way.
                let offline = matches!(e.kind, ErrorKind::Unavailable | ErrorKind::Unreachable);
                // Said once per state, not on every try.
                let was = lock(&s.status).state.clone();
                let now = if offline { "offline" } else { "error" };
                if was != now {
                    log::write(
                        if offline { "WARN" } else { "ERROR" },
                        "sync",
                        &format!("{now}: folder {}: {}", s.key, e.message),
                    );
                }
                s.set(&ctx, |st| {
                    st.state = if offline { "offline" } else { "error" }.to_owned();
                    st.message = Some(e.message.clone());
                    let problem = problem_of(&e, s.cloud.is_some());
                    st.versions = if problem == "version" {
                        lock(&s.versions).clone()
                    } else {
                        None
                    };
                    st.problem = Some(problem.to_owned());
                });
                // A closed table is tried again gently (15 s), not every five minutes.
                let closed = e.message.contains(verso_contract::TABLE_CLOSED);
                let pause = if offline {
                    wait.next()
                } else if closed {
                    Duration::from_secs(15)
                } else {
                    SCAN
                };
                tokio::select! {
                    () = s.wake.notified() => {}
                    () = tokio::time::sleep(pause) => {}
                }
                continue;
            }
        };
        log::write("INFO", "sync", &format!("connected: folder {}", s.key));
        // The server ended this device's session: said now, as it closes
        // the connection, not as a connection lost.
        let mut ended = false;
        // The folder's owner revoked the share: sync turns off.
        let mut revoked = false;
        while !gone(&s) {
            let passed = pass(&ctx, &s, &mut l).await;
            // The link works: the next time it is lost, the wait starts over.
            if passed.is_ok() {
                wait.reset();
            }
            match passed {
                // Waiting for the person; the pass said so.
                Ok(Passed {
                    paused: Some(_), ..
                }) => {}
                Ok(p) if p.actions > 0 => log::write(
                    "INFO",
                    "sync",
                    &format!("a pass carried out {} changes", p.actions),
                ),
                Ok(_) => {}
                Err(e) if matches!(e.kind, ErrorKind::Unavailable | ErrorKind::Unreachable) => {
                    break;
                }
                Err(e) => {
                    log::write("ERROR", "sync", &e.message);
                    s.set(&ctx, |st| {
                        st.state = "error".to_owned();
                        st.message = Some(e.message.clone());
                        st.problem = Some(problem_of(&e, s.cloud.is_some()).to_owned());
                    });
                }
            }
            let deadline = tokio::time::Instant::now() + SCAN;
            let lost = loop {
                // What the connection heard first: a connection closed
                // while a change arrived here is seen closed, not used for
                // a pass (the live campaign, 2026-10-11). A wake waits as
                // a stored permit.
                tokio::select! {
                    biased;
                    h = l.heard.recv() => match h {
                        Some(remote::Heard::Event(e, _)) if e == "sync-changed" => break false,
                        // Promoted or made a reader: what may cross changes now.
                        Some(remote::Heard::Role(role)) => {
                            log::write("INFO", "sync", &format!("role in the server's folder: {role}"));
                            s.set(&ctx, |st| st.role.clone_from(&role));
                            l.role = role;
                            s.rights_stale();
                            break false;
                        }
                        // Access changed (ADR 0113 S8): what this device may
                        // change is asked again before the next pass sends
                        // anything; the windows hear it as they did.
                        Some(remote::Heard::Event(e, payload)) if e == "access-changed" => {
                            s.rights_stale();
                            tell(&ctx, &s, &e, payload);
                            break false;
                        }
                        Some(remote::Heard::Event(e, payload)) => tell(&ctx, &s, &e, payload),
                        Some(remote::Heard::Gone(what, _)) if what == "session" => {
                            log::write("INFO", "sync", "signed out: the server ended this device's session");
                            ended = true;
                            break true;
                        }
                        Some(remote::Heard::Gone(what, why))
                            if what == "folder" && why.as_deref() == Some("revoked") =>
                        {
                            revoked = true;
                            break true;
                        }
                        _ => break true,
                    },
                    () = s.wake.notified() => break false,
                    // The scan: the folder walked, as on reconnecting.
                    () = tokio::time::sleep_until(deadline) => {
                        l.walk = true;
                        break false;
                    }
                }
            };
            if revoked {
                s.live.lost();
                s.revoked(&ctx);
                return;
            }
            if lost {
                break;
            }
            // A burst of changes settles before the next pass; a cloud's
            // calls are dearer than a server's, so it settles longer (ADR
            // 0104 item 8: each local change, debounced).
            let settle = Duration::from_millis(if s.cloud.is_some() { 2000 } else { 500 });
            s.live.settle(settle).await;
        }
        // The live notes go local (ADR 0082 item 8).
        s.live.lost();
        if !gone(&s) && !ended {
            log::write(
                "WARN",
                "sync",
                &format!("offline: folder {}: the connection closed", s.key),
            );
            s.set(&ctx, |st| st.state = "offline".to_owned());
            // Connected again after the wait (5 s after a pass that went
            // through, longer each time none did), or when the person asks.
            tokio::select! {
                () = s.wake.notified() => {}
                () = tokio::time::sleep(wait.next()) => {}
            }
        }
    }
}

/// The person signed in to the server at `url` again (Settings › Servers):
/// each folder that syncs with it tries at once, its wait started over,
/// instead of waiting for its next scan.
pub(crate) fn signed_in<R: tauri::Runtime>(app: &tauri::AppHandle<R>, url: &str) {
    let syncs: Vec<_> = lock(&app.state::<App>().syncs)
        .values()
        .filter(|s| s.of_server(url))
        .cloned()
        .collect();
    for s in syncs {
        s.retry();
    }
}
