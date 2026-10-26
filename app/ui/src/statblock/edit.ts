// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A tracker's click written into the note (ADR 0099 item 5, decided
// 2026-10-20: "deveria gravar"). The click is the person's action
// (invariant 8); what changes is that one value's text in the block's YAML
// — never the whole block, never the formatting around it (a comment after
// the value, the quotes it had) — and it goes through the editor, so in a
// room it is the room's edit like any typed one, and the ordinary save
// writes it with the stale check (invariant 11).
//
// In the reading view the write follows the oracle's path
// (oracle/write.ts): nothing is written while the note is read-only, while
// a conflict waits, while the reader's view is shown, or when the text on
// screen is no longer the editor's; and the block is found again by its
// text, never guessed.

import type { EditorView } from "@codemirror/view";
import YAML from "yaml";
import { isStatblockFence } from "./fence";

export type Refusal = "readOnly" | "conflict" | "readerView" | "stale" | "moved" | "nested" | "shape" | "unchanged";
export type WriteOutcome = { ok: true } | { ok: false; why: Refusal };

/** A change of the block's text, offsets within it. */
export type Plan = { from: number; to: number; insert: string };

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/;

/** Where a value is in a block's YAML: a top-level key, or a path of keys
 *  and list indexes (`["fatos", 2, "quebrado"]`). */
export type ValuePath = string | (string | number)[];
export type Value = number | boolean;

/** The column a line of `yaml` starts its text at `pos` from. */
const columnOf = (yaml: string, pos: number): number => pos - (yaml.lastIndexOf("\n", pos - 1) + 1);

/** The change that makes the value at `at` in `yaml` read `value`, and
 *  only that: the scalar's own text replaced (in its quotes, if it had
 *  them), or — the key absent from its map — a line `key: value` added
 *  after the map's last line, at the map's own column. Why not, when the
 *  YAML does not let one value change alone. */
export function planValueEdit(yaml: string, at: ValuePath, value: Value): Plan | { why: Refusal } {
  if (typeof value === "number" && !Number.isInteger(value)) return { why: "shape" };
  const path = typeof at === "string" ? [at] : at;
  const key = path[path.length - 1];
  if (typeof key !== "string" || path.length === 0 || path.length > 8) return { why: "shape" };
  let doc: YAML.Document.Parsed;
  try {
    doc = YAML.parseDocument(yaml, { uniqueKeys: false, logLevel: "silent" });
  } catch {
    return { why: "shape" };
  }
  if (doc.errors.length > 0) return { why: "shape" };
  const root = doc.contents;
  if (!YAML.isMap(root) || root.flow) return { why: "shape" };
  // The last pair of a key is the one a reader takes.
  const pairOf = (map: YAML.YAMLMap, k: string) => [...map.items].reverse().find((p) => YAML.isScalar(p.key) && String(p.key.value) === k);
  let node: unknown = root;
  for (const step of path.slice(0, -1)) {
    if (typeof step === "number" && YAML.isSeq(node)) node = node.items[step];
    else if (typeof step === "string" && YAML.isMap(node)) node = pairOf(node, step)?.value;
    else return { why: "shape" };
    if (node === undefined || node === null) return { why: "shape" };
  }
  if (!YAML.isMap(node)) return { why: "shape" };
  const map = node;
  const text = String(value);
  const pair = pairOf(map, key);
  if (pair) {
    const v = pair.value;
    if (!YAML.isScalar(v) || !v.range) return { why: "shape" };
    const [from, to] = v.range;
    const was = yaml.slice(from, to);
    let insert: string;
    if (v.type === "QUOTE_DOUBLE") insert = `"${text}"`;
    else if (v.type === "QUOTE_SINGLE") insert = `'${text}'`;
    else if (v.type === "PLAIN") insert = was === "" && yaml[from - 1] === ":" ? ` ${text}` : text;
    else return { why: "shape" };
    if (was === insert) return { why: "unchanged" };
    return { from, to, insert };
  }
  const name = PLAIN_KEY.test(key) ? key : JSON.stringify(key);
  if (map === root) {
    // A line of its own after the block, at the map's column (the first).
    const first = root.items[0];
    const col = first && YAML.isScalar(first.key) && first.key.range ? columnOf(yaml, first.key.range[0]) : 0;
    if (col !== 0) return { why: "shape" };
    const end = yaml.length;
    return yaml === "" || yaml.endsWith("\n") ? { from: end, to: end, insert: `${name}: ${text}\n` } : { from: end, to: end, insert: `\n${name}: ${text}` };
  }
  // In a nested map (a list's item): after its last pair, when that pair's
  // value is a one-line scalar; at the column of its first key.
  if (map.flow) return { why: "shape" };
  const first = map.items[0];
  const last = map.items[map.items.length - 1];
  if (!first || !last || !YAML.isScalar(first.key) || !first.key.range) return { why: "shape" };
  const lv = last.value;
  if (!YAML.isScalar(lv) || !lv.range || (lv.type !== "PLAIN" && lv.type !== "QUOTE_DOUBLE" && lv.type !== "QUOTE_SINGLE")) return { why: "shape" };
  if (yaml.slice(lv.range[0], lv.range[1]).includes("\n")) return { why: "shape" };
  const nl = yaml.indexOf("\n", lv.range[1]);
  const end = nl < 0 ? yaml.length : nl;
  return { from: end, to: end, insert: `\n${" ".repeat(columnOf(yaml, first.key.range[0]))}${name}: ${text}` };
}

/** A statblock fence of a note's text: where its inside is, and the text
 *  there. Only fences that start a line of their own (at most three spaces
 *  in), outside quotes: a block in a quote or a list is given to the
 *  renderer without its marks, and is not written to. */
export type Fence = { from: number; to: number; text: string };

export function statblockFences(doc: string): Fence[] {
  const out: Fence[] = [];
  let open: { char: string; len: number; from: number; statblock: boolean } | null = null;
  let at = 0;
  while (at <= doc.length) {
    const nl = doc.indexOf("\n", at);
    const end = nl < 0 ? doc.length : nl;
    const line = doc.slice(at, end).replace(/\r$/, "");
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (m && !(m[1]![0] === "`" && m[2]!.includes("`"))) open = { char: m[1]![0]!, len: m[1]!.length, from: nl < 0 ? doc.length : nl + 1, statblock: isStatblockFence(m[2]!) };
    } else {
      const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (m && m[1]![0] === open.char && m[1]!.length >= open.len) {
        if (open.statblock) out.push({ from: open.from, to: at, text: doc.slice(open.from, at) });
        open = null;
      }
    }
    if (nl < 0) break;
    at = nl + 1;
  }
  return out;
}

const eolless = (s: string): string => s.replace(/\r\n?/g, "\n");
/** Two texts of a block alike, but for line endings and the last newline. */
export const sameText = (a: string, b: string): boolean => eolless(a).replace(/\n$/, "") === eolless(b).replace(/\n$/, "");

/** What a write into the reading view needs of the note: the note leaf has
 *  all of it (the oracle asks the same, oracle/host.ts). */
export interface NoteHost {
  editor: EditorView;
  readOnly: boolean;
  /** "preview" is the reading view. */
  mode: string;
  conflict: { up: boolean };
  readerView: { on: boolean };
  /** The text the reading view was drawn from. */
  shownText: string;
  save(): Promise<unknown>;
}

/** Whether `x` can be written into as a note (a leaf; not a board's card). */
export function isNoteHost(x: unknown): x is NoteHost {
  const o = x as Partial<NoteHost> | null | undefined;
  return !!o && typeof o === "object" && !!o.editor && typeof o.save === "function" && typeof o.mode === "string" && !!o.conflict && !!o.readerView;
}

function refusal(host: NoteHost): Refusal | null {
  if (host.readOnly) return "readOnly";
  if (host.conflict.up) return "conflict";
  if (host.mode === "preview" && host.readerView.on) return "readerView";
  return null;
}

/** In the reading view: set `key` to `value` in the statblock whose text
 *  is `cardText`, the `ordinal`-th of the `shown` cards on screen with that
 *  same text. The editor's text must still be the one drawn, and hold as
 *  many such blocks as the screen shows, or nothing is written. */
export function writeInReading(host: NoteHost, cardText: string, ordinal: number, shown: number, key: ValuePath, value: Value): WriteOutcome {
  const why = refusal(host);
  if (why) return { ok: false, why };
  const view = host.editor;
  const text = view.state.doc.toString();
  if (eolless(text) !== eolless(host.shownText)) return { ok: false, why: "stale" };
  const same = statblockFences(text).filter((f) => sameText(f.text, cardText));
  const fence = same[ordinal];
  if (same.length !== shown || !fence) return { ok: false, why: same.length === 0 ? "nested" : "moved" };
  const plan = planValueEdit(fence.text, key, value);
  if ("why" in plan) return { ok: false, why: plan.why };
  view.dispatch({ changes: { from: fence.from + plan.from, to: fence.from + plan.to, insert: plan.insert }, scrollIntoView: false });
  if (host.mode === "preview") void host.save();
  return { ok: true };
}
