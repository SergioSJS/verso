// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { pictureAddress } from "../images";
import { icon } from "../icons";
import { pictureNode } from "../infobox";
import { typedText } from "../strings";
import { h } from "./h";
import { type LayoutBlock, type StatblockLayout, defaultBlocks, resolveLayout, safeTheme } from "./layouts";
import { STATBLOCK_MAX_CHARS, formatModifier, parseStatblock } from "./parser";
import { S } from "./strings";
import type { StatblockData, StatblockSectionItem } from "./types";

/** What a card is drawn with, beyond the data. */
export interface CardOptions {
  /** Draw with this layout instead of the one the data names (the
   *  builder's preview of the template being edited). */
  layout?: StatblockLayout;
  /** The note the card is in: a path on the card (an image block) is read
   *  from the folder as that note names it. */
  source?: string;
}

const divider = () => h("div", "statblock-divider");

/** Text is scanned for dice up to this length; past it, it is shown plain. */
const MAX_DICE_SCAN = 20_000;
const DICE = /\b(\d{1,3}d\d{1,4}(?:\s{0,3}[+-]\s{0,3}\d{1,5})?)\b/gi;

/** Convert dice patterns (e.g. 1d20+5, 2d6+3) into buttons that roll them. */
function renderTextWithDice(text: string): HTMLElement {
  const span = h("span", "statblock-text");
  if (text.length > MAX_DICE_SCAN) {
    span.append(text);
    return span;
  }
  let lastIdx = 0;
  for (const match of text.matchAll(DICE)) {
    if (match.index > lastIdx) span.append(text.slice(lastIdx, match.index));
    const notation = match[1]!.replace(/\s+/g, "");
    // A real button: Enter and Space roll it, Tab reaches it.
    const roll = h("button", "statblock-dice-badge", match[1]!);
    roll.type = "button";
    roll.title = S.roll(notation);
    roll.setAttribute("aria-label", S.rollLabel(notation));
    roll.addEventListener("click", (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("verso:roll-dice", { detail: { notation } }));
    });
    span.append(roll);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) span.append(text.slice(lastIdx));
  return span;
}

function renderSectionItems(title: string, items: StatblockSectionItem[]): HTMLElement {
  const section = h("div", "statblock-section");
  section.append(h("h4", "statblock-section-heading", title));

  for (const item of items) {
    const row = h("div", "statblock-item-row");
    if (item.name) {
      row.append(h("strong", "statblock-item-name", `${item.name}. `));
      if (item.desc) row.append(renderTextWithDice(item.desc));
    } else if (item.desc) {
      row.classList.add("statblock-item-bullet");
      row.append("• ", renderTextWithDice(item.desc));
    }
    section.append(row);
  }

  return section;
}

/** A word as a layout compares it: lower case, no accents, `_` and `-` as
 *  spaces. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/** The standard sections of a card, the names a layout block may give them
 *  (exact, normalized), and where their items are. */
const GROUPS: { id: string; names: string[]; items: (d: StatblockData) => StatblockSectionItem[] | undefined; title: () => string }[] = [
  { id: "actions", names: ["actions", "acoes", "ataques", "ataque", "attacks"], items: (d) => d.actions, title: () => S.section.actions },
  { id: "bonus_actions", names: ["bonus actions", "acoes bonus", "bonus", "acao bonus"], items: (d) => d.bonus_actions, title: () => S.section.bonus },
  { id: "reactions", names: ["reactions", "reacoes", "reaction", "reacao"], items: (d) => d.reactions, title: () => S.section.reactions },
  { id: "legendary_actions", names: ["legendary actions", "acoes lendarias", "legendary", "lendarias"], items: (d) => d.legendary_actions, title: () => S.section.legendary },
  { id: "mythic_actions", names: ["mythic actions", "acoes miticas", "mythic", "miticas"], items: (d) => d.mythic_actions, title: () => S.section.mythic },
  { id: "traits", names: ["traits", "habilidades", "caracteristicas", "passivas", "trait", "habilidade"], items: (d) => d.traits, title: () => S.section.traits },
];

/** The order the sections no block placed follow the card. */
const REST_ORDER = ["traits", "actions", "bonus_actions", "reactions", "legendary_actions", "mythic_actions"];

/** The text fields of a card a property block may name. */
const FIELDS: { names: string[]; label: () => string; get: (d: StatblockData) => string | undefined }[] = [
  { names: ["saves", "testes resistencia"], label: () => S.prop.saves, get: (d) => d.saves },
  { names: ["skills", "pericias"], label: () => S.prop.skills, get: (d) => d.skills },
  { names: ["damage vulnerabilities", "vulnerabilidades"], label: () => S.prop.vulnerabilities, get: (d) => d.damage_vulnerabilities },
  { names: ["damage resistances", "resistencias"], label: () => S.prop.resistances, get: (d) => d.damage_resistances },
  { names: ["damage immunities", "imunidades"], label: () => S.prop.immunities, get: (d) => d.damage_immunities },
  { names: ["condition immunities", "imunidade condicao"], label: () => S.prop.conditionImmunities, get: (d) => d.condition_immunities },
  { names: ["senses", "sentidos"], label: () => S.prop.senses, get: (d) => d.senses },
  { names: ["languages", "idiomas"], label: () => S.prop.languages, get: (d) => d.languages },
  { names: ["speed", "deslocamento"], label: () => S.prop.speed, get: (d) => d.speed },
];

const IMAGE_KEYS = ["image", "imagem", "token", "foto"];

const titleOf = (k: string): string => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shown = (v: unknown): string => (typeof v === "object" ? JSON.stringify(v) : String(v));
const own = (o: object | undefined, k: string): unknown => (o && Object.hasOwn(o, k) ? (o as Record<string, unknown>)[k] : undefined);

/** What an `image:` value names, as the picture helper reads it: a folder
 *  path or a web address; `![[a.png]]` and `![alt](a.png)` unwrapped. */
export function imageTarget(value: string): string {
  const v = value.trim();
  if (v.startsWith("![[")) return v.slice(1);
  const md = /^!\[[^\]]*\]\(([^)\s]+)/.exec(v);
  return md ? md[1]!.trim() : v;
}

/** The image of a card, by the helper the properties panel's pictures use
 *  (ADR 0086 item 1): a folder path is asked of the core, which confines it
 *  to the open folder; a web address loads only from an origin the person
 *  approved, with remote content on. Nothing else ever becomes an `src`. */
function renderImage(value: string, name: string, source?: string): HTMLElement {
  const wrap = h("div", "statblock-image-wrapper");
  const node = pictureNode(
    imageTarget(value),
    { strings: typedText.picture, resolve: source === undefined ? async () => null : (target) => pictureAddress(source, target), title: name, status: () => {} },
    "statblock-image",
  );
  if (node) wrap.append(node);
  return wrap;
}

/** Whether any of `names` is among the block's properties. */
const blockNames = (block: LayoutBlock): Set<string> => new Set(block.properties.map(norm));

/** Render a StatblockData card into an HTMLElement (ADR 0099). Never
 *  throws: a card that cannot be drawn comes back as a badge with the
 *  source under it. */
export function renderStatblockCard(data: StatblockData, onToggleSource?: () => void, opts: CardOptions = {}): HTMLElement {
  try {
    return buildCard(data, onToggleSource, opts);
  } catch {
    return errorCard(S.failed, data.rawSource);
  }
}

function errorCard(message: string, source: string): HTMLElement {
  const card = h("div", "statblock-card statblock-error");
  const badge = h("div", "statblock-badge", message);
  badge.setAttribute("role", "status");
  card.append(badge, h("pre", "statblock-error-source", source));
  return card;
}

function buildCard(data: StatblockData, onToggleSource: (() => void) | undefined, opts: CardOptions): HTMLElement {
  const card = h("div", "statblock-card");
  const resolved = opts.layout ? { layout: opts.layout, known: true } : resolveLayout(data.layout);
  const layout = resolved.layout;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", data.name);

  card.classList.add(`statblock-theme-${safeTheme(layout.theme)}`);
  if (layout.id) card.classList.add(`statblock-layout-${layout.id.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`);

  // Sections and properties already drawn by a block
  const renderedSections = new Set<string>();
  const renderedProperties = new Set<string>();
  let hasRenderedHeading = false;
  let hasRenderedImage = false;

  const blocksToRender = layout.blocks && layout.blocks.length > 0 ? layout.blocks : defaultBlocks();
  const hasSubheadingBlock = blocksToRender.some((b) => b.type === "subheading");
  const drawGroup = (id: string, title: string | undefined, items: StatblockSectionItem[] | undefined): void => {
    if (!items || items.length === 0 || renderedSections.has(id)) return;
    renderedSections.add(id);
    card.append(renderSectionItems(title ?? "", items));
  };

  for (const block of blocksToRender) {
    switch (block.type) {
      case "heading": {
        hasRenderedHeading = true;
        const topBar = h("div", "statblock-header");
        const titles = h("div", "statblock-titles");
        titles.append(h("h3", "statblock-name", data.name));
        if (!hasSubheadingBlock && data.subtitle) titles.append(h("div", "statblock-subtitle", data.subtitle));
        topBar.append(titles);

        const topActions = h("div", "statblock-header-actions");
        const layoutBadge = h("button", "statblock-layout-badge");
        layoutBadge.type = "button";
        layoutBadge.title = S.template(layout.name, layout.system);
        layoutBadge.append(icon("dice"), h("span", "", layout.name));
        layoutBadge.addEventListener("click", (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent("verso:open-statblock-settings"));
        });
        topActions.append(layoutBadge);

        if (onToggleSource) {
          const toggleBtn = h("button", "statblock-toggle-btn");
          toggleBtn.type = "button";
          toggleBtn.title = S.toggleTitle;
          toggleBtn.setAttribute("aria-label", S.viewSource);
          toggleBtn.append(icon("code"));
          toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            onToggleSource();
          });
          topActions.append(toggleBtn);
        }
        topBar.append(topActions);
        card.append(topBar);
        break;
      }

      case "subheading": {
        if (data.subtitle) card.append(h("div", "statblock-subtitle", data.subtitle));
        break;
      }

      case "divider": {
        card.append(divider());
        break;
      }

      case "vitals": {
        const vitalsEl = h("div", "statblock-vitals");

        if (data.vitals && data.vitals.length > 0) {
          for (const v of data.vitals) {
            const el = h("div", "statblock-vital-item");
            el.append(h("strong", "", `${v.label}: `));
            const valSpan = h("span", "", String(v.value));
            if (v.formula) {
              valSpan.append(" (", renderTextWithDice(v.formula), ")");
            } else if (v.note) {
              valSpan.append(` (${v.note})`);
            }
            el.append(valSpan);
            vitalsEl.append(el);
          }
        } else {
          const row = (label: string, value: string | number, formula?: string, note?: string) => {
            const el = h("div", "statblock-vital-item");
            const val = h("span", "", String(value));
            if (formula) val.append(" (", renderTextWithDice(formula), ")");
            else if (note) val.append(` (${note})`);
            el.append(h("strong", "", `${label}: `), val);
            vitalsEl.append(el);
          };
          if (data.ac !== undefined) row(S.vital.ac, data.ac, undefined, data.ac_note);
          if (data.hp !== undefined) row(S.vital.hp, data.hp, data.hp_formula);
          if (data.mp !== undefined) row(S.vital.mp, data.mp);
          if (data.speed) row(S.vital.speed, data.speed);
        }

        if (vitalsEl.childElementCount > 0) card.append(vitalsEl);
        break;
      }

      case "abilities":
      case "table": {
        if (!data.abilities || data.abilities.length === 0) break;
        const showMods = (ab: (typeof data.abilities)[number]): boolean => {
          if (ab.modifier === undefined || ab.modifier === null || ab.modifier === "") return false;
          return block.options?.["d20Modifiers"] === true || layout.theme === "classic" || ab.explicitModifier === true;
        };
        const modText = (ab: (typeof data.abilities)[number]): string => (typeof ab.modifier === "number" ? formatModifier(ab.modifier) : String(ab.modifier));
        // A table (ADR 0099 item 6): a header cell per ability, so a screen
        // reader says which ability each value belongs to.
        const table = h("table", "statblock-abilities");
        table.append(h("caption", "sr-only", block.title || S.abilitiesCaption));
        const head = h("tr", "statblock-ability-names");
        const scores = h("tr", "statblock-ability-scores");
        const mods = h("tr", "statblock-ability-mods");
        let anyMod = false;
        for (const ab of data.abilities) {
          const th = h("th", "statblock-ability-name");
          th.scope = "col";
          const label = h("abbr", "", ab.short || ab.name);
          label.title = ab.name;
          th.append(label);
          head.append(th);
          scores.append(h("td", "statblock-ability-score", String(ab.score)));
          const td = h("td", "statblock-ability-mod");
          if (showMods(ab)) {
            anyMod = true;
            td.append(h("span", "sr-only", `${S.modifierRow} `), modText(ab));
          }
          mods.append(td);
        }
        const thead = h("thead");
        thead.append(head);
        const tbody = h("tbody");
        tbody.append(scores);
        if (anyMod) tbody.append(mods);
        table.append(thead, tbody);
        const scroll = h("div", "statblock-abilities-scroll");
        scroll.append(table);
        card.append(scroll);
        break;
      }

      case "property":
      case "saves": {
        const propContainer = h("div", "statblock-secondary");
        const keys = block.type === "saves" ? ["saves", "testes_resistencia"] : block.properties;
        // A title names the row when the block names one key.
        const titled = block.title && keys.length === 1 ? block.title : undefined;

        const push = (label: string, value: string | number | undefined, extra?: string) => {
          if (value === undefined || value === "") return;
          const row = h("div", "statblock-attr-row");
          row.append(h("strong", "", `${label}: `), renderTextWithDice(String(value)));
          if (extra) row.append(h("span", "statblock-xp", extra));
          propContainer.append(row);
        };

        for (const rawK of keys) {
          const k = norm(rawK);
          renderedProperties.add(k);
          const field = FIELDS.find((f) => f.names.includes(k));
          if (field) {
            push(titled ?? field.label(), field.get(data));
          } else if (k === "cr" || k === "nd" || k === "desafio") {
            if (data.cr !== undefined) push(titled ?? S.prop.cr, data.cr, data.xp !== undefined ? ` (${S.xp(data.xp)})` : undefined);
          } else {
            const val = own(data.customFields, rawK.toLowerCase().trim());
            if (val !== undefined && val !== null) {
              renderedProperties.add(rawK.toLowerCase().trim());
              push(titled ?? titleOf(rawK), shown(val));
            }
          }
        }

        if (propContainer.childElementCount > 0) card.append(propContainer);
        break;
      }

      case "traits": {
        if (data.traits && data.traits.length > 0 && !renderedSections.has("traits")) {
          renderedSections.add("traits");
          card.append(renderSectionItems(block.title || S.section.traits, data.traits));
        }
        break;
      }

      case "section": {
        const names = blockNames(block);
        const titleKey = block.title ? norm(block.title) : "";
        // A section of the note's own (Armas, Ciberware…) the block names by its key.
        const custom = data.customSections?.find((sec) => !renderedSections.has(`custom:${sec.key ?? sec.title}`) && ((sec.key !== undefined && names.has(norm(sec.key))) || (titleKey !== "" && norm(sec.title) === titleKey)));
        if (custom) {
          renderedSections.add(`custom:${custom.key ?? custom.title}`);
          if (custom.items.length > 0) card.append(renderSectionItems(block.title || custom.title, custom.items));
          break;
        }
        const group = GROUPS.find((g) => g.names.some((n) => names.has(n)) && (g.items(data)?.length ?? 0) > 0 && !renderedSections.has(g.id));
        if (group) drawGroup(group.id, block.title || group.title(), group.items(data));
        break;
      }

      case "image": {
        let value: string | undefined;
        for (const k of IMAGE_KEYS) {
          const v = own(data.customFields, k);
          if (typeof v === "string" && v.trim()) {
            value = v;
            renderedProperties.add(k);
            break;
          }
        }
        if (value) {
          hasRenderedImage = true;
          card.append(renderImage(value, data.name, opts.source));
        }
        break;
      }

      case "text": {
        let content = block.text || (block.options?.["text"] as string | undefined) || block.fallback || "";
        if (!content && block.properties.length > 0) {
          for (const p of block.properties) {
            const val = own(data.customFields, p) ?? (isTextField(p) ? own(data, p) : undefined);
            if (val !== undefined && val !== null && val !== "") {
              content = shown(val);
              renderedProperties.add(p.toLowerCase());
              break;
            }
          }
        }
        if (content) {
          // {key}: a field of the card or of the note, as it holds it; a
          // key it does not hold stays as written.
          content = content.replace(/\{(\w+)\}/g, (whole, k: string) => {
            const v = own(data, k) ?? own(data.customFields, k.toLowerCase());
            return v !== undefined && v !== null && typeof v !== "object" ? String(v) : whole;
          });
          const textWrap = h("div", "statblock-text-block");
          if (block.title) textWrap.append(h("h4", "statblock-section-title", block.title));
          const bodyEl = h("div", "statblock-text-body");
          bodyEl.append(renderTextWithDice(content));
          textWrap.append(bodyEl);
          card.append(textWrap);
        }
        break;
      }
    }
  }

  // What no block drew is drawn after them: nothing the note says is lost.
  if (!hasRenderedHeading) {
    const topBar = h("div", "statblock-header");
    topBar.append(h("h3", "statblock-name", data.name));
    card.prepend(topBar);
  }

  const unrenderedSecondary = h("div", "statblock-secondary");
  const appendUnrendered = (propKey: string, label: string, val?: string | number) => {
    if (!val || renderedProperties.has(propKey)) return;
    const row = h("div", "statblock-attr-row");
    row.append(h("strong", "", `${label}: `), renderTextWithDice(String(val)));
    unrenderedSecondary.append(row);
  };
  for (const f of FIELDS) {
    if (f.names.some((n) => renderedProperties.has(n))) continue;
    // `speed` is among the vitals already.
    if (f.names[0] === "speed") continue;
    appendUnrendered(f.names[0]!, f.label(), f.get(data));
  }

  if (!renderedProperties.has("cr") && !renderedProperties.has("nd") && data.cr !== undefined) {
    const row = h("div", "statblock-attr-row");
    row.append(h("strong", "", `${S.prop.cr}: `), h("span", "", String(data.cr)));
    if (data.xp !== undefined) row.append(h("span", "statblock-xp", ` (${S.xp(data.xp)})`));
    unrenderedSecondary.append(row);
  }

  if (data.customFields) {
    for (const [key, val] of Object.entries(data.customFields)) {
      if (val === undefined || val === null || renderedProperties.has(key.toLowerCase())) continue;
      // An image the layout has no block for is shown as the field it is.
      if (IMAGE_KEYS.includes(key.toLowerCase()) && hasRenderedImage) continue;
      const row = h("div", "statblock-attr-row statblock-custom-field");
      row.append(h("strong", "", `${titleOf(key)}: `), renderTextWithDice(shown(val)));
      unrenderedSecondary.append(row);
    }
  }

  if (unrenderedSecondary.childElementCount > 0) card.append(unrenderedSecondary);

  const rest = (id: string, items?: StatblockSectionItem[], title?: string) => {
    if (items && items.length > 0 && !renderedSections.has(id)) {
      card.append(divider());
      renderedSections.add(id);
      card.append(renderSectionItems(title ?? "", items));
    }
  };
  for (const id of REST_ORDER) {
    const g = GROUPS.find((x) => x.id === id)!;
    rest(g.id, g.items(data), g.title());
  }

  for (const sec of data.customSections ?? []) {
    if (!renderedSections.has(`custom:${sec.key ?? sec.title}`) && sec.items.length > 0) {
      card.append(divider());
      card.append(renderSectionItems(sec.title, sec.items));
    }
  }

  if (data.truncated) card.append(h("div", "statblock-badge", S.truncated));
  if (!resolved.known) {
    const badge = h("div", "statblock-badge statblock-badge-layout", S.unknownLayout(data.layout ?? ""));
    badge.setAttribute("role", "status");
    card.append(badge);
  }
  return card;
}

/** The card's own text fields a `text` block's property may name. */
function isTextField(p: string): boolean {
  return ["name", "subtitle", "size", "type", "subtype", "alignment", "ac", "hp", "mp", "speed", "saves", "skills", "senses", "languages", "cr", "xp"].includes(p);
}

/** A ```statblock fence's text as a card: the card, or a badge saying why
 *  there is none (too large, not YAML or JSON) with the text under it. Never
 *  throws. */
export function renderStatblock(text: string, onToggleSource?: () => void, opts: CardOptions = {}): HTMLElement {
  try {
    if (text.length > STATBLOCK_MAX_CHARS) return errorCard(S.tooBig(STATBLOCK_MAX_CHARS / 1024), text);
    const data = parseStatblock(text);
    if (!data) return errorCard(S.invalid, text);
    return renderStatblockCard(data, onToggleSource, opts);
  } catch {
    return errorCard(S.failed, text);
  }
}

/** The fence in a page that shows both: the card, and the source it reads
 *  from, each with the button that brings the other back. For the reading
 *  view, where a fence's `<pre>` is replaced by this. */
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

/** Whether a fence's info string names a statblock: `statblock`, or
 *  `statblock-` and a suffix (one rule for both views). */
export function isStatblockFence(info: string): boolean {
  const word = info.trim().split(/\s/, 1)[0]?.toLowerCase() ?? "";
  return word === "statblock" || word.startsWith("statblock-");
}

/** Whether a rendered fence's `<code>` is a statblock: its `language-…`
 *  class is the info word, read with the same rule as the source's. */
export function isStatblockCode(code: Element): boolean {
  for (const c of Array.from(code.classList)) if (c.startsWith("language-") && isStatblockFence(c.slice("language-".length))) return true;
  return false;
}
