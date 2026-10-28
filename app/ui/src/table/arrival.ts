// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// An image of the table whose file is not in this folder yet (on a synced folder the server writes it and the
// sync brings it a few seconds later) waits, and is asked for again: when the folder says that file changed,
// and on a short back-off, for about a minute at most. Then it gives up and offers a button. Never a loop.

/** Waits between asks, in ms; their sum (~63 s) is the whole patience. */
export const BACKOFF: readonly number[] = [1000, 2000, 4000, 8000, 16000, 32000];

export type Phase = "waiting" | "found" | "gave-up";

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const real: Timers = { set: (run, ms) => setTimeout(run, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** One missing picture: `ask` says whether the file is here now; `onPhase` hears every change of phase. */
export class Arrival {
  phase: Phase = "waiting";
  private asked = 0;
  private timer: unknown = null;
  private busy = false;
  /** Bumped by every start: an ask that was out when it changed is ignored when it returns (no second timer chain). */
  private round = 0;

  constructor(
    private readonly ask: () => Promise<boolean>,
    private readonly onPhase: (p: Phase) => void,
    private readonly timers: Timers = real,
  ) {}

  /** Begin waiting: the first wait is scheduled, nothing is asked at once (the caller just found it missing). */
  start(): void {
    this.round += 1;
    this.busy = false;
    this.phase = "waiting";
    this.asked = 0;
    this.onPhase("waiting");
    this.schedule();
  }

  /** The folder says the file changed: ask now (a no-op once found, or while an ask is out). After giving up the
   *  watch is passive: one ask, no timers, and a file that is here moves the card to found. */
  arrived(): Promise<void> {
    return this.try();
  }

  /** The "try again" button: a fresh minute. */
  retry(): void {
    if (this.phase === "found") return;
    this.stop();
    this.start();
  }

  stop(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const wait = BACKOFF[this.asked];
    if (wait === undefined) {
      this.phase = "gave-up";
      this.onPhase("gave-up");
      return;
    }
    this.timer = this.timers.set(() => void this.try(), wait);
  }

  private async try(): Promise<void> {
    if (this.phase === "found" || this.busy) return;
    const round = this.round;
    const passive = this.phase === "gave-up";
    this.busy = true;
    this.stop();
    let here = false;
    try {
      here = await this.ask();
    } catch {
      here = false;
    }
    if (round !== this.round) return;
    this.busy = false;
    if ((this.phase as Phase) === "found") return;
    if (here) {
      this.stop();
      this.phase = "found";
      this.onPhase("found");
      return;
    }
    if (passive) return;
    this.asked += 1;
    this.schedule();
  }
}

/** The pictures waiting, by the file's path. */
const waiting = new Map<string, Set<Arrival>>();
const key = (path: string): string => path.normalize("NFC");

/** Register a waiting picture; call the returned function when it is no longer waiting. */
export function watchFile(path: string, a: Arrival): () => void {
  const k = key(path);
  let set = waiting.get(k);
  if (!set) waiting.set(k, (set = new Set()));
  set.add(a);
  return () => {
    set.delete(a);
    if (set.size === 0) waiting.delete(k);
  };
}

/** The folder reported these paths as changed (sync, watcher): the pictures waiting for them ask again. */
export function filesArrived(paths: Iterable<string>): void {
  if (waiting.size === 0) return;
  for (const p of paths) for (const a of [...(waiting.get(key(p)) ?? [])]) void a.arrived();
}
