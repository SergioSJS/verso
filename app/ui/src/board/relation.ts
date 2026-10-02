// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A typed relation written into a note (spec Q10, ADR 0057 point 4): the
// property `key` of the source note holds a quoted wikilink to the target —
// `aliado: "[[Barão]]"` — or, when the key already holds one or a list, the
// list gains it. Only that key's lines change (the properties panel's own
// edit, `propertyChange`); the caller shows the result as a diff before
// anything is written.

import { keyText, propertyChange, type Change } from "../props";

function applied(doc: string, c: Change): string {
  return doc.slice(0, c.from) + c.insert + doc.slice(c.to);
}

/** Whether `key` is a key a relation can have: a plain top-level key. */
export function relationKeyOk(key: string): boolean {
  const k = key.trim();
  return k !== "" && !k.includes(":") && !/^[#\-\s]/.test(k) && !/[\r\n]/.test(k);
}

/** `doc` with `link` (`[[Target]]`) under `key`, or the same text when the
 *  relation is already there; null when the key's value is of a shape the
 *  panel does not rewrite (a mapping, a nested list). */
export function withRelation(doc: string, asked: string, link: string): string | null {
  // A key the note already writes in another case is that key (`Aliado:`
  // for `aliado`): the relation joins it instead of opening a second one.
  const key = writtenKey(doc, asked) ?? asked;
  const existing = keyText(doc, key);
  if (existing !== null && existing.includes(link)) return doc;
  const add = propertyChange(doc, key, { op: "add", values: [link] });
  if ("change" in add) return applied(doc, add.change);
  if (add.refused === "changed") {
    const created = propertyChange(doc, key, { op: "create" });
    if (!("change" in created)) return null;
    const fresh = applied(doc, created.change);
    const set = propertyChange(fresh, key, { op: "set", value: { kind: "text", value: link } });
    return "change" in set ? applied(fresh, set.change) : null;
  }
  if (add.refused === "fixed" && existing !== null && !existing.includes("\n")) {
    // One value on the key's line: the line becomes a list of the two, in
    // its place — the value as it was written, then the link.
    const raw = existing.slice(existing.indexOf(":") + 1).trim();
    if (raw === "") return null;
    const fm = /^---\r?\n/.exec(doc);
    const at = fm ? doc.indexOf(existing, fm[0].length) : -1;
    if (at < 0) return null;
    const eol = doc.includes("\r\n") ? "\r\n" : "\n";
    const name = existing.slice(0, existing.indexOf(":"));
    return doc.slice(0, at) + `${name}:${eol}  - ${raw}${eol}  - "${link}"` + doc.slice(at + existing.length);
  }
  return null;
}

/** The top-level key of `doc`'s frontmatter that is `key` but for case,
 *  as written; null when there is none. */
function writtenKey(doc: string, key: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(doc);
  if (!fm) return null;
  const want = key.trim().normalize("NFC").toLowerCase();
  for (const line of (fm[1] ?? "").split(/\r?\n/)) {
    const m = /^([^\s#\-:][^:]*?)\s*:/.exec(line);
    if (m && m[1]!.normalize("NFC").toLowerCase() === want) return m[1]!;
  }
  return null;
}

/** The wikilink a relation writes to `target` (a path with `.md`): the bare
 *  name when no other note has it, else the path — as a link written by
 *  hand would have to be to reach the same note (spec Q12). Null when no
 *  link can name it: `|`, `#`, `^` or `]]` in its name would be read as an
 *  alias, a heading, a block or the link's end (review `board.md`,
 *  reading 2, finding 9). */
export function linkTo(target: string, notes: readonly string[]): string | null {
  if (/[|#^]|\]\]|\[\[/.test(target)) return null;
  const bare = (target.split("/").pop() ?? target).replace(/\.md$/, "");
  const key = (name: string): string => name.normalize("NFC").toLowerCase();
  const same = notes.filter((n) => key((n.split("/").pop() ?? n).replace(/\.md$/, "")) === key(bare));
  return same.length > 1 ? `[[${target.replace(/\.md$/, "")}]]` : `[[${bare}]]`;
}
