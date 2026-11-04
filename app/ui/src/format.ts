// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { allEntries } from "./folder";
import { ext, Kind } from "./paths";
import { LOCALE, t } from "./strings";

/** The system asks for reduced motion: no smooth scrolling, no animation. */
export const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
export { dateFmt, humanDate } from "./dates";
export function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(LOCALE, { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}
export function kindLabel(path: string, kind: Kind): string {
  if (kind === "folder") return t.kindFolder;
  if (allEntries.get(path)?.kind === "placeholder") return t.kindPlaceholder;
  if (kind === "note") return t.kindNote;
  return ext(path).toUpperCase() || "—";
}
