# O modelo de ameaças do servidor (2026-10-09, atualizado em 2026-10-11)

O que o UniVerso — o `verso serve` — protege, de quem e como. O [ADR 0073](../adr/0073-self-hosted-server-first.md)
item 6 o pede antes de o servidor ser anunciado a qualquer pessoa além do
mantenedor, e pede segurança por inteiro antes do primeiro usuário que não
seja o mantenedor; o [ADR 0074](../adr/0074-accounts-and-access-on-the-server.md)
nomeia o que ele precisa cobrir do que é seu; o [ADR 0045](../adr/0045-server-and-mcp-security.md)
nomeia o risco de injeção de prompt que ele retoma. Escrito pela Opus 5.5;
não decide nada — onde uma lacuna pede decisão, diz `[ABERTO]`, e uma
resposta recomendada vem marcada como recomendação.

**Atualizado em 2026-10-11 contra o HEAD 7729940** do `feat/universo`
(`docs/roadmap.md`, revisão 6, linha 3.15: terceiro depois desta rodada,
antes do compartilhamento). Escrito pela primeira vez em 2026-10-09 contra
o `feat/web`; linhas acrescentadas em 2026-10-11 pelo f4a19c9 para o
aparelho que sincroniza e o compartilhamento. Lido para esta atualização:
as rotas e os handlers do servidor (`crates/verso-server/src`: `http.rs`,
`auth.rs`, `api.rs`, `admin.rs`, `console.rs`, `folders.rs`, `device.rs`,
`passkeys.rs`, `rpc.rs`, `state.rs`, `sync.rs`, `collab.rs`, `files.rs`,
`access.rs`, `limit.rs`, `quota.rs`, `large.rs`), o sanitizador da janela
(`app/ui/src/sanitize.ts`), o empacotamento (`packaging/server/`) e os
ADRs [0075](../adr/0075-server-packaging-and-storage.md),
[0077](../adr/0077-the-server-administration-console-and-folder-quotas.md),
[0079](../adr/0079-sync-a-local-folder-with-a-server.md),
[0080](../adr/0080-the-trash-with-expiry-and-restore.md),
[0081](../adr/0081-sharing-between-people-on-one-universo.md) e
[0082](../adr/0082-live-co-editing-of-a-synced-folder.md). 0080, 0081 e
0082 estão aceitos e **não construídos** neste HEAD; as linhas deles dizem
o que decidem, não o que roda.

**Lacunas fechadas em 2026-10-11** no `feat/universo-sec` (a partir do
4c09fc9), cada uma pelo commit que a entrada dela nomeia: 1, 2, 3, 4, 6, 7,
8 e 13 a 16. A superfície de ataque e as ameaças abaixo dizem os limites
como construídos ali; 5, 9, 10, 11, 12 e 17 continuam abertas, cada uma
com seu motivo.

## O que é protegido

| Bem | Onde | Por que importa |
|---|---|---|
| As notas e os anexos | as pastas sob `VERSO_FOLDERS_DIR` | o que a pessoa escreveu; uma pasta pode ser compartilhada por várias pessoas |
| O que foi apagado | o `.trash/` de cada pasta, no servidor e num computador que sincroniza | um apagamento feito por outro membro ou por um aparelho só se recupera daqui até o ADR 0080 |
| Contas e hashes de senha | `server.sqlite` em `VERSO_DATA_DIR` | hashes Argon2id; um roubado é atacado offline |
| Sessões, sessões de aparelho, tokens de acesso pessoal, links de uso único | o mesmo banco, só como SHA-256; links de entrada por e-mail e códigos de aparelho pendentes na memória | cada um abre uma conta até terminar |
| Credenciais de passkey | o mesmo banco | chaves públicas e contadores; nenhum segredo |
| O registro de auditoria e o registro de mudanças de cada pasta | o mesmo banco | quem fez o quê, de qual aparelho; a prova de um membro |
| O token de um aparelho num desktop | `servers.json` na pasta de configuração do app, `0600` no macOS e no Linux; no Windows, as permissões do próprio perfil | abre a conta daquele computador |
| A memória e as threads do servidor | o processo | as conexões de um membro podem esgotar as de todos os outros |

## Quem

- **Um estranho na rede** (a internet, ou um Wi-Fi de casa): sem conta.
- **Um membro**: uma conta, com papéis em algumas pastas.
- **Um membro com uma nota hostil**: escreve HTML, SVG, links ou texto
  feitos para a janela ou o agente de outro membro.
- **O programa de um membro**: um token de acesso pessoal, limitado a
  pastas e a ler ou escrever.
- **O aparelho de um membro**: a sessão de aparelho do app desktop,
  sincronizando.
- **O admin**: cuida das contas; sem acesso implícito às pastas.
- **Quem hospeda**: quem roda a máquina ou o contêiner. Lê o disco, o
  banco e o log. Fora do escopo como adversário: a documentação diz com
  essas palavras que quem hospeda vê as notas (ADR 0073 item 6, sem
  criptografia de ponta a ponta). Outro usuário local da mesma máquina não
  é quem hospeda.
- **Uma página de outro site** aberta no navegador de um membro.

## Fronteiras

1. A rede → o servidor: TLS, `Host`, `Origin`, a sessão.
2. Um membro → outro, dentro de um servidor: papéis por pasta, o
   sanitizador e as políticas da janela, o sandbox dos arquivos.
3. A página do navegador → a API do servidor: o cookie, o token CSRF.
4. O servidor → o disco: `verso-fs`, confinamento de caminhos, symlinks
   mantidos dentro da pasta.
5. O servidor → a internet: o feed de releases, e o servidor de e-mail de
   quem hospeda quando há um.
6. Uma conexão → os recursos compartilhados do servidor: os limites por
   conexão do WebSocket, as esperas por endereço, as cotas.

## A superfície de ataque no HEAD

Toda conexão primeiro ocupa um lugar — 512 no servidor, 128 por endereço
(um /64 de IPv6 conta como um; esta máquina e o proxy confiável não são
contados) — antes de um handshake TLS ou de um byte de HTTP ser lido, e o
mantém até o fim, o de um WebSocket também. Os cabeçalhos de uma
requisição têm 30 s, a espera pela próxima numa conexão mantida viva
incluída; uma requisição tem 60 s, a chegada do corpo incluída (408 depois
disso). Toda requisição passa primeiro pela checagem do `Host` (421 se
não) e recebe depois os cabeçalhos do servidor: `nosniff`, `no-referrer`,
`SAMEORIGIN`, `Cross-Origin-Opener-Policy`, uma `Permissions-Policy`, HSTS
em HTTPS e, fora de `/f/`, a política da própria janela (em `/f/`,
`Cross-Origin-Resource-Policy: same-origin`). Um corpo da API REST tem
1 MB no máximo. Toda espera "por endereço" abaixo usa como chave um
endereço IPv4 inteiro e um IPv6 pelo seu /64; os mapas que estranhos
enchem são limitados — 100 000 chaves das esperas, e 10 000 cada de
códigos de aparelho, links de entrada e cerimônias de passkey — saindo
primeiro o décimo mais antigo. Um segredo enviado por HTTP simples de outra
máquina nunca é lido. "Origin" abaixo é o `Ctx::changes()`: a mudança de um
navegador leva um `Origin` que confere e o token CSRF da sessão; um bearer
(um token ou um aparelho) não leva nenhum dos dois; sem sessão, só o
`Origin`. "A pessoa" é o `Ctx::person()`: um navegador ou um aparelho
dentro como ela, nunca um token. "Admin" é o `Ctx::admin()`: a sessão de
navegador ou de aparelho de um admin, nunca um token.

| Superfície | Quem pode chamar | O que confere | O que limita | O que registra |
|---|---|---|---|---|
| `GET /api/state`, as páginas, os arquivos da janela | qualquer um; a versão do servidor e a do contrato só para quem está dentro | `Host` | a página nunca vai para cache | nada |
| `POST /api/signin` | qualquer um, em TLS | Origin | uma espera que cresce por endereço e por conta (`in:`): 3 livres, depois 1 s dobrando até 60 s, esquecida depois de uma hora | auditoria `sign_in`, falha ou não |
| `POST /api/passkey/start`, `/finish` | qualquer um, em TLS | Origin; WebAuthn com verificação do usuário; a cerimônia 5 minutos na memória | uma espera por endereço (`pk:`), todo início contado | auditoria `sign_in_passkey` |
| `POST /api/signin/link`, `POST /api/forgot` | qualquer um, só quando o servidor tem servidor de e-mail | Origin | uma espera por endereço (`mail:`), toda requisição contada; respondida antes de o endereço ser procurado — o link, o e-mail e a linha de auditoria vêm depois da resposta; um link de entrada vive 15 minutos, na memória | auditoria `signin_link_sent`, `reset_link_mailed` quando o endereço tem conta |
| `POST /api/signin/link/{token}`, `GET`/`POST /api/invite/{token}`, `GET`/`POST /api/reset/{token}`, `POST /api/setup` | quem tem o link | Origin no `POST`; o hash do link, uso único, validade (configuração 1 hora, convite 7 dias, senha nova 24 horas); configuração só enquanto não há conta | uma espera por endereço num link errado (`link:`) | auditoria `sign_in_link`, `invitation_used`, `password_reset`, `setup` |
| `POST /api/device/start` | qualquer um, em TLS | nada mais | todo início contado por endereço (`device:`), a mesma espera; um código vive 10 minutos | nada |
| `POST /api/device/poll` | quem tem o segredo de consulta (256 bits) | o hash do segredo, comparado em tempo constante | nenhum próprio | nada |
| `GET`/`POST /api/device/{code}` | quem está dentro; aprovar só de uma sessão de navegador | Origin (aprovar) | o código: 10 minutos, uma vez | auditoria `device_approved` |
| `/api/me`, `/api/me/*` | a pessoa (perfil, senha, sessões, ajustes, passkeys); um token só se cria num navegador; um aparelho só renomeia a si mesmo | Origin; a senha atual para uma nova | a troca de senha por conta (`in:`), o Argon2id dela no pool de bloqueio; ajustes 256 KB; nomes 200 caracteres | auditoria `password_change`, `session_ended`, `sessions_ended`, `token_created`, `token_revoked`, `passkey_added`, `passkey_removed`, `device_renamed`; uma mudança de perfil ou de ajustes não é auditada |
| `/api/folders`, `/api/folders/{id}/*` | quem está dentro; criar: uma conta autorizada, nunca um token; membros e a auditoria da pasta: o dono da pasta | Origin; o papel na pasta, 404 quando não há | — | auditoria `folder_created`, concessões, `revoke` |
| `/api/admin/*` | admin | Origin nas mudanças | toda lista paginada no servidor (50 linhas) | auditoria de toda mudança (`account_created`, `powers_*`, `account_deleted`, `account_sessions_ended`, `reset_link`, convites, `folder_adopted`, `admin_self_grant_*`, `folder_quota`); leituras não são auditadas |
| `GET /f/{folder}/{*path}` | um leitor da pasta ou mais; um token dentro das pastas dele | TLS; o papel, a cada requisição; o confinamento de caminhos do núcleo | `Content-Security-Policy: sandbox`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin` | nada |
| `GET /api/ws`, o contrato | um navegador (só com `--web`, `Origin` conferido antes de aceitar o cookie), um aparelho, um token | TLS; a sessão ou o token vivo antes de cada comando; o papel na pasta antes de o núcleo agir; as pastas e a escrita de um token; uma versão de sync mais velha que a anterior recusada para `sync_*` | 48 MB por mensagem; 8 requisições em andamento, além das quais a conexão não é lida; uma fila de 1024 mensagens e 64 MiB de envios, cheia = fechada; cada escrita em 30 s mais o tamanho dela a 32 KiB/s, senão fechada; um ping a cada 30 s, fechada depois de 2 sem resposta; 32 conexões por conta e 64 por endereço, 429 além disso; cada comando no ritmo da conta (100 por segundo, 400 de uma vez) e no do servidor (1 000, 2 000), esperando a vez além dele; as linhas de log de uma janela, 60 por minuto | o log do servidor: uma mudança de sync recusada, uma conexão lenta ou calada fechada, uma versão de sync recusada; o registro de mudanças de cada pasta nomeia a conta e o aparelho de cada escrita |
| — comandos da pasta | a pasta da janela, aberta por `open_server_folder` ou `reopen_folder` | um comando de escrita pede editor ou dono e uma credencial que escreve; os bytes de uma escrita conferidos contra a cota antes | a cota (ADR 0077 item 5) | o registro de mudanças |
| — `collab_*` (notas compartilhadas) | membros da pasta | `collab_update`, `_save`, `_resolve` pedem quem escreve; uma atualização Yjs malformada recusada | a presença (`collab_awareness`) com 16 KB no máximo, de uma janela na sala, carimbada com o nome da conta de quem enviou e só os clientes Yjs dela (lacuna 11); o que é repassado conta nos 64 MiB de envios de cada destinatário | nada |
| — `sync_*` | um aparelho (qualquer credencial pode perguntar) | uma escrita, um apagamento ou uma mudança de nome pede quem escreve, nomeia o hash de base e é recusada quando o arquivo mudou; um apagamento vai para o `.trash/`; a cota sobre o arquivo inteiro | pedaços de 1 MiB, lidos do disco e gravados num arquivo temporário à medida que passam, um na memória por transferência (2b1f2c4); 2 transferências em cada sentido por conexão, descartadas depois de 120 s paradas e quando a conexão acaba, e com elas o arquivo temporário de um envio; 1 GiB por arquivo; a cota conferida no primeiro pedaço de um envio e de novo no último; uma varredura no máximo uma vez por minuto | o log do servidor para uma recusa que não seja "mudou" |
| — `render_markdown`, `board_text`, `log_write`, `capabilities` | quem está dentro | — | o parser passa por fuzzing e pela checagem de tempo linear; linhas de log uma linha cada, 2000 caracteres | o log do servidor (`log_write`) |
| O feed de releases | o servidor, de saída | — | uma vez por dia; só a versão no `User-Agent`; `VERSO_UPDATE_TOKEN` quando o repositório é privado; `VERSO_UPDATE_CHECK=off` | uma linha quando falha |
| O servidor de e-mail de quem hospeda | o servidor, de saída, quando `VERSO_SMTP_URL` está definido | — | o que as rotas de e-mail acima permitem | uma linha quando o envio falha |

## Ameaças e o que responde a elas

### Chegar ao servidor

| Ameaça | Resposta como construída |
|---|---|
| Uma senha ou um token lido no fio | Nada que faça login ou carregue segredo é servido sem TLS — o do próprio servidor (`VERSO_TLS_CERT_FILE`), o de um proxy configurado (`VERSO_TRUSTED_PROXY` com `X-Forwarded-Proto: https`) — ou desta máquina para um servidor que só escuta em loopback. Um segredo por HTTP simples vindo de outro lugar nem é lido. HSTS é enviado quando o endereço é HTTPS. |
| Cabeçalhos encaminhados forjados para parecer seguros | Só são aceitos vindos do endereço de `VERSO_TRUSTED_PROXY`; o endereço do cliente é o último do `X-Forwarded-For`, o que aquele proxy acrescentou. |
| DNS rebinding: um site resolvendo o próprio nome para o servidor | O cabeçalho `Host` precisa ser o do endereço público ou um nome de loopback; senão, 421. Os links que o servidor manda por e-mail e escreve são montados a partir de `VERSO_PUBLIC_URL`, nunca do `Host` de uma requisição. |
| Escutar além de loopback por engano | Recusado na subida sem `VERSO_PUBLIC_URL`; o padrão é `127.0.0.1`. |
| Uma conexão mantida aberta para prender o servidor | Toda conexão ocupa primeiro um lugar — 512 no servidor, 128 por endereço — antes do handshake TLS (10 segundos) ou de um byte de HTTP; os cabeçalhos de uma requisição têm 30 segundos, uma requisição 60. Um WebSocket recebe um ping a cada 30 segundos e é fechado depois de dois pings sem resposta, e fechado quando uma escrita não é aceita a tempo; uma conta tem até 32 deles, um endereço 64 (lacunas 2, 4 e 8, fechadas). |
| O processo tomando a máquina | O contêiner roda como o usuário 1000; a unidade do systemd roda como `universo` com `NoNewPrivileges`, `ProtectSystem=strict`, sem capabilities e com um conjunto estreito de chamadas de sistema e de famílias de endereço (ADR 0075). |

### Entrar e continuar dentro

| Ameaça | Resposta como construída |
|---|---|
| Adivinhar senhas | Argon2id (os primeiros parâmetros do OWASP); uma espera que cresce por endereço e por conta, nunca um bloqueio que um estranho possa usar; 12 caracteres no mínimo. |
| Descobrir quem tem conta | Uma senha errada e um e-mail desconhecido são respondidos igual, em tempo parecido (um hash é calculado nos dois casos); o início de uma passkey responde igual a um e-mail desconhecido e a uma conta sem passkey, e dá o desafio a uma conta com passkeys — o que diz que o endereço tem passkeys, nunca que existe uma conta sem elas. Um link de entrada e o "esqueci a senha" respondem igual nas palavras e no tempo: a resposta sai antes de o endereço ser procurado (lacuna 6, fechada). |
| Um cookie de sessão roubado | `HttpOnly`, `SameSite=Lax`, `Secure` e `__Host-` em HTTPS; 14 dias parado, 90 no máximo; listado nos Ajustes e encerrado ali; trocar a senha encerra as outras; conferido de novo antes de cada comando de um WebSocket aberto, e as conexões de uma sessão encerrada são avisadas e fechadas na hora. |
| Requisições de outro site | Toda requisição que muda algo confere o `Origin` contra o do servidor e leva o token CSRF da sessão; o WebSocket confere o `Origin` antes de aceitar o cookie. |
| Um token vazado de um script | Tokens de acesso pessoal limitados a pastas e a ler ou escrever, nunca mais que o papel do membro; nunca admin, nunca as páginas da própria conta; criados só num navegador; com o prefixo `verso_pat_` para os detectores de segredos; guardados como SHA-256; validade de um ano no máximo, ou nenhuma, dita em vermelho; revogáveis. |
| O primeiro admin tomado por quem chegar primeiro | Nenhuma página de configuração aberta a qualquer um: o admin vem do ambiente na primeira subida, ou de um link de configuração de uso único, válido por uma hora, escrito uma vez no log — quem lê o log é quem roda o servidor. |
| Um admin perdido | `universo admin reset <e-mail>` (ou `verso serve admin reset`) na máquina: o acesso à máquina é o último fator; a redefinição fica no registro de auditoria e encerra as sessões da conta. |
| Um link de convite ou de senha nova repassado ou adivinhado | 256 bits, uso único, validade (7 dias, 24 horas), o uso registrado (por quem, quando), encerrável pelo admin antes do uso; tentativas desaceleradas por endereço. |
| Um aparelho aprovado por engano | A página de aprovação mostra o nome do aparelho e o código que o app mostra, o endereço e a hora do pedido, pergunta a uma pessoa já dentro no navegador *Foi você quem pediu, neste aparelho?* e oferece recusar, e a sessão do aparelho é listada e revogável. O nome do aparelho é o que quem pediu enviou; o endereço e a hora são os do servidor (lacuna 12). |
| Um aparelho ou um celular perdido | A pessoa encerra a sessão nos Ajustes; um admin encerra todas as sessões de uma conta e revoga os tokens dela pelo console, as conexões abertas fechadas na hora, com uma linha de auditoria (ADR 0077 item 3, construído). |
| Passkeys | WebAuthn com verificação do usuário exigida (webauthn-rs); o estado da cerimônia vive cinco minutos na memória; contadores guardados. |

### Um membro contra outro

| Ameaça | Resposta como construída |
|---|---|
| Chegar a uma pasta que não lhe foi dada | Todo comando e todo pedido de arquivo confere o papel do membro na pasta antes de o núcleo agir; uma pasta que não se pode ver responde 404. O admin não é exceção: entrar numa pasta é uma permissão dada a si mesmo, no registro que o dono lê. |
| Um leitor escrevendo | Comandos de escrita, a atualização, o salvamento e a resolução de uma nota compartilhada, o envio, o apagamento e a mudança de nome de um aparelho, e os ajustes da pasta são recusados abaixo do papel de editor; a janela esconde o que o papel não pode fazer. Um papel mudado ou retirado chega na hora às janelas abertas do membro. |
| XSS armazenado por um anexo (HTML, SVG) | Os arquivos são servidos de `/f/` com `Content-Security-Policy: sandbox` e `nosniff`: um documento feito deles não roda script. |
| XSS armazenado pelo HTML de uma nota | O sanitizador da janela, `app/ui/src/sanitize.ts`, é a fronteira entre membros (ADR 0073 item 6): uma lista permitida de elementos, atributos e classes do renderizador, interpretada num documento inerte; scripts, estilos, formulários e conteúdo estrangeiro descartados; links só para a web, o e-mail e a própria página; uma página incorporada atrás da aprovação da origem pelo leitor; estilo inline mantido, mas nunca fixed ou absolute. A política da própria janela, enviada como cabeçalho, só permite scripts do servidor. O Mermaid roda com `securityLevel: "strict"`; o KaTeX com os padrões dele. O que o sanitizador garante, e a bateria que o mantém nisso: abaixo (lacuna 1, fechada). `[ABERTO]`: a revisão pelo modelo que não o escreveu (as lacunas antes do anúncio). |
| Conteúdo remoto revelando quem lê | Imagens remotas e páginas incorporadas seguem o ajuste do próprio leitor, nunca o do autor (a resposta I do mantenedor). |
| Symlinks levando para fora de uma pasta compartilhada | Num servidor, um link só é seguido quando leva para dentro da pasta; um que sai é recusado e listado como problema. |
| Uma edição que apaga o texto de outro | A edição simultânea mescla; uma escrita vinda de fora é mesclada linha a linha ou recusada como mudada; uma mudança feita fora enquanto há edições esperando para a sala para as pessoas escolherem. `[ABERTO]`: histórico, atribuição e recuperação da mudança de outro membro (ADR 0073). |
| O apagamento do arquivo de outro | Um apagamento vai para o `.trash/` da pasta, da janela e de um aparelho igualmente; ver e restaurar na janela, e a retenção, são o ADR 0080, aceito, em construção. |
| Uma mensagem enorme ou muitas requisições para esgotar a memória | Uma mensagem de WebSocket tem 48 MB no máximo; uma atualização Yjs malformada é recusada; uma conexão tem no máximo 8 requisições em andamento e uma fila de 1024 mensagens e 64 MiB de envios, fechada quando enche; uma presença tem 16 KB no máximo. Os comandos seguem um ritmo por conta e no servidor, e as conexões são contadas por conta e por endereço (lacunas 3 e 4, fechadas). O espaço de uma pasta é limitado pela cota dela (ADR 0077 item 5): uma escrita que a passaria é recusada e nada é escrito. |
| Uma presença que mente | O servidor carimba a presença com o nome da conta de quem a enviou, só mantém uma cor que seja uma cor, e deixa uma conexão falar só pelos clientes Yjs dela: o cursor de um membro não veste o nome de outro, nem move ou tira o de outro (lacuna 11). |

### O que o sanitizador garante

O `app/ui/src/sanitize.ts` é escrito à mão, sem biblioteca. Revisado linha
a linha em 2026-10-11 contra o que chega até ele — o `to_html` do dialeto
com o HTML cru de uma nota, notas e blocos incorporados, callouts, links, e
as células de uma tabela no Live Preview, que até então chegavam à página
sem limpeza — ele interpreta o HTML num documento inerte e mantém uma
lista permitida: os elementos do renderizador e a formatação simples; os
atributos `class`, `id`, `title`, `lang`, `dir`, `style`, `align` e os
`data-*` do renderizador em qualquer um deles, e os próprios de cada
elemento (o `href` de um link, o `src`, `alt`, `width`, `height` de uma
imagem…); só as classes do renderizador. O que roda, carrega, estiliza a
página ou é texto cru — `script`, `style`, `object`, `embed`, `base`,
`meta`, controles de formulário, `template`, `noscript`, `svg`, `math`,
qualquer elemento fora do namespace do HTML — sai com tudo o que contém;
comentários saem; todo atributo `on*` sai. Um link chega a http(s), ao
e-mail ou à página; uma imagem à web, a dados (`data:image/`) ou a um
arquivo ao lado da nota; cada endereço como o parser de URL o lê, então
`java&#9;script:` e seus parentes saem. Todo id e todo link `#` passam
para baixo de `note-`: uma nota não nomeia nenhum id da janela nem global
nenhum (`isTauri`). Um estilo inline é mantido como o CSSOM o lê, nunca
`fixed` ou `absolute`, o `url()` dele só para a web (conteúdo remoto
ligado) ou uma imagem em dados. Um `<iframe>` é uma caixa até o leitor
aprovar a origem dele, e nunca uma para um endereço fora da web. O que ele
devolve se interpreta como ele mesmo e se limpa como ele mesmo: nada de
mutation XSS no caminho pelo `cleanHtmlText`. O
`app/ui/test/sanitize.test.mjs` escreve esta política, a confere contra a
do módulo e roda 76 entradas hostis — o básico da cheat sheet da OWASP, os
payloads de mXSS conhecidos, truques de codificação, clobbering — no
`npm test`. Roda no happy-dom, cujo parser não é o do WebKit: as garantias
são estruturais e valem para os dois, e uma rodada da mesma tabela no
harness do navegador ainda falta.

### Um aparelho que sincroniza

| Ameaça | Resposta como construída |
|---|---|
| Um aparelho escrevendo onde a conta dele não pode | Um aparelho sincroniza pela sessão de aparelho dele (ADR 0074 item 8): cada escrita, apagamento e mudança de nome que ele envia é conferido contra o papel da conta na pasta antes de o núcleo agir — o aparelho de um leitor recebe, as mudanças locais dele recusadas (ADR 0079 item 1) — e uma escrita contra a cota da pasta (ADR 0077 item 5). |
| A escrita de um aparelho sobre uma versão mais nova | Toda mudança que um aparelho envia nomeia o hash em que se baseou e é recusada quando o arquivo no servidor não é mais aquele (invariante 11); o aparelho então guarda os dois, o seu como cópia de conflito (ADR 0079 item 8). Dois acréscimos puros ao fim de uma nota são juntados em vez disso, no aparelho, e ditos "juntado" no registro do sync (construído, 834dd8d). Um limite conhecido: um programa fora do Verso salvando um buffer velho é uma mudança comum (ADR 0079, achado F18); guardar a versão que ele substituiu é o item 12 do ADR 0080, aceito, em construção. |
| Um aparelho apagando os arquivos de uma pasta | Um apagamento que um aparelho envia é conferido contra a base dele como uma escrita e vai para o `.trash/` da pasta no servidor; no computador, uma passada que apagaria mais de um quinto dos arquivos ou mais de 50 (pelo menos 3) pausa e pergunta (ADR 0079 item 9), e um placeholder nunca é um apagamento (ADR 0043). Ver e restaurar a lixeira na janela é o ADR 0080, aceito, em construção. |
| Um token de aparelho roubado | Guardado `0600` no computador (acima), listado entre as sessões da conta com o nome que a pessoa deu ao computador e revogável ali; um admin o encerra pelo console junto com as outras sessões e os tokens da conta (ADR 0077 item 3, construído); o registro de mudanças nomeia o aparelho ao lado da conta (ADR 0079 item 4). |
| Um aparelho falando outro sync | O aparelho envia a versão de sync dele como `x-verso-sync`; o servidor responde a sua no hello e recusa os comandos `sync_*` de uma versão mais velha que a anterior, com o motivo (ADR 0079 item 5, construído). Uma janela ou um programa que não diz nenhuma nunca é recusado. |
| Um arquivo enorme para esgotar a memória | O sync move um arquivo em pedaços de 1 MiB, lidos do disco quando cada um vai e gravados num arquivo temporário quando cada um chega — uma transferência segura um pedaço na memória, nunca o arquivo (2b1f2c4) —, duas transferências por vez em cada sentido por conexão, descartadas depois de dois minutos paradas e quando a conexão acaba, e nenhum arquivo maior que 1 GiB (ADR 0079 item 12); um arquivo acima disso no servidor nunca é lido pela varredura e aparece na página da pasta no console. O tamanho declarado de um envio é conferido contra a cota no primeiro pedaço (lacuna 5, fechada). |

### Compartilhar uma pasta dentro de uma pasta

ADR 0081, aceito em 2026-10-11 e **não construído**: estas linhas dizem o
que ele decide, não o que roda.

| Ameaça | Resposta como decidida |
|---|---|
| Quem recebe alcançando além do caminho compartilhado | Um compartilhamento é uma concessão num caminho; a sessão que o abre guarda o caminho, os caminhos de todo comando são juntados a ele e confinados (`..` recusado antes de o `verso-fs` agir), e toda resposta — a árvore, uma busca, backlinks, o grafo, as linhas de uma base, o registro de mudanças — é filtrada ao caminho e re-enraizada nele (itens 1 e 2). |
| Saber das notas fora do compartilhamento | Um link para uma nota de fora resolve para "fora do que foi compartilhado com você": nem se existe, nem o caminho, nem o conteúdo (item 11). |
| Um compartilhamento repassado, ou mantido depois de acabar | Só o dono da pasta compartilha, e quem recebe não recompartilha (item 4); uma revogação chega às janelas abertas de quem recebe na hora, e uma cópia sincronizada fica no computador dele com o sync desligado — dito ao dono ao compartilhar (item 8). |
| Um compartilhamento apontando para outro lugar | Uma mudança de nome feita pelo servidor leva as concessões junto; uma que o servidor só acha depois deixa o compartilhamento num caminho que sumiu — uma pasta vazia para quem recebe, o dono avisado (item 13). |
| Um compartilhamento feito sem ninguém ver | Um compartilhamento criado, mudado e removido é uma entrada do registro de auditoria com o caminho, lida pelo dono e pelo admin (item 9). |
| Um aviso ou um problema que nomeia uma nota fora do compartilhamento | Lacuna achada e fechada em 2026-10-12: um aviso do core (o exame de uma renomeação, os problemas de uma indexação) chegava a quem recebe quando não tinha `/`, então uma nota na raiz do dono passava pelo nome; agora um aviso só chega a quem recebe quando começa com um caminho de dentro do compartilhamento, re-enraizado nele, e qualquer outro é descartado (item 11; `scope.rs`, o teste dele). Uma segunda lacuna da mesma linha, fechada no mesmo dia: um aviso que começava dentro do compartilhamento podia nomear um caminho de fora mais adiante na linha (`Mesa/x.md: links to Segredo.md`); agora todo nome que a mensagem traz — um link, uma palavra com `/` ou com extensão — precisa ser um caminho de dentro do compartilhamento ou da pasta de anexos dele, ou o aviso inteiro é descartado (`scope.rs`, `a_warning_naming_an_outside_path_later_in_the_line_is_dropped`). |

### A lixeira e a coedição ao vivo de uma pasta sincronizada

ADR 0080 e ADR 0082, aceitos e **não construídos** neste HEAD (o 0080 está
em construção): estas linhas dizem o que eles decidem, não o que roda.

| Ameaça | Resposta como decidida |
|---|---|
| Um membro apagando a prova de um apagamento | A lixeira é vista por quem escreve; qualquer um que escreve restaura; "apagar agora" e "esvaziar a lixeira" são do dono e do admin; toda entrada nomeia quem apagou; uma restauração, um apagar-agora e um esvaziamento ficam no registro de auditoria (ADR 0080 item 7). |
| A lixeira usada para passar da cota | Mostrada, não contada contra a cota, limitada pela validade; quando a lixeira de uma pasta sozinha passa da cota dela, as entradas mais velhas expiram antes, dito na página da pasta (ADR 0080 item 8, decidido em 2026-10-10). |
| A escrita de um aparelho substituindo uma versão sem ninguém ver | A versão que a escrita de um aparelho substituiu é guardada (ADR 0080 item 12). |
| Um aparelho numa sala como outra pessoa, ou um leitor digitando | A pessoa numa sala é a conta com que o aparelho entrou, o papel dela o da pasta como o link do sync o aprendeu, acompanhado numa mudança; um leitor está presente e não digita, e o servidor recusa a atualização de um leitor como já faz (ADR 0082 item 4). |

### O alcance do próprio servidor

| Ameaça | Resposta como construída |
|---|---|
| O servidor como proxy aberto | Ele só sai para a rede na checagem de versão — o feed de releases do projeto, uma vez por dia, sem nada além da versão no `User-Agent`; `VERSO_UPDATE_CHECK=off` desliga — e para o servidor de e-mail de quem hospeda quando `VERSO_SMTP_URL` está definido. |
| Os bancos corrompidos num NAS | Aviso no log e na página de admin quando `VERSO_DATA_DIR` está num sistema de arquivos de rede. |
| Segredos no log | Nenhuma senha, token ou link vai para o log; o link de configuração é o único segredo escrito, uma vez, de propósito. As linhas de log de uma janela são uma linha cada, com os caracteres de controle trocados. O console mostra a configuração com os segredos (`VERSO_UPDATE_TOKEN`, `VERSO_SMTP_URL`) como definidos ou não, nunca o valor. |
| Uma dependência vulnerável ou sem licença | `cargo-deny` (avisos, licenças) e a lista de licenças do npm no CI; um aviso de falta de manutenção com exceção e validade (RUSTSEC-2026-0215, smallstr via yrs). |

### Agentes

A nota de outro membro pode carregar texto escrito para conduzir um agente
que a leia (ADR 0045). O servidor ainda não expõe MCP pela rede
(`[ABERTO]`, ADR 0073 item 11); um membro que sincroniza ou abre uma pasta
compartilhada com um agente local leva esse risco para a própria máquina.
A documentação diz isso onde os agentes são configurados. Enquanto isso, um
token de acesso pessoal é o único jeito de um programa chegar ao servidor,
limitado como acima.

## Lacunas encontradas em 2026-10-11

Encontradas lendo o código no HEAD 7729940; achados, não correções.
Classificadas para uma release ao primeiro usuário que não seja o
mantenedor, pelos níveis do [ADR 0033](../adr/0033-pr-workflow.md); a
classificação é uma recomendação para o mantenedor confirmar.

**BLOQUEANTE**

1. **O sanitizador do HTML das notas não teve revisão contra notas
   hostis, nem teste próprio.** Ele é a fronteira entre membros (ADR 0073
   item 6) e é escrito à mão (`app/ui/src/sanitize.ts`); nenhum teste
   unitário em `app/ui/test/` e nenhum teste de ponta a ponta o alimenta
   com HTML hostil. O `[ABERTO]` do próprio modelo, abaixo. **Fechada:
   c7f8c8d** — revisado e corrigido (as células de uma tabela chegavam à
   página sem limpeza; ids e links `#`, os endereços de um estilo, `svg` e
   `math` pelo nome, uma página incorporada fora da web), com bateria
   própria: "O que o sanitizador garante", acima. A revisão por outro
   modelo continua `[ABERTO]` abaixo.

**IMPORTANTE**

2. **Sem tempo limite de envio no WebSocket.** O laço da conexão espera
   cada `socket.send`: um par que para de ler no nível do TCP prende o laço
   ali, e nem o aviso de fila cheia nem o ping conseguem fechá-la, até o
   sistema operacional desistir do socket. Um ping também é pulado enquanto
   as 8 requisições da conexão estão todas em andamento. **Fechada:
   e4b679c** — toda escrita, nas duas pontas, em 30 s mais o tamanho dela
   a 32 KiB/s (uns 3 minutos para um pedaço de arquivo, 25 para uma
   mensagem no limite), senão a conexão fecha. O ping continua não sendo
   enviado enquanto as 8 requisições estão em andamento: a conexão não é
   lida então, e o limite da escrita responde a um par que parou de ler.
3. **A fila da conexão é limitada em mensagens, não em bytes.** O limite
   de 1024 mensagens supõe eventos pequenos, mas `collab-update` e
   `collab-awareness` são repassados como quem os enviou os escreveu, até o
   limite de 48 MB por mensagem; um membro — um leitor também, pela
   presença — pode fazer a fila de um par lento guardar até 1024 desses
   quadros. Cada conexão também pode segurar 8 requisições interpretadas
   de até 48 MB ao mesmo tempo. **Fechada: fd75ff9** — 64 MiB de envios
   por conexão ao lado das 1024 mensagens, uma presença com 16 KB no
   máximo. As 8 requisições interpretadas continuam, limitadas pelo limite
   de mensagem e agora pelas conexões abaixo.
4. **Sem teto de conexões e sem limite global de comandos.** Nada limita
   as conexões de uma conta, de um endereço ou do servidor; cada uma ocupa
   até 8 comandos no pool de bloqueio. O programa de um membro pode esgotar
   todos os outros membros. O `[ABERTO]` do próprio modelo sobre um limite
   de taxa além dos logins. **Fechada: aa7fea0 e e3360e1** — 32 WebSockets
   por conta, 64 por endereço; 512 conexões no servidor, 128 por endereço;
   comandos a 100 por segundo por conta (400 de uma vez) e 1 000 no
   servidor (2 000), esperando a vez além disso, dito no log uma vez por
   minuto. Raciocinados, ainda não medidos na máquina de 1 núcleo.
5. **Um envio fica na memória até o último pedaço, e a cota só é
   conferida então.** Até dois envios de 1 GiB por conexão, vezes as
   conexões acima; o tamanho declarado é conhecido no primeiro pedaço e
   poderia ser conferido contra a cota ali. **Fechada: 2b1f2c4** — os
   pedaços de um envio são gravados num arquivo temporário da pasta à
   medida que chegam, um de cada vez na memória, e o tamanho declarado é
   conferido contra a cota no primeiro pedaço (e de novo no último); uma
   transferência descartada leva junto o seu arquivo temporário.
6. **As rotas de e-mail respondem mais tarde quando o endereço tem
   conta.** `signin_link` e `forgot` esperam o servidor de e-mail só para
   uma conta que existe; o comentário diz "depois da mesma espera", o
   código não acrescenta nenhuma. O tempo diz quem tem conta, o que a rota
   de senha evita. **Fechada: 98ce00b** — as duas respondem passada a
   espera do endereço; procurar o endereço, o link, o e-mail e a linha de
   auditoria vêm depois da resposta, iguais para todo endereço.
7. **As esperas por endereço usam o endereço inteiro como chave.** Em IPv6
   uma máquina tem um /64 para alternar: as esperas do início de aparelho,
   do e-mail, dos links e das passkeys são contornadas, os mapas em memória
   (o limitador, os códigos de aparelho pendentes) crescem até a limpeza
   (uma hora, dez minutos), e a caixa de e-mail de uma pessoa pode ser
   inundada de links de entrada e de senha nova, limitados só pelo endereço
   de quem envia. **Fechada: 33878fb** — chave pelo /64 (um endereço IPv4
   inteiro); as esperas guardam 100 000 chaves, os códigos de aparelho, os
   links de entrada e as cerimônias de passkey 10 000 cada, saindo
   primeiro o décimo mais antigo. Uma caixa de e-mail continua limitada só
   pelos /64 de quem envia: uma espera pelo endereço de destino não foi
   construída.
8. **Sem tempos limite de HTTP nem teto de conexões no listener** (não
   verificado: nenhum é configurado em `lib.rs`; se os padrões do
   `axum::serve` dão tempo limite a um cabeçalho lento não foi conferido).
   Atrás do Caddy ou do `tailscale serve` o proxy responde a isso; um
   servidor com o próprio TLS fica exposto. **Fechada: e3360e1** —
   conferido: o `axum::serve` não define timer, então o hyper não aplicava
   prazo. Cada conexão agora é servida pelo builder HTTP/1 do hyper com
   um: cabeçalhos 30 s, uma requisição 60 s; 512 conexões, 128 por
   endereço, contadas antes do handshake TLS.
9. **A lixeira não tem limite até o ADR 0080 ser construído.** Os
   apagamentos vão para o `.trash/`, que a varredura e a cota não contam,
   ainda sem retenção: quem escreve pode escrever e apagar em laço e encher
   o disco da máquina além da cota. O item 8 do ADR 0080 decidiu a guarda.
   **Fechada: 8ad89d2, 9c10495, 02903f1, 173cf7e, f3edc42** — o ADR 0080
   construído na noite de 2026-10-11 para 12: a lixeira expira (30 dias
   por padrão), e a lixeira de uma pasta maior que a cota dela tem as
   entradas mais antigas expiradas antes, dito na página da pasta (item 8).
10. **Uma revisão externa deste modelo**, como o modelo pediu em
    2026-10-09; o ADR 0073 pede segurança "por inteiro". **Continua
    aberta:** depois das lacunas acima.

**MENOR**

11. **A presença pode alegar outro nome.** `collab_awareness` é repassado
    opaco; o servidor não carimba a conta de quem enviou, então o cursor de
    um membro pode vestir o nome e a cor de outro. **Fechada: 3bc56ae** —
    o servidor lê cada atualização de presença, põe no `user` de cada
    estado o nome da conta de quem enviou e uma cor `#rrggbb` (a primeira
    da janela, senão), e descarta um cliente Yjs pelo qual outra conta
    fala (no máximo 8 por conexão); bytes malformados, e a presença de uma
    janela fora da sala, são recusados (o mantenedor, 2026-10-12: "temos
    que ser seguros desde o dia 0").
12. **Phishing pelo código de aparelho.** Quem inicia um código escolhe o
    nome do aparelho que a página de aprovação mostra; uma pessoa que
    recebe um link pode aprovar o aparelho de um estranho na própria conta.
    A página não mostra endereço nem hora do pedido. **Fechada: 5838c10**
    — o código pendente guarda o endereço e a hora de onde foi pedido; a
    página os mostra com o nome do aparelho em *Quem pediu*, e então
    pergunta *Foi você quem pediu, neste aparelho?* antes de *Aprovar este
    aparelho: <nome>* e *Não fui eu: recusar*; recusar acaba com o código.
    O nome continua o de quem pediu: o endereço e a hora são o que
    denunciam o pedido de um estranho.
13. **O banco do servidor é criado com o umask do processo.** O índice do
    desktop e o `servers.json` são `0600`; `server.sqlite` e
    `VERSO_DATA_DIR` não recebem modo nenhum do servidor (não verificado
    por pacote: o contêiner roda com o próprio usuário; a unidade do
    systemd não define `UMask` nem `StateDirectoryMode`). Outro usuário
    local da máquina poderia ler os hashes. **Fechada: b8badc7** —
    `server.sqlite` e os arquivos de journal dele `0600` a cada abertura
    (`verso_fs::server::owner_only`); o diretório mantém o modo que a
    máquina lhe deu.
14. **`/f/` não envia `Cross-Origin-Resource-Policy`.** O `SameSite=Lax`
    já deixa o cookie fora da requisição de sub-recurso de outro site;
    `same-origin` diria isso duas vezes. **Fechada: b8badc7.**
15. **`/api/state` diz a versão exata a qualquer um.** Útil para a janela
    antes do login; também para quem casa uma versão com um aviso de
    segurança. **Fechada: b8badc7** — dita só para quem está dentro; a
    página de login não usava nem a versão nem o contrato.
16. **A troca de senha confere a senha atual na thread do runtime
    assíncrono**, quando o login leva o Argon2id para o pool de bloqueio.
    **Fechada: b8badc7.**
17. **No Windows o arquivo do token de aparelho não recebe restrição
    própria** (`private()` não define nada fora do Unix); o que o protege
    são as permissões do perfil. **Continua aberta:** nenhuma restrição é
    barata — a ACL de um arquivo se define pela API do sistema, que pede
    `unsafe` (proibido, CLAUDE.md §2), ou pelo `icacls` num subprocesso;
    as permissões do próprio perfil (a pessoa, SYSTEM, os administradores)
    o mantêm enquanto isso.

## Lacunas antes do anúncio

Os `[ABERTO]` do próprio modelo, mantidos abertos. Cada um traz uma
resposta recomendada — uma recomendação, não uma decisão; quem decide é o
mantenedor.

- `[ABERTO]` Uma revisão do sanitizador do HTML das notas contra membros
  hostis. *Recomendação:* antes do primeiro usuário de fora, uma revisão
  pelo modelo que não escreveu o `sanitize.ts` (ADR 0032), com uma bateria
  de HTML hostil em `app/ui/test/` que fique como guarda: mutation XSS no
  caminho pelo `cleanHtmlText`, SVG e MathML, `id` sobrescrevendo globais
  da janela, os atributos `data-*` sobre os quais a janela age
  (`data-target`, `data-task-line`), estilo inline posto sobre a janela, a
  porta das incorporações, e os outros renderizadores do conteúdo de uma
  nota (Mermaid, KaTeX, PDF.js, o Excalidraw do board). *Feito em
  2026-10-11 (c7f8c8d), pela Opus 5.5:* a revisão linha a linha e a
  bateria, que fica como guarda no `npm test`; deixado `[ABERTO]` para o
  mantenedor: a revisão pelo modelo que não escreveu o `sanitize.ts`, os
  outros renderizadores, e a porta e a bateria rodadas num navegador.
- `[ABERTO]` Histórico e recuperação da mudança ou da remoção feita por
  outro membro. *Recomendação:* o ADR 0080 (a lixeira, e a versão que a
  escrita de um aparelho substituiu) responde aos apagamentos e aos
  aparelhos para o primeiro usuário de fora; a edição de um membro dentro
  de uma sala fica `[ABERTO]` para um ADR próprio, como o roadmap diz, e a
  documentação diz até lá que um membro com escrita pode mudar o texto de
  outro.
- `[ABERTO]` Um limite de taxa além dos logins. *(Cotas por pasta: ADR 0077
  item 5, construído em 2026-10-10; por conexão: 8 requisições, uma fila de
  1024 mensagens, pings, construídos em 2026-10-11, b56c538.)*
  *Recomendação:* antes do primeiro usuário de fora, as lacunas 2 a 5: um
  tempo limite de envio, a fila limitada em bytes, um teto de conexões por
  conta e no servidor, a cota conferida no primeiro pedaço de um envio; os
  números medidos na máquina de 1 núcleo e 1 GB das notas de instalação do
  servidor. *Construído em 2026-10-11:* as lacunas 2, 3, 4 e 8 (os commits
  delas acima); a lacuna 5 em 2026-10-12 (2b1f2c4); os números são
  raciocinados, não
  medidos naquela máquina. Deixado `[ABERTO]` para o mantenedor.
- `[ABERTO]` O token de aparelho do desktop no chaveiro do sistema em vez
  de um arquivo `0600`. *Recomendação:* depois do primeiro usuário de fora,
  registrado como adiado: o token é revogável nos Ajustes e no console, e o
  chaveiro é diferente em cada um dos três sistemas.
- `[ABERTO]` O transporte do MCP e sua autorização pela rede.
  *Recomendação:* nenhum MCP pela rede para o primeiro usuário de fora; um
  token de acesso pessoal segue sendo a entrada de um programa até o item
  11 do ADR 0073 ser respondido num ADR próprio.
- Uma revisão externa deste modelo, como o ADR 0073 pede da segurança do
  servidor "por inteiro". *Recomendação:* depois de fechadas as lacunas
  BLOQUEANTES e IMPORTANTES acima, para que a revisão leia o servidor como
  ele vai ser lançado.
