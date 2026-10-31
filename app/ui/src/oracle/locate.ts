// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Finding an oracle callout in a note's text, and planning what the oracle
 *  writes into it (ADR 0102 item 4). Pure: text in, offsets out, no DOM and
 *  no CodeMirror, so the Live Preview button and the reading view share one
 *  reader and a test can pin every case.
 *
 *  The rules, all of them to keep a person's lines safe:
 *  - A callout is found by its exact place and its exact text, never by a
 *    title that looks alike. If it is not exactly where it was, there is no
 *    answer (`null`) and the caller writes nothing.
 *  - A fenced example is not a callout; a `[!oracle]` line inside another
 *    callout's body is not a callout (the reader renders one); a nested one
 *    is.
 *  - What the oracle writes into an existing callout is only what the oracle
 *    itself generates (an answer, a spark, a table result). Every other line
 *    stays, and what the person typed after an answer on the same line too. */

import { frontmatterClose } from "../frontmatter";

/** The words that open a spark line, in both languages (ADR 0035). */
export const SPARK_LABELS = { pt: "Faísca:", en: "Spark:" } as const;
/** The labels of the two lines a spark alone writes. */
export const SPARK_LINE_LABELS = {
  pt: { actionTheme: "Ação + Tema", descriptorFocus: "Descritor + Foco" },
  en: { actionTheme: "Action + Theme", descriptorFocus: "Descriptor + Focus" },
} as const;

export interface TextLine {
  from: number;
  /** End of the text, before the line break. */
  to: number;
  text: string;
}

/** The lines of `text` with their offsets; `\n`, `\r\n` and `\r` all end one. */
export function splitLines(text: string): TextLine[] {
  const out: TextLine[] = [];
  let at = 0;
  const re = /\r\n|\n|\r/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ from: at, to: m.index, text: text.slice(at, m.index) });
    at = m.index + m[0].length;
  }
  out.push({ from: at, to: text.length, text: text.slice(at) });
  return out;
}

const QUOTE = /^([ \t]*)((?:>[ \t]?)+)/;

/** A line's blockquote prefix: its indentation, its `>` marks as written,
 *  how many marks, and what follows. */
export function quoteInfo(line: string): { indent: string; marks: string; depth: number; prefix: string; rest: string } {
  const m = QUOTE.exec(line);
  if (!m) return { indent: "", marks: "", depth: 0, prefix: "", rest: line };
  const marks = m[2]!;
  return { indent: m[1]!, marks, depth: (marks.match(/>/g) ?? []).length, prefix: m[0], rest: line.slice(m[0].length) };
}

const HEAD = /^([ \t]*(?:>[ \t]?)+)[ \t]*\[!oracle\]([+-]?)(?:[ \t]+(.*))?$/i;

/** Whether a line reads as `> [!oracle] …` (any case, any indentation or
 *  quote depth, `>[!oracle]` too). */
export function isOracleHead(line: string): boolean {
  return HEAD.test(line);
}

/** Whether a title says nothing: the kind's own name, which a callout made
 *  with no question carries. */
export function genericTitle(title: string): boolean {
  return /^(?:oracle|or[aá]culo)$/i.test(title.trim());
}

/** A line the oracle wrote: an answer, up to the end of its bracketed roll. */
const ANSWER = /^\*\*(?:\\.|[^*\\])+\*\* _\(d100: \d+, [^)]*\)_/;
/** A table result: the entry in bold and the roll in the form `(d8: 3)`. */
const TABLE = /^\*\*(?:\\.|[^*\\])+\*\* _\(d\d+: \d+\)_/;
const SPARK = new RegExp(`^(?:${SPARK_LABELS.pt}|${SPARK_LABELS.en}) \\*.*\\*[ \\t]*$`);
const SPARK_ONLY = new RegExp(
  `^\\*\\*(?:${[SPARK_LINE_LABELS.pt.actionTheme, SPARK_LINE_LABELS.en.actionTheme, SPARK_LINE_LABELS.pt.descriptorFocus, SPARK_LINE_LABELS.en.descriptorFocus]
    .map((s) => s.replace(/[+]/g, "\\+"))
    .join("|")}):\\*\\* `,
);

function generatedLine(rest: string): boolean {
  return ANSWER.test(rest) || TABLE.test(rest) || SPARK.test(rest) || SPARK_ONLY.test(rest);
}

export interface OracleBlock {
  /** Start of the head line (its indentation included). */
  from: number;
  /** End of the last line's text. */
  to: number;
  /** `from..to` of the note. */
  text: string;
  lines: TextLine[];
  /** The head line's indentation and `>` marks as written. */
  prefix: string;
  depth: number;
  /** The text after `[!oracle]` and its fold mark. */
  title: string;
  /** Where that title sits in the note (an empty range at the line's end when there is none). */
  titleFrom: number;
  titleTo: number;
}

function fenceOpen(rest: string): { char: string; len: number } | null {
  const m = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(rest);
  if (!m) return null;
  const run = m[1]!;
  if (run[0] === "`" && m[2]!.includes("`")) return null;
  return { char: run[0]!, len: run.length };
}

function fenceClose(rest: string, open: { char: string; len: number }): boolean {
  const m = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(rest);
  return m !== null && m[1]![0] === open.char && m[1]!.length >= open.len;
}

/** Every oracle callout of the text, in order. A head counts when it is the
 *  first line of its blockquote (the line before is quoted less deeply) and
 *  is not in a code fence. A callout runs while the lines are quoted at least
 *  as deeply as its head. */
export function oracleBlocks(text: string): OracleBlock[] {
  const lines = splitLines(text);
  const out: OracleBlock[] = [];
  let fence: { char: string; len: number } | null = null;
  const inFence: boolean[] = [];
  for (const l of lines) {
    const rest = quoteInfo(l.text).rest;
    if (fence) {
      inFence.push(true);
      if (fenceClose(rest, fence)) fence = null;
    } else {
      const open = fenceOpen(rest);
      if (open) {
        fence = open;
        inFence.push(true);
      } else inFence.push(false);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const line = lines[i]!;
    const m = HEAD.exec(line.text);
    if (!m) continue;
    const depth = (m[1]!.match(/>/g) ?? []).length;
    const prevDepth = i > 0 ? quoteInfo(lines[i - 1]!.text).depth : 0;
    if (prevDepth >= depth) continue;
    let j = i;
    while (j + 1 < lines.length && !inFence[j + 1] && quoteInfo(lines[j + 1]!.text).depth >= depth) j++;
    const last = lines[j]!;
    const title = (m[3] ?? "").trim();
    const afterKind = line.text.search(/\[!oracle\]/i) + "[!oracle]".length + m[2]!.length;
    const gap = /^[ \t]*/.exec(line.text.slice(afterKind))![0].length;
    const titleFrom = line.from + afterKind + gap;
    out.push({
      from: line.from,
      to: last.to,
      text: text.slice(line.from, last.to),
      lines: lines.slice(i, j + 1),
      prefix: m[1]!,
      depth,
      title,
      titleFrom,
      titleTo: title ? titleFrom + (m[3] ?? "").trimEnd().length : titleFrom,
    });
  }
  return out;
}

/** The oracle callout whose head is on `line` (1-based, as the core numbers
 *  `data-oracle-line`, frontmatter included), or null when no callout's head
 *  is there — a body line, a fenced example, a line past the end. */
export function oracleBlockOnLine(text: string, line: number): OracleBlock | null {
  if (!Number.isInteger(line) || line < 1) return null;
  const head = splitLines(text)[line - 1];
  if (!head) return null;
  return oracleBlocks(text).find((b) => b.from === head.from) ?? null;
}

/** The innermost oracle callout `pos` stands in, on any of its lines. */
export function oracleBlockContaining(text: string, pos: number): OracleBlock | null {
  let best: OracleBlock | null = null;
  for (const b of oracleBlocks(text)) {
    if (pos >= b.from && pos <= b.to && (!best || b.from >= best.from)) best = b;
  }
  return best;
}

/** The callout whose head line holds `pos`. */
export function oracleBlockAt(text: string, pos: number): OracleBlock | null {
  for (const b of oracleBlocks(text)) {
    const head = b.lines[0]!;
    if (pos >= head.from && pos <= head.to) return b;
  }
  return null;
}

export interface OracleHint {
  /** Where the callout started (mapped through the changes since). */
  from: number;
  /** What it said when it was picked. */
  text: string;
}

/** The callout `hint` names, only if it is still exactly there: it starts
 *  where the hint says and says what the hint says. Never a title that looks
 *  alike, never the next one: `null` and nothing gets written. */
export function locateOracleCallout(text: string, hint: OracleHint): OracleBlock | null {
  if (!Number.isInteger(hint.from) || hint.from < 0 || hint.from > text.length) return null;
  for (const b of oracleBlocks(text)) {
    if (b.from === hint.from) return b.text === hint.text ? b : null;
  }
  return null;
}

/** The question a callout asks: its title, or when the title is empty or
 *  only the kind's name, its first line that is not one the oracle wrote. */
export function oracleQuestion(block: OracleBlock): string {
  if (block.title && !genericTitle(block.title)) return block.title;
  for (const l of block.lines.slice(1)) {
    const rest = quoteInfo(l.text).rest.trim();
    if (rest && !generatedLine(rest)) return rest;
  }
  return "";
}

/** What a roll writes. Text is already one line, the markdown escaped. */
export type Generated =
  | { kind: "answer"; question: string; line: string; spark?: string }
  | { kind: "table"; line: string }
  | { kind: "spark"; lines: [string, string] };

export interface Change {
  from: number;
  to: number;
  insert: string;
}

export interface Plan {
  changes: Change[];
  /** Where the caret goes, in the text after the changes. */
  cursor: number;
}

function eolOf(block: OracleBlock, text: string): string {
  const head = block.lines[0]!;
  const m = /^(\r\n|\n|\r)/.exec(text.slice(head.to));
  return m ? m[1]! : "\n";
}

/** After `prefix`, a space: what a new line of the callout starts with. */
function linePrefix(prefix: string): string {
  return /[ \t]$/.test(prefix) ? prefix : `${prefix} `;
}

/** Where `pos` lands once `changes` are applied. */
export function shifted(changes: readonly Change[], pos: number): number {
  let delta = 0;
  for (const c of changes) if (c.to <= pos) delta += c.insert.length - (c.to - c.from);
  return pos + delta;
}

/** Apply non-overlapping changes to the text. Where two meet at one point
 *  the one listed first ends up first. */
export function applyChanges(text: string, changes: readonly Change[]): string {
  const order = changes.map((c, i) => ({ c, i })).sort((a, b) => b.c.from - a.c.from || b.i - a.i);
  let out = text;
  for (const { c } of order) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
}

type Edit = Change & { caretAt?: number };

/** The line below a callout's head that holds its question (the title being
 *  empty or generic): its text's own range, quote marks and spaces left out. */
function questionLine(block: OracleBlock): { from: number; to: number; text: string } | null {
  for (const l of block.lines.slice(1)) {
    const info = quoteInfo(l.text);
    const rest = info.rest.trim();
    if (!rest || generatedLine(rest)) continue;
    const lead = info.rest.length - info.rest.trimStart().length;
    const from = l.from + info.prefix.length + lead;
    return { from, to: from + rest.length, text: rest };
  }
  return null;
}

/** What a rewritten question takes away from a callout: only what the oracle
 *  wrote (answers, sparks, table results). A line that is nothing else goes
 *  whole; consecutive ones go as one range, so no two ranges overlap and the
 *  callout stays one block. An answer the person went on writing after keeps
 *  that text. */
function generatedRemovals(block: OracleBlock): Change[] {
  const out: Change[] = [];
  const whole: number[] = [];
  const ls = block.lines;
  for (let k = 1; k < ls.length; k++) {
    const l = ls[k]!;
    const info = quoteInfo(l.text);
    const m = ANSWER.exec(info.rest) ?? TABLE.exec(info.rest);
    if (m) {
      if (info.rest.slice(m[0].length).trim() === "") whole.push(k);
      else {
        const at = l.from + info.prefix.length;
        out.push({ from: at, to: at + m[0].length + (info.rest[m[0].length] === " " ? 1 : 0), insert: "" });
      }
    } else if (SPARK.test(info.rest) || SPARK_ONLY.test(info.rest)) whole.push(k);
  }
  for (let i = 0; i < whole.length; ) {
    let j = i;
    while (j + 1 < whole.length && whole[j + 1] === whole[j]! + 1) j++;
    const first = whole[i]!;
    const last = whole[j]!;
    // A run that ends the callout takes the break before it; any other takes its own.
    if (last === ls.length - 1) out.push({ from: ls[first - 1]!.to, to: ls[last]!.to, insert: "" });
    else out.push({ from: ls[first]!.from, to: ls[last + 1]!.from, insert: "" });
    i = j + 1;
  }
  return out;
}

/** What to write into an existing callout (the maintainer's rule, 2026-10-20):
 *  a new answer to the same question is added at the callout's end, the
 *  earlier ones kept. Only when the question was rewritten are the oracle's
 *  own answer lines of that callout replaced (a line the person went on
 *  writing after its roll keeps that text). Every other line is left as it
 *  is. A table result is added the same way; a spark alone replaces its own two lines. */
export function planOracleEdit(text: string, block: OracleBlock, gen: Generated): Plan {
  const eol = eolOf(block, text);
  const pre = linePrefix(block.prefix);
  const body = block.lines.slice(1);
  const edits: Edit[] = [];
  const find = (re: RegExp): { line: TextLine; at: number; len: number; rest: string; prefix: string } | null => {
    for (const l of body) {
      const q = quoteInfo(l.text);
      const m = re.exec(q.rest);
      if (m) return { line: l, at: l.from + q.prefix.length, len: m[0].length, rest: q.rest, prefix: q.prefix };
    }
    return null;
  };

  if (gen.kind === "answer") {
    const q = gen.question.trim();
    // Where the question lives: a real title, or (the title empty or only the
    // kind's name) the first line below the head the oracle did not write.
    const realTitle = block.title !== "" && !genericTitle(block.title);
    const below = realTitle ? null : questionLine(block);
    const current = realTitle ? block.title : below ? below.text : "";
    // The question was rewritten: this callout's own lines (its answers) are
    // replaced. Same question: the answers pile up.
    const rewritten = q !== "" && current !== "" && q !== current;
    if (q && q !== current) {
      if (below) edits.push({ from: below.from, to: below.to, insert: q });
      else {
        const spaced = block.title === "" && !/[ \t]/.test(text[block.titleFrom - 1] ?? "");
        edits.push({ from: block.titleFrom, to: block.titleTo, insert: spaced ? ` ${q}` : q });
      }
    }
    if (rewritten) edits.push(...generatedRemovals(block));
    const parts = gen.spark !== undefined ? [gen.spark, `${gen.line} `] : [`${gen.line} `];
    const insert = parts.map((p) => `${eol}${pre}${p}`).join("");
    edits.push({ from: block.to, to: block.to, insert, caretAt: insert.length });
  } else if (gen.kind === "table") {
    const insert = `${eol}${pre}${gen.line}`;
    edits.push({ from: block.to, to: block.to, insert, caretAt: insert.length });
  } else {
    let added = "";
    for (const [re, content] of [[SPARK_ACTION, gen.lines[0]], [SPARK_DESCRIPTOR, gen.lines[1]]] as const) {
      const found = find(re);
      if (found) edits.push({ from: found.at, to: found.line.to, insert: content });
      else added += `${eol}${pre}${content}`;
    }
    if (added) edits.push({ from: block.to, to: block.to, insert: added, caretAt: added.length });
    else {
      const last = edits.reduce((a, b) => (b.from > a.from ? b : a));
      last.caretAt = last.insert.length;
    }
  }
  const at = edits.find((e) => e.caretAt !== undefined)!;
  const i = edits.indexOf(at);
  const before = edits.filter((e, k) => e !== at && e.to <= at.from && (e.from < at.from || k < i));
  const cursor = shifted(before, at.from) + at.caretAt!;
  return { changes: edits.map(({ from, to, insert }) => ({ from, to, insert })), cursor };
}

const SPARK_ACTION = new RegExp(`^\\*\\*(?:${SPARK_LINE_LABELS.pt.actionTheme.replace("+", "\\+")}|${SPARK_LINE_LABELS.en.actionTheme.replace("+", "\\+")}):\\*\\* `);
const SPARK_DESCRIPTOR = new RegExp(`^\\*\\*(?:${SPARK_LINE_LABELS.pt.descriptorFocus.replace("+", "\\+")}|${SPARK_LINE_LABELS.en.descriptorFocus.replace("+", "\\+")}):\\*\\* `);

/** What `planOracleInsert` makes of a plain insertion. */
export interface InsertPlan {
  change: Change;
  cursor: number;
}

/** The last line of the quote the line `idx` is in, the outermost one: every
 *  following line quoted at all, and a lazy continuation of its paragraph. */
function quoteEnd(lines: TextLine[], idx: number): number {
  let end = idx;
  while (end + 1 < lines.length) {
    const next = lines[end + 1]!.text;
    if (quoteInfo(next).depth > 0) {
      end++;
      continue;
    }
    const last = quoteInfo(lines[end]!.text).rest.trim();
    const startsBlock = /^\s*(?:#{1,6}(?:\s|$)|[-*+]\s|\d+[.)]\s|`{3,}|~{3,}|\||<|(?:-\s*){3,}$|(?:\*\s*){3,}$)/.test(next);
    if (next.trim() !== "" && last !== "" && !last.startsWith("#") && !fenceOpen(last) && !startsBlock) {
      end++;
      continue;
    }
    break;
  }
  return end;
}

/** A new callout at `at`, for a roll with no callout to write into: after
 *  the line the caret is on, set apart by a blank line. It is never put
 *  inside something it would split: a code fence or a table (after them),
 *  a blockquote or callout of any depth (after the outermost one), the
 *  frontmatter (after its closing line). Never moved to the end of the note.
 *  `callout.cursor` is where the caret goes inside `callout.text`. */
export function planOracleInsert(text: string, at: number, callout: { text: string; cursor: number }): InsertPlan {
  const lines = splitLines(text);
  let pos = Math.max(0, Math.min(at, text.length));
  let idx = lines.findIndex((l) => pos >= l.from && pos <= l.to);
  if (idx < 0) idx = lines.length - 1;
  const close = frontmatterClose((i) => lines[i]?.text);
  if (close >= 0 && idx <= close) {
    idx = close;
    pos = lines[idx]!.to;
  } else {
    idx = clearOfCodeAndTable(lines, idx);
    pos = Math.min(Math.max(pos, lines[idx]!.from), lines[idx]!.to);
    if (quoteInfo(lines[idx]!.text).depth > 0) {
      idx = quoteEnd(lines, idx);
      pos = lines[idx]!.to;
    }
  }
  const line = lines[idx]!;
  const empty = line.text.trim() === "";
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  const from = empty ? pos : line.to;
  const lead = empty ? "" : `${eol}${eol}`;
  const body = callout.text.replace(/\n/g, eol);
  return { change: { from, to: from, insert: lead + body }, cursor: from + lead.length + callout.cursor };
}

/** The line to insert after when `idx` is in a code fence or a table: the
 *  last line of it. Otherwise `idx` itself. */
function clearOfCodeAndTable(lines: TextLine[], idx: number): number {
  let fence: { char: string; len: number } | null = null;
  let closesHere = false;
  for (let i = 0; i <= idx; i++) {
    const rest = quoteInfo(lines[i]!.text).rest;
    if (fence) {
      if (fenceClose(rest, fence)) {
        fence = null;
        closesHere = i === idx;
      }
    } else {
      const open = fenceOpen(rest);
      if (open) fence = open;
    }
  }
  if (fence) {
    for (let i = idx + 1; i < lines.length; i++) if (fenceClose(quoteInfo(lines[i]!.text).rest, fence)) return i;
    return lines.length - 1;
  }
  if (closesHere) return idx;
  if (/^\s*\|/.test(lines[idx]!.text)) {
    let end = idx;
    while (end + 1 < lines.length && /^\s*\|/.test(lines[end + 1]!.text)) end++;
    return end;
  }
  return idx;
}
