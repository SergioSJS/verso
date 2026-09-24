# ADR 0051 — Fluxo de desenvolvimento, versões e releases

- Data: 2026-09-24
- Fonte: as mensagens do mantenedor de 2026-09-24, citadas abaixo;
  [0033](0033-pr-workflow.md), [0029](0029-guardrails-in-ci.md)
- Status no briefing: não consta

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
   hash. O mantenedor faz o merge; o merge é a aprovação.
3. **As mudanças se acumulam na `main` até uma versão.** Todo pull request
   acrescenta as suas linhas em "Não lançado" no `CHANGELOG.md` e no gêmeo
   pt-BR dele.
4. **As versões seguem o SemVer, `0.y.z` antes do 1.0.** `vX.Y.Z` é uma
   release de produção; `vX.Y.Z-beta.N` é uma release de teste. A versão mora
   num lugar só, o `Cargo.toml` do workspace, que todo crate e o app leem; o
   `app/ui/package.json` é mantido igual. As tags de versão são permanentes:
   um ruleset recusa apagar ou mover uma tag `v*`.
5. **Uma versão só é gerada quando o mantenedor pede** — pelo mantenedor, ou
   por um agente a pedido dele — com o `scripts/release.mjs`:
   `prepare X.Y.Z[-beta.N]` define a versão e move as entradas não lançadas do
   changelog para ela, num pull request; depois do merge, `tag
   X.Y.Z[-beta.N]` marca a `main` e envia a tag.
6. **A tag compila e publica a release** (`.github/workflows/release.yml`), e
   nada mais o faz: o app de macOS (arm64) num zip e a linha de comando num
   arquivo, o changelog da versão como notas, uma pré-release para
   `-beta.N`. Uma release de teste é o "Verso Beta", com um identificador
   próprio, para ser instalado ao lado do app de produção com ajustes
   próprios, e a linha de comando dele o abre. Windows, depois Linux, entram
   quando os portes chegarem ([0022](0022-target-platforms-macos-first.md)).
7. **O app diz qual ele é**: a versão e o commit de onde foi compilado, nos
   ajustes e no painel Sobre do macOS, e pelo `verso --version`.

## Consequências

- O app é assinado ad hoc, não com um Developer ID: o macOS pede uma vez, na
  primeira abertura, para liberá-lo ("Abrir Mesmo Assim" em Privacidade e
  Segurança). Um Developer ID (uma assinatura paga da Apple) é decisão para
  antes da distribuição pública; a assinatura de código no Windows também.
- Uma release custa um job de macOS, uns dez minutos, cada um cobrado como dez
  de Linux ([0029](0029-guardrails-in-ci.md)); gerar versão é raro de
  propósito.
- A conta do GitHub que os agentes usam é a do mantenedor, então as proteções
  valem igual para os dois: uma mudança só chega à `main` por pull request, e
  uma versão só existe por uma tag que o script de release envia quando
  pedido.
- Um pull request que muda o que o usuário vê sem uma linha no changelog está
  incompleto, como um sem o gêmeo pt-BR está
  ([0008](0008-documentation-language.md)).
- A primeira versão, quando o mantenedor pedir, é `0.2.0-beta.1`: o mês de uso
  real da Fase 2 roda num app instalado em vez de num build de
  desenvolvimento.

## Alternativas descartadas

- Uma branch de integração de vida longa mesclada como um pull request só — o
  que as Fases 1 e 2 fizeram; grande demais para ler e para explicar (a
  condição de merge 3 da [0033](0033-pr-workflow.md)).
- Merges com squash ou rebase — os dois reescrevem os commits e quebram os
  hashes que os documentos citam.
- Releases publicadas à mão a partir de um rascunho — a primeira proposta do
  autor; o mantenedor quer que agentes consigam gerar uma versão quando
  pedido.
- Revisões com aprovação obrigatória — o GitHub não deixa o autor aprovar o
  próprio pull request, e o merge do mantenedor é a aprovação.
- Um `.dmg` — montar um usa o Finder e falha em máquinas sem tela com
  frequência suficiente; um zip feito pelo `ditto` guarda a assinatura.

## Status

Aceito.
