# CLAUDE.md — Verso

Instruções para qualquer sessão de IA que trabalhe neste repositório.

Fonte de tudo que está aqui: `BRIEFING.md` e `adr/`. Esta página não
cria regra nova; concentra o que já foi decidido, no formato em que precisa ser
obedecido. Se algo aqui não tiver ADR Aceito por trás, é achado de revisão.

**O mantenedor é a autoridade final.** A IA escreve; o mantenedor decide.

---

## 1. Regra zero: não invente decisão

1. Nada que não esteja no briefing ou num ADR vira decisão. Na dúvida, registrar
   como `[ABERTO]` e perguntar.
2. Não promover `PROPOSTO` para `DECIDIDO`, nem fechar um `[ABERTO]`. Só o
   mantenedor faz isso.
3. Ao encontrar contradição entre documentos, registrar a contradição no PR; não
   escolher um lado.
4. Alternativa "descartada" só é registrada se alguém de fato a considerou. Sem
   isso: "Nenhuma registrada".

---

## 2. Invariantes

Violação de invariante é BLOQUEANTE por definição, sem discussão de mérito.

### 2.1 Arquitetura — [ADR 0026](adr/0026-core-ui-contract-inviolable-rules.md)

1. A UI só fala com o core pelo contrato. Nenhum atalho.
2. A UI não assume de que lado do fio o core está; latência e disponibilidade
   vêm das capabilities.
3. O contrato é definido primeiro; tipos TS são gerados a partir do Rust, nunca
   escritos à mão.
4. A API de filesystem **do contrato** (UI, plugins, MCP) separa acesso de
   identidade ([ADR 0026](adr/0026-core-ui-contract-inviolable-rules.md),
   emendada em 2026-09-22): uma capacidade de ler ou escrever um arquivo cruza
   só como handle opaco; uma nota é nomeada pelo caminho relativo à pasta
   aberta. Caminho absoluto, ou com `..`, nunca cruza. Caminho em string também
   existe na borda de entrada (argumento da CLI, chave da config) e dentro de
   `verso-fs`. Num servidor a capacidade de acesso é a sessão autenticada e
   o papel dela na pasta, conferidos antes de o `verso-fs` agir, e nada mais
   cruza ([ADR 0073](adr/0073-self-hosted-server-first.md), aceito em
   2026-10-09).
5. Acesso aos **arquivos da pasta aberta** só dentro do crate `verso-fs`. O
   arquivo do índice (`verso-index`), o diretório de configuração
   (`verso-core`), o banco do próprio servidor (`verso-server`, em
   `VERSO_DATA_DIR`) e a entrada e saída da CLI ficam fora da regra; nenhum
   deles toca a pasta aberta. `verso-dialect` não tem IO nenhum.
6. Plugins nunca acessam disco diretamente.

### 2.2 Dados — [ADR 0012](adr/0012-files-are-source-of-truth.md), [ADR 0043](adr/0043-placeholder-guard.md)

7. Abrir um arquivo nunca o reescreve. Nenhuma normalização silenciosa de
   frontmatter, quebra de linha ou espaçamento no caminho de leitura.
8. Conversão só por ação do usuário, com diff visível. Vale também para escrita
   por agente.
9. Escrita em disco é atômica: arquivo temporário, `fsync` do arquivo e do
   diretório, `rename` — com os requisitos de
   [ADR 0029](adr/0029-guardrails-in-ci.md).
10. Arquivo placeholder de armazenamento sob demanda nunca é interpretado como
    deleção ([ADR 0043](adr/0043-placeholder-guard.md)).
11. Toda escrita verifica que o arquivo em disco é o que foi lido (mtime e
    tamanho, ou hash). Se mudou, não grava sem mostrar o diff. Vale para UI,
    agente e conversão.

### 2.3 Dialeto — [ADR 0030](adr/0030-base-dialect-obsidian-compatible.md)

12. O Verso estende o dialeto do Obsidian; nunca o contradiz. Nenhuma extensão
    muda o significado de construção existente.
13. Fontes admissíveis sobre o comportamento do Obsidian: API pública
    (`obsidian.d.ts`, MIT), documentação pública e comportamento observado de
    fora. **Proibido** inspecionar, descompilar ou desminificar o app
    ([ADR 0009](adr/0009-external-constraints.md)).

### 2.4 Fixtures — [ADR 0031](adr/0031-fixtures-as-contract.md)

14. **Nunca alterar `fixtures/**/expected.yaml` sem aprovação explícita do
    mantenedor.** Se o código discorda da fixture, o código está errado até o
    mantenedor dizer o contrário. Se a fixture parecer errada: **parar, não
    editar, perguntar** — em comentário no PR ou na sessão, apontando o caso e
    por que o esperado parece incorreto.
15. Qualquer fixture pode ser rascunhada pela IA; nenhuma vale antes de o
    mantenedor aprovar no PR que a adiciona. Rascunho diz que é rascunho na
    primeira linha do `expected.yaml`.
16. `input.md` também não muda sozinho: mudar a entrada muda o contrato.
17. Fixture segue o schema de `spec/dialect.md` §4. Fixture que responde a
    uma questão `[ABERTO]` da spec só entra no PR que fecha a questão, com a
    seção 9 da spec atualizada no mesmo PR. Fixture de comportamento compatível
    com o Obsidian registra em `observed:` como foi verificado.

### 2.5 Escopo — [ADR 0034](adr/0034-roadmap-in-phases.md)

18. Fora de escopo até o fim da Fase 2: sync, mobile, plugins e shim de
    compatibilidade. Não implementar "já que é barato". O board entrou na
    Fase 2 em 2026-09-30 ([ADR 0057](adr/0057-board-json-canvas.md)). Desde
    2026-10-09 o servidor, a janela num navegador e o celular e o tablet
    pelo navegador estão no escopo, na Fase 3
    ([ADR 0073](adr/0073-self-hosted-server-first.md), aceito em
    2026-10-09); plugins e o shim continuam fora, e o sync vem depois da
    primeira versão do servidor, na ordem do item 12 do ADR 0073.
19. Fase 1 não tem UI. Fase 0 não tem feature nenhuma.

---

## 3. Guardrails

Dois grupos ([ADR 0029](adr/0029-guardrails-in-ci.md)). Os **de
workspace** entram no CI na Fase 0, com crates vazios, antes da primeira linha
de lógica de produto. Os **de feature** entram no mesmo PR da feature que
protegem, nunca depois, e cada um é visto falhando antes de o PR ser mesclado.
Nenhum pode ser desligado, contornado com `#[allow]` local ou "resolvido"
mudando o teste.

| Guardrail | Evita | Grupo |
|---|---|---|
| `cargo fmt --check` | diff de formatação escondendo diff de lógica | workspace |
| `unsafe_code = "forbid"` via `[workspace.lints]` | corrupção de memória | workspace |
| clippy com `-D warnings`; `unwrap_used` e `expect_used` negados, permitidos só em testes | panic derrubando o app | workspace |
| clippy `disallowed_methods` negando `std::fs` fora de `verso-fs` (exceções: índice, config) | acesso à pasta aberta fora de `verso-fs` | workspace |
| `cargo-deny`: allowlist de licenças, advisories negadas | dependência incompatível ou vulnerável | workspace |
| Espelho da documentação: cada `.md` canônico tem gêmeo em `docs/pt-BR/` com os mesmos títulos | documento mudado num idioma só | workspace |
| Arquivos de código abaixo de 1500 linhas; uma exceção é registrada e só encolhe ([ADR 0067](adr/0067-source-files-stay-small.md)) | arquivo grande demais para ler inteiro, revisar ou explicar | workspace |
| Fuzzing do parser com `cargo-fuzz`, e do leitor de canvas ao lado dele | arquivo malformado travando o app | feature 1; o leitor de canvas com o board |
| Property test de round-trip (leitura decidida em Q18) | abrir reescrevendo arquivo | feature 1 |
| `cargo check --target wasm32-unknown-unknown -p verso-dialect` | parser deixar de compilar para WASM | feature 1 |
| Escrita atômica (temporário + `fsync` do arquivo e do diretório + `rename`, mais os requisitos do ADR) | corrupção em queda de energia | feature 2 |
| Confinamento de caminho no adapter | plugin ou agente saindo da pasta via `../` ou symlink | feature 2 |
| Queries parametrizadas + escape da sintaxe FTS5 | busca quebrando com aspas e operadores | feature 3 |
| Benchmark com vault sintético | regressão de performance | feature 5 |
| Tipos TS gerados conferidos no CI | regra 3 do contrato virar convenção | Fase 2, 2.1 |
| Allowlist de licenças npm sobre o lockfile da janela | pacote npm sob licença que o projeto não pode distribuir | Fase 2 |
| Os testes unitários da janela (`npm test` em `app/ui`) | o modelo do board mudar o que grava sem ninguém ver | o board |
| O cofre de exemplo construído das suas fontes e se sustentando | um embutido velho, um board editado à mão, um tutorial que não se sustenta | o tutorial |
| Os testes de ponta a ponta da janela no Chromium ao lado do WebKit (`scripts/check.sh`) — provisório: o item 8 do [ADR 0069](adr/0069-windows-port.md) está Proposto | uma janela que funciona no WebKit e quebra no WebView2 | o porte para Windows |
| Clippy e os testes no Windows por SSH (`scripts/check-windows.sh`), quando o diff toca código de plataforma | código morto ou diferente no Windows | o porte para Windows |

CI ([ADR 0029](adr/0029-guardrails-in-ci.md), 2026-09-23): um pull request
roda todo guardrail menos o fuzzing num job de Linux; o `main` acrescenta
clippy e os testes no macOS e no Windows, o fuzzing e o benchmark; os testes de ponta a
ponta da janela rodam só localmente, no `scripts/check.sh`
([ADR 0058](adr/0058-demo-vault-as-tutorial.md)); os apps são compilados e
empacotados só quando uma versão nova chega à `main`, nunca numa branch. Antes de qualquer push,
`scripts/check.sh` e `scripts/check-linux.sh` passam localmente (README.md), e
o `scripts/check-windows.sh` quando o diff toca código de plataforma
([ADR 0069](adr/0069-windows-port.md)): o CI confirma, nunca é o primeiro
teste.

Se um guardrail bloquear um trabalho legítimo, isso é assunto de PR próprio, com
justificativa — não de `#[allow]` no meio do diff. Um subprocesso que faz
trabalho que uma lista nega (`Command::new("readlink")` onde
`std::fs::read_link` é negado) é a mesma violação que chamar a API negada, e
um `clippy.toml` próprio do crate que tira entradas da lista é exceção a
declarar, não configuração
([ADR 0029](adr/0029-guardrails-in-ci.md), 2026-09-29). Advisory nova só ganha
exceção no `deny.toml` com justificativa, link e data de expiração.

### Estrutura de crates — [ADR 0028](adr/0028-crate-structure.md)

```
crates/
├── verso-dialect   # parser puro: sem IO, sem async
├── verso-index     # SQLite/FTS5, grafo
├── verso-fs        # handles opacos, watcher, escrita atômica, confinamento
├── verso-core      # orquestra e expõe o contrato
└── verso-cli       # index, search, backlinks, mcp
```

`verso-dialect` não ganha dependência de IO nem de async. `verso-fs` é o único
crate que toca os arquivos da pasta aberta; `verso-index` abre só o arquivo do
índice e `verso-core` só a config. Dependência nova exige justificativa no PR.

Além dos cinco, o workspace tem `crates/verso-contract` (os tipos do contrato,
sem IO), `crates/verso-bench` (o benchmark, nunca distribuído) e
`app/src-tauri` (o host desktop da Fase 2, que chega às notas só pelo
`verso-core`) — ADR 0028, Consequências.

Para o servidor (ADR 0028, revisto em 2026-10-09): `crates/verso-service`
(a tabela de sessões e o despacho de comandos, sem transporte — sem rede,
sem runtime assíncrono; o host Tauri e o servidor chamam ambos) e
`crates/verso-server` (HTTP e WebSocket, as contas, as sessões, o banco do
servidor). O `verso-server` não toca arquivo de pasta diretamente, só pelo
`verso-service`, pelo `verso-core` e pelo `verso-fs`, e abre só o próprio
banco em `VERSO_DATA_DIR`, uma exceção como a do `verso-index`. O
`verso serve` é um subcomando do `verso` (`verso-cli`).

---

## 4. Fluxo de PR — [ADR 0033](adr/0033-pr-workflow.md)

### Antes de escrever código

1. Ler o ADR relevante. Não existe: escrever o ADR primeiro, ou perguntar.
2. Conferir se a decisão necessária está `[ABERTO]`. Está: perguntar, não
   escolher.
3. Confirmar que o trabalho cabe na fase atual do `roadmap.md`.
4. Trabalho que toca arquivos, caminhos, processos, configuração ou o foco e
   as teclas da janela: ler
   [`docs/reference/cross-platform-checklist.md`](reference/cross-platform-checklist.md)
   — é escrito no Mac e tem que estar certo no Windows
   ([ADR 0069](adr/0069-windows-port.md)).

### O PR

- **Grande até o fluxo inteiro existir; pequeno depois.** Até existirem sync,
  a web e mobile, o trabalho vai em pull requests grandes — não pedir que um
  seja partido em pequenos. Depois disso: pequeno, um assunto; se o resumo
  precisa de "e", provavelmente são dois PRs
  ([ADR 0033](adr/0033-pr-workflow.md) e
  [ADR 0051](adr/0051-development-flow-and-releases.md), revistos em
  2026-09-24).
- Usa `.github/pull_request_template.md`, com as cinco seções preenchidas:
  O quê / Por quê / Alternativas descartadas / Como verificar / Conceito Rust
  usado.
- "Conceito Rust usado" é explicado para quem está aprendendo Rust. Não é
  formalidade: é o canal pelo qual o mantenedor entende o que está aprovando.
- Dependência nova: justificar, dizer o que ela substitui em código próprio e
  confirmar que a licença passa no `cargo-deny`.
- Feature de parser vem com fixture. Fixture nova vem marcada como rascunho da
  IA, para aprovação.
- Uma branch a partir da `main`, com nome `feat/…`, `fix/…`, `docs/…` ou
  `chore/…`; até o fluxo inteiro existir ela pode levar vários assuntos,
  depois uma branch curta por assunto. A `main` é protegida e só recebe pull
  requests — nunca fazer push nela
  ([ADR 0051](adr/0051-development-flow-and-releases.md)).
- Uma mudança que o usuário vê acrescenta a sua linha em "Não lançado" no
  `CHANGELOG.md` e no `docs/pt-BR/CHANGELOG.md`.
- Uma mudança que o usuário vê também atualiza o tutorial, o cofre de
  exemplo ([ADR 0058](adr/0058-demo-vault-as-tutorial.md)): uma nota que a
  ensina, um cartão ou uma linha no "Tour do Verso" e, para o board, uma
  lição ou um passo do "Treino do Board". Os dois boards do tutorial são construídos a partir
  de `scripts/demo-vault/` com `node scripts/demo-vault.mjs build`, nunca
  editados no app; uma tecla que o tutorial ensina é conferida contra os
  testes de tecla do Excalidraw e os atalhos da janela; e o tutorial é
  seguido antes do PR — os passos de
  [`docs/reference/demo-vault-walkthrough.md`](reference/demo-vault-walkthrough.md),
  aos quais a feature acrescenta os seus. Um passo roda por máquina no
  harness do navegador quando pode (`npm run e2e` em `app/ui`; o
  `scripts/check.sh` também o roda), com o seu teste em `app/ui/e2e/`; um
  comando novo do contrato ganha a sua resposta no harness
  (`app/ui/src/harness/`); o que o harness não alcança é seguido no app, com
  o log do app aberto.

### Revisão

Achados classificados em três níveis:

| Nível | Significado |
|---|---|
| BLOQUEANTE | Viola invariante, guardrail ou decisão; ou perde dado. Impede merge |
| IMPORTANTE | Deve ser resolvido, ou explicitamente adiado com registro |
| MENOR | Fica a critério do autor |

### Merge

Só com os três:

1. CI verde.
2. Sem BLOQUEANTE aberto.
3. O mantenedor consegue explicar o PR com as próprias palavras.

O item 3 é subjetivo de propósito. PR que o mantenedor não consegue explicar é
PR grande ou mal descrito demais, mesmo com CI verde. Ele também é a condição
para assinar: código escrito por IA entra pelo DCO comum, e quem assina o
`Signed-off-by` declara que tem domínio do código e responde por ele
([ADR 0006](adr/0006-contribution-dco-no-cla.md)). Não existe assinatura
da IA.

O mantenedor faz o merge, com um merge commit — nunca squash nem rebase: os
documentos citam commits por hash
([ADR 0051](adr/0051-development-flow-and-releases.md)).

### Versões

Uma versão só é gerada **quando o mantenedor pede**, e então um agente pode
gerá-la: `node scripts/release.mjs prepare X.Y.Z[-beta.N]`, na branch do pull
request que lança, define a versão e move o changelog num commit desse pull
request; o merge dele na `main` compila, publica e cria a tag da release
([ADR 0051](adr/0051-development-flow-and-releases.md), revista em
2026-10-02). `-beta.N` é uma release de teste. Uma tag de versão só é enviada
à mão (`release.mjs tag`) quando esse caminho não conseguiu criá-la; tags de
versão são permanentes — ninguém consegue mover ou apagar uma.

---

## 5. Divisão autor / revisor — [ADR 0032](adr/0032-author-and-reviewer-roles.md)

| Artefato | Autor | Revisor |
|---|---|---|
| Documentos (ADR, spec, roadmap, `CLAUDE.md`) | Opus 5 | Fable 5.1 |
| Código do core (Rust) | Fable 5.1 | Opus 5 |
| UI e TypeScript | Opus 5 | Fable 5.1 |
| Comportamento (fixtures) e decisões; autoridade final | — | o mantenedor |

Regras:

- **Autor e revisor sempre em sessões separadas.** O revisor não vê o raciocínio
  do autor: recebe o diff e o repositório, nunca a transcrição da sessão.
- Quem escreveu não revisa o que escreveu. "Quem" é o **modelo**, não a sessão:
  o modelo que escreveu um artefato não o revisa, nem na mesma sessão nem em
  outra.
- Se o mantenedor manda o revisor aplicar os próprios achados, o revisor vira
  autor daquele diff, e o diff precisa de leitura pelo outro modelo antes do
  merge.
- O mantenedor revisa **comportamento**, pelas fixtures, e questiona decisões.
  Ele está aprendendo Rust fora do projeto; nenhum PR pode depender de ele ler
  Rust para ser aprovado.

### Se você é o autor

Declare no PR o que assumiu. Termine escrevendo como verificar sem ler o código.

### Se você é o revisor

Não peça acesso à sessão do autor. Não amplie o escopo do PR. Classifique cada
achado em BLOQUEANTE, IMPORTANTE ou MENOR.

---

## 6. Quando parar e perguntar

Parar é o comportamento correto, não uma falha:

- Uma fixture parece errada.
- A decisão necessária está `PROPOSTO` ou `[ABERTO]`.
- Dois documentos se contradizem.
- O trabalho exige violar uma invariante ou desligar um guardrail.
- O trabalho está fora da fase atual do roadmap.
- A solução exigiria saber como o Obsidian funciona por dentro
  ([ADR 0009](adr/0009-external-constraints.md)).

---

## 7. Mapa do repositório

| Caminho | O que é |
|---|---|
| `BRIEFING.md` | Fonte única das decisões anteriores ao repositório |
| `adr/` | Um registro por decisão. [Índice](adr/README.md) |
| `spec/dialect.md` | Comportamento do dialeto, com as lacunas marcadas `[ABERTO]` |
| `roadmap.md` | Fases 0, 1 e 2, com critério de saída verificável |
| `review/` | Revisões críticas por fase, com achados classificados e a resolução de cada um |
| `reference/` | Notas de referência sobre ferramentas externas e comportamento observado de fora, como o CLI do Obsidian ([ADR 0009](adr/0009-external-constraints.md)) |
| `docs/pt-BR/` | Espelho pt-BR de toda a documentação, mesma estrutura e nomes ([ADR 0008](adr/0008-documentation-language.md)) |
| `fixtures/` | Contrato de comportamento. `expected.yaml` é intocável sem aprovação; schema em `spec/dialect.md` §4 |
| `crates/` | Os cinco crates do core, mais os tipos do contrato e o benchmark |
| `app/` | A janela da Fase 2: o host Tauri (`app/src-tauri`) e a UI (`app/ui`) |
| `demo-vault/` | O cofre de exemplo, o tutorial do produto ([ADR 0058](adr/0058-demo-vault-as-tutorial.md)); os boards dele são construídos por `scripts/demo-vault.mjs` |
| `.github/pull_request_template.md` | As cinco seções obrigatórias do PR |

## 8. Idioma

Decidido ([ADR 0008](adr/0008-documentation-language.md)): **inglês é a
fonte, pt-BR é espelho.** Todo documento nasce em inglês no caminho canônico e
tem gêmeo em `docs/pt-BR/`, mesma estrutura, mesmo nome de arquivo. PR que
muda um lado muda o outro, ou não mescla. Exceção: `BRIEFING.md`, cujo
original pt-BR em `docs/pt-BR/BRIEFING.md` manda. Commits, PRs e issues em
inglês.

O produto é pt-BR e EN desde o primeiro commit de código — isso é decidido
([ADR 0035](adr/0035-cross-cutting-requirements.md)) e é coisa diferente.
