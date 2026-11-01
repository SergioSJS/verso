// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The relay of a table's live share (ADR 0116 items 19, 20 and 28): the
//! game master's window sends each Opus packet as a binary message on its
//! WebSocket, a 12-byte header then the packet; the server takes them
//! **only from the connection that started the share**, keeps the last two
//! seconds in a ring **in memory**, and forwards each, unchanged, to every
//! other window of the table that asked to listen. A window that asks late
//! gets the ring, then the live frames.
//!
//! Bounds, judged before anything else of a frame is read (`inflight.rs`'s
//! pattern): a frame from a connection that shares nothing, of more than
//! [`FRAME_MOST`] bytes, past [`FRAMES_PER_SECOND_MOST`] a second, or of a
//! share that is not the connection's live one is **dropped and counted**,
//! never answered — an answer per bad frame would be the flood itself.
//!
//! Each connection has its own bounded queue of frames ([`Inbox`]): when it
//! is full the **oldest** is dropped, never buffered without limit; a
//! connection whose queue has not once emptied in [`BEHIND_MOST`] is
//! behind — it is told, and receives nothing more until it asks again.
//!
//! The server **never decodes, writes or logs** a frame: the packet is
//! bytes it holds a reference to, the ring is memory, and no line of the
//! log carries a byte of one (`tests_table_share.rs`).

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket};
use tokio::sync::Notify;
use verso_contract::{
    AudioShare, AudioShareEnd, FRAME_HEADER_LEN, FRAME_MOST, FRAMES_PER_SECOND_MOST, FrameHeader,
    SHARE_ID_FIRST,
};
use verso_service::lock;

/// How long the ring of a table's share reaches back (item 19).
pub const RING: Duration = Duration::from_secs(2);

/// The frames a second at most, as a count.
const PER_SECOND: usize = FRAMES_PER_SECOND_MOST as usize;

/// The most frames the ring holds: two seconds at the most rate.
pub const RING_MOST: usize = 2 * PER_SECOND;

/// The most frames waiting for one connection: the ring's worth, so a late
/// listener takes the whole ring and a slow one loses the oldest past it.
pub const QUEUE_FRAMES: usize = RING_MOST;

/// How long a connection's queue may hold frames without once emptying
/// before the connection is taken as behind (item 28: ten seconds).
pub const BEHIND_MOST: Duration = Duration::from_secs(10);

/// How often, at most, the sharer is told its count and rate while frames
/// flow (and at once when a listener comes, goes or falls behind).
pub const STATE_EVERY: Duration = Duration::from_secs(5);

/// The frames a connection's loop writes at a time before it looks at its
/// other work (the answers, the pings) again.
const BATCH: usize = 8;

/// A table: the folder's id and the table's root in it.
pub type Key = (String, String);

/// A connection's frames waiting to be written by its loop.
#[derive(Default)]
pub struct Inbox {
    waiting: Mutex<Waiting>,
    ready: Notify,
}

#[derive(Default)]
struct Waiting {
    /// The frames, each with its share's number.
    frames: VecDeque<(u32, Bytes)>,
    /// Since when the queue has held a frame without once emptying.
    since: Option<Instant>,
}

/// What putting a frame in a queue did.
#[derive(Debug, PartialEq, Eq)]
enum Put {
    Queued,
    /// Queued, the oldest dropped to make room.
    DroppedOldest,
    /// Not queued: the connection is behind, its share's frames cleared.
    Behind,
}

impl Inbox {
    /// Frames are waiting.
    pub async fn ready(&self) {
        self.ready.notified().await;
    }

    /// The oldest frame waiting.
    pub fn pop(&self) -> Option<Bytes> {
        let mut w = lock(&self.waiting);
        let frame = w.frames.pop_front();
        if w.frames.is_empty() {
            w.since = None;
        }
        frame.map(|(_, f)| f)
    }

    /// How many frames wait.
    #[must_use]
    pub fn len(&self) -> usize {
        lock(&self.waiting).frames.len()
    }

    /// Whether none waits.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn put(&self, share: u32, frame: Bytes, now: Instant) -> Put {
        let mut w = lock(&self.waiting);
        if w.since
            .is_some_and(|s| now.saturating_duration_since(s) > BEHIND_MOST)
        {
            w.frames.retain(|(s, _)| *s != share);
            if w.frames.is_empty() {
                w.since = None;
            }
            return Put::Behind;
        }
        let mut put = Put::Queued;
        if w.frames.len() >= QUEUE_FRAMES {
            w.frames.pop_front();
            put = Put::DroppedOldest;
        }
        w.frames.push_back((share, frame));
        if w.since.is_none() {
            w.since = Some(now);
        }
        drop(w);
        self.ready.notify_one();
        put
    }

    /// The frames of `share` taken out: the window stopped listening, or
    /// the share ended.
    fn purge(&self, share: u32) {
        let mut w = lock(&self.waiting);
        w.frames.retain(|(s, _)| *s != share);
        if w.frames.is_empty() {
            w.since = None;
        }
    }
}

/// Write the connection's waiting frames, a few at a time: false when a
/// write failed or did not end in time (the connection then closes, as for
/// any message, `rpc::write`).
pub(crate) async fn deliver(
    socket: &mut WebSocket,
    inbox: &Inbox,
    client: &str,
    account: &str,
) -> bool {
    for _ in 0..BATCH {
        let Some(frame) = inbox.pop() else {
            return true;
        };
        if !crate::rpc::write(socket, Message::Binary(frame), client, account).await {
            return false;
        }
    }
    if !inbox.is_empty() {
        inbox.ready.notify_one();
    }
    true
}

/// What a share relayed, refused and dropped, for its line in the log
/// (counts only) and for the load measures of item 28.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Counts {
    pub relayed: u64,
    pub refused: u64,
    pub dropped: u64,
}

struct Live {
    /// The share as everyone sees it (no count, no rate).
    share: AudioShare,
    /// The connection that started it: the only one whose frames count.
    sharer: String,
    ring: VecDeque<(Instant, Bytes)>,
    /// The connections it forwards to now.
    listeners: HashSet<String>,
    /// When the sharer was last told its count and rate.
    told: Instant,
    counts: Counts,
}

#[derive(Default)]
struct State {
    live: HashMap<Key, Live>,
    /// The connections at each table that asked to listen: kept across
    /// shares, so a replaced share is heard at once.
    wants: HashMap<Key, HashSet<String>>,
    /// Each connection's queue, held by its loop.
    inboxes: HashMap<String, Weak<Inbox>>,
}

/// The live shares of every table, in memory only.
pub struct Relay {
    state: Mutex<State>,
    next: AtomicU32,
    /// A test's clock: when set, the time stands there until moved.
    #[cfg(test)]
    clock: Mutex<Option<Instant>>,
}

impl Default for Relay {
    fn default() -> Self {
        Self {
            state: Mutex::default(),
            next: AtomicU32::new(0),
            #[cfg(test)]
            clock: Mutex::default(),
        }
    }
}

/// A share as it stands now, with what only its sharer is told.
#[derive(Debug, Clone)]
pub struct Now {
    pub share: AudioShare,
    pub sharer: String,
    pub listeners: u32,
    pub rate_bps: u32,
}

/// A share that ended.
#[derive(Debug, Clone)]
pub struct Ended {
    pub key: Key,
    pub id: u32,
    pub reason: AudioShareEnd,
    pub sharer: String,
    pub counts: Counts,
}

/// The table shares already, and the one starting did not say `replace`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SharingAlready;

/// Why a frame was dropped unread.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    /// The connection shares nothing.
    NotSharing,
    /// Fewer bytes than a header and a packet, or more than [`FRAME_MOST`].
    Size,
    /// Past [`FRAMES_PER_SECOND_MOST`] in the last second.
    Rate,
    /// Not the number of the connection's live share.
    OtherShare,
}

/// What a frame did.
#[derive(Debug)]
pub enum Heard {
    /// Kept in the ring and forwarded; `behind` are the listeners found
    /// behind (told, no longer forwarded to); `tell_sharer` asks for the
    /// sharer's count and rate to be told.
    Relayed {
        key: Key,
        behind: Vec<String>,
        tell_sharer: bool,
    },
    Refused(Refusal),
}

fn in_last_second(ring: &VecDeque<(Instant, Bytes)>, now: Instant) -> usize {
    ring.iter()
        .rev()
        .take_while(|(t, _)| now.saturating_duration_since(*t) < Duration::from_secs(1))
        .count()
}

impl Live {
    fn now(&self, now: Instant) -> Now {
        let bytes: usize = self
            .ring
            .iter()
            .rev()
            .take_while(|(t, _)| now.saturating_duration_since(*t) < Duration::from_secs(1))
            .map(|(_, f)| f.len())
            .sum();
        let listeners = u32::try_from(self.listeners.len()).unwrap_or(u32::MAX);
        let rate = u64::try_from(bytes)
            .unwrap_or(u64::MAX)
            .saturating_mul(8)
            .saturating_mul(u64::from(listeners));
        Now {
            share: self.share.clone(),
            sharer: self.sharer.clone(),
            listeners,
            rate_bps: u32::try_from(rate).unwrap_or(u32::MAX),
        }
    }
}

impl Relay {
    fn now(&self) -> Instant {
        #[cfg(test)]
        if let Some(at) = *lock(&self.clock) {
            return at;
        }
        Instant::now()
    }

    /// Stand the relay's clock at `at` (tests).
    #[cfg(test)]
    pub(crate) fn set_clock(&self, at: Instant) {
        *lock(&self.clock) = Some(at);
    }

    /// The queue of connection `client`, for its loop to hold as long as it
    /// lasts: forgotten here when the loop lets it go.
    pub fn inbox(&self, client: &str) -> Arc<Inbox> {
        let inbox = Arc::new(Inbox::default());
        let mut st = lock(&self.state);
        st.inboxes.retain(|_, w| w.strong_count() > 0);
        st.inboxes.insert(client.to_owned(), Arc::downgrade(&inbox));
        inbox
    }

    /// The table's share now.
    pub fn current(&self, key: &Key) -> Option<Now> {
        let now = self.now();
        lock(&self.state).live.get(key).map(|l| l.now(now))
    }

    /// What the table's share relayed, refused and dropped so far.
    pub fn counts(&self, key: &Key) -> Option<Counts> {
        lock(&self.state).live.get(key).map(|l| l.counts)
    }

    /// Start `share` at the table, from connection `sharer`, numbered here:
    /// `Err` when the table shares already and `replace` was not said; the
    /// share it replaced, ended, otherwise.
    ///
    /// # Errors
    /// [`SharingAlready`] when the table has a live share and `replace` is
    /// false.
    pub fn start(
        &self,
        key: &Key,
        sharer: &str,
        mut share: AudioShare,
        replace: bool,
    ) -> Result<(Now, Option<Ended>), SharingAlready> {
        let now = self.now();
        let mut st = lock(&self.state);
        if st.live.contains_key(key) && !replace {
            return Err(SharingAlready);
        }
        let replaced = end(&mut st, key, AudioShareEnd::Replaced);
        share.id = SHARE_ID_FIRST | (self.next.fetch_add(1, Ordering::Relaxed) & !SHARE_ID_FIRST);
        share.listeners = None;
        share.rate_bps = None;
        let listeners = st
            .wants
            .get(key)
            .map(|w| w.iter().filter(|c| *c != sharer).cloned().collect())
            .unwrap_or_default();
        let live = Live {
            share,
            sharer: sharer.to_owned(),
            ring: VecDeque::new(),
            listeners,
            told: now,
            counts: Counts::default(),
        };
        let shown = live.now(now);
        st.live.insert(key.clone(), live);
        Ok((shown, replaced))
    }

    /// End the table's share, if it has one.
    pub fn stop(&self, key: &Key, reason: AudioShareEnd) -> Option<Ended> {
        end(&mut lock(&self.state), key, reason)
    }

    /// Connection `client` at the table asks to hear its share (`on`), or
    /// no longer: the ring first, then the live frames. True when the
    /// sharer's count changed. The sharer itself never hears its share.
    pub fn listen(&self, key: &Key, client: &str, on: bool) -> bool {
        let now = self.now();
        let mut st = lock(&self.state);
        let State {
            live,
            wants,
            inboxes,
        } = &mut *st;
        if on {
            wants
                .entry(key.clone())
                .or_default()
                .insert(client.to_owned());
        } else if let Some(w) = wants.get_mut(key) {
            w.remove(client);
        }
        let Some(l) = live.get_mut(key) else {
            return false;
        };
        if l.sharer == client {
            return false;
        }
        let inbox = inboxes.get(client).and_then(Weak::upgrade);
        if on {
            if !l.listeners.insert(client.to_owned()) {
                return false;
            }
            if let Some(inbox) = inbox {
                for (_, f) in &l.ring {
                    inbox.put(l.share.id, f.clone(), now);
                }
            }
            true
        } else {
            if let Some(inbox) = inbox {
                inbox.purge(l.share.id);
            }
            l.listeners.remove(client)
        }
    }

    /// Connection `client` left the table: it no longer listens. True when
    /// the sharer's count changed. The sharer's own leaving of the table's
    /// panel ends nothing (item 16: the share ends on *Stop*, when its
    /// window goes, or when the table empties).
    pub fn left(&self, key: &Key, client: &str) -> bool {
        let mut st = lock(&self.state);
        if let Some(w) = st.wants.get_mut(key) {
            w.remove(client);
            if w.is_empty() {
                st.wants.remove(key);
            }
        }
        let State { live, inboxes, .. } = &mut *st;
        let Some(l) = live.get_mut(key) else {
            return false;
        };
        if let Some(inbox) = inboxes.get(client).and_then(Weak::upgrade) {
            inbox.purge(l.share.id);
        }
        l.listeners.remove(client)
    }

    /// Connection `client` went — disconnected, opened another folder, or
    /// lost this one: every share it started ends.
    pub fn gone(&self, client: &str) -> Vec<Ended> {
        let mut st = lock(&self.state);
        let keys: Vec<Key> = st
            .live
            .iter()
            .filter(|(_, l)| l.sharer == client)
            .map(|(k, _)| k.clone())
            .collect();
        keys.iter()
            .filter_map(|k| end(&mut st, k, AudioShareEnd::SharerLeft))
            .collect()
    }

    /// The last window left the table: its share ends with it.
    pub fn emptied(&self, key: &Key) -> Option<Ended> {
        let mut st = lock(&self.state);
        st.wants.remove(key);
        end(&mut st, key, AudioShareEnd::TableEmpty)
    }

    /// A binary message that is an audio frame, from connection `client`:
    /// judged by who sent it, its length and the rate before its header is
    /// read; then kept and forwarded, or dropped and counted.
    pub fn frame(&self, client: &str, frame: Bytes) -> Heard {
        let now = self.now();
        let mut st = lock(&self.state);
        let State {
            live,
            wants,
            inboxes,
        } = &mut *st;
        let mine: Vec<Key> = live
            .iter()
            .filter(|(_, l)| l.sharer == client)
            .map(|(k, _)| k.clone())
            .collect();
        if mine.is_empty() {
            return Heard::Refused(Refusal::NotSharing);
        }
        let refusal = if frame.len() > FRAME_MOST || frame.len() <= FRAME_HEADER_LEN {
            Some(Refusal::Size)
        } else if mine
            .iter()
            .filter_map(|k| live.get(k))
            .map(|l| in_last_second(&l.ring, now))
            .sum::<usize>()
            >= PER_SECOND
        {
            Some(Refusal::Rate)
        } else {
            None
        };
        // Only now is the header read: twelve bytes, the packet untouched.
        let found = match refusal.map_or_else(|| FrameHeader::decode(&frame).ok(), |_| None) {
            Some((header, _)) => mine
                .iter()
                .find(|k| live.get(*k).is_some_and(|l| l.share.id == header.share))
                .cloned()
                .ok_or(Refusal::OtherShare),
            None => Err(refusal.unwrap_or(Refusal::Size)),
        };
        let key = match found {
            Ok(key) => key,
            Err(why) => {
                for k in &mine {
                    if let Some(l) = live.get_mut(k) {
                        l.counts.refused = l.counts.refused.saturating_add(1);
                    }
                }
                return Heard::Refused(why);
            }
        };
        let Some(l) = live.get_mut(&key) else {
            return Heard::Refused(Refusal::OtherShare);
        };
        l.ring.push_back((now, frame.clone()));
        while l.ring.len() > RING_MOST
            || l.ring
                .front()
                .is_some_and(|(t, _)| now.saturating_duration_since(*t) > RING)
        {
            l.ring.pop_front();
        }
        let mut behind = Vec::new();
        for listener in &l.listeners {
            let Some(inbox) = inboxes.get(listener).and_then(Weak::upgrade) else {
                continue;
            };
            match inbox.put(l.share.id, frame.clone(), now) {
                Put::Queued => {}
                Put::DroppedOldest => l.counts.dropped = l.counts.dropped.saturating_add(1),
                Put::Behind => behind.push(listener.clone()),
            }
        }
        for b in &behind {
            l.listeners.remove(b);
            if let Some(w) = wants.get_mut(&key) {
                w.remove(b);
            }
        }
        l.counts.relayed = l.counts.relayed.saturating_add(1);
        let tell_sharer =
            !behind.is_empty() || now.saturating_duration_since(l.told) >= STATE_EVERY;
        if tell_sharer {
            l.told = now;
        }
        Heard::Relayed {
            key,
            behind,
            tell_sharer,
        }
    }
}

/// The table's share ended for `reason`: its frames out of every queue.
fn end(st: &mut State, key: &Key, reason: AudioShareEnd) -> Option<Ended> {
    let l = st.live.remove(key)?;
    for listener in &l.listeners {
        if let Some(inbox) = st.inboxes.get(listener).and_then(Weak::upgrade) {
            inbox.purge(l.share.id);
        }
    }
    Some(Ended {
        key: key.clone(),
        id: l.share.id,
        reason,
        sharer: l.sharer,
        counts: l.counts,
    })
}

#[cfg(test)]
#[path = "audio_relay_tests.rs"]
mod tests;
