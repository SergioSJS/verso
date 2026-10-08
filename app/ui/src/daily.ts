// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "./bindings";
import { afterFileChange } from "./changes";
import { ui } from "./dom";
import { fail, nameTaken } from "./errors";
import { allNotes } from "./folder";
import { layout, openNote } from "./layout/spaces";
import { NoteLeaf } from "./leaves/note";
import { showMenu } from "./menu";
import { opening } from "./opening";
import { name } from "./paths";
import { settings } from "./settings";
import { en, pt, t } from "./strings";

/* ---------- Daily note and templates ---------- */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export async function templateText(nameWanted: string): Promise<string | null> {
  const folder = settings.templates.trim().replace(/^\/+|\/+$/g, "");
  const path = allNotes.find((p) => p.toLowerCase() === `${folder}/${nameWanted}.md`.toLowerCase());
  if (!path) return null;
  const r = await opening.readNote(path);
  return r.status === "ok" ? r.data.text : null;
}
/** Where the daily note of `day` (`YYYY-MM-DD`) is, or would be. */
export function dailyPath(day: string): string {
  const folder = settings.daily.trim().replace(/^\/+|\/+$/g, "");
  return `${folder ? folder + "/" : ""}${day}.md`;
}
export async function dailyNote(day = today()): Promise<void> {
  const folder = settings.daily.trim().replace(/^\/+|\/+$/g, "");
  const path = dailyPath(day);
  if (allNotes.includes(path)) {
    openNote(path, false);
    return;
  }
  // A template named like the daily folder, else by the folder's default
  // name in either language.
  let tpl: string | null = null;
  for (const n of new Set([folder || t.dailyName, pt.dailyName, en.dailyName])) tpl ??= await templateText(n);
  const body = (tpl ?? `# ${day}\n\n`).replaceAll("{{date}}", day).replaceAll("{{title}}", day);
  const r = await commands.createNote(path, body);
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  const leaf = openNote(r.data.path, false);
  if (leaf instanceof NoteLeaf) { await leaf.loading; leaf.editAtEnd(); }
}
/** A copy of the current note in the templates folder: that is all a
 *  template is — any note there. `{{date}}` and `{{title}}` are filled
 *  when it is inserted. */
export async function saveAsTemplate(): Promise<void> {
  const leaf = layout().activeLeaf;
  if (!(leaf instanceof NoteLeaf) || !leaf.note) return;
  const folder = settings.templates.trim().replace(/^\/+|\/+$/g, "") || t.templatesName;
  const r = await commands.createNote(`${folder}/${name(leaf.path)}`, leaf.editorText());
  if (r.status !== "ok") return r.error.kind === "exists" ? nameTaken(t.exists) : fail(r.error);
  await afterFileChange();
  ui.status.textContent = t.templateSaved;
}
export function insertTemplate(): void {
  const leaf = layout().activeLeaf;
  if (!(leaf instanceof NoteLeaf)) return;
  const folder = settings.templates.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  const tpls = allNotes.filter((p) => p.toLowerCase().startsWith(`${folder}/`));
  if (tpls.length === 0) { ui.status.textContent = t.noTemplates; return; }
  const r = leaf.el.getBoundingClientRect();
  showMenu(r.left + 40, r.top + 60, tpls.map((p) => [name(p), () => void (async () => {
    const rr = await opening.readNote(p);
    if (rr.status !== "ok") return fail(rr.error);
    const text = rr.data.text.replaceAll("{{date}}", today()).replaceAll("{{title}}", name(leaf.path));
    const pos = leaf.editor.state.selection.main.to;
    leaf.setMode("live");
    leaf.editor.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
  })()] as [string, () => void]));
}
