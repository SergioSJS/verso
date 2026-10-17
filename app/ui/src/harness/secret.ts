// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The harness's projection of a note (ADR 0087): the lines of each
 *  `[!secret]` callout, at any quote depth, taken out with the lines quoted
 *  as deep or deeper after it and its lazy lines. The core's
 *  (`verso_dialect::project`) is the real one; this stands in for it in
 *  the browser harness, which has no core. */
export function projectSecrets(text: string): string {
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
      continue;
    }
    out.push(line);
  }
  return out.join("");
}

export { projectSecretsWithPlaceholders } from "../secret/text";
