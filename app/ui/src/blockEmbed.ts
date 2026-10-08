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
 *  indented code block. A line indented less keeps what it has. */
export function dedent(lines: string[]): string {
  const indent = /^[ \t]*/.exec(lines[0] ?? "")?.[0] ?? "";
  if (!indent) return lines.join("\n");
  return lines
    .map((line) => {
      if (line.startsWith(indent)) return line.slice(indent.length);
      const own = /^[ \t]*/.exec(line)?.[0] ?? "";
      return line.slice(Math.min(own.length, indent.length));
    })
    .join("\n");
}
