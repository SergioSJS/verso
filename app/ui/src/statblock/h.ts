// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The two DOM helpers the card and the builder use, as `dom.ts` has them.
// Kept here because `dom.ts` looks up the window's own elements the moment
// it loads: a card has to build in a page (or a test) that has none.

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A button named `label`, by its text; `type="button"` so no form takes it. */
export function button(cls: string, label: string): HTMLButtonElement {
  const b = h("button", cls);
  b.type = "button";
  b.textContent = label;
  return b;
}
