// One click or two on a graph node: a click centres the graph on it at once,
// a second click on the same node inside the double-click interval opens it.
// Kept apart from the nodes because centring redraws them: the memory of the
// last tap lives in the graph, not in an element that is about to go. A touch
// double tap arrives as two `click` events too, so one rule serves mouse and
// finger.

/** The platform's usual double-click interval, in ms. */
export const DOUBLE_CLICK_MS = 250;

export type Tap = { id: string; at: number } | null;

/** What this click is, and what to remember for the next. A double does not
 *  count towards a triple: the next click starts over. */
export function tapKind(last: Tap, id: string, at: number, within = DOUBLE_CLICK_MS): { kind: "single" | "double"; last: Tap } {
  if (last && last.id === id && at - last.at <= within) return { kind: "double", last: null };
  return { kind: "single", last: { id, at } };
}
