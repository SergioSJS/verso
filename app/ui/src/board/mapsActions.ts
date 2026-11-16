// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the board does for maps (ADR 0090): the commands that turn a
// picture into a map and back, send a card to the back or the front, pin a
// note, mark a card secret, and move a pin. Each is one change of the
// scene, one step of the undo history.

import { moveAllLeft, moveAllRight } from "@excalidraw/element";
import { CaptureUpdateAction, newElementWith, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { isBarePicture } from "./cards";
import { flagged, keptIds, mapAt, mapGroup, mapsOf, pinNode } from "./maps";
import { mapStrings } from "./mapStrings";
import { type CanvasDoc, type CanvasNode, type El, fromElements, isMap, isSecret, nodeData, nodeName, parseCanvas, toElements } from "./model";
import { isTraced, type ShownTracing, tracingLook } from "./tracing";
import { BoardHost } from "./types";
import { randomId } from "./util";
import { Api } from "./view";

/** What the map commands need of the board that holds them. */
export type MapDeps = {
  api: RefObject<Api | null>;
  host: BoardHost;
  /** The user acted on the board: the view is theirs from now on. */
  touched: RefObject<boolean>;
  /** The middle of what is in view, in the board's units. */
  center: () => [number, number];
  /** Where each pin being dragged began (kept across the board's renders). */
  dragFrom: RefObject<Map<string, [number, number]>>;
  /** The tracing this window shows (ADR 0120): view-only, never written. */
  shownTrace: RefObject<ShownTracing<ExcalidrawElement>>;
  /** A change the board makes by itself, not counted as the user's edit. */
  own: (update: (a: Api) => void) => void;
};

const withNode = (e: ExcalidrawElement, node: CanvasNode): ExcalidrawElement =>
  newElementWith(e, { customData: { ...(e.customData ?? {}), canvas: node } } as never);

/** The map commands of one board. */
export function mapActions({ api, host, touched, center, dragFrom, shownTrace, own }: MapDeps) {
  const ms = mapStrings(host.lang);
  const scene = (): readonly ExcalidrawElement[] => api.current?.getSceneElementsIncludingDeleted() ?? [];
  const find = (id: string): ExcalidrawElement | undefined => scene().find((e) => e.id === id && !e.isDeleted);
  /** The scene with `id` replaced by `change(it)`, as one step. */
  const change = (id: string, change: (e: ExcalidrawElement, node: CanvasNode) => ExcalidrawElement, order?: "back" | "front", keepSelection = true): void => {
    const a = api.current;
    if (!a) return;
    const target = find(id);
    const node = target ? nodeData(target as unknown as El) : null;
    if (!target || !node) return;
    touched.current = true;
    let elements: readonly ExcalidrawElement[] = scene().map((e) => (e.id === id ? change(e, node) : e));
    const selectedElementIds = keepSelection ? { ...a.getAppState().selectedElementIds, [id]: true } : {};
    if (order) {
      const state = { ...a.getAppState(), selectedElementIds: { [id]: true }, editingGroupId: null };
      elements = (order === "back" ? moveAllLeft : moveAllRight)(elements, state as never);
    }
    a.updateScene({ elements, appState: { selectedElementIds } as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };
  /** A pin for `path` at `point`, grouped with `map`, selected. */
  const pin = (path: string, point: readonly [number, number], map: ExcalidrawElement): void => {
    const a = api.current;
    if (!a) return;
    touched.current = true;
    const node = pinNode(path, point, randomId());
    const [el] = restoreElements(toElements({ nodes: [node], edges: [] }) as never, null, { refreshDimensions: false });
    if (!el) return;
    const group = mapGroup(map as unknown as El, randomId());
    const grouped = newElementWith(el, { groupIds: [group] } as never);
    const elements = [...scene().map((e) => (e.id === map.id && !e.groupIds.includes(group) ? newElementWith(e, { groupIds: [...e.groupIds, group] }) : e)), grouped];
    a.updateScene({ elements, appState: { selectedElementIds: { [grouped.id]: true } } as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    host.status(ms.pinned(nodeName(node, host.strings)));
  };
  return {
    /** A picture card becomes a map: locked, at the bottom, marked. */
    useAsMap(id: string): void {
      const e = find(id);
      const node = e ? nodeData(e as unknown as El) : null;
      if (!node || !isBarePicture(node, host) || isMap(node)) return;
      change(id, (x, n) => withNode(newElementWith(x, { locked: true } as never), flagged(n, { map: true })), "back", false);
    },
    /** A map is a picture card again: unlocked, unmarked; where it lies in
     *  the order is left. */
    stopMap(id: string): void {
      change(id, (x, n) => withNode(newElementWith(x, { locked: false } as never), flagged(n, { map: false })), undefined, false);
    },
    toBack: (id: string): void => change(id, (x) => x, "back"),
    toFront: (id: string): void => change(id, (x) => x, "front"),
    /** A card is secret, or is not (ADR 0090 item 5). */
    toggleSecret(id: string): void {
      change(id, (x, n) => withNode(x, flagged(n, { secret: !isSecret(n) })));
    },
    pin,
    /** A pin taken off the board, one step of the history. */
    removePin(id: string): void {
      const a = api.current;
      const e = find(id);
      const node = e ? nodeData(e as unknown as El) : null;
      if (!a || !e || !node) return;
      touched.current = true;
      a.updateScene({
        elements: scene().map((x) => (x.id === id ? newElementWith(x, { isDeleted: true }) : x)),
        appState: { selectedElementIds: {} } as never,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      host.status(ms.pinRemoved(nodeName(node, host.strings)));
    },
    /** "Pin a note here…": a note chosen, pinned in the middle of what is
     *  in view, on the map there (or the first map). */
    async pinHere(): Promise<void> {
      const maps = mapsOf(scene() as unknown as El[]);
      if (maps.length === 0) {
        host.status(ms.pinNeedsMap);
        return;
      }
      const path = await host.pickFile();
      if (!path) return;
      const [cx, cy] = center();
      const under = mapAt(scene() as unknown as El[], cx, cy);
      const map = under ?? maps[0];
      if (!map) return;
      const at: [number, number] = under ? [cx, cy] : [map.x + map.width / 2, map.y + map.height / 2];
      pin(path, at, find(map.id) ?? (map as unknown as ExcalidrawElement));
    },
    /** A pin dragged by `dx`, `dy` screen pixels from where it was when the
     *  drag began; `done`: let go. */
    movePin(id: string, dx: number, dy: number, done: boolean): void {
      const a = api.current;
      const e = find(id);
      if (!a || !e) return;
      touched.current = true;
      const from = dragFrom.current;
      const start = from.get(id) ?? [e.x, e.y];
      from.set(id, start);
      const z = a.getAppState().zoom.value;
      a.updateScene({
        elements: scene().map((x) => (x.id === id ? newElementWith(x, { x: start[0] + dx / z, y: start[1] + dy / z }) : x)),
        captureUpdate: done ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
      });
      if (done) from.delete(id);
    },
    /** The map's tracing shown to edit, or hidden again (ADR 0120): this
     *  window's own view. The scene holds it seen and unlocked; the file
     *  and the room never do (`hideLocal`), and it is no undo step. */
    showTracing(show: boolean, quiet = false): void {
      const a = api.current;
      if (!a) return;
      const kept = shownTrace.current;
      const elements = scene().map((e) => {
        if (!isTraced(e)) return e;
        if (show) {
          if (kept.has(e.id)) return e;
          const next = newElementWith(e, tracingLook(true));
          kept.set(e.id, { version: next.version, original: e });
          return next;
        }
        const s = kept.get(e.id);
        return s && s.version === e.version ? s.original : newElementWith(e, tracingLook(false));
      });
      if (!show) kept.clear();
      // The board's own change: no edit of the user's, so nothing is saved.
      own((b) => b.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER }));
      host.rememberTracing?.(show);
      if (!quiet) host.status(show ? ms.tracingShown : ms.tracingHidden);
    },
  };
}

/** What the board needs to be shown as a reader receives it (ADR 0090 item
 *  5, "view as a reader"). */
export type ReaderDeps = {
  api: RefObject<Api | null>;
  host: BoardHost;
  doc: RefObject<CanvasDoc>;
  /** Save, or send to the room, what the board holds. */
  flush: () => Promise<void>;
  /** A change of the scene the board makes itself (not the user's edit). */
  own: (update: (a: Api) => void) => void;
  restored: (d: CanvasDoc) => ExcalidrawElement[];
  /** The next change of the scene is read afresh: the sum of the elements'
   *  versions — what tells the board its scene changed — can be the same
   *  for two scenes (the board's own, and the reader's). */
  rekey: () => void;
  remeasure: (els: readonly ExcalidrawElement[]) => void;
  /** The board's own elements while the reader's view is shown. */
  asReader: readonly ExcalidrawElement[] | null;
  setAsReader: Dispatch<SetStateAction<readonly ExcalidrawElement[] | null>>;
  reading: RefObject<boolean>;
  notABoard: string;
};

/** The writer's "view as a reader": the board swapped for what the core's
 *  projection serves a reader, read-only, and the way back; and the ids of
 *  what a reader does not keep, for an exported picture. */
export function readerActions(d: ReaderDeps) {
  const ms = mapStrings(d.host.lang);
  const projected = async (a: Api): Promise<{ kept: readonly ExcalidrawElement[]; shown: CanvasDoc | null }> => {
    const kept = a.getSceneElementsIncludingDeleted();
    const json = JSON.stringify(fromElements(kept as unknown as El[], d.doc.current, a.getAppState().viewBackgroundColor));
    return { kept, shown: d.host.secret ? parseCanvas(await d.host.secret.project(json)) : null };
  };
  return {
    async toggle(): Promise<void> {
      const a = d.api.current;
      if (!a || !d.host.secret) return;
      if (d.asReader) {
        // The board's own again, and the room's if there is one.
        d.reading.current = false;
        const own = d.asReader;
        d.rekey();
        d.own((b) => b.updateScene({ elements: own as never, captureUpdate: CaptureUpdateAction.NEVER }));
        d.setAsReader(null);
        d.host.room?.resync();
        return;
      }
      await d.flush();
      try {
        const { kept, shown } = await projected(a);
        if (!shown) throw new Error(d.notABoard);
        d.reading.current = true;
        d.setAsReader(kept);
        const els = d.restored(shown);
        d.rekey();
        d.own((b) => b.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.NEVER }));
        d.remeasure(els);
      } catch (e) {
        d.reading.current = false;
        d.host.status(ms.viewFailed(e instanceof Error ? e.message : String(e)));
      }
    },
    /** The ids of the scene a reader is not served. */
    async secretIds(): Promise<ReadonlySet<string>> {
      const a = d.api.current;
      if (!a || !d.host.secret) return new Set();
      const { kept, shown } = await projected(a);
      const ids = shown ? keptIds(shown) : new Set<string>();
      return new Set(kept.filter((e) => !ids.has(e.id)).map((e) => e.id));
    },
  };
}
