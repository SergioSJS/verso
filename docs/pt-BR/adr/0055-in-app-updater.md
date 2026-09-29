# ADR 0055 — O atualizador dentro do app

- Data: 2026-09-29
- Fonte: o mantenedor, na sessão, em 2026-09-29, sobre a leitura da branch
  `fix/backlog-2-issues` ("Arrumar!" — consertar, em vez de tirar; e
  "Registrar"); [0050](0050-outbound-network-access.md), Consequências ("um
  atualizador precisaria de uma decisão própria");
  [0051](0051-development-flow-and-releases.md) (releases);
  [0022](0022-target-platforms-macos-first.md) (macOS primeiro)
- Status no briefing: não consta
- Revisões: 2026-09-29 — o padrão da verificação, ligado, ratificado pelo
  mantenedor na sessão ("Ratifique o que precisar", respondendo à lista do
  que estava pendente); o ADR fica Aceito como está escrito.

## Contexto

A [0050](0050-outbound-network-access.md) dizia que uma checagem de
atualização, um pedido a um servidor do Verso, não é permitida, e que um
atualizador precisaria de uma decisão própria. O atualizador chegou antes
dessa decisão: o commit `2db4c73` o entregou na 0.3.0-beta.1. Ao abrir, a
menos que um ajuste o desligue, o app pede à API do GitHub os releases do
repositório do projeto e, quando existe versão mais nova, oferece baixá-la e
instalá-la.

O que a 0.3.0-beta.1 entregou recebia o endereço do download da web view: o
comando recebia uma URL e confiava em qualquer endereço `https` em
`github.com` ou `api.github.com`, de qualquer repositório. Nada conferia os
bytes baixados antes de instalá-los, e o comando rodava na thread principal.
Uma web view levada a chamá-lo — por uma nota, uma página embutida, um bug —
podia fazer o app baixar e instalar o que estivesse num endereço escolhido por
ela.

A decisão do mantenedor foi manter o atualizador e torná-lo seguro, e
registrar isso aqui.

## Decisão

**Decidido em 2026-09-29 pelo mantenedor**, na sessão: o app mantém um
atualizador, e ele é consertado em vez de removido. Este ADR é a decisão que
a [0050](0050-outbound-network-access.md) pedia, e revisa a Consequência
daquele ADR sobre checagem de atualização.

1. **A checagem.** Ao abrir, o app pede a
   `https://api.github.com/repos/SergioSJS/verso/releases` a lista de
   releases. Rascunhos são pulados; a versão mais nova acima da que está
   rodando é oferecida, versão de teste (`-beta.N`) incluída. O ajuste
   existente "Verificar atualizações automaticamente" desliga a checagem ao
   abrir; "Verificar atualizações" continua rodando-a a pedido.
2. **A instalação só acontece com o clique do usuário**, nunca sozinha.

Como o autor construiu a instalação sob essa decisão
(`app/src-tauri/src/update.rs`; os testes estão em
`app/src-tauri/src/lib.rs`):

- **O endereço nunca vem da web view.** O comando de instalar não recebe
  argumento. O host pede os releases à API de novo, escolhe ele mesmo o
  asset desta plataforma (`pick_asset`) e só aceita endereço de
  `UPDATE_REPO`, `SergioSJS/verso`: um download de release
  (`https://github.com/SergioSJS/verso/releases/download/…`) ou um asset da
  API (`https://api.github.com/repos/SergioSJS/verso/releases/assets/…`),
  conferido por `is_trusted_update_url` e pelo teste
  `trusted_update_urls_allow_this_repo_only`. Uma web view pode pedir *que*
  uma atualização rode; não pode escolher *o que* é instalado nem de onde.
- **O checksum é exigido e conferido.** O GitHub calcula um digest `sha256`
  de cada asset no upload e o informa na API. A instalação recusa um asset
  sem digest — o erro diz ao usuário para baixar a atualização pela página de
  releases — e compara o digest com o que ela calcula sobre os bytes baixados
  antes de extrair qualquer coisa. Se não confere, nada é instalado.
- **Limites de tamanho.** O download e a extração têm cada um um teto de
  1 GiB (`UPDATE_MAX_BYTES`); um asset que a API já informa maior é recusado
  antes do download. Cada entrada do arquivo compactado só é extraída com o
  nome que `enclosed_name` lhe dá, que recusa uma entrada que cairia fora do
  diretório de extração (zip-slip).
- **O app em uso nunca fica quebrado no macOS.** A instalação move o bundle
  em uso para um backup irmão (`<nome>.app.update-backup`, no mesmo volume),
  copia o bundle novo para o lugar e só remove o backup quando a cópia deu
  certo. Se a cópia falha, remove o bundle parcial e devolve o backup; se essa
  volta falha também, o erro diz o caminho onde está o backup intacto.
- **Timeouts, e fora da thread principal.** A checagem tem timeout de 12
  segundos; o download, timeout de conexão de 15 segundos e limite de 600
  segundos para a transferência inteira. Os dois comandos são assíncronos e
  fazem o trabalho de rede em `spawn_blocking`, então uma rede lenta nunca
  congela a janela.
- **Um token do GitHub, quando existe.** O repositório é privado
  ([0007](0007-private-repo-until-license.md)), e a API só responde os
  releases de um repositório privado a um pedido que leva um token. O app usa
  `GITHUB_TOKEN` ou `GH_TOKEN` do ambiente, ou então pergunta à CLI do GitHub
  (`gh auth token`), e manda esse token a `api.github.com` com a checagem e
  com o download do asset. Dito abertamente porque é a credencial do próprio
  usuário: o app lê o token que a CLI do GitHub guarda e o manda ao GitHub, e
  a mais ninguém. Sem token, a checagem de um repositório privado falha e diz
  isso; nada mais muda.

## Consequências

- O Verso agora faz um pedido que nenhuma nota e nenhum clique nomeia: a
  lista de releases, ao abrir, enquanto o ajuste está ligado. O ponto 1 da
  [0050](0050-outbound-network-access.md) — a rede só para endereços das
  notas do usuário, ou clicados — tem esta única exceção, para um endereço, e
  o ajuste a desliga.
- **O checksum dá integridade, não autoria.** Prova que os bytes instalados
  são os que o release guarda, como a API os nomeia. Não prova quem os pôs
  lá: quem pode publicar um release no repositório pode publicar uma
  atualização. Uma assinatura conferida contra uma chave que o app carrega
  provaria isso; ver Alternativas descartadas.
- Um release cujo asset não tem digest não pode ser instalado pelo app; o
  usuário é mandado para a página de releases. O workflow de release
  ([0051](0051-development-flow-and-releases.md)) sobe os assets para o
  GitHub, que é de onde o digest vem; se todo asset que ele sobe traz um é
  visto no primeiro release gerado depois desta mudança, não é suposto aqui.
- **O padrão do ajuste é ligado**, como era na 0.3.0-beta.1. Esse padrão
  veio com o código, não de uma decisão; o mantenedor pode escolher
  desligado. *(Ratificado em 2026-09-29 pelo mantenedor, na sessão: a
  verificação continua ligada por padrão, e o ajuste a desliga.)*
- Hoje os releases são gerados só para macOS
  ([0022](0022-target-platforms-macos-first.md),
  [0051](0051-development-flow-and-releases.md)). O código escolhe asset
  também para Windows e Linux, e tem caminhos de instalação para eles; nenhum
  deles é exercitado até essas builds existirem.
- O trabalho de sistema de arquivos do atualizador — o download temporário,
  a extração, o bundle, a pasta Downloads — vive só em `src/update.rs` e
  nunca toca um arquivo da pasta aberta
  ([0026](0026-core-ui-contract-inviolable-rules.md), regra 5); uma
  verificação em `scripts/check.sh` mantém `std::fs` ali
  ([0029](0029-guardrails-in-ci.md), revisão de 2026-09-29).
- O token da CLI do GitHub vira dependência da checagem enquanto o
  repositório for privado. Some quando o repositório for público, e com ele a
  chamada ao `gh`.

## Alternativas descartadas

- **Remover o atualizador**, até existir uma decisão — deixado de lado pelo
  mantenedor em 2026-09-29 ("Arrumar!").
- **O plugin de atualização assinada do Tauri** — levantado pelo autor em
  2026-09-29 e não escolhido por ora. Ele confere uma assinatura feita com
  uma chave do projeto, o que prova autoria e não só integridade, mas exige
  gestão de chave própria (uma chave privada guardada fora do repositório,
  uma chave pública no app) e mudanças no pipeline de release. O digest por
  asset do GitHub dá integridade presa ao release que a API nomeia, sem chave
  para guardar. A rever quando o repositório ficar público.

## Status

Aceito em 2026-09-29 pelo mantenedor, na sessão: os pontos 1 e 2 da Decisão
— manter o atualizador e consertá-lo. O endurecimento sob eles é do autor,
construído sob essa decisão e identificado como tal acima. Revisto em
2026-09-29: o padrão ligado da verificação ratificado pelo mantenedor; o ADR
fica Aceito.
