// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Listening to a table's live share, in this window (ADR 0116 items 16, 19,
// 22, 25): the server sends a window the share's frames only once it asks
// (`table_share_listen`), and it asks when a share starts — or at the join,
// when one is live (a late joiner gets the last two seconds, then the live
// frames) — and again when it was told it fell behind. It stops asking when
// the person turns *Follow the table* off (or the table's sound), and asks
// again when it is turned on. The window that shares never listens: the game
// master hears the source itself (item 16).
//
// The sound itself (the lazy chunk, `listener.ts`) is opened only while a
// share is live and heard; until the audio context runs — every engine waits
// for a gesture — the window says it is waiting (*Hear the table*, item 25),
// and the frames that come meanwhile are held a moment. No DOM, no audio
// node: the commands, the events, the audio's gate and the player are given,
// so the unit tests drive the same code (shareListen.test.mjs).

import type { AudioShare, AudioShareBehind, AudioShareStopped, ContractError } from "../../bindings";

type R<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

export type ShareApi = {
  listen(on: boolean, table: string): Promise<R<null>>;
  events<T>(event: string, fn: (payload: T) => void): Promise<() => void>;
};

/** Whether sound may start now (the audio context runs), and a call when it may. */
export type Gate = { ready(): boolean; onReady(fn: () => void): void };

/** What plays a share (`ShareListener`). */
export type Hearer = { readonly share: number; frame(bytes: Uint8Array): void; setGain(gain: number): void; restart(): void; close(): void; stats?(): unknown };

export type ShareDeps = {
  api: ShareApi;
  table: string;
  /** The share the join said is live (`TableJoin.share`). */
  share: AudioShare | null;
  gate: Gate;
  open(share: number, gain: number): Promise<Hearer>;
  /** The person's gain for a share: own volume, mute, Follow (sync.ts `gain`). */
  gain(): number;
  /** Whether this window hears the table at all: the table's sound on, Follow the table on. */
  follows(): boolean;
  /** The share this window started, if any: never heard here. */
  own(): number | null;
  /** Something the window shows changed (waiting, the share). */
  changed(): void;
  /** One line in the app's log, for a refusal. */
  log?(line: string): void;
  /** The share cannot be heard in this page at all (no audio path), or can again (`false`). */
  deaf?(on: boolean): void;
};

/** Frames held while the player loads: three seconds. */
export const HELD_MOST = 150;

export class TableShare {
  private share: AudioShare | null;
  /** The share whose opening failed: not tried again (nor logged again) until another share. */
  private failedFor: number | null = null;
  /** Whether the server was asked to send this window the share (and not told otherwise). */
  private listening = false;
  /** The share whose listening the server refused: not asked again until it starts again or says behind. */
  private refused: number | null = null;
  private hearer: Hearer | null = null;
  private opening: Promise<void> | null = null;
  private held: Uint8Array[] = [];
  private waitingGate = false;
  private gateAsked = false;
  private offs: (() => void)[] = [];
  private closed = false;

  constructor(private readonly deps: ShareDeps) {
    this.share = deps.share;
  }

  /** The share live at the table, as this window knows it. */
  get live(): AudioShare | null {
    return this.share;
  }

  /** Waiting for a gesture to start the sound. */
  get waiting(): boolean {
    return this.waitingGate;
  }

  /** Whether the server sends this window the frames. */
  get heard(): boolean {
    return this.listening;
  }

  /** What the player says of itself (the tests, the log): null while nothing plays. */
  hearing(): unknown {
    return this.hearer?.stats?.() ?? null;
  }

  async start(): Promise<void> {
    const { api, table } = this.deps;
    const mine = (t: string | undefined): boolean => t === undefined || t === table;
    const subs = [
      api.events<AudioShare>("table-share-started", (s) => {
        if (!mine(s.table)) return;
        const other = this.share?.id !== s.id;
        this.share = s;
        this.refused = null;
        if (other) this.drop();
        // Asked at every start: the server's want may have gone with a reconnection.
        if (this.wants()) void this.ask(true);
        this.evaluate();
        this.deps.changed();
      }),
      api.events<AudioShare>("table-share-state", (s) => {
        if (!mine(s.table) || s.id !== this.share?.id) return;
        this.share = s;
        this.deps.changed();
      }),
      api.events<AudioShareStopped>("table-share-stopped", (s) => {
        if (!mine(s.table) || s.id !== this.share?.id) return;
        this.share = null;
        this.drop();
        this.evaluate();
        this.deps.changed();
      }),
      api.events<AudioShareBehind>("table-share-behind", (s) => {
        if (!mine(s.table) || s.id !== this.share?.id) return;
        // Paused by the server until asked again; what is held is stale.
        this.hearer?.restart();
        this.held = [];
        this.refused = null;
        if (this.wants()) void this.ask(true);
      }),
    ];
    for (const s of subs) this.offs.push(await s.catch(() => () => {}));
    if (this.closed) {
      this.close();
      return;
    }
    this.evaluate();
  }

  /** A binary audio frame from the window's connection. */
  frame(bytes: Uint8Array): void {
    if (this.closed || !this.listening || !this.share) return;
    if (this.hearer) this.hearer.frame(bytes);
    else if (this.opening || this.waitingGate) {
      this.held.push(bytes);
      if (this.held.length > HELD_MOST) this.held.shift();
    }
  }

  /** Bring the asking and the sound in line with what the window wants now (Follow, the volume). */
  evaluate(): void {
    if (this.closed) return;
    const wants = this.wants();
    if (this.share && wants && !this.listening && this.refused !== this.share.id) void this.ask(true);
    if (!wants && this.listening) void this.ask(false);
    const play = !!this.share && wants && this.listening;
    if (this.failedFor !== null && this.share?.id !== this.failedFor) {
      this.failedFor = null;
      this.deps.deaf?.(false);
    }
    if (!play) {
      this.drop();
      this.setWaiting(false);
      return;
    }
    if (this.hearer) {
      this.hearer.setGain(this.deps.gain());
      return;
    }
    if (this.opening) return;
    if (this.failedFor === this.share?.id) return;
    if (!this.deps.gate.ready()) {
      this.setWaiting(true);
      if (!this.gateAsked) {
        this.gateAsked = true;
        this.deps.gate.onReady(() => {
          this.gateAsked = false;
          this.evaluate();
        });
      }
      return;
    }
    this.setWaiting(false);
    const id = this.share!.id;
    this.opening = this.deps
      .open(id, this.deps.gain())
      .then((h) => {
        this.opening = null;
        if (this.closed || this.share?.id !== id || !this.listening) {
          h.close();
          return;
        }
        this.hearer = h;
        for (const f of this.held.splice(0)) h.frame(f);
        h.setGain(this.deps.gain());
      })
      .catch((e: unknown) => {
        this.opening = null;
        this.held = [];
        this.failedFor = id;
        if (e instanceof Error && e.name === "NoAudioPath") this.deps.deaf?.(true);
        this.deps.log?.(`the share could not be heard here: ${e instanceof Error ? e.message : String(e)}`);
      });
  }

  close(): void {
    this.closed = true;
    for (const off of this.offs.splice(0)) off();
    this.drop();
    this.setWaiting(false);
  }

  private wants(): boolean {
    return this.deps.follows() && (this.share === null || this.share.id !== this.deps.own());
  }

  private async ask(on: boolean): Promise<void> {
    this.listening = on;
    const r = await this.deps.api.listen(on, this.deps.table).catch((e: unknown): R<null> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
    if (r.status === "ok") return;
    // Refused (the sharer, a table left): not listening, said in the log only.
    if (on) {
      this.listening = false;
      this.refused = this.share?.id ?? null;
    }
    this.deps.log?.(`table_share_listen ${on}: ${r.error.message}`);
    this.evaluate();
  }

  private drop(): void {
    this.hearer?.close();
    this.hearer = null;
    this.held = [];
  }

  private setWaiting(on: boolean): void {
    if (this.waitingGate === on) return;
    this.waitingGate = on;
    this.deps.changed();
  }
}
