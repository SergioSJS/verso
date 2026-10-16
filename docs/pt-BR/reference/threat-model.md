# O modelo de ameaças do servidor (2026-10-09, atualizado em 2026-10-11 e 2026-10-13)

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

**Veja a revisão de 2026-10-13 e o ADR 0083.** Em 2026-10-13, a pedido do
mantenedor, Fable 5.1 leu o servidor de novo contra o HEAD af4d73a com
bots, abuso e ataques de fora em mãos, e o sondou numa porta de loopback:
[`security-review-2026-10-13.md`](security-review-2026-10-13.md) (achados
F1 a F23, nenhum BLOQUEANTE, dez IMPORTANTES — um sign-in falho sem linha
de log para fail2ban ou CrowdSec, nenhum teto ou aviso sobre palpites, uma
senha conferida só pelo tamanho, a recuperação deixando tokens vivos, um
endereço de proxy confiável só, as entradas do servidor sem fuzzing,
advisories do npm não conferidos, nenhum canal de divulgação, a revisão
de fora ainda aberta, um backup em claro) e o
[ADR 0083](../adr/0083-security-hardening-of-universo.md) (as
medidas, os números, os guardrails e a ordem do trabalho). O ADR foi
aceito em 2026-10-13 e construído no mesmo dia, numa rodada só: os itens 1
a 15 e 17 estão construídos, com a leitura do sanitizador do item 16 e a
bateria dele rodada no WebKit e no Chromium, e a seção "Como construído"
dele diz onde o código se afasta do texto; o pentest do item 16 por uma
pessoa de fora do projeto continua condição do anúncio. Das lacunas
abaixo, o resto da lacuna 7 (uma caixa de e-mail inundada) está fechado
pelo item 8 (cb05804), e a lacuna 10 é respondida em parte pelo item 16
(a leitura do sanitizador feita, o pentest pendente). O que a revisão
achou é novo, não uma correção do que estava escrito aqui.

**Atualizado em 2026-10-13 contra o 0b5fea1** do `docs/security-hardening`:
a superfície de ataque e as linhas de ameaça abaixo dizem as medidas do
ADR 0083 como construídas, cada uma com o seu item; os commits estão na
seção "Como construído" do ADR e na tabela de achados da revisão.

**Veja a segunda revisão de 2026-10-13 (noite).** Depois de construídos
os itens 1 a 17 do ADR 0083, uma sessão de Opus 5.5 que não escreveu nada
do código leu o servidor de novo no e699b57, só lendo, supondo um atacante
que leu o código público: [`security-review-2026-10-13.md`](security-review-2026-10-13.md),
seção 10 (achados S1 a S25: três BLOQUEANTES, todos vazamentos entre
pessoas que compartilham uma pasta; doze IMPORTANTES; dez MENORES). Os 25
foram fechados na mesma rodada (ADR 0083, Como construído, "A segunda
revisão"). **Atualizado contra o c2454064**: as linhas abaixo que uma
correção mudou dizem isso, com o commit dela.

## O que é protegido

| Bem | Onde | Por que importa |
|---|---|---|
| As notas e os anexos | as pastas sob `VERSO_FOLDERS_DIR` | o que a pessoa escreveu; uma pasta pode ser compartilhada por várias pessoas |
| O que foi apagado | o `.trash/` de cada pasta, no servidor e num computador que sincroniza | um apagamento feito por outro membro ou por um aparelho só se recupera daqui até o ADR 0080 |
| Contas e hashes de senha | `server.sqlite` em `VERSO_DATA_DIR` | hashes Argon2id; um roubado é atacado offline |
| Sessões, sessões de aparelho, tokens de acesso pessoal, links de uso único | o mesmo banco, só como SHA-256; links de entrada por e-mail e códigos de aparelho pendentes na memória | cada um abre uma conta até terminar |
| Credenciais de passkey | o mesmo banco | chaves públicas e contadores; nenhum segredo |
| O registro de auditoria e o registro de mudanças de cada pasta | o mesmo banco; as linhas do registro de auditoria guardadas `VERSO_AUDIT_DAYS` dias, 365 por padrão (ADR 0083 item 10) | quem fez o quê, de qual aparelho; a prova de um membro |
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
7. Quem escreve uma nota → quem a lê: os blocos secretos da nota (ADR
   0087). Quem só pode ler uma nota recebe a projeção dela — as linhas dos
   seus callouts `> [!secret]` tiradas, `verso_dialect::project` — em toda
   saída que tem.

## A superfície de ataque no HEAD

Toda conexão primeiro ocupa um lugar — 512 no servidor, 128 por endereço
(um /64 de IPv6 conta como um; esta máquina e os proxies confiáveis não
são contados) — antes de um handshake TLS ou de um byte de HTTP ser lido, e o
mantém até o fim, o de um WebSocket também; uma requisição ocupa então
um lugar entre as 32 em andamento do seu endereço, o endereço percorrido
além dos proxies confiáveis (429 depois disso; uma conexão direta desta
máquina não contada; 33574fe5). Os cabeçalhos de uma requisição têm 30 s,
a espera pela próxima numa conexão mantida viva incluída; uma requisição
tem 60 s e o corpo dela 10 s (408 depois de qualquer um; 33574fe5); a
cabeça de uma requisição tem 64 KiB no máximo (431 depois disso, ADR 0083
item 8). Toda requisição passa primeiro pela checagem do `Host`
(421 se não) e recebe depois os cabeçalhos do servidor: `nosniff`,
`no-referrer`, `SAMEORIGIN`, `Cross-Origin-Opener-Policy`, uma
`Permissions-Policy`, HSTS com `includeSubDomains` em HTTPS e, fora de
`/f/`, a política da própria janela (em `/f/`,
`Cross-Origin-Resource-Policy: same-origin`) — o conjunto inteiro
conferido, nome e valor (ADR 0083 item 9). Um corpo da API REST tem 1 MB
no máximo. Toda rota sob `/api/` segue um ritmo por endereço, 20 por
segundo e 100 de uma vez, 429 com `Retry-After` além dele; só uma conexão
direta desta máquina fica fora do ritmo (ADR 0083 item 7). Toda espera
"por endereço" abaixo usa como chave um endereço IPv4 inteiro e um IPv6
pelo seu /64, sendo o endereço o da conexão ou, atrás de um proxy
confiável, a entrada mais à direita do `X-Forwarded-For` que não é um
proxy confiável (ADR 0083 item 5); os mapas que estranhos enchem são
limitados — 100 000 chaves cada para as esperas e o ritmo REST, e 10 000
cada de códigos de aparelho, links de entrada e cerimônias de passkey —
saindo primeiro o décimo mais antigo, e um endereço mantém no máximo 8
esperando em cada um desses três (91e3e0af). Um segredo enviado por HTTP simples de outra
máquina é lido como qualquer outro desde 2026-10-16 (ADR 0073 item 6,
alterado): veja a linha "Uma senha ou um token lido no fio" abaixo. "Origin" abaixo é o `Ctx::changes()`: a mudança de um
navegador leva um `Origin` que confere e o token CSRF da sessão; um bearer
(um token ou um aparelho) não leva nenhum dos dois; sem sessão, só o
`Origin`. "A pessoa" é o `Ctx::person()`: um navegador ou um aparelho
dentro como ela, nunca um token. "Admin" é o `Ctx::admin()`: a sessão de
navegador ou de aparelho de um admin, nunca um token.

| Superfície | Quem pode chamar | O que confere | O que limita | O que registra |
|---|---|---|---|---|
| `GET /api/state`, as páginas, os arquivos da janela | qualquer um; a versão do servidor e a do contrato só para quem está dentro | `Host` | a página nunca vai para cache; `/api/state` no ritmo REST | nada |
| `POST /api/signin` | qualquer um, em TLS | Origin | uma espera que cresce por endereço e por conta (`in:`): 3 livres, depois 1 s dobrando até 60 s, esquecida depois de uma hora; os sign-ins recusados do servidor dividem um bucket, 4 por segundo e 20 de uma vez, e todo sign-in espera a dívida dele, nunca mais que 2 s; 20 recusas numa hora avisam a conta por e-mail, uma vez por dia no máximo (ADR 0083 item 2); todo Argon2id num dos lugares do servidor, dois por núcleo (dois no mínimo), 503 depois de esperar 5 s, e uma tentativa em andamento por chave de entrada, 429 depois de 10 s (8d3982b3) | auditoria `sign_in`, falha ou não, e `sign_in_noticed`; uma recusa é uma linha `WARN sign-in failed` do log do servidor, que o filtro do fail2ban entregue lê (ADR 0083 item 1) |
| `POST /api/passkey/start`, `/finish` | qualquer um, em TLS | Origin; WebAuthn com verificação do usuário; a cerimônia 5 minutos na memória | uma espera por endereço (`pk:`), todo início contado, 8 cerimônias esperando por endereço (91e3e0af); o fim espera a dívida de sign-in do servidor (ADR 0083 item 2) | auditoria `sign_in_passkey`; uma recusa, uma linha `WARN sign-in failed` |
| `POST /api/signin/link`, `POST /api/forgot` | qualquer um, só quando o servidor tem servidor de e-mail | Origin | uma espera por endereço (`mail:`) e pelo endereço que recebe o e-mail (`mail:<e-mail>`, ADR 0083 item 8), toda requisição contada; respondida antes de o endereço ser procurado — o link, o e-mail e a linha de auditoria vêm depois da resposta; um link de entrada vive 15 minutos, na memória, 8 esperando por endereço, além dos quais nenhum é feito (91e3e0af) | auditoria `signin_link_sent`, `reset_link_mailed` quando o endereço tem conta |
| `GET`/`POST /api/signin/link/{token}` (o `GET` nomeia a conta do link sem usá-lo; a página só manda o link num clique, 5af9de2c), `GET`/`POST /api/invite/{token}`, `GET`/`POST /api/reset/{token}`, `POST /api/setup` | quem tem o link | Origin no `POST`; o hash do link, uso único, validade (configuração 1 hora, convite 7 dias, senha nova 24 horas); configuração só enquanto não há conta; uma senha nova que não esteja entre as mais comuns nem seja o e-mail da conta (ADR 0083 item 3) | uma espera por endereço num link errado (`link:`) | auditoria `sign_in_link`, `invitation_used`, `password_reset`, `setup` |
| `POST /api/device/start` | qualquer um, em TLS | nada mais | todo início contado por endereço (`device:`), a mesma espera; um código vive 10 minutos; 8 esperando por endereço, 429 além deles (91e3e0af) | nada |
| `POST /api/device/poll` | quem tem o segredo de consulta (256 bits) | o hash do segredo, comparado em tempo constante | um segredo errado ou um código desconhecido contado na espera `device:` do endereço, e esperando-a; o segredo certo respondido seja qual for essa espera (ADR 0083 item 8); a dívida de sign-in do servidor (item 2) | um segredo errado, uma linha `WARN sign-in failed`, `for -` (ADR 0083 item 1) |
| `POST /api/device/describe`, `/approve`, `/refuse` (nenhuma rota pega o código do endereço desde 2026-10-14) | quem está dentro; aprovar só de uma sessão de navegador | Origin (aprovar); uma prova recente, de dez minutos, antes de aprovar, conferida antes de o código ser lido (ADR 0083 item 6) | o código: 10 minutos, uma vez; informado pela pessoa a partir da tela do app, nunca tirado de um link (decidido em 2026-10-14), comparado em tempo constante com todo código pendente atrás da espera `device:` do endereço, um errado contado, um certo sem zerá-la (ADR 0083 item 17); a sessão que a aprovação cria nasce sem prova (463ed1ad) | auditoria `device_approved` |
| `/api/me`, `/api/me/*` | a pessoa (perfil, senha, sessões, ajustes, passkeys); um token só se cria num navegador; um aparelho só renomeia a si mesmo | Origin; a senha atual para uma nova, que não esteja entre as mais comuns (ADR 0083 item 3); uma prova recente, de dez minutos, para um token, uma passkey acrescentada ou retirada e a troca de senha, feita por `POST /api/me/prove` ou `/api/me/prove/passkey`, nunca com um token (ADR 0083 item 6) | a troca de senha por conta (`in:`), o Argon2id dela num dos lugares do servidor (8d3982b3); ajustes 256 KB; nomes 200 caracteres | auditoria `password_change`, `session_ended`, `sessions_ended`, `token_created`, `token_revoked`, `passkey_added`, `passkey_removed`, `device_renamed`; uma mudança de perfil ou de ajustes não é auditada |
| `/api/folders`, `/api/folders/{id}/*` | quem está dentro; criar: uma conta autorizada, nunca um token; membros e a auditoria da pasta: o dono da pasta | Origin; o papel na pasta, 404 quando não há; uma prova recente para um dono dar ou mudar o papel de um membro ou de um compartilhamento (ADR 0083 item 6) | — | auditoria `folder_created`, concessões, `revoke` |
| `/api/admin/*` | admin | Origin nas mudanças; uma prova recente, de dez minutos, para apagar uma conta, mudar poderes, encerrar as sessões de outro, entrar numa pasta, um link de senha nova para outra conta (ADR 0083 item 6) e um convite que leve uma pasta ou um compartilhamento (3d79d9ad) | toda lista paginada no servidor (50 linhas) | auditoria de toda mudança (`account_created`, `powers_*`, `account_deleted`, `account_sessions_ended`, `reset_link`, convites, `folder_adopted`, `admin_self_grant_*`, `folder_quota`); leituras não são auditadas |
| `GET /f/{folder}/{*path}` | um leitor da pasta ou mais; um token dentro das pastas dele | TLS; o papel, a cada requisição; o confinamento de caminhos do núcleo | `Content-Security-Policy: sandbox`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`; mandado 256 KiB por vez, nunca inteiro na memória, um `Range` só respondido 206 (74bf5b51) | nada |
| `GET /api/ws`, o contrato | um navegador (só com `--web`, `Origin` conferido antes de aceitar o cookie), um aparelho, um token | TLS; a sessão ou o token vivo antes de cada comando; o papel na pasta antes de o núcleo agir; as pastas e a escrita de um token; uma versão de sync mais velha que a anterior recusada para `sync_*` | 48 MB por mensagem para um envio, 32 MB para um comando que leva o texto de uma nota ou de um board, 1 MB para qualquer outro, julgado pelo nome antes de ser interpretado; mensagens e respostas acima de 1 MB dividem 128 MB do servidor, recusadas além disso (f7917083); 8 requisições em andamento, além das quais a conexão não é lida; uma fila de 1024 mensagens e 64 MiB de envios, cheia = fechada; cada escrita em 30 s mais o tamanho dela a 32 KiB/s, senão fechada; um ping a cada 30 s, fechada depois de 2 sem resposta; 32 conexões por conta e 64 por endereço, 429 além disso; cada comando no ritmo da conta (100 por segundo, 400 de uma vez; um `sync_read` tem o seu, 1 000 e 4 000) e no do servidor (1 000, 2 000), esperando a vez além dele; as linhas de log de uma janela, 60 por minuto | o log do servidor: uma mudança de sync recusada, uma conexão lenta ou calada fechada, uma versão de sync recusada; o registro de mudanças de cada pasta nomeia a conta e o aparelho de cada escrita |
| — comandos da pasta | a pasta da janela, aberta por `open_server_folder` ou `reopen_folder` | um comando de escrita pede editor ou dono e uma credencial que escreve; os bytes de uma escrita conferidos contra a cota antes, o crescimento dela reservado ali até chegar (eff8dd87) | a cota (ADR 0077 item 5); um texto lido ou escrito com 16 MB no máximo, julgado antes de ser lido (68745a92) | o registro de mudanças |
| — `collab_*` (notas, arquivos de texto e boards compartilhados, ADR 0082 item 12) | membros da pasta | o caminho de uma sala é o confinado, uma sala por arquivo (d12036a4); `collab_update`, `_save`, `_resolve` e `_canvas` pedem quem escreve; uma atualização Yjs malformada recusada, e antes de o yrs ler uma, recusada a atualização que declara mais do que tem de bytes, aninha além de 64 níveis, tem uma sequência ou uma deleção de comprimento 0 ou um relógio além de `u32::MAX`, ou cria ou apaga itens do próprio cliente Yjs da sala à frente da sala; as atualizações de uma conexão tomadas na ordem em que foram mandadas, uma que deixa algo pendente recusada; um pânico do yrs pego, a atualização recusada e a sala refeita a partir do arquivo; o que o `join` manda e o que a escrita de um board diz aplicados antes num documento de rascunho (ADR 0083 item 14); o arquivo de um board (`collab_canvas`) só é gravado quando é exatamente do estado que a sala tem, pelo gravador de boards do núcleo, sobre a revisão lida | a presença (`collab_awareness`) com 16 KB no máximo, de uma janela na sala, carimbada com o nome da conta de quem enviou e só os clientes Yjs dela (lacuna 11); uma rolagem de dados (`collab_roll`, ADR 0088 item 4), de uma janela na sala, também de quem só lê: o servidor lê a notação ele mesmo — 200 caracteres, 20 termos, 100 dados, 1000 faces no máximo — e rola com o gerador do sistema, a tabela que ela nomeia um link de 512 bytes numa linha, a rolagem carimbada com o nome da conta de quem enviou; a sala guarda as últimas 20 na memória, nada escrito; uma sala de nota: uma atualização de 4 MB no máximo (ADR 0083 item 8), a sala 64 MB (5274f9d4); uma janela em 64 salas no máximo (5274f9d4); uma atualização de uma janela em voo por sala, o que é digitado enquanto isso juntado na próxima (item 14); uma sala de board: uma atualização de 4 MB e 10 000 entradas no máximo, a sala com 100 000 entradas e 64 MB, um arquivo entregue a ela de 16 MB (`collab_board.rs`), além disso recusado; o que é repassado conta nos 64 MiB de envios de cada destinatário | o log do servidor: uma atualização que a sala não conseguiu integrar, com o id da conta (ADR 0083 item 14) |
| — `sync_*` | um aparelho (qualquer credencial pode perguntar) | uma escrita, um apagamento ou uma mudança de nome pede quem escreve, nomeia o hash de base e é recusada quando o arquivo mudou; um apagamento vai para o `.trash/`; a cota sobre o arquivo inteiro | pedaços de 1 MiB, lidos do disco e gravados num arquivo temporário à medida que passam, um na memória por transferência (2b1f2c4); 2 transferências em cada sentido por conexão, descartadas depois de 120 s paradas e quando a conexão acaba, e com elas o arquivo temporário de um envio; 1 GiB por arquivo; o tamanho declarado de um envio reservado na cota desde o primeiro pedaço até chegar ou ser largado (eff8dd87), e julgado de novo no último; uma varredura no máximo uma vez por minuto | o log do servidor para uma recusa que não seja "mudou" |
| — `render_markdown`, `board_text`, `log_write`, `capabilities` | quem está dentro | — | o parser passa por fuzzing e pela checagem de tempo linear; linhas de log uma linha cada, 2000 caracteres | o log do servidor (`log_write`) |
| O feed de releases | o servidor, de saída | — | uma vez por dia; nenhum redirecionamento seguido (ADR 0083 item 8); só a versão no `User-Agent`; `VERSO_UPDATE_TOKEN` quando o repositório é privado; `VERSO_UPDATE_CHECK=off` | uma linha quando falha |
| O servidor de e-mail de quem hospeda | o servidor, de saída, quando `VERSO_SMTP_URL` está definido | — | o que as rotas de e-mail acima permitem | uma linha quando o envio falha |

## Ameaças e o que responde a elas

### Chegar ao servidor

| Ameaça | Resposta como construída |
|---|---|
| Uma senha ou um token lido no fio | **O HTTP simples é servido** (o mantenedor, 2026-10-16, ADR 0073 item 6 alterado): por HTTP, quem está na mesma rede lê a senha, a sessão e as notas. É um risco residual aceito para uma rede de casa e errado num Wi-Fi público; a janela diz isso (página de entrada, Ajustes, um aviso por sessão) e desliga o que precisa de contexto seguro. Por HTTPS — o TLS do próprio servidor (`VERSO_TLS_CERT_FILE`), ou o de um proxy aceito (`X-Forwarded-Proto: https`, que sozinho decide) — o cookie de sessão é `Secure` e `__Host-`, e o HSTS, com `includeSubDomains`, é enviado. |
| Cabeçalhos encaminhados forjados para parecer seguros | Só são aceitos vindos de um endereço ou faixa do `VERSO_TRUSTED_PROXY`, uma lista; o endereço do cliente é a entrada mais à direita do `X-Forwarded-For` que não é um proxy confiável, andando para a esquerda; o cabeçalho de um par não confiável é ignorado, e um proxy confiável que não encaminha nenhum é servido como ele mesmo, dito no log uma vez por minuto quando o proxy foi nomeado (ADR 0083 item 5). Um `VERSO_TRUSTED_PROXY` vazio aceita o loopback e as redes privadas (2026-10-16): um cliente da rede de casa pode forjar o `X-Forwarded-For` e ser cadenciado sob o endereço que escreve, o que embota o ritmo por endereço mas não o atraso da própria conta. O `X-Forwarded-Proto` é aceito de qualquer proxy confiável, sem percurso. Um par de loopback que não é proxy confiável e manda `X-Forwarded-For` é dito no log uma vez por minuto, e também, na subida, um endereço `https://` servido em loopback sem TLS próprio nem proxy confiável (1a33435e). Um proxy confiável em `127.0.0.1` acredita em todo programa local que se conecta à porta; o guia de instalação diz como um host compartilhado deixa a porta só para o usuário do proxy (19ab906e, não rodado). |
| DNS rebinding: um site resolvendo o próprio nome para o servidor | O cabeçalho `Host` precisa ser o do endereço público ou um nome de loopback — `localhost`, `127.0.0.1` ou `[::1]`, comparado inteiro: `[::1]` seguido de qualquer coisa passava, achado pelo fuzzing do item 14 do ADR 0083 (fec23f4); senão, 421. Os links que o servidor manda por e-mail e escreve são montados a partir de `VERSO_PUBLIC_URL`, nunca do `Host` de uma requisição. |
| Um servidor que se anuncia na rede, e um anúncio forjado | Além do loopback o servidor anuncia `_verso._tcp` por mDNS só nas interfaces privadas e únicas-locais: a versão, se fala TLS, um id aleatório e o endereço público quando `VERSO_PUBLIC_URL` está definida — nenhum nome de computador, pasta ou conta; `VERSO_ANNOUNCE=off` desliga (ADR 0097). O anúncio não é autenticado, então o app desktop só **lista** o que acha enquanto Ajustes › Servidores está aberto (no máximo 50, nomes cortados, endereços inutilizáveis descartados), mostra o endereço, e não conecta a nada nem envia nada até a pessoa clicar; um forjado, no pior caso, oferece um endereço errado (um IP, ou um `url` que escolheu) que a pessoa vê antes de clicar; o clique inicia uma aprovação de aparelho naquele endereço, que fica sabendo o nome do aparelho e não leva credencial. |
| Uma resposta de DNS ruim levando o app ao host errado, ou a resposta de outro resolvedor confiada demais | **Novo com o ADR 0097**, e uma exposição nova de verdade, limitada: quando uma conexão a um servidor falha, o desktop pergunta o nome a cada servidor DNS global do sistema (UDP, porta 53, sem autenticação) e tenta os outros endereços depois dos do sistema. Para um servidor `https` o certificado é conferido para o nome da URL, então um endereço errado não leva o token; o esquema nunca muda. Para um servidor `http` o token iria às claras para o que responder, então os endereços de outro resolvedor só valem quando numa rede em que esta máquina está (dentro da sub-rede de uma de suas interfaces — nunca a faixa 100.64.0.0/10 do CGNAT como tal, nunca loopback), e não valem quando o sistema disse que o nome não existe. Um endereço que funcionou só é reordenado entre os endereços que a resolução atual devolveu (a rede de um café não é mandada ao endereço de casa), e um que falhou vai para o fim. As consultas vão aos resolvedores do próprio sistema e só depois de uma falha. O erro nomeia os endereços tentados. |
| Escutar além de loopback por engano | Recusado na subida sem `VERSO_PUBLIC_URL`; o padrão é `127.0.0.1`. |
| Uma senha ou um token lido no fio | **O HTTP simples é servido** (o mantenedor, 2026-10-16, ADR 0073 item 6 alterado): por HTTP, quem está na mesma rede lê a senha, a sessão e as notas. É um risco residual aceito para uma rede de casa e errado num Wi-Fi público; a janela diz isso (página de entrada, Ajustes, um aviso por sessão) e desliga o que precisa de contexto seguro. Por HTTPS — o TLS do próprio servidor (`VERSO_TLS_CERT_FILE`), ou o de um proxy aceito (`X-Forwarded-Proto: https`, que sozinho decide) — o cookie de sessão é `Secure` e `__Host-`, e o HSTS, com `includeSubDomains`, é enviado só para o TLS do próprio servidor ou um `VERSO_PUBLIC_URL` `https://`. Cookies não são separados por porta: por HTTP o cookie `verso-session` vai a todo outro serviço HTTP do mesmo host ou IP — no CasaOS ou no ZimaOS todo outro app em `http://<ip>:<porta>` recebe o token de sessão, e pode definir um; o `__Host-` por HTTPS fecha isso. |
| Cabeçalhos encaminhados forjados para parecer seguros | Só são aceitos vindos de um endereço ou faixa do `VERSO_TRUSTED_PROXY`, uma lista; o endereço do cliente é a entrada mais à direita do `X-Forwarded-For` que não é um proxy confiável, andando para a esquerda; o cabeçalho de um par não confiável é ignorado, e um proxy confiável que não encaminha nenhum é servido como ele mesmo, dito no log uma vez por minuto quando o proxy foi nomeado (ADR 0083 item 5). Um `VERSO_TRUSTED_PROXY` vazio aceita o loopback e as redes privadas (2026-10-16): um cliente de uma rede privada, ou no Docker qualquer visitante de uma porta publicada (o docker-proxy conecta do gateway da ponte, em 172.16.0.0/12), pode escrever o `X-Forwarded-For` e ser contado sob qualquer endereço; um `127.0.0.1` encaminhado é contado como qualquer outro, e só um socket de loopback que não encaminhou nada fica isento do ritmo, do teto de requisições em andamento e do de WebSockets. Um atacante que gira endereços forjados derrota os limites por endereço; o atraso da própria conta e o bloqueio valem. Nomeie os proxies de verdade no `VERSO_TRUSTED_PROXY`, ou escreva `none`, para fechar isso. O `X-Forwarded-Proto` é aceito de qualquer proxy confiável, sem percurso. Um par de loopback que não é proxy confiável e manda `X-Forwarded-For` é dito no log uma vez por minuto. Um proxy confiável em `127.0.0.1` acredita em todo programa local que se conecta à porta; o guia de instalação diz como um host compartilhado deixa a porta só para o usuário do proxy (19ab906e, não rodado). |
| Uma senha ou um token lido no fio | **O HTTP simples é servido** (o mantenedor, 2026-10-16, ADR 0073 item 6 alterado): por HTTP, quem está na mesma rede lê a senha, a sessão e as notas. É um risco residual aceito para uma rede de casa e errado num Wi-Fi público; a janela diz isso (página de entrada, Ajustes, um aviso por sessão) e desliga o que precisa de contexto seguro. Por HTTPS — o TLS do próprio servidor (`VERSO_TLS_CERT_FILE`), ou o de um proxy aceito (`X-Forwarded-Proto: https`, que sozinho decide) — o cookie de sessão é `Secure` e `__Host-`, e o HSTS, com `includeSubDomains`, é enviado só para o TLS do próprio servidor ou um `VERSO_PUBLIC_URL` `https://`. Cookies não são separados por porta: por HTTP o cookie `verso-session` vai a todo outro serviço HTTP do mesmo host ou IP — no CasaOS ou no ZimaOS todo outro app em `http://<ip>:<porta>` recebe o token de sessão, e pode definir um; o `__Host-` por HTTPS fecha isso só contra vizinhos em HTTP simples: cookies ignoram portas, então o cookie ainda chega a outros serviços HTTPS do mesmo host. |
| Cabeçalhos encaminhados forjados para parecer seguros | Só são aceitos vindos de um endereço ou faixa do `VERSO_TRUSTED_PROXY`, uma lista; o endereço do cliente é a entrada mais à direita do `X-Forwarded-For` que não é um proxy confiável, andando para a esquerda; o cabeçalho de um par não confiável é ignorado, e um proxy confiável que não encaminha nenhum é servido como ele mesmo, dito no log uma vez por minuto quando o proxy foi nomeado (ADR 0083 item 5). Um `VERSO_TRUSTED_PROXY` vazio aceita o loopback e as redes privadas (2026-10-16): um cliente de uma rede privada, ou no Docker qualquer visitante de uma porta publicada pelo docker-proxy (uma porta publicada só no loopback, um hairpin, IPv6 sobre uma ponte IPv4, o Docker Desktop, o Docker rootless), que chega do gateway da ponte (172.16.0.0/12; o Docker rootful no Linux, com NAT por iptables, mantém o endereço do cliente), pode escrever o `X-Forwarded-For` e ser contado sob qualquer endereço; um `127.0.0.1` encaminhado é contado como qualquer outro, e só um socket de loopback que não encaminhou nada fica isento do ritmo, do teto de requisições em andamento e do de WebSockets. Um atacante que gira endereços forjados derrota os limites por endereço; o atraso da própria conta e o bloqueio valem. Nomeie os proxies de verdade no `VERSO_TRUSTED_PROXY`, ou escreva `none`, para fechar isso. O `X-Forwarded-Proto` é aceito de qualquer proxy confiável, sem percurso. Um par de loopback que não é proxy confiável e manda `X-Forwarded-For` é dito no log uma vez por minuto. Um proxy confiável em `127.0.0.1` acredita em todo programa local que se conecta à porta; o guia de instalação diz como um host compartilhado deixa a porta só para o usuário do proxy (19ab906e, não rodado). |
| DNS rebinding: um site resolvendo o próprio nome para o servidor | Com `VERSO_PUBLIC_URL`: o nome dele, ou um nome de loopback — `localhost`, `127.0.0.1` ou `[::1]`, comparado inteiro (`[::1]` seguido de qualquer coisa passava, achado pelo fuzzing do item 14 do ADR 0083, fec23f4); senão, 421. Sem ele (2026-10-16): só nomes que uma página pública não consegue fazer resolver aqui — um endereço IP, um nome de uma palavra, `.local`, `.home.arpa` — ou qualquer nome numa requisição que um proxy *nomeado* no `VERSO_TRUSTED_PROXY` encaminhou; a lista padrão não alarga nada, já que uma página reapontada acrescenta o `X-Forwarded-For` sozinha. Os outros nomes recebem 421 dizendo para definir `VERSO_PUBLIC_URL`. Os links que o servidor manda por e-mail são montados só a partir de `VERSO_PUBLIC_URL`, nunca do `Host` de uma requisição: o link de entrada e o "esqueci a senha" são recusados sem ele (um `Host` envenenado mandaria à vítima um link para o servidor do atacante); o link de convite ou de redefinição de um admin usa a sessão do próprio admin. |
| Escutar além de loopback por engano | Não é mais recusado na subida (2026-10-16): o pacote escuta em `127.0.0.1` até o `VERSO_LISTEN` dizer outra coisa, e a imagem Docker em todos os endereços, respondendo por HTTP simples; o log diz uma vez na subida que o HTTP simples funciona, e a janela diz o que fica desligado. |
| Uma conexão mantida aberta para prender o servidor | Toda conexão ocupa primeiro um lugar — 512 no servidor, 128 por endereço — antes do handshake TLS (10 segundos) ou de um byte de HTTP; os cabeçalhos de uma requisição têm 30 segundos e 64 KiB, uma requisição 60, o corpo dela 10; um endereço mantém 32 requisições em andamento, por um proxy também (33574fe5). Um WebSocket recebe um ping a cada 30 segundos e é fechado depois de dois pings sem resposta, e fechado quando uma escrita não é aceita a tempo; uma conta tem até 32 deles, um endereço 64 (lacunas 2, 4 e 8, fechadas). |
| O processo tomando a máquina | O contêiner começa como root só para o entrypoint (ele entrega ao uid 1000 o que o root possui sob `/data` e `/folders` quando o 1000 não grava ali: `find -xdev -user 0`, `chown -h`, nenhum symlink seguido, só sob os dois pontos de montagem, um arquivo com vários hard links deixado em paz; nós de dispositivo, FIFOs e sockets deixados em paz; duas corridas restam, por quem escreve dentro de um ponto de montagem: um diretório trocado por um symlink entre o `find` e o `chown`, ou um arquivo de um nome só listado, renomeado e substituído por um hard link para um arquivo do root fora do ponto de montagem (precisa de `fs.protected_hardlinks=0` ou escrita no alvo); os pontos de montagem são do administrador e é antes de o uid 1000 rodar). O conserto alcança toda a árvore sob cada ponto de montagem (o mantenedor escolheu "pasta inteira, sempre"): um ponto largo demais, como `/DATA` no ZimaOS, entrega ao uid 1000 os arquivos do root de outros apps, e o log conta o que foi entregue), com `CHOWN`, `SETUID` e `SETGID` e mais nada, e o servidor roda como usuário 1000 sem capability alguma (`CapEff` 0, visto no `/proc/1/status`), os comandos de `docker exec` também; o contêiner é declaradorado somente leitura com um `tmpfs` em `/tmp`, todas as capabilities retiradas e `no-new-privileges`; a unidade do systemd roda como `universo` com `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectProc=invisible`, `ProcSubset=pid`, sem capabilities, `SystemCallFilter=@system-service` menos `@privileged` e `@resources`, um conjunto estreito de famílias de endereço e `UMask=0027`; uma pasta é criada `0750` (ADR 0075; ADR 0083 item 11). |

### Entrar e continuar dentro

| Ameaça | Resposta como construída |
|---|---|
| Adivinhar senhas | Argon2id (os primeiros parâmetros do OWASP); uma espera que cresce por endereço e por conta, e um bucket para os sign-ins recusados do servidor, nunca um bloqueio que um estranho possa usar; 20 recusas numa hora avisam a conta por e-mail, uma vez por dia no máximo (ADR 0083 item 2); toda recusa uma linha de log que o filtro do fail2ban entregue lê (item 1) — um endereço IPv4 ou um /64 de IPv6 e nenhuma faixa maior, a jail fechando só http e https, a receita de Docker casando as linhas do contêiner por `_SYSTEMD_UNIT` (270ff4ad); uma tentativa em andamento por conta e por endereço, então tentativas mandadas juntas encontram a espera como uma a uma (8d3982b3); 12 caracteres no mínimo, nenhuma das 10 000 mais comuns de 12 ou mais, nem o e-mail da conta (item 3). |
| Descobrir quem tem conta | Uma senha errada e um e-mail desconhecido são respondidos igual, em tempo parecido (um hash é calculado nos dois casos, para uma conta ainda sem senha também, ab59886d); o início de uma passkey responde igual a um e-mail desconhecido e a uma conta sem passkey, e dá o desafio a uma conta com passkeys — o que diz que o endereço tem passkeys, nunca que existe uma conta sem elas. Um link de entrada e o "esqueci a senha" respondem igual nas palavras e no tempo: a resposta sai antes de o endereço ser procurado (lacuna 6, fechada). |
| Um cookie de sessão roubado | `HttpOnly`, `SameSite=Lax`, `Secure` e `__Host-` em HTTPS; 14 dias parado, 90 no máximo; listado nos Ajustes e encerrado ali; trocar a senha encerra as outras; conferido de novo antes de cada comando de um WebSocket aberto, e as conexões de uma sessão encerrada são avisadas e fechadas na hora. Uma ação sensível — um token, uma passkey, um aparelho aprovado, a senha, os poderes ou o link de senha nova de um admin, um convite do admin que leve uma pasta ou um compartilhamento (3d79d9ad), o papel de um membro — pede uma prova recente, de dez minutos (ADR 0083 item 6). |
| Requisições de outro site | Toda requisição que muda algo confere o `Origin` contra o do servidor e leva o token CSRF da sessão; o WebSocket confere o `Origin` antes de aceitar o cookie. Um link de entrada vindo por e-mail nomeia a conta dele e só é usado num clique (5af9de2c); o `next` da entrada só segue um caminho do próprio servidor (307a648d). |
| Um token vazado de um script | Tokens de acesso pessoal limitados a pastas e a ler ou escrever, nunca mais que o papel do membro; nunca admin, nunca as páginas da própria conta; criados só num navegador; com o prefixo `verso_pat_` para os detectores de segredos; guardados como SHA-256; validade de um ano no máximo, ou nenhuma, dita em vermelho; revogáveis; revogados por uma redefinição de senha, pelo `admin reset`, e por uma troca quando pedido (ADR 0083 item 4). |
| O primeiro admin tomado por quem chegar primeiro | Nenhuma página de configuração aberta a qualquer um: o admin vem do ambiente na primeira subida, ou de um link de configuração de uso único, válido por uma hora, escrito uma vez no log — quem lê o log é quem roda o servidor. Os próximos passos da instalação, o guia e a nota do compose dizem que o link fica no journal e não abre nada depois que o admin existe, e para tirar então o `VERSO_ADMIN_PASSWORD` (19ab906e). |
| Um admin perdido | `universo admin reset <e-mail>` (ou `verso serve admin reset`) na máquina: o acesso à máquina é o último fator; a redefinição fica no registro de auditoria, encerra as sessões da conta e revoga os tokens dela (ADR 0083 item 4). |
| Um link de convite ou de senha nova repassado ou adivinhado | 256 bits, uso único, validade (7 dias, 24 horas), o uso registrado (por quem, quando), encerrável pelo admin antes do uso; tentativas desaceleradas por endereço. |
| Um aparelho aprovado por engano | A página de aprovação mostra o nome do aparelho e o código que o app mostra, o endereço e a hora do pedido, pergunta a uma pessoa já dentro no navegador *Foi você quem pediu, neste aparelho?* e oferece recusar, e a sessão do aparelho é listada e revogável. O nome do aparelho é o que quem pediu enviou; o endereço e a hora são os do servidor (lacuna 12). A página sempre pede o código que o app mostra — copiado pelo app para a área de transferência, colado ou digitado — e nunca pega um do link, então um link que outra pessoa mandou não aprova nada (ADR 0083 item 17; decidido em 2026-10-14, 3e39e23c); aprovar pede uma prova recente (item 6). O nome do aparelho é guardado sem caracteres bidirecionais ou de formatação, fora o ligador de um emoji composto, e dito num `<bdi>` onde aparece (fa44fb19, 0768690d, b5a5bc2f). A sessão que a aprovação cria nasce sem prova, e prova antes de uma ação sensível como qualquer sessão — o app desktop com a senha, quando o servidor pede (463ed1ad, 0e9175de). |
| Um aparelho ou um celular perdido | A pessoa encerra a sessão nos Ajustes; um admin encerra todas as sessões de uma conta e revoga os tokens dela pelo console, as conexões abertas fechadas na hora, com uma linha de auditoria (ADR 0077 item 3, construído). |
| Passkeys | WebAuthn com verificação do usuário exigida (webauthn-rs); o estado da cerimônia vive cinco minutos na memória; contadores guardados. |

### Um membro contra outro

| Ameaça | Resposta como construída |
|---|---|
| Chegar a uma pasta que não lhe foi dada | Todo comando e todo pedido de arquivo confere o papel do membro na pasta antes de o núcleo agir; uma pasta que não se pode ver responde 404. O admin não é exceção: entrar numa pasta é uma permissão dada a si mesmo, no registro que o dono lê. |
| Um leitor escrevendo | Comandos de escrita, a atualização, o salvamento e a resolução de uma nota compartilhada, o envio, o apagamento e a mudança de nome de um aparelho, e os ajustes da pasta são recusados abaixo do papel de editor; a janela esconde o que o papel não pode fazer. Um papel mudado ou retirado chega na hora às janelas abertas do membro. As regras da varredura e o nome da nota de pasta são do dono: a mudança de um editor nos ajustes da pasta os deixa como estavam (38a47289, 3ff9c2b4). |
| XSS armazenado por um anexo (HTML, SVG) | Os arquivos são servidos de `/f/` com `Content-Security-Policy: sandbox` e `nosniff`: um documento feito deles não roda script. |
| XSS armazenado pelo HTML de uma nota | O sanitizador da janela, `app/ui/src/sanitize.ts`, é a fronteira entre membros (ADR 0073 item 6): uma lista permitida de elementos, atributos e classes do renderizador, interpretada num documento inerte; scripts, estilos, formulários e conteúdo estrangeiro descartados; links só para a web, o e-mail e a própria página; uma página incorporada atrás da aprovação da origem pelo leitor; estilo inline mantido, mas nunca fixed ou absolute. A política da própria janela, enviada como cabeçalho, só permite scripts do servidor. O Mermaid roda com `securityLevel: "strict"`; o KaTeX com os padrões dele. O que o sanitizador garante, e a bateria que o mantém nisso: abaixo (lacuna 1, fechada). A revisão pelo modelo que não o escreveu feita em 2026-10-13 (ADR 0083 item 16); o `[ABERTO]` dela deixado para o mantenedor (as lacunas antes do anúncio). |
| Conteúdo remoto revelando quem lê | Imagens remotas e páginas incorporadas seguem o ajuste do próprio leitor, nunca o do autor (a resposta I do mantenedor). As configurações da janela num navegador, as origens de página aprovadas entre elas, dizem de quem são: as de outra conta são descartadas antes de a janela lê-las, e sair as esquece (6df0727f). |
| Symlinks levando para fora de uma pasta compartilhada | Num servidor, um link só é seguido quando leva para dentro da pasta; um que sai é recusado e listado como problema. |
| Uma edição que apaga o texto de outro | A edição simultânea mescla; uma escrita vinda de fora é mesclada linha a linha ou recusada como mudada; uma mudança feita fora enquanto há edições esperando para a sala para as pessoas escolherem. Um board mescla por elemento, a regra do Excalidraw (ADR 0082 item 12): a mudança de um membro num elemento pode vencer a de outro no mesmo elemento — a versão maior — mas nunca toca os elementos dos outros, e apagar é uma lápide que um desfazer depois pode trazer de volta; uma janela que entrega à sala um arquivo falso do board é quem escreve escrevendo, como qualquer escrita. Uma sala por arquivo: o caminho de uma sala é o confinado (d12036a4). `[ABERTO]`: histórico, atribuição e recuperação da mudança de outro membro (ADR 0073). |
| O apagamento do arquivo de outro | Um apagamento vai para o `.trash/` da pasta, da janela e de um aparelho igualmente; ver e restaurar na janela, e a retenção, são o ADR 0080, aceito, em construção. |
| Uma mensagem enorme ou muitas requisições para esgotar a memória | Uma mensagem de WebSocket tem 48 MB no máximo para um envio, 32 MB para o texto de uma nota ou de um board, 1 MB para qualquer outro comando, julgada antes de ser interpretada, e as mensagens e respostas acima de 1 MB dividem 128 MB do servidor (f7917083); um texto é lido ou escrito com 16 MB no máximo no servidor (68745a92); um arquivo em `/f/` é mandado 256 KiB por vez (74bf5b51); o Argon2id roda em poucos lugares ao mesmo tempo (8d3982b3); uma atualização Yjs malformada é recusada, e as contagens e o aninhamento de uma atualização são lidos contra os bytes dela antes de o yrs reservar qualquer coisa (ADR 0083 item 14); uma sala de nota aceita uma atualização de 4 MB no máximo (item 8) e guarda 64 MB, e uma janela fica em 64 salas no máximo (5274f9d4); uma conexão tem no máximo 8 requisições em andamento e uma fila de 1024 mensagens e 64 MiB de envios, fechada quando enche; uma presença tem 16 KB no máximo; uma sala de board aceita uma atualização de 4 MB e 10 000 entradas no máximo e guarda 100 000 entradas e 64 MB, e o arquivo de um board entregue a ela tem 16 MB no máximo (ADR 0082 item 12). Os comandos seguem um ritmo por conta e no servidor, e as conexões são contadas por conta e por endereço (lacunas 3 e 4, fechadas). O espaço de uma pasta é limitado pela cota dela (ADR 0077 item 5): uma escrita que a passaria é recusada e nada é escrito, e escritas em andamento reservam o seu espaço, então duas juntas não passam dela (eff8dd87). |
| Uma atualização que derruba uma sala ou o servidor | As entradas do servidor passam por fuzzing na `main`, 60 s por alvo com `-O` (ADR 0083 item 14): o pedido do WebSocket, um quadro de sync, a atualização Yjs de uma nota e de um board, uma presença, os cabeçalhos `Host` e `Origin`, um tamanho. Um pânico do yrs na fronteira de uma sala é pego, a atualização recusada com uma linha `WARN` que nomeia a conta, e a sala refeita a partir do arquivo: os membros da sala perdem as edições desde a última escrita dela, 900 ms depois da última edição. O que encerrava o processo — um valor aninhado o bastante para estourar a pilha, uma sequência de comprimento 0 que entrava em pânico de novo durante o desempilhamento — é recusado antes de o yrs ler; as atualizações de uma janela são tomadas na ordem em que ela as mandou, então nenhuma espera no caminho de pendências do yrs; o que uma janela que entra e a escrita de um board recebem é aplicado antes num documento de rascunho, e a sala refeita quando não se aplica. |
| Uma presença que mente | O servidor carimba a presença com o nome da conta de quem a enviou, só mantém uma cor que seja uma cor, e deixa uma conexão falar só pelos clientes Yjs dela: o cursor de um membro não veste o nome de outro, nem move ou tira o de outro (lacuna 11). |
| Um leitor chegando ao bloco secreto de uma nota (ADR 0087) | Quem só pode ler — o papel de leitor, um compartilhamento de leitura, um token que só lê — recebe toda nota por uma projeção só (`verso_dialect::project`): os comandos de leitura da pasta por `verso_service::reader::READER_COMMANDS` (um comando de leitura fora dessa lista é recusado a um leitor, e o teste dele falha); busca, links, backlinks, tags, grafo e bases de um índice só, cujo texto secreto é buscado à parte e cujas construções dentro de um bloco secreto são marcadas, as linhas de um leitor numeradas como a projeção as numera; uma nota ao vivo por um documento próprio que guarda a projeção, atualizado quando a sala grava, a presença com nomes e sem cursores, e um leitor no documento da própria sala posto para fora antes que a primeira edição de um bloco secreto chegue a ele; os bytes, os hashes e o registro de mudanças da sincronização são os da projeção, uma mudança só dentro de um bloco secreto não é nenhuma para um leitor, nem aviso; um editor que vira leitor sai das salas em que escrevia. A proteção: `tests_secret.rs` manda todo comando do contrato como leitor e falha com qualquer palavra de um bloco secreto no que ouve (visto falhando com a projeção desligada), ao lado do teste de propriedade do dialeto e da fixture `callout/secret`. Não protegido, de propósito (item 7 da ADR 0087): quem pode escrever a nota, e quem tem o arquivo. Um leitor sabe que uma nota mudou quando a projeção dela mudou. |
| Um leitor chegando ao alfinete secreto de um board (ADR 0090 item 5) | Um nó de um `.canvas` marcado `"verso": {"secret": true}` sai para quem só pode ler, por uma projeção pura (`verso_core::canvas_secret::project`): o nó, as arestas dele e os elementos do desenho que ficam sob ele, estão presos a ele ou têm um grupo que só nós secretos têm; um board sem nó secreto é servido como está, um ilegível que menciona um segredo é servido vazio, um `secret` que não seja `false` ou `null` conta. Toda saída que um leitor tem para um board responde por ela: `read_text`, `read_file_text` e `read_note` (o board lido como texto), `board_preview` (sobre a projeção), o tamanho na listagem, a busca, os backlinks e o grafo (o índice marca os links dos nós secretos, busca o texto público à parte, numera as linhas de um leitor pela projeção), o manifesto, as partes e o registro de mudanças da sincronização, `/f/` (recusado para um board) e a sala do board, em que um leitor não entra (a sala guarda todos os elementos). A proteção: `tests_secret_pins.rs` manda todo comando do contrato como leitor e falha com qualquer palavra de um alfinete secreto no que ouve (visto falhando com a projeção desligada), ao lado do teste de propriedade da projeção (`tests/canvas_secret.rs`, idempotente, elementos não secretos intocados, nenhum id, texto, arquivo, endereço ou coordenada de nó secreto sobra). Não protegido, de propósito: quem pode escrever o board, e quem tem o arquivo; um callout secreto dentro do texto de um cartão do board é projetado como numa nota (achado I3 abaixo). `map_open` e `map_tile` servem os bytes de uma imagem da pasta que um leitor já pode ler por `resolve_attachment`; cortar um PNG grande custa ao host uma thread, uma imagem por vez, 384 MB no máximo. |

### O que o sanitizador garante

O `app/ui/src/sanitize.ts` é escrito à mão, sem biblioteca. Lido de novo
em 2026-10-13 pelo Fable 5.1, o modelo que não o escreveu (ADR 0083
item 16). Revisado linha
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
aprovar a origem dele, e nunca uma para um endereço fora da web; a caixa
carrega o que o botão dela precisa, o botão toma a origem do próprio
endereço, e uma caixa não sobrevive a uma segunda limpeza, então uma nota
não consegue forjar uma (e86eee8). O que ele
devolve se interpreta como ele mesmo e se limpa como ele mesmo: nada de
mutation XSS no caminho pelo `cleanHtmlText`. As entradas hostis, 102,
ficam em `app/ui/test/sanitize-cases.mjs` — o básico da cheat sheet da
OWASP, os payloads de mXSS conhecidos, truques de codificação,
clobbering, e desde 2026-10-13 o que o parser de um navegador faz com
conteúdo estrangeiro, `noscript`, `template`, `textarea` e `title`, uma
caixa de bloqueio forjada, uma nota com dez mil níveis. O
`app/ui/test/sanitize.test.mjs` escreve esta política, a confere contra a
do módulo e as roda no `npm test`, no happy-dom; o
`app/ui/e2e/sanitize.spec.mjs` roda os mesmos casos no WebKit e no
Chromium pelo harness (`npm run e2e`), onde o próprio sanitizador da
janela limpa cada um e o parser do navegador lê a saída de volta (ADR 0083
item 16, 1e25bcf).

### Um aparelho que sincroniza

| Ameaça | Resposta como construída |
|---|---|
| Um aparelho escrevendo onde a conta dele não pode | Um aparelho sincroniza pela sessão de aparelho dele (ADR 0074 item 8): cada escrita, apagamento e mudança de nome que ele envia é conferido contra o papel da conta na pasta antes de o núcleo agir — o aparelho de um leitor recebe, as mudanças locais dele recusadas (ADR 0079 item 1) — e uma escrita contra a cota da pasta (ADR 0077 item 5). |
| A escrita de um aparelho sobre uma versão mais nova | Toda mudança que um aparelho envia nomeia o hash em que se baseou e é recusada quando o arquivo no servidor não é mais aquele (invariante 11); o aparelho então guarda os dois, o seu como cópia de conflito (ADR 0079 item 8). Dois acréscimos puros ao fim de uma nota são juntados em vez disso, no aparelho, e ditos "juntado" no registro do sync (construído, 834dd8d). Um limite conhecido: um programa fora do Verso salvando um buffer velho é uma mudança comum (ADR 0079, achado F18); guardar a versão que ele substituiu é o item 12 do ADR 0080, aceito, em construção. |
| Um aparelho apagando os arquivos de uma pasta | Um apagamento que um aparelho envia é conferido contra a base dele como uma escrita e vai para o `.trash/` da pasta no servidor; no computador, uma passada que apagaria mais de um quinto dos arquivos ou mais de 50 (pelo menos 3) pausa e pergunta (ADR 0079 item 9), e um placeholder nunca é um apagamento (ADR 0043). Ver e restaurar a lixeira na janela é o ADR 0080, aceito, em construção. |
| Um token de aparelho roubado | Guardado `0600` no computador (acima), listado entre as sessões da conta com o nome que a pessoa deu ao computador e revogável ali; um admin o encerra pelo console junto com as outras sessões e os tokens da conta (ADR 0077 item 3, construído); o registro de mudanças nomeia o aparelho ao lado da conta (ADR 0079 item 4). |
| Um aparelho falando outro sync | O aparelho envia a versão de sync dele como `x-verso-sync`; o servidor responde a sua no hello e recusa os comandos `sync_*` de uma versão mais velha que a anterior, com o motivo (ADR 0079 item 5, construído). Uma janela ou um programa que não diz nenhuma nunca é recusado. |
| Um arquivo enorme para esgotar a memória | O sync move um arquivo em pedaços de 1 MiB, lidos do disco quando cada um vai e gravados num arquivo temporário quando cada um chega — uma transferência segura um pedaço na memória, nunca o arquivo (2b1f2c4) —, duas transferências por vez em cada sentido por conexão, descartadas depois de dois minutos paradas e quando a conexão acaba, e nenhum arquivo maior que 1 GiB (ADR 0079 item 12); um arquivo acima disso no servidor nunca é lido pela varredura e aparece na página da pasta no console. O tamanho declarado de um envio é conferido contra a cota no primeiro pedaço (lacuna 5, fechada), e reservado ali até chegar ou ser largado (eff8dd87). |

### Compartilhar uma pasta dentro de uma pasta

ADR 0081, aceito em 2026-10-11 e **não construído**: estas linhas dizem o
que ele decide, não o que roda. *2026-10-13:* a segunda revisão leu o
compartilhamento como construído no e699b57; os achados S1 a S3 dela
estão fechados nas linhas abaixo.

| Ameaça | Resposta como decidida |
|---|---|
| Quem recebe alcançando além do caminho compartilhado | Um compartilhamento é uma concessão num caminho; a sessão que o abre guarda o caminho, os caminhos de todo comando são juntados a ele e confinados (`..` recusado antes de o `verso-fs` agir), e toda resposta — a árvore, uma busca, backlinks, o grafo, as linhas de uma base, o registro de mudanças — é filtrada ao caminho e re-enraizada nele (itens 1 e 2). |
| Saber das notas fora do compartilhamento | Um link para uma nota de fora resolve para "fora do que foi compartilhado com você": nem se existe, nem o caminho, nem o conteúdo (item 11). *Achado e fechado em 2026-10-13 (segunda revisão, S2 e S3):* um link para fora do compartilhamento e um link que não resolve em lugar nenhum eram respondidos de jeitos diferentes, o que dizia se uma nota de um dado nome existia fora; os dois agora passam iguais (6ac42757). O tipo de uma nota nomeava um esquema fora do compartilhamento; agora é resolvido só sobre o compartilhamento, e um tipo que nomeia um esquema de fora é descartado (4f5e1e30). |
| Um compartilhamento repassado, ou mantido depois de acabar | Só o dono da pasta compartilha, e quem recebe não recompartilha (item 4); uma revogação chega às janelas abertas de quem recebe na hora, e uma cópia sincronizada fica no computador dele com o sync desligado — dito ao dono ao compartilhar (item 8). *Achado e fechado em 2026-10-13 (segunda revisão, S1):* um convite para um compartilhamento aceito depois de o compartilhamento ser removido dava a pasta inteira; agora ele acaba com o compartilhamento e não dá nada (b90587cd). |
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
| Segredos no log | Nenhuma senha, token ou link vai para o log; a linha de um sign-in recusado mascara o e-mail numa palavra (ADR 0083 item 1); o link de configuração é o único segredo escrito, uma vez, de propósito. As linhas de log de uma janela são uma linha cada, com os caracteres de controle trocados. O console mostra a configuração com os segredos (`VERSO_UPDATE_TOKEN`, `VERSO_SMTP_URL`) como definidos ou não, nunca o valor. |
| Uma dependência vulnerável ou sem licença | `cargo-deny` (avisos, licenças), a lista de licenças do npm e as advisories do npm no CI — uma alta ou crítica falha a não ser que o `app/ui/audit-exceptions.json` a exclua com motivo, link e validade (ADR 0083 item 13); um aviso de falta de manutenção com exceção e validade (RUSTSEC-2026-0215, smallstr via yrs), e uma advisory do npm (braces 3.0.3, ausente do bundle da janela, até 2027-01-11). |
| Um backup lido onde foi copiado | O `universo.sh backup --encrypt` o cifra com o `age`, para uma chave pública ou uma frase-senha; a chave secreta nunca é argumento de um comando e não fica em nenhum dos diretórios de costume da máquina (ADR 0083 item 12). Sem o `age`, um backup criptografado pedido para e não grava nada (decidido em 2026-10-14); o tarball simples só é feito quando nenhuma criptografia é pedida (a60ccac2). |
| Um backup ou um pacote trocado onde estava guardado | O `universo.sh restore` lista um backup antes e o recusa inteiro, sem gravar nada, quando alguma entrada não é um arquivo comum ou um diretório sob os caminhos do próprio backup — um nome absoluto, um `..`, um link, um dispositivo ou um arquivo set-id (6dd0d265). Um backup é gravado com um nome que o `mktemp` faz, `0600`, nunca dentro do que copia, com `..` e links resolvidos (ecf077cc). O `install` e o `update` param quando falta a assinatura da release, a não ser que `--no-signature` se contente com o checksum (ecf077cc). |
| Uma falha achada sem ter a quem relatar | O `SECURITY.md` e o `/.well-known/security.txt` dizem o endereço e a promessa (ADR 0083 item 15). |

### O notebook como servidor (ADR 0096)

"Este app é um servidor" dá ao app de desktop o primeiro soquete de escuta, numa rede que a pessoa não controla. O que responde a cada ameaça, como construído (os testes estão em `crates/verso-server/src/local`; cada um foi visto falhando com a guarda tirada):

| Ameaça | Resposta como construída |
|---|---|
| A porta achada por uma varredura, ou deixada ligada num café | Desligado até ligar e desligado de novo a cada início, a menos que *Manter ligado ao abrir o app* esteja marcado; uma marca e *Parar* na barra de status enquanto serve; só os endereços privados das interfaces (RFC 1918, link-local IPv4, local único IPv6), nunca um endereço público e nunca o curinga; um par é admitido só de um endereço privado numa sub-rede da máquina, antes de tomar um lugar ou ler um byte; um conjunto diferente de endereços para de servir e pergunta de novo, e acordar com o mesmo conjunto retoma; uma porta aleatória da faixa dinâmica, mantida (não é uma defesa, e isso está dito). |
| O que a rede aprende pelo mDNS | Anunciado só enquanto o diálogo de pareamento está aberto, só nas interfaces servidas; `Verso-` e quatro dígitos hexadecimais aleatórios, nunca o nome do computador nem da pessoa; um registro com a versão do protocolo e a porta; um adeus quando termina. |
| Um pareamento adivinhado, disputado ou repetido | Um token de 256 bits, de uso único, dois minutos, só com o diálogo aberto; o código digitado é o mesmo segredo; três tentativas erradas ou repetidas fecham a janela; um celular espera por vez; sem diálogo aberto as rotas respondem como uma rota desconhecida, checagens de Origin e TLS incluídas; o token viaja no fragmento do QR, que o navegador nunca envia. |
| Uma pessoa no meio durante o pareamento | O limite de um certificado autoassinado (confiança no primeiro uso), dito nos Ajustes, no diálogo e no tutorial: uma pessoa ativa naquele momento poderia se passar pelo notebook. Limitado, não removido, pelo *Foi você?* do notebook (nome, endereço, hora, Permitir ou Recusar; só Permitir faz uma sessão), pela impressão digital mostrada e levada no QR para um cliente nativo, e por *para uma rede em que você confia*. |
| Um celular pareado perdido ou tomado | *Revogar* termina a sessão e fecha a conexão na hora; 14 dias ocioso, 90 no máximo; *Esquecer todos os celulares*; *Substituir a identidade deste computador* faz uma chave nova e termina todos os pareamentos; no máximo quatro celulares pareados. |
| Um celular fazendo o notebook fazer o que não deve | Uma lista de comandos permitidos, negar por padrão, por papel: um celular lê, ou edita quando a pessoa deixou no notebook, e nunca é dono nem admin; nenhum `reveal`, abrir, atualizador, ajustes, log, MCP, sync, compartilhamento, conta, pareamento nem abrir pasta, e nem a sonda de página embutida (uma nota não faz o notebook buscar um endereço para um celular). Um teste lê os bindings gerados e falha quando um comando do contrato está em nenhuma lista. Só as pastas marcadas, pelo nome do diretório, nunca um caminho; uma pasta que também sincroniza com um UniVerso é recusada. |
| O notebook esgotado | 64 conexões ao todo e 16 por endereço, no máximo dois celulares conectados, os outros limites da ADR 0083 (cabeçalhos, ritmo, WebSocket) nas mesmas camadas do `verso serve`. |
| Uma página da rede alcançando o notebook (rebinding, entre sites) | O `Host` tem que ser um dos endereços servidos; o `Origin` é checado em toda mudança e no WebSocket; o cookie de sessão é `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`; nenhum token ou credencial de dispositivo abre algo neste modo. |
| Segredos e registros | O log e a auditoria registram eventos — servir ligado ou desligado, uma janela aberta, fechada, expirada ou falha, um token resgatado, permitido ou recusado, um celular revogado, uma primeira conexão — nunca um token, o conteúdo do QR ou uma nota; a auditoria fica 365 dias e aparece nos Ajustes. O banco e a chave estão no diretório de configuração, `0600`, nunca numa pasta servida. |
| O que não cobre | Uma rede com isolamento de clientes (um café, um hotel) não leva o celular até o notebook, o que é a falha mais segura e está dito. A confiança da primeira visita é da pessoa. O Windows ainda não serve. O aviso do firewall, depois de explicado, é do sistema; o app nunca acrescenta uma regra. |

### Agentes

A nota de outro membro pode carregar texto escrito para conduzir um agente
que a leia (ADR 0045). O servidor ainda não expõe MCP pela rede
(`[ABERTO]`, ADR 0073 item 11); um membro que sincroniza ou abre uma pasta
compartilhada com um agente local leva esse risco para a própria máquina.
A documentação diz isso onde os agentes são configurados. Enquanto isso, um
token de acesso pessoal é o único jeito de um programa chegar ao servidor,
limitado como acima.

### Uma página da web embutida numa nota

O `<iframe>` de uma nota, ou uma nota web embutida, mostra uma página de um
site que quem lê aprovou (ADR 0056). Desde 2026-10-15 essa página é um
`<iframe>` de verdade dentro do documento da janela quando o site permite
ser embutido, e uma visão web filha do host quando não permite (ADR 0056,
revisado). O raciocínio abaixo foi lido no Tauri 2.11 e no wry 0.55 (as
versões do `Cargo.lock`); o que só o app real mostra está listado em
`docs/reference/manual-checks.md`.

| Ameaça | Resposta como construída |
|---|---|
| Uma página embutida chama os comandos do app | O Tauri decide pela origem da requisição, não pelo frame: `Webview::on_message` toma o endereço da requisição, `is_local_url` é falso para qualquer endereço `http(s)` que não seja o do próprio app, e uma origem remota é resolvida contra capacidades que nomeiem uma url `remote`. `capabilities/default.json` não tem nenhuma, então todo comando, o de um plugin inclusive, é recusado (`Command … not allowed by ACL`). Seguro por `the_frame_check_answers_the_apps_views_and_refuses_a_remote_origin` (uma chamada de `https://evil.example/…` a `embed_frameable` e a `web_open` é recusada) e, para um comando que já existia, por `only_the_apps_own_views_reach_the_commands`. |
| Uma página embutida acha `__TAURI_INTERNALS__` e a chave de invocação | O Tauri põe seus próprios scripts só no frame principal (`for_main_frame_only: true` em `manager/webview.rs`), então um frame de outra origem no macOS e no Linux não tem nem um nem outra. O wry documenta a exceção: no Windows (WebView2) os scripts de inicialização chegam a todo frame. Um frame ali poderia ver o objeto e a chave, e as chamadas dele continuam recusadas pela linha acima, já que a chave nunca substitui a checagem de origem. A janela não põe script próprio em frames. |
| Uma página embutida lê o DOM, o armazenamento ou os arquivos do app | Ela é de outra origem: a origem dela é a do site (`allow-same-origin` dá isso, nunca a da janela), então o navegador a mantém fora do DOM, do armazenamento e dos cookies da janela. O `verso://` responde só às visões do próprio app e nunca à origem de uma nota (ADR 0056); a página não pede os arquivos da pasta. |
| Uma página embutida conduz a janela | O frame não tem `allow-top-navigation`; os scripts dela não navegam a janela. Popups: `allow-popups` está ligado, mas a visão do host não tem tratador de janela nova e a visão web do sistema não abre nenhuma (a visão filha também as nega, `on_new_window` → `Deny`). Um link que ela abre não vai a lugar nenhum no app, como não ia a partir da visão filha. |
| Uma página embutida pede câmera, microfone, localização | O frame não tem atributo `allow`: nada é emprestado a um frame de outra origem, e o app não concedeu nenhuma dessas. |
| A página descobre de onde quem lê veio | `referrerpolicy="no-referrer"`. |
| Uma nota faz o app carregar uma página na própria janela | O guarda de navegação é consultado para todo frame, e o wry lhe entrega só o endereço, então ele não distingue um frame da janela. O guarda continua fechado para a web numa visão do app, com uma licença: as origens exatas (esquema, host e porta) que a checagem de frame julgou embutíveis e registrou na sessão, que são origens de páginas que quem lê aprovou. Uma navegação da própria janela para uma delas (um meta refresh que uma nota não consegue escrever; o sanitizador o descarta) carregaria essa página na janela; a política da própria janela (`form-action 'none'`, scripts só do app, nenhum script numa nota) não deixa à nota meio de causá-la. Registrado como o custo de um iframe em relação à visão filha, cuja visão o guarda nunca precisou abrir (ADR 0056, revisado em 2026-10-15). Os links da própria página para outra origem, e os frames dentro dela (um anúncio, um vídeo), são recusados pelo mesmo guarda: ficam em branco. |
| A checagem de frame como sonda da rede local | Um `HEAD` (um `GET` lido só até os cabeçalhos quando ele falha) a um endereço que uma nota escreveu e quem lê aprovou, seis segundos no máximo, no máximo cinco redirecionamentos, a resposta final julgada; nada do corpo é lido, e a resposta é um sim ou um não. Um redirecionamento de uma página pública para um nome ou endereço local (loopback, faixas privadas, link-local, CGNAT, `.local`, um nome sem ponto) encerra a checagem com não; um nome que um DNS público aponta para um endereço privado não é pego (o mesmo limite que o ADR 0056 registrou para o proxy). Um erro, um tempo esgotado, um cabeçalho ilegível: não, e a visão filha toma a página. Respondida uma vez por origem na sessão. |
| Um sim errado: um frame vazio | Os cabeçalhos são lidos como um navegador os lê, com cautela: qualquer valor de `X-Frame-Options` (`DENY`, `SAMEORIGIN`, `ALLOW-FROM`, um ilegível) diz não, mesmo quando há um `frame-ancestors` para sobrepô-lo; `frame-ancestors` só diz sim a `*` (só para a origem do app com esquema de rede: `tauri://localhost` não é coberto por `*`), a um esquema, host ou host com curinga que combine, e toda política da resposta precisa permitir. Um site que responde à checagem de um jeito e ao frame de outro mostra um frame vazio, decisão do site como em qualquer lugar. |

### Uma revisão dos blocos secretos (2026-10-15)

Uma revisão defensiva independente do item 4 da ADR 0087 (um leitor não
recebe bloco secreto "nem nada derivado dele", falhando fechado) achou os
caminhos abaixo; cada um está corrigido e tem teste no crate a que
pertence (`tests_secret_review.rs` no `verso-server`, o `tests/secret.rs`
do dialeto, o do índice, o `tests/ops.rs` do `verso-fs`).

| Achado | O que dizia a um leitor | A correção |
|---|---|---|
| I1: o espaço da pasta | `folder_space` levava o tamanho do índice, que cresce com o texto secreto | Um leitor recebe um índice de 0, como um compartilhamento |
| I2: marca de ordem de bytes | Um U+FEFF antes de um `> [!secret]` na primeira linha fazia a projeção não o achar | O callout é achado no texto depois da marca, com o intervalo mantido no original; o gerador do teste de propriedade tem a marca |
| M1: números das mudanças | O registro de sync de um leitor mantinha os números da pasta, e os saltos contavam as mudanças só dentro de blocos secretos | O cursor, as mudanças e a cabeça de um leitor são numerados na contagem dele (`reader_command`) |
| M2: nota acima de 16 MB | O manifesto de um leitor dizia o tamanho e o hash do arquivo inteiro de uma nota que lhe é recusada | Essa nota fica fora do manifesto e do registro de um leitor |
| M3: ordem da busca | O rank do FTS5 pesa o tamanho da linha toda, a coluna secreta junto (peso 0 não muda isso), e a ordem se movia com um bloco secreto | Os resultados de conteúdo de um leitor vêm ordenados por caminho (os de nome mantêm o rank deles); um custo de relevância para leitores, para o mantenedor pesar |
| M4: `stale` e `reindex` | Depois de uma edição dentro de um bloco secreto feita fora do servidor, um leitor via `stale: true` e um reindex de `indexed: 1` | O `stale` de um leitor compara a projeção com o texto público do índice; o reindex dele não conta nada |
| M5: `[!secret\|x]` | Um tipo seguido de metadados não era lido como secreto | A projeção lê o tipo até a barra e falha fechado; o renderizador pode desenhá-lo como antes |
| Um link para uma nota | Um symlink dentro da pasta com nome que não é de nota (`espelho.txt` para `Nota.md`) era lido, sincronizado e servido por `/f/` como arquivo comum, a nota inteira | O que um leitor lê é julgado pelo arquivo que é (`Root::resolved_name`, e `hard_linked` para um segundo nome): a projeção pelo contrato e pelo sync, uma recusa em `/f/` |

Achado I3, decidido pelo mantenedor em 2026-10-15 (*"Card de Markdown
num board é card de Markdown"*): um callout `> [!secret]` dentro do nó de
texto de um `.canvas` fica escondido dos leitores exatamente como numa
nota, pela projeção do board aplicando a projeção da nota
(`verso_dialect::Secrets`) ao `text` de cada nó de texto, em toda saída que
serve um board (as mesmas de um alfinete secreto). Um card cujo texto fica
vazio permanece, vazio, com seu lugar e suas arestas, como uma nota toda
secreta é servida como nota vazia; um link escrito dentro do callout é link
secreto para o índice. Um arquivo `.txt`, e todo arquivo que não é Markdown,
**não** é projetado e é servido como está.

Os testes do histórico também falhavam sob carga, e a causa estava no
produto: o histórico guardava o arquivo como estava na hora de registrar,
não os bytes de que a mudança foi calculada, e uma escrita que ganhava a
corrida contra a primeira olhada do registro perdia a versão encontrada e
levava o nome dela. Agora uma versão só é registrada quando os bytes
batem com a mudança.

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
   minuto. Raciocinados, ainda não medidos na máquina de 1 núcleo. Uma
   presença (`collab_awareness`) além do ritmo é descartada, nunca posta na
   fila à frente de uma edição, e uma janela manda uma no máximo a cada
   100 ms (2026-10-13: três janelas de uma conta a ~45 presenças por
   segundo cada seguraram as edições por 30 s).
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
   construída. **Fechada: cb05804** (ADR 0083 item 8) — as rotas de
   e-mail ganham uma segunda chave, `mail:<e-mail normalizado>`, com a
   espera de quem envia.
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
    aberta:** depois das lacunas acima. *2026-10-13:* o item 16 do ADR
    0083 a responde em duas partes: o sanitizador lido pelo modelo que não
    o escreveu, feito em 2026-10-13 (0b5fea1); o pentest do servidor do
    laboratório por uma pessoa de fora do projeto, pendente, condição do
    anúncio.

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
  *Feito em 2026-10-13 (ADR 0083 item 16, 0b5fea1):* a leitura pelo Fable
  5.1, o modelo que não escreveu o `sanitize.ts` — nenhum BLOQUEANTE, três
  MENORES, o da caixa de bloqueio resolvido em e86eee8 *(relatado)* — e a
  bateria rodada no WebKit e no Chromium pelo harness; dos outros
  renderizadores, o build do PDF.js conferido sem `eval` (ADR 0083 item 8,
  4b892cc), Mermaid, KaTeX e Excalidraw não lidos. Deixado `[ABERTO]` para
  o mantenedor.
- `[ABERTO]` Histórico e recuperação da mudança ou da remoção feita por
  outro membro. *Recomendação:* o ADR 0080 (a lixeira, e a versão que a
  escrita de um aparelho substituiu) responde aos apagamentos e aos
  aparelhos para o primeiro usuário de fora; a edição de um membro dentro
  de uma sala fica `[ABERTO]` para um ADR próprio, como o roadmap diz, e a
  documentação diz até lá que um membro com escrita pode mudar o texto de
  outro.
- Um limite de taxa além dos logins. *(Cotas por pasta: ADR 0077
  item 5, construído em 2026-10-10; por conexão: 8 requisições, uma fila de
  1024 mensagens, pings, construídos em 2026-10-11, b56c538.)*
  *Recomendação:* antes do primeiro usuário de fora, as lacunas 2 a 5: um
  tempo limite de envio, a fila limitada em bytes, um teto de conexões por
  conta e no servidor, a cota conferida no primeiro pedaço de um envio; os
  números medidos na máquina de 1 núcleo e 1 GB das notas de instalação do
  servidor. *Construído em 2026-10-11:* as lacunas 2, 3, 4 e 8 (os commits
  delas acima); a lacuna 5 em 2026-10-12 (2b1f2c4); os números são
  raciocinados, não
  medidos naquela máquina. *Construído em 2026-10-13:* um ritmo nas rotas
  REST por endereço, 20 por segundo e 100 de uma vez (9b4cdf0, item 7 do
  ADR 0083), e um ritmo nos sign-ins recusados do servidor (805febb, item 2
  do ADR 0083); medi-los é o item 18 do ADR 0083. **Fechada: 9b4cdf0 e
  805febb** — decidido pelo mantenedor em 2026-10-13 (*"sobre as decisões
  em aberto, siga as recomendações"*): os limites como construídos
  respondem a ela; medir os números na máquina de 1 núcleo continua o
  item 18 do ADR 0083.
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
  ele vai ser lançado. *2026-10-13:* a revisão dessa data e o item 16 do
  ADR 0083 dizem o que ela é e quando — um pentest do servidor do
  laboratório antes do anúncio, o sanitizador lido pelo modelo que não o
  escreveu — e o que vem antes dela: todos os outros itens do ADR,
  construídos numa rodada só (a ordem do trabalho dele, reescrita quando
  foi aceito em 2026-10-13) — os itens 1 a 15 e 17 construídos em
  2026-10-13, com a leitura do sanitizador do item 16; o pentest
  pendente.
