# ADR 0107 — A mesa: um registro das rolagens e mensagens de todos, ao lado das notas

- Data: 2026-10-21
- Origem: o mantenedor, em 2026-10-21, enquanto os dados 3D ganhavam os
  ajustes de aparência do Rolai: *"já vai pensando aí pq em algum momento
  quero ter uma barra de chat onde as rolagens de todos que estão
  conectados juntos aparecem no chat e tal"*. Pedido como direção, não
  para agora. Escrita pelo Opus 5.5; a ser lida pelo outro modelo antes
  de aceita ([0032](0032-author-and-reviewer-roles.md)).
- Relacionadas: [0088](0088-dice-and-random-tables.md) (item 4, o
  servidor rola numa sala e guarda as últimas rolagens em memória, nada
  gravado; item 8, a rolagem de um membro anunciada com o nome dele),
  [0073](0073-self-hosted-server-first.md) (item 7, salas),
  [0074](0074-accounts-and-access-on-the-server.md) (contas, papéis),
  [0081](0081-sharing-between-people-on-one-universo.md) (dono, editor,
  leitor numa pasta), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (a nota de uma pasta sincronizada entra na sala do servidor enquanto
  online), [0083](0083-security-hardening-of-universo.md) (limites,
  ritmo, entrada hostil), [0084](0084-notifications-in-the-window.md)
  (notificações por tipo), [0087](0087-secret-blocks-hidden-from-readers.md)
  (o que não é servido a um leitor), [0096](0096-this-app-is-a-server.md)
  (o desktop servindo a própria pasta), [0101](0101-3d-dice-physics-overlay.md)
  (dados 3D), [0102](0102-creative-oracles-and-improvisation.md)
  (tiragens do oráculo), [0103](0103-feature-presets-and-capability-flags.md)
  (interruptores de recursos), [0012](0012-files-are-source-of-truth.md),
  [0026](0026-core-ui-contract-inviolable-rules.md),
  [0035](0035-cross-cutting-requirements.md).

## Contexto

Hoje uma rolagem numa nota compartilhada é vista por quem está na sala
dessa nota e por mais ninguém ([0088](0088-dice-and-random-tables.md)
item 4, `crates/verso-server/src/collab_dice.rs`): o servidor rola,
carimba o nome da conta, avisa as outras janelas da sala e guarda as
últimas 20 rolagens (`ROLLS_KEPT`) em memória para quem entrar na nota
depois. Uma tiragem do oráculo faz o mesmo caminho. Nada é gravado.

Isso serve para uma nota. Uma sessão de jogo não fica numa nota só: o
mestre rola da ficha de um monstro, um jogador da sua ficha, alguém
pergunta ao oráculo na nota da sessão. Cada rolagem cai numa sala
diferente; ninguém as vê juntas, e uma rolagem numa nota que só você tem
aberta não é vista por ninguém.

O Rolai, o app de dados do mantenedor de onde o Verso copiou o motor
(0088 item 5), tem a forma pedida: uma sala por link, a lista de quem
está lá, um histórico das rolagens e cartas de todos, um "ocultar daqui
pra trás" local e um "limpar a sala" para todos (Rolai
`specs/09-limpar-historico.md`), o relógio do servidor em cada entrada.
Ele não tem mensagens digitadas.

O que falta ao Verso para fazer o mesmo: um lugar compartilhado por mais
de uma nota (uma sala é uma nota), um painel que mostre o registro, e uma
decisão sobre o que é guardado e onde.

## Decisão

Status **Proposta**. Itens marcados `[OPEN]` são do mantenedor; itens
marcados `[PROPOSED]` são a recomendação do autor, não decididos.

1. **A mesa.** `[PROPOSED]` Um painel chamado **Mesa** / **Table** mostra
   um registro: cada rolagem, tabela sorteada e tiragem do oráculo feita
   por qualquer pessoa na mesma mesa, na ordem em que o servidor as
   recebeu, cada uma com o nome de quem rolou (carimbado pelo servidor,
   como a presença), a hora (o relógio do servidor), a notação, os dados,
   o total e a nota de onde veio, como link. Mais mensagens digitadas, se
   o item 3 disser.

2. **O que é uma mesa.** `[OPEN]` Quem está "conectado junto":
   - **A — A pasta.** Todos que têm a mesma pasta do UniVerso aberta, em
     qualquer nota, dividem uma mesa. Uma campanha é uma pasta; uma
     rolagem em qualquer nota dela chega à mesa. _(recomendado)_
   - **B — A nota.** A mesa é a sala da nota, como hoje; o painel só
     mostra o que a 0088 já repassa.
   - **C — Uma mesa com nome, por link,** como no Rolai: alguém abre uma
     mesa, compartilha um link, e quem entra a vê, em qualquer nota.

   Com A, uma rolagem numa sala de nota vai para a sala da nota (como
   hoje) **e** para a mesa da pasta; o servidor rola uma vez.

3. **Mensagens, não só rolagens.** `[OPEN]`
   - **A — Rolagens e mensagens curtas digitadas.** Texto simples, sem
     Markdown, sem HTML, sem imagens; um link para uma nota da pasta
     aparece como link. _(recomendado)_
   - **B — Só rolagens,** um registro sem campo de texto.

4. **Rolar pela mesa.** `[PROPOSED]` O campo da mesa rola quando o texto
   é uma notação de dados depois de `/r` (`/r 1d20+3`), ou por um botão de
   dados ao lado, pelo mesmo comando da rolagem de uma nota, de modo que o
   servidor sorteia o número (0088 item 4). Uma tabela sorteada ou um
   oráculo é rolado pela sua nota, não pela mesa.

5. **O que é guardado, e onde.** `[OPEN]` A 0088 item 4 decidiu que uma
   sala guarda as últimas rolagens em memória e nada é gravado. Uma mesa
   pode pedir mais; qualquer opção que não a A revisa a 0088 item 4.
   - **A — Só memória, como na 0088.** O servidor guarda as últimas 200
     entradas por mesa enquanto roda; um reinício as esquece. Um botão
     **"Copiar para uma nota"** / **"Copy to a note"** grava o que o
     painel mostra numa nota nova da pasta, por ação do usuário, como
     qualquer nota nova. _(recomendado)_
   - **B — O banco do servidor,** por pasta, com uma retenção como a do
     registro de auditoria ([0083](0083-security-hardening-of-universo.md)
     item 10).
   - **C — Uma nota da sessão,** acrescentada a cada entrada.
     Desaconselhada pelo autor: grava um arquivo da pasta em nome de todos
     os presentes, a cada poucos segundos, o que não é uma ação do usuário
     ([0012](0012-files-are-source-of-truth.md); invariante 8) nem um
     escritor único.

6. **Limpar.** `[PROPOSED]` Como no Rolai: **"Ocultar daqui pra trás"** /
   **"Hide up to here"** esconde o registro só na sua janela, pode ser
   desfeito, e corta na hora do servidor da última entrada mostrada, nunca
   no relógio local; **"Limpar a mesa"** / **"Clear the table"** esvazia
   para todos, pergunta antes, e é só do dono da pasta.

7. **Rolagens secretas.** `[OPEN]` Uma rolagem vista só por quem rolou e
   pelo mestre.
   - **A — Depois, numa ADR própria.** Pede um "mestre" que os papéis do
     Verso (dono, editor, leitor — 0081) não têm. _(recomendado)_
   - **B — Já, para os donos da pasta:** "rolar para o dono" mostra a
     rolagem a quem rolou e aos donos da pasta; os outros veem "Ana rolou
     em segredo".

8. **Quem está na mesa.** `[PROPOSED]` O topo do painel mostra quem está
   lá agora (nomes carimbados pelo servidor, as mesmas cores dos
   cursores). Um leitor da pasta está na mesa e pode rolar, como a 0088
   decidiu para uma nota (D2–D11); se um leitor também escreve mensagens
   é do item 3, e o autor recomenda que sim.

9. **Onde a mesa existe.** `[PROPOSED]` Numa pasta do UniVerso, no
   navegador e no app de desktop conectado a ela; numa pasta sincronizada
   enquanto o servidor está ao alcance, como uma nota entra na sua sala
   pela [0082](0082-live-co-editing-of-a-synced-folder.md); num desktop
   que serve a própria pasta ([0096](0096-this-app-is-a-server.md)), o
   desktop é o servidor e guarda a mesa. Numa pasta do computador, sozinho,
   o painel mostra as suas rolagens desta execução, como o histórico local
   do Rolai, e diz que não é compartilhado.

10. **Onde fica o painel.** `[OPEN]`
    - **A — Um painel da área lateral,** como Backlinks ou Estrutura, que
      o usuário pode mover como qualquer painel; no celular, uma folha que
      sobe de baixo. _(recomendado)_
    - **B — Uma barra ao longo da base** da janela, sempre visível quando
      ligada.
    - **C — Uma gaveta flutuante** sobre a nota.

11. **Os dados de cada um.** `[DECIDED 2026-10-21]` Cada pessoa tem a
    sua aparência de dados ([0101](0101-3d-dice-physics-overlay.md):
    cores, textura, material, as três cores), e uma rolagem aparece para
    os outros na aparência de **quem rolou**, não na de quem vê. O
    mantenedor: *"cada usuário vai ter sua própria configuração de dado,
    e deveria refletir para os outros quando ele fizer rolagens"*. O Rolai
    faz o mesmo: uma rolagem e um membro da lista levam o `DiceStyle` de
    quem rolou. Então:
    - A janela manda a sua aparência com a rolagem; o servidor a confere
      contra uma forma fechada — cores como `#rrggbb`, textura e material
      das listas fixas, nada mais, nunca uma URL ou um arquivo — recusa o
      resto, e a repassa com a rolagem e na lista de presentes. O tamanho
      dos dados continua de cada um que vê.
    - Vale para uma rolagem na sala de uma nota ([0088](0088-dice-and-random-tables.md)
      item 4) tanto quanto na mesa.
    - O registro desenha os dados de cada rolagem nas cores de quem rolou.

    `[OPEN]` Se as rolagens dos outros também **caem em 3D** na sua tela
    quando os seus dados 3D estão ligados:
    - **A — Sim, na aparência de quem rolou,** com um interruptor "Mostrar
      em 3D as rolagens dos outros" / "Show others' rolls in 3D", ligado.
      _(recomendado, pelas palavras do mantenedor acima)_
    - **B — Só as suas caem em 3D;** as dos outros aparecem nas cores de
      quem rolou só no registro.

12. **Limites e entrada hostil** ([0083](0083-security-hardening-of-universo.md)).
    `[PROPOSED]` Uma mensagem tem no máximo 500 caracteres e é texto
    simples; o servidor recusa o que passar antes de repassar; mensagens
    têm ritmo por conexão como as rotas REST (uma rajada, depois recusa);
    o registro guardado por mesa e por janela é limitado; a janela desenha
    uma mensagem como texto, nunca como HTML. Uma mensagem nunca vai para o
    log do servidor.

13. **Notificações** ([0084](0084-notifications-in-the-window.md)).
    `[PROPOSED]` Com o painel fechado, o botão dele mostra a contagem de
    entradas não vistas. Um tipo novo, **"Mesa"** / **"Table"**, manda uma
    notificação do sistema para uma mensagem ou rolagem de outra pessoa,
    desligado de início.

14. **Um interruptor de recurso** ([0103](0103-feature-presets-and-capability-flags.md)).
    `[PROPOSED]` "Mesa" / "Table" no grupo RPG e mesa de Ajustes ›
    Recursos, ligado de início onde os dados estão ligados. Desligado: sem
    painel, sem botão; rolagens nas notas como hoje.

15. **Contrato e testes.** `[PROPOSED]` Comandos novos (entrar numa mesa,
    dizer, limpar) e eventos (uma entrada, uma mudança de presentes, uma
    limpeza) definidos em Rust e gerados para a janela (invariante 3); a
    janela chega à mesa só por eles (regra 1). Testes: o servidor repassa
    uma rolagem à sala da nota e à mesa da pasta, rolada uma vez; uma
    mensagem acima do limite é recusada sem ser lida; um leitor pode rolar;
    só um dono limpa; o corte de "ocultar daqui pra trás" usa a hora do
    servidor; um teste de ponta a ponta com duas janelas no harness do
    navegador.

16. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)).
    `[PROPOSED]` O registro é uma lista com uma região viva educada; uma
    entrada de outra pessoa é anunciada com o nome dela (0088 item 8); o
    campo tem rótulo; uma tecla leva ao campo da mesa; pt-BR e inglês.

## Consequências

- O `verso-server` ganha um canal por pasta ao lado das salas por nota
  (se o item 2 for A), seus limites e testes; o `collab_dice.rs` repassa
  uma rolagem a ele além da sala da nota.
- A janela ganha o painel, o botão, o tipo de notificação e o interruptor;
  o cofre de demonstração ganha uma nota que ensina a mesa, e o "Tour do
  Verso" um cartão ([0058](0058-demo-vault-as-tutorial.md)).
- Se o item 5 não for A, a 0088 item 4 é revisada no mesmo pull request.
- Nada é gravado num arquivo da pasta, a não ser por "Copiar para uma
  nota".

## Alternativas descartadas

Nenhuma registrada. As opções dos itens 2, 3, 5, 7, 10 e 11 estão
abertas, não descartadas.

## Situação

Proposta (2026-10-21). Não construída. Espera as respostas do mantenedor
aos itens 2, 3, 5, 7, 10 e 11 e uma leitura do outro modelo.
