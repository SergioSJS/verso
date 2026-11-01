// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The status bar's item of the table's music (ADR 0116 item 24): while a
// track plays and neither the Table tab nor the Music tab is on screen, a
// small note glyph with the track's name; a click opens the Music tab.

import { h } from "../../dom";
import { icon } from "../../icons";
import { tableOnScreen } from "../record";
import { musicOnScreen, nameOf, onSound, sound, soundOn } from "./run";
import { st } from "./strings";
import { showMusic } from "./tab";

export function installStatusItem(): void {
  const bar = document.querySelector(".status-bar");
  const before = document.getElementById("report-bug");
  if (!bar) return;
  const item = h("button", "ghost status-sound");
  item.type = "button";
  item.hidden = true;
  item.title = st.statusDesc;
  item.addEventListener("click", () => showMusic());
  bar.insertBefore(item, before);
  const paint = () => {
    const m = sound().music();
    const show = soundOn() && !!m && m.state !== "stopped" && !tableOnScreen() && !musicOnScreen();
    item.hidden = !show;
    if (!show || !m) return;
    const name = nameOf(m);
    item.replaceChildren(icon("music", ""), h("span", "status-sound-name", name));
    item.setAttribute("aria-label", `${st.status(name)}. ${st.statusDesc}`);
  };
  onSound(paint);
  addEventListener("verso:table-visibility", paint);
  addEventListener("verso:features-changed", paint);
  setInterval(paint, 2000);
  paint();
}
