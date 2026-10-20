// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Statblock Layout Builder and Editor Modal (ADR 0099).
 * Features: full block editing, up/down reordering, block type picker,
 * system-aware realistic sample previews (adversaries vs PCs), and live YAML inspector.
 */

import { button, h } from "../dom";
import { icon } from "../icons";
import { asDialog } from "../dialogs/a11y";
import {
  type LayoutAbilityDef,
  type LayoutBlock,
  type LayoutBlockType,
  type StatblockLayout,
  exportLayoutToJson,
  exportLayoutToYaml,
  importLayoutFromYaml,
  saveCustomLayout,
} from "./layouts";
import { renderStatblockCard } from "./render";
import type { StatblockData } from "./types";

const ATTRIBUTE_PRESETS: { label: string; system: string; d20: boolean; attributes: LayoutAbilityDef[] }[] = [
  {
    label: "Daggerheart (6 Traços)",
    system: "Daggerheart",
    d20: false,
    attributes: [
      { name: "Agilidade", short: "AGI", defaultValue: "+1" },
      { name: "Força", short: "FOR", defaultValue: "+0" },
      { name: "Finesse", short: "FIN", defaultValue: "+2" },
      { name: "Instinto", short: "INS", defaultValue: "+0" },
      { name: "Presença", short: "PRE", defaultValue: "+1" },
      { name: "Conhecimento", short: "CON", defaultValue: "-1" },
    ],
  },
  {
    label: "D&D 5e / Tormenta20 (6 Atributos d20)",
    system: "D&D 5e / D20",
    d20: true,
    attributes: [
      { name: "Força", short: "FOR", defaultValue: 10 },
      { name: "Destreza", short: "DES", defaultValue: 14 },
      { name: "Constituição", short: "CON", defaultValue: 12 },
      { name: "Inteligência", short: "INT", defaultValue: 10 },
      { name: "Sabedoria", short: "SAB", defaultValue: 13 },
      { name: "Carisma", short: "CAR", defaultValue: 8 },
    ],
  },
  {
    label: "Cairn / Into the Odd (3 Atributos)",
    system: "Cairn",
    d20: false,
    attributes: [
      { name: "Força", short: "FOR", defaultValue: 12 },
      { name: "Destreza", short: "DES", defaultValue: 10 },
      { name: "Vontade", short: "VON", defaultValue: 14 },
    ],
  },
  {
    label: "Cyberpunk RED (10 Atributos)",
    system: "Cyberpunk RED",
    d20: false,
    attributes: [
      { name: "INT", short: "INT", defaultValue: 8 },
      { name: "REF", short: "REF", defaultValue: 8 },
      { name: "DEX", short: "DEX", defaultValue: 7 },
      { name: "TECH", short: "TECH", defaultValue: 6 },
      { name: "COOL", short: "COOL", defaultValue: 8 },
      { name: "WILL", short: "WILL", defaultValue: 5 },
      { name: "LUCK", short: "LUCK", defaultValue: 6 },
      { name: "MOVE", short: "MOVE", defaultValue: 7 },
      { name: "BODY", short: "BODY", defaultValue: 8 },
      { name: "EMP", short: "EMP", defaultValue: 4 },
    ],
  },
  {
    label: "Call of Cthulhu (8 Características)",
    system: "Call of Cthulhu",
    d20: false,
    attributes: [
      { name: "FOR", short: "FOR", defaultValue: 50 },
      { name: "CON", short: "CON", defaultValue: 60 },
      { name: "TAM", short: "TAM", defaultValue: 65 },
      { name: "DES", short: "DES", defaultValue: 70 },
      { name: "APA", short: "APA", defaultValue: 55 },
      { name: "INT", short: "INT", defaultValue: 80 },
      { name: "POD", short: "POD", defaultValue: 65 },
      { name: "EDU", short: "EDU", defaultValue: 75 },
    ],
  },
  {
    label: "Storyteller / Vampiro (9 Atributos)",
    system: "Storyteller",
    d20: false,
    attributes: [
      { name: "FOR", short: "FOR", defaultValue: 2 },
      { name: "DES", short: "DES", defaultValue: 3 },
      { name: "VIG", short: "VIG", defaultValue: 2 },
      { name: "CAR", short: "CAR", defaultValue: 4 },
      { name: "MAN", short: "MAN", defaultValue: 3 },
      { name: "COM", short: "COM", defaultValue: 3 },
      { name: "PER", short: "PER", defaultValue: 3 },
      { name: "INT", short: "INT", defaultValue: 4 },
      { name: "RAC", short: "RAC", defaultValue: 2 },
    ],
  },
  {
    label: "Ironsworn (5 Atributos)",
    system: "Ironsworn",
    d20: false,
    attributes: [
      { name: "Astúcia", short: "AST", defaultValue: 3 },
      { name: "Coração", short: "COR", defaultValue: 1 },
      { name: "Ferro", short: "FER", defaultValue: 2 },
      { name: "Sombra", short: "SOM", defaultValue: 1 },
      { name: "Razão", short: "RAZ", defaultValue: 2 },
    ],
  },
];

const BLOCK_TYPE_INFO: Record<LayoutBlockType, { label: string; icon: string; defaultKeys: string }> = {
  heading: { label: "Título / Cabeçalho", icon: "heading", defaultKeys: "name, nome" },
  subheading: { label: "Subtítulo / Conceito", icon: "note", defaultKeys: "tier, tipo, classe, arquetipo, ocupacao, subtitle" },
  property: { label: "Linha de Propriedade", icon: "props", defaultKeys: "speed, senses, languages, cr, nd, resistências" },
  vitals: { label: "Recursos & Vitais", icon: "list", defaultKeys: "pv, hp, ca, defesa, deslocamento, estresse" },
  abilities: { label: "Atributos & Estatísticas", icon: "dice", defaultKeys: "atributos, stats, abilities" },
  saves: { label: "Salvaguardas / Resistências", icon: "shield", defaultKeys: "saves, testes_resistencia" },
  traits: { label: "Traços & Habilidades Passivas", icon: "sparkles", defaultKeys: "traits, habilidades, passivas" },
  section: { label: "Seção / Lista de Itens (Ações)", icon: "list", defaultKeys: "acoes, ataques, habilidades, traits" },
  table: { label: "Tabela de Estatísticas / Matriz", icon: "table", defaultKeys: "tabela, stats, matriz" },
  image: { label: "Imagem / Arte / Token", icon: "image", defaultKeys: "imagem, image, token" },
  divider: { label: "Separador Visual", icon: "rule", defaultKeys: "" },
  text: { label: "Texto / Markdown / Notas", icon: "note", defaultKeys: "texto, markdown, notas, regras" },
};

/** Generate realistic, system-aware sample data and YAML source for a layout. */
function getSampleDataForLayout(layout: StatblockLayout): { data: StatblockData; yaml: string } {
  const id = layout.id.toLowerCase();
  const hasAbilities = layout.blocks.some((b) => b.type === "abilities");
  const abilitiesBlock = layout.blocks.find((b) => b.type === "abilities");
  const isD20 = abilitiesBlock?.options?.["d20Modifiers"] === true || layout.theme === "classic";

  // 1. Daggerheart Adversary / Monster
  if (id.includes("daggerheart-adversary") || (id.includes("daggerheart") && !hasAbilities)) {
    const yaml = `layout: ${layout.name}
nome: Drake das Sombras
tier: Tier 1 Solo
dificuldade: 13
limiares: 7 / 14
pv: 6
estresse: 3
ataques:
  - Mordida Cáustica: "+3 alcance Curto | 2d8+3 físico e ácido contínuo"
  - Garras Dilacerantes: "+2 corpo a corpo | 1d10+4 físico"
experiencias:
  - Caçador Noturno: "+2"
  - Emboscada Silenciosa: "+1"
movimentos_medo:
  - Baforada Tóxica (Ação): "Gaste 1 Medo para expelir ácido em cone de alcance Curto: teste de Agilidade contra DC 13 ou sofre 2d8 de dano."
  - Frenesi Sombrio (Reação): "Gaste 1 Medo quando sofrer dano Severo para contra-atacar imediatamente."
habilidades:
  - Escamas de Obsidiana: "Resistência natural a dano cortante e perfurante."`;

    const data: StatblockData = {
      name: "Drake das Sombras",
      subtitle: "Tier 1 Solo • Predador Noturno",
      vitals: [
        { label: "Dificuldade (DC)", value: 13 },
        { label: "Limiares de Dano", value: "7 / 14" },
        { label: "Pontos de Vida (PV)", value: 6 },
        { label: "Estresse", value: 3 },
      ],
      abilities: [],
      traits: [
        { name: "Escamas de Obsidiana", desc: "Resistência natural a dano cortante e perfurante." },
      ],
      customSections: [
        {
          title: "Ataques e Armas",
          items: [
            { name: "Mordida Cáustica", desc: "+3 alcance Curto | 2d8+3 físico e ácido contínuo." },
            { name: "Garras Dilacerantes", desc: "+2 corpo a corpo | 1d10+4 físico." },
          ],
        },
        {
          title: "Experiências",
          items: [
            { name: "Caçador Noturno +2", desc: "Gaste 1 Medo para somar este bônus em manobras de furtividade." },
            { name: "Emboscada Silenciosa +1", desc: "Bônus aplicado ao surpreender a presa." },
          ],
        },
        {
          title: "Movimentos de Medo (Fear Moves)",
          items: [
            { name: "Baforada Tóxica (Ação)", desc: "Gaste 1 Medo para expelir ácido em cone: teste de Agilidade contra DC 13 ou sofre 2d8 de dano." },
            { name: "Frenesi Sombrio (Reação)", desc: "Gaste 1 Medo quando sofrer dano Severo para contra-atacar imediatamente." },
          ],
        },
      ],
      layout: layout.theme,
      rawSource: yaml,
    };
    return { data, yaml };
  }

  // 2. Ironsworn Foe / Challenge
  if (id.includes("ironsworn-foe")) {
    const yaml = `layout: ${layout.name}
nome: Lobo do Pântano
rank: Perigoso (Dangerous)
trilha: "■■□□□□□□□□ (2/10)"
dano: 2 de Dano
impulso: Proteger a alcateia e defender a toca
taticas:
  - Cercar a Presa: "Move-se furtivamente pelas sombras procurando o flanco mais vulnerável."
  - Mordida no Jarrete: "Derruba o alvo se acertar com sucesso decisivo."
habilidades:
  - Faro Aguçado: "Impossível de ser surpreendido em alcance Próximo."`;

    const data: StatblockData = {
      name: "Lobo do Pântano",
      subtitle: "Rank: Perigoso (Dangerous) • Fera Solitária",
      vitals: [
        { label: "Grau de Desafio / Rank", value: "Perigoso (Dangerous)" },
        { label: "Trilha de Progresso", value: "■■□□□□□□□□ (2/10)" },
        { label: "Dano / Harm", value: "2 de Dano" },
        { label: "Impulso", value: "Proteger a alcateia" },
      ],
      abilities: [],
      traits: [
        { name: "Faro Aguçado", desc: "Impossível de ser surpreendido em alcance Próximo." },
      ],
      customSections: [
        {
          title: "Táticas e Comportamento",
          items: [
            { name: "Cercar a Presa", desc: "Move-se furtivamente pelas sombras procurando o flanco vulnerável." },
            { name: "Mordida no Jarrete", desc: "Derruba o alvo se acertar com sucesso decisivo." },
          ],
        },
      ],
      layout: layout.theme,
      rawSource: yaml,
    };
    return { data, yaml };
  }

  // 3. Alien RPG Creature / Xenomorph
  if (id.includes("alien-creature")) {
    const yaml = `layout: ${layout.name}
nome: Xenomorfo Drone
estagio: Drone Adulto
velocidade: 2
saude: 7
blindagem: 6
ataques_assinatura:
  - 1. Silvo Aterrorizante: "Todos os personagens no mesmo setor recebem 1d6 de Estresse."
  - 2. Bote das Sombras: "Arrasta a vítima indefesa para os dutos de ventilação."
  - 3-4. Chicoteada de Cauda: "Ataque veloz com 8 dados de combate, 2 de dano e derruba o alvo."
  - 5-6. Mandíbula Retrátil: "Ataque fatal contra a cabeça com 10 dados, provoca ferimento crítico instantâneo."
habilidades:
  - Sangue Ácido: "Qualquer ataque perfurante ou cortante provoca respingos de ácido (8 dados, dano 1)."`;

    const data: StatblockData = {
      name: "Xenomorfo Drone",
      subtitle: "Drone Adulto • Horror Espacial",
      vitals: [
        { label: "Deslocamento / Velocidade", value: 2 },
        { label: "Saúde", value: 7 },
        { label: "Blindagem", value: 6 },
      ],
      abilities: [],
      customSections: [
        {
          title: "Ataques de Assinatura (Tabela d6)",
          items: [
            { name: "1. Silvo Aterrorizante", desc: "Todos os personagens no mesmo setor recebem 1d6 de Estresse." },
            { name: "2. Bote das Sombras", desc: "Arrasta a vítima indefesa para os dutos de ventilação." },
            { name: "3-4. Chicoteada de Cauda", desc: "Ataque veloz com 8 dados de combate, 2 de dano e derruba o alvo." },
            { name: "5-6. Mandíbula Retrátil", desc: "Ataque fatal com 10 dados, ferimento crítico instantâneo." },
          ],
        },
        {
          title: "Habilidades Especiais & Sangue Ácido",
          items: [
            { name: "Sangue Ácido", desc: "Qualquer ataque perfurante provoca respingos de ácido (8 dados, dano 1)." },
          ],
        },
      ],
      layout: layout.theme,
      rawSource: yaml,
    };
    return { data, yaml };
  }

  // 4. Generic / Custom Layout generator based on actual blocks
  const name = `Exemplo: ${layout.name}`;
  const subtitle = `${layout.system} • Nível / ND 3`;

  const vitals: StatblockData["vitals"] = [];
  const vitalsBlock = layout.blocks.find((b) => b.type === "vitals");
  if (vitalsBlock && vitalsBlock.properties.length > 0) {
    const props = vitalsBlock.properties.map((p) => p.toLowerCase());
    if (props.some((p) => p.includes("pv") || p.includes("hp") || p.includes("vida") || p.includes("saude"))) {
      vitals.push({ label: "Pontos de Vida (PV)", value: 28, formula: "4d8+8" });
    }
    if (props.some((p) => p.includes("ca") || p.includes("defesa") || p.includes("armor") || p.includes("blindagem"))) {
      vitals.push({ label: "Defesa / Armadura", value: 15 });
    }
    if (props.some((p) => p.includes("pm") || p.includes("mana") || p.includes("magia"))) {
      vitals.push({ label: "Pontos de Mana (PM)", value: 12 });
    }
    if (props.some((p) => p.includes("sanidade") || p.includes("san"))) {
      vitals.push({ label: "Sanidade", value: 55 });
    }
    if (props.some((p) => p.includes("estresse") || p.includes("stress"))) {
      vitals.push({ label: "Estresse", value: 2 });
    }
    if (props.some((p) => p.includes("deslocamento") || p.includes("speed") || p.includes("movimento"))) {
      vitals.push({ label: "Deslocamento", value: "9 m" });
    }
    if (vitals.length === 0) {
      vitals.push({ label: "Recurso Principal", value: 20 });
    }
  } else if (vitalsBlock) {
    vitals.push(
      { label: "Pontos de Vida (PV)", value: 24, formula: "3d8+6" },
      { label: "Defesa", value: 14 }
    );
  }

  const abilities: StatblockData["abilities"] = [];
  if (hasAbilities) {
    const abBlock = layout.blocks.find((b) => b.type === "abilities");
    const configuredAttrs = abBlock?.options?.attributes as LayoutAbilityDef[] | undefined;
    if (configuredAttrs && Array.isArray(configuredAttrs) && configuredAttrs.length > 0) {
      for (const attr of configuredAttrs) {
        const val = attr.defaultValue ?? 10;
        const valStr = String(val);
        const isSigned = valStr.startsWith("+") || valStr.startsWith("-");
        const num = isSigned ? NaN : Number(val);
        const score = Number.isNaN(num) ? valStr : num;
        const modifier = isD20 && typeof score === "number" && score >= 1 && score <= 30 ? Math.floor((score - 10) / 2) : undefined;
        abilities.push({
          name: attr.name,
          short: attr.short || (attr.name.length <= 5 ? attr.name.toUpperCase() : attr.name.slice(0, 3).toUpperCase()),
          score,
          modifier,
          explicitModifier: isSigned,
        });
      }
    } else if (id.includes("daggerheart")) {
      abilities.push(
        { name: "Agilidade", short: "AGI", score: "+1", explicitModifier: true },
        { name: "Força", short: "FOR", score: "+0", explicitModifier: true },
        { name: "Finesse", short: "FIN", score: "+2", explicitModifier: true },
        { name: "Instinto", short: "INS", score: "+0", explicitModifier: true },
        { name: "Presença", short: "PRE", score: "+1", explicitModifier: true },
        { name: "Conhecimento", short: "CON", score: "-1", explicitModifier: true }
      );
    } else if (id.includes("call-of-cthulhu") || id.includes("delta-green")) {
      abilities.push(
        { name: "FOR", short: "FOR", score: 60 },
        { name: "CON", short: "CON", score: 70 },
        { name: "TAM", short: "TAM", score: 65 },
        { name: "DES", short: "DES", score: 50 },
        { name: "INT", short: "INT", score: 80 },
        { name: "POD", short: "POD", score: 65 }
      );
    } else if (id.includes("cairn") || id.includes("mausritter")) {
      abilities.push(
        { name: "Força", short: "FOR", score: 14 },
        { name: "Destreza", short: "DES", score: 8 },
        { name: "Vontade", short: "VON", score: 12 }
      );
    } else if (id.includes("cyberpunk")) {
      abilities.push(
        { name: "REF", short: "REF", score: 8 },
        { name: "DES", short: "DES", score: 7 },
        { name: "TEC", short: "TEC", score: 6 },
        { name: "INT", short: "INT", score: 8 },
        { name: "VON", short: "VON", score: 7 },
        { name: "MOV", short: "MOV", score: 6 }
      );
    } else if (isD20) {
      abilities.push(
        { name: "Força", short: "FOR", score: 16, modifier: 3 },
        { name: "Destreza", short: "DES", score: 14, modifier: 2 },
        { name: "Constituição", short: "CON", score: 15, modifier: 2 },
        { name: "Inteligência", short: "INT", score: 12, modifier: 1 },
        { name: "Sabedoria", short: "SAB", score: 10, modifier: 0 },
        { name: "Carisma", short: "CAR", score: 8, modifier: -1 }
      );
    } else {
      abilities.push(
        { name: "Força", short: "FOR", score: 14 },
        { name: "Destreza", short: "DES", score: 12 },
        { name: "Constituição", short: "CON", score: 13 },
        { name: "Inteligência", short: "INT", score: 10 }
      );
    }
  }

  const customSections = layout.blocks
    .filter((b) => b.type === "section" && b.title)
    .map((b) => ({
      title: b.title!,
      items: [
        {
          name: "Item Demonstrativo",
          desc: "Ação ou habilidade especial com rolagem interativa: 1d20+5 no teste. Efeito: 2d6+3 de resultado.",
        },
      ],
    }));

  const yamlLines = [
    `layout: ${layout.name}`,
    `nome: ${name}`,
    `subtitulo: ${subtitle}`,
  ];
  if (vitals.length > 0) {
    for (const v of vitals) {
      const key = v.label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      yamlLines.push(`${key}: ${v.value}`);
    }
  }
  if (abilities.length > 0) {
    yamlLines.push(`atributos:`);
    for (const a of abilities) {
      yamlLines.push(`  ${a.name}: ${a.score}`);
    }
  }
  for (const s of customSections) {
    const key = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    yamlLines.push(`${key}:`);
    for (const item of s.items) {
      yamlLines.push(`  - ${item.name}: "${item.desc}"`);
    }
  }

  const yaml = yamlLines.join("\n");
  const data: StatblockData = {
    name,
    subtitle,
    vitals: vitals.length > 0 ? vitals : undefined,
    abilities,
    customSections: customSections.length > 0 ? customSections : undefined,
    layout: layout.theme,
    rawSource: yaml,
  };
  return { data, yaml };
}

export function openLayoutBuilder(
  initialLayout?: StatblockLayout,
  onSave?: (saved: StatblockLayout) => void
): void {
  const existing = document.querySelector(".statblock-builder-modal");
  if (existing) existing.remove();

  const isNew = !initialLayout;
  const layout: StatblockLayout = initialLayout
    ? JSON.parse(JSON.stringify(initialLayout))
    : {
        id: `custom-${Date.now()}`,
        name: "Novo Template Customizado",
        system: "Sistema Personalizado",
        description: "Template customizado de ficha de RPG para o Verso.",
        theme: "classic",
        tags: ["custom"],
        blocks: [
          { id: "h1", type: "heading", properties: ["nome", "name"] },
          { id: "sub", type: "subheading", properties: ["tipo", "type", "conceito", "subtitle"] },
          { id: "div-1", type: "divider", properties: [] },
          { id: "vitals", type: "vitals", properties: ["pv", "hp", "ca", "defesa", "deslocamento"] },
          { id: "div-2", type: "divider", properties: [] },
          { id: "abilities", type: "abilities", properties: ["atributos", "stats"] },
          { id: "div-3", type: "divider", properties: [] },
          { id: "armas", type: "section", title: "Armas e Ataques", properties: ["armas", "acoes", "actions"] },
          { id: "habilidades", type: "section", title: "Habilidades Especiais", properties: ["habilidades", "traits"] },
        ],
        builtIn: false,
      };

  let editingBlockIndex: number | null = null;
  let activePreviewTab: "visual" | "yaml" = "visual";

  const overlay = h("div", "quick statblock-builder-modal");
  const box = h("div", "statblock-builder-box");

  // Header
  const header = h("div", "statblock-builder-header");
  const title = h("h2", "", isNew ? "Criar Novo Template de Ficha" : `Configurar Template: ${layout.name}`);
  const closeBtn = h("button", "ghost iconic");
  closeBtn.type = "button";
  closeBtn.append(icon("close"));
  closeBtn.addEventListener("click", () => overlay.remove());
  header.append(title, closeBtn);

  // Main body: Split view (left: settings & blocks, right: live preview)
  const body = h("div", "statblock-builder-body");
  const leftCol = h("div", "statblock-builder-controls");
  const rightCol = h("div", "statblock-builder-preview-pane");

  // Form fields
  const nameRow = h("div", "builder-field");
  nameRow.append(h("label", "", "Nome do Template:"));
  const nameInput = h("input", "builder-input") as HTMLInputElement;
  nameInput.value = layout.name;
  nameRow.append(nameInput);

  const systemRow = h("div", "builder-field");
  systemRow.append(h("label", "", "Sistema de Regras / Cenário:"));
  const systemInput = h("input", "builder-input") as HTMLInputElement;
  systemInput.value = layout.system;
  systemRow.append(systemInput);

  const descRow = h("div", "builder-field");
  descRow.append(h("label", "", "Descrição:"));
  const descInput = h("textarea", "builder-textarea") as HTMLTextAreaElement;
  descInput.value = layout.description;
  descRow.append(descInput);

  const themeRow = h("div", "builder-field");
  themeRow.append(h("label", "", "Tema Visual do Cartão:"));
  const themeSelect = h("select", "builder-select") as HTMLSelectElement;
  const themes = [
    { id: "classic", label: "Clássico D20 / Pergaminho Tradicional" },
    { id: "modern", label: "Moderno / Livro Editorial" },
    { id: "cyberpunk", label: "Cyberpunk / Neon High-Tech (Alto Contraste)" },
    { id: "osr", label: "Grim Dark / OSR Preto e Branco (Alto Contraste)" },
    { id: "investigation", label: "Investigação / Dossiê de Arquivo" },
  ];
  for (const th of themes) {
    const opt = h("option", "", th.label) as HTMLOptionElement;
    opt.value = th.id;
    if (layout.theme === th.id) opt.selected = true;
    themeSelect.append(opt);
  }
  themeRow.append(themeSelect);

  // Blocks Section
  const blocksSection = h("div", "builder-blocks-section");
  const blocksHeader = h("div", "builder-blocks-header");
  blocksHeader.append(
    h("h3", "", "Blocos e Estrutura da Ficha"),
    h("span", "builder-hint", "Reordene com ▲/▼, edite propriedades ou adicione seções personalizadas.")
  );
  blocksSection.append(blocksHeader);

  const blocksList = h("div", "builder-blocks-list");

  // Function to move block up or down
  const moveBlock = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= layout.blocks.length) return;
    const [moved] = layout.blocks.splice(fromIndex, 1);
    if (!moved) return;
    layout.blocks.splice(toIndex, 0, moved);
    if (editingBlockIndex === fromIndex) {
      editingBlockIndex = toIndex;
    } else if (editingBlockIndex !== null) {
      editingBlockIndex = null;
    }
    renderBlocks();
    updatePreview();
  };

  const renderBlocks = () => {
    blocksList.replaceChildren();

    layout.blocks.forEach((b, idx) => {
      // If this block is currently being edited, show the inline editor form
      if (editingBlockIndex === idx) {
        const editCard = h("div", "builder-block-editor-card");

        const editHeader = h("div", "builder-block-editor-header");
        const editTitleWrap = h("div", "builder-block-editor-title-wrap");
        editTitleWrap.append(
          h("span", `builder-badge builder-badge-${b.type}`, b.type.toUpperCase()),
          h("strong", "", `Editar Bloco #${idx + 1}: ${b.title || BLOCK_TYPE_INFO[b.type]?.label || b.type}`)
        );
        const delHeaderBtn = h("button", "ghost iconic text-danger");
        delHeaderBtn.type = "button";
        delHeaderBtn.title = "Excluir este bloco agora";
        delHeaderBtn.append(icon("trash"));
        delHeaderBtn.addEventListener("click", () => {
          layout.blocks.splice(idx, 1);
          editingBlockIndex = null;
          renderBlocks();
          updatePreview();
        });
        editHeader.append(editTitleWrap, delHeaderBtn);

        const formGrid = h("div", "builder-block-editor-grid");

        // Type select
        const typeField = h("div", "builder-field");
        typeField.append(h("label", "", "Tipo do Bloco:"));
        const typeSelect = h("select", "builder-select-sm") as HTMLSelectElement;
        for (const [tKey, tInfo] of Object.entries(BLOCK_TYPE_INFO)) {
          const opt = h("option", "", `${tInfo.label} (${tKey})`) as HTMLOptionElement;
          opt.value = tKey;
          if (b.type === tKey) opt.selected = true;
          typeSelect.append(opt);
        }
        typeField.append(typeSelect);

        // Title input
        const titleField = h("div", "builder-field");
        titleField.append(h("label", "", "Título / Rótulo de Exibição:"));
        const titleInput = h("input", "builder-input-sm") as HTMLInputElement;
        titleInput.value = b.title || "";
        titleInput.placeholder = "ex.: Armas, Movimentos de Medo, Salvaguardas, Perícias";
        titleField.append(titleInput);

        // Properties input
        const propsField = h("div", "builder-field");
        propsField.append(h("label", "", "Chaves YAML Mapeadas (separadas por vírgula):"));
        const propsInput = h("input", "builder-input-sm") as HTMLInputElement;
        propsInput.value = b.properties.join(", ");
        propsInput.placeholder = "ex.: pv, hp, vida, hit_points";
        propsField.append(propsInput);

        // Quick suggestion chips
        const chipsRow = h("div", "builder-suggest-chips");
        const quickKeys = ["pv", "hp", "ca", "defesa", "deslocamento", "ataques", "acoes", "habilidades", "magias", "trilha", "limiares", "sanidade", "sorte", "saves", "pericias"];
        quickKeys.forEach((key) => {
          const chip = h("button", "builder-suggest-chip", `+ ${key}`);
          chip.type = "button";
          chip.addEventListener("click", () => {
            const currentKeys = propsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
            if (!currentKeys.includes(key)) {
              currentKeys.push(key);
              propsInput.value = currentKeys.join(", ");
            }
          });
          chipsRow.append(chip);
        });
        propsField.append(chipsRow);

        // Options: Text / Markdown content
        const isTextBlock = b.type === "text";
        const textField = h("div", "builder-field");
        textField.append(h("label", "", "Texto / Markdown (suporta interpolação com {chave}):"));
        const textInput = h("textarea", "builder-textarea") as HTMLTextAreaElement;
        textInput.value = b.text || (b.options?.["text"] as string) || b.fallback || "";
        textInput.placeholder = "ex.: **Regras Especiais:** {regras} ou instruções da ficha";
        textField.append(textInput);
        textField.style.display = isTextBlock ? "flex" : "none";

        // Options: Conditioned toggle
        const condField = h("label", "builder-checkbox-label");
        const condInput = h("input", "") as HTMLInputElement;
        condInput.type = "checkbox";
        condInput.checked = b.conditioned ?? false;
        condField.append(condInput, h("span", "", "Ocultar automaticamente se as chaves estiverem vazias (Conditioned)"));

        // Options: D20 modifiers (if type is abilities or table)
        const isAbilitiesOrTable = b.type === "abilities" || b.type === "table";
        const d20Field = h("label", "builder-checkbox-label");
        const d20Input = h("input", "") as HTMLInputElement;
        d20Input.type = "checkbox";
        d20Input.checked = b.options?.["d20Modifiers"] === true;
        d20Field.append(d20Input, h("span", "", "Calcular modificadores D20 automáticos ((Score - 10) / 2)"));
        d20Field.style.display = isAbilitiesOrTable ? "flex" : "none";

        // Options: Attributes Manager (if type is abilities or table)
        const abilitiesManager = h("div", "builder-attrs-manager");
        abilitiesManager.style.display = isAbilitiesOrTable ? "block" : "none";

        let currentAttrs: LayoutAbilityDef[] = [];
        if (b.options?.attributes && Array.isArray(b.options.attributes) && b.options.attributes.length > 0) {
          currentAttrs = b.options.attributes.map((a) => ({ ...a }));
        } else if (layout.id.includes("daggerheart")) {
          currentAttrs = ATTRIBUTE_PRESETS[0]!.attributes.map((a) => ({ ...a }));
        } else if (layout.id.includes("cairn")) {
          currentAttrs = ATTRIBUTE_PRESETS[2]!.attributes.map((a) => ({ ...a }));
        } else if (layout.id.includes("cyberpunk")) {
          currentAttrs = ATTRIBUTE_PRESETS[3]!.attributes.map((a) => ({ ...a }));
        } else {
          currentAttrs = ATTRIBUTE_PRESETS[1]!.attributes.map((a) => ({ ...a }));
        }

        const attrsListEl = h("div", "builder-attrs-list");

        const renderAttrsRows = () => {
          attrsListEl.replaceChildren();
          currentAttrs.forEach((attr, aIdx) => {
            const row = h("div", "builder-attr-row");

            const nameInput = h("input", "builder-input-sm builder-attr-name") as HTMLInputElement;
            nameInput.type = "text";
            nameInput.value = attr.name;
            nameInput.placeholder = "Nome (ex: Agilidade)";
            nameInput.title = "Nome completo do atributo";
            nameInput.addEventListener("input", () => {
              attr.name = nameInput.value;
            });

            const shortInput = h("input", "builder-input-sm builder-attr-short") as HTMLInputElement;
            shortInput.type = "text";
            shortInput.value = attr.short;
            shortInput.placeholder = "Sigla (AGI)";
            shortInput.title = "Sigla ou abreviação exibida no cabeçalho da coluna";
            shortInput.addEventListener("input", () => {
              attr.short = shortInput.value;
            });

            const defInput = h("input", "builder-input-sm builder-attr-default") as HTMLInputElement;
            defInput.type = "text";
            defInput.value = String(attr.defaultValue ?? 10);
            defInput.placeholder = "Padrão (+1)";
            defInput.title = "Valor padrão para novas fichas e pré-visualização";
            defInput.addEventListener("input", () => {
              attr.defaultValue = defInput.value;
            });

            const rowActions = h("div", "builder-attr-actions");

            const upBtn = h("button", "ghost iconic");
            upBtn.type = "button";
            upBtn.append(icon("chevronUp"));
            upBtn.title = "Mover atributo para cima";
            if (aIdx === 0) upBtn.setAttribute("disabled", "true");
            upBtn.addEventListener("click", () => {
              const tmp = currentAttrs[aIdx - 1]!;
              currentAttrs[aIdx - 1] = currentAttrs[aIdx]!;
              currentAttrs[aIdx] = tmp;
              renderAttrsRows();
            });

            const downBtn = h("button", "ghost iconic");
            downBtn.type = "button";
            downBtn.append(icon("chevronDown"));
            downBtn.title = "Mover atributo para baixo";
            if (aIdx === currentAttrs.length - 1) downBtn.setAttribute("disabled", "true");
            downBtn.addEventListener("click", () => {
              const tmp = currentAttrs[aIdx + 1]!;
              currentAttrs[aIdx + 1] = currentAttrs[aIdx]!;
              currentAttrs[aIdx] = tmp;
              renderAttrsRows();
            });

            const delBtn = h("button", "ghost iconic text-danger");
            delBtn.type = "button";
            delBtn.append(icon("trash"));
            delBtn.title = "Remover atributo";
            delBtn.addEventListener("click", () => {
              currentAttrs.splice(aIdx, 1);
              renderAttrsRows();
            });

            rowActions.append(upBtn, downBtn, delBtn);
            row.append(nameInput, shortInput, defInput, rowActions);
            attrsListEl.append(row);
          });
        };

        const attrsHeader = h("div", "builder-attrs-header");
        attrsHeader.append(
          h("strong", "", "Atributos Configurados para este Layout:"),
          h("p", "builder-attrs-hint", "Defina os atributos da ficha (Nome, Sigla e Valor inicial). Você também pode aplicar modelos prontos de sistemas com 1 clique:")
        );

        // Presets buttons
        const presetsBar = h("div", "builder-attrs-presets");
        ATTRIBUTE_PRESETS.forEach((preset) => {
          const pBtn = h("button", "builder-attr-preset-btn");
          pBtn.type = "button";
          pBtn.textContent = preset.label;
          pBtn.addEventListener("click", () => {
            currentAttrs = preset.attributes.map((a) => ({ ...a }));
            d20Input.checked = preset.d20;
            renderAttrsRows();
          });
          presetsBar.append(pBtn);
        });

        renderAttrsRows();

        const addAttrBtn = button("ghost builder-add-attr-btn", "+ Adicionar Atributo");
        addAttrBtn.type = "button";
        addAttrBtn.addEventListener("click", () => {
          currentAttrs.push({ name: `Atributo ${currentAttrs.length + 1}`, short: `AT${currentAttrs.length + 1}`, defaultValue: 10 });
          renderAttrsRows();
        });

        abilitiesManager.append(attrsHeader, presetsBar, attrsListEl, addAttrBtn);

        typeSelect.addEventListener("change", () => {
          const newType = typeSelect.value as LayoutBlockType;
          const def = BLOCK_TYPE_INFO[newType];
          if (def) {
            if (!titleInput.value || Object.values(BLOCK_TYPE_INFO).some((info) => info.label === titleInput.value)) {
              titleInput.value = newType === "section" ? "Nova Seção" : def.label;
            }
            if (!propsInput.value || Object.values(BLOCK_TYPE_INFO).some((info) => info.defaultKeys === propsInput.value)) {
              propsInput.value = def.defaultKeys;
            }
          }
          const isAbOrTab = newType === "abilities" || newType === "table";
          d20Field.style.display = isAbOrTab ? "flex" : "none";
          abilitiesManager.style.display = isAbOrTab ? "block" : "none";
          textField.style.display = newType === "text" ? "flex" : "none";
        });

        formGrid.append(typeField, titleField, propsField, textField, condField, d20Field, abilitiesManager);

        // Buttons
        const editActions = h("div", "builder-block-editor-actions");
        const delBlockBtn = button("ghost text-danger", "Excluir Bloco");
        delBlockBtn.type = "button";
        delBlockBtn.prepend(icon("trash"));
        delBlockBtn.addEventListener("click", () => {
          layout.blocks.splice(idx, 1);
          editingBlockIndex = null;
          renderBlocks();
          updatePreview();
        });

        const cancelBlockBtn = button("ghost", "Cancelar");
        cancelBlockBtn.type = "button";
        cancelBlockBtn.addEventListener("click", () => {
          editingBlockIndex = null;
          renderBlocks();
        });

        const saveBlockBtn = button("primary", "Concluir Edição");
        saveBlockBtn.type = "button";
        saveBlockBtn.prepend(icon("check"));
        saveBlockBtn.addEventListener("click", () => {
          b.type = typeSelect.value as LayoutBlockType;
          b.title = titleInput.value.trim() || undefined;
          b.properties = propsInput.value
            .split(",")
            .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
            .filter(Boolean);
          b.conditioned = condInput.checked;
          if (b.type === "text") {
            b.text = textInput.value;
            b.options = { ...b.options, text: textInput.value };
          }
          if (b.type === "abilities" || b.type === "table") {
            b.options = { ...b.options, d20Modifiers: d20Input.checked, attributes: currentAttrs };
          }
          editingBlockIndex = null;
          renderBlocks();
          updatePreview();
        });

        const spacer = h("div", "builder-editor-actions-spacer");
        editActions.append(delBlockBtn, spacer, cancelBlockBtn, saveBlockBtn);
        editCard.append(editHeader, formGrid, editActions);
        blocksList.append(editCard);
        return;
      }

      // Normal block row view
      const bRow = h("div", "builder-block-item builder-block-item-clickable");
      bRow.setAttribute("role", "button");
      bRow.setAttribute("tabindex", "0");
      bRow.title = "Clique para editar as configurações deste bloco";
      bRow.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        editingBlockIndex = idx;
        renderBlocks();
      });
      bRow.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          editingBlockIndex = idx;
          renderBlocks();
        }
      });

      const bInfo = h("div", "builder-block-info");
      const infoMeta = BLOCK_TYPE_INFO[b.type] ?? { label: b.type, defaultKeys: "" };
      const bTypeBadge = h("span", `builder-badge builder-badge-${b.type}`, b.type.toUpperCase());
      const titleText = b.title || infoMeta.label;
      const bTitle = h("strong", "builder-block-title", titleText);
      bInfo.append(bTypeBadge, bTitle);

      if (b.properties.length > 0) {
        const propChips = h("div", "builder-chips-list");
        b.properties.slice(0, 4).forEach((p) => {
          propChips.append(h("span", "builder-chip", p));
        });
        if (b.properties.length > 4) {
          propChips.append(h("span", "builder-chip-more", `+${b.properties.length - 4}`));
        }
        bInfo.append(propChips);
      }

      const bActions = h("div", "builder-block-actions");

      // Up button
      const upBtn = h("button", "ghost iconic");
      upBtn.type = "button";
      upBtn.title = "Mover bloco para cima";
      upBtn.append(icon("chevronUp"));
      if (idx === 0) upBtn.setAttribute("disabled", "true");
      upBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveBlock(idx, idx - 1);
      });

      // Down button
      const downBtn = h("button", "ghost iconic");
      downBtn.type = "button";
      downBtn.title = "Mover bloco para baixo";
      downBtn.append(icon("chevronDown"));
      if (idx === layout.blocks.length - 1) downBtn.setAttribute("disabled", "true");
      downBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveBlock(idx, idx + 1);
      });

      // Edit button
      const editBtn = button("secondary builder-btn-edit", "Editar");
      editBtn.type = "button";
      editBtn.title = "Editar propriedades deste bloco";
      editBtn.prepend(icon("edit"));
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editingBlockIndex = idx;
        renderBlocks();
      });

      // Delete button
      const delBtn = h("button", "ghost iconic text-danger");
      delBtn.type = "button";
      delBtn.title = "Remover bloco";
      delBtn.append(icon("trash"));
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layout.blocks.splice(idx, 1);
        if (editingBlockIndex === idx) editingBlockIndex = null;
        else if (editingBlockIndex !== null && editingBlockIndex > idx) editingBlockIndex--;
        renderBlocks();
        updatePreview();
      });

      bActions.append(upBtn, downBtn, editBtn, delBtn);
      bRow.append(bInfo, bActions);
      blocksList.append(bRow);
    });
  };

  // Add block panel (Rich & intuitive UX)
  const addPanel = h("div", "builder-add-panel");
  const addPanelTitle = h("h4", "", "+ Adicionar Novo Bloco ao Template");

  const addRow1 = h("div", "builder-add-row");
  const addTypeSelect = h("select", "builder-select-sm") as HTMLSelectElement;
  for (const [tKey, tInfo] of Object.entries(BLOCK_TYPE_INFO)) {
    const opt = h("option", "", tInfo.label) as HTMLOptionElement;
    opt.value = tKey;
    if (tKey === "section") opt.selected = true;
    addTypeSelect.append(opt);
  }

  const addTitleInput = h("input", "builder-input-sm") as HTMLInputElement;
  addTitleInput.placeholder = "Título / Nome da Seção (ex.: Ataques, Movimentos de Medo, Magias)";

  const addKeysInput = h("input", "builder-input-sm") as HTMLInputElement;
  addKeysInput.placeholder = "Chaves YAML (ex.: ataques, armas, actions)";

  addTypeSelect.addEventListener("change", () => {
    const sel = addTypeSelect.value as LayoutBlockType;
    const def = BLOCK_TYPE_INFO[sel];
    if (def) {
      addKeysInput.placeholder = `Chaves YAML (sugestão: ${def.defaultKeys || "vazio"})`;
      if (!addTitleInput.value) {
        addTitleInput.value = sel === "section" ? "Nova Seção" : "";
      }
    }
  });

  const addBtn = button("primary", "+ Inserir Bloco");
  addBtn.addEventListener("click", () => {
    const selType = addTypeSelect.value as LayoutBlockType;
    const titleVal = addTitleInput.value.trim();
    const keysVal = addKeysInput.value
      .split(",")
      .map((k) => k.trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(Boolean);

    const newBlock: LayoutBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: selType,
      title: titleVal || (selType === "section" ? "Nova Seção" : undefined),
      properties: keysVal.length > 0 ? keysVal : BLOCK_TYPE_INFO[selType]?.defaultKeys.split(",").map((k) => k.trim()).filter(Boolean) || [],
      conditioned: false,
      options: selType === "abilities" ? { d20Modifiers: layout.theme === "classic" } : undefined,
    };

    layout.blocks.push(newBlock);
    editingBlockIndex = layout.blocks.length - 1;
    addTitleInput.value = "";
    addKeysInput.value = "";
    renderBlocks();
    updatePreview();
  });

  addRow1.append(addTypeSelect, addTitleInput, addKeysInput, addBtn);
  addPanel.append(addPanelTitle, addRow1);
  blocksSection.append(blocksList, addPanel);

  const visualControls = h("div", "builder-visual-controls");
  visualControls.append(nameRow, systemRow, descRow, themeRow, blocksSection);

  // Mode Switcher (Visual vs Code / LLM)
  let activeBuilderMode: "visual" | "code" = "visual";
  const modeSwitcher = h("div", "builder-mode-switcher");
  const visualModeBtn = h("button", "builder-mode-btn active", "🧩 Editor Visual (Blocos)");
  visualModeBtn.type = "button";
  const codeModeBtn = h("button", "builder-mode-btn", "💻 Modo Código (YAML / Prompt IA)");
  codeModeBtn.type = "button";
  modeSwitcher.append(visualModeBtn, codeModeBtn);

  // Code Controls (YAML direct editing & LLM integration)
  const codeControls = h("div", "builder-code-controls");
  codeControls.style.display = "none";

  const codeToolbar = h("div", "builder-code-toolbar");
  const copyPromptBtn = button("primary", "Copiar Prompt para IA (LLM)");
  copyPromptBtn.type = "button";
  copyPromptBtn.prepend(icon("sparkles"));

  const formatYamlBtn = button("ghost", "Formatar YAML");
  formatYamlBtn.type = "button";
  formatYamlBtn.prepend(icon("check"));

  codeToolbar.append(copyPromptBtn, formatYamlBtn);

  const yamlChipsRow = h("div", "builder-suggest-chips");
  const blockSnippets: { label: string; snippet: string }[] = [
    { label: "+ Cabeçalho", snippet: "\n  - type: heading\n    properties: [nome, name]" },
    { label: "+ Subtítulo", snippet: "\n  - type: subheading\n    properties: [tipo, classe, ocupacao]" },
    { label: "+ Vitais (PV/CA)", snippet: "\n  - type: vitals\n    properties: [pv, hp, ca, defesa, deslocamento]" },
    { label: "+ Atributos D20", snippet: "\n  - type: abilities\n    properties: [atributos, stats]\n    options:\n      d20Modifiers: true" },
    { label: "+ Ações", snippet: "\n  - type: section\n    title: \"Ações e Ataques\"\n    properties: [acoes, ataques, actions]" },
    { label: "+ Texto / Regras", snippet: "\n  - type: text\n    title: \"Notas e Regras\"\n    text: \"**Regras:** {regras}\"" },
    { label: "+ Divisor", snippet: "\n  - type: divider" },
  ];
  blockSnippets.forEach((snip) => {
    const chip = h("button", "builder-suggest-chip", snip.label);
    chip.type = "button";
    chip.addEventListener("click", () => {
      codeEditor.value += snip.snippet;
      codeEditor.dispatchEvent(new Event("input"));
    });
    yamlChipsRow.append(chip);
  });

  const yamlErrorBanner = h("div", "builder-yaml-error");
  yamlErrorBanner.hidden = true;

  const codeEditor = h("textarea", "builder-code-editor") as HTMLTextAreaElement;
  codeEditor.spellcheck = false;
  codeEditor.placeholder = "Cole ou digite aqui a estrutura do template em YAML...";

  codeEditor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = codeEditor.selectionStart;
      const end = codeEditor.selectionEnd;
      codeEditor.value = codeEditor.value.substring(0, start) + "  " + codeEditor.value.substring(end);
      codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
      codeEditor.dispatchEvent(new Event("input"));
    }
  });

  codeEditor.addEventListener("input", () => {
    try {
      const parsed = importLayoutFromYaml(codeEditor.value);
      layout.name = parsed.name;
      layout.system = parsed.system;
      layout.description = parsed.description;
      layout.theme = parsed.theme;
      layout.blocks = parsed.blocks;
      layout.tags = parsed.tags;
      yamlErrorBanner.hidden = true;
      updatePreview();
    } catch (err) {
      yamlErrorBanner.hidden = false;
      yamlErrorBanner.textContent = `⚠️ Erro no YAML: ${(err as Error).message}`;
    }
  });

  copyPromptBtn.addEventListener("click", () => {
    const promptText = `Você é um especialista em RPG e criação de templates de fichas para o Verso (compatível com Fantasy Statblocks).
Crie um template de ficha em formato YAML para o sistema de RPG que vou especificar.

Siga estritamente esta estrutura YAML:
\`\`\`yaml
name: "Nome do Template"
system: "Nome do Sistema de RPG"
description: "Breve descrição do template"
theme: "classic" # Opções: classic (pergaminho/d20), modern (editorial/limpo), cyberpunk (neon/dark), osr (preto e branco alto contraste), investigation (dossiê)
tags: ["tag1", "tag2"]
blocks:
  - type: heading
    properties: [nome, name]
  - type: subheading
    properties: [tipo, type, ocupacao, classe, arquetipo]
  - type: divider
  - type: vitals
    properties: [pv, hp, ca, defesa, pm, deslocamento, sanidade, estresse]
  - type: abilities
    properties: [atributos, stats]
    options:
      d20Modifiers: true # true para D&D/Tormenta20, false para Call of Cthulhu, Cairn, Cyberpunk, Daggerheart
      attributes:
        - { name: "Força", short: "FOR" }
        - { name: "Destreza", short: "DES" }
        - { name: "Constituição", short: "CON" }
        - { name: "Inteligência", short: "INT" }
        - { name: "Sabedoria", short: "SAB" }
        - { name: "Carisma", short: "CAR" }
  - type: divider
  - type: section
    title: "Ataques e Armas"
    properties: [ataques, armas, acoes]
  - type: section
    title: "Habilidades Especiais & Magias"
    properties: [habilidades, traits, magias, talentos]
  - type: text
    title: "Regras do Sistema"
    text: "**Nota:** {regras}"
\`\`\`

Tipos de blocos suportados:
- heading: Cabeçalho com o nome
- subheading: Subtítulo (tipo, arquétipo, classe, subtítulo)
- vitals: Recursos e vitais (PV, Defesa, Mana, Deslocamento, etc.)
- abilities: Bloco de atributos principais com valores e modificadores
- saves: Testes de resistência e salvaguardas
- traits: Habilidades passivas e características
- section: Seções com lista de itens (ações, armas, magias, inventário)
- property: Linhas de estatística (desafio/ND, sentidos, idiomas, etc.)
- table: Matrizes de atributos ou tabelas
- image: Foto, arte ou token do monstro/personagem
- divider: Linha horizontal divisória
- text: Bloco de texto ou código formatado em Markdown com interpolação {campo}

Agora, gere o template em YAML para o seguinte sistema de RPG:
[DIGITE AQUI O SISTEMA DESEJADO, EX: Tormenta20, Cyberpunk, Vampiro a Máscara, CoC, etc.]`;

    navigator.clipboard.writeText(promptText).then(() => {
      copyPromptBtn.textContent = "Prompt Copiado! Cole na sua IA";
      setTimeout(() => {
        copyPromptBtn.textContent = "Copiar Prompt para IA (LLM)";
        copyPromptBtn.prepend(icon("sparkles"));
      }, 2500);
    });
  });

  formatYamlBtn.addEventListener("click", () => {
    try {
      const parsed = importLayoutFromYaml(codeEditor.value);
      codeEditor.value = exportLayoutToYaml(parsed);
      yamlErrorBanner.hidden = true;
    } catch (err) {
      yamlErrorBanner.hidden = false;
      yamlErrorBanner.textContent = `⚠️ Erro ao formatar: ${(err as Error).message}`;
    }
  });

  const codeHint = h(
    "div",
    "builder-hint",
    "Cole aqui o YAML gerado por ChatGPT, Claude ou Gemini. As alterações atualizam a ficha ao lado imediatamente."
  );

  codeControls.append(codeToolbar, yamlChipsRow, yamlErrorBanner, codeEditor, codeHint);

  visualModeBtn.addEventListener("click", () => {
    activeBuilderMode = "visual";
    visualModeBtn.classList.add("active");
    codeModeBtn.classList.remove("active");
    codeControls.style.display = "none";
    visualControls.style.display = "flex";
    try {
      const parsed = importLayoutFromYaml(codeEditor.value);
      layout.name = parsed.name;
      layout.system = parsed.system;
      layout.description = parsed.description;
      layout.theme = parsed.theme;
      layout.blocks = parsed.blocks;
      layout.tags = parsed.tags;
    } catch {}
    nameInput.value = layout.name;
    systemInput.value = layout.system;
    descInput.value = layout.description;
    themeSelect.value = layout.theme ?? "classic";
    renderBlocks();
    updatePreview();
  });

  codeModeBtn.addEventListener("click", () => {
    activeBuilderMode = "code";
    codeModeBtn.classList.add("active");
    visualModeBtn.classList.remove("active");
    visualControls.style.display = "none";
    codeControls.style.display = "flex";
    layout.name = nameInput.value.trim() || "Template Sem Nome";
    layout.system = systemInput.value.trim() || "RPG";
    layout.description = descInput.value.trim();
    layout.theme = (themeSelect.value as any) || "classic";
    codeEditor.value = exportLayoutToYaml(layout);
    yamlErrorBanner.hidden = true;
  });

  leftCol.append(modeSwitcher, visualControls, codeControls);

  // Preview Pane with Tab Switcher (Visual vs YAML Source)
  const previewTopBar = h("div", "builder-preview-topbar");
  const previewHeading = h("h3", "", "Pré-visualização em Tempo Real");

  const tabToggle = h("div", "builder-tab-toggle");
  const visualTabBtn = h("button", "builder-tab-btn active", "Ficha Visual");
  const yamlTabBtn = h("button", "builder-tab-btn", "Código YAML");

  visualTabBtn.addEventListener("click", () => {
    activePreviewTab = "visual";
    visualTabBtn.classList.add("active");
    yamlTabBtn.classList.remove("active");
    previewCardContainer.style.display = "block";
    previewYamlContainer.style.display = "none";
  });

  yamlTabBtn.addEventListener("click", () => {
    activePreviewTab = "yaml";
    yamlTabBtn.classList.add("active");
    visualTabBtn.classList.remove("active");
    previewCardContainer.style.display = "none";
    previewYamlContainer.style.display = "block";
  });

  tabToggle.append(visualTabBtn, yamlTabBtn);
  previewTopBar.append(previewHeading, tabToggle);

  const previewCardContainer = h("div", "builder-preview-card-wrapper");
  const previewYamlContainer = h("div", "builder-preview-yaml-wrapper");
  previewYamlContainer.style.display = "none";

  const copyYamlBtn = button("ghost", "Copiar Código YAML");
  const yamlPre = h("pre", "builder-yaml-pre");
  previewYamlContainer.append(copyYamlBtn, yamlPre);

  rightCol.append(previewTopBar, previewCardContainer, previewYamlContainer);

  let currentSampleYaml = "";
  copyYamlBtn.addEventListener("click", () => {
    if (!currentSampleYaml) return;
    navigator.clipboard.writeText(currentSampleYaml).then(() => {
      copyYamlBtn.textContent = "Copiado para a área de transferência!";
      setTimeout(() => (copyYamlBtn.textContent = "Copiar Código YAML"), 2000);
    });
  });

  const updatePreview = () => {
    layout.name = nameInput.value.trim() || "Template Sem Nome";
    layout.system = systemInput.value.trim() || "Sistema Personalizado";
    layout.description = descInput.value.trim();
    layout.theme = (themeSelect.value as any) || "classic";

    // Generate accurate, system-tailored sample data (e.g. Daggerheart Adversary vs D&D vs OSR)
    const { data: sampleData, yaml } = getSampleDataForLayout(layout);
    currentSampleYaml = yaml;
    yamlPre.textContent = yaml;

    const card = renderStatblockCard(sampleData);
    card.classList.add(`statblock-theme-${layout.theme}`);
    previewCardContainer.replaceChildren(card);
  };

  nameInput.addEventListener("input", updatePreview);
  systemInput.addEventListener("input", updatePreview);
  descInput.addEventListener("input", updatePreview);
  themeSelect.addEventListener("change", updatePreview);

  renderBlocks();
  updatePreview();

  body.append(leftCol, rightCol);

  // Footer Actions
  const footer = h("div", "statblock-builder-footer");
  const exportYamlBtn = button("ghost", "Copiar YAML");
  exportYamlBtn.addEventListener("click", () => {
    const yaml = exportLayoutToYaml(layout);
    navigator.clipboard.writeText(yaml).then(() => {
      exportYamlBtn.textContent = "YAML Copiado!";
      setTimeout(() => (exportYamlBtn.textContent = "Copiar YAML"), 2000);
    });
  });

  const exportBtn = button("ghost", "Exportar JSON");
  exportBtn.addEventListener("click", () => {
    const json = exportLayoutToJson(layout);
    navigator.clipboard.writeText(json).then(() => {
      exportBtn.textContent = "JSON Copiado para a área de transferência!";
      setTimeout(() => (exportBtn.textContent = "Exportar JSON"), 2000);
    });
  });

  const saveBtn = button("primary", "Salvar Template");
  saveBtn.addEventListener("click", () => {
    if (activeBuilderMode === "code") {
      try {
        const parsed = importLayoutFromYaml(codeEditor.value);
        layout.name = parsed.name;
        layout.system = parsed.system;
        layout.description = parsed.description;
        layout.theme = parsed.theme;
        layout.blocks = parsed.blocks;
        layout.tags = parsed.tags;
      } catch (err) {
        yamlErrorBanner.hidden = false;
        yamlErrorBanner.textContent = `⚠️ Corrija os erros no YAML antes de salvar: ${(err as Error).message}`;
        return;
      }
    } else {
      layout.name = nameInput.value.trim() || "Template Customizado";
      layout.system = systemInput.value.trim() || "RPG";
      layout.description = descInput.value.trim();
      layout.theme = (themeSelect.value as any) || "classic";
    }
    saveCustomLayout(layout);
    onSave?.(layout);
    overlay.remove();
  });

  const cancelBtn = button("ghost", "Cancelar");
  cancelBtn.addEventListener("click", () => overlay.remove());

  footer.append(exportYamlBtn, exportBtn, cancelBtn, saveBtn);

  box.append(header, body, footer);
  overlay.append(box);
  document.body.append(overlay);
  asDialog(overlay, layout.name, () => overlay.remove());
}
