// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "New generated map…" (ADR 0120 item 5): the person picks a generator,
// Verso draws the seed (or takes the one typed), and a note is made with
// the generator embedded and the seed in its properties.

import { may } from "../access";
import { fitName } from "../attachName";
import { commands } from "../bindings";
import { afterFileChange } from "../changes";
import { asDialog, closed, opened } from "../dialogs/a11y";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { allFiles, allNotes } from "../folder";
import { openNote } from "../layout/spaces";
import { focusOnOpen } from "../screen/openFocus";
import { allFolders } from "../tree/tree";
import { GENERATORS, MAX_SEED, drawSeed, generatedNote } from "./generators";
import { ww } from "./words";

const field = (label: string, input: HTMLElement): HTMLLabelElement => {
  const l = h("label", "wb-import-field");
  l.append(h("span", "", label), input);
  return l;
};

/** Open the dialog; the note goes in `folder` by default. */
export function showNewMap(folder: string): void {
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shade = h("div", "quick wb-import");
  const box = h("div", "quick-box wb-import-box");
  const title = h("h2", "wb-import-title", ww.newMapTitle);
  title.id = `wb-new-${Date.now()}`;
  const which = h("select");
  for (const g of GENERATORS) {
    const o = h("option", "", g.name);
    o.value = g.slug;
    which.append(o);
  }
  const seed = h("input");
  seed.type = "text";
  seed.inputMode = "numeric";
  seed.value = String(drawSeed());
  const reroll = h("button", "ghost", ww.reroll);
  reroll.type = "button";
  const seedRow = h("div", "wb-import-seed");
  seedRow.append(seed, reroll);
  const name = h("input");
  name.type = "text";
  const where = h("select");
  const folders = ["", ...allFolders.filter((f) => f !== "" && may(f, "createNote"))];
  for (const f of folders) {
    const o = h("option", "", f === "" ? "/" : f);
    o.value = f;
    where.append(o);
  }
  where.value = folders.includes(folder) ? folder : "";
  const problem = h("p", "wb-import-problem");
  problem.setAttribute("role", "alert");
  const actions = h("div", "confirm-actions");
  const cancel = h("button", "ghost", ww.cancel);
  cancel.type = "button";
  const create = h("button", "save", ww.newMapCreate);
  create.type = "button";
  actions.append(cancel, create);
  box.append(title, h("p", "wb-import-intro", ww.newMapIntro), field(ww.generator, which), field(ww.seed, seedRow), field(ww.mapName, name), field(ww.where, where), problem, actions);
  shade.append(box);
  asDialog(shade, ww.newMapTitle, () => close(), title.id);
  document.body.append(shade);
  opened(shade);
  focusOnOpen(which);

  const close = (): void => {
    shade.remove();
    closed(shade);
    if (back?.isConnected) back.focus();
  };
  reroll.addEventListener("click", () => {
    seed.value = String(drawSeed());
    problem.textContent = "";
  });
  cancel.addEventListener("click", close);
  const go = async (): Promise<void> => {
    const n = Number(seed.value.trim());
    if (!/^\d+$/.test(seed.value.trim()) || n < 1 || n > MAX_SEED) {
      problem.textContent = ww.badSeed;
      return void seed.focus();
    }
    const gen = GENERATORS.find((g) => g.slug === which.value) ?? GENERATORS[0]!;
    const heading = name.value.trim() || `${gen.name} ${n}`;
    const text = generatedNote(gen.slug, n, heading, name.value, ww.note);
    if (!text) return;
    const parent = where.value;
    const stem = fitName(heading) || gen.name;
    const taken = new Set([...allNotes, ...allFiles].map((p) => p.toLowerCase()));
    let path = `${parent ? `${parent}/` : ""}${stem}`;
    for (let i = 2; taken.has(`${path}.md`.toLowerCase()); i++) path = `${parent ? `${parent}/` : ""}${stem} ${i}`;
    const made = await commands.createNote(path, text);
    if (made.status !== "ok") {
      if (made.error.kind === "exists") problem.textContent = ww.exists;
      else fail(made.error);
      return;
    }
    close();
    await afterFileChange();
    ui.status.textContent = ww.newMapDone(made.data.path);
    openNote(made.data.path, false);
  };
  create.addEventListener("click", () => void go());
  seed.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void go();
    }
  });
}
