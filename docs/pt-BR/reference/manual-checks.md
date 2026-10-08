# Checagens manuais no app

- Início: 2026-10-07
- Fonte: o mantenedor, em sessão: "mantenha um documento com toda
  implementação que precisa de um check meu testado local. isso nao deve
  travar nada".

O que os testes automáticos não alcançam por inteiro — o host real, o
macOS, o app instalado — fica listado aqui, uma linha por mudança, para o
mantenedor experimentar no app instalado quando puder. **Nada aqui segura
um commit, um merge ou uma versão.** Cada item diz o que fazer, o que ver
e o commit; um item marcado diz quando. Uma checagem que acha problema
vira conserto, e o item aponta para ele.

O roteiro do cofre de exemplo (`demo-vault-walkthrough.md`) é o passeio
completo pelo app; esta lista é só o que mudou e ainda não foi visto no
app real.

## Ainda não conferido

### O porte para Windows (feat/windows-fs)

- [ ] **Um servidor de agentes para todo o Verso** (ADR 0054, 2026-10-08):
  em Ajustes › Terminal e agentes escolha "Um servidor para todo o Verso",
  marque duas pastas como visíveis, "Adicionar ao Claude Desktop", feche o
  Verso, reinicie o Claude Desktop; num chat pergunte quais pastas ele vê e
  peça uma busca numa delas — ele nomeia as duas, as lê, e o `agents.log`
  na pasta de configuração do Verso lista cada chamada. No Mac, com uma
  pasta em Documentos ou no iCloud: o macOS pergunta, e nomeando qual app?
- [ ] **O Claude Desktop inicia o servidor do Verso no Windows**
  (2026-10-08): no Mac iniciou; no Windows o log disse "no stdio servers
  connected". Ajustes › Desenvolvedor no Claude Desktop mostra o estado do
  servidor.
- [ ] **A atualização pelo app no Windows** (ADR 0055, 2026-10-08): de um
  beta de Windows para o seguinte, "Atualizar" baixa o instalador, roda-o,
  e a versão nova abre com as notas e os ajustes como estavam. Nunca
  rodada: a primeira versão de Windows é a primeira chance.
- [ ] **Uma nota nos Arquivos Sob Demanda do OneDrive** (ADR 0043,
  2026-10-08): numa máquina Windows com OneDrive, ponha uma pasta de notas
  no OneDrive, botão direito nela, "Liberar espaço"; abra-a no Verso — as
  notas aparecem, o primeiro índice não baixa nada (os ícones de nuvem
  ficam), e abrir uma nota baixa só aquela e mostra o texto dela — nenhum
  "the cloud did not give the file's content" no log. Só o `attrib +O` foi
  testado.

### 0.4.0-beta.1

- [ ] **Várias entradas na árvore** (`f3e1af3`): ⌘-clique em duas notas e
  ⇧-clique numa terceira — as linhas entre elas ficam selecionadas; Esc
  limpa. Arraste-as para uma pasta: elas vão; uma nota que apontava para
  elas por caminho aparece num plano só. Botão direito na seleção: Mover
  para…, Copiar caminhos relativos, Mover para a lixeira (uma pergunta).
- [ ] **A largura de uma coluna** (`a6d9fa9`): na tabela da nota 01,
  arraste a borda direita de uma célula de cabeçalho no Editar; troque
  para Leitura e volte, reabra a nota — a largura fica; o `.md` não muda.
- [ ] **O botão direito numa página de pasta** (`6595623`): no espaço
  vazio de uma página de pasta, o menu da árvore, com ícones.
- [ ] **O botão de copiar código em inglês** (`6595623`): Ajustes › Idioma
  › English, e passe o mouse no botão de copiar de um bloco de código:
  "Copy code".
- [ ] **`type:` na busca** (`f3e1af3`, a permissão): busque
  `type:personagem` — os dois personagens aparecem (antes, no app,
  respondia "not allowed").

### Próxima versão

- [ ] **O embed de um bloco** (spec Q3, Q21): nota 02, "Incorporar só um bloco" — o embed mostra só a terceira descoberta; um link `[[Projetos/Pesquisa e Descobertas#^atomica]]` abre a nota naquele item. Na Leitura nenhum `^atomica` aparece, nem no embed nem na nota; no Editar ele aparece apagado.
- [ ] **Templates numa nota nova** (ADR 0068): ⌘N — "Começar com" sob o título; escolha "Nota de Reunião": a nota é o template com a data de hoje; ⌘Z desfaz; uma nota nova com Em branco fica como estava.
- [ ] **O identificador novo mantém os ajustes da janela**: depois de atualizar da 0.4.0-beta.1, o tema, as teclas e a largura de uma coluna estão como eram; o log diz "window data carried over to com.versomd.app.beta" uma vez.
- [ ] **A capa de um PDF na visão de pasta**: abra `assets` do cofre de exemplo, Miniaturas — o PDF mostra a primeira página; troque para Lista e volte para a tabela — os itens continuam.
- [ ] **O ⌘Z do menu com o foco fora do texto**: numa nota no Editar,
  digite duas palavras com um segundo entre elas, clique no botão
  Editar, aperte ⌘Z duas vezes — cada palavra sai por vez; ⌘⇧Z traz a
  última de volta.
- [ ] **Um SVG no Editar**: nota 06 do cofre de exemplo, Editar — o
  diagrama aparece, e continua ao ser selecionado com o texto em volta.
  À esquerda do título de uma nota sem figurinha, um brilho apagado, não
  uma estrela.
- [ ] **A versão no endereço dos arquivos** (cache depois de uma
  atualização): depois de atualizar, a janela mostra a interface da versão
  nova na hora, sem tela antiga; o leitor de PDF e um board continuam
  abrindo.

## Para reproduzir

Relatados no backlog, mudados desde então, mas sem teste que os cubra; se
ainda acontecem, um passo que os faça acontecer basta.

- [ ] O Exposé do app (⌃↓) lista todas as janelas do Verso (Backlog,
  2026-09-24): uma janela do sistema, que o harness do navegador não
  mostra.

## Conferido

- [x] O menu de uma imagem: Baixar imagem, Abrir em nova janela; Abrir
  pasta numa segunda janela; uma nota destacada devolvida à janela
  principal (0.4.0-beta.1, conferido pelo mantenedor em 2026-10-07).
- [x] O painel da nota tipada e as nove ferramentas do MCP (0.4.0-beta.1,
  2026-10-07).
- [x] Cobertos por `app/ui/e2e/backlog-repro.spec.mjs` em 2026-10-07, e
  por isso fora desta lista: as setas e o cursor em bullets e checkboxes
  no Editar (nenhuma falha achada); uma aba arrastada para a borda
  direita com as duas barras abertas (nenhuma falha achada); uma janela
  estreita (a barra direita fechada passava 4px da borda — consertado);
  o ⌘Z com o foco fora do texto (não desfazia nada — consertado); e a
  frase incompleta sobre selecionar texto com imagens (um SVG sem
  tamanho próprio era uma linha vazia no Editar — consertado).
