# ADR 0089 — Vincular menções sem link: um "Vincular" por menção e "Vincular todas", com um diff

- Data: 2026-10-14
- Fonte: o mantenedor, em 2026-10-14 às 11:36 UTC, enviando um plano de
  novos recursos rascunhado com outro assistente cujo segundo item é
  "auto-link": sugerir um link enquanto a pessoa digita o nome de uma
  nota, desligado por padrão, com ajustes. A leitura em sessão naquela
  manhã encontrou metade dele construída — o completar de `[[`, os
  backlinks, as menções sem link — e propôs primeiro um botão "Vincular"
  em cada menção sem link, com "Vincular todas", e a sugestão durante a
  digitação depois e desligada por padrão. A resposta do mantenedor
  naquela noite, sobre a lista inteira: *"VAI SER TUDO NA V1"*. Escrita
  por Opus 5.5; a ser lida pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0048](0048-file-operations-in-ui.md) (planos mostrados
  como diffs), [0012](0012-files-are-source-of-truth.md) (invariantes 8 e
  11), [0046](0046-index-location-lifecycle-tokenizer.md) (o tokenizador),
  [0082](0082-live-co-editing-of-a-synced-folder.md) (uma escrita numa
  nota ao vivo passa pela sala dela), [0087](0087-secret-blocks-hidden-from-readers.md)
  (o que um leitor não vê), [0076](0076-the-window-on-every-screen.md)
  (o que um lado não pode fazer não é mostrado), spec Q7, Q8 e Q12
  (nomes), [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente; ao ser aceita.

## Contexto

O que existe. O editor completa `[[` e `![[` com as notas da pasta e os
títulos delas (`app/ui/src/editor/complete.ts`). O painel lateral lista
os backlinks de uma nota e, abaixo deles, as suas **menções sem link**
(`app/ui/src/panel/panel.ts`, `mentions`): a janela busca no índice as
palavras do nome da nota (40 resultados no máximo), descarta as notas
que já linkam para ela e lista cada **nota** restante com um trecho. Ela
encontra notas, não ocorrências: não tem posição para uma menção, casa
as palavras do nome como a busca de texto completo casa (`unicode61`,
acentos removidos, sem stemming — [0046](0046-index-location-lifecycle-tokenizer.md)),
não o nome como frase, e não olha os `aliases` de uma nota. Nada
transforma uma menção em link a não ser digitá-lo à mão.

## Decisão

Proposta (2026-10-14). Aceita em 2026-10-14 (Status): cada `[ABERTO]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`.

1. **Menções são ocorrências.** Um novo comando do contrato responde as
   menções sem link de uma nota como ocorrências — a nota, a linha, a
   coluna e o texto como está escrito — encontradas pelo core a partir
   dos candidatos do índice e de uma varredura do texto deles. Uma
   menção é o nome da nota como frase, em limites de palavra, fora de
   código, frontmatter, comentários, um link ou embed existente e, para
   um leitor, fora de um bloco secreto
   ([0087](0087-secret-blocks-hidden-from-readers.md)). `[DECIDIDO 2026-10-14]`:
   caixa, acentos e aliases. Decidido: **caixa ignorada, acentos
   mantidos** ("Porto" encontra "porto", não "pôrto"), e cada um dos
   `aliases` da nota também um nome.
2. **"Vincular" em cada menção** troca aquela ocorrência por `[[Name]]`,
   ou `[[Name|text]]` quando o texto difere do nome na caixa ou é um
   alias, pelo contrato, com a verificação da invariante 11 sobre a
   revisão do arquivo; uma nota aberta numa sala é escrita pela sala,
   como as escritas do painel de propriedades são (linha 3.19 da Fase 3).
   Uma menção cujo texto mudou de lugar desde que foi listada é recusada
   e a lista é atualizada.
3. **"Vincular todas"** mostra o plano — cada arquivo e cada linha que
   mudaria — como um diff, como o plano de uma renomeação é mostrado
   ([0048](0048-file-operations-in-ui.md)), e grava na confirmação,
   arquivo por arquivo, cada um com a sua própria verificação; um arquivo
   mudado nesse meio-tempo é pulado e nomeado (invariantes 8 e 11).
4. **Quem pode vincular.** Os botões são mostrados a quem pode escrever a
   nota que menciona; um leitor vê a lista e nenhum botão (a regra da
   [0076](0076-the-window-on-every-screen.md)).
5. **Uma sugestão durante a digitação.** `[DECIDIDO 2026-10-14]`: se ela está na V1.
   Decidido: **não na V1**; quando construída, **desligada por
   padrão**, um ajuste em Ajustes › Editor com um comprimento mínimo e
   pastas a ignorar, como o plano de 2026-10-14 a descreveu — nomes que
   são palavras comuns ("Porto", "Mesa", "Ordem") a deixam ruidosa em
   português.
6. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
   cada menção é uma linha cujo botão se chama "Vincular *texto* em
   *nota*"; o diff do plano é alcançável pelo teclado e lido como uma
   lista de mudanças; pt-BR e inglês.

## Consequências

- O `verso-core` ganha o comando de ocorrências, com testes de limites,
  código, links, aliases e acentos; os tipos do contrato são gerados como
  sempre (invariante 3); o painel desenha ocorrências em vez de notas.
- A janela ganha os botões, o diálogo do plano e as strings; testes e2e
  para um link, "Vincular todas" com um arquivo mudado nesse meio-tempo,
  e a vista de um leitor; o vault de demonstração ensina isso
  ([0058](0058-demo-vault-as-tutorial.md)); o changelog ganha a sua
  linha.
- Um link feito aqui é desfeito numa aba aberta com ⌘Z; numa nota que não
  estava aberta, pelo histórico da [0091](0091-version-history.md).

## Alternativas descartadas

- **Uma árvore de prefixos em memória com os nomes da pasta** para a
  sugestão (levantada no plano de 2026-10-14 para pastas de 2.000
  notas): o índice já guarda os nomes, e 2.000 nomes não precisam de
  uma.

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondendo a
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na V1
(`docs/roadmap.md`, Fase 4 — V1).

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Na V1 pela palavra do mantenedor de
2026-10-14 (*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: caixa, acentos e aliases
(item 1), e a sugestão durante a digitação (item 5).
