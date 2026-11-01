// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's live share in this window (ADR 0116 section B), the listening
// side: the table joined hands its share here (`join.ts`), `shareLife.ts`
// decides when to ask for the frames, and the frames come from the window's
// own connection whichever side of the wire it is on (rule 2) — the host's
// channel on the desktop (`audio_share_hear`), the socket itself in a
// browser (`web/bridge.ts` answers the same command). The sound is a lazy
// chunk (`listener.ts`, item 30), opened on the dice's audio context once a
// gesture lets it run (item 25). The person's gain is the music's: own
// volume, mute and Follow the table (`sync.ts`), the master's gain being in
// the stream already (item 22).

import { Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { commands, type AudioShare } from "../../bindings";
import { audioContext, logLine, whenContext } from "../../dice3d/audio";
import { onSound, ownSound, setShareWaiting, soundOn } from "./run";
import { type Gate, type Hearer, TableShare } from "./shareLife";
import { gain } from "./sync";

let active: TableShare | null = null;
/** The share this window started (the sharer's own, `markOwnShare`): never heard here (item 16). */
let ownShare: number | null = null;
let hearing: Promise<void> | null = null;

/** The window's connection hands its audio frames to whichever table is joined now. */
function hearFrames(): void {
  hearing ??= (async () => {
    const frames = new Channel<ArrayBuffer>();
    frames.onmessage = (buf) => active?.frame(new Uint8Array(buf));
    const r = await commands.audioShareHear(frames).catch((e: unknown) => ({ status: "error" as const, error: { message: String(e) } }));
    // Asked again at the next join.
    if (r.status !== "ok") {
      hearing = null;
      logLine("WARN", `share: the window's frames are not handed to it (${r.error.message})`);
    }
  })();
}

/** Sound may start once the dice's context runs; a gesture makes and resumes it (`unlockAudio`). */
const gate: Gate = {
  ready: () => audioContext()?.state === "running",
  onReady(fn) {
    whenContext((ctx) => {
      if (ctx.state === "running") return fn();
      const on = (): void => {
        if (ctx.state !== "running") return;
        ctx.removeEventListener("statechange", on);
        fn();
      };
      ctx.addEventListener("statechange", on);
    });
  },
};

async function open(share: number, g: number): Promise<Hearer> {
  const ctx = audioContext();
  if (!ctx) throw new Error("no audio context");
  const { ShareListener } = await import("./listener");
  return ShareListener.open(ctx, share, g);
}

const ownGain = (): number => {
  const o = ownSound();
  return gain(100, o.volume, o.muted, o.follow);
};

/** The table joined (`table`, as its join named it) and its share, if one is live. */
export function joinShare(table: string, share: AudioShare | null): void {
  leaveShare();
  install();
  hearFrames();
  const s = new TableShare({
    api: {
      listen: (on, t) => commands.tableShareListen(on, t),
      events: async (event, fn) => listen<never>(event, (e) => fn(e.payload as never)),
    },
    table,
    share,
    gate,
    open,
    gain: ownGain,
    follows: () => soundOn() && ownSound().follow,
    own: () => ownShare,
    changed: () => setShareWaiting(active === s && s.waiting),
    log: (line) => logLine("WARN", `share: ${line}`),
  });
  active = s;
  void s.start();
}

/** No table now: nothing is heard. */
export function leaveShare(): void {
  active?.close();
  active = null;
  setShareWaiting(false);
}

/** This window shares `id` (the sharer's side, a later step): it never listens to it. */
export function markOwnShare(id: number | null): void {
  ownShare = id;
  active?.evaluate();
}

/** The share live at the table joined, as this window knows it. */
export function liveShare(): AudioShare | null {
  return active?.live ?? null;
}

let installed = false;
/** Follow, the volume, the switch: the share follows what the music's controls say. Once, at the first join. */
function install(): void {
  // The tests read what the window hears (e2e/table-share.spec.mjs).
  const test = (window as unknown as { __VERSO_TEST__?: Record<string, unknown> }).__VERSO_TEST__;
  if (test) test["share"] = () => (active ? { live: active.live?.id ?? null, heard: active.heard, waiting: active.waiting, hearing: active.hearing() } : null);
  if (installed) return;
  installed = true;
  onSound(() => active?.evaluate());
}
