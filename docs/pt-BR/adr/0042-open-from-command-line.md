# ADR 0042 — Abrir pela linha de comando: `verso <pasta>`

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-21 — consequência sobre o CLI do Obsidian como referência de
  paridade acrescentada a pedido do mantenedor ("vale até anotar essas coisas
  do cli que pode ser útil pra gente implementar paralelos melhorados"); nomeia
  uma referência, não um item de escopo novo — as features 4 e 6 da Fase 1
  ficam como o roadmap lista.
- Revisões: 2026-09-22 — o que o código da feature 4 faz registrado em
  Consequências, como **provisório**; a regra de desambiguação continua
  `[ABERTO]`, a Decisão não muda (memo `docs/reference/cli-decision.md`).
- Revisões: 2026-09-23 — o que o código da Fase 2 faz com `verso <pasta>` e
  `verso open` registrado em Consequências, como **provisório**; a regra
  continua `[ABERTO]`.

## Contexto

Se a pasta é a unidade e o Verso abre qualquer pasta como um editor de código
abre ([0010](0010-folder-is-the-unit-no-vault.md)), o gesto de abrir também
precisa ser o de um editor de código: do terminal, onde a pessoa já está.

## Decisão

O Verso abre pela linha de comando, no modelo do `code .`: `verso <pasta>`.

**Decidido em 2026-09-22 pelo mantenedor, para a Fase 1**
(`docs/reference/cli-decision.md` §10, linha 1). **Subcomando obrigatório na
primeira posição**: `verso index <pasta>`, `verso search <pasta> <palavras…>`,
`verso backlinks <pasta> <nota>`, `verso mcp <pasta>`, `verso help`. A pasta é
argumento do subcomando e não existe pasta padrão. Um argumento que começa com
`--` e não é opção conhecida é erro de uso, não pasta.

**Registrado, não decidido, para a Fase 2**: um primeiro argumento que nomeia um
diretório existente abre esse diretório, qualquer outra coisa é lida como
subcomando, com `verso open <pasta>` e `verso -- <pasta>` como saídas de
emergência. `--` como separador não existe na Fase 1, então uma pasta cujo nome
começa com `--` ainda não pode ser passada.

## Consequências

- Exige um executável no `PATH` e uma forma de instalá-lo; como isso é feito em
  cada plataforma, o briefing não diz.
- Colide com o espaço de subcomandos já previsto para o `verso-cli` — `verso
  index`, `verso search`, `verso backlinks`, `verso mcp`
  ([0028](0028-crate-structure.md), Aceito) e `verso serve`
  ([0025](0025-own-server-and-mobile-pwa.md), Proposto). `verso <pasta>`
  significa que o primeiro argumento é um caminho quando não casa com um
  subcomando conhecido. Uma pasta chamada `index` ou `search` é o caso ambíguo,
  e a regra de desambiguação é `[ABERTO]`.
- Abrir a UI a partir da CLI só é possível quando existe UI, ou seja, a partir da
  Fase 2 ([0034](0034-roadmap-in-phases.md)). Na Fase 1 o binário é só CLI. Em
  que fase o comando de abertura entra, o briefing não diz: `[ABERTO]`.
- O `verso-cli` já aparece na Fase 1, então os subcomandos nascem antes do
  comando de abertura; a regra de desambiguação precisa ser decidida antes de o
  conjunto de subcomandos crescer.
- Com workspace multi-raiz ([0041](0041-multi-root-workspace.md), `PROPOSTO`),
  abrir várias pastas de uma vez é a extensão natural. Não está decidido.
- O CLI do Obsidian (app 1.13) é a descrição pública mais próxima do que o
  índice do Obsidian responde: links, backlinks, não resolvidos, órfãos, becos
  sem saída, busca, outline, propriedades, tags. `verso-cli` e `verso mcp`
  devem cobrir pelo menos essa superfície, melhor; o mapeamento está em
  `docs/reference/obsidian-cli.md`.

**O que o código da feature 4 faz com a colisão acima. Registrado em
2026-09-22 — provisório, o mantenedor decide ao acordar**, na linha 1 da §10 de
`docs/reference/cli-decision.md`. É o que o binário faz hoje, não uma decisão;
a regra de desambiguação acima continua `[ABERTO]`.

- **Na Fase 1 o primeiro argumento é sempre um subcomando.** O conjunto é
  `index`, `search` e `backlinks`, com `mcp` entrando na feature 6; `help`,
  `--help` e `-h` imprimem o uso. Qualquer outra coisa na primeira posição é
  erro de uso que nomeia o conjunto, com código de saída 2.
- **A pasta é o primeiro argumento do subcomando** — `verso index <pasta>`,
  `verso search <pasta> <palavras…>`, `verso backlinks <pasta> <nota>` — e não
  há pasta padrão: omiti-la é erro de uso. Se o diretório atual fica implícito
  é parte da mesma pergunta da Fase 2 que o `verso <pasta>`.
- **`verso <pasta>` ainda não existe**, e não pode existir: abrir exige UI, que
  é Fase 2 ([0034](0034-roadmap-in-phases.md)). Então nenhuma invocação da
  Fase 1 exercita a ambiguidade que este ADR nomeia, e acrescentar o comando de
  abertura depois é aditivo sobre a superfície acima.
- **A regra que o memo recomenda para a Fase 2 é recomendação, não decisão
  deste ADR**: um primeiro argumento que nomeia um diretório existente abre esse
  diretório, senão é subcomando, com `verso open <pasta>` e `verso -- <pasta>`
  como saídas de emergência para uma pasta com nome de subcomando. Nada no
  código implementa isso.

**Depois da leitura da Opus 5 de 2026-09-22 o código também faz:**

- **Um argumento que começa com `--` e não é uma opção conhecida é erro de
  uso** que o nomeia, com código de saída 2 — e também são erro de uso um valor
  ausente ou inválido para `--limit` ou `--lang`, um posicional que o subcomando
  não pediu e o `--unresolved` fora do `backlinks`. Antes disso,
  `verso search <pasta> dragões --limit castelos` buscava silenciosamente só por
  `dragões` com o limite padrão: resposta errada sem diagnóstico nenhum.
- **O `--lang` continua sendo lido antes de qualquer um desses erros ser
  impresso**, então o erro sai no idioma que o usuário pediu mesmo quando o
  resto da linha está errado.
- **`verso help` imprime o uso e sai com 0**; pedir ajuda não é erro de uso. O
  `verso -h` e o `verso --help` fazem o mesmo: `--help` é o único argumento que
  começa com `--` que a regra de opção desconhecida acima deixa passar.
- **O `--` não é suportado como separador.** Ele cai na mesma regra, então uma
  pasta cujo nome começa com `--` não pode ser passada de jeito nenhum na
  Fase 1. O memo só quer o separador a partir da Fase 2; a lacuna fica
  registrada, não decidida.
- **Um nome de pasta que não é UTF-8 continua `OsString`**, do `args_os` até
  virar `PathBuf` para o `verso-fs`. Só o subcomando, as palavras da busca e a
  nota são lidos como texto.

**O que o código da Fase 2 faz. Registrado em 2026-09-23 — provisório; a
regra de desambiguação acima continua `[ABERTO]`.** O comando de abrir entrou
na Fase 2 junto com a janela, a pedido do mantenedor em 2026-09-22 ("ser
possível fazer um verso . no terminal e fazer com que ele abra naquele
diretório"); em que fase ele entra ficou aberto acima, e esta é a fase que o
código escolheu.

- **Um subcomando na primeira posição é sempre o subcomando** — `index`,
  `search`, `backlinks`, `mcp`, `open`, `help`, `--help`, `-h` — mesmo quando
  existe um diretório com esse nome: `verso index` dentro de uma pasta que tem
  `index/` responde "falta a pasta".
- **Qualquer outro primeiro argumento que nomeia um diretório existente o
  abre** na janela: `verso notas`, `verso .`, `verso ../outra`, um caminho
  absoluto. É a regra que o memo recomenda. Se o argumento nomeia um diretório
  é perguntado ao `verso-fs` (`Root::open`, que não lê nada). Um segundo
  argumento depois da pasta é erro de uso.
- **Qualquer outra coisa na primeira posição é erro de uso**, código de saída
  2, que diz que não há nem comando nem pasta com esse nome ("comando
  desconhecido, e nenhuma pasta com esse nome"), seguido do uso.
- **`verso open <pasta>` abre uma pasta seja qual for o nome** — a saída para
  uma pasta com nome de subcomando (`verso open index`). Ele não pergunta ao
  disco antes; uma pasta que não existe é reportada pela janela. **`verso open`
  sozinho é erro de uso**: não há pasta padrão, como esta ADR decidiu para os
  subcomandos.
- **O `--` continua não sendo separador**, então uma pasta cujo nome começa com
  `--` só abre por um caminho que não comece assim, como `./--nome`.
- **Como a janela começa**: a CLI roda `$VERSO_APP` quando existe, senão o
  binário `verso-app` ao lado dela, senão, no macOS, o app instalado por
  `open -a Verso --args <pasta>`. Cada execução começa um processo novo; um app
  que já está aberto não recebe a pasta pelo `open -a`
  (`docs/review/phase-2.md`, leitura 3, achado 20).
- **A primeira versão deste código** usava uma regra léxica — `.`, `..`, uma
  `/` ou um `~` no começo faziam do argumento uma pasta —, então `verso notas`
  era comando desconhecido e `verso ./nao-existe` dizia que estava abrindo; e
  `verso open` sozinho abria `.`. A leitura da Opus de 2026-09-23 achou as duas
  coisas (`docs/review/phase-2.md`, leitura 3, achado 9), e elas foram trocadas
  pelo comportamento acima.

## Alternativas descartadas

Nenhuma registrada no briefing.

## Status

Aceito.
