# ADR 0058 — O cofre de exemplo é o tutorial do produto, mantido a cada feature

- Data: 2026-10-01
- Fonte: o mantenedor, em sessão, em 2026-10-01: "faça o cofre ser bem
  completo para todo mundo aprnder o que da pra fazer dentro do verso.
  imagino que teremos um board geral pra plataforma, e outro pára ensinar ao
  proprio board. Preciso que vc siga o tutorial para ver se ta completo e se
  ta tudo funcionando. Crie instruções para o agente atualizar o tutorial a
  cada feature nova."; [0057](0057-board-json-canvas.md) (o board);
  [0033](0033-pr-workflow.md) (o pull request);
  [0029](0029-guardrails-in-ci.md) (guardrails);
  [0035](0035-cross-cutting-requirements.md) (pt-BR e EN)
- Status no briefing: ausente
- Revisões: 2026-10-01 — o mantenedor, no mesmo dia, em sessão: "registre os
  passos a passos de testes realizados para serem automatizados de alguma
  forma pra rodar localmente quando fizer sentido". O percurso está escrito
  (ponto 6), o `check` também confere que o cofre se sustenta (ponto 7), e
  como o percurso roda por máquina está `[ABERTO]`.

## Contexto

O conteúdo de exemplo — a pasta `demo-vault/`, que "Importar cofre de
exemplo" escreve na pasta aberta a partir de uma cópia embutida no app
(`app/ui/src/demoVault.ts`) — chegou no 0.3.0-beta.1 como um conjunto de
notas que mostram o que o Verso faz. Cresceu uma nota de cada vez, quando
alguém lembrava: nada dizia que uma feature o muda, e a cópia embutida era
refeita à mão. Em 2026-09-30 ganhou dois boards, um tour pela plataforma e
uma lição de desenho no board, gerados por um script que vivia fora do
repositório.

## Decisão

**Decidido em 2026-10-01 pelo mantenedor**, em sessão:

1. **O cofre de exemplo é o tutorial do produto.** Tudo que um usuário pode
   fazer no Verso é ensinado nele, e o que ele ensina funciona como diz.
2. **Dois boards o conduzem**: "Tour do Verso", a plataforma inteira parada
   por parada, com as notas do cofre vivas nos cartões; e "Treino do Board",
   o próprio board, Excalidraw incluído, lição por lição, cada uma com algo
   para praticar.
3. **Toda mudança que o usuário vê atualiza o tutorial**, no mesmo pull
   request, como acrescenta a sua linha ao changelog
   ([0051](0051-development-flow-and-releases.md)): uma nota que a ensina, um
   cartão ou uma linha no tour e, para o board, uma lição ou um passo de uma.

Como ele é mantido é do autor, para o mantenedor questionar:

4. **Os boards são construídos por código.** `scripts/demo-vault/tour.mjs` e
   `scripts/demo-vault/treino.mjs` são a fonte deles;
   `node scripts/demo-vault.mjs build` os escreve no layout em que o Verso
   escreve (abrir um não escreve nada) e embute a pasta no app. Um board nunca
   é editado no app e commitado: o build seguinte desfaria a edição.
5. **O que um board ensina é lido como texto desenhado**, legível no zoom em
   que uma parada ou uma lição inteira aparece; o Markdown de um cartão de
   texto fica pequeno demais ali. As notas continuam notas, como cartões.
6. **Uma tecla que o tutorial ensina é conferida** contra os testes de tecla
   do próprio Excalidraw e os atalhos da janela antes de ser escrita, e o
   tutorial é seguido no app antes do pull request, com o log do app aberto:
   um passo que não funciona é um bug do app ou do tutorial, corrigido no
   mesmo pull request. O percurso está escrito em
   [`demo-vault-walkthrough.md`](../reference/demo-vault-walkthrough.md): o
   que fazer, o que tem de acontecer, como se confere e até onde roda por
   máquina; uma feature acrescenta os seus passos.
7. **`node scripts/demo-vault.mjs check`** — os boards são os dos seus módulos
   e o embutido é o da pasta, e o cofre se sustenta: todo link de uma nota ou
   de um board leva a um arquivo do cofre, e um `#título` a um título da sua
   nota; as notas diárias e os templates ficam onde o app procura por padrão;
   toda nota numerada está no mapa da nota de boas-vindas, no tour, e aponta
   para a seguinte — roda no `scripts/check.sh` e no job de pull request da
   CI, como os bindings gerados são conferidos
   ([0026](0026-core-ui-contract-inviolable-rules.md), regra 3).

`[ABERTO]` **O cofre de exemplo em inglês.** O produto é pt-BR e EN
([0035](0035-cross-cutting-requirements.md)); o cofre de exemplo sempre foi só
em português, e nada decidiu isso. Até o mantenedor decidir, ele fica em
pt-BR.

`[ABERTO]` **O percurso, rodado por máquina.** O que o `check` e os testes
unitários não cobrem — o comportamento da própria janela e o do app de
verdade — é seguido à mão. Os caminhos vistos em 2026-10-01, para o
mantenedor escolher:

- **O harness de navegador** (`app/ui/harness.html`, com o core simulado)
  guiado por uma ferramenta de automação de navegador, o WebKit do Playwright
  por exemplo: sem janela, local, nunca toma o mouse. Só o comportamento da
  janela; o harness precisa responder a mais comandos do core (o salvamento
  de um board entre eles); uma dependência nova de desenvolvimento.
- **O app de verdade no Linux**, no contêiner que o `scripts/check-linux.sh`
  já usa, guiado por WebDriver (`tauri-driver` e WebKitWebDriver): o app
  inteiro, o core e o protocolo `verso:` incluídos; não os menus e as teclas
  do Mac; ferramentas novas na imagem.
- **O app de verdade no Mac**, guiado por eventos de entrada do sistema e
  capturas de tela, como em 2026-10-01: tudo, os menus e as teclas do Mac
  incluídos; toma o mouse e o teclado enquanto roda, e acha as coisas na tela
  pela posição.

## Consequências

- O `CLAUDE.md` §4 ("O PR") diz isso, ao lado da linha do changelog, nas duas
  línguas.
- A lista do que o pull request de uma feature toca ganha um item; uma
  feature sem nada a mostrar no tutorial diz isso no pull request.
- `scripts/check.sh` e `.github/workflows/ci.yml` rodam o check: um embutido
  velho ou um board editado à mão falha antes da revisão, não na pasta de um
  usuário.
- O script em Python que gerou os boards em 2026-09-30 é substituído pelo em
  Node no repositório (o Node já constrói a janela).
- `docs/reference/demo-vault-walkthrough.md` é o percurso: o pull request de
  uma feature acrescenta os seus passos, cada um com o nível em que pode rodar
  por máquina.

## Alternativas descartadas

- **Boards mantidos à mão, editados no app.** Considerada pelo autor: um
  agente não edita um board no app, e um JSON de cem elementos desenhados
  editado à mão não é lugar para acrescentar uma lição.
