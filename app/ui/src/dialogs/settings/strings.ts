// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the settings window says of its frame and of the statblock pages
// (ADR 0099), in pt-BR and English (ADR 0035); the oracle's page has its
// own words (oracleStrings.ts).

import { LANG } from "../../strings";

const pt = {
  // --- the frame
  gripTitle: "Redimensionar a janela (setas mudam o tamanho; Enter ou Início volta ao tamanho original)",
  gripLabel: "Redimensionar a janela de ajustes",
  // --- the groups of the side list
  groups: { app: "Aplicação", editor: "Notas & Editor", rpg: "RPG & Mesa Solo", system: "Rede & Conexões" },
  sOracles: "Oráculos e Solo RPG",
  sStatblocks: "Fichas e Templates",
  // --- shared
  ok: "Entendi",
  save: "Salvar",
  copied: "Copiado!",
  copyFailed: "Não foi possível copiar.",
  builtin: "Nativo",
  builtinFem: "Nativa",
  custom: "Personalizado",
  view: "Visualizar",
  edit: "Editar",
  remove: "Excluir",
  // --- statblock templates
  defaultLayoutTitle: "Layout Padrão de Ficha",
  defaultLayoutDesc: "Template usado para renderizar blocos que não indicam um layout: a propriedade name.",
  manageTitle: "Gerenciar Templates",
  manageDesc: "Crie layouts visuais personalizados ou importe um template em JSON do Verso.",
  newTemplate: "+ Novo Template",
  importJson: "Importar JSON…",
  pasteLayout: "Cole o JSON do template (layout.json):",
  importLayoutOk: (name: string) => `Template "${name}" importado.`,
  importLayoutFail: (why: string) => `Não foi possível importar o template: ${why}`,
  galleryTitle: "Galeria de Templates",
  galleryDesc: "Templates embutidos e personalizados prontos para uso em notas.",
  defaultPill: "Padrão",
  duplicate: "Duplicar",
  exportJson: "Exportar JSON",
  makeDefault: "Tornar Padrão",
  deleteLayoutAsk: (name: string) => `Excluir o template "${name}"? Isso não pode ser desfeito.`,
  layoutDeleted: (name: string) => `Template "${name}" excluído.`,
};

type Words = typeof pt;

const en: Words = {
  gripTitle: "Resize the window (arrow keys change the size; Enter or Home restores the original size)",
  gripLabel: "Resize the settings window",
  groups: { app: "Application", editor: "Notes & Editor", rpg: "RPG & Solo Play", system: "Network & System" },
  sOracles: "Oracles & Solo RPG",
  sStatblocks: "Statblock Templates",
  ok: "Got it",
  save: "Save",
  copied: "Copied!",
  copyFailed: "Could not copy.",
  builtin: "Built-in",
  builtinFem: "Built-in",
  custom: "Custom",
  view: "View",
  edit: "Edit",
  remove: "Delete",
  defaultLayoutTitle: "Default Statblock Layout",
  defaultLayoutDesc: "Template used for statblocks without an explicit layout: the name property.",
  manageTitle: "Manage Templates",
  manageDesc: "Create custom visual layouts or import a Verso template as JSON.",
  newTemplate: "+ New Template",
  importJson: "Import JSON…",
  pasteLayout: "Paste the layout JSON (layout.json):",
  importLayoutOk: (name) => `Template "${name}" imported.`,
  importLayoutFail: (why) => `Could not import the template: ${why}`,
  galleryTitle: "Template Gallery",
  galleryDesc: "Built-in and custom templates ready for use in notes.",
  defaultPill: "Default",
  duplicate: "Duplicate",
  exportJson: "Export JSON",
  makeDefault: "Make Default",
  deleteLayoutAsk: (name) => `Delete template "${name}"? This cannot be undone.`,
  layoutDeleted: (name) => `Template "${name}" deleted.`,
};

export const ss: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
