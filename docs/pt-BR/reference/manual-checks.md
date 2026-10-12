# Checagens manuais no app

- Início: 2026-10-07
- Fonte: o mantenedor, em sessão: "mantenha um documento com toda
  implementação que precisa de um check meu testado local. isso nao deve
  travar nada".

O que os testes automáticos não alcançam por inteiro — o host real, o
macOS, o app instalado — fica listado aqui, uma linha por mudança, para o
mantenedor experimentar no app instalado quando puder. **Nada aqui segura
um commit, um merge ou uma versão.** Cada item diz o que fazer, o que ver
e o commit; um item marcado diz quando. Uma checagem que acha problema
vira conserto, e o item aponta para ele.

O roteiro do cofre de exemplo (`demo-vault-walkthrough.md`) é o passeio
completo pelo app; esta lista é só o que mudou e ainda não foi visto no
app real.

## Ainda não conferido

### Sincronização e Universo (feat/universo, 2026-10-11)

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
  conectados ao mesmo Universo: uma pasta sincronizada do Mac para uma
  pasta nova lá, depois a mesma pasta do servidor sincronizada numa pasta
  vazia do outro computador; uma edição num chega no outro em segundos; uma
  nota editada nos dois com um sem rede volta como a versão do servidor e
  uma cópia *(conflito, …)*, com a diferença em *Ajustes* ›
  *Sincronizar*; um vídeo grande cruza inteiro; o Obsidian, na pasta do
  Mac, vê as mudanças; o log diz o que cruzou e não tem `ERROR`.
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
