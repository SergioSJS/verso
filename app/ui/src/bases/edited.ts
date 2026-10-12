// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a base's cell shows the moment its field is committed, before the
// core answers again: the value as typed, in the cell's own kind, so that
// Enter shows the new value at once. The next answer of the core draws it
// as the core reads it. A module without the page, so the unit tests
// reach it.

import type { BaseCell } from "../bindings";

/** The cell for `typed`, written in a field of input type `type`
 *  (`text`, `number`, `date`, `datetime-local`). A number or a date that
 *  does not read as one shows as typed. */
export function shownAfterEdit(type: string, typed: string): BaseCell {
  const v = typed.trim();
  if (v === "") return { kind: "empty" };
  if (type === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? { kind: "number", value: n } : { kind: "text", value: typed };
  }
  if (type === "date" || type === "datetime-local") {
    // A wall-clock time, read with UTC getters (BaseCell's date).
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
    if (m) {
      const [, y, mo, d, hh, mm, ss] = m;
      const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0));
      return { kind: "date", value: { ms, time: type === "datetime-local" } };
    }
  }
  return { kind: "text", value: typed };
}

/** The key a table cell of a note's property is found by again after the
 *  view is drawn anew: the note and the property. */
export function cellKey(path: string, key: string): string {
  return `${path}\n${key}`;
}
