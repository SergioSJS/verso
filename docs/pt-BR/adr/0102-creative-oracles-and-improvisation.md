# ADR 0102 — Oráculos e improviso: respostas graduadas, faíscas de ideias, um registro na nota

- Data: 2026-10-17; reescrita em 2026-10-20
- Fonte: o mantenedor, em 2026-10-17, priorizando o jogo solo e as
  ferramentas de escrita criativa sobre mapas de batalha: *"eu prefiro dar
  uma atenção maior a fichas e oráculos e ferramentas de improviso do que
  battle maps … serve até de ferramenta de escrita criativa, não
  necessariamente só pra RPG"*. O primeiro texto desta ADR e o seu código
  foram escritos em 2026-10-17 por outra IA (Gemini, no Antigravity) e
  marcados como Aceitos sem aceitação do mantenedor; uma revisão em
  2026-10-20 achou isso, e achou o código sobrescrevendo o callout errado e
  apagando as linhas da pessoa. As respostas do mantenedor de 2026-10-20
  estão citadas nos itens; este texto substitui o primeiro.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md) (revisada pelo item 4),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status no briefing: não presente.

## Contexto

Quem escreve e travou numa cena, um mestre improvisando, um jogador solo:
cada um faz uma pergunta fechada (*a passagem está guardada?*) ou precisa de
uma faísca (*o que o estranho quer?*). As ferramentas de papel respondem com
chances graduadas — sim ou não, com "e" e "mas" — e com pares de palavras. O
Verso tem as peças: um motor de dados com fonte criptográfica
([0088](0088-dice-and-random-tables.md)), callouts que o Obsidian lê, salas
onde várias pessoas editam uma nota ([0082](0082-live-co-editing-of-a-synced-folder.md)).

O que o primeiro texto errou, e este corrige: onde vai uma resposta
(substituía o callout inteiro, a narrativa da pessoa junto), como o alvo era
achado (uma correspondência solta pelo título), onde moram as chances (no
armazenamento do navegador de cada dispositivo, de modo que uma rolagem dava
"sim" num dispositivo e "não" em outro), e que uma rolagem numa sala era
sorteada por quem clicou.

## Decisão

Aceita em 2026-10-20 para os itens marcados `[DECIDIDO 2026-10-20]`, nas
palavras do mantenedor; `[PROPOSTO]` marca um detalhe deste texto que o
mantenedor ainda não leu.

1. **Respostas graduadas.** `[DECIDIDO 2026-10-20]` (a tabela como
   construída; o mantenedor sobre a revisão, *"adorei as sugestões e
   melhorias e correções"*). Uma pergunta toma uma de cinco chances; um d100
   é lido contra uma linha, cada linha somando 100:

   | Chance | Sim, e… | Sim | Sim, mas… | Não, mas… | Não | Não, e… |
   |---|:---:|:---:|:---:|:---:|:---:|:---:|
   | Quase certo | 18 | 54 | 18 | 2 | 6 | 2 |
   | Provável | 15 | 45 | 15 | 5 | 15 | 5 |
   | Equilibrado | 10 | 30 | 10 | 10 | 30 | 10 |
   | Improvável | 5 | 15 | 5 | 15 | 45 | 15 |
   | Quase impossível | 2 | 6 | 2 | 18 | 54 | 18 |

   As faces de 1 a 100 contra esta tabela são um teste.

2. **As chances e as palavras de faísca viajam com a pasta.**
   `[DECIDIDO 2026-10-20]`: *"deveria ser tudo igual, não? se eu
   compartilhar com alguém, é pra essa pessoa ver como eu"*. Uma tabela de
   chances editada e palavras de faísca editadas são chaves das
   configurações da pasta, `.verso/settings.json`
   ([0070](0070-what-travels-with-the-folder.md) item 2, que este item
   estende), escritas pelo `verso-fs` com a verificação de arquivo
   desatualizado; ausentes, valem as embutidas. Nada do oráculo vive no
   armazenamento do navegador de um dispositivo; o que uma construção
   anterior guardava lá passa para a pasta uma vez, na primeira alteração, e
   depois é removido `[PROPOSTO]`. Uma tabela que não soma 100, ou uma lista
   de palavras vazia, é recusada ao salvar e ignorada ao ler, com um aviso
   dizendo isso.

3. **Tabelas próprias são notas.** `[PROPOSTO]` — a resposta do item 2
   decide que são compartilhadas, não como; isto segue o item 3 da
   [0088](0088-dice-and-random-tables.md), já decidido: uma tabela para sortear é uma tabela ou lista Markdown com um
   `^id` numa nota. O oráculo lista as tabelas embutidas e toda tabela com
   `^id` da pasta `[PROPOSTO]`: pelo índice, por nome, com a nota de onde
   vem. Uma "importação" de uma lista JSON escreve uma nota nova que a guarda
   como uma lista com `^id`, mostrada antes de ser escrita.

4. **A resposta é escrita na nota, e as respostas se acumulam.**
   `[DECIDIDO 2026-10-20]`: *"qual o motivo de não poder gravar na nota? na
   minha cabeça não faz sentido"*, e *"acho que deveria ser acumulativo,
   exceto se a pergunta for reescrita"*. "Inserir na nota" é ação da própria
   pessoa (invariante 8). Ele escreve um callout `[!oracle]`, que o Obsidian
   desenha como um callout:
   ```markdown
   > [!oracle] A porta está trancada?
   > **Não, mas…** _(d100: 42, equilibrado)_
   ```
   - Com o cursor num callout `[!oracle]`, ou pelo botão do próprio
     callout: a **mesma** pergunta de novo **acrescenta** uma linha de
     resposta abaixo das anteriores; uma pergunta **reescrita** substitui as
     linhas que o oráculo escreveu naquele callout (pergunta, respostas,
     faíscas, sorteios de tabela). **Uma linha que a pessoa escreveu nunca é
     removida.**
   - Em outro lugar: um callout novo no cursor — depois do bloco que guarda
     o cursor quando este é uma citação, outro callout, um bloco de código,
     uma tabela ou o frontmatter, nunca dentro dele.
   - O callout é achado pelo seu lugar **e** pelo seu texto: o lugar é
     seguido por todas as alterações feitas enquanto o diálogo está aberto,
     e o texto é comparado antes de escrever. Um callout que se moveu ou
     mudou, uma nota somente leitura, uma nota com conflito pendente ou a
     visão de leitura recusam a escrita, e dizem por quê. Nunca uma
     correspondência por título.
   - Passa pelo editor (ou pela sala), nunca direto no disco
     ([0082](0082-live-co-editing-of-a-synced-folder.md)).

   Isto revisa o item 2 da [0088](0088-dice-and-random-tables.md) ("uma
   rolagem nunca é escrita no arquivo"), que continua valendo para
   `` `dice:` `` numa nota: uma rolagem ali é sorteada de novo a cada vez que
   é lida, e escrevê-la mudaria o arquivo a cada olhada.

5. **Numa sala, o servidor sorteia.** `[DECIDIDO 2026-10-20]` (*"9.
   sim"*): como nos dados ([0088](0088-dice-and-random-tables.md) item 4),
   uma rolagem pedida numa nota compartilhada num servidor é sorteada pelo
   servidor e vista pela sala; sozinho, ou offline, a janela sorteia.
   `[PROPOSTO]`: o mesmo comando leva perguntas ao oráculo, sorteios de
   faísca e sorteios de tabela.

6. **Faíscas.** Dois pares a pedido, Ação + Tema e Descritor + Foco, de
   listas de palavras originais em português e inglês, nunca copiadas de uma
   tabela comercial.

7. **Aleatoriedade**: a fonte criptográfica da plataforma, sem viés de
   módulo, injetável para testes ([0088](0088-dice-and-random-tables.md)
   item 7).

8. **A chave.** O oráculo é uma funcionalidade da
   [0103](0103-feature-presets-and-capability-flags.md): ligado por padrão;
   desligado, `[!oracle]` é um callout comum, sem botão, sem comando, sem
   item de `/`, e nada num arquivo muda.

9. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
   cada palavra em pt-BR e EN, em módulos de strings; o seletor de chances
   um grupo de rádio com setas; abas com papéis e setas; o resultado
   anunciado numa região viva educada; o foco de volta à nota depois de
   escrever.

## Consequências

- `app/ui/src/oracle/`: `engine.ts` (sorteios), `locate.ts` (achar um
  callout, planejar uma escrita que preserva as linhas da pessoa — puro,
  testado pelo próprio estado do CodeMirror), `track.ts` (seguir o callout
  enquanto o diálogo está aberto), `write.ts`, `dialog.ts`, `strings.ts`.
- Rust: `.verso/settings.json` ganha as chaves do oráculo (o
  `FolderSettings` do contrato, com os bindings regenerados); o comando de
  rolagem do servidor recebe os sorteios do oráculo.
- O modo de leitura identifica um callout pela sua posição entre os
  callouts de oráculo da nota, conferida contra o texto da nota; uma linha
  de origem exata vinda do renderizador seria melhor e é uma mudança de
  contrato deixada para depois.

## Alternativas descartadas

- **Substituir o callout inteiro numa resposta nova** (a primeira
  construção): apagava a narrativa da pessoa escrita dentro dele.
- **Chances por dispositivo** (a primeira construção): uma rolagem dava
  respostas diferentes em dispositivos e para pessoas diferentes.
- **Escrever direto no disco**: corre contra o editor e a sala
  ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Status

Aceita (2026-10-20) para os itens marcados `[DECIDIDO 2026-10-20]`, as
respostas do mantenedor à revisão do primeiro texto; os detalhes
`[PROPOSTO]` esperam a leitura do mantenedor.
