// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The core the window talks to while the connection is down (ADR 0092 item
// 4): the contract's commands answered in the page from the folder kept in
// IndexedDB — a note, a board or a base opens and is edited, a link
// resolves, a search finds, a backlink and the graph are computed from the
// notes on the device.
//
// The answers are the browser harness's (`harness/core.ts`, ADR 0058): the
// harness is the contract's other implementation, already written in
// TypeScript for the window's tests, with the same shapes and an
// approximation of the Rust core's computations. It is NOT `verso-dialect`
// compiled to WebAssembly, as ADR 0092 item 4 says: the parser's crate
// compiles to wasm32 (a guardrail), but a bridge from the page to it needs a
// generated glue (wasm-bindgen) that writes `unsafe`, which the workspace
// forbids (`unsafe_code = "forbid"`, ADR 0029), and the decision to lift that
// is the maintainer's. The offline answers carry the harness's limits (a
// search that wants every word, a base filtered by folder, tag and link),
// said where they show (`o().offlineMark`).
//
// Every change a command makes to the folder is kept in the store before the
// command answers (so a write that the browser cannot keep — the storage is
// full — is refused where it was made, and undone here), and waits as the
// difference from the sync's base until the network returns (ADR 0079 item 6).

import type { Capabilities, ContractError, FolderInfo } from "../../bindings";
import { Core } from "../../harness/core";
import { sha256 } from "./sha256";
import { o } from "./strings";
import { type Kept, type Store, StoreFull, type StoredFile } from "./store";

type Stored = { bytes: Uint8Array; revision: number; modified: number };
type Change = { path: string; before: Stored | undefined; after: Stored | undefined };

/** A revision a server gave a note before the connection dropped:
 *  `<nanoseconds>:<length>:<hash>` (`verso-core`'s `revision::encode`). */
const SERVER_REVISION = /^\d+:\d+:[0-9a-f]+$/;

const unreachable = (): ContractError => ({ kind: "unreachable", message: location.host });

/** FNV-1a of `bytes`, 64 bits, in hex as a server's revision writes it
 *  (`verso_fs::Stamp::hash`, `verso-core`'s `revision::encode`). */
function fnv1a(bytes: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  for (const b of bytes) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return h.toString(16).padStart(16, "0");
}

/** Whether a server's revision names exactly `bytes`: its length and its
 *  hash are theirs. */
function names(revision: string, bytes: Uint8Array): boolean {
  const [, len, hash] = revision.split(":");
  return Number(len) === bytes.length && hash === fnv1a(bytes);
}

/** Files the store holds otherwise than this core read them: written there
 *  by a sync pass (or another tab) since. */
class Stale extends Error {
  constructor(readonly paths: string[]) {
    super(`changed since it was read: ${paths.join(", ")}`);
  }
}

export class OfflineCore extends Core {
  private journal: Map<string, Change> | null = null;
  /** What the store holds of each file as this core last read or wrote it
   *  (its sha256): a write goes over that and nothing else (invariant 11). */
  private held = new Map<string, string>();
  /** The revisions of files read again from the store: negative, as a file
   *  this core has not written, and never one handed out before. */
  private reread = 0;
  /** A command and a catching up one after the other, never interleaved:
   *  a file read again between a command's change and its keeping would
   *  pass the check above with the command's bytes over the new ones. */
  private queue: Promise<unknown> = Promise.resolve();

  private serial<T>(f: () => Promise<T>): Promise<T> {
    const next = this.queue.then(f, f);
    this.queue = next.catch(() => undefined);
    return next;
  }

  constructor(
    readonly kept: Kept,
    private reader: boolean,
  ) {
    super([], kept.name);
  }

  /** The folder as the server named it, so that the window's per-folder
   *  state (tabs, sync status) stays where it was. */
  override folderInfo(): FolderInfo {
    return { ...super.folderInfo(), key: this.kept.key };
  }

  /** A revision the server gave before the connection dropped names the file
   *  as it was kept when it was last synced: good for the first write over
   *  the file here, until it is written, and only while the file here is
   *  the one it names — its length and hash (invariant 11 holds: a file
   *  written here has a revision of this core's own, and one a sync pass
   *  brought since is other bytes than the server's revision named). */
  protected override accepts(path: string, was: Stored, given: string): boolean {
    if (String(was.revision) === given) return true;
    return SERVER_REVISION.test(given) && was.revision < 0 && path !== "" && names(given, was.bytes);
  }

  /** The folder's files, as the store holds them, loaded. */
  load(files: StoredFile[]): void {
    files.forEach((f, i) => {
      // Negative: not written by this core yet (see `accepts`).
      this.files.set(f.path, { bytes: f.bytes, revision: -(i + 1), modified: Math.floor(f.modified / 1000) });
      this.held.set(f.path, f.hash);
      for (let d = f.path.lastIndexOf("/"); d > 0; d = f.path.lastIndexOf("/", d - 1)) this.folders.add(f.path.slice(0, d));
    });
    this.reread = -(files.length + 1);
    const files_ = this.files;
    const set = files_.set.bind(files_);
    const del = files_.delete.bind(files_);
    files_.set = (key, value) => {
      this.note(key, files_.get(key), value);
      return set(key, value);
    };
    files_.delete = (key) => {
      this.note(key, files_.get(key), undefined);
      return del(key);
    };
    this.handlers["capabilities"] = (): Capabilities => ({
      host: "server",
      can: this.reader ? ["account"] : ["write", "account"],
      latency_ms: null,
    });
  }

  private note(path: string, before: Stored | undefined, after: Stored | undefined): void {
    if (!this.journal) return;
    // The first "before" and the last "after" of a path stand for the command.
    const was = this.journal.get(path);
    // The time of a file made here is the device's, not the harness's clock.
    if (after) after.modified = Math.floor(Date.now() / 1000);
    this.journal.set(path, { path, before: was ? was.before : before, after });
  }

  /** What `command` changed, kept in `store` before it is answered. */
  async run(store: Store, command: () => unknown): Promise<unknown> {
    this.journal = new Map();
    let value: unknown;
    try {
      value = command();
    } catch (e) {
      // A command that failed after changing something left it changed; the
      // store follows, so that the window and the device agree.
      const changes = [...(this.journal?.values() ?? [])];
      this.journal = null;
      if (changes.length > 0) await this.keep(store, changes).catch(() => undefined);
      throw e;
    }
    const changes = [...this.journal.values()];
    this.journal = null;
    this.calls.length = 0;
    if (changes.length === 0) return value;
    try {
      await this.keep(store, changes);
    } catch (e) {
      this.undo(changes);
      // A sync pass brought another version meanwhile: never written over.
      // The window is told as a write over a file changed on the disk is
      // (its diff, ADR 0012 invariant 11), and reads the new one from here.
      if (e instanceof Stale) {
        await this.catchUpNow(store).catch(() => undefined);
        throw { kind: "changed", message: e.message } satisfies ContractError;
      }
      if (e instanceof StoreFull) throw { kind: "failed", message: o().full } satisfies ContractError;
      throw { kind: "failed", message: String(e) } satisfies ContractError;
    }
    return value;
  }

  private async keep(store: Store, changes: Change[]): Promise<void> {
    // Every file the command touches is still the one this core read, or
    // nothing is written: a sync pass may have brought another version of
    // it into the store since (ADR 0092; invariant 11).
    const now = await store.listing(this.kept.id);
    const stale = changes.filter((c) => (now.get(c.path)?.hash ?? null) !== (this.held.get(c.path) ?? null)).map((c) => c.path);
    if (stale.length > 0) throw new Stale(stale);
    for (const c of changes) {
      if (c.after) {
        const hash = sha256(c.after.bytes);
        await store.putFile(this.kept.id, { path: c.path, bytes: c.after.bytes, hash, size: c.after.bytes.length, modified: c.after.modified * 1000 });
        this.held.set(c.path, hash);
      } else if (c.before) {
        await store.deleteFile(this.kept.id, c.path);
        this.held.delete(c.path);
      }
    }
  }

  /** The files the store holds otherwise than this core last read them
   *  (written there by a sync pass, or by another tab), read again: the
   *  window reads them as they are now, and a revision it held of the old
   *  version no longer writes (invariant 11). Whether anything changed. */
  catchUp(store: Store): Promise<boolean> {
    return this.serial(() => this.catchUpNow(store));
  }

  private async catchUpNow(store: Store): Promise<boolean> {
    const now = await store.listing(this.kept.id);
    const changed = [...now].filter(([p, f]) => this.held.get(p) !== f.hash).map(([p]) => p);
    const gone = [...this.held.keys()].filter((p) => !now.has(p));
    if (changed.length === 0 && gone.length === 0) return false;
    // Past the journal: what the store holds is not a change of this core's.
    const set = Map.prototype.set.bind(this.files);
    const del = Map.prototype.delete.bind(this.files);
    for (const path of changed) {
      const f = await store.file(this.kept.id, path);
      if (!f) continue;
      set(path, { bytes: f.bytes, revision: this.reread--, modified: Math.floor(f.modified / 1000) });
      this.held.set(path, f.hash);
      for (let d = path.lastIndexOf("/"); d > 0; d = path.lastIndexOf("/", d - 1)) this.folders.add(path.slice(0, d));
    }
    for (const path of gone) {
      del(path);
      this.held.delete(path);
    }
    return true;
  }

  /** The changes of a command the store would not keep, undone here. */
  private undo(changes: Change[]): void {
    const files = this.files;
    const set = Map.prototype.set.bind(files);
    const del = Map.prototype.delete.bind(files);
    for (const c of changes) {
      if (c.before) set(c.path, c.before);
      else del(c.path);
    }
  }

  /** Whether a command has an answer here; the rest need the server. */
  answers(cmd: string): boolean {
    return cmd in this.handlers && !cmd.startsWith("collab_") && !cmd.startsWith("history_") && !cmd.startsWith("server_");
  }

  /** The window's command, answered from the folder kept. */
  async answer(store: Store, cmd: string, args: Record<string, unknown>): Promise<unknown> {
    if (cmd.startsWith("plugin:")) return null;
    if (!this.answers(cmd)) throw unreachable();
    return this.serial(() => this.run(store, () => this.invoke(cmd, args)));
  }
}
