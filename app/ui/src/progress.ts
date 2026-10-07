// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type IndexProgress } from "./bindings";
import { ui } from "./dom";
import { t } from "./strings";

export let indexProgressTimer: number | null = null;
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
    ui.status.textContent = t.scanningVault;
  } else if (p.phase === "indexing") {
    ui.topProgressFill.classList.remove("indeterminate");
    ui.indexProgressBar.classList.remove("indeterminate");
    const pct = p.total > 0 ? Math.min(100, Math.round((p.current / p.total) * 100)) : 0;
    ui.topProgressFill.style.width = `${pct}%`;
    ui.indexProgressBar.style.width = `${pct}%`;
    const fName = p.file ? p.file.split("/").pop() ?? p.file : "";
    const msg = t.indexingNotes(p.current, p.total, pct, fName);
    ui.indexProgressLabel.textContent = msg;
    ui.status.textContent = msg;
  } else if (p.phase === "done") {
    ui.topProgressFill.classList.remove("indeterminate");
    ui.indexProgressBar.classList.remove("indeterminate");
    ui.topProgressFill.style.width = "100%";
    ui.indexProgressBar.style.width = "100%";
    ui.indexProgressLabel.textContent = t.indexingDone;
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
