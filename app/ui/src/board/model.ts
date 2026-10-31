// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The board's two shapes and the way between them (ADR 0057 point 3; the
// memo's section 5): a JSON Canvas file as the core reads and writes it,
// and the elements Excalidraw draws. Pure: no Excalidraw, no React, no
// contract — the pane restores the partial elements made here into full
// ones, and sends what `fromElements` builds to the core, which lays it
// over the file as read (the core keeps every token that did not change).
//
// A node of the canvas travels whole in its element's `customData.canvas`,
// fields Verso does not know included; saving spreads it back and sets
// only what the board can change, so nothing it does not understand is
// lost. Every node but a group is an `embeddable` the pane draws itself —
// a note, an image, a text card, a link card — and never loads as a page:
// its `link` is a marker that names nothing on the network. A group is a
// frame. An arrow bound at both ends to nodes is an edge; everything else
// on the board is the free drawing, kept in the file under `verso`.

export type Side = "top" | "right" | "bottom" | "left";

export type CanvasNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  [key: string]: unknown;
};

export type CanvasEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: Side;
  toSide?: Side;
  fromEnd?: string;
  toEnd?: string;
  color?: string;
  label?: string;
  [key: string]: unknown;
};

/** The version of the `verso` key this build reads and writes. A canvas
 *  with a later one comes from a newer Verso: shown, never written. */
export const BOARD_VERSION = 1;

export type CanvasDoc = {
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  verso?: { version?: number; drawing?: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
};

/** Where an arrow's end is bound to an element, as Excalidraw keeps it: a
 *  point of the element's box in fractions of its size, met on its outline
 *  (`orbit`) or at the point itself, inside the element (`inside`). */
export type Binding = { elementId: string; fixedPoint?: readonly [number, number] | null; mode?: string };

/** A box of the board. */
type Box = { x: number; y: number; width: number; height: number };

/** Where an edge's end meets its card: the binding's point and mode. */
export type EndPoint = { fixedPoint: [number, number]; mode: "orbit" | "inside" };

/** An Excalidraw element as far as the board reads it. */
export type El = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  customData?: { canvas?: CanvasNode | CanvasEdge; [key: string]: unknown } | null;
  strokeColor?: string;
  frameId?: string | null;
  name?: string | null;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  link?: string | null;
  points?: readonly (readonly [number, number])[];
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  boundElements?: readonly { id: string; type: string }[] | null;
  angle?: number;
  [key: string]: unknown;
};

/** The `link` of every node's element: never loaded, it names nothing on
 *  the network (`.invalid` is reserved, RFC 2606); `validateEmbeddable`
 *  accepts it and nothing else, so no page can be embedded by hand. */
export const MARKER = "https://verso.invalid/board-node";

/** JSON Canvas's six preset colors, as Obsidian shows them. */
const PRESETS: Record<string, string> = {
  "1": "#fb464c",
  "2": "#e9973f",
  "3": "#e0de71",
  "4": "#44cf6e",
  "5": "#53dfdd",
  "6": "#a882ff",
};
const NODE_STROKE = "#7d7d7d";
const EDGE_STROKE = "#7d7d7d";
const EXCALIDRAW_STROKE = "#1e1e1e";

/** A canvas color (preset or hex) as a hex Excalidraw draws. */
export function hexOf(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  return PRESETS[color] ?? (/^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback);
}

/** The canvas color for a stroke the board shows, or undefined when it is
 *  the default one (the key is then left out). */
function colorOf(stroke: string | undefined, fallback: string): string | undefined {
  // Excalidraw's own default stroke is no color either: an edge drawn with
  // the arrow tool as it comes is an edge with no color.
  if (!stroke || stroke.toLowerCase() === fallback || stroke.toLowerCase() === EXCALIDRAW_STROKE) return undefined;
  const preset = Object.entries(PRESETS).find(([, hex]) => hex.toLowerCase() === stroke.toLowerCase());
  return preset ? preset[0] : stroke;
}

/** The text of a canvas file as the board's document, or null when it is
 *  not a JSON object. */
export function parseCanvas(text: string): CanvasDoc | null {
  if (text.trim() === "") return { nodes: [], edges: [] };
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as CanvasDoc) : null;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** The side an edge's end takes on a card it is newly attached to: the
 *  side facing the other card, along the longer way between their middles.
 *  Where on the card the pointer let go does not count: Excalidraw puts a
 *  bound end on the card's outline by its own rules, and a side read from
 *  that point came out as any of the four. The board draws the end there
 *  at once and the file records it, so the arrow is the same before and
 *  after the board is opened again. */
export function endSide(n: { x: number; y: number; width: number; height: number }, other: { x: number; y: number; width: number; height: number }): Side {
  const ex = other.x + other.width / 2 - (n.x + n.width / 2);
  const ey = other.y + other.height / 2 - (n.y + n.height / 2);
  const across = Math.abs(ex) * (n.height + other.height) >= Math.abs(ey) * (n.width + other.width);
  return across ? (ex >= 0 ? "right" : "left") : ey >= 0 ? "bottom" : "top";
}

/** Whether an element stands for a node of the canvas. */
export function isNode(e: El): boolean {
  return e.type === "frame" || (e.type === "embeddable" && isRecord(e.customData?.canvas));
}

/** The canvas node an element carries (a new frame: a new group). */
export function nodeData(e: El): CanvasNode | null {
  const c = e.customData?.canvas;
  // A group's label is its frame's name as it is now: renamed on the
  // board, the canvas data it was read with still holds the old one.
  const name = e.type === "frame" ? (typeof e.name === "string" && e.name !== "" ? e.name : undefined) : undefined;
  if (isRecord(c) && typeof c["type"] === "string") {
    if (e.type !== "frame") return c as CanvasNode;
    const node = { ...(c as CanvasNode) };
    if (name === undefined) delete node.label;
    else node.label = name;
    return node;
  }
  if (e.type === "frame") return { id: e.id, type: "group", x: e.x, y: e.y, width: e.width, height: e.height, ...(name !== undefined ? { label: name } : {}) };
  return null;
}

/** An element for a node, partial: the pane restores it. */
/** A card's own paper: what it is drawn on when it has no colour of its
 *  own, and what shows round its corners. */
export const CARD_PAPER = "#f7f1e8";

/** A card's own background colour (ADR 0057, 2026-09-30): JSON Canvas has
 *  no field for it, so it is kept on the node under `verso`, as a
 *  relation is on an edge; none means the card's paper. */
export function cardBackground(node: CanvasNode): string | null {
  const v = isRecord(node["verso"]) ? node["verso"]["background"] : undefined;
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : null;
}

/** How a card's colour fills it, as Excalidraw's panel says it; kept
 *  beside the colour, under `verso`. Solid, the default, is not written. */
export type CardFill = "hachure" | "cross-hatch" | "zigzag" | "solid";
const FILLS: readonly string[] = ["hachure", "cross-hatch", "zigzag", "solid"];
export function cardFill(node: CanvasNode): CardFill | null {
  const v = isRecord(node["verso"]) ? node["verso"]["fill"] : undefined;
  return typeof v === "string" && FILLS.includes(v) && v !== "solid" ? (v as CardFill) : null;
}

/** A flag Verso keeps on a node under `verso` (ADR 0090): `map`, `pin`,
 *  `secret`. Only `true` sets `map` and `pin`; a `secret` that is anything
 *  but `false` or `null` counts, as the core reads it (it fails closed). */
function flag(node: CanvasNode, key: "map" | "pin" | "secret"): boolean {
  const v = isRecord(node["verso"]) ? node["verso"][key] : undefined;
  return key === "secret" ? v !== undefined && v !== false && v !== null : v === true;
}

/** A link card that shows its page, live, in a frame (ADR 0057 point 10,
 *  decided 2026-10-21; ADR 0056): still a JSON Canvas `link` node, with the
 *  flag Verso keeps under its `verso`. Obsidian, which keeps the key, shows
 *  the address as it shows any link. */
export const isPage = (node: CanvasNode): boolean => node.type === "link" && isRecord(node["verso"]) && node["verso"]["page"] === true;

/** The node with its page shown (or taken back to a plain link); `verso`'s
 *  other keys kept. */
export function withPage(node: CanvasNode, on: boolean): CanvasNode {
  const verso = isRecord(node["verso"]) ? { ...node["verso"] } : {};
  put(verso, "page", on ? true : undefined);
  const out: CanvasNode = { ...node };
  put(out, "verso", Object.keys(verso).length > 0 ? verso : undefined);
  return out;
}

/** How a data file's card shows the file (ADR 0057 point 10, ADR 0106): its
 *  text, or its data diagram. Kept on the node under `verso.view`; the text,
 *  the default, is not written, and any other value reads as the text. */
export type CardView = "text" | "diagram";
export function cardView(node: CanvasNode): CardView {
  const v = isRecord(node["verso"]) ? node["verso"]["view"] : undefined;
  return v === "diagram" ? "diagram" : "text";
}

/** The node showing its file as `view`; `verso`'s other keys kept. */
export function withView(node: CanvasNode, view: CardView): CanvasNode {
  const verso = isRecord(node["verso"]) ? { ...node["verso"] } : {};
  put(verso, "view", view === "diagram" ? "diagram" : undefined);
  const out: CanvasNode = { ...node };
  put(out, "verso", Object.keys(verso).length > 0 ? verso : undefined);
  return out;
}

/** A text card shows at most this many characters of its file; past it, an
 *  ellipsis (the diagram reads the whole file, within its own limits). */
export const CARD_TEXT_MAX = 64 * 1024;

/** `text` cut to what a card shows, and whether it was cut. */
export function cardText(text: string): { shown: string; cut: boolean } {
  if (text.length <= CARD_TEXT_MAX) return { shown: text, cut: false };
  // Not in the middle of a surrogate pair.
  let end = CARD_TEXT_MAX;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return { shown: text.slice(0, end), cut: true };
}

/** The origin an address is on, or null when it names no web page. */
export function pageOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** The picture of a map: locked, at the bottom, drawn from tiles when large. */
export const isMap = (node: CanvasNode): boolean => flag(node, "map");
/** A file card that is a pin on a map: drawn at one size at any zoom. */
export const isPin = (node: CanvasNode): boolean => flag(node, "pin");
/** A node a UniVerso does not serve to those who may only read the board. */
export const isSecret = (node: CanvasNode): boolean => flag(node, "secret");

/** The part of a picture a card shows (ADR 0057 point 10, revised on
 *  2026-10-06): fractions of the picture's width and height. */
export type Crop = { x: number; y: number; w: number; h: number };

/** A picture card's crop, kept under its node's `verso`; null when it has
 *  none, or none the board can draw (out of the picture, empty). */
export function cardCrop(node: CanvasNode): Crop | null {
  const v = isRecord(node["verso"]) ? node["verso"]["crop"] : undefined;
  if (!isRecord(v)) return null;
  const [x, y, w, h] = [v["x"], v["y"], v["w"], v["h"]].map((n) => (typeof n === "number" && Number.isFinite(n) ? n : NaN));
  if ([x, y, w, h].some((n) => Number.isNaN(n))) return null;
  if (x! < 0 || y! < 0 || w! <= 0 || h! <= 0 || x! + w! > 1.0001 || y! + h! > 1.0001) return null;
  return { x: x!, y: y!, w: w!, h: h! };
}

/** The node with its crop set — rounded to four places, a crop of the
 *  whole picture written as none — or taken off (null); `verso`'s other
 *  keys kept. */
export function withCrop(node: CanvasNode, crop: Crop | null): CanvasNode {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  const whole = !crop || (crop.x <= 0.0001 && crop.y <= 0.0001 && crop.w >= 0.9999 && crop.h >= 0.9999);
  const verso = isRecord(node["verso"]) ? { ...node["verso"] } : {};
  put(verso, "crop", whole ? undefined : { x: r(crop!.x), y: r(crop!.y), w: r(crop!.w), h: r(crop!.h) });
  const out: CanvasNode = { ...node };
  put(out, "verso", Object.keys(verso).length > 0 ? verso : undefined);
  return out;
}

/** What Excalidraw's panel sets on a card or an edge that JSON Canvas has
 *  no field for (ADR 0057 point 10), kept under the item's own `verso`
 *  key: the key, the element's value when it is not how the board draws
 *  the item by default (undefined: the default, nothing written — a canvas
 *  opened and saved untouched is written as it was read), and how a kept
 *  value goes back on the element, checked. */
type StyleRule = { key: string; read: (e: El) => unknown; apply: (v: unknown, out: Partial<El>) => void };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const LINE_STYLES = ["dashed", "dotted"];
const COMMON_STYLE: StyleRule[] = [
  {
    key: "strokeStyle",
    read: (e) => (typeof e["strokeStyle"] === "string" && LINE_STYLES.includes(e["strokeStyle"]) ? e["strokeStyle"] : undefined),
    apply: (v, out) => void (typeof v === "string" && LINE_STYLES.includes(v) && (out["strokeStyle"] = v)),
  },
  {
    key: "opacity",
    read: (e) => (finite(e["opacity"]) && e["opacity"] !== 100 ? Math.round(e["opacity"]) : undefined),
    apply: (v, out) => void (finite(v) && v >= 0 && v <= 100 && (out["opacity"] = v)),
  },
  {
    key: "locked",
    read: (e) => (e["locked"] === true ? true : undefined),
    apply: (v, out) => void (v === true && (out["locked"] = true)),
  },
  {
    key: "groups",
    read: (e) => (Array.isArray(e["groupIds"]) && e["groupIds"].length > 0 ? [...(e["groupIds"] as string[])] : undefined),
    apply: (v, out) => void (Array.isArray(v) && v.every((g) => typeof g === "string") && (out["groupIds"] = [...v])),
  },
];
/** A card is drawn with round corners, a 1 px clean stroke, unrotated. */
const CARD_STYLE: StyleRule[] = [
  {
    key: "corners",
    read: (e) => ("roundness" in e && e["roundness"] === null ? "sharp" : undefined),
    apply: (v, out) => void (v === "sharp" && (out["roundness"] = null)),
  },
  {
    key: "strokeWidth",
    read: (e) => (finite(e["strokeWidth"]) && e["strokeWidth"] !== 1 ? e["strokeWidth"] : undefined),
    apply: (v, out) => void (finite(v) && v > 0 && v <= 32 && (out["strokeWidth"] = v)),
  },
  {
    key: "roughness",
    read: (e) => (e["roughness"] === 1 || e["roughness"] === 2 ? e["roughness"] : undefined),
    apply: (v, out) => void ((v === 1 || v === 2) && (out["roughness"] = v)),
  },
  {
    key: "angle",
    read: (e) => (finite(e.angle) && e.angle !== 0 ? round4(e.angle) : undefined),
    apply: (v, out) => void (finite(v) && (out.angle = v)),
  },
  ...COMMON_STYLE,
];
/** An edge is drawn straight, 2 px, clean; its bends and its kind of
 *  line are its own. */
const ARROW_HEADS = ["arrow", "bar", "dot", "circle", "circle_outline", "triangle", "triangle_outline", "diamond", "diamond_outline", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many"];
const EDGE_STYLE: StyleRule[] = [
  {
    key: "line",
    read: (e) => (e["elbowed"] === true ? "elbow" : "roundness" in e && e["roundness"] ? "curved" : undefined),
    apply: (v, out) => {
      if (v === "curved") out["roundness"] = { type: 2 };
      else if (v === "elbow") {
        out["elbowed"] = true;
        out["roundness"] = null;
      }
    },
  },
  {
    key: "strokeWidth",
    read: (e) => (finite(e["strokeWidth"]) && e["strokeWidth"] !== 2 ? e["strokeWidth"] : undefined),
    apply: (v, out) => void (finite(v) && v > 0 && v <= 32 && (out["strokeWidth"] = v)),
  },
  {
    key: "roughness",
    read: (e) => (e["roughness"] === 1 || e["roughness"] === 2 ? e["roughness"] : undefined),
    apply: (v, out) => void ((v === 1 || v === 2) && (out["roughness"] = v)),
  },
  {
    key: "startHead",
    read: (e) => (typeof e.startArrowhead === "string" && e.startArrowhead !== "arrow" ? e.startArrowhead : undefined),
    apply: (v, out) => void (typeof v === "string" && ARROW_HEADS.includes(v) && out.startArrowhead && (out.startArrowhead = v)),
  },
  {
    key: "endHead",
    read: (e) => (typeof e.endArrowhead === "string" && e.endArrowhead !== "arrow" ? e.endArrowhead : undefined),
    apply: (v, out) => void (typeof v === "string" && ARROW_HEADS.includes(v) && out.endArrowhead && (out.endArrowhead = v)),
  },
  {
    key: "bends",
    read: (e) =>
      e["elbowed"] !== true && Array.isArray(e.points) && e.points.length > 2
        ? e.points.slice(1, -1).map((p) => [Math.round(p[0] ?? 0), Math.round(p[1] ?? 0)])
        : undefined,
    apply: (v, out) => {
      if (!Array.isArray(v) || !v.every((p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]))) return;
      const pts = out.points ?? [];
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (first && last) out.points = [first, ...(v as [number, number][]), last];
    },
  },
  ...COMMON_STYLE,
];
/** An edge's label, drawn at 16 px in the board's default font. */
const LABEL_STYLE: StyleRule[] = [
  {
    key: "labelSize",
    read: (e) => (finite(e["fontSize"]) && e["fontSize"] !== 16 ? e["fontSize"] : undefined),
    apply: (v, out) => void (finite(v) && v > 0 && v <= 400 && (out["fontSize"] = v)),
  },
  {
    key: "labelFont",
    read: (e) => (finite(e["fontFamily"]) && e["fontFamily"] !== 5 ? e["fontFamily"] : undefined),
    apply: (v, out) => void (finite(v) && (out["fontFamily"] = v)),
  },
];

/** The middle of each side as a point of the box in fractions of its size
 *  (0.5001 for the middle, as Excalidraw itself normalizes it). */
const FIXED_POINT: Record<Side, [number, number]> = { left: [0, 0.5001], right: [1, 0.5001], top: [0.5001, 0], bottom: [0.5001, 1] };

function fraction(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

/** Where an end of an edge meets its card, read from the file (ADR 0057
 *  point 20): the exact point Verso keeps under the edge's `verso`
 *  (`fromPoint`, `toPoint`), else the middle of the side the canvas names,
 *  else the middle of the side facing the other card. An edge's end is
 *  always on the card's outline (`orbit`): an edge passes under the cards. */
export function endPoint(edge: CanvasEdge, end: "from" | "to", self: Box, other: Box): EndPoint {
  const v = isRecord(edge["verso"]) ? edge["verso"] : {};
  const p = v[`${end}Point`];
  if (Array.isArray(p) && p.length === 2) {
    const x = fraction(p[0]);
    const y = fraction(p[1]);
    if (x !== null && y !== null) return { fixedPoint: [x, y], mode: "orbit" };
  }
  const side = end === "from" ? edge.fromSide : edge.toSide;
  return { fixedPoint: FIXED_POINT[side ?? endSide(self, other)], mode: "orbit" };
}

/** The side of a box nearest a point of it, for the canvas's `fromSide`
 *  and `toSide` (what Obsidian draws an edge from). */
export function sideOf(p: readonly [number, number]): Side {
  const d: [Side, number][] = [["left", p[0]], ["right", 1 - p[0]], ["top", p[1]], ["bottom", 1 - p[1]]];
  return d.reduce((best, x) => (x[1] < best[1] ? x : best))[0];
}

/** A point of a box, from its fractions. */
export function pointIn(n: Box, p: readonly [number, number]): [number, number] {
  return [n.x + p[0] * n.width, n.y + p[1] * n.height];
}

/** Where an end bound at `end` on `box` is drawn, with the arrow coming
 *  from `other`, a point of the board: at the point itself when it is
 *  bound inside; else where the way from `other` to the point meets the
 *  box's outline — a card covers what is inside it. */
export function endAt(box: Box, end: EndPoint, other: readonly [number, number]): [number, number] {
  const p = pointIn(box, end.fixedPoint);
  if (end.mode === "inside") return p;
  const dx = p[0] - other[0];
  const dy = p[1] - other[1];
  let enter = 0;
  for (const [o, d, lo, hi] of [[other[0], dx, box.x, box.x + box.width], [other[1], dy, box.y, box.y + box.height]] as const) {
    if (d === 0) {
      if (o < lo || o > hi) return p;
      continue;
    }
    enter = Math.max(enter, Math.min((lo - o) / d, (hi - o) / d));
  }
  // `other` inside the box (cards over each other): the point itself.
  return enter <= 0 || enter > 1 ? p : [other[0] + dx * enter, other[1] + dy * enter];
}

/** The side of `box` a point of the board is nearest to. */
export function sideAt(box: Box, p: readonly [number, number]): Side {
  return sideOf([(p[0] - box.x) / (box.width || 1), (p[1] - box.y) / (box.height || 1)]);
}

const samePoint = (p: readonly [number, number], q: readonly [number, number]): boolean => Math.abs(p[0] - q[0]) < 1e-4 && Math.abs(p[1] - q[1]) < 1e-4;

/** An elbow edge laid out again from its two ends (ADR 0057 point 10):
 *  Excalidraw draws an elbow arrow only along right angles. The route is
 *  the plainest one; Excalidraw routes it its own way once a card moves. */
function elbowRoute(arrow: Partial<El>, from: Side, to: Side, dx: number, dy: number): void {
  const hFrom = from === "left" || from === "right";
  const hTo = to === "left" || to === "right";
  const raw: [number, number][] = hFrom && hTo
    ? [[0, 0], [dx / 2, 0], [dx / 2, dy], [dx, dy]]
    : !hFrom && !hTo
      ? [[0, 0], [0, dy / 2], [dx, dy / 2], [dx, dy]]
      : hFrom
        ? [[0, 0], [dx, 0], [dx, dy]]
        : [[0, 0], [0, dy], [dx, dy]];
  const points = raw.filter((p, i) => i === 0 || p[0] !== raw[i - 1]![0] || p[1] !== raw[i - 1]![1]);
  arrow.points = points.length > 1 ? points : [[0, 0], [dx, dy]];
  arrow["fixedSegments"] = null;
  arrow["startIsSpecial"] = null;
  arrow["endIsSpecial"] = null;
}

/** What `rules` read from `e`, as `verso` keys. */
function styleOf(e: El, rules: StyleRule[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rules) {
    const v = r.read(e);
    if (v !== undefined) out[r.key] = v;
  }
  return out;
}

/** Put back on `out` what an item's `verso` keeps for `rules`. */
function applyStyle(verso: unknown, rules: StyleRule[], out: Partial<El>): void {
  if (!isRecord(verso)) return;
  for (const r of rules) if (r.key in verso) r.apply(verso[r.key], out);
}

/** `item.verso` with `style` laid over the keys `rules` own (other keys,
 *  such as a relation or a colour, kept), or nothing changed when the file
 *  already says the same. */
function keepStyle(item: Record<string, unknown>, style: Record<string, unknown>, rules: StyleRule[]): void {
  const was = isRecord(item["verso"]) ? (item["verso"] as Record<string, unknown>) : {};
  const same = rules.every((r) => JSON.stringify(was[r.key]) === JSON.stringify(style[r.key]));
  if (same) return;
  const verso = { ...was };
  for (const r of rules) put(verso, r.key, style[r.key]);
  put(item, "verso", Object.keys(verso).length > 0 ? verso : undefined);
}

export function nodeElement(node: CanvasNode): Partial<El> {
  const base = {
    id: node.id,
    x: num(node.x),
    y: num(node.y),
    width: Math.max(1, num(node.width, 250)),
    height: Math.max(1, num(node.height, 60)),
    customData: { canvas: node },
  };
  if (node.type === "group") {
    return { ...base, type: "frame", name: typeof node.label === "string" ? node.label : null, strokeColor: hexOf(node.color, NODE_STROKE) };
  }
  const card: Partial<El> = {
    ...base,
    type: "embeddable",
    link: MARKER,
    strokeColor: hexOf(node.color, NODE_STROKE),
    // Solid, so the whole card takes the pointer (Excalidraw hits a
    // transparent shape on its outline only); the card drawn over it hides
    // it, and the canvas file never holds it.
    // Its own colour, or the paper's: what shows round a card's corners
    // matches the card.
    backgroundColor: cardBackground(node) ?? CARD_PAPER,
    fillStyle: cardFill(node) ?? "solid",
    strokeWidth: 1,
    roughness: 0,
    roundness: { type: 3 },
  };
  applyStyle(node["verso"], CARD_STYLE, card);
  // A pin is drawn by Verso at one size on screen (`PinLayer`); Excalidraw's
  // box for it stays, for the pin's place and selection, and shows nothing.
  if (isPin(node)) {
    card.strokeColor = "transparent";
    card.backgroundColor = "transparent";
  }
  return card;
}

/** A new node's canvas data, at a point: a card the board makes. */
export function newNode(kind: "file" | "text" | "link", value: string, at: [number, number], id: string, page = false): CanvasNode {
  const size: Record<string, [number, number]> = { file: [400, 400], text: [250, 60], link: page ? [480, 360] : [400, 120] };
  const [width, height] = size[kind] ?? [250, 60];
  const node: CanvasNode = { id, type: kind, x: Math.round(at[0] - width / 2), y: Math.round(at[1] - height / 2), width, height };
  if (kind === "file") node.file = value;
  else if (kind === "text") node.text = value;
  else node.url = value;
  return page && kind === "link" ? withPage(node, true) : node;
}

/** A Markdown text card the board adds by hand (the toolbar's button, a
 *  double click on an empty spot): wider than the sticky 250x60 of `newNode`,
 *  centred on the point. */
export function textCardAt(text: string, at: [number, number], id: string): CanvasNode {
  const node = newNode("text", text, at, id);
  node.width = 340;
  node.height = 110;
  node.x = Math.round(at[0] - node.width / 2);
  node.y = Math.round(at[1] - node.height / 2);
  return node;
}

/** Whether a tap follows the one before it closely enough, in time (ms) and
 *  in place (px), to make a double tap — Excalidraw's own touch count is
 *  read from its touches, so the board counts the taps it hears first. */
export function isDoubleTap(prev: { at: number; x: number; y: number } | null, at: number, x: number, y: number): boolean {
  return prev !== null && at - prev.at >= 0 && at - prev.at < 400 && Math.hypot(x - prev.x, y - prev.y) < 30;
}

/** The elements of a canvas, partial, bottom first: the edges and their
 *  labels, the nodes in the file's order, then the drawing. An edge runs
 *  between two cards and passes under them, so a card's text stays
 *  readable; what is drawn keeps its own order, above. A node inside a
 *  group's box goes in that group's frame (the innermost one), as moving a
 *  group moves what is in it on Obsidian's canvas. */
export function toElements(doc: CanvasDoc): Partial<El>[] {
  const nodes = (Array.isArray(doc.nodes) ? doc.nodes : []).filter((n): n is CanvasNode => isRecord(n) && typeof n.id === "string" && typeof n.type === "string");
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const groups = nodes.filter((n) => n.type === "group");
  const inside = (n: CanvasNode, g: CanvasNode): boolean =>
    n !== g && n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height;
  const out: Partial<El>[] = [];
  const cards: Partial<El>[] = [];
  const bound = new Map<string, { id: string; type: string }[]>();
  const edges = (Array.isArray(doc.edges) ? doc.edges : []).filter(
    (e): e is CanvasEdge => isRecord(e) && typeof e.id === "string" && byId.has(e.fromNode) && byId.has(e.toNode),
  );
  for (const e of edges) {
    for (const end of [e.fromNode, e.toNode]) bound.set(end, [...(bound.get(end) ?? []), { id: e.id, type: "arrow" }]);
  }
  // An arrow of the drawing with an end on a card (a shape to a picture) is
  // the card's too: Excalidraw moves a bound arrow with the element only
  // when the element lists it, and a card read from the file lists only
  // its edges — the arrow stayed behind when the card moved.
  const drawn = isRecord(doc.verso) && Array.isArray(doc.verso.drawing) ? doc.verso.drawing : [];
  for (const d of drawn) {
    if (!isRecord(d) || typeof d["id"] !== "string" || (d["type"] !== "arrow" && d["type"] !== "line") || d["isDeleted"] === true) continue;
    for (const b of [d["startBinding"], d["endBinding"]]) {
      const id = isRecord(b) && typeof b["elementId"] === "string" ? b["elementId"] : null;
      if (id && byId.has(id) && !(bound.get(id) ?? []).some((x) => x.id === d["id"])) bound.set(id, [...(bound.get(id) ?? []), { id: d["id"] as string, type: "arrow" }]);
    }
  }
  for (const n of nodes) {
    const el = nodeElement(n);
    const home = groups.filter((g) => inside(n, g)).sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (home && n.type !== "group") el.frameId = home.id;
    const arrows = bound.get(n.id);
    if (arrows) el.boundElements = arrows;
    cards.push(el);
  }
  for (const e of edges) {
    const from = byId.get(e.fromNode);
    const to = byId.get(e.toNode);
    if (!from || !to) continue;
    // Each end bound at its point of the card (ADR 0057 point 20): the
    // arrow is drawn from it, and Excalidraw keeps it there as cards move.
    const fromEnd = endPoint(e, "from", from, to);
    const toEnd = endPoint(e, "to", to, from);
    const a = endAt(from, fromEnd, pointIn(to, toEnd.fixedPoint));
    const b = endAt(to, toEnd, pointIn(from, fromEnd.fixedPoint));
    const labelId = `${e.id}-label`;
    const label = typeof e.label === "string" && e.label !== "" ? e.label : null;
    const arrow: Partial<El> = {
      type: "arrow",
      id: e.id,
      x: a[0],
      y: a[1],
      width: Math.abs(b[0] - a[0]),
      height: Math.abs(b[1] - a[1]),
      points: [
        [0, 0],
        [b[0] - a[0], b[1] - a[1]],
      ],
      startBinding: { elementId: e.fromNode, ...fromEnd },
      endBinding: { elementId: e.toNode, ...toEnd },
      startArrowhead: e.fromEnd === "arrow" ? "arrow" : null,
      endArrowhead: e.toEnd === "none" ? null : "arrow",
      strokeColor: hexOf(e.color, EDGE_STROKE),
      roughness: 0,
      boundElements: label ? [{ id: labelId, type: "text" }] : null,
      // The ends as read, so that a save tells an end the user moved from
      // one left where the file put it.
      customData: { canvas: e, ends: { from: fromEnd, to: toEnd } },
    };
    applyStyle(e["verso"], EDGE_STYLE, arrow);
    if (arrow["elbowed"] === true) elbowRoute(arrow, sideAt(from, a), sideAt(to, b), b[0] - a[0], b[1] - a[1]);
    out.push(arrow);
    if (label) {
      const text: Partial<El> = {
        type: "text",
        id: labelId,
        x: (a[0] + b[0]) / 2,
        y: (a[1] + b[1]) / 2,
        width: 10,
        height: 10,
        text: label,
        originalText: label,
        containerId: e.id,
        textAlign: "center",
        verticalAlign: "middle",
        fontSize: 16,
        strokeColor: hexOf(e.color, EDGE_STROKE),
      };
      applyStyle(e["verso"], LABEL_STYLE, text);
      out.push(text);
    }
  }
  // The drawing over the cards, but a drawn element the file keeps under a
  // card (`under`, ADR 0057 point 10) goes just under that card, in its
  // order among the others there.
  const drawing = isRecord(doc.verso) && Array.isArray(doc.verso.drawing) ? doc.verso.drawing : [];
  const below = new Map<string, Partial<El>[]>();
  const above: Partial<El>[] = [];
  const cardIds = new Set(cards.map((c) => c.id));
  for (const d of drawing) {
    if (!isRecord(d) || typeof d["id"] !== "string" || typeof d["type"] !== "string") continue;
    const { [UNDER]: under, ...el } = d;
    if (typeof under === "string" && cardIds.has(under)) below.set(under, [...(below.get(under) ?? []), el as Partial<El>]);
    else above.push(el as Partial<El>);
  }
  for (const c of cards) out.push(...(below.get(c.id ?? "") ?? []), c);
  out.push(...above);
  return out;
}

/** The key of a drawn element, in the file, that names the card it lies
 *  under; none: over every card. */
const UNDER = "under";

/** The label an arrow's bound text gives it, if any. */
function labelOf(arrow: El, byId: Map<string, El>): string | undefined {
  for (const b of arrow.boundElements ?? []) {
    const t = byId.get(b.id);
    if (b.type === "text" && t && !t.isDeleted && typeof t.text === "string" && t.text !== "") return t.originalText ?? t.text;
  }
  return undefined;
}

/** Set `key` on `obj` to `value`, or drop it when undefined, keeping the
 *  key's place when it was there. */
function put(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) delete obj[key];
  else obj[key] = value;
}

/** The board's own background colour (ADR 0057, 2026-09-30), kept under
 *  `verso`; none means the app's paper. */
export function backgroundOf(doc: CanvasDoc): string | null {
  const b = isRecord(doc.verso) ? doc.verso["background"] : undefined;
  return typeof b === "string" && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(b) && b !== "transparent" ? b : null;
}

/** The canvas the board shows, laid over `doc` (its other top-level keys
 *  and `verso`'s other keys kept): nodes in the board's stacking order,
 *  edges, the drawing, and the board's background (`null`: none). */
export function fromElements(elements: readonly El[], doc: CanvasDoc, background: string | null = backgroundOf(doc)): CanvasDoc {
  const live = elements.filter((e) => !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id, e] as const));
  const nodeIds = new Set(live.filter(isNode).map((e) => e.id));
  const nodes: CanvasNode[] = [];
  for (const e of live) {
    if (!isNode(e)) continue;
    const data = nodeData(e);
    if (!data) continue;
    const node: CanvasNode = { ...data };
    node.id = e.id;
    // What the user moved or resized is written in whole numbers; what is
    // where the file put it keeps the file's value, a fraction included
    // (decided on 2026-10-01, review `board.md` §6 item 5).
    const drawn = nodeElement(data);
    for (const k of ["x", "y", "width", "height"] as const) if (e[k] !== drawn[k]) node[k] = Math.round(e[k]);
    const fallback = NODE_STROKE;
    const was = hexOf(data.color, fallback).toLowerCase();
    if (!isPin(data) && (e.strokeColor ?? fallback).toLowerCase() !== was) put(node, "color", colorOf(e.strokeColor, fallback));
    if (e.type === "frame") put(node, "label", typeof e.name === "string" && e.name !== "" ? e.name : undefined);
    if (e.type === "embeddable") {
      const bg = typeof e.backgroundColor === "string" ? e.backgroundColor.toLowerCase() : "";
      const own = /^#[0-9a-f]{3,8}$/.test(bg) && bg !== CARD_PAPER ? bg : undefined;
      const fs = typeof e.fillStyle === "string" ? e.fillStyle : "solid";
      const fill = FILLS.includes(fs) && fs !== "solid" ? fs : undefined;
      if (own !== (cardBackground(data) ?? undefined)?.toLowerCase() || fill !== (cardFill(data) ?? undefined)) {
        const verso = isRecord(node["verso"]) ? { ...node["verso"] } : {};
        put(verso, "background", own);
        put(verso, "fill", fill);
        put(node, "verso", Object.keys(verso).length > 0 ? verso : undefined);
      }
      keepStyle(node, styleOf(e, CARD_STYLE), CARD_STYLE);
    }
    nodes.push(node);
  }
  const edges: CanvasEdge[] = [];
  const edgeIds = new Set<string>();
  const labels = new Set<string>();
  for (const e of live) {
    if (e.type !== "arrow") continue;
    const from = e.startBinding?.elementId;
    const to = e.endBinding?.elementId;
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    const fromEl = byId.get(from);
    const toEl = byId.get(to);
    if (!fromEl || !toEl) continue;
    const data = isRecord(e.customData?.canvas) ? (e.customData?.canvas as CanvasEdge) : ({ id: e.id } as CanvasEdge);
    const edge: CanvasEdge = { ...data, id: e.id, fromNode: from, toNode: to };
    // An end left where the file put it keeps the file's words: moving a
    // card does not turn the edge round, and an edge with no side gains
    // none. An end attached anew, or moved on its card, takes the side the
    // arrow meets, for Obsidian, and its point under `verso` when it is not
    // that side's middle (ADR 0057 point 20).
    const pts = e.points ?? [];
    const first = pts[0] ?? [0, 0];
    const last = pts[pts.length - 1] ?? [0, 0];
    const drawnAt = { from: [e.x + first[0], e.y + first[1]] as const, to: [e.x + last[0], e.y + last[1]] as const };
    const boxOf = { from: fromEl, to: toEl };
    const read = isRecord(e.customData?.["ends"]) ? (e.customData["ends"] as Record<string, EndPoint | undefined>) : {};
    const verso = isRecord(edge["verso"]) ? { ...edge["verso"] } : {};
    let moved = false;
    for (const [end, binding, node] of [["from", e.startBinding, data.fromNode], ["to", e.endBinding, data.toNode]] as const) {
      // The point alone tells an end moved: the board binds an edge's ends
      // on the outline whatever Excalidraw bound them with (`orbitOnCards`).
      const at = binding?.fixedPoint;
      const was = read[end];
      if (!at || (node === binding.elementId && was && samePoint(was.fixedPoint, at))) continue;
      const side = sideAt(boxOf[end], drawnAt[end]);
      edge[end === "from" ? "fromSide" : "toSide"] = side;
      const exact = !samePoint(at, FIXED_POINT[side]);
      put(verso, `${end}Point`, exact ? [Math.round(at[0] * 1e4) / 1e4, Math.round(at[1] * 1e4) / 1e4] : undefined);
      moved = true;
    }
    if (moved) put(edge, "verso", Object.keys(verso).length > 0 ? verso : undefined);
    put(edge, "fromEnd", e.startArrowhead ? "arrow" : data.fromEnd !== undefined ? "none" : undefined);
    put(edge, "toEnd", e.endArrowhead ? (data.toEnd !== undefined ? "arrow" : undefined) : "none");
    const wasColor = hexOf(data.color, EDGE_STROKE).toLowerCase();
    if ((e.strokeColor ?? EDGE_STROKE).toLowerCase() !== wasColor) put(edge, "color", colorOf(e.strokeColor, EDGE_STROKE));
    const label = labelOf(e, byId);
    if (!(label === undefined && data.label === "")) put(edge, "label", label);
    const style = styleOf(e, EDGE_STYLE);
    const labelEl = (e.boundElements ?? []).map((b) => (b.type === "text" ? byId.get(b.id) : undefined)).find((t) => t && !t.isDeleted);
    if (labelEl) Object.assign(style, styleOf(labelEl, LABEL_STYLE));
    keepStyle(edge, style, [...EDGE_STYLE, ...LABEL_STYLE]);
    for (const b of e.boundElements ?? []) if (b.type === "text") labels.add(b.id);
    edges.push(edge);
    edgeIds.add(e.id);
  }
  // A drawn element's place among the cards: the first card above it in
  // the board's order, kept as `under` (none: over every card).
  const drawing: unknown[] = [];
  const cardAbove = new Map<string, string>();
  let next: string | undefined;
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i]!;
    if (nodeIds.has(e.id)) next = e.id;
    else if (next !== undefined) cardAbove.set(e.id, next);
  }
  for (const e of live) {
    if (nodeIds.has(e.id) || edgeIds.has(e.id) || labels.has(e.id)) continue;
    const under = cardAbove.get(e.id);
    drawing.push(steady(under === undefined ? e : { ...e, [UNDER]: under }));
  }
  const out: CanvasDoc = { ...doc };
  // What the board could not draw — an entry with no id or type, an edge
  // whose end names no node — goes back where it was, untouched.
  const readNodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const drawable = new Set(readNodes.filter((n) => isRecord(n) && typeof n.id === "string" && typeof n.type === "string").map((n) => n.id));
  out.nodes = keepUndrawn(readNodes, (n) => isRecord(n) && typeof n["id"] === "string" && typeof n["type"] === "string", nodes) as CanvasNode[];
  const readEdges = Array.isArray(doc.edges) ? doc.edges : [];
  const keptEdges = keepUndrawn(readEdges, (e) => isRecord(e) && typeof e["id"] === "string" && drawable.has(e["fromNode"] as string) && drawable.has(e["toNode"] as string), edges) as CanvasEdge[];
  // A key the file did not have comes only when there is something to put
  // in it: opening a canvas and saving it unchanged writes nothing new.
  if (keptEdges.length > 0 || "edges" in doc) out.edges = keptEdges;
  const bg = background && background !== "transparent" ? background : null;
  if (drawing.length > 0 || isRecord(doc.verso) || bg) {
    const verso = isRecord(doc.verso) ? { ...doc.verso } : {};
    verso.version = BOARD_VERSION;
    const readDrawing = isRecord(doc.verso) && Array.isArray(doc.verso.drawing) ? doc.verso.drawing : [];
    verso.drawing = keepUndrawn(readDrawing, (d) => isRecord(d) && typeof d["id"] === "string" && typeof d["type"] === "string", drawing);
    put(verso, "background", bg ?? undefined);
    out.verso = verso;
  }
  return out;
}

/** A drawn element as the file writes it: its own keys in the order it has
 *  them, and every object inside it — a `boundElements` entry, a binding,
 *  a roundness, its custom data — with its keys in one order, by name
 *  (`{"id","type"}`). Equal elements then write equal bytes, however each
 *  was put together: Excalidraw makes a binding `{type, id}` where a file
 *  read back gives `{id, type}`, and a board edited together could
 *  otherwise write the file anew with no one's change in it (seen in the
 *  three-window e2e, 2026-10-13: the windows' file and the disk's differed
 *  only there). An element's own order is the one it came with — the
 *  file's, or Excalidraw's — so a board opened and saved unchanged writes
 *  its drawing as it was (invariant 7). */
function steady(e: El): El {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) out[k] = sorted(v);
  return out as El;
}

/** `v` with the keys of every object in it in order, by name; arrays keep
 *  their order. */
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (!isRecord(v)) return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v).sort()) out[k] = sorted(v[k]);
  return out;
}

/** `rebuilt` with each entry of `read` the board did not draw put back at
 *  its place in the file's list. */
function keepUndrawn(read: readonly unknown[], drew: (x: Record<string, unknown>) => boolean, rebuilt: readonly unknown[]): unknown[] {
  const out = [...rebuilt];
  read.forEach((x, i) => {
    if (isRecord(x) && drew(x)) return;
    out.splice(Math.min(i, out.length), 0, x);
  });
  return out;
}

/** The path the folder lists for a node's `file`, found as the index
 *  finds a name (spec Q7, provisional fact): after NFC on both sides. A
 *  canvas writes names in NFC, and a disk keeps what it was given — a
 *  folder that came through a zip or a sync holds them in NFD — so the
 *  same name in two forms is one file. `undefined` when none is listed. */
export function listedPath(path: string, lists: readonly (readonly string[])[]): string | undefined {
  for (const list of lists) if (list.includes(path)) return path;
  const key = path.normalize("NFC");
  for (const list of lists) {
    const hit = list.find((p) => p.normalize("NFC") === key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** What a node's card shows as its name. */
export function nodeName(n: CanvasNode, strings: { textCard: string; linkCard: string; untitledGroup: string }): string {
  if (n.type === "file" && typeof n.file === "string") return (n.file.split("/").pop() ?? n.file).replace(/\.md$/, "");
  if (n.type === "text" && typeof n.text === "string") {
    // The first line with words, read as a reader reads it: no heading
    // marks, no emphasis marks.
    const line = n.text.split("\n").find((l) => l.trim() !== "") ?? "";
    const plain = line.replace(/^\s*#{1,6}\s+/, "").replace(/[*_`]/g, "").trim();
    return plain.slice(0, 80) || strings.textCard;
  }
  if (n.type === "link" && typeof n.url === "string") return n.url;
  if (n.type === "group") return typeof n.label === "string" && n.label !== "" ? n.label : strings.untitledGroup;
  return n.id;
}

export type OutlineItem = { id: string; label: string; node?: CanvasNode };
export type Outline = {
  groups: { group: OutlineItem; items: OutlineItem[] }[];
  loose: OutlineItem[];
  edges: OutlineItem[];
  annotations: OutlineItem[];
};

/** The board as a list (ADR 0057 point 7): groups with their nodes, nodes
 *  in no group, edges as "A → B (label)", and the drawing's free texts —
 *  in the board's reading order, top to bottom, then left to right. */
export function outlineOf(
  elements: readonly El[],
  strings: { textCard: string; linkCard: string; untitledGroup: string; edge: (a: string, b: string, l: string) => string },
): Outline {
  const live = elements.filter((e) => !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id, e] as const));
  const reading = (a: El, b: El): number => a.y - b.y || a.x - b.x;
  const item = (e: El): OutlineItem => {
    const n = nodeData(e);
    return { id: e.id, label: n ? nodeName(n, strings) : e.id, node: n ?? undefined };
  };
  const frames = live.filter((e) => e.type === "frame").sort(reading);
  // A pin is listed with its map (`MapsPanel`), not among the cards.
  const cards = live.filter((e) => e.type === "embeddable" && isNode(e) && !isPin(nodeData(e) ?? ({} as CanvasNode))).sort(reading);
  const groups = frames.map((f) => ({ group: item(f), items: cards.filter((c) => c.frameId === f.id).map(item) }));
  const loose = cards.filter((c) => !c.frameId || !byId.has(c.frameId)).map(item);
  const nodeIds = new Set(live.filter(isNode).map((e) => e.id));
  const edges: OutlineItem[] = [];
  const labels = new Set<string>();
  for (const a of live.filter((e) => e.type === "arrow").sort(reading)) {
    const from = a.startBinding?.elementId;
    const to = a.endBinding?.elementId;
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    const fromEl = byId.get(from);
    const toEl = byId.get(to);
    if (!fromEl || !toEl) continue;
    for (const b of a.boundElements ?? []) if (b.type === "text") labels.add(b.id);
    edges.push({ id: a.id, label: strings.edge(item(fromEl).label, item(toEl).label, labelOf(a, byId) ?? "") });
  }
  const annotations = live
    .filter((e) => e.type === "text" && typeof e.text === "string" && e.text.trim() !== "" && !labels.has(e.id))
    .sort(reading)
    .map((e) => ({ id: e.id, label: e.text ?? "" }));
  return { groups, loose, edges, annotations };
}

/** The note two canvas file nodes name, when both are notes: what an
 *  arrow between them can be promoted to (ADR 0057 point 4). */
export function relationEnds(arrow: El, elements: readonly El[]): { from: string; to: string } | null {
  if (arrow.type !== "arrow") return null;
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const note = (id: string | undefined): string | null => {
    const e = id ? byId.get(id) : undefined;
    const n = e ? nodeData(e) : null;
    return n && n.type === "file" && typeof n.file === "string" && n.file.endsWith(".md") ? n.file : null;
  };
  const from = note(arrow.startBinding?.elementId);
  const to = note(arrow.endBinding?.elementId);
  return from && to ? { from, to } : null;
}
