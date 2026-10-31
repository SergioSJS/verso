// The position under a point of the screen, as `view.posAtCoords` answers
// it, but never a throw. CodeMirror 6.43 (still in 6.43.15) can reach a
// line the height map holds and the drawn lines do not, and then fails
// inside its own scan: "null is not an object (evaluating 'tile.length')"
// (bug report 2026-10-29). A pointer over such a line finds no position:
// the caller does as it does for a point outside the text.

import type { EditorView } from "@codemirror/view";

type Point = { x: number; y: number };

/** The position at `point`, or null where CodeMirror finds none or fails;
 *  `precise: false` estimates outside the drawn lines as CodeMirror does. */
export function posAt(view: Pick<EditorView, "posAtCoords">, point: Point, precise = true): number | null {
  try {
    return precise ? view.posAtCoords(point) : view.posAtCoords(point, false);
  } catch {
    return null;
  }
}
