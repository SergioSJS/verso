// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Live Preview's blank lines (ADR 0061, revised 2026-10-22): a blank line
// that only separates two blocks is drawn as a thin gap, since in Edit mode
// its Enter is what delimits the blocks, not space the reader asked for.
// Pure decoration: the text is never touched.

import type { Text } from "@codemirror/state";
import type { Tree } from "@lezer/common";

/** `gap`: the first blank line of a run, the one that delimits two blocks.
 *  `extra`: a further one in the same run — space somebody typed on
 *  purpose, drawn smaller than a line but still there. */
export type Gap = "gap" | "extra";

/** Nodes a blank line may sit in and still be only a separator. A blank line
 *  inside code, an HTML block, a table or a comment is content. */
const SEPARATOR_IN = new Set(["Document", "BulletList", "OrderedList", "ListItem"]);

const BLANK = /^\s*$/;

/** The blank lines of `doc` between `from` and `to` that are drawn as a gap,
 *  by line number. The frontmatter (`fmEnd`, or -1) is folded away and the
 *  last line of the note is kept whole: it is where one clicks to go on
 *  writing. A line the caret is on is the caller's to leave out. */
export function blankGaps(doc: Text, tree: Tree, from: number, to: number, fmEnd: number): Map<number, Gap> {
  const out = new Map<number, Gap>();
  const first = doc.lineAt(from).number;
  const last = doc.lineAt(Math.min(to, doc.length)).number;
  for (let n = first; n <= last; n++) {
    if (n >= doc.lines) break;
    const line = doc.line(n);
    if (!BLANK.test(line.text) || (fmEnd >= 0 && line.to <= fmEnd)) continue;
    let separator = true;
    for (let node = tree.resolveInner(line.from, 1) as { name: string; parent: unknown } | null; node; node = node.parent as typeof node) {
      if (!SEPARATOR_IN.has(node.name)) {
        separator = false;
        break;
      }
    }
    if (!separator) continue;
    const afterBlank = n > 1 && BLANK.test(doc.line(n - 1).text) && !(fmEnd >= 0 && doc.line(n - 1).to <= fmEnd);
    out.set(n, afterBlank ? "extra" : "gap");
  }
  return out;
}
