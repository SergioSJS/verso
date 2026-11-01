// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's music in this window (ADR 0116 section A): which source is
// active (the server's table, or this window alone), the person's own
// volume, mute and "Follow the table" (kept on this device, never sent),
// the player (a lazy chunk, loaded when a track first plays, item 30), the
// game master's flow — the release question for a file some players do not
// see, the scene that next and previous walk, the next track when one ends
// — and the first gesture that lets a late joiner hear (item 25).

import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "../../bindings";
import { hasCapability } from "../../capabilities";
import { unlockAudio } from "../../dice3d/audio";
import { ui } from "../../dom";
import { tableOn } from "../record";
import { soundError } from "./words";
import { canPlay } from "./formats";
import type { Player } from "./player";
import { type Scene, nextIn, previousIn, trackName } from "./scene";
import { type Music, type SoundSource, type Wish, localSound } from "./source";
import { st } from "./strings";
import { ended, gain } from "./sync";

/** Whether the table's music exists in this window: its switch and the Table's. */
export function soundOn(): boolean {
  return tableOn() && hasCapability("tableSound");
}

const local = localSound();
let active: SoundSource = local;
let offActive: (() => void) | null = null;
const subs = new Set<() => void>();
function tell(): void {
  for (const fn of [...subs]) fn();
}
/** Told when anything the strip shows changes. */
export function onSound(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** The source the strip and the player read. */
export function sound(): SoundSource {
  return active;
}

/** The folder the window's own music was played in: another folder stops it. */
let localFolder: string | null = null;

/** The server's table joined (its music), or none: this window alone in `folder`. */
export function setSoundSource(next: SoundSource | null, folder: string | null = null): void {
  const to = next ?? local;
  if (!next && folder !== localFolder) {
    localFolder = folder;
    void local.change("stop");
  }
  if (to === active) {
    if (next) next.close();
    return;
  }
  if (active !== local) active.close();
  offActive?.();
  active = to;
  scene = null;
  offActive = active.onChange(changed);
  changed();
}

// The person's own: kept on this device, never sent (item 22).
type Own = { volume: number; muted: boolean; follow: boolean };
const KEY = "verso:table-sound";
function readOwn(): Own {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Own>;
    return { volume: typeof raw.volume === "number" ? Math.max(0, Math.min(100, raw.volume)) : 80, muted: raw.muted === true, follow: raw.follow !== false };
  } catch {
    return { volume: 80, muted: false, follow: true };
  }
}
let own: Own = readOwn();
export function ownSound(): Readonly<Own> {
  return own;
}
export function setOwn(change: Partial<Own>): void {
  own = { ...own, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(own));
  } catch {
    // Kept for this run only.
  }
  changed();
}

/** The scene the game master's play came from (a heading of a note): what next and previous walk. */
let scene: Scene | null = null;
/** Loop: off, the track (the table's `looping`), or the scene (the master's window wraps it). */
let sceneLoop = false;
export function loopMode(): "off" | "track" | "scene" {
  const m = active.music();
  if (m?.looping) return "track";
  return sceneLoop && scene ? "scene" : "off";
}
export function currentScene(): Scene | null {
  return scene;
}

// What the player says.
let blocked = false;
let failed = false;
let cannotHere = false;
let player: Player | null = null;
let loading: Promise<void> | null = null;
/** A live share waits for a gesture to be heard (share.ts): "Hear the table" too. */
let shareWaiting = false;
export function setShareWaiting(on: boolean): void {
  if (shareWaiting === on) return;
  shareWaiting = on;
  tell();
}
export function playerState(): { blocked: boolean; failed: boolean; cannotHere: boolean; shareWaiting: boolean } {
  return { blocked, failed, cannotHere, shareWaiting };
}

/** The file's address for this window: `/f/` on a server, `verso://` on the desktop. */
function urlOf(path: string): string {
  return convertFileSrc(path, "verso");
}

let lastRevision = -1;
let lastPath: string | null = null;
let told: string | null = null;
/** What was to be said before the Music tab was first drawn: said when it is. */
let pendingSay: string | null = null;
export function takePendingSay(): string | null {
  const s = pendingSay;
  pendingSay = null;
  return s;
}
function changed(): void {
  const m = active.music();
  if (m?.path !== lastPath) {
    lastPath = m?.path ?? null;
    failed = false;
    cannotHere = !!m?.path && !canPlay(m.path, (mime) => document.createElement("audio").canPlayType(mime));
    if (cannotHere && m) active.cannotPlay(m.revision);
  }
  if (m && m.revision !== lastRevision) lastRevision = m.revision;
  apply();
  say(m);
  tell();
}

/** The polite announcement of a change of track or state (item 26), not of seeks. */
function say(m: Music | null): void {
  const line = !m || m.state === "stopped" ? (m ? st.stopped : null) : m.state === "playing" ? st.playing(nameOf(m)) : st.paused(nameOf(m));
  if (line === told) return;
  told = line;
  const live = document.querySelector(".table-sound-said");
  if (live && line) live.textContent = line;
  else if (line) pendingSay = line;
}

export function nameOf(m: Music): string {
  return m.path ? trackName(m.path) : st.hidden;
}

/** Give the player what plays now; load it the first time something does (item 30). */
function apply(): void {
  const m = active.music();
  const playable = soundOn() && !!m && !!m.path && m.state !== "stopped" && !cannotHere;
  if (!player && !playable) return;
  const want = {
    music: soundOn() ? m : null,
    url: playable && m?.path ? urlOf(m.path) : null,
    gain: m ? gain(m.master, own.volume, own.muted, own.follow) : 0,
    serverNow: () => active.serverNow(),
  };
  if (player) {
    player.set(want);
    return;
  }
  loading ??= import("./player").then(({ Player }) => {
    player = new Player({
      blocked: () => {
        if (!blocked) {
          blocked = true;
          tell();
          // The control takes focus when it appears (item 26).
          requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>(".music-hear, .table-mini-hear")].find((b) => b.getClientRects().length > 0)?.focus());
        }
      },
      started: () => {
        if (blocked) {
          blocked = false;
          tell();
        }
      },
      failed: () => {
        failed = true;
        const now = active.music();
        if (now) active.cannotPlay(now.revision);
        tell();
      },
      length: (ms) => {
        const now = active.music();
        if (now && active.controls() && now.durationMs === null) void active.change("duration", ms);
      },
    });
    player.set({ ...want, music: active.music(), serverNow: () => active.serverNow() });
    apply();
  });
}

/** "Hear the table": inside the person's gesture. */
export function hearTable(): void {
  unlockAudio();
  player?.unlock();
}

/** What the game master's play asks first: the players who do not see the file. */
export type Unheard = (names: string[]) => Promise<"release" | "without" | "cancel">;

/** Play `path` for the table (or for this window alone), from `from`'s scene.
 *  Call it inside the gesture: the audio is unlocked before any await. */
export async function playTrack(path: string, from: Scene | null, unheard: Unheard): Promise<string | null> {
  unlockAudio();
  if (!active.controls()) return st.onlyMaster;
  scene = from;
  const opts = { looping: false, durationMs: null, ask: true };
  const first = await active.play(path, opts);
  if (first.error) return first.error;
  if (first.unheard && first.unheard.length > 0) {
    const answer = await unheard(first.unheard);
    if (answer === "cancel") return null;
    if (answer === "release") {
      const r = await commands.accessSet([path], { kind: "set", set: { whole: "see", rows: [] }, secret_name: null });
      if (r.status !== "ok") return st.releaseFailed(soundError(r.error));
      ui.status.textContent = st.released(trackName(path));
    }
    const again = await active.play(path, { ...opts, ask: false });
    if (again.error) return again.error;
  }
  player?.unlock();
  return null;
}

/** A control of the game master's (pause, seek, volume...): the refusal's words, or null. */
export async function control(wish: Wish, value: number | null = null, looping?: boolean): Promise<string | null> {
  unlockAudio();
  return active.change(wish, value, looping);
}

/** Loop: off, then the track, then the scene (when the play came from one), then off. */
export async function cycleLoop(): Promise<string | null> {
  const mode = loopMode();
  if (mode === "off") return control("loop", null, true);
  if (mode === "track") {
    sceneLoop = !!scene;
    const r = await control("loop", null, false);
    tell();
    return r;
  }
  sceneLoop = false;
  tell();
  return null;
}

/** The next or previous track of the scene; none: nothing. */
export function neighbour(dir: 1 | -1): string | null {
  const m = active.music();
  if (!m?.path) return null;
  return dir > 0 ? nextIn(scene, m.path, sceneLoop) : previousIn(scene, m.path, sceneLoop);
}
export async function step(dir: 1 | -1, unheard: Unheard): Promise<string | null> {
  const to = neighbour(dir);
  return to ? playTrack(to, scene, unheard) : null;
}

/** The game master's window plays the next track of the scene when one ends,
 *  or stops it (item 11): checked once a second. */
let advancedFor = -1;
let unheardAsk: Unheard = () => Promise.resolve("cancel");
export function askUnheardWith(fn: Unheard): void {
  unheardAsk = fn;
}
function watchEnd(): void {
  const m = active.music();
  if (!m || !active.controls() || !soundOn() || advancedFor === m.revision) return;
  if (!ended(m, active.serverNow())) return;
  advancedFor = m.revision;
  const to = neighbour(1);
  if (to) void playTrack(to, scene, unheardAsk);
  else void active.change("stop");
}

/** Start: the switch followed, the end watched, the first gesture unlocks a waiting track. */
export function installTableSound(): void {
  addEventListener("verso:features-changed", () => changed());
  setInterval(watchEnd, 1000);
  for (const t of ["pointerdown", "keydown", "touchend"]) {
    document.addEventListener(
      t,
      () => {
        if (blocked || shareWaiting) hearTable();
      },
      true,
    );
  }
  offActive = active.onChange(changed);
}

/** Whether the Music tab is on screen now (set by the panel). */
let musicShown: () => boolean = () => false;
export function watchMusicOnScreen(fn: () => boolean): void {
  musicShown = fn;
}
export function musicOnScreen(): boolean {
  return soundOn() && musicShown();
}

/** For the tests and the harness: the player's element, if loaded. */
export function playerElement(): HTMLAudioElement | null {
  return player?.el ?? null;
}
