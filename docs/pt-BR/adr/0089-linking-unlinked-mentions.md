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
- Revisões: 2026-10-20 — item 5, a sugestão enquanto se escreve,
  ampliada. O mantenedor, ao experimentá-la: *"tem que escrever o exato
  nome? parcial não lista?"*, depois *"nome completo é bem ruim"*, e,
  entre três jeitos que outros apps usam, *"eu gosto do 1 e do 2, o 1 pq a
  gente engloba pessoas já acostumadas com notion … converter para [[]]
  quando usa o @ eu diria que sim. e a opção 2 resolve também, aí se a
  pessoa apertar esc enquanto digita some a sugestão"*.
  `[DECIDIDO 2026-10-20]`: (a) **`@` abre a lista de notas**, a mesma
  lista e o mesmo casamento do completar do `[[`, parcial e atento a
  acentos; escolher uma nota escreve `[[Nome]]` (ou `[[Nome|digitado]]`,
  como no item 2) no lugar do `@` e do que veio depois — o arquivo
  continua no dialeto do Obsidian, onde `@` não significa nada.
  `[DECIDIDO 2026-10-21]` (0089.a, "Outra": *"A, mas caso o usuário aperte
  Esc pra dispensar a janela, ela naoa deve voltar ao usuário digitar mais
  caracteres"*): ligado por padrão (só abre
  quando pedido), **e depois que o Esc dispensou a lista do `@`, digitar
  mais caracteres da mesma palavra não a reabre** (um novo `@` sim); só
  no começo
  de uma palavra (`fulano@mail` nunca o abre); sem escolha, o `@` e o
  texto ficam como digitados; nunca em código, no frontmatter, num link,
  em fórmulas, em HTML ou numa tag.
  (b) **A sugestão enquanto se escreve lista nomes parciais**: das
  primeiras letras das palavras recém-digitadas, uma lista curta das notas
  (e apelidos) cujo nome começa por elas, que se estreita conforme se
  digita; setas escolhem, Tab ou Enter aceita, Esc dispensa naquela
  palavra. `[DECIDIDO 2026-10-21]` (0089.b, opção A: como construída,
  desligada por padrão): três letras no mínimo, e só para uma palavra que
  começa com maiúscula — nomes de lugares, pessoas e facções começam, as
  palavras comuns que tornaram necessária a regra do nome inteiro em geral
  não; no máximo cinco entradas; um nome inteiro digitado mantém o chip,
  que agora fica depois de um espaço ou pontuação até a próxima palavra
  começar. Continua desligada por padrão, o mesmo ajuste, as mesmas pastas
  e nomes ignorados.
  2026-10-20, mais tarde — as três letras e a inicial maiúscula viram
  ajustes da pessoa. O mantenedor, ao experimentar: *"você não adicionou
  número de caracteres pra acionar a busca por notas nesse parâmetro"*.
  `[DECIDIDO 2026-10-20]`: o número de letras antes de a lista aparecer é
  um ajuste ao lado da sugestão, padrão 3. `[DECIDIDO 2026-10-21]` (0089.c,
  opção A): de 1 a 10, padrão 3; e a regra da inicial maiúscula um
  interruptor ao lado, ligado por padrão. Uma
  palavra que começa com um algarismo conta como maiúscula — o mantenedor:
  *"você não considerou notas que começam com número, tipo 2026"*,
  `[DECIDIDO 2026-10-20]`.
  2026-10-21 — os detalhes `[PROPOSTO]` acima decididos pelas marcas do
  mantenedor no questionário de 2026-10-20 (0089.a a 0089.c), e mais uma
  pergunta respondida: **0089.a2** `[DECIDIDO 2026-10-21]`, opção A —
  `@Goblin` digitado inteiro continua listando "Goblin Rei" abaixo de
  "Goblin": o nome exato primeiro (nota 100), os que começam com o texto
  depois (80), os que apenas o contêm por último (40), o mesmo comportamento
  da lista do `[[`, para que um nome mais longo possa ser escolhido sem
  apagar nada.

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
   **Revisado em 2026-10-15 `[DECIDIDO 2026-10-15]`:** o mantenedor,
   respondendo *"Sim, na V1, desligada por padrão"*: a sugestão durante a
   digitação **está na V1**, **desligada por padrão**. Construída assim.
   Um ajuste em Ajustes › Editor, "Sugerir links enquanto escrevo"
   (desligado), na camada da pessoa, com duas listas ao lado, "Pastas
   ignoradas" e "Nomes ignorados" (por exemplo "Mesa"). Enquanto se
   escreve prosa — nunca em código, no cabeçalho de propriedades, num
   link, num embed, em fórmula, em HTML ou numa tag, a mesma regra de
   prosa que as menções seguem — quando as palavras recém-digitadas são um
   nome **inteiro** de nota ou apelido da pasta (maiúsculas ignoradas,
   acentos mantidos, NFC = NFD, três caracteres no mínimo, o nome mais
   longo vence, nomes de várias palavras incluídos), um pequeno aviso no
   estilo da conclusão de `[[` diz "Ligar a [[Nome]]". Ele nunca muda o
   texto sozinho: Tab ou Enter escreve `[[Nome]]`, ou `[[Nome|digitado]]`
   quando a caixa difere ou as palavras são um apelido, como "Vincular"
   faz (item 2); Esc, ou seguir digitando, dispensa, e um nome dispensado
   não é sugerido de novo no mesmo parágrafo. A nota que está sendo
   escrita nunca é sugerida. Os nomes da pasta vêm da lista em que a
   conclusão de `[[` se apoia, com os apelidos que as entradas agora
   carregam, num mapa montado uma vez por varredura da pasta, de modo que
   uma tecla custa poucas consultas com 10.000 notas. No toque o aviso é
   tocado; numa nota ao vivo, uma sugestão aceita é uma edição comum pela
   sala; um leitor não recebe nenhuma; um leitor de tela ouve "Sugestão de
   link: Nome, Tab para aceitar" sem interromper (polite).
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
  uma. (O item 5, como revisado em 2026-10-15, guarda um mapa dos nomes
  normalizados, montado uma vez por varredura da pasta; não é uma árvore
  de prefixos, e o benchmark da revisão diz quanto custa.)

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondendo a
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na V1
(`docs/roadmap.md`, Fase 4 — V1).

**Respondido durante a construção (2026-10-14, o mantenedor: "Sim, todas").** As perguntas que a construção levantou, respondidas como recomendado (*"Aceita todas as recomendações acima (P1–P5, M1–M6, I1–I7, D1–D11, G1–G4)?"*): M1 — uma nota que já linka o alvo continua listando as menções sem link dela; M2 — no máximo 200 notas candidatas por nome e 500 menções; M3 — numa célula de tabela o link é escrito com `\|`; M4 — o filtro de segredo completo vem com a [0087](0087-secret-blocks-hidden-from-readers.md); M5 — um acento escrito composto (NFC) ou decomposto (NFD) é um acento só ao casar as menções, como nomeia um arquivo só (a decisão de 2026-10-10), o link mantendo o nome da nota como o índice o tem (construído naquela noite); M6 — `verso_dialect::prose` ganha uma fixture, `fixtures/prose/what-is-prose`, um rascunho da IA para a aprovação do mantenedor (spec §4.9, construída naquela noite). M1 a M4 como construído.

**Revisado (2026-10-15).** O mantenedor, respondendo *"Sim, na V1, desligada por padrão"* à pergunta se a sugestão durante a digitação (item 5) pertence à V1: o item 5 está revisado acima — na V1, desligada por padrão. Nada mais do ADR muda.

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Na V1 pela palavra do mantenedor de
2026-10-14 (*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: caixa, acentos e aliases
(item 1), e a sugestão durante a digitação (item 5).
