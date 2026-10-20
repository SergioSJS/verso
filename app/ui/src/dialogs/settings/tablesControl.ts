// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle's tables in the settings (ADR 0102 item 3): a table of one's
// own is a note — a list with an `^id` — so this lists the tables the
// folder's notes hold (each with its note, a click opens it), makes a new
// note after showing exactly what will be written, writes an imported JSON
// the same way, and moves what an earlier build kept in the window's
// storage into one note. Every question is the app's (`ask`, `promptText`,
// `tell`), never the window's: in the desktop host the native ones answer
// wrongly (ADR 0062).

import { commands } from "../../bindings";
import { ask, promptText, tell } from "../../dialog";
import { button, h, ui } from "../../dom";
import { afterFileChange } from "../../changes";
import { currentFolder } from "../../folder";
import { openNote } from "../../layout/spaces";
import { legacyTables, clearLegacyTables, type LegacyTable } from "../../oracle/legacy";
import { oracleNotWritable } from "../../oracle/folderData";
import { forgetScan, scanNoteTables, SCAN_MOST } from "../../oracle/scan";
import { BUILTIN_ORACLE_TABLES, getAllOracleTables, type OracleTable } from "../../oracle/tables";
import { folderOf, freeNotePath, noteNameOf, tablesNoteText, type TableToWrite } from "../../oracle/tableNote";
import { t } from "../../strings";
import { copyWithAnswer, feedbackLine } from "./feedback";
import { ss } from "./strings";
import { readTable, TABLE_LIMITS } from "./tableRead";
import type { ItemCtx } from "./types";

function legacyStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function tablesControl(ctx: ItemCtx): HTMLElement {
  const wrap = h("div", "oracle-settings-section");
  const feedback = feedbackLine();
  const why = oracleNotWritable();
  // Creating a note needs a folder open and a person who may write it; the
  // folder's settings file being unusable does not stop a note.
  const canCreate = currentFolder !== "" && why !== "reader" && why !== "folder";

  const topBar = h("div", "oracle-actions");
  const newBtn = button("save", ss.newTable);
  const importBtn = button("ghost", ss.importJson);
  const exportBtn = button("ghost", ss.exportMine);
  newBtn.disabled = importBtn.disabled = !canCreate;
  topBar.append(newBtn, importBtn, exportBtn);
  const listWrap = h("div", "oracle-custom-tables-list");
  const scanLine = h("p", "settings-hint", currentFolder ? ss.scanning : ss.noFolder);
  scanLine.setAttribute("role", "status");
  if (!canCreate && why) feedback.say(ss.notWritable[why]);

  /** Show `text` as it will be written, and write it as a new note in the
   *  folder asked for; the note's path, or null when the person declined. */
  const writeNote = async (title: string, tables: TableToWrite[]): Promise<string | null> => {
    const typed = await promptText(ss.tableWhere, ss.defaultTablesFolder, false, { yes: ss.save, no: t.cancel });
    if (typed === null) return null;
    const folder = folderOf(typed);
    if (folder === null) {
      feedback.say(ss.tableWhereBad, true);
      return null;
    }
    const noteName = noteNameOf(title);
    // A new note takes the name of none that is there.
    const listed = await commands.listNotes();
    const path = freeNotePath(folder, noteName, new Set(listed.status === "ok" ? listed.data.map((p) => p.toLowerCase()) : []));
    const { text } = tablesNoteText(tables.length === 1 ? tables[0]!.name : noteName, tables);
    if (!(await ask(ss.createNoteAsk(path, text), { yes: ss.createNote, no: t.cancel }))) return null;
    const r = await commands.createNote(path.replace(/\.md$/i, ""), text);
    if (r.status !== "ok") {
      feedback.say(ss.tableCreateFailed(r.error.message), true);
      return null;
    }
    await afterFileChange();
    forgetScan();
    feedback.say(ss.tableCreated(r.data.path));
    return r.data.path;
  };

  newBtn.addEventListener("click", () => {
    void (async () => {
      const opts = { yes: ss.save, no: t.cancel };
      const name = await promptText(ss.tableName, "", false, opts);
      if (name === null) return;
      if (!name.trim()) return feedback.say(ss.tableNeedsName, true);
      const entriesRaw = await promptText(ss.tableEntries, "", true, opts);
      if (entriesRaw === null) return;
      const read = readTable({ name, entries: entriesRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });
      if (!read) {
        const empty = entriesRaw.trim() === "";
        return feedback.say(empty ? ss.tableNeedsEntry : ss.tableTooLong(TABLE_LIMITS.name, TABLE_LIMITS.entries, TABLE_LIMITS.entry), true);
      }
      const path = await writeNote(read.name, [{ name: read.name, entries: read.entries }]);
      if (path) ctx.paint();
    })();
  });

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
      const tables: TableToWrite[] = [];
      for (const raw of list) {
        const read = readTable(raw);
        if (read) tables.push({ name: read.name, desc: read.desc, entries: read.entries });
      }
      if (tables.length === 0) return void (await tell(ss.importTablesNone, ss.ok));
      const path = await writeNote(tables.length === 1 ? tables[0]!.name : ss.importedNote, tables);
      if (!path) return;
      if (list.length > tables.length) ui.status.textContent = ss.importSkipped(list.length - tables.length);
      ctx.paint();
    })();
  });

  // What an earlier build kept in this window's storage: shown, then moved
  // into one note.
  const storage = legacyStorage();
  const legacy = storage ? legacyTables(storage) : { tables: [] as LegacyTable[], skipped: 0 };
  const banner = h("div", "oracle-legacy-tables");
  if (legacy.tables.length > 0) {
    const move = button("save", ss.legacyMove);
    move.disabled = !canCreate;
    move.addEventListener("click", () => {
      void (async () => {
        const path = await writeNote(ss.legacyNoteName, legacy.tables);
        if (!path) return;
        if (storage) clearLegacyTables(storage);
        ui.status.textContent = ss.legacyMoved(path);
        ctx.paint();
      })();
    });
    banner.append(h("p", "settings-hint", ss.legacyTables(legacy.tables.length)), move);
  }

  let mine: readonly OracleTable[] = [];
  exportBtn.disabled = true;
  exportBtn.addEventListener("click", () => {
    if (mine.length === 0) return feedback.say(ss.nothingToExport, true);
    const out = mine.map((x) => ({ name: x.name, desc: x.desc, entries: x.entries }));
    void copyWithAnswer(exportBtn, JSON.stringify(out, null, 2), ss.exportMine, ss.copied, ss.copyFailed, feedback.say);
  });

  const row = (tbl: OracleTable): HTMLElement => {
    const isBuiltin = BUILTIN_ORACLE_TABLES.includes(tbl);
    const r = h("div", "oracle-custom-table-row");
    const info = h("div", "oracle-custom-table-info");
    const titleBox = h("div", "oracle-custom-table-title");
    titleBox.append(
      h("span", "oracle-custom-table-name", tbl.name),
      h("span", isBuiltin ? "statblock-pill-tag" : "statblock-pill-default", isBuiltin ? ss.builtinFem : ss.custom),
      h("span", "oracle-spark-count", ss.items(tbl.entries.length)),
    );
    info.append(titleBox, h("span", "oracle-custom-table-desc", tbl.desc));
    const actions = h("div", "oracle-custom-table-actions");
    if (isBuiltin) {
      const view = button("ghost", ss.view);
      view.addEventListener("click", () => void tell(`${tbl.name}\n\n${tbl.entries.map((e, i) => `${i + 1}. ${e}`).join("\n")}`, ss.ok));
      actions.append(view);
    } else if (tbl.note) {
      const note = tbl.note;
      const open = button("ghost", ss.openNote);
      open.title = note;
      open.addEventListener("click", () => openNote(note, false));
      actions.append(open);
    }
    r.append(info, actions);
    return r;
  };
  const paint = (found: readonly OracleTable[], capped: boolean): void => {
    mine = found;
    exportBtn.disabled = found.length === 0;
    listWrap.replaceChildren(...getAllOracleTables().map(row));
    scanLine.textContent = capped ? ss.noteTablesCapped(SCAN_MOST) : found.length === 0 ? ss.noteTablesNone : "";
    scanLine.hidden = scanLine.textContent === "";
  };
  listWrap.replaceChildren(...BUILTIN_ORACLE_TABLES.map(row));
  if (currentFolder) {
    void scanNoteTables(true).then((s) => {
      if (wrap.isConnected) paint(s.tables, s.capped);
    });
  }

  wrap.append(topBar, feedback.el, banner, scanLine, listWrap);
  return wrap;
}
