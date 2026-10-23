// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table chip beside the folder's name (ADR 0110, "As built (chrome feedback, 2026-10-23)"; maintainer,
// 2026-10-23: "Como eu estou com a raiz de uma mesa aberta no verso, como
// que o dono da pasta vai conseguir ver as configurações da pasta? E como
// que os jogadores veem do lado deles?"). When the folder on screen is a
// table, its owner has a "Mesa" button there that opens the table's window
// (no right-click on the tree's background to find), and a player has a
// read-only "Mesa · jogador" chip whose popover says in two lines what they
// can do — and lists the notes granted to them, as links. No settings for a
// player.

import { campaign, mayEditGranted } from "./campaign";
import { openCampaignDialog } from "./campaignDialog";
import { cp } from "./campaignStrings";
import { h, ui } from "./dom";
import { icon } from "./icons";
import { openNote } from "./layout/spaces";
import { name } from "./paths";

let chip: HTMLButtonElement | null = null;
let pop: HTMLElement | null = null;

function closePop(): void {
  pop?.remove();
  pop = null;
  chip?.setAttribute("aria-expanded", "false");
}

/** The notes granted to the player, as the window knows them. */
function granted(): string[] {
  return campaign()
    .notes.map((n) => n.path)
    .filter((p) => mayEditGranted(p))
    .sort((a, b) => a.localeCompare(b));
}

function openPop(): void {
  if (!chip) return;
  closePop();
  const box = h("div", "table-chip-pop");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", cp.chipPlayer);
  box.append(h("p", "table-chip-line", cp.chipReads), h("p", "table-chip-line", granted().length ? cp.chipEdits : cp.chipEditsNone));
  const list = h("ul", "table-chip-notes");
  for (const path of granted()) {
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
  document.body.append(box);
  pop = box;
  const r = chip.getBoundingClientRect();
  const w = Math.min(300, innerWidth - 24);
  box.style.width = `${w}px`;
  box.style.left = `${Math.max(12, Math.min(r.left, innerWidth - w - 12))}px`;
  box.style.top = `${r.bottom + 6}px`;
  chip.setAttribute("aria-expanded", "true");
  box.querySelector<HTMLElement>("button")?.focus();
}

function paint(): void {
  if (!chip) return;
  const s = campaign();
  const whole = s.tables.some((t) => t.root === "");
  const show = whole && (s.viewer === "owner" || s.viewer === "player") && !ui.search.disabled;
  chip.hidden = !show;
  if (!show) {
    closePop();
    return;
  }
  const owner = s.viewer === "owner";
  chip.dataset["viewer"] = s.viewer;
  chip.replaceChildren(icon("dice"), h("span", "table-chip-text", owner ? cp.chipOwner : cp.chipPlayer));
  chip.setAttribute("aria-label", owner ? cp.chipOwnerName : cp.chipPlayerName);
  chip.title = owner ? cp.chipOwnerName : cp.chipPlayerName;
  chip.setAttribute("aria-haspopup", "dialog");
  if (owner) chip.removeAttribute("aria-expanded");
  else chip.setAttribute("aria-expanded", String(pop !== null));
}

/** Put the chip beside the folder's name and keep it in step with the table. */
export function installTableChip(): void {
  if (chip) return;
  chip = h("button", "table-chip");
  chip.type = "button";
  chip.hidden = true;
  chip.addEventListener("click", () => {
    if (campaign().viewer === "owner") openCampaignDialog("");
    else if (pop) closePop();
    else openPop();
  });
  ui.open.after(chip);
  addEventListener("verso:campaign-status", paint);
  addEventListener("verso:folder-shown", paint);
  new MutationObserver(paint).observe(ui.search, { attributes: true, attributeFilter: ["disabled"] });
  document.addEventListener("pointerdown", (e) => {
    if (pop && !pop.contains(e.target as Node) && !chip?.contains(e.target as Node)) closePop();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) {
      closePop();
      chip?.focus();
    }
  });
  paint();
}
