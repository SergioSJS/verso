// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the features switches say (ADR 0103 revised 2026-10-20; ADR 0035):
// pt-BR and English.

import type { FeatureId, ShortcutId } from "./featureList";
import { LANG } from "./strings";

type Words = {
  section: string;
  lead: string;
  shortcuts: string;
  shortcutsDesc: string;
  shortcutNames: Record<ShortcutId | "custom", string>;
  current: (name: string) => string;
  names: Record<FeatureId, string>;
  descs: Record<FeatureId, string>;
  on: string;
  off: string;
  askShortcut: (name: string, turnOn: string[], turnOff: string[]) => string;
  apply: string;
  cancel: string;
  statusChanged: (name: string, on: boolean) => string;
  statusShortcut: (name: string) => string;
  offHere: (feature: string) => string;
  turnOn: string;
};

const list = (names: string[]) => names.join(", ");

const pt: Words = {
  section: "Recursos",
  lead: "Recursos opcionais do Verso. Desligar um recurso não muda nenhum arquivo: o que ele criou continua na nota, só aparece como texto simples.",
  shortcuts: "Atalhos",
  shortcutsDesc: "Ligam ou desligam todos os recursos de uma vez. Antes, você vê o que vai mudar e pode cancelar.",
  shortcutNames: { everything: "Tudo", writing: "Só escrita", custom: "Personalizado" },
  current: (name) => `Agora: ${name}`,
  names: {
    diceRolling: "Dados",
    randomTables: "Tabelas sorteadas",
    oracles: "Oráculos",
    statblocks: "Fichas",
    campaignBundles: "Assistente de mundo e campanha",
    dataDiagram: "Diagrama de dados",
  },
  descs: {
    diceRolling: "Um `dice:` numa nota vira um botão que rola; também liga o comando \"Rolar dados…\" e os botões de dados dentro das fichas.",
    randomTables: "Uma tabela com ^id pode ser sorteada por um botão `dice:` na nota.",
    oracles: "Os callouts [!oracle] ganham um botão, e entram o comando \"Perguntar ao oráculo\" e o item da barra / no editor.",
    statblocks: "Blocos ```statblock aparecem como fichas visuais, e entra o item da barra / que cria uma ficha.",
    campaignBundles: "O assistente \"Novo projeto a partir de modelo\", no menu de criar e na paleta de comandos.",
    dataDiagram: "Arquivos JSON, YAML, TOML, XML e CSV ganham a vista \"Diagrama\" (caixas e linhas, só leitura), e um bloco de código desses formatos numa nota ganha o botão \"Ver como diagrama\".",
  },
  on: "ligado",
  off: "desligado",
  askShortcut: (name, turnOn, turnOff) =>
    `Atalho "${name}". ${turnOn.length ? `Vai ligar: ${list(turnOn)}. ` : ""}${turnOff.length ? `Vai desligar: ${list(turnOff)}. ` : ""}Nenhum arquivo muda.`,
  apply: "Aplicar",
  cancel: "Cancelar",
  statusChanged: (name, on) => `${name}: ${on ? "ligado" : "desligado"}`,
  statusShortcut: (name) => `Recursos: ${name}`,
  offHere: (feature) => `O recurso "${feature}" está desligado. Os arquivos não mudam; as notas mostram texto simples.`,
  turnOn: "Ligar",
};

const en: Words = {
  section: "Features",
  lead: "Optional features of Verso. Turning one off changes no file: what it made stays in the note and shows as plain text.",
  shortcuts: "Shortcuts",
  shortcutsDesc: "Turn every feature on or off at once. First you see what will change, and you can cancel.",
  shortcutNames: { everything: "Everything", writing: "Writing only", custom: "Custom" },
  current: (name) => `Now: ${name}`,
  names: {
    diceRolling: "Dice",
    randomTables: "Random tables",
    oracles: "Oracles",
    statblocks: "Statblocks",
    campaignBundles: "World and campaign wizard",
    dataDiagram: "Data diagram",
  },
  descs: {
    diceRolling: "A `dice:` in a note becomes a button that rolls; also turns on the \"Roll dice…\" command and the dice buttons inside statblocks.",
    randomTables: "A table with a ^id can be rolled by a `dice:` button in a note.",
    oracles: "[!oracle] callouts get a button, and the \"Ask the oracle\" command and the / menu item come in.",
    statblocks: "```statblock blocks show as visual cards, and the / menu item that makes a statblock comes in.",
    campaignBundles: "The \"New project from a template\" wizard, in the create menu and the command palette.",
    dataDiagram: "JSON, YAML, TOML, XML and CSV files get a \"Diagram\" view (boxes and lines, read-only), and a code block of those formats in a note gets a \"View as diagram\" button.",
  },
  on: "on",
  off: "off",
  askShortcut: (name, turnOn, turnOff) =>
    `Shortcut "${name}". ${turnOn.length ? `It will turn on: ${list(turnOn)}. ` : ""}${turnOff.length ? `It will turn off: ${list(turnOff)}. ` : ""}No file changes.`,
  apply: "Apply",
  cancel: "Cancel",
  statusChanged: (name, on) => `${name}: ${on ? "on" : "off"}`,
  statusShortcut: (name) => `Features: ${name}`,
  offHere: (feature) => `The "${feature}" feature is off. Files do not change; notes show plain text.`,
  turnOn: "Turn on",
};

export const fs: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
