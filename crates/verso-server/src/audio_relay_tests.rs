// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The relay's rules on its own, with a clock the tests move (ADR 0116
//! items 19 and 28): who may send, the bounds, the ring, a slow listener.
//! The same rules against a running server: `tests_table_share.rs`.

use std::time::{Duration, Instant};

use axum::body::Bytes;
use verso_contract::{AudioShare, AudioShareEnd, AudioSourceKind, FRAME_MOST, FrameHeader};

use super::*;

const MASTER: &str = "ws-m";
const ANA: &str = "ws-a";
const BIA: &str = "ws-b";

fn key() -> Key {
    ("folder".to_owned(), String::new())
}

fn share() -> AudioShare {
    AudioShare {
        table: String::new(),
        id: 0,
        name: "Spotify".to_owned(),
        kind: AudioSourceKind::App,
        by: "Mestre".to_owned(),
        by_id: "acc-m".to_owned(),
        started_ms: 0.0,
        bitrate_kbps: 96,
        listeners: None,
        rate_bps: None,
    }
}

fn frame(share: u32, sequence: u32) -> Bytes {
    let h = FrameHeader {
        share,
        sequence,
        timestamp_ms: sequence.wrapping_mul(20),
    };
    Bytes::from(h.frame(&[0xAB; 240]).unwrap())
}

fn sequence(f: &Bytes) -> u32 {
    FrameHeader::decode(f).unwrap().0.sequence
}

fn drain(inbox: &Inbox) -> Vec<u32> {
    std::iter::from_fn(|| inbox.pop())
        .map(|f| sequence(&f))
        .collect()
}

/// A relay at a fixed instant, the three windows' queues, the two players
/// listening and the master sharing.
struct Table {
    relay: Relay,
    t0: Instant,
    master: Arc<Inbox>,
    ana: Arc<Inbox>,
    bia: Arc<Inbox>,
    id: u32,
}

fn table() -> Table {
    let relay = Relay::default();
    let t0 = Instant::now();
    relay.set_clock(t0);
    let (master, ana, bia) = (relay.inbox(MASTER), relay.inbox(ANA), relay.inbox(BIA));
    assert!(!relay.listen(&key(), ANA, true), "nothing shared yet");
    let (now, replaced) = relay.start(&key(), MASTER, share(), false).unwrap();
    assert!(replaced.is_none());
    assert_eq!(now.listeners, 1, "Ana asked before the share began");
    assert!(relay.listen(&key(), BIA, true));
    Table {
        relay,
        t0,
        master,
        ana,
        bia,
        id: now.share.id,
    }
}

impl Table {
    fn at(&self, ms: u64) {
        self.relay.set_clock(self.t0 + Duration::from_millis(ms));
    }
}

#[test]
fn only_the_sharers_frames_are_relayed_and_never_back_to_it() {
    let t = table();
    // A player's frame, even one naming the live share, is dropped unread.
    assert!(matches!(
        t.relay.frame(ANA, frame(t.id, 0)),
        Heard::Refused(Refusal::NotSharing)
    ));
    assert!(t.ana.is_empty() && t.bia.is_empty());
    assert!(matches!(
        t.relay.frame(MASTER, frame(t.id, 1)),
        Heard::Relayed { .. }
    ));
    assert_eq!(drain(&t.ana), [1]);
    assert_eq!(drain(&t.bia), [1]);
    assert!(t.master.is_empty(), "the sharer hears its source itself");
    // The sharer asking to listen to itself changes nothing.
    assert!(!t.relay.listen(&key(), MASTER, true));
    t.at(20);
    t.relay.frame(MASTER, frame(t.id, 2));
    assert!(t.master.is_empty());
    let c = t.relay.counts(&key()).unwrap();
    assert_eq!((c.relayed, c.refused), (2, 0));
}

#[test]
fn a_frame_past_the_bounds_is_refused_and_counted() {
    let t = table();
    let short = Bytes::from(vec![0x80; 12]);
    let long = Bytes::from(vec![0x80; FRAME_MOST + 1]);
    for f in [short, long] {
        assert!(matches!(
            t.relay.frame(MASTER, f),
            Heard::Refused(Refusal::Size)
        ));
    }
    // The largest frame passes.
    let largest = FrameHeader {
        share: t.id,
        sequence: 0,
        timestamp_ms: 0,
    }
    .frame(&vec![1; FRAME_MOST - 12])
    .unwrap();
    assert!(matches!(
        t.relay.frame(MASTER, Bytes::from(largest)),
        Heard::Relayed { .. }
    ));
    // Not the live share's number.
    assert!(matches!(
        t.relay.frame(MASTER, frame(t.id ^ 1, 1)),
        Heard::Refused(Refusal::OtherShare)
    ));
    // Sixty a second: the 60th of this second passes (one above), the 61st not.
    for n in 1..60 {
        assert!(
            matches!(t.relay.frame(MASTER, frame(t.id, n)), Heard::Relayed { .. }),
            "frame {n}"
        );
    }
    assert!(matches!(
        t.relay.frame(MASTER, frame(t.id, 60)),
        Heard::Refused(Refusal::Rate)
    ));
    // A second later, room again.
    t.at(1000);
    assert!(matches!(
        t.relay.frame(MASTER, frame(t.id, 61)),
        Heard::Relayed { .. }
    ));
    let c = t.relay.counts(&key()).unwrap();
    assert_eq!((c.relayed, c.refused), (61, 4));
    // The refused never reached a listener.
    let heard = drain(&t.ana);
    assert_eq!(heard.len(), 61);
    assert!(!heard.contains(&60));
}

#[test]
fn a_late_listener_gets_the_ring_then_the_live_frames() {
    let t = table();
    // Three seconds at fifty frames a second.
    for n in 0..150_u32 {
        t.at(u64::from(n) * 20);
        t.relay.frame(MASTER, frame(t.id, n));
    }
    let late = t.relay.inbox("ws-late");
    assert!(t.relay.listen(&key(), "ws-late", true));
    t.at(3000);
    t.relay.frame(MASTER, frame(t.id, 150));
    let heard = drain(&late);
    // The ring: the last two seconds, at most, then the live one.
    assert!(heard.len() <= RING_MOST + 1, "{}", heard.len());
    assert_eq!(heard.first(), Some(&49), "{heard:?}");
    assert_eq!(heard.last(), Some(&150));
    assert!(heard.windows(2).all(|w| w[1] == w[0] + 1), "{heard:?}");
    // Asking twice does not give the ring twice.
    assert!(!t.relay.listen(&key(), "ws-late", true));
    assert!(late.is_empty());
}

#[test]
fn a_slow_listener_loses_the_oldest_and_is_paused_after_ten_seconds() {
    let t = table();
    // Ana never reads; Bia reads each frame as it comes.
    let mut paused_at = None;
    for n in 0..600_u32 {
        t.at(u64::from(n) * 20);
        let heard = t.relay.frame(MASTER, frame(t.id, n));
        assert!(t.ana.len() <= QUEUE_FRAMES, "never more than its bound");
        assert_eq!(drain(&t.bia), [n], "a listener that keeps up loses nothing");
        if let Heard::Relayed {
            behind,
            tell_sharer,
            ..
        } = heard
            && behind.contains(&ANA.to_owned())
        {
            assert!(tell_sharer, "the sharer's count is told at once");
            paused_at = Some(n);
            break;
        }
    }
    // Ten seconds of a queue never emptied: the first frame sat at 0 ms,
    // so the frame after 10 000 ms finds her behind.
    assert_eq!(paused_at, Some(501));
    let c = t.relay.counts(&key()).unwrap();
    assert_eq!(c.dropped, 501 - u64::try_from(QUEUE_FRAMES).unwrap());
    // Paused: her queue cleared, nothing more for her, the count down.
    assert!(t.ana.is_empty());
    assert_eq!(t.relay.current(&key()).unwrap().listeners, 1);
    t.at(10_100);
    t.relay.frame(MASTER, frame(t.id, 600));
    assert!(t.ana.is_empty());
    // Until she asks again: the ring, then the live frames.
    assert!(t.relay.listen(&key(), ANA, true));
    let back = drain(&t.ana);
    assert_eq!(back.last(), Some(&600));
    assert!(back.len() > 1 && back.len() <= RING_MOST, "{}", back.len());
}

#[test]
fn a_listener_that_stops_or_leaves_receives_nothing_more() {
    let t = table();
    t.relay.frame(MASTER, frame(t.id, 0));
    assert!(t.relay.listen(&key(), ANA, false));
    assert!(t.ana.is_empty(), "what waited for her is taken out");
    assert!(t.relay.left(&key(), BIA));
    assert!(t.bia.is_empty());
    t.at(20);
    t.relay.frame(MASTER, frame(t.id, 1));
    assert!(t.ana.is_empty() && t.bia.is_empty());
    assert_eq!(t.relay.current(&key()).unwrap().listeners, 0);
}

#[test]
fn a_share_ends_on_stop_on_its_sharer_going_on_an_empty_table_and_on_a_replace() {
    // Stop.
    let t = table();
    t.relay.frame(MASTER, frame(t.id, 0));
    let ended = t.relay.stop(&key(), AudioShareEnd::Stopped).unwrap();
    assert_eq!((ended.id, ended.reason), (t.id, AudioShareEnd::Stopped));
    assert!(t.ana.is_empty(), "its frames out of every queue");
    assert!(t.relay.current(&key()).is_none());
    assert!(t.relay.stop(&key(), AudioShareEnd::Stopped).is_none());
    // Frames after the end are no one's.
    assert!(matches!(
        t.relay.frame(MASTER, frame(t.id, 1)),
        Heard::Refused(Refusal::NotSharing)
    ));

    // The sharer's connection goes; a player's going ends nothing.
    let t = table();
    assert!(t.relay.gone(ANA).is_empty());
    let ended = t.relay.gone(MASTER);
    assert_eq!(ended.len(), 1);
    assert_eq!(ended[0].reason, AudioShareEnd::SharerLeft);

    // The table empties.
    let t = table();
    assert!(
        !t.relay.left(&key(), MASTER),
        "the sharer's panel closed: it goes on"
    );
    assert!(t.relay.current(&key()).is_some());
    let ended = t.relay.emptied(&key()).unwrap();
    assert_eq!(ended.reason, AudioShareEnd::TableEmpty);

    // A second share asks to replace the first; replacing ends it.
    let t = table();
    assert!(t.relay.start(&key(), MASTER, share(), false).is_err());
    assert_eq!(t.relay.current(&key()).unwrap().share.id, t.id);
    let (now, replaced) = t.relay.start(&key(), MASTER, share(), true).unwrap();
    let replaced = replaced.unwrap();
    assert_eq!(
        (replaced.id, replaced.reason),
        (t.id, AudioShareEnd::Replaced)
    );
    assert_ne!(now.share.id, t.id, "a number is never used again");
    // The listeners hear the new share at once, and only it.
    assert_eq!(now.listeners, 2);
    assert!(matches!(
        t.relay.frame(MASTER, frame(t.id, 0)),
        Heard::Refused(Refusal::OtherShare)
    ));
    t.relay.frame(MASTER, frame(now.share.id, 0));
    assert_eq!(drain(&t.ana), [0]);
}

#[test]
fn a_shares_number_has_its_top_bit_and_its_sharer_is_told_count_and_rate() {
    let t = table();
    assert!(t.id >= verso_contract::SHARE_ID_FIRST);
    assert!(verso_contract::is_audio_frame(&frame(t.id, 0)));
    for n in 0..50_u32 {
        t.at(u64::from(n) * 20);
        t.relay.frame(MASTER, frame(t.id, n));
    }
    let now = t.relay.current(&key()).unwrap();
    assert_eq!(now.listeners, 2);
    // Fifty frames of 252 bytes in the last second, to two listeners.
    assert_eq!(now.rate_bps, 50 * 252 * 8 * 2);
    assert_eq!(now.sharer, MASTER);
}

#[test]
fn a_closed_connection_is_forgotten() {
    let t = table();
    drop(t.ana);
    t.relay.frame(MASTER, frame(t.id, 0));
    assert_eq!(drain(&t.bia), [0]);
    // A new connection's queue drops the dead one's place.
    let _other = t.relay.inbox("ws-other");
    assert!(
        !lock(&t.relay.state).inboxes.contains_key(ANA),
        "a dead queue is not kept"
    );
}
