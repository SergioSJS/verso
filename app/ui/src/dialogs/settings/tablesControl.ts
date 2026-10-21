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
import { forgetScan, loadAllRows, scanNoteTables, SCAN_MOST } from "../../oracle/scan";
import { BUILTIN_ORACLE_TABLES, getAllOracleTables, type OracleTable } from "../../oracle/tables";
import { folderOf, freeNotePath, noteNameOf, tablesNoteText, type TableToWrite } from "../../oracle/tableNote";
import { t } from "../../strings";
import { copyWithAnswer, feedbackLine } from "./feedback";
import { ow } from "./oracleStrings";
import { readTable, TABLE_LIMITS } from "./tableRead";

function legacyStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

let groups = 0;

/** An option as read in a preview: a link's words without its brackets
 *  (`[[Note|shown]]` → "shown", `[[Note#Part]]` → "Note"). */
function plainText(option: string): string {
  return option.replace(/!?\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, shown?: string) => (shown ?? target).trim());
}

export function tablesControl(repaint: () => void): HTMLElement {
  const wrap = h("section", "orc-section");
  const heading = h("h3", "orc-heading", ow.tablesTitle);
  heading.id = `orc-tables-${++groups}`;
  wrap.setAttribute("aria-labelledby", heading.id);
  const feedback = feedbackLine();
  const why = oracleNotWritable();
  // Creating a note needs a folder open and a person who may write it; the
  // folder's settings file being unusable does not stop a note.
  const canCreate = currentFolder !== "" && why !== "reader" && why !== "folder";

  const topBar = h("div", "orc-actions");
  const newBtn = button("save", ow.newTable);
  const importBtn = button("ghost", ow.importJson);
  const exportBtn = button("ghost", ow.exportMine);
  newBtn.disabled = importBtn.disabled = !canCreate;
  topBar.append(newBtn, importBtn, exportBtn);
  const listWrap = h("ul", "orc-tables");
  const scanLine = h("p", "orc-hint", currentFolder ? ow.scanning : ow.noFolder);
  scanLine.setAttribute("role", "status");
  if (!canCreate && currentFolder) feedback.say(ow.tablesReadOnly);

  /** Show `text` as it will be written, and write it as a new note in the
   *  folder asked for; the note's path, or null when the person declined. */
  const writeNote = async (title: string, tables: TableToWrite[]): Promise<string | null> => {
    const typed = await promptText(ow.tableWhere, ow.defaultTablesFolder, false, { yes: ow.save, no: t.cancel });
    if (typed === null) return null;
    const folder = folderOf(typed);
    if (folder === null) {
      feedback.say(ow.tableWhereBad, true);
      return null;
    }
    const noteName = noteNameOf(title);
    // A new note takes the name of none that is there.
    const listed = await commands.listNotes();
    const path = freeNotePath(folder, noteName, new Set(listed.status === "ok" ? listed.data.map((p) => p.toLowerCase()) : []));
    const { text } = tablesNoteText(tables.length === 1 ? tables[0]!.name : noteName, tables);
    if (!(await ask(ow.createNoteAsk(path, text), { yes: ow.createNote, no: t.cancel }))) return null;
    const r = await commands.createNote(path.replace(/\.md$/i, ""), text);
    if (r.status !== "ok") {
      feedback.say(ow.tableCreateFailed(r.error.message), true);
      return null;
    }
    await afterFileChange();
    forgetScan();
    feedback.say(ow.tableCreated(r.data.path));
    return r.data.path;
  };

  newBtn.addEventListener("click", () => {
    void (async () => {
      const opts = { yes: ow.save, no: t.cancel };
      const name = await promptText(ow.tableName, "", false, opts);
      if (name === null) return;
      if (!name.trim()) return feedback.say(ow.tableNeedsName, true);
      const entriesRaw = await promptText(ow.tableEntries, "", true, opts);
      if (entriesRaw === null) return;
      const read = readTable({ name, entries: entriesRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });
      if (!read) {
        const empty = entriesRaw.trim() === "";
        return feedback.say(empty ? ow.tableNeedsEntry : ow.tableTooLong(TABLE_LIMITS.name, TABLE_LIMITS.entries, TABLE_LIMITS.entry), true);
      }
      const path = await writeNote(read.name, [{ name: read.name, entries: read.entries }]);
      if (path) repaint();
    })();
  });

  importBtn.addEventListener("click", () => {
    void (async () => {
      const json = await promptText(ow.pasteTables, "", true, { yes: ow.importJson, no: t.cancel });
      if (json === null || !json.trim()) return;
      if (json.length > TABLE_LIMITS.importKb * 1024) return void (await tell(ow.importTooBig(TABLE_LIMITS.importKb), ow.ok));
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch (err) {
        return void (await tell(ow.importTablesFail(err instanceof Error ? err.message : String(err)), ow.ok));
      }
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const tables: TableToWrite[] = [];
      for (const raw of list) {
        const read = readTable(raw);
        if (read) tables.push({ name: read.name, desc: read.desc, entries: read.entries });
      }
      if (tables.length === 0) return void (await tell(ow.importTablesNone, ow.ok));
      const path = await writeNote(tables.length === 1 ? tables[0]!.name : ow.importedNote, tables);
      if (!path) return;
      if (list.length > tables.length) ui.status.textContent = ow.importSkipped(list.length - tables.length);
      repaint();
    })();
  });

  // What an earlier build kept in this window's storage: shown, then moved
  // into one note.
  const storage = legacyStorage();
  const legacy = storage ? legacyTables(storage) : { tables: [] as LegacyTable[], skipped: 0 };
  const banner = h("div", "orc-note");
  banner.hidden = true;
  if (legacy.tables.length > 0) {
    const move = button("save", ow.legacyMove);
    move.disabled = !canCreate;
    move.addEventListener("click", () => {
      void (async () => {
        const path = await writeNote(ow.legacyNoteName, legacy.tables);
        if (!path) return;
        if (storage) clearLegacyTables(storage);
        ui.status.textContent = ow.legacyMoved(path);
        repaint();
      })();
    });
    banner.append(h("p", "", ow.legacyTables(legacy.tables.length)), move);
    banner.hidden = false;
  }

  let mine: readonly OracleTable[] = [];
  exportBtn.disabled = true;
  exportBtn.addEventListener("click", () => {
    if (mine.length === 0) return feedback.say(ow.nothingToExport, true);
    const out = mine.map((x) => ({ name: x.name, desc: x.desc, entries: x.entries }));
    void copyWithAnswer(exportBtn, JSON.stringify(out, null, 2), ow.exportMine, ow.copied, ow.copyFailed, feedback.say);
  });

  const row = (tbl: OracleTable): HTMLElement => {
    const isBuiltin = BUILTIN_ORACLE_TABLES.includes(tbl);
    const r = h("li", "orc-table");
    // A table with a die repeats an option for each face it owns: counted
    // and shown once each, in order, with the die beside the count.
    const options = [...new Set(tbl.entries)];
    const top = h("div", "orc-table-top");
    const count = h("span", "orc-table-count", ow.entries(options.length));
    if (tbl.die) count.append(h("span", "orc-table-die", ` · ${tbl.die}`));
    top.append(h("span", "orc-table-name", tbl.name), count);
    const from = h("div", "orc-table-from");
    if (isBuiltin) {
      from.append(h("span", "orc-tag", ow.fromVerso));
    } else if (tbl.note) {
      // The note it comes from, as a link that opens it.
      const note = tbl.note;
      const link = h("button", "orc-table-link", ow.fromNote(note.replace(/\.md$/i, "").replace(/^.*\//, "")));
      link.type = "button";
      link.title = ow.openNote;
      link.addEventListener("click", () => openNote(note, false));
      from.append(link);
    }
    // Three of its options, to see what it draws.
    const peek = h("p", "orc-table-peek", options.slice(0, 3).map(plainText).join(" · "));
    if (options.length > 3) peek.append(h("span", "orc-preview-more", " …"));
    r.append(top, from, peek);
    if (isBuiltin) {
      const view = button("ghost", ow.showAll);
      view.classList.add("orc-table-all");
      view.setAttribute("aria-label", `${ow.showAll}: ${tbl.name}`);
      view.addEventListener("click", () => void tell(`${tbl.name}\n\n${tbl.entries.map((e, i) => `${i + 1}. ${e}`).join("\n")}`, ow.ok));
      r.append(view);
    }
    return r;
  };
  const paint = (found: readonly OracleTable[], capped: boolean): void => {
    mine = found;
    exportBtn.disabled = found.length === 0;
    listWrap.replaceChildren(...getAllOracleTables().map(row));
    scanLine.textContent = capped ? ow.noteTablesCapped(SCAN_MOST) : found.length === 0 ? ow.noteTablesNone : "";
    scanLine.hidden = scanLine.textContent === "";
  };
  listWrap.replaceChildren(...BUILTIN_ORACLE_TABLES.map(row));
  if (currentFolder) {
    // The index lists the tables; the notes that hold one are read here,
    // since this page shows every table's rows.
    void scanNoteTables(true)
      .then(async (s) => ({ tables: await loadAllRows(s.tables), capped: s.capped }))
      .then((s) => {
        if (wrap.isConnected) paint(s.tables, s.capped);
      });
  }

  wrap.append(heading, h("p", "orc-lead", ow.tablesLead), topBar, feedback.el, banner, listWrap, scanLine);
  return wrap;
}
