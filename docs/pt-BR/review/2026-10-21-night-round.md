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
  diz isso. "Corrigido em `docs/review-docs`, integrado em `4499898a`" quer
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
| B1 | `fixtures/callout/nested/expected.yaml` (rascunho deste lote) não tem `observed:` nem `source:` (invariante 17; spec §4.5); o `scripts/check-fixtures.sh` nunca exigiu nenhum | Corrigido em `docs/review-docs`, integrado em `4499898a`: `source:` cita a Q5 da spec decidida em 2026-10-21 (o limite de 32 e o `depth` são do Verso); `observed:` registra o aninhamento visto pela CLI do Obsidian (o cache dele lista uma seção `callout` por nota, não as internas). O `check-fixtures.sh` agora falha uma fixture sem as duas chaves; todas as outras já tinham uma |

## 2. IMPORTANTE

| # | Achado | Resolução |
|---|---|---|
| I1 | Um visitante anônimo de um link de leitura pode rodar `reindex` na pasta do dono no ritmo dos comandos (`visit.rs` `OWN`, `rpc.rs`) | Corrigido `9fbe186f` (merge `fd894050`): o `reindex` de um visitante responde o resumo atual e não percorre nada; teste `a_visitors_reindex_walks_nothing` |
| I2 | Um link de uma nota mostra o nome da pasta ao visitante, contra o item 6 da 0105 e o teste do link de pasta (`readlinks.rs` `name_of`, `visit.rs`) | Corrigido `6c702c2b` (merge `fd894050`): o link de uma nota leva o nome da nota; o nome da pasta não atravessa nem as informações do link nem o `/state` (o teste afirma); a janela do visitante não aplica a regra da nota da pasta |
| I3 | O item 5 da 0105 diz "guardado só como hash" e "copiável de novo pelo painel enquanto vive"; a construção e o modelo de ameaças ficaram com só o hash | Registrado, não resolvido, em `docs/review-docs` (integrado em `4499898a`): uma linha `[ABERTO]` sob o item 5 da 0105 (nos dois idiomas) com a contradição e o que foi construído. O mantenedor responde (RL.1a): emendar o item 5, ou guardar o token cifrado em repouso |
| I4 | As ADRs 0105, 0100 e 0106, o índice de ADRs e as linhas V.28, V.30, V.31 e V.32 do roadmap diziam "nada construído"; a 0105 não tinha linha no roadmap | Corrigido em `docs/review-docs`, integrado em `4499898a`: um parágrafo "Como construído em 2026-10-21" com os commits em cada ADR, as linhas do índice, as quatro linhas do roadmap conferidas com o `git log`, uma linha nova V.33 para a 0105, revisão 12 do roadmap |
| I5 | Diagrama de dados: aliases de YAML resolvem em tempo quadrático (`datagraph/yamlParse.ts`) | Corrigido `b256f9e9` (merge `fc41153f`): âncoras guardadas num mapa conforme o percurso abre os nós; 100 000 aliases leem em menos de 3 s (mais de 120 s antes) |
| I6 | PLAUSÍVEL: o diagrama de dados limita bytes (20 MiB), não caixas (`datagraph/model.ts`, `view.ts`) | Corrigido `b256f9e9` (merge `fc41153f`): acima de 200 000 caixas o diagrama não é montado e a aba diz por quê, ficando no texto (a opção recomendada da pergunta aberta D.1 do mantenedor); "Salvar como board" recusa acima de 2000 cartões |
| I7 | PLAUSÍVEL: o sandbox `allow-scripts allow-same-origin` do quadro de embed não tem guarda contra a origem do próprio app (`screen/framed.ts`, `leaves/web.ts`) | Corrigido `f0f60899` (merge `fc41153f`): `isAppOrigin()` — a origem do próprio app, `tauri:`, `verso:`, `tauri.localhost` — nunca é incorporada, antes de qualquer checagem |

## 3. MENOR

| # | Achado | Resolução |
|---|---|---|
| M1 | Spec Q24 (b): a decisão diz que `tags: 2024` é a tag "2024"; a construção faz o contrário, pela própria cláusula da decisão, sem dizer que espera o mantenedor | Corrigido em `docs/review-docs`, integrado em `4499898a`: um parágrafo datado "Ajustado pela construção" sob a decisão, para (a) `...` não construído (DL.1) e (b) um número não é tag (DL.2). O texto da decisão fica como registrado |
| M2 | A seção 9 da spec marca várias questões `DECIDIDA` enquanto cada uma diz que nenhuma está rascunhada | Não é achado de regra zero (decidida não é fechada, spec v0.47). Sem mudança; um marcador distinto é escolha do mantenedor |
| M3 | A ADR 0106 e a V.30 do roadmap dizem sete formatos; o código lê também TSV | Corrigido em `docs/review-docs`, integrado em `4499898a`: registrado como nota de como construído, não como decisão, na 0106 e na V.30; o título da 0106 no índice não diz mais só "JSON e YAML". Se o TSV fica é do mantenedor |
| M4 | A linha do CLAUDE.md para o item 9 da 0083 lista só `/`, `/api/state` e `/f/`; as ADRs 0083 e 0045 não têm linha de Revisões para a primeira superfície aberta a um visitante sem conta | Corrigido em `docs/review-docs`, integrado em `4499898a`: a linha nomeia as rotas do link de leitura; uma linha de Revisões datada na 0083 e na 0045 |
| M5 | `verso-fs` `check()` informa o caminho antes de `kept_spelling` (`write.rs`) | Corrigido `6ff62f45` (merge `fd894050`) |
| M6 | `read_picked`: `metadata` e depois `open` (TOCTOU) (`external.rs`) | Corrigido `5b003dfb` (merge `fd894050`): abre primeiro (`O_NONBLOCK` no Unix) e julga pelos metadados do próprio handle |
| M7 | A decodificação de entidades XML consulta um objeto simples (`datagraph/xml.ts`) | Corrigido `50787bc0` (merge `fc41153f`) |
| M8 | "Salvar como board" escreve texto de célula como Markdown cru (`datagraph/saveBoardDoc.ts`) | Corrigido `1b60f845` (merge `fc41153f`): chaves e valores escritos em code spans |
| M9 | `framed.ts` guarda na sessão um `embed_frameable` que falhou; `sanitize.ts` deixa o botão de aprovar desabilitado sem mensagem | Corrigido `f0f60899` (merge `fc41153f`): só uma resposta definitiva fica guardada, uma falha é perguntada de novo em 30 s; uma aprovação recusada diz por quê |
| M10 | A ADR 0099 listava duas alternativas descartadas que ninguém está registrado como tendo considerado | Corrigido em `docs/review-docs`, integrado em `4499898a`: as duas retiradas, "Nenhuma outra registrada", uma linha de Revisões (regra zero, item 4). As duas marcadas "a primeira construção" não estavam no achado e ficam |
| M11 | O documento de revisão desta rodada ainda chamava a 0100 de "Proposta / Adiada"; a ADR 0096 e a linha dela no índice ainda diziam "Não construído" | Corrigido em `docs/review-docs`, integrado em `4499898a`: as três linhas de `2026-10-20-rpg-round.md` atualizadas; a 0096 ganha uma correção datada (construída, integração `404ba0d4`) e a linha do índice diz construído |
| M12 | `frontmatter/yaml-12` observou a data sob a chave `d`, a fixture usa `when`; `frontmatter/tags-hash` observou só `"#quoted"`; um comentário velho em `crates/verso-dialect/src/tags.rs:6-8` | Fixtures corrigidas em `docs/review-docs`, integrado em `4499898a`: reobservadas com as entradas exatas pela CLI do Obsidian, os resultados são iguais aos valores esperados, só o texto de `observed:` mudou. O comentário velho é código e fica com os corretores de código |
| M13 | Pequenas coisas na janela (`bundles/plan.ts`, `statblock/inherit.ts`, `datagraph/store.ts`, `theme/actions.ts`, `attachName.ts`) | Corrigido `8fac165e` (merge `fc41153f`), cada parte com um teste |
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

## 6. Depois das correções

Todos os achados, menos o I3 (do mantenedor, RL.1a), estão resolvidos e
integrados em `feat/rpg-tools` (documentos `4499898a`, janela `fc41153f`,
servidor `fd894050`; o teste de validade com folga para uma máquina lenta
`4bea8397`). Checagens em `4bea8397`, 2026-10-21: macOS — fmt, clippy
`-D warnings`, 1277 testes Rust, bindings, wasm32, 1291 testes de unidade da
janela, tamanhos, espelho, fixtures, cofres de exemplo, licenças npm; Linux
(`scripts/check-linux.sh`) — 1267 testes Rust e a imagem, a unit e o script
de backup do servidor; Windows (`scripts/check-windows.sh`) — 1243 testes e o
clippy; a suíte de ponta a ponta da janela no Docker, WebKit e Chromium com
os projetos de celular e tablet — 1269 passaram, 0 falharam. Sem push, sem
versão; o beta em `4bea839` instalado no Mac do mantenedor. O app real não
foi exercitado à mão.

## 7. As respostas do mantenedor de 2026-10-21

O mantenedor respondeu a lista de decisões de 2026-10-21 (`[DECIDIDO
2026-10-21]`) e olhou o beta instalado em `4bea839`. Os itens que não têm uma
ADR própria ficam registrados aqui; os outros estão no documento que cada um
nomeia.

- **I3 resolvido** (RL.1a, opção A): só o hash; o endereço mostrado uma vez.
  [ADR 0105](../adr/0105-read-links-without-an-account.md) item 5.
- **M1 resolvido** (DL.1, opção A; DL.2, opção **B**): `...` não fecha o
  frontmatter; `tags: 2024` **é** a tag "2024", escolha explícita do
  mantenedor, que difere do Obsidian (spec Q24, v0.48). **M3 resolvido** (D.4,
  opção A): o TSV fica ([ADR 0106](../adr/0106-structured-data-as-a-diagram.md)).
- **F.1, opção A: onde ficam as dobras lembradas.** Neste aparelho, fora da
  nota e da pasta; as últimas 200 notas são lembradas. A nota nunca é
  reescrita; outro aparelho abre tudo expandido. (Não na conta do usuário, não
  no `.verso/`.)
- **M.1, opção A: o menu do botão direito agrupado** como construído
  (`menu.ts`). "Selecionar" e "Abrir em nova janela" não voltam ao topo.
- **R.3, opção A:** "Adicionar propriedade" continua sempre visível em toda
  nota, também no celular, onde não há "passar o mouse".
- **R.4, opção A:** nenhum selo de recarga nas fichas (`recharge 5-6`) por
  agora; nenhuma ADR pede.
- **L.1, opção A:** os rótulos genéricos das fichas do Old Dragon (Descrição,
  Tamanho, Alinhamento, Habitat, Atributos, Idiomas, Utilidades) ganham
  rótulos em inglês na janela em inglês, mantendo as siglas do jogo (CA, BA,
  JP), como as do Fractal já têm.
- **X.1, opção A:** a exceção de três avisos "sem manutenção" no `deny.toml`
  está ratificada até 2026-12-31 (rever quando os plugins do Tauri trocarem de
  biblioteca).
- **O beta, visto pelo mantenedor:** *"Quase tudo ok, exceto a parte do wizard
  de tema, achei a tela mega poluída…"*: o wizard de tema é revisado ([ADR
  0100](../adr/0100-visual-customization-wizard.md) item 2). Ele leu as
  traduções do cofre de exemplo em inglês; nada mais foi apontado contra elas.
