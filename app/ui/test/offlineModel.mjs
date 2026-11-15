// A model of the server's side of sync, for the browser syncer's tests
// (ADR 0092 item 1: "the same property test run against the browser's
// store"). It keeps what `crates/verso-server/src/sync.rs` keeps: a
// manifest of files by hash, a log of changes with a sequence number, a
// write that names the hash it is based on and is refused as `changed`
// when the file is no longer that one (invariant 11), one name for the
// two Unicode forms of an accented name (spec Q7), pieces of a file that
// are checked against the hash when the last arrives, and a reader whose
// changes are refused.

import * as esbuild from "esbuild";

// Its own bundle of the browser's sync, named for this process: the test
// files that import this model run in parallel processes, and one of them
// read a bundle another had not written yet (CI, 2026-11-15).
const own = `test/.bundles/offline-model-${process.pid}.test-bundle.mjs`;
await esbuild.build({ entryPoints: ["src/web/offline/index.ts"], bundle: true, format: "esm", platform: "node", outfile: own, logLevel: "error" });
const { sha256 } = await import(`./.bundles/offline-model-${process.pid}.test-bundle.mjs`);

const enc = new TextEncoder();

export const err = (kind, message, extra = {}) => Object.assign(new Error(message), { kind, message, ...extra });

export class FakeServer {
  constructor({ page = 3, piece = 4, reader = false } = {}) {
    /** @type {Map<string, {bytes: Uint8Array, hash: string}>} */
    this.files = new Map();
    this.log = [];
    this.seq = 0;
    this.page = page;
    this.reader = reader;
    this.up = new Map();
    /** A test makes the connection drop after this many more calls. */
    this.dropAfter = null;
    /** A test makes the next calls refuse as the server does. */
    this.refuse = null;
    this.calls = [];
    this.piece = piece;
  }

  tick(name) {
    this.calls.push(name);
    if (this.dropAfter !== null) {
      if (this.dropAfter-- <= 0) throw Object.assign(new Error("closed"), { kind: "unavailable", message: "closed", transport: true });
    }
  }

  /** The file a path names: the spelling the log keeps, and whether it is
   *  another file's name in the other Unicode form. */
  kept(path) {
    if (this.files.has(path)) return [path, false];
    const name = path.normalize("NFC");
    for (const p of this.files.keys()) if (p.normalize("NFC") === name) return [p, true];
    return [path, false];
  }

  record(path, file, renamedFrom = null) {
    this.seq++;
    this.log.push(file ? { seq: this.seq, path, hash: file.hash, size: file.bytes.length, deleted: false, renamedFrom } : { seq: this.seq, path, deleted: true });
  }

  /** Written by something other than the device under test (another device). */
  write(path, text) {
    const bytes = enc.encode(text);
    const file = { bytes, hash: sha256(bytes) };
    const [p] = this.kept(path);
    this.files.set(p, file);
    this.record(p, file);
  }

  remove(path) {
    const [p] = this.kept(path);
    if (this.files.delete(p)) this.record(p, null);
  }

  now(path) {
    return this.files.get(path)?.hash ?? null;
  }

  maybeRefuse(cmd, path) {
    if (this.reader) throw err("refused", "you may only read this folder");
    if (this.refuse && this.refuse(cmd, path)) throw err("failed", "the server refused");
  }

  async state() {
    this.tick("state");
    return { head: this.seq, files: [...this.files].map(([path, f]) => ({ path, hash: f.hash, size: f.bytes.length })) };
  }

  async changes(since) {
    this.tick("changes");
    const all = this.log.filter((c) => c.seq > since);
    const changes = all.slice(0, this.page);
    const more = all.length > changes.length;
    return { head: this.seq, changes, more };
  }

  async read(path, offset) {
    this.tick("read");
    const [p] = this.kept(path);
    const f = this.files.get(p);
    if (!f) throw err("not_found", `no such file: ${path}`);
    const bytes = f.bytes.subarray(offset, offset + this.piece);
    return { size: f.bytes.length, done: offset + bytes.length >= f.bytes.length, hash: offset === 0 ? f.hash : null, bytes };
  }

  async put({ path, offset, size, hash, base }, bytes) {
    this.tick("put");
    this.maybeRefuse("put", path);
    if (offset === 0) this.up.set(path, []);
    const parts = this.up.get(path);
    if (!parts) throw err("failed", "a piece out of order");
    parts.push(bytes.slice());
    const got = parts.reduce((n, p) => n + p.length, 0);
    if (got < size) return { done: false };
    this.up.delete(path);
    const all = new Uint8Array(got);
    let at = 0;
    for (const p of parts) {
      all.set(p, at);
      at += p.length;
    }
    if (sha256(all) !== hash) throw err("failed", "the hash does not match");
    const [p, other] = this.kept(path);
    const now = this.now(p);
    if (now !== base) {
      if (base === null && other) throw err("exists", "another file has this name, its accents in another Unicode form");
      throw err("changed", now ?? "");
    }
    const file = { bytes: all, hash };
    this.files.set(p, file);
    this.record(p, file);
    return { done: true, path: p };
  }

  async delete(path, base) {
    this.tick("delete");
    this.maybeRefuse("delete", path);
    const [p] = this.kept(path);
    if (this.now(p) !== base) throw err("changed", this.now(p) ?? "");
    this.files.delete(p);
    this.record(p, null);
  }

  async rename(from, to, base) {
    this.tick("rename");
    this.maybeRefuse("rename", from);
    const [f] = this.kept(from);
    const [t, other] = this.kept(to);
    if (this.now(f) !== base) throw err("changed", this.now(f) ?? "");
    if (f.normalize("NFC") === to.normalize("NFC")) return { path: f };
    if (other) throw err("exists", "another file has this name");
    if (this.files.has(t)) throw err("changed", "something stands there");
    const file = this.files.get(f);
    this.files.delete(f);
    this.files.set(t, file);
    this.record(f, null);
    this.record(t, file, f);
    return { path: t };
  }
}
