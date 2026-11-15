// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Sync's engine in the browser (ADR 0092 item 1, ADR 0079): what to send,
// fetch, delete and rename so the folder kept in this browser and its folder
// on the server hold the same files, decided from three pictures — the files
// here, the files there, and the base both last agreed on — per file, by
// hash. No network and no storage: the syncer (sync.ts) reads the pictures
// and carries the plan out.
//
// This is the Rust engine's rules (`crates/verso-core/src/sync.rs` and
// `sync/append.rs`) written again in TypeScript, because the browser cannot
// run `verso-core` (and ADR 0029's guardrails forbid the `unsafe` a hand-made
// WebAssembly bridge needs). It is not a second protocol: the same plan for
// the same pictures, and a test holds it so. `crates/verso-core/tests/
// sync-vectors.json` is made by the Rust engine (the test
// `the_browsers_vectors_are_the_engines` writes and checks it) and
// `test/offlineEngine.test.mjs` holds this file to every case of it.
//
// A browser's store tells names apart as the server's disk does, so the
// rules that exist only where the file system folds case (`respelled`,
// `one_base_per_name`) are left out, as `plan(…, folds = false)` leaves them.

import { Sha256 } from "./sha256";

/** A file as one side holds it: its bytes' SHA-256 and size. */
export type FileState = { hash: string; size: number };
/** One side's files, by path relative to the folder. */
export type Files = Map<string, FileState>;

/** The largest file sync carries (ADR 0079 item 12). */
export const LARGEST = 2 ** 30;
/** The fewest deletions in one pass that pause it (item 9). */
export const PAUSE_FLOOR = 3;

export type Action =
  | { t: "upload"; path: string; base: string | null }
  | { t: "download"; path: string; hash: string }
  | { t: "deleteRemote"; path: string; base: string }
  | { t: "deleteLocal"; path: string }
  | { t: "renameRemote"; from: string; to: string; base: string }
  | { t: "renameLocal"; from: string; to: string }
  | { t: "conflict"; path: string; copy: string; hash: string }
  | { t: "agree"; path: string; hash: string | null };

/** A path sync leaves alone: another file holds its name in the other
 *  Unicode form (`here`), or, on the server, differing only in case. */
export type Held = { path: string; here: boolean; case: boolean };

export type Plan = { actions: Action[]; pause: number | null; held: Held[] };

/** What sync keeps of a folder between runs (the `State` of verso-core). */
export type State = {
  server: string;
  folder: string;
  cursor: number;
  /** Path → the hash both sides last agreed on. */
  base: Map<string, string>;
  paused: boolean;
  /** Path → the SHA-256 of the text a note was made with from its template. */
  made: Map<string, string>;
};

export function newState(server: string, folder: string): State {
  return { server, folder, cursor: 0, base: new Map(), paused: false, made: new Map() };
}

/** Order of a Rust `BTreeMap<String, _>`: by UTF-8 bytes, which is by code
 *  point (JavaScript's own `<` compares UTF-16 units). */
export function byBytes(a: string, b: string): number {
  const x = a[Symbol.iterator]();
  const y = b[Symbol.iterator]();
  for (;;) {
    const p = x.next();
    const q = y.next();
    if (p.done || q.done) return p.done && q.done ? 0 : p.done ? -1 : 1;
    const c = p.value.codePointAt(0)! - q.value.codePointAt(0)!;
    if (c !== 0) return c;
  }
}

const sorted = (keys: Iterable<string>): string[] => [...keys].sort(byBytes);

/** A path as every device and the server compare names (spec Q7): its
 *  accents in one Unicode form, the composed one. */
export function foldedForm(path: string): string {
  return path.normalize("NFC");
}

/** A path as a file system that ignores case and Unicode normalization
 *  compares it. */
export function folded(path: string): string {
  return foldedForm(path).toLowerCase();
}

/** The name a conflict's copy takes (item 8): `<stem> (conflict, <device>,
 *  <when>).<ext>`, in the person's language, with characters every system
 *  keeps (ADR 0070 item 3), not one of `taken`. */
export function conflictName(path: string, device: string, when: string, pt: boolean, taken: ReadonlySet<string>): string {
  const slash = path.lastIndexOf("/");
  const dir = slash < 0 ? "" : path.slice(0, slash);
  const file = slash < 0 ? path : path.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ""];
  const safe = Array.from(
    Array.from(device)
      .map((c) => (/[\p{Alphabetic}\p{N}]/u.test(c) || c === " " || c === "-" || c === "_" ? c : "-"))
      .join("")
      .trim(),
  )
    .slice(0, 40)
    .join("");
  const word = pt ? "conflito" : "conflict";
  const at = (n: number): string => {
    const more = n > 1 ? ` ${n}` : "";
    const name = `${stem} (${word}, ${safe}, ${when}${more})${ext}`;
    return dir === "" ? name : `${dir}/${name}`;
  };
  const gone = new Set([...taken].map(folded));
  let n = 1;
  while (gone.has(folded(at(n)))) n++;
  return at(n);
}

type Hashes = [string | null, string | null, string | null];
type CopyName = (path: string, taken: ReadonlySet<string>) => string;

/** What the files and the base say to do: the Rust `plan` with
 *  `folds = false`. */
export function plan(local: Files, remote: Files, state: Pick<State, "base">, confirmed: boolean, copyName: CopyName): Plan {
  const first = state.base.size === 0;
  const size = Math.max(local.size, remote.size, state.base.size);
  const taken = new Set<string>([...local.keys(), ...remote.keys()]);
  const named = oneNameOneFile(local, remote, state.base);
  caseTwinsThere(named.local, named.remote, named.base, named.held);
  const actions: Action[] = [];
  const done = new Set<string>(named.held.map((h) => h.path));
  // A base kept under another form of the name moves to this device's
  // spelling first, so that a step refused below leaves it there.
  for (const [from, to, hash] of named.rebased) {
    actions.push({ t: "agree", path: to, hash });
    actions.push({ t: "agree", path: from, hash: null });
  }
  const { local: l, remote: r, base } = named;
  const hashOf = (files: Files, p: string): string | null => files.get(p)?.hash ?? null;

  // Renames first: a base path gone on one side, a new path there with its
  // bytes, the other side unchanged at the old path.
  if (!first) {
    for (const old of sorted(base.keys())) {
      const b = base.get(old)!;
      if (done.has(old)) continue;
      const lh = hashOf(l, old);
      const rh = hashOf(r, old);
      if (lh === null && rh === b) {
        const created = sorted(l.keys()).find((p) => l.get(p)!.hash === b && !base.has(p) && !r.has(p) && !done.has(p));
        if (created !== undefined) {
          actions.push({ t: "renameRemote", from: old, to: created, base: b });
          done.add(old);
          done.add(created);
          continue;
        }
      }
      if (rh === null && lh === b) {
        const created = sorted(r.keys()).find((p) => r.get(p)!.hash === b && !base.has(p) && !l.has(p) && !done.has(p));
        if (created !== undefined) {
          actions.push({ t: "renameLocal", from: old, to: created });
          done.add(old);
          done.add(created);
        }
      }
    }
  }

  const paths = sorted(new Set([...l.keys(), ...r.keys(), ...base.keys()]));
  for (const path of paths) {
    if (done.has(path)) continue;
    decide(path, [hashOf(l, path), hashOf(r, path), base.get(path) ?? null], first, taken, copyName, actions);
  }

  const deletions = actions.filter((a) => a.t === "deleteLocal" || a.t === "deleteRemote").length;
  // At least 3 (item 9, revised 2026-10-10): in a small folder a fifth is
  // one or two files, and one or two deletions are no folder gone.
  const many = deletions >= PAUSE_FLOOR && (deletions > 50 || deletions * 5 > size);
  return { actions, pause: many && !confirmed ? deletions : null, held: named.held };
}

type Named = {
  local: Files;
  remote: Files;
  base: Map<string, string>;
  rebased: [string, string, string][];
  held: Held[];
};

/** One name, one file (spec Q7): two paths that differ only in their
 *  accents' Unicode form are one file, here, there and in the base. */
function oneNameOneFile(local: Files, remote: Files, base: Map<string, string>): Named {
  const named: Named = { local: new Map(), remote: new Map(), base: new Map(), rebased: [], held: [] };
  const byName = (files: Files): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    for (const p of sorted(files.keys())) {
      const name = foldedForm(p);
      out.set(name, [...(out.get(name) ?? []), p]);
    }
    return out;
  };
  const sortedEntries = <T>(m: Map<string, T>): [string, T][] => sorted(m.keys()).map((k) => [k, m.get(k)!]);
  // Which of a name's spellings is planned; the others are held.
  const pick = (name: string, paths: string[], first: string | undefined, other: Files): string | undefined =>
    (first !== undefined && paths.includes(first) ? first : undefined) ??
    paths.find((p) => base.has(p)) ??
    paths.find((p) => other.has(p)) ??
    paths.find((p) => p === name) ??
    paths[0];
  // Name → the spelling it is planned under.
  const spelling = new Map<string, string>();
  for (const [name, paths] of sortedEntries(byName(local))) {
    const kept = pick(name, paths, undefined, remote);
    if (kept === undefined) continue;
    for (const p of paths.filter((p) => p !== kept)) named.held.push({ path: p, here: true, case: false });
    const f = local.get(kept);
    if (f) named.local.set(kept, f);
    spelling.set(name, kept);
  }
  for (const [name, paths] of sortedEntries(byName(remote))) {
    const mine = spelling.get(name);
    const chosen = pick(name, paths, mine, local);
    if (chosen === undefined) continue;
    for (const p of paths.filter((p) => p !== chosen)) named.held.push({ path: p, here: false, case: false });
    const at = mine ?? chosen;
    const f = remote.get(chosen);
    if (f) named.remote.set(at, f);
    if (!spelling.has(name)) spelling.set(name, at);
  }
  for (const [p, h] of sortedEntries(base)) {
    const to = spelling.get(foldedForm(p)) ?? p;
    if (to === p || base.has(to) || named.base.has(to)) {
      named.base.set(p, h);
    } else {
      named.base.set(to, h);
      named.rebased.push([p, to, h]);
    }
  }
  return named;
}

/** Two files on the server whose names differ only in case (its disk tells
 *  case apart): this device keeps one of them, the same on every pass, and
 *  holds the others. The ones this device has, or synced before, stay in
 *  play; when none does, the first in byte order. */
function caseTwinsThere(local: Files, remote: Files, base: Map<string, string>, held: Held[]): void {
  const byName = new Map<string, string[]>();
  for (const p of sorted(remote.keys())) {
    const name = folded(p);
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  for (const name of sorted(byName.keys())) {
    const paths = byName.get(name)!;
    if (paths.length < 2) continue;
    let kept = paths.filter((p) => local.has(p) || base.has(p));
    if (kept.length === 0) kept = [paths[0]!];
    for (const p of paths.filter((p) => !kept.includes(p))) {
      remote.delete(p);
      held.push({ path: p, here: false, case: true });
    }
  }
}

function decide(path: string, [l, r, b]: Hashes, first: boolean, taken: Set<string>, copyName: CopyName, actions: Action[]): void {
  const conflict = (hash: string): void => {
    const copy = copyName(path, taken);
    taken.add(copy);
    actions.push({ t: "conflict", path, copy, hash });
  };
  if (l === r) {
    if (b !== l) actions.push({ t: "agree", path, hash: l });
    return;
  }
  if (first) {
    // No base: copy what one side alone has, conflict on both.
    if (l !== null && r === null) actions.push({ t: "upload", path, base: null });
    else if (l === null && r !== null) actions.push({ t: "download", path, hash: r });
    else if (l !== null && r !== null) conflict(r);
    return;
  }
  const localChanged = l !== b;
  const remoteChanged = r !== b;
  if (!localChanged && remoteChanged) {
    if (r !== null) actions.push({ t: "download", path, hash: r });
    else if (l !== null) actions.push({ t: "deleteLocal", path });
  } else if (localChanged && !remoteChanged) {
    if (l !== null) actions.push({ t: "upload", path, base: r });
    else if (r !== null) actions.push({ t: "deleteRemote", path, base: r });
  } else if (l === null && r !== null) {
    // Deleted here, edited there: the edit wins.
    actions.push({ t: "download", path, hash: r });
  } else if (l !== null && r === null) {
    // Edited here, deleted there: the file comes back.
    actions.push({ t: "upload", path, base: null });
  } else if (l !== null && r !== null) {
    conflict(r);
  } else {
    actions.push({ t: "agree", path, hash: null });
  }
}

// ---- Two appends joined (ADR 0079 item 8) ----------------------------------

/** Whether a path is one the append-merge applies to: a note (`.md`, in
 *  any case). */
export function mergesByAppend(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.length > 3 && name.slice(-3).toLowerCase() === ".md";
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const NL = 0x0a;

/** The base, the server's tail, then this side's, on a line of its own: a
 *  newline between them when the server's ends mid-line and this one does
 *  not start with one (the engine's `joined`, verso-core sync/append.rs). */
const joined = (prefix: Uint8Array, there: Uint8Array, here: Uint8Array): Uint8Array =>
  there.length > 0 && there[there.length - 1] !== NL && here.length > 0 && here[0] !== NL
    ? concat(prefix, there, Uint8Array.of(NL), here)
    : concat(prefix, there, here);

/** The two appends joined, or null when the change on both sides is not two
 *  appends. `base` is the SHA-256 of the file both sides last agreed on;
 *  its length is found: the one prefix shared by both versions whose hash
 *  is `base`. The result is the base, the server's tail (`remote`), then
 *  this device's (`local`). */
export function appendMerge(base: string, local: Uint8Array, remote: Uint8Array): Uint8Array | null {
  const shortest = Math.min(local.length, remote.length);
  if (shortest === 0) return null;
  let common = 0;
  while (common < shortest && local[common] === remote[common]) common++;
  const hasher = new Sha256();
  let hashed = 0;
  for (let k = 0; k <= Math.min(common, shortest - 1); k++) {
    const endsLine = k === 0 || local[k - 1] === NL;
    const tailsStartLine = local[k] === NL && remote[k] === NL;
    if (!(endsLine || tailsStartLine)) continue;
    hasher.update(local.subarray(hashed, k));
    hashed = k;
    if (hasher.clone().hex() === base) return joined(local.subarray(0, k), remote.subarray(k), local.subarray(k));
  }
  return null;
}

/** The longest prefix `templateMerge` hashes in search of the template. */
const TEMPLATE_MAX = 1 << 20;

/** Two versions of a note that both sides made apart, each from the same
 *  filled template (ADR 0093 item 12): the template is their base, each
 *  side's additions after it are appends, and they are joined. Unlike
 *  `appendMerge`, a side may have added nothing. */
export function templateMerge(template: string, local: Uint8Array, remote: Uint8Array): Uint8Array | null {
  if (local.length === remote.length && local.every((b, i) => b === remote[i])) return null;
  const shortest = Math.min(local.length, remote.length);
  let common = 0;
  while (common < shortest && local[common] === remote[common]) common++;
  const hasher = new Sha256();
  let hashed = 0;
  for (let k = 0; k <= Math.min(common, TEMPLATE_MAX); k++) {
    const here = local.subarray(k);
    const there = remote.subarray(k);
    const oneEmpty = here.length === 0 || there.length === 0;
    const endsLine = k === 0 || local[k - 1] === NL;
    const tailsStartLine = here[0] === NL && there[0] === NL;
    if (!(oneEmpty || endsLine || tailsStartLine)) continue;
    hasher.update(local.subarray(hashed, k));
    hashed = k;
    if (hasher.clone().hex() === template) return joined(local.subarray(0, k), there, here);
  }
  return null;
}
