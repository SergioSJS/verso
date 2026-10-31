// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Markdown text card on the board (a JSON Canvas text node): asked for and
// put at the view's centre, or where a double click or a double tap landed on
// an empty spot. The touch memory is a ref the component holds (hook rules).

import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { RefObject } from "react";
import { type CanvasNode, type El, isDoubleTap, textCardAt } from "./model";
import { BoardHost } from "./types";
import { randomId } from "./util";
import { Api } from "./view";

export type TextCardDeps = {
  api: RefObject<Api | null>;
  host: BoardHost;
  /** No card may be added: the board is read-only or viewed as a reader. */
  locked: () => boolean;
  add: (node: CanvasNode) => void;
  sceneAt: (clientX?: number, clientY?: number) => [number, number];
  /** The user acted on the board: the view is theirs from now on. */
  touched: RefObject<boolean>;
  lastTap: RefObject<{ at: number; x: number; y: number } | null>;
};

export function textCardActions({ api, host, locked, add, sceneAt, lastTap, touched }: TextCardDeps) {
  const s = host.strings;
  // A Markdown text card (a JSON Canvas text node), its text asked for at
  // once: put at the view's centre, or where the pointer was (a double
  // click on an empty spot). Cancelled or empty, no card is left behind.
  const addText = async (clientX?: number, clientY?: number): Promise<void> => {
    if (locked()) return;
    const text = await host.prompt(s.editText, "", true);
    if (text === null || text.trim() === "") return;
    const [x, y] = sceneAt(clientX, clientY);
    add(textCardAt(text, [x, y], randomId()));
  };
  // An empty spot, for a double click or tap: on the canvas itself, the
  // selection tool in hand, nothing under the pointer (the click that began
  // the double click selects what it hits), nothing being typed or drawn.
  const emptySpot = (target: EventTarget | null): boolean => {
    const a = api.current;
    if (!a || locked() || host.prefs.doubleClick === "drawn") return false;
    if (!(target instanceof HTMLCanvasElement) || !target.closest(".excalidraw")) return false;
    const st = a.getAppState();
    return st.activeTool.type === "selection" && !st.editingTextElement && !st.newElement && !st.multiElement && Object.keys(st.selectedElementIds).length === 0;
  };
  // A double tap on a touch screen: Excalidraw counts it itself, from the
  // touches, so the second one is caught here before it gets there.
  const onTouchStart = (ev: { touches: ArrayLike<{ clientX: number; clientY: number }>; target: EventTarget | null; stopPropagation: () => void }): void => {
    if (ev.touches.length !== 1) {
      lastTap.current = null;
      return;
    }
    const t = ev.touches[0];
    if (!t) return;
    const prev = lastTap.current;
    const now = Date.now();
    if (isDoubleTap(prev, now, t.clientX, t.clientY)) {
      lastTap.current = null;
      if (emptySpot(ev.target)) {
        ev.stopPropagation();
        // The click a touch ends in would land on the dialog and close it:
        // asked once the finger is up.
        const { clientX, clientY } = t;
        window.setTimeout(() => void addText(clientX, clientY), 350);
      }
      return;
    }
    lastTap.current = { at: now, x: t.clientX, y: t.clientY };
  };
  // A text card's text, asked for again and written back.
  const editText = async (e: El, n: CanvasNode): Promise<void> => {
    const a = api.current;
    if (!a) return;
    const next = await host.prompt(s.editText, typeof n.text === "string" ? n.text : "", true);
    if (next === null) return;
    touched.current = true;
    const now = a.getSceneElementsIncludingDeleted();
    a.updateScene({
      elements: now.map((x) => (x.id === e.id ? newElementWith(x, { customData: { ...(x.customData ?? {}), canvas: { ...n, text: next } } }) : x)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };
  return { addText, emptySpot, onTouchStart, editText };
}
