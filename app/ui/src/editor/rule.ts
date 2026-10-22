// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// `---` then Enter (ADR 0061, revised 2026-10-22): the line typed is a
// horizontal rule, and the blank lines Markdown wants around it are written
// for the person, so that one Enter goes on writing. It writes what they
// would type by hand — a blank line before when the line above would make
// `---` a setext heading's underline, a blank line after — as one ordinary,
// undoable edit — its own step of the history, not glued to the typing around it.

import { ensureSyntaxTree } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import { EditorSelection, Prec, type EditorState, type TransactionSpec } from "@codemirror/state";
import { completionStatus } from "@codemirror/autocomplete";
import { keymap, type EditorView } from "@codemirror/view";
import { frontmatterEnd } from "../live/frontmatter";

const RULE = /^(---|\*\*\*|___)$/;
const BLANK = /^\s*$/;

/** What Enter does at the end of a line that is exactly `---`, `***` or
 *  `___`, or null when Enter is not for this command: the caret not alone
 *  at the end of the line, the first line of the note (it may open a
 *  frontmatter), a line in the frontmatter, in code, a table, a list, or
 *  anything the Markdown parser does not read as a rule or as the underline
 *  of a setext heading. */
export function ruleEnter(state: EditorState): TransactionSpec | null {
  const sel = state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty || state.readOnly) return null;
  const doc = state.doc;
  const line = doc.lineAt(sel.main.head);
  if (sel.main.head !== line.to || !RULE.test(line.text) || line.number === 1) return null;
  const fm = frontmatterEnd(doc);
  if (fm >= 0 && line.to <= fm) return null;
  const tree = ensureSyntaxTree(state, line.to, 50);
  if (!tree) return null;
  const node = tree.resolveInner(line.from, 1);
  const setext = node.name === "HeaderMark" && node.parent?.name === "SetextHeading2";
  if (node.name !== "HorizontalRule" && !setext) return null;

  const changes: { from: number; to?: number; insert: string }[] = [];
  // `---` under a paragraph line is its setext underline: the blank line
  // before makes it a rule.
  if (setext) changes.push({ from: line.from, insert: "\n" });
  // The blank lines after: one between the rule and the line the caret goes
  // to, and one more when text follows, so it does not join the caret's line.
  let blanks = 0;
  let n = line.number + 1;
  while (n <= doc.lines && BLANK.test(doc.line(n).text)) {
    blanks++;
    n++;
  }
  const textFollows = n <= doc.lines;
  const needed = 2 + (textFollows ? 1 : 0);
  if (blanks < needed) changes.push({ from: line.to, insert: "\n".repeat(needed - blanks) });
  // The caret goes to the second line after the rule (the first is blank).
  const next = state.update({ changes }).newDoc;
  const target = next.line(line.number + (setext ? 1 : 0) + 2).from;
  return { changes, selection: EditorSelection.cursor(target), scrollIntoView: true, userEvent: "input", annotations: isolateHistory.of("full") };
}

function run(view: EditorView): boolean {
  if (completionStatus(view.state) === "active") return false;
  const spec = ruleEnter(view.state);
  if (!spec) return false;
  view.dispatch(view.state.update(spec));
  return true;
}

/** Enter, before the others': it answers only on a rule line. */
export const ruleEnterKeymap = Prec.highest(keymap.of([{ key: "Enter", run }]));
