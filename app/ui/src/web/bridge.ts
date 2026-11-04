// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window in a browser, talking to `verso serve` (ADR 0073 item 2): the
// contract's commands go over a WebSocket instead of Tauri's IPC, at the
// one seam the browser harness already stands in for (Tauri's `invoke`, its
// events, `convertFileSrc`). The window above it does not know which side
// of the wire the core is on (ADR 0026 rule 2): what it may do there it
// learns from `capabilities`.
//
// What only a browser can do is done here: a note "in a window of its own"
// is a new tab, a web address opens in another tab, choosing a folder is a
// list of the server's folders the person may enter.

import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { ContractError, FolderInfo } from "../bindings";
import { api, ApiError, byApp, pageContract, signedIn } from "./api";
import { noNetwork, offline } from "./offline/manager";
import { o } from "./offline/strings";
import { notice } from "./notice";
import { pickFiles } from "./pickFiles";
import { readLinkCall } from "./readLinkOwner";
import { FULL_RETRY, phonesFullMost } from "./phonesFull";
import { saidOnClose } from "./openingRefused";
import { bridgeReady } from "./localTable";
import { w } from "./strings";
import { sortMessage } from "../table/sound/frameHeader";

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

const params = new URLSearchParams(location.search);
let socket: WebSocket | null = null;
let open = false;
let nextId = 1;
const pending = new Map<number, Pending>();
/** Requests made while the connection was down, sent once it is back — or,
 *  for a folder kept on this device (ADR 0092), answered from its copy when
 *  the connection is found to be gone. */
const waiting: { id: number; text: string; cmd: string; args: unknown }[] = [];
/** When the page started: a connection that has not come up within a few
 *  seconds is taken as down, for a folder that can be opened without it. */
const startedAt = Date.now();
const GIVE_UP = 4000;
/** Whether the folder shown was answered from this device's copy since the
 *  connection went: the window has to be put right when it returns. */
let routedOffline = false;
let gaveUp = false;
/** Who is waiting to know whether the connection is up or down. */
const verdicts: ((v: "up" | "down") => void)[] = [];
/** The folder this tab shows: its id on the server, and the role. */
let folderId: string | null = params.get("folder");
let role: string | null = null;
let openedOnce = false;
/** Whether a connection ever came up in this tab: a refusal before it is
 *  said at each try (web/openingRefused.ts). */
let everUp = false;
let retry = 0;
/** Connections in a row that the other end closed within [`LIVED`] of opening: the wait grows with them, so a server that accepts and closes at once is not asked once a second. */
let quick = 0;
let openedAt = 0;
const LIVED = 10_000;
let chooser: (() => Promise<string | null>) | null = null;
/** The reconnection waiting its turn; a socket being made. */
let reconnect = 0;

let connecting = false;

/** The token of the read link this tab shows (ADR 0105): the window of
 *  someone with no account, which speaks to `/r/<token>/ws` and asks
 *  nothing else of the server. */
let visitor: string | null = null;
/** Said when the link ends under the open window; the connection is then
 *  left closed, not tried again. */
let onLinkEnded: (() => void) | null = null;
let linkEnded = false;
/** Where a live share's frames go (`audio_share_hear`, the desktop host's channel answered here). */
let audioFrames: { onmessage: (bytes: ArrayBuffer) => void } | null = null;

/** The folder the tab shows, for the pages around the window. */
export function currentFolderId(): string | null {
  return folderId;
}

export function currentRole(): string | null {
  return role;
}

function refused(message: string): ContractError {
  return { kind: "refused", message };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** The tab's address says which folder (and note) it shows, so that a
 *  reload or a shared address comes back to it. */
function remember(id: string | null): void {
  if (visitor) return;
  const url = new URL(location.href);
  if (id) url.searchParams.set("folder", id);
  else url.searchParams.delete("folder");
  history.replaceState(history.state, "", url);
}

/** While the folder is opened again after a reconnection, what the
 *  window asks waits behind it. */
let reopening = false;

function send(id: number, cmd: string, args: unknown): void {
  const text = JSON.stringify({ id, cmd, args: args ?? {} });
  if (socket && open && !reopening) socket.send(text);
  else waiting.push({ id, text, cmd, args });
}

/** Whether the connection is down: closed and tried again, the browser says
 *  there is no network, or it has not come up in a few seconds. */
function isDown(): boolean {
  if (open) return false;
  return retry > 0 || navigator.onLine === false || gaveUp || Date.now() - startedAt > GIVE_UP;
}

/** Whether the window's commands are answered from this device's copy: the
 *  folder shown is kept here and the connection is down. */
function onThisDevice(): boolean {
  return folderId !== null && offline.keeps(folderId) && isDown();
}

function request(cmd: string, args: unknown): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send(id, cmd, args);
  });
}

/** The connection is found to be gone: a folder kept on this device goes on
 *  from its copy, what was asked meanwhile is answered from it, and the
 *  window is told once. */
function wentDown(): void {
  offline.connectionDown(folderId);
  for (const v of verdicts.splice(0)) v("down");
  if (!onThisDevice()) return;
  if (!routedOffline) {
    routedOffline = true;
    offline.mark(true);
    notice(o().nowOffline);
  }
  const held = waiting.splice(0);
  for (const w_ of held) {
    const p = pending.get(w_.id);
    if (!p) continue;
    pending.delete(w_.id);
    offline.answer(folderId!, w_.cmd, (w_.args ?? {}) as Record<string, unknown>).then(p.resolve, p.reject);
  }
}

// A connection that does not come up is a connection that is down: a kept
// folder opens from the device, without waiting for the browser's own
// timeout (a minute or more on a phone that is on a train).
window.setTimeout(() => {
  if (!open) {
    gaveUp = true;
    wentDown();
  }
}, GIVE_UP);
addEventListener("offline", () => {
  if (!open) wentDown();
});
addEventListener("online", () => {
  gaveUp = false;
});

/** Up or down, as soon as it is known. */
function verdict(): Promise<"up" | "down"> {
  if (open) return Promise.resolve("up");
  if (isDown()) return Promise.resolve("down");
  return new Promise((resolve) => verdicts.push(resolve));
}

function setRole(next: string | null): void {
  role = next;
  if (folderId && next && !visitor) offline.roleIs(folderId, next);
  dispatchEvent(new CustomEvent("verso:role", { detail: next }));
}

function onMessage(data: string): void {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }
  if (typeof m.id === "number") {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if ("err" in m) p.reject(m.err);
    else p.resolve(m.ok);
    return;
  }
  if (typeof m.event === "string") {
    void emit(m.event, m.payload);
    return;
  }
  if (m.hello) {
    const hello = m.hello as { contract: string };
    if (pageContract() && hello.contract !== pageContract()) {
      // A server updated under an open page: the page that matches it
      // is one reload away — once; a second mismatch is said, not looped.
      if (!sessionStorage.getItem("verso.reloadedFor")) {
        sessionStorage.setItem("verso.reloadedFor", hello.contract);
        notice(w().newVersion);
        location.reload();
      } else {
        notice(w().newVersionStuck, "error");
      }
      return;
    }
    sessionStorage.removeItem("verso.reloadedFor");
    return;
  }
  if (m.folder) {
    const f = m.folder as { id: string; role: string };
    folderId = f.id;
    remember(f.id);
    setRole(f.role);
    return;
  }
  if (typeof m.role === "string") {
    setRole(m.role);
    return;
  }
  // Said to the window as the desktop's host says it (`server-gone`, ADR
  // 0084 item 10): the window's list keeps it across the page that
  // follows — the event's listeners run before its promise settles.
  if (m.gone === "session") {
    notice(w().signedOut, "error");
    void emit("server-gone", { url: location.origin, what: "session", address: null, reason: null }).finally(() => {
      location.href = `/signin?next=${encodeURIComponent(location.pathname + location.search)}`;
    });
    return;
  }
  // The link ended: revoked, expired or turned off (ADR 0105 item 5). The
  // window is replaced by a page that says so, and nothing is tried again.
  if (m.gone === "link") {
    linkEnded = true;
    onLinkEnded?.();
    return;
  }
  if (m.gone === "folder") {
    const reason = typeof m.reason === "string" ? m.reason : null;
    // The game master closed the table: the folder is remembered, and the
    // window that follows says the table is closed and waits for it to open.
    const shut = reason === "closed";
    if (!shut) {
      notice(w().folderGone, "error");
      folderId = null;
      remember(null);
    }
    // No folder, no role in it.
    setRole(null);
    void emit("server-gone", { url: location.origin, what: shut ? "closed" : "folder", address: null, reason: shut ? null : reason }).finally(() => location.reload());
  }
}

function connect(): void {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const at = visitor ? `/r/${encodeURIComponent(visitor)}/ws` : "/api/ws";
  const ws = new WebSocket(`${scheme}://${location.host}${at}`);
  socket = ws;
  connecting = true;
  ws.addEventListener("open", () => {
    connecting = false;
    open = true;
    everUp = true;
    const back = retry > 0 || routedOffline;
    openedAt = Date.now();
    retry = 0;
    gaveUp = false;
    for (const v of verdicts.splice(0)) v("up");
    if (back && folderId && openedOnce) {
      // The folder again first: a new connection shows no folder, and a
      // save queued while offline would be answered "no folder" if it went
      // before. Then what waited, and the window told the folder may have
      // changed while it was away: it checks its open notes.
      reopening = true;
      // A folder kept on this device first sends what was written there
      // while the connection was gone (ADR 0092 item 1), and takes what
      // changed on the server: the window reads from the server only once
      // the two are alike.
      void offline.connectionUp(offline.keeps(folderId) ? folderId : null).then(() => {
        if (socket !== ws || !open) {
          reopening = false;
          return;
        }
        routedOffline = false;
        offline.mark(false);
        const id = nextId++;
        const reopened = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        ws.send(JSON.stringify({ id, cmd: "open_server_folder", args: { id: folderId } }));
        // The folder's key, from the answer: the window hears a change of
        // its own folder only (changes.ts).
        let key = "";
        void reopened
          .then((info) => {
            key = (info as { key?: string } | null)?.key ?? "";
            offline.folderOpened(folderId!, info as FolderInfo | null, role);
          })
          .catch(() => undefined)
          .then(() => {
            reopening = false;
            // Dropped again meanwhile: what waits goes with the next one.
            if (socket !== ws || !open) return Promise.reject(new Error("dropped"));
            for (const w_ of waiting.splice(0)) ws.send(w_.text);
            return request("reindex", {});
          })
          .then((index) => emit("folder-changed", { key, changed: [], removed: [], listing: true, index }))
          // Back, as the desktop's host says it: the window says so once and
          // its live notes join their rooms again and send what was typed
          // meanwhile (dialogs/servers.ts, collab.ts).
          .then(() => emit("server-back", { url: location.origin }))
          .catch(() => undefined);
      });
      return;
    }
    routedOffline = false;
    for (const w_ of waiting.splice(0)) ws.send(w_.text);
  });
  // Sorted by the first byte before anything else is read (ADR 0116 item
  // 19): text to the JSON path; an audio frame of a live share to the
  // window's listener (`audio_share_hear`). A browser says no sync, so the
  // server sends it no piece of a file as bytes: any other binary message
  // is not for this window.
  ws.binaryType = "arraybuffer";
  ws.addEventListener("message", (e) => {
    const m = sortMessage(e.data);
    if (m?.kind === "text") onMessage(m.text);
    else if (m?.kind === "audio") audioFrames?.onmessage(m.bytes.buffer as ArrayBuffer);
  });
  ws.addEventListener("close", (ev) => {
    connecting = false;
    if (linkEnded) {
      open = false;
      return;
    }
    // The computer serving this phone has its connected devices at the most
    // (ADR 0096 item 13): it accepted the socket and closed it with this
    // code and `phones_connected:<most>` (crates/verso-server/src/rpc.rs).
    // Said in words, once per refusal, and tried again slowly.
    const most = phonesFullMost(ev.code, ev.reason);
    const fullSaid = most === null ? null : w().phonesFull(most);
    // A connection refused before it ever came up (too many from one
    // address, the server not there yet) is said at each try: the window
    // that would say a drop is not there yet.
    const said = saidOnClose({ everUp, full: fullSaid, offline: w().offline });
    if (said) notice(said, "error");
    open = false;
    reopening = false;
    // What was asked and not answered may or may not have happened: it is
    // refused as unavailable, never sent again (a write twice is worse).
    // (A request not sent yet, for a folder kept on this device, waits to be
    // answered from the copy: it has not happened anywhere.)
    const unsent = new Set(folderId !== null && offline.keeps(folderId) ? waiting.map((q) => q.id) : []);
    for (const [id, p] of pending) {
      if (unsent.has(id)) continue;
      pending.delete(id);
      p.reject({ kind: "unavailable", message: fullSaid ?? w().offline, transport: true } satisfies ContractError & { transport: boolean });
    }
    quick = Date.now() - openedAt < LIVED ? quick + 1 : 0;
    retry++;
    // Dropped: said to the window as the desktop's host says it (ADR 0084
    // items 7 and 10), once per drop.
    if (retry === 1) void emit("server-gone", { url: location.origin, what: "connection", address: null, reason: null });
    // A folder kept on this device goes on from its copy (ADR 0092).
    wentDown();
    reconnect = window.setTimeout(connect, fullSaid ? FULL_RETRY : Math.min(30_000, 1000 * 2 ** Math.min(retry + quick, 5)));
  });
}

// The browser says the network is back: tried now, not after the wait.
addEventListener("online", () => {
  if (open || connecting || socket === null) return;
  clearTimeout(reconnect);
  connect();
});

/** Commands only the browser answers; the rest go to the server. */
async function local(cmd: string, a: Record<string, unknown>): Promise<{ answered: true; value: unknown } | { answered: false }> {
  const done = (value: unknown) => ({ answered: true as const, value });
  // A read link's window: no folders to choose, no account, no shares, no
  // sync of its own — the server answers the read commands, and these.
  if (visitor) {
    if (cmd.startsWith("share_") || cmd.startsWith("read_link_") || cmd.startsWith("folder_sync") || cmd === "server_prove") {
      throw refused("not through a read link");
    }
    if (cmd === "server_accounts" || cmd === "recent_folders") return done([]);
    if (cmd === "server_folders") return done({ folders: [], may_create: false });
    if (cmd === "pick_folder") return done(null);
  }
  // The sync of a folder kept in this browser (ADR 0092): its status and
  // its buttons are the browser's own.
  if (cmd.startsWith("folder_sync") || cmd === "note_made_from_template") {
    const mine = await offline.syncCommand(folderId, cmd, a);
    if (mine.answered) return mine;
  }
  // With no folder open and no connection there is nothing to ask: the
  // window starts as a server's window that can only read the folder list.
  if (cmd === "capabilities" && folderId === null && isDown()) return done({ host: "server", can: ["account"], latency_ms: null });
  switch (cmd) {
    // A live share's frames come on this socket itself (ADR 0116 item 19):
    // they go to the channel the window gives, as the desktop's host does.
    case "audio_share_hear":
      audioFrames = (a.frames as { onmessage: (bytes: ArrayBuffer) => void } | undefined) ?? null;
      return done(null);
    // "Import files…" (A11Y.10): the browser's own file picker, and the
    // chosen files' names and bytes, as the desktop host answers.
    case "pick_files":
      return done(await pickFiles(Number(a["maxMb"]) || undefined));
    case "pick_folder": {
      const id = chooser ? await chooser() : null;
      if (!id) return done(null);
      return done(await openFolder(id));
    }
    case "open_initial": {
      if (!folderId || openedOnce) return done(null);
      const info = await openFolder(folderId).catch(() => {
        // A folder of the address one may no longer enter: the start page,
        // with no role.
        folderId = null;
        remember(null);
        setRole(null);
        return null;
      });
      // The contract's answer names what was opened (ADR 0114): in a
      // browser it is always a folder of the server, never a loose file.
      return done(info ? { kind: "folder", info } : null);
    }
    case "open_window":
      window.open(`/?folder=${encodeURIComponent(folderId ?? "")}&note=${encodeURIComponent(String(a.path ?? ""))}`, "_blank");
      return done(null);
    case "new_window":
      window.open(a.sameFolder && folderId ? `/?folder=${encodeURIComponent(folderId)}&window=1` : "/?window=1", "_blank");
      return done(null);
    case "popout_target":
      return done(params.get("note"));
    case "return_to_main":
      location.href = `/?folder=${encodeURIComponent(folderId ?? "")}`;
      return done(null);
    case "open_url": {
      const url = String(a.url ?? "");
      if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer");
      return done(null);
    }
    case "restart_app":
      location.reload();
      return done(null);
    case "open_devtools":
      return done(null);
    case "log_read":
      return done("");
    case "check_for_updates":
      return done({
        current_version: "",
        latest_version: "",
        has_update: false,
        release_name: "",
        release_notes: "",
        download_url: null,
        asset_url: null,
        asset_name: null,
        asset_size: null,
        published_at: null,
      });
    // The owner's share dialog (ADR 0081 item 7): the server's own pages
    // of the folder, over HTTP with the session, as the desktop app asks
    // them with its token.
    case "share_list":
    case "share_grant":
    case "share_invite":
    case "share_revoke":
    case "share_attachments":
      return done(await shareCall(cmd, a));
    // The owner's read links (ADR 0105), over HTTP with the session.
    case "read_link_list":
    case "read_link_secrets":
    case "read_link_create":
    case "read_link_revoke":
      return done(await readLinkCall(folderId, cmd, a));
    // The folder switcher (ADR 0081 item 5): in a browser the account is
    // this server's, its folders and shares are its own, and nothing is on
    // this computer.
    case "recent_folders":
      return done([]);
    // Where this window reaches its server: the page's own origin.
    case "window_server":
      return done({ url: location.origin, folder: folderId ?? "" });
    case "server_accounts": {
      const me = signedIn();
      return done(me ? [{ url: location.origin, email: me.email, name: me.name }] : []);
    }
    case "server_folders": {
      try {
        const r = await api<{ folders: { id: string; name: string; role: string; owner: { name: string } | null; share: boolean; missing?: boolean }[]; mayCreate?: boolean }>("GET", "/api/folders");
        return done({
          folders: r.folders.map((f) => ({ id: f.id, name: f.name, role: f.role, owner: f.owner?.name ?? null, share: f.share, missing: f.missing ?? false })),
          may_create: r.mayCreate === true,
        });
      } catch (e) {
        // No network: the folders kept on this device, which open without it.
        if (noNetwork(e) && offline.keptFolders().length > 0) {
          return done({ folders: offline.keptFolders().map((k) => ({ id: k.id, name: k.name, role: k.role, owner: null, share: false, missing: false })), may_create: false });
        }
        throw e;
      }
    }
    case "server_open":
      return done(await openFolder(String(a.folder ?? "")));
    case "reopen_folder": {
      const value = await request(cmd, a);
      openedOnce = true;
      return done(value);
    }
    default:
      return { answered: false };
  }
}

type Share = { id: string | null; path: string; people: unknown[]; attachments: string | null; missing: boolean };

/** A share command of the window, asked of the server's pages; refused as
 *  the contract refuses. */
async function shareCall(cmd: string, a: Record<string, unknown>): Promise<unknown> {
  if (!folderId) throw refused("no folder");
  // A desktop app serving a phone shares nothing (ADR 0096): asked, its
  // server answers 404 and the phone's console shows it on every folder.
  if (byApp()) throw refused("shares are a server's");
  const at = `/api/folders/${encodeURIComponent(folderId)}/shares`;
  try {
    switch (cmd) {
      case "share_list": {
        const r = await api<{ root: Share; shares: Share[] }>("GET", at);
        return [r.root, ...r.shares];
      }
      case "share_grant":
        return await api<Share>("PUT", at, { path: a.path, email: a.email, role: a.role });
      // An invitation for an e-mail no account has, carrying this folder
      // (ADR 0081 item 4): the server's admin only, the server says.
      case "share_invite":
        return await api<{ link: string; expires: number }>("POST", `${at}/invite`, { path: a.path, email: a.email, role: a.role });
      case "share_revoke":
        return await api<Share>("POST", `${at}/revoke`, { path: a.path, account: a.account ?? null });
      default:
        return await api<Share>("PUT", `${at}/attachments`, { path: a.path, attachments: a.attachments ?? null });
    }
  } catch (e) {
    if (e instanceof ApiError) {
      // A fresh proof the person did not give (cancelled, or no way to ask)
      // is its own kind, as the desktop host's: the dialog says it in its words.
      if (e.code === "prove_first") throw { kind: "prove_first", message: e.message } satisfies ContractError;
      throw { kind: e.status === 404 ? "not_found" : e.status === 401 || e.status === 403 ? "refused" : "failed", message: e.message } satisfies ContractError;
    }
    throw { kind: "unavailable", message: String(e) } satisfies ContractError;
  }
}

async function openFolder(id: string): Promise<unknown> {
  if (visitor) {
    const info = await request("open_server_folder", { id });
    openedOnce = true;
    return info;
  }
  // A folder kept on this device opens at once when the connection is down,
  // and is not waited for when it is not up yet (ADR 0092 item 2).
  if (offline.keeps(id) && (await verdict()) === "down") {
    routedOffline = true;
    folderId = id;
    remember(id);
    openedOnce = true;
    const kept = offline.keptFolder(id);
    if (kept) setRole(kept.role);
    offline.mark(true);
    notice(o().nowOffline);
    return offline.answer(id, "current_folder", {});
  }
  const info = await request("open_server_folder", { id });
  openedOnce = true;
  folderId = id;
  remember(id);
  offline.folderOpened(id, info as FolderInfo | null, role);
  return info;
}

/** What Tauri's notification plugin asks of the desktop's host, answered
 *  by the browser's Notification API (ADR 0084 item 9): the window asks
 *  the same calls on either side (ADR 0026 rule 2). */
async function notificationCall(cmd: string, a: Record<string, unknown>): Promise<unknown> {
  const api = typeof window.Notification === "undefined" ? null : window.Notification;
  switch (cmd) {
    case "plugin:notification|is_permission_granted":
      // None while the browser has not asked: as the host's "prompt".
      return !api || api.permission === "denied" ? false : api.permission === "granted" ? true : null;
    case "plugin:notification|request_permission": {
      if (!api) return "denied";
      const answer = await api.requestPermission();
      return answer === "default" ? "prompt" : answer;
    }
    case "plugin:notification|notify": {
      const o = (a.options ?? {}) as { title?: string; body?: string };
      if (api && api.permission === "granted") new api(String(o.title ?? ""), { body: o.body });
      return null;
    }
    default:
      return null;
  }
}

/** Install the bridge: the window's label (`main`, or `note-…` for a note
 *  opened in a tab of its own, `window-…` for a new window that starts on
 *  the start page), and how the person chooses a folder. */
export function startBridge(choose: () => Promise<string | null>): void {
  chooser = choose;
  const label = params.get("note") ? "note-1" : params.get("window") ? "window-1" : "main";
  mockWindows(label);
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      // The system's notifications (ADR 0084 item 9): what Tauri's plugin
      // asks of the desktop's host, the browser's API answers.
      if (cmd.startsWith("plugin:notification|")) return notificationCall(cmd, a);
      // The window's own Tauri calls (its title, its close handler) mean
      // nothing in a tab.
      if (cmd.startsWith("plugin:")) return null;
      const mine = await local(cmd, a);
      if (mine.answered) return mine.value;
      // The connection is down and the folder shown is kept on this device:
      // its copy answers (ADR 0092 item 4).
      if (onThisDevice()) return offline.answer(folderId!, cmd, a);
      return request(cmd, a);
    },
    { shouldMockEvents: true },
  );
  const internals = (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string, protocol?: string) => string } }).__TAURI_INTERNALS__;
  internals.convertFileSrc = (path: string) =>
    visitor ? `/r/${encodeURIComponent(visitor)}/f/${encodePath(path)}` : `/f/${encodeURIComponent(folderId ?? "-")}/${encodePath(path)}`;
  // What asked to hear the window's events before now hears them.
  bridgeReady();
  connect();
}

/** Start the window of a read link (ADR 0105): the same bridge, to the
 *  link's own socket. `ended` is called once if the link ends. */
export function startVisitorBridge(token: string, ended: () => void): void {
  visitor = token;
  onLinkEnded = ended;
  folderId = "link";
  startBridge(async () => null);
}

/** A command of the contract, for the pages around the window. */
export function command(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return request(cmd, args);
}

export { refused };
