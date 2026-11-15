// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The menu rows that destroy (a delete), painted in the accent as a
// warning (menu.ts, css/chrome.css `.menu-danger`): the row says so
// itself, never its place at the bottom of a menu. Its own module, with
// no imports, so a widget that hands its rows to a menu (tableEditor.ts)
// marks them without loading the menu.

const DANGER = new WeakSet<readonly unknown[]>();

/** `row`, marked as one that destroys. */
export function danger<T extends readonly unknown[]>(row: T): T {
  DANGER.add(row);
  return row;
}

/** Whether `row` was marked by `danger`. */
export function isDanger(row: readonly unknown[]): boolean {
  return DANGER.has(row);
}
