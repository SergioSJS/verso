// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The catalogue of themes Verso ships (ADR 0109 item 8): the
// `.verso-theme` files of `app/ui/themes/catalogue/`, copied into the build
// by build-catalogue.mjs with an index of their names. Each is read by the
// reader an imported file goes through (file.ts), and applied through the
// same vet as an import (actions.ts): a shipped theme is never more
// powerful than one a person imports. A file that does not read is left
// out, never half-shown.

import { asset } from "../version";
import { parseThemeText, type Theme } from "./file";

export type CatalogueEntry = { file: string; text: string; theme: Theme };

/** The index and the files, read through `read` (a path relative to the
 *  catalogue's folder, to its text). Pure but for `read`, so a test can
 *  hand it the folder's files. */
export async function readCatalogue(read: (file: string) => Promise<string>): Promise<CatalogueEntry[]> {
  let names: unknown;
  try {
    names = JSON.parse(await read("index.json"));
  } catch {
    return [];
  }
  if (!Array.isArray(names)) return [];
  const out: CatalogueEntry[] = [];
  const seen = new Set<string>();
  for (const file of names) {
    if (typeof file !== "string" || !/^[a-z0-9][a-z0-9-]*\.verso-theme$/.test(file)) continue;
    let text: string;
    try {
      text = await read(file);
    } catch {
      continue;
    }
    const parsed = parseThemeText(text);
    if (!parsed.ok) continue;
    const key = parsed.theme.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, text, theme: parsed.theme });
  }
  return out;
}

let loaded: Promise<CatalogueEntry[]> | null = null;

/** The catalogue, read once from the build. A failed read is tried again next time. */
export function loadCatalogue(): Promise<CatalogueEntry[]> {
  loaded ??= readCatalogue(async (file) => {
    const r = await fetch(asset(`themes/catalogue/${file}`));
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    return r.text();
  }).then((list) => {
    if (list.length === 0) loaded = null;
    return list;
  });
  return loaded;
}

const plain = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** What the "More themes" window filters by: a search over the name and the
 *  credit's theme and author, a mode ("" for all) and a surface ("" for all). */
export type Filters = { query: string; mode: string; surface: string };

/** Whether a card (a name and, for a file, its theme) passes the filters. A
 *  theme of Verso's own has no file: it is both modes, tonal. */
export function matches(card: { name: string; theme?: Theme }, f: Filters): boolean {
  const mode = card.theme?.mode ?? "both";
  const surface = card.theme?.style?.["surface-mode"] ?? "tonal";
  if (f.mode !== "" && mode !== f.mode) return false;
  if (f.surface !== "" && surface !== f.surface) return false;
  const q = plain(f.query.trim());
  if (q === "") return true;
  const c = card.theme?.inspiredBy;
  return plain([card.name, c?.theme ?? "", c?.author ?? ""].join(" ")).includes(q);
}
