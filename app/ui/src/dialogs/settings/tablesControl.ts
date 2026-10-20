// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle's own tables in the settings (ADR 0102): made, edited,
// imported from JSON, copied out and deleted. Every question is the app's
// (`ask`, `promptText`, `tell`), never the window's: in the desktop host
// the native ones answer wrongly (ADR 0062).

import { ask, promptText, tell } from "../../dialog";
import { button, h, ui } from "../../dom";
import { BUILTIN_ORACLE_TABLES, deleteCustomOracleTable, getAllOracleTables, type OracleTable, saveCustomOracleTable } from "../../oracle/tables";
import { t } from "../../strings";
import { copyWithAnswer, feedbackLine } from "./feedback";
import { ss } from "./strings";
import { readTable, TABLE_LIMITS } from "./tableRead";
import type { ItemCtx } from "./types";

let serial = 0;
/** An id that names no built-in table and no table already kept. */
function freshId(taken: Set<string>): string {
  let id = "";
  do id = `custom-table-${Date.now().toString(36)}-${(++serial).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  while (taken.has(id));
  return id;
}

export function tablesControl(ctx: ItemCtx): HTMLElement {
  const wrap = h("div", "oracle-settings-section");
  const all = getAllOracleTables();
  const taken = new Set(all.map((x) => x.id));
  const mine = all.filter((x) => !BUILTIN_ORACLE_TABLES.includes(x));
  const feedback = feedbackLine();

  const topBar = h("div", "oracle-actions");
  const newBtn = button("save", ss.newTable);
  const importBtn = button("ghost", ss.importJson);
  const exportBtn = button("ghost", ss.exportMine);
  topBar.append(newBtn, importBtn, exportBtn);
  const listWrap = h("div", "oracle-custom-tables-list");

  const edit = async (existing?: OracleTable): Promise<void> => {
    const opts = { yes: ss.save, no: t.cancel };
    const name = await promptText(ss.tableName, existing?.name ?? "", false, opts);
    if (name === null) return;
    if (!name.trim()) return feedback.say(ss.tableNeedsName, true);
    const desc = await promptText(ss.tableDesc, existing?.desc ?? "", false, opts);
    if (desc === null) return;
    const entriesRaw = await promptText(ss.tableEntries, existing ? existing.entries.join("\n") : "", true, opts);
    if (entriesRaw === null) return;
    const read = readTable({ name, desc, entries: entriesRaw.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean) });
    if (!read) {
      const empty = entriesRaw.trim() === "";
      return feedback.say(empty ? ss.tableNeedsEntry : ss.tableTooLong(TABLE_LIMITS.name, TABLE_LIMITS.entries, TABLE_LIMITS.entry), true);
    }
    saveCustomOracleTable({ id: existing?.id ?? freshId(taken), name: read.name, desc: read.desc, icon: existing?.icon ?? "dice", entries: read.entries });
    ui.status.textContent = ss.tableSaved(read.name);
    ctx.paint();
  };

  newBtn.addEventListener("click", () => void edit());

  importBtn.addEventListener("click", () => {
    void (async () => {
      const json = await promptText(ss.pasteTables, "", true, { yes: ss.importJson, no: t.cancel });
      if (json === null || !json.trim()) return;
      if (json.length > TABLE_LIMITS.importKb * 1024) return void (await tell(ss.importTooBig(TABLE_LIMITS.importKb), ss.ok));
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch (err) {
        return void (await tell(ss.importTablesFail(err instanceof Error ? err.message : String(err)), ss.ok));
      }
      const list = Array.isArray(parsed) ? parsed : [parsed];
      let imported = 0;
      for (const raw of list) {
        const read = readTable(raw);
        if (!read) continue;
        // The id is always new: a table cannot take a built-in's place or
        // overwrite one the person already has.
        const id = freshId(taken);
        taken.add(id);
        saveCustomOracleTable({ id, name: read.name, desc: read.desc, icon: "dice", entries: read.entries });
        imported++;
      }
      if (imported === 0) return void (await tell(ss.importTablesNone, ss.ok));
      ui.status.textContent = ss.importTablesOk(imported, list.length - imported);
      ctx.paint();
    })();
  });

  exportBtn.disabled = mine.length === 0;
  exportBtn.addEventListener("click", () => {
    if (mine.length === 0) return feedback.say(ss.nothingToExport, true);
    void copyWithAnswer(exportBtn, JSON.stringify(mine, null, 2), ss.exportMine, ss.copied, ss.copyFailed, feedback.say);
  });

  for (const tbl of all) {
    const isBuiltin = BUILTIN_ORACLE_TABLES.includes(tbl);
    const row = h("div", "oracle-custom-table-row");
    const info = h("div", "oracle-custom-table-info");
    const titleBox = h("div", "oracle-custom-table-title");
    titleBox.append(
      h("span", "oracle-custom-table-name", tbl.name),
      h("span", isBuiltin ? "statblock-pill-tag" : "statblock-pill-default", isBuiltin ? ss.builtinFem : ss.custom),
      h("span", "oracle-spark-count", ss.items(tbl.entries.length)),
    );
    info.append(titleBox, h("span", "oracle-custom-table-desc", tbl.desc));

    const actions = h("div", "oracle-custom-table-actions");
    const viewBtn = button("ghost", isBuiltin ? ss.view : ss.edit);
    viewBtn.addEventListener("click", () => {
      if (isBuiltin) void tell(`${tbl.name}\n\n${tbl.entries.map((e, i) => `${i + 1}. ${e}`).join("\n")}`, ss.ok);
      else void edit(tbl);
    });
    const jsonBtn = button("ghost", "JSON");
    jsonBtn.title = ss.exportJson;
    jsonBtn.addEventListener("click", () => void copyWithAnswer(jsonBtn, JSON.stringify(tbl, null, 2), "JSON", ss.copied, ss.copyFailed, feedback.say));
    actions.append(viewBtn, jsonBtn);
    if (!isBuiltin) {
      const delBtn = button("ghost danger", ss.remove);
      delBtn.addEventListener("click", () => {
        void (async () => {
          if (!(await ask(ss.tableDeleteAsk(tbl.name), { yes: ss.remove, no: t.cancel }))) return;
          deleteCustomOracleTable(tbl.id);
          ui.status.textContent = ss.tableDeleted(tbl.name);
          ctx.paint();
        })();
      });
      actions.append(delBtn);
    }
    row.append(info, actions);
    listWrap.append(row);
  }

  wrap.append(topBar, feedback.el, listWrap);
  return wrap;
}
