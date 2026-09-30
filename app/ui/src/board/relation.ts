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

function unquoted(raw: string): string {
  const s = raw.trim();
  if (/^".*"$/.test(s)) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return /^'.*'$/.test(s) ? s.slice(1, -1).replaceAll("''", "'") : s;
}

/** Whether `key` is a key a relation can have: a plain top-level key. */
export function relationKeyOk(key: string): boolean {
  const k = key.trim();
  return k !== "" && !k.includes(":") && !/^[#\-\s]/.test(k) && !/[\r\n]/.test(k);
}

/** `doc` with `link` (`[[Target]]`) under `key`, or the same text when the
 *  relation is already there; null when the key's value is of a shape the
 *  panel does not rewrite (a mapping, a nested list). */
export function withRelation(doc: string, key: string, link: string): string | null {
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
    // One value on the key's line: the key becomes a list of the two.
    const old = unquoted(existing.slice(existing.indexOf(":") + 1));
    if (old === "") return null;
    const removed = propertyChange(doc, key, { op: "remove" });
    if (!("change" in removed)) return null;
    const bare = applied(doc, removed.change);
    const created = propertyChange(bare, key, { op: "create" });
    if (!("change" in created)) return null;
    const empty = applied(bare, created.change);
    const both = propertyChange(empty, key, { op: "add", values: [old, link] });
    return "change" in both ? applied(empty, both.change) : null;
  }
  return null;
}

/** The wikilink a relation writes to `target` (a path with `.md`): the bare
 *  name when no other note has it, else the path — as a link written by
 *  hand would have to be to reach the same note (spec Q12). */
export function linkTo(target: string, notes: readonly string[]): string {
  const bare = (target.split("/").pop() ?? target).replace(/\.md$/, "");
  const key = (name: string): string => name.normalize("NFC").toLowerCase();
  const same = notes.filter((n) => key((n.split("/").pop() ?? n).replace(/\.md$/, "")) === key(bare));
  return same.length > 1 ? `[[${target.replace(/\.md$/, "")}]]` : `[[${bare}]]`;
}
