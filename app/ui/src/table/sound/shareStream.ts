// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A live share as this window hears it, before any audio node (ADR 0116 item
// 18): the frames of the share it listens to go into the jitter buffer;
// each time the worklet says how much it still holds, the frames whose turn
// came are decoded — a lost one concealed by libopus's own packet-loss
// concealment for a few frames, silence after that — and handed back as
// stereo 48 kHz samples for the worklet's queue. Frames of another share
// (one that ended, one that replaced it) are not this stream's.
//
// The decoder is given (`opusDecoder.ts` wraps the WASM libopus); the unit
// tests drive this with the real decoder and recorded frames.

import { decodeFrame } from "./frameHeader";
import { Jitter } from "./jitter";

/** Stereo samples at 48 kHz. */
export type Pcm = { l: Float32Array; r: Float32Array };

/** What the stream needs of a decoder. Null: nothing came out (a broken packet); silence is played. */
export interface Decoder {
  decode(packet: Uint8Array): Pcm | null;
  /** The next frame's worth, guessed from the last (packet-loss concealment). */
  conceal(): Pcm | null;
  free(): void;
}

/** One frame's samples (20 ms at 48 kHz). */
export const FRAME_SAMPLES = 960;
/** What the worklet's queue is kept at, in samples: three frames. */
export const LOW_WATER = 3 * FRAME_SAMPLES;
/** Lost frames in a row concealed; past this, silence (libopus fades out by then anyway). */
export const CONCEAL_MOST = 5;

export type StreamStats = { frames: number; foreign: number; broken: number; concealed: number; silent: number };

export class ShareStream {
  readonly jitter = new Jitter();
  readonly stats: StreamStats = { frames: 0, foreign: 0, broken: 0, concealed: 0, silent: 0 };
  private lostRun = 0;

  constructor(
    private readonly decoder: Decoder,
    readonly share: number,
  ) {}

  /** A binary message from the table's connection (already told to be an audio frame). */
  feed(bytes: Uint8Array, now: number): void {
    const f = decodeFrame(bytes);
    if (!f || f.header.share !== this.share) {
      this.stats.foreign++;
      return;
    }
    // The packet is kept past this call: a copy, not a view of the socket's buffer.
    this.jitter.push(f.header.sequence, f.header.timestampMs, f.packet.slice(), now);
  }

  /** The worklet holds `queued` samples: what to send it now. */
  supply(queued: number, now: number): Pcm[] {
    const out: Pcm[] = [];
    let held = queued;
    while (held < LOW_WATER) {
      const p = this.jitter.pull(now);
      if (p.kind === "wait") break;
      const pcm = p.kind === "frame" ? this.play(p.packet) : this.lost();
      out.push(pcm);
      held += pcm.l.length;
    }
    return out;
  }

  free(): void {
    this.decoder.free();
  }

  private play(packet: Uint8Array): Pcm {
    this.lostRun = 0;
    this.stats.frames++;
    const pcm = this.decoder.decode(packet);
    if (pcm && pcm.l.length > 0) return pcm;
    this.stats.broken++;
    return silence();
  }

  private lost(): Pcm {
    this.lostRun++;
    if (this.lostRun <= CONCEAL_MOST) {
      const pcm = this.decoder.conceal();
      if (pcm && pcm.l.length > 0) {
        this.stats.concealed++;
        return pcm;
      }
    }
    this.stats.silent++;
    return silence();
  }
}

function silence(): Pcm {
  return { l: new Float32Array(FRAME_SAMPLES), r: new Float32Array(FRAME_SAMPLES) };
}
