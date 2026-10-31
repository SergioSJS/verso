// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { asDialog, closed, opened } from "../dialogs/a11y";
import { h, ui } from "../dom";
import { icon } from "../icons";
import { composeOracle } from "./compose";
import { LIKELIHOODS, type Likelihood, type OracleResult, type SparkResult } from "./engine";
import { oddsIgnored, sparksIgnored } from "./folderData";
import type { OracleHost, OracleTarget } from "./host";
import { drawQuestion, drawSpark, drawTable } from "./room";
import { loadTableRows, scanNoteTables, SCAN_MOST } from "./scan";
import { isPt, os } from "./strings";
import { fallOf } from "./fall";
import { BUILTIN_ORACLE_TABLES, getAllOracleTables, type OracleTable, type TableRollResult } from "./tables";
import { trackOracle } from "./track";
import { writeOracle, type Refusal } from "./write";

/** The folder's tables were found (or found again). */
export const TABLES_FOUND = "verso:oracle-tables-changed";

type OracleTab = "probabilities" | "sparks" | "tables";

export interface OracleDialogOptions {
  /** The note the result is written into. */
  host?: OracleHost | null;
  /** The callout to write into; with none, a new callout goes at the caret. */
  target?: OracleTarget;
}

interface Dialog {
  el: HTMLElement;
  open(question: string): void;
}

let dialog: Dialog | null = null;
let options: OracleDialogOptions = {};
let currentTab: OracleTab = "probabilities";
let currentLikelihood: Likelihood = "even";

/** Open the oracle dialog (ADR 0102 item 3). Every opening starts clean: no
 *  roll of an earlier one is kept. */
export function showOracleDialog(defaultQuestion = "", opts: OracleDialogOptions = {}): void {
  options = opts;
  if (!dialog) dialog = build();
  dialog.open(defaultQuestion);
}

const REFUSALS: Record<Refusal, string> = {
  readOnly: os.readOnly,
  conflict: os.conflictPending,
  readerView: os.readerView,
  stale: os.stale,
  moved: os.moved,
  unchanged: os.unchanged,
};

/** What is said when a write is refused. */
export function refusalText(why: Refusal): string {
  return REFUSALS[why];
}

function build(): Dialog {
  const el = h("div", "confirm oracle-shade");
  el.hidden = true;
  const box = h("div", "confirm-box oracle-box");

  // What this opening has rolled: nothing outlives it.
  let lastResult: OracleResult | null = null;
  let lastSpark: SparkResult | null = null;
  let lastTableResult: TableRollResult | null = null;
  let selectedTable: OracleTable = BUILTIN_ORACLE_TABLES[0]!;

  const titleId = "oracle-dialog-title";
  const header = h("div", "oracle-header");
  const title = h("h2", "oracle-title", os.title);
  title.id = titleId;
  title.prepend(icon("sparkles"));

  const settingsBtn = h("button", "ghost iconic oracle-settings-btn");
  settingsBtn.type = "button";
  settingsBtn.setAttribute("aria-label", os.settingsLabel);
  settingsBtn.title = os.settingsTitle;
  settingsBtn.append(icon("gear"));
  const openSettings = () => {
    hide();
    window.dispatchEvent(new CustomEvent("verso:open-oracle-settings"));
  };
  settingsBtn.addEventListener("click", openSettings);

  const closeBtn = h("button", "ghost iconic oracle-close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", os.close);
  closeBtn.append(icon("close"));
  header.append(title, settingsBtn, closeBtn);

  // Tabs: one tab stop, the arrows move between them.
  const nav = h("div", "oracle-tabs");
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", os.modes);
  const tabIds: OracleTab[] = ["probabilities", "sparks", "tables"];
  const tabButtons = new Map<OracleTab, HTMLButtonElement>();
  const tabIcons: Record<OracleTab, string> = { probabilities: "dice", sparks: "sparkles", tables: "note" };
  const tabLabels: Record<OracleTab, string> = { probabilities: os.tabProbabilities, sparks: os.tabSparks, tables: os.tabTables };
  for (const id of tabIds) {
    const b = h("button", "oracle-tab-btn", tabLabels[id]);
    b.type = "button";
    b.id = `oracle-tab-${id}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", `oracle-pane-${id}`);
    b.prepend(icon(tabIcons[id]));
    tabButtons.set(id, b);
    nav.append(b);
  }

  const body = h("div", "oracle-body");

  // A line the dialog says things in: a stored setting it could not read, a
  // write it refused.
  const note = h("div", "oracle-note");
  note.setAttribute("role", "status");
  note.hidden = true;
  const say = (text: string) => {
    note.textContent = text;
    note.hidden = text === "";
  };

  // Pane 1: Probabilities (Yes/No)
  const paneProb = h("div", "oracle-pane oracle-pane-prob");

  const qRow = h("div", "oracle-row");
  const qLabel = h("label", "", os.question);
  const qInput = h("input", "oracle-question-input");
  qInput.id = "oracle-question";
  qLabel.htmlFor = qInput.id;
  qInput.type = "text";
  qInput.placeholder = os.questionHint;
  qRow.append(qLabel, qInput);

  const lRow = h("div", "oracle-row");
  const lLabel = h("span", "oracle-row-label", os.odds);
  lLabel.id = "oracle-odds-label";
  const lButtons = h("div", "oracle-likelihood-group");
  lButtons.setAttribute("role", "radiogroup");
  lButtons.setAttribute("aria-labelledby", lLabel.id);

  const btns: HTMLButtonElement[] = [];
  const pickLikelihood = (index: number, focus: boolean) => {
    const id = LIKELIHOODS[index]!;
    if (id !== currentLikelihood) discardResult();
    currentLikelihood = id;
    btns.forEach((b, i) => {
      b.classList.toggle("active", i === index);
      b.setAttribute("aria-checked", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    if (focus) btns[index]!.focus();
  };
  LIKELIHOODS.forEach((id, index) => {
    const btn = h("button", "oracle-likelihood-btn");
    btn.type = "button";
    btn.setAttribute("role", "radio");
    btn.append(h("span", "oracle-lh-name", os.likelihood[id]), h("span", "oracle-lh-hint", os.likelihoodHint[id]));
    btn.addEventListener("click", () => pickLikelihood(index, false));
    btn.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      pickLikelihood((index + step + LIKELIHOODS.length) % LIKELIHOODS.length, true);
    });
    btns.push(btn);
    lButtons.append(btn);
  });
  lRow.append(lLabel, lButtons);

  const probResultCard = h("div", "oracle-result-card");
  probResultCard.setAttribute("role", "status");
  probResultCard.setAttribute("aria-live", "polite");
  probResultCard.hidden = true;

  const outcomeBadge = h("div", "oracle-outcome-badge");
  const rollDetail = h("div", "oracle-roll-detail");
  probResultCard.append(outcomeBadge, rollDetail);

  paneProb.append(qRow, lRow, probResultCard);

  // Pane 2: Sparks
  const paneSpk = h("div", "oracle-pane oracle-pane-sparks");
  paneSpk.hidden = true;

  const sparkCards = h("div", "oracle-spark-cards");
  const sparkCard1 = h("div", "oracle-spark-card");
  const sparkVal1 = h("div", "oracle-spark-val", os.sparkPlaceholder);
  sparkCard1.append(h("span", "oracle-spark-tag", os.sparkActionTheme), sparkVal1);
  const sparkCard2 = h("div", "oracle-spark-card");
  const sparkVal2 = h("div", "oracle-spark-val", os.sparkPlaceholder);
  sparkCard2.append(h("span", "oracle-spark-tag", os.sparkDescriptorFocus), sparkVal2);
  sparkCards.append(sparkCard1, sparkCard2);
  sparkCards.setAttribute("role", "status");
  sparkCards.setAttribute("aria-live", "polite");

  const sparkResultHint = h("div", "oracle-spark-full-hint");
  paneSpk.append(sparkCards, sparkResultHint);

  // Pane 3: Tables
  const paneTbl = h("div", "oracle-pane oracle-pane-tables");
  paneTbl.hidden = true;

  const tableSelectRow = h("div", "oracle-row");
  const tableLabel = h("label", "", os.tableSelect);
  const tableSelect = h("select", "oracle-select");
  tableSelect.id = "oracle-table-select";
  tableLabel.htmlFor = tableSelect.id;
  const tableDesc = h("div", "oracle-table-desc", selectedTable.desc);

  const chooseTable = (id: string) => {
    const all = getAllOracleTables();
    selectedTable = all.find((x) => x.id === id) ?? all[0] ?? BUILTIN_ORACLE_TABLES[0]!;
    tableDesc.textContent = selectedTable.desc;
    if (lastTableResult && lastTableResult.table.id !== selectedTable.id) discardResult();
    // A table the index listed: its note is read now that it is chosen.
    if (selectedTable.unread) void loadChosen();
  };
  /** Read the chosen table's rows. False when it reads as no table: it is
   *  taken off the list, and said so. */
  const loadChosen = async (): Promise<boolean> => {
    const want = selectedTable;
    if (!want.unread) return true;
    const loaded = await loadTableRows(want);
    if (!loaded) say(os.tableUnusable(want.name));
    populateTableSelect();
    return loaded !== null;
  };
  const populateTableSelect = () => {
    const keep = selectedTable.id;
    tableSelect.replaceChildren();
    for (const tbl of getAllOracleTables()) {
      const opt = document.createElement("option");
      opt.value = tbl.id;
      opt.textContent = tbl.unread ? tbl.name : `${tbl.name} (${os.options(tbl.entries.length)})`;
      tableSelect.append(opt);
    }
    if (Array.from(tableSelect.options).some((o) => o.value === keep)) tableSelect.value = keep;
    chooseTable(tableSelect.value);
  };
  populateTableSelect();
  window.addEventListener(TABLES_FOUND, populateTableSelect);
  tableSelect.addEventListener("change", () => chooseTable(tableSelect.value));

  const manageTablesBtn = h("button", "ghost oracle-customize-link", os.manageTables);
  manageTablesBtn.type = "button";
  manageTablesBtn.addEventListener("click", openSettings);
  tableSelectRow.append(tableLabel, tableSelect, tableDesc, manageTablesBtn);

  const tableResultCard = h("div", "oracle-table-result-card");
  tableResultCard.setAttribute("role", "status");
  tableResultCard.setAttribute("aria-live", "polite");
  tableResultCard.hidden = true;
  const tableRollHeader = h("div", "oracle-table-roll-header");
  const tableRollText = h("div", "oracle-table-roll-text");
  tableResultCard.append(tableRollHeader, tableRollText);

  const guideBox = h("div", "oracle-guide-box");
  guideBox.append(h("strong", "oracle-guide-title", os.customGuideTitle), h("p", "oracle-guide-text", os.customGuide));

  paneTbl.append(tableSelectRow, tableResultCard, guideBox);

  const panes: Record<OracleTab, HTMLElement> = { probabilities: paneProb, sparks: paneSpk, tables: paneTbl };
  for (const id of tabIds) {
    const p = panes[id];
    p.id = `oracle-pane-${id}`;
    p.setAttribute("role", "tabpanel");
    p.setAttribute("aria-labelledby", `oracle-tab-${id}`);
  }
  body.append(note, paneProb, paneSpk, paneTbl);

  // Actions row
  const actionRow = h("div", "oracle-actions");
  const leftActions = h("div", "oracle-actions-left");
  const copyBtn = h("button", "ghost oracle-copy-btn");
  copyBtn.type = "button";
  copyBtn.append(icon("copy"), os.copy);
  copyBtn.hidden = true;
  leftActions.append(copyBtn);

  const rightActions = h("div", "oracle-actions-right");
  const insertBtn = h("button", "ghost oracle-insert-btn");
  insertBtn.type = "button";
  const primaryBtn = h("button", "save oracle-primary-btn");
  primaryBtn.type = "button";
  rightActions.append(insertBtn, primaryBtn);
  actionRow.append(leftActions, rightActions);

  box.append(header, nav, body, actionRow);
  el.append(box);
  document.body.append(el);

  const hasResult = (): boolean => (currentTab === "probabilities" ? lastResult !== null : currentTab === "sparks" ? lastSpark !== null : lastTableResult !== null);

  const renderButtons = () => {
    const label = options.target ? os.saveInCallout : os.insert;
    insertBtn.replaceChildren(icon("note"), label);
    primaryBtn.replaceChildren(
      icon(currentTab === "sparks" ? "sparkles" : "dice"),
      currentTab === "probabilities" ? os.ask : currentTab === "sparks" ? os.rollSpark : os.rollTable,
    );
    copyBtn.hidden = !hasResult();
  };

  const renderProb = () => {
    probResultCard.hidden = lastResult === null;
    if (lastResult) {
      const odds = os.likelihood[lastResult.likelihood];
      outcomeBadge.className = `oracle-outcome-badge oracle-${lastResult.answer}`;
      outcomeBadge.textContent = os.answer[lastResult.answer];
      rollDetail.textContent = os.rolled(lastResult.roll, odds);
      rollDetail.setAttribute("aria-label", os.said(os.answer[lastResult.answer], lastResult.roll, odds));
    }
  };
  const renderSpark = () => {
    sparkVal1.textContent = lastSpark ? `${lastSpark.action} ${lastSpark.theme}` : os.sparkPlaceholder;
    sparkVal2.textContent = lastSpark ? `${lastSpark.descriptor} ${lastSpark.focus}` : os.sparkPlaceholder;
    sparkResultHint.textContent = lastSpark ? `"${lastSpark.action} ${lastSpark.theme} / ${lastSpark.descriptor} ${lastSpark.focus}"` : "";
  };
  const renderTable = () => {
    tableResultCard.hidden = lastTableResult === null;
    if (lastTableResult) {
      tableRollHeader.textContent = `${lastTableResult.table.name} · d${lastTableResult.total}: ${lastTableResult.roll}`;
      tableRollText.textContent = lastTableResult.entry;
    }
  };
  const renderAll = () => {
    renderProb();
    renderSpark();
    renderTable();
    renderButtons();
  };

  /** A roll belongs to the question and the odds it was made with: change
   *  either and it is gone. */
  function discardResult(): void {
    if (lastResult === null && lastTableResult === null) return;
    lastResult = null;
    lastTableResult = null;
    renderAll();
  }

  const setTab = (tab: OracleTab, focus = false) => {
    currentTab = tab;
    for (const id of tabIds) {
      const b = tabButtons.get(id)!;
      const on = id === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      panes[id].hidden = !on;
    }
    if (focus) tabButtons.get(tab)!.focus();
    renderButtons();
  };
  for (const id of tabIds) {
    const b = tabButtons.get(id)!;
    b.addEventListener("click", () => setTab(id));
    b.addEventListener("keydown", (e) => {
      const at = tabIds.indexOf(id);
      let to = -1;
      if (e.key === "ArrowRight") to = (at + 1) % tabIds.length;
      else if (e.key === "ArrowLeft") to = (at - 1 + tabIds.length) % tabIds.length;
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = tabIds.length - 1;
      if (to < 0) return;
      e.preventDefault();
      setTab(tabIds[to]!, true);
    });
  }

  function hide(): void {
    el.hidden = true;
    closed(el);
    // Stop following the callout this opening was on.
    const view = options.host?.editor;
    if (view && options.target) {
      try {
        view.dispatch({ effects: trackOracle.of(null) });
      } catch {
        // the editor is gone
      }
    }
  }

  asDialog(el, os.title, hide, titleId);
  closeBtn.addEventListener("click", hide);
  el.addEventListener("mousedown", (e) => {
    if (e.target === el) hide();
  });

  /** Roll what the open tab rolls: in a room the server draws and the room
   *  hears it (ADR 0102 item 5), else this window does. False when there is
   *  nothing to roll, or the server refused. */
  let drawing = false;
  const roll = async (): Promise<boolean> => {
    if (drawing) return false;
    drawing = true;
    primaryBtn.disabled = true;
    try {
      const path = options.host?.path;
      let note: string | null = null;
      if (currentTab === "probabilities") {
        const d = await drawQuestion(path, currentLikelihood, qInput.value);
        if (!d.ok) {
          say(d.why);
          return false;
        }
        lastResult = d.value;
        note = d.note;
        // With the 3D switch on the die falls first; the answer shows when it rests.
        await fallOf(100, d.value.roll);
        renderProb();
      } else if (currentTab === "sparks") {
        const d = await drawSpark(path, isPt ? "pt" : "en");
        if (!d.ok) {
          say(d.why);
          return false;
        }
        lastSpark = d.value;
        note = d.note;
        renderSpark();
      } else {
        if (!(await loadChosen())) return false;
        const d = await drawTable(path, selectedTable);
        if (!d.ok) {
          say(d.why);
          return false;
        }
        lastTableResult = d.value;
        note = d.note;
        if (lastTableResult) await fallOf(lastTableResult.total, lastTableResult.roll);
        if (!lastTableResult) {
          say(os.emptyTable);
          renderTable();
          renderButtons();
          return false;
        }
        renderTable();
      }
      say(note ?? "");
      renderButtons();
      return true;
    } finally {
      drawing = false;
      primaryBtn.disabled = false;
      // A disabled button drops the focus (and WebKit on macOS never gave it
      // on the click): Escape would then go to the page, not to the dialog.
      if (!el.hidden && !el.contains(document.activeElement)) primaryBtn.focus({ preventScroll: true });
    }
  };

  primaryBtn.addEventListener("click", () => {
    void roll();
  });
  qInput.addEventListener("input", discardResult);

  copyBtn.addEventListener("click", () => {
    let toCopy = "";
    if (currentTab === "probabilities" && lastResult) {
      toCopy = `${qInput.value ? `${os.copyQuestion} ${qInput.value}\n` : ""}${os.copyAnswer} ${os.answer[lastResult.answer]} (d100: ${lastResult.roll}, ${os.likelihood[lastResult.likelihood]})`;
    } else if (currentTab === "sparks" && lastSpark) {
      toCopy = lastSpark.formatted;
    } else if (currentTab === "tables" && lastTableResult) {
      toCopy = `[${lastTableResult.table.name}] ${lastTableResult.entry}`;
    }
    if (!toCopy) return;
    const done = () => {
      copyBtn.replaceChildren(icon("copy"), os.copied);
      setTimeout(() => copyBtn.replaceChildren(icon("copy"), os.copy), 1500);
    };
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) {
      say(os.copyFailed);
      return;
    }
    clipboard.writeText(toCopy).then(done, () => say(os.copyFailed));
  });

  insertBtn.addEventListener("click", () => void insert());
  const insert = async (): Promise<void> => {
    const host = options.host ?? null;
    if (!host) {
      ui.status.textContent = os.noNote;
      say(os.noNote);
      return;
    }
    // Clicked before a roll: roll now, and write what came up.
    if (!hasResult() && !(await roll())) return;
    const composed = composeOracle(
      os,
      qInput.value,
      currentTab === "probabilities" ? lastResult : null,
      currentTab === "sparks" ? lastSpark : null,
      currentTab === "tables" ? lastTableResult : null,
    );
    const done = writeOracle(host, options.target ?? null, composed);
    if (!done.ok) {
      const why = REFUSALS[done.why];
      say(why);
      ui.status.textContent = why;
      return;
    }
    ui.status.textContent = done.edited ? os.saved : os.inserted;
    hide();
    if (host.mode === "preview") {
      // The reading view is drawn again: its button is not the one that opened this.
      const p = host.preview;
      if (p) {
        if (p.tabIndex < 0) p.tabIndex = -1;
        p.focus({ preventScroll: true });
      }
    } else host.editor.contentDOM.focus({ preventScroll: true });
  };

  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      primaryBtn.click();
    }
  });

  return {
    el,
    open(question: string) {
      lastResult = null;
      lastSpark = null;
      lastTableResult = null;
      qInput.value = question;
      populateTableSelect();
      pickLikelihood(LIKELIHOODS.indexOf(currentLikelihood), false);
      // What the folder's settings held that could not be used, said once, plainly.
      const notes: string[] = [];
      if (oddsIgnored()) notes.push(os.brokenOdds);
      if (sparksIgnored()) notes.push(os.brokenSparks);
      say(notes.join(" "));
      // The folder's tables are found in its notes; the list fills when they are.
      void scanNoteTables().then((found) => {
        window.dispatchEvent(new CustomEvent(TABLES_FOUND));
        if (found.capped) say([...notes, os.scanCapped(SCAN_MOST)].join(" "));
      });
      renderAll();
      setTab(currentTab);
      el.hidden = false;
      opened(el);
      qInput.focus();
    },
  };
}
