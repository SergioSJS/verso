// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { allFiles, allNotes } from "./folder";
import { markdownNoteLinks } from "./mdLinks";
import { dirOf, kindOf, name } from "./paths";
import { settings } from "./settings";

/** The note a link target names, for a link typed a moment ago and not
 *  indexed yet: the index's own order (verso-index, `RESOLVE` in store.rs
 *  and keys.rs; spec Q12, provisional) applied to the note list — the
 *  target as a path from the root, then from the source note's folder
 *  (`..` walked, never past the root), then as a bare name: under the
 *  source's folder first, then the fewest segments, then byte order. Case
 *  and a final `.md` do not matter; both sides compare in NFC. */
export function resolveNoteByName(target: string, from: string): string | null {
  const written = target.trim();
  if (written === "" || written.endsWith("/")) return null;
  const strip = (s: string) => (s.toLowerCase().endsWith(".md") ? s.slice(0, -3) : s);
  const fold = (s: string) => s.normalize("NFC").toLowerCase();
  const bytes = (a: string, b: string) => {
    // UTF-8 byte order is code point order.
    const x = Array.from(a);
    const y = Array.from(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0);
      if (d !== 0) return d;
    }
    return x.length - y.length;
  };
  const stripped = strip(written);
  if (stripped === "") return null;
  const key = fold(stripped);
  const byPath = (k: string) => allNotes.filter((p) => fold(strip(p)) === k).sort(bytes)[0] ?? null;
  const fromRoot = byPath(key);
  if (fromRoot) return fromRoot;
  const parts = dirOf(from).split("/").filter(Boolean);
  let outside = false;
  for (const seg of stripped.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") parts.push(seg);
    else if (parts.pop() === undefined) outside = true;
  }
  const rel = fold(parts.join("/"));
  if (!outside && rel !== "" && rel !== key) {
    const fromHere = byPath(rel);
    if (fromHere) return fromHere;
  }
  const home = dirOf(from);
  const under = (p: string) => home === "" || p.startsWith(`${home}/`);
  const segments = (p: string) => p.split("/").length;
  const named = allNotes.filter((p) => fold(strip(p.split("/").pop() ?? p)) === key);
  named.sort((a, b) => Number(under(b)) - Number(under(a)) || segments(a) - segments(b) || bytes(a, b));
  return named[0] ?? null;
}
/** The file (not a note) an embed names, by the rule `resolveNoteByName`
 *  applies to notes — the core's `resolve_file`: a path from the root,
 *  then from the note's folder, then a bare file name, extension or not,
 *  under the note's folder first, then the fewest segments, then byte
 *  order. */
export function resolveFileByName(target: string, from: string): string | null {
  const written = target.trim();
  if (written === "" || written.endsWith("/")) return null;
  const fold = (s: string) => s.normalize("NFC").toLowerCase();
  const matches = (p: string, key: string) => {
    const f = fold(p);
    const dot = f.lastIndexOf(".");
    return f === key || (dot > 0 && f.slice(0, dot) === key);
  };
  const first = (list: string[]) => list.slice().sort(byteOrder)[0] ?? null;
  const key = fold(written);
  const fromRoot = first(allFiles.filter((p) => matches(p, key)));
  if (fromRoot) return fromRoot;
  const parts = dirOf(from).split("/").filter(Boolean);
  for (const seg of written.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") parts.push(seg);
    else if (parts.pop() === undefined) return null;
  }
  const rel = fold(parts.join("/"));
  if (rel !== key) {
    const fromHere = first(allFiles.filter((p) => matches(p, rel)));
    if (fromHere) return fromHere;
  }
  if (written.includes("/")) return null;
  const home = dirOf(from);
  const under = (p: string) => home === "" || p.startsWith(`${home}/`);
  const segments = (p: string) => p.split("/").length;
  const named = allFiles.filter((p) => matches(p.split("/").pop() ?? p, key));
  named.sort((a, b) => Number(under(b)) - Number(under(a)) || segments(a) - segments(b) || byteOrder(a, b));
  return named[0] ?? null;
}
/** UTF-8 byte order, which is code point order. */
export function byteOrder(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}
/** The text a link the window writes gives for `target`, written in the
 *  note at `source`, by the "new link format" setting: the bare name when
 *  that reaches `target` (else the path from the root); the path relative
 *  to the note's folder, as `./…` or `../…` so that no path from the root
 *  can take it (Obsidian reads both the same way); or the path from the
 *  root. A note loses `.md`; any other file keeps its extension. */
export function linkText(source: string, target: string): string {
  const note = kindOf(target) === "note";
  const full = note ? target.replace(/\.md$/i, "") : target;
  if (settings.linkFormat === "root") return full;
  if (settings.linkFormat === "relative") {
    const from = dirOf(source).split("/").filter(Boolean);
    const to = full.split("/");
    let same = 0;
    while (same < from.length && same < to.length - 1 && from[same] === to[same]) same++;
    const up = from.length - same;
    return [...(up === 0 ? ["."] : Array<string>(up).fill("..")), ...to.slice(same)].join("/");
  }
  const bare = note ? name(target) : target.split("/").pop() ?? target;
  const reaches = note ? resolveNoteByName(bare, source) : resolveFileByName(bare, source);
  return reaches === target ? bare : full;
}
/** Keep only the section under `heading`: the heading and what follows
 *  it until the next heading of the same or a higher level. */
export function sliceHeading(body: HTMLElement, heading: string): void {
  const want = heading.trim().toLowerCase();
  const start = Array.from(body.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).find((el) => (el.textContent ?? "").trim().toLowerCase() === want);
  if (!start) return;
  const level = Number(start.tagName.slice(1));
  const keep: Element[] = [start];
  let el = start.nextElementSibling;
  while (el && !(/^H[1-6]$/.test(el.tagName) && Number(el.tagName.slice(1)) <= level)) {
    keep.push(el);
    el = el.nextElementSibling;
  }
  body.replaceChildren(...keep);
}

/** What a typed note's `link` or `image` field offers (ADR 0086 item 1),
 *  as `[[` does: the folder's notes, or its pictures, each as the link
 *  `source` would write to it (the link format setting), labelled with
 *  its path. */
export function propertySuggestions(source: string, kind: "link" | "image"): { value: string; label: string }[] {
  const paths = kind === "link" ? allNotes : allFiles.filter((p) => kindOf(p) === "image");
  return paths.map((p) => ({ value: `[[${linkText(source, p)}]]`, label: p }));
}

/** The core's HTML of the note at `from`, its Markdown links to the
 *  folder's notes and files drawn as wikilinks (mdLinks.ts), by the rule
 *  above; cleaned after, by the sanitizer, as any reading. */
export function withNoteLinks(html: string, from: string): string {
  return markdownNoteLinks(html, from, { note: resolveNoteByName, file: resolveFileByName });
}
