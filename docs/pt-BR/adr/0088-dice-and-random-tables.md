# ADR 0088 — Dados e tabelas aleatórias: `dice:` numa nota rola, o resultado nunca escrito

- Data: 2026-10-14
- Fonte: o mantenedor, em 2026-10-14 às 11:36 UTC, mandando um plano de
  features novas rascunhado com outro assistente cujo quinto item são
  dados e oráculos, reaproveitando o rolador de dados do próprio
  mantenedor, o Rolai (`github.com/SergioSJS/rolai`): uma rolagem no
  texto que não muda o arquivo, uma gaveta lateral, ou um comando de
  barra. A leitura em sessão naquela manhã propôs a forma inline com a
  sintaxe do plugin Dice Roller da comunidade do Obsidian, o resultado
  nunca escrito, mostrado a uma sala pela presença, e tabelas aleatórias
  juntadas com a [0036](0036-tabletop-rpg-support.md). A resposta do
  mantenedor naquela noite, sobre a lista inteira: *"VAI SER TUDO NA
  V1"*. Escrita por Opus 5.5; a ser lida pelo outro modelo antes de ser
  aceita ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0036](0036-tabletop-rpg-support.md) (a tabela aleatória
  como ação de rolagem, Proposta), [0003](0003-primitives-not-workarounds.md)
  (o que precisa de plugin é primitiva), [0012](0012-files-are-source-of-truth.md)
  (abrir nunca escreve), [0030](0030-base-dialect-obsidian-compatible.md)
  (o dialeto estendido, nunca contradito), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (salas), [0005](0005-license.md) (MPL-2.0; a allowlist de licenças do
  npm), [0009](0009-external-constraints.md), [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente; a tabela aleatória da
  [0036](0036-tabletop-rpg-support.md) é `PROPOSTO` lá; ao ser aceita.

## Contexto

O que existe. Nada rola dados no Verso: nenhum `dice` em `app/ui/src` ou
`crates`. O código inline de uma nota é desenhado como código. Uma sala
repassa a presença — o cursor e o nome de cada janela — carimbada pelo
servidor com a conta de quem mandou (`crates/verso-server/src/presence.rs`),
e não guarda nada dela. Um bloco de uma nota pode levar um `^id` (Q3, Q21
da spec), e uma tabela ou uma lista é um bloco.

O Rolai é do mantenedor: um rolador de dados multijogador para jogos de
mesa (rolagens 3D, salas por link, um modo OBS), em TypeScript, sob a
**licença MIT** — conferida no GitHub em 2026-10-14 (`gh api repos/SergioSJS/rolai`:
`"license": "MIT"`). O parser de notação e o rolador dele são um pacote
próprio, `packages/rules-engine` (`@rolai/rules-engine`: `parser.ts`,
`roller.ts`, `rng.ts`, `profile.ts`), cuja única dependência, `yaml`, já
é dependência da janela do Verso (`app/ui/package.json`).

O plugin Dice Roller da comunidade do Obsidian escreve uma rolagem como
código inline, `` `dice: 1d20+3` ``, e rola uma linha de uma tabela ou de
uma lista nomeada por uma referência de bloco — como a leitura de
2026-10-14 se lembrou, ainda não conferido contra o README público do
plugin para esta ADR (item 1). Um vault que o usa mostra esse código como
código onde quer que o plugin esteja ausente.

## Decisão

Proposta (2026-10-14). Aceita em 2026-10-14 (Status): cada `[ABERTO]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`.

1. **A sintaxe é a forma inline do Dice Roller**, `` `dice: <notation>` ``,
   para que um vault que já usa o plugin role no Verso, e uma nota escrita
   no Verso role no Obsidian com o plugin e se leia como código sem ele. É
   código inline: nada no dialeto muda de significado
   ([0030](0030-base-dialect-obsidian-compatible.md)). `[DECIDIDO 2026-10-14]`: a
   notação lida além de `NdM±K`. Decidido: **o que o parser do Rolai
   lê que o README do Dice Roller documenta com o mesmo significado** —
   manter e descartar, explodir, um dado fudge, `d%` — conferido contra o
   README antes de construir ([0009](0009-external-constraints.md):
   documentação pública); uma forma que um lê e o outro não fica código,
   nunca uma rolagem diferente.
2. **Uma rolagem nunca é escrita no arquivo.** Na visualização de leitura
   e no Live Preview o código é desenhado como um botão de dado com a
   notação dele; um clique ou Enter rola e mostra o resultado ao lado num
   card pequeno — o total, cada dado, o modificador — com "Rolar de novo".
   Abrir, rolar e fechar não escrevem nada (invariante 7).
3. **Tabelas aleatórias são Markdown comum.** Uma tabela ou uma lista com
   um `^id` é uma tabela aleatória; `` `dice: [[Note#^id]]` `` — a forma
   conferida contra o README do Dice Roller com o item 1 — rola uma linha
   e a mostra, os links dela seguidos com um clique. Nenhum tipo de nota e
   nenhum formato de arquivo próprio do Verso: a tabela se lê como tabela
   em todo lugar. `[DECIDIDO 2026-10-14]`: linhas de chance desigual. Decidido:
   **uma primeira coluna cujo cabeçalho é um dado (`d100`, `2d6`) guarda a
   faixa de cada linha** (`01–05`, `7`), como as tabelas impressas fazem;
   qualquer outra tabela, toda linha igualmente provável. Isso responde à
   "tabela aleatória como tipo de nota com ação de rolagem" da
   [0036](0036-tabletop-rpg-support.md) com uma tabela no lugar de um tipo
   — registrado lá quando aceita.
4. **Uma rolagem numa sala é vista pela sala.** `[DECIDIDO 2026-10-14]`: quem sorteia o
   número quando há outros presentes. Decidido: **o servidor**, numa
   sala — a janela pede, o servidor rola com o próprio gerador e repassa o
   resultado carimbado com a conta, como carimba a presença, então
   nenhuma janela pode mostrar uma rolagem que ela escolheu; sozinho,
   offline ou numa pasta do computador, a janela rola. Uma sala guarda as
   últimas rolagens na memória para quem entra, e nada é armazenado.
5. **O motor do Rolai é reaproveitado.** `[DECIDIDO 2026-10-14]`: como. Decidido:
   **o parser e o rolador dele copiados para a janela**
   (`app/ui/src/dice/`), o aviso da MIT mantido nos arquivos, no lugar de
   uma dependência de um pacote não publicado no npm; nenhuma dependência
   de runtime nova. A rolagem 3D, as salas por link e o modo OBS ficam
   com o Rolai.
6. **Um rolador sem nota.** `[DECIDIDO 2026-10-14]`: um comando "Rolar dados…" que abre
   um rolador pequeno, uma notação digitada e rolada, nada escrito.
   Decidido: **sim**, na paleta de comandos; uma gaveta como a do Rolai
   depois.
7. **A aleatoriedade** vem do gerador criptográfico da plataforma
   (`crypto.getRandomValues` na janela, o do sistema no servidor),
   uniforme, sem viés de módulo.
8. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
   o botão se chama "Rolar 1d20+3"; um resultado é anunciado numa região
   viva educada ("1d20+3: 17 — 14 mais 3"); uma rolagem de outro membro é
   anunciada com o nome dele; pt-BR e inglês em tudo.

## Consequências

- A janela ganha o widget de dados, o card, o comando e o motor copiado,
  com testes unitários da notação e da distribuição; o `verso-server`
  ganha um comando de rolagem e o repasse dele numa sala; os tipos do
  contrato são gerados como sempre (invariante 3).
- As Consequências da [0036](0036-tabletop-rpg-support.md) dizem que
  nenhuma feature de RPG de mesa entra no core como caso especial — só por
  primitivas, packs de schema ou plugin. Esta ADR trata dados e tabelas
  aleatórias como primitivas no sentido da [0003](0003-primitives-not-workarounds.md),
  de uso fora de jogos também; se isso satisfaz a 0036 é do mantenedor
  dizer ao aceitá-la.
- O cofre de exemplo ganha uma nota com rolagens e uma tabela aleatória
  ([0058](0058-demo-vault-as-tutorial.md)); o changelog ganha a sua linha.

## Alternativas descartadas

- **Um comando de barra que insere o resultado no texto** (levantada no
  plano de 2026-10-14): a leitura propôs o resultado nunca escrito, para
  que uma rolagem não mude arquivo nenhum; item 2.

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondendo a
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na V1
(`docs/roadmap.md`, Fase 4 — V1). A [0036](0036-tabletop-rpg-support.md) ganha uma linha de Revisões: dados, tabelas aleatórias, blocos secretos e mapas entram como primitivas. O [0101](0101-3d-dice-physics-overlay.md) revisa o item 5: dados 3D são admitidos como módulo opcional sob demanda sob o preset RPG ([0103](0103-feature-presets-and-capability-flags.md)).

**Respondido durante a construção (2026-10-14, o mantenedor: "Sim, todas").** As perguntas que a construção levantou, respondidas como recomendado (*"Aceita todas as recomendações acima (P1–P5, M1–M6, I1–I7, D1–D11, G1–G4)?"*): D1 — o ADR citava explodir (`1d6!`) e `d%` enquanto o Rolai não lia nenhum dos dois: os dois são lidos, no parser da janela e no do servidor, com o sentido do README do Dice Roller, uma cadeia de explosões limitada a 100 dados acrescentados numa rolagem, o mesmo nos dois lados (construído naquela noite); D2 a D11, como construído — as duas formas do link de uma tabela, `[[Nota^id]]` e `[[Nota#^id]]`; o cabeçalho `dice: 1d20`; `00` vale 100, e listas como `13,14` são lidas; uma tabela de uma linha é recusada; numa sala o servidor rola mesmo com você sozinho; quem só lê pode rolar; o rolador da paleta rola só na sua janela; a sua rolagem não mostra o seu nome; os limites de 100 dados e 1000 lados.

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Na V1 pela palavra do mantenedor de
2026-10-14 (*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: a notação (item 1), linhas
desiguais (item 3), quem rola numa sala (item 4), como o motor do Rolai é
reaproveitado (item 5), o rolador sem nota (item 6), e se primitivas
satisfazem as Consequências da [0036](0036-tabletop-rpg-support.md).
