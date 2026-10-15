// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the browser keeps of the folders made available offline (ADR 0092
// items 3 and 6): IndexedDB, the one store every target browser offers with
// persistence. Per folder: its files (the bytes, and their hash and size,
// which sync compares), the sync's state outside the files — the cursor and
// the base, ADR 0079 item 3 — and a few facts about the folder.
//
// Everything above is written against `Store`, so that the same syncer is
// tested against the in-memory store in Node (the property test of ADR 0092
// item 1 and Consequences) and runs against IndexedDB in the page. The
// service worker (sw.ts) reads the same database to answer a folder's
// pictures offline, so the names below are shared with it.

import { newState, type State } from "./engine";

export const DB_NAME = "verso-offline";
export const DB_VERSION = 1;

/** What the browser keeps about a folder made available offline. */
export type Kept = {
  /** The folder's key for the window (`FolderInfo::key`): its sync status is heard under it. */
  key: string;
  /** The folder's id on the server. */
  id: string;
  name: string;
  /** The role the person had there when last connected. */
  role: string;
  /** The account that kept it: signing out of it wipes the folder. */
  account: string;
  /** "opened": a picture or a PDF is kept once opened; "all": every one. */
  attachments: "opened" | "all";
  /** The attachments opened while connected, to keep (ADR 0092 item 3). */
  opened: string[];
  /** When it was turned on, `YYYY-MM-DDTHH:MM:SSZ`. */
  since: string;
  /** When the last pass ended. */
  last: string | null;
};

/** A file's facts without its bytes. */
export type FileMeta = { hash: string; size: number; modified: number };
export type StoredFile = FileMeta & { path: string; bytes: Uint8Array };

/** The browser's storage is full, or refused the write (the quota, ADR 0092
 *  item 3): a write that cannot be kept says so where it was made. */
export class StoreFull extends Error {
  constructor(message = "the browser's storage is full") {
    super(message);
    this.name = "StoreFull";
  }
}

export interface Store {
  folders(): Promise<Kept[]>;
  folder(id: string): Promise<Kept | null>;
  putFolder(folder: Kept): Promise<void>;
  /** The folder, its files and its state, all gone. */
  removeFolder(id: string): Promise<void>;
  state(id: string): Promise<State | null>;
  putState(id: string, state: State): Promise<void>;
  /** The folder's files, without their bytes. */
  listing(id: string): Promise<Map<string, FileMeta>>;
  file(id: string, path: string): Promise<StoredFile | null>;
  /** Every file with its bytes, for the offline core to start from. */
  all(id: string): Promise<StoredFile[]>;
  putFile(id: string, file: StoredFile): Promise<void>;
  deleteFile(id: string, path: string): Promise<void>;
  /** Small facts of the device (the account last seen, …). */
  fact<T>(name: string): Promise<T | null>;
  putFact(name: string, value: unknown): Promise<void>;
  /** Everything this device keeps, gone (sign-out, revocation). */
  wipe(): Promise<void>;
}

/** The writes a folder has not sent: files whose hash is not their base's,
 *  and files of the base that are gone here (ADR 0092 item 7; ADR 0079 item
 *  6: offline, nothing queues but the state's difference). */
export function waiting(listing: Map<string, FileMeta>, state: State | null): number {
  if (!state) return 0;
  let n = 0;
  for (const [path, f] of listing) if (state.base.get(path) !== f.hash) n++;
  for (const path of state.base.keys()) if (!listing.has(path)) n++;
  return n;
}

// ---- In memory ---------------------------------------------------------------

export class MemoryStore implements Store {
  private kept = new Map<string, Kept>();
  private states = new Map<string, State>();
  private files = new Map<string, Map<string, StoredFile>>();
  private facts = new Map<string, unknown>();
  /** For a test: the next `putFile` is refused as the browser's quota would. */
  full = false;

  async folders(): Promise<Kept[]> {
    return [...this.kept.values()].map((k) => ({ ...k }));
  }
  async folder(id: string): Promise<Kept | null> {
    const k = this.kept.get(id);
    return k ? { ...k } : null;
  }
  async putFolder(folder: Kept): Promise<void> {
    this.kept.set(folder.id, { ...folder });
  }
  async removeFolder(id: string): Promise<void> {
    this.kept.delete(id);
    this.states.delete(id);
    this.files.delete(id);
  }
  async state(id: string): Promise<State | null> {
    const s = this.states.get(id);
    return s ? { ...s, base: new Map(s.base), made: new Map(s.made) } : null;
  }
  async putState(id: string, state: State): Promise<void> {
    this.states.set(id, { ...state, base: new Map(state.base), made: new Map(state.made) });
  }
  async listing(id: string): Promise<Map<string, FileMeta>> {
    const out = new Map<string, FileMeta>();
    for (const [p, f] of this.files.get(id) ?? []) out.set(p, { hash: f.hash, size: f.size, modified: f.modified });
    return out;
  }
  async file(id: string, path: string): Promise<StoredFile | null> {
    const f = this.files.get(id)?.get(path);
    return f ? { ...f, bytes: f.bytes.slice() } : null;
  }
  async all(id: string): Promise<StoredFile[]> {
    return [...(this.files.get(id)?.values() ?? [])].map((f) => ({ ...f, bytes: f.bytes.slice() }));
  }
  async putFile(id: string, file: StoredFile): Promise<void> {
    if (this.full) throw new StoreFull();
    const dir = this.files.get(id) ?? new Map<string, StoredFile>();
    this.files.set(id, dir);
    dir.set(file.path, { ...file, bytes: file.bytes.slice() });
  }
  async deleteFile(id: string, path: string): Promise<void> {
    this.files.get(id)?.delete(path);
  }
  async fact<T>(name: string): Promise<T | null> {
    return (this.facts.get(name) as T | undefined) ?? null;
  }
  async putFact(name: string, value: unknown): Promise<void> {
    this.facts.set(name, value);
  }
  async wipe(): Promise<void> {
    this.kept.clear();
    this.states.clear();
    this.files.clear();
    this.facts.clear();
  }
}

// ---- IndexedDB ----------------------------------------------------------------

type StateRow = { id: string; server: string; folder: string; cursor: number; base: [string, string][]; paused: boolean; made: [string, string][] };
type FileRow = { id: string; path: string } & FileMeta;
type BlobRow = { id: string; path: string; bytes: ArrayBuffer };

const wait = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (t: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new DOMException("aborted", "AbortError"));
  });

/** A write the browser refused for want of room. */
function refusal(e: unknown): unknown {
  const name = (e as { name?: string } | null)?.name;
  return name === "QuotaExceededError" || name === "UnknownError" ? new StoreFull() : e;
}

export function openDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore("folders", { keyPath: "id" });
      db.createObjectStore("states", { keyPath: "id" });
      db.createObjectStore("files", { keyPath: ["id", "path"] }).createIndex("folder", "id");
      db.createObjectStore("blobs", { keyPath: ["id", "path"] }).createIndex("folder", "id");
      db.createObjectStore("facts");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("the offline store is open in another version of the page"));
  });
}

export class IdbStore implements Store {
  private db: Promise<IDBDatabase>;
  constructor(factory: IDBFactory = indexedDB) {
    this.db = openDatabase(factory);
  }

  private async tx(stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
    return (await this.db).transaction(stores, mode);
  }

  async folders(): Promise<Kept[]> {
    const t = await this.tx(["folders"], "readonly");
    return wait(t.objectStore("folders").getAll() as IDBRequest<Kept[]>);
  }
  async folder(id: string): Promise<Kept | null> {
    const t = await this.tx(["folders"], "readonly");
    return ((await wait(t.objectStore("folders").get(id))) as Kept | undefined) ?? null;
  }
  async putFolder(folder: Kept): Promise<void> {
    const t = await this.tx(["folders"], "readwrite");
    t.objectStore("folders").put(folder);
    await done(t).catch((e) => Promise.reject(refusal(e)));
  }
  async removeFolder(id: string): Promise<void> {
    const t = await this.tx(["folders", "states", "files", "blobs"], "readwrite");
    t.objectStore("folders").delete(id);
    t.objectStore("states").delete(id);
    for (const name of ["files", "blobs"]) {
      const range = IDBKeyRange.bound([id, ""], [id, "￿"]);
      t.objectStore(name).delete(range);
    }
    await done(t);
  }
  async state(id: string): Promise<State | null> {
    const t = await this.tx(["states"], "readonly");
    const row = (await wait(t.objectStore("states").get(id))) as StateRow | undefined;
    if (!row) return null;
    return { server: row.server, folder: row.folder, cursor: row.cursor, base: new Map(row.base), paused: row.paused, made: new Map(row.made) };
  }
  async putState(id: string, state: State): Promise<void> {
    const t = await this.tx(["states"], "readwrite");
    const row: StateRow = { id, server: state.server, folder: state.folder, cursor: state.cursor, base: [...state.base], paused: state.paused, made: [...state.made] };
    t.objectStore("states").put(row);
    await done(t).catch((e) => Promise.reject(refusal(e)));
  }
  async listing(id: string): Promise<Map<string, FileMeta>> {
    const t = await this.tx(["files"], "readonly");
    const rows = (await wait(t.objectStore("files").index("folder").getAll(id))) as FileRow[];
    return new Map(rows.map((r) => [r.path, { hash: r.hash, size: r.size, modified: r.modified }]));
  }
  async file(id: string, path: string): Promise<StoredFile | null> {
    const t = await this.tx(["files", "blobs"], "readonly");
    const [meta, blob] = await Promise.all([wait(t.objectStore("files").get([id, path])), wait(t.objectStore("blobs").get([id, path]))]);
    const m = meta as FileRow | undefined;
    const b = blob as BlobRow | undefined;
    return m && b ? { path, hash: m.hash, size: m.size, modified: m.modified, bytes: new Uint8Array(b.bytes) } : null;
  }
  async all(id: string): Promise<StoredFile[]> {
    const t = await this.tx(["files", "blobs"], "readonly");
    const [metas, blobs] = await Promise.all([wait(t.objectStore("files").index("folder").getAll(id)), wait(t.objectStore("blobs").index("folder").getAll(id))]);
    const bytes = new Map((blobs as BlobRow[]).map((b) => [b.path, b.bytes]));
    const out: StoredFile[] = [];
    for (const m of metas as FileRow[]) {
      const b = bytes.get(m.path);
      if (b) out.push({ path: m.path, hash: m.hash, size: m.size, modified: m.modified, bytes: new Uint8Array(b) });
    }
    return out;
  }
  async putFile(id: string, file: StoredFile): Promise<void> {
    const t = await this.tx(["files", "blobs"], "readwrite");
    try {
      t.objectStore("files").put({ id, path: file.path, hash: file.hash, size: file.size, modified: file.modified } satisfies FileRow);
      const copy = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
      t.objectStore("blobs").put({ id, path: file.path, bytes: copy } satisfies BlobRow);
    } catch (e) {
      // A refusal that comes at once (the quota) leaves nothing half-kept.
      try {
        t.abort();
      } catch {
        /* already over */
      }
      throw refusal(e);
    }
    await done(t).catch((e) => Promise.reject(refusal(e)));
  }
  async deleteFile(id: string, path: string): Promise<void> {
    const t = await this.tx(["files", "blobs"], "readwrite");
    t.objectStore("files").delete([id, path]);
    t.objectStore("blobs").delete([id, path]);
    await done(t);
  }
  async fact<T>(name: string): Promise<T | null> {
    const t = await this.tx(["facts"], "readonly");
    return ((await wait(t.objectStore("facts").get(name))) as T | undefined) ?? null;
  }
  async putFact(name: string, value: unknown): Promise<void> {
    const t = await this.tx(["facts"], "readwrite");
    t.objectStore("facts").put(value, name);
    await done(t);
  }
  async wipe(): Promise<void> {
    const t = await this.tx(["folders", "states", "files", "blobs", "facts"], "readwrite");
    for (const name of ["folders", "states", "files", "blobs", "facts"]) t.objectStore(name).clear();
    await done(t);
  }
}

export { newState };
