// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The small parts the Music tab and the Table's mini-player share: a named
// icon button, a named range, a refusal said where the person looks.

import { h, ui } from "../../dom";
import { icon } from "../../icons";

export function iconButton(cls: string, label: string, ic: string): HTMLButtonElement {
  const b = h("button", `ghost iconic ${cls}`);
  b.type = "button";
  b.append(icon(ic, ""));
  b.setAttribute("aria-label", label);
  b.title = label;
  return b;
}

/** An icon button's icon and name, changed in place (the focus stays on it). */
export function relabel(b: HTMLButtonElement, label: string, ic: string): void {
  if (b.dataset["icon"] !== ic) {
    b.replaceChildren(icon(ic, ""));
    b.dataset["icon"] = ic;
  }
  b.setAttribute("aria-label", label);
  b.title = label;
}

export function range(cls: string, label: string, max = 100): HTMLInputElement {
  const r = h("input", cls);
  r.type = "range";
  r.min = "0";
  r.max = String(max);
  r.step = "1";
  r.setAttribute("aria-label", label);
  r.title = label;
  return r;
}

/** Say a refusal where the person looks. */
export function said(e: string | null): void {
  if (e) ui.status.textContent = e;
}
