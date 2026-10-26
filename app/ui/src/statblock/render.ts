// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A ```statblock block drawn as a card (ADR 0099): its YAML read into a
// sheet, the layout it names resolved, and the layout's blocks drawn — a
// book's statblock, its colours the app's own tokens (light and dark)
// unless the layout names others, in one to three columns. Nothing a block
// holds can stop the note from drawing (item 7): a block past 256 KB is not
// parsed and says so; YAML that does not read keeps the last card that did,
// with a badge; and whatever fails comes back as a badge with the source.

import { icon } from "../icons";
import { type CardOptions, type Ctx, drawAll } from "./blocks";
import { lookupFor, onBestiaryChange } from "./bestiary";
import { beginDiceBudget, endDiceBudget } from "./dice";
import { h } from "./h";
import { compose, inherits, type Problem } from "./inherit";
import type { Appearance, Block, Layout } from "./model";
import { readSheet, layoutNamed, STATBLOCK_MAX_CHARS, type Sheet, numberOf, textOf, valueOf } from "./sheet";
import { resolveLayout } from "./store";
import { S, word } from "./strings";

export type { CardOptions };
export { isStatblockCode, isStatblockFence } from "./fence";
export { STATBLOCK_MAX_CHARS };

/** The last sheet each card read, by its place and its own identity: what it
 *  shows while its YAML does not read (ADR 0099 item 7). The identity is the
 *  block's `layout:` and `name:` lines, read loosely from the text (so it
 *  works while the YAML around them is broken); an ordinal would shift when
 *  a statblock is inserted above. */
const lastGood = new Map<string, Sheet>();
const LAST_GOOD_MOST = 200;

function remember(key: string | undefined, sheet: Sheet): void {
  if (key === undefined) return;
  lastGood.delete(key);
  lastGood.set(key, sheet);
  if (lastGood.size > LAST_GOOD_MOST) lastGood.delete(lastGood.keys().next().value!);
}

/** `key` (the note) with the block's top-level `layout:` and `name:` lines. */
function identityOf(key: string | undefined, text: string): string | undefined {
  if (key === undefined) return undefined;
  const line = (k: string) => new RegExp(`^${k}:[ \\t]*(.*)$`, "im").exec(text)?.[1]?.trim().slice(0, 200) ?? "";
  return `${key}\0${line("layout")}\0${line("name")}`;
}

function errorCard(message: string, source: string): HTMLElement {
  const card = h("div", "statblock-card statblock-error");
  const badge = h("div", "statblock-badge", message);
  badge.setAttribute("role", "status");
  card.append(badge, h("pre", "statblock-error-source", source));
  return card;
}

const FONT_VAR: Readonly<Record<string, string>> = { display: "var(--display)", book: "var(--book)", ui: "var(--ui)", mono: "var(--mono)" };

/** The layout's appearance as the card's custom properties: each colour a
 *  checked hex for light and for dark (`light-dark()`), the app's token
 *  where the layout names none; each font one of the app's. */
function dress(card: HTMLElement, a: Appearance): void {
  const pairs: [keyof NonNullable<Appearance["light"]>, string, string][] = [
    ["accent", "--sb-accent", "var(--seal)"],
    ["rule", "--sb-rule", "var(--seal)"],
    ["background", "--sb-background", "var(--paper)"],
    ["text", "--sb-text", "var(--ink)"],
    ["bar", "--sb-bar", "var(--brass)"],
  ];
  for (const [token, prop, fallback] of pairs) {
    const light = a.light?.[token];
    const dark = a.dark?.[token];
    if (light || dark) card.style.setProperty(prop, `light-dark(${light ?? fallback}, ${dark ?? fallback})`);
  }
  if (a.headingFont) card.style.setProperty("--sb-heading-font", FONT_VAR[a.headingFont] ?? "var(--display)");
  if (a.bodyFont) card.style.setProperty("--sb-body-font", FONT_VAR[a.bodyFont] ?? "var(--book)");
}

let region: HTMLElement | null = null;
/** Said politely to a screen reader, from a live region of the page's. */
function sayAloud(text: string): void {
  if (typeof document === "undefined") return;
  if (!region || !region.isConnected) {
    region = h("div", "sr-only statblock-said");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  region.textContent = "";
  const r = region;
  setTimeout(() => (r.textContent = text), 30);
}

/** The keys the layout draws as traits lists (what inheritance merges by
 *  name), for the sheet as its bases left it. */
function traitKeysOf(merged: Sheet, opts: CardOptions): Set<string> {
  const layout = opts.layout ?? resolveLayout(layoutNamed(merged)).stored.layout;
  const keys = new Set<string>();
  const walk = (blocks: readonly Block[], depth: number): void => {
    if (depth > 12) return;
    for (const b of blocks) {
      if (b.type === "traits") for (const k of b.properties) keys.add(k);
      if ("nested" in b) walk(b.nested, depth + 1);
      if ("branches" in b) for (const br of b.branches) walk(br.nested, depth + 1);
    }
  };
  walk(layout.blocks, 0);
  return keys;
}

function problemText(p: Problem): string {
  return p.kind === "missing" ? S.baseMissing(p.ref) : p.kind === "cycle" ? S.baseCycle(p.ref) : p.kind === "depth" ? S.baseDepth(p.ref) : S.basePending(p.ref);
}

function buildCard(own: Sheet, onToggleSource: (() => void) | undefined, opts: CardOptions, stale: boolean, sourceText: string): HTMLElement {
  // `monster:` and `extends:` (ADR 0099 item 1): the sheet drawn is the
  // block's keys over its bases', read-only — nothing is written to a base.
  let sheet = own;
  let bases: { name: string; path: string }[] = [];
  let baseProblems: Problem[] = [];
  if (inherits(own)) {
    const c = compose(own, lookupFor(opts.source), (merged) => traitKeysOf(merged, opts), { path: opts.source ?? "", name: textOf(valueOf(own, "name")).trim() });
    sheet = c.sheet;
    bases = c.bases;
    baseProblems = c.problems;
  }
  const named = layoutNamed(sheet);
  let layout: Layout;
  let known = true;
  let problems = 0;
  if (opts.layout) layout = opts.layout;
  else {
    const r = resolveLayout(named);
    layout = r.stored.layout;
    known = r.known;
    problems = r.stored.problems.length;
  }
  const numbers: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const k of Object.keys(sheet).slice(0, 500)) {
    const n = numberOf(sheet[k]);
    if (n !== null) numbers[k] = n;
  }
  const card = h("div", "statblock-card");
  card.dataset["layout"] = layout.id;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", textOf(valueOf(sheet, "name")).slice(0, 200) || S.card);
  dress(card, layout.appearance);
  const ctx: Ctx = { sheet, layout, opts, rules: layout.diceRules, say: sayAloud, numbers };

  const tools = h("div", "statblock-tools");
  const badge = h("button", "statblock-layout-badge");
  badge.type = "button";
  const layoutName = word(layout.name, layout.id);
  badge.title = S.layoutBadge(layoutName);
  badge.setAttribute("aria-label", S.layoutBadge(layoutName));
  badge.append(h("span", "", layoutName));
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    if (opts.onLayout) opts.onLayout();
    else window.dispatchEvent(new CustomEvent("verso:open-statblock-settings"));
  });
  tools.append(badge);
  // "Edit this layout": the editor, its card drawn from this block.
  const edit = h("button", "statblock-edit-layout");
  edit.type = "button";
  edit.title = S.page.editLayout;
  edit.setAttribute("aria-label", `${S.page.editLayout}: ${layoutName}`);
  edit.append(icon("edit"));
  edit.addEventListener("click", (e) => {
    e.stopPropagation();
    if (opts.onEditLayout) opts.onEditLayout(layout.id, sourceText);
    else window.dispatchEvent(new CustomEvent("verso:edit-statblock-layout", { detail: { id: layout.id, text: sourceText, name: textOf(valueOf(sheet, "name")) } }));
  });
  if (!opts.layout) tools.append(edit);
  if (onToggleSource) {
    const toggle = h("button", "statblock-toggle-btn");
    toggle.type = "button";
    toggle.title = S.toggleTitle;
    toggle.setAttribute("aria-label", S.viewSource);
    toggle.append(icon("code"));
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleSource();
    });
    tools.append(toggle);
  }
  card.append(tools);
  if (bases.length > 0) {
    const line = h("div", "statblock-based");
    bases.forEach((b, i) => {
      const a = h("a", "wikilink statblock-based-link", S.basedOn(b.name));
      a.dataset["target"] = b.path;
      a.tabIndex = 0;
      a.setAttribute("role", "link");
      a.title = S.basedOnLink(b.name);
      a.setAttribute("aria-label", S.basedOnLink(b.name));
      a.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          a.click();
        }
      });
      if (i > 0) line.append(", ");
      line.append(a);
    });
    card.append(line);
  }

  // The plugin's `columns:` in the block wins over the layout's.
  const columns = Math.max(1, Math.min(3, Math.floor(numberOf(valueOf(sheet, "columns")) ?? layout.columns)));
  const body = h("div", "statblock-body");
  if (columns > 1) {
    body.classList.add("statblock-columns");
    body.style.setProperty("--sb-columns", String(columns));
    body.style.setProperty("--sb-column-width", `${layout.columnWidth}px`);
  }
  beginDiceBudget();
  let slow = false;
  try {
    body.append(...drawAll(ctx, layout.blocks));
  } finally {
    slow = endDiceBudget();
  }
  card.append(body);

  const note = (text: string, cls = ""): void => {
    const b = h("div", `statblock-badge${cls ? ` ${cls}` : ""}`, text);
    b.setAttribute("role", "status");
    card.append(b);
  };
  // A base still being read is not a problem: the card draws what it has and again when it arrives.
  for (const p of baseProblems) if (p.kind !== "pending") note(problemText(p), "statblock-badge-base");
  if (stale) note(S.invalidKept, "statblock-badge-stale");
  if (!known) note(S.unknownLayout(named ?? ""), "statblock-badge-layout");
  if (problems > 0) note(S.layoutProblems(problems));
  if (slow) note(S.diceSlow);
  return card;
}

/** A ```statblock block's text as a card, or a badge saying why there is
 *  none with the text under it. Never throws. */
export function renderStatblock(text: string, onToggleSource?: () => void, opts: CardOptions = {}): HTMLElement {
  const card = renderOnce(text, onToggleSource, opts);
  try {
    const read = readSheet(text);
    // A card that inherits is drawn again, in place, when a base is read or
    // changes (the base's note was edited, or arrived from another device).
    if (read.ok && inherits(read.sheet)) {
      const off = onBestiaryChange(() => {
        if (!card.isConnected) return off();
        const next = renderOnce(text, onToggleSource, opts);
        card.className = next.className;
        for (const a of Array.from(next.attributes)) if (a.name !== "hidden") card.setAttribute(a.name, a.value);
        card.replaceChildren(...Array.from(next.childNodes));
      });
    }
  } catch {
    // The card drawn stays as it is.
  }
  return card;
}

function renderOnce(text: string, onToggleSource: (() => void) | undefined, opts: CardOptions): HTMLElement {
  try {
    const read = readSheet(text);
    const id = identityOf(opts.key, text);
    if (!read.ok) {
      if (read.why === "tooBig") return errorCard(S.tooBig(STATBLOCK_MAX_CHARS / 1024), text.slice(0, 4000));
      const kept = id !== undefined ? lastGood.get(id) : undefined;
      if (kept) return buildCard(kept, onToggleSource, opts, true, text);
      return errorCard(read.why === "notMap" ? S.notMap : S.invalid, text);
    }
    remember(id, read.sheet);
    return buildCard(read.sheet, onToggleSource, opts, false, text);
  } catch {
    return errorCard(S.failed, text.slice(0, STATBLOCK_MAX_CHARS));
  }
}

/** The fence in the reading view: the card, and the source it reads from,
 *  each with the button that brings the other back. */
export function renderStatblockHost(text: string, opts: CardOptions = {}): HTMLElement {
  const host = h("div", "statblock-host");
  const source = h("pre", "statblock-source");
  source.hidden = true;
  source.append(h("code", "", text));
  const back = h("button", "statblock-toggle-btn statblock-back-btn");
  back.type = "button";
  back.title = S.toggleTitle;
  back.setAttribute("aria-label", S.viewCard);
  back.append(icon("note"));
  const toggle = () => {
    const showSource = !source.hidden;
    source.hidden = showSource;
    card.hidden = !showSource;
    (showSource ? toggleFocus() : back).focus();
  };
  const card = renderStatblock(text, toggle, opts);
  const toggleFocus = (): HTMLElement => card.querySelector<HTMLElement>(".statblock-toggle-btn") ?? card;
  back.addEventListener("click", toggle);
  source.prepend(back);
  host.append(card, source);
  return host;
}
