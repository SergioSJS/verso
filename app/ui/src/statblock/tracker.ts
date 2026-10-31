// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A tracker (ADR 0099 item 5): a current value against a maximum — hit
// points, reserves, stress, a clock — as boxes or as a number. A click, or
// a key, is the person's action: it writes that one value into the block's
// YAML through the card's `write` (edit.ts), and the card says what
// happened or why nothing did. A value that does not read as a whole
// number within its bounds — two edits merged in a room, a typo — is shown
// as it is, with a badge and a one-click repair, never a silent guess.
//
// The boxes are a labelled group: one of them takes Tab, the arrow keys
// change the value, Home empties it, End fills it; every box is a button
// named for what it marks.

import type { Ctx } from "./blocks";
import { h } from "./h";
import type { TrackerBlock } from "./model";
import { numberOf, textOf, valueOf, wholeOf } from "./sheet";
import { S, word } from "./strings";

/** The most boxes drawn; past it, a number. */
const MAX_BOXES = 30;
const MAX_VALUE = 9999;

/** The tracker to focus once the card is drawn again after its write: in
 *  Live Preview a write redraws the card, and the keyboard keeps its place. */
let refocus: { slot: string; until: number } | null = null;

function focusLater(el: HTMLElement, slot: string): void {
  if (!refocus || refocus.slot !== slot || Date.now() > refocus.until) return;
  refocus = null;
  setTimeout(() => {
    if (el.isConnected) el.focus({ preventScroll: true });
  }, 0);
}

/** The tracker's numbers: the maximum, and the current value or why it
 *  does not read. */
export function readTracker(block: TrackerBlock, sheet: Record<string, unknown>): { max: number; current: number; raw: string | null; bad: boolean } {
  const maxRaw = typeof block.max === "number" ? block.max : numberOf(valueOf(sheet, block.max));
  const max = maxRaw !== null && maxRaw >= 0 ? Math.min(Math.floor(maxRaw), MAX_VALUE) : MAX_VALUE;
  const v = valueOf(sheet, block.current);
  if (v === undefined || v === null || v === "") return { max, current: 0, raw: null, bad: false };
  const n = wholeOf(v);
  if (n === null || n < 0 || n > max) {
    const near = numberOf(v);
    return { max, current: near === null ? 0 : Math.max(0, Math.min(max, Math.floor(near))), raw: typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v), bad: true };
  }
  return { max, current: n, raw: null, bad: false };
}

/** The tracker's label, its `{key}` placeholders filled from the sheet
 *  (`{reserva_1_nome}` reads "Vida"); a key with no value fills nothing. */
export function trackerLabel(block: TrackerBlock, sheet: Record<string, unknown>): string {
  const raw = word(block.label, block.current);
  if (!raw.includes("{")) return raw;
  return raw.replace(/\{([^{}\s]{1,80})\}/g, (_, k: string) => textOf(valueOf(sheet, k))).trim();
}

export function trackerNode(block: TrackerBlock, ctx: Ctx): HTMLElement {
  const label = trackerLabel(block, ctx.sheet) || block.current;
  const read = readTracker(block, ctx.sheet);
  const { max } = read;
  let current = read.current;
  const slot = `${ctx.opts.key ?? ""}|${block.id}`;
  const write = ctx.opts.write;
  const wrap = h("div", "statblock-tracker");
  const head = h("span", "statblock-prop-name", label);
  head.id = `sb-t-${Math.random().toString(36).slice(2, 10)}`;
  wrap.append(head, " ");
  const note = h("span", "statblock-tracker-note");
  note.setAttribute("role", "status");

  const set = (n: number, from: "click" | "key"): void => {
    const next = Math.max(0, Math.min(max, n));
    if (!write) return;
    if (next === current && !read.bad) return;
    const done = write(block.current, next);
    if (done.ok) {
      // The keyboard keeps its place in the group drawn again.
      const active = typeof document !== "undefined" ? document.activeElement : null;
      const had = active instanceof HTMLElement && group.contains(active) ? active.getAttribute("aria-label") : null;
      current = next;
      read.bad = false;
      paint();
      if (had !== null) {
        const same = Array.from(group.querySelectorAll<HTMLElement>("button")).find((b) => b.getAttribute("aria-label") === had && !(b as HTMLButtonElement).disabled);
        (boxes ? group.querySelector<HTMLElement>('[tabindex="0"]') : same ?? group.querySelector<HTMLElement>("button:not([disabled])"))?.focus();
      }
      const said = S.saved(label, next);
      note.textContent = "";
      ctx.say(said);
      if (from === "key" || from === "click") refocus = { slot, until: Date.now() + 3000 };
    } else {
      note.textContent = S.refusal[done.why];
      ctx.say(S.refusal[done.why]);
    }
  };

  const boxes = block.style === "boxes" && max <= MAX_BOXES;
  const group = h("span", boxes ? "statblock-boxes" : "statblock-counter");
  group.setAttribute("role", "group");
  group.setAttribute("aria-labelledby", head.id);
  const hint = h("span", "sr-only", S.trackerKeys);
  hint.id = `${head.id}-k`;
  if (write) group.setAttribute("aria-describedby", hint.id);
  group.addEventListener("keydown", (e) => {
    if (!write) return;
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (Object.hasOwn(step, e.key)) set(current + step[e.key]!, "key");
    else if (e.key === "Home") set(0, "key");
    else if (e.key === "End") set(max, "key");
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  const paint = (): void => {
    group.replaceChildren();
    if (boxes) {
      for (let i = 0; i < max; i++) {
        const filled = i < current;
        if (!write) {
          group.append(h("span", filled ? "statblock-box filled" : "statblock-box"));
          continue;
        }
        const b = h("button", filled ? "statblock-box filled" : "statblock-box");
        b.type = "button";
        b.setAttribute("aria-pressed", String(filled));
        b.setAttribute("aria-label", S.box(label, i + 1, max));
        // One box takes Tab: the last one marked, or the first.
        b.tabIndex = i === Math.max(0, current - 1) ? 0 : -1;
        // The last box marked, clicked, is unmarked.
        b.addEventListener("click", () => set(i + 1 === current ? i : i + 1, "click"));
        group.append(b);
      }
      if (!write) group.setAttribute("aria-label", S.tracker(label, current, max));
      group.append(h("span", "statblock-tracker-count", `${current}/${max}`));
    } else {
      const minus = h("button", "statblock-step", "−");
      minus.type = "button";
      minus.setAttribute("aria-label", S.less(label));
      minus.disabled = !write || current <= 0;
      minus.addEventListener("click", () => set(current - 1, "click"));
      const value = h("span", "statblock-tracker-count", `${current} / ${max === MAX_VALUE ? "—" : max}`);
      value.setAttribute("aria-live", "off");
      const plus = h("button", "statblock-step", "+");
      plus.type = "button";
      plus.setAttribute("aria-label", S.more1(label));
      plus.disabled = !write || current >= max;
      plus.addEventListener("click", () => set(current + 1, "click"));
      if (write) group.append(minus, value, plus);
      else group.append(value);
    }
  };
  paint();
  wrap.append(group, hint, note);

  if (read.bad) {
    const badge = h("span", "statblock-badge statblock-bad-value");
    badge.append(S.badValue(label, (read.raw ?? "").slice(0, 40), max));
    if (write) {
      const fix = h("button", "statblock-repair", S.repair(read.current));
      fix.type = "button";
      fix.addEventListener("click", () => {
        set(read.current, "click");
        if (!read.bad) badge.remove();
      });
      badge.append(" ", fix);
    }
    wrap.append(badge);
  }
  if (write) {
    const target = (): HTMLElement | null => group.querySelector<HTMLElement>('[tabindex="0"]') ?? group.querySelector<HTMLElement>("button:not([disabled])");
    const first = target();
    if (first) focusLater(first, slot);
  }
  return wrap;
}
