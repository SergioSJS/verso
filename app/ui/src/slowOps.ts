// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* Slow operations leave one line in the app's log (the window's log
 * bridge, `log_write`), with where the time went, so a slow open on a
 * server's folder can be told from the log alone. */

/** An operation slower than this is logged. */
export const SLOW_MS = 1000;

/** Timings of one operation: the steps by name, in ms since it began. */
export class Stopwatch {
  private readonly began = performance.now();
  private last = this.began;
  private readonly steps: [string, number][] = [];

  /** The step that just ended, with the time since the previous one. */
  step(name: string): void {
    const now = performance.now();
    this.steps.push([name, now - this.last]);
    this.last = now;
  }

  /** The time since the start, in ms. */
  get total(): number {
    return performance.now() - this.began;
  }

  /** The log line, or null when the operation was not slow. */
  line(what: string, limit = SLOW_MS): string | null {
    const total = this.total;
    if (total <= limit) return null;
    return `slow ${what}: ${Math.round(total)} ms (${this.steps.map(([n, ms]) => `${n} ${Math.round(ms)} ms`).join(", ")})`;
  }

  /** One INFO line to the app's log when the operation was slow. */
  report(what: string, limit = SLOW_MS): void {
    const line = this.line(what, limit);
    if (line) void import("./bindings").then(({ commands }) => commands.logWrite("INFO", line)).catch(() => undefined);
  }
}

/** Time `run`; a call slower than the limit is logged as `what`. */
export async function timed<T>(what: string, run: () => Promise<T>, limit = SLOW_MS): Promise<T> {
  const watch = new Stopwatch();
  try {
    return await run();
  } finally {
    watch.step("round trip");
    watch.report(what, limit);
  }
}
