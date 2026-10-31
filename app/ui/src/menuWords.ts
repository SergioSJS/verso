// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of the commands that open a page of the settings or a window
// from the menu bar and the palette (ADR 0035: pt-BR and English).

import { pt, t } from "./strings";

export const menuWords =
  t === pt
    ? { rpg: "Ajustes de Dados e RPG…", appearance: "Aparência e temas…", moreThemes: "Mais temas…", sync: "Sincronizar com…", credits: "Créditos…" }
    : { rpg: "Dice and RPG Settings…", appearance: "Appearance and Themes…", moreThemes: "More Themes…", sync: "Sync with…", credits: "Credits…" };
