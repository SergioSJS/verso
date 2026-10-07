// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { h } from "./dom";

/* ---------- A line diff for conflicts and plans ---------- */
/** Cells of the alignment table past which the two middles are shown
 *  whole: a conflict on a very long note must not take the page's memory
 *  while it holds unsaved text. */
export const DIFF_CELLS = 4_000_000;
export function diffLines(a: string[], b: string[]): string[] {
  // The lines both ends share cost nothing, and are most of a conflict.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const n = x.length;
  const m = y.length;
  const out = a.slice(0, head).map((l) => `  ${l}`);
  if ((n + 1) * (m + 1) > DIFF_CELLS) {
    for (const l of x) out.push(`- ${l}`);
    for (const l of y) out.push(`+ ${l}`);
  } else {
    // Longest common subsequence, one flat table: no entry exceeds
    // min(n, m), at most the square root of the cells, so 16 bits hold it.
    const w = m + 1;
    const table = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] = x[i] === y[j] ? table[(i + 1) * w + j + 1]! + 1 : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        out.push(`  ${x[i]}`);
        i++;
        j++;
      } else if (table[(i + 1) * w + j]! >= table[i * w + j + 1]!) out.push(`- ${x[i++]}`);
      else out.push(`+ ${y[j++]}`);
    }
    while (i < n) out.push(`- ${x[i++]}`);
    while (j < m) out.push(`+ ${y[j++]}`);
  }
  for (let k = a.length - tail; k < a.length; k++) out.push(`  ${a[k]}`);
  return out;
}
export function diffNode(before: string, after: string, context = false): HTMLPreElement {
  const pre = h("pre", "diff");
  let lines = diffLines(before.split(/\r?\n/), after.split(/\r?\n/));
  if (context) lines = lines.filter((line, i, all) => !line.startsWith("  ") || all.slice(Math.max(0, i - 1), i + 2).some((l) => !l.startsWith("  ")));
  pre.replaceChildren(...lines.map((line) => h("span", line.startsWith("- ") ? "del" : line.startsWith("+ ") ? "add" : "", line + "\n")));
  return pre;
}
