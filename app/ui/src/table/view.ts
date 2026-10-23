// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's panel (ADR 0107 items 1, 5, 6, 10, 16): one log, newest at
// the bottom, scrolled to the end unless the person scrolled up; each line
// says who, when, where (the note as a link), what was rolled, the dice as
// small chips in the roller's colours, and the total. A list, with a
// polite live region that says what others roll, with their names.

import { button, h, ui } from "../dom";
import { openNote } from "../layout/spaces";
import { name } from "../paths";
import { quick } from "../main";
import type { DiceStyle } from "../dice3d/look";
import { addToNote, clock, saidOf, whoOf } from "./addToNote";
import type { TableEntry, TableSource } from "./model";
import { onSourceChange, tableOnScreen, tableSource } from "./record";
import { tt } from "./strings";

/** The colours of a die chip in a roller's style; none for the app's own. */
export function chipStyle(style: DiceStyle | undefined): string {
  if (!style || style.app) return "";
  return `background:${style.body};color:${style.number};border-color:${style.outline}`;
}

function chip(face: number, fudge: boolean, dropped: boolean, style: DiceStyle | undefined): HTMLElement {
  const text = fudge ? (face < 0 ? "−" : face > 0 ? "+" : "0") : String(face);
  const el = h("span", dropped ? "table-die dropped" : "table-die", text);
  const css = chipStyle(style);
  if (css) el.setAttribute("style", css);
  if (dropped) el.title = tt.dropped;
  return el;
}

/** The dice of an entry as chips, with the signs between the terms. */
function dice(e: TableEntry): HTMLElement {
  const box = h("span", "table-dice");
  const style = e.styles?.["1"];
  e.terms.forEach((t, i) => {
    if (i > 0) box.append(h("span", "table-op", t.sign < 0 ? "−" : "+"));
    for (const f of t.kept) box.append(chip(f, t.fudge, false, style));
    for (const f of t.dropped) box.append(chip(f, t.fudge, true, style));
  });
  if (e.modifier !== 0) box.append(h("span", "table-op", `${e.modifier < 0 ? "−" : "+"} ${Math.abs(e.modifier)}`));
  return box;
}

/** A table row's Markdown as plain words: `[[Lobos]]` is Lobos, `[[a|b]]` is b. */
export function plainRow(text: string): string {
  return text.replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target.replace(/#.*$/, "") ?? target);
}

class TableView {
  readonly el = h("div", "table-view");
  private readonly bar = h("div", "table-bar");
  private readonly note = h("p", "table-note");
  private readonly hiddenLine = h("p", "table-hidden");
  private readonly list = h("ul", "table-log");
  private readonly said = h("div", "sr-only table-said");
  private readonly toEnd = button("ghost table-to-end", tt.toEnd, "chevronDown");
  private stuck = true;
  private known = new Set<string>();
  private first = true;
  private off: (() => void) | null = null;
  private bound: TableSource | null = null;

  constructor() {
    this.list.setAttribute("aria-label", tt.log);
    this.said.setAttribute("role", "status");
    this.said.setAttribute("aria-live", "polite");
    this.toEnd.hidden = true;
    this.toEnd.addEventListener("click", () => this.scrollEnd());
    this.el.append(this.bar, this.note, this.hiddenLine, this.list, this.toEnd, this.said);
    this.list.addEventListener("scroll", () => {
      this.stuck = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
      this.toEnd.hidden = this.stuck;
    });
    onSourceChange(() => this.bind());
  }

  private bind(): void {
    const src = tableSource();
    if (this.bound === src) return;
    this.off?.();
    this.bound = src;
    this.known = new Set();
    this.first = true;
    this.off = src.onChange(() => {
      if (this.el.isConnected) this.render();
    });
  }

  private scrollEnd(): void {
    this.list.scrollTop = this.list.scrollHeight;
    this.stuck = true;
    this.toEnd.hidden = true;
  }

  /** Draw into `body`, keeping the list (and its scroll) when already there. */
  mount(body: HTMLElement): void {
    this.bind();
    if (this.el.parentElement !== body || body.childElementCount !== 1) body.replaceChildren(this.el);
    this.render();
  }

  private render(): void {
    const src = tableSource();
    const entries = src.entries();
    this.bar.replaceChildren();
    const hide = button("ghost table-hide", tt.hideHere);
    hide.title = tt.hideHereDesc;
    hide.disabled = entries.length === 0;
    hide.addEventListener("click", () => {
      src.hideUpToHere();
      ui.status.textContent = tt.hiddenStatus;
    });
    this.bar.append(hide);
    this.note.textContent = src.shared ? "" : tt.notShared;
    this.note.hidden = src.shared;
    this.hiddenLine.replaceChildren();
    this.hiddenLine.hidden = !src.hidden();
    if (src.hidden()) {
      const undo = button("ghost table-unhide", tt.showAgain);
      undo.addEventListener("click", () => {
        if (src.undoHide()) ui.status.textContent = tt.shownStatus;
      });
      this.hiddenLine.append(tt.hiddenLine, " ", undo);
    }
    const top = this.list.scrollTop;
    const fresh: TableEntry[] = [];
    const items: HTMLElement[] = [];
    for (const e of entries) {
      if (!this.known.has(e.id)) fresh.push(e);
      items.push(this.item(e));
    }
    if (items.length === 0) {
      const empty = h("li", "table-empty", src.hidden() ? tt.emptyOff : tt.empty);
      this.list.replaceChildren(empty);
    } else this.list.replaceChildren(...items);
    // Others' news is said once, with their name; the first paint and a
    // hidden or restored log say nothing.
    if (!this.first) {
      const others = fresh.filter((e) => !e.mine);
      const last = others[others.length - 1];
      if (last) {
        this.said.textContent = "";
        const text = tt.said(whoOf(last), saidOf(last));
        requestAnimationFrame(() => (this.said.textContent = text));
      }
    }
    this.first = false;
    this.known = new Set(entries.map((e) => e.id));
    if (this.stuck) this.scrollEnd();
    else {
      this.list.scrollTop = top;
      this.toEnd.hidden = false;
    }
    if (tableOnScreen()) src.markSeen();
  }

  private item(e: TableEntry): HTMLElement {
    const li = h("li", e.mine ? "table-entry mine" : "table-entry");
    li.dataset["kind"] = e.kind;
    li.dataset["by"] = e.by;
    const said = saidOf(e);
    li.setAttribute("aria-label", tt.entryLabel(whoOf(e), said));
    const meta = h("div", "table-meta");
    meta.append(h("span", "table-who", whoOf(e)));
    const time = h("time", "table-time", clock(e.at));
    time.dateTime = new Date(e.at).toISOString();
    meta.append(time);
    if (e.path) {
      const where = button("table-where", name(e.path));
      where.title = tt.openNote(name(e.path));
      where.addEventListener("click", () => openNote(e.path, false));
      meta.append(where);
    } else meta.append(h("span", "table-where plain", tt.noWhere));
    const body = h("div", "table-body");
    if (e.kind === "oracle") {
      const label = e.oracle === "question" ? tt.oracleQuestion : e.oracle === "spark" ? tt.oracleSpark : tt.oracleTable(e.notation);
      body.append(h("span", "table-label", label), h("span", "table-row", e.row ?? ""));
      if (e.total) body.append(h("span", "table-roll", e.oracle === "question" ? `d100 ${e.total}` : `#${e.total}`));
    } else {
      body.append(h("span", "table-notation", e.kind === "table" ? (e.source ?? e.notation) : e.notation));
      body.append(dice(e));
      body.append(h("strong", "table-total", String(e.total)));
      if (e.kind === "table" && e.row) body.append(h("span", "table-row", plainRow(e.row)));
    }
    const add = button("ghost iconic table-add", "", "plus");
    add.setAttribute("aria-label", tt.addToNoteFor(said));
    add.title = tt.addToNote;
    add.addEventListener("click", () => void addToNote(e, () => quick.pick()));
    li.append(meta, body, add);
    return li;
  }
}

let view: TableView | null = null;

/** Draw the table into the side panel's body. */
export function paintTable(body: HTMLElement): void {
  if (!view) view = new TableView();
  view.mount(body);
}
