// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folder's data files (ADR 0099 item 2: layouts; ADR 0098 item 2:
// bundles): one JSON object each, in `.verso/layouts/<id>.json` and
// `.verso/bundles/<id>.json`, which travel with the folder through sync as
// its settings do. The window names a kind and an id, never a path; the
// core checks both again (`crates/verso-core/src/folder_data.rs`).
//
// Every call answers the parsed value or throws the contract's error —
// `kind` `changed` (the file is not the version read), `exists` (a create
// found one), `refused` (an id out of the rule, a text too large or not a
// JSON object, a role that only reads), `not_found`, `unavailable` (a
// placeholder of on-demand storage) — for `fail()` to say.

import { commands, type ContractError, type FolderDataKind } from "./bindings";

export type { FolderDataKind };

/** The most a file's text may be, in bytes, by kind: a layout 256 KiB
 *  (ADR 0099 items 2 and 7), a bundle 4 MiB (ADR 0098 item 5). */
export const FOLDER_DATA_MOST: Record<FolderDataKind, number> = { layouts: 256 * 1024, bundles: 4 * 1024 * 1024 };
export const FOLDER_DATA_KINDS: readonly FolderDataKind[] = ["layouts", "bundles"];

/** A data file listed. An empty `revision`: the file cannot be read now (a
 *  placeholder, or past the bound) — `readData` says why. */
export type DataEntry = { id: string; revision: string };
/** A data file read: its object and the revision to hand back. */
export type DataValue = { value: Record<string, unknown>; revision: string };

/** `^[a-z0-9][a-z0-9-]{0,63}$`, and not a name Windows keeps for a device
 *  (`con`, `nul`, `com1`…): the rule the core applies before any IO. */
export function validDataId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(id);
}

function refused(message: string): never {
  const error: ContractError = { kind: "refused", message };
  throw error;
}

/** The data or the contract's error, thrown. */
function answer<T>(r: { status: "ok"; data: T } | { status: "error"; error: ContractError }): T {
  if (r.status === "ok") return r.data;
  throw r.error;
}

function checkId(id: string): void {
  if (!validDataId(id)) refused(`not a valid id: ${JSON.stringify(id)}`);
}

const listeners = new Map<FolderDataKind, (() => void)[]>();

/** `run` after every change of the folder's data files of `kind`: one made
 *  by this window, and one made outside it — another window, sync, another
 *  program (`changedOutside`). Read the list again from it. */
export function onFolderData(kind: FolderDataKind, run: () => void): void {
  listeners.set(kind, [...(listeners.get(kind) ?? []), run]);
}

function told(kind: FolderDataKind): void {
  for (const run of listeners.get(kind) ?? []) run();
}

/** The paths the folder changed at (`FolderChanged`): tell the listeners
 *  of each kind a path of `.verso/<kind>/` is among them. */
export function folderDataChangedAt(paths: Iterable<string>): void {
  const kinds = new Set<FolderDataKind>();
  for (const p of paths) for (const kind of FOLDER_DATA_KINDS) if (p.startsWith(`.verso/${kind}/`)) kinds.add(kind);
  for (const kind of kinds) told(kind);
}

/** The data files of `kind` the folder holds, in id order. */
export async function listData(kind: FolderDataKind): Promise<DataEntry[]> {
  return answer(await commands.listFolderData(kind));
}

/** One data file, parsed. A text that is not a JSON object (a file edited
 *  by hand) is refused with the file left as it is. */
export async function readData(kind: FolderDataKind, id: string): Promise<DataValue> {
  checkId(id);
  const file = answer(await commands.readFolderData(kind, id));
  let value: unknown;
  try {
    value = JSON.parse(file.text);
  } catch {
    return refused(`not JSON: ${kind}/${id}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) refused(`not a JSON object: ${kind}/${id}`);
  return { value: value as Record<string, unknown>, revision: file.revision };
}

/** Write a data file: `revision` null creates it (`exists` when one stands
 *  there), else replaces the version that revision describes (`changed`
 *  when the file is not it). Answers the revision of what was written. */
export async function writeData(kind: FolderDataKind, id: string, value: object, revision: string | null): Promise<string> {
  checkId(id);
  if (!value || typeof value !== "object" || Array.isArray(value)) refused("a data file holds one JSON object");
  const text = JSON.stringify(value, null, 2);
  if (new TextEncoder().encode(text).length > FOLDER_DATA_MOST[kind]) refused(`too large: the most is ${FOLDER_DATA_MOST[kind]} bytes`);
  const written = answer(await commands.writeFolderData(kind, id, text, revision));
  told(kind);
  return written.revision;
}

/** Remove a data file through the bin, when it is still the version
 *  `revision` describes. */
export async function removeData(kind: FolderDataKind, id: string, revision: string): Promise<void> {
  checkId(id);
  answer(await commands.removeFolderData(kind, id, revision));
  told(kind);
}
