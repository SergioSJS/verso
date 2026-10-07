// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Tables in the editor: Tab and Shift-Tab move between cells (a new row
// at the end), Enter adds a row, and every one of those re-aligns the
// pipes of the whole table. Plain text stays plain text: nothing here
// runs outside a table the parser sees — a header row and its delimiter
// row, so never in code — and only on one whose rows all start and end
// with a pipe (the one written in `$$` math has a `$$` row: left alone).

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { Prec, type EditorState } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

/** A table of the document: each row's text, what precedes it on its line
 *  (indentation, `>` marks, a list marker) and its line number. Row 1 is
 *  the delimiter row. */
type Table = { rows: string[]; prefixes: string[]; lines: number[] };

/** The table line `n` belongs to, or null. */
function tableAt(state: EditorState, n: number): Table | null {
  const doc = state.doc;
  const line = doc.line(n);
  const end = line.from + line.text.trimEnd().length;
  if (end === line.from) return null;
  const tree = ensureSyntaxTree(state, line.to, 50) ?? syntaxTree(state);
  let node: SyntaxNode | null = tree.resolveInner(end, -1);
  while (node && node.name !== "Table") node = node.parent;
  if (!node) return null;
  const t: Table = { rows: [], prefixes: [], lines: [] };
  for (let row = node.firstChild; row; row = row.nextSibling) {
    if (row.name !== "TableHeader" && row.name !== "TableDelimiter" && row.name !== "TableRow") continue;
    const text = doc.sliceString(row.from, row.to).trim();
    if (!/^\|.*\|$/.test(text)) return null;
    const l = doc.lineAt(row.from);
    t.rows.push(text);
    t.prefixes.push(doc.sliceString(l.from, row.from));
    t.lines.push(l.number);
  }
  return t.rows.length >= 2 && t.lines.includes(n) ? t : null;
}

/** Cells of a row, without the outer pipes; `\|` inside a cell stays. */
export function cells(text: string): string[] {
  const inner = text.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && inner[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (ch === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function width(s: string): number {
  // East-Asian wide characters count double; combining marks nothing.
  let w = 0;
  for (const ch of s.replace(/\p{M}/gu, "")) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(ch) ? 2 : 1;
  return w;
}

/** The table re-laid: every column as wide as its widest cell. The second
 *  row is the delimiter row and keeps its alignment marks; every other row
 *  keeps its text, a row of dashes too. Returns the new rows. */
export function format(lines: string[]): string[] {
  const rows = lines.map(cells);
  const cols = Math.max(...rows.map((r) => r.length));
  for (const r of rows) while (r.length < cols) r.push("");
  const widths = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.map((r, i) => (i === 1 ? 3 : width(r[c] ?? "")))));
  return rows.map((r, i) => {
    if (i === 1) {
      return `| ${r.map((cell, c) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        const dashes = "-".repeat(Math.max(1, (widths[c] ?? 3) - Number(left) - Number(right)));
        return `${left ? ":" : ""}${dashes}${right ? ":" : ""}`;
      }).join(" | ")} |`;
    }
    return `| ${r.map((cell, c) => cell + " ".repeat((widths[c] ?? 0) - width(cell))).join(" | ")} |`;
  });
}

/** Where cell `k` of a formatted row starts (after the pipe and space). */
function cellStart(text: string, k: number): number {
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "|" && text[i - 1] !== "\\") {
      if (seen === k) return Math.min(i + 2, text.length);
      seen++;
    }
  }
  return text.length;
}

function cellIndex(text: string, col: number): number {
  let k = -1;
  for (let i = 0; i < Math.min(col, text.length); i++) if (text[i] === "|" && text[i - 1] !== "\\") k++;
  return Math.max(0, k);
}

/** The table's lines rewritten from `rows` (each after its own prefix),
 *  the caret put in cell `cell` of row `at` — its text selected, or at its
 *  start. */
function relay(view: EditorView, t: Table, rows: string[], prefixes: string[], at: number, cell: number, select: boolean): boolean {
  const doc = view.state.doc;
  const formatted = format(rows);
  const lines = formatted.map((r, i) => `${prefixes[i] ?? ""}${r}`);
  const from = doc.line(t.lines[0] ?? 1).from;
  const to = doc.line(t.lines[t.lines.length - 1] ?? 1).to;
  let offset = 0;
  for (let i = 0; i < at; i++) offset += (lines[i]?.length ?? 0) + 1;
  const row = formatted[at] ?? "";
  const start = from + offset + (prefixes[at]?.length ?? 0) + cellStart(row, cell);
  const content = cells(row)[cell] ?? "";
  view.dispatch({
    changes: { from, to, insert: lines.join("\n") },
    selection: { anchor: start, head: select ? start + content.length : start },
    scrollIntoView: true,
  });
  return true;
}

function emptyRow(t: Table): string {
  return `|${" |".repeat(Math.max(...t.rows.map((r) => cells(r).length)))}`;
}

function move(view: EditorView, dir: 1 | -1): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const t = tableAt(state, line.number);
  if (!t) return false;
  let at = t.lines.indexOf(line.number);
  let cell = cellIndex(t.rows[at] ?? "", head - line.from - (t.prefixes[at]?.length ?? 0)) + dir;
  if (cell >= cells(t.rows[at] ?? "").length) {
    // Past the last cell: the next row's first, skipping the delimiter
    // row; past the last row, a new one.
    at = at === 0 ? 2 : at + 1;
    if (at >= t.rows.length) {
      return relay(view, t, [...t.rows, emptyRow(t)], [...t.prefixes, t.prefixes[t.prefixes.length - 1] ?? ""], t.rows.length, 0, true);
    }
    cell = 0;
  } else if (cell < 0) {
    at = at === 2 ? 0 : at - 1;
    if (at < 0) return true;
    cell = cells(t.rows[at] ?? "").length - 1;
  }
  return relay(view, t, t.rows, t.prefixes, at, cell, true);
}

/** Enter: a new row under the caret's (under the delimiter row when the
 *  caret is on the header). */
function newRow(view: EditorView): boolean {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  const t = tableAt(state, line.number);
  if (!t) return false;
  const at = Math.max(t.lines.indexOf(line.number), 1);
  const rows = t.rows.slice();
  const prefixes = t.prefixes.slice();
  rows.splice(at + 1, 0, emptyRow(t));
  prefixes.splice(at + 1, 0, t.prefixes[at] ?? "");
  return relay(view, t, rows, prefixes, at + 1, 0, false);
}

/** Re-align the table under the caret; false when there is none. */
export function formatUnderCaret(view: EditorView): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const t = tableAt(state, line.number);
  if (!t) return false;
  const at = t.lines.indexOf(line.number);
  return relay(view, t, t.rows, t.prefixes, at, cellIndex(t.rows[at] ?? "", head - line.from - (t.prefixes[at]?.length ?? 0)), true);
}

/** A fresh table, `cols` × `rows` body rows, as text; `header` names every
 *  column (the interface's word for one). */
export function template(cols: number, rows: number, header = ""): string {
  const head = `|${` ${header} |`.repeat(cols)}`;
  const sep = `|${" --- |".repeat(cols)}`;
  const body = Array.from({ length: rows }, () => `|${"  |".repeat(cols)}`);
  return format([head, sep, ...body]).join("\n");
}

// Highest, as the slash menu's and the completion's keys are (they come
// first in the editor and pass when closed): above the Markdown keymap,
// whose Enter would continue a list or a quote around the table instead.
export const tableKeymap = Prec.highest(
  keymap.of([
    { key: "Tab", run: (v) => move(v, 1) },
    { key: "Shift-Tab", run: (v) => move(v, -1) },
    { key: "Enter", run: newRow },
  ]),
);

// ---------- A table as a grid (the table editor of Edit mode, ADR 0064) ----------

export type Align = "left" | "center" | "right" | null;

/** A table's cells by place: its header, each column's alignment, its
 *  body rows. A cell holds its text as the user reads it: `\|` is `|`. */
export type Grid = { head: string[]; align: Align[]; body: string[][] };

function unescape(cell: string): string {
  return cell.replace(/\\\|/g, "|");
}

/** A cell's text as a table row can hold it: a `|` escaped, a line break
 *  (which would end the row) as a space. */
export function escapeCell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/(?<!\\)\|/g, "\\|");
}

/** The grid of a table's rows (the header, the delimiter row, the body),
 *  every row as wide as the widest. */
export function parseGrid(rows: string[]): Grid {
  const all = rows.map(cells);
  const cols = Math.max(1, ...all.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => unescape(r[i] ?? ""));
  const delim = all[1] ?? [];
  const align = Array.from({ length: cols }, (_, i): Align => {
    const d = (delim[i] ?? "").trim();
    const l = d.startsWith(":");
    const r = d.endsWith(":") && d.length > 1;
    return l && r ? "center" : r ? "right" : l ? "left" : null;
  });
  return { head: pad(all[0] ?? []), align, body: all.slice(2).map(pad) };
}

/** The grid written back as an aligned Markdown table. */
export function gridText(g: Grid): string {
  const row = (r: string[]) => `| ${r.map(escapeCell).join(" | ")} |`;
  const delim = `| ${g.align.map((a) => (a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---")).join(" | ")} |`;
  return format([row(g.head), delim, ...g.body.map(row)]).join("\n");
}

const clone = (g: Grid): Grid => ({ head: [...g.head], align: [...g.align], body: g.body.map((r) => [...r]) });

/** Row -1 is the header. */
export function setCell(g: Grid, r: number, c: number, text: string): Grid {
  const n = clone(g);
  if (r < 0) n.head[c] = text;
  else if (n.body[r]) n.body[r]![c] = text;
  return n;
}

/** A blank body row at `at` (0: under the header). */
export function insertRow(g: Grid, at: number): Grid {
  const n = clone(g);
  n.body.splice(Math.max(0, Math.min(at, n.body.length)), 0, n.head.map(() => ""));
  return n;
}

/** Body row `r` removed; a table keeps at least its header. */
export function deleteRow(g: Grid, r: number): Grid {
  const n = clone(g);
  if (r >= 0 && r < n.body.length) n.body.splice(r, 1);
  return n;
}

/** A blank column at `at`, aligned as none. */
export function insertCol(g: Grid, at: number): Grid {
  const n = clone(g);
  const i = Math.max(0, Math.min(at, n.head.length));
  n.head.splice(i, 0, "");
  n.align.splice(i, 0, null);
  for (const r of n.body) r.splice(i, 0, "");
  return n;
}

/** Column `c` removed; a table keeps at least one column. */
export function deleteCol(g: Grid, c: number): Grid {
  const n = clone(g);
  if (n.head.length <= 1 || c < 0 || c >= n.head.length) return n;
  n.head.splice(c, 1);
  n.align.splice(c, 1);
  for (const r of n.body) r.splice(c, 1);
  return n;
}

export function setAlign(g: Grid, c: number, a: Align): Grid {
  const n = clone(g);
  if (c >= 0 && c < n.align.length) n.align[c] = a;
  return n;
}

/** Body row `r` moved to `to`. */
export function moveRow(g: Grid, r: number, to: number): Grid {
  const n = clone(g);
  if (r < 0 || r >= n.body.length) return n;
  const [row] = n.body.splice(r, 1);
  n.body.splice(Math.max(0, Math.min(to, n.body.length)), 0, row!);
  return n;
}
