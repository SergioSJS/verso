# ADRs do Verso

Um registro por decisão do `docs/BRIEFING.md`. Formato fixo: Contexto / Decisão /
Consequências / Alternativas descartadas / Status.

## Status

Os status espelham o briefing e não podem ser promovidos pela IA:

| Status | Significado |
|---|---|
| Aceito | `DECIDIDO` no briefing: escolhido ou aceito explicitamente pelo mantenedor |
| Proposto | `PROPOSTO` no briefing: recomendado na discussão, sem confirmação |
| `[ABERTO]` | Sem decisão. Registra o contexto e quando decidir |
| Restrição | Imposta por plataforma, licença ou termos de uso; não é escolha |

Só o mantenedor promove Proposto para Aceito, ou fecha um `[ABERTO]`.

## Índice

### Projeto e governança

| # | Título | Status |
|---|---|---|
| [0001](0001-ferramenta-aberta-sem-empresa.md) | Ferramenta aberta, sem empresa e sem produto pago | Aceito |
| [0002](0002-escopo-negativo.md) | Escopo negativo: nem clone, nem host de plugins alheios, nem LLM embutido | Aceito |
| [0003](0003-primitivas-em-vez-de-gambiarra.md) | O que hoje exige plugin deve ser primitiva do app | Aceito |
| [0004](0004-nome-do-projeto-verso.md) | Nome do projeto: Verso | Aceito |
| [0005](0005-licenca.md) | Licença do projeto | `[ABERTO]` |
| [0006](0006-contribuicao-dco-sem-cla.md) | Contribuição por DCO, sem CLA | Proposto |
| [0007](0007-repositorio-privado-ate-licenca.md) | Repositório privado até a licença ser decidida | Aceito |
| [0008](0008-idioma-da-documentacao.md) | Idioma da documentação do repositório | `[ABERTO]` |
| [0009](0009-restricoes-externas.md) | Restrições externas assumidas como dadas | Restrição |

### Princípios de produto

| # | Título | Status |
|---|---|---|
| [0010](0010-pasta-e-a-unidade-sem-vault.md) | A pasta aberta é a unidade de trabalho; não existe vault | Aceito |
| [0011](0011-config-fora-da-arvore-indice-como-cache.md) | Config fora da árvore e índice como cache reconstruível | Aceito |
| [0041](0041-workspace-multi-raiz.md) | Workspace com múltiplas raízes | Proposto |
| [0042](0042-abertura-pela-linha-de-comando.md) | Abrir pela linha de comando: `verso <pasta>` | Aceito |
| [0012](0012-arquivos-sao-fonte-de-verdade.md) | Arquivos são a fonte de verdade; abrir nunca reescreve | Aceito |
| [0013](0013-degradacao-para-markdown.md) | Todo dado estruturado degrada para Markdown legível | Proposto |
| [0014](0014-catalogo-de-primitivas.md) | Catálogo de primitivas do Verso | Proposto |
| [0015](0015-packs-de-schema.md) | Packs de schema distribuíveis como conteúdo | Proposto |

### Plugins e LLM

| # | Título | Status |
|---|---|---|
| [0016](0016-plugins-execucao-e-capabilities.md) | Plugins: TypeScript em Web Worker, sem disco, com capabilities declaradas | Aceito |
| [0017](0017-plugins-formato-shim-carregamento.md) | Plugins: formato familiar, shim separado, carga lazy e dogfooding | Proposto |
| [0018](0018-llm-nativo-mcp-no-core.md) | LLM-nativo: servidor MCP no core, consulta estruturada, escrita revisada | Aceito |
| [0019](0019-generativo-opt-in-e-keychain.md) | Recursos generativos opt-in e chaves no keychain | Proposto |

### Sync

| # | Título | Status |
|---|---|---|
| [0020](0020-sync-merge-no-core-transportes-como-plugin.md) | Sync: motor de merge no core, transportes como plugin, fora de escopo até a Fase 2 | Aceito |
| [0021](0021-sync-automerge-config-em-camadas.md) | Sync: Automerge e config em camadas | Proposto |
| [0043](0043-guarda-contra-placeholder.md) | Arquivo placeholder de armazenamento sob demanda nunca é deleção | Aceito (mecanismo por provedor: `[ABERTO]`) |

### Plataformas e arquitetura

| # | Título | Status |
|---|---|---|
| [0022](0022-plataformas-alvo-e-macos-primeiro.md) | Plataformas-alvo e macOS primeiro | Aceito |
| [0023](0023-stack-core-e-editor.md) | Stack: Rust, Tauri v2, CodeMirror 6, SQLite com FTS5 | Aceito |
| [0024](0024-board-excalidraw.md) | Board: Excalidraw como camada de anotação livre | Aceito |
| [0025](0025-servidor-proprio-e-mobile-pwa.md) | Servidor próprio (`verso serve`) e mobile inicial como cliente web | Proposto |
| [0026](0026-contrato-core-ui-regras-inviolaveis.md) | Contrato core↔UI e regras invioláveis de arquitetura | Aceito |
| [0027](0027-capabilities-em-runtime.md) | Capabilities consultáveis em runtime | Proposto |
| [0028](0028-estrutura-de-crates.md) | Estrutura de crates | Aceito |

### Dialeto, engenharia e roadmap

| # | Título | Status |
|---|---|---|
| [0029](0029-guardrails-no-ci.md) | Guardrails no CI antes da primeira linha de lógica de produto | Aceito |
| [0030](0030-dialeto-base-compativel-obsidian.md) | Dialeto base compatível com o Obsidian; o Verso estende, nunca contradiz | Aceito |
| [0031](0031-fixtures-como-contrato.md) | Fixtures são o contrato de comportamento entre mantenedor e IA | Aceito |
| [0032](0032-papeis-autor-e-revisor.md) | Papéis: a IA escreve, o mantenedor revisa comportamento | Aceito |
| [0033](0033-fluxo-de-pr.md) | Fluxo de PR | Aceito |
| [0034](0034-roadmap-em-fases.md) | Roadmap em três fases com portões de saída verificáveis | Aceito |
| [0035](0035-requisitos-transversais.md) | Requisitos transversais: pt-BR e EN, acessibilidade, benchmark | Aceito |
| [0036](0036-suporte-a-rpg-de-mesa.md) | Suporte especial a RPG de mesa | Aceito (intenção) |

### Decisões técnicas em aberto

| # | Título | Quando decidir |
|---|---|---|
| [0037](0037-parser-base.md) | Parser base do `verso-dialect` | PR da feature 1 (Fase 1) |
| [0038](0038-geracao-de-tipos-ts.md) | Geração de tipos TypeScript a partir do Rust | Início da Fase 2 |
| [0039](0039-metas-de-performance.md) | Metas de performance | Após a primeira linha de base |
| [0040](0040-persistencia-do-board.md) | Persistência do board | Antes do board |

### Questões abertas levantadas na revisão da Fase 0

Fonte: [`../review/fase0.md`](../review/fase0.md). Nenhuma tem decisão; cada
uma registra o que precisa ser respondido e quando.

| # | Título | Quando decidir |
|---|---|---|
| [0044](0044-semantica-de-verso-fs.md) | Semântica de `verso-fs`: symlinks, handles opacos, caminhos ignorados | Feature 2 da Fase 1 (symlinks, caminhos); feature 6 e item 2.1 (handles) |
| [0045](0045-seguranca-do-servidor-e-do-mcp.md) | Segurança do servidor, do MCP e do contrato | Feature 6 da Fase 1 (MCP); item 2.1 da Fase 2 (contrato) |
| [0046](0046-indice-localizacao-ciclo-de-vida-tokenizador.md) | Índice: localização, ciclo de vida e tokenizador | Features 3 e 5 da Fase 1 |
| [0047](0047-questoes-abertas-da-api-de-plugin.md) | Questões abertas da API de plugin | Antes de desenhar a API (depois da Fase 2) |
| [0048](0048-operacoes-de-arquivo-na-ui.md) | Operações de arquivo na UI: renomear, criar, excluir, mover | Item 2.3 da Fase 2 |

## Itens em aberto que não viraram ADR

Três itens de dialeto do §17 vivem em [`../spec/dialeto.md`](../spec/dialeto.md),
onde o comportamento é especificado: sintaxe de relação tipada (item 6), formato
e localização dos schemas (item 7) e sintaxe de visibilidade por bloco (item 8).
As lacunas de parsing (Q1–Q8, Q12–Q26) também vivem lá.

A verificação de disponibilidade do nome (item 2) está registrada em
[0004](0004-nome-do-projeto-verso.md).

## Como escrever um ADR novo

1. Numerar em sequência: `NNNN-titulo-em-kebab-case.md`.
2. Usar as cinco seções, nesta ordem, sem inventar outras.
3. Citar a fonte no cabeçalho (`docs/BRIEFING.md` §X, PR, issue, ou a revisão
   que o originou).
4. Em "Alternativas descartadas", registrar apenas alternativas que foram de
   fato consideradas. Sem nenhuma: escrever "Nenhuma registrada".
5. ADR não é editado para mudar de ideia. Um ADR novo supersede o anterior, e o
   anterior ganha uma linha apontando para o novo.

## Como alterar um ADR existente

Três casos, com tratamentos diferentes:

| Caso | O que fazer |
|---|---|
| Correção ou delimitação que **não muda a decisão** (erro de citação, escopo que faltava dizer, consequência descoberta depois) | Editar no lugar e acrescentar uma linha `Revisões:` no cabeçalho, com data e origem (PR ou revisão) |
| **Mudar** uma decisão Aceita | ADR novo que supersede; o antigo ganha a linha apontando para o novo e não é editado além disso |
| **Fechar** um `[ABERTO]` ou promover um Proposto | Editar a seção Decisão e o Status no lugar, citando o commit ou PR em que o mantenedor decidiu. Um `[ABERTO]` não tem decisão a superseder; a promoção de Proposto é a confirmação do texto que já estava lá |

Só o mantenedor faz o segundo e o terceiro caso. O primeiro pode ser feito pela
IA, e é achado de revisão se disfarçar mudança de decisão de correção.
