// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A folder note's `order:` list rewritten when its notes move: the harness's
// copy of the core's YAML quoting and list editing (split out of core.ts, ADR 0067).

import YAML from "yaml";

const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const stripMd = (p: string): string => p.replace(/\.md$/i, "");

/** The core's `needs_yaml_quote` and `yaml_scalar`. */
function yamlScalar(s: string): string {
  const lower = s.toLowerCase();
  const quote =
    s === "" ||
    "-?:,[]{}#&*!|>'\"%@`~".includes(s[0] ?? "") ||
    /^\s|\s$/.test(s) ||
    s.includes(": ") ||
    s.endsWith(":") ||
    s.includes(" #") ||
    /[\t\n\r"\\]/.test(s) ||
    ["true", "false", "yes", "no", "on", "off", "y", "n", "null"].includes(lower) ||
    (s.trim() !== "" && !Number.isNaN(Number(s))) ||
    /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ||
    /^(inf|infinity|nan)$/i.test(s) ||
    s.startsWith("0x") ||
    s.startsWith("0o");
  return quote ? JSON.stringify(s) : s;
}
/** The text of an item of a YAML block sequence, as the core reads it. */
function yamlItemText(raw: string): string | null {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return null;
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) return raw.slice(1, -1).replace(/''/g, "'");
  if (raw === "" || /^[[{\-&*!|>]/.test(raw)) return null;
  return raw;
}
/** The core's `rewrite_order`: the `order:` of the folder note of `folder`
 *  after a move, only the moved items' lines changed; null when none is. */
export function rewriteOrder(text: string, folder: string, newFolder: string, moved: [string, string, boolean][]): string | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n(---|\.\.\.)\s*(\r?\n|$)/.exec(text);
  if (!m) return null;
  const lines = text.split(/(?<=\n)/);
  type Item = { line: number; text: string | null; raw: string; lead: string; rest: string };
  const items: Item[] = [];
  let inFm = false;
  let inOrder = false;
  for (let i = 0; i < lines.length; i++) {
    const body = (lines[i] ?? "").replace(/\r?\n$/, "");
    if (i === 0) {
      inFm = body === "---";
      continue;
    }
    if (!inFm) break;
    if (body.startsWith("---") || body.startsWith("...")) break;
    const key = /^([^\s#\-][^:]*):(.*)$/.exec(body);
    if (key) {
      if (inOrder) break;
      if ((key[1] ?? "").trim() === "order") {
        const after = (key[2] ?? "").trim();
        if (after && !after.startsWith("#")) return null;
        inOrder = true;
      }
      continue;
    }
    if (!inOrder) continue;
    const item = /^(\s*-[ \t]+)(.*)$/.exec(body);
    if (!item) continue;
    const rest = item[2] ?? "";
    const raw = /^["']/.test(rest) ? rest.trimEnd() : rest.split(" #")[0]!.trimEnd();
    items.push({ line: i, text: yamlItemText(raw), raw, lead: item[1] ?? "", rest: rest.slice(raw.length) });
  }
  const edits = new Map<number, string | null>();
  for (const [oldPath, newPath, note] of moved) {
    if (dirOf(oldPath) !== folder) continue;
    const oldRel = baseOf(oldPath);
    const newRel = dirOf(newPath) === newFolder ? baseOf(newPath) : null;
    if (newRel === oldRel) continue;
    let index = items.findIndex((it, k) => !edits.has(k) && it.text === oldRel);
    let bare = false;
    if (index < 0 && note) {
      index = items.findIndex((it, k) => !edits.has(k) && it.text === stripMd(oldRel));
      bare = true;
    }
    if (index < 0) continue;
    edits.set(index, newRel === null ? null : bare ? stripMd(newRel) : newRel);
  }
  if (edits.size === 0) return null;
  for (const [k, value] of edits) {
    const it = items[k]!;
    const eol = /\r?\n$/.exec(lines[it.line] ?? "")?.[0] ?? "";
    lines[it.line] = value === null ? "" : `${it.lead}${yamlScalar(value)}${it.rest}${eol}`;
  }
  return lines.join("");
}
