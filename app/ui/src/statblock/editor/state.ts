// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layout editor's state (ADR 0099 item 8), as functions of a layout
// that return a new one: add a block, remove it, move it among its
// siblings, into the container before it or out of the one it is in, to any
// place a drag drops it; duplicate it; change one of its fields. And the
// editing session over them: undo and redo of every change (a run of typing
// in one field is one step), and whether it differs from what was saved.
// Nothing here touches the page: the tree, the forms and the tests share it.

import type { Block, BlockType, Layout } from "../model";

/** A list of blocks in the tree: the layout's own (`parent` null), a
 *  container's `nested`, or one branch of a conditional. */
export type Slot = { parent: string | null; branch?: number };

/** Where a block is: its slot and its index there. */
export type Place = { slot: Slot; index: number };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The blocks of a slot, or null when the slot names no container. */
export function slotList(layout: Layout, slot: Slot): Block[] | null {
  if (slot.parent === null) return layout.blocks;
  const b = findBlock(layout, slot.parent);
  if (!b) return null;
  if (b.type === "conditional") return slot.branch === undefined ? null : (b.branches[slot.branch]?.nested ?? null);
  if (b.type === "group" || b.type === "inline" || b.type === "collapse") return slot.branch === undefined ? b.nested : null;
  return null;
}

/** Whether a block holds blocks of its own (not a conditional: its
 *  branches do). */
export const isContainer = (b: Block): b is Extract<Block, { nested: Block[] }> => b.type === "group" || b.type === "inline" || b.type === "collapse";

/** Every block with its place, in the order the tree shows them. */
export function walk(layout: Layout, visit: (b: Block, place: Place, depth: number) => void): void {
  const go = (list: Block[], slot: Slot, depth: number) => {
    list.forEach((b, index) => {
      visit(b, { slot, index }, depth);
      if (isContainer(b)) go(b.nested, { parent: b.id }, depth + 1);
      if (b.type === "conditional") b.branches.forEach((br, i) => go(br.nested, { parent: b.id, branch: i }, depth + 2));
    });
  };
  go(layout.blocks, { parent: null }, 0);
}

export function findBlock(layout: Layout, id: string): Block | null {
  let hit: Block | null = null;
  walk(layout, (b) => {
    if (!hit && b.id === id) hit = b;
  });
  return hit;
}

export function placeOf(layout: Layout, id: string): Place | null {
  let hit: Place | null = null;
  walk(layout, (b, place) => {
    if (!hit && b.id === id) hit = place;
  });
  return hit;
}

/** Whether `id` is `inside` or in it, at any depth. */
function within(layout: Layout, inside: string, id: string): boolean {
  if (inside === id) return true;
  const b = findBlock(layout, inside);
  if (!b) return false;
  const kids: Block[] = isContainer(b) ? b.nested : b.type === "conditional" ? b.branches.flatMap((x) => x.nested) : [];
  return kids.some((k) => within(layout, k.id, id));
}

/** An id no block of the layout has. */
export function freeBlockId(layout: Layout, base: string): string {
  const taken = new Set<string>();
  walk(layout, (b) => taken.add(b.id));
  const root = base.replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "block";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

/** A new block of a type, with what it needs to show something. */
export function newBlock(type: BlockType, id: string): Block {
  const base = { id, properties: [] as string[] };
  switch (type) {
    case "heading":
      return { ...base, type, properties: ["name"], size: 1 };
    case "subheading":
      return { ...base, type, properties: ["type"], separator: ", " };
    case "property":
      return { ...base, type, properties: ["key"], hideWhenEmpty: true };
    case "table":
      return { ...base, type, properties: ["stats"], headers: [], modifier: { kind: "none" }, hideWhenEmpty: true };
    case "saves":
      return { ...base, type, properties: ["saves"], hideWhenEmpty: true };
    case "traits":
      return { ...base, type, properties: ["traits"], hideWhenEmpty: true };
    case "text":
      return { ...base, type, properties: ["description"], hideWhenEmpty: true };
    case "image":
      return { ...base, type, properties: ["image"], hideWhenEmpty: true };
    case "group":
    case "inline":
      return { ...base, type, nested: [] };
    case "collapse":
      return { ...base, type, nested: [], open: false };
    case "conditional":
      return { ...base, type, branches: [{ when: { op: "has", key: "key" }, nested: [] }, { nested: [] }] };
    case "tracker":
      return { ...base, type, properties: ["current", "max"], current: "current", max: "max", style: "boxes", hideWhenEmpty: true };
    case "roll":
      return { ...base, type, inputs: {} };
  }
}

/** The layout with `block` put at `place` (an index past the end puts it
 *  last). Null when the slot is no container. */
export function insertAt(layout: Layout, place: Place, block: Block): Layout | null {
  const next = clone(layout);
  const list = slotList(next, place.slot);
  if (!list) return null;
  list.splice(Math.max(0, Math.min(place.index, list.length)), 0, clone(block));
  return next;
}

/** The layout without the block `id` (and what it held). */
export function removeBlock(layout: Layout, id: string): Layout | null {
  const at = placeOf(layout, id);
  if (!at) return null;
  const next = clone(layout);
  slotList(next, at.slot)!.splice(at.index, 1);
  return next;
}

/** The block `id` moved to `to` — a slot and an index in it as it is
 *  before the move. Refused into itself or into a block it holds. */
export function moveTo(layout: Layout, id: string, to: Place): Layout | null {
  const from = placeOf(layout, id);
  if (!from) return null;
  if (to.slot.parent !== null && within(layout, id, to.slot.parent)) return null;
  const next = clone(layout);
  const src = slotList(next, from.slot)!;
  const [b] = src.splice(from.index, 1);
  const dst = slotList(next, to.slot);
  if (!dst || !b) return null;
  const same = from.slot.parent === to.slot.parent && from.slot.branch === to.slot.branch;
  const index = same && to.index > from.index ? to.index - 1 : to.index;
  dst.splice(Math.max(0, Math.min(index, dst.length)), 0, b);
  return next;
}

/** One step up (-1) or down (+1) among its siblings; at the edge, out of
 *  its container to beside it. */
export function moveBy(layout: Layout, id: string, delta: -1 | 1): Layout | null {
  const at = placeOf(layout, id);
  if (!at) return null;
  const list = slotList(layout, at.slot)!;
  const index = at.index + delta;
  if (index >= 0 && index < list.length) return moveTo(layout, id, { slot: at.slot, index: delta > 0 ? index + 1 : index });
  return delta < 0 ? outdent(layout, id, "before") : outdent(layout, id, "after");
}

/** Into the container just before it, at its end (Alt+→); a conditional
 *  takes it into its first branch. */
export function indent(layout: Layout, id: string): Layout | null {
  const at = placeOf(layout, id);
  if (!at || at.index === 0) return null;
  const prev = slotList(layout, at.slot)![at.index - 1]!;
  if (isContainer(prev)) return moveTo(layout, id, { slot: { parent: prev.id }, index: prev.nested.length });
  if (prev.type === "conditional" && prev.branches.length > 0) return moveTo(layout, id, { slot: { parent: prev.id, branch: 0 }, index: prev.branches[0]!.nested.length });
  return null;
}

/** Out of its container, to just after it (Alt+←), or before it. */
export function outdent(layout: Layout, id: string, side: "before" | "after" = "after"): Layout | null {
  const at = placeOf(layout, id);
  if (!at || at.slot.parent === null) return null;
  const owner = placeOf(layout, at.slot.parent);
  if (!owner) return null;
  return moveTo(layout, id, { slot: owner.slot, index: side === "after" ? owner.index + 1 : owner.index });
}

/** A copy of the block (new ids throughout) right after it. */
export function duplicate(layout: Layout, id: string): { layout: Layout; id: string } | null {
  const at = placeOf(layout, id);
  const b = findBlock(layout, id);
  if (!at || !b) return null;
  const copy = clone(b);
  const taken = new Set<string>();
  walk(layout, (x) => taken.add(x.id));
  const renumber = (x: Block) => {
    const root = x.id.replace(/-\d+$/, "") || "block";
    let n = 2;
    while (taken.has(`${root}-${n}`)) n++;
    x.id = `${root}-${n}`;
    taken.add(x.id);
    if (isContainer(x)) x.nested.forEach(renumber);
    if (x.type === "conditional") x.branches.forEach((br) => br.nested.forEach(renumber));
  };
  renumber(copy);
  const next = insertAt(layout, { slot: at.slot, index: at.index + 1 }, copy);
  return next ? { layout: next, id: copy.id } : null;
}

/** The block `id` with `patch` merged over it (a field set to undefined
 *  is removed). Its id and type are its own. */
export function updateBlock(layout: Layout, id: string, patch: Record<string, unknown>): Layout | null {
  const at = placeOf(layout, id);
  if (!at) return null;
  const next = clone(layout);
  const list = slotList(next, at.slot)!;
  const merged: Record<string, unknown> = { ...(list[at.index] as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id" || k === "type") continue;
    if (v === undefined) delete merged[k];
    else merged[k] = clone(v);
  }
  list[at.index] = merged as unknown as Block;
  return next;
}

/** The layout with its own fields (not its blocks) changed. */
export function updateLayout(layout: Layout, patch: Partial<Omit<Layout, "blocks">>): Layout {
  const next = clone(layout);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
    else (next as unknown as Record<string, unknown>)[k] = clone(v);
  }
  return next;
}

/** A layout as compared for "changed": its JSON, keys in a fixed order. */
export function fingerprint(layout: Layout): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(sort(layout));
}

/** One editing session: the layout as it is now, the steps to undo and to
 *  redo, and what was saved last. */
export class Session {
  layout: Layout;
  private past: { layout: Layout; key: string | null; at: number }[] = [];
  private future: Layout[] = [];
  private saved: string;
  /** The last step's key and when: typing in the same field within this
   *  long is the same step. */
  private last: { key: string | null; at: number } = { key: null, at: 0 };
  static readonly MERGE_MS = 1200;
  static readonly MOST = 300;

  constructor(layout: Layout) {
    this.layout = clone(layout);
    this.saved = fingerprint(this.layout);
  }

  /** Make `next` the layout, as one step — or as part of the last one when
   *  `key` names the same field changed a moment ago. */
  apply(next: Layout | null, key: string | null = null, now = Date.now()): boolean {
    if (!next || fingerprint(next) === fingerprint(this.layout)) return false;
    const merge = key !== null && key === this.last.key && now - this.last.at < Session.MERGE_MS && this.past.length > 0;
    if (!merge) {
      this.past.push({ layout: this.layout, key, at: now });
      if (this.past.length > Session.MOST) this.past.shift();
    }
    this.layout = next;
    this.future = [];
    this.last = { key, at: now };
    return true;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }
  undo(): boolean {
    const step = this.past.pop();
    if (!step) return false;
    this.future.push(this.layout);
    this.layout = step.layout;
    this.last = { key: null, at: 0 };
    return true;
  }
  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push({ layout: this.layout, key: null, at: 0 });
    this.layout = next;
    this.last = { key: null, at: 0 };
    return true;
  }
  /** Whether the layout differs from the one saved last. */
  dirty(): boolean {
    return fingerprint(this.layout) !== this.saved;
  }
  /** The layout as it is now was saved (or reloaded). */
  markSaved(layout: Layout = this.layout): void {
    this.layout = clone(layout);
    this.saved = fingerprint(this.layout);
    this.last = { key: null, at: 0 };
  }
  /** Start over from `layout` (another person's version): no history. */
  reset(layout: Layout): void {
    this.past = [];
    this.future = [];
    this.markSaved(layout);
  }
}
