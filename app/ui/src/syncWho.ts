// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Who made a change that came from the server, as Settings › Sync's
// recent activity says it (sync 2, ADR 0079 item 5): the person and the
// device whose sync made it, each when the server's log knows it. A
// module without the page, so the unit tests reach it.

/** "por Ana em MacBook" / "by Ana on MacBook"; one of the two alone when
 *  the other is unknown (a browser has no device; a share says neither);
 *  "" when neither is known. */
export function madeBy(by: string | null | undefined, device: string | null | undefined, pt: boolean): string {
  const who = by?.trim() || "";
  const where = device?.trim() || "";
  if (pt) return [who && `por ${who}`, where && `em ${where}`].filter(Boolean).join(" ");
  return [who && `by ${who}`, where && `on ${where}`].filter(Boolean).join(" ");
}
