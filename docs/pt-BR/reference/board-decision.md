# Memo de decisão: o board — Excalidraw sobre JSON Canvas

- Data: 2026-09-29
- Status: **não decidido**, exceto o escopo (seção 6, D1), que o mantenedor
  definiu em sessão em 2026-09-29 e que este memo só propõe como registrar.
  Opções e recomendações estão identificadas como tais; o mantenedor decide
  (`CLAUDE.md` §1). Nenhum código segue este memo até existirem as respostas
  da seção 9: o [ADR 0040](../adr/0040-board-persistence.md) manda decidir a
  persistência "antes do board".
- Autor: Opus 5.5 — dos documentos, o papel que o
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá ao "Opus 5"; e, por
  decisão do mantenedor de 2026-09-29, de toda a sequência do board, Rust
  incluído, para economizar o uso do Fable. Isso é um desvio do ADR 0032 para
  o Rust, declarado de novo em cada pull request de Rust. Leitor: Fable 5.1,
  que não escreveu nada disto.

## 1. O que foi pedido

- 2026-09-29: "vamos puxar a demanda do canvas hexcalidraw etc agora., se ja
  nao tiver detalhado, preciso ver a viabilidade e próximos passos".
- 2026-09-29, sobre o plano que respondeu a isso: "detalhe melhor esses
  próximos passos, vamos fazer isso mesmo", e, sobre quem escreve, "vou
  colocar o opus pra fazer […] tenho que economizar o fable".

## 2. O que existe hoje

Textos decididos:

| Texto | Diz | Status |
|---|---|---|
| [ADR 0024](../adr/0024-board-excalidraw.md) | o board usa o Excalidraw (MIT) como camada livre de anotação; tldraw descartado pela licença | Aceito |
| ADR 0024, Consequências | nós são notas, arestas são relações tipadas, uma seta livre pode ser promovida a relação tipada | `PROPOSTO` |
| [ADR 0040](../adr/0040-board-persistence.md) | persistência: nenhuma; tem de caber no `.canvas` do Obsidian e na degradação para Markdown legível; estender JSON Canvas pode, substituir não | `[ABERTO]` |
| [ADR 0035](../adr/0035-cross-cutting-requirements.md) | o board precisa de uma vista acessível equivalente, uma lista ou tabela das mesmas notas e relações | `PROPOSTO` |
| [ADR 0034](../adr/0034-roadmap-in-phases.md), `docs/roadmap.md`, `CLAUDE.md` §2.5 | o board está fora de escopo até o fim da Fase 2 | Aceito |
| [ADR 0049](../adr/0049-phase-2-scope-widened.md) §3 | Excalidraw ou o canvas do Obsidian: pedido e não construído | Aceito |
| [Spec §5.11](../spec/dialect.md) | arquivos `.canvas` são lidos e escritos sem quebrar | — |
| Spec, tabela de conversão, D4 | o `.excalidraw.md` do plugin vira o formato de board do Verso por conversão explícita, com diff | `PROPOSTO` |
| Spec, seção 9, Q16 | quais arquivos que não são Markdown entram no índice como alvo de link (`.canvas` entre eles) | `[ABERTO]` |

A janela hoje abre um `.canvas` como arquivo de texto, no editor, como JSON
cru (`app/ui/src/main.ts`, as extensões de `TEXT`). Nada o desenha.

As vistas de kanban, calendário e tabela entraram na Fase 2 do mesmo jeito que
o board entraria agora: uma revisão do ADR 0049 §3 dizendo que a linha não vale
mais, e um ADR próprio ([0053](../adr/0053-views-bases.md)). É esse o
precedente que a seção 6 propõe seguir.

## 3. O que foi observado no Obsidian

Obsidian 1.13.7 (instalador 1.11.5), macOS, o vault Sandbox
(`cofre-rpg-dados-criticos`), 2026-09-29. Admissível pelo
[ADR 0009](../adr/0009-external-constraints.md): arquivos escritos à mão, o
app conduzido pela própria linha de comando (`open`, `rename`, `backlinks`,
`links`), e um nó arrastado com um evento de mouse sintético (`dev:cdp`
`Input.dispatchMouseEvent`) — entrada de fora, igual a uma mão no mouse; nada
do app foi lido. Pastas descartáveis `verso-board-probe/` e
`verso-board-probe2/`, removidas depois.

### 3.1 Os arquivos do próprio vault

- Dois `.canvas` escritos pelo Obsidian (`2. Escudo do Mestre/Quadro do
  Mestre.canvas`, três nós `file`, sem arestas; `Sem título.canvas`, vazio).
  Layout: indentação com tab, um nó por linha, ordem de chaves `id, x, y,
  width, height, type, file`, sem quebra de linha no fim do arquivo.
- Um desenho do plugin Excalidraw, `5. Infraestrutura/Templates/Nova
  Estrutura de Aventura.md` (16 KB): frontmatter `excalidraw-plugin: parsed`,
  uma seção `## Text Elements` com cada texto e um `^id` ("Gancho", "Cena 1",
  "pista", "Cena Ativa"…), e uma seção `## Drawing` num bloco
  `compressed-json` — a cena, comprimida e em base64, ilegível. Uma estrutura
  de aventura desenhada como board: o caso de uso que o briefing cita.

### 3.2 Sondagens

| # | O que foi feito | Resultado |
|---|---|---|
| O1 | Um `.canvas` com campos desconhecidos num nó (`"versoExtra":{"k":1}`), numa aresta (`"versoRel"`) e no topo (`"verso":{…}`); uma nota apontada por ele renomeada com o canvas **fechado** | caminho do `file` atualizado; **todos os campos desconhecidos mantidos** |
| O2 | O mesmo canvas **aberto** no Obsidian | arquivo não escrito na abertura (mesmo hash) |
| O3 | Uma nota apontada renomeada com o canvas **aberto** | caminho atualizado; campos desconhecidos mantidos |
| O4 | Um nó **arrastado** na view do canvas | a view salvou: campos desconhecidos em nós, arestas e topo **mantidos**; as chaves de cada nó **reordenadas** (`id, type, <campos do tipo>, <campos desconhecidos>, x, y, width, height, color`); o campo desconhecido da aresta foi para depois de `id`; a posição encaixou na grade (y 0 → 70) |
| O5 | Um nó de **tipo desconhecido** (`"type":"verso-drawing"`) ao lado de um nó `file` | não desenhado; no salvamento seguinte da view (arrasto do outro nó) **o nó desconhecido foi apagado do arquivo** |
| O6 | Uma extensão grande no topo, escrita com arrays aninhados numa linha | mantida; reformatada pela regra do Obsidian abaixo |
| O7 | `backlinks` de uma nota apontada por um nó `file` de canvas | o canvas aparece como backlink, contagem 1 (também para o `Quadro do Mestre.canvas` do próprio vault) |
| O8 | Uma nota com `[[board]]` e `![[board.canvas]]` | `[[board]]` não resolvido; `![[board.canvas]]` resolvido, e o canvas lista a nota como backlink |
| O9 | `links` de um `.canvas` | "No links found", embora O7 conte os nós `file` dele como backlinks em outro lugar |

**A regra de layout do Obsidian, como observada em O1, O4 e O6:** um objeto
ou array cujos valores são todos escalares é escrito numa linha; um que
contém objeto ou array é escrito com uma entrada por linha, indentado com
tabs; o arquivo não tem quebra de linha final. Um traço à mão livre de 500
pontos salvo pelo Obsidian vira 500 linhas.

O que O5 resolve: **um desenho não pode morar no canvas como nós de um tipo
nosso.** O Obsidian os apaga na primeira vez que o usuário move qualquer
coisa.

## 4. O Excalidraw como dependência

Medido numa instalação de rascunho em 2026-09-29, fora do repositório.

| | Achado |
|---|---|
| Pacote | `@excalidraw/excalidraw` 0.18.1, MIT; peers `react` e `react-dom` (17, 18 ou 19); 19.3.0, MIT |
| Portão de licenças npm (`scripts/check-npm-licenses.mjs`, rodado sobre o lockfile de rascunho) | 278 pacotes; 2 recusados: `tslib` (0BSD, licença permissiva fora da allowlist) e `fuzzy` (sem campo `license`; `LICENSE-MIT` no pacote). Mesma forma da entrada do Mermaid em 2026-09-29: uma licença adicionada para o olhar do mantenedor, um pacote aceito à mão |
| Bundle, minificado, dividido | ~8,5 MB de JavaScript em 179 chunks; por pacote: Excalidraw 4,5 MB, **Mermaid 11** 4,2 MB (trazido por `@excalidraw/mermaid-to-excalidraw`; a janela já traz o Mermaid 12), cytoscape 1,1 MB, react-dom 0,6 MB |
| Fontes | 13 MB, dos quais 12 MB são a Xiaolai (CJK manuscrita); as outras 16–80 KB cada |
| Rede (ADR 0050) | as fontes carregam de `esm.sh` a menos que `window.EXCALIDRAW_ASSET_PATH` aponte para outro lugar; o pacote também cita `libraries.excalidraw.com`, `json.excalidraw.com` (link de compartilhamento), endereços de colaboração, IA e Excalidraw+. O link de compartilhamento só aparece com a prop `onExportToBackend` |
| Pontos de extensão (`.d.ts`) | `renderEmbeddable` (desenhar conteúdo nosso dentro de um elemento), `validateEmbeddable`, `onLinkOpen` (interceptar o clique num link), `onChange`, `UIOptions`, `viewModeEnabled`, `langCode` (vem um locale `pt-BR`), `customData` em todo elemento |
| A UI hoje | TypeScript sem framework, um bundle esbuild, sem React. O Excalidraw seria uma ilha React montada só no painel do board |

## 5. JSON Canvas e Excalidraw, lado a lado

JSON Canvas 1.0 ([jsoncanvas.org](https://jsoncanvas.org/spec/1.0/), MIT,
`obsidianmd/jsoncanvas`): `nodes` e `edges` no topo; todo nó tem `id`,
`type`, `x`, `y`, `width`, `height` inteiros, `color` opcional (`"1"`–`"6"`
ou hex); a ordem do array é a ordem de empilhamento. A spec não diz nada
sobre campos desconhecidos.

| JSON Canvas | Excalidraw | Perda indo para o Excalidraw | Perda voltando |
|---|---|---|---|
| nó `text` (Markdown) | `embeddable` desenhado pelo Verso (`renderEmbeddable`), ou um `text` dentro de um `rectangle` | com um elemento `text` simples, o Markdown aparece cru | nenhuma com `embeddable`; com `text`, a fonte e o tamanho do Excalidraw não têm lugar no JSON Canvas |
| nó `file` (`file`, `subpath`) | `embeddable` desenhado pelo Verso: a nota renderizada, uma imagem, um PDF | nenhuma | nenhuma |
| nó `link` (`url`) | `embeddable` com o endereço; carregá-lo é assunto do ADR 0050 | nenhuma se desenhado como cartão, não como frame | nenhuma |
| nó `group` (`label`, `background`, `backgroundStyle`) | `frame` (`name`) | o frame do Excalidraw não tem imagem de fundo | o recorte dos filhos pelo frame não tem sentido em JSON Canvas |
| aresta (`fromNode`/`toNode`, `fromSide`/`toSide`, `fromEnd`/`toEnd`, `label`, `color`) | `arrow` ligada nas duas pontas, com um `text` ligado para o rótulo; um lado como ponto fixo (`[0.5, 0]` é o topo) | nenhuma | uma seta ligada a um elemento livre do desenho, ou com curva, não tem forma de aresta: fica no desenho |
| `color` `"1"`–`"6"` | um hex de uma tabela fixa | nenhuma, dada a tabela | um hex fora da tabela é escrito como hex, o que a spec permite |
| coordenadas inteiras | ponto flutuante | nenhuma | arredondadas ao salvar; o Obsidian também encaixa (O4) |
| — | `freedraw`, `line`, `rectangle`, `ellipse`, `diamond`, `arrow` livre, `text` livre | — | sem forma em JSON Canvas: é a "camada livre de anotação" do ADR 0024 |
| — | `image` (guardada como `dataURL`, base64, dentro da cena) | — | base64 no arquivo; ver D2 |

## 6. As decisões

### D1 — Escopo

A resposta do mantenedor está na seção 1; falta como registrá-la.
**Proposta:** como foram as vistas — revisar o ADR 0049 §3 (a linha do board
não vale mais, com a citação e a data), escrever um ADR novo para o board que
registre D2 a D6 quando respondidas, e mudar as linhas de "fora de escopo" do
`docs/roadmap.md` e do `CLAUDE.md` §2.5 para tirar "board", apontando para o
ADR novo. A regra do ADR 0034 em si fica ("um item de escopo que não está
listado aqui não entra na fase sem virar uma decisão registrada" — este é o
registro). O portão de saída da Fase 2 (o mês de uso) não muda.

### D2 — Persistência (ADR 0040)

Duas perguntas: onde mora o desenho, e o que desenha o board.

**Onde mora o desenho.**

| | (a) Um arquivo: o `.canvas`, o desenho sob uma chave de topo (`"verso"`) | (b) Dois arquivos: o `.canvas` e um sidecar `.excalidraw` ao lado | (c) O board é um arquivo Excalidraw; `.canvas` só por exportação |
|---|---|---|---|
| O que o Obsidian mostra | as notas, textos, links, grupos e arestas; não o desenho | o mesmo | nada do board (o Obsidian sem plugins não o abre) |
| Sobrevive a uma edição no Obsidian | sim, observado (O1, O3, O4, O6) no 1.13.7; não prometido pela spec | sim; o Obsidian nunca abre o sidecar | — |
| Sobrevive a renomear, mover, apagar no Obsidian | sim, é um arquivo só | **não**: o Obsidian move o `.canvas` e deixa o sidecar para trás; apagar o deixa órfão | sim |
| Legível sem o Verso | JSON, um elemento por linha pela regra do Obsidian; textos legíveis | o mesmo, e o sidecar abre no excalidraw.com | JSON; não é um `.canvas` |
| Cabe no ADR 0040 | sim: estende JSON Canvas, não substitui | sim | **não**: a consequência "caber no `.canvas` do Obsidian" |
| Risco | um Obsidian futuro que descarte chaves de topo desconhecidas perderia o desenho nas mãos do Obsidian (O5 mostra que ele faz isso com tipos de nó desconhecidos) | um par de arquivos que outras ferramentas não mantêm junto | — |
| Descartado por O5 | o desenho como nós de um tipo nosso | | |

Em (a) ou (b), uma imagem solta no board vira um arquivo na pasta e um nó
`file` de JSON Canvas — que o Obsidian também mostra — nunca um `dataURL` em
base64 dentro do desenho.

**Recomendação: (a)**, com o risco registrado: repetir O4 e O6 a cada versão
nova do Obsidian que o mantenedor instalar, e registrar em
`obsidian-observations.md`. (b) é a alternativa se o mantenedor pesar as
renomeações do Obsidian acima desse risco.

**O que desenha o board.**

| | (R1) O Excalidraw desenha tudo | (R2) O Verso desenha os nós; o Excalidraw é uma camada transparente por cima |
|---|---|---|
| Nós e arestas | mapeados para elementos do Excalidraw ao abrir (seção 5), de volta para JSON Canvas ao salvar; notas desenhadas pelo Verso dentro de elementos `embeddable` | renderizador próprio do Verso (DOM), como o do Obsidian |
| Pan, zoom, desfazer, seleção | um motor | dois, mantidos em passo à mão; uma troca de modo entre "mover notas" e "desenhar" |
| Custo | o mapeamento da seção 5 tem de ser exato para tudo o que o Obsidian lê | um editor de canvas próprio, mais a sincronização |
| As palavras do ADR 0024 | o Excalidraw é mais que a camada de anotação: é a superfície | literalmente "uma camada livre de anotação" |

**Recomendação: R1.** Uma superfície só é mais simples para o usuário e para
o código; o mapeamento é a parte a testar (a ida e volta da seção 7). Se o
mantenedor ler a "camada de anotação" do ADR 0024 como excluindo R1, é essa a
resposta que decide.

### D3 — A camada semântica na primeira versão?

Depende da sintaxe de relação tipada, `[ABERTO]` na spec. **Opções:** dentro;
fora, com as arestas como arestas de JSON Canvas com `label` livre, que o
Obsidian já mostra. **Recomendação: fora** — uma primeira versão que não
promove nada, e a sintaxe de relação tipada decidida por conta própria.

### D4 — Converter o `.excalidraw.md` do plugin agora?

Um desenho real no Sandbox (seção 3.1). O plugin é **AGPL-3.0**
(`zsviczian/obsidian-excalidraw-plugin`); o Verso é MPL-2.0. Um conversor é
escrito a partir da estrutura do próprio arquivo (seção 3.1) e do schema MIT
do Excalidraw, sem ler nada do código do plugin; o bloco `compressed-json`
precisaria de um decodificador LZ-string, uma dependência a justificar então.
Conversão explícita, com diff (invariante 8). **Opções:** nesta sequência (um
terceiro pull request); depois. **Recomendação: depois**, quando o board
estiver em uso — o destino da conversão é o formato que D2 escolher.

### D5 — Q16 da spec para `.canvas`

Observado (O7–O9): o Obsidian conta um nó `file` de canvas como backlink da
nota, resolve `![[board.canvas]]` pelo nome completo e não `[[board]]`.
**Opções:** (a) o mesmo no Verso — nós `file` são fontes de backlink, um
`.canvas` é alvo de link pelo nome completo; (b) não; (c) depois.
**Recomendação: (a)**, que fecha a Q16 só para `.canvas`; os outros arquivos
que não são Markdown continuam com a pergunta. Se o Obsidian também conta os
`[[links]]` dentro de um nó `text` não foi observado; observar antes do texto
da spec.

### D6 — A vista acessível

`PROPOSTO` no ADR 0035. **Proposta:** promovida junto com o board, não
depois, numa forma mínima: um botão "lista" no painel do board mostrando os
grupos com seus nós (uma nota como link, o texto de um nó `text`, o endereço
de um nó `link`), arestas como "A → B (rótulo)", e os textos livres do
desenho sob "anotações"; navegação por teclado, Enter abre a nota.
**Opções:** essa; uma tabela; depois.

### Também para o olhar do mantenedor (não são decisões do ADR 0040)

- **Fontes e a rede (ADR 0050).** Servidas pelo próprio app, via
  `EXCALIDRAW_ASSET_PATH`: nada carrega de `esm.sh`. A Xiaolai (12 MB) vai ou
  não: sem ela, texto chinês, japonês e coreano no board cai numa fonte do
  sistema. Recomendação: tirar.
- **Os recursos online do Excalidraw.** Link de compartilhamento,
  colaboração, IA, Excalidraw+ e o navegador de bibliotecas desligados ou
  escondidos. Recomendação: todos escondidos.
- **Licenças.** `0BSD` adicionada à allowlist e `fuzzy` aceito à mão como
  MIT, no pull request que traz o pacote, como foram os do Mermaid.
- **Peso.** O board carrega como um chunk separado quando um board é aberto,
  para o início da janela não crescer; o build ganha o code splitting do
  esbuild. O Mermaid 11 vem dentro do chunk do Excalidraw (o recurso "Mermaid
  to Excalidraw") ao lado do Mermaid 12 da janela: aceitar a duplicata, ou
  esconder o recurso e deixar o bundler descartá-lo. Recomendação: esconder.
- **A vista de texto fica.** Um `.canvas` abre como board; "abrir como texto"
  mantém o comportamento de hoje a um clique.

## 7. O que segue as respostas

Cada item é um pull request de um assunto (ADR 0051), nesta ordem.

1. **Documentos.** O ADR de D1 com D2–D6; o ADR 0040 fechado; o Status dos
   ADRs 0024 e 0035; o ADR 0049 §3 revisado; roadmap e `CLAUDE.md` §2.5;
   spec §5.11, Q16 e seção 9; a linha de persistência do briefing §9 (o
   original pt-BR primeiro). As duas línguas.
2. **`.canvas` no core (Rust).** Ler e escrever `.canvas` pelo contrato;
   escrita atômica e checagem de revisão (invariantes 9 e 11). O escritor
   mantém todo campo desconhecido e a ordem de chaves que leu, e escreve pela
   regra de layout do Obsidian (seção 3.2) — assim um arquivo que o Verso não
   mudou sai byte a byte igual, e um que o Verso mudou difere só onde mudou.
   Guardrail no mesmo pull request, visto falhando antes: um teste de ida e
   volta sobre arquivos no layout do Obsidian (os canvas do próprio Sandbox e
   as sondagens da seção 3.2), ler e escrever sem mudança dá os mesmos bytes;
   abrir não escreve nada (invariante 7). Se D5 for (a), a mudança no índice
   vai aqui.
3. **O painel do board (UI).** React e Excalidraw, carregados só no painel;
   o mapeamento da seção 5; salvar só pelo contrato, com o diff mostrado
   numa mudança concorrente (invariante 11); a vista acessível de D6;
   `pt-BR` e inglês; os pontos de rede e licença acima; uma linha de
   changelog nas duas línguas.
4. **Só se D4 for "dentro":** a conversão.

## 8. O que este memo não verificou

- Que o Obsidian mantém campos desconhecidos em versões além da 1.13.7, ou em
  edições além de renomear e arrastar (redimensionar, recolorir, agrupar,
  editar aresta não foram testados).
- Se o Obsidian conta `[[links]]` dentro de um nó `text` de canvas como
  backlinks.
- O Excalidraw dentro do WKWebView do app: nada rodou na janela. As medidas
  da seção 4 vêm de uma instalação de rascunho e de um bundle montado fora do
  repositório.
- Se o plugin Excalidraw abre um sidecar `.excalidraw` simples (o "legível em
  outro lugar" da opção b).
- O desempenho de um board com muitas notas desenhadas como elementos
  `embeddable`.

## 9. Para o mantenedor

1. D1: registrar o escopo como foram as vistas (revisão do ADR 0049, um ADR
   novo, roadmap e `CLAUDE.md`)? Sim / de outro jeito.
2. D2, onde mora o desenho: (a) um arquivo, (b) sidecar, (c) arquivo
   Excalidraw.
3. D2, o que desenha o board: R1 ou R2.
4. D3, a camada semântica: dentro ou fora da primeira versão.
5. D4, conversão do `.excalidraw.md`: nesta sequência ou depois.
6. D5, `.canvas` no índice: (a), (b) ou (c).
7. D6, a vista acessível: a lista, uma tabela, ou depois.
8. Xiaolai, os recursos online, a duplicata do Mermaid: como recomendado, ou
   de outro jeito.
