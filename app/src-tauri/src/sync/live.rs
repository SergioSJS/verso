// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note of a synced folder, live in the server's room while the sync's
//! link is up (ADR 0082). The room's traffic goes over the sync's own
//! connection (item 2): the window's six `collab_*` commands are answered
//! by it, and what the server pushes whose name starts with `collab-` goes
//! to the windows that hold the note. While a note is in its room, sync is
//! the only writer of its local file in Verso (item 6): the room's saves
//! land on the server and come down as any download. Out of the room — the
//! link dropped, sync paused — the tab writes the file itself, and the hash
//! of its last such write is kept here, so that the pass that follows its
//! return knows that text for the tab's own, already in the room: neither
//! sent nor a conflict (items 6 and 9).

use std::collections::BTreeSet;

use super::*;

/// How long a join waits for the pass on its note (item 7): the local
/// text sent first, or set aside as a conflict's copy.
const CATCH_UP: Duration = Duration::from_secs(5);
/// How long a pass waits for the tabs to come back into their rooms
/// (item 9); one that does not is taken to have left.
const REJOIN: Duration = Duration::from_secs(4);
/// How often a wait looks again.
const LOOK: Duration = Duration::from_millis(50);

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

/// What the windows hear: the labels, the event and its payload.
pub(crate) type Told = Arc<dyn Fn(&[String], &str, &Value) + Send + Sync>;

fn unavailable(message: &str) -> Value {
    json!({ "kind": "unavailable", "message": message })
}

impl Live {
    /// The sync's link is up: every held note comes back into its room.
    pub(crate) fn connected(&self, remote: Arc<remote::Remote>) {
        *lock(&self.link) = Some(remote);
        for h in lock(&self.rooms).values_mut() {
            h.joined = false;
        }
    }

    /// The link dropped: every held note is out of its room, its tab
    /// local (item 8).
    pub(crate) fn lost(&self) {
        *lock(&self.link) = None;
        for h in lock(&self.rooms).values_mut() {
            h.joined = false;
        }
    }

    fn remote(&self) -> Option<Arc<remote::Remote>> {
        lock(&self.link).clone()
    }

    /// Whether a window holds `path` in a room now.
    // Its tests need a `verso serve`, not built for Windows.
    #[cfg(all(test, not(windows)))]
    pub(crate) fn holds(&self, path: &str) -> bool {
        lock(&self.rooms).get(path).is_some_and(|h| h.joined)
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
    let Some(remote) = up(s).and_then(|_| s.live.remote()) else {
        return Err(unavailable(
            "the folder's sync is not connected: the note is edited on this computer",
        ));
    };
    match cmd {
        "collab_join" => join(ctx, s, &remote, window, &path).await,
        "collab_update" => {
            let answer = remote.call(cmd, args.clone()).await?;
            // The server tells the other connections; another window of
            // this app in the same room hears it here.
            let others: Vec<String> = lock(&s.live.rooms)
                .get(&path)
                .map(|h| h.windows.iter().filter(|w| *w != window).cloned().collect())
                .unwrap_or_default();
            if !others.is_empty() {
                let payload = json!({ "path": path, "update": args["update"] });
                (ctx.told)(&others, "collab-update", &payload);
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
    catch_up(ctx, s, path).await;
    let mut answer = remote.call("collab_join", json!({ "path": path })).await?;
    // A file whose line ends are mixed: shown read-only, in no room.
    if answer["read_only"] == true {
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
    // A reader's own changes stay here (ADR 0079 item 1): nothing waits.
    if lock(&s.status).role == "reader" {
        return;
    }
    let deadline = tokio::time::Instant::now() + CATCH_UP;
    let mut asked = false;
    while !tokio::task::block_in_place(|| settled(ctx, s, path)) {
        if !asked {
            s.touched([path.to_owned()]);
            asked = true;
        }
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
        tokio::time::sleep(LOOK).await;
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
        joined
    };
    if out && let Some(remote) = s.live.remote() {
        let _ = remote.call("collab_leave", json!({ "path": path })).await;
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
    let Some(remote) = s.live.remote() else {
        return;
    };
    if paths.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
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
        h.own = Some(sha256(bytes));
    }
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
                remote::Heard::Event(event, payload) if event.starts_with("collab-") => {
                    let path = payload["path"].as_str().unwrap_or_default();
                    let to: Vec<String> = lock(&live.rooms)
                        .get(path)
                        .map(|h| h.windows.iter().cloned().collect())
                        .unwrap_or_default();
                    if !to.is_empty() {
                        told(&to, &event, &payload);
                    }
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
