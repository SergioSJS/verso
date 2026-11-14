// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's window, about its other server (ADR 0117 D8, R9): a folder
// of this computer served from here that also syncs with a UniVerso has
// two hosts, and a table lives on one. To the game master, while the other
// host exists, *Move this table to …*, asked first; done, the window goes
// to the new host and opens the table's window there, whose invitation
// card is the next step. On a table that moved, what that means here (its
// players are told; its chat, rolls and rights stay until it is undone)
// and a way to the new host.

import { commands, type TableHost } from "./bindings";
import { campaign } from "./campaign";
import { askFirst, feedback, follow } from "./campaignParts";
import { cp } from "./campaignStrings";
import { h, ui } from "./dom";
import { told } from "./errors";
import { arrived, hostName, moveOffer, tableGo } from "./tableMove";
import { tm } from "./tableMoveStrings";

/** Wait until the window shows the table at `root` on its new host, a while
 *  at most: whether it does. */
function whenArrived(root: string, within = 20_000): Promise<boolean> {
  return new Promise((done) => {
    const check = () => {
      if (!arrived(campaign().tables, root)) return;
      finish(true);
    };
    const timer = window.setTimeout(() => finish(false), within);
    function finish(ok: boolean): void {
      window.clearTimeout(timer);
      removeEventListener("verso:campaign-status", check);
      done(ok);
    }
    addEventListener("verso:campaign-status", check);
  });
}

/** Go to `host`, the table's new one, and open the table's window there
 *  (`reopen`). `moved`: the move was just made, and is said. */
async function goThere(host: TableHost, root: string, reopen: (root: string) => void, moved: boolean): Promise<void> {
  const name = hostName(host, tm);
  const go = tableGo();
  const ok = go ? await go(host) : false;
  if (!ok) {
    if (moved) ui.status.textContent = tm.movedGoFailed(name);
    return;
  }
  if (moved) ui.status.textContent = tm.movedThere(name);
  if (await whenArrived(root)) {
    if (moved) ui.status.textContent = tm.movedThere(name);
    reopen(root);
  }
}

/** The card, hidden while the table has no other server. `close` closes
 *  the table's window; `reopen` opens it again, for the table at the new
 *  host. */
export function moveCard(root: string, close: () => void, reopen: (root: string) => void): HTMLElement {
  const sec = h("section", "cd-card cd-move");
  sec.setAttribute("aria-labelledby", "cd-move-title");
  sec.hidden = true;
  let host: TableHost | null = null;
  // Drawn again only when what it offers changes: a question being asked
  // stays while the table's news comes in.
  let drawn = "";
  const paint = () => {
    const table = campaign().tables.find((t) => t.root === root);
    const offer = moveOffer(table, host, campaign().viewer);
    const name = hostName(offer.kind === "none" ? null : offer.to, tm);
    const now = `${offer.kind}:${name}`;
    if (now === drawn) return;
    drawn = now;
    sec.hidden = offer.kind === "none";
    if (offer.kind === "none") return sec.replaceChildren();
    const title = h("h3", "cd-card-title", offer.kind === "move" ? tm.moveTitle : tm.movedTitle);
    title.id = "cd-move-title";
    const actions = h("div", "cd-row");
    const fb = feedback();
    if (offer.kind === "move") {
      const to = offer.to;
      const btn = h("button", "btn", tm.moveButton(name));
      btn.type = "button";
      const move = async () => {
        fb.say(tm.moving);
        const r = await commands.localServerMoveTable(root);
        if (r.status !== "ok") {
          told(r.error.kind, r.error.message, r.error);
          actions.replaceChildren(btn);
          fb.say(`${cp.failed}: ${r.error.message}`, true);
          return;
        }
        close();
        await goThere(r.data ?? to, root, reopen, true);
      };
      btn.addEventListener("click", () => askFirst(actions, tm.moveConfirm(name), move));
      actions.append(btn);
      sec.replaceChildren(title, h("p", "cd-hint", tm.moveHint(name)), actions, fb.el);
      return;
    }
    const to = offer.to;
    if (to && tableGo()) {
      const btn = h("button", "btn", tm.movedGo(name));
      btn.type = "button";
      btn.addEventListener("click", () => {
        close();
        void goThere(to, root, reopen, false);
      });
      actions.append(btn);
    }
    sec.replaceChildren(title, h("p", "", tm.movedBody(name)), h("p", "cd-hint", tm.movedUndoWarn), actions, fb.el);
  };
  // The other host is the desktop's to say: a browser has none.
  if (tableGo()) {
    void commands.localServerTableHost().then((r) => {
      host = r.status === "ok" ? r.data : null;
      paint();
    });
  }
  follow(sec, paint);
  return sec;
}
