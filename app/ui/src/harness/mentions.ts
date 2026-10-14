// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's answer to `unlinked_mentions` (ADR 0089 item 1): a note's
// name, or one of its aliases, as a phrase on word boundaries, case
// ignored and accents kept, outside the frontmatter, code, comments,
// links, embeds and tags. An approximation line by line, as the rest of
// the harness's Markdown; the rule itself is the core's
// (`verso-core/src/mentions.rs`, `verso_dialect::prose`), tested there.

import type { ContractError, Mention, Mentions } from "../bindings";
import { frontmatterOf, propertiesOf, readableLines } from "./markdown";

const WORDY = /[\p{L}\p{N}_]/u;
const AROUND = 60;

function blank(s: string): string {
  return " ".repeat(s.length);
}

/** The line with what is not prose blanked, its length kept. */
function prose(line: string): string {
  return line
    .replace(/!?\[\[[^\]\n]*\]\]/g, blank)
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, blank)
    .replace(/(^|\s)(#[\p{L}\p{N}_/-]+)/gu, (_s, lead: string, tag: string) => lead + blank(tag));
}

function chars(s: string): string[] {
  return Array.from(s);
}

/** The unlinked mentions of the note at `target` among `notes`, read by
 *  `read` (null: not there). */
export function unlinkedMentions(target: string, notes: string[], read: (path: string) => string | null): Mentions {
  const own = read(target);
  if (own === null) {
    const error: ContractError = { kind: "not_found", message: `no such file: ${target}` };
    throw error;
  }
  const stem = (target.split("/").pop() ?? target).replace(/\.md$/i, "");
  const names = [{ text: stem, alias: false }];
  const aliases = propertiesOf(own)["aliases"];
  for (const a of Array.isArray(aliases) ? aliases : aliases === undefined || aliases === null ? [] : [aliases]) {
    const text = String(a).trim();
    if (text && !names.some((n) => n.text.toLowerCase() === text.toLowerCase())) names.push({ text, alias: true });
  }
  names.sort((a, b) => chars(b.text).length - chars(a.text).length);
  const out: Mention[] = [];
  for (const path of notes) {
    if (path === target) continue;
    const text = read(path);
    if (text === null) continue;
    const lines = readableLines(text);
    const { bodyLine } = frontmatterOf(text);
    const raw = text.split("\n");
    let secret = false;
    lines.forEach((readable, i) => {
      const line = raw[i] ?? "";
      if (/^\s*>\s*\[!secret\]/i.test(line)) secret = true;
      else if (!/^\s*>/.test(line)) secret = false;
      if (i < bodyLine) return;
      const masked = prose(readable);
      const table = /^\s*\|/.test(line);
      let at = 0;
      while (at < masked.length) {
        const prev = masked[at - 1] ?? "";
        const hit = names.find((n) => {
          const end = at + n.text.length;
          if (masked.slice(at, end).toLowerCase() !== n.text.toLowerCase()) return false;
          if (WORDY.test(n.text[0] ?? "") && WORDY.test(prev)) return false;
          return !(WORDY.test(n.text[n.text.length - 1] ?? "") && WORDY.test(masked[end] ?? ""));
        });
        if (!hit) {
          at++;
          continue;
        }
        const end = at + hit.text.length;
        const head = chars(line.slice(0, at));
        const tail = chars(line.slice(end).replace(/\r$/, ""));
        out.push({ path, line: i + 1, col: head.length + 1, text: line.slice(at, end), before: head.slice(-AROUND).join(""), after: tail.slice(0, AROUND).join(""), alias: hit.alias, table, secret });
        at = end;
      }
    });
  }
  return { mentions: out, more: false };
}
