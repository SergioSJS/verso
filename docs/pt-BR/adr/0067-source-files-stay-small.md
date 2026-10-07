# ADR 0067 — Arquivos de código continuam pequenos: um mapa de módulos e um limite de tamanho

- Data: 2026-10-07
- Fonte: o mantenedor, em sessão: "a gente tem arquivos de códigos de mais
  de 13 mil linhas, com certeza vai ficar maior ainda. proponho uma
  reorganização, limpeza desse código". Perguntado quando, até onde e se
  ficaria uma regra, escolheu: no topo da pilha de branches não mesclados;
  todo arquivo acima de umas 1500 linhas; um ADR e um guardrail.
- Relacionados: [0028](0028-crate-structure.md) (os crates, que isto não
  muda), [0029](0029-guardrails-in-ci.md) (os guardrails, que ganham um),
  [0032](0032-author-and-reviewer-roles.md) e
  [0033](0033-pr-workflow.md) (um pull request que o mantenedor consegue
  explicar).
- Status no briefing: não presente

## Contexto

Em 2026-10-07 o `app/ui/src/main.ts` da janela tinha 13.440 linhas e umas
300 funções e classes, com 37 variáveis de módulo que qualquer uma delas
podia mudar. Eram 7,1 mil linhas na v0.2.0-beta.2 e 12,8 mil em
2026-10-03, quando o mantenedor pediu pela primeira vez que fosse dividido.
Outros cinco arquivos passavam de 1500 linhas: `app/src-tauri/src/lib.rs`
(4121), `app/ui/src/board/view.tsx` (3198), `crates/verso-core/src/lib.rs`
(3166), `app/ui/style.css` (3036) e `crates/verso-core/tests/workspace.rs`
(2052).

Um arquivo desse tamanho é lido em pedaços, por uma pessoa ou por um
modelo: os bugs dos focos de 2026-10-03 vieram de estado definido longe de
onde era lido. Um revisor recebe um diff num arquivo que ninguém consegue
ter inteiro na cabeça; dois agentes trabalhando ao mesmo tempo colidem
nele; e um pull request que mexe nele é mais difícil de o mantenedor
explicar, a condição para o merge ([0033](0033-pr-workflow.md)).

## Decisão

1. **Um limite de 1500 linhas por arquivo de código.** Conta toda linha de
   cada arquivo `.rs`, `.ts`, `.tsx`, `.js`, `.mjs` e `.css` versionado sob
   `crates/`, `app/` e `scripts/`, testes incluídos. Ficam fora: arquivos
   gerados (`app/ui/src/bindings.ts`, `app/ui/src/demoVault.ts`), dados
   (`.json`), lockfiles e documentos.
2. **Um guardrail de workspace o confere**, `scripts/check-sizes.mjs`,
   rodado pelo `scripts/check.sh` e pelo job Linux do pull request. Um
   arquivo acima do limite falha. Um arquivo só passa do limite por uma
   linha em `scripts/size-exceptions.txt`, com o tamanho dele e o porquê; a
   checagem falha se esse arquivo crescer além do tamanho escrito ali, ou
   ficar abaixo do limite com a linha ainda lá — a lista só encolhe. Ela
   começa vazia.
3. **O código da janela por área.** O `main.ts` fica com a inicialização:
   liga a janela e não guarda a lógica de nenhuma área. As áreas vão em
   módulos ao lado dos que já existem (`board/`, `bases/`, `blocks/`,
   `live.ts`, `props.ts`…): as folhas (uma nota, uma imagem, um board, uma
   pasta, um PDF, o grafo), o layout (painéis, divisões, espaços), os
   painéis laterais, a árvore de arquivos e a sua ordem, os focos, os
   diálogos (seletor, paleta, substituir, relatório de bug, configurações),
   os menus, as teclas e os textos de cada idioma.
4. **Rust por área.** O `lib.rs` de um crate fica com os tipos, os erros e
   a lista de módulos; o `impl` de um tipo grande é dividido em módulos
   filhos por área (um bloco `impl` pode ficar em qualquer módulo do
   crate). Os comandos do host desktop vão em módulos por área. Um arquivo
   de testes é dividido por assunto.
5. **A folha de estilos por área.** O `style.css` vira uma lista de
   `@import`s de `app/ui/css/<área>.css`, juntados num só `style.css` no
   build, para que a janela continue carregando uma folha de estilos.
6. **Mover e limpar separados.** A reorganização move código sem mudar o
   que ele faz, para que um revisor confira uma mudança de lugar como
   mudança de lugar (`git diff --color-moved`); a limpeza — código morto,
   duplicações, estado que vira local do seu módulo — vai em commits
   próprios. A rede de segurança é a que já existe: a checagem de tipos, os
   testes unitários, os testes de ponta a ponta no harness do navegador e
   os testes Rust, verdes em todo commit.

## Consequências

- A reorganização é um pull request, no topo da pilha de branches ainda
  não mesclados (`feat/focuses` … `feat/mcp-widened`), mesclado por último.
  Enquanto está aberto, nenhum outro trabalho edita os arquivos que ele
  move.
- O `CLAUDE.md` (e o seu espelho) ganha a linha do guardrail, e o
  [0029](0029-guardrails-in-ci.md) uma linha de revisão.
- Uma área nova da janela, ou uma que fique grande demais para o seu
  arquivo, ganha módulo próprio em vez de fazer outro passar do limite.
- Autoria: Opus 5.5. A parte em Rust é código do core, que pelo
  [0032](0032-author-and-reviewer-roles.md) é do Fable 5.1; o mantenedor
  pediu em 2026-10-06 que o Fable não fosse usado: um desvio, com a leitura
  antes do merge para o mantenedor designar.

## Alternativas descartadas

- **Depois de mesclar a pilha, a partir de uma `main` limpa.** Posta ao
  mantenedor; mais segura contra conflitos, mais lenta. Não escolhida.
- **Só o `main.ts`.** Posta ao mantenedor; não escolhida.
- **Um ADR sem checagem, ou regra nenhuma.** Posta ao mantenedor; não
  escolhida.

## Status

Aceito (2026-10-07): o mantenedor, em sessão, escolhendo as opções acima.
