// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// *Um app pareado sai depois de…* (ADR 0117 D19 item 3; the maintainer,
// 2026-11-15: "90 dias com prazo configurável"): how long the Verso app on
// a phone or tablet, paired with this computer, stays paired without
// speaking to it. 90 days by default, 7 to 365, or never; a phone paired
// through its browser keeps its 14 days. Under *Paired phones*.

import { commands, type ContractError, type LocalServerStatus } from "../bindings";
import { h } from "../dom";
import { localStrings } from "./localServerStrings";

/** The choices offered, in days; 0 is never. The host takes any day from
 *  7 to 365: a value set elsewhere shows as its own choice. */
export const APP_IDLE_CHOICES = [7, 14, 30, 60, 90, 180, 365, 0];

export function appIdleBlock(say: (text: string) => void, failed: (e: ContractError | unknown) => void): { el: HTMLElement; draw: (s: LocalServerStatus) => void } {
  const w = localStrings();
  const el = h("div", "ls-app-idle");
  const select = h("select");
  select.id = "ls-app-idle";
  const row = h("div", "ls-number");
  const label = h("label", "", w.appIdle);
  label.htmlFor = select.id;
  row.append(label, select);
  const help = h("p", "ls-help", w.appIdleDesc);
  help.id = "ls-app-idle-help";
  select.setAttribute("aria-describedby", help.id);
  el.append(row, help);
  let kept = 90;
  const fill = (days: number): void => {
    const all = APP_IDLE_CHOICES.includes(days) ? APP_IDLE_CHOICES : [...APP_IDLE_CHOICES.slice(0, -1), days, 0].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    select.replaceChildren(
      ...all.map((d) => {
        const o = h("option", "", w.appIdleChoice(d));
        o.value = String(d);
        return o;
      }),
    );
    select.value = String(days);
  };
  select.addEventListener("change", () => {
    const days = Number(select.value);
    select.disabled = true;
    void commands.localServerAppIdle(days).then((r) => {
      select.disabled = false;
      if (r.status !== "ok") {
        select.value = String(kept);
        return failed(r.error);
      }
      kept = r.data.app_idle_days;
      fill(kept);
      say(w.appIdleNow(kept));
    });
  });
  return {
    el,
    draw: (s) => {
      kept = s.app_idle_days;
      fill(kept);
    },
  };
}
