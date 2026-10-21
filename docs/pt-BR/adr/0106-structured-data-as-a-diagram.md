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
- Revisões: 2026-10-21 — o mantenedor marcou as opções do questionário de
  decisões de 2026-10-20 (respondido em 2026-10-21), 0106.1 a 0106.10,
  todas como recomendadas exceto a 0106.5, em que escolheu "todos agora":
  todo `[PROPOSTO]` vira `[DECIDIDO 2026-10-21]`, o item 12 é fechado, os
  formatos do item 3 passam a sete, e a ADR é Aceita. Entra na V1 como a
  linha V.30 do roadmap, depois da onda D. 2026-10-21, mais tarde — o
  mantenedor respondeu D.1 a D.4 da lista de decisões de 2026-10-21, todas
  opção A (itens 8, 9 e 12, Status).

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
arrastados, ampliados e deslocados (`app/ui/src/leaves/graph.ts`);
e um board cujo formato de arquivo é JSON Canvas.

## Decisão

Aceita (2026-10-21). Itens marcados `[DECIDIDO 2026-10-20]` são as
palavras do mantenedor acima; `[DECIDIDO 2026-10-21]` marca o que ele
decidiu marcando uma opção no questionário de 2026-10-20 (0106.1 a
0106.10), que era a recomendação deste texto salvo quando o item diz
outra coisa. Nada resta `[PROPOSTO]` nem `[ABERTO]`.

1. **Um visualizador nosso, a partir da ideia do JSON Crack.**
   `[DECIDIDO 2026-10-20]` (caminho A). O modelo de caixas e linhas acima,
   desenho nosso, layout nosso, no próprio TypeScript da janela — sem
   React, sem `reaflow`, sem `elkjs`. Onde um trecho do código do JSON
   Crack for trazido, o arquivo mantém o aviso Apache-2.0 e diz o que
   mudou; a página de créditos cita o JSON Crack de qualquer forma.

2. **Mover caixas e recolher ramos.** `[DECIDIDO 2026-10-20]`. Uma caixa
   é arrastada com o ponteiro ou o dedo; um ramo recolhe e expande a
   partir da sua caixa. `[DECIDIDO 2026-10-21]` (0106.8, opção A): arrastar
   uma caixa leva junto o que está pendurado nela (como num mapa mental);
   com Alt ela se move sozinha. Uma caixa recolhida diz quanto esconde ("12 chaves", "340
   itens"). Recolher tudo, expandir tudo, expandir até uma profundidade, e
   "Arrumar de novo", que descarta os movimentos (e os recolhimentos
   guardados para o arquivo, item 12).

3. **JSON e YAML.** `[DECIDIDO 2026-10-20]`. `[DECIDIDO 2026-10-21]`
   (0106.10, opção A) para o YAML: cada
   documento de um arquivo com vários documentos é uma raiz própria; um
   alias é uma linha até a caixa da sua âncora, nunca uma cópia (assim um
   arquivo feito para se expandir em milhões de valores — o "billion
   laughs" — vira poucas caixas); uma tag aparece como um rótulo pequeno;
   comentários não são desenhados.
   **Mais formatos** `[DECIDIDO 2026-10-21]` (0106.5, **opção C — "todos
   agora"**, não a A recomendada): além de JSON e YAML, JSON com
   comentários (`.jsonc`), JSON por linha (`.jsonl`, logs), **TOML, XML e
   CSV** são desenhados desde o começo. TOML e XML pedem um parser cada:
   uma dependência para cada uma é justificada no PR que a constrói, com a
   licença na lista permitida ([0029](0029-guardrails-in-ci.md)). Um CSV,
   que já abre como tabela, é desenhado aqui como uma lista de registros
   (uma caixa por linha, uma linha da caixa por coluna), não como uma
   árvore própria.

4. **O desenho: caixas em HTML sobre linhas em SVG.** `[DECIDED
   2026-10-21]` (0106.7, opção A) — a
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

5. **Layout: uma árvore arrumada, nossa.** `[DECIDIDO 2026-10-21]`
   (0106.10, opção A). JSON e YAML são
   árvores (um alias é uma linha a mais, não um ramo), então um layout de
   árvore de algumas centenas de linhas substitui um motor genérico de
   grafos; refazer o layout depois de um recolhimento é linear e rápido.
   Da esquerda para a direita por padrão, de cima para baixo como opção.
   Uma caixa movida fica onde foi posta enquanto o resto é arrumado em
   volta da árvore.

6. **O diagrama e o texto, lado a lado.** `[DECIDIDO 2026-10-21]`
   (0106.10, opção A). Selecionar uma
   caixa seleciona o trecho dela no texto, e o cursor no texto marca a sua
   caixa — os parsers guardam o lugar de cada valor, que o JSON Crack
   perde. Copiar o caminho de uma caixa (`$.npcs[3].name`) ou o seu valor.
   Um número aparece como foi escrito (`12345678901234567890`, sem
   arredondar).

7. **Busca em tudo.** `[DECIDIDO 2026-10-21]` (0106.10, opção A). Chaves e valores, nos dados, não na
   tela: um resultado dentro de um ramo recolhido abre o caminho até ele.
   Próximo e anterior, a contagem, Esc.

8. **Só leitura.** `[DECIDIDO 2026-10-21]` (0106.10, opção A). O diagrama nunca grava o arquivo
   ([0012](0012-files-are-source-of-truth.md)); o texto é editado na
   visão de texto. Editar um valor pela caixa passaria pelo editor, com a
   checagem de arquivo alterado (invariantes 8 e 11); não está nesta ADR. Um comando escreve, e escreve um arquivo **novo**:
   **"Salvar como board"** `[DECIDIDO 2026-10-21]` (0106.4, opção A)
   transforma o diagrama como arrumado num board (`.canvas`, JSON Canvas:
   cartões de texto e ligações, que o Obsidian também abre), mostrado antes
   de ser gravado, nunca substituindo um arquivo
   ([0057](0057-board-json-canvas.md)); daí em diante é um board comum.
   `[DECIDIDO 2026-10-21]` (D.3, opção A): "Salvar como board" **recusa um
   diagrama de mais de 2000 cartões** e pede para recolher ramos antes (um
   número escolhido pela revisão, mantido pelo mantenedor).

9. **Limites e arquivos hostis.** `[DECIDIDO 2026-10-21]` (0106.10, opção
   A). Percorrer os dados nunca
   usa recursão na pilha (aninhamento profundo não a estoura). Um arquivo
   abre com os primeiros níveis expandidos até umas 300 caixas, o resto
   recolhido; só as caixas à vista são desenhadas, então o limite é o
   tamanho dos dados, não o número de caixas (o diagrama é oferecido até 20 MB de
   texto; acima disso, só a visão de texto). Toda
   chave e todo valor entram como texto, nunca como HTML; uma string longa
   é cortada, com o valor inteiro a pedido. `[DECIDIDO 2026-10-21]` (D.1,
   opção A): **acima de 200 mil caixas o arquivo abre como texto**, com um
   aviso dizendo por quê. A revisão classificou a falta de teto como
   IMPORTANTE (um arquivo hostil derrubava a janela); o mantenedor manteve o
   teto. A opção C, sem teto de caixas e só os 20 MB, não foi escolhida.

10. **Ao vivo.** `[DECIDIDO 2026-10-21]` (0106.10, opção A). Quando o texto muda — digitado, vindo de
    uma sala ([0082](0082-live-co-editing-of-a-synced-folder.md)) ou do
    disco — o diagrama acompanha depois de uma pausa, mantendo
    recolhimentos e movimentos pelo caminho de cada caixa. Um texto que
    não é válido mantém o último diagrama válido, com uma linha dizendo o
    erro e um link para o lugar dele.

11. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)).
    `[DECIDIDO 2026-10-21]` (0106.10, opção A). Para a tecnologia assistiva o diagrama é uma árvore, na
    ordem dos dados, não da tela: as setas vão ao pai, ao filho e ao
    irmão, Enter ou Espaço recolhe, e a visão de texto fica a uma tecla.
    Todo arrasto tem um equivalente de teclado (Alt com as setas move a
    caixa em foco), pela WCAG 2.5.7. Movimento reduzido: sem animação.
    Textos em pt-BR e EN.

12. **Quando, onde aparece, o que é guardado, o interruptor.** `[DECIDED
    2026-10-21]`, todas opção A:
    - **Na V1** (0106.1), como a linha V.30 do roadmap, depois da onda D.
    - **Onde aparece** (0106.2): num arquivo `.json`, `.yaml` (ou de
      qualquer formato do item 3), uma troca "Texto | Diagrama" no topo da
      aba, como as páginas HTML já têm; num bloco de código
      `json` ou `yaml` de uma nota, um botão "Ver como diagrama" que o abre
      numa aba ao lado. A nota em si não muda e o diagrama tem espaço.
    - **Movimentos e recolhimentos são guardados neste aparelho, por
      arquivo** (0106.3); "Arrumar de novo" os apaga. Não são gravados na
      pasta, e outra pessoa vê a arrumação automática; para compartilhar uma,
      "Salvar como board" (item 8).
    - **Um interruptor**, "Diagrama de dados", em Ajustes › App ›
      Funcionalidades, ligado por padrão como os outros da
      [0103](0103-feature-presets-and-capability-flags.md) (0106.6);
      desligado, nenhum botão do diagrama aparece. `[DECIDIDO 2026-10-21]`
      (D.2, opção A): desligá-lo também **fecha as abas de diagrama já
      abertas**, inclusive uma aberta a partir de um bloco ```` ```json ```` de
      uma nota; "desligado é desligado".
    - **Qual visão abre primeiro** (0106.9): o texto na primeira vez; depois,
      a última usada para aquele tipo de arquivo.

## Consequências

- `app/ui/src/datagraph/`: o modelo (texto lido para caixas e linhas, com
  o trecho de cada valor), o layout, a visão (camada, caixas, linhas,
  recorte do que está fora da tela, arrasto, recolhimento, busca) e seus
  testes com entradas sem CodeMirror; uma troca de modo na aba de texto,
  ao lado do editor de código.
- Nenhuma dependência nova para JSON e YAML: `yaml` e as gramáticas `@lezer`
  já estão na árvore. TOML e XML pedem um parser cada (item 3): uma
  dependência para cada uma, justificada no PR que a constrói, com a
  licença na lista permitida; JSON com comentários, JSON por linha e CSV
  devem dispensá-las, a confirmar na construção.
- A chave do item 12 é acrescentada à
  [0103](0103-feature-presets-and-capability-flags.md).
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

Além disso, recusado pelas marcas do mantenedor no questionário de
2026-10-20: depois da V1 (0106.1, B); só arquivos, ou o diagrama desenhado
dentro da nota (0106.2, B e C); movimentos guardados na pasta, ou não
guardados (0106.3, B e C); nenhum "Salvar como board" por ora (0106.4, B);
só JSON e YAML, ou TOML, XML e CSV depois (0106.5, B e A); nenhum
interruptor (0106.6, B); tudo em SVG ou um canvas (0106.7, B e C); mover só
a caixa (0106.8, B); sempre o diagrama ou sempre o texto (0106.9, B e C).

## Situação

Aceita (2026-10-21). Itens 1 a 3 nas palavras do mantenedor de 2026-10-20,
os demais pelas marcas dele de 2026-10-21.

Como construído em 2026-10-21, em `feat/rpg-tools` (não enviada, não
lançada): `2db25eb7` (o modelo, os analisadores, o layout de árvore
compacta, o estado e a busca), `96ed0e2d` (o interruptor em Ajustes >
Recursos), `71e77390` e `be77ad76` (a vista, a aba, o interruptor
Texto | Diagrama, "Ver como diagrama" num bloco de código), `2be226ea`
(testes de ponta a ponta), `558b6659` (a nota do tutorial, amostras,
créditos, changelog), `34aaba1b` (uma passada de revisão contra esta ADR),
`f60c59b0` e `d71b5dc8` (pedaço carregado sob demanda, interruptor ao
vivo); integrada por `59a2e894` e `2ebbbfc4`.

Nota de como construído, **não uma decisão do mantenedor**: o código também
lê **TSV** (um CSV com tabulações) como CSV com tabulações, um oitavo
formato ao lado dos sete do item 3 (`app/ui/src/datagraph/parse.ts`; o
commit `2db25eb7` diz "eight formats"). Ninguém decidiu isso; fica
registrado aqui para ser confirmado ou retirado. **Confirmado em
2026-10-21** pelo mantenedor (D.4, opção A): o diagrama continua lendo
`.tsv`, o mesmo leitor do CSV.
