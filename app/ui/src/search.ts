// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "./bindings";
import { h, ui } from "./dom";
import { fail } from "./errors";
import { allNotes } from "./folder";
import { dirOf, name } from "./paths";
import { t } from "./strings";
import { cleanSnippet } from "./snippet";
import { syncRoving } from "./tree/aria";
import { fileRow, listAll, restoreTreeFocus, treeFocus } from "./tree/tree";

export function snippetNode(snippet: string): HTMLSpanElement {
  const s = h("span", "snippet");
  for (const part of cleanSnippet(snippet).split(/(\[[^\]]*\])/)) {
    if (part.startsWith("[") && part.endsWith("]")) s.append(h("mark", "", part.slice(1, -1)));
    else s.append(part);
  }
  return s;
}
/** Search: every word must occur; `tag:x`, `type:t`, `path:p` and
 *  `file:f` narrow the result (a tag matches itself and its nested tags;
 *  a type is compared as a type's name, case ignored). */
export async function searchNotes(words: string): Promise<void> {
  if (words.trim() === "") return listAll();
  const tags: string[] = [];
  const types: string[] = [];
  const paths: string[] = [];
  const files: string[] = [];
  const rest: string[] = [];
  for (const tok of words.trim().split(/\s+/)) {
    const m = /^(tag|type|path|file):(.+)$/i.exec(tok);
    if (!m) rest.push(tok);
    else if (m[1]!.toLowerCase() === "tag") tags.push(m[2]!.replace(/^#/, "").toLowerCase());
    else if (m[1]!.toLowerCase() === "type") types.push(m[2]!);
    else if (m[1]!.toLowerCase() === "path") paths.push(m[2]!.toLowerCase());
    else files.push(m[2]!.toLowerCase());
  }
  let hits: { path: string; snippet: string }[];
  if (rest.length > 0) {
    const r = await commands.search(rest.join(" "), 200);
    if (r.status !== "ok") return fail(r.error);
    hits = r.data;
  } else hits = allNotes.map((p) => ({ path: p, snippet: "" }));
  if (tags.length > 0) {
    const r = await commands.listTags();
    if (r.status !== "ok") return fail(r.error);
    const allowed = new Set<string>();
    for (const tg of r.data) {
      const n = tg.name.toLowerCase();
      if (tags.some((want) => n === want || n.startsWith(`${want}/`))) for (const p of tg.notes) allowed.add(p);
    }
    hits = hits.filter((hit) => allowed.has(hit.path));
  }
  // `type:npc` (ADR 0052): the notes whose `type:` is that name, case
  // ignored — the core folds it as it folds a type's name.
  for (const name of types) {
    const r = await commands.notesOfType(name);
    if (r.status !== "ok") return fail(r.error);
    const of = new Set(r.data);
    hits = hits.filter((hit) => of.has(hit.path));
  }
  if (paths.length > 0) hits = hits.filter((hit) => paths.every((p) => hit.path.toLowerCase().includes(p)));
  if (files.length > 0) hits = hits.filter((hit) => files.every((f) => name(hit.path).toLowerCase().includes(f)));
  hits = hits.slice(0, 200);
  const was = treeFocus();
  ui.notes.className = "list";
  ui.notes.replaceChildren(
    ...hits.map((hit, at) =>
      fileRow(hit.path, (b) => {
        b.setAttribute("aria-setsize", String(hits.length));
        b.setAttribute("aria-posinset", String(at + 1));
        const label = b.querySelector(".row-name");
        if (label && /\.md$/i.test(hit.path) && label.textContent === (hit.path.split("/").pop() ?? hit.path)) label.textContent = name(hit.path);
        if (dirOf(hit.path)) b.append(h("span", "path", dirOf(hit.path)));
        if (cleanSnippet(hit.snippet) !== "") b.append(snippetNode(hit.snippet));
      }),
    ),
  );
  syncRoving();
  restoreTreeFocus(was);
  ui.status.textContent = t.hits(hits.length);
}
