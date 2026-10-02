// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the window would otherwise swallow. Every error the user is told
// about, and every one the browser would keep to itself, passes through
// here: it is kept for the report and written to the app's log
// (`app/src-tauri/src/log.rs`), which outlives the window. Before this,
// an error lived exactly as long as the sentence in the status bar.
//
// A module of its own so that the parts which catch their own
// exceptions — the PDF viewer, the diagrams — reach it without reaching
// into the window's own file.

import { commands } from "./bindings";

export type Swallowed = { at: string; level: string; text: string };

const kept: Swallowed[] = [];

/** The errors of this session, oldest first, for the report. */
export function swallowed(): readonly Swallowed[] {
  return kept;
}

/** One error: kept here, and written to the app's log. The dot on the
 *  bug button says something happened since it was last opened. */
export function note(level: string, text: string): void {
  const clean = text.trim().slice(0, 2000);
  if (clean === "") return;
  kept.push({ at: new Date().toTimeString().slice(0, 8), level, text: clean });
  if (kept.length > 40) kept.shift();
  document.getElementById("report-bug")?.classList.add("has-news");
  // The log is the host's file; a window that cannot reach it still runs.
  void commands.logWrite(level, clean).catch(() => undefined);
}

/** The window's own accidents: a script that threw, a promise nobody
 *  caught, a `console.error` from anywhere. Installed once. */
export function watchWindow(): void {
  window.addEventListener("error", (e) => note("ERROR", `${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => note("ERROR", `promise: ${String(e.reason)}`));
  const through = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    note("ERROR", args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
    through(...args);
  };
}
