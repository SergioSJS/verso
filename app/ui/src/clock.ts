// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The computer's clock, as the bug report says it (the maintainer,
// 2026-10-14: the report's times were in another zone than the
// computer's). The app's log writes UTC (`…Z`, log.rs); the report says
// the local time with its offset once, so whoever reads it can convert,
// and the session's errors in that local time. A module without the page,
// so the unit tests run it in fixed zones (test/clock.test.mjs).

const two = (n: number): string => String(n).padStart(2, "0");

/** `HH:MM:SS` on this computer's clock. */
export function localTime(d: Date): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** `YYYY-MM-DD HH:MM:SS (UTC±HH:MM)` on this computer's clock, the minus
 *  sign a true minus (−). */
export function localStamp(d: Date): string {
  const date = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  // `getTimezoneOffset` is minutes *behind* UTC: −180 is UTC+03:00.
  const east = -d.getTimezoneOffset();
  const sign = east < 0 ? "−" : "+";
  const abs = Math.abs(east);
  return `${date} ${localTime(d)} (UTC${sign}${two(Math.floor(abs / 60))}:${two(abs % 60)})`;
}
