// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The game master's **Account** in this app's Settings while it serves
// (ADR 0117 D2, revised 2026-11-05; the maintainer: "por que quando o
// mestre transforma o app num servidor ele não tem o menu de Conta? Só
// jogadores?"). The owner of this computer's server is its admin account,
// with no password (D5, D14 (b)): his name for the players — moved here
// from *Transformar em servidor*, its one place — the language, and where
// he comes in as the owner: this window, and the phones paired, ended where
// they are paired. No password or passkey row: none works for him.

import { commands } from "../bindings";
import { h } from "../dom";
import { showPhonesNext } from "./localServer";
import { ownerNameBlock } from "./localServerOwnerName";
import { localStrings } from "./localServerStrings";
import type { SettingItem } from "./settings/types";

type Item = (title: string, desc: string, control: HTMLElement | null) => HTMLElement;

/** The owner's Account items: `language` is the app's own control (the
 *  same setting as Settings › General's), `open` goes to a section. */
export function masterAccountItems(item: Item, language: { title: string; desc: string; control: () => HTMLElement }, open: (section: string) => void): SettingItem[] {
  const w = localStrings();
  return [
    {
      section: "account",
      group: w.ownerProfile,
      title: w.ownerName,
      desc: w.ownerNameDesc,
      node: () => {
        const box = h("div", "web-block");
        const said = h("p", "ls-said");
        said.setAttribute("role", "status");
        const name = ownerNameBlock((text) => (said.textContent = text));
        void commands.localServerStatus().then((r) => r.status === "ok" && name.draw(r.data));
        box.append(name.el, said);
        return box;
      },
    },
    { section: "account", group: w.ownerProfile, title: language.title, desc: language.desc, node: () => item(language.title, language.desc, language.control()) },
    {
      section: "account",
      group: w.ownerWhere,
      title: w.ownerWhere,
      desc: w.ownerWhereNow(0),
      node: () => {
        const go = h("button", "btn", w.ownerWhereGo);
        go.type = "button";
        // To the paired phones themselves, not the section's top.
        go.addEventListener("click", () => {
          showPhonesNext();
          open("localserver");
        });
        // The group's heading names it: the row does not say it again
        // under it (the walk of 2026-11-06).
        const row = item("", w.ownerWhereNow(0), go);
        row.querySelector(".setting-title")?.remove();
        const desc = row.querySelector<HTMLElement>(".setting-desc");
        void commands.localServerStatus().then((r) => {
          if (r.status === "ok" && desc) desc.textContent = w.ownerWhereNow(r.data.phones_paired);
        });
        return row;
      },
    },
  ];
}
