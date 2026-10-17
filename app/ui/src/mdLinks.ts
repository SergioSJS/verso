// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A Markdown link to a note or a file of the open folder, in a reading —
// `[x](nota.md)`, `[x](pasta/nota.md#Título)` (ADR 0085; P1, answered by
// the maintainer on 2026-10-14). The core writes it as `<a href="…">`,
// and the sanitizer keeps only web, mail and same-page addresses
// (sanitize.ts, `address`): the link was neither followed nor previewed.
// Before the HTML is cleaned, such a link that names a file of the folder
// is drawn the way the core draws a wikilink — `class="wikilink"`,
// `data-target` the file's path from the root with its heading or `^id` —
// and its `href` goes. The sanitizer's policy does not change, and it
// still cleans all of it after. An address with a scheme, one that starts
// at `/`, climbs out of the folder with `..`, holds a backslash or names
// no file of the folder keeps its `href`, and is dropped as before.

import { dirOf } from "./paths";

/** How a path names a note or a file, by the folder's rule (resolve.ts). */
export type Resolvers = {
  note: (target: string, from: string) => string | null;
  file: (target: string, from: string) => string | null;
};

/** An `<a>` whose address has no scheme and is not `#…` or `/…`: only
 *  then is the HTML parsed here. */
const RELATIVE = /<a\s[^>]*href\s*=\s*["']?(?![a-z][a-z0-9+.-]*:|#|\/)/i;

/** The link's target as a wikilink's, or null when it names no file of
 *  the folder. */
export function noteTarget(href: string, from: string, resolve: Resolvers): string | null {
  const raw = href.trim();
  if (raw === "" || raw.startsWith("#") || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  const hash = raw.indexOf("#");
  let path: string;
  let frag: string;
  try {
    path = decodeURIComponent(hash < 0 ? raw : raw.slice(0, hash));
    frag = hash < 0 ? "" : decodeURIComponent(raw.slice(hash + 1));
  } catch {
    return null;
  }
  if (path === "" || path.includes("\\") || path.startsWith("/") || /^[a-z]:/i.test(path)) return null;
  // Never past the folder's root.
  let depth = dirOf(from).split("/").filter(Boolean).length;
  for (const seg of path.split("/")) {
    if (seg === "..") depth -= 1;
    else if (seg !== "" && seg !== ".") depth += 1;
    if (depth < 0) return null;
  }
  const note = /\.md$/i.test(path) || !/\.[^/.]+$/.test(path);
  const to = note ? resolve.note(path, from) : resolve.file(path, from);
  if (!to) return null;
  const named = note ? to.replace(/\.md$/i, "") : to;
  return frag ? `${named}#${frag}` : named;
}

/** `html`, the core's reading of the note at `from`, with its Markdown
 *  links to the folder's files drawn as wikilinks; the same string when
 *  there are none. */
export function markdownNoteLinks(html: string, from: string, resolve: Resolvers): string {
  if (!html || !RELATIVE.test(html)) return html;
  const body = new DOMParser().parseFromString(html, "text/html").body;
  let changed = false;
  for (const a of Array.from(body.querySelectorAll("a[href]"))) {
    if (a.classList.contains("wikilink")) continue;
    const target = noteTarget(a.getAttribute("href") ?? "", from, resolve);
    if (target === null) continue;
    a.removeAttribute("href");
    a.classList.add("wikilink");
    a.setAttribute("data-target", target);
    changed = true;
  }
  return changed ? body.innerHTML : html;
}
