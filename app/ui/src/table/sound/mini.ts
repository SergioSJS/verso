// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Table tab's mini-player (ADR 0116 as amended 2026-10-31: "na aba de
// chat pode até ter algum bem simples de player com volume avançar e voltar
// e pause, estou com receio de ocupar de mais espaço"): ONE slim row, only
// while something plays — the track's name (it opens the Music tab), and
// for the game master previous, play/pause and next; for everyone a volume
// button whose popover holds their own volume and mute. Everything else is
// the Music tab's.

import { h } from "../../dom";
import { askUnheard } from "./ask";
import { iconButton, range, relabel, said } from "./controls";
import { control, hearTable, nameOf, neighbour, onSound, ownSound, playerState, setOwn, sound, soundOn, step } from "./run";
import { st } from "./strings";
import { showMusic } from "./tab";

export class MiniPlayer {
  readonly el = h("div", "table-mini");
  private readonly name = h("button", "ghost table-mini-name");
  private readonly prev = iconButton("table-mini-prev", st.previous, "skipBack");
  private readonly toggle = iconButton("table-mini-toggle", st.pause, "pause");
  private readonly next = iconButton("table-mini-next", st.next, "skipForward");
  private readonly hear = iconButton("table-mini-hear", st.hear, "volume");
  private readonly vol = iconButton("table-mini-volume", st.volume, "volume");
  private readonly pop = h("div", "table-mini-pop");
  private readonly mine = range("table-mini-own", st.ownVolume);
  private readonly mute = iconButton("table-mini-mute", st.mute, "volume");

  constructor() {
    this.el.setAttribute("role", "group");
    this.el.setAttribute("aria-label", st.mini);
    this.name.type = "button";
    this.name.title = st.openMusic;
    this.hear.title = st.hearDesc;
    this.pop.hidden = true;
    this.pop.id = "table-mini-pop";
    this.pop.setAttribute("role", "group");
    this.pop.setAttribute("aria-label", st.ownVolume);
    this.pop.append(this.mute, this.mine);
    this.vol.setAttribute("aria-expanded", "false");
    this.vol.setAttribute("aria-controls", this.pop.id);
    this.el.append(this.name, this.prev, this.toggle, this.next, this.hear, this.vol, this.pop);
    this.name.addEventListener("click", () => showMusic());
    this.toggle.addEventListener("click", () => {
      const m = sound().music();
      if (m) void control(m.state === "playing" ? "pause" : "resume").then(said);
    });
    this.prev.addEventListener("click", () => void step(-1, askUnheard).then(said));
    this.next.addEventListener("click", () => void step(1, askUnheard).then(said));
    this.hear.addEventListener("click", () => hearTable());
    this.vol.addEventListener("click", () => this.openPop(this.pop.hidden === true));
    this.mine.addEventListener("input", () => setOwn({ volume: Number(this.mine.value), muted: false }));
    this.mute.addEventListener("click", () => setOwn({ muted: !ownSound().muted }));
    // Escape or a click outside closes the popover; the focus goes back to its button.
    this.pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.openPop(false);
        this.vol.focus();
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.pop.hidden && !this.el.contains(e.target as Node)) this.openPop(false);
    });
    onSound(() => this.render());
    this.render();
  }

  private openPop(on: boolean): void {
    this.pop.hidden = !on;
    this.vol.setAttribute("aria-expanded", String(on));
    if (on) this.mine.focus();
  }

  render(): void {
    const src = sound();
    const m = src.music();
    const show = soundOn() && !!m && m.state !== "stopped";
    this.el.hidden = !show;
    if (!show || !m) {
      this.openPop(false);
      return;
    }
    const master = src.controls();
    const { blocked } = playerState();
    this.name.textContent = nameOf(m);
    this.name.classList.toggle("unseen", m.unseen);
    this.name.setAttribute("aria-label", `${m.state === "playing" ? st.playing(nameOf(m)) : st.paused(nameOf(m))}. ${st.openMusic}`);
    for (const b of [this.prev, this.toggle, this.next]) b.hidden = !master;
    this.hear.hidden = !(blocked && !!m.path);
    relabel(this.toggle, m.state === "playing" ? st.pause : st.resume, m.state === "playing" ? "pause" : "play");
    this.prev.disabled = neighbour(-1) === null;
    this.next.disabled = neighbour(1) === null;
    const mine = ownSound();
    this.mine.value = String(mine.volume);
    this.mine.setAttribute("aria-valuetext", st.volumeText(mine.volume));
    relabel(this.mute, mine.muted ? st.unmute : st.mute, mine.muted ? "volumeOff" : "volume");
    this.mute.setAttribute("aria-pressed", mine.muted ? "true" : "false");
    relabel(this.vol, st.volume, mine.muted ? "volumeOff" : "volume");
  }
}
