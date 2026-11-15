// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { listen } from "@tauri-apps/api/event";
import { commands, type InstallResult, type UpdateInfo, type UpdateProgress } from "./bindings";
import { dropPassedUpdates } from "./notify/index";
import { updateFound } from "./notify/sources";

export class UpdateController {
  private _info: UpdateInfo | null = null;
  private _checking = false;
  private _downloading = false;
  private _progress: UpdateProgress | null = null;
  private _result: InstallResult | null = null;
  private _error: string | null = null;
  private unlistenProgress: (() => void) | null = null;
  private listeners = new Set<() => void>();

  get info(): UpdateInfo | null { return this._info; }
  get checking(): boolean { return this._checking; }
  get downloading(): boolean { return this._downloading; }
  get progress(): UpdateProgress | null { return this._progress; }
  get result(): InstallResult | null { return this._result; }
  get error(): string | null { return this._error; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    for (const fn of this.listeners) fn();
  }

  async check(silent = false): Promise<UpdateInfo | null> {
    if (this._checking || this._downloading) return this._info;
    this._checking = true;
    this._error = null;
    this.notify();
    try {
      const res = await commands.checkForUpdates();
      if (res.status === "ok") {
        this._info = res.data;
        // The lines of versions this app already runs go; a new version
        // is a notification (ADR 0084 item 7): once per version, with the
        // update card's two actions.
        dropPassedUpdates(res.data.current_version);
        if (res.data.has_update) updateFound(res.data);
        return res.data;
      } else {
        if (!silent) this._error = res.error.message;
        return null;
      }
    } catch (e: any) {
      if (!silent) this._error = String(e?.message || e);
      return null;
    } finally {
      this._checking = false;
      this.notify();
    }
  }

  async downloadAndInstall(): Promise<InstallResult | null> {
    if (this._downloading) return null;
    // Pressed from a notification before this window checked (a line kept
    // from an earlier start): the check first, and a download only when
    // it found a version — else the card says the app is up to date.
    if (!this._info) await this.check(false);
    if (!this._info?.has_update || this._downloading) return null;
    this._downloading = true;
    this._error = null;
    this._result = null;
    this._progress = {
      downloaded_bytes: 0,
      total_bytes: this._info.asset_size ?? 0,
      percent: 0,
      status: "downloading",
      message: null,
    };
    this.notify();

    if (!this.unlistenProgress) {
      this.unlistenProgress = await listen<UpdateProgress>("verso://update-progress", (e) => {
        this._progress = e.payload;
        this.notify();
      });
    }

    try {
      // The host picks the asset and checks it against the release's
      // published checksum itself; a release without one comes back as a
      // refusal whose message is shown on the update card below.
      const res = await commands.downloadAndInstallUpdate();
      if (res.status === "ok") {
        this._result = res.data;
        this._downloading = false;
        this.notify();
        return res.data;
      } else {
        this._error = res.error.message;
        this._downloading = false;
        this.notify();
        return null;
      }
    } catch (e: any) {
      this._error = String(e?.message || e);
      this._downloading = false;
      this.notify();
      return null;
    }
  }

  async restart(): Promise<void> {
    await commands.restartApp();
  }
}
