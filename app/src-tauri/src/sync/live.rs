// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note of a synced folder, live in the server's room while the sync's
//! link is up (ADR 0082). The room's traffic goes over the sync's own
//! connection (item 2): the window's `collab_*` commands are answered
//! by it, and what the server pushes whose name starts with `collab-` goes
//! to the windows that hold the note. While a note is in its room, sync is
//! the only writer of its local file in Verso (item 6): the room's saves
//! land on the server and come down as any download. Out of the room — the
//! link dropped, sync paused — the tab writes the file itself, and the hash
//! of its last such write is kept here, so that the pass that follows its
//! return knows that text for the tab's own, already in the room: neither
//! sent nor a conflict (items 6 and 9).

use std::collections::{BTreeMap, BTreeSet};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

use super::*;

/// How long a join waits for the pass on its note (item 7): the local
/// text sent first, or set aside as a conflict's copy.
const CATCH_UP: Duration = Duration::from_secs(5);
/// How long a pass waits for the tabs to come back into their rooms
/// (item 9); one that does not is taken to have left.
const REJOIN: Duration = Duration::from_secs(4);
/// How often a wait looks again.
const LOOK: Duration = Duration::from_millis(20);
/// After this long a wait looks less often (`LOOK_SLOW`): each look reads
/// and hashes the note.
const LOOK_FAST_FOR: Duration = Duration::from_secs(1);
const LOOK_SLOW: Duration = Duration::from_millis(100);
/// A join slower than this is said in the log, with its stages.
const SLOW_JOIN: Duration = Duration::from_millis(300);

/// The live notes of one synced folder.
#[derive(Default)]
pub(crate) struct Live {
    /// The sync's connection while it is up.
    link: Mutex<Option<Arc<remote::Remote>>>,
    /// The notes the folder's windows hold in rooms, by path.
    rooms: Mutex<HashMap<String, Held>>,
    /// Notes a pass took as left while a tab held them (item 9): that
    /// tab's next join is answered as another room, so that it reads the
    /// note again instead of sending its text a second time.
    left: Mutex<HashSet<String>>,
    /// The windows at the server's tables over this link (ADR 0107 item 9),
    /// each with the table it is at (the table's root in the folder, `""`
    /// for the folder: one table per window, 2026-10-23): the server knows
    /// the connection, not them.
    table: Mutex<BTreeMap<String, String>>,
    /// The windows that asked the campaign's status over this link (ADR
    /// 0110): told when it changes.
    campaign: Mutex<BTreeSet<String>>,
    /// What outlives a note's room (a tab leaving it does not end this):
    /// see [`Kept`].
    kept: Mutex<HashMap<String, Kept>>,
    /// A clock for [`Kept`]: which came first.
    tick: AtomicU64,
    /// Joins waiting for the pass on their note right now.
    joins_waiting: AtomicUsize,
    /// Tells the loop in its settling pause that a join is waiting. No
    /// permit is kept: a hurry nobody was waiting for must not shorten a
    /// later, unrelated pause.
    hurry: tokio::sync::Notify,
}

/// A join waiting for the pass on its note; counted while it lives.
pub(crate) struct WaitingJoin<'a>(&'a AtomicUsize);

impl Drop for WaitingJoin<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

/// What a note's tab and its room left, kept past the room made again from
/// the disk and the tab leaving it, for the pass that follows (ADR 0082
/// item 9).
#[derive(Default)]
struct Kept {
    /// The hash of the last text a tab wrote here itself, out of the room
    /// (`Held::own` is lost with the room), with when it was written.
    last: Option<(String, u64)>,
    /// The hashes of the last saves the room told this app of, with when:
    /// the server's file as this tab's own room made it. The tab's text
    /// holds every one (the room's updates reach it before the save is
    /// told), so a server file with one of these hashes is an earlier
    /// state of what the tab wrote since, never a change of someone else's
    /// the tab has not seen.
    saved: Vec<(String, u64)>,
}

/// A note held in a room by windows of this app.
#[derive(Default)]
struct Held {
    windows: BTreeSet<String>,
    /// In the room on the link that is up now.
    joined: bool,
    /// Which room (`CollabJoin::epoch`).
    epoch: String,
    /// The hash of the last text a tab wrote here itself, out of the room.
    own: Option<String>,
}

/// How many of the room's saves are remembered per note.
const SAVES: usize = 32;

/// What the windows hear: the labels, the event and its payload.
pub(crate) type Told = Arc<dyn Fn(&[String], &str, &Value) + Send + Sync>;

fn unavailable(message: &str) -> Value {
    json!({ "kind": "unavailable", "message": message })
}

impl Live {
    /// A join starts waiting for the pass on its note.
    pub(crate) fn wait_for_pass(&self) -> WaitingJoin<'_> {
        self.joins_waiting.fetch_add(1, Ordering::SeqCst);
        WaitingJoin(&self.joins_waiting)
    }

    /// A join asks the loop to end its pause now.
    pub(crate) fn hurry(&self) {
        self.hurry.notify_waiters();
    }

    /// The pause that lets a burst of local changes settle before the next
    /// pass: skipped, or ended at once, only while a join is waiting for
    /// that pass (a count, not a stored permit).
    pub(crate) async fn settle(&self, pause: Duration) {
        if self.joins_waiting.load(Ordering::SeqCst) > 0 {
            return;
        }
        tokio::select! { () = tokio::time::sleep(pause) => {}, () = self.hurry.notified() => {} }
    }

    /// The sync's link is up: every held note comes back into its room.
    pub(crate) fn connected(&self, remote: Arc<remote::Remote>) {
        *lock(&self.link) = Some(remote);
        // The table is a connection's: a new one is at no table until its
        // windows join again.
        lock(&self.table).clear();
        for h in lock(&self.rooms).values_mut() {
            h.joined = false;
        }
    }

    /// The link dropped: every held note is out of its room, its tab
    /// local (item 8).
    pub(crate) fn lost(&self) {
        *lock(&self.link) = None;
        lock(&self.table).clear();
        for h in lock(&self.rooms).values_mut() {
            h.joined = false;
        }
    }

    pub(crate) fn remote(&self) -> Option<Arc<remote::Remote>> {
        lock(&self.link).clone()
    }

    /// Whether a window holds `path` in a room now.
    #[cfg(test)]
    pub(crate) fn holds(&self, path: &str) -> bool {
        lock(&self.rooms).get(path).is_some_and(|h| h.joined)
    }

    /// How many saves of `path`'s room this app has heard and kept.
    #[cfg(test)]
    pub(crate) fn saves_heard(&self, path: &str) -> usize {
        lock(&self.kept).get(path).map_or(0, |k| k.saved.len())
    }
}

/// Whether the folder's notes may be live now, and how far the server is
/// (ADR 0026 rule 2): the link up and sync not paused (items 3 and 10).
pub(crate) fn up(s: &Syncer) -> Option<u32> {
    if s.stopped() || s.paused.load(Ordering::Relaxed) {
        return None;
    }
    lock(&s.live.link).as_ref().map(|r| r.latency_ms())
}

/// A window's room command for a note of the folder, over the sync's
/// link (items 2 and 3).
pub(crate) async fn command(
    ctx: &Ctx,
    s: &Syncer,
    window: &str,
    cmd: &str,
    args: Value,
) -> Result<Value, Value> {
    let path = args["path"].as_str().unwrap_or_default().to_owned();
    if cmd == "collab_leave" {
        leave(s, window, &path).await;
        return Ok(Value::Null);
    }
    if cmd == "table_leave" {
        table_leave(ctx, s, window, args["table"].as_str()).await;
        return Ok(Value::Null);
    }
    let Some(remote) = up(s).and_then(|_| s.live.remote()) else {
        // A folder with no connection has no table, and says so (ADR
        // 0107 item 9): the status is "none", as a folder alone's.
        if cmd == "campaign_status" {
            return Ok(json!({
                "viewer": "none", "tables": [], "notes": [], "players": [], "can_invite": false
            }));
        }
        return Err(unavailable(if cmd.starts_with("collab_") {
            "the folder's sync is not connected: the note is edited on this computer"
        } else {
            "the folder's sync is not connected: the table is the server's"
        }));
    };
    // The server tells the other connections; another window of this app
    // in the same room hears it here.
    let others = || -> Vec<String> {
        lock(&s.live.rooms)
            .get(&path)
            .map(|h| h.windows.iter().filter(|w| *w != window).cloned().collect())
            .unwrap_or_default()
    };
    match cmd {
        "collab_join" => join(ctx, s, &remote, window, &path).await,
        // The table and the campaign's controls (ADR 0107 item 9, ADR 0110):
        // the server's, answered for the sync's connection like a room's.
        "table_join" => {
            let answer = remote.call(cmd, args).await?;
            let table = answer["table"].as_str().unwrap_or_default();
            if let Some(old) = table_joined(ctx, s, window, table) {
                // The window moved to another table without leaving the
                // first: the connection leaves it when none of this app's
                // windows is left there.
                let _ = remote.call("table_leave", json!({ "table": old })).await;
            }
            Ok(answer)
        }
        "campaign_status" => {
            let answer = remote.call(cmd, args).await?;
            lock(&s.live.campaign).insert(window.to_owned());
            Ok(answer)
        }
        "collab_update" => {
            let answer = remote.call(cmd, args.clone()).await?;
            let others = others();
            if !others.is_empty() {
                let payload = json!({ "path": path, "update": args["update"] });
                (ctx.told)(&others, "collab-update", &payload);
            }
            Ok(answer)
        }
        // Dice (ADR 0088 item 4): the server's roll, heard as the others
        // hear it.
        "collab_roll" => {
            let answer = remote.call(cmd, args).await?;
            let others = others();
            if !others.is_empty() {
                let payload = json!({ "path": path, "roll": answer });
                (ctx.told)(&others, "collab-roll", &payload);
            }
            Ok(answer)
        }
        // The oracle's draws (ADR 0102 item 5): the same.
        "collab_oracle" => {
            let answer = remote.call(cmd, args).await?;
            let others = others();
            if !others.is_empty() {
                let payload = json!({ "path": path, "draw": answer });
                (ctx.told)(&others, "collab-oracle", &payload);
            }
            Ok(answer)
        }
        _ => remote.call(cmd, args).await,
    }
}

/// Into the room of `path` (item 5): after the pass on it (item 7).
async fn join(
    ctx: &Ctx,
    s: &Syncer,
    remote: &remote::Remote,
    window: &str,
    path: &str,
) -> Result<Value, Value> {
    let began = tokio::time::Instant::now();
    catch_up(ctx, s, path).await;
    let caught = began.elapsed();
    let mut answer = remote.call("collab_join", json!({ "path": path })).await?;
    // Said when slow, with where the time went on this side of the window:
    // the wait for the pass, and the server's answer.
    let total = began.elapsed();
    if total >= SLOW_JOIN {
        log::write(
            "INFO",
            "sync",
            &format!(
                "live: join of {path} took {} ms (wait for the pass {} ms, server {} ms)",
                total.as_millis(),
                caught.as_millis(),
                (total - caught).as_millis()
            ),
        );
    }
    // A file whose line ends are mixed: shown read-only, in no room (no
    // epoch). A reader is read-only too but in the room, with its epoch
    // (night round 2026-10-30): its window follows the room's text.
    if answer["read_only"] == true && answer["epoch"].as_str().is_none_or(str::is_empty) {
        return Ok(answer);
    }
    let epoch = answer["epoch"].as_str().unwrap_or_default().to_owned();
    {
        let mut rooms = lock(&s.live.rooms);
        let held = rooms.entry(path.to_owned()).or_default();
        // Another room, made again from the disk: the text the tab wrote
        // here is not in it, and the pass compares it from the base.
        if held.epoch != epoch {
            held.own = None;
        }
        held.epoch = epoch;
        held.joined = true;
        held.windows.insert(window.to_owned());
    }
    if lock(&s.live.left).remove(path) {
        answer["epoch"] = json!("");
    }
    Ok(answer)
}

/// The local text crossed before the join, as the sync's ordinary pass
/// on that path carries it — sent, or set aside as a conflict's copy —
/// bounded by [`CATCH_UP`]; the status bar says "sending 1" meanwhile.
async fn catch_up(ctx: &Ctx, s: &Syncer, path: &str) {
    // A change this device may not send stays here (ADR 0079 item 1; ADR
    // 0113 S8): nothing waits.
    if !s.may_send(ctx.config.as_deref(), path) {
        return;
    }
    let started = tokio::time::Instant::now();
    let deadline = started + CATCH_UP;
    let _waiting = s.live.wait_for_pass();
    let mut asked = false;
    let mut looks = 0u32;
    while !tokio::task::block_in_place(|| settled(ctx, s, path)) {
        if !asked {
            s.touched([path.to_owned()]);
            asked = true;
        }
        // The pass runs now, not after the pause that lets a burst settle;
        // asked again every 200 ms while the text has not crossed.
        if looks.is_multiple_of(10) {
            s.live.hurry();
        }
        looks += 1;
        if tokio::time::Instant::now() >= deadline {
            log::write(
                "WARN",
                "sync",
                &format!(
                    "live: {path} joins before its local text crossed; the next pass sends it, or keeps it as a copy"
                ),
            );
            return;
        }
        // Each look reads and hashes the note: after the first second a
        // slower look, so a big note is not read fifty times a second.
        tokio::time::sleep(if started.elapsed() > LOOK_FAST_FOR {
            LOOK_SLOW
        } else {
            LOOK
        })
        .await;
    }
}

/// Whether the local file of `path` is what both sides last agreed on, or
/// the tab's own text, already in its room.
fn settled(ctx: &Ctx, s: &Syncer, path: &str) -> bool {
    let p = path.to_owned();
    let Ok(bytes) = ctx
        .service
        .with_key(&s.key, move |ws| Ok(ws.read_with_revision(&p)?.0))
    else {
        // Not here: the server's room says what there is.
        return true;
    };
    let hash = sha256(&bytes);
    if lock(&s.live.rooms).get(path).and_then(|h| h.own.as_deref()) == Some(hash.as_str()) {
        return true;
    }
    synced(ctx.config.as_deref(), &s.key).is_some_and(|st| st.base.get(path) == Some(&hash))
}

/// A window lets the note go: the room is left on the server when no
/// other window of this app holds it.
async fn leave(s: &Syncer, window: &str, path: &str) {
    let out = {
        let mut rooms = lock(&s.live.rooms);
        let Some(h) = rooms.get_mut(path) else {
            return;
        };
        h.windows.remove(window);
        if !h.windows.is_empty() {
            return;
        }
        let joined = h.joined;
        rooms.remove(path);
        // The saves heard mean something only beside a text the tab wrote
        // while out of the room; with none, there is nothing to keep.
        let mut kept = lock(&s.live.kept);
        if kept.get(path).is_some_and(|k| k.last.is_none()) {
            kept.remove(path);
        }
        joined
    };
    if out && let Some(remote) = s.live.remote() {
        let _ = remote.call("collab_leave", json!({ "path": path })).await;
    }
}

/// A window is at the table rooted at `table` over the link (ADR 0107
/// item 9): the windows that closed are forgotten with it. The table the
/// window was at before, when it moved and no other window is left there.
fn table_joined(ctx: &Ctx, s: &Syncer, window: &str, table: &str) -> Option<String> {
    let shown = ctx.service.clients_of(&s.key);
    let mut at = lock(&s.live.table);
    at.retain(|w, _| shown.contains(w));
    let before = at.insert(window.to_owned(), table.to_owned())?;
    (before != table && !at.values().any(|t| *t == before)).then_some(before)
}

/// A window leaves the table it is at (the one named, when it names
/// one); the connection leaves that table when no window of this app is
/// left at it.
async fn table_leave(ctx: &Ctx, s: &Syncer, window: &str, named: Option<&str>) {
    let left = {
        let shown = ctx.service.clients_of(&s.key);
        let mut at = lock(&s.live.table);
        let was = match (at.get(window), named) {
            (Some(t), Some(n)) if t != n => None,
            _ => at.remove(window),
        };
        at.retain(|w, _| shown.contains(w));
        was.filter(|t| !at.values().any(|x| x == t))
    };
    if let Some(table) = left
        && let Some(remote) = s.live.remote()
    {
        let _ = remote.call("table_leave", json!({ "table": table })).await;
    }
}

/// Sync paused or turned off (item 10): every note leaves its room on the
/// server; the tabs go local on the status they hear.
pub(crate) fn out(s: &Syncer) {
    let paths: Vec<String> = lock(&s.live.rooms)
        .iter_mut()
        .filter(|(_, h)| h.joined)
        .map(|(p, h)| {
            h.joined = false;
            p.clone()
        })
        .collect();
    let tables: BTreeSet<String> = std::mem::take(&mut *lock(&s.live.table))
        .into_values()
        .collect();
    let Some(remote) = s.live.remote() else {
        return;
    };
    if paths.is_empty() && tables.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        for table in tables {
            let _ = remote.call("table_leave", json!({ "table": table })).await;
        }
        for path in paths {
            let _ = remote.call("collab_leave", json!({ "path": path })).await;
        }
    });
}

/// A tab of `window` wrote `bytes` to `path` itself: out of its room,
/// that is its own text (items 6 and 8). In the room, a write is from
/// outside it and crosses as any (item 11).
pub(crate) fn wrote(s: &Syncer, window: &str, path: &str, bytes: &[u8]) {
    if let Some(h) = lock(&s.live.rooms).get_mut(path)
        && !h.joined
        && h.windows.contains(window)
    {
        let hash = sha256(bytes);
        let at = s.live.tick.fetch_add(1, Ordering::Relaxed);
        lock(&s.live.kept).entry(path.to_owned()).or_default().last = Some((hash.clone(), at));
        h.own = Some(hash);
    }
}

/// The room of `path` saved the file, and this app heard it: the hash of
/// what it wrote is the server's file as that room made it.
fn saved_in(live: &Live, path: &str, hash: &str) {
    let at = live.tick.fetch_add(1, Ordering::Relaxed);
    if !lock(&live.rooms).contains_key(path) {
        return;
    }
    let mut kept = lock(&live.kept);
    let saved = &mut kept.entry(path.to_owned()).or_default().saved;
    saved.push((hash.to_owned(), at));
    if saved.len() > SAVES {
        saved.remove(0);
    }
}

/// Notes the pass plans from the server's file: a note whose local text a
/// tab wrote after the room saved the server's file, which the pass has
/// not fetched yet (the link went with the saves still on the server,
/// typically a restart, and the room made again from the disk): the
/// server's file is an earlier state of the tab's own text, so the local
/// file is a change of this device only. The base is set to that server
/// file for the plan, which then sends the local text over it; it makes no
/// conflict copy (ADR 0082 item 9). A server file the room did not tell
/// this app of — someone else's, or a save missed — leaves the comparison
/// as it was: two changes, a copy, never a loss. `None`: nothing to plan
/// differently.
pub(crate) fn over_saves(
    s: &Syncer,
    local: &Files,
    there: &Files,
    base: &BTreeMap<String, String>,
) -> Option<BTreeMap<String, String>> {
    let mut out: Option<BTreeMap<String, String>> = None;
    lock(&s.live.kept).retain(|path, k| {
        let Some((last, wrote)) = k.last.clone() else {
            return true;
        };
        let here = local.get(path);
        // The file moved on since the tab wrote it (from outside, item
        // 11), or both sides hold it as the base says: nothing to keep.
        if here.is_none_or(|f| f.hash != last) || base.get(path) == Some(&last) {
            return false;
        }
        let (Some(here), Some(server)) = (here, there.get(path)) else {
            return true;
        };
        if base.get(path) != Some(&server.hash)
            && here.hash != server.hash
            && k.saved
                .iter()
                .any(|(x, at)| *x == server.hash && *at < wrote)
        {
            out.get_or_insert_with(|| base.clone())
                .insert(path.clone(), server.hash.clone());
        }
        true
    });
    out
}

/// What the sync's link hears, a room's events taken out as they come —
/// to the windows that hold the note — and the rest handed on to the
/// sync's task, which may be in the middle of a pass.
pub(crate) fn relay(
    live: Arc<Live>,
    told: Told,
    mut heard: tokio::sync::mpsc::UnboundedReceiver<remote::Heard>,
) -> tokio::sync::mpsc::UnboundedReceiver<remote::Heard> {
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
    tauri::async_runtime::spawn(async move {
        while let Some(h) = heard.recv().await {
            match h {
                // The table's events and the campaign's go to the windows
                // that asked for them (ADR 0107 item 9, ADR 0110).
                remote::Heard::Event(event, payload)
                    if event.starts_with("table-") || event == "campaign-changed" =>
                {
                    let to: Vec<String> = if event == "campaign-changed" {
                        lock(&live.campaign).iter().cloned().collect()
                    } else {
                        // The windows at the table the event is for.
                        let table = payload["table"].as_str().unwrap_or_default();
                        lock(&live.table)
                            .iter()
                            .filter(|(_, t)| t.as_str() == table)
                            .map(|(w, _)| w.clone())
                            .collect()
                    };
                    if !to.is_empty() {
                        told(&to, &event, &payload);
                    }
                }
                remote::Heard::Event(event, payload) if event.starts_with("collab-") => {
                    let path = payload["path"].as_str().unwrap_or_default();
                    if event == "collab-saved"
                        && let Some(hash) = payload["hash"].as_str()
                    {
                        saved_in(&live, path, hash);
                    }
                    let to: Vec<String> = lock(&live.rooms)
                        .get(path)
                        .map(|h| h.windows.iter().cloned().collect())
                        .unwrap_or_default();
                    if !to.is_empty() {
                        told(&to, &event, &payload);
                    }
                }
                // A live share's frame (ADR 0116): the server sends it to
                // this one connection once any window at a table asked;
                // each window that gave a channel gets it, and one that
                // does not listen drops it by the share's number.
                remote::Heard::Audio(frame) => {
                    let to: Vec<String> = lock(&live.table).keys().cloned().collect();
                    crate::audio_share::hear::deliver(&to, &frame);
                }
                other => {
                    if tx.send(other).is_err() {
                        return;
                    }
                }
            }
        }
    });
    rx
}

/// Before a pass (item 9): the tabs whose notes were in rooms come back
/// into them first — told by the status, which says the link is up — so
/// that the pass knows their texts for their own. One that does not
/// within [`REJOIN`] is taken to have left, and the ordinary comparison
/// applies: a copy, never a loss.
pub(crate) async fn rejoined(s: &Syncer) {
    let waiting = || lock(&s.live.rooms).values().any(|h| !h.joined);
    if !waiting() {
        return;
    }
    let deadline = tokio::time::Instant::now() + REJOIN;
    while waiting() && tokio::time::Instant::now() < deadline {
        tokio::time::sleep(LOOK).await;
    }
    let mut rooms = lock(&s.live.rooms);
    let gone: Vec<String> = rooms
        .iter()
        .filter(|(_, h)| !h.joined)
        .map(|(p, _)| p.clone())
        .collect();
    for path in gone {
        log::write(
            "INFO",
            "sync",
            &format!("live: {path} was not back in its room; compared from its base"),
        );
        rooms.remove(&path);
        lock(&s.live.left).insert(path);
    }
}

/// The files here as the pass plans on them: a note in its room whose
/// local file is the tab's own text — written while out of the room, and
/// merged back by the rejoin — counts as unchanged since the base, so the
/// pass neither sends it nor makes a copy of it; the server's version,
/// the room's save, comes down over it (item 6). `None`: nothing to hide.
/// The steps still check the file the pass read (invariant 11).
pub(crate) fn masked(
    s: &Syncer,
    local: &Files,
    there: &Files,
    base: &BTreeMap<String, String>,
) -> Option<Files> {
    let mut rooms = lock(&s.live.rooms);
    let mut out: Option<Files> = None;
    for (path, h) in rooms.iter_mut() {
        let Some(own) = h.own.clone() else {
            continue;
        };
        let here = local.get(path);
        // The file moved on since the tab wrote it: from outside (item 11).
        if here.map(|f| f.hash.as_str()) != Some(own.as_str()) {
            h.own = None;
            continue;
        }
        // Out of the room, or both sides hold it already: the ordinary
        // comparison.
        if !h.joined || there.get(path).map(|f| f.hash.as_str()) == Some(own.as_str()) {
            continue;
        }
        let (Some(b), Some(f)) = (base.get(path), here) else {
            continue;
        };
        out.get_or_insert_with(|| local.clone()).insert(
            path.clone(),
            FileState {
                hash: b.clone(),
                size: f.size,
            },
        );
    }
    out
}
