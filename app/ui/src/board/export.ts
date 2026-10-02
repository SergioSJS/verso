// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The board as a picture (ADR 0057, 2026-09-30). Excalidraw exports a
// card as an empty web embed; here each card becomes shapes Excalidraw
// can draw — its box, its name, and its text as it reads — and the rest
// of the board goes as it is.

/** A note's Markdown as its reader reads it, in plain lines: no
 *  frontmatter, no marks, a link by its text, embeds and images left out. */
export function plainOf(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, "\n");
  text = text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\s*(?:\n|$)/, "");
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    let line = raw;
    if (/^\s*```/.test(line)) continue;
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) continue;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      line = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim())
        .join("   ");
    }
    line = line
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, (_, t: string) => (t.split("#")[0] ?? t).split("/").pop() ?? t)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^(\s*)>\s?/, "$1")
      .replace(/^(\s*)\[!\w+\][+-]?\s*/, "$1")
      .replace(/^(\s*)[-*+]\s+\[[xX]\]\s+/, "$1☑ ")
      .replace(/^(\s*)[-*+]\s+\[ \]\s+/, "$1☐ ")
      .replace(/^(\s*)[-*+]\s+/, "$1• ")
      .replace(/(\*\*|__|==|~~)(.+?)\1/g, "$2")
      .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?=[^\w*]|$)/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\s+$/, "");
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `text` broken into lines no wider than `width` by `measure`, at most
 *  `max` of them; a text cut short ends in an ellipsis. */
export function wrapLines(text: string, width: number, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  const room = Math.max(0, max);
  for (const para of text.split("\n")) {
    if (lines.length > room) break;
    if (para === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (word === "") continue;
      const next = line + word;
      if (line !== "" && measure(next.trimEnd()) > width) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
      // A single word wider than the line is cut where it no longer fits.
      while (measure(line) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length <= room) return lines;
  const kept = lines.slice(0, room);
  if (room > 0) {
    let last = kept[room - 1] ?? "";
    while (last !== "" && measure(`${last}…`) > width) last = last.slice(0, -1);
    kept[room - 1] = `${last.trimEnd()}…`;
  }
  return kept;
}
