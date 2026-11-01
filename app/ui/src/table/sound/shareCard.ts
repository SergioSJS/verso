// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio in the Music tab (ADR 0116 section B, items 16, 21, 26): the
// *Share audio…* button (drawn only where this window may share), and the
// share's card — for the sharer a level meter with its text twin, the
// listener count and rate, and a Stop that is always there; for everyone
// else the line saying who shares what (their volume, mute and Follow the
// table are the music's controls, drawn by the tab).

import { h } from "../../dom";
import { icon } from "../../icons";
import { labeled, said } from "./controls";
import { levelState, mayShare, mine, mineLive, onLevel, onMine, starting, stopOwn } from "./mine";
import { onSound } from "./run";
import { liveShare } from "./share";
import { shareAudio } from "./sharePick";
import { meterOf, rateText, type LevelState } from "./shareMine";
import { ss } from "./shareWords";

/** A *Share audio…* button that shows itself only while this window may share and nothing of its own is shared. */
export function shareButton(cls: string): HTMLButtonElement {
  const b = labeled(`ghost music-share ${cls}`, ss.share, "volume");
  b.title = ss.shareDesc;
  const paint = (): void => {
    b.hidden = !mayShare() || !!mine();
    b.disabled = starting();
  };
  b.addEventListener("click", () => void shareAudio());
  onMine(paint);
  paint();
  return b;
}

/** Stop sharing, said where the person looks when it fails. */
export function stopShareNow(): void {
  void stopOwn().then(said);
}

const WORDS: Record<LevelState, () => string> = { checking: () => ss.checking, arriving: () => ss.arriving, silence: () => ss.silence };

export class ShareCard {
  readonly el = h("div", "music-sharing");
  private readonly title = h("div", "music-sharing-title");
  private readonly meter = h("div", "music-meter");
  private readonly fill = h("span", "music-meter-fill");
  private readonly state = h("p", "music-meter-state");
  private readonly stats = h("p", "music-sharing-stats");
  private readonly stop = labeled("music-stop-share", ss.stopSharing, "stop");
  private readonly by = h("p", "music-shared-by");

  constructor() {
    this.el.setAttribute("role", "group");
    this.meter.setAttribute("role", "meter");
    this.meter.setAttribute("aria-label", ss.meter);
    this.meter.setAttribute("aria-valuemin", "0");
    this.meter.setAttribute("aria-valuemax", "100");
    this.meter.append(this.fill);
    this.state.setAttribute("role", "status");
    this.stop.title = ss.stopSharing;
    this.stop.addEventListener("click", () => stopShareNow());
    this.el.append(this.title, this.meter, this.state, this.stats, this.stop, this.by);
    onLevel((peak, state) => this.paintLevel(peak, state));
    onMine(() => this.render());
    // The table's share starting, its counts and its end reach the card by the sound's own notice.
    onSound(() => this.render());
    this.render();
  }

  private paintLevel(peak: number, state: LevelState): void {
    const v = meterOf(peak);
    this.fill.style.transform = `scaleX(${v.toFixed(3)})`;
    this.meter.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    this.paintState(state);
  }

  private paintState(level: LevelState = levelState()): void {
    const text = WORDS[level]();
    this.meter.setAttribute("aria-valuetext", text);
    this.meter.classList.toggle("silent", level === "silence");
    if (this.state.textContent !== text) this.state.textContent = text;
  }

  /** Drawn again when the share, the table's count of it or the person's right changes. */
  render(): void {
    const own = mine();
    const live = liveShare();
    const others = !own && live;
    this.el.hidden = !own && !others;
    this.el.setAttribute("aria-label", own ? ss.sharing(own.name) : live ? ss.by(live.by, live.name) : ss.pickTitle);
    for (const el of [this.title, this.meter, this.state, this.stats, this.stop]) el.hidden = !own;
    this.by.hidden = !others;
    if (own) {
      this.title.replaceChildren(icon("volume", ""), h("span", "", ss.sharing(own.name)));
      const now = mineLive();
      const parts = [now?.listeners != null ? ss.listeners(now.listeners) : "", now ? rateText(now.rate_bps) : ""].filter(Boolean);
      this.stats.textContent = parts.join(" · ");
      this.stats.hidden = parts.length === 0;
      this.paintState();
    } else if (others && live) {
      this.by.replaceChildren(icon("volume", ""), h("span", "", ss.by(live.by, live.name)));
    }
  }
}
