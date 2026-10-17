# Roadmap do Verso

- Versão: 2026-10-15, revisão 9 (o estado de V.1 a V.8, V.17 a V.20 e V.23 trazido ao que está construído no `a162f83e` — ondas A, A2, B e C, integradas, verificadas, não enviadas, não lançadas —, a contagem de V.15, a linha das páginas web embutidas; nada anterior reescrito). Revisão 8, 2026-10-14 (a V1 escrita, depois da Fase 3, a partir da palavra do mantenedor de 2026-10-14, *"VAI SER TUDO NA V1"*: oito funcionalidades, cada uma com um ADR proposto naquele dia — do [0085](adr/0085-hover-preview.md) ao [0092](adr/0092-the-phone-offline.md) — e as pendências que bloqueiam a V1; o ADR 0083 e o ADR 0084 como estão; o que ainda não está decidido sobre a V1 marcado `[ABERTO]` com uma recomendação; notas datadas acrescentadas às decisões da Fase 3 sobre o offline no celular e sobre o histórico, e a "Depois da Fase 2"; nada das fases anteriores reescrito; na mesma noite, as respostas do mantenedor às questões abertas da V1 registradas como `[DECIDIDO 2026-10-14]` — o nome "Fase 4 — V1", o trabalho em três ondas, quais lacunas de núcleo entram na V1 e quais vêm depois, a criptografia ponta a ponta e o MCP pela rede depois da V1 —, as questões de cada ADR ainda abertas; mais tarde naquela noite, *"Sim, todas"*: todas as recomendações aceitas, os oito ADRs aceitos, R1 a R4 decididas, a Q9 da spec fechada (v0.38), o ADR 0073 e o ADR 0036 com linhas de Revisões, e `docs/reference/manual-checks.md` dizendo que as checagens são condição só da publicação da V1; e, respondendo às perguntas da construção da onda A, *"Sim, todas"* de novo: a onda de cada lacuna de núcleo e as questões do dialeto que a V1 leva decididas; depois, três ADRs escritos, propostos — [0093](adr/0093-periodic-notes.md) (notas periódicas), [0094](adr/0094-the-rest-of-bases.md) (o resto das bases) e [0095](adr/0095-mac-notarization-and-windows-code-signing.md) (notarização no Mac, assinatura de código no Windows e o build para Mac Intel) — e as linhas V.11, V.18, V.19 e V.21 e a R3 apontando para eles; aceitos naquela noite, *"Sim, todas"*: todas as recomendações dos três, e o código público de um plugin de código aberto que o Obsidian publica tornado fonte admissível (ADR 0009, revisado)). Revisão 7, 2026-10-12 (a Fase 2 declarada fechada em 2026-10-09 pelo mantenedor, respondendo à auditoria dos ADRs, *"Ajuste tudo que precisar. Está aprovado os ADRs"* — o `[ABERTO]` no começo da Fase 3 respondido, e o que ainda faltava ao critério de saída e ao escopo da Fase 2 passado para a Fase 3 como pendências dela; notas datadas ao lado de "uma fase não começa antes de a anterior fechar" e do portão da Fase 2; as linhas 3.23 e 3.24 acrescentadas no mesmo dia a partir do *"Todos aprovados"* do mantenedor). Revisão 6, 2026-10-11 (a tabela da Fase 3 ganha o que foi construído desde a revisão 5 — [0077](adr/0077-the-server-administration-console-and-folder-quotas.md), [0078](adr/0078-universo-the-name-of-verso-as-a-server.md), [0079](adr/0079-sync-a-local-folder-with-a-server.md) — e os aceitos [0080](adr/0080-the-trash-with-expiry-and-restore.md), [0081](adr/0081-sharing-between-people-on-one-universo.md) e [0082](adr/0082-live-co-editing-of-a-synced-folder.md) na ordem que o mantenedor definiu em 2026-10-11, *"Sim para todos"*; as permissões mais finas riscadas como aceitas com o 0081; "Depois da Fase 2" posto em dia quanto ao sync; as linhas 3.10–3.16, que afetam o critério de saída, foram escritas a partir da recomendação do memorando, não de uma das oito respostas do mantenedor, e aguardavam a aceitação do mantenedor — regra zero; em 2026-10-12, dentro desta revisão, as linhas 3.13, 3.14 e 3.16 marcadas como construídas e a 3.15 como feita, as linhas 3.10–3.16 **aceitas pelo mantenedor** naquela noite, "Ok", e as linhas 3.17–3.21 acrescentadas a partir das respostas do mantenedor da mesma noite; as linhas 3.10, 3.14, 3.20 e 3.21 postas em dia com o que foi construído pela auditoria de 2026-10-12). Revisão 5, 2026-10-09 (a Fase 3 escrita, a partir do [ADR 0073](adr/0073-self-hosted-server-first.md) aceito pelo mantenedor com o 0074, o 0075 e o 0076; a identidade de sessão do contrato e os handles para o `verso serve` riscados como decididos). Revisão 4, 2026-09-24 (as decisões do mantenedor de 2026-09-24 riscadas: os handles nas duas fases, e as duas linhas da nota tipada, com o item 2.6 sem esperar mais por elas). Revisão 3, 2026-09-23: a Fase 2 como construída; as decisões da Fase 1 tomadas em 2026-09-22 riscadas
- Fonte: `docs/BRIEFING.md` §15
- ADR: [0034](adr/0034-roadmap-in-phases.md)

Três fases, e desde 2026-10-09 uma quarta, a Fase 3
([ADR 0073](adr/0073-self-hosted-server-first.md)). *(Desde 2026-10-14, uma quinta,
a Fase 4 — V1, abaixo, assim nomeada pelo mantenedor naquela noite.)* Cada uma tem um critério de saída verificável: alguém que não
participou do trabalho consegue executar a verificação e concluir "passou" ou
"não passou" sem julgar mérito.

Uma fase não começa antes de a anterior fechar. *(A Fase 3 começou
em 2026-10-09 com o critério de saída da Fase 2 não cumprido; em
2026-10-12 o mantenedor declarou a Fase 2 fechada naquele dia, as
pendências dela passadas para a Fase 3 — abaixo.)* Um item de escopo que não estiver
listado aqui não entra na fase sem virar decisão registrada.

**Fora de escopo até o fim da Fase 2:** sync, mobile, plugins e shim de
compatibilidade (§15). Isso vale mesmo que a implementação pareça barata no
momento. O board esteve nesta lista até 2026-09-30, quando o mantenedor o
puxou para a Fase 2 ([ADR 0057](adr/0057-board-json-canvas.md)).
Sync e mobile saíram dela em 2026-10-09 para a Fase 3, na forma que o
[ADR 0073](adr/0073-self-hosted-server-first.md) lhes dá — mobile pelo
navegador, servido pelo servidor; sync depois do servidor e por ele.
Plugins e o shim de compatibilidade continuam nela.

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
| Questões de parsing Q2–Q8, Q12–Q17 e Q19–Q25 da spec | antes da feature 1 fechar; Q12 fechada em 2026-09-22 com as partes de Q2, Q8 e Q14 de que precisava, Q3 e Q17 em parte, as outras ainda abertas | `docs/spec/dialect.md` §9 |
| ~~Symlinks, laços e caminhos ignorados (Q26)~~ | decidido em 2026-09-22: todo symlink é seguido, profundidade máxima 64 com erro ao bater no limite; entradas ocultas não são percorridas; nota ignorada é alvo não resolvido e nunca fonte de backlink (`docs/reference/fs-decision.md`) | [0044](adr/0044-verso-fs-semantics.md) |
| ~~Mecanismo de detecção de placeholder por provedor, começando pelo iCloud Drive~~ | decidido em 2026-09-22: as duas formas do iCloud (`SF_DATALESS` e `.Nome.ext.icloud`), verificadas antes de o arquivo ser aberto; os demais provedores adiados (`docs/reference/fs-decision.md`) | [0043](adr/0043-placeholder-guard.md) |
| ~~Localização, permissões e limpeza do índice~~ | decidido em 2026-09-22: um arquivo por pasta no diretório de configuração, um sidecar que nomeia a pasta, `0700`/`0600`, fora do backup, limpeza sob demanda (`docs/reference/index-decision.md`) | [0046](adr/0046-index-location-lifecycle-tokenizer.md) |
| ~~Regra de desambiguação entre `verso <pasta>` e subcomando~~ | decidido 2026-09-22: subcomando obrigatório na Fase 1; a regra da Fase 2 registrada e ainda aberta (`docs/reference/cli-decision.md`) — decidida pelo mantenedor em 2026-09-23 (Status do 0042) | [0042](adr/0042-open-from-command-line.md) |
| ~~Tokenizador do FTS5 para pt-BR e EN~~ | decidido em 2026-09-22: `unicode61` com `remove_diacritics 2`, sem stemming | [0046](adr/0046-index-location-lifecycle-tokenizer.md) |
| Metas de performance | depois da feature 5 produzir a linha de base; a linha de base do Mac existe desde o commit `6b53c64` (`crates/verso-bench/baselines.json`), as metas continuam abertas | [0039](adr/0039-performance-targets.md) |
| ~~Transporte do MCP, superfície exposta, versão do protocolo~~ | decidido em 2026-09-22: stdio, sete ferramentas somente leitura, a versão que o `initialize` negociar (`docs/reference/mcp-decision.md`); ampliado em 2026-10-07 para nove — relações tipadas, boards, propriedades e tags, bases | [0045](adr/0045-server-and-mcp-security.md), [0066](adr/0066-mcp-sees-boards-relations-properties-bases.md) |
| ~~O que um handle opaco identifica e por quanto tempo~~ | decidido em 2026-09-24, como construído: notas nomeadas pelo caminho relativo — o MCP, a CLI e a janela — e o handle um índice numa tabela de caminhos dentro do processo; reaberto antes que qualquer coisa fora das views do próprio app ganhe acesso a arquivos (`docs/reference/handles-decision.md`) | [0044](adr/0044-verso-fs-semantics.md) |

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

A primeira versão que se usa. Só macOS
([ADR 0022](adr/0022-target-platforms-macos-first.md)) como planejado; desde
2026-10-07 o **app de Windows** está no escopo desta fase também, à frente
do resto do trabalho dela, e sai antes de a fase fechar
([ADR 0069](adr/0069-windows-port.md), o mantenedor: "Vou passar windows na
frente").

**Fechada em 2026-10-09**, declarada pelo mantenedor em 2026-10-12; o
que ainda lhe faltava passa para a Fase 3 ("Herdado da Fase 2", abaixo).

### Escopo

| # | Entrega | Estado em 2026-09-24 |
|---|---|---|
| 2.1 | Contrato core↔UI definido primeiro, com tipos TS gerados a partir do Rust | construído: `crates/verso-contract`, bindings gerados pelo `specta`, verificados no CI |
| 2.2 | Shell Tauri v2 abrindo uma pasta arbitrária | construído: pelo diálogo, por `verso <pasta>` ou pela última pasta ao iniciar |
| 2.3 | Árvore de arquivos | construída, com criar, renomear, mover, lixeira e cópia; operações de arquivo decididas em 2026-09-23 como construídas ([0048](adr/0048-file-operations-in-ui.md)) |
| 2.4 | Editor CodeMirror 6 com Live Preview | construído: leitura, Live Preview e fonte |
| 2.5 | Backlinks e busca vindos do core, pelo contrato | construídos, com links, tags, menções sem link e o grafo |
| 2.6 | Um tipo de nota ponta a ponta | construído em 2026-10-07, linhas 1 a 6 da seção 8 do memo (`docs/reference/typed-note-decision.md`): os `schemas` do parser, os tipos e os blocos de schema do índice (versão 10, carregada no lugar), a tipagem do core na hora da consulta, o painel, `type:` na busca, o MCP; decidido em 2026-09-24 ([0052](adr/0052-typed-note.md), Q11 da spec); as duas fixtures de schema aprovadas no mesmo dia. À espera da leitura do mantenedor |
| 2.7 | pt-BR e EN na UI; acessibilidade ([ADR 0035](adr/0035-cross-cutting-requirements.md)) | idiomas construídos, escolhidos nos ajustes; acessibilidade auditada estaticamente contra a WCAG 2.2 AA em 2026-09-24, num branch local — o que foi corrigido e o que espera o mantenedor está na [revisão](review/accessibility.md); ainda não percorrida com um leitor de tela |

Além dos sete itens, o mantenedor pediu durante a fase o que faltaria a quem
sai do Obsidian; a lista é a [ADR 0049](adr/0049-phase-2-scope-widened.md), e o
que a janela faz com cada arquivo está em `docs/reference/app-decision.md`. Em
2026-09-24 o mantenedor tornou mais três a prioridade, construídas no mesmo
dia: visões sobre a pasta — tabelas, cards, listas, kanbans e calendários,
como as bases do Obsidian ([ADR 0053](adr/0053-views-bases.md)) — uma segunda
janela na mesma pasta, e o terminal e os agentes ligados pelos ajustes
([ADR 0054](adr/0054-terminal-and-agents-from-the-app.md)); o memo é
`docs/reference/views-decision.md`. Em 2026-09-30 o mantenedor puxou também o
board — um `.canvas` desenhado com o Excalidraw, relações tipadas no
frontmatter, a conversão dos desenhos do plugin Excalidraw
([ADR 0057](adr/0057-board-json-canvas.md)); o memo é `docs/reference/board-decision.md`.
Em 2026-10-02 o mantenedor puxou as funcionalidades de organização do
make.md — rótulos, páginas de pasta, ordem manual e fixados, editar uma nota
embutida no lugar ([ADR 0060](adr/0060-makemd-organizing-features.md)); o
memo é `docs/reference/makemd-decision.md`. Em 2026-10-06 o mantenedor puxou
os blocos do Notion no modo Editar — uma alça para arrastar um parágrafo, um
item de lista ou qualquer outro bloco, um `+`, um menu por bloco e as teclas
do Notion ([ADR 0061](adr/0061-blocks-in-edit-mode.md)).

### Decisões que precisam sair durante a fase

| Decisão | Quando | ADR |
|---|---|---|
| ~~Geração de tipos TS: `ts-rs` ou `specta`~~ | decidido em 2026-09-22: `specta` com `tauri-specta`, tipos e assinaturas dos comandos gerados | [0038](adr/0038-ts-type-generation.md) |
| ~~Identidade de sessão e autorização por operação no contrato~~ | decidido em 2026-10-09 com o ADR 0073: todo comando carrega a sessão que o transporte autenticou, resolvida para uma conta e um papel antes de o `verso-fs` agir; o app desktop com pasta local mantém o dono implícito ([0074](adr/0074-accounts-and-access-on-the-server.md) item 11). Antes: antes do item 2.1; o contrato, construído com o host confiando nas próprias janelas e em nada mais (`docs/reference/app-decision.md` §7), aceito como foi construído para a Fase 2 em 2026-09-23; ainda aberto até um servidor entrar em escopo | [0045](adr/0045-server-and-mcp-security.md) |
| ~~Semântica dos handles opacos no contrato~~ | decidido em 2026-09-24, como construído para a Fase 2: o contrato nomeia notas pelo caminho relativo, nenhuma capacidade o cruza, e a revisão é o único token; reaberto antes que um plugin, um cliente mobile ou o `verso serve` ganhe acesso a arquivos (`docs/reference/handles-decision.md`); para o `verso serve` respondido em 2026-10-09: a sessão e o papel dela na pasta são a capacidade de acesso, nenhuma capacidade por arquivo cruza (0044, "Num servidor") | [0044](adr/0044-verso-fs-semantics.md) |
| ~~Renomear, criar, excluir, mover; atualização de links; modificação externa concorrente~~ | decidido em 2026-09-23: opção (b), como o código faz — planos mostrados como diffs, sem transação lógica, a lixeira | [0048](adr/0048-file-operations-in-ui.md), [0012](adr/0012-files-are-source-of-truth.md) |
| ~~Promoção de nota tipada ([0014](adr/0014-primitives-catalog.md)) e de degradação para Markdown ([0013](adr/0013-degrades-to-markdown.md)) a ADR próprio, Aceito~~ | decidido em 2026-09-24: a nota tipada num ADR novo, Aceito; a degradação para Markdown aceita no lugar, com "views" e "dado estruturado" delimitados (`docs/reference/typed-note-decision.md`) | [0052](adr/0052-typed-note.md), [0013](adr/0013-degrades-to-markdown.md) |
| ~~Formato e localização dos schemas~~ | decidido em 2026-09-24: um bloco cercado `verso-schema` numa nota, em qualquer lugar da pasta menos caminhos ocultos e ignorados; dois schemas com o mesmo nome não tipam nada | `docs/spec/dialect.md` Q11, [0052](adr/0052-typed-note.md) |

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

*(2026-10-12: o mantenedor declarou a Fase 2 fechada em 2026-10-09, o dia
em que a Fase 3 começou, com os itens 1 a 3 acima não registrados como
cumpridos; eles passam para a Fase 3, abaixo. O texto acima fica como
decidido.)*

---

## Fase 3 — O app de Linux, depois o servidor auto-hospedado

Decidida em 2026-10-09 pelo mantenedor, ao aceitar o
[ADR 0073](adr/0073-self-hosted-server-first.md) junto com o
[0074](adr/0074-accounts-and-access-on-the-server.md), o
[0075](adr/0075-server-packaging-and-storage.md) e o
[0076](adr/0076-the-window-on-every-screen.md): o app de Linux primeiro,
depois um servidor auto-hospedado — o core sem janela, alcançado por um
navegador, um celular, um tablet e o app desktop, com várias pessoas numa
pasta. O critério de saída da Fase 2 não está registrado como cumprido, e
a resposta do mantenedor começa este trabalho agora (*"L deve vir
agora"*); como isso fica diante de "uma fase não começa antes de a
anterior fechar", acima, é `[ABERTO]`, para o mantenedor dizer. *(Respondido pelo mantenedor
em 2026-10-12, aceitando a recomendação da auditoria dos ADRs — "Ajuste tudo que precisar. Está aprovado os ADRs": a Fase 2 está fechada em
2026-10-09, o dia em que a Fase 3 começou, e o que ainda lhe faltava passa
a pendências da Fase 3 — "Herdado da Fase 2", abaixo.)*

### Escopo

| # | Entrega | ADR |
|---|---|---|
| 3.1 | O app de Linux — lançado na 0.6.0-beta.1 em 2026-10-09 | [0071](adr/0071-linux-port.md) |
| 3.2 | `verso serve`, um subcomando do `verso`: a tabela de sessões e o despacho em `crates/verso-service`, HTTP, WebSocket, as contas e o banco do servidor em `crates/verso-server`; o contrato pelo fio, com a versão sendo um hash dos bindings gerados | [0073](adr/0073-self-hosted-server-first.md) item 2, [0028](adr/0028-crate-structure.md), [0075](adr/0075-server-packaging-and-storage.md) item 1 |
| 3.3 | Contas e acesso: o primeiro admin a partir do ambiente, senha e depois chaves de acesso, convites, papéis por pasta, sessões, tokens de acesso pessoal, o log de auditoria | [0074](adr/0074-accounts-and-access-on-the-server.md) |
| 3.4 | Segurança antes do primeiro usuário que não seja o mantenedor: TLS atrás de um proxy reverso ou do `tailscale serve`, ou com o certificado do próprio servidor; os handles e os symlinks num servidor; o modelo de ameaças antes de o servidor ser anunciado | [0073](adr/0073-self-hosted-server-first.md) item 6, [0044](adr/0044-verso-fs-semantics.md) |
| 3.5 | Empacotamento e armazenamento: a imagem Docker (amd64, arm64), o arquivo compose do CasaOS/ZimaOS, `.deb`/`.rpm` com systemd; o diretório de dados e a raiz das pastas; o id de uma pasta; o espaço que cada pasta ocupa; a checagem de atualização | [0075](adr/0075-server-packaging-and-storage.md) |
| 3.6 | O app desktop conectando a um servidor, entrando pelo navegador | [0074](adr/0074-accounts-and-access-on-the-server.md) item 8 |
| 3.7 | A janela em toda tela, e a janela servida com `--web` | [0076](adr/0076-the-window-on-every-screen.md), [0073](adr/0073-self-hosted-server-first.md) item 9 |
| 3.8 | Edição simultânea de notas | [0073](adr/0073-self-hosted-server-first.md) item 7 |
| 3.9 | A reindexação por lote do watcher estreitada aos caminhos do lote, medida com o benchmark | [0073](adr/0073-self-hosted-server-first.md) item 12 |
| 3.10 | O console de administração do servidor em `/admin`, e cotas por pasta — construídos em 2026-10-10; um admin encerrando as sessões de outra conta e revogando os tokens dela, com uma linha de auditoria, decidido em 2026-10-11, construído em 2026-10-11 (ae23725) | [0077](adr/0077-the-server-administration-console-and-folder-quotas.md) |
| 3.11 | UniVerso, o nome do Verso como servidor — construído em 2026-10-10 | [0078](adr/0078-universo-the-name-of-verso-as-a-server.md) |
| 3.12 | Sync de uma pasta local do desktop com uma pasta num servidor — construído em 2026-10-10 e posto em campanha em 2026-10-10 e 2026-10-11; o merge de acréscimos, o nome do aparelho definido pela pessoa, a versão do protocolo de sync e o limite de 1 GiB decididos em 2026-10-11 | [0079](adr/0079-sync-a-local-folder-with-a-server.md), [0074](adr/0074-accounts-and-access-on-the-server.md) item 8 |
| 3.13 | Coedição ao vivo de uma pasta sincronizada — aceita em 2026-10-11; a primeira na ordem depois desta rodada; construída na noite de 2026-10-11 para 12 (juntada pelo 817886e, 2026-10-12) | [0082](adr/0082-live-co-editing-of-a-synced-folder.md) |
| 3.14 | A lixeira com expiração e restauração, com o item 12 dela: a versão que a escrita de um aparelho substituiu, guardada e restaurável (o achado F18 da campanha) — aceita em 2026-10-11; a segunda; construída, com o item 12, na noite de 2026-10-11 para 12 (f3edc42; o 5b5fb9c, da mesma noite, corrige o tempo de um teste no Windows, não a lixeira) | [0080](adr/0080-the-trash-with-expiry-and-restore.md), [0079](adr/0079-sync-a-local-folder-with-a-server.md) Consequências |
| 3.15 | O modelo de ameaças atualizado (`docs/reference/threat-model.md`), com os `[ABERTO]` dele — o terceiro, antes do compartilhamento; feito em 2026-10-11 (4c09fc9), as lacunas que achou fechadas pelo reforço juntado no 60c717c, exceto as que ele lista como ainda abertas, e os `[ABERTO]` dele mantidos abertos | [0073](adr/0073-self-hosted-server-first.md) item 6 |
| 3.16 | Compartilhamento entre pessoas num UniVerso: uma concessão num caminho, leitura ou escrita — aceito em 2026-10-11; o quarto; construído na noite de 2026-10-11 para 12 (juntado pelo 2f25923, 2026-10-12) | [0081](adr/0081-sharing-between-people-on-one-universo.md) |
| 3.17 | Uma renomeação por quem recebe reescreve os links do dono fora do compartilhamento — decidido em 2026-10-12; construído em 2026-10-12 no `feat/share-next`: o servidor escreve as reescritas das notas fora do compartilhamento, quem recebe só fica sabendo das de dentro | [0081](adr/0081-sharing-between-people-on-one-universo.md) item 11 |
| 3.18 | Os agregados que quem recebe vê — as contagens do índice, as fórmulas de uma base — zerados — decidido em 2026-10-12; construído em 2026-10-12 no `feat/share-next`: cada um conta só o que está dentro do compartilhamento, e o que não dá para restringir é zero; e (2026-10-12, `fix/round-gaps`) o cursor do sync por um compartilhamento conta as mudanças do próprio compartilhamento — a cabeça, os números do `sync_changes` e o aviso de que algo mudou não dizem nada da atividade do dono fora dele | [0081](adr/0081-sharing-between-people-on-one-universo.md) item 11 |
| 3.19 | As escritas que o painel de propriedades e a citação de um PDF fazem numa nota ao vivo passam pela sala — decidido em 2026-10-12, construído em 2026-10-12 | [0082](adr/0082-live-co-editing-of-a-synced-folder.md) Status |
| 3.20 | A presença carimbada pelo servidor com a conta de quem a manda (a lacuna 11 do modelo de ameaças) — decidido em 2026-10-12, construído (3bc56ae), mesclado por d2a72b0; o 241c233 registra a lacuna fechada | [0073](adr/0073-self-hosted-server-first.md) item 6, `docs/reference/threat-model.md` |
| 3.21 | A página de aprovação de aparelho contra phishing por código de aparelho (a lacuna 12 do modelo de ameaças) — decidido em 2026-10-12, construído (5838c10), mesclado por d2a72b0; o 241c233 registra a lacuna fechada | [0073](adr/0073-self-hosted-server-first.md) item 6, [0074](adr/0074-accounts-and-access-on-the-server.md) item 8, `docs/reference/threat-model.md` |
| 3.22 | A camada de ajustes da pasta (ADR 0070 itens 1–2): os favoritos, as regras de varredura e o nome da nota de pasta em `.verso/settings.json`, levados pela sincronização — construído em 2026-10-12 | [0070](adr/0070-what-travels-with-the-folder.md) itens 1–2, [0079](adr/0079-sync-a-local-folder-with-a-server.md) item 2 |
| 3.23 | Um nome novo que só difere em maiúsculas e minúsculas de uma entrada da pasta dele recusado — `nota.md` ao lado de `Nota.md` —, em todo sistema e no servidor, com o motivo; uma entrada existente nunca recusada (o lado da criação da Q8 da spec) — decidido em 2026-10-12, construído em 2026-10-12 | [0070](adr/0070-what-travels-with-the-folder.md) item 3, `docs/spec/dialect.md` Q8 |
| 3.24 | Os favoritos de um leitor voltam para esta máquina: uma conta que não pode escrever a camada da pasta marca e desmarca a estrela nesta máquina em vez de ser recusada, e os Ajustes dizem "Desta máquina" — decidido em 2026-10-12, construído em 2026-10-12 | [0070](adr/0070-what-travels-with-the-folder.md) itens 1–2 |
| 3.25 | Coedição ao vivo de boards, desenhos e todo arquivo de texto: um board é uma sala dos seus elementos fundidos pela regra do próprio Excalidraw (a `version` maior, no empate o `versionNonce` menor; apagar é uma lápide que um movimento ao mesmo tempo não desfaz), com os ponteiros, as seleções e os nomes dos outros, a sala gravando o arquivo que o conversor das janelas fez exatamente do estado que ela tem; um `.txt`, `.json`, `.csv`, o `.base` de uma base (os ajustes da visão dela inclusive) e o código de uma página são salas como a de uma nota; uma nota editada no cartão de um board está na sala da nota; um desenho do plugin é mostrado, nunca editado, e o texto dele é uma nota, ao vivo como as notas; num servidor e pelo link de uma pasta sincronizada — decidido pelo mantenedor em 2026-10-12 ("Deveria estar"), construído em 2026-10-12 em `feat/coedit-everything` (21d096a, 5a027db) | [0082](adr/0082-live-co-editing-of-a-synced-folder.md) item 12, [0057](adr/0057-board-json-canvas.md), [0073](adr/0073-self-hosted-server-first.md) item 7, `docs/reference/threat-model.md` |

Os itens 3.2 a 3.9 saem juntos, na primeira versão do servidor (item 12
do ADR 0073, revisto em 2026-10-09). A janela em toda tela é construída
antes de a janela do servidor sair; as chaves de acesso vêm depois do
login por senha, quando o pipeline de empacotamento funcionar. O que vem
depois da primeira versão do servidor está em "Depois da Fase 2", abaixo.

Os itens 3.10 a 3.12 foram construídos na rodada que seguiu a primeira
versão do servidor (0.7.0-beta.1, 2026-10-10), aberta pelo mantenedor no
mesmo dia (*"quero sincronização funcionando também"*, [0079](adr/0079-sync-a-local-folder-with-a-server.md) Fonte e
Status), e ainda não foram lançados. A ordem depois desta rodada, definida
pelo mantenedor em 2026-10-11 respondendo a um memorando de recomendações
com *"Sim para todos"*: 3.13 → 3.14 → 3.15 → 3.16 — a coedição ao vivo, a
lixeira com a versão substituída, o modelo de ameaças atualizado, o
compartilhamento. O modelo de ameaças antes do compartilhamento é a razão
do memorando para a ordem: o item 6 do
[0073](adr/0073-self-hosted-server-first.md) pede segurança por inteiro
antes do primeiro usuário que não seja o mantenedor. Os itens 3.13, 3.14
e 3.16 foram construídos, e o 3.15 feito, na noite de 2026-10-11 para 12,
e nenhum foi lançado ainda; as perguntas em aberto que a construção
levantou foram mandadas ao mantenedor na mesma noite, cada uma listada no
Status da ADR dela. O mantenedor as respondeu à 01:15 BRT de 2026-10-12,
cada resposta registrada na ADR dela, e aceitou as linhas 3.10 a 3.16
("Ok"). As linhas 3.17 a 3.21 vêm dessas respostas: a 3.20 e a 3.21,
decididas *"seguros desde o dia 0"*, estavam sendo construídas naquela
noite no `feat/universo-small`, com o sync revogado do item 8 do
[0081](adr/0081-sharing-between-people-on-one-universo.md) desligado com
um aviso; da 3.17 à 3.19 vêm na próxima rodada. *(Construídas: a 3.20 em
3bc56ae, a 3.21 em 5838c10, o sync revogado em 6c7800e, mesclados no
`feat/universo` por d2a72b0 em 2026-10-12; o 241c233 registra as lacunas
11 e 12 do modelo de ameaças fechadas. Da 3.17 à 3.19, e a 3.22, foram
construídas em 2026-10-12 — *"Ajuste todas essas pendências agora"* — e
mescladas no `feat/universo` por 5b07712, 35d30ae e 05033f2, com o F31 da
campanha: um arquivo cruza em pedaços lidos do disco.)*

As linhas 3.23 e 3.24 vêm do *"Todos aprovados"* do mantenedor de
2026-10-12, por volta das 16:00 BRT, que aprovou as sete decisões abertas
da rodada como recomendado — as outras fecham itens `[ABERTO]` do
[0070](adr/0070-what-travels-with-the-folder.md), do item 12 do
[0079](adr/0079-sync-a-local-folder-with-a-server.md) e da §14 de
`docs/reference/server-install.md` sem trabalho novo. As duas foram
construídas no mesmo dia no `feat/decisions-2026-10-12`, mescladas no
`feat/universo` pelo ceb724e.

**Herdado da Fase 2** (o mantenedor, 2026-10-12, fechando a Fase 2 em
2026-10-09). A Fase 3 termina quando nenhuma tarefa dela está pendente, e
estas estão entre as tarefas dela:

- O critério de saída 1 da Fase 2, **um mês de uso real**: o mantenedor
  prepara as mesas no Verso por um mês corrido, sem voltar ao Obsidian para
  tarefa que o Verso deveria cobrir, e registra o que o fez voltar — não
  registrado como cumprido.
- O critério de saída 2 da Fase 2, **nenhuma perda de dado nesse mês**: o
  histórico do git do vault do mantenedor sem diff que ele não tenha feito
  — medido no mesmo mês.
- O critério de saída 3 da Fase 2, **guardrails verdes e fixtures
  intactas**, o código de UI e os tipos TS gerados incluídos — conferido
  no fechamento de 2026-10-12: `scripts/check.sh` verde no d15c4d1 (todos
  os guardrails, as fixtures, 525 + 38 testes de ponta a ponta, os
  bindings), `scripts/check-linux.sh` e `scripts/check-windows.sh` verdes
  no b140275.
- A linha 2.6 do escopo da Fase 2, a nota tipada: a leitura do
  mantenedor, que a linha diz esperar.
- A linha 2.7 do escopo da Fase 2, acessibilidade: a passada com um
  leitor de tela, que a linha diz não ter sido feita.

### Decisões que precisam sair durante a fase

| Decisão | ADR |
|---|---|
| ~~Se o celular no navegador, só online, atende à necessidade de mobile, ou se o offline no celular vem mais cedo~~ *(`[DECIDIDO 2026-10-14]`: a lista da V1 o traz para mais cedo, para a Fase 4 — [0092](adr/0092-the-phone-offline.md), aceito naquela noite; uma linha de Revisões no 0073)* | [0073](adr/0073-self-hosted-server-first.md) |
| ~~Permissões mais finas que a pasta~~ (aceitas em 2026-10-11: uma concessão num caminho dentro de uma pasta, [0081](adr/0081-sharing-between-people-on-one-universo.md)); ~~histórico, atribuição e recuperação de uma mudança de outro membro~~ — ainda aberto, para um ADR próprio (Status do 0081) *(2026-10-14: na V1 pela resposta do mantenedor; o ADR é o [0091](adr/0091-version-history.md), aceito naquela noite; uma linha de Revisões no 0073)* | [0073](adr/0073-self-hosted-server-first.md), Q9 da spec, [0081](adr/0081-sharing-between-people-on-one-universo.md) |
| Criptografia ponta a ponta, depois, como opção para um servidor de uma pessoa só *(`[DECIDIDO 2026-10-14]`: depois da V1, a resposta do mantenedor; Fase 4, abaixo)* | [0073](adr/0073-self-hosted-server-first.md) |
| A coedição do board | [0073](adr/0073-self-hosted-server-first.md) item 7, [0082](adr/0082-live-co-editing-of-a-synced-folder.md) item 12 |
| O transporte e a autorização do MCP pela rede *(`[DECIDIDO 2026-10-14]`: depois da V1, a resposta do mantenedor; Fase 4, abaixo)* | [0073](adr/0073-self-hosted-server-first.md) item 11, [0045](adr/0045-server-and-mcp-security.md) |
| A URL pré-assinada de um bucket | [0073](adr/0073-self-hosted-server-first.md) item 4 |
| Os critérios que mandariam o iPad do navegador para um app nativo | [0073](adr/0073-self-hosted-server-first.md) |
| Como um custo seria repassado se um dia existir armazenamento nosso | [0073](adr/0073-self-hosted-server-first.md) item 4 |
| "Este app é um servidor" atualizando com celulares conectados | [0073](adr/0073-self-hosted-server-first.md) |
| O conteúdo da barra do teclado, depois do uso | [0076](adr/0076-the-window-on-every-screen.md) item 7 |

### Critério de saída

Decidido pelo mantenedor em 2026-10-10: a fase acaba quando nenhuma tarefa
dela estiver pendente e o mantenedor declarar o fim. As condições do ADR
0073 sobre o trabalho valem enquanto isso: segurança por inteiro antes do
primeiro usuário que não seja o mantenedor, e o modelo de ameaças antes de
o servidor ser anunciado (item 6).

*(`[DECIDIDO 2026-10-14]`, a resposta do mantenedor naquela noite: a
Fase 3 fecha quando as linhas construídas dela forem publicadas, e passa
as pendências herdadas — o mês de uso, o leitor de tela, a leitura da
nota tipada — para a Fase 4 — V1, abaixo.)*

---

## Fase 4 — V1

Decidida pelo mantenedor em 2026-10-14. Às 11:36 UTC ele mandou um plano
de funcionalidades novas rascunhado com outro assistente — os segredos do
mestre, links feitos a partir dos nomes no texto, mapas, um infobox,
dados com o Rolai dele — e pediu uma leitura crítica, o que ainda estava
pendente e um roadmap rumo a *"uma V1 bem sólida"*. A leitura em sessão
naquela manhã conferiu cada funcionalidade no código, listou o que
estava pendente e propôs uma V1 sem os mapas. A resposta dele naquela
noite: *"VAI SER TUDO NA V1"* — toda funcionalidade da lista, os mapas
incluídos, sem V1.1; o histórico de versões na V1; e os segredos do
mestre como uma projeção para leitores
([0087](adr/0087-secret-blocks-hidden-from-readers.md), Fonte).

A V1 é as oito funcionalidades abaixo, cada uma com o seu ADR, proposto e
aceito em 2026-10-14, as lacunas de núcleo que o mantenedor trouxe para ela, e
as pendências que a bloqueiam. Plugins e o shim de compatibilidade
continuam de fora, como antes. Na mesma noite o mantenedor respondeu às
questões abertas da V1, postas com opções — cada uma registrada abaixo
como `[DECIDIDO 2026-10-14]`: o nome, Fase 4 — V1, depois da Fase 3, que
passa para ela as pendências herdadas; a ordem do trabalho, em ondas;
quais lacunas de núcleo entram na V1; e a criptografia ponta a ponta e o
MCP pela rede depois da V1. As questões de cada ADR, do 0085 ao 0092, e mais
quatro da V1 (R1 a R4, abaixo) lhe foram postas mais tarde naquela
noite — *"Aceita todas as recomendações (R1–R4 e os itens dos ADRs
0085–0092)?"* — e respondidas *"Sim, todas"*: os oito ADRs estão aceitos,
cada `[ABERTO]` decidido como recomendado.

### Funcionalidades

`[DECIDIDO 2026-10-14]`: o trabalho vai em três ondas, a escolha do
mantenedor entre as opções que lhe foram postas. **Onda A** — prévia ao
passar o ponteiro, o infobox, vincular menções, dados e tabelas —
construídas em paralelo; **onda B** — blocos secretos e histórico de
versões; **onda C** — o celular offline e os mapas no board. A onda A
começa assim que os ADRs dela forem aceitos *(aceitos em 2026-10-14)*, em paralelo com a
publicação das notificações do ADR 0084 (V.17).

| # | Onda | Funcionalidade | ADR | Estado em 2026-10-14 |
|---|---|---|---|---|
| V.1 | A | Prévia ao passar o ponteiro: a nota que um link nomeia, sobre links, os painéis, o grafo e o board | [0085](adr/0085-hover-preview.md) | aceito em 2026-10-14; construído em 2026-10-14/15 na onda A, merge `a0f7ab18`; o pill de link do infobox também mostra prévia, `cd635542`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md`. **Revisado em 2026-10-15:** o item 5, a sugestão durante a digitação, está na V1, desligada por padrão (o mantenedor: "Sim, na V1, desligada por padrão"); construída em `feat/typing-links` |
| V.2 | A | O infobox: os tipos `link` e `image` num esquema, um layout nomeado pelo esquema, o painel de propriedades desenhado como um cartão ao lado do texto | [0086](adr/0086-infobox-a-typed-notes-card.md) | aceito em 2026-10-14; construído em 2026-10-14/15 na onda A, merge `a3525015`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.5 | A | Vincular menções sem link: "Vincular" em cada menção e "Vincular todas" com um diff | [0089](adr/0089-linking-unlinked-mentions.md) | aceito em 2026-10-14; construído em 2026-10-14/15 na onda A, merge `55553f5a`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.4 | A | Dados e tabelas aleatórias: `dice:` rola e nunca é escrito; uma rolagem vista pela sala; o motor do Rolai | [0088](adr/0088-dice-and-random-tables.md), [0036](adr/0036-tabletop-rpg-support.md) | aceito em 2026-10-14; construído em 2026-10-14/15 na onda A, merge `3d1d2c10`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.3 | B | Blocos secretos: um callout `> [!secret]` fica na nota; um UniVerso serve aos leitores uma projeção sem ele em todo lugar; quem escreve vê tudo | [0087](adr/0087-secret-blocks-hidden-from-readers.md), Q9 da spec | aceito em 2026-10-14; construído em 2026-10-14/15 na onda B, merge `76476f6f`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.7 | B | Histórico de versões: versões guardadas fora da pasta, os autores delas, um diff e uma restauração | [0091](adr/0091-version-history.md), [0073](adr/0073-self-hosted-server-first.md) | aceito em 2026-10-14; construído em 2026-10-14/15 na onda B, merge `89460251`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.8 | C | O celular offline: a janela instalada guarda pastas escolhidas e as sincroniza pelas regras do sync | [0092](adr/0092-the-phone-offline.md), [0073](adr/0073-self-hosted-server-first.md) item 8 | aceito em 2026-10-14; construído em 2026-10-14/15 na onda C, merge `d4f76cc9`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.6 | C | Mapas no board: uma imagem como mapa, alfinetes de tamanho constante, imagens grandes em blocos, alfinetes secretos | [0090](adr/0090-maps-on-the-board.md) | aceito em 2026-10-14; construído em 2026-10-14/15 na onda C, merge `9c6d25fe`; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md`; depende de V.1 e V.3, ambos construídos |

### Lacunas de núcleo na V1

`[DECIDIDO 2026-10-14]`, a resposta do mantenedor sobre quais das
lacunas de núcleo que a leitura listou entram na V1: notas periódicas, o
resto das bases — as expressões regulares **e** o layout de mapa
(*"resto das bases"*) —, "este app é um servidor", e os apps de Mac Intel
e de Linux ARM64; um bucket e o WebDAV vêm depois da V1. Nenhuma tem ADR
próprio ainda; cada linha cita o ADR que a registra. A onda delas,
`[DECIDIDO 2026-10-14]` (o mantenedor, *"Sim, todas"*, respondendo às
perguntas da construção da onda A): V.18 e V.19 entram na onda A, logo
depois das quatro funcionalidades dela; V.20 vai com a onda C; V.21 e V.22
vêm quando o repositório for público (V.12). *(Mais tarde em 2026-10-14: a V.18, a V.19 e a V.21
têm um cada, aceitos naquela noite — [0093](adr/0093-periodic-notes.md), [0094](adr/0094-the-rest-of-bases.md), [0095](adr/0095-mac-notarization-and-windows-code-signing.md) item 9.)*

| # | Lacuna | ADR | Estado em 2026-10-14 |
|---|---|---|---|
| V.18 | Notas periódicas — semanais, mensais — ao lado da nota diária | [0014](adr/0014-primitives-catalog.md) (a linha do tempo; notas periódicas propostas); [0093](adr/0093-periodic-notes.md), aceito em 2026-10-14 | aceito em 2026-10-14; construído em 2026-10-14/15 na onda A2, merge `6bc0d396` (a nota diária, a semanal, a mensal); verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.19 | O resto das bases: expressões regulares e o layout de mapa | [0053](adr/0053-views-bases.md) ("Não construído: expressões regulares, o layout de mapa…"); [0094](adr/0094-the-rest-of-bases.md), aceito em 2026-10-14 | aceito em 2026-10-14; construído em 2026-10-14/15 na onda A2, merge `bae82bbc` (expressões regulares e o layout de mapa); verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.20 | "Este app é um servidor": o app de desktop servindo a pasta dele na rede local, achado por mDNS e pareado por um QR code | [0073](adr/0073-self-hosted-server-first.md) item 2; [0096](adr/0096-this-app-is-a-server.md), Aceito em 2026-10-15 | a forma decidida em 2026-10-09; a segurança, o pareamento e o certificado decididos em 2026-10-15 como a 0096 recomenda (`[DECIDIDO 2026-10-15]`); **construído em 2026-10-15 em `feat/local-server-build` para macOS e Linux, Windows depois** (item 17 (a) da 0096); as verificações no app real estão em `manual-checks.md` |
| V.21 | O app de Mac Intel | [0022](adr/0022-target-platforms-macos-first.md), [0051](adr/0051-development-flow-and-releases.md) (o job de macOS constrói arm64); [0095](adr/0095-mac-notarization-and-windows-code-signing.md) item 9, aceito em 2026-10-14 | não construído |
| V.22 | O app de Linux ARM64 | [0071](adr/0071-linux-port.md) item 1 (construído ao lado do x64 quando o repositório for público, V.12) | não construído |

### O que bloqueia a V1

Listadas como bloqueantes pela leitura de 2026-10-14, e na V1 pelo
*"VAI SER TUDO NA V1"* do mantenedor:

| # | Pendência | Fonte | Estado em 2026-10-14 |
|---|---|---|---|
| V.9 | Um teste de invasão do servidor do laboratório por uma pessoa de fora do projeto | [0083](adr/0083-security-hardening-of-universo.md) item 16 | condição do anúncio (decidido em 2026-10-13); não feito |
| V.10 | Os limites medidos no host de 1 núcleo e 1 GB, e um número que a medição contradiga mudado | [0083](adr/0083-security-hardening-of-universo.md) item 18 | não feito (Status do 0083) |
| V.11 | Assinatura de código no Windows | [0051](adr/0051-development-flow-and-releases.md) (o app assinado ad hoc), [0069](adr/0069-windows-port.md) (sem assinatura de código por enquanto); [0095](adr/0095-mac-notarization-and-windows-code-signing.md), aceito em 2026-10-14 | não feito; um ADR próprio, revisando o 0051 e o 0069, `[DECIDIDO 2026-10-14]` (R3), a escrever *(escrito: [0095](adr/0095-mac-notarization-and-windows-code-signing.md), aceito em 2026-10-14)*. *Revisado em 2026-10-15: **notarização no Mac abandonada** — o mantenedor não vai se inscrever no Apple Developer Program e não pagará nada à Apple; o app do Mac continua assinado ad hoc e se instala com "Abrir Mesmo Assim" (0095, Status). O que fica: a assinatura do Windows pela SignPath Foundation, com o repositório público (V.12).* |
| V.12 | O repositório público, em `SergioSJS/verso` | [0007](adr/0007-private-repo-until-license.md), [0004](adr/0004-project-name-verso.md) | não feito. *2026-10-15: o mantenedor decidiu não buscar o nome `versomd` no GitHub; o repositório fica em `SergioSJS/verso` (0004, Revisões); o pedido do usuário dormente ao suporte do GitHub é abandonado.* |
| V.13 | A passada com um leitor de tela, e as decisões de acessibilidade pendentes com o mantenedor | [0035](adr/0035-cross-cutting-requirements.md), [`review/accessibility.md`](review/accessibility.md) §8, linha 2.7 da Fase 2 (herdada) | não feito |
| V.14 | Um mês de uso real, sem perda de dados nele | os critérios de saída 1 e 2 da Fase 2, herdados pela Fase 3 e dela pela Fase 4 | não registrado como cumprido |
| V.15 | As verificações manuais do app | `docs/reference/manual-checks.md` | 180 não marcadas no `a162f83e`; ver "Registrado, não resolvido", abaixo |

### Em andamento

| # | Trabalho | ADR | Estado em 2026-10-14 |
|---|---|---|---|
| V.16 | Endurecimento de segurança do UniVerso | [0083](adr/0083-security-hardening-of-universo.md) | aceito em 2026-10-13; os itens 1 a 15 e 17, e a leitura do sanitizador do item 16, construídos (0083, Como construído) e publicados na 0.8.1-beta.1 e na 0.8.2-beta.1 (`CHANGELOG.md`); antes do anúncio: o teste de invasão do item 16 (V.9) e a medição do item 18 (V.10); o laboratório hostil do item 19, que o Status do 0083 na `main` registra como fora das mesclagens |
| V.17 | Notificações na janela | ADR 0084, aceito em 2026-10-14, no seu próprio branch e não mesclado; a linha dele no índice dos ADRs chega com ele | aceito em 2026-10-14; integrado, não mais no seu próprio branch: merges `a3c5d404` (o lado do host) e `64be7c5c` (o lado da janela), no índice dos ADRs; construído para a 0.8.3-beta.1 e levado nos branches de integração; verificado no Linux, no Windows e no e2e em Docker; não enviado e não lançado (em 2026-10-14 o mantenedor decidiu acumular: nenhuma versão enquanto ninguém mais usa o Verso); as verificações no app real esperam em `docs/reference/manual-checks.md` |
| V.23 | Páginas web embutidas: um `<iframe>` quando o site permite ser emoldurado, a child web view recortada nativamente quando não | [0056](adr/0056-embedded-web-pages.md) (revisado em 2026-10-14 e 2026-10-15), [0029](adr/0029-guardrails-in-ci.md) (a exceção de `unsafe`, confinada a `app/src-tauri/src/web_clip/`) | construído em 2026-10-14/15 na onda B, merges `7ab0ce0c` (iframes) e `ed7b1ab0` (recorte nativo), depois `96626931` (camada do contêiner no macOS mascarada, funciona desde o macOS 11); não enviado, não lançado; as verificações no app real esperam em `docs/reference/manual-checks.md` |

### Decisões que precisam sair para a V1

Decididas em 2026-10-14, o mantenedor respondendo em sessão a questões
postas com opções:

| Decisão | Resposta | Fonte |
|---|---|---|
| Como a V1 se chama entre as fases | `[DECIDIDO 2026-10-14]`: **Fase 4 — V1**, depois da Fase 3, que fecha quando as linhas construídas dela forem publicadas e passa as pendências herdadas (o mês de uso, o leitor de tela, a leitura da nota tipada) para a Fase 4 | [0034](adr/0034-roadmap-in-phases.md) |
| A ordem do trabalho dentro da V1 | `[DECIDIDO 2026-10-14]`: em **ondas** — A (0085, 0086, 0089, 0088, em paralelo), B (0087, 0091), C (0092, 0090); a onda A começa assim que os ADRs dela forem aceitos, em paralelo com a publicação do ADR 0084 ("Funcionalidades", acima) | o mantenedor |
| Quais lacunas de núcleo entram na V1 | `[DECIDIDO 2026-10-14]`: **na V1** notas periódicas, o resto das bases (expressões regulares e o layout de mapa), "este app é um servidor", os apps de Mac Intel e de Linux ARM64 ("Lacunas de núcleo na V1", acima); **depois da V1** um bucket e o WebDAV ([0073](adr/0073-self-hosted-server-first.md) itens 4 e 10) | o mantenedor |
| Criptografia ponta a ponta, opcional, e o MCP pela rede | `[DECIDIDO 2026-10-14]`: **depois da V1**; anotado nas linhas de decisão da Fase 3 | [0073](adr/0073-self-hosted-server-first.md), [0045](adr/0045-server-and-mcp-security.md) |
| R1. Se a lista da V1 responde ao `[ABERTO]` do 0073 sobre o offline no celular (a primeira linha de decisões da Fase 3) | `[DECIDIDO 2026-10-14]`, como recomendado (*"Sim, todas"*): **sim**, a lista o traz para mais cedo; uma linha de Revisões no 0073, a linha da Fase 3 riscada | [0073](adr/0073-self-hosted-server-first.md), [0092](adr/0092-the-phone-offline.md) |
| R2. Se as verificações manuais são condição da V1 | `[DECIDIDO 2026-10-14]`, como recomendado: são condição só **da publicação da V1**, nunca de um commit, de uma mesclagem ou de um beta; `docs/reference/manual-checks.md` o diz | `docs/reference/manual-checks.md` |
| R3. Notarização no Mac e assinatura de código no Windows: como, e a que custo (notarização abandonada em 2026-10-15, V.11) | `[DECIDIDO 2026-10-14]`, como recomendado: **um ADR próprio**, revisando o 0051 e o 0069, a escrever *(escrito: 0095, aceito em 2026-10-14)* | [0051](adr/0051-development-flow-and-releases.md), [0069](adr/0069-windows-port.md), [0095](adr/0095-mac-notarization-and-windows-code-signing.md) |
| R4. O critério de saída da Fase 4 | `[DECIDIDO 2026-10-14]`, como recomendado: a Fase 4 acaba quando nenhuma linha acima estiver pendente e o mantenedor declarar o fim, como na Fase 3; o mês de uso sem perda de dados (V.14) é a parte que qualquer um consegue verificar | [0034](adr/0034-roadmap-in-phases.md) |
| Quais das questões do dialeto ainda `[ABERTO]` no todo ou em parte na §9 da spec entram na V1 | `[DECIDIDO 2026-10-14]`, como recomendado (*"Sim, todas"*, respondendo às perguntas da construção da onda A): **só o aninhamento da Q5**, com V.3 (a Q9 decidida em 2026-10-14, spec v0.38); as outras depois da V1 | a leitura de 2026-10-14; o mantenedor |
| A onda de cada lacuna de núcleo (V.18 a V.22) | `[DECIDIDO 2026-10-14]`, como recomendado (a mesma resposta): V.18 e V.19 entram na onda A, logo depois das quatro funcionalidades dela; V.20 com a onda C, ao lado do celular offline, com quem divide um servidor; V.21 e V.22 quando o repositório ficar público (V.12), como o 0071 amarra o ARM64 a ele | o mantenedor |

Nada mais `[ABERTO]` aqui desde 2026-10-14.

### Registrado, não resolvido

Contradições encontradas ao escrever esta revisão, para o mantenedor;
cada uma marcada onde as respostas do mantenedor de 2026-10-14 a resolveram:

- `docs/reference/manual-checks.md` diz que nada nele bloqueia um commit,
  uma mesclagem ou uma publicação; a lista da V1 põe as verificações
  manuais do app entre o que bloqueia a V1 (V.15). *(Resolvido pela R2:
  as checagens são condição só da publicação da V1, e o
  `manual-checks.md` o diz desde 2026-10-14.)*
- A §5.8 da spec diz que um callout não é o mecanismo do segredo do
  mestre; a decisão de 2026-10-14 faz de um callout do tipo `secret` a
  sintaxe. O item 8 do [0087](adr/0087-secret-blocks-hidden-from-readers.md)
  propõe a revisão da §5.8 e da Q9; a Q9 continua `[ABERTO]`. *(Resolvido:
  o 0087 aceito com o item 8; §5.8, §6 e Q9 revisadas, a Q9 `DECIDIDO`,
  spec v0.38, sem fixture até o PR que constrói o 0087.)*
- As Consequências do [0036](adr/0036-tabletop-rpg-support.md) deixam as
  funcionalidades de RPG de mesa fora do núcleo, exceto como primitivas,
  pacotes de esquemas ou um plugin; dados, tabelas, blocos secretos e
  mapas são propostos como primitivas
  ([0088](adr/0088-dice-and-random-tables.md), Consequências). *(Resolvido:
  aceitos como primitivas, uma linha de Revisões no 0036.)*
- A Fase 3 acaba quando nenhuma tarefa dela estiver pendente, as
  pendências herdadas entre elas; a V1 lista as mesmas pendências (V.13,
  V.14). *(Resolvido pelo nome que o mantenedor deu em 2026-10-14: a
  Fase 3 as passa para a Fase 4.)*

---

## Depois da Fase 2

Sem ordem nem prazo definidos no briefing. Entram na conversa quando a Fase 2
fechar: sync ([0020](adr/0020-sync-merge-in-core-transports-as-plugins.md)),
mobile ([0025](adr/0025-own-server-and-mobile-pwa.md)), plugins
([0016](adr/0016-plugins-execution-and-capabilities.md), com as questões de
[0047](adr/0047-plugin-api-open-questions.md) respondidas antes do
desenho da API), shim de
compatibilidade ([0017](adr/0017-plugins-format-shim-loading.md)), as
primitivas ainda propostas ([0014](adr/0014-primitives-catalog.md)) e a
**escrita por agente com diff** ([0018](adr/0018-llm-native-mcp-in-core.md),
`DECIDIDO`, sem fase atribuída: a Fase 1 entrega MCP somente leitura e a Fase 2
não a inclui). E também os **apps de Windows e Linux**
([0022](adr/0022-target-platforms-macos-first.md)): o mantenedor decidiu em
2026-09-23 que os dois saem, Windows primeiro, e em 2026-10-07 que o Windows
começa agora, no escopo da Fase 2 e à frente do resto do trabalho dela
([0069](adr/0069-windows-port.md), o cabeçalho da Fase 2 acima). O Linux
fica aqui; como ele seria compilado e testado está proposto no
[0071](adr/0071-linux-port.md), escrito em 2026-10-08 e esperando.
*(Lançado na 0.6.0-beta.1 em 2026-10-09, e o primeiro item da Fase 3,
acima.)*

Ordem entre eles: `[ABERTO]`, menos Windows antes de Linux, e Linux antes do
servidor. Em 2026-10-09 o mantenedor definiu a Fase 3, a escrever aqui quando
a Fase 2 fechar, como o app de Linux e depois um servidor auto-hospedado,
com compartilhamento e edição simultânea como foco se forem viáveis; o como,
e o sync depois do servidor e por ele, estão propostos no
[0073](adr/0073-self-hosted-server-first.md). *(A Fase 3 escrita em
2026-10-09, acima, com o 0073 aceito.)*

O que fica para depois, desde 2026-10-09: depois da primeira versão do
servidor, na ordem do item 12 do 0073 — ~~sync para as pastas locais do
desktop~~ *(construído na rodada logo depois dessa versão, pela palavra do
mantenedor de 2026-10-10, [0079](adr/0079-sync-a-local-folder-with-a-server.md) Fonte e Status; item 3.12 da Fase 3,
acima)*, a PWA offline *(na V1 desde 2026-10-14, [0092](adr/0092-the-phone-offline.md))*, o bucket do usuário *(depois da V1, `[DECIDIDO 2026-10-14]`, com o WebDAV)*
([0073](adr/0073-self-hosted-server-first.md) item 4) e um app mobile
nativo se os limites do navegador morderem; e, sem ordem, plugins, o shim
de compatibilidade, as primitivas ainda propostas e a escrita por agente
com diff.
