# ADR 0100 — Assistente de aparência: uma prévia ao vivo em Ajustes sobre os tokens reais, perfis salvos e arquivos `.verso-theme`

- Data: 2026-10-17; reescrita em 2026-10-21
- Fonte: o mantenedor, em sessão em 2026-10-17: *"Tem uma outra feature
  também que seria importante Da gente ter, é uma Espécie de wizard de
  customização visual aí é customizar o CSS padrão da aplicação a gente tem
  ali algumas opções eu acho ok mas eu acho bem fraquinho não diz muito ali os
  nomes, a pessoa tem que alterar pra ver e eu queria que tivesse um wizard
  que a pessoa conseguisse customizar e salvar esses perfis e exportar e
  importar não seria legal se tivesse isso também já adiciono essa
  funcionalidade na lista aí de coisas pra se fazer antes mesmo de battle
  mapping de zone token etc."* Em 2026-10-21, respondendo à revisão da
  rodada de RPG, que achou que só uma das onze propriedades da ADR existe
  no CSS da janela com aquele nome: *"Atualize a ADR pra refletir a
  realidade então"*. Este texto substitui o primeiro, escrito em 2026-10-17
  por outra IA e marcado como Aceito sem aceitação.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0050](0050-outbound-network-access.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0076](0076-the-window-on-every-screen.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Estado no briefing: não presente.
- Revisões: 2026-10-20 — o primeiro texto voltou a Proposta (dizia-se
  Aceito em 2026-10-17 sem aceitação registrada). 2026-10-21 — reescrita
  sobre os tokens reais da janela com as respostas 0100.0 a 0100.6 do
  mantenedor (marcando as opções do questionário de decisões de
  2026-10-20); Aceita. Os tokens do primeiro texto (`--bg`, `--card-bg`,
  `--border`, `--accent`, `--font-body`…), a sua janela flutuante, o seu
  diálogo de 15 segundos "Manter alterações?" e a sua importação só por
  arrastar saíram; a sua "tema recomendado na pasta" fica, agora por escolha
  explícita do mantenedor (item 3). 2026-10-21, depois — **item 2 revisado
  pelo mantenedor** depois de olhar o beta instalado: o painel dentro de
  Ajustes é substituído por uma galeria de cartões de tema e uma janela
  própria de construção de tema (item 2, Revisão); item 4 confirmado (T.1,
  opção A). 2026-10-22 — item 3 (`tokensVersion: 1`) **estendido, não
  substituído**, pela [0109](0109-themes-v2-more-tokens-and-a-catalogue.md):
  `tokensVersion: 2` acrescenta cores opcionais, escolhas de forma e um
  crédito; os arquivos da versão 1 continuam válidos e com o mesmo visual.

## Contexto

Ajustes › Aparência já oferece um tema (automático, claro, escuro), quatro
paletas (`paper`, `sepia`, `slate`, `moss`), três tons de escuro (`soft`,
`deep`, `dusk`), o tamanho da fonte, uma fonte de título, uma fonte de
corpo, uma cor de título e uma largura de leitura
(`app/ui/src/settings.ts`, `app/ui/css/base.css`), tudo guardado como
configuração da pessoa, nunca numa nota. O que falta é o de que o
mantenedor reclamou em 2026-10-17: a pessoa não vê o resultado antes de
mudar, não consegue fazer um visual próprio e guardá-lo, e não consegue
entregá-lo a alguém.

O primeiro texto desta ADR pedia onze propriedades. Conferidas contra o CSS
em 2026-10-20 (revisão D-I15): só `--ink` existe com aquele nome. Os tokens
da janela são `--paper`, `--paper-2`, `--paper-3`, `--hair`, `--ink`,
`--ink-2`, `--ink-3`, `--seal` (o acento), `--seal-wash`, `--brass`,
`--brass-ink`, `--brass-wash`, `--heading-font`, `--book` (a fonte do
corpo), `--mono` e o `font-size` do elemento `<html>`; não há token de raio
nem cor de "hover". A ideia se mantém; o contrato tem de ser escrito sobre
os nomes reais.

## Decisão

Aceita em 2026-10-21. Cada item é `[DECIDIDO 2026-10-21]`: o mantenedor
marcou a opção escrita nele no questionário de decisões de 2026-10-20;
onde uma opção difere da recomendada primeiro, o item diz.

1. **Entra na V1, como uma fatia pequena** (0100.0, opção A; roadmap V.28).
   Uma prévia ao vivo em Ajustes, sobre os tokens reais, com perfis salvos e
   exportar/importar; nenhum campo de CSS livre. Nenhuma dependência, só
   variáveis CSS e JSON, de modo que funciona offline e não pesa nada.

2. **O painel fica dentro de Ajustes › Aparência** (0100.1, opção A), não
   numa janela flutuante: um documento de exemplo ao lado dos controles
   (títulos, texto de corpo, uma citação, código, uma tabela, botões) que
   muda na hora quando um valor muda. A tela de Ajustes já é acessível por
   teclado e leitor de tela e funciona igual no celular e no navegador
   ([0076](0076-the-window-on-every-screen.md)); a prévia ao vivo é uma
   troca de variáveis em `:root`, sem recarregar e sem piscar.

   **Revisão, 2026-10-21 (o mantenedor, depois de olhar o beta instalado
   nesse dia): este item está revisado.** Ele olhou o beta e escreveu:
   *"Quase tudo ok, exceto a parte do wizard de tema, achei a tela mega
   puida [poluída], bora fazer uma nova janela só para construção do tema. pensei de
   em settings aparência ele ter várias caixas com amostra mínima de cada
   tema para simplificar a escolha, e botões para copiar e alterar o tema aí
   sim abrindo a janela com as opções que foram feitas"*. Então: **Ajustes ›
   Aparência mostra uma galeria de cartões de tema, cada um com uma amostra
   mínima, com botões Copiar e Alterar; Alterar (e Copiar, que abre a cópia)
   abre uma janela própria de construção de tema com as opções feitas.** Os
   controles e o documento de exemplo deste item saem de Ajustes para essa
   janela. O que o item diz sobre o documento de exemplo mudando na hora, a
   acessibilidade por teclado e leitor de tela e a prévia ao vivo como troca
   de variáveis em `:root` continua e vale para a janela nova. O detalhe da
   janela (tamanho, se é uma janela do Verso ou um diálogo, como um cartão é
   desenhado) não é decidido por esta revisão. Roadmap: uma linha nova na V1,
   na fatia da V.28.

3. **O contrato de tokens, `tokensVersion: 1`** (0100.2, opção A): uma lista
   curta e fixa sobre os nomes reais — `--paper`, `--paper-2`, `--hair`,
   `--ink`, `--ink-2`, `--seal`, `--brass-ink`, `--heading-font`, `--book`,
   `--mono` e o tamanho da fonte. Um tema é apenas uma lista de valores para
   esses tokens: **nunca CSS livre, nunca `url()`**, nunca uma regra
   ([0050](0050-outbound-network-access.md)); cada valor é conferido contra o
   seu tipo (uma cor, uma fonte do conjunto permitido, um tamanho numa
   faixa). Os valores que a pessoa não edita um a um (`--paper-3`, `--ink-3`,
   os tons claros, os tons de escuro) são derivados pelo assistente a partir
   desses, de modo que as paletas já validadas em contraste não são tocadas.
   Não há token de raio: nenhum existe hoje e o mantenedor não pediu um.
   `tokensVersion` deixa a lista crescer sem quebrar um tema salvo. Um tema
   nunca toca numa nota: são valores de variável, guardados fora da pasta.

4. **Onde um tema mora: a camada da pessoa, mais uma sugestão opcional da
   pasta** (0100.3, **opção B — escolha explícita do mantenedor**). Os
   perfis salvos são configurações da pessoa
   ([0070](0070-what-travels-with-the-folder.md) item 1; num servidor, as
   da conta), sem sincronizar entre pessoas, de modo que numa sala cada um
   vê o seu tema. Uma pasta pode levar um `recommendedTheme` opcional em
   `.verso/settings.json`, que a pessoa aceita ou dispensa; a pasta nunca o
   aplica sozinha. O mantenedor escolheu isto sabendo que o item 4 da
   [0103](0103-feature-presets-and-capability-flags.md) diz "a escolha da
   pessoa, nunca a da pasta" para as chaves de funcionalidades: para temas
   ele decidiu diferente, e a 0103 traz uma nota datada dizendo isso.
   **Confirmado em 2026-10-21 (T.1, opção A):** a sugestão é só o tema
   inteiro, escrito dentro do `.verso/settings.json`; um lugar só, nada a
   seguir. O caminho de um arquivo `.verso-theme` dentro de `.verso/` não é
   aceito.

5. **O contraste é conferido ao vivo, e uma tela ilegível é desfeita**
   (0100.4, opção A). Para os pares reais — tinta sobre papel, tinta 2 e
   tinta 3 sobre papel, o acento sobre papel — o painel mostra a razão ao
   vivo e avisa abaixo de 4,5:1 (WCAG AA para texto). Só se uma escolha
   derrubar um par **abaixo de 3:1** ela é revertida automaticamente, uma
   vez, com uma mensagem dizendo o que foi desfeito; não há diálogo
   temporizado "Manter alterações?" a cada mudança. "Restaurar padrão" está
   sempre no painel e alcançável por teclado, com um rótulo visível, seja
   qual for o estado.

6. **Exportar e importar `.verso-theme`** (0100.5, opção A). Um tema é um
   JSON pequeno (nome, claro ou escuro, `tokensVersion`, os valores) que se
   exporta e se importa com **validação estrita**: só os tokens da lista,
   só cores e fontes que ela conhece, um tamanho máximo, nenhum `url()`,
   nada mais. Um arquivo arrastado para a janela é aceito, e há também um
   botão **"Importar…"**, para que quem usa só o teclado ou um leitor de tela
   o faça sem arrastar. As fontes são só as que o aplicativo traz e as do
   sistema; uma fonte baixada de fora quebraria a regra de rede
   ([0050](0050-outbound-network-access.md)).

7. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
   cada controle rotulado em pt-BR e EN; cores e tamanhos operáveis por
   teclado; as razões de contraste e uma reversão anunciadas numa região
   viva educada; a prévia não move o foco.

## Consequências

- As folhas de estilo do núcleo não mudam: um tema sobrepõe variáveis em
  `:root` (e os mecanismos `data-palette` e de tons de escuro existentes
  continuam funcionando).
- Os perfis vivem nas configurações da pessoa (`app/ui/src/settings.ts`
  ganha uma lista de temas); `recommendedTheme` é mais uma chave de
  `.verso/settings.json` (o `FolderSettings` do contrato, com os bindings
  regenerados).
- Um validador de arquivos `.verso-theme` com teste de entradas hostis (um
  `url()`, um token desconhecido, um valor enorme, um tipo errado); o
  contraste dos pares calculado dos tokens reais; um teste de que a
  reversão só acontece abaixo de 3:1.
- O cofre de demonstração ensina ([0058](0058-demo-vault-as-tutorial.md)); o
  changelog ganha a sua linha; linha V.28 do roadmap.

## Alternativas descartadas

Só o que o mantenedor recusou ao marcar estas respostas (as "alternativas"
do primeiro texto nunca foram consideradas por ninguém além do autor e não
são registradas):

- **Esperar até depois da V1, ou não fazer** (0100.0, B e C): o mantenedor
  quer na V1.
- **Uma janela flutuante ou ancorada** (0100.1, B), e **nenhum documento de
  exemplo** (0100.1, C): a primeira é um componente novo de foco e teclas,
  difícil no celular; a segunda mantém o "mude para ver".
- **Criar os tokens do primeiro texto (`--bg`, `--accent`…) e fazer o CSS
  usá-los** (0100.2, B), e **só acrescentar duas ou três paletas, sem
  editor** (0100.2, C).
- **Só a camada da pessoa, com a pasta nunca sugerindo** (0100.3, A): o
  mantenedor escolheu a sugestão opcional.
- **Um diálogo temporizado "Manter alterações?" a cada mudança drástica**
  (0100.4, B), e **só um aviso, sem reversão automática** (0100.4, C).
- **Só perfis locais, sem exportar nem importar na V1** (0100.5, B).
- **Aceitar também o caminho de um `.verso-theme` dentro de `.verso/` como a
  sugestão da pasta** (T.1, B): mais um caminho a validar.
- **O painel de personalização mantido dentro de Ajustes** (o mantenedor,
  2026-10-21): poluído demais; substituído pela galeria e pela janela de
  construção (item 2).

## Status

Aceita (2026-10-21), a reescrita sobre os tokens reais com as respostas do
mantenedor a 0100.0–0100.6.

Como construído em 2026-10-21, em `feat/rpg-tools` (não enviada, não
lançada): `f41fb433` (a matemática de cores, os arquivos de tema e os
perfis) e `6b3ec1fa` (o painel Personalizar aparência em Ajustes), com
`9e97507d` (a pasta sugere um tema no seu arquivo de configurações) e
`55cf1ecf` (o tutorial e o changelog); integrada por `203b8989`.

Revisada em 2026-10-21 (item 2): o painel de Ajustes dá lugar a uma galeria
de cartões de tema e a uma janela própria de construção de tema; a construir.

Construído em 2026-10-22, depois do relato do mantenedor (*"a configuração de
tamanho da fonte está estranha: eu arrasto, aí a tela muda de tamanho e some a
barra, dependendo do zoom"*): o ajuste de tamanho da fonte — e o `font-size` de
um tema — agora dimensiona só o texto das notas (`--note-scale`), não mais o
elemento `<html>`; o tamanho da interface é o zoom da janela. Isso contradiz o
texto desta ADR (o `font-size` de um tema "do elemento `<html>`"); registrado,
**não decidido** — o mantenedor confirma ou desfaz.

Confirmado em 2026-10-22 pelo mantenedor — o tamanho da fonte dimensiona só as
notas (*"deveria ser"*); a nota de construção acima passa a ser a decisão.
