// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- The board's verbs on a phone (2026-11-15) ----------
 * On a phone the board's own buttons — what puts something on it, the
 * free arrows, the search, the outline and Excalidraw's menu — leave the
 * canvas's corners for the top bar's ⋯ sheet, in a "Board" section
 * (leaves/board.ts builds it from this list; css/boardphone.css hides
 * them on the canvas). The canvas keeps only the drawing tools, and what
 * acts on a selection while there is one (the maintainer's choice of
 * 2026-11-15, option C of the phone board's alternatives). */

import { useEffect, useMemo, useState } from "react";
import { PHONE_MEDIA } from "../screen/phone";
import { type BoardStrings } from "./strings";
import { ICO } from "./tools";
import { type BoardVerb } from "./types";

export type VerbDeps = {
  s: BoardStrings;
  /** Something may be put on the board (not a reader, not read-only). */
  writable: boolean;
  /** The window can show a web page as a card. */
  web: boolean;
  looseOn: boolean;
  outlineOn: boolean;
  /** An imported map's tracing (ADR 0120): its name, whether shown, and
   *  the switch; none when the board has none. */
  tracing?: { label: string; shown: boolean; toggle: () => void } | undefined;
  addText: () => void;
  addImage: () => void;
  addFile: () => void;
  addLink: () => void;
  addPage: () => void;
  toggleLoose: () => void;
  search: () => void;
  outline: () => void;
  menu: () => void;
};

/** The board's verbs, in the desktop board's order (one order on every
 *  size, the maintainer, 2026-11-15; ADR 0076 item 6): Excalidraw's menu
 *  (☰, at the left of the top row), the text card and Insert's items (in
 *  the toolbar, after Excalidraw's tools), then the top-right island's
 *  search and outline. A reader's board has only the menu, search and
 *  outline. */
export function boardVerbs(d: VerbDeps): BoardVerb[] {
  const { s } = d;
  const verbs: BoardVerb[] = [{ id: "menu", label: s.sheetMenu, icon: ICO.menu, run: d.menu }];
  if (d.writable) {
    verbs.push(
      { id: "text", label: s.addText, icon: ICO.text, run: d.addText },
      { id: "image", label: s.sheetImage, icon: ICO.insert, run: d.addImage },
      { id: "file", label: s.sheetFile, icon: ICO.note, run: d.addFile },
      { id: "link", label: s.sheetLink, icon: ICO.link, run: d.addLink },
    );
    if (d.web) verbs.push({ id: "page", label: s.addPage, icon: ICO.page, run: d.addPage });
    verbs.push({ id: "loose", label: s.looseArrows, icon: ICO.arrow, run: d.toggleLoose, pressed: d.looseOn });
    if (d.tracing) verbs.push({ id: "tracing", label: d.tracing.label, icon: ICO.trace, run: d.tracing.toggle, pressed: d.tracing.shown });
  }
  verbs.push(
    { id: "search", label: s.search, icon: ICO.search, run: d.search },
    { id: "outline", label: s.outline, icon: ICO.outline, run: d.outline, pressed: d.outlineOn },
  );
  return verbs;
}

/** Whether the window is a phone's (`PHONE_MEDIA`), followed as it turns. */
export function usePhone(): boolean {
  const query = useMemo(() => (typeof window.matchMedia === "function" ? window.matchMedia(PHONE_MEDIA) : null), []);
  const [phone, setPhone] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = (): void => setPhone(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, [query]);
  return phone;
}
