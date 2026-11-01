// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio, the sharer's side as a model (ADR 0116 section B, items 16 and
// 21): the order of a start, its undoing, and the level meter's words. No DOM
// and no host in it: the commands are given (`mine.ts` gives the real ones),
// so the unit tests drive the same code (shareMine.test.mjs).

import type { AudioShare, AudioShareStart, AudioSource, ContractError } from "../../bindings";

type R<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

export type StartDeps = {
  /** `table_share_start`. */
  startShare(wish: AudioShareStart, table: string | null): Promise<R<AudioShare>>;
  /** `table_share_stop`. */
  stopShare(table: string | null): Promise<R<null>>;
  /** The host's capture under the number the server gave (`startCapture`); throws a `ContractError`. */
  capture(id: string, kbps: number, share: number): Promise<unknown>;
  /** A refusal in the person's words. */
  explain(e: ContractError): string;
};

export type StartOutcome = { kind: "started"; share: AudioShare } | { kind: "exists" } | { kind: "failed"; why: string };

/**
 * Start sharing `source` at `kbps`: the server's share first (it gives the number and says whether this person may),
 * then the host's capture under it. A capture that fails ends the server's share again, so the table is never left
 * with a share nobody feeds, and says why. `replace` is the person's yes to ending the table's current share; without
 * it the server answers `exists` and nothing starts.
 */
export async function beginShare(deps: StartDeps, source: AudioSource, kbps: number, replace: boolean, table: string | null): Promise<StartOutcome> {
  const r = await deps.startShare({ name: source.name, kind: source.kind, bitrate_kbps: kbps, replace }, table).catch((e: unknown): R<AudioShare> => ({ status: "error", error: asError(e) }));
  if (r.status === "error") return r.error.kind === "exists" ? { kind: "exists" } : { kind: "failed", why: deps.explain(r.error) };
  try {
    await deps.capture(source.id, kbps, r.data.id);
  } catch (e) {
    await deps.stopShare(table).catch(() => null);
    return { kind: "failed", why: deps.explain(asError(e)) };
  }
  return { kind: "started", share: r.data };
}

function asError(e: unknown): ContractError {
  if (e && typeof e === "object" && "kind" in e && "message" in e) return e as ContractError;
  return { kind: "unavailable", message: e instanceof Error ? e.message : String(e) } as ContractError;
}

/** What the sharer is told of the sound: nothing yet, sound arriving, or silence. */
export type LevelState = "checking" | "arriving" | "silence";

/** Below this peak (0 to 1) a block is silence: a hiss is not sound. */
const FLOOR = 0.003;

/**
 * The level meter's words (item 21): a source that captures nothing — DRM-silenced, the wrong application — is seen
 * at once. Sound is "arriving" while some block within `silentMs` was above the floor; after `silentMs` of nothing
 * (counted from the first block for a source that never sounded) it is "silence".
 */
export class LevelWatch {
  private loud = Number.NEGATIVE_INFINITY;
  private began: number | null = null;
  constructor(readonly silentMs = 3000) {}

  /** The peak of a block, 0 to 1, at `now` (ms). */
  push(peak: number, now: number): void {
    this.began ??= now;
    if (peak >= FLOOR) this.loud = now;
  }

  state(now: number): LevelState {
    if (now - this.loud <= this.silentMs) return "arriving";
    // The clock of "never sounded" starts at the first block, or at the first question when none came.
    this.began ??= now;
    return now - this.began < this.silentMs ? "checking" : "silence";
  }
}

/** A peak (0 to 1) on a meter's scale (0 to 1): decibels from -60 to 0. */
export function meterOf(peak: number): number {
  if (!(peak > 0)) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(peak) + 60) / 60));
}

/** The share's bit rate on the wire, as the server counted it, in kilobits. */
export function rateText(bps: number | null): string {
  return bps === null ? "" : `${Math.round(bps / 1000)} kbit/s`;
}
