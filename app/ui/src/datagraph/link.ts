// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The diagram and the text of one file, side by side (ADR 0106 item 6):
// a small registry by path, so that the two tabs need not know each other.
// A text tab says it typed and where its caret is; a diagram tab asks it to
// show a range. Nothing here writes: the diagram is read-only.

import type { Range } from "./view";

/** The text tab of a file, as the diagram sees it. */
export interface TextSide {
  text(): string;
  reveal(range: Range, focus: boolean): void;
}

/** The diagram tab of a file, as the text tab sees it. */
export interface DiagramSide {
  typed(): void;
  caret(pos: number): void;
}

const texts = new Map<string, Set<TextSide>>();
const diagrams = new Map<string, Set<DiagramSide>>();

function add<T>(map: Map<string, Set<T>>, path: string, side: T): () => void {
  let set = map.get(path);
  if (!set) map.set(path, (set = new Set()));
  set.add(side);
  return () => {
    set.delete(side);
    if (set.size === 0 && map.get(path) === set) map.delete(path);
  };
}

export const linkText = (path: string, side: TextSide): (() => void) => add(texts, path, side);
export const linkDiagram = (path: string, side: DiagramSide): (() => void) => add(diagrams, path, side);

/** The text tab typed in `path`. */
export function textTyped(path: string): void {
  for (const d of diagrams.get(path) ?? []) d.typed();
}

/** The caret of the text tab of `path` is at `pos`. */
export function textCaret(path: string, pos: number): void {
  for (const d of diagrams.get(path) ?? []) d.caret(pos);
}

/** What the text tab of `path` holds now (unsaved typing included), or null when none is open. */
export function liveText(path: string): string | null {
  for (const t of texts.get(path) ?? []) return t.text();
  return null;
}

/** Show `range` in the text tab of `path`; false when none is open. */
export function revealInText(path: string, range: Range, focus: boolean): boolean {
  const set = texts.get(path);
  if (!set || set.size === 0) return false;
  for (const t of set) t.reveal(range, focus);
  return true;
}
