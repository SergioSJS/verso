// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { hotkeyRecorder } from "./settings";
import { focusOnOpen } from "../screen/openFocus";

/* ---------- Dialogs: named, modal, Tab kept inside, focus given back ---------- */
export const focusBefore = new WeakMap<HTMLElement, Element | null>();
/** `el` as a modal dialog named `label` (or by the element `labelledBy`):
 *  Tab and Shift-Tab cycle inside it, Escape closes it. */
export function asDialog(el: HTMLElement, label: string, close: () => void, labelledBy?: string): void {
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  if (labelledBy) el.setAttribute("aria-labelledby", labelledBy);
  else el.setAttribute("aria-label", label);
  // Safari does not focus a checkbox or a button when it is clicked, so the
  // focus can rest on the page's body with the dialog open: Escape then
  // never reaches the dialog. The top dialog takes it from the document.
  const fromBody = (e: KeyboardEvent) => {
    if (!el.isConnected) {
      document.removeEventListener("keydown", fromBody);
      return;
    }
    const at = document.activeElement;
    if (e.key === "Escape" && !e.defaultPrevented && !hotkeyRecorder && (!at || at === document.body) && el.getClientRects().length > 0 && isTop(el)) {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", fromBody);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && !hotkeyRecorder) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const all = Array.from(el.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, a[href], [tabindex]")).filter((x) => !x.hasAttribute("disabled") && x.tabIndex >= 0 && x.getClientRects().length > 0);
      const first = all[0];
      const last = all[all.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}
/* ---------- Overlays: the last opened is on top, and the only one alive ----------
 * The settings, the palette, the quick switcher, the bug report… are
 * layers of the page (`.quick`, one z-index for all), so the one later in
 * the page was on top whatever opened last: ⌘⇧P with the settings open
 * opened the palette behind them (the maintainer, 2026-10-14). Each
 * overlay that opens goes above every one open, and those under it are
 * `inert` — no click, no focus, nothing read by a screen reader — until it
 * closes: one modal dialog alive at a time, as `aria-modal` promises.
 * Not the top layer of `<dialog>.showModal()`: the palette and the switcher
 * are built on their own `.quick` layer, and a page of `<dialog>`s would
 * stack by the order of their `showModal` alone, with menus (z-index 20)
 * under any of them. Escape closes the top one only (`isTop`). */
const stack: HTMLElement[] = [];
const shownNow = (x: HTMLElement): boolean => x.isConnected && !x.hidden && x.getClientRects().length > 0;
/** The overlays open now, oldest first: one hidden or removed without
 *  `closed` leaves the list here. */
function openNow(): HTMLElement[] {
  for (let i = stack.length - 1; i >= 0; i--) {
    const x = stack[i]!;
    if (!x.isConnected || x.hidden) {
      x.inert = false;
      x.style.zIndex = "";
      stack.splice(i, 1);
    }
  }
  return stack;
}
/** Whether `el` is the overlay on top: the one Escape closes. */
export function isTop(el: HTMLElement): boolean {
  const open = openNow().filter(shownNow);
  return open.length === 0 || open[open.length - 1] === el;
}
/** The overlay on top now (none: null) — what a slow opening compares
 *  before and after it waits, to know the person has moved on. */
export function topOverlay(): HTMLElement | null {
  const open = openNow().filter(shownNow);
  return open[open.length - 1] ?? null;
}
/** A dialog opens: where the focus was, to give it back; above every
 *  overlay open, which goes inert under it. */
export function opened(el: HTMLElement): void {
  if (!focusBefore.has(el)) focusBefore.set(el, document.activeElement);
  const under = openNow().filter((x) => x !== el);
  stack.splice(0, stack.length, ...under, el);
  el.inert = false;
  el.style.zIndex = "";
  let top = 0;
  for (const x of under) top = Math.max(top, Number.parseInt(getComputedStyle(x).zIndex, 10) || 0);
  const own = Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
  if (under.length > 0 && own <= top) el.style.zIndex = String(top + 1);
  if (el.getAttribute("aria-modal") === "true") for (const x of under) x.inert = true;
  // What floats above the overlays hears of it (notify/toasts.ts).
  dispatchEvent(new CustomEvent("verso:overlay", { detail: true }));
}
/** A dialog closes: the overlay under it is alive again, and the focus
 *  goes back where it was, when that is still there (`restore` false when
 *  the dialog opened something else). */
export function closed(el: HTMLElement, restore = true): void {
  const at = stack.indexOf(el);
  if (at >= 0) stack.splice(at, 1);
  dispatchEvent(new CustomEvent("verso:overlay", { detail: false }));
  el.style.zIndex = "";
  const open = openNow();
  const below = open[open.length - 1];
  if (below) below.inert = false;
  const back = focusBefore.get(el);
  focusBefore.delete(el);
  // The focus leaves the closed dialog at once: a hidden field kept it in
  // Chromium until the next frame, and the next key (⌘P) went to the
  // field's own handler — with nothing to give it back to (the page's
  // body), it stayed there.
  const inside = document.activeElement;
  if (inside instanceof HTMLElement && el.contains(inside)) inside.blur();
  if (restore && back instanceof HTMLElement && back.isConnected) focusOnOpen(back, { preventScroll: true });
  // The focus stays in the dialog now on top: a click on a button gives it
  // no focus in WebKit, so where it was may be the page behind.
  if (restore && below && shownNow(below) && !below.contains(document.activeElement)) {
    focusOnOpen(below.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]:not([tabindex='-1'])"));
  }
}
/** A list whose highlighted option is announced: the field keeps the
 *  focus and points at the option (`aria-activedescendant`). */
export function asCombobox(input: HTMLInputElement, list: HTMLElement, id: string): void {
  list.id = id;
  list.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
}
/** One option of such a list: `on` when highlighted. */
export function option(li: HTMLElement, b: HTMLButtonElement, id: string, on: boolean, input: HTMLInputElement): void {
  li.setAttribute("role", "none");
  b.setAttribute("role", "option");
  b.id = id;
  b.tabIndex = -1;
  b.setAttribute("aria-selected", String(on));
  if (on) input.setAttribute("aria-activedescendant", id);
}
/* File › Close Tab (⌘W) comes from the host's menu, to the focused window:
 * the system's Close Window took ⌘W before the page saw it. The window
 * runs what ⌘W is bound to — "close tab" unless the user bound it to
 * another command. */
/** Whether a dialog of the window is on screen. */
export function dialogUp(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some((d) => !d.hidden && d.getClientRects().length > 0);
}
