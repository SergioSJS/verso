# ADR 0085 — Prévia ao passar o ponteiro: a nota que um link nomeia, mostrada onde o ponteiro para

- Data: 2026-10-14
- Fonte: o mantenedor, em 2026-10-14 às 11:36 UTC, mandando um plano de
  funcionalidades novas rascunhado com outro assistente e pedindo uma
  leitura crítica e um roadmap: quando o trabalho pendente fechar, *"a
  gente vai conseguir fazer uma V1 bem sólida"*. A leitura desse plano,
  em sessão na mesma manhã, achou que uma prévia ao passar o ponteiro não
  existe em lugar nenhum do Verso e que os mapas da
  [0090](0090-maps-on-the-board.md) dependem dela, e a pôs em primeiro. A
  resposta do mantenedor naquela noite, sobre a lista inteira: *"VAI SER
  TUDO NA V1"*. Escrita por Opus 5.5; a ser lida pelo outro modelo antes
  de ser aceita ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0003](0003-primitives-not-workarounds.md) (o que precisa
  de um plugin é uma primitiva), [0076](0076-the-window-on-every-screen.md)
  (toque, o cartão do link), [0081](0081-sharing-between-people-on-one-universo.md)
  (um link que sai de um compartilhamento), [0087](0087-secret-blocks-hidden-from-readers.md)
  (uma prévia é uma leitura), [0090](0090-maps-on-the-board.md) (a prévia
  de um alfinete), [0035](0035-cross-cutting-requirements.md) (os dois
  idiomas, acessibilidade), [0009](0009-external-constraints.md) (o que
  se pode aprender do Obsidian).
- Status no briefing: ausente; ao ser aceita.

## Contexto

O que existe. Um wikilink é seguido com ⌘ ou Ctrl e um clique no modo
Editar (`app/ui/src/live.ts`) e com um clique na visão de leitura; numa
tela de toque, um toque mostra um cartãozinho com "Abrir" e "Editar link"
(`app/ui/src/editor/linkCard.ts`, [0076](0076-the-window-on-every-screen.md)
item 4). Um embed renderiza a nota que nomeia, ou o bloco que um `^id`
nomeia, a partir do HTML que o core renderiza (`app/ui/src/blockEmbed.ts`).
O cartão de um board mostra o texto de uma nota
(`app/ui/src/board/cards.tsx`). O painel de backlinks lista notas pelo
nome com um trecho (`app/ui/src/panel/panel.ts`).

O que não existe: ver o que um link nomeia sem sair da nota. Nenhum
pop-up mostra uma nota ao passar o ponteiro em lugar nenhum da janela —
nem sobre um link, um backlink, um nó do grafo ou um cartão do board. A
ajuda pública do Obsidian descreve um "Page preview" nativo que faz isso;
quem vem dele espera isso, e um mapa cujos alfinetes abrem o resumo de
uma nota ao passar o ponteiro ([0090](0090-maps-on-the-board.md)) precisa
disso antes.

## Decisão

Proposta (2026-10-14). Cada `[ABERTO]` traz uma recomendação; o
mantenedor decide.

1. **Uma prévia é a nota que um link nomeia, só leitura, num cartão ao
   lado do ponteiro.** Ela renderiza como um embed renderiza — o mesmo
   HTML do core, o título ou o `^id` que o link nomeia rolado até ficar à
   vista, o título da nota e o caminho dela em cima — e nunca é um editor.
   Um clique dentro do cartão abre a nota como seguir o link abriria; nada
   mais nele escreve.
2. **Onde.** Sobre um wikilink e um link Markdown para uma nota da pasta,
   na visão de leitura e no Live Preview; sobre uma linha dos backlinks,
   dos links de saída e das menções sem link; sobre um nó do grafo; sobre
   um cartão ou um alfinete de um board que nomeia uma nota
   ([0090](0090-maps-on-the-board.md)). Não sobre a árvore de arquivos na
   primeira versão. Um link para uma imagem ou um PDF mostra a prévia do
   arquivo como o embed dele mostra; um link para a web não mostra prévia
   nenhuma (nenhuma requisição sai por um passar de ponteiro,
   [0050](0050-outbound-network-access.md)).
3. **No modo Editar, com o modificador.** `[ABERTO]`: se o modo Editar
   mostra a prévia ao simplesmente passar o ponteiro ou só com ⌘/Ctrl
   pressionado. Recomendado: **com ⌘/Ctrl**, o modificador que já segue um
   link ali — um ponteiro parado sobre o texto sendo escrito não deveria
   abrir cartões; a visão de leitura e os painéis mostram a prévia ao
   simplesmente passar o ponteiro. Antes de construir, o que o Obsidian
   faz é conferido na ajuda pública dele ou observado de fora, nunca no
   código dele ([0009](0009-external-constraints.md)).
4. **Tempo e fechamento.** O cartão abre depois de o ponteiro parar cerca
   de meio segundo e fecha quando ele sai tanto do link quanto do cartão;
   o ponteiro pode entrar no cartão para rolá-lo. Um cartão de cada vez.
   `[ABERTO]`: uma prévia dentro de uma prévia. Recomendado: **não na
   primeira versão** — um link dentro de um cartão é seguido com um
   clique.
5. **Toque.** Não há passar de ponteiro: o cartão do link da
   [0076](0076-the-window-on-every-screen.md) item 4 ganha a prévia acima
   de "Abrir" e "Editar link"; no board e no grafo, um toque longo a
   mostra.
6. **Teclado e leitores de tela** ([0035](0035-cross-cutting-requirements.md)).
   Um comando "Mostrar a prévia do link sob o cursor", com uma tecla
   padrão `[ABERTO]` (recomendado: nenhuma, atribuível, como o item da
   revisão de acessibilidade sobre seguir um link a partir do editor
   deixa as teclas padrão para o mantenedor, `docs/review/accessibility.md`
   §8); o cartão recebe o foco quando aberto assim, é um diálogo com
   rótulo, e Esc o fecha e devolve o foco. Aberto ao passar o ponteiro,
   ele não recebe o foco.
7. **Uma prévia é uma leitura como qualquer outra.** Ela passa pela
   leitura da nota do contrato, então um compartilhamento mostra "fora do
   que foi compartilhado com você" para um link que sai dele, como o
   próprio link mostra ([0081](0081-sharing-between-people-on-one-universo.md)),
   e um leitor vê a projeção que a [0087](0087-secret-blocks-hidden-from-readers.md)
   serve. Nada de uma prévia fica em cache além da revisão da nota.
8. **Um ajuste** em Ajustes › Editor desliga as prévias ao passar o
   ponteiro; ligadas por padrão.

## Consequências

- A janela ganha o cartão (um componente para a nota, os painéis, o
  grafo e o board), o comando, o ajuste e os textos em pt-BR e inglês;
  nenhum comando novo do contrato — o cartão usa a leitura que o embed
  usa.
- O harness ganha testes de ponta a ponta para o passar de ponteiro na
  visão de leitura, o modificador no modo Editar, o cartão de toque e o
  Esc devolvendo o foco; o vault de demonstração o ensina
  ([0058](0058-demo-vault-as-tutorial.md)); o changelog ganha a sua
  linha.
- Os alfinetes da [0090](0090-maps-on-the-board.md) dependem da parte do
  board do item 2.

## Alternativas descartadas

Nenhuma registrada.

## Status

**Proposta (2026-10-14).** Na V1 pela palavra do mantenedor de 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: o modo Editar com o modificador
(item 3), nenhuma prévia dentro de uma prévia (item 4), e a tecla padrão
do comando (item 6).
