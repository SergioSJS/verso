// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "View as diagram" on a fenced block of a note (ADR 0106, answered
// 2026-10-21): the block's text drawn in a tab beside the note, read-only.

import { hasCapability } from "../capabilities";
import { layout } from "../layout/spaces";
import type { Leaf } from "../leaves/leaf";
import { name } from "../paths";
import { type Format, formatOfLang } from "./model";

/** The format a code block's language word names, when the feature is on. */
export function diagramLang(lang: string): Format | null {
  return hasCapability("dataDiagram") ? formatOfLang(lang) : null;
}

/** The block's text as a diagram in a pane beside the note's. */
export function openBlockDiagram(from: Leaf, lang: string, text: string): void {
  const format = diagramLang(lang);
  if (!format) return;
  const pane = layout().split(from.pane, "row");
  pane.openBlockDiagram({ text, format, note: name(from.path) });
}
