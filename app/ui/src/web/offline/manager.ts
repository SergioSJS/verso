// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window kept offline (ADR 0092): which folders this browser keeps, the
// sync that keeps them in step, the core that answers while the connection
// is down, and what the person is told. One `Offline` per page; the bridge
// (web/bridge.ts) asks it, the settings (offline/section.ts) drive it.
//
// What a folder kept is: its files in IndexedDB (store.ts), a sync state
// beside them, a `Syncer` (sync.ts) over a connection of its own (link.ts),
// and — only while the window's connection is down — an `OfflineCore`
// (core.ts) answering the window from the files. The service worker (sw/
// sw.ts) opens the page itself without a network.

import { emit } from "@tauri-apps/api/event";
import type { ContractError, FolderInfo, SyncStatus } from "../../bindings";
import { pageContract, signedIn } from "../api";
import { lang } from "../strings";
import type { OfflineCore } from "./core";
import { SyncLink } from "./link";
import { o } from "./strings";
import { IdbStore, type Kept, type Store, waiting } from "./store";
import { isAttachment, Syncer, WireRemote } from "./sync";

export type Preview = {
  notes: { files: number; bytes: number };
  attachments: { files: number; bytes: number };
  /** What the browser lets this origin keep, and uses. */
  quota: number | null;
  usage: number | null;
  persisted: boolean | null;
  secure: boolean;
  /** The window's own code, kept once for all folders. */
  shell: number | null;
};

type Runner = {
  syncer: Syncer;
  link: SyncLink;
  /** The pass is wanted (a push, a change here, a connection back). */
  timer: number;
  scan: number;
  wasOffline: boolean;
  baseline: number;
  /** Resolves the passes the bridge waits on, once one has run. */
  settled: (() => void)[];
};

const offStatus = (): SyncStatus => ({
  key: "",
  on: false,
  server: "",
  folder: "",
  folder_name: "",
  role: "",
  state: "off",
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
});

/** How often a kept folder is compared with the server with nothing else
 *  asking (ADR 0079 item 6). */
const SCAN = 300_000;

/** The error a command gets for what only the server can answer. */
/** A notification for the window to raise (notify/sources.ts hears it). */
function raise(detail: Record<string, unknown>): void {
  dispatchEvent(new CustomEvent("verso:notify", { detail }));
}

const unreachable = (): ContractError => ({ kind: "unreachable", message: location.host });

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, browser].filter(Boolean).join(" · ") || "Browser";
}

export class Offline {
  private store: Store | null = null;
  private kept = new Map<string, Kept>();
  private runners = new Map<string, Runner>();
  private core: OfflineCore | null = null;
  private coreFor: string | null = null;
  private coreLoading: Promise<OfflineCore> | null = null;
  /** What the window learned of the folders it opened: key, name, role. */
  private shown = new Map<string, { key: string; role: string }>();
  private statuses = new Map<string, SyncStatus>();
  private channel: BroadcastChannel | null = null;
  private down = false;
  private worker: { done: number; total: number; ready: boolean; failed: string | null } = { done: 0, total: 0, ready: false, failed: null };
  private name = deviceName();

  /** Whether this browser can keep folders at all. */
  static supported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  /** Whether the installed page can open without a network here (a service
   *  worker needs a secure context). */
  static workerPossible(): boolean {
    return window.isSecureContext && "serviceWorker" in navigator;
  }

  // ---- Start ------------------------------------------------------------------

  async init(): Promise<void> {
    if (!Offline.supported()) return;
    try {
      this.store = new IdbStore();
      for (const k of await this.store.folders()) this.kept.set(k.id, k);
      this.name = (await this.store.fact<string>("deviceName")) ?? this.name;
    } catch (e) {
      console.warn("Verso: the offline store is not available", e);
      this.store = null;
      return;
    }
    // What the other tabs of this device say: a status, a wipe.
    try {
      this.channel = new BroadcastChannel("verso-offline");
      this.channel.onmessage = (e) => {
        const m = e.data as { type: string; id?: string; status?: SyncStatus };
        if (m.type === "status" && m.id && m.status) {
          this.statuses.set(m.id, m.status);
          void emit("sync-status", m.status);
        } else if (m.type === "wiped") void this.forget();
        else if (m.type === "kept") void this.reload();
      };
    } catch {
      this.channel = null;
    }
    if (Offline.workerPossible()) {
      navigator.serviceWorker.addEventListener("message", (e) => this.fromWorker(e.data as { type?: string; [k: string]: unknown }));
      if (this.kept.size > 0) void this.register().catch(() => undefined);
    }
    for (const id of this.kept.keys()) this.start(id);
  }

  private async reload(): Promise<void> {
    if (!this.store) return;
    const ids = new Set<string>();
    for (const k of await this.store.folders()) {
      ids.add(k.id);
      this.kept.set(k.id, k);
      if (!this.runners.has(k.id)) this.start(k.id);
    }
    for (const id of [...this.kept.keys()]) if (!ids.has(id)) this.stop(id);
  }

  get available(): boolean {
    return this.store !== null;
  }

  keeps(id: string | null): boolean {
    return id !== null && this.kept.has(id);
  }

  keptFolders(): Kept[] {
    return [...this.kept.values()];
  }

  keptFolder(id: string): Kept | undefined {
    return this.kept.get(id);
  }

  /** The account last signed in, for a page opened with no network. */
  async cachedState<T>(): Promise<T | null> {
    return this.store ? this.store.fact<T>("state") : null;
  }

  async rememberState(value: unknown): Promise<void> {
    await this.store?.putFact("state", value).catch(() => undefined);
  }

  // ---- A kept folder's sync -------------------------------------------------------

  private start(id: string): void {
    const kept = this.kept.get(id);
    const store = this.store;
    if (!kept || !store || this.runners.has(id)) return;
    const link: SyncLink = new SyncLink(
      id,
      {
        open: (role) => {
          if (role) this.changed(id, role);
          runner.syncer.reconnected();
          this.schedule(id, 0);
        },
        role: (role) => this.changed(id, role),
        push: () => this.schedule(id, 400),
        down: () => this.linkDown(id),
        gone: (what, reason) => void this.gone(id, what, reason),
        mismatch: () => runner.syncer.problem("version", "the server speaks another contract than this page"),
      },
      pageContract,
    );
    const syncer = new Syncer({
      store,
      remote: new WireRemote(link.wire),
      kept,
      device: () => this.name,
      pt: () => lang() === "pt",
      shown: (st) => this.status(id, st),
    });
    syncer.describe(kept.key, location.origin);
    const runner: Runner = { syncer, link, timer: 0, scan: 0, wasOffline: false, baseline: 0, settled: [] };
    this.runners.set(id, runner);
    // One tab per device keeps the folder in step: the others hear its
    // status (the Web Locks API; a browser without it syncs from each tab).
    const lead = (): void => {
      link.start();
      runner.scan = window.setInterval(() => this.schedule(id, 0), SCAN);
    };
    if ("locks" in navigator) {
      void navigator.locks.request(`verso-sync:${id}`, () => {
        lead();
        return new Promise<void>(() => undefined);
      });
    } else lead();
    this.refreshWaiting(id);
  }

  private stop(id: string): void {
    const r = this.runners.get(id);
    if (r) {
      r.link.stop();
      clearTimeout(r.timer);
      clearInterval(r.scan);
      r.syncer.stopped = true;
    }
    this.runners.delete(id);
    this.kept.delete(id);
    this.statuses.delete(id);
  }

  private changed(id: string, role: string): void {
    const kept = this.kept.get(id);
    const r = this.runners.get(id);
    if (!kept || kept.role === role) return;
    kept.role = role;
    r?.syncer.setRole(role);
    void this.store?.putFolder(kept);
  }

  private status(id: string, st: SyncStatus): void {
    const r = this.runners.get(id);
    if (r && st.state === "synced" && r.wasOffline) {
      r.wasOffline = false;
      const n = r.syncer.sentCount - r.baseline;
      if (n > 0) void this.backOnline(id, st, n);
    }
    this.statuses.set(id, st);
    this.channel?.postMessage({ type: "status", id, status: st });
    void emit("sync-status", st);
    if (r && st.state === "synced") {
      for (const f of r.settled.splice(0)) f();
    }
  }

  private async backOnline(id: string, st: SyncStatus, n: number): Promise<void> {
    const s = o();
    // Said through the window's notifications (ADR 0084 item 7), which
    // hear this event (notify/sources.ts): this layer never imports the
    // window.
    raise({
      kind: "sync",
      // The key the sync's own news uses (notify/sources.ts), so that the
      // generic "sync is back" that follows is the same news, said once.
      key: `sync:${st.key}`,
      state: "ok",
      level: "success",
      title: s.backTitle,
      sentence: st.conflicts.length > 0 ? `${s.backSent(n)} ${s.conflictsAfter(st.conflicts.length)}` : s.backSent(n),
      actions: [{ label: s.section, act: "settings", arg: "sync" }],
      folder: st.key,
      folderName: this.kept.get(id)?.name ?? st.folder_name,
    });
  }

  private linkDown(id: string): void {
    const r = this.runners.get(id);
    if (!r) return;
    if (!r.wasOffline) r.baseline = r.syncer.sentCount;
    r.wasOffline = true;
    r.syncer.offline();
    this.refreshWaiting(id);
  }

  /** A pass soon, once the pushes and the writes of the moment have settled. */
  schedule(id: string, delay = 400): void {
    const r = this.runners.get(id);
    if (!r) return;
    clearTimeout(r.timer);
    r.timer = window.setTimeout(() => void this.pass(id), delay);
  }

  private async pass(id: string): Promise<void> {
    const r = this.runners.get(id);
    if (!r || !r.link.up || r.syncer.stopped) return;
    try {
      await r.syncer.settle();
    } finally {
      this.refreshWaiting(id);
      for (const f of r.settled.splice(0)) f();
    }
  }

  /** The count of writes waiting, kept up in the status while offline. */
  refreshWaiting(id: string): void {
    const store = this.store;
    const r = this.runners.get(id);
    if (!store || !r) return;
    void Promise.all([store.listing(id), store.state(id)]).then(([listing, state]) => r.syncer.waitingNow(waiting(listing, state))).catch(() => undefined);
  }

  /** Writes that have not gone up. */
  async waitingCount(id: string): Promise<number> {
    if (!this.store) return 0;
    const [listing, state] = await Promise.all([this.store.listing(id), this.store.state(id)]);
    return waiting(listing, state);
  }

  async waitingTotal(): Promise<number> {
    let n = 0;
    for (const id of this.kept.keys()) n += await this.waitingCount(id);
    return n;
  }

  private async gone(id: string, what: "session" | "folder", reason: string | null): Promise<void> {
    if (what === "session") {
      // The server ended this device's session (ADR 0092 item 6): the copy
      // goes at this connection.
      const lost = await this.wipe();
      raise({ kind: "sync", key: "offline:wiped", state: "wiped", level: "error", title: o().section, sentence: o().wipedByServer(lost), folder: "", folderName: "" });
      sessionStorage.setItem("verso.wipedWith", String(lost));
      return;
    }
    // The folder is not there for this account any more: the copy stays, and
    // the status says why (the desktop's `folder_gone`).
    const r = this.runners.get(id);
    r?.syncer.problem("folder_gone", reason ?? "the folder is gone");
    r?.link.stop();
  }

  // ---- The bridge's side -------------------------------------------------------------

  /** The window's connection dropped (or never came up). */
  connectionDown(id: string | null): void {
    this.down = true;
    if (id && this.runners.has(id)) this.linkDown(id);
  }

  /** The window's connection is open: the folder's pass runs first, so that
   *  what was written offline is on the server before the window reads from
   *  there again. Waits at most `within` ms. */
  async connectionUp(id: string | null, within = 20_000): Promise<void> {
    this.down = false;
    const r = id ? this.runners.get(id) : undefined;
    if (r) {
      r.link.nudge();
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, within);
        r.settled.push(() => {
          clearTimeout(timer);
          resolve();
        });
        // Not up yet: the link opens and its first pass releases this; one
        // that is up passes now.
        if (r.link.up) this.schedule(id!, 0);
      });
    }
    // The device's copy changed under the core, if it was on: the next time
    // it is needed it is read again.
    this.core = null;
    this.coreFor = null;
  }

  folderOpened(id: string, info: FolderInfo | null, role: string | null): void {
    const was = this.shown.get(id);
    const key = info?.key ?? was?.key ?? "";
    this.shown.set(id, { key, role: role ?? was?.role ?? "" });
    const kept = this.kept.get(id);
    if (kept && key && kept.key !== key) {
      kept.key = key;
      void this.store?.putFolder(kept);
      this.runners.get(id)?.syncer.describe(key, location.origin);
    }
    if (kept && role) this.changed(id, role);
  }

  /** The server says what the person's role in the folder is. */
  roleIs(id: string, role: string): void {
    const was = this.shown.get(id);
    this.shown.set(id, { key: was?.key ?? "", role });
    this.changed(id, role);
  }

  shownInfo(id: string): { key: string; role: string } | undefined {
    return this.shown.get(id);
  }

  /** The window's command, answered from the folder kept. */
  async answer(id: string, cmd: string, args: Record<string, unknown>): Promise<unknown> {
    const store = this.store;
    const kept = this.kept.get(id);
    if (!store || !kept) throw unreachable();
    const core = await this.coreOf(id, kept, store);
    const value = await core.answer(store, cmd, args);
    this.refreshWaiting(id);
    return value;
  }

  private coreOf(id: string, kept: Kept, store: Store): Promise<OfflineCore> {
    if (this.core && this.coreFor === id) return Promise.resolve(this.core);
    if (this.coreLoading && this.coreFor === id) return this.coreLoading;
    this.coreFor = id;
    this.coreLoading = (async () => {
      const { OfflineCore } = await import("./core");
      const core = new OfflineCore(kept, kept.role === "reader");
      core.load(await store.all(id));
      this.core = core;
      this.coreLoading = null;
      return core;
    })();
    return this.coreLoading;
  }

  /** The sync commands of the window (`folder_sync` and its siblings) for a
   *  kept folder; the status is the browser's own. */
  async syncCommand(id: string | null, cmd: string, args: Record<string, unknown>): Promise<{ answered: true; value: unknown } | { answered: false }> {
    const done = (value: unknown) => ({ answered: true as const, value });
    if (!cmd.startsWith("folder_sync") && cmd !== "note_made_from_template") return { answered: false };
    const r = id ? this.runners.get(id) : undefined;
    switch (cmd) {
      case "folder_sync":
        return done(r ? (this.statuses.get(id!) ?? r.syncer.status) : (id && this.statuses.get(id)) || offStatus());
      case "folder_sync_pause":
        r?.syncer.pause(args["paused"] === true);
        if (r && args["paused"] !== true) this.schedule(id!, 0);
        return done(null);
      case "folder_sync_confirm":
        r?.syncer.confirm();
        if (r) this.schedule(id!, 0);
        return done(null);
      case "folder_sync_now":
        if (r) {
          r.link.nudge();
          this.schedule(id!, 0);
        }
        return done(null);
      case "folder_sync_stop":
        if (id && r) await this.turnOff(id);
        return done(this.statuses.get(id ?? "") ?? offStatus());
      case "note_made_from_template":
        if (r) await r.syncer.madeFromTemplate(String(args["path"] ?? ""), String(args["text"] ?? ""));
        // The server's own answer (nothing) follows when online.
        return this.down ? done(null) : { answered: false };
      default:
        // Starting a sync with a server is the desktop's, not a browser's.
        return done(offStatus());
    }
  }

  // ---- Turning a folder on and off ---------------------------------------------------

  async preview(id: string): Promise<Preview> {
    const secure = window.isSecureContext;
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const persisted = (await navigator.storage?.persisted?.().catch(() => undefined)) ?? null;
    const shell = await fetch("/offline-size.json", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ core: number; rest: number }>) : null))
      .then((j) => (j ? j.core + j.rest : null))
      .catch(() => null);
    // The folder's files, as the server lists them: asked on a connection
    // of its own, so that nothing is kept before the person says yes.
    const files = await this.listRemote(id);
    const notes = { files: 0, bytes: 0 };
    const attachments = { files: 0, bytes: 0 };
    for (const f of files) {
      const into = isAttachment(f.path) ? attachments : notes;
      into.files++;
      into.bytes += f.size;
    }
    return { notes, attachments, quota: est?.quota ?? null, usage: est?.usage ?? null, persisted, secure, shell };
  }

  private listRemote(id: string): Promise<{ path: string; size: number }[]> {
    return new Promise((resolve, reject) => {
      const link: SyncLink = new SyncLink(
        id,
        {
          open: () => {
            new WireRemote(link.wire)
              .state()
              .then((s) => resolve(s.files))
              .catch(reject)
              .finally(() => link.stop());
          },
          push: () => undefined,
          down: () => undefined,
          gone: () => {
            link.stop();
            reject(unreachable());
          },
          mismatch: () => {
            link.stop();
            reject({ kind: "failed", message: "the server speaks another contract than this page" });
          },
        },
        pageContract,
      );
      link.start();
      window.setTimeout(() => {
        link.stop();
        reject(unreachable());
      }, 20_000);
    });
  }

  /** Keep the folder `id` on this device. */
  async turnOn(id: string, name: string, attachments: "opened" | "all"): Promise<{ persisted: boolean | null }> {
    const store = this.store;
    if (!store) throw new Error("the browser keeps nothing for offline use");
    const info = this.shown.get(id);
    const me = signedIn();
    // Asked, and the answer said (item 3): a refusal is kept in mind, not
    // hidden.
    let persisted: boolean | null = null;
    if (navigator.storage?.persist) persisted = await navigator.storage.persist().catch(() => false);
    const kept: Kept = {
      key: info?.key ?? "",
      id,
      name,
      role: info?.role || "editor",
      account: me?.id ?? "",
      attachments,
      opened: [],
      since: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      last: null,
    };
    await store.putFolder(kept);
    this.kept.set(id, kept);
    if (Offline.workerPossible()) await this.register().catch((e: unknown) => {
      this.worker.failed = String(e);
      this.tellWorker();
    });
    this.start(id);
    this.channel?.postMessage({ type: "kept" });
    return { persisted };
  }

  /** Delete the copy of a folder from this device. */
  async turnOff(id: string): Promise<void> {
    this.stop(id);
    if (this.coreFor === id) {
      this.core = null;
      this.coreFor = null;
    }
    await this.store?.removeFolder(id);
    this.channel?.postMessage({ type: "kept" });
    const off = { ...offStatus(), folder: id };
    this.statuses.set(id, off);
    void emit("sync-status", off);
  }

  async setAttachments(id: string, mode: "opened" | "all"): Promise<void> {
    const kept = this.kept.get(id);
    if (!kept || !this.store) return;
    kept.attachments = mode;
    await this.store.putFolder(kept);
    this.schedule(id, 0);
  }

  /** The page asked for a kept folder's attachment while connected: keep it
   *  (ADR 0092 item 3). */
  async opened(id: string, path: string): Promise<void> {
    const kept = this.kept.get(id);
    if (!kept || kept.attachments !== "opened" || !this.store || kept.opened.includes(path)) return;
    kept.opened.push(path);
    if (kept.opened.length > 5000) kept.opened.splice(0, kept.opened.length - 5000);
    await this.store.putFolder(kept).catch(() => undefined);
    this.schedule(id, 800);
  }

  async setDeviceName(name: string): Promise<void> {
    this.name = name.trim() || deviceName();
    await this.store?.putFact("deviceName", this.name).catch(() => undefined);
  }

  deviceName(): string {
    return this.name;
  }

  async usage(id: string): Promise<{ files: number; bytes: number; last: string | null }> {
    if (!this.store) return { files: 0, bytes: 0, last: null };
    const listing = await this.store.listing(id);
    let bytes = 0;
    for (const f of listing.values()) bytes += f.size;
    return { files: listing.size, bytes, last: this.kept.get(id)?.last ?? null };
  }

  progress(): { done: number; total: number; ready: boolean; failed: string | null } {
    return { ...this.worker };
  }

  // ---- Leaving the device --------------------------------------------------------------

  /** Everything this device keeps is deleted (sign-out, ADR 0092 item 6; the
   *  server ending the session). Returns how many writes had not gone up. */
  async wipe(): Promise<number> {
    const lost = await this.waitingTotal().catch(() => 0);
    this.channel?.postMessage({ type: "wiped" });
    await this.forget();
    try {
      await this.store?.wipe();
    } catch {
      /* the database is deleted below */
    }
    // The database itself, not only its rows: nothing of the account stays.
    await new Promise<void>((resolve) => {
      this.store = null;
      try {
        const del = indexedDB.deleteDatabase("verso-offline");
        del.onsuccess = del.onerror = del.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });
    this.store = Offline.supported() ? new IdbStore() : null;
    return lost;
  }

  private async forget(): Promise<void> {
    for (const id of [...this.runners.keys()]) this.stop(id);
    this.kept.clear();
    this.core = null;
    this.coreFor = null;
  }

  // ---- The service worker ----------------------------------------------------------------

  private async register(): Promise<void> {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const ready = await navigator.serviceWorker.ready;
    const active = reg.active ?? ready.active;
    // The rest of the window's files, in the background.
    if (this.worker.total === 0 || !this.worker.ready) active?.postMessage({ type: "precache-rest" });
  }

  private fromWorker(m: { type?: string; [k: string]: unknown }): void {
    if (m.type === "precache") {
      this.worker = { done: Number(m.done ?? 0), total: Number(m.total ?? 0), ready: m.ready === true, failed: typeof m.failed === "string" ? m.failed : null };
      this.tellWorker();
    } else if (m.type === "opened") {
      void this.opened(String(m.folder ?? ""), String(m.path ?? ""));
    }
  }

  private tellWorker(): void {
    dispatchEvent(new CustomEvent("verso:offline-worker", { detail: this.progress() }));
  }

  /** The window is answered from this device's copy (or no longer): what is
   *  computed from the notes here — the search, the links, the graph — says
   *  so (ADR 0092 item 4). */
  mark(on: boolean): void {
    const root = document.documentElement;
    if (on) {
      root.dataset["offline"] = "1";
      root.style.setProperty("--offline-mark", JSON.stringify(o().offlineMark));
    } else {
      delete root.dataset["offline"];
      root.style.removeProperty("--offline-mark");
    }
    const search = document.getElementById("search") as HTMLInputElement | null;
    if (search) {
      search.placeholder = on ? o().searchOffline : "";
      search.title = on ? o().offlineMark : "";
    }
  }

  /** A folder the window may be reopened on, for the chooser when the
   *  server cannot be reached. */
  choices(): { id: string; name: string; role: string }[] {
    return this.keptFolders().map((k) => ({ id: k.id, name: k.name, role: k.role }));
  }
}

export const offline = new Offline();

/** Whether a failed request was for want of a network, not the server's
 *  answer. */
export function noNetwork(e: unknown): boolean {
  return e instanceof TypeError || (typeof e === "object" && e !== null && (e as { transport?: boolean }).transport === true);
}

