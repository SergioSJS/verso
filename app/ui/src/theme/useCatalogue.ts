// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Using a catalogue theme (ADR 0109 items 1 and 8), from the "More themes"
// window and from the gallery's "used by you" row: the same vet as an
// import, the theme laid over the look, the window's mode switched to the
// theme's side when it has only one, and the file kept among the recent.

import { saveSettings, settings } from "../settings";
import { applyTheme, vet } from "./actions";
import { V2 } from "./moreStrings";

const RECENT_MOST = 4;

/** Apply a catalogue theme from its file text; the words to say, or why not. */
export function useCatalogueTheme(name: string, file: string, text: string): string {
  const r = vet(text);
  if (!r.ok) return V2.more.unreadable(name);
  settings.lookRecent = [file, ...(settings.lookRecent ?? []).filter((f) => f !== file)].slice(0, RECENT_MOST);
  applyTheme({ ...r.theme, mode: "both" });
  // A theme of one side is only seen on that side: the window goes to it (the person's own choice of mode is changed by theirs).
  if (r.theme.mode !== "both" && settings.theme !== r.theme.mode) {
    settings.theme = r.theme.mode;
    saveSettings();
    return V2.more.appliedSide(name, V2.more.modes[r.theme.mode]!);
  }
  saveSettings();
  return V2.more.applied(name);
}
