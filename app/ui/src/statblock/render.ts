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
import { h } from "./h";
import type { Appearance, Layout } from "./model";
import { readSheet, layoutNamed, STATBLOCK_MAX_CHARS, type Sheet, numberOf, textOf, valueOf } from "./sheet";
import { resolveLayout } from "./store";
import { S, word } from "./strings";

export type { CardOptions };
export { isStatblockCode, isStatblockFence } from "./fence";
export { STATBLOCK_MAX_CHARS };

/** The last sheet each card read, by its place: what it shows while its
 *  YAML does not read (ADR 0099 item 7). */
const lastGood = new Map<string, Sheet>();
const LAST_GOOD_MOST = 200;

function remember(key: string | undefined, sheet: Sheet): void {
  if (key === undefined) return;
  lastGood.delete(key);
  lastGood.set(key, sheet);
  if (lastGood.size > LAST_GOOD_MOST) lastGood.delete(lastGood.keys().next().value!);
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

function buildCard(sheet: Sheet, onToggleSource: (() => void) | undefined, opts: CardOptions, stale: boolean): HTMLElement {
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

  // The plugin's `columns:` in the block wins over the layout's.
  const columns = Math.max(1, Math.min(3, Math.floor(numberOf(valueOf(sheet, "columns")) ?? layout.columns)));
  const body = h("div", "statblock-body");
  if (columns > 1) {
    body.classList.add("statblock-columns");
    body.style.setProperty("--sb-columns", String(columns));
    body.style.setProperty("--sb-column-width", `${layout.columnWidth}px`);
  }
  body.append(...drawAll(ctx, layout.blocks));
  card.append(body);

  const note = (text: string, cls = ""): void => {
    const b = h("div", `statblock-badge${cls ? ` ${cls}` : ""}`, text);
    b.setAttribute("role", "status");
    card.append(b);
  };
  if (stale) note(S.invalidKept, "statblock-badge-stale");
  if (!known) note(S.unknownLayout(named ?? ""), "statblock-badge-layout");
  if (problems > 0) note(S.layoutProblems(problems));
  return card;
}

/** A ```statblock block's text as a card, or a badge saying why there is
 *  none with the text under it. Never throws. */
export function renderStatblock(text: string, onToggleSource?: () => void, opts: CardOptions = {}): HTMLElement {
  try {
    const read = readSheet(text);
    if (!read.ok) {
      if (read.why === "tooBig") return errorCard(S.tooBig(STATBLOCK_MAX_CHARS / 1024), text.slice(0, 4000));
      const kept = opts.key !== undefined ? lastGood.get(opts.key) : undefined;
      if (kept) return buildCard(kept, onToggleSource, opts, true);
      return errorCard(read.why === "notMap" ? S.notMap : S.invalid, text);
    }
    remember(opts.key, read.sheet);
    return buildCard(read.sheet, onToggleSource, opts, false);
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
