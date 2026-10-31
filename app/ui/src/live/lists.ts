// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Live Preview's list keys (split out of ../live.ts, ADR 0067).

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { smartUnindentList } from "../listKeymap";

export function getListPrefix(text: string): { prefix: string; indent: string; contentStart: number } | null {
  const m = text.match(/^([ \t]*)([-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/);
  if (!m) return null;
  return { prefix: m[0], indent: m[1] ?? "", contentStart: m[0].length };
}

/** The list prefix of `line`, when the line is a list item and not text
 *  inside a code block that only looks like one (`- item` in a fenced or
 *  indented block): the syntax tree decides, as for the embeds above. */
export function listPrefixOf(state: EditorState, line: { from: number; text: string }): ReturnType<typeof getListPrefix> {
  const info = getListPrefix(line.text);
  if (!info) return null;
  for (let p: SyntaxNode | null = syntaxTree(state).resolveInner(line.from + info.indent.length, 1); p; p = p.parent) {
    if (p.name === "FencedCode" || p.name === "CodeBlock") return null;
  }
  return info;
}

export function listCursorLeft(view: EditorView): boolean {
  const { state } = view;
  const { doc, selection } = state;
  if (!selection.main.empty) return false;
  const pos = selection.main.head;
  const line = doc.lineAt(pos);
  const info = listPrefixOf(state, line);
  if (!info) return false;
  const contentStart = line.from + info.contentStart;
  if (pos <= contentStart) {
    if (line.number > 1) {
      const prevLine = doc.line(line.number - 1);
      view.dispatch({ selection: EditorSelection.cursor(prevLine.to), userEvent: "select" });
      return true;
    }
  }
  return false;
}

export function listCursorRight(view: EditorView): boolean {
  const { state } = view;
  const { doc, selection } = state;
  if (!selection.main.empty) return false;
  const pos = selection.main.head;
  const line = doc.lineAt(pos);
  if (pos === line.to && line.number < doc.lines) {
    const nextLine = doc.line(line.number + 1);
    const nextInfo = listPrefixOf(state, nextLine);
    if (nextInfo) {
      view.dispatch({ selection: EditorSelection.cursor(nextLine.from + nextInfo.contentStart), userEvent: "select" });
      return true;
    }
  }
  return false;
}

export function listCursorHome(view: EditorView): boolean {
  const { state } = view;
  const { doc, selection } = state;
  if (!selection.main.empty) return false;
  const pos = selection.main.head;
  const line = doc.lineAt(pos);
  const info = listPrefixOf(state, line);
  if (!info) return false;
  const contentStart = line.from + info.contentStart;
  if (pos > contentStart) {
    view.dispatch({ selection: EditorSelection.cursor(contentStart), userEvent: "select" });
    return true;
  }
  return false;
}

export function listBackspace(view: EditorView): boolean {
  const { state } = view;
  const { doc, selection } = state;
  if (!selection.main.empty) return false;
  const pos = selection.main.head;
  const line = doc.lineAt(pos);
  const info = listPrefixOf(state, line);
  if (!info) return false;
  const contentStart = line.from + info.contentStart;
  if (pos === contentStart) {
    if (info.indent.length > 0) {
      return smartUnindentList(view);
    }
    view.dispatch({
      changes: { from: line.from, to: contentStart, insert: "" },
      selection: EditorSelection.cursor(line.from),
      userEvent: "delete.backward",
    });
    return true;
  }
  return false;
}

export const liveListNavKeymap = Prec.highest(
  keymap.of([
    { key: "ArrowLeft", run: listCursorLeft },
    { key: "ArrowRight", run: listCursorRight },
    { key: "Home", run: listCursorHome },
    { key: "Mod-ArrowLeft", run: listCursorHome },
    { key: "Backspace", run: listBackspace },
  ])
);

export const snapOutOfListPrefix = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr;
  const doc = tr.newDoc;
  let changed = false;
  const ranges = tr.newSelection.ranges.map((r) => {
    if (!r.empty) return r;
    const line = doc.lineAt(r.head);
    const info = listPrefixOf(tr.state, line);
    if (!info) return r;
    const contentStart = line.from + info.contentStart;
    if (r.head >= line.from && r.head < contentStart) {
      changed = true;
      return EditorSelection.cursor(contentStart, r.assoc, r.bidiLevel ?? undefined, r.goalColumn);
    }
    return r;
  });
  if (!changed) return tr;
  return [tr, { selection: EditorSelection.create(ranges, tr.newSelection.mainIndex), sequential: true }];
});
