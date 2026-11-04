// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// *Convites* (ADR 0117 D2, D13 Q5 and Q8): this server's invitations —
// a table's and a shared folder's alike — with End for one still waiting.
// None is made here: a person is invited from the folder's page, as on a
// UniVerso (decided 2026-11-04) — a table's *Convidar jogadores*, or
// *Compartilhar* for a folder with no table, which offers an invitation
// link for an e-mail no account has. The links are made by the server's
// own acts (`verso_server::admin::acts`).

import { commands, type LocalServerStatus } from "../bindings";
import { button, h } from "../dom";
import { busy } from "../reach";
import { whyOf } from "./localServerLink";
import { linkStrings } from "./localServerLinkStrings";

function when(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en");
}

export function invitations(say: (text: string) => void): { el: HTMLElement; draw: (s: LocalServerStatus) => Promise<void> } {
  const w = linkStrings();
  const el = h("div", "ls-invites");
  const title = h("h3", "ls-h", w.invTitle);
  title.id = "ls-inv-list-title";
  const lead = h("p", "ls-help", w.invLead);
  const list = h("ul", "ls-phones ls-inv-list");
  list.setAttribute("aria-labelledby", title.id);
  el.append(title, lead, list);

  const drawList = async () => {
    const r = await commands.localServerInvitations();
    list.replaceChildren();
    if (r.status !== "ok") return say(whyOf(r.error));
    if (r.data.length === 0) list.append(h("li", "ls-help", w.invNone));
    for (const i of r.data) {
      const li = h("li", "ls-phone");
      const what = w.invWhat(i.folder, i.role);
      const who = h("div", "ls-phone-who");
      who.append(h("strong", "", `${what} · ${w.invState(i.state, i.used_by)}`), h("small", "", w.invWhen(when(i.created), when(i.expires))));
      li.append(who);
      if (i.state === "pending") {
        const end = button("btn", w.invEnd);
        end.setAttribute("aria-label", w.invEndNamed(what));
        end.addEventListener("click", () => {
          busy(end, true);
          void commands.localServerInvitationRevoke(i.id).then((res) => {
            busy(end, false);
            if (res.status !== "ok") return say(whyOf(res.error));
            say(w.invEnded);
            void drawList();
          });
        });
        li.append(end);
      }
      list.append(li);
    }
  };

  const draw = async (_s: LocalServerStatus) => {
    await drawList();
  };
  return { el, draw };
}
