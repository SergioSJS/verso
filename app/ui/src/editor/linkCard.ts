// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A link followed in Edit mode on a touch screen (ADR 0076 item 4, option
// a). A mouse follows a link with ⌘ or Ctrl (live.ts); a phone has
// neither. A tap on a link places the cursor, as on any text — it never
// takes the person away from what they are writing — and a small card
// beside the link offers "Open" and "Edit link", as Notion does. The card
// is the editor's own tooltip, in its DOM after the text, where a screen
// reader reaches it.

import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView, showTooltip, type Tooltip } from "@codemirror/view";
import { posAt } from "./posAt";

/** A link under the cursor: where it is, what it names, and the part of
 *  it that "Edit link" selects (the target of a wikilink, the address of
 *  a Markdown link). */
export type LinkAt = { from: number; to: number; target: string; url: boolean; editFrom: number; editTo: number };

export type LinkCardOptions = {
  /** Open a wikilink's target, or a link to a note of the folder. */
  navigate: (target: string) => void;
  /** Open a web address outside the window. */
  openUrl: (url: string) => void;
  strings: { card: (target: string) => string; open: string; edit: string };
  /** The note the link names, drawn into `box` above the buttons (ADR 0085
   *  item 5: a finger has no hover); the function returned lets it go. */
  preview?: (link: LinkAt, box: HTMLElement) => () => void;
};

const WIKI = /(!?)\[\[([^\]\n]+)\]\]/g;
const MD = /\[([^\]\n]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"\n]*")?\)/g;
const BARE = /https?:\/\/[^\s<>()\]]+/g;

/** The link at `pos`, if the line holds one there. */
export function linkAt(state: EditorState, pos: number): LinkAt | null {
  const line = state.doc.lineAt(pos);
  const at = pos - line.from;
  for (const m of line.text.matchAll(WIKI)) {
    const start = m.index ?? 0;
    if (at < start || at > start + m[0].length) continue;
    const inner = m[2] ?? "";
    const target = inner.split("|")[0] ?? "";
    const open = line.from + start + (m[1] ? 3 : 2);
    return { from: line.from + start, to: line.from + start + m[0].length, target, url: false, editFrom: open, editTo: open + target.length };
  }
  for (const m of line.text.matchAll(MD)) {
    const start = m.index ?? 0;
    if (at < start || at > start + m[0].length) continue;
    const address = m[2] ?? "";
    // The address, after "[text](" and an optional "<".
    const addrAt = line.from + start + m[0].indexOf(address, (m[1] ?? "").length + 2);
    return { from: line.from + start, to: line.from + start + m[0].length, target: address, url: /^[a-z][a-z0-9+.-]*:/i.test(address), editFrom: addrAt, editTo: addrAt + address.length };
  }
  for (const m of line.text.matchAll(BARE)) {
    const start = m.index ?? 0;
    if (at < start || at > start + m[0].length) continue;
    const from = line.from + start;
    return { from, to: from + m[0].length, target: m[0], url: true, editFrom: from, editTo: from + m[0].length };
  }
  return null;
}

const setCard = StateEffect.define<LinkAt | null>();

export function linkCard(opts: LinkCardOptions) {
  const card = StateField.define<LinkAt | null>({
    create: () => null,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setCard)) return e.value;
      if (!value) return value;
      // Typing, or the cursor leaving the link, puts the card away.
      if (tr.docChanged) return null;
      const head = tr.state.selection.main.head;
      return head < value.from || head > value.to ? null : value;
    },
    provide: (f) =>
      showTooltip.from(f, (link): Tooltip | null =>
        link
          ? {
              pos: link.from,
              above: false,
              create: (view) => {
                const dom = document.createElement("div");
                dom.className = "cm-link-card";
                dom.setAttribute("role", "group");
                dom.setAttribute("aria-label", opts.strings.card(link.target));
                const make = (label: string, run: () => void): HTMLButtonElement => {
                  const b = document.createElement("button");
                  b.type = "button";
                  b.textContent = label;
                  // The editor keeps the focus until the button acts.
                  b.addEventListener("mousedown", (e) => e.preventDefault());
                  b.addEventListener("click", run);
                  return b;
                };
                const actions = document.createElement("div");
                actions.className = "cm-link-card-actions";
                let letGo = () => {};
                if (opts.preview) {
                  const box = document.createElement("div");
                  box.className = "cm-link-card-preview";
                  dom.append(box);
                  letGo = opts.preview(link, box);
                }
                dom.append(actions);
                actions.append(
                  make(opts.strings.open, () => {
                    view.dispatch({ effects: setCard.of(null) });
                    if (link.url) opts.openUrl(link.target);
                    else opts.navigate(decoded(link.target));
                  }),
                  make(opts.strings.edit, () => {
                    view.dispatch({ selection: { anchor: link.editFrom, head: link.editTo }, effects: setCard.of(null), scrollIntoView: true });
                    view.focus();
                  }),
                );
                return { dom, destroy: () => letGo() };
              },
            }
          : null,
      ),
  });
  // Which kind of pointer pressed last: the card is a finger's.
  let finger = false;
  const taps = EditorView.domEventHandlers({
    pointerdown: (e) => {
      finger = e.pointerType === "touch";
      return false;
    },
    click: (e, view) => {
      if (!finger || e.metaKey || e.ctrlKey) return false;
      const pos = posAt(view, { x: e.clientX, y: e.clientY });
      const link = pos === null ? null : linkAt(view.state, pos);
      // After the cursor is placed: the tap stays the editor's.
      if (link) queueMicrotask(() => view.dispatch({ effects: setCard.of(link) }));
      return false;
    },
  });
  return [card, taps];
}

/** Follow the link at `pos` as a click on it would: a note of the folder
 *  (with its `#heading` or `^id`) or a web address outside the window.
 *  False when there is no link there. */
export function openLinkAt(state: EditorState, pos: number, opts: Pick<LinkCardOptions, "navigate" | "openUrl">): boolean {
  const link = linkAt(state, pos);
  if (!link) return false;
  if (link.url) opts.openUrl(link.target);
  else opts.navigate(decoded(link.target));
  return true;
}

/** A link's target as the note names it: a malformed `%xx` is kept as
 *  typed instead of throwing in the click. */
function decoded(target: string): string {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}
