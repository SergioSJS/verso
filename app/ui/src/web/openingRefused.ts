// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A window whose opening was refused (the re-test of 2026-11-04: ten
// players behind one address, some of their files and sockets answered
// 429) never stays blank, nor tries again in silence. A file of the window
// that did not load is said, and the page loads again by itself a few
// times a minute, then asks the person to; a connection refused before it
// ever came up is said at each try (a browser's WebSocket never sees the
// status of a refused upgrade, only its close).

/** The reloads by itself within [`RELOADS_WITHIN`]. */
export const RELOADS_MOST = 3;
export const RELOADS_WITHIN = 60_000;

/** Whether to load the page again now, and the times of the reloads to
 *  keep (`recent` as kept in the tab, whatever it holds). */
export function afterFailedStart(now: number, recent: unknown): { reload: boolean; recent: number[] } {
  const times = Array.isArray(recent) ? recent.filter((t): t is number => typeof t === "number" && now - t < RELOADS_WITHIN) : [];
  if (times.length >= RELOADS_MOST) return { reload: false, recent: times };
  return { reload: true, recent: [...times, now] };
}

/** What a closed connection says: the phones' ceiling in its own words;
 *  a refusal before the connection ever came up as the lost connection,
 *  at each try; null for a drop after it was up, which the window says. */
export function saidOnClose(c: { everUp: boolean; full: string | null; offline: string }): string | null {
  if (c.full) return c.full;
  return c.everUp ? null : c.offline;
}
