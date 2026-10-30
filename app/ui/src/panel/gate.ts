// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One rule for every panel that follows a stream of events (presence, saves,
// the table's log): a panel that is not on screen draws nothing, it only
// remembers that what it shows is stale; the moment it is shown it draws once,
// from the current state. While it is on screen, a burst of events is one
// drawing per frame. What must be heard (the live regions) is not drawing and
// never goes through here.

export type Gate = {
  /** Something the panel shows changed. */
  poke(): void;
  /** The panel may have become visible (opened, tab chosen, window resized). */
  reveal(): void;
  /** Draw now (the panel was just built or mounted), whatever is owed. */
  now(): void;
  /** Draw now if the panel is on screen, else only owe the drawing (for callers that expect the result at once). */
  draw(): void;
  /** True while a drawing is owed (hidden with stale content, or a frame is pending). */
  readonly stale: boolean;
};

/** `draw(late)`: `late` is true when the drawing catches up on events that
 *  came while the panel was not on screen. */
export function gate(shown: () => boolean, draw: (late: boolean) => void): Gate {
  let owed = false;
  let missed = false;
  let frame = 0;
  const run = (): void => {
    frame = 0;
    owed = false;
    const late = missed;
    missed = false;
    draw(late);
  };
  return {
    poke(): void {
      if (!shown()) {
        // Nothing to draw for, and a pending frame is no longer wanted.
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        owed = true;
        missed = true;
        return;
      }
      owed = true;
      if (!frame) frame = requestAnimationFrame(run);
    },
    now(): void {
      if (frame) cancelAnimationFrame(frame);
      run();
    },
    draw(): void {
      if (shown()) return this.now();
      owed = true;
      missed = true;
    },
    reveal(): void {
      if (!owed || !shown()) return;
      if (frame) cancelAnimationFrame(frame);
      run();
    },
    get stale(): boolean {
      return owed;
    },
  };
}
