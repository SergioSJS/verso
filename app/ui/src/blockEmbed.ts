// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What an embed of a note shows: the whole note, or, for `![[nota#^id]]`,
 *  the block the id names — its lines, rendered by the core as the rest of
 *  the note is (spec Q3, Q21; with the id twice, the last, Q4). */

import { commands, type NoteText } from "./bindings";

/** The `^id` an embed's target names, if any (`nota#^id`, `nota#^id|alias`). */
export function blockOfTarget(target: string): string | null {
  const m = /#\^([A-Za-z0-9-]+)/.exec(target.split("|")[0] ?? "");
  return m?.[1] ?? null;
}

/** The HTML an embed of `note` shows for `target`. */
export async function embeddedHtml(target: string, note: NoteText): Promise<string> {
  const id = blockOfTarget(target);
  if (!id) return note.html;
  const block = [...note.blocks].reverse().find((b) => b.id === id);
  if (!block) return note.html;
  return commands.renderMarkdown(dedent(note.lines.slice(block.first_line - 1, block.last_line)));
}

/** The block's lines as one text, the indent of its first line taken off
 *  every line: a nested item keeps its own nesting and loses the depth it
 *  had in the note, which on its own — a tab, four spaces — reads as an
 *  indented code block. Measured in columns, a tab reaching the next
 *  multiple of four as the parser reads it, so a child indented with a tab
 *  under a parent indented with spaces stays a child. A line indented less
 *  than the first loses all of its indent. */
export function dedent(lines: string[]): string {
  const width = columns(lines[0] ?? "");
  if (width === 0) return lines.join("\n");
  // What is left of a line's indent is written as spaces, measured from
  // its original columns: a tab kept as a tab would start at a new column
  // and change its width.
  return lines.map((line) => " ".repeat(Math.max(0, columns(line) - width)) + line.replace(/^[ \t]+/, "")).join("\n");
}

/** The columns the leading blanks of `line` span. */
function columns(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col++;
    else if (ch === "\t") col += 4 - (col % 4);
    else break;
  }
  return col;
}
