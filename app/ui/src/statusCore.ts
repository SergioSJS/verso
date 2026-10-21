// What the status line says aloud (accessibility review, 3.3). The line is
// always on screen; a screen reader hears it only when it carries something
// the user did not just do themselves: a refused write, an error, a count.
// A routine "Saved." after an autosave is not announced.

import { en, pt } from "./strings";

const ROUTINE = new Set([pt.saved, en.saved]);

/** The text to put in the live region for what the status line now shows. */
export function announcedText(shown: string): string {
  return ROUTINE.has(shown.trim()) ? "" : shown;
}
