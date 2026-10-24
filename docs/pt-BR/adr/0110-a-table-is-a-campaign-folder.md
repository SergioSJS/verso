# ADR 0110 — Uma mesa é uma pasta de campanha: jogadores convidados, notas reveladas aos poucos, um dashboard da mesa

- Data: 2026-10-22
- Origem: o mantenedor, em 2026-10-22, enquanto a mesa da
  [0107](0107-the-table-a-shared-roll-and-chat-log.md) estava sendo
  construída. Perguntado se as rolagens deveriam pertencer às notas e não à
  raiz compartilhada, ele respondeu: *"imagino que uma mesa, uma campanha e
  uma pasta seria o mesmo contexto. Então o dono poderia habilitar uma pasta
  como mesa, gera links e acesso para a galera que entra apenas no contexto
  da pasta ativa. O mestre pode ir adicionando e liberando mais informações
  à medida que fizer sentido. Só não sei como faríamos com links entre docs
  ainda sem acesso pelos jogadores"*. Depois: *"Deveria ser possível
  compartilhar como edição algumas notas, tipo nota do grupo, nota da ficha,
  já outras seriam apenas leitura. O legal é que os usuários podem ir
  montando um board de relacionamento, arrastando as notas (handouts,
  pistas) que eles têm acesso e criando laços. A pasta que for transformada
  em mesa deveria ter opções extras que facilitem jogar e configurar: o
  mestre, ao clicar na pasta, o Verso abre como pasta normal, aí ele
  habilita como mesa e ela vira modo dashboard de mesa. Aí deveria ser
  possível deixar ativo ou não para login, e o mestre pode ter várias pastas
  de mesa"*. As adições do autor (itens 9–14) foram oferecidas na mesma
  conversa e o mantenedor respondeu *"gostei das adições"*. Escrita pelo
  Opus 5.5; a ser lida pelo outro modelo antes de aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionadas: [0107](0107-the-table-a-shared-roll-and-chat-log.md) (a mesa:
  rolagens, mensagens, imagens, fixados, rolagens secretas, lista de
  presentes — com escopo de uma pasta),
  [0081](0081-sharing-between-people-on-one-universo.md) (compartilhamentos
  de uma pasta dentro de um cofre; papéis dono, editor, leitor; convites),
  [0087](0087-secret-blocks-hidden-from-readers.md) (o servidor entrega ao
  leitor uma nota sem seus blocos secretos),
  [0105](0105-read-links-without-an-account.md) (um link para fora do que o
  leitor pode ver é desenhado como texto), [0090](0090-maps-on-the-board.md)
  (marcadores secretos), [0084](0084-notifications-in-the-window.md),
  [0098](0098-world-and-campaign-wizard-template-bundles.md) (pacotes de
  campanha), [0099](0099-visual-markdown-statblocks-and-cards.md)
  (statblocks — fichas de personagem), [0057](0057-board-json-canvas.md) (o
  board), [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md).

## Contexto

A [0107](0107-the-table-a-shared-roll-and-chat-log.md) dá a uma pasta do
UniVerso uma mesa: todos que têm a pasta aberta compartilham um só registro
de rolagens e mensagens. Conduzir uma campanha pede mais que o registro:
convidar os jogadores só para aquela pasta, manter a maior parte da campanha
escondida e revelá-la conforme o jogo avança, deixar os jogadores escreverem
algumas notas (a ficha, a nota do grupo) mas só lerem o resto, e um lugar
para o mestre conduzir tudo isso. Hoje um compartilhamento
([0081](0081-sharing-between-people-on-one-universo.md)) dá um papel só para
uma pasta inteira, e os blocos secretos
([0087](0087-secret-blocks-hidden-from-readers.md)) escondem partes de uma
nota, não notas inteiras.

## Decisão

Situação **Proposta**. Os itens `[DECIDED]` são as palavras do mantenedor
acima; os itens `[OPEN]` são dele para responder; os itens `[PROPOSED]` são
do autor.

1. **Uma mesa é uma pasta de campanha.** `[DECIDED 2026-10-22]` Um só
   contexto: mesa, campanha e pasta são a mesma coisa. O dono de uma pasta do
   UniVerso a abre como qualquer pasta e a transforma em mesa ("Tornar esta
   pasta uma mesa" / "Make this folder a table"); dá para desfazer. Um
   mestre pode ter várias pastas de mesa. A mesa da 0107 é a mesa desta
   pasta.

2. **Os jogadores entram por convite, só naquela pasta.** `[DECIDED]`
   Transformar uma pasta em mesa oferece um link de convite
   ([0081](0081-sharing-between-people-on-one-universo.md), convites); o
   jogador que aceita vê só aquela pasta — nada acima nem ao lado (o
   reenraizamento do compartilhamento da 0081). 2026-10-23: o jogador que já
   tem conta no servidor (de outra mesa) aceita o link com essa conta, já
   dentro ou entrando na página do convite
   ([0074](0074-accounts-and-access-on-the-server.md) item 4); sem segunda
   conta. `[PROPOSED]` Os jogadores
   entram como leitores por padrão; a edição por nota é o item 5.

3. **Aberta ou fechada.** `[DECIDED]` O mestre define a mesa como aberta ou
   fechada para login. `[OPEN]` O que significa fechada:
   - **A — Fechada: os jogadores não conseguem abrir a pasta** (o link deles
     responde "a mesa está fechada"); o mestre trabalha sozinho.
     _(recomendada)_
   - **B — Fechada: os jogadores podem ler o que foi liberado, mas a mesa
     (rolagens, mensagens) e toda nota editável ficam congeladas.**

4. **Notas reveladas aos poucos.** `[DECIDED]` (*"o mestre pode ir
   adicionando e liberando mais informações"*). `[PROPOSED]` Cada nota de uma
   pasta de mesa está **escondida da mesa** ou **liberada**. Uma nota
   escondida não existe para o jogador: não está na lista de arquivos, na
   busca, no grafo, nos backlinks, na abertura rápida, nas tags, nos boards,
   nas incorporações nem nos links da mesa — o servidor nunca a entrega a
   ele, como a 0087 já faz com os blocos secretos. O mestre libera uma nota
   com uma ação ("Liberar para a mesa"), ou várias de uma vez, e pode
   escondê-la de novo. Os blocos secretos continuam escondendo partes de uma
   nota liberada. Onde o estado fica guardado: `[PROPOSED]` no banco de dados
   do servidor, ao lado das concessões do compartilhamento (como as
   concessões da 0081) — nunca no arquivo da nota, para que uma cópia
   sincronizada ou o Obsidian vejam uma nota comum. `[OPEN]` O padrão para
   uma nota numa pasta de mesa:
   - **A — Escondida até ser liberada** (as notas novas e as que já estavam
     lá quando a pasta virou mesa); existe um "Liberar tudo".
     _(recomendada)_ — nada vaza por esquecimento.
   - **B — Liberada, a menos que escondida.**

   **Alterado em 2026-10-23 — liberada para quem (decisão do mantenedor).**
   Uma nota liberada é liberada *para alguém*: para a mesa toda, ou para um ou
   mais jogadores escolhidos; oculta continua sendo "para ninguém". O
   mantenedor, sobre a proposta do "Liberar para…": *"gosto da sua sugestão, e
   tem que ficar visivel em algum lugar quem tem acesso, as vezes um icone de
   usuários que no hover, mostra quem tem acesso e quem não, isso dentro da
   nota, so tem que ficar esperto, usando skills de ux para posicionar sem
   quebrar nada na responsividade."* Assim, o **público** de uma nota é
   oculta, a mesa toda, ou um conjunto de jogadores da mesa; o servidor o guarda
   junto do resto do estado da nota e o pergunta a cada jogador toda vez que
   antes perguntava "oculta" (ver "Como foi construído (o público de uma nota,
   2026-10-23)"). Uma nota que só o mestre e os jogadores escolhidos veem não
   existe para os outros, pela regra acima. Uma permissão de edição a um
   jogador (item 5) implica que esse jogador está no público. Quem tem acesso
   aparece dentro da nota.

5. **Algumas notas editáveis pelos jogadores.** `[DECIDED]` (*"nota do
   grupo, nota da ficha"*). `[PROPOSED]` Concessões de escrita por nota,
   guardadas no servidor como no item 4: **o grupo** (todo jogador da mesa
   edita — a nota do grupo, o board do grupo) ou **um jogador** (uma ficha
   atribuída a esse jogador: só ele e o mestre editam). Todo o resto é só
   leitura para os jogadores. O servidor confere a concessão a cada escrita,
   como confere hoje o papel de um compartilhamento
   ([0026](0026-core-ui-contract-inviolable-rules.md), regra 4). Uma ficha de
   personagem é qualquer nota; uma nota de statblock
   ([0099](0099-visual-markdown-statblocks-and-cards.md)) ganha uma ação
   "Atribuir a um jogador".

6. **Boards dos jogadores.** `[DECIDED]` (*"montando um board de
   relacionamento, arrastando as notas que eles têm acesso e criando
   laços"*). `[PROPOSED]` Uma área dos jogadores na pasta da mesa (uma
   subpasta "Jogadores" / "Players", gravável pelo grupo) guarda os boards e
   as notas que os jogadores fazem; num board eles arrastam como cartões as
   notas que podem ver e desenham os laços. Uma nota escondida não pode ser
   arrastada, buscada nem incorporada; quando liberada, fica disponível.
   `[OPEN]` Um só board compartilhado dos jogadores, ou um board por jogador
   mais um compartilhado:
   - **A — Os dois: um "Board do grupo" compartilhado e cada jogador pode
     fazer o seu** _(recomendada)_
   - **B — Só o compartilhado.**

7. **Links para notas que o jogador ainda não pode ver.** `[OPEN]` pergunta
   do mantenedor (*"só não sei como faríamos com links entre docs ainda sem
   acesso"*). O servidor reescreve esse link para o jogador (como a 0105 faz
   com um link para fora de um link de leitura); opções:
   - **A — Texto simples, sem link** (a regra atual da 0105).
   - **B — O texto com um cadeado pequeno, não clicável** ("ainda não
     revelado") — o jogador sabe que há algo ali. _(recomendada como
     padrão)_
   - **C — Tarjado ("▒▒▒▒")** — para quando o próprio nome é um spoiler.
   `[PROPOSED]` B por padrão; o mestre obtém C para um link específico
   escrevendo-o com texto alternativo (`[[A traição do barão|um rumor]]`
   mostra "um rumor 🔒") ou marcando uma nota escondida como "nome secreto",
   de modo que todo link para ela seja tarjado. Quando uma nota é liberada,
   os links para ela funcionam para todos.

8. **O dashboard da mesa.** `[DECIDED]` (*"ela vira modo dashboard de
   mesa"*). `[PROPOSED]` Abrir uma pasta de mesa mostra um dashboard — a
   página inicial dela: o registro e a entrada da mesa (0107), quem está
   presente, aberta/fechada, a próxima sessão, as notas liberadas (as mais
   novas primeiro), a ficha de cada jogador, a nota e o board do grupo,
   dados/oráculo rápidos; e, só para o mestre, as notas escondidas com
   "Liberar", o link de convite, as concessões por nota e a lista de
   jogadores. Os jogadores veem a metade dos jogadores.

9. **"Mostrar à mesa".** `[DECIDED]` (adição do autor, aceita)
   `[PROPOSED]` O mestre empurra uma nota liberada, imagem ou mapa para a
   tela de todos os jogadores de uma vez (um cartão sobre a janela, que se
   pode dispensar), como o "show players" do Foundry. Empurrar uma nota
   escondida a libera antes, depois de perguntar.

10. **Sessões.** `[DECIDED]` (adição, aceita) `[PROPOSED]` "Abrir sessão" /
    "Encerrar sessão": abrir cria a nota da sessão
    (`Sessões/Sessão N — <data>.md`, a partir do modelo do pacote de
    campanha, se houver um —
    [0098](0098-world-and-campaign-wizard-template-bundles.md)) e marca o
    registro da mesa a partir desse momento; encerrar oferece acrescentar as
    rolagens e mensagens da sessão à nota da sessão como um resumo que o
    mestre edita antes de escrever.

11. **Avisos de "novo".** `[DECIDED]` (adição, aceita) `[PROPOSED]` Quando
    uma nota é liberada, os jogadores da mesa recebem um aviso ("Novo: Diário
    do farol foi revelado") por meio da
    [0084](0084-notifications-in-the-window.md), e uma lista "Novidades" no
    dashboard.

12. **O diário privado do jogador.** `[DECIDED]` (adição, aceita)
    `[PROPOSED]` Cada jogador tem uma nota que só ele e o mestre veem e
    editam (na área dos jogadores), para anotações e segredos do personagem.

    **Alterado em 2026-10-23 (decisão do mantenedor).** O diário não é um
    recurso à parte: é **uma nota liberada para um jogador** (item 4, alterado)
    e permitida a esse jogador para editar (item 5). O mesmo vale para uma pista
    que só um personagem recebeu e para a ficha de cada jogador liberada só ao
    seu dono. Nada separado é construído para ele.

13. **"Ver como jogador".** `[DECIDED]` (adição, aceita) `[PROPOSED]` O
    mestre pré-visualiza a mesa exatamente como um jogador escolhido a vê
    (estende o "Ver como leitor" de hoje).

14. **Mapas com marcadores secretos.** `[DECIDED]` (adição, aceita)
    `[PROPOSED]` Numa mesa, os marcadores secretos da
    [0090](0090-maps-on-the-board.md) são revelados um a um como as notas.

15. **Quem é o mestre.** `[PROPOSED]` O(s) dono(s) da pasta: dois mestres são
    dois donos. Nenhum papel novo agora; um papel "mestre" vem quando algum
    caso precisar de um que um dono não possa ser.

16. **Depois, não agora.** `[PROPOSED]` Rastreador de iniciativa, névoa de
    guerra nos mapas, uma mesa privada do mestre — cada um numa ADR própria
    quando pedido.

17. **Fases.** `[PROPOSED]` Fase 1: criar uma mesa, convite, liberar/esconder
    notas (imposto pelo servidor em todo lugar), desenho dos links (item 7),
    concessões por nota (item 5), aberta/fechada. Fase 2: dashboard, mostrar
    à mesa, sessões, avisos de "novo", diários, ver como jogador, área dos
    boards dos jogadores, marcadores de mapa.

18. **Segurança** ([0083](0083-security-hardening-of-universo.md)).
    `[PROPOSED]` As notas escondidas são filtradas no servidor em todo
    caminho de leitura que um jogador tem (lista, leitura, busca, grafo,
    backlinks, tags, índice, sincronização para um dispositivo, entrada numa
    sala, URLs de arquivo, anexos de uma nota escondida, referências de
    arquivo dos cartões de board, os links de nota da mesa): um teste por
    caminho, como a 0087 fez com os blocos secretos; uma concessão por nota
    nunca vai além do compartilhamento da pasta.

19. **Acessibilidade e idiomas**
    ([0035](0035-cross-cutting-requirements.md)). `[PROPOSED]` O cadeado e a
    tarja têm alternativas em texto ("link para uma nota ainda não
    revelada"); o dashboard é uma página com títulos e marcos; pt-BR e
    inglês.

## Consequências

- O `verso-server` ganha, por pasta de mesa: o sinalizador de mesa e o
  estado aberta/fechada, o estado liberada/escondida por nota, as concessões
  de escrita por nota, as atribuições de fichas e a filtragem de todo
  caminho de leitura para os jogadores; o contrato ganha os comandos e
  eventos para isso (tipos gerados, regra 3).
- A janela ganha "tornar esta pasta uma mesa", o dashboard, os controles de
  liberar/esconder e de concessão, o desenho dos links para os jogadores,
  mostrar à mesa, sessões, avisos e diários.
- O item 2 da [0107](0107-the-table-a-shared-roll-and-chat-log.md) (a mesa é
  a pasta) vale; esta ADR diz qual pasta e quem entra.
- O cofre de demonstração ganha uma nota sobre conduzir uma mesa; o "Tour do
  Verso", um cartão.

## Alternativas descartadas

Oferecidas ao mantenedor em 2026-10-22: uma mesa por nota, ou várias mesas
dentro de uma pasta por subpasta — ele escolheu um só contexto (*"uma mesa,
uma campanha e uma pasta seria o mesmo contexto"*).

## Situação

Proposta (2026-10-22). As palavras do mantenedor acima decidem a direção e,
em substância, os itens 1–6 e 8–14; em aberto: o que significa "fechada"
(item 3), a visibilidade padrão (item 4), os boards dos jogadores (item 6),
o desenho dos links (item 7). Não construída. Espera essas respostas e uma
leitura pelo outro modelo.

Respondido em 2026-10-22 (`~/Projects/person/apps/verso-decisoes-0110-mesa-campanha-2026-10-22.md`):
MC.1 = A (fechada: os jogadores não abrem a pasta), MC.2 = A (oculta até ser
liberada), MC.3 = A (board do grupo e boards de cada jogador), MC.4 = B (texto
com cadeado; rasurado quando o nome é spoiler). Sobre o teto do registro da
[0107](0107-the-table-a-shared-roll-and-chat-log.md) (MS.1): *"pode ser, mas
talvez faça sentido ser configurável e limite por mesa"* — o teto (20.000
entradas) e o limite de tamanho de imagem viram ajustes de cada mesa,
definidos pelo mestre, com os valores construídos como padrão.

*Fase 1 construída (2026-10-22), branch `feat/campaign-table`; veja "Como foi construído" abaixo. A ADR continua Proposta: o outro modelo ainda não a leu, e as perguntas listadas em "Escolhido no código" são do mantenedor.*

## Como foi construído (fase 1, 2026-10-22)

Branch `feat/campaign-table`. A fase 1 do item 17 está construída: fazer uma
mesa, convite, liberar e ocultar, o véu em todo caminho de leitura, os links
desenhados como texto, concessões de edição por nota, aberta e fechada, os
limites da mesa. A fase 2 (o dashboard, mostrar à mesa, sessões, avisos,
diários, "ver como jogador", a área de boards dos jogadores, pinos de mapa)
não está. Onde o código teve de escolher, a escolha está listada por último,
para o mantenedor confirmar ou mudar.

- **Onde.** `crates/verso-server/src/campaign.rs` (o estado das mesas, o véu,
  quem é jogador), `campaign_serve.rs` (o que um jogador recebe),
  `campaign_text.rs` (os links desenhados como texto; puro, sem IO),
  `campaign_cmds.rs` (os comandos do mestre), `campaign_sync.rs` (a
  sincronização para o aparelho de um jogador segue as liberações),
  `db/campaign.rs` (esquema 15), `rpc_collab.rs` (os comandos das salas, tirados
  de `rpc.rs`, que estava em 1499 linhas). O contrato:
  `crates/verso-contract/src/campaign.rs`. A janela: `app/ui/src/campaign.ts`,
  `campaignDialog.ts`, `campaignStrings.ts`.
- **Uma mesa** é uma linha `(pasta, raiz)` do banco do servidor: `raiz` é `""`
  para a pasta inteira do servidor, ou uma pasta dentro dela (então os jogadores
  são as pessoas de um compartilhamento dessa pasta, feito pelo convite).
  Aberta ou fechada, o teto do registro e o limite de imagem ficam na linha.
  Nada é escrito no arquivo de nota nenhuma; fazer a mesa e desfazê-la são
  reversíveis. Uma nota sem linha está **oculta** (MC.2 = A), as que estavam
  quando a pasta virou mesa e as feitas depois; "Liberar tudo" escreve uma linha
  por nota. As linhas acompanham um renomear ou mover feito pelo servidor e
  somem com uma exclusão.
- **Comandos** (a janela só chega à mesa por eles; a janela da dona, na própria
  pasta, nunca por um compartilhamento, nunca de um celular):
  `campaign_status`, `campaign_make(root)`, `campaign_unmake(root)`,
  `campaign_settings(root, open, logMax, imageMax)`,
  `campaign_release(paths, released)` (uma pasta vale pelas notas dentro dela),
  `campaign_release_all(root)`, `campaign_secret_name(path, on)`,
  `campaign_grant(path, grant)`, `campaign_invite(root)`. Cada um responde o novo
  estado; o evento `campaign-changed` avisa toda janela da pasta, e a janela de
  um jogador é avisada como uma pasta é (`folder-changed`, com as notas que
  passou a ter ou perdeu). Tipos gerados (`CampaignStatus`, `CampaignTable`,
  `CampaignNote`, `CampaignGrant`, `CampaignInvite`, `CampaignPlayer`,
  `CampaignChanged`); o harness responde a todos
  (`app/ui/src/harness/campaign.ts`); a lista de comandos dos celulares lê
  `campaign_status` e recusa o resto.
- **Quem é jogador.** Uma janela que só pode ler uma pasta que tem mesa (um
  leitor; um token que só lê). A dona e os editores — os co-mestres — recebem a
  pasta inteira; o véu é para leitores, como a projeção da ADR 0087. Um convite
  faz um leitor. O estado que um jogador recebe nomeia as mesas que pode abrir e
  as notas que pode editar, e nada além.
- **O véu.** Um caminho dentro de uma mesa está oculto para um jogador a menos
  que seja uma nota, board ou base liberado (uma concessão libera), um anexo que
  uma nota ou board liberado liga ou incorpora (decidido no código, item 4: senão
  uma nota liberada mostraria uma imagem quebrada), ou uma imagem que a mesa
  mostra. Uma mesa fechada oculta tudo. Uma pasta só aparece com algo visível
  dentro (a própria pasta da mesa sempre). Um caminho é julgado pelo nome com
  maiúsculas dobradas e `.`/`..` resolvidos, e pelo nome que a contenção lê.
- **Os caminhos de leitura** cobertos, um teste cada em `tests_campaign.rs` (o
  primeiro também varre todo comando das ligações geradas, como `tests_secret.rs`
  faz para a ADR 0087, então um comando de leitura novo falha ali até dizer como
  responde a um jogador): listar notas, arquivos, pastas e entradas; ler uma
  nota, um texto, um arquivo como texto (uma oculta responde como uma que nunca
  existiu, testada contra um nome ausente); busca (o trecho é cortado de novo do
  texto com o véu, e um achado cujas palavras estavam num link agora desenhado
  como texto cai); grafo, backlinks, links, tags, ids de bloco, menções sem
  link, linhas das bases, abertura rápida (lista e busca); o resumo da pasta e
  seu tamanho; `resolve_attachment` e os arquivos dos mapas; boards (um cartão de
  nota oculta é um cartão de texto trancado; os cartões de texto como notas); a
  sala (a sala de uma nota oculta é recusada; a de uma liberada é o documento
  próprio do jogador, sobre o texto com o véu; liberar ou ocultar fecha os
  documentos dos jogadores para entrarem de novo); sincronização para o aparelho
  (um arquivo oculto fica fora do manifesto e do registro do leitor, uma
  liberação é uma mudança que o aparelho busca, ocultar de novo é uma exclusão
  que ele é avisado de fazer, um arquivo oculto é recusado por `sync_read`);
  os arquivos em `/f/`; os eventos da pasta; as entradas da mesa (a nota em que
  uma rolagem foi feita não é dita quando oculta).
- **Links para notas ocultas** (item 7, MC.4 = B): no texto servido a um
  jogador, um wikilink ou link Markdown para uma nota oculta vira texto simples
  e um cadeado: o apelido quando há, senão o nome como foi escrito (a última
  parte), depois " 🔒"; uma nota marcada "nome secreto" é desenhada ▒▒▒▒ seja o
  que for que se escreveu; um incorporado ou imagem de arquivo oculto vira "🔒
  (ainda não revelado)" / "🔒 (not revealed yet)" na língua do mestre. Um
  caminho, um título de seção e um `^id` nunca vão, no corpo, no frontmatter ou
  em código. O HTML servido, os títulos, as propriedades e o tipo são derivados
  de novo desse texto.
- **Concessões** (item 5): `none`, `group` ou um jogador (uma conta da mesa;
  boards não podem ser concedidos na fase 1). Uma concessão libera a nota.
  Imposta em `write_note` e `write_text`, na digitação das salas e no
  `sync_put` de um aparelho (só para uma nota concedida ao grupo); toda outra
  escrita — criar, renomear, mover, excluir, anexos, boards,
  `sync_delete`/`sync_rename` — continua do mestre. Quem pode editar uma nota a
  lê inteira, como um escritor lê (ADR 0087 item 5).
- **Aberta e fechada** (MC.1 = A): fechada, a tentativa de um jogador de abrir
  a pasta, ou o compartilhamento, responde "a mesa está fechada" (a rota de
  arquivos também), as janelas que já estavam dentro são mandadas para fora e um
  comando de uma delas é recusado. A dona e os editores sempre entram.
- **Limites** (resposta à MS.1): por mesa, entre 1.000 e 200.000 entradas
  (padrão 20.000) e 1 a 30 MB (padrão 10), impostos pelo servidor
  (`db/table.rs` apara no teto da mesa; `table_image.rs` julga a imagem). A mesa
  de raiz mais curta da pasta dá ao registro da pasta os seus números. Por mesa
  desde 2026-10-23: os números de cada mesa regem o seu próprio registro e as
  suas próprias imagens (veja "Como foi construído (uma conversa por mesa,
  2026-10-23)" abaixo); antes, a mesa de raiz mais curta da pasta dava os
  números ao registro único da pasta.
- **Convite**: `campaign_invite` faz um convite de leitor de uso único, sete
  dias, para a pasta ou para o compartilhamento da pasta da mesa (feito então);
  só a administradora do servidor, com uma prova recente (`prove_first`), como o
  convite do console para uma pasta (ADR 0081 item 4, ADR 0083 item 6). A janela
  mostra o link para copiar.
- **Tutorial**: a nota 32 do cofre de demonstração, "Rodando uma Mesa" /
  "Running a Table", um cartão no tour, uma linha no mapa da nota de boas-vindas.
- **Escolhido no código, para o mantenedor confirmar ou mudar.** (1) Um link sem
  apelido mostra o **nome como o mestre escreveu**, com o cadeado ("Barão 🔒");
  o item 7 diz "o texto com um cadeado", e um caminho nunca vai, mas o nome vai.
  Se o nome nunca deve atravessar, a resposta é C para todo link: diga. (2)
  Editores são mestres, não jogadores: uma mesa é para leitores; um editor vê a
  pasta inteira. (3) Quem recebe a concessão de uma nota, e todo jogador numa
  nota concedida ao grupo, a lê **inteira** — blocos secretos e links como
  escritos — pois uma edição de uma projeção escreveria os cadeados na nota; a
  janela avisa. (4) Uma nota concedida a um jogador é projetada nos aparelhos dos
  outros jogadores e editada na janela ou na sala, não enviada do aparelho de
  quem a recebeu. (5) Um anexo está aberto quando uma nota ou board liberado o
  liga, ou a mesa o mostra como imagem. (6) O limite de imagem para em 30 MB, não
  50: o teto de mensagem da conexão é 48 MiB e o base64 é um terço maior. (7)
  Quando uma pasta vira mesa, o aparelho de um leitor que já sincronizou uma nota
  fica com a cópia; o registro não diz nada de uma nota que nunca disse (uma
  exclusão a nomearia). (8) Uma mesa dentro de um compartilhamento não tem canal
  de mesa para as janelas do compartilhamento (0107 como construída); as
  rolagens de uma mesa de subpasta são da janela da dona. (9) A sala e os
  arquivos de aparelho são servidos na língua do mestre para os textos de
  substituição.

Testado: `tests_campaign.rs` (20 testes, com a propriedade, em notas geradas, de
que nenhum caminho, título ou id chega a um jogador), os testes unitários de
`campaign_text.rs` (a mesma propriedade em 500 notas geradas),
`test/campaign.test.mjs` e `e2e/campaign.spec.mjs` da janela no Chromium e no
WebKit (Docker).

## Como foi construído (uma pasta sincronizada, 2026-10-23)

Branch `feat/table-in-synced-folder`. Os controles da campanha rodavam só "numa
janela na própria pasta" (a seção da fase 1 acima), e uma pasta deste computador
que sincroniza com um UniVerso é a pasta própria de uma janela assim: o mestre no
desktop com uma pasta sincronizada. Os nove comandos (`campaign_status`,
`campaign_make`, `campaign_unmake`, `campaign_settings`, `campaign_release`,
`campaign_release_all`, `campaign_secret_name`, `campaign_grant`,
`campaign_invite`) agora são respondidos nessa janela pela conexão do sync
(`app/src-tauri/src/sync/live.rs`, o mesmo encanamento da mesa,
[0107](0107-the-table-a-shared-roll-and-chat-log.md) "Como foi feito (uma pasta
sincronizada)"), e o evento `campaign-changed` que o servidor conta a essa
conexão chega às janelas que pediram o status.

- **O que o servidor faz.** Nada de novo: a conexão da sessão de dispositivo é a
  do dono da pasta, passa pelas mesmas verificações (`game_master`: o dono, na
  própria pasta, nunca por um compartilhamento, nunca um celular, uma
  credencial que escreve) e age na pasta do servidor que o sync abriu, com
  caminhos relativos a ela e a mesma contenção (`root_arg`: sem `..`, sem
  caminho absoluto, nada oculto). `tests_live_table.rs` tenta um leitor
  sincronizado recusado em todos os controles, o dono fazendo, liberando,
  concedendo, fechando e desfazendo uma mesa, e caminhos que saem da pasta
  recusados.
- **O convite** pede a prova antes, como na pasta do próprio servidor (ADR 0083
  item 6): a sessão do dispositivo é provada por `server_prove`, que marca essa
  sessão; testado com o token do dispositivo.
- **Sem conexão.** Os controles da janela existem enquanto o servidor é
  alcançado: com o link caído ou o sync pausado o status é "nenhum" (não um
  erro), as linhas do menu do mestre não são oferecidas, e a janela pede os
  compartilhamentos e o status de novo quando o estado volta.
- **Escolhido no código, para o mantenedor confirmar.** (1) As linhas são as do
  dono de uma pasta sincronizada, como `share_list` diz (os compartilhamentos são
  pedidos ao servidor com o token do dispositivo, como antes). (2) Uma pasta
  sincronizada de um compartilhamento não tem mesas a fazer, como uma janela num
  compartilhamento não tem.

**O passo de pasta a mesa, no painel Mesa (23/10/2026).** O mantenedor: *"deveria ser possível transformar a pasta a partir da pasta aberta dentro do próprio verso... um botãozinho ali que me deixa transformar a pasta em mesa, sem ter que clicar com o botão direito"*. O painel Mesa da janela mostra um botão **Tornar esta pasta uma mesa** quando a pasta aberta é de um servidor (ou sincronizada com um), a pessoa é a dona e ela ainda não é mesa (`mayShare()` e nenhuma mesa na raiz da pasta, a mesma condição da linha do menu do fundo da árvore); ele roda o mesmo comando dessa linha, `makeTable("")` (`campaign_make`), e abre a janela da mesa. Quando a pasta já é uma mesa, o botão vira **Abrir a janela da Mesa** (`openCampaignDialog("")`). Ninguém mais vê nenhum dos dois, e uma pasta só deste computador diz numa linha por que não há mesa. Uma mesa feita de uma subpasta continua sendo feita pelo menu da árvore. O painel acompanha a mesa feita ou desfeita pelo evento `verso:campaign-status` do `setStatus`.

**O link de convite abre onde a janela alcança o servidor (2026-10-23).** O mantenedor, testando uma pasta sincronizada com um servidor em `http://192.168.3.150:7340` sem `VERSO_PUBLIC_URL`: *Convidar jogadores › Gerar link* deu `http://localhost:7340/invite/<token>`, que não abre nada. O servidor escuta em todos os endereços e não sabe o nome pelo qual a janela o alcança, e não o tira do `Host` da requisição (ADR 0045). Então `campaign_invite` responde o link inteiro só quando `VERSO_PUBLIC_URL` está definido e, senão, **só o caminho**, `/invite/<token>`; a janela põe o endereço do seu servidor antes dele: a origem da página no navegador e, no app de desktop, o endereço para o qual a conexão da janela foi feita (o comando do host `window_server`, para uma pasta de servidor e para uma pasta deste computador sincronizada com um), nunca a origem do próprio app. O mesmo endereço dá o "Copiar link" de uma nota no desktop. Links que saem por e-mail (redefinição de senha) ainda precisam do endereço inteiro: sem `VERSO_PUBLIC_URL` e com bind em todos os endereços, o servidor avisa uma vez no log ao iniciar.

## Como foi construído (feedback do chrome, 2026-10-23)

**O selo da mesa ao lado do nome da pasta.** O mantenedor perguntou: *"Como eu
estou com a raiz de uma mesa aberta no verso, como que o dono da pasta vai
conseguir ver as configurações da pasta? E como que os jogadores veem do lado
deles?"* O dono só chegava à janela da mesa pelo botão direito no fundo da
árvore ou pelo botãozinho do painel Mesa. Escolhido no código,
primeiro só para a raiz; **o mantenedor rejeitou: *"ERRADO, posso ter N mesas
numa mesma pasta"*.** Uma pasta aberta tem quantas mesas quiser, cada uma uma
pasta (uma mesa por pasta). A regra agora: **toda pasta que é uma mesa** (uma
subpasta; a raiz tem o selo do cabeçalho) mostra um pequeno selo **Mesa** na
linha dela na árvore, um botão com o nome da pasta da mesa — para o **dono** abre
a janela *daquela* mesa; para o **jogador** abre o balão somente leitura dela:
duas linhas (lê as notas liberadas, edita as entregues a ele) e as notas
entregues *naquela mesa* como links, sem ajustes. O **selo ao lado do nome da
pasta** segue o contexto: a mesa que contém a nota ativa (a pasta de mesa mais
próxima subindo pelo caminho, com o nome dessa pasta: *Mesa: Ruínas de
Valdor*), a da raiz quando a raiz é mesa e nenhuma mais funda contém a nota ou
não há nota ativa, e, sem nota ativa dentro de mesa alguma e havendo mesas
abaixo, **Mesas (N)**, que abre uma lista (dono: cada uma abre a janela; jogador:
cada uma o balão). Sem selo quando a pasta não tem mesa nenhuma
(`app/ui/src/tableChip.ts`; testado em `e2e/table-chip.spec.mjs`). O painel
Mesa (o registro e o chat compartilhados, `src/table/*`) era então um por pasta
aberta e não seguia a mesa da nota ativa; agora segue (veja "Como foi construído
(uma conversa por mesa, 2026-10-23)"). Ao lado, uma pasta que a pessoa só lê
mostra o cadeado fechado da emenda do ADR 0076 do mesmo dia.

## Como foi construído (uma conversa por mesa, 2026-10-23)

Branch `feat/table-per-table`. O "Uma mestra pode ter várias pastas de mesa. A
mesa do 0107 é a mesa desta pasta" do item 1 foi construído como um registro por
**pasta aberta**: com a pasta toda aberta e duas mesas em subpastas ("Cripta",
"Sala"), as entradas das duas mesas caíam em um registro só, que tirava os seus
números da mesa de raiz mais curta. O mantenedor, 2026-10-23: *"o chat deve ser
1 por mesa, adapte e refaça o que precisar"*. A decisão, com as regras em
[0107](0107-the-table-a-shared-roll-and-chat-log.md) "Decisão (um registro por
mesa, 2026-10-23)":

- **A identidade de uma mesa** é o par (pasta do servidor, a raiz da mesa dentro
  dela): `root` é `""` para a própria pasta, ou o caminho da pasta relativo a
  ela, como a linha de `campaigns` o guarda. Uma pasta do servidor sem mesa
  nenhuma mantém a mesa única, da pasta toda, do 0107 original: a sua mesa da
  raiz, `""`.
- **O que é por mesa agora**: as entradas, as fixadas, quem está nela (a lista),
  o teto do registro (`campaigns.log_max` *daquela* mesa), o limite de imagem
  (`image_max` daquela mesa), as regras de limpar e de apagar. Uma rolagem ou um
  sorteio de oráculo feito na sala de uma nota vai para a mesa que contém a nota
  (a mais funda), e uma nota fora de toda mesa vai para a mesa padrão da pasta,
  a de raiz mais curta.
- **O que substituiu "a mesa de raiz mais curta da pasta dá ao registro da pasta
  os seus números"**: o `log_max` e o `image_max` de cada mesa; a mesa de raiz
  mais curta é só a **padrão** para uma chamada que não nomeia mesa (a de um
  par antigo) e para uma nota fora de mesa.
- **A migração** (esquema 16, `db/table.rs`): `table_log` ganha uma coluna
  `tbl`; as entradas guardadas antes dela vão para a mesa de raiz mais curta da
  pasta quando ela tem mesas (a de cujos números sempre dependeram), senão para a
  pasta (`""`). Nada é apagado. Depois: a primeira mesa de uma pasta fica com o
  registro que a pasta tinha; uma mesa renomeada ou movida leva o registro junto
  (`campaign_move`); a última mesa de uma pasta desfeita devolve os registros à
  pasta; uma mesa desfeita enquanto outras ficam deixa o registro dela esperando.
- **Jogadores** (item 8 acima levantado para um compartilhamento com raiz numa
  mesa). A coordenação, repassando o objetivo do mantenedor: os jogadores de cada
  mesa conversam e rolam naquela mesa. Um jogador convidado para uma mesa de
  subpasta (`campaign_invite` na pasta dessa mesa faz um compartilhamento nessa
  pasta, item 2) é uma janela num compartilhamento cuja raiz é uma mesa, e **o
  canal dessa mesa é o canal dele**: o servidor mapeia a raiz do compartilhamento
  para (pasta do dono, raiz da mesa), então o dono lê o mesmo registro pela pasta
  toda. O jogador conhece a sua mesa como a raiz do próprio compartilhamento, `""`
  (a mesa nos comandos, respostas e eventos é `""` para ele, e o caminho de uma
  nota é escrito a partir da raiz do compartilhamento, nunca do caminho-pai do
  dono); nomear qualquer outra mesa é recusado, então um jogador da Cripta não
  alcança nada da Sala. As rolagens dele numa nota do seu compartilhamento caem
  na mesa. Um compartilhamento cuja raiz **não** é mesa continua sem canal de mesa. Um
  jogador que lê a pasta toda pode entrar em qualquer mesa dela (a regra da mesa
  fechada vale como antes).
- **Testado**: `tests_table.rs` (`per_table`: entradas, listas, fixadas e
  limpezas de duas mesas separadas; uma chamada sem mesa; um nome que não é
  mesa, `..`, absoluto; a rolagem de uma nota; os tetos e os limites de imagem;
  um compartilhamento recusado; uma mesa renomeada), `db/tests.rs` (a migração
  do esquema 15, o registro acompanhando as mesas), `tests_live_table.rs` (o
  mesmo pelo enlace da sincronização), `test/tableWhich.test.mjs`,
  `test/tableServer.test.mjs` e `e2e/table-per-table.spec.mjs`.

- **A janela da mesa e a página da pasta (2026-10-23).** O mantenedor, numa captura da janela da campanha (um checkbox nativo, um "Salvo." solto, "Desfazer mesa" como o botão principal roxo): *"essa tela ta feia demais, faz um toggle maneiro pra ativar, passa um UX aí cara pelo amor"*; e na página da pasta: *"nessa tela aqui, da pasta, deveriam ter informações da mesa, na página da pasta, deveria estar ali, ativar ou não a mesa, configurações e tal"*. Feito: **Mesa aberta** é uma chave (`role=switch`, um selo *Aberta*/*Fechada*, uma linha do que significa) que salva na hora e responde ao lado; a janela é feita de cartões (convite com o link num campo, *Copiar* e o vencimento; jogadores com o que foi entregue a cada um, em links, e quem está na mesa agora; notas com as contagens de liberadas/ocultas e as duas ações em massa; os limites recolhidos em *Avançado*, o campo salvando ao sair ou com Enter); **Desfazer mesa** é uma ação vermelha e discreta no pé (uma ação destrutiva é vermelha em toda paleta, `--danger`; pergunta antes e diz que os arquivos nunca mudam), nunca o botão principal. No celular a janela é uma folha. A página da pasta tem um cartão **Mesa** sob o título, feito das mesmas peças (`campaignParts.ts`): para a dona de uma pasta que é mesa, a chave, as jogadoras (e quem está online), *Convidar*, as contagens e *Configurações da mesa* (recolhível, lembrado por pasta); para uma jogadora, uma linha só de leitura; numa pasta que pode virar mesa (servidor ou sincronizada, a dona, fora de uma mesa) um chamado *Tornar esta pasta uma mesa*; nada numa pasta só deste computador. Vale para a página de qualquer pasta, então N mesas por pasta.
- **Uma mesa fechada é dita à jogadora (2026-10-23).** A janela de uma jogadora "não conectava" a uma mesa fechada (`refused: a mesa está fechada` no log, nada na tela). Agora a janela diz, no lugar da pasta e na língua da interface, *A mesa está fechada pelo mestre. Você entra quando ela abrir.*, com *Tentar agora*, e tenta de novo sozinha (15 s, dobrando até 2 min); o mesmo na janela remota do desktop, numa pasta sincronizada com o servidor (`SyncStatus.problem = table_closed`, nova tentativa a cada 15 s) e no navegador (o aviso do servidor `gone: folder, reason: closed` mantém a pasta lembrada). A dona nunca vê isso, e o botão, o selo e o painel da Mesa dizem *fechada* ao mestre. **Nada fechou a mesa sem a pessoa**: `campaign_make` numa mesa existente é `INSERT OR IGNORE` (não toca em `open`), `campaign_settings` sem `open` o mantém (`COALESCE`), os campos de limite da janela não mandam `open`, nenhuma migração o toca, e uma mesa nova começa aberta (testes `making_a_table_again_…` em `db/tests.rs` e `tests_campaign.rs`); o único que manda `open: false` é a chave. A janela antiga punha o foco do teclado no checkbox, onde um Espaço perdido podia fechar a mesa sem a pessoa querer; a janela redesenhada põe o foco no título, salva na hora com resposta visível e diz *Fechada* em vermelho.

## Como foi construído (um compartilhamento é a mesma mesa, 2026-10-23)

O mantenedor, 2026-10-23: *"qual que é a diferença de entrar na mesa por compartilhamento ou entrar na mesa como membro… Existe algum motivo plausível pra ter diferença?"* A regra que decorre: **o compartilhamento só
limita o que o jogador vê; a mesa se comporta igual.** Conversa, rolagens,
atualizações ao vivo, imagens, o modo de rolagem, a lista de quem está, as cores
dos dados, o som, apagar as próprias mensagens e o aviso de mesa fechada são
iguais para o jogador de um compartilhamento com raiz numa mesa e para um membro
da pasta. A auditoria de cada ramo de `scope` da mesa achou duas diferenças que
não eram de visibilidade, as duas corrigidas:

- **Os eventos ao vivo eram descartados.** `Scope::push` (`scope.rs`) manda a uma
  janela de compartilhamento só os eventos que conhece, e os da mesa
  (`table-entry`, `table-roster`, `table-pinned`, `table-removed`,
  `table-cleared`) não estavam entre eles; o jogador de um compartilhamento não
  ouvia nada ao vivo: nem as mensagens e rolagens do mestre, nem a própria
  rolagem feita numa nota (os dados rolavam pela sala da nota, a linha era
  guardada, e o painel só a mostrava depois de recarregar, pelo histórico do
  `table_join`), nem a lista de quem está; e sem som nem 3D para as rolagens dos
  outros, que vêm do mesmo evento. Agora passam; `table.rs` já escrevia a mesa
  como `""` e os caminhos a partir da raiz do compartilhamento antes de empurrar,
  então nenhum caminho da pasta do dono vai junto.
- **Imagens eram recusadas.** Um editor num compartilhamento agora envia imagem
  como um membro (um leitor não envia, como um membro leitor). O arquivo fica no
  lugar de anexos **dentro da pasta da mesa do compartilhamento**
  (`<raiz>/<lugar>/mesa-…`), o único lugar que esse jogador lê; o `image` da
  entrada é escrito a partir da raiz do compartilhamento, como o caminho de uma
  nota (`scoped`).

O que continua diferente, porque é só escopo: os caminhos são escritos a partir
da raiz do compartilhamento; uma nota fora dele não tem caminho na entrada; a
mesa é `""`; um compartilhamento cuja raiz não é mesa não tem mesa; o jogador de
um compartilhamento não conduz a mesa (`campaign_make`, liberar e convidar são do
dono da pasta). Testado: `tests_table.rs`
(`a_window_on_a_share_hears_the_table_live_as_a_member_does`: mensagens do dono,
uma segunda janela da mesma conta, uma saindo, uma rolagem de nota, uma imagem) e
`e2e-server/table-parity.spec.mjs` (o mesmo cenário como membro e num
compartilhamento).

Uma terceira diferença, achada pelo e2e: a imagem de uma mesa era procurada a
partir do pai do compartilhamento (`resolve_attachment` sem nota que diga de
onde o alvo é escrito), então a miniatura do próprio jogador do compartilhamento
vinha faltando. Agora o compartilhamento procura esse alvo a partir da sua raiz.

## Como foi construído (o público de uma nota, 2026-10-23)

A decisão do mantenedor registrada nos itens 4 e 12. O que foi construído:

- **Estado.** `campaign_notes.released = 1` continua sendo a mesa toda, então
  toda nota liberada antes continua da mesa (o esquema 17 acrescenta tabelas e
  não muda nenhuma linha); com `released = 0`, as linhas de `campaign_audience
  (folder, path, account)` são os jogadores que veem a nota, e nenhuma é oculta.
  Uma permissão de edição a um jogador o põe no público de uma nota que não era
  da mesa; a permissão de edição do grupo todo faz da nota a da mesa; estreitar
  um público retira a permissão que deixou de valer; ocultar retira qualquer
  uma. O público acompanha a nota quando ela é renomeada ou movida e some com
  ela quando é apagada.
- **Uma pergunta, feita a alguém.** O véu responde "oculta" para um espectador
  dado: o do próprio jogador (`Veil::view(account)`), o público — o que a mesa
  toda vê, que é o que recebe uma chamada que não diz quem pergunta, então
  falha fechado — e a união (o que qualquer jogador vê), que é o que o log de
  sincronização guarda para leitores. As portas que diziam "oculta" antes
  perguntam o do próprio jogador: as listas, leituras, busca, backlinks, grafo,
  tags, abrir rápido, quadros e incorporações, os links da mesa desenhados como
  cadeados, o texto servido, os arquivos em `/f/` (um anexo abre só por uma nota
  que esse jogador vê), as salas e sua admissão, os eventos que cada janela
  ouve, a sincronização de um dispositivo e o log da mesa (uma entrada de
  rolagem ou oráculo feita numa nota que um espectador não vê perde o caminho e
  a origem para ele). A sombra compartilhada de uma sala para leitores é cortada
  com os olhos do público: um link para uma nota que só alguns jogadores veem
  vira cadeado nela, para todos, até recarregarem (nenhum nome de uma nota assim
  cruza um documento compartilhado).
- **O log do dispositivo de um jogador é só dele** quando a pasta tem uma nota
  liberada para alguns jogadores (`campaign_epoch`). O log que o servidor guarda
  é dito para os jogadores juntos; cada jogador recebe o seu recorte, numerado
  na sua própria contagem: as mudanças de uma nota que o jogador não via quando
  vieram não são mudanças dele (decidido na primeira vez que o log dele é
  pedido, guardado em `campaign_skip`, de modo que os números que um dispositivo
  já contou nunca se movem), uma nota que ele perdeu é dita como exclusão
  (`campaign_lost`, também para uma nota apagada enquanto ele a via,
  `campaign_gone`), e o hash de cada nota é o do texto próprio daquele jogador.
  Uma mudança que só muda quem vê uma nota, e as notas que apontam para ela, são
  registradas para que o log de todo jogador as tenha. Um jogador que não vê uma
  nota não ouve seu nome, suas mudanças, nem quantas houve.
- **Comandos.** `campaign_audience(paths, audience)` (do mestre;
  `{kind: "hidden" | "table" | "players", accounts}`, as contas precisam ser
  jogadores da mesa da nota) e `campaign_access(path)` (quem tem acesso: ao
  mestre, todo jogador com o que cada um pode; a um jogador, só as pessoas que
  têm acesso; uma nota que o jogador não vê responde como uma ausente). O status
  diz o público de cada nota.
- **Mostrado dentro da nota.** Um ícone de usuários com uma contagem na linha do
  título da nota, ao lado da estrela; o balão (passar o mouse num dispositivo de
  ponteiro, toque ou clique, Enter e Espaço; Esc fecha e devolve o foco; uma
  folha de baixo num celular) lista ao mestre cada jogador com *vê* / *edita* /
  *não vê* e um atalho para mudar, e a um jogador que vê a nota ("Você, Bruno e o
  mestre" / "A mesa toda"), nunca os controles do mestre.
- **Testado.** `tests_audience.rs` (um jogador fora do público não consegue
  listar, ler, buscar, ver backlinks, tags, abrir sala, sincronizar, buscar o
  anexo nem ver a nota no log da mesa; um dentro consegue; incluir e retirar um
  jogador ao vivo; exclusão; permissões), `db/tests.rs` (esquema 17 e as regras do
  público), `app/ui/e2e/audience.spec.mjs` e `e2e-server/audience.spec.mjs`.
- **Não feito.** O público de um quadro é a mesma regra onde um quadro pode ser
  liberado (é um arquivo da mesa como as notas); nenhum controle separado foi
  acrescentado para ele.
