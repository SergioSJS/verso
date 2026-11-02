// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's chime (ADR 0107, 2026-10-23): a short sound when another
// person's message or roll reaches the window. Made with WebAudio from a
// few notes, so there is no file to ship and no dependency. It uses the
// dice sound's audio context (dice3d/audio.ts): made inside a gesture, never
// here, and when there is none (or it is not running) the chime is silent —
// it is never held and played late.

import { audioContext, armAudio, unlockAudio } from "../dice3d/audio";
import { ownOutput } from "../dice3d/ownOutput";
import { settings } from "../settings";
import { isNews, type TableEntry } from "./model";

export const CHIMES = ["off", "soft", "bell", "pop"] as const;
export type Chime = (typeof CHIMES)[number];
/** On unless the person chose otherwise (a message from a person is what the sound is for). */
export const CHIME_DEFAULT: Chime = "soft";
export const VOLUME_DEFAULT = 60;

/** One note: when it starts (s), how long it rings (s), its pitch (Hz, from → to), the wave and its share of the volume. */
export type Note = { at: number; len: number; from: number; to: number; wave: OscillatorType; level: number };

/** The notes of each chime; `off` has none. */
export function notesOf(c: Chime): Note[] {
  switch (c) {
    case "soft":
      return [
        { at: 0, len: 0.12, from: 660, to: 660, wave: "sine", level: 1 },
        { at: 0.1, len: 0.2, from: 880, to: 880, wave: "sine", level: 0.9 },
      ];
    case "bell":
      return [
        { at: 0, len: 0.7, from: 1318, to: 1318, wave: "sine", level: 1 },
        { at: 0, len: 0.35, from: 3636, to: 3636, wave: "sine", level: 0.25 },
      ];
    case "pop":
      return [{ at: 0, len: 0.1, from: 520, to: 220, wave: "triangle", level: 1 }];
    default:
      return [];
  }
}

export function readChime(v: unknown): Chime {
  return CHIMES.includes(v as Chime) ? (v as Chime) : CHIME_DEFAULT;
}

/** A volume from 0 to 100; anything else is the default. */
export function readVolume(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : VOLUME_DEFAULT;
}

/** Whether `e` earns a chime: news here (another person's, or your own account's from another device), a message, image or roll (a roll the dice already sound for, its fall, does not; a masked secret says nothing). */
export function earnsChime(e: TableEntry, falls: boolean, typing: boolean): boolean {
  if (!isNews(e) || e.kind === "secret") return false;
  if (falls && (e.kind === "roll" || e.kind === "table")) return false;
  return !typing;
}

/** Play `chime` at `volume` (0-100) now, if the audio context exists and runs. Never throws. */
export function playChime(chime: Chime, volume: number): boolean {
  const c = audioContext();
  const notes = notesOf(chime);
  if (!c || c.state !== "running" || notes.length === 0 || volume <= 0) return false;
  try {
    const t0 = c.currentTime + 0.01;
    const peak = 0.25 * (volume / 100) ** 2;
    for (const n of notes) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = n.wave;
      o.frequency.setValueAtTime(n.from, t0 + n.at);
      if (n.to !== n.from) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.len);
      g.gain.setValueAtTime(0.0001, t0 + n.at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * n.level), t0 + n.at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
      o.connect(g).connect(ownOutput(c));
      o.start(t0 + n.at);
      o.stop(t0 + n.at + n.len + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}

/** The chime as the settings have it. */
export function chosen(): { chime: Chime; volume: number } {
  return { chime: readChime(settings.tableChime), volume: readVolume(settings.tableVolume) };
}

/** For the settings' preview: inside the click, make the context, then play. */
export function previewChime(chime: Chime, volume: number): void {
  unlockAudio();
  playChime(chime, volume);
}

/** Unlock the audio context in the person's first gesture while the chime is on. */
export function armChime(): void {
  armAudio(() => chosen().chime !== "off");
}

/** The window is in front and the person is writing in the table's box. */
export function typingInTable(): boolean {
  const a = document.activeElement;
  return document.hasFocus() && a instanceof HTMLElement && a.classList.contains("table-input");
}
