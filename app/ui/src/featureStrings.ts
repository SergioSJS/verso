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
  askShortcut: (name: string, turnOn: string[], turnOff: string[], notOn: string[]) => string;
  apply: string;
  cancel: string;
  statusChanged: (name: string, on: boolean) => string;
  statusShortcut: (name: string) => string;
  offHere: (feature: string) => string;
  turnOn: string;
  groups: { rpg: string };
  rpgSection: string;
  rpgLead: string;
  rpgLink: string;
  allOn: string;
  allOff: string;
  groupBulk: (group: string) => string;
  statusGroup: (group: string, on: boolean) => string;
  settingsLink: string;
  settingsLinkFor: (feature: string) => string;
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
    colorSwatches: "Amostras de cor",
    dice3d: "Dados 3D",
    table: "Mesa",
    tableSound: "Som da mesa",
  },
  descs: {
    diceRolling: "Um `dice:` numa nota vira um botão que rola; também liga o comando \"Rolar dados…\" e os botões de dados dentro das fichas.",
    randomTables: "Uma tabela com ^id pode ser sorteada por um botão `dice:` na nota.",
    oracles: "Os callouts [!oracle] ganham um botão, e entram o comando \"Perguntar ao oráculo\" e o item da barra / no editor.",
    statblocks: "Blocos ```statblock aparecem como fichas visuais, e entra o item da barra / que cria uma ficha.",
    campaignBundles: "O assistente \"Novo projeto a partir de modelo\", no menu de criar e na paleta de comandos.",
    dataDiagram: "Arquivos JSON, YAML, TOML, XML e CSV ganham a vista \"Diagrama\" (caixas e linhas, só leitura), e um bloco de código desses formatos numa nota ganha o botão \"Ver como diagrama\".",
    colorSwatches: "Um código de cor numa nota (#1d9e75, rgb(29 158 117), hsl(…)) ganha um quadradinho da cor ao lado; no editor, um clique nele abre um seletor de cor que reescreve o código. Um #código solto no texto que o Verso lê como etiqueta (#bada55) continua etiqueta e não ganha quadradinho; dentro de um código, `#bada55`, ganha.",
    dice3d: "Ao rolar um dado, dados 3D caem na tela antes de o resultado aparecer; o resultado já foi sorteado, a animação só o mostra. Fica desligado mesmo no atalho \"Tudo\" (pesa na bateria) e nunca anima se o sistema pede menos movimento. Os dados ficam na mesa até você mexer em algo (um clique fora dos botões, Esc ou a próxima rolagem).",
    table: "Um painel \"Mesa\" no painel da direita com todas as rolagens, sorteios de tabela e perguntas ao oráculo desta pasta, quem fez cada uma e de qual nota. Precisa de Dados ligado. Desligado, não há painel nem botão e as rolagens nas notas funcionam como sempre.",
    tableSound: "Música no painel Mesa que todos da mesa ouvem: o mestre toca um arquivo de som da pasta (ou um link de som numa nota, com um botão de tocar), pausa, avança, repete; cada pessoa tem o próprio volume. Sozinho numa pasta deste computador, toca só para você. Precisa de Mesa ligada. Desligado, não há música, botão nem item na barra de status, e nada é carregado.",
  },
  on: "ligado",
  off: "desligado",
  askShortcut: (name, turnOn, turnOff, notOn) =>
    `Atalho "${name}". ${turnOn.length ? `Vai ligar: ${list(turnOn)}. ` : ""}${turnOff.length ? `Vai desligar: ${list(turnOff)}. ` : ""}${notOn.length ? `Não liga: ${list(notOn)}. ` : ""}Nenhum arquivo muda.`,
  apply: "Aplicar",
  cancel: "Cancelar",
  statusChanged: (name, on) => `${name}: ${on ? "ligado" : "desligado"}`,
  statusShortcut: (name) => `Recursos: ${name}`,
  offHere: (feature) => `O recurso "${feature}" está desligado. Os arquivos não mudam; as notas mostram texto simples.`,
  turnOn: "Ligar",
  groups: { rpg: "RPG e mesa" },
  rpgSection: "Dados e RPG",
  rpgLead: "Os recursos de RPG e mesa, um por chave. Desligar um não muda nenhum arquivo: o que ele criou continua na nota, só aparece como texto simples. Os atalhos \"Tudo\" e \"Só escrita\" ficam em Aplicação › Recursos e valem para estes também.",
  rpgLink: "Os recursos de RPG ficam em RPG & Mesa Solo › Dados e RPG",
  allOn: "Ligar todos",
  allOff: "Desligar todos",
  groupBulk: (group) => `Todos os recursos de ${group}`,
  statusGroup: (group, on) => `Recursos de ${group}: ${on ? "ligados" : "desligados"}`,
  settingsLink: "Ajustes…",
  settingsLinkFor: (feature) => `Abrir os ajustes de ${feature}`,
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
    colorSwatches: "Colour swatches",
    dice3d: "3D dice",
    table: "Table",
    tableSound: "Table sound",
  },
  descs: {
    diceRolling: "A `dice:` in a note becomes a button that rolls; also turns on the \"Roll dice…\" command and the dice buttons inside statblocks.",
    randomTables: "A table with a ^id can be rolled by a `dice:` button in a note.",
    oracles: "[!oracle] callouts get a button, and the \"Ask the oracle\" command and the / menu item come in.",
    statblocks: "```statblock blocks show as visual cards, and the / menu item that makes a statblock comes in.",
    campaignBundles: "The \"New project from a template\" wizard, in the create menu and the command palette.",
    dataDiagram: "JSON, YAML, TOML, XML and CSV files get a \"Diagram\" view (boxes and lines, read-only), and a code block of those formats in a note gets a \"View as diagram\" button.",
    colorSwatches: "A colour code in a note (#1d9e75, rgb(29 158 117), hsl(…)) gets a small square of its colour beside it; in the editor, a click on it opens a colour picker that rewrites the code. A bare #code in text that Verso reads as a tag (#bada55) stays a tag and gets no square; inside code, `#bada55`, it does.",
    dice3d: "Rolling a die drops 3D dice on the screen before the result shows; the result is already drawn, the animation only stages it. It stays off even with the \"Everything\" shortcut (it is heavy on the battery) and never animates when the system asks for less motion. The dice stay on the table until you touch something (a click away from the buttons, Esc or the next roll).",
    table: "A \"Table\" panel in the right panel with every roll, random-table roll and oracle question of this folder, who made each one and from which note. Needs Dice on. Off, there is no panel and no button, and rolls in notes work as they always did.",
    tableSound: "Music in the Table panel that everyone at the table hears: the game master plays a sound file of the folder (or a sound link in a note, with a play button), pauses, skips, loops; each person has their own volume. Alone in a folder of this computer, it plays for you only. Needs Table on. Off, there is no music, no button, no status-bar item, and nothing is loaded.",
  },
  on: "on",
  off: "off",
  askShortcut: (name, turnOn, turnOff, notOn) =>
    `Shortcut "${name}". ${turnOn.length ? `It will turn on: ${list(turnOn)}. ` : ""}${turnOff.length ? `It will turn off: ${list(turnOff)}. ` : ""}${notOn.length ? `It does not turn on: ${list(notOn)}. ` : ""}No file changes.`,
  apply: "Apply",
  cancel: "Cancel",
  statusChanged: (name, on) => `${name}: ${on ? "on" : "off"}`,
  statusShortcut: (name) => `Features: ${name}`,
  offHere: (feature) => `The "${feature}" feature is off. Files do not change; notes show plain text.`,
  turnOn: "Turn on",
  groups: { rpg: "RPG and tabletop" },
  rpgSection: "Dice and RPG",
  rpgLead: "The RPG and tabletop features, one switch each. Turning one off changes no file: what it made stays in the note and shows as plain text. The \"Everything\" and \"Writing only\" shortcuts are in Application › Features and cover these too.",
  rpgLink: "The RPG features are in RPG & Solo Play › Dice and RPG",
  allOn: "Turn all on",
  allOff: "Turn all off",
  groupBulk: (group) => `Every feature of ${group}`,
  statusGroup: (group, on) => `${group} features: ${on ? "on" : "off"}`,
  settingsLink: "Settings…",
  settingsLinkFor: (feature) => `Open the settings of ${feature}`,
};

export const fs: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
