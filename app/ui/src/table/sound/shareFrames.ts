// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio, the sharer's window (ADR 0116 section B, items 18 and 19):
// what the window does with a frame the host hands it. The host frames each
// Opus packet with the 12-byte header (frameHeader.ts) but cannot know the
// share's number, which the server stamps; the window writes it over the
// header's first word and sends the whole frame as one binary message.
// Pure: no Tauri, no socket, so the node tests run it.

import { FRAME_HEADER_LEN, FRAME_MOST } from "./frameHeader";

/** What arrives on the host's channel: raw bytes (an ArrayBuffer), or a byte list where a webview hands the bytes over as numbers. */
export type RawFrame = ArrayBuffer | Uint8Array | number[];

/** Where a frame goes: the table's WebSocket, as a binary message. */
export type FrameSend = (frame: Uint8Array) => void;

/** The bytes of a frame as the channel gave it, or null when it cannot be one. */
export function frameBytes(raw: RawFrame): Uint8Array | null {
  const bytes = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : Array.isArray(raw) ? Uint8Array.from(raw) : null;
  if (!bytes || bytes.length <= FRAME_HEADER_LEN || bytes.length > FRAME_MOST) return null;
  return bytes;
}

/** Counts of what a share's window did, for the status and the tests. */
export interface FrameCounts {
  sent: number;
  /** Frames dropped for want of a share number (the server had not answered yet), or because the bytes were not a frame. */
  dropped: number;
}

/**
 * The function the host's channel calls for each frame: it writes the share's number over the header's first
 * word and sends the frame. `share` is read at each frame, so the number the server's answer gives lands on the
 * next frame; none yet (null) drops the frame, since the server would refuse a frame of another share.
 */
export function forwardFrames(share: () => number | null, send: FrameSend): { onFrame: (raw: RawFrame) => void; counts: FrameCounts } {
  const counts: FrameCounts = { sent: 0, dropped: 0 };
  const onFrame = (raw: RawFrame): void => {
    const bytes = frameBytes(raw);
    const id = share();
    if (!bytes || id === null) {
      counts.dropped++;
      return;
    }
    // A copy: the channel's buffer is not ours to change.
    const out = new Uint8Array(bytes);
    new DataView(out.buffer).setUint32(0, id >>> 0, false);
    send(out);
    counts.sent++;
  };
  return { onFrame, counts };
}
