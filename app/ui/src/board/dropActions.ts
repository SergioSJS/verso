// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the board does with things put on it from outside (ADR 0057 point 2,
// ADR 0063): a picture or PDF dropped or pasted is copied into the folder and
// shown by a file card, a note dropped on a map is pinned there (ADR 0090),
// and a text card is put where a roll block was dropped. Each is one change of
// the scene. The staircase counter is a ref the component holds (hook rules).

import type { ClipboardEvent, DragEvent, RefObject } from "react";
import { viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { imageFileName } from "./imageRoute";
import { mapAt } from "./maps";
import { type CanvasNode, type El, newNode } from "./model";
import { ext, IMAGE } from "../paths";
import { BoardHost } from "./types";
import { randomId } from "./util";
import { Api } from "./view";

export type DropDeps = {
  api: RefObject<Api | null>;
  host: BoardHost;
  center: () => [number, number];
  add: (node: CanvasNode) => void;
  byId: (id: string) => El | undefined;
  /** Pin a note on a map (the map commands, built after these). */
  pin: (path: string, at: [number, number], target: never) => void;
  /** Where the staircase of several files stands (kept across renders). */
  stair: RefObject<{ busy: number; next: number }>;
  /** The user acted on the board: the view is theirs from now on. */
  touched: RefObject<boolean>;
};

export function dropActions({ api, host, center, add, byId, pin, stair, touched }: DropDeps) {
  const s = host.strings;
  // A picture or PDF dropped or pasted from outside is copied into the
  // folder (beside the board, in the attachments folder) and shown by a
  // file card, never kept inside the drawing (ADR 0057 point 2, ADR 0063).
  const sceneAt = (clientX?: number, clientY?: number): [number, number] => {
    const a = api.current;
    if (!a || clientX === undefined || clientY === undefined) return center();
    const p = viewportCoordsToSceneCoords({ clientX, clientY }, a.getAppState());
    return [p.x, p.y];
  };
  // A picture comes in at its own proportions, its longer side as long as
  // a new card's: a box of another shape would show the paper round it.
  const pictureSize = async (path: string): Promise<[number, number] | null> => {
    if (!IMAGE.test(ext(path))) return null;
    const boxed = (w: number, h: number): [number, number] => {
      const k = 400 / Math.max(w, h);
      return [Math.max(40, Math.round(w * k)), Math.max(40, Math.round(h * k))];
    };
    // A large picture is never loaded whole to be measured: the core reads
    // its size from the file (ADR 0090 item 4).
    const told = host.maps ? await host.maps.open(path).catch(() => null) : null;
    if (told && told.width > 0 && told.height > 0) return boxed(told.width, told.height);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => (img.naturalWidth && img.naturalHeight ? resolve(boxed(img.naturalWidth, img.naturalHeight)) : resolve(null));
      img.onerror = () => resolve(null);
      img.src = host.fileSrc(path);
    });
  };
  const addPath = async (path: string, clientX?: number, clientY?: number, nth = 0): Promise<void> => {
    const [x, y] = sceneAt(clientX, clientY);
    // A note dropped on a map is pinned there (ADR 0090 item 3).
    const onMap = ext(path) === "md" ? mapAt((api.current?.getSceneElements() ?? []) as unknown as El[], x, y) : undefined;
    const target = onMap ? byId(onMap.id) : undefined;
    if (target) {
      pin(path, [x + nth * 32, y + nth * 32], target as never);
      return;
    }
    const size = await pictureSize(path);
    const node = newNode("file", path, [x + nth * 32, y + nth * 32], randomId());
    if (size) {
      node.x = Math.round(x + nth * 32 - size[0] / 2);
      node.y = Math.round(y + nth * 32 - size[1] / 2);
      [node.width, node.height] = size;
    }
    add(node);
  };
  // A text card put where something was dropped (a roll block from the table).
  const addTextAt = (text: string, clientX?: number, clientY?: number): void => {
    const [x, y] = sceneAt(clientX, clientY);
    const node = newNode("text", text, [x, y], randomId());
    node.width = 340;
    node.height = 110;
    node.x = Math.round(x - node.width / 2);
    node.y = Math.round(y - node.height / 2);
    add(node);
  };
  // Several files go in a staircase, also when two drops overlap: the step
  // counts on until the last of them is in.
  const takeFiles = async (files: File[], clientX?: number, clientY?: number): Promise<void> => {
    const st = stair.current!;
    st.busy++;
    try {
      for (const f of files) {
        if (!IMAGE.test(ext(f.name)) && ext(f.name) !== "pdf") {
          host.status(s.imagesAsFiles);
          continue;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        });
        const path = await host.saveImage(imageFileName(f.name, f.type), base64);
        if (path) await addPath(path, clientX, clientY, st.next++);
      }
    } finally {
      if (--st.busy === 0) st.next = 0;
    }
  };
  const onFiles = (ev: DragEvent | ClipboardEvent): void => {
    touched.current = true;
    const list = "dataTransfer" in ev ? ev.dataTransfer?.files : ev.clipboardData?.files;
    // A card being edited takes a file as its note's text does.
    if (!list || list.length === 0 || (ev.target as Element | null)?.closest?.(".board-card-slot.is-active")) return;
    ev.stopPropagation();
    ev.preventDefault();
    const at = "dataTransfer" in ev ? ev : null;
    void takeFiles(Array.from(list), at?.clientX, at?.clientY);
  };
  return { sceneAt, addPath, addTextAt, takeFiles, onFiles };
}
