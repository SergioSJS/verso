// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The parts a table's controls are built from (ADR 0110, 2026-10-23): the
// "Mesa aberta" switch with its status pill, the invitation link with its
// Copy button, the notes' counts with "release everything" / "hide
// everything", the players with what is granted to them. The table's window
// (campaignDialog.ts) and the table card of the folder's page
// (tableCard.ts) are made of the same parts, so they look and behave alike.
// Each part follows the server's status by itself and stops following when
// it leaves the page.

import { commands, type CampaignPlayer, type CampaignTable, type ContractError } from "./bindings";
import { serverLink } from "./can";
import { hostedAt } from "./hostedAt";
import { campaign, noteAudience, releaseAll, releaseNotes, setTable, tableFor } from "./campaign";
import { cp } from "./campaignStrings";
import { h, ui } from "./dom";
import { allNotes } from "./folder";
import { openNote } from "./layout/spaces";
import { name } from "./paths";
import { LOCALE } from "./strings";
import { withServerProof } from "./serverProof";
import { proverHere } from "./serverProver";
import { isServerTable } from "./table/model";
import { tableSource } from "./table/record";

/** An invitation is a sensitive action: the person is asked on the spot,
 *  by the desktop's dialog or the browser's own (ADR 0083 item 6). The
 *  invitation goes over the WebSocket, which the page's `api` does not
 *  cover (2026-10-23: a browser's game master met "nothing was generated"
 *  with no way to confirm). */
function proved<T>(call: () => Promise<{ status: "ok"; data: T } | { status: "error"; error: ContractError }>) {
  return withServerProof(call, proverHere());
}

/** The table at `root`, as the window last heard it. */
export function tableAt(root: string): CampaignTable | undefined {
  return campaign().tables.find((t) => t.root === root) ?? tableFor(root);
}

/** Call `paint` now and at every news of the tables, until `el` has been on
 *  the page and left it. */
export function follow(el: HTMLElement, paint: () => void): void {
  let seen = false;
  const again = () => {
    if (el.isConnected) seen = true;
    else if (seen) return void removeEventListener("verso:campaign-status", again);
    paint();
  };
  addEventListener("verso:campaign-status", again);
  paint();
}

export const under = (root: string, path: string): boolean => root === "" || path === root || path.startsWith(`${root}/`);

/** The notes of the table at `root` and how many the players can read. */
export function noteCounts(root: string): { released: number; hidden: number } {
  const mine = allNotes.filter((p) => under(root, p));
  const released = mine.filter((p) => noteAudience(p).kind !== "hidden").length;
  return { released, hidden: mine.length - released };
}

/** "Aberta" / "Fechada", the table's state at a glance. */
export function statusPill(open: boolean): HTMLElement {
  const pill = h("span", `cd-pill ${open ? "is-open" : "is-closed"}`, open ? cp.statusOpen : cp.statusClosed);
  return pill;
}

/** Ask first, in place: the buttons become the question. A destructive
 *  answer is red; any other, the ordinary primary. */
export function askFirst(where: HTMLElement, question: string, yes: () => Promise<void>, destructive = false): void {
  const box = h("div", "share-ask");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", question);
  const q = h("p", "share-ask-text", question);
  const ok = h("button", destructive ? "btn destructive solid" : "btn primary", cp.yes);
  ok.type = "button";
  const no = h("button", "btn quiet", cp.cancel);
  no.type = "button";
  const back = Array.from(where.childNodes);
  no.addEventListener("click", () => where.replaceChildren(...back));
  ok.addEventListener("click", () => void yes());
  box.append(q, ok, no);
  where.replaceChildren(box);
  ok.focus();
}

/** A short word beside a control that fades: the answer to what was just
 *  done, read by a screen reader and kept for two seconds. */
export function feedback(): { el: HTMLElement; say: (text: string, bad?: boolean) => void } {
  const el = h("span", "cd-feedback");
  el.setAttribute("role", "status");
  let timer = 0;
  return {
    el,
    say(text, bad = false) {
      window.clearTimeout(timer);
      el.textContent = text;
      el.classList.toggle("is-bad", bad);
      if (text && !bad) timer = window.setTimeout(() => (el.textContent = ""), 2200);
    },
  };
}

/** "Mesa aberta": the switch that saves at once, its status pill and what
 *  it means. Closed, the players wait outside and enter by themselves when
 *  it opens. */
export function openSwitch(root: string, id: string): HTMLElement {
  const row = h("div", "cd-open");
  const text = h("div", "cd-open-text");
  const label = h("label", "cd-open-label", cp.open);
  label.htmlFor = id;
  const pillBox = h("span", "cd-pill-box");
  const head = h("div", "cd-open-head");
  head.append(label, pillBox);
  const hint = h("p", "cd-hint");
  hint.id = `${id}-hint`;
  text.append(head, hint);
  const sw = h("label", "switch big");
  const box = h("input");
  box.type = "checkbox";
  box.id = id;
  box.setAttribute("role", "switch");
  box.setAttribute("aria-describedby", hint.id);
  sw.append(box, h("span", "switch-track"));
  const fb = feedback();
  row.append(text, sw, fb.el);
  box.addEventListener("change", () => {
    const want = box.checked;
    box.disabled = true;
    paint(want);
    void setTable(root, { open: want }, want ? cp.tableOpened : cp.tableClosedNow).then((ok) => {
      box.disabled = false;
      if (!ok) {
        paint(!want);
        fb.say(ui.status.textContent || cp.failed, true);
        return;
      }
      fb.say(want ? cp.tableOpened : cp.tableClosedNow);
    });
  });
  function paint(open: boolean): void {
    box.checked = open;
    box.setAttribute("aria-checked", String(open));
    pillBox.replaceChildren(statusPill(open));
    hint.textContent = open ? cp.openHintOn : cp.openHintOff;
    row.classList.toggle("is-closed", !open);
  }
  follow(row, () => {
    if (!box.disabled) paint(tableAt(root)?.open ?? true);
  });
  return row;
}

/** The invitation: "Gerar link", then the link in a field with a Copy
 *  button and the day it stops working. */
export function inviteBlock(root: string): HTMLElement {
  const box = h("div", "cd-invite");
  // Where the table is hosted, before its link is made (hostedAt.ts).
  const hosted = h("p", "cd-hint cd-hosted");
  hosted.hidden = true;
  void hostedAt().then((line) => {
    hosted.textContent = line ?? "";
    hosted.hidden = line === null;
  });
  const hint = h("p", "cd-hint");
  const make = h("button", "btn", cp.inviteMake);
  make.type = "button";
  const made = h("div", "cd-made");
  made.hidden = true;
  const fb = feedback();
  make.addEventListener("click", () => {
    void proved(() => commands.campaignInvite(root)).then(async (r) => {
      if (r.status !== "ok") {
        // A game master's invitations waiting, at most (ADR 0117 D7 (e)).
        const many = /(\d+) invitations of yours are waiting/i.exec(r.error.message);
        fb.say(r.error.kind === "prove_first" ? cp.proveFirst : many ? cp.inviteTooMany(Number(many[1])) : r.error.message, true);
        return;
      }
      fb.say("");
      const link = await serverLink(r.data.link);
      const field = h("input");
      field.readOnly = true;
      field.value = link;
      field.setAttribute("aria-label", cp.inviteField);
      const copy = h("button", "btn", cp.copy);
      copy.type = "button";
      copy.setAttribute("aria-label", cp.inviteCopy);
      copy.addEventListener("click", () => {
        void navigator.clipboard.writeText(link).then(() => {
          copy.textContent = cp.copied;
          fb.say(cp.inviteCopied);
          window.setTimeout(() => (copy.textContent = cp.copy), 1800);
        });
      });
      const line = h("div", "cd-link");
      line.append(field, copy);
      const when = new Date(r.data.expires * 1000).toLocaleDateString(LOCALE, { day: "numeric", month: "long" });
      made.replaceChildren(line, h("p", "cd-hint", cp.inviteExpires(when)));
      made.hidden = false;
      field.select();
    });
  });
  follow(box, () => {
    const can = campaign().can_invite;
    make.disabled = !can;
    hint.textContent = can ? cp.inviteHint : `${cp.inviteHint} ${cp.inviteNeedsAdmin}`;
  });
  const row = h("div", "cd-row");
  row.append(make, fb.el);
  box.append(hosted, hint, row, made);
  return box;
}

/** The notes' counts and the two bulk buttons. */
export function notesBlock(root: string): HTMLElement {
  const box = h("div", "cd-notes");
  const count = h("p", "cd-hint cd-notes-count");
  const actions = h("div", "cd-row");
  const fb = feedback();
  const buttons = (): HTMLElement[] => {
    const release = h("button", "btn", cp.releaseAll);
    release.type = "button";
    release.addEventListener("click", () =>
      askFirst(actions, cp.releaseAllConfirm, async () => {
        const ok = await releaseAll(root);
        actions.replaceChildren(...buttons());
        fb.say(ok ? cp.releasedAll : (ui.status.textContent ?? ""), !ok);
      }),
    );
    const hide = h("button", "btn", cp.hideAll);
    hide.type = "button";
    hide.addEventListener("click", () =>
      askFirst(actions, cp.hideAllConfirm, async () => {
        const ok = await releaseNotes([root], false);
        actions.replaceChildren(...buttons());
        fb.say(ok ? cp.hiddenAll : (ui.status.textContent ?? ""), !ok);
      }),
    );
    return [release, hide, fb.el];
  };
  actions.append(...buttons());
  box.append(count, actions);
  follow(box, () => {
    const n = noteCounts(root);
    count.textContent = cp.notesCount(n.released, n.hidden);
  });
  return box;
}

/** A note named as a link that opens it. */
export function noteLink(path: string, after?: () => void): HTMLElement {
  const a = h("button", "cd-note-link", name(path).replace(/\.(md|canvas|base)$/i, ""));
  a.type = "button";
  a.title = path;
  a.addEventListener("click", () => {
    after?.();
    openNote(path, false);
  });
  return a;
}

/** The accounts at the table now, when the window is at that table. */
export function onlineIds(root: string): Set<string> {
  const src = tableSource();
  if (!isServerTable(src) || src.table !== root) return new Set();
  return new Set(src.roster().map((m) => m.byId));
}

/** A colour from a name, so the same person is the same colour everywhere. */
export function hueOf(text: string): number {
  let n = 0;
  for (const c of text) n = (n * 31 + c.codePointAt(0)!) % 360;
  return n;
}
