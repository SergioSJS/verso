// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The frame of Settings > Credits (pt-BR and English, ADR 0035). The credit
// lines themselves stay in the language their source gives (src/credits.ts).

import { LANG } from "../../strings";

const pt = {
  section: "Créditos e agradecimentos",
  lead: "Quem e o que o Verso usa, e os avisos que cada licença pede. Dos sistemas de jogo, cada linha é citada como a fonte a dá; a lista completa do software livre está nos arquivos de dependências do código-fonte.",
  worksGroup: "Pessoas e obras de que o Verso parte",
  systemsGroup: "Avisos dos layouts de ficha que o Verso traz (sistemas de jogo)",
  softwareGroup: "Software livre",
  openLink: (name: string) => `Abrir ${name} no navegador`,
  visit: "Abrir",
  licence: (l: string) => `Licença: ${l}`,
  darkPackLogo: "Logotipo do Dark Pack, da Paradox Interactive",
};
const en: typeof pt = {
  section: "Credits and acknowledgements",
  lead: "Who and what Verso draws from, and the notices each licence asks for. For the game systems each line is quoted as its source gives it; the complete list of open-source software is in the source's dependency files.",
  worksGroup: "People and works Verso draws from",
  systemsGroup: "Notices of the sheet layouts Verso ships (game systems)",
  softwareGroup: "Open-source software",
  openLink: (name: string) => `Open ${name} in the browser`,
  visit: "Open",
  licence: (l: string) => `Licence: ${l}`,
  darkPackLogo: "Dark Pack logo, by Paradox Interactive",
};
export const cs = LANG.toLowerCase().startsWith("pt") ? pt : en;
export const isPt = LANG.toLowerCase().startsWith("pt");
