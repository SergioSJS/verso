// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Two of Notion's habits, in Markdown's own terms (ADR 0061 D9, D10):
// "Enter starts a new block" — a setting, off by default — makes Enter in
// a paragraph write the blank line that starts the next one and
// Shift-Enter the single line break; lists, quotes, code and tables keep
// their Enter. And `[] ` typed at the start of a line becomes a task,
// `- [ ] ` — at a line's start `[] ` means nothing in Markdown.

import { syntaxTree } from "@codemirror/language";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/** Is the caret in a paragraph of the note itself — not in a list, a
 *  quote, code or a table? */
function inParagraph(state: EditorState, pos: number): boolean {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent!) {
    if (n.name === "Paragraph") return n.parent?.name === "Document";
    if (/^(ListItem|Blockquote|FencedCode|CodeBlock|Table|HTMLBlock|CommentBlock)$/.test(n.name)) return false;
    if (n.name === "Document") return false;
  }
  return false;
}

function insert(view: EditorView, text: string): boolean {
  const sel = view.state.selection.main;
  if (!inParagraph(view.state, sel.head)) return false;
  view.dispatch(view.state.update({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: sel.from + text.length }, scrollIntoView: true, userEvent: "input" }));
  return true;
}

export function blockKeys(opts: { enterNewBlock: () => boolean }): Extension {
  return [
    Prec.high(
      keymap.of([
        { key: "Enter", run: (v) => opts.enterNewBlock() && insert(v, "\n\n") },
        { key: "Shift-Enter", run: (v) => opts.enterNewBlock() && insert(v, "\n") },
      ]),
    ),
    EditorView.inputHandler.of((view, from, to, text) => {
      if (text !== " " || from !== to) return false;
      const line = view.state.doc.lineAt(from);
      const before = line.text.slice(0, from - line.from);
      const m = /^([ \t]*)\[\]$/.exec(before);
      if (!m) return false;
      const node = syntaxTree(view.state).resolveInner(from, -1);
      for (let n: typeof node | null = node; n; n = n.parent) if (/^(FencedCode|CodeBlock|InlineCode|HTMLBlock|CommentBlock)$/.test(n.name)) return false;
      const start = line.from + m[1]!.length;
      view.dispatch({ changes: { from: start, to: from, insert: "- [ ] " }, selection: { anchor: start + 6 }, userEvent: "input" });
      return true;
    }),
  ];
}
