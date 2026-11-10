// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Save as board…" (ADR 0106 item 3, answered 2026-10-21): the diagram as
// it is arranged now, written as a new JSON Canvas file — a text card for
// each drawn box, a line for each drawn line. The person sees the name, the
// folder and what the board will hold before anything is written, and the
// file is made through the contract's create-file like any other.

import { asDialog, closed, opened } from "../dialogs/a11y";
import { commands } from "../bindings";
import { afterFileChange } from "../changes";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { allFiles, allNotes } from "../folder";
import { dirOf } from "../paths";
import { textBase64 } from "../files";
import { openNote } from "../layout/spaces";
import { allFolders } from "../tree/tree";
import { type BoardDoc, boardFits, MAX_BOARD_CARDS } from "./saveBoardDoc";
import { dgw } from "./words";
import { focusOnOpen } from "../screen/openFocus";

/** The dialog: name, folder, what the board will hold; resolves when it is closed. */
export function saveAsBoard(doc: BoardDoc, from: string): void {
  if (doc.nodes.length === 0) {
    ui.status.textContent = dgw.boardNothing;
    return;
  }
  if (!boardFits(doc)) {
    ui.status.textContent = dgw.boardTooMany(doc.nodes.length, MAX_BOARD_CARDS);
    return;
  }
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shade = h("div", "quick dg-save");
  const box = h("div", "quick-box dg-save-box");
  const title = h("h2", "dg-save-title", dgw.boardTitle);
  title.id = `dg-save-${Date.now()}`;
  const nameBase = (from.split("/").pop() ?? "diagram").replace(/\.[^.]+$/, "");
  const name = h("input");
  name.type = "text";
  name.value = `${nameBase} (${dgw.diagram.toLowerCase()})`;
  const nameLabel = h("label", "dg-save-field");
  nameLabel.append(h("span", "", dgw.boardName), name);
  const where = h("select");
  const folders = ["", ...allFolders.filter((f) => f !== "")];
  for (const f of folders) {
    const o = h("option", "", f === "" ? "/" : f);
    o.value = f;
    where.append(o);
  }
  where.value = folders.includes(dirOf(from)) ? dirOf(from) : "";
  const whereLabel = h("label", "dg-save-field");
  whereLabel.append(h("span", "", dgw.boardWhere), where);
  const preview = h("p", "dg-save-preview", dgw.boardPreview(doc.nodes.length, doc.edges.length));
  const problem = h("p", "dg-save-problem");
  problem.setAttribute("role", "alert");
  const actions = h("div", "confirm-actions");
  const cancel = h("button", "ghost", dgw.boardCancel);
  cancel.type = "button";
  const create = h("button", "save", dgw.boardCreate);
  create.type = "button";
  actions.append(cancel, create);
  box.append(title, nameLabel, whereLabel, preview, problem, actions);
  shade.append(box);
  asDialog(shade, dgw.boardTitle, () => close(), title.id);
  document.body.append(shade);
  opened(shade);
  focusOnOpen(name, { select: true });

  const close = (): void => {
    shade.remove();
    closed(shade);
    if (back?.isConnected) back.focus();
  };
  cancel.addEventListener("click", close);
  const go = async (): Promise<void> => {
    const base = name.value.trim().replace(/[\\/:*?"<>|]/g, " ").trim();
    if (base === "") return void name.focus();
    const folder = where.value;
    const path = `${folder ? folder + "/" : ""}${base}.canvas`;
    const taken = new Set([...allNotes, ...allFiles].map((p) => p.toLowerCase()));
    if (taken.has(path.toLowerCase())) {
      problem.textContent = dgw.boardExists;
      return void name.focus();
    }
    const text = await commands.boardText(JSON.stringify(doc));
    if (text.status !== "ok") return fail(text.error);
    const made = await commands.createFile(path, textBase64(text.data));
    if (made.status !== "ok") {
      problem.textContent = made.error.kind === "exists" ? dgw.boardExists : "";
      if (made.error.kind !== "exists") fail(made.error);
      return;
    }
    close();
    await afterFileChange();
    ui.status.textContent = dgw.boardDone(made.data);
    openNote(made.data, false);
  };
  create.addEventListener("click", () => void go());
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void go();
    }
  });
}
