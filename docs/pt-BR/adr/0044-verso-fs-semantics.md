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
  este ADR. Nada decidido; o status não muda.

## Contexto

O guardrail de confinamento de caminho ([0029](0029-guardrails-in-ci.md)) e a
regra dos handles opacos ([0026](0026-core-ui-contract-inviolable-rules.md))
existem como princípio, mas nenhum documento diz o que acontece nos casos que
decidem se eles funcionam. A revisão da Fase 0 levantou três grupos de perguntas
que precisam de resposta antes de `verso-fs` existir.

## Decisão

Os três grupos estão decididos: symlinks e caminhos ignorados em 2026-09-22,
os handles opacos em 2026-09-24, como construídos para a Fase 2 e com o
momento de reabri-los. O watcher, que veio depois da feature 2, foi decidido
em 2026-09-24 também.

### Symlinks e laços — decidido em 2026-09-22

Decidido pelo mantenedor em 2026-09-22, sobre o memo
[`docs/reference/fs-decision.md`](../reference/fs-decision.md), seção 2:

- **Todo symlink é seguido** — opção (c) do memo. Symlink dentro da pasta
  apontando para fora é atravessado, e o que ele alcança é lido como qualquer
  outra entrada: sem teste de o alvo continuar dentro da raiz, sem recusa. Um
  symlink dentro da pasta é do usuário, e segui-lo é justamente o ponto.
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
decidido.** O mantenedor decide isto ao acordar; está aqui porque o código
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
- **`.gitignore` não é lido na Fase 1.** A gramática dele é um projeto à parte, e
  o modo de falha é nota sumindo em silêncio.
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
discordam, e este ADR é o que foi decidido.

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
- **Caminhos ignorados: ler `.gitignore`** — a gramática inteira é um projeto à
  parte, e uma linha `*.md` no `.gitignore` de um repositório esvaziaria o
  vault.
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

## Status

Symlinks, laços e caminhos ignorados: decidido em 2026-09-22 pelo mantenedor,
Aceito. Handles opacos: decididos em 2026-09-24 pelo mantenedor, como
construídos para a Fase 2, Aceito; reabertos antes que qualquer coisa fora das
views do próprio app ganhe acesso a arquivos. O watcher: construído depois da
feature 2 e decidido em 2026-09-24 pelo mantenedor, Aceito. Os itens marcados
como **provisórios** dentro dos dois grupos decididos em 2026-09-22 não estão
decididos: são o que o código da feature 2 faz, registrados para que nada seja
resolvido por silêncio, e esperam o mantenedor.
