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
import type { ContractError } from "../bindings";
import { pageContract } from "./api";
import { notice } from "./notice";
import { w } from "./strings";

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

const params = new URLSearchParams(location.search);
let socket: WebSocket | null = null;
let open = false;
let nextId = 1;
const pending = new Map<number, Pending>();
/** Requests made while the connection was down, sent once it is back. */
const waiting: string[] = [];
/** The folder this tab shows: its id on the server, and the role. */
let folderId: string | null = params.get("folder");
let role: string | null = null;
let openedOnce = false;
let retry = 0;
let chooser: (() => Promise<string | null>) | null = null;

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
  const url = new URL(location.href);
  if (id) url.searchParams.set("folder", id);
  else url.searchParams.delete("folder");
  history.replaceState(history.state, "", url);
}

/** While the folder is opened again after a reconnection, what the
 *  window asks waits behind it. */
let reopening = false;

function send(text: string): void {
  if (socket && open && !reopening) socket.send(text);
  else waiting.push(text);
}

function request(cmd: string, args: unknown): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send(JSON.stringify({ id, cmd, args: args ?? {} }));
  });
}

function setRole(next: string | null): void {
  role = next;
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
  if (m.gone === "session") {
    notice(w().signedOut, "error");
    location.href = `/signin?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  if (m.gone === "folder") {
    notice(w().folderGone, "error");
    folderId = null;
    remember(null);
    // No folder, no role in it.
    setRole(null);
    location.reload();
  }
}

function connect(): void {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${scheme}://${location.host}/api/ws`);
  socket = ws;
  ws.addEventListener("open", () => {
    open = true;
    const back = retry > 0;
    retry = 0;
    if (back && folderId && openedOnce) {
      // The folder again first: a new connection shows no folder, and a
      // save queued while offline would be answered "no folder" if it went
      // before. Then what waited, and the window told the folder may have
      // changed while it was away: it checks its open notes.
      reopening = true;
      const id = nextId++;
      const reopened = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      ws.send(JSON.stringify({ id, cmd: "open_server_folder", args: { id: folderId } }));
      // The folder's key, from the answer: the window hears a change of
      // its own folder only (changes.ts).
      let key = "";
      void reopened
        .then((info) => {
          key = (info as { key?: string } | null)?.key ?? "";
        })
        .catch(() => undefined)
        .then(() => {
          reopening = false;
          // Dropped again meanwhile: what waits goes with the next one.
          if (socket !== ws || !open) return Promise.reject(new Error("dropped"));
          for (const text of waiting.splice(0)) ws.send(text);
          // The notes being edited together join their rooms again and
          // send what was typed meanwhile (collab.ts).
          dispatchEvent(new Event("verso:reconnected"));
          return request("reindex", {});
        })
        .then((index) => emit("folder-changed", { key, changed: [], removed: [], listing: true, index }))
        .then(() => notice(w().reconnected))
        .catch(() => undefined);
      return;
    }
    for (const text of waiting.splice(0)) ws.send(text);
  });
  ws.addEventListener("message", (e) => onMessage(String(e.data)));
  ws.addEventListener("close", () => {
    open = false;
    reopening = false;
    // What was asked and not answered may or may not have happened: it is
    // refused as unavailable, never sent again (a write twice is worse).
    for (const [id, p] of pending) {
      pending.delete(id);
      p.reject({ kind: "unavailable", message: w().offline } satisfies ContractError);
    }
    retry++;
    if (retry === 1) notice(w().offline, "error");
    setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
  });
}

/** Commands only the browser answers; the rest go to the server. */
async function local(cmd: string, a: Record<string, unknown>): Promise<{ answered: true; value: unknown } | { answered: false }> {
  const done = (value: unknown) => ({ answered: true as const, value });
  switch (cmd) {
    case "pick_folder": {
      const id = chooser ? await chooser() : null;
      if (!id) return done(null);
      return done(await openFolder(id));
    }
    case "open_initial": {
      if (!folderId || openedOnce) return done(null);
      return done(await openFolder(folderId).catch(() => {
        // A folder of the address one may no longer enter: the start page,
        // with no role.
        folderId = null;
        remember(null);
        setRole(null);
        return null;
      }));
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
    case "reopen_folder": {
      const value = await request(cmd, a);
      openedOnce = true;
      return done(value);
    }
    default:
      return { answered: false };
  }
}

async function openFolder(id: string): Promise<unknown> {
  const info = await request("open_server_folder", { id });
  openedOnce = true;
  folderId = id;
  remember(id);
  return info;
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
      // The window's own Tauri calls (its title, its close handler) mean
      // nothing in a tab.
      if (cmd.startsWith("plugin:")) return null;
      const mine = await local(cmd, a);
      if (mine.answered) return mine.value;
      return request(cmd, a);
    },
    { shouldMockEvents: true },
  );
  const internals = (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string, protocol?: string) => string } }).__TAURI_INTERNALS__;
  internals.convertFileSrc = (path: string) => `/f/${encodeURIComponent(folderId ?? "-")}/${encodePath(path)}`;
  connect();
}

/** A command of the contract, for the pages around the window. */
export function command(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return request(cmd, args);
}

export { refused };
