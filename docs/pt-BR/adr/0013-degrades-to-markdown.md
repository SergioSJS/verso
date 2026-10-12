# ADR 0013 — Todo dado estruturado degrada para Markdown legível

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.2
- Status no briefing: `PROPOSTO` até 2026-09-24; `DECIDIDO` a partir da
  decisão do mantenedor (o Histórico do briefing, v0.9)
- Revisões: 2026-09-24 — promovido a Aceito pelo mantenedor, na sessão, sobre
  o memo `docs/reference/typed-note-decision.md` §4.3 (opção A), junto com a
  nota tipada ([0052](0052-typed-note.md)): a Decisão confirmada como está
  escrita, e duas palavras das Consequências — "views" e "dado estruturado" —
  delimitadas como o memo propôs. O título da Decisão e o Status editados no
  lugar.

## Contexto

Estrutura costuma ser adicionada a um app de notas na forma de banco de dados ou
de sintaxe própria. Nos dois casos, quem abre o arquivo em outro editor vê algo
ilegível, e git, busca e agentes deixam de enxergar o conteúdo (§16.1).

## Decisão

Todo dado estruturado do Verso degrada para Markdown legível em qualquer editor.

Proposto no briefing, **aceito em 2026-09-24 pelo mantenedor** como está
escrito, na sessão, sobre o memo `docs/reference/typed-note-decision.md` §4.3:
as recomendações do autor no dia, esta entre elas, foram apresentadas ao
mantenedor numa lista só; a resposta: *"Tirando o plano de fazer vários PR, eu
gosto das suas recomendações"*. Vale para todo recurso estruturado — notas
tipadas e schemas agora, relações e views quando vierem.

## Consequências

- Nenhum recurso estruturado pode existir apenas no índice
  ([0011](0011-config-outside-tree-index-as-cache.md)).
- Views precisam poder materializar a saída como Markdown real no arquivo
  ([0014](0014-primitives-catalog.md)).
- A sintaxe de relação tipada, ainda `[ABERTO]`, fica restringida por esta
  proposta: precisa ser legível fora do Verso (`docs/spec/dialect.md`).
  *(Decidida em 2026-09-30: Q10 da spec, ADR 0057 ponto 4.)*
- O custo é redundância: o mesmo dado aparece no arquivo e no índice, e os dois
  precisam concordar.
- "Markdown legível" é lido como **texto legível em qualquer editor, no formato
  que o dado já tem**. O alvo da regra é dado que, sem ela, viveria só no índice
  ou num banco. `.canvas` (JSON Canvas) já está no dialeto base
  ([0030](0030-base-dialect-obsidian-compatible.md)) e é texto: não contradiz a
  proposta, e [0040](0040-board-persistence.md) parte disso.
- **Duas palavras delimitadas na aceitação, 2026-09-24** (memo §4.3, e §10,
  item 3):
  - **"Views"**, na segunda consequência, quer dizer a primitiva de views
    estruturadas do [0014](0014-primitives-catalog.md) — uma consulta cuja
    saída uma view poderia escrever no arquivo, como as views de kanban,
    calendário e tabela que o [0049](0049-phase-2-scope-widened.md) §3 deixou
    fora da Fase 2 — e não os painéis da janela: o grafo, os backlinks, a busca
    e a vista de pasta mostram o que os arquivos já guardam.
  - **"Dado estruturado"** quer dizer o que os usuários escrevem sobre as
    notas — propriedades, tipos, schemas, relações, a saída de uma view — e não
    os ajustes e o layout do app, que o
    [0011](0011-config-outside-tree-index-as-cache.md) põe fora da árvore; os
    favoritos ficam nessa linha.
- O que a Fase 2 constrói já cumpre: notas, templates, a nota do dia, o `url`
  de uma nota web, a lixeira e os planos de renomear são todos arquivos; a
  nota tipada e os schemas dela são notas ([0052](0052-typed-note.md)).

## Alternativas descartadas

- Guardar dado estruturado apenas em banco — o briefing cita a transição do
  Logseq para versão em banco de dados como referência, não como caminho (§16.2).
- Aceitá-lo só para notas tipadas e schemas, deixando-o uma proposta para
  relações e views — considerado pelo mantenedor sobre o memo (§4.3, opção B)
  e posto de lado em 2026-09-24: a próxima primitiva discutiria o princípio de
  novo.

## Status

Aceito em 2026-09-24 pelo mantenedor (Decisão). Proposto até então.
