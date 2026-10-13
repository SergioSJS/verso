# ADR 0082 — Coedição ao vivo de uma pasta sincronizada: a nota do desktop entra na sala do servidor enquanto online

- Data: 2026-10-10
- Fonte: o mantenedor, em sessão em 2026-10-10, perguntando se o Verso dá
  *"a mesma experiência do Notion no quesito de usuários editando o mesmo
  arquivo simultâneo"*. A resposta em sessão: sim onde todos editam no
  servidor — a janela do navegador e o app desktop abrindo uma pasta do
  servidor online entram numa sala ([0073](0073-self-hosted-server-first.md)
  item 7) — e não para o app desktop com uma pasta local **sincronizada**
  ([0079](0079-sync-a-local-folder-with-a-server.md)), onde uma mudança
  cruza ao salvar e duas pessoas numa mesma nota terminam com uma cópia
  de conflito. A proposta feita então, um híbrido em que a nota da pasta
  sincronizada entra na mesma sala enquanto o servidor está ao alcance, o
  mantenedor aprovou como direção: *"adorei sua sugestão… vai ser um
  grande diferencial, ainda mais comparando as ferramentas"*. Escrita por
  Fable 5.1 a pedido do mantenedor, uma troca dos papéis da
  [0032](0032-author-and-reviewer-roles.md) como a [0080](0080-the-trash-with-expiry-and-restore.md)
  e a [0081](0081-sharing-between-people-on-one-universo.md) foram; a ser
  lida por Opus 5.5 antes de ser aceita.
- Relacionados: [0073](0073-self-hosted-server-first.md) (item 7, salas
  de edição simultânea, Yjs como o mecanismo de uma sessão ao vivo e o
  arquivo como a verdade, uma mudança de fora fundida na sala ou parando
  a sala; item 2, a janela aprende a que distância está o core; item 10,
  sync por arquivo, conflitos como cópia, fusão por bloco só depois de
  conflitos vistos em uso), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 1, uma pasta local com uma pasta do servidor, um leitor sincroniza
  para ler; item 3, a base guardada fora da pasta; item 5, o WebSocket da
  sessão de aparelho; item 6, offline nada enfileira além da diferença do
  estado; item 7, uma mudança de um lado só, recebida por uma sala aberta
  como qualquer escrita; item 8, a cópia de conflito; item 13, a barra de
  status; o teste de propriedade dela), [0074](0074-accounts-and-access-on-the-server.md)
  (item 8, a sessão de aparelho; papéis), [0026](0026-core-ui-contract-inviolable-rules.md)
  (regra 1, a UI só pelo contrato; regra 2, latência e disponibilidade
  pelas capacidades; regra 3, tipos gerados do Rust),
  [0012](0012-files-are-source-of-truth.md), [0021](0021-sync-automerge-layered-config.md)
  (revisada pela 0073: um CRDT é o mecanismo de uma sessão ao vivo, nunca
  a forma guardada de uma nota), [0044](0044-verso-fs-semantics.md) (o
  watcher), [0065](0065-a-folder-per-window.md) (uma pasta por janela),
  [0080](0080-the-trash-with-expiry-and-restore.md) (item 6, uma
  restauração numa sala é uma mudança de fora), [0081](0081-sharing-between-people-on-one-universo.md)
  (item 6, um compartilhamento sincronizado como pasta local; item 12, a
  sala de um compartilhamento é a sala da pasta do dono, um leitor
  presente e sem digitar), [0029](0029-guardrails-in-ci.md) (o guardrail
  de uma feature visto falhando primeiro), [0035](0035-cross-cutting-requirements.md)
  (os dois idiomas, acessibilidade), [0078](0078-universo-the-name-of-verso-as-a-server.md)
  (UniVerso).
- Status no briefing: ausente; ao ser aceita.
- Revisões: 2026-10-12 (noite) — item 12 decidido e construído: todo
  arquivo que uma pessoa edita na janela é coeditado ao vivo — uma nota,
  qualquer arquivo de texto, uma base, um board — num servidor e pelo
  link de uma pasta sincronizada igualmente. O mantenedor, ao saber que só
  as notas eram: *"Então a gente não tá com a aplicação 100% cooperativa,
  né? Com coedição. Deveria estar. A gente ainda não fechou o universo."*
  O texto antigo do item 12 fica, a decisão abaixo dele; construído em
  `feat/coedit-everything` (21d096a, 5a027db).

## Contexto

O que existe, em duas metades que não se encontram.

**No servidor, uma sala.** Uma nota aberta nas janelas de várias pessoas
é uma sala (`crates/verso-server/src/collab.rs`): um documento Yjs na
memória do servidor, cujo lugar é a chave da pasta e o caminho da nota.
Cada janela aplica suas edições ao documento e manda a atualização; o
servidor a repassa às outras e mantém a presença (cursor e nome) sem
guardá-la. O arquivo continua a verdade ([0012](0012-files-are-source-of-truth.md)):
a sala o escreve com a escrita atômica 900 ms depois da última edição
(`QUIET`), sobre a revisão que leu ou escreveu por último (invariante 11),
e avisa as janelas com `collab-saved` e a revisão nova. A conexão de uma
janela que cai deixa a sala viva por dois minutos (`GRACE`), sob a mesma
`epoch`, para que a janela que volta mande o que digitou enquanto isso e
o Yjs guarde cada edição uma vez só; uma sala feita de novo a partir do
disco é outra epoch, e o que foi digitado na antiga não entra nela. Uma
mudança que chega ao arquivo de fora da sala — o sync de um aparelho, uma
restauração, o Obsidian pela montagem — entra na sala como uma edição
quando nada espera para ser escrito, ou para a sala com `collab-conflict`
para as pessoas nela escolherem (`changed_outside`, chamada pelo `told`
do sync do servidor desde c19e968). ⌘S é `collab_save`; um leitor entra, é
visto, e o servidor recusa o `collab_update` dele. A janela do navegador e
o app desktop numa pasta do servidor **online** entram os dois: o desktop
encaminha `collab_*` pela conexão da janela (`app/src-tauri/src/remote.rs`),
e o lado da janela é um módulo só (`app/ui/src/collab.ts`) cuja aba
(`app/ui/src/leaves/note.ts`) mostra o texto da sala, desfaz só as
próprias edições, salva pela sala, e ignora o disco enquanto está numa
sala porque a sala traz toda mudança para dentro. O teste e2e "two
windows edit one note at once and the file follows" cobre isso.

**No desktop, uma pasta sincronizada** ([0079](0079-sync-a-local-folder-with-a-server.md)).
Uma pasta local mantida em dia com uma pasta do servidor por uma tarefa
própria (`app/src-tauri/src/sync.rs`): um WebSocket por pasta sincronizada
sobre a sessão de aparelho, a pasta aberta nele, passadas nos lotes do
watcher, nos pushes do servidor, a cada cinco minutos e ao reconectar;
cada passada compara os arquivos daqui e de lá contra a **base** (o hash
em que os dois lados concordaram por último, guardado fora da pasta) e
executa um plano: enviar, baixar, apagar, renomear, ou — quando os dois
lados mudaram desde a base — um conflito, a versão do servidor sob o
nome e a local ao lado como cópia. A aba da nota numa pasta dessas edita
localmente: o salvamento automático escreve o arquivo por `write_note`
1,5 s depois da última tecla, o watcher vê a escrita, o sync a envia.
Duas pessoas editando a mesma nota em duas pastas sincronizadas não veem
nada uma da outra até um salvamento cruzar, e quando as duas salvaram
antes de a mudança do outro lado chegar, uma delas encontra uma cópia de
conflito. Sem cursores, sem fusão. É sobre isso que o mantenedor
perguntou, e é o que a [0073](0073-self-hosted-server-first.md) item 10
deixa como está até conflitos terem sido vistos em uso.

As duas metades têm em comum um servidor, uma sessão, uma chave de pasta
e um caminho. O que falta é a aba do desktop, numa pasta sincronizada,
falando com a sala enquanto o servidor está ao alcance — e um relato
preciso de quem escreve o arquivo local enquanto isso, já que dois
escritores de um arquivo só (os salvamentos da sala descendo pelo sync, e
o salvamento automático da própria aba) correriam um contra o outro e
fariam conflitos do nada.

## Decisão

Proposta (2026-10-10); aceita em 2026-10-11 (Status). Cada `[ABERTO]`
trouxe uma recomendação; o mantenedor decidiu. Itens abertos respondidos
em 2026-10-10 (Status).

1. **Uma nota de uma pasta sincronizada está ao vivo enquanto o servidor
   está ao alcance.** Quando uma pasta local sincroniza com um UniVerso
   ([0079](0079-sync-a-local-folder-with-a-server.md) item 1) e o sync
   dela está conectado, uma nota aberta no app desktop entra na **mesma
   sala** que o navegador e o desktop online usam: as pessoas veem os
   cursores e os nomes umas das outras, as edições se fundem letra a
   letra, o servidor escreve o arquivo quando elas assentam, e o sync leva
   o resultado para o arquivo local. Offline, como hoje: editada
   localmente, comparada a partir da base na volta, uma cópia de conflito
   só quando os dois lados mudaram a mesma nota ([0079](0079-sync-a-local-folder-with-a-server.md)
   itens 6 e 8). Nada da sala do servidor muda de forma para isso: uma
   sala não distingue um desktop sincronizado de um navegador.
2. **A conexão é a do sync.** O tráfego da sala de uma pasta sincronizada
   vai pela conexão que o sync dela já mantém — o WebSocket da sessão de
   aparelho com a pasta aberta nele ([0079](0079-sync-a-local-folder-with-a-server.md)
   item 5) — nunca por uma da janela e nunca por uma nova. Razões: essa
   conexão é uma por pasta sincronizada, existe exatamente enquanto a
   pasta sincroniza, já ouve os pushes da pasta, e é a que a barra de
   status mostra como sincronizada ou offline — uma segunda conexão
   poderia estar de pé com o sync caído, duas verdades sobre uma pasta; e
   uma janela numa pasta local não tem conexão própria com um servidor
   (`remote::of` está vazio para ela; a janela não sabe que a pasta
   sincroniza). No host, a tarefa do sync repassa às janelas da pasta o
   que ouve cujo nome começa com `collab-`, e responde aos comandos
   `collab_*` da pasta mandando-os pelo link dela, como o `forward` da
   pasta online faz.
3. **Pelo contrato, sem nada novo** ([0026](0026-core-ui-contract-inviolable-rules.md)
   regra 1). A janela mantém os seis comandos (`collab_join`, `_update`,
   `_awareness`, `_leave`, `_save`, `_resolve`) e os cinco eventos
   (`collab-update`, `-awareness`, `-saved`, `-conflict`, `-closed`); o
   host do desktop, que hoje os responde com "edição simultânea é de um
   servidor", responde a eles para uma pasta sincronizada pelo link do
   sync dela, e como hoje para uma que não sincroniza ou cujo link está
   caído. A janela aprende se pode entrar por `capabilities` (regra 2):
   `collab` está entre as capacidades de uma pasta local enquanto o link
   do sync dela está de pé, com `latency_ms` desse link; a janela pergunta
   de novo quando `sync-status` diz que o estado mudou (como pergunta de
   novo hoje numa mudança de papel). Nenhum tipo muda de forma; os
   bindings gerados não se movem (regra 3).
   *(Revisto em 2026-10-12, registrando o que o mantenedor ordenou nesse
   dia — "Ajuste todas essas pendências agora", "falei pra implementar
   tudo isso" — com a entrada para escrever numa nota ao vivo só em outro
   lugar, d86bce7:)* um comando é acrescentado, só de leitura:
   `collab_present`, "tem alguém na sala desta nota?". Uma escrita que não
   é digitação — a citação de um PDF, uma célula de base, a figurinha, o
   rótulo ou a ordem da árvore, uma propriedade do painel — numa nota que
   esta janela não tem ao vivo pergunta isso; quando há alguém, a escrita
   entra na sala, faz a sua única edição no texto da sala, faz a sala
   salvar e sai, em vez de gravar o arquivo por baixo da sala e criar uma
   cópia de conflito numa pasta sincronizada. Sem ele a janela teria de
   entrar às cegas, toda vez, para saber o mesmo. Não muda nenhum tipo
   dos seis comandos nem dos cinco eventos; os bindings gerados se movem
   por esse único comando (a regra 3 continua valendo: gerados do Rust,
   nunca escritos à mão). O servidor responde a partir das suas salas, o
   link do sync de uma pasta sincronizada o leva, e o desktop numa pasta
   de servidor o encaminha.
4. **Identidade e papel: os da sessão de aparelho.** A pessoa na sala é a
   conta com que o aparelho entrou ([0074](0074-accounts-and-access-on-the-server.md)
   item 8); o nome que os outros veem é o da conta, como pelo navegador.
   O papel é o papel na pasta como o link do sync o aprendeu, seguido numa
   mudança de papel. Um **leitor** ([0079](0079-sync-a-local-folder-with-a-server.md)
   item 1 sincroniza para ler) entra, está presente com cursor e nome, e
   não digita: a aba é só de leitura como é para um leitor hoje, e o
   servidor recusa a atualização de um leitor como já recusa. Dois apps
   desktop de uma mesma pessoa são dois membros com um nome e uma cor,
   como duas abas de navegador de uma pessoa são hoje; nada distingue um
   aparelho na sala.
5. **Quando uma nota entra e sai.** Entra quando tudo isto vale: a pasta
   sincroniza e não está pausada; o link do sync está de pé; a nota abre
   numa aba para edição (uma nota com fins de linha misturados é só de
   leitura e não entra em nada, como hoje); e o item 7 rodou. Sai quando a
   aba fecha ou lê outra nota, quando o sync é pausado ou desligado (a
   aba fica local, item 9), e quando o link cai (item 9). Se a janela tem
   foco não importa: uma aba atrás de outra continua na sala e recebe as
   edições dos outros, como uma aba de navegador atrás de outra. `[ABERTO]`:
   se uma nota entra **ao abrir**, ou só **quando alguém já está nela**.
   Recomendado: **ao abrir**. Entrar depois significaria trocar a aba do
   salvamento automático local para uma sala no meio da digitação, com
   texto local não salvo — o caso difícil do item 7, acontecendo em
   silêncio e na pior hora — e o servidor teria de empurrar a presença de
   cada pasta a todo aparelho para dizer "alguém está aqui agora". Entrar
   ao abrir põe o caso difícil na hora de abrir, com o texto em repouso;
   o servidor já faz uma sala a partir do disco na primeira entrada, um
   documento Yjs por nota aberta; e uma sala com um membro só custa uma
   escrita por rajada assentada, como o salvamento automático local custa
   — decidido em 2026-10-10: uma nota entra na sala dela ao abrir.
6. **Quem escreve o arquivo local enquanto a nota está numa sala: o sync,
   e mais ninguém no Verso.** Os salvamentos da sala caem no servidor, o
   registro de mudanças os anota, o servidor empurra `sync-changed`, a
   passada do sync os baixa sobre o arquivo local — atomicamente, pelo
   `verso-fs`, sobre o hash que a passada viu (invariante 9, e a
   invariante 11 mantida pela passada). A aba **não escreve nada
   localmente** enquanto está numa sala: o salvamento automático dela é o
   salvamento da sala (`collab_save`), como a aba do navegador já faz, e
   `write_note` nunca roda a partir de uma aba numa sala. A revisão da aba
   é a do servidor, de `collab_join` e de `collab-saved`, e a aba ignora
   as notícias do watcher sobre o arquivo local enquanto está numa sala,
   como as ignora no navegador: a sala traz toda mudança para dentro.
   Assim o arquivo local tem um escritor só no Verso e a invariante 11
   nunca dispara nos salvamentos da própria sala; no que ela ainda pode
   disparar é num programa fora do Verso (item 11). O host guarda, por
   pasta, o conjunto de caminhos que as janelas dele mantêm em salas, e
   para cada um o hash do último texto que a própria aba escreveu
   localmente — vazio enquanto online, preenchido pelo recuo do item 9 —
   e a passada o lê: uma mudança local cujo hash é esse é da própria aba,
   já está na sala, e **não é enviada nem é conflito**; o salvamento do
   servidor é baixado e a base acompanha. Uma mudança local com qualquer
   outro hash é de fora, item 11.
7. **Entrar numa sala com edições locais não sincronizadas.** O arquivo
   local pode diferir da base na hora de abrir — editado offline, ou
   editado há pouco pelo Obsidian e ainda não enviado. Três caminhos foram
   pesados. *Recusar entrar e dizer por quê*: seguro, e tira a nota ao
   vivo exatamente quando ela importaria, por uma razão que é o tempo do
   sync. *Aplicar o texto local na sala como uma atualização*: o texto da
   sala e o local diferem, o aparelho guarda o hash da base e não os
   bytes dela ([0079](0079-sync-a-local-folder-with-a-server.md) item 3),
   então não há fusão a três vias — o texto local substituiria o miolo
   diferente da sala, por cima do que outra pessoa esteja digitando ali,
   uma sobrescrita silenciosa. *Enviar primeiro*: a passada comum do sync
   nesse caminho, com a base — o servidor parado desde a base, o texto
   local é enviado e a entrada o encontra (numa sala já aberta lá, entra
   como uma mudança de fora, [0073](0073-self-hosted-server-first.md)
   item 7); os dois mudaram, uma cópia de conflito como a [0079](0079-sync-a-local-folder-with-a-server.md)
   item 8 a faz, a versão do servidor ficando com o nome e a aba entrando
   na sala dela, a cópia listada nos conflitos da pasta e dita.
   **Decidido: enviar primeiro.** A entrada espera a passada nesse
   caminho, limitada a poucos segundos, a barra de status dizendo
   "enviando 1"; com o link caído não há entrada e a aba é local.
8. **A conexão cai enquanto a nota está numa sala.** O link do sync fecha;
   o host avisa as janelas da pasta, e cada aba numa sala dessa pasta
   **mantém o texto** — o do documento Yjs, com as edições que a sala
   ainda não tinha salvado — e **fica local**: lê o arquivo local para
   pegar a revisão, mantendo o texto; está suja quando os dois diferem; e
   o salvamento automático comum dela escreve o texto por `write_note`
   sobre essa revisão, que é a atual do arquivo, então a invariante 11
   vale e nada digitado se perde — está no arquivo local dentro do atraso
   do salvamento automático. A presença é limpa, o status diz que a nota
   está local e por quê (item 14). O documento Yjs continua ligado ao
   editor, então digitar offline continua a atualizá-lo: é isso que o
   item 9 manda de volta. No servidor a sala é escrita quando esvazia e
   fica dois minutos ([0073](0073-self-hosted-server-first.md) item 7, o
   `GRACE`).
9. **Voltar a ficar online.** O link é feito de novo; antes de a primeira
   passada tocar um caminho que uma aba mantém numa sala, o host avisa as
   janelas e cada aba dessas entra de novo, como a do navegador faz; a
   passada espera essas respostas, limitada a poucos segundos (uma aba
   que não responde é tida como tendo saído, e a comparação comum vale —
   que faz uma cópia, nunca perde). **A mesma epoch**: a aba manda o
   estado Yjs inteiro e o Yjs guarda cada edição uma vez só, então o que
   foi digitado offline se funde letra a letra com o que os outros
   digitaram enquanto isso; a sala salva; o arquivo do servidor muda; a
   passada o baixa sobre o arquivo local, que guarda o texto do próprio
   recuo da aba — o hash que o item 6 lembra — então não é conflito.
   **Outra epoch** (mais que a tolerância, o servidor reiniciou, a nota
   renomeada): a aba sai da sala e mantém o texto, que o recuo já pôs no
   arquivo local, e diz ao host que o caminho saiu das salas dela; a
   passada compara o arquivo a partir da base — o servidor parado, um
   envio; os dois mudaram, uma cópia de conflito, a do servidor sob o
   nome — e a aba então entra na sala de novo sobre a versão do servidor,
   a cópia ao lado e dita. Ao contrário do "não pôde ser mantido" do
   navegador, o desktop guarda toda versão: no arquivo ou na cópia.
10. **Pausar e desligar.** Pausar o sync, ou desligá-lo, tira toda nota da
    pasta da sala dela pelo recuo do item 8: o texto mantido, o arquivo
    local de novo dela. Retomar é o item 9 com outra epoch no caso comum,
    pela comparação comum do sync.
11. **Um programa fora do Verso edita o arquivo local enquanto a nota
    está numa sala** — o Obsidian no mesmo computador, um script. O
    watcher reporta; a aba na sala ignora (item 6); a passada encontra uma
    mudança local cujo hash não é o da própria aba, então é uma mudança de
    fora no aparelho e o sync a envia como qualquer outra ([0079](0079-sync-a-local-folder-with-a-server.md)
    item 7): o arquivo do servidor parado desde a base, o envio entra, o
    `told` chega à sala, e ela entra na sala como uma edição quando nada
    espera para ser escrito, ou para a sala para as pessoas nela
    escolherem ([0073](0073-self-hosted-server-first.md) item 7); o
    arquivo do servidor mudou desde a base — a sala salvou enquanto isso,
    o que uma nota ao vivo faz a cada rajada assentada — o envio é
    recusado como mudado e a passada seguinte faz uma **cópia de
    conflito** da versão de fora ao lado da nota, a versão da sala ficando
    com o nome ([0079](0079-sync-a-local-folder-with-a-server.md) item 8),
    a aba continuando na sala, a cópia listada e dita. Honesto, e o limite
    de um sync por arquivo: fundir essa edição de fora na sala precisa dos
    bytes da base para uma fusão a três vias, que é o trabalho posterior
    das Consequências.
12. **Salas são para notas.** Um arquivo `.md` com um só tipo de fim de
    linha entra; nada mais entra. A coedição do board continua `[ABERTO]`
    na [0073](0073-self-hosted-server-first.md) item 7 (deixada aberta em
    2026-10-10); boards, bases,
    canvases, anexos e os ajustes da pasta cruzam pelo sync como arquivos,
    e duas pessoas num mesmo board em duas pastas sincronizadas terminam
    como a [0079](0079-sync-a-local-folder-with-a-server.md) item 8 diz.
    *(Decidido e construído em 2026-10-12, o texto antigo mantido acima.)*
    O mantenedor, na noite de 2026-10-12, ao saber que só as notas eram
    coeditadas ao vivo: *"Deveria estar"* — construir agora, nada pela
    metade. **Todo arquivo que uma pessoa edita na janela tem uma sala**,
    num servidor e pelo link de uma pasta sincronizada igualmente, sob os
    itens 1 a 11 e 13 a 15 como a de uma nota:
    - **Um arquivo de texto** — `.txt`, `.json`, `.csv`, o `.base` de uma
      base, o código de uma página, qualquer arquivo que a janela abre no
      seu editor de código — é uma sala como a de uma nota: um texto Yjs
      ligado ao editor, lido e gravado como texto, uma escrita de outro
      lugar fundida pela sala. Uma base mudada pelos ajustes da sua visão
      (filtros, colunas, ordenações, visões) muda o texto do editor, então
      entra como a digitação.
    - **Um board** (`.canvas`) é uma sala dos seus elementos: um mapa Yjs
      com uma entrada por elemento e versão (`id`, `version`,
      `versionNonce`), o elemento como JSON, ao lado dos fatos do arquivo de
      que foi feita. **A regra de fusão é a reconciliação do próprio
      Excalidraw**: duas pessoas mudando elementos diferentes, as duas
      mudanças ficam; no mesmo elemento vence a `version` maior, e no
      empate o `versionNonce` menor, igual em todos os lados, em qualquer
      ordem que as edições cheguem. Apagar é o elemento com `isDeleted` —
      uma lápide, nunca removida — mandado um milhão de versões à frente,
      então um arrasto feito ao mesmo tempo, que conta suas versões a
      partir de onde começou, não o traz de volta; um desfazer feito depois
      conta a partir da versão do apagar e vence. As imagens que um board
      mostra são arquivos da pasta: suas referências cruzam com os
      elementos, seus bytes como arquivos. A presença é o ponteiro, a
      seleção, o nome e a cor, carimbados pelo servidor (modelo de ameaças,
      lacuna 11), desenhados como os colaboradores do Excalidraw.
    - **Quem grava o arquivo de um board.** O servidor não sabe desenhar um
      board: a primeira janela a entrar desenha o arquivo de que a sala foi
      feita e o põe nela, o que não é edição de ninguém (abrir não grava
      nada, invariante 7); cada janela que edita entrega à sala o arquivo
      que o seu próprio conversor faz do estado da sala, com o vetor Yjs
      desse estado (`collab_canvas`). A sala grava o arquivo feito
      exatamente do estado que tem — a saída do conversor da cena fundida
      — pelo gravador de boards do núcleo, atomicamente e sobre a revisão
      que leu (invariantes 9 e 11), quando as edições assentam e no
      `collab_save`; o registro de mudanças da pasta tem o salvamento antes
      de as janelas ouvirem. Uma edição feita na sala nunca é uma cópia de
      conflito. Uma mudança de fora enquanto há edições esperando para a
      sala para as pessoas nela escolherem, como a de uma nota; sem nada
      esperando a sala fecha e as janelas desenham o arquivo de novo.
    - **O contrato** ganha, ao lado do `collab_present` do item 3, o tipo
      da sala no `CollabJoin` (`text` ou `board`) e o comando
      `collab_canvas`; os bindings são gerados do Rust (regra 3).
    - **Fora de uma sala**: um canvas em outro layout, até o primeiro
      salvamento, mostrado como diff, o pôr no do Obsidian
      ([0057](0057-board-json-canvas.md) ponto 13); um board de um Verso
      mais novo, mostrado e nunca gravado; um arquivo com fins de linha
      misturados, só leitura como o de uma nota; e um desenho do plugin
      Excalidraw, que a janela mostra e nunca edita
      ([0057](0057-board-json-canvas.md) ponto 5) — o texto dele é uma nota,
      ao vivo como as notas, e o desenho mostrado segue os salvamentos da
      sala.
    - **Limites** (`docs/reference/threat-model.md`): uma atualização de
      board de 4 MB e 10 000 entradas no máximo; uma sala de board de
      100 000 entradas e 64 MB; um arquivo entregue a ela de 16 MB; uma
      presença de 16 KB, como a de uma nota.
13. **Um compartilhamento, e um leitor.** Quem recebe e sincronizou um
    compartilhamento como pasta local ([0081](0081-sharing-between-people-on-one-universo.md)
    item 6) entra na **sala da pasta do dono**: o lugar da sala é a chave
    da pasta do dono e o caminho completo, para o qual o compartilhamento
    resolve ([0081](0081-sharing-between-people-on-one-universo.md) item
    12). O papel de quem recebe no compartilhamento é o papel na sala: um
    leitor presente e sem digitar, um editor digitando. Nada mais do
    compartilhamento cruza pela sala: a presença nomeia pessoas, não
    caminhos.
14. **O que a pessoa é avisada, e acessibilidade** ([0035](0035-cross-cutting-requirements.md)).
    O estado da nota é dito em palavras, na barra de status ao lado do
    estado do sync ([0079](0079-sync-a-local-folder-with-a-server.md)
    item 13) e na aba: *ao vivo, com Ana e Bia* — *live, with Ana and
    Bia* —, *ao vivo, sozinho*, *local — offline*, *local — sync pausado*,
    *alcançando…* enquanto o envio do item 7 roda. Os cursores dos outros
    levam os nomes como texto, nunca uma cor só. Uma região viva anuncia,
    para um leitor de tela, alguém entrando ou saindo da nota, e a nota
    ficando local ou ao vivo, com a razão ("A nota agora está local: a
    conexão caiu; seu texto está salvo neste computador"). A seção Sync da
    pasta nos Ajustes mostra o mesmo estado e guarda o ajuste do item 15.
    pt-BR e inglês do começo ao fim.
15. **Ligado por padrão.** `[ABERTO]`: se a coedição ao vivo fica ligada
    para toda pasta sincronizada, ou é opcional. Recomendado: **ligada**,
    com um ajuste por pasta sincronizada, "Editar notas junto enquanto
    online" — *Edit notes together while online* — na seção Sync da
    pasta, desligado significando que a pasta fica como a [0079](0079-sync-a-local-folder-with-a-server.md)
    sozinha: edição local, conflitos como cópias. É a camada da pessoa
    ([0070](0070-what-travels-with-the-folder.md)), não escrita na pasta.
    Ligada por padrão porque é o sentido de sincronizar uma pasta com
    pessoas, e porque o recuo é o comportamento de hoje — decidido em
    2026-10-10: ligada por padrão, com o ajuste por pasta "Editar notas
    junto enquanto online" — *Edit notes together while online*.
16. **Testes.** Rust, contra um servidor real como o `tests_sync.rs` faz,
    sem janela: dois aparelhos sincronizados e um terceiro cliente
    fazendo as vezes do navegador numa sala só, cada um vendo as edições
    dos outros e os dois arquivos locais seguindo os salvamentos da sala;
    uma queda e uma volta dentro da tolerância (mesma epoch: nada perdido,
    nenhuma cópia) e depois dela (outra epoch: a cópia feita, nada
    perdido); uma mudança por um programa de fora num aparelho enquanto a
    nota dele está ao vivo (fundida na sala, ou a cópia feita); um leitor
    presente e recusado; sync pausado com uma nota ao vivo. A parte da
    janela no e2e do harness (`app/ui/e2e`): as palavras do status, o
    recuo mantendo o texto e salvando localmente, a reentrada, o ajuste;
    um harness que responde `collab_*` e emite `sync-status`. **O
    guardrail da feature, visto falhando primeiro** ([0029](0029-guardrails-in-ci.md)):
    um teste de propriedade **novo** ao lado do da [0079](0079-sync-a-local-folder-with-a-server.md),
    não uma extensão dele — aquele vive no `verso-core` com o motor
    sozinho e não tem sala nem `yrs`; este vive com as salas do servidor
    — em que dois aparelhos e uma sala, digitando ao acaso na sala e fora
    dela, caindo e voltando, e sincronizando em ordens ao acaso, terminam
    com os mesmos arquivos e não perdem nenhuma edição: todo texto
    digitado na sala está no arquivo, toda versão perdida é uma cópia de
    conflito. Visto falhando com a falha plantada de a passada do item 9
    tratar um caminho reentrado como conflito.

## Consequências

- O host do desktop: a tarefa do sync repassa eventos `collab-*` às
  janelas da pasta e responde `collab_*` pelo link dela; as capacidades
  de uma pasta local dizem `collab` e a latência do link enquanto o link
  está de pé; por pasta, os caminhos em salas com o último hash próprio da
  aba, lido pela passada (item 6); a entrada esperando a passada no
  caminho dela (item 7); a reentrada antes da primeira passada (item 9);
  o recuo na queda, na pausa e no desligar (itens 8 e 10).
- O servidor: nada da sala muda; uma sala não distingue um aparelho de um
  navegador. A recusa do leitor já existe.
- A janela: o recuo que mantém o texto, relê a revisão e salva
  localmente; o caminho de outra epoch do desktop, que mantém em vez de
  descartar; as palavras do status e a região viva; o ajuste da pasta; os
  dois idiomas. O changelog ganha a linha dele. O vault de demonstração
  não consegue mostrar um servidor e o roteiro diz isso, como a
  [0081](0081-sharing-between-people-on-one-universo.md) faz;
  `docs/reference/manual-checks.md` ganha a nota ao vivo em dois
  computadores ao lado da verificação do sync.
- A [0073](0073-self-hosted-server-first.md) item 7 ganha uma linha de
  Revisões ao ser aceita: o app desktop numa pasta sincronizada entra
  enquanto online. A [0079](0079-sync-a-local-folder-with-a-server.md)
  itens 7 e 8 ganham uma: uma nota ao vivo no aparelho não faz cópia de
  conflito do próprio texto; a cópia continua para edições offline e para
  programas de fora.
- **Depois, em ADR própria**, não esta: **fusão por bloco de edições
  offline** — um parágrafo cada, para que duas pessoas que editaram uma
  nota offline não terminem com uma cópia quando as mudanças delas não se
  tocam — e, com ela, a fusão a três vias da edição de um programa de
  fora numa sala ao vivo (item 11), as duas precisando dos bytes da base
  guardados, não só do hash. A [0073](0073-self-hosted-server-first.md)
  item 10 a põe depois de conflitos vistos em uso; `[ABERTO]`, registrado
  aqui para não ser esquecido. Em 2026-10-10 o mantenedor a deixou para
  depois: ela precisa dos bytes da base.

## Alternativas descartadas

- **Uma conexão própria para as salas, por janela ou por nota** (levantada
  pelo autor, item 2): duas verdades sobre se a pasta está online, as
  sessões do aparelho dobradas, e nada que dê que o link do sync não dê.
- **Recusar entrar com edições locais não sincronizadas** (levantada pela
  autor, item 7): a nota ao vivo tirada pelo tempo do sync.
- **Aplicar o texto local na sala como uma atualização** (levantada pela
  autor, item 7): sem base de onde fundir, então uma sobrescrita do que
  outra pessoa está digitando.
- **Descartar o que foi digitado quando a sala é outra** (o comportamento
  do navegador, considerado para o desktop no item 9): o desktop tem o
  arquivo; nada é descartado.
- **Entrar só quando alguém está na nota** (levantada no briefing da
  sessão; item 5): deixada aberta para o mantenedor, com as razões
  contra; o mantenedor escolheu entrar ao abrir em 2026-10-10.
- **Fusão por bloco agora** (levantada pela pergunta do mantenedor, como a
  lacuna que esta ADR estreita): a [0073](0073-self-hosted-server-first.md)
  item 10 a põe depois de conflitos vistos em uso; Consequências.

## Status

**Aceita (2026-10-11).** Itens abertos respondidos em 2026-10-10 como
recomendado; lida por Opus 5.5 (o handoff de 2026-10-10 e a leitura das
respostas); aceita pelo mantenedor em 2026-10-11 (*"Mas eu tinha
confirmado"* às recomendações). A coedição do board segue `[ABERTO]` de
propósito (item 12); a fusão por bloco de edições offline fica para
depois, em ADR própria.

**Construída na noite de 2026-10-11 para 12** (f0d7398, 807c8c9, 2de0737, cb7b29d e 5add311, juntados ao `feat/universo` pelo 817886e em 2026-10-12); o item 7 do
[0073](0073-self-hosted-server-first.md) e os itens 7 e 8 do
[0079](0079-sync-a-local-folder-with-a-server.md) ganharam as linhas de
Revisões em 2026-10-12, como as Consequências pedem. As perguntas em
aberto que a construção levantou foram mandadas ao mantenedor na mesma
noite, e respondidas (abaixo): onde mora o ajuste do item 15; as esperas
de 5 s pelo envio antes de entrar (item 7) e de 4 s pelas reentradas
antes de uma passada (item 9); as escritas que o painel de propriedades
e a citação de um PDF fazem numa nota, pela sala; e o board (item 12).

**Item 12 decidido e construído em 2026-10-12** (noite; 21d096a e 5a027db
em `feat/coedit-everything`): todo arquivo que uma pessoa edita na janela
é coeditado ao vivo, o board pela regra do próprio Excalidraw, como o item
12 agora diz. O mantenedor: *"Então a gente não tá com a aplicação 100%
cooperativa, né? Com coedição. Deveria estar. A gente ainda não fechou o
universo."* A [0057](0057-board-json-canvas.md) e o item 7 da
[0073](0073-self-hosted-server-first.md) ganharam suas linhas de Revisões
no mesmo dia.

**Respondidas pelo mantenedor em 2026-10-12** (01:15 BRT), item a item: o ajuste do item 15 fica nos ajustes da janela; as esperas de 5 s e
de 4 s ficam, a afinar com o uso; as escritas que o painel de
propriedades e a citação de um PDF fazem numa nota ao vivo passam pela
sala — decidido, construído em 2026-10-12: cada uma entra como uma
edição do editor da aba, como a digitação, e a sala grava o arquivo; com
elas as outras escritas de uma propriedade que não são teclas — um
adesivo, uma cor ou uma capa, a célula de uma base, o rótulo e a ordem
da árvore; uma nota que não está ao vivo é gravada como antes; e a
coedição do board segue `[ABERTO]` (item 12).

*(Histórico, antes da aceitação acima:)* Proposta em 2026-10-10. O
mantenedor aprovou a direção em sessão; os itens
são do autor. A ser lida por Opus 5.5 antes de ser aceita. Para o
mantenedor, cada um com uma recomendação: se uma nota entra ao abrir ou só
quando alguém está nela (item 5; ao abrir); se a coedição ao vivo fica
ligada por padrão para pastas sincronizadas (item 15; ligada, com um
ajuste por pasta para mantê-la só local); e, em ADR própria, a fusão por
bloco de edições offline (Consequências).

Itens abertos respondidos em 2026-10-10. O mantenedor, em sessão, às recomendações acima: *"Gostei das recomendações, pode seguir"* —
os itens 5 e 15 decididos como recomendado, no lugar; a coedição do board
segue `[ABERTO]` (item 12, item 7 da [0073](0073-self-hosted-server-first.md));
a fusão por bloco de edições offline fica para depois, em ADR própria,
pois precisa dos bytes da base (Consequências).
