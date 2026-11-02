// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A table edited as a table in Edit mode (ADR 0064): drawn in place of
// its text, each cell typed into where it stands. Tab and Shift-Tab go
// from cell to cell, Enter to the cell below (a new row under the last),
// the arrows leave the table at its edges and Esc after it; `+` under
// the table adds a row and `+` beside it a column; a cell's menu inserts
// and deletes rows and columns and aligns a column. Every change writes
// the table back as aligned Markdown — the file stays what Obsidian
// reads — and is one step of the editor's undo. The cell being typed in
// is never redrawn while it has the focus: a dead key's accent is
// composed in place.

import { EditorView, WidgetType, keymap } from "@codemirror/view";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { redo, undo } from "@codemirror/commands";
import { deleteCol, deleteRow, gridText, insertCol, insertRow, parseGrid, setAlign, setCell, type Align, type Grid } from "./table";
import { wireColumnGrips, type WidthStore } from "./tableWidths";

export type TableEditorOptions = {
  labels: {
    addRow: string;
    addCol: string;
    rowAbove: string;
    rowBelow: string;
    deleteRow: string;
    colLeft: string;
    colRight: string;
    deleteCol: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    cell: (row: number, col: number) => string;
  };
  /** A menu at a point of the screen: the window's own. */
  menu?: (x: number, y: number, items: [string, () => void, string?][]) => void;
  /** The table as the reading view renders it (the core's renderer), for
   *  the cells' look while they are not typed in. */
  render?: (markdown: string) => Promise<string>;
  /** Where the widths of the note's `ordinal`-th table, of `cols` columns,
   *  are kept (ADR 0064, revised 2026-10-07): outside the file. */
  widths?: (ordinal: number, cols: number) => WidthStore;
};

/** The class of the cell whose field holds the focus (see `arm`). */
const HELD = "cell-held";

/** The field of `dom` that holds the focus: the page's active element, which
 *  stays so while the window is in the background (`:focus` does not). */
function heldInput(dom: HTMLElement): HTMLInputElement | null {
  const a = dom.ownerDocument.activeElement;
  return a instanceof HTMLInputElement && dom.contains(a) && a.matches("input[data-r]") ? a : null;
}

/** Where the focus goes after a change, by table position: the widget
 *  drawn there takes it once it is in the page. */
const pending = new WeakMap<EditorView, { at: number; r: number; c: number; caret: "start" | "end" | "all" }>();

/** Focus cell (r, c) of the table at `at` once it is drawn; r -1 is the
 *  header. */
export function focusTableCell(view: EditorView, at: number, r: number, c: number, caret: "start" | "end" | "all" = "end"): void {
  pending.set(view, { at, r, c, caret });
  // Already drawn (the change kept its widget): take the focus now.
  window.requestAnimationFrame(() => takePending(view));
}

function takePending(view: EditorView): void {
  const want = pending.get(view);
  if (!want) return;
  for (const dom of view.contentDOM.querySelectorAll<HTMLElement>(".cm-table-editor")) {
    const at = safePos(view, dom);
    if (at !== want.at) continue;
    pending.delete(view);
    focusCell(dom, want.r, want.c, want.caret);
    return;
  }
}

function safePos(view: EditorView, dom: HTMLElement): number | null {
  try {
    return view.posAtDOM(dom);
  } catch {
    return null;
  }
}

function inputAt(dom: HTMLElement, r: number, c: number): HTMLInputElement | null {
  return dom.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
}

function focusCell(dom: HTMLElement, r: number, c: number, caret: "start" | "end" | "all"): void {
  const input = inputAt(dom, r, c);
  if (!input) return;
  input.focus({ preventScroll: false });
  const n = input.value.length;
  if (caret === "all") input.setSelectionRange(0, n);
  else if (caret === "start") input.setSelectionRange(0, 0);
  else input.setSelectionRange(n, n);
}

/** The table's text now, by the widget's place in the note. */
function current(view: EditorView, dom: HTMLElement): { from: number; to: number; grid: Grid } | null {
  const at = safePos(view, dom);
  if (at === null) return null;
  const doc = view.state.doc;
  if (at >= doc.length) return null;
  const first = doc.lineAt(at);
  const lines: string[] = [];
  let to = first.from;
  for (let n = first.number; n <= doc.lines; n++) {
    const l = doc.line(n);
    if (!/^\s*\|/.test(l.text)) break;
    lines.push(l.text.trim());
    to = l.to;
  }
  if (lines.length < 2) return null;
  return { from: first.from, to, grid: parseGrid(lines) };
}

/** Write a grid in place of the table, as the smallest change, and put
 *  the focus on (r, c). */
function write(view: EditorView, dom: HTMLElement, grid: Grid, focus: { r: number; c: number; caret?: "start" | "end" | "all" } | null, userEvent: string): void {
  const now = current(view, dom);
  if (!now) return;
  const old = view.state.sliceDoc(now.from, now.to);
  const next = gridText(grid);
  if (focus) pending.set(view, { at: now.from, r: focus.r, c: focus.c, caret: focus.caret ?? "end" });
  if (next !== old) {
    let a = 0;
    while (a < old.length && a < next.length && old[a] === next[a]) a++;
    let b = 0;
    while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
    view.dispatch({ changes: { from: now.from + a, to: now.to - b, insert: next.slice(a, next.length - b) }, userEvent });
  }
  window.requestAnimationFrame(() => takePending(view));
}

export class TableEditor extends WidgetType {
  constructor(readonly text: string, readonly opts: TableEditorOptions, readonly ordinal = 0) {
    super();
  }

  override eq(other: TableEditor): boolean {
    return other.text === this.text && other.ordinal === this.ordinal;
  }

  /** The grid of this widget's text. */
  grid(): Grid {
    return parseGrid(this.text.split("\n").map((l) => l.trim()));
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-lp-block cm-table-editor";
    this.fill(dom, view);
    window.requestAnimationFrame(() => takePending(view));
    return dom;
  }

  /** Redrawn in place: a cell with the focus keeps it, and its text. */
  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const g = this.grid();
    const focused = heldInput(dom);
    const same = dom.querySelectorAll("thead input").length === g.head.length && dom.querySelectorAll("tbody tr").length === g.body.length;
    if (same) {
      for (const input of dom.querySelectorAll<HTMLInputElement>("input[data-r]")) {
        const r = Number(input.dataset["r"]);
        const c = Number(input.dataset["c"]);
        const text = r < 0 ? g.head[c] ?? "" : g.body[r]?.[c] ?? "";
        if (input !== focused && input.value !== text) input.value = text;
        const cell = input.closest<HTMLElement>("th, td");
        if (cell) cell.style.textAlign = g.align[c] ?? "";
      }
      this.paint(dom);
      window.requestAnimationFrame(() => takePending(view));
      return true;
    }
    const at = focused ? { r: Number(focused.dataset["r"]), c: Number(focused.dataset["c"]), pos: focused.selectionStart ?? 0 } : null;
    dom.replaceChildren();
    this.fill(dom, view);
    if (at && !pending.get(view)) {
      const input = inputAt(dom, at.r, at.c);
      if (input) {
        input.focus();
        input.setSelectionRange(at.pos, at.pos);
      }
    }
    window.requestAnimationFrame(() => takePending(view));
    return true;
  }

  /** The table's cells drawn by the reading view's renderer, where a cell
   *  is not being typed in. */
  private paint(dom: HTMLElement): void {
    const render = this.opts.render;
    if (!render) return;
    const text = this.text;
    void render(text).then((html) => {
      if (!dom.isConnected) return;
      // Parsed in a template, where nothing loads or runs; the HTML comes
      // cleaned (`render` passes it through the sanitizer).
      const tmp = document.createElement("template");
      tmp.innerHTML = html;
      const rendered = tmp.content.querySelector("table");
      if (!rendered) return;
      // Rows by order — the header first — whether the renderer puts the
      // header in a `thead` or not.
      const rows = Array.from(rendered.querySelectorAll("tr"));
      if (rows.length !== this.grid().body.length + 1) return;
      for (const view of dom.querySelectorAll<HTMLElement>(".cm-table-cell-view")) {
        const r = Number(view.dataset["r"]);
        const c = Number(view.dataset["c"]);
        const src = rows[r + 1]?.querySelectorAll("th, td")[c];
        if (src && !view.parentElement?.matches(`:focus-within, .${HELD}`)) view.innerHTML = src.innerHTML;
      }
    });
  }

  private fill(dom: HTMLElement, view: EditorView): void {
    const g = this.grid();
    const L = this.opts.labels;
    const table = document.createElement("table");
    const cell = (tag: "th" | "td", r: number, c: number, text: string): HTMLElement => {
      const el = document.createElement(tag);
      el.style.textAlign = g.align[c] ?? "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cm-table-cell-input";
      input.value = text;
      input.dataset["r"] = String(r);
      input.dataset["c"] = String(c);
      input.spellcheck = true;
      input.setAttribute("aria-label", L.cell(r + 1, c + 1));
      const look = document.createElement("div");
      look.className = "cm-table-cell-view";
      look.dataset["r"] = String(r);
      look.dataset["c"] = String(c);
      look.textContent = text;
      el.append(look, input);
      this.arm(input, dom, view);
      el.addEventListener("mousedown", (e) => {
        if (e.target === input || (e.target as HTMLElement).closest("a, .table-col-grip")) return;
        e.preventDefault();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
      el.addEventListener("contextmenu", (e) => {
        if (!this.opts.menu) return;
        e.preventDefault();
        this.menu(view, dom, r, c, e.clientX, e.clientY);
      });
      return el;
    };
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    g.head.forEach((t, c) => hr.append(cell("th", -1, c, t)));
    thead.append(hr);
    if (this.opts.widths) wireColumnGrips(Array.from(hr.children) as HTMLElement[], this.opts.widths(this.ordinal, g.head.length), () => document.createElement("div"));
    const tbody = document.createElement("tbody");
    g.body.forEach((row, r) => {
      const tr = document.createElement("tr");
      row.forEach((t, c) => tr.append(cell("td", r, c, t)));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    const wrap = document.createElement("div");
    wrap.className = "cm-table-wrap";
    const addCol = document.createElement("button");
    addCol.type = "button";
    addCol.className = "cm-table-add cm-table-add-col";
    addCol.title = L.addCol;
    addCol.setAttribute("aria-label", L.addCol);
    addCol.textContent = "+";
    addCol.addEventListener("mousedown", (e) => e.preventDefault());
    addCol.addEventListener("click", () => {
      const now = current(view, dom);
      if (now) write(view, dom, insertCol(now.grid, now.grid.head.length), { r: -1, c: now.grid.head.length }, "input.table");
    });
    wrap.append(table, addCol);
    const addRow = document.createElement("button");
    addRow.type = "button";
    addRow.className = "cm-table-add cm-table-add-row";
    addRow.title = L.addRow;
    addRow.setAttribute("aria-label", L.addRow);
    addRow.textContent = "+";
    addRow.addEventListener("mousedown", (e) => e.preventDefault());
    addRow.addEventListener("click", () => {
      const now = current(view, dom);
      if (now) write(view, dom, insertRow(now.grid, now.grid.body.length), { r: now.grid.body.length, c: 0 }, "input.table");
    });
    // The table and its two `+`, as wide as the table: the row's `+` under
    // it, the column's beside it.
    const frame = document.createElement("div");
    frame.className = "cm-table-frame";
    frame.append(wrap, addRow);
    dom.append(frame);
    this.paint(dom);
  }

  /** A cell's keys and typing. */
  private arm(input: HTMLInputElement, dom: HTMLElement, view: EditorView): void {
    let composing = false;
    const r = () => Number(input.dataset["r"]);
    const c = () => Number(input.dataset["c"]);
    const commit = () => {
      const now = current(view, dom);
      if (!now) return;
      write(view, dom, setCell(now.grid, r(), c(), input.value), null, "input.table");
    };
    input.addEventListener("compositionstart", () => (composing = true));
    input.addEventListener("compositionend", () => {
      composing = false;
      commit();
    });
    input.addEventListener("input", () => {
      // The cell grows with what is typed: its look, under the field,
      // gives the column its width.
      const look = input.previousElementSibling;
      if (look) look.textContent = input.value || "\u00a0";
      if (!composing) commit();
    });
    // The cell that holds the focus is marked by script, not left to the
    // :focus / :focus-within pseudo-classes: with the window sent to the
    // background WebKit drops them (and fires `blur` on the field) while the
    // field is still the page's active element, and a cell that depends on
    // them goes blank. A `blur` with the document not focused is the window
    // leaving, not the user moving on: the cell keeps its mark, and its text,
    // until a blur that happens with the window in front.
    const cell = () => input.closest<HTMLElement>("th, td");
    input.addEventListener("focus", () => {
      dom.classList.add("has-focus");
      cell()?.classList.add(HELD);
    });
    input.addEventListener("blur", () => {
      if (!input.ownerDocument.hasFocus() && input.ownerDocument.activeElement === input) return;
      dom.classList.remove("has-focus");
      cell()?.classList.remove(HELD);
    });
    input.addEventListener("keydown", (e) => {
      if (composing || e.isComposing) return;
      const now = current(view, dom);
      if (!now) return;
      const g = now.grid;
      const cols = g.head.length;
      const rows = g.body.length;
      const mod = e.metaKey || e.ctrlKey;
      const go = (rr: number, cc: number, caret: "start" | "end" | "all" = "end") => {
        e.preventDefault();
        focusCell(dom, rr, cc, caret);
      };
      // Leave the table for the text before or after it.
      const leave = (after: boolean) => {
        e.preventDefault();
        const doc = view.state.doc;
        const anchor = after ? Math.min(doc.length, now.to + 1) : Math.max(0, now.from - 1);
        view.focus();
        view.dispatch({ selection: { anchor }, scrollIntoView: true });
      };
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        pending.set(view, { at: now.from, r: r(), c: c(), caret: "end" });
        (e.shiftKey ? redo : undo)(view);
        window.requestAnimationFrame(() => takePending(view));
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const forward = !e.shiftKey;
        let rr = r();
        let cc = c() + (forward ? 1 : -1);
        if (cc >= cols) {
          cc = 0;
          rr += 1;
          if (rr >= rows) {
            write(view, dom, insertRow(g, rows), { r: rows, c: 0 }, "input.table");
            return;
          }
        } else if (cc < 0) {
          if (rr < 0) return;
          cc = cols - 1;
          rr -= 1;
        }
        go(rr, cc, "all");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (r() + 1 >= rows) write(view, dom, insertRow(g, rows), { r: rows, c: c() }, "input.table");
        else go(r() + 1, c());
        return;
      }
      if (e.key === "Escape") return leave(true);
      if (e.key === "ArrowUp" && !e.shiftKey) {
        if (r() < 0) return leave(false);
        return go(r() - 1, c());
      }
      if (e.key === "ArrowDown" && !e.shiftKey) {
        if (r() + 1 >= rows) return leave(true);
        return go(r() + 1, c());
      }
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      if (e.key === "ArrowLeft" && !e.shiftKey && start === 0 && end === 0) {
        if (c() > 0) return go(r(), c() - 1, "end");
        if (r() >= 0) return go(r() - 1, cols - 1, "end");
        return leave(false);
      }
      if (e.key === "ArrowRight" && !e.shiftKey && start === input.value.length && end === start) {
        if (c() + 1 < cols) return go(r(), c() + 1, "start");
        if (r() + 1 < rows) return go(r() + 1, 0, "start");
        return leave(true);
      }
      if (e.key === "Backspace" && input.value === "" && r() >= 0 && g.body[r()]?.every((x) => x === "") && rows > 1) {
        // An empty row, emptied again: it goes, as a list item would.
        e.preventDefault();
        write(view, dom, deleteRow(g, r()), { r: Math.max(-1, r() - 1), c: c() }, "delete.table");
      }
    });
  }

  /** A cell's menu: rows, columns, alignment. */
  private menu(view: EditorView, dom: HTMLElement, r: number, c: number, x: number, y: number): void {
    const now = current(view, dom);
    if (!now || !this.opts.menu) return;
    const g = now.grid;
    const L = this.opts.labels;
    const items: [string, () => void, string?][] = [];
    if (r >= 0) {
      items.push([L.rowAbove, () => write(view, dom, insertRow(g, r), { r, c }, "input.table"), "chevronUp"]);
      items.push([L.rowBelow, () => write(view, dom, insertRow(g, r + 1), { r: r + 1, c }, "input.table"), "chevronDown"]);
    } else items.push([L.rowBelow, () => write(view, dom, insertRow(g, 0), { r: 0, c }, "input.table"), "chevronDown"]);
    items.push([L.colLeft, () => write(view, dom, insertCol(g, c), { r, c }, "input.table"), "chevronLeft"]);
    items.push([L.colRight, () => write(view, dom, insertCol(g, c + 1), { r, c: c + 1 }, "input.table"), "chevron"]);
    items.push(["—", () => {}]);
    const align = (a: Align, label: string) => [label + (g.align[c] === a ? " ✓" : ""), () => write(view, dom, setAlign(g, c, g.align[c] === a ? null : a), { r, c }, "input.table"), "text"] as [string, () => void, string];
    items.push(align("left", L.alignLeft), align("center", L.alignCenter), align("right", L.alignRight));
    items.push(["—", () => {}]);
    if (r >= 0) items.push([L.deleteRow, () => write(view, dom, deleteRow(g, r), { r: Math.min(r, g.body.length - 2), c }, "delete.table"), "close"]);
    if (g.head.length > 1) items.push([L.deleteCol, () => write(view, dom, deleteCol(g, c), { r, c: Math.max(0, c - 1) }, "delete.table"), "close"]);
    this.opts.menu(x, y, items);
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export type TableAction = "alignLeft" | "alignCenter" | "alignRight" | "rowAbove" | "rowBelow" | "colLeft" | "colRight" | "deleteRow" | "deleteCol";

/** The cell of `view`'s tables that has the focus, if one has. */
function focusedCell(view: EditorView): { dom: HTMLElement; r: number; c: number } | null {
  const input = document.activeElement;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains("cm-table-cell-input")) return null;
  const dom = input.closest<HTMLElement>(".cm-table-editor");
  if (!dom || !view.contentDOM.contains(dom)) return null;
  return { dom, r: Number(input.dataset["r"]), c: Number(input.dataset["c"]) };
}

/** Whether a cell of `view`'s tables has the focus: the toolbar's table
 *  tools are shown then. */
export function tableHasFocus(view: EditorView): boolean {
  return focusedCell(view) !== null;
}

/** The alignment of the column whose cell has the focus; undefined when
 *  no cell has it. */
export function focusedAlign(view: EditorView): Align | undefined {
  const at = focusedCell(view);
  if (!at) return undefined;
  return current(view, at.dom)?.grid.align[at.c] ?? null;
}

/** A table tool of the toolbar, on the cell with the focus — what its
 *  menu does. False when no cell has the focus. */
export function tableAction(view: EditorView, action: TableAction): boolean {
  const at = focusedCell(view);
  if (!at) return false;
  const now = current(view, at.dom);
  if (!now) return false;
  const { dom, r, c } = at;
  const g = now.grid;
  const align = (a: Align) => write(view, dom, setAlign(g, c, g.align[c] === a ? null : a), { r, c }, "input.table");
  switch (action) {
    case "alignLeft":
      align("left");
      break;
    case "alignCenter":
      align("center");
      break;
    case "alignRight":
      align("right");
      break;
    case "rowAbove":
      write(view, dom, insertRow(g, Math.max(0, r)), { r: Math.max(0, r), c }, "input.table");
      break;
    case "rowBelow":
      write(view, dom, insertRow(g, r + 1), { r: r + 1, c }, "input.table");
      break;
    case "colLeft":
      write(view, dom, insertCol(g, c), { r, c }, "input.table");
      break;
    case "colRight":
      write(view, dom, insertCol(g, c + 1), { r, c: c + 1 }, "input.table");
      break;
    case "deleteRow":
      if (r < 0) return false;
      write(view, dom, deleteRow(g, r), { r: Math.min(r, g.body.length - 2), c }, "delete.table");
      break;
    case "deleteCol":
      if (g.head.length <= 1) return false;
      write(view, dom, deleteCol(g, c), { r, c: Math.max(0, c - 1) }, "delete.table");
      break;
  }
  return true;
}

/** The arrows into a table from the line above or below it: its first or
 *  last row takes the focus. `tables` gives where the editable tables of
 *  the note are. */
export function tableArrows(tables: (state: EditorState) => { from: number; to: number }[]): Extension {
  const into = (view: EditorView, down: boolean): boolean => {
    const sel = view.state.selection.main;
    if (!sel.empty) return false;
    const line = view.state.doc.lineAt(sel.head);
    const target = down ? line.to + 1 : line.from - 1;
    if (target < 0 || target > view.state.doc.length) return false;
    const t = tables(view.state).find((x) => (down ? x.from === target : x.to === target));
    if (!t) return false;
    const rows = view.state.doc.lineAt(t.to).number - view.state.doc.lineAt(t.from).number - 1;
    focusTableCell(view, t.from, down ? -1 : rows - 1, 0, "end");
    return true;
  };
  return Prec.high(
    keymap.of([
      { key: "ArrowDown", run: (v) => into(v, true) },
      { key: "ArrowUp", run: (v) => into(v, false) },
    ]),
  );
}
