// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Share audio (ADR 0116 section B): the game master's computer captures
//! the sound of an application, a page or the system, encodes it with Opus
//! and sends it, through the server, to every window at the table. This
//! file is the contract only (no IO, no behaviour): the sources the host
//! lists, the share as everyone sees it, the events, the commands' request
//! and answer types, and the binary frame header that the server, the host
//! and the window all use.
//!
//! A share is its own event beside `table-playback` (section A, a file's
//! state) and changes nothing there. The host commands (`audio_sources_list`,
//! `audio_share_start`, `audio_share_stop`) are the desktop's, listed under
//! `Can::AudioShare` and nowhere else; the table commands
//! (`table_share_start`, `table_share_stop`) are the server's, and the
//! game master's alone (`may(Broadcast)`, item 22).

use serde::{Deserialize, Serialize};
use specta::Type;

/// The longest name of a source or of a share, in characters (item 28): plain
/// text, the display name of an application or a page as the host chose it,
/// **never a window title** (a title can be a note's name; nothing of the
/// master's screen is sent).
pub const SOURCE_NAME_MOST: usize = 80;

/// The least Opus bitrate a share may ask for, in kbit/s (item 18).
pub const BITRATE_LEAST: u16 = 64;
/// The most Opus bitrate a share may ask for, in kbit/s (item 18).
pub const BITRATE_MOST: u16 = 128;
/// The bitrate a share asks for when nothing says otherwise, in kbit/s.
pub const BITRATE_DEFAULT: u16 = 96;

/// The stream's fixed sample rate (item 18): 48 kHz.
pub const SAMPLE_RATE: u32 = 48_000;
/// The stream's fixed channel count: stereo.
pub const CHANNELS: u8 = 2;
/// The stream's fixed frame length, in milliseconds.
pub const FRAME_MS: u8 = 20;

/// Whether `kbps` is a bitrate a share may ask for.
#[must_use]
pub fn bitrate_ok(kbps: u16) -> bool {
    (BITRATE_LEAST..=BITRATE_MOST).contains(&kbps)
}

/// Whether `name` is a source name the server accepts: 1 to
/// [`SOURCE_NAME_MOST`] characters, no control character.
#[must_use]
pub fn name_ok(name: &str) -> bool {
    let n = name.chars().count();
    (1..=SOURCE_NAME_MOST).contains(&n) && !name.chars().any(char::is_control)
}

/// What kind of thing a source is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AudioSourceKind {
    /// An application (the Spotify app, a browser).
    App,
    /// A page open in Verso itself (a child web view, ADR 0056).
    Page,
    /// Everything this computer plays (minus Verso's own sounds where the
    /// system allows it).
    System,
}

/// One thing the host can capture (`audio_sources_list`). `id` is the
/// host's own opaque handle, good for the host's next `audio_share_start`
/// and meaningless elsewhere; `name` is at most [`SOURCE_NAME_MOST`]
/// characters of plain text, an application's display name, never a window
/// title.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AudioSource {
    pub id: String,
    pub name: String,
    pub kind: AudioSourceKind,
}

/// What `audio_share_start` answers once the host captures and encodes: the
/// source and the shape of the frames it will hand the window.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AudioCaptureStarted {
    pub source: AudioSource,
    pub bitrate_kbps: u16,
    pub sample_rate: u32,
    pub channels: u8,
    pub frame_ms: u8,
}

/// The sharer's window asks the server to start a share (`table_share_start`):
/// what to call it, what kind of source it is, the bitrate it encodes at.
/// The server checks the closed form ([`name_ok`], [`bitrate_ok`]) and
/// `may(Broadcast)`; one share per table, and `replace` says the sharer
/// agrees to end the table's current one (item 16).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AudioShareStart {
    pub name: String,
    pub kind: AudioSourceKind,
    pub bitrate_kbps: u16,
    #[serde(default)]
    pub replace: bool,
}

/// A table's live share as everyone at the table sees it (events
/// `table-share-started` and `table-share-state`, `TableJoin.share`, the
/// answer of `table_share_start`). The server stamps it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct AudioShare {
    /// The table: its folder inside the server's folder, `""` for the
    /// folder itself (as `TableEntry.table`).
    pub table: String,
    /// The share's number, in every binary frame's header. Never reused by
    /// a table in one server run; its top bit is set ([`SHARE_ID_FIRST`]).
    pub id: u32,
    /// The source's name, as the sharer's host gave it.
    pub name: String,
    pub kind: AudioSourceKind,
    /// Who shares: the name and the opaque account, stamped by the server.
    pub by: String,
    pub by_id: String,
    /// When it started, the server's clock, Unix milliseconds.
    pub started_ms: f64,
    pub bitrate_kbps: u16,
    /// To the sharer only (none to everyone else): how many windows are
    /// receiving.
    pub listeners: Option<u32>,
    /// To the sharer only: the rate leaving the server for them, in bit/s.
    pub rate_bps: Option<u32>,
}

/// Why a share ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AudioShareEnd {
    /// The sharer pressed Stop.
    Stopped,
    /// The sharer's window disconnected, opened another folder or lost the
    /// folder.
    SharerLeft,
    /// The last window left the table (the sharer's had left its panel
    /// before, still sharing).
    TableEmpty,
    /// The sharer started another source in its place.
    Replaced,
}

/// A share ended (event `table-share-stopped`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AudioShareStopped {
    pub table: String,
    pub id: u32,
    pub reason: AudioShareEnd,
}

/// This window fell more than ten seconds behind the share (item 28) and
/// receives no more of its frames until it asks again with
/// `table_share_listen` (event `table-share-behind`, to that window only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AudioShareBehind {
    pub table: String,
    pub id: u32,
}

/// The first number the server gives a share: every share's number has its
/// top bit set, and so the first byte of every audio frame does. The first
/// four bytes of the other binary message a connection carries, a piece of
/// a file (`verso_core::sync::frame`), are the length of a JSON header, far
/// below 2^31 — so a binary message is told apart by its first byte before
/// anything else of it is read ([`is_audio_frame`]).
pub const SHARE_ID_FIRST: u32 = 0x8000_0000;

/// Whether a binary message is an audio frame rather than a piece of a
/// file: its first byte's top bit ([`SHARE_ID_FIRST`]). Says nothing of
/// whether it is a good one ([`FrameHeader::decode`]).
#[must_use]
pub fn is_audio_frame(bytes: &[u8]) -> bool {
    bytes.first().is_some_and(|b| b & 0x80 != 0)
}

// The binary frame (item 19). A window sends each Opus packet on the
// table's WebSocket as one binary message: this header, then the packet.
// The server relays the message to the listening windows unchanged.

/// The header's length, in bytes.
pub const FRAME_HEADER_LEN: usize = 12;

/// The most a whole frame (header and packet) may weigh, in bytes (item
/// 28): 96 kbit/s is about 240 bytes a packet; the bound leaves room for
/// 128 kbit/s and a burst, and refuses what is not audio.
pub const FRAME_MOST: usize = 1500;

/// The most frames a second the server accepts from a sharer (item 28);
/// twenty-millisecond frames are fifty.
pub const FRAMES_PER_SECOND_MOST: u32 = 60;

/// The 12-byte header of a binary audio frame. All fields are unsigned,
/// **big-endian** (network order):
///
/// | bytes | field | meaning |
/// |---|---|---|
/// | 0..4 | `share` | [`AudioShare::id`] of the share the frame belongs to |
/// | 4..8 | `sequence` | grows by one per frame from 0 and wraps; a gap is a lost frame |
/// | 8..12 | `timestamp_ms` | capture time of the packet's first sample, in milliseconds on the sharer's own monotonic clock since the share began, wrapping at 2^32 |
///
/// The packet follows at byte 12 and is one Opus packet of [`FRAME_MS`] ms.
/// The same layout in TypeScript: `app/ui/src/table/sound/frameHeader.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrameHeader {
    pub share: u32,
    pub sequence: u32,
    pub timestamp_ms: u32,
}

/// Why bytes are not a frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameError {
    /// Fewer bytes than a header and one byte of packet.
    TooShort,
    /// More than [`FRAME_MOST`] bytes.
    TooLong,
}

impl FrameHeader {
    /// The header's 12 bytes.
    #[must_use]
    pub fn encode(self) -> [u8; FRAME_HEADER_LEN] {
        let mut out = [0_u8; FRAME_HEADER_LEN];
        out[0..4].copy_from_slice(&self.share.to_be_bytes());
        out[4..8].copy_from_slice(&self.sequence.to_be_bytes());
        out[8..12].copy_from_slice(&self.timestamp_ms.to_be_bytes());
        out
    }

    /// A whole frame: the header, then `packet`. `None` when it would pass
    /// [`FRAME_MOST`] or the packet is empty.
    #[must_use]
    pub fn frame(self, packet: &[u8]) -> Option<Vec<u8>> {
        if packet.is_empty() || FRAME_HEADER_LEN + packet.len() > FRAME_MOST {
            return None;
        }
        let mut out = Vec::with_capacity(FRAME_HEADER_LEN + packet.len());
        out.extend_from_slice(&self.encode());
        out.extend_from_slice(packet);
        Some(out)
    }

    /// Read a received message: the header and the packet after it. Touches
    /// nothing of the packet.
    ///
    /// # Errors
    /// [`FrameError`] when the bytes are too few or too many to be a frame.
    pub fn decode(bytes: &[u8]) -> Result<(Self, &[u8]), FrameError> {
        if bytes.len() > FRAME_MOST {
            return Err(FrameError::TooLong);
        }
        let Some((head, packet)) = bytes.split_first_chunk::<FRAME_HEADER_LEN>() else {
            return Err(FrameError::TooShort);
        };
        if packet.is_empty() {
            return Err(FrameError::TooShort);
        }
        let word =
            |at: usize| u32::from_be_bytes([head[at], head[at + 1], head[at + 2], head[at + 3]]);
        Ok((
            Self {
                share: word(0),
                sequence: word(4),
                timestamp_ms: word(8),
            },
            packet,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_header_is_twelve_big_endian_bytes() {
        let h = FrameHeader {
            share: 0x0102_0304,
            sequence: 0x0A0B_0C0D,
            timestamp_ms: 0xFFEE_DDCC,
        };
        assert_eq!(
            h.encode(),
            [1, 2, 3, 4, 0x0A, 0x0B, 0x0C, 0x0D, 0xFF, 0xEE, 0xDD, 0xCC]
        );
    }

    #[test]
    fn a_frame_round_trips() {
        for h in [
            FrameHeader {
                share: 0,
                sequence: 0,
                timestamp_ms: 0,
            },
            FrameHeader {
                share: 7,
                sequence: 1,
                timestamp_ms: 20,
            },
            FrameHeader {
                share: u32::MAX,
                sequence: u32::MAX,
                timestamp_ms: u32::MAX,
            },
        ] {
            let packet = [9_u8, 8, 7, 6];
            let frame = h.frame(&packet).unwrap();
            assert_eq!(frame.len(), FRAME_HEADER_LEN + 4);
            let (back, rest) = FrameHeader::decode(&frame).unwrap();
            assert_eq!(back, h);
            assert_eq!(rest, packet);
        }
    }

    #[test]
    fn bytes_that_are_not_a_frame_are_refused() {
        assert_eq!(FrameHeader::decode(&[]), Err(FrameError::TooShort));
        assert_eq!(FrameHeader::decode(&[0; 11]), Err(FrameError::TooShort));
        assert_eq!(FrameHeader::decode(&[0; 12]), Err(FrameError::TooShort));
        assert!(FrameHeader::decode(&[0; 13]).is_ok());
        assert!(FrameHeader::decode(&vec![0; FRAME_MOST]).is_ok());
        assert_eq!(
            FrameHeader::decode(&vec![0; FRAME_MOST + 1]),
            Err(FrameError::TooLong)
        );
        let h = FrameHeader {
            share: 1,
            sequence: 1,
            timestamp_ms: 1,
        };
        assert!(h.frame(&[]).is_none());
        assert!(h.frame(&vec![0; FRAME_MOST - FRAME_HEADER_LEN]).is_some());
        assert!(
            h.frame(&vec![0; FRAME_MOST - FRAME_HEADER_LEN + 1])
                .is_none()
        );
    }

    #[test]
    fn an_audio_frame_is_told_from_a_piece_of_a_file_by_its_first_byte() {
        let h = FrameHeader {
            share: SHARE_ID_FIRST,
            sequence: 0,
            timestamp_ms: 0,
        };
        assert!(is_audio_frame(&h.frame(&[1]).unwrap_or_default()));
        assert!(is_audio_frame(
            &FrameHeader {
                share: u32::MAX,
                ..h
            }
            .encode()
        ));
        // A piece's header length, as `verso_core::sync::frame` writes it:
        // even at the largest message (48 MiB) the top bit is clear.
        assert!(!is_audio_frame(&(48_u32 << 20).to_be_bytes()));
        assert!(!is_audio_frame(&[]));
    }

    #[test]
    fn bitrate_and_name_bounds() {
        assert!(!bitrate_ok(63) && bitrate_ok(64) && bitrate_ok(96) && bitrate_ok(128));
        assert!(!bitrate_ok(129));
        assert!(bitrate_ok(BITRATE_DEFAULT));
        assert!(name_ok("Spotify") && name_ok(&"ã".repeat(80)));
        assert!(!name_ok("") && !name_ok(&"a".repeat(81)) && !name_ok("a\nb"));
    }
}
