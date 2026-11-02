// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The arithmetic of music at the table (ADR 0116 items 10, 11, 12): the
// server's clock as this window estimates it, where a track should be now,
// what to do when the element is off, and the gain. Pure: no element, no
// timer, no command; the player and the unit tests drive the same code.

/** The shape of a channel the arithmetic needs (the contract's `TablePlayback`, its numbers read). */
export type Timing = {
  state: "playing" | "paused" | "stopped";
  positionMs: number;
  anchorMs: number;
  looping: boolean;
  durationMs: number | null;
};

/** Within this, nothing is done (item 11). */
export const CLOSE_MS = 60;
/** Past this, the element seeks; between, its rate is nudged. */
export const FAR_MS = 400;
/** The most the rate is nudged, either way (the engines keep the pitch). */
export const NUDGE = 0.03;
/** The window over which a nudge makes up the difference, in ms. */
const MAKE_UP_MS = 2000;

/** One answer of `table_time`: when it was asked and answered here, and what the server said. */
export type Sample = { sent: number; received: number; server: number };

/** The server's clock as this window estimates it, as NTP does: each sample
 *  gives an offset `server - (sent + received) / 2`; the one with the smallest
 *  round trip is the best, and once there are enough, the median of the best
 *  half. The first answer is used at once. */
export class Clock {
  private samples: { rtt: number; offset: number }[] = [];
  /** How many samples are kept. */
  static readonly KEPT = 16;

  add(s: Sample): void {
    if (!Number.isFinite(s.sent) || !Number.isFinite(s.received) || !Number.isFinite(s.server) || s.received < s.sent) return;
    this.samples.push({ rtt: s.received - s.sent, offset: s.server - (s.sent + s.received) / 2 });
    if (this.samples.length > Clock.KEPT) this.samples.shift();
  }

  /** How many samples it holds. */
  get count(): number {
    return this.samples.length;
  }

  /** The server's clock minus this one's, in ms; null before any answer. */
  offset(): number | null {
    if (this.samples.length === 0) return null;
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    if (best.length < 4) return best[0]!.offset;
    const half = best.slice(0, Math.ceil(best.length / 2)).map((s) => s.offset).sort((a, b) => a - b);
    const mid = Math.floor(half.length / 2);
    return half.length % 2 === 1 ? half[mid]! : (half[mid - 1]! + half[mid]!) / 2;
  }

  /** The server's time now, from this clock's `now` (ms); this clock's own before any answer. */
  serverNow(now: number): number {
    return now + (this.offset() ?? 0);
  }
}

/** Where the track should be at the server's instant `serverNow`, in ms. A
 *  looping track wraps at its length; one that does not stops at its end. */
export function expectedMs(t: Timing, serverNow: number): number {
  const at = t.state === "playing" ? t.positionMs + Math.max(0, serverNow - t.anchorMs) : t.state === "paused" ? t.positionMs : 0;
  const d = t.durationMs;
  if (d !== null && d > 0) return t.looping ? at % d : Math.min(at, d);
  return at;
}

/** The length of a track as every player of it reads it: the table's own,
 *  once learned, else what the element says. */
export function lengthOf(tableMs: number | null, elementSeconds: number): number | null {
  if (tableMs !== null && tableMs > 0) return tableMs;
  return Number.isFinite(elementSeconds) && elementSeconds > 0 ? elementSeconds * 1000 : null;
}

/** Past this, two readings of one file's length differ for real (an engine's
 *  estimate from the bitrate, before it has read the whole file). */
export const LENGTH_TOLERANCE_MS = 500;

/** What to tell the table about a length an element just read: the reading
 *  when the table has none or holds another (an early estimate is corrected
 *  by the element's later, exact one); null when there is nothing to say. */
export function settleLength(storedMs: number | null, readMs: number): number | null {
  if (!Number.isFinite(readMs) || readMs <= 0) return null;
  if (storedMs === null || storedMs <= 0) return readMs;
  return Math.abs(storedMs - readMs) > LENGTH_TOLERANCE_MS ? readMs : null;
}

/** Whether a track that does not loop has ended by the server's clock. */
export function ended(t: Timing, serverNow: number): boolean {
  if (t.state !== "playing" || t.looping || t.durationMs === null || t.durationMs <= 0) return false;
  return t.positionMs + Math.max(0, serverNow - t.anchorMs) >= t.durationMs;
}

export type Fix = { kind: "none" } | { kind: "rate"; rate: number } | { kind: "seek"; toMs: number };

/** What to do with an element at `actualMs` that should be at `wantMs`
 *  (item 11): within CLOSE_MS nothing (the rate back to 1); up to FAR_MS
 *  the rate nudged by at most NUDGE to make the difference up over two
 *  seconds; past it a seek. `durationMs` bounds the wrap of a loop: an
 *  element just past the start while the expected is just before the end
 *  (or the other way) is near, not a track away. */
export function fix(actualMs: number, wantMs: number, durationMs: number | null = null): Fix {
  let diff = wantMs - actualMs;
  if (durationMs !== null && durationMs > 0 && Math.abs(diff) > durationMs / 2) diff -= Math.sign(diff) * durationMs;
  const off = Math.abs(diff);
  if (off <= CLOSE_MS) return { kind: "none" };
  if (off > FAR_MS) return { kind: "seek", toMs: wantMs };
  const rate = 1 + Math.max(-NUDGE, Math.min(NUDGE, diff / MAKE_UP_MS));
  return { kind: "rate", rate };
}

/** The gain of the music on this window (item 12): the game master's volume
 *  times the person's own, 0 when muted or not following the table. */
export function gain(master: number, own: number, muted: boolean, follow = true): number {
  if (muted || !follow) return 0;
  const m = Math.max(0, Math.min(100, Number.isFinite(master) ? master : 100));
  const o = Math.max(0, Math.min(100, Number.isFinite(own) ? own : 100));
  return (m / 100) * (o / 100);
}

/** A position as the strip writes it: `m:ss`, or `h:mm:ss`. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}
