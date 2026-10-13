# ADR 0083 — Endurecimento de segurança do UniVerso: bots, força bruta, as ferramentas do host e o que vem antes do primeiro usuário de fora

- Data: 2026-10-13
- Fonte: o mantenedor, em 2026-10-13: *"Análise de segurança, precisamos
  que a aplicação seja resistente a ataques hackers, nos proteger de
  acessos a bots e etc. Em paralelo, pede para o Fable fazer um ADR a
  respeito para rodarmos assim que der."* Escrita por Fable 5.1 a pedido
  do mantenedor, uma troca dos papéis da
  [0032](0032-author-and-reviewer-roles.md) (documentos são do Opus) como
  a [0080](0080-the-trash-with-expiry-and-restore.md), a 0081 e a 0082
  foram; a ser lida por Opus 5.5 antes de ser aceita. A análise por trás
  dela:
  [`docs/reference/security-review-2026-10-13.md`](../reference/security-review-2026-10-13.md),
  cujos achados F1 a F23 os itens abaixo citam.
- Relacionadas: [0073](0073-self-hosted-server-first.md) (item 6:
  segurança por inteiro antes do primeiro usuário que não seja o
  mantenedor; o modelo de ameaças antes do anúncio),
  [0074](0074-accounts-and-access-on-the-server.md) (item 3 sign-in, item
  8 tokens e aparelhos, item 9 limites e o registro de auditoria — "nunca
  um bloqueio que um estranho possa usar"),
  [0075](0075-server-packaging-and-storage.md) (a unidade, a imagem, os
  dois diretórios), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (o console), [0045](0045-server-and-mcp-security.md),
  [0029](0029-guardrails-in-ci.md) (um guardrail de feature entra com a
  feature e é visto falhando antes), [0033](0033-pr-workflow.md) (os
  níveis), [0035](0035-cross-cutting-requirements.md) (as duas línguas,
  acessibilidade), `docs/reference/threat-model.md`.

## Contexto

O UniVerso no HEAD af4d73a já tem a maior parte do que um servidor
auto-hospedado precisa contra um estranho na rede: TLS ou nada, `Host` e
`Origin` conferidos, um token CSRF, Argon2id, atrasos crescentes por
endereço e por conta, conexões e filas limitadas, caminhos confinados,
arquivos em sandbox, um serviço em sandbox e uma imagem sem root,
releases assinadas. O modelo de ameaças de 2026-10-11 fechou 15 das suas
17 lacunas. A revisão de 2026-10-13 leu o código de novo com a pergunta
do mantenedor — bots, abuso, ataques de fora — e o servidor rodando sob
`curl`, e não achou lacuna BLOQUEANTE: nada viola uma invariante ou uma
decisão aceita, e nada perde dados.

O que ela achou é a diferença entre *resistente* e *por inteiro*:

- O servidor se defende e não conta a ninguém. Um sign-in que falha é
  uma linha de auditoria e nenhuma linha de log (F1), então fail2ban,
  CrowdSec e o banimento próprio de um NAS não leem nada; o atraso por
  chave satura em 60 s, então uma conta recebe uns 1 440 palpites por dia
  para sempre e a pessoa nunca é avisada (F2); uma senha de 12 caracteres
  das listas que atacantes tentam é aceita (F3).
- Uma pessoa que se recupera de uma senha roubada fica com o token do
  ladrão (F4). Atrás do Cloudflare, ou de qualquer proxy com vários
  endereços, os cabeçalhos encaminhados não podem ser acreditados e todo
  limite por endereço usa o do proxy — as três falhas de um estranho
  atrasam todo mundo (F5).
- Os parsers do próprio servidor não passam por fuzzing (F6), a metade
  npm da árvore não é conferida por advisories (F7), não há endereço para
  relatar uma vulnerabilidade (F8), a revisão de fora que a 0073 pede
  ainda está por vir (F9), e um backup sai da máquina em claro (F10).
- Treze coisas menores (F11 a F23): uma caixa de e-mail inundável, o
  buffer de cabeçalhos do hyper, a atualização de 48 MB de uma sala de
  nota, nenhum ritmo nas rotas REST, nenhuma prova recente para ações
  sensíveis, alguns valores de cabeçalho, o link da página de aparelho,
  segredos no exemplo do compose, as capabilities do contêiner, o modo de
  uma pasta, o crescimento do log e da auditoria, a flag de eval do
  PDF.js, os redirecionamentos da checagem de atualização.

As palavras do mantenedor dão a régua — *resistente a ataques*,
*proteger de bots* — e o item 6 da 0073 dá o momento: antes do primeiro
usuário que não seja o mantenedor. Este ADR transforma a revisão em
medidas, cada uma com os números padrão, o crate e o arquivo onde cai, e
o teste que a guarda; cada número que o mantenedor possa querer mudar, e
cada medida que custa algo às pessoas, está `[ABERTO]` com uma
recomendação.

## Decisão

Proposta. Cada `[ABERTO]` traz uma recomendação; o mantenedor decide. O
que não tem `[ABERTO]` é proposto como está escrito. Tamanhos: S são
horas, M um ou dois dias, L mais.

1. **Todo sign-in recusado é uma linha do log do servidor, num formato
   fixo, para as ferramentas do host** (F1). `crates/verso-server/src/api.rs`
   (`sign_in`, `password`), `passkeys.rs` (`sign_in_finish`), `device.rs`
   (um segredo de poll errado), e as recusas do limitador (`limited`),
   cada um: `WARN sign-in failed from <endereço> for <e-mail mascarado>
   (<n> in a row)` — o endereço como o proxy confiável o encaminhou, IPv4
   inteiro e IPv6 pelo /64 como o limitador o usa, o e-mail como
   `a***@example.org`, a contagem de falhas da conta desde o último
   sucesso; e `WARN sign-in limited from <endereço>` no máximo uma vez
   por minuto por chave. O prefixo `sign-in failed from` é reservado: as
   linhas de `log_write` de uma janela começam com `window <id>
   (<conta>):` (`rpc.rs`), então um membro não consegue forjar uma. Um
   filtro e uma jail do fail2ban
   (`packaging/server/fail2ban/universo.conf`, `jail.d/universo.conf`:
   `failregex = ^\S+ WARN sign-in failed from <HOST> `, `maxretry = 10`,
   `findtime = 10m`, `bantime = 1h`) e um parser e um cenário do CrowdSec
   (`packaging/server/crowdsec/`) com o mesmo limiar; o manual de
   instalação ganha uma seção sobre os dois e sobre o `rate_limit` do
   Caddy. Guardrail: um teste em `tests_bounds.rs` de que um sign-in que
   falha diz a linha com esse prefixo e o endereço mascarado, de que um
   `log_write` de `sign-in failed from …` sai com o prefixo `window`, e
   de que a regex do fail2ban, rodada sobre as linhas do teste com um
   casador pequeno, pega exatamente as falhas. Tamanho S.
   - `[ABERTO]` Entregar o filtro do fail2ban no `.deb`/`.rpm` (sob
     `/etc/fail2ban/filter.d/`, inerte sem o fail2ban) ou só na
     documentação. *Recomendação:* no pacote, para que `sudo systemctl
     enable fail2ban` seja toda a configuração; os arquivos do CrowdSec na
     documentação, já que os parsers dele vivem no hub dele.

2. **Um teto, e um aviso, sobre sign-ins** (F2). O atraso por chave fica
   como está (3 livres, 1 s dobrando até 60 s, nunca um bloqueio — 0074
   item 9). Acima dele: *por conta*, depois de 20 falhas dentro de uma
   hora de qualquer endereço, um e-mail para a conta (quando o servidor
   tem servidor de e-mail) dizendo quando e de onde, no máximo uma vez por
   dia, e uma linha `INFO` para o admin; a visão geral do console conta
   "contas sob ataque hoje". *No servidor*, um token bucket de sign-ins
   falhos — 10 por segundo sustentados, 50 de uma vez, o bucket do
   `fair.rs` — além do qual todo sign-in espera a vez (2 s no piso do
   bucket), dito no log uma vez por minuto: uma inundação por muitas
   chaves atrasa a inundação e o sign-in honesto igualmente por segundos,
   nunca bloqueia. `crates/verso-server/src/limit.rs`, `api.rs`,
   `console.rs`, `mail.rs`. Guardrail: testes unitários do bucket e da
   contagem por hora; um teste de que o e-mail é enviado uma vez e a 21ª
   falha não envia de novo. Tamanho M.
   - `[ABERTO]` Os números: 20 falhas por hora para o aviso; 10 por
     segundo, 50 de uma vez para o servidor. *Recomendação:* como está;
     medidos no host de 1 GB no item 18 e ajustados lá.
   - `[ABERTO]` Se, depois do aviso, uma conta que tem passkey recusa a
     senha até a passkey ou um link de redefinição ser usado.
     *Recomendação:* não — é um bloqueio que um estranho pode usar, o que
     o item 9 da 0074 proíbe; o aviso e o atraso bastam.

3. **Uma senha das listas que atacantes tentam é recusada** (F3). As
   10 000 senhas mais comuns de uma lista pública sob licença permissiva
   (registrada no PR, como a 0029 pede de uma dependência), em
   minúsculas, em `crates/verso-server/passwords.txt`, via `include_str!`,
   procuradas num `HashSet` montado uma vez; recusadas — com a mensagem
   *esta senha está nas listas que atacantes tentam primeiro* nas duas
   línguas — no setup, na aceitação de um convite, numa redefinição, numa
   troca, e para `VERSO_ADMIN_PASSWORD` no início (um erro que nomeia a
   variável); também recusados: a parte local do e-mail, e o próprio
   e-mail. 12 caracteres continua o piso. `api.rs` (`check_password`),
   `config.rs`, `lib.rs`. Guardrail: um teste de que `password1234` e
   `qwertyuiop12` são recusadas e uma frase de quatro palavras é aceita; o
   tamanho do arquivo limitado no teste (abaixo de 200 KB). Tamanho S.
   - `[ABERTO]` Uma checagem por k-anonimato contra a API de faixas do
     Have I Been Pwned (cinco caracteres do SHA-1 enviados, nada que
     identifique). *Recomendação:* não — é um pedido de saída a um
     terceiro de um servidor que só alcança o feed de releases e o SMTP do
     host (modelo de ameaças, "o alcance do próprio servidor"), e a lista
     embutida pega o grosso das listas de stuffing.

4. **A recuperação revoga os tokens da conta** (F4). Uma redefinição de
   senha (o uso de um link, `api.rs` `reset`, e `admin reset`) revoga todo
   token de acesso pessoal da conta além de encerrar as sessões, com uma
   linha de auditoria por token; uma troca de senha (`api.rs` `password`)
   faz o mesmo quando o pedido diz (`revokeTokens: true`), que o
   formulário da janela oferece marcado por padrão, e senão diz na
   resposta quantos tokens ficam. `db.rs` ganha `revoke_tokens_of`.
   Guardrail: um teste de que um token responde 401 depois de uma
   redefinição, e depois de uma troca com a flag. Tamanho S.

5. **Vários proxies confiáveis, e um aviso quando um não encaminha
   nada** (F5). `VERSO_TRUSTED_PROXY` aceita uma lista separada por
   vírgulas de endereços e CIDRs (`127.0.0.1, 10.0.0.0/8,
   2001:db8::/32`); o endereço do cliente é a entrada mais à direita do
   `X-Forwarded-For` que não está na lista, andando para a esquerda, como
   toda cadeia de proxies é lida; um pedido de um endereço confiável sem
   `X-Forwarded-For` é servido com o endereço do proxy e dito no log uma
   vez por minuto (*um pedido do proxy confiável não trouxe
   X-Forwarded-For: o proxy está configurado para encaminhá-lo?*). O
   manual de instalação ganha a receita do Cloudflare (as faixas
   publicadas do Cloudflare na lista, ou Cloudflare → Caddy → Verso com só
   o Caddy confiável) e o aviso de que um proxy fora da lista faz de todo
   visitante um endereço só. `crates/verso-server/src/config.rs`,
   `auth.rs` (`peer`), `listen.rs` (`Slots::take`). Guardrail: testes
   unitários da caminhada (dois saltos, uma entrada falsa à esquerda, um
   endereço num CIDR). Tamanho S.

6. **Uma prova recente antes de uma ação sensível** (F15, e a aprovação
   da página de aparelho). Criar um token, adicionar ou remover uma
   passkey, aprovar um aparelho, trocar o e-mail (quando isso existir), e,
   para o admin, apagar uma conta, mudar poderes, encerrar as sessões de
   outro e entrar numa pasta, exigem um sign-in nos últimos 10 minutos:
   uma sessão guarda `proved_at`; `POST /api/me/prove` recebe a senha ou
   uma asserção de passkey e carimba; uma rota sensível responde 403
   `prove_first` senão, e a janela pergunta na hora e tenta de novo. Os 10
   minutos são uma constante, não um ajuste. `db.rs`, `api.rs`,
   `passkeys.rs`, `device.rs`, `admin.rs`, os `web/account.ts` e
   `web/console.ts` da janela. Guardrail: um teste por rota de que ela
   responde `prove_first` depois que a marca passa de 10 minutos e tem
   sucesso dentro deles. Tamanho M.
   - `[ABERTO]` Se isso vem antes do primeiro usuário de fora ou antes do
     anúncio. *Recomendação:* antes do anúncio — os primeiros usuários de
     fora são pessoas convidadas num servidor com poucas contas, e os
     tokens já são limitados e revogáveis.

7. **Um ritmo nas rotas REST, por endereço** (F14). Um token bucket por
   chave de endereço — 20 pedidos por segundo sustentados, 100 de uma vez
   — em toda rota sob `/api/` exceto o upgrade do WebSocket (que o
   `fair.rs` já conta), loopback e os proxies confiáveis excluídos, 429
   com `Retry-After` além disso, dito no log uma vez por minuto por chave;
   os arquivos da janela e a página ficam com os limites de conexão (um
   carregamento de página é uma rajada de arquivos).
   `crates/verso-server/src/http.rs` (uma camada ao lado de `guard`),
   `fair.rs` (o bucket, reusado). Guardrail: um teste em `tests_bounds.rs`
   de que o 101º pedido numa rajada responde 429 e o do segundo seguinte
   não. Tamanho S.
   - `[ABERTO]` Os números. *Recomendação:* como está — o uso REST de uma
     janela é alguns pedidos por minuto; o sync e os comandos da janela
     vão pelo WebSocket, sob o `fair.rs`.

8. **Os limites que a revisão achou frouxos, cada um apertado** (F11,
   F12, F13, F17, F22, F23), um PR, tamanho S no total:
   - as rotas de e-mail ganham uma segunda chave, `mail:<e-mail
     normalizado>`, com o mesmo atraso da do remetente (`api.rs`);
   - `max_buf_size(64 * 1024)` do hyper no builder da conexão
     (`listen.rs`), para que os cabeçalhos de um pedido tenham 64 KiB no
     máximo;
   - uma sala de nota recusa uma atualização Yjs acima de 4 MB — o
     `UPDATE_MOST` do `collab_board.rs`, compartilhado — antes de
     decodificá-la (`collab.rs`);
   - um segredo de poll errado conta contra a chave `device:` do endereço
     (`device.rs`);
   - `isEvalSupported: false` nas duas chamadas de `getDocument`
     (`app/ui/src/pdf.ts`);
   - o cliente da checagem de atualização com `redirect(Policy::none())`
     (`update.rs`).
   Guardrail: um teste por limite em `tests_bounds.rs` (o cabeçalho de 64
   KiB recusado com 431, a atualização de 4 MB recusada, o atraso do poll)
   e a opção do PDF afirmada por `test/pdf.test.mjs`.

9. **Os cabeçalhos completados, e afirmados** (F16). O HSTS ganha
   `includeSubDomains` quando o servidor serve o próprio TLS ou o endereço
   público é HTTPS; a `Permissions-Policy` ganha `usb=(), serial=(),
   bluetooth=(), interest-cohort=()`; nada mais muda (`style-src
   'unsafe-inline'`, `img-src https:` e `frame-src https:` ficam, pelos
   motivos da seção 3.2 da revisão). `http.rs`. Guardrail: um teste que
   afirma o conjunto inteiro de cabeçalhos, nome e valor, em `/`,
   `/api/state` e `/f/<pasta>/<arquivo>` — o conjunto que a seção 3.2 da
   revisão lista — para que um cabeçalho perdido numa refatoração seja
   visto. Tamanho S.
   - `[ABERTO]` `preload` no HSTS. *Recomendação:* não — é a escolha
     irreversível do host para o domínio dele, não o padrão do servidor.

10. **O registro de auditoria expira** (F21). `VERSO_AUDIT_DAYS`, 365 por
    padrão, 0 para nunca, limitado como `VERSO_TRASH_DAYS`; uma varredura
    uma vez por dia ao lado da da lixeira apaga linhas mais velhas que
    isso; a visão geral do console diz a retenção. `config.rs`, `db.rs`,
    `lib.rs`, `console.rs`; `packaging/server/universo.env` e o manual.
    Guardrail: um teste de que uma linha mais velha que a retenção vai
    embora e uma mais nova fica. Tamanho S.
    - `[ABERTO]` 365 dias. *Recomendação:* 365 — um ano de quem entrou de
      onde é o que uma pessoa pede depois de um incidente, e são dados
      pessoais (endereços) que não deveriam ficar para sempre.

11. **O pacote endurecido** (F18, F19, F20). A unidade ganha
    `ProtectProc=invisible`, `ProcSubset=pid`,
    `SystemCallFilter=@system-service`, `SystemCallFilter=~@privileged
    @resources`, `UMask=0027`; `verso_fs::server::make_folder` cria uma
    pasta `0750`; o compose declara `read_only: true`, `tmpfs: [/tmp]`,
    `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, e mostra
    `VERSO_ADMIN_PASSWORD_FILE` com um segredo do Docker antes da variável
    pura, como o manual faz. `packaging/server/universo.service`,
    `docker-compose.yml`, `crates/verso-fs/src/server.rs`,
    `docs/reference/server-install.md`. Guardrail: o modo da pasta nos
    testes do `server.rs`; a unidade e a imagem iniciadas na VM do
    laboratório pelo passo de pacote do `scripts/check-linux.sh` (o
    servidor respondendo `/api/state` sob a unidade nova e o contêiner
    somente leitura), visto falhando antes com uma syscall que o filtro
    nega. Tamanho S.

12. **Um backup que pode sair da máquina** (F10). `universo.sh backup`
    ganha `--encrypt`: com o `age` instalado, o tarball é encanado por
    `age -r <destinatário>`, onde o destinatário é a chave pública em
    `/etc/universo/backup.pub` (feita uma vez por `universo.sh backup
    --keygen`, que imprime a chave secreta para o host guardar em outro
    lugar) ou, com `--passphrase`, uma senha pedida; sem o `age`, o
    script diz como instalá-lo e faz o tarball puro com o aviso atual em
    maiúsculas; `backup --to-stdout` escreve o tarball na saída padrão
    para a esteira do próprio host. A linha de restauração na mensagem
    muda de acordo. `packaging/server/universo.sh`, a seção 2 do manual.
    Guardrail: o teste de script do `scripts/check-linux.sh` faz um
    backup com uma chave descartável, restaura numa raiz descartável e
    compara. Tamanho M.
    - `[ABERTO]` `age` como ferramenta (um binário estático, nos
      repositórios do Debian, Ubuntu, Fedora e Alpine, destinatários
      X25519, nenhuma gestão de chaves além de um arquivo) contra `openssl
      enc` (presente em toda parte, só senha, fácil de usar mal) ou GnuPG
      (pesado). *Recomendação:* `age`, opcional, o backup puro mantido como
      alternativa com o aviso.

13. **Advisories na árvore npm, como o `cargo deny` na árvore Rust** (F7).
    `node scripts/check-npm-audit.mjs` roda `npm audit --json` em `app/ui`
    e falha em qualquer advisory de severidade alta ou crítica que não
    esteja em `app/ui/audit-exceptions.json` (um id, um motivo com link,
    uma data de validade; uma exceção vencida falha, como a política do
    `deny.toml`); no job Linux do CI ao lado da checagem de licenças e no
    `scripts/check.sh`. Guardrail: ele mesmo; visto falhando antes com uma
    exceção inventada que venceu. Tamanho S.

14. **As entradas do servidor sob fuzzing** (F6). `crates/verso-server/fuzz/`
    com alvos de `cargo-fuzz` para: o pedido do WebSocket (`Request` via
    `serde_json`), `verso_core::sync::unframe`, uma atualização Yjs
    integrada numa sala de nota e numa sala de board (via a fusão do
    board), uma atualização de presença (o leitor de awareness do
    `collab.rs`), `host_ok` e `expected_origin` sobre cabeçalhos
    arbitrários, e `config::size`; cada um 60 s no `main`, no job de fuzz
    ao lado dos do dialeto e do canvas (`.github/workflows/ci.yml`), um
    crash guardado como artefato. Guardrail: ele mesmo; visto falhando
    antes com um alvo sobre um stub que entra em pânico de propósito.
    Tamanho M.

15. **Um jeito de relatar uma vulnerabilidade** (F8). `SECURITY.md` na
    raiz (o gêmeo pt-BR sob `docs/pt-BR/`, como a checagem de espelho
    espera): o endereço, a promessa — uma confirmação em 7 dias, uma
    correção na próxima versão da linha suportada, crédito quando quiser
    — o que está no escopo (o servidor, o app, o site) e o que não está
    (a máquina do host, os dados do próprio membro, negação de serviço
    contra um servidor que não é seu), e a chave de assinatura para e-mail
    cifrado. O servidor serve `/.well-known/security.txt` (`http.rs`, uma
    rota estática) com `Contact:`, `Expires:` um ano à frente do build,
    `Preferred-Languages: pt-BR, en`, `Canonical:` e `Policy:` apontando
    para o arquivo; o site serve o mesmo. Guardrail: um teste de que a
    rota responde com os campos exigidos e um `Expires` no futuro; a
    checagem de espelho para o gêmeo. Tamanho S.
    - `[ABERTO]` O endereço. *Recomendação:* `security@versomd.com`, uma
      caixa que o mantenedor lê; sem bug bounty.

16. **A leitura de fora, e a revisão cruzada do sanitizador** (F9). Antes
    do anúncio: `app/ui/src/sanitize.ts` lido pelo modelo que não o
    escreveu (Opus 5.5 escreveu o c7f8c8d: a leitura é do Fable), com a
    bateria rodada no WebKit e no Chromium pelo harness; e um teste de
    penetração do servidor do laboratório (`docs/reference/sync-lab.md`)
    por uma pessoa de fora do projeto, contra a API, o WebSocket e a
    janela como membro hostil e como estranho, os achados classificados e
    fechados num PR próprio. Guardrail: a rodada do harness dos casos do
    sanitizador, mantida no `npm run e2e`. Tamanho L para o pentest (fora
    das horas do projeto), S para a leitura.
    - `[ABERTO]` Se o pentest é condição do anúncio ou do primeiro usuário
      de fora. *Recomendação:* do anúncio; os primeiros usuários de fora
      são convidados e conhecidos, e os itens 1 a 5, 8 a 10 e 13 são o que
      eles precisam.

17. **Sem CAPTCHA; sem prova de trabalho; a página de aparelho mantém o
    link.** Um CAPTCHA de terceiro traz o script desse terceiro para a
    página de sign-in, o que a política da página proíbe e os
    compromissos de privacidade e acessibilidade do projeto não permitem
    (seção 2.8 da revisão). Um desafio de prova de trabalho antes do
    sign-in é auto-hospedado e invisível, mas taxa a bateria de um celular
    e aumenta o custo de um atacante em um segundo por tentativa, o que os
    itens 1 e 2 aumentam mais sem a bateria. A página de aprovação de
    aparelho continua tirando o código do link (0074 item 8, lacuna 12
    como decidida em 2026-10-12), e a prova recente do item 6 cobre a
    aprovação.
    - `[ABERTO]` Prova de trabalho. *Recomendação:* não, registrada como
      considerada.
    - `[ABERTO]` A página de aparelho pede que a pessoa digite o código
      quando o link não traz nenhum, como o GitHub faz, e mostra o
      digitado. *Recomendação:* sim, S, com o item 6; o link fica para o
      fluxo do próprio app.

18. **Os números medidos.** Os números de conexão, fila, ritmo e bucket
    dos itens 2 e 7 e da superfície de ataque do modelo de ameaças são
    medidos no servidor de 1 núcleo e 1 GB do laboratório com o kit, sob
    uma inundação de conexões, de sign-ins e de comandos, e registrados em
    `docs/reference/server-install.md`, seção 15, com a data; um número
    que a medição contradiga é mudado no mesmo PR. Tamanho M.

### Ordem do trabalho

- **Antes do primeiro usuário que não seja o mantenedor** (0073 item
  6): itens 1, 2, 3, 4, 5, 8, 9, 10 e 13 — a linha de log e os filtros do
  host, o teto e o aviso, a lista de recusa, a recuperação revogando
  tokens, a lista de proxies, os limites frouxos, os cabeçalhos
  afirmados, a retenção da auditoria, os advisories do npm. Uns dois dias
  no total.
- **Antes do anúncio** (0073 item 6, as "lacunas antes do anúncio" do
  modelo de ameaças): itens 6, 7, 11, 12, 14, 15, 16 e 18 — a prova
  recente, o ritmo REST, o pacote, o backup cifrado, o fuzzing, o canal de
  divulgação, a revisão cruzada e o pentest, a medição.
- **Depois, em ADRs próprios ou nunca:** OIDC e TOTP (0074 item 3), um
  registro de leituras por pasta (seção 2.7 da revisão), o token de
  aparelho no chaveiro do sistema e criptografia de ponta a ponta (os
  `[ABERTO]` do modelo de ameaças), ACME embutido (0073 item 6). Nunca, a
  menos que o mantenedor diga o contrário: um CAPTCHA, uma prova de
  trabalho, o Have I Been Pwned, bloqueio de conta.

## Consequências

- O que as pessoas sentem: uma senha que escolheram recusada no setup ou
  num convite por estar na lista (item 3) — a mensagem diz por quê e pede
  outra; um sign-in que espera segundos enquanto o servidor está sob
  inundação (item 2) — nunca um bloqueio; um e-mail dizendo que alguém
  está tentando a senha delas (item 2); os tokens delas sumindo depois de
  uma redefinição (item 4) — a janela diz; a senha ou a passkey pedida de
  novo antes de um token ser feito ou um aparelho aprovado (item 6), dez
  minutos de cada vez; uma casa atrás de um endereço atrasada pelas
  falhas de um membro, como hoje; um host que roda fail2ban banindo um
  endereço compartilhado por uma hora depois de dez falhas (item 1) — os
  números da jail são do host para mudar.
- O que o host ganha: uma linha de log que as ferramentas dele leem, um
  filtro no pacote, uma lista de proxies, um backup que pode copiar para
  fora da máquina, um endereço para escrever, uma unidade e uma imagem
  que fazem menos.
- O que o projeto paga: um job de fuzz de alguns minutos a mais no
  `main`; um `npm audit` que fica vermelho num advisory novo sem PR para
  culpar, com a mesma política de exceções do `deny.toml`; uma lista de
  senhas de algumas centenas de kilobytes no binário; o custo do pentest,
  em horas ou dinheiro, antes do anúncio; um teste por limite, que é o
  ponto.
- O que fica como está, dito de novo: o host vê as notas; o servidor só
  alcança o feed de releases e o SMTP do host; nada de um membro sai do
  servidor para um terceiro; acessibilidade não é trocada por um portão.
- O modelo de ameaças ganha um ponteiro para a revisão e para este ADR, e
  marca a lacuna 10 como respondida pelo item 16 quando ele for feito; é
  atualizado de novo quando os itens antes do primeiro usuário de fora
  estiverem construídos.

## Alternativas descartadas

Consideradas na revisão de 2026-10-13 e postas de lado; cada uma pode ser
retomada pelo mantenedor:

- **Bloqueio de conta** depois de N falhas: proibido pelo item 9 da 0074,
  um bloqueio que um estranho pode usar contra o dono; o aviso do item 2
  no lugar.
- **Um CAPTCHA** (Turnstile, hCaptcha, reCAPTCHA): o script de um
  terceiro num servidor auto-hospedado, um muro para quem usa leitor de
  tela, contra a política da página; item 17.
- **A API de faixas do Have I Been Pwned** para senhas: um pedido de saída
  que o servidor não faz hoje; a lista embutida do item 3 no lugar.
- **`SameSite=Strict`** no cookie de sessão: quebra a primeira navegação a
  partir do link de um e-mail; `Lax` mais `Origin` mais o token é o
  conjunto.
- **Um `style-src` por nonce**: os estilos em linha do renderizador
  teriam de ser reescritos; o sanitizador os doma no lugar.
- **Cifrar o backup com `openssl enc` ou GnuPG** em vez de `age`: o
  `[ABERTO]` do item 12.
- **Um registro de leituras por pasta** para distinguir raspagem de
  leitura: uma linha por leitura, registrado para um ADR posterior, não
  agora.

## Status

Proposta (2026-10-13), escrita por Fable 5.1 a pedido do mantenedor; a
ser lida por Opus 5.5. O mantenedor decide cada `[ABERTO]` e a ordem;
nada aqui está construído. Quando aceita, os itens antes do primeiro
usuário de fora vão num PR só com os guardrails deles, cada um visto
falhando antes (0029), e a tabela de achados da revisão diz o que fechou
cada um.
