// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The suggestion while typing (ADR 0089 item 5), wired to the window: the
// folder's names from the same list the `[[` completion draws on
// (`allNotes`, and the aliases the entries carry), built once and kept
// until the folder or the person's lists change; the setting; the link's
// text for a note; and a polite live region for a screen reader.

import { type Extension } from "@codemirror/state";
import { allEntries, allNotes } from "../folder";
import { name } from "../paths";
import { linkText } from "../resolve";
import { clampMinLetters, settings } from "../settings";
import { LinkNames } from "./linkNames";
import { linkSuggest } from "./linkSuggest";

let built: { notes: string[]; rules: string; names: LinkNames } | null = null;

/** The folder's names, rebuilt only when the folder's list of notes is a
 *  new one (every walk makes one) or the ignored lists changed. */
export function folderNames(): LinkNames {
  const rules = JSON.stringify([settings.suggestIgnoreFolders, settings.suggestIgnoreNames]);
  if (built && built.notes === allNotes && built.rules === rules) return built.names;
  const names = new LinkNames(
    allNotes.map((path) => ({ path, name: name(path), aliases: allEntries.get(path)?.label?.aliases ?? [] })),
    { ignoredFolders: settings.suggestIgnoreFolders, ignoredNames: settings.suggestIgnoreNames },
  );
  built = { notes: allNotes, rules, names };
  return names;
}

let region: HTMLElement | null = null;
/** Said to a screen reader, politely, without a word on screen: the chip
 *  is what is seen. */
function say(message: string): void {
  if (!region) {
    region = document.createElement("div");
    region.className = "sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.id = "link-suggest-live";
    document.body.append(region);
  }
  region.textContent = message;
}

/** The extension for one note's editor. `path` is read when needed: a
 *  rename changes it. */
export function linkSuggestFor(path: () => string): Extension {
  return linkSuggest({
    enabled: () => settings.suggestLinks,
    names: folderNames,
    partialRule: () => ({ minLetters: clampMinLetters(settings.suggestMinLetters), capitalOnly: settings.suggestCapitalOnly !== false }),
    path,
    target: (to) => linkText(path(), to),
    say,
  });
}
