// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Saved rolls (ADR 0107, "saved rolls", 2026-10-23): the lines of a note that
// hold a dice code (ADR 0088), each named by its own text. Pure: no DOM, no
// IO. The note is read through the contract by the tray (savedPanel.ts);
// nothing here rewrites a note, and what `addRollLine` returns is the whole
// text the caller writes through the ordinary, revision-checked path.

import { readCode } from "../dice/notation";

/** A saved roll: what its button says and the notation it fills in. */
export type SavedRoll = { name: string; notation: string };

const INLINE_CODE = /`([^`\n]+)`/g;
/** A heading the roll section may carry: where "Salvar" files a roll when the note has one. */
const SECTION = /^#{1,6}\s*(rolagens|rolls|saved rolls|rolagens salvas)\s*#*\s*$/i;

/** A line's words with the dice codes taken out and its list, task, quote
 *  and heading markers and trailing colon or dash gone. */
function wordsOf(line: string, codes: string[]): string {
  let text = line;
  for (const c of codes) text = text.replace(c, " ");
  // A table row: its cells that hold no code are the name.
  if (/^\s*\|/.test(text)) text = text.split("|").map((s) => s.trim()).filter((s) => s !== "" && !/^:?-{2,}:?$/.test(s)).join(" ");
  text = text
    .replace(/^\s*(?:>\s*)*/, "")
    .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.replace(/\s*[:：\-–—]+$/, "").trim();
}

/** The saved rolls of a note's lines, in order. A line with a dice code is
 *  named by its words; a line of only the code, by its notation. A table roll
 *  (`dice: [[Note^id]]`) is not listed: the tray rolls a notation. Code in a
 *  fenced block is code. A repeat of the same name and notation is listed once. */
export function savedRollsOf(lines: readonly string[]): SavedRoll[] {
  const out: SavedRoll[] = [];
  const seen = new Set<string>();
  let fence: string | null = null;
  for (const line of lines) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      const mark = f[1]!;
      if (fence === null) fence = mark[0]!;
      else if (mark[0] === fence) fence = null;
      continue;
    }
    if (fence !== null || !line.includes("dice:")) continue;
    const found: { whole: string; notation: string }[] = [];
    for (const m of line.matchAll(INLINE_CODE)) {
      const code = readCode(m[1]!);
      if (code?.kind === "roll") found.push({ whole: m[0], notation: code.notation });
    }
    if (found.length === 0) continue;
    // Several codes: the words before the first one are the line's name.
    const words = found.length > 1 ? wordsOf(line.slice(0, line.indexOf(found[0]!.whole)), []) : wordsOf(line, [found[0]!.whole]);
    for (const c of found) {
      // Several codes on one line share the words before the first: the notation tells them apart.
      const name = words === "" ? c.notation : found.length > 1 ? `${words} ${c.notation}` : words;
      const key = `${name}\n${c.notation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, notation: c.notation });
    }
  }
  return out;
}

/** The Markdown line "Salvar" writes: a list item, name and code. A name is
 *  one line, with no backtick (it could close the code) and no pipe. */
export function rollLine(name: string, notation: string): string {
  const clean = name.replace(/[`|\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/[:：]+$/, "").trim();
  return clean === "" ? `- \`dice: ${notation}\`` : `- ${clean}: \`dice: ${notation}\``;
}

/** `text` with `line` filed in it: at the end of the note's "Rolagens" /
 *  "Rolls" section when it has one, else at the end of the note, right after
 *  a closing list of rolls and after a blank line otherwise. Nothing else
 *  changes: line endings and spacing stay as the note has them. */
export function addRollLine(text: string, line: string): string {
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  // The text ends its last line: the split's empty tail is not a line.
  const tail = lines.length > 0 && lines[lines.length - 1] === "" ? 1 : 0;
  const body = lines.slice(0, lines.length - tail);
  let at = body.length;
  const start = body.findIndex((l) => SECTION.test(l.trim()));
  if (start >= 0) {
    const level = /^#+/.exec(body[start]!.trim())![0].length;
    let end = body.length;
    for (let i = start + 1; i < body.length; i++) {
      const m = /^(#{1,6})\s/.exec(body[i]!);
      if (m && m[1]!.length <= level) {
        end = i;
        break;
      }
    }
    at = end;
  }
  let last = at - 1;
  while (last >= 0 && body[last]!.trim() === "") last--;
  const afterList = last >= 0 && /^\s*(?:[-*+]|\d+[.)])\s/.test(body[last]!) && (start >= 0 || body[last]!.includes("dice:"));
  // After a list of rolls the line joins the list; after anything else it stands apart.
  const spacer = !afterList && last >= 0 ? [""] : [];
  const next = [...body.slice(0, last + 1), ...spacer, line, ...body.slice(last + 1)];
  return next.join(eol) + eol;
}
