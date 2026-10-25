// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table chip beside the folder's name, and the badge of a table's row in
// the tree (ADR 0110, "As built (chrome feedback, 2026-10-23)"; maintainer,
// 2026-10-23: "Como eu estou com a raiz de uma mesa aberta no verso, como
// que o dono da pasta vai conseguir ver as configurações da pasta? E como
// que os jogadores veem do lado deles?"). When the folder on screen is a
// table, its owner has a "Mesa" button there that opens the table's window
// (no right-click on the tree's background to find), and a player has a
// read-only "Mesa · jogador" chip whose popover says in two lines what they
// can do — and lists the notes granted to them, as links. No settings for a
// player.

import { onAccess, tableViewer } from "./access";
import { campaign, tableFor } from "./campaign";
import { openCampaignDialog } from "./campaignDialog";
import { cp } from "./campaignStrings";
import { h, ui } from "./dom";
import { folderName } from "./folder";
import { icon } from "./icons";
import { layout, openNote } from "./layout/spaces";
import { name } from "./paths";

// The maintainer, 2026-10-23, on the first version (root only): "ERRADO,
// posso ter N mesas numa mesma pasta". An open folder holds any number of
// tables, each a folder. Every table's row in the tree has a badge; the chip
// beside the folder's name follows the active note: the nearest table up its
// path, or the root's, or "Mesas (N)" listing them.

let chip: HTMLButtonElement | null = null;
let pop: HTMLElement | null = null;
let popFor: HTMLElement | null = null;

const under = (root: string, path: string): boolean => root === "" || path === root || path.startsWith(`${root}/`);
const tableName = (root: string): string => (root === "" ? folderName : name(root));

function closePop(): void {
  pop?.remove();
  pop = null;
  popFor?.setAttribute("aria-expanded", "false");
  popFor = null;
}

/** The notes of the table at `root` granted to the player. */
function granted(root: string): string[] {
  return campaign()
    .notes.map((n) => n.path)
    .filter((p) => under(root, p))
    .sort((a, b) => a.localeCompare(b));
}

function place(box: HTMLElement, anchor: HTMLElement): void {
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(300, innerWidth - 24);
  box.style.width = `${w}px`;
  box.style.left = `${Math.max(12, Math.min(r.left, innerWidth - w - 12))}px`;
  box.style.top = `${r.bottom + 6}px`;
  pop = box;
  popFor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  box.querySelector<HTMLElement>("button")?.focus();
}

/** What a player can do at the table at `root`, in two lines, and its granted notes as links. */
function playerPop(root: string, anchor: HTMLElement): void {
  closePop();
  const box = h("div", "table-chip-pop");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", cp.chipPlayerNamed(tableName(root)));
  const mine = granted(root);
  box.append(h("p", "table-chip-line", cp.chipReads), h("p", "table-chip-line", mine.length ? cp.chipEdits : cp.chipEditsNone));
  const list = h("ul", "table-chip-notes");
  for (const path of mine) {
    const a = h("button", "table-chip-link", name(path).replace(/\.(md|canvas|base)$/i, ""));
    a.type = "button";
    a.title = path;
    a.addEventListener("click", () => {
      closePop();
      openNote(path, false);
    });
    const li = h("li");
    li.append(a);
    list.append(li);
  }
  if (list.childElementCount) box.append(list);
  place(box, anchor);
}

/** The owner opens the table's window; a player, its popover. */
function activate(root: string, anchor: HTMLElement): void {
  if (tableViewer() === "owner") {
    closePop();
    openCampaignDialog(root);
  } else if (pop && popFor === anchor) closePop();
  else playerPop(root, anchor);
}

/** "Mesas (N)": each table, one row; the owner's opens its window, a player's its popover. */
function manyPop(anchor: HTMLElement): void {
  closePop();
  const box = h("div", "table-chip-pop");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", cp.chipManyName);
  const list = h("ul", "table-chip-notes");
  for (const t of campaign().tables) {
    const a = h("button", "table-chip-link", tableName(t.root));
    a.type = "button";
    a.title = t.root || "/";
    a.setAttribute("aria-label", tableViewer() === "owner" ? cp.badgeOwner(tableName(t.root)) : cp.badgePlayer(tableName(t.root)));
    a.addEventListener("click", () => {
      closePop();
      if (tableViewer() === "owner") openCampaignDialog(t.root);
      else playerPop(t.root, anchor);
    });
    const li = h("li");
    li.append(a);
    list.append(li);
  }
  box.append(list);
  place(box, anchor);
}

/** The badge of a table's row in the tree: "Mesa", a button. */
export function tableBadge(root: string): HTMLElement {
  const owner = tableViewer() === "owner";
  const b = h("button", "campaign-mark table-mark table-badge");
  b.type = "button";
  b.dataset["table"] = root;
  const label = owner ? cp.badgeOwner(tableName(root)) : cp.badgePlayer(tableName(root));
  b.setAttribute("aria-label", label);
  b.title = label;
  if (!owner) b.setAttribute("aria-haspopup", "dialog");
  const shut = owner && campaign().tables.find((t) => t.root === root)?.open === false;
  b.classList.toggle("is-closed", shut);
  b.append(icon("dice"), h("span", "table-badge-text", shut ? `${cp.tableMark} (${cp.closedTag})` : cp.tableMark));
  // Inside a folder's summary: neither the row's toggle nor its selection takes it.
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activate(root, b);
  });
  b.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  });
  return b;
}

/** The table the chip speaks of: the active note's nearest, else the root's. */
function context(): { root: string } | null {
  const path = layout().activeLeaf?.path ?? "";
  const t = path ? tableFor(path) : tableFor("");
  return t ? { root: t.root } : null;
}

function paint(): void {
  if (!chip) return;
  const s = campaign();
  const show = s.tables.length > 0 && tableViewer() !== null && !ui.search.disabled;
  chip.hidden = !show;
  if (!show) {
    closePop();
    return;
  }
  const owner = tableViewer() === "owner";
  const ctx = context();
  chip.dataset["viewer"] = owner ? "owner" : "player";
  chip.dataset["table"] = ctx ? ctx.root : "*";
  let text: string;
  let label: string;
  if (ctx) {
    const n = tableName(ctx.root);
    // A closed table says so on the game master's chip: players are waiting outside.
    const shut = owner && s.tables.find((t) => t.root === ctx.root)?.open === false;
    text = owner ? (shut ? cp.chipOwnerClosed(n) : cp.chipOwnerText(n)) : cp.chipPlayer;
    label = owner ? cp.chipOwnerNamed(n) : cp.chipPlayerNamed(n);
    chip.classList.toggle("is-closed", shut);
  } else {
    text = cp.chipMany(s.tables.length);
    chip.classList.toggle("is-closed", owner && s.tables.some((t) => !t.open));
    label = cp.chipManyName;
  }
  chip.replaceChildren(icon("dice"), h("span", "table-chip-text", text));
  chip.setAttribute("aria-label", label);
  chip.title = label;
  chip.setAttribute("aria-haspopup", "dialog");
  if (owner && ctx) chip.removeAttribute("aria-expanded");
  else chip.setAttribute("aria-expanded", String(pop !== null && popFor === chip));
}

/** Put the chip beside the folder's name and keep it in step with the tables and the active note. */
export function installTableChip(): void {
  if (chip) return;
  chip = h("button", "table-chip");
  chip.type = "button";
  chip.hidden = true;
  chip.addEventListener("click", () => {
    const ctx = context();
    if (!chip) return;
    if (!ctx) {
      if (pop && popFor === chip) closePop();
      else manyPop(chip);
    } else activate(ctx.root, chip);
  });
  ui.open.after(chip);
  addEventListener("verso:campaign-status", paint);
  addEventListener("verso:folder-shown", paint);
  document.addEventListener("verso:nav", paint);
  new MutationObserver(paint).observe(ui.search, { attributes: true, attributeFilter: ["disabled"] });
  document.addEventListener("pointerdown", (e) => {
    if (pop && !pop.contains(e.target as Node) && !popFor?.contains(e.target as Node)) closePop();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) {
      const back = popFor;
      closePop();
      back?.focus();
    }
  });
  onAccess(paint);
  paint();
}
