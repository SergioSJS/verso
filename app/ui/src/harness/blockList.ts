// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// `list_block_ids` in the browser harness (ADR 0102 item 3): every block
// with an `^id` of the folder's notes, with its kind and a short label. The
// real answer is the index's (crates/verso-index, `block_list.rs`); this is
// the same rules over the harness's notes: the kind from the block's first
// line, the label the heading above or the first line, the last of a
// repeated id, bounded.

import type { BlockKind, FolderBlock, FolderBlocks } from "../bindings";
import { blocksOf, headingsOf } from "./markdown";

const MOST = 5000;
const LABEL_MOST = 80;

const marker = /^([-*+]|\d{1,9}[.)])[ \t]/;
const heading = /^#{1,6}[ \t]/;

function kindOf(first: string, next: string): BlockKind {
  const t = first.trimStart();
  if (t.startsWith("|") || (t.includes("|") && /^[|:\- ]+$/.test(next.trim()) && next.includes("-") && next.includes("|"))) return "table";
  if (t.startsWith("```") || t.startsWith("~~~")) return "code";
  if (heading.test(t)) return "heading";
  if (t.startsWith(">")) return "quote";
  return marker.test(t) ? "list" : "paragraph";
}

function short(text: string): string {
  const t = text.trim();
  const chars = [...t];
  return chars.length <= LABEL_MOST ? t : `${chars.slice(0, LABEL_MOST - 1).join("").trimEnd()}…`;
}

function firstLineLabel(line: string): string {
  let t = line.trim();
  const m = marker.exec(t);
  if (m) t = t.slice(m[0].length).trimStart();
  else if (heading.test(t)) t = t.replace(/^#+/, "").trimStart();
  else if (t.startsWith(">")) t = t.slice(1).trimStart();
  t = t.replace(/^\|+|\|+$/g, "").trim().replace(/ \^\S+$/, "");
  return short(t);
}

/** The blocks of `paths`, by path then position; `kinds` empty: all. */
export function folderBlocks(paths: readonly string[], textOf: (path: string) => string, kinds: readonly BlockKind[]): FolderBlocks {
  const blocks: FolderBlock[] = [];
  let truncated = false;
  for (const path of [...paths].sort()) {
    const text = textOf(path);
    const lines = text.split(/\r?\n/);
    const heads = headingsOf(text);
    const own = blocksOf(text);
    own.forEach((b, i) => {
      if (truncated || own.slice(i + 1).some((o) => o.id === b.id)) return;
      const first = lines[b.first_line - 1] ?? "";
      const kind = kindOf(first, lines[b.first_line] ?? "");
      if (kinds.length > 0 && !kinds.includes(kind)) return;
      if (blocks.length >= MOST) {
        truncated = true;
        return;
      }
      const above = [...heads].reverse().find((h) => h.line < b.first_line);
      const under = kind !== "heading" && above !== undefined;
      const body = lines.slice(b.first_line - 1, b.last_line).filter((l) => l.trim() !== "" && !/^\s*\^\S+\s*$/.test(l));
      const items = kind === "list" ? body.filter((l) => marker.test(l)) : [];
      const rows = kind === "table" ? Math.max(0, body.length - 2) : items.length;
      const tasks = items.some((l) => /^\S+[ \t]+\[[ xX]\]/.test(l));
      blocks.push({ path, id: b.id, kind, label: under && above ? short(above.text) : firstLineLabel(first), under_heading: under, rows, tasks });
    });
    if (truncated) break;
  }
  return { blocks, truncated };
}
