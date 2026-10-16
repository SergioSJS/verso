// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "This app is a server" (ADR 0096 item 13) serves a limited number of
// phones at once. A browser's WebSocket never sees the status of a refused
// upgrade, so the computer accepts the socket and closes it at once with
// this code and `phones_connected:<most>` as the reason
// (crates/verso-server/src/rpc.rs); the page tells the person in words.

/** The application's close code for "the phones connected are at the most". */
export const PHONES_FULL = 4290;

/** How long that phone waits before asking again, in milliseconds. */
export const FULL_RETRY = 15_000;

/** The most the computer allows, when a close is that refusal; else null. */
export function phonesFullMost(code: number, reason: string): number | null {
  if (code !== PHONES_FULL) return null;
  const m = /^phones_connected:(\d{1,2})$/.exec(reason);
  return m ? Number(m[1]) : null;
}
