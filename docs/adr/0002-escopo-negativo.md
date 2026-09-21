# ADR 0002 — Escopo negativo: nem clone, nem host de plugins alheios, nem LLM embutido

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §1
- Status no briefing: `DECIDIDO`

## Contexto

Um projeto inspirado no Obsidian corre dois riscos: virar um clone atrasado, ou
prometer compatibilidade que não consegue sustentar. Além disso, a categoria de
"app de notas com IA" tende a embutir um provedor de LLM, o que amarra o projeto
a um fornecedor.

## Decisão

1. O Verso não é clone do Obsidian. É inspirado nele e compatível com os vaults
   dele.
2. O Verso não promete rodar todos os plugins do Obsidian.
3. O Verso não embute modelo de LLM nem depende de um provedor específico.

## Consequências

- A compatibilidade é do formato de arquivo, não do app: o compromisso vive no
  dialeto ([0030](0030-dialeto-base-compativel-obsidian.md)) e nas fixtures
  ([0031](0031-fixtures-como-contrato.md)), não na interface.
- Qualquer compatibilidade com plugins de terceiros fica fora do core, em pacote
  separado e com tabela de compatibilidade declarada
  ([0017](0017-plugins-formato-shim-carregamento.md)).
- O endpoint de modelo é trazido pelo usuário
  ([0018](0018-llm-nativo-mcp-no-core.md)).
- Divergir do Obsidian em UI é permitido; divergir no arquivo não é.

## Alternativas descartadas

- Compatibilidade binária com plugins do Obsidian — descartada em §1 e §6.
- Embutir um modelo de LLM ou depender de um provedor específico — descartado em §1.

## Status

Aceito.
