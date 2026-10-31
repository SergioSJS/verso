// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's answers for the folder's data files, `.verso/layouts/<id>.json`
// and `.verso/bundles/<id>.json` (ADR 0099 item 2, ADR 0098 item 2), and for
// the oracle's keys in the folder's settings (ADR 0102 item 2), as the core
// gives them (`crates/verso-core/src/folder_data.rs`, `oracle.rs`): an id out
// of the rule refused before anything is read, a text that is one JSON object
// of at most 256 KiB (a layout) or 4 MiB (a bundle), a create that never replaces, a write over the version
// read only, a removal through the bin.

import type { ContractError, ErrorKind, FolderDataEntry, FolderDataFile, FolderDataKind, FolderDataList, FolderDataWritten, OracleSettings, OracleSparks, Trashed } from "../bindings";

type Stored = { bytes: Uint8Array; revision: number; modified: number };

/** What the harness's folder lets the data files do. */
export type DataHost = {
  files: Map<string, Stored>;
  put(path: string, bytes: Uint8Array): Stored;
  accepts(path: string, was: Stored, given: string): boolean;
  /** Move a file into `.trash/`, recorded in the bin; answers where it went. */
  trash(path: string): string;
};

export const FOLDER_DATA_MOST: Record<FolderDataKind, number> = { layouts: 256 * 1024, bundles: 4 * 1024 * 1024 };
const KINDS: readonly FolderDataKind[] = ["layouts", "bundles"];
const encoder = new TextEncoder();
const strict = new TextDecoder("utf-8", { fatal: true });

function refuse(kind: ErrorKind, message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

/** `^[a-z0-9][a-z0-9-]{0,63}$`, and not a name Windows keeps for a device. */
export function validId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(id);
}

/** A confined path to write, create or move at: the core refuses the folder's
 *  data directories there, which only the four folder data commands write. */
export function writeGuard(key: string): string {
  if (/^\.verso\/(layouts|bundles)(\/|$)/.test(key)) refuse("refused", `${key} is written through the folder data commands only`);
  return key;
}

function pathOf(kind: unknown, id: unknown): string {
  if (!KINDS.includes(kind as FolderDataKind)) refuse("refused", `folder data: not a kind: ${String(kind)}`);
  if (!validId(id)) refuse("refused", `folder data: not a valid id: ${JSON.stringify(id)}`);
  return `.verso/${String(kind)}/${id}.json`;
}

function checkText(kind: FolderDataKind, text: string): void {
  const size = encoder.encode(text).length;
  const most = FOLDER_DATA_MOST[kind];
  if (size > most) refuse("refused", `folder data: too large: ${size} bytes, the most is ${most}`);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return refuse("refused", `folder data: not JSON: ${String(e)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) refuse("refused", "folder data: not a JSON object");
}

export class FolderData {
  constructor(private readonly host: DataHost) {}

  list(kind: FolderDataKind): FolderDataList {
    pathOf(kind, "a");
    const prefix = `.verso/${kind}/`;
    const entries: FolderDataEntry[] = [];
    const strays: string[] = [];
    for (const [path, f] of this.host.files) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) continue;
      const name = path.slice(prefix.length);
      const id = name.endsWith(".json") ? name.slice(0, -".json".length) : null;
      if (id === null || !validId(id)) {
        if (!name.startsWith(".")) strays.push(name);
        continue;
      }
      entries.push({ id, revision: f.bytes.length > FOLDER_DATA_MOST[kind] ? "" : String(f.revision) });
    }
    entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { entries, strays: strays.sort().slice(0, 50) };
  }

  read(kind: FolderDataKind, id: string): FolderDataFile {
    const path = pathOf(kind, id);
    const f = this.host.files.get(path);
    if (!f) return refuse("not_found", `no such file: ${path}`);
    if (f.bytes.length > FOLDER_DATA_MOST[kind]) refuse("refused", `folder data: too large: ${f.bytes.length} bytes`);
    try {
      return { text: strict.decode(f.bytes), revision: String(f.revision) };
    } catch {
      return refuse("not_text", `not UTF-8: ${path}`);
    }
  }

  write(kind: FolderDataKind, id: string, text: string, revision: string | null): FolderDataWritten {
    const path = pathOf(kind, id);
    checkText(kind, text);
    const was = this.host.files.get(path);
    if (revision === null) {
      if (was) refuse("exists", `already there: ${path}`);
    } else {
      if (!was) refuse("not_found", `no such file: ${path}`);
      if (!this.host.accepts(path, was, revision)) refuse("changed", `changed on disk: ${path}`);
    }
    return { revision: String(this.host.put(path, encoder.encode(text)).revision) };
  }

  /** The four commands, as the core's handlers table takes them. */
  readonly handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
    list_folder_data: (a) => this.list(a["kind"] as FolderDataKind),
    read_folder_data: (a) => this.read(a["kind"] as FolderDataKind, a["id"] as string),
    write_folder_data: (a) => this.write(a["kind"] as FolderDataKind, a["id"] as string, a["text"] as string, (a["revision"] as string | null | undefined) ?? null),
    remove_folder_data: (a) => this.remove(a["kind"] as FolderDataKind, a["id"] as string, a["revision"] as string),
  };

  remove(kind: FolderDataKind, id: string, revision: string): Trashed {
    const path = pathOf(kind, id);
    const was = this.host.files.get(path);
    if (!was) return refuse("not_found", `no such file: ${path}`);
    // Past the bound the list gave no revision: removed on the empty one, unread.
    if (was.bytes.length > FOLDER_DATA_MOST[kind]) {
      if (revision !== "") refuse("refused", "folder data: the file grew past the bound since it was listed: list again");
    } else if (!this.host.accepts(path, was, revision)) refuse("changed", `changed on disk: ${path}`);
    return { path: this.host.trash(path), warnings: [] };
  }
}

// ---- The oracle's keys in the folder's settings ----------------------------

const SPARK_LISTS = ["action", "theme", "descriptor", "focus"] as const;

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function oddsProblem(odds: readonly (readonly number[])[]): string | null {
  if (odds.length !== 5) return `the odds are 5 rows, not ${odds.length}`;
  for (const [i, row] of odds.entries()) {
    if (row.length !== 6) return `odds row ${i + 1} has ${row.length} numbers, not 6`;
    if (row.some((n) => !Number.isInteger(n) || n < 0)) return `odds row ${i + 1} holds a number that is not a whole, non-negative one`;
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum !== 100) return `odds row ${i + 1} adds to ${sum}, not 100`;
  }
  return null;
}

function listProblem(name: string, words: readonly string[]): string | null {
  if (words.length < 1 || words.length > 200) return `the ${name} sparks are ${words.length} words, not 1 to 200`;
  const bad = words.findIndex((w) => w === "" || [...w].length > 60);
  return bad < 0 ? null : `word ${bad + 1} of the ${name} sparks is not 1 to 60 characters`;
}

/** Whether a change of the oracle's keys may be written: refused, as the
 *  core refuses it, when not. */
export function checkOracle(change: OracleSettings): void {
  if ((change.clear_odds && change.odds) || (change.clear_sparks && change.sparks)) {
    refuse("refused", "folder settings: a change cannot both set and clear the same oracle key");
  }
  const odds = change.odds ? oddsProblem(change.odds) : null;
  if (odds) refuse("refused", `folder settings: ${odds}`);
  if (change.sparks) {
    for (const name of SPARK_LISTS) {
      const problem = listProblem(name, change.sparks[name]);
      if (problem) refuse("refused", `folder settings: ${problem}`);
    }
  }
}

function oddsOf(v: unknown): number[][] | null {
  if (!Array.isArray(v)) return null;
  const rows = v.map((r) => (Array.isArray(r) && r.every((n) => typeof n === "number") ? (r as number[]) : null));
  if (rows.some((r) => r === null)) return null;
  return oddsProblem(rows as number[][]) === null ? (rows as number[][]) : null;
}

function sparksOf(v: unknown): OracleSparks | null {
  const o = rec(v);
  if (!o) return null;
  const lists = SPARK_LISTS.map((name) => {
    const l = o[name];
    return Array.isArray(l) && l.every((w) => typeof w === "string") && listProblem(name, l as string[]) === null ? (l as string[]) : null;
  });
  if (lists.some((l) => l === null)) return null;
  const [action, theme, descriptor, focus] = lists as [string[], string[], string[], string[]];
  return { action, theme, descriptor, focus };
}

/** What the file's `oracle` holds, as the core reads it: a part that does
 *  not pass is not applied. */
export function readOracle(file: Record<string, unknown>): OracleSettings | null {
  const o = rec(file["oracle"]);
  if (!o) return null;
  return { odds: oddsOf(o["odds"]), sparks: sparksOf(o["sparks"]), clear_odds: null, clear_sparks: null };
}

/** One line for each part of the file's `oracle` that is not applied. */
export function oracleProblems(file: Record<string, unknown>): string[] {
  if (!("oracle" in file)) return [];
  const o = rec(file["oracle"]);
  if (!o) return ["oracle settings ignored: not an object"];
  const out: string[] = [];
  if ("odds" in o && oddsOf(o["odds"]) === null) out.push("oracle odds ignored: not 5 rows of 6 numbers adding to 100");
  if ("sparks" in o && sparksOf(o["sparks"]) === null) out.push(`oracle sparks ignored: need the lists ${SPARK_LISTS.join(", ")} of 1 to 200 words of 1 to 60 characters`);
  return out;
}

/** `change` laid over the file's `oracle`: the odds whole, the spark lists
 *  one by one; every other key kept. */
export function applyOracle(file: Record<string, unknown>, change: OracleSettings): void {
  const o = rec(file["oracle"]) ?? {};
  if (change.clear_odds) delete o["odds"];
  if (change.clear_sparks) delete o["sparks"];
  if (change.odds) o["odds"] = change.odds;
  if (change.sparks) {
    const s = rec(o["sparks"]) ?? {};
    for (const name of SPARK_LISTS) s[name] = change.sparks[name];
    o["sparks"] = s;
  }
  // Never an empty object: the key goes with its last content.
  if (Object.keys(o).length === 0) delete file["oracle"];
  else file["oracle"] = o;
}

/** The theme a folder suggests (ADR 0100 item 4), as the core reads it: the JSON text of the object under `recommendedTheme`. */
export function readTheme(o: Record<string, unknown>): string | null {
  const v = o["recommendedTheme"];
  return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : null;
}

/** A change of the suggestion, as the core applies it: "" takes it away, else one JSON object of at most 16 KiB. */
export function applyTheme(obj: Record<string, unknown>, text: string | null | undefined): void {
  if (text === null || text === undefined) return;
  if (text === "") {
    delete obj["recommendedTheme"];
    return;
  }
  let value: unknown = null;
  try {
    value = JSON.parse(text);
  } catch {
    // Refused below.
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || text.length > 16 * 1024) refuse("refused", "a suggested theme is one JSON object of at most 16384 bytes");
  obj["recommendedTheme"] = value;
}
