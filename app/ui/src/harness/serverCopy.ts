// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A server's folder picked in the app (the maintainer, 2026-11-15), as the
// harness stands in for the host (src-tauri src/server_copy.rs): no copy
// until one is made; the plan sizes the folder and names this device's
// places (`?host=mobile` Android's two, `?host=ios` the app's Documents,
// else a desktop's dialog); making it opens the harness's folder under the
// server folder's name and plays its first sync — every file received, one
// at a time, then synced — as `sync-status` says it in the app. A test
// cancels the desktop's dialog with `cancelChoose`, holds the download with
// `auto = false` and plays it with `step()`.

import { emit } from "@tauri-apps/api/event";
import type { CopyPlace, FolderInfo, ServerCopyPlan, SyncStatus } from "../bindings";
import type { Core } from "./core";

type Handler = (a: Record<string, unknown>) => unknown;

export class ServerCopy {
  /** The copies made, by `url#folder`: the folder's name. */
  readonly copies = new Map<string, string>();
  /** What the server's folders hold, by id: how many files, how many bytes. */
  readonly sizes = new Map<string, { name: string; files: number; bytes: number }>();
  /** The next desktop dialog is cancelled. */
  cancelChoose = false;
  /** The download plays by itself; false, a test plays it with `step()`. */
  auto = true;
  /** What the download still has to receive, and the copy's status. */
  private left = 0;
  private status: SyncStatus | null = null;

  constructor(
    private readonly core: Core,
    private readonly places: CopyPlace[],
  ) {}

  private info(name: string): FolderInfo {
    return { ...this.core.folderInfo(), name };
  }

  private plan(folder: string): { name: string; files: number; bytes: number } {
    return this.sizes.get(folder) ?? { name: folder, files: 3, bytes: 2_516_582 };
  }

  /** One file received; the last one leaves the copy synced. */
  step(): void {
    if (!this.status) return;
    this.left = Math.max(0, this.left - 1);
    const done = this.left === 0;
    this.status = { ...this.status, state: done ? "synced" : "syncing", receiving: this.left, last: done ? "2026-11-15T12:00:00Z" : this.status.last };
    this.say();
    if (!done && this.auto) setTimeout(() => this.step(), 40);
  }

  private say(): void {
    if (!this.status) return;
    this.core.sync = this.status;
    void emit("sync-status", this.status);
  }

  handlers(): Record<string, Handler> {
    return {
      server_copy_open: (a): FolderInfo | null => {
        const name = this.copies.get(`${String(a["url"])}#${String(a["folder"])}`);
        return name === undefined ? null : this.info(name);
      },
      server_copy_plan: (a): ServerCopyPlan => {
        const p = this.plan(String(a["folder"]));
        return { name: p.name, files: p.files, bytes: p.bytes, places: this.places };
      },
      server_copy_make: (a): FolderInfo | null => {
        const place = a["place"] as CopyPlace;
        if (!this.places.includes(place)) throw { kind: "refused", message: "this device keeps no copy there" };
        if (place === "choose" && this.cancelChoose) {
          this.cancelChoose = false;
          return null;
        }
        const url = String(a["url"]);
        const folder = String(a["folder"]);
        const p = this.plan(folder);
        this.copies.set(`${url}#${folder}`, p.name);
        this.left = p.files;
        this.status = { ...this.core.sync, key: "harness", on: true, server: url, folder, folder_name: p.name, role: "owner", state: "starting", receiving: 0, sending: 0 };
        // Its first status after the window shows the folder, as the host's
        // sync starts once the folder is installed.
        setTimeout(() => {
          if (!this.status) return;
          this.status = { ...this.status, state: p.files ? "syncing" : "synced", receiving: p.files };
          this.say();
          if (p.files && this.auto) setTimeout(() => this.step(), 40);
        }, 60);
        this.core.sync = this.status;
        return this.info(p.name);
      },
    };
  }
}
