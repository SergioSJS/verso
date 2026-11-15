// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The connection a kept folder syncs over (ADR 0092 item 1): a WebSocket of
// its own, opened on the folder, beside the window's — over the session the
// browser already has, the contract's own `/api/ws` (nothing new on the
// server), so that a pass of sync neither stands in the way of what the
// window asks nor is held up by it. It hears the server's push that the
// folder's log moved (`sync-changed`), a session or a folder the server took
// away, and the role.
//
// A browser cannot set a header on a WebSocket, so this connection says no
// sync version, and the server speaks to it as it does to any window: pieces
// as base64 in the JSON (ADR 0079 item 5).

import type { Wire, WireError } from "./sync";
import { askSession, type SessionAnswer } from "../sessionAsk";

export type LinkEvents = {
  /** The folder is open on the connection, and the role in it. */
  open(role: string): void;
  /** The person's role in the folder changed. */
  role?(role: string): void;
  /** The folder's log moved on the server. */
  push(): void;
  /** The connection is gone (it tries again). */
  down(): void;
  /** The server took the session (`session`) or the folder (`folder`) away. */
  gone(what: "session" | "folder", reason: string | null): void;
  /** The server speaks another contract than this page: sync waits for the
   *  page that matches (the window reloads itself once). */
  mismatch(): void;
};

const transport = (message: string): WireError => ({ kind: "unavailable", message, transport: true });

/** How long a command waits for its answer before the connection is taken
 *  for gone: a piece of a file is a megabyte. */
const ANSWER_WITHIN = 90_000;

export class SyncLink {
  private ws: WebSocket | null = null;
  private opened = false;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: number }>();
  private retry = 0;
  private timer = 0;
  private stopped = true;
  private role = "";
  private onLine = (): void => {
    if (!this.stopped && !this.ws) this.connect(0);
  };

  constructor(
    private folder: string,
    private events: LinkEvents,
    private contract: () => string,
    /** Whether the session is still there (`/api/state`), asked after a
     *  connection that closed before it opened. */
    private ask: () => Promise<SessionAnswer> = () => askSession(),
  ) {}

  get up(): boolean {
    return this.opened;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    addEventListener("online", this.onLine);
    this.connect(0);
  }

  stop(): void {
    this.stopped = true;
    removeEventListener("online", this.onLine);
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.opened = false;
    this.failAll();
  }

  /** Try the connection now (the page came back to the front, the network
   *  returned), without waiting out the backoff. */
  nudge(): void {
    if (this.stopped || this.ws) return;
    clearTimeout(this.timer);
    this.connect(0);
  }

  readonly wire: Wire = (cmd, args) =>
    new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || !this.opened) {
        reject(transport("not connected"));
        return;
      }
      const id = this.nextId++;
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(transport("the server did not answer"));
        // A connection that does not answer is not one to go on with.
        ws.close();
      }, ANSWER_WITHIN);
      this.pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ id, cmd, args }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(transport(String(e)));
      }
    });

  private failAll(): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(transport("the connection closed"));
    }
  }

  private connect(delay: number): void {
    clearTimeout(this.timer);
    if (this.stopped) return;
    const go = (): void => {
      if (this.stopped || this.ws) return;
      // No network at all: wait for the browser to say it is back.
      if (navigator.onLine === false) return;
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${scheme}://${location.host}/api/ws`);
      } catch {
        this.down();
        return;
      }
      this.ws = ws;
      let opened = false;
      ws.addEventListener("message", (e) => this.onMessage(ws, String(e.data)));
      ws.addEventListener("close", () => {
        if (this.ws !== ws) return;
        this.ws = null;
        const was = this.opened;
        this.opened = false;
        this.failAll();
        if (!this.stopped) {
          if (was || this.retry === 0) this.events.down();
          this.down();
          // Closed before the folder opened: a session the server ended
          // while the connection was down refuses the upgrade (401), which
          // a browser sees only as this close. Asked at each such try; the
          // same path as the server's `{"gone":"session"}` (ADR 0092 item 6).
          if (!opened) void this.ask().then((said) => this.sessionAsked(said));
        }
      });
      ws.addEventListener("open", () => (opened = true));
    };
    if (delay > 0) this.timer = window.setTimeout(go, delay);
    else go();
  }

  /** The answer about the session, after a connection closed before it
   *  opened: heard while the link still runs and no newer connection is
   *  trying (that one asks again if it closes the same way). */
  private sessionAsked(said: SessionAnswer): void {
    if (said !== "ended" || this.stopped || this.ws !== null) return;
    this.stopped = true;
    removeEventListener("online", this.onLine);
    clearTimeout(this.timer);
    this.events.gone("session", null);
  }

  private down(): void {
    this.retry++;
    this.connect(Math.min(60_000, 1000 * 2 ** Math.min(this.retry, 6)));
  }

  private onMessage(ws: WebSocket, data: string): void {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof m.id === "number") {
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      if ("err" in m) p.reject(m.err);
      else p.resolve(m.ok);
      return;
    }
    if (m.event === "sync-changed") {
      this.events.push();
      return;
    }
    if (m.hello) {
      const hello = m.hello as { contract?: string };
      const ours = this.contract();
      if (ours && hello.contract && hello.contract !== ours) {
        this.stopped = true;
        ws.close();
        this.events.mismatch();
        return;
      }
      // The folder, on this connection: every sync command is of it.
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: () => {
          this.opened = true;
          this.retry = 0;
          this.events.open(this.role);
        },
        reject: (e) => {
          // The folder is not there for this account (any more).
          const kind = (e as { kind?: string } | null)?.kind;
          if (kind === "not_found" || kind === "refused") this.events.gone("folder", null);
          ws.close();
        },
        timer: window.setTimeout(() => ws.close(), ANSWER_WITHIN),
      });
      ws.send(JSON.stringify({ id, cmd: "open_server_folder", args: { id: this.folder } }));
      return;
    }
    if (m.folder) {
      this.role = String((m.folder as { role?: string }).role ?? "");
      this.events.role?.(this.role);
      return;
    }
    if (typeof m.role === "string") {
      this.role = m.role;
      this.events.role?.(this.role);
      return;
    }
    if (m.gone === "session") {
      this.stopped = true;
      this.events.gone("session", null);
      ws.close();
    } else if (m.gone === "folder") {
      this.events.gone("folder", typeof m.reason === "string" ? m.reason : null);
    }
  }
}
