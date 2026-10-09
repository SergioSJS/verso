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
| [0001](0001-open-tool-no-company.md) | Ferramenta aberta, sem empresa e sem produto pago | Aceito |
| [0002](0002-negative-scope.md) | Escopo negativo: nem clone, nem host de plugins alheios, nem LLM embutido | Aceito |
| [0003](0003-primitives-not-workarounds.md) | O que hoje exige plugin deve ser primitiva do app | Aceito |
| [0004](0004-project-name-verso.md) | Nome do projeto: Verso | Aceito |
| [0005](0005-license.md) | Licença do projeto: MPL-2.0 no core e app, MIT no SDK de plugin | Aceito |
| [0006](0006-contribution-dco-no-cla.md) | Contribuição por DCO, sem CLA; código escrito por IA entra pelo mesmo DCO, sob responsabilidade de quem assina | Aceito |
| [0007](0007-private-repo-until-license.md) | Repositório privado até a licença ser decidida | Aceito |
| [0008](0008-documentation-language.md) | Idioma da documentação: inglês fonte, pt-BR espelho | Aceito |
| [0009](0009-external-constraints.md) | Restrições externas assumidas como dadas | Restrição |

### Princípios de produto

| # | Título | Status |
|---|---|---|
| [0010](0010-folder-is-the-unit-no-vault.md) | A pasta aberta é a unidade de trabalho; não existe vault | Aceito |
| [0011](0011-config-outside-tree-index-as-cache.md) | Config fora da árvore e índice como cache reconstruível | Aceito |
| [0041](0041-multi-root-workspace.md) | Workspace com múltiplas raízes | Proposto |
| [0042](0042-open-from-command-line.md) | Abrir pela linha de comando: `verso <pasta>` | Aceito |
| [0012](0012-files-are-source-of-truth.md) | Arquivos são a fonte de verdade; abrir nunca reescreve | Aceito |
| [0013](0013-degrades-to-markdown.md) | Todo dado estruturado degrada para Markdown legível | Aceito (2026-09-24) |
| [0014](0014-primitives-catalog.md) | Catálogo de primitivas do Verso | Proposto (a nota do dia e os templates: Aceito; a nota tipada: Aceito no 0052; as visões estruturadas: Aceito no 0053) |
| [0015](0015-schema-packs.md) | Packs de schema distribuíveis como conteúdo | Proposto |
| [0052](0052-typed-note.md) | Nota tipada: `type:` no frontmatter e um schema | Aceito (2026-09-24); uma propriedade com valor de link é relação tipada a partir do 0057 (2026-09-30) |
| [0053](0053-views-bases.md) | Visões sobre a pasta: bases, no formato do Obsidian | Aceito (2026-09-24) |
| [0059](0059-tabs-preview-pinned.md) | Abas: uma aba de pré-visualização por padrão, abas fixas compactas, a aba escolhida emenda na página | Aceito (2026-09-30) |
| [0060](0060-makemd-organizing-features.md) | As funcionalidades de organização do make.md como primitivas do Verso | Aceito (2026-10-02) |
| [0061](0061-blocks-in-edit-mode.md) | Blocos no modo Editar: uma alça para arrastar, um + para adicionar, um menu por bloco | Aceito (2026-10-06) |
| [0062](0062-focuses.md) | Focos: raízes nomeadas da árvore de arquivos, compartilhadas com o make.md | Aceito (2026-10-03) |
| [0063](0063-files-onto-the-board.md) | Pôr imagens e arquivos no board: soltar, colar, escolher e arrastar | Aceito (2026-10-06) |
| [0064](0064-tables-edited-as-tables.md) | Tabelas editadas como tabelas no modo Editar | Aceito (2026-10-06) |
| [0065](0065-a-folder-per-window.md) | Uma pasta por janela | Aceito (2026-10-06) |
| [0066](0066-mcp-sees-boards-relations-properties-bases.md) | O MCP enxerga boards, relações, propriedades e bases | Aceito (2026-10-07) |
| [0067](0067-source-files-stay-small.md) | Arquivos de código continuam pequenos: um mapa de módulos e um limite de tamanho | Aceito (2026-10-07) |
| [0068](0068-templates-chosen-in-a-new-note.md) | Templates escolhidos numa nota nova, como no Notion | Aceito (2026-10-07) |

### Plugins e LLM

| # | Título | Status |
|---|---|---|
| [0016](0016-plugins-execution-and-capabilities.md) | Plugins: TypeScript em Web Worker, sem disco, com capabilities declaradas | Aceito |
| [0017](0017-plugins-format-shim-loading.md) | Plugins: formato familiar, shim separado, carga lazy e dogfooding | Proposto |
| [0018](0018-llm-native-mcp-in-core.md) | LLM-nativo: servidor MCP no core, consulta estruturada, escrita revisada | Aceito |
| [0019](0019-generative-opt-in-and-keychain.md) | Recursos generativos opt-in e chaves no keychain | Proposto |

### Sync

| # | Título | Status |
|---|---|---|
| [0020](0020-sync-merge-in-core-transports-as-plugins.md) | Sync: motor de merge no core, transportes como plugin, fora de escopo até a Fase 2 | Aceito |
| [0021](0021-sync-automerge-layered-config.md) | Sync: Automerge e config em camadas | Proposto |
| [0043](0043-placeholder-guard.md) | Arquivo placeholder de armazenamento sob demanda nunca é deleção | Aceito (mecanismo por provedor: `[ABERTO]`) |

### Plataformas e arquitetura

| # | Título | Status |
|---|---|---|
| [0022](0022-target-platforms-macos-first.md) | Plataformas-alvo e macOS primeiro | Aceito |
| [0023](0023-stack-core-and-editor.md) | Stack: Rust, Tauri v2, CodeMirror 6, SQLite com FTS5 | Aceito |
| [0024](0024-board-excalidraw.md) | Board: Excalidraw como camada de anotação livre | Aceito; camada semântica e persistência decididas no 0057 (2026-09-30) |
| [0025](0025-own-server-and-mobile-pwa.md) | Servidor próprio (`verso serve`) e mobile inicial como cliente web | Proposto |
| [0026](0026-core-ui-contract-inviolable-rules.md) | Contrato core↔UI e regras invioláveis de arquitetura | Aceito |
| [0027](0027-runtime-capabilities.md) | Capabilities consultáveis em runtime | Proposto |
| [0028](0028-crate-structure.md) | Estrutura de crates | Aceito |
| [0050](0050-outbound-network-access.md) | Acesso de saída à rede a partir da janela | Aceito (o padrão do ajuste: provisório); revisado pela 0055 e pela 0056 (2026-09-29) |
| [0054](0054-terminal-and-agents-from-the-app.md) | A linha de comando e os agentes, ligados pelo app | Aceito (2026-09-24); o `[ABERTO]` sobre as ferramentas do sistema fechado (2026-09-29) |
| [0055](0055-in-app-updater.md) | O atualizador dentro do app | Aceito (2026-09-29) |
| [0056](0056-embedded-web-pages.md) | Páginas web embutidas: o proxy, a origem dele e a rede local | Aceito (2026-09-29); revisto no mesmo dia: sem proxy, as páginas carregam direto das origens que o usuário aprovou |
| [0057](0057-board-json-canvas.md) | O board: um arquivo JSON Canvas, o Excalidraw como superfície, relações tipadas no frontmatter | Aceito (2026-09-30) |
| [0069](0069-windows-port.md) | A versão para Windows: x64, um instalador, testada numa máquina Windows por SSH | Proposto (2026-10-07); x64, Windows 10 e 11, NSIS e sem assinatura de código por enquanto decididos; começa agora, na Fase 2 à frente do resto (0022 revisado); o bloqueio do push quando código de plataforma muda; máquina Windows 10 depois, código escrito para ele; o local da configuração (`%LOCALAPPDATA%\verso`) e o placeholder do OneDrive decididos em 2026-10-08; `[ABERTO]` (provisório): o `fsync` do diretório, o separador de caminho |
| [0070](0070-what-travels-with-the-folder.md) | O que viaja com a pasta: três camadas de configuração, e nomes que todo sistema guarda | Proposto (2026-10-08); nomes que todo sistema guarda decidido, a `\` entre eles |
| [0071](0071-linux-port.md) | A versão para Linux: um build para toda distribuição, testado em máquinas virtuais | Proposto (2026-10-08); espera ("deixe pra depois"); `[ABERTO]`: ARM64, versões suportadas, duas ou três máquinas, o atualizador, assinatura, o local do índice |
| [0072](0072-window-controls-in-the-app.md) | Os controles da janela dentro do app: sem barra de título no macOS e no Windows | Aceito (2026-10-08): botões do próprio app no Windows |
| [0073](0073-self-hosted-server-first.md) | Servidor auto-hospedado primeiro: colaboração online antes do sync | Proposto (2026-10-09); decididos: auto-hospedado primeiro, celular alcançado, o modelo Notion/Foundry como foco se viável, segurança por inteiro, uma investigação da janela responsiva, Fase 3 depois do Linux; propõe revisar 0020, 0021, 0044, 0045, 0050 e 0070 e superar o item 3 do 0025; `[ABERTO]`: celular só online vs offline mais cedo, donos por servidor, permissões mais finas e histórico, E2E depois, confiança TLS local, onde mora o serviço, versão do contrato e atualização do servidor, coedição do board, recuperação de conta, MCP pela rede, plataformas do Docker, a URL pré-assinada como handle, symlinks num servidor compartilhado, conteúdo remoto por leitor, critérios de iPad nativo, repasse de custo |
| [0074](0074-accounts-and-access-on-the-server.md) | Contas e acesso no servidor: o primeiro admin, o login, os tokens | Proposto (2026-10-09); decididos: o admin pelo ambiente só na primeira subida, recuperado por um comando na máquina; senha e passkeys; só por convite, acompanhado; o admin sem acesso implícito às pastas; várias contas; tokens de acesso pessoais por pasta |
| [0075](0075-server-packaging-and-storage.md) | O empacotamento e o armazenamento do servidor: como se instala, onde ficam os dados, quanto cada pasta ocupa | Proposto (2026-10-09); decididos: imagem Docker, compose para CasaOS/ZimaOS e pacotes com systemd; um diretório de dados local e uma raiz de pastas que pode ser um NAS; o espaço por pasta mostrado, limites depois; sync por pasta, desligado por padrão; `[ABERTO]`: o ARM64 do servidor agora ou depois, onde a imagem é publicada enquanto privado |

### Dialeto, engenharia e roadmap

| # | Título | Status |
|---|---|---|
| [0029](0029-guardrails-in-ci.md) | Guardrails no CI antes da primeira linha de lógica de produto | Aceito; três exceções de `std::fs` ratificadas (2026-09-29) |
| [0030](0030-base-dialect-obsidian-compatible.md) | Dialeto base compatível com o Obsidian; o Verso estende, nunca contradiz | Aceito |
| [0031](0031-fixtures-as-contract.md) | Fixtures são o contrato de comportamento entre mantenedor e IA | Aceito |
| [0032](0032-author-and-reviewer-roles.md) | Papéis: a IA escreve, o mantenedor revisa comportamento | Aceito |
| [0033](0033-pr-workflow.md) | Fluxo de PR | Aceito |
| [0034](0034-roadmap-in-phases.md) | Roadmap em três fases com portões de saída verificáveis | Aceito |
| [0035](0035-cross-cutting-requirements.md) | Requisitos transversais: pt-BR e EN, acessibilidade, benchmark | Aceito |
| [0036](0036-tabletop-rpg-support.md) | Suporte especial a RPG de mesa | Aceito (intenção) |
| [0049](0049-phase-2-scope-widened.md) | Escopo da Fase 2 ampliado a pedido do mantenedor | Aceito; nenhum menu próprio do Dock por enquanto (decidido em 2026-10-07) |
| [0051](0051-development-flow-and-releases.md) | Fluxo de desenvolvimento, versões e releases | Aceito |
| [0058](0058-demo-vault-as-tutorial.md) | O cofre de exemplo é o tutorial do produto, mantido a cada feature | Aceito (2026-10-01; revisado no mesmo dia: o roteiro roda por máquina no harness do navegador); o cofre de exemplo em inglês `[ABERTO]` |

### Decisões técnicas em aberto

| # | Título | Quando decidir |
|---|---|---|
| [0037](0037-base-parser.md) | Parser base do `verso-dialect`: `pulldown-cmark`, `comrak` como fallback | Aceito |
| [0038](0038-ts-type-generation.md) | Geração de tipos TypeScript a partir do Rust: `specta` com `tauri-specta` | Aceito |
| [0039](0039-performance-targets.md) | Metas de performance | Após a primeira linha de base |
| [0040](0040-board-persistence.md) | Persistência do board | Aceito (2026-09-30), pelo 0057 |

### Questões abertas levantadas na revisão da Fase 0

Fonte: [`../review/phase-0.md`](../review/phase-0.md). Cada uma começou sem
decisão e registra o que precisava ser respondido e quando; a última coluna diz
onde cada uma está.

| # | Título | Quando decidir |
|---|---|---|
| [0044](0044-verso-fs-semantics.md) | Semântica de `verso-fs`: symlinks, handles opacos, caminhos ignorados | Symlinks e caminhos ignorados: Aceito (2026-09-22); handles: aceitos como construídos para a Fase 2 (2026-09-24), reabertos antes que qualquer coisa fora das views do próprio app ganhe acesso a arquivos; o watcher: Aceito (2026-09-24); caminhos ignorados revistos em 2026-09-29 — a lista embutida e o `.gitignore`, atrás de ajustes — Aceito |
| [0045](0045-server-and-mcp-security.md) | Segurança do servidor, do MCP e do contrato | MCP: Aceito; contrato: aceito como foi construído para a Fase 2, `[ABERTO]` até um servidor entrar em escopo; servidor: antes de entrar em escopo |
| [0046](0046-index-location-lifecycle-tokenizer.md) | Índice: localização, ciclo de vida e tokenizador | Features 3 e 5 da Fase 1 |
| [0047](0047-plugin-api-open-questions.md) | Questões abertas da API de plugin | Antes de desenhar a API (depois da Fase 2) |
| [0048](0048-file-operations-in-ui.md) | Operações de arquivo na UI: renomear, criar, excluir, mover | Aceito (2026-09-23) |

## Itens em aberto que não viraram ADR

Três itens de dialeto do §17 vivem em [`../spec/dialect.md`](../spec/dialect.md),
onde o comportamento é especificado: sintaxe de relação tipada (item 6, decidida
em 2026-09-30 como a Q10, com o [0057](0057-board-json-canvas.md)), formato
e localização dos schemas (item 7, decidido em 2026-09-24 como a Q11, com o
[0052](0052-typed-note.md)) e sintaxe de visibilidade por bloco (item 8).
As lacunas de parsing (Q1–Q8, Q12–Q26) também vivem lá.

A verificação de disponibilidade do nome (item 2) está registrada em
[0004](0004-project-name-verso.md).

## Como escrever um ADR novo

1. Numerar em sequência: `NNNN-title-in-kebab-case.md`.
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
