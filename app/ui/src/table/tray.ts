// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's dice tray (ADR 0107, "The tray made compact", 2026-10-23): ONE
// row under the message field, as Foundry VTT's Dice Tray module has it
// (github.com/mclemente/fvtt-dice-tray, MIT): small icon-only dice, a number
// field for the modifier, KH / KL, a bookmark for the saved rolls and a dice
// button that sends. The roll is written INTO the message field as `/r 2d6+1d4+3`
// and the field is the source of truth (composer.ts): a click on a die edits
// that line, typing in the field changes the badges, a formula the row cannot
// show ("4d6kh3") is left as typed. Sending is the field's: the same road as
// Enter (compose.ts), the local table's and the server's.
//
// A die: left click or Enter adds one; right click, Shift+Enter, Delete or
// Backspace, or a long press on touch, takes one off.

import { icon } from "../icons";
import { addDieToNotation, adjustModifier, COMPOSER_DICE, dieKind, dieKindLabel, EMPTY_COMPOSER, fromNotation, keepOf, MAX_COMPOSER_MODIFIER, parseRollLine, removeDieFromNotation, toggleKeep, toNotation, withFormula, type ComposerState, type DieKind, type Keep } from "./composer";
import { keyboardInset, onViewport } from "../screen/viewport";
import { h } from "../dom";
import { showMenu } from "../menu";
import { openRoller } from "../dice/roller";
import { tableSource } from "./record";
import { isServerTable, type TableSource } from "./model";
import { ts } from "./trayStrings";
import { dieIcon } from "./dieIcon";
import { SavedRolls } from "./savedPanel";

/** What the row needs of the message field. */
export interface TrayHost {
  readonly input: HTMLTextAreaElement;
  /** Send what is in the field, as Enter does. */
  submit(): Promise<void>;
  /** Say a refusal in the field's error line (null clears it). */
  showError(text: string | null): void;
}

/** The dice in the row, and the ones behind "more" (Foundry keeps d100 in a drawer too). */
const MAIN: readonly DieKind[] = [4, 6, 8, 10, 12, 20];
const OTHER: readonly DieKind[] = COMPOSER_DICE.filter((k) => !MAIN.includes(k));
const LONG_PRESS_MS = 500;

const ROW_KEY = "verso.table.diceRow";
/** Whether the dice row is shown on a phone: closed until this device opened it. */
function readRowOpen(): boolean {
  try {
    return localStorage.getItem(ROW_KEY) === "1";
  } catch {
    return false;
  }
}

type Slot = { kind: DieKind; button: HTMLButtonElement; count: HTMLElement };

export class Tray {
  readonly el = h("div", "tray-wrap");
  private readonly row = h("div", "tray-row");
  private readonly scroll = h("div", "tray-scroll");
  private readonly mod = h("input", "tray-mod");
  private readonly kh = h("button", "tray-keep");
  private readonly kl = h("button", "tray-keep");
  private readonly moreButton = h("button", "tray-tool tray-more-button");
  private readonly moreDot = h("span", "tray-dot");
  private readonly mode = h("button", "tray-mode");
  private readonly modeLabel = h("span", "tray-mode-label");
  private modeIcon: SVGSVGElement | null = null;
  private readonly extras = h("div", "tray-extras");
  private readonly observer: ResizeObserver | null;
  /** The controls the row could not hold, now in the dots: "keep" (KH, KL) first, then "mod". */
  private moved: { keep: boolean; mod: boolean } = { keep: false, mod: false };
  /** The composer's own tools, for the toolbar of its box: the saved rolls and who sees the roll. */
  readonly tools: HTMLElement[];
  private readonly toggle = h("button", "tray-tool tray-toggle");
  private readonly savedButton = h("button", "tray-tool tray-saved-button");
  private readonly moreBox = h("div", "tray-pop tray-more");
  private readonly savedBox = h("div", "tray-pop tray-saved");
  private readonly saved: SavedRolls;
  private readonly slots: Slot[] = [];
  /** The modifier chosen while the field holds no dice: it joins the first die added. */
  private pendingMod = 0;
  private secret = false;
  private longAt = 0;
  private own = false;

  constructor(private readonly host: TrayHost) {
    this.row.setAttribute("role", "group");
    this.row.setAttribute("aria-label", ts.row);
    for (const kind of MAIN) this.scroll.append(this.dieButton(kind));

    this.moreButton.type = "button";
    this.moreButton.title = ts.more;
    this.moreButton.setAttribute("aria-label", ts.more);
    this.moreButton.setAttribute("aria-expanded", "false");
    this.moreDot.hidden = true;
    this.moreDot.setAttribute("aria-hidden", "true");
    this.moreButton.append(icon("more", ""), this.moreDot);
    this.moreButton.addEventListener("click", () => this.togglePop(this.moreBox));
    this.moreBox.setAttribute("role", "group");
    this.moreBox.setAttribute("aria-label", ts.moreDice);
    for (const kind of OTHER) this.moreBox.append(this.dieButton(kind));
    this.moreBox.hidden = true;

    this.mod.type = "number";
    this.mod.min = String(-MAX_COMPOSER_MODIFIER);
    this.mod.max = String(MAX_COMPOSER_MODIFIER);
    this.mod.step = "1";
    this.mod.value = "0";
    this.mod.setAttribute("aria-label", ts.modLabel);
    this.mod.title = ts.modLabel;
    this.mod.setAttribute("inputmode", "numeric");
    this.mod.addEventListener("input", () => {
      if (this.mod.value.trim() === "" || !Number.isFinite(Number(this.mod.value))) return;
      this.setModifier(Math.trunc(Number(this.mod.value)));
    });
    this.mod.addEventListener("change", () => this.paint());
    this.mod.addEventListener("blur", () => this.paint());
    this.mod.addEventListener("focus", () => this.mod.select());
    // As Foundry's number field: the wheel steps it (only while it has the focus, so a scroll of the row is not taken).
    this.mod.addEventListener(
      "wheel",
      (e) => {
        if (document.activeElement !== this.mod) return;
        e.preventDefault();
        this.setModifier(this.modifier() + (e.deltaY < 0 ? 1 : -1));
      },
      { passive: false },
    );
    this.mod.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void this.host.submit();
      }
    });

    this.keepButton(this.kh, "kh", ts.keepHigh, ts.keepHighDesc, "KH");
    this.keepButton(this.kl, "kl", ts.keepLow, ts.keepLowDesc, "KL");

    // Foundry's roll-mode selector: who sees the roll (Verso has two modes: public and secret). A small button that opens the
    // app's own menu with the two modes (a native select draws differently in every webview).
    this.mode.type = "button";
    this.mode.title = ts.modeLabel;
    this.mode.setAttribute("aria-haspopup", "menu");
    this.mode.append(this.modeLabel);
    this.mode.addEventListener("click", () => this.openModeMenu());
    this.mode.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.openModeMenu();
      }
    });
    this.savedButton.type = "button";
    this.savedButton.title = ts.savedButton;
    this.savedButton.setAttribute("aria-label", ts.savedButton);
    this.savedButton.setAttribute("aria-expanded", "false");
    this.savedButton.append(icon("bookmark", ""));
    this.savedButton.addEventListener("click", () => this.togglePop(this.savedBox));
    this.saved = new SavedRolls(
      (notation) => {
        this.write(withFormula("", notation));
        this.closePops();
        this.host.input.focus();
      },
      () => this.formula(),
      (text) => this.host.showError(text),
    );
    this.savedBox.setAttribute("role", "group");
    this.savedBox.setAttribute("aria-label", ts.savedHeading);
    this.savedBox.append(this.saved.el);
    this.savedBox.hidden = true;

    this.moreBox.append(this.extras);
    // The roller's dialog (it was left only in the command palette): one more item of the drawer.
    const roller = h("button", "tray-tool tray-roller", ts.openRoller);
    roller.type = "button";
    roller.addEventListener("click", () => {
      this.closePops();
      openRoller();
    });
    this.moreBox.append(roller);
    this.scroll.append(this.moreButton, this.mod, this.kh, this.kl);
    // A phone: the dice row is behind this button (css/table.css), its state kept on this device.
    this.toggle.type = "button";
    this.toggle.title = ts.diceRow;
    this.toggle.setAttribute("aria-label", ts.diceRow);
    this.toggle.append(icon("dice", ""));
    this.toggle.addEventListener("click", () => this.setRowOpen(this.el.classList.contains("collapsed")));
    this.setRowOpen(readRowOpen());
    this.tools = [this.savedButton, this.mode, this.toggle];
    this.row.append(this.scroll);
    this.el.append(this.row, this.moreBox, this.savedBox);

    this.host.input.addEventListener("input", () => {
      // Emptying the field (or sending, which empties it) clears the modifier too; the row's own edits keep it.
      if (!this.own && this.host.input.value.trim() === "") this.pendingMod = 0;
      this.paint();
    });
    this.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.anyOpen()) {
        e.stopPropagation();
        const opener = !this.savedBox.hidden ? this.savedButton : this.moreButton;
        this.closePops();
        opener.focus();
      }
    });
    // WebKit does not focus a button a click lands on, so the key may arrive on the page and not in the tray.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || !this.anyOpen() || this.el.contains(e.target as Node)) return;
      const opener = !this.savedBox.hidden ? this.savedButton : this.moreButton;
      this.closePops();
      opener.focus();
    });
    document.addEventListener("pointerdown", (e) => {
      if (this.anyOpen() && e.target instanceof Node && !this.el.contains(e.target)) this.closePops();
    });
    this.observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.fit()) : null;
    this.observer?.observe(this.scroll);
    this.paint();
    // A phone: the sheet rises above the keyboard while a field of the row has it (the message field's own does the same).
    const follow = (): void => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement && this.el.contains(a)) document.body.style.setProperty("--table-kb", `${keyboardInset()}px`);
      else if (!(a instanceof HTMLTextAreaElement)) document.body.style.removeProperty("--table-kb");
    };
    this.el.addEventListener("focusin", follow);
    this.el.addEventListener("focusout", () => setTimeout(follow));
    onViewport(follow);
  }

  // The buttons

  private dieButton(kind: DieKind): HTMLButtonElement {
    const label = dieKindLabel(kind);
    const b = h("button", "tray-die");
    b.type = "button";
    b.title = ts.addHint(label);
    b.setAttribute("aria-label", ts.add(label));
    b.setAttribute("aria-keyshortcuts", "Delete Shift+Enter");
    const shape = dieIcon(kind, "tray-die-icon");
    if (shape) b.append(shape);
    else b.append(h("span", "tray-die-text", label));
    const count = h("span", "tray-count");
    count.setAttribute("aria-hidden", "true");
    count.hidden = true;
    b.append(count);
    // Left click and Enter add one.
    b.addEventListener("click", () => {
      if (Date.now() - this.longAt < 700) return; // the click that ends a long press
      this.addDie(kind);
    });
    // Right click takes one off, as Foundry's.
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (Date.now() - this.longAt < 700) return; // the long press already took one
      this.removeDie(kind);
    });
    b.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" && e.shiftKey) || e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this.removeDie(kind);
      }
    });
    // Touch: a long press takes one off.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    b.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      stop();
      timer = setTimeout(() => {
        timer = null;
        this.longAt = Date.now();
        this.removeDie(kind);
      }, LONG_PRESS_MS);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, stop);
    this.slots.push({ kind, button: b, count });
    return b;
  }

  private keepButton(b: HTMLButtonElement, which: Keep, name: string, desc: string, text: string): void {
    b.type = "button";
    b.textContent = text;
    b.title = desc;
    b.setAttribute("aria-label", name);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      const base = this.state();
      if (!base || base.terms.length === 0) return;
      this.write(withFormula(this.host.input.value, toNotation(toggleKeep(base, which))));
    });
  }

  // The field is the source of truth

  /** The formula on the field's roll line ("" when there is none). */
  private formula(): string {
    return parseRollLine(this.host.input.value)?.formula ?? "";
  }

  /** The state the row shows: the roll line's, or null when it holds what the row cannot show. */
  private state(): ComposerState | null {
    const line = parseRollLine(this.host.input.value);
    if (!line) return this.host.input.value.trim() === "" ? { ...EMPTY_COMPOSER } : null;
    return fromNotation(line.formula);
  }

  private modifier(): number {
    const s = this.state();
    return s && s.terms.length > 0 ? s.modifier : this.pendingMod;
  }

  private write(value: string): void {
    this.host.input.value = value;
    // The field's own listeners (its height, its counter, the error line) hear it too.
    this.own = true;
    try {
      this.host.input.dispatchEvent(new Event("input"));
    } finally {
      this.own = false;
    }
  }

  private addDie(kind: DieKind): void {
    const value = this.host.input.value;
    const line = parseRollLine(value);
    // A plain message in the field is not touched (as Foundry's tray does not).
    if (!line && value.trim() !== "") return;
    const formula = line?.formula ?? "";
    if (formula === "") {
      const first = fromNotation(addDieToNotation("", kind)) ?? EMPTY_COMPOSER;
      this.write(withFormula(value, toNotation(adjustModifier(first, this.pendingMod))));
      return;
    }
    this.write(withFormula(value, addDieToNotation(formula, kind)));
  }

  private removeDie(kind: DieKind): void {
    const line = parseRollLine(this.host.input.value);
    if (!line || line.formula === "") return;
    const state = fromNotation(line.formula);
    // The last die goes: its modifier stays in the number field for the next one.
    if (state && state.terms.length === 1 && state.terms[0]!.count === 1 && dieKind(state.terms[0]!) === kind) this.pendingMod = state.modifier;
    this.write(withFormula(this.host.input.value, removeDieFromNotation(line.formula, kind)));
  }

  private setModifier(target: number): void {
    const clamped = Math.max(-MAX_COMPOSER_MODIFIER, Math.min(MAX_COMPOSER_MODIFIER, target));
    const base = this.state();
    if (base && base.terms.length > 0) {
      this.write(withFormula(this.host.input.value, toNotation(adjustModifier(base, clamped - base.modifier))));
    } else {
      this.pendingMod = clamped;
      this.paint();
    }
  }

  // The pop-overs

  private anyOpen(): boolean {
    return !this.moreBox.hidden || !this.savedBox.hidden;
  }

  private closePops(): void {
    this.moreBox.hidden = true;
    this.savedBox.hidden = true;
    this.moreButton.setAttribute("aria-expanded", "false");
    this.savedButton.setAttribute("aria-expanded", "false");
  }

  private togglePop(box: HTMLElement): void {
    const open = box.hidden;
    this.closePops();
    if (!open) return;
    box.hidden = false;
    (box === this.moreBox ? this.moreButton : this.savedButton).setAttribute("aria-expanded", "true");
    if (box === this.savedBox) this.saved.sync();
    box.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
  }

  /** The menu of the two modes, hanging from the button (the app's own menu: arrows, Enter, Escape). */
  private openModeMenu(): void {
    const choose = (secret: boolean) => (): void => {
      const t = tableSource();
      if (isServerTable(t)) t.secret = secret;
      this.mode.focus();
    };
    const box = this.mode.getBoundingClientRect();
    showMenu(
      box.left,
      box.bottom,
      [
        [this.secret ? ts.modePublic : `${ts.modePublic} ✓`, choose(false), "unlock"],
        [this.secret ? `${ts.modeSecret} ✓` : ts.modeSecret, choose(true), "lock"],
      ],
      ts.modeLabel,
    );
  }

  private setRowOpen(open: boolean): void {
    this.el.classList.toggle("collapsed", !open);
    this.toggle.setAttribute("aria-expanded", String(open));
    try {
      localStorage.setItem(ROW_KEY, open ? "1" : "0");
    } catch {
      /* no storage: the state is for this session */
    }
  }

  /** The secret toggle as it stands, for a server's table; the local one has none. */
  sync(src: TableSource): void {
    this.secret = isServerTable(src) && src.secret;
    this.mode.hidden = !isServerTable(src);
    this.modeIcon?.remove();
    this.modeIcon = icon(this.secret ? "lock" : "unlock", "");
    this.modeIcon.classList.add("tray-mode-icon");
    this.mode.prepend(this.modeIcon);
    const word = this.secret ? ts.modeSecret : ts.modePublic;
    this.modeLabel.textContent = word;
    this.mode.setAttribute("aria-label", `${ts.modeLabel}: ${word}`);
    this.mode.classList.toggle("secret", this.secret);
    this.saved.sync();
    this.paint();
  }

  /** The row holds what fits, in a fixed order of what goes first into the dots: the other dice (always there),
   *  then KH / KL, then the modifier. Nothing is clipped and nothing scrolls. */
  private fit(): void {
    const room = this.scroll.clientWidth;
    if (room === 0) return;
    const active = document.activeElement;
    // Everything in the row, measured; then out, in order, until it fits.
    this.place(false, false);
    let state = { keep: false, mod: false };
    if (this.scroll.scrollWidth > room) {
      state = { keep: true, mod: false };
      this.place(true, false);
      if (this.scroll.scrollWidth > room) {
        state = { keep: true, mod: true };
        this.place(true, true);
      }
    }
    this.moved = state;
    if (active instanceof HTMLElement && document.activeElement !== active && this.el.contains(active)) active.focus({ preventScroll: true });
    this.paint();
  }

  private place(keep: boolean, mod: boolean): void {
    const [row, out] = [this.scroll, this.extras];
    (mod ? out : row).append(this.mod);
    (keep ? out : row).append(this.kh, this.kl);
  }

  private paint(): void {
    const state = this.state();
    const base = state ?? EMPTY_COMPOSER;
    let other = 0;
    for (const s of this.slots) {
      const term = base.terms.find((t) => dieKind(t) === s.kind);
      s.button.classList.toggle("active", Boolean(term));
      s.count.hidden = !term;
      s.count.textContent = term ? String(term.count) : "";
      if (term && OTHER.includes(s.kind)) other += 1;
    }
    // The dots carry a dot while something in them is in force: another die, or a KH / KL or modifier the row had no room for.
    const hiddenInForce = (this.moved.keep && keepOf(base) !== null) || (this.moved.mod && base.modifier !== 0);
    this.moreDot.hidden = other === 0 && !hiddenInForce;
    if (document.activeElement !== this.mod) this.mod.value = String(base.terms.length > 0 ? base.modifier : this.pendingMod);
    const keep = keepOf(base);
    this.kh.setAttribute("aria-pressed", String(keep === "kh"));
    this.kl.setAttribute("aria-pressed", String(keep === "kl"));
    this.saved.paintSave();
  }
}
