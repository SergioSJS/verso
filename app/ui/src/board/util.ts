// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Api } from "./view";

export function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The whole board in view, as a canvas opens in Obsidian — never zoomed
 *  in past 100 %. */
export function fit(a: Api): void {
  const elements = a.getSceneElements();
  if (elements.length > 0) a.setViewport({ target: margined(elements), fit: "scale-down", animation: false });
}

/** The box of `elements` with a margin, so that they fill 90 % of the view
 *  that fits it — as Excalidraw 0.18's `viewportZoomFactor: 0.9` did. */
export function margined(elements: readonly ExcalidrawElement[]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of elements) {
    x0 = Math.min(x0, e.x);
    y0 = Math.min(y0, e.y);
    x1 = Math.max(x1, e.x + e.width);
    y1 = Math.max(y1, e.y + e.height);
  }
  const px = ((x1 - x0) * (1 / 0.9 - 1)) / 2;
  const py = ((y1 - y0) * (1 / 0.9 - 1)) / 2;
  return [x0 - px, y0 - py, x1 + px, y1 + py];
}
