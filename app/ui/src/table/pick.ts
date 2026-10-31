// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Which table the Mesa panel shows now, for the panel to draw (its header
// names the table; a list asks the person to choose when no note says).
// Set by `join.ts`, which does the joining; read by `view.ts`. Kept here so
// that neither imports the other.

export type Pick = {
  /** The folder's tables, by root. */
  roots: string[];
  /** The table the panel is at (`null`: the folder has none, or the list is shown). */
  current: string | null;
  /** The list of tables is what the panel shows. */
  choosing: boolean;
};

let now: Pick = { roots: [], current: null, choosing: false };

export function pick(): Pick {
  return now;
}

export function setPick(next: Pick): void {
  now = next;
  dispatchEvent(new Event("verso:table-pick"));
}

export const chooseEvent = "verso:table-choose";

/** The person chose a table from the panel. */
export function chooseTable(root: string): void {
  dispatchEvent(new CustomEvent<string>(chooseEvent, { detail: root }));
}

/** The last table chosen in each folder, kept for the next time no note says. */
const KEY = "verso.table.last";

export function lastChosen(folder: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const v = all[folder];
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export function rememberChosen(folder: string, root: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    all[folder] = root;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not kept: the panel asks again.
  }
}
