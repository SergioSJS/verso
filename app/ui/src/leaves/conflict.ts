// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { diffNode } from "../diff";
import { button, h, ui } from "../dom";
import { t } from "../strings";

/* What a refused write leaves above the text (invariant 11): the disk's
 * version against the editor's, and the ways out — the disk's, mine over
 * it, and, where the leaf offers it, both: the disk's under the name and
 * mine in a copy beside it. Until one is chosen nothing else writes this
 * file — not the autosave, not ⌘S. */
export type Disk = { text: string; revision: string };
export class ConflictBanner {
  readonly el = h("div", "conflict");
  private readonly diff = h("div");
  private readonly pending: string;
  /** The version on screen, the one "write mine over it" may replace. */
  disk: Disk | null = null;
  constructor(onReload: () => void, onOverwrite: () => void, onKeepBoth?: () => void) {
    const reload = button("ghost", t.reload);
    reload.addEventListener("click", onReload);
    const overwrite = button("ghost danger", t.overwrite);
    overwrite.addEventListener("click", onOverwrite);
    const actions = h("div", "conflict-actions");
    actions.append(reload, overwrite);
    if (onKeepBoth) {
      const both = button("ghost", t.keepBoth);
      both.addEventListener("click", onKeepBoth);
      actions.append(both);
    }
    this.pending = onKeepBoth ? t.conflictPendingBoth : t.conflictPending;
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
    ui.status.textContent = this.pending;
  }
  hide(): void {
    this.disk = null;
    this.diff.replaceChildren();
    this.el.hidden = true;
  }
}
