# Auditoria de permissões — o acesso de uma mesa, 2026-10-24 (`feat/rpg-tools` em `6919e533`)

- Data: 2026-10-24
- Por quê: o teste ao vivo de uma mesa feito pelo mantenedor nesse dia
  (citado na [ADR 0113](../adr/0113-one-access-model-for-a-table.md),
  Contexto): dois menus em dois cantos, nenhum jeito de liberar um board para
  edição, e "Você só lê esta pasta" ao soltar numa nota que ele podia editar.
- O quê: uma auditoria só-leitura de todo conceito de permissão do servidor, da
  janela e do host do desktop, em `6919e533`. Nada foi editado. Esta página é o
  mapa da auditoria (parte 1); a proposta dela virou a
  [ADR 0113](../adr/0113-one-access-model-for-a-table.md), aceita no mesmo dia
  com as respostas do mantenedor, e não é repetida aqui.
- Caminhos: servidor = `crates/verso-server/src/`, janela = `app/ui/src/`, host
  = `app/src-tauri/src/`, capturas = `docs/media/test-runs/2026-10-23-mesa/`.
- Sob revisão: a [ADR 0110](../adr/0110-a-table-is-a-campaign-folder.md) como
  construída (fase 1 e suas emendas de 2026-10-23 e 2026-10-24), as imagens do
  item 3 da [ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md), a
  [ADR 0081](../adr/0081-sharing-between-people-on-one-universo.md), a
  [ADR 0087](../adr/0087-secret-blocks-hidden-from-readers.md), o item 11 da
  [ADR 0076](../adr/0076-the-window-on-every-screen.md).

## 1. Todo conceito de permissão hoje

| # | Conceito | Guardado | Servidor decide | Janela decide | Host do desktop | ADR |
|---|---|---|---|---|---|---|
| 1 | **Papel na pasta** dono / editor / leitor | `grants (folder, account, role)` db.rs:180 | `access::role` access.rs:17; `at_least` access.rs:47; `role_here` rpc.rs:885 | só como `can("write")` das capabilities (can.ts:62 `canWrite`) | a janela remota pega o `write` do servidor (remote.rs:47-73, `with_app_abilities`) | 0074 item 6 |
| 2 | **Compartilhamento** (papel num caminho, editor/leitor) | `shares`, `share_grants` db.rs:31-45 | `shares::scope_here`; a maior permissão que cobre; ramo de escopo de `folder_command` rpc.rs:938-1069 | `mayShare()` = "share_list não falhou" shares.ts:33-40 (dono inferido de um erro) | `shares.rs` repassa | 0081 itens 1, 2, 14 |
| 3 | **Teto da credencial**: PAT leitura/escrita, link de leitura, papel do celular | `tokens`, `token_folders`; `Who.phone` | `Who::reaches` auth.rs:88 (celular → role.writes(); token → bit de escrita); `access::role` access.rs:34 (`role.min(Reader)`) e :38-42 (celular `min(Editor)`); `table::acting` table.rs:632 (celular de novo); `Client.token_write` (celular embutido, "imagens" da 0110) | invisível: só "sem `write` nas capabilities" | — | 0074 item 8, 0096 item 12, 0105 |
| 4 | **Visitante de link de leitura** | `read_links` | `visit::visitor` visit.rs:315 — um token só-leitura da conta `link:<id>`, e o véu o trata como jogador | janela só-leitura | — | 0105 |
| 5 | **Papel do celular pareado** leitor/editor ("Pode editar") | config do servidor local | `access::role` access.rs:27-42; `game_master` recusa celulares campaign_cmds.rs:76 | `errPhoneReads` strings.ts:264 | `local_server.rs` | 0096 itens 12, 15 |
| 6 | **Quem é jogador** de uma mesa | derivado, não guardado | `campaign::player` campaign.rs:666 = "janela que só lê uma pasta com mesa" (via `readers::reads_only` readers.rs:107); `players_of` campaign_cmds.rs:536 = leitores da pasta ou de um compartilhamento na mesa, acima ou dentro dela; editores nunca | `campaign().viewer === "player"` (status) | pelo link da sincronização | 0110 "Quem é jogador" |
| 7 | **Quem é o mestre** | derivado | para comandos: `game_master` campaign_cmds.rs:64 = dono, não por compartilhamento, não celular, credencial de escrita. Para o véu: dono **e editores** (campaign.rs:675 `reads_only`). Para rolagens secretas: só o dono table.rs:165. Para apagar rolagens / limpar: só o dono table.rs:899-903, :921. Para imagens: dono ou editor table.rs:1014. Para o status: dono → `"owner"`, editor → `"none"` campaign_cmds.rs:616, :725 | `mayShare()`, `campaign().viewer === "owner"` | o link da sincronização responde como dono | 0110 item 15, "escolhido no código (2)"; 0107 |
| 8 | **Mesa existe / aberta-fechada** | `campaigns (folder, root, open, log_max, image_max)` db/campaign.rs:26 | `campaign::closed_for` campaign.rs:691, `guard` :703 (só jogadores) | chip, cartão, aviso (tableChip.ts, tableCard.ts, folderView) | `SyncStatus.problem = table_closed` | 0110 item 3 (MC.1 = A) |
| 9 | **Público da nota** oculta / mesa / jogadores | `campaign_notes.released` db/campaign.rs:38 + `campaign_audience (folder, path, account)` db/campaign.rs:59 | `Veil::released` campaign.rs:131; `hides` :263; `hides_note_from` :197; `campaign_serve::judge` campaign_serve.rs:262 | `noteAudience` campaign.ts:66; `hiddenFromTable` :58; `audienceItems` :210; noteAccess.ts | — | 0110 item 4 + emenda 2026-10-23 |
| 10 | **Permissão de edição por nota** nenhuma / grupo / um jogador | `campaign_notes.grant_kind, grant_account` db/campaign.rs:40-41 | `Veil::may_edit` campaign.rs:239; `granted_write` campaign.rs:752 (só `write_note`/`write_text`, só `.md`); sala: rpc_collab.rs:64-72; sincronização: `group_put` campaign.rs:783 (**só grupo**) sync.rs:619-626 | `mayEditGranted` campaign.ts:90; `readOnly` do editor note.ts:991 | sync_put recusado para permissão de um jogador | 0110 item 5 |
| 11 | **Acoplamento público ↔ permissão** | efeitos colaterais no banco | permissão ao grupo → liberada à mesa campaign_cmds.rs:520-524; permissão a um jogador → entra no público; estreitar o público derruba permissões db/campaign.rs:512-523 | dito só na linha de status (`alsoSees`) campaign.ts:195-203 | — | 0110 "Como foi construído (público)" |
| 12 | **Liberar / dar edição em boards** | liberar: as mesmas linhas das notas (`note_like` inclui `.canvas`/`.base` campaign.rs:57); edição: **recusada** | `grant` recusa não-`.md` campaign_cmds.rs:489; sala do board recusada a todo leitor collab.rs:444 | o menu oferece só "Liberar para…" num board (campaign.ts:257, teste de `.md`); board `readOnly = !canWrite()` board.ts:671, :242; sem indicador de acesso (noteAccess.ts:167 só `.md`) | — | 0110 "Como foi construído": "boards não recebem permissão na fase 1"; 0090 item 5 |
| 13 | **Nome secreto** | `campaign_notes.secret_name` | `campaign_text.rs` (▒▒▒▒) | linha de menu campaign.ts:258 | — | 0110 item 7 |
| 14 | **Blocos secretos / projeção para leitores** | no texto da nota (`> [!secret]`) | leitores recebem a projeção (`dispatch_reader`, rpc.rs:1166-1170); quem tem permissão lê inteiro (0110 "escolhido (3)"); nós de texto de boards 0087 rev. 2026-10-15 | `secret/view.ts:74` alternância só se `canWrite()` | — | 0087 itens 2-5 |
| 15 | **Permissão de imagens** (enviar ao chat) | `campaign_images (folder, root, account)` db/campaign.rs:110 | `may_send_images` table.rs:1001; `images_allowed` :1022; conjunto pré-parse em `inflight.rs`; `table_send_image` table.rs:796-800 | `canSendImage` (table/server.ts, de `TableJoin.images`); switch em campaignPlayers.ts | — | 0107 item 3 emendado; 0110 "quem pode enviar imagens" |
| 16 | **Rolagens secretas** | `table_log.secret` | mascarada a menos que seja quem rolou ou o **dono** table.rs:161-165 | botão do modo de rolagem | — | 0107 |
| 17 | **Cadeado / aviso do leitor** | — | — | `folderLock` screen/frame.ts:150-156; `readerAttempt` / `guard` / `refused` readerNotice.ts:35-85; chamadores keys.ts:226, :338, files.ts:54, tree/prompts.ts:19-138, layout/drag.ts:317, note.ts:589, note/editing.ts:106, textfile.ts:129 | — | emenda da 0076 de 2026-10-23 |
| 18 | **Leitor sincronizado** (desktop, cópia local de uma pasta do servidor em que se lê) | estado da sincronização | recusa de `sync_put` sync.rs:625 | **três cópias** da mesma marca: `readsSynced` can.ts:69-77, `syncedReader` collab.ts:60, `syncedReader` folderLayer.ts:85-99; `canChange()` can.ts:82 | `l.role == "reader"` sync.rs:893 (envios pulados, "mudanças aqui") | 0079 item 1 |
| 19 | **MCP / agentes** | — | o `verso mcp` local não grava nada (verso-cli/src/mcp.rs:72); num servidor só via PAT (linha 3) | `can("agents")` | — | 0066, 0074 item 8 |
| 20 | **Harness** (e2e) | — | — | cópia TS das regras: harness/campaign.ts:187-199 (permissão), :260-266 (estreitamento), :314 (mayEdit); harness/table.ts:220 (imagens) | — | — |

Predicados da janela, por número de pontos de chamada (sem o harness):
`canWrite()` 35, `viewer ===` 16, `mayShare()` 13, `readable()` 12,
`oracleNotWritable` 11, `canSendImage` 8, `canChange()` 7, `mayEditGranted(` 6,
`can("write")` 5, `readsSynced()` 2 — cerca de **115 pontos** respondendo "posso
mexer nisto?" a partir de **sete** fontes diferentes (capabilities, um evento de
sincronização ×3, o status da campanha, o sucesso da lista de
compartilhamentos, a entrada na mesa, a camada da pasta).

## 2. Onde dois deles respondem a mesma pergunta de jeitos diferentes

**C1 — "A Ana pode escrever na ficha dela?" tem quatro respostas.**
- Servidor, comando da janela: sim (`granted_write` campaign.rs:752,
  rpc.rs:906-911).
- Servidor, sala: sim (rpc_collab.rs:64-72).
- Servidor, sincronização do aparelho: **não**, a menos que a permissão seja do
  grupo (`group_put` campaign.rs:783, sync.rs:619-626).
- Editor da janela: sim (note.ts:991 `canWrite() || mayEditGranted`).
- Arrastar e soltar, colar, menu de imagem da janela: **não** — `canChange()`
  (no nível da pasta) em layout/drag.ts:316, files.ts:52 (`readable`) usado por
  note/editing.ts:286, :352. **É o "Você só lê esta pasta" numa nota com
  permissão**: a frase é `st.readOnly` (screen/strings.ts:127), mostrada por
  `readerAttempt`, que drag.ts:317 e files.ts:54 chamam sem perguntar pela nota.

**C2 — "A Bia é mestre?"** Dono e editores para o véu (vê todas as notas
ocultas), só o dono para rodar a mesa, para rolagens secretas, para apagar
rolagens; dono ou editor para imagens; o status diz `"none"` a um editor
(campaign_cmds.rs:725), então um editor não tem chip, selo nem popover da mesa
(campaign.ts:128 `tableMark`).

**C3 — "Um jogador pode editar este board?"** Liberar: sim, as mesmas linhas das
notas. Editar: recusado pelo menu (campaign.ts:257), pelo comando do servidor
(campaign_cmds.rs:489), pelo caminho de escrita (`is_note` readers.rs:130 em
`granted_write`), pela sala do board (collab.rs:444), e a folha do board ignora
permissões (board.ts:671). O único jeito que sobra — fazer do jogador **editor**
da pasta ou de um compartilhamento — o transforma sem aviso num co-mestre (C2)
que vê toda nota oculta e todo bloco secreto, o tira de `players_of` e derruba a
permissão de imagens dele. O diálogo de compartilhar não diz nada sobre mesas
(shareStrings.ts não tem palavra de mesa).

**C4 — "Quem pode editar esta nota?" tem um valor só, "quem a vê" é um
conjunto.** `grant_kind/grant_account` guarda um jogador ou o grupo inteiro
(db/campaign.rs:40-41). Escolher o Bruno em "Editável por" substitui a Ana. A
mesma lista de jogadores é seleção múltipla em "Liberar para…"
(campaign.ts:210-221) e seleção única em "Editável por" (campaign.ts:260-267).

**C5 — As duas listas mudam uma à outra.** Dar edição acrescenta ao público
(campaign_cmds.rs:520-524 para o grupo; servidor e harness para um jogador);
estreitar o público derruba permissões (db/campaign.rs:512-523). O menu não
mostra nenhuma das consequências antes que aconteça.

**C6 — "É um jogador?" é decidido pela credencial, não pela pessoa.**
`campaign::player` (campaign.rs:666-677) e `guard` (:703-727) usam
`role.writes() && token_write`. Então o próprio celular do dono pareado como
leitor, ou o PAT só-leitura do dono, é *jogador da própria mesa*: vê só as notas
de toda a mesa e é barrado numa mesa fechada.

**C7 — Um leitor de pasta sincronizada no desktop digita mas não solta.**
note.ts:991 e board.ts:671 usam `canWrite()` (verdadeiro no desktop), arrastar,
colar e menus usam `canChange()` (falso quando `readsSynced`). A nota é
editável; a edição fica local como uma "mudança aqui" (dialogs/sync.ts:61); uma
rolagem solta na mesma nota é recusada.

**C8 — "Dono" na janela é inferido de um erro.** `mayShare()` é verdadeiro quando
`share_list` responde ok (shares.ts:38-40); o status da campanha tem o seu
próprio `viewer` (campaign.ts:31); as capabilities têm `write`. Três fontes para
"quem sou eu aqui".

**C9 — O estreitamento do celular está escrito quatro vezes**:
access.rs:38-42, auth.rs:89-91, table.rs:632 e `Client.token_write` ("Um celular
pareado como leitor é leitor para o servidor", da 0110).

**C10 — O harness é uma quarta implementação** (harness/campaign.ts,
harness/table.ts). Toda mudança de regra tem de ser feita no Rust, na janela e no
harness.

## 3. Toda superfície onde o acesso aparece ou muda

| Superfície | Arquivo | Mostra | Muda | Captura |
|---|---|---|---|---|
| Clique-direito numa nota da árvore: "Liberar para…" (submenu, múltiplo, ✓ à esquerda, fica aberto) | campaign.ts:256, menu.ts:155 | público | público | `105-depois-menu-liberar-para-claro.png` |
| Mesmo menu: "Editável por: X" (submenu, único, "✓ " dentro do rótulo, fecha) | campaign.ts:260-267 | permissão | permissão (só `.md`) | `05-mestre-mac-editavel-por.png` |
| Mesmo menu: "Nome secreto" (alternância com "✓ " no rótulo) | campaign.ts:258 | nome secreto | nome secreto | `05-…` |
| Clique-direito num board da árvore | campaign.ts:256 | — | só o público | — |
| Clique-direito numa pasta dentro de uma mesa: "Liberar tudo daqui" / "Ocultar tudo daqui" | campaign.ts:246-250 | — | o público de tudo abaixo | — |
| Clique-direito numa seleção: "Liberar" / "Ocultar" | campaign.ts:273-279 | — | público | — |
| Clique-direito numa pasta: "Compartilhar…" (papel lê/edita por pessoa) | menu.ts:148, shares.ts:134 | papéis do compartilhamento | papéis do compartilhamento (faz um co-mestre, C3) | — |
| Marca de cadeado na árvore nas notas ocultas (dono) | campaign.ts:120-127 | oculta | — | `03-mestre-mac-mesa-criada-notas-ocultas.png` |
| Linha do título da nota: ícone de usuários "2/3", popover "Quem vê esta nota" com vê/edita/não vê, botão "Alterar quem vê…" | noteAccess.ts (preenchimento :213-262) | público + permissão | **só o público** (:249-253 abre o mesmo submenu) | `93-…popover…png`, `96-…jogador-popover…png`, `102/104-…telefone-folha…png` |
| Janela da Mesa, cartão Jogadores: Vê n / Edita n (listas só-leitura) / switch Imagens | campaignPlayers.ts:68-317 | contagens | só imagens | `114-…`, `115-…`, `130-depois-jogadores-desktop-claro.png`, `126-…telefone…` |
| Janela da Mesa: switch Mesa aberta, Convidar, Notas (liberar tudo / ocultar tudo), Avançado | campaignDialog.ts | estado da mesa | aberta/fechada, liberação em massa | `74-…`, `75-…` |
| Cartão Mesa na página da pasta | tableCard.ts, campaignParts.ts | as mesmas peças | o mesmo | `80-…`, `82-pagina-da-pasta-jogador-claro.png` |
| Chip "Mesa: X" ao lado do nome da pasta / selo na árvore; popover do jogador "lê os liberados, edita os seus" | tableChip.ts:65-80 | as permissões do jogador | — | `63/64-chip-…`, `73-selo-mesa-jogador-popover.png` |
| Cadeado ao lado do nome da pasta | screen/frame.ts:136-156 | "você só lê" | — | `60-cadeado-leitor-desktop.png`, `111-…` |
| Aviso do leitor perto da tentativa | readerNotice.ts | "Você só lê esta pasta" | — | `62-aviso-ao-editar-desktop.png` |
| Ajustes › Conta › Pastas; console | (páginas do servidor) | membros | membros/papéis | — |
| Ajustes › Este app é um servidor › Celulares pareados "Pode editar" | dialogs/localServer* | papel do celular | papel do celular | — |
| Ajustes › tokens | — | PAT leitura/escrita | PAT | — |

Então um mestre que quer "a Ana edita a ficha dela, o Bruno vê" passa por dois
submenus do clique-direito; para *ver* o resultado vai ao popover do canto
superior direito da nota, cujo botão muda só a primeira metade; para dar um board
não vai a lugar nenhum; para dar imagens vai a uma terceira janela.

## 4. Bugs, com reprodução, causa raiz, nível e resolução

Níveis como na [ADR 0033](../adr/0033-pr-workflow.md). Nenhum perde dados; a
resolução de cada um é um passo da seção J da
[ADR 0113](../adr/0113-one-access-model-for-a-table.md), ainda não construída.

| # | Quem / onde | Ação | Resultado errado | Causa raiz | Nível | Resolvido por |
|---|---|---|---|---|---|---|
| B1 | Ana, jogadora, navegador; "Ficha da Ana" com permissão para a Ana | arrasta uma linha de rolagem do log da Mesa para a ficha | "Você só lê esta pasta"; nada inserido | layout/drag.ts:316-319 `if (!canChange()) { readerAttempt(); return; }` roda antes de todo alvo; `dropRoll` (rollblock/insert.ts:90) já checa `leaf.readOnly`, a resposta certa por nota | IMPORTANT | S5 |
| B2 | idem | arrasta a miniatura do mapa da cripta do log da Mesa para a ficha | "Você só lê esta pasta" | a miniatura é um `<img>` nativo arrastável (table/view.ts:501; só rolagens são fontes `armDrag`, :489-492) → soltar no editor note/editing.ts:115 → `attachImage` → `readable()` :352 → files.ts:52 `canChange()`. Passada a janela, o servidor recusaria `create_file` também (só `write_note`/`write_text` são escritas com permissão, campaign.rs:763), e copiaria uma imagem que a pasta já tem em vez de ligá-la | IMPORTANT | S5 (0113 item 5, D) |
| B3 | idem | cola um print na ficha, ou "Inserir imagem › Da pasta" | recusado | note/editing.ts:114 (colar → o mesmo caminho de B2); :286 `readable()` antes de `this.readOnly` — "Da pasta" só grava um embed, uma edição de texto | IMPORTANT | S5 (0113 item 5, D) |
| B4 | mestre | quer que a Ana edite o "Board do grupo" | o clique-direito no board só oferece "Liberar para…" | campaign.ts:257; servidor campaign_cmds.rs:489; readers.rs:130 em campaign.rs:772; collab.rs:444; board.ts:671 | IMPORTANT | S6, S7 (0113 item 4) |
| B5 | mestre | "Editável por: Ana", depois "Editável por: Bruno" para acrescentar o Bruno | a Ana perde a edição, sem aviso | permissão de valor único, db/campaign.rs:40-41 | IMPORTANT | S2, S6 |
| B6 | mestre | para contornar B4, Compartilhar… → Ana "edita" | a Ana vê toda nota oculta e todo bloco secreto, sai da lista de jogadores, perde imagens, fica sem chip da mesa | C2/C3: players_of exclui editores campaign_cmds.rs:536; véu só para leitores campaign.rs:675; status `"none"` campaign_cmds.rs:725; nenhum aviso no diálogo de compartilhar | IMPORTANT | S3 (0113 item 3) |
| B7 | Bia, editora de uma pasta de mesa | abre a Mesa | vê a pasta inteira mas não as rolagens secretas, não apaga rolagem, não tem controles da mesa | table.rs:165, :899-903; campaign_cmds.rs:74 | IMPORTANT | S3 (0113 item 3: ela é jogadora) |
| B8 | qualquer leitor | arrasta uma linha da árvore para um painel para abrir | "Você só lê esta pasta" | drag.ts:316 antes do ramo de abrir (`"body" in target`, drag.ts:360) | MINOR | S5 |
| B9 | Ana, desktop com a pasta sincronizada, fora do ao vivo | edita a própria ficha (permissão só para ela) | a edição fica local; `sync_put` recusado | sync.rs:622-626 só aceita `group_put` (campaign.rs:783). A janela deixa digitar (note.ts:991). *A confirmar no app* | IMPORTANT | S8 |
| B10 | leitor de uma pasta sincronizada, desktop | digita numa nota, depois solta uma rolagem nela | digitar é permitido (fica local), soltar é recusado | C7: note.ts:991 / board.ts:671 `canWrite()` contra drag.ts:316 `canChange()` | IMPORTANT | S5 |
| B11 | Ana | muda uma propriedade da ficha por uma visão de base | recusado | bases.ts:60-61, :67 `canWrite()` | IMPORTANT | S5 |
| B12 | mestre | pareia o celular como leitor, abre a mesa dele | vê só as notas de toda a mesa; uma mesa fechada o barra | C6: campaign.rs:666-677, :703-727 | IMPORTANT | S3 (0113 item 6) |
| B13 | mestre | olha um board liberado | nenhum indicador de "quem vê"; só as notas têm | noteAccess.ts:167 só `.md` | MINOR | S6 |
| B14 | mestre | "Ninguém (oculta)" numa nota com permissão para a Ana | a permissão de edição da Ana vai junto, sem aviso | db/campaign.rs:512-523 | IMPORTANT | S2, S6 (uma lista por caminho) |

## 5. Resolução

A proposta da auditoria (um modelo, `may(quem, ação, alvo)`; um diálogo
"Acesso…"; assento, acesso por arquivo e direitos por jogador separados) foi ao
mantenedor com cinco perguntas no mesmo dia. As respostas dele — acesso para
qualquer arquivo e pasta, a pasta sobrescrevendo o que há dentro; *"Aplica e
depois permite exceção"*; *"Jogador que edita tudo"* (sem assento de co-mestre,
a recomendação da proposta não tomada); *"Sala por elemento"*; *"Sim, chat e
notas"* — e as duas recomendações tomadas com a aprovação geral dele são a
[ADR 0113](../adr/0113-one-access-model-for-a-table.md), Aceita em 2026-10-24,
ainda não construída. Os pontos que as respostas deixaram em aberto foram
respondidos no mesmo dia; são a seção K dessa ADR.
