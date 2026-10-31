# Statblock sources — what each built-in layout is made from

- Date: 2026-10-20
- Source: the research behind [ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md)
  item 6, done on 2026-10-20: the public source of the Fantasy Statblocks
  plugin (MIT), and the published rules, SRDs, sheets and licences of the
  systems below. Each field names where it was read.
- Status: a reference. It decides nothing. Which layouts ship is decided by
  ADR 0099 item 6 (`[DECIDED 2026-10-20]` for the open licences,
  `[PROPOSED]` for the two Paradox and R. Talsorian cases); this file records
  the evidence that item was decided on. Added 2026-10-21, from the
  maintainer's answers S.3a to S.3d: the Dark Pack logo is fetched from
  Paradox's kit by the agent and put on the Credits page; the licence notices
  (Dark Pack, R. Talsorian) sit only on the Credits page, not on the cards
  (the build also kept a one-line pointer on each card, its own choice, awaiting
  the maintainer: S.3b-bis);
  the field names of the World of Darkness and Cyberpunk RED layouts are in
  pt-BR now, to be corrected later against the Brazilian books; and when
  `extends:` lists several bases the first listed wins, as in the plugin
  (ADR 0099 items 1 and 6). Where a line below says "on the card", that part
  is superseded by this paragraph.
- Rule of this file: a field is written only if a primary source shows it.
  Anything else is marked **UNVERIFIED** and is not resolved from memory. A
  layout is built from the fields listed here and no others. The licence
  readings are the researcher's, not legal advice; the maintainer decides.

Tags on a source: **[OFFICIAL]** a publisher-hosted page, PDF or SRD read in
full; **[OFFICIAL-DEV]** open-source system code published by or for the
publisher (strong evidence of structure, not a rulebook); **[COMMUNITY]** a fan
wiki, plugin or system (corroboration only, never the sole basis for a field).

## 1. Fantasy Statblocks (the plugin Verso reads the keys of)

- Licence: **MIT**, "Copyright (c) 2023 Jeremy Valentine". Code may be studied and adapted with the notice kept. https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/blob/main/LICENSE
- Studied: the plugin's `main` at commit `f248f4af8a3d748c2f64534f15e01c2d846e8b12` (2026-01-21, v4.10.3) and its `gh-pages` docs copy. The docs site is a client-rendered app and many pages of the old copy are placeholders, so **the source is the authority**; where the docs differ, the source wins. Formerly `javalent/fantasy-statblocks`; the old URL redirects. Paths below are relative to https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/blob/main/.
- The content it ships is under other licences, which Verso does not inherit with the code: 5e SRD under OGL 1.0a, 13th Age under the Fire Opal community policy, PF2e under the Paizo Community Use Policy (no charging), Daggerheart under the DPCGL (README, "Attributions"). Verso copies none of its bestiary or layouts' text.
- It uses Obsidian's public API (`MarkdownRenderer`, `metadataCache`, `Menu`, `Modal`), admissible under [ADR 0009](../adr/0009-external-constraints.md); the Obsidian app itself was not inspected.

### 1.1 The `statblock` block

Registered with `registerMarkdownCodeBlockProcessor("statblock", …)` (`src/main.ts`). The body is YAML read with Obsidian's `parseYaml` after wikilinks are protected. Every field is optional and any key is allowed (`[key: string]: any`), which is how other systems work: the layout names the keys.

| Key | Meaning |
|---|---|
| `monster:` or `creature:` | A bestiary entry used as the base. |
| `layout:` or `statblock:` | The layout **name** (not its id); then the creature's own `layout`; then the default layout. |
| `extends:` | A name or a list, resolved recursively with a guard against cycles. |
| `note:` | Another note; its **frontmatter** is merged into the creature. The block wins over the note. |
| `image:` | A wikilink or URL; arrays are flattened (a YAML quirk of `[[x]]`). |
| `dice: true/false`, `render: true/false` | Dice Roller integration for this block; 3D dice. |
| `columns`, `columnWidth`, `columnHeight`, `forceColumns` | Per-block override of the layout's columns. |
| `export:` | Declared; the code always adds "Export as PNG" (the code wins over the setting's description). |
| `name`, `size`, `type`, `subtype`, `alignment`, `ac`, `hp`, `hit_dice`, `speed`, `stats` (6 numbers), `fage_stats`, `saves`, `skillsaves`, `damage_*`, `condition_immunities`, `senses`, `languages`, `cr`, `traits`, `spells`, `actions`, `bonus_actions`, `legendary_actions`, `legendary_description`, `mythic_*`, `reactions`, `lair_actions` | The 5e schema (`index.ts`, `src/view/statblock.ts`). |

Precedence, highest first: the block's own keys; the creature from `monster:`; the `extends` chain, nearest first. Array keys take suffixes: `traits:` by name (same name overrides), `traits+:` always adds, `traits-:` removes an inherited one by name, `traits~:` modifies one by name. A trait may nest (`traits: [{name, desc, traits: […]}]`). `saves`/`skillsaves` take a list of one-key maps (`- dexterity: 9`), a plain map, or `name`/`desc` objects.

A note is also a bestiary entry when its frontmatter has `statblock: true` (the whole frontmatter is the creature) or `statblock: inline` (the first `statblock` block of the body is). Scanning is off by default (`src/watcher/watcher.ts`).

### 1.2 The layout model and its block types

A layout (`src/layouts/layout.types.ts`) has `name`, `id`, `blocks`, optional `columns` (default 2), `columnWidth` (px, default 400), `forceColumns`, `cssProperties` (about 70 `--statblock-*` variables, with `light` and `dark` overrides) and `diceParsing` (regex plus a parser). Block types: **heading** (size 1–6), **subheading** (a separator joining several properties), **property** (a "Name: value" line), **saves**, **traits** (the first trait carries the section heading), **spells**, **table** (headers; `calculate` shows `floor((stat-10)/2)`), **text**, **image**, **group**, **inline** (a row), **collapse**, **ifelse**, **layout** (embeds another layout), **action**, **javascript**. Every block has `properties` (the keys it reads), `conditioned` (hide when empty), `fallback`, `hasRule`, and dice fields. Columns are balanced by measuring a detached copy and moving nodes; a long action list may break across columns.

Built-in layouts shipped by the plugin: Basic 5e, Basic Fate Core, Basic Pathfinder 2e, Pathfinder 2e Creature, Basic 13th Age Monster, two Bunkers and Badasses, three Daggerheart (Adversary, Card, Environment).

Dice (`src/parser/dice-parsing.ts`, `MarkdownHolder.svelte`): only with the Dice Roller plugin and `dice: true`. The three default rules: `([\+\-])(\d+) to hit` becomes `1d20+N`; `(\d+)\s\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)` becomes the dice inside the parentheses; `([^\s]+) ([\+\-])(\d+)` becomes `1d20±N`. The plugin emits `` `dice: …` `` and the other plugin makes it clickable.

The layout editor (settings): a tree with drag handles, a modal per block, a separate Previewer tab. Complaints from its issues (https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/issues/N): #50 (boxes resize while dragging), #45 and #131 (drops and focus), #513 and #533 (appearance edits not applied; cannot follow the theme), #511 and #502 (a layout name with parentheses or a dot crashes and loses data: the name is both a CSS class and the `layout:` key), #53 (a template-string block asked for, because a JavaScript block is too heavy for simple text), #30 (the 5e-shaped blocks fit other systems badly).

### 1.3 What Verso does not copy, and why

- **Every field that is JavaScript.** Ten fields run as `new Function(…)`: `javascript.code`, `property.callback`, `saves.callback`, `traits.callback`, `spells.callback`, `diceCallback`, `table.modifier`, `ifelse.conditions[].condition`, `action.callback` and `diceParsing[].parser`. In a shared or server-hosted folder a layout is data from another member, so code in it is a stored-script vector ([0083](../adr/0083-security-hardening-of-universo.md), [0026](../adr/0026-core-ui-contract-inviolable-rules.md)). Each has a declarative replacement in [ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md) item 3 or none; an imported layout has the fields dropped and listed.
- **Layouts and creatures in the app's private settings.** Files are the source of truth ([0012](../adr/0012-files-are-source-of-truth.md)): layouts are files of the folder, creatures are notes.
- **The name as identity.** Kept for the `layout:` key, resolved exactly, with a visible message when it matches nothing.
- **A bestiary as hidden state**, and the settings migrations that rewrite a person's layouts on load (invariant 7).
- **The editor's shape**: a modal per block and a preview in another tab. The model is kept; the editor is rebuilt (ADR 0099 item 8).

## 2. Which layouts ship, in one table

This is the state recorded by ADR 0099 item 6 on 2026-10-20; the paragraphs of section 3 carry the evidence.

| System | Licence | Ships (ADR 0099 item 6) |
|---|---|---|
| Daggerheart | DPCGL 2.0 (an app is not a permitted format) | Not built in (imported) |
| D&D 5e | CC BY 4.0 | Built in |
| Dungeon World | CC BY 3.0 | Built in |
| Powered by the Apocalypse | none (informal policy) | Generic layout only |
| Ironsworn | CC BY 4.0 (SRD parts); CC BY-NC-SA 4.0 (books) | Built in |
| Cairn | CC BY-SA 4.0 | Built in, field names only |
| Mausritter | CC BY 4.0 + Third Party Licence | Built in |
| Blades in the Dark | CC BY 3.0 | Built in |
| Fate Accelerated and Fate Condensed | CC BY 3.0 (or OGL) | Built in |
| Fractal RPG | CC BY 4.0 | Built in |
| Old Dragon 2e | CC BY-SA 4.0 | Built in, field names only |
| Tormenta20 | Licença Aberta da Jambô v1.0 (PC sheets only) | Not built in (imported) |
| Pathfinder 2e Remaster | ORC | Built in |
| Savage Worlds Adventure Edition | Pinnacle Fan License (not open) | Not built in (imported) |
| Mothership 1st edition | 3PP contract | Not named in item 6; not built in |
| Year Zero Engine | YZE Free Tabletop License v1.1 | Not named in item 6; not built in |
| Tales from the Loop | none (Workshop, supplements) | Not built in (imported) |
| ALIEN RPG | none | Not built in (imported) |
| Forbidden Lands | FL Third-Party Tabletop Module License v1.0 | Not built in (imported) |
| The One Ring | none | Not built in (imported) |
| Vaesen | none (Workshop, supplements) | Not built in (imported) |
| Twilight: 2000 | none (Workshop, supplements) | Not built in (imported) |
| Vampire: The Masquerade | Dark Pack | Built in (decided 2026-10-21, ADR 0099.1/6c = A), Dark Pack |
| Werewolf: The Apocalypse | Dark Pack | Built in (decided 2026-10-21, ADR 0099.1/6c = A), Dark Pack |
| Hunter: The Reckoning | Dark Pack | Built in (decided 2026-10-21, ADR 0099.1/6c = A), Dark Pack |
| Mage: The Ascension | Dark Pack by analogy (unconfirmed) | Not built in (imported) |
| Call of Cthulhu | Chaosium Fan Material Policy (apps excluded) | Not built in (imported) |
| Cyberpunk RED | RTG Homebrew Content Policy | Built in (decided 2026-10-21), blank layout |
| Shadowrun | none found | Not named in item 6; not built in |
| Starfinder | ORC | Built in |
| Warhammer Fantasy Roleplay | none found | Not named in item 6; not built in |
| Kids on Bikes | none found | Not named in item 6; not built in |
| Brindlewood Bay | none found | Not named in item 6; not built in |
| Ordem Paranormal RPG | OGL, in part (per a community source) | Not named in item 6; not built in |
| 13th Age | OGL 1.0a | Built in |
| Dragonbane | FL Dragonbane Third-Party Tabletop Module License v1.1 | Not built in (imported) |

## 3. The systems

Each section lists, in this order: the licence, whether it ships, the credit line, the character sheet and the adversary sheet in display order, which values roll, the sources, and what is UNVERIFIED. Game terms are kept in the language the source gives them.

### 3.1 Daggerheart (Darrington Press / Critical Role), SRD 1.0 and 2.0

- **Licence.** DPCGL 2.0 (26 Aug 2026), "Public Game Content": game rules, mechanics, reference cards and stat blocks may be shared; logos, art and exact rulebook text may not. **Section 1.9 "Permitted Formats" lists print and digital-print products, streaming, podcasts and whitelisted non-commercial VTTs, and excludes "video games, and any other audiovisual medium not expressly permitted": a notes app is not clearly permitted.** Written permission from Darrington Press is needed to bundle it; a person authoring their own layout, or sharing inside a private group (1.8), is not "Share". No fees (https://darringtonpress.com/license/).
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** "This product includes materials from the Daggerheart System Reference Document 2.0, (c) Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found at https://www.daggerheart.com. There are no previous modifications by others." (DPCGL 2.0 section 4.3), plus a statement whether the content was modified (4.1e). The name may not be used in a title; "Compatible" must sit next to it.
- **Character sheet, in display order.**
  - **Header:** Name, Pronouns, Level (starts 1), Class, Subclass, Heritage = Ancestry + Community, Description. Tiers: T1 level 1, T2 levels 2–4, T3 levels 5–7, T4 levels 8–10.
  - **Attributes:** (exact names) Agility, Strength, Finesse, Instinct, Presence, Knowledge; starting modifiers +2, +1, +1, +0, +0, −1 in any order.
  - **Derived:** Evasion (set by class); Hit Points (slots, cap 12); Stress (6 slots at start, cap 12); Hope (starts 2, max 6; Fear is the GM's); Armor Score (cap 12, shown as Armor Slots); Damage Thresholds Major and Severe = armor base thresholds + level; Proficiency (starts 1; weapon damage dice count = Proficiency).
  - **Sections:** Active Weapons (name, trait, range, damage `d8+2`, phy/mag), Active Armor, Inventory, Gold (Handfuls, Bags, Chest), Experiences (2 at creation), Domain Cards (loadout 5, rest in Vault), Class, Subclass (Foundation/Specialization/Mastery), Ancestry and Community features, Background questions, Connections, Downtime moves, Conditions (Hidden, Restrained, Vulnerable).
- **Adversary sheet, in display order.**
  - Adversary, SRD 2.0 p. 93, in order: NAME; Tier + Type (`Tier 1 Solo`; types Bruiser, Horde, Leader, Minion, Ranged, Skulk, Social, Solo, Standard, Support); Description; Motives & Tactics; `Difficulty: 14 | Thresholds: 8/15 | HP: 8 | Stress: 3` (Minions show `None`; Horde HP as "X/HP"); `ATK: +3 | Claws: Very Close | 1d12+2 phy`; `Experience: Tremor Sense +2`; FEATURES (`Name - Action|Reaction|Passive: text`; 2.0 adds Fear Features, Pool, Evolution).
  - Environment, p. 100: NAME; Tier + Type (Exploration, Social, Traversal, Event); Description; Impulses; Difficulty (number or "Special"); Potential Adversaries; FEATURES; Feature Questions. No HP or Stress.
- **Rolls.** Duality roll 2d12 (Hope die + Fear die) + trait + Experience; advantage/disadvantage ±d6; damage `XdY+Z` with X = Proficiency; adversary ATK modifier on a d20 against Evasion; in-feature dice. HP, Stress, Marked Armor are trackers.
- **Sources.** SRD 2.0 https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf ; SRD 1.0 https://www.daggerheart.com/wp-content/uploads/2025/05/DH-SRD-May202025.pdf ; DPCGL https://darringtonpress.com/wp-content/uploads/2026/08/DPCGL_2.0_AUG_26_2026.pdf ; Jambo as the Portuguese publisher https://www.daggerheart.com/faq/
- **UNVERIFIED.** The printed field order of the official class sheets; Evasion and HP per class; Countdown structure; the official pt-BR names.

### 3.2 D&D 5e (Wizards of the Coast), SRD 5.1 and SRD 5.2.1

- **Licence.** CC BY 4.0 for both SRDs; the layout is fully allowed. "Please do not include any other attribution to Wizards"; may say "compatible with fifth edition" or "5E compatible".
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** "This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode." For 5.1: the same with "System Reference Document 5.1" and https://dnd.wizards.com/resources/systems-reference-document.
- **Character sheet, in display order.**
  - **Attributes:** Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma; modifier `floor((score-10)/2)`. Proficiency Bonus +2 (levels 1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20).
  - **Skills:** (18, key ability) Acrobatics DEX, Animal Handling WIS, Arcana INT, Athletics STR, Deception CHA, History INT, Insight WIS, Intimidation CHA, Investigation INT, Medicine WIS, Nature INT, Perception WIS, Performance CHA, Persuasion CHA, Religion INT, Sleight of Hand DEX, Stealth DEX, Survival WIS.
  - **Derived:** AC, Initiative, Speed, HP max, current HP, temp HP, Hit Point Dice, Death Saving Throws (3 and 3), Passive Perception = 10 + Perception bonus, Spell save DC = 8 + PB + spellcasting modifier, Spell attack = PB + modifier, Heroic Inspiration (5.2.1) / Inspiration (5.1), Exhaustion.
  - **Sections:** Name, Species (5.2.1) / Race (5.1), Class + Subclass, Background (5.2.1 adds Origin feat), Level, XP, Alignment, Languages, Equipment, Coins (cp sp ep gp pp), Features & Traits, Attacks, Spellcasting (cantrips, slots, prepared).
- **Adversary sheet, in display order.**
  - 5.2.1 order: Name; `Size Type (Tags), Alignment`; `AC 15`; `Initiative +2 (12)`; `HP 10 (3d6)`; `Speed 30 ft.`; six abilities in a table (score, MOD, SAVE); Skills; Resistances/Vulnerabilities/Immunities; Gear; Senses (with Passive Perception); Languages; `CR 1/4 (XP 50; PB +2)`; Traits; Actions; Bonus Actions; Reactions; Legendary Actions (with a use count).
  - 5.1 order: Name; `Size type, alignment`; Armor Class (armor type); Hit Points `135 (18d10 + 36)`; Speed; STR DEX CON INT WIS CHA as `score (mod)`; Saving Throws; Skills; Damage Vulnerabilities/Resistances/Immunities; Condition Immunities; Senses; Languages; Challenge `10 (5,900 XP)`; Traits; Actions; Reactions; Legendary Actions.
  - Other sheets: lair/regional effects (text); traps and hazards (5.2.1 Gameplay Toolbox).
- **Rolls.** Ability check `d20+mod (+PB)`; HP dice (`3d6`, `18d10 + 36`); attack `Melee Attack Roll: +4`; damage `5 (1d6 + 2)`; save DC `DC 14 Constitution`; `Recharge 5-6` (d6); Initiative; `X/Day` counters; spell attack and DC.
- **Sources.** https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf ; https://media.dndbeyond.com/compendium-images/srd/5.1/SRD_CC_v5.1.pdf ; Galapagos Jogos as the 2024 pt-BR publisher, seen on a retailer listing https://www.pontofrio.com.br/dungeons-dragons-livro-do-jogador-2024-players-handbook-asmodee-galapagos/p/1582674164
- **UNVERIFIED.** The printed 2024 character sheet's field order; the official pt-BR attribute and skill names.

### 3.3 Dungeon World (Sage LaTorra, Adam Koebel)

- **Licence.** CC BY 3.0 Unported; layouts are free. SRD site https://www.dungeonworldsrd.com/ (terms https://www.dungeonworldsrd.com/more-info/).
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** "Dungeon World is based on the work of Sage LaTorra and Adam Koebel and is licensed under the Creative Commons Attribution 3.0 Unported License (http://creativecommons.org/licenses/by/3.0/)."
- **Character sheet, in display order.**
  - **Attributes:** Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma; assign 16, 15, 13, 12, 9, 8; modifier 1–3 → −3, 4–5 → −2, 6–8 → −1, 9–12 → 0, 13–15 → +1, 16–17 → +2, 18 → +3.
  - **Derived:** Max HP = class base + Constitution **score**; damage die by class; Load by class; Armor = worn armor. Debilities (−1 to a stat): Weak (STR), Shaky (DEX), Sick (CON), Stunned (INT), Confused (WIS), Scarred (CHA).
  - **Sections:** Name, Look, Race move, Alignment (Good/Neutral/Evil), Bonds, Starting moves, Advanced moves, Gear, Coin, Level, XP, Last Breath at 0 HP.
  - Classes: Barbarian, Bard, Cleric, Druid, Fighter, Immolator (third party), Paladin, Ranger, Thief, Wizard.
- **Adversary sheet, in display order.**
  - Monster, https://www.dungeonworldsrd.com/monsters/, in order: Name; Tags (organization Horde/Group/Solitary, size Tiny/Small/Large/Huge, others); attack line `Bite, d8+1 damage; 10 HP; 3 Armor; Close, Reach`; Special Qualities; Description; Instinct (`To undermine`); Moves.
  - Third sheet: Fronts (Dangers with impulse and grim portents), https://www.dungeonworldsrd.com/gamemastering/fronts/.
- **Rolls.** `2d6 + stat modifier`, bands 10+ / 7–9 / 6−; damage = class damage die; Last Breath `2d6` with no stat. The GM rolls monster damage; HP and Armor are static.
- **Sources.** https://www.dungeonworldsrd.com/character-creation/ ; https://www.dungeonworldsrd.com/playing-the-game/ ; https://www.dungeonworldsrd.com/moves/
- **UNVERIFIED.** The XP level-up threshold; Load and HP numbers per class beyond Fighter; the Front's structure; the official pt-BR publisher and names.

### 3.4 Powered by the Apocalypse (generic), Apocalypse World

- **Licence.** No SRD and no licence text. The Lumpley Games policy (https://lumpley.games/2023/11/22/what-is-pbta/): hacks inspired by Apocalypse World may be published without asking; copying the authors' words needs permission; the PbtA logo needs permission; a credit line is requested.
- **Ships (ADR 0099 item 6).** Only the generic layout named by its mechanics; no layout carries this game's name
- **Credit line.** "Move-based sheets in Verso are inspired by Apocalypse World by Meguey and Vincent Baker (Lumpley Games). Verso is not affiliated with Lumpley Games." (proposed by the research; the policy only asks for a credit)
- **Character sheet, in display order.**
  - Common frame: `2d6 + stat`; 10+ full success, 7–9 partial, 6− the MC moves. Each game defines its own stats; a generic layout takes a configurable list of stats (−3..+3), moves (name, trigger, outcome bands), tracks (Harm/HP, Luck, XP) and free text. Apocalypse World's stats Cool, Hard, Hot, Sharp, Weird, plus Hx, Harm, Luck, Experience, Barter, come from a secondary source ([COMMUNITY] https://daily-apocalypse.com/daily-apocalypse/7-stats): **UNVERIFIED** against the official sheet.
- **Adversary sheet, in display order.**
  - Apocalypse World 2e threat types, secondary ([COMMUNITY] https://daily-apocalypse.com/daily-apocalypse/74-threat-categories-and-lists): Warlord, Grotesque, Affliction, Brutes, Landscape, Terrain, Vehicle; each subtype has an impulse, MC moves, a threat map. The official threat-card layout is **UNVERIFIED**. Dungeon World (above) is the open PbtA with monsters and Fronts.
- **Rolls.** `2d6 + stat`.
- **Sources.** The Lumpley Games page above; the playbook sheets at apocalypse-world.com could not be fetched (a TLS certificate mismatch).
- **UNVERIFIED.** The official playbook sheet fields; the official threat card; the stat names of Monster of the Week and Masks (not read).

### 3.5 Ironsworn (2019) and Ironsworn: Starforged (2022), Shawn Tomkin

- **Licence.** The full rulebooks are CC BY-NC-SA 4.0. **CC BY 4.0** covers the Ironsworn SRD (most of chapters 1–3 and a sample NPC), the whole Starforged Reference Guide, and the text of all assets, oracles, Delve chapters 1–2 and cards; text only, not art. Datasworn (https://github.com/rsek/datasworn, MIT code) carries the licence per object: Starforged sample NPCs are CC BY 4.0, classic sample NPCs are BY-NC-SA. https://tomkinpress.com/blogs/news/lets-talk-about-ironsworn-licensing
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** Verified 2026-10-20 (https://www.ironswornrpg.com/licensing, "How to Provide Credit"; text only, no images or design elements; for non-commercial works the CC BY-NC-SA 4.0 text applies instead): "This work is based on <game titles>, created by Shawn Tomkin, and licensed for our use under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/)." Verso's window uses it with <game titles> = "Ironsworn and Ironsworn: Starforged".
- **Character sheet, in display order.**
  - **Attributes:** Edge, Heart, Iron, Shadow, Wits (3, 2, 2, 1, 1 at creation: the standard rule, **UNVERIFIED** in this pass).
  - **Trackers:** Health, Spirit, Supply (0–5, start 5; Supply is shared by the group); Momentum (minimum −6 confirmed; max +10 and reset +2: **UNVERIFIED**). Impacts (Starforged): Wounded, Shaken, Unprepared; Permanently harmed, Traumatized; Doomed, Tormented, Indebted; Battered, Cursed. Classic debilities: Wounded, Shaken, Unprepared, Encumbered; Maimed, Corrupted; Cursed, Tormented. Legacy tracks (Starforged): Quests, Bonds, Discoveries (10 boxes, 4 ticks each). Progress tracks with a rank: 1 Troublesome, 2 Dangerous, 3 Formidable, 4 Extreme, 5 Epic (3 boxes, 2 boxes, 1 box, 2 ticks, 1 tick per mark).
  - **Sections:** Name, Background/Vows, Gear, Bonds/Connections, Companions, Vehicles, Assets (up to 3 abilities each).
- **Adversary sheet, in display order.**
  - Foe/NPC, Datasworn fields: `name`, `rank` (1–5), `nature` (Starforged: Human, Creature, Monster, Horror, Machine; classic: Ironlander, Firstborn, Animal, Beast, Horror), `summary`, `features`, `drives`, `tactics`, `variants` (name, rank, description), `description`, `quest_starter`. A foe carries a progress track whose boxes follow its rank.
  - Other sheets: Delve sites, themes and domains, Truths, settlements, planets (Datasworn keys `delve_sites`, `site_domains`, `site_themes`, `atlas`; structure beyond the keys UNVERIFIED).
- **Rolls.** Action roll `1d6 + stat (+ adds)` against two `d10` challenge dice (strong hit beats both, weak hit one, miss none); progress roll compares filled boxes to the challenge dice; oracle rolls on d100 tables.
- **Sources.** https://tomkinpress.com/blogs/news/lets-talk-about-ironsworn-licensing ; https://github.com/rsek/datasworn
- **UNVERIFIED.** The 3-2-2-1-1 creation rule; max Momentum and the reset; the structure of Delve sites beyond Datasworn's keys; the official pt-BR edition and names.

### 3.6 Cairn (Yochai Gal), 1st and 2nd edition

- **Licence.** CC BY-SA 4.0 (site footer https://cairnrpg.com/). ShareAlike applies to adapted text; field names alone are facts and structure, so only field labels ship.
- **Ships (ADR 0099 item 6).** Built in, field names only (no text)
- **Credit line.** Verified 2026-10-20: https://cairnrpg.com says "The game was written by Yochai Gal" and "The full text is licensed under CC-BY-SA 4.0" and prescribes no credit wording. The window's statement (author, licence, link, as CC BY-SA asks): "This work is based on Cairn, written by Yochai Gal (https://cairnrpg.com), and licensed for our use under the Creative Commons Attribution-ShareAlike 4.0 International License (https://creativecommons.org/licenses/by-sa/4.0/)."
- **Character sheet, in display order.**
  - **Attributes:** STR, DEX, WIL (3d6 each in order; swap any two in 2e).
  - **Derived:** Hit Protection (HP, 1d6 at start); Armor (capped at 3 in the 1e SRD); Gold (1 gp = 10 sp = 100 cp; start 3d6 gp in 1e); Inventory 10 slots (four body and six pack in 1e; bulky = 2; Fatigue and Conditions take slots).
  - **Sections:** Name, Background (d20), Age (2d20+10), Traits (d10 each): Physique, Skin, Hair, Face, Speech, Clothing, Virtue, Vice; Reputation, Misfortunes (1e); Bonds, Omens (2e). No levels, classes or skills.
- **Adversary sheet, in display order.**
  - 2e Warden's Guide line: `X HP, X Armor, X STR, X DEX, X WIL, Attack (dX, special items, qualities)`, then a descriptor, a quirk or tactic, and an optional Critical Damage effect. Example: `4 HP, 1 Armor, 12 STR, 12 DEX, 9 WIL, shortsword (d6) or short bow (d6)`. Guidance: HP 3 average, 6 hardy, 10+ serious; DEX default 10; Armor 1–3.
  - Other sheets: hirelings, mounts and vehicles (structure UNVERIFIED).
- **Rolls.** Save `d20` roll-under (1 always succeeds, 20 always fails); ability generation `3d6`; weapon die d6/d8/d10 (impaired d4, enhanced d12); several attackers roll all and keep the highest.
- **Sources.** https://cairnrpg.com/first-edition/cairn-srd/ ; https://cairnrpg.com/second-edition/players-guide/character-creation/ ; https://cairnrpg.com/second-edition/wardens-guide/creating-monsters/ ; https://cairnrpg.com/resources/hirelings-mounts-and-vehicles-sheets/
- **UNVERIFIED.** Spell and relic fields; the differences in 2e armor; the hirelings sheet; the official pt-BR edition.

### 3.7 Mausritter (Isaac Williams / Losing Games), SRD 2.3.1

- **Licence.** SRD text CC BY 4.0 (https://mausritter.com/srd/terms), printable sheets also CC BY 4.0, plus the Third Party Licence (https://mausritter.com/third-party-licence): no logo, do not claim to be official. Translating the SRD is permitted.
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** Verified 2026-10-20, https://mausritter.com/third-party-licence (the page is drawn by script; the strings are in its page bundle): "The following text must be included somewhere visible within your publication, and on the website or storefront where you promote the product: [Product name] is an independent production by [Author or Publisher] and is not affiliated with Losing Games. It is published under the Mausritter Third Party Licence." and "This copyright text must be legibly included somewhere on the product: Mausritter is copyright Losing Games." The window shows both (Verso, Sérgio Sousa (Meio-Orc), the maintainer's choice of 2026-10-20). The CC BY 4.0 line below comes from the SRD terms (https://mausritter.com/srd/terms), which the script read could not reproduce: **UNVERIFIED**, not shown. "This work is based on Mausritter (https://mausritter.com/), a product of Losing Games and Isaac Williams, and is licensed for use under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence."
- **Character sheet, in display order.**
  - **Attributes:** STR, DEX, WIL (3d6, keep the two highest dice; swap any two).
  - **Derived:** HP = Hit Protection (d6); pips (d6, currency); Background table by (HP, pips); Level table L1 HD 1d6 Grit 0 XP 0, L2 2d6 Grit 1 XP 1000, L3 3d6 Grit 2 XP 3000, L4 4d6 Grit 2 XP 6000, L5+ 4d6 Grit 3 (+5000 XP). Inventory slots: 2 paw, 2 body, 6 pack; items have 3 usage dots; Conditions (Exhausted, Frightened, Hungry, Injured, Drained, others) take slots.
  - **Sections:** Birthsign, Coat (color, pattern), Physical detail, Name; weapons (improvised, light, medium, heavy, ranged); armour (light, heavy).
- **Adversary sheet, in display order.**
  - SRD "Creatures": `15hp, STR 15, DEX 15, WIL 10, Armour 1`; `Attacks: d6 swipe, d8 bite`; optional special lines (`Critical damage: …`, `Flies 3x normal speed`); `**Wants** …`; tables. Some creatures are "Warband scale".
  - Other sheets: Hirelings (6 slots, morale, wages), Warbands, Adventure sites (SRD headings only).
- **Rolls.** Saves `d20 <= attribute` (advantage/disadvantage); damage die; HD roll; STR damage after HP; critical damage die (`d12 damage to STR`).
- **Sources.** https://mausritter.com/srd/mausritter-srd-2.3.1.md
- **UNVERIFIED.** The structure of hirelings, warbands and sites beyond the SRD headings; the official pt-BR edition.

### 3.8 Blades in the Dark (John Harper / One Seven Design), "Forged in the Dark"

- **Licence.** SRD CC BY 3.0; no setting (Duskwall), NPCs, art or the name "Blades in the Dark" in a title; the "Forged in the Dark" logo needs its trademark line. The SRD does not cover translating the core book. https://bladesinthedark.com/licensing
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** "This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/)."
- **Character sheet, in display order.**
  - Scoundrel sheet.
  - **Skills:** 12 actions under 3 attributes: Insight (Hunt, Study, Survey, Tinker), Prowess (Finesse, Prowl, Skirmish, Wreck), Resolve (Attune, Command, Consort, Sway); rating 0–4 = dice rolled; the attribute rating = number of actions with a dot. Start: 3 dots from the playbook plus 4 (max 2 per action).
  - **Sections:** Playbook (Cutter, Hound, Leech, Lurk, Slide, Spider, Whisper), Name, Alias, Look, Heritage, Background, Vice (Faith, Gambling, Luxury, Obligation, Pleasure, Stupor, Weird) + purveyor, Special abilities, Friends/rivals, Items (load), XP triggers.
  - **Trackers:** Stress; Trauma (Cold, Haunted, Obsessed, Paranoid, Reckless, Soft, Unstable, Vicious; the 4th retires); Harm rows (level 1 lesser 2 boxes, level 2 moderate 2, level 3 severe 1, level 4 fatal); Armor boxes; Load (Light 1–3, Normal 4–5, Heavy 6, Encumbered 7–9); healing clock (4); Coin and Stash; XP tracks Playbook, Insight, Prowess, Resolve.
- **Adversary sheet, in display order.**
  - No official NPC stat lines. Crew: Tier (0–VI), Hold (Weak/Strong), Rep (12), Turf (max 6), Heat, Wanted level, Coin, Claims, Upgrades, Contacts, Cohorts, Lair, Hunting grounds. Cohort: Type (gangs Adepts, Rooks, Rovers, Skulks, Thugs; experts free), Scale / Quality, Edges (Fearsome, Independent, Loyal, Tenacious), Flaws (Principled, Savage, Unreliable, Wild), Harm, Armor, Elite. Faction: Name, Tier, Hold, status −3..+3 (War, Hostile, Interfering, Neutral, Helpful, Friendly, Allies), turf/assets, goals, clocks. Progress clocks of 4, 6 or 8 segments (Danger, Racing, Linked, Mission, Long-term project): the Danger clock is the challenge sheet.
- **Rolls.** Action roll `Nd6` take the highest (0 dice: `2d6` take the lowest); 6 full, 4–5 partial, 1–3 miss; critical on several 6s; resistance, fortune, downtime and engagement rolls; clock ticks.
- **Sources.** https://bladesinthedark.com/character-creation ; https://bladesinthedark.com/actions-attributes ; https://bladesinthedark.com/stress-trauma ; https://bladesinthedark.com/faction-game
- **UNVERIFIED.** The number of Stress boxes on the printed sheet (9 is not stated in the web text read); the official pt-BR edition.

### 3.9 Fate Accelerated and Fate Condensed (Evil Hat Productions)

- **Licence.** Both SRDs CC BY 3.0 (or OGL); official statements https://fate-srd.com/official-licensing-fate and https://fate-srd.com/official-licensing-fate/cc. The "Powered by Fate" logo needs its trademark line. Fate SRD Brasil (https://fatesrdbrasil.gitlab.io/fate-srd-brasil/) is a community translation, not a publisher edition.
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** Core + Accelerated: "This work is based on Fate Core System and Fate Accelerated Edition (found at https://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/)." Condensed: "This work is based on Fate Condensed (found at https://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by PK Sullivan, Lara Turner, Fred Hicks, Richard Bellingham, Robert Hanz, and Sophie Lagace, and licensed for our use under the Creative Commons Attribution 3.0 Unported license."
- **Character sheet, in display order.**
  - Accelerated (https://fate-srd.com/fate-accelerated/who-do-you-want-be): **Header:** High Concept, Trouble, up to 3 more aspects (3 to 5 in all). Approaches (6): Careful, Clever, Flashy, Forceful, Quick, Sneaky; one Good (+3), two Fair (+2), two Average (+1), one Mediocre (+0). Refresh 3; Fate points; Stunts. Stress: one track of 3 boxes. Consequences: Mild (2), Moderate (4), Severe (6). pt-BR (Fate SRD Brasil): Ágil, Cuidadoso, Esperto, Estiloso, Poderoso, Sorrateiro.
  - Ladder: +8 Legendary, +7 Epic, +6 Fantastic, +5 Superb, +4 Great, +3 Good, +2 Fair, +1 Average, +0 Mediocre, −1 Poor, −2 Terrible.
  - Condensed (https://fate-srd.com/fate-condensed/getting-started): five aspects (High Concept, Trouble, Relationship, two free). **Skills:** (19) Academics, Athletics, Burglary, Contacts, Crafts, Deceive, Drive, Empathy, Fight, Investigate, Lore, Notice, Physique, Provoke, Rapport, Resources, Shoot, Stealth, Will. Pyramid: 1 Great (+4), 2 Good (+3), 3 Fair (+2), 4 Average (+1), the rest Mediocre. Refresh 3; Stunts (3 free). Two stress tracks (Physical from Physique, Mental from Will): Mediocre 3 boxes; Average/Fair 4; Good/Great 6; Superb+ 6 plus an extra mild consequence slot. Consequences Mild 2, Moderate 4, Severe 6.
- **Adversary sheet, in display order.**
  - Accelerated (https://fate-srd.com/fate-accelerated/being-gamemaster): named NPCs use the PC sheet; **Mooks**: skilled at (+2), bad at (−2), one or two simple aspects, 0–2 stress boxes, no consequences, the first hit past stress takes them out; **groups of mooks** act as one, 1 stress box per two members. Condensed (https://fate-srd.com/fate-condensed/being-game-master): **Major NPCs** stat like PCs; **Minor NPCs**: one aspect, 1–2 skills, 0–3 stress boxes, no consequence slots, maybe a stunt; **Monsters/Big Bads/Threats**: any mix of aspects, skills, stunts, stress, consequences. Fate Adversary Toolkit (Threats, Hitters, Bosses, Fillers; obstacles Hazards, Blocks, Distractions): https://fate-srd.com/fate-adversary-toolkit/types-adversaries.
- **Rolls.** `4dF + approach` (or skill); invoke (+2 or reroll); Fate point counter.
- **Sources.** The fate-srd.com and Fate SRD Brasil pages above.
- **UNVERIFIED.** The Fate Adversary Toolkit's own attribution text; the structure of Core's Nameless NPC tiers and Mobs; Condensed "Extras"; the remaining four pt-BR skill names of Condensed (Rapport, Crafts, Drive, Notice); the official pt-BR publisher.

### 3.10 Fractal RPG (Igor Téuri and Walter Licínio), SRD v1.0.3

- **Licence.** Read from the official SRD v1.0.3 (the PDF the maintainer gave, 2026-10-20) **[OFFICIAL]**. The text says "Creative Commons Attribution 4.0 License": CC BY 4.0. "Fractal" is a trademark of Dados Críticos (https://linktr.ee/dadoscriticos); the "FEITO PARA FRACTAL" mark may be used as extra credit. Authors: Igor Téuri and Walter Licínio (design, edition); Érika Brandão (visual identity).
- **Credit decision (2026-10-22, T.1 of the afternoon list, option A; closed 2026-10-29).** The maintainer: the licence is **CC BY 4.0**. No open question remains.
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** Required line (SRD p. 4): "Esse trabalho é compatível com Fractal, de Igor Téuri e Walter Licínio, desenvolvido sob licença Creative Commons Attribution 4.0 License." + https://fractal-system.itch.io/pt-br
- **Character sheet, in display order.**
  - SRD p. 7–8.
  - **Header:** NOME, JOGADOR, XP.
  - RESERVAS: each with a name and ATUAL/TOTAL (start 3, max 6); the world defines each Reserva with a Gatilho ✦ and a Consequência ▣.
  - FATOS 1–12: short phrases, each with a QUEBRADO mark (recovered at the Interlúdio). Creation: 1 Fato per Premissa of the world plus 3 free Fatos.
  - ANOTAÇÕES.
  - XP: +1 per failed roll, +3 per Episódio, +10 per Arco. Interlúdio actions (2 per player): Evoluir a new Fato (3 XP), Aprimorar +1 max Reserva (3 XP), Descansar recovers 1 Reserva, Mudar rewrites a Fato, Preparar-se +1 XP.
  - World sheet (Mundo Fractal): Realismo (power level, tone, proposal, safety limits), Reservas (name, Gatilho, Consequência), Premissas, Módulos.
- **Adversary sheet, in display order.**
  - DESAFIO, SRD p. 17–18: name; OBSTÁCULOS (the Fatos of the challenge, each can be Quebrado; the challenge is overcome when all are broken); optional RESERVAS with atual/max, Gatilho ✦, Consequência ▣ (example: Krard, o Dragão Negro: Vida 10/10 ✦ a cada dano sofrido ▣ Krard morre; Mana 3/3). **Each Obstáculo can itself be a Desafio** with its own Obstáculos (Campanha → Arco → Episódio): in Verso an Obstáculo can be a `[[link]]` to another Desafio's note. The same structure serves creatures, traps, hazards, factions and cities (Cidade Imperial: Reserva Crime 3/3). Antecipação per Desafio: 1 small, 2 medium, 3+ hard.
- **Rolls.** Rolagem de Risco (p. 10–11): `Nd6`, N = the applicable Fatos, max 3; +1 Vantagem (only one; also from Ajudando) → max 4d6; no Fato → `1d6`, success only on 6, no Vantagem. Read the **highest** die: 1–4 FALHA (+1 XP, a Consequência), 5–6 SUCESSO. Each extra 6 beyond the first = Impulso. Each 1 = Ruptura (a used Fato becomes Quebrado, even on a success). Notation `Nd6kh1` with a custom reading (falha / sucesso / impulso / ruptura count).
- **Sources.** Official SRD v1.0.3 (a PDF given by the maintainer); https://fractal-system.itch.io/pt-br ; the author's comment https://walterlicinio.itch.io/fractal
- **UNVERIFIED.** The licence variant (text against badge), pending the authors.

### 3.11 Old Dragon 2e (Old Dragon Editora)

- **Licence.** CC BY-SA 4.0 (https://olddragon.com.br/licenciamento); free SRD https://olddragon.com.br/livros/srd. ShareAlike applies to adapted text, so only field names ship. Must not look official. Fan material may not be sold outside the SRD route.
- **Ships (ADR 0099 item 6).** Built in, field names only (no text)
- **Credit line.** Verified 2026-10-20, word for word from https://olddragon.com.br/licenciamento (the page writes "Antonio", with no accent): "Old Dragon 2ª Edição © 2023 da Old Dragon Editora está licenciado sob CC BY-SA 4.0 e é uma criação de Antonio Sá Neto, Dan Ramos e Fabiano Neme baseado nos originais de Gary Gygax e Dave Arneson. Para ver uma cópia desta licença, visite http://creativecommons.org/licenses/by-sa/4.0/." The licence also asks for its CC BY-SA badge on a product's title page and back cover.
- **Character sheet, in display order.**
  - **Attributes:** Força (FOR), Destreza (DES), Constituição (CON), Inteligência (INT), Sabedoria (SAB), Carisma (CAR). Modifier: 2–3 → −3; 4–5 → −2; 6–8 → −1; 9–12 → 0; 13–14 → +1; 15–16 → +2; 17–18 → +3; 19–20 → +4.
  - **Derived:** CA = 10 + mod DES + armadura + escudo + outros; BA (BAC melee = BA + mod FOR; BAD ranged = BA + mod DES); JP split in JPD (DES), JPC (CON), JPS (SAB); MV (humans and elves 9, dwarves and halflings 6, minus load); PV by class HD + CON bonus; Idiomas (2 + INT bonus); Alinhamento (Ordem, Neutralidade, Caos); Raça (Anão, Elfo, Gnomo, Halfling, Humano, Meio-Elfo); 20 classes listed on the site (Acadêmico, Anão Aventureiro, Arqueiro, Assassino, Bárbaro, Bardo, Bruxo, Clérigo, Druida, Elfo Aventureiro, Guerreiro, Halfling Aventureiro, Ilusionista, Ladrão, Mago, Necromante, Paladino, Proscrito and two not read).
  - Rolling styles: Clássico (3d6 in order), Aventureiro (3d6 assign), Heroico (4d6 drop lowest), 3d6 Duplo, Camponês (1d6+7), Distribuição (8 base + 7d6), Racial (2d6+6/+3).
- **Adversary sheet, in display order.**
  - Chapter monstros, in order: Tamanho (Miúdo, Pequeno, Médio, Grande, Imenso, Colossal), Alinhamento, Habitat, QT (Quantidade de Encontro: errantes (covil)), TS (Tesouros, letters of Tabela 9.5), XP, MV (V voar, N nadar, E escalar, C cavar, O outros), MO (Moral 2–12), CA, DV (`4 DV (20)`, `DV 4+3`), JP (one value), ATQ (`2 x MORDIDA +1 (1d6+1)`), Descrição, optional Utilidades. "Fichas resumidas" exist for short entries.
- **Rolls.** d20 tests: ability test = `d20 <=` the attribute (1 success, 20 failure); JP `d20 <=` the JP; attack `d20 + BA` against CA (1/20 critical); initiative d20 test; damage dice; PV = DV × d8. Test adjustments: Fácil +2, Muito Fácil +5, Difícil −2, Muito Difícil −5.
- **Sources.** https://olddragon.com.br/livros/srd (chapters under /livros/srd/capitulos/…) ; https://olddragon.com.br/licenciamento
- **UNVERIFIED.** The Moral test (2d6 against MO) is not stated in the page text read; two class names; the hirelings ("Ajudantes") structure.

### 3.12 Tormenta20 (Jambô Editora), Tormenta20 Jogo do Ano

- **Licence.** Licença Aberta da Jambô v1.0 (24 Jun 2026), https://jamboeditora.com.br/licenca-aberta/: static or print media only; max 30% official text; **apps, sites and VTTs not permitted (2.2.1)**, except clause 5.2, fillable character sheets in virtual media using official terms and no reproduced passages. A PC sheet layout is covered; a threat (ameaça) layout is not obviously covered. No translations. The seal on the cover is for print. Reserved content (setting names, characters, art) is excluded.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** "[TÍTULO DA OBRA] é um produto não oficial e não canônico, publicado sob a Licença Aberta da Jambô. Termos disponíveis em jamboeditora.com.br/licenca-aberta/. Jambô Editora e os selos da Licença Aberta da Jambô são marcas registradas da Jambô Editora Ltda., usadas com permissão." (the research text was ASCII, accents restored here: check against the page)
- **Character sheet, in display order.**
  - Official compact block (Jambô "Heróis de Bolso", https://blog.jamboeditora.com.br/tags/goblin/): Iniciativa, Percepção, Defesa, Fort, Ref, Von (Fortitude, Reflexos, Vontade), Pontos de Vida, Deslocamento (metres and squares, `12m (8q)`), Pontos de Mana, Ataque corpo a corpo (`Adaga +5 (1d4, 19)` = weapon, bonus, damage, crit range; multiplier `x3`), Ataque à distância, abilities (`Name. text`), the attributes line `For 10, Des 20, Con 14, Int 10, Sab 14, Car 10`, Perícias, Equipamento, `T$`. Attributes: Força, Destreza, Constituição, Inteligência, Sabedoria, Carisma.
- **Adversary sheet, in display order.**
  - Threat (ameaça) block: the official structure is in the bestiary (not read). From memory only, **not to ship**: Name, ND, type/size, Iniciativa, Percepção, Defesa/Fort/Ref/Von, PV, Deslocamento, attacks, abilities, attributes, skills, equipment, treasure.
- **Rolls.** `d20 + skill/attack`; damage `1d8+4`; critical `19` / `x3`.
- **Sources.** https://jamboeditora.com.br/licenca-aberta/ ; https://blog.jamboeditora.com.br/tags/goblin/
- **UNVERIFIED.** Whether Tormenta20 stores attributes as modifiers (the Jambô blog line `For 10, Des 20` contradicts that); the skills list, class names, the defense formula, PV/PM per class; the whole threat block; hazards and ND scaling. The community wiki tsrd.fandom.com blocked bots.

### 3.13 Pathfinder 2e Remaster (Paizo): Player Core, GM Core, Monster Core

- **Licence.** ORC (https://paizo.com/orclicense). Obligations: the ORC Notice, an Attribution notice crediting the licensors, a Reserved Material notice; the game mechanics a person adds become ORC too. Reserved Material (names, art, lore) is not included. The 2019 Core Rulebook is under OGL 1.0a.
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense. All warranties are disclaimed as set forth therein." Attribution: "This product is based on the following Licensed Material: Pathfinder Player Core (c) 2023 Paizo Inc., Designed by Logan Bonner, Jason Bulmahn, Stephen Radney-MacFarland, and Mark Seifter … Pathfinder Monster Core (c) 2024 Paizo Inc. …" (full author lists https://2e.aonprd.com/Licenses.aspx). Short in-app form: "Pathfinder Player Core and Monster Core (c) Paizo Inc., used under the ORC License (paizo.com/orclicense). Not affiliated with Paizo."
- **Character sheet, in display order.**
  - **Header:** Name, Ancestry, Heritage, Background, Class, Level, XP, Size, Traits, Deity (Remaster has no alignment).
  - **Attributes:** Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma, as **modifiers**; a key attribute per class.
  - Proficiency ranks: Untrained +0, Trained level+2, Expert level+4, Master level+6, Legendary level+8 (https://2e.aonprd.com/Rules.aspx?ID=1).
  - **Derived:** AC (10 + Dex cap + proficiency + armor), Fortitude/Reflex/Will, Perception, Class DC / Spell DC, Hit Points (class HP per level + Constitution; ancestry HP at 1st), Speed, Resistances/Weaknesses, Hero Points, Focus Points, Dying/Wounded/Doomed, Conditions.
  - **Skills:** (17) Acrobatics, Arcana, Athletics, Crafting, Deception, Diplomacy, Intimidation, Lore, Medicine, Nature, Occultism, Performance, Religion, Society, Stealth, Survival, Thievery (https://2e.aonprd.com/Skills.aspx).
  - **Sections:** Strikes (bonus, traits, damage), Spellcasting (traditions, DC, slots, focus), Feats (ancestry, class, skill, general), Inventory with Bulk, Coins (cp sp gp pp).
- **Adversary sheet, in display order.**
  - Creature, Monster Core (example Pukwudgie, https://2e.aonprd.com/Monsters.aspx?ID=3153), in order: Name + `Creature 7`; size and traits; Recall Knowledge DC; `Perception +17`, senses; Languages; Skills; Str Dex Con Int Wis Cha modifiers; Items; `AC 25; Fort +12, Ref +15, Will +17`; `HP 100`, Resistances, Weaknesses, Immunities; defensive abilities; `Speed 25 feet`; Melee (`hatchet +17 [+13/+9] (agile, magical, sweep) Damage 1d6+10 slashing plus poison`); Ranged; Spells (DC, attack, by rank); Offensive abilities; with action icons (one, two, three actions, reaction, free).
  - Other sheets: Hazards (Stealth DC, Disable, AC, saves, Hardness, HP, Routine; https://2e.aonprd.com/Hazards.aspx), NPCs (https://2e.aonprd.com/NPCs.aspx), Afflictions, Elite/Weak adjustments.
- **Rolls.** `d20 + modifier` against a DC; Strike with MAP −5/−10 (`+13/+9`); damage; flat check DC 11; persistent damage; Recall Knowledge DC; spell attack and DC.
- **Sources.** https://2e.aonprd.com/ (Archives of Nethys, Paizo partnership)
- **UNVERIFIED.** XP per level (1000 is not confirmed); the ancestry HP formula; the official pt-BR publisher (none found).

### 3.14 Savage Worlds Adventure Edition (Pinnacle Entertainment Group)

- **Licence.** No open licence. The Fan License (https://peginc.com/licensing/): free fan material only, the "Savage Worlds Fan" logo unaltered on the front display, a mandatory notice, no reproduction of rulebook content, no compensation, no derivative of Pinnacle settings, revocable. "Savage Worlds has never been an open license."
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** "This game references the Savage Worlds game system, available from Pinnacle Entertainment Group at www.peginc.com. Savage Worlds and all associated logos and trademarks are copyrights of Pinnacle Entertainment Group. Used with permission. Pinnacle makes no representation or warranty as to the quality, viability, or suitability for purpose of this product."
- **Character sheet, in display order.**
  - Official SWADE sheet (https://peginc.com/wp-content/uploads/2019/09/SWADE_Character_Sheet.pdf).
  - **Header:** Name, Race, Bennies, Conviction (setting option), Height, Weight.
  - **Attributes:** Agility, Smarts, Spirit, Strength, Vigor (die type d4–d12).
  - **Skills:** five pre-printed: Athletics, Common Knowledge, Notice, Persuasion, Stealth, plus blank lines with a die type.
  - **Derived:** Pace, Parry, Toughness.
  - **Sections:** Hindrances, Edges & Advances, Gear, Weapons (Weapon, Range, Damage, AP, ROF, WT, Notes), Powers (Power, PP, Range, Duration, Effect), Wounds track (−1, −2, −3, INC), Fatigue track (−1, −2, INC), Power Points.
- **Adversary sheet, in display order.**
  - An Extra is the PC sheet reduced (Attributes, Skills, Pace, Parry, Toughness, Edges, Hindrances, Gear, Special Abilities; no Wild Die; Shaken on one Wound); Wild Card foes have wounds and the Wild Die. The official Bestiary layout is **UNVERIFIED** (the core book is not open and was not read).
- **Rolls.** Trait die + Wild Die d6 (take the higher), exploding dice, TN 4, raise at +4, damage `Str+d6`, `2d6`, Shaken recovery.
- **Sources.** https://peginc.com/licensing/ ; https://peginc.com/wp-content/uploads/2019/09/SWADE_Character_Sheet.pdf
- **UNVERIFIED.** The formulas Parry = 2 + Fighting/2 and Toughness = 2 + Vigor/2 + armor; Charisma on the sheet; the Bestiary layout; vehicles, chase cards, dramatic tasks; the official pt-BR publisher.

### 3.15 Mothership 1st edition (Tuesday Knight Games)

- **Licence.** No public licence text; third-party use is by contract (3PP) with Tuesday Knight Games; AI-generated content is banned from 3PP content (https://www.tuesdayknightgames.com/pages/mothership-jump-9-writers-grant). Use inside an app is **UNVERIFIED**: ask. "Mothership" is a registered mark.
- **Ships (ADR 0099 item 6).** Not named in ADR 0099 item 6; not built in
- **Credit line.** "Mothership is a trademark of Tuesday Knight Games. Verso is not affiliated with Tuesday Knight Games." (placeholder from the research)
- **Character sheet, in display order.**
  - Secondary only ([COMMUNITY] Wikipedia https://en.wikipedia.org/wiki/Mothership_(role-playing_game); a Foundry template https://github.com/Futil/foundry-mothership). The Player's Survival Guide could not be downloaded. Classes: Teamster, Scientist, Android, Marine. Stats: Strength, Speed, Intellect, Combat; Saves: Sanity, Fear, Body. The Foundry template keeps `health`, `hits`, `stats{strength, speed, intellect, combat, sanity, fear}`, `class`, `rank`, `credits`, `xp`, `stress`, `weight`.
- **Adversary sheet, in display order.**
  - Secondary only: the Foundry creature template has Combat, Instinct, Speed, Loyalty, Armor, Sanity (optional), Health, Hits, description, notes; a ship sheet (Armor, Combat, Intellect, Speed, Thrusters, Battle). The Warden's Operations Manual format is **UNVERIFIED**.
- **Rolls.** Roll-under percentile.
- **Sources.** The pages above.
- **UNVERIFIED.** Everything from the official sheet: the stat roll `2d10+25`, doubles as criticals, Stress minimum, Resolve, Armor Points, Credits, Loadout, Skills (Trained/Expert/Master), the panic check; the whole adversary format; the licence for an app; the official pt-BR publisher.

### 3.16 Year Zero Engine, generic (Fria Ligan AB / Free League), SRD v1.0

- **Licence.** Year Zero Engine Free Tabletop License v1.1 (31 Mar 2026): the right to use the SRD "as part of your own tabletop role playing game" in print, PDF or as a VTT module ("VTTs do not include NFTs or video games"); only the SRD, no other Free League art, text, brands or logos; generative AI text or art must be disclosed on sale; the notice is required and a copy or link to the licence goes with each publication; no implied endorsement. A notes app is none of those formats: ask Free League, or treat the layout as generic. https://freeleaguepublishing.com/wp-content/uploads/2026/03/Year-Zero-Engine-License-Agreement-version-1.1.pdf
- **Ships (ADR 0099 item 6).** Not named in ADR 0099 item 6; not built in
- **Credit line.** "Year Zero Engine layouts are not affiliated with, sponsored, or endorsed by Fria Ligan AB. The Year Zero Engine System Reference Document is used under Fria Ligan AB's Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/)."
- **Character sheet, in display order.**
  - The SRD says it "does not include a character sheet". From its chapter 2: seven steps (archetype, attributes, skills, starting specialty, personality traits, gear, name).
  - **Attributes:** (4) Strength, Agility, Wits, Empathy; dice pool ratings 1–5 (5 Extraordinary, 4 Capable, 3 Average, 2 Below Average, 1 Feeble), 14 points to start, min 2, max 5 (key attribute 5, others 4); step dice A d12, B d10, C d8, D d6.
  - **Skills:** (12) Force, Melee, Stamina (Strength); Marksmanship, Mobility, Stealth (Agility); Crafting, Observation, Survival (Wits); Healing, Insight, Persuasion (Empathy); levels 0–5 (5 Elite, 4 Veteran, 3 Experienced, 2 Trained, 1 Novice) or A–D; specialties; personality traits; XP.
  - **Derived:** Health = average of Strength and Agility rounded up, +1; Resolve = average of Wits and Empathy rounded up, +1 (step dice: (die size + die size)/4 rounded up).
  - **Conditions:** (variant) Physical: Exhausted, Battered, Wounded; Mental: Angry, Scared, Disheartened; broken after the 4th of one type.
  - **Gear:** weapons (Grip, Bonus, Damage, Range, Weight, optional Crit threshold, Crit die), armor (Armor Rating), artifact dice, consumables, reliability, encumbrance.
- **Adversary sheet, in display order.**
  - **There is none in the SRD**: NPCs "use skills in the same way as player characters", the GM rolls and NPCs can push, a broken minor NPC dies, a group can draw one initiative card, NPCs have no Willpower pools. A generic adversary layout (name, attributes, skills, armor rating, weapons, Health/Resolve, notes) is Verso's own design, not a publisher structure.
- **Rolls.** Skill roll = attribute + skill (+ gear) d6s; push; armor roll; critical injury (d66).
- **Sources.** https://freeleaguepublishing.com/wp-content/uploads/2023/11/YZE-Standard-Reference-Document.pdf
- **UNVERIFIED.** Willpower Points max (magic is optional); the critical injury table contents; any vehicle sheet.

### 3.17 Tales from the Loop (Free League)

- **Licence.** Free League's licences page lists only Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis and the Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (and Forbidden Lands, Symbaroum, Coriolis) are in the Free League Workshop, a DriveThruRPG community programme for supplements (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN and The One Ring are on neither.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** No licence to cite. Suggested, not a prescribed legal text: "Tales from the Loop is a trademark of its owner; this is an unofficial, unaffiliated template." Use a generic label ("Year Zero-style").
- **Character sheet, in display order.**
  - Official sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/08/TFL_character_sheet.pdf).
  - **Header:** Name, Age, Type, Iconic Item (bonus +2), Pride, Anchor, Problem, Drive, Description, Favorite Song.
  - **Attributes:** (4) Body, Tech, Heart, Mind.
  - **Skills:** (12) Sneak, Force, Move (Body); Build, Tinker, Calculate (Tech); Contact, Charm, Lead (Heart); Investigate, Comprehend, Empathize (Mind).
  - **Conditions:** (5) Angry, Scared, Exhausted, Injured, Broken.
  - **Trackers:** Luck Points, Experience.
  - **Sections:** Items (with Bonus), Hideout, Relationships (Kid 1–4, NPC 1–2), Notes.
- **Adversary sheet, in display order.**
  - No free official source.
- **Rolls.** d6 pool (the rule text was not read).
- **Sources.** The sheet above.
- **UNVERIFIED.** The pt-BR edition; the Luck formula and max; skill difficulty and boost rules; the NPC format; the mystery/threat sheet; the d6 rule text; condition effects.

### 3.18 ALIEN RPG, Evolved Edition (Free League; IP of 20th Century Studios)

- **Licence.** No licence for ALIEN; sheets carry "TM & © 2025 20th Century Studios". Not usable for branded layouts. A neutral "Year Zero horror" layout built from the SRD is covered only by the Year Zero Engine licence above. Free League's licences page lists only Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis and the Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (and Forbidden Lands, Symbaroum, Coriolis) are in the Free League Workshop, a DriveThruRPG community programme for supplements (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN and The One Ring are on neither.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** No licence to cite (see Tales from the Loop).
- **Character sheet, in display order.**
  - Official sheets (https://freeleaguepublishing.com/wp-content/uploads/2023/09/ALIEN_Character-Sheet.pdf, …/ALIEN-Evolved-Edition-Character-Sheet.pdf).
  - **Header:** Name, Career, Appearance, Buddy, Rival, Personal Agenda, Talents, Relationships (1–10).
  - **Attributes:** (4) Strength, Agility, Wits, Empathy.
  - **Skills:** (12) Heavy Machinery, Stamina, Close Combat (Strength); Mobility, Ranged Combat, Piloting (Agility); Observation, Survival, Comtech (Wits); Command, Manipulation, Medical Aid (Empathy).
  - **Trackers:** Health, Stress Level, Resolve (Evolved), Radiation, Experience Points, Story Points; Conditions (original: Starving, Dehydrated, Exhausted, Freezing; Evolved: Fatigued); consumables Air, Food, Power, Water; Encumbrance.
  - **Gear:** Weapons (Name, Bonus/Modifier, Range, Damage, Weight, Ammo on Evolved), Armor (Level, Weight), Signature Item, Tiny Items, Cash, Critical Injuries (and Mental Trauma on Evolved), Stress and Panic responses.
  - Other sheets: Ship (…/ALIEN-Evolved-Edition-Ship-Sheet.pdf), Colony (…/ALIEN_Colony_Sheet.pdf), Planet (…/ALIEN_Planet_Sheet.pdf).
- **Adversary sheet, in display order.**
  - No free official statblocks. [COMMUNITY] (GPL-3 Foundry system https://github.com/pwatson100/alienrpg, `module/data/actor-creature.mjs`): Health, Speed, Armor Rating, Armor vs Fire, a defence block Mobility / Observation / Acid Splash / Special, attack tables, critical injury, comment; separate synthetic and character types. Corroboration only.
- **Rolls.** Roll = attribute + skill base dice + stress dice; push; a stress die showing 1 triggers a stress response; panic roll = D6 + stress level − Resolve (rules reference https://freeleaguepublishing.com/wp-content/uploads/2023/09/ALIEN-Evolved-Edition-Starter-Set-rules-reference-sheet-v1.1.pdf).
- **Sources.** The sheets above.
- **UNVERIFIED.** The Health and Resolve derivation formulas (a community system differs from memory: do not ship); the creature attack-table layout and its D6 mapping; the human NPC and synthetic statblocks; the pt-BR names and publisher; the stress cap; condition effects; ship stat names.

### 3.19 Forbidden Lands (Free League), 1st edition

- **Licence.** Forbidden Lands Third-Party Tabletop Module License v1.0 (31 Mar 2026), https://freeleaguepublishing.com/wp-content/uploads/2026/03/Forbidden-Lands-License-Agreement-version-1.0.pdf: the right to publish supplements explicitly compatible with the core game (print, PDF, VTT module); it may reference the rules, terminology and names of creatures and locations, not copy the rules; no Free League text, art or trade dress; may not add attributes or core skills; **monsters may be added**. A supplement licence, not an app licence: unclear.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** "Forbidden Lands is a trademark of Fria Ligan AB. This content is not affiliated with, sponsored, or endorsed by Fria Ligan AB. It was created under Fria Ligan AB's Forbidden Lands Third Party Supplement License." (the licence's recommended notice, adapted from its Dragonbane form)
- **Character sheet, in display order.**
  - Official sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/09/Forbidden_Lands_Sheets_Color.pdf).
  - **Header:** Name, Kin, Profession, Age, Reputation, Pride, Dark Secret, Appearance (Face, Body, Clothing), Talents (with rank), Experience.
  - **Attributes:** (4) Strength, Agility, Wits, Empathy.
  - **Skills:** (16) Might, Endurance, Melee, Crafting (Strength); Stealth, Sleight of Hand, Move, Marksmanship (Agility); Scouting, Lore, Survival, Insight (Wits); Manipulation, Performance, Healing, Animal Handling (Empathy); each with a skill level.
  - **Trackers:** attribute damage by Conditions (Hungry, Sleepless, Thirsty, Cold), Critical Injuries, Willpower.
  - **Gear:** Helmet, Armor, Shield, Weapons (Bonus, Damage, Range, Comment), Gear (Bonus), Consumables (Food, Water, Arrows, Torches), Silver/Copper/Gold, Carrying Capacity, Relationships (PC1–4), Mount (Name, Strength, Agility).
- **Adversary sheet, in display order.**
  - [OFFICIAL-DEV] (`fvtt-fria-ligan/forbidden-lands-foundry-vtt`, `template.json`, actor types character, monster, party, stronghold). Monster: Name, Type (Monster or Mount), Movement (rate + description), Armor Rating, Strength, Agility, Wits, Empathy, Health, Resolve, skills, monster attacks (description, dice, damage, damage type Blunt / Slash / Stab / Fear / Other, range, uses Strength), monster talents, gear. Stronghold sheet [OFFICIAL]: location name, description, functions, stockpile (Iron Ore, Iron, Silver, Gold, Stone, Glass, Wood, Fur, Leather, Cloth, Wool, Food, Bread, Water, Flour, Grain, Meat, Fish, Vegetables, Tallow, Herbs), Production, Salary, Number, Hirelings, Defense Rating, Strongholds.
- **Rolls.** Skill roll (attribute + skill + gear dice); armor roll; monster attack (dice pool); push.
- **Sources.** https://github.com/fvtt-fria-ligan/forbidden-lands-foundry-vtt ; Brazil: https://jogaod20.com/2020/11/11/pre-venda-forbidden-lands-br/ (Sagen Editora, pre-sale reported)
- **UNVERIFIED.** That the book numbers a monster's attacks as a D6 table (not confirmed from free sources); monster stat ranges; carrying capacity (Strength × 2 is a community figure); the pt-BR field names.

### 3.20 The One Ring, 2nd edition (Free League; Middle-earth Enterprises)

- **Licence.** Trademarks "of Middle-earth Enterprises LLC and used under license by Fria Ligan AB (dba Free League)" (https://freeleaguepublishing.com/shop/the-one-ring/starter-set/). No open licence; not in the Workshop list. Not usable for branded layouts. (Not "The Lord of the Rings Roleplaying", the 5E-based line, which has its own d20 sheet.)
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** No licence to cite.
- **Character sheet, in display order.**
  - Hero sheet, field names only (https://freeleaguepublishing.com/wp-content/uploads/2023/09/TOR_Pregens.pdf).
  - **Header:** Name, Heroic Culture, Cultural Blessing, Calling, Age, Patron, Shadow Path, Standard of Living, Distinctive Features, Flaws.
  - **Attributes:** (3) Strength, Heart, Wits, each with a Rating and a **TN**.
  - **Derived:** Endurance (current/max), Hope (current), Parry, Shadow, Valour, Wisdom, Fatigue, Load, conditions Weary / Miserable / Wounded, Shadow Scars, Fellowship Score.
  - **Skills:** (18) Awe, Athletics, Awareness, Hunting, Song, Craft, Enhearten, Travel, Insight, Healing, Courtesy, Battle, Persuade, Stealth, Scan, Explore, Riddle, Lore.
  - Combat proficiencies: Axes, Bows, Spears, Swords.
  - **Gear:** War Gear (Weapon: Damage, Injury, Load), Armour (Protection, Load), Helm, Shield (Parry), Travelling Gear, Rewards, Virtues, Treasure; Adventure Points, Skill Points.
  - Other sheets: Journey Log (https://freeleaguepublishing.com/wp-content/uploads/2023/09/TOR_Journey_Log_fillable.pdf: Year, Season, Journey from, Destination, Days of travel, the company, ponies and horses, Travel Fatigue, journey path, journal, Events 1–6), Moria Mission Worksheet, Ally cards.
- **Adversary sheet, in display order.**
  - [COMMUNITY] only: the plugin "tor2e statblocks" (https://www.obsidianstats.com/plugins/tor2e-statblocks ; https://github.com/modality/obsidian-the-one-ring-2e-statblocks), fields in order: name, description, features, level (Attribute Level), endurance, might, hate (or resolve), parry, armour, proficiencies (name, rating, damage, injury, special), abilities (Fell Abilities). The core book was not read.
- **Rolls.** Feat die + success dice (the formula is **UNVERIFIED**); parry TN; Hate/Resolve is a counter.
- **Sources.** The pages above.
- **UNVERIFIED.** The official adversary field order and the Parry/Armour semantics; Hate against Resolve; the skill-to-attribute grouping (the sheet's columns imply Strength first six, Heart next six, Wits last six); the Endurance and Hope formulas; the Wisdom and Valour ranges; combat stance cards; Loremaster tools; the pt-BR edition and names; the Council/Fellowship sheet.

### 3.21 Vaesen (Free League)

- **Licence.** Free League's licences page lists only Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis and the Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (and Forbidden Lands, Symbaroum, Coriolis) are in the Free League Workshop, a DriveThruRPG community programme for supplements (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN and The One Ring are on neither.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** No licence to cite.
- **Character sheet, in display order.**
  - Official sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/08/Vaesen-Character-Sheet.pdf).
  - **Header:** Name, Age / Age Group, Archetype, Motivation, Trauma, Dark Secret, Relationships (PC 1–4), Resources, Talents, Advantages, Memento, Equipment, Insights & Defects, Experience.
  - **Attributes:** (4) Physique, Precision, Logic, Empathy.
  - **Skills:** (12) Agility, Close Combat, Force (Physique); Stealth, Ranged Combat, Medicine (Precision); Learning, Vigilance, Investigation (Logic); Observation, Manipulation, Inspiration (Empathy).
  - **Conditions:** Physical: Exhausted, Battered, Wounded, Broken; Mental: Angry, Frightened, Hopeless, Broken.
  - **Gear:** Armor (Protection, Agility), Weapons (Damage, Bonus, Range).
  - Headquarters sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/08/Vaesen-HQ-Sheet.pdf): Name, Type of Building, Location, Function/Asset (×12), Development Points, Upgrades, History, Facilities, Discovered Facilities, Contacts, Personnel.
- **Adversary sheet, in display order.**
  - [OFFICIAL-DEV] (`fvtt-fria-ligan/vaesen-foundry-vtt`, GPL-3.0, https://github.com/fvtt-fria-ligan/vaesen-foundry-vtt). NPC: attributes, skills, physical/mental condition (value/max), armor, weapons, gear, information. Vaesen (creature): attributes **Might, Body Control, Magic, Manipulation**; Fear (initial, subsequent); armor; attacks (name, damage, range, attribute); gear; ritual (known, secret); note.
- **Rolls.** d6 pool (the rule text was not read).
- **Sources.** Brazil: Sagen Editora announced it in Dec 2020 (https://jogaod20.com/2020/12/16/vaesen-portugues-sagen/); completion unconfirmed.
- **UNVERIFIED.** Whether "Body Control" is the printed English term; condition effects; starting values; threat-level rules; the pt-BR names.

### 3.22 Twilight: 2000, 4th edition (Free League)

- **Licence.** Free League's licences page lists only Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis and the Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (and Forbidden Lands, Symbaroum, Coriolis) are in the Free League Workshop, a DriveThruRPG community programme for supplements (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN and The One Ring are on neither.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** No licence to cite.
- **Character sheet, in display order.**
  - Official sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/08/T2K4-Character-Sheet-English-Color.pdf).
  - **Header:** Name, Nationality, Branch, Military Rank, Specialties, How You Met the Group, Buddy, Moral Code, Big Dream, Appearance.
  - **Attributes:** (4) Strength, Agility, Intelligence, Empathy.
  - **Skills:** (16) Heavy Weapons, Close Combat, Stamina (Strength); Driving, Mobility, Ranged Combat (Agility); Recon, Survival, Tech (Intelligence); Command, Persuasion, Medical Aid (Empathy).
  - **Trackers:** Hit Capacity, Stress Capacity, Coolness Under Fire, Unit Morale; Damage / Stress (temporary, current, permanent, total); Radiation; Experience; Conditions: Starving, Dehydrated, Sleep Deprived, Hypothermic; Critical Injuries; Diseases.
  - **Gear:** Combat gear, Backpack, Tiny Items; Weapons (Base Die, REL, ROF, Damage, Crit, Blast, Range, Mag, Armor, Weight, Spent Ammo); Armor by location Head, Arms, Torso, Legs.
- **Adversary sheet, in display order.**
  - [OFFICIAL-DEV] (`fvtt-fria-ligan/twilight2000-foundry-vtt`, GPL-3.0): actor types character, npc, vehicle, unit, party. Vehicle: type, reliability, movement (combat, travel on-road, off-road), armor (front, left, right, rear), fuel, cargo, crew, components (fuel, engine, suspension, ammunition, radio, track/wheel, FCS, antenna). Unit: faction, affiliation, size, type, modifiers, personnel, vehicles, HQ. NPC: attributes, skills, combat, actions, `unitMorale`.
- **Rolls.** Base die and stress (the formulas were not read).
- **Sources.** https://github.com/fvtt-fria-ligan/twilight2000-foundry-vtt
- **UNVERIFIED.** Base-die and stress formulas; the Hit Capacity formula; ROF and Crit semantics; the book's NPC guidelines; unit morale rules; the pt-BR edition; vehicle damage rules.

### 3.23 Vampire: The Masquerade, 5th edition (Paradox / White Wolf; books by Renegade Game Studios; pt-BR Galapagos Jogos)

- **Licence.** Paradox's Dark Pack Agreement (https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement) **[OFFICIAL]**: non-commercial fan content is allowed without permission, including "character sheets, and free online character generators"; "Online character generators, including downloadable and mobile apps, must be free, with no in-app purchases"; "Virtual dice rollers are permitted"; no selling, no copying a book in full, no removing notices; revocable "at any time, for any reason"; terms change on 30 days' notice. Blank layouts, no verbatim text. Paradox announced a V6 alpha playtest on 30 Jul 2026 (https://www.paradoxinteractive.com/games/world-of-darkness/news/vtm-sixth-edition-alpha-playtests-open-now): V5 may be superseded.
- **Ships (ADR 0099 item 6).** Built in since 2026-10-21 (decided by the maintainer, 0099.6c = A) under Paradox's Dark Pack, with the full notice and the Dark Pack logo on the credits page only (maintainer, 2026-10-21, S.3b = B), plus one short line on the card that points there, which is the build's choice, not his, awaiting his answer (S.3b-bis; ADR 0099 item 6, 2026-10-21). Layouts: see the status line below. The logo's source and hash are in "The Dark Pack logo" under 3.23. The pt-BR field names of the three sheets are **provisional** (S.3c): chosen from common Brazilian RPG-community terms and not checked against the Brazilian books.
- **Credit line.** Required verbatim: "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission." and "All rights reserved. For more information please visit worldofdarkness.com." plus the Dark Pack logo and a statement that the content is not official World of Darkness material (no exact wording provided). Suggested: "Vampire: The Masquerade, World of Darkness and related terms are trademarks of Paradox Interactive AB. Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com. This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack."
- **Character sheet, in display order.**
  - [COMMUNITY] wiki, CC BY-SA 3.0, hosted by Paradox (https://vtm.paradoxwikis.com/Character_creation).
  - **Attributes:** (9) Physical: Strength, Dexterity, Stamina; Social: Charisma, Manipulation, Composure; Mental: Intelligence, Wits, Resolve; distribution one at 1, four at 2, three at 3, one at 4.
  - **Skills:** (27) Physical: Athletics, Brawl, Craft, Drive, Firearms, Larceny, Melee, Stealth, Survival; Social: Animal Ken, Etiquette, Insight, Intimidation, Leadership, Performance, Persuasion, Streetwise, Subterfuge; Mental: Academics, Awareness, Finance, Investigation, Medicine, Occult, Politics, Science, Technology; plus Specialties.
  - **Derived:** Health = Stamina + 3; Willpower = Composure + Resolve; Humanity starts at 7 (before Predator-type modifiers); Blood Potency on a chart tied to generation.
  - **Trackers:** Hunger; Health and Willpower (Superficial / Aggravated); Humanity (stains); Blood Potency.
  - **Sections:** Name, Concept, Predator Type, Chronicle, Ambition, Clan, Sire, Desire, Generation; Attributes; Skills; Disciplines; Chronicle Tenets; Touchstones and Convictions; Advantages and Flaws (Merits, Loresheets, coterie).
- **Adversary sheet, in display order.**
  - [COMMUNITY] wiki (https://vtm.paradoxwikis.com/Antagonists): the minimal entry is a name plus one **Difficulty** ("Ghost 3"); most antagonists have dice pools per action category instead of attribute and skill dots; some give two Difficulties separated by a slash (the first for what the antagonist excels at, the second for everything else). The "Mortal / Ghoul / Vampire" simplified structure is **not confirmed**. Coterie sheet: UNVERIFIED.
- **Rolls.** Each category's dice pool; a single-die critical option (wiki).
- **Sources.** The wiki pages above; Galapagos Jogos since 2021 (https://newsrpg.wordpress.com/2025/10/09/os-titulos-de-vampiro-a-mascara-disponiveis-no-brasil/).
- **UNVERIFIED.** The Hunger cap and rules on an official source (0–5 is a fan cheat sheet); Health and Willpower track length; Predator-type modifiers; the official antagonist structure and the category names of pools; the Mortal/Ghoul/Vampire format; **all** pt-BR names (do not rely on memory); the Humanity max; the Blood Potency chart values.

#### The Dark Pack logo (fetched 2026-10-21)

- **Source.** The agreement page (https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement) links two logo images and a "Download Free Content" Dropbox kit. The kit's `WoD-Logos-and-Symbols.zip` holds `Dark Pack Logos/DarkPack_Logo1.png` and `DarkPack_Logo2.png` (and `.eps`), byte-identical to the images on the page: Logo1 https://images.ctfassets.net/u73tyf0fa8v1/tMXQxwE2ILqjHGCTe0inb/04fbb35e5326f7f76bea7ff4ba2ffbf3/darkpack_logo1.png and Logo2 (red border) https://images.ctfassets.net/u73tyf0fa8v1/3oBTHBZk9XmfcBlUPylvFh/673e4a6b14566548c03424ddf627b944/darkpack_logo2.png. No account or acceptance step stood in the way.
- **Kept.** `DarkPack_Logo1.png` (3000x3007, RGBA), unaltered, as `app/ui/web-assets/darkpack-logo.png`: SHA-256 `6d521644dabd493c1447bf7188130e4e49ade132b3d18ee76dc395208aa49083` (Logo2: `285e20a71753bbce12e21a18b5812d62586a809b6d4dff5b4daeb2dd9b1afce0`, not used). A test holds the hash. It is copied into the build with the other web assets, so the service worker keeps it offline (background list), and the credits page shows it beside each Dark Pack notice, drawn at 6 rem, with alt text.
- **The agreement's wording.** The logo goes "somewhere on your material"; the page asks for it when promoting content. The notices are required verbatim; the page gives no wording for the "not official" statement.

### 3.24 Werewolf: The Apocalypse, 5th edition (Paradox / White Wolf)

- **Licence.** Dark Pack, as for Vampire above. Fit: conditional.
- **Ships (ADR 0099 item 6).** Built in since 2026-10-21 (decided by the maintainer, 0099.6c = A) under Paradox's Dark Pack, with the full notice and the Dark Pack logo on the credits page only (maintainer, 2026-10-21, S.3b = B), plus one short line on the card that points there, which is the build's choice, not his, awaiting his answer (S.3b-bis; ADR 0099 item 6, 2026-10-21). Layouts: see the status line below. The logo's source and hash are in "The Dark Pack logo" under 3.23. The pt-BR field names of the three sheets are **provisional** (S.3c): chosen from common Brazilian RPG-community terms and not checked against the Brazilian books.
- **Credit line.** Required verbatim: "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission." and "All rights reserved. For more information please visit worldofdarkness.com." plus the Dark Pack logo and a statement that the content is not official World of Darkness material (no exact wording provided). Suggested: "Werewolf: The Apocalypse, World of Darkness and related terms are trademarks of Paradox Interactive AB. Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com. This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack."
- **Character sheet, in display order.**
  - [COMMUNITY] wiki (https://wta.paradoxwikis.com/Character_creation): the same 9 attributes and 27 skills as V5; Health = Stamina + 3; Willpower = Composure + Resolve; **Renown** (two dots in the tribe's type, one in another). **Sections:** Name, Concept, Patron, Chronicle, Auspice, Tribe; Attributes; Skills; Renown; Gifts and Rites; Chronicle Tenets; Touchstones; Favors and Bans; Advantages and Flaws.
  - **Trackers:** Rage 0–5: each Rage point replaces a die; Rage dice showing 1–2 are Brutal; a Rage Check is one die; Rage above 5 causes Superficial Willpower damage (https://wta.paradoxwikis.com/Rage_system). Forms: Homid, Glabro, Crinos, Hispo, Lupus (https://wta.paradoxwikis.com/Forms).
- **Adversary sheet, in display order.**
  - UNVERIFIED (the wiki links "Antagonists and Allies"; not read).
- **Rolls.** Rage dice.
- **Sources.** The wiki pages above.
- **UNVERIFIED.** The three Renown names (Glory / Honor / Wisdom is a guess); Harmony and its range; whether Gnosis exists in W5; the antagonist and spirit statblocks; tribe and auspice effects; health track length; the pt-BR names and publisher.

### 3.25 Hunter: The Reckoning, 5th edition (Paradox / White Wolf)

- **Licence.** Dark Pack, as for Vampire above. Fit: conditional.
- **Ships (ADR 0099 item 6).** Built in since 2026-10-21 (decided by the maintainer, 0099.6c = A) under Paradox's Dark Pack, with the full notice and the Dark Pack logo on the credits page only (maintainer, 2026-10-21, S.3b = B), plus one short line on the card that points there, which is the build's choice, not his, awaiting his answer (S.3b-bis; ADR 0099 item 6, 2026-10-21). Layouts: see the status line below. The logo's source and hash are in "The Dark Pack logo" under 3.23. The pt-BR field names of the three sheets are **provisional** (S.3c): chosen from common Brazilian RPG-community terms and not checked against the Brazilian books.
- **Credit line.** Required verbatim: "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission." and "All rights reserved. For more information please visit worldofdarkness.com." plus the Dark Pack logo and a statement that the content is not official World of Darkness material (no exact wording provided). Suggested: "Hunter: The Reckoning, World of Darkness and related terms are trademarks of Paradox Interactive AB. Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com. This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack."
- **Character sheet, in display order.**
  - [COMMUNITY] wiki (https://htr.paradoxwikis.com/Character_creation): 9 attributes as V5; skills as V5 except Physical lists **Driving** (V5 and W5 pages say Drive: a discrepancy to verify). Health = Stamina + 3; Willpower = Composure + Resolve. **Creed** (Entrepreneurial, Faithful, Inquisitive, Martial, Underground) with a Creed Field; **Drive** (each with a Redemption method); **Edges** (no rating; choose 2 Edges + 1 Perk or 1 + 2) and Perks; Ambition, Desire, Touchstones (1–3), Advantages (7 dots), Flaws (2 dots). **Sections:** Name, Concept, Creed, Cell, Ambition, Desire, Drive, Redemption; Attributes; Skills; Edges and Perks; Chronicle Tenets; Touchstones; Creed Fields; Advantages and Flaws.
  - Cell trackers (https://htr.paradoxwikis.com/Desperation): **Desperation** 1–5 (shared by the cell; sets the Desperation Dice), **Danger** (rises on a 1 on a Desperation Die), **Despair** (a state, redeemed through the Drive's Redemption).
- **Adversary sheet, in display order.**
  - UNVERIFIED.
- **Rolls.** Desperation dice.
- **Sources.** The wiki pages above.
- **UNVERIFIED.** The list of Drive names; Edge names and ratings; the Danger max; the adversary format; the Cell sheet; the pt-BR names and publisher; Driving against Drive; the Health track.

### 3.26 Mage: The Ascension, 20th Anniversary Edition (Onyx Path, licensed from Paradox / White Wolf)

- **Licence.** Onyx Path's own fan policy was not found (only the Storypath Ultra Third-Party License, which is not M20). The Dark Pack covers "all World of Darkness products published by Paradox, its licensees, and affiliates": applied by analogy; **confirm with Onyx Path / Paradox**. The official M20 sheets are on DriveThruRPG behind an account (https://theonyxpath.com/character-sheets/).
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** No exact text; if the Dark Pack applies, its notices (see Vampire).
- **Character sheet, in display order.**
  - **UNVERIFIED in full.** Memory only, **do not ship**: Nature, Demeanor, Essence, Tradition, Affiliation; nine Attributes (Strength, Dexterity, Stamina, Charisma, Manipulation, Appearance, Perception, Intelligence, Wits); Talents / Skills / Knowledges; Spheres (Correspondence, Entropy, Forces, Life, Matter, Mind, Prime, Spirit, Time, optional Data / Dimensional Science); Arete, Willpower, Quintessence, Paradox, Health levels, Resonance, Backgrounds, Foci.
- **Adversary sheet, in display order.**
  - UNVERIFIED (M20 uses Attribute + Ability pools; no simplified difficulty block is confirmed).
- **Rolls.** UNVERIFIED.
- **Sources.** https://theonyxpath.com/character-sheets/
- **UNVERIFIED.** Essentially everything except the publisher and that a DriveThruRPG sheet exists (14 items).

### 3.27 Call of Cthulhu, 7th edition (Chaosium)

- **Licence.** Chaosium Fan Material Policy (https://www.chaosium.com/fan-material-policy/ ; options https://www.chaosium.com/fan-use-and-licensing/) **[OFFICIAL]**: allowed are references, short quotes and "your own character sheets, including web-based sheets that autofill or calculate values"; **"Downloadable software, apps, and virtual tabletops are excluded and require a Commercial License. Web-based character generators are allowed."** So not shippable as a downloadable app without a Commercial License. The BRP SRD (BRP Open-Gaming License) is separate and does not cover CoC 7e text.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** "This material uses trademarks and/or copyrights owned by Chaosium Inc/Moon Design Publications LLC, which are used under Chaosium Inc.'s Fan Material Policy. This material is not published, endorsed, or specifically approved by Chaosium Inc."
- **Character sheet, in display order.**
  - Quick-Start Rules [OFFICIAL] (https://www.chaosium.com/content/FreePDFs/CoC/CHA23131%20Call%20of%20Cthulhu%207th%20Edition%20Quick-Start%20Rules.pdf).
  - **Sections:** Investigator info (name, occupation, …).
  - **Attributes:** (8) STR, CON, SIZ, DEX, APP, EDU, INT, POW; each shown as Regular, Hard (half), Extreme (one-fifth).
  - **Trackers:** Hit Points, Magic Points, Luck, Sanity (Starting SAN = POW; an "Insane" box = one-fifth of Starting SAN; Maximum Sanity reduced by Cthulhu Mythos); marks Temporary Insanity, Indefinite Insanity, Major Wound, Unconscious, Dying.
  - **Skills:** a list with base values in parentheses ("Accounting (05%)"), each with Regular / Hard / Extreme boxes.
  - **Gear:** Weapons (Regular/Hard/Extreme skill, damage, attacks per round, range, ammo, malfunction); Action Reference: Move (human average 8), Build, Damage Bonus, Dodge; My Story / Backstory; Possessions.
- **Adversary sheet, in display order.**
  - Two shapes in the Quick-Start adventure The Haunting [OFFICIAL]. Creature (Rat Pack): STR, CON, SIZ, POW, DEX, HP, Average Damage Bonus, Average Build, Move; Combat: attacks per round, Fighting attacks (named attack, skill with Hard/Extreme, damage), maneuvers, Dodge (with Hard/Extreme), special text. Humanoid (Walter Corbitt): STR, CON, SIZ, INT, POW, DEX, APP, EDU, SAN, HP, Damage Bonus, Build, Move, Magic Points; roleplaying hooks; combat; spells.
- **Rolls.** Each Fighting / Firearms skill (Regular, Hard, Extreme), Dodge, damage dice, SAN loss dice (`0/1D6`: success loss / failure loss), bonus and penalty dice.
- **Sources.** The Quick-Start PDF above.
- **UNVERIFIED.** The derived formulas (HP, MP, Luck roll, Move, Build, DB: in the Investigator Handbook); a monster's own Sanity-loss line; the Armor line format; the spells block format; pulp and other-era sheets; the pt-BR names and publisher.

### 3.28 Cyberpunk RED (R. Talsorian Games)

- **Licence.** Homebrew Content Policy (https://rtalsoriangames.com/homebrew-content-policy/) **[OFFICIAL]**: content must be free to access; paid products may not say "compatible with"; **no reproducing RTG text "including stat blocks and rulesets"**; no RTG title in your product title. "You may create character sheets and generators that automate character creation, rolls, and random content"; game material "can only be summarized"; **"Full stat blocks for monsters, NPCs, or hazards are not allowed."** Free content may go through app marketplaces. An unofficial-content disclaimer (about 230 characters) is required where easily noticed. Fit: blank layouts and summaries only.
- **Ships (ADR 0099 item 6).** Built in since 2026-10-21 (decided by the maintainer, 0099.6c = A) as blank layouts (`cpr-blank-character`, `cpr-blank-npc`: field names only, no rules text, no stat block, no sheet text copied), titled as a descriptive subtitle ("Blank sheet — for Cyberpunk RED", "NPC sheet — for Cyberpunk RED", as the policy allows). The policy's disclaimer was read word for word on 2026-10-21 at https://rtalsoriangames.com/homebrew-content-policy/ and is on the credits page in full; the full text is on the credits page only (maintainer, 2026-10-21, S.3b = B); the card carries one short line that points there, which is the build's choice, not his, awaiting his answer (S.3b-bis; ADR 0099 item 6). The pt-BR field names are **provisional** (S.3c), not checked against the Brazilian books. **Note:** the policy asks for the disclaimer "in an easily noticeable location such as the end of the document"; the credits page is the maintainer's choice of place (S.3b = B), the card's pointer line is the build's (awaiting him), and the credit line below is the exact one.
- **Credit line.** Verified word for word on 2026-10-21 (https://rtalsoriangames.com/homebrew-content-policy/), required "in an easily noticeable location such as the end of the document" for content beyond a forum post: "[Title of your Content] is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees." with the title of the content filled in; the window shows it in full on the credits page and, on each blank card, only a short line that points there (a build's choice awaiting the maintainer, S.3b-bis; corrected 2026-10-21, the text used to say the full disclaimer sat at the foot of each blank card). The policy forbids the game's title in the content's own title but allows it in a descriptive subtitle.
- **Character sheet, in display order.**
  - Official sheet (https://rtalsoriangames.com/wp-content/uploads/2020/11/RTG-CPR-CharacterSheet.pdf).
  - **Attributes:** (10) INT, REF, DEX, TECH, COOL, WILL, MOVE, BODY, EMP, LUCK (LUCK and EMP shown "out of").
  - **Skills:** by category, each with its stat, a BASE and a LVL: Awareness (Concentration WILL, Conceal/Reveal Object INT, Lip Reading INT, Perception INT, Tracking INT); Body (Athletics DEX, Contortionist DEX, Dance DEX, Endurance WILL, Resist Torture/Drugs WILL, Stealth DEX); Control (Drive Land Vehicle REF, Pilot Air Vehicle ×2 REF, Pilot Sea Vehicle REF, Riding REF); Education (Accounting, Animal Handling, Bureaucracy, Business, Composition, Criminology, Cryptography, Deduction, Education, Gamble, Language, Library Search, Local Expert, Science, Tactics, Wilderness Survival: all INT); Fighting (Brawling DEX, Evasion DEX, Martial Arts ×2 DEX, Melee Weapon DEX); Performance (Acting COOL, Play Instrument TECH); Ranged Weapon (Archery REF, Autofire ×2 REF, Handgun REF, Heavy Weapons ×2 REF, Shoulder Arms REF); Social (Bribery COOL, Conversation EMP, Human Perception EMP, Interrogation COOL, Persuasion COOL, Personal Grooming COOL, Streetwise COOL, Trading COOL, Wardrobe & Style COOL); Technique (Air Vehicle Tech, Basic Tech, Cybertech, Demolitions ×2, Electronics/Security Tech ×2, First Aid, Forgery, Land Vehicle Tech, Paint/Draw/Sculpt, Paramedic ×2, Photography/Film, Pick Lock, Pick Pocket, Sea Vehicle Tech, Weaponstech: all TECH). "×2" = double-cost skills.
  - **Trackers:** Role + Role Ability (rank), Hit Points (current/max), Seriously Wounded, Death Save, Humanity (out of), Luck (out of), Improvement Points, Reputation, Armor Head / Body / Shield (SP) with the REF/DEX/MOVE penalty, Weapons (Weapon, DMG, ROF, Notes), Critical Injuries, Addictions, Gear (Ammunition, Cash), Lifepath fields, Cyberware page (Neural Link, Cybereyes, Cyberaudio Suite, Cyberarms, Cyberlegs, Internal/External Cyberware, Fashionware, Borgware with option slots).
- **Adversary sheet, in display order.**
  - Mooks sheet "Hardened Mooks" (https://rtalsoriangames.com/wp-content/uploads/2021/10/RTG-CPR-MooksSheetFormFillable.pdf), per NPC: 10 stats (LUCK, WILL, MOVE, BODY, EMP, COOL, TECH, DEX, REF, INT), Death Save, Seriously Wounded, Hit Points, Armor (Head SP / Body SP), Weapons (name + damage dice), Skill Bases, Cyberware & Special Equipment. The sheet has pre-filled example text: **do not copy it**. An elite NPC / Lieutenant sheet: UNVERIFIED.
- **Rolls.** Skill Base (stat + skill) rolls with 1d10 (rule text UNVERIFIED); weapon damage dice (`5d6`); Death Save roll-under; Luck.
- **Sources.** Data Pack sheet (not read): https://rtalsoriangames.com/wp-content/uploads/2021/09/RTG-CPR-DataPack-Charsheet-CLC.pdf
- **UNVERIFIED.** The disclaimer's exact wording; the derived formulas (HP = 10 + 5 × average of BODY and WILL rounded up, Death Save = BODY, Humanity = EMP × 10, Seriously Wounded = HP/2 are not printed on the sheet); the elite NPC sheet; vehicle and netrunner NET sheets; the pt-BR publisher and names.

### 3.29 Shadowrun, 6th edition (Catalyst Game Labs)

- **Licence.** No app or fan-sheet policy found. Catalyst's "Holostreets" (DriveThruRPG community programme, https://www.shadowrunsixthworld.com/?p=1146) is for publications and says nothing about apps or rules text. Assume no until a written policy is found.
- **Ships (ADR 0099 item 6).** Not named in ADR 0099 item 6; not built in
- **Credit line.** None.
- **Character sheet, in display order.**
  - **UNVERIFIED** (no official sheet obtained). Memory only, **do not ship**: Body, Agility, Reaction, Strength, Willpower, Logic, Intuition, Charisma, Edge, Essence, Magic/Resonance; Initiative; Condition Monitors (Physical/Stun); skills with specialisations.
- **Adversary sheet, in display order.**
  - UNVERIFIED (Grunt / Professional Rating; vehicle, drone, spirit, sprite sheets).
- **Rolls.** UNVERIFIED.
- **Sources.** None.
- **UNVERIFIED.** Everything except the absence of a licence (12 items).

### 3.30 Starfinder, 2nd edition (Paizo)

- **Licence.** ORC, announced by Paizo for Starfinder 2e (https://paizo.com/blog/new-and-revised-licenses ; https://paizo.com/orclicense). Licensed Material: character stats and creation, game systems and rules; Reserved Material (trademarks, trade dress, art, distinctive characters, settings and story elements) is not licensed; ORC licenses no software code; new mechanics in electronic products are released under ORC; notices required: ORC Notice, Attribution Notice, Reserved Material Notice. The books' own ORC page was not read: which parts they declare Reserved is **UNVERIFIED**.
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** Verified 2026-10-20: the ORC Notice is the licence's own required text (https://paizo.com/orclicense, III.a): "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations. All warranties are disclaimed as set forth therein." (its sample adds "including [domains] and others"). III.b asks for a good-faith attribution statement "worded in any accurate and reasonable manner" and III.c for a Reserved Material statement. The window shows the ORC Notice and "Starfinder Second Edition (c) Paizo Inc., used under the ORC License. Not affiliated with Paizo." (our words). Paizo's own Starfinder notice and its list of Reserved Material were not found online: **UNVERIFIED**, so none is claimed.
- **Character sheet, in display order.**
  - **UNVERIFIED** (no official sheet read). Memory only, **do not ship**: ancestry/heritage, background, class; six attribute modifiers; Stamina Points, Resolve Points, HP; AC; Perception; Fort/Ref/Will; skills with ranks; speed; Hero Points. Starship sheet (the AoN "starship combat" section): structure UNVERIFIED.
- **Adversary sheet, in display order.**
  - Creature [OFFICIAL SRD-style, Archives of Nethys "Alien Core", https://2e.aonsrd.com/rules/1263-alien-core], in order: Name and Level; Traits (rarity, size, others); Perception (+ senses); Languages; Skills; Attribute Modifiers; Items; Interaction Abilities; AC; Saving Throws (Fort/Ref/Will); HP (+ automatic abilities); Immunities, Weaknesses, Resistances; Automatic Abilities; Reactive Abilities; Speed; Melee; Ranged; Area Fire; Spells; Innate Spells; Focus Spells; Rituals; Offensive/Proactive Abilities.
- **Rolls.** Perception, skills, saves, Strike bonuses and damage, spell DC.
- **Sources.** https://2e.aonsrd.com/rules/1263-alien-core
- **UNVERIFIED.** The PC sheet; which parts the books declare Reserved; the starship sheet; no official pt-BR edition found (8 items).

### 3.31 Warhammer Fantasy Roleplay, 4th edition (Cubicle 7 / Games Workshop)

- **Licence.** None found (Cubicle 7's site sits behind Cloudflare, not bypassed). Assume no.
- **Ships (ADR 0099 item 6).** Not named in ADR 0099 item 6; not built in
- **Credit line.** None.
- **Character sheet, in display order.**
  - [COMMUNITY]/secondary (https://d20radio.com/main/?p=14955 ; https://startplaying.games/blog/posts/how-to-create-a-character-for-warhammer-fantasy-roleplay): 10 characteristics Weapon Skill, Ballistic Skill, Strength, Toughness, Agility, Initiative, Dexterity, Intelligence, Willpower, Fellowship; characteristic bonus = tens digit; Wounds from Strength Bonus + Toughness Bonus + Willpower Bonus; Movement (Walk/Run); Fate, Fortune (max = Fate), Resilience, Resolve (max = Resilience), Motivation, Experience (current/spent/total), Advances.
- **Adversary sheet, in display order.**
  - UNVERIFIED (Traits, Trappings, Armour/AP by location; not read).
- **Rolls.** UNVERIFIED.
- **Sources.** The pages above.
- **UNVERIFIED.** The wounds formula with its multipliers; the creature format; the Brazilian publisher (11 items).

### 3.32 Kids on Bikes (Hunters Entertainment / Renegade)

- **Licence.** No third-party policy found (https://www.huntersentertainment.com/). Unclear.
- **Ships (ADR 0099 item 6).** Not named in ADR 0099 item 6; not built in
- **Credit line.** None.
- **Character sheet, in display order.**
  - **UNVERIFIED.** Recollection only, **do not ship**: six stats Fight, Flight, Brains, Brawn, Charm, Grit on a dice ladder; Strengths and Flaws; Fear and Adversity tokens.
- **Adversary sheet, in display order.**
  - UNVERIFIED.
- **Rolls.** UNVERIFIED.
- **Sources.** https://www.huntersentertainment.com/
- **UNVERIFIED.** Everything (8 items).

### 3.33 Brindlewood Bay (Gauntlet)

- **Licence.** No terms visible: the publisher page's footer reads "© COPYRIGHT 2024. ALL RIGHTS RESERVED" (https://www.gauntlet-rpg.com/brindlewood-bay.html). Unclear.
- **Ships (ADR 0099 item 6).** Not named in ADR 0099 item 6; not built in
- **Credit line.** None.
- **Character sheet, in display order.**
  - **UNVERIFIED** (Maven playbooks, Moves, Mysteries / Clues, Theories: names only, structure not read).
- **Adversary sheet, in display order.**
  - UNVERIFIED.
- **Rolls.** UNVERIFIED.
- **Sources.** https://www.gauntlet-rpg.com/brindlewood-bay.html
- **UNVERIFIED.** Everything (7 items).

### 3.34 Ordem Paranormal RPG (Jambô Editora; Cellbit)

- **Licence.** Per a community Foundry package (not Jambô), the book's rule text is Open Game Content under the OGL except Product Identity: chapters 5, 7 and 8, the setting terms (Membrana, Outro Lado…), names and descriptions of characters, creatures, places and organizations, all illustrations, and the rules for rituals, paranormal powers, Sanity and mental damage (https://foundryvtt.com/packages/ordemparanormal ; https://github.com/SouOWendel/ordemparanormal_fvtt). **Verify on the book's own OGL page.** No Jambô fan policy found. A layout using SAN, PE or NEX is risky.
- **Ships (ADR 0099 item 6).** Not named in ADR 0099 item 6; not built in
- **Credit line.** None.
- **Character sheet, in display order.**
  - [COMMUNITY] (GPL/CC fan Foundry system `template.json`, https://raw.githubusercontent.com/SouOWendel/ordemparanormal_fvtt/main/template.json; field names only, do not copy code). Actor types `agent`, `threat`.
  - **Trackers:** PV, SAN, PE (Pontos de Esforço), PD (meaning UNVERIFIED), NEX (exposure %), stage/level, Defesa, Deslocamento.
  - **Attributes:** (5) dex, int, pre, str, vit (pt-BR Agilidade, Intelecto, Presença, Força, Vigor: UNVERIFIED).
  - **Skills:** (with attribute) acrobatics (dex), animal handling (pre), arts (pre), athletics (str), current events (int), sciences (int), crime (dex), diplomacy (pre), deception (pre), resilience (vit), stealth (dex), initiative (dex), intimidation (pre), intuition (pre), investigation (int), fighting (str), medicine (int), occultism (int), perception (pre), piloting (dex), aim (dex), reflexes (dex), religion (pre), survival (int), tactics (int), technology (int), will (pre), plus a free skill; degrees untrained / trained / veteran / expert (labels UNVERIFIED).
  - **Sections:** Class, origin, trail, ritual DT, patent (rank, prestige points, credit limit, item limits); items: armament, protection, general equipment, rituals, abilities, origins, paths, classes.
- **Adversary sheet, in display order.**
  - [COMMUNITY] same template, actor type `threat`: HP, five attributes, movement (walk, unit, squares), **VD**, skills (fighting, aim, resilience, reflexes, will, initiative, perception, free skill), defense (value, skill resistances, damage resistances), resistances by damage type (cutting, impact, piercing, ballistic, fire, electric, cold, chemical, mental, blood, death, knowledge, energy), vulnerabilities, size, disturbing presence (DT, mental damage, immune NEX), fear riddle, creature type, elements (main, others), senses, abilities, actions, description.
- **Rolls.** Skill tests, attacks, DT checks (the d20 rule is UNVERIFIED).
- **Sources.** The package and repository above; the book at https://www.martinsfontespaulista.com.br/ordem-paranormal-rpg-1058711/p
- **UNVERIFIED.** All official pt-BR terms; derived formulas (PV/PE/SAN per class); the official threat layout and the meaning of VD; the Sanity rules (Product Identity); a free official sheet URL; NEX steps; skill degrees; the PD resource; the Product Identity boundary for creatures (12 items).

### 3.35 13th Age (Pelgrane Press / Fire Opal Media), Archmage Engine

- **Licence.** OGL 1.0a (https://www.13thagesrd.com/legal) **[OFFICIAL]**: mechanics are Open Game Content; Product Identity (trademarks, proper names including characters, plots, locations, art, trade dress) is excluded. A copy of the OGL goes with distributed OGC, which is identified; Product Identity is marked separately. Avoid Icons' names if they are Product Identity (the page's designation was not fully checked).
- **Ships (ADR 0099 item 6).** Built in
- **Credit line.** Verified 2026-10-20 (https://www.13thagesrd.com/legal): Section 15 of the licence as the page prints it, carried whole by the window (12 lines: the OGL, the SRD, the Archmage Engine, 13th Age, 13 True Ways, the Bestiary, the Pathfinder RPG Core Rulebook, Castles & Crusades and four Jon Brazer Enterprises works), then "Copyright © 2013 Fire Opal Media. All Rights Reserved. Licensed under the Open Game License." and the page's declaration of Open Game Content. OGL section 10 asks for a copy of the licence with the Open Game Content distributed: its text, as the page prints it, is bundled (`app/ui/src/oglText.ts`) and shown beside the notice.
- **Character sheet, in display order.**
  - SRD (https://www.13thagesrd.com/character-rules/ ; https://www.13thagesrd.com/combat-rules/).
  - **Attributes:** Strength, Constitution, Dexterity, Intelligence, Wisdom, Charisma.
  - **Derived:** HP = (class base 6/7/8 + Con modifier) × 3 at 1st level; AC = class base (10–16) + middle of the Con/Dex/Wis modifiers + level; PD = class base (10–12) + middle of Str/Con/Dex + level; MD = class base (10–12) + middle of Int/Wis/Cha + level; Initiative = d20 + Dex modifier + level; Recoveries (8 or 9 to start; recovery dice = level in dice + Con modifier, die size by class).
  - **Sections:** Backgrounds (8 points, 1–5 each; skill check = d20 + ability modifier + level + background points), Icon relationships, One Unique Thing, class powers / talents / feats; escalation die (+1 per round up to +6 for PCs); staggered at half HP.
- **Adversary sheet, in display order.**
  - Monster (https://www.13thagesrd.com/monsters/monster-rules/), in order: Size/Strength (regular, large, huge; normal, double, triple), Level, Role (Archer, Blocker, Caster, Leader, Mook, Spoiler, Troop, Wrecker), Type, Initiative, Attack (melee by default; R ranged; C close-quarters), Extra effects (triggered by natural even/odd, 16+, …), Specials, AC, PD, MD, HP.
- **Rolls.** Initiative, attack roll against a defence, damage, natural-roll triggers.
- **Sources.** The SRD pages above.
- **UNVERIFIED.** How a Mook's HP is presented (per mook); the Brazilian publisher; whether the Icons' names are Product Identity.

### 3.36 Dragonbane (Free League), 1st edition 2023

- **Licence.** Dragonbane Third-Party Tabletop Module License v1.1 (31 Mar 2026), https://freeleaguepublishing.com/wp-content/uploads/2026/03/Dragonbane-License-Agreement-version-1.1.pdf: supplements only; terminology and creature names may be referenced; no Free League text, art or trade dress; no new attributes or core skills; monsters may be added. A supplement licence, not an app licence: unclear.
- **Ships (ADR 0099 item 6).** Not built in: the person imports a layout, or it ships once the publisher allows it in writing (ADR 0099 item 6)
- **Credit line.** "Dragonbane is a trademark of Fria Ligan AB. This content is not affiliated with, sponsored, or endorsed by Fria Ligan AB. It was created under Fria Ligan AB's Dragonbane Third Party Supplement License."
- **Character sheet, in display order.**
  - Official sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/09/DB-Character-Sheet-v1.pdf).
  - **Header:** Player, Name, Kin, Age, Profession, Weakness, Appearance, Memento.
  - **Attributes:** (6) STR, CON, AGL, INT, WIL, CHA.
  - **Derived:** Damage Bonus STR, Damage Bonus AGL, Movement, Hit Points, Willpower Points, Encumbrance Limit; Death Rolls (Successes, Failures); Round Rest, Stretch Rest.
  - **Conditions:** (6) Exhausted (STR), Sickly (CON), Dazed (AGL), Angry (INT), Scared (WIL), Disheartened (CHA) (the pairing is the community data-model reading; the sheet lists the names in this order).
  - **Skills:** (20) Acrobatics (AGL), Awareness (INT), Bartering (CHA), Beast Lore (INT), Bluffing (CHA), Bushcraft (INT), Crafting (STR), Evade (AGL), Healing (INT), Hunting & Fishing (AGL), Languages (INT), Myths & Legends (INT), Performance (CHA), Persuasion (CHA), Riding (AGL), Seamanship (INT), Sleight of Hand (AGL), Sneaking (AGL), Spot Hidden (INT), Swimming (AGL).
  - Weapon skills (10): Axes (STR), Bows (AGL), Brawling (STR), Crossbows (AGL), Hammers (STR), Knives (AGL), Slings (AGL), Spears (STR), Staves (AGL), Swords (STR).
  - **Gear:** Weapon / Shield table (Grip, Range, Features, Damage, Durability), Armor rating, Helmet, "Bane on" Sneaking / Evade / Acrobatics / Awareness / Ranged Attacks, Abilities & Spells, Inventory (slots 1–10), Tiny Items, Copper / Silver / Gold.
- **Adversary sheet, in display order.**
  - [OFFICIAL-DEV] (`pafvel/dragonbane`, listed on Foundry with publisher Free League; code GPL-3.0; art, logo and text owned by Fria Ligan AB). Monster: description, movement (base / value), hit points (value / base / max), armor, ferocity (base / value), size, traits, attack table (text), previous monster attack; plus abilities / skills / weapon items. NPC: the character base (kin, age, profession, motivation, willpower points, damage bonuses, HP, movement) + traits.
  - Other sheets [OFFICIAL]: Path of Glory time sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/12/DB-Path-of-Glory-time-sheet-v1.pdf); Trudvang variant (https://freeleaguepublishing.com/wp-content/uploads/2026/10/Dragonbane-Trudvang-Character-Sheet.pdf).
- **Rolls.** Skill rolls `d20` roll-under with boon / bane; the attack-table roll; damage; death rolls.
- **Sources.** Brazil: Tria Editora via Catarse (https://narradoresdomultiverso.com.br/late-pledge-de-dragonbane/).
- **UNVERIFIED.** The D6 layout of the monster attack table (the data model has `attackTable` and `previousMonsterAttack`); the HP, WP and Movement formulas (in the book only); the pt-BR field names.

## 4. Where this research and ADR 0099 item 6 do not line up

These are recorded, not resolved; the maintainer decides (rule zero of CLAUDE.md).

- Item 6 lists Vampire among the games that are imported, and also marks "the World of Darkness 5th-edition games under Paradox's Dark Pack" `[PROPOSED]` as built in. Sections 3.23 to 3.25 give the Dark Pack evidence for both readings.
- Item 6 names "D&D 5e SRD 5.2"; the research read both SRD 5.1 and SRD 5.2.1, with separate credit lines (3.2).
- Item 6 names Starfinder 2e among the built-in layouts; the research verified its creature statblock but not its character sheet (3.30), so a built-in Starfinder 2e layout has no verified character sheet to be built from.
- The Year Zero Engine generic layout (3.16), a Powered by the Apocalypse generic layout (3.4) and Mothership (3.15) are not named in item 6. This file records no decision about them.
- Cairn and Old Dragon 2e: item 6 says "field names only, no text"; sections 3.6 and 3.11 list the field names and also, in places, short descriptive phrases of the source (for example Cairn's trait names). A layout takes the names, not the phrases.
