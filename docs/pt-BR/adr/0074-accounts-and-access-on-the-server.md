# ADR 0074 — Contas e acesso no servidor: o primeiro admin, o login, os tokens

- Data: 2026-10-09
- Fonte: o mantenedor, em sessão em 2026-10-09, abrindo a versão web:
  *"como que vai ser feito esse [início] de usuário. Se a gente vai
  ter um admin que ele é cadastrado ao subir a imagem. Sendo definido pelas
  variáveis de ambiente daquela imagem. como que a gente vai fazer esse
  controle de acesso por e-mail, por token, autenticação porque isso vai ser
  importante da gente ter a partir do momento que a gente roda isso no
  navegador"*. Escrito pela Opus 5.5; a ser lido pela Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) antes de ser aceito.
- Relacionados: [0073](0073-self-hosted-server-first.md) (o servidor; o item
  5 dele propõe contas, sessões e papéis, e deixa a recuperação de conta sem
  servidor de e-mail e o número de donos por servidor `[ABERTO]` — este ADR
  detalha o item 5 e propõe respostas a essas duas),
  [0045](0045-server-and-mcp-security.md) (identidade de sessão e
  autorização no contrato, `[ABERTO]` até um servidor entrar no escopo),
  [0026](0026-core-ui-contract-inviolable-rules.md) (regra 2: a janela não
  sabe de que lado do fio o core está),
  [0027](0027-runtime-capabilities.md) (o que uma janela sabe do lado com
  que fala), [0011](0011-config-outside-tree-index-as-cache.md) (a
  configuração mora fora da pasta), [0012](0012-files-are-source-of-truth.md),
  [0035](0035-cross-cutting-requirements.md) (as duas línguas,
  acessibilidade), [0070](0070-what-travels-with-the-folder.md) (a camada
  de configurações da pessoa).
- Status no briefing: ausente; o §9 marca o servidor `PROPOSTO`. Na
  aceitação, junto com o [0073](0073-self-hosted-server-first.md).

## Contexto

O [0073](0073-self-hosted-server-first.md) põe um servidor primeiro: o core
sem janela, alcançado por um navegador, um celular e o app desktop, com
várias pessoas numa pasta. A partir do momento em que a janela roda num
navegador, toda requisição vem de uma rede que o servidor não controla, e
três coisas têm de existir antes de alguém além do mantenedor entrar: **como
a primeira conta aparece** num servidor que não tem nenhuma, **como uma
pessoa prova quem é** num navegador, e **como um programa que não é um
navegador** (o app desktop conectando, a linha de comando, um agente) entra.

O item 5 do 0073 já propõe a forma: contas com senha com hash Argon2id,
chaves de acesso (passkeys) quando o navegador oferece, OpenID Connect
depois; sessões por token com expiração e revogação; por pasta os papéis
dono, editor e leitor, dados por link de convite ou pelo dono. Deixa
abertos a recuperação de conta sem servidor de e-mail e se um servidor tem
um dono ou vários. O mantenedor acrescenta a primeira conta definida pelo
ambiente da imagem, e o acesso por e-mail e por token.

Como outros serviços auto-hospedados fazem a primeira conta, observado pela
documentação pública deles:

- **Criada a partir do ambiente na primeira subida**: Grafana
  (`GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`, lidas só quando
  o banco ainda não tem admin), o `gitea admin user create` do Gitea rodado
  por quem opera, Keycloak (`KC_BOOTSTRAP_ADMIN_USERNAME`,
  `KC_BOOTSTRAP_ADMIN_PASSWORD`, um admin temporário).
- **Uma página de configuração para quem chegar primeiro**: Nextcloud,
  Jellyfin. Simples, e um servidor exposto antes de o dono abri-lo pertence
  a um estranho.
- **Um segredo impresso no log** que a página de configuração pede: a senha
  inicial de admin do Jenkins.
- **Um segredo no ambiente que é o admin**, sem conta: o `ADMIN_TOKEN` do
  Vaultwarden para a página de admin dele.

## Decisão

Proposta; o mantenedor decidiu as seis questões em 2026-10-09 (Status), e
cada item diz o que foi decidido e o que foi pesado.

1. **O primeiro admin vem do ambiente, só na primeira subida.** O
   `verso serve` lê `VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD` — ou
   `VERSO_ADMIN_PASSWORD_FILE`, para os secrets do Docker e do Kubernetes,
   que mantêm a senha fora do `docker inspect` — e cria essa conta com o
   papel de admin **quando o servidor ainda não tem conta nenhuma**. Uma vez
   que exista uma, as variáveis são ignoradas, e o log diz isso numa linha,
   sem o valor: mudar a variável nunca redefine uma senha em silêncio, e as
   trocas de senha posteriores do admin não são desfeitas por um
   reinício. Uma senha com menos de 12 caracteres, ou as duas variáveis
   definidas pela metade, interrompe a subida com um erro que nomeia a
   variável.
   - **Sem as variáveis**, o servidor não abre uma página de configuração a
     quem chegar primeiro: imprime uma vez no log um link de configuração
     com um token de uso único, válido por uma hora, e essa página cria o
     admin. Quem consegue ler o log do contêiner é quem roda o servidor.
   - Decidido pelo mantenedor em 2026-10-09: as variáveis são lidas só na
     primeira subida, com um caminho de volta para um admin que esquece a
     senha ou perde a conta (item 5).
2. **O e-mail é o nome da conta, verificado ou não.** Uma conta é um
   endereço de e-mail (sem espaços nas pontas, NFC, em minúsculas para
   comparar, mostrado como digitado), um nome de exibição e uma língua
   (pt-BR ou inglês, [0035](0035-cross-cutting-requirements.md)). Sem
   servidor de e-mail o endereço é um identificador por que o admin
   responde, não uma caixa verificada, e a interface diz isso. Com um
   servidor de e-mail configurado (`VERSO_SMTP_URL`, opcional) o endereço é
   verificado por um link, e links de login por e-mail e redefinições de
   senha passam a existir (item 3).
3. **Entrar.** Na primeira versão: **senha** (Argon2id, os parâmetros da
   OWASP do momento, registrados no código), e **chaves de acesso**
   (WebAuthn) acrescentadas pelos Ajustes depois de entrar — que pedem HTTPS
   e um endereço estável, `VERSO_PUBLIC_URL`, como o item 6 do 0073 já
   exige. Com servidor de e-mail: um **link de login por e-mail**, de uso
   único, quinze minutos. **OpenID Connect** (Authelia, Authentik, Keycloak,
   Google) depois, para os servidores que já têm um provedor de identidade.
   Um app de código de uso único (TOTP) como segundo fator: depois das
   chaves de acesso, se pedirem — uma chave de acesso já é dois fatores.
   - Alternativas: só links por e-mail (o padrão do Notion; impossível sem
     servidor de e-mail, que a maioria dos servidores de casa não tem); só
     OIDC (empurra um segundo serviço a todo host).
4. **Ninguém se cadastra sozinho.** Sem cadastro aberto, nem como opção na
   primeira versão. O admin cria uma conta ou um **convite**: um link de uso
   único com um token, válido por sete dias, que o admin copia para mandar
   como quiser (e que o servidor manda por e-mail quando tem servidor de
   e-mail). O convite já pode levar uma pasta e um papel (item 6), para
   "convidar um jogador para a campanha" ser um passo só. A página de admin
   lista cada convite com o estado dele — pendente, usado (por quem,
   quando) ou expirado — e encerra um antes de ser usado; e lista cada
   conta com o espaço que as pastas dela ocupam e quantas pastas ela tem
   ([0075](0075-server-packaging-and-storage.md) item 4).
   - Alternativas: uma lista de endereços ou de um domínio que podem se
     cadastrar (útil para uma empresa; acrescenta uma página de cadastro a
     defender); cadastro aberto (rejeitado para um servidor que guarda notas
     privadas).
5. **Recuperação de conta sem servidor de e-mail** (o `[ABERTO]` do 0073):
   o admin redefine a senha de um membro pela página de admin — o membro
   recebe um link de redefinição de uso único, como um convite; e a conta do
   próprio admin é recuperada por quem roda o servidor, com
   `verso serve admin reset <e-mail>` rodado na máquina ou dentro do
   contêiner (`docker exec`, o terminal que o CasaOS e o ZimaOS oferecem),
   que imprime um link de redefinição, encerra as sessões da conta e
   registra a redefinição no log de auditoria. O acesso à máquina é o
   último fator, como já é para os arquivos. É o que fazem os serviços
   auto-hospedados que o mantenedor apontou como a referência ("siga o que
   a comunidade preferir"): Grafana
   (`grafana cli admin reset-admin-password`), Gitea
   (`gitea admin user change-password`), Immich
   (`immich-admin reset-admin-password`), Nextcloud
   (`occ user:resetpassword`), Authentik (`ak create_recovery_key`),
   Keycloak (`kc.sh bootstrap-admin`).
6. **Dois níveis de papel.** No servidor: **admin** (contas, convites, as
   configurações do servidor) ou **membro**. Por pasta, como o item 5 do
   0073: **dono**, **editor**, **leitor**. Decidido: o papel de admin
   **não** dá acesso a toda pasta — um admin que quer entrar numa pasta dá o
   acesso a si mesmo, e a concessão fica no log de auditoria (item 9) para o
   dono da pasta ver. Quem roda o servidor lê o disco de qualquer jeito, e o
   0073 diz isso com essas palavras; o ponto é a interface não mostrar as
   notas de um membro a outro por padrão. Várias contas por servidor (uma
   família, uma mesa de jogadores, um time) respondem o `[ABERTO]` do 0073
   sobre donos por servidor: o modelo do Foundry que o mantenedor nomeou é
   um mestre e jogadores num servidor. Criar pastas é uma permissão que o
   admin concede, desligada para um membro novo, para que um jogador
   convidado só veja as pastas compartilhadas com ele.
7. **Sessões no navegador: um token opaco num cookie, guardado no
   servidor.** No login o servidor gera um token aleatório de 256 bits,
   guarda o SHA-256 dele com a conta, o nome do dispositivo e as datas, e
   manda o token num cookie `__Host-verso-session` — `Secure`, `HttpOnly`,
   `SameSite=Lax`, caminho `/`. Uma sessão dura 14 dias sem uso e 90 dias no
   máximo; os Ajustes listam as sessões e encerram qualquer uma, ou todas
   ("sair de todo lugar"); uma troca de senha encerra as outras. Uma
   requisição que muda algo confere `Origin` contra `VERSO_PUBLIC_URL` e
   leva um token CSRF; o WebSocket do contrato confere `Origin` antes de
   aceitar o cookie (item 6 do 0073).
   - Alternativa: um token assinado que o servidor não guarda (JWT) —
     rejeitado: revogar um antes de expirar pede uma lista guardada no
     servidor de qualquer jeito, que é a tabela de sessões com passos a
     mais.
8. **Tokens para programas: tokens de acesso pessoal.** Um membro cria um
   token nos Ajustes com um nome, uma expiração (30 dias por padrão, um ano
   no máximo, ou nenhuma, dito em vermelho), as pastas que ele alcança e
   **leitura** ou **leitura e escrita** — nunca mais que o papel do próprio
   membro. O token é mostrado uma vez, começa com `verso_pat_` para que
   scanners de segredos (o do GitHub inclusive) o reconheçam, e é guardado
   como o SHA-256 dele; é enviado como `Authorization: Bearer`. Serve à
   linha de comando, a scripts e a um agente alcançando o servidor, até a
   autorização do MCP pela rede do item 11 do 0073 ser resolvida. **O app
   desktop conectando a um servidor** não pede à pessoa que cole um token:
   abre a página de login do servidor no navegador e recebe um token para
   aquele dispositivo (o fluxo de login de dispositivo que o
   `gh auth login` usa), listado entre as sessões e revogável ali.
9. **Limites e o log de auditoria.** Tentativas de login limitadas por
   endereço e por conta, com espera crescente, nunca um bloqueio que um
   estranho possa usar para deixar o dono de fora; o mesmo para links de
   convite e de redefinição. Um log de auditoria no diretório de dados do
   servidor registra logins (bem-sucedidos e falhos), sessões encerradas,
   tokens criados e revogados, convites, mudanças de papel e concessões —
   quem, quando, de onde — e nunca uma senha, um token ou um link. O dono de
   uma pasta vê as entradas sobre a pasta dele.
10. **Onde as contas moram.** Num banco SQLite no diretório de dados do
    servidor (`VERSO_DATA_DIR`, num disco local,
    [0075](0075-server-packaging-and-storage.md) item 3), ao lado — nunca dentro —
    das pastas que ele serve ([0011](0011-config-outside-tree-index-as-cache.md)).
    Diferente do índice, **não é cache**: não é reconstruído a partir dos
    arquivos, e a receita de backup do 0073 o nomeia ao lado das pastas.
    Nenhuma nota, nenhuma configuração de nota e nada dos arquivos do
    [0012](0012-files-are-source-of-truth.md) passa para ele.
11. **O contrato.** Todo comando carrega a sessão que o transporte
    autenticou (cookie ou token bearer); o core a resolve para uma conta e
    um papel na pasta **antes** de o `verso-fs` agir, e uma recusa é um erro
    do contrato como os outros, nas duas línguas. O app desktop com pasta
    local mantém o dono implícito do
    [0045](0045-server-and-mcp-security.md) e não pede login. A janela sabe
    pelas capacidades ([0027](0027-runtime-capabilities.md)) se está logada
    e com que papel, e esconde o que o papel não pode fazer em vez de
    deixar falhar.

O ambiente do `verso serve`, junto:

| Variável | Necessária | O que faz |
|---|---|---|
| `VERSO_PUBLIC_URL` | sim, fora do loopback | o endereço que as pessoas usam; a origem das chaves de acesso, a checagem de `Origin`, os links nos convites |
| `VERSO_ADMIN_EMAIL` | na primeira subida | o e-mail do primeiro admin |
| `VERSO_ADMIN_PASSWORD` ou `VERSO_ADMIN_PASSWORD_FILE` | com o e-mail | a senha do primeiro admin, 12 caracteres no mínimo |
| `VERSO_DATA_DIR` | não (um padrão na imagem) | as contas, as sessões, o log de auditoria, o índice |
| `VERSO_TRUSTED_PROXY` | atrás de um proxy reverso | o endereço do proxy, cujos cabeçalhos encaminhados são confiados (item 6 do 0073) |
| `VERSO_SMTP_URL` | não | o servidor de e-mail: endereços verificados, links de login, redefinições por e-mail |

## Consequências

- O grupo do contrato do [0045](0045-server-and-mcp-security.md) é
  respondido pelo item 11 quando este ADR e o 0073 forem aceitos, com uma
  linha de Revisões datada lá; os bindings gerados ganham os erros da sessão
  e o estado de login das capacidades (invariante 3).
- O servidor ganha páginas que o app desktop nunca teve — login, convite,
  redefinição, a página de admin, sessões e tokens nos Ajustes — nas duas
  línguas, com a acessibilidade do resto da janela
  ([0035](0035-cross-cutting-requirements.md)), e cada uma com o seu teste
  e2e no harness, que ganha as respostas do servidor.
- Dependências novas, cada uma justificada no seu pull request: uma
  implementação de Argon2 (a crate `argon2`, MIT ou Apache-2.0), uma
  implementação de WebAuthn para as chaves de acesso (`webauthn-rs`,
  MPL-2.0), e, com servidor de e-mail, um cliente SMTP (`lettre`, MIT). O
  `cargo-deny` decide.
- O modelo de ameaças que o 0073 pede antes de o servidor ser anunciado
  cobre este ADR: o token de configuração no log, os links de convite, os
  tokens em repouso, o cookie, a redefinição por quem opera.
- A documentação da imagem Docker lista as variáveis acima, diz que as
  variáveis do admin são lidas uma vez, e que o banco de contas entra no
  backup junto com as pastas.

## Alternativas descartadas

- **As variáveis do admin lidas a cada subida** (levantada pelo autor): uma
  senha trocada no app voltava no próximo reinício; o mantenedor escolheu
  só a primeira subida.
- **Uma variável de uso único que redefine o admin, ou um arquivo-gatilho
  no diretório de dados** (levantados pelo autor, o arquivo a partir do
  Jellyfin): para um host só com um painel; o mantenedor pediu o que a
  comunidade faz, que é um comando na máquina.
- **Uma página de configuração aberta ao primeiro visitante** (levantada
  pelo autor, a partir do Nextcloud e do Jellyfin): o primeiro visitante
  fica dono do servidor.
- **Cadastro aberto** (levantado pelo autor): um servidor de notas privadas
  não tem por que aceitar estranhos.
- **Sessões como JWT** (levantadas pelo autor): a revogação pede estado no
  servidor de qualquer jeito.
- **Links por e-mail como único login** (levantados pelo autor, a partir do
  Notion): a maioria dos servidores de casa não tem servidor de e-mail.

## Status

Proposto, decidido em suas partes pelo mantenedor em 2026-10-09; a ser lido
pela Fable 5.1 e aceito junto com o
[0073](0073-self-hosted-server-first.md). O mantenedor levantou as três
coisas da Fonte, depois respondeu cada questão:

1. O primeiro admin a partir do ambiente, **só na primeira subida**, com
   um caminho de volta para um admin perdido; o caminho de volta "como a
   comunidade preferir": um comando na máquina (item 5).
2. Login: senha e chaves de acesso, links por e-mail com servidor de
   e-mail; OpenID Connect depois (item 3) — "ok pode seguir".
3. Convite só pelo admin, com uma expiração e o uso dele acompanhado, e a
   página de admin mostrando o que cada conta ocupa e quantas pastas tem
   (item 4).
4. O admin não tem acesso implícito às pastas; uma autoconcessão fica
   registrada no log (item 6).
5. Várias contas por servidor; criar pastas concedido pelo admin
   (item 6).
6. Tokens de acesso pessoal com escopo por pasta e por leitura ou escrita;
   o app desktop entra pelo navegador (item 8).

Onde o servidor guarda os dados, como é instalado, o espaço que cada pasta
ocupa e quais pastas são sincronizadas:
[0075](0075-server-packaging-and-storage.md).
