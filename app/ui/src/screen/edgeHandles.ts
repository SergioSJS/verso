// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- The side panels' handles over a canvas, on a phone (2026-11-15) ----------
 * On a board, a drawing, the graph, the data graph or a base's map one
 * finger pans or draws, so the sideways swipe for the side panels
 * (swipe.ts) never starts there; and a board that draws puts its tools in
 * the bottom bar's place, with its Files and Panel (the maintainer: "se não
 * funciona, deveria ter esses botões de atalho ali no board"). While such a
 * view is in front, two slim tabs sit on the screen's edges, centred: the
 * left one opens the files, the right one the right panel — the bottom
 * bar's own toggles, so Back, the tap outside and the buttons' state work
 * as they do. Each is a narrow mark with a finger's target (44 × 64 px);
 * a swipe that starts on one, past Android's Back band, drags its panel
 * out as anywhere else (they are not in swipe.ts's list of views that keep
 * the finger). Hidden while a panel is open, off a phone, and where the
 * bottom bar's Files could not open (a file opened without its folder). */

import { narrow, toggleRight, toggleSide } from "../chrome";
import { h } from "../dom";
import { icon } from "../icons";
import { st } from "./strings";

/** The views where one finger pans or draws (swipe.ts's NO_SWIPE, less its
 *  opt-out attribute and MapLibre's inner box). */
const CANVAS = ".board-host, .drawing-host, .graph-stage, .dg-stage, .base-map";

function handle(side: "left" | "right", label: string, run: () => void): HTMLButtonElement {
  const b = h("button", `edge-handle edge-${side}`);
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.setAttribute("aria-expanded", "false");
  b.append(icon(side === "left" ? "chevronRight" : "chevronLeft"));
  b.addEventListener("click", run);
  return b;
}

/** Whether a view of `CANVAS` is on screen in a pane now. */
export function canvasInFront(root: ParentNode = document): boolean {
  for (const el of root.querySelectorAll<HTMLElement>(`.pane .leaf:not([hidden]) :is(${CANVAS})`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
  }
  return false;
}

/** Once, at start (screen/frame.ts). */
export function installEdgeHandles(): void {
  const left = handle("left", st.edgeFiles, () => toggleSide());
  const right = handle("right", st.edgePanel, () => toggleRight());
  document.body.append(left, right);
  const root = document.documentElement;
  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const on = narrow.matches && canvasInFront();
    if (root.classList.contains("canvas-in-front") !== on) root.classList.toggle("canvas-in-front", on);
    const body = document.body.classList;
    left.setAttribute("aria-expanded", String(body.contains("side-open")));
    right.setAttribute("aria-expanded", String(body.contains("right-open")));
    // As the bottom bar's Files: not for a file opened without its folder.
    const files = document.querySelector<HTMLButtonElement>(".bottom-bar .bar-files");
    left.hidden = root.classList.contains("loose") || Boolean(files?.disabled);
  };
  const later = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const work = document.querySelector("main.work") ?? document.body;
  new MutationObserver(later).observe(work, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class"] });
  new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  narrow.addEventListener("change", later);
  addEventListener("resize", later);
  paint();
}
