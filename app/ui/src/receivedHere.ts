// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A folder this person received from another account on a UniVerso, synced
// to this computer, is not served from here (ADR 0081 item 4; ADR 0117
// D4.3, decided 2026-11-04: "said in words on the folder's row (built) and
// on the folder's page"): the page says so where its table strip would
// stand, in the words of Settings' row (`receivedFrom`), from the same list
// of folders the section draws (`local_server_folders`).

import type { LocalFolder } from "./bindings";
import { localStrings } from "./dialogs/localServerStrings";

/** The UniVerso the folder `key` was received from, or null for a folder
 *  of one's own, or one not in the list. */
export function receivedHost(folders: Pick<LocalFolder, "key" | "received_from">[], key: string): string | null {
  if (!key) return null;
  return folders.find((f) => f.key === key)?.received_from ?? null;
}

/** The line on the folder's page: the section's name, and why. */
export function receivedLine(host: string): HTMLElement {
  const w = localStrings();
  const box = document.createElement("section");
  box.className = "table-card table-card-received";
  box.setAttribute("aria-label", w.section);
  const line = document.createElement("div");
  line.className = "table-strip";
  const title = document.createElement("span");
  title.className = "table-strip-title";
  title.textContent = w.section;
  const why = document.createElement("span");
  why.className = "table-strip-meta";
  why.textContent = w.receivedFrom(host);
  line.append(title, why);
  box.append(line);
  return box;
}
