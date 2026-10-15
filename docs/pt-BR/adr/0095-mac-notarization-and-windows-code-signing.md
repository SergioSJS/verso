# ADR 0095 — Notarização no Mac e assinatura de código no Windows, e o build para Mac Intel

- Data: 2026-10-14
- Fonte: `docs/roadmap.md`, revisão 8, linha V.11 e decisão R3 —
  *"Notarização no Mac e assinatura de código no Windows: como, e a que
  custo"*, `[DECIDIDO 2026-10-14]` como recomendado (*"Sim, todas"*):
  **um ADR próprio, revisando o 0051 e o 0069**; linha V.21, o app de
  Mac Intel, trazido para a V1 pela resposta do mantenedor de 2026-10-14
  sobre as lacunas do núcleo. Escrito por Opus 5.5 a pedido do
  mantenedor; a ser lido pelo outro modelo antes de ser aceito
  ([0032](0032-author-and-reviewer-roles.md)). Os fatos abaixo foram
  lidos em 2026-10-14 nas fontes indicadas; os preços são preços de
  tabela daquele dia.
- Relacionados: [0051](0051-development-flow-and-releases.md) (releases;
  o app assinado ad hoc, *"Um Developer ID (uma assinatura paga da Apple)
  é decisão para antes da distribuição pública; a assinatura de código no
  Windows também"*),
  [0069](0069-windows-port.md) item 3 (*"Sem assinatura de código por
  enquanto"*), [0055](0055-in-app-updater.md) (a chave de release e a
  lista de checksums assinada), [0022](0022-target-platforms-macos-first.md),
  [0071](0071-linux-port.md), [0054](0054-terminal-and-agents-from-the-app.md)
  (a linha de comando dentro do app), [0001](0001-open-tool-no-company.md)
  (nenhuma empresa; só doações), [0007](0007-private-repo-until-license.md)
  (o repositório privado até a licença; roadmap V.12),
  [0029](0029-guardrails-in-ci.md) (o custo da CI), [0005](0005-license.md).
- Status no briefing: ausente.
- Revisões: 2026-10-15 — **notarização no Mac abandonada.** O mantenedor:
  *"NÃO VOU ME INSCREVER NESSA MERDA DE APPLE DEVELOPER PROGRAM, NÃO VOU
  PAGAR NADA"*. Nenhuma inscrição e nenhum pagamento à Apple, nunca. Os
  itens 1, 2, 7 (os segredos da Apple), 8 (os passos do macOS) e 10 ficam
  **substituídos** (marcados abaixo); o app do Mac continua assinado ad
  hoc, como construído; os itens 3, 4, 5, 6 (Windows), 9 valem. Veja o
  Status.

## Contexto

**O que existe.** O app de macOS é construído só para arm64, no
`macos-latest`, e assinado **ad hoc** (`"signingIdentity": "-"` em
`app/src-tauri/tauri.conf.json`); o workflow de release copia a linha de
comando para dentro do bundle depois que o Tauri o constrói e assina o
bundle de novo, ad hoc, com `codesign --force --deep --sign -`
(`.github/workflows/release.yml`). O macOS pede uma vez, na primeira
abertura, para permiti-lo. O instalador NSIS do Windows é **sem
assinatura** ([0069](0069-windows-port.md) item 3); a linha de comando
viaja nele como `externalBin` do Tauri. O AppImage, o `.deb` e o `.rpm`
do Linux não levam assinatura própria. Todo arquivo de release está numa
lista de checksums assinada com a chave de release do Verso, que o
atualizador do app verifica ([0055](0055-in-app-updater.md)); essa chave
prova que o release veio do workflow do Verso, e nenhum sistema
operacional a lê. O atualizador escolhe o arquivo desta plataforma pelo
nome, por uma palavra de arquitetura — `arm64`/`aarch64` ou
`x64`/`x86_64`/`amd64` (`pick_asset`, `app/src-tauri/src/update.rs`). O
repositório é privado (V.12); o mantenedor mora no Brasil; o projeto não
tem empresa e vive de doações ([0001](0001-open-tool-no-company.md)).

**macOS.**

- O Apple Developer Program custa *"99 USD per membership year. Prices
  may vary by region and are listed in local currency during the
  enrollment process"* ([enroll](https://developer.apple.com/programs/enroll/));
  o preço em reais só aparece no pagamento. Uma pessoa física precisa de
  uma Apple Account com autenticação de dois fatores; uma organização
  *"must have a D-U-N-S Number"*. A isenção da taxa é para organizações
  sem fins lucrativos, escolas e governos, e exige *"Not be an
  individual"* ([fee waivers](https://developer.apple.com/help/account/membership/fee-waivers/)).
  A notarização é um recurso da assinatura; nenhuma página cita uma taxa
  própria.
- A notarização pede um certificado de aplicativo *"Developer ID"*, *"the
  Hardened Runtime capability for your app and command line targets"*,
  *"a secure timestamp"*, e nenhum entitlement `get-task-allow`; *"all
  software built after June 1, 2019, and distributed with Developer ID
  must be notarized"* ([Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
  Só o Account Holder pode criar o certificado Developer ID
  ([Developer ID](https://developer.apple.com/developer-id/)). O `altool`
  deixou de ser aceito em 1º de novembro de 2023
  ([news](https://developer.apple.com/news/?id=y5mjxqmn)); o `notarytool`
  aceita *"an app-specific password or an App Store Connect API key"*
  ([TN3147](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)),
  e o `stapler` anexa o ticket ao app.
- Desde o macOS 15, *"users will no longer be able to Control-click to
  override Gatekeeper"*; elas vão a Ajustes do Sistema › Privacidade e
  Segurança ([news, 2024-08-06](https://developer.apple.com/news/?id=saqachfa)).
  Não se achou declaração da Apple de outra mudança no macOS 26.
- O Tauri 2 assina com `APPLE_CERTIFICATE` (o `.p12`, em base64),
  `APPLE_CERTIFICATE_PASSWORD` e `APPLE_SIGNING_IDENTITY`, e notariza e
  grampeia durante o `tauri build` quando `APPLE_API_KEY`,
  `APPLE_API_ISSUER` (com o `.p8` da chave) ou `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID` estão definidos
  ([Tauri: macOS signing](https://v2.tauri.app/distribute/sign/macos/),
  `crates/tauri-cli/ENVIRONMENT_VARIABLES.md`); o hardened runtime vem
  ligado por padrão (`bundle.macOS.hardenedRuntime`). Nem o Tauri nem a
  Apple dizem se um app com WKWebView precisa de um entitlement de JIT: o
  conteúdo web roda no processo do próprio WebKit, então provavelmente
  não — a ver notarizando e rodando sem nenhum.
- A imagem Intel de macOS do GitHub, `macos-13`, foi aposentada até 4 de
  dezembro de 2025; `macos-15-intel` é a última, até o outono de 2027
  ([changelog](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/)).
  O exemplo de CI do próprio Tauri constrói `x86_64-apple-darwin` no
  `macos-latest` arm64 ([GitHub pipeline](https://v2.tauri.app/distribute/pipelines/github/)),
  um alvo que o Rust mantém no Tier 2 com ferramentas de host desde a
  1.90 ([Rust blog](https://blog.rust-lang.org/2025/08/19/demoting-x86-64-apple-darwin-to-tier-2-with-host-tools/)).

**Windows.**

- Desde 1º de junho de 2023 a chave privada de um certificado de
  assinatura de código tem de viver num módulo de hardware — um token, um
  HSM na nuvem ou um serviço de assinatura — certificado FIPS 140-2 Nível
  2 ou Common Criteria EAL 4+; desde 1º de março de 2026 um certificado
  dura no máximo 460 dias
  ([CA/B Forum Code Signing BR](https://cabforum.org/working-groups/code-signing/requirements/)
  §6.2.7.4.1, §6.3.2). Uma chave num arquivo entre os segredos da CI não é
  mais possível.
- *"EV certificates no longer bypass SmartScreen"*; *"Unsigned files must
  build reputation anew with every update"*, enquanto um arquivo
  assinado constrói a reputação do certificado, que as versões seguintes
  herdam; um arquivo sem assinatura mostra *"Windows protected your PC"*
  até "Run anyway"
  ([SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
  O **Smart App Control**, onde está ligado, *"will block execution of
  unsigned files unless the file has a positive reputation"*, e *"There
  is currently no way to bypass Smart App Control protection for
  individual apps"* ([What is Smart App Control](https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003)).
- **Azure Artifact Signing** (antes Trusted Signing): US$ 9,99 por mês
  para 5.000 assinaturas, US$ 0,005 cada uma além disso (os preços de
  varejo do Azure). Mas *"Public Trust certificates are available to
  organizations in the United States, Canada, the European Union, the
  United Kingdom, Australia, New Zealand, Japan, South Korea, Singapore,
  Switzerland, Norway, and Israel. Individual developers must be located
  in the United States or Canada"* ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)):
  **fora de alcance para o mantenedor no Brasil**, como pessoa ou como
  organização.
- Certificados, preços de tabela: o certificado de validação individual
  ou OV da SSL.com a partir de US$ 129 por ano, a assinatura na nuvem
  dela (eSigner) a partir de US$ 20 por mês para 20 assinaturas, ou uma
  YubiKey a US$ 379 ([SSL.com](https://www.ssl.com/certificates/code-signing/buy/),
  [eSigner pricing](https://www.ssl.com/guide/esigner-pricing-for-code-signing/));
  o da DigiCert a partir de US$ 696 por ano; o da Sectigo a partir de
  US$ 536,25 por ano. O **Open Source Code Signing da Certum**, na nuvem
  dela (SimplySign), a partir de € 49, para um projeto de código aberto
  público, com o sujeito "Open Source Developer *nome*"
  ([Certum](https://shop.certum.eu/open-source-code-signing-on-simplysign.html));
  não se confirmou se os códigos de uso único dele podem ser acionados da
  CI.
- A **SignPath Foundation** assina projetos de código aberto sem custo:
  uma licença OSI (a MPL-2.0 é uma), nenhum componente proprietário, um
  projeto já lançado, autenticação de múltiplos fatores para todo membro,
  uma política de assinatura de código na página do projeto, builds em
  runners hospedados pelo GitHub; e *"The code signing certificate is
  issued to SignPath Foundation"* — o publicador que o Windows mostra é a
  SignPath Foundation, não o Verso ([terms](https://signpath.org/terms),
  [GitHub](https://docs.signpath.io/trusted-build-systems/github)). A
  assinatura dela é um pedido enviado pelo workflow e respondido depois;
  o Tauri assina o executável do app antes de o NSIS empacotá-lo, por
  `bundle.windows.signCommand` ([Tauri: Windows signing](https://v2.tauri.app/distribute/sign/windows/)),
  então os dois têm de ser encaixados.

**Linux.** Nenhuma verificação do sistema operacional fica entre uma
pessoa e um AppImage, `.deb` ou `.rpm` baixado. O Tauri pode assinar um
AppImage (`SIGN=1`; *"AppImage does not validate the signature"*) e um
`.rpm` (`TAURI_SIGNING_RPM_KEY`) ([Tauri: Linux signing](https://v2.tauri.app/distribute/sign/linux/),
[RPM](https://v2.tauri.app/distribute/rpm/)); um repositório APT próprio
*"MUST be signed with an OpenPGP certificate"*
([Debian](https://wiki.debian.org/DebianRepository/UseThirdParty)). O
Verso não publica repositório de pacotes.

**O custo da CI.** macOS sai a US$ 0,062 o minuto, Linux a US$ 0,006,
Windows a US$ 0,010, e *"GitHub Actions usage is free … for public
repositories that use standard GitHub-hosted runners"*
([pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing),
[billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).

## Decisão

Proposta (2026-10-14). Aceita em 2026-10-14 (Status): cada `[DECIDIDO 2026-10-14]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`. Este ADR revisa o
[0051](0051-development-flow-and-releases.md) (a Consequência dele sobre
a assinatura ad hoc) e o [0069](0069-windows-port.md) (item 3) quando
aceito.

1. **macOS: Developer ID e notarização.** *(Abandonado em 2026-10-15: veja
   as Revisões e o Status; o app do Mac continua assinado ad hoc, e a
   pessoa o instala com "Abrir Mesmo Assim".)* O app é assinado com um
   certificado Developer ID Application, o hardened runtime ligado, com
   um carimbo de tempo seguro, notarizado com o `notarytool` e grampeado
   — pelo próprio `tauri build`, dados o certificado e as credenciais do
   notário. A linha de comando dentro do bundle vira `externalBin` do
   Tauri, como no Windows, para ser assinada com o bundle e antes dele, em
   vez de copiada para dentro depois e o bundle assinado de novo ad hoc. O
   arquivo próprio da linha de comando leva um binário assinado do mesmo
   jeito e enviado ao notário (um binário solto não aceita ticket
   grampeado; o Gatekeeper o acha online). Nenhum entitlement, a não ser
   que o primeiro build notarizado mostre que um é preciso, e então o mais
   estreito. O zip continua ([0051](0051-development-flow-and-releases.md),
   Descartadas: um `.dmg`).
2. **Quem se inscreve e paga.** *(Abandonado em 2026-10-15 para a Apple:
   nenhuma inscrição, nenhum pagamento, nunca.)* `[DECIDIDO 2026-10-14]`. Decidido: **o mantenedor,
   como pessoa física**, 99 USD por ano (em reais no pagamento): uma
   organização precisa de um número D-U-N-S e de uma pessoa jurídica que
   o projeto não tem ([0001](0001-open-tool-no-company.md)), e nenhuma
   isenção vale para uma pessoa. O certificado nomeia o mantenedor como
   desenvolvedor.
3. **Windows: qual assinatura.** `[DECIDIDO 2026-10-14]`. As opções abertas a uma pessoa
   no Brasil: (a) **sem assinatura**, como agora — "Run anyway" sob o
   SmartScreen, e **bloqueado sem saída** onde o Smart App Control está
   ligado; (b) **SignPath Foundation**, sem custo, publicador "SignPath
   Foundation", quando o repositório for público, o pedido dela encaixado
   na assinatura do executável interno pelo Tauri; (c) **o certificado de
   código aberto da Certum** na nuvem dela, cerca de € 49, publicador
   "Open Source Developer *mantenedor*", se os códigos dele puderem ser
   acionados da CI; (d) **um certificado comercial com assinatura na
   nuvem**, cerca de US$ 129 por ano mais cerca de US$ 240 por ano do
   menor plano do eSigner (SSL.com, preços de tabela), publicador o
   mantenedor. O Azure Artifact Signing não está aberto ao mantenedor
   (Contexto). Decidido: **(b)**, pedido assim que o repositório for
   público; **(c)** se a SignPath recusar ou não conseguir assinar dentro
   do build do Tauri; **(d)** só se nenhuma das duas funcionar. Não (a) na
   V1: o Smart App Control transforma um aviso numa recusa.
4. **O que é assinado no Windows**: o executável do app, o `verso.exe` da
   linha de comando e o instalador NSIS — todo executável que uma pessoa
   ou o atualizador roda —, cada um com digest SHA-256 e carimbo de tempo,
   e conferido com `signtool verify /pa` no workflow antes de qualquer
   publicação. O SmartScreen ainda pode avisar nos primeiros releases
   assinados, até o certificado juntar reputação; a página do release diz
   isso.
5. **Linux: nenhuma assinatura de sistema operacional.** A lista de
   checksums assinada ([0055](0055-in-app-updater.md)) continua sendo o
   que prova um arquivo de Linux. `[DECIDIDO 2026-10-14]`: se o `.rpm` (e o AppImage)
   também são assinados com uma chave OpenPGP. Decidido: **fora da
   V1** — nada confere a assinatura de um AppImage, e a de um `.rpm` só
   ajuda quem importou a chave; um repositório APT ou RPM, se um dia for
   publicado, assina o índice dele então.
6. **Quando.** *(A metade da Apple abandonada em 2026-10-15; a assinatura
   do Windows vale, com o repositório público.)* `[DECIDIDO 2026-10-14]`. Decidido: **inscrever-se no programa da
   Apple agora** — a verificação de identidade leva dias — e assinar e
   notarizar **todo release a partir do primeiro depois que o certificado
   existir, os betas também**, para que o caminho esteja provado muito
   antes da V1; a assinatura do Windows **quando o repositório for
   público** (V.12), como (b) e (c) exigem; as duas antes do anúncio e do
   release da V1. Um ensaio do workflow de release assina e notariza como
   um release faz.
7. **Os segredos na CI.** *(Abandonado em 2026-10-15 para os segredos da
   Apple — o certificado e a chave do App Store Connect; o environment
   `release` e as credenciais do Windows valem.)* `[DECIDIDO 2026-10-14]`. Decidido: um environment do GitHub
   `release`, com os segredos usáveis só por jobs rodando na `main` — o
   certificado Developer ID (`.p12`, em base64) e a senha dele, e **uma
   chave de API do App Store Connect** (issuer, key id, `.p8`) para o
   notário, não a senha de app de uma Apple ID, que é a conta pessoal do
   mantenedor; as credenciais de assinatura do Windows conforme a opção
   escolhida pedir. Só os jobs de build do workflow de release os leem;
   pull requests nunca. O mantenedor guarda uma cópia offline do `.p12`
   do certificado, como da chave de release ([0055](0055-in-app-updater.md)).
   Um certificado expira ou é revogado: o próximo release assina com o
   novo; apps instalados não são afetados, porque o atualizador confia na
   chave de release, não no certificado.
8. **O workflow de release** muda *(2026-10-15: a parte do macOS é
   abandonada — o passo de assinar ad hoc fica, e a página de release
   mantém "Abrir Mesmo Assim"; a parte do Windows vale)*: o job de macOS constrói com os
   segredos e confere o resultado com `codesign --verify --strict`,
   `xcrun stapler validate` e `spctl --assess --type execute`; o passo de
   reassinatura ad hoc sai; o job de Windows assina por `signCommand` e
   confere (item 4); a página do release
   ([0051](0051-development-flow-and-releases.md), revisado em
   2026-10-14) perde o "Abrir Mesmo Assim" do macOS e diz o que o Windows
   mostra; o README também.
9. **O app de Mac Intel** (V.21). *(2026-10-15: não afetado, exceto que é
   assinado ad hoc como o arm64, não notarizado.)* `[DECIDIDO 2026-10-14]`: um binário universal ou um
   build x64 separado. Um app universal leva os dois e dobra todo download
   de Mac; o atualizador do Verso escolhe um arquivo pela palavra de
   arquitetura, e um nome `universal` não casa com nenhuma (Contexto),
   então ele também mudaria. Decidido: **um build `macos-x64`
   separado**, compilado de forma cruzada para `x86_64-apple-darwin` no
   mesmo job de macOS no runner arm64, como faz o exemplo do Tauri — sem
   runner Intel, que o GitHub aposenta em 2027 —, assinado e notarizado
   como o arm64, nomeado para o atualizador achá-lo como está; a página
   do release ganha a linha dele ("um Mac com processador Intel"). Sem um
   Mac Intel à mão, ele é testado rodando sob o Rosetta no Mac do
   mantenedor, e os resultados ditos como tais.
10. **O que uma pessoa vê uma vez.** *(Abandonado em 2026-10-15: não há
    release com Developer ID.)* O primeiro release com Developer ID
    substitui um app ad hoc: o macOS pode pedir de novo permissões que deu
    ao ad hoc (acesso a uma pasta em Documentos, por exemplo). Visto
    nesse release e dito nas notas dele, não presumido aqui.

## Consequências

- O [0051](0051-development-flow-and-releases.md) ganha uma linha de
  Revisões (a Consequência dele sobre a assinatura ad hoc respondida), e
  o [0069](0069-windows-port.md) uma sobre o item 3, quando este ADR for
  aceito; o comentário de cabeçalho do `release.yml` e o README
  acompanham.
- Custos, pelas recomendações: 99 USD por ano à Apple; nada para o
  Windows por (b), cerca de € 49 por (c), cerca de US$ 370 por ano por
  (d); CI sem custo quando o repositório for público, e até lá o job de
  macOS de um release cresce com a espera do notário e, com o item 9, um
  segundo build.
- O `docs/reference/manual-checks.md` ganha as verificações que nenhuma
  máquina faz: um release baixado abrindo num Mac sem aviso, o instalador
  numa máquina com Windows 11 e o Smart App Control ligado, o app x64 sob
  o Rosetta.
- A página do projeto leva a política de assinatura de código que a
  SignPath pede, se (b) for escolhida.

## Alternativas descartadas

Nenhuma registrada.

## Status

**Revisada em 2026-10-15: notarização no Mac abandonada.** O mantenedor
não vai se inscrever no Apple Developer Program e não pagará nada à Apple
(Revisões). O app do Mac continua assinado ad hoc, como construído;
instalá-lo é *Abrir Mesmo Assim* (Ajustes do Sistema › Privacidade e
Segurança, role para baixo, *Abrir Mesmo Assim* ao lado do app, confirme;
no macOS 14 ou anterior, clique com o botão direito no app › *Abrir*), o
que a página de release (`scripts/release-page.mjs`) e o README já
dizem. A assinatura do Windows pela **SignPath Foundation** (grátis, com o
repositório público, item 3 (b)) continua, e também o build separado do
Mac Intel (item 9), assinado ad hoc. A V.11 do roadmap passa a ser só
"Assinatura de código no Windows".

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondeu às
perguntas do 0093, do 0094 e do 0095 com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. A R3
do `docs/roadmap.md`, revisão 8, decidiu que este ADR existe; esta
resposta decidiu o conteúdo dele. Linhas de Revisões no
[0051](0051-development-flow-and-releases.md) (a Consequência dele sobre
a assinatura ad hoc) e no [0069](0069-windows-port.md) (item 3). O build
para Mac Intel (item 9) vem quando o repositório for público (V.12), como
a onda da V.21 foi decidida em 2026-10-14 (`docs/roadmap.md`, "Lacunas
de núcleo na V1").

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Para o
mantenedor, cada uma com uma recomendação: quem se inscreve e paga (item
2), a opção do Windows (item 3), assinaturas de pacote no Linux (item 5),
quando (item 6), os segredos (item 7), um build de Mac universal ou x64
separado (item 9).
