// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window hearing a live share (ADR 0116 items 18, 22, 30): a lazy chunk,
// loaded when a share is first heard, never in the main bundle — the WASM
// decoder, the stream and the worklet's node. The decoded sound goes from the
// worklet through a GainNode on the dice's audio context (item 12's path: the
// one context, the unlock in a gesture, the volume that works on iOS) whose
// gain is the person's own volume, mute and *Follow the table*; the share
// carries the game master's gain already (item 22).

import { asset } from "../../version";
import { opusDecoder } from "./opusDecoder";
import { PROCESSOR, WORKLET_FILE } from "./pcm";
import { ShareStream, type StreamStats } from "./shareStream";
import type { JitterStats } from "./jitter";

/** The worklet's module, added once per context. */
const added = new WeakMap<AudioContext, Promise<void>>();
function addWorklet(ctx: AudioContext): Promise<void> {
  let p = added.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(new URL(asset(WORKLET_FILE), document.baseURI).href);
    // A refusal is tried again at the next share.
    p.catch(() => added.delete(ctx));
    added.set(ctx, p);
  }
  return p;
}

export type ListenerStats = { stream: StreamStats; jitter: JitterStats; delayMs: number; depth: number; starved: number; queued: number; level: number };

export class ShareListener {
  private starved = 0;
  private queued = 0;
  private level = 0;
  private closed = false;

  private constructor(
    private readonly stream: ShareStream,
    private readonly node: AudioWorkletNode,
    private readonly gain: GainNode,
  ) {
    node.port.onmessage = (e: MessageEvent) => {
      if (this.closed) return;
      const d = e.data as { queued: number; starved: number; level: number };
      this.queued = d.queued;
      this.starved = d.starved;
      this.level = d.level;
      for (const pcm of this.stream.supply(d.queued, performance.now())) {
        this.node.port.postMessage(pcm, [pcm.l.buffer, pcm.r.buffer]);
      }
    };
  }

  /** Hear share `share` on `ctx` at `gain` (0 to 1). */
  static async open(ctx: AudioContext, share: number, gain: number): Promise<ShareListener> {
    const [decoder] = await Promise.all([opusDecoder(), addWorklet(ctx)]);
    const node = new AudioWorkletNode(ctx, PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const g = ctx.createGain();
    g.gain.value = clamp(gain);
    node.connect(g).connect(ctx.destination);
    return new ShareListener(new ShareStream(decoder, share), node, g);
  }

  /** The share this listener hears. */
  get share(): number {
    return this.stream.share;
  }

  /** A binary audio frame from the table's connection. */
  frame(bytes: Uint8Array): void {
    if (!this.closed) this.stream.feed(bytes, performance.now());
  }

  /** The person's own gain changed. */
  setGain(gain: number): void {
    const g = this.gain.gain;
    // A short ramp: a step is a click.
    g.setTargetAtTime(clamp(gain), this.gain.context.currentTime, 0.02);
  }

  /** Behind or rejoined: the buffer starts again from what comes next. */
  restart(): void {
    this.stream.jitter.reset();
    this.node.port.postMessage({ clear: true });
  }

  stats(): ListenerStats {
    const j = this.stream.jitter;
    return { stream: { ...this.stream.stats }, jitter: { ...j.stats }, delayMs: j.delayMs, depth: j.depth, starved: this.starved, queued: this.queued, level: this.level };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.gain.disconnect();
    this.stream.free();
  }
}

const clamp = (g: number): number => (Number.isFinite(g) ? Math.max(0, Math.min(1, g)) : 0);
