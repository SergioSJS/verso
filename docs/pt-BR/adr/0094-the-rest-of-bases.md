# ADR 0094 — O resto das bases: expressões regulares, o layout de mapa, e o que o 0053 deixou sem construir

- Data: 2026-10-14
- Fonte: `docs/roadmap.md`, revisão 8, linha V.19, a partir da resposta
  do mantenedor de 2026-10-14 sobre quais lacunas do núcleo entram na V1
  — o resto das bases, *"resto das bases"*: as expressões regulares
  **e** o layout de mapa; [0053](0053-views-bases.md), Consequências
  ("Não construído: expressões regulares, o layout de mapa, `html()`
  renderizado como HTML, a edição por view de uma base incorporada de
  outro arquivo"). Escrita por Opus 5.5 a pedido do mantenedor; a ser
  lida pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0053](0053-views-bases.md), [0050](0050-outbound-network-access.md)
  (rede de saída), [0056](0056-embedded-web-pages.md) (origens que o
  usuário aprovou), [0090](0090-maps-on-the-board.md) (mapas no board),
  [0083](0083-security-hardening-of-universo.md) (os limites de um
  servidor), [0081](0081-sharing-between-people-on-one-universo.md) item
  11 (os agregados de quem recebe), [0087](0087-secret-blocks-hidden-from-readers.md),
  [0085](0085-hover-preview.md), [0092](0092-the-phone-offline.md),
  [0030](0030-base-dialect-obsidian-compatible.md) (invariante 12),
  [0009](0009-external-constraints.md), [0028](0028-crate-structure.md),
  [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente; a linha das visões estruturadas da §5.3
  está `DECIDED` pelo [0053](0053-views-bases.md).

## Contexto

**O que existe.** O `verso-dialect` lê uma base e a linguagem de
expressões dela, literais de expressão regular incluídos — `/padrão/flags`
é guardado como texto (`crates/verso-dialect/src/bases/expr.rs`). O
`verso-core` a avalia com um orçamento de passos por consulta, cada valor
que ele faz cobrado do orçamento e cada texto limitado
(`crates/verso-core/src/bases/eval.rs`); uma expressão regular que chega a
um método — `matches`, `replace`, `split` — é um erro na célula, "não
avaliado", como o 0053 decidiu (o que não é avaliado é dito, nunca
adivinhado). Toda outra função que a página Functions do Obsidian lista é
avaliada (comparado em 2026-10-14). A janela desenha cinco layouts —
tabela, cartões, lista, kanban, calendário; uma view de outro `type` é
desenhada como tabela com uma linha dizendo que o layout é desconhecido
(`app/ui/src/bases/view.ts`), e `map` já tem nome e ícone ali. Uma base
roda no host da janela no desktop e no `verso-server` num UniVerso, sobre
todas as notas da pasta.

**Expressões regulares, como o Obsidian as documenta** (a ajuda pública,
[Functions](https://obsidian.md/help/bases/functions), fonte
`en/Bases/Functions.md` em `e23f4f92`, 2026-05-14; lida em 2026-10-14):

- *"Bases functions follow JavaScript behavior. For complete reference
  documentation, refer to MDN Web Docs."*
- Uma expressão regular é um literal, *"Example: `/abc/`"*, com um
  método, `regexp.matches(value: string): boolean` — *"`/abc/.matches("abcde")`
  returns `true`"*.
- `string.replace(pattern: string | Regexp, replacement: string): string`:
  *"When `pattern` is a Regexp, you can reference capture groups in
  `replacement` using `$1`, `$2`"*; *"If `pattern` is a Regexp, the `g`
  flag determines if only the first or if all occurrences are replaced."*
- `string.split(separator: string | Regexp, n?: number): list`.
- Não documentado: nenhuma flag além de `g`; o que um padrão inválido
  faz; um construtor. O `obsidian.d.ts` tem `RegExpValue` (`@since 1.10.0`).

**O layout de mapa, como o Obsidian o documenta** — **não é nativo**:
*"It requires installing the Maps plugin"*, *"an official community
plugin that you can download separately"*, a partir do Obsidian 1.10
([Map view](https://obsidian.md/help/bases/views/map); o changelog da
1.10.0, 2025-10-01: *"New Maps plugin lets you visualize your base
entries on a map"*). O plugin é do Obsidian, MIT,
[`obsidianmd/obsidian-maps`](https://github.com/obsidianmd/obsidian-maps)
(0.2.2, 2026-08-01), construído sobre o MapLibre GL JS; ele registra a
view `type: map`. A página de ajuda:

- coordenadas de uma propriedade, *"`coordinates: "lat, lng"` (Text
  property)"* ou uma lista de dois, ou uma fórmula `[latitude, longitude]`;
- o ícone de um marcador (*"The name of an icon from the Lucide
  library"*) e a cor (*"A valid CSS value"*), cada um podendo ser fórmula;
  a altura incorporada, o centro, os limites de zoom;
- tiles: *"Maps support both raster and vector tiles, and accepts most
  tile URLs, including TileJSON URLs"*; o README: *"Maps use OpenFreeMap
  tiles by default"*, outra fonte definida nos ajustes do plugin, com uma
  URL separada para o modo escuro. Nenhuma das páginas diz nada sobre
  privacidade ou rede.

As chaves da view num arquivo `.base` (`coordinates`, `markerIcon`,
`markerColor`, `center`, `defaultZoom`, `minZoom`, `maxZoom`,
`mapHeight`, `mapTiles`, `mapTilesDark`) são lidas do código público MIT
do plugin (`src/map-view.ts`), não da ajuda — uma fonte admissível desde
a revisão do [0009](0009-external-constraints.md) de 2026-10-14 (o
*"Sim, todas"* do mantenedor: o código público de um plugin de código
aberto que o Obsidian publica, como o `obsidian.d.ts`) — e conferidas
numa base que o plugin escreve antes do PR. O
manifesto do plugin pede o Obsidian 1.13.1 enquanto a ajuda diz 1.10;
registrado, não resolvido.

[0050](0050-outbound-network-access.md) item 1: o Verso pede à rede só
endereços escritos nas notas do usuário ou clicados, e *"sem terceiro no
lugar de um site"*. Um servidor de tiles que ninguém nomeou é um
terceiro assim: ele fica sabendo quais lugares, em que zoom, a pessoa
olha.

## Decisão

Proposta (2026-10-14). Aceita em 2026-10-14 (Status): cada `[DECIDIDO 2026-10-14]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`.

### Expressões regulares

1. **Avaliadas como o Obsidian as documenta**: o literal
   `/padrão/flags`, `regexp.matches(texto)`, `replace` com um padrão — a
   primeira ocorrência, ou todas com `g`, `$1`…`$99`, `$&` e `$$` na
   substituição como o MDN os dá —, e `split` com um padrão e um limite.
   Uma expressão regular em qualquer outro lugar (`contains`,
   `startsWith`) continua um erro, já que a ajuda dá a esses métodos só
   strings.
2. **O motor.** `[DECIDIDO 2026-10-14]`. Opções: (a) o crate `regex` (MIT ou
   Apache-2.0, já no lock do workspace pelos testes do `verso-server`),
   cujo tempo de casamento é linear no padrão e no texto — não existe
   backtracking catastrófico para ele; não tem look-around nem
   back-references; (b) o `fancy-regex`, que acrescenta os dois por
   backtracking, com um limite de passos; (c) o `RegExp` do próprio
   JavaScript da janela — fora de alcance para uma base que o núcleo
   avalia, num servidor também, e sem limite. Decidido: **(a)**, só no
   `verso-core` — o `verso-dialect` guarda o literal como texto e não
   ganha dependência (um parser puro que compila para WASM,
   [0028](0028-crate-structure.md), [0029](0029-guardrails-in-ci.md));
   um padrão que usa o que (a) não tem é um erro na célula que o nomeia
   ("look-behind não é avaliado"), nunca um palpite.
3. **Limites**, porque uma base roda num servidor sobre todas as notas
   ([0083](0083-security-hardening-of-universo.md)): um padrão de no
   máximo 1.000 caracteres; um tamanho compilado limitado
   (`RegexBuilder::size_limit` e o do DFA preguiçoso), além do qual é um
   erro; um padrão compilado uma vez por consulta, não uma vez por linha;
   cada casamento cobrado do orçamento da consulta pelo tamanho do texto
   que ele percorre, como todo texto é. Os números são medidos no host de
   1 núcleo e 1 GB com os outros do item 18 do 0083 (roadmap V.10) e
   mudados se a medida mandar.
4. **O sentido do JavaScript, onde os motores diferem**: `\d`, `\w` e
   `\b` são ASCII, como no JavaScript; `.` para numa quebra de linha a
   não ser com `s`; `^` e `$` casam em quebras de linha só com `m`.
   Flags: `g`, `i`, `m`, `s` e `u` são respeitadas; `y`, `d` e `v` são um
   erro que as nomeia. Uma diferença achada depois vira um teste com as
   duas respostas, e o código segue o JavaScript.
5. **Um padrão inválido** é um erro na célula e uma linha acima da view
   nomeando a fórmula, como qualquer erro de fórmula no 0053 — a ajuda não
   diz o que o Obsidian faz, e o Verso não adivinha.

### O layout de mapa

6. **Uma view `type: map`, com as chaves do plugin Maps.** Uma nota com
   uma propriedade de coordenadas — um texto `"lat, lng"` ou uma lista de
   dois números, ou uma fórmula que dê qualquer dos dois, valores fora do
   intervalo deixados de fora — é um marcador com o ícone e a cor dele;
   um clique abre a nota, passar o ponteiro mostra a prévia
   ([0085](0085-hover-preview.md)); o centro, os limites de zoom e a
   altura como a view diz. Uma base que o plugin do Obsidian fez abre como
   mapa no Verso, e uma feita no Verso abre no Obsidian com o plugin
   instalado; sem ele, o Obsidian não desenha essa view, o que é
   comportamento dele, não do Verso. Os marcadores e os ajustes da view
   mudam pelos menus da view como nos layouts do 0053; um marcador não é
   arrastado para novas coordenadas na V1. `[DECIDIDO 2026-10-14]`: se "Nova nota aqui"
   no mapa — uma nota criada com as coordenadas clicadas — está na V1.
   Decidido: **fora da V1**; não está na view documentada do Obsidian.
7. **A biblioteca de desenho.** `[DECIDIDO 2026-10-14]`. Decidido: **MapLibre GL JS**
   (BSD-3-Clause, o que o plugin usa, então uma URL de estilo em
   `mapTiles` que funciona lá funciona aqui), carregada só quando uma
   view de mapa abre; a licença conferida pela allowlist do npm, a
   dependência justificada no PR.
8. **Tiles: nenhum de terceiro por padrão.** `[DECIDIDO 2026-10-14]`: o que um mapa
   mostra sem fonte escolhida. Decidido: **um mundo desenhado com
   dados que vêm com o app** — um contorno de pouco detalhe de costas e
   fronteiras (o do Natural Earth, de domínio público pelos termos dele, a
   confirmar no PR que o acrescenta), sem rede —; **uma fonte de tiles só
   por escolha da pessoa**, como uma origem aprovada nos Ajustes como a
   origem de uma página incorporada é ([0056](0056-embedded-web-pages.md)):
   a janela então carrega os tiles dela diretamente, como a imagem remota
   de uma nota carrega, e o ajuste "carregar conteúdo remoto" do
   [0050](0050-outbound-network-access.md) a governa. Os Ajustes oferecem
   o OpenFreeMap — o padrão do plugin —, nomeado, como uma escolha a
   ligar, nunca ligado sozinho.
9. **O `mapTiles` da própria base.** Um endereço de tiles escrito num
   arquivo `.base` é um endereço escrito na pasta, e uma base numa pasta
   compartilhada faria a janela de cada leitor pedir àquele servidor.
   `[DECIDIDO 2026-10-14]`. Decidido: **usado só quando a origem dele está aprovada**
   (item 8) — na primeira vez, a view diz qual origem a base nomeia e
   oferece aprová-la; até lá o mundo que vem com o app é desenhado.
10. **Num UniVerso e no celular.** Os tiles nunca passam pelo servidor: a
    janela os busca, e a política de segurança de conteúdo do servidor
    deixa a janela alcançar só as origens aprovadas. O celular offline
    ([0092](0092-the-phone-offline.md)) desenha os marcadores sobre o
    mundo que vem com o app; tiles aprovados não são guardados offline na
    V1. Um leitor vê só os marcadores das notas que pode ler; um bloco
    secreto ([0087](0087-secret-blocks-hidden-from-readers.md)) que
    contém uma coordenada não é lido para um leitor; quem recebe um
    compartilhamento conta como o item 11 do
    [0081](0081-sharing-between-people-on-one-universo.md) diz.
11. **Imagens como mapas.** Uma view de mapa sobre uma imagem da pasta,
    coordenadas em pixels dela — um mundo de ficção numa base — é uma
    extensão do Verso que o plugin do Obsidian não documenta. `[DECIDIDO 2026-10-14]`.
    Decidido: **fora da V1**: os alfinetes num board do
    [0090](0090-maps-on-the-board.md) são os mapas de ficção da V1.

### O resto que o 0053 deixou sem construir

12. **`html()` renderizado como HTML.** Hoje ele mostra o texto.
    `[DECIDIDO 2026-10-14]`: se a V1 o renderiza. Decidido: **sim, pelo sanitizador
    da janela** (`app/ui/src/sanitize.ts`), o mesmo por onde passa o HTML
    de uma nota — nenhum script, nenhum atributo de evento, conteúdo
    remoto sob o ajuste do 0050 —, num servidor como no desktop.
13. **Edição por view de uma base incorporada de outro arquivo.** Hoje
    `![[Arquivo.base#View]]` só troca de view. `[DECIDIDO 2026-10-14]`: se a V1 a edita
    no lugar. Decidido: **sim**: os menus da incorporação escrevem o
    arquivo `.base` que mostram, pela escrita comum e a verificação de
    revisão dela (invariante 11), como a aba da própria base faz; um
    leitor não vê menu ([0076](0076-the-window-on-every-screen.md)).
14. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
    uma view de mapa tem os marcadores também como lista — nome,
    coordenadas — na ordem da classificação da view, alcançáveis por Tab
    e com o nome das notas, o equivalente em texto do mapa, como o item 7
    do 0090 dá aos alfinetes de um board; o erro de uma expressão regular
    é uma frase; pt-BR e inglês.

## Consequências

- O `verso-core` ganha as expressões regulares (com o motor do item 2
  como dependência nova desse crate, justificada no PR) e testes de cada
  exemplo documentado da ajuda, das flags, das diferenças do item 4, de
  um padrão inválido, e de um padrão conhecido por backtracking
  catastrófico em outros motores (`(a+)+$` sobre um texto longo)
  terminando dentro do orçamento; o alvo de fuzz das expressões cobre
  padrões.
- A janela ganha o layout de mapa, o mundo que vem com o app e as origens
  de tiles nos Ajustes; testes e2e de um mapa de algumas notas, de um
  marcador abrindo a nota, de uma base nomeando uma origem de tiles não
  aprovada, e da lista de marcadores; `html()` desenhado sanitizado; os
  menus da incorporação escrevendo o arquivo dela.
- A política de segurança de conteúdo do servidor nomeia as origens de
  tiles aprovadas; a suíte dele testa que ele nunca busca um tile.
- A lista "Não construído" do [0053](0053-views-bases.md) é respondida
  por uma linha de Revisões ali quando este ADR for aceito.
- O tutorial ([0058](0058-demo-vault-as-tutorial.md)): a nota 04 ganha
  uma fórmula com expressão regular e uma view de mapa sobre algumas
  notas com coordenadas; o changelog ganha a sua linha.

## Alternativas descartadas

Nenhuma registrada.

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondeu às
perguntas do 0093, do 0094 e do 0095 com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na
V1 (`docs/roadmap.md`, Fase 4 — V1, linha V.19, onda A). A mesma
resposta tornou o código público de um plugin de código aberto que o
Obsidian publica — `obsidianmd/obsidian-maps` — uma fonte admissível
([0009](0009-external-constraints.md), revisado em 2026-10-14), de que
depende a leitura das chaves da view no Contexto. Uma linha de Revisões
no [0053](0053-views-bases.md) responde à lista "Não construído" dele.

Resolvido em 2026-10-21 (0094, opção A, no questionário de decisões de 2026-10-20): o manifesto do plugin Maps pede o Obsidian 1.13.1 e a página de ajuda dele diz 1.10; **as duas versões são citadas e vale a do manifesto (1.13.1)**, por ser código publicado, e a ajuda pode estar desatualizada.

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Na V1
pela resposta do mantenedor de 2026-10-14 (`docs/roadmap.md`, Fase 4 —
V1, linha V.19). Para o mantenedor, cada uma com uma recomendação: o
motor (item 2), "Nova nota aqui" (item 6), a biblioteca de desenho (item
7), o que um mapa mostra sem fonte (item 8), o endereço de tiles da
própria base (item 9), imagens como mapas (item 11), `html()` (item 12),
editar uma base incorporada (item 13).
