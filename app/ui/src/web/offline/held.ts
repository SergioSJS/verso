// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A session the server ended while this browser had changes not sent (ADR
// 0092 item 6, revised 2026-11-15): the changes are kept, the rest of the
// copy goes. "The session is ended to close the access, not to lose the
// work of the person who had it" (the maintainer, answering 5.1 with B).
//
// What is kept, per folder of the account: each file written here since
// the base — its bytes and the base it was written over — and each file of
// the base deleted here. Nothing else of the folder stays: the files that
// did not change are the server's, which a person signed in again fetches
// anew, and keeping them would leave the account's folder readable in a
// browser nobody is signed in to (a shared computer). The kept changes are
// a fact of the same store as the copy (IndexedDB, `verso-offline`), held
// as the copy is — not encrypted, ADR 0092 item 6 — and wiped with it when
// the person signs out.
//
// The same account signed in again on this browser: the folder is kept
// again with those files and a base of only their paths, and its sync
// sends them by sync's own rules (ADR 0079) — the server judges each one:
// the role, the base it was written over (invariant 11: changed there since
// is a conflict's copy or an append joined, never an overwrite), the trash.
// Another account: they are never sent as its own, never shown among its
// folders; it may download them as files, or discard them.

import { newState } from "./engine";
import type { Kept, Store } from "./store";

/** The fact the kept changes are under. */
export const HELD = "held";

/** One change kept: the file written here (`bytes`), or deleted here
 *  (`bytes` null); `base`, the hash both sides last agreed on (null: a new
 *  file). */
export type HeldFile = { path: string; base: string | null; bytes: Uint8Array | null; hash: string | null; modified: number };

/** A folder's changes kept for the account that made them. */
export type HeldFolder = {
  account: string;
  id: string;
  key: string;
  name: string;
  role: string;
  attachments: "opened" | "all";
  since: string;
  /** When the session ended. */
  held: string;
  files: HeldFile[];
  /** The template bases of notes made here (`State.made`) among them. */
  made: [string, string][];
};

const same = (a: HeldFolder, b: { account: string; id: string }): boolean => a.account === b.account && a.id === b.id;

async function heldOf(store: Store): Promise<HeldFolder[]> {
  return (await store.fact<HeldFolder[]>(HELD)) ?? [];
}

/** The changes a folder kept here has not sent. */
async function changesOf(store: Store, kept: Kept, now: string): Promise<HeldFolder | null> {
  const [listing, state] = await Promise.all([store.listing(kept.id), store.state(kept.id)]);
  const base = state?.base ?? new Map<string, string>();
  const files: HeldFile[] = [];
  for (const [path, meta] of listing) {
    if (base.get(path) === meta.hash) continue;
    const f = await store.file(kept.id, path);
    if (f) files.push({ path, base: base.get(path) ?? null, bytes: f.bytes, hash: f.hash, modified: f.modified });
  }
  for (const [path, hash] of base) if (!listing.has(path)) files.push({ path, base: hash, bytes: null, hash: null, modified: 0 });
  if (files.length === 0) return null;
  const paths = new Set(files.map((f) => f.path));
  const made = [...(state?.made ?? new Map<string, string>())].filter(([p]) => paths.has(p));
  return { account: kept.account, id: kept.id, key: kept.key, name: kept.name, role: kept.role, attachments: kept.attachments, since: kept.since, held: now, files, made };
}

/** The session ended: each folder kept here leaves only the changes it had
 *  not sent, kept for its account; the rest of the copy, and the account
 *  last seen, go. The changes are written before anything is deleted, so a
 *  page closed half-way loses nothing (the next one does it again: a
 *  folder still kept replaces what it kept before). Returns how many
 *  changes are kept for the folders it held now. */
export async function holdChanges(store: Store, now = new Date().toISOString().replace(/\.\d+Z$/, "Z")): Promise<number> {
  const folders = await store.folders();
  const fresh: HeldFolder[] = [];
  for (const k of folders) {
    const h = await changesOf(store, k, now);
    if (h) fresh.push(h);
  }
  const before = await heldOf(store);
  const kept = before.filter((h) => !folders.some((k) => same(h, k)));
  await store.putFact(HELD, [...kept, ...fresh]);
  for (const k of folders) await store.removeFolder(k.id);
  await store.putFact("state", null);
  return fresh.reduce((n, h) => n + h.files.length, 0);
}

/** The changes kept on this browser, by whose they are. */
export async function heldChanges(store: Store): Promise<HeldFolder[]> {
  return heldOf(store);
}

/** How many changes are kept, of every account. */
export async function heldCount(store: Store): Promise<number> {
  return (await heldOf(store)).reduce((n, h) => n + h.files.length, 0);
}

/** The account signed in again: its folders kept again with their changes
 *  and a base of only those paths, so that sync sends them and fetches the
 *  rest (ADR 0079: a file only on the server, with no base, comes; one
 *  written here over a base goes up against that base). A folder already
 *  kept here again by the account keeps its copy, which holds the
 *  changes; by another, it is left alone and the changes stay apart. Returns the
 *  folders restored and how many changes they carry. An account with no
 *  id gets nothing: the changes are never another's. */
export async function restoreChanges(store: Store, account: string): Promise<{ folders: Kept[]; count: number }> {
  const all = await heldOf(store);
  const mine = account === "" ? [] : all.filter((h) => h.account === account);
  if (mine.length === 0) return { folders: [], count: 0 };
  const folders: Kept[] = [];
  const done: HeldFolder[] = [];
  let count = 0;
  for (const h of mine) {
    const there = await store.folder(h.id);
    if (there) {
      // Its own copy holds the changes (a page closed half-way); another
      // account's copy of the folder is never written over: kept apart.
      if (there.account === h.account) done.push(h);
      continue;
    }
    const kept: Kept = { key: h.key, id: h.id, name: h.name, role: h.role, account: h.account, attachments: h.attachments, opened: [], since: h.since, last: null };
    const state = newState("", h.id);
    for (const f of h.files) if (f.base !== null) state.base.set(f.path, f.base);
    for (const [p, hash] of h.made) state.made.set(p, hash);
    // The folder's row last: until it is there nothing syncs it, and a
    // page closed before does all of it again.
    await store.putState(h.id, state);
    for (const f of h.files) {
      if (f.bytes && f.hash) await store.putFile(h.id, { path: f.path, bytes: f.bytes, hash: f.hash, size: f.bytes.length, modified: f.modified });
    }
    await store.putFolder(kept);
    folders.push(kept);
    done.push(h);
    count += h.files.length;
  }
  await store.putFact(HELD, all.filter((h) => !done.includes(h)));
  return { folders, count };
}

/** Another account's changes, discarded (the person said so). */
export async function discardChanges(store: Store, of: (h: HeldFolder) => boolean): Promise<void> {
  const all = await heldOf(store);
  await store.putFact(HELD, all.filter((h) => !of(h)));
}
