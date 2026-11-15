// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- The phone's one top bar (2026-11-14) ----------
 * On a phone the row of tabs, the row of the note's folder and modes and
 * the bar of verbs at the bottom took a third of the screen from the text
 * (the maintainer: "a área útil muito pequena"). One row stays at the top:
 * the note's name over its folder, one button that turns Reading into Edit
 * and back, and the open tabs behind their count at the right end, where a
 * thumb reaches. Both the count and the
 * name open the sheet (phoneSheet.ts) with the tabs, the folder, the three
 * modes and the verbs. Drawn only on a phone (`css/phonehead.css`). */

import { h } from "../dom";
import { folderName } from "../folder";
import { icon } from "../icons";
import type { Pane } from "../layout/pane";
import { NoteLeaf } from "../leaves/note";
import { folderLine, openSheet } from "./phoneSheet";
import { st } from "./strings";

export class PhoneHead {
  readonly el = h("div", "phone-head");
  /** The tabs' count: at the row's right end, under the thumb (the
   *  maintainer, 2026-11-15) — the pane puts it after its ⋯. */
  readonly count = h("button", "phone-tabs");
  private readonly countN = h("span", "phone-tabs-n");
  private readonly title = h("button", "phone-title");
  private readonly name = h("span", "phone-title-name");
  private readonly where = h("span", "phone-title-path");
  private readonly mode = h("button", "phone-mode");
  /** The note whose mode buttons are watched, and the mode drawn. */
  private watched: NoteLeaf | null = null;
  private drawn = "";
  private readonly modeWatch = new MutationObserver(() => this.paint());

  constructor(private readonly pane: Pane) {
    for (const b of [this.count, this.title, this.mode]) b.type = "button";
    this.count.setAttribute("aria-haspopup", "dialog");
    this.title.setAttribute("aria-haspopup", "dialog");
    this.count.append(this.countN);
    this.title.append(this.name, this.where);
    this.count.addEventListener("click", () => openSheet(pane, this.count));
    this.title.addEventListener("click", () => openSheet(pane, this.title));
    this.mode.addEventListener("click", () => this.toggleMode());
    this.el.append(this.title, this.mode);
    // A tab opened, closed, renamed or brought to the front.
    new MutationObserver(() => this.paint()).observe(pane.tabList, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-selected", "title"] });
    // A folder opened: its name, while no tab is open.
    addEventListener("verso:folder-shown", this.repaint);
    this.paint();
  }
  private readonly repaint = (): void => this.paint();
  /** The pane left the layout. */
  dispose(): void {
    removeEventListener("verso:folder-shown", this.repaint);
    this.modeWatch.disconnect();
  }

  /** What the bar says now. A text is replaced only when it changes:
   *  WebKit drops the click whose text was replaced under the finger. */
  paint(): void {
    const n = String(this.pane.leaves.length);
    if (this.countN.textContent !== n) this.countN.textContent = n;
    const tabs = st.openTabs(this.pane.leaves.length);
    this.count.setAttribute("aria-label", tabs);
    this.count.title = tabs;
    const leaf = this.pane.active;
    // No tab: the folder's name, over nothing.
    const name = leaf ? leaf.tabName.textContent ?? "" : folderName;
    if (this.name.textContent !== name) this.name.textContent = name;
    const where = folderLine(leaf?.path ?? "");
    if (this.where.textContent !== where) this.where.textContent = where;
    this.where.hidden = where === "";
    this.title.setAttribute("aria-label", st.headTitle(name));
    const note = leaf instanceof NoteLeaf ? leaf : null;
    if (note !== this.watched) {
      this.modeWatch.disconnect();
      if (note) this.modeWatch.observe(note.modes, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
      this.watched = note;
    }
    this.mode.hidden = note === null;
    if (!note) return;
    const reading = note.mode === "preview";
    const label = reading ? st.modeToEdit : st.modeToRead;
    this.mode.setAttribute("aria-label", label);
    this.mode.title = label;
    // The mark of the mode the note is in: the book while reading.
    const mark = note.mode === "preview" ? "reading" : note.mode === "live" ? "edit" : "source";
    if (this.drawn !== mark) {
      this.drawn = mark;
      this.mode.replaceChildren(icon(mark));
    }
  }

  /** Reading to Edit, and any editing mode back to Reading: through the
   *  note's own mode buttons, so a reader's guard and an open card's save
   *  hold here as they do there. */
  private toggleMode(): void {
    const note = this.pane.active;
    if (!(note instanceof NoteLeaf)) return;
    note.modeButtons[note.mode === "preview" ? "live" : "preview"].click();
    this.paint();
  }
}
