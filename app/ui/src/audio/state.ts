// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Audio embeds with a player (ADR 0116, amendment of 2026-11-01): the pure
// rules. An embed of a sound file — `![[taverna.mp3]]`, `![](sons/a.mp3)` —
// is drawn as a player, as Obsidian draws it; the note's text is never
// touched. The player plays for this person only; the table's music is
// lowered while it plays, and the table's music starting pauses it, so the
// two never fight unseen. Pure: no DOM, tested in test/audioEmbed.test.mjs.

import { clockText } from "../table/sound/sync";

/** The extensions of a sound file: the table's own (`table/sound/scene.ts`). */
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

/** Whether an embed's target, or a picture's address, names a sound file of
 *  the folder: never an address with a scheme (the web, `data:`). */
export function audioTarget(raw: string): boolean {
  const t = raw.trim();
  if (t === "" || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("//")) return false;
  const bare = t.split("#")[0]!.split("|")[0]!.split("?")[0]!.trim();
  return AUDIO.test(bare);
}

/** What the player writes beside its bar: the position, and the length once known. */
export function timeText(atMs: number, lengthMs: number | null): string {
  const known = lengthMs !== null && Number.isFinite(lengthMs) && lengthMs > 0;
  return known ? `${clockText(atMs)} / ${clockText(lengthMs)}` : clockText(atMs);
}

/** The person's own volume for the embeds, kept on this device, never sent. */
export type Own = { volume: number; muted: boolean };

export function ownPrefs(raw: string | null): Own {
  try {
    const v = JSON.parse(raw ?? "{}") as Partial<Own> | null;
    const volume = typeof v?.volume === "number" && Number.isFinite(v.volume) ? Math.round(Math.max(0, Math.min(100, v.volume))) : 80;
    return { volume, muted: v?.muted === true };
  } catch {
    return { volume: 80, muted: false };
  }
}

export function ownGain(own: Own): number {
  return own.muted ? 0 : own.volume / 100;
}

/** How much of the table's music is heard while a local embed plays: lowered,
 *  never silenced — the table is still there, and the local one is chosen. */
export const DUCK = 0.25;

export function duckFactor(localPlaying: boolean, tableAudible: boolean): number {
  return localPlaying && tableAudible ? DUCK : 1;
}

/** The table's music as this person hears it: its path (null for a track
 *  they do not see), its state and revision. */
export type Heard = { path: string | null; state: string; revision: number };

/** Whether the table's music has just started for this person: played,
 *  resumed, or another track — what pauses a local embed. A seek or the
 *  table's volume is no start; a track they do not see is nothing heard. */
export function tableStarted(before: Heard | null, now: Heard | null): boolean {
  if (!now || now.state !== "playing" || !now.path) return false;
  if (!before || before.state !== "playing" || !before.path) return true;
  return before.path !== now.path;
}

/** A player as the sweep sees it: its file, whether it is shown (on the
 *  page and laid out: a note's reading view stays on the page, hidden, while
 *  the note is edited), whether its element plays, and whether it was never
 *  used (a player drawn again in the place of one, the note or the card
 *  drawn anew, the other mode of the note). */
export type Seen = { path: string; shown: boolean; playing: boolean; fresh: boolean };

/** The hand-overs a sweep makes, `[from, to]`: a playing element whose
 *  player is not shown goes to a fresh player of the same file that is,
 *  each player taken once. A playing player nobody replaced plays on (a
 *  tab in the background); one off the page stops (`orphanStops`). */
export function handovers(players: Seen[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const taken = new Set<number>();
  players.forEach((from, i) => {
    if (from.shown || !from.playing) return;
    const j = players.findIndex((to, k) => !taken.has(k) && k !== i && to.shown && to.fresh && !to.playing && to.path === from.path);
    if (j < 0) return;
    taken.add(j);
    out.push([i, j]);
  });
  return out;
}

/** Sweeps a playing element waits for a player in its place before it stops. */
export const GRACE_SWEEPS = 3;

export function orphanStops(missed: number): boolean {
  return missed >= GRACE_SWEEPS;
}

/** An embed's link to the table's music (ADR 0116, amendment of 2026-11-01):
 *  "Play for the table" arms it with the revision the music had then; once
 *  the table plays this embed's file past that revision the embed is bound
 *  and IS the table's player of the track (its controls drive the table, the
 *  table's state draws it), until the music is another file or stopped. */
export type Link = { armed: number | null; bound: boolean };

export const UNLINKED: Link = { armed: null, bound: false };

export function linkStep(link: Link, path: string, now: Heard | null): Link {
  const mine = !!now && now.path === path;
  if (link.bound) return mine && now.state !== "stopped" ? link : UNLINKED;
  if (link.armed !== null && mine && now.state === "playing" && now.revision > link.armed) return { armed: null, bound: true };
  return link;
}

/** Where "Play for the table" starts the track: the embed's own position, in whole ms. */
export function startAtMs(currentTimeSeconds: number): number {
  return Number.isFinite(currentTimeSeconds) && currentTimeSeconds > 0 ? Math.round(currentTimeSeconds * 1000) : 0;
}

/** What a bound embed's toggle asks of the table. */
export function toggleWish(state: string): "pause" | "resume" {
  return state === "playing" ? "pause" : "resume";
}
