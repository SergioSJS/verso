# Memo de decisão: o grupo dos handles opacos do ADR 0044

- Data: 2026-09-24
- Status: **decidido pelo mantenedor em 2026-09-24**, na sessão, sobre a
  seção 5:
  1. **a opção (a)** — o terceiro grupo do ADR 0044 decidido como construído,
     para a Fase 2: as notas são nomeadas pelo caminho relativo, nenhuma
     capacidade cruza o contrato, e o `Handle` continua um índice numa tabela
     dentro do processo; o grupo é reaberto **antes que qualquer coisa fora
     das views do próprio app ganhe acesso a arquivos — um plugin, um cliente
     mobile, o `verso serve`**;
  2. dos textos discordantes da seção 2, **vale a decisão de 2026-09-22 do
     ADR 0045**: o identificador de nota pelo MCP é o caminho relativo à raiz.

  As recomendações do autor no dia, esta entre elas, foram apresentadas ao
  mantenedor numa lista só; a resposta: *"Tirando o plano de fazer vários PR,
  eu gosto das suas recomendações"*. Registrado no ADR 0044 (o grupo e o
  Status dele), no ADR 0026 e no ADR 0045 (os parágrafos desatualizados, cada
  um com uma linha de revisão), nas duas linhas do [roadmap](../roadmap.md)
  sobre handles e na linha do 0044 no [índice dos ADRs](../adr/README.md).
  Nenhum código segue este memo: ele perguntava se registrava o que o código
  já faz, ou não.
- Reabertura respondida em 2026-10-09 para o `verso serve`, pela
  aceitação do [ADR 0073](../adr/0073-self-hosted-server-first.md) pelo
  mantenedor: uma nota continua nomeada pelo caminho relativo; num
  servidor a capacidade de acesso é a sessão e o papel dela na pasta,
  conferidos antes de o `verso-fs` agir; anexos são servidos em
  `/f/<id-da-pasta>/<caminho relativo>` atrás dessa checagem; nenhuma
  capacidade por arquivo cruza. Registrado no
  [ADR 0044](../adr/0044-verso-fs-semantics.md), "Num servidor". Um plugin
  e um cliente mobile nativo ainda reabrem o grupo; a URL pré-assinada de
  um bucket segue `[ABERTO]` no item 4 do ADR 0073.
- Escrito pelo Opus 5.5 durante a noite, o autor que o
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá aos documentos
  ("Opus 5"); lido por uma sessão nova do Opus 5.5 no lugar do Fable 5.1, o
  leitor que o ADR 0032 dá a eles, por decisão do mantenedor de 2026-09-23
  (`../review/phase-2.md` §6, item 17), e corrigido depois dessa leitura.
- A questão: o [ADR 0044](../adr/0044-verso-fs-semantics.md) mantém o terceiro
  grupo, "handles opacos", `[ABERTO]`, a decidir antes da feature 6 e antes do
  item 2.1 da Fase 2. Os dois estão construídos. O
  [memo do app](app-decision.md), seção 10, o lista entre o que ainda espera.

## 1. O que o grupo pergunta

1. O que um handle identifica: um descritor aberto (`openat`, imune a um
   caminho trocado entre a checagem e o uso) ou um índice numa tabela de
   caminhos.
2. Se sobrevive a um reinício, a um renomear, a uma troca de raiz do
   workspace.
3. O que um agente recebe pelo MCP como identificador de nota, e se é o handle
   do contrato.
4. Se o identificador estável acabar sendo o caminho relativo, a regra 4 tem
   que dizer isso.

## 2. O que o código faz, e o que os documentos dizem

- **O ponto 4 está feito.** A regra 4 do
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) foi emendada em
  2026-09-22: uma capacidade de acesso cruza só como handle opaco; a identidade
  de uma nota cruza como o caminho relativo à pasta; um caminho absoluto ou com
  `..` nunca cruza.
- **O ponto 3: os documentos discordam sobre ele.** O
  [ADR 0045](../adr/0045-server-and-mcp-security.md) lista
  "Identificador de nota: o caminho relativo à raiz…" entre as respostas que o
  mantenedor decidiu em 2026-09-22. O ADR 0044 ainda chama essa metade de
  provisória e o grupo de `[ABERTO]`; o ADR 0026 mantém um parágrafo dizendo que
  a regra 4 "**não** é reescrita aqui" e cabe ao PR que fecha o grupo do 0044,
  embora a emenda acima tenha acontecido; e o ADR 0045 mantém um parágrafo mais
  antigo que a chama de provisória. Este memo registra a contradição e não
  escolhe um lado (`CLAUDE.md` §1.3). *(O mantenedor escolheu em 2026-09-24:
  vale o texto do ADR 0045 — o cabeçalho.)*
- **Nenhuma capacidade cruza o contrato hoje.** A janela nomeia notas por
  caminho relativo em todo comando; o que a deixa ler e escrever é ser uma das
  views do próprio app, o que as capabilities do host conferem
  (`docs/review/phase-2.md`, leitura 1, achado 3). A `revision` que uma escrita
  leva não é uma capacidade: é o carimbo do que foi lido, para que a invariante
  11 possa recusar uma escrita sobre um arquivo mudado.
- **Pontos 1 e 2, como construídos.** Dentro do `verso-fs`, um `Handle` é um
  índice na tabela de caminhos relativos da raiz, válido só para aquele `Root`,
  só neste processo; todo uso passa de novo pelo caminho. Não sobrevive a um
  reinício, e depois de um renomear continua nomeando o caminho antigo. A janela
  entre checar um caminho e usá-lo continua aberta — e os symlinks são seguidos
  para onde apontarem, por decisão (ADR 0044), então uma travessia estilo
  `openat` não confinaria nada a mais para a própria pasta do usuário.

## 3. As opções

| | (a) Registrar o código como a decisão para a Fase 2 | (b) Projetar handles de capacidade agora |
|---|---|---|
| O que muda | o terceiro grupo do ADR 0044 decidido como construído, reaberto quando uma capacidade precisar cruzar; os parágrafos desatualizados do ADR 0026 e do ADR 0045, as duas linhas do roadmap sobre handles e a linha do 0044 no índice dos ADRs acertados | um tipo de handle no contrato, uma regra de tempo de vida, uma tabela no host |
| Quem precisa | ninguém antes de um cliente mobile ([ADR 0025](../adr/0025-own-server-and-mobile-pwa.md)) que guarde um bookmark com escopo de segurança do iOS ou uma URI SAF do Android ([ADR 0009](../adr/0009-external-constraints.md), regra 4 do ADR 0026), ou de plugins com acesso a arquivos ([ADR 0016](../adr/0016-plugins-execution-and-capabilities.md)) | os mesmos, depois |
| Risco | o projeto espera o primeiro consumidor | um projeto feito sem consumidor contra o qual testar |

**Recomendação: (a)**, com a reabertura escrita no ADR: "antes que qualquer
coisa fora das views do próprio app ganhe acesso a arquivos — um plugin, um
cliente mobile, o `verso serve`".

## 4. O que este memo não verificou

Nada novo foi executado: ele descreve o código e os documentos como estão.

## 5. Para o mantenedor

1. (a) ou (b).
2. Qualquer que seja: qual dos textos discordantes da seção 2 vale.

Respondido em 2026-09-24: (a), e vale o texto do ADR 0045 (o cabeçalho).
