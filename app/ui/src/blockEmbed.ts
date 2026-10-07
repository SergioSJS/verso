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
  const text = note.lines.slice(block.first_line - 1, block.last_line).join("\n");
  return commands.renderMarkdown(text);
}
