// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The bundles a person imported, kept in the folder (ADR 0098 item 2,
 *  decided 2026-10-21): one `.verso/bundles/<id>.json` each, through the
 *  folder data commands, so a shared folder shares them and a reload keeps
 *  them. The core bounds a file (4 MiB) and checks the id; what is read
 *  back is checked again as an imported bundle is, so a file edited by hand
 *  or brought by sync cannot put a bad bundle in front of the wizard. */

import { listData, readData, strayNotice, validDataId, writeData } from "../folderData";
import { type TemplateBundle, validateBundle } from "./types";
import type { BundleWords } from "./words";

/** The file id for a bundle id: lower-case letters, digits and hyphens, as
 *  the core's rule asks ([`validDataId`]). Never empty. */
export function dataIdOf(id: string): string {
  const slug = id
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  const id1 = slug || "modelo";
  // A name Windows keeps for a device (`con`, `nul`…) is not an id.
  return validDataId(id1) ? id1 : `m-${id1}`;
}

/** An id no bundle in `taken` has: the one asked for, or that with a number. */
export function freeId(id: string, taken: ReadonlySet<string>): string {
  const base = dataIdOf(id);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const next = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!taken.has(next)) return next;
  }
}

export interface FolderBundles {
  bundles: TemplateBundle[];
  /** Things to tell the person: a file that did not read as a bundle, and
   *  names the folder holds there that Verso cannot use. */
  notes: string[];
}

/** The folder's bundles, in id order. A file that cannot be read or does
 *  not hold a valid bundle is left out and named in `notes`, never fatal. */
export async function loadFolderBundles(w: BundleWords): Promise<FolderBundles> {
  const bundles: TemplateBundle[] = [];
  const notes: string[] = [];
  const list = await listData("bundles");
  for (const entry of list.entries) {
    if (entry.revision === "") {
      notes.push(w.folderBundleUnreadable(entry.id));
      continue;
    }
    try {
      const { value } = await readData("bundles", entry.id);
      const checked = validateBundle(value, w);
      if (!checked.valid || !checked.bundle) {
        notes.push(w.folderBundleInvalid(entry.id, checked.error ?? ""));
        continue;
      }
      // The file's name is its identity: two files cannot clash, and a
      // bundle moved by hand keeps working.
      bundles.push({ ...checked.bundle, id: entry.id });
    } catch {
      notes.push(w.folderBundleUnreadable(entry.id));
    }
  }
  const stray = strayNotice("bundles", list.strays);
  if (stray) notes.push(stray);
  return { bundles, notes };
}

export type Saved = { ok: true; bundle: TemplateBundle; renamed: boolean } | { ok: false; message: string };

/** Keep an imported bundle in the folder under an id none of `taken` has. A
 *  bundle whose id is taken gets a new one (`renamed`); a file another
 *  device created meanwhile is not overwritten: the next id is tried. */
export async function saveFolderBundle(bundle: TemplateBundle, taken: ReadonlySet<string>): Promise<Saved> {
  const used = new Set(taken);
  const first = freeId(bundle.id, used);
  let id = first;
  for (let tries = 0; tries < 8; tries++) {
    const kept: TemplateBundle = { ...bundle, id };
    try {
      await writeData("bundles", id, kept, null);
      return { ok: true, bundle: kept, renamed: id !== bundle.id };
    } catch (err) {
      if (errorKind(err) !== "exists") return { ok: false, message: errorText(err) };
      used.add(id);
      id = freeId(bundle.id, used);
    }
  }
  return { ok: false, message: `too many bundles with the id ${first}` };
}

function errorKind(err: unknown): string {
  return typeof err === "object" && err !== null && "kind" in err ? String((err as { kind: unknown }).kind) : "";
}

function errorText(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}
