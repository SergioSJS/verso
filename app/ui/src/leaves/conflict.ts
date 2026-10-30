// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands, type ContractError } from "../bindings";
import { ls } from "../looseStrings";
import { conflictName } from "../dialogs/conflictNames";
import { diffNode } from "../diff";
import { button, h, ui } from "../dom";
import { fail } from "../errors";
import { LOCALE, t } from "../strings";

/** What the window does after a file is made here — the lists read again
 *  (`afterFileChange`, which `changes` hands over: that module imports the
 *  leaves, and a leaf importing it would load them in a cycle). */
let afterMade: () => Promise<void> = async () => {};
export function onFileMade(f: () => Promise<void>): void {
  afterMade = f;
}
export function fileMade(): Promise<void> {
  return afterMade();
}

/** What a create answers: the new file's path, or why not. */
type Created = { status: "ok"; data: string } | { status: "error"; error: ContractError };

/** "Keep both" (ADR 0079 item 8): this tab's text written beside `path`
 *  as a new file, named as sync names a conflict's copy — `create` makes
 *  it, never over anything — the next free name when the minute's is
 *  taken. The copy's path, or null when it could not be made (said). The
 *  note's tab, the text file's and the board's share it. */
export async function keepCopy(path: string, create: (name: string) => Promise<Created>): Promise<string | null> {
  const info = await commands.appInfo();
  const device = (info.status === "ok" && info.data.device) || t.thisComputer;
  const when = new Date();
  for (let n = 1; n <= 99; n++) {
    const r = await create(conflictName(path, device, when, LOCALE === "pt-BR", n));
    if (r.status === "ok") return r.data;
    if (r.error.kind !== "exists") {
      fail(r.error);
      return null;
    }
  }
  return null;
}

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

/* What a write refused because the file is gone leaves above the text:
 * deleted or moved outside Verso (by another program, or by sync from
 * another device) while this tab held text not saved yet. The text stays;
 * nothing writes — not the autosave, not ⌘S — until the person saves it
 * again at its name or closes the tab without it. */
export class GoneBanner {
  readonly el = h("div", "conflict gone-banner");
  private readonly said = h("p", "");
  up = false;
  private readonly copy: HTMLButtonElement | null;
  constructor(onSaveAgain: () => void, onClose: () => void, onSaveCopy?: () => void) {
    const again = button("ghost", t.saveAgain);
    again.addEventListener("click", onSaveAgain);
    const close = button("ghost danger", t.closeWithoutSaving);
    close.addEventListener("click", onClose);
    const actions = h("div", "conflict-actions");
    actions.append(again);
    // A file opened without its folder also offers the system's save
    // dialog (ADR 0114 item 11, "Save a copy…").
    this.copy = onSaveCopy ? button("ghost", ls.saveCopy) : null;
    if (this.copy) {
      this.copy.addEventListener("click", onSaveCopy ?? (() => {}));
      this.copy.hidden = true;
      actions.append(this.copy);
    }
    actions.append(close);
    this.el.append(this.said, actions);
    this.el.hidden = true;
  }
  show(sentence: string, withCopy = false): void {
    this.up = true;
    if (this.copy) this.copy.hidden = !withCopy;
    this.said.textContent = sentence;
    this.el.hidden = false;
    this.el.scrollIntoView({ block: "start" });
  }
  hide(): void {
    this.up = false;
    this.el.hidden = true;
  }
}
