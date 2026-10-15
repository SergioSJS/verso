// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's maps (ADR 0090): the commands for a large picture's tiles
// and the projection of a board for a reader, answered without a core. The
// real ones are the core's (`maptiles.rs`, `canvas_secret.rs`) and tested
// there; these have the same shapes, enough for the window to behave as in
// the app — a picture a test calls large is "cut" at once, or on a tick
// the test moves, and every tile is the same small PNG.

import type { MapInfo } from "../bindings";

/** A transparent 1 x 1 PNG, base64: every tile of the harness. */
const TILE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** The board without its secret nodes and what belongs to them, as the
 *  core's `canvas_secret::project` does it; an unreadable board that
 *  mentions a secret is served empty. */
export function projectBoard(text: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return /secret/i.test(text) ? '{"nodes":[],"edges":[]}\n' : text;
  }
  if (!isRecord(doc)) return text;
  const flagged = (n: unknown): boolean => {
    const v = isRecord(n) && isRecord(n["verso"]) ? n["verso"]["secret"] : undefined;
    return v !== undefined && v !== false && v !== null;
  };
  const nodes = Array.isArray(doc["nodes"]) ? doc["nodes"] : [];
  const ids = new Set<string>();
  for (const n of nodes) if (flagged(n) && isRecord(n) && typeof n["id"] === "string") ids.add(n["id"]);
  if (!nodes.some(flagged)) return text;
  const groupsOf = (n: unknown): string[] => (isRecord(n) && isRecord(n["verso"]) && Array.isArray(n["verso"]["groups"]) ? (n["verso"]["groups"] as unknown[]).filter((g): g is string => typeof g === "string") : []);
  const open = new Set<string>();
  const shut = new Set<string>();
  for (const n of nodes) for (const g of groupsOf(n)) (flagged(n) ? shut : open).add(g);
  const hiddenGroups = new Set([...shut].filter((g) => !open.has(g)));
  const named = (e: Record<string, unknown>, k: string): boolean => typeof e[k] === "string" && ids.has(e[k]);
  const out: Record<string, unknown> = { ...doc, nodes: nodes.filter((n) => !flagged(n)) };
  if (Array.isArray(doc["edges"])) out["edges"] = doc["edges"].filter((e) => !(isRecord(e) && (named(e, "fromNode") || named(e, "toNode"))));
  if (isRecord(doc["verso"]) && Array.isArray(doc["verso"]["drawing"])) {
    const drawing = (doc["verso"]["drawing"] as unknown[]).filter(isRecord);
    const gone = new Set<string>();
    const hides = (e: Record<string, unknown>): boolean =>
      named(e, "under") ||
      named(e, "containerId") ||
      named(e, "frameId") ||
      ["startBinding", "endBinding"].some((k) => isRecord(e[k]) && named(e[k] as Record<string, unknown>, "elementId")) ||
      (Array.isArray(e["groupIds"]) && e["groupIds"].some((g) => typeof g === "string" && hiddenGroups.has(g)));
    for (const e of drawing) if (hides(e) && typeof e["id"] === "string") gone.add(e["id"]);
    let more = true;
    while (more) {
      more = false;
      for (const e of drawing) {
        if (typeof e["id"] !== "string" || gone.has(e["id"])) continue;
        if ((typeof e["containerId"] === "string" && gone.has(e["containerId"])) || (typeof e["frameId"] === "string" && gone.has(e["frameId"]))) {
          gone.add(e["id"]);
          more = true;
        }
      }
    }
    out["verso"] = { ...doc["verso"], drawing: drawing.filter((e) => !(typeof e["id"] === "string" && gone.has(e["id"]))) };
  }
  return `${JSON.stringify(out, null, "\t")}\n`;
}

/** The tiles of the pictures a test calls large. */
export class Maps {
  /** Pictures cut into tiles: path → size. */
  readonly big = new Map<string, { width: number; height: number }>();
  /** How far the cutting is, 0 to 1: a test sets it below 1 to see the
   *  card wait, and back to 1 to see it ready. */
  progress = 1;
  /** A picture that cannot be cut, with the reason. */
  readonly failing = new Map<string, string>();
  /** The tiles asked for, in order: `path level/x/y`. */
  readonly asked: string[] = [];

  private static levels(width: number, height: number): number {
    let [w, h, n] = [width, height, 1];
    while (w > 256 || h > 256) {
      w = Math.ceil(w / 2);
      h = Math.ceil(h / 2);
      n++;
    }
    return n;
  }

  handlers(): Record<string, (a: Record<string, unknown>) => unknown> {
    return {
      project_board: (a) => projectBoard(String(a["text"])),
      map_open: (a): MapInfo => {
        const path = String(a["path"]);
        const why = this.failing.get(path);
        const size = this.big.get(path);
        if (why) return { state: "failed", width: size?.width ?? 0, height: size?.height ?? 0, tile: 256, levels: 0, done: 0, total: 0, message: why };
        if (!size) return { state: "whole", width: 0, height: 0, tile: 256, levels: 0, done: 0, total: 0, message: "" };
        const levels = Maps.levels(size.width, size.height);
        const total = 1000;
        const done = Math.round(total * this.progress);
        return { state: this.progress >= 1 ? "ready" : "cutting", width: size.width, height: size.height, tile: 256, levels, done, total, message: "" };
      },
      map_tile: (a) => {
        const path = String(a["path"]);
        this.asked.push(`${path} ${String(a["level"])}/${String(a["x"])}/${String(a["y"])}`);
        return this.big.has(path) && this.progress >= 1 ? TILE_PNG : null;
      },
    };
  }
}
