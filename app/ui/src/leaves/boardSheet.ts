// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- A board's section of the phone's ⋯ sheet (2026-11-15) ----------
 * On a phone the board gives its canvas the room: Board | Text, what puts
 * something on it, the free arrows, its search, its outline, Excalidraw's
 * menu and who sees it leave the canvas for this section of the top bar's
 * sheet (screen/phoneSheet.ts), between the tab's folder and the app's
 * verbs. Each button does what the board's own does (board/phoneVerbs.ts),
 * after the sheet closes, so a picker or a field the verb opens has the
 * screen. */

import { h } from "../dom";
import { icon } from "../icons";
import { boardText } from "../strings";
import type { BoardVerb } from "../board/types";
import { st } from "../screen/strings";

const SVG = "http://www.w3.org/2000/svg";

/** A verb's icon: a path of the board's 16-px icons, at the sheet's pen. */
function verbIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  svg.classList.add("icon");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

export type BoardSheetParts = {
  /** The board's Board | Text buttons (BoardLeaf.boardModes). */
  modes: HTMLElement;
  showing: "board" | "source";
  /** The board's verbs; none while its text is shown. */
  verbs: BoardVerb[];
  /** Who sees the board (NoteAccess.el), shown at a table only. */
  access: HTMLElement;
  /** Closes the sheet, its focus not given back: the verb takes it. */
  done: () => void;
};

export function boardSection({ modes, showing, verbs, access, done }: BoardSheetParts): HTMLElement {
  const box = h("div", "phone-sheet-board");
  const row = h("div", "phone-sheet-modes");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", st.sheetMode);
  for (const face of modes.querySelectorAll<HTMLButtonElement>("button[data-face]")) {
    const b = h("button", "phone-sheet-mode");
    b.type = "button";
    const which = face.dataset["face"] === "source" ? "source" : "board";
    b.dataset["face"] = which;
    b.append(icon(which), h("span", "", which === "board" ? boardText.boardMode : boardText.textMode));
    b.setAttribute("aria-pressed", String(which === showing));
    b.addEventListener("click", () => {
      done();
      face.click();
    });
    row.append(b);
  }
  box.append(h("h2", "phone-sheet-heading", boardText.boardMode), row);
  const grid = h("div", "phone-sheet-verbs phone-sheet-board-verbs");
  for (const v of verbs) {
    const b = h("button", "phone-sheet-verb");
    b.type = "button";
    b.dataset["verb"] = v.id;
    b.append(verbIcon(v.icon), h("span", "", v.label));
    if (v.pressed !== undefined) b.setAttribute("aria-pressed", String(v.pressed));
    b.addEventListener("click", () => {
      done();
      v.run();
    });
    grid.append(b);
  }
  // Who sees it (ADR 0110 item 4): the board's own button, at a table.
  const who = access.querySelector<HTMLButtonElement>("button");
  if (who && !access.hidden) {
    const b = h("button", "phone-sheet-verb");
    b.type = "button";
    b.dataset["verb"] = "access";
    b.append(icon("users"), h("span", "", who.getAttribute("aria-label") ?? who.title));
    b.addEventListener("click", () => {
      done();
      who.click();
    });
    grid.append(b);
  }
  if (grid.childElementCount > 0) box.append(grid);
  return box;
}
