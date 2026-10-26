// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the editor's card is drawn from (ADR 0099 item 8): a statblock of
// the open note when there is one, or a sample made from the layout itself
// — a value for every key it names, of the shape its block reads (a list
// of numbers for a table, traits with a die in them, a tracker half full) —
// so every block shows while it is edited. And the keys to suggest.

import YAML from "yaml";
import type { Block, Layout } from "../model";
import { readSheet, type Sheet } from "../sheet";
import { walk } from "./state";

/** A source the editor can draw: a statblock's YAML and what to call it. */
export interface PreviewSource {
  label: string;
  text: string;
}

/** The keys a tracker's label names (`{reserva_1_nome}`). */
const labelKeys = (b: Block): string[] => [b.label?.pt ?? "", b.label?.en ?? ""].flatMap((t) => [...t.matchAll(/\{([^{}\s]{1,80})\}/g)].map((m) => m[1]!));

/** The keys a layout names, in order, each once. */
export function layoutKeys(layout: Layout): string[] {
  const out = new Set<string>();
  walk(layout, (b) => {
    for (const k of b.properties) out.add(k);
    if (b.type === "property" && b.diceKey) out.add(b.diceKey);
    if (b.type === "tracker") {
      for (const k of labelKeys(b)) out.add(k);
      out.add(b.current);
      if (typeof b.max === "string") out.add(b.max);
    }
    if (b.type === "roll") for (const v of Object.values(b.inputs)) if ("key" in v) out.add(v.key);
    if (b.type === "conditional") for (const br of b.branches) if (br.when) out.add(br.when.key);
  });
  return [...out];
}

/** The keys a statblock's YAML holds. */
export function sheetKeys(text: string): string[] {
  const r = readSheet(text);
  return r.ok ? Object.keys(r.sheet).slice(0, 300) : [];
}

const sentence = "Strikes for 2d6+1; +4 to hit.";

/** A value for `key` of the shape `block` reads. */
function valueFor(block: Block, key: string, n: number): unknown {
  switch (block.type) {
    case "heading":
      return key === "name" ? "Sample" : `Sample ${key}`;
    case "table":
      return block.properties.length === 1 ? Array.from({ length: Math.max(block.headers.length, 3) }, (_, i) => 10 + ((i * 3 + n) % 9)) : 12 + (n % 7);
    case "saves":
      return [{ [`${key}_a`]: 3 }, { [`${key}_b`]: -1 }];
    case "traits":
      return [
        { name: `${key} 1`, desc: sentence, ...(block.flag ? { [block.flag.key]: false } : {}) },
        { name: `${key} 2`, desc: "A plain line.", ...(block.flag ? { [block.flag.key]: true } : {}) },
      ];
    case "tracker":
      return key === block.current ? 2 : typeof block.max === "string" && key === block.max ? 5 : `Sample ${key}`;
    case "text":
      return `${key}: ${sentence}`;
    case "image":
      return undefined;
    default:
      return `${key} ${n + 1}`;
  }
}

/** A sheet holding a value for every key the layout names. */
export function sampleSheet(layout: Layout): Sheet {
  const sheet: Sheet = Object.create(null) as Sheet;
  let n = 0;
  // The blocks that draw a key first, the containers that only name it after.
  const blocks: Block[] = [];
  walk(layout, (b) => blocks.push(b));
  const holds = (b: Block) => b.type === "group" || b.type === "inline" || b.type === "collapse" || b.type === "conditional";
  for (const b of [...blocks.filter((x) => !holds(x)), ...blocks.filter(holds)]) {
    const keys = [...b.properties];
    if (b.type === "tracker") keys.push(...labelKeys(b), b.current, ...(typeof b.max === "string" ? [b.max] : []));
    if (b.type === "property" && b.diceKey && !Object.hasOwn(sheet, b.diceKey)) sheet[b.diceKey] = "2d8+2";
    if (b.type === "roll") for (const v of Object.values(b.inputs)) if ("key" in v && !Object.hasOwn(sheet, v.key)) sheet[v.key] = 2;
    if (b.type === "conditional") for (const br of b.branches) if (br.when && !Object.hasOwn(sheet, br.when.key)) sheet[br.when.key] = br.when.op === "has" ? "yes" : br.when.value;
    for (const k of keys) {
      if (Object.hasOwn(sheet, k)) continue;
      const v = valueFor(b, k, n++);
      if (v !== undefined) sheet[k] = v;
    }
  }
  return sheet;
}

/** The sample as a statblock's YAML. */
export function sampleText(layout: Layout): string {
  return YAML.stringify({ ...sampleSheet(layout) }, { lineWidth: 0 });
}
