// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { h } from "../dom";
import { icon } from "../icons";
import { formatModifier } from "./parser";
import { getLayout } from "./layouts";
import type { StatblockData, StatblockSectionItem } from "./types";

const divider = () => h("div", "statblock-divider");

/** Convert dice patterns (e.g. 1d20+5, 2d6+3) into interactive roll buttons. */
function renderTextWithDice(text: string): HTMLElement {
  const span = h("span", "statblock-text");
  const diceRegex = /\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\b/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = diceRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      span.append(text.slice(lastIdx, match.index));
    }
    const notation = match[1]!.replace(/\s+/g, "");
    const rollBadge = h("span", "statblock-dice-badge", match[1]!);
    rollBadge.title = `Rolar ${notation} no Verso`;
    rollBadge.setAttribute("role", "button");
    rollBadge.setAttribute("tabindex", "0");
    rollBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("verso:roll-dice", { detail: { notation } }));
    });
    span.append(rollBadge);
    lastIdx = match.index + match[0]!.length;
  }

  if (lastIdx < text.length) {
    span.append(text.slice(lastIdx));
  }
  return span;
}

function renderSectionItems(title: string, items: StatblockSectionItem[]): HTMLElement {
  const section = h("div", "statblock-section");
  const heading = h("h4", "statblock-section-heading", title);
  section.append(heading);

  for (const item of items) {
    const row = h("div", "statblock-item-row");
    if (item.name) {
      const nameEl = h("strong", "statblock-item-name", `${item.name}. `);
      row.append(nameEl);
      if (item.desc) {
        row.append(renderTextWithDice(item.desc));
      }
    } else if (item.desc) {
      row.classList.add("statblock-item-bullet");
      row.append("• ", renderTextWithDice(item.desc));
    }
    section.append(row);
  }

  return section;
}

/** Render a StatblockData card into an HTMLElement (ADR 0099). */
export function renderStatblockCard(
  data: StatblockData,
  onToggleSource?: () => void
): HTMLElement {
  const card = h("div", "statblock-card");
  const layout = getLayout(data.layout);

  if (layout.theme) {
    card.classList.add(`statblock-theme-${layout.theme}`);
  }
  if (layout.id) {
    card.classList.add(`statblock-layout-${layout.id.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`);
  }

  // Set of sections and properties already rendered by explicit blocks
  const renderedSections = new Set<string>();
  const renderedProperties = new Set<string>();
  let hasRenderedHeading = false;
  let hasRenderedVitals = false;
  let hasRenderedAbilities = false;
  let hasRenderedTraits = false;

  const blocksToRender = layout.blocks && layout.blocks.length > 0 ? layout.blocks : [
    { id: "h", type: "heading" as const, properties: ["name", "nome"] },
    { id: "sub", type: "subheading" as const, properties: ["subtitle", "tipo"] },
    { id: "d1", type: "divider" as const, properties: [] },
    { id: "v", type: "vitals" as const, properties: ["pv", "hp", "ca", "defesa", "deslocamento"] },
    { id: "d2", type: "divider" as const, properties: [] },
    { id: "a", type: "abilities" as const, properties: ["stats", "atributos", "abilities"] },
    { id: "d3", type: "divider" as const, properties: [] },
    { id: "t", type: "traits" as const, properties: ["traits", "habilidades"] },
    { id: "sec", type: "section" as const, title: "Ações", properties: ["actions", "acoes"] },
  ];

  for (let i = 0; i < blocksToRender.length; i++) {
    const block = blocksToRender[i]!;

    switch (block.type) {
      case "heading": {
        hasRenderedHeading = true;
        const topBar = h("div", "statblock-header");
        const titles = h("div", "statblock-titles");
        const nameEl = h("h3", "statblock-name", data.name);
        titles.append(nameEl);

        const hasSubheadingBlock = blocksToRender.some((b) => b.type === "subheading");
        if (!hasSubheadingBlock && data.subtitle) {
          titles.append(h("div", "statblock-subtitle", data.subtitle));
        }
        topBar.append(titles);

        const topActions = h("div", "statblock-header-actions");
        const layoutBadge = h("button", "statblock-layout-badge");
        layoutBadge.type = "button";
        layoutBadge.title = `Template: ${layout.name} (${layout.system}). Clique para trocar ou configurar templates.`;
        layoutBadge.append(icon("dice"), h("span", "", layout.name));
        layoutBadge.addEventListener("click", (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent("verso:open-statblock-settings"));
        });
        topActions.append(layoutBadge);

        if (onToggleSource) {
          const toggleBtn = h("button", "statblock-toggle-btn");
          toggleBtn.type = "button";
          toggleBtn.title = "Alternar entre Ficha Visual e Código Fonte";
          toggleBtn.setAttribute("aria-label", "Ver código");
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
        if (data.subtitle) {
          card.append(h("div", "statblock-subtitle", data.subtitle));
        }
        break;
      }

      case "divider": {
        card.append(divider());
        break;
      }

      case "vitals": {
        hasRenderedVitals = true;
        const vitalsEl = h("div", "statblock-vitals");

        if (data.vitals && data.vitals.length > 0) {
          for (const v of data.vitals) {
            const el = h("div", "statblock-vital-item");
            el.append(h("strong", "", `${v.label}: `));
            const valSpan = h("span", "", String(v.value));
            if (v.formula) {
              valSpan.append(" (");
              valSpan.append(renderTextWithDice(v.formula));
              valSpan.append(")");
            } else if (v.note) {
              valSpan.append(` (${v.note})`);
            }
            el.append(valSpan);
            vitalsEl.append(el);
          }
        } else {
          if (data.ac !== undefined) {
            const acEl = h("div", "statblock-vital-item");
            const acLabel = h("strong", "", "Defesa / CA: ");
            const acVal = h("span", "", String(data.ac));
            if (data.ac_note) acVal.append(` (${data.ac_note})`);
            acEl.append(acLabel, acVal);
            vitalsEl.append(acEl);
          }
          if (data.hp !== undefined) {
            const hpEl = h("div", "statblock-vital-item");
            const hpLabel = h("strong", "", "Pontos de Vida (PV): ");
            const hpVal = h("span", "", String(data.hp));
            if (data.hp_formula) {
              hpVal.append(" (");
              hpVal.append(renderTextWithDice(data.hp_formula));
              hpVal.append(")");
            }
            hpEl.append(hpLabel, hpVal);
            vitalsEl.append(hpEl);
          }
          if (data.mp !== undefined) {
            const mpEl = h("div", "statblock-vital-item");
            const mpLabel = h("strong", "", "Pontos de Mana (PM): ");
            mpEl.append(mpLabel, h("span", "", String(data.mp)));
            vitalsEl.append(mpEl);
          }
          if (data.speed) {
            const spEl = h("div", "statblock-vital-item");
            const spLabel = h("strong", "", "Deslocamento: ");
            spEl.append(spLabel, h("span", "", data.speed));
            vitalsEl.append(spEl);
          }
        }

        if (vitalsEl.childElementCount > 0) {
          card.append(vitalsEl);
        }
        break;
      }

      case "abilities":
      case "table": {
        hasRenderedAbilities = true;
        if (data.abilities && data.abilities.length > 0) {
          const isD20Layout = block.options?.["d20Modifiers"] === true || layout.theme === "classic";
          const grid = h("div", "statblock-abilities");
          for (const ab of data.abilities) {
            const col = h("div", "statblock-ability-col");
            const name = h("div", "statblock-ability-name", ab.short || ab.name);
            const score = h("div", "statblock-ability-score", String(ab.score));
            col.append(name, score);
            if (ab.modifier !== undefined && ab.modifier !== null && ab.modifier !== "") {
              if (isD20Layout || ab.explicitModifier) {
                const modVal = typeof ab.modifier === "number" ? formatModifier(ab.modifier) : String(ab.modifier);
                const mod = h("div", "statblock-ability-mod", modVal);
                col.append(mod);
              }
            }
            grid.append(col);
          }
          card.append(grid);
        }
        break;
      }

      case "property":
      case "saves": {
        const propContainer = h("div", "statblock-secondary");
        const keys = block.type === "saves" ? ["saves", "testes_resistencia"] : block.properties;

        const checkAndAppend = (label: string, val?: string | number) => {
          if (!val) return;
          const row = h("div", "statblock-attr-row");
          row.append(h("strong", "", `${label}: `), renderTextWithDice(String(val)));
          propContainer.append(row);
        };

        for (const rawK of keys) {
          const k = rawK.toLowerCase().trim();
          renderedProperties.add(k);

          if (k === "saves" || k === "testes_resistencia") {
            checkAndAppend(block.title || "Testes de Resistência", data.saves);
          } else if (k === "skills" || k === "pericias" || k === "perícias") {
            checkAndAppend(block.title || "Perícias", data.skills);
          } else if (k === "damage_vulnerabilities" || k === "vulnerabilidades") {
            checkAndAppend(block.title || "Vulnerabilidades a Dano", data.damage_vulnerabilities);
          } else if (k === "damage_resistances" || k === "resistencias" || k === "resistências") {
            checkAndAppend(block.title || "Resistências a Dano", data.damage_resistances);
          } else if (k === "damage_immunities" || k === "imunidades") {
            checkAndAppend(block.title || "Imunidades a Dano", data.damage_immunities);
          } else if (k === "condition_immunities" || k === "imunidade_condicao") {
            checkAndAppend(block.title || "Imunidades a Condição", data.condition_immunities);
          } else if (k === "senses" || k === "sentidos") {
            checkAndAppend(block.title || "Sentidos", data.senses);
          } else if (k === "languages" || k === "idiomas") {
            checkAndAppend(block.title || "Idiomas", data.languages);
          } else if (k === "speed" || k === "deslocamento") {
            checkAndAppend(block.title || "Deslocamento", data.speed);
          } else if (k === "cr" || k === "nd" || k === "desafio") {
            if (data.cr !== undefined) {
              const row = h("div", "statblock-attr-row");
              row.append(h("strong", "", `${block.title || "Desafio (ND)"}: `), h("span", "", String(data.cr)));
              if (data.xp !== undefined) {
                row.append(h("span", "statblock-xp", ` (${data.xp} XP)`));
              }
              propContainer.append(row);
            }
          } else if (data.customFields && data.customFields[k] !== undefined) {
            const val = data.customFields[k];
            if (val !== undefined && val !== null) {
              const row = h("div", "statblock-attr-row statblock-custom-field");
              const labelText = block.title || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              const displayVal = typeof val === "object" ? JSON.stringify(val) : String(val);
              row.append(h("strong", "", `${labelText}: `), renderTextWithDice(displayVal));
              propContainer.append(row);
            }
          }
        }

        if (propContainer.childElementCount > 0) {
          card.append(propContainer);
        }
        break;
      }

      case "traits": {
        hasRenderedTraits = true;
        if (data.traits && data.traits.length > 0) {
          card.append(renderSectionItems(block.title || "Habilidades e Características", data.traits));
        }
        break;
      }

      case "section": {
        const titleLower = (block.title || "").toLowerCase();
        let itemsToRender: StatblockSectionItem[] | null = null;
        let matchedKey = "";

        const blockProps = block.properties.map((p) => p.toLowerCase());
        if (
          blockProps.some((p) => p.includes("acao") || p.includes("action") || p.includes("ataque")) ||
          titleLower.includes("ação") ||
          titleLower.includes("ações") ||
          titleLower.includes("ataques")
        ) {
          if (data.actions && data.actions.length > 0 && !renderedSections.has("actions")) {
            itemsToRender = data.actions;
            matchedKey = "actions";
          }
        } else if (blockProps.some((p) => p.includes("bonus")) || titleLower.includes("bônus")) {
          if (data.bonus_actions && data.bonus_actions.length > 0 && !renderedSections.has("bonus_actions")) {
            itemsToRender = data.bonus_actions;
            matchedKey = "bonus_actions";
          }
        } else if (blockProps.some((p) => p.includes("reac") || p.includes("reaç")) || titleLower.includes("reação") || titleLower.includes("reações")) {
          if (data.reactions && data.reactions.length > 0 && !renderedSections.has("reactions")) {
            itemsToRender = data.reactions;
            matchedKey = "reactions";
          }
        } else if (blockProps.some((p) => p.includes("legend") || p.includes("lendár")) || titleLower.includes("lendária")) {
          if (data.legendary_actions && data.legendary_actions.length > 0 && !renderedSections.has("legendary_actions")) {
            itemsToRender = data.legendary_actions;
            matchedKey = "legendary_actions";
          }
        } else if (blockProps.some((p) => p.includes("trait") || p.includes("habilidad")) || titleLower.includes("habilidade") || titleLower.includes("traço")) {
          if (data.traits && data.traits.length > 0 && !renderedSections.has("traits")) {
            itemsToRender = data.traits;
            matchedKey = "traits";
          }
        }

        if (!itemsToRender && data.customSections) {
          for (const sec of data.customSections) {
            if (renderedSections.has(sec.title)) continue;
            const secTitleLower = sec.title.toLowerCase();
            const matchesTitle = block.title && (secTitleLower.includes(titleLower) || titleLower.includes(secTitleLower));
            const matchesProp = blockProps.some((p) => secTitleLower.includes(p) || p.includes(secTitleLower.replace(/[^a-z0-9]/g, "")));
            if (matchesTitle || matchesProp) {
              itemsToRender = sec.items;
              matchedKey = sec.title;
              break;
            }
          }
        }

        if (itemsToRender && itemsToRender.length > 0) {
          renderedSections.add(matchedKey);
          card.append(renderSectionItems(block.title || matchedKey, itemsToRender));
        }
        break;
      }

      case "image": {
        const imgUrl = (data.customFields?.["image"] ?? data.customFields?.["imagem"] ?? data.customFields?.["token"]) as string | undefined;
        if (imgUrl) {
          const imgWrap = h("div", "statblock-image-wrapper");
          const img = h("img", "statblock-image") as HTMLImageElement;
          img.src = imgUrl;
          img.alt = data.name;
          imgWrap.append(img);
          card.append(imgWrap);
        }
        break;
      }

      case "text": {
        let content = block.text || (block.options?.["text"] as string | undefined) || block.fallback || "";
        if (!content && block.properties.length > 0) {
          for (const p of block.properties) {
            const val = data.customFields?.[p] || (data as any)[p];
            if (val) {
              content = typeof val === "object" ? JSON.stringify(val) : String(val);
              renderedProperties.add(p.toLowerCase());
              break;
            }
          }
        }
        if (content) {
          content = content.replace(/\{(\w+)\}/g, (_, k) => {
            const v = (data as any)[k] ?? data.customFields?.[k];
            return v !== undefined ? String(v) : `{${k}}`;
          });
          const textWrap = h("div", "statblock-text-block");
          if (block.title) {
            textWrap.append(h("h4", "statblock-section-title", block.title));
          }
          const bodyEl = h("div", "statblock-text-body");
          bodyEl.append(renderTextWithDice(content));
          textWrap.append(bodyEl);
          card.append(textWrap);
        }
        break;
      }
    }
  }

  // Fallback rendering for any sections or properties that weren't caught by blocks:
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
  appendUnrendered("saves", "Testes de Resistência", data.saves);
  appendUnrendered("skills", "Perícias", data.skills);
  appendUnrendered("damage_vulnerabilities", "Vulnerabilidades a Dano", data.damage_vulnerabilities);
  appendUnrendered("damage_resistances", "Resistências a Dano", data.damage_resistances);
  appendUnrendered("damage_immunities", "Imunidades a Dano", data.damage_immunities);
  appendUnrendered("condition_immunities", "Imunidades a Condição", data.condition_immunities);
  appendUnrendered("senses", "Sentidos", data.senses);
  appendUnrendered("languages", "Idiomas", data.languages);

  if (!renderedProperties.has("cr") && data.cr !== undefined) {
    const row = h("div", "statblock-attr-row");
    row.append(h("strong", "", "Desafio (ND): "), h("span", "", String(data.cr)));
    if (data.xp !== undefined) {
      row.append(h("span", "statblock-xp", ` (${data.xp} XP)`));
    }
    unrenderedSecondary.append(row);
  }

  if (data.customFields) {
    for (const [key, val] of Object.entries(data.customFields)) {
      if (val === undefined || val === null || renderedProperties.has(key.toLowerCase())) continue;
      if (["image", "imagem", "token"].includes(key.toLowerCase())) continue;
      const row = h("div", "statblock-attr-row statblock-custom-field");
      const labelText = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const displayVal = typeof val === "object" ? JSON.stringify(val) : String(val);
      row.append(h("strong", "", `${labelText}: `), renderTextWithDice(displayVal));
      unrenderedSecondary.append(row);
    }
  }

  if (unrenderedSecondary.childElementCount > 0) {
    card.append(unrenderedSecondary);
  }

  if (!hasRenderedTraits && data.traits && data.traits.length > 0) {
    card.append(divider());
    card.append(renderSectionItems("Habilidades e Características", data.traits));
  }

  const appendSectionIfNotRendered = (key: string, title: string, items?: StatblockSectionItem[]) => {
    if (items && items.length > 0 && !renderedSections.has(key)) {
      card.append(divider());
      card.append(renderSectionItems(title, items));
    }
  };
  appendSectionIfNotRendered("actions", "Ações", data.actions);
  appendSectionIfNotRendered("bonus_actions", "Ações Bônus", data.bonus_actions);
  appendSectionIfNotRendered("reactions", "Reações", data.reactions);
  appendSectionIfNotRendered("legendary_actions", "Ações Lendárias", data.legendary_actions);
  appendSectionIfNotRendered("mythic_actions", "Ações Míticas", data.mythic_actions);

  if (data.customSections && data.customSections.length > 0) {
    for (const sec of data.customSections) {
      if (!renderedSections.has(sec.title) && sec.items.length > 0) {
        card.append(divider());
        card.append(renderSectionItems(sec.title, sec.items));
      }
    }
  }

  return card;
}
