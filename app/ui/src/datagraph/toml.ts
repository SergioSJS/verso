// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// TOML read into the diagram's tree (ADR 0106 item 5), by a parser of our
// own: no TOML library is in the window, and what the diagram needs is the
// shape and where each value sits, not the checking a validator does. Tables
// (`[a.b]`), arrays of tables (`[[a]]`), dotted keys, inline tables, arrays,
// strings of all four kinds, numbers as written and dates are read. It is
// lenient where a validator is strict (a key defined twice is drawn twice);
// a dotted key inside an inline table is one key. Values nest through a
// stack, not recursion.

import { Builder, type DNode, ParseFailure, type Row, type Tree } from "./model";

const NUMBER = /^[+-]?(?:inf|nan|0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|(?:0|[1-9][0-9_]*)(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?|\.\d+)$/;
const DATETIME = /^\d{4}-\d\d-\d\d(?:[Tt ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:[Zz]|[+-]\d\d:\d\d)?)?/;
const TIME = /^\d\d:\d\d(?::\d\d(?:\.\d+)?)?/;
const BARE = /[A-Za-z0-9_-]/;

type Part = { name: string; from: number };

class Reader {
  pos = 0;
  readonly b = new Builder("toml");
  /** The child box of a box by its label, so a table is found again by its name. */
  private readonly byLabel = new Map<number, Map<string, number>>();
  constructor(readonly text: string) {}

  private ch(i = this.pos): string {
    return this.text[i] ?? "";
  }

  /** Blanks on the line (spaces, tabs). */
  private blanks(): void {
    while (this.ch() === " " || this.ch() === "\t") this.pos++;
  }

  /** Blanks, newlines and comments: between statements and inside arrays. */
  private space(): void {
    for (;;) {
      const c = this.ch();
      if (c === " " || c === "\t" || c === "\n" || c === "\r") this.pos++;
      else if (c === "#") {
        const eol = this.text.indexOf("\n", this.pos);
        this.pos = eol < 0 ? this.text.length : eol;
      } else return;
    }
  }

  private fail(message: string, at = this.pos, end = at + 1): never {
    throw new ParseFailure(message, at, end);
  }

  /** A key's parts: `a.b."c d"`. */
  private key(): Part[] {
    const parts: Part[] = [];
    for (;;) {
      this.blanks();
      const from = this.pos;
      const c = this.ch();
      if (c === '"' || c === "'") parts.push({ name: this.quoted(false), from });
      else {
        let i = this.pos;
        while (BARE.test(this.ch(i))) i++;
        if (i === this.pos) this.fail("A key is expected here");
        parts.push({ name: this.text.slice(this.pos, i), from });
        this.pos = i;
      }
      this.blanks();
      if (this.ch() === ".") this.pos++;
      else return parts;
    }
  }

  /** A string at `pos`, any of the four kinds; the value. `multi` allows the triple quotes. */
  private quoted(multi: boolean): string {
    const s = this.text;
    const q = this.ch();
    const start = this.pos;
    const triple = multi && s.startsWith(q + q + q, this.pos);
    if (triple) {
      const close = s.indexOf(q + q + q, this.pos + 3);
      if (close < 0) this.fail("A string is never closed", start, s.length);
      let end = close;
      // Up to two more quotes at the end belong to the string.
      while (s[end + 3] === q && end - close < 2) end++;
      this.pos = end + 3;
      let body = s.slice(start + 3, end);
      if (body.startsWith("\r\n")) body = body.slice(2);
      else if (body.startsWith("\n")) body = body.slice(1);
      return q === "'" ? body : this.unescape(body, start);
    }
    let i = this.pos + 1;
    for (;;) {
      const c = s[i];
      if (c === undefined || c === "\n") this.fail("A string is never closed", start, i);
      if (c === q) break;
      if (c === "\\" && q === '"') i++;
      i++;
    }
    this.pos = i + 1;
    const body = s.slice(start + 1, i);
    return q === "'" ? body : this.unescape(body, start);
  }

  private unescape(body: string, at: number): string {
    if (!body.includes("\\")) return body;
    let out = "";
    for (let i = 0; i < body.length; i++) {
      const c = body[i]!;
      if (c !== "\\") {
        out += c;
        continue;
      }
      const n = body[++i];
      switch (n) {
        case "b": out += "\b"; break;
        case "t": out += "\t"; break;
        case "n": out += "\n"; break;
        case "f": out += "\f"; break;
        case "r": out += "\r"; break;
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "u":
        case "U": {
          const len = n === "u" ? 4 : 8;
          const code = Number.parseInt(body.slice(i + 1, i + 1 + len), 16);
          if (!Number.isFinite(code) || code > 0x10ffff) this.fail("A bad \\u escape in a string", at);
          out += String.fromCodePoint(code);
          i += len;
          break;
        }
        case "\n":
        case "\r":
        case " ":
        case "\t": {
          // A line-ending backslash trims the blanks that follow.
          while (/\s/.test(body[i + 1] ?? "x")) i++;
          break;
        }
        default: out += n ?? "";
      }
    }
    return out;
  }

  /** The child box of `parent` named `label`, made when it is not there yet. */
  private child(parent: DNode, label: string, keyFrom: number, array: boolean, from: number): DNode {
    let map = this.byLabel.get(parent.id);
    if (!map) this.byLabel.set(parent.id, (map = new Map()));
    const known = map.get(label);
    if (known !== undefined) return this.b.nodes[known]!;
    this.b.containerRow(parent, label, keyFrom, from, array);
    const n = this.b.node(parent.id, label, array ? "array" : "object", from);
    map.set(label, n.id);
    return n;
  }

  /** The table a header or dotted key names, walking (and making) its parts. An array of tables is entered at its last element. */
  private enter(from: DNode, parts: Part[], count: number, at: number): DNode {
    let at2 = from;
    for (let i = 0; i < count; i++) {
      const p = parts[i]!;
      let next = this.child(at2, p.name, p.from, false, at);
      if (next.shape === "array") {
        const last = next.kids[next.kids.length - 1];
        if (last === undefined) this.fail(`"${p.name}" is an empty array`, p.from);
        next = this.b.nodes[last]!;
      }
      at2 = next;
    }
    return at2;
  }

  /** One value, with its nested arrays and inline tables, into `target` under `key`. */
  private value(target: DNode, key: string, keyFrom: number): void {
    type Frame = { node: DNode; array: boolean; row: Row; count: number };
    const stack: Frame[] = [];
    const place = (into: DNode, k: string, kf: number, inside = true): void => {
      // Inside a container the value may sit on a later line; a top-level one starts on its own.
      if (inside) this.space();
      else this.blanks();
      const from = this.pos;
      const c = this.ch();
      if (c === "[" || c === "{") {
        const array = c === "[";
        const row = this.b.containerRow(into, k, kf, from, array);
        const node = this.b.node(into.id, k, array ? "array" : "object", from);
        stack.push({ node, array, row, count: 0 });
        this.pos++;
        return;
      }
      if (c === "") this.fail("A value is expected here", from, from);
      const v = this.scalar();
      this.b.row(into, { key: k, text: v.text, type: v.type, from, to: this.pos, keyFrom: kf });
    };
    place(target, key, keyFrom, false);
    while (stack.length > 0) {
      const f = stack[stack.length - 1]!;
      this.space();
      const close = f.array ? "]" : "}";
      if (this.ch() === close) {
        this.pos++;
        f.node.to = this.pos;
        f.row.to = this.pos;
        f.row.text = f.array ? `[${f.node.rows.length}]` : `{${f.node.rows.length}}`;
        stack.pop();
        // After a value: a comma, or the close of the container below.
        const up = stack[stack.length - 1];
        if (up) this.afterValue(up);
        continue;
      }
      if (f.count > 0) this.fail(f.array ? 'A "," or "]" is expected' : 'A "," or "}" is expected');
      this.entry(f, place);
    }
  }

  private afterValue(f: { array: boolean; count: number }): void {
    this.space();
    if (this.ch() === ",") {
      this.pos++;
      f.count = 0;
    } else if (this.ch() !== (f.array ? "]" : "}")) this.fail(f.array ? 'A "," or "]" is expected' : 'A "," or "}" is expected');
  }

  /** The next member of a container: an array's value, or an inline table's `key = value`. */
  private entry(f: { node: DNode; array: boolean; count: number }, place: (into: DNode, k: string, kf: number, inside?: boolean) => void): void {
    let key = String(f.node.rows.length);
    let keyFrom = this.pos;
    if (!f.array) {
      const parts = this.key();
      key = parts.map((p) => p.name).join(".");
      keyFrom = parts[0]!.from;
      this.blanks();
      if (this.ch() !== "=") this.fail('A "=" is expected after the key');
      this.pos++;
    }
    f.count = 1;
    const before = this.b.nodes.length;
    place(f.node, key, keyFrom);
    // A scalar member is done; a container member makes its own frame, which closes into this one.
    if (this.b.nodes.length === before) this.afterValue(f);
  }

  /** A scalar at `pos`: its text and type. */
  private scalar(): { text: string; type: Row["type"] } {
    const c = this.ch();
    if (c === '"' || c === "'") return { text: this.quoted(true), type: "string" };
    const rest = this.text.slice(this.pos, this.pos + 40);
    const dt = DATETIME.exec(rest);
    if (dt && /^\d{4}-/.test(rest)) {
      this.pos += dt[0].length;
      return { text: dt[0], type: "other" };
    }
    const tm = TIME.exec(rest);
    if (tm) {
      this.pos += tm[0].length;
      return { text: tm[0], type: "other" };
    }
    let i = this.pos;
    while (i < this.text.length && !/[\s,\]}#]/.test(this.text[i]!)) i++;
    const word = this.text.slice(this.pos, i);
    this.pos = i;
    if (word === "true" || word === "false") return { text: word, type: "boolean" };
    if (NUMBER.test(word)) return { text: word, type: "number" };
    return this.fail(`Unexpected "${word.slice(0, 20)}"`, this.pos - word.length, this.pos);
  }

  read(): Tree {
    const root = this.b.node(-1, "", "object", 0);
    let table = root;
    try {
      for (;;) {
        this.space();
        if (this.pos >= this.text.length) break;
        const from = this.pos;
        if (this.ch() === "[") {
          const array = this.ch(this.pos + 1) === "[";
          this.pos += array ? 2 : 1;
          const parts = this.key();
          this.blanks();
          const close = array ? "]]" : "]";
          if (!this.text.startsWith(close, this.pos)) this.fail(`A "${close}" is expected`);
          this.pos += close.length;
          const parent = this.enter(root, parts, parts.length - 1, from);
          const last = parts[parts.length - 1]!;
          if (array) {
            const list = this.child(parent, last.name, last.from, true, from);
            const index = list.rows.length;
            this.b.containerRow(list, String(index), from, from, false);
            table = this.b.node(list.id, String(index), "object", from);
          } else table = this.child(parent, last.name, last.from, false, from);
        } else {
          const parts = this.key();
          this.blanks();
          if (this.ch() !== "=") this.fail('A "=" is expected after the key');
          this.pos++;
          const into = this.enter(table, parts, parts.length - 1, from);
          const last = parts[parts.length - 1]!;
          this.value(into, last.name, last.from);
        }
        this.blanks();
        if (this.ch() === "#") this.space();
        else if (this.ch() !== "" && this.ch() !== "\n" && this.ch() !== "\r") this.fail("Something follows the value on its line");
      }
      return this.finish(null);
    } catch (e) {
      if (e instanceof ParseFailure) return this.finish({ message: e.message, from: e.at, to: e.end });
      throw e;
    }
  }

  /** Boxes end where their last member ends; a container row says how many it holds. */
  private finish(error: { message: string; from: number; to: number } | null): Tree {
    const nodes = this.b.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]!;
      const last = n.rows[n.rows.length - 1];
      if (last && last.to > n.to) n.to = last.to;
      if (n.parent >= 0) {
        const p = nodes[n.parent]!;
        if (n.to > p.to) p.to = n.to;
        const row = p.rows[n.row];
        if (row) {
          row.to = n.to;
          row.text = n.shape === "array" ? `[${n.rows.length}]` : `{${n.rows.length}}`;
        }
      }
    }
    return this.b.done(error);
  }
}

/** TOML into a tree. */
export function parseToml(text: string): Tree {
  return new Reader(text).read();
}
