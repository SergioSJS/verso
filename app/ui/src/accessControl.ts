// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The segmented control of ADR 0113 section F: *Does not see | Sees |
// Edits*, one per row of the Access dialog and one per file of a player's
// list in the Table's window. A radio group (`role="radiogroup"`): arrow
// keys move the choice, and the choice is made, so it saves at once; one
// tab stop; a word and a mark for every state, never colour alone.

import type { AccessLevel } from "./bindings";
import { ac } from "./accessStrings";
import { h } from "./dom";

const LEVELS: { level: AccessLevel; label: () => string; mark: string }[] = [
  { level: "none", label: () => ac.none, mark: "✗" },
  { level: "see", label: () => ac.see, mark: "👁" },
  { level: "edit", label: () => ac.edit, mark: "✎" },
];

export type Segmented = {
  el: HTMLElement;
  /** Show `level` (none: nothing chosen); makes no save. */
  show(level: AccessLevel | null): void;
  /** Disable some levels (they stay in view, unavailable). */
  disable(levels: AccessLevel[]): void;
  value(): AccessLevel | null;
};

/** `name` is the accessible name of the group ("Ana"). `pick` is called with
 *  the level the person chose, by pointer or by arrow key. */
export function segmented(name: string, initial: AccessLevel | null, pick: (level: AccessLevel) => void, key = ""): Segmented {
  const el = h("div", "ac-seg");
  el.setAttribute("role", "radiogroup");
  el.setAttribute("aria-label", name);
  let current: AccessLevel | null = initial;
  let off: AccessLevel[] = [];
  const buttons = LEVELS.map((l) => {
    const b = h("button", "ac-seg-btn");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset["level"] = l.level;
    // The dialog draws itself again after a save: the focus finds its button by this.
    if (key) b.dataset["key"] = `${key}:${l.level}`;
    b.append(h("span", "ac-seg-mark", l.mark), h("span", "ac-seg-word", l.label()));
    b.querySelector(".ac-seg-mark")?.setAttribute("aria-hidden", "true");
    return b;
  });
  const paint = (): void => {
    const first = buttons.find((b) => b.dataset["level"] === current && !b.disabled) ?? buttons.find((b) => !b.disabled);
    for (const b of buttons) {
      const on = b.dataset["level"] === current;
      b.setAttribute("aria-checked", String(on));
      b.disabled = off.includes(b.dataset["level"] as AccessLevel);
      b.setAttribute("aria-disabled", String(b.disabled));
      b.tabIndex = b === first ? 0 : -1;
      b.classList.toggle("is-on", on);
    }
  };
  const choose = (level: AccessLevel): void => {
    if (off.includes(level)) return;
    current = level;
    paint();
    pick(level);
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => choose(b.dataset["level"] as AccessLevel));
    b.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      for (let k = 1; k <= buttons.length; k++) {
        const next = buttons[(i + step * k + buttons.length * k) % buttons.length]!;
        if (!next.disabled) {
          next.focus();
          choose(next.dataset["level"] as AccessLevel);
          return;
        }
      }
    });
  });
  el.append(...buttons);
  paint();
  return {
    el,
    show(level) {
      current = level;
      paint();
    },
    disable(levels) {
      off = levels;
      paint();
    },
    value: () => current,
  };
}
