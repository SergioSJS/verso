// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where the table is, for a folder of this computer that syncs with a
// server (ADR 0107 item 9, ADR 0082): the server's table is reached over
// the sync's link while it is up; with the link down, or the sync paused,
// there is no table and the window keeps its own rolls, not shared, until
// the link returns. Pure: the window's module (`join.ts`) and the unit
// tests drive the same decisions. Nothing here asks which side of the wire
// the core is on (rule 2): the sync's state is what the status says.

/** The folder's sync, as `verso:sync-state` says it. */
export type SyncDetail = { on: boolean; state: string };

/** `none`: not a synced folder (a folder alone, or a server's own: the
 *  side answers the join). `up`: synced, the link as far as the status
 *  says. `down`: synced, the server out of reach. `paused`: synced, paused. */
export type Reach = "none" | "up" | "down" | "paused";

export function reachOf(sync: SyncDetail | null | undefined): Reach {
  if (!sync || !sync.on || sync.state === "off") return "none";
  if (sync.state === "paused") return "paused";
  if (sync.state === "offline") return "down";
  return "up";
}

/** Whether the server's table is tried now: not while the folder's server
 *  is known out of reach. */
export function tryServerTable(reach: Reach): boolean {
  return reach === "none" || reach === "up";
}

/** What the panel says of its own log, not shared, in a synced folder:
 *  `unavailable` is the join having been answered so by the side. */
export function noticeKey(reach: Reach, unavailable: boolean): "syncOffline" | "syncPaused" | null {
  if (reach === "paused") return "syncPaused";
  if (reach === "down" || (reach === "up" && unavailable)) return "syncOffline";
  return null;
}

/** Whether a new sync state is worth joining the table again. A change of
 *  reach always is. So is any state while the link reads up and the last
 *  join was answered unavailable: a session revoked and signed in again,
 *  or the live link coming up after the files, keep the reach "up" from
 *  start to end, and only another try finds the table there. */
export function rejoin(prev: Reach, next: Reach, unavailable: boolean): boolean {
  return next !== prev || (next === "up" && unavailable);
}
