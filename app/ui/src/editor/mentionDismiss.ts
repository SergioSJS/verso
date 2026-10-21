// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Esc on the `@` list (ADR 0089 item 5, the maintainer 2026-10-21): the
// list that was dismissed does not come back when more characters of the
// same `@word` are typed. A new `@` is a new word and opens it again. The
// field holds where the dismissed `@` stands; it follows the text, and goes
// when that `@` is gone.

import { completionStatus } from "@codemirror/autocomplete";
import { type Extension, Prec, StateEffect, StateField } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { settings } from "../settings";
import { MENTION_BEFORE } from "./wikilinkBefore";

const dismissAt = StateEffect.define<number>();

const dismissed = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(dismissAt)) return e.value;
    if (value === null) return null;
    const at = tr.changes.mapPos(value, -1);
    return tr.state.sliceDoc(at, at + 1) === "@" ? at : null;
  },
});

/** Whether the `@` at `at` is the one the person closed the list of. */
export function mentionDismissed(state: import("@codemirror/state").EditorState, at: number): boolean {
  return state.field(dismissed, false) === at;
}

/** The `@` the caret is typing a mention after, or null. */
function mentionAtCaret(state: import("@codemirror/state").EditorState): number | null {
  const { head, empty } = state.selection.main;
  if (!empty) return null;
  const line = state.doc.lineAt(head);
  const m = MENTION_BEFORE.exec(line.text.slice(0, head - line.from));
  return m ? line.from + m.index + m[0].indexOf("@") : null;
}

/** The field and an Escape that notes the `@` before the list closes; it
 *  must come before `autocompletion()`, whose keys are highest too. */
export const mentionDismissal: Extension = [
  dismissed,
  Prec.highest(keymap.of([{
    key: "Escape",
    run: (view) => {
      if (!settings.mentionAt || completionStatus(view.state) !== "active") return false;
      const at = mentionAtCaret(view.state);
      if (at !== null) view.dispatch({ effects: dismissAt.of(at) });
      return false;
    },
  }])),
];
