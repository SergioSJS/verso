# Uma mesa em três aparelhos — teste, 23/10/2026

Uma mesa de campanha ([ADR 0107](../adr/0107-the-table-a-shared-roll-and-chat-log.md),
[ADR 0110](../adr/0110-a-table-is-a-campaign-folder.md)) jogada de ponta a
ponta em três aparelhos reais contra o UniVerso de teste, com o build de
`feat/rpg-tools` em `1cac0382`. As capturas estão em
[`docs/media/test-runs/2026-10-23-mesa/`](/docs/media/test-runs/2026-10-23-mesa/).

## Montagem

| Quem | Aparelho | Como chegou à pasta |
|---|---|---|
| Mestre (sergio, dono) | Mac, o app Verso Beta | Uma pasta do Mac, "Ruínas de Valdor", **sincronizada** com o servidor |
| Ana (jogadora) | Chromium no Linux (VM 104), a janela web do servidor | A pasta compartilhada, online |
| Bruno (jogador) | Windows 11 (VM 103), o app Verso Beta, em inglês | A pasta compartilhada, aberta online em Ajustes › Servidores |

O servidor: UniVerso `0.8.3-beta.2` (`1cac038`) em Docker numa VM de 1 GB e um
núcleo (107). As contas das jogadoras vieram de convite do admin; o mestre
compartilhou a pasta com elas como leitoras. As janelas das jogadoras foram
conduzidas pelo Playwright (o navegador pela rede; o app do Windows pela porta
de depuração do WebView2, por um túnel SSH); o app do Mac por cliques e
teclas. Toda captura é da janela real.

## O que foi testado, e o que aconteceu

| # | Passo | Resultado |
|---|---|---|
| 1 | O mestre abre uma pasta local de notas feitas fora do Verso | Funciona ([01](/docs/media/test-runs/2026-10-23-mesa/01-mestre-mac-pasta-local.png)) |
| 2 | Conecta o app do Mac ao servidor (código do aparelho aprovado no navegador) e sincroniza a pasta com um clique | Funciona ([02](/docs/media/test-runs/2026-10-23-mesa/02-mestre-mac-pasta-sincronizada.png)) |
| 3 | Faz da pasta toda uma mesa: toda nota começa oculta, com cadeado | Funciona ([03](/docs/media/test-runs/2026-10-23-mesa/03-mestre-mac-mesa-criada-notas-ocultas.png)) |
| 4 | Compartilha a pasta com Ana e Bruno (a senha é pedida de novo, regra dos dez minutos) | Funciona ([04](/docs/media/test-runs/2026-10-23-mesa/04-mestre-mac-jogadores-convidados.png)) |
| 5 | Libera quatro notas, dá nome secreto a uma, faz cada ficha editável pela sua jogadora e a nota do grupo pelo grupo | Funciona ([05](/docs/media/test-runs/2026-10-23-mesa/05-mestre-mac-editavel-por.png)) |
| 6 | Ana vê só o que foi liberado; um link para nota oculta aparece como texto com cadeado, um nome secreto como ▒▒▒▒ | Funciona ([06](/docs/media/test-runs/2026-10-23-mesa/06-ana-linux-so-o-liberado.png), [07](/docs/media/test-runs/2026-10-23-mesa/07-ana-linux-links-trancados.png)) |
| 7 | Ana compõe uma rolagem na bandeja de dados (d20, modificador +6) e rola; dados 3D para ela e para o mestre | Funciona ([08](/docs/media/test-runs/2026-10-23-mesa/08-ana-linux-compondo-rolagem.png), [09](/docs/media/test-runs/2026-10-23-mesa/09-ana-linux-dados-3d.png), [10](/docs/media/test-runs/2026-10-23-mesa/10-mestre-mac-ve-dados-da-ana.png)) |
| 8 | Mensagem do mestre com `[[link]]`, e uma rolagem secreta: as jogadoras leem "rolou em segredo" | Funciona ([11](/docs/media/test-runs/2026-10-23-mesa/11-mestre-mac-mensagem-e-rolagem-secreta.png), [12](/docs/media/test-runs/2026-10-23-mesa/12-ana-linux-ve-so-que-rolou-em-segredo.png)) |
| 9 | Ana rola da ficha e escreve nela; o mestre vê ao vivo e o arquivo no Mac muda | Funciona ([13](/docs/media/test-runs/2026-10-23-mesa/13-ana-linux-edita-a-propria-ficha.png), [14](/docs/media/test-runs/2026-10-23-mesa/14-mestre-mac-ficha-da-ana-ao-vivo.png)) |
| 10 | Ana tenta escrever na ficha do Bruno | Recusado: nada é gravado ([15](/docs/media/test-runs/2026-10-23-mesa/15-ana-linux-ficha-do-bruno-so-leitura.png)) |
| 11 | Bruno entra pelo app do Windows; três pessoas na mesa; ele compõe e rola, 3D em todas as telas | Funciona ([16](/docs/media/test-runs/2026-10-23-mesa/16-bruno-windows-app.png), [17](/docs/media/test-runs/2026-10-23-mesa/17-bruno-windows-mesa-tres-pessoas.png), [18](/docs/media/test-runs/2026-10-23-mesa/18-bruno-windows-dados-3d.png), [19](/docs/media/test-runs/2026-10-23-mesa/19-mestre-mac-ve-dados-do-bruno.png)) |
| 12 | O board do grupo: o mestre arrasta notas e uma rolagem da Mesa para ele | Funciona para o mestre ([20](/docs/media/test-runs/2026-10-23-mesa/20-mestre-mac-board-com-rolagem-arrastada.png)); as jogadoras só veem as mudanças ao reabrir o board ([21](/docs/media/test-runs/2026-10-23-mesa/21-ana-linux-board-depois-de-reabrir.png)) — achado 3 |
| 13 | O mestre e Ana escrevem na nota do grupo ao mesmo tempo | Os dois textos ficam, sem cópia de conflito ([22](/docs/media/test-runs/2026-10-23-mesa/22-mestre-mac-edicao-simultanea.png)) |
| 14 | Bruno escreve na ficha dele pelo Windows | Chega ao arquivo do Mac |
| 15 | O mestre fecha a mesa e a abre de novo | As duas jogadoras ficam de fora e voltam ([23](/docs/media/test-runs/2026-10-23-mesa/23-ana-linux-mesa-fechada.png), [24](/docs/media/test-runs/2026-10-23-mesa/24-bruno-windows-mesa-fechada.png)); as mensagens estão erradas — achado 8 |
| 16 | O mestre compõe 2d6 + 1d20 + 2 e rola; Bruno vê cair | Funciona ([25](/docs/media/test-runs/2026-10-23-mesa/25-mestre-mac-compoe-rolagem.png), [26](/docs/media/test-runs/2026-10-23-mesa/26-bruno-windows-ve-rolagem-do-mestre.png)) |

Os boards das jogadoras (um board que as jogadoras editam, ADR 0110 item 6)
são da fase 2 e não estão construídos: um board numa mesa pode ser liberado,
nunca tornado editável pelas jogadoras. O teste usou o board do mestre.

## Achados

Classificados como na [ADR 0033](../adr/0033-pr-workflow.md).

### Corrigidos durante o teste

1. **IMPORTANTE — A Mesa do mestre dizia "indisponível" com o link no ar.**
   Depois da sessão encerrada e de entrar de novo, o alcance da pasta
   sincronizada ficou "no ar" do começo ao fim, então a entrada respondida
   "indisponível" nunca era tentada de novo. Corrigido em `fb83a524`.
2. **IMPORTANTE — Uma jogadora que ligou os dados 3D ficou fora da mesa.**
   Uma mudança de ajuste faz a janela sair da mesa e entrar de novo; duas
   seguidas mandavam duas entradas, e a primeira saída chegava depois da
   segunda entrada. Toda rolagem depois disso era recusada com "join the table
   first". Corrigido em `1cac0382`, com teste.

### Abertos

3. **IMPORTANTE — O board aberto de uma leitora não atualiza ao vivo.** As
   jogadoras só viram os cartões novos do mestre ao reabrir o board, e o board
   do mestre dizia "ao vivo, só você" com as duas abertas nele. Correção em
   andamento em `fix/board-reader-live`.
4. **IMPORTANTE — O resultado de uma rolagem na linha aparece em todo botão
   com a mesma notação.** O arco e a adaga são `1d20+6`; o resultado de um
   apareceu ao lado dos dois, na nota, na visão do mestre e no cartão do board
   ([14](/docs/media/test-runs/2026-10-23-mesa/14-mestre-mac-ficha-da-ana-ao-vivo.png)). Em andamento no mesmo ramo.
5. **MENOR — O board de uma leitora diz "salvo por um Verso mais novo".** O
   aviso de arquivo de versão mais nova aparece em todo board que não pode ser
   gravado, o de uma leitora inclusive. Em andamento no mesmo ramo.
6. **MENOR — O app do Windows mostra a barra de desenho no board de uma
   leitora**, onde o navegador não mostra nenhuma; nada é gravado. Em
   andamento no mesmo ramo.
7. **IMPORTANTE — No board, o adesivo não rola.** A ferramenta de nota da
   barra faz um adesivo desenhado, onde `dice:` fica texto simples
   ([27](/docs/media/test-runs/2026-10-23-mesa/27-bug-adesivo-do-board-sem-dado.png)); o board não tem como pôr um cartão de texto Markdown, onde as
   rolagens funcionam, a não ser arrastando uma rolagem da Mesa. Falta decidir
   como se faz um cartão de texto.
8. **IMPORTANTE — As recusas chegam à janela embrulhadas na frase errada.** Uma
   sessão encerrada dizia "Erro: Esse caminho não pode nomear um arquivo da
   pasta. (sign in first)", a mesa fechada a mesma frase com "(a mesa está
   fechada)"; no Windows a mesa fechada dizia "Share revoked". O estado da mesa
   está certo; só as palavras estão erradas.
9. **MENOR — "join the table first"** apareceu em inglês, numa janela em
   português (a recusa do servidor passou direto).
10. **MENOR — Arrastar uma entrada da Mesa seleciona todo o texto da janela**
    no app do Mac ([28](/docs/media/test-runs/2026-10-23-mesa/28-bug-arrastar-seleciona-texto.png)).
11. **MENOR — A leitora ganha o editor.** Numa nota que a jogadora só pode ler,
    "Editar" abre a barra de formatação e um cursor; digitar não faz nada.
    "Você só lê esta pasta." também aparece duas vezes numa nota, e fica numa
    ficha que a jogadora pode editar.
12. **MENOR — Os botões do modificador no compositor se chamam só "diminuir" e
    "aumentar"**, sem "modificador" para um leitor de tela.
13. **MENOR — No Windows, as abas do painel direito se espremem contra os
    botões da janela** nos 1280 × 800 da VM.
14. **MENOR — Os dados 3D começam desligados** (como decidido), então cada
    jogadora liga em Ajustes › Dados e RPG antes de vê-los cair na própria
    tela.
15. **IMPORTANTE — Windows: um teste travou.**
    `tests_dns_tls::the_certificate_is_checked_for_the_urls_name_not_for_the_address`
    rodou por mais de uma hora na execução completa dos testes de `verso-app`
    e passa sozinho em 16 s. É de 16/10/2026.

## Não testado

- O celular e o tablet.
- Imagens enviadas à mesa.
- O link de convite da mesa para quem não tem conta (as jogadoras tinham
  conta, então entraram pelo Compartilhar).
- Bruno sincronizando a pasta no disco do Windows (ele abriu online).
