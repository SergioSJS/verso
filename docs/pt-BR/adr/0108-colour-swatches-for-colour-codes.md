# ADR 0108 — Amostras de cor: um código de cor numa nota mostra a sua cor, e um clique a ajusta

- Data: 2026-10-22
- Origem: o mantenedor, em 2026-10-22: *"abri aqui um Markdown que tem
  vários códigos de hexadecimal de cor. E comparando com o que a gente tem
  no VS Code, a gente tem plugins que mostram a pré-visualização da cor. E
  se você clicar, você consegue até ajustar o valor. A gente conseguiria
  fazer isso dentro do Verso? Quando tiver código hexadecimal ou até mesmo
  RGB, a gente ter essa pré-visualização da cor"*. Escrita pelo Opus 5.5; a
  ser lida pelo outro modelo antes de aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionadas: [0012](0012-files-are-source-of-truth.md) (invariantes 7 e
  8), [0030](0030-base-dialect-obsidian-compatible.md) (regra 12: nenhuma
  extensão muda o sentido de uma construção existente),
  [0035](0035-cross-cutting-requirements.md),
  [0100](0100-visual-customization-wizard.md) (os campos de cor do
  construtor de temas), [0103](0103-feature-presets-and-capability-flags.md)
  (interruptores de recursos).

## Contexto

Notas sobre design, temas, mapas ou jogos guardam códigos de cor —
`#1d9e75`, `rgb(29 158 117)` — que quem lê só consegue imaginar. Editores
como o VS Code desenham um quadradinho da cor ao lado do código, e um clique
nele abre um seletor que reescreve o código.

No dialeto do Verso um `#` seguido de letras é uma tag, como no Obsidian:
`#fff` e `#bada55` num parágrafo são tags, não cores. Uma amostra não pode
mudar isso ([0030](0030-base-dialect-obsidian-compatible.md) regra 12): ela
é desenhada ao lado do texto e nunca muda o que o texto significa nem como é
indexado.

## Decisão

Status **Proposta**. Itens marcados `[OPEN]` são do mantenedor; itens
marcados `[PROPOSED]` são a recomendação do autor.

1. **Uma amostra ao lado de um código de cor.** `[PROPOSED]` Um quadradinho
   na cor, antes do código, desenhado só pela janela; o arquivo não muda
   (invariante 7). Tem uma borda fina para que uma cor parecida com a página
   apareça, e um xadrez por baixo de uma cor com transparência.

2. **Quais códigos.** `[DECIDED 2026-10-22]` Opção A — o mantenedor:
   *"Todos esses"*.
   - **A — Hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`/`rgba()`
     e `hsl()`/`hsla()`, na sintaxe com vírgulas e com espaços.**
     _(recomendado)_ — o que os decoradores de cor do VS Code leem.
   - **B — Só hex e `rgb()`**, como o pedido os nomeia.
   - Cores por nome (`red`, `teal`) ficam fora das duas: palavras comuns
     demais ganhariam amostra.

3. **Onde, numa nota.** `[DECIDED 2026-10-22]` Opção A, a amostra um
   quadradinho ao lado do código — o mantenedor: *"a amostra aparece num
   quadradinho ao lado de onde está escrito"*.
   - **A — Em código (código inline e blocos de código), em valores de
     propriedades, e em texto comum quando o código não é uma tag.** Um hex
     que o dialeto lê como tag (`#bada55` num parágrafo) continua tag e não
     ganha amostra; escrito como `` `#bada55` `` ganha. _(recomendado)_
   - **B — Em todo lugar, inclusive numa tag que parece cor** — a tag
     continua tag; a amostra fica ao lado.
   - **C — Só em código e valores de propriedades.**

4. **Um clique ajusta a cor.** `[PROPOSED]` No editor (Ao vivo e Fonte), um
   clique na amostra abre um seletor de cor; a cor escolhida é escrita de
   volta no mesmo formato do código (hex continua hex, com ou sem alfa como
   estava; `rgb()` continua `rgb()`), como uma edição comum da nota —
   desfeita com ⌘Z, salva como qualquer digitação. Na Leitura, a amostra
   mostra a cor e não edita. Teclado: a amostra é um botão com nome ("Cor
   #1d9e75 — ajustar"), Enter abre o seletor.

5. **Qual seletor.** `[DECIDED 2026-10-22]` Opção A, o campo de cor do
   construtor de temas, com a disposição do seletor de cor do VS Code — o
   mantenedor: *"pode ser do construtor, exemplo do VS Code"*, com uma
   captura do seletor do VS Code: um cabeçalho na cor mostrando o código, um
   quadrado de saturação/brilho, uma faixa de alfa e uma de matiz.
   - **A — O mesmo campo de cor do construtor de temas**
     ([0100](0100-visual-customization-wizard.md)), com campo hex e um
     controle de alfa quando o código tinha alfa. _(recomendado)_
   - **B — O seletor de cor do sistema** (`<input type="color">`): nativo,
     mas sem alfa e com cara diferente em cada sistema e no navegador.

6. **Um interruptor de recurso.** `[PROPOSED]` "Amostras de cor" / "Colour
   swatches" em Ajustes › Recursos, no grupo geral
   ([0103](0103-feature-presets-and-capability-flags.md)), ligado de início.

7. **Limites.** `[PROPOSED]` As amostras são desenhadas só na parte visível
   de uma nota longa (como as outras decorações do editor); uma nota com
   milhares de códigos continua rápida.

8. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)).
   `[PROPOSED]` A amostra não é o único portador da informação (o código
   continua legível); o seu nome acessível diz o código; pt-BR e inglês.

## Consequências

- A janela ganha uma decoração no editor, uma na leitura, um interruptor e
  um seletor; o núcleo e o índice não mudam.
- Um teste confere que uma nota com códigos de cor fica byte a byte igual
  depois de aberta e lida, e que uma cor escolhida escreve só o código de
  onde veio.
- O cofre de demonstração ganha uma nota curta que mostra amostras; o "Tour
  do Verso" um cartão ([0058](0058-demo-vault-as-tutorial.md)).

## Alternativas descartadas

Oferecidas ao mantenedor em 2026-10-22 e não escolhidas: só hex e `rgb()`
(item 2); amostra também ao lado de uma tag que parece cor, ou só em código
e valores de propriedades (item 3); o seletor de cor do sistema (item 5).

## Situação

Proposta (2026-10-22). Itens 2, 3 e 5 decididos pelo mantenedor no mesmo
dia; os itens marcados `[PROPOSED]` continuam do autor até a aceitação. Em
construção; espera uma leitura do outro modelo.
