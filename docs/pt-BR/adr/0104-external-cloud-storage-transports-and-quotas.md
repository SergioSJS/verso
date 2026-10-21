# ADR 0104 — Sincronizar com uma nuvem que a pessoa já tem: WebDAV, S3, Dropbox, OneDrive e Google Drive, pela sincronização da ADR 0079

- Data: 2026-10-20; reescrita em 2026-10-21; revisada no mesmo dia depois
  da revisão
- Origem: um primeiro texto escrito por outra IA (Gemini, no Antigravity) em
  2026-10-20, nunca commitado, a partir das sessões do mantenedor de
  2026-10-19 e 2026-10-20 explorando uma nuvem que a pessoa já tem como
  alternativa a rodar o UniVerso. O mantenedor respondeu às perguntas dele
  em 2026-10-21 (questionário de decisões de 2026-10-20): **na V1** (0104.1,
  opção B, não a recomendada "depois da V1"); uma **revisão independente
  antes de ser aceita** (0104.2, A — o questionário dizia "antes do commit";
  o texto foi commitado em 2026-10-21 como Proposta para o revisor lê-lo do
  repositório, e nada dele é aceito antes da revisão e das respostas);
  provedores *"todos esses mais One Drive"* — WebDAV, S3, Dropbox, Google
  Drive e OneDrive (0104.3); as chaves de cliente OAuth decididas quando o
  primeiro provedor OAuth for escolhido (0104.4, A). Depois, perguntado o
  que fazer com aquele texto (item N.1 da lista de decisões de 2026-10-21):
  *"Leia a 0104 mas refaça ou corrija o que fizer sentido, confio mais em
  você que Gemini"*. Reescrita pelo Opus 5.5 em 2026-10-21 sobre a
  sincronização da ADR 0079; revisada no mesmo dia pelo Fable 5.1 (2
  achados BLOQUEANTES, 14 IMPORTANTES, 13 MENORES, com as páginas dos
  provedores citadas); revisada pelo Opus 5.5 depois disso. As perguntas
  estão em `verso-decisoes-0104-nuvens-2026-10-21.md`, fora do repositório
  (perguntas C.1 a C.16).
- Relacionados: [0079](0079-sync-a-local-folder-with-a-server.md) (a
  sincronização que esta reaproveita),
  [0050](0050-outbound-network-access.md) (revisada aqui),
  [0020](0020-sync-merge-in-core-transports-as-plugins.md),
  [0073](0073-self-hosted-server-first.md) itens 4 e 12,
  [0009](0009-external-constraints.md),
  [0011](0011-config-outside-tree-index-as-cache.md),
  [0012](0012-files-are-source-of-truth.md),
  [0019](0019-generative-opt-in-and-keychain.md) (chaves no chaveiro),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0028](0028-crate-structure.md), [0043](0043-placeholder-guard.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0074](0074-accounts-and-access-on-the-server.md) item 8 (o token do
  aparelho), [0080](0080-the-trash-with-expiry-and-restore.md),
  [0092](0092-the-phone-offline.md), [0035](0035-cross-cutting-requirements.md).
- Situação no briefing: ausente.

## Contexto

O Verso já sincroniza uma pasta do computador com uma pasta num UniVerso
([0079](0079-sync-a-local-folder-with-a-server.md)). O motor dela
(`crates/verso-core/src/sync.rs`) **não tem rede nem disco**: a partir de
três retratos — os arquivos daqui, os de lá e a **base** que os dois lados
combinaram por último — ele planeja o que enviar, buscar, apagar e
renomear; o host do desktop executa o plano pelo `verso-fs` e pela sessão
do aparelho com o servidor. O servidor guarda um log de mudanças por pasta,
empurra mudanças, aceita gravações só contra a revisão-base (invariante 11)
e mantém salas (0082), compartilhamentos (0081), papéis e uma exclusão que
pode ser desfeita (0080).

Rodar um servidor é uma barreira para muita gente. A maioria já tem WebDAV
(Nextcloud e afins), um bucket compatível com S3, Dropbox, OneDrive ou
Google Drive. O primeiro texto propôs usá-los como transportes, com os
instintos certos (a pasta mais estreita de cada provedor; o navegador do
sistema para entrar; esperar diante do HTTP 429). Conferido em 2026-10-21
nas páginas públicas dos provedores (a revisão cita cada URL):

- **Google Drive**: o `drive.file` é **não sensível** ("Recommended /
  Non-sensitive"), não sensível como o primeiro texto dizia; escopos não
  sensíveis não precisam de verificação para ir a produção (a tela de
  consentimento então mostra o domínio em vez do nome e do logo do app; a
  verificação de marca é para isso). O escopo `drive` inteiro é restrito. O
  `drive.file` deixa o app ver só os arquivos **que ele criou ou que a
  pessoa abriu com ele** — um arquivo que alguém põe na pasta pela página
  web do Drive fica invisível para o Verso — e a permissão é **por cliente
  OAuth**. O `files.update` **não aceita condição** (nenhum `If-Match`); o
  `files.delete` é **definitivo**, passa por cima da lixeira; o
  `revisions.list` guarda versões anteriores de um arquivo binário. Em
  status "Testing", um app tem no máximo 100 testadores e a permissão de
  cada um expira em **7 dias**.
- **Dropbox**: um app em desenvolvimento liga até **500** contas; ao ligar
  **50**, tem duas semanas para obter o status de produção. O tipo de acesso
  App folder dá uma pasta sob `Apps/`. Um envio no modo `update` com a
  revisão conhecida falha se o arquivo mudou (sem `autorename`, isso é um
  erro, não uma cópia). O `list_folder` dá um cursor e um long-poll. As URIs
  de redirecionamento são registradas exatamente (com a porta — plausível,
  pelo fórum do provedor).
- **OneDrive**: o `Files.ReadWrite.AppFolder` alcança uma pasta
  (`approot`) e, pela página de pasta de app da Microsoft, **vale para
  contas pessoais e corporativas ou de escola** (a reescrita de 2026-10-21
  dizia só pessoais — era ela a incompleta); o escopo está em prévia; um
  arquivo que a pessoa põe naquela pasta **é** visível ao app (o contrário
  do Google). Um envio simples tem limite de 250 MB; arquivos maiores vão
  por uma sessão de envio, em pedaços mandados para endereços
  pré-autenticados em outros hosts. O `If-Match` sobre o ETag é respeitado.
  A consulta `delta` tem cursor e responde `410` quando o cursor precisa
  ser refeito. A verificação de editor pede uma conta no Partner Center sob
  um tenant corporativo ou de escola. O OneDrive proíbe alguns nomes
  (prefixo `~$`, `.lock`, `desktop.ini`, `_vti_`, espaços e pontos no fim).
- **S3**: a AWS aceita `If-Match` / `If-None-Match` em `PutObject`,
  `CompleteMultipartUpload` e `CopyObject`; o Cloudflare R2 em `PutObject`;
  alguns serviços compatíveis com S3 recusam gravação condicional (o
  Backblaze B2 responde 501 — plausível). O S3 não tem fluxo de mudanças nem
  lixeira (fora o versionamento do bucket).
- **WebDAV**: o `If-Match` existe, mas um servidor pode responder sem ETag
  ou com um ETag fraco; o `PROPFIND` com `Depth: infinity` costuma ser
  recusado.

Dois lugares do primeiro texto estavam errados para o Verso como ele é: os
adaptadores ficavam no núcleo, que pela
[0050](0050-outbound-network-access.md) e pela
[0026](0026-core-ui-contract-inviolable-rules.md) **nunca acessa a rede**;
e os tokens ficavam no diretório de configuração, onde a
[0019](0019-generative-opt-in-and-keychain.md) põe chaves no chaveiro do
sistema.

## Decisão

Proposta (2026-10-21). O item 1 é do mantenedor; todo outro item é uma
recomendação que ele ainda não respondeu, `[PROPOSTO]`, ou uma pergunta,
`[ABERTO]`, com o número dela na lista de decisões.

1. **Na V1, cinco provedores.** `[DECIDIDO 2026-10-21]` (0104.1 B, 0104.3):
   WebDAV, S3 (e compatíveis com S3), Dropbox, OneDrive, Google Drive — para
   **a sincronização de uma pasta local pelo app de desktop**.

2. **O que isto revisa.** `[PROPOSTO]` (C.12) O 0104.1 B do mantenedor
   traz para a V1 parte da linha `[DECIDED 2026-10-14]` do roadmap "depois
   da V1, um bucket e WebDAV", e é preciso dizer qual parte: a
   **sincronização do desktop com uma pasta WebDAV ou um bucket** entra na
   V1 com esta ADR; o item 4(b) da [0073](0073-self-hosted-server-first.md)
   — um **servidor** guardando suas pastas num bucket — é outro recurso e
   continua depois da V1. O roadmap ganha uma linha de revisão datada
   dizendo isso. O item 3 da
   [0020](0020-sync-merge-in-core-transports-as-plugins.md) ("transportes
   são plugins") já foi revisado pelo item 4 da 0073 em 2026-10-09; esta
   ADR acrescenta que os primeiros transportes de nuvem são embutidos, não
   plugins (plugins estão fora da V1, [0034](0034-roadmap-in-phases.md)). A
   linha da [0009](0009-external-constraints.md) sobre OAuth e cotas ganha
   uma referência para cá. A [0050](0050-outbound-network-access.md) ganha
   uma linha de Revisões: um provedor que a pessoa conectou é consultado
   sem um clique, um alcance novo, como foram a checagem de atualização
   (0055), o servidor (0073) e o servidor local (0096/0097).

3. **Onde o código mora.** `[PROPOSTO]` (C.1) O núcleo continua sem rede
   ([0050](0050-outbound-network-access.md), Consequências da 0079): o
   `verso-core` guarda só um **trait de remoto sem rede** — listar as
   mudanças depois de um cursor, ler, gravar condicionalmente, apagar,
   renomear — e o motor que planeja contra ele; os **adaptadores** (WebDAV,
   S3, Dropbox, OneDrive, Google Drive, e o transporte do UniVerso que o
   host já tem) ficam do lado do host do desktop, em `app/src-tauri` ou num
   crate do lado do host do qual nem o `verso-core` nem o `verso-fs`
   dependem (se for um crate novo, a [0028](0028-crate-structure.md) ganha
   uma linha). Os arquivos da pasta são tocados só pelo `verso-fs`
   (invariante 5).

4. **Uma sincronização, vários remotos — o que da 0079 vale.**
   `[PROPOSTO]` Uma pasta local sincroniza com **um** remoto — um UniVerso
   ou uma pasta de nuvem, nunca os dois ao mesmo tempo. Item a item:
   - **Valem como escritos**: itens 2 da 0079 (o arquivo como unidade;
     nomes em NFC — enviados em NFC), 3 (o estado fora da pasta), a pausa
     na exclusão em massa e "um placeholder nunca é uma exclusão" do 9, 10
     (renomeações), 11 (a primeira sincronização nunca apaga), 13 (nada
     silencioso).
   - **Valem, adaptados**: item 6 (quando) — o fluxo do provedor em vez dos
     avisos do servidor, com as consultas do item 8 abaixo; item 7 (um lado
     mudou) — a gravação é a do provedor (item 7 abaixo), não a do serviço;
     item 8 (os dois lados mudaram) — a cópia de conflito leva o **nome do
     aparelho**, que sem servidor é definido nos ajustes de sincronização da
     pasta (C.13), a versão da nuvem fica com o nome como a do servidor fica,
     e acréscimos juntados como a 0079 diz; item 12 (limites) — o limite de
     1 GiB vale, os pedaços são os do provedor (item 9 abaixo), a cota é o
     armazenamento do provedor.
   - **Não se aplicam** a uma pasta de nuvem, e a janela diz isso onde
     apareceriam: salas de edição simultânea (0082), compartilhamentos e
     papéis (0081, 0074), modo leitor, "quem fez" no log além do nome do
     aparelho, uma exclusão desfeita pela lixeira do servidor (0080 item
     12) — a lixeira da própria nuvem é o item 11 abaixo.

5. **Só o desktop.** `[PROPOSTO]` (C.2) Uma pasta sincronizada com uma
   nuvem é alcançada pelos apps de desktop que a sincronizam, não por um
   celular nem por um navegador: o modo offline do celular
   ([0092](0092-the-phone-offline.md)) é feito sobre um UniVerso, e
   celulares e navegadores não sincronizam (0079 item 14). A janela diz
   isso quando a pessoa escolhe uma nuvem: "no celular, use um UniVerso".

6. **O lugar mais estreito de cada provedor.** `[PROPOSTO]`
   - **WebDAV**: um endereço e uma pasta que a pessoa informa, com usuário
     e senha (ou uma senha de app); só HTTPS, exceto um endereço da rede
     local que a pessoa confirma (como a
     [0096](0096-this-app-is-a-server.md) faz para HTTP simples).
   - **S3**: endpoint, bucket, prefixo, chave de acesso e segredo; o passo
     a passo no cofre de exemplo diz à pessoa para restringir a chave àquele
     bucket e prefixo (C.15).
   - **Dropbox**: o tipo de acesso App folder (`Apps/Verso/<pasta>`).
   - **OneDrive**: `Files.ReadWrite.AppFolder` (`Apps/Verso/<pasta>`), para
     contas pessoais e, se o mantenedor quiser (C.6), corporativas ou de
     escola — cujos administradores podem bloquear o consentimento.
   - **Google Drive**: só `drive.file`; o escopo `drive` inteiro nunca é
     pedido. O limite dele é dito com clareza na janela: arquivos postos na
     pasta pela página web do Drive ou por outro app não são vistos;
     ponha-os pelo Verso (C.3). Como a permissão é por cliente OAuth, todo
     aparelho que sincroniza uma pasta usa a mesma identidade de cliente
     (item 13).
   - O nome da pasta sob `Apps/Verso/` é tornado seguro para todos os
     provedores (os caracteres do item 3 da 0070, mais os nomes proibidos
     de cada provedor).

7. **Gravações e corridas — nenhuma sobrescrita silenciosa.** `[PROPOSTO]`
   (C.3, C.11) Toda gravação é condicionada à base, e onde um provedor não
   consegue torná-la condicional, a corrida é pega depois da gravação e
   reparada sem perder nenhuma das versões:
   - **Dropbox**: `upload` no modo `update` com o `rev` da base; uma recusa
     quer dizer que o arquivo mudou lá — o caminho de conflito do motor
     (0079 item 8).
   - **OneDrive**: `If-Match` com o ETag da base, no envio simples e na
     criação e no fechamento da sessão de envio.
   - **S3 (AWS)**: `If-Match` em `PutObject` e `CompleteMultipartUpload`,
     assinado com SigV4; **R2** e outros que o respeitam em `PutObject`: o
     mesmo, multipart só onde for respeitado; um arquivo grande num serviço
     que não o respeita em multipart é enviado sob uma chave temporária e
     copiado com um `CopyObject` condicional onde houver.
   - **WebDAV**: `If-Match` com o ETag forte da base.
   - **Google Drive** (sem condição): ler a revisão atual, enviar, depois
     listar as revisões; se apareceu uma revisão entre a leitura e o envio,
     os bytes do outro aparelho são buscados daquela revisão e os dois são
     guardados — a versão da nuvem fica com o nome, a deste aparelho vai ao
     lado como cópia de conflito (0079 item 8). Nada se perde: o Drive
     guarda a revisão sobrescrita.
   - **Um serviço sem condição e sem revisões** (alguns compatíveis com S3,
     servidores WebDAV sem ETags fortes) não consegue cumprir essa
     promessa: `[ABERTO]` C.3 — recomendado, **recusar a conexão** dizendo o
     motivo, para que "sincronizado" nunca esconda uma edição perdida.
   - A guarda do recurso: um teste de propriedade com um provedor de
     mentira que faz dois aparelhos correrem em cada adaptador, afirmando
     que nenhuma versão se perde.

8. **As mudanças do remoto.** `[PROPOSTO]` (C.14) Dropbox: o cursor e o
   long-poll do `list_folder`; OneDrive: `delta`, consultado; Google Drive:
   `changes.list` com um page token, consultado; WebDAV e S3: uma listagem
   com ETags comparada com o estado (WebDAV com `Depth: 1` por pasta, não
   `infinity`). Consultas: no início, ao reconectar, a cada mudança local e
   a cada cinco minutos (a rede de segurança da 0079 item 6) — nunca um
   laço rápido. Os arquivos são acompanhados pelo id do provedor onde ele
   existe (um renomear lá é um renomear aqui). **Um cursor perdido** (o
   `410` do OneDrive, o token vencido do Drive, o reset do Dropbox) é uma
   comparação completa a partir das bases, como uma reconexão — nunca uma
   primeira sincronização que trataria tudo como novo.

9. **Envios, downloads e integridade.** `[PROPOSTO]` (C.11) Arquivos
   grandes nos pedaços do provedor (sessões de envio do Dropbox e do
   OneDrive, multipart do S3, envios retomáveis do Drive), o arquivo gravado
   aqui só quando todos os pedaços chegaram (0079 item 12). Depois de cada
   transferência, o hash do provedor é comparado onde ele dá um —
   `content_hash` do Dropbox, `sha1Hash`/`quickXorHash` do OneDrive,
   `md5Checksum` do Drive, `x-amz-checksum-sha256` do S3 onde houver — e,
   senão, tamanho mais ETag.

10. **Nomes que não cabem.** `[PROPOSTO]` (C.10) Nomes enviados em NFC
    (0079 item 2). Um nome local que um provedor proíbe (a lista do
    OneDrive, nomes reservados do Windows em algumas nuvens) não é
    sincronizado e aparece na lista com o motivo. Dois nomes remotos que
    viram um só aqui (um provedor que guarda maiúsculas onde este disco não
    guarda; o Drive permitindo dois arquivos de mesmo nome numa pasta): um
    é sincronizado, o outro fica retido e listado, nunca fundidos em
    silêncio (spec Q8).

11. **Exclusões no remoto.** `[PROPOSTO]` (C.9) Para a lixeira do provedor
    onde ela existe (Dropbox e OneDrive apagam para a deles; o Google Drive
    com `trashed: true`, nunca `files.delete`, que é definitivo); no S3 e no
    WebDAV uma exclusão é definitiva, a não ser que o bucket tenha
    versionamento — dito quando a pessoa conecta. Exclusões locais vão para
    `.trash/` como sempre (0080).

12. **Entrar.** `[PROPOSTO]` (C.8) Provedores OAuth pelo **navegador do
    sistema** com PKCE e um redirecionamento de loopback (RFC 8252), nunca
    uma visão web embutida. Por provedor: o Google aceita qualquer porta de
    loopback; a Microsoft ignora a porta, mas `127.0.0.1` precisa estar no
    manifesto e `[::1]` não é suportado; o Dropbox confere a URI registrada
    exatamente — uma porta fixa registrada, ou uma lista curta, tentadas em
    ordem. O ouvinte se liga só ao loopback, confere o `state`, responde a
    um pedido, fecha depois dele ou depois de cinco minutos, e é uma linha
    do modelo de ameaças. O cliente desktop do Google recebe um
    `client_secret` que não é secreto e é tratado como público.

13. **Identidades de cliente.** `[ABERTO]` C.1 — a 0104.4 disse "decidir
    quando o primeiro provedor OAuth for escolhido", e os três estão
    escolhidos. Recomendado: **o projeto registra seus próprios apps** (um
    app no Dropbox, status de produção passadas 50 contas; um projeto no
    Google Cloud — escopo não sensível, então nenhuma verificação é exigida
    para publicar; a verificação de marca é opcional, para o nome e o logo
    na tela de consentimento, C.7; um app no Microsoft Entra, com a
    verificação de editor pedindo uma conta no Partner Center, C.6),
    distribuídos como clientes públicos; **BYOK** como campo avançado, com a
    regra de que uma pasta usa uma identidade de cliente em todo aparelho (a
    permissão do Drive é por cliente). Durante o status "Testing" do Google:
    no máximo 100 testadores, uma nova entrada a cada 7 dias — dito na
    janela.

14. **Segredos.** `[PROPOSTO]` (C.4, C.5) Tokens de atualização, senhas de
    WebDAV e segredos de S3 ficam no **chaveiro do sistema** (0019 item 2;
    Keychain do macOS, Gerenciador de Credenciais do Windows, Secret Service
    do Linux), nunca na pasta, no arquivo de configuração ou num log; nunca
    enviados à janela (a janela manda um segredo uma vez, quando a pessoa o
    digita, e nunca o lê de volta — uma regra do contrato, 0026). No
    Windows, um segredo acima do limite de 2560 bytes do Gerenciador de
    Credenciais é dividido ou recusado com uma mensagem. Num Linux sem
    Secret Service: `[ABERTO]` C.4 — recomendado, recusar a sincronização
    com nuvem dizendo o motivo e como instalar um chaveiro. Uma regra para
    todo segredo: `[ABERTO]` C.5 — recomendado, o token de aparelho do
    UniVerso, hoje em `servers.json` (0074 item 8), também vai para o
    chaveiro. O chaveiro é uma dependência nova, justificada no seu PR.
    "Desconectar" apaga os segredos e revoga o token onde o provedor
    permite.

15. **A rede.** `[PROPOSTO]` Sincronizar com uma nuvem é escolha explícita
    da pessoa, por pasta; o app então fala com os hosts de API e de entrada
    daquele provedor **e com os endereços que o provedor devolve para uma
    transferência** (as URLs pré-autenticadas de download e de sessão de
    envio do OneDrive em outros hosts, as URLs pré-assinadas do S3) — então
    a lista no modelo de ameaças é por provedor, com esses padrões, não uma
    lista fixa de hosts. Essas URLs devolvidas são segredos ao portador:
    nunca vão para um log. Nada é pedido a um provedor antes de a pessoa
    conectá-lo (0050). HTTP 429 e 503 — e o 403 do Drive com motivo de
    limite — são respeitados com o `Retry-After` ou, sem ele, espera
    exponencial com variação aleatória; pouca concorrência por provedor.
    Uma cota de armazenamento cheia é um erro de sincronização dito na
    janela.

16. **O que a pessoa vê.** `[PROPOSTO]` Os ajustes da pasta oferecem
    "Sincronizar com…": um UniVerso (0079) ou uma nuvem; escolher uma nuvem
    nomeia o provedor, faz a entrada, mostra o espaço, o que a primeira
    sincronização fará (0079 item 11), o que não se aplica a uma pasta de
    nuvem (item 4) e que o celular não a alcança (item 5), e pode ser
    cancelado. A barra de status e o log de sincronização são os da 0079.
    Uma pasta local que já está dentro da pasta do cliente de desktop de uma
    nuvem (Dropbox, OneDrive, iCloud) recebe um **aviso** de que duas
    sincronizações dos mesmos arquivos são um risco — não uma recusa (como
    detectar isso ainda está `[ABERTO]` na [0043](0043-placeholder-guard.md)).

17. **Ordem de construção.** `[ABERTO]` C.16 (antes C.2). Recomendado:
    WebDAV e S3 primeiro (sem registro de app; exercitam o trait de remoto e
    a guarda das corridas), depois Dropbox, OneDrive, Google Drive.

18. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)).
    `[PROPOSTO]` Cada passo do "Sincronizar com…" pelo teclado e pelo leitor
    de tela; o passo no navegador anunciado; pt-BR e EN.

## Consequências

- O `verso-core` ganha um trait de remoto sem rede que a sincronização com
  servidor da 0079 também implementa — uma refatoração do código da 0079,
  com os testes dela verdes — e o host ganha um adaptador por provedor, cada
  um testado contra uma imitação da API do provedor (nenhum teste alcança um
  provedor de verdade), com o teste de propriedade das corridas como a
  guarda do recurso (0029: entra com o recurso). Uma checagem manual por
  provedor em `docs/reference/manual-checks.md`.
- Comandos novos no contrato (conectar, desconectar, o estado de
  sincronização de uma pasta de nuvem), com tipos TS gerados; ausentes da
  janela do servidor.
- Dependências novas, cada uma justificada no seu PR: o chaveiro; um
  assinador de pedidos S3 (ou o nosso SigV4).
- Para o mantenedor, com C.1 = apps do próprio projeto: um app no Dropbox (e
  o status de produção passadas 50 contas), um projeto no Google Cloud com
  política de privacidade e termos em `versomd.com`, um app no Microsoft
  Entra (e uma conta no Partner Center para a verificação de editor). A
  política de privacidade diz que o mantenedor não recebe nada das notas;
  elas vão só para o provedor que a pessoa escolheu (a checagem de
  atualização da 0055 é um pedido separado, já dito).
- O `docs/reference/threat-model.md` ganha os hosts dos provedores e as
  URLs devolvidas, o ouvinte de loopback e os segredos do chaveiro.
- O roadmap ganha uma linha para esta ADR na V1 e a linha de revisão do
  item 2.

## Alternativas descartadas

- **Os transportes como plugins** (0020 item 3, já revisado pelo item 4 da
  0073; os "adaptadores desacoplados" do primeiro texto): não antes da V1
  (item 2).
- **BYOK como único caminho**: considerado no primeiro texto e mostrado ao
  mantenedor no questionário (0104.4); mantido só como opção avançada (item
  13, aberto).
- **O escopo `drive` inteiro do Google**: considerado no primeiro texto;
  restrito, avaliação anual, e vê todo o Drive da pessoa.
- **Os adaptadores no núcleo**: o primeiro texto e a reescrita de
  2026-10-21; contra a 0050 (item 3).
- **Arquivos compactados da pasta inteira a cada mudança**: considerado no
  primeiro texto; banda e latência; um backup é outro assunto.

## Situação

Proposta (2026-10-21). Item 1 decidido pelo mantenedor; reescrita pelo Opus
5.5 a pedido dele, revisada pelo Fable 5.1 no mesmo dia (0104.2) e revisada
depois da revisão; é aceita quando o mantenedor responder de C.1 a C.16.
