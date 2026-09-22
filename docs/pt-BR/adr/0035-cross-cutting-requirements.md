# ADR 0035 — Requisitos transversais: pt-BR e EN, acessibilidade, benchmark

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §13
- Status no briefing: `DECIDIDO` (i18n, acessibilidade, benchmark);
  `PROPOSTO` (vista acessível do board); `ABERTO` (metas de performance)
- Revisões: 2026-09-22 — como o código da feature 4 cumpre "nenhuma string
  literal solta" registrado em Consequências, como **provisório**; a Decisão não
  muda (memo `docs/reference/cli-decision.md`).

## Contexto

i18n e acessibilidade são baratas no começo e caras depois: adicionar idioma ou
semântica acessível a uma UI pronta costuma exigir reescrever a UI.

## Decisão

1. pt-BR e EN desde o primeiro commit.
2. Acessibilidade desde o início.
3. Benchmark com vault sintético registrando linha de base.

## Consequências

**Revisão de 2026-09-22, pelo mantenedor.** A decisão 1 obriga **a interface da
aplicação**: a UI da Fase 2 é pt-BR e EN. Ela **não** obriga a CLI, que é
ferramenta de quem desenvolve e pode ficar num idioma só. A razão dada, com as
palavras dele: *"a interface da aplicação deve ter pt-BR, o resto não
precisa"*. O que decorre disso:

- A `verso-cli` bilíngue construída na feature 7 **fica como está** — funciona,
  tem teste, e removê-la seria trabalho que não compra nada. Deixa de ser
  exigência, então um comando futuro pode nascer num idioma só sem quebrar esta
  ADR.
- O critério de saída 6 da Fase 1 é afrouxado na mesma medida
  (`docs/roadmap.md`).
- "Nenhuma string solta" continua de pé por mérito próprio na UI, onde é o que
  torna um segundo idioma possível. Na CLI passa a ser convenção do código
  existente, não regra desta ADR.
- Os resultados das ferramentas do `verso mcp` são dados para um modelo, não
  interface: inglês, e fora desta decisão de qualquer forma.

- "Desde o primeiro commit" significa **desde o primeiro commit de código de
  produto**: a Fase 0 é documentação e crates vazios. Vale para a UI da Fase 2 e
  para as mensagens da CLI da Fase 1: nenhuma string literal solta. A Fase 1
  ganha item de escopo e critério de saída para isso (`docs/roadmap.md`), e a
  dependência de i18n que `verso-cli` precisar é justificada no PR como qualquer
  outra ([0033](0033-pr-workflow.md)).
- O idioma do produto (pt-BR e EN, decidido) é independente do idioma da
  documentação do repositório, decidido à parte: inglês fonte, pt-BR espelho
  ([0008](0008-documentation-language.md)).
- O board precisa de vista equivalente acessível — lista ou tabela das mesmas
  notas e relações (`PROPOSTO`, [0024](0024-board-excalidraw.md)).
- O benchmark entra como guardrail na Fase 1
  ([0029](0029-guardrails-in-ci.md)), mas sem meta: metas de performance são
  `[ABERTO]` ([0039](0039-performance-targets.md)).
- i18n de schema com chave neutra de idioma é proposta separada
  (`docs/spec/dialect.md`).

**Como "nenhuma string literal solta" é cumprido na CLI. Registrado em
2026-09-22 a partir do código da feature 4 — provisório, o mantenedor decide ao
acordar**, na linha 3 da §10 de `docs/reference/cli-decision.md`. É o que o
código faz, não uma decisão.

- **Um enum `Msg`**, uma variante por mensagem voltada ao usuário, carregando
  seus dados como campos, e uma função `messages::text(msg, lang)` com um
  **`match` exaustivo por idioma**. Uma mensagem que existe num idioma e não no
  outro não compila: esse é o mecanismo inteiro, e não custa dependência
  nenhuma.
- **Um teste renderiza toda variante nos dois idiomas**, o que pega o
  copiar-e-colar que deixa a string em inglês no braço do pt-BR — a falha que o
  compilador não enxerga.
- **O idioma** vem de `--lang pt-BR|en`, senão da primeira entre `VERSO_LANG`,
  `LC_ALL`, `LC_MESSAGES` e `LANG` que estiver definida e não vazia: um valor
  que começa com `pt` seleciona pt-BR, qualquer outro seleciona EN, e um
  ambiente sem nenhuma delas é EN. O texto de uso e de ajuda passa pela mesma
  tabela, então o `verso help` também responde em dois idiomas.
- **"Toda impressão passa pelo `text`" é sustentado por revisão, não por
  lint.** `println!` é macro e o `disallowed_methods` do clippy nomeia métodos;
  não existe regra para "este `&str` chega na saída padrão". O código concentra
  a impressão para que a verificação seja um grep, e esta linha registra que o
  resto da garantia é humano ([0033](0033-pr-workflow.md)).
- **Nenhum crate de i18n.** `fluent`, `rust-i18n` e `gettext-rs` foram olhados e
  não tomados para três comandos e algumas dezenas de strings (§4.2 de
  `docs/reference/cli-decision.md`); a pergunta é reaberta para a UI da Fase 2,
  com os requisitos de uma UI e não de uma CLI.

**Depois da leitura da Opus 5 de 2026-09-22 o código também faz:**

- **Os problemas da varredura passam pela mesma tabela que o resto.** O
  `verso-core` os entrega como `WalkProblem` — laço, duplicata, fundo demais e
  io — e a CLI os renderiza como quatro variantes de `Msg` nos dois idiomas.
  Nenhuma renderização `Debug` do Rust chega mais ao usuário, e nenhuma chega
  também à saída `--json`.
- **A única parte não traduzida é o texto de erro do próprio sistema
  operacional**, dentro da variante io. É a string do sistema, no locale do
  sistema, e não é nossa para traduzir; esta linha registra a exceção em vez de
  deixá-la implícita.
- **O `backlinks` sobre uma nota que o índice não conhece diz isso** — "nota
  desconhecida", no stderr — em vez de responder "sem backlinks" como uma nota
  que existe e não tem nenhum. O critério de saída 2 é lido nessa saída.
- **O stdout carrega só a resposta.** Erros de uso, erros ao abrir a pasta ou o
  índice, as linhas de arquivo ilegível e as linhas de problema de uma execução
  vão para o stderr, de modo que `--json > arquivo` nunca mistura uma frase
  traduzida no JSON.
- **Um pipe fechado encerra a saída em silêncio.** Toda linha passa por
  `writeln!` num handle travado e a escrita para no primeiro erro, então
  `verso search … | head -1` termina com o código de saída do próprio comando
  em vez de um pânico por pipe quebrado.

## Alternativas descartadas

- Lançar só em um idioma e traduzir depois — descartado em §13.
- Acessibilidade como etapa posterior — descartada em §13.

## Status

Aceito.
