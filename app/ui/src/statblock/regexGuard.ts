// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A dice rule's pattern comes from a layout file someone else may have
// written (ADR 0099 item 3, ADR 0083): it runs on every value of every card
// drawn, so a pattern that can backtrack without end would hang the window.
// What is refused before a pattern is ever compiled:
//   - longer than LIMITS.pattern;
//   - a back-reference (`\1`, `\k<name>`);
//   - a quantifier other than `?` on a group that holds a quantifier or an
//     alternation (`(a+)+`, `(a|ab)*`) — the shapes of catastrophic
//     backtracking;
//   - more than ONE unbounded quantifier (`*`, `+`, `{n,}`): two of them
//     (`\w+\w+b`) backtrack in polynomial time, which a window cannot wait
//     for; a bounded one past 20, more than twelve quantifiers in all;
//   - a pattern that matches the empty text;
//   - a pattern that the empirical gate finds slow: compiled and timed
//     against adversarial probe strings at the real MAX_SCAN length, once
//     per pattern, refused past PROBE_MS on any probe ("slow").
// And the text a pattern runs on is cut to MAX_SCAN characters, its matches
// to MAX_MATCHES, and a card's whole dice matching has a time budget
// (dice.ts).

import { LIMITS } from "./model";

export type PatternRefusal = "tooLong" | "backref" | "nested" | "tooMany" | "bigCount" | "invalid" | "empty" | "slow";

/** The most characters of one value a rule scans, and the most dice one
 *  value becomes. */
export const MAX_SCAN = 400;
export const MAX_MATCHES = 50;
/** The most time a pattern may take on one probe before it is refused. */
export const PROBE_MS = 10;

const verdicts = new Map<string, { ok: true; re: RegExp } | { ok: false; why: PatternRefusal }>();

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Adversarial strings of exactly `MAX_SCAN` characters for `src`: runs of
 *  word characters, spaces and digits, the pattern's own literal characters
 *  repeated, and the same runs with a near-miss tail. */
export function probesFor(src: string): string[] {
  const lits = Array.from(new Set(src.replace(/\\./g, "").match(/[A-Za-z0-9+\-]/g) ?? [])).join("");
  const fill = (unit: string): string => unit.repeat(Math.ceil(MAX_SCAN / unit.length)).slice(0, MAX_SCAN);
  const units = ["a", "a1", " ", "9", "a ", "_", "1d", "+1", "a-", lits || "a"];
  const probes: string[] = [];
  for (const u of units) {
    const run = fill(u);
    probes.push(run, run.slice(0, MAX_SCAN - 1) + "!", run.slice(0, MAX_SCAN - 1) + "\n");
  }
  return probes;
}

/** The slowest probe's time over a pattern, in ms, stopping early past
 *  PROBE_MS (a slow one is measured again, to rule out a pause of the host). */
export function probeTime(re: RegExp): number {
  let worst = 0;
  for (const p of probesFor(re.source)) {
    // The best of up to three runs: a pause of the host (GC, a busy core)
    // must not refuse a good pattern; a really slow one is slow every time.
    let best = Infinity;
    for (let attempt = 0; attempt < 3 && best > PROBE_MS; attempt++) {
      const t0 = now();
      re.lastIndex = 0;
      let n = 0;
      for (const _m of p.matchAll(re)) if (++n > 1000) break;
      best = Math.min(best, now() - t0);
    }
    worst = Math.max(worst, best);
    if (worst > PROBE_MS) return worst;
  }
  return worst;
}

/** Whether `src` is a pattern a rule may use: the compiled pattern, or why
 *  not. Never throws. */
export function checkPattern(src: unknown): { ok: true; re: RegExp } | { ok: false; why: PatternRefusal } {
  if (typeof src !== "string" || src.length === 0) return { ok: false, why: "invalid" };
  if (src.length > LIMITS.pattern) return { ok: false, why: "tooLong" };
  const known = verdicts.get(src);
  if (known) {
    if (known.ok) known.re.lastIndex = 0;
    return known;
  }
  const v = judge(src);
  if (verdicts.size > 1000) verdicts.clear();
  verdicts.set(src, v);
  return v;
}

function judge(src: string): { ok: true; re: RegExp } | { ok: false; why: PatternRefusal } {
  const shape = shapeOf(src);
  if (shape) return { ok: false, why: shape };
  let re: RegExp;
  try {
    re = new RegExp(src, "gi");
  } catch {
    return { ok: false, why: "invalid" };
  }
  re.lastIndex = 0;
  if (re.test("")) return { ok: false, why: "empty" };
  re.lastIndex = 0;
  if (probeTime(re) > PROBE_MS) return { ok: false, why: "slow" };
  re.lastIndex = 0;
  return { ok: true, re };
}

type Frame = { quantified: boolean; alternation: boolean };

/** The pattern read by position — escapes, classes, groups and their
 *  quantifiers — and the first refusal it earns, or null. */
function shapeOf(src: string): PatternRefusal | null {
  const stack: Frame[] = [{ quantified: false, alternation: false }];
  let unbounded = 0;
  let total = 0;
  let i = 0;
  // The frame of the group that just closed, if the next token quantifies it.
  let closed: Frame | null = null;
  /** A quantifier at `i`: its length and whether it is unbounded, or null. */
  const quantifierAt = (at: number): { len: number; unbounded: boolean; big: boolean } | null => {
    const c = src[at];
    if (c === "*" || c === "+") return { len: 1, unbounded: true, big: false };
    if (c === "?") return { len: 1, unbounded: false, big: false };
    if (c !== "{") return null;
    const m = /^\{(\d{1,4})(,(\d{0,4}))?\}/.exec(src.slice(at, at + 12));
    if (!m) return null;
    const open = m[2] !== undefined && (m[3] === undefined || m[3] === "");
    const upper = m[2] === undefined ? Number(m[1]) : open ? Infinity : Number(m[3]);
    return { len: m[0].length, unbounded: open, big: !open && upper > 20 };
  };
  while (i < src.length) {
    const c = src[i]!;
    let atom = false;
    if (c === "\\") {
      const n = src[i + 1];
      if (n !== undefined && /[1-9]/.test(n)) return "backref";
      if (n === "k" && src[i + 2] === "<") return "backref";
      i += 2;
      atom = true;
      closed = null;
    } else if (c === "[") {
      // A class: to its closing bracket, escapes skipped.
      let j = i + 1;
      if (src[j] === "^") j++;
      if (src[j] === "]") j++;
      while (j < src.length && src[j] !== "]") j += src[j] === "\\" ? 2 : 1;
      i = j + 1;
      atom = true;
      closed = null;
    } else if (c === "(") {
      stack.push({ quantified: false, alternation: false });
      i++;
      // `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`, `(?<name>`.
      if (src[i] === "?") {
        i++;
        if (src[i] === "<" && src[i + 1] !== "=" && src[i + 1] !== "!") {
          const end = src.indexOf(">", i);
          i = end < 0 ? src.length : end + 1;
        } else if (src[i] === "<") i += 2;
        else i++;
      }
      closed = null;
      continue;
    } else if (c === ")") {
      const frame = stack.length > 1 ? stack.pop()! : null;
      i++;
      if (!frame) return "invalid";
      closed = frame;
      // Whatever the group held counts for the group around it too.
      const parent = stack[stack.length - 1]!;
      if (frame.quantified) parent.quantified = true;
      atom = true;
    } else if (c === "|") {
      stack[stack.length - 1]!.alternation = true;
      i++;
      closed = null;
      continue;
    } else {
      i++;
      atom = true;
      closed = null;
    }
    if (!atom) continue;
    const q = quantifierAt(i);
    if (!q) {
      closed = null;
      continue;
    }
    // A group taken once or not at all (`(…)?`) cannot multiply the ways
    // its inside matches; any other quantifier on it can.
    if (closed && (closed.quantified || closed.alternation) && !(src[i] === "?" && q.len === 1)) return "nested";
    if (q.big) return "bigCount";
    total++;
    if (q.unbounded) unbounded++;
    if (unbounded > 1 || total > 12) return "tooMany";
    stack[stack.length - 1]!.quantified = true;
    i += q.len;
    // A lazy or possessive mark after it.
    if (src[i] === "?") i++;
    closed = null;
  }
  return stack.length === 1 ? null : "invalid";
}
