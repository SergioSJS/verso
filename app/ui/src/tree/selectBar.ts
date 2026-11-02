// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The bar of the tree's selection mode (ADR 0076 item 8), as the Files app
// of iOS has it: how many rows are chosen and what acts on all of them —
// move, bin, copy their paths — and "Done". It stands at the foot of the
// side panel while the mode lasts.

import { may } from "../access";
import { button, h, ui } from "../dom";
import { deleteEntries, movePrompt } from "../files";
import { st } from "../screen/strings";
import { t } from "../strings";
import { leaveSelectMode, onSelection, selectedPaths, selectMode } from "./selection";

const bar = h("div", "select-bar");
const count = h("span", "select-count");
const move = button("ghost select-action select-write", `${t.moveTo}…`);
const copy = button("ghost select-action", t.selection.copyPaths);
const bin = button("ghost select-action select-write", t.deleteEntry);
const done = button("select-done", st.selectDone);

function paint(): void {
  const on = selectMode();
  bar.hidden = !on;
  if (!on) return;
  const n = selectedPaths().length;
  count.textContent = t.selection.count(n);
  for (const b of [move, copy, bin]) b.disabled = n === 0;
  // Moving is an editor's outside a table; the bin only the folder's owner's
  // (ADR 0113 section B, amended 2026-10-31).
  move.hidden = !may("", "move");
  bin.hidden = !may("", "delete");
}

export function installSelectBar(): void {
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", st.selectionBar);
  count.setAttribute("aria-live", "polite");
  move.addEventListener("click", () => movePrompt(selectedPaths()));
  copy.addEventListener("click", () => void navigator.clipboard.writeText(selectedPaths().join("\n")).then(() => (ui.status.textContent = t.copied)));
  // The mode stays while the question is open, and after a "no".
  bin.addEventListener("click", () => void deleteEntries(selectedPaths()).then(() => selectedPaths().length === 0 && leaveSelectMode()));
  done.addEventListener("click", () => leaveSelectMode());
  bar.append(count, move, copy, bin, done);
  bar.hidden = true;
  document.querySelector(".side")?.append(bar);
  onSelection(paint);
}
