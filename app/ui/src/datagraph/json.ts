// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// JSON, JSONC and JSON Lines read into the diagram's tree (ADR 0106 item
// 5): a scanner of our own, so that each value keeps its place in the text
// and a number keeps its source text (`12345678901234567890` is shown as
// written). One loop with a stack of frames, never recursion: a document
// nested a hundred thousand levels deep is read like any other.

import { Builder, closeBox, type DNode, type Format, ParseFailure, type Row, type Tree } from "./model";

type Frame = { node: DNode; array: boolean; row: Row | null; count: number };

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** What the scanner allows beyond strict JSON. */
type Dialect = { comments: boolean; trailing: boolean };

class Scanner {
  pos: number;
  constructor(
    readonly text: string,
    readonly end: number,
    readonly dialect: Dialect,
    start = 0,
  ) {
    this.pos = start;
  }

  /** Past blanks and, in JSONC, comments. */
  skip(): void {
    const s = this.text;
    for (;;) {
      const c = s.charCodeAt(this.pos);
      if (c === 32 || c === 10 || c === 13 || c === 9 || c === 0xfeff) this.pos++;
      else if (c === 47 && this.dialect.comments) {
        const n = s.charCodeAt(this.pos + 1);
        if (n === 47) {
          const eol = s.indexOf("\n", this.pos);
          this.pos = eol < 0 || eol > this.end ? this.end : eol + 1;
        } else if (n === 42) {
          const close = s.indexOf("*/", this.pos + 2);
          if (close < 0 || close >= this.end) throw new ParseFailure("A comment is never closed", this.pos, this.end);
          this.pos = close + 2;
        } else return;
      } else return;
      if (this.pos >= this.end) return;
    }
  }

  /** A string at `pos` (a quote): its value; leaves `pos` after the closing quote. */
  string(): string {
    const s = this.text;
    const start = this.pos;
    let i = start + 1;
    let escaped = false;
    for (;;) {
      if (i >= this.end) throw new ParseFailure("A string is never closed", start, this.end);
      const c = s.charCodeAt(i);
      if (c === 34) break;
      if (c === 92) {
        escaped = true;
        i += 2;
        continue;
      }
      if (c === 10) throw new ParseFailure("A string runs past the end of its line", start, i);
      i++;
    }
    this.pos = i + 1;
    const raw = s.slice(start, i + 1);
    if (!escaped) return raw.slice(1, -1);
    try {
      return JSON.parse(raw) as string;
    } catch {
      throw new ParseFailure("A string has a bad escape", start, i + 1);
    }
  }

  /** A bare word (a number, true, false, null): its text. */
  word(): string {
    const s = this.text;
    const start = this.pos;
    let i = start;
    while (i < this.end) {
      const c = s.charCodeAt(i);
      // , ] } : whitespace and a comment's slash end it.
      if (c === 44 || c === 93 || c === 125 || c === 58 || c === 32 || c === 10 || c === 13 || c === 9 || c === 47) break;
      i++;
    }
    this.pos = i;
    return s.slice(start, i);
  }
}

/** One document from `start` to `end`: its root box id. Throws ParseFailure; what was read stays in `b`. */
function document(sc: Scanner, b: Builder, rootLabel: string): number {
  const stack: Frame[] = [];
  let root = -1;
  let expectValue = true;
  const text = sc.text;

  const top = (): Frame | undefined => stack[stack.length - 1];
  const addScalar = (target: DNode, key: string, keyFrom: number, value: string, from: number, to: number, kind: "string" | "bare"): void => {
    let type: Row["type"] = "string";
    if (kind === "bare") {
      if (value === "true" || value === "false") type = "boolean";
      else if (value === "null") type = "null";
      else if (NUMBER.test(value)) type = "number";
      else throw new ParseFailure(`Unexpected "${value.slice(0, 20)}"`, from, to);
    }
    b.row(target, { key, text: value, type, from, to, keyFrom });
  };
  const pop = (): void => {
    const f = stack.pop()!;
    sc.pos++;
    closeBox(f.node, f.row, sc.pos);
  };

  sc.skip();
  while (true) {
    sc.skip();
    if (sc.pos >= sc.end && !(stack.length === 0 && !expectValue)) {
      throw new ParseFailure(stack.length > 0 ? "The text ends before the value is closed" : "There is no value", Math.max(0, sc.end - 1), sc.end);
    }
    const f = top();
    if (expectValue) {
      let key = "";
      let keyFrom = sc.pos;
      if (f) {
        const close = f.array ? 93 : 125;
        if (text.charCodeAt(sc.pos) === close) {
          if (f.count > 0 && !sc.dialect.trailing) throw new ParseFailure("A comma with nothing after it", sc.pos - 1, sc.pos);
          pop();
          expectValue = false;
          continue;
        }
        if (f.array) key = String(f.count);
        else {
          if (text.charCodeAt(sc.pos) !== 34) throw new ParseFailure("A key must be a string in quotes", sc.pos, sc.pos + 1);
          keyFrom = sc.pos;
          key = sc.string();
          sc.skip();
          if (text.charCodeAt(sc.pos) !== 58) throw new ParseFailure('A ":" is missing after the key', sc.pos, sc.pos + 1);
          sc.pos++;
          sc.skip();
          if (sc.pos >= sc.end) throw new ParseFailure("A key has no value", keyFrom, sc.end);
        }
        f.count++;
      }
      const c = text.charCodeAt(sc.pos);
      const from = sc.pos;
      if (c === 123 || c === 91) {
        const array = c === 91;
        const row = f ? b.containerRow(f.node, key, keyFrom, from, array) : null;
        const node = b.node(f ? f.node.id : -1, f ? key : rootLabel, array ? "array" : "object", from);
        if (root < 0) root = node.id;
        stack.push({ node, array, row, count: 0 });
        sc.pos++;
        sc.skip();
        expectValue = true;
        // An empty one closes at once (the check at the top of the next turn).
        continue;
      }
      if (c === 34) {
        const v = sc.string();
        if (f) addScalar(f.node, key, keyFrom, v, from, sc.pos, "string");
        else root = rootScalar(b, rootLabel, v, "string", from, sc.pos);
      } else {
        const v = sc.word();
        if (v === "") throw new ParseFailure("A value is expected here", from, from + 1);
        if (f) addScalar(f.node, key, keyFrom, v, from, sc.pos, "bare");
        else {
          if (!(v === "true" || v === "false" || v === "null" || NUMBER.test(v))) throw new ParseFailure(`Unexpected "${v.slice(0, 20)}"`, from, sc.pos);
          root = rootScalar(b, rootLabel, v, v === "true" || v === "false" ? "boolean" : v === "null" ? "null" : "number", from, sc.pos);
        }
      }
      expectValue = false;
    } else {
      if (!f) break;
      const c = text.charCodeAt(sc.pos);
      if (c === 44) {
        sc.pos++;
        expectValue = true;
      } else if (c === (f.array ? 93 : 125)) {
        pop();
      } else throw new ParseFailure(f.array ? 'A "," or "]" is expected' : 'A "," or "}" is expected', sc.pos, sc.pos + 1);
    }
  }
  sc.skip();
  if (sc.pos < sc.end) throw new ParseFailure("There is more text after the value", sc.pos, sc.end);
  return root;
}

/** A document that is a single value: a box with that one row. */
function rootScalar(b: Builder, label: string, text: string, type: Row["type"], from: number, to: number): number {
  const n = b.node(-1, label, "object", from);
  n.to = to;
  b.row(n, { key: "", text, type, from, to });
  return n.id;
}

/** JSON, or JSONC with comments and trailing commas allowed. */
export function parseJson(text: string, format: Format = "json"): Tree {
  const b = new Builder(format);
  const sc = new Scanner(text, text.length, { comments: format === "jsonc", trailing: format === "jsonc" });
  try {
    document(sc, b, "");
    return b.done(null);
  } catch (e) {
    if (e instanceof ParseFailure) return b.done({ message: e.message, from: e.at, to: e.end });
    throw e;
  }
}

/** JSON Lines: each non-blank line a root; a bad line is an error row, not the end. */
export function parseJsonLines(text: string): Tree {
  const b = new Builder("jsonl");
  let start = 0;
  let line = 0;
  while (start <= text.length) {
    let eol = text.indexOf("\n", start);
    if (eol < 0) eol = text.length;
    let end = eol;
    if (end > start && text.charCodeAt(end - 1) === 13) end--;
    line++;
    if (text.slice(start, end).trim() !== "") {
      const sc = new Scanner(text, end, { comments: false, trailing: false }, start);
      const before = b.nodes.length;
      try {
        document(sc, b, String(line));
      } catch (e) {
        if (!(e instanceof ParseFailure)) throw e;
        // The partial box this line began is dropped; an error row stands in its place.
        if (b.nodes.length > before) {
          b.nodes.length = before;
          b.roots.length = b.roots.filter((r) => r < before).length;
        }
        const n = b.node(-1, String(line), "object", start);
        n.to = end;
        b.row(n, { key: "error", text: e.message, type: "error", from: Math.max(start, e.at), to: Math.min(end, Math.max(e.end, e.at + 1)), keyFrom: start });
      }
    }
    start = eol + 1;
  }
  // A line that does not parse is shown as a row; the tree itself is not in error.
  return b.done(null);
}
