// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The odds by hand (ADR 0102 item 6), behind a disclosure: per level, six
// small number fields and the row's total always shown ("faltam 3%",
// "sobram 2%", "100% ✓"). A row is saved by itself as soon as it adds up
// to 100 — no save button; until then the last row that did applies, and
// the page says so.

import { button, h } from "../../dom";
import { ANSWERS, type Likelihood, type OddsTable } from "../../oracle/engine";
import { cellValue, rowTotal, withRow } from "../../oracle/settingsModel";
import { os } from "../../oracle/strings";
import { LEVELS, swatch } from "./oddsBars";
import { ow } from "./oracleStrings";

export interface Manual {
  el: HTMLDetailsElement;
  /** Show the stored table; `all` also over a row being typed. */
  refresh(stored: OddsTable, all: boolean): void;
  /** Open it and put the caret in the first field. */
  reveal(): void;
}

export interface ManualOptions {
  readOnly: boolean;
  stored(): OddsTable;
  /** Save a table that changed one row; `level` names the row. */
  save(table: OddsTable, level: Likelihood): Promise<void>;
  restore(): void;
}

/** How long typing rests before a row that adds up is saved. */
const REST_MS = 450;

export function oddsManual(o: ManualOptions): Manual {
  const el = h("details", "orc-manual");
  const summary = h("summary", "orc-manual-summary", ow.manual);
  const body = h("div", "orc-manual-body");
  body.append(h("p", "orc-hint", ow.manualLead));

  // The answers' names once, over the columns, where the page is wide.
  const head = h("div", "orc-manual-head");
  head.setAttribute("aria-hidden", "true");
  for (const a of ANSWERS) {
    const c = h("span", "orc-manual-col");
    c.append(swatch(a), h("span", "", os.answer[a]));
    head.append(c);
  }
  body.append(head);

  const inputs = {} as Record<Likelihood, HTMLInputElement[]>;
  const totals = {} as Record<Likelihood, HTMLElement>;
  const kept = {} as Record<Likelihood, HTMLElement>;
  const rows = {} as Record<Likelihood, HTMLFieldSetElement>;
  const timers = new Map<Likelihood, number>();

  const read = (lh: Likelihood): number[] | null => {
    const v = inputs[lh].map((i) => cellValue(i.value));
    return v.every((n): n is number => n !== null) ? v : null;
  };
  const same = (a: readonly number[], b: readonly number[]) => a.every((n, i) => n === b[i]);

  /** Say what the row lacks; true when it can be saved. */
  const judge = (lh: Likelihood): boolean => {
    const v = read(lh);
    const total = v ? rowTotal(v) : null;
    const ok = total?.kind === "ok";
    totals[lh].textContent = !total ? ow.notANumber : total.kind === "ok" ? ow.complete : total.kind === "missing" ? ow.missing(total.by) : ow.over(total.by);
    rows[lh].classList.toggle("is-off", !ok);
    kept[lh].hidden = ok;
    for (const i of inputs[lh]) i.setAttribute("aria-invalid", String(!ok));
    return ok;
  };

  const commit = (lh: Likelihood): void => {
    window.clearTimeout(timers.get(lh));
    timers.delete(lh);
    if (!judge(lh)) return;
    const v = read(lh)!;
    const stored = o.stored();
    if (same(v, stored[lh])) return;
    void o.save(withRow(stored, lh, v), lh);
  };

  for (const lh of LEVELS) {
    const fs = h("fieldset", "orc-row");
    rows[lh] = fs;
    fs.append(h("legend", "sr-only", os.likelihood[lh]));
    const top = h("div", "orc-row-head");
    const name = h("span", "orc-row-name", os.likelihood[lh]);
    name.setAttribute("aria-hidden", "true");
    totals[lh] = h("span", "orc-row-total");
    totals[lh].setAttribute("role", "status");
    totals[lh].setAttribute("aria-live", "polite");
    top.append(name, totals[lh]);
    const cells = h("div", "orc-cells");
    inputs[lh] = ANSWERS.map((a) => {
      const cell = h("label", "orc-cell");
      const lab = h("span", "orc-cell-label");
      lab.append(swatch(a), h("span", "", os.answer[a]));
      const input = h("input", "orc-cell-input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = "0";
      input.max = "100";
      input.step = "1";
      input.disabled = o.readOnly;
      input.setAttribute("aria-label", ow.fieldLabel(os.likelihood[lh], os.answer[a]));
      // Arrow keys step the number, not the settings' list.
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") e.stopPropagation();
        if (e.key === "Enter") commit(lh);
      });
      input.addEventListener("input", () => {
        window.clearTimeout(timers.get(lh));
        if (judge(lh)) timers.set(lh, window.setTimeout(() => commit(lh), REST_MS));
      });
      input.addEventListener("change", () => commit(lh));
      cell.append(lab, input);
      cells.append(cell);
      return input;
    });
    kept[lh] = h("p", "orc-row-kept", ow.rowKept);
    kept[lh].hidden = true;
    fs.append(top, cells, kept[lh]);
    body.append(fs);
  }

  if (!o.readOnly) {
    const actions = h("div", "orc-manual-actions");
    const reset = button("ghost", ow.restoreDefault);
    reset.addEventListener("click", () => o.restore());
    actions.append(reset);
    body.append(actions);
  }

  el.append(summary, body);

  const refresh = (stored: OddsTable, all: boolean): void => {
    for (const lh of LEVELS) {
      const typing = inputs[lh].some((i) => i === document.activeElement) || timers.has(lh) || rows[lh].classList.contains("is-off");
      if (typing && !all) continue;
      window.clearTimeout(timers.get(lh));
      timers.delete(lh);
      inputs[lh].forEach((i, n) => (i.value = String(stored[lh][n] ?? 0)));
      judge(lh);
    }
  };
  refresh(o.stored(), true);

  return {
    el,
    refresh,
    reveal() {
      el.open = true;
      inputs[LEVELS[0]!][0]?.focus();
    },
  };
}
