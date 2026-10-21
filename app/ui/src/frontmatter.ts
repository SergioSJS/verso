// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a note's frontmatter is, by the core's rule — pulldown-cmark's
// YAML metadata block, taken only at the start of the file and only when
// it closes with `---` (crates/verso-dialect/src/parse.rs) — so that the
// fold of Live Preview and the properties panel never hide or edit a
// block the core does not read as properties.

const OPENING = /^\uFEFF?---[ \t\f\r]*$/;
const BLANK = /^[ \t\v\f]*$/;
const CLOSING = /^(---|\.\.\.) *$/;

/** The file opens with a line the core would take for a frontmatter
 *  fence, whether or not it closes. */
export function opensWithFence(first: string | undefined): boolean {
  return first !== undefined && OPENING.test(first);
}

/** The index (0-based) of the line that closes the frontmatter, or -1
 *  when the core finds none. `line(i)` is line `i` without its line
 *  ending, `undefined` past the last (a CR left at the end of a line —
 *  CRLF split on LF — counts as its ending). The first line is `---` and
 *  only spaces, tabs or form feeds; the second is neither blank nor a
 *  closing line; the first closing line after it — `---` or `...` at the
 *  start of a line, trailing spaces allowed — ends the block, and the
 *  core keeps the block only when that line is exactly `---`. */
export function frontmatterClose(line: (i: number) => string | undefined): number {
  if (!opensWithFence(line(0))) return -1;
  const at = (i: number) => line(i)?.replace(/\r$/, "");
  const second = at(1);
  if (second === undefined || BLANK.test(second) || CLOSING.test(second)) return -1;
  for (let i = 2; ; i++) {
    const l = at(i);
    if (l === undefined) return -1;
    if (CLOSING.test(l)) return l === "---" ? i : -1;
  }
}
