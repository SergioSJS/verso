// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of Rolai's system profiles in both languages (ADR 0035, ADR
// 0088 item 5). The profiles are written in pt-BR: their outcome ids
// (`strong_hit`, `ruptura_x2`, `milagre_x3`) and their input labels
// ("Perícia", "Dados Escuros") are looked up here; where an id is unknown
// the id itself is shown, so a profile of the player's own still reads.
// English terms follow each source system's own rulebook (Ironsworn,
// Powered by the Apocalypse, Blades in the Dark, Year Zero Engine, World of
// Darkness 5, Trophy, Fate); Infaernum's and Fractal's terms are their
// authors' own, in pt-BR, and are translated plainly.

type Pair = [pt: string, en: string];

const outcome: Record<string, Pair> = {
  // Generic
  success: ["Sucesso", "Success"],
  fail: ["Falha", "Failure"],
  miss: ["Erro", "Miss"],
  tie: ["Empate", "Tie"],
  critical: ["Crítico", "Critical"],
  critical_success: ["Sucesso crítico", "Critical success"],
  critical_failure: ["Falha crítica", "Critical failure"],
  fumble: ["Desastre", "Fumble"],
  extreme_success: ["Sucesso extremo", "Extreme success"],
  hard_success: ["Sucesso difícil", "Hard success"],
  regular_success: ["Sucesso normal", "Regular success"],
  full_success: ["Sucesso total", "Full success"],
  partial_success: ["Sucesso parcial", "Partial success"],
  success_with_style: ["Sucesso com estilo", "Success with style"],
  // Ironsworn, PbtA
  strong_hit: ["Acerto forte", "Strong hit"],
  weak_hit: ["Acerto fraco", "Weak hit"],
  match: ["Coincidência", "Match"],
  // World of Darkness 5
  messy_critical: ["Crítico confuso", "Messy critical"],
  bestial_failure: ["Falha bestial", "Bestial failure"],
  // Shadowrun-style pool
  glitch: ["Falha de sistema", "Glitch"],
  critical_glitch: ["Falha de sistema crítica", "Critical glitch"],
  // Trophy
  trophy_ruina_aumenta: ["A Ruína aumenta", "Ruin rises"],
  // Fractal
  sucesso: ["Sucesso", "Success"],
  falha: ["Falha", "Failure"],
  sucesso_impulso_x2: ["Sucesso com Impulso ×2", "Success with Momentum ×2"],
  sucesso_impulso_x3: ["Sucesso com Impulso ×3", "Success with Momentum ×3"],
  sucesso_impulso_x4: ["Sucesso com Impulso ×4", "Success with Momentum ×4"],
  ruptura_x1: ["Ruptura ×1", "Rupture ×1"],
  ruptura_x2: ["Ruptura ×2", "Rupture ×2"],
  ruptura_x3: ["Ruptura ×3", "Rupture ×3"],
  ruptura_x4: ["Ruptura ×4", "Rupture ×4"],
  // Infaernum
  milagre_x1: ["Milagre ×1", "Miracle ×1"],
  milagre_x2: ["Milagre ×2", "Miracle ×2"],
  milagre_x3: ["Milagre ×3", "Miracle ×3"],
  desgraca_x1: ["Desgraça ×1", "Misfortune ×1"],
  desgraca_x2: ["Desgraça ×2", "Misfortune ×2"],
  desgraca_x3: ["Desgraça ×3", "Misfortune ×3"],
  facanha_x1: ["Façanha ×1", "Feat ×1"],
  facanha_x2: ["Façanha ×2", "Feat ×2"],
  facanha_x3: ["Façanha ×3", "Feat ×3"],
  vislumbre_x1: ["Vislumbre ×1", "Glimpse ×1"],
  vislumbre_x2: ["Vislumbre ×2", "Glimpse ×2"],
  vislumbre_x3: ["Vislumbre ×3", "Glimpse ×3"],
  sim: ["Sim", "Yes"],
  nao: ["Não", "No"],
  // Year Zero Engine
  yze_dano_atributo_x1: ["Dano ao atributo ×1", "Attribute damage ×1"],
  yze_dano_atributo_x2: ["Dano ao atributo ×2", "Attribute damage ×2"],
  yze_dano_atributo_x3: ["Dano ao atributo ×3", "Attribute damage ×3"],
  yze_dano_equipamento_x1: ["Dano ao equipamento ×1", "Gear damage ×1"],
  yze_dano_equipamento_x2: ["Dano ao equipamento ×2", "Gear damage ×2"],
  yze_dano_equipamento_x3: ["Dano ao equipamento ×3", "Gear damage ×3"],
  yze_descontrole: ["Descontrole", "Stress overflow"],
  yze_panico: ["Pânico", "Panic"],
  // Infaernum, Ideias: the verbs
  ignorar: ["Ignorar", "Ignore"],
  descobrir: ["Descobrir", "Discover"],
  comecar: ["Começar", "Begin"],
  bloquear: ["Bloquear", "Block"],
  ganhar: ["Ganhar", "Gain"],
  perseguir: ["Perseguir", "Pursue"],
  julgar: ["Julgar", "Judge"],
  fazer: ["Fazer", "Make"],
  terminar: ["Terminar", "End"],
  vingar: ["Vingar", "Avenge"],
  imitar: ["Imitar", "Imitate"],
  iludir: ["Iludir", "Deceive"],
  aceitar: ["Aceitar", "Accept"],
  ajudar: ["Ajudar", "Help"],
  aumentar: ["Aumentar", "Increase"],
  conhecer: ["Conhecer", "Know"],
  conquistar: ["Conquistar", "Conquer"],
  controlar: ["Controlar", "Control"],
  criar: ["Criar", "Create"],
  curar: ["Curar", "Heal"],
  diminuir: ["Diminuir", "Decrease"],
  emboscar: ["Emboscar", "Ambush"],
  encontrar: ["Encontrar", "Find"],
  esconder: ["Esconder", "Hide"],
  expor: ["Expor", "Expose"],
  guiar: ["Guiar", "Guide"],
  mudar: ["Mudar", "Change"],
  negociar: ["Negociar", "Negotiate"],
  oprimir: ["Oprimir", "Oppress"],
  pacificar: ["Pacificar", "Pacify"],
  pausar: ["Pausar", "Pause"],
  perder: ["Perder", "Lose"],
  planejar: ["Planejar", "Plan"],
  proteger: ["Proteger", "Protect"],
  recusar: ["Recusar", "Refuse"],
  tomar: ["Tomar", "Take"],
  trair: ["Trair", "Betray"],
  // Infaernum, Ideias: the nouns
  alianca: ["Aliança", "Alliance"],
  ambiente: ["Ambiente", "Setting"],
  animal: ["Animal", "Animal"],
  atencao: ["Atenção", "Attention"],
  boato: ["Boato", "Rumor"],
  caido: ["Caído", "Fallen one"],
  caminho: ["Caminho", "Path"],
  cilada: ["Cilada", "Trap"],
  clima: ["Clima", "Weather"],
  confronto: ["Confronto", "Confrontation"],
  doenca: ["Doença", "Illness"],
  dor: ["Dor", "Pain"],
  esperanca: ["Esperança", "Hope"],
  fe: ["Fé", "Faith"],
  ferimento: ["Ferimento", "Wound"],
  ilusao: ["Ilusão", "Illusion"],
  inimigo: ["Inimigo", "Enemy"],
  lar: ["Lar", "Home"],
  medo: ["Medo", "Fear"],
  mentira: ["Mentira", "Lie"],
  milagre: ["Milagre", "Miracle"],
  morte: ["Morte", "Death"],
  negocio: ["Negócio", "Deal"],
  objetivo: ["Objetivo", "Goal"],
  perigo: ["Perigo", "Danger"],
  pista: ["Pista", "Clue"],
  poder: ["Poder", "Power"],
  problema: ["Problema", "Problem"],
  prova: ["Prova", "Proof"],
  raiva: ["Raiva", "Anger"],
  riqueza: ["Riqueza", "Wealth"],
  solidao: ["Solidão", "Loneliness"],
  vazio: ["Vazio", "Emptiness"],
  verdade: ["Verdade", "Truth"],
  viagem: ["Viagem", "Journey"],
  vislumbre: ["Vislumbre", "Glimpse"],
};

// Input labels and select options, looked up by the profile's own (pt-BR)
// text.
const label: Record<string, Pair> = {
  Perícia: ["Perícia", "Skill"],
  Modo: ["Modo", "Mode"],
  Normal: ["Normal", "Normal"],
  Vantagem: ["Vantagem", "Advantage"],
  Desvantagem: ["Desvantagem", "Disadvantage"],
  CD: ["CD", "DC"],
  Modificador: ["Modificador", "Modifier"],
  Dificuldade: ["Dificuldade", "Difficulty"],
  Habilidade: ["Habilidade", "Skill rating"],
  "Tamanho do pool": ["Tamanho do pool", "Pool size"],
  "Número de Fatos": ["Número de Fatos", "Number of Facts"],
  "Vantagem?": ["Vantagem?", "Advantage?"],
  Não: ["Não", "No"],
  "Sim, +1d6": ["Sim, +1d6", "Yes, +1d6"],
  Chance: ["Chance", "Chance"],
  Neutro: ["Neutro", "Even"],
  Provável: ["Provável", "Likely"],
  Improvável: ["Improvável", "Unlikely"],
  Atributo: ["Atributo", "Stat"],
  "Limite (acertos necessários)": ["Limite (acertos necessários)", "Limit (hits needed)"],
  "Valor testado": ["Valor testado", "Value tested"],
  "Dados Claros": ["Dados Claros", "Light dice"],
  "Dados Escuros": ["Dados Escuros", "Dark dice"],
  "Sua Ruína": ["Sua Ruína", "Your Ruin"],
  "Dados regulares": ["Dados regulares", "Regular dice"],
  "Dados de Fome/Ira": ["Dados de Fome/Ira", "Hunger/Rage dice"],
  "Dificuldade (sucessos necessários)": ["Dificuldade (sucessos necessários)", "Difficulty (successes needed)"],
  "Dados no pool": ["Dados no pool", "Dice in the pool"],
  "Sucesso garantido": ["Sucesso garantido", "Banked successes"],
  Base: ["Base", "Base"],
  Estresse: ["Estresse", "Stress"],
  Equipamento: ["Equipamento", "Gear"],
  "1s Base": ["1s Base", "Base 1s"],
  "1s Equip.": ["1s Equip.", "Gear 1s"],
};

// The profiles' own names, by system id, where the English title differs
// from the pt-BR label; the others keep the label (they are system names).
const names: Record<string, string> = {
  d100: "d100 — skill test (BRP/Cthulhu)",
  d20: "d20 — test against a DC",
  fitd: "FitD — Action pool",
  fractal: "Fractal — Risk roll",
  infaernum: "Infaernum — Standard roll (3d6)",
  infaernum_ideias: "Infaernum — Ideas (verb + noun)",
  infaernum_sim_ou_nao: "Infaernum — Yes or No",
  ironsworn: "Ironsworn — Action",
  firelights: "Firelights — Action",
  pool_d6: "d6 pool (Shadowrun)",
  roll_under: "Generic — Roll under",
  wod5: "World of Darkness v5 — Success pool",
  yze: "YZ — Generic pool",
  yze_alien: "YZ — Alien",
  yze_fbl: "YZ — Forbidden Lands / Mutant",
  yze_wdu: "YZ — Walking Dead",
};

export type Lang = "pt" | "en";

const at = (lang: Lang) => (lang === "pt" ? 0 : 1);

/** An outcome id in words: the id itself when it is not one we know. */
export function outcomeWord(id: string, lang: Lang): string {
  return Object.prototype.hasOwnProperty.call(outcome, id) ? outcome[id]![at(lang)] : id;
}

/** An input label or option label of a profile, in the language asked. */
export function labelWord(text: string, lang: Lang): string {
  return Object.prototype.hasOwnProperty.call(label, text) ? label[text]![at(lang)] : text;
}

/** A profile's name; `fallback` is its label in the YAML (pt-BR). */
export function profileName(id: string, fallback: string, lang: Lang): string {
  return lang === "pt" ? fallback : names[id] ?? fallback;
}
