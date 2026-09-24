# Memorando de decisão: o watcher (mudanças feitas fora do app)

- Data: 2026-09-24
- Estado: **não decidido.** Nada neste memorando é uma decisão: ele expõe
  opções, registra fatos e traz recomendações identificadas como tais. O
  mantenedor decide (`CLAUDE.md` §1). O código no branch `feat/watcher` está
  escrito **segundo as recomendações, marcado como provisório**, e muda se o
  mantenedor decidir diferente — o mesmo arranjo das features 2 a 6.
- Pedido: em 2026-09-23 o mantenedor concordou que o watcher vem a seguir, antes
  do mês de uso real que fecha a Fase 2 ([roadmap](../roadmap.md), Fase 2,
  critério de saída). A [ADR 0044](../adr/0044-verso-fs-semantics.md) o pôs
  depois da feature 2, sem data; a [ADR 0028](../adr/0028-crate-structure.md)
  o põe no `verso-fs`.
- Escrito pelo Opus 5.5, no lugar do Fable 5.1 como autor do Rust por decisão
  do mantenedor de 2026-09-23 (limite de uso), durante a noite enquanto o
  mantenedor dormia; a leitura fica registrada na seção 7.

## 1. O que faltava

Antes deste branch, uma mudança feita fora do app — a mesma pasta aberta no
Obsidian (a [ADR 0012](../adr/0012-files-are-source-of-truth.md) chama isso de
caso de uso decidido), um cliente de sync, um `git pull` — só chegava ao Verso
quando a nota era salva (como uma escrita recusada, invariante 11), reaberta,
ou no "Reindexar" ([memorando do app](app-decision.md), seção 10). Nada
atualizava sozinho a árvore, a busca, os backlinks ou uma nota aberta. Num mês
de uso com o Obsidian aberto ao lado do Verso, isso quer dizer uma aba
desatualizada até o próximo salvar encontrar a diferença.

## 2. O que o código faz agora

| Camada | O que faz |
|---|---|
| `verso-fs` | `Root::watch(quiet, on_change)`: um watcher `notify` na raiz, recursivo (FSEvents no macOS, inotify no Linux). Uma thread própria agrupa os eventos: um lote sai quando a pasta fica quieta por `quiet`, ou depois de 2 s de mudanças que não param. Só é informado o que a varredura lista — nenhuma entrada oculta (`.obsidian/`, os `.verso-tmp-*` da escrita atômica), nenhum caminho ignorado — e só eventos que mudam algo: abrir ou ler não é mudança. Soltar o `Watch` o encerra sem esperar a thread. |
| `verso-core` | `Workspace::watch` com intervalo de quietude de 300 ms (`WATCH_QUIET`). O `IndexReport` agora nomeia as notas que contou: `changed` (novas ou diferentes no disco), `gone` (removidas) e `listing_changed` (entradas acrescentadas, removidas ou de outro tipo — não tamanhos nem datas). |
| Host | Cada pasta aberta tem um watcher, guardado pela sessão e solto com ela. Um lote roda o `index()` na thread do watcher, sob o lock da sessão, e, quando algo mudou, manda à janela principal e às janelas de nota um evento `folder-changed`: a chave da pasta, as notas mudadas e removidas por caminho relativo, o resumo do índice. Uma pasta que o sistema não vigia abre assim mesmo, com o motivo entre os problemas do índice. |
| Janela | Listas e painéis são redesenhados. A aba de uma nota mudada, sem nada digitado nela, é lida de novo, mantendo o cursor e a rolagem; com texto ainda não salvo, ela salva na hora, o que encontra a diferença e mostra a faixa de conflito (invariante 11) — nada é gravado por cima da mudança do outro app. A aba de uma nota que sumiu mantém o texto, riscada na barra de abas, com uma linha dizendo isso. As outras notas abertas buscam de novo os links e backlinks. A linha de status diz quantas notas mudaram fora. |
| Contrato | `FolderChanged`, o conteúdo do evento, gerado nos bindings junto com os comandos (regra 3). |

As escritas do próprio Verso não são informadas como mudanças feitas fora: um
salvar atualiza o índice com o carimbo do que gravou, então o `index()`
seguinte acha aquela nota sem mudança. Um teste remove essa atualização e vê a
asserção falhar.

## 3. As decisões

### 3.1 Como a pasta é vigiada

| | (a) `notify` 8.2 | (b) Varredura com timer | (c) A API de cada sistema direto |
|---|---|---|---|
| Dependência | `notify` (CC0-1.0) e, no macOS, `fsevent-sys`, `notify-types`, `walkdir`, `log`; no Linux `inotify` | nenhuma | `fsevent-sys` ou FFI, por plataforma |
| Latência | dezenas de milissegundos mais o intervalo de quietude | o período do timer | como (a) |
| Custo parado | nenhum | uma varredura por período, mudando ou não | nenhum |
| Windows e Linux | a mesma API ([ADR 0022](../adr/0022-target-platforms-macos-first.md): os dois saem) | o mesmo código | mais um backend cada |

**Recomendação: (a).** É o que o código usa. (b) fica como o recurso
registrado para quando o sistema recusa vigiar (seção 3.8).

### 3.2 O que um lote faz ao índice

| | (a) Indexar a pasta inteira | (b) Atualizar só os caminhos do lote |
|---|---|---|
| Correção | o único caminho que conhece placeholders, problemas da varredura e remoções; pega mudanças que o watcher perdeu | código novo ao lado do `index()`: o placeholder de um caminho só, uma pasta criada ou movida, um renomear |
| Custo por lote | o "índice, nada mudou" do benchmark: 42 ms com 1.000 notas, 1,4 s com 10.000, 10 s com 50.000 (lê cada nota: o carimbo tem o hash do conteúdo) | proporcional ao lote |
| As pastas do mantenedor | 61 notas (a campanha) e 1.387: bem abaixo de 100 ms | — |

**Recomendação: (a) agora**, e (b) como o passo para pastas acima de alguns
milhares de notas, medido com o benchmark quando houver uma em uso. Pular a
leitura das notas cujo tempo e tamanho não mudaram deixaria (a) barato, mas
tiraria o hash do conteúdo da detecção de mudança, que a
[ADR 0029](../adr/0029-guardrails-in-ci.md) e o memorando da feature 2 mantêm
de propósito (uma reescrita que mantém tempo e tamanho, como `cp -p` ou um
cliente de sync podem fazer); este memorando não propõe isso.

### 3.3 O intervalo de quietude

300 ms de quietude, no máximo 2 s desde a primeira mudança de um lote. Longo o
bastante para que um salvar feito de várias escritas, ou um checkout, seja um
lote só; curto o bastante para que uma mudança feita no outro editor apareça
enquanto o usuário ainda está olhando. Provisório; os números são do código,
não medidos com usuários.

### 3.4 Uma nota aberta mudada fora, sem nada digitado

| | (a) Ler de novo, manter cursor e rolagem | (b) Marcar, ler quando pedido |
|---|---|---|
| O usuário vê | o texto novo | o texto antigo e um aviso |
| Risco | nenhum ao texto do usuário: só é lida de novo quando a aba não tem texto não salvo, e não se algo for digitado enquanto a leitura está a caminho | uma vista desatualizada até o usuário agir |

**Recomendação: (a).** O comportamento do próprio Obsidian para uma nota
aberta nele e mudada fora não foi observado para este memorando.

### 3.5 Uma nota aberta mudada fora, com texto ainda não salvo

| | (a) Salvar agora | (b) Marcar e esperar o autosave |
|---|---|---|
| O que acontece | a escrita é recusada (o arquivo não é o que foi lido) e a faixa de conflito mostra as duas versões, com recarregar e gravar o meu — o fluxo que a invariante 11 já tem | o mesmo, um instante depois, quando o autosave rodar |

**Recomendação: (a)**: o usuário fica sabendo na hora que a nota mudou em
outro lugar, enquanto a diferença é pequena. Nada é gravado em nenhum dos dois.

### 3.6 Uma nota aberta apagada ou movida fora

| | (a) Manter a aba, riscada, com uma linha | (b) Fechar a aba quando nada está sem salvar | (c) Seguir uma movida |
|---|---|---|---|
| O texto | fica até o usuário fechar a aba | sai da tela (está no disco em outro lugar, ou na lixeira) | segue a nota |
| Custo | nenhum | nenhum | parear uma remoção e uma criação pelo conteúdo: adivinhação em renomeios com edição |

**Recomendação: (a)**, a que não perde nada e não adivinha nada. Uma movida
feita fora mostra a nota nova na árvore; o usuário a abre.

### 3.7 Arquivos que não são notas, abertos numa aba

Arquivos de texto (um `.css`, um `.json`), imagens e PDFs abertos numa aba não
são lidos de novo quando mudam fora: o `IndexReport` nomeia só notas, e a
listagem informa entradas, não conteúdos. **Recomendação:** deixar assim por
ora e registrar; o editor de um arquivo de texto tem a mesma faixa de
conflito ao salvar.

### 3.8 Uma pasta que o sistema não vigia

No Linux, uma pasta grande pode esgotar o limite do inotify; a ADR 0044
registrou o comportamento para então: degradar para uma varredura periódica
com um aviso, nunca falhar em silêncio. **O que o código faz agora:** a pasta
abre, o motivo fica entre os problemas do índice, e as mudanças feitas fora
aparecem no "Reindexar". A varredura periódica é construída quando o Linux
virar alvo, como diz a ADR 0044.

### 3.9 O que o watcher não vê

- O interior de uma pasta alcançada por um symlink que aponta para fora da
  pasta: a varredura o segue (ADR 0044), o sistema operacional não vigia através
  dele. O "Reindexar" cobre isso.
- Mudanças enquanto nenhum watcher roda (entre o índice e o início do watcher,
  alguns milissegundos): o lote seguinte indexa a pasta inteira e as encontra.
- O `verso mcp` não muda: indexa ao iniciar, oferece `index` e marca uma nota
  como `stale` quando o carimbo do arquivo difere
  ([memorando do mcp](mcp-decision.md)). O watcher é da janela.

## 4. Como foi verificado

- `verso-fs`, com os eventos reais do sistema operacional: uma nota criada,
  escrita, movida e removida é informada pelo caminho relativo; `.obsidian/`,
  um caminho ignorado e um arquivo temporário não são; ler todas as notas sob
  um watcher não informa nada (no Linux cada abertura é um evento: sem o filtro,
  quem indexa a cada lote nunca pararia); um watcher solto não informa mais
  nada. Testes de unidade do filtro de caminhos (incluindo a forma `/private`
  de uma pasta temporária no macOS e o nome de placeholder do iCloud), do
  filtro de eventos e do tempo dos lotes.
- `verso-core`: `changed`, `gone` e `listing_changed` no teste de ponta a
  ponta do índice; uma nota feita fora chega ao índice pelo watcher.
- Host: uma nota escrita de fora com a pasta aberta chega às janelas como
  `folder-changed`, e a escrita do próprio Verso ao mesmo tempo não é
  informada; sem a atualização do índice na escrita, essa asserção falha.
- A suíte de testes não escreve mais no diretório de configuração do usuário
  (branch `fix/beta-follow-ups`, embaixo deste).

## 5. O que este memorando não verificou

- A janela não foi executada: o mantenedor dormia e a tela é dele. A metade
  da UI está conferida só por type-check e build; os comportamentos de aba das
  seções 3.4 a 3.6 esperam um smoke test numa cópia de rascunho.
- Evicções e downloads reais do iCloud Drive sob um watcher.
- Windows (ainda não é alvo).
- O custo da seção 3.2 numa pasta de dezenas de milhares de notas com
  mudanças chegando sem parar.

## 6. Para o mantenedor

1. Seção 3.1: `notify` — sim ou não.
2. Seção 3.2: indexar a pasta inteira por lote, por ora — sim ou não.
3. Seção 3.3: 300 ms / 2 s — manter ou mudar.
4. Seções 3.4 a 3.6: ler de novo / salvar agora / manter riscada — manter ou mudar.
5. Seção 3.7: arquivos que não são notas não atualizados — aceitar por ora ou não.

## 7. A leitura

Pendente: uma sessão nova do Opus 5.5 lê o branch (decisão do mantenedor de
2026-09-23 sobre o item 17 da revisão da Fase 2), e os achados ficam
registrados aqui.
