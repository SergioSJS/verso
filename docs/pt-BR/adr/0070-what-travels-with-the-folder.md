# ADR 0070 — O que viaja com a pasta: três camadas de configuração, e nomes que todo sistema guarda

- Data: 2026-10-08
- Fonte: o mantenedor, em sessão: "como teremos sincronizadores entre
  plataformas. Temos que levar isso em conta. Se a config ficar fora da
  pasta, não vai sincronizar e a barra tem que funcionar de qualquer
  jeito"; depois, diante de três passos — observar o Obsidian, escrever este
  ADR, recusar em todo sistema os nomes que o Windows não guarda —, "Faça os
  3".
- Relacionados: [0010](0010-folder-is-the-unit-no-vault.md) (sem vault),
  [0011](0011-config-outside-tree-index-as-cache.md) (configuração fora da
  árvore, o índice um cache), [0021](0021-sync-automerge-layered-config.md)
  (configuração em camadas, Proposto), [0052](0052-typed-note.md) (schemas
  na pasta), [0062](0062-focuses.md) (focos em `.space/waypoints.json`),
  [0069](0069-windows-port.md) (o porte para Windows, o `[OPEN]` do
  separador — decidido `/` em 2026-10-09).
- Status no briefing: não presente
- Revisões: 2026-10-09 — com a aceitação do
  [0073](0073-self-hosted-server-first.md) pelo mantenedor naquele dia: num
  servidor a camada da pessoa mora com a conta (0073 item 5), e as origens
  de embed aprovadas e o conteúdo remoto são do leitor — um ajuste da
  pessoa, nunca do autor da nota nem da pasta (0073 item 6), o que fecha o
  `[OPEN]` deste ADR sobre elas. O texto abaixo fica, com uma nota onde
  trata disso.
  2026-10-12 — os itens 1 e 2, a camada de ajustes da pasta em
  `.verso/`, aceitos pelo mantenedor para a próxima rodada, respondendo à
  auditoria dos ADRs em sessão: *"Ajuste tudo que precisar. Está aprovado os ADRs"*; a
  retenção de uma pasta do desktop no
  [0080](0080-the-trash-with-expiry-and-restore.md) espera por eles.
  2026-10-12 — os itens 1 e 2 construídos no mesmo dia, com o *"Ajuste
  todas essas pendências agora"* do mantenedor (branch
  `feat/folder-settings`): a camada da pasta é um arquivo,
  `.verso/settings.json` — JSON, chaves em ordem, recuo de dois espaços,
  uma quebra de linha no fim, chaves desconhecidas mantidas em toda
  escrita — com `bookmarks`, `folderNoteName`, `ignoreBuildDirs` e
  `respectGitignore`. Abrir, percorrer e ler uma pasta nunca o criam; a
  primeira mudança cria, por uma criação que falha quando já há algo ali,
  e toda escrita seguinte vai sobre a versão lida (invariantes 7, 9, 11).
  Quando a pasta tem um arquivo utilizável, valem os valores dele, e uma
  chave que ele não define fica no padrão; quando não tem, ou tem um que
  não dá para ler agora (um placeholder, um que não é JSON), valem os
  desta máquina, como antes. Na primeira abertura de uma pasta, os
  favoritos que esta máquina guardava para ela entram nela uma vez — só
  numa pasta sem arquivo de ajustes, marcados como movidos nesta máquina;
  a primeira escrita do arquivo leva as regras de varredura e o nome da
  nota de pasta desta máquina quando não são os padrões, para que criá-lo
  não mude nada do que a pessoa vê. `.verso/` e as entradas simples dele
  são o único caminho oculto que o `verso-fs` confina como um arquivo e
  que o observador relata; a varredura, o índice e a árvore nunca o
  listam, a sincronização o lista à parte e o leva como qualquer arquivo
  — um conflito guarda a outra versão ao lado, em `.verso/`
  ([0079](0079-sync-a-local-folder-with-a-server.md) item 8) —, e um
  compartilhamento de uma pasta de servidor nunca o leva
  ([0081](0081-sharing-between-people-on-one-universo.md)). Os Ajustes
  marcam cada um dos três como "Da pasta" ou "Desta máquina". Duas
  leituras que o texto não resolvia, feitas pelo autor e `[ABERTO]` para
  o mantenedor: "os caminhos ignorados" lidos como os caminhos ignorados
  do [0044](0044-verso-fs-semantics.md) que a janela tem como ajuste — as
  chaves das pastas de build e do `.gitignore`, que o servidor já tratava
  como da pasta —, não o "Ocultar da árvore", que o
  [0060](0060-makemd-organizing-features.md) diz não ser os caminhos
  ignorados do 0044 e que fica desta máquina; e o nome do arquivo,
  `settings.json`, que nenhum documento nomeava *(as duas fechadas em
  2026-10-12, abaixo)*.
  2026-10-12 — o mantenedor, por volta das 16:00 BRT, sobre as sete
  decisões abertas da rodada, todas como recomendado: *"Todos
  aprovados"*. Para este ADR: as duas leituras acima estão decididas — o
  arquivo é `.verso/settings.json`, e "os caminhos ignorados" são as duas
  chaves "Ignorar pastas de build" e "Respeitar .gitignore", enquanto o
  "Ocultar da árvore" fica desta máquina
  ([0060](0060-makemd-organizing-features.md)). Itens 1–2: os favoritos
  de um leitor voltam para esta máquina — quando a conta não pode
  escrever a camada da pasta (um leitor de uma pasta de servidor, na
  janela dele ou sincronizada num computador; a janela de um
  compartilhamento; um arquivo de ajustes que é um placeholder ou não é
  JSON), marcar uma nota com estrela lê e escreve os favoritos que esta
  máquina guarda para a pasta, onde eles moravam antes dos itens 1–2, em
  vez de ser recusado, e os Ajustes os marcam "Desta máquina"; as regras
  de varredura e o nome da nota de pasta ficam da pasta, que essa conta
  lê. Item 3: um nome novo que só difere em maiúsculas e minúsculas de uma
  entrada que a pasta dele já lista também é recusado (a revisão do item
  3; spec Q8). Construído no mesmo dia (branch
  `feat/decisions-2026-10-12`).
  2026-10-14 — a camada da pasta do item 2 ganha os ajustes das notas
  periódicas — os formatos, as pastas, os templates, os períodos ligados e
  o início da semana —, pelo item 4 do [0093](0093-periodic-notes.md),
  aceito pelo mantenedor naquela noite (*"Sim, todas"*); a pasta das notas
  diárias se muda para lá uma vez.

## Contexto

Uma pasta de notas é feita para ser sincronizada entre máquinas e sistemas —
iCloud, OneDrive, Syncthing, git — e aberta no Verso no macOS, no Windows e
no Linux. O ADR 0011 pôs a configuração fora da pasta, pela chave do caminho
da pasta, e registrou o custo: "uma pasta sincronizada entre máquinas não
leva a sua configuração junto".

O que vive fora da pasta em 2026-10-08:

| Onde | O quê | De quem |
|---|---|---|
| o diretório de configuração (`~/Library/Application Support/verso`, `%LOCALAPPDATA%\verso`) | o índice (um cache), o arquivo lateral dele, o log | desta máquina |
| o armazenamento do web view | a largura da barra lateral, quais painéis estão abertos | desta máquina |
| o armazenamento do web view | as configurações (idioma, tema, …, e também os caminhos ignorados, o nome da nota de pasta, as origens de embed aprovadas) | desta máquina, embora algumas sejam da pasta |
| o armazenamento do web view, pela chave do **caminho absoluto** da pasta | os favoritos da pasta | desta máquina; perdidos mesmo onde o armazenamento sincronizasse, porque o caminho muda |

Já dentro da pasta: as notas, os boards, os schemas
([0052](0052-typed-note.md), a escolha do mantenedor pela pasta em vez do
diretório de configuração), a ordem manual de uma pasta na nota da pasta, os
focos em `.space/waypoints.json` ([0062](0062-focuses.md)).

Observado no Obsidian em 2026-10-08
([obsidian-paths-names-2026-10-08.md](../reference/obsidian-paths-names-2026-10-08.md)):
uma `\` num link é parte do nome, não separador; no macOS o Obsidian recusa
só `\ / :` num nome e cria `? * | " < >` e `CON` — nomes que uma pasta
sincronizada com o Windows não consegue levar; no Windows ele recusa
exatamente esses, a regra que o item 3 adota.

## Decisão

1. **Três camadas de configuração** (proposto; aceito em 2026-10-12,
   construído em 2026-10-12):
   - **as da máquina**, nunca sincronizadas: o índice, o arquivo lateral
     dele, o log, o layout da janela. Onde estão hoje (ADR 0011 sem
     mudança).
   - **as da pasta**, sincronizadas com ela porque são sobre ela: o que
     qualquer pessoa que abrir a pasta deve encontrar igual. Vivem dentro
     da pasta, num diretório oculto escrito só quando uma delas muda pela
     primeira vez — nenhuma pasta ganha um diretório que não pediu (ADR
     0011, regra 1 mantida) —, em arquivos escritos pela escrita atômica do
     `verso-fs` (invariantes 9 e 11), todo caminho neles relativo à pasta e
     com `/`, nenhum absoluto (invariante 4).
   - **as da pessoa**, que seguem o usuário entre pastas (idioma, tema,
     teclas): ficam na máquina até a sincronização em camadas
     ([0021](0021-sync-automerge-layered-config.md)) lhes dar um lugar.
     *(Num servidor, desde 2026-10-09: a conta é o lugar delas,
     [0073](0073-self-hosted-server-first.md) item 5.)*
2. **A camada da pasta, conteúdo proposto** *(aceito em 2026-10-12,
   construído em 2026-10-12, em `.verso/settings.json`)*: os favoritos, os caminhos
   ignorados, o nome da nota de pasta. Na primeira abertura de uma pasta
   depois disso, o que a máquina guardava dela vai para a pasta, uma vez.
3. **Nomes que todo sistema guarda. Decidido pelo mantenedor em
   2026-10-08**: uma nota, pasta ou arquivo que o Verso **cria ou renomeia**
   recebe um nome que macOS, Windows e Linux guardam. Recusados em todo
   sistema: um nome de dispositivo (`CON`, `PRN`, `AUX`, `NUL`,
   `COM0`–`COM9`, `LPT0`–`LPT9`, com ou sem extensão), ponto ou espaço no
   fim, `:`, `* " < > ? |`, um caractere de controle, e a `\` (**decidido
   pelo mantenedor em 2026-10-08**, "pode recusar": o Obsidian a recusa no
   macOS e no Windows; no macOS e no Linux ela é um byte comum de um nome
   que o Windows não guardaria). Uma entrada que já
   existe nunca é recusada: é do usuário, abre, é lida e escrita como
   antes; só um nome novo é checado. No Windows, onde esses nomes nem
   existem, todo pedido é checado (ADR 0069).
   *(Revisado em 2026-10-12, com o "Todos aprovados" do mantenedor, que
   fecha a spec Q8 para os nomes que o Verso cria:)* recusado também, em
   todo sistema e no servidor, um nome novo que só difere em maiúsculas e
   minúsculas de uma entrada que a pasta dele já lista — `nota.md` criado
   ao lado de `Nota.md`, ou um arquivo renomeado para `NOTA.md` ali: dois
   arquivos no Linux e no ext4 de um servidor, um só num Mac ou no
   Windows, que guardaria só um deles. A recusa diz o porquê, como as
   outras, na língua da pessoa. Um arquivo renomeado para o próprio nome
   em outra caixa é permitido
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 10); duas
   entradas que já diferem só na caixa, feitas em outro lugar, ficam,
   abrem e mudam como antes, e só uma terceira grafia do nome delas é
   recusada.
4. **O separador**: o que o Verso escreve usa `/`, que o Obsidian resolve em
   todo sistema (ADR 0069, item 9). Uma `\` dentro de um link é parte do
   nome, como o Obsidian a lê no macOS: nunca vira `/`. As palavras do
   mantenedor acima apontam para `/`; fechar o `[OPEN]` do ADR 0069 cabe a
   ele. *(Fechado pelo mantenedor em 2026-10-09: `/`, definitivo — ADR
   0069 item 9.)*

## Consequências

- Uma pasta sincronizada com outra máquina abre com os seus favoritos, os
  seus caminhos ignorados e o nome da sua nota de pasta; a largura da barra
  lateral e o idioma continuam de cada máquina.
- Duas máquinas mudando uma configuração da pasta ao mesmo tempo deixam para
  a ferramenta de sincronização juntar o arquivo, ou guardar uma cópia de
  conflito; a checagem da escrita atômica (invariante 11) se recusa a
  escrever por cima de uma versão que não leu. Juntar é trabalho da
  sincronização em camadas ([0021](0021-sync-automerge-layered-config.md)).
- Se o Obsidian lista um diretório oculto do Verso no explorador de arquivos
  dele é algo a observar antes de escolher o nome (ADR 0009).
  *Observado em 2026-10-12, de fora (ADR 0009), não é uma decisão:* o
  Obsidian 1.14.4 (instalador 1.11.5) no macOS não inclui `.verso/` no seu
  cofre. Com `.verso/settings.json` (`{}`) e um controle visível
  `verso-probe/control.md` criados na raiz do cofre de teste `Sandbox`, o
  `eval` da CLI deu: `app.vault.getAllLoadedFiles()` contém `verso-probe`
  e `verso-probe/control.md` e nenhum caminho começando com `.`;
  `app.vault.getAbstractFileByPath('.verso')` e
  `('.verso/settings.json')` são `null`;
  `app.metadataCache.getCache('.verso/settings.json')` é `null`; os
  comandos `files` e `folders` da CLI listam o controle e não `.verso`. O
  adaptador de disco o enxerga: `app.vault.adapter.exists('.verso/settings.json')`
  é `true` e `app.vault.adapter.list('/')` cita `.verso` ao lado de
  `.obsidian`. O mesmo depois de recarregar a janela
  (`command id=app:reload`). O explorador de arquivos em si não foi lido:
  nesse cofre o painel dele é a visão de um plugin (make.md), então o que
  fica registrado é a lista de arquivos do próprio cofre, que deixa
  `.verso/` de fora. As duas sondas foram removidas em seguida.
- Um nome que o Obsidian aceita no macOS pode ser recusado pelo Verso: mais
  estrito, nunca contrário — nenhum nome existente muda de sentido
  (invariante 12).
- Os campos de nova nota e de renomear da interface dizem por que um nome é
  recusado.

## Alternativas descartadas

- **Tudo na máquina, como hoje**: uma pasta sincronizada chega sem os seus
  favoritos e caminhos ignorados; os favoritos se perdem até na mesma
  máquina quando a pasta muda de lugar, porque a chave deles é o caminho.
- **O diretório `.obsidian/` do Obsidian**: o Verso escrevendo a
  configuração do próprio Obsidian arrisca contradizê-lo, e esses formatos
  não são públicos (ADR 0009, ADR 0030).
- **No frontmatter das notas**: o estado do app reescreveria as notas do
  usuário (invariante 8).
- **Recusar os nomes do Windows só no Windows**: um nome criado num Mac
  depois quebra a sincronização da pasta com o Windows.

## Status

Decidido em partes: o item 3 (2026-10-08); o separador do item 4, `/`, e o
nome do diretório oculto, `.verso/` (2026-10-09). Os itens 1 e 2, a
camada da pasta em `.verso/`: aceitos em 2026-10-12 e construídos no
mesmo dia (Revisões); a retenção de uma pasta do desktop no
[0080](0080-the-trash-with-expiry-and-restore.md) esperava por eles.
Fechadas pelo mantenedor em 2026-10-12 (*"Todos aprovados"*), as duas
leituras `[ABERTO]` da construção até então: "os caminhos ignorados" são
as chaves das pastas de build e do `.gitignore`, o "Ocultar da árvore"
fica desta máquina, e o arquivo é `settings.json` (Revisões). Decidido no
mesmo dia: os favoritos de um leitor são desta máquina (itens 1–2), e o
item 3 recusa um nome novo que só difere em maiúsculas e minúsculas de
uma entrada da pasta dele (spec Q8). *(Até 2026-10-12: "Proposto: os
itens 1 e 2"; depois, "aceitos, para construir na próxima rodada".)*

*(Histórico, a abertura até 2026-10-12:)* Proposto. Decidido pelo
mantenedor em 2026-10-08: o item 3 (nomes que todo sistema guarda, para o
que o Verso cria ou renomeia). Proposto: os itens 1, 2 e 4 *(o separador
do item 4 decidido no dia seguinte, abaixo)*. Decidido pelo mantenedor em 2026-10-09: o diretório oculto é
**`.verso/`**, como o do Obsidian é `.obsidian/` ("Se inspire no
obsidian"); o separador do ADR 0069 é `/`, definitivo. `[ABERTO]`: se as
origens de embed aprovadas são da pasta ou da pessoa (uma permissão dada a
um site, não uma propriedade das notas) *(fechado em 2026-10-09,
abaixo)*. Fechado em 2026-10-08: a `\` entra nos
caracteres recusados do item 3 em todo sistema (levantado pela revisão
daquele dia).

Fechado em 2026-10-09, com a aceitação do
[0073](0073-self-hosted-server-first.md): as origens de embed aprovadas
são da pessoa — um ajuste do leitor (a conta num servidor), nunca do autor
da nota nem da pasta (0073 item 6).
