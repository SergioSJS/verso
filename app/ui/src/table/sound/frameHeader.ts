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
