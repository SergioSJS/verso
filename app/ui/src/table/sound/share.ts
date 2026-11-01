// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio, the sharer's window (ADR 0116 section B, item 19): start the
// host's capture and encoder with a channel, and send each frame it hands
// over as a binary message on the table's WebSocket. No button draws this
// yet (the share UI is a later task); S5 calls `startCapture` with the
// table's socket and the share number of the server's answer.

import { Channel } from "@tauri-apps/api/core";
import { type AudioCaptureStarted, type ContractError, commands } from "../../bindings";
import { type FrameCounts, type FrameSend, type RawFrame, forwardFrames } from "./shareFrames";

/** A capture in progress in this window. */
export interface Capture {
  started: AudioCaptureStarted;
  counts: FrameCounts;
  /** Stop the host's capture. Frames already handed over may still arrive and are dropped. */
  stop: () => Promise<void>;
}

/**
 * Ask the host to capture `id` and encode it at `bitrateKbps`, and send its frames with `send`. `share` is
 * the number the server stamped on the share (null until it has answered: the frames of that time are dropped).
 * Throws the host's `ContractError` (refused where this window cannot share audio, or for an unknown source).
 */
export async function startCapture(id: string, bitrateKbps: number, share: () => number | null, send: FrameSend): Promise<Capture> {
  const { onFrame, counts } = forwardFrames(share, send);
  // The host sends raw bytes; the generated binding types the message as a byte list.
  const frames = new Channel<number[]>();
  let live = true;
  frames.onmessage = (raw) => {
    if (live) onFrame(raw as RawFrame);
  };
  const r = await commands.audioShareStart(id, bitrateKbps, frames);
  if (r.status === "error") {
    live = false;
    throw r.error as ContractError;
  }
  return {
    started: r.data,
    counts,
    stop: async () => {
      live = false;
      await commands.audioShareStop();
    },
  };
}
