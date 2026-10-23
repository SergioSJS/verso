// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a block goes when it is dropped on a note's text, and what is
// inserted so that it stands alone (ADR 0061: a block is surrounded by
// blank lines). Pure: it reads the document through `Lines`, which
// CodeMirror's `Text` satisfies.

export type Line = { number: number; from: number; to: number; text: string };
export type Lines = { lines: number; length: number; line(n: number): Line; lineAt(pos: number): Line };
/** A block of the note the drop must not enter: a fence, a table, a list, a quote, the frontmatter. */
export type Container = { from: number; to: number };

export type Placement = {
  /** The offset the text goes in at: a line's start, or the end of the note. */
  at: number;
  insert: string;
  /** The line the block's top edge stands at (the first line of the block): for the drop caret. */
  line: number;
};

/** The block `block` dropped at `pos`: before the line the point is nearer
 *  the top of, or after it; before or after a `container` the point is in.
 *  `after` says which half of the line's box the pointer is in, when the
 *  caller knows (the offset in the line says it only by the characters). */
export function placeBlock(doc: Lines, pos: number, block: string, container: Container | null = null, after: boolean | null = null): Placement {
  const here = doc.lineAt(Math.max(0, Math.min(pos, doc.length)));
  let k: number;
  if (container) {
    const first = doc.lineAt(container.from);
    k = pos <= first.to ? first.number : doc.lineAt(container.to).number + 1;
  } else if (here.text.trim() === "") k = here.number;
  else k = (after ?? pos - here.from > here.text.length / 2) ? here.number + 1 : here.number;
  const blank = (text: string): boolean => text.trim() === "";
  if (k <= doc.lines) {
    const cur = doc.line(k);
    const prev = k > 1 ? doc.line(k - 1).text : "";
    return { at: cur.from, insert: `${blank(prev) ? "" : "\n"}${block}\n${blank(cur.text) ? "" : "\n"}`, line: k };
  }
  if (doc.length === 0) return { at: 0, insert: `${block}\n`, line: 1 };
  const last = doc.line(doc.lines);
  if (last.text === "") {
    const prev = doc.lines > 1 ? doc.line(doc.lines - 1).text : "";
    return { at: doc.length, insert: `${blank(prev) ? "" : "\n"}${block}\n`, line: doc.lines };
  }
  return { at: doc.length, insert: `\n\n${block}\n`, line: doc.lines + 2 };
}
