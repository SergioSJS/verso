// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The theme a folder suggests (ADR 0100 item 4, the maintainer's explicit
// choice): an optional `recommendedTheme` in `.verso/settings.json`. When
// a folder opens with one the person has not answered, a notice offers it
// — "Use" or "Not now" — and never applies it by itself. The answer is
// remembered for this folder on this device, against the suggestion's
// own text, so a changed suggestion is asked again. The person may also
// set the current look as the folder's suggestion, with the folder's
// write path (its stale check included).

import { changeFolder, folderLayerNow, folderSettingsWritable, onFolderLayer } from "../folderLayer";
import { currentFolder } from "../folder";
import { h } from "../dom";
import { importText, say, useForFolder, vet } from "./actions";
import { type Theme, themeText } from "./file";
import { parseThemeText } from "./file";
import { W } from "./strings";

const KEY = "verso.themeAnswer:";

/** The text with every object's keys sorted: what the core keeps of a
 *  suggestion is this, whatever order and spacing it was written in. */
function canonical(text: string): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sort(x)])) : v;
  try {
    return JSON.stringify(sort(JSON.parse(text)));
  } catch {
    return text;
  }
}

/** A short stable digest of a text (FNV-1a), to tell one suggestion from another. */
export function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16);
}

/** What the folder suggests, if it suggests a theme that passes. */
export function suggestion(): { theme: Theme; text: string } | null {
  const text = folderLayerNow()?.settings.recommended_theme ?? null;
  if (!text) return null;
  const parsed = parseThemeText(text);
  return parsed.ok ? { theme: parsed.theme, text } : null;
}

function answered(text: string): boolean {
  try {
    return (localStorage.getItem(`${KEY}${currentFolder}`) ?? "").startsWith(`${digest(canonical(text))}:`);
  } catch {
    return false;
  }
}
function remember(text: string, answer: "used" | "later"): void {
  try {
    localStorage.setItem(`${KEY}${currentFolder}`, `${digest(canonical(text))}:${answer}`);
  } catch {
    // No storage: asked again at the next opening.
  }
}

let banner: HTMLElement | null = null;
const hide = (): void => {
  banner?.remove();
  banner = null;
};

/** The notice, or none: shown when the folder suggests a theme not yet answered. */
function offer(): void {
  hide();
  if (!currentFolder) return;
  const s = suggestion();
  if (!s || answered(s.text)) return;
  const box = h("section", "look-offer");
  box.setAttribute("aria-label", W.banner.label);
  const text = h("p", "look-offer-text", W.banner.text(s.theme.name));
  text.setAttribute("role", "status");
  const use = h("button", "save", W.banner.use);
  use.type = "button";
  use.addEventListener("click", () => {
    remember(s.text, "used");
    hide();
    // Accepting the suggestion is this folder's choice, never the default's:
    // the scope switches only once the theme has passed the checks.
    const checked = vet(s.text).ok;
    if (checked) useForFolder();
    void importText(s.text).then((ok) => {
      if (ok) say(W.banner.used(s.theme.name));
    });
  });
  const later = h("button", "ghost", W.banner.later);
  later.type = "button";
  later.addEventListener("click", () => {
    remember(s.text, "later");
    hide();
    say(W.banner.laterDone);
  });
  box.append(text, use, later);
  document.body.append(box);
  banner = box;
}

let started = false;
/** Watch the folder's layer: the notice appears when a folder opens with a suggestion. */
export function watchSuggestion(): void {
  if (started) return;
  started = true;
  onFolderLayer(offer);
}

export type Why = "folder" | "reader";
/** Why the person cannot set the folder's suggestion, or null when they can. */
export function cannotSuggest(): Why | null {
  if (!currentFolder) return "folder";
  return folderSettingsWritable() ? null : "reader";
}

/** Make `theme` the folder's suggestion (or, with null, take it away). */
export async function setSuggestion(theme: Theme | null): Promise<boolean> {
  if (cannotSuggest()) return false;
  const text = theme ? themeText(theme).trimEnd() : "";
  const ok = await changeFolder(() => ({ recommended_theme: text }));
  if (ok && theme) remember(text, "used");
  return ok;
}
