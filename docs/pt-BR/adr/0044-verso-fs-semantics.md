# ADR 0044 — Semântica de `verso-fs`: symlinks, handles opacos e caminhos ignorados

- Data: 2026-09-21
- Fonte: `docs/review/phase-0.md` R3, I6, L5, R11
- Status no briefing: não consta
- Revisões: 2026-09-22 — symlinks, laços e caminhos ignorados decididos pelo
  mantenedor sobre o memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md); o watcher
  colocado depois da feature 2; o grupo dos handles opacos intocado e ainda
  `[ABERTO]`. 2026-09-22 — fatos do código da feature 2 registrados dentro dos
  dois grupos decididos: o caminho de escrita de um symlink (decidido, decorre
  da escolha) e três itens marcados como **provisórios**, para o mantenedor
  confirmar ou mudar; mais dois itens provisórios vindos da segunda leitura
  desse código — raiz absoluta, e handle para nome de placeholder. 2026-09-24
  — o watcher construído, provisoriamente, sobre o memo
  [`docs/reference/watcher-decision.md`](../reference/watcher-decision.md),
  que lista o que o mantenedor decide; os grupos deste ADR ficam intocados.
  2026-09-24 — **decidido pelo mantenedor**, na sessão: o watcher, sobre o
  memo dele, com todas as recomendações aceitas; e o grupo dos handles
  opacos, sobre o memo
  [`docs/reference/handles-decision.md`](../reference/handles-decision.md),
  decidido como construído para a Fase 2 e reaberto antes que qualquer coisa
  fora das views do próprio app ganhe acesso a arquivos. Os dois registrados
  na Decisão; as linhas que diziam o grupo aberto ficam, cada uma com uma
  nota. 2026-09-29 — uma contradição `[ABERTO]` registrada no grupo dos
  caminhos ignorados: o commit `e5754b0` implementou uma lista embutida de
  diretórios ignorados e a leitura do `.gitignore`, as duas descartadas por
  este ADR. Nada decidido; o status não muda. 2026-09-29 — **essa
  contradição decidida pelo mantenedor** no mesmo dia, na sessão: os dois
  comportamentos aceitos, feitos direito e atrás de ajustes — a semântica do
  próprio git para o `.gitignore`, pelo crate `ignore`, e a lista embutida e
  o `.gitignore` cada um atrás de uma chave, ligados por padrão. Registrado
  numa seção própria depois do grupo dos caminhos ignorados; as linhas de
  2026-09-22 que ela revê ficam, cada uma com uma nota. 2026-10-09 — **o
  grupo dos handles respondido para o `verso serve`, e os symlinks num
  servidor, decididos pelo mantenedor** com a aceitação do
  [0073](0073-self-hosted-server-first.md) naquele dia: uma nota continua
  nomeada pelo caminho relativo e a capacidade de acesso é a sessão e o
  papel dela na pasta; um symlink que sai da pasta é recusado num servidor.
  Registrado numa seção própria, "Num servidor", depois do grupo dos
  handles; a pasta local do desktop não muda, e as linhas que isso revê
  ficam, cada uma com uma nota.
  2026-10-12 — um comportamento de "Num servidor" mudado pelo commit
  4ffe8a9, a correção de uma corrida, e registrado naquela seção —
  **confirmado pelo mantenedor** na mesma noite, "Ok": um symlink pendente
  cujo alvo fica dentro da pasta é tratado como um arquivo novo dentro, e
  não mais recusado como um link que sai. Decidido por essa confirmação
  (Status).
  2026-10-12 — os registros provisórios de 2026-09-22 ratificados pelo
  mantenedor como construídos e testados, respondendo à auditoria dos
  ADRs em sessão: *"Ajuste tudo que precisar. Está aprovado os ADRs"*; uma
  nota datada ao lado de cada um.
  2026-10-22 — T.12, opção B (o mantenedor respondeu a lista de decisões da
  tarde de 2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`) em
  2026-10-22): importar um arquivo grande (um PDF de 200 MB) passa a ser lido
  e gravado **aos pedaços já**, sem mantê-lo inteiro na memória antes da
  gravação atômica; o mantenedor escolheu "Fazer aos pedaços já" em vez de
  aceitar por ora. Isso muda a gravação atômica do `verso-fs`; **em
  construção**. A gravação continua atômica pela invariante 9 e pela [ADR
  0029](0029-guardrails-in-ci.md). Ver `docs/review/accessibility.md`
  (A11Y.10).

## Contexto

O guardrail de confinamento de caminho ([0029](0029-guardrails-in-ci.md)) e a
regra dos handles opacos ([0026](0026-core-ui-contract-inviolable-rules.md))
existem como princípio, mas nenhum documento diz o que acontece nos casos que
decidem se eles funcionam. A revisão da Fase 0 levantou três grupos de perguntas
que precisam de resposta antes de `verso-fs` existir.

## Decisão

Os três grupos estão decididos: symlinks e caminhos ignorados em 2026-09-22,
os handles opacos em 2026-09-24, como construídos para a Fase 2 e com o
momento de reabri-los; os caminhos ignorados foram revistos em 2026-09-29. O watcher, que veio depois da feature 2, foi decidido
em 2026-09-24 também. Os handles e os symlinks foram decididos para um
servidor em 2026-10-09 ("Num servidor", abaixo).

### Symlinks e laços — decidido em 2026-09-22

Decidido pelo mantenedor em 2026-09-22, sobre o memo
[`docs/reference/fs-decision.md`](../reference/fs-decision.md), seção 2:

- **Todo symlink é seguido** — opção (c) do memo. Symlink dentro da pasta
  apontando para fora é atravessado, e o que ele alcança é lido como qualquer
  outra entrada: sem teste de o alvo continuar dentro da raiz, sem recusa. Um
  symlink dentro da pasta é do usuário, e segui-lo é justamente o ponto.
  *(Num servidor com membros, desde 2026-10-09: um symlink é seguido só
  quando o alvo fica dentro da pasta — "Num servidor", abaixo. A pasta
  local do desktop mantém esta regra.)*
- **Profundidade máxima 64.** Bater no limite é **erro registrado, nomeando o
  caminho**, nunca silêncio; a varredura segue com o resto da pasta. É o mesmo
  princípio da linha de sistemas de arquivos de rede do
  [0029](0029-guardrails-in-ci.md): limite é reportado, não aplicado em
  silêncio.
- **Laços são detectados pelo par (device, inode) de todo diretório já
  entrado**, junto com o limite de profundidade. Isso decorre da escolha, não é
  uma decisão à parte: seguir todos os symlinks torna ciclos possíveis, então o
  conjunto de diretórios visitados é obrigatório, e o limite continua
  necessário porque dois symlinks constroem um caminho arbitrariamente fundo
  que nunca repete um diretório.
- **Hard links: dois caminhos são duas notas.** O índice é chaveado por
  caminho, então um inode com dois nomes aparece duas vezes, e uma edição por um
  dos nomes aparece nos dois porque o inode é um só. Se a escrita atômica
  detecta e avisa que o `rename` quebra o hard link continua onde o
  [0029](0029-guardrails-in-ci.md) colocou, dentro dos requisitos da escrita
  atômica; não é respondido aqui.
- **Aliases do macOS são arquivos comuns, por caminho.** Um alias do Finder é um
  arquivo com dados de alias dentro e uma flag `kIsAlias`; o sistema de arquivos
  não o resolve. Não é symlink, e não é seguido.
- **O limite de `inotify` no Linux vai junto com o watcher**, não com a feature
  2. Comportamento registrado, a implementar quando o Linux virar alvo: ao
  esgotar, degradar para varredura periódica com aviso exposto pelas
  capacidades de runtime ([0027](0027-runtime-capabilities.md)) — nunca falhar
  em silêncio, nunca fingir que a pasta parou de mudar.
- **Escrita através de um symlink cai no alvo do symlink, e o link continua
  lá.** Seguir um symlink tem uma metade no caminho de escrita, e ela não é
  opcional: a escrita atômica resolve o link e substitui o arquivo para o qual
  ele aponta. Um `rename` por cima do próprio link substituiria o link por um
  arquivo comum e deixaria o arquivo real do usuário intocado e desatualizado —
  a nota pareceria salva sem estar. Registrado aqui porque decorre de "todo
  symlink é seguido"; foi reproduzido na leitura do código da feature 2 e
  corrigido lá.

**Provisório, registrado em 2026-09-22 a partir do código da feature 2, não
decidido.** *(Ratificado pelo mantenedor em 2026-10-12, como construído e testado: "Ajuste tudo que precisar. Está aprovado os ADRs".)* O mantenedor decide isto ao acordar; está aqui porque o código
precisou escolher alguma coisa, e escolha não registrada é pior do que escolha
registrada:

- **Diretório alcançado uma segunda vez por outro nome é listado uma vez e
  percorrido uma vez.** Dois symlinks para a mesma pasta de anexos produzem duas
  entradas; o conteúdo é percorrido só sob o primeiro nome, e o segundo é
  reportado como problema `Duplicate`. É provisório porque este mesmo ADR diz
  que dois caminhos com hard link são duas notas, e o mantenedor pode preferir
  que a segunda subárvore também seja percorrida. O preço de percorrer: dois
  symlinks para uma pasta grande dobram essa pasta no índice, e uma cadeia deles
  cresce exponencialmente, limitada apenas pela profundidade máxima de 64.
- **A raiz é tornada absoluta na abertura da pasta, e não canonicalizada.** Uma
  raiz relativa mais uma mudança posterior do diretório de trabalho do processo
  redirecionaria todo handle derivado dela: mesmo nome de pasta, outra pasta,
  sem erro nenhum em lugar algum. Torná-la absoluta na abertura fecha isso. Não
  canonicalizá-la é a outra metade: uma raiz que é ela própria um symlink
  mantém o nome que o usuário digitou, que é o nome que ele vê em toda
  mensagem. Provisório porque canonicalizar uma vez na abertura é alternativa
  defensável — também consertaria o que o `wrote_through_symlink_to` reporta,
  que hoje nomeia o caminho como foi dado, e não aquele onde os bytes caíram.

### Caminhos ignorados — decidido em 2026-09-22

Decidido pelo mantenedor em 2026-09-22, sobre o mesmo memo, seção 3. Esta é
também a resposta da Q26 de [`docs/spec/dialect.md`](../spec/dialect.md):

- **Entradas ocultas não são percorridas, em nenhuma profundidade.** Nome que
  começa com `.` é pulado, o que cobre `.obsidian/`, `.git/` e `.trash/` sem uma
  lista curada de nomes para manter atualizada.
- **O padrão de placeholder é reconhecido antes da regra de oculto.** Um irmão
  chamado `.Nome.ext.icloud` começa com ponto; ele é reportado como placeholder
  de `Nome.ext` ([0043](0043-placeholder-guard.md)) e nunca pulado como oculto,
  porque placeholder pulado lê como arquivo ausente, o que a invariante 10
  proíbe.
- **Mais uma lista configurável de caminhos relativos**, no diretório de
  configuração fora da árvore
  ([0011](0011-config-outside-tree-index-as-cache.md)), **vazia por padrão**.
  `node_modules/` não é oculto, então é percorrido a menos que o usuário o
  liste: é o preço de uma regra de uma frase em vez de uma blocklist.
  *(Revisto em 2026-09-29: a lista fica, vazia por padrão, e uma lista
  embutida de diretórios de build — `node_modules/` entre eles — é pulada ao
  lado dela, a menos que um ajuste a desligue; ver "Caminhos ignorados,
  revistos" abaixo.)*
- **`.gitignore` não é lido na Fase 1.** A gramática dele é um projeto à parte, e
  o modo de falha é nota sumindo em silêncio. *(Revisto em 2026-09-29: o
  `.gitignore` de cada diretório é respeitado, com a semântica do git, a menos
  que um ajuste o desligue; ver "Caminhos ignorados, revistos" abaixo.)*
- **Nota ignorada é alvo de link não resolvido e nunca é fonte de backlink.** Um
  `[[link]]` de uma nota visível para uma ignorada continua não resolvido; um
  link escrito dentro de uma nota ignorada não conta para nada — nem como
  backlink, nem como link não resolvido. Não percorrido significa não contado,
  nos dois sentidos, que é a regra única que a lista escrita à mão e o programa
  seguem no critério de saída 2 da Fase 1.
- **A lista de ignorados é confinada como um pedido, na abertura da raiz.** Uma
  entrada com caminho absoluto ou componente `..` é erro nesse momento, e
  `./anexos` é normalizado para `anexos`. Entrada escrita errada que ignora nada
  em silêncio é a falha pior: o usuário acredita que uma pasta está fora do
  índice e ela não está.

**Provisório, registrado em 2026-09-22 a partir do código da feature 2, não
decidido.**
*(Ratificado pelo mantenedor em 2026-10-12, como construído e testado:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **Handle é recusado para entrada oculta ou caminho ignorado.** `Root::handle`
  responde `ConfinementError::Hidden` ou `ConfinementError::Ignored`. O
  raciocínio que o código segue: a varredura não lista essas entradas, e a API
  de handles é a única porta que plugins e agentes têm
  ([0026](0026-core-ui-contract-inviolable-rules.md), regra 6), então ler
  `.obsidian/app.json` ou escrever `.git/config` por ela é recusado em vez de
  liberado por um caminho que ninguém listou. É provisório porque "não indexado"
  e "não legível de jeito nenhum" são duas regras diferentes, e ler `.obsidian/`
  pode muito bem ser desejável depois — um tema ou uma configuração de plugin é
  exatamente o tipo de coisa que se pode perguntar a um agente.
- **O handle é aceito quando o último componente tem a forma de placeholder.**
  `.Nota.md.icloud` passa, com a mesma precedência que a varredura aplica — o
  padrão de placeholder é reconhecido antes da regra de oculto
  ([0043](0043-placeholder-guard.md)) —, então uma entrada que a varredura
  listou pode ser nomeada de novo depois de um reinício. Handle recusado para
  algo que a varredura acabou de mostrar é a surpresa que isso evita. Todo outro
  componente começando com ponto continua recusado, como acima.

**`[ABERTO]` — o código contradiz este grupo, registrado em 2026-09-29.** O
commit `e5754b0` ("ignore build dirs") implementou, em
`crates/verso-fs/src/walk.rs`, as duas coisas que as Alternativas
descartadas deste ADR deixaram de lado:

- **Uma lista embutida de nomes de diretório ignorados**,
  `is_default_ignored_dir`: `node_modules`, `target`, `vendor`, `dist`,
  `build`, `out`, `env`, `venv`, `.venv`, `coverage`, `test-results`,
  `__pycache__` e mais onze, a maioria já oculta pelo ponto inicial. Um
  diretório com um desses nomes é pulado em qualquer profundidade, sem ajuste
  para desligar — contra "uma lista configurável de caminhos relativos, vazia
  por padrão".
- **A leitura do `.gitignore`**, `GitIgnorePattern`: todo `.gitignore` da
  pasta é lido, e as linhas dele são casadas por uma gramática pequena,
  própria. Uma linha que começa com `!` é pulada, então uma reinclusão
  (`!README.md` depois de `*.md`) não reinclui: o que ela nomeia continua
  oculto. Também não há como desligar — contra "`.gitignore` não é lido na
  Fase 1".

O watcher (`crates/verso-fs/src/watch.rs`) descarta eventos sob os nomes
embutidos mas não lê os padrões do `.gitignore`, então os dois caminhos até o
índice já não concordam sobre o que é ignorado.

O risco é o que este ADR previu quando descartou os dois: notas somem em
silêncio. Uma pasta do cofre chamada `build/`, `out/` ou `env/`, ou uma linha
ampla num `.gitignore` — um `*.md`, que a alternativa descartada deste grupo
cita — tira as notas dela do índice, da busca, dos backlinks e da reescrita
de links numa renomeação, sem nada na tela dizendo por quê. Pela regra única
deste grupo, uma nota ignorada também é alvo não resolvido e nunca fonte de
backlink.

O que está aberto, para o mantenedor: **ou** revisar este ADR para aceitar o
comportamento — aí a lacuna do `!` e a assimetria do watcher viram correções
a fazer, e vale decidir junto um jeito de desligar — **ou** mandar o código
voltar ao desenho decidido acima, uma lista de ignorados confinada no
diretório de configuração, vazia por padrão. Até lá o código e este ADR
discordam, e este ADR é o que foi decidido. *(Decidido em 2026-09-29, pelo
primeiro caminho: a seção seguinte.)*

### Caminhos ignorados, revistos — decidido em 2026-09-29

**Decidido em 2026-09-29 pelo mantenedor**, na sessão, respondendo ao
`[ABERTO]` acima: *"refaça a logica desse gitignore pra ficar mais aderente e
escalável"* e *"coloque em settings essa opção"*. Ignorar diretórios de
build e respeitar o `.gitignore` ficam aceitos, feitos direito e atrás de
ajustes. Isto revê duas linhas do grupo de 2026-09-22 — só a lista
configurável, e nada de `.gitignore` — e nada mais nele: entradas ocultas
continuam não sendo percorridas, o padrão de placeholder continua acima da
regra de oculto, a lista configurável continua confinada e vazia por padrão,
e uma nota ignorada continua alvo não resolvido e nunca fonte de backlink,
seja qual for a regra que a deixou de fora.

Como o autor construiu sob essa decisão (`crates/verso-fs`), no lugar do
casador parcial do commit `e5754b0`:

- **A semântica do próprio git, pelo motor do ripgrep.** A varredura lê o
  `.gitignore` de cada diretório com o módulo gitignore do crate `ignore` —
  o motor do ripgrep; só esse módulo, não a varredura própria do crate, que
  continua sendo a do `verso-fs`. Ela segue o git: `!` reinclui (`!keep.md`
  depois de `*.md`), `**` alcança qualquer profundidade, uma `/` no início
  ancora o padrão no diretório do arquivo dele (`/dist`), uma `/` no fim casa
  só diretórios (`logs/`), e um `.gitignore` mais fundo sobrepõe o de fora —
  decide o arquivo mais interno que tem opinião sobre a entrada. **Um
  diretório ignorado é podado inteiro**, então um `!` dentro dele nunca vale:
  limitação do próprio git, mantida de propósito em vez de melhorada, para
  que a pasta pareça a mesma para o Verso e para o git.
- **A lista embutida** (`is_default_ignored_dir`, em
  `crates/verso-fs/src/walk.rs`): 23 nomes de diretório — `node_modules`,
  `target`, `vendor`, `dist`, `build`, `out`, `env`, `venv`, `coverage`,
  `__pycache__` e semelhantes — pulados em qualquer profundidade. Ela casa só
  diretórios; um arquivo com um desses nomes é percorrido.
- **Os dois atrás de uma chave.** `WalkRules { builtin_ignores, gitignore }`
  (`crates/verso-fs/src/lib.rs`), os dois ligados por padrão. Os ajustes da
  janela — "Ignorar pastas de build" e "Respeitar .gitignore" — os definem
  pelo comando `set_walk_rules`; desligar qualquer um e reindexar traz de
  volta ao índice as entradas que ele tinha deixado de fora.
- **Testes**, em `crates/verso-fs/tests/walk.rs`:
  `gitignore_semantics_are_gits_own` (negação, âncora, só diretório, `**`,
  um arquivo mais fundo sobrepondo o de fora) e
  `walk_rules_turn_both_ignore_kinds_off`.
- **Uma dependência nova, `ignore`**, justificada em
  `crates/verso-fs/Cargo.toml`. A licença dela é dupla, Unlicense ou MIT;
  passa na allowlist do `cargo-deny` pela MIT
  ([0029](0029-guardrails-in-ci.md)).

**Um limite conhecido, aceito.** O watcher (`crates/verso-fs/src/watch.rs`)
descarta eventos sob os nomes embutidos quando essa chave está ligada, mas
não aplica os padrões do `.gitignore`: um evento traz um caminho sem a
cadeia de arquivos `.gitignore` acima dele de que os casadores precisam. Um
evento sob um caminho ignorado pelo `.gitignore` passa, então, e a varredura
que responde a ele continua deixando o caminho de fora — o índice sai certo,
ao custo de uma reindexação que não muda nada.

O que vira o risco registrado no `[ABERTO]` acima: uma nota deixada de
fora por uma linha de `.gitignore` ou por um nome embutido fica fora do
índice, da busca, dos backlinks e da reescrita de links numa renomeação,
como antes; os ajustes agora são o caminho para trazê-la de volta, e o `!`
do próprio git funciona como quem usa git espera.

### O watcher — depois da feature 2; decidido em 2026-09-24

Decidido pelo mantenedor em 2026-09-22, respondendo à contradição que o memo
registrou na seção 2.2: a feature 2 é **varredura, confinamento de caminho e
escrita atômica**, como diz a linha do roadmap. A descrição de `verso-fs` no
[0028](0028-crate-structure.md) — "handles opacos, watcher, escrita atômica,
confinamento" — fica como está, lida como a forma final do crate: o watcher
chega depois da feature 2, e nenhuma data é marcada para ele aqui.

**O watcher, decidido em 2026-09-24 pelo mantenedor**, na sessão, sobre o
memo [`docs/reference/watcher-decision.md`](../reference/watcher-decision.md),
seção 6: todas as recomendações aceitas, o código construído sob elas não é
mais provisório. As recomendações do autor no dia foram apresentadas numa
lista só, e a resposta foi *"Tirando o plano de fazer vários PR, eu gosto das
suas recomendações"*:

- **O `notify`** vigia a raiz (FSEvents no macOS, inotify no Linux), e só é
  informado o que a varredura lista.
- **Cada lote indexa a pasta inteira, por ora** — o único caminho que conhece
  placeholders, problemas da varredura e remoções. Atualizar só os caminhos do
  lote é o passo para pastas acima de alguns milhares de notas, medido com o
  benchmark quando houver uma em uso.
- **Um lote sai depois de 300 ms de quietude, ou 2 s depois da primeira
  mudança** quando as mudanças não param.
- **Uma nota aberta mudada fora, sem nada digitado, recebe o texto do disco
  como uma edição**, então o cursor e o histórico de desfazer ficam; **com
  texto ainda não salvo, é salva na hora**, o que encontra a diferença e
  mostra a faixa de conflito — a checagem do
  [0012](0012-files-are-source-of-truth.md) —, então nada é gravado por cima
  da mudança do outro app; **uma nota apagada ou movida fora mantém a aba,
  marcada**, e nada a recria.
- **Arquivos que não são notas, abertos numa aba, não são lidos de novo**, por
  ora.

O que o memo registra ao lado disso vale junto: uma pasta que o sistema não
vigia abre assim mesmo, com o motivo na linha de status, e a varredura
periódica registrada acima para o limite do `inotify` é construída quando o
Linux virar alvo (a seção 3.8 do memo).

### Handles opacos — decididos em 2026-09-24, como construídos para a Fase 2

**Decidido em 2026-09-24 pelo mantenedor**, na sessão, sobre o memo
[`docs/reference/handles-decision.md`](../reference/handles-decision.md),
opção (a), na mesma resposta do watcher:

- **Uma nota é nomeada pelo caminho relativo à pasta aberta** — no contrato,
  pelo MCP e na linha de comando —, como diz a regra 4 do
  [0026](0026-core-ui-contract-inviolable-rules.md), emendada em 2026-09-22.
  Pelo MCP é a decisão que o [0045](0045-server-and-mcp-security.md) tomou em
  2026-09-22, que é o texto que vale.
- **Nenhuma capacidade cruza o contrato.** O que deixa a janela ler e escrever
  é ser uma das views do próprio app, o que as capabilities do host conferem;
  a `revision` que uma escrita leva é o carimbo do que foi lido, não uma
  capacidade.
- **Dentro do `verso-fs`, um `Handle` é um índice na tabela de caminhos
  relativos da raiz**, válido só para aquele `Root` e neste processo: não
  sobrevive a um reinício, e depois de um renomear continua nomeando o caminho
  antigo. A janela entre checar um caminho e usá-lo continua aberta; com todo
  symlink seguido, uma travessia estilo `openat` não confinaria nada a mais na
  própria pasta do usuário.
- **Reaberto antes que qualquer coisa fora das views do próprio app ganhe
  acesso a arquivos** — um plugin
  ([0016](0016-plugins-execution-and-capabilities.md)), um cliente mobile
  ([0025](0025-own-server-and-mobile-pwa.md)), o `verso serve`. É quando uma
  capacidade precisa cruzar: um bookmark com escopo de segurança do iOS, uma
  URI SAF do Android.
  *(Para o `verso serve`, respondido em 2026-10-09 — "Num servidor",
  abaixo. Um plugin e um cliente mobile nativo ainda reabrem o grupo.)*

As perguntas como foram registradas primeiro, antes da feature 6 da Fase 1 e
do item 2.1 da Fase 2:

- O que um handle identifica: um descritor aberto (`openat`, imune a troca de
  caminho entre verificar e usar) ou um índice numa tabela de caminhos (a
  verificação continua sendo por string, e a janela de TOCTOU continua aberta).
- Estabilidade: o handle sobrevive a reinício do app? A rename do arquivo? A
  mudança de raiz de workspace ([0041](0041-multi-root-workspace.md))?
- O que o agente recebe pelo MCP como identificador de nota, e se esse
  identificador é o mesmo handle do contrato.
- Se o identificador estável acabar sendo o caminho relativo à raiz, a regra 4
  precisa dizer isso, em vez de fingir que não é.

### Num servidor — decidido em 2026-10-09

**Decidido em 2026-10-09 pelo mantenedor**, com a aceitação do
[0073](0073-self-hosted-server-first.md) (itens 3 e 6 dele), na resposta ao
plano daquela noite: *"… vc segue o recomendado"*. O grupo dos handles foi
reaberto para o dia em que o `verso serve` alcançasse arquivos; esta é a
resposta dele para o servidor, a opção (a) daquele plano:

- **Uma nota continua nomeada pelo caminho relativo à pasta.** Num
  servidor a capacidade de acesso é **a sessão e o papel dela na pasta**
  ([0074](0074-accounts-and-access-on-the-server.md) item 6), conferidos em
  todo comando e todo pedido de arquivo antes de o `verso-fs` agir. Anexos
  são servidos em `/f/<id-da-pasta>/<caminho relativo>` atrás dessa
  checagem ([0075](0075-server-packaging-and-storage.md) item 3, o id da
  pasta). **Nenhuma capacidade por arquivo cruza.** A regra 4 do
  [0026](0026-core-ui-contract-inviolable-rules.md) fica inalterada, com um
  esclarecimento datado lá.
- **A URL pré-assinada** de um bucket
  ([0073](0073-self-hosted-server-first.md) item 4) segue `[ABERTO]`, com o
  modo bucket.
- **Symlinks num servidor**: um symlink é seguido só quando o alvo fica
  dentro da pasta; um que sai da pasta é recusado. É a opção (b) do memo
  dos symlinks, descartada para a pasta de uma pessoa (Alternativas
  descartadas) e tomada para um servidor com membros, com os custos
  nomeados lá. A pasta local do desktop não muda: todo symlink é seguido,
  como decidido em 2026-09-22.

*Mudado em 2026-10-12 pelo commit 4ffe8a9; **confirmado pelo
mantenedor** na mesma noite, respondendo "Ok" à 01:15 BRT.* Veio de uma corrida. A
verificação do servidor canonicalizava um caminho e, quando isso falhava
com uma entrada no nome, recusava a entrada como um link que sai; um
arquivo sendo substituído naquele instante — ausente por um momento, ou
sem resolver enquanto um rename chega (o salvar de outro programa, um
sistema de arquivos de rede, um arquivo com exclusão pendente no
Windows) — era recusado assim, registrado como "um link que leva para
fora da pasta", e o servidor mantinha o estado antigo do arquivo até a
próxima varredura. A correção faz a verificação componente a componente,
lendo cada entrada em si: só um symlink pode levar um caminho para fora
da pasta; uma entrada comum, ou um arquivo final que não está lá, é
julgado pela pasta dele; um link cujo fim falta é julgado por onde o
texto dele aponta, os saltos limitados como o kernel limita um laço; um
`..` que não se resolve é recusado. Um link que sai é recusado como
antes, exista ou não o fim dele. O único comportamento que mudou junto:
**um symlink pendente cujo alvo fica dentro da pasta não é mais recusado
como um link que sai; é tratado como um arquivo novo dentro.** A pasta
local do desktop não muda: lá todo symlink é seguido.

## Consequências

- Nenhuma dessas respostas pode vir "no código": cada uma vira linha neste ADR
  (ou ADR próprio, se crescer) e fixture de `verso-fs`. **Ainda não existe
  schema de fixture para `verso-fs`** — `scripts/check-fixtures.sh` e a seção 4
  da spec do dialeto definem o schema só das fixtures de dialeto (memo, seção
  6). As duas decisões acima são, portanto, linhas neste ADR agora, e fixtures
  quando esse schema existir; escrevê-lo é parte da feature 2, não desta
  decisão.
- **O guardrail de confinamento de caminho muda de sentido, não de força.** Com
  todo symlink sendo seguido, confinamento é propriedade do **pedido**, não de
  para onde o conteúdo da própria pasta leva: um pedido com caminho absoluto,
  componente `..` ou byte NUL é recusado. Um symlink colocado dentro da pasta é
  do usuário, é seguido, e o que ele alcança conta como dentro da pasta para
  todos os efeitos — índice, MCP e plugins. O texto da linha do guardrail no
  [0029](0029-guardrails-in-ci.md) é corrigido de acordo, no mesmo PR desta
  revisão.
- Enquanto a semântica de handle estiver aberta, a regra 4 de
  [0026](0026-core-ui-contract-inviolable-rules.md) é uma restrição de forma
  (não expor string), não uma garantia de segurança. *(Decidida em 2026-09-24,
  como construída para a Fase 2: a Decisão acima. A regra 4 tinha sido
  emendada em 2026-09-22 — acesso cruza como handle, identidade como caminho
  relativo — e nenhuma capacidade cruza hoje, então o confinamento de todo
  caminho que um cliente envia é o que sustenta o peso dela.)*
- Os limites de recurso (profundidade, tamanho de arquivo, comprimento de linha)
  complementam Q17 da spec do dialeto: o fuzzing pega crash, não lentidão.

**A metade MCP do grupo dos handles como o código da feature 6 a implementa.
Registrado em 2026-09-22 a partir do código da feature 6 — provisório, o
mantenedor decide**, sob a §4 de `docs/reference/mcp-decision.md`. O grupo segue
`[ABERTO]`; isto é o que o código faz, não uma decisão. *(Decidido em
2026-09-24 como está escrito aqui, junto com o grupo: a Decisão acima.)*

- **O que o agente recebe como identificador de nota é o caminho relativo à
  raiz, como string, com `.md`** — a mesma string que o `list_notes`, o `search`
  e a CLI imprimem, e a única a partir da qual uma citação leva a algum lugar
  sem o servidor. Um caminho sem `.md` continua aceito, como o `backlinks` já
  aceitava.
- **O `Handle` opaco nunca sai do processo.** É o que o `verso-core` usa para
  chegar ao `verso-fs`; não aparece em nenhum argumento nem em nenhum resultado
  de ferramenta, e nada o serializa.
- **O confinamento é aplicado pelo `verso-core` a todo caminho que um cliente
  envia**, antes de tocar o índice ou o disco: o `Root::handle` recusa caminho
  absoluto, componente `..`, caminho vazio, byte NUL, componente oculto em
  qualquer profundidade e caminho ignorado. É aplicado **inclusive nas chamadas
  que só leem o índice** (`links`, `backlinks`), onde um caminho ruim não
  escaparia de nada — e é isso que faz da lista de recusas uma propriedade da
  superfície, e não da implementação de cada ferramenta.
- **A outra metade do grupo fica intocada**: o que um handle identifica dentro
  do processo (descritor aberto ou índice de tabela) e por quanto tempo vale
  segue `[ABERTO]`, para o item 2.1 da Fase 2. *(Decidido em 2026-09-24: um
  índice de tabela, válido só neste processo — a Decisão acima.)*

## Alternativas descartadas

Consideradas pelo mantenedor, sobre o memo, e postas de lado:

- **Symlinks: (a) não seguir nenhum** — o guardrail de confinamento seria uma
  verificação léxica em vez de uma regra de travessia, e é a única opção que
  poderia ser ampliada depois sem quebrar um vault que já funcionava. A prática
  da pasta de anexos por link simbólico é o que se perde com ela.
- **Symlinks: (b) seguir só enquanto o alvo ficar dentro da raiz** — exige
  canonicalizar toda entrada, uma regra para raiz que é ela própria um symlink,
  e deixa uma janela de TOCTOU que só travessia estilo `openat` fecha.
- **Caminhos ignorados: blocklist curada de nomes** (`.obsidian/`, `.git/`,
  `.trash/`, `node_modules/`) — uma lista sempre um nome desatualizada.
  *(Retomada em 2026-09-29 para diretórios de build, atrás de um ajuste:
  "Caminhos ignorados, revistos".)*
- **Caminhos ignorados: ler `.gitignore`** — a gramática inteira é um projeto à
  parte, e uma linha `*.md` no `.gitignore` de um repositório esvaziaria o
  vault. *(Retomada em 2026-09-29, por um motor existente da gramática
  inteira e atrás de um ajuste: "Caminhos ignorados, revistos".)*
- **Nota ignorada totalmente indexada, ou alvo que resolve** — "ignorado"
  passaria a significar "percorrido mas não contado", e o critério de saída 2
  dependeria de o mantenedor lembrar o que está em `.trash/`.

Consideradas pelo mantenedor em 2026-09-24, sobre o memo do watcher, e postas
de lado:

- **Uma varredura com timer** no lugar dos eventos do sistema operacional —
  uma varredura por período, mudando algo ou não; fica como o recurso para uma
  pasta que o sistema não vigia.
- **A API de cada sistema operacional direto** — mais um backend por
  plataforma, pela latência que o `notify` já tem.
- **Uma nota aberta marcada e lida quando pedido**, **uma aba com texto não
  salvo deixada para o autosave**, **a aba de uma nota sumida fechada** ou
  **uma movida seguida** — uma vista desatualizada, um conflito achado mais
  tarde, texto tirado da tela, ou um palpite que pareia uma remoção com uma
  criação.

E sobre o memo dos handles:

- **Handles de capacidade projetados agora** — um tipo de handle no contrato,
  uma regra de tempo de vida, uma tabela no host —, um projeto sem consumidor
  contra o qual testar, antes que exista um plugin, um cliente mobile ou um
  servidor.

Consideradas pelo mantenedor em 2026-09-29, sobre o `[ABERTO]` do grupo dos
caminhos ignorados, e postas de lado:

- **Voltar o código ao desenho de 2026-09-22** — um dos dois caminhos que o
  `[ABERTO]` apontava; o mantenedor escolheu o outro.
- **Manter o casador do commit `e5754b0` e consertar o `!` dele** — posto de
  lado pelo *"refaça a logica"*: uma gramática própria era o projeto de que
  este ADR tinha avisado, e um motor existente da semântica do git a
  substituiu.

## Status

Symlinks, laços e caminhos ignorados: decidido em 2026-09-22 pelo mantenedor,
Aceito; caminhos ignorados revistos em 2026-09-29 pelo mantenedor — a lista
embutida e o `.gitignore`, atrás de ajustes — Aceito. Handles opacos:
decididos em 2026-09-24 pelo mantenedor, como construídos para a Fase 2,
Aceito; reabertos antes que qualquer coisa fora das views do próprio app ganhe
acesso a arquivos; respondidos para o `verso serve` em 2026-10-09 ("Num
servidor"), Aceito. Symlinks num servidor: decididos em 2026-10-09 pelo
mantenedor, Aceito. O watcher: construído depois da
feature 2 e decidido em 2026-09-24 pelo mantenedor, Aceito. Os itens marcados
como **provisórios** dentro dos dois grupos decididos em 2026-09-22 não estão
decididos: são o que o código da feature 2 faz, registrados para que nada seja
resolvido por silêncio, e esperam o mantenedor. *(Ratificados pelo mantenedor em 2026-10-12,
como construídos e testados; Aceito.)* Um symlink pendente cujo alvo
fica dentro da pasta, num servidor, tratado como um arquivo novo dentro desde o
4ffe8a9 (2026-10-12, "Num servidor"): confirmado pelo mantenedor em
2026-10-12, Aceito.
