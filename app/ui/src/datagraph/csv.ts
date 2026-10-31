// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// CSV and TSV read into the diagram's tree (ADR 0106 item 5): a root list
// of records, each keyed by the header row. Quoted cells (with doubled
// quotes and line breaks inside) follow RFC 4180; a CSV with more
// semicolons than commas in its header is read with semicolons.

import { Builder, type Format, ParseFailure, type Tree } from "./model";

const NUMBER = /^-?\d+(?:[.,]\d+)?$/;

type Cell = { text: string; from: number; to: number };

/** The records of `text`: each a list of cells with their places. Throws on a quote never closed. */
export function* records(text: string, sep: string): Generator<Cell[]> {
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const len = text.length;
  const sepCode = sep.charCodeAt(0);
  while (pos < len) {
    const row: Cell[] = [];
    for (;;) {
      const from = pos;
      let value = "";
      if (text.charCodeAt(pos) === 34) {
        // A quoted cell.
        let i = pos + 1;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q < 0) throw new ParseFailure("A quoted cell is never closed", from, len);
          value += text.slice(i, q);
          if (text.charCodeAt(q + 1) === 34) {
            value += '"';
            i = q + 2;
          } else {
            pos = q + 1;
            break;
          }
        }
        // Whatever sits between the closing quote and the separator belongs to the cell.
        let j = pos;
        while (j < len && text.charCodeAt(j) !== sepCode && text.charCodeAt(j) !== 10 && text.charCodeAt(j) !== 13) j++;
        value += text.slice(pos, j);
        pos = j;
      } else {
        let j = pos;
        while (j < len) {
          const c = text.charCodeAt(j);
          if (c === sepCode || c === 10 || c === 13) break;
          j++;
        }
        value = text.slice(pos, j);
        pos = j;
      }
      row.push({ text: value, from, to: pos });
      const c = text.charCodeAt(pos);
      if (c === sepCode) {
        pos++;
        // A separator at the very end leaves one empty cell.
        if (pos >= len) {
          row.push({ text: "", from: pos, to: pos });
          break;
        }
        continue;
      }
      if (c === 13) pos++;
      if (text.charCodeAt(pos) === 10) pos++;
      break;
    }
    // A blank line is not a record.
    if (row.length === 1 && row[0]!.text === "") continue;
    yield row;
  }
}

export function parseCsv(text: string, format: Format = "csv"): Tree {
  const b = new Builder(format);
  let sep = format === "tsv" ? "\t" : ",";
  if (format === "csv") {
    const first = text.slice(0, text.search(/\r|\n|$/));
    if ((first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)) sep = ";";
  }
  const root = b.node(-1, "", "array", 0);
  try {
    let header: string[] | null = null;
    for (const cells of records(text, sep)) {
      if (!header) {
        header = cells.map((c, i) => (c.text.trim() === "" ? `col ${i + 1}` : c.text.trim()));
        continue;
      }
      const first = cells[0]!;
      const last = cells[cells.length - 1]!;
      const index = String(root.rows.length);
      b.containerRow(root, index, first.from, first.from, false);
      const rec = b.node(root.id, index, "object", first.from);
      rec.to = last.to;
      root.rows[root.rows.length - 1]!.to = last.to;
      root.rows[root.rows.length - 1]!.text = `{${cells.length}}`;
      cells.forEach((c, i) => {
        const key = header![i] ?? `col ${i + 1}`;
        b.row(rec, { key, text: c.text, type: NUMBER.test(c.text.trim()) ? "number" : c.text === "" ? "null" : "string", from: c.from, to: c.to });
      });
    }
    if (!header) throw new ParseFailure("The file is empty", 0, Math.min(1, text.length));
    root.to = text.length;
    return b.done(null);
  } catch (e) {
    if (e instanceof ParseFailure) {
      root.to = text.length;
      return b.done({ message: e.message, from: e.at, to: e.end });
    }
    throw e;
  }
}
