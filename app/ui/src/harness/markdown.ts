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
    const m = /^\s*(```+|~~~+)/.exec(line);
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

/** The `^id` blocks of a note. */
export function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  readableLines(text).forEach((line, i) => {
    const m = /\s\^([A-Za-z0-9-]+)\s*$/.exec(line);
    if (m && m.index !== undefined) out.push({ id: m[1] ?? "", line: i + 1, col: m.index + 2 });
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
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
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
  let code: { lang: string; lines: string[] } | null = null;
  let table = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*```/.test(line)) {
      if (code) {
        out.push(`<pre><code class="language-${code.lang}">${escapeHtml(code.lines.join("\n"))}</code></pre>`);
        code = null;
      } else code = { lang: line.trim().slice(3).trim(), lines: [] };
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    const cells = line.trim();
    if (cells.startsWith("|") && cells.endsWith("|")) {
      if (!table) out.push("<table>");
      table = true;
      const row = cells.slice(1, -1).split("|").map((c) => c.trim());
      if (!row.every((c) => /^:?-+:?$/.test(c))) out.push(`<tr>${row.map((c) => `<td>${formatInline(c)}</td>`).join("")}</tr>`);
      continue;
    }
    if (table) {
      out.push("</table>");
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
      const tag = /\d/.test(item[2] ?? "") ? "ol" : "ul";
      out.push(`<${tag}><li>${formatInline(item[3] ?? "")}</li></${tag}>`);
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
  if (table) out.push("</table>");
  return out.join("\n");
}
