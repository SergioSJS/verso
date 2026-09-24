// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// CodeMirror's own words — the search panel, go to line, folding, the
// announcements a screen reader hears — in pt-BR (ADR 0035). English is
// CodeMirror's default, so the English interface needs no table. Every
// phrase the installed @codemirror packages ask for; `$` is where
// CodeMirror puts a number.

export const ptPhrases: Record<string, string> = {
  // @codemirror/search
  Find: "Localizar",
  Replace: "Substituir",
  next: "próxima",
  previous: "anterior",
  all: "todas",
  "match case": "diferenciar maiúsculas",
  regexp: "expressão regular",
  "by word": "palavra inteira",
  replace: "substituir",
  "replace all": "substituir todas",
  close: "fechar",
  "current match": "ocorrência atual",
  "on line": "na linha",
  "replaced match on line $": "ocorrência substituída na linha $",
  "replaced $ matches": "$ ocorrências substituídas",
  "Go to line": "Ir para a linha",
  go: "ir",
  // @codemirror/language
  "Folded lines": "Linhas recolhidas",
  "Unfolded lines": "Linhas expandidas",
  to: "a",
  "folded code": "código recolhido",
  unfold: "expandir",
  "Fold line": "Recolher linha",
  "Unfold line": "Expandir linha",
  // @codemirror/autocomplete, commands, lint, view
  Completions: "Sugestões",
  "Selection deleted": "Seleção apagada",
  Diagnostics: "Diagnósticos",
  "No diagnostics": "Nenhum diagnóstico",
  "Control character": "Caractere de controle",
};
