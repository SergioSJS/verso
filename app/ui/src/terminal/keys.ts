// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The terminal's keys (ADR 0115 item 10): the one table of which keys stay
// the app's while a terminal has the focus, so that a change is a diff and
// not a surprise (test/terminal.test.mjs). No imports: the node tests
// read it as it is.
//
// The terminal takes every key but these. On macOS ⌘ never reaches a shell
// (as in Terminal.app): every ⌘ key is the app's, ⌘C copies the selection
// and ⌘V pastes, and Ctrl+C always interrupts. On Windows and Linux Mod is
// Ctrl, which the shell needs (Ctrl+C, Ctrl+R, Ctrl+D…): only the keys of
// this list are the app's — the tabs, the palette, the settings, search,
// closing the tab — and Ctrl+C with a selection copies, without one it
// interrupts. Option is not Meta by default (`macOptionIsMeta`), so the
// accents typed with Option and the dead keys work.

/** The keys that stay the app's on every system, as `comboOf` writes them. */
export const APP_KEYS: readonly string[] = [
  // The tabs and the panes: the way out of the terminal by keyboard.
  "Mod-Shift-[",
  "Mod-Shift-]",
  "Mod-1",
  "Mod-2",
  "Mod-3",
  "Mod-4",
  "Mod-5",
  "Mod-6",
  "Mod-7",
  "Mod-8",
  "Mod-9",
  // Closes the terminal's tab (asking first if a program runs) and the pane.
  "Mod-w",
  "Mod-Shift-w",
  // The quick switcher, the palette, the settings.
  "Mod-p",
  "Mod-Shift-p",
  "Mod-,",
  // The app's search (Terminal.app's "clear" is the tab menu's Clear).
  "Mod-k",
];

/** Where a key pressed in the terminal goes: the app's hotkeys, a copy of
 *  the selection, a paste, or the shell. */
export type KeyRoute = "app" | "copy" | "paste" | "shell";

export function routeKey(combo: string, mac: boolean, selection: boolean): KeyRoute {
  if (combo === "Mod-c") return selection ? "copy" : mac ? "app" : "shell";
  if (combo === "Mod-v") return "paste";
  if (APP_KEYS.includes(combo)) return "app";
  // ⌘ on macOS: the app's, never the shell's.
  if (mac && combo.startsWith("Mod-")) return "app";
  return "shell";
}

/** The keys that leave the terminal, for the tab's menu and the lesson. */
export const LEAVE_KEYS: readonly string[] = ["Mod-Shift-]", "Mod-Shift-[", "Mod-p", "Mod-Shift-p"];
