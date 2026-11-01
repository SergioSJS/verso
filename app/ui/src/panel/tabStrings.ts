// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What hiding, ordering and bringing back the right panel's tabs says, in
// both languages (ADR 0035; ADR 0072's amendment of 2026-11-01).

import { LANG } from "../strings";

const pt = {
  hide: "Ocultar esta aba",
  show: (name: string) => `Mostrar “${name}”`,
  showAll: (n: number) => `Mostrar as abas ocultas (${n})`,
  reset: "Restaurar abas",
  settings: "Ajustar abas…",
  hidden: (name: string) => `Aba “${name}” oculta. Para trazê-la de volta: o menu ⋯ do painel ou Ajustes › Aparência.`,
  lastOne: "A última aba não pode ser ocultada.",
  restored: "Abas do painel restauradas.",
  group: "Abas do painel direito",
  lead: "Cada aba mostrada ou oculta, e a ordem delas. Mesa e Música só existem enquanto a mesa está ligada.",
  rowShown: (name: string) => `Mostrar a aba ${name}`,
  up: (name: string) => `Mover ${name} para cima`,
  down: (name: string) => `Mover ${name} para baixo`,
  tabsList: "Abas do painel direito",
};

const en: typeof pt = {
  hide: "Hide this tab",
  show: (name) => `Show “${name}”`,
  showAll: (n) => `Show the hidden tabs (${n})`,
  reset: "Reset tabs",
  settings: "Tab settings…",
  hidden: (name) => `Tab “${name}” hidden. To bring it back: the panel's ⋯ menu or Settings › Appearance.`,
  lastOne: "The last tab cannot be hidden.",
  restored: "Panel tabs reset.",
  group: "Right panel tabs",
  lead: "Each tab shown or hidden, and their order. Table and Music exist only while the table is on.",
  rowShown: (name) => `Show the ${name} tab`,
  up: (name) => `Move ${name} up`,
  down: (name) => `Move ${name} down`,
  tabsList: "Right panel tabs",
};

export const tabWords = LANG.toLowerCase().startsWith("pt") ? pt : en;
