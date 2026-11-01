// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The status bar's item of the table's music (ADR 0116 item 24): while a
// track plays and neither the Table tab nor the Music tab is on screen, a
// small note glyph with the track's name; a click opens the Music tab.

import { h } from "../../dom";
import { icon } from "../../icons";
import { tableOnScreen } from "../record";
import { mine as sharing } from "./mine";
import { musicOnScreen, nameOf, onSound, sound, soundOn } from "./run";
import { liveShare } from "./share";
import { stopShareNow } from "./shareCard";
import { ss } from "./shareWords";
import { st } from "./strings";
import { showMusic } from "./tab";

export function installStatusItem(): void {
  const bar = document.querySelector(".status-bar");
  // Before the notifications bell when it is already there: the bell stays
  // just before the report button (ADR 0084 item 4), this item before both.
  const before = document.querySelector(".notify-bell-bar") ?? document.getElementById("report-bug");
  if (!bar) return;
  const item = h("button", "ghost status-sound");
  item.type = "button";
  item.hidden = true;
  item.title = st.statusDesc;
  item.addEventListener("click", () => showMusic());
  bar.insertBefore(item, before);
  // Stop sharing audio is always one click away while this window shares (ADR 0116 item 21).
  const stop = h("button", "ghost status-sound-stop");
  stop.type = "button";
  stop.hidden = true;
  stop.title = ss.statusStop;
  stop.setAttribute("aria-label", ss.statusStop);
  stop.append(icon("stop", ""));
  stop.addEventListener("click", () => stopShareNow());
  bar.insertBefore(stop, before);
  const paint = () => {
    const m = sound().music();
    const own = sharing();
    stop.hidden = !soundOn() || !own;
    const live = liveShare();
    const track = !!m && m.state !== "stopped";
    const show = soundOn() && (track || !!live) && !tableOnScreen() && !musicOnScreen();
    item.hidden = !show;
    if (!show) return;
    const name = track && m ? nameOf(m) : own ? ss.statusSharing(own.name) : live ? ss.by(live.by, live.name) : "";
    item.replaceChildren(icon("music", ""), h("span", "status-sound-name", name));
    item.setAttribute("aria-label", `${track ? st.status(name) : name}. ${st.statusDesc}`);
  };
  onSound(paint);
  addEventListener("verso:table-visibility", paint);
  addEventListener("verso:features-changed", paint);
  setInterval(paint, 2000);
  paint();
}
