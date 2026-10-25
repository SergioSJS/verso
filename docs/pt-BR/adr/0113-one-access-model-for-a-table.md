# ADR 0113 — Um modelo de acesso para uma mesa: um assento, acesso por caminho, direitos por jogador

- Data: 2026-10-24
- Origem: o teste ao vivo de uma mesa feito pelo mantenedor em 2026-10-24 (o
  relato dele está citado no Contexto), a auditoria só-leitura feita no mesmo
  dia a pedido dele
  ([revisão 2026-10-24](../review/2026-10-24-permissions-audit.md), sobre
  `feat/rpg-tools` em `6919e533`), e as respostas dele à proposta dessa
  auditoria no mesmo dia, citadas em cada item da Decisão. Escrita pelo Opus
  5.5; a ser lida pelo outro modelo antes de ser construída
  ([0032](0032-author-and-reviewer-roles.md)).
- Substitui em parte: a [0110](0110-a-table-is-a-campaign-folder.md), itens
  4, 5 e 12 como emendados em 2026-10-23 (o público de uma nota, a permissão de
  edição por nota, o diário como nota liberada e editável), seu "Escolhido no
  código" (2) (editores são mestres), suas seções "Como foi construído" sobre
  permissões de edição, o público e quem pode enviar imagens; e a emenda de
  2026-10-24 do item 3 da [0107](0107-the-table-a-shared-roll-and-chat-log.md)
  (o direito de enviar imagens). Revisa a marca do leitor do item 11 da
  [0076](0076-the-window-on-every-screen.md) (2026-10-23) dentro de uma mesa. A
  história fica nessas ADRs; cada uma ganha uma linha datada apontando para
  cá.
- Relacionadas: [0074](0074-accounts-and-access-on-the-server.md) (papéis por
  pasta, tokens), [0081](0081-sharing-between-people-on-one-universo.md)
  (compartilhamentos, a maior permissão que cobre),
  [0087](0087-secret-blocks-hidden-from-readers.md) (item 5: quem edita vê os
  blocos secretos), [0082](0082-live-co-editing-of-a-synced-folder.md) (item
  12: a sala de um board mescla por elemento),
  [0090](0090-maps-on-the-board.md) (pinos secretos),
  [0096](0096-this-app-is-a-server.md) (um celular pareado como leitor ou
  editor), [0105](0105-read-links-without-an-account.md) (links de leitura),
  [0079](0079-sync-a-local-folder-with-a-server.md) (uma pasta sincronizada),
  [0092](0092-the-phone-offline.md) (vetores de teste compartilhados),
  [0026](0026-core-ui-contract-inviolable-rules.md) (o contrato; regra 3, tipos
  gerados), [0029](0029-guardrails-in-ci.md),
  [0035](0035-cross-cutting-requirements.md),
  [0067](0067-source-files-stay-small.md).
- Situação no briefing: não consta.

## Contexto

**O teste ao vivo.** Em 2026-10-24 o mantenedor rodou uma mesa como mestre,
com jogadores em outros aparelhos. O relato dele, literal:

> *"Cara, tá com fluxo péssimo. Você criou menus diferentes, um para liberar
> acesso e o outro para liberar edição. Um tá num canto, o outro tá no outro
> canto... Sem falar que eu não estou achando um lugar onde eu libero um
> board para edição... quando eu solto ele fala que você só lê esta pasta
> mesmo eu tendo permissão de edição na minha nota... Você precisa sentar,
> repensar todo esse fluxo de permissionamento... um macarrão de código de
> permissões, em vez de fazer um negócio inteiro, sólido, que faz sentido
> para o fluxo que a gente quer na aplicação."*

**O que a auditoria achou** ([revisão 2026-10-24](../review/2026-10-24-permissions-audit.md),
parte 1, com `arquivo:linha` para cada afirmação). "Posso mexer nisto?" é
respondido hoje por duas dimensões misturadas — o papel na pasta, que diz ao
mesmo tempo *o que vejo* e *se escrevo*, e a mesa, que acrescenta público e
permissão de edição por nota — e por cerca de 115 pontos na janela lendo sete
fontes diferentes (as capabilities, uma marca da sincronização guardada três
vezes, o status da campanha, o sucesso da lista de compartilhamentos, a entrada
na mesa, a camada da pasta). As contradições:

- **C1** — "A Ana pode escrever na ficha dela?" tem quatro respostas: o comando
  da janela e a sala no servidor dizem sim, a sincronização de um aparelho diz
  não a menos que a permissão seja do grupo, o editor diz sim, arrastar e
  soltar, colar e o menu de imagem dizem não (o "Você só lê esta pasta" do
  relato: uma checagem de pasta roda antes de o soltar perguntar pela nota).
- **C2** — "A Bia é mestre?": dono e editores para o véu, só o dono para rodar
  a mesa, rolagens secretas e apagar rolagens, dono ou editor para imagens, e o
  status diz `"none"` a um editor.
- **C3** — Um board não pode ser liberado para edição de um jogador em lugar
  nenhum (menu, comando do servidor, caminho de escrita, sala do board, folha
  do board); o único jeito, fazer do jogador editor da pasta, o transforma sem
  aviso num co-mestre que vê toda nota oculta e todo bloco secreto.
- **C4** — "Quem vê" é um conjunto, "quem edita" é um jogador ou o grupo.
- **C5** — As duas listas mudam uma à outra sem dizer.
- **C6** — "É um jogador?" é decidido pela credencial: o próprio celular do
  dono pareado como leitor, ou um token de leitura, é jogador da própria mesa.
- **C7** — Um leitor de pasta sincronizada no desktop digita mas não solta.
- **C8** — "Dono" na janela é inferido de um erro.
- **C9** — O estreitamento do celular está escrito em quatro lugares.
- **C10** — O harness de e2e é uma quarta implementação das regras.

A auditoria lista catorze bugs (B1–B14) que decorrem disso; estão na revisão,
cada um com a causa raiz e o passo desta ADR que o remove.

**O que foi proposto.** A proposta da mesma revisão (agora esta ADR): uma
resposta no servidor, `may(quem, ação, alvo)`; um diálogo "Acesso…"; três coisas
separadas — o **assento** (quem a pessoa é numa mesa), o **acesso de cada
arquivo** por jogador (não vê / vê / edita) e os **direitos** por jogador numa
mesa (enviar imagens, e o que vier depois) — sob um **teto da credencial** que
só pode tirar a escrita, nunca mudar quem a pessoa é.

## Decisão

Aceita em 2026-10-24: os itens 1–5 são as respostas do mantenedor à proposta,
o item 6 é a recomendação da proposta tomada com a aprovação geral dele. As
seções A–J abaixo são o desenho que decorre deles: a proposta como ele aprovou,
ajustada às respostas. Os cinco pontos que essas respostas deixaram para ele
foram respondidos no mesmo dia (seção K). Onde o autor teve de escolher um
detalhe que nenhuma resposta alcança, está marcado `[PROPOSED]`; o que o código
escolheu onde o mantenedor não foi perguntado está marcado *escolhido no
código*.

1. **Um modelo, um diálogo, qualquer caminho.** `[DECIDED 2026-10-24]` O
   mantenedor: *"Aprovo, mas deveria ser por qualquer arquivo (nota, board,
   etc) e pasta, a pasta sobrescrevendo o que tem dentro"*. Então:
   - O servidor responde todo "esta pessoa pode fazer isto aqui?" com **uma
     função**, `may(quem, ação, alvo)` (seção A).
   - **Um diálogo "Acesso…"** — *Não vê | Vê | Edita* por jogador, e uma linha
     *Toda a mesa* — aberto pelo ícone no título de **qualquer** arquivo, por
     **uma** linha do clique-direito da árvore, por uma seleção múltipla e pela
     janela da Mesa (seção F).
   - Direitos de uma **pessoa** se ajustam só na janela da Mesa; o acesso a um
     **arquivo** só no diálogo. A regra para a cabeça: *"arquivo → diálogo
     Acesso; pessoa → janela da Mesa"*.
   - O acesso vale para **qualquer caminho dentro de uma mesa**: notas, boards,
     bases, anexos e imagens, qualquer outro arquivo, e **pastas**.

2. **O acesso de uma pasta, depois exceções.** `[DECIDED 2026-10-24]` O
   mantenedor: *"Aplica e depois permite exceção"*. Definir o acesso de uma
   pasta **substitui** o acesso de tudo o que há dentro — arquivos e subpastas,
   exceções anteriores incluídas — e o diálogo diz, antes de aplicar, quantos
   arquivos mudam. Depois, um arquivo (ou subpasta) pode ser mudado sozinho;
   vira uma **exceção**, listada no diálogo da pasta com um caminho de volta,
   *↺ Seguir a pasta*. Um arquivo novo pega o acesso da sua pasta: a pasta mais
   próxima acima dele com acesso definido, senão o padrão da mesa, **oculto**
   (item 4 da 0110, MC.2 = A, inalterado).

3. **Um editor da pasta dentro de uma mesa é jogador.** `[DECIDED 2026-10-24]`
   O mantenedor: *"Jogador que edita tudo"*. Uma conta cujo papel na pasta (ou
   no compartilhamento) é *editor*, dentro de uma mesa, **continua jogador**: não
   vê arquivos ocultos nem rolagens secretas dos outros, e não tem controles da
   mesa. **Não há assento de co-mestre**: o dono da pasta é o único mestre (dois
   donos são dois mestres, item 15 da 0110). A proposta recomendava um assento
   de co-mestre (um editor que vê tudo e cuida das rolagens); essa recomendação
   **não foi tomada**. O que "edita tudo" cobre foi respondido no mesmo dia:
   **todo arquivo que ele vê** (K.1).

4. **Boards que um jogador edita: uma sala por elemento.** `[DECIDED 2026-10-24]`
   O mantenedor: *"Sala por elemento"*. Um jogador que edita um board entra na
   sala ao vivo dele recebendo **só os elementos que vê**; o servidor **recusa**
   qualquer mudança num elemento que ele não vê ou que está trancado, e **nunca
   aceita de um jogador a escrita do arquivo inteiro de um board** (seção H).

5. **Imagens: um direito, o chat e as notas.** `[DECIDED 2026-10-24]` O
   mantenedor: *"Sim, chat e notas"*. Um direito por jogador, **Imagens**, cobre
   enviar imagem ao chat da mesa **e** pôr uma imagem **nova** numa nota ou board
   que o jogador edita (o servidor grava o arquivo, como no chat). Arrastar uma
   imagem **que já está na pasta** — do chat, da árvore — para uma nota que o
   jogador edita só precisa de **Edita**: liga o arquivo que existe, nada sobe.
   Ampliado no mesmo dia a todo tipo de arquivo e renomeado **Enviar arquivos**
   (K.4).

6. **A credencial só-leitura do próprio mestre; exceções para baixo.** Tomado
   como recomendado, com a aprovação geral do mantenedor à proposta (não uma
   resposta explícita dele):
   - A credencial só-leitura do próprio mestre — o celular dele pareado como
     leitor, um token de leitura — **continua mestre**: vê tudo, mesa fechada
     não o barra; só não escreve.
   - **Exceções abaixo do padrão** são permitidas: *"toda a mesa vê, menos o
     Caio"* é uma linha *Toda a mesa: Vê* com a linha do Caio em *Não vê*, e um
     jogador que entrar depois vê.

### A. O modelo: `may(facts, who, action, target)`

Uma função pura em `verso-server` (uma nova `access::may`, sem IO), alimentada
por um retrato, `AccessFacts`, que o servidor monta uma vez por pedido.

```
may(facts, who, action, target) -> Allow | Deny(reason)

who    = { account, role: Owner | Editor | Reader | None   // pasta ou compartilhamento, a maior permissão que cobre (0081 item 14)
           cap: Write | Read                               // token, pareamento do celular, link de leitura
           phone: bool }
target = { path, kind: Note | Board | Base | Attachment | OtherFile | Folder | Table }
action = See | Edit | Attach | Create | Move | Delete
       | Rename | Say | Roll | RollSecret | SeeSecretRolls | DeleteEntry | Clear | SendFile
       | ManageAccess | ManageTable | Share | Invite
```

**O assento** (`seat(who, table)`), derivado do papel, nunca da credencial
(item 6):

| Papel no caminho da mesa | Assento |
|---|---|
| dono | **mestre** |
| editor (da pasta, ou de um compartilhamento que cobre a mesa) | **jogador** que edita todo arquivo que vê (item 3, K.1) |
| leitor | **jogador** |
| a conta `link:<id>` de um link de leitura (0105) | **visitante** — um jogador sem nome: só as linhas *Toda a mesa* |

Fora de qualquer mesa vale o papel na pasta da 0074 e da 0081, como hoje; esta
ADR não muda nada ali.

**O nível de um caminho para um jogador** (`level(path, account)` ∈
{`none`, `see`, `edit`}):

1. Pega o nó mais próximo com acesso definido: o próprio caminho, senão a pasta
   dele, senão cada pasta acima, até a raiz da mesa.
2. Nesse nó, a linha do próprio jogador se houver, senão a linha *Toda a mesa*
   do nó.
3. Sem nenhum nó definido: o padrão da mesa, `none` (oculto, MC.2 = A).

Um jogador cujo papel é *editor* edita onde o nível dele for pelo menos `see`
(K.1): para ele, *Vê* no diálogo já quer dizer editar, e a linha dele diz
isso (*edita tudo o que vê*). `[PROPOSED]` (a leitura do autor do K.1 com o K.5): uma pasta que ele vê
conta como pasta que ele edita, então ele cria e renomeia dentro dela.

`[PROPOSED]` (a leitura do autor do item 2): o acesso de um nó é **um conjunto
inteiro** — uma linha *Toda a mesa* e as linhas por jogador que diferem dela.
Mudar um arquivo sozinho grava o conjunto inteiro dele, e o arquivo deixa de
consultar a pasta por completo; *↺ Seguir a pasta* apaga o conjunto do arquivo.
Um nó nunca mistura, por jogador, as suas linhas com as da pasta.

Um **anexo** (todo arquivo que não é nota, board nem base) segue o K.3,
*escolhido no código*: um acesso explícito ganha; sem ele, mantém a regra
derivada de hoje — um jogador o vê quando um arquivo que esse jogador vê o liga
ou embute, ou quando a mesa o mostra ("Escolhido no código" (5) da 0110).

### B. As regras (uma tabela só)

| Ação | Fora de mesa | Mestre | Jogador | Visitante (link de leitura) |
|---|---|---|---|---|
| Ver um arquivo ou pasta | papel ≥ leitor | sim | mesa aberta ∧ nível ≥ see | mesa aberta ∧ *Toda a mesa* ≥ see |
| Ver um anexo | papel ≥ leitor | sim | mesa aberta ∧ nível do anexo ≥ see (K.3) | idem, pelas linhas *Toda a mesa* |
| Ver blocos secretos (0087) | papel ≥ editor | sim | Edit(arquivo) (0087 item 5; o diálogo avisa, F) | não |
| Editar (o texto de uma nota, os elementos de um board, as linhas de uma base, os bytes de um arquivo) | papel ≥ editor ∧ cap Write | cap Write | cap Write ∧ (nível = edit, ou papel editor ∧ nível ≥ see, K.1) | não |
| Anexar (um arquivo **novo** num arquivo que a pessoa edita) | papel ≥ editor ∧ cap Write | cap Write | Edit(alvo) ∧ direito *Enviar arquivos* ∧ cap Write (item 5, K.4) | não |
| Ligar algo que já vê (arrastar do chat, da árvore) | = Edit(alvo) | = Edit(alvo) | = Edit(alvo), sem direito extra (item 5) | não |
| Criar, renomear (dentro de uma pasta) | papel ≥ editor ∧ cap Write | cap Write | Edit(pasta) ∧ cap Write (K.5); um arquivo novo pega o acesso da pasta | não |
| Mover (para dentro ou para fora de uma pasta) | papel ≥ editor ∧ cap Write | cap Write | não (K.5) | não |
| Apagar | papel ≥ editor ∧ cap Write | cap Write | não (K.5) | não |
| Falar, rolar, rolar em segredo | — | sim | sim (mesa aberta) | não |
| Ver rolagens secretas alheias | — | sim | não (um editor também não, item 3) | não |
| Apagar uma entrada, limpar a mesa | — | sim | só a própria mensagem ou arquivo | não |
| Enviar arquivo (chat) | — | cap Write | direito *Enviar arquivos* ∧ cap Write (K.4) | não |
| Gerir acesso, gerir a mesa | — | cap Write ∧ não um celular (como construído) | não | não |
| Compartilhar, convidar | dono ∧ cap Write (convidar quem não tem conta: o admin, 0081 item 4) | dono | não | não |

O teto da credencial é uma linha só: **toda ação de escrita exige `cap =
Write`**. Um celular pareado como leitor, um token de leitura e um link de
leitura são `cap = Read`; é o único lugar em que o celular é estreitado (acaba
C9). As linhas de mesa fechada e de arquivo oculto do mestre não dependem do
teto (item 6).

**O que colapsa em quê:**

| Hoje | Vira |
|---|---|
| `campaign_notes.released` + `campaign_audience` + `grant_kind`/`grant_account` | uma tabela de linhas por **caminho**: `campaign_access (folder, path, account NULL = toda a mesa, level)`, em que `path` pode ser uma pasta |
| "Liberar para…" + "Editável por" + "Alterar quem vê…" + "Liberar/Ocultar tudo daqui" | um diálogo **Acesso…** |
| uma permissão para um jogador ou para o grupo | Edita para qualquer conjunto de jogadores |
| um board que não se edita | um board como qualquer arquivo (item 4, H) |
| `campaign_images` | `campaign_rights (folder, root, account, right)` com `right = 'files'` (*Enviar arquivos*, K.4) |
| `granted_write`, `group_put`, `may_send_images`, `acting`, `game_master`, o `role.writes() && token_writes` repetido | chamadas a `may` |
| o `viewer` owner/player/none da janela + `mayShare` + `can("write")` + três marcas de leitor sincronizado | `FolderAccess` + `FileAccess` (C) |
| `campaign_notes.secret_name` | uma coluna de `campaign_files (folder, path, secret_name)` |

O `Veil` (público, união, por conta) de "Como foi construído (o público de uma
nota)" da 0110 continua dentro do servidor, calculado das linhas novas; todo
caminho de leitura que ele cobre mantém o seu teste.

### C. O contrato — a janela nunca re-deriva

Tipos gerados do Rust (0026 regra 3):

- `FileAccess { level: "none" | "see" | "edit", attach: bool, why: AccessWhy }`
  vem em **toda resposta de leitura** (`read_note`, `read_text`, `read_board`,
  `board_preview`, os metadados de um arquivo) e em cada entrada de
  `list_notes`/`list_entries`, para a árvore e todo alvo de soltar saberem.
  `attach` é `may(Attach)`. `AccessWhy` diz de onde vem o nível (mestre, o
  conjunto do próprio arquivo, o de uma pasta, o padrão da mesa, a credencial)
  para a janela poder dizê-lo, nunca para recalculá-lo.
- `FolderAccess { seat: "master" | "player" | "visitor" | "none", role, cap }` nas
  capabilities: a fonte única de "quem sou eu aqui" (acaba C8).
- O evento `access-changed { paths }`, feito por jogador como o
  `campaign-changed` de hoje (um jogador só é avisado do que ganhou ou perdeu).
  Substitui `campaign-changed`, `verso:role` e o uso de `verso:sync-state` para
  permissão.
- Comandos:
  - `access_get(paths)` — para o mestre, por caminho: a linha de toda a mesa, o
    nível de cada jogador e de onde vem; numa pasta, também quantos arquivos há
    dentro e as exceções (os arquivos e subpastas com conjunto próprio). Para um
    jogador: só quem vê, como o `campaign_access` de hoje.
  - `access_set(paths, set | "follow", options)` — grava um conjunto inteiro (A)
    em cada caminho; numa pasta substitui tudo o que há dentro e responde
    quantos arquivos mudaram; `"follow"` apaga o conjunto (*↺ Seguir a pasta*);
    `options` leva o nome secreto (item 7 da 0110).
  - `table_rights_set(root, accounts, right, on)` — hoje `right` é só `files`
    (*Enviar arquivos*, K.4); o `TableJoin.files` diz isso na entrada.
- **A regra para a janela:** ela mostra, habilita e guarda só a partir de
  `FileAccess` e `FolderAccess`, e pergunta de novo a cada `access-changed`;
  nunca deriva uma permissão de um papel, uma marca ou um erro. O servidor
  decide toda escrita, seja o que for que a janela mostrou.

Na janela, um módulo `app/ui/src/access.ts` (`may(path, action)`, `seat()`)
alimenta toda guarda: o só-leitura do editor e do board, cada soltar pelo seu
alvo, colar, o menu de imagem, as propriedades de uma base, os menus da árvore,
o cadeado da pasta e o aviso de leitor.

### D. Arrastar e soltar

| Arrastado | Para | Regra | Hoje |
|---|---|---|---|
| Uma rolagem do log | um arquivo que eu edito | `may(Edit, alvo)` → o bloco de rolagem é inserido | recusa (B1) |
| Uma imagem do chat | um arquivo que eu edito | `may(Edit, alvo)` → `![[<root>/<place>/mesa-…]]`, **o arquivo que existe**; nada sobe | recusa (B2) |
| Um arquivo do computador, ou um print colado | um arquivo que eu edito | `may(Attach, alvo)` → o servidor grava no lugar de anexos **da mesa** com as checagens do K.4 | recusa (B3) |
| Uma linha da árvore | um painel | sempre abre | recusa para leitor (B8) |
| Uma linha da árvore | um arquivo que eu edito | um link ou um cartão, se eu vejo o arquivo | recusa |
| Uma linha da árvore | uma pasta | `may(Move)` | como hoje |

A miniatura do chat vira uma fonte `armDrag` de tipo `file` com o caminho da
imagem, como as linhas da árvore, em vez de um `<img>` nativo.

### E. Padrões

- Uma nota, board, base, anexo ou outro arquivo novo numa mesa: o acesso da sua
  pasta, senão **oculto** (item 2; MC.2 = A).
- Um jogador novo: a linha *Toda a mesa* de cada arquivo vale para ele;
  *Enviar arquivos* **desligado** (como construído).
- "Liberar para a mesa" vira simplesmente *Toda a mesa: Vê*.

### F. As telas

**Um diálogo, quatro portas:** (1) o ícone de pessoas na linha do título de
**qualquer** arquivo (o clique abre; o hover continua mostrando o resumo
só-leitura); (2) **uma** linha do clique-direito da árvore, *Acesso… · Ana edita
· 2 veem*, sem submenus — num arquivo e numa pasta; (3) uma seleção múltipla,
*Acesso de 5 arquivos…*; (4) na janela da Mesa, o número *Vê*/*Edita* de um
jogador abre a lista daquele jogador, com o mesmo controle por arquivo.

Desktop, um popover ancorado no ícone, cerca de 340 px:

```
┌ Acesso · Ficha da Ana ────────────────────────────── × ┐
│ Mesa: Ruínas de Valdor                                  │
│                                                         │
│ Toda a mesa   ( Não vê | ▣ Vê  | Edita )                │
│ ─────────────────────────────────────────────────────── │
│ (A) Ana  ●    ( Não vê |  Vê   | ▣ Edita )   só ela     │
│ (B) Bruno     ( Não vê | ▣ Vê  | Edita )     = mesa     │
│ (C) Caio      ( Não vê | ▣ Vê  | Edita )     = mesa     │
│                                                         │
│ ⚠ Esta nota tem 2 blocos secretos: quem edita os vê.   │
│ Segue a pasta "Fichas" — ↺ Seguir a pasta               │
│ ▸ Mais opções                                           │
│     [ ] Nome secreto — links para ela viram ▒▒▒▒         │
│                                                         │
│ Você, o mestre, sempre vê e edita.          Salvo ✓     │
└─────────────────────────────────────────────────────────┘
```

- Um controle segmentado por linha (`role=radiogroup`; as setas mudam): salva
  na hora e responde ao lado (*Salvo ✓* ou o erro em vermelho), como o switch
  *Mesa aberta*.
- *Toda a mesa* é o padrão do arquivo: muda as linhas que estão *= mesa* e vale
  para quem entrar depois. Uma linha diferente diz *só ele/ela* com um *↺* que a
  devolve ao valor de toda a mesa (item 6).
- A linha *Segue a pasta "Fichas"* aparece enquanto o arquivo não tem conjunto
  próprio; mudado sozinho, ela diz *Acesso próprio (exceção de "Fichas")* com
  *↺ Seguir a pasta*.
- Escolher *Edita* num arquivo com blocos secretos mostra o aviso antes de
  salvar (0087 item 5).
- Num **board**: o mesmo, e, quando ele tem cartões de arquivos que aquele
  jogador não vê, uma linha *Ana verá 3 cartões trancados* (H).

O diálogo da pasta — o mesmo controle, aplicado com um botão porque substitui o
que há dentro (item 2):

```
┌ Acesso · pasta "Locais" ──────────────────────────── × ┐
│ Mesa: Ruínas de Valdor                                  │
│                                                         │
│ Toda a mesa   ( Não vê | ▣ Vê  | Edita )                │
│ ─────────────────────────────────────────────────────── │
│ (A) Ana       ( Não vê | ▣ Vê  | Edita )     = mesa     │
│ (B) Bruno     ( Não vê | ▣ Vê  | Edita )     = mesa     │
│ (C) Caio      ( ▣ Não vê | Vê  | Edita )     só ele ↺   │
│                                                         │
│ Aplicar muda o acesso de 14 arquivos,                   │
│ 2 exceções incluídas.                      [ Aplicar ]  │
│ ─────────────────────────────────────────────────────── │
│ Exceções (2) — arquivos com acesso próprio              │
│   Cripta.md          Ana edita · 2 veem   ↺ Seguir a pasta │
│   mapa-cripta.png    ninguém vê           ↺ Seguir a pasta │
└─────────────────────────────────────────────────────────┘
```

Um arquivo movido para a pasta de outro lugar mantém o próprio acesso (K.2) e
aparece entre as exceções com o seu *↺*, como um arquivo mudado sozinho.

Telefone, uma folha de baixo a 390 px, alvos de 44 px, o botão de fechar com o
foco ao abrir (como a folha de hoje):

```
┌───────────────────────────────┐
│ ▔▔▔                           │
│ Acesso · Ficha da Ana     ✕   │
│ Mesa: Ruínas de Valdor        │
│                               │
│ Toda a mesa                   │
│ [ Não vê ][ ▣ Vê ][ Edita  ]  │
│ ───────────────────────────── │
│ Ana ●                 só ela  │
│ [ Não vê ][  Vê  ][▣ Edita ]  │
│ Bruno                 = mesa  │
│ [ Não vê ][ ▣ Vê ][ Edita  ]  │
│ Caio                  = mesa  │
│ [ Não vê ][ ▣ Vê ][ Edita  ]  │
│                               │
│ ⚠ 2 blocos secretos: quem     │
│   edita os vê.                │
│ ↺ Seguir a pasta              │
│ ▸ Mais opções                 │
└───────────────────────────────┘
```

O que um jogador vê — nunca os controles:

```
 Ficha da Ana                         [✎ Você edita]
 Diário do farol                      [👁 Você lê]
```

- Na linha do título um chip *Você edita* ou *Você lê*; o hover ou um toque
  mostra quem mais vê ("Você, Bruno e o mestre"), como hoje.
- Na árvore um lápis pequeno nos arquivos que ele edita; nada nos que só lê.
  Numa pasta que ele edita aparecem *Nova nota* e *Renomear*; nunca *Apagar*
  nem mover (K.5).
- Dentro de uma mesa o cadeado da pasta **não** aparece para um jogador (ele
  edita alguns arquivos; o cadeado mentiria); continua para o leitor fora de
  mesa (0076 item 11).
- Tentar escrever onde só lê: *Você só lê **esta nota**. Quem libera a edição é
  o mestre.* — perto da tentativa, como hoje.

A janela da Mesa — os direitos por pessoa:

```
 JOGADORES  3                           Enviar arquivos: [■ todos]
 ┌───────────┬──────┬────────┬──────────────┐
 │ Jogador   │ Vê   │ Edita  │ Enviar arq.  │
 ├───────────┼──────┼────────┼──────────────┤
 │ (A) Ana ● │  7 ▸ │  2 ▸   │ [■■□] Salvo  │
 │ (B) Bruno │  5 ▸ │  1 ▸   │ [□□■]        │
 └───────────┴──────┴────────┴──────────────┘
 ▸ abre a lista de arquivos desse jogador, cada um com
   ( Não vê | Vê | Edita ) — o próprio controle do diálogo.
```

*Enviar arquivos* cobre o chat **e** um arquivo novo num arquivo que o jogador
edita (item 5, K.4). Os direitos ficam aqui; o acesso a arquivos fica no diálogo.

### G. O nome secreto

Continua (item 7 da 0110), como opção do diálogo (*Mais opções*), guardado em
`campaign_files`.

### H. Um board que um jogador edita (item 4)

O motivo de hoje para recusar (`campaign_cmds.rs:487-488`) é real: um jogador
recebe o board **projetado** — cartões de arquivos ocultos como cartões de texto
trancados, pinos secretos ausentes — e uma escrita do arquivo inteiro vinda dele
gravaria a projeção por cima do board. Então:

- Um jogador que **edita** um board entra na **sala** do board, que já mescla por
  elemento (0082 item 12), e recebe **só os elementos que vê**: um cartão de um
  arquivo que ele não vê como um marcador trancado com o **mesmo id**, pinos
  secretos (0090) ausentes.
- O servidor **recusa** uma atualização que toque um id que o jogador não vê, um
  marcador trancado ou um pino secreto, e **nunca** aceita de um jogador a escrita
  do arquivo inteiro de um board (`write_text`, `sync_put` de um `.canvas`).
- Elementos novos, e mudanças nos elementos que ele vê, são aceitos. Um elemento
  de texto do board segue o item 5 da 0087 como uma nota: quem edita vê os
  blocos secretos, e o diálogo avisa.
- Um jogador que só **vê** um board recebe a projeção, como hoje.
- Testes: uma propriedade "nenhum id ou texto oculto chega a um jogador" e "uma
  atualização a um id não visto é recusada", no molde da 0087.

### I. Migração (nada se perde)

Schema 20, numa transação:

- `released = 1` → `(path, NULL, 'see')`;
- cada `campaign_audience (path, a)` → `(path, a, 'see')`;
- `grant_kind = 'group'` → `(path, NULL, 'edit')` (por cima do `see`);
- `grant_kind = 'player', a` → `(path, a, 'edit')`;
- `secret_name` → `campaign_files`;
- `campaign_images` → `campaign_rights (…, 'files')`.

Nenhuma pasta ganha conjunto (o "liberar tudo daqui" de hoje gravava linhas por
nota), então depois da migração toda linha é de um arquivo e a herança do item
2 não muda nada. As tabelas antigas ficam uma versão, só-leitura (voltar atrás é
possível), e saem na seguinte. Um **teste de equivalência** é obrigatório: para
estados antigos gerados, o `Veil` de hoje e o `may(See | Edit)` novo dão a mesma
resposta para todo jogador e todo caminho — assim os logs de sincronização por
jogador (`campaign_epoch`, `_viewer`, `_skip`, `_lost`, `_gone`) não se mexem e
nenhum aparelho recebe exclusão forçada no upgrade. As diferenças decididas
aqui ficam fora desse teste e têm teste próprio: um editor da pasta dentro de
uma mesa vira jogador que edita o que vê (item 3, K.1), e a credencial só-leitura do mestre continua
mestre (item 6).

### J. A reconstrução, passo a passo

| Passo | O quê | Testes | Apaga |
|---|---|---|---|
| S0 | Esta ADR | — | — |
| S1 | `access::may` puro + `AccessFacts` | o **teste de tabela exaustivo** abaixo; ele grava `access-vectors.json` | — |
| S2 | Schema 20 + migração | equivalência antigo × novo (I) | — |
| S3 | Toda porta do servidor chama `may`: `folder_command` (`rpc.rs:906-915`), `rpc_collab` (`:64-72`), `sync_put` (`sync.rs:619-626`), `table_send_image`/`may_send_images`, `game_master`, o mascaramento de rolagens secretas, apagar e limpar, `campaign_status`; criar e renomear de um jogador numa pasta que ele edita (K.5); um movimento ou renomeação levando o conjunto do arquivo (K.2) | os `tests_campaign*`, `tests_audience*`, `tests_table*` de hoje passam sem mudar de expectativa, exceto as mudanças decididas | `granted_write`, `group_put`, `acting`, o ramo de assento de `campaign::player`/`guard` |
| S4 | Contrato: `FileAccess`, `FolderAccess`, `access-changed`, `access_get`, `access_set`, `table_rights_set`; pastas e todo tipo de arquivo | bindings checados; o harness responde pelos vetores | `campaign_audience`, `campaign_grant`, `campaign_release*`, `campaign_secret_name`, `campaign_permission` (depois que a janela migrar) |
| S5 | O `access.ts` da janela; os ~115 pontos do 1.1 da revisão; soltar por alvo; a miniatura do chat como `armDrag`; `attachImage` pelo servidor | `test/access.test.mjs` sobre os vetores; e2e | `canChange`, `readsSynced`, os dois `syncedReader`, `mayEditGranted`, `readable` (`files.ts`), a inferência em `mayShare` |
| S6 | O diálogo **Acesso…** (desktop e folha) para qualquer arquivo, o diálogo da pasta com as exceções (arquivos movidos incluídos, K.2), uma linha no menu, a seleção múltipla, o indicador em todo arquivo, os jogadores da janela da Mesa religados | e2e em 1500, 820 e 390 px; leitor de tela | `audienceItems`, o submenu "Editável por", "Alterar quem vê…", `campaignSelectionItems`, "Liberar/Ocultar tudo daqui" |
| S7 | O board que um jogador edita (H) | as duas propriedades | as recusas de `campaign_cmds.rs:489` e `collab.rs:444` para quem edita |
| S8 | O desktop sincronizado: o host pede `access_get` pelo link da sincronização e guarda a última resposta (offline vale a última); `sync_put` por `may(Edit)` (fecha B9); o board de um jogador nunca sobe inteiro (H) | `tests_live_table.rs`, `tests_sync.rs` | — |
| S9 | Os cenários do teste ao vivo como e2e do servidor: Ana no navegador solta uma rolagem na ficha; arrasta o mapa do chat para a ficha; edita o board do grupo; o Bruno não; o mestre dá *Edita* a Ana e Bruno juntos; uma pasta definida, depois uma exceção, depois *↺*; a Ana cria e renomeia uma nota numa pasta que edita e não a apaga; um arquivo movido pelo mestre mantém o acesso; um PDF enviado com *Enviar arquivos* | `e2e-server/access.spec.mjs` | — |
| S10 | O tutorial (nota 32 "Rodando uma Mesa", um cartão no tour) e os dois CHANGELOGs | o walkthrough | — |

**O teste de tabela exaustivo** (S1): papel {dono, editor, leitor, nenhum} ×
credencial {escrita, leitura, celular como leitor, celular como editor, link de
leitura} × mesa {nenhuma, aberta, fechada} × de onde vem o nível {nada, o
conjunto do arquivo, o de uma pasta, uma exceção sob o conjunto de uma pasta,
uma linha por jogador abaixo da de toda a mesa, um arquivo movido com conjunto
próprio} × nível {none, see, edit} × tipo {nota, board, base, anexo, outro
arquivo, pasta} × direito *Enviar arquivos* {desligado, ligado} × cada ação → a resposta esperada, escrita à mão como tabela
no teste. Ele grava os vetores compartilhados, `app/ui/test/access-vectors.json`
(como o `sync-vectors.json` serve a [0092](0092-the-phone-offline.md)); o teste
da janela e o harness leem os mesmos vetores, e o harness deixa de ser uma
quarta implementação (C10). Um guardrail da funcionalidade, visto falhando antes
do merge ([0029](0029-guardrails-in-ci.md)).

### K. Respondido no mesmo dia

Os pontos que as primeiras respostas deixaram em aberto voltaram ao mantenedor
em 2026-10-24; quatro foram respondidos, um (K.3) não foi perguntado e é a
escolha do código.

1. **O que "edita tudo" cobre para um editor da pasta dentro de uma mesa.**
   `[DECIDED 2026-10-24]` O mantenedor: *"Tudo o que ele vê"*. Um editor da
   pasta (ou do compartilhamento) dentro de uma mesa continua jogador — não vê
   arquivos ocultos nem rolagens secretas dos outros, não tem controles da mesa
   — mas **edita todo arquivo que vê**, sem precisar de *Edita* por arquivo. Pelo
   item 5 da 0087 ele vê, portanto, os blocos secretos de todo arquivo que vê; o
   diálogo de compartilhar diz isso quando o caminho tem uma mesa.
2. **Um arquivo movido ou renomeado para outra pasta.** `[DECIDED 2026-10-24]`
   O mantenedor: *"Leva o próprio acesso"*. Um arquivo movido ou renomeado
   mantém o próprio conjunto e vira uma **exceção** na pasta nova, listada no
   diálogo dessa pasta com *↺ Seguir a pasta*. `[PROPOSED]` (a leitura do
   autor): um arquivo que não tinha conjunto próprio leva o acesso que tinha — o
   da pasta antiga, gravado como conjunto próprio — para que um movimento nunca
   mude quem o vê; uma pasta movida leva o seu conjunto do mesmo jeito, e os
   arquivos que a seguiam continuam seguindo. Renomear dentro da mesma pasta não
   muda nada.
3. **Um anexo com acesso explícito e um arquivo que o embute.** Não perguntado;
   *escolhido no código*, a confirmar: **o acesso explícito no anexo ganha**; sem
   ele, o anexo segue as notas e os boards que o embutem ou ligam, a regra de
   hoje. `[PROPOSED]` (a leitura do autor de "explícito"): o conjunto de uma
   pasta que cobre o anexo conta como explícito, já que aplicar uma pasta
   substitui o que há dentro (item 2); uma nota que um jogador vê e que embute
   um anexo oculto para ele mostra ali "🔒 (ainda não revelado)", e o diálogo da
   nota diz *esta nota mostra 2 arquivos que a Ana não vê*.
4. **Um arquivo novo que não é imagem.** `[DECIDED 2026-10-24]` O mantenedor:
   *"Sim, pelo mesmo direito 'Imagens'"*. O direito por jogador passa a se
   chamar **Enviar arquivos**: imagens, PDF, áudio e outros arquivos, com as
   mesmas checagens — o tipo pelos bytes quando é conhecido, o limite de tamanho
   da mesa, a cota da pasta, nunca SVG, HTML nem script — e cobre o chat **e** um
   arquivo novo posto numa nota ou board que o jogador edita. Isto amplia o item
   5 e o item 3 da 0107 (o chat leva arquivos, não só imagens). `[PROPOSED]`: o
   chat mostra um arquivo que não é imagem como um cartão com nome, tipo e
   tamanho; o limite da mesa mantém o valor e passa a se chamar *limite de
   tamanho de arquivo*.
5. **Edita numa pasta para um jogador.** `[DECIDED 2026-10-24]` O mantenedor:
   *"Cria e renomeia, não apaga"*. Um jogador com *Edita* numa pasta **pode
   criar** arquivos dentro dela — um arquivo novo pega o acesso da pasta (item 2)
   — e **pode renomear** arquivos dentro dela; um jogador **não pode apagar**, e
   **mover um arquivo para dentro ou para fora de uma pasta continua sendo do
   mestre**. Isto dá caminho ao item 6 da 0110 (MC.3 = A): uma pasta que o mestre
   libera como *Edita* é o lugar dos jogadores para os boards e notas deles.

## Consequências

- O `verso-server` ganha `access::may` e `AccessFacts`; toda checagem de
  permissão da mesa — comandos, salas, sincronização, o log da mesa, imagens, o
  status — o chama. O véu continua e é calculado das linhas novas.
- O banco vai ao schema 20 com `campaign_access`, `campaign_files` e
  `campaign_rights`; as tabelas antigas ficam só-leitura por uma versão.
- O contrato ganha `FileAccess`, `FolderAccess`, `access-changed`, `access_get`,
  `access_set` e `table_rights_set`; tipos gerados; cinco comandos de campanha e
  o `campaign-changed` saem depois que a janela migrar.
- A janela ganha `access.ts`, um diálogo para qualquer arquivo e pasta, as
  exceções da pasta, o chip *Você edita* / *Você lê* do jogador, um lápis na
  árvore; perde os dois submenus, as linhas de pasta em massa, a inferência do
  dono a partir de um erro e as três marcas de leitor sincronizado.
- Um editor da pasta dentro de uma mesa **vê menos que hoje** (item 3): deixa de
  ver arquivos ocultos e rolagens secretas dos outros, mas edita todo arquivo
  que vê (K.1). Uma mesa que contava com um editor como mestre auxiliar perde a
  metade oculta; a mudança é dita nos dois CHANGELOGs quando construída.
- Jogadores criam e renomeiam dentro de uma pasta que editam, nunca apagam nem
  movem (K.5); um movimento mantém o acesso de um arquivo (K.2); *Enviar
  arquivos* substitui o direito de imagens e cobre todo arquivo que as
  checagens aceitam (K.4).
- O celular ou token só-leitura do próprio mestre **vê mais que hoje** (item 6):
  recebe a pasta inteira, só-leitura.
- O desktop sincronizado de um jogador sobe as notas que ele edita (fecha B9),
  mas nunca um board inteiro: um jogador só edita um board ao vivo, e a janela
  diz isso offline.
- O cadeado do item 11 da 0076 não aparece para um jogador dentro de uma mesa; o
  aviso nomeia a nota, não a pasta.
- O harness de e2e responde pelos vetores compartilhados em vez da própria
  cópia das regras.
- A nota 32 do vault de demonstração e o cartão do tour são reescritos para o
  diálogo.

**Riscos.**
- A migração mexe na base de todo log de sincronização por jogador; o teste de
  equivalência é o que impede um aparelho de receber uma exclusão que não
  deveria. Ele tem de ser visto falhando (num mapeamento errado de propósito)
  antes de contar.
- O *Aplicar* de uma pasta substitui muitos arquivos de uma vez, e as exceções
  somem junto; a contagem antes de aplicar é a única guarda. Vai para o log de
  auditoria (uma linha por aplicação, com a contagem).
- A sala de board por elemento é código novo num caminho que vaza se estiver
  errado; as duas propriedades de H são a guarda.
- Cerca de 115 pontos mudam no S5; os vetores e o e2e do S9 têm de passar antes
  de os predicados antigos serem apagados, não depois.

## Alternativas descartadas

- **Consertar os menus atuais um por um.** O estado que o teste ao vivo achou; o
  mantenedor o rejeitou no relato (*"um macarrão de código de permissões, em vez
  de fazer um negócio inteiro, sólido"*).
- **Acesso só para notas, boards e bases.** O escopo da proposta; o mantenedor o
  ampliou para qualquer arquivo e pasta (item 1).
- **Um assento de co-mestre** para um editor da pasta dentro de uma mesa (a
  recomendação da proposta para a Q1 dela: vê e edita tudo, vê rolagens
  secretas, apaga rolagens). Não tomada: *"Jogador que edita tudo"* (item 3).
- **Só boards sem nada oculto podem ser editados por um jogador** (a opção B,
  mais barata, da proposta para a Q2 dela). Não tomada: *"Sala por elemento"*
  (item 4).

## Situação

Aceita em 2026-10-24; ainda não construída. Os itens 1–5 são as respostas do
mantenedor de 2026-10-24; o item 6, a recomendação da proposta tomada com a
aprovação geral dele. As seções A–J são a proposta aprovada ajustada a essas
respostas; K.1, K.2, K.4 e K.5 são respostas dele do mesmo dia, K.3 a escolha
do código a confirmar; os detalhes marcados `[PROPOSED]` são do autor. Nada está
`[OPEN]`. A ser lida pelo outro modelo antes de o S1 começar
([0032](0032-author-and-reviewer-roles.md)).

### Como construído, S1–S3 (2026-10-24, `feat/one-access-model`)

Só o lado do servidor; o contrato e a janela são S4–S6.

- **S1.** `access::may(facts, asker, action, target)` no `verso-server`
  (`access/rules.rs`, sem IO), `AccessFacts` (as mesas, os conjuntos por
  caminho, os direitos), o assento só pelo papel, `level` com herança da
  pasta e exceções, o teto da credencial. O teste exaustivo da matriz
  (`access/vectors.rs`) a compara com um segundo enunciado da seção B
  escrito à mão e escreve `app/ui/test/access-vectors.json` (895 casos,
  versionado, conferido como em dia; visto falhar com uma regra errada).
- **S2.** Esquema 20: `campaign_access`, `campaign_files`, `campaign_rights`,
  as linhas antigas levadas (uma nota oculta continua uma nota que a mesa
  conhece, como um `none` explícito); as tabelas antigas ficam, nunca mais
  escritas. O véu é feito dos conjuntos. O teste de equivalência
  (`db/tests_access.rs`) gera todo estado antigo e confere que o véu responde
  como o antigo para todo jogador e caminho, e conduz o novo
  `campaign_audience` / `campaign_grant` contra um modelo das escritas
  antigas; os dois foram vistos falhar com um mapeamento errado.
- **S3.** `access::Door` (quem pergunta numa requisição e os fatos) é o que
  toda porta consulta: `folder_command` (`check_write`), `rpc_collab`, o
  `sync_put` / `sync_delete` / `sync_rename` do dispositivo (`check_sync`),
  o registro da mesa (`log_role`, `DeleteEntry`, `Clear`, `SendFile`),
  `game_master` (`ManageTable`, `ManageAccess`), o status, `files` por HTTP,
  o histórico e a lixeira, o guarda da mesa fechada, os avisos
  (`readers::split`). Apagados: `granted_write`, `group_put`, `acting`,
  `images_allowed` e o `role.writes() && token_writes` repetido.
- **Lido onde o ADR cala, a confirmar.** (1) `Attachment` e `OtherFile`
  seguem as mesmas regras. (2) Quem edita fora de uma mesa mantém o papel da
  pasta (tudo é dele); dentro, *Vê* já significa editar (K.1) e uma pasta que
  ele vê é uma em que cria e renomeia (K.5). (3) Um board nunca é escrito
  inteiro por um jogador nem digitado por um até o S7 (H): um editor da pasta
  perde a sala do board numa mesa nesse meio-tempo. (4) O `sync_put` do
  dispositivo de um jogador ainda exige a nota servida inteira (o grupo todo
  a edita); o S8 tira isso. (5) A credencial só de leitura do mestre entra
  numa sala como leitor; lê as notas inteiras pelos comandos. (6) Esvaziar o
  conjunto de um arquivo guarda um `none` explícito (a linha que uma nota
  oculta antiga tinha), para que um conjunto de pasta depois não decida por
  ele.

### Revisão de S1–S3 (2026-10-24): o que um jogador vê do que não pode ver

Qualquer coisa de um arquivo mostrada, nomeada ou respondida a quem está fora
do seu acesso é BLOQUEANTE (regra do mantenedor). A revisão achou cinco
caminhos e o mantenedor decidiu dois comportamentos; todos estão testados
(`tests_access_review.rs`).

- **A resposta de um renomear** (o mantenedor, 2026-10-24, *"Servidor corrige
  sem contar"*): o servidor ainda reescreve os links nas notas que o jogador não
  pode editar, como `share_links::apply` faz num compartilhamento; a resposta ao
  jogador guarda só as reescritas das notas que ele pode *Editar*, os pulados e
  movidos do que ele pode *Ver*, e nada do que está oculto.
- **Um nome ocupado por algo oculto** (o mantenedor, 2026-10-24, *"Sufixo
  automático"*): criar ou renomear para um nome que algo que o jogador não vê
  ocupa nunca é respondido "já existe"; o servidor usa o próximo nome livre
  (`Cripta 2.md`), como um duplicar faz, e responde com o nome usado. Um nome
  ocupado por algo que o jogador vê é recusado como sempre.
- Um arquivo movido ou renomeado para dentro de uma mesa por quem não é o mestre
  é recusado (K.5), e sempre exige *Criar* na pasta nova; uma pasta não é de um
  não mestre para renomear quando guarda uma mesa, ou algo que a pessoa não vê;
  a lixeira é recusada a um jogador em qualquer mesa da pasta; um arquivo novo
  que não é nota, board nem base feito por um jogador numa mesa é um arquivo
  enviado (o direito, os bytes pelos primeiros bytes, o limite — nunca SVG,
  página ou script) e o `sync_put` de um dispositivo é recusado até o S8.
- Uma só afirmação de "vê os blocos secretos": `Player::sees_secrets` pergunta
  `may(SeeSecretBlocks)`; uma sala entra inteira para quem ela permite, a
  credencial só de leitura do mestre inclusive (digitar continua dos que
  escrevem). `history_copy` pergunta *Criar* na pasta; os comandos sem caminho da
  raiz de uma mesa são do mestre; a migração lê só linhas de audiência de notas
  que as tabelas antigas tinham; o teto de um celular pareado segue o pareamento
  ao vivo.
- Como construído: *Dizer* e *Rolar* com credencial só de leitura continuam
  permitidos (o chat não é escrita de arquivo). O `none` que a migração escreveu
  para uma nota que a mesa mantinha oculta é marcado (`migrated`) e não é
  exceção na lista de uma pasta.

### Como construído, S7 (2026-10-25, `feat/access-s7`)

O board que um jogador edita (H). No servidor em `board_sight.rs` (puro) e
`collab_players.rs` (a sala); o diálogo acompanha.

- **Uma sombra da sala por conta.** Um jogador cujo `may(Edit)` vale num board
  entra num documento só dele, feito pelo servidor do que a conta vê
  (`board_sight::see`): um elemento é *Aberto* (como está — um cartão de texto
  inteiro, blocos secretos inclusive, 0087 item 5), *Trancado* (o cartão de um
  arquivo que a conta não vê: o **mesmo id**, o mesmo lugar e tamanho, as
  palavras que todo cartão com véu tem, `locked: true` para o board não o
  selecionar — nunca o caminho, a cor ou o texto do arquivo) ou *Ausente* (um
  pin secreto, 0090 item 5, e o que pertence a ele: as arestas que o tocam, os
  elementos desenhados presos a ele, dentro dele ou agrupados só com pins
  secretos; nem a lápide de um deles é contada). O retrato do `join` e cada
  atualização depois são uma só função; os `boundElements` de um cartão e um
  grupo são cortados do mesmo jeito, e a `base` dos fatos da sala é a projeção
  do arquivo (`shape_canvas`: os mesmos pins fora, os mesmos cartões
  trancados). Quem só *vê* o board continua seguindo o arquivo, como antes (0090
  item 5 revisto em 2026-10-15).
- **A sala segue a sombra por elemento.** O que a janela do jogador manda é
  tentado numa cópia da sombra e julgado (`board_sight::check`): a edição é
  recusada **inteira**, sem nada dela na sala, quando põe ou tira uma entrada de
  um id que a conta não vê (um marcador, um pin, um id que só o arquivo tem),
  quando uma entrada não é o elemento da sua chave, quando faz um pin secreto,
  quando um cartão que ela faz ou muda nomeia um arquivo que a conta não vê
  **ou que não existe** (assim um cartão não serve para perguntar se um
  arquivo oculto existe), ou quando muda o que qualquer outro elemento é para a
  conta (um grupo aberto, uma aresta para um pin). Elementos novos e mudanças
  nos que ela vê entram na sala pelas mãos do servidor, como edições dele,
  mescladas por elemento como diz o 0082 item 12, e contadas às outras janelas;
  dos fatos do board ela muda a contagem de edições e o fundo. `write_text`,
  `write_board` e `sync_put` de um board continuam recusados a um jogador, e
  `collab_resolve` também (fecha a sala para todos).
- **Quem escreve o arquivo.** A janela do mestre, quando está na sala: ela faz o
  arquivo da sala inteira, como sempre, e o arquivo de um jogador é descartado.
  Só com jogadores nela, o arquivo que a janela de um jogador fez da sua sombra
  (`collab_canvas`, no estado da sombra) é **posto sobre o arquivo do disco**
  (`board_sight::lay_over`): o que a conta não vê é o do disco, byte a byte; o
  que vê é dela; o que a janela largou, ela apagou; e um canvas que mudaria o
  que um elemento é para ela não é aceito. Um board desenhado só por um jogador
  (sem o mestre ainda) é desenhado só na sombra; a janela do mestre desenha o
  todo quando chega, e as versões se mesclam por posto.
- **Quando o que um elemento é para uma conta muda** — um pin que virou secreto,
  o arquivo de um cartão liberado ou oculto, o nível mudado — a sombra da conta
  é fechada: suas janelas ouvem que a sala fechou (`collab-closed`) e entram de
  novo, pelo arquivo, como os leitores de uma nota (`veil_changed`; uma mudança
  dentro da sala pelo mestre é vista por `sync`). Um mestre rebaixado ao vivo
  sai de toda sala como antes (`demoted`).
- **O que mais é cortado.** A seleção numa presença só nomeia um elemento quando
  a conta que recebe o vê (`presence::keep_selected`); o `collab-saved` chega a
  uma sombra sem o hash do arquivo; o `access_get` conta os blocos secretos dos
  cartões de texto de um board (não os de um pin) e o diálogo pergunta antes de
  dar *Edita* num board que tem, e diz o que o jogador vê. O `campaign_grant`
  aceita um board. As recusas que o passo apaga são as do board em `rpc_collab` e
  em `campaign_grant`; a de `collab.rs` fica para a janela que só lê.
- **Testes.** Duas propriedades sobre salas feitas ao acaso
  (`board_sight_tests.rs`): *nenhum id ou texto oculto chega a um jogador* e
  *uma atualização a um id não visto é recusada*, cada uma vista falhar com uma
  regra errada (um pin não oculto, a checagem pulada, o arquivo deixado num
  marcador); e `tests_board_players.rs` contra um servidor de verdade (todo
  quadro que a Ana ouve é conferido contra os canários; as edições dela chegam
  ao mestre; as recusadas não deixam rastro; o arquivo guarda o pin, o cartão
  oculto e sua aresta byte a byte; o diálogo; o fechamento da sombra). O teste
  de ponta a ponta é `e2e-server/board-players.spec.mjs`.
- **Escolhido onde o ADR cala, a confirmar.** (1) O cartão de um arquivo oculto
  é *Trancado*, nunca ausente: a palavra do mantenedor (*um marcador trancado
  com o mesmo id*). (2) Um
  cartão de texto do board é inteiro para quem edita (H, 0087 item 5) — com seus
  links para notas ocultas, como uma nota que ele edita os mostra. (3) Um
  jogador não resolve um conflito entre a sala e o disco. (4) A presença do
  mestre (o ponteiro) é contada ao jogador; só os ids que ele seleciona são
  cortados. (5) O board sincronizado de um jogador no desktop (S8) não foi
  tocado.
- **Revisão do S7 (2026-10-25).** (1) *Sem oráculo de atividade*: uma sombra só
  ouve `seeded` e `background` dos fatos da sala, nunca a contagem de edições dos
  outros; o `saved` dela é feito para a conta (a contagem das próprias edições,
  movida quando a sala escreve), e a revisão que ela ouve do arquivo — no
  `join`, no `read_text`, no `collab-saved` — é um hash do texto que ela vê, de
  modo que salvar o que ela não vê não é nada para ela. (2) A presença contada a
  um jogador é uma lista de campos permitidos (`user`, `pointer`, `button`,
  `selected` cortado ao que ela vê). (3) O arquivo dela é posto sobre o do disco
  quando nenhuma janela *que pode digitar* e vê o board inteiro está na sala — uma
  só de leitura não conta. (4) E só quando o arquivo não falta nada do que as
  janelas do board inteiro deixaram sem salvar (`Board::whole_saved`): senão nada
  é escrito, o trabalho dela fica na sala e o arquivo é escrito quando uma janela
  inteira o faz — nenhum lado é descartado. (5) Uma marca secreta é lida como a
  projeção do arquivo a lê, toda chave repetida. (6) O que um jogador desenha na
  sombra antes de o mestre desenhar a sala (a semeadura) fica só na sombra; nunca
  chega à sala, e as versões da própria sala das mesmas chaves o substituem quando
  chegam.
