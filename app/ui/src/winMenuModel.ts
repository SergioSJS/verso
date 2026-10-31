// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The menu of Windows and Linux (ADR 0072, decided 2026-10-22), without
// the DOM: which rows show, the letter underlined in a title, which key
// opens which menu, and when a tap of Alt opens the menu bar. The host's
// spec is the one source of the rows (`menu_spec.rs`); this is what the
// window does with it, so a test can run it.

import type { MenuEntry, MenuSection } from "./bindings";

/** The rows that show with these features on: those whose feature is off
 *  dropped, and the separators left at an end or doubled dropped too — what
 *  the host does for the Mac's bar (`menu_spec::visible`). The host's
 *  answer is already so; the browser harness's is not. */
export function visibleEntries(items: readonly MenuEntry[], on: ReadonlySet<string>): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const item of items) {
    if (item.feature && !on.has(item.feature)) continue;
    if (item.kind === "sep" && (out.length === 0 || out[out.length - 1]?.kind === "sep")) continue;
    out.push(item);
  }
  while (out[out.length - 1]?.kind === "sep") out.pop();
  return out;
}

/** A title with its mnemonic letter set apart, for the underline: the text
 *  before, the letter as written, the text after. No letter in the title:
 *  the whole title before. */
export function splitMnemonic(title: string, letter: string): [string, string, string] {
  const at = letter ? title.toLowerCase().indexOf(letter.toLowerCase()) : -1;
  if (at < 0) return [title, "", ""];
  return [title.slice(0, at), title.slice(at, at + 1), title.slice(at + 1)];
}

/** What a keydown is, for the mnemonics. */
export type KeyLike = { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };

/** The menu that Alt + a letter opens. Only Alt: Ctrl with Alt is AltGr on
 *  Windows keyboards that type letters with it, and Shift with Alt is
 *  someone's own key. The letter is read from the key, then from the code
 *  (a layout that does not type Latin letters still has KeyF). */
export function sectionForKey(sections: readonly MenuSection[], e: KeyLike): MenuSection | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const byKey = e.key.length === 1 ? e.key.toLowerCase() : "";
  const byCode = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : "";
  return sections.find((s) => s.mnemonic && (s.mnemonic === byKey || s.mnemonic === byCode)) ?? null;
}

/** A tap of Alt: pressed and released with nothing between (no other key,
 *  no click), as Windows opens a menu bar. */
export function altTap(): { down: (e: Pick<KeyboardEvent, "key" | "repeat" | "ctrlKey" | "metaKey" | "shiftKey">) => void; up: (e: Pick<KeyboardEvent, "key">) => boolean; other: () => void } {
  let clean = false;
  return {
    down(e) {
      if (e.key !== "Alt") clean = false;
      else if (!e.repeat) clean = !e.ctrlKey && !e.metaKey && !e.shiftKey;
    },
    up(e) {
      if (e.key !== "Alt") return false;
      const was = clean;
      clean = false;
      return was;
    },
    other() {
      clean = false;
    },
  };
}
