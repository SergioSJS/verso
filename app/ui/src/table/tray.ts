// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's dice tray (ADR 0107, the dice composer, 2026-10-23): a click
// on a die adds it to a roll shown as notation; only "Rolar" rolls. The
// notation field is the source of truth (composer.ts): the buttons edit it,
// and a notation the buttons cannot show ("4d6kh3") is rolled as typed. The
// roll itself goes the way `/r` goes (compose.ts rollNotation). The tray is
// there for the local table and for a server's, and folds away behind its
// toggle on a phone, where it starts folded.

import { button, h } from "../dom";
import { icon } from "../icons";
import { readNotation } from "../dice/notation";
import { addDieToNotation, adjustModifier, clearComposer, COMPOSER_DICE, dieKind, dieKindLabel, EMPTY_COMPOSER, fromNotation, removeDieFromNotation, removeTerm, termNotation, toNotation, type ComposerState, type DieKind } from "./composer";
import { keyboardInset, onViewport } from "../screen/viewport";
import { isServerTable, type TableSource } from "./model";
import { ts } from "./trayStrings";
import { dieIcon } from "./dieIcon";

const KEPT = "verso.tableTray";

/** Whether the tray was left open (null: never chosen). Storage may be blocked: then the default. */
function remembered(): boolean | null {
  try {
    const v = localStorage.getItem(KEPT);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function remember(open: boolean): void {
  try {
    localStorage.setItem(KEPT, open ? "1" : "0");
  } catch {
    /* the choice is only a convenience */
  }
}

const phone = (): boolean => window.matchMedia("(max-width: 760px)").matches;

type Slot = { kind: DieKind; box: HTMLElement; add: HTMLButtonElement; take: HTMLButtonElement; count: HTMLElement };

export class Tray {
  readonly el = h("section", "table-tray");
  private readonly toggle = h("button", "ghost table-tray-toggle");
  private readonly body = h("div", "table-tray-body");
  private readonly pool = h("div", "pool-tray");
  private readonly grid = h("div", "composer-dice");
  private readonly mod = h("input", "composer-mod-input");
  private readonly clear = h("button", "ghost composer-clear");
  private readonly field = h("input", "notation-input");
  private readonly go = h("button", "save composer-go");
  private readonly secretNote = h("p", "table-tray-secret");
  private readonly error = h("p", "table-tray-error");
  private readonly slots: Slot[] = [];
  private notation = "";
  private busy = false;
  private open: boolean;

  /** `roll` sends a notation the way `/r` does; it answers the reason it was refused, or null. */
  constructor(private readonly roll: (notation: string) => Promise<string | null>) {
    this.open = remembered() ?? !phone();
    const bodyId = "table-tray-body";
    this.body.id = bodyId;
    this.toggle.type = "button";
    this.toggle.title = ts.toggleDesc;
    this.toggle.setAttribute("aria-controls", bodyId);
    this.toggle.append(icon("dice", ""), h("span", "table-tray-toggle-text", ts.toggle), icon("chevronDown", ""));
    this.toggle.addEventListener("click", () => this.setOpen(!this.open));

    this.pool.setAttribute("aria-label", ts.pool);
    this.pool.setAttribute("aria-live", "polite");
    this.grid.setAttribute("role", "group");
    this.grid.setAttribute("aria-label", ts.dice);
    for (const kind of COMPOSER_DICE) this.grid.append(this.slot(kind));

    this.mod.type = "number";
    this.mod.setAttribute("aria-label", ts.modLabel);
    this.mod.addEventListener("change", () => this.setModifier(Number(this.mod.value) || 0));
    this.mod.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.setModifier(Number(this.mod.value) || 0);
      }
    });
    const less = this.step("minus", ts.less, -1);
    const more = this.step("plus", ts.more, 1);
    const stepper = h("div", "stepper composer-stepper");
    stepper.append(less, this.mod, more);
    this.clear.type = "button";
    this.clear.append(icon("trash", ""), ts.clear);
    this.clear.addEventListener("click", () => this.set(toNotation(clearComposer())));
    const row = h("div", "composer-row");
    row.append(h("span", "composer-label", ts.mod), stepper, this.clear);

    this.field.type = "text";
    this.field.placeholder = ts.placeholder;
    this.field.setAttribute("aria-label", ts.notation);
    this.field.autocomplete = "off";
    this.field.spellcheck = false;
    this.field.setAttribute("autocapitalize", "off");
    this.field.setAttribute("enterkeyhint", "go");
    this.field.addEventListener("input", () => {
      this.notation = this.field.value;
      this.error.hidden = true;
      this.paint();
    });
    this.go.type = "submit";
    this.go.append(icon("dice", ""), h("span", "composer-go-text", ts.roll));
    const send = h("form", "composer-send");
    send.append(this.field, this.go);
    send.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submit();
    });

    this.secretNote.hidden = true;
    this.secretNote.textContent = ts.secretOn;
    this.error.hidden = true;
    this.error.setAttribute("role", "alert");
    this.body.append(this.pool, this.grid, row, send, this.secretNote, this.error);
    this.el.append(this.toggle, this.body);
    this.setOpen(this.open, false);
    this.paint();
    // A phone: the sheet rises above the keyboard while a field of the tray has it (as the message field's).
    const follow = (): void => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement && this.el.contains(a)) document.body.style.setProperty("--table-kb", `${keyboardInset()}px`);
      else if (!(a instanceof HTMLTextAreaElement)) document.body.style.removeProperty("--table-kb");
    };
    this.el.addEventListener("focusin", follow);
    this.el.addEventListener("focusout", () => setTimeout(follow));
    onViewport(follow);
  }

  private slot(kind: DieKind): HTMLElement {
    const label = dieKindLabel(kind);
    const box = h("div", "die-slot");
    const add = h("button", "die-button");
    add.type = "button";
    add.title = ts.add(label);
    add.setAttribute("aria-label", ts.add(label));
    const count = h("span", "die-button-count");
    count.setAttribute("aria-hidden", "true");
    const shape = dieIcon(kind, "die-icon");
    if (shape) add.append(shape);
    add.append(h("span", "die-button-label", label), count);
    add.addEventListener("click", () => this.set(addDieToNotation(this.notation, kind)));
    const take = h("button", "ghost iconic die-remove");
    take.type = "button";
    take.title = ts.takeOne(label);
    take.setAttribute("aria-label", ts.takeOne(label));
    take.append(icon("minus", ""));
    take.addEventListener("click", () => this.set(removeDieFromNotation(this.notation, kind)));
    box.append(add, take);
    this.slots.push({ kind, box, add, take, count });
    return box;
  }

  private step(name: string, label: string, delta: number): HTMLButtonElement {
    const b = button("stepper-button", label, name);
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => this.setModifier(this.state().modifier + delta));
    return b;
  }

  /** The state the buttons show: the notation's, or an empty pool when the buttons cannot show it. */
  private state(): ComposerState {
    return fromNotation(this.notation) ?? EMPTY_COMPOSER;
  }

  /** The modifier set to `target` (kept within the composer's bounds). */
  private setModifier(target: number): void {
    const base = this.state();
    this.set(toNotation(adjustModifier(base, target - base.modifier)));
  }

  private set(notation: string): void {
    this.notation = notation;
    this.field.value = notation;
    this.error.hidden = true;
    this.paint();
  }

  private setOpen(open: boolean, keep = true): void {
    this.open = open;
    this.body.hidden = !open;
    this.toggle.setAttribute("aria-expanded", String(open));
    this.toggle.classList.toggle("open", open);
    document.body.dataset["tableTray"] = open ? "open" : "closed";
    if (keep) remember(open);
  }

  /** The secret toggle as it stands, for a server's table; the local one has none. */
  sync(src: TableSource): void {
    const secret = isServerTable(src) && src.secret;
    this.secretNote.hidden = !secret;
    this.go.classList.toggle("secret", secret);
    const word = secret ? ts.rollSecret : ts.roll;
    this.go.title = word;
    this.go.setAttribute("aria-label", word);
  }

  private paint(): void {
    const state = fromNotation(this.notation);
    const base = state ?? EMPTY_COMPOSER;
    const empty = base.terms.length === 0 && base.modifier === 0;
    this.pool.replaceChildren();
    if (empty) this.pool.append(h("p", "pool-empty", ts.empty));
    else {
      for (const term of base.terms) {
        const kind = dieKind(term);
        const chip = h("span", "pool-chip");
        const shape = dieIcon(kind, "pool-chip-icon");
        if (shape) chip.append(shape);
        chip.append(termNotation(term), this.chipRemove(ts.takeAll(dieKindLabel(kind)), () => this.set(toNotation(removeTerm(base, kind)))));
        this.pool.append(chip);
      }
      if (base.modifier !== 0) {
        const chip = h("span", "pool-chip pool-chip-mod");
        chip.append(base.modifier > 0 ? `+${base.modifier}` : String(base.modifier), this.chipRemove(ts.zeroMod, () => this.set(toNotation({ ...base, modifier: 0 }))));
        this.pool.append(chip);
      }
    }
    for (const s of this.slots) {
      const term = base.terms.find((t) => dieKind(t) === s.kind);
      s.box.classList.toggle("active", Boolean(term));
      s.count.hidden = !term;
      s.count.textContent = term ? String(term.count) : "";
      s.take.hidden = !term;
    }
    this.mod.value = String(base.modifier);
    this.clear.disabled = empty && this.notation.trim() === "";
    this.go.disabled = this.busy || this.notation.trim() === "";
  }

  private chipRemove(label: string, run: () => void): HTMLButtonElement {
    const b = h("button", "ghost iconic pool-chip-remove");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(icon("close", ""));
    b.addEventListener("click", run);
    return b;
  }

  private async submit(): Promise<void> {
    const typed = this.notation.trim();
    if (typed === "" || this.busy) return;
    const notation = readNotation(typed);
    if (!notation) {
      this.error.textContent = ts.unread(typed);
      this.error.hidden = false;
      this.field.setAttribute("aria-invalid", "true");
      return;
    }
    this.field.removeAttribute("aria-invalid");
    this.busy = true;
    this.paint();
    try {
      const refused = await this.roll(notation);
      this.error.hidden = refused === null;
      if (refused !== null) this.error.textContent = refused;
    } finally {
      this.busy = false;
      this.paint();
    }
  }
}
