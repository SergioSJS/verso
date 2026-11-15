// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Import Watabou map…" (ADR 0120 item 1): the person chooses or drops the
// files exported from a generator; the dialog says what they are and what
// the import will make, in which folder, before anything is written. The
// files are read here, in the page — no path crosses (ADR 0026 rule 4) —
// and written through the contract (importMap.ts).

import { may } from "../access";
import { afterFileChange } from "../changes";
import { asDialog, closed, opened } from "../dialogs/a11y";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { allFiles, allNotes } from "../folder";
import { openNote } from "../layout/spaces";
import { focusOnOpen } from "../screen/openFocus";
import { allFolders, openFolders, revealInTree } from "../tree/tree";
import { type Given, MAX_TEXT_BYTES, PICTURE, type Plan, plan } from "./detect";
import { type Chosen, folderName, importMap } from "./importMap";
import { type PictureInfo, pngInfo, svgInfo } from "./picture";
import { ww } from "./words";
import { MAX_IMAGE_BYTES } from "../attachName";
import { t } from "../strings";

const TEXT = /\.(json|md|markdown|txt)$/i;

/** A file's bytes as base64, in pieces (a picture may be megabytes). */
async function base64Of(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** What the dialog keeps of a chosen file. */
type Held = { given: Given; chosen: Chosen | null; problem: string | null };

/** What a picture's first bytes say of it: its size and, for an SVG, its
 *  map's transform (the head of the file holds both). */
async function pictureOf(f: File): Promise<PictureInfo | null> {
  if (/\.svg$/i.test(f.name)) return svgInfo(f.name, await f.slice(0, 256 * 1024).text());
  if (/\.png$/i.test(f.name)) return pngInfo(f.name, new Uint8Array(await f.slice(0, 64).arrayBuffer()));
  return null;
}

async function hold(f: File): Promise<Held> {
  const picture = PICTURE.test(f.name);
  const limit = picture ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
  if (f.size > limit) return { given: { name: f.name, text: null, size: f.size }, chosen: null, problem: ww.tooBig(f.name) };
  const text = picture || !TEXT.test(f.name) ? null : await f.text();
  const info = picture ? await pictureOf(f) : null;
  return { given: { name: f.name, text, size: f.size, picture: info }, chosen: { name: f.name, base64: await base64Of(f) }, problem: null };
}

/** Open the dialog; `folder` is where the map's folder goes by default
 *  (`""`: the root). `files`, when given, are taken as if chosen. */
export function showWatabouImport(folder: string, files: File[] = []): void {
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shade = h("div", "quick wb-import");
  const box = h("div", "quick-box wb-import-box");
  const title = h("h2", "wb-import-title", ww.title);
  title.id = `wb-import-${Date.now()}`;
  const intro = h("p", "wb-import-intro", ww.intro);
  const drop = h("div", "wb-import-drop");
  const pick = h("input");
  pick.type = "file";
  pick.multiple = true;
  pick.accept = ".json,.md,.png,.svg,.jpg,.jpeg,.webp";
  pick.hidden = true;
  const choose = h("button", "", ww.choose);
  choose.type = "button";
  drop.append(choose, h("span", "wb-import-hint", ww.dropHere), pick);
  const seen = h("ul", "wb-import-seen");
  seen.setAttribute("aria-live", "polite");
  const where = h("select");
  const folders = ["", ...allFolders.filter((f) => f !== "" && may(f, "createNote"))];
  for (const f of folders) {
    const o = h("option", "", f === "" ? "/" : f);
    o.value = f;
    where.append(o);
  }
  where.value = folders.includes(folder) ? folder : "";
  const whereLabel = h("label", "wb-import-field");
  whereLabel.append(h("span", "", ww.where), where);
  const makes = h("p", "wb-import-makes");
  const problem = h("p", "wb-import-problem");
  problem.setAttribute("role", "alert");
  const actions = h("div", "confirm-actions");
  const cancel = h("button", "ghost", ww.cancel);
  cancel.type = "button";
  const create = h("button", "save", ww.create);
  create.type = "button";
  create.disabled = true;
  actions.append(cancel, create);
  box.append(title, intro, drop, seen, whereLabel, makes, problem, actions);
  shade.append(box);
  asDialog(shade, ww.title, () => close(), title.id);
  document.body.append(shade);
  opened(shade);
  focusOnOpen(choose);

  let held: Held[] = [];
  let current: Plan = plan([]);
  const close = (): void => {
    shade.remove();
    closed(shade);
    if (back?.isConnected) back.focus();
  };
  const say = (): void => {
    current = plan(held.filter((x) => x.chosen).map((x) => x.given));
    const lines: string[] = held.filter((x) => x.problem).map((x) => x.problem ?? "");
    if (current.kind === "dungeon") {
      lines.unshift(ww.dungeon(current.title || ww.untitledDungeon, current.keys, current.json !== null));
      if (!current.json) lines.push(ww.noDrawing);
      else lines.push(current.fit ? ww.pictureLined : current.pictured ? ww.needSvg : ww.bringPicture);
    } else if (current.kind === "region") {
      lines.unshift(ww.region(current.title || ww.untitledRegion, current.json.region.towns.length, current.json.region.dangers.length));
    } else if (current.kind === "dwelling") {
      lines.unshift(ww.dwelling(current.title || ww.untitledHouse, current.floors, current.rooms));
      lines.push(current.fit.size > 0 ? ww.floorsLined(current.fit.size, current.floors) : ww.bringFloors);
    } else if (current.kind === "settlement") {
      lines.unshift(ww.settlement(current.title || ww.untitledSettlement));
    } else if (current.why === "two") lines.unshift(ww.two(current.names.join(", ")));
    else if (current.why === "noPicture") lines.unshift(ww.noPicture(current.generator ?? ""));
    else if (current.why === "other") lines.unshift(ww.other(current.generator ?? ""));
    else if (current.why === "unknown") lines.unshift(ww.unknown(current.names.join(", ")));
    else if (lines.length === 0) lines.push(ww.empty);
    if (current.kind !== "none" && current.pictures.length > 0) lines.push(ww.pictures(current.pictures.length));
    seen.replaceChildren(...lines.map((l) => h("li", "", l)));
    const ok = current.kind !== "none";
    create.disabled = !ok;
    makes.textContent = ok ? ww.makes(folderName(current, where.value, takenNow()), pictured(current) ? "picture" : drawn(current) ? "drawing" : null, keptNames(current)) : "";
    problem.textContent = "";
  };
  const take = async (list: FileList | File[] | null): Promise<void> => {
    if (!list || list.length === 0) return;
    const more = await Promise.all([...list].map(hold));
    // A file chosen again by name takes the place of the first.
    held = [...held.filter((x) => !more.some((m) => m.given.name === x.given.name)), ...more];
    say();
  };
  choose.addEventListener("click", () => pick.click());
  pick.addEventListener("change", () => void take(pick.files).then(() => (pick.value = "")));
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  // The whole dialog takes a drop: the window's own handler (which would
  // attach the files to the note under it) sees it taken.
  box.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove("over");
    void take(e.dataTransfer?.files ?? null);
  });
  box.addEventListener("dragover", (e) => e.preventDefault());
  where.addEventListener("change", say);
  cancel.addEventListener("click", close);
  create.addEventListener("click", () => void go());
  const go = async (): Promise<void> => {
    if (current.kind === "none") return;
    const parent = where.value;
    if (!may(parent, "createNote") || (drawn(current) && !may(parent, "createBoard"))) return void (problem.textContent = t.errNoCreate);
    create.disabled = true;
    const taken = takenNow();
    const name = folderName(current, parent, taken);
    const chosen = held.map((x) => x.chosen).filter((c): c is Chosen => c !== null);
    const r = await importMap(current, chosen, parent, name, taken);
    if ("exists" in r) {
      problem.textContent = ww.exists;
      create.disabled = false;
      return;
    }
    if ("failed" in r) {
      create.disabled = false;
      if (r.failed) fail(r.failed);
      return;
    }
    lastParent = parent;
    close();
    openFolders.add(parent);
    openFolders.add(r.folder);
    await afterFileChange();
    void revealInTree(r.note);
    ui.status.textContent = ww.made(r.folder);
    openNote(r.note, false);
    if (r.board) openNote(r.board, true);
  };
  if (files.length > 0) void take(files);
  else say();
}

/** Whether an import of `p` makes a board: Verso's drawing, or the
 *  generator's picture. */
const drawn = (p: Plan): boolean => (p.kind === "dungeon" && p.json !== null) || p.kind === "dwelling" || p.kind === "settlement";

/** Whether that board shows the generator's own picture. */
const pictured = (p: Plan): boolean => (p.kind === "dungeon" && p.json !== null && p.fit !== null) || (p.kind === "dwelling" && p.fit.size > 0) || p.kind === "settlement";

/** The folder the person last imported a map into, in this window. */
let lastParent: string | null = null;

/** Where the import offers to put a map when nothing chose the folder: the
 *  folder of the last import, while it is there — never the folder an
 *  import made, which is where the tab in front is right after one (the
 *  first round put a second map inside the first's folder) — else the
 *  folder of the tab in front. */
export function defaultImportFolder(front: string): string {
  if (lastParent !== null && (lastParent === "" || allFolders.includes(lastParent))) return lastParent;
  return front;
}

/** Every path of the folder, lowercased. */
const takenNow = (): Set<string> => new Set([...allNotes, ...allFiles, ...allFolders].map((p) => p.toLowerCase()));

/** The names of the exported files the import keeps beside the note. */
function keptNames(p: Plan): string[] {
  if (p.kind === "none") return [];
  return [...(p.json ? [p.json.name] : []), ...p.pictures];
}
