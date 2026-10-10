// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type IndexProgress } from "./bindings";
import { ui } from "./dom";
import { t } from "./strings";

export let indexProgressTimer: number | null = null;
/** What the status bar said before a walk's progress took it, and the
 *  progress line last written: once the walk is done, a bar still showing
 *  that line goes back to what it said — "37/37 (100%)" stayed there for
 *  good after a change made outside, or the example imported. */
let before: string | null = null;
let ours = "";
function say(text: string): void {
  if (before === null) before = ui.status.textContent ?? "";
  ours = text;
  ui.status.textContent = text;
}
export function handleIndexProgress(p: IndexProgress): void {
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
