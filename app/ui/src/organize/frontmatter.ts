// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Transaction } from "@codemirror/state";
import { refreshBases } from "../bases";
import { commands, type PropertyValue } from "../bindings";
import { afterFileChange, flushed, recheckAll, stopped } from "../changes";
import { ui } from "../dom";
import { fail } from "../errors";
import { frontmatterClose } from "../frontmatter";
import { minimalEdit } from "../edit";
import { activeLeafForPath, leavesOf, liveHolder } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { lineSeparator } from "../leaves/text";
import { opening } from "../opening";
import { Kind } from "../paths";
import { type Edit, propertyChange } from "../props";
import { roomSide } from "../collab";
import { writeLive } from "../roomWrites";
import { baseStrings } from "../strings";
import { listAll } from "../tree/tree";
import { ensureFolderNote } from "./folderNotes";

export function setFrontmatterProp(doc: string, key: string, value: string | null): string {
  if (value === null) {
    const res = propertyChange(doc, key, { op: "remove" });
    if ("change" in res) {
      return doc.slice(0, res.change.from) + res.change.insert + doc.slice(res.change.to);
    }
    return doc;
  }
  let currentDoc = doc;
  let res = propertyChange(currentDoc, key, { op: "set", value: { kind: "text", value } });
  if ("refused" in res && (res.refused === "changed" || res.refused === "fixed")) {
    const createRes = propertyChange(currentDoc, key, { op: "create" });
    if ("change" in createRes) {
      currentDoc = currentDoc.slice(0, createRes.change.from) + createRes.change.insert + currentDoc.slice(createRes.change.to);
      const setRes = propertyChange(currentDoc, key, { op: "set", value: { kind: "text", value } });
      if ("change" in setRes) {
        return currentDoc.slice(0, setRes.change.from) + setRes.change.insert + currentDoc.slice(setRes.change.to);
      }
    }
  } else if ("change" in res) {
    return currentDoc.slice(0, res.change.from) + res.change.insert + currentDoc.slice(res.change.to);
  }
  return currentDoc;
}
/** `s` as a YAML list item that reads back as the same text — quoted when
 *  YAML would take it for a number, a boolean, null or an indicator (the
 *  core's `yaml_scalar`, for `order:` rewritten on a rename). */
export function yamlItem(s: string): string {
  const lower = s.toLowerCase();
  const quote =
    s === "" ||
    "-?:,[]{}#&*!|>'\"%@`~".includes(s[0] ?? "") ||
    /^\s|\s$/.test(s) ||
    s.includes(": ") ||
    s.endsWith(":") ||
    s.includes(" #") ||
    /[\t\n\r"\\]/.test(s) ||
    ["true", "false", "yes", "no", "on", "off", "y", "n", "null"].includes(lower) ||
    /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ||
    /^(inf|infinity|nan)$/i.test(s) ||
    s.startsWith("0x") ||
    s.startsWith("0o");
  return quote ? JSON.stringify(s) : s;
}
/** A YAML list item as its text: quotes taken off, escapes read. */
export function yamlItemText(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}
export function setFrontmatterListProp(doc: string, key: string, values: string[]): string {
  const eol = doc.includes("\r\n") ? "\r\n" : "\n";
  const lines = doc.split(/\r?\n/);
  const end = frontmatterClose((i) => lines[i]);

  const newLines: string[] = [];
  if (values.length > 0) {
    newLines.push(`${key}:`);
    for (const v of values) {
      if (key === "pinned") {
        // A quoted wikilink, always (ADR 0060 D5), whether the value came
        // with its quotes or without.
        const raw = yamlItemText(v.trim()).trim();
        newLines.push(`  - ${JSON.stringify(raw.startsWith("[[") && raw.endsWith("]]") ? raw : `[[${raw}]]`)}`);
      } else {
        newLines.push(`  - ${yamlItem(v)}`);
      }
    }
  }

  if (end >= 0) {
    let keyStart = -1;
    let keyStop = -1;
    for (let i = 1; i < end; i++) {
      const line = lines[i] ?? "";
      const m = /^([^\s#:][^:]*?)\s*:(?=\s|$)/.exec(line);
      if (m && m[1]?.trim() === key) {
        keyStart = i;
        keyStop = i + 1;
        for (let j = i + 1; j < end; j++) {
          const l = lines[j] ?? "";
          if (/^\s*(#.*)?$/.test(l)) {
            keyStop = j + 1;
            continue;
          }
          if (/^[ \t]/.test(l) || /^-(\s|$)/.test(l)) {
            keyStop = j + 1;
            continue;
          }
          break;
        }
        break;
      }
    }

    if (keyStart >= 0) {
      const before = lines.slice(0, keyStart);
      const after = lines.slice(keyStop);
      const combined = [...before, ...newLines, ...after];
      return combined.join(eol);
    } else if (newLines.length > 0) {
      const before = lines.slice(0, end);
      const after = lines.slice(end);
      const combined = [...before, ...newLines, ...after];
      return combined.join(eol);
    } else {
      return doc;
    }
  } else {
    if (newLines.length > 0) {
      const block = ["---", ...newLines, "---", ""].join(eol);
      return block + doc;
    }
    return doc;
  }
}

export function parseFrontmatterListProp(doc: string, key: string): string[] {
  const eol = lineSeparator(doc) ?? "\n";
  const lines = doc.split(eol);
  if (lines[0]?.trim() !== "---") return [];
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]?.trim();
    if (l === "---" || l === "...") {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const result: string[] = [];
  for (let i = 1; i < end; i++) {
    const line = lines[i] ?? "";
    const m = /^([^\s#:][^:]*?)\s*:(.*)$/.exec(line);
    if (m && m[1]?.trim() === key) {
      const inlineRest = (m[2] ?? "").trim();
      if (inlineRest.startsWith("[") && inlineRest.endsWith("]")) {
        const inner = inlineRest.slice(1, -1).trim();
        if (inner) {
          // Commas inside quotes belong to the item.
          for (const raw of inner.match(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+/g) ?? []) {
            const item = yamlItemText(raw.trim());
            if (item) result.push(item);
          }
        }
        return result;
      }
      for (let j = i + 1; j < end; j++) {
        const l = lines[j] ?? "";
        if (/^\s*(#.*)?$/.test(l)) continue;
        const itemMatch = /^\s*-\s*(.*)$/.exec(l);
        if (itemMatch) {
          const rest = (itemMatch[1] ?? "").trim();
          const item = yamlItemText(/^["']/.test(rest) ? rest : (rest.split(" #")[0] ?? "").trim());
          if (item) result.push(item);
        } else if (/^[ \t]/.test(l)) {
          continue;
        } else {
          break;
        }
      }
      return result;
    }
  }
  return result;
}

export async function getNoteDoc(path: string): Promise<string | null> {
  const leaf = activeLeafForPath(path);
  if (leaf && leaf instanceof NoteLeaf) {
    return leaf.editor.state.doc.toString();
  }
  const read = await commands.readNote(path);
  if (read.status === "ok") {
    return read.data.text;
  }
  return null;
}

export async function updateEntryProperties(path: string, kind: Kind, updates: Record<string, string | null>): Promise<void> {
  let targetNote = path;
  if (kind === "folder") {
    const fn = await ensureFolderNote(path);
    if (!fn) return;
    targetNote = fn;
  }
  const withUpdates = (text: string): string => {
    for (const [k, v] of Object.entries(updates)) text = setFrontmatterProp(text, k, v);
    return text;
  };
  // A live note, here or only elsewhere: into its room, as typing goes
  // (ADR 0082).
  if ((await writeLive(targetNote, liveHolder(targetNote), withUpdates, roomSide)) !== "disk") return;
  const leaf = activeLeafForPath(targetNote);
  if (leaf) {
    const was = leaf.editor.state.doc.toString();
    const edit = minimalEdit(was, withUpdates(was));
    if (edit) leaf.editor.dispatch({ changes: edit, annotations: Transaction.userEvent.of("input") });
    await leaf.save();
    await afterFileChange();
  } else {
    const read = await commands.readNote(targetNote);
    if (read.status !== "ok") {
      fail(read.error);
      return;
    }
    const written = await commands.writeNote(targetNote, withUpdates(read.data.text), read.data.revision);
    if (written.status !== "ok") {
      fail(written.error);
      return;
    }
    await afterFileChange();
  }
}

export async function updateEntryListProperty(path: string, kind: Kind, key: "order" | "pinned", values: string[]): Promise<void> {
  let targetNote = path;
  if (kind === "folder") {
    const fn = await ensureFolderNote(path);
    if (!fn) return;
    targetNote = fn;
  }
  // A live note, here or only elsewhere: into its room, as typing goes
  // (ADR 0082).
  if ((await writeLive(targetNote, liveHolder(targetNote), (text) => setFrontmatterListProp(text, key, values), roomSide)) !== "disk") return;
  const leaf = activeLeafForPath(targetNote);
  if (leaf) {
    const was = leaf.editor.state.doc.toString();
    const edit = minimalEdit(was, setFrontmatterListProp(was, key, values));
    if (edit) leaf.editor.dispatch({ changes: edit, annotations: Transaction.userEvent.of("input") });
    await leaf.save();
    await afterFileChange();
    await listAll();
  } else {
    const read = await commands.readNote(targetNote);
    if (read.status !== "ok") {
      fail(read.error);
      return;
    }
    const text = setFrontmatterListProp(read.data.text, key, values);
    const written = await commands.writeNote(targetNote, text, read.data.revision);
    if (written.status !== "ok") {
      fail(written.error);
      return;
    }
    await afterFileChange();
    await listAll();
  }
}
/** `text` with `key` holding `value`: the key's lines only (props.ts),
 *  the key made when absent; the reason when the key cannot be written. */
export function withProperty(text: string, wanted: string, value: PropertyValue): { text: string } | { refused: string } {
  // The core reads a property ignoring its case (bases/eval.rs): the key
  // the note already has is the one written, not a second one beside it.
  const fm = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text)?.[1] ?? "";
  const keys = [...fm.matchAll(/^([^\s#\-][^:\n]*?)[ \t]*:(?:\s|$)/gm)].map((m) => m[1] ?? "");
  const alike = keys.filter((k) => k.toLowerCase() === wanted.toLowerCase());
  const key = keys.includes(wanted) || alike.length !== 1 ? wanted : (alike[0] ?? wanted);
  let out = text;
  const apply = (edit: Edit): string | null => {
    const c = propertyChange(out, key, edit);
    if ("refused" in c) return c.refused;
    out = out.slice(0, c.change.from) + c.change.insert + out.slice(c.change.to);
    return null;
  };
  let refused = apply({ op: "set", value });
  if (refused === "changed") refused = apply({ op: "create" }) ?? apply({ op: "set", value });
  return refused === null ? { text: out } : { refused };
}
/** One property of a note written from a view — a card moved to a
 *  column, a day, a cell — over the revision read (invariant 11). The
 *  note's tabs are saved first, so the write starts from their text, and
 *  read what was written after. */
export async function setNoteProperty(path: string, key: string, value: PropertyValue | null): Promise<boolean> {
  // A live note, here or only elsewhere (joined for this write): into its
  // room, as typing goes; the room writes the file (ADR 0082, decided
  // 2026-10-12).
  let refusedWhy: string = "";
  const live = await writeLive(path, liveHolder(path), (text) => {
    const next = withProperty(text, key, value ?? { kind: "empty" });
    if ("text" in next) return next.text;
    refusedWhy = next.refused;
    return null;
  }, roomSide);
  if (live === "room" || live === "same") {
    refreshBases();
    return true;
  }
  if (live === "refused") {
    ui.status.textContent = refusedWhy === "fixed" ? baseStrings.refusedShape : baseStrings.cellWriteFailed;
    return false;
  }
  const left = await flushed(leavesOf(path));
  if (left.length > 0) {
    stopped(left);
    return false;
  }
  const r = await opening.readNote(path);
  if (r.status !== "ok") {
    fail(r.error);
    return false;
  }
  const next = withProperty(r.data.text, key, value ?? { kind: "empty" });
  if ("refused" in next) {
    ui.status.textContent = next.refused === "fixed" ? baseStrings.refusedShape : baseStrings.cellWriteFailed;
    return false;
  }
  const w = await commands.writeNote(path, next.text, r.data.revision);
  if (w.status !== "ok") {
    fail(w.error);
    return false;
  }
  await recheckAll(new Set([path]));
  refreshBases();
  return true;
}
