# ADR 0101 — Dados 3D: um módulo preguiçoso que só encena a queda, sobre um resultado já sorteado
  2026-10-22, testando o app instalado — o som vem **ligado por padrão**, como
  no Rolai (o mantenedor: *"som de dados tem que ser habilitado por
  padrão"*; revisa o "desligado" da T.7); estava mudo no app de desktop
  porque a política de conteúdo não permitia a mídia de `'self'` — agora toca
  pelo Web Audio desde o primeiro gesto; e um `dice:` num cartão de texto do
  board rola como numa nota (*"eu consigo rolar dados a partir do board?"*),
  sem gravar nada.

- Data: 2026-10-17; reescrita em 2026-10-21
- Fonte: o mantenedor, em sessão em 2026-10-17, referindo-se ao seu próprio
  aplicativo Rolai (`github.com/SergioSJS/rolai`): *"inclusive adicionando
  por exemplo rolagem de dados em 3D quando usar o padrão de rolar dado ele
  puxar uns dados 3D e rolar na tela eu inclusive posso deixar aqui o link do
  código do rola aí que talvez ajude a inspirar essa parte de rolagem 3D,
  também vai ser bem importante."* Em 2026-10-21 o mantenedor respondeu à
  revisão da rodada de RPG (citado nos itens). Este texto substitui o
  primeiro, escrito em 2026-10-17 por outra IA e marcado como Aceito sem
  aceitação.
- Relacionados: [0003](0003-primitives-not-workarounds.md),
  [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0088](0088-dice-and-random-tables.md) (item 5 revisado pelo item 2),
  [0092](0092-the-phone-offline.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Estado no briefing: não presente; melhoria visual 3D opcional.
- Revisões: 2026-10-20 — o primeiro texto voltou a Proposta (dizia-se
  Aceito em 2026-10-17 sem aceitação registrada). 2026-10-21 — reescrita
  com as respostas 0101.0 a 0101.7 do mantenedor (marcando as opções do
  questionário de decisões de 2026-10-20): os dados 3D entram na V1; a
  biblioteca **não** está escolhida e espera uma avaliação (item 3); as
  contradições do primeiro texto foram corrigidas (ele falava de uma
  predefinição `rpg`, que a [0103](0103-feature-presets-and-capability-flags.md)
  removeu, e dava um caminho absoluto no computador do mantenedor). Continua
  Proposta até o item 3 ser fechado. 2026-10-21, depois — item 3 decidido
  pelo mantenedor (0101.1c, opção A); **Aceita**, em construção.
  2026-10-21, noite — o mantenedor achou os dados grandes demais e pediu
  os ajustes de aparência do Rolai (*"o dado 3d está gigantesco, onde
  estão as configurações do dado? tema, textura, tamanho, cor da
  fonte"*; *"achei que teríamos as mesmas opções de customizações dos
  dados que o Rolai tem"*). Construído: um dado de cerca de 72 px em 100%
  (um controle de 70–160%, que acompanha a janela), lançado na parte de
  baixo do painel em foco; o modelo do Rolai — três conjuntos de cor, os
  8 estilos dele mais "Do Verso" (a paleta do app), cores de corpo,
  número e contorno, 20 texturas, 6 materiais — com aviso abaixo de
  contraste 3:1 e uma rolagem de teste. As texturas são as imagens
  originais do 3DDiceRoller do MajorVictory (The Unlicense), aprovadas
  pelo mantenedor no mesmo dia (X.1, opção A), com crédito, origem e
  hashes em `docs/reference/dice-textures.md`; as texturas desenhadas
  ficam como reserva. O estilo é JSON fechado passado por rolagem, para
  que os dados de quem rola viajem com as rolagens
  ([0107](0107-the-table-a-shared-roll-and-chat-log.md) item 11). Como
  construído, não decidido: a aparência fica com os outros ajustes de
  exibição, então num servidor acompanha a conta; o conjunto de cor 2 ou
  3 de uma rolagem de perfil (Fome, Sombrio) ainda não é desenhado em 3D.
  2026-10-21, madrugada — três relatos do mantenedor no beta. Os números
  fora do centro (*"pq os números não estão centralizados na forma como
  todos os roladores e dados reais por aí?"*): cada face agora segue o
  "para cima" dos dados reais — uma borda em cima no d6, um canto para
  cima no d4, d8, d12 e d20, a ponta no d10 — com o algarismo centrado
  pela tinta e a marca do 6/9 à parte. A espera (*"tá demorando muito
  tempo para mostrar o resultado ao rolar"*), que também responde a T.8
  pendente contra manter 6,5 s e 1,1 s: o tempo máximo da animação passa
  a 2,5 s, os dados ficam 0,3 s parados antes do cartão, a queda roda
  1,6× mais rápida. Explosões (*"`dice: 3d6!` não tá rolando dado 3D"*):
  o "com explosões … só o cartão 2D" do item 5 já não vale; uma rolagem
  que explode cai em 3D, cada dado extra lançado depois que o dado de onde
  veio para, dentro do mesmo máximo e do limite de 20 dados (um d100 que
  explode continua só com o cartão).
  2026-10-22 — o mantenedor respondeu a lista de decisões da tarde de
  2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`) em 2026-10-22:
  (a) T.7, opção A mais a pergunta dele *"não da pra aproveitar do Rolai?"*:
  **um clique curto sintetizado pelo próprio app (sem arquivo), atrás de um
  interruptor "Som dos dados", desligado por padrão** (**em construção**); os
  sons de dados do próprio Rolai estão **em avaliação**, com a licença
  conferida, e nada está decidido sobre eles. (b) T.8, opção C, nas palavras
  dele: *"O Dado deveria ficar na tela até o usuario mexer em algo, como no
  Rolai, ja falei mais de uma vez para copiar os mesmos comportamentos de lá,
  nao sei pq vc está teimando tanto, de toda forma adiciona configuração do
  tempo de rolagem"*. **Os dados ficam na tela até o usuário agir, como os do
  Rolai, e há um ajuste para a duração da rolagem** (**em construção**). Isto
  revisa a revisão da noite acima (máximo de 2,5 s, 0,3 s parado antes do
  cartão, queda 1,6x), que respondia T.8 provisoriamente; o padrão e os
  limites do ajuste, e o que conta como "agir", não são decididos aqui.

## Contexto

Dados e tabelas sorteadas já rolam em 2D ([0088](0088-dice-and-random-tables.md),
`app/ui/src/dice/`): o resultado e o seu cartão existem e funcionam. O
`package.json` da janela não tem three.js, nem física, nem biblioteca de
dados 3D (conferido em 2026-10-20). O item 5 da
[0088](0088-dice-and-random-tables.md) diz "nenhuma dependência nova de
runtime; a rolagem 3D fica do Rolai". O cliente web do Rolai (`apps/web`)
usa `@3d-dice/dice-box-threejs` `^0.0.12` e `three` `^0.143.0`; a licença
desse pacote não foi conferida, e o primeiro texto desta ADR citava "cerca
de 200–250 KB comprimidos" sem fonte.

Uma rolagem 3D é enfeite: nada no produto precisa dela. Custa uma
biblioteca, GPU e bateria, e testes em WebKit, WebView2 e no navegador. O
mantenedor a quer na V1 mesmo assim.

## Decisão

`[DECIDIDO 2026-10-21]` marca o que o mantenedor decidiu em 2026-10-21
marcando a opção escrita no item no questionário de 2026-10-20 (com as
palavras dele onde as deu). O item 3 esteve `[ABERTO]` até a resposta posterior do mesmo dia, registrada nele.

1. **Os dados 3D entram na V1, reescritos** (0101.0, opção B; roadmap
   V.29). `[DECIDIDO 2026-10-21]`. Este texto é essa reescrita; ela é
   aceita, e a funcionalidade construída, depois que o item 3 for fechado
   (0101.7, opção B).

2. **O item 5 da [0088](0088-dice-and-random-tables.md) é revisado, e o
   motor 3D é um pedaço preguiçoso** (0101.1, opção A). `[DECIDIDO
   2026-10-21]`: o pacote inicial da janela continua livre de qualquer
   biblioteca 3D; o motor é um pedaço separado carregado por um `import()`
   dinâmico só quando a chave 3D está ligada e uma rolagem é feita, e o
   service worker o guarda em cache para uso offline
   ([0092](0092-the-phone-offline.md)), como o build já faz com o
   Excalidraw e o MapLibre (`--splitting`, `chunks/`). A 0088 registra a
   revisão na sua linha de Revisões.

3. **A biblioteca: `three` + `cannon-es`, código nosso** (0101.1b, "Outra",
   depois 0101.1c, opção A). `[DECIDIDO 2026-10-21]` — veja o fim deste item.
   A primeira resposta (0101.1b, "Outra") foi a seguinte. O mantenedor: *"Avalie entre A e B qual a melhor abordagem, seria bom
   aproveitar algo pronto do rolai msm, mas vale avaliar o A um pouco mais,
   assim como B"*. Os dois candidatos:
   - **A — `three` (MIT) + `cannon-es` (MIT), código nosso**: controle
     total; os modelos dos dados d4 a d100, as texturas dos números e o
     pouso forçado são nossos a construir.
   - **B — `@3d-dice/dice-box-threejs`**, o pacote que o Rolai usa: já
     conhecido, com pouso forçado em uso no Rolai; versão 0.0.x, pouco
     mantida.
   A avaliação vem primeiro e decide, e mede: a licença do pacote **e de
   toda a sua árvore de dependências** contra a lista de licenças permitidas
   do npm ([0005](0005-license.md)); o tamanho real do pedaço, medido com
   `esbuild`; que o **pouso forçado funciona** nas faces que o resultado
   pede (testado, não presumido); e o comportamento em WebKit, WebView2 e
   num navegador. Nada é instalado na janela antes de ela reportar. As
   outras duas opções do questionário — `@3d-dice/dice-box` e um dado em CSS
   3D feito à mão, sem física — não foram escolhidas para a avaliação; o
   mantenedor nomeou A e B.

   **Decidido em 2026-10-21 pelo mantenedor (0101.1c, opção A), depois da
   avaliação que ele pediu** (`~/Projects/person/apps/verso-dice3d-avaliacao-2026-10-21.md`,
   medido com o `esbuild` do Verso: opção A 621 KB minificado / 158 KB gzip,
   opção B 550 KB / 143 KB, os dois só carregados quando o 3D está ligado; a
   opção B está parada desde 2022, o Rolai precisou de cerca de 400 linhas de
   remendos para ela, ela tem bugs abertos de número mostrado diferente do
   devolvido e de promessa que nunca termina, e suas texturas e sons não têm
   licença declarada): a biblioteca é **`three` + `cannon-es` (MIT), código
   nosso**, com o **Rolai como referência de desenho** (o d100 em dois dados,
   o d66, as lições do som). O pouso na face sorteada é código que testamos
   para cada dado (d4 a d100); a animação é uma repetição gravada, o que dá
   movimento reduzido, pular, pausa e laço parado quando ocioso; custa cerca
   de 600 a 700 linhas mais testes. A regra "o resultado é decidido antes da
   animação" não tolera o bug de número errado da outra opção. O Babylon
   (cerca de 1,7 MB) fica fora.

4. **O pouso é determinístico: a física nunca sorteia** (0101.2, opção A).
   `[DECIDIDO 2026-10-21]`: o número vem da fonte criptográfica
   ([0088](0088-dice-and-random-tables.md) item 7) ou, numa sala, do
   servidor (0088 item 4); o 3D só encena a queda até aquela face (notação
   como `2d20@18,4`). O cartão 2D é a verdade. A biblioteca escolhida tem
   de mostrar que força faces (item 3).

5. **Limites, GPU parada e uma saída da animação** (0101.3, opção A).
   `[DECIDIDO 2026-10-21]`: no máximo 20 dados na tela; acima disso, ou com
   explosões (`1d6!`), só o cartão 2D. Quando os dados param, o canvas some
   e o laço de animação é cancelado; uma perda de contexto WebGL é tratada.
   Um clique em qualquer lugar pula a animação, **e o Esc também**, e há
   **um tempo máximo de animação**, de modo que uma queda presa na tela
   sempre termina. (O máximo é um valor a fixar na construção; nenhum
   número foi decidido.)

6. **Numa sala** (0101.4, opção A). `[DECIDIDO 2026-10-21]`: o servidor
   sorteia e manda um evento efêmero com id único; cada pessoa o anima só
   se a sua chave 3D estiver ligada, senão vê o cartão 2D; quem entra
   depois não vê o passado; nada é gravado em nota. O id evita animar o
   mesmo evento duas vezes depois de uma reconexão. A sala guarda as
   últimas rolagens só na memória, como diz o item 4 da 0088.

7. **Uma chave própria, desligada por padrão** (0101.5, opção A).
   `[DECIDIDO 2026-10-21]`: "Dados 3D" em Ajustes › App › Funcionalidades,
   **desligada por padrão mesmo com "Tudo" ligado** (a única exceção ao
   item 2 da [0103](0103-feature-presets-and-capability-flags.md), que a
   0103 registra), e **desligada à força com movimento reduzido**, nunca
   animando seja o que a chave disser. O som é outra chave, desligada. Não
   há predefinição `rpg` (a [0103](0103-feature-presets-and-capability-flags.md)
   não nomeia nenhuma).

8. **O leitor de tela ouve o resultado na hora** (0101.6, opção A).
   `[DECIDIDO 2026-10-21]`: o resultado é anunciado uma vez, quando a
   rolagem é feita, numa região viva educada
   ([0088](0088-dice-and-random-tables.md) item 8), sem esperar os dados
   pararem; o canvas 3D é `aria-hidden`; o cartão 2D com o resultado em
   texto é **sempre** criado, mesmo com o 3D ligado. Nenhum anúncio de
   "rolando…".

9. **Status** (0101.7, opção B). `[DECIDIDO 2026-10-21]`: reescrever (feito
   aqui), aceitar quando a biblioteca tiver sido avaliada e o seu pedaço
   medido (item 3), e construir. A avaliação foi feita e a biblioteca decidida
   em 2026-10-21 (item 3), então esta ADR está **Aceita** e em construção.

## Consequências

- A [0088](0088-dice-and-random-tables.md) ganha uma linha de Revisões para
  o item 5 (a rolagem 3D pode ser um módulo preguiçoso da janela).
- `app/ui/src/dice/` ganha o módulo 3D preguiçoso, atrás da chave; o
  service worker lista o pedaço; as strings em pt-BR e EN; a chave e a sua
  descrição em Ajustes › App › Funcionalidades.
- A avaliação do item 3 foi um relatório fora do repositório
  (`~/Projects/person/apps/verso-dice3d-avaliacao-2026-10-21.md`); as
  dependências que ele nomeia (`three`, `cannon-es`, ambas MIT) entram com o
  código, justificadas no PR e checadas pela lista de licenças do npm.
- Uma mudança que o usuário vê: o changelog e o cofre de demonstração
  ([0058](0058-demo-vault-as-tutorial.md)).

## Alternativas descartadas

Só o que o mantenedor recusou ao marcar estas respostas:

- **Depois da V1, como extra opcional** (0101.0, A), e **não fazer, deixando
  o 3D para o Rolai** (0101.0, C).
- **Um pacote baixado da rede sob demanda** (0101.1, B): quebra o uso
  offline e a regra de rede ([0050](0050-outbound-network-access.md)).
- **Deixar a física decidir o número** (0101.2, B): cada aparelho daria um
  resultado diferente e a sala perderia a sincronia.
- **Aceitar os limites como o primeiro texto os tinha, com só um clique para
  pular** (0101.3, B).
- **Exigir o 3D de todos numa sala** (0101.4, B).
- **Uma chave ligada por padrão, exceto no celular** (0101.5, B), e **sem
  chave, só detectando o aparelho** (0101.5, C).
- **Anunciar só quando os dados param** (0101.6, B).
- **`@3d-dice/dice-box-threejs` com os remendos do Rolai e sem sons**
  (0101.1c, B): parada desde 2022, bug de número mostrado errado, licença
  não declarada de suas texturas e sons.
- **Babylon** (cerca de 1,7 MB): fora da avaliação pelo tamanho.

## Status

Aceita em 2026-10-21. Reescrita nesse dia com as respostas do mantenedor, e
aceita quando o item 3 (a biblioteca) foi avaliado e decidido (0101.1c,
opção A; 0101.7, opção B). Em construção; roadmap V.29.
