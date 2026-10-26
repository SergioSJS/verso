// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Access withdrawn, live (ADR 0113, the maintainer's visibility rule): a
// player's window must not keep what the veil no longer lists. After the
// folder is listed again, every open tab whose file is no longer there for
// this person is torn down and says, neutrally, that it is no longer shared;
// the file leaves the recent files, the closed tabs and every pane's
// back/forward trail, the hover card on it closes, and the open notes that
// embed it are drawn again. Only for a player of a table: elsewhere a file
// gone from the list is a file deleted, and its tab keeps the text
// (`markGone`).

import { folderAccessNow } from "./can";
import { allEntries } from "./folder";
import { ui } from "./dom";
import { closedTabs, recents } from "./history";
import type { Leaf } from "./leaves/leaf";
import { NoteLeaf } from "./leaves/note";
import { layout, spaces } from "./layout/spaces";
import { panel, quick } from "./main";
import { preview } from "./preview/install";
import { t } from "./strings";

/** Tear down the tabs of what the person no longer sees. Run after
 *  `listAll` has filled `allEntries`. */
export function dropUnshared(): void {
  const access = folderAccessNow();
  if (!access?.table || access.seat === "master" || allEntries.size === 0) return;
  const leaves = spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves));
  const gone = new Set<string>();
  for (const leaf of leaves) {
    if (leaf.unshared || leaf.path === "" || leaf.kind === "folder" || leaf.kind === "graph") continue;
    if (!allEntries.has(leaf.path)) gone.add(leaf.path);
  }
  teardown(leaves, gone);
}

/** A read of `path` failed for a player in a way that veils it (leaf.ts): its
 *  tab is already neutral; the rest of the window lets go of the name too. */
addEventListener("verso:veiled", (e) => {
  const path = (e as CustomEvent<string>).detail;
  if (!path) return;
  teardown(spaces.flatMap((sp) => sp.layout.panes().flatMap((p) => p.leaves)), new Set([path]));
});

function teardown(leaves: Leaf[], gone: Set<string>): void {
  if (gone.size === 0) return;
  const names = new Set([...gone].map((p) => p.split("/").pop() ?? p));
  for (const leaf of leaves) if (gone.has(leaf.path)) leaf.unshare();
  const out = (p: string): boolean => gone.has(p);
  for (const list of [closedTabs, recents]) list.splice(0, list.length, ...list.filter((p) => !out(p)));
  for (const sp of spaces) for (const p of sp.layout.panes()) p.trailRemoved(out);
  preview.close(false);
  // What the window drew of the front tab (outline, history button) and the
  // switcher's last list: drawn again from what is left.
  const front = layout().activeLeaf;
  panel.show(front && !front.unshared ? front : null);
  quick.forget();
  // Notes that embed or show it draw again (and what is cached of it goes).
  for (const leaf of leaves) if (leaf instanceof NoteLeaf && !leaf.unshared) leaf.relinkNow(names);
  ui.status.textContent = t.unsharedStatus;
  dispatchEvent(new Event("verso:unshared"));
}
