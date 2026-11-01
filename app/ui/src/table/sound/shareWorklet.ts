// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The AudioWorklet of a live share (ADR 0116 item 18), built on its own to
// `dist/share-worklet.js` (the page's policy lets a worklet load from the
// app's own files only, never from a `blob:`). It plays the decoded samples
// the window posts (`{ l, r }`, 48 kHz) at the context's rate through
// `PcmQueue`, silence when there are none, and every 20 ms of output tells
// the window how many samples it still holds and the level that came out
// (`{ queued, starved, level }`) — the clock the window pulls the jitter
// buffer by (`listener.ts`).

import { PROCESSOR, PcmQueue, STREAM_RATE } from "./pcm";

// The AudioWorkletGlobalScope's own names (not in the DOM's types).
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class ShareProcessor extends AudioWorkletProcessor {
  /** One second at most: far past the delay the window keeps it at. */
  private readonly queue = new PcmQueue(STREAM_RATE);
  private sinceTick = 0;
  private starved = 0;
  private energy = 0;
  private readonly tickEvery = Math.round(sampleRate / 50);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { l?: Float32Array; r?: Float32Array; clear?: boolean };
      if (d.clear) this.queue.clear();
      else if (d.l && d.r) this.queue.push(d.l, d.r);
    };
    this.port.postMessage({ queued: 0, starved: 0 });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const l = out?.[0];
    if (!out || !l) return true;
    const r = out[1] ?? new Float32Array(l.length);
    const played = this.queue.render(l, r, sampleRate);
    if (played < l.length) this.starved += l.length - played;
    for (let i = 0; i < played; i++) this.energy += l[i]! * l[i]! + r[i]! * r[i]!;
    this.sinceTick += l.length;
    if (this.sinceTick >= this.tickEvery) {
      // The level of what came out since the last tick (RMS of both channels): what a test hears.
      const level = Math.sqrt(this.energy / (2 * this.sinceTick));
      this.energy = 0;
      this.sinceTick -= this.tickEvery;
      this.port.postMessage({ queued: this.queue.queued, starved: this.starved, level });
    }
    return true;
  }
}

registerProcessor(PROCESSOR, ShareProcessor);
