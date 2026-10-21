# Revisão crítica — a rodada da noite de 2026-10-21 (`feat/rpg-tools`, `345eed15..HEAD`)

- Data: 2026-10-21
- Revisor: Fable 5.1, somente leitura, numa sessão que recebeu o repositório
  e o diff e não as sessões dos autores
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). Três subagentes
  Sonnet leram as áreas 4 a 6; o revisor reverificou cada achado deles no
  código, e marcou PLAUSÍVEL os que não pôde confirmar.
- Autor do que está em revisão: agentes Sonnet 5.5 coordenados pela Opus 5.5
  (107 commits, 502 arquivos).
- Corretores: agentes Sonnet 5.5, os documentos e as fixtures rascunho em
  `docs/review-docs`, o código em branches paralelos.
- Entrada: o arquivo de revisão do revisor
  (`verso-revisao-fable-2026-10-21.md`, fora do repositório) e o branch
  `feat/rpg-tools`.
- Nada neste documento decide nada. Uma resolução que precisa do mantenedor
  diz isso. "Corrigido em `docs/review-docs`, aguardando integração" quer
  dizer um commit nesse branch, ainda não integrado e ainda não lido pelo
  outro modelo.

## Resumo

| | Achados |
|---|---|
| BLOQUEANTE | 1 |
| IMPORTANTE | 7 (I1 a I7) |
| MENOR | 14 (M1 a M14) |

O núcleo e o servidor se sustentaram: a escrita atômica mantém as
invariantes 9 e 11, `read_picked` e o `pick_files` do host entregam à janela
um nome e bytes e nunca um caminho, os callouts aninhados andam com uma pilha,
o BOM é pulado sem nunca escrever, e os links de leitura (ADR 0105) são
confinados pelo mesmo escopo de um compartilhamento, servidos pela projeção do
leitor, com ritmo por link e por endereço, o token guardado como hash e os
cabeçalhos do item 9 da 0083 testados. Nenhum `expected.yaml` ou `input.md`
existente mudou.

O único achado BLOQUEANTE é por definição e não por mérito: uma fixture
rascunho sem `observed:` nem `source:`. Os IMPORTANTES são dois buracos nos
links de leitura, uma contradição na ADR 0105, documentos que ainda diziam
"nada construído", e dois limites do diagrama de dados e do quadro de embed.

## 1. BLOQUEANTE

| # | Achado | Resolução |
|---|---|---|
| B1 | `fixtures/callout/nested/expected.yaml` (rascunho deste lote) não tem `observed:` nem `source:` (invariante 17; spec §4.5); o `scripts/check-fixtures.sh` nunca exigiu nenhum | Corrigido em `docs/review-docs`, aguardando integração: `source:` cita a Q5 da spec decidida em 2026-10-21 (o limite de 32 e o `depth` são do Verso); `observed:` registra o aninhamento visto pela CLI do Obsidian (o cache dele lista uma seção `callout` por nota, não as internas). O `check-fixtures.sh` agora falha uma fixture sem as duas chaves; todas as outras já tinham uma |

## 2. IMPORTANTE

| # | Achado | Resolução |
|---|---|---|
| I1 | Um visitante anônimo de um link de leitura pode rodar `reindex` na pasta do dono no ritmo dos comandos (`visit.rs` `OWN`, `rpc.rs`) | Código; entregue aos corretores de código em paralelo. Resolução a registrar quando for integrado |
| I2 | Um link de uma nota mostra o nome da pasta ao visitante, contra o item 6 da 0105 e o teste do link de pasta (`readlinks.rs` `name_of`, `visit.rs`) | Código; entregue aos corretores de código em paralelo. Resolução a registrar quando for integrado |
| I3 | O item 5 da 0105 diz "guardado só como hash" e "copiável de novo pelo painel enquanto vive"; a construção e o modelo de ameaças ficaram com só o hash | Registrado, não resolvido, em `docs/review-docs` (aguardando integração): uma linha `[ABERTO]` sob o item 5 da 0105 (nos dois idiomas) com a contradição e o que foi construído. O mantenedor responde (RL.1a): emendar o item 5, ou guardar o token cifrado em repouso |
| I4 | As ADRs 0105, 0100 e 0106, o índice de ADRs e as linhas V.28, V.30, V.31 e V.32 do roadmap diziam "nada construído"; a 0105 não tinha linha no roadmap | Corrigido em `docs/review-docs`, aguardando integração: um parágrafo "Como construído em 2026-10-21" com os commits em cada ADR, as linhas do índice, as quatro linhas do roadmap conferidas com o `git log`, uma linha nova V.33 para a 0105, revisão 12 do roadmap |
| I5 | Diagrama de dados: aliases de YAML resolvem em tempo quadrático (`datagraph/yamlParse.ts`) | Código; entregue aos corretores de código em paralelo |
| I6 | PLAUSÍVEL: o diagrama de dados limita bytes (20 MiB), não caixas (`datagraph/model.ts`, `view.ts`) | Código; entregue aos corretores de código em paralelo |
| I7 | PLAUSÍVEL: o sandbox `allow-scripts allow-same-origin` do quadro de embed não tem guarda contra a origem do próprio app (`screen/framed.ts`, `leaves/web.ts`) | Código; entregue aos corretores de código em paralelo |

## 3. MENOR

| # | Achado | Resolução |
|---|---|---|
| M1 | Spec Q24 (b): a decisão diz que `tags: 2024` é a tag "2024"; a construção faz o contrário, pela própria cláusula da decisão, sem dizer que espera o mantenedor | Corrigido em `docs/review-docs`, aguardando integração: um parágrafo datado "Ajustado pela construção" sob a decisão, para (a) `...` não construído (DL.1) e (b) um número não é tag (DL.2). O texto da decisão fica como registrado |
| M2 | A seção 9 da spec marca várias questões `DECIDIDA` enquanto cada uma diz que nenhuma está rascunhada | Não é achado de regra zero (decidida não é fechada, spec v0.47). Sem mudança; um marcador distinto é escolha do mantenedor |
| M3 | A ADR 0106 e a V.30 do roadmap dizem sete formatos; o código lê também TSV | Corrigido em `docs/review-docs`, aguardando integração: registrado como nota de como construído, não como decisão, na 0106 e na V.30; o título da 0106 no índice não diz mais só "JSON e YAML". Se o TSV fica é do mantenedor |
| M4 | A linha do CLAUDE.md para o item 9 da 0083 lista só `/`, `/api/state` e `/f/`; as ADRs 0083 e 0045 não têm linha de Revisões para a primeira superfície aberta a um visitante sem conta | Corrigido em `docs/review-docs`, aguardando integração: a linha nomeia as rotas do link de leitura; uma linha de Revisões datada na 0083 e na 0045 |
| M5 | `verso-fs` `check()` informa o caminho antes de `kept_spelling` (`write.rs`) | Código; entregue aos corretores de código em paralelo |
| M6 | `read_picked`: `metadata` e depois `open` (TOCTOU) (`external.rs`) | Código; entregue aos corretores de código em paralelo |
| M7 | A decodificação de entidades XML consulta um objeto simples (`datagraph/xml.ts`) | Código; entregue aos corretores de código em paralelo |
| M8 | "Salvar como board" escreve texto de célula como Markdown cru (`datagraph/saveBoardDoc.ts`) | Código; entregue aos corretores de código em paralelo |
| M9 | `framed.ts` guarda na sessão um `embed_frameable` que falhou; `sanitize.ts` deixa o botão de aprovar desabilitado sem mensagem | Código; entregue aos corretores de código em paralelo |
| M10 | A ADR 0099 listava duas alternativas descartadas que ninguém está registrado como tendo considerado | Corrigido em `docs/review-docs`, aguardando integração: as duas retiradas, "Nenhuma outra registrada", uma linha de Revisões (regra zero, item 4). As duas marcadas "a primeira construção" não estavam no achado e ficam |
| M11 | O documento de revisão desta rodada ainda chamava a 0100 de "Proposta / Adiada"; a ADR 0096 e a linha dela no índice ainda diziam "Não construído" | Corrigido em `docs/review-docs`, aguardando integração: as três linhas de `2026-10-20-rpg-round.md` atualizadas; a 0096 ganha uma correção datada (construída, integração `404ba0d4`) e a linha do índice diz construído |
| M12 | `frontmatter/yaml-12` observou a data sob a chave `d`, a fixture usa `when`; `frontmatter/tags-hash` observou só `"#quoted"`; um comentário velho em `crates/verso-dialect/src/tags.rs:6-8` | Fixtures corrigidas em `docs/review-docs`, aguardando integração: reobservadas com as entradas exatas pela CLI do Obsidian, os resultados são iguais aos valores esperados, só o texto de `observed:` mudou. O comentário velho é código e fica com os corretores de código |
| M13 | Pequenas coisas na janela (`bundles/plan.ts`, `statblock/inherit.ts`, `datagraph/store.ts`, `theme/actions.ts`, `attachName.ts`) | Código; entregue aos corretores de código em paralelo |
| M14 | O `hello` e o `app_info` de um link de leitura dão ao visitante a versão e o commit do servidor; `PASSPHRASE_LEAST = 6` é curta | Dentro do que a 0105 decidiu; anotado para o mantenedor, nada mudou |

## 4. Verificado e achado em ordem

A lista do revisor do que leu e achou certo: a escrita do `verso-fs` e o
`read_picked`; o `pick_files` do host; os callouts aninhados e o BOM do
dialeto; os ancestrais de tag do índice; o grafo de links não resolvidos e o
tema recomendado do núcleo; o escopo, o visitante, o token, a senha, os
limites, os cabeçalhos e o lado do dono no servidor; a importação de tema, o
diagrama de dados, os pacotes e as outras partes que ele nomeia na janela; as
sete fixtures novas e a spec; as atribuições e os espelhos dos documentos.
Veja o arquivo dele para cada uma.

## 5. Não feito

O revisor não construiu nem executou nada (sem cargo, npm nem Playwright); o
`kept_spelling`, só do Windows, foi lido e não exercitado; I6 e I7 são
PLAUSÍVEIS por isso. A ADR 0104, no diretório principal, não foi revisada.
