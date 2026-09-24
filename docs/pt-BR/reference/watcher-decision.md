# Memo de decisão: o watcher (mudanças feitas fora do app)

- Data: 2026-09-24
- Status: **decidido pelo mantenedor em 2026-09-24**, na sessão. As
  recomendações do autor no dia, entre elas a seção 6 deste memo, foram
  apresentadas ao mantenedor numa lista só; a resposta: *"Tirando o plano de
  fazer vários PR, eu gosto das suas recomendações"*. Cada linha da seção 6
  como recomendada:
  1. **`notify`** (seção 3.1);
  2. **indexar a pasta inteira por lote, por ora** (3.2);
  3. **300 ms de quietude, 2 s no máximo**, mantidos (3.3);
  4. **o texto do disco trazido como uma edição, uma aba com texto não salvo
     salva na hora para encontrar a faixa de conflito, a aba de uma nota
     sumida mantida e marcada**, mantidos (3.4 a 3.6);
  5. **arquivos que não são notas não atualizados**, aceito por ora (3.7).

  Até então nada aqui era decisão, e o código do branch `feat/watcher` e as
  correções acima dele estavam escritos segundo as recomendações, marcados
  como provisórios — o mesmo arranjo das features 2 a 6; não são mais
  provisórios. Registrado no
  [ADR 0044](../adr/0044-verso-fs-semantics.md). As seções 1 a 5 são a
  comparação como estava quando a decisão foi tomada; a seção 7 registra as
  leituras.
- Pedido: combinado na sessão em 2026-09-23 — o watcher vem a seguir, antes
  do mês de uso real que fecha a Fase 2 ([roadmap](../roadmap.md), Fase 2,
  critério de saída); nenhum documento do repositório registra essa resposta
  além desta linha. O [ADR 0044](../adr/0044-verso-fs-semantics.md) pôs o
  watcher depois da feature 2, sem data; o
  [ADR 0028](../adr/0028-crate-structure.md) o põe no `verso-fs`.
- Escrito pelo Opus 5.5, no lugar do Fable 5.1 como autor do Rust por decisão
  do mantenedor de 2026-09-23 (limite de uso), durante a noite enquanto o
  mantenedor dormia; lido por duas sessões novas do Opus 5.5 sob a mesma
  decisão (seção 7).

## 1. O que faltava

Antes deste branch, uma mudança feita fora do app — a mesma pasta aberta no
Obsidian (o [ADR 0012](../adr/0012-files-are-source-of-truth.md) chama isso de
caso de uso decidido), um cliente de sync, um `git pull` — só chegava ao Verso
quando a nota era salva (como uma escrita recusada, invariante 11), reaberta,
ou no "Reindexar" ([memo do app](app-decision.md), seção 10). Nada atualizava
sozinho a árvore, a busca, os backlinks ou uma nota aberta. Num mês de uso com
o Obsidian aberto ao lado do Verso, isso quer dizer uma aba desatualizada até o
próximo salvar encontrar a diferença.

## 2. O que o código faz agora

| Camada | O que faz |
|---|---|
| `verso-fs` | `Root::watch(quiet, excluded, on_change)`: um watcher `notify` na raiz, recursivo (FSEvents no macOS, inotify no Linux). Uma thread própria agrupa os eventos: um lote sai quando a pasta fica quieta por `quiet`, ou depois de 2 s de mudanças que não param. Só é informado o que a varredura lista — nenhuma entrada oculta (`.obsidian/`, os `.verso-tmp-*` da escrita atômica), nenhum caminho ignorado — e só eventos que mudam algo: abrir ou ler não é mudança. Eventos sob os diretórios `excluded` são descartados. Um erro do watcher do sistema volta como o tipo dele, nunca com os caminhos que o `notify` põe na mensagem. Soltar o `Watch` o encerra sem esperar a thread. |
| `verso-core` | `Workspace::watch` com intervalo de quietude de 300 ms (`WATCH_QUIET`), com o diretório do próprio índice excluído (para um diretório de configuração dentro da pasta). O `IndexReport` nomeia as notas que contou: `changed` (novas ou diferentes no disco), `gone` (removidas) e `listing_changed` (entradas acrescentadas, removidas ou de outro tipo — não tamanhos nem datas). |
| Host | Cada pasta aberta tem um watcher, iniciado antes da primeira indexação e guardado pela sessão. Um lote roda o `index()` na thread do watcher, sob o lock da sessão, e então manda `folder-changed` uma vez — toda janela o escuta: a chave da pasta, o que esta execução achou mudado e removido por caminho relativo, se a listagem mudou, o resumo do índice. Um lote que chega antes de a sessão existir roda assim que a sessão está no lugar. Uma pasta que o sistema não vigia abre assim mesmo, e o motivo vai com todo resumo da sessão. |
| Janela | Toda nota aberta é conferida com o disco a cada `folder-changed`, depois das operações de arquivo da própria janela e depois do Reindexar — qualquer que seja a execução do índice que achou a mudança. A mesma revisão: nada. Mudou, sem nada digitado: o texto do disco entra como uma edição sobre o que difere, então o cursor, a seleção e a rolagem acompanham o texto, o histórico de desfazer fica (⌘Z traz de volta o texto da aba — menos quando o separador de linha mudou ou a aba mostra o arquivo só para leitura: ali o editor recomeça, com um histórico novo), e o cursor nunca fica dentro do frontmatter dobrado. Mudou, com texto ainda não salvo: salva na hora, o que encontra a diferença e mostra a faixa de conflito (invariante 11) — nada é gravado por cima da mudança do outro app. Sumiu: a aba mantém o texto; na janela principal o nome dela fica riscado e diz isso a um leitor de tela, e uma linha acima do texto diz isso em toda janela. Uma edição em andamento no painel de propriedades é esperada. A árvore e as vistas de pasta só são redesenhadas quando a listagem mudou, e não enquanto um nome está sendo digitado na árvore. A linha de status nomeia as notas de que fala, e mostra os problemas do índice. |
| Contrato | `FolderChanged`, o conteúdo do evento, gerado nos bindings junto com os comandos (regra 3). |

As escritas do próprio Verso não são informadas como mudanças feitas fora: um
salvar atualiza o índice com o carimbo do que gravou, então o `index()`
seguinte acha aquela nota sem mudança, e a conferência da janela acha a
revisão que ela já tem.

## 3. As decisões

### 3.1 Como a pasta é vigiada

| | (a) `notify` 8.2 | (b) Varredura com timer | (c) A API de cada sistema direto |
|---|---|---|---|
| Dependência | `notify` (CC0-1.0) com `notify-types`, `walkdir`, `same-file` e `log`; no macOS `fsevent-sys`; no Linux `inotify`, `inotify-sys` e `mio`; e, no `Cargo.lock`, `kqueue` e `kqueue-sys` (MIT), que o `notify` usa nos BSDs e no iOS e oferece no macOS como um backend não ligado aqui — todas passam no `deny.toml`, que confere todo alvo | nenhuma | `fsevent-sys` ou FFI, por plataforma |
| Latência | dezenas de milissegundos mais o intervalo de quietude | o período do timer | como (a) |
| Custo parado | nenhum | uma varredura por período, mudando ou não | nenhum |
| Windows e Linux | a mesma API ([ADR 0022](../adr/0022-target-platforms-macos-first.md): os dois saem) | o mesmo código | mais um backend cada |

**Recomendação: (a).** É o que o código usa. (b) fica como o recurso
registrado para quando o sistema recusa vigiar (seção 3.8).

### 3.2 O que um lote faz ao índice

| | (a) Indexar a pasta inteira | (b) Atualizar só os caminhos do lote |
|---|---|---|
| Correção | o único caminho que conhece placeholders, problemas da varredura e remoções; pega mudanças que o watcher perdeu | código novo ao lado do `index()`: o placeholder de um caminho só, uma pasta criada ou movida, um renomear |
| Custo por lote | o "índice, nada mudou" do benchmark: 42 ms com 1.000 notas, 1,4 s com 10.000, 10 s com 50.000 (lê cada nota: o carimbo tem o hash do conteúdo). A execução segura o lock da sessão, então todo comando de toda janela espera por ela: a janela trava por esse tempo | proporcional ao lote |
| As pastas do mantenedor | 61 notas (a campanha) e 1.387: bem abaixo de 100 ms | — |

**Recomendação: (a) agora**, e (b) como o passo para pastas acima de alguns
milhares de notas, medido com o benchmark quando houver uma em uso. Pular a
leitura das notas cujo tempo e tamanho não mudaram deixaria (a) barato, mas
tiraria o hash do conteúdo da detecção de mudança, que o
[ADR 0012](../adr/0012-files-are-source-of-truth.md) — o parágrafo provisório
dele sobre o que a checagem de escrita compara — e o memo da feature 2 mantêm
de propósito (uma reescrita que mantém tempo e tamanho, como `cp -p` ou um
cliente de sync podem fazer); este memo não propõe isso.

### 3.3 O intervalo de quietude

300 ms de quietude, no máximo 2 s desde a primeira mudança de um lote. Longo o
bastante para que um salvar feito de várias escritas, ou um checkout, seja um
lote só; curto o bastante para que uma mudança feita no outro editor apareça
enquanto o usuário ainda está olhando. Provisório; os números são do código,
não medidos com usuários.

### 3.4 Uma nota aberta mudada fora, sem nada digitado

| | (a) Trazer o texto do disco, como uma edição | (b) Marcar, ler quando pedido |
|---|---|---|
| O usuário vê | o texto novo, o cursor onde estava no texto | o texto antigo e um aviso |
| O que a aba tinha | a um ⌘Z de distância: se um cliente de sync grava de volta uma versão mais velha, ou o outro editor salva por cima da nota a partir do próprio buffer, o texto da aba não se perde até a aba ser fechada — menos quando o separador de linha mudou ou a aba mostra o arquivo só para leitura, onde o editor recomeça com um histórico novo | mantido na tela até o usuário agir |
| Risco | o texto do outro app vence na tela até o usuário notar (a linha de status diz que a nota foi lida de novo) | uma vista desatualizada até o usuário agir |

**Recomendação: (a).** O comportamento do próprio Obsidian para uma nota
aberta nele e mudada fora não foi observado para este memo.

**⌘Z depois de o texto do disco entrar é uma edição do usuário** (as segundas
leituras, seção 7). Desfazer põe de volta o texto mais velho da aba como uma
mudança comum, então o autosave o grava 1,5 s depois, o padrão — por cima da
versão do outro app, e a checagem de escrita deixa passar, já que a aba tem a
revisão que leu por último. Isso é ato do usuário, e fica registrado como tal:
nada o recusa, e a linha de status, que dizia que a nota foi lida de novo e
apontava o ⌘Z, não o convida mais (`2b4c78d`). Quando o separador de linha
mudou, ou a aba mostra o arquivo só para leitura, o texto do disco não entra
como uma edição: o editor recomeça, com um histórico novo (`fromDisk` em
`app/ui/src/main.ts`), e o ⌘Z não tem nada da aba para trazer de volta.

### 3.5 Uma nota aberta mudada fora, com texto ainda não salvo

| | (a) Salvar agora | (b) Marcar e esperar o autosave |
|---|---|---|
| O que acontece | a escrita é recusada (o arquivo não é o que foi lido) e a faixa de conflito mostra as duas versões, com recarregar e gravar o meu — o fluxo que a invariante 11 já tem | o mesmo, um instante depois, quando o autosave rodar |

**Recomendação: (a)**: o conflito aparece enquanto a diferença é pequena, e a
linha de status nomeia a nota, então uma aba em segundo plano não passa
despercebida. Nada é gravado em nenhum dos dois.

### 3.6 Uma nota aberta apagada ou movida fora

| | (a) Manter a aba, marcada, com uma linha | (b) Fechar a aba quando nada está sem salvar | (c) Seguir uma movida |
|---|---|---|---|
| O texto | fica até o usuário fechar a aba | sai da tela (está no disco em outro lugar, ou na lixeira) | segue a nota |
| Custo | nenhum | nenhum | parear uma remoção e uma criação pelo conteúdo: adivinhação em renomeios com edição |

**Recomendação: (a)**, a que não perde nada e não adivinha nada. Uma movida
feita fora mostra a nota nova na árvore; o usuário a abre. Um salvar de uma aba
assim falha ("não encontrada"): nada recria a nota sozinho.

### 3.7 Arquivos que não são notas, abertos numa aba

Arquivos de texto (um `.css`, um `.json`), imagens e PDFs abertos numa aba não
são lidos de novo quando mudam fora: a janela confere notas.
**Recomendação:** deixar assim por ora e registrar; o editor de um arquivo de
texto tem a mesma faixa de conflito ao salvar.

### 3.8 Uma pasta que o sistema não vigia

No Linux uma pasta grande pode esgotar o limite do inotify, e o início
recursivo do `notify` para no primeiro diretório que não consegue ler —
inclusive os ocultos (`.git/objects`, `.obsidian/plugins`), onde a varredura
nunca entra —, então um diretório ilegível desliga o watcher da pasta inteira.
O ADR 0044 registrou o comportamento para então: degradar para uma varredura
periódica com um aviso, nunca falhar em silêncio. **O que o código faz
agora:** a pasta abre, o motivo (o tipo dele, sem caminho) vai com todo resumo
do índice e aparece na linha de status, e as mudanças feitas fora aparecem no
"Reindexar". A varredura periódica é construída quando o Linux virar alvo, como
diz o ADR 0044; o Linux ainda não é.

### 3.9 O que o watcher não vê

- No macOS, o interior de uma pasta alcançada por um symlink que aponta para
  fora da pasta: a varredura o segue (ADR 0044), o FSEvents não vigia através
  dele. No Linux o `notify` o segue, e vigia tudo o que está embaixo. O
  "Reindexar" cobre o primeiro caso.
- Mudanças feitas por outra máquina num volume de rede: o FSEvents não as
  informa, e nada falha, então nada é dito.
- Mudanças feitas antes de o watcher começar: ele começa antes da primeira
  indexação, então só uma mudança no instante entre abrir a pasta e iniciar o
  watcher fica perdida até o próximo lote ou o "Reindexar".
- O `verso mcp` não muda: indexa ao iniciar, oferece `index` e marca uma nota
  como `stale` quando o carimbo do arquivo difere
  ([memo do mcp](mcp-decision.md)). O watcher é da janela.

## 4. Como foi verificado

- `verso-fs`, com os eventos reais do sistema operacional, macOS e Linux
  (Docker): uma nota criada, escrita, movida e removida é informada pelo
  caminho relativo; `.obsidian/`, um caminho ignorado, um arquivo temporário e
  um diretório excluído não são; ler todas as notas sob um watcher não informa
  nada — no Linux, com o filtro de leitura removido, o mesmo teste informa cada
  nota lida, o laço que o filtro evita; um watcher solto não informa mais
  nada; um erro construído com um caminho volta sem ele.
- `verso-core`: `changed`, `gone` e `listing_changed` no teste de ponta a
  ponta do índice; um salvar do Verso não é mudança de listagem; uma nota feita
  fora chega ao índice pelo watcher.
- Host: uma nota escrita de fora com a pasta aberta chega às janelas como
  `folder-changed`, e a escrita do próprio Verso ao mesmo tempo não é nomeada
  (sem a atualização do índice na escrita, essa asserção falha); um lote chega
  uma vez a três janelas (três vezes com o laço que a leitura achou); um lote
  de uma pasta que não é a aberta não avisa ninguém.
- Janela: a edição que traz o texto do disco foi executada contra o estado e o
  histórico do próprio CodeMirror num harness descartável — o cenário do
  frontmatter da leitura mantém o cursor depois do frontmatter, desfazer
  restaura, pares de surrogate nunca são partidos. A janela em si não foi
  executada.
- A suíte de testes não escreve mais no diretório de configuração do usuário
  (branch `fix/beta-follow-ups`, embaixo deste).

## 5. O que este memo não verificou

- A janela não foi executada: o mantenedor dormia e a tela é dele. Os
  comportamentos de aba das seções 3.4 a 3.6 esperam um smoke test numa cópia
  de rascunho.
- Evicções e downloads reais do iCloud Drive sob um watcher.
- Windows (ainda não é alvo), e o crate do host no Linux (precisa do
  WebKitGTK; os crates do watcher rodaram lá).
- O custo da seção 3.2 numa pasta de dezenas de milhares de notas com mudanças
  chegando sem parar.

## 6. Para o mantenedor

1. Seção 3.1: `notify` — sim ou não.
2. Seção 3.2: indexar a pasta inteira por lote, por ora — sim ou não.
3. Seção 3.3: 300 ms / 2 s — manter ou mudar.
4. Seções 3.4 a 3.6: trazer como uma edição / salvar agora / manter e marcar —
   manter ou mudar.
5. Seção 3.7: arquivos que não são notas não atualizados — aceitar por ora ou
   não.

Respondido em 2026-09-24: as cinco como recomendadas (o cabeçalho).

## 7. As leituras

Duas sessões novas do Opus 5.5 leram o branch — uma o Rust, outra a janela e os
documentos — por decisão do mantenedor de 2026-09-23 sobre o item 17 da revisão
da Fase 2. Todo achado foi resolvido nos commits acima do branch, salvo quando
marcado:

- Rust, BLOQUEANTE: um erro do watcher do sistema chegava à janela com
  caminhos absolutos (regra 4) — `645e8f5`.
- Rust, IMPORTANTE: cada lote entregue uma vez por janela a toda janela —
  `1cea893`; uma mudança que outra execução do índice achou primeiro nunca era
  avisada — `1cea893` e `7190830`; o diretório de configuração dentro da pasta
  acordava o watcher para sempre — `645e8f5`, `6de2245`; no Linux um diretório
  ilegível desliga o watcher e o aviso depois se perdia — o aviso mantido
  (`1cea893`), o resto registrado na seção 3.8.
- Rust, MENOR: o doc de symlink no Linux, uma pasta com nome de placeholder não
  vigiada — `645e8f5`; o watcher iniciado depois do índice — `1cea893`; a
  alegação de limpeza do helper de teste, o comentário do contrato —
  `1cea893`; um teste para `9974e11` — `6de2245`; `gh auth status` amplo
  demais — `12ab794`; a lista de dependências e o travamento da UI em pastas
  grandes — este memo.
- Janela, BLOQUEANTE: o cursor restaurado dentro do frontmatter dobrado, onde
  um Backspace apagava as propriedades escondidas — `7190830`.
- Janela, IMPORTANTE: mudanças roubadas (como acima), problemas em silêncio, a
  edição de propriedade perdida, a árvore redesenhada sob um renomear inline, o
  contraste da aba riscada — `7190830`; o estado de sumida só pelo estilo —
  `0d27fcc`; o risco "nenhum" da seção 3.4 — este memo.
- Janela, MENOR: corridas de leitura, o cursor por offset, o estado de sumida
  limpo só por uma leitura, menos atualizado do que o dito, status em corrida,
  janelas de nota — `7190830` e este memo; o comentário do contrato —
  `1cea893`; as frases velhas dos callouts aninhados — a spec e o memo do app;
  a precisão deste memo — aqui.

As segundas leituras, de novo sessões novas do Opus 5.5, das correções acima e
deste memo. Os achados delas no código estão resolvidos nos commits que vêm
depois deste branch; os achados
sobre este memo estão resolvidos aqui:

- Janela, BLOQUEANTE: ⌘Z e depois ⌘⇧Z — ou ⌘U sozinho — depois de uma leitura
  do disco punham o cursor de volta dentro do frontmatter dobrado, onde um
  Backspace apagava a cerca e uma propriedade; agora toda transação no Live
  Preview mantém todo cursor fora dele — `ba8fb82`.
- Janela, IMPORTANTE: o foco restaurado pela posição depois de um redesenho
  caía em outro controle quando embeds entravam acima dele (agora achado pela
  identidade); toda visão de leitura era redesenhada a cada lote (agora só uma
  nota que embute uma das mudadas); a guarda contra redesenhar sob um
  renomear cobria só a árvore (agora os resultados da busca e as vistas de
  pasta também) — `2b4c78d`.
- Janela, IMPORTANTE: ⌘Z depois de uma leitura do disco é uma edição comum,
  salva por cima da versão do outro app — registrado na seção 3.4; a linha de
  status não o convida mais — `2b4c78d`.
- MENOR: a edição do disco isolada no histórico, então ⌘Z depois de digitar
  desfaz só a digitação; os nomes da linha de status; a atualização adiada da
  lista; a checagem adiada do painel de propriedades; Enter na visão de
  leitura — `2b4c78d`. O reindexar do host sob uma só tomada do lock, e as
  mensagens do watcher ditas em pt-BR ou inglês pela janela em vez da frase
  em inglês do host — `b60f950`. `gh auth status --active` — `4e5162f`.
- Este memo, MENOR: a seção 3.2 citava o ADR 0029 para manter o hash do
  conteúdo, onde o raciocínio do `cp -p` é o parágrafo provisório do ADR 0012
  sobre a checagem de escrita; a lista de dependências da seção 3.1 deixava de
  fora `kqueue` e `kqueue-sys`; a seção 2 e a seção 3.4 diziam que desfazer
  sempre traz de volta o texto da aba — aqui.

Depois a janela foi dirigida numa cópia de rascunho da pasta Sandbox, como o
mantenedor permitiu em 2026-09-24. O que a execução achou:

- Backspace bem no começo do corpo, onde o Live Preview põe o cursor logo
  depois do frontmatter dobrado, apagava a quebra de linha depois da cerca de
  fechamento: a primeira linha se juntava a ela, o bloco deixava de ser um
  frontmatter e todas as propriedades iam junto, sem aparecer — mais antigo
  que o watcher. Nenhuma tecla muda o frontmatter dobrado agora; o painel de
  propriedades muda — `435b489`.
- Um callout que o usuário tinha aberto se recolhia de novo toda vez que a
  nota era lida de novo; e uma nota apagada fora e devolvida deixava a linha
  de status dizendo que tinha sumido — `5ad0b0d`.

Todo o resto que a execução tentou foi como a seção 2 diz: uma mudança lida
numa aba limpa, a faixa de conflito para uma aba com texto não salvo sem nada
gravado, uma nota feita fora na árvore, a nota aberta apagada fora marcada com
o texto mantido, e o cenário do frontmatter da segunda leitura — uma mudança
fora, ⌘Z, ⌘⇧Z, Backspace — deixando as propriedades inteiras no disco.
