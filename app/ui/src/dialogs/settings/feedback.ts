// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { h, ui } from "../../dom";

/** A line under a control that says what the last action did, read aloud
 *  as it changes, and said in the status bar too (every action gives a
 *  visible answer, refusals included). */
export function feedbackLine(): { el: HTMLElement; say: (text: string, bad?: boolean) => void } {
  const el = h("p", "settings-hint settings-feedback");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.hidden = true;
  return {
    el,
    say: (text, bad = false) => {
      el.textContent = text;
      el.hidden = text === "";
      el.classList.toggle("bad", bad);
      ui.status.textContent = text;
    },
  };
}

/** Put `text` on the clipboard and say so on `btn` for a moment; a refusal
 *  is said instead. */
export async function copyWithAnswer(btn: HTMLButtonElement, text: string, label: string, done: string, failed: string, say: (t: string, bad?: boolean) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = done;
    window.setTimeout(() => (btn.textContent = label), 1800);
  } catch {
    say(failed, true);
  }
}

/** A feedback line that can offer to undo what was just done: the words,
 *  and a button that undoes, until the next thing is said. */
export function undoLine(undoLabel: string): { el: HTMLElement; say: (text: string, bad?: boolean, undo?: () => void) => void } {
  const el = h("p", "settings-hint settings-feedback orc-said");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.hidden = true;
  const words = h("span");
  const btn = h("button", "orc-undo", undoLabel);
  btn.type = "button";
  btn.hidden = true;
  let run: (() => void) | null = null;
  btn.addEventListener("click", () => {
    const r = run;
    run = null;
    btn.hidden = true;
    r?.();
  });
  el.append(words, btn);
  return {
    el,
    say: (text, bad = false, undo) => {
      words.textContent = text;
      el.hidden = text === "";
      el.classList.toggle("bad", bad);
      run = undo ?? null;
      btn.hidden = !undo;
      ui.status.textContent = text;
    },
  };
}
