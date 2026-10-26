// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Opening the layout editor (ADR 0099 item 8) from the settings page or
// from a card: a folder's layout is edited as it is; a built-in (or one
// still on this device) is copied into the folder first, and the editor
// says so — without a folder it edits a copy that cannot be saved, and says
// that. The window's dialog stack and question are given to the editor.

import { ask, tell } from "../dialog";
import { asDialog, closed, opened, topOverlay } from "../dialogs/a11y";
import { PLAIN_RULES } from "./dice";
import { openLayoutEditor } from "./editor/shell";
import type { PreviewSource } from "./editor/sample";
import { E } from "./editor/strings";
import { LAYOUT_VERSION, type Layout } from "./model";
import { canWriteLayouts, duplicateLayout, freeId, type StoredLayout } from "./store";
import { S, word } from "./strings";

let sources: () => PreviewSource[] = () => [];

/** Where the editor finds the open note's statblocks (main.ts gives it). */
export function setLayoutEditorSources(f: () => PreviewSource[]): void {
  sources = f;
}

const DEPS = { ask, opened, closed, asDialog };

/** A layout with nothing but a heading, for "New layout". */
function blank(): Layout {
  return {
    version: LAYOUT_VERSION,
    id: freeId("layout"),
    name: { pt: "Novo layout", en: "New layout" },
    diceRules: PLAIN_RULES.map((r) => ({ ...r })),
    appearance: {},
    columns: 1,
    columnWidth: 400,
    blocks: [{ id: "name", type: "heading", properties: ["name"], size: 1 }],
  };
}

/** Open the editor on a layout (none: a new one). `first` is the statblock
 *  the card is drawn from first (the card the editor was opened from). */
export async function openLayoutBuilder(stored?: StoredLayout, onDone?: () => void, first?: PreviewSource): Promise<void> {
  let target: StoredLayout;
  let notice: string | undefined;
  const before = topOverlay();
  if (!stored) target = { layout: blank(), source: "device", problems: [] };
  else if (stored.source === "folder") target = stored;
  else if (canWriteLayouts()) {
    const r = await duplicateLayout(stored.layout.id);
    if (!r.ok) return void (await tell(r.why, S.page.ok));
    target = r.value;
    notice = E().copied(word(r.value.layout.name, r.value.layout.id));
    // The copy was written while the person kept going (Escape closed the
    // settings, ⌘P opened the switcher): an editor mounted now would take
    // the focus and cover what they opened. The copy is in the gallery.
    if (topOverlay() !== before) return void onDone?.();
  } else {
    const layout = JSON.parse(JSON.stringify(stored.layout)) as Layout;
    layout.id = freeId(`${layout.id.slice(0, 54)}-copy`);
    target = { layout, source: "device", problems: [] };
    notice = E().unsavedCopy;
  }
  const seen = new Set<string>();
  const list = [...(first ? [first] : []), ...sources()].filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)));
  openLayoutEditor({ stored: target, sources: list, ...(notice ? { notice } : {}), ...(onDone ? { onDone } : {}) }, DEPS);
}
