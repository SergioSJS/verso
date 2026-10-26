// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The local table source (ADR 0107, phase 1): the logs of this run, one per
// folder, fed by this window's own rolls, by the rolls it hears in shared
// notes' rooms and by the rolls a room already holds when it is joined. No
// persistence: the server's (phase 2) will keep the table.

import { TableLog, type TableEntry, type TableSource } from "./model";

/** The store of the logs, with `folder` saying which folder is open now. */
export function makeStore(folder: () => string): TableSource & {
  /** Add an entry to the open folder's log (`fresh`: counts as unread when it is another's). */
  add(e: TableEntry, fresh?: boolean): boolean;
  /** The ids already in the open folder's log. */
  has(id: string): boolean;
  /** Why the log is not the server's table, when it is more than "not shared". */
  setNotice(text: string | null): void;
} {
  const logs = new Map<string, TableLog>();
  const subs = new Set<() => void>();
  const log = (): TableLog => {
    const key = folder();
    let l = logs.get(key);
    if (!l) logs.set(key, (l = new TableLog()));
    return l;
  };
  const tell = (): void => {
    for (const fn of [...subs]) fn();
  };
  let notice: string | null = null;
  return {
    notice: () => notice,
    setNotice(text) {
      if (text === notice) return;
      notice = text;
      tell();
    },
    shared: false,
    receivesOwn: false,
    entries: () => log().visible(),
    unread: () => log().unread(),
    markSeen() {
      if (log().unread() === 0) return;
      log().markSeen();
      tell();
    },
    hideUpToHere() {
      log().hideUpToHere();
      tell();
    },
    undoHide() {
      const done = log().undoHide();
      if (done) tell();
      return done;
    },
    hidden: () => log().hidden(),
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    add(e, fresh = true) {
      const added = log().add(e, fresh);
      if (added) tell();
      return added;
    },
    has: (id) => log().all().some((e) => e.id === id),
  };
}
