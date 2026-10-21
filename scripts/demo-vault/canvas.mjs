// A board of the demo vault, built in code and written as Verso writes a
// `.canvas` (crates/verso-core/src/canvas.rs, `layout`): a container that
// holds only scalars on one line, any other one entry per line, tabs, no
// final newline. Opening a board written so, and saving it untouched,
// writes nothing new.
//
// What is read on a board is drawn text — Excalidraw's own, legible at the
// zoom a whole group is seen at (a text card's Markdown is too small
// there) — and the notes are live cards. Text is given a first box from a
// rough width per character; the board measures it again with its font.

export const HAND = 5; // Excalifont
export const SANS = 6; // Nunito
export const MONO = 3; // Cascadia
// Excalidraw's line height for each font (its FONT_METADATA), and a rough
// width of a character in ems.
const LINE = { [HAND]: 1.25, [SANS]: 1.35, [MONO]: 1.2 };
const EM = { [HAND]: 0.55, [SANS]: 0.52, [MONO]: 0.6 };

export const INK = "#1e1e1e";
export const BODY = "#343a40";
export const GREY = "#868e96";
export const RED = "#e03131";
export const ORANGE = "#e8590c";
export const AMBER = "#e67700";
export const BLUE = "#1971c2";
export const GREEN = "#2f9e44";
export const VIOLET = "#6741d9";
export const PINK = "#c2255c";
export const TEAL = "#0c8599";

const isScalar = (v) => v === null || typeof v !== "object";
const quote = (s) => {
  // JSON has no undefined and no NaN: one here is a bug of a board's module.
  if (s === undefined || (typeof s === "number" && !Number.isFinite(s))) throw new Error(`not JSON: ${s}`);
  return JSON.stringify(s);
};

/** `value` laid out as Verso writes a canvas. */
export function layout(value, depth = 0) {
  const tab = (n) => "\t".repeat(n);
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return `[${value.map((v) => layout(v, depth + 1)).join(",")}]`;
    return `[\n${value.map((v) => tab(depth + 1) + layout(v, depth + 1)).join(",\n")}\n${tab(depth)}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.every(([, v]) => isScalar(v))) return `{${entries.map(([k, v]) => `${quote(k)}:${layout(v, depth + 1)}`).join(",")}}`;
    return `{\n${entries.map(([k, v]) => `${tab(depth + 1)}${quote(k)}:${layout(v, depth + 1)}`).join(",\n")}\n${tab(depth)}}`;
  }
  return quote(value);
}

const num = (n) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);
/** Characters as a reader counts them (an emoji is one). */
const len = (s) => Array.from(s).length;

/** How many lines `text` takes at `width`: a first guess, before the board
 *  lays the text out with its font. */
function linesOf(text, size, font, width) {
  const per = Math.max(1, Math.floor(width / (size * EM[font])));
  let n = 0;
  for (const para of text.split("\n")) {
    n += 1;
    let cur = 0;
    for (const word of para.split(" ")) {
      if (cur && cur + 1 + len(word) > per) {
        n += 1;
        cur = len(word);
      } else cur += (cur ? 1 : 0) + len(word);
    }
  }
  return n;
}

export class Board {
  /** `tr` says a text in the language of the vault being built, `name` a
   *  file's path (scripts/demo-vault/translate.mjs); the Portuguese vault
   *  is the sources' own words, so both are the identity there. */
  constructor(tr = (s) => s, name = (p) => p) {
    this.tr = tr;
    this.name = name;
    this.nodes = [];
    this.edges = [];
    this.drawing = [];
  }

  group(id, x, y, width, height, label, color) {
    this.nodes.push({ id, type: "group", x, y, width, height, label: this.tr(label), ...(color ? { color } : {}) });
  }

  file(id, file, x, y, width, height, color, subpath) {
    this.nodes.push({ id, type: "file", file: this.name(file), x, y, width, height, ...(color ? { color } : {}), ...(subpath ? { subpath: this.tr(subpath) } : {}) });
  }

  text(id, text, x, y, width, height, color) {
    this.nodes.push({ id, type: "text", text: this.tr(text), x, y, width, height, ...(color ? { color } : {}) });
  }

  link(id, url, x, y, width, height, color) {
    this.nodes.push({ id, type: "link", url, x, y, width, height, ...(color ? { color } : {}) });
  }

  /** A link node that shows its page (ADR 0057 point 10): the flag Verso keeps under `verso`. */
  page(id, url, x, y, width, height) {
    this.nodes.push({ id, type: "link", url, x, y, width, height, verso: { page: true } });
  }

  edge(id, fromNode, fromSide, toNode, toSide, label, color, extra) {
    this.edges.push({ id, fromNode, fromSide, toNode, toSide, ...(color ? { color } : {}), ...(label ? { label: this.tr(label) } : {}), ...(extra ?? {}) });
  }

  element(type, id, x, y, w, h, o) {
    const e = {
      id,
      type,
      x: num(x),
      y: num(y),
      width: num(w),
      height: num(h),
      strokeColor: o.stroke,
      backgroundColor: o.bg ?? "transparent",
      fillStyle: o.fill ?? "solid",
      strokeWidth: o.sw ?? 2,
      strokeStyle: o.style ?? "solid",
      roughness: o.rough ?? 1,
      opacity: o.opacity ?? 100,
    };
    if (o.roundness !== undefined && o.roundness !== null) e.roundness = o.roundness;
    if (o.frame) e.frameId = o.frame;
    this.drawing.push(e);
    return e;
  }

  /** A rectangle, ellipse or diamond; with `label`, text bound inside it. */
  shape(type, id, x, y, w, h, o = {}) {
    if (o.label !== undefined) o = { ...o, label: this.tr(o.label) };
    const rounded = o.rounded ?? true;
    const roundness = rounded ? (type === "rectangle" ? { type: 3 } : { type: 2 }) : null;
    const e = this.element(type, id, x, y, w, h, { stroke: INK, ...o, roundness });
    if (o.label !== undefined) {
      const tid = `${id}-t`;
      e.boundElements = [{ id: tid, type: "text" }];
      const font = o.font ?? HAND;
      const size = o.size ?? 20;
      const tw = w - 30;
      const th = linesOf(o.label, size, font, tw) * size * LINE[font];
      const t = this.element("text", tid, x + 15, y + (h - th) / 2, tw, th, { stroke: o.color ?? o.stroke ?? INK, rough: o.rough, frame: o.frame });
      Object.assign(t, {
        text: o.label,
        originalText: o.label,
        fontSize: size,
        fontFamily: font,
        textAlign: o.align ?? "center",
        verticalAlign: "middle",
        containerId: id,
        lineHeight: LINE[font],
      });
    }
    return e;
  }

  /** Drawn text: as written, or with `width` laid out by the board at that
   *  width. */
  write(id, x, y, text, o = {}) {
    text = this.tr(text);
    const font = o.font ?? HAND;
    const size = o.size ?? 20;
    let w;
    let h;
    if (o.width) {
      w = o.width;
      h = linesOf(text, size, font, o.width) * size * LINE[font];
    } else {
      const lines = text.split("\n");
      w = Math.max(...lines.map(len)) * size * EM[font];
      h = lines.length * size * LINE[font];
    }
    const e = this.element("text", id, x, y, w, h, { stroke: o.color ?? INK, frame: o.frame });
    Object.assign(e, { text, originalText: text, fontSize: size, fontFamily: font, textAlign: "left", verticalAlign: "top", lineHeight: LINE[font] });
    if (o.width) e.autoResize = false;
    return e;
  }

  /** A line or an arrow through `points`, relative to `x`, `y`. */
  path(type, id, x, y, points, o = {}) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const curved = o.curved ?? true;
    const e = this.element(type, id, x, y, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
      stroke: INK,
      ...o,
      roundness: curved ? { type: 2 } : null,
    });
    e.points = points.map(([a, b]) => [num(a), num(b)]);
    if (type === "arrow") {
      e.startArrowhead = o.start ?? null;
      e.endArrowhead = o.head === undefined ? "arrow" : o.head;
    }
    return e;
  }

  /** A yellow sticky note with text. */
  sticky(id, x, y, w, h, text, o = {}) {
    return this.shape("rectangle", id, x, y, w, h, { stroke: "#f08c00", bg: "#ffec99", sw: 1, label: text, size: o.size ?? 24, color: INK, frame: o.frame });
  }

  /** A key cap, for a shortcut. */
  keycap(id, x, y, label, o = {}) {
    return this.shape("rectangle", id, x, y, o.w ?? 84, 72, { stroke: "#495057", bg: "#f1f3f5", rough: 0, label, size: 28, color: INK, frame: o.frame });
  }

  /** The `.canvas` text. */
  toString() {
    return layout({ nodes: this.nodes, edges: this.edges, verso: { version: 1, drawing: this.drawing } });
  }
}
