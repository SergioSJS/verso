// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { hotkeyRecorder } from "./settings";

/* ---------- Dialogs: named, modal, Tab kept inside, focus given back ---------- */
export const focusBefore = new WeakMap<HTMLElement, Element | null>();
/** `el` as a modal dialog named `label` (or by the element `labelledBy`):
 *  Tab and Shift-Tab cycle inside it, Escape closes it. */
export function asDialog(el: HTMLElement, label: string, close: () => void, labelledBy?: string): void {
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  if (labelledBy) el.setAttribute("aria-labelledby", labelledBy);
  else el.setAttribute("aria-label", label);
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
/** A dialog opens: where the focus was, to give it back. */
export function opened(el: HTMLElement): void {
  if (!focusBefore.has(el)) focusBefore.set(el, document.activeElement);
}
/** A dialog closes: the focus goes back where it was, when that is still
 *  there (`restore` false when the dialog opened something else). */
export function closed(el: HTMLElement, restore = true): void {
  const back = focusBefore.get(el);
  focusBefore.delete(el);
  if (restore && back instanceof HTMLElement && back.isConnected) back.focus();
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
