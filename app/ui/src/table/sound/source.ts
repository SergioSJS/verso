// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where the table's music state comes from (ADR 0116 items 4, 8, 10): the
// server's table, joined with the Mesa panel's (`table-playback`, the
// server's clock sampled as NTP does); or, alone in a folder of this
// computer, the window itself, with nothing sent. The strip and the player
// read one `SoundSource` and never ask which side of the wire it is on.

import type { ContractError, TablePlayback, TablePlayed, TableTime } from "../../bindings";
import { Clock } from "./sync";

type R<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

/** One channel, read from the contract: numbers as numbers, a path or none. */
export type Music = {
  revision: number;
  /** The file, relative to the folder the window opened; none when nothing plays or the person does not see it. */
  path: string | null;
  /** A track plays that this person does not see: they hear nothing. */
  unseen: boolean;
  state: "playing" | "paused" | "stopped";
  positionMs: number;
  anchorMs: number;
  master: number;
  looping: boolean;
  durationMs: number | null;
  by: string;
  byId: string;
  /** The game master's only: who does not see the file, who cannot play it. */
  unheard: string[];
  cannot: string[];
};

const num = (v: number | null | undefined, or = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : or);

/** The contract's playback as the window plays it. */
export function readPlayback(w: TablePlayback): Music {
  const state = w.state === "playing" || w.state === "paused" ? w.state : "stopped";
  const d = w.duration_ms;
  return {
    revision: num(w.revision),
    path: !w.unseen && w.source?.kind === "file" ? w.source.path : null,
    unseen: !!w.unseen,
    state,
    positionMs: num(w.position_ms),
    anchorMs: num(w.anchor_ms),
    master: num(w.master, 100),
    looping: !!w.looping,
    durationMs: typeof d === "number" && Number.isFinite(d) && d > 0 ? d : null,
    by: w.by ?? "",
    byId: w.by_id ?? "",
    unheard: w.unheard ?? [],
    cannot: w.cannot ?? [],
  };
}

export type Wish = "pause" | "resume" | "seek" | "stop" | "master" | "loop" | "duration";
export type PlayOptions = { positionMs?: number; looping?: boolean; durationMs?: number | null; ask?: boolean };
/** What a play answered: refused (`error`), or held because players do not see the file (`unheard`). */
export type Played = { error?: string; unheard?: string[] };

export interface SoundSource {
  /** The server's: everyone at the table hears it. False: this window alone. */
  readonly shared: boolean;
  /** Whether this person controls it (the game master; anyone alone). */
  controls(): boolean;
  /** The music channel now; none when nothing was played. */
  music(): Music | null;
  /** The server's clock now, ms (this window's own when alone). */
  serverNow(): number;
  play(path: string, opts?: PlayOptions): Promise<Played>;
  /** A control on the current state; the refusal's words, or null. */
  change(wish: Wish, value?: number | null, looping?: boolean): Promise<string | null>;
  /** This window cannot play the track at `revision`. */
  cannotPlay(revision: number): void;
  onChange(fn: () => void): () => void;
  close(): void;
}

function subscribers(): { add(fn: () => void): () => void; tell(): void } {
  const subs = new Set<() => void>();
  return {
    add(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    tell() {
      for (const fn of [...subs]) fn();
    },
  };
}

/** The window alone (decided, item 4): the state is its own, nothing is sent. */
export function localSound(now: () => number = Date.now): SoundSource {
  let m: Music | null = null;
  const subs = subscribers();
  const at = (x: Music): number => {
    const p = x.state === "playing" ? x.positionMs + Math.max(0, now() - x.anchorMs) : x.state === "paused" ? x.positionMs : 0;
    const d = x.durationMs;
    return d !== null ? (x.looping ? p % d : Math.min(p, d)) : p;
  };
  return {
    shared: false,
    controls: () => true,
    music: () => m,
    serverNow: () => now(),
    play(path, opts = {}) {
      m = {
        revision: (m?.revision ?? 0) + 1,
        path,
        unseen: false,
        state: "playing",
        positionMs: Math.max(0, opts.positionMs ?? 0),
        anchorMs: now(),
        master: m?.master ?? 100,
        looping: opts.looping ?? false,
        durationMs: opts.durationMs && opts.durationMs > 0 ? opts.durationMs : null,
        by: "",
        byId: "",
        unheard: [],
        cannot: [],
      };
      subs.tell();
      return Promise.resolve({});
    },
    change(wish, value = null, looping) {
      if (!m) return Promise.resolve(null);
      const pos = at(m);
      const next: Music = { ...m, revision: m.revision + 1, anchorMs: now(), positionMs: pos };
      if (wish === "pause") next.state = "paused";
      else if (wish === "resume") {
        next.positionMs = m.state === "stopped" ? 0 : pos;
        next.state = "playing";
      } else if (wish === "seek") {
        next.positionMs = Math.max(0, value ?? 0);
        if (m.state === "stopped") next.state = "paused";
      } else if (wish === "stop") {
        next.state = "stopped";
        next.positionMs = 0;
      } else if (wish === "master") next.master = Math.max(0, Math.min(100, Math.round(value ?? 100)));
      else if (wish === "loop") next.looping = !!looping;
      else if (wish === "duration") next.durationMs = value && value > 0 ? value : null;
      m = next;
      subs.tell();
      return Promise.resolve(null);
    },
    cannotPlay() {},
    onChange: subs.add,
    close() {},
  };
}

/** The table's commands and events the server's source needs. */
export type SoundApi = {
  play(path: string, opts: PlayOptions, table: string | null): Promise<R<TablePlayed>>;
  change(wish: Wish, revision: number, value: number | null, looping: boolean | null, table: string | null): Promise<R<TablePlayback | null>>;
  time(table: string | null): Promise<R<TableTime>>;
  cannot(revision: number, table: string | null): Promise<R<null>>;
  listen<T>(event: string, fn: (payload: T) => void): Promise<() => void>;
};

/** How many answers of the clock at the join; then one a minute (item 10). */
export const SAMPLES_AT_JOIN = 8;
export const SAMPLE_EVERY_MS = 60_000;

/** The server's table's music, from what its join answered. */
export async function serverSound(deps: {
  api: SoundApi;
  /** The table, as the join named it. */
  table: string;
  controls: boolean;
  playback: readonly TablePlayback[];
  explain(e: ContractError): string;
  now?: () => number;
}): Promise<SoundSource> {
  const { api, table } = deps;
  const now = deps.now ?? Date.now;
  const clock = new Clock();
  const subs = subscribers();
  let m: Music | null = null;
  let closed = false;
  const take = (w: TablePlayback | null | undefined): void => {
    if (!w || w.channel !== "music") return;
    const next = readPlayback(w);
    // An older state told late changes nothing.
    if (m && next.revision < m.revision) return;
    m = next;
    subs.tell();
  };
  for (const w of deps.playback) take(w);
  const off = await api
    .listen<TablePlayback>("table-playback", (w) => {
      if (!closed && (w.table === table || w.table === undefined)) take(w);
    })
    .catch(() => () => {});
  const sample = async (): Promise<void> => {
    const sent = now();
    const r = await api.time(table).catch((): null => null);
    const received = now();
    if (r && r.status === "ok") clock.add({ sent, received, server: num(r.data.now_ms, received) });
  };
  // The first answer at once, the rest of the join's samples after it.
  void (async () => {
    for (let i = 0; i < SAMPLES_AT_JOIN && !closed; i++) {
      await sample();
      if (i === 0) subs.tell();
    }
  })();
  const every = setInterval(() => void sample(), SAMPLE_EVERY_MS);
  const failed = (e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError });
  return {
    shared: true,
    controls: () => deps.controls,
    music: () => m,
    serverNow: () => clock.serverNow(now()),
    async play(path, opts = {}) {
      const r = await api.play(path, opts, table).catch(failed);
      if (r.status !== "ok") return { error: deps.explain(r.error) };
      if (!r.data.playback) return { unheard: r.data.unheard };
      take(r.data.playback);
      return {};
    },
    async change(wish, value = null, looping) {
      if (!m) return null;
      const r = await api.change(wish, m.revision, value, looping ?? null, table).catch(failed);
      if (r.status !== "ok") return deps.explain(r.error);
      take(r.data);
      return null;
    },
    cannotPlay(revision) {
      void api.cannot(revision, table).catch(() => undefined);
    },
    onChange: subs.add,
    close() {
      closed = true;
      clearInterval(every);
      off();
    },
  };
}
