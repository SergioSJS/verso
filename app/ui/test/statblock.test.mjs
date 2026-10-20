// Visual Markdown Statblocks (ADR 0099)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { d20Modifier, formatModifier, parseStatblock } from "./src/statblock/parser";
export { setStatblockLang } from "./src/statblock/strings";
export { BUILTIN_LAYOUTS, getAllLayouts, getLayout, resolveLayout, exportLayoutToJson, exportLayoutToYaml, importLayoutFromJson, importLayoutFromYaml, getDefaultLayoutId, setDefaultLayoutId } from "./src/statblock/layouts";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblock.test-bundle.mjs",
  logLevel: "error",
  external: ["yaml", "@tauri-apps/*"],
});
const {
  setStatblockLang,
  d20Modifier,
  formatModifier,
  parseStatblock,
  BUILTIN_LAYOUTS,
  getAllLayouts,
  getLayout,
  resolveLayout,
  exportLayoutToJson,
  exportLayoutToYaml,
  importLayoutFromJson,
  importLayoutFromYaml,
  getDefaultLayoutId,
  setDefaultLayoutId,
} = await import("./.bundles/statblock.test-bundle.mjs");

// The cards speak the interface's language; these tests read them in pt-BR.
setStatblockLang("pt-BR");

test("d20Modifier calculates standard d20 ability modifiers correctly", () => {
  assert.equal(d20Modifier(10), 0);
  assert.equal(d20Modifier(11), 0);
  assert.equal(d20Modifier(12), 1);
  assert.equal(d20Modifier(14), 2);
  assert.equal(d20Modifier(16), 3);
  assert.equal(d20Modifier(18), 4);
  assert.equal(d20Modifier(20), 5);
  assert.equal(d20Modifier(9), -1);
  assert.equal(d20Modifier(8), -1);
  assert.equal(d20Modifier(6), -2);
  assert.equal(d20Modifier(1), -5);
});

test("formatModifier formats signed numbers", () => {
  assert.equal(formatModifier(3), "+3");
  assert.equal(formatModifier(0), "+0");
  assert.equal(formatModifier(-2), "-2");
});

test("parseStatblock parses 5e monster statblock format", () => {
  const yaml = `
name: Adult Red Dragon
size: Huge
type: dragon
alignment: chaotic evil
ac: 19
ac_type: natural armor
hp: 256
hit_dice: 17d12 + 136
speed: 40 ft., climb 40 ft., fly 80 ft.
stats: [27, 10, 25, 16, 13, 21]
saves:
  - Dexterity: +6
  - Constitution: +13
  - Wisdom: +7
  - Charisma: +11
skills:
  - Perception: +13
  - Stealth: +6
damage_immunities: fire
senses: blindsight 60 ft., darkvision 120 ft., passive Perception 23
languages: Common, Draconic
cr: 17
traits:
  - name: Legendary Resistance (3/Day)
    desc: If the dragon fails a saving throw, it can choose to succeed instead.
actions:
  - name: Multiattack
    desc: The dragon can use its Frightful Presence. It then makes three attacks.
  - name: Bite
    desc: "Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage."
  - name: Fire Breath (Recharge 5-6)
    desc: The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save.
legendary_actions:
  - name: Wing Attack (Costs 2 Actions)
    desc: The dragon beats its wings. Each creature within 10 feet of the dragon must succeed on a DC 22 Dexterity saving throw.
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Adult Red Dragon");
  assert.equal(parsed.subtitle, "Huge, dragon, chaotic evil");
  assert.equal(parsed.ac, 19);
  assert.equal(parsed.ac_note, "natural armor");
  assert.equal(parsed.hp, 256);
  assert.equal(parsed.hp_formula, "17d12 + 136");
  assert.equal(parsed.speed, "40 ft., climb 40 ft., fly 80 ft.");
  assert.equal(parsed.cr, 17);

  // Check 6 abilities
  assert.equal(parsed.abilities.length, 6);
  assert.equal(parsed.abilities[0]?.short, "FOR");
  assert.equal(parsed.abilities[0]?.score, 27);
  assert.equal(parsed.abilities[0]?.modifier, 8); // (27 - 10) / 2 = 8

  assert.equal(parsed.abilities[1]?.short, "DES");
  assert.equal(parsed.abilities[1]?.score, 10);
  assert.equal(parsed.abilities[1]?.modifier, 0);

  // Check traits and actions
  assert.ok(parsed.traits && parsed.traits.length === 1);
  assert.equal(parsed.traits[0]?.name, "Legendary Resistance (3/Day)");
  assert.ok(parsed.actions && parsed.actions.length === 3);
  assert.equal(parsed.actions[1]?.name, "Bite");
  assert.ok(parsed.legendary_actions && parsed.legendary_actions.length === 1);
});

test("parseStatblock parses Tormenta20 / Portuguese naming conventions", () => {
  const yaml = `
nome: Capitão Purista
tipo: humanoide
subtipo: humano
defesa: 24
pv: 85
pm: 20
deslocamento: 9m
forca: 18
destreza: 14
constituicao: 16
inteligencia: 10
sabedoria: 12
carisma: 14
nd: 5
sentidos: Percepção 15
idiomas: Valkar
acoes:
  - titulo: Espada Bastarda
    descricao: "Corpo a corpo: 1d20+12, dano 1d10+7 corte, crítico 19/x2."
  - titulo: Disparo de Mosquete
    descricao: "À distância: 1d20+10, dano 2d8+4 perfuração, alcance 15m."
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Capitão Purista");
  assert.equal(parsed.subtitle, "humanoide (humano)");
  assert.equal(parsed.ac, 24);
  assert.equal(parsed.hp, 85);
  assert.equal(parsed.mp, 20);
  assert.equal(parsed.speed, "9m");
  assert.equal(parsed.cr, 5);

  assert.equal(parsed.abilities[0]?.score, 18);
  assert.equal(parsed.abilities[0]?.modifier, 4);

  assert.ok(parsed.actions && parsed.actions.length === 2);
  assert.equal(parsed.actions[0]?.name, "Espada Bastarda");
  assert.ok(parsed.actions[0]?.desc.includes("1d20+12"));
});

test("parseStatblock does NOT invent ability scores when none are declared", () => {
  const yaml = `
name: Tobias
layout: asdasdas
hp: 10
ac: 10
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Tobias");
  assert.equal(parsed.hp, 10);
  assert.equal(parsed.ac, 10);
  assert.equal(parsed.layout, "asdasdas");
  assert.equal(parsed.abilities.length, 0, "Abilities must be empty when none were specified");
});

test("parseStatblock returns null on empty or non-object content", () => {
  assert.equal(parseStatblock(""), null);
  assert.equal(parseStatblock("   "), null);
  assert.equal(parseStatblock("just a random sentence"), null);
});

test("parseStatblock handles tutorial goblin with unquoted colons in action descriptions", () => {
  const yaml = `
nome: Goblin Rastreador
tipo: Humanoide (pequeno), caótico e neutro
ca: 15 (armadura de couro, escudo)
pv: 7 (2d6)
deslocamento: 9 m
forca: 8
destreza: 14
constituicao: 10
inteligencia: 10
sabedoria: 8
carisma: 8
pericias: Furtividade +6
sentidos: Visão no escuro 18 m, Percepção passiva 9
idiomas: Comum, Goblin
habilidades:
  - Fuga Ágil: O goblin pode usar a ação de Desengajar ou Esconder-se como uma ação bônus em cada um dos seus turnos.
acoes:
  - Cimitarra: Ataque com arma corpo a corpo: 1d20+4 para acertar, alcance 1,5 m, um alvo. Dano: 1d6+2 de dano cortante.
  - Arco Curto: Ataque com arma à distância: 1d20+4 para acertar, alcance 24/96 m, um alvo. Dano: 1d6+2 de dano perfurante.
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Goblin Rastreador");
  assert.equal(parsed.abilities.length, 6);
  assert.equal(parsed.abilities[1]?.modifier, 2); // DEX 14 -> +2
  assert.equal(parsed.actions?.length, 2);
  assert.equal(parsed.actions?.[0]?.name, "Cimitarra");
  assert.ok(parsed.actions?.[0]?.desc.includes("1d20+4"));
  assert.equal(parsed.actions?.[1]?.name, "Arco Curto");
});

test("parseStatblock handles custom RPG attributes list (e.g. Gosma, Gelo, Fogo, Doce)", () => {
  const yaml = `
nome: Monstro Doceiro
tipo: Criatura Doce
ca: 12
pv: 20
atributos:
  - Gosma: 8
  - Gelo: 14
  - Fogo: 10
  - Doce: 10
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Monstro Doceiro");
  assert.equal(parsed.abilities.length, 4);
  assert.equal(parsed.abilities[0]?.name, "Gosma");
  assert.equal(parsed.abilities[0]?.score, 8);
  assert.equal(parsed.abilities[0]?.modifier, -1);
  assert.equal(parsed.abilities[1]?.name, "Gelo");
  assert.equal(parsed.abilities[1]?.score, 14);
  assert.equal(parsed.abilities[1]?.modifier, 2);
  assert.equal(parsed.abilities[2]?.name, "Fogo");
  assert.equal(parsed.abilities[3]?.name, "Doce");
});

test("parseStatblock handles custom RPG attributes mapping as object", () => {
  const yaml = `
nome: Monstro Mecânico
stats:
  Vigor: 16
  Astúcia: 12
  Reflexos: 18
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.abilities.length, 3);
  assert.equal(parsed.abilities[0]?.name, "Vigor");
  assert.equal(parsed.abilities[0]?.score, 16);
  assert.equal(parsed.abilities[0]?.modifier, 3);
  assert.equal(parsed.abilities[2]?.name, "Reflexos");
  assert.equal(parsed.abilities[2]?.score, 18);
  assert.equal(parsed.abilities[2]?.modifier, 4);
});test("parseStatblock handles Call of Cthulhu investigation character with Sanidade, Sorte, Perícias, Armas e Inventário", () => {
  const yaml = `
nome: Detetive Silas Vance
ocupacao: Investigador Particular
pv: 11
sanidade: 45
sorte: 55
deslocamento: 8
pericias:
  - Armas de Fogo: 60%
  - Investigação: 75%
  - Psicologia: 50%
armas:
  - Revólver .38: "1d10 de dano, alcance 15m, 1 tiro/rodada"
  - Faca de Trincheira: "1d4+1 de dano"
inventario:
  - Lanterna a óleo
  - Bloco de notas com pistas
  - Gazua
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Detetive Silas Vance");
  assert.equal(parsed.subtitle, "Investigador Particular");
  assert.equal(parsed.vitals?.length, 4);
  assert.equal(parsed.vitals?.[0]?.label, "Pontos de Vida (PV)");
  assert.equal(parsed.vitals?.[0]?.value, 11);
  assert.equal(parsed.vitals?.[1]?.label, "Sanidade");
  assert.equal(parsed.vitals?.[1]?.value, 45);
  assert.equal(parsed.vitals?.[2]?.label, "Sorte");
  assert.equal(parsed.vitals?.[2]?.value, 55);
  assert.equal(parsed.skills, "Armas de Fogo: 60%, Investigação: 75%, Psicologia: 50%");

  // Check dynamic custom sections
  assert.ok(parsed.customSections && parsed.customSections.length === 2);
  assert.equal(parsed.customSections[0]?.title, "Armas");
  assert.equal(parsed.customSections[0]?.items.length, 2);
  assert.equal(parsed.customSections[0]?.items[0]?.name, "Revólver .38");
  assert.ok(parsed.customSections[0]?.items[0]?.desc.includes("1d10"));

  assert.equal(parsed.customSections[1]?.title, "Inventario");
  assert.equal(parsed.customSections[1]?.items.length, 3);
  assert.equal(parsed.customSections[1]?.items[0]?.desc, "Lanterna a óleo");
});

test("parseStatblock handles Cyberpunk RED mercenary with Blindagem, Humanidade, Atributos e Ciberware", () => {
  const yaml = `
nome: Nyx Cyberpunk
conceito: Solo Mercenário
pv: 35
blindagem: 11
humanidade: 40
atributos:
  - INT: 8
  - REF: 8
  - DEX: 7
  - TECH: 6
  - COOL: 8
  - WILL: 5
  - LUCK: 6
  - MOVE: 7
  - BODY: 8
  - EMP: 4
ciberware:
  - Olhos Kiroshi: Visão Noturna e Scanner Térmico
  - Braço Cibernético: Força aprimorada
armas:
  - Fuzil de Assalto: "5d6 de dano, alcance 30m"
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Nyx Cyberpunk");
  assert.equal(parsed.subtitle, "Solo Mercenário");
  assert.equal(parsed.abilities.length, 10);
  assert.equal(parsed.abilities[0]?.name, "INT");
  assert.equal(parsed.abilities[1]?.name, "REF");
  assert.equal(parsed.abilities[9]?.name, "EMP");

  assert.ok(parsed.customSections && parsed.customSections.length === 2);
  assert.equal(parsed.customSections[0]?.title, "Ciberware");
  assert.equal(parsed.customSections[0]?.items[0]?.name, "Olhos Kiroshi");
  assert.equal(parsed.customSections[1]?.title, "Armas");
  assert.equal(parsed.customSections[1]?.items[0]?.name, "Fuzil de Assalto");
});

test("statblock layouts registry provides built-in system templates", () => {
  assert.ok(BUILTIN_LAYOUTS.length >= 6);
  const ids = BUILTIN_LAYOUTS.map((l) => l.id);
  assert.ok(ids.includes("dnd5e"));
  assert.ok(ids.includes("tormenta20"));
  assert.ok(ids.includes("call-of-cthulhu"));
  assert.ok(ids.includes("cyberpunk-red"));
  assert.ok(ids.includes("mork-borg"));
  assert.ok(ids.includes("fate-core"));
});

test("getLayout resolves layouts by exact ID, exact name or exact tag, never by a part of a name", () => {
  const l1 = getLayout("call-of-cthulhu");
  assert.equal(l1.id, "call-of-cthulhu");

  const l2 = getLayout("Call of Cthulhu / Horror");
  assert.equal(l2.id, "call-of-cthulhu");

  const l3 = getLayout("cyberpunk");
  assert.equal(l3.id, "cyberpunk-red");

  const l4 = getLayout("mork-borg");
  assert.equal(l4.id, "mork-borg");

  // A part of a name is not a name: it used to pick whichever template came first.
  for (const guess of ["mork", "a", "x", "Alien", "dragon"]) {
    assert.equal(resolveLayout(guess).known, false, guess);
    assert.equal(resolveLayout(guess).layout.id, "dnd5e", guess);
  }
  // A tag two layouts share names neither.
  assert.equal(resolveLayout("osr").known, false);
  // Case and accents do not matter.
  assert.equal(resolveLayout("CALL OF CTHULHU / HORROR").layout.id, "call-of-cthulhu");
  assert.equal(resolveLayout("Mörk Borg / OSR").layout.id, "mork-borg");

  // Fallback to default when unknown
  const lDefault = getLayout("NonExistentSystem");
  assert.equal(lDefault.id, "dnd5e");
});

test("exportLayoutToJson and importLayoutFromJson round-trip Verso's own layout format", () => {
  const coc = getLayout("call-of-cthulhu");
  const exported = exportLayoutToJson(coc);
  assert.ok(exported.includes("Call of Cthulhu / Horror"));

  const parsedJson = JSON.parse(exported);
  assert.equal(parsedJson.name, coc.name);
  assert.equal(parsedJson.theme, "investigation");

  const sampleFsJson = JSON.stringify({
    name: "Mörk Borg Monster",
    id: "mb-custom",
    system: "Mörk Borg",
    description: "Custom community layout",
    theme: "osr",
    blocks: [
      { id: "h1", type: "heading", properties: ["name"] },
      { id: "v1", type: "vitals", properties: ["hp", "morale"] }
    ]
  });

  const imported = importLayoutFromJson(sampleFsJson);
  assert.equal(imported.name, "Mörk Borg Monster");
  assert.equal(imported.theme, "osr");
  assert.equal(imported.blocks.length, 2);
});

test("all requested system templates are built-in and resolvable", () => {
  const systemsToTest = [
    { query: "Dungeon World", expectedId: "dungeon-world" },
    { query: "Ironsworn", expectedId: "ironsworn" },
    { query: "PbtA", expectedId: "pbta" },
    { query: "Cairn", expectedId: "cairn" },
    { query: "Mausritter", expectedId: "mausritter" },
    { query: "Daggerheart", expectedId: "daggerheart" },
    { query: "Tales from the Loop", expectedId: "tales-from-the-loop" },
    { query: "Alien RPG", expectedId: "alien-rpg" },
    { query: "One Ring", expectedId: "one-ring" },
    { query: "O Um Anel", expectedId: "one-ring" },
    { query: "Year Zero", expectedId: "year-zero" },
    { query: "Forbidden Lands", expectedId: "forbidden-lands" },
    { query: "Terras Proibidas", expectedId: "forbidden-lands" },
    { query: "Blades in the Dark", expectedId: "blades-in-the-dark" },
    { query: "FitD", expectedId: "blades-in-the-dark" },
    { query: "Storyteller", expectedId: "storyteller" },
    { query: "Vampiro", expectedId: "storyteller" },
    { query: "Lobisomem", expectedId: "storyteller" },
    { query: "Mago", expectedId: "storyteller" },
    { query: "Fate Acelerado", expectedId: "fate-accelerated" },
    { query: "FAE", expectedId: "fate-accelerated" },
    { query: "Fate Condensado", expectedId: "fate-core" },
    { query: "Fractal RPG", expectedId: "fractal-rpg" },
    { query: "Fractal", expectedId: "fractal-rpg" },
    { query: "Pathfinder", expectedId: "pathfinder2e" },
    { query: "PF2e", expectedId: "pathfinder2e" },
    { query: "Savage Worlds", expectedId: "savage-worlds" },
    { query: "SWADE", expectedId: "savage-worlds" },
    { query: "Shadowrun", expectedId: "shadowrun" },
    { query: "Vaesen", expectedId: "vaesen" },
    { query: "Delta Green", expectedId: "delta-green" },
    { query: "OSE", expectedId: "ose" },
    { query: "Old-School Essentials", expectedId: "ose" },
  ];

  for (const { query, expectedId } of systemsToTest) {
    const layout = getLayout(query);
    assert.equal(layout.id, expectedId, `Query "${query}" should resolve to layout id "${expectedId}", but got "${layout.id}"`);
  }
});

test("parseStatblock handles Ironsworn character with momentum, health, spirit, supply and assets", () => {
  const yaml = `
nome: Kaelen o Juramentado
layout: Ironsworn
arquetipo: Caçador de Monstros do Ermo
impeto: +2
saude: 5
espirito: 4
suprimentos: 3
atributos:
  - Astúcia: 3
  - Coração: 1
  - Ferro: 2
  - Sombra: 1
  - Razão: 2
votos:
  - Voto de Ferro: "Limpar o vale da presença do Wyrm Cinzento (Extremo)"
ativos:
  - Matador de Feras: "Ao atacar monstros com Ferro, adicione +1 em acertos fortes."
  - Falcão Rastreador: "Seu companheiro animal avisa sobre perigos iminentes."
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Kaelen o Juramentado");
  assert.equal(parsed.layout, "Ironsworn");
  assert.equal(parsed.vitals?.length, 4);
  assert.ok(parsed.vitals?.some((v) => v.label === "Ímpeto" && (v.value === "+2" || v.value === 2)));
  assert.ok(parsed.vitals?.some((v) => v.label === "Saúde" && v.value === 5));
  assert.ok(parsed.vitals?.some((v) => v.label === "Espírito" && v.value === 4));
  assert.ok(parsed.vitals?.some((v) => v.label === "Suprimentos" && v.value === 3));

  assert.equal(parsed.abilities.length, 5);
  assert.equal(parsed.abilities[0]?.name, "Astúcia");
  assert.equal(parsed.abilities[0]?.score, 3);

  assert.ok(parsed.customSections && parsed.customSections.length === 2);
  assert.equal(parsed.customSections[0]?.title, "Votos");
  assert.equal(parsed.customSections[1]?.title, "Ativos");
});

test("parseStatblock handles PbtA character with signed modifiers without fake D20 modifiers", () => {
  const yaml = `
nome: Scarlet
layout: PbtA
cartilha: A Escolhida
harm: 2
experiencia: 3
atributos:
  - Frio: +2
  - Duro: +1
  - Quente: -1
  - Estranho: 0
movimentos:
  - Destino Inevitável: "Uma vez por sessão, ignore todo dano de um ataque direto."
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Scarlet");
  assert.equal(parsed.subtitle, "A Escolhida");
  assert.ok(parsed.vitals?.some((v) => v.label === "Dano / Harm" && v.value === 2));

  assert.equal(parsed.abilities.length, 4);
  assert.equal(parsed.abilities[0]?.name, "Frio");
  assert.equal(Number(parsed.abilities[0]?.score), 2);
  assert.equal(parsed.abilities[0]?.modifier, undefined, "PbtA signed score must not compute d20Modifier");
  assert.equal(Number(parsed.abilities[1]?.score), 1);
  assert.equal(Number(parsed.abilities[2]?.score), -1);

  assert.ok(parsed.customSections && parsed.customSections.length === 1);
  assert.equal(parsed.customSections[0]?.title, "Movimentos");
});

test("parseStatblock handles Savage Worlds character with dice attributes and SWADE vitals", () => {
  const yaml = `
nome: Jack Colt
layout: Savage Worlds
posto: Veterano
aparar: 6
resistencia: 7
movimento: 6
benas: 3
atributos:
  Agilidade: d8
  Astúcia: d6
  Espírito: d8
  Força: d6
  Vigor: d10
vantagens:
  - Rapidez: Permite descartar e comprar nova carta de iniciativa se menor que 5.
  - Atirador de Elite: +1 em tiros mirando alvos difíceis.
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Jack Colt");
  assert.ok(parsed.vitals?.some((v) => v.label === "Aparar" && v.value === 6));
  assert.ok(parsed.vitals?.some((v) => v.label === "Resistência" && v.value === 7));
  assert.ok(parsed.vitals?.some((v) => v.label === "Pontos de Destino / Benas" && v.value === 3));

  assert.equal(parsed.abilities.length, 5);
  assert.equal(parsed.abilities[0]?.name, "Agilidade");
  assert.equal(parsed.abilities[0]?.score, "d8");
  assert.equal(parsed.abilities[0]?.modifier, undefined);
  assert.equal(parsed.abilities[4]?.name, "Vigor");
  assert.equal(parsed.abilities[4]?.score, "d10");
});

test("parseStatblock handles Daggerheart Adversary format without fake attributes", () => {
  const yaml = `
nome: Drake das Sombras
layout: daggerheart-adversary
tier: Tier 1 Solo
dificuldade: 13
limiares: 7 / 14
pv: 6
estresse: 3
ataques:
  - Mordida Cáustica: "+3 alcance Curto | 2d8+3 físico e ácido contínuo"
  - Garras Dilacerantes: "+2 corpo a corpo | 1d10+4 físico"
experiencias:
  - Caçador Noturno: "+2"
  - Emboscada Silenciosa: "+1"
movimentos_medo:
  - Baforada Tóxica (Ação): "Gaste 1 Medo para expelir ácido em cone de alcance Curto: teste de Agilidade contra DC 13 ou sofre 2d8 de dano."
  - Frenesi Sombrio (Reação): "Gaste 1 Medo quando sofrer dano Severo para contra-atacar imediatamente."
habilidades:
  - Escamas de Obsidiana: "Resistência natural a dano cortante e perfurante."
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Drake das Sombras");
  assert.equal(parsed.subtitle, "Tier 1 Solo");
  assert.equal(parsed.abilities.length, 0); // Adversaries don't have PC attributes!

  assert.ok(parsed.vitals?.some((v) => v.label === "Dificuldade (DC)" && v.value === 13));
  assert.ok(parsed.vitals?.some((v) => v.label === "Limiares de Dano" && v.value === "7 / 14"));
  assert.ok(parsed.vitals?.some((v) => v.label === "Pontos de Vida (PV)" && v.value === 6));
  assert.ok(parsed.vitals?.some((v) => v.label === "Estresse" && v.value === 3));

  assert.ok(parsed.customSections?.some((s) => s.title === "Ataques e Armas" || s.title === "Ataques"));
  assert.ok(parsed.customSections?.some((s) => s.title === "Experiências" || s.title === "Experiencias"));
  assert.ok(parsed.customSections?.some((s) => s.title === "Movimentos de Medo (Fear Moves)"));
  assert.ok(parsed.traits && parsed.traits.length === 1);
});

test("parseStatblock handles Ironsworn Foe with rank, progress track and tactics", () => {
  const yaml = `
nome: Lobo do Pântano
layout: ironsworn-foe
rank: Perigoso (Dangerous)
trilha: "■■□□□□□□□□ (2/10)"
dano: 2 de Dano
impulso: Proteger a alcateia
taticas:
  - Cercar a Presa: "Move-se pelas sombras procurando o flanco mais vulnerável."
  - Mordida no Jarrete: "Derruba o alvo se acertar com sucesso decisivo."
`;

  const parsed = parseStatblock(yaml);
  assert.ok(parsed);
  assert.equal(parsed.name, "Lobo do Pântano");
  assert.ok(parsed.vitals?.some((v) => v.label === "Grau de Desafio / Rank" && v.value === "Perigoso (Dangerous)"));
  assert.ok(parsed.vitals?.some((v) => v.label === "Trilha de Progresso" && v.value === "■■□□□□□□□□ (2/10)"));
  assert.ok(parsed.vitals?.some((v) => v.label === "Dano / Harm" && v.value === "2 de Dano"));
  assert.ok(parsed.customSections?.some((s) => s.title === "Táticas e Comportamento"));
});

test("Verso layouts support full block customization and all 11 block types", () => {
  const customLayout = {
    id: "custom-fantasy",
    name: "Custom Fantasy Layout",
    system: "Homebrew",
    description: "Layout with all block types",
    theme: "classic",
    blocks: [
      { id: "b1", type: "heading", properties: ["name", "nome"] },
      { id: "b2", type: "subheading", properties: ["tipo", "subtitle"] },
      { id: "b3", type: "divider", properties: [] },
      { id: "b4", type: "vitals", properties: ["pv", "ca", "speed"] },
      { id: "b5", type: "abilities", properties: ["stats"], options: { d20Modifiers: true } },
      { id: "b6", type: "saves", properties: ["saves"] },
      { id: "b7", type: "property", properties: ["sentidos", "idiomas", "nd"], title: "Traços Gerais" },
      { id: "b8", type: "traits", properties: ["traits"], title: "Habilidades Especiais" },
      { id: "b9", type: "section", properties: ["ataques"], title: "Ataques de Combate" },
      { id: "b10", type: "table", properties: ["matriz"], title: "Tabela de Poderes" },
      { id: "b11", type: "image", properties: ["token"] },
    ],
  };

  const json = exportLayoutToJson(customLayout);
  assert.ok(json.includes("Custom Fantasy Layout"));
  assert.ok(json.includes("saves"));
  assert.ok(json.includes("property"));
  assert.ok(json.includes("table"));

  const imported = importLayoutFromJson(json);
  assert.ok(imported);
  assert.equal(imported.name, "Custom Fantasy Layout");
  assert.equal(imported.blocks.length, 11);
  assert.equal(imported.blocks[5]?.type, "saves");
  assert.equal(imported.blocks[6]?.type, "property");
  assert.equal(imported.blocks[7]?.type, "traits");
  assert.equal(imported.blocks[9]?.type, "table");
});

test("exportLayoutToYaml and importLayoutFromYaml round-trip statblock templates with text block type", () => {
  const customLayout = {
    id: "custom-tormenta-yaml",
    name: "Ameaça Tormenta20 YAML",
    system: "Tormenta20",
    description: "Template gerado via IA em YAML",
    theme: "classic",
    tags: ["t20", "ameaca"],
    blocks: [
      { id: "b1", type: "heading", properties: ["nome", "name"] },
      { id: "b2", type: "vitals", properties: ["defesa", "pv", "pm"] },
      { id: "b3", type: "abilities", properties: ["atributos"], options: { d20Modifiers: true } },
      { id: "b4", type: "section", title: "Ataques", properties: ["ataques"] },
      { id: "b5", type: "text", title: "Regras Especiais", text: "**Imunidade:** Imune a dano de frio e ácido." },
    ],
  };

  const yamlStr = exportLayoutToYaml(customLayout);
  assert.ok(yamlStr.includes("Ameaça Tormenta20 YAML"));
  assert.ok(yamlStr.includes("Tormenta20"));
  assert.ok(yamlStr.includes("type: text"));
  assert.ok(yamlStr.includes("Regras Especiais"));

  const imported = importLayoutFromYaml(yamlStr);
  assert.ok(imported);
  assert.equal(imported.name, "Ameaça Tormenta20 YAML");
  assert.equal(imported.system, "Tormenta20");
  assert.equal(imported.blocks.length, 5);
  assert.equal(imported.blocks[4]?.type, "text");
  assert.equal(imported.blocks[4]?.title, "Regras Especiais");
  assert.ok(imported.blocks[4]?.text?.includes("Imunidade"));
});


