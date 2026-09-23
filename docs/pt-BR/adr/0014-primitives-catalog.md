# ADR 0014 — Catálogo de primitivas do Verso

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.3
- Status no briefing: `PROPOSTO`
- Revisões: 2026-09-23 — duas primitivas aceitas pelo mantenedor como a janela
  da Fase 2 as constrói, a nota do dia e os templates
  (`docs/review/phase-2.md` §6, item 11); o resto do catálogo continua
  Proposto.

## Contexto

Aplicação do princípio de [0003](0003-primitives-not-workarounds.md): cada
gambiarra comum no Obsidian é sintoma de uma primitiva ausente. O briefing
propõe um catálogo, ainda sem confirmação.

## Decisão (proposta, não confirmada)

O Verso implementa primitivas; features específicas vêm como plugins de primeira
parte.

| Primitiva | Substitui |
|---|---|
| Nota tipada: `type:` no frontmatter + schema em arquivo de texto na pasta; sem schema, é Markdown comum | Dataview, Templater, statblocks |
| ID estável de bloco, com backlinks e presença no grafo | pedido aberto no fórum do Obsidian desde 2020 |
| Relação tipada: aresta com tipo e direção; várias relações entre os mesmos dois nós | links sem semântica |
| Tempo como primeira classe: diário e notas periódicas | Periodic Notes, Calendar |
| Views estruturadas que podem materializar a saída como Markdown real no arquivo | resultado de consulta invisível a git, busca e agente |
| Proveniência de escrita no frontmatter: autor, modelo, quando | sem equivalente |

## Consequências

- Cada primitiva precisa do seu próprio ADR antes de ser implementada; este ADR
  só registra o catálogo.
- Três itens dependem de sintaxe ainda `[ABERTO]`: relação tipada, formato e
  localização dos schemas, e visibilidade por bloco (`docs/spec/dialect.md`).
- "Sem schema, é Markdown comum" é o que mantém a compatibilidade com vaults do
  Obsidian ([0012](0012-files-are-source-of-truth.md)).
- ID de bloco com backlinks e presença no grafo é pré-requisito da citação
  verificável por agente ([0018](0018-llm-native-mcp-in-core.md)). "Estável"
  só é verdade para `^id` escrito no arquivo: um ID que morasse só no índice
  se perderia na reconstrução ([0011](0011-config-outside-tree-index-as-cache.md)),
  e um ID gravado pelo app ao abrir violaria [0012](0012-files-are-source-of-truth.md).
  Bloco sem `^id` é citado por posição.
- Proveniência de escrita grava dado pessoal (autor) em arquivo que vai em sync,
  export e compartilhamento com jogadores. O ADR próprio dessa primitiva precisa
  dizer o que é gravado e se é opt-in.
- Nota tipada (item 2.6 da Fase 2) exige promover esta linha do catálogo a ADR
  próprio, Aceito, antes de ser implementada — o roadmap lista isso entre as
  decisões da Fase 2.
- Nada deste catálogo está na Fase 1, exceto o que o parser e o índice precisam
  expor ([0034](0034-roadmap-in-phases.md)).

**Duas primitivas aceitas em 2026-09-23 pelo mantenedor**
(`docs/review/phase-2.md` §6, item 11; a resposta: *"a e b ok"*), como a janela
da Fase 2 as constrói ([0049](0049-phase-2-scope-widened.md),
`docs/reference/app-decision.md`). A **nota do dia** — a parte diária da linha
do tempo: uma nota por dia, com a data como nome, na pasta que os ajustes
nomeiam, aberta se existe e senão criada, a partir de um template com o nome
dessa pasta quando existe um. Os **templates** — qualquer nota na pasta que
os ajustes nomeiam é um; ele é inserido numa nota com `{{date}}` e `{{title}}`
preenchidos, e uma nota pode ser salva nessa pasta como template. Esta
aceitação vale pela ADR própria que a primeira Consequência pede de cada
primitiva. Notas periódicas e todas as outras linhas continuam Propostas.

## Alternativas descartadas

- Reproduzir Dataview, Templater, Periodic Notes e statblocks como plugins de
  terceiros — é a situação que motiva o catálogo (§5.3, §16.1).

## Status

Proposto. A nota do dia e os templates: aceitos em 2026-09-23 (Consequências).
