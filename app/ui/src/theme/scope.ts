// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Whose theme a folder shows (ADR 0100 item 4, amended 2026-10-27): the
// choice is per folder and per person. The person's settings hold a default
// theme (`look`, `palette`, …) and, apart, the choices made for single
// folders (`folderThemes`, by the folder's key). Resolution order: the
// folder's own choice, else the person's default, else the built-in look.
//
// The rest of the wizard keeps reading and writing `settings.look` and its
// siblings as "the theme in force in this window". This module swaps the
// folder's choice into those fields when a folder with one opens, and
// `persistable` splits them again on the way to storage, so the default is
// never overwritten by a folder's choice and no other folder moves. It lives
// in the person's settings only: never in the folder's files, never seen by
// another person (settings/account sync carry the person's own).

import type { Look } from "./tokens";
import type { InspiredBy } from "./tokens";

/** The fields that make up a theme in the person's settings. */
export type Slice = {
  /** Light, dark or the system's: part of a theme, since a theme of one
   *  side switches the window to that side (useCatalogue.ts). */
  theme?: string;
  palette?: string;
  look?: Look;
  headingFont?: string;
  lookName?: string;
  lookCredit?: InspiredBy;
};
export const SLICE_KEYS = ["theme", "palette", "look", "headingFont", "lookName", "lookCredit"] as const;

/** The part of the settings the scope reads and writes. */
export type Scoped = Slice & { folderThemes?: Record<string, Slice> };

export function sliceOf(s: Slice): Slice {
  const out: Slice = {};
  for (const k of SLICE_KEYS) if (s[k] !== undefined) (out as Record<string, unknown>)[k] = structuredClone(s[k]);
  return out;
}

export const sameSlice = (a: Slice, b: Slice): boolean => JSON.stringify(SLICE_KEYS.map((k) => a[k] ?? null)) === JSON.stringify(SLICE_KEYS.map((k) => b[k] ?? null));

/** Put `slice` in the fields of `s`, those it does not hold removed. The
 *  mode, the palette and the heading font a slice lacks are `fallback`'s
 *  (the default's), never what a folder shown before left. The text size is
 *  not part of a theme: it stays the person's, global. */
export function lay(s: Slice, slice: Slice, fallback?: Slice): void {
  for (const k of SLICE_KEYS) {
    const v = slice[k] ?? (k === "theme" || k === "palette" || k === "headingFont" ? fallback?.[k] : undefined);
    if (v === undefined) {
      if (k !== "palette" && k !== "theme") delete s[k];
    } else (s as Record<string, unknown>)[k] = structuredClone(v);
  }
}

/** The theme a folder shows: its own choice, else the person's default
 *  (which, empty, is the built-in look). */
export function resolve(folderThemes: Record<string, Slice> | undefined, key: string, personal: Slice): Slice {
  const own = key ? folderThemes?.[key] : undefined;
  return sliceOf(own ?? personal);
}

/** The folder themes of a settings file, each kept only when it is an object. */
export function readFolderThemes(raw: unknown, readOne: (v: unknown) => Slice | null): Record<string, Slice> {
  const out: Record<string, Slice> = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    const slice = readOne(v);
    if (key !== "" && slice) out[key] = slice;
  }
  return out;
}

// --- the window's state
let held: Slice | null = null; // the person's default, while the folder's own is laid over
let key = ""; // the folder whose own choice is laid over, "" when none

/** The person's default as last read or saved while no folder choice is laid
 *  over: what a theme change is measured against. */
let baseline: Slice | null = null;
/** The folder for which the person picked "Default for all folders": its
 *  changes go to the default, not to the folder. Kept in this window only. */
let defaultFor = "";

/** Whether theme changes in `folder` are the folder's own: it has its own
 *  choice, or the person has not picked the default for it (a folder open
 *  and a change made is the folder's; ADR 0100 item 4, 2026-10-27). */
export const forFolder = (folder: string): boolean => held !== null || (folder !== "" && defaultFor !== folder);

/** The person picked "Default for all folders" for `folder`. */
export function chooseDefault(folder: string): void {
  defaultFor = folder;
}

/** Whether the theme in force is this folder's own choice. */
export const isOwn = (): boolean => held !== null;

/** The settings were read afresh from storage: nothing of the old reading is laid over any more. */
export function reset(): void {
  held = null;
  key = "";
  baseline = null;
}

/** Lift a folder's own choice off `s`, the default back in its fields. */
export function leave(s: Scoped): void {
  if (held) lay(s, held);
  held = null;
  key = "";
}

/** A folder opens (or the settings were read again): its own choice, when it
 *  has one, is laid over the default. Other folders are not touched. */
export function enter(s: Scoped, folder: string): void {
  leave(s);
  if (defaultFor !== folder) defaultFor = "";
  const own = folder ? s.folderThemes?.[folder] : undefined;
  if (!own) {
    baseline = sliceOf(s);
    return;
  }
  held = sliceOf(s);
  key = folder;
  lay(s, own, held);
}

/** The person chooses to give `folder` a theme of its own: an entry copying
 *  the default is stored at once (so the choice survives a reload and a
 *  second window), and from now on what the wizard changes is this folder's.
 *  The caller saves the settings. */
export function startOwn(s: Scoped, folder: string): void {
  if (held || !folder) return;
  defaultFor = "";
  s.folderThemes = { ...(s.folderThemes ?? {}), [folder]: sliceOf(s) };
  held = sliceOf(s);
  key = folder;
}

/** The person lets `folder` follow the default again: its own choice is
 *  dropped, the default shows. */
export function stopOwn(s: Scoped): void {
  if (key && s.folderThemes) delete s.folderThemes[key];
  leave(s);
  if (s.folderThemes && Object.keys(s.folderThemes).length === 0) delete s.folderThemes;
}

/** A theme change made while a folder is open and no choice of its own is
 *  laid over becomes that folder's own choice (unless the person picked the
 *  default for it): the entry is stored with the new theme, the default
 *  stays what it was. Called before every save, so that every path that
 *  writes the theme fields lands in the folder, not in the default. */
export function adopt(s: Scoped, folder: string): void {
  if (held || !folder) return;
  const now = sliceOf(s);
  if (defaultFor === folder || baseline === null || sameSlice(now, baseline)) {
    baseline = now;
    return;
  }
  s.folderThemes = { ...(s.folderThemes ?? {}), [folder]: now };
  held = baseline;
  key = folder;
}

/** The text a save writes to storage. */
export function toStorage(s: Scoped, folder: string): string {
  adopt(s, folder);
  return JSON.stringify(persistable(s));
}

/** What goes to storage: the default's fields hold the default, the folder's
 *  own choice goes under `folderThemes`. Unchanged settings when no folder
 *  choice is laid over. */
export function persistable<T extends Scoped>(s: T): T {
  if (!held) return s;
  const out = { ...s, folderThemes: { ...(s.folderThemes ?? {}) } } as T;
  const now = sliceOf(s);
  out.folderThemes![key] = now;
  lay(out, held);
  if (Object.keys(out.folderThemes!).length === 0) delete out.folderThemes;
  return out;
}

/** The folder whose own choice is laid over, "" when none. */
export const ownFolder = (): string => key;
