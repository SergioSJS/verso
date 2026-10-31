// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle's odds on the settings page (ADR 0102 items 1, 2 and 6): the
// five levels drawn as bars, a style to pick — applied and saved at once,
// with a way to undo — and the numbers by hand behind a disclosure. They
// live in the open folder's settings, so where the person cannot write
// them everything is read-only (the page's opening says why).

import { button, h } from "../../dom";
import { folderHasOdds, getOddsTable, type Likelihood, type OddsTable, oddsFromRows } from "../../oracle/engine";
import { legacyOddsKept, oddsIgnored, ORACLE_DATA_CHANGED, oracleNotWritable, saveOdds, clearOdds } from "../../oracle/folderData";
import { STYLE_IDS, type StyleId, styleOf, styleTable } from "../../oracle/settingsModel";
import { os } from "../../oracle/strings";
import { undoLine } from "./feedback";
import { oddsBars } from "./oddsBars";
import { oddsManual } from "./oddsManual";
import { ow } from "./oracleStrings";

/** How long the arrow keys may rest on a style before it is saved: walking
 *  the radio group draws each style, and saves only the one left on. */
const PICK_REST_MS = 350;

let groups = 0;

export function oddsControl(): HTMLElement {
  const readOnly = oracleNotWritable() !== null;
  const n = ++groups;
  const section = h("section", "orc-section");
  const title = h("h3", "orc-heading", ow.oddsTitle);
  title.id = `orc-odds-${n}`;
  section.setAttribute("aria-labelledby", title.id);
  section.append(title, h("p", "orc-lead", ow.oddsLead));

  const bars = oddsBars();
  const said = undoLine(ow.undo);

  /** Save `table`, say `text`, offer to go back to `undoTo`. */
  const save = async (table: OddsTable, text: string, undoTo?: OddsTable): Promise<boolean> => {
    const ok = await saveOdds(table);
    if (!ok) {
      said.say(ow.saveFailed, true);
      refresh(true);
      return false;
    }
    said.say(text, false, undoTo ? () => void apply(undoTo, ow.undone) : undefined);
    return true;
  };
  const apply = async (table: OddsTable, text: string): Promise<boolean> => {
    const ok = await save(table, text);
    if (ok) refresh(true);
    return ok;
  };

  if (oddsIgnored()) section.append(h("p", "orc-note bad", ow.ignoredOdds));
  // What an earlier build kept in this window, while the folder sets none:
  // offered, never applied unasked.
  const legacy = !folderHasOdds() ? oddsFromRows(legacyOddsKept()) : null;
  if (legacy && !readOnly) {
    const note = h("div", "orc-note");
    const use = button("ghost", ow.legacyOddsUse);
    use.addEventListener("click", () => void apply(legacy, ow.undone).then((ok) => ok && note.remove()));
    note.append(h("p", "", ow.legacyOdds), use);
    section.append(note);
  }

  // ---- the style
  const styles = h("fieldset", "orc-styles");
  styles.append(h("legend", "orc-subheading", ow.styleLegend));
  const radios = new Map<StyleId | "custom", HTMLInputElement>();
  let pickTimer = 0;
  /** Draw a style at once; save it once the keys rest on it. */
  const pick = (id: StyleId): void => {
    const before = getOddsTable();
    const table = styleTable(id);
    bars.paint(table);
    window.clearTimeout(pickTimer);
    pickTimer = window.setTimeout(() => {
      pickTimer = 0;
      if (styleOf(getOddsTable()) === id) return;
      void save(table, ow.styleApplied(ow.styles[id].name), before).then((ok) => ok && manual.refresh(getOddsTable(), true));
    }, PICK_REST_MS);
  };
  const option = (id: StyleId | "custom"): HTMLElement => {
    const words = id === "custom" ? ow.custom : ow.styles[id];
    const label = h("label", "orc-style");
    // The hover; the same words are in the visible description, so a
    // keyboard or a screen reader reads them with the option.
    const tip = id === "custom" ? undefined : (ow.styles[id] as { tip?: string }).tip;
    if (tip) label.title = tip;
    const radio = h("input");
    radio.type = "radio";
    radio.name = `orc-style-${n}`;
    radio.value = id;
    radio.disabled = readOnly;
    radios.set(id, radio);
    const text = h("span", "orc-style-text");
    const top = h("span", "orc-style-name", words.name);
    if (id === "balanced") top.append(h("span", "orc-tag", ow.defaultTag));
    text.append(top, h("span", "orc-style-desc", words.desc));
    label.append(radio, text);
    radio.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") e.stopPropagation();
    });
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      if (id === "custom") return manual.reveal();
      pick(id);
    });
    return label;
  };
  const cards = h("div", "orc-style-grid");
  for (const id of STYLE_IDS) cards.append(option(id));
  cards.append(option("custom"));
  styles.append(cards);

  const manual = oddsManual({
    readOnly,
    stored: getOddsTable,
    save: async (table: OddsTable, level: Likelihood) => void (await save(table, ow.rowSaved(os.likelihood[level]))),
    restore: () => {
      const before = getOddsTable();
      void clearOdds().then((ok) => {
        if (ok) said.say(ow.restored, false, () => void apply(before, ow.undone));
        else said.say(ow.saveFailed, true);
        refresh(true);
      });
    },
  });

  function refresh(all: boolean): void {
    const now = getOddsTable();
    if (!pickTimer) {
      bars.paint(now);
      // "Custom" picked by hand stays picked while its numbers are a style's.
      const custom = radios.get("custom")!;
      if (all || !custom.checked) radios.get(styleOf(now))!.checked = true;
    }
    manual.refresh(now, all);
  }
  refresh(true);
  const heard = (): void => {
    if (!section.isConnected) return void removeEventListener(ORACLE_DATA_CHANGED, heard);
    refresh(false);
  };
  addEventListener(ORACLE_DATA_CHANGED, heard);

  section.append(bars.el, styles, said.el, manual.el);
  return section;
}
