# Revisão crítica — Fase 2 (a janela, e o que a Fase 1 ganhou por baixo dela)

- Data: 2026-09-23
- Revisor: Opus 5.5, no papel de revisor do Rust do core que a
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) dá à "Opus 5" (a Opus
  5.5 ocupa essa linha; nada mais registra isso); para a UI, a
  leitura que o mantenedor escolheu quando pôs o Fable 5.1 para escrevê-la
  ([ADR 0049](../adr/0049-phase-2-scope-widened.md))
- Autor do código revisado: Fable 5.1
- Entrada: cinco leituras, cada uma na sua sessão, da branch
  `phase1-2/integration` em `bd27c92` (48 commits sobre a `main`), sem acesso à
  sessão do autor. Cada leitura pegou uma fatia: o host Tauri; o sistema de
  arquivos, o core e o contrato; o dialeto, o índice, a CLI e o CI; as escritas
  e a segurança da UI; a correção, o idioma e a acessibilidade da UI.
- Item do roadmap: Fase 2, itens 2.1 a 2.7, e o que a
  [ADR 0049](../adr/0049-phase-2-scope-widened.md) acrescenta a eles
  ([`../roadmap.md`](../roadmap.md)).
- Estado: todo achado BLOQUEANTE das cinco leituras está resolvido — no
  código, ou, para a leitura 3, achado 4, pela emenda do mantenedor ao ponto 3
  da Q12 da spec em 2026-09-23; uma segunda rodada de leituras das correções não achou
  BLOQUEANTE novo, e os IMPORTANTES dela estão corrigidos (seção 7). O que
  esperava o mantenedor está na seção 6, com a resposta do mantenedor de
  2026-09-23 embaixo de cada item; o que as respostas mudaram fecha a seção 7.
  Nada neste documento decide uma questão `[ABERTO]`.

## Como ler

Cada leitura é uma seção, com os achados na ordem e com a classificação que a
leitura deu. A coluna "Resolução" diz onde o achado foi corrigido, ou que foi
mantido e por quê, ou que é do mantenedor. Nenhum achado propõe decisão: onde
uma decisão é necessária, a linha diz o que precisa ser decidido, e a seção 6
a lista.

| Nível | Significado ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOQUEANTE | Viola invariante, guardrail ou decisão; ou perde dado. Impede merge |
| IMPORTANTE | Deve ser resolvido, ou explicitamente adiado com registro |
| MENOR | A critério do autor |

Vários achados foram feitos duas vezes, por duas leituras olhando o mesmo
código de lados diferentes; cada um mantém a sua linha, e a segunda aponta para
a primeira.

## Resumo

| Leitura | Fatia | BLOQUEANTE | IMPORTANTE | MENOR |
|---|---|---|---|---|
| 1 | O host Tauri (`app/src-tauri`) | 2 | 4 | 5 |
| 2 | `verso-fs`, `verso-core`, `verso-contract` | 3 | 6 | 5 |
| 3 | `verso-dialect`, `verso-index`, `verso-cli`, `verso-bench`, CI | 4 | 12 | 5 |
| 4 | A UI: escritas e segurança | 11 | 3 | 4 |
| 5 | A UI: correção, idioma, acessibilidade | 5 | 14 | 4 |

Vinte e cinco achados BLOQUEANTES ao todo, vários achados duas vezes, de
dois lados. Eles se agrupam: escritas que podiam cair por cima de texto que o
usuário nunca viu (uma revisão tirada de uma releitura, uma confirmação que
nunca perguntava, um aviso que podia ser contornado, recargas forçadas, um
clique em tarefa sobre texto velho); conteúdo da pasta agindo sobre a janela
(HTML cru, um SVG num frame, o protocolo de arquivos, navegação); bytes
reescritos que ninguém tocou (UTF-8 com perda, quebras de linha); caminhos
absolutos cruzando o contrato; um pânico que parava todo comando seguinte; e
um teste vermelho. Vinte e quatro foram corrigidos no código; o último
(leitura 3, achado 4), o índice se afastando do ponto 3 da Q12 fechada, foi
resolvido pelo mantenedor, que emendou o ponto 3 em 2026-09-23.

---

## 1. Primeira leitura — o host Tauri

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | O `verso://` servia os arquivos da pasta sem isolamento: um SVG saía como `image/svg+xml` sem política, o HTML da nota chegava ao `innerHTML` com o HTML cru intacto, e a CSP da janela permitia `frame-src` e `object-src verso:`. O Tauri conta o esquema como origem local, então um SVG da pasta podia rodar como documento que lê o resto da pasta. Conteúdo da pasta é entrada não confiável ([ADR 0045](../adr/0045-server-and-mcp-security.md)) | **Corrigido** em `af5a84b`: toda resposta leva `Content-Security-Policy: sandbox; default-src 'none'…` e `nosniff`, e a CSP da janela diz `object-src 'none'`. `frame-src verso:` fica para o visualizador de arquivos HTML, cujas respostas agora vêm em sandbox. O HTML da nota também é sanitizado na UI (leitura 4, achado 1) |
| 2 | BLOQUEANTE | `Access-Control-Allow-Origin: *` nas respostas de arquivo, e o esquema atendia toda web view, inclusive as que mostram sites | **Corrigido** em `af5a84b`: o CORS é respondido só para a origem do app, e um pedido de qualquer view que não seja `main` ou `note-*` é recusado. Testado |
| 3 | IMPORTANTE | As capabilities não restringiam os comandos do app: sem manifesto do app, qualquer documento que o Tauri considera local chamava todos os comandos | **Corrigido** em `af5a84b`: um manifesto do app no `build.rs`, e os comandos concedidos só às web views `main` e `note-*`. O teste chama a partir da web view de um site e de uma origem remota e é recusado; visto falhando contra o `build.rs` e a capability antigos |
| 4 | IMPORTANTE | O protocolo servia notas, embora o comentário dele dissesse que não | **Corrigido** em `af5a84b`: `.md`, em qualquer caixa, é recusado; notas cruzam só pelo `read_note`. O "duplicar" da UI lia notas pelo protocolo e agora as lê pelo contrato (`369e738`) |
| 5 | IMPORTANTE | Os comandos de web view confiavam em rótulos escolhidos pela UI e os procuravam no app inteiro: duas janelas colidiam em `web-1`, uma janela podia mover, esconder, dirigir ou fechar a página de outra, e o `web_nav` podia apontar a `main` para um site | **Corrigido** em `af5a84b`: o host emite o rótulo, registra a janela que abriu a view, e só essa janela age sobre ela |
| 6 | IMPORTANTE | Nenhuma política de navegação ou de janela nova: uma página numa web view podia navegar para `verso://` ou `tauri://`, ambas origens locais | **Corrigido** em `af5a84b` para web views (só http e https, nenhuma janela nova); para `main` e `note-*` em `3340a3f`: uma guarda para toda web view; as views do app ficam nas páginas do app e no protocolo de arquivos (o tratador é chamado também para frames, e o visualizador de HTML é um) |
| 7 | MENOR | `img-src https:` deixa o HTML de uma nota carregar recursos remotos quando a nota é mostrada; com `style-src 'unsafe-inline'`, HTML cru pode reestilizar o app | `<style>` não chega mais à página (leitura 4, achado 1). Imagens remotas ficam, como no Obsidian; registrado na [ADR 0049](../adr/0049-phase-2-scope-widened.md) e em `docs/reference/app-decision.md` §7. Aceito pelo mantenedor em 2026-09-23, com um ajuste "carregar conteúdo remoto" ([ADR 0050](../adr/0050-outbound-network-access.md), `c8109b8`; seção 6, item 5) |
| 8 | MENOR | Um caminho recusado em `create_folder` respondia `failed`, não `refused` | **Corrigido** em `3340a3f`: o caminho é confinado primeiro, então um recusado responde `refused` |
| 9 | MENOR | `IndexSummary.problems` cruzava como texto de debug do Rust, impossível de traduzir | **Corrigido** em `3340a3f`: uma linha legível por problema, com caminhos relativos à pasta |
| 10 | MENOR | `core:default` não concede `set-focus`, então o foco que a UI pede ao abrir uma nota era negado | **Corrigido** em `af5a84b` |
| 11 | MENOR | O único teste chamava a partir da `main`; nada verificava uma recusa | **Corrigido** em `af5a84b` (o teste do achado 3) |

## 2. Segunda leitura — `verso-fs`, `verso-core`, `verso-contract`

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | `write_note` e `write_text` devolviam a revisão de uma releitura, não a dos bytes que escreveram. Outro app salvando entre o rename e a releitura fazia o próximo salvamento do Verso passar na verificação e sobrescrever aquela edição, sem diff (reproduzido na 23ª tentativa de um loop). Invariante 11 | **Corrigido** em `3340a3f`: a resposta é o texto de quem chamou com a revisão desses bytes; um carimbo que a escrita não conseguiu confirmar só vale enquanto o arquivo ainda guarda esses bytes. Teste `write_note_answers_the_text_and_revision_of_the_bytes_it_wrote` |
| 2 | BLOQUEANTE | Texto que não é UTF-8 era decodificado com perda e escrito de volta: um `é` Latin-1 virou `EF BF BD` no disco quando um plano de renomeação foi aplicado, e o diff do plano mostrava só o link. Invariante 8 | **Corrigido** em `3340a3f`: UTF-8 estrito; um arquivo assim dá `not_text` a todo editor (e ao `verso mcp`, `ca264f0`) e fica fora dos planos como pulado. A Q25 da spec foi fechada em 2026-09-23 como o código faz (seção 6, item 4) |
| 3 | BLOQUEANTE | Caminhos absolutos cruzavam o contrato: `FolderInfo.folder`, o caminho que `open_folder` recebia, e o alvo de uma escrita por symlink nos avisos. Regra 4 da [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) | **Corrigido** em `3340a3f`: a pasta cruza como nome e chave opaca; o host roda o seletor de pasta e guarda o caminho; o alvo de um symlink é nomeado relativo à pasta, ou só como fora dela |
| 4 | IMPORTANTE | O plano de reescrita de links casava texto e ignorava para onde cada link resolvia: redirecionava links quando duas notas têm o mesmo nome, quando o nome novo já existe em outro lugar, e para anexos de mesmo nome; mover podia mudar em silêncio a nota que um nome solto alcança sem planejar nada; reescrevia dentro de código | **Corrigido** em `3340a3f`: as notas são lidas antes da mudança com o que cada link alcançava; depois dela, só os links cujo alvo mudou são reescritos, numa forma que o alcança de novo; código nunca é tocado; um nome solto que a mudança redirecionaria ganha um plano. Testes `the_plan_rewrites_only_the_links_that_reached_the_moved_note` e `a_move_that_would_retarget_a_bare_link_gets_a_plan_not_silence` |
| 5 | IMPORTANTE | `delete_entry("README")` mandava `README.md` para a lixeira quando os dois existiam, e `rename_entry` renomeava a nota em vez do arquivo, do mesmo jeito | **Corrigido** em `3340a3f`: nota é um caminho que termina em `.md`, e nada mais |
| 6 | IMPORTANTE | Um rename ou uma ida para a lixeira que já tinha acontecido era reportado como falha, sem plano, quando uma nota que linka era placeholder ou o passo do índice falhava depois; tentar de novo respondia "já existe" | **Corrigido** em `3340a3f`: nada falha depois que a entrada mudou de lugar; notas que linkam e não puderam ser lidas aparecem como puladas, o resto vira aviso (`Renamed`, `Trashed`) |
| 7 | IMPORTANTE | Mover uma pasta derrubava do índice a última versão conhecida de uma nota evicta, e anexos evictos resolviam como ausentes ([ADR 0043](../adr/0043-placeholder-guard.md)) | **Corrigido** em `3340a3f`: as notas movidas trocam de chave no índice com a última versão conhecida; anexos placeholder são listados e resolvem como presentes |
| 8 | IMPORTANTE | `resolve_file` ignorava a nota de origem, então embeds não seguiam a Q12 fechada, que os cobre | **Corrigido** em `3340a3f`: `resolve_attachment(source, target)` segue a Q12 a partir da nota. Para um nome solto, prefere a pasta da própria nota — o texto do ponto 3 da Q12 —, enquanto as notas seguem o "sob" do índice (seção 6, item 1). Desde `33ee838`, depois da emenda do mantenedor, os embeds seguem o "sob" também |
| 9 | IMPORTANTE | As funções novas de escrita do `verso-fs` não tinham testes de guardrail: nenhuma recusa de placeholder, de `..`, de caminho absoluto ou oculto era testada em criar, renomear, lixeira, ler ou escrever texto | **Corrigido** em `3340a3f`: 12 testes em `verso-fs/tests/ops.rs` (toda porta de escrita recusa um caminho que sai ou se esconde; placeholders recusados ao criar, renomear e mandar para a lixeira) e o laço de confinamento do core ampliado. Os dois testes de guardrail do fs foram vistos falhando contra uma verificação quebrada de propósito |
| 10 | MENOR | Verificar-e-renomear podia substituir um arquivo criado no intervalo | **Corrigido** em `3340a3f`: um arquivo chega por hard link e o nome temporário sai, então nada que apareceu no intervalo é substituído |
| 11 | MENOR | Diretórios criados no caminho não recebiam fsync no pai; um fsync de diretório que falhava depois do rename virava escrita falha | **Corrigido** em `3340a3f`: pastas criadas recebem fsync no pai; um passo de durabilidade depois da mudança é aviso, não falha |
| 12 | MENOR | Um rename que só muda a caixa era recusado num volume insensível a caixa | **Corrigido** em `3340a3f`: o mesmo dispositivo e inode nos dois nomes é um rename só de caixa, permitido |
| 13 | MENOR | Links que o plano nunca achava: embeds de anexo ao mover pasta, caminhos com `../`, grafias NFD, `\|` em tabelas, links Markdown | **Em parte** em `3340a3f`: o plano agora segue o que cada link alcançava, o que cobre embeds de anexo ao mover pasta; grafias NFD, `\|` dentro de tabelas e links Markdown continuam sem reescrita. Registrado |
| 14 | MENOR | A exceção de `std::fs` do `verso-core` valia para o crate inteiro, não só para `sidecar.rs` | **Corrigido** em `66cd57c`: um passo do CI falha quando `std::fs` aparece no `verso-core` fora de `sidecar.rs`; visto falhando com um uso plantado |

## 3. Terceira leitura — `verso-dialect`, `verso-index`, `verso-cli`, `verso-bench`, CI

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | `to_html` entrava em pânico numa nota de 28 bytes (`> [!note] x </blockquote> y`), e o pânico envenenava o mutex do workspace do `verso mcp` e do app: toda chamada seguinte falhava | **Corrigido** em `7475c03`: os callouts são achados nos eventos do parser, nunca cortando o HTML. O alvo de fuzz agora roda `to_html` e `body_tags`, com esta entrada como semente (217 233 rodadas, nenhuma queda). O lock envenenado: `612c708` no `verso mcp`, `3340a3f` no app |
| 2 | BLOQUEANTE | `cargo test` estava vermelho: o título de um callout pegava o `<br />` da mudança de quebra de linha | **Corrigido** em `7475c03`: o título é lido só na primeira linha do callout |
| 3 | BLOQUEANTE | As passagens de tag e de destaque do leitor rodavam dentro de blocos de código e de rótulos de link: `a == b` perdia o `==`, `#include` virava tag, `[[#Título]]` virava tag dentro de um link. Invariante 12 | **Corrigido** em `7475c03`: tags e destaques só em prosa, nunca em código, rótulos de link ou texto alternativo |
| 4 | BLOQUEANTE | A resolução de links prefere um candidato em qualquer lugar sob a pasta da origem, enquanto a Q12 fechada diz "na" pasta; a observação por trás disso estava registrada só num comentário de teste | **Registrado, não resolvido** (`CLAUDE.md` §1 regra 3). As sondas foram rodadas de novo e escritas como a terceira observação de `docs/reference/index-decision.md` §4.1: o Obsidian 1.13.7 prefere, sim, "sob". **Resolvido por decisão do mantenedor** em 2026-09-23 ("boa, gosto da sua ideia, pode seguir", respondendo "sob a pasta, sim ou não?"): o ponto 3 da Q12 agora diz "sob" (spec v0.15), o que o índice já fazia; embeds de arquivos acompanham (`33ee838`) |
| 5 | IMPORTANTE | O fim de toda imagem era escrito como `</span>`, então uma imagem Markdown engolia o resto do parágrafo | **Corrigido** em `7475c03` |
| 6 | IMPORTANTE | A reescrita de nota de rodapé inline detectava código errado, nos dois sentidos | **Corrigido** em `7475c03`: notas de rodapé inline são achadas nos eventos do parser, pulando código e matemática |
| 7 | IMPORTANTE | O render e o parser discordam sobre o que é link (`$[[x]]$`), contra o próprio comentário do render | **Corrigido** em `7475c03`: o comentário diz exatamente o que difere; as opções do parser não mudam (Q15 da spec, seção 6) |
| 8 | IMPORTANTE | O `read_note` do `verso mcp` numa nota vazia respondia `bad_window` | **Corrigido** em `9158f8b`: uma nota vazia, sem janela pedida, responde uma janela vazia. Teste visto falhando |
| 9 | IMPORTANTE | `verso <pasta>` usava uma regra léxica: um diretório existente nomeado sem `/` era "comando desconhecido", um inexistente era "abrindo", e `verso open` assumia `.`, contra a [ADR 0042](../adr/0042-open-from-command-line.md) | **Corrigido** em `896996a`, de forma provisória: um primeiro argumento que nomeia um diretório existente o abre, qualquer outra coisa é erro de uso, e `verso open` exige a pasta. Registrado na ADR 0042, cuja regra continua `[ABERTO]`. Testes vistos falhando |
| 10 | IMPORTANTE | `FIXTURES_STRICT=1` na `main` falha enquanto `fixtures/block/list-item` ainda é rascunho, embora a spec a chame de aprovada | **Resolvido** em 2026-09-23: o mantenedor aprovou a fixture ("faça 8"); `66a64fe` troca a linha de rascunho pela aprovação, e a checagem estrita passa (seção 6, item 8) |
| 11 | IMPORTANTE | O job de bench do CI não conseguia ficar vermelho: sem baseline para `ci-linux`, a comparação saía 0 por construção | **Corrigido** em `5e3d32a`: `--require-baseline` falha quando a máquina não tem linha de base, e o job na `main` passa essa opção, então a `main` fica vermelha até a linha de base de `ci-linux` ser registrada (seção 6, item 9; `docs/reference/bench-decision.md`, revisão de 2026-09-23) |
| 12 | IMPORTANTE | Um teste do bench comparava amostras únicas de tempo a 1,5× e falhava cerca de uma rodada em vinte | **Corrigido** em `d73c09f`: aquele passo compara só o tamanho do índice. Duas falhas em 25 rodadas antes, nenhuma em 25 depois |
| 13 | IMPORTANTE | Varreduras sem limite no render: 80 KB de `^[` levavam um segundo, quadrático | **Corrigido** em `7475c03`: uma passagem linear por construção; testado |
| 14 | IMPORTANTE | As tags do corpo no índice vinham de linhas cruas: links, código e comentários YAML davam tags falsas, e o leitor usava outra regra | **Corrigido** em `95b39ee`: o índice chama `verso_dialect::body_tags`, a regra única que o leitor usa |
| 15 | IMPORTANTE | HTML cru passa pelo render, contando só com a CSP | A UI sanitiza o HTML do render (leitura 4, achado 1). Se o próprio render deve descartar HTML cru é a Q6, do mantenedor (seção 6). Aceito em 2026-09-23 como construído: a lista de permissões da janela, o render sem mudança (Q6 da spec, seção 6, item 4) |
| 16 | IMPORTANTE | `%%comentário%%` aparecia na visão de leitura, que a documentação do Obsidian diz esconder | **Corrigido** em `7475c03`: `%%…%%` sai da visão de leitura, nunca dentro de código (Q6 da spec, seção 6) |
| 17 | MENOR | O tamanho do índice no bench excluía o arquivo `-wal` | **Corrigido** em `c1ddf0f`: medido depois de a conexão fechar. Os tamanhos de índice da linha de base do Mac foram registrados do jeito antigo, 1 a 2 % abaixo, dentro da tolerância |
| 18 | MENOR | Comentários desatualizados em `store.rs` e `render.rs` | **Corrigido** em `7475c03` e `95b39ee` |
| 19 | MENOR | Os resultados de erro do `verso mcp` não batiam com o esquema de saída declarado | **Corrigido** em `81d66b4`: o esquema declarado de cada ferramenta é um `anyOf` da resposta e do formato de erro. Teste visto falhando |
| 20 | MENOR | `open -a Verso --args` não passa a pasta para um app já aberto, mas a CLI sai com 0 | **Corrigido** em `b43e914`, a pedido do mantenedor em 2026-09-23: o app instalado recebe a pasta como documento a abrir, que um app aberto recebe (seção 6, item 14) |
| 21 | MENOR | Todo pull request compila a árvore do Tauri duas vezes (dois jobs, dois caches), contra a política de custo do CI | **Corrigido** em `bce6030`, a pedido do mantenedor em 2026-09-23: as checagens dos bindings e da UI rodam no job Rust de Linux (seção 6, item 13) |

## 4. Quarta leitura — a UI: escritas e segurança

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | Uma nota de uma pasta compartilhada podia rodar script que lê a pasta: HTML cru no `innerHTML`, um SVG num frame, um `<style>` que sonda a árvore sem script nenhum, um `<form>` ou `<area>` que navega a janela principal | **Corrigido** em `d039d5e`: todo HTML do core chega à página por um sanitizador de lista de permissões só (`sanitize.ts`): nenhum script, estilo, frame, controle de formulário, atributo de evento, SVG ou MathML; links e fontes só http(s), e-mail, âncoras da própria página e imagens data. Lado do host: leitura 1, achados 1, 2 e 6 |
| 2 | BLOQUEANTE | `window.confirm` nunca perguntava e sempre queria dizer "sim": o plugin de diálogo injeta uma versão assíncrona e a UI lia a Promise como verdadeira, então fechar uma aba com texto não salvo, mandar uma pasta para a lixeira e recarregar um arquivo mudado seguiam em frente | **Corrigido** em `919e8cc`: um diálogo na página (`dialog.ts`) em que só um sim explícito é sim, aguardado em todo ponto de chamada |
| 3 | BLOQUEANTE | O aviso de conflito podia ser contornado, e "gravar o meu por cima" podia sobrescrever uma versão que nunca mostrou: `save()` pegava a revisão do disco antes de o usuário decidir | **Corrigido** em `f68b8e4`: o aviso guarda o texto e a revisão do disco; só "gravar o meu por cima" escreve sobre essa revisão, uma segunda mudança mostra o diff novo, e todo outro salvamento recusa enquanto ele está na tela |
| 4 | BLOQUEANTE | Um clique em tarefa escrevia o último texto salvo, não o do editor, e num conflito recarregava à força | **Corrigido** em `f68b8e4`: um clique troca a marca na linha que o core nomeia, no texto atual do editor, e salva como a digitação; num `changed`, o aviso |
| 5 | BLOQUEANTE | Reindexar, renomear, citar, "devolver à janela principal" e fechar a janela recarregavam ou destruíam abas com alteração sem salvar | **Corrigido** em `9747be8`: reindexar, renomear, citar, excluir e abrir numa janela nova salvam antes e param, nomeando as abas, quando uma não consegue; um tratador de fechamento salva toda aba e mantém a janela aberta a não ser que o usuário diga sim. Trocar de pasta também salva antes (`369e738`), e o ⌘Q também, que antes encerrava o processo sem evento nenhum (`9ca850a`) |
| 6 | BLOQUEANTE | Texto digitado com um salvamento em curso era marcado como salvo; salvamentos sobrepostos levantavam um conflito vazio | **Corrigido** em `f68b8e4`: as escritas são encadeadas por aba, e uma aba só fica limpa se o editor ainda guarda o que foi escrito |
| 7 | BLOQUEANTE | Um link clicado fora da visão de leitura (um PDF, um embed, uma nota de pasta) trocava a janela do app pelo site | **Corrigido** em `dbc8572`: uma guarda na fase de captura impede qualquer link de navegar a janela e manda links http(s) para uma janela própria; a guarda do host a reforça (leitura 1, achado 6) |
| 8 | BLOQUEANTE | Salvar reescrevia bytes que o usuário não tocou: UTF-8 com perda, CRLF virando LF, quebras de linha misturadas unificadas | **Corrigido** em `b450036`: os dois editores escrevem com o separador de linha do próprio arquivo; um arquivo com quebras misturadas ou um CR solto abre só para leitura, com o motivo. Não-UTF-8: leitura 2, achado 2 |
| 9 | BLOQUEANTE | Abrir outra pasta reapontava em silêncio os caminhos de toda janela destacada para ela | **Corrigido** em `3340a3f`: só a janela principal troca de pasta, e nunca com uma janela de nota aberta |
| 10 | BLOQUEANTE | O painel de propriedades reescrevia chaves a partir de valores velhos | **Corrigido** em `01883d1`: o painel é redesenhado depois de toda carga, salvamento, desfazer e refazer, e toda edição se aplica ao frontmatter como o editor o tem agora, ou recusa e diz |
| 11 | BLOQUEANTE | O host de toda nota web ia para um terceiro (`icons.duckduckgo.com`) buscar o ícone, hosts de intranet inclusive | **Corrigido** em `4fa646e`: o `/favicon.ico` do próprio site, sem referrer, uma vez por site e sessão; registrado na ADR 0049 |
| 12 | IMPORTANTE | Um clique em tarefa podia marcar outra linha (callouts, código) | **Corrigido** em `f68b8e4`: um clique troca a marca na linha que o core nomeia, no texto atual do editor, e salva como a digitação; num `changed`, o aviso, com o `data-task-line` do core (`8592dc8`) |
| 13 | IMPORTANTE | Enter e Tab reformatavam qualquer sequência de linhas limitada por `\|`, código e matemática inclusive | **Corrigido** em `2fdf8fb`: as teclas só agem numa tabela de verdade, fora de código e matemática, e mantêm a indentação |
| 14 | IMPORTANTE | A alça de redimensionar imagem escrevia em posições velhas | **Corrigido** em `1494571`: a alça e o clique no bloco leem a posição quando o evento chega; o caso da leitura agora dá o texto certo |
| 15 | MENOR | Planos e citações deixavam uma aba com alteração para trás | **Corrigido** em `31d9092`: os planos são calculados depois de as abas salvarem, e na aplicação uma aba que não consegue salvar fica de fora e é nomeada |
| 16 | MENOR | O diff de conflito alocava memória n×m | **Corrigido** em `31d9092`: começo e fim comuns aparados, tabela limitada, os dois meios mostrados inteiros acima do limite |
| 17 | MENOR | Citar reescrevia a quebra de linha da nota companheira | **Corrigido** em `31d9092` |
| 18 | MENOR | "Salvar como template" copiava o último texto salvo | **Corrigido** em `31d9092` |

## 5. Quinta leitura — a UI: correção, idioma, acessibilidade

| # | Nível | Achado | Resolução |
|---|---|---|---|
| 1 | BLOQUEANTE | Um clique em tarefa escrevia a linha errada e texto velho | O mesmo da leitura 4, achados 4 e 12 |
| 2 | BLOQUEANTE | Editar uma propriedade reescrevia valores que o painel só mostra achatados: mapas viravam texto, números viravam texto entre aspas, comentários sumiam | `3340a3f` (um tipo `nested` que o painel nunca edita) e **Corrigido** em `01883d1`: o texto vai entre aspas sempre que o YAML o leria como outra coisa; linhas em branco e comentários fora da chave ficam; valores com comentários, várias linhas, aninhamento ou âncoras são só leitura. `d4a5580`: um tipo que o painel não conhece nunca é escrito |
| 3 | BLOQUEANTE | O painel de propriedades era pintado uma vez por carga e nunca ressincronizado | O mesmo da leitura 4, achado 10 |
| 4 | BLOQUEANTE | A alça de redimensionar imagem sobrescrevia um trecho velho | O mesmo da leitura 4, achado 14 |
| 5 | BLOQUEANTE | Recargas forçadas jogavam fora texto não salvo | O mesmo da leitura 4, achado 5 |
| 6 | IMPORTANTE | O Live Preview lançava erro num callout com uma linha `>` vazia | **Corrigido** em `7e8a69b`: todo trecho escondido fica preso à própria linha, e um construtor que ainda lance erro deixa a nota como fonte |
| 7 | IMPORTANTE | ⌘I e ⌘⇧K rodavam os padrões do CodeMirror; ⌘⇧K apagava a linha | **Corrigido** em `25cb1f4`: o mapa de teclas da nota ganha dos padrões do CodeMirror |
| 8 | IMPORTANTE | Atalhos globais disparavam por cima das teclas do editor, Ctrl contava como ⌘, e o gravador aceitava teclas que quebram o app | **Corrigido** em `06f4b8d`: ⌘ no macOS e Ctrl nos outros, cada evento tratado uma vez; o gravador exige um modificador, recusa uma lista reservada e se desarma com um clique fora. Dentro de um editor os atalhos do app agora vêm antes dos padrões do CodeMirror, então ⌘D não seleciona mais a próxima ocorrência (seção 6; aceito em 2026-09-23, item 22) |
| 9 | IMPORTANTE | Textos fora dos catálogos pt-BR/EN ([ADR 0035](../adr/0035-cross-cutting-requirements.md)) | **Corrigido** em `e451123`: as frases do CodeMirror em pt-BR, erros por tipo com a mensagem do core como detalhe, o cabeçalho da tabela, os nomes de pasta e os títulos de callout pelos catálogos. Os textos do próprio core ficam em inglês (seção 6, item 12; registrado na ADR 0035 em 2026-09-23, um código por aviso planejado) |
| 10 | IMPORTANTE | Controles sem nome, diálogos sem tratamento de foco (ADR 0035) | **Corrigido** em `73e215e`: nomes e descrições nos controles, diálogos modais com foco preso, devolvido e Escape, a opção destacada anunciada, os menus de aba e de área de trabalho e os divisores alcançáveis pelo teclado. Ainda não há equivalente de teclado para arrastar abas ou arquivos |
| 11 | IMPORTANTE | Texto secundário abaixo de contraste 4,5:1 (ADR 0035) | **Corrigido** em `83d4a0a`: só a luminosidade muda; o pior caso é 4,51:1 |
| 12 | IMPORTANTE | A UI e o core discordavam sobre onde o frontmatter termina | **Corrigido** em `5bba5e6`: uma regra só, a do core (`frontmatter.ts`), para o painel e o Live Preview; conferida contra o parser em 18 030 documentos |
| 13 | IMPORTANTE | A edição de frontmatter do painel escrevia YAML inválido e derrubava linhas vizinhas | **Corrigido** em `01883d1`: o texto vai entre aspas sempre que o YAML o leria como outra coisa; linhas em branco e comentários fora da chave ficam; valores com comentários, várias linhas, aninhamento ou âncoras são só leitura. `d4a5580`: um tipo que o painel não conhece nunca é escrito |
| 14 | IMPORTANTE | O Live Preview renderizava matemática e blocos que o core não renderiza | **Corrigido** em `190136d` (blocos pela árvore de sintaxe, matemática inline pelas regras do pulldown-cmark) e `c1cb709` (o editor lê as partes GFM que o leitor renderiza) |
| 15 | IMPORTANTE | Realinhar tabela mudava indentação, código e linhas de traço | O mesmo da leitura 4, achado 13 |
| 16 | IMPORTANTE | Recursos sobreviviam à aba: workers de PDF, reconstruções do preview, um loop de web view a cada quadro | **Corrigido** em `ac3ed43`: PDFs embutidos fecham com a aba, a visão de leitura só é redesenhada quando o HTML mudou, web views só são atualizadas quando algo pode movê-las |
| 17 | IMPORTANTE | O menu `/` ficava na tela depois de o editor perder o foco, e abria dentro de código | **Corrigido** em `8293dd1` |
| 18 | IMPORTANTE | Enter na busca do PDF nunca chegava ao segundo resultado | **Corrigido** em `f3f589e`: conferido no próprio controlador de busca do pdf.js |
| 19 | IMPORTANTE | Localizar e substituir na pasta pulava em silêncio notas que o índice não casa por palavra inteira | **Corrigido** em `43b96f9`: a prévia lê todas as notas e diz quantas, e quais não puderam ser lidas |
| 20 | MENOR | A resolução de link de reserva da UI diferia da do índice | **Corrigido** em `89e5981`: a ordem do índice, portada |
| 21 | MENOR | `layout()` criava uma área de trabalho como efeito colateral | **Corrigido** em `03ae3dd` |
| 22 | MENOR | Estado velho depois de mudanças em arquivos: cache de imagem, favoritos, abas fechadas, restauração | **Corrigido** em `891b3ba` |
| 23 | MENOR | Diversos: tachado no Live, dicas de atalho fixas no código, rótulos, movimento reduzido | **Corrigido** em `c1cb709`, `1619fbb` e `01d3a04` |

## 6. Pendente do mantenedor

Nenhum destes é decidido por esta revisão. Cada um diz onde mora. Em
2026-09-23 eles foram apresentados ao mantenedor com uma recomendação para
cada um, em quatro grupos: A, aceitar como está (itens 2, 3, 4, 6, 11, 18, 20,
21, 22); B, aceitar com um ajuste pequeno (5, 7, 10, 12, 15, 16, 19); só do
mantenedor (8, 17); D, depois e sem travar (9, 13, 14, 23). A resposta: *"a e
b ok, faça 8, 17 troque para Opus, o que for importante ja puxa de D"* — de D
o autor puxou o 13 e o 14. Cada item traz a sua resposta.

1. **Q12, ponto 3: "na" ou "sob" a pasta da origem — decidido em
   2026-09-23.** Perguntado "sob a pasta, sim ou não?", o mantenedor respondeu
   sim ("boa, gosto da sua ideia, pode seguir"): um nome solto prefere um
   candidato em qualquer lugar sob a pasta da origem, como o Obsidian 1.13.7
   faz. Registrado na Q12 da spec (v0.15) e em
   `docs/reference/index-decision.md` §4.6; o índice já fazia, e embeds de
   arquivos acompanham (`33ee838`). A mesma resposta aprovou um ajuste para o
   formato dos links novos — mais curto, relativo ou a partir da raiz —, que
   veio em `3461f8d`.
2. **Operações de arquivo** — [ADR 0048](../adr/0048-file-operations-in-ui.md),
   `[ABERTO]`. O que o código faz está registrado lá como provisório: renomear
   e mover com um plano de reescrita de links aplicado nota a nota, sem
   transação lógica; apagar para `.trash/` com confirmação; criar; colisão de
   nomes do jeito que o volume compara nomes; um placeholder sozinho não pode
   ser renomeado nem apagado, enquanto uma pasta com placeholders pode.
   **Resposta:** aceito como construído; a ADR 0048 é Aceita (`45d6b6c`).
3. **A linha de comando** — regra `[ABERTO]` da
   [ADR 0042](../adr/0042-open-from-command-line.md); o que `verso <pasta>` e
   `verso open` fazem agora está registrado lá como provisório.
   **Resposta:** aceito como construído; a regra da Fase 2 da ADR 0042 está
   decidida.
4. **O que a visão de leitura renderiza** — Q5 da spec (tipos de callout), Q6
   (HTML cru, agora sanitizado pela janela; comentários `%%`, agora
   escondidos), Q13 e Q22 (tags no corpo, indexadas e renderizadas por uma
   regra só), Q15 (tabelas, notas de rodapé inclusive a forma inline, listas de
   tarefas, matemática, destaque, tachado, uma quebra de linha simples como
   quebra), Q24 (a janela agora segue o limite de frontmatter do core), Q25 (um
   arquivo que não é UTF-8 não é aberto para edição). Cada uma tem sua linha
   provisória na spec. **Resposta:** aceito como seguindo o Obsidian — Q13 e
   Q25 fechadas; Q5, Q6, Q15 e Q24 decididas para a visualização de leitura e
   a janela; Q22 para as tags (spec v0.16, `80ad6b5`). Uma premissa não valeu:
   o Obsidian aninha callouts e a visualização de leitura não, então o
   aninhamento da Q5 continua aberto.
5. **A rede** — [ADR 0049](../adr/0049-phase-2-scope-widened.md),
   Consequências: notas web, links clicados na janela (abertos numa janela
   própria), os ícones das notas web pedidos ao próprio site, e imagens remotas
   acessam a rede; nenhuma ADR cobre acesso de saída
   (a [ADR 0027](../adr/0027-runtime-capabilities.md) é Proposta). A
   propriedade `url:` que faz de uma nota uma nota web é um significado do
   Verso sem ADR. **Resposta:** os quatro jeitos e o significado de `url:`
   aceitos, com um ajuste "carregar conteúdo remoto" sobre os dois que não
   precisam de clique (`c8109b8`);
   [ADR 0050](../adr/0050-outbound-network-access.md), com o padrão do ajuste
   (ligado) provisório.
6. **A segurança do contrato** — [ADR 0045](../adr/0045-server-and-mcp-security.md),
   `[ABERTO]`: sem identidade de sessão e sem autorização por operação; o host
   agora concede os comandos só às views do próprio app. O `verso://` é um
   segundo canal ao lado do contrato cuja URL é um caminho (regras 1, 2 e 4 da
   [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)); ele responde
   só às views do app e nunca serve uma nota. Os comandos só do host (`web_*`,
   `open_url`, `open_window`, `reveal`) ficam nos mesmos bindings que os do
   core (regra 2; ADR 0027). **Resposta:** aceito como construído para a Fase
   2; `[ABERTO]` até um servidor entrar em escopo (ADR 0045).
7. **Dependências e exceções** — as sete advisories ignoradas no `deny.toml` e
   `Apache-2.0 WITH LLVM-exception`; a feature `unstable` do Tauri; os pacotes
   npm da UI — entre os novos, `pdfjs-dist`, `katex`,
   `@codemirror/language-data` e três fontes `@fontsource` —, nenhum com portão
   de licença no CI. **Resposta:** as advisories ignoradas, a exceção de
   licença e o `unstable` ratificados; um portão de licenças npm acrescentado
   (`65e44f9`, ADR 0029); o `@tauri-apps/plugin-dialog`, que ninguém chamava,
   removido (`aedb1b2`).
8. **Uma fixture e a spec discordam** — `fixtures/block/list-item` ainda é
   rascunho da IA enquanto a §5.7 e a Q3 da spec a chamam de aprovada; o
   `FIXTURES_STRICT=1` do CI na `main` falha até um dos lados mudar
   ([ADR 0031](../adr/0031-fixtures-as-contract.md)). **Resposta:** aprovada
   ("faça 8"); `66a64fe` troca a linha de rascunho pela aprovação, e a
   checagem estrita passa.
9. **O baseline de CI do bench** — nenhum registrado para `ci-linux` ainda
   (`docs/reference/bench-decision.md` §6.3;
   [ADR 0039](../adr/0039-performance-targets.md) `[ABERTO]`).
   **Resposta:** depois — o baseline só pode vir do CI, ainda bloqueado pela
   cobrança.
10. **A lista de crates** — `verso-contract`, `verso-bench` e `app/src-tauri`
    são membros do workspace, enquanto a [ADR 0028](../adr/0028-crate-structure.md) e o
    `CLAUDE.md` §3 listam cinco crates. **Resposta:** a ADR 0028 e o
    `CLAUDE.md` §3 e §7 agora os registram (`45d6b6c`).
11. **Nota do dia e templates** — construídos sob a
    [ADR 0014](../adr/0014-primitives-catalog.md), que é Proposta.
    **Resposta:** os dois aceitos na ADR 0014; o resto do catálogo continua
    Proposto.
12. **O idioma dos textos do core** — [ADR 0035](../adr/0035-cross-cutting-requirements.md):
    a janela traduz os tipos de erro, enquanto os detalhes e os avisos de
    escrita do core ficam em inglês (o contrato registra isso como
    `[ABERTO]`); o mecanismo da própria janela (um catálogo tipado de textos,
    um ajuste de idioma que recarrega a janela) não está registrado em lugar
    nenhum. **Resposta:** registrado na ADR 0035; um código por aviso do core,
    para a janela poder traduzi-lo, está planejado, não feito.
13. **Custo do CI** — todo pull request compila a árvore do Tauri duas vezes
    (leitura 3, achado 21). **Resposta:** corrigido em `bce6030` — as
    checagens dos bindings e da UI rodam no job Rust de Linux.
14. **`open -a` com o app já aberto** (leitura 3, achado 20).
    **Resposta:** corrigido em `b43e914` — a pasta vai ao app instalado como
    documento a abrir, que um app aberto recebe; visto funcionando com um
    bundle descartável do build de debug.
15. **O modo do arquivo sidecar do índice** — a [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)
    diz "arquivo `0600`"; o sidecar sai 0644 dentro do diretório 0700.
    **Resposta:** `0600`, como a ADR diz (`3a9764e`).
16. **O visualizador de arquivos HTML está inalcançável** — achado no teste de
    fumaça de 2026-09-23, anterior a esta revisão (`ab9fb3a`): um `.html` conta
    como arquivo de texto antes de poder ser página, então abre como fonte, e o
    visualizador que o mantenedor pediu em 2026-09-22 nunca aparece. Como os
    dois devem conviver (um botão, ou HTML abrindo como página) é do
    mantenedor. **Resposta:** um arquivo HTML abre como a página, com a fonte
    como o outro modo da mesma aba (`4afec51`).
17. **As leituras cruzadas das correções** foram feitas pela Opus 5.5, não
    pelo Fable 5.1 como a [ADR 0032](../adr/0032-author-and-reviewer-roles.md)
    atribui para a janela e os documentos: decisão do mantenedor de 2026-09-23,
    quando o Fable chegou ao limite de uso. Se uma leitura do Fable vem depois
    é do mantenedor. **Resposta:** "17 troque para Opus" — as leituras ficam
    com a Opus 5.5 no lugar do Fable 5.1; as mudanças destas respostas foram
    lidas por uma sessão nova da Opus 5.5 (seção 7).
18. **O que o autor acrescentou à Fase 2** — ADR 0049 seção 2, Proposta: o
    mantenedor confirma ou risca cada item. **Resposta:** todos os itens
    confirmados; a ADR 0049 é Aceita.

19. **Nomes que um link não comporta** — o core aceita nomes de nota e de pasta
    com `[`, `]`, `|`, `#` ou `^`, que nenhum `[[…]]` consegue nomear; renomear
    para um nome assim agora deixa os links como estão e diz isso (registrado
    no registro provisório da [ADR 0048](../adr/0048-file-operations-in-ui.md)).
    **Resposta:** a janela recusa um nome assim quando cria ou renomeia, e diz
    por quê (`7d516f5`); o core continua aceitando.
20. **A ordem do ponto 2 da Q12** — a spec não diz se um caminho é tentado "a
    partir da raiz" antes de "relativo à pasta da origem"; o índice e a
    resolução de embeds tentam a raiz primeiro, então `![[img.png]]` escrito
    em `a/` alcança um `img.png` da raiz antes de `a/img.png`. Registrado na
    Q12 da spec. **Resposta:** a raiz primeiro, e `./` ou `../` só relativo,
    como o Obsidian os lê; o ponto 2 da Q12 da spec diz isso (`80ad6b5`), e
    testes o fixam (`c3af6bf`).
21. **Volumes sem hard links** — em exFAT e FAT, criar, renomear ou mandar
    para a lixeira recorre a um rename conferido e diz que a proteção foi mais
    fraca; se isso deve ser permitido ou recusado é do mantenedor. Registrado
    no registro provisório da ADR 0048. **Resposta:** permitido, com o aviso.
22. **Teclas tomadas do editor** — dentro de um editor os atalhos do app vêm
    antes dos padrões do CodeMirror, então ⌘D, ⌘⇧L, ⌘⇧G e ⌘⇧\ (e, no Linux,
    Ctrl-Shift-[ e ]) não fazem mais o que o CodeMirror liga a eles.
    Registrado em `docs/reference/app-decision.md` §9. **Resposta:** aceito;
    todo atalho pode ser ligado de novo nos ajustes.
23. **Arquivos com quebras de linha misturadas** ficam só para leitura na
    janela; se deve existir uma conversão por ação do usuário, com o diff
    (invariante 8), é do mantenedor. Registrado na Q24 da spec.
    **Resposta:** depois; um arquivo assim continua só para leitura.

## 7. A resolução

As correções foram escritas em paralelo, cada fatia numa sessão nova que
recebeu os achados das suas leituras: o Rust pelo Fable 5.1
([ADR 0032](../adr/0032-author-and-reviewer-roles.md)), com a fatia do core,
do contrato e do host completada pela Opus 5.5 quando aquela sessão chegou ao
limite de uso; a janela pela Opus 5.5, em duas sessões cujo trabalho foi
juntado à mão; os documentos pela Opus 5.5. Depois as correções foram lidas de
novo, cada fatia numa sessão nova: a fatia do Rust e do CI, e a da janela. Nenhuma achou BLOQUEANTE novo. A
leitura do Rust achou dois IMPORTANTES — operações de arquivo que falhavam de
vez em volumes sem hard links (exFAT), e um nome novo com `|`, `#` ou `]]`
escrito em links que o parser então lia como outro alvo — e seis MENORES; a da
janela achou dois IMPORTANTES — mover que dizia "Movido." por cima da própria
recusa, e um clique em tarefa que podia cair numa linha deslocada por texto
não salvo — e sete MENORES. Corrigidos: os dois pares de IMPORTANTES
(`fffaf29`, `98f2c58`, `96535d7`), e os MENORES das grafias de nota que o
protocolo deixava passar, do grep do CI, de sair com uma página web aberta, dos
testes que faltavam, de uma janela destacada que falhou, de recarregar ao lado
de uma janela de nota e dos ids que uma nota podia tomar (`72017af`,
`44186f1`, `96535d7`). Registrados, não corrigidos: criações que descartam o
relatório de durabilidade; links no frontmatter, que nem o parser nem um plano
veem; estilos inline que podem pintar por cima dos controles da aba (contê-los
cortaria tabelas largas); "devolver à janela principal" perguntando duas vezes;
os atalhos do app tomando também ⌘⇧L, ⌘⇧G e ⌘⇧\ do editor; o menu do macOS só
em inglês; uma tarefa aninhada `- - [ ]` recusada com uma mensagem enganosa.
Essas segundas leituras foram a Opus 5.5 lendo, para a janela e os documentos,
trabalho que a Opus 5.5 escreveu — por decisão do mantenedor (seção 6, item
17).

Os documentos do branch foram lidos do mesmo jeito. Essa leitura achou um
BLOQUEANTE — o próprio resumo desta revisão chamava o achado aberto da Q12 de
"não é um defeito", o que toma o lado do código —, oito IMPORTANTES (uma
diferença na Q12 descrita como redação, arquivos HTML e os caminhos de rede
descritos errado, um crate nomeado dentro de uma decisão Aceita, itens desta
seção sem lugar, uma fase que o código teria escolhido, duas questões da spec
sem linha provisória, uma contradição sobre embeds de arquivo não registrada)
e doze MENORES. Todos foram corrigidos antes do push, menos um MENOR: a coluna
"quando decidir" do índice de ADRs ainda mostra os prazos da Fase 1 das ADRs
0044 a 0046.

Achado ao integrar, além das leituras:

- `.github/workflows/ci.yml` não era um workflow válido: quatro jobs citavam
  `matrix` num `if` de job, que o GitHub recusa antes de rodar qualquer job. A
  `main` carrega isso desde `827ddb8`, escondido enquanto o Actions esteve
  bloqueado por cobrança. Corrigido em `1b70c7f`; o actionlint passa limpo.
- A guarda de navegação é chamada também para frames (o wry não lhe passa o
  frame), então ela teve de admitir o protocolo de arquivos para as views do
  app (`3340a3f`).
- O ⌘Q no macOS encerrava o processo sem evento que o app pudesse responder
  (`9ca850a`).
- O visualizador de arquivos HTML acabou se mostrando inalcançável, desde antes
  desta revisão (seção 6, item 16).

Um teste de fumaça do app de verdade numa pasta descartável, depois da junção:
a pasta da linha de comando abriu; a visão de leitura renderizou os casos da
leitura 3 (título do callout, código intacto, tags e destaque só na prosa, o
comentário escondido); uma tarefa dentro de um callout marcou a própria linha;
uma edição feita fora levantou o aviso de conflito e nada foi sobrescrito; um
arquivo que não é UTF-8 não abriu; um rename planejou e aplicou sua única
reescrita; excluir perguntou na página e foi para `.trash/`; fechar e sair com
texto não salvo o salvaram antes; reabrir o app trouxe a pasta de volta pela
chave, com as abas.

Os commits da resolução, em ordem: `af5a84b` (host); `9158f8b` a `5e3d32a`
(CLI, MCP, bench, CI); `1b70c7f` (a matriz do CI); `7475c03`, `8592dc8`,
`95b39ee` (dialeto, índice); `3340a3f` (core, contrato, host); `ca264f0`
(`not_text` do MCP); `1494571` a `73e215e` (janela: editor, teclas, idioma,
acessibilidade); `919e8cc` a `d4a5580` (janela: escritas e segurança);
`369e738` e `b2c5cb4` (janela e contrato); `9ca850a` (sair); depois das
segundas leituras, `fffaf29`, `98f2c58`, `72017af`, `44186f1` e `96535d7`.

### As respostas do mantenedor de 2026-09-23

Pedido de uma sugestão para cada item da seção 6, o autor deu uma, nos quatro
grupos nomeados ali; o mantenedor respondeu *"a e b ok, faça 8, 17 troque para
Opus, o que for importante ja puxa de D"*, e a seção 6 traz a resposta embaixo
de cada item. O que ela mudou, em ordem: `3a9764e` (o modo do sidecar),
`4afec51` (um arquivo HTML como a página), `7d516f5` (nomes que nenhum link
alcança), `c8109b8` (conteúdo remoto), `aedb1b2` e `65e44f9` (o pacote npm
removido, o portão de licenças), `bce6030` (um build do Tauri por pull
request), `b43e914` (uma pasta entregue ao app aberto), `66a64fe` (a fixture),
`45d6b6c` (as ADRs, a ADR 0050 nova), `c3af6bf` e `80ad6b5` (a ordem do ponto
2 da Q12 fixada por testes, spec v0.16), e depois este registro.

Uma resposta se apoiou numa premissa que não valeu. O item 4 foi apresentado
como "a visualização de leitura segue o Obsidian", e ela não segue para
callouts aninhados dentro de callouts, que o Obsidian mostra e a visualização
de leitura mantém como citações; essa parte da Q5 da spec fica registrada como
ainda aberta, em vez de tomada como decidida.

Tudo isso — o código da janela, o Rust e os documentos — foi escrito pela Opus
5.5, no lugar do Fable 5.1 por decisão do mantenedor, e lido por uma sessão
nova da Opus 5.5 com o diff e o repositório, como a resposta ao item 17 pede.
