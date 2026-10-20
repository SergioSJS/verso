# ADR 0051 — Fluxo de desenvolvimento, versões e releases

- Data: 2026-09-24
- Fonte: as mensagens do mantenedor de 2026-09-24, citadas abaixo;
  [0033](0033-pr-workflow.md), [0029](0029-guardrails-in-ci.md)
- Status no briefing: não consta
- Revisões: 2026-09-24 — o índice compartilhado da Decisão 6 mantido pelo
  mantenedor, sobre `docs/reference/beta-config-decision.md`, com um ponto
  para revê-lo (Consequências). 2026-09-24 — a Decisão 2 suspensa pelo
  mantenedor até o fluxo inteiro existir — sync, a web, mobile: até lá uma
  branch pode levar vários assuntos e chega à `main` num pull request grande,
  ainda com um merge commit ([0033](0033-pr-workflow.md), no mesmo dia, com as
  palavras do mantenedor). 2026-09-24 — Decisão 6: a linha de comando vai
  também dentro do app, que os ajustes ligam no `PATH`
  ([0054](0054-terminal-and-agents-from-the-app.md)); o arquivo separado
  continua. 2026-10-02 — Decisões 5 e 6: um merge só lança. Depois de a
  0.3.0-beta.3 pedir um pull request da feature, um pull request da release
  e uma tag, o mantenedor: "esse processo de gerar versao ta ruim de mais", e depois "ta, melhore o fluxo de deploy entao, ai testamos na próxma versao". A versão agora vai no pull
  request que lança, e o merge dele na `main` compila, publica e cria a
  tag. 2026-10-13 — Decisão 4: como os números andam. O mantenedor, em
  2026-10-13: *"0.9 só quando estiver quase tudo pronto"*. A partir da
  0.8.0-beta.1 só o último número anda — 0.8.1, 0.8.2, … — cada uma ainda
  uma release de teste `-beta.N` até a linha ficar estável; a próxima
  release é a 0.8.1-beta.1.
  2026-10-14 — Decisão 6: a página da release. Da página da
  0.8.0-beta.1 — 28 arquivos sob o changelog cru, nada dizendo qual
  baixar — o mantenedor, em 2026-10-14: *"do jeito que tá, tá muito ruim …
  alguma instrução pra falar qual versão que a pessoa tem que baixar"*. As
  notas que o `release.mjs notes` monta agora são uma página para quem não
  é técnico: o que é o Verso e, numa release de teste, que ela é uma;
  *Qual arquivo baixar?*, uma tabela por público — um Mac com chip Apple (e
  como saber), Windows, Linux por distribuição, a linha de comando (quase
  ninguém), o UniVerso por processador — cada arquivo nomeado como link na
  tag da versão; como instalar em cada sistema, o aviso da primeira
  abertura incluído; que os arquivos `.sig` podem ser ignorados; as
  novidades, a abertura de cada item, no máximo doze; e o changelog
  completo recolhido. Inglês primeiro, pt-BR logo depois
  ([0008](0008-documentation-language.md)). Os arquivos vêm de uma lista
  só, em `scripts/release-page.mjs`, que um teste confere contra os nomes,
  os uploads e a contagem do `.github/workflows/release.yml`; o
  `release.mjs preview` mostra a página da próxima versão antes de ela ser
  cortada.
  As novidades de cada idioma vão marcadas na página, e o painel de
  atualização do app mostra só essa parte, no idioma da janela, em linhas
  simples (`app/ui/src/updateNews.ts`).
  2026-10-14 — Decisão 6: os arquivos da release. Uma lista de checksums
  assinada, `verso-<versão>-SHA256SUMS` e o `.sig` dela, no lugar de um
  `.sig` ao lado de cada arquivo ([0055](0055-in-app-updater.md), revisto
  no mesmo dia, o mantenedor: *"Sim, já na 0.8.3"*): uma release publica
  16 arquivos, 30 na 0.8.3, a ponte que publica os dois. A lista é feita
  por um job próprio quando todas as plataformas estão construídas; o job
  de publicação confere os arquivos pelo nome contra o `release.mjs
  assets` no lugar de uma contagem; a página diz que a lista e o `.sig`
  podem ser ignorados.
  2026-10-14 — a Consequência sobre a assinatura ad hoc respondida pelo
  [0095](0095-mac-notarization-and-windows-code-signing.md), aceito pelo
  mantenedor naquela noite (*"Sim, todas"*): um Developer ID e a
  notarização para todo release a partir de quando o certificado existir,
  os betas também, e um build de Mac x64 separado quando o repositório for
  público.
  2026-10-15 — o Developer ID e a notarização **abandonados**: o
  mantenedor não vai se inscrever no Apple Developer Program nem pagar à
  Apple (0095, Revisões). O app do Mac continua assinado ad hoc, como diz a
  Consequência deste ADR; o build de Mac x64 vale.
  2026-10-20 — o beta a partir de um checkout. Outro agente instalou um
  beta copiando um binário compilado antes da janela, e as correções que
  ele relatou nunca chegaram ao app; o mantenedor: *"Deveria ser óbvio
  para qualquer agente de IA que estiver operando o repositório qual o
  fluxo correto de deploy"*. Uma mudança que o usuário vê termina com o
  beta instalado no Mac pelo `scripts/install-beta.sh`, que compila a
  janela primeiro, compila os binários nativamente, põe o `ui-web` e as
  chaves do Info.plist no bundle, assina ad hoc, fecha o beta aberto sem
  perder trabalho e falha se o log não disser `started <versão>
  (<commit>)` sem ERROR. O README o lista; o `AGENTS.md` aponta todo
  agente para o `CLAUDE.md`.

## Contexto

As Fases 1 e 2 chegaram à `main` como um pull request de 140 commits vindo de
uma branch de integração de vida longa, mesclado depois de cinco leituras.
Nada dizia como uma mudança chega à `main` depois disso, o que é uma versão, ou
como o app sai de um commit e chega à máquina do mantenedor: o app não tinha
versão (todo arquivo dizia `0.0.0`) nem mostrava uma, e nada o compilava fora
de uma árvore de desenvolvimento. O mantenedor achou o fluxo fraco e propôs a
forma dele: *"o build de versões deveria ser feito em tags e conter versão de
produção e versões releases de teste. Main protegida"*.

## Decisão

Decidido em 2026-09-24 pelo mantenedor, que aceitou a proposta do autor com
uma mudança — *"Concordo com tudo, com exceção de gerar versão, agentes
deveriam conseguir, deixe o caminho para isso. Quando for pedido."* — e
acrescentou o changelog: *"branches menores, acumular funcionalidades, fixes e
modificações até gerar versão, considerando changelog inclusive"*.

1. **A `main` é protegida.** Ela só recebe pull requests; o job de guardrails
   de Linux tem que passar; sem force push e sem apagar; a regra vale também
   para administradores. Nenhum agente faz push na `main`.
2. **Uma branch curta por assunto** (`feat/…`, `fix/…`, `docs/…`,
   `chore/…`), um pull request pequeno, mesclado com um **merge commit**, que
   guarda todos os commits e os hashes deles — os documentos citam commits por
   hash. O mantenedor faz o merge; o merge é a aprovação. *(Até o fluxo
   inteiro existir — sync, a web, mobile —, uma branch pode levar vários
   assuntos e o pull request dela é grande, por decisão do mantenedor de
   2026-09-24 ([0033](0033-pr-workflow.md), Consequências); uma branch curta
   por assunto depois dele. O merge commit, e o merge do mantenedor como a
   aprovação, não mudam.)*
3. **As mudanças se acumulam na `main` até uma versão.** Uma mudança que o
   usuário vê acrescenta as suas linhas em "Não lançado" no `CHANGELOG.md` e
   no gêmeo pt-BR dele.
4. **As versões seguem o SemVer, `0.y.z` antes do 1.0.** `vX.Y.Z` é uma
   release de produção; `vX.Y.Z-beta.N` é uma release de teste. A versão mora
   num lugar só, o `Cargo.toml` do workspace, que todo crate e o app leem; o
   `app/ui/package.json` é mantido igual. **As tags de versão são
   permanentes**: um ruleset recusa apagar ou mover uma tag `v*`, sem ninguém
   isento — perguntado depois de a leitura do pull request que trouxe esta
   ADR achar isso registrado sem a palavra dele, o mantenedor respondeu
   *"Manter"* (2026-09-24). *(2026-10-13: a versão 0.9 fica reservada para
   quando quase tudo estiver pronto — o mantenedor: "0.9 só quando estiver
   quase tudo pronto" — então, a partir da 0.8.0-beta.1, só o último
   número anda, 0.8.1, 0.8.2, …, cada uma ainda uma release de teste
   `-beta.N` até a linha ficar estável; a próxima release é a
   0.8.1-beta.1.)*
5. **Uma versão só é gerada quando o mantenedor pede** — pelo mantenedor, ou
   por um agente a pedido dele — com o `scripts/release.mjs prepare
   X.Y.Z[-beta.N]`, **na branch do pull request que lança**: ele define a
   versão e move as entradas não lançadas do changelog para ela, num commit
   desse pull request. Não há pull request de release próprio. *(Até
   2026-10-02, o `prepare` abria um a partir da `main`, e o `tag` marcava o
   merge dele à mão.)*
6. **O merge que traz uma versão nova à `main` compila e publica a
   release** (`.github/workflows/release.yml`), e nada mais o faz: a cada
   push na `main`, um job curto de Linux lê a versão do workspace e para se
   a tag dela existe; senão o job de macOS compila o app (arm64) num zip e a
   linha de comando num arquivo, e os publica com o changelog da versão como
   notas, uma pré-release para `-beta.N` — publicar cria a tag
   `vX.Y.Z[-beta.N]` nesse merge. Uma tag enviada à mão (`release.mjs tag`,
   para quando o caminho automático não conseguiu criar a tag) ainda lança.
   Antes de compilar, o workflow confere que a tag nomeia a versão que as
   fontes carregam, no formato de uma versão, com o changelog dela nas duas
   línguas, num commit que está na `main`. Uma release de teste é o "Verso
   Beta", com um identificador próprio, para ser instalado ao lado do app de
   produção com os próprios ajustes da janela, e a linha de comando dele o
   abre; o índice, um cache que se refaz, é compartilhado. Windows, depois
   Linux, entram quando os portes chegarem
   ([0022](0022-target-platforms-macos-first.md)). *(Desde 2026-10-08,
   [0069](0069-windows-port.md) item 6: um job de Windows gera o instalador
   NSIS e a linha de comando ao lado do job de macOS, e um job curto de
   Linux publica a release quando os dois terminam — uma versão é publicada
   inteira ou não é. Desde 2026-10-09 cada arquivo é assinado com a chave
   de release do [0055](0055-in-app-updater.md), e o `.sig` dele é
   publicado ao lado; desde 2026-10-14 uma lista de checksums assinada no
   lugar dos `.sig`, com a 0.8.3 publicando os dois.)*
7. **O app diz qual ele é**: a versão e o commit de onde foi compilado, nos
   ajustes e no painel Sobre do macOS, e pelo `verso --version`.

## Consequências

- **Um ensaio antes da primeira tag**: o workflow de release rodado à mão
  (Actions → release → Run workflow) compila os mesmos arquivos a partir da
  `main` como uma release de teste e os guarda como artefatos da execução,
  sem publicar nada.
- **Uma release que falha**: rode de novo — o passo de publicação substitui
  os arquivos e as notas de uma release parcial; se falhou antes de criar a
  tag, o `release.mjs tag` marca o merge à mão e a dispara de novo. Se as fontes causam a
  falha, a versão não pode sair: corrija num pull request, devolva as linhas
  do changelog da versão que falhou para "Não lançado" no mesmo pull request,
  e gere o próximo `-beta.N` (ou o próximo patch).
- O app é assinado ad hoc, não com um Developer ID: o macOS pede uma vez, na
  primeira abertura, para liberá-lo ("Abrir Mesmo Assim" em Privacidade e
  Segurança). Um Developer ID (uma assinatura paga da Apple) é decisão para
  antes da distribuição pública; a assinatura de código no Windows também.
- Uma release custa um job de macOS, uns dez minutos, cada um cobrado como dez
  de Linux ([0029](0029-guardrails-in-ci.md)); gerar versão é raro de
  propósito.
- A conta do GitHub que os agentes usam é a do mantenedor, então as proteções
  valem igual para os dois: uma mudança só chega à `main` por pull request.
  Que uma versão só venha do script de release, quando pedido, é regra desta
  ADR e do `CLAUDE.md`, não uma configuração do GitHub. O repositório aceita
  só merge commits; merges com squash e rebase estão desligados.
- Um pull request que muda o que o usuário vê sem uma linha no changelog está
  incompleto, como um sem o gêmeo pt-BR está
  ([0008](0008-documentation-language.md)).
- A primeira versão, quando o mantenedor pedir, é `0.2.0-beta.1`: o mês de uso
  real da Fase 2 roda num app instalado em vez de num build de
  desenvolvimento.
- **O índice compartilhado é revisto num ponto**: antes que uma beta mude o
  schema do índice enquanto uma versão de produção está instalada na mesma
  máquina. Até lá os dois custos de compartilhar não podem acontecer — cada
  app reconstruir o índice do outro a cada troca, e as consultas de um
  falharem enquanto o outro reconstrói. Decidido pelo mantenedor em
  2026-09-24, na sessão, mantendo a opção (a) de
  `docs/reference/beta-config-decision.md`, que expõe os custos e as duas
  outras opções.
- **Todo build leva o inspetor da janela** — a opção `devtools` do Tauri:
  Visualização › Abrir console (⌥⌘I), e a paleta, abrem o console, os
  elementos e a rede da janela em foco também no app instalado; uma
  configuração em Geral desliga. Decidido pelo mantenedor em 2026-09-30, em
  sessão ("quero isso tudo ai"), sobre a nota do autor dos dois custos: no
  macOS a opção passa por uma API privada, o que só faria um build da App
  Store ser recusado; e quem tem o app aberto na máquina pode ler o que a
  janela guarda, notas incluídas — nada além do que o acesso à pasta já dá.
  Confirmado pelo mantenedor em 2026-10-01 (revisão crítica
  [`docs/review/board.md`](../review/board.md), §6 item 15). A configuração
  esconde o item de menu, a tecla e o comando da paleta; as web views são
  construídas com o inspetor ligado do mesmo jeito, então o "Inspecionar
  elemento" da própria web view, onde um menu o mostra, ainda o abre.

## Alternativas descartadas

- Uma branch de integração de vida longa mesclada como um pull request só — o
  que as Fases 1 e 2 fizeram; grande demais para ler e para explicar (a
  condição de merge 3 do [0033](0033-pr-workflow.md)). *(Em 2026-09-24 o
  mantenedor fez dos pull requests grandes a regra até o fluxo inteiro
  existir: Decisão 2.)*
- Merges com squash ou rebase — os dois reescrevem os commits e quebram os
  hashes que os documentos citam.
- Releases publicadas à mão a partir de um rascunho — a primeira proposta do
  autor; o mantenedor quer que agentes consigam gerar uma versão quando
  pedido.
- Revisões com aprovação obrigatória — o GitHub não deixa o autor aprovar o
  próprio pull request, e o merge do mantenedor é a aprovação.
- Um `.dmg` — montar um usa o Finder e falha em máquinas sem tela com
  frequência suficiente; um zip feito pelo `ditto` guarda a assinatura.
- *(2026-10-02)* Um pull request de release mantido aberto por um robô
  (release-please, changesets) — ainda dois merges, e uma dependência de
  uma action de terceiros.
- *(2026-10-02)* Compilar a release no Mac do mantenedor e subi-la com o
  `gh release create` — de graça e rápido, mas preso a uma máquina e não
  reproduzível.

## Status

Aceito.
