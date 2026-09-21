# ADR 0014 — Catálogo de primitivas do Verso

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.3
- Status no briefing: `PROPOSTO`

## Contexto

Aplicação do princípio de [0003](0003-primitivas-em-vez-de-gambiarra.md): cada
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
  localização dos schemas, e visibilidade por bloco (`docs/spec/dialeto.md`).
- "Sem schema, é Markdown comum" é o que mantém a compatibilidade com vaults do
  Obsidian ([0012](0012-arquivos-sao-fonte-de-verdade.md)).
- ID de bloco com backlinks e presença no grafo é pré-requisito da citação
  verificável por agente ([0018](0018-llm-nativo-mcp-no-core.md)).
- Nada deste catálogo está na Fase 1, exceto o que o parser e o índice precisam
  expor ([0034](0034-roadmap-em-fases.md)).

## Alternativas descartadas

- Reproduzir Dataview, Templater, Periodic Notes e statblocks como plugins de
  terceiros — é a situação que motiva o catálogo (§5.3, §16.1).

## Status

Proposto.
