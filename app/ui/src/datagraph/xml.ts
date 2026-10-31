// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// XML read into the diagram's tree (ADR 0106 item 5), by a scanner of our
// own: an element is a box, an attribute a row prefixed `@`, the text a
// `#text` row, and an element holding only text is one row of its parent's.
// It never resolves an external entity or a DTD, and never expands an
// entity: a DOCTYPE is skipped unread, the five predefined entities and
// numeric references are decoded, and any other `&name;` stays as the
// letters it was written in, so a file of nested entities ("billion
// laughs") draws as itself. Positions are exact. Elements nest through a
// stack, not recursion.

import { Builder, type DNode, ParseFailure, type Row, type Tree } from "./model";

const NAMED = new Map<string, string>([["lt", "<"], ["gt", ">"], ["amp", "&"], ["quot", '"'], ["apos", "'"]]);

/** Character data with the predefined entities and numeric references decoded; any other reference is left as written. */
export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][\w.-]{0,40});/g, (whole, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1] === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    }
    return NAMED.get(name) ?? whole;
  });
}

type Frame = { node: DNode; row: Row | null; tag: string; counts: Map<string, number>; text: string[]; textFrom: number; textTo: number };

const NAME = /[^\s/>=<"'!?]+/y;

export function parseXml(text: string): Tree {
  const b = new Builder("xml");
  const stack: Frame[] = [];
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let rootDone = false;

  const fail = (message: string, at: number, end = at + 1): never => {
    throw new ParseFailure(message, at, end);
  };

  /** Closes the element on top of the stack, ended at `end`. */
  const close = (end: number): void => {
    const f = stack.pop()!;
    const joined = f.text.join(" ").trim();
    if (joined !== "") b.row(f.node, { key: "#text", text: joined, type: "string", from: f.textFrom, to: f.textTo });
    f.node.to = end;
    const parent = stack[stack.length - 1];
    const only = f.node.rows.length <= 1 && f.node.rows.every((r) => r.key === "#text") && f.node.id === b.nodes.length - 1;
    if (parent && f.row && only) {
      // An element of text alone is one row of its parent's.
      b.nodes.pop();
      parent.node.kids.pop();
      const r = f.row;
      r.child = -1;
      r.text = joined;
      r.type = joined === "" ? "null" : "string";
      r.from = f.node.from;
      r.to = end;
      return;
    }
    if (f.row) {
      f.row.to = end;
      f.row.text = `{${f.node.rows.length}}`;
    }
  };

  const finish = (error: { message: string; from: number; to: number } | null): Tree => b.done(error);

  try {
    while (pos < text.length) {
      const lt = text.indexOf("<", pos);
      const chunk = text.slice(pos, lt < 0 ? text.length : lt);
      if (chunk.trim() !== "") {
        const top = stack[stack.length - 1];
        if (!top) fail("Text outside the root element", pos, pos + chunk.length);
        else {
          if (top.text.length === 0) top.textFrom = pos + chunk.length - chunk.trimStart().length;
          top.text.push(decodeEntities(chunk.trim()));
          top.textTo = pos + chunk.trimEnd().length;
        }
      }
      if (lt < 0) break;
      pos = lt;
      if (text.startsWith("<!--", pos)) {
        const end = text.indexOf("-->", pos + 4);
        if (end < 0) fail("A comment is never closed", pos, text.length);
        pos = end + 3;
      } else if (text.startsWith("<![CDATA[", pos)) {
        const end = text.indexOf("]]>", pos + 9);
        const top = stack[stack.length - 1];
        if (end < 0) fail("A CDATA section is never closed", pos, text.length);
        if (!top) fail("Text outside the root element", pos);
        else {
          if (top.text.length === 0) top.textFrom = pos;
          top.text.push(text.slice(pos + 9, end).trim());
          top.textTo = end + 3;
        }
        pos = end + 3;
      } else if (text.startsWith("<?", pos)) {
        const end = text.indexOf("?>", pos + 2);
        if (end < 0) fail("A processing instruction is never closed", pos, text.length);
        pos = end + 2;
      } else if (text.startsWith("<!", pos)) {
        // A DOCTYPE (or any declaration): skipped whole, including an internal subset in [ ], never read.
        let depth = 0;
        let i = pos + 2;
        let quote = "";
        for (; i < text.length; i++) {
          const c = text[i]!;
          if (quote) {
            if (c === quote) quote = "";
          } else if (c === '"' || c === "'") quote = c;
          else if (c === "[") depth++;
          else if (c === "]") depth--;
          else if (c === ">" && depth <= 0) break;
        }
        if (i >= text.length) fail("A declaration is never closed", pos, text.length);
        pos = i + 1;
      } else if (text.startsWith("</", pos)) {
        const end = text.indexOf(">", pos);
        if (end < 0) fail("A closing tag is never closed", pos, text.length);
        const name = text.slice(pos + 2, end).trim();
        const top = stack[stack.length - 1];
        if (!top) fail(`Unexpected closing tag </${name}>`, pos, end + 1);
        else if (top.tag !== name) fail(`</${name}> closes <${top.tag}>`, pos, end + 1);
        close(end + 1);
        pos = end + 1;
      } else {
        const start = pos;
        NAME.lastIndex = pos + 1;
        const nm = NAME.exec(text);
        if (!nm) fail("A tag has no name", pos);
        const tag = nm![0];
        pos = NAME.lastIndex;
        const parent = stack[stack.length - 1];
        if (!parent && rootDone) fail("There is more than one root element", start, start + 1 + tag.length);
        let label = tag;
        if (parent) {
          const n = parent.counts.get(tag) ?? 0;
          parent.counts.set(tag, n + 1);
          if (n > 0) label = `${tag}[${n}]`;
        }
        const row = parent ? b.containerRow(parent.node, tag, start, start, false) : null;
        const node = b.node(parent ? parent.node.id : -1, label, "element", start);
        const frame: Frame = { node, row, tag, counts: new Map(), text: [], textFrom: start, textTo: start };
        // Attributes.
        let selfClosed = false;
        for (;;) {
          while (pos < text.length && /\s/.test(text[pos]!)) pos++;
          if (pos >= text.length) fail(`The tag <${tag}> is never closed`, start, text.length);
          if (text[pos] === ">") {
            pos++;
            break;
          }
          if (text.startsWith("/>", pos)) {
            pos += 2;
            selfClosed = true;
            break;
          }
          NAME.lastIndex = pos;
          const an = NAME.exec(text);
          if (!an) fail("An attribute is expected here", pos);
          const aname = an![0];
          const aFrom = pos;
          pos = NAME.lastIndex;
          while (pos < text.length && /\s/.test(text[pos]!)) pos++;
          if (text[pos] !== "=") fail(`The attribute ${aname} has no value`, aFrom, pos);
          pos++;
          while (pos < text.length && /\s/.test(text[pos]!)) pos++;
          const q = text[pos];
          if (q !== '"' && q !== "'") fail(`The value of ${aname} must be in quotes`, pos);
          const vEnd = text.indexOf(q!, pos + 1);
          if (vEnd < 0) fail("An attribute value is never closed", pos, text.length);
          b.row(node, { key: `@${aname}`, text: decodeEntities(text.slice(pos + 1, vEnd)), type: "string", from: pos, to: vEnd + 1, keyFrom: aFrom });
          pos = vEnd + 1;
        }
        stack.push(frame);
        if (selfClosed) close(pos);
        if (stack.length === 0) rootDone = true;
      }
    }
    if (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      // What was read stays: the open elements are closed where the text ended.
      throw new ParseFailure(`<${top.tag}> is never closed`, top.node.from, top.node.from + top.tag.length + 1);
    }
    if (b.nodes.length === 0) throw new ParseFailure("There is no element", 0, Math.min(1, text.length));
    return finish(null);
  } catch (e) {
    if (e instanceof ParseFailure) {
      while (stack.length > 0) close(text.length);
      return finish({ message: e.message, from: e.at, to: e.end });
    }
    throw e;
  }
}
