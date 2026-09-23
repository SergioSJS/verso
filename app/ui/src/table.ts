// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Tables in the editor: Tab and Shift-Tab move between cells (a new row
// at the end), Enter adds a row, and every one of those re-aligns the
// pipes of the whole table. Plain text stays plain text: nothing here
// runs outside a table row.

import { Prec, type EditorState, type Text } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

const ROW = /^\s*\|.*\|\s*$/;
export const SEPARATOR = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;

function isRow(text: string): boolean {
  return ROW.test(text);
}

/** The table block around line `n`: first and last line numbers. */
function block(doc: Text, n: number): { from: number; to: number } | null {
  if (!isRow(doc.line(n).text)) return null;
  let from = n;
  let to = n;
  while (from > 1 && isRow(doc.line(from - 1).text)) from--;
  while (to < doc.lines && isRow(doc.line(to + 1).text)) to++;
  return { from, to };
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
  for (const ch of s.replace(/\p{M}/gu, "")) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(ch) ? 2 : 1;
  return w;
}

/** The table re-laid: every column as wide as its widest cell, the
 *  separator keeping its alignment marks. Returns the new lines. */
export function format(lines: string[]): string[] {
  const rows = lines.map(cells);
  const cols = Math.max(...rows.map((r) => r.length));
  for (const r of rows) while (r.length < cols) r.push("");
  const widths = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.map((r, i) => (SEPARATOR.test(lines[i] ?? "") ? 3 : width(r[c] ?? "")))));
  return rows.map((r, i) => {
    if (SEPARATOR.test(lines[i] ?? "")) {
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

function reformatAndPlace(view: EditorView, state: EditorState, lineNo: number, cell: number, appendRow: boolean): boolean {
  const doc = state.doc;
  const b = block(doc, lineNo);
  if (!b) return false;
  const lines: string[] = [];
  for (let n = b.from; n <= b.to; n++) lines.push(doc.line(n).text);
  const cols = Math.max(...lines.map((l) => cells(l).length));
  if (appendRow) lines.push(`|${" |".repeat(cols)}`);
  const formatted = format(lines);
  const from = doc.line(b.from).from;
  const to = doc.line(b.to).to;
  const text = formatted.join("\n");
  const targetLine = Math.min(lineNo - b.from, formatted.length - 1);
  let offset = 0;
  for (let i = 0; i < targetLine; i++) offset += (formatted[i]?.length ?? 0) + 1;
  const row = formatted[targetLine] ?? "";
  const start = cellStart(row, cell);
  const content = cells(row)[cell] ?? "";
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + offset + start, head: from + offset + start + content.length },
    scrollIntoView: true,
  });
  return true;
}

function move(view: EditorView, dir: 1 | -1): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  if (!isRow(line.text)) return false;
  const b = block(state.doc, line.number);
  if (!b) return false;
  const n = cells(line.text).length;
  let cell = cellIndex(line.text, head - line.from) + dir;
  let lineNo = line.number;
  if (cell >= n) {
    lineNo++;
    cell = 0;
    if (lineNo > b.to) return reformatAndPlace(view, state, lineNo, 0, true);
    if (SEPARATOR.test(state.doc.line(lineNo).text)) lineNo++;
    if (lineNo > b.to) return reformatAndPlace(view, state, lineNo, 0, true);
  } else if (cell < 0) {
    lineNo--;
    if (lineNo < b.from) return true;
    if (SEPARATOR.test(state.doc.line(lineNo).text)) lineNo--;
    if (lineNo < b.from) return true;
    cell = cells(state.doc.line(lineNo).text).length - 1;
  }
  return reformatAndPlace(view, state, lineNo, cell, false);
}

function newRow(view: EditorView): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  if (!isRow(line.text)) return false;
  const b = block(state.doc, line.number);
  if (!b) return false;
  const lines: string[] = [];
  for (let n = b.from; n <= b.to; n++) lines.push(state.doc.line(n).text);
  const cols = Math.max(...lines.map((l) => cells(l).length));
  const at = line.number - b.from;
  lines.splice(at + 1, 0, `|${" |".repeat(cols)}`);
  const formatted = format(lines);
  const from = state.doc.line(b.from).from;
  const to = state.doc.line(b.to).to;
  let offset = 0;
  for (let i = 0; i <= at; i++) offset += (formatted[i]?.length ?? 0) + 1;
  const start = cellStart(formatted[at + 1] ?? "", 0);
  view.dispatch({ changes: { from, to, insert: formatted.join("\n") }, selection: { anchor: from + offset + start }, scrollIntoView: true });
  return true;
}

/** Re-align the table under the caret; false when there is none. */
export function formatUnderCaret(view: EditorView): boolean {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  if (!isRow(line.text)) return false;
  const cell = cellIndex(line.text, state.selection.main.head - line.from);
  return reformatAndPlace(view, state, line.number, cell, false);
}

/** A fresh table, `cols` × `rows` body rows, as text. */
export function template(cols: number, rows: number): string {
  const head = `|${" Coluna |".repeat(cols)}`;
  const sep = `|${" --- |".repeat(cols)}`;
  const body = Array.from({ length: rows }, () => `|${"  |".repeat(cols)}`);
  return format([head, sep, ...body]).join("\n");
}

export const tableKeymap = Prec.high(
  keymap.of([
    { key: "Tab", run: (v) => move(v, 1) },
    { key: "Shift-Tab", run: (v) => move(v, -1) },
    { key: "Enter", run: newRow },
  ]),
);
