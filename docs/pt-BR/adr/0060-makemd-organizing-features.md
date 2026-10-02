# ADR 0060 — As funcionalidades de organização do make.md como primitivas do Verso

- Data: 2026-10-02
- Fonte: o mantenedor, 2026-10-02: "pensei de já fazermos as
  funcionalidades do plugin make.md do obsidian, dito isso, investigue,
  extraia as funcionalidades e planeja exatamente como fazer, considerando
  configurações e tal". O memo que respondeu,
  [`docs/reference/makemd-decision.md`](../reference/makemd-decision.md),
  decisões D1–D13; a resposta do mantenedor no mesmo dia: "Aceito todas
  (Recomendado)", e, sobre observar o make.md no Obsidian, "Pode, no
  Sandbox (Recomendado)".
- Status no briefing: não consta

## Contexto

O make.md é um plugin do Obsidian (MIT, 1.3.5) que faz pastas e tags
parecerem lugares: rótulos, uma página por pasta, ordem manual, fixados, um
banco de dados por pasta, e editar uma nota embutida onde ela está. Metade
dele o Verso já tem com outros nomes — as visões sobre a pasta
([0053](0053-views-bases.md)), o menu `/`, os templates, a página da pasta.
O [ADR 0003](0003-primitives-not-workarounds.md) pede que o que exige plugin
vire primitiva; o [ADR 0013](0013-degrades-to-markdown.md) proíbe que a parte
do make.md que guarda dados em SQLite dentro da pasta vire a verdade do
Verso. O memo mapeia cada funcionalidade (as tabelas L, N, F, T, C, E, X) e
cada configuração (o apêndice A).

## Decisão

1. **Escopo (D1).** A Fase 2 é ampliada, como foi para as visões e o board,
   para quatro fatias: **S1** rótulos, **S2** páginas de pasta, **S3**
   ordem, fixados e ocultar, **S4** editar uma nota embutida no lugar. A
   **S5** (páginas de tag, renomear tag) e a **S6** (importar os arquivos
   `.space/` do make.md) são decididas depois que a S4 estiver em uso. O
   critério de saída da Fase 2 não muda.
2. **Compatibilidade (D2).** O frontmatter é compartilhado com o make.md: as
   chaves `sticker`, `color`, `banner`, `banner_y` e `aliases`, com os
   valores do make.md (`emoji//1f3b2`, `lucide//home`, `ui//home`). Nada sob
   uma pasta `.space/` é gravado, nunca; a S6, quando decidida, lê
   `def.json`, `waypoints.json` e `context.mdb` por comando do usuário,
   pelo `verso-fs`, com o SQLite aberto em memória.
3. **Os rótulos de uma pasta (D3)** ficam no frontmatter da nota da pasta,
   com as mesmas chaves de uma nota. Uma pasta sem nota de pasta ganha uma
   ao receber o primeiro rótulo, depois de a janela perguntar.
4. **A ordem manual (D4)** é `order:` no frontmatter da nota da pasta: uma
   lista de nomes relativos à pasta; os itens fora dela vêm depois, na ordem
   da árvore. Os planos de renomear e mover regravam o `order:` — trabalho
   novo do core na S3. Ordenar uma pasta sem nota de pasta pergunta antes de
   criar uma.
5. **Os fixados (D5)** são `pinned:` no frontmatter da nota da pasta, uma
   lista de wikilinks entre aspas; pelo [ADR 0057](0057-board-json-canvas.md)
   eles formam uma relação tipada `pinned`, o que é intencional. Os focos
   esperam o [ADR 0041](0041-multi-root-workspace.md). Os favoritos ficam
   como estão.
6. **Palavras (D6).** "Página da pasta" / *folder page* e "página da tag" /
   *tag page*. "Space" continua sendo a área de trabalho (*área*).
7. **A tabela da página da pasta (D7).** Toda página de pasta mostra uma
   tabela dos itens: uma base não salva sobre a pasta, com as colunas das
   propriedades que os itens usam, gravada como `.base` na primeira vez que o
   usuário a muda.
8. **Editar um embute no lugar (D8).** Um embute `![[Nota]]` é editado onde
   está, no Editar e no Leitura, com o editor que o board põe num cartão: o
   mesmo salvamento, a mesma checagem de conflito (invariante 11). Sem
   sintaxe nova; o `![![Nota]]` do make.md não é lido até a observação O9 e
   uma questão da spec.
9. **O compositor de blocos (D9)** — os botões, colunas e avaliações do
   make.md, guardados em SQLite — espera o mês de uso.
10. **Tags (D10).** Páginas de tag, e renomear ou apagar uma tag nas notas
    como um plano de diffs (a regra do [0048](0048-file-operations-in-ui.md))
    — na S5.
11. **Figurinhas (D11)**: emoji e Lucide (`lucide-static`, ISC); nomes `ui//`
    mostrados como o gêmeo do Lucide onde houver, senão como o ícone padrão
    do item. Figurinhas de arquivos SVG da pasta, depois.
12. **Configurações (D12)**: uma seção "Organização" (*Organizing*) com as dez
    configurações da tabela D12 do memo e os padrões dela, e nenhuma outra. As
    chaves de frontmatter não são configurações.
13. **Observação (D13)**: as O1–O12 do memo são executadas no Obsidian antes
    da S3, com o make.md 1.3.5 instalado só no cofre Sandbox, numa pasta
    descartável, e removido depois; os resultados vão para
    [`docs/reference/obsidian-observations.md`](../reference/obsidian-observations.md)
    ([ADR 0009](0009-external-constraints.md): o make.md é plugin de
    terceiros; nada do app Obsidian é inspecionado).

As chaves de frontmatter que o Verso acrescenta — `order:`, `pinned:`,
`items_sticker:`, `items_color:`, `items_template:` — são extensões do Verso
aos arquivos do Obsidian (invariante 12: chaves novas, nenhum sentido
mudado), cada uma registrada na spec na fatia que a traz.

## Consequências

- Cada fatia é um pull request próprio, com este ADR revisto se algo dele
  mudar, as linhas do changelog nas duas línguas, a lição no cofre de
  demonstração e os passos do roteiro
  ([0058](0058-demo-vault-as-tutorial.md)), testes e2e vistos falhando antes
  da mudança, e o `scripts/check.sh` e o `scripts/check-linux.sh` verdes.
- "Ocultar da árvore" (S3) é uma lista na configuração do Verso que só a
  árvore filtra; **não** são os caminhos ignorados do
  [ADR 0044](0044-verso-fs-semantics.md), que tornam uma nota inalcançável.
- [ADR 0049](0049-phase-2-scope-widened.md) §3: a linha "os Contexts do
  make.md" deixa de valer — as visões foram o [0053](0053-views-bases.md),
  este ADR o resto.
- **Dependências:** `cldr-annotations-modern` é adicionada em `devDependencies` (licença Unicode-3.0) unicamente para o script de build offline `scripts/build-emoji-data.mjs` que gera `app/ui/src/emoji-data.json`; não é embutida na distribuição de execução do aplicativo.
- **Autoria.** O mantenedor delegou a implementação ao Antigravity em
  2026-10-02 ("vou delegar para o antigravity implementar o make md"): um
  desvio dos papéis do [ADR 0032](0032-author-and-reviewer-roles.md),
  registrado aqui. Cada pull request é lido por um modelo Claude (Fable 5.1,
  ou Opus onde o Fable não estiver disponível) numa sessão própria antes do
  merge.

## Alternativas descartadas

Do memo, cada uma pesada pelo mantenedor:

- Ler e gravar todos os arquivos do make.md, `.space/` e o SQLite dele
  incluídos (D2) — quebra o ADR 0013 e faz dos detalhes internos do make.md
  um contrato.
- Ignorar o make.md (D2) — um cofre rotulado no Obsidian perderia os rótulos.
- Os rótulos de uma pasta num arquivo do Verso dentro da pasta, ou na
  configuração do Verso (D3).
- Um `rank:` em cada nota (D4) — um arraste grava todos os irmãos, e um PDF
  ou uma subpasta não guardam chave; a ordem na configuração do Verso (D4) —
  perdida em outra máquina.
- Os fixados na configuração do Verso (D5).
- Renomear as áreas para ficar com "space" (D6).
- Só um bloco ` ```base ` que o usuário acrescenta, sem tabela padrão (D7).
- A sintaxe `![![Nota]]` do make.md (D8) — uma construção nova do dialeto.
- Um subconjunto do compositor de blocos em Markdown agora (D9).
- Só emoji (D11).

## Status

Em andamento / revisão (2026-10-02); fatias S1–S4 implementadas, aguardando revisão final e verificação.
