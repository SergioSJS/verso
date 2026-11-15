// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- The side panels follow a sideways swipe (ADR 0076 item 6) ----------
 * On a phone's frame, with a finger: a swipe from right to left brings the
 * right panel, from left to right the files; with one open, the swipe the
 * other way, on it or on the page beside it, takes it away. The panel
 * follows the finger and, at the lift, settles open or closed (with reduced
 * motion it does not follow: it opens once the finger has gone far enough).
 * What a touch is: swipeRule.ts. The panels open and close through the same
 * toggles as the bottom bar's Files and Panel, so Back, the buttons' names
 * and state, and the tap outside work as they do. The buttons stay: the
 * swipe is an extra, never the only way (item 9).
 *
 * Touch events, not pointer events: the browser takes a pointer for its own
 * scroll and cancels it; a touch it lets the page stop, if the page says so
 * on the move that decides (a listener that may stop the move is there from
 * the touch's start). A move the browser has already taken for a scroll
 * (not cancelable) is left to it. */

import { narrow, toggleRight, toggleSide } from "../chrome";
import { topOverlay } from "../dialogs/a11y";
import { menu } from "../menu";
import { settings } from "../settings";
import { typesText } from "./openFocus";
import { type Blocks, COMMIT_FRACTION, type Drawer, type Intent, type Point, type Start, classify, followX, progress, settles, SLOP_PX, speedX } from "./swipeRule";

/** Views where one finger pans or draws, and any element marked
 *  `data-no-swipe`: the swipe never starts on them. One list, here. The
 *  board's and the drawing's canvas (Excalidraw), the graph, the data
 *  graph, a base's map. (Not every `canvas`: a PDF's pages are canvases,
 *  and an unzoomed PDF takes the swipe; zoomed, it scrolls sideways.) */
const NO_SWIPE = "[data-no-swipe], .board-host, .excalidraw, .graph, .graph-stage, .dg-stage, .base-map, .maplibregl-map";
/** Fields where a finger moves the caret or a thumb. The editor
 *  (`contenteditable`) is not one: a swipe over a note is the main case. */
const FIELD = "input, textarea, select, [role='slider']";
/** On screen while it lasts, the page's own: a sheet, the dice. */
const BUSY = ".phone-sheet, .dice3d-canvas";

const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

/** A `touch-action` that leaves the page no sideways pan: the element
 *  handles a horizontal finger itself. */
function ownsSideways(touchAction: string): boolean {
  if (touchAction === "" || touchAction === "auto" || touchAction.includes("manipulation")) return false;
  return !/pan-x|pan-left|pan-right/.test(touchAction);
}

/** What under `target`, and on the page, keeps this touch. */
function blocksAt(target: EventTarget | null): Blocks {
  const b: Blocks = {};
  const body = document.body;
  b.overlay = Boolean(topOverlay()) || (!menu.hidden && menu.isConnected) || Boolean(document.querySelector(BUSY)) || body.classList.contains("dragging") || body.classList.contains("resizing");
  const sel = getSelection();
  b.selection = Boolean(sel && sel.rangeCount > 0 && !sel.isCollapsed);
  const start = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!start) return b;
  b.noSwipe = Boolean(start.closest(NO_SWIPE));
  b.field = Boolean(start.closest(FIELD));
  for (let el: Element | null = start; el && el !== body && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (ownsSideways(cs.touchAction)) b.noSwipe = true;
    // Scrolls sideways: it overflows across (past a rounding pixel or two)
    // and lets the person scroll it.
    if (el.scrollWidth - el.clientWidth > 2 && /auto|scroll|overlay/.test(cs.overflowX)) b.scrollX = true;
  }
  return b;
}

function openNow(): Drawer {
  const c = document.body.classList;
  return c.contains("side-open") ? "left" : c.contains("right-open") ? "right" : "none";
}

/** The files may open as the bottom bar's Files would: drawn and enabled
 *  (a file opened without its folder has no files, ADR 0114). */
function canOpenLeft(): boolean {
  if (document.documentElement.classList.contains("loose")) return false;
  const files = document.querySelector<HTMLButtonElement>(".bottom-bar .bar-files");
  return !files || !files.disabled;
}

/** The Table's and the Music tab's panel is a sheet from the bottom on a
 *  phone (css/table.css, css/sound.css): it does not follow a finger across. */
function rightIsSheet(): boolean {
  const tab = document.body.dataset["rightTab"] ?? "";
  return tab === "table" || tab === "music";
}

type Gesture = {
  start: Start;
  target: EventTarget | null;
  intent: Intent | "wait";
  samples: Point[];
  aside: HTMLElement | null;
  width: number;
  follow: boolean;
  /** Settled before the lift (no follow): the rest of the touch is spent. */
  done: boolean;
};
let g: Gesture | null = null;

function pointOf(e: TouchEvent): Point | null {
  const t = e.touches[0] ?? e.changedTouches[0];
  return t ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
}

/** The panel let go: back under its classes, and moved there by them. */
function release(aside: HTMLElement | null): void {
  if (!aside) return;
  aside.style.removeProperty("transform");
  aside.style.removeProperty("transition");
  aside.style.removeProperty("box-shadow");
}

/** The swipe's end: the panel opens or closes through the bar's toggles,
 *  or goes back where it was. */
function finish(gesture: Gesture, commit: boolean): void {
  release(gesture.aside);
  const intent = gesture.intent;
  if (!commit || intent === "wait" || intent === "none") return;
  const open = openNow();
  if (intent === "open-left" && open !== "left") toggleSide();
  else if (intent === "close-left" && open === "left") toggleSide();
  else if (intent === "open-right" && open !== "right") toggleRight();
  else if (intent === "close-right" && open === "right") toggleRight();
  else return;
  // Opened: as after a tap on the bar's button, the on-screen keyboard of a
  // field typed in goes down and leaves the panel whole.
  if (intent.startsWith("open")) {
    const at = document.activeElement;
    if (at instanceof HTMLElement && typesText(at)) at.blur();
  }
}

function onStart(e: TouchEvent): void {
  if (g) {
    // A second finger: no swipe (and a touch whose end was never heard is
    // let go).
    const was = g;
    g = null;
    finish(was, false);
    if (e.touches.length !== 1) return;
  }
  if (e.touches.length !== 1 || !narrow.matches || !settings.phoneSwipe) return;
  const p = pointOf(e);
  if (!p) return;
  g = {
    start: { ...p, viewport: window.innerWidth, open: openNow(), canLeft: canOpenLeft(), canRight: true },
    target: e.target,
    intent: "wait",
    samples: [p],
    aside: null,
    width: 0,
    follow: false,
    done: false,
  };
}

function onMove(e: TouchEvent): void {
  const gesture = g;
  if (!gesture) return;
  if (e.touches.length !== 1) {
    g = null;
    finish(gesture, false);
    return;
  }
  if (gesture.done) {
    if (e.cancelable) e.preventDefault();
    return;
  }
  const p = pointOf(e);
  if (!p) return;
  gesture.samples.push(p);
  if (gesture.samples.length > 12) gesture.samples.shift();
  if (gesture.intent === "wait") {
    const far = Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) >= SLOP_PX;
    const intent = classify(gesture.start, p, far ? blocksAt(gesture.target) : {});
    if (intent === "wait") return;
    // Not a swipe, or the browser already scrolls with it: the touch is
    // the page's and the browser's for the rest of it.
    if (intent === "none" || !e.cancelable) {
      g = null;
      return;
    }
    gesture.intent = intent;
    const aside = document.querySelector<HTMLElement>(intent.endsWith("left") ? "aside.side" : "aside.right");
    if (!aside) {
      g = null;
      return;
    }
    gesture.aside = aside;
    gesture.width = aside.getBoundingClientRect().width || 300;
    gesture.follow = !reduced?.matches && !(intent.endsWith("right") && rightIsSheet());
    if (gesture.follow) {
      aside.style.transition = "none";
      aside.style.boxShadow = "0 0 48px oklch(0% 0 0 / .28)";
    }
  }
  e.preventDefault();
  const dx = p.x - gesture.start.x;
  if (gesture.follow && gesture.aside) {
    gesture.aside.style.transform = `translateX(${followX(gesture.intent, dx, gesture.width)}px)`;
  } else if (progress(gesture.intent, dx) >= gesture.width * COMMIT_FRACTION) {
    // Not following: once far enough the panel goes, without waiting for the lift.
    gesture.done = true;
    finish(gesture, true);
  }
}

function onEnd(e: TouchEvent): void {
  const gesture = g;
  if (!gesture || e.touches.length > 0) return;
  g = null;
  if (gesture.done || gesture.intent === "wait" || gesture.intent === "none") return;
  const p = pointOf(e);
  if (p) gesture.samples.push(p);
  const last = gesture.samples[gesture.samples.length - 1] ?? gesture.start;
  finish(gesture, settles(gesture.intent, last.x - gesture.start.x, speedX(gesture.samples), gesture.width));
}

function onCancel(): void {
  const gesture = g;
  g = null;
  if (gesture) finish(gesture, false);
}

/** Once, at start. */
export function installSwipe(): void {
  addEventListener("touchstart", onStart, { capture: true, passive: true });
  addEventListener("touchmove", onMove, { capture: true, passive: false });
  addEventListener("touchend", onEnd, { capture: true, passive: true });
  addEventListener("touchcancel", onCancel, { capture: true, passive: true });
}
