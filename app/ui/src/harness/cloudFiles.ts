// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Files only in iCloud or OneDrive, as the harness stands in for the host
// (ADR 0043, decided 2026-10-27): the sync status lists them as waiting,
// `placeholder_plan` sizes the ones asked about and says the disk's room,
// and `fetch_file` brings one down — it leaves the list, as the host's
// next pass would find it a file on disk.

import type { PlaceholderPlan, SyncStatus } from "../bindings";

export class CloudFiles {
  /** Path to logical size, for the files still only in the cloud. */
  readonly files = new Map<string, number>();
  /** The bytes the disk has left; null, the system would not say. */
  free: number | null = 500 * 1024 ** 3;

  constructor(private readonly sync: () => SyncStatus, private readonly set: (st: SyncStatus) => void) {}

  /** The sync status the folder reports now: the files as refused with the
   *  reason `placeholder`. */
  put(files: Record<string, number>, free: number | null = this.free): SyncStatus {
    this.files.clear();
    for (const [p, n] of Object.entries(files)) this.files.set(p, n);
    this.free = free;
    return this.listed();
  }

  private listed(): SyncStatus {
    const others = this.sync().refused.filter((f) => f.reason !== "placeholder");
    const refused = [...others, ...[...this.files.keys()].map((path) => ({ path, reason: "placeholder", message: "not on this computer: on-demand storage" }))];
    const next = { ...this.sync(), refused };
    this.set(next);
    return next;
  }

  handlers(): Record<string, (a: Record<string, unknown>) => unknown> {
    return {
      placeholder_plan: (a): PlaceholderPlan => {
        const asked = (a["paths"] as string[]).filter((p) => this.files.has(p));
        return { count: asked.length, bytes: asked.reduce((n, p) => n + (this.files.get(p) ?? 0), 0), free: this.free };
      },
      fetch_file: (a) => {
        const path = a["path"] as string;
        if (!this.files.delete(path)) return false;
        this.listed();
        return true;
      },
    };
  }
}
