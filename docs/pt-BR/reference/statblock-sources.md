# Fontes dos statblocks — de que é feito cada layout embutido

- Data: 2026-10-20
- Fonte: a pesquisa por trás do item 6 da [ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md),
  feita em 2026-10-20: o código público do plugin Fantasy Statblocks (MIT), e
  as regras, SRDs, fichas e licenças publicados dos sistemas abaixo. Cada
  campo diz onde foi lido.
- Estado: uma referência. Não decide nada. Quais layouts vêm embutidos é
  decidido pelo item 6 da ADR 0099 (`[DECIDIDO 2026-10-20]` para as licenças
  abertas, `[PROPOSTO]` para os dois casos da Paradox e da R. Talsorian); este
  arquivo registra a evidência sobre a qual aquele item foi decidido.
  Acrescentado em 2026-10-21, das respostas S.3a a S.3d do mantenedor: o logo
  do Dark Pack é buscado no kit da Paradox pelo agente e posto na página de
  Créditos; os avisos de licença (Dark Pack, R. Talsorian) ficam só na página
  de Créditos, não nas fichas; os nomes dos campos dos layouts de World of
  Darkness e de Cyberpunk RED estão em pt-BR agora, a corrigir depois contra
  os livros brasileiros; e quando `extends:` lista várias bases ganha a
  primeira listada, como no plugin (ADR 0099 itens 1 e 6). Onde uma linha
  abaixo diz "na ficha", essa parte é substituída por este parágrafo.
- Regra deste arquivo: um campo só é escrito se uma fonte primária o mostra.
  O resto é marcado **UNVERIFIED** e não é resolvido de memória. Um layout é
  construído com os campos listados aqui e nenhum outro. As leituras de
  licença são do pesquisador, não são aconselhamento jurídico; o mantenedor
  decide.

Etiquetas de uma fonte: **[OFFICIAL]** uma página, PDF ou SRD hospedado pela
editora e lido por inteiro; **[OFFICIAL-DEV]** código aberto de sistema
publicado pela ou para a editora (evidência forte de estrutura, não um livro
de regras); **[COMMUNITY]** uma wiki, plugin ou sistema de fãs (só
corroboração, nunca a única base de um campo).

## 1. Fantasy Statblocks (o plugin cujas chaves o Verso lê)

- Licença: **MIT**, "Copyright (c) 2023 Jeremy Valentine". O código pode ser estudado e adaptado mantendo o aviso. https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/blob/main/LICENSE
- Estudado: a `main` do plugin no commit `f248f4af8a3d748c2f64534f15e01c2d846e8b12` (2026-01-21, v4.10.3) e a cópia da documentação no `gh-pages`. O site da documentação é um aplicativo renderizado no cliente e muitas páginas da cópia antiga são marcadores, então **a fonte é a autoridade**; onde a documentação difere, vale a fonte. Antes `javalent/fantasy-statblocks`; a URL antiga redireciona. Os caminhos abaixo são relativos a https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/blob/main/.
- O conteúdo que ele traz está sob outras licenças, que o Verso não herda junto com o código: o SRD 5e sob OGL 1.0a, 13th Age sob a política comunitária da Fire Opal, PF2e sob a Paizo Community Use Policy (sem cobrar), Daggerheart sob a DPCGL (README, "Attributions"). O Verso não copia nada do bestiário nem do texto dos layouts dele.
- Usa a API pública do Obsidian (`MarkdownRenderer`, `metadataCache`, `Menu`, `Modal`), admissível pela [ADR 0009](../adr/0009-external-constraints.md); o aplicativo Obsidian em si não foi inspecionado.

### 1.1 O bloco `statblock`

Registrado com `registerMarkdownCodeBlockProcessor("statblock", …)` (`src/main.ts`). O corpo é YAML lido com o `parseYaml` do Obsidian depois de proteger os wikilinks. Todo campo é opcional e qualquer chave é permitida (`[key: string]: any`), que é como os outros sistemas funcionam: o layout nomeia as chaves.

| Chave | Significado |
|---|---|
| `monster:` ou `creature:` | Uma entrada do bestiário usada como base. |
| `layout:` ou `statblock:` | O **nome** do layout (não o id); depois o `layout` da própria criatura; depois o layout padrão. |
| `extends:` | Um nome ou uma lista, resolvidos recursivamente com guarda contra ciclos. |
| `note:` | Outra nota; o **frontmatter** dela é mesclado na criatura. O bloco vence a nota. |
| `image:` | Um wikilink ou URL; listas são achatadas (uma esquisitice do YAML com `[[x]]`). |
| `dice: true/false`, `render: true/false` | Integração com o Dice Roller neste bloco; dados 3D. |
| `columns`, `columnWidth`, `columnHeight`, `forceColumns` | Sobreposição por bloco das colunas do layout. |
| `export:` | Declarada; o código sempre acrescenta "Export as PNG" (o código vence a descrição da configuração). |
| `name`, `size`, `type`, `subtype`, `alignment`, `ac`, `hp`, `hit_dice`, `speed`, `stats` (6 números), `fage_stats`, `saves`, `skillsaves`, `damage_*`, `condition_immunities`, `senses`, `languages`, `cr`, `traits`, `spells`, `actions`, `bonus_actions`, `legendary_actions`, `legendary_description`, `mythic_*`, `reactions`, `lair_actions` | O esquema 5e (`index.ts`, `src/view/statblock.ts`). |

Precedência, da maior para a menor: as chaves do próprio bloco; a criatura de `monster:`; a cadeia de `extends`, a mais próxima primeiro. Chaves de lista aceitam sufixos: `traits:` por nome (o mesmo nome sobrepõe), `traits+:` sempre acrescenta, `traits-:` remove uma herdada pelo nome, `traits~:` modifica uma pelo nome. Uma característica pode se aninhar (`traits: [{name, desc, traits: […]}]`). `saves`/`skillsaves` aceitam uma lista de mapas de uma chave (`- dexterity: 9`), um mapa simples, ou objetos `name`/`desc`.

Uma nota também é uma entrada do bestiário quando o frontmatter tem `statblock: true` (o frontmatter inteiro é a criatura) ou `statblock: inline` (o primeiro bloco `statblock` do corpo é). A varredura vem desligada (`src/watcher/watcher.ts`).

### 1.2 O modelo de layout e os seus tipos de bloco

Um layout (`src/layouts/layout.types.ts`) tem `name`, `id`, `blocks`, e opcionais `columns` (padrão 2), `columnWidth` (px, padrão 400), `forceColumns`, `cssProperties` (cerca de 70 variáveis `--statblock-*`, com sobreposições `light` e `dark`) e `diceParsing` (regex mais um analisador). Tipos de bloco: **heading** (tamanho 1–6), **subheading** (um separador que junta várias propriedades), **property** (uma linha "Nome: valor"), **saves**, **traits** (a primeira característica leva o título da seção), **spells**, **table** (cabeçalhos; `calculate` mostra `floor((stat-10)/2)`), **text**, **image**, **group**, **inline** (uma linha), **collapse**, **ifelse**, **layout** (embute outro layout), **action**, **javascript**. Todo bloco tem `properties` (as chaves que lê), `conditioned` (some quando vazio), `fallback`, `hasRule` e campos de dados. As colunas são equilibradas medindo uma cópia destacada e movendo nós; uma lista longa de ações pode quebrar entre colunas.

Layouts embutidos que o plugin traz: Basic 5e, Basic Fate Core, Basic Pathfinder 2e, Pathfinder 2e Creature, Basic 13th Age Monster, dois de Bunkers and Badasses, três de Daggerheart (Adversary, Card, Environment).

Dados (`src/parser/dice-parsing.ts`, `MarkdownHolder.svelte`): só com o plugin Dice Roller e `dice: true`. As três regras padrão: `([\+\-])(\d+) to hit` vira `1d20+N`; `(\d+)\s\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)` vira os dados dentro dos parênteses; `([^\s]+) ([\+\-])(\d+)` vira `1d20±N`. O plugin emite `` `dice: …` `` e o outro plugin o torna clicável.

O editor de layouts (configurações): uma árvore com alças de arrastar, um modal por bloco, uma aba Previewer separada. Queixas das issues dele (https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/issues/N): #50 (as caixas mudam de tamanho ao arrastar), #45 e #131 (soltar e foco), #513 e #533 (alterações de aparência não se aplicam; não segue o tema), #511 e #502 (um nome de layout com parênteses ou ponto trava e perde dados: o nome é ao mesmo tempo uma classe CSS e a chave `layout:`), #53 (pediram um bloco de modelo de texto, porque um bloco JavaScript é pesado demais para texto simples), #30 (os blocos em formato 5e servem mal a outros sistemas).

### 1.3 O que o Verso não copia, e por quê

- **Todo campo que é JavaScript.** Dez campos executam como `new Function(…)`: `javascript.code`, `property.callback`, `saves.callback`, `traits.callback`, `spells.callback`, `diceCallback`, `table.modifier`, `ifelse.conditions[].condition`, `action.callback` e `diceParsing[].parser`. Numa pasta compartilhada ou hospedada num servidor, um layout é dado de outro membro, então código nele é um vetor de script armazenado ([0083](../adr/0083-security-hardening-of-universo.md), [0026](../adr/0026-core-ui-contract-inviolable-rules.md)). Cada um tem um substituto declarativo no item 3 da [ADR 0099](../adr/0099-visual-markdown-statblocks-and-cards.md) ou nenhum; um layout importado tem os campos descartados e listados.
- **Layouts e criaturas nas configurações privadas do aplicativo.** Arquivos são a fonte da verdade ([0012](../adr/0012-files-are-source-of-truth.md)): layouts são arquivos da pasta, criaturas são notas.
- **O nome como identidade.** Mantido para a chave `layout:`, resolvido exatamente, com uma mensagem visível quando não casa com nada.
- **Um bestiário como estado escondido**, e as migrações de configurações que reescrevem os layouts da pessoa ao carregar (invariante 7).
- **O formato do editor**: um modal por bloco e uma prévia em outra aba. O modelo é mantido; o editor é refeito (item 8 da ADR 0099).

## 2. Quais layouts vêm embutidos, numa tabela

Este é o estado registrado pelo item 6 da ADR 0099 em 2026-10-20; os parágrafos da seção 3 trazem a evidência.

| Sistema | Licença | Vem embutido (item 6 da ADR 0099) |
|---|---|---|
| Daggerheart | DPCGL 2.0 (um aplicativo não é formato permitido) | Não embutido (importado) |
| D&D 5e | CC BY 4.0 | Embutido |
| Dungeon World | CC BY 3.0 | Embutido |
| Powered by the Apocalypse | nenhuma (política informal) | Só o layout genérico |
| Ironsworn | CC BY 4.0 (partes do SRD); CC BY-NC-SA 4.0 (livros) | Embutido |
| Cairn | CC BY-SA 4.0 | Embutido, só nomes de campos |
| Mausritter | CC BY 4.0 + Third Party Licence | Embutido |
| Blades in the Dark | CC BY 3.0 | Embutido |
| Fate Accelerated and Fate Condensed | CC BY 3.0 (ou OGL) | Embutido |
| Fractal RPG | CC BY 4.0 pelo texto (o selo mostra BY-SA) | Embutido |
| Old Dragon 2e | CC BY-SA 4.0 | Embutido, só nomes de campos |
| Tormenta20 | Licença Aberta da Jambô v1.0 (só fichas de PJ) | Não embutido (importado) |
| Pathfinder 2e Remaster | ORC | Embutido |
| Savage Worlds Adventure Edition | Pinnacle Fan License (não aberta) | Não embutido (importado) |
| Mothership 1st edition | contrato 3PP | Não citado no item 6; não embutido |
| Year Zero Engine | YZE Free Tabletop License v1.1 | Não citado no item 6; não embutido |
| Tales from the Loop | nenhuma (Workshop, suplementos) | Não embutido (importado) |
| ALIEN RPG | nenhuma | Não embutido (importado) |
| Forbidden Lands | FL Third-Party Tabletop Module License v1.0 | Não embutido (importado) |
| The One Ring | nenhuma | Não embutido (importado) |
| Vaesen | nenhuma (Workshop, suplementos) | Não embutido (importado) |
| Twilight: 2000 | nenhuma (Workshop, suplementos) | Não embutido (importado) |
| Vampire: The Masquerade | Dark Pack | Embutido (decidido em 2026-10-21, ADR 0099.1/6c = A), Dark Pack |
| Werewolf: The Apocalypse | Dark Pack | Embutido (decidido em 2026-10-21, ADR 0099.1/6c = A), Dark Pack |
| Hunter: The Reckoning | Dark Pack | Embutido (decidido em 2026-10-21, ADR 0099.1/6c = A), Dark Pack |
| Mage: The Ascension | Dark Pack por analogia (não confirmado) | Não embutido (importado) |
| Call of Cthulhu | Chaosium Fan Material Policy (apps excluídos) | Não embutido (importado) |
| Cyberpunk RED | RTG Homebrew Content Policy | Embutido (decidido em 2026-10-21), layout em branco |
| Shadowrun | nenhuma encontrada | Não citado no item 6; não embutido |
| Starfinder | ORC | Embutido |
| Warhammer Fantasy Roleplay | nenhuma encontrada | Não citado no item 6; não embutido |
| Kids on Bikes | nenhuma encontrada | Não citado no item 6; não embutido |
| Brindlewood Bay | nenhuma encontrada | Não citado no item 6; não embutido |
| Ordem Paranormal RPG | OGL, em parte (segundo uma fonte da comunidade) | Não citado no item 6; não embutido |
| 13th Age | OGL 1.0a | Embutido |
| Dragonbane | FL Dragonbane Third-Party Tabletop Module License v1.1 | Não embutido (importado) |

## 3. Os sistemas

Cada seção lista, nesta ordem: a licença, se vem embutido, a linha de crédito, a ficha de personagem e a ficha de adversário na ordem de exibição, quais valores rolam, as fontes, e o que é UNVERIFIED. Os termos de jogo ficam no idioma em que a fonte os dá.

### 3.1 Daggerheart (Darrington Press / Critical Role), SRD 1.0 and 2.0

- **Licença.** DPCGL 2.0 (26 ago 2026), "Public Game Content": regras, mecânicas, cartas de referência e statblocks podem ser compartilhados; logos, arte e o texto exato dos livros não. **A seção 1.9 "Permitted Formats" lista produtos impressos e de impressão digital, transmissão, podcasts e VTTs não comerciais em lista de permissão, e exclui "video games, and any other audiovisual medium not expressly permitted": um aplicativo de notas não é claramente permitido.** É preciso permissão escrita da Darrington Press para embutir; uma pessoa que cria o próprio layout, ou compartilha dentro de um grupo privado (1.8), não está em "Share". Sem taxas (https://darringtonpress.com/license/).
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** "This product includes materials from the Daggerheart System Reference Document 2.0, (c) Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found at https://www.daggerheart.com. There are no previous modifications by others." (DPCGL 2.0 section 4.3), mais uma declaração de se o conteúdo foi modificado (4.1e). O nome não pode ser usado num título; "Compatible" deve estar ao lado dele.
- **Ficha de personagem, na ordem de exibição.**
  - **Cabeçalho:** Name, Pronouns, Level (starts 1), Class, Subclass, Heritage = Ancestry + Community, Description. Tiers: T1 level 1, T2 levels 2–4, T3 levels 5–7, T4 levels 8–10.
  - **Atributos:** (exact names) Agility, Strength, Finesse, Instinct, Presence, Knowledge; starting modifiers +2, +1, +1, +0, +0, −1 in any order.
  - **Derivados:** Evasion (set by class); Hit Points (slots, cap 12); Stress (6 slots at start, cap 12); Hope (starts 2, max 6; Fear is the GM's); Armor Score (cap 12, shown as Armor Slots); Damage Thresholds Major and Severe = armor base thresholds + level; Proficiency (starts 1; weapon damage dice count = Proficiency).
  - **Seções:** Active Weapons (name, trait, range, damage `d8+2`, phy/mag), Active Armor, Inventory, Gold (Handfuls, Bags, Chest), Experiences (2 at creation), Domain Cards (loadout 5, rest in Vault), Class, Subclass (Foundation/Specialization/Mastery), Ancestry and Community features, Background questions, Connections, Downtime moves, Conditions (Hidden, Restrained, Vulnerable).
- **Ficha de adversário, na ordem de exibição.**
  - Adversary, SRD 2.0 p. 93, em ordem: NAME; Tier + Type (`Tier 1 Solo`; types Bruiser, Horde, Leader, Minion, Ranged, Skulk, Social, Solo, Standard, Support); Description; Motives & Tactics; `Difficulty: 14 | Thresholds: 8/15 | HP: 8 | Stress: 3` (Minions show `None`; Horde HP as "X/HP"); `ATK: +3 | Claws: Very Close | 1d12+2 phy`; `Experience: Tremor Sense +2`; FEATURES (`Name - Action|Reaction|Passive: text`; 2.0 adds Fear Features, Pool, Evolution).
  - Environment, p. 100: NAME; Tier + Type (Exploration, Social, Traversal, Event); Description; Impulses; Difficulty (number or "Special"); Potential Adversaries; FEATURES; Feature Questions. No HP or Stress.
- **Rolagens.** Duality roll 2d12 (Hope die + Fear die) + trait + Experience; advantage/disadvantage ±d6; damage `XdY+Z` with X = Proficiency; adversary ATK modifier on a d20 against Evasion; in-feature dice. HP, Stress, Marked Armor are trackers.
- **Fontes.** SRD 2.0 https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf ; SRD 1.0 https://www.daggerheart.com/wp-content/uploads/2025/05/DH-SRD-May202025.pdf ; DPCGL https://darringtonpress.com/wp-content/uploads/2026/08/DPCGL_2.0_AUG_26_2026.pdf ; Jambo as the Portuguese publisher https://www.daggerheart.com/faq/
- **UNVERIFIED.** A ordem impressa dos campos das fichas de classe oficiais; Evasão e PV por classe; a estrutura dos Countdowns; os nomes oficiais em pt-BR.

### 3.2 D&D 5e (Wizards of the Coast), SRD 5.1 and SRD 5.2.1

- **Licença.** CC BY 4.0 nos dois SRDs; o layout é totalmente permitido. "Please do not include any other attribution to Wizards"; pode dizer "compatible with fifth edition" ou "5E compatible".
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** "This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode." Para 5.1: o mesmo com "System Reference Document 5.1" and https://dnd.wizards.com/resources/systems-reference-document.
- **Ficha de personagem, na ordem de exibição.**
  - **Atributos:** Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma; modifier `floor((score-10)/2)`. Proficiency Bonus +2 (levels 1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20).
  - **Perícias:** (18, key ability) Acrobatics DEX, Animal Handling WIS, Arcana INT, Athletics STR, Deception CHA, History INT, Insight WIS, Intimidation CHA, Investigation INT, Medicine WIS, Nature INT, Perception WIS, Performance CHA, Persuasion CHA, Religion INT, Sleight of Hand DEX, Stealth DEX, Survival WIS.
  - **Derivados:** AC, Initiative, Speed, HP max, current HP, temp HP, Hit Point Dice, Death Saving Throws (3 and 3), Passive Perception = 10 + Perception bonus, Spell save DC = 8 + PB + spellcasting modifier, Spell attack = PB + modifier, Heroic Inspiration (5.2.1) / Inspiration (5.1), Exhaustion.
  - **Seções:** Name, Species (5.2.1) / Race (5.1), Class + Subclass, Background (5.2.1 adds Origin feat), Level, XP, Alignment, Languages, Equipment, Coins (cp sp ep gp pp), Features & Traits, Attacks, Spellcasting (cantrips, slots, prepared).
- **Ficha de adversário, na ordem de exibição.**
  - 5.2.1 order: Name; `Size Type (Tags), Alignment`; `AC 15`; `Initiative +2 (12)`; `HP 10 (3d6)`; `Speed 30 ft.`; six abilities in a table (score, MOD, SAVE); Skills; Resistances/Vulnerabilities/Immunities; Gear; Senses (with Passive Perception); Languages; `CR 1/4 (XP 50; PB +2)`; Traits; Actions; Bonus Actions; Reactions; Legendary Actions (with a use count).
  - 5.1 order: Name; `Size type, alignment`; Armor Class (armor type); Hit Points `135 (18d10 + 36)`; Speed; STR DEX CON INT WIS CHA as `score (mod)`; Saving Throws; Skills; Damage Vulnerabilities/Resistances/Immunities; Condition Immunities; Senses; Languages; Challenge `10 (5,900 XP)`; Traits; Actions; Reactions; Legendary Actions.
  - Outras fichas: lair/regional effects (text); traps and hazards (5.2.1 Gameplay Toolbox).
- **Rolagens.** Ability check `d20+mod (+PB)`; HP dice (`3d6`, `18d10 + 36`); attack `Melee Attack Roll: +4`; damage `5 (1d6 + 2)`; save DC `DC 14 Constitution`; `Recharge 5-6` (d6); Initiative; `X/Day` counters; spell attack and DC.
- **Fontes.** https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf ; https://media.dndbeyond.com/compendium-images/srd/5.1/SRD_CC_v5.1.pdf ; Galapagos Jogos as the 2024 pt-BR publisher, seen on a retailer listing https://www.pontofrio.com.br/dungeons-dragons-livro-do-jogador-2024-players-handbook-asmodee-galapagos/p/1582674164
- **UNVERIFIED.** A ordem de campos da ficha impressa de 2024; os nomes oficiais em pt-BR dos atributos e perícias.

### 3.3 Dungeon World (Sage LaTorra, Adam Koebel)

- **Licença.** CC BY 3.0 Unported; layouts são livres. Site do SRD https://www.dungeonworldsrd.com/ (termos https://www.dungeonworldsrd.com/more-info/).
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** "Dungeon World is based on the work of Sage LaTorra and Adam Koebel and is licensed under the Creative Commons Attribution 3.0 Unported License (http://creativecommons.org/licenses/by/3.0/)."
- **Ficha de personagem, na ordem de exibição.**
  - **Atributos:** Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma; assign 16, 15, 13, 12, 9, 8; modifier 1–3 → −3, 4–5 → −2, 6–8 → −1, 9–12 → 0, 13–15 → +1, 16–17 → +2, 18 → +3.
  - **Derivados:** Max HP = class base + Constitution **score**; damage die by class; Load by class; Armor = worn armor. Debilities (−1 to a stat): Weak (STR), Shaky (DEX), Sick (CON), Stunned (INT), Confused (WIS), Scarred (CHA).
  - **Seções:** Name, Look, Race move, Alignment (Good/Neutral/Evil), Bonds, Starting moves, Advanced moves, Gear, Coin, Level, XP, Last Breath at 0 HP.
  - Classes: Barbarian, Bard, Cleric, Druid, Fighter, Immolator (third party), Paladin, Ranger, Thief, Wizard.
- **Ficha de adversário, na ordem de exibição.**
  - Monstro, https://www.dungeonworldsrd.com/monsters/, em ordem: Name; Tags (organization Horde/Group/Solitary, size Tiny/Small/Large/Huge, others); attack line `Bite, d8+1 damage; 10 HP; 3 Armor; Close, Reach`; Special Qualities; Description; Instinct (`To undermine`); Moves.
  - Terceira ficha: Fronts (Dangers with impulse and grim portents), https://www.dungeonworldsrd.com/gamemastering/fronts/.
- **Rolagens.** `2d6 + stat modifier`, bands 10+ / 7–9 / 6−; damage = class damage die; Last Breath `2d6` with no stat. The GM rolls monster damage; HP and Armor are static.
- **Fontes.** https://www.dungeonworldsrd.com/character-creation/ ; https://www.dungeonworldsrd.com/playing-the-game/ ; https://www.dungeonworldsrd.com/moves/
- **UNVERIFIED.** O limiar de XP para subir de nível; Carga e PV por classe além do Guerreiro; a estrutura da Front; a editora e os nomes oficiais em pt-BR.

### 3.4 Powered by the Apocalypse (generic), Apocalypse World

- **Licença.** Sem SRD e sem texto de licença. A política da Lumpley Games (https://lumpley.games/2023/11/22/what-is-pbta/): hacks inspirados em Apocalypse World podem ser publicados sem pedir; copiar as palavras dos autores exige permissão; o logo PbtA exige permissão; pede-se uma linha de crédito.
- **Vem embutido (item 6 da ADR 0099).** Só o layout genérico nomeado pela sua mecânica; nenhum layout leva o nome deste jogo
- **Linha de crédito.** "Move-based sheets in Verso are inspired by Apocalypse World by Meguey and Vincent Baker (Lumpley Games). Verso is not affiliated with Lumpley Games." (proposto pela pesquisa; a política só pede um crédito)
- **Ficha de personagem, na ordem de exibição.**
  - Common frame: `2d6 + stat`; 10+ full success, 7–9 partial, 6− the MC moves. Each game defines its own stats; a generic layout takes a configurable list of stats (−3..+3), moves (name, trigger, outcome bands), tracks (Harm/HP, Luck, XP) and free text. Apocalypse World's stats Cool, Hard, Hot, Sharp, Weird, plus Hx, Harm, Luck, Experience, Barter, come from a secondary source ([COMMUNITY] https://daily-apocalypse.com/daily-apocalypse/7-stats): **UNVERIFIED** against the official sheet.
- **Ficha de adversário, na ordem de exibição.**
  - Apocalypse World 2e threat types, secondary ([COMMUNITY] https://daily-apocalypse.com/daily-apocalypse/74-threat-categories-and-lists): Warlord, Grotesque, Affliction, Brutes, Landscape, Terrain, Vehicle; each subtype has an impulse, MC moves, a threat map. The official threat-card layout is **UNVERIFIED**. Dungeon World (above) is the open PbtA with monsters and Fronts.
- **Rolagens.** `2d6 + stat`.
- **Fontes.** A página da Lumpley Games acima; the playbook sheets at apocalypse-world.com could not be fetched (a TLS certificate mismatch).
- **UNVERIFIED.** Os campos da ficha de playbook oficial; a ficha de ameaça oficial; os nomes de atributos de Monster of the Week e Masks (não lidos).

### 3.5 Ironsworn (2019) and Ironsworn: Starforged (2022), Shawn Tomkin

- **Licença.** Os livros completos são CC BY-NC-SA 4.0. **CC BY 4.0** cobre o SRD de Ironsworn (a maior parte dos capítulos 1–3 e um NPC de exemplo), o Guia de Referência de Starforged inteiro, e o texto de todos os ativos, oráculos, capítulos 1–2 de Delve e cartas; só texto, não arte. O Datasworn (https://github.com/rsek/datasworn, código MIT) traz a licença por objeto: os NPCs de exemplo de Starforged são CC BY 4.0, os de Ironsworn clássico são BY-NC-SA. https://tomkinpress.com/blogs/news/lets-talk-about-ironsworn-licensing
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** Verificado em 2026-10-20 (https://www.ironswornrpg.com/licensing, "How to Provide Credit"; só texto, sem imagens nem elementos de design; para obras não comerciais vale o texto da CC BY-NC-SA 4.0): "This work is based on <game titles>, created by Shawn Tomkin, and licensed for our use under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/)." A janela do Verso a usa com <game titles> = "Ironsworn and Ironsworn: Starforged".
- **Ficha de personagem, na ordem de exibição.**
  - **Atributos:** Edge, Heart, Iron, Shadow, Wits (3, 2, 2, 1, 1 at creation: the standard rule, **UNVERIFIED** in this pass).
  - **Marcadores:** Health, Spirit, Supply (0–5, start 5; Supply is shared by the group); Momentum (minimum −6 confirmed; max +10 and reset +2: **UNVERIFIED**). Impacts (Starforged): Wounded, Shaken, Unprepared; Permanently harmed, Traumatized; Doomed, Tormented, Indebted; Battered, Cursed. Classic debilities: Wounded, Shaken, Unprepared, Encumbered; Maimed, Corrupted; Cursed, Tormented. Legacy tracks (Starforged): Quests, Bonds, Discoveries (10 boxes, 4 ticks each). Progress tracks with a rank: 1 Troublesome, 2 Dangerous, 3 Formidable, 4 Extreme, 5 Epic (3 boxes, 2 boxes, 1 box, 2 ticks, 1 tick per mark).
  - **Seções:** Name, Background/Vows, Gear, Bonds/Connections, Companions, Vehicles, Assets (up to 3 abilities each).
- **Ficha de adversário, na ordem de exibição.**
  - Foe/NPC, Datasworn fields: `name`, `rank` (1–5), `nature` (Starforged: Human, Criatura, Monstro, Horror, Machine; classic: Ironlander, Firstborn, Animal, Beast, Horror), `summary`, `features`, `drives`, `tactics`, `variants` (name, rank, description), `description`, `quest_starter`. A foe carries a progress track whose boxes follow its rank.
  - Outras fichas: Delve sites, themes and domains, Truths, settlements, planets (Datasworn keys `delve_sites`, `site_domains`, `site_themes`, `atlas`; structure beyond the keys UNVERIFIED).
- **Rolagens.** Action roll `1d6 + stat (+ adds)` against two `d10` challenge dice (strong hit beats both, weak hit one, miss none); progress roll compares filled boxes to the challenge dice; oracle rolls on d100 tables.
- **Fontes.** https://tomkinpress.com/blogs/news/lets-talk-about-ironsworn-licensing ; https://github.com/rsek/datasworn
- **UNVERIFIED.** A regra de criação 3-2-2-1-1; o Ímpeto máximo e o reinício; a estrutura dos sítios de Delve além das chaves do Datasworn; a edição e os nomes oficiais em pt-BR.

### 3.6 Cairn (Yochai Gal), 1st and 2nd edition

- **Licença.** CC BY-SA 4.0 (rodapé do site https://cairnrpg.com/). O ShareAlike vale para texto adaptado; nomes de campos sozinhos são fatos e estrutura, então só os rótulos de campos vêm embutidos.
- **Vem embutido (item 6 da ADR 0099).** Embutido, só nomes de campos (nenhum texto)
- **Linha de crédito.** Verificado em 2026-10-20: https://cairnrpg.com diz "The game was written by Yochai Gal" e "The full text is licensed under CC-BY-SA 4.0" e não prescreve texto de crédito. A declaração da janela (autor, licença, link, como a CC BY-SA pede): "This work is based on Cairn, written by Yochai Gal (https://cairnrpg.com), and licensed for our use under the Creative Commons Attribution-ShareAlike 4.0 International License (https://creativecommons.org/licenses/by-sa/4.0/)."
- **Ficha de personagem, na ordem de exibição.**
  - **Atributos:** STR, DEX, WIL (3d6 each em ordem; swap any two in 2e).
  - **Derivados:** Hit Protection (HP, 1d6 at start); Armor (capped at 3 in the 1e SRD); Gold (1 gp = 10 sp = 100 cp; start 3d6 gp in 1e); Inventory 10 slots (four body and six pack in 1e; bulky = 2; Fatigue and Conditions take slots).
  - **Seções:** Name, Background (d20), Age (2d20+10), Traits (d10 each): Physique, Skin, Hair, Face, Speech, Clothing, Virtue, Vice; Reputation, Misfortunes (1e); Bonds, Omens (2e). No levels, classes or skills.
- **Ficha de adversário, na ordem de exibição.**
  - 2e Warden's Guide line: `X HP, X Armor, X STR, X DEX, X WIL, Attack (dX, special items, qualities)`, then a descriptor, a quirk or tactic, and an optional Critical Damage effect. Exemplo: `4 HP, 1 Armor, 12 STR, 12 DEX, 9 WIL, shortsword (d6) or short bow (d6)`. Orientação: HP 3 average, 6 hardy, 10+ serious; DEX default 10; Armor 1–3.
  - Outras fichas: hirelings, mounts and vehicles (structure UNVERIFIED).
- **Rolagens.** Save `d20` roll-under (1 always succeeds, 20 always fails); ability generation `3d6`; weapon die d6/d8/d10 (impaired d4, enhanced d12); several attackers roll all and keep the highest.
- **Fontes.** https://cairnrpg.com/first-edition/cairn-srd/ ; https://cairnrpg.com/second-edition/players-guide/character-creation/ ; https://cairnrpg.com/second-edition/wardens-guide/creating-monsters/ ; https://cairnrpg.com/resources/hirelings-mounts-and-vehicles-sheets/
- **UNVERIFIED.** Campos de magias e relíquias; as diferenças da armadura na 2e; a ficha de ajudantes; a edição oficial em pt-BR.

### 3.7 Mausritter (Isaac Williams / Losing Games), SRD 2.3.1

- **Licença.** Texto do SRD CC BY 4.0 (https://mausritter.com/srd/terms), fichas imprimíveis também CC BY 4.0, mais a Third Party Licence (https://mausritter.com/third-party-licence): sem logo, não afirmar ser oficial. Traduzir o SRD é permitido.
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** Verificado em 2026-10-20, https://mausritter.com/third-party-licence (a página é desenhada por script; os textos estão no pacote da página): "The following text must be included somewhere visible within your publication, and on the website or storefront where you promote the product: [Product name] is an independent production by [Author or Publisher] and is not affiliated with Losing Games. It is published under the Mausritter Third Party Licence." e "This copyright text must be legibly included somewhere on the product: Mausritter is copyright Losing Games." A janela mostra os dois (Verso, Sérgio Sousa (Meio-Orc), a escolha do mantenedor em 2026-10-20). A linha CC BY 4.0 abaixo vem dos termos do SRD (https://mausritter.com/srd/terms), que a leitura por script não reproduziu: **UNVERIFIED**, não é mostrada. "This work is based on Mausritter (https://mausritter.com/), a product of Losing Games and Isaac Williams, and is licensed for use under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence."
- **Ficha de personagem, na ordem de exibição.**
  - **Atributos:** STR, DEX, WIL (3d6, keep the two highest dice; swap any two).
  - **Derivados:** HP = Hit Protection (d6); pips (d6, currency); Background table by (HP, pips); Level table L1 HD 1d6 Grit 0 XP 0, L2 2d6 Grit 1 XP 1000, L3 3d6 Grit 2 XP 3000, L4 4d6 Grit 2 XP 6000, L5+ 4d6 Grit 3 (+5000 XP). Inventory slots: 2 paw, 2 body, 6 pack; items have 3 usage dots; Conditions (Exhausted, Frightened, Hungry, Injured, Drained, others) take slots.
  - **Seções:** Birthsign, Coat (color, pattern), Physical detail, Name; weapons (improvised, light, medium, heavy, ranged); armour (light, heavy).
- **Ficha de adversário, na ordem de exibição.**
  - SRD "Criaturas": `15hp, STR 15, DEX 15, WIL 10, Armour 1`; `Attacks: d6 swipe, d8 bite`; optional special lines (`Critical damage: …`, `Flies 3x normal speed`); `**Wants** …`; tables. Some creatures are "Warband scale".
  - Outras fichas: Hirelings (6 slots, morale, wages), Warbands, Adventure sites (SRD headings only).
- **Rolagens.** Saves `d20 <= attribute` (advantage/disadvantage); damage die; HD roll; STR damage after HP; critical damage die (`d12 damage to STR`).
- **Fontes.** https://mausritter.com/srd/mausritter-srd-2.3.1.md
- **UNVERIFIED.** A estrutura de ajudantes, bandos e locais além dos títulos do SRD; a edição oficial em pt-BR.

### 3.8 Blades in the Dark (John Harper / One Seven Design), "Forged in the Dark"

- **Licença.** SRD CC BY 3.0; sem cenário (Duskwall), NPCs, arte nem o nome "Blades in the Dark" num título; o logo "Forged in the Dark" exige a sua linha de marca. O SRD não cobre traduzir o livro básico. https://bladesinthedark.com/licensing
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** "This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/)."
- **Ficha de personagem, na ordem de exibição.**
  - Ficha de Patife.
  - **Perícias:** 12 actions under 3 attributes: Insight (Hunt, Study, Survey, Tinker), Prowess (Finesse, Prowl, Skirmish, Wreck), Resolve (Attune, Command, Consort, Sway); rating 0–4 = dice rolled; the attribute rating = number of actions with a dot. Start: 3 dots from the playbook plus 4 (max 2 per action).
  - **Seções:** Playbook (Cutter, Hound, Leech, Lurk, Slide, Spider, Whisper), Name, Alias, Look, Heritage, Background, Vice (Faith, Gambling, Luxury, Obligation, Pleasure, Stupor, Weird) + purveyor, Special abilities, Friends/rivals, Items (load), XP triggers.
  - **Marcadores:** Stress; Trauma (Cold, Haunted, Obsessed, Paranoid, Reckless, Soft, Unstable, Vicious; the 4th retires); Harm rows (level 1 lesser 2 boxes, level 2 moderate 2, level 3 severe 1, level 4 fatal); Armor boxes; Load (Light 1–3, Normal 4–5, Heavy 6, Encumbered 7–9); healing clock (4); Coin and Stash; XP tracks Playbook, Insight, Prowess, Resolve.
- **Ficha de adversário, na ordem de exibição.**
  - No official NPC stat lines. Crew: Tier (0–VI), Hold (Weak/Strong), Rep (12), Turf (max 6), Heat, Wanted level, Coin, Claims, Upgrades, Contacts, Cohorts, Lair, Hunting grounds. Cohort: Type (gangs Adepts, Rooks, Rovers, Skulks, Thugs; experts free), Scale / Quality, Edges (Fearsome, Independent, Loyal, Tenacious), Flaws (Principled, Savage, Unreliable, Wild), Harm, Armor, Elite. Faction: Name, Tier, Hold, status −3..+3 (War, Hostile, Interfering, Neutral, Helpful, Friendly, Allies), turf/assets, goals, clocks. Progress clocks of 4, 6 or 8 segments (Danger, Racing, Linked, Mission, Long-term project): the Danger clock is the challenge sheet.
- **Rolagens.** Action roll `Nd6` take the highest (0 dice: `2d6` take the lowest); 6 full, 4–5 partial, 1–3 miss; critical on several 6s; resistance, fortune, downtime and engagement rolls; clock ticks.
- **Fontes.** https://bladesinthedark.com/character-creation ; https://bladesinthedark.com/actions-attributes ; https://bladesinthedark.com/stress-trauma ; https://bladesinthedark.com/faction-game
- **UNVERIFIED.** O número de caixas de Estresse na ficha impressa (9 não é dito no texto da web lido); a edição oficial em pt-BR.

### 3.9 Fate Accelerated and Fate Condensed (Evil Hat Productions)

- **Licença.** Os dois SRDs CC BY 3.0 (ou OGL); declarações oficiais https://fate-srd.com/official-licensing-fate e https://fate-srd.com/official-licensing-fate/cc. O logo "Powered by Fate" exige a sua linha de marca. O Fate SRD Brasil (https://fatesrdbrasil.gitlab.io/fate-srd-brasil/) é uma tradução da comunidade, não uma edição da editora.
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** Core + Accelerated: "This work is based on Fate Core System and Fate Accelerated Edition (found at https://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/)." Condensed: "This work is based on Fate Condensed (found at https://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by PK Sullivan, Lara Turner, Fred Hicks, Richard Bellingham, Robert Hanz, and Sophie Lagace, and licensed for our use under the Creative Commons Attribution 3.0 Unported license."
- **Ficha de personagem, na ordem de exibição.**
  - Accelerated (https://fate-srd.com/fate-accelerated/who-do-you-want-be): **Cabeçalho:** High Concept, Trouble, up to 3 more aspects (3 to 5 in all). Approaches (6): Careful, Clever, Flashy, Forceful, Quick, Sneaky; one Good (+3), two Fair (+2), two Average (+1), one Mediocre (+0). Refresh 3; Fate points; Stunts. Stress: one track of 3 boxes. Consequences: Mild (2), Moderate (4), Severe (6). pt-BR (Fate SRD Brasil): Ágil, Cuidadoso, Esperto, Estiloso, Poderoso, Sorrateiro.
  - Escada: +8 Legendary, +7 Epic, +6 Fantastic, +5 Superb, +4 Great, +3 Good, +2 Fair, +1 Average, +0 Mediocre, −1 Poor, −2 Terrible.
  - Condensed (https://fate-srd.com/fate-condensed/getting-started): five aspects (High Concept, Trouble, Relationship, two free). **Perícias:** (19) Academics, Athletics, Burglary, Contacts, Crafts, Deceive, Drive, Empathy, Fight, Investigate, Lore, Notice, Physique, Provoke, Rapport, Resources, Shoot, Stealth, Will. Pyramid: 1 Great (+4), 2 Good (+3), 3 Fair (+2), 4 Average (+1), the rest Mediocre. Refresh 3; Stunts (3 free). Two stress tracks (Physical from Physique, Mental from Will): Mediocre 3 boxes; Average/Fair 4; Good/Great 6; Superb+ 6 plus an extra mild consequence slot. Consequences Mild 2, Moderate 4, Severe 6.
- **Ficha de adversário, na ordem de exibição.**
  - Accelerated (https://fate-srd.com/fate-accelerated/being-gamemaster): named NPCs use the PC sheet; **Mooks**: skilled at (+2), bad at (−2), one or two simple aspects, 0–2 stress boxes, no consequences, the first hit past stress takes them out; **groups of mooks** act as one, 1 stress box per two members. Condensed (https://fate-srd.com/fate-condensed/being-game-master): **Major NPCs** stat like PCs; **Minor NPCs**: one aspect, 1–2 skills, 0–3 stress boxes, no consequence slots, maybe a stunt; **Monsters/Big Bads/Threats**: any mix of aspects, skills, stunts, stress, consequences. Fate Adversary Toolkit (Threats, Hitters, Bosses, Fillers; obstacles Hazards, Blocks, Distractions): https://fate-srd.com/fate-adversary-toolkit/types-adversaries.
- **Rolagens.** `4dF + approach` (or skill); invoke (+2 or reroll); Fate point counter.
- **Fontes.** As páginas do fate-srd.com e do Fate SRD Brasil acima.
- **UNVERIFIED.** O texto de atribuição próprio do Fate Adversary Toolkit; a estrutura dos níveis de NPC sem nome e dos Mobs do Core; os "Extras" do Condensed; os outros quatro nomes de perícia em pt-BR do Condensed (Rapport, Crafts, Drive, Notice); a editora oficial em pt-BR.

### 3.10 Fractal RPG (Igor Téuri and Walter Licínio), SRD v1.0.3

- **Licença.** Lido do SRD oficial v1.0.3 (o PDF que o mantenedor deu, 2026-10-20) **[OFFICIAL]**. O texto diz "Creative Commons Attribution 4.0 License" (CC BY 4.0); a imagem do selo mostra BY-SA. Os dois divergem; vale o texto, a menos que os autores digam outra coisa, e o mantenedor pode perguntar ao Igor. "Fractal" é marca de Dados Críticos (https://linktr.ee/dadoscriticos); o selo "FEITO PARA FRACTAL" pode ser usado como crédito extra. Autores: Igor Téuri e Walter Licínio (design, edição); Érika Brandão (identidade visual).
- **Decisão do crédito (2026-10-22, T.1 da lista da tarde, opção A).** O mantenedor manteve o crédito como **CC BY 4.0**, como o texto do SRD diz. A resposta dos autores sobre o selo (BY-SA) não está registrada; se chegar e diferir, o crédito muda (ADR 0099 item 6b).
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** Linha exigida (SRD p. 4): "Esse trabalho é compatível com Fractal, de Igor Téuri e Walter Licínio, desenvolvido sob licença Creative Commons Attribution 4.0 License." + https://fractal-system.itch.io/pt-br
- **Ficha de personagem, na ordem de exibição.**
  - SRD p. 7–8.
  - **Cabeçalho:** NOME, JOGADOR, XP.
  - RESERVAS: each with a name and ATUAL/TOTAL (start 3, max 6); the world defines each Reserva with a Gatilho ✦ and a Consequência ▣.
  - FATOS 1–12: short phrases, each with a QUEBRADO mark (recovered at the Interlúdio). Creation: 1 Fato per Premissa of the world plus 3 free Fatos.
  - ANOTAÇÕES.
  - XP: +1 per failed roll, +3 per Episódio, +10 per Arco. Interlúdio actions (2 per player): Evoluir a new Fato (3 XP), Aprimorar +1 max Reserva (3 XP), Descansar recovers 1 Reserva, Mudar rewrites a Fato, Preparar-se +1 XP.
  - World sheet (Mundo Fractal): Realismo (power level, tone, proposal, safety limits), Reservas (name, Gatilho, Consequência), Premissas, Módulos.
- **Ficha de adversário, na ordem de exibição.**
  - DESAFIO, SRD p. 17–18: name; OBSTÁCULOS (the Fatos of the challenge, each can be Quebrado; the challenge is overcome when all are broken); optional RESERVAS with atual/max, Gatilho ✦, Consequência ▣ (exemplo: Krard, o Dragão Negro: Vida 10/10 ✦ a cada dano sofrido ▣ Krard morre; Mana 3/3). **Each Obstáculo can itself be a Desafio** with its own Obstáculos (Campanha → Arco → Episódio): in Verso an Obstáculo can be a `[[link]]` to another Desafio's note. A mesma estrutura serve creatures, traps, hazards, factions and cities (Cidade Imperial: Reserva Crime 3/3). Antecipação per Desafio: 1 small, 2 medium, 3+ hard.
- **Rolagens.** Rolagem de Risco (p. 10–11): `Nd6`, N = the applicable Fatos, max 3; +1 Vantagem (only one; also from Ajudando) → max 4d6; no Fato → `1d6`, success only on 6, no Vantagem. Read the **highest** die: 1–4 FALHA (+1 XP, a Consequência), 5–6 SUCESSO. Each extra 6 beyond the first = Impulso. Each 1 = Ruptura (a used Fato becomes Quebrado, even on a success). Notation `Nd6kh1` with a custom reading (falha / sucesso / impulso / ruptura count).
- **Fontes.** Official SRD v1.0.3 (a PDF given by the maintainer); https://fractal-system.itch.io/pt-br ; the author's comment https://walterlicinio.itch.io/fractal
- **UNVERIFIED.** A variante da licença (texto contra selo), à espera dos autores.

### 3.11 Old Dragon 2e (Old Dragon Editora)

- **Licença.** CC BY-SA 4.0 (https://olddragon.com.br/licenciamento); SRD livre https://olddragon.com.br/livros/srd. O ShareAlike vale para texto adaptado, então só nomes de campos vêm embutidos. Não pode parecer oficial. Material de fãs não pode ser vendido fora da via do SRD.
- **Vem embutido (item 6 da ADR 0099).** Embutido, só nomes de campos (nenhum texto)
- **Linha de crédito.** Verificado em 2026-10-20, palavra por palavra de https://olddragon.com.br/licenciamento (a página escreve "Antonio", sem acento): "Old Dragon 2ª Edição © 2023 da Old Dragon Editora está licenciado sob CC BY-SA 4.0 e é uma criação de Antonio Sá Neto, Dan Ramos e Fabiano Neme baseado nos originais de Gary Gygax e Dave Arneson. Para ver uma cópia desta licença, visite http://creativecommons.org/licenses/by-sa/4.0/." A licença também pede o selo CC BY-SA na folha de rosto e na contracapa de um produto.
- **Ficha de personagem, na ordem de exibição.**
  - **Atributos:** Força (FOR), Destreza (DES), Constituição (CON), Inteligência (INT), Sabedoria (SAB), Carisma (CAR). Modifier: 2–3 → −3; 4–5 → −2; 6–8 → −1; 9–12 → 0; 13–14 → +1; 15–16 → +2; 17–18 → +3; 19–20 → +4.
  - **Derivados:** CA = 10 + mod DES + armadura + escudo + outros; BA (BAC melee = BA + mod FOR; BAD ranged = BA + mod DES); JP split in JPD (DES), JPC (CON), JPS (SAB); MV (humans and elves 9, dwarves and halflings 6, minus load); PV by class HD + CON bonus; Idiomas (2 + INT bonus); Alinhamento (Ordem, Neutralidade, Caos); Raça (Anão, Elfo, Gnomo, Halfling, Humano, Meio-Elfo); 20 classes listed on the site (Acadêmico, Anão Aventureiro, Arqueiro, Assassino, Bárbaro, Bardo, Bruxo, Clérigo, Druida, Elfo Aventureiro, Guerreiro, Halfling Aventureiro, Ilusionista, Ladrão, Mago, Necromante, Paladino, Proscrito and two not read).
  - Estilos de rolagem: Clássico (3d6 em ordem), Aventureiro (3d6 assign), Heroico (4d6 drop lowest), 3d6 Duplo, Camponês (1d6+7), Distribuição (8 base + 7d6), Racial (2d6+6/+3).
- **Ficha de adversário, na ordem de exibição.**
  - Chapter monstros, em ordem: Tamanho (Miúdo, Pequeno, Médio, Grande, Imenso, Colossal), Alinhamento, Habitat, QT (Quantidade de Encontro: errantes (covil)), TS (Tesouros, letters of Tabela 9.5), XP, MV (V voar, N nadar, E escalar, C cavar, O outros), MO (Moral 2–12), CA, DV (`4 DV (20)`, `DV 4+3`), JP (one value), ATQ (`2 x MORDIDA +1 (1d6+1)`), Descrição, optional Utilidades. "Fichas resumidas" exist for short entries.
- **Rolagens.** d20 tests: ability test = `d20 <=` the attribute (1 success, 20 failure); JP `d20 <=` the JP; attack `d20 + BA` against CA (1/20 critical); initiative d20 test; damage dice; PV = DV × d8. Test adjustments: Fácil +2, Muito Fácil +5, Difícil −2, Muito Difícil −5.
- **Fontes.** https://olddragon.com.br/livros/srd (chapters under /livros/srd/capitulos/…) ; https://olddragon.com.br/licenciamento
- **UNVERIFIED.** O teste de Moral (2d6 contra MO) não está no texto da página lida; dois nomes de classe; a estrutura dos ajudantes.

### 3.12 Tormenta20 (Jambô Editora), Tormenta20 Jogo do Ano

- **Licença.** Licença Aberta da Jambô v1.0 (24 jun 2026), https://jamboeditora.com.br/licenca-aberta/: só mídia estática ou impressa; no máximo 30% de texto oficial; **apps, sites e VTTs não permitidos (2.2.1)**, exceto a cláusula 5.2, fichas de personagem preenchíveis em mídia virtual usando termos oficiais e sem passagens reproduzidas. Um layout de ficha de PJ é coberto; um layout de ameaça não é obviamente coberto. Sem traduções. O selo na capa é para impressão. Conteúdo reservado (nomes de cenário, personagens, arte) fica de fora.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** "[TÍTULO DA OBRA] é um produto não oficial e não canônico, publicado sob a Licença Aberta da Jambô. Termos disponíveis em jamboeditora.com.br/licenca-aberta/. Jambô Editora e os selos da Licença Aberta da Jambô são marcas registradas da Jambô Editora Ltda., usadas com permissão." (the research text was ASCII, accents restored here: check against the page)
- **Ficha de personagem, na ordem de exibição.**
  - Official compact block (Jambô "Heróis de Bolso", https://blog.jamboeditora.com.br/tags/goblin/): Iniciativa, Percepção, Defesa, Fort, Ref, Von (Fortitude, Reflexos, Vontade), Pontos de Vida, Deslocamento (metres and squares, `12m (8q)`), Pontos de Mana, Ataque corpo a corpo (`Adaga +5 (1d4, 19)` = weapon, bonus, damage, crit range; multiplier `x3`), Ataque à distância, abilities (`Name. text`), the attributes line `For 10, Des 20, Con 14, Int 10, Sab 14, Car 10`, Perícias, Equipamento, `T$`. Attributes: Força, Destreza, Constituição, Inteligência, Sabedoria, Carisma.
- **Ficha de adversário, na ordem de exibição.**
  - Threat (ameaça) block: the official structure is in the bestiary (não lida). Só de memória, **não embutir**: Name, ND, type/size, Iniciativa, Percepção, Defesa/Fort/Ref/Von, PV, Deslocamento, attacks, abilities, attributes, skills, equipment, treasure.
- **Rolagens.** `d20 + skill/attack`; damage `1d8+4`; critical `19` / `x3`.
- **Fontes.** https://jamboeditora.com.br/licenca-aberta/ ; https://blog.jamboeditora.com.br/tags/goblin/
- **UNVERIFIED.** Se o Tormenta20 guarda atributos como modificadores (a linha do blog da Jambô `For 10, Des 20` contradiz isso); a lista de perícias, nomes de classe, a fórmula de Defesa, PV/PM por classe; o bloco de ameaça inteiro; armadilhas e a escala de ND. A wiki da comunidade tsrd.fandom.com bloqueou robôs.

### 3.13 Pathfinder 2e Remaster (Paizo): Player Core, GM Core, Monster Core

- **Licença.** ORC (https://paizo.com/orclicense). Obrigações: o ORC Notice, um aviso de Atribuição creditando os licenciantes, um aviso de Material Reservado; as mecânicas que a pessoa acrescenta também viram ORC. O Material Reservado (nomes, arte, enredo) não está incluído. O Core Rulebook de 2019 está sob OGL 1.0a.
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense. All warranties are disclaimed as set forth therein." Atribuição: "This product is based on the following Licensed Material: Pathfinder Player Core (c) 2023 Paizo Inc., Designed by Logan Bonner, Jason Bulmahn, Stephen Radney-MacFarland, and Mark Seifter … Pathfinder Monster Core (c) 2024 Paizo Inc. …" (full author lists https://2e.aonprd.com/Licenses.aspx). Forma curta no aplicativo: "Pathfinder Player Core and Monster Core (c) Paizo Inc., used under the ORC License (paizo.com/orclicense). Not affiliated with Paizo."
- **Ficha de personagem, na ordem de exibição.**
  - **Cabeçalho:** Name, Ancestry, Heritage, Background, Class, Level, XP, Size, Traits, Deity (Remaster has no alignment).
  - **Atributos:** Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma, as **modifiers**; a key attribute per class.
  - Proficiency ranks: Untrained +0, Trained level+2, Expert level+4, Master level+6, Legendary level+8 (https://2e.aonprd.com/Rules.aspx?ID=1).
  - **Derivados:** AC (10 + Dex cap + proficiency + armor), Fortitude/Reflex/Will, Perception, Class DC / Spell DC, Hit Points (class HP per level + Constitution; ancestry HP at 1st), Speed, Resistances/Weaknesses, Hero Points, Focus Points, Dying/Wounded/Doomed, Conditions.
  - **Perícias:** (17) Acrobatics, Arcana, Athletics, Crafting, Deception, Diplomacy, Intimidation, Lore, Medicine, Nature, Occultism, Performance, Religion, Society, Stealth, Survival, Thievery (https://2e.aonprd.com/Skills.aspx).
  - **Seções:** Strikes (bonus, traits, damage), Spellcasting (traditions, DC, slots, focus), Feats (ancestry, class, skill, general), Inventory with Bulk, Coins (cp sp gp pp).
- **Ficha de adversário, na ordem de exibição.**
  - Criatura, Monster Core (exemplo Pukwudgie, https://2e.aonprd.com/Monsters.aspx?ID=3153), em ordem: Name + `Criatura 7`; size and traits; Recall Knowledge DC; `Perception +17`, senses; Languages; Skills; Str Dex Con Int Wis Cha modifiers; Items; `AC 25; Fort +12, Ref +15, Will +17`; `HP 100`, Resistances, Weaknesses, Immunities; defensive abilities; `Speed 25 feet`; Melee (`hatchet +17 [+13/+9] (agile, magical, sweep) Damage 1d6+10 slashing plus poison`); Ranged; Spells (DC, attack, by rank); Offensive abilities; with action icons (one, two, three actions, reaction, free).
  - Outras fichas: Hazards (Stealth DC, Disable, AC, saves, Hardness, HP, Routine; https://2e.aonprd.com/Hazards.aspx), NPCs (https://2e.aonprd.com/NPCs.aspx), Afflictions, Elite/Weak adjustments.
- **Rolagens.** `d20 + modifier` against a DC; Strike with MAP −5/−10 (`+13/+9`); damage; flat check DC 11; persistent damage; Recall Knowledge DC; spell attack and DC.
- **Fontes.** https://2e.aonprd.com/ (Archives of Nethys, Paizo partnership)
- **UNVERIFIED.** XP por nível (1000 não está confirmado); a fórmula de PV da ascendência; a editora oficial em pt-BR (nenhuma encontrada).

### 3.14 Savage Worlds Adventure Edition (Pinnacle Entertainment Group)

- **Licença.** Sem licença aberta. A Fan License (https://peginc.com/licensing/): só material de fãs gratuito, o logo "Savage Worlds Fan" sem alteração na exibição frontal, um aviso obrigatório, sem reproduzir conteúdo dos livros, sem compensação, sem derivados dos cenários da Pinnacle, revogável. "Savage Worlds has never been an open license."
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** "This game references the Savage Worlds game system, available from Pinnacle Entertainment Group at www.peginc.com. Savage Worlds and all associated logos and trademarks are copyrights of Pinnacle Entertainment Group. Used with permission. Pinnacle makes no representation or warranty as to the quality, viability, or suitability for purpose of this product."
- **Ficha de personagem, na ordem de exibição.**
  - Ficha oficial do SWADE (https://peginc.com/wp-content/uploads/2019/09/SWADE_Character_Sheet.pdf).
  - **Cabeçalho:** Name, Race, Bennies, Conviction (setting option), Height, Weight.
  - **Atributos:** Agility, Smarts, Spirit, Strength, Vigor (die type d4–d12).
  - **Perícias:** five pre-printed: Athletics, Common Knowledge, Notice, Persuasion, Stealth, plus blank lines with a die type.
  - **Derivados:** Pace, Parry, Toughness.
  - **Seções:** Hindrances, Edges & Advances, Gear, Weapons (Weapon, Range, Damage, AP, ROF, WT, Notes), Powers (Power, PP, Range, Duration, Effect), Wounds track (−1, −2, −3, INC), Fatigue track (−1, −2, INC), Power Points.
- **Ficha de adversário, na ordem de exibição.**
  - An Extra is the PC sheet reduced (Attributes, Skills, Pace, Parry, Toughness, Edges, Hindrances, Gear, Special Abilities; no Wild Die; Shaken on one Wound); Wild Card foes have wounds and the Wild Die. The official Bestiary layout is **UNVERIFIED** (the core book is not open and was not read).
- **Rolagens.** Trait die + Wild Die d6 (take the higher), exploding dice, TN 4, raise at +4, damage `Str+d6`, `2d6`, Shaken recovery.
- **Fontes.** https://peginc.com/licensing/ ; https://peginc.com/wp-content/uploads/2019/09/SWADE_Character_Sheet.pdf
- **UNVERIFIED.** As fórmulas Aparar = 2 + Lutar/2 e Resistência = 2 + Vigor/2 + armadura; Carisma na ficha; o layout do Bestiário; veículos, cartas de perseguição, tarefas dramáticas; a editora oficial em pt-BR.

### 3.15 Mothership 1st edition (Tuesday Knight Games)

- **Licença.** Sem texto de licença público; o uso por terceiros é por contrato (3PP) com a Tuesday Knight Games; conteúdo gerado por IA é proibido no conteúdo 3PP (https://www.tuesdayknightgames.com/pages/mothership-jump-9-writers-grant). O uso dentro de um aplicativo é **UNVERIFIED**: perguntar. "Mothership" é marca registrada.
- **Vem embutido (item 6 da ADR 0099).** Não citado no item 6 da ADR 0099; não embutido
- **Linha de crédito.** "Mothership is a trademark of Tuesday Knight Games. Verso is not affiliated with Tuesday Knight Games." (marcador da pesquisa)
- **Ficha de personagem, na ordem de exibição.**
  - Só fontes secundárias ([COMMUNITY] Wikipedia https://en.wikipedia.org/wiki/Mothership_(role-playing_game); a Foundry template https://github.com/Futil/foundry-mothership). The Player's Survival Guide could not be downloaded. Classes: Teamster, Scientist, Android, Marine. Stats: Strength, Speed, Intellect, Combat; Saves: Sanity, Fear, Body. The Foundry template keeps `health`, `hits`, `stats{strength, speed, intellect, combat, sanity, fear}`, `class`, `rank`, `credits`, `xp`, `stress`, `weight`.
- **Ficha de adversário, na ordem de exibição.**
  - Só fontes secundárias: the Foundry creature template has Combat, Instinct, Speed, Loyalty, Armor, Sanity (optional), Health, Hits, description, notes; a ship sheet (Armor, Combat, Intellect, Speed, Thrusters, Battle). The Warden's Operations Manual format is **UNVERIFIED**.
- **Rolagens.** Roll-under percentile.
- **Fontes.** As páginas acima.
- **UNVERIFIED.** Tudo da ficha oficial: a rolagem de atributo `2d10+25`, dobradas como críticos, Estresse mínimo, Resolve, Pontos de Armadura, Créditos, Equipamento, Perícias (Treinado/Especialista/Mestre), o teste de pânico; o formato de adversário inteiro; a licença para um aplicativo; a editora oficial em pt-BR.

### 3.16 Year Zero Engine, generic (Fria Ligan AB / Free League), SRD v1.0

- **Licença.** Year Zero Engine Free Tabletop License v1.1 (31 mar 2026): o direito de usar o SRD "as part of your own tabletop role playing game" em impresso, PDF ou como módulo de VTT ("VTTs do not include NFTs or video games"); só o SRD, nenhuma outra arte, texto, marca ou logo da Free League; texto ou arte de IA generativa deve ser declarado à venda; o aviso é obrigatório e uma cópia ou link da licença vai com cada publicação; sem implicar endosso. Um aplicativo de notas não é nenhum desses formatos: perguntar à Free League, ou tratar o layout como genérico. https://freeleaguepublishing.com/wp-content/uploads/2026/03/Year-Zero-Engine-License-Agreement-version-1.1.pdf
- **Vem embutido (item 6 da ADR 0099).** Não citado no item 6 da ADR 0099; não embutido
- **Linha de crédito.** "Year Zero Engine layouts are not affiliated with, sponsored, or endorsed by Fria Ligan AB. The Year Zero Engine System Reference Document is used under Fria Ligan AB's Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/)."
- **Ficha de personagem, na ordem de exibição.**
  - The SRD says it "does not include a character sheet". From its chapter 2: seven steps (archetype, attributes, skills, starting specialty, personality traits, gear, name).
  - **Atributos:** (4) Strength, Agility, Wits, Empathy; dice pool ratings 1–5 (5 Extraordinary, 4 Capable, 3 Average, 2 Below Average, 1 Feeble), 14 points to start, min 2, max 5 (key attribute 5, others 4); step dice A d12, B d10, C d8, D d6.
  - **Perícias:** (12) Force, Melee, Stamina (Strength); Marksmanship, Mobility, Stealth (Agility); Crafting, Observation, Survival (Wits); Healing, Insight, Persuasion (Empathy); levels 0–5 (5 Elite, 4 Veteran, 3 Experienced, 2 Trained, 1 Novice) or A–D; specialties; personality traits; XP.
  - **Derivados:** Health = average of Strength and Agility rounded up, +1; Resolve = average of Wits and Empathy rounded up, +1 (step dice: (die size + die size)/4 rounded up).
  - **Condições:** (variant) Physical: Exhausted, Battered, Wounded; Mental: Angry, Scared, Disheartened; broken after the 4th of one type.
  - **Equipamento:** weapons (Grip, Bonus, Damage, Range, Weight, optional Crit threshold, Crit die), armor (Armor Rating), artifact dice, consumables, reliability, encumbrance.
- **Ficha de adversário, na ordem de exibição.**
  - **There is none in the SRD**: NPCs "use skills in the same way as player characters", the GM rolls and NPCs can push, a broken minor NPC dies, a group can draw one initiative card, NPCs have no Willpower pools. A generic adversary layout (name, attributes, skills, armor rating, weapons, Health/Resolve, notes) is Verso's own design, not a publisher structure.
- **Rolagens.** Skill roll = attribute + skill (+ gear) d6s; push; armor roll; critical injury (d66).
- **Fontes.** https://freeleaguepublishing.com/wp-content/uploads/2023/11/YZE-Standard-Reference-Document.pdf
- **UNVERIFIED.** O máximo de Pontos de Vontade (magia é opcional); o conteúdo da tabela de ferimentos críticos; qualquer ficha de veículo.

### 3.17 Tales from the Loop (Free League)

- **Licença.** A página de licenças da Free League lista só Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis e a Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (e Forbidden Lands, Symbaroum, Coriolis) estão na Free League Workshop, um programa comunitário do DriveThruRPG para suplementos (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN e The One Ring não estão em nenhuma.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** Nenhuma licença a citar. Sugerido, não um texto jurídico prescrito: "Tales from the Loop is a trademark of its owner; this is an unofficial, unaffiliated template." Usar um rótulo genérico ("Year Zero-style").
- **Ficha de personagem, na ordem de exibição.**
  - Ficha oficial (https://freeleaguepublishing.com/wp-content/uploads/2023/08/TFL_character_sheet.pdf).
  - **Cabeçalho:** Name, Age, Type, Iconic Item (bonus +2), Pride, Anchor, Problem, Drive, Description, Favorite Song.
  - **Atributos:** (4) Body, Tech, Heart, Mind.
  - **Perícias:** (12) Sneak, Force, Move (Body); Build, Tinker, Calculate (Tech); Contact, Charm, Lead (Heart); Investigate, Comprehend, Empathize (Mind).
  - **Condições:** (5) Angry, Scared, Exhausted, Injured, Broken.
  - **Marcadores:** Luck Points, Experience.
  - **Seções:** Items (with Bonus), Hideout, Relationships (Kid 1–4, NPC 1–2), Notes.
- **Ficha de adversário, na ordem de exibição.**
  - Nenhuma fonte oficial gratuita.
- **Rolagens.** d6 pool (o texto da regra não foi lido).
- **Fontes.** A ficha acima.
- **UNVERIFIED.** A edição em pt-BR; a fórmula e o máximo de Sorte; as regras de dificuldade e bônus das perícias; o formato de NPC; a ficha de mistério/ameaça; o texto da regra do d6; os efeitos das condições.

### 3.18 ALIEN RPG, Evolved Edition (Free League; IP of 20th Century Studios)

- **Licença.** Sem licença para ALIEN; as fichas levam "TM & © 2025 20th Century Studios". Não utilizável para layouts de marca. Um layout neutro "horror Year Zero" feito a partir do SRD é coberto só pela licença do Year Zero Engine acima. A página de licenças da Free League lista só Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis e a Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (e Forbidden Lands, Symbaroum, Coriolis) estão na Free League Workshop, um programa comunitário do DriveThruRPG para suplementos (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN e The One Ring não estão em nenhuma.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** Nenhuma licença a citar (ver Tales from the Loop).
- **Ficha de personagem, na ordem de exibição.**
  - Fichas oficiais (https://freeleaguepublishing.com/wp-content/uploads/2023/09/ALIEN_Character-Sheet.pdf, …/ALIEN-Evolved-Edition-Character-Sheet.pdf).
  - **Cabeçalho:** Name, Career, Appearance, Buddy, Rival, Personal Agenda, Talents, Relationships (1–10).
  - **Atributos:** (4) Strength, Agility, Wits, Empathy.
  - **Perícias:** (12) Heavy Machinery, Stamina, Close Combat (Strength); Mobility, Ranged Combat, Piloting (Agility); Observation, Survival, Comtech (Wits); Command, Manipulation, Medical Aid (Empathy).
  - **Marcadores:** Health, Stress Level, Resolve (Evolved), Radiation, Experience Points, Story Points; Conditions (original: Starving, Dehydrated, Exhausted, Freezing; Evolved: Fatigued); consumables Air, Food, Power, Water; Encumbrance.
  - **Equipamento:** Weapons (Name, Bonus/Modifier, Range, Damage, Weight, Ammo on Evolved), Armor (Level, Weight), Signature Item, Tiny Items, Cash, Critical Injuries (and Mental Trauma on Evolved), Stress and Panic responses.
  - Outras fichas: Ship (…/ALIEN-Evolved-Edition-Ship-Sheet.pdf), Colony (…/ALIEN_Colony_Sheet.pdf), Planet (…/ALIEN_Planet_Sheet.pdf).
- **Ficha de adversário, na ordem de exibição.**
  - Nenhum statblock oficial gratuito. [COMMUNITY] (GPL-3 Foundry system https://github.com/pwatson100/alienrpg, `module/data/actor-creature.mjs`): Health, Speed, Armor Rating, Armor vs Fire, a defence block Mobility / Observation / Acid Splash / Special, attack tables, critical injury, comment; separate synthetic and character types. Corroboration only.
- **Rolagens.** Roll = attribute + skill base dice + stress dice; push; a stress die showing 1 triggers a stress response; panic roll = D6 + stress level − Resolve (rules reference https://freeleaguepublishing.com/wp-content/uploads/2023/09/ALIEN-Evolved-Edition-Starter-Set-rules-reference-sheet-v1.1.pdf).
- **Fontes.** As fichas acima.
- **UNVERIFIED.** As fórmulas de derivação de Saúde e Resolução (um sistema da comunidade difere da memória: não embutir); o layout da tabela de ataques de criatura e o seu mapeamento de D6; os statblocks de NPC humano e sintético; os nomes e a editora em pt-BR; o limite de estresse; os efeitos das condições; os nomes de atributos da nave.

### 3.19 Forbidden Lands (Free League), 1st edition

- **Licença.** Forbidden Lands Third-Party Tabletop Module License v1.0 (31 mar 2026), https://freeleaguepublishing.com/wp-content/uploads/2026/03/Forbidden-Lands-License-Agreement-version-1.0.pdf: o direito de publicar suplementos explicitamente compatíveis com o jogo básico (impresso, PDF, módulo de VTT); pode referenciar as regras, a terminologia e os nomes de criaturas e locais, não copiar as regras; sem texto, arte ou trade dress da Free League; não pode acrescentar atributos nem perícias básicas; **monstros podem ser acrescentados**. Uma licença de suplemento, não de aplicativo: incerto.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** "Forbidden Lands is a trademark of Fria Ligan AB. This content is not affiliated with, sponsored, or endorsed by Fria Ligan AB. It was created under Fria Ligan AB's Forbidden Lands Third Party Supplement License." (o aviso recomendado pela licença, adaptado da forma de Dragonbane)
- **Ficha de personagem, na ordem de exibição.**
  - Ficha oficial (https://freeleaguepublishing.com/wp-content/uploads/2023/09/Forbidden_Lands_Sheets_Color.pdf).
  - **Cabeçalho:** Name, Kin, Profession, Age, Reputation, Pride, Dark Secret, Appearance (Face, Body, Clothing), Talents (with rank), Experience.
  - **Atributos:** (4) Strength, Agility, Wits, Empathy.
  - **Perícias:** (16) Might, Endurance, Melee, Crafting (Strength); Stealth, Sleight of Hand, Move, Marksmanship (Agility); Scouting, Lore, Survival, Insight (Wits); Manipulation, Performance, Healing, Animal Handling (Empathy); each with a skill level.
  - **Marcadores:** attribute damage by Conditions (Hungry, Sleepless, Thirsty, Cold), Critical Injuries, Willpower.
  - **Equipamento:** Helmet, Armor, Shield, Weapons (Bonus, Damage, Range, Comment), Gear (Bonus), Consumables (Food, Water, Arrows, Torches), Silver/Copper/Gold, Carrying Capacity, Relationships (PC1–4), Mount (Name, Strength, Agility).
- **Ficha de adversário, na ordem de exibição.**
  - [OFFICIAL-DEV] (`fvtt-fria-ligan/forbidden-lands-foundry-vtt`, `template.json`, actor types character, monster, party, stronghold). Monstro: Name, Type (Monster or Mount), Movement (rate + description), Armor Rating, Strength, Agility, Wits, Empathy, Health, Resolve, skills, monster attacks (description, dice, damage, damage type Blunt / Slash / Stab / Fear / Other, range, uses Strength), monster talents, gear. Ficha de fortaleza [OFFICIAL]: location name, description, functions, stockpile (Iron Ore, Iron, Silver, Gold, Stone, Glass, Wood, Fur, Leather, Cloth, Wool, Food, Bread, Water, Flour, Grain, Meat, Fish, Vegetables, Tallow, Herbs), Production, Salary, Number, Hirelings, Defense Rating, Strongholds.
- **Rolagens.** Skill roll (attribute + skill + gear dice); armor roll; monster attack (dice pool); push.
- **Fontes.** https://github.com/fvtt-fria-ligan/forbidden-lands-foundry-vtt ; Brasil: https://jogaod20.com/2020/11/11/pre-venda-forbidden-lands-br/ (Sagen Editora, pre-sale reported)
- **UNVERIFIED.** Que o livro numera os ataques de um monstro como uma tabela de D6 (não confirmado em fontes gratuitas); faixas de atributos de monstros; capacidade de carga (Força × 2 é um número da comunidade); os nomes de campos em pt-BR.

### 3.20 The One Ring, 2nd edition (Free League; Middle-earth Enterprises)

- **Licença.** Marcas "of Middle-earth Enterprises LLC and used under license by Fria Ligan AB (dba Free League)" (https://freeleaguepublishing.com/shop/the-one-ring/starter-set/). Sem licença aberta; não consta na lista da Workshop. Não utilizável para layouts de marca. (Não é "The Lord of the Rings Roleplaying", a linha baseada em 5E, que tem a sua própria ficha d20.)
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** Nenhuma licença a citar.
- **Ficha de personagem, na ordem de exibição.**
  - Ficha de herói, só nomes de campos (https://freeleaguepublishing.com/wp-content/uploads/2023/09/TOR_Pregens.pdf).
  - **Cabeçalho:** Name, Heroic Culture, Cultural Blessing, Calling, Age, Patron, Shadow Path, Standard of Living, Distinctive Features, Flaws.
  - **Atributos:** (3) Strength, Heart, Wits, each with a Rating and a **TN**.
  - **Derivados:** Endurance (current/max), Hope (current), Parry, Shadow, Valour, Wisdom, Fatigue, Load, conditions Weary / Miserable / Wounded, Shadow Scars, Fellowship Score.
  - **Perícias:** (18) Awe, Athletics, Awareness, Hunting, Song, Craft, Enhearten, Travel, Insight, Healing, Courtesy, Battle, Persuade, Stealth, Scan, Explore, Riddle, Lore.
  - Proficiências de combate: Axes, Bows, Spears, Swords.
  - **Equipamento:** War Gear (Weapon: Damage, Injury, Load), Armour (Protection, Load), Helm, Shield (Parry), Travelling Gear, Rewards, Virtues, Treasure; Adventure Points, Skill Points.
  - Outras fichas: Journey Log (https://freeleaguepublishing.com/wp-content/uploads/2023/09/TOR_Journey_Log_fillable.pdf: Year, Season, Journey from, Destination, Days of travel, the company, ponies and horses, Travel Fatigue, journey path, journal, Events 1–6), Moria Mission Worksheet, Ally cards.
- **Ficha de adversário, na ordem de exibição.**
  - [COMMUNITY] only: the plugin "tor2e statblocks" (https://www.obsidianstats.com/plugins/tor2e-statblocks ; https://github.com/modality/obsidian-the-one-ring-2e-statblocks), fields em ordem: name, description, features, level (Attribute Level), endurance, might, hate (or resolve), parry, armour, proficiencies (name, rating, damage, injury, special), abilities (Fell Abilities). O livro básico não foi lido.
- **Rolagens.** Feat die + success dice (the formula is **UNVERIFIED**); parry TN; Hate/Resolve is a counter.
- **Fontes.** As páginas acima.
- **UNVERIFIED.** A ordem de campos oficial do adversário e a semântica de Aparar/Armadura; Ódio contra Resolução; o agrupamento de perícias por atributo (as colunas da ficha sugerem Força os seis primeiros, Coração os seis seguintes, Astúcia os seis últimos); as fórmulas de Resistência e Esperança; as faixas de Sabedoria e Valor; as cartas de postura de combate; as ferramentas do Mestre; a edição e os nomes em pt-BR; a ficha de Conselho/Sociedade.

### 3.21 Vaesen (Free League)

- **Licença.** A página de licenças da Free League lista só Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis e a Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (e Forbidden Lands, Symbaroum, Coriolis) estão na Free League Workshop, um programa comunitário do DriveThruRPG para suplementos (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN e The One Ring não estão em nenhuma.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** Nenhuma licença a citar.
- **Ficha de personagem, na ordem de exibição.**
  - Ficha oficial (https://freeleaguepublishing.com/wp-content/uploads/2023/08/Vaesen-Character-Sheet.pdf).
  - **Cabeçalho:** Name, Age / Age Group, Archetype, Motivation, Trauma, Dark Secret, Relationships (PC 1–4), Resources, Talents, Advantages, Memento, Equipment, Insights & Defects, Experience.
  - **Atributos:** (4) Physique, Precision, Logic, Empathy.
  - **Perícias:** (12) Agility, Close Combat, Force (Physique); Stealth, Ranged Combat, Medicine (Precision); Learning, Vigilance, Investigation (Logic); Observation, Manipulation, Inspiration (Empathy).
  - **Condições:** Physical: Exhausted, Battered, Wounded, Broken; Mental: Angry, Frightened, Hopeless, Broken.
  - **Equipamento:** Armor (Protection, Agility), Weapons (Damage, Bonus, Range).
  - Ficha de quartel-general (https://freeleaguepublishing.com/wp-content/uploads/2023/08/Vaesen-HQ-Sheet.pdf): Name, Type of Building, Location, Function/Asset (×12), Development Points, Upgrades, History, Facilities, Discovered Facilities, Contacts, Personnel.
- **Ficha de adversário, na ordem de exibição.**
  - [OFFICIAL-DEV] (`fvtt-fria-ligan/vaesen-foundry-vtt`, GPL-3.0, https://github.com/fvtt-fria-ligan/vaesen-foundry-vtt). NPC: attributes, skills, physical/mental condition (value/max), armor, weapons, gear, information. Vaesen (creature): attributes **Might, Body Control, Magic, Manipulation**; Fear (initial, subsequent); armor; attacks (name, damage, range, attribute); gear; ritual (known, secret); note.
- **Rolagens.** d6 pool (o texto da regra não foi lido).
- **Fontes.** Brasil: Sagen Editora announced it in Dec 2020 (https://jogaod20.com/2020/12/16/vaesen-portugues-sagen/); completion unconfirmed.
- **UNVERIFIED.** Se "Body Control" é o termo inglês impresso; os efeitos das condições; os valores iniciais; as regras de nível de ameaça; os nomes em pt-BR.

### 3.22 Twilight: 2000, 4th edition (Free League)

- **Licença.** A página de licenças da Free League lista só Dragonbane, Drakar och Demoner, Forbidden Lands, Symbaroum, Coriolis e a Year Zero Engine Free Tabletop License (https://freeleaguepublishing.com/community-content/free-tabletop-licenses/). Tales from the Loop, Vaesen, Twilight: 2000 (e Forbidden Lands, Symbaroum, Coriolis) estão na Free League Workshop, um programa comunitário do DriveThruRPG para suplementos (https://freeleaguepublishing.com/community-content/free-league-workshop/). ALIEN e The One Ring não estão em nenhuma.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** Nenhuma licença a citar.
- **Ficha de personagem, na ordem de exibição.**
  - Ficha oficial (https://freeleaguepublishing.com/wp-content/uploads/2023/08/T2K4-Character-Sheet-English-Color.pdf).
  - **Cabeçalho:** Name, Nationality, Branch, Military Rank, Specialties, How You Met the Group, Buddy, Moral Code, Big Dream, Appearance.
  - **Atributos:** (4) Strength, Agility, Intelligence, Empathy.
  - **Perícias:** (16) Heavy Weapons, Close Combat, Stamina (Strength); Driving, Mobility, Ranged Combat (Agility); Recon, Survival, Tech (Intelligence); Command, Persuasion, Medical Aid (Empathy).
  - **Marcadores:** Hit Capacity, Stress Capacity, Coolness Under Fire, Unit Morale; Damage / Stress (temporary, current, permanent, total); Radiation; Experience; Conditions: Starving, Dehydrated, Sleep Deprived, Hypothermic; Critical Injuries; Diseases.
  - **Equipamento:** Combat gear, Backpack, Tiny Items; Weapons (Base Die, REL, ROF, Damage, Crit, Blast, Range, Mag, Armor, Weight, Spent Ammo); Armor by location Head, Arms, Torso, Legs.
- **Ficha de adversário, na ordem de exibição.**
  - [OFFICIAL-DEV] (`fvtt-fria-ligan/twilight2000-foundry-vtt`, GPL-3.0): actor types character, npc, vehicle, unit, party. Vehicle: type, reliability, movement (combat, travel on-road, off-road), armor (front, left, right, rear), fuel, cargo, crew, components (fuel, engine, suspension, ammunition, radio, track/wheel, FCS, antenna). Unit: faction, affiliation, size, type, modifiers, personnel, vehicles, HQ. NPC: attributes, skills, combat, actions, `unitMorale`.
- **Rolagens.** Base die and stress (as fórmulas não foram lidas).
- **Fontes.** https://github.com/fvtt-fria-ligan/twilight2000-foundry-vtt
- **UNVERIFIED.** Fórmulas de dado-base e estresse; a fórmula de Capacidade de Ferimento; a semântica de ROF e Crítico; as diretrizes de NPC do livro; as regras de moral de unidade; a edição em pt-BR; as regras de dano de veículo.

### 3.23 Vampire: The Masquerade, 5th edition (Paradox / White Wolf; books by Renegade Game Studios; pt-BR Galapagos Jogos)

- **Licença.** Dark Pack Agreement da Paradox (https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement) **[OFFICIAL]**: conteúdo de fãs não comercial é permitido sem permissão, incluindo "character sheets, and free online character generators"; "Online character generators, including downloadable and mobile apps, must be free, with no in-app purchases"; "Virtual dice rollers are permitted"; sem vender, sem copiar um livro inteiro, sem remover avisos; revogável "at any time, for any reason"; os termos mudam com 30 dias de aviso. Layouts em branco, sem texto literal. A Paradox anunciou um playtest alfa da V6 em 30 jul 2026 (https://www.paradoxinteractive.com/games/world-of-darkness/news/vtm-sixth-edition-alpha-playtests-open-now): a V5 pode ser substituída.
- **Vem embutido (item 6 da ADR 0099).** Embutido desde 2026-10-21 (decidido pelo mantenedor, 0099.6c = A) sob o Dark Pack da Paradox, com o aviso completo e o logotipo do Dark Pack só na página de créditos (mantenedor, 2026-10-21, S.3b = B), mais uma linha curta na ficha que aponta para lá, escolha da construção, não dele, à espera da resposta dele (S.3b-bis; ADR 0099 item 6, 2026-10-21). A origem e o hash do logotipo estão em "The Dark Pack logo", em 3.23. Os nomes dos campos em pt-BR das três fichas são **provisórios** (S.3c): escolhidos entre termos comuns da comunidade brasileira de RPG, não conferidos com os livros brasileiros.
- **Linha de crédito.** Exigido literalmente: "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission." and "All rights reserved. For more information please visit worldofdarkness.com." plus the Dark Pack logo and a statement that the content is not official World of Darkness material (no exact wording provided). Sugerido: "Vampire: The Masquerade, World of Darkness and related terms are trademarks of Paradox Interactive AB. Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com. This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack."
- **Ficha de personagem, na ordem de exibição.**
  - [COMMUNITY] wiki, CC BY-SA 3.0, hosted by Paradox (https://vtm.paradoxwikis.com/Character_creation).
  - **Atributos:** (9) Physical: Strength, Dexterity, Stamina; Social: Charisma, Manipulation, Composure; Mental: Intelligence, Wits, Resolve; distribution one at 1, four at 2, three at 3, one at 4.
  - **Perícias:** (27) Physical: Athletics, Brawl, Craft, Drive, Firearms, Larceny, Melee, Stealth, Survival; Social: Animal Ken, Etiquette, Insight, Intimidation, Leadership, Performance, Persuasion, Streetwise, Subterfuge; Mental: Academics, Awareness, Finance, Investigation, Medicine, Occult, Politics, Science, Technology; plus Specialties.
  - **Derivados:** Health = Stamina + 3; Willpower = Composure + Resolve; Humanity starts at 7 (before Predator-type modifiers); Blood Potency on a chart tied to generation.
  - **Marcadores:** Hunger; Health and Willpower (Superficial / Aggravated); Humanity (stains); Blood Potency.
  - **Seções:** Name, Concept, Predator Type, Chronicle, Ambition, Clan, Sire, Desire, Generation; Attributes; Skills; Disciplines; Chronicle Tenets; Touchstones and Convictions; Advantages and Flaws (Merits, Loresheets, coterie).
- **Ficha de adversário, na ordem de exibição.**
  - [COMMUNITY] wiki (https://vtm.paradoxwikis.com/Antagonists): the minimal entry is a name plus one **Difficulty** ("Ghost 3"); most antagonists have dice pools per action category instead of attribute and skill dots; some give two Difficulties separated by a slash (the first for what the antagonist excels at, the second for everything else). The "Mortal / Ghoul / Vampire" simplified structure is **not confirmed**. Coterie sheet: UNVERIFIED.
- **Rolagens.** Each category's dice pool; a single-die critical option (wiki).
- **Fontes.** As páginas da wiki acima; Galapagos Jogos since 2021 (https://newsrpg.wordpress.com/2025/10/09/os-titulos-de-vampiro-a-mascara-disponiveis-no-brasil/).
- **UNVERIFIED.** O teto de Fome e as regras numa fonte oficial (0–5 é uma cola de fãs); o comprimento das trilhas de Vitalidade e Força de Vontade; os modificadores de tipo de Predador; a estrutura oficial de antagonistas e os nomes das categorias de reservas; o formato Mortal/Carniçal/Vampiro; **todos** os nomes em pt-BR (não confiar na memória); o máximo de Humanidade; os valores do gráfico de Potência de Sangue.

#### The Dark Pack logo (fetched 2026-10-21)

- **Origem.** A página do acordo (https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement) liga duas imagens do logotipo e um kit no Dropbox ("Download Free Content"). O `WoD-Logos-and-Symbols.zip` do kit traz `Dark Pack Logos/DarkPack_Logo1.png` e `DarkPack_Logo2.png` (e `.eps`), idênticos byte a byte às imagens da página: Logo1 https://images.ctfassets.net/u73tyf0fa8v1/tMXQxwE2ILqjHGCTe0inb/04fbb35e5326f7f76bea7ff4ba2ffbf3/darkpack_logo1.png e Logo2 (borda vermelha) https://images.ctfassets.net/u73tyf0fa8v1/3oBTHBZk9XmfcBlUPylvFh/673e4a6b14566548c03424ddf627b944/darkpack_logo2.png. Nenhuma conta nem etapa de aceite impediu o download.
- **Guardado.** `DarkPack_Logo1.png` (3000x3007, RGBA), sem alteração, como `app/ui/web-assets/darkpack-logo.png`: SHA-256 `6d521644dabd493c1447bf7188130e4e49ade132b3d18ee76dc395208aa49083` (Logo2: `285e20a71753bbce12e21a18b5812d62586a809b6d4dff5b4daeb2dd9b1afce0`, não usado). Um teste guarda o hash. Entra no build com os outros arquivos da web, então o service worker o mantém offline (lista de segundo plano), e a página de créditos o mostra ao lado de cada aviso do Dark Pack, a 6 rem, com texto alternativo.
- **O texto do acordo.** O logotipo vai "somewhere on your material"; a página o pede ao divulgar o conteúdo. Os avisos são exigidos literalmente; a página não dá texto para a declaração de "não oficial".

### 3.24 Werewolf: The Apocalypse, 5th edition (Paradox / White Wolf)

- **Licença.** Dark Pack, como em Vampiro acima. Encaixe: condicional.
- **Vem embutido (item 6 da ADR 0099).** Embutido desde 2026-10-21 (decidido pelo mantenedor, 0099.6c = A) sob o Dark Pack da Paradox, com o aviso completo e o logotipo do Dark Pack só na página de créditos (mantenedor, 2026-10-21, S.3b = B), mais uma linha curta na ficha que aponta para lá, escolha da construção, não dele, à espera da resposta dele (S.3b-bis; ADR 0099 item 6, 2026-10-21). A origem e o hash do logotipo estão em "The Dark Pack logo", em 3.23. Os nomes dos campos em pt-BR das três fichas são **provisórios** (S.3c): escolhidos entre termos comuns da comunidade brasileira de RPG, não conferidos com os livros brasileiros.
- **Linha de crédito.** Exigido literalmente: "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission." and "All rights reserved. For more information please visit worldofdarkness.com." plus the Dark Pack logo and a statement that the content is not official World of Darkness material (no exact wording provided). Sugerido: "Werewolf: The Apocalypse, World of Darkness and related terms are trademarks of Paradox Interactive AB. Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com. This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack."
- **Ficha de personagem, na ordem de exibição.**
  - [COMMUNITY] wiki (https://wta.paradoxwikis.com/Character_creation): the same 9 attributes and 27 skills as V5; Health = Stamina + 3; Willpower = Composure + Resolve; **Renown** (two dots in the tribe's type, one in another). **Seções:** Name, Concept, Patron, Chronicle, Auspice, Tribe; Attributes; Skills; Renown; Gifts and Rites; Chronicle Tenets; Touchstones; Favors and Bans; Advantages and Flaws.
  - **Marcadores:** Rage 0–5: each Rage point replaces a die; Rage dice showing 1–2 are Brutal; a Rage Check is one die; Rage above 5 causes Superficial Willpower damage (https://wta.paradoxwikis.com/Rage_system). Forms: Homid, Glabro, Crinos, Hispo, Lupus (https://wta.paradoxwikis.com/Forms).
- **Ficha de adversário, na ordem de exibição.**
  - UNVERIFIED (the wiki links "Antagonists and Allies"; not read).
- **Rolagens.** Rage dice.
- **Fontes.** As páginas da wiki acima.
- **UNVERIFIED.** Os três nomes de Renome (Glória / Honra / Sabedoria é um palpite); Harmonia e a faixa dela; se Gnose existe na W5; os statblocks de antagonista e de espírito; os efeitos de tribo e auspício; o comprimento da trilha de vitalidade; os nomes e a editora em pt-BR.

### 3.25 Hunter: The Reckoning, 5th edition (Paradox / White Wolf)

- **Licença.** Dark Pack, como em Vampiro acima. Encaixe: condicional.
- **Vem embutido (item 6 da ADR 0099).** Embutido desde 2026-10-21 (decidido pelo mantenedor, 0099.6c = A) sob o Dark Pack da Paradox, com o aviso completo e o logotipo do Dark Pack só na página de créditos (mantenedor, 2026-10-21, S.3b = B), mais uma linha curta na ficha que aponta para lá, escolha da construção, não dele, à espera da resposta dele (S.3b-bis; ADR 0099 item 6, 2026-10-21). A origem e o hash do logotipo estão em "The Dark Pack logo", em 3.23. Os nomes dos campos em pt-BR das três fichas são **provisórios** (S.3c): escolhidos entre termos comuns da comunidade brasileira de RPG, não conferidos com os livros brasileiros.
- **Linha de crédito.** Exigido literalmente: "Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission." and "All rights reserved. For more information please visit worldofdarkness.com." plus the Dark Pack logo and a statement that the content is not official World of Darkness material (no exact wording provided). Sugerido: "Hunter: The Reckoning, World of Darkness and related terms are trademarks of Paradox Interactive AB. Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with permission. All rights reserved. For more information please visit worldofdarkness.com. This template is unofficial fan-made material, not official World of Darkness material, published under the Dark Pack."
- **Ficha de personagem, na ordem de exibição.**
  - [COMMUNITY] wiki (https://htr.paradoxwikis.com/Character_creation): 9 attributes as V5; skills as V5 except Physical lists **Driving** (V5 and W5 pages say Drive: a discrepancy to verify). Health = Stamina + 3; Willpower = Composure + Resolve. **Creed** (Entrepreneurial, Faithful, Inquisitive, Martial, Underground) with a Creed Field; **Drive** (each with a Redemption method); **Edges** (no rating; choose 2 Edges + 1 Perk or 1 + 2) and Perks; Ambition, Desire, Touchstones (1–3), Advantages (7 dots), Flaws (2 dots). **Seções:** Name, Concept, Creed, Cell, Ambition, Desire, Drive, Redemption; Attributes; Skills; Edges and Perks; Chronicle Tenets; Touchstones; Creed Fields; Advantages and Flaws.
  - Cell trackers (https://htr.paradoxwikis.com/Desperation): **Desperation** 1–5 (shared by the cell; sets the Desperation Dice), **Danger** (rises on a 1 on a Desperation Die), **Despair** (a state, redeemed through the Drive's Redemption).
- **Ficha de adversário, na ordem de exibição.**
  - UNVERIFIED.
- **Rolagens.** Desperation dice.
- **Fontes.** As páginas da wiki acima.
- **UNVERIFIED.** A lista de nomes de Drive; nomes e níveis de Edges; o máximo de Perigo; o formato de adversário; a ficha de Célula; os nomes e a editora em pt-BR; Driving contra Drive; a trilha de Vitalidade.

### 3.26 Mage: The Ascension, 20th Anniversary Edition (Onyx Path, licensed from Paradox / White Wolf)

- **Licença.** A política de fãs própria da Onyx Path não foi encontrada (só a Storypath Ultra Third-Party License, que não é a M20). O Dark Pack cobre "all World of Darkness products published by Paradox, its licensees, and affiliates": aplicado por analogia; **confirmar com a Onyx Path / Paradox**. As fichas oficiais de M20 estão no DriveThruRPG, atrás de uma conta (https://theonyxpath.com/character-sheets/).
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** Nenhum texto exato; se o Dark Pack se aplica, os avisos dele (ver Vampiro).
- **Ficha de personagem, na ordem de exibição.**
  - **UNVERIFIED por inteiro.** Só de memória, **não embutir**: Nature, Demeanor, Essence, Tradition, Affiliation; nine Attributes (Strength, Dexterity, Stamina, Charisma, Manipulation, Appearance, Perception, Intelligence, Wits); Talents / Skills / Knowledges; Spheres (Correspondence, Entropy, Forces, Life, Matter, Mind, Prime, Spirit, Time, optional Data / Dimensional Science); Arete, Willpower, Quintessence, Paradox, Health levels, Resonance, Backgrounds, Foci.
- **Ficha de adversário, na ordem de exibição.**
  - UNVERIFIED (M20 uses Attribute + Ability pools; no simplified difficulty block is confirmed).
- **Rolagens.** UNVERIFIED.
- **Fontes.** https://theonyxpath.com/character-sheets/
- **UNVERIFIED.** Essencialmente tudo, exceto a editora e a existência de uma ficha no DriveThruRPG (14 itens).

### 3.27 Call of Cthulhu, 7th edition (Chaosium)

- **Licença.** Chaosium Fan Material Policy (https://www.chaosium.com/fan-material-policy/ ; opções https://www.chaosium.com/fan-use-and-licensing/) **[OFFICIAL]**: são permitidas referências, citações curtas e "your own character sheets, including web-based sheets that autofill or calculate values"; **"Downloadable software, apps, and virtual tabletops are excluded and require a Commercial License. Web-based character generators are allowed."** Logo, não embutível como aplicativo baixável sem uma Commercial License. O SRD de BRP (BRP Open-Gaming License) é separado e não cobre o texto de CoC 7e.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** "This material uses trademarks and/or copyrights owned by Chaosium Inc/Moon Design Publications LLC, which are used under Chaosium Inc.'s Fan Material Policy. This material is not published, endorsed, or specifically approved by Chaosium Inc."
- **Ficha de personagem, na ordem de exibição.**
  - Regras de Início Rápido [OFFICIAL] (https://www.chaosium.com/content/FreePDFs/CoC/CHA23131%20Call%20of%20Cthulhu%207th%20Edition%20Quick-Start%20Rules.pdf).
  - **Seções:** Investigator info (name, occupation, …).
  - **Atributos:** (8) STR, CON, SIZ, DEX, APP, EDU, INT, POW; each shown as Regular, Hard (half), Extreme (one-fifth).
  - **Marcadores:** Hit Points, Magic Points, Luck, Sanity (Starting SAN = POW; an "Insane" box = one-fifth of Starting SAN; Maximum Sanity reduced by Cthulhu Mythos); marks Temporary Insanity, Indefinite Insanity, Major Wound, Unconscious, Dying.
  - **Perícias:** a list with base values in parentheses ("Accounting (05%)"), each with Regular / Hard / Extreme boxes.
  - **Equipamento:** Weapons (Regular/Hard/Extreme skill, damage, attacks per round, range, ammo, malfunction); Action Reference: Move (human average 8), Build, Damage Bonus, Dodge; My Story / Backstory; Possessions.
- **Ficha de adversário, na ordem de exibição.**
  - Two shapes in the Quick-Start adventure The Haunting [OFFICIAL]. Criatura (Rat Pack): STR, CON, SIZ, POW, DEX, HP, Average Damage Bonus, Average Build, Move; Combat: attacks per round, Fighting attacks (named attack, skill with Hard/Extreme, damage), maneuvers, Dodge (with Hard/Extreme), special text. Humanoide (Walter Corbitt): STR, CON, SIZ, INT, POW, DEX, APP, EDU, SAN, HP, Damage Bonus, Build, Move, Magic Points; roleplaying hooks; combat; spells.
- **Rolagens.** Each Fighting / Firearms skill (Regular, Hard, Extreme), Dodge, damage dice, SAN loss dice (`0/1D6`: success loss / failure loss), bonus and penalty dice.
- **Fontes.** O PDF de Início Rápido acima.
- **UNVERIFIED.** As fórmulas derivadas (PV, PM, rolagem de Sorte, Movimento, Corpo, Bônus de Dano: no Manual do Investigador); a linha de perda de Sanidade do próprio monstro; o formato da linha de Armadura; o formato do bloco de magias; fichas pulp e de outras eras; os nomes e a editora em pt-BR.

### 3.28 Cyberpunk RED (R. Talsorian Games)

- **Licença.** Homebrew Content Policy (https://rtalsoriangames.com/homebrew-content-policy/) **[OFFICIAL]**: o conteúdo deve ser de acesso gratuito; produtos pagos não podem dizer "compatible with"; **sem reproduzir texto da RTG "including stat blocks and rulesets"**; sem título da RTG no título do seu produto. "You may create character sheets and generators that automate character creation, rolls, and random content"; o material do jogo "can only be summarized"; **"Full stat blocks for monsters, NPCs, or hazards are not allowed."** Conteúdo gratuito pode passar por lojas de aplicativos. Um aviso de conteúdo não oficial (cerca de 230 caracteres) é exigido onde seja facilmente visto. Encaixe: só layouts em branco e resumos.
- **Vem embutido (item 6 da ADR 0099).** Embutido desde 2026-10-21 (decidido pelo mantenedor, 0099.6c = A) como layouts em branco (`cpr-blank-character`, `cpr-blank-npc`: só nomes de campos, sem texto de regras, sem ficha pronta), com título de subtítulo descritivo ("Ficha em branco — Cyberpunk RED", "Ficha de PNJ — Cyberpunk RED", em inglês "Blank sheet — for Cyberpunk RED", como a política permite). O aviso da política foi lido palavra por palavra em 2026-10-21 em https://rtalsoriangames.com/homebrew-content-policy/ e está na ficha e na página de créditos; a linha de crédito abaixo é a exata. O aviso
- **Linha de crédito.** Verificada palavra por palavra em 2026-10-21 (https://rtalsoriangames.com/homebrew-content-policy/), exigida "num lugar bem visível, como o fim do documento" para conteúdo além de uma postagem de fórum: "[Title of your Content] is unofficial content provided under the Homebrew Content Policy of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees." com o título do conteúdo preenchido; a janela a mostra inteira na página de créditos e, na ficha em branco, só uma linha curta que aponta para lá: o texto completo só na página de créditos é do mantenedor (2026-10-21, S.3b = B); a linha na ficha é escolha da construção, à espera dele (S.3b-bis; corrigido em 2026-10-21, o texto dizia que o aviso completo ficava no rodapé de cada ficha em branco). Os nomes dos campos em pt-BR são **provisórios** (S.3c), não conferidos com os livros brasileiros. A política proíbe o título do jogo no título do conteúdo, mas o permite num subtítulo descritivo.
- **Ficha de personagem, na ordem de exibição.**
  - Ficha oficial (https://rtalsoriangames.com/wp-content/uploads/2020/11/RTG-CPR-CharacterSheet.pdf).
  - **Atributos:** (10) INT, REF, DEX, TECH, COOL, WILL, MOVE, BODY, EMP, LUCK (LUCK and EMP shown "out of").
  - **Perícias:** by category, each with its stat, a BASE and a LVL: Awareness (Concentration WILL, Conceal/Reveal Object INT, Lip Reading INT, Perception INT, Tracking INT); Body (Athletics DEX, Contortionist DEX, Dance DEX, Endurance WILL, Resist Torture/Drugs WILL, Stealth DEX); Control (Drive Land Vehicle REF, Pilot Air Vehicle ×2 REF, Pilot Sea Vehicle REF, Riding REF); Education (Accounting, Animal Handling, Bureaucracy, Business, Composition, Criminology, Cryptography, Deduction, Education, Gamble, Language, Library Search, Local Expert, Science, Tactics, Wilderness Survival: all INT); Fighting (Brawling DEX, Evasion DEX, Martial Arts ×2 DEX, Melee Weapon DEX); Performance (Acting COOL, Play Instrument TECH); Ranged Weapon (Archery REF, Autofire ×2 REF, Handgun REF, Heavy Weapons ×2 REF, Shoulder Arms REF); Social (Bribery COOL, Conversation EMP, Human Perception EMP, Interrogation COOL, Persuasion COOL, Personal Grooming COOL, Streetwise COOL, Trading COOL, Wardrobe & Style COOL); Technique (Air Vehicle Tech, Basic Tech, Cybertech, Demolitions ×2, Electronics/Security Tech ×2, First Aid, Forgery, Land Vehicle Tech, Paint/Draw/Sculpt, Paramedic ×2, Photography/Film, Pick Lock, Pick Pocket, Sea Vehicle Tech, Weaponstech: all TECH). "×2" = double-cost skills.
  - **Marcadores:** Role + Role Ability (rank), Hit Points (current/max), Seriously Wounded, Death Save, Humanity (out of), Luck (out of), Improvement Points, Reputation, Armor Head / Body / Shield (SP) with the REF/DEX/MOVE penalty, Weapons (Weapon, DMG, ROF, Notes), Critical Injuries, Addictions, Gear (Ammunition, Cash), Lifepath fields, Cyberware page (Neural Link, Cybereyes, Cyberaudio Suite, Cyberarms, Cyberlegs, Internal/External Cyberware, Fashionware, Borgware with option slots).
- **Ficha de adversário, na ordem de exibição.**
  - Mooks sheet "Hardened Mooks" (https://rtalsoriangames.com/wp-content/uploads/2021/10/RTG-CPR-MooksSheetFormFillable.pdf), per NPC: 10 stats (LUCK, WILL, MOVE, BODY, EMP, COOL, TECH, DEX, REF, INT), Death Save, Seriously Wounded, Hit Points, Armor (Head SP / Body SP), Weapons (name + damage dice), Skill Bases, Cyberware & Special Equipment. The sheet has pre-filled exemplo text: **do not copy it**. An elite NPC / Lieutenant sheet: UNVERIFIED.
- **Rolagens.** Skill Base (stat + skill) rolls with 1d10 (rule text UNVERIFIED); weapon damage dice (`5d6`); Death Save roll-under; Luck.
- **Fontes.** Data Pack sheet (não lida): https://rtalsoriangames.com/wp-content/uploads/2021/09/RTG-CPR-DataPack-Charsheet-CLC.pdf
- **UNVERIFIED.** O texto exato do aviso; as fórmulas derivadas (PV = 10 + 5 × média de BODY e WILL arredondada para cima, Death Save = BODY, Humanidade = EMP × 10, Seriamente Ferido = PV/2 não estão impressas na ficha); a ficha de NPC de elite; as fichas de veículo e de arquitetura NET de netrunner; a editora e os nomes em pt-BR.

### 3.29 Shadowrun, 6th edition (Catalyst Game Labs)

- **Licença.** Nenhuma política de aplicativo ou ficha de fãs encontrada. O "Holostreets" da Catalyst (programa comunitário do DriveThruRPG, https://www.shadowrunsixthworld.com/?p=1146) é para publicações e não diz nada sobre aplicativos nem texto de regras. Presumir que não até achar uma política escrita.
- **Vem embutido (item 6 da ADR 0099).** Não citado no item 6 da ADR 0099; não embutido
- **Linha de crédito.** Nenhuma.
- **Ficha de personagem, na ordem de exibição.**
  - **UNVERIFIED** (no official sheet obtained). Só de memória, **não embutir**: Body, Agility, Reaction, Strength, Willpower, Logic, Intuition, Charisma, Edge, Essence, Magic/Resonance; Initiative; Condition Monitors (Physical/Stun); skills with specialisations.
- **Ficha de adversário, na ordem de exibição.**
  - UNVERIFIED (Grunt / Professional Rating; vehicle, drone, spirit, sprite sheets).
- **Rolagens.** UNVERIFIED.
- **Fontes.** Nenhuma.
- **UNVERIFIED.** Tudo, exceto a ausência de uma licença (12 itens).

### 3.30 Starfinder, 2nd edition (Paizo)

- **Licença.** ORC, anunciada pela Paizo para Starfinder 2e (https://paizo.com/blog/new-and-revised-licenses ; https://paizo.com/orclicense). Material Licenciado: estatísticas e criação de personagem, sistemas e regras de jogo; o Material Reservado (marcas, trade dress, arte, personagens, cenários e elementos de enredo distintivos) não é licenciado; a ORC não licencia código de software; novas mecânicas em produtos eletrônicos são liberadas sob a ORC; avisos exigidos: ORC Notice, Attribution Notice, Reserved Material Notice. A página de ORC dos próprios livros não foi lida: quais partes eles declaram Reservadas é **UNVERIFIED**.
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** Verificado em 2026-10-20: o ORC Notice é o texto exigido pela própria licença (https://paizo.com/orclicense, III.a): "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations. All warranties are disclaimed as set forth therein." (o exemplo dela acrescenta "including [domains] and others"). O item III.b pede uma declaração de atribuição de boa-fé "worded in any accurate and reasonable manner" e o III.c uma declaração de Reserved Material. A janela mostra o ORC Notice e "Starfinder Second Edition (c) Paizo Inc., used under the ORC License. Not affiliated with Paizo." (palavras nossas). O aviso próprio da Paizo para Starfinder e a lista de Reserved Material não foram achados online: **UNVERIFIED**, nada é afirmado.
- **Ficha de personagem, na ordem de exibição.**
  - **UNVERIFIED** (no official sheet read). Só de memória, **não embutir**: ancestry/heritage, background, class; six attribute modifiers; Stamina Points, Resolve Points, HP; AC; Perception; Fort/Ref/Will; skills with ranks; speed; Hero Points. Starship sheet (the AoN "starship combat" section): structure UNVERIFIED.
- **Ficha de adversário, na ordem de exibição.**
  - Criatura [OFFICIAL SRD-style, Archives of Nethys "Alien Core", https://2e.aonsrd.com/rules/1263-alien-core], em ordem: Name and Level; Traits (rarity, size, others); Perception (+ senses); Languages; Skills; Attribute Modifiers; Items; Interaction Abilities; AC; Saving Throws (Fort/Ref/Will); HP (+ automatic abilities); Immunities, Weaknesses, Resistances; Automatic Abilities; Reactive Abilities; Speed; Melee; Ranged; Area Fire; Spells; Innate Spells; Focus Spells; Rituals; Offensive/Proactive Abilities.
- **Rolagens.** Perception, skills, saves, Strike bonuses and damage, spell DC.
- **Fontes.** https://2e.aonsrd.com/rules/1263-alien-core
- **UNVERIFIED.** A ficha de PJ; quais partes os livros declaram Reservadas; a ficha de nave; nenhuma edição oficial em pt-BR encontrada (8 itens).

### 3.31 Warhammer Fantasy Roleplay, 4th edition (Cubicle 7 / Games Workshop)

- **Licença.** Nenhuma encontrada (o site da Cubicle 7 fica atrás do Cloudflare, não contornado). Presumir que não.
- **Vem embutido (item 6 da ADR 0099).** Não citado no item 6 da ADR 0099; não embutido
- **Linha de crédito.** Nenhuma.
- **Ficha de personagem, na ordem de exibição.**
  - [COMMUNITY]/secondary (https://d20radio.com/main/?p=14955 ; https://startplaying.games/blog/posts/how-to-create-a-character-for-warhammer-fantasy-roleplay): 10 characteristics Weapon Skill, Ballistic Skill, Strength, Toughness, Agility, Initiative, Dexterity, Intelligence, Willpower, Fellowship; characteristic bonus = tens digit; Wounds from Strength Bonus + Toughness Bonus + Willpower Bonus; Movement (Walk/Run); Fate, Fortune (max = Fate), Resilience, Resolve (max = Resilience), Motivation, Experience (current/spent/total), Advances.
- **Ficha de adversário, na ordem de exibição.**
  - UNVERIFIED (Traits, Trappings, Armour/AP by location; not read).
- **Rolagens.** UNVERIFIED.
- **Fontes.** As páginas acima.
- **UNVERIFIED.** A fórmula de Ferimentos com os seus multiplicadores; o formato de criatura; a editora brasileira (11 itens).

### 3.32 Kids on Bikes (Hunters Entertainment / Renegade)

- **Licença.** Nenhuma política de terceiros encontrada (https://www.huntersentertainment.com/). Incerto.
- **Vem embutido (item 6 da ADR 0099).** Não citado no item 6 da ADR 0099; não embutido
- **Linha de crédito.** Nenhuma.
- **Ficha de personagem, na ordem de exibição.**
  - **UNVERIFIED.** Só de lembrança, **não embutir**: six stats Fight, Flight, Brains, Brawn, Charm, Grit on a dice ladder; Strengths and Flaws; Fear and Adversity tokens.
- **Ficha de adversário, na ordem de exibição.**
  - UNVERIFIED.
- **Rolagens.** UNVERIFIED.
- **Fontes.** https://www.huntersentertainment.com/
- **UNVERIFIED.** Tudo (8 itens).

### 3.33 Brindlewood Bay (Gauntlet)

- **Licença.** Nenhum termo visível: o rodapé da página da editora diz "© COPYRIGHT 2024. ALL RIGHTS RESERVED" (https://www.gauntlet-rpg.com/brindlewood-bay.html). Incerto.
- **Vem embutido (item 6 da ADR 0099).** Não citado no item 6 da ADR 0099; não embutido
- **Linha de crédito.** Nenhuma.
- **Ficha de personagem, na ordem de exibição.**
  - **UNVERIFIED** (Maven playbooks, Moves, Mysteries / Clues, Theories: names only, structure not read).
- **Ficha de adversário, na ordem de exibição.**
  - UNVERIFIED.
- **Rolagens.** UNVERIFIED.
- **Fontes.** https://www.gauntlet-rpg.com/brindlewood-bay.html
- **UNVERIFIED.** Tudo (7 itens).

### 3.34 Ordem Paranormal RPG (Jambô Editora; Cellbit)

- **Licença.** Segundo um pacote Foundry da comunidade (não da Jambô), o texto de regras do livro é Open Game Content sob a OGL, exceto Product Identity: os capítulos 5, 7 e 8, os termos do cenário (Membrana, Outro Lado…), nomes e descrições de personagens, criaturas, locais e organizações, todas as ilustrações, e as regras de rituais, poderes paranormais, Sanidade e dano mental (https://foundryvtt.com/packages/ordemparanormal ; https://github.com/SouOWendel/ordemparanormal_fvtt). **Verificar na página de OGL do próprio livro.** Nenhuma política de fãs da Jambô encontrada. Um layout que use SAN, PE ou NEX é arriscado.
- **Vem embutido (item 6 da ADR 0099).** Não citado no item 6 da ADR 0099; não embutido
- **Linha de crédito.** Nenhuma.
- **Ficha de personagem, na ordem de exibição.**
  - [COMMUNITY] (GPL/CC fan Foundry system `template.json`, https://raw.githubusercontent.com/SouOWendel/ordemparanormal_fvtt/main/template.json; só nomes de campos, do not copy code). Actor types `agent`, `threat`.
  - **Marcadores:** PV, SAN, PE (Pontos de Esforço), PD (meaning UNVERIFIED), NEX (exposure %), stage/level, Defesa, Deslocamento.
  - **Atributos:** (5) dex, int, pre, str, vit (pt-BR Agilidade, Intelecto, Presença, Força, Vigor: UNVERIFIED).
  - **Perícias:** (with attribute) acrobatics (dex), animal handling (pre), arts (pre), athletics (str), current events (int), sciences (int), crime (dex), diplomacy (pre), deception (pre), resilience (vit), stealth (dex), initiative (dex), intimidation (pre), intuition (pre), investigation (int), fighting (str), medicine (int), occultism (int), perception (pre), piloting (dex), aim (dex), reflexes (dex), religion (pre), survival (int), tactics (int), technology (int), will (pre), plus a free skill; degrees untrained / trained / veteran / expert (labels UNVERIFIED).
  - **Seções:** Class, origin, trail, ritual DT, patent (rank, prestige points, credit limit, item limits); items: armament, protection, general equipment, rituals, abilities, origins, paths, classes.
- **Ficha de adversário, na ordem de exibição.**
  - [COMMUNITY] same template, actor type `threat`: HP, five attributes, movement (walk, unit, squares), **VD**, skills (fighting, aim, resilience, reflexes, will, initiative, perception, free skill), defense (value, skill resistances, damage resistances), resistances by damage type (cutting, impact, piercing, ballistic, fire, electric, cold, chemical, mental, blood, death, knowledge, energy), vulnerabilities, size, disturbing presence (DT, mental damage, immune NEX), fear riddle, creature type, elements (main, others), senses, abilities, actions, description.
- **Rolagens.** Skill tests, attacks, DT checks (the d20 rule is UNVERIFIED).
- **Fontes.** O pacote e o repositório acima; the book at https://www.martinsfontespaulista.com.br/ordem-paranormal-rpg-1058711/p
- **UNVERIFIED.** Todos os termos oficiais em pt-BR; fórmulas derivadas (PV/PE/SAN por classe); o layout oficial de ameaça e o significado de VD; as regras de Sanidade (Product Identity); a URL de uma ficha oficial gratuita; os passos de NEX; graus de perícia; o recurso PD; a fronteira de Product Identity para criaturas (12 itens).

### 3.35 13th Age (Pelgrane Press / Fire Opal Media), Archmage Engine

- **Licença.** OGL 1.0a (https://www.13thagesrd.com/legal) **[OFFICIAL]**: as mecânicas são Open Game Content; Product Identity (marcas, nomes próprios incluindo personagens, enredos, locais, arte, trade dress) fica de fora. Uma cópia da OGL vai com o OGC distribuído, que é identificado; o Product Identity é marcado à parte. Evitar os nomes dos Icons se forem Product Identity (a designação da página não foi totalmente conferida).
- **Vem embutido (item 6 da ADR 0099).** Embutido
- **Linha de crédito.** Verificado em 2026-10-20 (https://www.13thagesrd.com/legal): a Seção 15 da licença como a página a imprime, levada inteira pela janela (12 linhas: a OGL, o SRD, o Archmage Engine, 13th Age, 13 True Ways, o Bestiary, o Pathfinder RPG Core Rulebook, Castles & Crusades e quatro obras da Jon Brazer Enterprises), depois "Copyright © 2013 Fire Opal Media. All Rights Reserved. Licensed under the Open Game License." e a declaração de Open Game Content da página. A seção 10 da OGL pede uma cópia da licença com o Open Game Content distribuído: o texto dela, como a página o imprime, vai embutido (`app/ui/src/oglText.ts`) e aparece ao lado do aviso.
- **Ficha de personagem, na ordem de exibição.**
  - SRD (https://www.13thagesrd.com/character-rules/ ; https://www.13thagesrd.com/combat-rules/).
  - **Atributos:** Strength, Constitution, Dexterity, Intelligence, Wisdom, Charisma.
  - **Derivados:** HP = (class base 6/7/8 + Con modifier) × 3 at 1st level; AC = class base (10–16) + middle of the Con/Dex/Wis modifiers + level; PD = class base (10–12) + middle of Str/Con/Dex + level; MD = class base (10–12) + middle of Int/Wis/Cha + level; Initiative = d20 + Dex modifier + level; Recoveries (8 or 9 to start; recovery dice = level in dice + Con modifier, die size by class).
  - **Seções:** Backgrounds (8 points, 1–5 each; skill check = d20 + ability modifier + level + background points), Icon relationships, One Unique Thing, class powers / talents / feats; escalation die (+1 per round up to +6 for PCs); staggered at half HP.
- **Ficha de adversário, na ordem de exibição.**
  - Monster (https://www.13thagesrd.com/monsters/monster-rules/), em ordem: Size/Strength (regular, large, huge; normal, double, triple), Level, Role (Archer, Blocker, Caster, Leader, Mook, Spoiler, Troop, Wrecker), Type, Initiative, Attack (melee by default; R ranged; C close-quarters), Extra effects (triggered by natural even/odd, 16+, …), Specials, AC, PD, MD, HP.
- **Rolagens.** Initiative, attack roll against a defence, damage, natural-roll triggers.
- **Fontes.** As páginas do SRD acima.
- **UNVERIFIED.** Como o PV de um Mook é apresentado (por mook); a editora brasileira; se os nomes dos Icons são Product Identity.

### 3.36 Dragonbane (Free League), 1st edition 2023

- **Licença.** Dragonbane Third-Party Tabletop Module License v1.1 (31 mar 2026), https://freeleaguepublishing.com/wp-content/uploads/2026/03/Dragonbane-License-Agreement-version-1.1.pdf: só suplementos; terminologia e nomes de criaturas podem ser referenciados; sem texto, arte ou trade dress da Free League; sem novos atributos nem perícias básicas; monstros podem ser acrescentados. Uma licença de suplemento, não de aplicativo: incerto.
- **Vem embutido (item 6 da ADR 0099).** Não embutido: a pessoa importa um layout, ou ele vem embutido quando a editora permitir por escrito (item 6 da ADR 0099)
- **Linha de crédito.** "Dragonbane is a trademark of Fria Ligan AB. This content is not affiliated with, sponsored, or endorsed by Fria Ligan AB. It was created under Fria Ligan AB's Dragonbane Third Party Supplement License."
- **Ficha de personagem, na ordem de exibição.**
  - Ficha oficial (https://freeleaguepublishing.com/wp-content/uploads/2023/09/DB-Character-Sheet-v1.pdf).
  - **Cabeçalho:** Player, Name, Kin, Age, Profession, Weakness, Appearance, Memento.
  - **Atributos:** (6) STR, CON, AGL, INT, WIL, CHA.
  - **Derivados:** Damage Bonus STR, Damage Bonus AGL, Movement, Hit Points, Willpower Points, Encumbrance Limit; Death Rolls (Successes, Failures); Round Rest, Stretch Rest.
  - **Condições:** (6) Exhausted (STR), Sickly (CON), Dazed (AGL), Angry (INT), Scared (WIL), Disheartened (CHA) (the pairing is the community data-model reading; the sheet lists the names in this order).
  - **Perícias:** (20) Acrobatics (AGL), Awareness (INT), Bartering (CHA), Beast Lore (INT), Bluffing (CHA), Bushcraft (INT), Crafting (STR), Evade (AGL), Healing (INT), Hunting & Fishing (AGL), Languages (INT), Myths & Legends (INT), Performance (CHA), Persuasion (CHA), Riding (AGL), Seamanship (INT), Sleight of Hand (AGL), Sneaking (AGL), Spot Hidden (INT), Swimming (AGL).
  - Perícias de arma (10): Axes (STR), Bows (AGL), Brawling (STR), Crossbows (AGL), Hammers (STR), Knives (AGL), Slings (AGL), Spears (STR), Staves (AGL), Swords (STR).
  - **Equipamento:** Weapon / Shield table (Grip, Range, Features, Damage, Durability), Armor rating, Helmet, "Bane on" Sneaking / Evade / Acrobatics / Awareness / Ranged Attacks, Abilities & Spells, Inventory (slots 1–10), Tiny Items, Copper / Silver / Gold.
- **Ficha de adversário, na ordem de exibição.**
  - [OFFICIAL-DEV] (`pafvel/dragonbane`, listed on Foundry with publisher Free League; code GPL-3.0; art, logo and text owned by Fria Ligan AB). Monstro: description, movement (base / value), hit points (value / base / max), armor, ferocity (base / value), size, traits, attack table (text), previous monster attack; plus abilities / skills / weapon items. NPC: the character base (kin, age, profession, motivation, willpower points, damage bonuses, HP, movement) + traits.
  - Outras fichas [OFFICIAL]: Path of Glory time sheet (https://freeleaguepublishing.com/wp-content/uploads/2023/12/DB-Path-of-Glory-time-sheet-v1.pdf); Trudvang variant (https://freeleaguepublishing.com/wp-content/uploads/2026/10/Dragonbane-Trudvang-Character-Sheet.pdf).
- **Rolagens.** Skill rolls `d20` roll-under with boon / bane; the attack-table roll; damage; death rolls.
- **Fontes.** Brasil: Tria Editora via Catarse (https://narradoresdomultiverso.com.br/late-pledge-de-dragonbane/).
- **UNVERIFIED.** O layout em D6 da tabela de ataques do monstro (o modelo de dados tem `attackTable` e `previousMonsterAttack`); as fórmulas de PV, PV de vontade e Movimento (só no livro); os nomes de campos em pt-BR.

## 4. Onde esta pesquisa e o item 6 da ADR 0099 não coincidem

Estes ficam registrados, não resolvidos; o mantenedor decide (regra zero do CLAUDE.md).

- O item 6 lista Vampiro entre os jogos importados, e também marca "os jogos da 5ª edição de World of Darkness sob o Dark Pack da Paradox" como `[PROPOSTO]` embutidos. As seções 3.23 a 3.25 trazem a evidência do Dark Pack para as duas leituras.
- O item 6 cita "D&D 5e SRD 5.2"; a pesquisa leu o SRD 5.1 e o SRD 5.2.1, com linhas de crédito separadas (3.2).
- O item 6 diz que Fractal é "CC BY 4.0 pelo texto do seu SRD"; a imagem do selo do SRD mostra BY-SA (3.10). Os autores não foram consultados.
- O item 6 cita Starfinder 2e entre os layouts embutidos; a pesquisa verificou o statblock de criatura dele mas não a ficha de personagem (3.30), então um layout embutido de Starfinder 2e não tem uma ficha de personagem verificada a partir da qual ser construído.
- O layout genérico de Year Zero Engine (3.16), um layout genérico de Powered by the Apocalypse (3.4) e Mothership (3.15) não são citados no item 6. Este arquivo não registra decisão sobre eles.
- Cairn e Old Dragon 2e: o item 6 diz "só nomes de campos, nenhum texto"; as seções 3.6 e 3.11 listam os nomes de campos e também, em alguns pontos, frases descritivas curtas da fonte (por exemplo os nomes dos traços do Cairn). Um layout toma os nomes, não as frases.
