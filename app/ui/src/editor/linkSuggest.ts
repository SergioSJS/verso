// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The suggestion while typing (ADR 0089 item 5, revised 2026-10-15): when
// the words just typed are a whole note name or alias of the folder
// (linkNames.ts), a small chip at the cursor says "Link to [[Name]]". It
// never changes the text by itself. Tab or Enter accepts — the typed
// words become `[[Name]]`, or `[[Name|typed]]` when the case or an alias
// differs, as "Link" in the unlinked mentions writes it — and that is an
// ordinary edit of the editor, so a note open in a room sends it through
// the room. Escape, or typing on, dismisses it, and a dismissed name is
// not suggested again in the same paragraph. On a touch screen the chip is
// tapped. Off unless the person turned it on; a reader's editor cannot be
// typed in, so it gets none.
//
// The field below holds the one suggestion and the names dismissed; it
// looks only at the person's own typing (`input.type`), never at a
// paste, an undo or another person's edit.

import { completionStatus } from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState, Facet, Prec, StateEffect, StateField, type Text, type TransactionSpec } from "@codemirror/state";
import { EditorView, keymap, showTooltip, type Tooltip } from "@codemirror/view";
import { frontmatterClose } from "../frontmatter";
import { fold, type Hit, type LinkNames, linkWritten } from "./linkNames";
import { ls } from "./suggestStrings";

/** What the editor brings: the setting, the folder's names, the note
 *  being written, the link's text for a note, and the screen reader. */
export type Deps = {
  enabled: () => boolean;
  /** The folder's names, built once and kept; null while there are none. */
  names: () => LinkNames | null;
  /** The note being written: never suggested. */
  path: () => string;
  /** The text a link to the note takes (`linkText`). */
  target: (path: string) => string;
  /** Said politely to a screen reader. */
  say: (message: string) => void;
};

type Shown = Hit & {
  /** The suggestion's identity: the note and the words, folded. */
  key: string;
  /** The typed words, in the document. */
  from: number;
  to: number;
  /** In a table's cell: the link's `|` is escaped. */
  table: boolean;
  /** On a touch screen: tapped, not keyed. */
  touch: boolean;
  tooltip: Tooltip;
};
type Dismissed = { key: string; pos: number };
type Value = { shown: Shown | null; dismissed: Dismissed[] };

const depsFacet = Facet.define<Deps, Deps | null>({ combine: (all) => all[0] ?? null });

/** Escape: the suggestion is dismissed, its name with it. */
export const dismissSuggestion = StateEffect.define<null>();

/** Nodes of the syntax tree whose text is not prose. */
const NOT_PROSE = /^(FencedCode|CodeBlock|InlineCode|CodeText|CodeInfo|HTMLBlock|HTMLTag|CommentBlock|Comment|ProcessingInstruction|Link|Image|Autolink|URL|LinkReference|LinkTitle)$/;

/** The most dismissed names kept. */
const KEEP = 60;

function coarse(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function insideFrontmatter(doc: Text, pos: number): boolean {
  const close = frontmatterClose((i) => (i < doc.lines ? doc.line(i + 1).text : undefined));
  return close >= 0 && doc.lineAt(pos).number - 1 <= close;
}

/** Whether the words from `from` to `to` are in a place of prose, by the
 *  syntax tree: not in a code block, an HTML block, a link's text or
 *  address. What the line says alone is `proseBefore`'s. */
function proseHere(state: EditorState, from: number, to: number): boolean {
  const tree = ensureSyntaxTree(state, to, 50);
  if (!tree) return false;
  for (const pos of [from, Math.max(from, to - 1)]) {
    for (let n: import("@lezer/common").SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
      if (NOT_PROSE.test(n.name)) return false;
    }
  }
  return true;
}

/** The paragraph around `pos`: the lines up to the blank ones. */
function paragraphOf(doc: Text, pos: number): { from: number; to: number } {
  const line = doc.lineAt(pos);
  let a = line.number;
  let b = line.number;
  while (a > 1 && doc.line(a - 1).text.trim() !== "") a--;
  while (b < doc.lines && doc.line(b + 1).text.trim() !== "") b++;
  return { from: doc.line(a).from, to: doc.line(b).to };
}

/** Whether a candidate stands in prose in `state`: not in the frontmatter
 *  or in what the syntax tree says is code, HTML or a link. Asked of a
 *  state, never inside the field's update (a transaction's own state does
 *  not exist yet there). */
function visibleIn(state: EditorState, shown: Shown): boolean {
  return !insideFrontmatter(state.doc, shown.to) && proseHere(state, shown.from, shown.to);
}

function suggest(tr: import("@codemirror/state").Transaction, dismissed: Dismissed[], deps: Deps): Shown | null {
  const sel = tr.newSelection.main;
  if (!sel.empty) return null;
  const names = deps.names();
  if (!names) return null;
  const doc = tr.newDoc;
  const line = doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const next = doc.sliceString(sel.head, Math.min(line.to, sel.head + 2));
  const hit = names.find(before, next, deps.path());
  if (!hit) return null;
  const from = line.from + hit.start;
  const to = sel.head;
  const key = `${hit.path}\n${fold(hit.text)}`;
  if (dismissed.length > 0) {
    const around = paragraphOf(doc, to);
    if (dismissed.some((d) => d.key === key && d.pos >= around.from && d.pos <= around.to)) return null;
  }
  const touch = coarse();
  const shown: Shown = {
    ...hit,
    key,
    from,
    to,
    table: /^\s*\|/.test(line.text),
    touch,
    tooltip: {
      pos: to,
      above: touch,
      strictSide: true,
      arrow: false,
      create: (view) => {
        const dom = document.createElement("div");
        dom.className = "cm-link-suggest";
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "link-suggest-chip";
        // The editor keeps the focus: the chip is reached by the key, or
        // by a tap, not by Tab.
        chip.tabIndex = -1;
        chip.setAttribute("aria-label", ls.chipLabel(hit.name, touch));
        const words = document.createElement("span");
        words.textContent = ls.chip(hit.name);
        chip.append(words);
        if (!touch) {
          const key = document.createElement("kbd");
          key.textContent = ls.key;
          key.setAttribute("aria-hidden", "true");
          chip.append(key);
        }
        for (const type of ["mousedown", "pointerdown"]) chip.addEventListener(type, (e) => e.preventDefault());
        chip.addEventListener("click", () => accept(view));
        dom.append(chip);
        deps.say(ls.heard(hit.name, touch));
        return { dom };
      },
    },
  };
  return shown;
}

const field = StateField.define<Value>({
  create: () => ({ shown: null, dismissed: [] }),
  update(value, tr) {
    const deps = tr.startState.facet(depsFacet);
    const dismissEffect = tr.effects.some((e) => e.is(dismissSuggestion));
    if (!tr.docChanged && !tr.selection && !dismissEffect) return value;
    let dismissed = tr.docChanged ? value.dismissed.map((d) => ({ key: d.key, pos: tr.changes.mapPos(d.pos, -1) })) : value.dismissed;
    const prev = value.shown;
    const typed = tr.docChanged && tr.isUserEvent("input.type");
    // The person turned it down: by Escape, or by typing (or deleting) on.
    if (prev && visibleIn(tr.startState, prev) && (dismissEffect || typed || (tr.docChanged && tr.isUserEvent("delete")))) {
      dismissed = [...dismissed, { key: prev.key, pos: tr.docChanged ? tr.changes.mapPos(prev.to, -1) : prev.to }].slice(-KEEP);
    }
    if (!deps || !typed || !deps.enabled() || tr.startState.readOnly || completionStatus(tr.startState) === "active") return { shown: null, dismissed };
    return { shown: suggest(tr, dismissed, deps), dismissed };
  },
  provide: (f) => showTooltip.compute([f], (state) => shownIn(state)?.tooltip ?? null),
});

/** The suggestion standing in `state`, if any. */
function shownIn(state: EditorState): Shown | null {
  const shown = state.field(field, false)?.shown ?? null;
  return shown && visibleIn(state, shown) ? shown : null;
}

/** The suggestion being shown, if any. */
export function suggestionOf(state: EditorState): Hit | null {
  return shownIn(state);
}

/** The edit that accepts the suggestion: the typed words become the link,
 *  the cursor after it; null when none is shown. An `input.complete`
 *  edit, so it suggests nothing in turn. */
export function acceptChange(state: EditorState): TransactionSpec | null {
  const shown = shownIn(state);
  const deps = state.facet(depsFacet);
  if (!shown || !deps) return null;
  const link = linkWritten(shown, deps.target(shown.path), shown.table);
  return {
    changes: { from: shown.from, to: shown.to, insert: link },
    selection: { anchor: shown.from + link.length },
    userEvent: "input.complete",
    scrollIntoView: true,
  };
}

function accept(view: EditorView): boolean {
  // A completion list open is the key's (a "pending" one is only asking).
  if (completionStatus(view.state) === "active") return false;
  const shown = shownIn(view.state);
  const spec = acceptChange(view.state);
  const deps = view.state.facet(depsFacet);
  if (!shown || !spec || !deps) return false;
  view.dispatch(spec);
  view.focus();
  deps.say(ls.linked(shown.name));
  return true;
}

/** The extension: the field, the tooltip it provides, and Tab, Enter and
 *  Escape while a suggestion is shown (and only then). */
export function linkSuggest(deps: Deps): import("@codemirror/state").Extension {
  return [
    depsFacet.of(deps),
    field,
    Prec.highest(
      keymap.of([
        { key: "Tab", run: accept },
        { key: "Enter", run: accept },
        {
          key: "Escape",
          run: (view) => {
            if (!shownIn(view.state)) return false;
            view.dispatch({ effects: dismissSuggestion.of(null) });
            return true;
          },
        },
      ]),
    ),
  ];
}
