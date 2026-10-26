// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The person's saved looks (ADR 0100 items 3 and 4): a named list kept in
// the person's settings, per device — and, on a server, with the account,
// as every setting is (web/settingsSync.ts). Pure list operations: the
// settings hold the list, this decides what the list may become.

import { readTheme, type Theme, themeObject } from "./file";
import { NAME_MOST, PROFILES_MOST } from "./tokens";
import { W } from "./strings";

export type Profile = { name: string; theme: Theme };
export type Change = { ok: true; list: Profile[]; name: string } | { ok: false; why: string };

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The profiles a settings file holds, each read again as a theme file is:
 *  one that does not pass is dropped, never half-applied. */
export function readProfiles(raw: unknown): Profile[] {
  if (!Array.isArray(raw)) return [];
  const out: Profile[] = [];
  for (const item of raw) {
    if (out.length >= PROFILES_MOST) break;
    if (item === null || typeof item !== "object") continue;
    const parsed = readTheme({ "verso-theme": 1, tokensVersion: 1, ...themeObject((item as { theme: Theme }).theme ?? ({} as Theme)) });
    if (!parsed.ok) continue;
    if (out.some((p) => same(p.name, parsed.theme.name))) continue;
    out.push({ name: parsed.theme.name, theme: parsed.theme });
  }
  return out;
}

/** What is stored for a profile list (`readProfiles` reads it back). */
export function storable(list: Profile[]): { name: string; theme: Theme }[] {
  return list.map((p) => ({ name: p.name, theme: { ...p.theme, name: p.name } }));
}

/** `base`, or `base 2`, `base 3`… when the list already holds that name. */
export function uniqueName(list: Profile[], base: string): string {
  const root = [...base.trim()].slice(0, NAME_MOST - 3).join("") || W.defaultName;
  if (![...list].some((p) => same(p.name, root))) return root;
  for (let n = 2; ; n++) {
    const name = `${root} ${n}`;
    if (!list.some((p) => same(p.name, name))) return name;
  }
}

function checkName(name: string): string | null {
  const n = name.trim();
  // eslint-disable-next-line no-control-regex
  if (n.length === 0 || [...n].length > NAME_MOST || /[\u0000-\u001f\u007f]/.test(n)) return W.profiles.badName(NAME_MOST);
  return null;
}

/** Save `theme` under `name`: a new profile, or the one of that name
 *  replaced (`replace`). A full list refuses a new one. */
export function saveAs(list: Profile[], name: string, theme: Theme, replace = false): Change {
  const bad = checkName(name);
  if (bad) return { ok: false, why: bad };
  const n = name.trim();
  const at = list.findIndex((p) => same(p.name, n));
  if (at >= 0 && !replace) return { ok: false, why: W.profiles.exists(n) };
  if (at < 0 && list.length >= PROFILES_MOST) return { ok: false, why: W.profiles.full(PROFILES_MOST) };
  const next = list.slice();
  const entry = { name: n, theme: { ...theme, name: n } };
  if (at >= 0) next[at] = entry;
  else next.push(entry);
  return { ok: true, list: next, name: n };
}

export function rename(list: Profile[], from: string, to: string): Change {
  const bad = checkName(to);
  if (bad) return { ok: false, why: bad };
  const at = list.findIndex((p) => p.name === from);
  if (at < 0) return { ok: false, why: W.profiles.gone(from) };
  const n = to.trim();
  if (list.some((p, i) => i !== at && same(p.name, n))) return { ok: false, why: W.profiles.exists(n) };
  const next = list.slice();
  next[at] = { name: n, theme: { ...list[at]!.theme, name: n } };
  return { ok: true, list: next, name: n };
}

export function remove(list: Profile[], name: string): Change {
  const at = list.findIndex((p) => p.name === name);
  if (at < 0) return { ok: false, why: W.profiles.gone(name) };
  return { ok: true, list: list.filter((_, i) => i !== at), name };
}

/** What an imported theme says of itself once applied: whether it is also in the profile list, or why it is not. */
export function importSaid(kept: Change, name: string): string {
  return kept.ok ? W.share.imported(kept.name) : W.share.importedNotKept(name, kept.why);
}
