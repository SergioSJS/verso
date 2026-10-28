// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// When a person's joining a live file is news (ADR 0084 item 7). Pure: no
// page, no clock, no storage — the tests reach it (test/presenceNews.test.mjs).
//
// A join is told only where it concerns the person looking: the window
// whose open folder holds the file, the tab that shows it, the window in
// front. And it is told once: the same person in the same place is not news
// again for PRESENCE_AGAIN_MS — a connection that dropped and came back, a
// room joined anew, a tab that lost and regained its link bring the same
// people back, and that is not a joining. Someone already there when the
// tab opened is not told either: awareness arrives a moment after the room.

/** The same person joining the same file is not announced again within
 *  this long, in milliseconds (10 minutes). */
export const PRESENCE_AGAIN_MS = 10 * 60_000;

/** Joins seen this soon after a tab bound its room are the people who were
 *  already there, their awareness arriving late, in milliseconds. */
export const PRESENCE_SETTLE_MS = 5_000;

/** Where a join happened and where the person is looking. */
export type JoinWhere = {
  /** The folder this window has open, and the folder the file belongs to. */
  openFolder: string;
  folder: string;
  /** Whether the tab that holds the file is the one showing, and the
   *  window is in front. */
  tabShowing: boolean;
  windowInFront: boolean;
};

/** Whether a join concerns the person looking now. */
export function concerns(w: JoinWhere): boolean {
  return w.folder === w.openFolder && w.tabShowing && w.windowInFront;
}

export class PresenceNews {
  private heard = new Map<string, number>();
  private bound = new Map<string, number>();

  private static key(folder: string, path: string, name: string): string {
    return `${folder}\n${path}\n${name}`;
  }

  /** A tab bound its file's room at `now`: joins within the settle time
   *  are the people who were already there. */
  opened(folder: string, path: string, now: number): void {
    this.bound.set(`${folder}\n${path}`, now);
  }

  /** `name` joined `path`: whether to tell. Told or not, the sighting is
   *  remembered, so that it is not news again until the person has been
   *  away for PRESENCE_AGAIN_MS. */
  joined(where: JoinWhere, path: string, name: string, now: number): boolean {
    const key = PresenceNews.key(where.folder, path, name);
    const last = this.heard.get(key);
    const openedAt = this.bound.get(`${where.folder}\n${path}`);
    const early = openedAt !== undefined && now - openedAt < PRESENCE_SETTLE_MS;
    const again = last !== undefined && now - last < PRESENCE_AGAIN_MS;
    this.heard.set(key, now);
    if (early || again) return false;
    return concerns(where);
  }

  /** The file's people, as they are now, were all present already. */
  present(folder: string, path: string, names: readonly string[], now: number): void {
    for (const n of names) if (!this.heard.has(PresenceNews.key(folder, path, n))) this.heard.set(PresenceNews.key(folder, path, n), now);
  }
}
