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

- [ ] **O identificador novo mantém os ajustes da janela**: depois de atualizar da 0.4.0-beta.1, o tema, as teclas e a largura de uma coluna estão como eram; o log diz "window data carried over to com.versomd.app.beta" uma vez.
- [ ] **A capa de um PDF na visão de pasta**: abra `assets` do cofre de exemplo, Miniaturas — o PDF mostra a primeira página; troque para Lista e volte para a tabela — os itens continuam.
- [ ] **A versão no endereço dos arquivos** (cache depois de uma
  atualização): depois de atualizar, a janela mostra a interface da versão
  nova na hora, sem tela antiga; o leitor de PDF e um board continuam
  abrindo.

## Para reproduzir

Relatados no backlog, mudados desde então, mas sem teste que os cubra; se
ainda acontecem, um passo que os faça acontecer basta.

- [ ] O ⌘Z às vezes não desfaz nada, ou desfaz a mudança errada (Backlog,
  2026-09-24).
- [ ] As setas nos bullets e nas checkboxes no Editar pulam uma linha ou
  marcam a errada (Backlog2, 2026-09-27).
- [ ] O Exposé do app (⌃↓) lista todas as janelas do Verso (Backlog,
  2026-09-24).
- [ ] Partes da interface que não cabem numa janela estreita (Backlog,
  2026-09-24; o print não estava no cofre).
- [ ] "Quando eu seleciono texto no modo Editar e ele tem imagens" — a
  frase ficou incompleta (Backlog, 2026-09-24).

## Conferido

- [x] O menu de uma imagem: Baixar imagem, Abrir em nova janela; Abrir
  pasta numa segunda janela; uma nota destacada devolvida à janela
  principal (0.4.0-beta.1, conferido pelo mantenedor em 2026-10-07).
- [x] O painel da nota tipada e as nove ferramentas do MCP (0.4.0-beta.1,
  2026-10-07).
