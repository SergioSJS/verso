// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the board sets right in the scene after Excalidraw changes it: a
// card-to-card arrow freed from a group, its ends on the cards' outlines, a
// loose arrow unbound, a shape drawn in a group lifted to its top. Each is
// a change of the board's own (`own`), never one of the user's. Moved out of
// `view.tsx` unchanged (ADR 0067).

import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { type RefObject, useCallback, useRef } from "react";
import { endAt, isNode, pointIn, type Binding, type El } from "./model";

/** The four fixes, each answering whether it changed the scene (the lift
 *  answers nothing). `loose`: whether "Loose arrows" is on. */
export function useSceneFixes(own: (update: (a: ExcalidrawImperativeAPI) => void) => void, loose: RefObject<boolean>) {
  // Excalidraw puts a shape drawn inside a frame just under the frame, and
  // a group's frame sits under its cards (the canvas's order): a shape
  // drawn on a card in a group would land under the card. Once drawn, it
  // goes to the top of its frame's range instead, as a shape drawn
  // anywhere else goes to the top.
  const seen = useRef<Set<string> | null>(null);
  // An arrow between two cards is a canvas edge: it belongs to no group
  // and passes under the cards, as the board reads it from the file.
  // Excalidraw puts an arrow begun inside a frame in that frame and clips it
  // to the frame's box, so an edge to a card of another group was cut at the
  // group's border until the board was opened again.
  const freeEdges = useCallback((els: readonly ExcalidrawElement[], state: AppState): boolean => {
    if (state.newElement || state.multiElement || state.editingTextElement || state.selectedLinearElement?.isEditing || state.resizingElement || state.selectedElementsAreBeingDragged) return false;
    const byId = new Map(els.map((e) => [e.id, e] as const));
    const node = (id: string | undefined): boolean => {
      const e = id ? byId.get(id) : undefined;
      return !!e && !e.isDeleted && isNode(e as unknown as El);
    };
    const edge = (e: ExcalidrawElement): boolean => {
      const a = e as unknown as El;
      return e.type === "arrow" && !e.isDeleted && node(a.startBinding?.elementId) && node(a.endBinding?.elementId);
    };
    const firstNode = els.findIndex((e) => !e.isDeleted && isNode(e as unknown as El));
    // An edge in a group, above the first card, or with its label in a
    // group (a label typed on the edge later is put in the edge's group,
    // and a text in a frame is drawn only inside the frame's box).
    const labelInFrame = (e: ExcalidrawElement): boolean => (e.boundElements ?? []).some((b) => b.type === "text" && !!byId.get(b.id)?.frameId);
    const wrong = els.filter((e, i) => edge(e) && (e.frameId || (firstNode >= 0 && i > firstNode) || labelInFrame(e)));
    if (wrong.length === 0) return false;
    const moving = new Set<string>();
    for (const e of wrong) {
      moving.add(e.id);
      for (const b of e.boundElements ?? []) if (b.type === "text") moving.add(b.id);
    }
    const lifted = els
      .filter((e) => moving.has(e.id))
      .map((e) => (e.frameId ? newElementWith(e as never, { frameId: null } as never) : e) as ExcalidrawElement);
    const rest = els.filter((e) => !moving.has(e.id));
    const at = rest.findIndex((e) => !e.isDeleted && isNode(e as unknown as El));
    const list = at < 0 ? [...rest, ...lifted] : [...rest.slice(0, at), ...lifted, ...rest.slice(at)];
    own((a) => a.updateScene({ elements: list, captureUpdate: CaptureUpdateAction.NEVER }));
    return true;
  }, [own]);

  // An edge — an arrow from a card to a card — passes under the cards, as
  // the canvas draws it: an end bound inside a card would end under it and
  // its head would not show. Such an end is bound on the card's outline
  // instead, aimed at the same point (ADR 0057 point 20). An arrow with an
  // end on a shape of the drawing is the drawing's, drawn over the cards:
  // Excalidraw's own way stands, its head at the point inside a picture.
  const orbitOnCards = useCallback((els: readonly ExcalidrawElement[], state: AppState): boolean => {
    if (state.newElement || state.multiElement || state.editingTextElement || state.selectedLinearElement?.isEditing || state.resizingElement || state.selectedElementsAreBeingDragged) return false;
    const byId = new Map(els.map((e) => [e.id, e] as const));
    const card = (b: Binding | null | undefined): El | undefined => {
      const n = b ? (byId.get(b.elementId) as unknown as El | undefined) : undefined;
      return n && !n.isDeleted && isNode(n) ? n : undefined;
    };
    let changed = false;
    const next = els.map((e) => {
      if (e.type !== "arrow" || e.isDeleted) return e;
      const a = e as unknown as El;
      const pts = a.points;
      if (a["elbowed"] === true || !pts || pts.length < 2) return e;
      const from = card(a.startBinding);
      const to = card(a.endBinding);
      if (!from || !to) return e;
      const fromAt = from && a.startBinding?.mode === "inside" ? a.startBinding.fixedPoint : null;
      const toAt = to && a.endBinding?.mode === "inside" ? a.endBinding.fixedPoint : null;
      if (!fromAt && !toAt) return e;
      const abs = pts.map((p) => [a.x + p[0], a.y + p[1]] as [number, number]);
      const n = abs.length - 1;
      // Each end aimed from the point the other end is bound at, or from
      // the arrow's next point when it bends.
      const target = (c: El | undefined, b: Binding | null | undefined, drawn: [number, number]): [number, number] => (c && b?.fixedPoint ? pointIn(c, b.fixedPoint) : drawn);
      if (fromAt) abs[0] = endAt(from, { fixedPoint: [fromAt[0], fromAt[1]], mode: "orbit" }, n > 1 ? abs[1]! : target(to, a.endBinding, abs[n]!));
      if (toAt) abs[n] = endAt(to, { fixedPoint: [toAt[0], toAt[1]], mode: "orbit" }, n > 1 ? abs[n - 1]! : target(from, a.startBinding, abs[0]!));
      const [x, y] = abs[0]!;
      const rel = abs.map(([px, py]) => [px - x, py - y] as [number, number]);
      const xs = rel.map((p) => p[0]);
      const ys = rel.map((p) => p[1]);
      changed = true;
      return newElementWith(e as never, {
        x,
        y,
        points: rel,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        startBinding: fromAt ? { ...a.startBinding, mode: "orbit" } : a.startBinding,
        endBinding: toAt ? { ...a.endBinding, mode: "orbit" } : a.endBinding,
      } as never) as ExcalidrawElement;
    });
    if (!changed) return false;
    own((api2) => api2.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER }));
    return true;
  }, [own]);

  const born = useRef<Set<string> | null>(null);
  const looseFresh = useCallback((els: readonly ExcalidrawElement[], state: AppState): boolean => {
    const known = born.current;
    if (!known) {
      born.current = new Set(els.map((e) => e.id));
      return false;
    }
    if (state.newElement || state.multiElement || state.editingTextElement || state.selectedLinearElement?.isEditing || state.resizingElement || state.selectedElementsAreBeingDragged) return false;
    const fresh = els.filter((e) => !known.has(e.id));
    for (const e of fresh) known.add(e.id);
    if (!loose.current) return false;
    const ids = new Set(
      fresh
        .filter((e) => e.type === "arrow" && !e.isDeleted && (e.startBinding || e.endBinding) && !(e as unknown as El).customData?.canvas)
        .map((e) => e.id),
    );
    if (ids.size === 0) return false;
    const next = els.map((e) => {
      if (ids.has(e.id)) return newElementWith(e as never, { startBinding: null, endBinding: null } as never) as ExcalidrawElement;
      if ((e.boundElements ?? []).some((b) => ids.has(b.id))) return newElementWith(e as never, { boundElements: (e.boundElements ?? []).filter((b) => !ids.has(b.id)) } as never) as ExcalidrawElement;
      return e;
    });
    own((api2) => api2.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER }));
    return true;
  }, [own]);

  const liftDrawn = useCallback((els: readonly ExcalidrawElement[], state: AppState): void => {
    const known = seen.current;
    if (!known) {
      seen.current = new Set(els.map((e) => e.id));
      return;
    }
    if (state.newElement || state.multiElement || state.editingTextElement || state.resizingElement || state.selectedElementsAreBeingDragged) return;
    const fresh = els.filter((e) => !known.has(e.id));
    if (fresh.length === 0) return;
    for (const e of fresh) known.add(e.id);
    const list = [...els];
    let moved = false;
    for (const e of fresh) {
      if (!e.frameId || e.isDeleted || isNode(e as unknown as El)) continue;
      const at = list.indexOf(e);
      let last = -1;
      list.forEach((o, k) => {
        if (o !== e && !o.isDeleted && (o.frameId === e.frameId || o.id === e.frameId)) last = k;
      });
      if (last <= at) continue;
      list.splice(at, 1);
      list.splice(last, 0, e);
      moved = true;
    }
    if (moved) own((a) => a.updateScene({ elements: list, captureUpdate: CaptureUpdateAction.NEVER }));
  }, [own]);

  return { freeEdges, orbitOnCards, looseFresh, liftDrawn };
}
