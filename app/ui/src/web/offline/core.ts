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

export class OfflineCore extends Core {
  private journal: Map<string, Change> | null = null;

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
   *  the file here, until it is written (invariant 11 holds — a file
   *  written here, or by the sync that came after, has a revision of this
   *  core's own, and is no longer the one that was read). */
  protected override accepts(path: string, was: Stored, given: string): boolean {
    if (String(was.revision) === given) return true;
    return SERVER_REVISION.test(given) && was.revision < 0 && path !== "" ;
  }

  /** The folder's files, as the store holds them, loaded. */
  load(files: StoredFile[]): void {
    files.forEach((f, i) => {
      // Negative: not written by this core yet (see `accepts`).
      this.files.set(f.path, { bytes: f.bytes, revision: -(i + 1), modified: Math.floor(f.modified / 1000) });
      for (let d = f.path.lastIndexOf("/"); d > 0; d = f.path.lastIndexOf("/", d - 1)) this.folders.add(f.path.slice(0, d));
    });
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
      if (e instanceof StoreFull) throw { kind: "failed", message: o().full } satisfies ContractError;
      throw { kind: "failed", message: String(e) } satisfies ContractError;
    }
    return value;
  }

  private async keep(store: Store, changes: Change[]): Promise<void> {
    for (const c of changes) {
      if (c.after) {
        await store.putFile(this.kept.id, { path: c.path, bytes: c.after.bytes, hash: sha256(c.after.bytes), size: c.after.bytes.length, modified: c.after.modified * 1000 });
      } else if (c.before) {
        await store.deleteFile(this.kept.id, c.path);
      }
    }
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
    return this.run(store, () => this.invoke(cmd, args));
  }
}
