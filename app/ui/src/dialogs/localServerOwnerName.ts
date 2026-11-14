// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// *Seu nome para os jogadores* (ADR 0117; the test of 2026-11-04): the
// name the players see for this computer's owner — in the chat, the rolls,
// the roster, a read link's "made by". It is the owner's account name on
// this server, as on a UniVerso; the system's user at first. `[OPEN]` for
// the maintainer: ADR 0117 does not say.

import { commands, type LocalServerStatus } from "../bindings";
import { button, h } from "../dom";
import { busy } from "../reach";
import { whyOf } from "./localServerLink";
import { localStrings } from "./localServerStrings";

export function ownerNameBlock(say: (text: string) => void): { el: HTMLElement; draw: (s: LocalServerStatus) => void } {
  const w = localStrings();
  const el = h("div", "ls-owner-name");
  const input = h("input");
  input.type = "text";
  input.id = "ls-owner-name";
  input.maxLength = 200;
  input.autocomplete = "name";
  const label = h("label", "ls-h", w.ownerName);
  label.htmlFor = input.id;
  const help = h("p", "ls-help", w.ownerNameDesc);
  help.id = "ls-owner-name-help";
  input.setAttribute("aria-describedby", help.id);
  const save = button("btn", w.ownerNameSave);
  save.type = "button";
  const row = h("div", "ls-owner-row");
  row.append(input, save);
  el.append(label, help, row);
  let kept = "";
  const send = (): void => {
    const name = input.value.trim();
    if (name === kept) return;
    if (!name) {
      input.value = kept;
      return say(w.ownerNameEmpty);
    }
    busy(save, true);
    void commands.localServerOwnerName(name).then((r) => {
      busy(save, false);
      if (r.status !== "ok") return say(whyOf(r.error));
      kept = r.data.owner_name;
      input.value = kept;
      say(w.ownerNameSaved(kept));
    });
  };
  save.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    }
  });
  const draw = (s: LocalServerStatus): void => {
    // A name being typed is not overwritten by a redraw.
    if (document.activeElement !== input) input.value = s.owner_name;
    kept = s.owner_name;
  };
  return { el, draw };
}
