// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The two questions of the table's music (ADR 0116 items 9 and 24): a file
// some players do not see — release it to the table and play, play without
// them, or cancel, never silent (Q3 a) — and "Play a file…", the folder's
// sound files as a list. Both are the page's own dialog (`dialog.ts`'s
// look): focus inside, Escape and a click outside cancel, the safe button
// first.

import { trackName } from "./scene";
import { st } from "./strings";

type Choice<T> = { label: string; value: T; primary?: boolean; desc?: string };

function modal<T>(title: string, choices: Choice<T>[], cancel: T, list = false): Promise<T> {
  return new Promise<T>((resolve) => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shade = document.createElement("div");
    shade.className = "confirm";
    const box = document.createElement("div");
    box.className = list ? "confirm-box table-sound-pick" : "confirm-box";
    box.setAttribute("role", list ? "dialog" : "alertdialog");
    box.setAttribute("aria-modal", "true");
    const text = document.createElement(list ? "h2" : "p");
    text.id = `table-sound-ask-${Math.random().toString(36).slice(2)}`;
    text.textContent = title;
    box.setAttribute("aria-labelledby", text.id);
    const actions = document.createElement(list ? "ul" : "div");
    actions.className = list ? "table-sound-pick-list" : "confirm-actions";
    const buttons: HTMLButtonElement[] = [];
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "ghost";
    cancelButton.textContent = st.cancel;
    let done = false;
    const finish = (v: T) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      shade.remove();
      if (back?.isConnected) back.focus();
      resolve(v);
    };
    cancelButton.addEventListener("click", () => finish(cancel));
    if (!list) {
      actions.append(cancelButton);
      buttons.push(cancelButton);
    }
    for (const c of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = c.primary ? "save" : list ? "ghost table-sound-pick-item" : "ghost";
      b.textContent = c.label;
      if (c.desc) b.title = c.desc;
      b.addEventListener("click", () => finish(c.value));
      buttons.push(b);
      if (list) {
        const li = document.createElement("li");
        li.append(b);
        actions.append(li);
      } else actions.append(b);
    }
    box.append(text, actions);
    if (list) {
      const foot = document.createElement("div");
      foot.className = "confirm-actions";
      foot.append(cancelButton);
      buttons.push(cancelButton);
      box.append(foot);
    }
    shade.append(box);
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(cancel);
      } else if (e.key === "Tab" || ((e.key === "ArrowDown" || e.key === "ArrowUp") && list)) {
        e.preventDefault();
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const back = e.shiftKey || e.key === "ArrowUp";
        const next = (i + (back ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    shade.addEventListener("mousedown", (e) => {
      if (e.target === shade) {
        e.preventDefault();
        finish(cancel);
      }
    });
    document.addEventListener("keydown", onKey, true);
    document.body.append(shade);
    (list ? buttons[0] : cancelButton)?.focus();
  });
}

/** Some players do not see the file: what the game master does (item 9). */
export function askUnheard(names: string[]): Promise<"release" | "without" | "cancel"> {
  return modal<"release" | "without" | "cancel">(
    st.askUnheard(names.length, names.join(", ")),
    [
      { label: st.without, value: "without" },
      { label: st.release, value: "release", primary: true },
    ],
    "cancel",
  );
}

/** "Play a file…": one of the folder's sound files, or none. */
export function pickTrack(files: readonly string[]): Promise<string | null> {
  if (files.length === 0) {
    return modal<string | null>(st.pickNone, [], null);
  }
  return modal<string | null>(
    st.pickTitle,
    files.map((f) => ({ label: trackName(f), value: f, desc: f })),
    null,
    true,
  );
}
