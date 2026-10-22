# ADR 0072 — Os controles da janela dentro do app: sem barra de título no macOS e no Windows

- Data: 2026-10-08
- Fonte: o mantenedor, em sessão, olhando a tela HD da máquina Windows: o
  Obsidian não tem barra de título, os botões de minimizar, maximizar e
  fechar ficam no corpo do app, "e comparando com verso a gente perde
  vários pixels verticais … a barra de título ela é inútil … para janelas
  menores isso impacta"; e "comparando com a versão do Mac, a gente tem a
  mesma situação. Os botões da janela ficam aqui no canto esquerdo"; "tem que tomar cuidado porque ao chamar a barra lateral direita
  corre o risco de botões ficarem escondidos" — conferir a barra lateral
  direita no Windows e a esquerda no Mac. Depois, sobre a proposta do
  autor: "pode escrever o ADR … e talvez já comece a implementar".
- Relacionados: [0065](0065-a-folder-per-window.md) (janelas de uma
  pasta), [0069](0069-windows-port.md) (Windows),
  [0071](0071-linux-port.md) (Linux),
  [0035](0035-cross-cutting-requirements.md) (acessibilidade).
- Status no briefing: não presente
- Revisões: 2026-10-20 — o zoom da janela. O mantenedor: *"por que
  ctrl+scroll ou command + e - não arrumam o zoom?"*. `[DECIDIDO
  2026-10-20]`: Cmd/Ctrl `+` e `-` e Ctrl com a roda (a pinça de um
  trackpad) dão zoom na janela inteira, como o Obsidian e um navegador
  fazem; Cmd/Ctrl `0` volta a 100 %. `[DECIDIDO 2026-10-21]` (0072.z, opção A: aprovado como
  construído, em `zoomCore.ts` e `zoom.ts`): de 50 % a 200 % em
  passos de 10 %; guardado por aparelho (depende da tela), não com a
  conta; sobre um board, um mapa, um PDF ou o grafo, a pinça e Ctrl com a
  roda continuam dando zoom naquela vista; na versão do navegador vale o
  zoom do próprio navegador, e o Verso não toma as teclas.

## Contexto

Toda janela do Verso tem a barra de título do sistema no macOS e no
Windows (o `app/src-tauri/tauri.conf.json` não define `titleBarStyle` e
mantém as `decorations`): uns 28–32 px que mostram só o nome do app e da
pasta, que a primeira faixa do próprio app já mostra. Numa tela de
1280 × 720 isso é 4 % da altura, mais numa janela pequena. O Obsidian não
desenha barra de título: no Windows os botões da janela ficam à direita
da faixa de cima dele, no macOS os botões do sistema flutuam sobre o canto
de cima à esquerda.

O Tauri oferece, no macOS, `titleBarStyle: "Overlay"` com `hiddenTitle`: a
barra some e os botões do sistema (fechar, minimizar, zoom) flutuam sobre o
conteúdo, onde o `trafficLightPosition` os põe. No Windows ele oferece uma
janela sem decorações (`decorations: false`), cujos botões o app desenha e
cujas áreas de cima o app marca como arrastando a janela
(`data-tauri-drag-region`; um clique duplo ali maximiza). Uma janela sem
decorações no Windows 11 perde o menu de Snap Layouts que aparece quando o
ponteiro para sobre maximizar, a menos que a janela mantenha as decorações
e só tire a barra, o que o `tauri-plugin-decorum` (da comunidade, MIT) faz.
Uma janela sem decorações mantém as bordas de redimensionar e, com o
`shadow` (verdadeiro por padrão), a borda e a sombra do sistema.

## Decisão

Proposto pelo autor; decidido pelo mantenedor em 2026-10-08 (Status).

1. **macOS: os botões do sistema sobre o app.** `titleBarStyle:
   "Overlay"`, `hiddenTitle: true`, em toda janela de uma pasta (`main`,
   `window-*`); o popout de uma nota (cujo título é o nome da nota) e a
   janela de uma página web mantêm a sua. A `main` é ajustada no
   `tauri.conf.json`, as janelas `window-*` no construtor delas
   (`windows.rs`). A faixa de cima do app reserva a largura dos botões à esquerda — o
   topo da faixa lateral esquerda, e o começo da barra de abas quando as
   barras laterais estão ocultas —, para nada ficar embaixo deles, e essa
   faixa arrasta a janela.
2. **Windows: os botões do próprio app.** `decorations: false` nas mesmas
   janelas; minimizar, maximizar/restaurar e fechar na ponta direita da
   faixa de cima do app, com os rótulos para tecnologia assistiva (ADR
   0035) e as cores de hover do sistema (fechar em vermelho). As partes
   vazias da faixa de cima arrastam a janela; um clique duplo maximiza ou
   restaura. A barra lateral direita, aberta ou fechada, nunca fica embaixo
   dos botões: a faixa de cima guarda a largura deles na ponta direita, e o
   botão de mostrar/ocultar da barra lateral fica à esquerda deles.
   Ajustado na `main` pela configuração e no construtor das `window-*`,
   como no macOS; as permissões de janela necessárias — `start-dragging`,
   `minimize`, `toggle-maximize`, `close`; `is-maximized` e o
   `internal-toggle-maximize` do duplo clique já estão no `core:default`
   — entram no `capabilities/default.json`, e o
   teste do host que guarda as permissões as cobre.
3. **O Linux mantém a barra de título do sistema** até o porte dele (ADR
   0071).
4. **Conferido nos dois motores:** a faixa reservada com as barras
   laterais abertas e fechadas e numa janela estreita (um e2e por layout de
   plataforma, rodado com uma classe de plataforma forçada), e a olho no Mac
   e na máquina Windows — mover, maximizar (a janela não pode passar da
   tela), encaixar numa borda da tela e com Win+setas, redimensionar por
   cada borda; no Mac, a tela cheia, onde os botões do sistema se escondem e
   a faixa reservada fica em branco.

## Consequências

- **Como foi construído (2026-10-08).** macOS: a barra de título
  definida no `tauri.macos.conf.json` (mesclado só no macOS), e as janelas
  `window-*` construídas a partir da configuração da `main`, com o rótulo
  delas — o `trafficLightPosition` do próprio webview é ignorado quando há
  web views filhas, como aqui. Windows: `decorations(false)` nos dois
  construtores (`windows.rs`, `frameless`). A UI (`app/ui/src/frame.ts`)
  reserva o canto — 78 px no macOS; no Windows três botões de 46 px, na
  altura da linha de cima — e empurra qualquer barra da linha de cima que
  o alcance: para o lado por um espaçador, ou para baixo do canto quando
  ela é mais estreita que ele, uma coluna de abas verticais, ou não caberia
  mais (as abas da barra direita numa barra estreita). Essas barras levam
  `data-tauri-drag-region="deep"`: os botões e as abas delas continuam
  clicáveis. As permissões de janela acrescentadas são `start-dragging`,
  `minimize`, `toggle-maximize` e `close` (o resto está no
  `core:default`), guardadas por um teste do host.
- **Um duplo clique no espaço vazio da barra de abas maximiza a janela**,
  como a barra de título fazia; antes ele criava uma nota, o que o + da
  barra, o ⌘N e o menu da barra continuam fazendo.
- **A linha de cima segue o tamanho de fonte dos ajustes (2,45rem), os
  botões do sistema não**: eles ficam posicionados para o tamanho padrão
  (uma linha de 37 px) e ainda cabem no menor (12 px, uma linha de 29 px);
  numa fonte maior ficam no alto de uma linha mais alta. Medido no macOS 26
  em 2026-10-08: a posição pedida não é aplicada ali — os botões ficam no
  lugar do sistema, o topo a 9 px, uns 3 px acima do centro da linha; o
  canto reservado os cobre de qualquer jeito. Por quê, lido no tao 0.35:
  ele os posiciona só quando a própria view desenha, o que o web view que
  a cobre nunca deixa acontecer; redimensionar um pixel na criação também
  não a faz desenhar (tentado). Então o topo da barra lateral centraliza o
  nome da pasta nos botões, como a barra de título do VS Code faz com o
  lugar do sistema; mover os botões como o Obsidian faz pediria código
  `unsafe` (proibido, ADR 0029) ou uma dependência como o plugin posto de
  lado acima — não adotado; **o mantenedor, 2026-10-08: "Sem unsafe por
  enquanto"**.
- Uns 30 px a mais de altura no macOS e no Windows, em toda janela de uma
  pasta.
- O nome da janela deixa de ser mostrado pelo sistema: o nome da pasta
  continua na faixa de cima do app e na barra de tarefas ou no Dock.
- O menu nativo é a barra de menus do macOS, intocada pelo overlay; no
  Windows o menu de sistema da barra (Alt+Espaço) vai embora, enquanto
  Alt+F4 e Win+setas continuam do sistema.
- No Windows o app passa a cuidar do que o sistema dava de graça (estados
  de hover, clique duplo, foco de teclado dos botões); cada um ganha um
  teste ou uma conferência a olho.

## Alternativas descartadas

- **Manter a barra de título do sistema**: o custo que o mantenedor
  apontou.
- **Uma barra de título do próprio app no macOS também**: o overlay
  mantém os botões do sistema, o comportamento e a acessibilidade deles.

## Status

Aceito. **Decidido pelo mantenedor em 2026-10-08** ("bora fazer os botões
internos antes de liberar versão"; no Windows, "Botões próprios"): o app
desenha os próprios botões no Windows, sem dependência nova, "bonito e
consistente". O plugin foi pesado e posto de lado por fatos levantados no
dia: o `tauri-plugin-decorum` 1.1.1 (MIT) não tem versão desde setembro de
2024, abre os Snap Layouts sintetizando teclas (`enigo`) e depende de
crates Objective-C antigos no macOS; um tratamento caseiro de
`WM_NCCALCSIZE` precisaria de `unsafe`, que o workspace proíbe (ADR 0029).
Perde-se: o menu de Snap Layouts ao parar no maximizar; Win+setas, arrastar
para a borda da tela e Win+Z continuam do sistema.

**Emendado em 2026-10-09, pela palavra do mantenedor**, depois de ver a
versão para Linux no GNOME e no KDE: "de fato a gente vai precisar ter que
remover essa barra de título. Na versão Linux, essa barra é gigantesca …
muito espaço inútil". O item 3 ("O Linux mantém a barra de título do
sistema até o porte dele") se cumpre com o porte (ADR 0071): no Linux a
janela de uma pasta também não tem barra de título do sistema, e o app
desenha minimizar, maximizar e fechar no alto à direita, como no Windows.
A janela é criada escondida e mostrada depois de criada, porque o KWin do
KDE mantinha a barra dele.

Construído em 2026-10-22: a linha de cima não acompanha mais o ajuste de tamanho
da fonte (2,45rem de uma raiz que não muda mais); o tamanho da fonte agora
dimensiona só o texto das notas (ver a ADR 0100, nota do mesmo dia). Registrado,
não decidido.
