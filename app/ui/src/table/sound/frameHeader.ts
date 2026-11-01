// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The 12-byte header of a binary audio frame (ADR 0116 item 19): the same
// layout as `FrameHeader` in `crates/verso-contract/src/audio_share.rs`,
// which is the documented source. Three unsigned 32-bit big-endian words —
// the share's id, the frame's sequence (grows by one, wraps), the capture
// time in ms on the sharer's clock since the share began (wraps) — then
// one Opus packet. Pure: no IO, no state.

export const FRAME_HEADER_LEN = 12;
/** The most a whole frame may weigh (item 28). */
export const FRAME_MOST = 1500;

export interface FrameHeader {
  share: number;
  sequence: number;
  timestampMs: number;
}

/** The header and the packet after it, or null when the bytes are not a frame (too few, too many, no packet). */
export function decodeFrame(bytes: Uint8Array): { header: FrameHeader; packet: Uint8Array } | null {
  if (bytes.length <= FRAME_HEADER_LEN || bytes.length > FRAME_MOST) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    header: { share: view.getUint32(0, false), sequence: view.getUint32(4, false), timestampMs: view.getUint32(8, false) },
    packet: bytes.subarray(FRAME_HEADER_LEN),
  };
}

/** A whole frame, or null when the packet is empty or the frame would pass the bound. */
export function encodeFrame(header: FrameHeader, packet: Uint8Array): Uint8Array | null {
  if (packet.length === 0 || FRAME_HEADER_LEN + packet.length > FRAME_MOST) return null;
  const out = new Uint8Array(FRAME_HEADER_LEN + packet.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, header.share >>> 0, false);
  view.setUint32(4, header.sequence >>> 0, false);
  view.setUint32(8, header.timestampMs >>> 0, false);
  out.set(packet, FRAME_HEADER_LEN);
  return out;
}

/** The first number the server gives a share (`SHARE_ID_FIRST` in Rust): every share's number has its top bit set, and so has every audio frame's first byte. */
export const SHARE_ID_FIRST = 0x8000_0000;

/** Whether a binary message is an audio frame rather than a piece of a file (sync 2, whose first four bytes are a JSON header's length, far below 2^31): its first byte's top bit, as `is_audio_frame` reads it. Says nothing of whether it is a good one (`decodeFrame`). */
export function isAudioFrame(bytes: Uint8Array): boolean {
  return bytes.length > 0 && (bytes[0]! & 0x80) !== 0;
}

/** A message of the table's WebSocket, sorted before anything else of it is read: text for the JSON path, an audio frame for the listener, any other binary message for the sync path as before. */
export type Sorted = { kind: "text"; text: string } | { kind: "audio"; bytes: Uint8Array } | { kind: "binary"; bytes: Uint8Array };

/** Sort what a socket's `message` event carries (a string, or bytes with `binaryType = "arraybuffer"`); null for anything else. */
export function sortMessage(data: unknown): Sorted | null {
  if (typeof data === "string") return { kind: "text", text: data };
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data instanceof Uint8Array ? data : null;
  if (!bytes) return null;
  return isAudioFrame(bytes) ? { kind: "audio", bytes } : { kind: "binary", bytes };
}
