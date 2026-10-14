// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A note's unlinked mentions in the side panel, under its backlinks (ADR
// 0089): each occurrence of its name — or of an alias — written plainly in
// another note, as the core found it, with "Link" on each and "Link all"
// over the list. One link is written at once, through the contract over
// the revision it read, or through the room of a live note, or in the
// editor of an open tab (where ⌘Z undoes it); "Link all" shows the plan
// as a diff first and writes file by file, each with its own check
// (invariants 8 and 11). Only who may write sees the buttons (ADR 0076).

import { commands, type Mention } from "../bindings";
import { canWrite } from "../can";
import { roomSide } from "../collab";
import { button, h, ui } from "../dom";
import { fail } from "../errors";
import { icon } from "../icons";
import { liveHolder, openNote } from "../layout/spaces";
import type { NoteLeaf } from "../leaves/note";
import { plan } from "../main";
import { linkAll, linkFor, placeOf } from "../mentionLink";
import { dirOf, name } from "../paths";
import { linkText } from "../resolve";
import { writeLive } from "../roomWrites";
import { t } from "../strings";
import { writeInTab } from "../tabWrites";
import { ms } from "./mentionStrings";

/** Characters `before` and `after` hold at most (the core's `AROUND`):
 *  a side that long was cut, and says so. */
const AROUND = 60;

/** Where a link went: `disk` written (or saved from a tab); `room` into
 *  the note's room, which writes the file once the edits settle;
 *  `unsaved` made in a tab whose save did not go through; `moved` the
 *  mention is not where it was listed, nothing written; `failed` said by
 *  `fail`. */
type Linked = "disk" | "room" | "unsaved" | "moved" | "failed";

/** Write the link for the mention `m` of the note at `target`. */
export async function linkOne(target: string, m: Mention): Promise<Linked> {
  const link = linkFor(m, linkText(m.path, target));
  const change = (text: string): string | null => {
    const at = placeOf(text, m);
    return at ? text.slice(0, at.from) + link + text.slice(at.to) : null;
  };
  const tab = await writeInTab(m.path, change);
  if (tab === "saved") return "disk";
  if (tab === "unsaved") return "unsaved";
  if (tab === "refused") return "moved";
  const through = await writeLive(m.path, liveHolder(m.path), change, roomSide);
  if (through === "room") return "room";
  if (through === "refused" || through === "same") return "moved";
  const now = await commands.readText(m.path);
  if (now.status !== "ok") {
    fail(now.error);
    return "failed";
  }
  const after = change(now.data.text);
  if (after === null) return "moved";
  const written = await commands.writeText(m.path, after, now.data.revision);
  if (written.status === "ok") return "disk";
  if (written.error.kind === "changed") return "moved";
  fail(written.error);
  return "failed";
}

/** The row whose "Link" button takes the focus when the list is drawn
 *  again after a link: the keyboard stays in the list. */
let refocus: number | null = null;

/** The section for `leaf`'s note — its heading, "Link all" and a row per
 *  mention — or null when there is nothing to show or the panel moved on
 *  (`current` false) while the core answered. */
export async function mentionsSection(leaf: NoteLeaf, current: () => boolean): Promise<HTMLElement[] | null> {
  const target = leaf.path;
  const r = await commands.unlinkedMentions(target);
  if (!current()) return null;
  if (r.status !== "ok") {
    // A note not yet on disk has no mentions to look for; anything else
    // — the server down, the index unreadable — is said in the section.
    if (r.error.kind === "not_found") return null;
    return [h("h3", "panel-sub", t.mentions), h("p", "mentions-note", ms.failed)];
  }
  const list = r.data.mentions;
  if (list.length === 0) return null;
  const writes = canWrite();
  const head = h("div", "mentions-head");
  head.append(h("h3", "panel-sub", `${t.mentions} · ${list.length}${r.data.more ? "+" : ""}`));
  if (writes) {
    const all = button("ghost mentions-all", ms.linkAll);
    all.setAttribute("aria-label", ms.linkAllNamed(list.length));
    all.addEventListener("click", () => void linkEvery(leaf, list));
    head.append(all);
  }
  const ul = h("ul", "panel-list mentions-list");
  ul.append(...list.map((m, i) => row(leaf, m, i, writes)));
  const nodes: HTMLElement[] = [head, ul];
  if (r.data.more) nodes.push(h("p", "mentions-note", ms.more(list.length)));
  if (refocus !== null) {
    const at = Math.min(refocus, list.length - 1);
    refocus = null;
    requestAnimationFrame(() => ul.querySelectorAll<HTMLButtonElement>(".mention-link")[at]?.focus());
  }
  return nodes;
}

function row(leaf: NoteLeaf, m: Mention, index: number, writes: boolean): HTMLLIElement {
  const li = h("li", "mention");
  const open = h("button", "row");
  open.type = "button";
  const where = `${dirOf(m.path) ? `${dirOf(m.path)} · ` : ""}${ms.lineOf(m.line)}`;
  const snippet = h("span", "snippet");
  snippet.append(`${m.before.length >= AROUND ? "…" : ""}${m.before}`, h("mark", "", m.text), `${m.after}${m.after.length >= AROUND ? "…" : ""}`);
  open.append(icon("search"), h("span", "row-name", name(m.path)), h("span", "path", where), snippet);
  // The note the mention is in shows on a hover (ADR 0085 item 2).
  open.dataset["previewPath"] = m.path;
  open.addEventListener("click", () => void openNote(m.path, false, false, true));
  open.addEventListener("dblclick", () => void openNote(m.path, false));
  li.append(open);
  if (writes) {
    const link = button("ghost mention-link", ms.link);
    link.setAttribute("aria-label", ms.linkNamed(m.text, name(m.path)));
    link.addEventListener("click", () => void linkRow(leaf, m, index, li, link));
    li.append(link);
  }
  return li;
}

/** "Link" on one row: written, said, and the list drawn again. */
async function linkRow(leaf: NoteLeaf, m: Mention, index: number, li: HTMLLIElement, b: HTMLButtonElement): Promise<void> {
  b.disabled = true;
  const outcome = await linkOne(leaf.path, m);
  const note = name(m.path);
  if (outcome === "failed") {
    b.disabled = false;
    return;
  }
  ui.status.textContent = outcome === "moved" ? ms.moved(note) : outcome === "unsaved" ? ms.linkedUnsaved(note) : ms.linked(m.text, note);
  if (outcome !== "moved") li.remove();
  refocus = index;
  // The backlinks and the mentions read again from the index; a room
  // writes the file once its edits settle (ADR 0082), so its link is
  // read a moment later.
  if (outcome === "room") window.setTimeout(() => void leaf.relink(leaf.path), 1500);
  else void leaf.relink(leaf.path);
}

/** "Link all": every mention still where it was listed made a link in
 *  its note's text as it is now, shown as a plan (a diff per note) and
 *  written on confirmation, note by note (`Plan`). */
async function linkEvery(leaf: NoteLeaf, list: Mention[]): Promise<void> {
  const target = leaf.path;
  const byPath = new Map<string, Mention[]>();
  for (const m of list) byPath.set(m.path, [...(byPath.get(m.path) ?? []), m]);
  const rewrites: { path: string; revision: string; before: string; after: string }[] = [];
  let moved = 0;
  let count = 0;
  for (const [path, mentions] of byPath) {
    const now = await commands.readText(path);
    if (now.status !== "ok") {
      moved += mentions.length;
      continue;
    }
    const made = linkAll(now.data.text, mentions, (m) => linkFor(m, linkText(path, target)));
    moved += made.moved.length;
    if (made.linked.length === 0) continue;
    count += made.linked.length;
    rewrites.push({ path, revision: now.data.revision, before: now.data.text, after: made.after });
  }
  if (rewrites.length === 0) {
    ui.status.textContent = ms.nothingLeft;
    void leaf.relink(leaf.path);
    return;
  }
  const detail = [ms.planDetail(name(target)), moved > 0 ? ms.planMoved(moved) : ""].filter(Boolean).join(" ");
  plan.show(rewrites, ms.planTitle(count, rewrites.length), ms.linkAll, detail, { inTabs: true });
}
