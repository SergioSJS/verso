// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** "Start with" under a new note's title, as Notion offers it (ADR 0068):
 *  Blank, then the notes of the templates folder. A choice puts the
 *  template's text in the note as one step of the undo; Blank, Esc, or
 *  typing in the note put the list away for good. */

import { h } from "./dom";
import { icon } from "./icons";
import { fail } from "./errors";
import { allNotes } from "./folder";
import type { NoteLeaf } from "./leaves/note";
import { opening } from "./opening";
import { name } from "./paths";
import { settings } from "./settings";
import { fillTemplate } from "./templateFill";
import { LOCALE, t } from "./strings";

/** The notes of the templates folder, prioritizing project-local templates when inside a project/campaign. */
export function templates(currentPath?: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  // 1. If currentPath is provided, search for local Modelos or Templates in ancestor directories
  if (currentPath) {
    const segments = currentPath.split("/").slice(0, -1);
    while (segments.length > 0) {
      const parent = segments.join("/");
      for (const candidate of [`${parent}/Modelos`, `${parent}/modelos`, `${parent}/Templates`, `${parent}/templates`]) {
        const localMatches = allNotes
          .filter((p) => p.startsWith(`${candidate}/`) && !p.slice(candidate.length + 1).includes("/"))
          .sort((a, b) => name(a).localeCompare(name(b)));
        for (const p of localMatches) {
          if (!seen.has(name(p))) {
            seen.add(name(p));
            result.push(p);
          }
        }
      }
      segments.pop();
    }
  }

  // 2. Global templates folder from settings
  const folder = settings.templates.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (folder) {
    const globalMatches = allNotes
      .filter((p) => p.toLowerCase().startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes("/"))
      .sort((a, b) => name(a).localeCompare(name(b)));
    for (const p of globalMatches) {
      if (!seen.has(name(p))) {
        seen.add(name(p));
        result.push(p);
      }
    }
  }

  // 3. Fallback root "Modelos" folder if present
  for (const candidate of ["Modelos", "modelos"]) {
    const rootMatches = allNotes
      .filter((p) => p.startsWith(`${candidate}/`) && !p.slice(candidate.length + 1).includes("/"))
      .sort((a, b) => name(a).localeCompare(name(b)));
    for (const p of rootMatches) {
      if (!seen.has(name(p))) {
        seen.add(name(p));
        result.push(p);
      }
    }
  }

  return result;
}

/** Offer the templates under `leaf`'s title; nothing when there are none. */
export function offerTemplates(leaf: NoteLeaf): void {
  const choices = templates(leaf.path);
  if (choices.length === 0) return;
  const box = h("div", "template-picker");
  box.setAttribute("role", "group");
  const heading = h("span", "template-picker-title", t.templatePicker.title);
  heading.id = `template-picker-${Math.random().toString(36).slice(2)}`;
  box.setAttribute("aria-labelledby", heading.id);
  const blank = choice(t.templatePicker.blank, "note");
  const buttons = [blank, ...choices.map((p) => {
    const b = choice(name(p), "template");
    b.addEventListener("click", () => void choose(p));
    return b;
  })];
  box.append(heading, ...buttons);
  const typed = leaf.editor.state.doc.toString();

  const away = (): void => {
    box.remove();
    leaf.el.removeEventListener("keydown", onKey, true);
  };
  // Typing in the note puts the list away; keys inside the list move it.
  const onKey = (e: KeyboardEvent): void => {
    const inside = box.contains(e.target as Node);
    if (e.key === "Escape" && inside) {
      e.preventDefault();
      away();
      leaf.editAtEnd();
      return;
    }
    if (inside && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      const i = buttons.indexOf(e.target as HTMLButtonElement);
      const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      buttons[(i + step + buttons.length) % buttons.length]?.focus();
      return;
    }
    // Typing in the note's text, not in its title's field.
    if (leaf.editorHost.contains(e.target as Node) && e.key.length === 1 && !e.metaKey && !e.ctrlKey) away();
  };
  leaf.el.addEventListener("keydown", onKey, true);
  blank.addEventListener("click", () => {
    away();
    leaf.editAtEnd();
  });

  async function choose(path: string): Promise<void> {
    const r = await opening.readNote(path);
    if (r.status !== "ok") return fail(r.error);
    away();
    // Typed into meanwhile: the template does not take the typing's place.
    if (leaf.editor.state.doc.toString() !== typed) return;
    const text = fillTemplate(r.data.text, name(leaf.path), new Date(), LOCALE);
    leaf.setMode("live");
    leaf.editor.dispatch({ changes: { from: 0, to: leaf.editor.state.doc.length, insert: text }, selection: { anchor: text.length }, scrollIntoView: true });
    leaf.editor.focus();
  }

  leaf.preview.before(box);
}

/** A choice: a mark, and its name as the text — the button's one name
 *  for a screen reader (the mark has none of its own). */
function choice(label: string, ic: string): HTMLButtonElement {
  const b = h("button", "template-choice");
  b.type = "button";
  b.append(icon(ic), h("span", "template-choice-name", label));
  return b;
}
