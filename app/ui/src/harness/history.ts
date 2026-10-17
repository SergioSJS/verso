// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's version history (ADR 0091): each write through the
// window a version of this computer, the folder's first reading of a file
// its version "as found", a change from outside (`writeOutside`) one of
// nobody's, a synced note's room save one of the room's; a restore a new
// write over the revision read — refused as `changed` when the file moved
// on —, through the room when the note is live. A reader on a server has
// none. The store's own rules (coalescing, thinning, the property test)
// are tested in Rust; this is enough for the window to behave as in the
// app.

import type { ContractError, ErrorKind, HistoryListing, TextFile, VersionEntry, VersionKind, VersionRestored, VersionText } from "../bindings";
import type { Core } from "./core";
import type { Rooms } from "./room";

type Kept = { id: number; at: number; text: string; kind: VersionKind; authors: VersionEntry["authors"]; path: string };

function refuse(kind: ErrorKind, message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

function counted(old: string, now: string): [number, number] {
  const left = new Map<string, number>();
  for (const l of old.split("\n")) left.set(l, (left.get(l) ?? 0) + 1);
  let added = 0;
  for (const l of now.split("\n")) {
    const n = left.get(l) ?? 0;
    if (n > 0) left.set(l, n - 1);
    else added++;
  }
  return [added, [...left.values()].reduce((a, b) => a + b, 0)];
}

type Handler = (a: Record<string, unknown>) => unknown;

/** `cmd`'s handler with `after` run on its answer; read by the harness's
 *  own test as the handler it wraps (the arguments it reads). */
function wrap(h: Record<string, Handler>, cmd: string, after: (a: Record<string, unknown>, done: unknown) => void): void {
  const own = h[cmd]!;
  const wrapped: Handler = (a) => {
    const done = own(a);
    after(a, done);
    return done;
  };
  Object.defineProperty(wrapped, "toString", { value: () => String(own) });
  h[cmd] = wrapped;
}

export class Versions {
  /** Each file's versions, oldest first. */
  readonly lines = new Map<string, Kept[]>();
  private next = 1;
  /** The harness's clock, in milliseconds: a test moves it on. */
  now = Date.UTC(2026, 9, 14, 15, 0);
  days = 365;

  constructor(
    private readonly core: Core,
    private readonly rooms: Rooms | null,
    private readonly mayWrite: () => boolean,
  ) {
    const h = core.handlers;
    // Each write through the window is this computer's version.
    for (const cmd of ["write_note", "write_text", "write_board", "create_note"]) {
      wrap(h, cmd, (_, done) => {
        const d = done as { path?: string; note?: { path: string } };
        if (d.note?.path ?? d.path) this.record(d.note?.path ?? d.path ?? "", "edit", [{ kind: "computer", name: "Mac de Teste" }]);
      });
    }
    // The file as found, the first time it is read.
    for (const cmd of ["read_note", "read_text"]) {
      wrap(h, cmd, (_, read) => {
        const path = (read as { path: string }).path;
        if (!this.lines.has(path)) this.record(path, "found", []);
      });
    }
    // A file renamed keeps its line (item 9).
    for (const cmd of ["rename_note", "rename_entry"]) {
      wrap(h, cmd, (a) => {
        const line = this.lines.get(String(a.from));
        if (line) {
          this.lines.delete(String(a.from));
          this.lines.set(String(a.to), line);
        }
      });
    }
    // Written behind the window's back: nobody's (a room's save, which
    // writes the same way, says so itself).
    const outside = core.writeOutside.bind(core);
    core.writeOutside = (path: string, text: string) => {
      outside(path, text);
      this.record(path, this.saving ? "room" : "outside", this.saving ? [{ kind: "account", name: "Ana" }, { kind: "account", name: "Bia" }] : [{ kind: "outside", name: "" }]);
    };
    h["history_list"] = (a) => this.list(String(a["path"]));
    h["history_read"] = (a): VersionText => {
      const v = this.version(String(a["path"]), String(a["id"]));
      return { id: String(v.id), text: v.text, size: v.text.length };
    };
    h["history_restore"] = (a) => this.restore(String(a["path"]), String(a["id"]), (a["revision"] as string | null) ?? null);
    h["history_copy"] = (a): VersionRestored => {
      this.allowed();
      const path = String(a["path"]);
      const v = this.version(path, String(a["id"]));
      const word = String(a["lang"]).startsWith("pt") ? "versão" : "version";
      const at = path.lastIndexOf(".");
      const to = `${path.slice(0, at)} (${word} ${String(a["stamp"])})${path.slice(at)}`;
      if (core.files.has(to)) refuse("exists", `already there: ${to}`);
      core.writeOutside(to, v.text);
      this.lines.delete(to);
      this.record(to, "edit", [{ kind: "computer", name: "Mac de Teste" }]);
      return { path: to, revision: (h["read_text"]!({ path: to }) as TextFile).revision };
    };
    h["history_delete"] = (a) => {
      const path = String(a["path"]);
      const v = this.version(path, String(a["id"]));
      this.lines.set(path, (this.lines.get(path) ?? []).filter((k) => k !== v));
      return this.list(path);
    };
    h["set_history_days"] = (a) => {
      this.days = Number(a["days"]);
      return null;
    };
  }

  /** A room's save is under way: what it writes is the room's version. */
  private saving = false;

  /** The room's save, as the server's: its own kind of version. */
  roomSave(path: string): string {
    this.saving = true;
    try {
      return this.rooms!.save(path);
    } finally {
      this.saving = false;
    }
  }

  private allowed(): void {
    if (!this.mayWrite()) refuse("refused", "the history is for those who may change this folder");
  }

  /** Keep the file's bytes now as its newest version, unless they are. */
  record(path: string, kind: VersionKind, authors: Kept["authors"]): void {
    const text = this.core.read(path);
    if (text === null) return;
    const line = this.lines.get(path) ?? [];
    if (line.at(-1)?.text === text) return;
    line.push({ id: this.next++, at: (this.now += 60_000), text, kind, authors, path });
    this.lines.set(path, line);
  }

  private version(path: string, id: string): Kept {
    this.allowed();
    const v = (this.lines.get(path) ?? []).find((k) => String(k.id) === id);
    if (!v) refuse("not_found", "no such version of this file");
    return v;
  }

  list(path: string): HistoryListing {
    this.allowed();
    const line = this.lines.get(path) ?? [];
    const versions: VersionEntry[] = line
      .map((v, i) => {
        const [added, removed] = i > 0 ? counted(line[i - 1]!.text, v.text) : [0, 0];
        return { id: String(v.id), at: v.at, authors: v.authors, kind: v.kind, size: new TextEncoder().encode(v.text).length, hash: `h${v.id}`, added, removed, path: v.path, here_only: false };
      })
      .reverse();
    const synced = this.core.sync.on && this.rooms !== null && !this.rooms.up;
    return {
      path,
      versions,
      gone: this.core.files.has(path) || line.length === 0 ? null : this.now,
      can_delete: true,
      days: this.days,
      size: [...this.lines.values()].flat().reduce((n, v) => n + v.text.length, 0),
      quota: null,
      early: false,
      partial: synced ? "the server is out of reach" : null,
    };
  }

  private restore(path: string, id: string, revision: string | null): VersionRestored {
    const v = this.version(path, id);
    const h = this.core.handlers;
    const there = this.core.files.has(path);
    const now = there ? (h["read_text"]!({ path }) as TextFile).revision : null;
    if (now !== revision) refuse("changed", "the file changed since it was read");
    const room = this.rooms?.up ? this.rooms.live(path) : null;
    if (room) {
      // Through the room: one edit every window in it sees, then saved.
      room.replace(v.text);
      this.roomSave(path);
    } else this.core.writeOutside(path, v.text);
    const line = this.lines.get(path) ?? [];
    const last = line.at(-1);
    // What the write recorded is the restore.
    if (last && last.text === v.text) {
      last.kind = "restore";
      last.authors = [{ kind: "computer", name: "Mac de Teste" }];
    }
    return { path, revision: (h["read_text"]!({ path }) as TextFile).revision };
  }
}
