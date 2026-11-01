// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The player of the table's music (ADR 0116 items 24 to 26, Q6 a): a strip
// at the top of the Table panel — on a phone the first row of its sheet —
// and, while the panel is not on screen, a small item in the status bar
// that opens it. The game master has every control; a player only their
// own volume, mute and "Follow the table". Every control has a name; the
// volumes are ranges with their text; a polite region says what plays.
// No "Share audio…" here: the live share is phase 2, and a button that does
// nothing is not drawn.

import { allFiles } from "../../folder";
import { button, h, ui } from "../../dom";
import { icon } from "../../icons";
import { tableOnScreen } from "../record";
import { showTable } from "../show";
import { askUnheard, pickTrack } from "./ask";
import { isAudio, trackName } from "./scene";
import { st } from "./strings";
import { clockText, expectedMs } from "./sync";
import { askUnheardWith, control, cycleLoop, hearTable, loopMode, nameOf, neighbour, onSound, ownSound, playTrack, playerState, setOwn, sound, soundOn, step } from "./run";

function iconButton(cls: string, label: string, ic: string): HTMLButtonElement {
  const b = h("button", `ghost iconic ${cls}`);
  b.type = "button";
  b.append(icon(ic, ""));
  b.setAttribute("aria-label", label);
  b.title = label;
  return b;
}

function range(cls: string, label: string): HTMLInputElement {
  const r = h("input", cls);
  r.type = "range";
  r.min = "0";
  r.max = "100";
  r.step = "1";
  r.setAttribute("aria-label", label);
  r.title = label;
  return r;
}

/** Say a refusal where the person looks. */
function said(e: string | null): void {
  if (e) ui.status.textContent = e;
}

export class SoundStrip {
  readonly el = h("section", "table-sound");
  private readonly row = h("div", "table-sound-row");
  private readonly name = h("span", "table-sound-name");
  private readonly time = h("span", "table-sound-time");
  private readonly bar = range("table-sound-bar", st.position);
  private readonly own = h("div", "table-sound-own");
  private readonly notes = h("div", "table-sound-notes");
  private readonly live = h("div", "sr-only table-sound-said");
  private readonly playPause = iconButton("table-sound-toggle", st.pause, "pause");
  private readonly prev = iconButton("table-sound-prev", st.previous, "skipBack");
  private readonly next = iconButton("table-sound-next", st.next, "skipForward");
  private readonly stop = iconButton("table-sound-stop", st.stop, "stop");
  private readonly loop = iconButton("table-sound-loop", st.loopOff, "repeat");
  private readonly master = range("table-sound-master", st.masterVolume);
  private readonly mine = range("table-sound-volume", st.ownVolume);
  private readonly mute = iconButton("table-sound-mute", st.mute, "volume");
  private readonly follow = h("input", "table-sound-follow");
  private readonly hear = button("table-sound-hear", st.hear, "volume");
  private readonly pick = button("ghost table-sound-pick-button", st.playFile, "music");
  private readonly nothing = h("span", "table-sound-nothing", st.nothing);
  private seeking = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.el.setAttribute("aria-label", st.strip);
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");
    this.hear.title = st.hearDesc;
    this.pick.title = st.playFileDesc;
    this.follow.type = "checkbox";
    this.follow.id = "table-sound-follow";
    const followLabel = h("label", "table-sound-follow-label", st.follow);
    followLabel.htmlFor = this.follow.id;
    followLabel.title = st.followDesc;
    const ownBox = h("span", "table-sound-follow-box");
    ownBox.append(this.follow, followLabel);
    const ownLabel = h("span", "table-sound-label", st.ownVolume);
    this.own.append(ownLabel, this.mute, this.mine, ownBox);
    this.el.append(this.row, this.own, this.notes, this.live);
    // The controls: the game master's.
    this.playPause.addEventListener("click", () => {
      const m = sound().music();
      if (!m) return;
      void control(m.state === "playing" ? "pause" : "resume").then(said);
    });
    this.stop.addEventListener("click", () => void control("stop").then(said));
    this.prev.addEventListener("click", () => void step(-1, askUnheard).then(said));
    this.next.addEventListener("click", () => void step(1, askUnheard).then(said));
    this.loop.addEventListener("click", () => void cycleLoop().then(said));
    this.pick.addEventListener("click", () => {
      // The audio unlocked in the gesture; the pick is the master's choice of a file.
      void pickTrack(allFiles.filter(isAudio)).then((path) => (path ? playTrack(path, null, askUnheard).then(said) : undefined));
    });
    this.bar.addEventListener("input", () => {
      this.seeking = true;
      const m = sound().music();
      if (m?.durationMs) this.time.textContent = st.positionText(clockText((Number(this.bar.value) / 1000) * m.durationMs), clockText(m.durationMs));
    });
    this.bar.addEventListener("change", () => {
      this.seeking = false;
      const m = sound().music();
      if (m?.durationMs) void control("seek", (Number(this.bar.value) / 1000) * m.durationMs).then(said);
    });
    this.bar.max = "1000";
    this.master.addEventListener("change", () => void control("master", Number(this.master.value)).then(said));
    this.master.addEventListener("input", () => this.master.setAttribute("aria-valuetext", st.volumeText(Number(this.master.value))));
    // The person's own.
    this.mine.addEventListener("input", () => setOwn({ volume: Number(this.mine.value), muted: false }));
    this.mute.addEventListener("click", () => setOwn({ muted: !ownSound().muted }));
    this.follow.addEventListener("change", () => setOwn({ follow: this.follow.checked }));
    this.hear.addEventListener("click", () => hearTable());
    // Space toggles while the strip has focus and no field takes it (item 26).
    this.el.addEventListener("keydown", (e) => {
      if (e.key !== " " || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "BUTTON") return;
      if (!sound().controls()) return;
      e.preventDefault();
      this.playPause.click();
    });
    this.el.tabIndex = -1;
    askUnheardWith(askUnheard);
    onSound(() => this.render());
    this.render();
  }

  render(): void {
    const on = soundOn();
    this.el.hidden = !on;
    if (!on) {
      this.tick(false);
      return;
    }
    const src = sound();
    const m = src.music();
    const master = src.controls();
    const playing = !!m && m.state !== "stopped";
    const { blocked, failed, cannotHere } = playerState();
    this.row.replaceChildren();
    if (!playing) {
      // The empty state: for the game master, "Play a file…"; for a player, "Nothing is playing".
      this.pick.replaceChildren(icon("music", ""), st.playFile);
      this.pick.removeAttribute("aria-label");
      if (master) this.row.append(this.pick);
      else this.row.append(this.nothing);
      this.own.hidden = true;
      this.notes.replaceChildren();
      this.tick(false);
      return;
    }
    this.name.textContent = nameOf(m);
    this.name.title = m.path ?? st.hidden;
    if (master) {
      const isPlaying = m.state === "playing";
      this.playPause.replaceChildren(icon(isPlaying ? "pause" : "play", ""));
      const label = isPlaying ? st.pause : st.resume;
      this.playPause.setAttribute("aria-label", label);
      this.playPause.title = label;
      this.prev.disabled = neighbour(-1) === null;
      this.next.disabled = neighbour(1) === null;
      const mode = loopMode();
      const loopLabel = mode === "track" ? st.loopTrack : mode === "scene" ? st.loopScene : st.loopOff;
      this.loop.replaceChildren(icon(mode === "track" ? "repeatOne" : "repeat", ""));
      this.loop.setAttribute("aria-label", loopLabel);
      this.loop.setAttribute("aria-pressed", mode === "off" ? "false" : "true");
      this.loop.title = loopLabel;
      this.master.value = String(m.master);
      this.master.setAttribute("aria-valuetext", st.volumeText(m.master));
      this.bar.disabled = !m.durationMs;
      this.row.append(this.prev, this.playPause, this.next, this.stop, this.name, this.time, this.loop, this.pick);
      this.pick.replaceChildren(icon("music", ""));
      this.pick.setAttribute("aria-label", st.playFile);
    } else {
      this.row.append(this.name, this.time);
    }
    this.row.append(this.bar);
    this.bar.disabled = !master || !m.durationMs;
    this.bar.setAttribute("aria-label", st.position);
    // The person's own: everyone.
    this.own.hidden = false;
    const mine = ownSound();
    this.mine.value = String(mine.volume);
    this.mine.setAttribute("aria-valuetext", st.volumeText(mine.volume));
    this.mute.replaceChildren(icon(mine.muted ? "volumeOff" : "volume", ""));
    this.mute.setAttribute("aria-label", mine.muted ? st.unmute : st.mute);
    this.mute.setAttribute("aria-pressed", mine.muted ? "true" : "false");
    this.follow.checked = mine.follow;
    if (master) {
      if (!this.own.contains(this.master)) this.own.prepend(h("span", "table-sound-label", st.masterVolume), this.master);
    }
    // Notes: who does not hear, who cannot, what this window cannot do.
    const lines: Node[] = [];
    if (blocked && m.path) lines.push(this.hear);
    if (cannotHere) lines.push(h("p", "table-sound-note", st.cannotHere));
    else if (failed) lines.push(h("p", "table-sound-note", st.missing));
    if (master && m.unheard.length > 0) lines.push(h("p", "table-sound-note", st.notHearing(m.unheard.join(", "))));
    if (master && m.cannot.length > 0) lines.push(h("p", "table-sound-note", st.cannot(m.cannot.join(", "))));
    if (!src.shared && master) lines.push(h("p", "table-sound-note quiet", st.alone));
    this.notes.replaceChildren(...lines);
    this.tick(m.state === "playing");
    this.paintTime();
  }

  private tick(on: boolean): void {
    if (on && !this.timer) this.timer = setInterval(() => this.paintTime(), 500);
    else if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private paintTime(): void {
    const m = sound().music();
    if (!m || this.seeking) return;
    const at = expectedMs(m, sound().serverNow());
    this.time.textContent = st.positionText(clockText(at), m.durationMs ? clockText(m.durationMs) : "");
    if (m.durationMs) {
      this.bar.value = String(Math.round((at / m.durationMs) * 1000));
      this.bar.setAttribute("aria-valuetext", st.positionText(clockText(at), clockText(m.durationMs)));
    }
  }
}

/** The status bar's item while the Table panel is not on screen: the track, opening the panel. */
export function installStatusItem(): void {
  const bar = document.querySelector(".status-bar");
  const before = document.getElementById("report-bug");
  if (!bar) return;
  const item = h("button", "ghost status-sound");
  item.type = "button";
  item.hidden = true;
  item.title = st.statusDesc;
  item.addEventListener("click", () => showTable());
  bar.insertBefore(item, before);
  const paint = () => {
    const m = sound().music();
    const show = soundOn() && !!m && m.state !== "stopped" && !tableOnScreen();
    item.hidden = !show;
    if (!show || !m) return;
    const name = m.path ? trackName(m.path) : st.hidden;
    item.replaceChildren(icon("music", ""), h("span", "status-sound-name", name));
    item.setAttribute("aria-label", `${st.status(name)}. ${st.statusDesc}`);
  };
  onSound(paint);
  addEventListener("verso:table-visibility", paint);
  addEventListener("verso:features-changed", paint);
  setInterval(paint, 2000);
  paint();
}
