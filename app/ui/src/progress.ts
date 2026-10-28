// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type IndexProgress } from "./bindings";
import { ui } from "./dom";
import { t } from "./strings";
import { SLOW_WALK_MS, newWalk, restorable, walkIsSlow } from "./quietStatus";

export let indexProgressTimer: number | null = null;
/** What the status bar said before a walk's progress took it, and the
 *  progress line last written: once the walk is done, a bar still showing
 *  that line goes back to what it said — "37/37 (100%)" stayed there for
 *  good after a change made outside, or the example imported. */
let before: string | null = null;
let ours = "";
function say(text: string): void {
  if (before === null) before = restorable(ui.status.textContent ?? "");
  ours = text;
  ui.status.textContent = text;
}
/** Whether the walk's progress carries its count: a window on a share
 *  gets none (the server leaves `current` and `total` out). */
function counted(p: IndexProgress): boolean {
  const v = p as { current?: unknown; total?: unknown };
  return typeof v.current === "number" && typeof v.total === "number";
}
/** When the walk now running began, and the latest progress it reported:
 *  a walk is a show only once it is slow (a save indexes one note, many
 *  times an hour, and that is not worth a glowing line). */
let walkStart: number | null = null;
let latest: IndexProgress | null = null;
let slowTimer: number | null = null;
let shown = false;
let lastEvent: number | null = null;
export function handleIndexProgress(p: IndexProgress): void {
  if (p.phase === "done") {
    if (slowTimer !== null) clearTimeout(slowTimer);
    slowTimer = null;
    walkStart = null;
    latest = null;
    lastEvent = null;
    if (!shown) return;
    shown = false;
    paint(p);
    return;
  }
  const now = Date.now();
  if (newWalk(lastEvent, now)) {
    // The last walk ended without a `done` (an error, a folder closed): this
    // one starts fresh, quiet again.
    if (slowTimer !== null) clearTimeout(slowTimer);
    slowTimer = null;
    walkStart = now;
    shown = false;
  }
  lastEvent = now;
  if (walkStart === null) walkStart = now;
  latest = p;
  if (!shown && !walkIsSlow(walkStart, now)) {
    // Events can be sparse (one slow file): look again when it has earned it.
    if (slowTimer === null) {
      slowTimer = window.setTimeout(() => {
        slowTimer = null;
        if (walkStart !== null && latest) { shown = true; paint(latest); }
      }, SLOW_WALK_MS - (now - walkStart));
    }
    return;
  }
  shown = true;
  paint(p);
}
function paint(p: IndexProgress): void {
  if (indexProgressTimer) {
    clearTimeout(indexProgressTimer);
    indexProgressTimer = null;
  }

  ui.topProgress.hidden = false;
  ui.topProgress.style.opacity = "1";
  ui.indexProgress.hidden = false;

  if (p.phase === "scanning") {
    ui.topProgressFill.classList.add("indeterminate");
    ui.topProgressFill.style.width = "35%";
    ui.indexProgressBar.classList.add("indeterminate");
    ui.indexProgressBar.style.width = "40%";
    ui.indexProgressLabel.textContent = t.scanningVault;
    say(t.scanningVault);
  } else if (p.phase === "indexing" && !counted(p)) {
    // A share's receiver is not told how far the owner's whole folder is
    // (ADR 0081 item 11): the walk runs without a number.
    ui.topProgressFill.classList.add("indeterminate");
    ui.topProgressFill.style.width = "35%";
    ui.indexProgressBar.classList.add("indeterminate");
    ui.indexProgressBar.style.width = "40%";
    const fName = p.file ? p.file.split("/").pop() ?? p.file : "";
    const msg = t.indexingUncounted(fName);
    ui.indexProgressLabel.textContent = msg;
    say(msg);
  } else if (p.phase === "indexing") {
    ui.topProgressFill.classList.remove("indeterminate");
    ui.indexProgressBar.classList.remove("indeterminate");
    const pct = p.total > 0 ? Math.min(100, Math.round((p.current / p.total) * 100)) : 0;
    ui.topProgressFill.style.width = `${pct}%`;
    ui.indexProgressBar.style.width = `${pct}%`;
    const fName = p.file ? p.file.split("/").pop() ?? p.file : "";
    const msg = t.indexingNotes(p.current, p.total, pct, fName);
    ui.indexProgressLabel.textContent = msg;
    say(msg);
  } else if (p.phase === "done") {
    ui.topProgressFill.classList.remove("indeterminate");
    ui.indexProgressBar.classList.remove("indeterminate");
    ui.topProgressFill.style.width = "100%";
    ui.indexProgressBar.style.width = "100%";
    ui.indexProgressLabel.textContent = t.indexingDone;
    if (before !== null && ui.status.textContent === ours) ui.status.textContent = before;
    before = null;
    ours = "";
    indexProgressTimer = window.setTimeout(() => {
      ui.topProgress.style.opacity = "0";
      window.setTimeout(() => {
        ui.topProgress.hidden = true;
        ui.topProgressFill.style.width = "0%";
        ui.indexProgressBar.style.width = "0%";
        ui.indexProgress.hidden = true;
      }, 350);
    }, 600);
  }
}
