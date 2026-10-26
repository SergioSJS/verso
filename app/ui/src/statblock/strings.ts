// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a statblock card and its layouts say, in both of the interface's
// languages (ADR 0035, ADR 0099 item 10). A test (or a language change that
// reloads the window) swaps them with `setStatblockLang`.

import { LANG } from "../strings";
import type { Label } from "./model";

export type StatblockLang = "pt" | "en";

const pt = {
  unnamed: "Sem nome",
  card: "Ficha",
  viewSource: "Ver código",
  viewCard: "Ver ficha",
  toggleTitle: "Alternar entre a ficha e o código",
  layoutBadge: (name: string) => `Layout: ${name}. Abre os layouts de ficha.`,
  tooBig: (kb: number) => `Esta ficha passa de ${kb} KB: o código é mostrado como está, sem a ficha.`,
  invalid: "O YAML desta ficha não pôde ser lido. O código é mostrado como está.",
  diceSlow: "As regras de dados deste layout estão lentas demais: foram puladas em parte desta ficha.",
  invalidKept: "O YAML desta ficha não pôde ser lido agora: a ficha mostra a última versão que leu.",
  notMap: "Esta ficha precisa ser um mapa de chaves e valores (YAML).",
  failed: "Não foi possível montar esta ficha. O código é mostrado como está.",
  unknownLayout: (name: string) => `Layout "${name}" não encontrado: a ficha usa o layout padrão.`,
  layoutProblems: (n: number) => (n === 1 ? "O layout tem 1 problema; a parte com problema foi deixada de fora." : `O layout tem ${n} problemas; as partes com problema foram deixadas de fora.`),
  scores: "Valores",
  modifier: "Modificador",
  more: (n: number) => `… e mais ${n} (veja o código)`,
  roll: (n: string) => `Rolar ${n}`,
  rollFor: (n: string, what: string) => `Rolar ${n} para ${what}`,
  // Trackers.
  tracker: (label: string, cur: number, max: number) => `${label}: ${cur} de ${max}`,
  box: (label: string, n: number, max: number) => `${label}: marcar ${n} de ${max}`,
  less: (label: string) => `${label}: menos 1`,
  more1: (label: string) => `${label}: mais 1`,
  trackerKeys: "Setas mudam o valor; Home zera, End enche.",
  badValue: (label: string, raw: string, max: number) => `${label}: "${raw}" não é um número de 0 a ${max}.`,
  repair: (n: number) => `Corrigir para ${n}`,
  saved: (label: string, n: number | string) => `${label}: ${n}. Gravado na nota.`,
  flagOn: (label: string, item: string) => `${item}: ${label}`,
  flagAria: (label: string, item: string) => `${label}: ${item}`,
  readOnlyCard: "Só leitura: a ficha não grava nesta nota.",
  refusal: {
    readOnly: "Nada gravado: esta nota é só leitura.",
    conflict: "Nada gravado: a nota mudou no disco; resolva o conflito primeiro.",
    readerView: "Nada gravado: a vista de leitor mostra outro texto. Saia dela para marcar.",
    stale: "Nada gravado: a nota mudou desde que foi desenhada. Tente de novo.",
    moved: "Nada gravado: a ficha não está mais onde estava na nota.",
    nested: "Nada gravado: esta ficha está dentro de uma citação ou lista; edite o código.",
    shape: "Nada gravado: o YAML desta ficha não deixa trocar só esse valor.",
    unchanged: "O valor já era esse.",
  },
  // Inheritance (`monster:` and `extends:`, ADR 0099 item 1).
  basedOn: (name: string) => `baseado em ${name}`,
  basedOnLink: (name: string) => `Abrir a nota-base: ${name}`,
  baseMissing: (ref: string) => `Base "${ref}" não encontrada: a ficha mostra só as chaves deste bloco.`,
  baseCycle: (ref: string) => `Herança em círculo em "${ref}": parada ali.`,
  baseDepth: (ref: string) => `Herança funda demais (mais de 8 níveis) em "${ref}": parada ali.`,
  basePending: (ref: string) => `Lendo a base "${ref}"…`,
  // Roll blocks.
  rollWith: (profile: string) => `Rolar (${profile})`,
  rollAsk: "Valores da rolagem",
  noProfile: (id: string) => `Perfil de rolagem "${id}" não existe.`,
  rollFailed: (why: string) => `A rolagem não foi feita: ${why}`,
  rollLocal: "Rolado nesta janela; não é gravado na nota.",
  // Import and the store.
  importDropped: (what: string) => `Deixado de fora (era código): ${what}`,
  importConverted: (what: string) => `Convertido: ${what}`,
  importNotLayout: 'Este JSON não é um layout (precisa de "name" e "blocks").',
  importTooBig: (kb: number) => `O layout passa de ${kb} KB.`,
  importBadJson: "Este texto não é um JSON válido.",
  copy: "(cópia)",
  newLayout: "Novo layout",
  noFolder: "Nenhuma pasta aberta: os layouts da pasta não podem ser gravados.",
  writeFailed: (why: string) => `O layout não foi gravado: ${why}`,
  builtIn: "Embutido",
  inFolder: "Da pasta",
  onDevice: "Neste aparelho (de uma versão anterior)",
  problem: {
    notMap: "não é um mapa",
    version: (v: string) => `versão ${v} desconhecida`,
    id: "id inválido",
    name: "sem nome",
    blockType: (t: string) => `tipo de bloco "${t}" desconhecido`,
    block: "bloco inválido",
    tooMany: "blocos demais",
    tooDeep: "grupos aninhados demais",
    pattern: (why: string) => `padrão de dados recusado (${why})`,
    template: "modelo de dados inválido",
    source: "fonte inválida (precisa de nome e endereço https)",
    expression: (why: string) => `expressão de modificador recusada (${why})`,
    color: (k: string) => `cor "${k}" inválida`,
    font: "fonte desconhecida",
    profile: (id: string) => `perfil "${id}" desconhecido`,
    predicate: "teste inválido",
    tracker: "contador sem chave",
    key: "chave inválida",
    band: "linha da tabela de modificador inválida (mín ≤ máx, números inteiros)",
  },
  page: {
    layoutsTitle: "Layouts de ficha",
    layoutsDesc: "Os embutidos vêm com o Verso e não mudam; os da pasta ficam em .verso/layouts e todos que abrem a pasta veem igual. Um bloco sem layout: usa o primeiro.",
    importTitle: "Importar layout",
    importDesc: "Cole o JSON de um layout do Fantasy Statblocks ou do Verso. O que era código (JavaScript) fica de fora, e a lista diz o quê.",
    importButton: "Importar JSON…",
    paste: "Cole o JSON do layout:",
    imported: (name: string) => `Layout "${name}" importado para a pasta.`,
    duplicate: "Duplicar para a pasta",
    duplicated: (name: string) => `Cópia criada na pasta: ${name}.`,
    exportJson: "Copiar JSON",
    copied: "Copiado",
    copyFailed: "Não foi possível copiar.",
    edit: "Editar",
    editCopies: "Um layout embutido não muda: Editar cria uma cópia na pasta.",
    newLayout: "+ Novo layout",
    editLayout: "Editar este layout",
    editorComing: "O editor de layouts está sendo refeito: árvore de blocos ao lado da ficha, edição no lugar e desfazer. Até lá, exporte o JSON, edite e importe de volta.",
    remove: "Excluir",
    legacyTitle: (n: number) => (n === 1 ? "1 layout deste aparelho (de uma versão anterior)" : `${n} layouts deste aparelho (de uma versão anterior)`),
    legacyDesc: "Ficaram guardados neste navegador. Nada foi gravado na pasta; escolha o que fazer.",
    legacyMove: "Mover para esta pasta",
    legacyKeep: "Manter só neste aparelho",
    legacyDiscard: "Descartar",
    legacyDiscardAsk: (n: number) => `Descartar ${n === 1 ? "1 layout" : `${n} layouts`} deste aparelho? Eles não serão gravados na pasta e não poderão ser recuperados.`,
    legacyResult: (name: string, newId: string | undefined, why: string | undefined) => (why === undefined ? `${name}: movido${newId ? ` (${newId})` : ""}` : `${name}: não foi movido (${why}); continua neste aparelho`),
    legacyDiscarded: (n: number) => (n === 1 ? "1 layout descartado." : `${n} layouts descartados.`),
    removeAsk: (name: string) => `Excluir o layout "${name}" da pasta? Ele vai para a lixeira da pasta, se houver.`,
    removed: (name: string) => `Layout "${name}" excluído.`,
    problems: (n: number) => (n === 1 ? "1 problema no arquivo" : `${n} problemas no arquivo`),
    defaultPill: "Padrão",
    ok: "OK",
    cancel: "Cancelar",
  },
};

export type StatblockText = typeof pt;

const en: StatblockText = {
  unnamed: "Unnamed",
  card: "Statblock",
  viewSource: "View source",
  viewCard: "View card",
  toggleTitle: "Switch between the card and its source",
  layoutBadge: (name) => `Layout: ${name}. Opens the statblock layouts.`,
  tooBig: (kb) => `This statblock is over ${kb} KB: its source is shown as written, without the card.`,
  invalid: "This statblock's YAML could not be read. Its source is shown as written.",
  diceSlow: "This layout's dice rules are too slow: they were skipped for part of this card.",
  invalidKept: "This statblock's YAML cannot be read right now: the card shows the last version it read.",
  notMap: "A statblock must be a map of keys and values (YAML).",
  failed: "This statblock could not be drawn. Its source is shown as written.",
  unknownLayout: (name) => `Layout "${name}" not found: the card uses the default layout.`,
  layoutProblems: (n) => (n === 1 ? "The layout has 1 problem; the part with it was left out." : `The layout has ${n} problems; the parts with them were left out.`),
  scores: "Scores",
  modifier: "Modifier",
  more: (n) => `… and ${n} more (see the source)`,
  roll: (n) => `Roll ${n}`,
  rollFor: (n, what) => `Roll ${n} for ${what}`,
  tracker: (label, cur, max) => `${label}: ${cur} of ${max}`,
  box: (label, n, max) => `${label}: mark ${n} of ${max}`,
  less: (label) => `${label}: one less`,
  more1: (label) => `${label}: one more`,
  trackerKeys: "Arrow keys change the value; Home empties, End fills.",
  badValue: (label, raw, max) => `${label}: "${raw}" is not a number from 0 to ${max}.`,
  repair: (n) => `Repair to ${n}`,
  saved: (label, n) => `${label}: ${n}. Saved in the note.`,
  flagOn: (label, item) => `${item}: ${label}`,
  flagAria: (label, item) => `${label}: ${item}`,
  readOnlyCard: "Read-only: the card does not write into this note.",
  refusal: {
    readOnly: "Nothing saved: this note is read-only.",
    conflict: "Nothing saved: the note changed on disk; resolve the conflict first.",
    readerView: "Nothing saved: the reader's view shows other text. Leave it to mark.",
    stale: "Nothing saved: the note changed since it was drawn. Try again.",
    moved: "Nothing saved: the statblock is no longer where it was in the note.",
    nested: "Nothing saved: this statblock is inside a quote or a list; edit its source.",
    shape: "Nothing saved: this statblock's YAML does not let that one value change alone.",
    unchanged: "The value was already that.",
  },
  basedOn: (name) => `based on ${name}`,
  basedOnLink: (name) => `Open the base note: ${name}`,
  baseMissing: (ref) => `Base "${ref}" not found: the card shows only this block's keys.`,
  baseCycle: (ref) => `Circular inheritance at "${ref}": stopped there.`,
  baseDepth: (ref) => `Inheritance too deep (over 8 levels) at "${ref}": stopped there.`,
  basePending: (ref) => `Reading the base "${ref}"…`,
  rollWith: (profile) => `Roll (${profile})`,
  rollAsk: "Roll values",
  noProfile: (id) => `There is no roll profile "${id}".`,
  rollFailed: (why) => `The roll was not made: ${why}`,
  rollLocal: "Rolled in this window; not written in the note.",
  importDropped: (what) => `Left out (it was code): ${what}`,
  importConverted: (what) => `Converted: ${what}`,
  importNotLayout: 'This JSON is not a layout (it needs "name" and "blocks").',
  importTooBig: (kb) => `The layout is over ${kb} KB.`,
  importBadJson: "This text is not valid JSON.",
  copy: "(copy)",
  newLayout: "New layout",
  noFolder: "No folder is open: folder layouts cannot be saved.",
  writeFailed: (why) => `The layout was not saved: ${why}`,
  builtIn: "Built in",
  inFolder: "In the folder",
  onDevice: "On this device (from an earlier build)",
  problem: {
    notMap: "not a map",
    version: (v) => `unknown version ${v}`,
    id: "invalid id",
    name: "no name",
    blockType: (t) => `unknown block type "${t}"`,
    block: "invalid block",
    tooMany: "too many blocks",
    tooDeep: "groups nested too deep",
    pattern: (why) => `dice pattern refused (${why})`,
    template: "invalid dice template",
    source: "invalid source (needs a label and an https address)",
    expression: (why) => `modifier expression refused (${why})`,
    color: (k) => `invalid colour "${k}"`,
    font: "unknown font",
    profile: (id) => `unknown profile "${id}"`,
    predicate: "invalid test",
    tracker: "tracker without a key",
    key: "invalid key",
    band: "invalid modifier table row (min ≤ max, whole numbers)",
  },
  page: {
    layoutsTitle: "Statblock layouts",
    layoutsDesc: "Built-in layouts ship with Verso and do not change; the folder's live in .verso/layouts and everyone who opens the folder sees the same. A block with no layout: uses the first.",
    importTitle: "Import a layout",
    importDesc: "Paste the JSON of a Fantasy Statblocks or Verso layout. What was code (JavaScript) is left out, and the list says what.",
    importButton: "Import JSON…",
    paste: "Paste the layout JSON:",
    imported: (name) => `Layout "${name}" imported into the folder.`,
    duplicate: "Duplicate into the folder",
    duplicated: (name) => `Copy made in the folder: ${name}.`,
    exportJson: "Copy JSON",
    copied: "Copied",
    copyFailed: "Could not copy.",
    edit: "Edit",
    editCopies: "A built-in layout does not change: Edit makes a copy in the folder.",
    newLayout: "+ New layout",
    editLayout: "Edit this layout",
    editorComing: "The layout editor is being rebuilt: the block tree beside the card, editing in place, and undo. Until then, export the JSON, edit it, and import it back.",
    remove: "Delete",
    legacyTitle: (n) => (n === 1 ? "1 layout from this device (an earlier build)" : `${n} layouts from this device (an earlier build)`),
    legacyDesc: "They were kept in this browser. Nothing was written to the folder; choose what to do.",
    legacyMove: "Move into this folder",
    legacyKeep: "Keep on this device only",
    legacyDiscard: "Discard",
    legacyDiscardAsk: (n) => `Discard ${n === 1 ? "1 layout" : `${n} layouts`} from this device? They will not be written to the folder and cannot be recovered.`,
    legacyResult: (name, newId, why) => (why === undefined ? `${name}: moved${newId ? ` (${newId})` : ""}` : `${name}: not moved (${why}); still on this device`),
    legacyDiscarded: (n) => (n === 1 ? "1 layout discarded." : `${n} layouts discarded.`),
    removeAsk: (name) => `Delete the layout "${name}" from the folder? It goes to the folder's trash, if it has one.`,
    removed: (name) => `Layout "${name}" deleted.`,
    problems: (n) => (n === 1 ? "1 problem in the file" : `${n} problems in the file`),
    defaultPill: "Default",
    ok: "OK",
    cancel: "Cancel",
  },
};

const langOf = (l: string): StatblockLang => (l.toLowerCase().startsWith("pt") ? "pt" : "en");
let lang: StatblockLang = langOf(LANG);
export let S: StatblockText = lang === "pt" ? pt : en;

const listeners: ((l: StatblockLang) => void)[] = [];

/** The language the cards speak (the interface's, unless a test says
 *  otherwise). */
export function setStatblockLang(next: string): void {
  lang = langOf(next);
  S = lang === "pt" ? pt : en;
  for (const f of listeners) f(lang);
}
export function onStatblockLang(f: (l: StatblockLang) => void): void {
  listeners.push(f);
}
export function statblockLang(): StatblockLang {
  return lang;
}

/** A label in the cards' language, the other one when it has only that,
 *  `fallback` when it has neither. */
export function word(label: Label | undefined, fallback = ""): string {
  if (!label) return fallback;
  const mine = lang === "pt" ? label.pt : label.en;
  const other = lang === "pt" ? label.en : label.pt;
  return (mine && mine.trim()) || (other && other.trim()) || fallback;
}
