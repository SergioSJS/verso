// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the window may tell of a note's secret blocks from its text alone
// (ADR 0087): only whether to offer the "view as a reader" toggle. What a
// block is, and what a reader receives, is the core's projection.

/** Whether a note's text may hold a secret block: the cheap test before
 *  the toggle is offered. */
export function mayHoldSecret(text: string): boolean {
  return /\[!\s*secret\s*\]/i.test(text);
}

/** A note's text prepared for the reader view: each `[!secret]` callout
 *  replaced by a placeholder callout (`[!secret-placeholder]`), so that
 *  the reading view shows a marker where secret content was removed. */
export function projectSecretsWithPlaceholders(text: string): string {
  const quotes = (line: string): number => (/^[ \t]*((?:>[ \t]?)*)/.exec(line)?.[1] ?? "").split(">").length - 1;
  const out: string[] = [];
  let hiding = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const d = quotes(line);
    if (hiding > 0) {
      // Quoted as deep, or a lazy line of the block's paragraph.
      const lazy = d === 0 && line.trim() !== "" && !/^[ \t]*([#>-]|\d+\.)/.test(line);
      if (d >= hiding || lazy) continue;
      hiding = 0;
    }
    if (d > 0 && /^\[!\s*secret\s*\]/i.test(line.replace(/^[ \t]*(?:>[ \t]?)+/, ""))) {
      hiding = d;
      const prefix = "> ".repeat(d);
      out.push(`${prefix}[!secret-placeholder]\n`);
      continue;
    }
    out.push(line);
  }
  return out.join("");
}
