# Memo de decisão: `<iframe>`, `<video>` e `<audio>` numa nota (spec Q6)

- Data: 2026-09-24
- Status: **não decidido.** Opções e recomendações, identificadas como tais; o
  mantenedor decide (`CLAUDE.md` §1). Nenhum código segue este memo: o que
  uma nota pode carregar na janela é uma fronteira de segurança, e isso espera
  a resposta.
- Escrito pelo Opus 5.5 durante a noite, o autor que o
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá aos documentos
  ("Opus 5"); lido por uma sessão nova do Opus 5.5 no lugar do Fable 5.1, o
  leitor que o ADR 0032 dá a eles, por decisão do mantenedor de 2026-09-23
  (`../review/phase-2.md` §6, item 17), e corrigido depois dessa leitura.
- A questão: a Q6 da spec ([spec do dialeto](../spec/dialect.md), seção 9)
  mantém `[ABERTO]` o HTML embutido que a janela descarta — `<iframe>`,
  `<video>`, `<audio>` — com a premissa de que o Obsidian o mostra. Essa
  premissa vale só para `<iframe>`: a ajuda pública do Obsidian mostra
  `<iframe>` (as páginas "Embed web pages" e "HTML content", que também diz que
  o Obsidian sanitiza o HTML das notas); nenhuma página pública mostra
  `<video>` ou `<audio>` no HTML cru de uma nota — áudio e vídeo do vault estão
  documentados como embeds `![[…]]` — e se o Obsidian resolve um `src`
  relativo ao vault em HTML cru não foi observado. A spec repete a parte sem
  fonte; este memo a registra em vez de repeti-la.

## 1. O que a janela faz hoje

O HTML do core só chega à página por uma allowlist
(`app/ui/src/sanitize.ts`): uma nota de uma pasta compartilhada é entrada não
confiável ([ADR 0045](../adr/0045-server-and-mcp-security.md)), então o que
roda, carrega, estiliza a página ou embute outra página é descartado com tudo o
que contém. `iframe`, `video`, `audio`, `source` e `track` estão nessa lista,
e um `<img>` mantém só um endereço `https`/`http` ou `data:image` — um `src`
relativo não nomeia nada e sai. A janela também não tem embed de áudio ou vídeo
próprio (`![[clipe.mp4]]` não é desenhado como player hoje).

Mais três fronteiras ficam atrás da allowlist:

- A regra de rede, o [ADR 0050](../adr/0050-outbound-network-access.md): a
  janela chega à rede "só pelos quatro caminhos" que ele lista — a página de
  uma nota web, um link clicado, o ícone de uma nota web, uma imagem remota — e
  o ajuste "carregar conteúdo remoto" cobre os dois que não pedem clique.
- A política de segurança de conteúdo (`app/src-tauri/tauri.conf.json`): mídia
  só do protocolo de arquivos do app, quadros só do protocolo de arquivos do
  app.
- A guarda de navegação (`may_navigate`, `app/src-tauri/src/lib.rs`): as views
  do próprio app podem ir às páginas do app e ao protocolo de arquivos, nunca a
  `https:`; e ela é consultada para todo quadro, não só o da janela (o wry não
  passa o quadro para ela).

## 2. O que cada elemento traz

| | `<video>` / `<audio>` da pasta | `<video>` / `<audio>` da web | `<iframe>` |
|---|---|---|---|
| Uso típico | um clipe ou uma gravação nos anexos | um arquivo num site | um mapa, um player de vídeo, uma planilha de um site |
| Roda código na janela | não (um elemento de mídia; `controls`, sem scripts) | não | sim, no quadro — a própria página do site |
| Chega à rede | não (o protocolo de arquivos do app) | sim, quando mostrado | sim, quando mostrado; e o que a página do site pedir |
| Chega aos comandos | não | não | não com as capabilities do host, que só respondem às views do próprio app (`docs/review/phase-2.md`, leitura 1, achado 3); um quadro remoto não é uma delas |
| O que pode dar errado | um arquivo grande carregado quando a nota é mostrada; o protocolo de arquivos não atende pedidos de intervalo, e se o WebKit toca mídia por ele não foi conferido | como uma imagem remota: um pedido que o usuário não clicou | uma página que parece parte do app (um formulário de login), rastreamento, páginas pesadas, o quadro navegando sozinho |

## 3. As opções

### 3.1 `<video>` e `<audio>`

| | (a) Continuar descartando | (b) Permitir da pasta e, com conteúdo remoto ligado, da web |
|---|---|---|
| Arquivo local | nada mostrado | tocado pelo protocolo de arquivos do app: um `src` relativo resolvido a partir da nota, o que o sanitizador não faz para nenhum elemento hoje |
| Arquivo remoto | nada mostrado | carregado só com "carregar conteúdo remoto" ligado; desligado, vira um link, como uma imagem remota |
| Atributos mantidos | — | `src`, `controls`, `loop`, `muted`, `poster` (resolvido como `src`), `preload`, `width`, `height`; `autoplay` descartado |
| Muda um texto decidido | não | o ADR 0050: um vídeo ou áudio remoto é um quinto caminho para a rede, que o ajuste dele teria que cobrir |

**Recomendação: (b) para arquivos da pasta**, o que não acrescenta acesso à
rede; mídia remota como uma questão separada, já que emenda o ADR 0050. Se isso
"segue o Obsidian" não está estabelecido (veja acima).

### 3.2 `<iframe>`

| | (a) Continuar descartando | (b) Um clique para carregar, conteúdo remoto ligado | (c) Carregar como escrito, conteúdo remoto ligado |
|---|---|---|---|
| O que a nota mostra | nada | uma caixa com o endereço do site e um botão; o quadro carrega no clique | o quadro |
| Rede | nenhuma | no clique | quando a nota é mostrada |
| Quadro | — | `sandbox` com scripts e a origem do próprio site, sem navegação do topo, sem pop-ups; só `https:` | como (b) |
| Também muda | nada | as fontes de quadro da CSP; a guarda de navegação, que recusa `https:` para todo quadro das views do app e teria que distinguir o quadro de uma nota da própria janela; o ADR 0050 (um caminho novo para a rede, num clique) | o mesmo, e a regra do ADR 0050 de que nada carrega sem clique a não ser que o ajuste diga |
| Risco | nenhum | uma página que imita o app, depois do clique | o mesmo, sem clique |

**Recomendação: (b)**, e (a) enquanto isso. Um quadro é o único elemento aqui
que roda código de outra pessoa na janela, e a guarda de navegação que mantém a
janela nas páginas do próprio app precisa aprender a deixar um quadro sair sem
deixar a janela sair: isso é uma mudança a revisar por si só.

## 4. O que este memo não verificou

- O tratamento que o Obsidian dá a esses elementos além da ajuda pública não
  foi observado (o ADR 0009 permite observar de fora; não foi feito para este
  memo): o que ele põe em sandbox, se pergunta antes de carregar, e se um `src`
  relativo ao vault em HTML cru toca.
- Se o WebKit toca áudio e vídeo pelo protocolo de arquivos do app, que não
  responde a pedidos de intervalo.

## 5. Para o mantenedor

1. `<video>` / `<audio>` da pasta: (a) ou (b); da web: depois, ou com (b) e
   uma revisão do ADR 0050.
2. `<iframe>`: (a), (b) ou (c).
