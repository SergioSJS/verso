// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The listener's jitter buffer for a live share (ADR 0116 items 18 and 20):
// frames go in as the network brings them — in order or not, late, twice,
// a late joiner's two-second ring at once — and come out in sequence, one
// per 20 ms of output, once the buffer holds its delay. The delay is
// **300 ms**, **600 ms** from the moment a frame is lost or the buffer runs
// dry, and back to 300 a frame a second after a quiet stretch; a buffer that
// holds more than its delay (the delay shrank, the window stalled, the
// sharer's clock runs a little fast) skips frames to come back to it.
//
// Sequence numbers grow by one per frame and wrap at 2^32 (`frameHeader.ts`);
// all arithmetic on them is modulo 2^32. A jump of more than five seconds in
// sequence, or a timestamp that does not follow its sequence, is another
// stream: the buffer starts over. Pure: no timer, no audio, no IO; `now` is
// the caller's clock in ms.

/** One frame's length (`FRAME_MS` in `audio_share.rs`). */
export const FRAME_MS = 20;
/** The delay a share is heard at (item 18). */
export const DELAY_MS = 300;
/** The delay after a loss (item 18). */
export const DELAY_MOST_MS = 600;
/** How long without a loss before the delay starts coming back. */
export const QUIET_MS = 20_000;
/** Then one frame less, this often. */
export const SHRINK_EVERY_MS = 1_000;
/** A buffer too deep all through one such window skips one frame. */
export const SKIP_EVERY_MS = 1_000;
/** Deeper than the delay by this much, it is cut back at once. */
export const HARD_OVER_MS = 400;
/** A jump in sequence or time past this is another stream. */
export const RESET_MS = 5_000;
/** The most frames held, whatever else happens (a window that plays nothing, the ring twice). */
export const HELD_MOST = (DELAY_MOST_MS / FRAME_MS) * 4;

export type Pulled =
  | { kind: "frame"; sequence: number; timestampMs: number; packet: Uint8Array }
  /** Its turn came and it had not: conceal it (or play silence). */
  | { kind: "lost"; sequence: number }
  /** Not playing yet, or no longer: nothing to play. */
  | { kind: "wait" };

export type Pushed = "kept" | "late" | "duplicate";

export type JitterStats = { late: number; duplicate: number; lost: number; underruns: number; skipped: number; resets: number };

/** a − b as a signed difference, modulo 2^32. */
const diff = (a: number, b: number): number => (a - b) | 0;
const inc = (a: number, by = 1): number => (a + by) >>> 0;

type Held = { timestampMs: number; packet: Uint8Array };

export class Jitter {
  private readonly frames = new Map<number, Held>();
  /** The next sequence to play; null while priming. */
  private next: number | null = null;
  private newest: number | null = null;
  private delay = DELAY_MS;
  private shrinkAt = Number.POSITIVE_INFINITY;
  private windowEnd: number | null = null;
  private floor = Number.POSITIVE_INFINITY;
  readonly stats: JitterStats = { late: 0, duplicate: 0, lost: 0, underruns: 0, skipped: 0, resets: 0 };

  /** The delay now, ms. */
  get delayMs(): number {
    return this.delay;
  }

  /** Whether frames are coming out (not priming). */
  get playing(): boolean {
    return this.next !== null;
  }

  /** How many frames' turns are held: from the next to play (or the oldest) to the newest, holes counted. */
  get depth(): number {
    if (this.newest === null) return 0;
    const from = this.next ?? this.oldest();
    return from === null ? 0 : Math.max(0, diff(this.newest, from) + 1);
  }

  /** A frame arrived (`_now`: when, for a caller that keeps one clock; the order is the sequence's). */
  push(sequence: number, timestampMs: number, packet: Uint8Array, _now: number): Pushed {
    const seq = sequence >>> 0;
    if (this.newest !== null) {
      const ahead = diff(seq, this.newest);
      const held = this.frames.get(this.newest);
      const time = held ? diff(timestampMs >>> 0, held.timestampMs) - ahead * FRAME_MS : 0;
      if (Math.abs(ahead) * FRAME_MS > RESET_MS || Math.abs(time) > RESET_MS) this.restart();
    }
    if (this.next !== null && diff(seq, this.next) < 0) {
      this.stats.late++;
      return "late";
    }
    if (this.frames.has(seq)) {
      this.stats.duplicate++;
      return "duplicate";
    }
    this.frames.set(seq, { timestampMs: timestampMs >>> 0, packet });
    if (this.newest === null || diff(seq, this.newest) > 0) this.newest = seq;
    while (this.frames.size > HELD_MOST) this.dropOldest();
    return "kept";
  }

  /** The next 20 ms of output. */
  pull(now: number): Pulled {
    this.shrink(now);
    const target = this.delay / FRAME_MS;
    if (this.next === null) {
      const oldest = this.oldest();
      if (oldest === null || this.depth < target) return { kind: "wait" };
      // Start at the delay from the live edge: a late joiner's ring is cut.
      let from = oldest;
      while (diff(this.newest!, from) + 1 > target) {
        if (this.frames.delete(from)) this.stats.skipped++;
        from = inc(from);
      }
      this.next = from;
      this.windowEnd = now + SKIP_EVERY_MS;
      this.floor = Number.POSITIVE_INFINITY;
    } else {
      this.catchUp(now, target);
    }
    const seq = this.next;
    const held = this.frames.get(seq);
    if (held) {
      this.frames.delete(seq);
      this.next = inc(seq);
      return { kind: "frame", sequence: seq, timestampMs: held.timestampMs, packet: held.packet };
    }
    if (this.newest !== null && diff(this.newest, seq) > 0) {
      this.next = inc(seq);
      this.stats.lost++;
      this.lostAt(now);
      return { kind: "lost", sequence: seq };
    }
    // Dry: wait for the (grown) delay again.
    this.next = null;
    this.stats.underruns++;
    this.lostAt(now);
    return { kind: "wait" };
  }

  /** Start over (another share, another stream). */
  reset(): void {
    this.frames.clear();
    this.next = null;
    this.newest = null;
  }

  private restart(): void {
    this.reset();
    this.stats.resets++;
  }

  private lostAt(now: number): void {
    this.delay = DELAY_MOST_MS;
    this.shrinkAt = now + QUIET_MS;
  }

  private shrink(now: number): void {
    if (this.delay <= DELAY_MS || now < this.shrinkAt) return;
    this.delay = Math.max(DELAY_MS, this.delay - FRAME_MS);
    this.shrinkAt = now + SHRINK_EVERY_MS;
  }

  /** Too deep: cut back at once when far over, else one frame per window that stayed over. */
  private catchUp(now: number, target: number): void {
    const depth = this.depth;
    if (depth > target + HARD_OVER_MS / FRAME_MS) {
      this.skip(depth - target);
      return;
    }
    this.floor = Math.min(this.floor, depth);
    if (this.windowEnd === null || now < this.windowEnd) return;
    if (this.floor > target + 1) this.skip(1);
    this.windowEnd = now + SKIP_EVERY_MS;
    this.floor = Number.POSITIVE_INFINITY;
  }

  private skip(n: number): void {
    for (let i = 0; i < n && this.next !== null; i++) {
      this.frames.delete(this.next);
      this.next = inc(this.next);
      this.stats.skipped++;
    }
  }

  private oldest(): number | null {
    let best: number | null = null;
    for (const seq of this.frames.keys()) if (best === null || diff(seq, best) < 0) best = seq;
    return best;
  }

  private dropOldest(): void {
    const o = this.oldest();
    if (o === null) return;
    this.frames.delete(o);
    this.stats.skipped++;
    if (this.next !== null && diff(this.next, o) <= 0) this.next = inc(o);
  }
}
