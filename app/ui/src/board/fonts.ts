// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { FONT_FAMILY } from "@excalidraw/excalidraw";
import { type ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { BoardPrefs } from "./types";

export const FONT_ID: Record<BoardPrefs["font"], number> = { hand: 5, sans: 6, mono: 3 };

/** The name of each font Excalidraw ships, by its number. */
export const FONT_NAME = new Map<number, string>(Object.entries(FONT_FAMILY).map(([name, id]) => [id, name]));

/** Whether a text's font is in the window: registered, and every face its
 *  characters need loaded. A font with no face of its own (a system font)
 *  is measured right from the start and never needs it. */
export function fontReady(t: { fontFamily: number; fontSize: number; text: string }): boolean {
  const name = FONT_NAME.get(t.fontFamily);
  if (!name) return false;
  let registered = false;
  document.fonts.forEach((f) => {
    if (f.family.replace(/^["']|["']$/g, "") === name) registered = true;
  });
  return registered && document.fonts.check(`${t.fontSize}px "${name}"`, t.text);
}

/** Settles once the faces the texts need are in, each asked for. WebKit
 *  does not always fire `loadingdone`, and a font that arrives late — a
 *  cold start of the app — would leave its texts cut for good. */
export function fontsOf(els: readonly ExcalidrawElement[]): Promise<unknown> {
  const wanted = new Map<string, string>();
  for (const e of els) {
    if (e.type !== "text") continue;
    const name = FONT_NAME.get(e.fontFamily);
    if (!name) continue;
    const font = `${e.fontSize}px "${name}"`;
    wanted.set(font, (wanted.get(font) ?? "") + e.text);
  }
  return Promise.allSettled([...wanted].map(([font, text]) => document.fonts.load(font, text)));
}
