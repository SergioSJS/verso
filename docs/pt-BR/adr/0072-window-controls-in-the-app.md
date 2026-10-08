# ADR 0072 — Os controles da janela dentro do app: sem barra de título no macOS e no Windows

- Data: 2026-10-08
- Fonte: o mantenedor, em sessão, olhando a tela HD da máquina Windows: o
  Obsidian não tem barra de título, os botões de minimizar, maximizar e
  fechar ficam no corpo do app, "e comparando com verso a gente perde
  vários pixels verticais … a barra de título ela é inútil … para janelas
  menores isso impacta"; o mesmo no Mac, onde os botões da janela ficam à
  esquerda; "tem que tomar cuidado porque ao chamar a barra lateral direita
  corre o risco de botões ficarem escondidos" — conferir a barra lateral
  direita no Windows e a esquerda no Mac. Depois, sobre a proposta do
  autor: "pode escrever o ADR … e talvez já comece a implementar".
- Relacionados: [0065](0065-a-folder-per-window.md) (janelas de uma
  pasta), [0069](0069-windows-port.md) (Windows),
  [0071](0071-linux-port.md) (Linux),
  [0035](0035-cross-cutting-requirements.md) (acessibilidade).
- Status no briefing: não presente

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
conteúdo, numa posição que o app pode ajustar. No Windows ele oferece uma
janela sem decorações (`decorations: false`), cujos botões o app desenha e
cujas áreas de cima o app marca como arrastando a janela
(`data-tauri-drag-region`; um clique duplo ali maximiza). Uma janela sem
decorações no Windows 11 perde o menu de Snap Layouts que aparece quando o
ponteiro para sobre maximizar, a menos que um plugin desenhe esse botão
(`tauri-plugin-decorum`, da comunidade, MIT).

## Decisão

Proposto pelo autor.

1. **macOS: os botões do sistema sobre o app.** `titleBarStyle:
   "Overlay"`, `hiddenTitle: true`, em toda janela de uma pasta (`main`,
   `window-*`); o popout de uma nota e a janela de uma página web mantêm a
   sua. A faixa de cima do app reserva a largura dos botões à esquerda — o
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
3. **O Linux mantém a barra de título do sistema** até o porte dele (ADR
   0071).
4. **Conferido nos dois motores:** a faixa reservada com as barras
   laterais abertas e fechadas e numa janela estreita (um e2e por layout de
   plataforma, rodado com uma classe de plataforma forçada), e a olho no Mac
   e na máquina Windows — mover, maximizar, encaixar numa borda da tela,
   redimensionar por cada borda.

## Consequências

- Uns 30 px a mais de altura no macOS e no Windows, em toda janela de uma
  pasta.
- O nome da janela deixa de ser mostrado pelo sistema: o nome da pasta
  continua na faixa de cima do app e na barra de tarefas ou no Dock.
- No Windows o app passa a cuidar do que o sistema dava de graça (estados
  de hover, clique duplo, foco de teclado dos botões); cada um ganha um
  teste ou uma conferência a olho.

## Alternativas descartadas

- **Manter a barra de título do sistema**: o custo que o mantenedor
  apontou.
- **Uma barra de título do próprio app no macOS também**: o overlay
  mantém os botões do sistema, o comportamento e a acessibilidade deles.

## Status

Proposto. `[ABERTO]`: no Windows, botões desenhados pelo app sem Snap
Layouts, ou o `tauri-plugin-decorum`, que mantém os Snap Layouts ao custo
de uma dependência da comunidade — o autor recomenda o plugin se ele passar
no `cargo-deny` e funcionar com o Tauri 2.11, senão os botões do próprio
app.
