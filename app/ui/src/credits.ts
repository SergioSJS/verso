// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The data behind Settings > Credits and acknowledgements: who Verso draws
// from, the notices of the game-system layouts it ships (ADR 0099 item 6,
// read from docs/reference/statblock-sources.md) and the open-source
// libraries. Kept apart from the page so a test can hold it and a new entry
// is one line. Credit lines are quoted in the language their source gives
// them; only the frame around them is translated.

import deps from "./creditsDeps.json";

/** A line in both languages. */
export type Say = { pt: string; en: string };

export type Credit = { id: string; name: string; line: Say; link: string; licence?: string; quote?: string; gloss?: string };

export const CREDITS: Credit[] = [
  {
    id: "igor",
    name: "Igor Téuri",
    line: {
      pt: "Autor do cofre de campanha “Dados Críticos”, cuja estrutura o pacote de campanha do Verso segue, com a permissão dele.",
      en: "Author of the campaign vault “Dados Críticos”, whose structure Verso's campaign bundle follows, by his permission.",
    },
    link: "https://fractal-system.itch.io/pt-br",
  },
  {
    id: "fractal",
    name: "Fractal RPG",
    line: { pt: "De Igor Téuri e Walter Licínio. Licença CC BY 4.0, conforme o texto do SRD.", en: "By Igor Téuri and Walter Licínio. CC BY 4.0, by the text of its SRD." },
    link: "https://fractal-system.itch.io/pt-br",
    licence: "CC BY 4.0",
    quote: "Esse trabalho é compatível com Fractal, de Igor Téuri e Walter Licínio, desenvolvido sob licença Creative Commons Attribution 4.0 License.",
    gloss: "This work is compatible with Fractal, by Igor Téuri and Walter Licínio, developed under the Creative Commons Attribution 4.0 License.",
  },
  {
    id: "rolai",
    name: "Rolai",
    line: {
      pt: "De Sérgio J. Sousa, licença MIT: o analisador de dados, o rolador e os perfis de sistema.",
      en: "By Sérgio J. Sousa, MIT: the dice parser, the roller and the system profiles.",
    },
    link: "https://github.com/SergioSJS/rolai",
    licence: "MIT",
  },
  {
    id: "fantasy-statblocks",
    name: "Fantasy Statblocks",
    line: {
      pt: "De Jeremy Valentine, licença MIT: as chaves YAML e o modelo de layout que o bloco de ficha do Verso segue.",
      en: "By Jeremy Valentine, MIT: the YAML keys and the layout model Verso's statblock block follows.",
    },
    link: "https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks",
    licence: "MIT",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    line: {
      pt: "O dialeto de Markdown com que o Verso se mantém compatível. Nenhum código do Obsidian é usado.",
      en: "The Markdown dialect Verso stays compatible with. No Obsidian code is used.",
    },
    link: "https://obsidian.md",
  },
];

export type SystemNotice = {
  id: string;
  /** The names a person knows it by. */
  name: string;
  licence: string;
  /** The credit lines, verbatim from docs/reference/statblock-sources.md. */
  lines: string[];
  link: string;
};

/** One entry per built-in layout family of ADR 0099 item 6. */
export const SYSTEMS: SystemNotice[] = [
  {
    id: "dnd5e-5.2.1",
    name: "D&D 5e SRD 5.2.1",
    licence: "CC BY 4.0",
    lines: [
      'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
    ],
    link: "https://www.dndbeyond.com/srd",
  },
  {
    id: "dnd5e-5.1",
    name: "D&D 5e SRD 5.1",
    licence: "CC BY 4.0",
    // The file gives 5.1 as "the same with" 5.1's name and address.
    lines: [
      'This work includes material from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
    ],
    link: "https://dnd.wizards.com/resources/systems-reference-document",
  },
  {
    id: "pathfinder2e",
    name: "Pathfinder 2e",
    licence: "ORC",
    lines: [
      "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense. All warranties are disclaimed as set forth therein.",
      "Pathfinder Player Core and Monster Core (c) Paizo Inc., used under the ORC License (paizo.com/orclicense). Not affiliated with Paizo.",
    ],
    link: "https://paizo.com/orclicense",
  },
  {
    id: "starfinder2e",
    name: "Starfinder 2e",
    licence: "ORC",
    // TODO-VERIFY: the file marks this line a template "to complete with
    // Paizo's exact notice from Player Core"; the registration number is
    // not read from the publisher. Replace with the exact notice.
    lines: [
      "This product is licensed under the ORC License located at the Library of Congress (registration to be filled from the publisher's notice) and available online at paizo.com/orclicense. Portions use Starfinder Second Edition mechanics by Paizo Inc. Reserved Material (names, trade dress, art, setting elements) is excluded.",
    ],
    link: "https://paizo.com/orclicense",
  },
  {
    id: "13th-age",
    name: "13th Age",
    licence: "OGL 1.0a",
    // TODO-VERIFY: the file says to carry the full Section 15 from
    // https://www.13thagesrd.com/legal; only the lines it quotes are here.
    lines: [
      "Open Game License v 1.0 Copyright 2000, Wizards of the Coast, Inc.",
      "System Reference Document Copyright 2000, Wizards of the Coast, Inc. Authors: Jonathan Tweet, Monte Cook, Skip Williams, based on material by E. Gary Gygax and Dave Arneson.",
      "Copyright (C) 2013 Fire Opal Media. All Rights Reserved. Licensed under the Open Game License.",
      "The 13th Age RPG and supplements are published under exclusive license to Pelgrane Press.",
    ],
    link: "https://www.13thagesrd.com/legal",
  },
  {
    id: "dungeon-world",
    name: "Dungeon World",
    licence: "CC BY 3.0",
    lines: [
      "Dungeon World is based on the work of Sage LaTorra and Adam Koebel and is licensed under the Creative Commons Attribution 3.0 Unported License (http://creativecommons.org/licenses/by/3.0/).",
    ],
    link: "https://www.dungeonworldsrd.com/",
  },
  {
    id: "blades",
    name: "Blades in the Dark",
    licence: "CC BY 3.0",
    lines: [
      "This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).",
    ],
    link: "https://bladesinthedark.com/licensing",
  },
  {
    id: "fate",
    name: "Fate Condensed / Fate Accelerated",
    licence: "CC BY 3.0",
    lines: [
      "This work is based on Fate Core System and Fate Accelerated Edition (found at https://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/).",
      "This work is based on Fate Condensed (found at https://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by PK Sullivan, Lara Turner, Fred Hicks, Richard Bellingham, Robert Hanz, and Sophie Lagace, and licensed for our use under the Creative Commons Attribution 3.0 Unported license.",
    ],
    link: "https://fate-srd.com/official-licensing-fate",
  },
  {
    id: "mausritter",
    name: "Mausritter",
    licence: "CC BY 4.0 + Mausritter Third Party Licence",
    lines: [
      "This work is based on Mausritter (https://mausritter.com/), a product of Losing Games and Isaac Williams, and is licensed for use under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence.",
      "Mausritter is copyright Losing Games.",
    ],
    link: "https://mausritter.com/third-party-licence",
  },
  {
    id: "ironsworn",
    name: "Ironsworn / Starforged",
    licence: "CC BY 4.0 (open parts)",
    // TODO-VERIFY: the file marks this wording UNVERIFIED ("as noted on the
    // Ironsworn licensing page"); it is a draft to check against
    // https://tomkinpress.com/blogs/news/lets-talk-about-ironsworn-licensing
    lines: [
      "Ironsworn and Ironsworn: Starforged by Shawn Tomkin, licensed under CC BY 4.0 (Starforged Reference Guide, SRD) - https://www.ironswornrpg.com. Not an official product.",
    ],
    link: "https://tomkinpress.com/blogs/news/lets-talk-about-ironsworn-licensing",
  },
  {
    id: "cairn",
    name: "Cairn",
    licence: "CC BY-SA 4.0",
    // TODO-VERIFY: "proposed by the research" in the file, not a line the
    // publisher prescribes.
    lines: ["Cairn is by Yochai Gal and licensed under CC BY-SA 4.0 (https://cairnrpg.com)."],
    link: "https://cairnrpg.com",
  },
  {
    id: "old-dragon-2e",
    name: "Old Dragon 2e",
    licence: "CC BY-SA 4.0",
    // TODO-VERIFY: the file restored the accents by hand and asks to check
    // against https://olddragon.com.br/licenciamento
    lines: [
      "Old Dragon 2ª Edição © 2023 da Old Dragon Editora está licenciado sob CC BY-SA 4.0 e é uma criação de Antônio Sá Neto, Dan Ramos e Fabiano Neme baseado nos originais de Gary Gygax e Dave Arneson. Para ver uma cópia desta licença, visite http://creativecommons.org/licenses/by-sa/4.0/.",
    ],
    link: "https://olddragon.com.br/licenciamento",
  },
  {
    id: "fractal",
    name: "Fractal",
    licence: "CC BY 4.0",
    // TODO-VERIFY: the SRD's text says CC BY 4.0, its badge shows BY-SA;
    // pending the authors (ADR 0099 item 6).
    lines: ["Esse trabalho é compatível com Fractal, de Igor Téuri e Walter Licínio, desenvolvido sob licença Creative Commons Attribution 4.0 License."],
    link: "https://fractal-system.itch.io/pt-br",
  },
];

export type Dependency = { name: string; version: string; license: string; link: string };

/** Written by scripts/credits-deps.mjs from node_modules at build time. */
const JS_LIBS: Dependency[] = deps.map(({ name, version, license, link }) => ({ name, version, license, link }));

/** Rust: licences read from the crates' own Cargo.toml (tauri 2.11.6, yrs 0.28.0). */
const RUST_LIBS: Dependency[] = [
  { name: "Tauri", version: "2", license: "Apache-2.0 OR MIT", link: "https://tauri.app" },
  { name: "yrs (Yjs for Rust)", version: "0.28", license: "MIT", link: "https://github.com/y-crdt/y-crdt" },
];

export const DEPENDENCIES: Dependency[] = [...RUST_LIBS, ...JS_LIBS];

/** The built-in families ADR 0099 item 6 lists; the test holds SYSTEMS to it. */
export const BUILT_IN_IDS = ["dnd5e-5.2.1", "dnd5e-5.1", "pathfinder2e", "starfinder2e", "13th-age", "dungeon-world", "blades", "fate", "mausritter", "ironsworn", "cairn", "old-dragon-2e", "fractal"];
