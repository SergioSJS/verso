// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, rectangularSelection } from "@codemirror/view";
import { EditorView } from "codemirror";
import { icon } from "../icons";
import { CustomSearchPanel, searchStrings } from "../searchPanel";
import { settings } from "../settings";

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
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentUnit.of("\t"),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  EditorView.inputHandler.of((view, from, to, text) => {
    if (text === ":" && settings.emojiTrigger) {
      setTimeout(() => startCompletion(view), 0);
    }
    return false;
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
