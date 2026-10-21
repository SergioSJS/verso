# ADR 0043 — Arquivo placeholder de armazenamento sob demanda nunca é deleção

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §8, §10.3, §16.1; `docs/review/phase-0.md` C1 e R9
- Status no briefing: `PROPOSTO` em §8; promovido a `DECIDIDO` pelo mantenedor ao
  aceitar a revisão da Fase 0
- Revisões: 2026-09-22 — mecanismo de detecção decidido para o iCloud Drive pelo
  mantenedor, sobre o memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md); os demais
  provedores continuam `[ABERTO]`. 2026-09-22 — onde a guarda roda e o que ganha
  entre um arquivo real e um irmão `.icloud` obsoleto, vindo do código da
  feature 2, registrado como provisório.
  2026-10-12 — os registros provisórios de 2026-09-22 ratificados pelo
  mantenedor como construídos e testados, respondendo à auditoria dos
  ADRs em sessão: *"Ajuste tudo que precisar. Está aprovado os ADRs"*; uma
  nota datada ao lado de cada um.

## Contexto

iCloud Drive, OneDrive, Dropbox e Google Drive substituem arquivos não baixados
por um placeholder (um arquivo pequeno, um atributo especial ou um nome
alternativo, conforme o provedor). Um app que lê a pasta e não reconhece o
placeholder conclui que o arquivo sumiu — e, se tiver sync ou views
materializadas, propaga a "deleção". A dor está registrada em §16.1 como causa
real de perda de dados, e a guarda aparece em §10.3 como mitigação do risco
"Perda de dados".

A regra estava `PROPOSTO` em §8 e em [0021](0021-sync-automerge-layered-config.md),
mas `CLAUDE.md` já a tratava como invariante. A revisão da Fase 0 apontou a
contradição (C1); o mantenedor resolveu promovendo a regra.

## Decisão

1. Um arquivo placeholder de armazenamento sob demanda nunca é interpretado como
   deleção, em nenhuma camada do core: varredura, índice, watcher, merge ou sync.
2. Um placeholder é tratado como "arquivo presente, conteúdo indisponível". O
   índice mantém a última versão conhecida, marcada como não verificada.
3. A guarda vale desde a Fase 1 (feature 2, varredura de pasta), não só quando o
   sync entrar.

## Consequências

- A invariante 10 de `CLAUDE.md` §2.2 passa a ter ADR Aceito como base.
- A varredura precisa distinguir três estados: presente, ausente e placeholder.
  "Ausente" é o único que pode virar deleção, e mesmo assim só por ação do
  usuário ou por merge com regra explícita.
- **Mecanismo de detecção do iCloud Drive: decidido em 2026-09-22** pelo
  mantenedor, sobre o memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md), seção 4. Duas
  formas são reconhecidas, e um vault pode ter as duas ao mesmo tempo:
  1. **A flag de dataless.** `SF_DATALESS` (`0x40000000`) em `st_flags`, lida do
     `stat` que a varredura já faz para toda entrada — e **verificada antes de
     qualquer abertura**. A ordem é parte da decisão, não detalhe de
     implementação: ler um arquivo dataless faz o sistema operacional baixá-lo,
     então uma indexação que abre tudo puxaria o vault inteiro por uma conexão
     tarifada como efeito colateral de abrir uma pasta.
  2. **O irmão `.icloud`.** A forma antiga e visível: `Nome.ext` dá lugar a um
     arquivo chamado `.Nome.ext.icloud`. Ele é reconhecido **antes** da regra de
     entradas ocultas do [0044](0044-verso-fs-semantics.md), que senão o pularia
     e faria a nota ser lida como ausente — exatamente o que a decisão 1 proíbe.

  Nas duas formas a entrada é reportada como "presente, conteúdo indisponível"
  para `Nome.ext`, conforme a decisão 2 acima.
- **Os demais provedores: `[ABERTO]`, adiados.** Conhecido publicamente, nada
  disso verificado aqui: OneDrive usa atributo de arquivo no Windows
  (`FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`) e provedor de arquivos no macOS;
  Dropbox e Google Drive passam pelo File Provider do sistema no macOS recente,
  o que pode ou não produzir a mesma flag `SF_DATALESS`. Cada um entra quando a
  plataforma chegar ou um usuário precisar.
- **Windows: decidido pelo mantenedor em 2026-10-08** ("deveria funcionar
  igual" — como o iCloud): um arquivo com
  `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS` (os Arquivos Sob Demanda do
  OneDrive e todo provedor de Cloud Files), `FILE_ATTRIBUTE_RECALL_ON_OPEN`
  ou `FILE_ATTRIBUTE_OFFLINE` é um placeholder sob todas as regras acima:
  presente, conteúdo indisponível, a última versão indexada mantida, nunca
  aberto pela varredura, pelo índice ou pelo watcher, e baixado quando o
  usuário o abre (lê-lo o baixa, como no macOS). Testado com `attrib +O`
  (offline), já que a máquina de teste não tem conta do OneDrive; um
  placeholder real do OneDrive ainda está por observar. O OneDrive no macOS,
  o Dropbox e o Google Drive continuam `[ABERTO]`.
- Cada provedor reconhecido vira fixture de `verso-fs`, não de dialeto,
  registrando como foi observado. Ainda não existe schema de fixture para
  `verso-fs` ([0044](0044-verso-fs-semantics.md)), então o mecanismo do iCloud
  Drive entra como linha neste ADR agora e como fixture quando o schema
  existir.

**Onde a guarda roda, e o que ganha quando duas coisas reivindicam a mesma nota.
Registrado em 2026-09-22 a partir da segunda leitura do código da feature 2 —
provisório, o mantenedor decide ao acordar.** São coisas que o código faz, não
decisões; estão escritas porque a alternativa a escrevê-las é decidi-las por
silêncio.
*(Ratificado pelo mantenedor em 2026-10-12, como construído e testado:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **Symlink cujo alvo o iCloud removeu na forma antiga é placeholder, não link
  quebrado.** `nota.md` aponta para `out/Real.md`, e o que existe em disco é
  `out/.Real.md.icloud`: a varredura emite uma entrada de placeholder e a
  leitura responde "conteúdo indisponível". A alternativa é a perigosa — symlink
  pendurado lê como arquivo que sumiu, que é a leitura proibida pela decisão 1
  com um salto a mais. Isso também responde, para os três estados acima, em qual
  deles cai um link para um placeholder: **placeholder**.
- **Quando `Nota.md` e `.Nota.md.icloud` existem os dois, o arquivo real
  ganha.** `Nota.md` é nota, legível e gravável; a entrada `.icloud` continua
  listada, continua placeholder, continua indisponível. Um irmão obsoleto
  deixado por um download concluído não torna ilegível um arquivo que está ali.
  É provisório porque a direção segura poderia muito bem ser a oposta — recusar
  enquanto um download pode estar em curso — e o que importa por ora é que o
  `EntryKind` da varredura e o `read` concordem, seja qual for a decisão do
  mantenedor; antes disso eles não concordavam.
- **A guarda roda sobre o nome como dado e sobre o alvo de um symlink, tanto no
  caminho de leitura quanto no de escrita.** Uma regra em três lugares em vez de
  três regras que se afastam com o tempo. Diretório cujo nome tem a forma de
  placeholder é diretório: o padrão nomeia um arquivo cujo conteúdo está em
  outro lugar, e diretório não tem conteúdo próprio.

**A decisão 2 agora é o que o código faz, e a lacuna que o memo da feature 4
registrou fecha por código, não por uma decisão nova. Registrado em 2026-09-22 a
partir do código da feature 4 — os detalhes abaixo são provisórios, o mantenedor
decide ao acordar.**
*(Ratificado pelo mantenedor em 2026-10-12, como construído e testado:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **O índice carrega a marca.** A versão 2 do esquema do `verso-index`
  acrescenta `notes.unverified`; um índice em qualquer outra versão é destruído
  e reconstruído, o que custa só tempo porque o índice é cache
  ([0011](0011-config-outside-tree-index-as-cache.md)) — menos para as notas
  que o iCloud tirou do disco, cujo último texto e links conhecidos só o índice
  guarda. A partir da versão 7, a versão anterior é levada no lugar, não
  reconstruída (decidido em 2026-10-01, abaixo).
- **Uma nota que a varredura reporta como placeholder mantém a última versão
  conhecida, marcada como não verificada** (`Index::mark_placeholder`, chamada
  pela execução de indexação do `verso-core` nas duas formas: uma entrada do
  tipo placeholder, e uma nota cuja leitura responde "conteúdo indisponível").
  Nada da nota é descartado, e nada é relido de um arquivo que não tem conteúdo
  para dar.
- **Uma nota só vista como placeholder ganha uma linha vazia, não
  verificada**, para que links até ela resolvam e o caminho dela seja um alvo
  conhecido em vez de um alvo não resolvido. Antes disso, um vault cujos
  arquivos nunca foram baixados indexava como um vault sem nota nenhuma.
- **Isto fecha por código, e não por decisão nova, a tensão que a §7.2 de
  `docs/reference/cli-decision.md` registrou**: a decisão 2 acima pedia "a
  última versão conhecida, marcada como não verificada", e o esquema da feature
  3 não tinha onde pôr a marca. Nada aqui muda o que este ADR decidiu; o que
  fica registrado é que a decisão está implementada. O que significam os
  backlinks *de* uma nota não verificada — os links dela foram parseados quando
  ela era legível e continuam no índice — não é respondido aqui.

**Depois da leitura da Opus 5 de 2026-09-22 o código também faz:**

- **Um problema relatado pela varredura protege uma subárvore inteira da
  remoção, não um caminho só.** Uma nota sob um diretório que não deu para ler,
  sob um laço de symlink, sob uma duplicata ou sob um caminho fundo demais para
  entrar continua no índice naquela execução; e um problema na própria raiz — um
  caminho vazio — protege todas as notas. Antes disso, um diretório que ficou
  ilegível removia as notas sob ele, e uma raiz que não deu para listar
  esvaziava o índice inteiro, que é a leitura proibida pela decisão 1 chegando
  por uma permissão em vez de por um placeholder.
- **Um placeholder que volta é relido mesmo quando o carimbo é o que o índice já
  tem.** A execução olha a marca `unverified` da linha antes de pular pelo
  carimbo, porque é a leitura da nota que limpa a marca: senão um arquivo que o
  iCloud despejou e depois baixou de novo, byte por byte e com o mesmo mtime,
  ficava marcado como não verificado para sempre.

**Decidido em 2026-09-22 pelo mantenedor** (`docs/reference/cli-decision.md`
§10, linha 6). Um segundo `verso index` pula a nota cujo carimbo o índice já
tem, remove do índice o que o walk não lista mais — **menos** um placeholder, e
menos uma nota sob um caminho para o qual o walk reportou problema — e relê uma
nota que o índice guarda como não verificada mesmo quando o carimbo bate,
porque ler a nota é o que a verifica. A coluna `unverified` que carrega isso já
está no schema; não se deve outro bump.

**Abrir um arquivo o baixa. Decidido pelo mantenedor em 2026-09-30**, em
sessão, escolhendo "Baixar ao abrir" entre três opções (baixar ao abrir; um
botão "Baixar"; nunca baixar), depois que todos os cofres de
`~/Documents/obsidian` foram encontrados removidos do disco pelo "Otimizar
armazenamento do Mac" do iCloud, com o disco a 99 %, e a janela mostrando-os
como erro.

- **O que o usuário abre na janela é baixado antes**: uma nota ou um arquivo
  aberto numa aba, um embed de uma nota aberta, um cartão de um board aberto,
  uma imagem ou um PDF mostrado (o protocolo `verso:`), um template, uma
  propriedade ou uma relação escrita. A barra de status diz "Baixando do
  iCloud…" enquanto espera.
- **Nada mais baixa.** A varredura, o índice, o vigia e a leitura de todas as
  notas (localizar e substituir) leem como antes e nunca baixam: abrir uma
  pasta continua não puxando nada, a razão de a guarda ser checada antes de
  qualquer abertura. Uma miniatura na visão de uma pasta também não é baixada.
  A CLI e o servidor MCP continuam lendo sem baixar — leitura do autor sobre a
  decisão, que nomeia só a janela.
- **Baixar é um passo à parte.** Toda leitura continua recusando um
  placeholder, então nada nunca lê um como texto: o core nomeia o placeholder,
  o host o baixa fora da thread principal e fora da trava da pasta, e a janela
  lê de novo.
- **Só a forma dataless.** A forma antiga `.Nome.ext.icloud` não pode ser
  baixada lendo-a, e continua "conteúdo indisponível".
- **Um arquivo que o provedor não consegue servir é erro, nunca arquivo
  vazio.** Foi observado um item que lê como zero bytes e continua dataless
  depois da leitura: o download diz que falhou, e a leitura continua
  recusando-o.

**O que abrir cobre, e o índice entre versões. Decidido pelo mantenedor em
2026-10-01**, em sessão, sobre a revisão crítica
[`docs/review/board.md`](../review/board.md), seção 6, itens 7 e 8: "Aceito
todas (Recomendado)", aceitando a recomendação do autor para cada um.

- **Aberto é o arquivo da frente.** Uma nota ou um arquivo que o usuário abre,
  e o que ele mostra — os seus embeds, os cartões de um board, as suas
  imagens — descem. Um espaço de trabalho trazido de volta na abertura lê
  toda aba sem baixar, e só a aba da frente de cada área desce; outra aba
  desce quando é mostrada. Uma mudança que o vigia relata nunca baixa: uma
  nota aberta que o macOS mandou de volta para a nuvem fica como a aba a
  guarda. A linha de comando e o servidor MCP nunca baixam.
- **Uma aba cujo arquivo não pôde ser lido diz isso**, na página, com um jeito
  de tentar de novo; ela não mostra editor, então nada pode ser digitado nela
  e perdido.
- **O índice mantém as notas tiradas do disco entre versões.** A versão 6 do
  esquema é levada à versão 7 no lugar: uma nota tirada do disco mantém o seu
  último texto e links conhecidos, e toda nota lida do disco é lida de novo na
  próxima varredura.

## Alternativas descartadas

- Tratar arquivo não legível como ausente — é o comportamento que causa a perda
  registrada em §16.1.

## Status

Aceito. Mecanismo de detecção: decidido para o iCloud Drive em 2026-09-22 (as
duas formas, verificadas antes de o arquivo ser aberto); para os atributos
de nuvem do Windows, os do OneDrive entre eles, em 2026-10-08; `[ABERTO]` para os
demais provedores, cada um quando a plataforma chegar ou um usuário precisar.
Abrir um arquivo na janela o baixa: decidido em 2026-09-30; o que abrir cobre,
e o índice entre versões: decidido em 2026-10-01.

*2026-10-21* — `[DECIDIDO 2026-10-21]` (a marca do mantenedor, opção A, no questionário de decisões de 2026-10-20): os demais provedores (Dropbox, Google Drive, o do próprio macOS) são tratados cada um quando a plataforma chegar ou alguém precisar, como este Status já diz; falta ainda observar um placeholder real no Windows.
