// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The terminal's own settings (ADR 0115), kept with the person's settings
// on this device (`settings.terminal`): the Windows shell (Q7), Option as
// Meta (item 10), the screen reader mode (item 24), and the folders whose
// one-line notice was shown (Q8). The switch itself is the features'
// (Q5, `settings.features.terminal`). No imports: settings.ts reads it.

export type TerminalPrefs = {
  shell: "powershell" | "cmd";
  meta: boolean;
  reader: boolean;
  /** The keys of the folders whose notice was shown once. */
  noticed: string[];
};

export function readPrefs(raw: unknown): TerminalPrefs {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    shell: o["shell"] === "cmd" ? "cmd" : "powershell",
    meta: o["meta"] === true,
    reader: o["reader"] === true,
    noticed: Array.isArray(o["noticed"]) ? o["noticed"].filter((k): k is string => typeof k === "string").slice(-200) : [],
  };
}
