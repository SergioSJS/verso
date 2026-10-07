// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { diffNode } from "../diff";
import { button, h, ui } from "../dom";
import { t } from "../strings";

/* What a refused write leaves above the text (invariant 11): the disk's
 * version against the editor's, and the two ways out. Until one is
 * chosen nothing else writes this file — not the autosave, not ⌘S. */
export type Disk = { text: string; revision: string };
export class ConflictBanner {
  readonly el = h("div", "conflict");
  private readonly diff = h("div");
  /** The version on screen, the one "write mine over it" may replace. */
  disk: Disk | null = null;
  constructor(onReload: () => void, onOverwrite: () => void) {
    const reload = button("ghost", t.reload);
    reload.addEventListener("click", onReload);
    const overwrite = button("ghost danger", t.overwrite);
    overwrite.addEventListener("click", onOverwrite);
    const actions = h("div", "conflict-actions");
    actions.append(reload, overwrite);
    this.el.append(h("p", "", t.conflict), this.diff, actions);
    this.el.hidden = true;
  }
  get up(): boolean {
    return this.disk !== null;
  }
  show(disk: Disk, mine: string): void {
    this.disk = disk;
    this.diff.replaceChildren(diffNode(disk.text, mine));
    this.el.hidden = false;
    this.el.scrollIntoView({ block: "start" });
    // Said as well as shown: the status line is announced, and a write
    // refused while typing went by in silence (nothing saves until a
    // choice is made above the text).
    ui.status.textContent = t.conflictPending;
  }
  hide(): void {
    this.disk = null;
    this.diff.replaceChildren();
    this.el.hidden = true;
  }
}
