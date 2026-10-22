// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A snippet as plain reading text (the match stays in `[brackets]`): no
 *  frontmatter lines (all of it when only those matched), no emphasis marks, links as their text. */
export function cleanSnippet(snippet: string): string {
  const lines = snippet.split("\n");
  let at = 0;
  while (at < lines.length && /^\s*(---|[\w-]+:(\s.*)?)\s*$/.test(lines[at]!)) at++;
  const body = lines.slice(at).join(" ");
  const kept = body
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1$2")
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return kept;
}
