# ADR 0065 — Uma pasta por janela

- Data: 2026-10-06
- Fonte: o mantenedor, em sessão: "se eu vou no menu la em cima, Arquivo,
  Nova janela, eu nao consigo trocar a pasta que ta aberta no verso. do
  jeito que ta nao consigo abrir várias instancias de verdade". Perguntado
  como, escolheu "Cada janela, sua pasta" em vez de processos separados e de
  deixar para depois.
- Revê: `docs/reference/views-decision.md` §4 (uma segunda janela na mesma
  pasta; abrir outra pasta recusado enquanto houver mais de uma janela
  aberta), decidido com o [0053](0053-views-bases.md) e o
  [0049](0049-phase-2-scope-widened.md).
- Status no briefing: não consta

## Contexto

O host mantinha uma pasta aberta para o app inteiro — uma sessão, um índice,
um watcher — e todo comando a lia. Uma segunda janela entrava nessa pasta, e
nenhuma janela podia abrir outra enquanto duas estivessem abertas: a outra
continuaria mostrando a pasta antiga e gravaria na nova com os nomes dela.

## Decisão

Escrito pelo autor a partir da escolha do mantenedor acima, e aceito por ela
(Status).

1. **Cada janela do app mostra uma pasta sua**, como o Obsidian mostra um
   cofre por janela. O host mantém uma sessão por pasta aberta e sabe que
   pasta cada janela mostra; um comando responde a partir da pasta da janela
   que perguntou. Duas janelas na mesma pasta dividem a sessão dela, como
   duas janelas faziam antes; uma pasta que nenhuma janela mostra mais é
   fechada.
2. **Abrir uma pasta numa janela muda só essa janela.** Uma janela só é
   impedida de trocar enquanto uma de suas notas está aberta numa janela
   própria e nenhuma outra janela mostra aquela pasta (a nota perderia a
   pasta a que pertence).
3. **Arquivo › Nova janela abre uma janela sem pasta**, na página inicial,
   para abrir uma. "Nova janela nesta pasta" (a paleta, o menu da aba) abre
   uma na pasta da janela em que foi pedida.
4. **Uma pasta entregue ao app** — `verso <pasta>`, `open -a`, Arquivo ›
   Abrir recente — abre numa janela sem pasta se houver uma, senão numa
   janela nova; Arquivo › Abrir pasta… e o "Abrir pasta" do app trocam a
   pasta da janela em que são usados. Os itens do menu agem na janela que
   tem o foco. Uma pasta entregue ao app em execução nunca fecha nem
   substitui uma janela que mostra uma pasta (uma janela na pasta de um
   servidor, ou à espera dela, conta como mostrando uma); uma pasta que
   alguma janela já mostra traz aquela janela para a frente em vez de abrir
   outra (esclarecido em 23/10/2026, `fix/handed-folder-closes-main`).
5. **O título de uma janela é o nome da sua pasta.**
6. **O que não muda:** os tipos do contrato; uma nota aberta numa janela
   própria pertence à pasta de onde veio; só a janela principal guarda o seu
   layout entre aberturas (uma janela aberta depois começa com uma área
   vazia, como antes).
7. **Ao iniciar, toda janela de pasta que estava aberta volta** (emendado em
   23/10/2026, `fix/reopen-windows`). O host guarda as chaves das pastas que
   as janelas mostram em `open-windows.json`, na pasta de configuração
   (só chaves, nunca um caminho; a pasta de um servidor como
   `server:<url>#<pasta>`), atualizadas quando uma pasta abre e quando a
   pessoa fecha uma janela. Não muda enquanto o app sai (⌘Q, o reinício da
   atualização) nem pela última janela; então uma saída traz de volta todas
   as janelas, e fechar todas à mão traz de volta a última. Uma pasta local que
   não existe mais é pulada e registrada no log; a pasta de um servidor que
   não abre (o servidor fora do ar por instantes, como quando uma atualização
   reinicia os dois) mantém a sua chave até a pessoa fechar aquela janela. A posição e o tamanho de
   uma janela não são guardados.

## Consequências

- `app/src-tauri/src/lib.rs`: a `session` única vira as sessões por pasta e
  a pasta de cada janela; os comandos recebem a janela que perguntou; uma
  janela que fecha libera a sua pasta. `new_window` recebe se a janela entra
  na pasta da janela que pediu (os bindings são gerados de novo, regra 3 do
  [0026](0026-core-ui-contract-inviolable-rules.md)).
- A janela (`main.ts`): uma janela aberta depois abre uma pasta entregue ou
  mostra a página inicial, nunca a última pasta; os eventos do menu levam o
  rótulo da janela a que se destinam.
- O harness do navegador tem uma janela: o que este registro muda é seguido
  no app (nível A do roteiro).
- Autoria: Opus 5.5 — código do host é do Fable 5.1 pelo
  [ADR 0032](0032-author-and-reviewer-roles.md), e o mantenedor pediu em
  2026-10-06 que o Fable não fosse usado: um desvio, com a leitura antes do
  merge designada pelo mantenedor.

## Alternativas descartadas

- Processos separados, um por janela — oferecida com este registro: as
  cópias dividiriam os ajustes do app no disco e sobrescreveriam os ajustes
  umas das outras, e uma pasta aberta em duas cópias teria dois índices em
  conflito.
- Deixar para depois, como `[ABERTO]` — oferecida com este registro.

## Status

Aceito (2026-10-06): o mantenedor, em sessão, escolhendo "Cada janela, sua
pasta" entre as três opções que lhe foram postas.
