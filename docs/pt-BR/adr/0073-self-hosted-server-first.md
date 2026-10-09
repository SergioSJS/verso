# ADR 0073 — Servidor auto-hospedado primeiro: colaboração online antes do sync

- Data: 2026-10-09
- Fonte: o mantenedor, em sessão em 2026-10-08 e 2026-10-09, pensando em
  como as notas chegam a todo dispositivo. As palavras que decidem: *"a
  melhor opção seria algo auto-hospedado, essa que é a ideia"*; *"sincronizar
  com mobile é minha intenção … tenho um celular Android e um iPad, é
  imprescindível"*; sobre o modelo do Notion e do Foundry VTT, *"se for
  viável fazer esse tipo de coisa, imagino que a gente foque nessa
  implementação"*; *"Eu só focaria primeiro na opção self-hosted. E,
  obviamente, fazer todas as tratativas de segurança"*; *"a gente vai
  precisar ter uma revisão muito forte da aplicação sendo responsiva …
  tablet, celular, assim como o Notion faz … vale essa investigação mais
  aprofundada"*; *"na fase 3 … A gente tem que fazer a versão Linux. Aí depois
  a gente parte para isso"*; sobre armazenamento nosso, *"Penso nisso num
  quesito de uma aplicação que é mantida pela comunidade. E que não gere
  custo, não seria nem focado no lucro em si do produto"*. Escrito pela
  Fable 5.1 a pedido do mantenedor
  ("imagino que você possa já construir esse ADR"), uma troca dos papéis do
  [0032](0032-author-and-reviewer-roles.md); lido pela Opus 5.5 em
  2026-10-09 (dois BLOQUEANTES, doze IMPORTANTES, quinze MENORES, todos
  aplicados nesta revisão) e a ler de novo antes de ser aceito.
- Relacionados: [0020](0020-sync-merge-in-core-transports-as-plugins.md)
  (sync: este ADR propõe revisar a ordem e dois itens dele),
  [0021](0021-sync-automerge-layered-config.md) (Automerge: propõe-se
  revisar), [0025](0025-own-server-and-mobile-pwa.md) (`verso serve`, PWA:
  proposto de novo aqui, o item 3 dele proposto como superado),
  [0026](0026-core-ui-contract-inviolable-rules.md) (regra 2: a UI não sabe
  de que lado do fio o core está), [0027](0027-runtime-capabilities.md)
  (`offline`, `bg:sync`: como uma janela sabe de latência e
  disponibilidade), [0028](0028-crate-structure.md) (onde um servidor
  moraria), [0035](0035-cross-cutting-requirements.md) (as duas línguas,
  acessibilidade), [0044](0044-verso-fs-semantics.md) (os handles opacos,
  reabertos antes de o `verso serve` alcançar arquivos; como o watcher trata
  uma mudança de fora), [0045](0045-server-and-mcp-security.md) (identidade
  de sessão e autorização no contrato, aberto "até um servidor entrar no
  escopo"; as checagens de porta local; injeção de prompt),
  [0050](0050-outbound-network-access.md) (só endereços nas notas do usuário
  ou clicados por ele; o core nunca alcança a rede: propõe-se revisar),
  [0012](0012-files-are-source-of-truth.md),
  [0018](0018-llm-native-mcp-in-core.md) (escrita por agente com diff),
  [0022](0022-target-platforms-macos-first.md) (Linux antes disto),
  [0043](0043-placeholder-guard.md) (pastas na nuvem),
  [0057](0057-board-json-canvas.md) (o arquivo do board),
  [0066](0066-mcp-sees-boards-relations-properties-bases.md),
  [0069](0069-windows-port.md) (o porte Windows, lançado na 0.5.0-beta.1),
  [0070](0070-what-travels-with-the-folder.md) (que configurações viajam com
  a pasta; nomes que todo sistema guarda), [0071](0071-linux-port.md) (o porte
  Linux, que este ADR põe primeiro na Fase 3).
- Status no briefing: o §8 (sync) tem dois pontos `DECIDIDO` — sync nativo
  "com Google Drive e OneDrive", e "transportes como plugins" — que os itens
  4 e 10 abaixo propõem revisar, e um ponto Automerge `PROPOSTO` que o item
  7 mudaria; o §9 marca o servidor e a PWA `PROPOSTO`, e a linha dele
  "Indexação para mobile" `PROPOSTO` iria junto com o item 3 do
  [0025](0025-own-server-and-mobile-pwa.md). Na aceitação o briefing ganha
  uma versão nova (o original em pt-BR prevalece,
  [0008](0008-documentation-language.md)), e o
  [0020](0020-sync-merge-in-core-transports-as-plugins.md), o
  [0021](0021-sync-automerge-layered-config.md), o
  [0025](0025-own-server-and-mobile-pwa.md), o [0034](0034-roadmap-in-phases.md)
  (o roadmap ganha uma Fase 3), o [0044](0044-verso-fs-semantics.md) (os
  handles e os symlinks num servidor), o [0045](0045-server-and-mcp-security.md)
  (o grupo do contrato), o [0050](0050-outbound-network-access.md) e o
  [0070](0070-what-travels-with-the-folder.md) (a camada da pessoa) ganham
  cada um uma linha de Revisões datada com o texto antigo mantido, como o
  0022 e o 0044 têm, e o `docs/reference/app-decision.md` §7 com eles. Até lá
  cada um deles fica como está, e o briefing também.

## Contexto

A pergunta era como as notas de uma pessoa chegam a um Mac, a uma máquina
Windows, a um celular Android e a um iPad, e como várias pessoas poderiam
compartilhar uma pasta de notas. Três caminhos foram pesados:

1. **Sync entre dispositivos** por uma pasta na nuvem (iCloud, OneDrive,
   Google Drive, Dropbox), pelas APIs desses serviços, ou por uma ferramenta
   como o rclone. O caminho da pasta funciona hoje e não pede nada do Verso
   além de tratar cópias de conflito e placeholders
   ([0043](0043-placeholder-guard.md)); o caminho da API custa uma integração
   por provedor (registro OAuth, revisão de escopos, tokens, as manias de
   cada um), não alcança celular sozinho, e o iCloud Drive não tem API
   pública de arquivos fora das plataformas da Apple; o rclone como sidecar
   embutido é um ganho rápido no desktop (cinquenta provedores, `bisync`) e
   nada no iOS, com um binário de 50–70 MB para distribuir, assinar e manter
   vivo.
2. **Um servidor nosso**, o core sem janela (`verso serve`,
   [0025](0025-own-server-and-mobile-pwa.md)), alcançado pelos apps e por um
   navegador. A janela já é tecnologia web falando com o core só pelo
   contrato, e a regra 2 do [0026](0026-core-ui-contract-inviolable-rules.md)
   foi escrita para o core poder estar do outro lado de um fio. Hoje o host
   desktop (`app/src-tauri`) guarda uma sessão por pasta aberta e serve o
   contrato como comandos do Tauri; o `verso-dialect` já compila para
   WebAssembly (um guardrail desde a Fase 1).
3. **Online primeiro, como Notion e Foundry VTT**: um servidor guarda a
   pasta, todo cliente edita essa única cópia, várias pessoas ao mesmo tempo;
   offline vem depois, como veio para o Notion. Conflitos entre dispositivos
   somem nesse modelo, porque há uma cópia só; o que resta é a coedição ao
   vivo de uma nota, problema resolvido para texto (Yjs ligado ao CodeMirror
   6) e aberto para o board (ver item 7).

O mantenedor escolheu um servidor auto-hospedado primeiro, com segurança
feita por inteiro, e pediu que o modelo do Notion e do Foundry de
compartilhamento e edição simultânea seja o foco se for viável; o celular e
o tablet têm de ser alcançados ("é imprescindível"). Este ADR propõe o
caminho 3 construído sobre o 2, com o sync do caminho 1 depois, cliente para
servidor e não entre pares. Propõe também o navegador primeiro no celular e
no tablet, com os limites do navegador no iPadOS (armazenamento que o
sistema pode apagar a não ser que a página peça persistência, nada em
segundo plano, service worker só por HTTPS) aceitos para uma primeira
versão, e um app nativo do mesmo código como saída se morderem; se isso
atende ao sync com celular que o mantenedor chamou de imprescindível é ele
quem diz (Status).

Dois fatos de custo foram conferidos em 2026-10-09, para a questão do
armazenamento abaixo: armazenamento de objetos custa centavos por
gigabyte-mês em todo lugar (Cloudflare R2 US$ 0,015, Backblaze B2 ≈ US$
0,007, S3 US$ 0,023, Google Cloud Storage US$ 0,020, Hetzner € 6,49 por mês
com 1 TB de armazenamento e 1 TB de saída dentro, Wasabi US$ 7,99 por TB);
**o que difere em uma ordem de grandeza é o dado que sai**: grátis no R2,
grátis no Wasabi enquanto a saída do mês fica abaixo do armazenado, grátis
no B2 até três vezes o armazenado, US$ 0,09 por GB no S3, US$ 0,12 por GB
no Google Cloud. Um produto cujos usuários abrem PDFs e
imagens grandes paga pela saída, não pelo armazenamento.

## Decisão

Proposta, exceto onde o Status diz que o mantenedor decidiu.

1. **Servidor auto-hospedado primeiro, online primeiro.** A Fase 3 (a
   escrever no roadmap) começa com o app de Linux ([0071](0071-linux-port.md))
   e então constrói o servidor; o sync entre dispositivos vem depois do
   servidor e por ele. O [0020](0020-sync-merge-in-core-transports-as-plugins.md)
   tem a ordem com revisão proposta: o servidor não é um transporte entre
   outros, é a primeira coisa construída.
2. **Um serviço, uma base de código.** `verso serve` é o core sem janela
   ([0025](0025-own-server-and-mobile-pwa.md), proposto de novo): serve o
   contrato por HTTP e WebSocket, e com `--web` a própria janela. O app
   desktop ganha duas coisas do mesmo código: "conectar a um servidor" (a
   janela como cliente de um core remoto, informando latência e
   disponibilidade pelas capacidades de runtime do
   [0027](0027-runtime-capabilities.md)) e "este app é um servidor" (um
   toggle nos Ajustes que sobe o mesmo serviço na rede local, anunciado por
   mDNS aos apps nativos, pareado por um QR code que leva o endereço — como
   o navegador do celular passa a confiar no certificado é o `[ABERTO]` do
   item 6). Um servidor dedicado é o mesmo
   serviço numa máquina que fica ligada; passar de um para o outro é mudar o
   endereço, nunca o protocolo. Servir o contrato sem o Tauri tira a tabela
   de sessões e o despacho de comandos do `app/src-tauri`, para o
   `verso-core` ou uma crate própria ([0028](0028-crate-structure.md),
   `[ABERTO]`); o contrato ganha uma versão que cliente e servidor acertam
   antes de tudo (`[ABERTO]`: como, e o que um cliente em outra versão
   ouve).
3. **Os arquivos continuam fonte de verdade, no disco do servidor**
   ([0012](0012-files-are-source-of-truth.md)): uma pasta de `.md`, `.canvas`
   e anexos que o Obsidian poderia abrir. O `verso-fs` roda no servidor como
   roda no Mac, e todo invariante do `CLAUDE.md` §2 vale lá — o décimo
   inclusive, já que a pasta do servidor pode ela mesma estar num diretório
   sincronizado na nuvem — com duas questões que o servidor reabre, ditas
   onde surgem: a capacidade de leitura do item 4 (regra 4) e os symlinks do
   item 6 ([0044](0044-verso-fs-semantics.md)). Nada da pasta fica em banco
   de dados; o índice segue sendo cache.
4. **Armazenamento, em três modos, um de cada vez.** (a) O próprio disco do
   servidor, primeiro e único na primeira versão. (b) Um bucket do usuário
   (S3, Google Cloud Storage, R2, B2, qualquer endpoint compatível com S3,
   WebDAV), como **espelho do disco** por trás do `verso-fs` — proposto: um
   backend Apache OpenDAL (Apache-2.0) dentro da crate `verso-fs`, para o
   invariante 5 valer e o transporte ser do core e não plugin (propõe-se
   revisar o item 3 do [0020](0020-sync-merge-in-core-transports-as-plugins.md):
   transportes moram no core até plugins existirem e enquanto guardarem
   credenciais). O disco é a verdade: toda escrita cai no disco
   pela escrita atômica primeiro e é espelhada ao bucket depois; quando os
   dois discordam, o disco vence e o bucket é reescrito; o espelho é um sync
   dentro do servidor, dito como tal. Para que serve o modo: uma cópia
   durável fora de casa da pasta, e o tráfego dos anexos tirado da linha do
   próprio servidor. Uploads passam pelo `verso-fs` do servidor; um anexo
   grande é **lido** do bucket por uma URL pré-assinada de vida curta — só
   depois de o espelho alcançar o disco, com `Content-Disposition: inline`
   para imagens e PDF e `attachment` para todo o resto — para esse tráfego
   ser conta do bucket, não do servidor. A URL pré-assinada é uma capacidade
   cruzando para o cliente: se conta como o handle opaco da regra 4 (uma
   chave de objeto que não revela o caminho, uma vida de minutos) ou precisa
   de emenda ao [0026](0026-core-ui-contract-inviolable-rules.md) faz parte
   da questão dos handles resolvida com o item 2 (`[ABERTO]`). Recomendado
   aos usuários: R2 ou B2, pela saída; S3 e Google Cloud aceitos com o preço
   de saída mostrado. (c)
   Um bucket nosso, ao custo, com o custo mostrado: **fora do escopo** até
   existir pessoa jurídica, gateway de pagamento e nota fiscal; registrado
   como direção do mantenedor nas palavras dele acima (um projeto
   comunitário que cobre os custos), não como plano.
5. **Identidade e autorização entram no contrato.** Contas no servidor
   (nome de usuário, senha com hash Argon2id, passkeys quando o navegador
   oferece; OIDC depois), sessões por token com expiração e revogação, e por
   pasta os papéis dono, editor, leitor, dados por link de convite que
   expira ou pelo dono; recuperação de conta sem servidor de e-mail é
   `[ABERTO]`. O item que o [0045](0045-server-and-mcp-security.md) deixou
   aberto — identidade de sessão e autorização por operação no contrato —
   propõe-se construí-lo aqui, e ele segue `[ABERTO]` lá até este ADR ser
   aceito:
   todo comando carrega a sessão, e o core confere o papel antes de o
   `verso-fs` agir. A conta é o lugar natural da camada "da pessoa" do
   [0070](0070-what-travels-with-the-folder.md). O app desktop com pasta
   local fica como está: um dono implícito, sem login.
6. **Segurança, por inteiro, antes do primeiro usuário que não seja o
   mantenedor.** TLS em todo lugar, rede local inclusive — uma página
   servida por HTTP puro não é contexto seguro: sem service worker, sem
   passkeys, sem `crypto.subtle`, e senhas em claro no Wi-Fi de casa; como o
   navegador de um celular passa a confiar no certificado (o domínio do
   usuário com ACME, um certificado do Tailscale, uma CA local instalada) é
   `[ABERTO]`. O servidor se recusa a servir um login sem TLS, exceto em
   loopback ou atrás de um proxy reverso cujo endereço quem hospeda
   configurou — só então os cabeçalhos encaminhados são confiados. Então:
   limite de tentativas no login, proteção contra CSRF, a
   checagem de `Origin` no WebSocket e a validação de `Host` contra DNS
   rebinding que o [0045](0045-server-and-mcp-security.md) nomeia para portas
   locais, os cabeçalhos de resposta de praxe, anexos servidos com
   `Content-Security-Policy: sandbox` e `nosniff` como o `verso://` faz hoje
   (um arquivo HTML ou SVG que outro membro compartilha é, sem isso, um XSS
   armazenado na origem do servidor), a política de segurança de conteúdo da
   própria janela enviada como cabeçalho e estreitada para o servidor (hoje
   o Tauri a injeta do `tauri.conf.json`, com `connect-src` e `frame-src`
   abertos a qualquer `https:`), o sanitizador do HTML de nota tratado como
   fronteira entre membros, os comandos só do host (`web_*`, `open_url`,
   `open_window`, `reveal`) ausentes do serviço e declarados ausentes pelas
   capacidades ([0027](0027-runtime-capabilities.md)), conteúdo remoto e as
   origens de embed aprovadas como escolha de cada leitor e nunca do autor da
   nota (`[ABERTO]`, junto com a questão própria do
   [0070](0070-what-travels-with-the-folder.md)), limites de tamanho de
   upload e cotas por pasta, o confinamento de caminhos que já existe — e os
   symlinks, que num servidor com membros além do dono são um buraco:
   seguidos para fora da pasta como o [0044](0044-verso-fs-semantics.md)
   decidiu para a pasta de uma pessoa, ou recusados quando saem dela
   (`[ABERTO]`, propõe-se revisar o grupo de symlinks do 0044 para o
   servidor) — auditoria de dependências (o `cargo-deny` já nega
   advisories), logs sem segredos, e um modelo de ameaças escrito em
   `docs/reference/` antes de o servidor ser anunciado, que retoma o risco
   de injeção de prompt do [0045](0045-server-and-mcp-security.md) agora que
   a nota de outro membro chega ao meu agente. **Sem criptografia ponta a ponta**: colaboração ao
   vivo e busca no servidor precisam que o servidor leia os arquivos, como o
   do Notion; quem hospeda vê as notas, e a documentação diz isso com essas
   palavras. Criptografia em repouso é o disco de quem hospeda.
7. **Edição simultânea.** Notas por Yjs ligado ao CodeMirror 6
   (`y-codemirror.next`, MIT; do lado do core uma implementação em Rust do
   mesmo CRDT, como o `yrs`, dependência a justificar no pull request dela).
   O estado compartilhado vive na memória da sessão e é escrito no arquivo
   pela escrita atômica quando assenta: a escrita só acontece depois de uma
   edição, escreve os bytes lidos mais as edições — sem normalização de
   espaçamento, o único separador de linha do arquivo mantido como a janela
   o mantém hoje, e um arquivo que mistura separadores somente leitura numa
   sessão (invariante 7) — e confere o carimbo antes
   (invariante 11); uma mudança feita fora da sessão (Obsidian, rclone, uma
   restauração) entra na sessão como uma edição quando nenhuma edição está
   pendente, como o watcher faz com uma nota aberta
   ([0044](0044-verso-fs-semantics.md)), e senão a escrita para e as
   pessoas na nota veem o diff. Presença (quem está na nota) vem junto. O
   board não tem ligação pronta — a colaboração do próprio Excalidraw
   reconcilia elementos por versão sobre um relay, não Yjs; a reconciliação
   é exportada pelo pacote, o relay mora no app dele — e um `.canvas` guarda
   relações tipadas
   ([0057](0057-board-json-canvas.md)): a coedição do board é `[ABERTO]`.
   Propõe-se revisar o [0021](0021-sync-automerge-layered-config.md) em dois
   pontos: Yjs no lugar do Automerge, e um CRDT como mecanismo de uma sessão
   ao vivo, nunca a forma guardada de uma nota; o arquivo é.
8. **Celular e tablet: o navegador primeiro.** A janela servida pelo
   servidor é o cliente móvel (PWA, instalável em Android e iPadOS, como o
   [0025](0025-own-server-and-mobile-pwa.md) propôs; no iPadOS pede
   armazenamento persistente, que o WebKit tende mais a conceder a um web
   app instalado — heurística, não promessa).
   Offline no celular é um passo posterior (cache local, fila de escritas,
   reconciliação na volta). Um app nativo, quando os limites do navegador
   morderem, é Tauri 2 mobile da mesma UI e do mesmo core — nunca uma base
   de código à parte; um app nativo não começa antes de o servidor existir.
   O item 3 do [0025](0025-own-server-and-mobile-pwa.md) (um servidor
   companheiro entrega um índice pronto ao celular) é proposto como
   superado: o servidor indexa, o celular pergunta a ele.
9. **A janela em todo tamanho de tela é uma investigação própria, antes de
   a UI do servidor ser construída.** Celular, tablet, meia tela, um painel
   estreito: o que o Notion faz é a referência, observada por fora; o que o
   Verso faz hoje (uma gaveta abaixo de 760 px, arrastos por ponteiro) é o
   ponto de partida. A investigação nomeia breakpoints, o que cada superfície
   perde (a faixa de ícones, as duas barras laterais, a barra do board),
   alvos de toque e gestos, os leitores de tela do celular e do tablet
   (VoiceOver e TalkBack com toque, [0035](0035-cross-cutting-requirements.md)
   item 2) e as duas línguas ([0035](0035-cross-cutting-requirements.md)
   item 1), e termina num ADR próprio com a suíte e2e rodando nessas
   larguras. Não é efeito colateral do item 8.
10. **Sync entre dispositivos, depois do servidor, por ele.** O app desktop
    com pasta local ganha "sincronizar com um servidor": por arquivo, por
    hash e carimbo, conflitos guardados como cópia ao lado do arquivo — com
    nome que o item 3 do [0070](0070-what-travels-with-the-folder.md) permite
    em todo SO — com o diff mostrado (invariante 11), nada silencioso; merge
    por bloco vem depois de conflitos terem sido vistos em uso, nunca antes.
    Propõe-se revisar o item 1 do
    [0020](0020-sync-merge-in-core-transports-as-plugins.md): as integrações
    com Drive e OneDrive por
    API não são essenciais; o caminho da pasta é suportado e documentado
    (cópias de conflito detectadas, placeholders tratados), WebDAV é o
    primeiro transporte externo, Drive e OneDrive por API vêm se pedirem,
    iCloud nunca por API. O rclone não é embutido; uma pasta que o rclone
    sincroniza é um caso suportado como qualquer pasta sincronizada.
11. **Agentes na pasta compartilhada.** O servidor expõe MCP como o app expõe
    ([0066](0066-mcp-sees-boards-relations-properties-bases.md)), sob a mesma
    identidade e os mesmos papéis; o transporte dele pela rede (Streamable
    HTTP) e a autorização (o fluxo OAuth da especificação do MCP) são
    `[ABERTO]`, como o [0045](0045-server-and-mcp-security.md) previu; um
    agente escreve só pelo diff do [0018](0018-llm-native-mcp-in-core.md),
    quando ele chegar.
12. **Ordem dentro da Fase 3** (recomendação registrada): o app de Linux → o
    servidor com contas, papéis e o contrato pelo fio, o app desktop
    conectando a ele online (sem sync ainda), a reindexação por lote do
    watcher estreitada aos caminhos do lote e medida com o benchmark (hoje
    cada lote indexa a pasta inteira, [0044](0044-verso-fs-semantics.md)) →
    `--web` e a janela responsiva
    (item 9 primeiro) → edição simultânea de notas → sync para as pastas
    locais do desktop → a PWA offline → o bucket do usuário → mobile nativo
    se preciso.

## Consequências

- O protocolo pelo fio é o contrato: os tipos TypeScript continuam gerados do
  Rust (invariante 3), com a sessão e a versão do contrato acrescentadas; o
  harness ganha as respostas do servidor.
- O Verso ganha tráfego de rede que o [0050](0050-outbound-network-access.md)
  não permite hoje: de entrada (o serviço), e de saída para um bucket que o
  usuário configurou, para o servidor a que uma janela se conecta, e mDNS na
  rede local — só para endereços que o usuário escreveu numa configuração.
  Propõe-se revisar nesse sentido o item 1 da Decisão do 0050 e a primeira
  Consequência dele ("nada no core alcança a rede"), e o `app-decision.md`
  §7 com eles.
- A tabela de sessões e o despacho de comandos saem do host desktop para o
  core ou uma crate própria ([0028](0028-crate-structure.md)); pastas ganham
  papéis e usuários ganham sessões. O `verso-dialect` não muda por isso; o
  que muda no `verso-fs` é o espelho do item 4.
- Uma imagem Docker do serviço entra no workflow de versão, gerada como os
  apps; as plataformas dela (amd64, arm64 — servidores de casa muitas vezes
  são ARM) são `[ABERTO]`, ligadas à questão de ARM64 do
  [0071](0071-linux-port.md). O core e a linha de comando já compilam e
  testam em Linux no CI; o app desktop do [0071](0071-linux-port.md) é outro
  assunto, e "este app é um servidor" roda em macOS e Windows também.
- Uma oferta hospedada não é prometida. A documentação diz "auto-hospedado" e
  o que hospedar significa: quem hospeda vê as notas, guarda o disco, faz os
  backups (uma receita documentada: snapshot do volume e `rclone` para um
  bucket), e atualiza o serviço (`[ABERTO]`: o caminho de atualização da
  imagem Docker, e "este app é um servidor" atualizando pelo
  [0055](0055-in-app-updater.md) com celulares conectados).
- Expor um servidor de casa à internet é escolha do usuário; o padrão que a
  documentação recomenda é uma VPN (Tailscale ou similar) ou um proxy reverso
  do usuário, nunca uma porta que o servidor abra sozinho.
- A semântica dos handles opacos do contrato foi aceita "como construída
  para a Fase 2" e reaberta para o dia em que o `verso serve` alcançar
  arquivos ([0044](0044-verso-fs-semantics.md),
  `docs/reference/handles-decision.md`): esse dia é o item 2, e a questão
  dos handles se resolve no mesmo pull request. O que viaja com a pasta
  ([0070](0070-what-travels-with-the-folder.md)) é o que o servidor guarda e
  os clientes leem; nada das configurações de uma pessoa cruza para outra.
- O servidor acrescenta uma nota de referência própria, o modelo de ameaças.
- O roadmap ganha a Fase 3 com esta ordem; a lista "Depois da Fase 2" mantém
  sync e mobile, agora sob este ADR.

## Alternativas descartadas

Quem levantou cada uma está dito, como o [0044](0044-verso-fs-semantics.md)
e o [0071](0071-linux-port.md) fazem.

- **Sync entre pares primeiro** ([0020](0020-sync-merge-in-core-transports-as-plugins.md)
  como escrito, o plano anterior do mantenedor): cada par de dispositivos
  uma superfície de conflito, nenhum celular sem servidor de qualquer jeito,
  a parte mais difícil (merge) primeiro.
- **Criptografia ponta a ponta na primeira versão** (levantada pelo autor):
  proíbe colaboração e busca no servidor, as duas coisas para as quais o
  modelo existe; se vem depois como opção para um servidor de uma pessoa só
  é `[ABERTO]` (Status).
- **rclone embutido como sidecar** (levantado pelo mantenedor): só desktop,
  em lote e não ao vivo, um binário estrangeiro grande para distribuir e
  assinar, IDs OAuth compartilhados com limite de taxa.
- **APIs dos provedores (Drive, OneDrive) antes do servidor** (levantadas
  pelo mantenedor): custo por provedor, nenhum celular, iCloud inalcançável
  fora das plataformas da Apple.
- **Um app móvel nativo antes do servidor** (levantado pelo mantenedor para
  o iPad): um visualizador sem nada para ver.
- **Armazenamento nosso, pago, agora** (levantado pelo mantenedor, adiado
  por ambos): pessoa jurídica, gateway e nota fiscal antes de um único
  usuário pedir.
- **As notas num banco de dados no servidor** (levantada pelo autor, para
  descartar): quebra o [0012](0012-files-are-source-of-truth.md) e a
  compatibilidade com o Obsidian da pasta do servidor.

## Status

Proposto. Decidido pelo mantenedor em 2026-10-08 e 2026-10-09, em palavras:
a opção auto-hospedada primeiro; alcançar o celular e o tablet é
imprescindível (um celular Android e um iPad); o modelo do Notion e do
Foundry de compartilhamento e edição simultânea é o foco se for viável;
"todas as tratativas de segurança"; uma investigação aprofundada da janela
em tamanhos variados de tela, tablet e celular incluídos, como trabalho
próprio; isto vem na Fase 3, depois do app de Linux. Todo o resto acima — a
forma de um serviço, os modos de armazenamento, o modelo de identidade, a
edição ao vivo, o navegador primeiro no celular, a ordem dentro da Fase 3,
as revisões propostas do [0020](0020-sync-merge-in-core-transports-as-plugins.md),
do [0021](0021-sync-automerge-layered-config.md) e do
[0050](0050-outbound-network-access.md) — é proposto, para o mantenedor
aceitar depois de uma leitura da Opus 5.5 ([0032](0032-author-and-reviewer-roles.md)).
`[ABERTO]`: se o celular no navegador, só online, atende ao sync com celular
que o mantenedor chamou de imprescindível, ou se o offline no celular vem
mais cedo no item 12; um dono por servidor ou vários (uma família, um time)
— molda o modelo de contas; permissões mais finas que a pasta (por nota ou
por bloco, Q9 da spec), e histórico, atribuição e recuperação de uma
mudança ou exclusão de outro membro; se um servidor de uma pessoa só pode
optar por criptografia ponta a ponta depois; como o navegador de um celular
confia no certificado do servidor local; onde moram a tabela de sessões e o
despacho do serviço ([0028](0028-crate-structure.md)); como cliente e
servidor acertam a versão do contrato, e como o servidor é atualizado; a
coedição do board; recuperação de conta sem servidor de e-mail; o transporte
e a autorização do MCP pela rede; as plataformas da imagem Docker; se a URL
pré-assinada do item 4 é o handle opaco da regra 4 ou precisa de emenda ao
[0026](0026-core-ui-contract-inviolable-rules.md); symlinks num servidor com
membros além do dono; conteúdo remoto e origens de embed aprovadas como
escolha de cada leitor; os critérios que mandariam o iPad do navegador para
um app nativo; como um custo seria repassado se um dia existir armazenamento
nosso.
