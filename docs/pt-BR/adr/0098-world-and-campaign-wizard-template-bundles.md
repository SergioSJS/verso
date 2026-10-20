# ADR 0098 — O assistente de projetos: uma árvore de pastas a partir de um pacote, mostrada e editável antes de ser escrita

- Data: 2026-10-17; reescrita em 2026-10-20
- Fonte: o mantenedor, em 2026-10-17, olhando o cofre de campanha "Dados
  Críticos" de Igor Téuri: *"ele funciona assim, criou automações no
  obsidian que replica 'mundos' a partir do padrão, então acho que podemos
  fazer nesse padrão, a partir de um cofre, vc abre algum tipo de criador
  de mundos/contexto que cria a pastinha do mundo com as sub-pastas
  seguindo um template base ou template que o usuário arrumou"*. O
  primeiro texto e o primeiro código, de outra IA (Gemini, no
  Antigravity), foram marcados como Aceitos sem aceitação; a revisão de
  2026-10-20 achou o assistente dando sucesso quando o núcleo tinha
  recusado todos os arquivos. As respostas do mantenedor de 2026-10-20 estão
  citadas nos itens; este texto substitui o primeiro.
- Relacionados: [0012](0012-files-are-source-of-truth.md),
  [0015](0015-schema-packs.md),
  [0019](0019-generative-opt-in-and-keychain.md),
  [0035](0035-cross-cutting-requirements.md),
  [0036](0036-tabletop-rpg-support.md),
  [0044](0044-verso-fs-semantics.md),
  [0048](0048-file-operations-in-ui.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0103](0103-feature-presets-and-capability-flags.md).
- Status no briefing: não presente.

## Contexto

Começar um livro, um mundo ou uma campanha significa as mesmas pastas e as
mesmas primeiras notas a cada vez. No Obsidian, cofres como o Dados
Críticos fazem isso com scripts do Templater — JavaScript executado a
partir de uma nota. O Verso não executa código de uma nota; um pacote que
apenas *declara* pastas e arquivos faz o mesmo trabalho com segurança, e
pode vir de qualquer lugar, de uma IA inclusive, o que o torna entrada não
confiável.

## Decisão

Aceita em 2026-10-20 para os itens marcados `[DECIDIDO 2026-10-20]`, nas
palavras do mantenedor; o resto repete o primeiro texto como construído e
revisado; `[PROPOSTO]` marca um detalhe que ele não leu.

1. **O assistente.** "Novo projeto a partir de um pacote…", pela paleta e
   pela árvore de arquivos: um nome, uma pasta de destino, um pacote. Todo
   pacote é listado; nenhum é escondido pelas funcionalidades da
   [0103](0103-feature-presets-and-capability-flags.md), cuja chave
   "Assistente de projetos" esconde apenas o próprio assistente.

2. **Um pacote declara, e nada mais.** JSON: `folders` (caminhos
   relativos) e `files` (um caminho, um objeto de frontmatter opcional,
   conteúdo Markdown; um arquivo `.canvas` ou `.base` mantido como é).
   Nenhum script, nenhum código. `[PROPOSTO]`: os pacotes que uma pessoa
   importa ficam na pasta, em `.verso/bundles/<id>.json`, pelos mesmos
   comandos do contrato que os layouts ([0099](0099-visual-markdown-statblocks-and-cards.md)
   item 2), de modo que uma pasta compartilhada os compartilha; uma
   importação com o id de outro pacote recebe um id novo e avisa.

3. **A árvore é mostrada, e pode ser alterada, antes de qualquer coisa ser
   escrita.** `[DECIDIDO 2026-10-20]`: *"15. sim, com opção de mudar"*. Uma
   execução de ensaio planeja cada pasta e cada arquivo; a pessoa vê a
   árvore, desmarca o que não quer (o que está dentro de uma pasta
   desmarcada vai junto) e renomeia entradas; o plano editado é conferido de
   novo; só então é escrito.

4. **Nada é sobrescrito, e cada resposta é lida.** As escritas passam pelo
   contrato até o `verso-core` e o `verso-fs` ([0044](0044-verso-fs-semantics.md)):
   um arquivo que existe é recusado pelo núcleo, nunca substituído. O
   assistente lê a resposta do núcleo a cada escrita, conta só o que foi
   criado, lista o que já existia e o que foi recusado e por quê, e
   continua aberto quando algo não passou.

5. **A entrada não confiável é limitada e conferida.** Um caminho com `..`,
   um caminho absoluto, um nome que outro sistema operacional não consegue
   guardar ([0070](0070-what-travels-with-the-folder.md) item 3) ou uma
   escrita em `.verso`, `.obsidian` ou `.git` é recusado antes de o ensaio
   terminar. Limites: 200 pastas, 500 arquivos, 256 KB por arquivo, 4 MB no
   total, 8 níveis; `[PROPOSTO]` as 200 pastas contam os ancestrais que o
   plano cria. Um pacote colado é limitado antes de ser lido.

6. **O frontmatter é escrito por uma biblioteca de YAML**, de modo que
   `Taverna #3`, `05`, `2026-10-17`, `yes` e `[[link]]` continuam sendo o
   que eram.

7. **Marcadores.** Os dos Modelos do núcleo do Obsidian: `{{title}}`,
   `{{date}}`, `{{time}}`, `{{date:FORMATO}}` `[PROPOSTO]`; o próprio do
   Verso: `{{uuid}}`. Qualquer outra marca, `<% … %>` inclusive, é mantida
   como foi escrita.

8. **Copiar um prompt para uma IA.** `[DECIDIDO 2026-10-20]`: o botão fica
   visível (*"16. pq fica desligada por padrão? não entendi"*). Ele copia o
   esquema e as instruções do pacote para a área de transferência e não
   envia nada a lugar nenhum, de modo que não é uma das funcionalidades
   generativas da [0019](0019-generative-opt-in-and-keychain.md). Um pacote
   colado de volta que não valida recebe uma mensagem que nomeia cada campo
   com defeito, pronta para ser colada de volta na IA.

9. **O pacote Dados Críticos.** `[DECIDIDO 2026-10-20]`: *"o Igor Téuri é
   meu amigo, ele autorizou a gente a copiar a estrutura"*. O pacote de
   campanha segue a estrutura do cofre dele, diz isso na descrição e consta
   na página de Créditos.

10. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
    cada palavra do assistente em pt-BR e EN, os nomes e as descrições dos
    pacotes também; `[PROPOSTO]` os nomes de pastas e notas dos pacotes e
    os conteúdos também no idioma da pessoa. Rótulos ligados aos seus
    campos, abas com papéis e setas, o resultado numa região viva.

## Consequências

- `app/ui/src/bundles/`: `types.ts` (o esquema), `plan.ts` (o ensaio e suas
  conferências), `run.ts` (escrever pelo contrato e ler cada resposta),
  `presets.ts` (os pacotes embutidos), `systemPrompt.ts`;
  `app/ui/src/dialogs/worldWizard.ts`.
- Rust, com o item 2: comandos do contrato para `.verso/bundles/`.

## Alternativas descartadas

- **Executar scripts no estilo do Templater**: código de uma nota, em toda
  máquina que a abre.
- **Contar uma escrita como feita sem ler a resposta** (a primeira
  construção): dava um mundo como criado quando nada tinha sido.

## Status

Aceita (2026-10-20) para os itens marcados `[DECIDIDO 2026-10-20]`; os
detalhes `[PROPOSTO]` esperam a leitura do mantenedor.
