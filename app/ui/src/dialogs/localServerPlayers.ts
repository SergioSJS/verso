// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// *Pessoas convidadas* (ADR 0117 D9, the row of "forgot the password"):
// the people who accepted an invitation, by name and e-mail, the folders
// they reach with their role, and when they were last seen; for each,
// *Nova senha* (a single-use link for a day, shown once here with Copy,
// for the owner to hand over — nothing is mailed), *Encerrar sessões* and
// *Remover*, which asks first. The click is the owner's proof (D4 Q4).
// Never this computer's own accounts: the host lists none of them. Every
// action says how it went, failures included.

import { commands, type LocalPlayer, type LocalServerStatus } from "../bindings";
import { button, h } from "../dom";
import { humanDate } from "../dates";
import { busy } from "../reach";
import { whyOf } from "./localServerLink";
import { playerStrings } from "./localServerPlayersStrings";

export function playersBlock(say: (text: string) => void): { el: HTMLElement; draw: (s: LocalServerStatus) => Promise<void> } {
  const w = playerStrings();
  const el = h("div", "ls-players");
  const title = h("h3", "ls-h", w.title);
  title.id = "ls-players-title";
  // The focus has somewhere to go once the row it was on is gone.
  title.tabIndex = -1;
  const list = h("ul", "ls-phones ls-players-list");
  list.setAttribute("aria-labelledby", title.id);
  // A new password's link: said once, kept across redraws until serving
  // stops.
  const made = h("div", "ls-inv-made ls-reset-made");
  made.hidden = true;
  el.append(title, h("p", "ls-help", w.lead), list, made);

  const showMade = (name: string, link: string) => {
    const line = h("p", "ls-fp");
    line.append(h("strong", "", `${w.link}: `), h("code", "", link));
    const copy = button("btn", w.copy);
    const copied = h("p", "ls-help");
    copied.setAttribute("role", "status");
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(link).then(
        () => (copied.textContent = w.copied),
        () => (copied.textContent = w.notCopied),
      );
    });
    made.replaceChildren(h("p", "ls-help", w.resetMade(name)), line, copy, copied);
    made.hidden = false;
    copy.focus();
  };

  /** Ask before removing, in the row: *Remover* or *Cancelar*. */
  const ask = (p: LocalPlayer, back: HTMLButtonElement, yes: () => void): void => {
    const row = h("div", "ls-confirm");
    row.setAttribute("role", "alertdialog");
    row.setAttribute("aria-label", w.removeAsk(p.name));
    const go = button("btn danger", w.yes);
    go.setAttribute("aria-label", w.removeNamed(p.name));
    const no = button("btn", w.cancel);
    row.append(h("span", "", w.removeAsk(p.name)), go, no);
    go.addEventListener("click", () => {
      row.replaceWith(back);
      yes();
    });
    no.addEventListener("click", () => {
      row.replaceWith(back);
      back.focus();
    });
    back.replaceWith(row);
    no.focus();
  };

  const row = (p: LocalPlayer): HTMLElement => {
    const li = h("li", "ls-phone ls-player");
    const who = h("div", "ls-phone-who");
    const reaches = p.reaches.map((r) => `${r.name} (${w.role[r.role] ?? r.role})`).join(", ");
    who.append(
      h("strong", "", p.name),
      h("small", "", w.seen(p.email, p.last_seen === null ? null : humanDate(p.last_seen))),
      h("small", "", reaches ? w.reaches(reaches) : w.reachesNone),
    );
    const actions = h("div", "ls-player-actions");
    const reset = button("btn", w.reset);
    reset.setAttribute("aria-label", w.resetNamed(p.name));
    const end = button("btn", w.end);
    end.setAttribute("aria-label", w.endNamed(p.name));
    const remove = button("btn", w.remove);
    remove.setAttribute("aria-label", w.removeNamed(p.name));
    reset.addEventListener("click", () => {
      busy(reset, true);
      void commands.localServerAccountReset(p.id).then((r) => {
        busy(reset, false);
        if (r.status !== "ok") return say(whyOf(r.error));
        say(w.resetMade(p.name));
        showMade(p.name, r.data.link);
        void drawList();
      });
    });
    end.addEventListener("click", () => {
      busy(end, true);
      void commands.localServerAccountEndSessions(p.id).then((r) => {
        busy(end, false);
        if (r.status !== "ok") {
          say(whyOf(r.error));
          return void drawList();
        }
        say(w.ended(p.name));
        void drawList().then(() => title.focus());
      });
    });
    remove.addEventListener("click", () =>
      ask(p, remove, () => {
        busy(remove, true);
        void commands.localServerAccountRemove(p.id).then((r) => {
          busy(remove, false);
          if (r.status !== "ok") {
            say(whyOf(r.error));
            return void drawList();
          }
          say(w.removed(p.name));
          void drawList().then(() => title.focus());
        });
      }),
    );
    actions.append(reset, end, remove);
    li.append(who, actions);
    return li;
  };

  /** The list as the server has it now. */
  const drawList = async () => {
    const r = await commands.localServerAccounts();
    if (r.status !== "ok") return say(whyOf(r.error));
    list.replaceChildren();
    if (r.data.length === 0) list.append(h("li", "ls-help", w.none));
    for (const p of r.data) list.append(row(p));
  };

  const draw = async (s: LocalServerStatus) => {
    // A link of a server that stopped would open nothing at that address.
    if (!s.serving) made.hidden = true;
    // A row asking "Remover?" is not replaced under the person.
    if (list.querySelector(".ls-confirm")) return;
    await drawList();
  };
  return { el, draw };
}
