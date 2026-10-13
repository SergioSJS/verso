// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A board edited by several people at once (ADR 0082 item 12, decided by
// the maintainer on 2026-10-12), its pure parts: no Yjs, no Excalidraw,
// no contract. The room's document keeps the board's elements in one map,
// an entry per element and version — `id\nversion\nversionNonce` → the
// element as JSON (the server's `collab_board.rs` reads the same keys).
// The rule that picks among an element's entries is Excalidraw's own
// reconciliation: the higher `version` wins; on a tie, the lower
// `versionNonce`; the same on every side, whatever order the edits came
// in. A deletion is the element with `isDeleted` at a higher version — a
// tombstone — so a move made meanwhile does not bring it back.
//
// The file is made of the room's elements by the board's own converter
// (`fromElements`, model.ts), laid over the canvas the room was made from:
// every window that holds the same state makes the same file.

import { type CanvasDoc, type CanvasEdge, type CanvasNode, type El, fromElements } from "./model";

/** An element's place among the others' versions of it. */
export type Rank = { version: number; nonce: number };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** An element's rank, as it carries it. */
export function rankOf(e: El): Rank {
  return { version: num(e["version"]), nonce: num(e["versionNonce"]) };
}

/** Whether `a` wins over `b`: the higher version; on a tie, the lower nonce. */
export function outranks(a: Rank, b: Rank): boolean {
  return a.version > b.version || (a.version === b.version && a.nonce < b.nonce);
}

/** The entry's key for an element at a rank. */
export function entryKey(id: string, r: Rank): string {
  return `${id}\n${r.version}\n${r.nonce}`;
}

/** The element and rank a key names; null when it names none. */
export function parseKey(key: string): { id: string; rank: Rank } | null {
  const b = key.lastIndexOf("\n");
  const a = b > 0 ? key.lastIndexOf("\n", b - 1) : -1;
  if (a < 0) return null;
  const version = Number(key.slice(a + 1, b));
  const nonce = Number(key.slice(b + 1));
  if (!Number.isFinite(version) || !Number.isFinite(nonce)) return null;
  return { id: key.slice(0, a), rank: { version, nonce } };
}

/** The elements the entries hold: per element, the winning entry. A tie in
 *  rank, as two windows drawing in the same file make, goes to the lesser
 *  text, so that everyone reads the same one. */
export function resolve(entries: Iterable<readonly [string, string]>): Map<string, El> {
  const best = new Map<string, { rank: Rank; json: string }>();
  for (const [key, json] of entries) {
    const k = parseKey(key);
    if (!k || typeof json !== "string") continue;
    const was = best.get(k.id);
    if (!was || outranks(k.rank, was.rank) || (k.rank.version === was.rank.version && k.rank.nonce === was.rank.nonce && json < was.json)) best.set(k.id, { rank: k.rank, json });
  }
  const out = new Map<string, El>();
  for (const [id, { json }] of best) {
    try {
      const el = JSON.parse(json) as El;
      if (el && typeof el === "object" && el.id === id) out.set(id, el);
    } catch {
      // An entry that is not an element is read as none.
    }
  }
  return out;
}

/** The keys of `id`'s entries that `rank` outranks: a window that writes
 *  that version removes them. */
export function outrankedKeys(keys: Iterable<string>, id: string, rank: Rank): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const k = parseKey(key);
    if (k && k.id === id && outranks(rank, k.rank)) out.push(key);
  }
  return out;
}

/** How far a deletion's version jumps ahead. Excalidraw counts a version
 *  up on each change — a drag, a step per frame — so a move made at the
 *  same time as a deletion, counting from where it started, could outrank
 *  it and bring the element back. A deletion sent at a million versions
 *  ahead is never outranked by a move made without seeing it; an undo made
 *  after it counts from the deletion's version, and wins. */
export const DELETE_JUMP = 1_000_000;

/** `e` as it goes to the room: a deletion of an element the room holds
 *  undeleted jumps ahead (`DELETE_JUMP`). */
export function sendable(e: El, held: El | undefined): El {
  if (!e.isDeleted || held?.isDeleted === true) return e;
  return { ...e, version: Math.max(rankOf(e).version, held ? rankOf(held).version : 0) + DELETE_JUMP };
}

/** Whether `e` is this window's own change, not sent yet: its version is
 *  not the one the board last agreed on with the room (`known` — what it
 *  sent, or took in from the room). Excalidraw makes a new version, with a
 *  new nonce, at every change. */
export function unsent(e: El, known: ReadonlyMap<string, Rank>): boolean {
  const k = known.get(e.id);
  const r = rankOf(e);
  return !k || k.version !== r.version || k.nonce !== r.nonce;
}

/** The elements of `scene` this window changed and has not sent (`unsent`).
 *  Each goes, whatever the room holds: the rule picks among the versions,
 *  and one that loses is brought back to the room's on the board. */
export function changedElements(scene: readonly El[], known: ReadonlyMap<string, Rank>): El[] {
  return scene.filter((e) => unsent(e, known));
}

/** The elements in the board's order: by their fractional index, then by
 *  id — the order every window agrees on. */
export function ordered(elements: Iterable<El>): El[] {
  const idx = (e: El): string => (typeof e["index"] === "string" ? (e["index"] as string) : "");
  return [...elements].sort((a, b) => {
    const x = idx(a);
    const y = idx(b);
    if (x !== y) return x < y ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** The scene after the room's elements `remote` came in over `local`: an
 *  element the room has a winning version of takes it, unless this window
 *  is changing it right now (`busy`: a text typed, a shape dragged) or
 *  holds a version of its own that wins and is still on its way
 *  (`mine`). Elements new to this window come in; the result is in the
 *  board's order. */
export function mergeScene(local: readonly El[], remote: Iterable<El>, busy: ReadonlySet<string>, mine: (e: El) => boolean): El[] {
  const byId = new Map(local.map((e) => [e.id, e] as const));
  for (const r of remote) {
    const l = byId.get(r.id);
    // The room's version, also at the same rank: two windows that drew the
    // same file in measured its texts each their way, and the room keeps
    // one.
    // A deletion of this window's still on its way counts as it will be
    // sent — jumped ahead (`sendable`): a drag heard meanwhile does not
    // undo it here before it ever leaves.
    if (l && (busy.has(r.id) || (mine(l) && outranks(rankOf(sendable(l, r)), rankOf(r))))) continue;
    byId.set(r.id, r);
  }
  return ordered(byId.values());
}

/** The canvas the room's elements make, laid over the canvas the room was
 *  made from (its other keys kept) with the room's background: exactly what
 *  a window's board would save, so the file is the converter's output of
 *  the merged scene. */
export function canvasOf(elements: Iterable<El>, base: CanvasDoc, background: string | null): CanvasDoc {
  return fromElements(ordered(elements), base, background);
}

/** What a person changed when the board's file is given anew — its text
 *  edited, or a link rewritten after a rename: the elements to send, each
 *  at a version above the room's so that it wins, and a deletion as a
 *  tombstone. `room` is the room's elements now; `drawn` the elements the
 *  new canvas draws (`toElements` restored); `was` the canvas the change
 *  was made over (the file as the text was read, a plan's "before"), and
 *  `next` the changed one. Only what differs between the two is sent — a
 *  card, an edge, a drawn element — so what others changed in the room
 *  meanwhile, and what the board adjusts by itself, stay as the room has
 *  them. */
export function patchFromCanvas(room: ReadonlyMap<string, El>, drawn: readonly El[], was: CanvasDoc, next: CanvasDoc, nonce: () => number): El[] {
  const item = (doc: CanvasDoc): Map<string, string> => {
    const out = new Map<string, string>();
    for (const n of doc.nodes ?? []) if (n && typeof (n as CanvasNode).id === "string") out.set((n as CanvasNode).id, JSON.stringify(n));
    for (const e of doc.edges ?? []) if (e && typeof (e as CanvasEdge).id === "string") out.set((e as CanvasEdge).id, JSON.stringify(e));
    for (const d of doc.verso?.drawing ?? []) {
      const r = d as Record<string, unknown> | null;
      if (r && typeof r["id"] === "string") out.set(r["id"], JSON.stringify(r));
    }
    return out;
  };
  const before = item(was);
  const after = item(next);
  const drawnById = new Map(drawn.map((e) => [e.id, e] as const));
  const out: El[] = [];
  const bump = (e: El, held: El | undefined): El => {
    const v = Math.max(rankOf(e).version, held ? rankOf(held).version : 0) + 1;
    return { ...e, version: v, versionNonce: nonce(), ...(held && typeof held["index"] === "string" ? { index: held["index"] } : {}) };
  };
  // Changed or new: the new canvas's element, above the room's version.
  for (const [id, json] of after) {
    if (before.get(id) === json) continue;
    const e = drawnById.get(id);
    if (!e) continue;
    out.push(bump(e, room.get(id)));
    // An edge's label is its own element: it goes with the edge.
    const label = drawnById.get(`${id}-label`);
    if (label) out.push(bump(label, room.get(label.id)));
  }
  // Gone: the room's element as a tombstone.
  for (const id of before.keys()) {
    if (after.has(id)) continue;
    const held = room.get(id);
    if (!held || held.isDeleted) continue;
    out.push(sendable(bump({ ...held, isDeleted: true }, held), held));
    for (const b of held.boundElements ?? []) {
      const t = room.get(b.id);
      if (b.type === "text" && t && !t.isDeleted) out.push(sendable(bump({ ...t, isDeleted: true }, t), t));
    }
  }
  return out;
}
