// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the 3D dice's appearance settings say (ADR 0101, appearance; ADR
// 0035): pt-BR and English. The names are Rolai's.

import { LANG } from "../strings";
import type { RollTime } from "./timeline";
import type { MaterialId, SlotId, TextureId } from "./look";

type Words = {
  prefix: string;
  size: string;
  sizeDesc: string;
  sizeValue: (pct: number) => string;
  time: string;
  timeDesc: string;
  times: Record<RollTime, string>;
  sound: string;
  soundDesc: string;
  others: string;
  othersDesc: string;
  slots: string;
  slotsDesc: string;
  slotNames: Record<SlotId, string>;
  slotShort: (slot: SlotId) => string;
  preview: string;
  style: string;
  styleDesc: string;
  custom: string;
  presets: Record<string, string>;
  body: string;
  number: string;
  outline: string;
  colorsDesc: string;
  pick: (what: string) => string;
  hex: (what: string) => string;
  invalid: string;
  contrastLow: (ratio: string) => string;
  contrastOk: (ratio: string) => string;
  material: string;
  materials: Record<MaterialId, string>;
  texture: string;
  textures: Record<TextureId, string>;
  textureDesc: string;
  test: string;
  testDesc: string;
  roll: string;
  rolled: (a: number, b: number, c: number) => string;
  offSwitch: string;
  offMotion: string;
  offGl: string;
};

const pt: Words = {
  prefix: "Dados 3D",
  size: "Dados 3D: tamanho",
  sizeDesc: "Quanto o dado ocupa na tela, de 70% a 160%. Os dados caem na parte de baixo do painel em uso; 100% é um dado de cerca de 70 pixels num notebook, e o tamanho acompanha a janela.",
  sizeValue: (p) => `${p}%`,
  time: "Duração da rolagem",
  timeDesc: "Quão depressa os dados caem: Rápida, Normal ou Lenta. Depois de parar, os dados ficam na mesa até você mexer em algo: um clique fora dos botões, Esc ou a próxima rolagem.",
  times: { fast: "Rápida", normal: "Normal", slow: "Lenta" },
  sound: "Som dos dados",
  soundDesc: "Toca o barulho dos dados batendo na mesa e uns nos outros enquanto caem, com as gravações do Rolai (domínio público). Desligado por padrão.",
  others: "Mostrar em 3D as rolagens dos outros",
  othersDesc: "Numa nota compartilhada, a rolagem de outra pessoa também cai em 3D na sua tela quando os dados 3D estão ligados (nos dados dela, quando o servidor os envia). Desligado, só as suas rolagens caem.",
  slots: "Dados 3D: cores",
  slotsDesc: "Três conjuntos de cor. Uma rolagem usa o conjunto 1; um perfil de dados pode dar a um grupo de dados o 2 ou o 3 (como a Fome do Vampiro). Escolha o conjunto e mude o estilo abaixo.",
  slotNames: { "1": "1 · Primário", "2": "2 · Secundário", "3": "3 · Terciário" },
  slotShort: (s) => `Cor ${s}`,
  preview: "Prévia dos três conjuntos de cor",
  style: "Dados 3D: estilo",
  styleDesc: "Um conjunto pronto de cores, textura e material para o conjunto escolhido. \"Do Verso\" segue a paleta do aplicativo. Mudar uma cor, a textura ou o material vira \"Personalizado\".",
  custom: "Personalizado",
  presets: { verso: "Do Verso", esmeralda: "Esmeralda", osso: "Osso", obsidiana: "Obsidiana", sangue: "Sangue", abissal: "Abissal", gelo: "Gelo", escamas: "Escamas", madeira: "Taverna" },
  body: "Corpo",
  number: "Número",
  outline: "Contorno",
  colorsDesc: "A cor do corpo do dado, a dos números e a do contorno dos números, em hexadecimal ou no seletor.",
  pick: (what) => `Seletor de ${what}`,
  hex: (what) => `${what}, em hexadecimal`,
  invalid: "Isso não é uma cor. Use #rrggbb.",
  contrastLow: (ratio) => `Atenção: contraste de ${ratio}:1 entre o número e o corpo. Abaixo de 3:1 os números ficam difíceis de ler.`,
  contrastOk: (ratio) => `Contraste de ${ratio}:1 entre o número e o corpo.`,
  material: "Material",
  materials: { auto: "Automático (da textura)", plastic: "Plástico", metal: "Metal", wood: "Madeira", glass: "Vidro", none: "Fosco" },
  texture: "Textura",
  textures: { none: "Lisa", marble: "Mármore", speckles: "Pintas", glitter: "Glitter", stars: "Estrelas", astral: "Céu astral", cloudy: "Nuvens", fire: "Fogo", water: "Água", ice: "Gelo", paper: "Papel", wood: "Madeira", metal: "Aço", stainedglass: "Vitral", skulls: "Caveiras", dragon: "Dragão", leopard: "Leopardo", tiger: "Tigre", lizard: "Lagarto", bird: "Pena" },
  textureDesc: "As imagens originais do 3DDiceRoller (domínio público), que vêm com o aplicativo; se uma não carregar, o Verso desenha a textura.",
  test: "Dados 3D: testar",
  testDesc: "Rola um d20 (cor 1) e dois d6 (cores 2 e 3) com a aparência de agora. Só para olhar: nada é escrito numa nota. Esc pula a queda.",
  roll: "Rolar para testar",
  rolled: (a, b, c) => `d20: ${a}, d6: ${b}, d6: ${c}`,
  offSwitch: "Os dados 3D estão desligados. Ligue \"Dados 3D\" nesta página para testar.",
  offMotion: "O sistema pede menos movimento, então os dados 3D não animam. Nada para testar.",
  offGl: "Dados 3D indisponíveis neste computador (sem aceleração gráfica); as rolagens aparecem em 2D.",
};

const en: Words = {
  prefix: "3D dice",
  size: "3D dice: size",
  sizeDesc: "How much room a die takes on the screen, from 70% to 160%. The dice fall on the lower part of the pane in use; 100% is a die about 70 pixels across on a laptop, and the size follows the window.",
  sizeValue: (p) => `${p}%`,
  time: "Roll duration",
  timeDesc: "How fast the dice fall: Fast, Normal or Slow. Once they stop, the dice stay on the table until you touch something: a click away from the buttons, Esc or the next roll.",
  times: { fast: "Fast", normal: "Normal", slow: "Slow" },
  sound: "Dice sound",
  soundDesc: "Plays the sound of the dice hitting the table and each other as they fall, with Rolai's recordings (public domain). Off by default.",
  others: "Show others' rolls in 3D",
  othersDesc: "In a shared note, another person's roll also falls in 3D on your screen when 3D dice are on (in their dice, when the server sends them). Off, only your own rolls fall.",
  slots: "3D dice: colours",
  slotsDesc: "Three colour sets. A roll uses set 1; a dice profile can give a group of dice set 2 or 3 (like Vampire's Hunger dice). Pick a set and change its style below.",
  slotNames: { "1": "1 · Primary", "2": "2 · Secondary", "3": "3 · Tertiary" },
  slotShort: (s) => `Colour ${s}`,
  preview: "Preview of the three colour sets",
  style: "3D dice: style",
  styleDesc: "A ready set of colours, texture and material for the chosen set. \"Verso's own\" follows the app's palette. Changing a colour, the texture or the material makes it \"Custom\".",
  custom: "Custom",
  presets: { verso: "Verso's own", esmeralda: "Emerald", osso: "Bone", obsidiana: "Obsidian", sangue: "Blood", abissal: "Abyssal", gelo: "Ice", escamas: "Scales", madeira: "Tavern" },
  body: "Body",
  number: "Number",
  outline: "Outline",
  colorsDesc: "The colour of the die's body, of the numbers and of the numbers' outline, in hex or with the picker.",
  pick: (what) => `${what} picker`,
  hex: (what) => `${what}, in hex`,
  invalid: "That is not a colour. Use #rrggbb.",
  contrastLow: (ratio) => `Warning: ${ratio}:1 contrast between the number and the body. Below 3:1 the numbers are hard to read.`,
  contrastOk: (ratio) => `${ratio}:1 contrast between the number and the body.`,
  material: "Material",
  materials: { auto: "Automatic (from the texture)", plastic: "Plastic", metal: "Metal", wood: "Wood", glass: "Glass", none: "Matte" },
  texture: "Texture",
  textures: { none: "Plain", marble: "Marble", speckles: "Speckles", glitter: "Glitter", stars: "Stars", astral: "Astral sky", cloudy: "Clouds", fire: "Fire", water: "Water", ice: "Ice", paper: "Paper", wood: "Wood", metal: "Steel", stainedglass: "Stained glass", skulls: "Skulls", dragon: "Dragon", leopard: "Leopard", tiger: "Tiger", lizard: "Lizard", bird: "Feather" },
  textureDesc: "The original images of 3DDiceRoller (public domain), shipped with the app; if one does not load, Verso draws the texture.",
  test: "3D dice: test",
  testDesc: "Rolls a d20 (colour 1) and two d6 (colours 2 and 3) with the look as it is now. For looking only: nothing is written to a note. Esc skips the fall.",
  roll: "Roll to test",
  rolled: (a, b, c) => `d20: ${a}, d6: ${b}, d6: ${c}`,
  offSwitch: "3D dice are off. Turn on \"3D dice\" on this page to test.",
  offMotion: "The system asks for less motion, so the 3D dice do not animate. Nothing to test.",
  offGl: "3D dice unavailable on this computer (no graphics acceleration); rolls show in 2D.",
};

export const ls: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
