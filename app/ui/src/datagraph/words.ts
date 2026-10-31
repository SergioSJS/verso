// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the data diagram says (ADR 0106, ADR 0035): pt-BR and English.

import { LANG } from "../strings";
import { type Shape } from "./model";

type Words = {
  text: string;
  diagram: string;
  viewAs: string;
  viewAsDiagram: string;
  diagramOf: (name: string) => string;
  diagramOfBlock: (note: string) => string;
  loading: string;
  loadFailed: string;
  searchPlaceholder: string;
  searchLabel: string;
  matchCount: (i: number, n: number, more: boolean) => string;
  noMatch: string;
  next: string;
  prev: string;
  foldAll: string;
  unfoldAll: string;
  unfoldTo: string;
  level: (n: number) => string;
  levelMenu: string;
  direction: string;
  leftToRight: string;
  topToBottom: string;
  arrange: string;
  arranged: string;
  fit: string;
  zoomIn: string;
  zoomOut: string;
  saveBoard: string;
  fold: string;
  unfold: string;
  copyPath: string;
  copyValue: string;
  copiedPath: (p: string) => string;
  copiedValue: string;
  showInText: string;
  showAll: string;
  showMore: (n: number) => string;
  showAllTitle: string;
  close: string;
  members: (shape: Shape, n: number) => string;
  emptyBox: string;
  empty: string;
  /** A parser's message in this language (the YAML library's own stay as it wrote them). */
  parseError: (message: string) => string;
  errorLine: (message: string) => string;
  errorGo: string;
  staleNote: string;
  tooBig: (mb: number) => string;
  tooBigBlock: string;
  tooMany: string;
  boardTooMany: (n: number, max: number) => string;
  hint: string;
  hintTouch: string;
  hintShort: string;
  hintDismiss: string;
  hintShow: string;
  searchOpen: string;
  searchClose: string;
  moreActions: string;
  boxLabel: (label: string, level: number) => string;
  rootLabel: string;
  aliasTo: (name: string) => string;
  moved: (name: string) => string;
  boardTitle: string;
  boardName: string;
  boardWhere: string;
  boardPreview: (boxes: number, lines: number) => string;
  boardCreate: string;
  boardCancel: string;
  boardExists: string;
  boardDone: (path: string) => string;
  boardNothing: string;
  readOnlyNote: string;
  jumpText: string;
  unfoldedTo: (path: string) => string;
};

const ERRORS_PT: Record<string, string> = {
  "A quoted cell is never closed": "Uma célula entre aspas nunca é fechada",
  "The file is empty": "O arquivo está vazio",
  "A comment is never closed": "Um comentário nunca é fechado",
  "A string is never closed": "Um texto entre aspas nunca é fechado",
  "A string runs past the end of its line": "Um texto entre aspas passa do fim da linha",
  "A string has a bad escape": "Um texto tem uma sequência de escape inválida",
  "A bad \\u escape in a string": "Um texto tem um escape \\u inválido",
  "The text ends before the value is closed": "O texto termina antes de o valor ser fechado",
  "There is no value": "Não há nenhum valor",
  "A comma with nothing after it": "Uma vírgula sem nada depois",
  "A key must be a string in quotes": "Uma chave precisa ser um texto entre aspas",
  'A ":" is missing after the key': 'Falta ":" depois da chave',
  'A "=" is expected after the key': 'Falta "=" depois da chave',
  "A key has no value": "Uma chave está sem valor",
  "A key is expected here": "Uma chave é esperada aqui",
  "A value is expected here": "Um valor é esperado aqui",
  "There is more text after the value": "Há mais texto depois do valor",
  "Something follows the value on its line": "Algo vem depois do valor, na mesma linha",
  'A "," or "]" is expected': 'Era esperado "," ou "]"',
  'A "," or "}" is expected': 'Era esperado "," ou "}"',
  "Text outside the root element": "Texto fora do elemento raiz",
  "A CDATA section is never closed": "Uma seção CDATA nunca é fechada",
  "A processing instruction is never closed": "Uma instrução de processamento nunca é fechada",
  "A declaration is never closed": "Uma declaração nunca é fechada",
  "A closing tag is never closed": "Uma marca de fechamento nunca é fechada",
  "A tag has no name": "Uma marca está sem nome",
  "There is more than one root element": "Há mais de um elemento raiz",
  "An attribute is expected here": "Um atributo é esperado aqui",
  "An attribute value is never closed": "O valor de um atributo nunca é fechado",
  "There is no element": "Não há nenhum elemento",
  "The YAML nests too deeply to draw": "O YAML tem aninhamento fundo demais para desenhar",
  "Not YAML": "Não é YAML",
};

const PATTERNS_PT: [RegExp, string][] = [
  [/^Unexpected closing tag <\/(.*)>$/s, "Marca de fechamento inesperada </$1>"],
  [/^Unexpected "(.*)"$/s, 'Inesperado "$1"'],
  [/^"(.*)" is an empty array$/s, '"$1" é uma lista vazia'],
  [/^A "(.*)" is expected$/s, 'Era esperado "$1"'],
  [/^<\/(.*)> closes <(.*)>$/s, "</$1> fecha <$2>"],
  [/^The tag <(.*)> is never closed$/s, "A marca <$1> nunca é fechada"],
  [/^The attribute (.*) has no value$/s, "O atributo $1 está sem valor"],
  [/^The value of (.*) must be in quotes$/s, "O valor de $1 precisa estar entre aspas"],
  [/^<(.*)> is never closed$/s, "<$1> nunca é fechado"],
];

/** The parsers write their messages in English; in pt-BR they are told in pt-BR (the YAML library's own are not ours to translate). */
export function parseErrorPt(message: string): string {
  const exact = ERRORS_PT[message];
  if (exact !== undefined) return exact;
  for (const [re, to] of PATTERNS_PT) if (re.test(message)) return message.replace(re, to);
  return message;
}

const pt: Words = {
  text: "Texto",
  diagram: "Diagrama",
  viewAs: "Ver como",
  viewAsDiagram: "Ver como diagrama",
  diagramOf: (name) => `Diagrama de ${name}`,
  diagramOfBlock: (note) => `Diagrama de um bloco de ${note}`,
  loading: "Carregando diagrama…",
  loadFailed: "Não foi possível carregar o diagrama. Feche a aba e abra de novo.",
  searchPlaceholder: "Buscar nos dados",
  searchLabel: "Buscar nos dados (chaves e valores)",
  matchCount: (i, n, more) => (n === 0 ? "Nada encontrado" : `${i} de ${n}${more ? "+" : ""}`),
  noMatch: "Nada encontrado",
  next: "Próximo resultado",
  prev: "Resultado anterior",
  foldAll: "Recolher tudo",
  unfoldAll: "Expandir tudo",
  unfoldTo: "Expandir até o nível",
  level: (n) => `Nível ${n}`,
  levelMenu: "Expandir até o nível…",
  direction: "Direção",
  leftToRight: "Da esquerda para a direita",
  topToBottom: "De cima para baixo",
  arrange: "Arrumar de novo",
  arranged: "Diagrama arrumado de novo: movimentos e dobras descartados.",
  fit: "Ajustar à tela",
  zoomIn: "Aproximar",
  zoomOut: "Afastar",
  saveBoard: "Salvar como board…",
  fold: "Recolher",
  unfold: "Expandir",
  copyPath: "Copiar caminho",
  copyValue: "Copiar valor",
  copiedPath: (p) => `Caminho copiado: ${p}`,
  copiedValue: "Valor copiado.",
  showInText: "Mostrar no texto",
  showAll: "Mostrar tudo",
  showMore: (n) => `Mostrar mais (${n})`,
  showAllTitle: "Valor completo",
  close: "Fechar",
  members: (shape, n) => {
    if (shape === "array") return n === 1 ? "1 item" : `${n} itens`;
    if (shape === "element") return n === 1 ? "1 campo" : `${n} campos`;
    return n === 1 ? "1 chave" : `${n} chaves`;
  },
  emptyBox: "vazio",
  empty: "Nada para desenhar.",
  parseError: parseErrorPt,
  errorLine: (m) => `O texto não é válido: ${parseErrorPt(m)}`,
  errorGo: "Ir ao erro",
  staleNote: "Mostrando o último diagrama válido.",
  tooBig: (mb) => `Este arquivo tem ${mb} MB, mais que os 20 MB que o diagrama aceita. Só o texto está disponível.`,
  tooBigBlock: "Este bloco é grande demais para o diagrama.",
  tooMany: "Este arquivo tem caixas demais para desenhar (mais de 200 mil); veja como texto.",
  boardTooMany: (n, max) => `O diagrama tem ${n} caixas; um board aceita até ${max}. Dobre ramos do diagrama para ter menos caixas visíveis e tente de novo.`,
  hint: "Arraste uma caixa pelo título para movê-la com o que está abaixo; Alt arrasta só a caixa. Setas percorrem a árvore, Enter dobra, Alt com setas move (com Shift, só a caixa), T vai ao texto.",
  hintTouch: "Arraste uma caixa pelo título para movê-la. Dois dedos aproximam e movem o diagrama. Toque na seta da caixa para dobrar.",
  hintShort: "Arraste pelo título para mover; dois dedos aproximam.",
  hintDismiss: "Dispensar a dica",
  hintShow: "Dicas de toque",
  searchOpen: "Buscar",
  searchClose: "Fechar a busca",
  moreActions: "Mais ações do diagrama",
  boxLabel: (label, level) => `${label === "" ? "raiz" : label}, nível ${level}`,
  rootLabel: "raiz",
  aliasTo: (name) => `aponta para ${name}`,
  moved: (name) => `${name} movida`,
  boardTitle: "Salvar o diagrama como board",
  boardName: "Nome do board",
  boardWhere: "Pasta",
  boardPreview: (boxes, lines) => `O board terá ${boxes} cartões de texto e ${lines} linhas, como estão dispostos agora. Os dados do arquivo não mudam.`,
  boardCreate: "Criar board",
  boardCancel: "Cancelar",
  boardExists: "Já existe um arquivo com esse nome.",
  boardDone: (p) => `Board criado: ${p}`,
  boardNothing: "Não há caixas visíveis para salvar.",
  readOnlyNote: "O diagrama só mostra; para mudar os dados, edite o texto.",
  jumpText: "Ir ao texto",
  unfoldedTo: (p) => `Aberto até ${p}`,
};

const en: Words = {
  text: "Text",
  diagram: "Diagram",
  viewAs: "View as",
  viewAsDiagram: "View as diagram",
  diagramOf: (name) => `Diagram of ${name}`,
  diagramOfBlock: (note) => `Diagram of a block in ${note}`,
  loading: "Loading diagram…",
  loadFailed: "The diagram could not be loaded. Close the tab and open it again.",
  searchPlaceholder: "Search the data",
  searchLabel: "Search the data (keys and values)",
  matchCount: (i, n, more) => (n === 0 ? "No match" : `${i} of ${n}${more ? "+" : ""}`),
  noMatch: "No match",
  next: "Next match",
  prev: "Previous match",
  foldAll: "Fold all",
  unfoldAll: "Unfold all",
  unfoldTo: "Unfold to level",
  level: (n) => `Level ${n}`,
  levelMenu: "Unfold to level…",
  direction: "Direction",
  leftToRight: "Left to right",
  topToBottom: "Top to bottom",
  arrange: "Arrange again",
  arranged: "Diagram arranged again: moves and folds dropped.",
  fit: "Fit to window",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  saveBoard: "Save as board…",
  fold: "Fold",
  unfold: "Unfold",
  copyPath: "Copy path",
  copyValue: "Copy value",
  copiedPath: (p) => `Path copied: ${p}`,
  copiedValue: "Value copied.",
  showInText: "Show in the text",
  showAll: "Show all",
  showMore: (n) => `Show more (${n})`,
  showAllTitle: "Full value",
  close: "Close",
  members: (shape, n) => {
    if (shape === "array") return n === 1 ? "1 item" : `${n} items`;
    if (shape === "element") return n === 1 ? "1 field" : `${n} fields`;
    return n === 1 ? "1 key" : `${n} keys`;
  },
  emptyBox: "empty",
  empty: "Nothing to draw.",
  parseError: (m) => m,
  errorLine: (m) => `The text is not valid: ${m}`,
  errorGo: "Go to the error",
  staleNote: "Showing the last valid diagram.",
  tooBig: (mb) => `This file is ${mb} MB, past the 20 MB the diagram takes. Only the text is available.`,
  tooBigBlock: "This block is too big for the diagram.",
  tooMany: "This file has too many boxes to draw (over 200 thousand); see it as text.",
  boardTooMany: (n, max) => `The diagram has ${n} boxes; a board takes up to ${max}. Fold branches of the diagram to show fewer boxes and try again.`,
  hint: "Drag a box by its title to move it with what hangs under it; Alt drags the box alone. Arrows walk the tree, Enter folds, Alt with arrows moves (with Shift, the box alone), T goes to the text.",
  hintTouch: "Drag a box by its title to move it. Two fingers zoom and move the diagram. Tap a box's arrow to fold it.",
  hintShort: "Drag by the title to move; two fingers zoom.",
  hintDismiss: "Dismiss the tip",
  hintShow: "Touch tips",
  searchOpen: "Search",
  searchClose: "Close search",
  moreActions: "More diagram actions",
  boxLabel: (label, level) => `${label === "" ? "root" : label}, level ${level}`,
  rootLabel: "root",
  aliasTo: (name) => `points to ${name}`,
  moved: (name) => `${name} moved`,
  boardTitle: "Save the diagram as a board",
  boardName: "Board name",
  boardWhere: "Folder",
  boardPreview: (boxes, lines) => `The board will have ${boxes} text cards and ${lines} lines, as they are arranged now. The file's data does not change.`,
  boardCreate: "Create board",
  boardCancel: "Cancel",
  boardExists: "A file with that name already exists.",
  boardDone: (p) => `Board created: ${p}`,
  boardNothing: "There are no visible boxes to save.",
  readOnlyNote: "The diagram only shows; to change the data, edit the text.",
  jumpText: "Go to the text",
  unfoldedTo: (p) => `Opened down to ${p}`,
};

export const dgw: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
