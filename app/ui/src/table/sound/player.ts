// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The element that plays the table's music in this window (ADR 0116 items
// 11, 12, 25): one `<audio>` for the music channel, its bytes the file's
// own address (`/f/` on a server, `verso://` on the desktop), never decoded
// whole. Loaded only when a track first plays (item 30: a lazy chunk).
//
// The volume goes through a GainNode on the dice's audio context when the
// file is of the page's own origin — iOS keeps `HTMLMediaElement.volume`
// read-only — and through `volume` otherwise (a `verso://` file is another
// origin: taken into Web Audio without CORS it would play silence). Every
// two seconds the element is brought to where the server's clock says the
// track is: a nudge of the rate, or a seek.

import { audioContext, unlockAudio } from "../../dice3d/audio";
import type { Music } from "./source";
import { expectedMs, fix } from "./sync";

/** What the player tells the window. */
export type PlayerEvents = {
  /** The engine refused to start without a gesture: "Hear the table". */
  blocked(): void;
  /** It plays (after a gesture, or by itself). */
  started(): void;
  /** The file did not load or decode here. */
  failed(): void;
  /** The track's length, once the element knows it. */
  length(ms: number): void;
};

/** What the window wants played now. */
export type Want = {
  music: Music | null;
  /** The file's address; none when nothing plays here. */
  url: string | null;
  gain: number;
  serverNow: () => number;
};

const CHECK_MS = 2000;

const sameOrigin = (url: string): boolean => {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
};

export class Player {
  readonly el: HTMLAudioElement;
  private node: GainNode | null = null;
  private routed = false;
  private src = "";
  private want: Want = { music: null, url: null, gain: 1, serverNow: () => Date.now() };
  private waiting = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly ev: PlayerEvents) {
    this.el = document.createElement("audio");
    this.el.preload = "auto";
    this.el.className = "table-sound-audio";
    this.el.hidden = true;
    this.el.addEventListener("error", () => {
      if (this.src) this.ev.failed();
    });
    this.el.addEventListener("loadedmetadata", () => {
      const d = this.el.duration;
      if (Number.isFinite(d) && d > 0) this.ev.length(d * 1000);
      this.correct(true);
    });
    this.el.addEventListener("playing", () => this.ev.started());
    document.body.append(this.el);
    this.timer = setInterval(() => this.correct(false), CHECK_MS);
  }

  /** Play what the window wants now. */
  set(want: Want): void {
    this.want = want;
    const m = want.music;
    const url = m && m.state !== "stopped" ? want.url : null;
    if (!url) {
      this.el.pause();
      if (this.src) {
        this.src = "";
        this.el.removeAttribute("src");
        this.el.load();
      }
      return;
    }
    if (url !== this.src) {
      this.src = url;
      this.el.src = url;
    }
    this.route();
    this.setGain(want.gain);
    this.correct(true);
  }

  /** Inside a gesture: the audio unlocked, the element started. */
  unlock(): void {
    unlockAudio();
    this.route();
    this.setGain(this.want.gain);
    this.waiting = false;
    this.correct(true);
  }

  private route(): void {
    if (this.routed || !this.src || !sameOrigin(this.src)) return;
    const ctx = audioContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaElementSource(this.el);
      this.node = ctx.createGain();
      source.connect(this.node).connect(ctx.destination);
      this.routed = true;
    } catch {
      // The element plays by its own volume.
    }
  }

  private setGain(g: number): void {
    const v = Math.max(0, Math.min(1, g));
    if (this.node) {
      this.node.gain.value = v;
      this.el.volume = 1;
    } else {
      try {
        this.el.volume = v;
      } catch {
        // iOS: read-only; the gain path is the one that works there.
      }
    }
    this.el.muted = v === 0;
  }

  /** Where the element should be, now: started, paused, nudged or sought. */
  private correct(now: boolean): void {
    const m = this.want.music;
    if (!m || !this.src) return;
    const length = m.durationMs ?? (Number.isFinite(this.el.duration) && this.el.duration > 0 ? this.el.duration * 1000 : null);
    const want = expectedMs({ ...m, durationMs: length }, this.want.serverNow());
    if (m.state !== "playing") {
      if (!this.el.paused) this.el.pause();
      this.el.playbackRate = 1;
      if (this.el.readyState >= 1 && Math.abs(this.el.currentTime * 1000 - want) > 250) this.el.currentTime = want / 1000;
      return;
    }
    if (length !== null && !m.looping && want >= length) {
      this.el.pause();
      return;
    }
    this.el.loop = m.looping;
    if (this.el.readyState >= 1) {
      const f = fix(this.el.currentTime * 1000, want, length);
      if (f.kind === "seek") this.el.currentTime = f.toMs / 1000;
      this.el.playbackRate = f.kind === "rate" ? f.rate : 1;
    }
    if (this.el.paused && (now || !this.waiting)) {
      void this.el.play().then(
        () => {
          this.waiting = false;
        },
        (e: unknown) => {
          if (e instanceof DOMException && e.name === "NotAllowedError") {
            this.waiting = true;
            this.ev.blocked();
          }
        },
      );
    }
  }

  destroy(): void {
    clearInterval(this.timer);
    this.el.pause();
    this.el.remove();
  }
}
