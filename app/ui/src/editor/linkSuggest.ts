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
import { fold, type Hit, type LinkNames, linkWritten, type PartialRule, wordy } from "./linkNames";
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
  /** The person's letters before the list and capital rule; the defaults when absent. */
  partialRule?: () => PartialRule;
  /** Said politely to a screen reader. */
  say: (message: string) => void;
};

type Shown = {
  /** What is offered: one name (the chip) or up to five (the list), each
   *  with where its typed words begin in the document. */
  hits: (Hit & { from: number })[];
  /** The one the keys act on. */
  sel: number;
  /** The list of partial names rather than the chip. */
  list: boolean;
  /** The suggestion's identity: the note and the words, folded. */
  key: string;
  /** Where the typed name ends (the cursor may stand after a space). */
  to: number;
  /** In a table's cell: the link's `|` is escaped. */
  table: boolean;
  /** On a touch screen: tapped, not keyed. */
  touch: boolean;
  tooltip: Tooltip;
};
type Dismissed = { key: string; pos: number };
type Value = {
  shown: Shown | null;
  dismissed: Dismissed[];
  /** Where the word the list was dismissed for begins. */
  escaped: number | null;
};

const depsFacet = Facet.define<Deps, Deps | null>({ combine: (all) => all[0] ?? null });

/** A tap on an entry of the list. */
export const selectSuggestion = StateEffect.define<number>();

/** Escape: the suggestion is dismissed, its name with it. */
export const dismissSuggestion = StateEffect.define<null>();
/** The arrows of the list: -1 or 1. */
export const moveSuggestion = StateEffect.define<number>();

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
  return proseAt(state, shown.hits[0]?.from ?? shown.to, shown.to);
}

/** Whether `from`..`to` is prose in `state` (frontmatter, code, HTML and
 *  links left out): the `@` mention asks it too. */
export function proseAt(state: EditorState, from: number, to: number): boolean {
  return !insideFrontmatter(state.doc, to) && proseHere(state, from, to);
}

/** The `@` that starts a mention just before the word at `start`. */
function mentionBefore(before: string, start: number): boolean {
  if (before[start - 1] !== "@") return false;
  const c = before[start - 2];
  return c === undefined || !wordy(c);
}

function build(data: Omit<Shown, "tooltip">, deps: Deps): Shown {
  const shown = data as Shown;
  const primary = () => shown.hits[shown.sel] as Hit;
  shown.tooltip = {
    pos: shown.to,
    above: shown.touch,
    strictSide: true,
    arrow: false,
    create: (view) => {
      const dom = document.createElement("div");
      dom.className = "cm-link-suggest";
      for (const type of ["mousedown", "pointerdown"]) dom.addEventListener(type, (e) => e.preventDefault());
      if (!shown.list) {
        const hit = primary();
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "link-suggest-chip";
        // The editor keeps the focus: the chip is reached by the key, or
        // by a tap, not by Tab.
        chip.tabIndex = -1;
        chip.setAttribute("aria-label", ls.chipLabel(hit.name, shown.touch));
        const words = document.createElement("span");
        words.textContent = ls.chip(hit.name);
        chip.append(words);
        if (!shown.touch) {
          const key = document.createElement("kbd");
          key.textContent = ls.key;
          key.setAttribute("aria-hidden", "true");
          chip.append(key);
        }
        chip.addEventListener("click", () => accept(view));
        dom.append(chip);
        deps.say(ls.heard(hit.name, shown.touch));
      } else {
        const ul = document.createElement("ul");
        ul.className = "link-suggest-list";
        ul.setAttribute("role", "listbox");
        ul.setAttribute("aria-label", ls.listLabel);
        shown.hits.forEach((hit, i) => {
          const li = document.createElement("li");
          li.setAttribute("role", "option");
          li.setAttribute("aria-selected", String(i === shown.sel));
          li.className = i === shown.sel ? "link-suggest-item selected" : "link-suggest-item";
          const label = document.createElement("span");
          label.textContent = hit.alias && hit.full ? `${hit.full} → ${hit.name}` : hit.name;
          li.append(label);
          const dir = dirOf(hit.path);
          if (dir) {
            const where = document.createElement("small");
            where.textContent = dir;
            li.append(where);
          }
          li.addEventListener("click", () => {
            view.dispatch({ effects: selectSuggestion.of(i) });
            accept(view);
          });
          ul.append(li);
        });
        dom.append(ul);
        deps.say(ls.heardList(shown.hits.length, primary().name, shown.touch));
      }
      return { dom };
    },
  };
  return shown;
}

function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function suggest(tr: import("@codemirror/state").Transaction, value: Value, dismissed: Dismissed[], deps: Deps): Shown | null {
  const sel = tr.newSelection.main;
  if (!sel.empty) return null;
  const names = deps.names();
  if (!names) return null;
  const doc = tr.newDoc;
  const line = doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const next = doc.sliceString(sel.head, Math.min(line.to, sel.head + 2));
  const touch = coarse();
  const table = /^\s*\|/.test(line.text);
  const hit = names.find(before, next, deps.path());
  if (hit) {
    if (mentionBefore(before, hit.start)) return null;
    const from = line.from + hit.start;
    const to = from + hit.text.length;
    const key = `${hit.path}\n${fold(hit.text)}`;
    // Escape dismissed the list for this word: its whole name too.
    if (value.escaped !== null && value.escaped === from + (hit.text.match(/[\p{L}\p{N}\p{M}_]+$/u)?.index ?? 0)) return null;
    if (dismissed.length > 0) {
      const around = paragraphOf(doc, to);
      if (dismissed.some((d) => d.key === key && d.pos >= around.from && d.pos <= around.to)) return null;
    }
    return build({ hits: [{ ...hit, from }], sel: 0, list: false, key, to, table, touch }, deps);
  }
  const parts = names.partial(before, next, deps.path(), deps.partialRule?.());
  const first = parts[0];
  if (!first || mentionBefore(before, first.start)) return null;
  // Escape dismissed the list for the word being typed.
  const wordFrom = line.from + (before.match(/[\p{L}\p{N}\p{M}_]+$/u)?.index ?? before.length);
  if (value.escaped !== null && value.escaped === wordFrom) return null;
  const hits = parts.map((h) => ({ ...h, from: line.from + h.start }));
  const key = `list\n${hits.map((h) => h.path).join("\n")}`;
  return build({ hits, sel: 0, list: true, key, to: sel.head, table, touch }, deps);
}

const field = StateField.define<Value>({
  create: () => ({ shown: null, dismissed: [], escaped: null }),
  update(value, tr) {
    const deps = tr.startState.facet(depsFacet);
    const dismissEffect = tr.effects.some((e) => e.is(dismissSuggestion));
    const move = tr.effects.find((e) => e.is(moveSuggestion))?.value as number | undefined;
    const pick = tr.effects.find((e) => e.is(selectSuggestion))?.value as number | undefined;
    if ((move !== undefined || pick !== undefined) && value.shown?.list && deps && !tr.docChanged) {
      const n = value.shown.hits.length;
      const sel = pick !== undefined ? pick : (value.shown.sel + (move ?? 0) + n) % n;
      return { ...value, shown: build({ ...value.shown, sel }, deps) };
    }
    if (!tr.docChanged && !tr.selection && !dismissEffect) return value;
    let dismissed = tr.docChanged ? value.dismissed.map((d) => ({ key: d.key, pos: tr.changes.mapPos(d.pos, -1) })) : value.dismissed;
    let escaped = value.escaped !== null && tr.docChanged ? tr.changes.mapPos(value.escaped, -1) : value.escaped;
    const prev = value.shown;
    const typed = tr.docChanged && tr.isUserEvent("input.type");
    const ready = deps && typed && deps.enabled() && !tr.startState.readOnly && completionStatus(tr.startState) !== "active";
    if (prev?.list && visibleIn(tr.startState, prev)) {
      // The list: Escape dismisses it for this word; typing narrows it.
      if (dismissEffect) escaped = wordStartOf(tr.startState, prev.to);
    } else if (prev && visibleIn(tr.startState, prev) && (dismissEffect || typed || (tr.docChanged && tr.isUserEvent("delete")))) {
      // The chip stays through a space or a mark of punctuation after the
      // name; Escape, or a word typed on, turns it down.
      const keep = ready && !dismissEffect ? suggest(tr, { ...value, escaped }, dismissed, deps) : null;
      const same = keep && !keep.list && keep.key === prev.key && keep.to === tr.changes.mapPos(prev.to, -1);
      if (!same) dismissed = [...dismissed, { key: prev.key, pos: tr.docChanged ? tr.changes.mapPos(prev.to, -1) : prev.to }].slice(-KEEP);
    }
    if (!ready) return { shown: null, dismissed, escaped };
    return { shown: suggest(tr, { ...value, escaped }, dismissed, deps), dismissed, escaped };
  },
  provide: (f) => showTooltip.compute([f], (state) => shownIn(state)?.tooltip ?? null),
});

/** Where the word that ends at `pos` begins. */
function wordStartOf(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  return line.from + (before.match(/[\p{L}\p{N}\p{M}_]+$/u)?.index ?? before.length);
}

/** The suggestion standing in `state`, if any. */
function shownIn(state: EditorState): Shown | null {
  const shown = state.field(field, false)?.shown ?? null;
  return shown && visibleIn(state, shown) ? shown : null;
}

/** The suggestion being shown, if any: the entry the keys would accept. */
export function suggestionOf(state: EditorState): Hit | null {
  const shown = shownIn(state);
  return shown?.hits[shown.sel] ?? null;
}

/** The suggestions standing now (one for the chip, up to five for the
 *  list) and which is chosen. */
export function listOf(state: EditorState): { hits: Hit[]; sel: number; list: boolean } | null {
  const shown = shownIn(state);
  return shown ? { hits: shown.hits, sel: shown.sel, list: shown.list } : null;
}

/** The edit that accepts the suggestion: the typed words become the link,
 *  the cursor after it; null when none is shown. An `input.complete`
 *  edit, so it suggests nothing in turn. */
export function acceptChange(state: EditorState): TransactionSpec | null {
  const shown = shownIn(state);
  const deps = state.facet(depsFacet);
  if (!shown || !deps) return null;
  const hit = shown.hits[shown.sel];
  if (!hit) return null;
  // A partial list writes the whole name (or alias) it offers.
  const written = hit.full !== undefined ? { ...hit, text: hit.full } : hit;
  const link = linkWritten(written, deps.target(hit.path), shown.table);
  const head = state.selection.main.head;
  const delta = link.length - (shown.to - hit.from);
  return {
    changes: { from: hit.from, to: shown.to, insert: link },
    // The cursor stays after the space or the mark typed past the name.
    selection: { anchor: Math.max(hit.from + link.length, head + delta) },
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
  const hit = shown?.hits[shown.sel];
  if (!shown || !spec || !deps || !hit) return false;
  view.dispatch(spec);
  view.focus();
  deps.say(ls.linked(hit.name));
  return true;
}

function move(by: number) {
  return (view: EditorView): boolean => {
    if (!shownIn(view.state)?.list) return false;
    view.dispatch({ effects: moveSuggestion.of(by) });
    return true;
  };
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
        { key: "ArrowDown", run: move(1) },
        { key: "ArrowUp", run: move(-1) },
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
