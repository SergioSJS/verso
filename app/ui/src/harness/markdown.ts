// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The browser harness's Markdown (ADR 0058): a note as the core hands it to
// the window — its HTML, its properties, its headings and blocks. The real
// renderer is the core's (verso-dialect, Rust); this one is an
// approximation, enough for the window to draw a note, follow its links and
// embed what it embeds. What the reading view draws is tested in the core,
// not here.

import YAML from "yaml";
import type { Block, Heading, Property, PropertyValue } from "../bindings";

/** The frontmatter's text and where the body starts (line index). */
export function frontmatterOf(text: string): { yaml: string | null; body: string; bodyLine: number } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { yaml: null, body: text, bodyLine: 0 };
  return { yaml: m[1] ?? "", body: text.slice(m[0].length), bodyLine: m[0].split("\n").length - 1 };
}

/** The frontmatter as plain values (`{}` when none, or not a mapping). */
export function propertiesOf(text: string): Record<string, unknown> {
  const { yaml } = frontmatterOf(text);
  if (yaml === null) return {};
  try {
    const v: unknown = YAML.parse(yaml);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The frontmatter as the properties panel shows it. */
export function propertyList(text: string): Property[] {
  return Object.entries(propertiesOf(text)).map(([key, v]): Property => ({ key, value: propertyValue(v) }));
}

function propertyValue(v: unknown): PropertyValue {
  if (v === null || v === undefined) return { kind: "empty" };
  if (typeof v === "boolean") return { kind: "checkbox", value: v };
  if (typeof v === "number") return { kind: "number", value: String(v) };
  if (typeof v === "string") return { kind: "text", value: v };
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return { kind: "list", value: v };
  return { kind: "nested", value: JSON.stringify(v) };
}

/** The lines of a text with fenced code blanked out, so that what is
 *  written there — a link given as an example — is not read. Columns and
 *  line numbers stay where they were. */
export function readableLines(text: string): string[] {
  const lines = text.split("\n");
  let fence: string | null = null;
  return lines.map((line) => {
    // A fence behind quote marks or a list marker is a fence too.
    const m = /^\s*(```+|~~~+)/.exec(line.replace(/^(\s*>)+\s?/, "").replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
    if (fence !== null) {
      if (m && m[1]?.startsWith(fence[0] ?? "")) fence = null;
      return " ".repeat(line.length);
    }
    if (m) {
      fence = m[1] ?? "```";
      return " ".repeat(line.length);
    }
    // Code spans and comments: blanked, the line's length kept.
    return line.replace(/(`+)[^`]*?\1/g, (s) => " ".repeat(s.length)).replace(/%%.*?%%/g, (s) => " ".repeat(s.length));
  });
}

/** The headings of a note, outside code. */
export function headingsOf(text: string): Heading[] {
  const out: Heading[] = [];
  readableLines(text).forEach((line, i) => {
    const m = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (m) out.push({ level: (m[1] ?? "#").length, text: m[2] ?? "", line: i + 1, col: 1 });
  });
  return out;
}

/** The `^id` blocks of a note, as the core's parser names them (spec Q3,
 *  Q4, Q21; Obsidian observed 2026-10-07), by lines: inside a quote at the
 *  top level, the quote whole; inside a list, the innermost item whole,
 *  its nested items with it; at the top level, the block the id ends, or,
 *  for a `^id` alone on its line, the block before it — nothing before
 *  it, no block. Fenced and indented code is never scanned for an id, nor
 *  is the frontmatter. */
export function blocksOf(text: string): Block[] {
  // The raw lines keep the fences' content, which `readableLines` blanks;
  // the readable ones are where an id is looked for.
  const raw = text.split("\n");
  const lines = readableLines(text);
  const indent = (s: string) => s.length - s.trimStart().length;
  const isItem = (s: string) => /^\s*([-*+]|\d+[.)])\s+/.test(s);
  const quoted = (s: string) => /^\s*>/.test(s);
  const isHeading = (s: string) => /^\s{0,3}#{1,6}\s/.test(s);
  // A fence marker, behind quote marks or a list marker or neither.
  const fenceOf = (s: string) => /^\s*(`{3,}|~{3,})/.exec(s.replace(/^(\s*>)+\s?/, "").replace(/^\s*([-*+]|\d+[.)])\s+/, ""))?.[1] ?? null;
  // The frontmatter: `---` on the first line to the next `---` line.
  let body = 0;
  if (raw[0] === "---") {
    const close = raw.findIndex((l, i) => i > 0 && /^---\s*$/.test(l));
    body = close > 0 ? close + 1 : 0;
  }
  // The top-level quote around line `i`: every quoted line touching it,
  // and a plain text line right after one (a lazy continuation).
  const quoteRun = (i: number): [number, number] => {
    let s = i;
    let e = i;
    while (s > body && quoted(raw[s - 1] ?? "")) s--;
    while (e + 1 < raw.length && (quoted(raw[e + 1] ?? "") || lazy(e + 1))) e++;
    return [s, e];
  };
  const lazy = (i: number): boolean => {
    const l = raw[i] ?? "";
    return l.trim() !== "" && !quoted(l) && !isItem(l) && !isHeading(l) && !fenceOf(l) && quoted(raw[i - 1] ?? "");
  };
  // The item whose line `i` is: the item line itself, or the nearest item
  // line above indented less, across blank lines, as long as no line
  // indented no more than this one ends the list first.
  const itemOf = (i: number): number => {
    if (isItem(raw[i] ?? "") && !quoted(raw[i] ?? "")) return i;
    const own = indent(raw[i] ?? "");
    for (let j = i - 1; j >= body; j--) {
      const l = raw[j] ?? "";
      if (l.trim() === "") continue;
      if (indent(l) < own) return isItem(l) && !quoted(l) ? j : -1;
    }
    return -1;
  };
  // The item's last line: every line indented deeper than its own, across
  // blank lines, up to the first that is not.
  const itemEnd = (i: number): number => {
    const own = indent(raw[i] ?? "");
    let last = i;
    for (let j = i + 1; j < raw.length; j++) {
      const l = raw[j] ?? "";
      if (l.trim() === "") continue;
      if (indent(l) <= own) break;
      last = j;
    }
    return last;
  };
  // The container's lines around line `i`, or null at the top level: an
  // item first (a quote inside an item is the item's), then a quote.
  const container = (i: number): [number, number] | null => {
    const item = itemOf(i);
    if (item >= 0) return [item, itemEnd(item)];
    if (quoted(raw[i] ?? "")) return quoteRun(i);
    return null;
  };
  // Top-level blocks as runs of lines, split at blank lines; a fence and a
  // heading are runs of their own, a quote keeps its lazy continuation.
  const runs: [number, number][] = [];
  let start = -1;
  let fence: string | null = null;
  const close = (i: number) => {
    if (start >= 0) runs.push([start, i]);
    start = -1;
  };
  for (let i = body; i < raw.length; i++) {
    const line = raw[i] ?? "";
    const f = fenceOf(line);
    if (fence) {
      if (f && f[0] === fence[0] && f.length >= fence.length) {
        fence = null;
        close(i);
      }
      continue;
    }
    if (f) {
      close(i - 1);
      fence = f;
      start = i;
      continue;
    }
    if (line.trim() === "") {
      close(i - 1);
      continue;
    }
    if (isHeading(line)) {
      close(i - 1);
      runs.push([i, i]);
      continue;
    }
    if (start < 0) start = i;
    else if (quoted(raw[start] ?? "") !== quoted(line) && !lazy(i)) {
      close(i - 1);
      start = i;
    }
  }
  close(raw.length - 1);
  const out: Block[] = [];
  runs.forEach(([a, z], k) => {
    const first = raw[a] ?? "";
    const text = first.replace(/^(\s*>)+\s?/, "").trim();
    const alone = a === z && (lines[a] ?? "").trim() !== "" ? /^\^([A-Za-z0-9-]+)$/.exec(text) : null;
    if (alone) {
      // The block before it: the run before that is not itself a `^id`
      // alone; nothing before it, no block.
      let named = container(a);
      if (!named) {
        for (let j = k - 1; j >= 0; j--) {
          const [pa, pz] = runs[j] ?? [0, 0];
          const prev = (raw[pa] ?? "").replace(/^(\s*>)+\s?/, "").trim();
          const prevAlone = pa === pz && /^\^[A-Za-z0-9-]+$/.test(prev) && !out.some((b) => b.line === pa + 1 && b.first_line === pa + 1);
          if (!prevAlone) {
            named = [pa, pz];
            break;
          }
          // A `^id` alone that named nothing is nothing for the next one.
          if (!out.some((b) => b.line === pa + 1)) break;
        }
      }
      if (named) {
        // Two alone in a row naming one block: only the last counts, as in
        // Obsidian (decided 2026-10-09).
        const prev = out[out.length - 1];
        if (prev && prev.first_line === named[0] + 1 && prev.last_line === named[1] + 1 && prev.line > named[1] + 1 && prev.line < a + 1) out.pop();
        out.push({ id: alone[1] ?? "", line: a + 1, col: first.indexOf("^") + 1, first_line: named[0] + 1, last_line: named[1] + 1 });
      }
      return;
    }
    if (fenceOf(first) && !isItem(first)) return;
    for (let i = a; i <= z; i++) {
      const line = raw[i] ?? "";
      // Indented code outside a list is never scanned.
      if (indent(line) >= 4 && itemOf(i) < 0 && !quoted(line)) continue;
      const m = /\s\^([A-Za-z0-9-]+)\s*$/.exec(lines[i] ?? "");
      if (!m || m.index === undefined) continue;
      // A paragraph's id is its last word: a lazy continuation after it
      // makes another word the last.
      if (i < z && !isItem(line.replace(/^(\s*>)+\s?/, "")) && itemOf(i) < 0 && !isHeading(line)) continue;
      const named = container(i) ?? (isHeading(line) ? [i, i] : [a, z]);
      out.push({ id: m[1] ?? "", line: i + 1, col: m.index + 2, first_line: named[0] + 1, last_line: named[1] + 1 });
    }
  });
  return out;
}

/** An address as the core's renderer writes it (pulldown-cmark's
 *  `escape_href`): what is not safe in a URL percent-encoded, as UTF-8 —
 *  `gráfico` is `gr%C3%A1fico`, a space `%20` — and `%` left alone. */
function escapeHref(src: string): string {
  return src.replace(/[^A-Za-z0-9\-_.!~*'();/?:@&=+$,#%]/gu, (c) => encodeURIComponent(c));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A line's inline marks. A code span's content is text, as the core
 *  renders it: an image written in one is not an image. */
function formatInline(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, i) => (i % 2 === 1 ? `<code>${escapeHtml(part.slice(1, -1))}</code>` : formatMarks(part)))
    .join("");
}

function formatMarks(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\$([^$]+)\$/g, '<span class="math">$1</span>');
  // As the core writes it: the target, and the text after `|` (a size, an
  // alias) or else the target again.
  s = s.replace(/!\[\[(.*?)\]\]/g, (_, inner: string) => {
    const [to = "", label] = inner.split("|");
    return `<span class="embed" data-target="${to.trim()}">${(label ?? to).trim()}</span>`;
  });
  s = s.replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt: string, src: string) => `<img src="${escapeHref(src)}" alt="${alt}">`);
  s = s.replace(/\[\[(.*?)\]\]/g, (_, target: string) => {
    const [to = "", label] = target.split("|");
    return `<a class="wikilink" data-target="${to.trim()}">${(label ?? to).trim()}</a>`;
  });
  // A link to the web or to a path, its address as the core writes it.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, to: string) => `<a href="${escapeHref(to)}">${label}</a>`);
  s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.*?)\*/g, "<em>$1</em>");
  s = s.replace(/~~(.*?)~~/g, "<del>$1</del>");
  s = s.replace(/==(.*?)==/g, "<mark>$1</mark>");
  return s;
}

/** A note's body as HTML, roughly as the core renders it. */
export function renderMarkdown(raw: string): string {
  const { body, bodyLine } = frontmatterOf(raw);
  const lines = body.split("\n");
  const out: string[] = [];
  let code: { lang: string; lines: string[]; fence: string } | null = null;
  let table = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? "";
    // A fence closes with the same character, at least as many, and
    // nothing after them: ```` around an example holds its ``` lines.
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence && (!code || (fence[1]![0] === code.fence[0] && fence[1]!.length >= code.fence.length && fence[2]!.trim() === ""))) {
      if (code) {
        out.push(`<pre><code class="language-${code.lang}">${escapeHtml(code.lines.join("\n"))}</code></pre>`);
        code = null;
      } else code = { lang: fence[2]!.trim(), lines: [], fence: fence[1]! };
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    // A block's `^id` is not shown, and a line of it alone goes (the
    // core's block_ids.rs).
    const shown = line.replace(/(^|\s)\^[A-Za-z0-9-]+\s*$/, "$1");
    if (shown.trim() === "" && line.trim() !== "") continue;
    line = shown;
    const cells = line.trim();
    if (cells.startsWith("|") && cells.endsWith("|")) {
      const row = cells.slice(1, -1).split("|").map((c) => c.trim());
      // The header in a `thead` of `th` cells, the rest in a `tbody`, as
      // the core's renderer (pulldown-cmark) writes a table.
      if (!table) {
        out.push(`<table><thead><tr>${row.map((c) => `<th>${formatInline(c)}</th>`).join("")}</tr></thead><tbody>`);
        table = true;
      } else if (!row.every((c) => /^:?-+:?$/.test(c))) out.push(`<tr>${row.map((c) => `<td>${formatInline(c)}</td>`).join("")}</tr>`);
      continue;
    }
    if (table) {
      out.push("</tbody></table>");
      table = false;
    }
    const callout = /^>\s*\[!(\w+)\]([+-]?)\s*(.*)$/.exec(line);
    if (callout) {
      const inner: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1] ?? "").startsWith(">")) inner.push((lines[++i] ?? "").replace(/^>\s?/, ""));
      const kind = (callout[1] ?? "note").toLowerCase();
      out.push(`<blockquote class="callout" data-callout="${kind}"><div class="callout-title">${formatInline(callout[3] || kind)}</div><p>${formatInline(inner.join(" "))}</p></blockquote>`);
      continue;
    }
    const task = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      out.push(`<ul><li><input disabled="" type="checkbox" ${task[2] === " " ? "" : 'checked="" '}data-task-line="${bodyLine + i + 1}"/> ${formatInline(task[3] ?? "")}</li></ul>`);
      continue;
    }
    const item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      // The items that follow (a blank line between them is a loose list,
      // still one list) go in one list, as the core's renderer writes it.
      const run: ListItem[] = [];
      let at = i;
      for (;;) {
        const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[at] ?? "");
        if (m && !/^\s*[-*+]\s+\[[ xX]\]\s/.test(lines[at] ?? "")) {
          run.push({ indent: (m[1] ?? "").length, marker: m[2] ?? "", text: m[3] ?? "" });
          i = at;
          at++;
        } else if ((lines[at] ?? "").trim() === "" && /^\s*([-*+]|\d+\.)\s+\S/.test(lines[at + 1] ?? "")) at++;
        else break;
      }
      out.push(listHtml(run));
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      out.push(`<h${level}>${formatInline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (/^(\*\*\*|---|___)$/.test(line.trim())) out.push("<hr>");
    else if (line.trim().startsWith("<iframe")) out.push(line.trim());
    else if (line.startsWith(">")) out.push(`<blockquote><p>${formatInline(line.replace(/^>\s?/, ""))}</p></blockquote>`);
    else if (line.trim() !== "") out.push(`<p>${formatInline(line)}</p>`);
  }
  if (code) out.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
  if (table) out.push("</tbody></table>");
  return out.join("\n");
}

type ListItem = { indent: number; marker: string; text: string };

/** A run of list items as nested lists: an ordered one starts at its first
 *  number, and an item indented deeper than the one before opens a list
 *  inside it. */
function listHtml(items: ListItem[]): string {
  let at = 0;
  const level = (indent: number): string => {
    const first = items[at];
    if (!first) return "";
    const ordered = /\d/.test(first.marker);
    const tag = ordered ? "ol" : "ul";
    const start = ordered && parseInt(first.marker, 10) !== 1 ? ` start="${parseInt(first.marker, 10)}"` : "";
    let body = "";
    while (at < items.length && (items[at]?.indent ?? 0) >= indent) {
      const it = items[at] as ListItem;
      at++;
      let inner = "";
      const next = items[at];
      if (next && next.indent > it.indent) inner = level(next.indent);
      body += `<li>${formatInline(it.text)}${inner}</li>`;
    }
    return `<${tag}${start}>${body}</${tag}>`;
  };
  return level(items[0]?.indent ?? 0);
}

/** A `verso-schema` block at the top level of a note, as the core's
 *  parser reads it (ADR 0052; `verso-dialect/src/schema.rs`): the name it
 *  declares when it has one, and the definition or why there is none. A
 *  block inside a list or a quote is not read, and not listed. */
export type SchemaBlock = {
  line: number;
  /** Inside a list or a quote: reported, not read. */
  nested: boolean;
  name: string | null;
  error: string | null;
  labels: [string, string][];
  properties: { key: string; kind: string; labels: [string, string][] }[];
  /** `infobox` when the schema says it (ADR 0086 item 2); another value
   *  is no layout and no error. */
  layout: string | null;
};

const KINDS = ["text", "list", "number", "checkbox", "date", "datetime", "link", "image"];

function labelsOf(v: unknown): [string, string][] | null {
  if (v === undefined || v === null) return [];
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const out: [string, string][] = [];
  for (const [lang, text] of Object.entries(v as Record<string, unknown>)) {
    if (typeof text !== "string") return null;
    out.push([lang, text]);
  }
  return out;
}

export function schemaBlocksOf(text: string): SchemaBlock[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const out: SchemaBlock[] = [];
  // A fence opens with three or more backticks or tildes and closes with
  // the same character, at least as many, and nothing after them — so a
  // `verso-schema` fence written inside another code block (an example)
  // is that block's text, as the core's parser reads it.
  // Nested is behind a quote or a list marker, or indented under a list
  // item; up to three spaces at the top is still the top, and four or
  // more is indented code, not a fence at all (CommonMark).
  const fenceOf = (l: string): { nested: boolean; char: string; len: number; info: string } | null => {
    const m = /^((?:[ \t]*(?:>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+))*)( *)(`{3,}|~{3,})(.*)$/.exec(l);
    if (!m) return null;
    const marked = m[1]!.trim() !== "";
    const spaces = m[2]!.length;
    if (!marked && spaces >= 4) return null;
    return { nested: marked, char: m[3]![0]!, len: m[3]!.length, info: m[4]!.trim() };
  };
  // Inside a list: a list item was seen, and no line has started again
  // at the margin since — an indented fence there is the item's.
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^ {0,3}([-*+]|\d+[.)])[ \t]+/.test(l)) inList = true;
    else if (/^\S/.test(l)) inList = false;
    const open = fenceOf(l);
    if (!open) continue;
    if (inList && /^[ \t]/.test(l)) open.nested = true;
    let end = i + 1;
    while (end < lines.length) {
      const close = fenceOf(lines[end]!);
      if (close && close.char === open.char && close.len >= open.len && close.info === "") break;
      end++;
    }
    if (open.info.split(/\s+/)[0] === "verso-schema") {
      if (open.nested) {
        out.push({ line: i + 1, nested: true, name: null, error: null, labels: [], properties: [], layout: null });
      } else {
        out.push(readSchema(lines.slice(i + 1, end).join("\n"), i + 1));
      }
    }
    i = end;
  }
  return out;
}

/** A top-level block's text, read as the core reads it. */
function readSchema(body: string, line: number): SchemaBlock {
  const block: SchemaBlock = { line, nested: false, name: null, error: null, labels: [], properties: [], layout: null };
  let v: unknown;
  try {
    // As the core's reader: the first document of several, and a key
    // written twice is not an error (`saphyr` keeps one).
    const docs = YAML.parseAllDocuments(body, { uniqueKeys: false });
    const first = Array.isArray(docs) ? docs[0] : docs;
    if (!first) v = null;
    else if (first.errors.length > 0) throw first.errors[0];
    else v = first.toJS();
  } catch {
    return { ...block, error: "yaml" };
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return { ...block, error: "not_a_mapping" };
  const m = v as Record<string, unknown>;
  const name = typeof m["type"] === "string" && m["type"].trim() !== "" ? m["type"] : null;
  block.name = name;
  if (name === null) return { ...block, error: "no_type" };
  const labels = labelsOf(m["label"]);
  if (labels === null) return { ...block, error: "label" };
  const items = m["properties"] ?? [];
  if (!Array.isArray(items)) return { ...block, error: "properties" };
  block.labels = labels;
  block.layout = m["layout"] === "infobox" ? "infobox" : null;
  for (const item of items as unknown[]) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return { ...block, error: "property" };
    const p = item as Record<string, unknown>;
    if (typeof p["key"] !== "string" || p["key"].trim() === "") return { ...block, error: "property" };
    if (p["kind"] === undefined || p["kind"] === null) return { ...block, error: "property" };
    if (typeof p["kind"] !== "string" || !KINDS.includes(p["kind"])) return { ...block, error: "unknown_kind" };
    if (block.properties.some((q) => q.key === p["key"])) return { ...block, error: "duplicate_key" };
    const l = labelsOf(p["label"]);
    if (l === null) return { ...block, error: "label" };
    block.properties.push({ key: p["key"], kind: p["kind"], labels: l });
  }
  return block;
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATETIME = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** One wikilink and nothing else, as `is_one_link` (verso-dialect). */
function oneLink(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  const inner = t.slice(2, -2);
  return t.length > 4 && t.startsWith("[[") && t.endsWith("]]") && !inner.includes("[[") && !inner.includes("]]");
}
const PICTURE = /^.+\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
/** A picture, as `is_picture` (verso-dialect): a wikilink to one, a path
 *  to one, or a web address. */
function picture(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  const named = (p: string) => PICTURE.test(p.split("/").pop() ?? p);
  if (oneLink(t)) return named(t.slice(2, -2).split("|")[0]!.split("#")[0]!);
  if (/^https?:\/\//i.test(t)) return t.length > "https://".length;
  return !t.includes("[[") && !t.includes("]]") && named(t);
}

/** Does a frontmatter value fit a kind, as `PropertyKind::fits` says. */
export function fitsKind(kind: string, v: unknown): boolean {
  switch (kind) {
    case "text": return typeof v === "string";
    case "number": return typeof v === "number";
    case "checkbox": return typeof v === "boolean";
    case "list": return Array.isArray(v) && v.every((x) => typeof x === "string");
    case "date": return typeof v === "string" && DATE.test(v);
    case "datetime": return typeof v === "string" && DATETIME.test(v);
    case "link": return oneLink(v) || (Array.isArray(v) && v.every(oneLink));
    case "image": return picture(v);
    default: return false;
  }
}
