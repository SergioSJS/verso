// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Sync's client in the browser (ADR 0092 item 1): a folder kept in this
// browser, compared with its folder on the server and carried into step by
// **the desktop's protocol and rules** (ADR 0079; `app/src-tauri/src/
// sync.rs` and `sync/transfer.rs`) — the server's `sync_state` and
// `sync_changes`, a file read and written in pieces of 1 MiB with `sync_read`
// and `sync_put`, deletions and renames by hash, a conflict kept as a copy
// beside the file, two appends to a note joined, the first sync never
// deleting, a pause on mass deletions. Offline, nothing queues but the
// state's difference (item 6): a write made here is a file whose hash is not
// its base's, and it goes up when the connection returns.
//
// A browser cannot set a header on its WebSocket, so it says no sync version
// and the server speaks to it as it does to a window: pieces as base64 in the
// JSON (ADR 0079 item 5 — a connection that says none is never refused).
//
// Everything here is written against `Remote` and `Store`: the same code is
// tested in Node against an in-memory store and a model of the server's
// rules (test/offlineSync.test.mjs), and runs in the page against IndexedDB
// and the bridge's WebSocket.

import type { SyncLogEntry, SyncRefused, SyncStatus } from "../../bindings";
import { appendMerge, conflictName, type Files, LARGEST, mergesByAppend, newState, plan, type State, templateMerge } from "./engine";
import { sha256 } from "./sha256";
import { type FileMeta, type Kept, type Store, StoreFull, type StoredFile } from "./store";

/** A piece of a file on the wire (ADR 0079 item 12), the server's. */
export const PIECE = 1 << 20;
/** How many lines of what crossed the window is shown. */
const LOG_LINES = 200;

// ---- The server, as the syncer asks it ---------------------------------------

/** A command of the contract over the connection: it answers, or throws a
 *  contract error (`{ kind, message }`); a connection that is not there
 *  throws one with `transport: true`. */
export type Wire = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
export type WireError = { kind: string; message: string; transport?: boolean };

export type Change = { seq: number; path: string; hash?: string | null; size?: number; deleted?: boolean; renamedFrom?: string | null; by?: string | null; device?: string | null };

export interface Remote {
  state(): Promise<{ head: number; files: { path: string; hash: string; size: number }[] }>;
  changes(since: number): Promise<{ head: number; changes: Change[]; more: boolean }>;
  read(path: string, offset: number): Promise<{ size: number; done: boolean; hash: string | null; bytes: Uint8Array }>;
  put(args: { path: string; offset: number; size: number; hash: string; base: string | null }, bytes: Uint8Array): Promise<{ done: boolean; path?: string }>;
  delete(path: string, base: string): Promise<void>;
  rename(from: string, to: string, base: string): Promise<{ path?: string }>;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The server's sync commands over the window's connection. */
export class WireRemote implements Remote {
  constructor(private wire: Wire) {}

  async state() {
    const a = (await this.wire("sync_state", {})) as { head?: number; files?: { path: string; hash: string; size: number }[] };
    return { head: a.head ?? 0, files: a.files ?? [] };
  }
  async changes(since: number) {
    const a = (await this.wire("sync_changes", { since })) as { head?: number; changes?: Change[]; more?: boolean };
    return { head: a.head ?? 0, changes: a.changes ?? [], more: a.more === true };
  }
  async read(path: string, offset: number) {
    const a = (await this.wire("sync_read", { path, offset })) as { size?: number; done?: boolean; hash?: string | null; data?: string };
    return { size: a.size ?? 0, done: a.done === true, hash: a.hash ?? null, bytes: a.data ? fromBase64(a.data) : new Uint8Array(0) };
  }
  async put(args: { path: string; offset: number; size: number; hash: string; base: string | null }, bytes: Uint8Array) {
    const a = (await this.wire("sync_put", { ...args, data: toBase64(bytes) })) as { done?: boolean; path?: string };
    return { done: a.done === true, ...(a.path ? { path: a.path } : {}) };
  }
  async delete(path: string, base: string) {
    await this.wire("sync_delete", { path, base });
  }
  async rename(from: string, to: string, base: string) {
    const a = (await this.wire("sync_rename", { from, to, base })) as { path?: string };
    return a.path ? { path: a.path } : {};
  }
}

// ---- Why a step did not happen -------------------------------------------------

/** A step that did not happen, and what follows (`transfer.rs`' `Refusal`). */
type Refusal =
  | { t: "connection"; error: WireError }
  /** The file is listed as not synced, with its reason. */
  | { t: "file"; path: string; reason: string; message: string }
  /** The file changed while the pass ran: the next one sees it. */
  | { t: "again"; path: string; message: string };

const hold = (r: Refusal): Refusal => r;

function ofServer(path: string, e: unknown): Refusal {
  const err = (e ?? {}) as Partial<WireError>;
  const message = err.message ?? String(e);
  if (err.transport === true) return { t: "connection", error: { kind: "unavailable", message, transport: true } };
  switch (err.kind) {
    case "changed":
      return { t: "again", path, message };
    case "exists":
    case "case_twin":
      return { t: "file", path, reason: "name_taken", message };
    case "quota":
      return { t: "file", path, reason: "quota", message };
    case "refused":
      // A reader's change is refused by the role (the server's words).
      return { t: "file", path, reason: /only read/i.test(message) ? "reader" : "failed", message };
    case "unreachable":
      return { t: "connection", error: { kind: "unreachable", message, transport: true } };
    default:
      return { t: "file", path, reason: "failed", message };
  }
}

const readerRefusal = (path: string): Refusal => ({ t: "file", path, reason: "reader", message: "you may only read the server's folder: this change stays here" });

const ATTACHMENTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "heic", "heif", "svg", "ico", "pdf", "mp3", "m4a", "wav", "ogg", "oga", "flac", "mp4", "m4v", "mov", "webm", "mkv", "ogv"]);

/** An attachment in the sense of ADR 0092 item 3: a picture, a PDF, sound or
 *  video — what a folder "kept once opened" does not fetch until it is
 *  opened. Notes, boards, bases and text files are kept whole. */
export function isAttachment(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 && ATTACHMENTS.has(name.slice(dot + 1).toLowerCase());
}

/** A conflict's copy, by its name (item 8), in either language. */
export function isConflictCopy(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.includes(" (conflict, ") || name.includes(" (conflito, ");
}

// ---- The syncer ------------------------------------------------------------------

export type SyncerOptions = {
  store: Store;
  remote: Remote;
  /** The folder kept; its `role` is the one the server last said. */
  kept: Kept;
  /** This device's name, for a conflict's copy. */
  device: () => string;
  /** Whether the person reads Portuguese, for a conflict's copy. */
  pt: () => boolean;
  /** The status changed. */
  shown?: (status: SyncStatus) => void;
  now?: () => Date;
  /** For a test: pieces smaller than a mebibyte. */
  piece?: number;
};

export type Passed = { actions: number; paused: number | null; again: number };

const stamp = (d: Date): string => d.toISOString().replace(/\.\d+Z$/, "Z");
const when = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
};

const filesOf = (listing: Map<string, FileMeta>): Files => new Map([...listing].map(([p, f]) => [p, { hash: f.hash, size: f.size }]));

export class Syncer {
  readonly store: Store;
  private remote: Remote;
  private opts: SyncerOptions;
  private id: string;
  /** The server's files and the head they are at: all of them on the
   *  connection's first pass, then the changes after the head. */
  private known: { files: Files; head: number } | null = null;
  private authors = new Map<string, { by: string | null; device: string | null }>();
  private again = new Map<string, number>();
  private confirmed = 0;
  paused = false;
  stopped = false;
  /** Changes this device has sent (a file, a deletion, a rename, a copy, a
   *  join) since it was made: the difference between two readings is what
   *  a pass sent. */
  sentCount = 0;
  private running: Promise<Passed> | null = null;
  /** Files sent this pass that were edited here while they went: a pass
   *  runs again for them. */
  private newerHere = 0;
  private log: SyncLogEntry[] = [];
  private refused = new Map<string, SyncRefused>();
  private piece: number;
  status: SyncStatus;

  constructor(opts: SyncerOptions) {
    this.opts = opts;
    this.store = opts.store;
    this.remote = opts.remote;
    this.id = opts.kept.id;
    this.piece = opts.piece ?? PIECE;
    this.status = {
      key: "",
      on: true,
      server: "",
      folder: opts.kept.id,
      folder_name: opts.kept.name,
      role: opts.kept.role,
      state: "starting",
      sending: 0,
      receiving: 0,
      deletions: null,
      conflicts: [],
      refused: [],
      cloud_only: [],
      log: [],
      last: null,
      message: null,
      problem: null,
      versions: null,
      revoked: null,
      cloud: null,
    };
  }

  /** The window's folder key and the server's address, for the status. */
  describe(key: string, server: string): void {
    this.set((s) => {
      s.key = key;
      s.server = server;
    });
  }

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  private set(f: (s: SyncStatus) => void): void {
    f(this.status);
    this.opts.shown?.({ ...this.status });
  }

  /** The connection is new: the server's files are asked for in full. */
  reconnected(): void {
    this.known = null;
  }

  setRole(role: string): void {
    this.opts.kept.role = role;
    this.set((s) => {
      s.role = role;
    });
  }

  pause(paused: boolean): void {
    this.paused = paused;
    this.set((s) => {
      if (paused) s.state = "paused";
      else if (s.state === "paused") s.state = "synced";
    });
  }

  /** The person said yes to the deletions the pause showed (item 9). */
  confirm(): void {
    if (this.status.deletions !== null) this.confirmed = this.status.deletions;
  }

  /** Mark the connection down: the state says so, and nothing is lost —
   *  what was written waits as the difference from the base. */
  offline(message?: string, problem?: string): void {
    this.set((s) => {
      s.state = "offline";
      s.sending = 0;
      s.receiving = 0;
      s.message = message ?? null;
      s.problem = problem ?? null;
    });
  }

  /** The sync cannot go on, and why (`SyncStatus::problem`). */
  problem(problem: string, message: string): void {
    this.set((s) => {
      s.state = "error";
      s.problem = problem;
      s.message = message;
      s.sending = 0;
      s.receiving = 0;
    });
  }

  /** The number of writes waiting to go up is shown while offline. */
  waitingNow(n: number): void {
    if (this.status.state !== "offline" || this.status.sending === n) return;
    this.set((s) => {
      s.sending = n;
    });
  }

  /** One pass, or the one already running: at most one at a time. */
  pass(): Promise<Passed> {
    if (this.running) return this.running;
    this.running = this.passOnce()
      .catch((e: unknown) => {
        this.failed(e);
        return { actions: 0, paused: null, again: 0 };
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  /** A pass, and — once — another for what changed under it. */
  async settle(): Promise<Passed> {
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const p = await this.pass();
      total += p.actions;
      if (p.paused !== null || p.again === 0 || this.stopped) return { ...p, actions: total };
    }
    return { actions: total, paused: null, again: 0 };
  }

  private failed(e: unknown): void {
    const err = (e ?? {}) as Partial<WireError>;
    const transport = err.transport === true || err.kind === "unreachable";
    this.set((s) => {
      s.sending = 0;
      s.receiving = 0;
      if (transport) {
        s.state = "offline";
        s.message = err.message ?? null;
        s.problem = null;
      } else if (err.kind === "refused" && /signed in|sign in|session/i.test(err.message ?? "")) {
        s.state = "error";
        s.message = err.message ?? null;
        s.problem = "signed_out";
      } else if (e instanceof StoreFull) {
        s.state = "error";
        s.message = e.message;
        s.problem = "storage_full";
      } else {
        s.state = "error";
        s.message = err.message ?? String(e);
        s.problem = "failed";
      }
    });
  }

  private crossed(what: string, path: string, other: string | null): void {
    if (what === "sent" || what === "deleted_there" || what === "renamed_there" || what === "conflict" || what === "merged") this.sentCount++;
    const fromThere = what === "received" || what === "deleted_here" || what === "renamed_here" || what === "conflict" || what === "merged";
    const a = fromThere ? this.authors.get(path) : undefined;
    this.log.unshift({ at: stamp(this.now()), what, path, other, by: a?.by ?? null, device: a?.device ?? null });
    this.log.length = Math.min(this.log.length, LOG_LINES);
    this.set((s) => {
      s.log = [...this.log];
    });
  }

  // ---- The server's side of the picture ----

  private async there(): Promise<{ files: Files; head: number }> {
    if (!this.known) {
      const a = await this.remote.state();
      this.known = { files: new Map(a.files.map((f) => [f.path, { hash: f.hash, size: f.size }])), head: a.head };
      return this.known;
    }
    const k = this.known;
    for (;;) {
      const asked = k.head;
      const a = await this.remote.changes(asked);
      for (const c of a.changes) {
        if (c.renamedFrom) k.files.delete(c.renamedFrom);
        this.authors.set(c.path, { by: c.by ?? null, device: c.device ?? null });
        if (c.hash && c.deleted !== true) k.files.set(c.path, { hash: c.hash, size: c.size ?? 0 });
        else k.files.delete(c.path);
        k.head = Math.max(k.head, c.seq);
      }
      if (!a.more) {
        k.head = Math.max(k.head, a.head);
        return k;
      }
      // A page that says there is more but moved nothing on would ask the
      // same question for ever: the rest waits for the next pass.
      if (k.head === asked) return k;
    }
  }

  // ---- A pass ----

  private async passOnce(): Promise<Passed> {
    if (this.stopped) return { actions: 0, paused: null, again: 0 };
    if (this.paused) {
      this.set((s) => {
        s.state = "paused";
        s.deletions = null;
      });
      return { actions: 0, paused: null, again: 0 };
    }
    this.set((s) => {
      s.state = "syncing";
      s.role = this.opts.kept.role;
      s.message = null;
      s.problem = null;
    });
    let remote: { files: Files; head: number };
    try {
      remote = await this.there();
    } catch (e) {
      // The connection or the server: the pass ends, what is here waits.
      this.known = null;
      throw e;
    }
    const state = (await this.store.state(this.id)) ?? newState("", this.id);
    state.folder = this.id;
    const local = filesOf(await this.store.listing(this.id));
    const pt = this.opts.pt();
    const device = this.opts.device();
    const at = when(this.now());
    const copyName = (p: string, taken: ReadonlySet<string>): string => conflictName(p, device, at, pt, taken);
    // A folder that keeps its attachments once opened leaves the ones
    // never opened where they are: not fetched, and not a deletion.
    const keep = this.opts.kept;
    let theirs = remote.files;
    if (keep.attachments === "opened") {
      const opened = new Set(keep.opened ?? []);
      theirs = new Map([...remote.files].filter(([p]) => !isAttachment(p) || local.has(p) || state.base.has(p) || opened.has(p)));
    }
    const planned = plan(local, theirs, state, false, copyName);
    const apart = new Map<string, SyncRefused>();
    // A name's other Unicode form held by another file (spec Q7), or a name
    // on the server another file there holds in another case (spec Q8):
    // listed, the same one on every pass, never sent or fetched to be
    // refused again.
    for (const h of planned.held) {
      apart.set(h.path, h.case
        ? { path: h.path, reason: "case_twin_there", message: "two names that differ only in case on the server; this device keeps one" }
        : { path: h.path, reason: "name_taken", message: "another file here has this name, its accents in another Unicode form: one name is one file everywhere" });
    }
    // A yes counts for the deletions the person saw, no more, and once.
    const yes = this.confirmed;
    this.confirmed = 0;
    if (planned.pause !== null && planned.pause <= yes) planned.pause = null;
    if (planned.pause !== null) {
      const n = planned.pause;
      this.set((s) => {
        s.state = "paused";
        s.deletions = n;
      });
      return { actions: 0, paused: n, again: 0 };
    }
    const reader = this.opts.kept.role === "reader";
    let sending = 0;
    let receiving = 0;
    for (const a of planned.actions) {
      if (a.t === "upload" || a.t === "deleteRemote" || a.t === "renameRemote") sending++;
      else if (a.t === "download" || a.t === "deleteLocal" || a.t === "renameLocal") receiving++;
      else if (a.t === "conflict") {
        sending++;
        receiving++;
      }
    }
    this.set((s) => {
      s.sending = sending;
      s.receiving = receiving;
      s.deletions = null;
    });
    let done = 0;
    let again = 0;
    this.newerHere = 0;
    // Paths a step of this pass could not carry out: a later step on the
    // same file waits for the next pass.
    const stuck = new Set<string>();
    for (const action of planned.actions) {
      if (this.stopped || this.paused) break;
      const touches: string[] =
        action.t === "renameRemote" || action.t === "renameLocal" ? [action.from, action.to] : action.t === "conflict" ? [action.path, action.copy] : [action.path];
      // Nothing is done to a file held apart.
      if (touches.some((p) => apart.has(p) || stuck.has(p))) continue;
      let refusal: Refusal | null = null;
      try {
        await this.carryOut(theirs, local, state, action, reader);
      } catch (e) {
        refusal = this.refusal(e, touches[0] ?? "");
      }
      if (refusal) for (const p of touches) stuck.add(p);
      if (!refusal) {
        done++;
        for (const p of touches) this.again.delete(p);
      } else if (refusal.t === "connection") {
        await this.save(state, remote.head);
        this.known = null;
        throw refusal.error;
      } else if (refusal.t === "file") {
        apart.set(refusal.path, { path: refusal.path, reason: refusal.reason, message: refusal.message });
      } else if (this.retried(refusal.path)) {
        // Changed meanwhile: the next pass sees it as it is now — once; a
        // refusal that comes back is listed, not retried for ever.
        apart.set(refusal.path, { path: refusal.path, reason: "changed", message: refusal.message });
      } else {
        again++;
      }
      if (action.t === "upload" || action.t === "deleteRemote" || action.t === "renameRemote") sending = Math.max(0, sending - 1);
      else if (action.t === "download" || action.t === "deleteLocal" || action.t === "renameLocal") receiving = Math.max(0, receiving - 1);
      else if (action.t === "conflict") {
        sending = Math.max(0, sending - 1);
        receiving = Math.max(0, receiving - 1);
      }
      this.set((s) => {
        s.sending = sending;
        s.receiving = receiving;
      });
    }
    await this.save(state, remote.head);
    const listing = await this.store.listing(this.id);
    const kept = await this.store.folder(this.id);
    if (kept) await this.store.putFolder({ ...kept, last: stamp(this.now()) });
    this.refused = apart;
    this.set((s) => {
      s.state = this.paused ? "paused" : "synced";
      s.sending = 0;
      s.receiving = 0;
      s.conflicts = [...listing.keys()].filter(isConflictCopy).sort();
      s.refused = [...apart.values()];
      s.last = stamp(this.now());
    });
    return { actions: done, paused: null, again: again + this.newerHere };
  }

  /** A file that changed or went while a pass ran: the first time, read
   *  again on a pass right after (`false`); when it comes back on the next
   *  pass too, `true`. */
  private retried(path: string): boolean {
    const n = (this.again.get(path) ?? 0) + 1;
    this.again.set(path, n);
    return n >= 2;
  }

  private refusal(e: unknown, path: string): Refusal {
    if (typeof e === "object" && e !== null && "t" in e) return e as Refusal;
    if (e instanceof StoreFull) return { t: "file", path, reason: "failed", message: e.message };
    return ofServer(path, e);
  }

  private async save(state: State, head: number): Promise<void> {
    if (this.stopped) return;
    state.cursor = head;
    state.paused = this.paused;
    // A note made from a template that both sides agree on, or that the
    // server holds since, needs no template base any more.
    for (const p of [...state.made.keys()]) if (state.base.has(p)) state.made.delete(p);
    await this.store.putState(this.id, state);
  }

  // ---- One step ----

  private async carryOut(remote: Files, local: Files, state: State, action: ReturnType<typeof plan>["actions"][number], reader: boolean): Promise<void> {
    switch (action.t) {
      case "agree":
        if (action.hash !== null) state.base.set(action.path, action.hash);
        else state.base.delete(action.path);
        return;
      case "upload": {
        if (reader) throw hold(readerRefusal(action.path));
        const sent = await this.upload(action.path, action.base);
        remote.delete(spelledThere(remote, action.path));
        remote.set(sent.landed, { hash: sent.hash, size: sent.size });
        state.base.set(action.path, sent.hash);
        this.crossed("sent", action.path, null);
        return;
      }
      case "download": {
        const got = await this.download(action.path);
        await this.writeHere(action.path, got.bytes, got.hash, local.get(action.path)?.hash ?? null);
        remote.set(spelledThere(remote, action.path), { hash: got.hash, size: got.bytes.length });
        local.set(action.path, { hash: got.hash, size: got.bytes.length });
        state.base.set(action.path, got.hash);
        this.crossed("received", action.path, null);
        return;
      }
      case "deleteRemote":
        if (reader) throw hold(readerRefusal(action.path));
        await this.remote.delete(action.path, action.base);
        remote.delete(spelledThere(remote, action.path));
        state.base.delete(action.path);
        this.crossed("deleted_there", action.path, null);
        return;
      case "deleteLocal": {
        // Only the file the pass saw goes.
        const now = (await this.store.listing(this.id)).get(action.path);
        if ((now?.hash ?? null) !== (local.get(action.path)?.hash ?? null)) throw hold({ t: "again", path: action.path, message: "changed since it was read" });
        await this.store.deleteFile(this.id, action.path);
        local.delete(action.path);
        state.base.delete(action.path);
        this.crossed("deleted_here", action.path, null);
        return;
      }
      case "renameRemote": {
        if (reader) throw hold(readerRefusal(action.to));
        const a = await this.remote.rename(action.from, action.to, action.base);
        const f = remote.get(spelledThere(remote, action.from));
        remote.delete(spelledThere(remote, action.from));
        if (f) remote.set(a.path ?? action.to, f);
        state.base.delete(action.from);
        state.base.set(action.to, action.base);
        this.crossed("renamed_there", action.to, action.from);
        return;
      }
      case "renameLocal": {
        await this.moveHere(action.from, action.to);
        const b = state.base.get(action.from);
        state.base.delete(action.from);
        if (b !== undefined) state.base.set(action.to, b);
        const f = local.get(action.from);
        local.delete(action.from);
        if (f) local.set(action.to, f);
        this.crossed("renamed_here", action.to, action.from);
        return;
      }
      case "conflict": {
        await this.conflict(remote, local, state, action.path, action.copy, reader);
        return;
      }
    }
  }

  /** The device's file at `path`, as the store holds it. */
  private async mine(path: string): Promise<StoredFile> {
    const f = await this.store.file(this.id, path);
    if (!f) throw hold({ t: "again", path, message: "gone here since it was read" });
    return f;
  }

  private async moveHere(from: string, to: string): Promise<void> {
    const f = await this.mine(from);
    await this.store.putFile(this.id, { ...f, path: to });
    await this.store.deleteFile(this.id, from);
  }

  /** The server's version written over the file the pass saw (invariant
   *  11): refused as changed when the file here is another. */
  private async writeHere(path: string, bytes: Uint8Array, hash: string, planned: string | null): Promise<void> {
    const now = (await this.store.listing(this.id)).get(path);
    if ((now?.hash ?? null) !== planned) throw hold({ t: "again", path, message: "changed since it was read" });
    await this.store.putFile(this.id, { path, bytes, hash, size: bytes.length, modified: this.now().getTime() });
  }

  /** Send this device's file at `path`, a piece at a time; the hash sent,
   *  its size, and the path it landed at (the spelling the server keeps). */
  private async upload(path: string, base: string | null): Promise<{ hash: string; size: number; landed: string }> {
    const f = await this.mine(path);
    if (f.size > LARGEST) throw hold({ t: "file", path, reason: "too_large", message: "a file of more than 1 GiB is not synced" });
    const size = f.bytes.length;
    let offset = 0;
    for (;;) {
      const end = Math.min(size, offset + this.piece);
      const a = await this.remote.put({ path, offset, size, hash: f.hash, base }, f.bytes.subarray(offset, end));
      if (a.done) {
        // The server took it: what it holds now is what was sent, and that
        // is the base, as the desktop's upload records it. Edited here
        // while it went, the newer text is a change of this side alone,
        // sent by a pass right after — never refused here, which left the
        // base behind and made this device's own upload look like the
        // server's edit (a conflict copy; a note's tail joined twice).
        const now = (await this.store.listing(this.id)).get(path);
        if (now?.hash !== f.hash) this.newerHere++;
        return { hash: f.hash, size, landed: a.path ?? path };
      }
      if (end >= size) throw hold({ t: "again", path, message: "changed while it crossed" });
      offset = end;
    }
  }

  /** The server's file at `path`, whole, its hash checked. */
  private async download(path: string): Promise<{ bytes: Uint8Array; hash: string }> {
    const parts: Uint8Array[] = [];
    let length = 0;
    let hash = "";
    for (;;) {
      const a = await this.remote.read(path, length);
      if (a.hash) hash = a.hash;
      parts.push(a.bytes);
      length += a.bytes.length;
      if (a.done) break;
      if (a.bytes.length === 0) throw hold({ t: "again", path, message: "changed while it crossed" });
    }
    const bytes = new Uint8Array(length);
    let at = 0;
    for (const p of parts) {
      bytes.set(p, at);
      at += p.length;
    }
    if (sha256(bytes) !== hash) throw hold({ t: "again", path, message: "changed while it crossed" });
    return { bytes, hash };
  }

  private async conflict(remote: Files, local: Files, state: State, path: string, copy: string, reader: boolean): Promise<void> {
    // The server's version first: it takes the name, or, when both sides
    // appended to a note, its tail joins this device's (item 8).
    const theirs = await this.download(path);
    const baseHash = state.base.get(path);
    const template = state.made.get(path);
    const planned = local.get(path)?.hash;
    if (!reader && mergesByAppend(path) && planned !== undefined && (baseHash !== undefined || template !== undefined)) {
      const mine = await this.mine(path);
      if (mine.hash !== planned) throw hold({ t: "again", path, message: "changed since it was read" });
      const joined = baseHash !== undefined ? appendMerge(baseHash, mine.bytes, theirs.bytes) : templateMerge(template ?? "", mine.bytes, theirs.bytes);
      if (joined) {
        // Written here over the file the pass read, then sent over the
        // server's version: its tail is this file's base, so a send refused
        // meanwhile is a change of this side alone on the next pass, never
        // the server's tail twice.
        const hash = sha256(joined);
        await this.store.putFile(this.id, { path, bytes: joined, hash, size: joined.length, modified: this.now().getTime() });
        remote.set(spelledThere(remote, path), { hash: theirs.hash, size: theirs.bytes.length });
        state.base.set(path, theirs.hash);
        state.made.delete(path);
        local.set(path, { hash, size: joined.length });
        this.crossed("merged", path, null);
        const sent = await this.upload(path, theirs.hash);
        remote.delete(spelledThere(remote, path));
        remote.set(sent.landed, { hash: sent.hash, size: sent.size });
        state.base.set(path, sent.hash);
        return;
      }
    }
    // This device's version steps aside under the copy's name…
    await this.moveHere(path, copy);
    state.base.delete(path);
    const f = local.get(path);
    local.delete(path);
    if (f) local.set(copy, f);
    // …the server's takes the name…
    await this.store.putFile(this.id, { path, bytes: theirs.bytes, hash: theirs.hash, size: theirs.bytes.length, modified: this.now().getTime() });
    local.set(path, { hash: theirs.hash, size: theirs.bytes.length });
    remote.set(spelledThere(remote, path), { hash: theirs.hash, size: theirs.bytes.length });
    state.base.set(path, theirs.hash);
    this.crossed("conflict", path, copy);
    // …and the copy goes to the others (a reader keeps it here).
    if (reader) throw hold(readerRefusal(copy));
    const sent = await this.upload(copy, null);
    remote.set(sent.landed, { hash: sent.hash, size: sent.size });
    state.base.set(copy, sent.hash);
  }

  /** A note made from a template on this device (ADR 0093 item 12): the
   *  hash of the text, the base of a join should the server hold a note of
   *  the same name. */
  async madeFromTemplate(path: string, text: string): Promise<void> {
    const state = (await this.store.state(this.id)) ?? newState("", this.id);
    if (!state.base.has(path)) state.made.set(path, sha256(new TextEncoder().encode(text)));
    await this.store.putState(this.id, state);
  }
}

/** The key under which the server's picture holds the file `path` names:
 *  `path` itself, or the spelling in the other Unicode form the server keeps
 *  for that name. */
function spelledThere(files: Files, path: string): string {
  if (files.has(path)) return path;
  const name = path.normalize("NFC");
  for (const p of files.keys()) if (!/^[\x00-\x7f]*$/.test(p) && p.normalize("NFC") === name) return p;
  return path;
}
