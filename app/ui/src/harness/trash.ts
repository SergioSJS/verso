// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's trash (ADR 0080): what the core keeps of each entry of
// `.trash/` — where it was, when — and its commands, answered over the
// folder in memory. The core's own rules (grouping, expiry, the quota's
// guard, the sweep's guardrail) are tested in Rust; this is enough for the
// window to behave as in the app: a restore beside a taken name, the
// retention shortened sweeping what is past it, delete now and empty.

import type { ContractError, ErrorKind, Restored, TrashEntry, TrashListing } from "../bindings";

type Stored = { bytes: Uint8Array; revision: number; modified: number };
type Folder = { files: Map<string, Stored>; folders: Set<string> };
type Kept = { original: string; deleted: number; by: string | null; replaced: boolean; folder: boolean };

const DAY = 86_400;

function refuse(kind: ErrorKind, message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

function dirOf(p: string): string {
  const at = p.lastIndexOf("/");
  return at < 0 ? "" : p.slice(0, at);
}

export class Bin {
  /** Each entry of `.trash/` by its path there. */
  readonly kept = new Map<string, Kept>();
  /** Days deleted files are kept; 0 for ever. */
  days = 30;
  /** The harness's clock, in seconds: a test moves it on (`ageTrash`). */
  now = Math.floor(Date.UTC(2026, 9, 11) / 1000);

  constructor(private readonly folder: Folder) {}

  /** A deletion just put `original` at `path` in the bin. */
  record(path: string, original: string, folder: boolean, by: string | null = null, replaced = false): void {
    this.kept.set(path, { original, deleted: this.now, by, replaced, folder });
  }

  private taken(p: string): boolean {
    return this.folder.files.has(p) || this.folder.folders.has(p);
  }

  private sizeOf(path: string, k: Kept): number {
    if (!k.folder) return this.folder.files.get(path)?.bytes.length ?? 0;
    let n = 0;
    for (const [p, f] of this.folder.files) if (p.startsWith(`${path}/`)) n += f.bytes.length;
    return n;
  }

  private listing(): TrashListing {
    const entries: TrashEntry[] = [...this.kept].map(([path, k]) => ({
      path,
      original: k.original,
      folder: k.folder,
      size: this.sizeOf(path, k),
      deleted: k.deleted,
      known: true,
      by: k.by,
      sync: false,
      replaced: k.replaced,
      expires: this.days === 0 ? null : k.deleted + this.days * DAY,
    }));
    entries.sort((a, b) => (b.deleted ?? 0) - (a.deleted ?? 0) || a.path.localeCompare(b.path));
    return { entries, size: entries.reduce((n, e) => n + (e.size ?? 0), 0), days: this.days, most: null, can_set: true, can_purge: true, quota: null, early: false };
  }

  /** Move `from` (a file, or a folder with what is under it) to `to`. */
  private move(from: string, to: string, folder: boolean): void {
    const pairs: [string, string][] = folder
      ? [...this.folder.files.keys()].filter((p) => p.startsWith(`${from}/`)).map((p) => [p, `${to}${p.slice(from.length)}`])
      : [[from, to]];
    for (const [a, b] of pairs) {
      const f = this.folder.files.get(a);
      if (!f) continue;
      this.folder.files.delete(a);
      this.folder.files.set(b, f);
      for (let d = dirOf(b); d !== "" && !d.startsWith(".trash"); d = dirOf(d)) this.folder.folders.add(d);
    }
    if (folder) {
      for (const d of [...this.folder.folders]) if (d === from || d.startsWith(`${from}/`)) this.folder.folders.delete(d);
      if (!to.startsWith(".trash")) this.folder.folders.add(to);
    }
  }

  private purge(path: string): void {
    const k = this.kept.get(path);
    if (!k) refuse("not_found", `nothing in the bin at ${path}`);
    if (k.folder) {
      for (const p of [...this.folder.files.keys()]) if (p.startsWith(`${path}/`)) this.folder.files.delete(p);
    } else this.folder.files.delete(path);
    this.kept.delete(path);
  }

  /** What is past its time goes, as the core's sweep does. */
  sweep(): void {
    if (this.days === 0) return;
    for (const [path, k] of [...this.kept]) if (k.deleted + this.days * DAY <= this.now) this.purge(path);
  }

  private restore(path: string, today: string, lang: string): Restored {
    const k = this.kept.get(path);
    if (!k) refuse("not_found", `nothing in the bin at ${path}`);
    let to = k.original;
    const dot = k.folder ? -1 : to.lastIndexOf(".");
    const [stem, ext] = dot > to.lastIndexOf("/") ? [to.slice(0, dot), to.slice(dot)] : [to, ""];
    const word = lang.startsWith("pt") ? "restaurado" : "restored";
    for (let n = 1; this.taken(to); n++) to = `${stem} (${word} ${today}${n > 1 ? ` ${n}` : ""})${ext}`;
    this.move(path, to, k.folder);
    this.kept.delete(path);
    return { path: to, beside: to !== k.original, warnings: [] };
  }

  handlers(): Record<string, (a: Record<string, unknown>) => unknown> {
    return {
      trash_list: () => this.listing(),
      trash_restore: (a) => this.restore(String(a["path"]), String(a["today"]), String(a["lang"])),
      trash_delete: (a) => {
        for (const p of a["paths"] as string[]) this.purge(p);
        return this.listing();
      },
      trash_empty: () => {
        for (const p of [...this.kept.keys()]) this.purge(p);
        return this.listing();
      },
      trash_set_days: (a) => {
        this.days = Number(a["days"]);
        this.sweep();
        return this.listing();
      },
    };
  }
}
