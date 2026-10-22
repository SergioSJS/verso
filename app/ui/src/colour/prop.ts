// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The swatch of a property's value (ADR 0108 item 3), kept apart from the
// reading view's so that the properties panel does not pull the window in.

import { cssOf, parseCode } from "./code";
import { cs } from "./strings";

/** The swatch of a property's value, beside its field: shown while the field
 *  holds exactly a colour code, and drawn again as it is typed. It only shows. */
export function propSwatch(input: HTMLInputElement, enabled: () => boolean = () => true): HTMLElement {
  const sw = document.createElement("span");
  sw.className = "swatch swatch-prop";
  sw.setAttribute("role", "img");
  const chip = document.createElement("span");
  chip.className = "swatch-chip";
  sw.append(chip);
  const sync = (): void => {
    const code = input.value.trim();
    const read = enabled() ? parseCode(code) : null;
    sw.hidden = read === null;
    if (read) {
      chip.style.setProperty("--sw", cssOf(read.colour));
      sw.setAttribute("aria-label", cs.shows(code));
    }
  };
  input.addEventListener("input", sync);
  sync();
  return sw;
}
