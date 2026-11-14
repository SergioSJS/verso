// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The app's date and hour, in the interface's language: one formatter,
// apart from `format.ts`'s file helpers so a dialog reaches it alone.

import { LOCALE } from "./strings";

export const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

/** Seconds since the epoch as the day and the hour; empty for none. */
export function humanDate(secs: number): string {
  return secs > 0 ? dateFmt.format(new Date(secs * 1000)) : "";
}
