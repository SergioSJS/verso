// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One list of spark words as chips (ADR 0102 item 6): a word per chip with
// its ×, and a "+ word" field — Enter adds, a pasted list split at commas
// and lines adds each, a repeat or a long word is refused and said. The
// ×s are one stop of the Tab key, walked with the arrows, Home and End;
// Delete or Backspace removes the word under focus. The last word of a
// list stays, and the list says why.

import { h } from "../../dom";
import { addWords, removeWord, WORD_CHARS, WORDS_MOST } from "../../oracle/settingsModel";
import { ow } from "./oracleStrings";

export interface ChipList {
  el: HTMLElement;
  /** Show these words (the field being typed in is kept). */
  set(words: readonly string[]): void;
}

export interface ChipOptions {
  name: string;
  hint: string;
  words: readonly string[];
  readOnly: boolean;
  onChange(words: string[]): void;
}

let lists = 0;

export function chipList(o: ChipOptions): ChipList {
  const id = `orc-words-${++lists}`;
  const el = h("div", "orc-words");
  el.setAttribute("role", "group");
  el.setAttribute("aria-labelledby", `${id}-name`);
  const head = h("div", "orc-words-head");
  const name = h("span", "orc-words-name", o.name);
  name.id = `${id}-name`;
  const count = h("span", "orc-words-count");
  head.append(name, h("span", "orc-words-hint", o.hint), count);
  const chips = h("ul", "orc-chips");
  chips.setAttribute("aria-label", ow.listOf(o.name));
  const msg = h("p", "orc-words-msg");
  msg.id = `${id}-msg`;
  msg.setAttribute("role", "status");
  msg.setAttribute("aria-live", "polite");
  let words = [...o.words];
  /** The × that takes the Tab stop. */
  let current = 0;

  const say = (text: string, bad = false): void => {
    msg.textContent = text;
    msg.classList.toggle("bad", bad);
  };

  const add = h("li", "orc-chip-add");
  const field = h("input", "orc-chip-input");
  field.type = "text";
  field.placeholder = ow.addWord;
  field.maxLength = 2000;
  field.setAttribute("aria-label", ow.addWordLabel(o.name));
  field.setAttribute("aria-describedby", `${id}-msg ${id}-help`);
  field.enterKeyHint = "done";
  const help = h("span", "sr-only", ow.addHint);
  help.id = `${id}-help`;
  add.append(field, help);

  const xs = (): HTMLButtonElement[] => [...chips.querySelectorAll<HTMLButtonElement>(".orc-chip-x")];
  const focusX = (i: number): void => {
    const all = xs();
    if (all.length === 0) return field.focus();
    current = Math.max(0, Math.min(all.length - 1, i));
    all.forEach((b, n) => (b.tabIndex = n === current ? 0 : -1));
    all[current]!.focus();
  };

  const take = (text: string): void => {
    const r = addWords(words, text);
    const told: string[] = [];
    if (r.added.length) told.push(ow.added(r.added.length));
    if (r.repeated.length) told.push(ow.repeated(r.repeated[0]!));
    if (r.tooLong.length) told.push(ow.tooLong(WORD_CHARS));
    if (r.overflow.length) told.push(ow.full(WORDS_MOST));
    say(told.join(" "), r.added.length === 0);
    if (r.added.length === 0) return;
    words = r.list;
    paint();
    o.onChange([...words]);
  };

  const drop = (i: number): void => {
    const next = removeWord(words, i);
    if (!next) return say(ow.lastWord, true);
    const gone = words[i]!;
    words = next;
    paint();
    say(ow.removed(gone));
    o.onChange([...words]);
    focusX(Math.min(i, words.length - 1));
  };

  function paint(): void {
    count.textContent = ow.count(words.length);
    const items = words.map((w, i) => {
      const li = h("li", "orc-chip");
      li.append(h("span", "orc-chip-word", w));
      if (!o.readOnly) {
        const x = h("button", "orc-chip-x", "×");
        x.type = "button";
        x.tabIndex = i === Math.min(current, words.length - 1) ? 0 : -1;
        x.setAttribute("aria-label", ow.remove(w));
        x.title = ow.remove(w);
        if (words.length === 1) x.setAttribute("aria-disabled", "true");
        x.addEventListener("click", () => drop(i));
        x.addEventListener("keydown", (e) => {
          const go: Record<string, number> = { ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: words.length - 1 };
          if (e.key in go) {
            e.preventDefault();
            e.stopPropagation();
            // Past the last word, the field.
            if ((e.key === "ArrowRight" || e.key === "ArrowDown") && i === words.length - 1) return field.focus();
            focusX(go[e.key]!);
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            e.stopPropagation();
            drop(i);
          }
        });
        x.addEventListener("focus", () => (current = i));
        li.append(x);
      }
      return li;
    });
    chips.replaceChildren(...items, ...(o.readOnly ? [] : [add]));
  }

  field.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return;
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      if (field.value.trim()) {
        take(field.value);
        field.value = "";
      }
    } else if (e.key === "Backspace" && field.value === "" && words.length > 0) {
      e.preventDefault();
      focusX(words.length - 1);
    }
  });
  field.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!/[\r\n,;]/.test(text)) return;
    e.preventDefault();
    take(`${field.value},${text}`);
    field.value = "";
  });

  paint();
  el.append(head, chips, msg);
  return {
    el,
    set(next) {
      if (next.length === words.length && next.every((w, i) => w === words[i])) return;
      words = [...next];
      paint();
    },
  };
}
