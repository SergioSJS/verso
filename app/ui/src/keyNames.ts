// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A key chord written as this machine writes it: ⌘⇧P on a Mac, Ctrl+Shift+P
// on Windows and Linux. The one place a chord becomes text — the settings'
// keys, the menus, the tooltips and every sentence of the string catalogs
// that names a key — so no Mac glyph reaches a Windows or Linux window. Kept
// apart from keys.ts (which needs the settings and the strings) so the
// catalogs can use it without a cycle.

import { MAC } from "./platform";

/** `Mod-Shift-p` as `mac` writes it: ⌘⇧P, or Ctrl+Shift+P elsewhere.
 *  Mod is ⌘ on macOS and Ctrl elsewhere; Ctrl is ⌃ only on macOS, where
 *  it is a key of its own. A bare `Mod` names the modifier alone. */
export function keysFor(combo: string, mac: boolean): string {
  if (!combo) return "";
  return combo
    .split(/-(?=.)/)
    .map((p) => {
      switch (p) {
        case "Mod": return mac ? "⌘" : "Ctrl";
        case "Ctrl": return mac ? "⌃" : "Ctrl";
        case "Shift": return mac ? "⇧" : "Shift";
        case "Alt": return mac ? "⌥" : "Alt";
        case "Meta": return mac ? "⌘" : "Meta";
        case "Space": return "␣";
        case "ArrowLeft": return "←";
        case "ArrowRight": return "→";
        case "ArrowUp": return "↑";
        case "ArrowDown": return "↓";
        default: return p.length === 1 ? p.toUpperCase() : p;
      }
    })
    .join(mac ? "" : "+");
}
/** `Mod-Shift-p` shown as the keys on this machine: ⌘⇧P, Ctrl+Shift+P. */
export function prettyKeys(combo: string): string {
  return keysFor(combo, MAC);
}
/** `label (⌘B)`: a tooltip with the keys as this machine writes them. */
export function withKeys(label: string, combo: string): string {
  return combo ? `${label} (${prettyKeys(combo)})` : label;
}
