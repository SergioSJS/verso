# ADR 0099 — Statblocks: um cartão a partir de um bloco `statblock`, layouts como arquivos da pasta, rolagens por sistema

- Data: 2026-10-17; reescrita em 2026-10-20
- Fonte: o mantenedor, em 2026-10-17: *"depois disso seriam as fichas, o
  stat blocks, os visuais markdown"*; em 2026-10-18, sobre a primeira
  construção: *"veja como o plugin do obsidian resolve e replique … geralmente
  a pessoa vai usar para registrar inimigos e desafios, e dependendo do
  sistema a ficha de desafio é diferente da ficha de personagem,
  PESQUISE!"*, e uma lista de sistemas. O primeiro texto e o primeiro
  código, escritos por outra IA (Gemini, no Antigravity), inventaram os
  atributos de um sistema, entregaram um editor de layouts que o mantenedor
  chamou de *"péssimo"*, guardaram os layouts no armazenamento do navegador
  de cada dispositivo e foram marcados como Aceitos sem aceitação. Em
  2026-10-20 o mantenedor respondeu à revisão dele (citado nos itens) e
  aceitou o desenho que se seguiu: *"adorei as sugestões e melhorias e
  correções. pode definir uma sequencia e atuar em tudo"*. Este texto
  substitui o primeiro. A pesquisa por trás dele: o código público do plugin
  Fantasy Statblocks (MIT, Jeremy Valentine; estudado em f248f4af, v4.10.3),
  e as regras, SRDs e licenças publicados de cerca de 35 sistemas, cada
  campo com a sua fonte, em `docs/reference/statblock-sources.md`.
- Revisões: 2026-10-21 — o mantenedor marcou as opções do questionário de
  decisões de 2026-10-20 (respondido em 2026-10-21): os detalhes
  `[PROPOSTO]` dos itens 1, 5 e 6 ficam decididos como propostos (0099.1,
  0099.5, 0099.6a a c), e as palavras de resultado em inglês dos perfis de
  dados (item 4) estão aprovadas. Status Aceita. 2026-10-21, revisão do lote
  — duas entradas de "Alternativas descartadas" ("Campos de layout
  executados como JavaScript" e "Um cartão disparado por propriedades
  comuns") foram retiradas: nenhum documento ou resposta registra que
  alguém as considerou como alternativas ao desenho (regra zero do
  CLAUDE.md, item 4). A decisão em si, que nenhum campo de um layout é
  executado como código e que um cartão vem só de um bloco `statblock`, não
  muda. 2026-10-21, mais tarde — o mantenedor respondeu S.3a a S.3d e A.1 da
  lista de decisões de 2026-10-21 (itens 1 e 6 abaixo) e, na A.1, as duas
  entradas marcadas "(a primeira construção)" também saem de "Alternativas
  descartadas" (ninguém as considerou; regra zero, item 4). 2026-10-21,
  revisão do lote da tarde — (a) a construção manteve uma linha de aviso
  apontando para a página de Créditos em cada ficha com licença, o que a
  S.3b = B (item 6) não diz: registrado abaixo como escolha de quem construiu,
  à espera do mantenedor (pergunta S.3b-bis da lista de decisões da tarde),
  a decisão do item 6 em si inalterada; (b) os nomes dos campos em pt-BR dos
  layouts de World of Darkness e de Cyberpunk RED foram escolhidos pela
  construção a partir de termos comuns da comunidade, provisórios (S.3c,
  "traduzir agora, corrigir depois"); (c) "Alternativas descartadas" diz
  "Nenhuma registrada." (regra zero, item 4).
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0009](0009-external-constraints.md),
  [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0083](0083-security-hardening-of-universo.md),
  [0088](0088-dice-and-random-tables.md) (item 5 revisado pelo item 4),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status no briefing: não presente.

## Contexto

Um mestre de jogo anota os inimigos e desafios de uma sessão; um criador de
mundos, as criaturas de um mundo. No Obsidian, o plugin da comunidade
Fantasy Statblocks desenha um bloco ```` ```statblock ```` de YAML como o
statblock de um livro, por meio de um layout: uma lista de blocos (um
título, propriedades, uma tabela de atributos, características…) que um
editor de configurações monta. Seus pontos fracos, segundo as próprias
issues: a prévia do layout é uma aba separada, arrastar treme, os layouts
vivem nos dados privados do plugin (de um dispositivo, não do cofre), e dez
campos de um layout são JavaScript executado com `new Function` — código de
um arquivo que outra pessoa compartilhou.

Os sistemas diferem, e na maioria deles um adversário não é um personagem:
um adversário de Daggerheart tem dificuldade, limiares e características;
um desafio de Fractal é uma lista de obstáculos, cada um dos quais pode ser
outro desafio. As licenças diferem ainda mais: algumas são abertas (CC BY,
ORC, OGL), algumas permitem obras de fãs mas não aplicativos, algumas não
permitem nada.

## Decisão

Aceita em 2026-10-20 para o desenho proposto ao mantenedor naquele dia;
`[DECIDIDO 2026-10-20]` cita as respostas dele; `[DECIDIDO 2026-10-21]` é a
opção que ele marcou no questionário de decisões de 2026-10-20 (a opção
escrita no item, sem palavras próprias dele); nada resta `[PROPOSTO]`.

1. **Um cartão vem de um bloco ```` ```statblock ````, e só dele.** O bloco
   guarda YAML. Suas chaves são os nomes de chave do Fantasy Statblocks
   (`name`, `size`, `type`, `ac`, `hp`, `stats`, `saves`, `skills`,
   `traits`, `actions`, `reactions`, `legendary_actions`, `cr`, `image`,
   `layout`…), de modo que um bloco escrito para o plugin é desenhado no
   Verso e o contrário também ([0030](0030-base-dialect-obsidian-compatible.md)).
   `layout:` nomeia um layout por id ou por nome, exatamente, ignorando
   maiúsculas e acentos; um desconhecido desenha o layout padrão com um
   "layout não encontrado" visível. Nenhum cartão é adivinhado a partir de
   propriedades comuns (`hp:` numa nota sobre um computador).
   `[DECIDIDO 2026-10-21]` (0099.1, opção A): `monster: Goblin` e
   `extends: [[Goblin]]` pegam o statblock da nota assim
   nomeada e sobrepõem as chaves dele — o bestiário do plugin, feito de
   notas. `[DECIDIDO 2026-10-21]` (S.3d, opção A): quando um `extends:` lista
   várias bases e duas discordam, **ganha a primeira listada**, como no plugin
   Fantasy Statblocks, de modo que um bloco copiado do Obsidian dá o mesmo
   resultado.

2. **Layouts são arquivos da pasta.** `[DECIDIDO 2026-10-20]`: *"deveria
   ser tudo igual, não? se eu compartilhar com alguém, é pra essa pessoa
   ver como eu"*. Um layout que alguém fez ou alterou é
   `.verso/layouts/<id>.json` na pasta ([0070](0070-what-travels-with-the-folder.md),
   estendida): ele sincroniza, todos que abrem a pasta veem o mesmo cartão,
   e é escrito pelo `verso-fs` com a verificação de arquivo desatualizado,
   por comandos do contrato que listam, leem, escrevem e removem layouts e
   nada mais sob `.verso/`. Os layouts embutidos vêm com o aplicativo e não
   podem ser alterados; "duplicar" copia um para a pasta. Nada de um layout
   vive no armazenamento do navegador de um dispositivo; o que uma
   construção anterior guardava lá passa para a pasta uma vez.

3. **O modelo de layout é o do plugin, sem código.** Blocos: título,
   subtítulo, propriedade, tabela (uma tabela de atributos, com o seu
   modificador vindo de uma lista fechada — `floor((x-10)/2)`, nenhum — ou
   de uma expressão do avaliador restrito do Rolai, que não tem `eval`),
   salvaguardas, características, texto, imagem, grupo, em linha, recolher,
   condicional (um teste estruturado: uma chave existe, é igual, é maior
   que), **marcador** (tracker) e **rolagem** (itens 4–5). Cada bloco nomeia
   as suas chaves, um rótulo por idioma, se some quando vazio e um valor
   reserva. **Nenhum campo de um layout é jamais executado como código**:
   cada um dos dez campos JavaScript do plugin tem um substituto declarativo
   ou nenhum. A aparência de um layout é uma lista curta de tokens (cores,
   uma das fontes do aplicativo), cada um conferido contra o seu tipo, nunca
   CSS bruto ([0083](0083-security-hardening-of-universo.md)). Um JSON de
   layout do Fantasy Statblocks é importado, com os campos de código
   descartados e listados à pessoa; o Verso exporta o seu próprio JSON.

4. **As rolagens seguem o sistema, pelos perfis do Rolai.** O mantenedor:
   *"tudo relacionado a rolagem dá pra copiar numa boa do rolai, app meu
   aberto"*. O item 5 da [0088](0088-dice-and-random-tables.md), que copiou o
   parser e o rolador do Rolai, é revisado: os perfis de sistema dele e o
   avaliador restrito de expressões são copiados também, com o aviso MIT —
   21 perfis: d20, d100, rolar abaixo, pool de d6, Year Zero, Forged in the
   Dark, PbtA 2d6 e 2d10, Ironsworn, Fate, World of Darkness 5, Fractal,
   Trophy e outros. Um layout nomeia o seu perfil. Um valor com bônus ou uma
   expressão de dados (`+5`, `2d6+3`) vira um botão pelas regras de dados do
   layout; um bloco de **rolagem** executa o perfil com entradas tiradas da
   ficha (uma rolagem de risco do Fractal pergunta quantos fatos se
   aplicam). A resposta se lê do jeito que o sistema a lê — o dado mais
   alto, sucessos contados, uma faixa de 2d6 — e é mostrada, não escrita
   ([0088](0088-dice-and-random-tables.md) item 2); numa sala o servidor
   sorteia e a sala vê (item 4 de lá). `[DECIDIDO 2026-10-21]` (S.1, opção
   A): as palavras de resultado em inglês dos perfis Fractal, Trophy e
   Infaernum em `app/ui/src/dice/profileWords.ts` estão aprovadas como
   construídas (Success / Failure, Success with Momentum ×2 a ×4, Rupture
   ×1 a ×4, Miracle, Misfortune, Feat e Glimpse ×1 a ×3, Yes / No, "Ruin
   rises", Number of Facts / Dark dice / Your Ruin, e as listas de "ideias"
   do Infaernum); traduções literais, trocadas quando os autores publicarem
   os termos em inglês.

5. **Os marcadores escrevem na nota.** `[DECIDIDO 2026-10-20]`: *"13.
   deveria gravar"*. Um bloco **marcador** mostra um valor atual contra um
   máximo — pontos de vida, as reservas do Fractal, estresse, um relógio,
   Esperança — como caixas ou um número. Um clique é ação da pessoa
   (invariante 8): substitui aquele único valor no YAML do bloco, pelo
   editor ou pela sala, nunca o bloco inteiro, nunca direto no disco.
   `[DECIDIDO 2026-10-21]` (0099.5, opção A): numa sala, depois que dois
   cliques se fundem, um valor que já não se lê como um número dentro dos
   seus limites mostra uma insígnia e um reparo de um clique, nunca um
   palpite silencioso (nem um ajuste silencioso ao limite).

6. **Quais layouts vêm embutidos.** `[DECIDIDO 2026-10-20]`, sobre a
   recomendação depois da pesquisa de licenças: embutidos só onde as regras
   são abertas, mais layouts genéricos nomeados pelas suas mecânicas; o resto
   importado, ou embutido quando a editora permitir. `[DECIDIDO 2026-10-21]`
   (0099.6a, opção A: a lista aprovada como está, treze famílias de
   `credits.ts`): a lista abaixo, montada depois dessa resposta. Embutidos, cada campo com a
   sua fonte em `docs/reference/statblock-sources.md`, a linha de cada
   licença na página de Créditos:
   - sistemas cujas regras são abertas: o SRD de D&D 5e (5.1 e 5.2.1, CC BY
     4.0), Pathfinder 2e (ORC), Starfinder 2e (ORC; só a criatura, até a
     sua ficha de personagem ser lida de uma fonte), 13th Age (OGL 1.0a), Dungeon World
     e Blades in the Dark (CC BY 3.0), Fate Condensado e Acelerado (CC BY
     3.0), Mausritter (a sua Third Party Licence; a linha que ela pede nomeia
     quem faz o Verso — o mantenedor, 2026-10-20: *"coloque Sérgio Sousa
     (Meio-Orc)"*), as partes abertas de
     Ironsworn/Starforged (CC BY
     4.0), Cairn e Old Dragon 2e (CC BY-SA 4.0: só nomes de campos, nenhum
     texto);
   - **Fractal** (Igor Téuri e Walter Licínio, CC BY 4.0 pelo texto do seu
     SRD, cujo selo mostra BY-SA — a confirmar com os autores; só nomes de
     campos, em qualquer caso; `[DECIDIDO 2026-10-21]` (0099.6b, opção A)
     continua embutido, só nomes de campos, com o crédito "CC BY 4.0 conforme
     o texto do SRD", e muda se a resposta dos autores mudar): um personagem (reservas, até doze fatos que quebram e se
     consertam, XP) e um **desafio** cujos obstáculos podem ser, cada um, um
     `[[link]]` para a nota de outro desafio — uma campanha, os seus arcos e
     os seus episódios como uma árvore que o grafo já desenha;
   - layouts genéricos nomeados pelas suas mecânicas, sem o nome de nenhum
     sistema: criatura d20, percentil, jogadas 2d6, pool de d6, pool de
     dados por dificuldade, escada e aspectos; as jogadas 2d6 servem à
     família Powered by the Apocalypse e o pool de d6 à família Year Zero.
   Para o resto — Daggerheart, Tormenta20, Call of Cthulhu, Savage Worlds,
   os jogos da Free League, Mothership e outros — um layout é um arquivo que a
   pessoa importa, ou que vem embutido quando a editora permitir por
   escrito. `[DECIDIDO 2026-10-21]` (0099.6c, opção A): os jogos da 5ª edição
   de World of Darkness sob o Dark Pack da Paradox, e um layout em branco
   de Cyberpunk RED sob a política de homebrew da R. Talsorian, cada um
   embutido com o seu aviso na página de Créditos. Todo
   layout embutido tem uma ficha de personagem e, onde o sistema tem, uma
   ficha de adversário separada.

   `[DECIDIDO 2026-10-21]` — os seis layouts como construídos (Vampiro,
   personagem e antagonista; Lobisomem e Caçador, personagem; Cyberpunk RED em
   branco, personagem e NPC; só nomes de campos) e quatro detalhes,
   respondendo S.3a a S.3c:
   - **O logo do Dark Pack** (S.3a, "Outra"): *"Como no A mas vc faz tudo"*
     — a opção A era o mantenedor baixar o logo oficial do kit Dark Pack da
     Paradox; ele pede que **o agente faça tudo: baixe o logo oficial do Dark
     Pack e o ponha na página de Créditos.** O logo é da Paradox, tirado do
     kit da própria editora, nem desenhado nem alterado.
   - **Onde fica o aviso de licença** (S.3b, opção B): **só na página de
     Créditos**, não no rodapé de cada ficha (a ficha fica mais limpa). O
     aviso da política do Cyberpunk RED pede para ser mostrado "em um local
     facilmente visível, como o fim do documento"
     (`docs/reference/statblock-sources.md`, 3.28), e o acordo da Paradox pede
     o logo "em algum lugar do seu material"; o mantenedor escolheu a página
     de Créditos para os dois.
     *Desvio, 2026-10-21 (revisão do lote da tarde), escolha de quem
     construiu, à espera do mantenedor (pergunta S.3b-bis):* a construção
     manteve uma linha de aviso apontando para a página de Créditos em cada
     ficha com licença (os seis layouts de World of Darkness e Cyberpunk
     RED), porque o acordo do Dark Pack pede um aviso "em algum lugar do seu
     material" e a política da R. Talsorian pede o seu aviso "em um local
     facilmente visível". A resposta do mantenedor (S.3b = B) não mandou
     acrescentá-la e ela não é atribuída a ele; os avisos completos e o logo
     ficam só na página de Créditos. Manter a linha ou tirá-la: decisão dele.
   - **Nomes dos campos** (S.3c, "Outra"): *"Como em B, depois a gente
     corrige"* — os nomes dos campos dos layouts de World of Darkness e de
     Cyberpunk RED são **traduzidos para pt-BR agora**, e corrigidos depois
     contra os livros brasileiros (foram construídos em inglês, porque os
     nomes oficiais das edições brasileiras não foram verificados). O risco de
     não bater com os livros é aceito. *Registrado em 2026-10-21 (revisão do
     lote da tarde):* os nomes em pt-BR em si foram escolhidos pela construção
     a partir de termos comuns da comunidade brasileira de RPG, não dos
     livros: provisórios, a corrigir como ele disse.

7. **Edição no lugar.** No Live Preview o YAML aparece enquanto o cursor
   está no bloco; o cartão tem um botão para a sua fonte e a fonte um de
   volta, nas duas visões. Um YAML que não lê enquanto se digita mantém o
   último cartão desenhado, com uma insígnia de erro. Um bloco maior que
   256 KB não é lido e diz isso. Nada que um statblock guarde pode impedir o
   resto da nota de ser desenhado.

8. **O editor de layouts, refeito.** `[DECIDIDO 2026-10-20]`: *"o construtor
   de layout tá muito ruim, péssimo na real, precisava que vc revisasse ou
   até refizesse"*. A árvore de blocos de um lado e o cartão que ela faz do
   outro, desenhado a partir de um exemplo ou de um statblock da nota
   aberta, os dois ao mesmo tempo; adicionar um bloco por um menu; as
   opções de um bloco no lugar, não numa pilha de diálogos; mover um bloco
   arrastando ou por teclas; desfazer; sair com alterações não salvas
   pergunta antes. Ele escreve o arquivo do layout pelo contrato.

9. **A chave.** Statblocks são uma funcionalidade da
   [0103](0103-feature-presets-and-capability-flags.md), os botões de
   rolagem deles parte de "Dados": desligado, o bloco é um bloco de código,
   como o Obsidian o desenha sem o plugin.

10. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
    uma tabela de atributos é uma `<table>` com cabeçalhos de coluna; cada
    botão de rolagem e cada caixa de marcador tem um nome e funciona pelo
    teclado; os rótulos de um layout levam os dois idiomas.

## Consequências

- `app/ui/src/statblock/` é reescrito em torno do modelo de layout; os
  layouts por sistema da primeira construção e o seu editor saem.
- Rust: comandos do contrato para `.verso/layouts/`, confinados àquele
  diretório e a `.json`, limitados em tamanho; `FolderSettings` não muda
  para layouts. Os bindings gerados, as respostas do harness, as permissões
  do Tauri e as rotas do servidor acompanham.
- `app/ui/src/dice/rolai/` ganha `profile.ts`, `expression.ts` e os
  perfis, com os avisos deles e os testes do Rolai.
- `docs/reference/statblock-sources.md` (e o seu gêmeo pt-BR) lista, por
  layout embutido, a URL da fonte de cada campo e a linha da licença.
- A spec §6 ganha uma linha para ```` ```statblock ```` e para `[!oracle]`
  como construções que o Verso desenha, lidas pelo Obsidian como um bloco
  de código e um callout; o parser em si não muda.

## Alternativas descartadas

- Nenhuma registrada.

## Status

Aceita (2026-10-20), o desenho proposto ao mantenedor naquele dia, com todos
os detalhes decididos em 2026-10-21. Ainda fora desta ADR: a licença do
Fractal, que o mantenedor está perguntando aos autores (item 6).
