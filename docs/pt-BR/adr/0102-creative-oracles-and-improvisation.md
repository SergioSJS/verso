# ADR 0102 — Oráculos criativos e improviso solo: respostas graduadas, faíscas de ideias e inserção em notas

- Data: 2026-10-17
- Fonte: o mantenedor, em sessão em 2026-10-17, priorizando RPG solo e ferramentas
  de escrita criativa antes de battle maps: *"inclusive eu prefiro dar uma
  atenção maior a fichas e oráculos e ferramentas de improviso do que battle
  maps por exemplo pra mim faz muito mais sentido e serve até de ferramenta de
  escrita criativa, não necessariamente só pra RPG então eu daria um destaque
  maior… coisas que o Poom Companion tem, para mim é muito mais útil."*
  Revisado por Claude Opus 5.5 em 2026-10-17 (`review_adrs_0098_0102.md`),
  reconstruído com calibração matemática formal, RNG criptográfico e inserção
  segura via transação do editor.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0030](0030-base-dialect-obsidian-compatible.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Estado no briefing: não presente; primitiva de improviso para RPG e escrita.

## Contexto

Escritores de ficção, mestres preparando sessões sem roteiro rígido e
jogadores de RPG solo frequentemente encontram bloqueios criativos (*"A passagem
está guardada?", "Qual motivação secreta move este PNJ?", "Qual complicação surge
quando a porta se destranca?"*).

Ferramentas analógicas consagradas (como Mythic Game Master Emulator, Ironsworn
e Plot Unfolding Machine) respondem perguntas fechadas com probabilidades
graduadas (Sim/Não com "e" / "mas") e provocam ideias abertas por meio de pares
de palavras conceituais (Ação + Tema, Descritor + Foco).

No entanto, assistentes existentes são proprietários, dependem de IA generativa
na nuvem ou integram mal com arquivos Markdown. Além disso, a inserção ingênua
diretamente em arquivos do sistema corrompe sessões colaborativas simultâneas
([0082](0082-live-co-editing-of-a-synced-folder.md)). O Verso necessita de um
motor de oráculo matematicamente calibrado, local-first e offline, que respeite
a compatibilidade com o Obsidian ([0030](0030-base-dialect-obsidian-compatible.md))
e o modelo de presets de capacidade ([0103](0103-feature-presets-and-capability-flags.md)).

## Decisão

Proposto (2026-10-17). Aceito em 2026-10-17 (Status): cada `[OPEN]` foi decidido conforme
recomendado e está marcado como `[DECIDED 2026-10-17]`.

1. **O modelo de probabilidade é uma tabela matemática balanceada de 6 resultados.**
   `[DECIDED 2026-10-17]`: Cada consulta recebe uma pergunta de sim/não e uma de
   cinco chances (`nearlyImpossible`, `unlikely`, `even`, `likely`,
   `nearlyCertain`). Uma rolagem d100 é avaliada contra a seguinte tabela,
   onde cada linha soma exatamente 100%:

   | Chance | Sim, e… | Sim | Sim, mas… | Não, mas… | Não | Não, e… |
   |---|:---:|:---:|:---:|:---:|:---:|:---:|
   | **Quase certo** | 18% | 54% | 18% | 2% | 6% | 2% |
   | **Provável** | 15% | 45% | 15% | 5% | 15% | 5% |
   | **50 / 50** | 10% | 30% | 10% | 10% | 30% | 10% |
   | **Improvável** | 5% | 15% | 5% | 15% | 45% | 15% |
   | **Quase impossível** | 2% | 6% | 2% | 18% | 54% | 18% |

   Extremos ("e") e complicações ("mas") ocupam cada um exatamente um quinto
   de seu respectivo lado, garantindo que a mudança de probabilidade module
   todas as faixas da curva, e não apenas o ponto médio.

2. **Faíscas de ideias usam vocabulários originais bilíngues e curados.**
   `[DECIDED 2026-10-17]`: Dois pares complementares de palavras são gerados sob
   demanda: **Ação + Tema** e **Descritor + Foco**. O vocabulário é composto por
   listas originais (24 entradas por categoria em português e inglês), evitando
   violação de propriedade intelectual de tabelas comerciais de RPG solo.
   Os sorteios são estruturalmente simétricos entre os idiomas.

3. **A aleatoriedade vem de CSPRNG criptográfico sem viés de módulo.**
   `[DECIDED 2026-10-17]`: Em conformidade com o item 7 do ADR 0088
   ([0088](0088-dice-and-random-tables.md)), o motor nunca utiliza `Math.random()`
   puro. As rolagens usam `crypto.getRandomValues` via a fonte aleatória criptográfica
   do Rolai, descartando sorteios enviesados além do último múltiplo exato de faces.
   Para testes automatizados determinísticos, o gerador aceita uma fonte injetável.

4. **A inserção na nota sempre ocorre via transação do editor, nunca pelo sistema de arquivos.**
   `[DECIDED 2026-10-17]`: Clicar em "Inserir na nota" gera um bloco de callout
   compatível com o Obsidian:
   ```markdown
   > [!oracle] A porta está trancada?
   > **Não, mas…** _(d100: 42, 50 / 50)_ 
   ```
   Crucialmente, a inserção é despachada como uma transação atômica do editor
   CodeMirror 6 (`leaf.editor.dispatch`) na posição do cursor local, nunca
   como uma escrita direta no disco. Isso garante segurança contra conflitos em
   salas colaborativas com Yjs ([0082](0082-live-co-editing-of-a-synced-folder.md)).
   O cursor do editor é posicionado automaticamente logo após o resultado,
   permitindo ao escritor continuar imediatamente a frase com a consequência narrativa.

5. **Presets de capacidade e degradação graciosa ([0103](0103-feature-presets-and-capability-flags.md)).**
   `[DECIDED 2026-10-17]`: A caixa de diálogo do oráculo e os comandos da
   paleta estão ativos nos presets `worldbuilding` e `rpg`. No modo `writing`,
   os comandos são ocultados da paleta e callouts `[!oracle]` existentes nas
   notas degradam graciosamente para citações normais sem botões de ação.

6. **Acessibilidade e internacionalização ([0035](0035-cross-cutting-requirements.md)).**
   `[DECIDED 2026-10-17]`: Todos os rótulos, chances, respostas e avisos são
   externalizados em `app/ui/src/oracle/strings.ts`. O seletor de chances implementa
   semântica WAI-ARIA `radiogroup` e `radio` com navegação por teclado. Resultados
   de rolagens são anunciados para leitores de tela por uma região ativa polida
   (`aria-live="polite"`), vocalizando o desfecho, o d100 e a chance configurada.

## Consequências

- `app/ui/src/oracle/` fornece a avaliação matemática pura (`engine.ts`),
  a interface de diálogo e inserção no editor (`dialog.ts`) e localização (`strings.ts`).
- Testes unitários (`app/ui/test/oracle.test.mjs`) verificam limites matemáticos,
  desfechos graduados, fontes aleatórias determinísticas e faíscas bilíngues.
- O recurso viabiliza improviso criativo completamente offline, sem dependência de
  IA externa ou conectividade de rede ([0003](0003-primitives-not-workarounds.md)).

## Alternativas descartadas

- **Fatores complexos de caos e gerenciadores de cenas (Mythic GME)**:
  Descartados para manter a primitiva simples, ágil e versátil tanto para
  escrita de romances quanto para sessões de RPG de mesa.
- **Escrita direta no sistema de arquivos para inserção de resultados**: Descartada
  porque dispara condições de corrida e conflitos concorrentes em salas com Yjs
  ([0082](0082-live-co-editing-of-a-synced-folder.md)).

## Estado

**Aceito (2026-10-17).**
