# Memorando de decisão: `<iframe>`, `<video>` e `<audio>` numa nota (spec Q6)

- Data: 2026-09-24
- Estado: **não decidido.** Opções e recomendações, identificadas como tais; o
  mantenedor decide (`CLAUDE.md` §1). Nenhum código segue este memorando: o
  que uma nota pode carregar na janela é uma fronteira de segurança, e isso
  espera a resposta.
- A questão: a Q6 da spec ([spec do dialeto](../spec/dialect.md), seção 9)
  mantém `[ABERTO]` o HTML embutido que a documentação pública do Obsidian
  mostra numa nota e a janela descarta — `<iframe>`, `<video>`, `<audio>`. A
  resposta de 2026-09-23 se apoiou em "a visualização de leitura segue o
  Obsidian", o que não vale para esses três (`docs/review/phase-2.md` §7).

## 1. O que a janela faz hoje

O HTML do core só chega à página por uma allowlist
(`app/ui/src/sanitize.ts`): uma nota de uma pasta compartilhada é entrada não
confiável ([ADR 0045](../adr/0045-server-and-mcp-security.md)), então o que
roda, carrega, estiliza a página ou embute outra página é descartado com tudo
o que contém. `iframe`, `video`, `audio`, `source` e `track` estão nessa
lista. Uma nota que embute um vídeo dos anexos, ou um mapa de um site, não
mostra nada no lugar.

A regra de rede é a [ADR 0050](../adr/0050-outbound-network-access.md): a
janela só pede à rede endereços escritos nas notas ou clicados, e um ajuste
"carregar conteúdo remoto" cobre o que carrega sem clique (hoje uma imagem
remota e o ícone de uma nota web).

## 2. O que cada elemento traz

| | `<video>` / `<audio>` da pasta | `<video>` / `<audio>` da web | `<iframe>` |
|---|---|---|---|
| Uso típico | um clipe ou uma gravação nos anexos | um arquivo num site | um mapa, um player de vídeo, uma planilha de um site |
| Roda código na janela | não (elemento de mídia; `controls`, sem scripts) | não | sim, no quadro — a própria página do site |
| Chega à rede | não (o protocolo de arquivos do app) | sim, quando mostrado | sim, quando mostrado; e o que a página do site pedir |
| Chega aos comandos | não | não | não com as capabilities do host, que só respondem às views do próprio app (revisão da fase 2, B3); um quadro remoto não é uma delas |
| O que pode dar errado | um arquivo grande carregado quando a nota é mostrada | como uma imagem remota: um pedido que o usuário não clicou | uma página que parece parte do app (um formulário de login), rastreamento, páginas pesadas, e o quadro navegando sozinho |

## 3. As opções

### 3.1 `<video>` e `<audio>`

| | (a) Continuar descartando | (b) Permitir, com as fontes resolvidas como imagens |
|---|---|---|
| Arquivo local | nada mostrado | tocado pelo protocolo de arquivos do app, como `![[clipe.mp4]]` seria |
| Arquivo remoto | nada mostrado | carregado só com "carregar conteúdo remoto" ligado; desligado, vira um link, como uma imagem remota (ADR 0050) |
| Atributos mantidos | — | `src`, `controls`, `loop`, `muted`, `poster` (resolvido como `src`), `preload`, `width`, `height`; `autoplay` descartado |

**Recomendação: (b).** Segue o Obsidian no caso comum — mídia no vault — e
não acrescenta acesso à rede que o ajuste já não governe.

### 3.2 `<iframe>`

| | (a) Continuar descartando | (b) Um clique para carregar, conteúdo remoto ligado | (c) Carregar como escrito, conteúdo remoto ligado |
|---|---|---|---|
| O que a nota mostra | nada | uma caixa com o endereço do site e um botão; o quadro carrega no clique | o quadro |
| Rede | nenhuma | no clique (ADR 0050 ponto 1: clicado pelo usuário) | quando a nota é mostrada |
| Quadro | — | `sandbox` com scripts e a origem do próprio site, sem navegação do topo, sem pop-ups, sem formulários chegando ao app; só `https:` | como (b) |
| Risco | nenhum | uma página que imita o app, depois do clique | o mesmo, sem clique |

**Recomendação: (b)**, e (a) enquanto isso. Um quadro é o único elemento aqui
que roda código de outra pessoa na janela; um clique o mantém um ato do
usuário, como a ADR 0050 pede de tudo o que não está ajustado para carregar
sozinho.

## 4. O que este memorando não verificou

- O tratamento que o próprio Obsidian dá a esses elementos além da
  documentação pública (que os mostra numa nota) não foi observado: o que ele
  põe em sandbox, e se pergunta antes de carregar, não foi conferido (a ADR
  0009 permite observar de fora; não foi feito para este memorando).
- A política de segurança de conteúdo da janela não foi relida para fontes de
  mídia e de quadro; qualquer que seja a opção escolhida, a política também
  precisa permiti-la, e isso é uma segunda mudança.

## 5. Para o mantenedor

1. `<video>` / `<audio>`: (a) ou (b).
2. `<iframe>`: (a), (b) ou (c).
