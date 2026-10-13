// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A folder opening brings back its tabs as they were left (open.ts). The
// tree is drawn before that, and a file the person opens from it while the
// tabs are still coming back must win: opened then, it went into a
// workspace of its own that the saved ones were put in front of, and the
// window showed the old tab instead (seen in the server's end-to-end
// tests on macOS WebKit, 2026-10-13). An open asked for meanwhile is kept
// and made once the tabs are back, in the order asked; one asked for after
// is made at once.

let restoring = 0;
const waiting: (() => void)[] = [];

/** The folder's tabs are being brought back. */
export function beginRestore(): void {
  restoring++;
}

/** They are back: what was asked for meanwhile is opened now, over them. */
export function endRestore(): void {
  restoring = Math.max(0, restoring - 1);
  if (restoring > 0) return;
  for (const open of waiting.splice(0)) open();
}

/** `open` kept for after the tabs are back (true), or not kept because
 *  nothing is being brought back (false: the caller opens now). */
export function afterRestore(open: () => void): boolean {
  if (restoring === 0) return false;
  waiting.push(open);
  return true;
}
