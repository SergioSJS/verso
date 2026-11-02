// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's own sounds have one way out (ADR 0116, the 2026-11-02 note on
// decision A2): every place that makes a sound of Verso's own (the dice, the
// chimes, the table's music, the audio players in notes, the share heard from
// another) connects to `ownOutput(ctx)` instead of `ctx.destination`. Normally
// that node IS the destination's input. On a Mac, while this window shares
// audio, the pages' sound and the window's come out of one WebKit process and
// the capture could not tell them apart; so for that time the node leaves the
// destination and feeds a worklet that posts the final mix, as PCM, to the
// host, which plays it from Verso's own process (`macos_play.rs`) where the
// capture does not look. Outside a share, and everywhere but the Mac, nothing
// changes. No host call in here: the route is given (`table/sound/shareOwn.ts`).

/** Where the window's mix goes during a share: the worklet's module, and the host's side. */
export type OwnRoute = {
  /** Make the worklet's module available on `ctx` (once per context). */
  load(ctx: AudioContext): Promise<void>;
  /** One block, as the worklet posted it: the rate then interleaved stereo, `f32`. */
  send(block: ArrayBuffer): void;
};

/** The worklet's processor name (`shareWorklet.ts`). */
export const OWN_PROCESSOR = "verso-own-out";

type Out = {
  /** What the sounds connect to. */
  gain: GainNode;
  /** While routed to the host: the worklet and the muted tail that keeps it pulled. */
  routed: { node: AudioWorkletNode; tail: GainNode } | null;
};

const outs = new Map<AudioContext, Out>();
let route: OwnRoute | null = null;
/** Bumped by each change of route: an engagement that finds it moved on does nothing. */
let epoch = 0;

/** The node the window's own sounds connect to (made once per context). */
export function ownOutput(ctx: AudioContext): AudioNode {
  let o = outs.get(ctx);
  if (!o) {
    const gain = ctx.createGain();
    o = { gain, routed: null };
    outs.set(ctx, o);
    if (route) void engage(ctx, o, route, epoch).catch(() => undefined);
    else gain.connect(ctx.destination);
  }
  return o.gain;
}

/** Whether the window's own sounds go to the host now (or are about to). */
export function ownRouted(): boolean {
  return route !== null;
}

/**
 * Send the window's own sounds to the host (`to`), or back to the window's own output (`null`). Resolves once every
 * context that exists is routed, so a capture started after it hears none of them; a context made later is routed as
 * it is made. Rejects, with the sounds back on the window's output, when the worklet cannot load.
 */
export async function routeOwn(to: OwnRoute | null, ctxs: readonly (AudioContext | null)[] = []): Promise<void> {
  epoch++;
  const mine = epoch;
  route = to;
  for (const c of ctxs) if (c && !outs.has(c)) ownOutput(c);
  const work: Promise<void>[] = [];
  for (const [ctx, o] of outs) work.push(to ? engage(ctx, o, to, mine) : disengage(ctx, o));
  try {
    await Promise.all(work);
  } catch (e) {
    if (epoch === mine) {
      route = null;
      for (const [ctx, o] of outs) void disengage(ctx, o);
    }
    throw e;
  }
}

async function engage(ctx: AudioContext, o: Out, to: OwnRoute, mine: number): Promise<void> {
  // Off the destination at once: nothing leaks while the module loads.
  tryDo(() => o.gain.disconnect());
  await to.load(ctx);
  if (epoch !== mine || o.routed) return;
  const node = new AudioWorkletNode(ctx, OWN_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
  node.port.onmessage = (e: MessageEvent) => {
    if (epoch === mine && e.data instanceof ArrayBuffer) to.send(e.data);
  };
  // A node nothing pulls is not run: its silent output goes on to the destination.
  const tail = ctx.createGain();
  tail.gain.value = 0;
  o.gain.connect(node);
  node.connect(tail).connect(ctx.destination);
  o.routed = { node, tail };
}

async function disengage(ctx: AudioContext, o: Out): Promise<void> {
  const r = o.routed;
  o.routed = null;
  if (r) {
    r.node.port.onmessage = null;
    tryDo(() => o.gain.disconnect());
    tryDo(() => r.node.disconnect());
    tryDo(() => r.tail.disconnect());
  } else {
    tryDo(() => o.gain.disconnect());
  }
  o.gain.connect(ctx.destination);
}

function tryDo(fn: () => void): void {
  try {
    fn();
  } catch {
    // Already disconnected.
  }
}

/** For tests: forget every output and the route. */
export function resetOwnOutputForTests(): void {
  outs.clear();
  route = null;
  epoch = 0;
}
