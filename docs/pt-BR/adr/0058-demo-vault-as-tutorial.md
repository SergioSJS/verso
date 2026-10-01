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
  como o percurso roda por máquina está `[ABERTO]`. 2026-10-01 — o
  mantenedor, mais tarde no mesmo dia, em sessão, escolhendo entre os
  caminhos abaixo: "1. topo ampliar o harness, acho que vai se um ganho a
  medida que a aplicação cresce. quero algo que automatize de fato esses
  testes para não precisar gastar token de llm pra isso". O percurso roda no
  harness do navegador (pontos 8 a 13); o `[ABERTO]` está fechado.

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

Como ele é mantido era do autor, para o mantenedor questionar; aceito pelo
mantenedor em 2026-10-01 (ponto 14):

4. **Os dois boards do tutorial são construídos por código.**
   `scripts/demo-vault/tour.mjs` e `scripts/demo-vault/treino.mjs` são a fonte
   deles; `node scripts/demo-vault.mjs build` os escreve no layout em que o
   Verso escreve (abrir um não escreve nada) e embute a pasta — os arquivos que
   o git acompanha — no app. Nenhum dos dois é editado no app e commitado: o
   build seguinte desfaria a edição. O terceiro board do cofre, "Board de
   Demonstração", é mantido à mão.
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

**Decidido em 2026-10-01 pelo mantenedor**, em sessão, sobre o percurso
rodado por máquina — o que o `check` e os testes unitários não cobrem, o
comportamento da própria janela:

8. **O percurso roda por máquina no harness do navegador**, guiado pelo
   WebKit do Playwright: sem janela, local, nunca toma o mouse nem o teclado;
   cresce com o app, e ninguém segue o percurso à mão para saber que ele
   ainda funciona.

Como ele é mantido era do autor, para o mantenedor questionar; aceito pelo
mantenedor em 2026-10-01 (ponto 14):

9. **O harness** (`app/ui/src/harness.ts` e `app/ui/src/harness/`) é a
   janela sobre um core escrito em TypeScript: o cofre de exemplo em memória,
   ou uma pasta vazia (`?vault=empty`); todo comando do contrato respondido
   com as formas e os erros do contrato, pelo próprio mock de IPC do Tauri, e
   depois, como o IPC de verdade responde; o protocolo `verso:` servido da
   mesma memória; o log do app guardado; a página sob a própria
   Content-Security-Policy do app. Ele não é o core: links, busca e bases são
   respondidos por alto, o bastante para a janela se comportar; as suas
   escritas são confinadas como as do core, mas a escrita de um board dispõe
   o canvas da janela sem o merge do core, ele nunca guarda um placeholder, e
   não manda evento de pasta depois das escritas da própria janela. O que o
   core faz é dos testes em Rust. Ele é construído à parte do app
   (`app/ui/e2e/build.mjs`, em `app/ui/e2e/.site/`) e nunca empacotado.
10. **Todo comando do contrato tem resposta no harness.**
    `app/ui/e2e/harness.spec.mjs` lê o `bindings.ts` e falha num comando que
    o harness não conhece: um comando novo chega com a sua resposta.
11. **Um teste falha diante de qualquer rastro de defeito**, além do que ele
    afirma: um erro no console ou da página, uma requisição que falhou, um
    `ERROR` no log do app, a área de trabalho da janela sem ocupar a janela
    (`app/ui/e2e/fixtures.mjs`).
12. **Os testes seguem o percurso**, um arquivo de `app/ui/e2e/` por parte
    dele; um passo de
    [`demo-vault-walkthrough.md`](../reference/demo-vault-walkthrough.md)
    que roda por máquina nomeia o seu teste, e o pull request de uma feature
    acrescenta os seus passos com os seus testes.
13. **Rodam localmente, não no CI**: `npm run e2e` em `app/ui`, e o
    `scripts/check.sh` depois do build da janela, antes de todo push. O que o
    harness não alcança fica à mão, e o percurso diz o quê: o core de
    verdade, o protocolo `verso:` do app, os menus e as teclas do Mac como o
    sistema os entrega (o evento de um menu é enviado como o host o envia),
    arquivos soltos a partir do Finder, o atualizador, um arquivo que o
    iCloud guarda na nuvem, e onde o WKWebView difere do WebKit do
    Playwright.

**Decidido em 2026-10-01 pelo mantenedor**, em sessão, sobre a revisão crítica
[`docs/review/board.md`](../review/board.md), seção 6, itens 12 e 13:
"Aceito todas (Recomendado)".

14. **Os pontos 4 a 7 e 9 a 13 estão aceitos** como escritos acima. Os testes
    unitários da janela (`npm test` em `app/ui`) rodam no `scripts/check.sh` e
    no job do pull request do CI ([0029](0029-guardrails-in-ci.md)); os
    testes de ponta a ponta ficam na máquina do autor.
15. **O harness nunca faz parte do app**: é construído fora do `dist/`, que o
    app empacota.

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
- O `@playwright/test` (Apache-2.0) é uma dependência nova de
  desenvolvimento da janela, nunca distribuída; o WebKit dele é baixado na
  primeira execução do `scripts/check.sh`.
- O `npm run build` escreve só o app; a página e o script do harness são
  construídos pelo servidor do Playwright em `app/ui/e2e/.site/` (ponto 15), e
  os bundles dos testes unitários vão para `app/ui/test/.bundles/`, os dois
  fora do que o app empacota.
- Os minutos do CI crescem só pelos testes unitários, segundos; os testes de
  ponta a ponta rodam na máquina do autor.

## Alternativas descartadas

- **Boards mantidos à mão, editados no app.** Considerada pelo autor: um
  agente não edita um board no app, e um JSON de cem elementos desenhados
  editado à mão não é lugar para acrescentar uma lição.
- **O app de verdade no Linux**, no contêiner que o `scripts/check-linux.sh`
  já usa, guiado por WebDriver (`tauri-driver` e WebKitWebDriver): o app
  inteiro, o core e o protocolo `verso:` incluídos, mas não os menus e as
  teclas do Mac, e ferramentas novas na imagem. Apresentada ao mantenedor em
  2026-10-01, que escolheu o harness.
- **O app de verdade no Mac**, guiado por eventos de entrada do sistema e
  capturas de tela, como o percurso foi seguido em 2026-10-01: tudo, os menus
  e as teclas do Mac incluídos, mas toma o mouse e o teclado enquanto roda,
  acha as coisas na tela pela posição, e precisa de um agente para ler o que
  vê. Apresentada ao mantenedor em 2026-10-01, que escolheu o harness.

## Status

Aceito (2026-10-01): os pontos 1 a 3 e 8 decididos pelo mantenedor; os pontos
4 a 7 e 9 a 13 aceitos pelo mantenedor no mesmo dia, com os pontos 14 e 15.
`[ABERTO]`: o cofre de exemplo em inglês.
