// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle's idea sparks on the settings page (ADR 0102 items 2 and 6).
// Off, the sparks draw Verso's own words in the window's language — shown
// as a preview, never a language to choose here. On, the folder's own four
// lists, as chips, saved by themselves a moment after each change, one set
// whatever the language. Back to Verso's words takes the lists out of the
// folder's file (the contract's `clear_sparks`), with a way to undo.

import { button, h } from "../../dom";
import { icon } from "../../icons";
import { builtinSparkWords, folderHasSparks, generateSpark, getSparkWords, type SparkWordLists } from "../../oracle/engine";
import { legacySparksKept, ORACLE_DATA_CHANGED, oracleNotWritable, saveSparks, clearSparks, sparksIgnored } from "../../oracle/folderData";
import { copyWords, sameWords } from "../../oracle/settingsModel";
import { isPt } from "../../oracle/strings";
import { chipList, type ChipList } from "./chipList";
import { undoLine } from "./feedback";
import { ow } from "./oracleStrings";

const KEYS = ["action", "theme", "descriptor", "focus"] as const;
/** The words a list's preview shows before "and N more". */
const PREVIEW = 6;
/** How long changes rest before the words are saved. */
const REST_MS = 600;

let groups = 0;

export function sparksControl(): HTMLElement {
  const lang = isPt ? "pt" : "en";
  const readOnly = oracleNotWritable() !== null;
  const n = ++groups;
  const section = h("section", "orc-section");
  const title = h("h3", "orc-heading", ow.sparksTitle);
  title.id = `orc-sparks-${n}`;
  section.setAttribute("aria-labelledby", title.id);
  section.append(title, h("p", "orc-lead", ow.sparksLead));
  if (sparksIgnored()) section.append(h("p", "orc-note bad", ow.ignoredWords));
  // What an earlier build kept in this window, while the folder sets none:
  // the lists start from them, and they move in with the first change.
  const legacy = folderHasSparks() ? null : legacySparksKept();
  if (legacy) section.append(h("p", "orc-note", ow.legacyWords));

  // ---- an example, to see what a spark is
  const tryRow = h("div", "orc-try");
  const tryBtn = button("ghost", ow.sparkTry);
  tryBtn.prepend(icon("dice"));
  const out = h("output", "orc-try-out");
  out.setAttribute("aria-live", "polite");
  tryBtn.addEventListener("click", () => (out.textContent = generateSpark(lang).formatted));
  tryRow.append(tryBtn, out);

  // ---- the switch
  let own = folderHasSparks() || legacy !== null;
  let words: SparkWordLists = folderHasSparks() ? copyWords(getSparkWords(lang)) : legacy ? copyWords(legacy) : builtinSparkWords(lang);
  const switchRow = h("div", "orc-switch-row");
  const sw = h("label", "switch");
  const box = h("input");
  box.type = "checkbox";
  box.id = `orc-own-${n}`;
  box.checked = own;
  box.disabled = readOnly;
  sw.append(box, h("span", "switch-track"));
  const swText = h("div", "orc-switch-text");
  const swLabel = h("label", "orc-switch-label", ow.ownWords);
  swLabel.htmlFor = box.id;
  const swDesc = h("p", "orc-hint");
  swDesc.id = `${box.id}-desc`;
  box.setAttribute("aria-describedby", swDesc.id);
  swText.append(swLabel, swDesc);
  switchRow.append(sw, swText);

  const grid = h("div", "orc-words-grid");
  const back = button("ghost", ow.backToVerso);
  back.classList.add("orc-back");
  const said = undoLine(ow.undo);
  let lists: Partial<Record<(typeof KEYS)[number], ChipList>> = {};
  let timer = 0;

  /** Save `next`, or take the lists out of the file when it is null. */
  const save = async (next: SparkWordLists | null, text: string, undo?: () => void): Promise<boolean> => {
    const ok = next ? await saveSparks(next) : await clearSparks();
    if (!ok) said.say(ow.saveFailed, true);
    else if (text) said.say(text, false, undo);
    return ok;
  };
  const later = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      void save(copyWords(words), "").then((ok) => ok && describe());
    }, REST_MS);
  };

  const describe = (): void => {
    swDesc.textContent = !own ? ow.ownWordsOff : folderHasSparks() ? ow.ownWordsOn : ow.ownWordsPending;
    back.hidden = !own || readOnly;
  };

  const paint = (): void => {
    lists = {};
    describe();
    if (!own) {
      // Verso's own words, in the window's language: a few of each list.
      const builtin = builtinSparkWords(lang);
      grid.replaceChildren(
        ...KEYS.map((k) => {
          const card = h("div", "orc-words orc-words-preview");
          const head = h("div", "orc-words-head");
          head.append(h("span", "orc-words-name", ow.lists[k].name), h("span", "orc-words-hint", ow.lists[k].hint), h("span", "orc-words-count", ow.count(builtin[k].length)));
          const list = builtin[k];
          const more = list.length - PREVIEW;
          const text = h("p", "orc-preview-words", list.slice(0, PREVIEW).join(" · "));
          if (more > 0) text.append(h("span", "orc-preview-more", ` ${ow.andMore(more)}`));
          card.append(head, text);
          return card;
        }),
      );
      return;
    }
    grid.replaceChildren(
      ...KEYS.map((k) => {
        const list = chipList({
          name: ow.lists[k].name,
          hint: ow.lists[k].hint,
          words: words[k],
          readOnly,
          onChange: (next) => {
            words = { ...words, [k]: next };
            later();
          },
        });
        lists[k] = list;
        return list.el;
      }),
    );
  };

  /** Back to Verso's words; `undoTo` brings the folder's words back. */
  const toVerso = async (): Promise<void> => {
    window.clearTimeout(timer);
    timer = 0;
    const had = folderHasSparks() ? copyWords(getSparkWords(lang)) : null;
    own = false;
    box.checked = false;
    if (had) {
      const ok = await save(null, ow.backDone, () => {
        void save(had, ow.undone).then((done) => {
          if (!done) return;
          own = true;
          box.checked = true;
          words = copyWords(had);
          paint();
        });
      });
      if (!ok) {
        own = true;
        box.checked = true;
      }
    }
    paint();
  };

  box.addEventListener("change", () => {
    if (box.checked) {
      own = true;
      words = builtinSparkWords(lang);
      paint();
      lists.action?.el.querySelector<HTMLInputElement>(".orc-chip-input")?.focus();
    } else void toVerso();
  });
  back.addEventListener("click", () => void toVerso());

  paint();
  // Another window (or device) changed the words: shown, unless a change
  // made here is still waiting to be saved.
  const heard = (): void => {
    if (!section.isConnected) return void removeEventListener(ORACLE_DATA_CHANGED, heard);
    if (timer) return;
    if (folderHasSparks()) {
      const theirs = getSparkWords(lang);
      if (own && sameWords(theirs, words)) return describe();
      own = true;
      box.checked = true;
      words = copyWords(theirs);
      if (Object.keys(lists).length === KEYS.length) for (const k of KEYS) lists[k]!.set(words[k]);
      else paint();
    } else describe();
  };
  addEventListener(ORACLE_DATA_CHANGED, heard);

  section.append(tryRow, switchRow, grid, back, said.el);
  return section;
}
