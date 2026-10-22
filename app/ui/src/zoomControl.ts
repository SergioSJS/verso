// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings › Appearance › Window zoom: − the level + and "Reset (100%)".
// The same steps as the keys (zoom.ts); each one is a button, the level is
// text a screen reader reads with the group's name.

import { h } from "./dom";
import { icon } from "./icons";
import { currentZoom, onZoom, zoomIn, zoomOut, zoomReset, zoomWords } from "./zoom";
import { ZOOM_MAX, ZOOM_MIN, zoomPercent } from "./zoomCore";

export function zoomControl(): HTMLElement {
  const wrap = h("span", "zoom-control");
  const box = h("span", "ls-steps settings-steps");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", zoomWords.title);
  const step = (label: string, glyph: "plus" | "minus", run: () => void): HTMLButtonElement => {
    const b = h("button", "btn ls-step");
    b.append(icon(glyph));
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", run);
    return b;
  };
  const less = step(zoomWords.out, "minus", zoomOut);
  const more = step(zoomWords.in, "plus", zoomIn);
  const level = h("span", "zoom-level");
  level.id = "zoom-level";
  const reset = h("button", "btn ghost zoom-reset", zoomWords.resetBtn);
  reset.type = "button";
  reset.addEventListener("click", zoomReset);
  const paint = (z: number): void => {
    level.textContent = zoomWords.level(zoomPercent(z));
    less.disabled = z <= ZOOM_MIN;
    more.disabled = z >= ZOOM_MAX;
    reset.disabled = z === 1;
  };
  paint(currentZoom());
  box.append(less, level, more);
  wrap.append(box, reset);
  // Follows the keys and the wheel while the row is on screen.
  const off = onZoom((z) => {
    if (!wrap.isConnected) { off(); return; }
    paint(z);
  });
  return wrap;
}
