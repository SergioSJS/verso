// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle's idea-spark word banks in the settings (ADR 0102): four
// lists, saved in the open folder's settings (item 2) — one set for the
// folder, whatever the language — or the built-in ones of a language. Read-
// only where the person cannot write the folder's settings, with the reason.

import { ask } from "../../dialog";
import { button, h, ui } from "../../dom";
import { builtinSparkWords, folderHasSparks, generateSpark, getSparkWords, type SparkWordLists } from "../../oracle/engine";
import { legacySparksKept, oracleNotWritable, oracleWarnings, saveSparks, sparksIgnored } from "../../oracle/folderData";
import { os } from "../../oracle/strings";
import { LOCALE, t } from "../../strings";
import { feedbackLine } from "./feedback";
import { ss } from "./strings";
import type { ItemCtx } from "./types";

const words = (text: string): string[] => text.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean);

export function sparksControl(ctx: ItemCtx): HTMLElement {
  const wrap = h("div", "oracle-settings-section");
  let activeLang: "pt" | "en" = LOCALE === "pt-BR" ? "pt" : "en";
  const feedback = feedbackLine();
  const why = oracleNotWritable();
  const own = folderHasSparks();
  // An earlier build's words, while the folder sets none: the page starts
  // from them, and they move into the folder with the first save.
  const legacy = own ? null : legacySparksKept();
  const hint = h("p", "settings-hint", why ? ss.notWritable[why] : ss.inFolder);
  const notes = h("div", "settings-feedback");
  if (sparksIgnored()) {
    notes.append(h("p", "settings-hint bad", `${os.brokenSparks} ${ss.ignoredInFile(ss.ignoredSparks)}`));
    for (const w of oracleWarnings().filter((x) => x.startsWith("oracle sparks"))) notes.append(h("p", "settings-hint bad", w));
  }
  if (legacy) notes.append(h("p", "settings-hint", ss.legacyKept));
  if (own) notes.append(h("p", "settings-hint", ss.wordsOfFolder));

  const langBar = h("div", "oracle-lang-bar");
  const ptBtn = button("ghost", ss.langPt);
  const enBtn = button("ghost", ss.langEn);
  const grid = h("div", "oracle-sparks-grid");

  const cols = ss.sparkCols.map((col) => ({ ...col, textarea: h("textarea", "oracle-spark-textarea"), count: h("span", "oracle-spark-count") }));

  const refresh = (): void => {
    for (const [btn, lang] of [[ptBtn, "pt"], [enBtn, "en"]] as const) {
      btn.setAttribute("aria-pressed", String(lang === activeLang));
      btn.classList.toggle("active", lang === activeLang);
    }
    ptBtn.hidden = enBtn.hidden = langLabel.hidden = own;
    const bank: SparkWordLists = own ? getSparkWords(activeLang) : legacy ?? builtinSparkWords(activeLang);
    for (const col of cols) {
      const list = bank[col.key] ?? [];
      col.textarea.value = list.join("\n");
      col.count.textContent = `(${list.length})`;
    }
  };
  const langLabel = h("span", "oracle-lang-label", ss.sparksLang);
  ptBtn.addEventListener("click", () => { activeLang = "pt"; refresh(); });
  enBtn.addEventListener("click", () => { activeLang = "en"; refresh(); });
  langBar.append(langLabel, ptBtn, enBtn);
  langBar.setAttribute("role", "group");
  langBar.setAttribute("aria-label", ss.sparksLang);

  for (const col of cols) {
    const colEl = h("div", "oracle-spark-col");
    const labelWrap = h("div", "oracle-spark-col-label");
    const label = h("label", "oracle-spark-col-name", `${col.icon} ${col.label}`);
    labelWrap.append(label, col.count);
    const hint = h("div", "oracle-spark-col-hint", col.hint);
    col.textarea.rows = 5;
    col.textarea.readOnly = why !== null;
    col.textarea.id = `spark-${col.key}`;
    col.textarea.setAttribute("aria-label", col.label);
    label.htmlFor = col.textarea.id;
    col.textarea.setAttribute("aria-describedby", `${col.textarea.id}-hint`);
    hint.id = `${col.textarea.id}-hint`;
    col.textarea.addEventListener("keydown", (e) => e.stopPropagation());
    col.textarea.addEventListener("input", () => {
      col.count.textContent = `(${words(col.textarea.value).length})`;
    });
    colEl.append(labelWrap, hint, col.textarea);
    grid.append(colEl);
  }
  refresh();

  const actions = h("div", "oracle-actions");
  const saveBtn = button("save", ss.saveWords);
  saveBtn.disabled = why !== null;
  saveBtn.addEventListener("click", () => {
    const parsed = {} as SparkWordLists;
    for (const col of cols) parsed[col.key] = words(col.textarea.value);
    // An emptied column would make the whole set unusable on reading: refuse, and say which.
    const empty = cols.filter((col) => parsed[col.key]!.length === 0).map((col) => col.label);
    if (empty.length > 0) {
      feedback.say(ss.wordsEmptyColumn(empty.join(", ")), true);
      return;
    }
    // Past the core's bounds it would refuse; say which column, here.
    const over = cols.filter((col) => parsed[col.key]!.length > 200 || parsed[col.key]!.some((w) => [...w].length > 60)).map((col) => col.label);
    if (over.length > 0) {
      feedback.say(ss.wordsTooMany(over.join(", "), 200, 60), true);
      return;
    }
    void saveSparks(parsed).then((ok) => {
      if (!ok) return feedback.say(ss.savedFailed, true);
      feedback.say(ss.savedOdds);
      saveBtn.textContent = ss.savedOdds;
      window.setTimeout(() => (saveBtn.textContent = ss.saveWords), 1800);
      // The folder holds the words now: the page shows them as the folder's.
      if (!own) ctx.paint();
    });
  });
  const resetBtn = button("ghost", ss.restoreWords);
  resetBtn.disabled = why !== null;
  resetBtn.addEventListener("click", () => {
    void (async () => {
      if (!(await ask(ss.restoreWordsAsk(activeLang), { yes: ss.restoreWords, no: t.cancel }))) return;
      // The folder's file has no way to unset the lists: the built-in ones are written.
      if (!(await saveSparks(builtinSparkWords(activeLang)))) return feedback.say(ss.savedFailed, true);
      ctx.paint();
      ui.status.textContent = ss.wordsRestored;
    })();
  });
  const testBox = h("span", "oracle-spark-test");
  testBox.setAttribute("role", "status");
  testBox.setAttribute("aria-live", "polite");
  const testBtn = button("ghost", ss.testSpark);
  testBtn.addEventListener("click", () => {
    testBox.textContent = generateSpark(activeLang).formatted;
  });
  actions.append(saveBtn, resetBtn, testBtn, testBox);

  wrap.append(hint, notes, langBar, grid, actions, feedback.el);
  return wrap;
}
