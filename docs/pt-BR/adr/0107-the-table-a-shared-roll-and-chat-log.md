# ADR 0107 — A mesa: um registro das rolagens e mensagens de todos, ao lado das notas

- Data: 2026-10-21
- Origem: o mantenedor, em 2026-10-21, enquanto os dados 3D ganhavam os
  ajustes de aparência do Rolai: *"já vai pensando aí pq em algum momento
  quero ter uma barra de chat onde as rolagens de todos que estão
  conectados juntos aparecem no chat e tal"*. Pedido como direção, não
  para agora. Escrita pelo Opus 5.5; a ser lida pelo outro modelo antes
  de aceita ([0032](0032-author-and-reviewer-roles.md)).
- Substituída em parte pela [0113](0113-one-access-model-for-a-table.md) (2026-10-24): a emenda de 2026-10-24 do
  item 3, o direito de enviar imagens, virou o direito por jogador *Enviar
  arquivos* (imagens e outros arquivos, no chat e em arquivos que o jogador
  edita). Mantida aqui como história.
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

   `[DECIDED 2026-10-24]` **Emenda: o mestre deixa um jogador enviar
   imagens.** Perguntado se os jogadores deveriam poder enviar imagem ao
   chat, já que todo jogador convidado é leitor e "um leitor, que não grava
   arquivo, não envia imagem", o mantenedor: *"Deveria ser possível dar ou
   não permissão de subir imagem, melhore a tela de acesso, adicione colunas
   de permissão."* Então o mestre dá ou nega, **por jogador e por mesa**, a
   permissão de enviar imagens à mesa. Com ela, o **servidor** grava a
   imagem na pasta de anexos da mesa em nome do jogador (o mesmo lugar e as
   mesmas conferências de um editor: PNG, JPEG, WebP ou GIF pelos bytes,
   nunca SVG, o limite de tamanho da mesa, a cota da pasta, `nosniff`, o
   ritmo); o jogador continua sem gravar arquivo próprio e sem alcançar mais
   nada. Sem ela, nada muda: um leitor não envia imagem. O dono e um editor
   sempre podem. Um jogador que entra por um compartilhamento e um que é
   membro da pasta se comportam igual (0110: um compartilhamento só limita o
   que se vê). **Desligada por padrão** para um jogador (escolhido no código;
   o mestre liga, um jogador ou todos). Retirada, ela vale na hora: a janela
   do jogador é avisada, e o botão de anexar, o colar e o soltar somem.
   Construído: esquema 19 (`campaign_images`), o comando
   `campaign_permission`, o evento `table-images`; veja
   [0110](0110-a-table-is-a-campaign-folder.md) "As built (who may send
   images, 2026-10-24)".

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
  não foi feita aqui: suas janelas chegavam aos stubs locais, que recusam (feita depois: ver "Como foi feito (uma pasta sincronizada, 23/10/2026)" abaixo). Um desktop
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

## Como foi feito (uma pasta sincronizada, 23/10/2026)

Branch `feat/table-in-synced-folder`. O item 9 para uma pasta deste computador
que sincroniza com um UniVerso ([0079](0079-sync-a-local-folder-with-a-server.md)):
o cenário de teste do mantenedor, o mestre no desktop com uma pasta local
sincronizada com um UniVerso, os jogadores no navegador e no app do Windows na
pasta do servidor. Onde o código teve de escolher, a escolha está listada por
último, para o mantenedor confirmar ou mudar.

- **O transporte é a conexão do sync** ([0082](0082-live-co-editing-of-a-synced-folder.md)
  item 2), nunca uma segunda. Os comandos `table_*` da janela (entrar, sair,
  visual, histórico, mensagem, imagem, rolagem, fixar, apagar, limpar) são
  respondidos por `sync::live::command` (`app/src-tauri/src/sync/live.rs`),
  alcançado pelo mesmo `live_forward` que responde aos comandos `collab_*`,
  só para uma janela cuja pasta sincroniza; vão ao servidor como a janela numa
  pasta do servidor os envia, e o servidor não precisou de nada novo: a conexão
  da sessão de dispositivo roda o mesmo `handle` que qualquer outra, com o
  papel da conta na pasta e as mesmas verificações (`tests_live_table.rs`
  tenta os poderes de um leitor e os do dono).
- **Os eventos** (`table-entry`, `-pinned`, `-removed`, `-cleared`, `-roster`)
  que o servidor conta a essa conexão vão às janelas da pasta que entraram na
  mesa, como os eventos de uma sala vão às janelas que seguram a nota. A conexão
  do sync é um membro da mesa, quantas janelas deste app tenham entrado: a
  lista de presentes a tem uma vez, e ela sai da mesa do servidor quando a
  última sai, ou quando o sync pausa.
- **Sem conexão.** Com o link caído ou o sync pausado, um comando `table_*`
  responde `unavailable`, como o de uma sala. A janela então fica com o registro
  local da fase 1, diz **"Mesa indisponível sem conexão"** (ou "…com a
  sincronização pausada") e entra de novo quando o estado do sync diz que o
  link voltou. As rolagens feitas nesse meio-tempo ficam no registro local,
  marcadas como não compartilhadas; não são enviadas quando o link volta. Uma
  conexão nova não está em mesa alguma até suas janelas entrarem de novo; a
  janela o faz na mudança de estado.
- **Uma rolagem feita na nota de uma pasta sincronizada** é do servidor: pela
  sala da nota quando ela está ao vivo, senão `table_roll` com o caminho da
  nota (item 13 da seção da janela acima), a entrada rolada uma vez pelo
  servidor.
- **Qual pasta.** Uma pasta sincronizada é uma pasta local com uma pasta do
  servidor (0079 item 1); a conexão abre essa pasta no servidor, então a mesa
  é a dessa pasta. Uma pasta sincronizada de um compartilhamento
  ([0081](0081-sharing-between-people-on-one-universo.md) item 6) não tem mesa,
  como uma janela num compartilhamento não tem: o servidor recusa e a janela
  fica com o próprio registro.
- **Testado.** `app/src-tauri/src/tests_live_table.rs`, contra um servidor
  real: uma sessão de dispositivo entra, escreve, rola, fixa, apaga, limpa e
  ouve outra conexão; um leitor sincronizado com a pasta está na mesa com os
  poderes de leitor; o link caído, um link novo, a última janela saindo. A
  janela: `app/ui/test/tableReach.test.mjs` (onde a mesa está, pelo estado do
  sync) e `app/ui/e2e/synced-table.spec.mjs` (o harness faz a mesa pelo link
  das salas).
- **Escolhido no código, para o mantenedor confirmar.** (1) As rolagens feitas
  sem conexão não são enviadas quando o link volta: a mesa é do servidor e
  guarda o que foi rolado enquanto a janela estava nela. (2) A conexão do sync
  é um membro da mesa para todas as janelas daquela pasta neste computador.
  (3) Uma janela que entrou antes de o estado dizer pela primeira vez que o sync
  está ligado tenta entrar, o que o host responde pelo estado do link, e entra
  de novo na primeira mudança de estado.

## Decisão (o bloco de rolagem, 22/10/2026)

Decidido pelo mantenedor em 22/10/2026, a opção A das três oferecidas para o
que "adicionar à nota" deve escrever (*"o modo A fica maravilhoso"*): uma
rolagem da Mesa entra numa nota como um **bloco de rolagem**, e entra
arrastando-a do painel, não por um botão "+". Branch `feat/roll-block-drag`.

- **O bloco.** Um bloco de código cercado com a informação `roll`: uma linha de
  cabeçalho (quem, quando, onde como link), a linha da rolagem
  (`1d20+5 → [16] + 5 = 21`) e, para uma tabela sorteada ou um oráculo, uma ou
  duas linhas a mais. A gramática está em `app/ui/src/rollblock/format.ts` e em
  `docs/spec/dialect.md` §6 (uma extensão do Verso: o Obsidian mostra um bloco
  de código; um bloco cercado com uma informação nova não muda o significado de
  nada). O Verso o desenha como um cartão fixo, na Leitura, na Pré-visualização
  ao vivo e no cartão de texto de um board, e nunca rola de novo. A Fonte
  mostra o texto. Um bloco que não lê aparece como código simples; uma linha que
  a gramática não conhece é mantida.
- **O que pode ser bloco.** Rolagens de dados (dados mantidos e descartados,
  modificadores, vários termos, Fudge), rolagens de tabela sorteada (a linha),
  sorteios de oráculo (pergunta, faísca, tabela; a resposta). Uma rolagem
  secreta vista por inteiro é uma rolagem; uma mascarada não tem nada e não pode
  ser arrastada. Uma mensagem mantém a sua linha de citação e uma imagem o seu
  embed ("Adicionar à nota…" como antes).
- **Arrastar.** Uma linha de rolagem se arrasta com o ponteiro (o arrastar e
  soltar do HTML5 não funciona na WKWebView), pelo mesmo mecanismo de uma aba ou
  de uma linha da árvore (`layout/drag.ts`), com o fantasma. Sobre o texto de
  uma nota, Ao vivo e Fonte, um cursor mostra onde o bloco vai cair e a soltura
  é **uma edição comum** (um passo de desfazer), com uma linha em branco de cada
  lado como um bloco pede ([ADR 0061](0061-blocks-in-edit-mode.md)); uma
  soltura dentro de uma cerca, tabela, lista, citação ou do frontmatter cai
  antes ou depois desse bloco. Sobre a Leitura a nota vai para o modo Ao vivo e
  o bloco cai depois do bloco sob o ponteiro. Sobre um board vira um cartão de
  texto com o bloco. Quem só lê uma pasta sincronizada não solta.
- **O menu.** O botão "+" saiu. O menu "…" da entrada (agora também na mesa
  local) mantém "Adicionar à nota…" para o teclado, o leitor de tela e o
  celular: mostra o bloco antes e o acrescenta ao fim da nota escolhida, sobre a
  revisão lida, como antes.
- **As cores dos dados** são expressas: uma rolagem feita com os dados do
  próprio rolador leva uma linha `dados: <corpo> <número> <contorno>` (três
  `#rrggbb`) e as fichas do cartão as usam; o visual do próprio app não escreve
  linha. Textura e material não são escritos.
- **As chaves** são escritas no idioma da janela (`quem`, `who`…) e lidas em
  qualquer um; a hora é a hora local de quem adicionou.
- **Correção.** Depois de `/r 1d20` a linha de entrada guardava o texto quando a
  rolagem demorava ou a queda do 3D falhava: agora ela se esvazia assim que o
  servidor aceita o comando (nunca por cima do que se digitou nesse meio-tempo).

Assumido, para o mantenedor confirmar ou mudar: o idioma das chaves segue a
janela; "Você" é escrito como autor quando a janela não tem nome próprio (como
a linha antiga fazia); o cartão no board tem 340 por 110; soltar na Leitura cai
depois do bloco sob o ponteiro.

## Decisão (o compositor de dados, 23/10/2026)

Pedido pelo mantenedor em 23/10/2026, depois de uma primeira ideia de botões de
dado que rolam no clique, nestas palavras: *"Não, não é pra rolar com click, é
pra compor uma rolagem, igual dá pra fazer com dice tray do Foundry ou o que
temos no Rolai"*. Branch `feat/dice-composer`.

- **O que foi feito.** Uma **bandeja de dados** no painel da Mesa, acima da
  linha de entrada, atrás de um botão (**Compor rolagem**): um clique num dado
  **não** rola, soma esse dado a uma rolagem mostrada como notação; só o botão
  **Rolar** rola. É um port do compositor do Rolai (`apps/web/src/composer.ts`,
  `ComposerBar.tsx`, `RollPanel.tsx`; só leitura) em
  `app/ui/src/table/composer.ts` (o modelo, puro) e `tray.ts` (o DOM): a
  rolagem como fichas removíveis (um `×` tira um tipo inteiro), um botão por
  dado com a contagem e um `−` que tira um, um passo de modificador (−99 a +99),
  **Limpar** e um campo de **notação** editável que é a fonte da verdade. Clicar
  no mesmo dado soma um ao termo (`2d6`); outro dado faz um termo novo
  (`2d6+1d4`); no máximo 100 dados somados todos os termos. Uma notação que os
  botões não sabem mostrar (`4d6kh3`, re-rolagem, dado subtraído) fica como foi
  digitada e rola como digitada; um dado clicado depois recomeça a rolagem a
  partir dele (regra do Rolai). A rolagem continua depois de rolar. **Rolar**
  fica desligado com o campo vazio. Enter no campo rola.
- **Um só caminho para a rolagem.** O botão envia a rolagem como o
  `/r <notação>` a envia (`rollNotation` em `app/ui/src/table/compose.ts`, que
  o `/r` agora também usa): na mesa de um servidor o servidor rola, uma vez, para
  todos, com o botão **Secreta** respeitado (a bandeja avisa e o botão passa a
  dizer *Rolar em segredo*), depois os dados 3D e o som, e a entrada no registro
  para todos; na mesa local (sem servidor) esta janela rola com o mesmo leitor e
  o registro guarda, os dados 3D caindo igual. A bandeja existe nas duas. Nenhum
  segundo caminho, nenhum comando novo do contrato.
- **Dados oferecidos.** O `COMPOSER_DICE` do Rolai sem a carta: d2, d3, d4, d6,
  d8, d10, d12, d20, d66, d100 e dF. A carta (`C`, `2c`) foi omitida porque a
  notação do Verso não tem cartas (`dice/notation.ts`). Também ficaram fora do
  port, porque o Verso não os lê, os blocos de slot do Rolai (`1[2d6]`, que são
  dos perfis dele). Um dado que explode (`1d6!`), que o Verso lê e o compositor
  do Rolai não conhece, fica fora do compositor: digitado, rola como digitado.
- **Rolagens personalizadas** são o campo de notação: qualquer coisa que o leitor
  do Verso aceite (`4d6kh3`, `1d20+5`, `1d6!`). O que ele não lê é dito junto da
  bandeja e nada é rolado.
- **O celular.** A bandeja se recolhe atrás do botão (`aria-expanded`), começa
  recolhida no celular e aberta numa janela maior, lembra a escolha e sempre
  deixa o botão à vista; os dados têm tamanho de toque, seis por linha em
  390 px, e a bandeja rola dentro de si em vez de empurrar o registro para fora.
  O campo de notação ergue a folha acima do teclado como o campo de mensagem. Todo
  botão tem nome (pt-BR e inglês), aceita Tab e Enter e tem foco visível.

Escolhido no código, para o mantenedor confirmar ou mudar: a bandeja começa
aberta numa janela de computador e recolhida no celular, e a escolha fica
guardada no armazenamento do navegador (uma comodidade de quem vê); o campo de
notação é de uma linha, Enter rola; o `d66` é um dado comum de 66 faces, como no
Rolai, e os dados 3D o mostram com o desenho comum de reserva; um modificador sem
dados na rolagem não é escrito (regra do Rolai); a rolagem não é esvaziada ao
rolar; a linha de erro da bandeja, não o registro, diz o que não pôde ser rolado.

**Uma rolagem ouvida diz qual dado foi clicado** (decidido em 23/10/2026,
"Sim" do mantenedor). Uma nota pode ter o mesmo código `dice:` duas vezes, e uma
rolagem ouvida de outra pessoa aparecia no primeiro dado com aquele código. Um
`DiceRoll` agora leva um `occurrence` opcional (`Option<u32>`, a partir de 0):
qual dos dados da nota com aquele código foi clicado. A janela o envia como o
argumento `occurrence` de `collab_roll` e `table_roll`; o servidor só o guarda
se for menor que 1000, senão o descarta, e o repassa na rolagem (o evento da
sala, as rolagens guardadas para quem entra, a entrada da mesa); a janela que o
ouve a mostra no dado daquela posição. Sem ele (janela ou servidor mais antigo,
entrada antiga do registro) o primeiro dado a mostra, como antes. Serve só para
exibição e não se confia nele para mais nada; um valor que não seja um número
de 32 bits não negativo é recusado. Os tipos TypeScript são regenerados do Rust.

**Rolagens salvas (decidido pelo mantenedor, 2026-10-23).** Perguntado se a
Mesa deve guardar rolagens salvas ou nomeadas ("Ataque da Bia"), o mantenedor
respondeu *"Sim"* e, para onde, a opção B, escrita para ele assim: *"Numa nota da
pasta (ex.: `Rolagens.md` ou a própria ficha do personagem): cada linha
`` `dice: 1d20+7` `` com um nome vira um botão na bandeja. Segue a pessoa em
qualquer aparelho, o mestre pode deixar prontas, o Obsidian lê, e quem vê
segue a permissão da nota"*, com a recomendação de *a bandeja lendo da ficha que
a pessoa tem acesso*. Construído: a bandeja tem a linha **Rolagens salvas**.
Uma rolagem salva é uma linha da nota de origem com um código `dice:` em linha
(ADR 0088); o nome é o texto da linha sem o código, sem o marcador de lista,
tarefa, citação ou título e sem os dois-pontos do fim
(``- Ataque da Bia: `dice: 1d20+7` `` é *Ataque da Bia*); uma linha só com o
código leva a notação por nome. Um clique preenche o campo de notação do
compositor e não rola ("não é pra rolar com click, é pra compor"). **Salvar**
acrescenta `` - <nome>: `dice: <notação>` `` à nota pela escrita comum: a sala
quando a nota está ao vivo, senão o arquivo sobre a revisão que foi lida
(invariante 11), recusada sem permissão de escrita (quem só lê não vê o Salvar;
uma recusa é dita na linha de erro da bandeja). A linha lê a nota pelo contrato
(`read_note`; ler nunca a reescreve) e a lê de novo quando a pasta avisa de uma
mudança.

Escolhido no código, para o mantenedor confirmar ou mudar: a nota de origem é,
por padrão numa mesa de campanha, a nota concedida só a esse jogador; para o
mestre, a mesa local ou um jogador sem essa concessão, uma nota que a pessoa
escolhe em **Escolher nota…** (o seletor rápido do app), lembrada por pasta no
armazenamento deste navegador; a escolha da pessoa vale mais que a concessão; a
escrita de um jogador só vai aonde a concessão da nota deixa. Uma linha com
vários códigos dá um botão para cada, nomeado com as palavras antes do primeiro
código e a notação. Uma repetição do mesmo nome e notação é listada uma vez;
código num bloco cercado é código; uma linha de tabela é nomeada pelas células
sem o código. **Salvar** põe a linha no fim da seção "Rolagens" / "Rolls" /
"Saved rolls" da nota, se ela tiver uma, senão no fim da nota, juntando-se a uma
lista final de rolagens e depois de uma linha em branco nos outros casos; um
título nunca é criado. Rolagens de tabela (``dice: [[Nota^id]]``) não são
listadas: a bandeja rola uma notação, e uma rolagem de tabela precisa da tabela
da nota lida, que o cartão de dados guarda (um passo futuro). A entrada do
registro não leva o nome: o caminho da rolagem não tem campo de rótulo e
nenhum foi acrescentado ao contrato.

**A bandeja compacta (23/10/2026).** O mantenedor, com duas capturas de tela, uma do Dice Tray do Foundry VTT e outra da nossa: *"to achando que essa barra de dados ta ocupando muito espaço, vou te mandar como é o dice tray e como estamos hoje"*. A bandeja agora segue a do módulo do Foundry (`mclemente/fvtt-dice-tray`, MIT; lidos: o `README.md`, o `templates/tray.hbs` e o `maps/templates/template.js`): UMA fila, da altura de um botão, logo abaixo do campo de mensagem da Mesa — os dados d4 d6 d8 d10 d12 d20 como botões pequenos só com ícone, um campo numérico para o modificador, KH e KL e um botão de dado. A rolagem é escrita **no próprio campo de mensagem** como `/r 2d6+1d4+3` e o campo é a fonte da verdade: um clique num dado edita essa linha, digitar nela muda as bolinhas, uma fórmula que a fila não sabe mostrar (`4d6kh3`) fica como foi digitada; o botão do dado envia exatamente como o Enter, então continua havendo um só caminho para a rolagem. O que mudou em relação ao layout portado do Rolai do trecho acima: o botão "Compor rolagem" e o seu estado dobrado, a linha de dica, a grade de onze botões com rótulo, as fichas da rolagem, o passo Mod, o Limpar, o campo de notação separado e o botão Rolar saíram; os dados mantêm as formas do Rolai (`dieIcon.ts`), agora com uns 21 px e uma bolinha de contagem. Copiado do Foundry: o clique esquerdo soma um dado e o direito tira um; uma bolinha com a contagem em cada dado; um campo numérico para o modificador que a roda do mouse move; o d100 fora da fila (o Foundry o guarda numa gaveta do d10); KH e KL como o `updateDiceKeep` os faz, em todo termo numerado — um termo sem "keep" ganha mais um dado (nunca passa de dois) e mantém um, o mesmo botão de novo desfaz, o outro troca; sem dados não fazem nada. O Foundry escreve `2d20kh`; o leitor do Verso quer a contagem (`dice/notation.ts`), então a fila escreve `2d20kh1`. As rolagens salvas (parágrafos anteriores) mantêm o comportamento e passam para trás de um só botão de **marcador** da fila, que abre um painel com o botão da nota de origem, a lista, o campo de nome e o **Salvar**; um clique numa rolagem salva escreve `/r <notação>` no campo e não rola.

Escolhido no código, para o mantenedor confirmar ou mudar. (1) KH e KL são dois botões lado a lado, como na bandeja do Foundry (o pedido dizia "um botão KH/KL"), cada um com `aria-pressed`. (2) Os outros dados (d2, d3, d66, d100, dF) ficam atrás de um botão **⋯**, com um ponto enquanto algum deles está na rolagem. (3) Tirar um dado: botão direito, `Shift+Enter`, `Delete` ou `Backspace` num dado com o foco, ou o dedo seguro (500 ms) no toque. (4) Um modificador escolhido enquanto o campo não tem dados fica no campo numérico e entra com o primeiro dado somado; esvaziar o campo o zera. (5) Um clique num dado com uma mensagem comum no campo deixa a mensagem como está (como no Foundry); com uma fórmula que a fila não lê, a rolagem recomeça a partir do dado clicado (a regra de antes). (6) A mesa local, que não tinha campo de mensagem, passa a mostrar o campo e a fila; sem servidor ela só rola — uma mensagem comum ali é recusada na linha de erro do campo, com o texto mantido. (7) As setas do campo numérico ficam escondidas para poupar largura; as teclas de seta e a roda o movem. (8) No celular a fila mantém alvos de 40 px de altura e rola para o lado dentro de si se não couber; o botão do dado fica ao lado dela. (9) Uma linha `/r` no campo vale pela primeira linha; as linhas depois dela são mantidas pela fila e ignoradas pela rolagem.

**O campo de mensagem maior (23/10/2026).** O mantenedor: *"Coloca a caixa de digitação maior, sendo possível apertar shift+enter pra quebrar linha e tal"*. O campo de mensagem da Mesa começa com três linhas (duas no celular), cresce com o texto até oito linhas e então rola; `Shift+Enter` insere uma quebra de linha, `Enter` envia, e `Enter` durante a composição de um método de entrada (IME) só confirma a composição. O registro já mostra as quebras de linha de uma mensagem (`white-space: pre-wrap`) e o servidor aceita a quebra de linha numa mensagem (só os outros caracteres de controle são recusados, `table.rs`) dentro do mesmo limite de 500 caracteres, então o contrato não muda. No celular a folha continua subindo acima do teclado enquanto o campo o tem.

**O pé inteiro do painel virou uma caixa (23/10/2026).** O mantenedor, com uma captura do pé do painel: *"toda essa parte de bandeja de dados está muito ruim. Eu vi que você colocou ali uma parte de secreto, tem um botão de imagem, outro botão de rolar dado. Toda essa parte precisa ser remanejada, de preferência copiando a mesma experiência que tem no Foundry VTT ou no Roll20 ou nesses outros VTTs. Porque quando eu falei de colar a imagem, é literalmente a pessoa copia ou tira um print, clica no botão direito colar, ou segura o clique no celular e clica em colar, ou aperta Ctrl V, Command V."* e *"tem que revisar isso tudo ai da imagem"*. O pé agora é UM compositor, como o chat de um VTT: a caixa de mensagem de várias linhas, a fila de dados logo abaixo e nada mais. Saíram: a fila separada de botões de imagem, de rolador e **Secreta** (o diálogo do rolador continua na paleta de comandos, **Rolar dados…**) e as linhas de dica. Quem vê a rolagem é o seletor de modo de rolagem do Foundry, na fila de dados (o chat do núcleo do Foundry tem um: Pública / Mestre privada / Cega / Para si); o Verso tem dois modos, então é um pequeno seletor **Pública / Secreta**, a mesma chave do botão antigo (a rolagem para os donos da pasta), só na mesa de um servidor; o botão do dado passa a dizer *Rolar em segredo*. **A caixa e a fila (revisto no mesmo dia).** Nada pode ficar além da borda, então os controles do próprio compositor foram para uma pequena barra na borda de baixo da caixa (clipe, marcador das rolagens salvas, um seletor compacto **Pública / Secreta** com um cadeado e o Enviar à direita), e a fila de dados fica com os dados, o modificador, KH / KL e o botão de rolar. O que não cabe na fila vai para o popover do "⋯", numa ordem fixa: primeiro d2, d3, d66, d100 e dF (sempre ali), depois KH / KL, depois o modificador; a fila é medida com um `ResizeObserver`, os pontinhos mostram um ponto enquanto algo dentro deles está valendo, e nada é cortado nem rola para o lado em 260, 320, 390 ou 1280 px. O texto digitado começa na primeira linha da caixa.

**Imagens** se colam: `Ctrl+V` / `⌘V` com uma imagem copiada ou um print, botão direito › Colar, ou o dedo seguro › Colar no celular, na caixa (tudo termina no evento `paste` do navegador com a imagem na área de transferência; a caixa é um `textarea` comum, e nem o menu de contexto do app, que só troca o menu das figuras já em notas, `main.ts`, nem o menu do dedo seguro, que deixa os campos para o sistema, `touch.ts`, tira o menu dela), ou solta sobre o painel, ou escolhida num pequeno clipe na caixa (escolhido no código, para celulares e galerias). Uma imagem colada não vai de uma vez: espera na caixa como uma miniatura com um **×**; **Enter** (ou o botão de enviar) envia as imagens e depois o texto. O contrato manda uma imagem e uma mensagem como dois comandos (`table_send_image`, `table_say`), então são duas linhas do registro, as imagens primeiro; sem mudança de contrato. As conferências de 10 MB e de tipo e as suas mensagens são as mesmas, agora feitas ao colar; a que o servidor recusa fica na caixa para outra tentativa. Um GIF vai como está, então continua animado no registro. Leitor não tem clipe e a colagem não é tomada. Escolhido no código, para o mantenedor confirmar: um pequeno botão de enviar (um aviãozinho) fica ao lado da caixa, porque o teclado do celular não tem Shift+Enter; o contador dos 500 caracteres continua como era. O que foi lido: o módulo Dice Tray do Foundry (veja acima); o chat do núcleo do Foundry e o do Roll20 eu conheço de usar, não do código — o do Roll20 é fechado, e o comportamento copiado é o visível (uma caixa, o modo de rolagem como seletor, Enter envia).

**O pé testado no app de verdade (2026-10-23).** O mantenedor testou o painel da Mesa no app do Mac e disse quatro coisas. (1) Com uma captura do seletor Pública / Secreta na barra da caixa, um anel de foco roxo grosso e o ícone do cadeado em cima do texto: *"na barra aqui do chat isso ta meio estranho."* O modo agora é um botão pequeno (ícone e rótulo lado a lado, sem sobrepor nem cortar, o anel de foco do próprio app, a altura dos outros controles da barra) que abre o menu do app com os dois modos, com setas, Enter e Escape; um select nativo é desenhado diferente em cada webview. (2) *"a lista de pessoas online nao fica legal assim, coloca apenas um icone com numero de pessoas online, ai se parar o mouse em cima, dar pra ver"*: a linha de quem está na mesa vira um ícone de pessoas com a contagem; passar o mouse mostra os nomes com as cores dos cursores, um toque ou Enter no toque e no teclado abre a mesma lista, Escape fecha; o leitor de tela lê "N pessoas na mesa: Ana, Bruno". (3) *"pra que tem icone de dado no canto inferior direito ja tem botão pra enviar mensagem que faz o msm? talvez dê até pra usar esse botão pra outra coisa, mas nao isso"*: o botão de rolar da fila de dados foi retirado (Enviar já envia a linha `/r`); nenhum uso novo foi inventado para ele. (4) *"o mestre deveria ter poder de deletar uma rolagem."* Isto **substitui** o "uma rolagem não é apagada uma a uma" do item 6 e a linha acima, "uma rolagem nunca é apagada uma a uma", **para os donos da pasta**: um dono (o mestre) pode apagar uma rolagem, com a mesma confirmação que o menu já tem; um jogador continua sem poder apagar uma rolagem (o jogador apaga as próprias mensagens e imagens, como antes). O servidor impõe (`table_delete` recusa uma rolagem se o papel não for dono); a janela oferece **Apagar** numa rolagem só ao dono.

## Decisão (um registro por mesa, 2026-10-23)

O mantenedor, 2026-10-23: *"o chat deve ser 1 por mesa, adapte e refaça o que
precisar"*. Como construído até então, o registro da Mesa (rolagens, mensagens,
imagens, fixadas, quem está nela, os limites) era um por **pasta aberta do
servidor**: com a pasta toda aberta e duas mesas em subpastas, as entradas das
duas mesas caíam em um registro só (o item 1 do
[0110](0110-a-table-is-a-campaign-folder.md) diz que uma pasta pode ter várias
mesas). Agora é um por **mesa**.

- **A identidade de uma mesa** é (pasta do servidor, a raiz da mesa dentro
  dela); a raiz é `""` para a própria pasta. Uma pasta do servidor sem mesa de
  campanha mantém a mesa única, da pasta toda, da primeira forma deste ADR: quem
  abriu a pasta divide um registro só; é a mesa da raiz daquela pasta.
- **O contrato.** Todo comando `table_*` recebe um `table` opcional (a raiz da
  mesa, relativa à pasta). Sem nome vale a mesa padrão da pasta — a de raiz
  mais curta, senão a pasta — então uma janela antiga continua funcionando. O nome
  é conferido: relativo, sem `..`, sem barra invertida, e uma mesa de verdade da
  pasta (maiúsculas ignoradas, como as mesas são procuradas), ou `""` numa pasta
  sem mesa; o resto é recusado ("no such table"). Entradas, fixadas, apagados e
  limpezas são procurados **na mesa nomeada**, então uma entrada de uma mesa não
  é entrada de outra. As respostas e os eventos levam a mesa (`TableEntry.table`,
  `TableJoin.table`, `TablePinned`, `TableRemoved`, `TableCleared` e o novo
  `TableRoster { table, members }` do `table-roster`); a janela só ouve as mesas
  em que entrou e descarta o que se diz de outra.
- **Presença.** Uma janela pode estar em várias mesas de uma pasta ao mesmo tempo
  (a conexão de sincronização de um desktop é uma janela só para todas as janelas
  daquele app); o painel da Mesa está em uma: sai de uma mesa e entra na outra
  quando a nota ativa passa para outra mesa. A lista de cada mesa é a dela.
- **Para qual mesa vai uma rolagem.** Uma rolagem ou um sorteio de oráculo feito
  na sala de uma nota vai para a mesa que contém a nota (a mais funda); uma nota
  fora de toda mesa vai para a mesa padrão da pasta. Uma rolagem feita no painel
  vai para a do painel.
- **A janela.** O painel segue a mesa da nota ativa (a regra do selo,
  `tableChip.ts`: a mesa mais próxima subindo pelo caminho da nota), dá o nome
  dela no alto (*Mesa: Cripta*) e, sem nota que diga qual, mostra a última mesa
  escolhida na pasta ou — a pasta tem várias e nenhuma foi escolhida — uma lista
  das mesas. Um botão pequeno ao lado do nome troca de mesa a qualquer momento.
  Uma pasta sem mesa é o painel de sempre. O painel está em uma mesa por vez,
  então o contador de novidades é o daquela mesa: o que outra mesa diz não é
  ouvido até o painel estar nela (escolhido no código, para o mantenedor
  confirmar ou mudar).
- **Limites e regras por mesa.** O teto do registro (`campaigns.log_max`) e o
  limite de imagem (`image_max`) são da própria mesa; as regras de apagar e de
  limpar dos papéis valem dentro da mesa.
- **Jogadores.** Um jogador convidado para uma mesa de subpasta é uma janela num
  compartilhamento com raiz nessa mesa, e recebe o canal dessa mesa (e só dele):
  lê, escreve e rola ali, e o dono lê o mesmo registro pela pasta toda; ele não
  lê nem escreve em outra mesa. Um compartilhamento que não é mesa continua sem
  canal. Veja o [0110](0110-a-table-is-a-campaign-folder.md) "Como foi construído
  (uma conversa por mesa, 2026-10-23)".
- **A pasta sincronizada** (item 9): o mesmo canal por mesa pelo enlace da
  sincronização; o host lembra em que mesa está cada janela do app e encaminha os
  eventos do servidor pela mesa que eles carregam.
- **Migração.** O esquema 16 acrescenta a mesa a cada entrada: as entradas
  guardadas antes pertencem à mesa de raiz mais curta da pasta quando ela tem
  mesas (a de cujos números sempre dependeram), senão à pasta. Nada é apagado; o
  resto das regras (uma mesa feita, desfeita, renomeada) está no
  [0110](0110-a-table-is-a-campaign-folder.md) "Como foi construído (uma conversa
  por mesa, 2026-10-23)".

Isto **substitui** as frases acima e nas seções "Como foi feito" que tornam o
registro um por pasta, e o "a mesa de raiz mais curta da pasta dá ao registro da
pasta os seus números" do 0110 (cada mesa tem os seus números agora).

**Duas mudanças pequenas do painel (2026-10-23, o mantenedor).** "Rolar dados…" (o diálogo do rolador) volta a ser um item da gaveta "⋯" da fila de dados, depois de ficar só na paleta de comandos; e em larguras estreitas (uma linha de topo de até 420 px) "Ocultar daqui pra trás" é um botão só de ícone (nome e dica mantidos) para que a lista de pessoas, o botão da janela da Mesa, ocultar e o menu caibam em uma linha a 260 px, com o rótulo aparecendo quando há espaço.

## Situação

*Substituída em parte (2026-10-24) pela [0113](0113-one-access-model-for-a-table.md):* o direito de imagens da emenda
do item 3 agora é *Enviar arquivos*.

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

*Revisado (2026-10-22, [0110](0110-a-table-is-a-campaign-folder.md)):* o teto
do registro (20.000 entradas, "Escolhido no código" 1) e o limite de imagem
(10 MB) agora são **por mesa**, definidos pelo mestre da mesa entre
1.000–200.000 entradas e 1–30 MB, com esses valores como padrão; as linhas da
mesa seguem o véu da 0110 para um leitor (a nota em que uma rolagem foi feita
não é dita quando está oculta, uma imagem da mesa é vista por todos nela).

*Corrigido (2026-10-23, app real do Mac):* "eu cliquei numa rolagem e arrastei para uma nota, funcionou como deveria, mas ele selecionou o texto no chat e no verso". Um arrasto por ponteiro (item 5, "Levar uma rolagem para uma nota") agora segura a seleção enquanto dura: o texto selecionado pelo clique é limpo, uma nova seleção é recusada (`selectstart`, e `user-select: none` na janela) até soltar, e selecionar volta a funcionar depois. No mesmo dia: "eu tive que trocar a aba da barra lateral pra conseguir redimensionar. aumenta um pouco a largura inicial dessa barra" — o divisor da barra direita não começa mais uma seleção de texto pelo registro (apertá-lo agora segura a seleção, como o arrasto de uma rolagem, e o arrasto termina por onde o ponteiro for), a largura da barra direita agora é guardada como a da esquerda, e o padrão passa de 260 px para cerca de 320 px (no máximo um terço da janela); uma largura guardada vence.

**O topo do painel em uma linha, um som e dados que mantêm as cores de quem rolou (2026-10-23, segunda rodada de feedback).** O mantenedor testou os apps reais. (1) Com uma captura do topo da Mesa: *"no topo do chat ta com espaço mal aproveitado, 3 elementos cada um numa linha sendo que cabe um na frente do outro."* O ícone de quem está na mesa, o botão **Abrir a janela da Mesa** do dono e **Ocultar daqui pra trás** com o menu "⋯" agora dividem UMA linha: quem está na mesa à esquerda, o botão da janela ao lado (o ícone sempre, as palavras enquanto o painel for mais largo que uns 360 px, o nome acessível sempre), ocultar e o menu empurrados para a direita; a linha quebra em 260 px em vez de transbordar. O botão **Tornar esta pasta uma mesa** (um chamado para agir, mostrado uma vez) fica na própria linha, abaixo. (2) *"Mensagens no chat deveriam notificar de alguma forma, com som configurável."* A mensagem, a imagem ou a rolagem de outra pessoa toca um som curto na janela: **Ajustes › Notificações › Som da Mesa** (Desligado, Suave, Sino, Estalo; **Suave por padrão** — mensagens de pessoas são para o que o som serve, e ele nunca toca sem que um gesto tenha liberado o áudio da página) e um **volume** (0-100, padrão 60); ao escolher, o som toca uma vez. Os sons são sintetizados com WebAudio a partir de poucas notas (sem arquivo, sem dependência). Decidido e guardado em `table/chime.ts`: nunca para o que é seu nem para uma rolagem secreta mascarada; não enquanto a pessoa escreve na caixa da Mesa com a janela na frente; uma rolagem cujos dados 3D caem não toca (os dados têm a sua chave de som); a janela estar na frente ou não é indiferente, já que a notificação do sistema do item 9 da [0084](0084-notifications-in-the-window.md) é a que espera a janela ficar atrás e continua como era. Usa o contexto de áudio do som dos dados (feito dentro de um gesto; sem contexto rodando não há som, nunca um som atrasado). (3) Com uma captura: *"meu dado ta configurado roxo, pq no bruno ta vermelho?"* Os dados do mestre caíam roxos no Mac e vermelhos na janela do jogador no Windows. Causa: o estilo padrão e o preset "Do Verso" são `app: true`, isto é, *as três cores seguem a paleta do app na hora da rolagem*; a marca ia ao servidor com a rolagem e a janela que ouve a resolvia no **seu** tema (`--seal`), então cada pessoa via os dados na cor do seu app, não na de quem rolou (o servidor e o lado que ouve repassavam o visual direito; o visual em si não era uma cor). A janela agora transforma uma paleta seguida nas cores do tema de quem rola antes de a rolagem sair (`wireStyles`, usado pelo `collab_roll` da sala da nota e pelo join, a rolagem e o look da mesa), e o item 11 vale para qualquer visual; um estilo com cores próprias nunca foi afetado. Os dados da própria pessoa continuam seguindo o seu tema; não há opção para impor o próprio visual às rolagens dos outros (a chave existente só desliga as quedas 3D dos outros). Sem mudança de contrato.
