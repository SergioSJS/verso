// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The tray's "Rolagens salvas" (ADR 0107, "saved rolls", 2026-10-23): the
// lines of one note that hold a dice code, as buttons. A click fills the
// composer's notation field (it does not roll); "Salvar" files the composed
// roll in the note under a typed name. The note is read through the contract
// (`readNote`, never rewritten by reading) and written the way "Add to note"
// writes: the room when the note is live, else the file over the revision
// that was read (invariant 11). Which note: the one the person chose for this
// folder (kept in this browser), else, for a player at a campaign table, the
// note granted to that player alone (their sheet).

import { afterFileChange, flushed, stopped } from "../changes";
import { commands } from "../bindings";
import { may } from "../access";
import { campaign } from "../campaign";
import { canWrite } from "../can";
import { readNotation } from "../dice/notation";
import { button, h, ui } from "../dom";
import { allNotes, currentFolder } from "../folder";
import { leavesOf, liveHolder } from "../layout/spaces";
import { quick } from "../main";
import { opening } from "../opening";
import { kindOf, name } from "../paths";
import { addRollLine, rollLine, savedRollsOf, type SavedRoll } from "./savedRolls";
import { roomSide } from "../collab";
import { writeLive } from "../roomWrites";
import { ts } from "./trayStrings";

const KEPT = "verso.savedRolls.note:";

function chosen(): string | null {
  try {
    return localStorage.getItem(KEPT + currentFolder) || null;
  } catch {
    return null;
  }
}

function choose(path: string): void {
  try {
    localStorage.setItem(KEPT + currentFolder, path);
  } catch {
    /* the choice is only a convenience */
  }
}

/** The note granted to this player alone, at a campaign table: their sheet. */
function sheet(): string | null {
  const c = campaign();
  if (c.viewer !== "player") return null;
  const mine = c.notes.filter((n) => n.grant.kind === "player" && /\.md$/i.test(n.path)).map((n) => n.path);
  return mine.sort((a, b) => a.localeCompare(b))[0] ?? null;
}

/** The note the rolls come from now, if there is one. */
export function savedSource(): string | null {
  const own = chosen();
  if (own && allNotes.includes(own)) return own;
  return sheet();
}

/** Whether this window may write `path`: a reader of a server may not, but
 *  a player may write the notes granted to it. */
function mayWrite(path: string): boolean {
  return may(path, "edit");
}

export class SavedRolls {
  readonly el = h("section", "saved-rolls");
  private readonly head = h("div", "saved-head");
  private readonly which = button("ghost saved-which", "");
  private readonly list = h("ul", "saved-list");
  private readonly empty = h("p", "saved-empty");
  private readonly form = h("form", "saved-save");
  private readonly nameField = h("input", "saved-name");
  private readonly saveButton = h("button", "save saved-save-go");
  private path: string | null = null;
  private rolls: SavedRoll[] = [];
  private loads = 0;

  /** `fill` puts a notation in the composer; `current` is what the composer
   *  holds; `fail` says a refusal in the tray's error line (null clears it). */
  constructor(
    private readonly fill: (notation: string) => void,
    private readonly current: () => string,
    private readonly fail: (text: string | null) => void,
  ) {
    this.el.setAttribute("role", "group");
    this.el.setAttribute("aria-label", ts.savedHeading);
    this.which.title = ts.savedChooseDesc;
    this.which.addEventListener("click", () => void this.pick());
    this.head.append(h("span", "composer-label", ts.savedHeading), this.which);
    this.list.setAttribute("aria-label", ts.savedHeading);
    this.nameField.type = "text";
    this.nameField.placeholder = ts.saveNamePlaceholder;
    this.nameField.setAttribute("aria-label", ts.saveName);
    this.nameField.autocomplete = "off";
    this.nameField.maxLength = 80;
    this.nameField.setAttribute("enterkeyhint", "done");
    this.nameField.addEventListener("input", () => this.paintSave());
    this.saveButton.type = "submit";
    this.saveButton.textContent = ts.save;
    this.form.append(this.nameField, this.saveButton);
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.save();
    });
    this.el.append(this.head, this.list, this.empty, this.form);
    addEventListener("verso:notes-changed", () => void this.refresh());
    addEventListener("verso:room-saved", (e) => {
      if ((e as CustomEvent<string>).detail === this.path) void this.refresh();
    });
    void this.refresh();
  }

  /** The table view drew again: the note may have changed (a grant, a folder). */
  sync(): void {
    if (savedSource() !== this.path) void this.refresh();
  }

  /** The composer's notation changed: whether "Salvar" can act. */
  paintSave(): void {
    const readable = readNotation(this.current().trim()) !== null;
    this.saveButton.disabled = !readable || this.nameField.value.trim() === "";
    this.saveButton.title = this.path ? ts.saveDesc(name(this.path)) : "";
  }

  async refresh(): Promise<void> {
    const load = ++this.loads;
    const path = savedSource();
    this.path = path;
    this.which.textContent = path ? ts.savedNote(name(path)) : ts.savedChoose;
    this.which.setAttribute("aria-label", path ? `${ts.savedNote(name(path))}. ${ts.savedChange}` : ts.savedChoose);
    this.form.hidden = !path || !mayWrite(path);
    let rolls: SavedRoll[] = [];
    let trouble: string | null = null;
    if (path) {
      const r = await opening.readNote(path, true);
      if (load !== this.loads) return;
      if (r.status === "ok") rolls = savedRollsOf(r.data.lines);
      else trouble = ts.savedUnreadable(name(path));
    }
    this.rolls = rolls;
    this.list.replaceChildren();
    for (const roll of rolls) {
      const li = h("li", "saved-item");
      const b = h("button", "saved-roll");
      b.type = "button";
      b.title = ts.savedPick(roll.name, roll.notation);
      b.setAttribute("aria-label", ts.savedPick(roll.name, roll.notation));
      b.append(h("span", "saved-roll-name", roll.name));
      if (roll.name !== roll.notation) b.append(h("span", "saved-roll-notation", roll.notation));
      b.addEventListener("click", () => this.fill(roll.notation));
      li.append(b);
      this.list.append(li);
    }
    this.list.hidden = rolls.length === 0;
    this.empty.hidden = rolls.length > 0 && trouble === null;
    this.empty.textContent = trouble ?? (path ? ts.savedEmpty(name(path)) : ts.savedNoSource);
    this.paintSave();
  }

  private async pick(): Promise<void> {
    const path = await quick.pick();
    if (!path) return;
    if (kindOf(path) !== "note") {
      this.fail(ts.savedNotANote);
      return;
    }
    this.fail(null);
    choose(path);
    await this.refresh();
  }

  private async save(): Promise<void> {
    const path = this.path;
    const notation = readNotation(this.current().trim());
    const label = this.nameField.value.trim();
    if (!path || label === "") return;
    if (!notation) return this.fail(ts.saveUnread);
    this.fail(null);
    const line = rollLine(label, notation);
    this.saveButton.disabled = true;
    try {
      const live = await writeLive(path, liveHolder(path), (was) => addRollLine(was, line), roomSide);
      if (live === "refused") return this.fail(ts.saveChanged);
      if (live === "disk") {
        // The note open in a tab: its text saved first, or nothing is written.
        const unsaved = await flushed(leavesOf(path));
        if (unsaved.length > 0) return stopped(unsaved);
        const existing = await opening.readNote(path);
        if (existing.status !== "ok") return this.fail(existing.error.message);
        const r = await commands.writeNote(path, addRollLine(existing.data.text, line), existing.data.revision);
        if (r.status !== "ok") return this.fail(r.error.kind === "changed" ? ts.saveChanged : r.error.message);
        await afterFileChange();
        for (const l of leavesOf(path)) if (!l.dirty) void l.load(path, true);
      }
      this.nameField.value = "";
      ui.status.textContent = ts.saved(label, name(path));
      await this.refresh();
    } finally {
      this.paintSave();
    }
  }
}
