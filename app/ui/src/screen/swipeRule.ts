// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- A sideways swipe brings a side panel (ADR 0076 item 6) ----------
 * The maintainer, 2026-11-15: on the phone a finger drawn from right to left
 * brings the right panel, from left to right the files, as most apps with
 * hidden side drawers do — so that, in portrait, the bottom bar need not be
 * on to reach them. What a touch is, decided here without the page: the
 * runtime (swipe.ts) reads the touches and the page, and asks.
 *
 * Not from the screen's edge: Android's gesture navigation takes a swipe
 * that starts at the very left or right edge as its own Back, and the page
 * never sees it or sees it cancelled. A swipe starts anywhere else in the
 * content, is clearly sideways, and is long or fast enough. What the finger
 * means there already — a selection, a field, something that scrolls
 * sideways, a canvas that pans or draws — keeps it (`Blocks`). */

import { HOLD_MS } from "../touch";

/** The band along each side of the screen where no swipe starts, in CSS
 *  pixels: Android's Back gesture lives there. The default, when the system
 *  does not say how wide its band is (iOS, a browser). */
export const EDGE_PX = 24;
/** Added to the band Android reports (its Back sensitivity can widen it), so
 *  a finger that lands just inside the system's band is not taken for ours. */
export const EDGE_MARGIN_PX = 8;

/** The band on each side where no swipe starts: Android's own Back band
 *  (`window.VersoGestures`, MainActivity.kt) plus a margin when the system
 *  says it, `EDGE_PX` otherwise. With three-button navigation the system's
 *  band is 0 and only the margin is left. */
export function edgeBands(reported: { left: number; right: number } | null): { left: number; right: number } {
  if (!reported) return { left: EDGE_PX, right: EDGE_PX };
  const band = (n: number) => (Number.isFinite(n) && n >= 0 ? n + EDGE_MARGIN_PX : EDGE_PX);
  return { left: band(reported.left), right: band(reported.right) };
}
/** How far the finger goes before the swipe is read at all, in CSS pixels. */
export const SLOP_PX = 10;
/** Sideways means at least this many times more across than down: within
 *  about 27° of the horizontal. */
export const DOMINANCE = 2;
/** The part of the panel's width the finger must cover for the panel to
 *  stay where it was brought, on release. */
export const COMMIT_FRACTION = 0.35;
/** A flick: this fast in the swipe's direction (px per ms) at the lift, and
 *  at least `FLING_MIN_PX` covered, settles the panel too. */
export const FLING_PX_MS = 0.35;
export const FLING_MIN_PX = 24;
/** The samples of the finger the speed at the lift is measured over, ms. */
export const SPEED_WINDOW_MS = 100;

/** Which side panel is open now. */
export type Drawer = "none" | "left" | "right";
/** What a swipe does: nothing, or opens or closes one panel. */
export type Intent = "none" | "open-left" | "open-right" | "close-left" | "close-right";
/** What under the finger, or on the page, keeps the touch for itself. */
export type Blocks = {
  /** A canvas-like view (board, drawing, map, graph, data graph), a marked
   *  `data-no-swipe`, or an element whose `touch-action` leaves the page no
   *  sideways pan: it pans or draws with one finger. */
  noSwipe?: boolean;
  /** Something that scrolls sideways (a wide table, a code block, a kanban,
   *  a tab strip, a zoomed PDF, the keyboard's bar). */
  scrollX?: boolean;
  /** A field the finger moves the caret in, or a slider. */
  field?: boolean;
  /** A selection of text on the page: its handles are being dragged. */
  selection?: boolean;
  /** A dialog, a menu, a sheet, the dice, a drag or a resize in progress. */
  overlay?: boolean;
};
export type Point = { x: number; y: number; t: number };
/** Where and when the finger came down, on what page. */
export type Start = Point & {
  /** The window's width, for the edges. */
  viewport: number;
  /** The bands along each side where no swipe starts (`edgeBands`);
   *  `EDGE_PX` on both when left out. */
  edges?: { left: number; right: number };
  open: Drawer;
  /** Whether the files, and the right panel, may be opened now (what their
   *  bottom-bar buttons would do). */
  canLeft: boolean;
  canRight: boolean;
};

/** Whether a move still under `SLOP_PX` already leans the way a swipe could
 *  go from here: clearly sideways, and a swipe that way would be taken if it
 *  went on. The page holds such a move (`preventDefault`) though nothing is
 *  decided yet: a browser that sees the first move of a touch go by
 *  unheld treats every later move as its own (they are no longer
 *  cancelable), and the swipe could never be held after it. A move that
 *  leans up or down is let go, so scrolling is untouched. */
export function leansToSwipe(s: Start, at: Point, blocks: Blocks): boolean {
  const dx = at.x - s.x;
  const dy = at.y - s.y;
  if (dx === 0 || Math.abs(dx) < DOMINANCE * Math.abs(dy)) return false;
  const ahead = { x: s.x + Math.sign(dx) * SLOP_PX * DOMINANCE, y: s.y, t: at.t };
  const intent = classify(s, ahead, blocks);
  return intent !== "none" && intent !== "wait";
}

/** What the finger at `at` makes of a touch that began at `s`: "wait" while
 *  it has not gone far enough to tell; else the intent, decided once for the
 *  whole touch. */
export function classify(s: Start, at: Point, blocks: Blocks): Intent | "wait" {
  const edges = s.edges ?? { left: EDGE_PX, right: EDGE_PX };
  if (s.x < edges.left || s.x > s.viewport - edges.right) return "none";
  const dx = at.x - s.x;
  const dy = at.y - s.y;
  // Held still first: a long press (a menu, a drag of a row, a selection).
  if (Math.hypot(dx, dy) < SLOP_PX) return at.t - s.t >= HOLD_MS ? "none" : "wait";
  if (Math.abs(dx) < DOMINANCE * Math.abs(dy)) return "none";
  if (blocks.noSwipe || blocks.scrollX || blocks.field || blocks.selection || blocks.overlay) return "none";
  if (dx > 0) {
    if (s.open === "right") return "close-right";
    if (s.open === "none" && s.canLeft) return "open-left";
    return "none";
  }
  if (s.open === "left") return "close-left";
  if (s.open === "none" && s.canRight) return "open-right";
  return "none";
}

/** How far `dx` (finger moved across, px) goes towards the intent's end. */
export function progress(intent: Intent, dx: number): number {
  switch (intent) {
    case "open-left":
    case "close-right":
      return dx;
    case "open-right":
    case "close-left":
      return -dx;
    default:
      return 0;
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Where the panel stands under the finger: its `translateX` in px, 0 open,
 *  ∓`width` closed (the left one to the left, the right one to the right). */
export function followX(intent: Intent, dx: number, width: number): number {
  switch (intent) {
    case "open-left":
      return clamp(-width + dx, -width, 0);
    case "close-left":
      return clamp(dx, -width, 0);
    case "open-right":
      return clamp(width + dx, 0, width);
    case "close-right":
      return clamp(dx, 0, width);
    default:
      return 0;
  }
}

/** The finger's speed across at the lift, px per ms (signed), from the
 *  samples of its last `SPEED_WINDOW_MS`. */
export function speedX(samples: readonly Point[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    const p = samples[i];
    if (!p || last.t - p.t > SPEED_WINDOW_MS) break;
    first = p;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** Whether, at the lift, the panel goes where the swipe was taking it:
 *  far enough, or flicked. */
export function settles(intent: Intent, dx: number, vx: number, width: number): boolean {
  if (intent === "none") return false;
  const d = progress(intent, dx);
  return d >= width * COMMIT_FRACTION || (d >= FLING_MIN_PX && progress(intent, vx) >= FLING_PX_MS);
}

/** A whole touch, for the tests: the intent it ends with ("none" when it was
 *  not a swipe or did not go far or fast enough). */
export function decideSwipe(start: Start, moves: readonly Point[], blocks: Blocks, width: number): Intent {
  let intent: Intent | "wait" = "wait";
  for (const m of moves) {
    intent = classify(start, m, blocks);
    if (intent !== "wait") break;
  }
  const last = moves[moves.length - 1];
  if (intent === "wait" || intent === "none" || !last) return "none";
  return settles(intent, last.x - start.x, speedX([start, ...moves]), width) ? intent : "none";
}
