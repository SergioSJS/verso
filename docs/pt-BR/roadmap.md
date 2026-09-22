# Roadmap do Verso

- Versão: 2026-09-21, revisão 2 (aplicação de `docs/review/phase-0.md`)
- Fonte: `docs/BRIEFING.md` §15
- ADR: [0034](adr/0034-roadmap-in-phases.md)

Três fases. Cada uma tem um critério de saída verificável: alguém que não
participou do trabalho consegue executar a verificação e concluir "passou" ou
"não passou" sem julgar mérito.

Uma fase não começa antes de a anterior fechar. Um item de escopo que não estiver
listado aqui não entra na fase sem virar decisão registrada.

**Fora de escopo até o fim da Fase 2:** sync, mobile, plugins, board e shim de
compatibilidade (§15). Isso vale mesmo que a implementação pareça barata no
momento.

---

## Fase 0 — Fundação

Documentos, decisões e guardrails. **Nenhuma feature.**

### Escopo

| # | Entrega | Estado |
|---|---|---|
| 0.1 | ADRs, um por decisão do briefing | feito nesta branch |
| 0.2 | `docs/spec/dialect.md` v0 | feito nesta branch |
| 0.3 | `docs/roadmap.md` | feito nesta branch |
| 0.4 | `CLAUDE.md` | feito nesta branch |
| 0.5 | `.github/pull_request_template.md` | feito nesta branch |
| 0.6 | Revisão crítica dos documentos por sessão independente | feito — `docs/review/phase-0.md`; achados aceitos e aplicados pelo mantenedor; diff da aplicação aguarda leitura pelo Opus 5 ([ADR 0032](adr/0032-author-and-reviewer-roles.md)) |
| 0.7 | Decisão de licença e arquivo `LICENSE` | feito — Pacote A, MPL-2.0 + MIT no SDK ([ADR 0005](adr/0005-license.md), Aceito). Allowlist do `cargo-deny` fecha no item 0.10 |
| 0.8 | Decisão do idioma da documentação | feito — inglês fonte, pt-BR espelho ([ADR 0008](adr/0008-documentation-language.md), Aceito) |
| 0.9 | Corpus inicial de fixtures: 5 casos rascunhados pela IA, seguindo o schema de `docs/spec/dialect.md` §4, cada um aprovado pelo mantenedor depois de conferir no app Obsidian (ADR 0031, regra alterada em 2026-09-21) | feito — cinco fixtures aprovadas pelo mantenedor em 2026-09-21 após observação pelo CLI do Obsidian (`docs/reference/obsidian-cli.md`); schema §4 confirmado, Q1 fechada |
| 0.10 | Workspace Cargo com os cinco crates, vazios | feito — `fmt`, `clippy`, `test` e `deny` verdes; guardrails de workspace vistos falhando localmente (PR #2) |
| 0.11 | CI em macOS e Linux com os guardrails **de workspace** ([ADR 0029](adr/0029-guardrails-in-ci.md)), incluindo a verificação de espelho da documentação | feito — baseline verde nos dois sistemas; cada guardrail visto falhando numa branch `test/guardrail-*` (links no PR do CI) |
| 0.12 | Migração da documentação: tradução para inglês nos caminhos canônicos, pt-BR movido para `docs/pt-BR/`, nomes de arquivo em inglês ([ADR 0008](adr/0008-documentation-language.md)) | feito — autoria de sessões Opus 5, revisão de Fable 5.1; `scripts/check-docs-mirror.sh` verde |

### Critério de saída

Todos verificáveis. A fase fecha quando os cinco passarem.

1. **Sem BLOQUEANTE aberto.** Nenhum achado classificado como BLOQUEANTE na
   revisão crítica segue sem resolução. Verificação: lista de achados da revisão,
   cada BLOQUEANTE com o commit que o resolve ou a decisão do mantenedor de
   rebaixá-lo. Estado: os três BLOQUEANTES de `docs/review/phase-0.md` (C1, C2,
   C3) foram resolvidos na revisão 2 deste roadmap; a seção "Resolução" da
   revisão aponta o que mudou.
2. **`LICENSE` presente na raiz.** Verificação: `test -f LICENSE`, e o arquivo
   corresponde ao pacote escolhido em [ADR 0005](adr/0005-license.md). Estado:
   satisfeito em 2026-09-21 — `LICENSE` contém a MPL-2.0 e o ADR 0005 está
   Aceito (Pacote A).
3. **CI verde em macOS e Linux.** Verificação: uma execução de
   `cargo fmt --check`, `cargo clippy`, `cargo test` e `cargo deny check` verde
   nos dois sistemas operacionais.
4. **Guardrails de workspace comprovadamente disparando.** Cada guardrail **de
   workspace** de [ADR 0029](adr/0029-guardrails-in-ci.md) é visto falhando numa
   branch de teste que introduz de propósito a violação que ele deve pegar, e a
   branch não é mesclada. Verificação: uma execução vermelha registrada por
   guardrail — `cargo fmt` divergente, `unsafe`, `unwrap` fora de teste,
   `std::fs` fora de `verso-fs`, licença fora da allowlist (provisória, marcada
   como tal), advisory conhecida. Guardrail que só existe no arquivo de CI e
   nunca foi visto falhar não conta. Os guardrails **de feature** (fuzz,
   round-trip, WASM, escrita atômica, confinamento, FTS5, benchmark, tipos
   gerados) não podem existir com crates vazios; cada um é visto falhando no PR
   da feature que o introduz, e isso é critério de saída da Fase 1 (item 3) e
   da Fase 2 (item 3).
5. **Cinco fixtures aprovadas.** Existem cinco pares
   `fixtures/<categoria>/<caso>/{input.md,expected.yaml}`, cobrindo categorias
   mínimas distintas de §11.4 e seguindo o schema de `docs/spec/dialect.md`
   §4, cada um aprovado pelo mantenedor depois de conferir o comportamento no
   app Obsidian (ADR 0031). Verificação: `scripts/check-fixtures.sh` reporta
   cinco fixtures, nenhuma marcada como rascunho; cada `observed:` diz a
   versão do app e como foi conferido; o PR que as adicionou carrega a
   aprovação do mantenedor. Estado: satisfeito em 2026-09-21 (cinco
   aprovadas, nenhuma rascunho; observadas com Obsidian 1.13.7).

### Não bloqueia a saída

Questões `[ABERTO]` de dialeto (`docs/spec/dialect.md`, seção 9, exceto o schema
da seção 4, que o item 0.9 confirma) e os ADRs
[0037](adr/0037-base-parser.md), [0038](adr/0038-ts-type-generation.md),
[0039](adr/0039-performance-targets.md), [0040](adr/0040-board-persistence.md)
e [0044](adr/0044-verso-fs-semantics.md) a
[0048](adr/0048-file-operations-in-ui.md). Cada um tem o seu próprio
momento de decisão, todos posteriores à Fase 0.

---

## Fase 1 — Core via CLI, sem UI

Um núcleo utilizável pelo terminal e por um agente. **Nenhuma janela.**

### Escopo

Ordem de execução do briefing §15:

| # | Crate | Entrega |
|---|---|---|
| 1 | `verso-dialect` | parse de links, blocos, headings e frontmatter; round-trip; alvo de fuzz |
| 2 | `verso-fs` | varrer pasta, confinamento de caminho, escrita atômica |
| 3 | `verso-index` | schema SQLite, FTS5, backlinks |
| 4 | `verso-cli` | `verso index`, `verso search`, `verso backlinks` |
| 5 | bench | gerador de vault sintético + linha de base |
| 6 | `verso-cli` | `verso mcp` somente leitura: buscar, ler, caminhar o grafo |
| 7 | `verso-cli` | mensagens em pt-BR e EN, nenhuma string literal solta ([ADR 0035](adr/0035-cross-cutting-requirements.md)); entra com a feature 4 |

### Decisões que precisam sair durante a fase

| Decisão | Quando | ADR |
|---|---|---|
| ~~Definição de round-trip (Q18)~~ | decidido em 2026-09-21: leitura (b), parser somente leitura (`docs/reference/parser-decision.md`) | `docs/spec/dialect.md` Q18, [0037](adr/0037-base-parser.md) |
| ~~Parser base: `pulldown-cmark`, `comrak` ou próprio~~ | decidido em 2026-09-21: `pulldown-cmark`, `comrak` como fallback (`docs/reference/parser-decision.md`) | [0037](adr/0037-base-parser.md) |
| Questões de parsing Q2–Q8, Q12–Q17 e Q19–Q25 da spec | antes da feature 1 fechar | `docs/spec/dialect.md` §9 |
| ~~Symlinks, laços e caminhos ignorados (Q26)~~ | decidido em 2026-09-22: todo symlink é seguido, profundidade máxima 64 com erro ao bater no limite; entradas ocultas não são percorridas; nota ignorada é alvo não resolvido e nunca fonte de backlink (`docs/reference/fs-decision.md`) | [0044](adr/0044-verso-fs-semantics.md) |
| ~~Mecanismo de detecção de placeholder por provedor, começando pelo iCloud Drive~~ | decidido em 2026-09-22: as duas formas do iCloud (`SF_DATALESS` e `.Nome.ext.icloud`), verificadas antes de o arquivo ser aberto; os demais provedores adiados (`docs/reference/fs-decision.md`) | [0043](adr/0043-placeholder-guard.md) |
| Localização, permissões e limpeza do índice | antes da feature 3 fechar | [0046](adr/0046-index-location-lifecycle-tokenizer.md) |
| ~~Regra de desambiguação entre `verso <pasta>` e subcomando~~ | decidido 2026-09-22: subcomando obrigatório na Fase 1; a regra da Fase 2 registrada e ainda aberta (`docs/reference/cli-decision.md`) | [0042](adr/0042-open-from-command-line.md) |
| Tokenizador do FTS5 para pt-BR e EN | antes de a feature 5 tirar a linha de base | [0046](adr/0046-index-location-lifecycle-tokenizer.md) |
| Metas de performance | depois da feature 5 produzir a linha de base | [0039](adr/0039-performance-targets.md) |
| Transporte do MCP, superfície exposta, versão do protocolo | antes da feature 6 fechar | [0045](adr/0045-server-and-mcp-security.md) |
| O que um handle opaco identifica e por quanto tempo | antes da feature 6 fechar | [0044](adr/0044-verso-fs-semantics.md) |

### Critério de saída

1. **Vault real indexa sem erro.** `verso index` roda sobre o vault real de
   campanha do mantenedor e termina com **código de saída 0, ou 1 quando o walk
   reportou um problema na pasta**, sem erro e sem panic. O `1` foi decidido
   pelo mantenedor em 2026-09-22 junto com os códigos de saída
   (`docs/reference/cli-decision.md` §6.2): um diretório ilegível é notícia
   sobre a pasta, não falha do comando, e também não pode ser reportado como
   sucesso. Verificação: executar o comando e conferir o código de saída e a
   saída padrão.
2. **Backlinks conferem com o esperado.** Para um conjunto de notas escolhido
   pelo mantenedor, a saída de `verso backlinks` bate com a lista que ele
   escreveu à mão antes de rodar o comando. Verificação: comparar as duas listas;
   divergência é falha, mesmo que o comando esteja "certo". A lista à mão segue
   as decisões de Q26 (caminhos ignorados) e Q20 (links Markdown), para que os
   dois lados contem a mesma coisa.
3. **Guardrails verdes e comprovadamente disparando.** Todos os guardrails de
   [ADR 0029](adr/0029-guardrails-in-ci.md), de workspace e de feature, passam
   sobre o código da fase, incluindo fuzzing do parser sem crash novo, property
   test de round-trip (na leitura decidida em Q18) e `cargo check` para
   `wasm32-unknown-unknown` de `verso-dialect`. Cada guardrail de feature foi
   visto falhando no PR que o introduziu. Verificação: execução de CI verde, a
   sessão de fuzz registrada, e uma execução vermelha registrada por guardrail
   de feature.
4. **Notas consultáveis por um agente.** O Claude, conectado ao `verso mcp`,
   responde a perguntas sobre o vault buscando, lendo e caminhando o grafo.
   Verificação: uma sessão registrada em que o agente responde e cita a origem
   — por `^id` quando o bloco tem um, por linha e coluna quando não tem
   (`docs/spec/dialect.md` §4.4) — e a citação leva à posição exata. Consulta
   por tipo fica para quando a nota tipada existir (Fase 2, item 2.6).
5. **Corpus de fixtures verde.** Todas as fixtures passam, e nenhum
   `expected.yaml` foi alterado sem aprovação explícita do mantenedor.
   Verificação: `cargo test` verde, mais `git log` de `fixtures/**/expected.yaml`
   sem commit não aprovado.
6. **CLI em dois idiomas — não é mais exigência, e está satisfeito assim
   mesmo.** O mantenedor estreitou a exigência em 2026-09-22
   ([ADR 0035](adr/0035-cross-cutting-requirements.md)): pt-BR e EN obrigam a
   interface da aplicação, não a CLI. A feature 7 a construiu bilíngue antes
   disso, e ela fica. Verificação, para quem quiser: rodar cada comando com os
   dois locales e conferir que nenhuma mensagem fica no outro idioma; uma
   divergência deixou de ser motivo para segurar a fase.

---

## Fase 2 — Esqueleto andante no macOS

A primeira versão que se usa. Só macOS ([ADR 0022](adr/0022-target-platforms-macos-first.md)).

### Escopo

| # | Entrega |
|---|---|
| 2.1 | Contrato core↔UI definido primeiro, com tipos TS gerados a partir do Rust |
| 2.2 | Shell Tauri v2 abrindo uma pasta arbitrária |
| 2.3 | Árvore de arquivos |
| 2.4 | Editor CodeMirror 6 com Live Preview |
| 2.5 | Backlinks e busca vindos do core, pelo contrato |
| 2.6 | Um tipo de nota ponta a ponta |
| 2.7 | pt-BR e EN na UI; acessibilidade ([ADR 0035](adr/0035-cross-cutting-requirements.md)) |

### Decisões que precisam sair durante a fase

| Decisão | Quando | ADR |
|---|---|---|
| Geração de tipos TS: `ts-rs` ou `specta` | início da fase, antes do contrato | [0038](adr/0038-ts-type-generation.md) |
| Identidade de sessão e autorização por operação no contrato | antes do item 2.1 | [0045](adr/0045-server-and-mcp-security.md) |
| Semântica dos handles opacos no contrato | antes do item 2.1 | [0044](adr/0044-verso-fs-semantics.md) |
| Renomear, criar, excluir, mover; atualização de links; modificação externa concorrente | antes do item 2.3 | [0048](adr/0048-file-operations-in-ui.md), [0012](adr/0012-files-are-source-of-truth.md) |
| Promoção de nota tipada ([0014](adr/0014-primitives-catalog.md)) e de degradação para Markdown ([0013](adr/0013-degrades-to-markdown.md)) a ADR próprio, Aceito | antes da nota tipada (2.6) | ADR novo |
| Formato e localização dos schemas | antes da nota tipada (2.6) | `docs/spec/dialect.md` Q11 |

### Critério de saída

1. **Um mês de uso real.** O mantenedor usa o Verso na preparação de mesa por um
   mês corrido, sem voltar ao Obsidian para tarefa que o Verso deveria cobrir.
   Verificação: as notas de campanha do período foram escritas no Verso, e o
   mantenedor registra o que o fez voltar, quando voltou.
2. **Nenhuma perda de dado no período.** Nenhum arquivo corrompido, truncado ou
   reescrito sem ação do usuário durante o mês
   ([ADR 0012](adr/0012-files-are-source-of-truth.md)). Verificação:
   histórico do git do vault do mantenedor sem diff que ele não tenha feito.
   Isso inclui: nenhuma edição feita no Obsidian sobrescrita pelo Verso
   (modificação externa concorrente) e nenhum rename que tenha reescrito outro
   arquivo sem diff ([0048](adr/0048-file-operations-in-ui.md)).
3. **Guardrails verdes e fixtures intactas.** Mesmo critério da Fase 1, itens 3
   e 5, agora incluindo o código de UI e a verificação de tipos TS gerados
   atualizados ([ADR 0029](adr/0029-guardrails-in-ci.md)).

O portão é uso, não checklist: com os sete itens de escopo prontos e o mês de uso
não acontecendo, a fase não fechou.

---

## Depois da Fase 2

Sem ordem nem prazo definidos no briefing. Entram na conversa quando a Fase 2
fechar: sync ([0020](adr/0020-sync-merge-in-core-transports-as-plugins.md)),
mobile ([0025](adr/0025-own-server-and-mobile-pwa.md)), plugins
([0016](adr/0016-plugins-execution-and-capabilities.md), com as questões de
[0047](adr/0047-plugin-api-open-questions.md) respondidas antes do
desenho da API), board ([0024](adr/0024-board-excalidraw.md)), shim de
compatibilidade ([0017](adr/0017-plugins-format-shim-loading.md)), as
primitivas ainda propostas ([0014](adr/0014-primitives-catalog.md)) e a
**escrita por agente com diff** ([0018](adr/0018-llm-native-mcp-in-core.md),
`DECIDIDO`, sem fase atribuída: a Fase 1 entrega MCP somente leitura e a Fase 2
não a inclui).

Ordem entre eles: `[ABERTO]`.
