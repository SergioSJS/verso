// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus, startCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, rectangularSelection, tooltips } from "@codemirror/view";
import { EditorView } from "codemirror";
import { icon } from "../icons";
import { editorKeepsInView, tooltipSpace } from "../screen/keyboard";
import { CustomSearchPanel, searchStrings } from "../searchPanel";
import { settings } from "../settings";
import { evenSelection } from "./evenSelection";
import { mentionDismissal } from "./mentionDismiss";
import { WIKILINK_BEFORE } from "./wikilinkBefore";

export const baseEditorExtensions: Extension = [
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter({
    markerDOM: (open) => {
      const span = document.createElement("span");
      span.className = open ? "cm-foldMarker cm-foldMarker-open" : "cm-foldMarker cm-foldMarker-folded";
      span.append(icon("chevron"));
      return span;
    },
  }),
  drawSelection(),
  // The selection's rectangles, even whatever line is first (evenSelection.ts).
  evenSelection,
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentUnit.of("\t"),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  mentionDismissal,
  autocompletion(),
  // The suggestions inside what the screen shows, and the cursor above
  // the on-screen keyboard (ADR 0076 item 7).
  tooltips({ tooltipSpace }),
  editorKeepsInView,
  EditorView.inputHandler.of((view, from, to, text) => {
    if (text === ":" && settings.emojiTrigger) {
      setTimeout(() => startCompletion(view), 0);
    }
    return false;
  }),
  // A phone's keyboard types through composition (the underlined word, which
  // an Android keyboard keeps until the space): what the editor takes as
  // typing then does not always open or keep the list of notes. So whenever
  // text was typed or composed, or a composition ended, with the cursor
  // inside a `[[` (or `![[`) and no list open, the list is asked for here
  // (the maintainer, 2026-10-15 and 16: on an Android phone nothing listed
  // after `[[`, nor after `[[por`).
  EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (!update.transactions.some((tr) => tr.isUserEvent("input"))) return;
    askForLinks(update.view);
  }),
  EditorView.domEventHandlers({
    compositionend: (_e, view) => {
      askForLinks(view);
      return false;
    },
  }),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  search({
    top: true,
    createPanel: (view) => new CustomSearchPanel(view, searchStrings()),
  }),
  keymap.of([
    ...closeBracketsKeymap,
    // Mod-[ and Mod-] are the window's back and forward (DEFAULT_KEYS).
    // CodeMirror binds them to indenting, which Tab and Shift-Tab already
    // do here (`indentWithTab`), and an editor that answers a key stops
    // the window from seeing it at all (the handler skips a key whose
    // default was prevented).
    ...defaultKeymap.filter((b) => b.key !== "Mod-[" && b.key !== "Mod-]"),
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

/** Start the list of notes when the cursor stands inside `[[…` and none is
 *  open. Deferred, so that it never dispatches inside an update; asked again
 *  only when the person types (Esc closes it and nothing reopens it). */
function askForLinks(view: EditorView): void {
  setTimeout(() => {
    const { head, empty } = view.state.selection.main;
    if (!empty || head < 2 || completionStatus(view.state) !== null) return;
    if (WIKILINK_BEFORE.test(view.state.sliceDoc(Math.max(0, head - 300), head))) startCompletion(view);
  }, 0);
}
