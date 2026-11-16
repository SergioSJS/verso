// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's window (ADR 0110, redesigned 2026-10-23): the "Mesa aberta"
// switch with its status pill, cards for the invitation, the players, the
// notes and (folded under "Avançado") the limits, and "Desfazer mesa" as a
// quiet red action at the bottom. A change is saved at once and answered
// beside the control; a question that cannot be taken back is asked first.
// The parts are the table card's of the folder's page (campaignParts.ts).

import { campaign, setTable, undoTable } from "./campaign";
import { cp } from "./campaignStrings";
import { askFirst, feedback, follow, inviteBlock, notesBlock, openSwitch, tableAt } from "./campaignParts";
import { playersBlock } from "./campaignPlayers";
import { asDialog, closed, opened } from "./dialogs/a11y";
import { h, ui } from "./dom";
import { folderName } from "./folder";
import { name } from "./paths";
import { moveCard } from "./tableMoveCard";
import { tm } from "./tableMoveStrings";
import { rejoinedText } from "./tableMade";

const MB = 1024 * 1024;

/** A card of the window: a header (title, a count or a word) and a body. */
function card(title: string, id: string, ...body: HTMLElement[]): HTMLElement {
  const sec = h("section", "cd-card");
  sec.setAttribute("aria-labelledby", id);
  const t = h("h3", "cd-card-title", title);
  t.id = id;
  sec.append(t, ...body);
  return sec;
}

/** The dialog of the table at `root` (`""` the whole folder). `undo`: it
 *  opens with the question of undoing it asked. */
export function openCampaignDialog(root: string, undo = false, rejoined = 0): void {
  const whole = root === "";
  const overlay = h("div", "quick share-overlay campaign-overlay");
  const dialog = h("div", "web-dialog share-dialog campaign-dialog");
  overlay.append(dialog);
  const title = h("h2", "web-dialog-title", whole ? cp.titleWhole(folderName) : cp.title(name(root)));
  title.id = "campaign-title";
  const close = () => {
    overlay.remove();
    closed(overlay);
  };
  asDialog(overlay, "", close, "campaign-title");

  // Open or closed (MC.1 = A): a switch that saves at once.
  const open = h("section", "cd-card cd-open-card");
  open.append(openSwitch(root, "campaign-open"));

  const invite = card(cp.invite, "cd-invite-title", inviteBlock(root));

  // The players: with a count in the header.
  const playersCard = card(cp.players, "cd-players-title", playersBlock(root, close));
  const count = h("span", "cd-count");
  playersCard.querySelector("h3")?.append(count);
  follow(count, () => (count.textContent = String(campaign().players.length)));

  const notes = card(cp.notesTitle, "cd-notes-title", notesBlock(root));

  // The other server (ADR 0117 R9): a moved table has no switch and no
  // invitation here; its players are invited again where it went.
  const move = moveCard(root, close, (at) => openCampaignDialog(at));
  follow(open, () => {
    const moved = campaign().tables.find((t) => t.root === root)?.moved === true;
    open.hidden = moved;
    invite.hidden = moved;
  });

  // The limits, folded: a field saves when it is left or Enter is pressed,
  // and says so beside itself.
  const limits = h("details", "cd-card cd-limits");
  const sum = h("summary", "cd-card-title", cp.limitsAdvanced);
  const field = (label: string, hint: string, id: string, min: number, max: number, step: number, save: (n: number) => Promise<boolean>) => {
    const wrap = h("div", "cd-field");
    const l = h("label", "", label);
    l.htmlFor = id;
    const input = h("input");
    input.type = "number";
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const fb = feedback();
    const small = h("small", "cd-hint", hint);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("change", () => {
      void save(Number(input.value)).then((ok) => {
        fb.say(ok ? cp.fieldSaved : ui.status.textContent || cp.failed, !ok);
        if (!ok) draw();
      });
    });
    const line = h("div", "cd-row");
    line.append(input, fb.el);
    wrap.append(l, line, small);
    return { wrap, input };
  };
  const logF = field(cp.logMax, cp.logMaxHint, "campaign-log-max", 1000, 200000, 1000, (n) => setTable(root, { logMax: n }, cp.fieldSaved));
  const imgF = field(cp.imageMax, cp.imageMaxHint, "campaign-image-max", 1, 30, 1, (n) => setTable(root, { imageMax: Math.round(n * MB) }, cp.fieldSaved));
  limits.append(sum, logF.wrap, imgF.wrap);
  const draw = () => {
    const t = tableAt(root);
    logF.input.value = String(t?.log_max ?? 20000);
    imgF.input.value = String(Math.round((t?.image_max ?? 10 * MB) / MB));
  };
  follow(limits, () => {
    // Not while a field is being typed in.
    if (!limits.contains(document.activeElement)) draw();
  });

  // Undo the table (quiet, red, at the bottom) and close.
  const footer = h("div", "cd-footer");
  const ask = () =>
    askFirst(
      footer,
      // A moved table takes its players' places with it (ADR 0117 R9).
      campaign().tables.find((t) => t.root === root)?.moved === true ? tm.movedUndoConfirm : cp.undoConfirm,
      async () => {
        if (await undoTable(root)) close();
        else footer.replaceChildren(...footerRows());
      },
      true,
    );
  const undoBtn = h("button", "btn destructive", cp.undoTable);
  undoBtn.type = "button";
  undoBtn.addEventListener("click", ask);
  const done = h("button", "btn", cp.close);
  done.type = "button";
  done.addEventListener("click", close);
  const footerRows = () => [undoBtn, done];
  footer.append(...footerRows());

  const body = h("div", "cd-body");
  body.append(open, move, invite, playersCard, notes, limits, h("p", "cd-hint cd-undo-note", cp.undoNote), footer);
  dialog.append(title, h("p", "cd-hint", cp.intro2));
  // People live on boards through a share join again as players (ADR 0081 item 11).
  if (rejoined > 0) {
    const note = h("p", "cd-hint cd-rejoined", rejoinedText(document.documentElement.lang.startsWith("pt"), rejoined));
    note.setAttribute("role", "status");
    note.dataset["testid"] = "campaign-rejoined";
    dialog.append(note);
  }
  dialog.append(body);
  document.body.append(overlay);
  opened(overlay);
  // The title takes the focus, not the switch: a stray key must not close the table.
  title.tabIndex = -1;
  title.focus();
  if (undo) ask();
}
