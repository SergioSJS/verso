// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the accounts of this computer's server have (ADR 0117 D9, S11–S13),
// in *Transformar em servidor*: the desktop apps of people invited, signed
// in through the browser, each with *Encerrar*; the read links' switch,
// off at first (ADR 0105 item 3; the owner is the administrator, this
// section the console); and in words how another Verso and a passkey reach
// this server — through the internet link, never on the network's own
// certificate. Every action says how it went, failures included.

import { commands, type LocalServerStatus } from "../bindings";
import { button, h } from "../dom";
import { busy } from "../reach";
import { whyOf } from "./localServerLink";
import { accountStrings } from "./localServerAccountsStrings";

function when(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en");
}

export function accountsBlock(say: (text: string) => void): { el: HTMLElement; draw: (s: LocalServerStatus) => Promise<void> } {
  const w = accountStrings();
  const el = h("div", "ls-accounts");

  // Other people's desktop apps.
  const appsTitle = h("h3", "ls-h", w.appsTitle);
  appsTitle.id = "ls-apps-title";
  const apps = h("ul", "ls-phones ls-apps");
  apps.setAttribute("aria-labelledby", appsTitle.id);

  // The read links' switch.
  const input = h("input");
  input.type = "checkbox";
  input.id = "ls-read-links";
  const linksHelp = h("p", "ls-help ls-box-help", w.linksDesc);
  linksHelp.id = "ls-read-links-help";
  input.setAttribute("aria-describedby", linksHelp.id);
  const row = h("label", "ls-check ls-box");
  row.htmlFor = input.id;
  row.append(input, h("span", "", w.linksSwitch));

  el.append(
    appsTitle,
    h("p", "ls-help", w.appsLead),
    h("p", "ls-help", w.appsTrust),
    apps,
    h("h3", "ls-h", w.linksTitle),
    row,
    linksHelp,
    h("h3", "ls-h", w.passkeysTitle),
    h("p", "ls-help", w.passkeysWords),
  );

  const drawApps = async () => {
    const r = await commands.localServerDevices();
    apps.replaceChildren();
    if (r.status !== "ok") return say(whyOf(r.error));
    if (r.data.length === 0) apps.append(h("li", "ls-help", w.appsNone));
    for (const d of r.data) {
      const li = h("li", "ls-phone");
      const who = h("div", "ls-phone-who");
      who.append(h("strong", "", w.app(d.device, d.account)), h("small", "", w.appWhen(d.email, when(d.created), when(d.last_used))));
      const end = button("btn", w.end);
      end.setAttribute("aria-label", w.endNamed(d.device, d.account));
      end.addEventListener("click", () => {
        busy(end, true);
        void commands.localServerEndDevice(d.id).then((res) => {
          busy(end, false);
          if (res.status !== "ok") {
            say(whyOf(res.error));
            // What the server has now: an app ended elsewhere leaves the list.
            return void drawApps();
          }
          say(w.ended(d.device));
          void drawApps().then(() => appsTitle.focus());
        });
      });
      li.append(who, end);
      apps.append(li);
    }
  };
  // The focus has somewhere to go once the row it was on is gone.
  appsTitle.tabIndex = -1;

  input.addEventListener("change", () => {
    const on = input.checked;
    input.disabled = true;
    void commands.localServerReadLinks(on).then((r) => {
      input.disabled = false;
      if (r.status !== "ok") {
        input.checked = !on;
        return say(whyOf(r.error));
      }
      input.checked = r.data.read_links;
      say(r.data.read_links ? w.linksOn : w.linksOff);
    });
  });

  const draw = async (s: LocalServerStatus) => {
    input.checked = s.read_links;
    await drawApps();
  };
  return { el, draw };
}
