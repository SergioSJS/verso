# Os ids de bloco do Obsidian, observados em 2026-10-07

- Data: 2026-10-07
- Observado com: Obsidian 1.14.4 (instalador 1.11.5), macOS, pelo CLI dele
- Admissível pelo [ADR 0009](../adr/0009-external-constraints.md): uso
  normal do app e só a API pública (`MetadataCache.getCache`, declarada em
  `obsidian.d.ts`); nada do binário.
- Por quê: a parte aberta da Q3 da [spec do dialeto](../spec/dialect.md) — o
  que um `^id` nomeia dentro de um item de lista ou de uma citação, e sozinho
  sem nada antes — antes de as fixtures `block/in-list`, `block/in-quote` e
  `block/alone-top` serem rascunhadas e aprovadas. Veja
  [obsidian-cli.md](obsidian-cli.md) para como o CLI roda.

## 1. Como

Vinte e oito notas escritas numa pasta descartável do cofre `Sandbox`
(`verso-fixtures/`, apagada depois), e então, para cada uma:

```
obsidian vault=Sandbox eval code='JSON.stringify(app.metadataCache.getCache("verso-fixtures/<nome>.md"))'
```

Da resposta, três campos são lidos: `blocks` (id → posição), `sections`
(tipo, posição, `id` quando há um preso a ela) e `listItems` (posição, `id`,
`parent`). Linhas em base 0, início e fim inclusivos. `\n` abaixo é uma
quebra de linha, `\t` uma tabulação.

## 2. O que foi observado

| Nota | Entrada | `blocks` | `sections` / `listItems` |
|---|---|---|---|
| `q3-loose-item` | `- um ^item\n\n  - filho\n- dois` | item: 0..0 | listItems 0..0 #item, 2..2 (parent 0), 3..3 |
| `q3-alone-in-quote` | `> a\n>\n> ^q` | q: 0..2 | blockquote 0..2 #q |
| `q3-alone-under-item` | `- um\n\n  ^x\n\n  - filho` | x: 0..2 | listItems 0..2 #x, 4..4 (parent 0) |
| `q3-non-id-word` | `Texto.\n\n^foo.bar\n\n^ok` | ok: 2..2 | paragraph 0..0, paragraph 2..2 #ok |
| `q3-loose-no-sublist` | `- a ^x\n\n  texto\n- b` | x: 0..2 | listItems 0..2 #x, 3..3 |
| `q3-code-first-in-item` | `- ```\n  code\n  ```\n\n  ^c\n\n  - child\n- next` | c: 0..4 | listItems 0..4 #c, 6..6 (parent 0), 7..7 |
| `q3-heading-in-item` | `- ## H ^h\n  - child\n- next` | h: 0..0 | listItems 0..0 #h, 1..1 (parent 0), 2..2 |
| `q3-tab-nested` | `- pai\n\t- filho ^tab\n\t\t- neto\n- tio` | tab: 1..1 | listItems 0..0, 1..1 #tab (parent 0), 2..2 (parent 1), 3..3 |
| `q3-alone-first` | `^solto\n\nTexto.` | (none) | paragraph 2..2 only; the `^solto` line is no section |
| `q3-nested-list-from-below` | `- a\n\n  - b\n  - c\n\n  ^l` | l: 0..5 | listItems 0..5 #l, 2..2, 3..3 |
| `q3b-quote-end` | `> a ^q` | q: 0..0 | blockquote 0..0 #q |
| `q3b-quote-multi` | `> a\n>\n> b ^q\n>\n> c` | q: 0..4 | blockquote 0..4 #q |
| `q3b-callout` | `> [!note] T\n> texto ^c` | c: 0..1 | callout 0..1 #c |
| `q3b-nested-quote` | `> > a ^q` | q: 0..0 | blockquote 0..0 #q |
| `q3b-list-in-quote` | `> - um ^i\n> - dois` | i: 0..1 | blockquote 0..1 #i; listItems 0..0, 1..1 without id |
| `q3b-alone-in-list-in-quote` | `> - um\n>\n>   ^i` | i: 0..2 | blockquote 0..2 #i |
| `q3b-item-second-para` | `- um\n\n  segundo ^p\n\n  - filho` | p: 0..2 | listItems 0..2 #p, 4..4 (parent 0) |
| `q3b-item-second-alone` | `- um ^u\n- dois\n\n  ^v` | u: 0..0, v: 1..3 | listItems 0..0 #u, 1..3 #v |
| `q3b-table-in-item` | `- um\n\n  | a |\n  | - |\n  | 1 |\n\n  ^t` | t: 0..6 | listItems 0..6 #t |
| `q3b-alone-after-heading` | `# T\n\n^h` | h: 0..0 | heading 0..0 #h |
| `q3b-alone-after-rule` | `Texto.\n\n---\n\n^r` | r: 2..2 | paragraph 0..0, thematicBreak 2..2 #r |
| `q3b-two-alone` | `Texto.\n\n^a\n\n^b` | b: 0..0 (no `a`) | paragraph 0..0 #b |
| `q3b-hard-break` | `Texto  \n^id` | id: 0..1 | paragraph 0..1 #id |
| `q3b-soft-break` | `Texto\n^id` | id: 0..1 | paragraph 0..1 #id |
| `q3c-quote-in-item` | `- > q ^x\n- dois` | x: 0..0 | listItems 0..0 #x, 1..1 |
| `q3c-alone-after-list` | `- a\n- b\n\n^lst` | lst: 0..1 | list 0..1 #lst |
| `q3c-text-after-sublist` | `- um\n\n  - filho ^f\n\n  texto ^t\n- dois` | t: 0..4, f: 2..2 | listItems 0..4 #t, 2..2 #f (parent 0), 5..5 |
| `q3c-list-in-quote-alone-after` | `> - a\n> - b\n\n^q` | q: 0..1 | blockquote 0..1 #q |

## 3. A regra que a observação mostra

- O bloco que um `^id` nomeia é a **seção de nível superior** em que a
  linha dele está: uma citação ou um callout inteiros, seja o que for que
  nela segure o id (uma citação aninhada, uma lista dentro da citação, um id
  sozinho depois de uma linha citada em branco).
- Em lista, é o **item de lista mais interno**: o conteúdo próprio dele no
  cache (os parágrafos posteriores de um item solto, uma tabela, um bloco de
  código, um id sozinho sob uma lista aninhada pertencem todos a ele), os
  itens aninhados listados à parte como filhos. A Q21 da spec (decidida) põe
  os itens aninhados no bloco, então as `lines` do Verso vão até eles onde a
  posição do Obsidian para no conteúdo próprio do item.
- Sozinho no nível superior depois de uma linha em branco, a **seção de
  antes**: um heading, uma lista, uma linha horizontal, um parágrafo que não
  é id (`^foo.bar`). A linha do `^id` não é seção própria.
- Sozinho **sem nada antes**, nenhum bloco: a linha não é seção.
- Uma quebra dura ou suave antes do id o mantém no parágrafo.
- Dois ids sozinhos em sequência: o cache guarda só o último
  (`q3b-two-alone`). O que o Verso faz com o primeiro é o `[ABERTO]` que
  resta na Q3.

Não observado, e registrado como aberto ou como o que o parser faz na spec:
um `^id` sozinho logo depois do frontmatter, depois de uma definição de nota
de rodapé, e como o modo de leitura desenha um `^id` que não nomeia nada.
