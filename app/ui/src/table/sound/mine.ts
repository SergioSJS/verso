// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio, the sharer's window (ADR 0116 section B, items 16, 21, 27):
// whether this window may share at all (the desktop host lists
// `audio_share` AND the table's join said this person may broadcast), what it
// shares now, the level the host reports, and the start and the stop. The
// order of a start and its undoing are `shareMine.ts`'s; the dialogs are
// `sharePick.ts`'s. Nothing here is drawn.

import { listen } from "@tauri-apps/api/event";
import { commands, type AudioShare, type AudioSource } from "../../bindings";
import { can } from "../../can";
import { errorSentence } from "../../errors";
import { startCapture, type Capture } from "./capture";
import { soundChanged, soundOn } from "./run";
import { expectOwnShare, liveShare, markOwnShare } from "./share";
import { beginShare, LevelWatch, type LevelState } from "./shareMine";

/** What this window shares now. */
export type Mine = { id: number; name: string; kind: AudioSource["kind"] };

let table: string | null = null;
let may = false;
let own: Mine | null = null;
let capture: Capture | null = null;
let watch = new LevelWatch();
let peak = 0;
let lastState: LevelState = "checking";
let busy = false;
const subs = new Set<() => void>();
const levelSubs = new Set<(peak: number, state: LevelState) => void>();
let installed = false;

function tell(): void {
  for (const fn of [...subs]) fn();
  soundChanged();
}

/** Told when what this window shares, or may share, changes (not on each level). */
export function onMine(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Told on each level the host reports (about ten a second): for the meter alone. */
export function onLevel(fn: (peak: number, state: LevelState) => void): () => void {
  levelSubs.add(fn);
  return () => levelSubs.delete(fn);
}

/** The table joined (`null`: none) and whether the join said this person may broadcast (`TableJoin.broadcast`). */
export function setMayShare(root: string | null, allowed: boolean): void {
  install();
  const same = table === root && may === allowed;
  table = root;
  may = allowed;
  // Another table, or none: a share this window held is the server's to have ended already.
  if (own && (root === null || liveShare()?.id !== own.id)) finish(false);
  if (!same) tell();
}

/** Whether *Share audio…* is drawn: the desktop host captures, the table lets this person broadcast, the table's sound is on. */
export function mayShare(): boolean {
  return soundOn() && may && table !== null && can("audio_share");
}

/** What this window shares now, if anything. */
export function mine(): Mine | null {
  return own;
}

/** The sharer's own share as the table knows it (listeners, rate), while it is live. */
export function mineLive(): AudioShare | null {
  const s = liveShare();
  return own && s?.id === own.id ? s : null;
}

/** The meter's words now. */
export function levelState(): LevelState {
  return watch.state(performance.now());
}

/** Starting right now (the button waits). */
export function starting(): boolean {
  return busy;
}

const deps = {
  startShare: (wish: Parameters<typeof commands.tableShareStart>[0], root: string | null) => commands.tableShareStart(wish, root),
  stopShare: (root: string | null) => commands.tableShareStop(root),
  capture: async (id: string, kbps: number, share: number) => {
    capture = await startCapture(id, kbps, share);
    markOwnShare(share);
  },
  explain: errorSentence,
};

/** The sources this computer can capture (apps by their display name). Empty until a capture back-end is built. */
export async function sources(): Promise<AudioSource[]> {
  const r = await commands.audioSourcesList().catch(() => null);
  return r?.status === "ok" ? r.data : [];
}

/** Start sharing; `replace` is the person's yes to ending the table's current share. */
export async function startOwn(source: AudioSource, kbps: number, replace: boolean): Promise<{ kind: "started" } | { kind: "exists" } | { kind: "failed"; why: string }> {
  install();
  busy = true;
  expectOwnShare(true);
  tell();
  try {
    const r = await beginShare(deps, source, kbps, replace, table);
    if (r.kind !== "started") {
      markOwnShare(null);
      return r;
    }
    own = { id: r.share.id, name: r.share.name, kind: r.share.kind };
    watch = new LevelWatch();
    peak = 0;
    lastState = "checking";
    return { kind: "started" };
  } finally {
    busy = false;
    expectOwnShare(false);
    tell();
  }
}

/** Stop sharing: the host's capture, then the server's share. */
export async function stopOwn(): Promise<string | null> {
  if (!own) return null;
  const was = table;
  finish(true);
  const r = await commands.tableShareStop(was).catch(() => null);
  return r && r.status === "error" ? errorSentence(r.error) : null;
}

/** The share is over (stopped here, ended by the server, or lost): the capture goes with it. */
function finish(stopCapture: boolean): void {
  const c = capture;
  capture = null;
  own = null;
  markOwnShare(null);
  if (stopCapture || c) void (c ? c.stop() : commands.audioShareStop()).catch(() => null);
  tell();
}

/** The host's level, and the server's end of the share: once, at the first need. */
function install(): void {
  if (installed) return;
  installed = true;
  void listen<number>("audio-share-level", (e) => {
    if (!own) return;
    peak = typeof e.payload === "number" ? e.payload : 0;
    const now = performance.now();
    watch.push(peak, now);
    const state = watch.state(now);
    for (const fn of [...levelSubs]) fn(peak, state);
    if (state !== lastState) {
      lastState = state;
      tell();
    }
  }).catch(() => undefined);
  void listen<{ id: number }>("table-share-stopped", (e) => {
    if (own && e.payload.id === own.id) finish(true);
  }).catch(() => undefined);
  // The silence is also noticed with no block at all (a source that sends nothing).
  setInterval(() => {
    if (!own) return;
    const state = watch.state(performance.now());
    if (state !== lastState) {
      lastState = state;
      tell();
    }
  }, 1000);
  addEventListener("verso:can-changed", () => tell());
}
