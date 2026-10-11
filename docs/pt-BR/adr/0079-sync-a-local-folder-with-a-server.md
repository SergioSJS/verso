# ADR 0079 — Sync: uma pasta do desktop mantida em dia com uma pasta num servidor

- Data: 2026-10-10
- Fonte: o mantenedor, em sessão em 2026-10-10, abrindo a rodada depois da
  0.7.0-beta.1: *"quero sincronização funcionando também"*. Escrito por Opus
  5.5; a ser lido por Fable 5.1 ([0032](0032-author-and-reviewer-roles.md))
  antes de ser aceito.
- Relacionados: [0073](0073-self-hosted-server-first.md) (item 10, o sync
  depois do servidor e por ele, por arquivo, conflitos como cópia, nada
  silencioso; item 7, a edição simultânea), [0075](0075-server-packaging-and-storage.md)
  (item 5, o sync escolhido pasta a pasta, desligado por padrão, o espaço
  mostrado antes), [0020](0020-sync-merge-in-core-transports-as-plugins.md)
  (o merge no core; revista pela 0073), [0012](0012-files-are-source-of-truth.md),
  [0043](0043-placeholder-guard.md) (um placeholder nunca é um apagamento),
  [0044](0044-verso-fs-semantics.md) (o watcher, caminhos ignorados),
  [0070](0070-what-travels-with-the-folder.md) (o que viaja com uma pasta;
  item 3, nomes que todo sistema guarda), [0011](0011-config-outside-tree-index-as-cache.md)
  (estado fora da pasta), [0074](0074-accounts-and-access-on-the-server.md)
  (a sessão de aparelho, os papéis), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (cotas), [0078](0078-universo-the-name-of-verso-as-a-server.md) (Universo).
- Status no briefing: ausente; ao ser aceito.
- Revisões: 2026-10-10 — depois da revisão e da campanha de sync do mesmo
  dia, o mantenedor ficou com a resposta recomendada a cada questão que
  lhe foi posta: *"Gostei das recomendações, pode seguir"*. Item 9: a pausa
  precisa de pelo menos 3 apagamentos numa passada — um piso, para que
  numa pasta pequena um ou dois apagamentos não pausem (o M1 da revisão; lido
  como piso a partir do "pode seguir" à recomendação "pausar a partir de 3" —
  confirmado pelo mantenedor em 2026-10-11);
  e "a lixeira do sistema" corrigida para o `.trash/` da pasta, que é o
  que o código faz ([0080](0080-the-trash-with-expiry-and-restore.md)
  item 9). Itens 2 e 8: as duas formas Unicode de um nome são um arquivo
  só em todo lugar (Q7 da spec, decidida no mesmo dia a partir do achado
  F20 da campanha). Item 8: qual lado fica com o nome, decidido antes no
  mesmo dia (Status), marcado assim. Consequências: um limite conhecido,
  o achado F18 da campanha. Item 4: o registro de mudanças ganha o nome do
  aparelho (`changes.device`, esquema 6 do servidor, commit 08e746e) —
  "quem fez" agora nomeia o aparelho ao lado da conta. O piso do item 9 e
  o nome do aparelho confirmados pelo mantenedor em 2026-10-11, em sessão:
  *"Mas eu tinha confirmado"* — o
  *"Gostei das recomendações, pode seguir"* de 2026-10-10 cobre toda
  opção recomendada.

## Contexto

O que já está decidido: o sync vem depois do servidor e passa por ele
(itens 1 e 10 da 0073, a 0020 revista); a pessoa o liga pasta a pasta,
desligado por padrão, vendo antes o espaço da pasta (item 5 da 0075); ele
funciona por arquivo, por hash e carimbo; um conflito é guardado como uma
cópia ao lado do arquivo, com a diferença mostrada (invariante 11), nada
silencioso; merge por bloco vem só depois de os conflitos terem sido vistos
em uso.

A 0.7.0-beta.1 tem o servidor, e o app desktop abre uma pasta do servidor
**online**: toda leitura e escrita atravessa a rede, nada fica guardado no
computador. O sync é o outro caso: a pasta mora no computador — aberta e
editada offline, lida pelo Obsidian, com backup — e o servidor guarda os
mesmos arquivos, para os outros aparelhos da pessoa, o navegador, o
celular e os outros membros da pasta.

O que não está decidido é o como: o que atravessa, quando, o que são um
apagamento e uma mudança de nome, como a cópia se chama, o que acontece
offline, no primeiro sync, num apagamento em massa, sob uma cota.

## Decisão

Aceita (2026-10-10, Status).

1. **Uma pasta local sincroniza com uma pasta num servidor.** No app
   desktop, os ajustes de uma pasta oferecem "Sincronizar com um servidor":
   a pessoa escolhe um servidor em que está conectada (Ajustes ›
   Servidores) e uma pasta nova lá (feita com o nome da pasta local) ou uma
   existente em que seja dona ou editora. Um servidor por pasta local. Um
   leitor pode sincronizar para ler: as mudanças do servidor chegam, as
   locais são recusadas e mostradas. Desligar o sync deixa os dois lados
   como estão.
2. **A unidade é um arquivo**: todo arquivo que a varredura acha — notas,
   anexos, boards, os ajustes da própria pasta que viajam com ela (0070) —
   e nenhum dos caminhos que a varredura ignora (0044). Um arquivo é o seu
   caminho relativo à pasta, o hash dos seus bytes (SHA-256), o tamanho e a
   hora de modificação. **Um nome é um arquivo só em todo lugar** (Q7 da
   spec, decidida em 2026-10-10): dois caminhos que diferem só na forma
   Unicode dos acentos (NFC, NFD) são o mesmo arquivo — o servidor compara
   nomes em NFC, e cada aparelho guarda a grafia que o próprio sistema de
   arquivos deu ao nome.
3. **O estado mora fora da pasta** (0011): por pasta sincronizada, no
   diretório de configuração, o servidor, o id da pasta, um cursor nas
   mudanças do servidor e, por caminho, a **base** — o hash e o tamanho em
   que os dois lados concordaram por último, com a revisão do servidor.
   Nada é escrito na pasta por causa do sync.
4. **O servidor guarda um registro de mudanças por pasta**: cada escrita,
   apagamento e mudança de nome, com um número de sequência, o caminho, o
   hash e o tamanho novos, quem fez e quando — seja quem for: um navegador,
   um app desktop online, o sync de outro aparelho, um programa com token,
   uma mudança achada no disco do servidor. Um aparelho pede as mudanças
   depois do seu cursor e recebe avisos das suas pastas enquanto
   conectado.
5. **O que atravessa, e como**: a sessão de aparelho do app desktop (item 8
   da 0074) pelo WebSocket que ele já usa; os bytes de um arquivo lidos pela
   rota de arquivos do servidor e escritos pelos comandos de escrita do
   serviço, com a revisão base (invariante 11). Nenhum transporte próprio,
   nenhuma porta nova.
6. **Quando**: nos lotes do watcher local (com espera), nos avisos do
   servidor, ao iniciar e ao reconectar, e por uma varredura a cada cinco
   minutos como rede de segurança. Offline, nada fica numa fila além da
   diferença de estado: quando a conexão volta, os dois lados são
   comparados a partir das suas bases.
7. **Uma mudança de um lado só** é aplicada no outro: escrita de forma
   atômica (invariante 9) pelo `verso-fs` no computador, pelo serviço no
   servidor — onde uma nota aberta numa sala de edição simultânea (item 7
   da 0073) a recebe como recebe qualquer escrita, juntada à sala ou
   parando-a para as pessoas nela escolherem.
8. **Uma mudança dos dois lados desde a base é um conflito**: a versão do
   servidor fica com o nome do arquivo; a versão local é guardada ao lado
   como `<nome> (conflito, <aparelho>, <aaaa-mm-dd hh.mm>).<ext>` — no
   idioma da pessoa, com caracteres que todo sistema guarda (item 3 da
   0070) — e essa cópia também sincroniza, para os outros aparelhos a
   verem. A janela lista os conflitos da pasta, mostra cada diferença, e a
   pessoa junta à mão e apaga a cópia. Um arquivo mudado dos dois lados
   sob as duas formas Unicode de um nome (item 2) é um conflito assim: uma
   cópia ao lado dele (Q7 da spec, decidida em 2026-10-10). `[ABERTO]` até
   2026-10-10: qual lado fica com o nome. Recomendado: o do servidor, já
   que a cópia compartilhada com os outros é a que divergiu — decidido em
   2026-10-10 como recomendado (Status).
9. **Apagamentos**: um arquivo apagado de um lado e sem mudança do outro é
   apagado lá (para o `.trash/` da pasta no computador, para onde vai
   todo apagamento no Verso — item 9 da
   [0080](0080-the-trash-with-expiry-and-restore.md); "a lixeira do
   sistema" corrigida em 2026-10-10); apagado de um lado e editado do outro, a edição vence e o
   arquivo volta. Um placeholder de armazenamento sob demanda nunca é um
   apagamento (0043). Um lote que apagaria mais de um quinto dos arquivos
   da pasta, ou mais de 50, **pausa o sync** e pergunta à pessoa — uma
   pasta movida, um disco não montado, uma pasta de nuvem esvaziada,
   todos parecem apagamentos. A pausa precisa de **pelo menos 3
   apagamentos** numa passada (decidido em 2026-10-10, Revisões): numa
   pasta pequena, em que um quinto é um ou dois arquivos, um ou dois
   apagamentos não pausam.
10. **Mudanças de nome e de lugar**: um apagamento e uma criação do mesmo
    hash num lote local são enviados como mudança de nome, que o servidor
    aplica como uma; senão são um apagamento e uma criação. Os links que
    uma mudança de nome no Verso reescreve são edições de outras notas e
    sincronizam como tais.
11. **O primeiro sync** de uma pasta nunca apaga: um arquivo de um lado só é
    copiado para o outro; um arquivo dos dois lados com o mesmo hash está
    acordado; com hashes diferentes é um conflito (item 8). O espaço é
    mostrado antes de começar (item 5 da 0075), e dá para cancelar.
12. **Limites**: a cota do servidor (0077) vale — um arquivo recusado é
    listado e o resto sincroniza. Um arquivo maior que o limite de mensagem
    do servidor é enviado e buscado **em pedaços** (decidido em 2026-10-10,
    Status): cada pedaço abaixo do limite, o arquivo escrito só quando todos
    os pedaços chegaram e o hash confere, para que uma transferência
    quebrada não deixe nada escrito pela metade.
13. **O que uma pessoa vê**: o estado do sync da pasta na barra de status —
    sincronizado, enviando ou recebendo *n*, offline, pausado, *n*
    conflitos, erros — e, nos ajustes da pasta, um registro do que
    atravessou, pausar e retomar, e os conflitos. Nada é silencioso: todo
    arquivo não sincronizado tem o seu motivo.
14. **Celulares e navegadores não sincronizam**: trabalham na pasta do
    servidor online, como hoje. O offline no celular é o passo posterior do
    PWA (item 12 da 0073).

## Consequências

- O servidor ganha o registro de mudanças (no banco dele), um comando para
  lê-lo a partir de um cursor, avisos de mudanças por pasta para um
  aparelho, e um comando de mudança de nome que mantém o registro inteiro;
  todo caminho de escrita — navegador, desktop online, sync, token,
  mudanças achadas no disco — acrescenta a ele.
- O `verso-core` ganha o motor do sync (comparação com a base, o plano do
  que enviar e buscar, conflitos), sem rede: o host desktop roda o
  transporte dele pela sessão de aparelho. O `verso-fs` escreve como
  sempre.
- O app desktop ganha os ajustes de sync da pasta, o estado, a lista de
  conflitos e a diferença; os dois idiomas; testes de ponta a ponta da
  parte da janela e testes em Rust do motor contra um servidor real (como
  o `tests_remote` já faz), inclusive offline, conflito, apagamento em
  massa e primeiro sync.
- Um guardrail da feature, visto falhando primeiro (ADR 0029): um teste de
  propriedade em que dois aparelhos e um servidor, editando ao acaso e
  sincronizando em ordens ao acaso, terminam com os mesmos arquivos e não
  perdem nenhuma edição (cada versão perdida presente como cópia de
  conflito).
- **Um limite conhecido** (a campanha de sync de 2026-10-10, o achado
  F18 dela): um programa fora do Verso que guarda um arquivo inteiro na
  memória e salva esse buffer velho depois de o sync ter baixado uma
  versão mais nova sobrescreve a versão mais nova — para o sync é uma
  mudança comum de um lado só (item 7), e nenhum sync de arquivos
  inteiros consegue distingui-la de uma edição. O editor do próprio Verso
  confere a revisão (invariante 11) e não faz isso. A mitigação é a da
  [0080](0080-the-trash-with-expiry-and-restore.md): o servidor guarda a
  versão que a escrita de um aparelho substituiu, na lixeira da pasta,
  restaurável — numa rodada posterior.

## Alternativas descartadas

- **Merge por bloco agora**: o item 10 da 0073 o põe depois de os conflitos
  terem sido vistos em uso.

## Status

**Aceita em 2026-10-10** pelo mantenedor, em sessão: *"com exceção do 6, pode seguir o recomendado, o 6 pode já implementar"*. Item 8: a
versão do servidor fica com o nome, a local é a cópia, como recomendado.
Item 12, **não** como recomendado: arquivos maiores que o limite de
mensagem do servidor são enviados e buscados **em pedaços já**, nesta
rodada, para que nenhum arquivo fique de fora pelo tamanho. A ser lida por
Fable 5.1 com o código da rodada.
