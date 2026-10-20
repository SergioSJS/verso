// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of the four built-in oracle tables, in both languages
// (ADR 0035, ADR 0102 item 6). One language is chosen here, once.

import { isPt } from "./strings";

interface TableWords {
  name: string;
  desc: string;
  entries: readonly string[];
}

const pt: Record<string, TableWords> = {
  twists: {
    name: "Reviravoltas na Trama",
    desc: "Eventos inesperados que alteram o rumo da narrativa",
    entries: [
      "Um aliado de confiança se revela um agente duplo ou tem uma lealdade secreta.",
      "Um recurso vital (chave, mapa, suprimento) é roubado, danificado ou perdido.",
      "Uma força rival ou facção hostil chega exatamente no pior momento possível.",
      "Uma revelação do passado altera o significado de toda a missão atual.",
      "O tempo para agir encolhe drasticamente por causa de um perigo iminente.",
      "A ameaça visível era apenas uma distração; o perigo real vem de outra direção.",
      "Um segredo comprometedor sobre o protagonista ou seu grupo vem à tona.",
      "O objetivo final foi movido, destruído ou já está nas mãos de outro.",
    ],
  },
  complications: {
    name: "Complicações & Perigos",
    desc: "Obstáculos imediatos e dilemas em cena",
    entries: [
      "O terreno cede ou se torna perigoso (desabamento, chamas, lodo profundo).",
      "Testemunhas inocentes surgem no meio do fogo cruzado.",
      "Um equipamento ou arma essencial sofre avaria crítica.",
      "Um dilema moral urgente força uma escolha entre salvar alguém ou cumprir o objetivo.",
      "Barulho excessivo alerta guardas ou predadores na vizinhança.",
      "Condições ambientais extremas anulam a visibilidade ou a audição.",
      "Um rastro evidente é deixado para trás, atraindo perseguidores.",
      "Um dos presentes entra em choque, pânico ou age de forma impulsiva.",
    ],
  },
  atmosphere: {
    name: "Clima & Atmosfera",
    desc: "Sensações sensoriais e clima para ambientação",
    entries: [
      "Névoa espessa e gélida que abafa todos os sons distantes.",
      "Tempestade torrencial com trovões estrondosos e vento cortante.",
      "Calor sufocante e ar empoeirado, pesado como chumbo.",
      "Chuva fina e melancólica sob um céu uniformemente cinzento.",
      "Silêncio sepulcral e desconfortável, onde até o bater do coração parece alto.",
      "Noite límpida com lua anormalmente pálida e sombras alongadas.",
      "Cheiro marcante de ozônio, terra queimada ou enxofre no ar.",
      "Luz dourada do crepúsculo projetando feixes oblíquos através de frestas.",
    ],
  },
  npc_intent: {
    name: "NPC: Disposição & Motivo",
    desc: "Atitude e intenção oculta de personagens encontrados",
    entries: [
      "Hostil e desconfiado, buscando um pretexto para expulsar ou atacar.",
      "Aparentemente polido e cortês, mas calculando como tirar proveito financeiro.",
      "Desesperado por proteção ou comida, pronto a prometer favores impossíveis.",
      "Pragmático e frio; só age se houver pagamento imediato e sem riscos.",
      "Aterrorizado e paranoico, acreditando que o grupo veio para silenciá-lo.",
      "Obstinado ou fanático por uma causa, incapaz de aceitar concessões.",
      "Curioso e tagarela, ansioso para trocar fofocas e rumores perigosos.",
      "Cansado do conflito, querendo apenas evitar problemas e ir embora em paz.",
    ],
  },
};

const en: Record<string, TableWords> = {
  twists: {
    name: "Plot Twists",
    desc: "Unexpected events altering the narrative direction",
    entries: [
      "A trusted ally is revealed to have a hidden motive or second loyalty.",
      "A vital resource (key, map, supply) is stolen, broken, or lost.",
      "A rival faction arrives precisely at the worst possible moment.",
      "A revelation from the past completely upends the current mission.",
      "The time to act shrinks drastically due to an imminent disaster.",
      "The obvious threat was just a decoy; the real danger lurks elsewhere.",
      "A compromising secret about the party is suddenly exposed.",
      "The final objective was moved, destroyed, or claimed by someone else.",
    ],
  },
  complications: {
    name: "Hazards & Complications",
    desc: "Immediate scene obstacles and dilemmas",
    entries: [
      "The terrain collapses or turns treacherous (fire, cave-in, deep mud).",
      "Innocent bystanders stumble into the danger zone.",
      "Essential equipment or weaponry suffers critical failure.",
      "An urgent moral dilemma forces a choice between duty and compassion.",
      "Loud noise alerts nearby patrols or territorial predators.",
      "Harsh environmental conditions severely impair vision and sound.",
      "An unmistakable trail is left behind, inviting pursuit.",
      "Someone present panics, freezes, or takes an impulsive reckless action.",
    ],
  },
  atmosphere: {
    name: "Weather & Atmosphere",
    desc: "Sensory ambiance and weather for immersion",
    entries: [
      "Thick, chilling mist that muffles every distant sound.",
      "Torrential thunderstorm with deafening thunder and whipping winds.",
      "Suffocating heat and dusty, still air heavy as lead.",
      "Melancholic drizzle under an unbroken gray sky.",
      "Uncanny, tomb-like stillness where even heartbeats feel audible.",
      "Crystal-clear night with an eerie, swollen moon casting long shadows.",
      "Pungent scent of ozone, scorched earth, or sulfur lingering in the breeze.",
      "Golden dusk light piercing through gaps in narrow, dramatic beams.",
    ],
  },
  npc_intent: {
    name: "NPC: Motive & Disposition",
    desc: "Attitude and hidden motives of encountered NPCs",
    entries: [
      "Hostile and suspicious, looking for an excuse to drive outsiders off.",
      "Courteous and polite, while subtly assessing how to exploit the group.",
      "Desperate for food or shelter, ready to promise impossible favors.",
      "Coldly pragmatic; only cooperates for immediate, risk-free payment.",
      "Terrified and paranoid, convinced the party has come to silence them.",
      "Obstinate or fanatical, completely unwilling to compromise.",
      "Curious and gossipy, eager to trade valuable or perilous rumors.",
      "Weary and disillusioned, wanting only to avoid trouble and leave peacefully.",
    ],
  },
};

/** The words of a built-in table in the window's language. */
export function builtinTableWords(id: string): TableWords {
  const words = (isPt ? pt : en)[id];
  if (!words) throw new Error(`no words for the built-in oracle table ${id}`);
  return words;
}
