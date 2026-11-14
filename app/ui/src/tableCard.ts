// The table strip of a folder's page (ADR 0110, 2026-10-23; as approved in
// the mockup of 2026-10-25): under the folder's title, one line between two
// hairlines, no box.
//  - a folder that is a table, to its owner: "MESA ● Aberta · 2 jogadores ·
//    3 online" with Acesso… (the folder's Access dialog), Convidar, Abrir a
//    Mesa and the gear (the table's settings, where "Mesa aberta" is the
//    switch); under it, how many notes the players see and how many are the
//    game master's alone;
//  - to a player: "MESA ● Aberta · 3 online" and Entrar na Mesa;
//  - a folder of a server (or synced with one) that is not a table, to its
//    owner: the same strip, with one call to action;
//  - anything else, nothing.
// The parts are the table window's (campaignParts.ts).

import { openAccess } from "./accessDialog";
import { tableViewer } from "./access";
import { campaign, isTableRoot, makeTable, tableFor } from "./campaign";
import { openCampaignDialog } from "./campaignDialog";
import { follow, inviteBlock, noteCounts, onlineIds } from "./campaignParts";
import { cp } from "./campaignStrings";
import { h } from "./dom";
import { icon } from "./icons";
import { mayShare } from "./shares";
import { showTable } from "./table/show";
import { copyLinkButton, servedFromHere, stopServingButton } from "./serveHere";
import { isSeated } from "./seatState";

/** The card for the folder at `path`, or null when the page has none. */
export function tableCard(path: string): HTMLElement | null {
  const viewer = tableViewer();
  if (isTableRoot(path)) {
    if (viewer === "owner") return ownerCard(path);
    if (viewer === "player") return playerCard(path);
    return null;
  }
  // Not inside another table, and the folder's owner: a way to make one.
  if (mayShare() && !tableFor(path) && viewer !== "player") return makeCard(path);
  return null;
}

/** On the root of a folder this computer serves: *Stop serving* beside
 *  the owner's actions (ADR 0117 D2, R4). */
function withStop(path: string, actions: HTMLElement): void {
  if (path === "" && servedFromHere()) actions.append(stopServingButton());
}

function button(cls: string, label: string): HTMLButtonElement {
  const b = h("button", cls, label);
  b.type = "button";
  return b;
}

/** "Aberta" / "Fechada" with a dot: the word says it, the colour only helps. */
function state(open: boolean): HTMLElement {
  return h("span", `table-strip-state ${open ? "is-open" : "is-closed"}`, open ? cp.statusOpen : cp.statusClosed);
}

function strip(kind: string, label: string): { box: HTMLElement; line: HTMLElement; meta: HTMLElement; actions: HTMLElement } {
  const box = h("section", `table-card table-card-${kind}`);
  box.setAttribute("aria-label", label);
  const line = h("div", "table-strip");
  const meta = h("span", "table-strip-meta");
  const actions = h("span", "table-strip-actions");
  line.append(h("span", "table-strip-title", cp.tableMark), meta, actions);
  box.append(line);
  return { box, line, meta, actions };
}

function makeCard(path: string): HTMLElement {
  const { box, meta, actions } = strip("make", cp.tableMark);
  meta.textContent = cp.cardMakeWhy;
  const b = button("btn primary", cp.makeTable);
  b.prepend(icon("dice"));
  b.addEventListener("click", () => void makeTable(path));
  actions.append(b);
  withStop(path, actions);
  return box;
}

function playerCard(path: string): HTMLElement {
  const { box, line, meta, actions } = strip("player", cp.cardPlayerLine);
  const enter = button("btn primary", cp.cardEnter);
  enter.addEventListener("click", () => showTable());
  actions.append(enter);
  const st = h("span", "table-strip-st");
  line.insertBefore(st, meta);
  follow(box, () => {
    const open = campaign().tables.find((t) => t.root === path)?.open ?? true;
    st.replaceChildren(state(open));
    const on = onlineIds(path).size;
    meta.textContent = on ? `· ${cp.cardOnline(on)}` : "";
    enter.hidden = !open;
    box.title = open ? "" : cp.cardPlayerClosed;
  });
  return box;
}

function ownerCard(path: string): HTMLElement {
  const { box, line, meta, actions } = strip("owner", cp.tableMark);
  const st = h("span", "table-strip-st");
  line.insertBefore(st, meta);
  const access = button("btn", cp.cardAccess);
  access.addEventListener("click", () => void openAccess([path], access));
  const invite = button("btn", cp.cardInvite);
  invite.setAttribute("aria-expanded", "false");
  const enter = button("btn primary", cp.cardEnterOwner);
  enter.addEventListener("click", () => showTable());
  const gear = h("button", "table-strip-gear");
  gear.type = "button";
  gear.append(icon("gear"));
  gear.setAttribute("aria-label", cp.cardSettings);
  gear.title = cp.cardSettings;
  gear.addEventListener("click", () => openCampaignDialog(path));
  actions.append(access, invite, enter, gear);
  // A table this computer hosts: its link to copy (ADR 0117 D6, R4).
  if (isSeated()) actions.insertBefore(copyLinkButton(path), gear);
  withStop(path, actions);
  const counts = h("p", "table-strip-counts");
  const panel = h("div", "table-strip-invite");
  panel.hidden = true;
  panel.append(inviteBlock(path));
  invite.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    invite.setAttribute("aria-expanded", String(!panel.hidden));
  });
  box.append(counts, panel);
  follow(box, () => {
    const n = campaign().players.length;
    const on = onlineIds(path).size;
    const t = campaign().tables.find((x) => x.root === path);
    st.replaceChildren(state(t?.open !== false));
    meta.textContent = ["", cp.cardPlayers(n), ...(on ? [cp.cardOnline(on)] : [])].join(" · ").replace(/^ · /, "· ");
    const c = noteCounts(path);
    counts.replaceChildren(h("b", "", String(c.released)), ` ${cp.cardVisibleTail} · `, h("b", "", String(c.hidden)), ` ${cp.cardMasterTail}`);
  });
  return box;
}
