// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The swatch of a property's value (ADR 0108 item 3), kept apart from the
// reading view's so that the properties panel does not pull the window in.

import { cssOf, formatLike, parseCode } from "./code";
import { cs } from "./strings";

export type PropSwatchOptions = {
  /** Whether the "Colour swatches" switch is on; not asked: it is. */
  enabled?: () => boolean;
  /** Set when the value may be changed: the swatch is then a button that
   *  opens the picker. `commit` writes the input's text as an edit of the
   *  field, the way leaving the field does (stale check included). Not set
   *  in a read-only note: the swatch then only shows. */
  commit?: () => void;
};

/** The swatch of a property's value, beside its field: shown while the field
 *  holds exactly a colour code, drawn again as it is typed and when the
 *  switch changes. When the note may be edited a click or Enter opens the
 *  picker; the chosen colour is put in the field in the code's own format
 *  and written when the picker closes, by the panel's own edit path. */
export function propSwatch(input: HTMLInputElement, opts: PropSwatchOptions = {}): HTMLElement {
  const enabled = opts.enabled ?? (() => true);
  const commit = opts.commit;
  const sw = document.createElement(commit ? "button" : "span");
  sw.className = "swatch swatch-prop";
  if (commit) sw.setAttribute("type", "button");
  else sw.setAttribute("role", "img");
  const chip = document.createElement("span");
  chip.className = "swatch-chip";
  sw.append(chip);
  const sync = (): void => {
    const code = input.value.trim();
    const read = enabled() ? parseCode(code) : null;
    sw.hidden = read === null;
    if (read) {
      chip.style.setProperty("--sw", cssOf(read.colour));
      const name = commit ? cs.adjust(code) : cs.shows(code);
      sw.setAttribute("aria-label", name);
      if (commit) sw.title = name;
    }
  };
  input.addEventListener("input", sync);
  const onSwitch = (): void => {
    // A panel drawn again leaves this swatch behind: stop listening.
    if (!sw.isConnected) window.removeEventListener("verso:features-changed", onSwitch);
    else sync();
  };
  window.addEventListener("verso:features-changed", onSwitch);
  if (commit) {
    sw.addEventListener("mousedown", (e) => e.preventDefault());
    sw.addEventListener("click", async (e) => {
      e.preventDefault();
      const original = input.value;
      const read = parseCode(original.trim());
      if (!read || input.disabled) return;
      // Loaded when first used: the picker pulls the window's DOM helpers in.
      const { openPicker } = await import("./picker");
      openPicker({
        anchor: sw,
        colour: read.colour,
        format: (c) => formatLike(read.style, c),
        write: (code) => {
          input.value = code;
          sync();
          return true;
        },
        restore: () => {
          input.value = original;
          sync();
        },
        // Closing applies what was chosen (Esc put the original back, so
        // there is nothing to write): one edit of the field, like leaving it.
        onClose: () => commit(),
      });
    });
  }
  sync();
  return sw;
}
