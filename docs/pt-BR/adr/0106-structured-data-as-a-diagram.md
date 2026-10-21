# ADR 0106 — Dados estruturados como diagrama: JSON e YAML desenhados como caixas para mover, recolher e seguir de volta ao texto

- Data: 2026-10-20
- Origem: o mantenedor, 2026-10-20, sobre o [JSON Crack](https://github.com/AykutSarac/jsoncrack.com)
  (Apache-2.0): *"eu vi um app que exibe json de um jeito fantástico … a
  gente pode absorver isso? podemos aproveitar o código? a licença é
  compatível?"*. Diante de três caminhos — portar a ideia com desenho
  nosso, usar o componente React deles inteiro, ou só a ideia — ele
  respondeu: *"gosto do A, mas não sei se svg seria a melhor opção, pq
  seria legal ser possível mover as caixas pra reorganizar, minimizar ou
  expandir ramos e tal, parece que é compatível com yaml tb, explore melhor
  aí e faça um adr bacana"*. Escrito pelo Opus 5.5; a ser lido pelo outro
  modelo antes de ser aceito ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0012](0012-files-are-source-of-truth.md),
  [0029](0029-guardrails-in-ci.md) (lista de licenças permitidas),
  [0035](0035-cross-cutting-requirements.md),
  [0049](0049-phase-2-scope-widened.md) (arquivos que não são notas),
  [0057](0057-board-json-canvas.md) (o board, um arquivo JSON Canvas),
  [0072](0072-window-controls-in-the-app.md) (gestos de zoom),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0103](0103-feature-presets-and-capability-flags.md) (interruptores de recursos).
- Situação no briefing: ausente.

## Contexto

Um arquivo `.json` ou `.yaml` abre hoje no Verso como texto, no editor de
código, editável e salvo como uma nota. Ler um grande ou profundo como
texto é difícil: onde um ramo termina, quantos itens uma lista tem, o que
está três níveis abaixo. O JSON Crack desenha os mesmos dados como caixas
ligadas por linhas: uma caixa por objeto ou lista, uma linha por valor
simples, um traço até uma caixa filha para cada valor que é ele mesmo um
objeto ou uma lista, rotulado pela chave.

O que é o código dele, lido em 2026-10-20 (`packages/jsoncrack-react`,
Apache-2.0, sem arquivo NOTICE):

- **O parser** (`src/parser.ts`, 227 linhas) percorre a árvore do
  `jsonc-parser` gerando nós e ligações, o modelo acima. Pequeno, portável.
- **O desenho** é o `reaflow`, uma biblioteca React cujo motor de layout é
  o `elkjs` — licença **EPL-2.0 OU GPL-3.0-or-later**, nenhuma das duas na
  lista da [0029](0029-guardrails-in-ci.md); o `reaflow` também puxa um kit
  de interface (`reablocks`) e uma biblioteca de animação. As caixas são
  SVG com HTML dentro (`foreignObject`), as ligações SVG, sem virtualização.
- **O que ele não faz**: caixas não se movem (o arrasto está desligado);
  cada recolhimento refaz o layout do grafo inteiro; acima de 1.500 caixas
  (1.200 no site) ele para e oferece o produto pago, ToDiagram; a busca
  só acha as caixas na tela, então um ramo recolhido nunca é achado; nada
  funciona pelo teclado; entre as issues abertas há um estouro de pilha
  por volta de 2.500 linhas e uma queda com aninhamento profundo.
- **Formatos** no site: JSON, YAML, XML e CSV, cada um convertido antes
  num objeto JavaScript — o que perde a posição de cada valor no texto e
  arredonda números grandes.

O Verso já tem o que um visualizador próprio precisa, sem dependência
nova: a biblioteca `yaml` (ISC), que guarda onde cada valor está no
texto, suas âncoras, aliases e documentos; as gramáticas de JSON e YAML do
CodeMirror (`@lezer/json`, `@lezer/yaml`, MIT), que toleram um arquivo
sendo digitado; uma visão de grafo desenhada em SVG cujos nós já são
arrastados, ampliados e deslocados ([`leaves/graph.ts`](../../../app/ui/src/leaves/graph.ts));
e um board cujo formato de arquivo é JSON Canvas.

## Decisão

Proposta (2026-10-20). Itens marcados `[DECIDED 2026-10-20]` são as
palavras do mantenedor acima; `[PROPOSED]` marca uma recomendação deste
texto que ele ainda não respondeu.

1. **Um visualizador nosso, a partir da ideia do JSON Crack.**
   `[DECIDED 2026-10-20]` (caminho A). O modelo de caixas e linhas acima,
   desenho nosso, layout nosso, no próprio TypeScript da janela — sem
   React, sem `reaflow`, sem `elkjs`. Onde um trecho do código do JSON
   Crack for trazido, o arquivo mantém o aviso Apache-2.0 e diz o que
   mudou; a página de créditos cita o JSON Crack de qualquer forma.

2. **Mover caixas e recolher ramos.** `[DECIDED 2026-10-20]`. Uma caixa
   é arrastada com o ponteiro ou o dedo; um ramo recolhe e expande a
   partir da sua caixa. `[PROPOSED]`: arrastar uma caixa leva junto o que
   está pendurado nela (como num mapa mental); com Alt ela se move
   sozinha. Uma caixa recolhida diz quanto esconde ("12 chaves", "340
   itens"). Recolher tudo, expandir tudo, expandir até uma profundidade, e
   "Arrumar de novo", que descarta os movimentos.

3. **JSON e YAML.** `[DECIDED 2026-10-20]`. `[PROPOSED]` para o YAML: cada
   documento de um arquivo com vários documentos é uma raiz própria; um
   alias é uma linha até a caixa da sua âncora, nunca uma cópia (assim um
   arquivo feito para se expandir em milhões de valores — o "billion
   laughs" — vira poucas caixas); uma tag aparece como um rótulo pequeno;
   comentários não são desenhados. Quais outros formatos vêm, e quando, é
   o item 12.

4. **O desenho: caixas em HTML sobre linhas em SVG.** `[PROPOSED]` — a
   dúvida do mantenedor sobre SVG respondida. Mover e recolher não
   dependem da tecnologia; o grafo já arrasta nós em SVG. O que decide é
   a caixa: em HTML, uma caixa é texto que quebra linha, pode ser
   selecionado e copiado, usa as cores do tema, recebe o foco e é lido
   por um leitor de tela; as linhas embaixo são SVG; o conjunto é uma
   camada ampliada e deslocada como o grafo. Caixas todas em SVG precisam
   de `foreignObject` para texto que quebra, e o WebKit as rasteriza no
   tamanho do layout quando há zoom (o borrão achado nas imagens do
   board, 2026-10-20). Um canvas desenha mais caixas, mas borra no zoom se
   não for redesenhado, não seleciona texto e precisa de uma segunda
   estrutura escondida para teclado e leitor de tela. Só as caixas à
   vista ficam na página (item 9).

5. **Layout: uma árvore arrumada, nossa.** `[PROPOSED]`. JSON e YAML são
   árvores (um alias é uma linha a mais, não um ramo), então um layout de
   árvore de algumas centenas de linhas substitui um motor genérico de
   grafos; refazer o layout depois de um recolhimento é linear e rápido.
   Da esquerda para a direita por padrão, de cima para baixo como opção.
   Uma caixa movida fica onde foi posta enquanto o resto é arrumado em
   volta da árvore.

6. **O diagrama e o texto, lado a lado.** `[PROPOSED]`. Selecionar uma
   caixa seleciona o trecho dela no texto, e o cursor no texto marca a sua
   caixa — os parsers guardam o lugar de cada valor, que o JSON Crack
   perde. Copiar o caminho de uma caixa (`$.npcs[3].name`) ou o seu valor.
   Um número aparece como foi escrito (`12345678901234567890`, sem
   arredondar).

7. **Busca em tudo.** `[PROPOSED]`. Chaves e valores, nos dados, não na
   tela: um resultado dentro de um ramo recolhido abre o caminho até ele.
   Próximo e anterior, a contagem, Esc.

8. **Só leitura.** `[PROPOSED]`. O diagrama nunca grava o arquivo
   ([0012](0012-files-are-source-of-truth.md)); o texto é editado na
   visão de texto. Editar um valor pela caixa passaria pelo editor, com a
   checagem de arquivo alterado (invariantes 8 e 11); não está nesta ADR.

9. **Limites e arquivos hostis.** `[PROPOSED]`. Percorrer os dados nunca
   usa recursão na pilha (aninhamento profundo não a estoura). Um arquivo
   abre com os primeiros níveis expandidos até umas 300 caixas, o resto
   recolhido; só as caixas à vista são desenhadas, então o limite é o
   tamanho dos dados, não o número de caixas (proposto: o diagrama é
   oferecido até 20 MB de texto; acima disso, só a visão de texto). Toda
   chave e todo valor entram como texto, nunca como HTML; uma string longa
   é cortada, com o valor inteiro a pedido.

10. **Ao vivo.** `[PROPOSED]`. Quando o texto muda — digitado, vindo de
    uma sala ([0082](0082-live-co-editing-of-a-synced-folder.md)) ou do
    disco — o diagrama acompanha depois de uma pausa, mantendo
    recolhimentos e movimentos pelo caminho de cada caixa. Um texto que
    não é válido mantém o último diagrama válido, com uma linha dizendo o
    erro e um link para o lugar dele.

11. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)).
    `[PROPOSED]`. Para a tecnologia assistiva o diagrama é uma árvore, na
    ordem dos dados, não da tela: as setas vão ao pai, ao filho e ao
    irmão, Enter ou Espaço recolhe, e a visão de texto fica a uma tecla.
    Todo arrasto tem um equivalente de teclado (Alt com as setas move a
    caixa em foco), pela WCAG 2.5.7. Movimento reduzido: sem animação.
    Textos em pt-BR e EN.

12. `[OPEN]` para o mantenedor — onde aparece, onde os movimentos ficam
    guardados, quais outros formatos, quando é construído e o
    interruptor: as perguntas 0106.1 a 0106.10 da lista de decisões de
    2026-10-20, cada uma com uma recomendação.

## Consequências

- `app/ui/src/datagraph/`: o modelo (texto lido para caixas e linhas, com
  o trecho de cada valor), o layout, a visão (camada, caixas, linhas,
  recorte do que está fora da tela, arrasto, recolhimento, busca) e seus
  testes com entradas sem CodeMirror; uma troca de modo na aba de texto,
  ao lado do editor de código.
- Nenhuma dependência nova: `yaml` e as gramáticas `@lezer` já estão na
  árvore.
- A página de créditos ganha o JSON Crack.
- Um teste de ponta a ponta arrasta uma caixa, recolhe um ramo, acha um
  valor dentro de um ramo recolhido e percorre a árvore pelo teclado, no
  WebKit e no Chromium.

## Alternativas descartadas

- **O componente React do JSON Crack inteiro** (`jsoncrack-react`):
  considerado com o mantenedor em 2026-10-20. Precisa do `elkjs` (EPL-2.0
  ou GPL-3.0, fora da lista), do React e da árvore do `reaflow` na janela,
  e traz junto a falta de arrasto, o teto e a lacuna de teclado.
- **Só a ideia, sem código deles**: considerada com o mantenedor em
  2026-10-20; ele escolheu A, que pode trazer o modelo do parser deles com
  o aviso.

## Situação

Proposta (2026-10-20). Itens 1 a 3 decididos pelo mantenedor; os demais
são recomendações para ele responder, com as perguntas do item 12.
