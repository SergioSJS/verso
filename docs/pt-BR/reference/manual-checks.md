# Checagens manuais no app

- Início: 2026-10-07
- Fonte: o mantenedor, em sessão: "mantenha um documento com toda
  implementação que precisa de um check meu testado local. isso nao deve
  travar nada".

O que os testes automáticos não alcançam por inteiro — o host real, o
macOS, o app instalado — fica listado aqui, uma linha por mudança, para o
mantenedor experimentar no app instalado quando puder. **Nada aqui segura
um commit, um merge ou um beta; as checagens são condição só da
publicação da V1** (o mantenedor, 2026-10-14, `docs/roadmap.md`, Fase 4 —
V1, linha V.15). Cada item diz o que fazer, o que ver
e o commit; um item marcado diz quando. Uma checagem que acha problema
vira conserto, e o item aponta para ele.

O roteiro do cofre de exemplo (`demo-vault-walkthrough.md`) é o passeio
completo pelo app; esta lista é só o que mudou e ainda não foi visto no
app real.

## Ainda não conferido

### Notificações na janela (ADR 0084, feat/notify-ui, 2026-10-14)

- [ ] **O servidor parado e iniciado de novo**: uma pasta deste
  computador que sincroniza com um UniVerso, e então pare o servidor. Em
  segundos, um aviso embaixo à direita, *Sincronização sem conexão*, que
  fica; o sino na barra de status diz *1 notificação não lida*. Inicie o
  servidor: o aviso vira *A sincronização voltou* e some em 6 s; a lista
  do sino tem uma linha, a mais nova. O mesmo com uma pasta do servidor
  aberta na janela: *Conexão com o servidor perdida*, depois *Servidor
  de volta* — uma vez cada, quantas tentativas o host fizer.
- [ ] **Um compartilhamento revogado, numa janela na pasta do servidor**:
  abra, no app do computador, uma pasta que outra conta compartilha com
  você; essa conta revoga. A linha de status e um aviso dizem *Quem
  compartilhou esta pasta, em …, revogou o seu acesso*, nunca *A conexão
  com o servidor caiu; tentando de novo…*.
- [ ] **Um compartilhamento dado por outra conta**: conectado a um
  UniVerso em *Ajustes › Servidores* (ou no navegador), outra conta
  compartilha uma pasta com você: um aviso *Uma pasta foi compartilhada
  com você* — quem, qual, o papel — com *Ver as pastas*, que abre
  *Ajustes › Servidores* (no navegador, o seletor de pastas). Uma vez por
  compartilhamento.
- [ ] **Uma atualização encontrada**: uma versão instalada mais velha que
  a última: um aviso *Nova versão disponível* alguns segundos depois de
  abrir, com *Baixar e atualizar* e *Ver nos Ajustes*; feche e abra de
  novo: nenhum segundo aviso para a mesma versão (a lista do sino ainda a
  tem). Deixado aberto por um dia, uma versão publicada no meio-tempo é
  dita.
- [ ] **A cota numa pasta sincronizada**: uma pasta deste computador
  sincronizada passando de 90 % da cota no servidor, depois de salvar:
  *Pasta quase cheia*, uma vez; apague arquivos até ficar abaixo de
  90 %, reabra a pasta (ou espere um dia), passe de novo: dito de novo.
- [ ] **As notificações do sistema, pedidas e recusadas, em cada sistema**
  (macOS, Windows, Linux, e um navegador por HTTPS): *Ajustes ›
  Notificações › Também nas notificações do sistema* desligado de
  início. No computador o plugin 2.4 do Tauri não pergunta nada e
  responde "permitido"; os ajustes do próprio sistema decidem em
  silêncio, e a linha diz onde ficam (macOS: *Ajustes do Sistema ›
  Notificações › Verso*; Windows: *Configurações › Sistema ›
  Notificações*) — bloqueie o Verso ali e veja que nada aparece. No
  navegador: o pedido dele; permitido, *Ligado.*; recusado (ou bloqueado
  depois nos ajustes do site, e a página recarregada), a linha volta a
  desligado dizendo por quê. Num navegador por HTTP simples a linha diz
  que precisa de HTTPS e não liga; no Safari de um iPhone fora da tela
  inicial, que precisa do app instalado.
- [ ] **Uma notificação com a janela atrás**: as notificações do sistema
  ligadas, a janela atrás de outro app (ou minimizada, ou em outra aba do
  navegador), e então pare o servidor: uma notificação do sistema
  *Sincronização sem conexão*. Com a janela na frente: só o aviso. Um
  clique na notificação do sistema: no navegador a janela vem para a
  frente e a central abre nela. No computador o plugin 2.4 não avisa a
  página do clique — o clique só traz o app para a frente no macOS e no
  Windows, e a central não abre sozinha (o sino tem a contagem); abri-la
  no clique vem com o plugin 2.6 e o Tauri 2.12, num 0.8.x seguinte
  (decidido em 2026-10-14).
- [ ] **VoiceOver e o teclado**: um aviso é lido uma vez quando chega (um
  erro na hora), o foco ficando onde estava; Tab alcança os botões do
  aviso, Esc o fecha e o foco volta; o sino é lido com a contagem; a
  central é um diálogo, Esc a fecha.

### A lista de checksums assinada (ADR 0055, revisto em 2026-10-14; feat/release-checksums)

- [ ] **A 0.8.3 é a ponte** (quando a 0.8.3-beta.1 for publicada): a
  página da release dela tem 30 arquivos, o `verso-0.8.3-beta.1-SHA256SUMS`
  e o `.sig` dele entre eles, e diz que podem ser ignorados; uma
  0.8.2-beta.1 instalada se atualiza para ela por *Ajustes ›
  Atualizações* como antes (ela lê o `.sig` do próprio arquivo), sem ERROR
  no `verso.log`.
- [ ] **Da 0.8.3 em diante o app se atualiza pela lista** (quando a versão
  depois da ponte for publicada, com `PER_FILE_SIGNATURES` em `false` no
  `scripts/release-page.mjs`): a página dela tem 16 arquivos; a
  0.8.3-beta.1 instalada se atualiza para ela, sem ERROR no `verso.log`.
  Num servidor, `sh universo.sh update` diz *Assinatura e checksum válidos:
  universo-…deb está em verso-…-SHA256SUMS*. Antes dessa release, a cópia
  em `https://versomd.com/universo.sh` (versomd-site, `public/universo.sh`)
  é copiada de novo do `packaging/server/universo.sh`, ou o script do site
  não encontra assinatura nela.

### A prévia ao passar o mouse (ADR 0085, feat/hover-preview, 2026-10-14)

- [ ] **A nota de um link onde o ponteiro para, no app** (A): nota 02,
  *Prévia ao Passar o Mouse*, na Leitura: o ponteiro sobre "as fórmulas do
  Guia de Sintaxe" por meio segundo mostra o cartão, com o título marcado
  no topo; o ponteiro dentro do cartão o rola; fora, ele some; no tema
  escuro o cartão se lê como a nota. Uma nota com uma imagem da pasta
  (nota 06): a imagem aparece no cartão (o protocolo `verso:`, que o
  harness imita). `verso.log`: nenhum ERROR.
- [ ] **⌘ no modo Editar no Mac, Ctrl no Windows** (A): nota 02 no Editar,
  o ponteiro parado sobre um link: nada; ⌘ apertado (Ctrl no WebView2 do
  Windows): o cartão; ⌘-clique ainda segue o link e nenhum cartão fica para
  trás.
- [ ] **Uma nota só no iCloud** (A, ADR 0043): um link para uma nota que o
  macOS deixou sem dados (*Remover Download* no Finder): o cartão diz *A
  nota só está na nuvem: abra-a para baixá-la — a prévia não baixa nada.*,
  e o arquivo continua sem dados (`ls -lO` mostra `dataless`).
- [ ] **Um PDF e uma imagem com link** (A): `[[arquivo.pdf]]` e
  `[[imagem.png]]` com o ponteiro parado mostram o PDF (o pdf.js na web
  view do app) e a imagem no cartão; o console fica limpo enquanto o
  cartão abre e fecha.
- [ ] **O board pelo toque, num iPad** (A): um cartão de um board, um dedo
  parado sobre o nome dele: o cartão da nota; levantado, o board não
  seleciona nada novo nem abre nada. (O toque longo do grafo roda por
  máquina; o do board não.)
- [ ] **VoiceOver** (B): associe uma tecla a *Ver a prévia do link sob o
  cursor* em *Ajustes › Atalhos*, um link na Leitura com o foco pelo Tab,
  a tecla: o cartão é lido como o diálogo *Prévia de …* e o texto dele se
  lê; Esc o fecha e o foco volta ao link. O cartão de um passar de mouse
  não é anunciado e não pega o foco.

### Linkar menções sem link (ADR 0089, feat/link-mentions, 2026-10-14)

- [ ] **Linkar e Linkar todas no app** (A): no cofre de exemplo, abra "Lia
  Torres", painel da direita › *Links* › *Menções sem link*: a linha da
  nota 02, *Linkar* — o destaque da nota 02 passa a ter `[[Lia Torres]]`, a
  linha some, a nota 02 aparece entre os backlinks. Numa pasta sua, uma
  nota com nome de palavra comum (digamos "Mesa") mencionada em várias
  notas, uma delas numa tabela e uma num bloco de código: a do bloco de
  código não aparece; *Linkar todas* mostra o diff de cada nota, *Linkar
  todas* no plano grava, e o link da tabela é `[[Mesa\|mesa]]` com a tabela
  inteira. Mude uma das notas em outro editor com o plano aberto: ela é
  dita como não gravada. Com uma nota que menciona aberta numa aba,
  *Linkar*, e então ⌘Z nessa aba: o link é desfeito e salvo. `verso.log`:
  nenhum ERROR, e nenhum "not allowed" para `unlinked_mentions`.
- [ ] **Num UniVerso** (A): uma dona e um leitor na mesma pasta; uma nota
  com uma menção dentro de `> [!secret]` e outra fora. A dona vê as duas
  linhas com *Linkar*; o leitor vê só a de fora, e nenhum botão. A dona
  linka uma menção numa nota que outro membro tem aberta: o link aparece
  no editor desse membro ao lado do que ele digita, e nenhuma cópia de
  conflito aparece.
- [ ] **Com o VoiceOver** (A): o botão de cada linha é lido como *Linkar
  “texto” em Nota*; *Linkar todas* diz quantas; no plano, o Tab alcança o
  diff de cada nota e ele é lido como uma lista de mudanças.

### O infobox (ADR 0086, feat/infobox, 2026-10-14)

- [ ] **Uma nota tipada num cartão ao lado do texto** (A): abra
  `Lugares/Porto Cinzento` no cofre de demonstração. O cartão fica à
  direita do texto, a imagem do porto no alto, na Leitura e no Editar; o
  VoiceOver (⌃⌥U, Pontos de referência) lista uma região complementar
  "Porto Cinzento" e lê a imagem como "O Porto Cinzento visto do farol".
  O Tab vai de "Abrir o schema" → cada propriedade em
  ordem → "Outras propriedades" → "Adicionar propriedade". Abri-la não
  grava nada (`git status` no cofre, ou a data do arquivo).
- [ ] **Uma edição no cartão chega ao arquivo, nos dois modos** (A): no
  modo Editar, acrescente um habitante com "Adicionar link…" (a lista
  oferece as notas da pasta), mude "Perigo"; o arquivo tem `- "[[…]]"` e
  o número novo, nada mais mudou; ⌘Z desfaz. O mesmo na Leitura. Uma
  figurinha ou uma capa escolhida no modo Editar agora também chega ao
  arquivo (a correção deste ramo).
- [ ] **Um painel estreito** (A): divida o painel (⌘\) até o cartão ir
  para cima do texto, dobrado na imagem e em três propriedades; "Mostrar
  todas as propriedades" abre o resto e diz que está expandido.
- [ ] **Uma imagem da web** (A): ponha em `mapa:` uma imagem `https://`
  de uma origem não aprovada: o cartão mostra o endereço como texto, o
  porquê e "Aprovar <origem>"; nada é buscado (`verso.log`, nenhuma
  requisição). Aprove: a imagem aparece, e a origem está nas origens
  aprovadas dos *Ajustes*. Com "carregar conteúdo remoto" desligado, uma
  origem aprovada mostra "Carregar". Na janela web (UniVerso) uma imagem
  `https:` de origem aprovada aparece; a CSP da página não mudou.
- [ ] **Obsidian** (A): abra o mesmo cofre no Obsidian: as propriedades
  do `Porto Cinzento` aparecem como o Obsidian as mostra, os habitantes
  como links, a nota do schema como um bloco de código.

### Dados e tabelas sorteadas (ADR 0088, feat/dice, 2026-10-14)

- [ ] **Um dado numa nota rola e não escreve nada** (A): no app
  instalado, a nota 24 do cofre de exemplo na Leitura, depois no Editar:
  cada código `dice:` é um dado; um clique e Enter rolam, o cartão mostra o
  total e cada dado, o VoiceOver diz *1d20+5: …* uma vez por rolagem. A
  rolagem da tabela dá uma linha cujo link abre o Capitão Ruy. Feche a
  nota e olhe o arquivo no disco: os mesmos bytes (`shasum` antes e
  depois), e nenhuma linha de `write` dele no `verso.log`.
- [ ] **Numa sala quem rola é o servidor** (A): dois navegadores num
  UniVerso, duas contas na mesma nota com `` `dice: 1d20+3` ``. Uma rola: a
  outra vê o mesmo total com *X rolou* ao lado do dado, e o VoiceOver diz o
  nome; uma terceira janela que abre a nota depois mostra essa rolagem.
  Quem só lê também rola. O log do servidor não tem ERROR. Pare o servidor
  e role: o cartão diz que rolou só nesta janela.
- [ ] **A nota de uma pasta sincronizada, no desktop** (A): uma pasta deste
  computador que sincroniza, a nota aberta em duas janelas do app e num
  navegador: uma rolagem numa janela aparece na outra e no navegador.
- [ ] **⌘⇧P › Rolar dados…** (A): rola uma notação digitada; nada escrito.

### O resto das bases (ADR 0094, feat/bases-rest, 2026-10-14)

- [ ] **O mapa desenha nas web views de verdade** (A): no app instalado no
  macOS (WKWebView), no Windows (WebView2) e no Linux (WebKitGTK), a nota
  04 do cofre de demonstração, *Projetos.base › Mapa*: o contorno do mundo
  nas cores da janela, três marcadores (São Paulo, Lisboa, Recife); um
  clique num marcador abre o projeto; o ponteiro parado nele mostra a
  nota; a lista embaixo nomeia os três. Nenhuma linha `maplibre` ou
  `Failed` no `verso.log`, e o app não fez pedido nenhum para fora (Little
  Snitch ou o log do firewall, se houver). Uma máquina sem WebGL diz *Esta
  tela não consegue desenhar mapas* e mantém a lista. Tema escuro: o
  contorno acompanha.
- [ ] **Tiles só com a sua escolha** (A): *Ajustes › Fundo dos mapas ›
  OpenFreeMap*: o mapa passa a mostrar as ruas do OpenFreeMap; de volta a
  *Contorno do mundo*: o contorno de novo, e nenhum pedido a
  `tiles.openfreemap.org`. Uma base com `mapTiles:
  https://tile.openstreetmap.org/{z}/{x}/{y}.png` pergunta *Esta base pede
  o fundo do mapa a …* antes de buscar qualquer coisa; *Aprovar* carrega.
  *Carregar conteúdo remoto* desligado: só o contorno, dito acima do mapa.
- [ ] **Num UniVerso** (A): a mesma aprovação num navegador no servidor:
  *Recarregar* depois de aprovar, e as tiles carregam; os cabeçalhos da
  resposta de `/` e de `/maplibre-worker.mjs` (o painel de rede do
  navegador) nomeiam a origem aprovada em `connect-src`, e nenhuma outra;
  outra conta no mesmo navegador não aprovou nada e a página dela não nomeia
  nenhuma.
- [ ] **Uma base feita pelo plugin Maps do Obsidian abre como mapa** (A):
  no Obsidian com o plugin Maps, faça uma visão de mapa (ela grava
  `coordinates`, `markerIcon`, `markerColor`, `center`, `defaultZoom`); a
  mesma pasta no Verso mostra os marcadores, ícones e cores; defina o
  centro pelo menu do botão direito do Verso e o Obsidian abre lá. As
  chaves vieram do código público do plugin (`obsidianmd/obsidian-maps` em
  `a5bf456`, `src/map-view.ts`), ainda não vistas numa base que o plugin
  gravou.
- [ ] **Uma expressão regular no núcleo de verdade** (A): nota 04, a coluna
  *Mês* de *Todos os Projetos* mostra `09/2026`; uma fórmula
  `/(?<=a)b/.matches(file.name)` diz *A expressão regular usa
  lookbehind…* nas células e acima da visão.
- [ ] **Uma base incorporada editada no lugar** (A): nota 04 em Leitura, a
  *Todos os Projetos* incorporada: acrescente uma ordenação pela barra
  dela; a *Projetos.base* no disco ganha a ordenação e nada mais muda
  (`git diff`). Com a *Projetos.base* aberta noutra aba e editada sem
  salvar, a mudança da incorporada espera essa aba ou diz que não foi
  gravada. Um leitor num servidor não vê a barra.

### O retorno da janela (fix/ui-feedback, 2026-10-14)

- [ ] **Um servidor fora de alcance é dito onde você agiu** (A): uma
  pasta deste computador aberta, conectado a um UniVerso, e então pare o
  servidor. Em *Ajustes › Sincronizar*, acima do botão: *Não foi possível
  alcançar o servidor localhost:7351 — ele está fora do ar ou sem rede.* e
  *Tentar de novo*; aperte *Sincronizar esta pasta*: ele fica ocupado por
  um instante e a mensagem fica. Ligue o servidor, *Tentar de novo*: a
  pasta sincroniza. O mesmo em *Ajustes › Servidores* (no lugar das pastas
  do servidor, e sob *Abrir aqui*) e no seletor de pastas. Uma pasta que
  sincroniza, com o servidor parado: a barra de status diz *Servidor fora
  de alcance: localhost:7351* em segundos, e a seção dela diz por quê, com
  *Sincronizar agora*. `verso.log`: um `WARN host unreachable: the server
  at http://localhost:7351: … Connection refused …` por minuto, nenhum
  ERROR por clique. Não verificado por teste: as falhas do próprio sistema
  para um nome que não existe e um certificado TLS recusado — tente
  `https://naoexiste.invalid` em *Servidores › Conectar*.
- [ ] **Uma janela numa pasta de servidor, com o servidor parado** (A):
  abra uma pasta do UniVerso na janela, pare o servidor: a barra de status
  diz *A conexão com o servidor caiu; tentando de novo…* e, em até 5 s,
  *Servidor fora de alcance: localhost:7351* e *Tentar de novo*.
  `verso.log`: as tentativas a 5, 10, 20, 40 s… (uma linha WARN por
  minuto, não uma por tentativa). Ligue o servidor, *Tentar de novo*: em
  um segundo, *Conectado ao servidor de novo.*, a pasta como está no
  servidor.
- [ ] **A paleta sobre os ajustes** (B): *Ajustes* aberto, um clique numa
  seção, depois ⌘⇧P: a paleta fica por cima com o cursor nela; Esc fecha
  só a paleta, e o foco volta para *Ajustes*; Esc de novo fecha *Ajustes*.
  O mesmo com ⌘P e com *Ajuda › Relatar problema* sobre *Ajustes*.
  VoiceOver, com a paleta aberta: nada de *Ajustes* é lido atrás dela.
- [ ] **A paleta sobre o diálogo de compartilhar** (B): numa pasta de
  UniVerso que é sua, o menu de uma pasta › *Compartilhar…*, digite um
  e-mail, depois ⌘⇧P: a paleta fica por cima com o cursor nela; Esc fecha
  só a paleta, o e-mail ainda digitado e o cursor de volta no campo; Esc
  de novo fecha o diálogo. VoiceOver: o diálogo não é lido atrás da
  paleta.
- [ ] **O console do DevTools diz uma falha** (C): o console aberto
  (⌥⌘I), o servidor parado, *Sincronizar esta pasta*: um aviso, `Verso:
  unreachable: localhost:7351`, e nenhum token ou senha em linha alguma.
- [ ] **A hora do relatório é a do computador** (D): *Relatar problema*:
  a linha *Hora deste computador: 2026-10-14 10:25:24 (UTC−03:00)* é o
  relógio e o fuso do Mac; as linhas do registro abaixo dela estão em UTC
  (`Z`), três horas à frente em São Paulo.

### Endurecimento de segurança (ADR 0083, 2026-10-13)

- [ ] **Uma nota e um board compartilhados editados pelo app desktop
  enquanto outra janela os edita** (8d419e9, ca4c8a6, 857f4aa): no app
  instalado numa pasta de UniVerso, a mesma nota aberta no navegador;
  digite rápido nos dois ao mesmo tempo, depois cole um parágrafo longo
  no app enquanto o navegador digita: cada letra chega nos dois, na
  ordem digitada, nada perdido nem dobrado, a aba ainda *ao vivo* e
  nunca avisada de uma edição que não foi, sem faixa de conflito, o
  arquivo no disco do servidor com o mesmo texto; depois um board, arrastando e desenhando nos dois ao mesmo
  tempo: os dois veem os dois, nada pula de volta. O log do app
  (`verso.log`) e o journal do servidor não têm atualização recusada.
  Não verificado por teste: que o app passa adiante as chamadas de uma
  janela na ordem (ca4c8a6).
- [ ] **"Confirme que é você" antes de um token e antes de aprovar um
  aparelho** (item 6 da ADR 0083; 40de8b5, 1d7c4e4): com o login feito
  há mais de dez minutos, nos *Ajustes* do servidor, *Tokens de acesso*,
  *Criar token*: o diálogo *Confirme que é você* abre, o campo de senha
  com o foco; uma senha errada diz *Senha errada.*; a certa cria o token
  sem perguntar de novo. De novo depois de dez minutos, com *Usar uma
  passkey* (Touch ID no Mac, a passkey do celular): o token é criado. O
  mesmo no *Aprovar este aparelho* da página do aparelho. O Escape fecha
  o diálogo e nada é criado; o VoiceOver lê o título e a linha do
  diálogo.
- [ ] **Conectar o app copia o código, e a página o pede** (decidido em
  2026-10-14, ADR 0083 Como construído): no app instalado, *Ajustes ›
  Servidores*, o endereço do servidor, *Conectar*: a linha diz *Código
  copiado — cole na página que abriu:* com o código, e o navegador abre a
  `/device` do servidor com o campo *Código do aplicativo* vazio; ⌘V
  (Ctrl+V no Windows e no Linux) cola o código, *Continuar* mostra quem
  pediu, *Aprovar este aparelho* conecta o app. No Windows (WebView2) e
  no Linux (WebKitGTK) como no Mac; onde o sistema recusa a cópia, a linha
  diz *Digite este código na página que abriu:* no lugar e o código é
  digitado. Um link `/device?code=…` aberto à mão mostra o mesmo campo
  vazio e não envia nada.
- [ ] **A página do aparelho com um código digitado** (item 17 da ADR
  0083, 73807d2): `/device` aberta à mão pede *Cole o código que o
  aplicativo copiou, ou digite o que ele mostra na tela dele.*; o código
  que o app mostra, digitado em minúsculas e sem o traço, é aceito, e a
  página mostra *Código que você informou* ao lado de quem pediu antes de
  *Aprovar* ou *Não fui eu: recusar*; um código digitado errado diz *Um
  código tem oito letras…* ou responde como desconhecido, e alguns
  errados seguidos fazem a página esperar antes do próximo; o app então
  entra depois de aprovado.
- [ ] **Compartilhar uma pasta do servidor pelo app pede "Confirme que
  é você"** (item 6 da ADR 0083): no app instalado com login num
  UniVerso, numa pasta de que a conta é dona, *Compartilhar…* numa pasta
  da árvore, o e-mail de outra conta e *Compartilhar*: o diálogo *Confirme
  que é você* abre sobre o diálogo de compartilhar, só com a senha (sem
  *Usar uma passkey*: a janela do app não responde pelas passkeys do
  servidor) e o foco no campo; uma senha errada diz *Senha errada.*; a
  certa adiciona a pessoa sem perguntar de novo, e mudar o papel dela em
  dez minutos não pergunta nada. Cancelar a deixa de fora e o diálogo de
  compartilhar diz *Dar ou mudar um papel pede que você confirme que é
  você; nada mudou.* O VoiceOver lê o título e a linha do diálogo; o foco
  volta ao diálogo de compartilhar quando ele fecha.
- [ ] **Os diagramas Mermaid depois da 12.2.0** (item 13 da ADR 0083,
  cda7500): a nota "08 - Diagramas Mermaid" do vault de demonstração no
  app instalado e no navegador: todo diagrama desenha, no claro e no
  escuro; um diagrama com erro de sintaxe mostra a mensagem do próprio
  leitor abaixo de "Syntax error in text"; os nós em círculo cabem no
  rótulo, os rótulos de um mapa mental ficam centrados e legíveis, as
  cardinalidades de um diagrama de classes ficam ao lado das pontas das
  relações.
- [ ] **Os passos do Caddy que o universo.sh imprime, num host que já
  serve outro site** (7755802): num host Linux cujo Caddy já serve um
  site, instale com o `universo.sh` e siga os passos impressos: o outro
  site continua respondendo, o site do UniVerso está em
  `/etc/caddy/Caddyfile.d/universo.caddyfile`, o Caddyfile tem um
  `import Caddyfile.d/*.caddyfile` só (nenhum acrescentado no Fedora ou
  no EPEL, cujo pacote já o tem), o `caddy validate` passa e os dois
  sites respondem por HTTPS.

### Tudo editado junto (item 12 da ADR 0082, feat/coedit-everything, 2026-10-12)

- [ ] **Um board em dois lugares ao mesmo tempo** (21d096a, 5a027db): num
  UniVerso, um board aberto no navegador e no app instalado na pasta do
  servidor; arraste um cartão num enquanto desenha uma forma e escreve um
  texto no outro: os dois veem os dois num instante, o ponteiro do outro
  anda com o nome, o arquivo no disco do servidor tem os dois, sem faixa
  de conflito, sem cópia; apague uma forma num enquanto a arrasta no
  outro: ela continua apagada, e o ⌘Z onde foi apagada a traz de volta nos
  dois.
- [ ] **O board de uma pasta sincronizada entre dois computadores**: a
  pasta sincronizada em dois Macs (ou um Mac e a VM do Windows), o mesmo
  board aberto nos dois com rede: o mesmo de cima, e o arquivo local de
  cada computador segue os salvamentos da sala; tire a rede de um, desenhe,
  a aba diz *local — sem conexão* e o arquivo local tem o desenho; com a
  rede de volta, *O quadro está ao vivo de novo* e o outro computador
  recebe o que foi desenhado, sem cópia.
- [ ] **Um `.txt` e uma base em dois lugares**: um arquivo de texto
  digitado pelo navegador e pelo app ao mesmo tempo, letras juntadas; o
  *Ordenar* e os *Filtros* de uma base mudados num, a visão da base do
  outro se redesenha com eles, e o `.base` no disco os tem.
- [ ] **Uma nota no cartão de um board e numa aba da mesma janela**: a
  nota editada no cartão com a aba dela aberta ao lado, e de um navegador
  ao mesmo tempo: os três mostram o mesmo texto, ninguém é tirado da sala,
  o arquivo acompanha.
- [ ] **Abrir não grava nada**: um board aberto em dois lugares, olhado,
  arrastado e ampliado, fechado: a hora de modificação do arquivo não
  muda.

### As decisões de 2026-10-12 (feat/decisions-2026-10-12)

- [ ] **Um nome que só difere na caixa é recusado** (spec Q8, ADR 0070
  item 3): no app instalado, ao lado de uma nota `Nota`, uma nota nova
  `nota` não é criada e a barra de status diz que um Mac ou o Windows
  guardaria só um dos dois; renomear `Nota` para `nota` funciona; uma
  pasta sincronizada com um UniVerso no Linux com uma nota `nota.md`
  criada ali ao lado de `Nota.md` (à mão no disco do servidor) aparece em
  "Não sincronizados" da sincronização como nome ocupado.
- [ ] **Os favoritos de um leitor ficam neste computador** (ADR 0070
  itens 1–2): conectado como leitor de uma pasta de UniVerso que tem
  `.verso/settings.json`, uma estrela numa nota aparece na hora, continua
  depois de reabrir a pasta, e *Ajustes › Organização › Favoritos* diz
  *Desta máquina*; o `settings.json` do servidor não muda e nenhum erro é
  dito; a mesma pasta sincronizada no desktop como leitor se comporta
  igual.

### Sincronização e UniVerso (feat/universo, 2026-10-11)

- [ ] **Duas pessoas compartilham pastas num UniVerso** (ADR 0081,
  2026-10-11): duas contas, dois navegadores (e o app desktop). Sérgio
  clica com o botão direito numa pasta do vault dele, *Compartilhar…*, o
  e-mail da Ana, *edita*; o botão da pasta da Ana a lista em
  *Compartilhados comigo* como "Pasta (Sérgio)", ela abre numa janela
  própria, uma nota criada ali aparece na pasta do Sérgio, um link para
  uma nota dele de fora diz *Não está no que foi compartilhado com você.*;
  Ana compartilha uma de volta com Sérgio, *lê*. No app desktop a Ana
  sincroniza o compartilhamento com uma pasta vazia do computador dela
  (Ajustes › Servidores › *Sincronizar*), nunca dentro do vault dela.
  Sérgio renomeia a pasta compartilhada na janela dele: a janela e o sync
  da Ana continuam. Notas que incorporam imagens da pasta de anexos do
  vault: o diálogo oferece *Incluir “…”, só leitura*, e a Ana passa a ver
  as imagens sem poder mudá-las. Sérgio tira a Ana: a janela dela fecha a
  pasta na hora, a cópia sincronizada fica e o sync dela desliga, dizendo
  que o compartilhamento foi revogado e quando (`6c7800e`). Também na largura de um celular. A página da pasta no console
  lista o compartilhamento com as pessoas; o log de auditoria tem cada
  passo com o caminho.

- [ ] **A sincronização de um compartilhamento revogado desliga com um
  aviso** (ADR 0081 item 8, `6c7800e`): no app instalado, a Ana
  sincroniza um compartilhamento do Sérgio; o Sérgio a tira em
  *Compartilhar…*. Em segundos o app da Ana mostra um aviso "Quem
  compartilhou … revogou o seu acesso em …", a barra de status diz
  "Desligada: quem compartilhou revogou o acesso em …" (âmbar), e
  *Ajustes › Sincronizar* abre em "Compartilhamento revogado" acima do
  formulário; os arquivos dela estão como estavam; o log do app tem uma
  linha `WARN sync turned off: … its owner revoked the share` e nenhum
  `ERROR`. Feche e abra a pasta de novo: o aviso continua e a
  sincronização não começa. Ligue a sincronização de novo com outra
  pasta: o aviso some.
- [ ] **A página que aprova um aparelho diz quem pediu** (lacuna 12 do
  modelo de ameaças, `5838c10`): *Ajustes › Servidores*, conecte ao
  UniVerso; a página no navegador mostra *Quem pediu* — o nome deste
  computador, o endereço que o servidor vê para ele, a hora — e então
  *Foi você quem pediu, neste aparelho?*, *Aprovar este aparelho: <nome>*
  e *Não fui eu: recusar*. Recuse: o app para de perguntar e não
  entra; conecte de novo e aprove: entra. Com o VoiceOver, os dados e a
  pergunta são lidos antes dos botões. Também na largura de um celular.
- [ ] **Um cursor leva o nome de quem escreve** (lacuna 11 do modelo de
  ameaças, `3bc56ae`): duas contas numa nota, em dois navegadores: cada
  uma vê o cursor da outra com o nome e a cor da conta da outra, como
  antes.

- [ ] **"Guardar os dois" no conflito do editor** (`18da5c7`): numa pasta
  sincronizada, mantenha uma nota aberta em Editar com texto não salvo
  enquanto outro aparelho a muda; a tela "O arquivo mudou em disco…" oferece
  um terceiro botão, "Guardar os dois" — a versão do disco fica com o nome,
  o seu texto vai para `<nota> (conflito, <este computador>, <data>).md`, a
  aba mostra a cópia.
- [ ] **Uma nota apagada fora enquanto a aba está suja** (`e5b3ee0`): apague
  o arquivo no Finder enquanto digita nele; a aba diz "Esta nota foi apagada
  ou movida fora do Verso. O seu texto continua aqui." com "Salvar de novo" e
  "Fechar sem salvar"; sem ERROR no log do app.
- [ ] **Links que um rename não conseguiu atualizar** (`da6ac8e`): renomeie
  uma nota enquanto outro programa edita uma nota que linka para ela; o
  aviso nomeia a nota pulada, e "Tentar de novo" aplica a mudança sobre o
  texto novo.
- [ ] **Um nome em duas formas de acento** (spec Q7, `0cb6dd5`): num
  aparelho Linux ou Windows crie `Café.md` ao lado de um `Café.md` que o
  servidor já tem na outra forma Unicode; o segundo é listado em "nome de
  outro, só mudando…" e nunca enviado; o primeiro continua sincronizando.
- [ ] **Janela numa tela pequena** (`068215e`): numa tela 1280×800 a
  primeira janela abre dentro da tela, barra de status visível.
- [ ] **O nome deste aparelho** (ADR 0079 item 8, 2026-10-11): no app
  instalado, Ajustes › Servidores › "Nome deste aparelho" — vazio, com o
  nome do sistema de placeholder; dê "Estúdio", "Salvar nome": conectado a
  um servidor, diz "os servidores já mostram o nome novo", e o Ajustes ›
  Conta do servidor lista a sessão como "Verso · Estúdio"; um conflito feito
  depois é `<nota> (conflito, Estúdio, <data>).md`; esvaziado e salvo, o
  nome do sistema volta nos dois.
- [ ] **Um admin encerra as sessões de outra conta** (ADR 0077 item 3,
  2026-10-11): no console, a página de uma conta com um aparelho conectado
  e sincronizando e um token — "Encerrar sessões e tokens", confirme; a
  página diz quantas foram; a sincronização do aparelho diz que foi
  desconectada na hora (não na próxima varredura), o navegador dessa conta
  cai na página de entrar, o token dela para de responder, e o registro
  lista "encerrou as sessões e os tokens da conta" sobre essa conta.

### A lixeira (ADR 0080, feat/universo, 2026-10-11)

- [ ] **A lixeira de uma pasta deste computador** (`9c10495`, `173cf7e`):
  no app instalado, apague uma nota e abra *Ajustes › Lixeira* (ou "Abrir
  a lixeira" na paleta, ou o botão direito no espaço vazio da árvore): a
  nota aparece com a data de hoje; "Restaurar" põe o arquivo de volta no
  disco (o Finder mostra) e o log tem uma linha `trash` "restored".
- [ ] **O que uma lixeira antiga guardava** (`8ad89d2`): abra uma pasta cuja
  `.trash` o Obsidian ou um Verso mais antigo encheu; os itens aparecem
  "antes de … (data desconhecida)", nada é apagado na hora; *Manter
  arquivos apagados por* "1 dia", um dia depois, remove-os, cada um uma
  linha "expired" do log; a varredura também roda um dia depois de abrir a
  pasta, enquanto ela fica aberta.
- [ ] **Uma exclusão que a sincronização fez aqui** (`9c10495`): com dois
  computadores sincronizando uma pasta, apague uma nota num deles; no
  outro, a lixeira a lista "pela sincronização com <servidor>".
- [ ] **A lixeira do servidor de teste** (`02903f1`): depois da
  atualização, os 306 MB que já estavam na `.trash` de uma pasta aparecem
  com data desconhecida e nada some antes de 30 dias desde a primeira
  leitura; a página da pasta no console mostra *Lixeira* (quantidade,
  tamanho, "fora da cota") e *Dias na lixeira*; os totais da Visão geral
  somam as lixeiras; quem edita restaura mas não vê "Apagar agora"; a dona
  encurta os dias pela janela e não passa dos da administração.
- [ ] **Uma versão que a escrita de um aparelho substituiu** (`02903f1`,
  F18): num computador sincronizado, deixe outro programa salvar um texto
  antigo por cima de uma nota que a sincronização acabou de atualizar; no
  servidor, a *Lixeira* lista "substituído por <aparelho>", e "Restaurar"
  a põe ao lado da nota como `<nota> (restaurado <data>).md`.
- [ ] **A janela do desktop numa pasta do servidor** (`9c10495`): *Ajustes ›
  Lixeira* mostra a lixeira do servidor, com os limites do papel.

### Versão 0.5 (feat/windows-fs, feat/signed-updates)

- [ ] **Verso para Linux** (ADR 0071, 2026-10-09), nas máquinas do
  `verso-linux-vm`: o `.deb` no Ubuntu e no Debian (GNOME), o `.rpm` no
  Fedora (KDE), o AppImage em qualquer uma — cada um abre uma pasta, edita
  uma nota, abre um board; "Mostrar no gerenciador de arquivos" seleciona o
  arquivo; no AppImage, Ajustes › Terminal e agentes › Instalar põe o
  `verso` em `~/.local/bin`. No desktop do mantenedor, com NVIDIA no
  Wayland: a janela desenha (nenhum painel em branco).
- [ ] **Um board aberto e tocado logo em seguida** (2026-10-09): abrir o
  Tour do Verso, clicar nele, arrastar a vista com Espaço e dar zoom de
  imediato; depois de alguns segundos o arquivo está igual (`git status` na
  pasta de demonstração, ou a data do arquivo), no Mac e no Linux.
- [ ] **A primeira atualização assinada** (ADR 0055, 2026-10-09): da
  versão anterior à primeira release assinada, "Baixar e atualizar" a
  instala no macOS e no Windows; a página da release lista um `.sig` ao
  lado de cada arquivo.
- [ ] **Sem barra de título** (ADR 0072, 2026-10-08): no Mac, tela cheia
  (os botões somem, a faixa da esquerda volta para cima), uma segunda
  janela, arrastar pela barra de abas e pelo topo da barra lateral; no
  Windows, encaixar numa borda da tela e Win+setas, redimensionar por cada
  borda, um duplo clique no espaço vazio da barra de abas; no Linux (GNOME,
  KDE), o mesmo: arrastar, redimensionar por cada borda, Super+setas, um
  duplo clique.
- [ ] **Um servidor de agentes para todo o Verso** (ADR 0054, 2026-10-08):
  em Ajustes › Terminal e agentes escolha "Um servidor para todo o Verso",
  marque duas pastas como visíveis, "Adicionar ao Claude Desktop", feche o
  Verso, reinicie o Claude Desktop; num chat pergunte quais pastas ele vê e
  peça uma busca numa delas — ele nomeia as duas, as lê, e o `agents.log`
  na pasta de configuração do Verso lista cada chamada. No Mac, com uma
  pasta em Documentos ou no iCloud: o macOS pergunta, e nomeando qual app?
- [ ] **O Claude Desktop inicia o servidor do Verso no Windows**
  (2026-10-08): no Mac iniciou; no Windows o log disse "no stdio servers
  connected". Ajustes › Desenvolvedor no Claude Desktop mostra o estado do
  servidor.
- [ ] **A atualização pelo app no Windows** (ADR 0055, 2026-10-08): de um
  beta de Windows para o seguinte, "Atualizar" baixa o instalador, roda-o,
  e a versão nova abre com as notas e os ajustes como estavam. Nunca
  rodada: a primeira versão de Windows é a primeira chance.
- [ ] **Uma nota nos Arquivos Sob Demanda do OneDrive** (ADR 0043,
  2026-10-08): numa máquina Windows com OneDrive, ponha uma pasta de notas
  no OneDrive, botão direito nela, "Liberar espaço"; abra-a no Verso — as
  notas aparecem, o primeiro índice não baixa nada (os ícones de nuvem
  ficam), e abrir uma nota baixa só aquela e mostra o texto dela — nenhum
  "the cloud did not give the file's content" no log. Só o `attrib +O` foi
  testado.
- [ ] **Uma pasta dentro de um cliente de sync de terceiros** (ADR 0029, a
  escrita atômica da feature 2; uma checagem manual desde 2026-10-12, que
  não trava nada): ponha uma pasta de notas dentro do iCloud Drive, do
  Dropbox, do OneDrive ou do Syncthing, abra-a no Verso e salve uma nota
  algumas vezes; em outra máquina, ou na página web do próprio cliente, a
  nota chega como o mesmo arquivo editado — não apagada e criada de novo,
  sem cópia em conflito, com o histórico de versões mantido onde o cliente
  tem um.

### 0.4.0-beta.1

- [ ] **Várias entradas na árvore** (`f3e1af3`): ⌘-clique em duas notas e
  ⇧-clique numa terceira — as linhas entre elas ficam selecionadas; Esc
  limpa. Arraste-as para uma pasta: elas vão; uma nota que apontava para
  elas por caminho aparece num plano só. Botão direito na seleção: Mover
  para…, Copiar caminhos relativos, Mover para a lixeira (uma pergunta).
- [ ] **A largura de uma coluna** (`a6d9fa9`): na tabela da nota 01,
  arraste a borda direita de uma célula de cabeçalho no Editar; troque
  para Leitura e volte, reabra a nota — a largura fica; o `.md` não muda.
- [ ] **O botão direito numa página de pasta** (`6595623`): no espaço
  vazio de uma página de pasta, o menu da árvore, com ícones.
- [ ] **O botão de copiar código em inglês** (`6595623`): Ajustes › Idioma
  › English, e passe o mouse no botão de copiar de um bloco de código:
  "Copy code".
- [ ] **`type:` na busca** (`f3e1af3`, a permissão): busque
  `type:personagem` — os dois personagens aparecem (antes, no app,
  respondia "not allowed").

### Próxima versão

- [ ] **O embed de um bloco** (spec Q3, Q21): nota 02, "Incorporar só um bloco" — o embed mostra só a terceira descoberta; um link `[[Projetos/Pesquisa e Descobertas#^atomica]]` abre a nota naquele item. Na Leitura nenhum `^atomica` aparece, nem no embed nem na nota; no Editar ele aparece apagado.
- [ ] **Templates numa nota nova** (ADR 0068): ⌘N — "Começar com" sob o título; escolha "Nota de Reunião": a nota é o template com a data de hoje; ⌘Z desfaz; uma nota nova com Em branco fica como estava.
- [ ] **O identificador novo mantém os ajustes da janela**: depois de atualizar da 0.4.0-beta.1, o tema, as teclas e a largura de uma coluna estão como eram; o log diz "window data carried over to com.versomd.app.beta" uma vez.
- [ ] **A capa de um PDF na visão de pasta**: abra `assets` do cofre de exemplo, Miniaturas — o PDF mostra a primeira página; troque para Lista e volte para a tabela — os itens continuam.
- [ ] **O ⌘Z do menu com o foco fora do texto**: numa nota no Editar,
  digite duas palavras com um segundo entre elas, clique no botão
  Editar, aperte ⌘Z duas vezes — cada palavra sai por vez; ⌘⇧Z traz a
  última de volta.
- [ ] **Um SVG no Editar**: nota 06 do cofre de exemplo, Editar — o
  diagrama aparece, e continua ao ser selecionado com o texto em volta.
  À esquerda do título de uma nota sem figurinha, um brilho apagado, não
  uma estrela.
- [ ] **A versão no endereço dos arquivos** (cache depois de uma
  atualização): depois de atualizar, a janela mostra a interface da versão
  nova na hora, sem tela antiga; o leitor de PDF e um board continuam
  abrindo.

### O servidor (ADR 0073, 0074, 0075)

Nas máquinas do mantenedor, com o servidor alcançado por HTTPS
(`tailscale serve` ou um proxy); o `scripts/check-server-image.sh` e os
testes de ponta a ponta cobrem o resto.

- [ ] **Passkeys** num aparelho de verdade: adicionada em *Conta* no Mac
  (Touch ID) e no iPhone; *Entrar com passkey* depois do e-mail, no Safari
  e no Chrome.
- [ ] **O celular e o iPad** no navegador, pelo `tailscale serve`: entrar,
  abrir uma pasta, editar uma nota, ver chegarem as edições do outro
  aparelho.
- [ ] **O app desktop numa pasta do servidor** (o app instalado):
  *Ajustes* › *Servidores*, *Conectar*, *Permitir* no navegador, abrir uma
  pasta, editar, uma imagem da pasta aparece; sair e abrir o app de novo: a
  pasta do servidor volta.
- [ ] **CasaOS ou ZimaOS**: o compose instalado pela tela da loja de apps,
  as variáveis do admin preenchidas, as pastas no NAS.
- [ ] **Um `.deb` numa máquina pequena sem Docker**: instalado, o arquivo
  de ambiente editado, `systemctl enable --now universo`.
- [ ] **A conta em Ajustes e o console de administração**, no navegador do
  Mac e do iPhone: o botão da pessoa ao lado da engrenagem abre *Ajustes* ›
  *Conta*, que leva um admin ao `/admin`; as seções do console, a cota de uma
  pasta, o menu no celular; no celular, *Ajustes* e *Conta* no pé da gaveta
  lateral; o cartão de entrar nos dois temas.
- [ ] **Uma pasta perto da cota**: uma nota acrescentada além de 90 % mostra
  o aviso na janela; um arquivo além da cota é recusado com a frase, e
  apagar um arquivo é permitido.
- [ ] **Sincronização entre dois computadores** (ADR 0079), com o app
  instalado no Mac e em outro computador (a VM Windows), os dois
  conectados ao mesmo UniVerso: uma pasta sincronizada do Mac para uma
  pasta nova lá, depois a mesma pasta do servidor sincronizada numa pasta
  vazia do outro computador; uma edição num chega no outro em segundos; uma
  nota editada nos dois com um sem rede volta como a versão do servidor e
  uma cópia *(conflito, …)*, com a diferença em *Ajustes* ›
  *Sincronizar*; um vídeo grande cruza inteiro; o Obsidian, na pasta do
  Mac, vê as mudanças; o log diz o que cruzou e não tem `ERROR`.
- [ ] **Os ajustes de uma pasta em dois computadores** (ADR 0070 itens
  1–2), ao lado da conferência acima: no Mac, uma nota com estrela e
  *Ignorar pastas de build* desligado na pasta sincronizada; no outro
  computador, depois da sincronização, a estrela e a chave estão lá, cada
  uma marcada *Da pasta*, e o `.verso/settings.json` as guarda; mudados
  nos dois com um sem rede, a versão do servidor fica com o nome e o
  `.verso/settings (conflito, …).json` fica ao lado; uma pasta nunca
  marcada nem mudada não tem `.verso/`; uma pasta cujos favoritos o app
  instalado já guardava antes desta versão abre com eles, levados para o
  `.verso/settings.json` uma vez.
- [ ] **Uma nota ao vivo em dois computadores** (ADR 0082), ao lado da
  verificação acima: a mesma nota aberta em Editar na pasta sincronizada
  do Mac, na do outro computador e num navegador; cada um vê o texto dos
  outros enquanto digitam, com os nomes ao lado do título (*ao vivo, com
  …*); os arquivos dos dois computadores seguem a sala em segundos e
  nenhuma cópia *(conflito, …)* aparece. Wi-Fi desligado no Mac enquanto
  digita: *local — sem conexão*, o texto fica e está no arquivo do Mac;
  ligado de novo, a nota volta a *ao vivo* e o texto digitado sem rede
  está nas janelas dos outros, uma vez só. Com duas janelas do Mac em duas
  pastas sincronizadas que têm, cada uma, uma nota com o mesmo nome,
  digitar numa nunca aparece na outra (uma janela ouve só os eventos da
  sua sala). O VoiceOver diz quem entra e sai, e a nota ficando local e
  ao vivo. O log não tem `ERROR`.
- [ ] **Uma gravação numa nota ao vivo só em outro lugar** (ADR 0082, as
  gravações que não são teclas): a nota aberta em Editar só no navegador;
  na pasta sincronizada do Mac, com a nota em nenhuma aba, citar nela um
  trecho de PDF (é a nota de anotações dele), definir uma célula de base
  dela e dar a ela um adesivo na árvore. Cada uma chega ao texto do
  navegador como uma edição enquanto se digita lá, o arquivo segue em
  segundos, e nenhuma cópia *(conflito, …)* aparece em nenhum computador.
  Fechada no navegador, as mesmas gravações vão para o arquivo como antes.
- [ ] **Um botão da faixa oculto e trazido de volta** no app instalado:
  botão direito › *Ocultar este botão*, a barra de status diz onde;
  *Ajustes* › *Aparência* › o switch dele o traz de volta; a engrenagem não
  tem *Ocultar*.

### A janela em toda tela (ADR 0076)

No celular e no iPad do mantenedor, a janela do servidor no navegador
(feat/web). O Playwright não move dedo no WebKit nem abre o teclado do
sistema, e uma página não sabe se um leitor de tela está ligado: isto só
se vê aqui. Antes de o servidor ser anunciado (ADR 0073 item 6).

- [ ] **VoiceOver no iPhone** (ADR 0076 item 9; ADR 0035 item 2): deslize
  pela barra de baixo — cinco botões, cada um com nome (Arquivos, Buscar,
  Nova nota, Voltar, Comandos); abra a gaveta e chegue a uma linha, depois
  ao "…" dela ("Mais ações: …"); tocar duas vezes e segurar numa linha
  abre o menu; no Editar, um toque duplo num link e o cartão depois do
  texto ("Link: …") com Abrir e Editar link; a barra do teclado chamada
  "Ferramentas de escrita"; numa pasta de quem só lê, "Você só lê esta
  pasta" lido em voz alta.
- [ ] **VoiceOver no iPad**, em pé e deitado: o mesmo; acima de 760 px a
  fita e as áreas divididas ficam; os controles do grafo ao lado dele
  deitado, atrás de "Ajustes do grafo" numa área abaixo de 520 px.
- [ ] **TalkBack no Android** (Chrome): os mesmos passos; o tocar duas
  vezes e segurar do TalkBack abre o menu de uma linha (o `contextmenu` do
  próprio Android).
- [ ] **Segurar no iOS**: uma linha segurada e solta abre o menu; segurada
  e movida, arrasta para uma pasta; deslizar rola a árvore e não move
  nada. Um cartão do kanban segurado: o menu, com "Mover para a coluna…";
  deslizar no quadro passa uma coluna por vez.
- [ ] **O teclado na tela** no iPhone e no Android: no Editar, o menu `/`,
  as sugestões de link depois de `[[`, o seletor de figurinhas e o menu de
  uma aba abrem acima do teclado; o cursor fica acima dele, também na
  última linha da nota; a barra do teclado fica sobre o teclado, e os
  botões dela não fecham o teclado (menos "Esconder o teclado").
- [ ] **O entalhe e os cantos**: um iPhone com entalhe, em pé e deitado —
  nada sob o entalhe nem nos cantos arredondados; a barra de baixo acima
  do indicador de início.
- [ ] **A pinça**: sobre o texto a página inteira amplia (e volta); sobre o
  grafo, um board e um PDF, só eles ampliam.
- [ ] **Números de linha**: no celular, uma nota no Fonte não tem; ligados
  em Ajustes › Editor, aparecem.

## Para reproduzir

Relatados no backlog, mudados desde então, mas sem teste que os cubra; se
ainda acontecem, um passo que os faça acontecer basta.

- [ ] O Exposé do app (⌃↓) lista todas as janelas do Verso (Backlog,
  2026-09-24): uma janela do sistema, que o harness do navegador não
  mostra.

## Conferido

- [x] A busca de notas acha uma nota pelo nome exato do arquivo quando o
  primeiro título a chama de outro jeito, em primeiro na lista; o × limpa
  a busca (feat/web-groundwork, o beta instalado em 0a38c65, conferido
  pelo mantenedor em 2026-10-09).

- [x] O menu de uma imagem: Baixar imagem, Abrir em nova janela; Abrir
  pasta numa segunda janela; uma nota destacada devolvida à janela
  principal (0.4.0-beta.1, conferido pelo mantenedor em 2026-10-07).
- [x] O painel da nota tipada e as nove ferramentas do MCP (0.4.0-beta.1,
  2026-10-07).
- [x] Cobertos por `app/ui/e2e/backlog-repro.spec.mjs` em 2026-10-07, e
  por isso fora desta lista: as setas e o cursor em bullets e checkboxes
  no Editar (nenhuma falha achada); uma aba arrastada para a borda
  direita com as duas barras abertas (nenhuma falha achada); uma janela
  estreita (a barra direita fechada passava 4px da borda — consertado);
  o ⌘Z com o foco fora do texto (não desfazia nada — consertado); e a
  frase incompleta sobre selecionar texto com imagens (um SVG sem
  tamanho próprio era uma linha vazia no Editar — consertado).
