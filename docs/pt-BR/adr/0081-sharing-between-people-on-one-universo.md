# ADR 0081 — Compartilhar entre pessoas num mesmo UniVerso: um vault, uma pasta dentro dele, leitura ou escrita

- Data: 2026-10-10
- Fonte: o mantenedor, em sessão em 2026-10-10: *"assim como acontece no
  Notion, deveria sim ser possível compartilhar uma pasta ou até um
  documento. O documento é opcional, só se não der trabalho. Se fizer mais
  sentido, pode ser só a pasta, que aí é quem estiver gerenciando se vira
  organizando em pastas. E isso aparecer em algum canto, sei lá, em
  compartilhados… O Sérgio tem o vault dele, a Ana vai ter o vault dela.
  São dois usuários sincronizando seus vaults… dentro do servidor único… E
  o Sérgio, ele pode compartilhar uma pasta com a Ana, e a Ana compartilha
  uma pasta com o Sérgio, com as duas opções, modo leitura, modo escrita. E
  isso ser registrado… tem que ver como que vai ser essa experiência de
  dois usuários, cada um com seus vaults… se um compartilhar com o outro,
  como que vai ficar essa visão ali? Como vai aparecer? Porque deveria ser
  possível compartilhar uma pasta. Assim como deveria ser possível
  compartilhar um vault todo."* E, para depois desta: *"num próximo passo…
  histórico de mudança de arquivos… não esquece"* (Consequências). Escrita
  por Fable 5.1 a pedido do mantenedor (*"bota uma instância do Fable aí
  pra escrever isso"*), uma troca dos papéis da
  [0032](0032-author-and-reviewer-roles.md) como a [0073](0073-self-hosted-server-first.md)
  foi; a ser lida por Opus 5.5 antes de ser aceita.
- Relacionados: [0074](0074-accounts-and-access-on-the-server.md) (a pasta
  como unidade de acesso, os papéis dono, editor, leitor, concessões pelo
  dono ou por convite, o registro de auditoria, tokens por pasta —
  estendidos aqui a um caminho dentro de uma pasta), [0073](0073-self-hosted-server-first.md)
  (item 3, a sessão e o papel dela conferidos antes de o `verso-fs` agir;
  item 7, salas; o Status dela deixa "permissões mais finas que a pasta"
  `[ABERTO]` — esta ADR responde à parte da pasta dentro da pasta, não por
  nota nem por bloco, Q9 da spec), [0026](0026-core-ui-contract-inviolable-rules.md)
  (regra 4: uma nota é nomeada pelo caminho relativo à pasta aberta; `..`
  nunca cruza), [0010](0010-folder-is-the-unit-no-vault.md) (a pasta
  aberta é a unidade de trabalho), [0065](0065-a-folder-per-window.md)
  (uma pasta por janela), [0041](0041-multi-root-workspace.md) (várias
  raízes numa janela, Proposta), [0062](0062-focuses.md) (raízes nomeadas
  dentro de uma pasta), [0079](0079-sync-a-local-folder-with-a-server.md)
  (uma pasta local com uma pasta do servidor), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (cotas, o console), [0080](0080-the-trash-with-expiry-and-restore.md) (a
  lixeira de um compartilhamento), [0070](0070-what-travels-with-the-folder.md)
  (o que é da pasta, o que é da pessoa), [0066](0066-mcp-sees-boards-relations-properties-bases.md)
  (o MCP sob os mesmos papéis), [0045](0045-server-and-mcp-security.md) (a
  nota de outro membro como fronteira), [0036](0036-tabletop-rpg-support.md)
  (a mesa de jogadores, o caso que pediu isto),
  [0035](0035-cross-cutting-requirements.md) (os dois idiomas,
  acessibilidade), [0078](0078-universo-the-name-of-verso-as-a-server.md)
  (UniVerso).
- Status no briefing: ausente; ao ser aceita.
- Revisões: 2026-10-12 — as respostas do mantenedor às cinco perguntas
  que a construção levantou (Status), cada uma registrada no item dela,
  datada: itens 4, 8 e 11. Duas delas, ambas no item 11, estão decididas
  e ainda não construídas; uma, no item 8, estava sendo construída naquela
  noite.
  2026-10-21 — os itens 4 ("links que qualquer um abre: agora não") e 17
  ("um documento só: não na primeira versão") são revisados pela
  [0105](0105-read-links-without-an-account.md), Aceita naquele dia: um link
  de leitura sem conta numa pasta ou numa nota, desligado num servidor novo;
  compartilhar uma nota **para escrever** fica como o item 17 o deixou.
  2026-10-21 (revisão do lote da tarde, **à espera do mantenedor**, pergunta
  T.9 da lista de decisões da tarde; nada decidido aqui) — o item 5 diz
  "nomes e chaves, sem caminho", e o seletor de pastas agora mostra um
  rótulo `place` por pasta recente: os dois últimos componentes da pasta
  pai, nunca absoluto, nunca `..` (ver a linha da mesma data na
  [0026](0026-core-ui-contract-inviolable-rules.md), regra 4). Se o rótulo
  revisa o item 5 é decisão dele.
  2026-10-22 — o mantenedor respondeu T.9 e T.10 da lista da tarde. T.9, opção
  A: o rótulo `place` é aceito como rótulo de exibição, registrado na
  [0026](0026-core-ui-contract-inviolable-rules.md) (regra 4); o texto do item
  5 não muda. T.10, opção A (**em construção**): o seletor de pastas ganha um
  × numa pasta recente que **a esconde da lista** (nada é apagado), e os
  Ajustes ganham "Mostrar pastas ocultas" para trazê-las de volta.

## Contexto

O que existe ([0074](0074-accounts-and-access-on-the-server.md)): num
UniVerso a unidade de acesso é uma **pasta** — um vault — com um id
aleatório e um diretório sob a raiz das pastas; uma conta tem um papel
nela, dono, editor ou leitor, concedido por um dono (pelo e-mail de uma
conta existente) ou carregado por um convite; a concessão é auditada; um
leitor só lê; um admin não tem papel até receber um. O app desktop abre
uma pasta do servidor online, ou sincroniza uma pasta local com uma pasta
do servidor ([0079](0079-sync-a-local-folder-with-a-server.md) item 1). A
janela do navegador lista as pastas em que a pessoa pode entrar e abre
uma. Os membros de uma pasta são geridos pelo dono em Ajustes › Conta ›
Pastas, e pelo admin no console.

Então **compartilhar um vault inteiro existe**: o Sérgio concede à Ana
*editora* na pasta dele, e ela aparece na lista dela. O que não existe é
compartilhar **parte dela**. O modelo do Notion, que o mantenedor nomeou,
é uma árvore em que qualquer página pode ser compartilhada com uma pessoa
em leitura ou escrita, em que o que foi compartilhado comigo aparece em
"Compartilhados", e em que um filho herda o compartilhamento do pai. O
mantenedor pede a pasta; o documento só se custar pouco.

A cena é duas pessoas, cada uma com o próprio vault, sincronizando com o
mesmo servidor, e cada uma compartilhando uma pasta sua com a outra. As
perguntas são o que quem recebe vê e onde, o que o dono vê, o que um papel
significa dentro de parte de uma pasta, e como o servidor impede que o
que não foi compartilhado vaze pela busca, pelos links, pelos backlinks,
pelo grafo, pelas salas e pelo sync.

Dois jeitos de construir uma subpasta compartilhada foram pesados:

- **(A) Servida como uma pasta própria**: a subpasta é registrada como
  uma segunda pasta do servidor cujo diretório fica dentro do do dono —
  uma segunda raiz. Tudo que existe funciona sem mudança para quem recebe
  (um id de pasta, um papel, uma janela, o sync), e nada funciona direito
  para o servidor: dois índices percorrem os mesmos arquivos, dois
  watchers relatam a mesma mudança, uma nota aberta numa sala são duas
  salas sobre um arquivo (o lugar da sala é a chave da pasta e o caminho),
  o registro de mudanças anota cada escrita duas vezes, a cota conta os
  arquivos duas vezes, e a mudança de nome da subpasta pelo dono deixa
  órfão o diretório da segunda raiz.
- **(B) Uma concessão num caminho dentro de uma pasta só**: a concessão da
  [0074](0074-accounts-and-access-on-the-server.md) ganha um caminho; os
  comandos de quem recebe são conferidos contra os papéis cujo caminho
  cobre o deles, e toda resposta é filtrada a esses caminhos. Um índice,
  um watcher, uma sala, um registro, uma contagem — e nada mais existe
  para quem recebe: nenhum id para abrir, nada para o sync apontar,
  nenhum lugar nas listas, e a árvore inteira do dono teria de cruzar
  para que um prefixo dela pudesse ser mostrado.

## Decisão

Proposta (2026-10-10); aceita em 2026-10-11 (Status). Cada `[ABERTO]`
trouxe uma recomendação; o mantenedor decidiu. Itens abertos respondidos
em 2026-10-10 (Status).

1. **Um compartilhamento é uma concessão num caminho.** Uma concessão
   passa a ser *pasta, conta, caminho, papel*: o caminho é `""` para a
   pasta inteira — toda concessão de hoje — ou uma pasta dentro dela. Os
   papéis são os da [0074](0074-accounts-and-access-on-the-server.md): um
   compartilhamento é de **leitura** (*leitor*) ou de **escrita**
   (*editor*) — os dois modos do mantenedor; *dono* só existe em `""`. Um
   vault inteiro e uma pasta dentro dele se compartilham pelo mesmo gesto,
   e "compartilhar um vault todo" é a lista de membros que já existe com
   as palavras e os lugares desta ADR.
2. **Quem recebe vê uma pasta própria; o servidor guarda uma pasta só.**
   Isto pega a experiência de (A) sobre o armazenamento de (B). Um
   compartilhamento tem um **id** próprio no banco do servidor, e para
   quem recebe é uma pasta: é listado, aberto, sincronizado e endereçado
   por esse id, e todo caminho que cruza o contrato é relativo à pasta
   compartilhada ([0026](0026-core-ui-contract-inviolable-rules.md) regra
   4, inalterada). No servidor o compartilhamento resolve para *a pasta
   do dono, o caminho, o papel*: a sessão que abre um compartilhamento
   guarda o caminho ao lado da chave da pasta, os caminhos de todo comando
   são juntados a ele e confinados (`..` é recusado onde é recusado hoje,
   antes de o `verso-fs` agir, [0073](0073-self-hosted-server-first.md)
   item 3), e toda resposta — a árvore, uma listagem, uma busca,
   backlinks, o grafo, as linhas de uma base, o registro de mudanças — é
   filtrada ao caminho e re-enraizada nele. Os arquivos são lidos e
   escritos uma vez, pelo `verso-fs` da pasta do dono; o índice, o
   watcher, as salas e o registro de mudanças são os da pasta do dono.
   Anexos são servidos em `/f/<id do compartilhamento>/<caminho relativo>`
   atrás da mesma verificação.
3. **Como um compartilhamento se chama**, para quem recebe: o nome da
   pasta compartilhada e o do dono — "Campanha (Sérgio)". Só o último
   componente cruza: o caminho do dono acima dele é dele. `[ABERTO]`: se o
   dono pode dar a um compartilhamento um nome próprio. Recomendado: não,
   na primeira versão — decidido em 2026-10-10: sem nome próprio na
   primeira versão.
4. **Quem compartilha, com quem.** O **dono** da pasta compartilha; um
   editor não, e quem recebe não recompartilha (`[ABERTO]`; recomendado
   assim, pois o registro de auditoria fica com um autor por
   compartilhamento — decidido em 2026-10-10: só o dono compartilha;
   quem recebe não recompartilha). Quem recebe é uma conta no mesmo UniVerso, nomeada
   por e-mail, ou uma pessoa convidada: o convite do item 4 da
   [0074](0074-accounts-and-access-on-the-server.md), que já carrega uma
   pasta e um papel, carrega um caminho também, então "convidar um jogador
   para a pasta da campanha" é um link só. Links que qualquer um que os
   tenha pode abrir não estão nesta ADR (`[ABERTO]`, para quando pedirem;
   um servidor de notas privadas começa sem eles — decidido em
   2026-10-10: agora não). *(Decidido em 2026-10-12, Revisões: só o
   admin convida uma pessoa que não tem conta.)*
5. **Onde aparece.** Uma seção **"Compartilhados comigo"** — *Shared with
   me* — em todo lugar que lista as pastas de uma pessoa: o seletor de
   pastas do navegador e Ajustes › Conta › Pastas; Ajustes › Servidores do
   app desktop, sob cada servidor; o celular, que é o navegador. Cada
   entrada mostra o nome do item 3, o papel e o dono. Uma pasta inteira
   de outra pessoa, em que a pessoa é editora ou leitora, passa para essa
   seção também: "minhas pastas" são as de que sou dono. O dono tem
   **"Compartilhados por mim"** nos mesmos lugares: cada compartilhamento
   com o caminho, as pessoas e os papéis.
   **O seletor de pastas** — decidido em 2026-10-10, construído com esta
   ADR: no app desktop e no navegador, o seletor de pastas no topo da
   barra lateral agrupa as pastas em "Neste computador", "Meus" e
   "Compartilhados comigo" — *On this computer*, *Mine*, *Shared with
   me*.
6. **Como quem recebe usa.** Online, no navegador ou no app desktop
   conectado ao servidor, como qualquer pasta do servidor; e
   **sincronizado**, no app desktop, como uma pasta local própria (o item
   1 da [0079](0079-sync-a-local-folder-with-a-server.md) vale: uma pasta
   local, um compartilhamento), só leitura quando o compartilhamento é só
   leitura, como o item 1 da 0079 já faz para um leitor. Um
   compartilhamento abre numa janela própria ([0065](0065-a-folder-per-window.md)).
   `[ABERTO]`: se um compartilhamento pode aparecer **dentro** do vault de
   quem recebe, como subpasta dele. Recomendado: **não**. Seria uma pasta
   local sincronizando com duas pastas do servidor, contra o item 1 da
   0079; o índice de quem recebe teria as notas do dono e os links delas
   resolveriam entre as duas, as perguntas que a [0041](0041-multi-root-workspace.md)
   não respondeu; o Obsidian abrindo o vault de quem recebe leria as
   notas do dono como dela; e um apagamento da subpasta por quem recebe
   seria um apagamento na pasta do dono. Ver o próprio vault e um
   compartilhamento lado a lado numa janela é da 0041, quando vier; até
   lá um foco ([0062](0062-focuses.md)) fica dentro de uma pasta só, e um
   compartilhamento é uma janela — decidido em 2026-10-10: um
   compartilhamento nunca aparece dentro do vault de quem recebe;
   sincronizado, é uma pasta local própria (item 1 da
   [0079](0079-sync-a-local-folder-with-a-server.md)).
7. **O que o dono vê.** Na árvore de arquivos, uma pasta compartilhada
   leva uma marca (pessoas), e o menu dela tem **"Compartilhar…"** —
   *Share…* — que abre o compartilhamento: quem tem acesso, em qual
   papel, adicionar uma pessoa, mudar um papel, remover; os membros da
   pasta inteira são o mesmo diálogo na raiz. Ajustes › Conta › Pastas e
   a página da pasta no console listam os compartilhamentos da pasta por
   caminho, com as pessoas.
8. **Revogação.** O dono remove uma pessoa ou o compartilhamento inteiro;
   as janelas abertas de quem recebe são avisadas na hora, como uma
   mudança de papel é hoje, e o compartilhamento sai das listas dela. Uma
   pasta local que quem recebe sincronizou fica no computador dela como
   está, com o sync desligado e dizendo por quê (a regra do item 1 da
   [0079](0079-sync-a-local-folder-with-a-server.md) para desligar o
   sync): o que foi baixado era dela desde o momento em que foi
   compartilhado, e o diálogo diz isso ao dono na hora de compartilhar,
   numa linha. *(Decidido em 2026-10-12, Revisões: o sync do
   compartilhamento revogado se desliga no aparelho de quem recebe, com
   um aviso; sendo construído naquela noite, no `feat/universo-small`;
   construído em 6c7800e, mesclado por d2a72b0.)*
9. **Auditoria.** Um compartilhamento criado, mudado e removido, e um
   convite que carrega um, são entradas do registro de auditoria com o
   caminho ([0074](0074-accounts-and-access-on-the-server.md) item 9),
   lidas pelo dono e pelo admin; escritas dentro de um compartilhamento
   são escritas da pasta, com o seu autor, no registro de mudanças
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 4) como são
   hoje.
10. **Cota.** A da pasta do dono ([0077](0077-the-server-administration-console-and-folder-quotas.md)):
    uma escrita de quem recebe faz a pasta do dono crescer e é recusada
    pela mesma regra com as mesmas palavras; quem recebe vê o aviso de
    cota da pasta como um editor vê. As pastas próprias de quem recebe
    não são tocadas.
11. **O que a janela de quem recebe não pode saber.** Busca, backlinks, o
    grafo, tags, propriedades e as linhas de uma base respondem só com
    notas dentro do compartilhamento; uma nota de fora não é resultado,
    não é nó, não é backlink. Um link de uma nota compartilhada para uma
    nota fora do compartilhamento resolve para um estado distinto, **"não
    está no que foi compartilhado com você"**, mostrado como um link não
    resolvido e nunca criando uma nota: o nome já está no texto da nota,
    escrito pelo dono, e nada mais cruza — nem se existe, nem o caminho,
    nem o conteúdo. Um embed de uma nota ou de uma imagem fora do
    compartilhamento mostra as mesmas palavras no lugar dele. `[ABERTO]`:
    uma pasta compartilhada cujas notas embutem anexos guardados fora dela
    — a pasta de anexos padrão do Obsidian na raiz do vault é o caso comum
    — mostra essas palavras onde as imagens deviam estar. Recomendado: ao
    compartilhar, o dono é avisado de quais anexos que as notas embutem
    ficam fora da pasta e pode **acrescentar a pasta de anexos ao
    compartilhamento, só leitura**: um compartilhamento pode então ter um
    segundo caminho, e o modelo do item 1 já permite (uma concessão por
    caminho, mesmo id de compartilhamento). Fora da primeira versão se
    custar a rodada; dito no diálogo de qualquer jeito — decidido em
    2026-10-10, como recomendado: ao compartilhar, o dono é avisado de
    quais anexos ficam fora da pasta compartilhada e pode acrescentar a
    pasta de anexos ao compartilhamento, só leitura.
    *Decidido em 2026-10-12 (Revisões):* **uma renomeação por quem
    recebe reescreve os links do dono fora do compartilhamento**, como o
    Notion os atualiza (*"no Notion atualiza, imagino que vamos precisar
    também"*) — construído em 2026-10-12: uma renomeação ou uma movimentação
    pelo compartilhamento, numa janela ou pelo aparelho sincronizado de
    quem recebe, faz o servidor escrever ele mesmo as reescritas das notas
    do dono fora da pasta compartilhada, pelas regras da reescrita de uma
    janela (sobre a revisão que a renomeação leu, de forma atômica, dentro
    da cota; uma nota aberta numa sala ou mudada desde então fica como
    estava), cada uma no registro de mudanças da pasta com quem recebe
    como autor e avisada às janelas e aos aparelhos do dono como qualquer
    mudança feita no servidor; quem recebe só fica sabendo das notas de
    dentro, e o log do servidor diz o que foi escrito e o que ficou; e
    **os agregados que quem recebe vê — as contagens do índice, as
    fórmulas de uma base — são zerados** — construído em 2026-10-12: cada
    um conta só o que está dentro do compartilhamento — as notas da barra
    de status são as do compartilhamento; uma base pelo compartilhamento
    é avaliada só sobre a pasta compartilhada (e a pasta de anexos dela),
    então as linhas, o total, os nomes de propriedades, as fórmulas (um
    backlink de fora incluído) e os resumos são os do compartilhamento;
    tags, backlinks, links de saída e o grafo já eram filtrados — e o que
    não dá para restringir é zero, nunca o total da pasta: as contagens
    de uma indexação enviadas com uma mudança; o progresso de uma
    varredura passa sem a contagem, e a janela diz *Indexando…* sem
    número. *Decidido no mesmo dia:* anexos soltos na raiz do cofre
    ficam fora de uma subpasta compartilhada, já que não há pasta de
    anexos para acrescentar, e o diálogo de compartilhar pede ao dono que
    os mova para uma; compartilhar o cofre inteiro não tem esse limite.
12. **Salas** ([0073](0073-self-hosted-server-first.md) item 7). Uma nota
    aberta por um compartilhamento e pela pasta do dono é **uma sala só**:
    o lugar da sala é a chave da pasta do dono e o caminho completo, para
    o qual o compartilhamento resolve. A presença mostra cada pessoa nela
    pelo nome; um leitor está presente e não digita.
13. **O dono move ou muda o nome de uma pasta compartilhada.** Uma mudança
    de nome ou de lugar feita pelo servidor — uma janela, o comando de
    mudança de nome do sync — leva junto as concessões daquele caminho, no
    mesmo passo: o compartilhamento segue a pasta, as janelas de quem
    recebe são avisadas, o id do compartilhamento e a pasta local
    sincronizada de quem recebe não mudam. Uma mudança de nome que o
    servidor só acha depois — no disco do servidor à mão, pelo Obsidian
    sobre a montagem, por uma ferramenta — é um apagamento e uma criação
    para o servidor ([0079](0079-sync-a-local-folder-with-a-server.md)
    item 10): o compartilhamento então aponta para um caminho que sumiu,
    quem recebe vê uma pasta vazia com um aviso, o dono é avisado na
    árvore e em Ajustes e re-aponta ou remove o compartilhamento. Apagar a
    pasta compartilhada remove os compartilhamentos dela, dito antes na
    confirmação.
14. **Compartilhamentos aninhados.** A mesma pasta pode ter vários
    compartilhamentos em caminhos diferentes e a mesma pessoa pode estar
    em mais de um; o papel de uma pessoa num caminho é o **mais alto** das
    concessões dela cujo caminho o cobre. Um compartilhamento dentro de um
    compartilhamento é um compartilhamento num caminho mais fundo, com a
    mesma regra; o papel de quem recebe dentro de um compartilhamento é
    uniforme, já que quem recebe não recompartilha (item 4).
15. **Tokens e o MCP.** Um token de acesso pessoal ([0074](0074-accounts-and-access-on-the-server.md)
    item 8) pode nomear um compartilhamento entre as suas pastas e alcança
    o que o compartilhamento alcança, nunca mais que o papel da pessoa; o
    MCP sob esse token vê o compartilhamento como uma pasta
    ([0066](0066-mcp-sees-boards-relations-properties-bases.md)).
16. **A lixeira** ([0080](0080-the-trash-with-expiry-and-restore.md) item
    7): um escritor de um compartilhamento vê e restaura as entradas cujo
    caminho original está dentro do compartilhamento; o resto da lixeira
    da pasta não é dele.
17. **Um documento só.** Com honestidade: o modelo aguenta — uma
    concessão cujo caminho nomeia uma nota é um compartilhamento de um
    arquivo, e a verificação é "igual" onde é "abaixo de" — e a
    experiência não. Um compartilhamento de uma nota não tem pasta para
    os anexos, nem lugar para uma nota nova, sincroniza como uma pasta com
    um arquivo, e mostra "não está no que foi compartilhado com você" em
    todo link para fora. O mantenedor disse opcional e só se for barato; a
    parte do servidor é barata e a da janela não. `[ABERTO]`; recomendado:
    **fora da primeira versão**, o modelo deixando a porta aberta, e um
    compartilhamento só de leitura de uma nota primeiro, se for pedido —
    decidido em 2026-10-10: fora da primeira versão.
18. **Os dois idiomas, acessibilidade** ([0035](0035-cross-cutting-requirements.md)):
    o diálogo de compartilhar é um formulário com campos rotulados e uma
    lista de pessoas cujos controles de papel se alcançam pelo teclado e
    têm nome para um leitor de tela ("Ana, editora; mudar papel;
    remover"); a marca da árvore tem nome ("compartilhada com 2 pessoas");
    a seção "Compartilhados comigo" é uma região com título; revogar e
    apagar perguntam antes, na página. pt-BR e inglês; testes de ponta a
    ponta na suíte do servidor para duas contas compartilhando nos dois
    sentidos, nas larguras de desktop e de celular, e testes em Rust para
    o filtro, o confinamento, a mudança de nome que leva um
    compartilhamento e a que deixa um órfão.

## Consequências

- O banco do servidor: a tabela de concessões ganha o caminho, uma tabela
  de compartilhamentos o id e o nome; o convite ganha um caminho; toda
  lista e página do console que mostra membros mostra compartilhamentos. A
  verificação de papel que roda antes de o `verso-fs` agir ganha o caminho
  e a regra da "concessão mais alta que cobre"; a sessão ganha o caminho
  do compartilhamento ao lado da chave da pasta; as respostas de listagem,
  busca, backlinks, grafo, bases e o registro de mudanças ganham o filtro
  e o re-enraizamento; o comando de mudança de nome leva as concessões.
  Testes em Rust, e a suíte de ponta a ponta do servidor, para cada um.
- O contrato: um id de compartilhamento é um id de pasta para todo
  cliente, e as capabilities dizem o papel; os tipos gerados não mudam de
  forma por isto (invariante 3) além do nome do dono e do estado "não
  está no que foi compartilhado" de um link.
- A janela: as seções "Compartilhados comigo" e "Compartilhados por mim",
  o diálogo de compartilhar, a marca da árvore, o estado do link e as suas
  palavras; o cofre de exemplo não consegue mostrar duas contas e o
  roteiro diz isso ([0058](0058-demo-vault-as-tutorial.md)); o changelog
  ganha a sua linha.
- O `[ABERTO]` da [0073](0073-self-hosted-server-first.md) sobre
  permissões mais finas que a pasta é respondido para uma pasta dentro de
  uma pasta quando esta ADR for aceita, com uma linha de Revisões lá; por
  nota e por bloco (Q9 da spec) seguem abertos.
- **O próximo passo que o mantenedor nomeou**, não esta ADR: um
  **histórico das mudanças de um arquivo** — quem mudou o quê, quando, e
  trazer uma versão de volta — sobre o registro de mudanças do item 4 da
  [0079](0079-sync-a-local-folder-with-a-server.md), que hoje anota hashes
  e autores e não guarda bytes. `[ABERTO]`, registrado aqui para não ser
  esquecido (*"não esquece"*); é o resto de "histórico, atribuição e
  recuperação de uma mudança de outro membro" da 0073, e ganha uma ADR
  própria.

## Alternativas descartadas

- **(A) Uma subpasta compartilhada servida como uma segunda pasta do
  servidor** (levantada pelo autor, Contexto): dois de tudo sobre os
  mesmos arquivos, e uma mudança de nome que deixa a segunda raiz órfã. A
  experiência dela fica (item 2), o armazenamento não.
- **(B) sozinha, uma concessão num caminho sem nada próprio para quem
  recebe** (levantada pelo autor, Contexto): nada para listar, abrir ou
  sincronizar; a árvore do dono cruzando para que um prefixo pudesse ser
  mostrado.
- **O compartilhamento aparecendo dentro do vault de quem recebe**
  (levantada pelo autor, dos atalhos do Google Drive): o item 6 diz por
  que não, e deixa a pergunta ao mantenedor, que decidiu contra em
  2026-10-10.
- **Editores compartilhando** (levantada pelo autor, dos ajustes do
  Notion): o item 4 mantém o compartilhar com o dono, aberto ao
  mantenedor, que o manteve com o dono em 2026-10-10.
- **Permissões por nota agora** (levantada pelo mantenedor como "opcional,
  se for barato"): o item 17 diz o que é barato e o que não é.

## Status

**Aceita (2026-10-11).** Itens abertos respondidos em 2026-10-10 como
recomendado; lida por Opus 5.5 (o handoff de 2026-10-10 e a leitura das
respostas); aceita pelo mantenedor em 2026-10-11 (*"Mas eu tinha
confirmado"* às recomendações). O histórico das mudanças de um arquivo
segue `[ABERTO]` de propósito, para uma ADR própria.

**Construída na noite de 2026-10-11 para 12** (9e725c2, 4c49939,
7a648e0, acb1645 e 657fab1, juntados ao `feat/universo` pelo 2f25923 em
2026-10-12). As perguntas em aberto que a construção levantou foram
mandadas ao mantenedor na mesma noite, e respondidas (abaixo): uma
renomeação por quem recebe diante dos links do dono vindos de fora do
compartilhamento; um dono convidando pessoas sem conta; anexos na raiz
do cofre (item 11); o que quem recebe vê dos agregados da pasta; e o
sync de um compartilhamento revogado, desligado no aparelho de quem
recebe.

**Respondidas pelo mantenedor em 2026-10-12** (01:15 BRT), item a item: uma renomeação por quem recebe **vai reescrever os links do dono
fora do compartilhamento** (*"no Notion atualiza, imagino que vamos
precisar também"*) — decidido, a próxima rodada (item 11)
*(construído em 2026-10-12)*; só o admin convida pessoas que não têm conta (item 4); anexos
soltos na raiz do cofre ficam fora de uma subpasta compartilhada, o
diálogo pedindo ao dono que os mova — compartilhar o cofre inteiro não
tem esse limite (item 11); os agregados que quem recebe vê, as contagens
do índice e as fórmulas de uma base, vão ser zerados — decidido, a
próxima rodada (item 11) *(construído em 2026-10-12)*; o sync de um compartilhamento revogado se
desliga com um aviso — decidido, sendo construído naquela noite no
`feat/universo-small` (item 8) *(construído em 6c7800e, mesclado no
`feat/universo` por d2a72b0 em 2026-10-12; no `CHANGELOG.md` em
Unreleased)*. Cada uma está registrada no item dela
(Revisões).

*(Histórico, antes da aceitação acima:)* Proposta em 2026-10-10. A ser
lida por Opus 5.5 antes de ser aceita. Para o mantenedor, cada um com uma recomendação: um nome próprio para um
compartilhamento (item 3; não); quem compartilha, e recompartilhar (item
4; só o dono, sem recompartilhar); links que qualquer um pode abrir (item
4; agora não); um compartilhamento dentro do próprio vault de quem recebe
(item 6; não, uma janela própria até a 0041); anexos fora da pasta
compartilhada (item 11; um segundo caminho, só leitura, oferecido ao
compartilhar); um documento só (item 17; fora da primeira versão, o
modelo permitindo depois); e, para uma ADR própria, o histórico das
mudanças de um arquivo (Consequências).

Itens abertos respondidos em 2026-10-10. O mantenedor, em sessão, às recomendações acima: *"Gostei das recomendações, pode seguir"* —
cada `[ABERTO]` dos itens 3, 4, 6, 11 e 17 decidido como recomendado, no
lugar, e o item 5 ganhando o seletor de pastas, construído com esta ADR.
O histórico das mudanças de um arquivo segue `[ABERTO]`, para uma ADR
própria.
