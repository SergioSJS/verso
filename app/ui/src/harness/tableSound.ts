// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's music of ADR 0116, played in the page: the commands of
// `crates/verso-server/src/table_sound.rs` with its rules — only the game
// master (the owner) controls; the state is stamped by "the server's" clock
// and its revision grows; an older revision is refused; a player who does
// not see the file is told a track plays and nothing of it; with `ask`, a
// file some players do not see is not played and they are named. A test
// says which files the window's person does not see (`hidden`), who does
// not see a file (`unheardOf`), and plays the game master from a player's
// window (`masterPlays`, `masterChanges`).

import { emit } from "@tauri-apps/api/event";
import type { ContractError, TablePlayback } from "../bindings";
import type { Core } from "./core";
import type { Table } from "./table";

function refuse(message: string): never {
  const e: ContractError = { kind: "refused", message };
  throw e;
}

const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

type Channel = { revision: number; path: string; state: "playing" | "paused" | "stopped"; position: number; anchor: number; master: number; looping: boolean; duration: number | null; by: string; byId: string; cannot: string[] };

export class TableSound {
  /** The files the window's person does not see (a player's). */
  hidden = new Set<string>();
  /** The players who do not see a file, as the game master is told. */
  unheardOf: (path: string) => string[] = () => [];
  /** The server's clock ahead of the page's, ms. */
  skew = 0;
  /** How many times the clock was asked. */
  asked = 0;
  private channels = new Map<string, Channel>();

  constructor(
    core: Core,
    private readonly table: Table,
  ) {
    const h = core.handlers;
    const join = h["table_join"]!;
    h["table_join"] = (a) => {
      const joined = join(a) as Record<string, unknown>;
      const root = String(joined["table"] ?? "");
      const c = this.channels.get(root);
      return { ...joined, play: this.table.role === "owner", playback: c ? [this.view(root, c)] : [] };
    };
    h["table_time"] = (a) => {
      this.table.at(a["table"]);
      this.asked++;
      return { now_ms: Date.now() + this.skew };
    };
    h["table_play"] = (a) => {
      const root = this.table.at(a["table"]);
      this.channel(a["channel"]);
      if (this.table.role !== "owner") refuse("only the game master plays music at the table");
      const path = String(a["path"] ?? "");
      if (!AUDIO.test(path) || path.startsWith("/") || path.includes("://") || path.split("/").includes("..")) refuse("a sound file inside the folder");
      const unheard = this.unheardOf(path);
      if (a["ask"] === true && unheard.length > 0) return { playback: null, unheard };
      const before = this.channels.get(root);
      const duration = typeof a["durationMs"] === "number" && a["durationMs"] > 0 ? a["durationMs"] : null;
      const c: Channel = { revision: (before?.revision ?? 0) + 1, path, state: "playing", position: Math.max(0, Number(a["positionMs"] ?? 0)), anchor: Date.now() + this.skew, master: before?.master ?? 100, looping: a["looping"] === true, duration, by: this.table.name, byId: this.table.account, cannot: [] };
      this.channels.set(root, c);
      return { playback: this.tell(root, c), unheard };
    };
    h["table_sound"] = (a) => {
      const root = this.table.at(a["table"]);
      this.channel(a["channel"]);
      if (this.table.role !== "owner") refuse("only the game master plays music at the table");
      const c = this.channels.get(root);
      if (!c) refuse("nothing plays at the table");
      if (Number(a["revision"]) !== c.revision) refuse("the music changed meanwhile");
      this.apply(c, String(a["wish"]), a["value"] as number | null, a["looping"] === true);
      c.by = this.table.name;
      c.byId = this.table.account;
      return this.tell(root, c);
    };
    h["table_cannot_play"] = (a) => {
      const root = this.table.at(a["table"]);
      this.channel(a["channel"]);
      const c = this.channels.get(root);
      if (!c || Number(a["revision"]) !== c.revision || this.hidden.has(c.path)) return null;
      if (!c.cannot.includes(this.table.name)) c.cannot.push(this.table.name);
      this.tell(root, c);
      return null;
    };
  }

  private channel(asked: unknown): void {
    if (asked !== undefined && asked !== null && asked !== "music") refuse("no such channel");
  }

  private at(c: Channel, now: number): number {
    const p = c.state === "playing" ? c.position + Math.max(0, now - c.anchor) : c.state === "paused" ? c.position : 0;
    return c.duration ? (c.looping ? p % c.duration : Math.min(p, c.duration)) : p;
  }

  private apply(c: Channel, wish: string, value: number | null, looping: boolean): void {
    const now = Date.now() + this.skew;
    const pos = this.at(c, now);
    c.position = pos;
    if (wish === "pause") c.state = "paused";
    else if (wish === "resume") {
      if (c.state === "stopped") c.position = 0;
      c.state = "playing";
    } else if (wish === "seek") {
      c.position = Math.max(0, Number(value ?? 0));
      if (c.state === "stopped") c.state = "paused";
    } else if (wish === "stop") {
      c.state = "stopped";
      c.position = 0;
    } else if (wish === "master") c.master = Math.max(0, Math.min(100, Math.round(Number(value ?? 100))));
    else if (wish === "loop") c.looping = looping;
    else if (wish === "duration") c.duration = value && value > 0 ? value : null;
    else refuse("no such change");
    c.anchor = now;
    c.revision++;
  }

  /** The channel as the window's person may know it. */
  private view(root: string, c: Channel): TablePlayback {
    const master = this.table.role === "owner";
    const unseen = !master && this.hidden.has(c.path);
    return {
      table: root,
      channel: "music",
      revision: c.revision,
      source: unseen ? null : { kind: "file", path: c.path },
      unseen,
      state: c.state,
      position_ms: c.position,
      anchor_ms: c.anchor,
      master: c.master,
      looping: c.looping,
      duration_ms: c.duration,
      by: c.by,
      by_id: c.byId,
      unheard: master ? this.unheardOf(c.path) : [],
      cannot: master ? [...c.cannot] : [],
    };
  }

  private tell(root: string, c: Channel): TablePlayback {
    const v = this.view(root, c);
    void emit("table-playback", v);
    return v;
  }

  /* ---------- the game master, played by a test in a player's window ---------- */

  /** The game master plays `path` (`table`: the folder's default). */
  masterPlays(path: string, opts: { positionMs?: number; looping?: boolean; durationMs?: number | null; table?: string; by?: string } = {}): TablePlayback {
    const root = opts.table ?? this.table.defaultRoot();
    const before = this.channels.get(root);
    const c: Channel = { revision: (before?.revision ?? 0) + 1, path, state: "playing", position: opts.positionMs ?? 0, anchor: Date.now() + this.skew, master: before?.master ?? 100, looping: opts.looping ?? false, duration: opts.durationMs ?? null, by: opts.by ?? "Mestre", byId: "acc-mestre", cannot: [] };
    this.channels.set(root, c);
    return this.tell(root, c);
  }

  /** The game master pauses, resumes, seeks, stops, sets the volume or the loop. */
  masterChanges(wish: string, value: number | null = null, looping = false, table = this.table.defaultRoot()): TablePlayback {
    const c = this.channels.get(table);
    if (!c) throw new Error("nothing plays");
    this.apply(c, wish, value, looping);
    return this.tell(table, c);
  }

  /** What plays at the table now, as the window's person may know it. */
  now(table = this.table.defaultRoot()): TablePlayback | null {
    const c = this.channels.get(table);
    return c ? this.view(table, c) : null;
  }

  /** What the person sees changed (`hidden`, `unheardOf`): the window is told again. */
  retell(table = this.table.defaultRoot()): void {
    const c = this.channels.get(table);
    if (c) this.tell(table, c);
  }

  /** The table emptied: its music is gone. */
  clear(): void {
    this.channels.clear();
  }
}
