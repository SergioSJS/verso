// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What is drawn above each card, again over it (ADR 0057): a card is a web
// view's frame under Excalidraw's canvas, so a shape over a card is drawn a
// second time, as a picture, above the card. Moved out of `view.tsx`
// unchanged (ADR 0067).

import { exportToSvg, getCommonBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Overlay } from "./cards";
import { isNode, type El } from "./model";

/** The overlays drawn now, and how to ask for them again after a change of
 *  the scene. */
export function useOverlays(
  api: RefObject<ExcalidrawImperativeAPI | null>,
  dark: boolean,
): { overlays: ReadonlyMap<string, Overlay>; scheduleOverlays: (els: readonly ExcalidrawElement[]) => void } {
  // What is drawn above each card, in the board's order, drawn again over
  // it. Worked out one frame after a change, and only for a card whose
  // elements above changed: moving a card alone keeps its picture.
  const [overlays, setOverlays] = useState<ReadonlyMap<string, Overlay>>(new Map());
  const overlaysRef = useRef<{ map: ReadonlyMap<string, Overlay>; keys: Map<string, string> }>({ map: new Map(), keys: new Map() });
  const sceneRef = useRef<readonly ExcalidrawElement[]>([]);
  const overlayFrame = useRef(0);
  const overlayBusy = useRef(false);
  const overlayAgain = useRef(false);
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const runOverlays = useCallback(async (): Promise<void> => {
    if (overlayBusy.current) {
      overlayAgain.current = true;
      return;
    }
    overlayBusy.current = true;
    try {
      // What is being drawn is Excalidraw's own canvas's, above the cards
      // (style.css); a copy here would trail the pointer beside it.
      const st = api.current?.getAppState();
      const drawing = new Set([st?.newElement?.id, st?.multiElement?.id].filter((v): v is string => typeof v === "string"));
      const els = (sceneRef.current as unknown as El[]).filter((e) => !e.isDeleted && !drawing.has(e.id));
      const bounds = els.map((e) => getCommonBounds([e as unknown as ExcalidrawElement]));
      const prev = overlaysRef.current;
      const map = new Map<string, Overlay>();
      const keys = new Map<string, string>();
      const jobs: Promise<void>[] = [];
      els.forEach((card, i) => {
        if (card.type !== "embeddable" || !isNode(card)) return;
        const [cx0, cy0, cx1, cy1] = bounds[i]!;
        const above: El[] = [];
        let aboveBounds: [number, number, number, number] | null = null;
        for (let j = i + 1; j < els.length; j++) {
          const o = els[j]!;
          if (o.type === "embeddable" || o.type === "iframe" || o.type === "frame" || o.type === "magicframe") continue;
          const [ox0, oy0, ox1, oy1] = bounds[j]!;
          if (ox1 < cx0 || ox0 > cx1 || oy1 < cy0 || oy0 > cy1) continue;
          above.push(o);
          aboveBounds = aboveBounds
            ? [Math.min(aboveBounds[0], ox0), Math.min(aboveBounds[1], oy0), Math.max(aboveBounds[2], ox1), Math.max(aboveBounds[3], oy1)]
            : [ox0, oy0, ox1, oy1];
        }
        if (!above.length || !aboveBounds) return;
        const key = `${darkRef.current ? "d" : "l"}|${above.map((o) => `${o.id}:${String(o["version"])}`).join("|")}`;
        keys.set(card.id, key);
        const kept = prev.map.get(card.id);
        if (kept && prev.keys.get(card.id) === key) {
          map.set(card.id, kept);
          return;
        }
        const [minX, minY] = getCommonBounds(above as unknown as ExcalidrawElement[]);
        jobs.push(
          exportToSvg({
            elements: above as unknown as ExcalidrawElement[],
            appState: { exportBackground: false, exportWithDarkMode: darkRef.current, viewBackgroundColor: "transparent" },
            files: api.current?.getFiles() ?? null,
            exportPadding: 0,
            skipInliningFonts: true,
          }).then(
            (svg: SVGSVGElement) => void map.set(card.id, { x: minX, y: minY, svg: svg.outerHTML }),
            () => keys.delete(card.id),
          ),
        );
      });
      await Promise.all(jobs);
      const same = map.size === prev.map.size && [...map].every(([k, v]) => prev.map.get(k) === v);
      overlaysRef.current = { map, keys };
      if (!same) setOverlays(map);
    } finally {
      overlayBusy.current = false;
      if (overlayAgain.current) {
        overlayAgain.current = false;
        void runOverlays();
      }
    }
  }, []);
  const scheduleOverlays = useCallback(
    (els: readonly ExcalidrawElement[]) => {
      sceneRef.current = els;
      if (overlayFrame.current) return;
      overlayFrame.current = window.requestAnimationFrame(() => {
        overlayFrame.current = 0;
        void runOverlays();
      });
    },
    [runOverlays],
  );
  useEffect(() => {
    overlaysRef.current = { map: overlaysRef.current.map, keys: new Map() };
    scheduleOverlays(sceneRef.current);
  }, [dark, scheduleOverlays]);
  useEffect(() => () => window.cancelAnimationFrame(overlayFrame.current), []);
  return { overlays, scheduleOverlays };
}
