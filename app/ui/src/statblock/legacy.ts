// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layouts the first build kept in a device's browser storage (ADR 0099
// item 2: "what an earlier build kept there moves into the folder once"),
// read in that build's shape and turned into the model. Reading never
// writes; the person moves them into the folder from Settings, as a step
// of their own (store.ts `moveDevice`).

import { LAYOUT_ID } from "./model";
import { slugId, validateLayout } from "./validate";
import type { Layout } from "./model";

/** Where the first build kept them. */
export const LEGACY_KEY = "verso:statblock-layouts";

type Rec = Record<string, unknown>;
const isMap = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const keys = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);

/** One block of the first build's as blocks of the model. */
function block(b: Rec): Rec[] {
  const props = keys(own(b, "properties"));
  const title = typeof own(b, "title") === "string" && own(b, "title") ? { label: own(b, "title") } : {};
  const options = isMap(own(b, "options")) ? (own(b, "options") as Rec) : {};
  const each = (type: string) => props.map((k) => ({ type, properties: [k], label: k.replace(/_/g, " "), hideWhenEmpty: true }));
  switch (own(b, "type")) {
    case "heading":
      return [{ type: "heading", properties: props.length ? props : ["name"], size: 1, hideWhenEmpty: true }];
    case "subheading":
      return [{ type: "subheading", properties: props, separator: ", ", hideWhenEmpty: true }];
    case "image":
      return [{ type: "image", properties: props.length ? props : ["image"], hideWhenEmpty: true }];
    case "property":
    case "vitals":
      return [{ type: "group", properties: props, hideWhenEmpty: true, ...title, nested: each("property") }];
    case "abilities":
    case "table": {
      const attrs = Array.isArray(options["attributes"]) ? (options["attributes"] as unknown[]).filter(isMap) : [];
      return [{ type: "table", properties: props, hideWhenEmpty: true, ...title, headers: attrs.map((a) => String(own(a, "short") ?? own(a, "name") ?? "")), modifier: options["d20Modifiers"] === true ? "d20" : "none" }];
    }
    case "saves":
      return [{ type: "saves", properties: props.length ? props : ["saves"], hideWhenEmpty: true, ...title }];
    case "traits":
    case "section":
      return [{ type: "traits", properties: props.length ? props : ["traits"], hideWhenEmpty: true, ...title, dice: true }];
    case "text": {
      const text = own(b, "text") ?? options["text"];
      return [{ type: "text", properties: props, hideWhenEmpty: text === undefined, ...title, ...(typeof text === "string" ? { text } : {}), dice: true }];
    }
    default:
      return [];
  }
}

/** The id a legacy record takes in the model. */
function legacyId(raw: Rec, name: string): string {
  const old = typeof own(raw, "id") === "string" ? (own(raw, "id") as string).replace(/^custom-/, "") : "";
  return LAYOUT_ID.test(old) ? old : slugId(old || name);
}

/** A layout of the first build's in the model, or null. */
export function fromLegacy(raw: unknown): Layout | null {
  if (!isMap(raw)) return null;
  const blocks: Rec[] = [];
  for (const b of Array.isArray(own(raw, "blocks")) ? (own(raw, "blocks") as unknown[]).slice(0, 200) : []) {
    if (!isMap(b)) continue;
    // A divider was a block of its own; here it is the rule after a block.
    if (own(b, "type") === "divider") {
      const last = blocks[blocks.length - 1];
      if (last) last["rule"] = true;
      continue;
    }
    blocks.push(...block(b));
  }
  const name = typeof own(raw, "name") === "string" ? (own(raw, "name") as string) : "Layout";
  return validateLayout({ version: 1, id: legacyId(raw, name), name, columns: 1, diceRules: [{ pattern: String.raw`\b(\d{0,3}d\d{1,4}(?: ?[+-] ?\d{1,5})?)\b`, template: "$1" }], blocks }).layout;
}

/** The first build's layouts on this device, read; nothing written. */
export function readLegacy(): Layout[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.slice(0, 200).map(fromLegacy).filter((l): l is Layout => l !== null);
  } catch {
    return [];
  }
}

const KEPT_KEY = "verso:statblock-legacy-kept";

/** Whether the person chose to keep the old layouts on this device only. */
export function legacyKept(): boolean {
  try {
    return localStorage.getItem(KEPT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLegacyKept(kept: boolean): void {
  try {
    if (kept) localStorage.setItem(KEPT_KEY, "1");
    else localStorage.removeItem(KEPT_KEY);
  } catch {
    // Storage closed: the notice comes back next time, harmless.
  }
}

/** Only the legacy records whose model id is in `ids` gone from this
 *  device; the rest stay. All gone clears the key. */
export function removeLegacy(ids: ReadonlySet<string>): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return clearLegacy();
    const rest = list.filter((r) => {
      const l = fromLegacy(r);
      return l !== null && !ids.has(l.id);
    });
    if (rest.length === 0) return clearLegacy();
    localStorage.setItem(LEGACY_KEY, JSON.stringify(rest));
  } catch {
    // Nothing to change, or storage closed: read again next time, harmless.
  }
}

/** The first build's layouts gone from this device, once they are in the folder. */
export function clearLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem("verso:statblock-default-layout");
  } catch {
    // Nothing to clear, or storage closed: read again next time, harmless.
  }
}
