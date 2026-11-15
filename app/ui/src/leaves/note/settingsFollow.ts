// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The settings a note draws with, followed by the notes already open: a
 *  change in Settings reached only the notes opened after it. The sticker
 *  before a link (reading view), the spell checker (the editor's text box)
 *  and editing an embedded note in place (its button, in Reading and in
 *  Live Preview). Nothing is written: the notes are drawn again. */

import { icon } from "../../icons";
import { spaces } from "../../layout/spaces";
import { redraw } from "../../live";
import { settings } from "../../settings";
import { t } from "../../strings";
import { NoteLeaf } from "../note";

const followed = (): string => `${settings.stickerInLinks}|${settings.spellcheck}|${settings.inlineEmbedEdit}`;
let was: string | null = null;

function follow(leaf: NoteLeaf): void {
  // The editor: its text box's attributes and Live Preview's blocks.
  leaf.editor.dispatch({ effects: redraw.of(null) });
  if (!leaf.path || !leaf.note) return;
  leaf.dressLinks(leaf.path, leaf.preview, false);
  const label = settings.inlineEmbedEdit ? t.editInPlace : t.editEmbed;
  for (const edit of leaf.preview.querySelectorAll<HTMLElement>(".embed-note:not(.editing) > .embed-edit")) {
    edit.title = label;
    edit.replaceChildren(icon("edit", label));
  }
}

addEventListener("verso:settings-saved", () => {
  const now = followed();
  if (now === was) return;
  was = now;
  for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) if (l instanceof NoteLeaf) follow(l);
});
