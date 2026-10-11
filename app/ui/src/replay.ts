// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A planned change (a rename's links, a replace) made again over a text
// that changed since it was planned: line by line, never by guessing.
// Pure, for the plan and its tests.

/** `after` was planned from `before`; `now` is what the file holds now.
 *  The change made again over `now`: each line the plan changed, wherever
 *  it stands in `now`, becomes what the plan made of it. Null when a line
 *  the plan changed is no longer in `now` (nor its new form), or when the
 *  plan added or removed lines — then only a person can say. `now` itself
 *  when there is nothing left to change. */
export function replay(before: string, after: string, now: string): string | null {
  if (now === before) return after;
  const was = before.split("\n");
  const made = after.split("\n");
  if (was.length !== made.length) return null;
  const lines = now.split("\n");
  const changes = new Map<string, string>();
  for (let i = 0; i < was.length; i++) if (was[i] !== made[i]) changes.set(was[i]!, made[i]!);
  for (const [from, to] of changes) {
    if (lines.includes(from)) continue;
    // Already changed meanwhile: nothing to do for this line.
    if (lines.includes(to)) continue;
    return null;
  }
  return lines.map((l) => changes.get(l) ?? l).join("\n");
}
