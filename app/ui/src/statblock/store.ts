// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where layouts come from (ADR 0099 item 2): the built-ins that ship with
// the window, read-only, and the folder's own, `.verso/layouts/<id>.json`,
// through the folder data commands of the contract — so everyone who opens
// the folder sees the same card. Nothing of a layout lives in a device's
// browser storage; what the first build kept there is shown, and moved into the
// folder, kept on the device or discarded only by the person's choice, on
// Settings > Statblocks (saving a layout never touches it).
//
// The folder is reached through `FolderDataApi` (the folder data contract,
// section B): the window's `folderData.ts` gives one, a test an in-memory
// one. Cards are drawn synchronously, so the folder's layouts are read
// ahead into memory and redrawn when they change.

import { ALIASES, DEFAULT_LAYOUT_ID, builtinLayouts } from "./builtin";
import { importLayout } from "./fsInterop";
import { legacyKept, readLegacy, removeLegacy, setLegacyKept } from "./legacy";
import { LAYOUT_ID, type Layout } from "./model";
import { S, word } from "./strings";
import { validateLayout, type Problem } from "./validate";

export type FolderDataKind = "layouts" | "bundles";

/** The folder's data files of a kind, as the contract's four commands
 *  give them (folderData.ts, wired by folderWire.ts). Each call rejects
 *  with the contract's error, `{kind, message}` — `changed`, `exists`,
 *  `refused`, `not_found`, `unavailable` — or an Error. */
export interface FolderDataApi {
  list(kind: FolderDataKind): Promise<{ entries: { id: string; revision: string }[]; strays: string[] }>;
  read(kind: FolderDataKind, id: string): Promise<{ value: unknown; revision: string }>;
  /** `revision` null creates (refused when the file exists); otherwise it
   *  replaces, refused when the file changed since that revision. */
  write(kind: FolderDataKind, id: string, value: object, revision: string | null): Promise<{ revision: string }>;
  remove(kind: FolderDataKind, id: string, revision: string): Promise<void>;
  /** Told after any change of that kind; gives back what stops it. */
  onChange?(kind: FolderDataKind, run: () => void): () => void;
}

export type LayoutSource = "builtin" | "folder" | "device";

export interface StoredLayout {
  layout: Layout;
  source: LayoutSource;
  /** The file's revision, for a folder layout: what a write must name. */
  revision?: string;
  /** What its file held that the validator could not take. */
  problems: Problem[];
}

/** A refusal says why; `stale` when the file changed since it was read
 *  (another person, another window): the caller shows it, never retries
 *  silently. */
export type Result<T> = { ok: true; value: T } | { ok: false; why: string; stale?: true };

/** The contract's error (`{kind, message}`, folderData.ts) or an Error, as text. */
const why = (e: unknown): string => {
  if (e instanceof Error) return e.message.slice(0, 300);
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message.slice(0, 300);
  return String(e).slice(0, 300);
};
/** The file is not the version read: the contract's `changed`. */
const isStale = (e: unknown): boolean => (!!e && typeof e === "object" && (e as { kind?: unknown }).kind === "changed") || /stale|changed/i.test(why(e));

let api: FolderDataApi | null = null;
let stopWatch: (() => void) | null = null;
let folder: StoredLayout[] = [];
let strays: string[] = [];
let legacy: StoredLayout[] | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const f of [...listeners]) {
    try {
      f();
    } catch {
      // One listener's failure is not the others'.
    }
  }
}

/** Told when the layouts change: the folder's were read, one was written. */
export function onLayoutsChanged(run: () => void): () => void {
  listeners.add(run);
  return () => listeners.delete(run);
}

const deviceLayouts = (): StoredLayout[] => {
  if (legacy === null) legacy = readLegacy().map((layout) => ({ layout, source: "device" as const, problems: [] }));
  return legacy;
};

/** Read the folder's layouts again (on attach, and when told they changed). */
export async function reloadFolder(): Promise<void> {
  const from = api;
  if (!from) {
    folder = [];
    strays = [];
    changed();
    return;
  }
  const out: StoredLayout[] = [];
  let left: string[] = [];
  try {
    const listed = await from.list("layouts");
    left = listed.strays;
    for (const e of listed.entries.slice(0, 500)) {
      // An empty revision: the file cannot be read now (a placeholder of
      // on-demand storage, past the bound); it shows once it can.
      if (!LAYOUT_ID.test(e.id) || e.revision === "") continue;
      try {
        const r = await from.read("layouts", e.id);
        const v = validateLayout(r.value, e.id);
        if (v.layout) out.push({ layout: v.layout, source: "folder", revision: r.revision, problems: v.problems });
      } catch {
        // A file that cannot be read now (a placeholder of on-demand
        // storage, a file being written) is left out until the next change.
      }
    }
  } catch {
    // No folder data answer: the built-ins still draw.
  }
  if (api !== from) return;
  folder = out;
  strays = left;
  changed();
}

/** The folder the layouts are read from and written to; null for none. */
export async function attachFolder(next: FolderDataApi | null): Promise<void> {
  stopWatch?.();
  stopWatch = null;
  api = next;
  folder = [];
  strays = [];
  if (next?.onChange) stopWatch = next.onChange("layouts", () => void reloadFolder());
  await reloadFolder();
}

/** The names in the folder's `.verso/layouts/` that are not a usable
 *  `<id>.json` (a sync conflict copy…): none of them is a layout, and the
 *  page says so (`strayNotice`). */
export function layoutStrays(): readonly string[] {
  return strays;
}

/** Every layout: the built-ins, the folder's, the device's not yet moved. */
export function allLayouts(): StoredLayout[] {
  const builtins = builtinLayouts().map((layout) => ({ layout, source: "builtin" as const, problems: [] }));
  const taken = new Set(builtins.map((b) => b.layout.id));
  const mine = folder.filter((f) => !taken.has(f.layout.id));
  for (const f of mine) taken.add(f.layout.id);
  return [...builtins, ...mine, ...deviceLayouts().filter((d) => !taken.has(d.layout.id))];
}

/** A word as a name is compared: case and accents ignored, and nothing else. */
export function nameKey(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The layout a block names, by id or by name (either language), exactly
 *  but for case and accents; the default one, said "not found", otherwise. */
export function resolveLayout(named?: string): { stored: StoredLayout; known: boolean } {
  const all = allLayouts();
  const fallback = all.find((s) => s.layout.id === DEFAULT_LAYOUT_ID) ?? all[0]!;
  if (named === undefined || !named.trim()) return { stored: fallback, known: true };
  const needle = nameKey(named);
  const alias = Object.hasOwn(ALIASES, needle) ? ALIASES[needle] : undefined;
  const hit =
    all.find((s) => nameKey(s.layout.id) === needle) ??
    all.find((s) => [s.layout.name.pt, s.layout.name.en].some((n) => n !== undefined && nameKey(n) === needle)) ??
    (alias ? all.find((s) => s.layout.id === alias) : undefined);
  return hit ? { stored: hit, known: true } : { stored: fallback, known: false };
}

/** An id no layout has: `base`, `base-2`, `base-3`… within the bounds. */
export function freeId(base: string): string {
  const taken = new Set(allLayouts().map((s) => s.layout.id));
  const root = (LAYOUT_ID.test(base) ? base : "layout").slice(0, 58).replace(/-+$/, "") || "layout";
  if (!taken.has(root)) return root;
  for (let n = 2; n < 10_000; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
  return `${root}-${Date.now().toString(36)}`.slice(0, 64);
}


/** What happened to one device layout in a move. */
export type MoveResult = { id: string; name: string; ok: boolean; newId?: string; why?: string };

/** The earlier build's layouts still on this device (not yet moved). */
export function pendingDeviceLayouts(): StoredLayout[] {
  return [...deviceLayouts()];
}

/** Whether the notice about them is due: some are pending and the person
 *  has not chosen to keep them on this device only. */
export function deviceNoticeDue(): boolean {
  return deviceLayouts().length > 0 && !legacyKept();
}

/** "Keep on this device only": the notice stops; the layouts stay where
 *  they are and keep drawing cards. */
export function keepDeviceLayouts(): void {
  setLegacyKept(true);
  changed();
}

/** "Discard": the chosen device layouts (all by default) gone from the
 *  device. Nothing is written into the folder. */
export function discardDeviceLayouts(ids?: readonly string[]): void {
  const want = new Set(ids ?? deviceLayouts().map((d) => d.layout.id));
  removeLegacy(want);
  legacy = null;
  changed();
}

/** "Move into this folder": each chosen device layout (all by default)
 *  created in the folder, one by one, each with its own result. Only those
 *  that were written leave the device. A failure of one never stops or
 *  hides the others. */
export async function moveDeviceLayouts(ids?: readonly string[]): Promise<Result<MoveResult[]>> {
  const to = api;
  if (!to) return { ok: false, why: S.noFolder };
  const want = ids ? new Set(ids) : null;
  const pending = deviceLayouts().filter((d) => !want || want.has(d.layout.id));
  const taken = new Set([...builtinLayouts().map((l) => l.id), ...folder.map((f) => f.layout.id)]);
  const results: MoveResult[] = [];
  const done = new Set<string>();
  for (const d of pending) {
    let id = d.layout.id;
    for (let n = 2; taken.has(id); n++) id = `${d.layout.id.slice(0, 58)}-${n}`;
    const name = word(d.layout.name, d.layout.id);
    try {
      const r = await to.write("layouts", id, { ...d.layout, id }, null);
      taken.add(id);
      done.add(d.layout.id);
      folder = [...folder.filter((f) => f.layout.id !== id), { layout: { ...d.layout, id }, source: "folder", revision: r.revision, problems: [] }];
      results.push({ id: d.layout.id, name, ok: true, newId: id });
    } catch (e) {
      results.push({ id: d.layout.id, name, ok: false, why: why(e) });
    }
  }
  if (done.size > 0) removeLegacy(done);
  legacy = null;
  changed();
  return { ok: true, value: results };
}

/** Write a layout into the folder: `revision` null for a new file, the
 *  file's for a change. A built-in's id is never written. */
export async function saveLayout(layout: Layout, revision: string | null): Promise<Result<StoredLayout>> {
  const to = api;
  if (!to) return { ok: false, why: S.noFolder };
  if (builtinLayouts().some((b) => b.id === layout.id) || !LAYOUT_ID.test(layout.id)) return { ok: false, why: S.problem.id };
  const v = validateLayout(layout, layout.id);
  if (!v.layout) return { ok: false, why: S.problem.notMap };
  try {
    const r = await to.write("layouts", v.layout.id, v.layout, revision);
    const stored: StoredLayout = { layout: v.layout, source: "folder", revision: r.revision, problems: v.problems };
    folder = [...folder.filter((f) => f.layout.id !== stored.layout.id), stored];
    changed();
    return { ok: true, value: stored };
  } catch (e) {
    return { ok: false, why: S.writeFailed(why(e)), ...(isStale(e) ? { stale: true as const } : {}) };
  }
}

/** A copy of a layout — a built-in, the folder's, the device's — as a new
 *  file of the folder, named as a copy. */
export async function duplicateLayout(id: string): Promise<Result<StoredLayout>> {
  const from = allLayouts().find((s) => s.layout.id === id);
  if (!from) return { ok: false, why: S.problem.id };
  const copy = JSON.parse(JSON.stringify(from.layout)) as Layout;
  copy.id = freeId(`${id.slice(0, 54)}-copy`);
  copy.name = { ...(copy.name.pt ? { pt: `${copy.name.pt} (cópia)` } : {}), ...(copy.name.en ? { en: `${copy.name.en} (copy)` } : {}) };
  return saveLayout(copy, null);
}

/** Remove a folder layout (through the folder's trash where it has one). */
export async function removeLayout(id: string): Promise<Result<true>> {
  const to = api;
  if (!to) return { ok: false, why: S.noFolder };
  const f = folder.find((s) => s.layout.id === id);
  if (!f || f.revision === undefined) return { ok: false, why: S.problem.id };
  try {
    await to.remove("layouts", id, f.revision);
    folder = folder.filter((s) => s.layout.id !== id);
    changed();
    return { ok: true, value: true };
  } catch (e) {
    return { ok: false, why: S.writeFailed(why(e)) };
  }
}

/** A layout JSON — Fantasy Statblocks' or Verso's — imported as a new
 *  file of the folder, under an id no layout has; what was code and left
 *  out comes back to be shown. */
export async function importLayoutText(text: string): Promise<Result<{ stored: StoredLayout; dropped: string[]; converted: string[] }>> {
  const r = importLayout(text);
  if ("error" in r) return { ok: false, why: r.error };
  const layout = { ...r.layout, id: freeId(r.layout.id) };
  const saved = await saveLayout(layout, null);
  if (!saved.ok) return saved;
  return { ok: true, value: { stored: saved.value, dropped: r.dropped, converted: r.converted } };
}

/** Whether a folder is attached (layouts can be written). */
export function canWriteLayouts(): boolean {
  return api !== null;
}

/** For tests: forget the device's layouts read so far. */
export function resetStoreForTests(): void {
  legacy = null;
  folder = [];
  strays = [];
  api = null;
  stopWatch?.();
  stopWatch = null;
  listeners.clear();
}
