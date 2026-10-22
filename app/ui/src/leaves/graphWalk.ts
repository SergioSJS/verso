// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The arrows on the graph: from the current note, the nearest one in the
// direction pressed, as it is drawn. Pure, so it is tested without a screen.

export type Walker = { id: string; x: number; y: number };
export type Dir = "left" | "right" | "up" | "down";

/** The direction an arrow key means, or null for any other key. */
export function arrowDir(key: string): Dir | null {
  return key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : key === "ArrowUp" ? "up" : key === "ArrowDown" ? "down" : null;
}

/** The id of the note to walk to: among those ahead (at least a little past
 *  the current one along the direction), the one with the smallest distance
 *  along it plus twice the sideways drift, so a note straight ahead beats a
 *  nearer one at the edge. Null when nothing lies that way, or no note is
 *  current. */
export function walk(nodes: readonly Walker[], from: string | null, dir: Dir): string | null {
  const cur = nodes.find((n) => n.id === from);
  if (!cur) return null;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const n of nodes) {
    if (n === cur) continue;
    const dx = n.x - cur.x;
    const dy = n.y - cur.y;
    const ahead = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    const side = dir === "left" || dir === "right" ? dy : dx;
    if (ahead <= 0.5) continue;
    const score = ahead + 2 * Math.abs(side);
    if (score < bestScore) { bestScore = score; best = n.id; }
  }
  return best;
}

/** The note a graph starts with when none is current: the centre one, else
 *  the first. */
export function firstCurrent(nodes: readonly Walker[], centre: string, kept: string | null): string | null {
  if (kept && nodes.some((n) => n.id === kept)) return kept;
  return (nodes.find((n) => n.id === centre) ?? nodes[0])?.id ?? null;
}
