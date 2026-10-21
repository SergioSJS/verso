// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One way to put a file in the folder, for "Import files…" and for a drop
// on the tree (I.1a, decided 2026-10-21): never overwrite, never refuse —
// a name taken moves on to `name (2).ext`, and the caller says so.

import { freeAttachment } from "./attachName";
import type { ContractError } from "./bindings";

/** The answer of a command that creates a file at a path: the confined path, or why not. */
export type Made = { status: "ok"; data: string } | { status: "error"; error: ContractError };

export type Placed = { made: string; given: string; renamed: boolean } | { failed: ContractError };

/** Create `name` in `folder` (`""` is the root) with `make`, which is given
 *  the path to create. `taken` holds the lowercased paths the folder has
 *  and learns the one used. Another member (or program) may take the name a
 *  moment before: the next free one is tried, a few times. */
export async function placeFile(folder: string, name: string, taken: Set<string>, make: (path: string) => Promise<Made>): Promise<Placed> {
  for (let tries = 0; ; tries++) {
    const path = freeAttachment(folder, name, taken);
    const r = await make(path);
    taken.add(path.toLowerCase());
    if (r.status === "ok") {
      const given = r.data.split("/").pop() ?? r.data;
      return { made: r.data, given, renamed: given !== name };
    }
    if (r.error.kind !== "exists" || tries >= 7) return { failed: r.error };
  }
}
