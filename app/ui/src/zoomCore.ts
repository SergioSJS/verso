// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's zoom, the part that is only arithmetic and routing (ADR
// 0072, revised 2026-10-20): 50 % to 200 % in steps of 10 %, and which
// views zoom themselves. The webview and the keys are in zoom.ts.

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;

/** A zoom within bounds, on the 10 % grid (no 1.2000000000000002). */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
}

/** The next step up (`dir` 1) or down (-1) of the 10 % grid: from 105 %
 *  up is 110 %, down is 100 %. */
export function stepZoom(z: number, dir: 1 | -1): number {
  const tenths = Math.round(clampZoom(z) * 100) / 10;
  const next = dir === 1 ? Math.floor(tenths + 1e-9) + 1 : Math.ceil(tenths - 1e-9) - 1;
  return clampZoom(next / 10);
}

/** What was kept, read back: anything that is not a number is 100 %. */
export function parseZoom(raw: string | null): number {
  if (raw === null) return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? clampZoom(n) : 1;
}

/** "Zoom 120 %". */
export function zoomPercent(z: number): number {
  return Math.round(z * 100);
}

/** The views that zoom themselves with Ctrl and the wheel or a pinch: the
 *  board (Excalidraw), the maps (maplibre), the PDF viewer and the graph.
 *  Over one of them the event is the view's, as it was before the window
 *  zoomed. */
export const SELF_ZOOMING = ".board-host, .board-mount, .maplibregl-map, .base-map, .pdf, .graph-stage, svg.graph, .dg-stage";

export function selfZooming(target: EventTarget | null): boolean {
  const el = target as { closest?: (s: string) => unknown } | null;
  return typeof el?.closest === "function" && Boolean(el.closest(SELF_ZOOMING));
}

/** The step a wheel event asks for: Ctrl with the wheel (a pinch comes as
 *  one) accumulates until a notch is worth a step; the sign is up when
 *  the wheel goes away from the hand (deltaY < 0). Returns the new
 *  accumulator and the steps to take. */
export function wheelSteps(acc: number, deltaY: number): { acc: number; steps: -1 | 0 | 1 } {
  const total = acc + deltaY;
  const THRESHOLD = 30;
  if (total <= -THRESHOLD) return { acc: 0, steps: 1 };
  if (total >= THRESHOLD) return { acc: 0, steps: -1 };
  return { acc: total, steps: 0 };
}
