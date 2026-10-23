# ADR 0107 — A mesa: um registro das rolagens e mensagens de todos, ao lado das notas

- Data: 2026-10-21
- Origem: o mantenedor, em 2026-10-21, enquanto os dados 3D ganhavam os
  ajustes de aparência do Rolai: *"já vai pensando aí pq em algum momento
  quero ter uma barra de chat onde as rolagens de todos que estão
  conectados juntos aparecem no chat e tal"*. Pedido como direção, não
  para agora. Escrita pelo Opus 5.5; a ser lida pelo outro modelo antes
  de aceita ([0032](0032-author-and-reviewer-roles.md)).
- Relacionadas: [0088](0088-dice-and-random-tables.md) (item 4, o
  servidor rola numa sala e guarda as últimas rolagens em memória, nada
  gravado; item 8, a rolagem de um membro anunciada com o nome dele),
  [0073](0073-self-hosted-server-first.md) (item 7, salas),
  [0074](0074-accounts-and-access-on-the-server.md) (contas, papéis),
  [0081](0081-sharing-between-people-on-one-universo.md) (dono, editor,
  leitor numa pasta), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (a nota de uma pasta sincronizada entra na sala do servidor enquanto
  online), [0083](0083-security-hardening-of-universo.md) (limites,
  ritmo, entrada hostil), [0084](0084-notifications-in-the-window.md)
  (notificações por tipo), [0087](0087-secret-blocks-hidden-from-readers.md)
  (o que não é servido a um leitor), [0096](0096-this-app-is-a-server.md)
  (o desktop servindo a própria pasta), [0101](0101-3d-dice-physics-overlay.md)
  (dados 3D), [0102](0102-creative-oracles-and-improvisation.md)
  (tiragens do oráculo), [0103](0103-feature-presets-and-capability-flags.md)
  (interruptores de recursos), [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md).

## Contexto

Hoje uma rolagem numa nota compartilhada é vista por quem está na sala
dessa nota e por mais ninguém ([0088](0088-dice-and-random-tables.md)
item 4, `crates/verso-server/src/collab_dice.rs`): o servidor rola,
carimba o nome da conta, avisa as outras janelas da sala e guarda as
últimas 20 rolagens (`ROLLS_KEPT`) em memória para quem entrar na nota
depois. Uma tiragem do oráculo faz o mesmo caminho. Nada é gravado.

Isso serve para uma nota. Uma sessão de jogo não fica numa nota só: o
mestre rola da ficha de um monstro, um jogador da sua ficha, alguém
pergunta ao oráculo na nota da sessão. Cada rolagem cai numa sala
diferente; ninguém as vê juntas, e uma rolagem numa nota que só você tem
aberta não é vista por ninguém.

O Rolai, o app de dados do mantenedor de onde o Verso copiou o motor
(0088 item 5), tem a forma pedida: uma sala por link, a lista de quem
está lá, um histórico das rolagens e cartas de todos, um "ocultar daqui
pra trás" local e um "limpar a sala" para todos (Rolai
`specs/09-limpar-historico.md`), o relógio do servidor em cada entrada.
Ele não tem mensagens digitadas.

O que falta ao Verso para fazer o mesmo: um lugar compartilhado por mais
de uma nota (uma sala é uma nota), um painel que mostre o registro, e uma
decisão sobre o que é guardado e onde.

## Decisão

Status **Proposta**. Itens marcados `[OPEN]` são do mantenedor; itens
marcados `[PROPOSED]` são a recomendação do autor, não decididos.

1. **A mesa.** `[PROPOSED]` Um painel chamado **Mesa** / **Table** mostra
   um registro: cada rolagem, tabela sorteada e tiragem do oráculo feita
   por qualquer pessoa na mesma mesa, na ordem em que o servidor as
   recebeu, cada uma com o nome de quem rolou (carimbado pelo servidor,
   como a presença), a hora (o relógio do servidor), a notação, os dados,
   o total e a nota de onde veio, como link. Mais mensagens digitadas e
   imagens (item 3).

2. **O que é uma mesa.** `[DECIDED 2026-10-21]` **A pasta** (opção A de
   três; as outras eram B, a sala da nota como hoje, e C, uma mesa com
   nome por link como no Rolai). Todos que têm a mesma pasta do UniVerso
   aberta, em qualquer nota, dividem uma mesa. Uma campanha é uma pasta;
   uma rolagem em qualquer nota dela chega à mesa: vai para a sala da nota
   (como hoje) **e** para a mesa da pasta, rolada uma vez pelo servidor.

3. **Mensagens e imagens, não só rolagens.** `[DECIDED 2026-10-21]`
   Rolagens e mensagens curtas digitadas (opção A: texto simples, sem
   Markdown, sem HTML; um link para uma nota da pasta aparece como link),
   **e imagens** — o mantenedor: *"A mas cara, seria top poder compartilhar
   imagem também"*. A opção B, só rolagens, não foi escolhida.

   `[DECIDED 2026-10-21]` Para onde vai uma imagem compartilhada — opção
   A, como recomendado (o mantenedor: *"aceito suas recomendações"*):
   - **A — Para a pasta, como arquivo:** enviada à mesa, é gravada na pasta
     de anexos da pasta por ação de quem enviou, como um arquivo
     importado, conta na cota da pasta
     ([0077](0077-the-server-administration-console-and-folder-quotas.md)),
     aparece na lista de arquivos e pode ser incorporada numa nota. Um
     leitor, que não grava arquivo, não envia imagem. _(escolhida)_
   - **B — Para o armazenamento do servidor,** ao lado do registro da
     mesa, fora da pasta; um leitor pode enviar.

   Nos dois casos uma imagem é PNG, JPEG, WebP ou GIF, conferida pelos
   bytes e não pelo nome, abaixo do limite de envio da pasta, servida com
   o seu tipo e `nosniff` ([0083](0083-security-hardening-of-universo.md)
   itens 8 e 9), e nunca um SVG.

4. **Rolar pela mesa.** `[PROPOSED]` O campo da mesa rola quando o texto
   é uma notação de dados depois de `/r` (`/r 1d20+3`), ou por um botão de
   dados ao lado, pelo mesmo comando da rolagem de uma nota, de modo que o
   servidor sorteia o número (0088 item 4). Uma tabela sorteada ou um
   oráculo é rolado pela sua nota, não pela mesa.

5. **O que é guardado, e onde.** `[DECIDED 2026-10-21]` **Guardado, sem
   prazo de validade,** e o usuário pode limpar, fixar entradas e
   adicioná-las a notas — o mantenedor: *"deveria ficar salvo, sem prazo de
   validade, com possibilidade de limpar, pinar, adicionar nas notas"*.
   Nenhuma das três opções oferecidas foi escolhida (A, só memória como na
   0088, a recomendada; B, o banco do servidor com retenção; C, uma nota
   da sessão acrescentada a cada entrada). Isso revisa a
   [0088](0088-dice-and-random-tables.md) item 4 ("nada é gravado") para
   a mesa; registrado lá.
   - **Fixar.** Qualquer membro fixa uma entrada; as fixadas ficam no
     topo do painel para todos, até serem soltas.
   - **Adicionar a uma nota.** "Adicionar à nota…" / "Add to note…" numa
     entrada (ou numa seleção) acrescenta o texto dela — a notação, os
     dados, o total, quem e quando — a uma nota que o usuário escolhe,
     mostrando o que vai entrar antes de gravar (invariante 8), pela mesma
     gravação de qualquer edição, com a sua conferência de versão
     (invariante 11). Uma imagem entra como incorporação do seu arquivo.

   `[DECIDED 2026-10-21]` Onde o registro é guardado — opção A, como
   recomendado:
   - **A — No banco do servidor,** por pasta, em `VERSO_DATA_DIR`, com o
     backup do servidor; não viaja com uma cópia sincronizada da pasta.
     _(escolhida)_ — nenhum arquivo da pasta é gravado em nome de todos
     os presentes, a cada poucos segundos
     ([0012](0012-files-are-source-of-truth.md)); o que deve viver com as
     notas vai para elas por "Adicionar à nota".
   - **B — Num arquivo dentro da pasta** (em `.verso/`), gravado pelo
     servidor pelo `verso-fs`; viaja com a pasta e a sua sincronização, e
     é regravado a cada entrada.

6. **Limpar.** `[PROPOSED]` Como no Rolai: **"Ocultar daqui pra trás"** /
   **"Hide up to here"** esconde o registro só na sua janela, pode ser
   desfeito, e corta na hora do servidor da última entrada mostrada, nunca
   no relógio local; **"Limpar a mesa"** / **"Clear the table"** esvazia
   para todos, pergunta antes, e é só do dono da pasta; as entradas
   fixadas ficam, a não ser que o dono diga o contrário na mesma pergunta.

   `[DECIDED 2026-10-21]` Apagar uma entrada — opção A, como recomendado:
   - **A — Quem escreveu apaga a sua mensagem ou imagem; um dono apaga
     qualquer uma.** Uma rolagem não se apaga uma a uma (para ninguém
     rolar de novo e esconder a primeira). _(escolhida)_
   - **B — Só o dono,** limpando a mesa.

7. **Rolagens secretas.** `[DECIDED 2026-10-21]` **Já, para os donos da
   pasta** (opção B; A era depois, numa ADR própria, a recomendada).
   "Rolar para o dono" / "Roll to the owner" mostra a rolagem a quem rolou
   e aos donos da pasta; os outros membros veem "Ana rolou em segredo" /
   "Ana rolled in secret", sem notação e sem número. O servidor decide quem
   recebe pelos papéis da pasta, nunca pela janela. Uma rolagem secreta
   cai em 3D só nas telas que a veem.

8. **Quem está na mesa.** `[PROPOSED]` O topo do painel mostra quem está
   lá agora (nomes carimbados pelo servidor, as mesmas cores dos
   cursores). Um leitor da pasta está na mesa e pode rolar, como a 0088
   decidiu para uma nota (D2–D11), e pode escrever mensagens (recomendação
   do autor; o item 3 decidiu as mensagens, não quem as escreve).

9. **Onde a mesa existe.** `[PROPOSED]` Numa pasta do UniVerso, no
   navegador e no app de desktop conectado a ela; numa pasta sincronizada
   enquanto o servidor está ao alcance, como uma nota entra na sua sala
   pela [0082](0082-live-co-editing-of-a-synced-folder.md); num desktop
   que serve a própria pasta ([0096](0096-this-app-is-a-server.md)), o
   desktop é o servidor e guarda a mesa. Numa pasta do computador, sozinho,
   o painel mostra as suas rolagens desta execução, como o histórico local
   do Rolai, e diz que não é compartilhado.

10. **Onde fica o painel.** `[DECIDED 2026-10-21]` **Um painel da área
    lateral** (opção A), como Backlinks ou Estrutura, que o usuário pode
    mover como qualquer painel; no celular, uma folha que sobe de baixo.
    Não escolhidas: uma barra na base (B), uma gaveta flutuante (C).

11. **Os dados de cada um.** `[DECIDED 2026-10-21]` Cada pessoa tem a
    sua aparência de dados ([0101](0101-3d-dice-physics-overlay.md):
    cores, textura, material, as três cores), e uma rolagem aparece para
    os outros na aparência de **quem rolou**, não na de quem vê. O
    mantenedor: *"cada usuário vai ter sua própria configuração de dado,
    e deveria refletir para os outros quando ele fizer rolagens"*. O Rolai
    faz o mesmo: uma rolagem e um membro da lista levam o `DiceStyle` de
    quem rolou. Então:
    - A janela manda a sua aparência com a rolagem; o servidor a confere
      contra uma forma fechada — cores como `#rrggbb`, textura e material
      das listas fixas, nada mais, nunca uma URL ou um arquivo — recusa o
      resto, e a repassa com a rolagem e na lista de presentes. O tamanho
      dos dados continua de cada um que vê.
    - Vale para uma rolagem na sala de uma nota ([0088](0088-dice-and-random-tables.md)
      item 4) tanto quanto na mesa.
    - O registro desenha os dados de cada rolagem nas cores de quem rolou.

    `[DECIDED 2026-10-21]` As rolagens dos outros também **caem em 3D**
    na sua tela quando os seus dados 3D estão ligados, na aparência de
    quem rolou, com um interruptor "Mostrar em 3D as rolagens dos outros" /
    "Show others' rolls in 3D", ligado (opção A; B era só as suas em 3D).

12. **Limites e entrada hostil** ([0083](0083-security-hardening-of-universo.md)).
    `[PROPOSED]` Uma mensagem tem no máximo 500 caracteres e é texto
    simples; o servidor recusa o que passar antes de repassar; mensagens
    têm ritmo por conexão como as rotas REST (uma rajada, depois recusa);
    o registro guardado por mesa e por janela é limitado; a janela desenha
    uma mensagem como texto, nunca como HTML. Uma mensagem nunca vai para o
    log do servidor.

13. **Notificações** ([0084](0084-notifications-in-the-window.md)).
    `[PROPOSED]` Com o painel fechado, o botão dele mostra a contagem de
    entradas não vistas. Um tipo novo, **"Mesa"** / **"Table"**, manda uma
    notificação do sistema para uma mensagem ou rolagem de outra pessoa,
    desligado de início.

14. **Um interruptor de recurso** ([0103](0103-feature-presets-and-capability-flags.md)).
    `[PROPOSED]` "Mesa" / "Table" no grupo RPG e mesa de Ajustes ›
    Recursos, ligado de início onde os dados estão ligados. Desligado: sem
    painel, sem botão; rolagens nas notas como hoje.

15. **Contrato e testes.** `[PROPOSED]` Comandos novos (entrar numa mesa,
    dizer, limpar) e eventos (uma entrada, uma mudança de presentes, uma
    limpeza) definidos em Rust e gerados para a janela (invariante 3); a
    janela chega à mesa só por eles (regra 1). Testes: o servidor repassa
    uma rolagem à sala da nota e à mesa da pasta, rolada uma vez; uma
    mensagem acima do limite é recusada sem ser lida; um leitor pode rolar;
    só um dono limpa; o corte de "ocultar daqui pra trás" usa a hora do
    servidor; um teste de ponta a ponta com duas janelas no harness do
    navegador.

16. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)).
    `[PROPOSED]` O registro é uma lista com uma região viva educada; uma
    entrada de outra pessoa é anunciada com o nome dela (0088 item 8); o
    campo tem rótulo; uma tecla leva ao campo da mesa; pt-BR e inglês.

## Consequências

- O `verso-server` ganha um canal por pasta ao lado das salas por nota
  (se o item 2 for A), seus limites e testes; o `collab_dice.rs` repassa
  uma rolagem a ele além da sala da nota.
- A janela ganha o painel, o botão, o tipo de notificação e o interruptor;
  o cofre de demonstração ganha uma nota que ensina a mesa, e o "Tour do
  Verso" um cartão ([0058](0058-demo-vault-as-tutorial.md)).
- A 0088 item 4 é revisada para a mesa (item 5), registrado nas revisões
  da 0088 na mesma mudança das decisões desta ADR.
- O banco do servidor ganha o registro da mesa e as fixadas (item 5);
  uma imagem é um arquivo da pasta (item 3).
- Nada é gravado num arquivo da pasta em nome da mesa, a não ser por
  "Adicionar à nota" e uma imagem que quem enviou envia.

## Alternativas descartadas

Oferecidas ao mantenedor em 2026-10-21 e não escolhidas: a sala da nota
ou uma mesa com nome por link como mesa (item 2); só rolagens, sem
mensagens (item 3); só memória, uma retenção no banco do servidor, ou uma
nota da sessão acrescentada a cada entrada (item 5); rolagens secretas
depois numa ADR própria (item 7); uma barra na base ou uma gaveta
flutuante (item 10); só as suas rolagens em 3D (item 11); a imagem no
armazenamento do servidor (item 3); o registro num arquivo dentro da
pasta (item 5); só o dono apaga, limpando (item 6).

## Como foi feito (o servidor, 22/10/2026)

Branch `feat/table-server`. O servidor e o contrato estão feitos; o painel da
janela é de outra branch (`feat/table-panel`). O que está feito é o que os
itens 2, 3, 5, 6, 7, 11 e 12 decidiram; onde o código precisou escolher, a
escolha está listada por último, para o mantenedor confirmar ou mudar.

- **Onde.** `crates/verso-server/src/table.rs` (o canal, os comandos, os
  papéis), `table_look.rs` (a forma fechada de um visual de dados),
  `table_image.rs` (uma imagem para dentro da pasta), `db/table.rs` (o registro,
  esquema 14). `collab_dice.rs` repassa uma rolagem ou um sorteio do oráculo à
  sala da nota como antes e o acrescenta à mesa da pasta, rolado uma vez.
- **Comandos** (a janela só chega à mesa por eles). `table_join(color,
  styles) -> TableJoin`, `table_leave()`, `table_look(color, styles)`,
  `table_history(before, limit) -> TablePage`, `table_say(text) ->
  TableEntry`, `table_send_image(base64) -> TableEntry`, `table_roll(notation,
  source, path, secret, styles) -> TableEntry`, `table_pin(id, pinned)`,
  `table_delete(id)`, `table_clear(keepPinned)`. `collab_roll` ganha `styles`
  e `secret`; `DiceRoll` ganha `styles` (item 11). Os números das entradas são
  strings decimais crescentes; `table_history` pagina por eles.
- **Eventos**, para toda janela na mesa: `table-entry` (um `TableEntry`,
  também para a janela de quem enviou: a janela descarta um número que já
  tem), `table-pinned`, `table-removed`, `table-cleared`, `table-roster` (uma
  lista de `TableMember`, um por conta). `collab-roll` leva o `styles` de quem
  rolou dentro da rolagem.
- **Quem ouve o quê** é decidido em `table.rs` pelos papéis da pasta no
  momento do envio. Uma rolagem secreta ("para o dono") vai inteira a quem
  rolou e aos donos, e aos outros como uma entrada do tipo `secret` (nome e
  hora, sem notação, número nem nota), no evento e em toda página que
  leiam depois; não é dita à sala da nota nem aos leitores da sala. Uma
  rolagem ou sorteio feito dentro de uma nota com blocos secretos, que os
  leitores da pasta não ouvem na sala (0087 item 4), fica guardado na mesa mas
  nunca é dito a um leitor da pasta, nem paginado para ele.
- **Permissões.** Um leitor entra, rola, escreve e fixa; não envia imagem
  (recusado antes de a mensagem ser lida, `inflight.rs`, e de novo no
  comando). Uma imagem é recusada a não ser que seus primeiros bytes sejam de
  PNG, JPEG, WebP ou GIF, e que tenha no máximo 10 MB; é escrita pelo mesmo
  caminho de qualquer arquivo que uma janela cria (`create_file` por
  `folder_run`: a cota da pasta, o registro do sync, o confinamento). Quem
  escreveu apaga a própria mensagem ou imagem, um dono apaga qualquer; uma
  rolagem nunca é apagada uma a uma; só um dono limpa (`keepPinned` mantém os
  fixados por padrão).
- **Limites** (0083). Uma mensagem: no máximo 500 caracteres, texto simples
  (quebra de linha pode, nenhum outro caractere de controle), recusada sem ser
  lida acima de 4 KiB de mensagem; uma imagem: 10 MB, 14 MB de mensagem;
  mensagens e imagens: 5 por segundo, 20 de uma vez por conexão
  (`Server::table_pace`, `pace.rs` com ritmo próprio); rolagens e sorteios,
  também os da sala de uma nota: o ritmo das rotas REST por conexão; 64 janelas
  numa mesa; um `join` responde as últimas 100 entradas e todas as fixadas,
  uma página no máximo 200. Um alvo de fuzz (`fuzz/fuzz_targets/table.rs`,
  sementes em `fuzz/seeds-table/`) lê uma mensagem, um visual, os bytes de uma
  imagem e o tamanho de um comando.
- **Onde não existe.** Uma janela num compartilhamento, ou um celular que
  abriu parte de uma pasta, não tem mesa (a resposta é recusa). O desktop com
  uma pasta só sua não tem: os comandos respondem que a mesa é de servidor, e a
  janela mostra as próprias rolagens. A mesa de uma pasta sincronizada (item 9)
  não foi feita: suas janelas chegam aos stubs locais, que recusam. Um desktop
  servindo a pasta (0096) guarda a mesa: o mesmo código, seus celulares
  liberados em tudo menos limpar.
- **Escolhido no código, para o mantenedor confirmar.** (1) O registro guarda
  no máximo 20 000 entradas por pasta: passando disso, as mais antigas que não
  estão fixadas saem. O item 5 diz sem prazo; este teto existe só para que um
  membro não encha o disco do host com mensagens, e é uma constante
  (`ROWS_MOST`). (2) O lugar dos anexos é a pasta de anexos da pasta quando as
  configurações do Obsidian a nomeiam, senão `attachments`; o arquivo é
  `mesa-<data><hora>-<id>.<ext>`. (3) Imagem de 10 MB. (4) O ritmo: 5 por
  segundo, 20 de uma vez. (5) O roster tem uma entrada por conta, em quantas
  janelas estiver. (6) A entrada leva o id opaco da conta de quem a escreveu
  (`by_id`) para a janela saber quais mensagens são suas; `TableJoin.you` é o
  seu.

## Como foi feito (a janela, fase 2, 22/10/2026)

Branch `feat/table-wire`. A janela chega à mesa do servidor pelo contrato,
como a seção "Como foi feito (o servidor)" acima descreve; está feito o que
os itens 2, 3, 4, 5, 6, 7, 8, 11 e 13 decidiram ou propuseram, em
`app/ui/src/table/` (`server.ts`, a fonte; `join.ts`, quando ela entra;
`compose.ts`, a linha de entrada; `actions.ts`, os menus; `send.ts`, o que se
digita e se confere antes de enviar). Onde o código teve de escolher, a escolha
vem por último, para o mantenedor confirmar ou mudar.

- **Quando entra.** Quando uma pasta é mostrada, a chave muda, o papel muda ou
  um teste diz que a mesa subiu, a janela pede `table_join` (com os dados da
  pessoa e sem cor); a resposta diz se o lado tem mesa para a pasta. Se tem, a
  fonte do servidor substitui a local da fase 1 (`setTableSource`) e os
  registradores locais saem de cena (o servidor conta à janela também as suas
  entradas, guardadas uma vez, pelo número); se não tem, a fonte local fica e
  diz que não é compartilhada.
- **O que o painel ganha** (só na mesa do servidor). Quem está na mesa no alto
  (nome e cor do cursor); as entradas fixadas numa lista própria acima do
  registro; "Ver anteriores" para páginas mais antigas; a linha de entrada
  (mensagem com Enter, `/r` e `/roll` para rolar, um botão de dado para o
  rolador, um botão de imagem e colar ou soltar para imagem, a chave
  "Secreta"); um menu em cada entrada (Fixar ou Desafixar, Adicionar à nota…,
  Apagar) e um menu da mesa para o dono (Limpar a mesa, perguntando antes, com
  "manter as fixadas" marcado); a mensagem como texto, com `[[links]]` para
  notas da pasta como links; a imagem como miniatura do arquivo que abre
  grande; a rolagem "para o dono" mascarada para os outros.
- **Os dados de cada um.** `collab_roll`, `table_roll` e a entrada levam os
  `DiceStyles` da pessoa; a rolagem ouvida cai em 3D no visual de quem rolou e
  os quadradinhos do registro vêm nas cores dele.
- **Notificações.** Um tipo novo, "Mesa", desligado por padrão, levantado por
  mensagem, imagem ou rolagem de outra pessoa enquanto o painel não está na tela.
- **Escolhido no código, para o mantenedor confirmar.** (1) Uma entrada fixada
  aparece só na lista de fixadas, não também no seu lugar no registro. (2) A
  janela guarda no máximo 1000 entradas (a constante `HELD`) na memória;
  "Ver anteriores" pede 50 por vez. (3) A cor de presença é um hash do nome da
  conta, como nas notas, aprendido do elenco da entrada e enviado por
  `table_look` logo depois. (4) A rolagem de outra pessoa cai em 3D pelo evento
  da mesa só quando esta janela não está na sala daquela nota (senão o evento
  da sala já faz cair); a mesma rolagem nunca cai duas vezes. (5) A rolagem da
  própria janela aparece no registro assim que o servidor responde, antes de os
  dados 3D pararem. (6) A chave "Secreta" vale para `/r`, o botão de dado e o
  rolador da paleta; um dado numa nota nunca é secreto. (7) Um dado numa nota
  fora de uma sala ao vivo é rolado por `table_roll` com o caminho da nota, para
  a mesa tê-lo. (8) Um sorteio do oráculo fora de uma sala ao vivo continua só
  da janela (não há comando para isso). (9) As notificações são uma por pasta,
  cada entrada mais nova substituindo a anterior na lista. (10) O endereço de
  uma imagem é pedido como anexo, sem nota de origem e com o caminho relativo à
  pasta; o servidor de verdade tem de confirmar que isso resolve. (11) A janela
  entra de novo quando a pasta é mostrada ou o papel ou a chave muda; entradas
  enviadas enquanto a conexão estava fora do ar não são pedidas de novo até
  então. (12) "Adicionar à nota…" numa imagem escreve `![[attachments/…]]`, o
  caminho do arquivo. (13) A tecla que foca a linha de entrada (item 16) não foi
  feita.

## Situação

Proposta (2026-10-21). Itens 2, 3, 5, 7, 10 e 11 decididos pelo
mantenedor em 2026-10-21 (`~/Projects/person/apps/verso-decisoes-0107-mesa-2026-10-21.md`,
fora do repositório); as três perguntas que essas respostas abriram —
para onde vai uma imagem (item 3), onde o registro é guardado (item 5),
apagar uma entrada (item 6) — decididas no mesmo dia como recomendado.
Os itens marcados `[PROPOSED]` continuam do autor até a aceitação. Não
construída; o mantenedor a pediu "em algum momento". Espera uma leitura
do outro modelo.

Confirmado em 2026-10-22 pelo mantenedor (MS.2): o ritmo (5 mensagens por
segundo, rajada de 20) e o destino das imagens (a pasta de anexos do Obsidian,
senão `attachments/`, com o nome `mesa-<data>-<id>`) ficam como construídos
(*"concordo com o ritmo"*); o teto do registro e o tamanho de imagem viram
ajustes de cada mesa ([0110](0110-a-table-is-a-campaign-folder.md)).
