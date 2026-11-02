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
//
// Over plain HTTP a page has no `audioWorklet` (secure contexts only; the
// server over HTTP is supported, 2026-10-16): the same queue and the same
// pull then run in a ScriptProcessorNode on the page's thread. With neither,
// `NoAudioPath` is thrown and the window says so (`shareLife.ts`).

import { ownOutput } from "../../dice3d/ownOutput";
import { opusDecoder } from "./opusDecoder";
import { PROCESSOR, PcmQueue, STREAM_RATE } from "./pcm";
import { ShareStream, type StreamStats } from "./shareStream";
import type { JitterStats } from "./jitter";
import { addWorklet } from "./workletModule";

export type ListenerStats = { stream: StreamStats; jitter: JitterStats; delayMs: number; depth: number; starved: number; queued: number; level: number };

/** The page has an AudioWorklet (only in a secure context: not over plain HTTP). */
export const hasWorklet = (ctx: BaseAudioContext): boolean => typeof AudioWorkletNode !== "undefined" && !!ctx.audioWorklet;

/** Neither an AudioWorklet nor a ScriptProcessorNode: a share cannot be heard in this page. */
export class NoAudioPath extends Error {
  constructor() {
    super("no audio path for a share in this page");
    this.name = "NoAudioPath";
  }
}

export class ShareListener {
  private starved = 0;
  private queued = 0;
  private level = 0;
  private closed = false;
  /** The fallback's own queue, where the page has no AudioWorklet. */
  private readonly local: PcmQueue | null;
  private starvedLocal = 0;

  private constructor(
    private readonly stream: ShareStream,
    private readonly node: AudioWorkletNode | ScriptProcessorNode,
    private readonly gain: GainNode,
  ) {
    if (node instanceof ScriptProcessorNode) {
      const q = new PcmQueue(STREAM_RATE);
      this.local = q;
      const rate = node.context.sampleRate;
      node.onaudioprocess = (ev: AudioProcessingEvent) => {
        if (this.closed) return;
        const l = ev.outputBuffer.getChannelData(0);
        const r = ev.outputBuffer.getChannelData(1);
        const played = q.render(l, r, rate);
        this.starvedLocal += l.length - played;
        let energy = 0;
        for (let i = 0; i < played; i++) energy += l[i]! * l[i]! + r[i]! * r[i]!;
        this.tick(q.queued, this.starvedLocal, Math.sqrt(energy / (2 * l.length)));
      };
    } else {
      this.local = null;
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { queued: number; starved: number; level: number };
        this.tick(d.queued, d.starved, d.level);
      };
    }
  }

  /** The output side says how much it still holds: pull what to give it next. */
  private tick(queued: number, starved: number, level: number): void {
    if (this.closed) return;
    this.queued = queued;
    this.starved = starved;
    this.level = level;
    for (const pcm of this.stream.supply(queued, performance.now())) {
      if (this.local) this.local.push(pcm.l, pcm.r);
      else (this.node as AudioWorkletNode).port.postMessage(pcm, [pcm.l.buffer, pcm.r.buffer]);
    }
  }

  /** Hear share `share` on `ctx` at `gain` (0 to 1). */
  static async open(ctx: AudioContext, share: number, gain: number): Promise<ShareListener> {
    const worklet = hasWorklet(ctx);
    if (!worklet && typeof ctx.createScriptProcessor !== "function") throw new NoAudioPath();
    const [decoder] = await Promise.all([opusDecoder(), worklet ? addWorklet(ctx) : Promise.resolve()]);
    const node = worklet
      ? new AudioWorkletNode(ctx, PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
      : ctx.createScriptProcessor(2048, 0, 2);
    const g = ctx.createGain();
    g.gain.value = clamp(gain);
    node.connect(g).connect(ownOutput(ctx));
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
    if (this.local) this.local.clear();
    else (this.node as AudioWorkletNode).port.postMessage({ clear: true });
  }

  stats(): ListenerStats {
    const j = this.stream.jitter;
    return { stream: { ...this.stream.stats }, jitter: { ...j.stats }, delayMs: j.delayMs, depth: j.depth, starved: this.starved, queued: this.queued, level: this.level };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.node instanceof ScriptProcessorNode) this.node.onaudioprocess = null;
    else this.node.port.onmessage = null;
    this.node.disconnect();
    this.gain.disconnect();
    this.stream.free();
  }
}

const clamp = (g: number): number => (Number.isFinite(g) ? Math.max(0, Math.min(1, g)) : 0);
