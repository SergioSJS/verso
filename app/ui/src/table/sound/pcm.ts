// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The share's decoded sound inside the AudioWorklet (ADR 0116 item 18): a
// bounded stereo queue of 48 kHz samples, read out at the audio context's
// own rate — 48 kHz as it is, 44.1 kHz (and any other) through a cubic
// (Catmull-Rom) interpolation. An empty queue plays silence and says so.
// Pure: the worklet (`shareWorklet.ts`) and the unit tests drive the same
// code.

/** The stream's own rate (`SAMPLE_RATE` in `audio_share.rs`). */
export const STREAM_RATE = 48_000;

/** The worklet's processor, as `shareWorklet.ts` registers it and `listener.ts` makes its node. */
export const PROCESSOR = "verso-share";
/** The worklet's file in `dist/` (the build's own entry). */
export const WORKLET_FILE = "share-worklet.js";

export class PcmQueue {
  private readonly l: Float32Array;
  private readonly r: Float32Array;
  private head = 0;
  private count = 0;
  /** Where the next output sample falls between the head and the one after, in input samples. */
  private pos = 0;
  /** The sample before the head, for the interpolation's first point. */
  private prevL = 0;
  private prevR = 0;

  constructor(readonly capacity: number) {
    this.l = new Float32Array(capacity);
    this.r = new Float32Array(capacity);
  }

  /** Samples waiting, per channel. */
  get queued(): number {
    return this.count;
  }

  /** Add samples; past the capacity the oldest go. Returns how many were dropped. */
  push(left: Float32Array, right: Float32Array): number {
    const n = Math.min(left.length, right.length);
    let dropped = 0;
    for (let i = 0; i < n; i++) {
      if (this.count === this.capacity) {
        this.take();
        dropped++;
      }
      const at = (this.head + this.count) % this.capacity;
      this.l[at] = left[i]!;
      this.r[at] = right[i]!;
      this.count++;
    }
    return dropped;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.pos = 0;
    this.prevL = 0;
    this.prevR = 0;
  }

  /** Fill `outL`/`outR` at `outRate`; what the queue cannot give is silence. Returns how many output samples came from sound. */
  render(outL: Float32Array, outR: Float32Array, outRate: number): number {
    const step = STREAM_RATE / outRate;
    const n = outL.length;
    let i = 0;
    for (; i < n; i++) {
      // Four points around the position: the one before, the head, two after.
      if (this.count < 3) break;
      const f = this.pos;
      outL[i] = cubic(this.prevL, this.at(this.l, 0), this.at(this.l, 1), this.at(this.l, 2), f);
      outR[i] = cubic(this.prevR, this.at(this.r, 0), this.at(this.r, 1), this.at(this.r, 2), f);
      this.pos += step;
      while (this.pos >= 1 && this.count > 0) {
        this.take();
        this.pos -= 1;
      }
    }
    outL.fill(0, i);
    outR.fill(0, i);
    return i;
  }

  private at(ch: Float32Array, k: number): number {
    return ch[(this.head + k) % this.capacity]!;
  }

  private take(): void {
    this.prevL = this.l[this.head]!;
    this.prevR = this.r[this.head]!;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
  }
}

/** Catmull-Rom between `p1` (f = 0) and `p2` (f = 1). */
export function cubic(p0: number, p1: number, p2: number, p3: number, f: number): number {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  return ((a * f + b) * f + c) * f + p1;
}
