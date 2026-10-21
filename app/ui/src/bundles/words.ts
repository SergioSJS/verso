// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the bundles, their checks and the world wizard say, in both languages
// (ADR 0035, ADR 0098 item 9). Pure and importless: the checks take the
// words they use, so a test names the language and the window hands in its
// own (`bundleWords(LANG)`).

const pt = {
  // --- the schema check (types.ts); each is the message and what to tell the AI
  invalidJson: (why: string) => ({
    error: `JSON inválido: ${why}`,
    fix: "O texto fornecido não é um JSON válido. Verifique se copiou o JSON completo gerado pela IA, sem comentários.",
  }),
  tooBig: (mb: number) => ({
    error: `O texto colado passa de ${mb} MB.`,
    fix: `O JSON passou de ${mb} MB. Reduza o número e o tamanho dos arquivos.`,
  }),
  notObject: {
    error: "O JSON fornecido não é um objeto.",
    fix: "O JSON fornecido não é um objeto JSON válido (esperava-se um objeto com as chaves 'version', 'id', 'name', 'folders', 'files').",
  },
  version: {
    error: "Campo 'version' inválido ou ausente: deve ser 1.",
    fix: "O campo 'version' é obrigatório e deve ser exatamente o número 1.",
  },
  id: {
    error: "Campo 'id' inválido ou ausente: deve ser um texto identificador (ex: 'minha-campanha').",
    fix: "O campo 'id' deve ser um texto sem espaços ou acentos que identifique o modelo (ex: 'campanha-tormenta20').",
  },
  name: {
    error: "Campo 'name' inválido ou ausente: informe o nome do modelo.",
    fix: "O campo 'name' deve ser o título legível do modelo (ex: 'Campanha de Fantasia').",
  },
  description: {
    error: "Campo 'description' inválido ou ausente: deve ser um texto.",
    fix: "O campo 'description' deve ser um texto descrevendo brevemente o modelo.",
  },
  category: {
    error: "Campo 'category' inválido: use \"rpg\", \"world\", \"writing\" ou \"notes\".",
    fix: "O campo 'category', se existir, deve ser exatamente um destes textos: \"rpg\", \"world\", \"writing\" ou \"notes\".",
  },
  folders: {
    error: "Campo 'folders' inválido ou ausente: deve ser uma lista de caminhos de pastas.",
    fix: "O campo 'folders' deve ser uma lista de textos com as pastas a criar (ex: [\"1. Grupo\", \"2. Sessões\"]).",
  },
  folderItem: (i: number) => ({
    error: `Pasta no índice ${i} é inválida. Todos os itens de 'folders' devem ser textos não vazios.`,
    fix: `O item no índice ${i} da lista 'folders' não é um texto válido. Todos os itens de 'folders' devem ser nomes de pastas.`,
  }),
  files: {
    error: "Campo 'files' inválido ou ausente: deve ser uma lista de arquivos.",
    fix: "O campo 'files' deve ser uma lista de objetos, cada um com 'path' e, se quiser, 'frontmatter' e 'content'.",
  },
  fileItem: (i: number) => ({
    error: `Arquivo no índice ${i} é inválido: deve ser um objeto.`,
    fix: `O item no índice ${i} de 'files' deve ser um objeto contendo a propriedade 'path'.`,
  }),
  filePath: (i: number) => ({
    error: `Arquivo no índice ${i} não possui a propriedade obrigatória 'path'.`,
    fix: `O arquivo no índice ${i} precisa ter a chave 'path' com o caminho relativo do arquivo (ex: '2. Sessões/Sessão 01.md').`,
  }),
  frontmatterObject: (path: string) => ({
    error: `Propriedade 'frontmatter' do arquivo '${path}' deve ser um objeto chave-valor.`,
    fix: `O campo 'frontmatter' do arquivo '${path}' deve ser um objeto com pares de propriedades (ex: { "tipo": "npc" }).`,
  }),
  frontmatterKey: (path: string, key: string) => ({
    error: `Propriedade '${key}' do arquivo '${path}' tem um nome inválido.`,
    fix: `Os nomes em 'frontmatter' de '${path}' devem ser textos não vazios, em uma linha só. Corrija '${key}'.`,
  }),
  frontmatterValue: (path: string, key: string) => ({
    error: `Propriedade '${key}' do arquivo '${path}' tem um valor que não cabe em frontmatter.`,
    fix: `Em 'frontmatter' de '${path}', cada valor deve ser texto, número, verdadeiro/falso, nulo ou uma lista de textos. Corrija '${key}'.`,
  }),
  content: (path: string) => ({
    error: `Propriedade 'content' do arquivo '${path}' deve ser um texto.`,
    fix: `O campo 'content' do arquivo '${path}' deve ser um texto com o conteúdo do arquivo.`,
  }),
  fixIntro: (error: string, detail: string) =>
    `O Verso encontrou o seguinte erro ao validar o JSON do Template Bundle:\n"${error}"\n\nDetalhe: ${detail}\n\nPor favor, corrija o JSON mantendo estritamente o Schema v1 do Verso e devolva apenas o bloco de código JSON corrigido.`,

  // --- the plan (plan.ts): each problem is said with the field it comes from
  plan: {
    emptyName: "o nome fica vazio depois de tirar o que o Windows não aceita",
    moreFolders: (n: number) => `mais de ${n} pastas`,
    moreFiles: (n: number) => `mais de ${n} arquivos`,
    relative: "o caminho deve ser relativo à pasta do novo projeto",
    deep: (n: number) => `o caminho tem mais de ${n} níveis de pasta`,
    twice: (rel: string) => `"${rel}" aparece duas vezes`,
    onlyNotes: "só uma nota Markdown tem frontmatter",
    bigFile: (kb: number) => `maior que ${kb} KB`,
    bigTotal: (mb: number) => `mais de ${mb} MB no total`,
    badFrontmatter: "frontmatter inválido",
    empty: "segmento vazio",
    notAllowed: (s: string) => `"${s}" não é permitido`,
    hidden: (s: string) => `o nome oculto "${s}" não é permitido`,
    forbidden: (s: string) => `"${s}" tem um caractere que o Windows recusa (: * " < > ? | \\)`,
    trailing: (s: string) => `"${s}" termina em ponto ou espaço`,
    device: (s: string) => `"${s}" é um nome reservado do sistema`,
  },

  // --- the wizard
  intro: "Copie o prompt arquiteto abaixo e cole no Claude, ChatGPT ou Gemini. A IA fará perguntas para entender sua campanha ou mundo e devolverá um JSON no padrão do Verso.",
  previewTitle: "Estrutura que será criada:",
  rootPlaceholder: "<Nome do mundo ou campanha>",
  rootLine: (name: string) => `📁 Pasta principal: ${name}/`,
  foldersLine: (n: number, names: string) => `↳ 📂 ${n} ${n === 1 ? "subpasta" : "subpastas"}: ${names}`,
  filesLine: (n: number) => `↳ 📄 ${n} ${n === 1 ? "arquivo modelo" : "arquivos modelo"}, com propriedades e seções prontas.`,
  showFiles: "Ver a lista de arquivos",
  nameRequired: "Digite um nome para continuar.",
  copyFailed: "Não foi possível copiar automaticamente.",
  jsonSyntax: (why: string) => `Erro de sintaxe JSON: ${why}`,
  jsonSyntaxFix: (why: string) => `O Verso não conseguiu ler o JSON:\n"${why}"\n\nPor favor, corrija o formato e devolva estritamente o JSON válido, sem comentários.`,
  pasteTooBig: (mb: number) => `O texto colado passa de ${mb} MB e não foi lido.`,
  importedRenamed: (name: string) => `Já existe um modelo com esse identificador: "${name}" entrou com um identificador novo.`,
  savedInFolder: (name: string) => `"${name}" foi guardado na pasta, em .verso/bundles: quem abrir esta pasta também o terá.`,
  keptHere: (name: string, why: string) => `"${name}" não pôde ser guardado na pasta (${why}); ele vale só até fechar esta janela.`,
  folderBundleUnreadable: (id: string) => `O modelo "${id}" da pasta não pôde ser lido agora e ficou de fora da lista.`,
  folderBundleInvalid: (id: string, why: string) => `O modelo "${id}" da pasta não é válido e ficou de fora da lista: ${why}`,
  tabsLabel: "Como criar",
  bundlesLabel: "Modelos disponíveis",
  selected: "selecionado",
  noBundles: "Nenhum modelo está disponível neste modo de uso.",
  // --- the report after creating
  planRefused: (n: number) => `Nada foi criado: o modelo tem ${n} ${n === 1 ? "problema" : "problemas"}.`,
  problemAt: (at: string, message: string) => `${at}: ${message}`,
  made: (folders: number, files: number) => `Criado: ${folders} ${folders === 1 ? "pasta" : "pastas"} e ${files} ${files === 1 ? "arquivo" : "arquivos"}.`,
  alreadyThere: (n: number) => `${n} ${n === 1 ? "item já existia e foi mantido como estava" : "itens já existiam e foram mantidos como estavam"}.`,
  refused: (n: number) => `${n} ${n === 1 ? "item não pôde ser criado" : "itens não puderam ser criados"}:`,
  nothingMade: "Nada foi criado.",
  dryRun: (folders: number, files: number) => `${folders} pastas e ${files} arquivos serão criados.`,
  done: "Fechar",
  reportLabel: "Resultado",
  confirmTitle: "Confira o que será criado",
  confirmHint: "Nada foi escrito ainda. Desmarque o que não quer ou mude um nome; mudar o nome de uma pasta muda o das que estão dentro dela.",
  confirmBack: "Voltar",
  confirmCreate: "Criar agora",
  include: (path: string) => `Incluir ${path}`,
  rename: (path: string) => `Nome de ${path}`,
  nothingChosen: "Marque pelo menos um item para criar.",
};

type Words = typeof pt;

const en: Words = {
  invalidJson: (why) => ({
    error: `Invalid JSON: ${why}`,
    fix: "The text provided is not valid JSON. Check that you copied the whole JSON the AI produced, without comments.",
  }),
  tooBig: (mb) => ({
    error: `The pasted text is over ${mb} MB.`,
    fix: `The JSON went over ${mb} MB. Reduce the number and size of the files.`,
  }),
  notObject: {
    error: "The JSON provided is not an object.",
    fix: "The JSON provided is not a valid JSON object (an object with the keys 'version', 'id', 'name', 'folders', 'files' was expected).",
  },
  version: {
    error: "Field 'version' is invalid or missing: it must be 1.",
    fix: "The 'version' field is required and must be exactly the number 1.",
  },
  id: {
    error: "Field 'id' is invalid or missing: it must be an identifier string (e.g. 'my-campaign').",
    fix: "The 'id' field must be a string without spaces or accents that identifies the bundle (e.g. 'tormenta20-campaign').",
  },
  name: {
    error: "Field 'name' is invalid or missing: give the bundle a name.",
    fix: "The 'name' field must be the bundle's readable title (e.g. 'Fantasy Campaign').",
  },
  description: {
    error: "Field 'description' is invalid or missing: it must be a string.",
    fix: "The 'description' field must be a string briefly describing the bundle.",
  },
  category: {
    error: "Field 'category' is invalid: use \"rpg\", \"world\", \"writing\" or \"notes\".",
    fix: "The 'category' field, if present, must be exactly one of: \"rpg\", \"world\", \"writing\" or \"notes\".",
  },
  folders: {
    error: "Field 'folders' is invalid or missing: it must be a list of folder paths.",
    fix: "The 'folders' field must be a list of strings with the folders to create (e.g. [\"1. Group\", \"2. Sessions\"]).",
  },
  folderItem: (i) => ({
    error: `Folder at index ${i} is invalid. Every item of 'folders' must be a non-empty string.`,
    fix: `The item at index ${i} of 'folders' is not a valid string. Every item of 'folders' must be a folder name.`,
  }),
  files: {
    error: "Field 'files' is invalid or missing: it must be a list of files.",
    fix: "The 'files' field must be a list of objects, each with 'path' and, optionally, 'frontmatter' and 'content'.",
  },
  fileItem: (i) => ({
    error: `File at index ${i} is invalid: it must be an object.`,
    fix: `The item at index ${i} of 'files' must be an object with a 'path' property.`,
  }),
  filePath: (i) => ({
    error: `File at index ${i} has no required 'path' property.`,
    fix: `The file at index ${i} needs a 'path' key with the file's relative path (e.g. '2. Sessions/Session 01.md').`,
  }),
  frontmatterObject: (path) => ({
    error: `The 'frontmatter' of file '${path}' must be a key-value object.`,
    fix: `The 'frontmatter' field of file '${path}' must be an object of properties (e.g. { "type": "npc" }).`,
  }),
  frontmatterKey: (path, key) => ({
    error: `Property '${key}' of file '${path}' has an invalid name.`,
    fix: `Names in the 'frontmatter' of '${path}' must be non-empty strings on one line. Fix '${key}'.`,
  }),
  frontmatterValue: (path, key) => ({
    error: `Property '${key}' of file '${path}' has a value that does not fit in frontmatter.`,
    fix: `In the 'frontmatter' of '${path}', each value must be a string, number, true/false, null or a list of strings. Fix '${key}'.`,
  }),
  content: (path) => ({
    error: `The 'content' of file '${path}' must be a string.`,
    fix: `The 'content' field of file '${path}' must be a string with the file's content.`,
  }),
  fixIntro: (error, detail) =>
    `Verso found the following error while validating the Template Bundle JSON:\n"${error}"\n\nDetail: ${detail}\n\nPlease fix the JSON, keeping strictly to Verso's Schema v1, and return only the corrected JSON code block.`,

  plan: {
    emptyName: "the name is empty once what Windows refuses is removed",
    moreFolders: (n) => `more than ${n} folders`,
    moreFiles: (n) => `more than ${n} files`,
    relative: "the path must be relative to the new project's folder",
    deep: (n) => `the path is deeper than ${n} folders`,
    twice: (rel) => `"${rel}" appears twice`,
    onlyNotes: "only a Markdown note has frontmatter",
    bigFile: (kb) => `larger than ${kb} KB`,
    bigTotal: (mb) => `more than ${mb} MB in all`,
    badFrontmatter: "invalid frontmatter",
    empty: "empty segment",
    notAllowed: (s) => `"${s}" is not allowed`,
    hidden: (s) => `hidden name "${s}" is not allowed`,
    forbidden: (s) => `"${s}" holds a character Windows refuses (: * " < > ? | \\)`,
    trailing: (s) => `"${s}" ends with a dot or a space`,
    device: (s) => `"${s}" is a reserved system name`,
  },

  intro: "Copy the architect prompt below and paste it into Claude, ChatGPT or Gemini. The AI will ask questions to understand your campaign or world and return a JSON in Verso's format.",
  previewTitle: "What will be created:",
  rootPlaceholder: "<World or campaign name>",
  rootLine: (name) => `📁 Main folder: ${name}/`,
  foldersLine: (n, names) => `↳ 📂 ${n} ${n === 1 ? "subfolder" : "subfolders"}: ${names}`,
  filesLine: (n) => `↳ 📄 ${n} template ${n === 1 ? "file" : "files"}, with properties and sections ready.`,
  showFiles: "Show the list of files",
  nameRequired: "Type a name to continue.",
  copyFailed: "Could not copy automatically.",
  jsonSyntax: (why) => `JSON syntax error: ${why}`,
  jsonSyntaxFix: (why) => `Verso could not read the JSON:\n"${why}"\n\nPlease fix the format and return strictly valid JSON, without comments.`,
  pasteTooBig: (mb) => `The pasted text is over ${mb} MB and was not read.`,
  importedRenamed: (name) => `A bundle with that identifier already exists: "${name}" came in with a new identifier.`,
  savedInFolder: (name) => `"${name}" was kept in the folder, in .verso/bundles: whoever opens this folder has it too.`,
  keptHere: (name, why) => `"${name}" could not be kept in the folder (${why}); it lasts only until this window is closed.`,
  folderBundleUnreadable: (id) => `The folder's template "${id}" could not be read now and is left out of the list.`,
  folderBundleInvalid: (id, why) => `The folder's template "${id}" is not valid and is left out of the list: ${why}`,
  tabsLabel: "How to create",
  bundlesLabel: "Available templates",
  selected: "selected",
  noBundles: "No template is available in this usage mode.",
  planRefused: (n) => `Nothing was created: the bundle has ${n} ${n === 1 ? "problem" : "problems"}.`,
  problemAt: (at, message) => `${at}: ${message}`,
  made: (folders, files) => `Created: ${folders} ${folders === 1 ? "folder" : "folders"} and ${files} ${files === 1 ? "file" : "files"}.`,
  alreadyThere: (n) => `${n} ${n === 1 ? "item already existed and was left as it was" : "items already existed and were left as they were"}.`,
  refused: (n) => `${n} ${n === 1 ? "item could not be created" : "items could not be created"}:`,
  nothingMade: "Nothing was created.",
  dryRun: (folders, files) => `${folders} folders and ${files} files will be created.`,
  done: "Close",
  reportLabel: "Result",
  confirmTitle: "Check what will be created",
  confirmHint: "Nothing has been written yet. Uncheck what you do not want or change a name; renaming a folder renames what is inside it.",
  confirmBack: "Back",
  confirmCreate: "Create now",
  include: (path) => `Include ${path}`,
  rename: (path) => `Name of ${path}`,
  nothingChosen: "Check at least one item to create.",
};

export type BundleWords = Words;

/** The words for a language tag (`pt-BR`, `pt`, `en-US`, …). */
export function bundleWords(lang: string): BundleWords {
  return lang.toLowerCase().startsWith("pt") ? pt : en;
}

/** The built-in bundles' names and descriptions in English; the Portuguese
 *  ones live with the bundles (`presets.ts`), and their folders and notes in
 *  English in `presetsEn.ts`. */
export const PRESET_TEXT_EN: Record<string, { name: string; description: string }> = {
  "dados-criticos-campanha": {
    name: "RPG Campaign (Dados Críticos)",
    description: "Full structure with party, sessions, factions, NPCs, places, items and hexcrawl. Based on the vault structure of Igor Téuri's Dados Críticos.",
  },
  "dados-criticos-mundo": {
    name: "World Building",
    description: "A solid base for a setting: lore, creation myths, deities, languages and culture.",
  },
  "escrita-ficcao": {
    name: "Novel and Fiction Writing",
    description: "A structure for authors: acts, chapters, characters, settings and a timeline.",
  },
  "caderno-pessoal-para": {
    name: "Personal Organization (P.A.R.A.)",
    description: "Organizing by Projects, Areas, Resources and Archive.",
  },
};
