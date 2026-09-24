# Memorando de decisão: o grupo dos handles opacos da ADR 0044

- Data: 2026-09-24
- Estado: **não decidido.** Opções e uma recomendação, identificadas como
  tais; o mantenedor decide (`CLAUDE.md` §1). Nenhum código segue este
  memorando: ele pergunta se registra o que o código já faz, ou não.
- A questão: a [ADR 0044](../adr/0044-verso-fs-semantics.md) mantém o terceiro
  grupo, "handles opacos", `[ABERTO]`, a decidir antes da feature 6 e antes do
  item 2.1 da Fase 2. Os dois estão construídos. O
  [memorando do app](app-decision.md), seção 10, o lista entre o que ainda
  espera.

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

## 2. O que o código faz, e o que já mudou

- **O ponto 4 está feito.** A regra 4 da
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) foi emendada em
  2026-09-22: uma capacidade de acesso cruza só como handle opaco; a identidade
  de uma nota cruza como o caminho relativo à pasta; um caminho absoluto ou com
  `..` nunca cruza.
- **O ponto 3 é o que a feature 6 faz**, registrado como provisório na ADR
  0044: o agente nomeia notas pelo mesmo caminho relativo que o contrato usa; o
  handle nunca sai do processo.
- **Nenhuma capacidade cruza o contrato hoje.** A janela nomeia notas por
  caminho relativo em todo comando; o que a deixa ler e escrever é ser uma das
  views do próprio app, o que as capabilities do host conferem (revisão da fase
  2, B3). A `revision` que uma escrita leva não é uma capacidade: é o carimbo do
  que foi lido, para que a invariante 11 possa recusar uma escrita sobre um
  arquivo mudado.
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
| O que muda | o terceiro grupo da ADR 0044: decidido como construído, reaberto quando uma capacidade precisar cruzar | um tipo de handle no contrato, uma regra de tempo de vida, uma tabela no host |
| Quem precisa | ninguém antes do mobile (um bookmark do iOS, uma URI SAF do Android — [ADR 0025](../adr/0025-own-server-and-mobile-pwa.md)) ou de plugins com acesso a arquivos ([ADR 0016](../adr/0016-plugins-execution-and-capabilities.md)) | as mesmas pessoas, depois |
| Risco | o projeto espera o primeiro consumidor | um projeto feito sem consumidor contra o qual testar |

**Recomendação: (a)**, com a reabertura escrita na ADR: "antes que qualquer
coisa fora das views do próprio app ganhe acesso a arquivos — um plugin, um
cliente mobile, o `verso serve`".

## 4. O que este memorando não verificou

Nada novo foi executado: ele descreve o código e os documentos como estão.

## 5. Para o mantenedor

1. (a) ou (b).
