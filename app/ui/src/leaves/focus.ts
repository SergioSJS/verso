// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.



/** What takes the focus in the reading view, in document order. */
export const PREVIEW_FOCUSABLE = "a[href], a[tabindex], [role=link][tabindex], button, input, summary, [role=button][tabindex], [tabindex='0']";
/** Embedded notes and PDFs come in after a redraw, so nothing in them is
 *  counted when the focus is found again. */
export const EMBEDDED = ".embed, .embed-note, .embed-pdf";
/** What the note itself draws that takes the focus, in document order. */
export function ownFocusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(PREVIEW_FOCUSABLE)].filter((e) => !e.parentElement?.closest(EMBEDDED) && !e.matches(EMBEDDED));
}
/** A focused element of the reading view as a redraw can find it again: a
 *  task by its line, a link by its target and rank among the links to it,
 *  anything else by its rank among what the note draws. */
export function focusKey(root: HTMLElement, el: HTMLElement): string | null {
  const line = el.getAttribute("data-task-line");
  if (line !== null) return `task\u0000${line}`;
  const own = ownFocusable(root);
  const target = el.getAttribute("data-target");
  if (target !== null) return `target\u0000${target}\u0000${own.filter((e) => e.getAttribute("data-target") === target).indexOf(el)}`;
  const at = own.indexOf(el);
  return at < 0 ? null : `at\u0000${at}`;
}
export function byFocusKey(root: HTMLElement, key: string): HTMLElement | null {
  const [kind, a = "", b = ""] = key.split("\u0000");
  if (kind === "task") return root.querySelector<HTMLElement>(`[data-task-line="${CSS.escape(a)}"]`);
  const own = ownFocusable(root);
  if (kind === "target") return own.filter((e) => e.getAttribute("data-target") === a)[Number(b)] ?? null;
  return own[Number(a)] ?? null;
}
