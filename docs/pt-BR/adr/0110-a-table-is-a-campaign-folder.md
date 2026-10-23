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
   reenraizamento do compartilhamento da 0081). `[PROPOSED]` Os jogadores
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
