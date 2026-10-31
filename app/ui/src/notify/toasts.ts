// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The toasts (ADR 0084 item 3): bottom right, above the status bar — at
// the bottom on a phone, above its bar and the keyboard (item 6, T.6) — at
// most three, the newest on top.
// Information and success leave after 6 s; a warning or an error stays
// until it is closed or its state changes. A pointer over a toast or the
// keyboard in it pauses its clock. A toast never takes the focus: it is
// said through a live region, polite for information and warnings,
// assertive for errors, and Escape closes the toast that has the focus.
// The toasts sit above the overlays (the settings, the palette) and are
// never made inert by them (dialogs/a11y.ts).

import { h } from "../dom";
import { icon } from "../icons";
import type { ActionRef, Entry, Level } from "./core";
import { notifyStrings } from "./strings";

/** How long information and success stay, in milliseconds. */
export const BRIEF_MS = 6000;
const MAX_SHOWN = 3;

/** The level's mark: never the colour alone (item 11). */
export const LEVEL_ICON: Record<Level, string> = { info: "info", success: "check", warning: "warn", error: "alert" };

type Shown = { el: HTMLElement; key: string; timer: number; left: number; since: number; paused: boolean };

let region: HTMLElement | null = null;
/** Where ambient news sits: at the top, never over the table's chat and its
 *  box, nor the line being typed at the bottom of the window. */
let top: HTMLElement | null = null;
let polite: HTMLElement | null = null;
let assertive: HTMLElement | null = null;
const shown: Shown[] = [];
/** Where the focus was before it entered a toast: given back when Escape
 *  closes it. */
let focusBefore: Element | null = null;

function build(): HTMLElement {
  if (region) return region;
  const s = notifyStrings();
  region = h("section", "notify-toasts");
  region.id = "notify-toasts";
  region.setAttribute("aria-label", s.region);
  // The sentences said once, from two regions that are always on the page
  // (a region added with its text is not read by every screen reader).
  // Live regions without a role: an empty `alert` or `status` always on
  // the page would stand beside the window's own as a second one.
  polite = h("div", "sr-only");
  polite.setAttribute("aria-live", "polite");
  polite.setAttribute("aria-atomic", "true");
  polite.id = "notify-polite";
  assertive = h("div", "sr-only");
  assertive.setAttribute("aria-live", "assertive");
  assertive.setAttribute("aria-atomic", "true");
  assertive.id = "notify-assertive";
  top = h("section", "notify-toasts notify-toasts-top");
  top.id = "notify-toasts-top";
  top.setAttribute("aria-label", s.regionTop);
  for (const r of [region, top]) {
    r.addEventListener("focusin", (e) => {
      const from = e.relatedTarget;
      if (from instanceof Element && !region!.contains(from) && !top!.contains(from)) focusBefore = from;
    });
  }
  document.body.append(region, top, polite, assertive);
  return region;
}

/** Say `text` to a screen reader: assertive for an error. */
function announce(level: Level, text: string): void {
  build();
  const live = level === "error" ? assertive! : polite!;
  // Emptied first: the same words twice are said twice.
  live.textContent = "";
  window.setTimeout(() => (live.textContent = text), 50);
}

function stopClock(x: Shown): void {
  if (x.paused || x.left === Infinity) return;
  window.clearTimeout(x.timer);
  x.left -= Date.now() - x.since;
  x.paused = true;
}

function startClock(x: Shown): void {
  if (x.left === Infinity) return;
  x.paused = false;
  x.since = Date.now();
  window.clearTimeout(x.timer);
  x.timer = window.setTimeout(() => close(x), Math.max(0, x.left));
}

/** A toast closed. One that had the focus gives it back where it was
 *  before it came into the toasts — or to the next toast — never to the
 *  page's start. */
function close(x: Shown): void {
  const at = shown.indexOf(x);
  if (at < 0) return;
  shown.splice(at, 1);
  window.clearTimeout(x.timer);
  const had = x.el.contains(document.activeElement);
  x.el.remove();
  if (!had) return;
  const next = shown[0]?.el.querySelector<HTMLElement>("button");
  if (focusBefore instanceof HTMLElement && focusBefore.isConnected) focusBefore.focus();
  else next?.focus();
  focusBefore = null;
}

/** The toast of `key`, if one is shown: closed (its state changed back). */
export function dismissKey(key: string): void {
  for (const x of [...shown]) if (x.key === key) close(x);
}

/** Every toast closed. */
export function dismissAll(): void {
  for (const x of [...shown]) close(x);
}

/** A notification's toast. `run` does what an action names. */
export function showToast(entry: Pick<Entry, "key" | "level" | "title" | "sentence" | "actions"> & { kind?: string }, run: (a: ActionRef) => void): HTMLElement {
  const s = notifyStrings();
  // Ambient news at the top on a desktop; on a phone (ADR 0084 T.6) every
  // toast is at the bottom, above the keyboard's bar.
  const box = entry.kind === "presence" && !matchMedia("(max-width: 760px)").matches ? (build(), top!) : build();
  dismissKey(entry.key);
  const el = h("article", "notify-toast");
  el.dataset["level"] = entry.level;
  if (entry.kind) el.dataset["kind"] = entry.kind;
  const id = `notify-toast-${Math.random().toString(36).slice(2, 9)}`;
  el.setAttribute("aria-labelledby", `${id}-title`);
  el.setAttribute("aria-describedby", `${id}-sentence`);
  const head = h("div", "notify-toast-head");
  const level = h("span", "notify-level");
  level.append(icon(LEVEL_ICON[entry.level]), h("span", "", s.levels[entry.level]));
  const shut = h("button", "ghost iconic notify-toast-close");
  shut.type = "button";
  shut.setAttribute("aria-label", s.closeToast(entry.title));
  shut.title = s.close;
  shut.append(icon("close"));
  head.append(level, shut);
  const title = h("p", "notify-toast-title", entry.title);
  title.id = `${id}-title`;
  const sentence = h("p", "notify-toast-sentence", entry.sentence);
  sentence.id = `${id}-sentence`;
  el.append(head, title, sentence);
  const x: Shown = { el, key: entry.key, timer: 0, left: entry.level === "info" || entry.level === "success" ? BRIEF_MS : Infinity, since: Date.now(), paused: false };
  if (entry.actions.length > 0) {
    const row = h("div", "notify-actions");
    for (const a of entry.actions) {
      const b = h("button", "notify-action", a.label);
      b.type = "button";
      b.addEventListener("click", () => {
        close(x);
        run(a);
      });
      row.append(b);
    }
    el.append(row);
  }
  shut.addEventListener("click", () => close(x));
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    close(x);
  });
  el.addEventListener("mouseenter", () => stopClock(x));
  el.addEventListener("mouseleave", () => {
    if (!el.contains(document.activeElement)) startClock(x);
  });
  el.addEventListener("focusin", () => stopClock(x));
  el.addEventListener("focusout", (e) => {
    if (!(e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) && !el.matches(":hover")) startClock(x);
  });
  box.prepend(el);
  shown.unshift(x);
  while (shown.length > MAX_SHOWN) close(shown[shown.length - 1]!);
  startClock(x);
  announce(entry.level, `${s.levels[entry.level]}: ${entry.title}. ${entry.sentence}`);
  return el;
}
