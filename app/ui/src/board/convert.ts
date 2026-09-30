// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A drawing of Obsidian's Excalidraw plugin, `.excalidraw.md`, as a board
// (ADR 0057 point 5; spec, conversion table D4). Read from the file's own
// structure as it stands in a vault (`docs/reference/board-decision.md`
// §3.1) and from Excalidraw's scene schema (MIT); nothing of the plugin's
// code (AGPL-3.0) was read. The note keeps a `## Drawing` section whose
// fenced block holds the scene, as JSON or compressed with LZ-string to
// base64 (`compressed-json`), and a `## Embedded Files` section naming the
// file behind each image: `<fileId>: [[picture.png]]`.
//
// The board gets the scene's elements as its drawing, except images: an
// image is a file of the folder on a board (ADR 0057 point 2), so one whose
// file is named becomes a `file` node where the image was, and one whose
// file is not is left out and counted. Pure: the caller resolves names to
// paths and shows the result as a diff before anything is written.

import LZString from "lz-string";
import type { CanvasDoc, CanvasNode } from "./model";

export type Drawing = {
  elements: Record<string, unknown>[];
  /** fileId → the target written in `[[…]]`. */
  embedded: Map<string, string>;
};

export type ReadResult = { drawing: Drawing } | { error: "not-drawing" | "unreadable" };

function section(text: string, heading: string): string | null {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === heading);
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && /^#{1,2} /.test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end).join("\n");
}

/** The drawing of an `.excalidraw.md`, or why there is none. */
export function readDrawing(text: string): ReadResult {
  const body = section(text, "## Drawing");
  if (body === null) return { error: "not-drawing" };
  const fence = /```(compressed-json|json)\s*\n([\s\S]*?)\n```/.exec(body);
  if (!fence) return { error: "not-drawing" };
  const kind = fence[1];
  const raw = fence[2] ?? "";
  let json: string | null;
  try {
    json = kind === "compressed-json" ? LZString.decompressFromBase64(raw.replace(/\s+/g, "")) : raw;
  } catch {
    json = null;
  }
  if (!json) return { error: "unreadable" };
  let scene: unknown;
  try {
    scene = JSON.parse(json);
  } catch {
    return { error: "unreadable" };
  }
  const elements = (scene as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return { error: "unreadable" };
  const embedded = new Map<string, string>();
  const files = section(text, "## Embedded Files") ?? section(text, "# Embedded files") ?? "";
  for (const line of files.split("\n")) {
    const m = /^([0-9a-f]{8,}):\s*!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/i.exec(line.trim());
    if (m && m[1] && m[2]) embedded.set(m[1], m[2].trim());
  }
  return {
    drawing: {
      elements: elements.filter((e): e is Record<string, unknown> => e !== null && typeof e === "object" && !Array.isArray(e)),
      embedded,
    },
  };
}

/** The board for a drawing: `resolve` names the file an embedded target
 *  reaches from the drawing's note, or null. */
export function toBoard(drawing: Drawing, resolve: (target: string) => string | null): { doc: CanvasDoc; dropped: number } {
  const nodes: CanvasNode[] = [];
  const kept: Record<string, unknown>[] = [];
  let dropped = 0;
  for (const e of drawing.elements) {
    if (e["isDeleted"] === true) continue;
    if (e["type"] !== "image") {
      kept.push(e);
      continue;
    }
    const target = typeof e["fileId"] === "string" ? drawing.embedded.get(e["fileId"]) : undefined;
    const path = target ? resolve(target) : null;
    if (!path || typeof e["id"] !== "string") {
      dropped++;
      continue;
    }
    const n = (k: string): number => (typeof e[k] === "number" && Number.isFinite(e[k]) ? Math.round(e[k] as number) : 0);
    nodes.push({ id: e["id"], type: "file", file: path, x: n("x"), y: n("y"), width: Math.max(1, n("width")), height: Math.max(1, n("height")) });
  }
  return { doc: { nodes, edges: [], verso: { version: 1, drawing: kept } }, dropped };
}

/** Where the board of `note` goes: beside it, `Name.canvas` for
 *  `Name.excalidraw.md` or `Name.md`. */
export function boardPathFor(note: string): string {
  return note.replace(/(\.excalidraw)?\.md$/, "") + ".canvas";
}
