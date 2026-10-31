// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The native menu's keys (macOS): a command's key, as the window writes it
// (`Mod-Shift-]`), as the accelerator the menu item takes
// (`CmdOrCtrl+Shift+]`). Only arithmetic on strings, so a test can run it.

const NAMED: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
};

/** The accelerator of a window key, or null when the menu should not take
 *  it: a key without Mod (it would catch plain typing), one with the
 *  Control or Meta key of its own, or one it cannot name. */
export function acceleratorOf(combo: string): string | null {
  if (!combo) return null;
  const parts = combo.split(/-(?=.)/);
  const key = parts.pop();
  if (!key || parts[0] !== "Mod") return null;
  const out: string[] = ["CmdOrCtrl"];
  for (const p of parts.slice(1)) {
    if (p === "Shift") out.push("Shift");
    else if (p === "Alt") out.push("Alt");
    else return null;
  }
  if (key.length === 1) out.push(key.toUpperCase());
  else if (NAMED[key]) out.push(NAMED[key]);
  else return null;
  return out.join("+");
}

/** The keys of the commands the menu may show, as accelerators: the
 *  commands that are the note editor's own (`editorOnly`) have none, since
 *  the menu would take them where the editor is not. */
export function menuKeys(list: readonly { id: string; editorOnly?: boolean }[], keyOf: (id: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of list) {
    if (c.editorOnly) continue;
    const a = acceleratorOf(keyOf(c.id));
    if (a) out[c.id] = a;
  }
  return out;
}
