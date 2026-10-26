// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the board does for a web page on a card (ADR 0057 point 10, decided
// 2026-10-21): add one from an address, switch a link card to its page and
// back, and enter or leave a page card. Each is one change of the scene.

import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { RefObject } from "react";
import { type CanvasNode, type CardView, type El, newNode, withPage, withView } from "./model";
import { BoardHost } from "./types";
import { randomId } from "./util";
import { Api } from "./view";

export type PageDeps = {
  api: RefObject<Api | null>;
  host: BoardHost;
  touched: RefObject<boolean>;
  center: () => [number, number];
  add: (node: CanvasNode) => void;
  /** The keyboard goes back to Excalidraw. */
  focusBoard: () => void;
};

export function pageActions({ api, host, touched, center, add, focusBoard }: PageDeps) {
  const s = host.strings;
  return {
    /** Ask for an address and put its page on the board. */
    addPage: async (): Promise<void> => {
      const url = (await host.prompt(s.linkAddress, "https://", false))?.trim();
      if (url && /^https?:\/\/\S+$/.test(url)) add(newNode("link", url, center(), randomId(), true));
      else if (url) host.status(s.pageNotAddress);
    },
    /** A page card is entered for its page to take the pointer, the way
     *  Excalidraw enters any embeddable, from the keyboard too through the
     *  card's own button. Left, the focus returns to the board. */
    interact: (id: string, on: boolean): void => {
      const a = api.current;
      const el = (a?.getSceneElements() as unknown as El[] | undefined)?.find((x) => x.id === id);
      if (!a || !el) return;
      a.updateScene({
        appState: { activeEmbeddable: on ? { element: el, state: "active" } : null, selectedElementIds: { [id]: true } } as never,
      });
      if (!on) focusBoard();
    },
    /** A data file's card shows its text or its diagram (`verso.view`). */
    setView: (id: string, view: CardView): void => {
      const a = api.current;
      if (!a) return;
      const el = a.getSceneElementsIncludingDeleted().find((x) => x.id === id);
      const n = el ? (el.customData?.["canvas"] as CanvasNode | undefined) : undefined;
      if (!el || !n) return;
      touched.current = true;
      a.updateScene({
        elements: a.getSceneElementsIncludingDeleted().map((x) => (x.id === id ? newElementWith(x, { customData: { ...(x.customData ?? {}), canvas: withView(n, view) } }) : x)),
        // Leaving a diagram for the text: the card is not entered any more.
        appState: { activeEmbeddable: null } as never,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    /** A link card shows its page, or only its address. */
    setPage: (e: El, n: CanvasNode, on: boolean): void => {
      const a = api.current;
      if (!a) return;
      touched.current = true;
      const now = a.getSceneElementsIncludingDeleted();
      a.updateScene({
        elements: now.map((x) =>
          x.id === e.id ? newElementWith(x, { height: on && x.height < 240 ? 360 : x.height, customData: { ...(x.customData ?? {}), canvas: withPage(n, on) } }) : x,
        ),
        appState: { activeEmbeddable: null } as never,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
  };
}
