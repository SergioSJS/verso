// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The desktop window's zoom (ADR 0072, revised 2026-10-20): Cmd/Ctrl + - 0
// and Ctrl with the wheel (a trackpad's pinch comes as one) zoom the whole
// window by the webview's own zoom, 50 % to 200 %. Kept per device, on
// this machine's layer and never with the account's settings (it depends on
// the screen), and restored at start-up and in every new window. In a
// browser nothing here runs: the browser zooms, and Verso does not take
// its keys. The text size setting (settings.fontSize) is another thing and
// stays as it is.

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ui } from "./dom";
import { pt, t } from "./strings";
import { clampZoom, parseZoom, selfZooming, stepZoom, wheelSteps, zoomPercent } from "./zoomCore";

const KEY = "verso.zoom";

const words = t === pt
  ? { status: (p: number) => `Zoom ${p} %`, zoomIn: "Aumentar zoom", zoomOut: "Diminuir zoom", zoomReset: "Zoom real (100%)" }
  : { status: (p: number) => `Zoom ${p} %`, zoomIn: "Zoom in", zoomOut: "Zoom out", zoomReset: "Actual size" };
export const zoomLabels = { in: words.zoomIn, out: words.zoomOut, reset: words.zoomReset };

/** The desktop host, or the harness playing it (`?zoom=host`). */
export function hasHostZoom(): boolean {
  return isTauri() || new URLSearchParams(location.search).get("zoom") === "host";
}

let current = 1;
try {
  current = parseZoom(localStorage.getItem(KEY));
} catch {
  // A storage that refuses: 100 % and nothing kept.
}

export function currentZoom(): number {
  return current;
}

async function apply(z: number): Promise<void> {
  try {
    await getCurrentWebview().setZoom(z);
  } catch (e) {
    console.error("zoom:", e);
  }
}

/** Zoom to `z` (clamped), keep it, say it. */
export function setZoom(z: number, say = true): void {
  if (!hasHostZoom()) return;
  const next = clampZoom(z);
  const changed = next !== current;
  current = next;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    // Not kept; it still applies to this window.
  }
  void apply(next);
  if (say && changed) ui.status.textContent = words.status(zoomPercent(next));
}

export const zoomIn = (): void => setZoom(stepZoom(current, 1));
export const zoomOut = (): void => setZoom(stepZoom(current, -1));
export const zoomReset = (): void => setZoom(1);

/** At start-up: the zoom kept for this device, and the wheel. */
export function initZoom(): void {
  if (!hasHostZoom()) return;
  if (current !== 1) void apply(current);
  let acc = 0;
  let last = 0;
  window.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey || e.defaultPrevented) return;
      // A view that zooms itself keeps the event.
      if (selfZooming(e.target)) return;
      e.preventDefault();
      // A pause between gestures starts the count again.
      if (e.timeStamp - last > 400) acc = 0;
      last = e.timeStamp;
      const r = wheelSteps(acc, e.deltaY);
      acc = r.acc;
      if (r.steps === 1) zoomIn();
      else if (r.steps === -1) zoomOut();
    },
    { passive: false },
  );
}
