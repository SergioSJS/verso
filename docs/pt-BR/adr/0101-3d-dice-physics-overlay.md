# ADR 0101 — Camada de rolagem de dados em 3D com física: módulo WebGL sob demanda, pouso determinístico e revisão do ADR 0088

- Data: 2026-10-17
- Fonte: o mantenedor, em sessão em 2026-10-17, fazendo referência ao aplicativo
  Rolai do próprio mantenedor (`/Users/sergio.sousa/Projects/person/tabletop-rpg/rolai`):
  *"inclusive adicionando por exemplo rolagem de dados em 3D quando usar o
  padrão de rolar dado ele puxar uns dados 3D e rolar na tela eu inclusive
  posso deixar aqui o link do código do rola aí que talvez ajude a inspirar
  essa parte de rolagem 3D, também vai ser bem importante."* Revisado por
  Claude Opus 5.5 em 2026-10-17 (`review_adrs_0098_0102.md`) para registrar
  formalmente a revisão do item 5 do ADR 0088, isolar a renderização 3D em um
  chunk carregado sob demanda com cache offline, aplicar travas de bateria/mobile
  e desacoplar anúncios de leitor de tela das animações visuais.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md),
  [0092](0092-the-phone-offline.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Estado no briefing: não presente; aprimoramento visual opcional em 3D.

## Contexto

O [ADR 0088](0088-dice-and-random-tables.md) introduziu fórmulas de dados inline
(`dice: 1d20+3`) e tabelas aleatórias copiando o analisador sintático e o motor
estatístico do Rolai (`SergioSJS/rolai`). O item 5 do ADR 0088 decidiu: *"seu
analisador e rolador copiados para a janela; nenhuma nova dependência em tempo
de execução; a rolagem 3D… fica no Rolai"*.

No entanto, em partidas de RPG de mesa, a sensação tátil de rolar dados físicos
gera forte engajamento emocional e imersão. O cliente web do Rolai implementa
uma caixa de dados 3D usando Three.js com física autêntica e pouso determinístico.

Adicionar renderização WebGL introduz peso significativo ao pacote (~200–250 KB
compactado) e consumo de GPU. Se carregado indiscriminadamente, comprometeria a
bateria em dispositivos móveis ([0092](0092-the-phone-offline.md)) e o tempo de
abertura do aplicativo ([0035](0035-cross-cutting-requirements.md)). Este ADR
revisa o item 5 do ADR 0088 definindo os dados 3D como um **subpacote opcional
carregado sob demanda** governado pelos presets de capacidade
([0103](0103-feature-presets-and-capability-flags.md)).

## Decisão

Proposto (2026-10-17). O primeiro texto dizia que fora aceito naquele dia, com
cada item marcado `[DECIDED 2026-10-17]`; nenhuma aceitação do mantenedor está
registrada, e em 2026-10-20 ele voltou a Proposto: cada item assim marcado é
uma proposta (a revisão de 2026-10-20, docs/review/).

1. **Revisão do item 5 do ADR 0088: dados 3D admitidos como módulo opcional sob demanda.**
   `[DECIDED 2026-10-17]`: O item 5 do ADR 0088 é revisado para permitir a camada de
   física 3D como uma extensão opcional. O pacote principal da janela continua 100%
   livre de Three.js. O motor 3D é empacotado em um chunk assíncrono carregado via
   `import()` dinâmico apenas quando a capacidade está ligada e uma rolagem ocorre.
   O service worker armazena o chunk em cache para uso offline
   ([0092](0092-the-phone-offline.md)).

2. **Pouso com física determinística alinhado à rolagem matemática.**
   `[DECIDED 2026-10-17]`: O motor de física nunca sorteia números aleatórios. O
   desfecho numérico é determinado previamente pelo gerador criptográfico
   ([0088](0088-dice-and-random-tables.md) item 7) ou pelo servidor UniVerso em uma
   sala compartilhada ([0088](0088-dice-and-random-tables.md) item 4). As faces
   calculadas são entregues ao renderizador 3D com notação de pouso forçado (ex.:
   `2d20@18,4`), garantindo que o giro e as colisões sempre pousem no resultado exato.

3. **Limites de renderização, desempenho e gestão de contexto.**
   `[DECIDED 2026-10-17]`:
   - **Teto de dados**: O overlay 3D renderiza até 20 dados simultâneos. Rolagens
     que excedam 20 dados ou cadeias de explosão (`1d6!`) ignoram o canvas 3D e
     exibem diretamente o cartão 2D.
   - **Zero GPU em repouso**: Quando os dados param, o canvas esmaece e interrompe
     seu loop de quadros (`requestAnimationFrame`), consumindo 0% de GPU em repouso.
     A perda de contexto WebGL (`webglcontextlost`) é tratada graciosamente.
   - **Pular animação**: Um clique em qualquer lugar da tela encerra a animação de
     física instantaneamente e exibe o cartão final.

4. **Transmissão de eventos em salas com múltiplos jogadores ([0082](0082-live-co-editing-of-a-synced-folder.md)).**
   `[DECIDED 2026-10-17]`: Em uma sala, o servidor avalia a rolagem e transmite
   o resultado como mensagem efêmera com ID único. Participantes recebem o evento e
   animam os dados simultaneamente. Membros que entram depois não reexecutam animações
   antigas, preservando a agilidade da interface.

5. **Presets de capacidade, proteção móvel e acessibilidade ([0035](0035-cross-cutting-requirements.md), [0103](0103-feature-presets-and-capability-flags.md)).**
   `[DECIDED 2026-10-17]`:
   - Dados 3D estão ativos exclusivamente no preset `rpg`. Nos modos `writing` e
     `worldbuilding`, os dados 3D permanecem desativados.
   - Em dispositivos móveis, modo de economia de bateria ou quando
     `prefers-reduced-motion` estiver ativo, os dados 3D vêm desativados por padrão.
   - Efeitos sonoros vêm desativados por padrão.
   - Anúncios para leitores de tela ([0088](0088-dice-and-random-tables.md) item 8)
     ocorrem **imediatamente** após o disparo em uma região ativa polida, sem nunca
     aguardar a parada física visual dos dados.

## Consequências

- O ADR 0088 recebe uma anotação expressa de Revisão documentando o módulo 3D opcional.
- `app/ui/src/dice/` fornece carregamento assíncrono para o overlay 3D sem inflar o
  pacote principal.
- Jogadores desfrutam de rolagens 3D imersivas, enquanto escritores e usuários em
  celulares mantêm zero consumo desnecessário de bateria ou desempenho.

## Alternativas descartadas

- **Embutir Three.js diretamente no pacote principal do app**: Rejeitado porque
  250 KB gz extras violam o orçamento de desempenho para anotações puras.
- **Deixar colisões físicas definirem os resultados**: Rejeitado porque a física
  diverge entre diferentes navegadores e dispositivos, além de ser vulnerável à
  dessincronização em salas multiplayer.

## Estado

**Proposto (2026-10-17)**; de volta a Proposto em 2026-10-20, nada construído.
Reescrito com o mantenedor antes de qualquer código.
