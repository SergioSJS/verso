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
import { OGL_13TH_AGE_SECTION_15, OGL_1_0A, OGL_OPEN_CONTENT } from "./oglText";

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
    link: "https://linktr.ee/dadoscriticos",
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
    id: "dice-textures",
    name: "3D Dice Roller (MajorVictory)",
    line: {
      pt: "As imagens das texturas dos dados 3D (Ajustes › RPG & Mesa Solo › Dados e RPG › Dados 3D: textura) e os sons dos dados (Som dos dados), pelo pacote dice-box-threejs do Rolai, vêm do repositório MajorVictory/3DDiceRoller, dedicado ao domínio público.",
      en: "The 3D dice texture images (Settings › RPG & Solo Play › Dice and RPG › 3D dice: texture) and the dice sounds (Dice sound), through Rolai's dice-box-threejs package, come from the MajorVictory/3DDiceRoller repository, dedicated to the public domain.",
    },
    link: "https://github.com/MajorVictory/3DDiceRoller",
    licence: "The Unlicense",
  },
  {
    id: "randommind",
    name: "RandomMind",
    line: {
      pt: "As duas músicas de amostra do tutorial (nota 36, assets/sons): “The Old Tower Inn” e “The Bard's Tale”, em domínio público (CC0 1.0), do OpenGameArt.",
      en: "The tutorial's two sample tracks (note 36, assets/sons): “The Old Tower Inn” and “The Bard's Tale”, in the public domain (CC0 1.0), from OpenGameArt.",
    },
    link: "https://opengameart.org/users/randommind",
    licence: "CC0 1.0",
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
  {
    id: "jsoncrack",
    name: "JSON Crack",
    line: {
      pt: "De Aykut Saraç, licença Apache-2.0: a ideia da vista de caixas e linhas para dados estruturados, que o diagrama de dados do Verso segue. Nenhum código dele é usado; o desenho e a organização das caixas são do Verso.",
      en: "By Aykut Saraç, Apache-2.0: the idea of the box-and-line view of structured data, which Verso's data diagram follows. None of its code is used; the drawing and the layout of the boxes are Verso's own.",
    },
    link: "https://github.com/AykutSarac/jsoncrack.com",
    licence: "Apache-2.0",
  },
];

export type SystemNotice = {
  id: string;
  /** The names a person knows it by. */
  name: string;
  licence: string;
  /** The credit lines, as the publisher's own page gives them
   *  (docs/reference/statblock-sources.md says where each was read). */
  lines: string[];
  link: string;
  /** A licence whose text must travel with the content (the OGL's section
   *  10): shown whole beside the notice. */
  licenceText?: { title: string; paragraphs: readonly string[] };
};

const DARK_PACK_RIGHTS = "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission.";
const DARK_PACK_MORE = "All rights reserved. For more information please visit worldofdarkness.com.";

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
    // The ORC Notice is the licence's own required text (III.a), read at
    // https://paizo.com/orclicense on 2026-10-20, the "various locations"
    // completed as its sample does. The attribution is a statement in our
    // words (III.b asks for a good-faith statement, worded in any accurate
    // and reasonable manner). Paizo's own Starfinder notice and its list of
    // Reserved Material were not found online, so none is claimed here.
    lines: [
      "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense. All warranties are disclaimed as set forth therein.",
      "Starfinder Second Edition (c) Paizo Inc., used under the ORC License. Not affiliated with Paizo.",
    ],
    link: "https://paizo.com/orclicense",
  },
  {
    id: "13th-age",
    name: "13th Age",
    licence: "OGL 1.0a",
    // Section 15 and the declaration of Open Game Content are the 13th Age
    // SRD's own (https://www.13thagesrd.com/legal, read 2026-10-20); the
    // licence's text, which its section 10 asks to accompany the content, is
    // in oglText.ts and shown with the notice.
    lines: [...OGL_13TH_AGE_SECTION_15, "Copyright © 2013 Fire Opal Media. All Rights Reserved. Licensed under the Open Game License.", OGL_OPEN_CONTENT],
    link: "https://www.13thagesrd.com/legal",
    licenceText: { title: "Open Game License v1.0a", paragraphs: OGL_1_0A },
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
    licence: "Mausritter Third Party Licence",
    // The two texts the licence says must be legible in the product, read at
    // https://mausritter.com/third-party-licence on 2026-10-20 (the page is
    // drawn by script; the strings are in its page bundle). Verso is the
    // "Product name", Sérgio Sousa (Meio-Orc) the author — the maintainer's choice, 2026-10-20.
    lines: [
      "Verso is an independent production by Sérgio Sousa (Meio-Orc) and is not affiliated with Losing Games. It is published under the Mausritter Third Party Licence.",
      "Mausritter is copyright Losing Games.",
    ],
    link: "https://mausritter.com/third-party-licence",
  },
  {
    id: "ironsworn",
    name: "Ironsworn / Starforged",
    licence: "CC BY 4.0",
    // The credit text for commercial works from "How to Provide Credit" at
    // https://www.ironswornrpg.com/licensing (read 2026-10-20), <game titles>
    // filled in with the games the layouts follow. The CC BY covers text only.
    lines: [
      "This work is based on Ironsworn and Ironsworn: Starforged, created by Shawn Tomkin, and licensed for our use under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).",
    ],
    link: "https://www.ironswornrpg.com/licensing",
  },
  {
    id: "cairn",
    name: "Cairn",
    licence: "CC BY-SA 4.0",
    // https://cairnrpg.com says "The game was written by Yochai Gal" and "The
    // full text is licensed under CC-BY-SA 4.0" and prescribes no credit
    // wording (read 2026-10-20); this is the statement CC BY-SA asks for:
    // author, licence and its link.
    lines: [
      "This work is based on Cairn, written by Yochai Gal (https://cairnrpg.com), and licensed for our use under the Creative Commons Attribution-ShareAlike 4.0 International License (https://creativecommons.org/licenses/by-sa/4.0/).",
    ],
    link: "https://cairnrpg.com",
  },
  {
    id: "old-dragon-2e",
    name: "Old Dragon 2e",
    licence: "CC BY-SA 4.0",
    // The line is the one https://olddragon.com.br/licenciamento gives for
    // the page of a work (read 2026-10-20), word for word: it writes the
    // author "Antonio" without an accent. The licence also asks for its badge
    // on a product's title page and back cover, which a settings page is not.
    lines: [
      "Old Dragon 2ª Edição © 2023 da Old Dragon Editora está licenciado sob CC BY-SA 4.0 e é uma criação de Antonio Sá Neto, Dan Ramos e Fabiano Neme baseado nos originais de Gary Gygax e Dave Arneson. Para ver uma cópia desta licença, visite http://creativecommons.org/licenses/by-sa/4.0/.",
    ],
    link: "https://olddragon.com.br/licenciamento",
  },
  {
    id: "vtm5",
    name: "Vampire: The Masquerade",
    licence: "Paradox Dark Pack",
    // The Dark Pack's two required lines, word for word, then the statement
    // that the content is not official World of Darkness material (the
    // agreement gives no wording for it; this is docs/reference/statblock-sources.md's
    // suggestion), read at https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement
    // on 2026-10-21. The agreement also asks for the Dark Pack logo: Paradox's
    // own file, unaltered, is shown beside this notice (creditsItems.ts,
    // web-assets/darkpack-logo.png).
    lines: [
      "Vampire: The Masquerade, World of Darkness and related terms are trademarks of Paradox Interactive AB.",
      DARK_PACK_RIGHTS,
      DARK_PACK_MORE,
      "This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack.",
    ],
    link: "https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement",
  },
  {
    id: "wta5",
    name: "Werewolf: The Apocalypse",
    licence: "Paradox Dark Pack",
    // The Dark Pack's two required lines, word for word, then the statement
    // that the content is not official World of Darkness material (the
    // agreement gives no wording for it; this is docs/reference/statblock-sources.md's
    // suggestion), read at https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement
    // on 2026-10-21. The agreement also asks for the Dark Pack logo: Paradox's
    // own file, unaltered, is shown beside this notice (creditsItems.ts,
    // web-assets/darkpack-logo.png).
    lines: [
      "Werewolf: The Apocalypse, World of Darkness and related terms are trademarks of Paradox Interactive AB.",
      DARK_PACK_RIGHTS,
      DARK_PACK_MORE,
      "This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack.",
    ],
    link: "https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement",
  },
  {
    id: "htr5",
    name: "Hunter: The Reckoning",
    licence: "Paradox Dark Pack",
    // The Dark Pack's two required lines, word for word, then the statement
    // that the content is not official World of Darkness material (the
    // agreement gives no wording for it; this is docs/reference/statblock-sources.md's
    // suggestion), read at https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement
    // on 2026-10-21. The agreement also asks for the Dark Pack logo: Paradox's
    // own file, unaltered, is shown beside this notice (creditsItems.ts,
    // web-assets/darkpack-logo.png).
    lines: [
      "Hunter: The Reckoning, World of Darkness and related terms are trademarks of Paradox Interactive AB.",
      DARK_PACK_RIGHTS,
      DARK_PACK_MORE,
      "This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack.",
    ],
    link: "https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement",
  },
  {
    id: "cyberpunk-red",
    name: "Cyberpunk RED",
    licence: "R. Talsorian Games Homebrew Content Policy",
    // The policy's required disclaimer, word for word, read at
    // https://rtalsoriangames.com/homebrew-content-policy/ on 2026-10-21;
    // "[Title of your Content]" is each blank layout's name. Blank sheets of
    // field names only: no text, no stat block, no art of R. Talsorian's.
    lines: [
      "Blank sheet — for Cyberpunk RED is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.",
      "NPC sheet — for Cyberpunk RED is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.",
    ],
    link: "https://rtalsoriangames.com/homebrew-content-policy/",
  },
  {
    id: "fractal",
    name: "Fractal",
    licence: "CC BY 4.0",
    // CC BY 4.0, as the SRD says (the maintainer, 2026-10-22 and 2026-10-29).
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
export const BUILT_IN_IDS = ["dnd5e-5.2.1", "dnd5e-5.1", "pathfinder2e", "starfinder2e", "13th-age", "dungeon-world", "blades", "fate", "mausritter", "ironsworn", "cairn", "old-dragon-2e", "vtm5", "wta5", "htr5", "cyberpunk-red", "fractal"];
