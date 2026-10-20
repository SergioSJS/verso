// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { asDialog, closed, opened } from "../dialogs/a11y";
import { h, ui } from "../dom";
import { icon } from "../icons";
import { layout } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { askOracle, generateSpark, LIKELIHOODS, type Likelihood, type OracleResult, type SparkResult } from "./engine";
import { isPt, os } from "./strings";
import { BUILTIN_ORACLE_TABLES, getAllOracleTables, rollOracleTable, type OracleTable, type TableRollResult } from "./tables";

type OracleTab = "probabilities" | "sparks" | "tables";

export interface OracleDialogOptions {
  leaf?: NoteLeaf;
  docPos?: number;
  calloutBox?: HTMLElement;
  oracleIndex?: number;
  originalQuestion?: string;
}

let shade: HTMLElement | null = null;
let currentTab: OracleTab = "probabilities";
let currentLikelihood: Likelihood = "even";
let lastResult: OracleResult | null = null;
let lastSpark: SparkResult | null = null;
let selectedTable: OracleTable = BUILTIN_ORACLE_TABLES[0]!;
let lastTableResult: TableRollResult | null = null;
let targetContext: OracleDialogOptions | null = null;

/** Open the oracle dialog (ADR 0102 item 3). */
export function showOracleDialog(defaultQuestion = "", options?: OracleDialogOptions): void {
  targetContext = options ?? null;
  if (!shade) shade = build();
  const input = shade.querySelector<HTMLInputElement>(".oracle-question-input");
  if (input) input.value = defaultQuestion;
  const insertBtn = shade.querySelector<HTMLButtonElement>(".oracle-insert-btn");
  if (insertBtn) {
    const isEditingCallout = Boolean(
      targetContext?.calloutBox ||
      targetContext?.docPos !== undefined ||
      targetContext?.oracleIndex !== undefined
    );
    insertBtn.textContent = isEditingCallout
      ? (isPt ? "Gravar no Callout" : "Save in Callout")
      : os.insert;
  }
  shade.hidden = false;
  opened(shade);
  input?.focus();
}

/** The callout ADR 0102 item 4 inserts, and where the cursor goes: after
 *  the answer, so the person writes what the "but" or the "and" is. A
 *  plain callout of an unknown kind in Obsidian. */
export function oracleCallout(question: string, result: OracleResult | null, spark: SparkResult | null, tableResult?: TableRollResult | null): { text: string; cursor: number } {
  if (tableResult) {
    const lines = [
      `> [!oracle] ${tableResult.table.name}`,
      `> **${tableResult.entry}** _(d${tableResult.total}: ${tableResult.roll})_`,
    ];
    const body = lines.join("\n");
    return { text: `${body}\n\n`, cursor: body.length };
  }

  if (result) {
    const lines = [`> [!oracle] ${os.calloutTitle(question.trim())}`];
    if (spark) lines.push(`> ${os.sparkLabel} *${spark.formatted}*`);
    const answerLine = `> **${os.answer[result.answer]}** _(d100: ${result.roll}, ${os.likelihood[result.likelihood]})_ `;
    lines.push(answerLine);
    const body = lines.join("\n");
    return { text: `${body}\n\n`, cursor: body.length };
  }

  if (spark) {
    const lines = [
      `> [!oracle] ${isPt ? "Faísca de Inspiração" : "Idea Spark"}`,
      `> **${os.sparkActionTheme}:** ${spark.action} + ${spark.theme}`,
      `> **${os.sparkDescriptorFocus}:** ${spark.descriptor} + ${spark.focus}`,
    ];
    const body = lines.join("\n");
    return { text: `${body}\n\n`, cursor: body.length };
  }

  const lines = [`> [!oracle] ${os.calloutTitle(question.trim())}`];
  const body = lines.join("\n");
  return { text: `${body}\n\n`, cursor: body.length };
}

function build(): HTMLElement {
  const el = h("div", "confirm oracle-shade");
  el.hidden = true;
  const box = h("div", "confirm-box oracle-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  const titleId = "oracle-dialog-title";
  const header = h("div", "oracle-header");
  const title = h("h2", "oracle-title", os.title);
  title.id = titleId;
  title.prepend(icon("sparkles"));

  const settingsBtn = h("button", "ghost iconic oracle-settings-btn");
  settingsBtn.type = "button";
  settingsBtn.setAttribute("aria-label", isPt ? "Ajustes do Oráculo" : "Oracle Settings");
  settingsBtn.title = isPt ? "Personalizar proporções de probabilidade, palavras de inspiração e tabelas" : "Customize odds, spark words, and random tables";
  settingsBtn.append(icon("gear"));
  settingsBtn.addEventListener("click", () => {
    hide();
    window.dispatchEvent(new CustomEvent("verso:open-oracle-settings"));
  });

  const closeBtn = h("button", "ghost iconic oracle-close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", os.close);
  closeBtn.append(icon("close"));
  header.append(title, settingsBtn, closeBtn);

  // Tab navigation
  const nav = h("div", "oracle-tabs");
  nav.setAttribute("role", "tablist");

  const tabProb = h("button", "oracle-tab-btn active", os.tabProbabilities);
  tabProb.type = "button";
  tabProb.prepend(icon("dice"));

  const tabSpk = h("button", "oracle-tab-btn", os.tabSparks);
  tabSpk.type = "button";
  tabSpk.prepend(icon("sparkles"));

  const tabTbl = h("button", "oracle-tab-btn", os.tabTables);
  tabTbl.type = "button";
  tabTbl.prepend(icon("note"));

  nav.append(tabProb, tabSpk, tabTbl);

  const body = h("div", "oracle-body");

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
  for (const id of LIKELIHOODS) {
    const btn = h("button", `oracle-likelihood-btn ${id === currentLikelihood ? "active" : ""}`);
    btn.type = "button";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(id === currentLikelihood));
    const titleSpan = h("span", "oracle-lh-name", os.likelihood[id]);
    const hintSpan = h("span", "oracle-lh-hint", os.likelihoodHint[id]);
    btn.append(titleSpan, hintSpan);

    btn.addEventListener("click", () => {
      currentLikelihood = id;
      for (const b of btns) {
        b.classList.remove("active");
        b.setAttribute("aria-checked", "false");
      }
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");
    });
    btns.push(btn);
    lButtons.append(btn);
  }
  lRow.append(lLabel, lButtons);

  const probResultCard = h("div", "oracle-result-card");
  probResultCard.setAttribute("role", "status");
  probResultCard.setAttribute("aria-live", "polite");
  probResultCard.hidden = true;

  const outcomeBadge = h("div", "oracle-outcome-badge");
  const rollDetail = h("div", "oracle-roll-detail");
  const sparkArea = h("div", "oracle-spark-area");
  probResultCard.append(outcomeBadge, rollDetail, sparkArea);

  paneProb.append(qRow, lRow, probResultCard);

  // Pane 2: Sparks
  const paneSpk = h("div", "oracle-pane oracle-pane-sparks");
  paneSpk.hidden = true;

  const sparkCards = h("div", "oracle-spark-cards");
  const sparkCard1 = h("div", "oracle-spark-card");
  const sparkTag1 = h("span", "oracle-spark-tag", os.sparkActionTheme);
  const sparkVal1 = h("div", "oracle-spark-val", isPt ? "Descobrir Segredo" : "Discover Secret");
  sparkCard1.append(sparkTag1, sparkVal1);

  const sparkCard2 = h("div", "oracle-spark-card");
  const sparkTag2 = h("span", "oracle-spark-tag", os.sparkDescriptorFocus);
  const sparkVal2 = h("div", "oracle-spark-val", isPt ? "Sombrio Portal" : "Dark Portal");
  sparkCard2.append(sparkTag2, sparkVal2);

  sparkCards.append(sparkCard1, sparkCard2);

  const sparkResultHint = h("div", "oracle-spark-full-hint");
  paneSpk.append(sparkCards, sparkResultHint);

  // Pane 3: Vault Tables
  const paneTbl = h("div", "oracle-pane oracle-pane-tables");
  paneTbl.hidden = true;

  const tableSelectRow = h("div", "oracle-row");
  const tableLabel = h("label", "", os.tableSelect);
  const tableSelect = h("select", "oracle-select");

  const tableDesc = h("div", "oracle-table-desc", selectedTable.desc);

  const populateTableSelect = () => {
    tableSelect.replaceChildren();
    const allTables = getAllOracleTables();
    for (const tbl of allTables) {
      const opt = document.createElement("option");
      opt.value = tbl.id;
      opt.textContent = `${tbl.name} (${tbl.entries.length} opções)`;
      tableSelect.append(opt);
    }
    selectedTable = allTables.find((t) => t.id === tableSelect.value) ?? allTables[0] ?? BUILTIN_ORACLE_TABLES[0]!;
    tableDesc.textContent = selectedTable.desc;
  };

  populateTableSelect();
  window.addEventListener("verso:oracle-tables-changed", () => populateTableSelect());

  tableSelect.addEventListener("change", () => {
    const allTables = getAllOracleTables();
    selectedTable = allTables.find((t) => t.id === tableSelect.value) ?? allTables[0] ?? BUILTIN_ORACLE_TABLES[0]!;
    tableDesc.textContent = selectedTable.desc;
  });

  tableSelectRow.append(tableLabel, tableSelect, tableDesc);

  const manageTablesBtn = h("button", "ghost oracle-customize-link");
  manageTablesBtn.type = "button";
  manageTablesBtn.textContent = isPt ? "⚙️ Criar ou Editar Tabelas Personalizadas..." : "⚙️ Create or Edit Custom Tables...";
  manageTablesBtn.addEventListener("click", () => {
    hide();
    window.dispatchEvent(new CustomEvent("verso:open-oracle-settings"));
  });
  tableSelectRow.append(manageTablesBtn);

  const tableResultCard = h("div", "oracle-table-result-card");
  tableResultCard.hidden = true;
  const tableRollHeader = h("div", "oracle-table-roll-header");
  const tableRollText = h("div", "oracle-table-roll-text");
  tableResultCard.append(tableRollHeader, tableRollText);

  // Guide box explaining how custom tables work
  const guideBox = h("div", "oracle-guide-box");
  const guideTitle = h("strong", "oracle-guide-title", os.customGuideTitle);
  const guideText = h("p", "oracle-guide-text", os.customGuide);
  guideBox.append(guideTitle, guideText);

  paneTbl.append(tableSelectRow, tableResultCard, guideBox);

  body.append(paneProb, paneSpk, paneTbl);

  // Actions row
  const actionRow = h("div", "oracle-actions");

  const leftActions = h("div", "oracle-actions-left");
  const copyBtn = h("button", "ghost oracle-copy-btn", os.copy);
  copyBtn.type = "button";
  copyBtn.prepend(icon("copy"));
  copyBtn.hidden = true;
  leftActions.append(copyBtn);

  const rightActions = h("div", "oracle-actions-right");
  const insertBtn = h("button", "ghost oracle-insert-btn", os.insert);
  insertBtn.type = "button";
  insertBtn.prepend(icon("note"));
  insertBtn.hidden = true;

  const primaryBtn = h("button", "save oracle-primary-btn", os.ask);
  primaryBtn.type = "button";
  primaryBtn.prepend(icon("dice"));

  rightActions.append(insertBtn, primaryBtn);
  actionRow.append(leftActions, rightActions);

  box.append(header, nav, body, actionRow);
  el.append(box);
  document.body.append(el);

  // Switch tabs
  const setTab = (tab: OracleTab) => {
    currentTab = tab;
    tabProb.classList.toggle("active", tab === "probabilities");
    tabSpk.classList.toggle("active", tab === "sparks");
    tabTbl.classList.toggle("active", tab === "tables");

    paneProb.hidden = tab !== "probabilities";
    paneSpk.hidden = tab !== "sparks";
    paneTbl.hidden = tab !== "tables";

    if (tab === "probabilities") {
      primaryBtn.replaceChildren(icon("dice"), os.ask);
      copyBtn.hidden = !lastResult;
      insertBtn.hidden = !lastResult;
    } else if (tab === "sparks") {
      primaryBtn.replaceChildren(icon("sparkles"), os.rollSpark);
      copyBtn.hidden = !lastSpark;
      insertBtn.hidden = !lastSpark;
    } else {
      primaryBtn.replaceChildren(icon("dice"), os.rollTable);
      copyBtn.hidden = !lastTableResult;
      insertBtn.hidden = !lastTableResult;
    }
  };

  tabProb.addEventListener("click", () => setTab("probabilities"));
  tabSpk.addEventListener("click", () => setTab("sparks"));
  tabTbl.addEventListener("click", () => setTab("tables"));

  const hide = () => {
    el.hidden = true;
    closed(el);
  };

  asDialog(el, os.title, hide, titleId);
  closeBtn.addEventListener("click", hide);
  el.addEventListener("mousedown", (e) => {
    if (e.target === el) hide();
  });

  const renderProb = () => {
    probResultCard.hidden = false;
    insertBtn.hidden = false;
    copyBtn.hidden = false;
    if (lastResult) {
      const odds = os.likelihood[lastResult.likelihood];
      outcomeBadge.className = `oracle-outcome-badge oracle-${lastResult.answer}`;
      outcomeBadge.textContent = os.answer[lastResult.answer];
      rollDetail.textContent = os.rolled(lastResult.roll, odds);
      rollDetail.setAttribute("aria-label", os.said(os.answer[lastResult.answer], lastResult.roll, odds));
    }
    sparkArea.replaceChildren(...(lastSpark ? [h("strong", "", `${os.sparkLabel} `), h("em", "", lastSpark.formatted)] : []));
  };

  const renderSpark = () => {
    if (!lastSpark) return;
    sparkVal1.textContent = `${lastSpark.action} ${lastSpark.theme}`;
    sparkVal2.textContent = `${lastSpark.descriptor} ${lastSpark.focus}`;
    sparkResultHint.textContent = `"${lastSpark.action} ${lastSpark.theme} / ${lastSpark.descriptor} ${lastSpark.focus}"`;
    insertBtn.hidden = false;
    copyBtn.hidden = false;
  };

  const renderTable = () => {
    if (!lastTableResult) return;
    tableResultCard.hidden = false;
    tableRollHeader.textContent = `${lastTableResult.table.name} · d${lastTableResult.total}: ${lastTableResult.roll}`;
    tableRollText.textContent = lastTableResult.entry;
    insertBtn.hidden = false;
    copyBtn.hidden = false;
  };

  primaryBtn.addEventListener("click", () => {
    if (currentTab === "probabilities") {
      lastResult = askOracle(currentLikelihood, qInput.value);
      renderProb();
    } else if (currentTab === "sparks") {
      lastSpark = generateSpark(isPt ? "pt" : "en");
      renderSpark();
    } else {
      lastTableResult = rollOracleTable(selectedTable);
      renderTable();
    }
  });

  copyBtn.addEventListener("click", () => {
    let toCopy = "";
    if (currentTab === "probabilities" && lastResult) {
      toCopy = `${qInput.value ? `Q: ${qInput.value}\n` : ""}A: ${os.answer[lastResult.answer]} (d100: ${lastResult.roll}, ${os.likelihood[lastResult.likelihood]})`;
    } else if (currentTab === "sparks" && lastSpark) {
      toCopy = lastSpark.formatted;
    } else if (currentTab === "tables" && lastTableResult) {
      toCopy = `[${lastTableResult.table.name}] ${lastTableResult.entry}`;
    }
    if (toCopy) {
      void navigator.clipboard.writeText(toCopy);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = os.copied;
      setTimeout(() => {
        copyBtn.replaceChildren(icon("copy"), originalText ?? os.copy);
      }, 1500);
    }
  });

  insertBtn.addEventListener("click", () => {
    const active = layout().activeLeaf;
    const leaf: NoteLeaf | null = targetContext?.leaf ?? (active instanceof NoteLeaf ? active : null);
    if (!leaf) {
      ui.status.textContent = os.noNote;
      return;
    }

    // Auto-roll if user clicks insert before clicking primaryBtn
    if (currentTab === "probabilities" && !lastResult) {
      lastResult = askOracle(currentLikelihood, qInput.value);
      renderProb();
    } else if (currentTab === "sparks" && !lastSpark) {
      lastSpark = generateSpark(isPt ? "pt" : "en");
      renderSpark();
    } else if (currentTab === "tables" && !lastTableResult) {
      lastTableResult = rollOracleTable(selectedTable);
      renderTable();
    }

    const { text, cursor } = oracleCallout(
      qInput.value,
      currentTab === "probabilities" ? lastResult : null,
      currentTab === "sparks" ? lastSpark : null,
      currentTab === "tables" ? lastTableResult : null
    );

    const doc = leaf.editor.state.doc;
    let targetStartLine = -1;
    let targetEndLine = -1;

    // 1. If targetContext has docPos (from live preview mode), locate the exact block
    if (targetContext?.docPos !== undefined && targetContext.docPos >= 0) {
      const clampedPos = Math.max(0, Math.min(targetContext.docPos, doc.length));
      const clickLine = doc.lineAt(clampedPos).number;
      // Search upward for > [!oracle]
      let l = clickLine;
      while (l >= 1 && doc.line(l).text.trim().startsWith(">")) {
        if (doc.line(l).text.trim().startsWith("> [!oracle]")) {
          targetStartLine = l;
          break;
        }
        l--;
      }
      if (targetStartLine < 1 && doc.line(clickLine).text.trim().startsWith("> [!oracle]")) {
        targetStartLine = clickLine;
      }
    }

    // 2. If targetContext has oracleIndex (from reading preview mode), locate the N-th oracle callout
    if (targetStartLine < 1 && targetContext?.oracleIndex !== undefined && targetContext.oracleIndex >= 0) {
      let idx = 0;
      for (let l = 1; l <= doc.lines; l++) {
        if (doc.line(l).text.trim().startsWith("> [!oracle]")) {
          if (idx === targetContext.oracleIndex) {
            targetStartLine = l;
            break;
          }
          idx++;
        }
      }
    }

    // 3. If targetContext has originalQuestion, match the callout that has that question
    if (targetStartLine < 1 && targetContext?.originalQuestion) {
      const orig = targetContext.originalQuestion.trim().toLowerCase();
      for (let l = 1; l <= doc.lines; l++) {
        const lineText = doc.line(l).text;
        if (lineText.trim().startsWith("> [!oracle]")) {
          const titleQ = lineText.replace(/^>\s*\[!oracle\]\s*/i, "").trim().toLowerCase();
          if (orig && (titleQ === orig || titleQ.includes(orig) || orig.includes(titleQ))) {
            targetStartLine = l;
            break;
          }
        }
      }
    }

    // 4. If targetContext has calloutBox or we are editing an existing oracle question in current note
    if (targetStartLine < 1 && (targetContext?.calloutBox || qInput.value.trim())) {
      const curQ = qInput.value.trim().toLowerCase();
      for (let l = 1; l <= doc.lines; l++) {
        const lineText = doc.line(l).text;
        if (lineText.trim().startsWith("> [!oracle]")) {
          const titleQ = lineText.replace(/^>\s*\[!oracle\]\s*/i, "").trim().toLowerCase();
          if (curQ && (titleQ === curQ || titleQ.includes(curQ) || curQ.includes(titleQ))) {
            targetStartLine = l;
            break;
          }
        }
      }
    }

    // If an existing callout was located, update in place without jumping scroll
    if (targetStartLine >= 1) {
      let l = targetStartLine;
      while (l + 1 <= doc.lines && doc.line(l + 1).text.trim().startsWith(">")) {
        l++;
      }
      targetEndLine = l;

      const fromPos = doc.line(targetStartLine).from;
      const toPos = doc.line(targetEndLine).to;
      const replacementText = text.trimEnd();

      if (leaf.mode === "preview") {
        leaf.editor.dispatch({
          changes: { from: fromPos, to: toPos, insert: replacementText },
        });
        leaf.repaint();
      } else {
        leaf.editor.dispatch({
          changes: { from: fromPos, to: toPos, insert: replacementText },
          scrollIntoView: false,
        });
      }

      ui.status.textContent = isPt ? "Oráculo gravado na nota!" : "Oracle answer saved to note!";
      hide();
      return;
    }

    // 5. Default fallback: insert at current cursor position (or end of note)
    let at = leaf.editor.state.selection.main.to;
    if (at === 0 && doc.length > 0) {
      at = doc.length;
    }
    const line = doc.lineAt(at);
    const lead = line.length === 0 ? "" : "\n\n";
    const pos = line.length === 0 ? at : line.to;

    leaf.editor.dispatch({
      changes: { from: pos, insert: lead + text },
      scrollIntoView: false,
    });
    if (leaf.mode === "preview") {
      leaf.repaint();
    }
    ui.status.textContent = os.inserted;
    hide();
  });

  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      primaryBtn.click();
    }
  });

  return el;
}
