// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table card of a folder's page (ADR 0110, 2026-10-23; the maintainer:
// "nessa tela aqui, da pasta, deveriam ter informações da mesa ... ativar
// ou não a mesa, configurações e tal"). Under the folder's title:
//  - a folder that is a table, to its owner: the "Mesa aberta" switch, the
//    players, an invitation, the notes' counts and the way to the whole
//    window; compact, and folded away per folder when the owner wants;
//  - to a player: one read-only line, open or closed, and the notes
//    granted to them as links;
//  - a folder of a server (or synced with one) that is not a table, to
//    its owner: one call to action;
//  - anything else, nothing.
// The parts are the table window's (campaignParts.ts).

import { campaign, isTableRoot, makeTable, tableFor } from "./campaign";
import { openCampaignDialog } from "./campaignDialog";
import { follow, inviteBlock, noteLink, notesBlock, onlineIds, openSwitch } from "./campaignParts";
import { cp } from "./campaignStrings";
import { h } from "./dom";
import { icon } from "./icons";
import { mayShare } from "./shares";

const KEY = "verso.tableCard.folded";

function folded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function fold(path: string, on: boolean): void {
  const all = folded();
  if (on) all.add(path);
  else all.delete(path);
  try {
    localStorage.setItem(KEY, JSON.stringify([...all]));
  } catch {
    // No storage: folded for this page only.
  }
}

/** The card for the folder at `path`, or null when the page has none. */
export function tableCard(path: string): HTMLElement | null {
  const viewer = campaign().viewer;
  if (isTableRoot(path)) {
    if (viewer === "owner") return ownerCard(path);
    if (viewer === "player") return playerCard(path);
    return null;
  }
  // Not inside another table, and the folder's owner: a way to make one.
  if (mayShare() && !tableFor(path) && viewer !== "player") return makeCard(path);
  return null;
}

function makeCard(path: string): HTMLElement {
  const box = h("section", "table-card table-card-make");
  box.setAttribute("aria-label", cp.tableMark);
  const b = h("button", "btn", cp.makeTable);
  b.type = "button";
  b.prepend(icon("dice"));
  b.addEventListener("click", () => void makeTable(path));
  box.append(h("p", "cd-hint", cp.cardMakeWhy), b);
  return box;
}

function playerCard(path: string): HTMLElement {
  const box = h("section", "table-card table-card-player");
  box.setAttribute("aria-label", cp.cardPlayerLine);
  const head = h("div", "table-card-head");
  const line = h("span", "table-card-state");
  head.append(icon("dice"), h("strong", "", cp.cardPlayerLine), line);
  const mine = h("p", "cd-hint");
  const links = h("div", "table-card-links");
  box.append(head, mine, links);
  follow(box, () => {
    const open = campaign().tables.find((t) => t.root === path)?.open ?? true;
    line.textContent = open ? cp.cardPlayerOpen : cp.cardPlayerClosed;
    const granted = campaign()
      .notes.filter((n) => (path === "" || n.path.startsWith(`${path}/`)) && n.grant.kind !== "none")
      .map((n) => n.path)
      .sort((a, b) => a.localeCompare(b));
    mine.textContent = granted.length ? cp.chipEdits : cp.cardNoGrants;
    links.replaceChildren(...granted.map((g) => noteLink(g)));
  });
  return box;
}

function ownerCard(path: string): HTMLElement {
  const box = h("section", "table-card table-card-owner");
  box.setAttribute("aria-label", cp.tableMark);
  const head = h("div", "table-card-head");
  const toggle = h("button", "ghost table-card-fold");
  toggle.type = "button";
  const title = h("strong", "", cp.tableMark);
  const summary = h("span", "table-card-summary");
  const settings = h("button", "btn quiet table-card-settings", cp.cardSettings);
  settings.type = "button";
  settings.addEventListener("click", () => openCampaignDialog(path));
  head.append(toggle, title, summary, settings);
  const body = h("div", "table-card-body");
  const invite = h("details", "table-card-invite");
  invite.append(h("summary", "btn", cp.cardInvite), inviteBlock(path));
  body.append(openSwitch(path, `card-open-${path || "root"}`), notesBlock(path), invite);
  const paintFold = () => {
    const shut = folded().has(path);
    body.hidden = shut;
    toggle.replaceChildren(icon(shut ? "chevron" : "chevronDown"));
    toggle.setAttribute("aria-expanded", String(!shut));
    toggle.setAttribute("aria-label", shut ? cp.cardExpand : cp.cardCollapse);
    toggle.title = toggle.getAttribute("aria-label") ?? "";
  };
  toggle.addEventListener("click", () => {
    fold(path, !folded().has(path));
    paintFold();
  });
  paintFold();
  box.append(head, body);
  follow(box, () => {
    const n = campaign().players.length;
    const on = onlineIds(path).size;
    const t = campaign().tables.find((x) => x.root === path);
    summary.textContent = [t?.open === false ? cp.statusClosed : cp.statusOpen, cp.cardPlayers(n), ...(on ? [cp.cardOnline(on)] : [])].join(" · ");
  });
  return box;
}
