// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle's odds table in the settings (ADR 0102): the thirty numbers
// of the five likelihoods, with ready-made sets, saved only when every row
// adds up to 100. It lives in the open folder's settings (item 2), so it
// is read-only where the person cannot write them, and says why.

import { ask } from "../../dialog";
import { button, h, ui } from "../../dom";
import { DEFAULT_ODDS_TABLE, folderHasOdds, getOddsTable, LIKELIHOODS, type Likelihood, type OddsTable, oddsFromRows } from "../../oracle/engine";
import { legacyOddsKept, oddsIgnored, oracleNotWritable, oracleWarnings, saveOdds } from "../../oracle/folderData";
import { os } from "../../oracle/strings";
import { t } from "../../strings";
import { feedbackLine } from "./feedback";
import { ODDS_PRESETS, type OddsData } from "./oddsPresets";
import { ss } from "./strings";
import type { ItemCtx } from "./types";

export function oddsControl(ctx: ItemCtx): HTMLElement {
  const wrap = h("div", "oracle-settings-section");
  const why = oracleNotWritable();
  // An earlier build's odds, while the folder sets none: the page starts
  // from them, and they move into the folder with the first save.
  const legacy = !folderHasOdds() ? oddsFromRows(legacyOddsKept()) : null;
  const odds: OddsTable = legacy ?? getOddsTable();
  const data = {} as OddsData;
  for (const lh of LIKELIHOODS) data[lh] = [...odds[lh]] as OddsData[Likelihood];
  const inputs = {} as Record<Likelihood, HTMLInputElement[]>;
  const badges = {} as Record<Likelihood, HTMLElement>;
  for (const lh of LIKELIHOODS) inputs[lh] = [];
  const feedback = feedbackLine();
  const hint = h("p", "settings-hint", why ? ss.notWritable[why] : ss.inFolder);
  const notes = h("div", "settings-feedback");
  if (oddsIgnored()) {
    notes.append(h("p", "settings-hint bad", `${os.brokenOdds} ${ss.ignoredInFile(ss.ignoredOdds)}`));
    for (const w of oracleWarnings().filter((x) => x.startsWith("oracle odds"))) notes.append(h("p", "settings-hint bad", w));
  }
  if (legacy) notes.append(h("p", "settings-hint", ss.legacyKept));

  const sum = (lh: Likelihood): number => data[lh].reduce((a, b) => a + b, 0);
  const paintSum = (lh: Likelihood): void => {
    const total = sum(lh);
    const badge = badges[lh];
    badge.textContent = `${total}% ${total === 100 ? "✓" : "⚠️"}`;
    badge.className = `oracle-odds-sum ${total === 100 ? "valid" : "invalid"}`;
  };

  // Ready-made sets.
  const presetsRow = h("div", "oracle-odds-presets");
  presetsRow.append(h("span", "oracle-preset-title", ss.presetsLabel));
  const presetText = {
    mythic: { name: "🎯 Mythic GME 2e", desc: ss.presetMythic },
    ironsworn: { name: "⚔️ Ironsworn", desc: ss.presetIronsworn },
    balanced: { name: ss.balanced, desc: ss.presetBalanced },
    narrative: { name: ss.narrative, desc: ss.presetNarrative },
  };
  for (const preset of ODDS_PRESETS) {
    const text = presetText[preset.id];
    const btn = h("button", "oracle-preset-btn", text.name);
    btn.type = "button";
    btn.title = text.desc;
    btn.disabled = why !== null;
    btn.addEventListener("click", () => {
      for (const lh of LIKELIHOODS) {
        data[lh] = [...preset.data[lh]];
        data[lh].forEach((v, i) => {
          const inp = inputs[lh][i];
          if (inp) inp.value = String(v);
        });
        paintSum(lh);
      }
    });
    presetsRow.append(btn);
  }

  const table = h("table", "oracle-odds-table");
  const trH = h("tr");
  for (const head of ss.oddsHead) trH.append(h("th", "", head));
  const thead = h("thead");
  thead.append(trH);
  table.append(thead);
  const tbody = h("tbody");
  for (const lh of LIKELIHOODS) {
    const tr = h("tr");
    tr.append(h("td", "oracle-odds-name", ss.likelihood[lh]));
    for (let col = 0; col < 6; col++) {
      const td = h("td");
      const input = h("input", "oracle-odds-input");
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.value = String(data[lh][col]);
      input.disabled = why !== null;
      input.setAttribute("aria-label", ss.oddsRowLabel(ss.likelihood[lh], ss.oddsHead[col + 1] ?? ""));
      input.addEventListener("keydown", (e) => e.stopPropagation());
      input.addEventListener("input", () => {
        data[lh][col] = Math.max(0, Math.min(100, Number.parseInt(input.value, 10) || 0));
        paintSum(lh);
      });
      inputs[lh].push(input);
      td.append(input);
      tr.append(td);
    }
    const sumTd = h("td");
    badges[lh] = h("span", "oracle-odds-sum");
    sumTd.append(badges[lh]);
    tr.append(sumTd);
    paintSum(lh);
    tbody.append(tr);
  }
  table.append(tbody);
  const tableWrap = h("div", "oracle-odds-table-wrap");
  tableWrap.append(table);

  const actions = h("div", "oracle-actions");
  const saveBtn = button("save", ss.saveOdds);
  saveBtn.disabled = why !== null;
  saveBtn.addEventListener("click", () => {
    // A row that does not add up is refused, said with its name; nothing
    // is saved until all five do.
    const bad = LIKELIHOODS.filter((lh) => sum(lh) !== 100).map((lh) => ss.likelihood[lh]);
    if (bad.length > 0) {
      feedback.say(ss.oddsNot100(bad.join(", ")), true);
      return;
    }
    void saveOdds(data).then((ok) => {
      if (!ok) return feedback.say(ss.savedFailed, true);
      feedback.say(ss.savedOdds);
      saveBtn.textContent = ss.savedOdds;
      window.setTimeout(() => (saveBtn.textContent = ss.saveOdds), 1800);
    });
  });
  const resetBtn = button("ghost", ss.restoreOdds);
  resetBtn.disabled = why !== null;
  resetBtn.addEventListener("click", () => {
    void (async () => {
      if (!(await ask(ss.restoreOddsAsk, { yes: ss.restoreOdds, no: t.cancel }))) return;
      if (!(await saveOdds({ ...DEFAULT_ODDS_TABLE }))) return feedback.say(ss.savedFailed, true);
      ctx.paint();
      ui.status.textContent = ss.oddsRestored;
    })();
  });
  actions.append(saveBtn, resetBtn);

  wrap.append(hint, notes, presetsRow, tableWrap, actions, feedback.el);
  return wrap;
}
