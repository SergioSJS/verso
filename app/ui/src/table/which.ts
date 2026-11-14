// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Which table the Mesa panel is at (ADR 0107 as amended 2026-10-23; the
// maintainer: "o chat deve ser 1 por mesa"). A table is a folder of the
// open folder (`""` for the folder itself); the panel follows the table of
// the active note — the nearest table up its path, the rule of the chip
// beside the folder's name (`tableChip.ts`) — and, when no note says,
// the last table the person chose in this folder, or a list to choose
// from. Pure: the window's module (`join.ts`) and the unit tests drive the
// same decisions.

/** What the panel does with the tables the folder has. */
export type Choice =
  /** The folder has no table: the panel is the folder's one, as 0107 first built it. */
  | { kind: "none" }
  /** The panel is at the table rooted here. */
  | { kind: "table"; root: string }
  /** No note says which: the person chooses among these. */
  | { kind: "choose"; roots: string[] };

const under = (root: string, path: string): boolean => root === "" || path === root || path.startsWith(`${root}/`);

/** The nearest table up `path`: the deepest root that holds it. */
export function nearest(roots: readonly string[], path: string): string | null {
  let best: string | null = null;
  for (const r of roots) if (under(r, path) && (best === null || r.length > best.length)) best = r;
  return best;
}

/** The table the panel is at.
 *  `roots`: the folder's tables. `active`: the active note's path ("" when none).
 *  `manual`: the table the person chose from the panel for this very note, if any.
 *  `last`: the table last chosen in this folder. */
export function whichTable(roots: readonly string[], active: string, manual: string | null, last: string | null): Choice {
  if (roots.length === 0) return { kind: "none" };
  if (manual !== null && roots.includes(manual)) return { kind: "table", root: manual };
  // With no note open the folder's own table, when the folder is one, as the chip has it.
  const near = active ? nearest(roots, active) : roots.includes("") ? "" : null;
  if (near !== null) return { kind: "table", root: near };
  if (last !== null && roots.includes(last)) return { kind: "table", root: last };
  const only = roots[0];
  if (roots.length === 1 && only !== undefined) return { kind: "table", root: only };
  return { kind: "choose", roots: [...roots].sort((a, b) => a.localeCompare(b)) };
}

/** The panel's name for a table: the folder's name for the folder itself. */
export function tableLabel(root: string, folder: string): string {
  if (root === "") return folder;
  const at = root.lastIndexOf("/");
  return at < 0 ? root : root.slice(at + 1);
}

/** The names of the table the window is at: the one the choice says, or
 *  each of those to choose from; none for a folder with no table. What
 *  the window says when it sits at its own server's table (*Na mesa de
 *  Campanha Fractal.*, not the folder's name). */
export function tableNames(choice: Choice, folder: string): string[] {
  if (choice.kind === "table") return [tableLabel(choice.root, folder)];
  if (choice.kind === "choose") return choice.roots.map((r) => tableLabel(r, folder));
  return [];
}

/** What the panel draws for the choice it is joined by: the folder's
 *  tables, the table it is at, whether it lists them. `joined` is the table
 *  the window is at now, `null` while a join is on its way — the table the
 *  choice names, then: a choice asked again before its join answers (the
 *  same folder opened twice) must not leave the header without its name. */
export function panelPick(roots: string[], choice: Choice, joined: string | null): { roots: string[]; current: string | null; choosing: boolean } {
  return { roots, current: joined ?? (choice.kind === "table" ? choice.root : null), choosing: choice.kind === "choose" };
}
