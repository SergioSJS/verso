// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The player an audio embed is drawn as (ADR 0116, amendment of 2026-11-01):
// in a note's reading view and Live Preview, and on a board's card. Verso's
// own look, not the engine's controls: play and pause, a bar with the time,
// the person's own volume and mute (kept on this device, shared by every
// embed), the file's name (it opens the file), and — for whoever controls
// the table's music — "Play for the table", which hands the file to the
// table's sound (src/table/sound/), release question included.
//
// It plays for this person only, from the file's own address (`/f/` on a
// server, `verso://` on the desktop): the server's access rules decide the
// bytes, and a player at a table never receives the embed of a file they do
// not see (the server veils it to the locked placeholder, campaign_text.rs).
//
// With the table's music: an embed started while the table's music is heard
// lowers it (DUCK) until it stops; the table's music starting pauses the
// embed and says so. One embed plays at a time: starting one pauses the
// others. A note or a card drawn again keeps the sound going: the playing
// element moves to the player drawn in its place (`handovers`); one that
// finds none stops after a moment.

import { icon } from "../icons";
import { h, ui } from "../dom";
import { canPlay } from "../table/sound/formats";
import { audioContext, unlockAudio } from "../dice3d/audio";
import { mediaNode, prepareMedia, retryPlain, routeMedia } from "../dice3d/ownOutput";
import { control, onSound, reportLength, setDuck, sound, soundAlone, tableAudible } from "../table/sound/run";
import { playForTable, soundButtons, type SoundHost } from "../table/sound/links";
import { clockText, expectedMs, lengthOf } from "../table/sound/sync";
import { aw } from "./strings";
import { type Heard, type Link, type Own, UNLINKED, duckFactor, linkStep, startAtMs, toggleWish, handovers, orphanStops, ownGain, ownPrefs, tableStarted, timeText } from "./state";

export type AudioEmbedOptions = {
  /** The file, relative to the open folder. */
  path: string;
  /** Its address for this window. */
  src: string;
  /** Open the file (beside, with ⌘ or Ctrl). */
  open: (aside: boolean) => void;
  /** The note (or board) it is embedded in, for "Play for the table"'s scene. */
  host: SoundHost;
  /** The heading above the embed, or null. */
  heading: () => string | null;
  /** On a board: the controls are pressed through the board (`useCardButtons`). */
  onBoard?: boolean;
};

const KEY = "verso:audio-embed";
function readOwn(): Own {
  try {
    return ownPrefs(localStorage.getItem(KEY));
  } catch {
    return ownPrefs(null);
  }
}
let own: Own = readOwn();
function setOwn(change: Partial<Own>): void {
  own = { ...own, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(own));
  } catch {
    // Kept for this run only.
  }
  for (const p of live) p.drawVolume();
}

const nameOf = (path: string): string => path.split("/").pop() ?? path;
const trackOf = (path: string): string => nameOf(path).replace(/\.[^.]+$/, "");

/** Every player drawn and not yet let go. */
const live = new Set<AudioEmbed>();
const owners = new WeakMap<HTMLAudioElement, AudioEmbed>();

class AudioEmbed {
  readonly root: HTMLElement;
  audio: HTMLAudioElement;
  /** Never played and never handed a sound: a player drawn again may take one. */
  fresh = true;
  missed = 0;
  /** Seen on the page once: off it again and silent, it is let go. */
  wasOnPage = false;
  private readonly born = Date.now();
  private readonly toggle: HTMLButtonElement;
  private readonly bar: HTMLInputElement;
  private readonly time: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly vol: HTMLInputElement;
  private readonly tableBtn: HTMLButtonElement;
  private readonly note: HTMLElement;
  private dragging = false;
  /** Linked to the table's music: once bound, this embed is its player of the track. */
  link: Link = UNLINKED;
  private readonly playable: boolean;

  constructor(readonly o: AudioEmbedOptions) {
    const file = nameOf(o.path);
    this.root = h("div", "audio-embed");
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", aw.group(file));
    this.root.dataset["path"] = o.path;
    this.toggle = h("button", "audio-embed-toggle");
    this.toggle.type = "button";
    const main = h("div", "audio-embed-main");
    const top = h("div", "audio-embed-top");
    const name = h("button", "audio-embed-name", file);
    name.type = "button";
    name.title = aw.open(file);
    name.setAttribute("aria-label", aw.open(file));
    name.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      o.open(e.metaKey || e.ctrlKey);
    });
    this.time = h("span", "audio-embed-time", "0:00");
    this.time.setAttribute("aria-hidden", "true");
    top.append(name, this.time);
    this.bar = h("input", "audio-embed-bar");
    this.bar.type = "range";
    this.bar.min = "0";
    this.bar.max = "1";
    this.bar.step = "1";
    this.bar.value = "0";
    this.bar.disabled = true;
    this.bar.setAttribute("aria-label", aw.position);
    main.append(top, this.bar);
    this.muteBtn = h("button", "ghost iconic audio-embed-mute");
    this.muteBtn.type = "button";
    this.vol = h("input", "audio-embed-volume");
    this.vol.type = "range";
    this.vol.min = "0";
    this.vol.max = "100";
    this.vol.step = "1";
    this.vol.setAttribute("aria-label", aw.volume);
    this.tableBtn = h("button", "audio-embed-table");
    this.tableBtn.type = "button";
    this.tableBtn.append(icon("music", ""), h("span", "audio-embed-table-label"));
    this.note = h("p", "audio-embed-note");
    this.note.setAttribute("role", "status");
    this.note.hidden = true;
    this.audio = this.makeAudio();
    this.root.append(this.toggle, main, this.muteBtn, this.vol, this.tableBtn, this.note, this.audio);
    if (o.onBoard) for (const c of [this.toggle, this.bar, this.muteBtn, this.vol, this.tableBtn]) c.classList.add("board-card-press");

    this.playable = canPlay(o.path, (mime) => this.audio.canPlayType(mime));
    if (!this.playable) this.say(aw.cannotHere);
    this.toggle.disabled = !this.playable;
    this.toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.bound()) return this.driveTable(toggleWish(sound().music()?.state ?? "paused"));
      if (this.audio.paused) this.start();
      else this.audio.pause();
    });
    this.bar.addEventListener("pointerdown", () => (this.dragging = true));
    this.bar.addEventListener("input", () => {
      const to = Number(this.bar.value);
      if (this.bound()) {
        this.drawTime(to * 1000);
        this.driveTable("seek", to * 1000);
        return;
      }
      try {
        this.audio.currentTime = to;
      } catch {
        // Not seekable yet: the next play starts from the start.
      }
      // The words follow the bar at once; the element catches up as it seeks.
      this.drawTime(to * 1000);
    });
    this.bar.addEventListener("change", () => (this.dragging = false));
    this.muteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOwn({ muted: !own.muted });
    });
    this.vol.addEventListener("input", () => setOwn({ volume: Number(this.vol.value), muted: false }));
    this.tableBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const at = startAtMs(this.audio.currentTime);
      this.audio.pause();
      this.link = { armed: sound().music()?.revision ?? -1, bound: false };
      void playForTable(o.path, o.host, o.heading(), at).then((err) => {
        if (err) this.link = UNLINKED;
      });
    });
    // The board's and the editor's own pointer and plain keys (Space, the
    // arrows, Delete) stay out of the player; a shortcut (⌘P…) goes on.
    for (const t of ["pointerdown", "mousedown", "dblclick"]) this.root.addEventListener(t, (e) => e.stopPropagation());
    this.root.addEventListener("keydown", (e) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) e.stopPropagation();
    });
    this.drawState();
    this.drawVolume();
    this.drawTable();
    prune();
    live.add(this);
    requestAnimationFrame(() => (this.wasOnPage ||= this.root.isConnected));
  }

  /** Off the page and silent, for good: shown once, or never shown in a few seconds. */
  gone(): boolean {
    if (this.root.isConnected) {
      this.wasOnPage = true;
      return false;
    }
    return this.audio.paused && (this.wasOnPage || Date.now() - this.born > 3000);
  }

  private makeAudio(): HTMLAudioElement {
    const a = h("audio", "audio-embed-audio");
    a.preload = "metadata";
    a.hidden = true;
    prepareMedia(a, this.o.src);
    a.src = this.o.src;
    this.bind(a);
    return a;
  }

  private bind(a: HTMLAudioElement): void {
    owners.set(a, this);
    if (a.dataset["bound"]) return;
    a.dataset["bound"] = "1";
    const me = () => owners.get(a);
    a.addEventListener("loadedmetadata", () => me()?.lengthRead());
    a.addEventListener("durationchange", () => me()?.lengthRead());
    a.addEventListener("timeupdate", () => me()?.drawTime());
    a.addEventListener("play", () => me()?.started());
    a.addEventListener("playing", () => me()?.drawState());
    a.addEventListener("pause", () => me()?.stopped());
    a.addEventListener("ended", () => me()?.stopped());
    a.addEventListener("error", () => {
      // Asked for with `crossorigin` and refused: once more, plainly.
      if (retryPlain(a)) return;
      if (a.getAttribute("src")) me()?.say(aw.failed);
    });
  }

  /** The element read the file's length: drawn, and told to the table when this embed is its player. */
  lengthRead(): void {
    if (this.bound()) reportLength(this.audio.duration * 1000);
    this.drawTime();
  }

  /** Inside the person's gesture. */
  private start(): void {
    this.fresh = false;
    unlockAudio();
    this.route();
    this.applyGain();
    void this.audio.play().catch(() => this.drawState());
  }

  /** Whether the table's music is this embed's track and the embed drives it. */
  bound(): boolean {
    return this.link.bound && sound().controls() && !!sound().music();
  }

  private driveTable(wish: "pause" | "resume" | "seek", value: number | null = null): void {
    void control(wish, value).then((err) => {
      if (err) ui.status.textContent = err;
    });
  }

  /** The table's state drawn on the embed (a bound embed's play, pause, bar and time). */
  drawBound(): void {
    const m = sound().music();
    const playing = m?.state === "playing";
    const label = playing ? aw.pause(trackOf(this.o.path)) : aw.play(trackOf(this.o.path));
    const ic = playing ? "pause" : "play";
    if (this.toggle.dataset["icon"] !== ic) {
      this.toggle.replaceChildren(icon(ic, ""));
      this.toggle.dataset["icon"] = ic;
    }
    this.toggle.setAttribute("aria-label", label);
    this.toggle.title = label;
    this.root.classList.toggle("playing", playing);
    this.drawTime();
  }

  private started(): void {
    this.fresh = false;
    // One embed at a time.
    for (const p of live) if (p !== this && !p.audio.paused) p.audio.pause();
    const lowered = tableAudible();
    this.say(lowered ? aw.ducked : null);
    duck();
    this.drawState();
    sweeping();
  }

  private stopped(): void {
    if (this.note.textContent === aw.ducked) this.say(null);
    duck();
    this.drawState();
  }

  noteSays(line: string): boolean {
    return !this.note.hidden && this.note.textContent === line;
  }

  say(line: string | null): void {
    this.note.textContent = line ?? "";
    this.note.hidden = !line;
  }

  /** Into the window's own output, once the audio context runs (a Mac's share does not carry it then). */
  private route(): void {
    const ctx = audioContext();
    if (!ctx || mediaNode(this.audio)) return;
    const go = (): void => {
      if (routeMedia(this.audio, ctx)) this.applyGain();
    };
    if (ctx.state === "running") return go();
    const on = (): void => {
      if (ctx.state !== "running") return;
      ctx.removeEventListener("statechange", on);
      go();
    };
    ctx.addEventListener("statechange", on);
  }

  applyGain(): void {
    const g = ownGain(own);
    const node = mediaNode(this.audio);
    if (node) {
      // Through Web Audio the element's own volume is left alone and the gain does it.
      node.gain.value = own.muted || g === 0 ? 0 : g;
      this.audio.volume = 1;
      this.audio.muted = false;
      return;
    }
    try {
      this.audio.volume = g;
    } catch {
      // iOS: read-only; mute is the control that works there.
    }
    this.audio.muted = own.muted || g === 0;
  }

  drawState(): void {
    if (this.bound()) return this.drawBound();
    const playing = !this.audio.paused;
    const track = trackOf(this.o.path);
    const label = playing ? aw.pause(track) : aw.play(track);
    const ic = playing ? "pause" : "play";
    if (this.toggle.dataset["icon"] !== ic) {
      this.toggle.replaceChildren(icon(ic, ""));
      this.toggle.dataset["icon"] = ic;
    }
    this.toggle.setAttribute("aria-label", label);
    this.toggle.title = label;
    this.root.classList.toggle("playing", playing);
  }

  /** `seekMs`: where the bar was just put, before the element has caught up. */
  drawTime(seekMs?: number): void {
    const d = this.audio.duration;
    const m = this.bound() ? sound().music() : null;
    const length = lengthOf(m?.durationMs ?? null, d);
    const mine = (Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0) * 1000;
    // The same position as the Music tab: wrapped at the length when looping, stopped at its end otherwise.
    const at = seekMs ?? (m ? expectedMs({ ...m, durationMs: length }, sound().serverNow()) : mine);
    this.time.textContent = timeText(at, length);
    this.bar.disabled = length === null || !this.playable;
    if (length !== null) this.bar.max = String(Math.max(1, Math.floor(length / 1000)));
    if (!this.dragging) this.bar.value = String(Math.floor(at / 1000));
    this.bar.setAttribute("aria-valuetext", aw.positionText(clockText(at), length === null ? null : clockText(length)));
    this.bar.style.setProperty("--done", length ? `${Math.min(100, (at / length) * 100)}%` : "0%");
  }

  drawVolume(): void {
    this.applyGain();
    const muted = own.muted || own.volume === 0;
    const label = muted ? aw.unmute : aw.mute;
    const ic = muted ? "volumeOff" : "volume";
    if (this.muteBtn.dataset["icon"] !== ic) {
      this.muteBtn.replaceChildren(icon(ic, ""));
      this.muteBtn.dataset["icon"] = ic;
    }
    this.muteBtn.setAttribute("aria-label", label);
    this.muteBtn.title = label;
    this.muteBtn.setAttribute("aria-pressed", String(muted));
    this.vol.value = String(own.volume);
    this.vol.setAttribute("aria-valuetext", aw.volumeText(own.volume));
    this.vol.style.setProperty("--done", `${own.volume}%`);
  }

  /** "Play for the table" for whoever controls the table's music; alone in
   *  a folder of this computer, "Play in the Music tab". */
  drawTable(): void {
    const shown = this.playable && soundButtons() && !this.bound();
    this.tableBtn.hidden = !shown;
    if (!shown) return;
    const alone = soundAlone();
    const label = alone ? aw.inMusic : aw.forTable;
    const words = this.tableBtn.querySelector(".audio-embed-table-label");
    if (words) words.textContent = label;
    this.tableBtn.title = alone ? aw.inMusicDesc : aw.forTableDesc;
  }

  /** Take the playing element of a player that left the page. */
  adopt(from: AudioEmbed): void {
    const mine = this.audio;
    const theirs = from.audio;
    mine.replaceWith(theirs);
    from.audio = mine;
    owners.set(mine, from);
    this.audio = theirs;
    this.bind(theirs);
    this.fresh = false;
    this.say(from.note.hidden ? null : from.note.textContent);
    this.drawState();
    this.drawTime();
  }
}

/** The player of an audio embed, drawn. */
export function audioPlayer(o: AudioEmbedOptions): HTMLElement {
  return new AudioEmbed(o).root;
}

/** The table's music lowered while an embed plays, at its gain otherwise. */
function duck(): void {
  const anyLocal = [...live].some((p) => !p.audio.paused);
  setDuck(duckFactor(anyLocal, tableAudible()));
}

/** Let go of the players gone for good (a note or a card drawn anew). */
function prune(): void {
  for (const p of live) if (p.gone()) live.delete(p);
}

let heard: Heard | null = null;
/** While an embed is bound: its bar and time follow the table's clock. */
let tick: ReturnType<typeof setInterval> | null = null;
function bindTick(): void {
  const any = [...live].some((p) => p.bound());
  if (any && !tick) tick = setInterval(() => live.forEach((p) => p.bound() && p.drawTime()), 500);
  else if (!any && tick) {
    clearInterval(tick);
    tick = null;
  }
}
onSound(() => {
  const m = sound().music();
  const now: Heard | null = m ? { path: m.path, state: m.state, revision: m.revision } : null;
  if (tableStarted(heard, now)) {
    for (const p of live) {
      if (p.audio.paused || p.link.armed !== null || p.link.bound) continue;
      p.audio.pause();
      p.say(aw.pausedForTable);
    }
  }
  heard = now;
  for (const p of live) {
    const was = p.bound();
    p.link = linkStep(p.link, p.o.path, now);
    if (p.bound() || was) {
      p.audio.pause();
      p.say(null);
      p.drawState();
    }
  }
  bindTick();
  prune();
  const audible = tableAudible();
  for (const p of live) {
    p.drawTable();
    if (!audible && p.noteSays(aw.ducked)) p.say(null);
  }
  duck();
});

/** While anything plays: hand a playing element to the player drawn in its
 *  place, stop one that finds none, let go of the players gone for good. */
let timer: ReturnType<typeof setInterval> | null = null;
function sweeping(): void {
  timer ??= setInterval(sweep, 500);
}
function sweep(): void {
  const all = [...live];
  const seen = all.map((p) => ({ path: p.o.path, shown: p.root.isConnected && p.root.getClientRects().length > 0, playing: !p.audio.paused, fresh: p.fresh }));
  for (const [from, to] of handovers(seen)) all[to]!.adopt(all[from]!);
  for (const p of all) {
    if (p.root.isConnected || p.audio.paused) {
      p.missed = 0;
      continue;
    }
    p.missed++;
    if (orphanStops(p.missed)) {
      p.audio.pause();
      live.delete(p);
    }
  }
  prune();
  duck();
  if (![...live].some((p) => !p.audio.paused)) {
    if (timer) clearInterval(timer);
    timer = null;
  }
}

/** For the e2e: the players' state. */
export function audioEmbedsNow(): Array<{ path: string; playing: boolean; connected: boolean }> {
  return [...live].map((p) => ({ path: p.o.path, playing: !p.audio.paused, connected: p.root.isConnected }));
}
