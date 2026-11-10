// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- The focus a field gets when what holds it opens ----------
 * On a keyboard (a desktop, a laptop) the field of a dialog that opens takes
 * the focus: the words typed go there at once. On a touch screen a field
 * focused by the page brings up the on-screen keyboard over half the
 * screen, which the person did not ask for — Settings, the switcher, the
 * folder just opened did it on the maintainer's phone, in the app and in the
 * browser (2026-11-08). There the field waits for the person's own tap; a
 * button or a list still takes the focus, which brings up no keyboard. */

/** A finger, not a mouse: the screen is touched and nothing hovers. */
const touch = typeof matchMedia === "function" ? matchMedia("(hover: none) and (pointer: coarse)") : null;

/** Whether `el` brings up the on-screen keyboard when focused. */
export function typesText(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) {
    const noKeys = ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"];
    return !el.readOnly && !noKeys.includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Focus `el` because what holds it has just opened (not because the person
 *  tapped it). A field that types text is left alone on a touch screen,
 *  the dialog that holds it focused instead (no dialog: a field focused
 *  before lets its keyboard go); `select` selects the field's words where
 *  it does focus.
 *  Whether the focus was given. */
export function focusOnOpen(el: HTMLElement | null | undefined, opts: { select?: boolean; preventScroll?: boolean } = {}): boolean {
  if (!el) return false;
  if (touch?.matches && typesText(el)) {
    // The dialog itself takes the focus, which brings up no keyboard: a
    // keyboard's Escape and Tab (a tablet's) still reach it, and the field
    // under it lets its keyboard go.
    const holder = el.closest<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog, .quick');
    if (holder) {
      if (!holder.hasAttribute("tabindex")) holder.tabIndex = -1;
      holder.focus({ preventScroll: true });
    } else {
      const at = document.activeElement;
      if (at instanceof HTMLElement && at !== el && typesText(at)) at.blur();
    }
    return false;
  }
  el.focus({ preventScroll: opts.preventScroll ?? false });
  if (opts.select && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.select();
  return true;
}
