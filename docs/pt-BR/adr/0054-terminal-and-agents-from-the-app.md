# ADR 0054 — A linha de comando e os agentes, ligados pelo app

- Data: 2026-09-24
- Fonte: o mantenedor, em sessão, em 2026-09-24 ("na tela de settings
  deveria ter opção de habilitar o cli/mcp e aproveitar e simplificar a
  instalação do path pra funcionar os comandos verso no terminal") e duas
  respostas, registradas no memo
  [`reference/views-decision.md`](../reference/views-decision.md), seção 5;
  [0042](0042-open-from-command-line.md) (`verso <pasta>`),
  [0018](0018-llm-native-mcp-in-core.md) e
  [0045](0045-server-and-mcp-security.md) (MCP, só leitura),
  [0051](0051-development-flow-and-releases.md) (versões),
  [0026](0026-core-ui-contract-inviolable-rules.md) regra 4
- Status no briefing: ausente

## Contexto

A linha de comando sai num arquivo próprio ao lado do app, e quem quer o
`verso` num terminal o descompacta, tira a quarentena e o põe no `PATH` à mão
(README, "Para instalar uma"). O `verso mcp <pasta>` serve uma pasta a um
agente por stdio; um cliente como o Claude Desktop o inicia a partir de uma
entrada escrita à mão no arquivo de configuração dele, com o caminho da
pasta. O mantenedor pediu os dois pelos ajustes.

## Decisão

**Decidido em 2026-09-24 pelo mantenedor**, em sessão, escolhendo entre
opções que o autor apresentou com a sua recomendação:

1. **A linha de comando é ligada pelos ajustes** — a recomendação: a linha
   de comando vai dentro do app, ao lado do binário dele, e Ajustes →
   Terminal e agentes a liga como `/usr/local/bin/verso`, no `PATH` de todo
   shell (`/etc/paths`), como os editores instalam os seus. Onde essa pasta
   não é da pessoa, o macOS pede uma senha de administrador, uma vez.
2. **Um agente é ligado num clique, com o que entra mostrado antes** — a
   recomendação: "Adicionar ao Claude Desktop" mostra a entrada que vai
   gravar e, num sim, a grava no arquivo de configuração do Claude Desktop,
   deixando ao lado uma cópia do arquivo como estava; a entrada para o Claude
   Code e para qualquer outro cliente é mostrada pronta para copiar.

Como o autor os construiu (o memo, seção 5):

- **A pasta é nomeada pela chave**, a que o app já dá a ela: a entrada
  inicia `verso mcp --key <chave>`, uma forma nova do comando. Nenhum caminho
  da pasta cruza para a janela nem vai para a configuração de um cliente
  (regra 4); o app e a linha de comando acham a pasta pelo sidecar do índice
  ([0011](0011-config-outside-tree-index-as-cache.md)).
- **O arquivo do cliente é gravado como uma nota**: lido e gravado pelo
  `verso-fs` — atomicamente, e só sobre a versão que foi lida — as outras
  chaves e servidores dele mantidos; um arquivo que não é JSON fica como
  está.
- **O link é feito com as ferramentas do próprio sistema** (`ln`,
  `readlink`, e `osascript` para a senha), como o "Mostrar no Finder" da
  janela usa o `open`: nenhum desses caminhos é da pasta (regra 5), e o app
  não lê arquivo próprio ali. A quarentena do download é tirada da linha de
  comando quando ela é ligada; outra coisa já naquele caminho só é
  substituída depois de perguntar; "Remover" tira só o link deste app.
  [ABERTO] Se o host deve fazer isso pelo `std::fs`, com uma exceção
  declarada no seu próprio `clippy.toml`, em vez das ferramentas do sistema
  — a leitura viu as ferramentas como um contorno do guardrail (o memo,
  seção 8): cabe ao mantenedor decidir.
- **A versão põe a linha de comando dentro do app** e assina o pacote de
  novo, ad hoc como antes; o arquivo separado continua.

## Consequências

- O `verso` funciona num terminal novo depois de um clique; `verso .` abre a
  pasta no app ([0042](0042-open-from-command-line.md)).
- Um cliente ligado pelo app lê a pasta pelo servidor só de leitura do
  [0045](0045-server-and-mcp-security.md): nada que ele pede é gravado.
- A linha de comando de uma beta é da beta: ligada pela beta, o `verso` abre
  o Verso Beta; o link segue o último app que o criou.
- Só o Claude Desktop recebe escrita, e só no sim da pessoa; os outros
  clientes recebem o texto para colar.
- Windows e Linux: o link e a entrada em um clique são macOS primeiro; o
  Linux tem os mesmos caminhos sem o pedido de senha, o Windows espera o
  porte dele.

## Alternativas descartadas

- **`~/.local/bin` e uma linha no `~/.zprofile`** — sem senha, mas o app
  escreveria no arquivo do shell da pessoa; apresentada ao mantenedor e
  deixada de lado.
- **Só instruções**, o app não escrevendo nada fora dele — apresentada ao
  mantenedor e deixada de lado.
- **Só copiar, para os agentes**, nenhum arquivo de outro app gravado —
  apresentada ao mantenedor e deixada de lado.

## Status

Aceito em 2026-09-24 pelo mantenedor, em sessão: os pontos 1 e 2 da Decisão.
O resto é do autor, construído sob ela e marcado como tal no memo.
