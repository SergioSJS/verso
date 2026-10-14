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
cada medida que custa algo às pessoas, estava `[ABERTO]` com uma
recomendação, e foi decidido em 2026-10-13 (Status).

## Decisão

Aceita em 2026-10-13. Cada ponto que estava `[ABERTO]` trazia uma
recomendação e agora está marcado `[DECIDIDO 2026-10-13]`: o mantenedor
aceitou todas as recomendações (Status). O que não tinha `[ABERTO]` está
decidido como escrito. Tamanhos: S são horas, M um ou dois dias, L mais.

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
   casador pequeno, pega exatamente as falhas. Tamanho S. *(2026-10-13, como construído: ver abaixo)*
   - `[DECIDIDO 2026-10-13]` Entregar o filtro do fail2ban no `.deb`/`.rpm` (sob
     `/etc/fail2ban/filter.d/`, inerte sem o fail2ban) ou só na
     documentação. *Recomendação:* no pacote, para que `sudo systemctl
     enable fail2ban` seja toda a configuração; os arquivos do CrowdSec na
     documentação, já que os parsers dele vivem no hub dele. *Decidido:*
     no pacote; os arquivos do CrowdSec na documentação.

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
   - `[DECIDIDO 2026-10-13]` Os números: 20 falhas por hora para o
     aviso; 10 por segundo, 50 de uma vez para o servidor.
     *Recomendação:* como está; medidos no host de 1 GB no item 18 e
     ajustados lá. *Decidido:* como está, medidos no item 18 e ajustados
     lá.
   - `[DECIDIDO 2026-10-13]` Se, depois do aviso, uma conta que tem passkey recusa a
     senha até a passkey ou um link de redefinição ser usado.
     *Recomendação:* não — é um bloqueio que um estranho pode usar, o que
     o item 9 da 0074 proíbe; o aviso e o atraso bastam. *Decidido:*
     não.

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
   tamanho do arquivo limitado no teste (abaixo de 200 KB). Tamanho S. *(2026-10-13, como construído: ver abaixo)*
   - `[DECIDIDO 2026-10-13]` Uma checagem por k-anonimato contra a API de faixas do
     Have I Been Pwned (cinco caracteres do SHA-1 enviados, nada que
     identifique). *Recomendação:* não — é um pedido de saída a um
     terceiro de um servidor que só alcança o feed de releases e o SMTP do
     host (modelo de ameaças, "o alcance do próprio servidor"), e a lista
     embutida pega o grosso das listas de stuffing. *Decidido:* não; só
     a lista embutida.

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
   - `[DECIDIDO 2026-10-13]` Se isso vem antes do primeiro usuário de
     fora ou antes do anúncio. *Recomendação:* antes do anúncio — os primeiros usuários de
     fora são pessoas convidadas num servidor com poucas contas, e os
     tokens já são limitados e revogáveis. *Decidido:* condição do
     anúncio, não do primeiro usuário de fora; construído nesta rodada
     mesmo assim (Ordem do trabalho).

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
   - `[DECIDIDO 2026-10-13]` Os números. *Recomendação:* como está — o
     uso REST de uma janela é alguns pedidos por minuto; o sync e os
     comandos da janela vão pelo WebSocket, sob o `fair.rs`. *Decidido:*
     como está, ajustados depois da medição do item 18.

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
   e a opção do PDF afirmada por `test/pdf.test.mjs`. *(2026-10-13, como construído: ver abaixo)*

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
   - `[DECIDIDO 2026-10-13]` `preload` no HSTS. *Recomendação:* não — é
     a escolha irreversível do host para o domínio dele, não o padrão do
     servidor. *Decidido:* sem `preload`.

10. **O registro de auditoria expira** (F21). `VERSO_AUDIT_DAYS`, 365 por
    padrão, 0 para nunca, limitado como `VERSO_TRASH_DAYS`; uma varredura
    uma vez por dia ao lado da da lixeira apaga linhas mais velhas que
    isso; a visão geral do console diz a retenção. `config.rs`, `db.rs`,
    `lib.rs`, `console.rs`; `packaging/server/universo.env` e o manual.
    Guardrail: um teste de que uma linha mais velha que a retenção vai
    embora e uma mais nova fica. Tamanho S.
    - `[DECIDIDO 2026-10-13]` 365 dias. *Recomendação:* 365 — um ano de
      quem entrou de onde é o que uma pessoa pede depois de um incidente,
      e são dados pessoais (endereços) que não deveriam ficar para
      sempre. *Decidido:* 365 dias.

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
    nega. Tamanho S. *(2026-10-13, como construído: ver abaixo)*

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
    - `[DECIDIDO 2026-10-13]` `age` como ferramenta (um binário estático, nos
      repositórios do Debian, Ubuntu, Fedora e Alpine, destinatários
      X25519, nenhuma gestão de chaves além de um arquivo) contra `openssl
      enc` (presente em toda parte, só senha, fácil de usar mal) ou GnuPG
      (pesado). *Recomendação:* `age`, opcional, o backup puro mantido como
      alternativa com o aviso. *Decidido:* `age`, opcional, o backup puro
      com o aviso como alternativa.

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
    - `[DECIDIDO 2026-10-13]` O endereço. *Recomendação:*
      `security@versomd.com`, uma caixa que o mantenedor lê; sem bug
      bounty. *Decidido:* `security@versomd.com`, sem bug bounty; falta o
      mantenedor confirmar que a caixa existe, o que não segura o item.

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
    - `[DECIDIDO 2026-10-13]` Se o pentest é condição do anúncio ou do
      primeiro usuário de fora. *Recomendação:* do anúncio; os primeiros usuários de fora
      são convidados e conhecidos, e os itens 1 a 5, 8 a 10 e 13 são o que
      eles precisam. *Decidido:* condição do anúncio; a leitura cruzada do
      sanitizador é feita nesta rodada (Ordem do trabalho).

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
    - `[DECIDIDO 2026-10-13]` Prova de trabalho. *Recomendação:* não,
      registrada como considerada. *Decidido:* não.
    - `[DECIDIDO 2026-10-13]` A página de aparelho pede que a pessoa digite o código
      quando o link não traz nenhum, como o GitHub faz, e mostra o
      digitado. *Recomendação:* sim, S, com o item 6; o link fica para o
      fluxo do próprio app. *Decidido:* sim, com o item 6.

18. **Os números medidos.** Os números de conexão, fila, ritmo e bucket
    dos itens 2 e 7 e da superfície de ataque do modelo de ameaças são
    medidos no servidor de 1 núcleo e 1 GB do laboratório com o kit, sob
    uma inundação de conexões, de sign-ins e de comandos, e registrados em
    `docs/reference/server-install.md`, seção 15, com a data; um número
    que a medição contradiga é mudado no mesmo PR. Tamanho M.

19. **Validação num laboratório hostil.** Decidida pelo mantenedor em
    2026-10-13, na mesma resposta que aceitou as recomendações: *"em
    seguida você deve emular um ambiente de ataque um ambiente hostil para
    validar todas as implementações e outras. Tenha em mente que o código
    é aberto, então o atacante se quiser ele vai ler o código, vai tentar
    encontrar a vulnerabilidade no código e usar isso a seu favor."*
    Construídos os itens acima, eles são validados num laboratório de
    ataque local, em Docker: o servidor rodando, e ataques roteirizados
    contra ele — pela rede, como estranho e como membro hostil — escritos
    supondo que o atacante leu o código-fonte, já que o código é público.
    Os achados são classificados com os níveis da
    [0033](0033-pr-workflow.md), e as correções feitas com a mesma
    suposição. Não substitui o pentest do item 16 por uma pessoa de fora
    do projeto.

### Ordem do trabalho

*(Reescrita em 2026-10-13, quando o ADR foi aceito. Como proposta, punha
os itens 1, 2, 3, 4, 5, 8, 9, 10 e 13 antes do primeiro usuário que não
seja o mantenedor, e os itens 6, 7, 11, 12, 14, 15, 16 e 18 antes do
anúncio; o mantenedor mandou construir tudo agora: "toda rotina de
segurança possível que faça sentido para nossa aplicação tem que ser
implementada e feita".)*

- **Nesta rodada, a partir de 2026-10-13:** todos os itens — 1 a 15, 17,
  18 e 19 — e a leitura cruzada do sanitizador do item 16, na ordem
  numerada onde um depende de outro (o código de aparelho digitado do
  item 17 com o item 6; a medição do item 18 depois que os números dos
  itens 2 e 7 existirem; o item 19 depois dos itens que ele ataca). O
  item 18 mede no servidor do laboratório.
- **Fora desta rodada, condição do anúncio** (0073 item 6): o teste de
  penetração do item 16 por uma pessoa de fora do projeto. A prova
  recente do item 6 também foi decidida como condição do anúncio, não do
  primeiro usuário de fora, e é construída nesta rodada mesmo assim.
- **Depois, em ADRs próprios ou nunca:** OIDC e TOTP (0074 item 3), um
  registro de leituras por pasta (seção 2.7 da revisão), o token de
  aparelho no chaveiro do sistema e criptografia de ponta a ponta (os
  `[ABERTO]` do modelo de ameaças), ACME embutido (0073 item 6). Nunca, a
  menos que o mantenedor diga o contrário: um CAPTCHA, uma prova de
  trabalho, o Have I Been Pwned, bloqueio de conta.

## Como construído (2026-10-13)

Construído em 2026-10-13 no branch `docs/security-hardening`, nos merges
de sec/edge (cf0aa7f: itens 5, 7, 8, 9), sec/sign-in (fcddbf8: itens 1 a
4), sec/ops (29d11f7 e b5b9dae: itens 10 a 13 e 15) e sec/prove (c6fbf1a:
itens 6 e 17), sec/fuzz (d5ea899 e c1bc4cc: item 14) e
sec/sanitizer-harness (0b5fea1: a leitura e a bateria do item 16).
Abaixo, item por item, onde o código se afasta do texto da Decisão ou o
lê de um jeito entre vários, como os construtores registraram nos
commits. Os itens 18 e 19 não estão nesses merges, nem o pentest do
item 16, que fica fora desta rodada. Um fato tirado do relato de um
construtor e não achado no código nem num commit diz *(relatado)*.

**Item 1** (e9dda35). O `failregex` da Decisão não pega nada: o fail2ban
corta a hora de uma linha que lê de um arquivo, e põe
`<host> <programa>[<pid>]: ` antes de uma linha que lê do journal, então
`^\S+ WARN` não casa com nenhuma das duas; e `<HOST>` não aceita o /64 que
a linha traz para IPv6. O filtro entregue é
`^\s*(?:\S+ \S+: )?(?:\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ )?WARN sign-in failed from <SUBNET> for \S+ \(\d+ in a row\)$`,
a jail lê o journal (`backend = systemd`), e o nfpm instala os dois
arquivos como `config|noreplace`. O casador do teste expande `<HOST>`,
`<ADDR>` e `<SUBNET>` como o fail2ban 1.1 faz e roda o filtro sobre as
linhas que um servidor de teste escreveu, nas duas formas; ele usa `regex`
como dependência de desenvolvimento (já na árvore, MIT OR Apache-2.0). O
`log::line` troca os caracteres de controle de uma mensagem por espaços,
então nenhuma mensagem escreve uma segunda linha. O poll de um aparelho não
nomeia conta: a linha dele diz `for -` e a contagem dele usa a chave
`device:<endereço>`. `sign-in limited` é dito por todo chamador de
`api::limited`, pelo início da passkey e pelo início do aparelho.

**Item 2** (805febb, 97cfd3e). "Contas sob ataque hoje" é lido como as
últimas 24 horas. O aviso é uma linha do registro de auditoria,
`sign_in_noticed`, então a regra de uma vez por dia vale através de um
reinício; a linha é escrita tenha o servidor um servidor de e-mail ou não,
e as palavras do console não dizem mais que isso (97cfd3e). Uma passkey
recusada e uma senha atual errada numa troca contam entre as 20. Todo
sign-in — por senha, pelo fim de uma passkey, pelo poll de um aparelho —
espera a dívida do servidor antes de ser ouvido, a dívida nunca mais funda
que 2 s.

**Item 3** (c77902e). O top 10 000 do SecLists tem só 24 senhas de 12
caracteres ou mais, e nem `password1234` nem `qwertyuiop12`; a lista é
então as 10 000 mais comuns de 12 caracteres ou mais da lista xato-net de
um milhão do mesmo projeto (MIT), com o commit, o endereço e o SHA-256 da
fonte e o comando que a fez em `crates/verso-server/passwords.LICENSE`;
140 276 bytes. Uma senha igual ao e-mail da conta ou à parte local dele
responde o mesmo `common_password`. Uma redefinição checa a senha antes de
o link ser usado, então uma recusada deixa o link utilizável.

**Item 4** (ac59422, 66debdc). `revokeTokens` tem false como padrão no
servidor, para páginas mais antigas que a mudança; o formulário da janela o
oferece marcado por padrão. `universo admin reset` também revoga os
tokens, com as linhas de auditoria com o endereço `machine`. As consultas
dos tokens foram antes, sem mudança, para `db/tokens.rs` (66debdc,
[0067](0067-source-files-stay-small.md): `db.rs` estava com 1 486
linhas), onde fica o `revoke_tokens_of`.

**Item 5** (748838d). O `X-Forwarded-Proto` ainda é aceito de qualquer
par confiável, sem ser percorrido como o `X-Forwarded-For`. As receitas do
Cloudflare de `docs/reference/server-install.md` seguem as opções
documentadas do Caddy e não foram testadas contra um Cloudflare real
*(relatado)*.

**Item 7** (9b4cdf0, 023dcc0, 4bbd292). Só uma conexão direta do loopback
fica fora do ritmo (023dcc0): através de um proxy todo mundo entra no
ritmo pelo endereço percorrido, ou, quando o proxy não encaminhou nenhum,
pelo endereço do próprio proxy como uma chave só — senão um `127.0.0.1`
encaminhado ficaria isento, e um proxy que não encaminhasse nada
desligaria o ritmo. Um upgrade de WebSocket recusado tira um pedido do
ritmo e é respondido 429 além dele, já que o `fair.rs` conta só sockets
aceitos. No máximo 10 linhas de "além do ritmo" por minuto para o servidor
inteiro, depois uma linha que conta o resto (4bbd292). O mapa de buckets é
limitado a 100 000 chaves, o décimo usado há mais tempo descartado.

**Item 8** (cb05804, 4b892cc). O `max_buf_size(64 KiB)` do hyper sozinho
deixa passar uma cabeça que chega numa leitura só (visto: 100 KiB
respondeu 200), então o `guard` do roteador também responde 431 além de
64 KiB. `isEvalSupported` não existe mais no pdfjs-dist 6.3.289 (o tsc
recusa a chave), e o build dele não tem chamada `eval(` nem construtor
`Function(`: o F22 fica sem objeto como escrito, e o guardrail dele é um
teste em `app/ui/test/pdf.test.mjs` que afirma isso de `pdf.mjs` e
`pdf.worker.mjs` (4b892cc). O segredo certo de um poll é respondido
qualquer que seja o atraso do endereço; o atraso só freia polls errados,
para que um estranho atrás do mesmo endereço não impeça o app de entrar
([0074](0074-accounts-and-access-on-the-server.md) item 9). A chave de
e-mail só é usada para um texto com `@`.

**Item 9** (7cd1383). Como escrito; sem `preload`. O conjunto inteiro é
afirmado em `tests_threats.rs`, por HTTP simples nesta máquina e com um
endereço público HTTPS.

**Item 10** (99683ed). No máximo 36 500 dias, um parser só, compartilhado
com `VERSO_TRASH_DAYS`. A varredura roda no início e uma vez por dia;
nenhuma rota, comando ou configuração a dispara ou nomeia uma linha, então
ela não é um jeito de apagar evidência.

**Item 11** (d2af446, 024b9f8). O `scripts/check-linux.sh` não tem
passo de pacote. A unidade e a imagem somente leitura são iniciadas pelo
`scripts/check-server-image.sh`, desde 024b9f8 o último passo do
`scripts/check-linux.sh` e fora da CI (somaria vários minutos ao job Linux
de todo pull request): o compose lido e o endurecimento dele
checado, a imagem rodada com as mesmas flags, depois o binário estático
disposto como o `nfpm.yaml` o dispõe num contêiner Debian 12 rodando
systemd, iniciado pelo `universo.service`, e checado rodando sob seccomp
com a pasta 0750 e o banco 0600; visto falhando com uma escrita fora dos
volumes e com um `SystemCallFilter=~bind` fabricado. Rodado no Docker em
arm64, exposição 1.3 no `systemd-analyze security`
(`docs/reference/server-install.md`, seção 15). O
`docker-compose.yml` em 2409498 era YAML inválido (dois-pontos sem aspas
num slogan do CasaOS): posto entre aspas. O segredo do Docker para a senha
do primeiro admin aparece comentado, já que o `docker compose up` se
recusa a iniciar enquanto falta o arquivo do segredo.

**Item 12** (80f35b3). Ao lado de `backup --encrypt`, `--keygen`,
`--passphrase` e `--to-stdout`, o script ganha
`restore FILE [--identity KEY-FILE] [--to DIR]`, além da linha de
restauração que a Decisão nomeia, anotado para o mantenedor. A chave
secreta nunca é argumento de um comando e não é escrita em nenhum de
`/etc`, `/var`, `/root`, `/tmp`, `/home`, `/run`, `/usr/local` ou `/opt`,
o que o teste do script checa. A cópia do site, `public/universo.sh` no
versomd-site, tem de ser atualizada a partir da do pacote *(relatado)*.

**Item 13** (cda7500, b616d12, d160f38). Em 2026-10-13 o portão achou
cinco advisories altas sem correção que o PR pudesse tomar, e o
mantenedor decidiu (*"aceito recomendação"*): nanoid forçado para 3.3.20 e
5.1.16 (as fixações do Excalidraw); lodash-es forçado para 4.18.1 (as
fixações do chevrotain do langium e do dagre-d3-es); mermaid 12.0.0 →
12.2.0 (uma dependência direta, aprovada); braces 3.0.3 como exceção em
`app/ui/audit-exceptions.json` até 2027-01-11 — a mais nova publicada,
ainda coberta, chegando à árvore por Excalidraw → sass → chokidar e
ausente do bundle da janela. source-map-js 1.2.1 → 1.2.2 no lockfile.
Resta uma advisory baixa, do KaTeX *(relatado)*: o portão lista as
baixas e as moderadas e falha só em alta e crítica.

**Item 15** (cfd382f, e779585). `Expires` é um ano depois da data que o
`CHANGELOG.md` dá à versão construída (o binário embute o changelog; não
tem data de build própria), e o teste checa essa data, não o relógio
(e779585). `Canonical` só atrás de um endereço público HTTPS (RFC 9116).
`Policy` aponta para o `SECURITY.md` do repositório no GitHub, que
responde 404 ao público enquanto o repositório é privado *(relatado)*. A
linha suportada é a release mais nova. O site tem de servir o mesmo
arquivo *(relatado)*; que a caixa de e-mail existe ainda cabe ao
mantenedor confirmar.

**Item 6** (40de8b5, 1d7c4e4). A sessão guarda `proved_at` (schema 9),
carimbado por toda criação de sessão — um sign-in por senha, passkey ou
link de e-mail, uma redefinição, um convite, e até o 463ed1ad a aprovação
de um aparelho: a sessão de um aparelho nasce sem prova desde então (o S7
da segunda revisão, abaixo).
`POST /api/me/prove` por senha passa pelas chaves, pela vez, pelo hash e
pela recusa do próprio sign-in (itens 1 e 2) e responde 403
`signin_failed`; por passkey, `POST /api/me/prove/passkey` inicia a
cerimônia. Exigem a prova além da lista da Decisão: a troca de senha, o
link de redefinição que o admin faz para outra conta, um dono dando ou
mudando o papel de um membro (`folders::set_member`) e o papel de um
compartilhamento (`shares::grant`). Ficam sem a prova: um convite sem pasta
nem compartilhamento — um que leve um dos dois exige a prova desde o
3d79d9ad (o S6 da segunda revisão) —, criar contas, adotar uma pasta,
cotas, a lixeira, remover um membro. A janela
pergunta na hora por `web/proof.ts` e `web/proveDialog.ts` e tenta de
novo uma vez. Um pedido com um token de acesso pessoal responde 403 "not
with an access token".

**Item 17** (73807d2). Um código digitado é limpo (`read_code`),
comparado em tempo constante com todo código pendente, e o atraso
`device:<endereço>` do endereço é checado antes de toda busca —
descrever, aprovar, recusar, pelo link ou digitado — e contado num código
errado; um código certo não o zera. A página manda o código no corpo; as
rotas com o código no caminho continuam. A prova do item 6 é checada antes
de o código ser lido.

**Item 14** (d5ea899, c1bc4cc). Sete alvos `cargo-fuzz` em
`crates/verso-server/fuzz`, um harness próprio fora do workspace como o
do dialeto: `request`, `unframe`, `note`, `board`, `presence`, `host` e
`size` (34474a0). Os leitores do próprio crate são alcançados pelo
`fuzz_api`, um módulo compilado só com a feature `fuzzing`, que nada do
que é entregue liga (f6d52f5). Na `main` cada um roda 60 s com `-O`, o
perfil de release sem asserções de debug: com as flags padrão do
cargo-fuzz uma rodada parava nas asserções e nos overflows só de debug do
yrs, que um build de release aceita (060f126); os do dialeto e do canvas
mantêm as flags deles. As sementes são versionadas por alvo, em
`fuzz/seeds-<alvo>`, cada entrada que um alvo achou entre elas. O que os
alvos acharam, e o que fechou cada achado:

- (a) Um `Host` da forma `[::1]` seguido de qualquer coisa era tomado
  pelo loopback: num servidor sem `VERSO_PUBLIC_URL` ele passava a
  checagem do `Host` e virava a origem dos links que o servidor manda por
  e-mail. O nome agora é comparado inteiro: `localhost`, `127.0.0.1` ou
  `[::1]` (fec23f4).
- (b) O yrs 0.28, o mais novo publicado, entra em pânico num build de
  release com algumas atualizações que um membro que pode escrever
  consegue mandar (7170df6). Decidido em 2026-10-13 (*"aceito
  recomendação"*): toda chamada ao yrs sobre o que uma janela mandou é
  feita sob `catch_unwind` na fronteira da sala; a atualização é recusada,
  uma linha `WARN` nomeia o id da conta, e a sala é refeita a partir do
  arquivo, como uma mudança de fora a refaz. O que um membro perde: as
  edições naquela sala desde a última escrita dela, que acontece 900 ms
  depois da última edição (606ffeb).
- (c) Uma contagem declarada maior que os bytes restantes, e um valor
  aninhado mais fundo que 64 níveis, são recusados antes de o yrs ler uma
  atualização: o `yjs_bounds.rs` percorre o layout v1 da atualização como
  o yrs o lê, cada número como o yrs o lê, e não lê conteúdo (40893a6,
  658f924, 4e1338f). Sequências de relógios apagados ou pulados de
  comprimento 0, deleções de comprimento 0 e relógios além de `u32::MAX`
  também são recusados (75872f9). Dois desses encerravam o processo
  inteiro, não um pedido: um valor aninhado o bastante estourava a pilha
  da thread (visto ao escrever os testes), e uma sequência de comprimento
  0 fazia o yrs entrar em pânico uma segunda vez durante o
  desempilhamento, um abort além da captura de (b).
- (d) Uma atualização que cria ou apaga itens como o próprio cliente Yjs
  da sala além dos que a sala criou é recusada (670a07f, b7ef994). Os
  itens de outros clientes continuam sem julgamento.
- (e) Os pedidos de uma conexão rodavam lado a lado, então o próprio
  servidor reordenava as atualizações de uma janela: o único jeito de uma
  atualização legítima chegar ao caminho de pendências do yrs, onde o yrs
  lia memória liberada (heap-use-after-free do AddressSanitizer) e salas
  e janelas passavam a ler textos e boards diferentes. O `collab_update`
  de uma conexão agora espera o anterior (`rpc.rs`, uma corrente por
  conexão), e uma atualização que deixa algo pendente, ou que o yrs para
  de aplicar no meio, é recusada e a sala refeita (8d419e9). Decidido em
  2026-10-13, opção (a) (*"bora a"* *(relatado)*). O host do desktop
  escreve as perguntas de uma janela na conexão do servidor na ordem das
  chamadas (`remote.rs`, ca4c8a6); que o Tauri repassa as invocações de
  uma janela nessa ordem não foi verificado, e a janela torna a ordem
  sua: uma atualização em voo por sala, o que é digitado enquanto isso
  juntado na próxima (`updateQueue.ts`, 857f4aa).
- (f) O que o `join` manda e o que a escrita de um board diz às janelas
  são decodificados e aplicados num documento de rascunho antes de
  serem mandados, a sala refeita numa falha (ef1c389); o estado de uma
  sala também tem de ler numa janela como lê na sala (8d419e9). Custo:
  uma decodificação e aplicação do estado da sala por join e por escrita
  de board (os testes do servidor de 22 s para 33 s).
- (g) `config::size` abaixo de um byte é um erro, não mais uma cota de 0
  bytes (bc2b9fc).

Estado final: 60 s sob `-O` nos alvos `note` e `board` sem nenhum crash
*(relatado)*; as sementes, entre elas as seis entradas antes guardadas à
parte como abertas (f95226d), repassam limpas (8d419e9). Os achados do
yrs são para relatar ao projeto, esperando o OK do mantenedor
*(relatado)*.

**Item 16** (0b5fea1; e86eee8, 1e25bcf). A leitura:
`app/ui/src/sanitize.ts`, escrito pelo Opus 5.5, lido pelo Fable 5.1 em
2026-10-13, nenhum achado BLOQUEANTE e três MENORES *(relatado)*. Os
valores de `data-task-line` não são restritos, e o `toggleTask` checa de
novo que a linha tem uma tarefa antes de editar. O endereço relativo de
uma imagem chega ao `resolveAttachment` e ao confinamento do `verso-fs`,
que recusa as formas UNC e absolutas (`confine.rs`, testado no Windows).
E a caixa de bloqueio de uma página embutida guardava o host do frame
num `<template>`, que uma segunda limpeza descartava; resolvido tornando
a caixa autossuficiente (e86eee8): ela carrega o endereço e o estilo
domado do frame (`data-embed-style`), o host é montado no clique, a
origem é a do próprio endereço e nunca o `data-embed-origin` da caixa,
"carregar" só funciona para uma origem que a pessoa aprovou, e "aprovar"
e "cancelar" só para um endereço http(s). Uma caixa de bloqueio não
sobrevive a uma segunda limpeza, de propósito: uma nota não consegue
forjar uma.

A bateria: os casos de HTML hostil, 102, ficam em
`app/ui/test/sanitize-cases.mjs` e rodam no node sobre o happy-dom
(`npm test`) e no WebKit e no Chromium pelo
`app/ui/e2e/sanitize.spec.mjs` (`npm run e2e`, local, no
`scripts/check.sh`), pelo gancho `__harness.sanitize` do harness — a
instância que o `main.ts` configura — montado só no site do harness,
nunca no `dist/` (1e25bcf). Vista falhando antes com uma asserção errada
de propósito nos dois navegadores; depois três casos falharam nos dois,
as saídas seguras e as expectativas escritas para a árvore do happy-dom;
as expectativas foram corrigidas para o parser dos navegadores, e nenhuma
falha do sanitizador foi achada. O pentest por uma pessoa de fora do
projeto não está nesta rodada e continua condição do anúncio.

**A porta do arquivo compose** (2026-10-13). Deixada em aberto depois
da construção e decidida pelo mantenedor em 2026-10-13 (*"sobre as
decisões em aberto, siga as recomendações"*): o
`packaging/server/docker-compose.yml` publica a 7340 em `127.0.0.1` por
padrão (`host_ip`), com TLS na frente — Caddy, um túnel ou o Tailscale.
O comentário dele diz a única linha a trocar para publicar na LAN, para
uma caixa CasaOS numa rede de casa, e que HTTP puro na LAN não faz login
de ninguém de outra máquina de qualquer forma
([0073](0073-self-hosted-server-first.md) item 6). O
`scripts/check-server-image.sh` confere a ligação no arquivo já lido, e
um comentário não passa por ela.

**O volume do log do servidor** (2026-10-13, a parte restante do F21).
Decidido pelo mantenedor em 2026-10-13 (*"sobre as decisões em aberto,
siga as recomendações"*): o servidor não faz rotação de log nenhum por
conta própria; a rotação fica com as ferramentas do host, documentada. O log de
um pacote é a saída da unit, cuja rotação o journald faz (`journalctl
--vacuum-size`, `SystemMaxUse=`; `docs/reference/server-install.md`,
seção 5); o arquivo compose declara o driver `json-file` do Docker com
`max-size: "10m"` e `max-file: "3"` (seção 4). As 60 linhas por minuto que
uma janela pode escrever não mudam.

**O limite de taxa além dos logins, do modelo de ameaças** (2026-10-13).
O `[ABERTO]` dele fechado pela resposta do mantenedor de 2026-10-13
(*"sobre as decisões em aberto, siga as recomendações"*): os ritmos dos
itens 7 (9b4cdf0) e 2 (805febb), ao lado dos limites de conexão
construídos antes, respondem a ele; o `docs/reference/threat-model.md`
diz **Fechada: 9b4cdf0 e 805febb**. Medir os números continua o item 18.

**Duas leituras do texto da Decisão** (2026-10-13), anotadas aqui e não
reescritas acima. A guarda do item 16 é "mantida no `npm run e2e`": essa
bateria roda localmente, no `scripts/check.sh`, não na CI
([0058](0058-demo-vault-as-tutorial.md)), então a rodada dos casos do
sanitizador no navegador vale antes de um push, não num pull request. O
item 14 nomeia "o leitor de awareness do `collab.rs`": o alvo `presence`
passa pelo `presence.rs` (`presence::stamped`, que o `collab::awareness`
chama; 34474a0).

**As conferências do mantenedor no app** (2026-10-13). O que os testes
não alcançam está em `docs/reference/manual-checks.md`, nada disso
bloqueando: uma nota e um board compartilhados editados pelo app desktop
ao lado de outra janela (a ordem do (e)), o diálogo do item 6 com senha e
com passkey, o código digitado do item 17, o Mermaid 12.2.0 (item 13) e
os passos do Caddy do `universo.sh` ao lado de outro site (7755802).

**A segunda revisão (2026-10-13).** Na noite de 2026-10-13, depois de
construídos os itens 1 a 17, uma sessão de Opus 5.5 que não escreveu nada
do código leu o servidor de novo no e699b57, só lendo, supondo um
atacante que leu o código público: 25 achados, nenhum repetindo F1 a F23
— três BLOQUEANTES, todos vazamentos entre pessoas que compartilham uma
pasta, doze IMPORTANTES e dez MENORES. O
[`security-review-2026-10-13.md`](../reference/security-review-2026-10-13.md),
seção 10, os lista como S1 a S25, com o que fechou cada um. Os 25 foram
fechados nesta rodada, nos merges de sec/shares (c816ca5b), sec/pkg
(af554af2), sec/bounds (39181303) e sec/auth2 (83066f61), e nas decisões
do mantenedor abaixo, trazidas de sec/decided (c2454064). Duas das
correções mudam o contrato. O 0e9175de acrescenta `ErrorKind::ProveFirst`, que o host dá
para um 403 `prove_first` do servidor, e o comando do host
`server_prove`, que manda a senha ao `/api/me/prove` do servidor da
janela com o bearer do aparelho. O 3e39e23c remove as rotas de aparelho
que pegavam o código do caminho (`GET`, `POST` e
`DELETE /api/device/{code}`), de modo que um endereço sob `/api/` que
nenhuma rota nomeia responde 404 em vez da página, e acrescenta o comando
do host `server_sign_in_page`, que abre, uma vez, a página que o servidor
nomeou, depois que o app copiou o código.

**As decisões do mantenedor de 2026-10-14.** Quatro pontos deixados pela
segunda revisão de entrada e acesso, enviados com uma recomendação cada,
respondidos em 2026-10-14: *"com exceção do 3, sim pra recomendado. O 3:
Mudo a recomendação: deixa o app com acesso de admin"*.

- (1) 2026-10-14 — um aparelho só é aprovado com o código da tela da
  própria pessoa, como faz a CLI do GitHub: o app desktop copia o código
  para a área de transferência quando começa o fluxo, diz "Código copiado
  — cole na página que abriu", e só então abre a página
  (`serverSignIn.ts`; o novo `server_sign_in_page` do host abre a página
  que o servidor nomeou, uma vez, para que a cópia aconteça enquanto a
  janela ainda tem o foco); a página nunca preenche nem aprova a partir do
  link e sempre mostra o campo do código, com rótulo; o `start` responde o
  endereço da página sem `?code=`, e as rotas de caminho
  `/api/device/{code}` do servidor saem — um endereço sob `/api/` que
  nenhuma rota nomeia responde 404 —, então descrever, aprovar e recusar
  só existem pelas rotas de corpo com o código informado, atrás da mesma
  espera e da comparação em tempo constante. Isso revisa o "a página de
  aparelho mantém o link" do item 17 e o "as rotas com o código no
  caminho continuam" do seu Como construído.
- (2) 2026-10-14 — o `universo.sh backup --encrypt` ou `--passphrase`
  sem o `age` para com um erro e não grava nada, nem arquivo nem fluxo,
  dizendo como instalar o `age` na família desta máquina (`age_install`,
  ao lado do `caddy_install` sobre o `dnf_install` comum); o backup
  simples só é feito quando nenhuma criptografia é pedida. Isso substitui
  o "sem o `age`, o script diz como instalá-lo e faz o tarball puro com
  o aviso atual em maiúsculas" do item 12.
- (3) 2026-10-14 — a recomendação mudada pelo mantenedor: a sessão de
  aparelho do app desktop mantém as rotas de admin, cada uma sensível
  atrás da prova recente do item 6, como está desde o 463ed1a (a sessão
  de um aparelho nasce sem prova) e o 0e9175d (o app prova com a senha).
  Nenhum código muda; a seção 9 do `server-install.md` e o
  `server-hands-on.md` dizem que uma ação de admin pelo app pede a senha
  de novo.
- (4) 2026-10-14 — o nome da nota de pasta é do dono da pasta, como as
  regras de varredura: um membro que não é o dono mudando os ajustes da
  pasta (`set_folder_settings`) deixa o `folder_note_name` como estava,
  como o `set_folder_note_name` já fazia (`rpc.rs`,
  `without_owners_settings`); a mudança do dono o define.

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
- **O laboratório hostil do item 19**: a rodada termina com o servidor
  rodando atacado, em Docker, por roteiros escritos por quem leu o
  código. O projeto paga o laboratório e o tempo dele; ganha que cada
  medida foi vista resistindo a um atacante que a conhece, não só ao
  próprio teste dela.
- O que fica como está, dito de novo: o host vê as notas; o servidor só
  alcança o feed de releases e o SMTP do host; nada de um membro sai do
  servidor para um terceiro; acessibilidade não é trocada por um portão.
- O modelo de ameaças ganha um ponteiro para a revisão e para este ADR, e
  marca a lacuna 10 como respondida pelo item 16 quando ele for feito; é
  atualizado de novo quando os itens desta rodada estiverem construídos.

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
- **Cifrar o backup com `openssl enc` ou GnuPG** em vez de `age`: a
  decisão do item 12, o `age`.
- **Um registro de leituras por pasta** para distinguir raspagem de
  leitura: uma linha por leitura, registrado para um ADR posterior, não
  agora.

## Status

**Aceita (2026-10-13).** Escrita por Fable 5.1 a pedido do mantenedor;
lida por Opus 5.5 em 2026-10-13, que confirmou F1, F3, F4 e F5 contra o
código. O mantenedor recebeu as decisões em aberto com as recomendações e
a pergunta *"todas como recomendado?"*, e respondeu em 2026-10-13:
*"seguinte eu preciso que você implemente tudo isso toda rotina de
segurança possível que faça sentido para nossa aplicação tem que ser
implementada e feita [...] em seguida você deve emular um ambiente de
ataque um ambiente hostil para validar todas as implementações e outras.
Tenha em mente que o código é aberto, então o atacante se quiser ele vai
ler o código, vai tentar encontrar a vulnerabilidade no código e usar
isso a seu favor. Então você deve levar isso em conta nas correções e
também na hora que você fizer uma rotina de ataques nesse servidor."*

O *"tudo isso"* aceita todas as recomendações: cada `[ABERTO]` está
decidido como recomendado e marcado `[DECIDIDO 2026-10-13]`. O resto da
resposta acrescenta o item 19, o laboratório hostil, e faz da ordem do
trabalho uma rodada só: todo item é construído nesta rodada, menos o
pentest do item 16 por uma pessoa de fora do projeto, que continua
condição do anúncio. Os itens vão num PR só com os guardrails deles, cada
um visto falhando antes ([0029](0029-guardrails-in-ci.md)), e a tabela de
achados da revisão diz o que fechou cada um.

**Construído em 2026-10-13** (Como construído): itens 1 a 15 e 17, e a
leitura do sanitizador do item 16 com a bateria dele rodada no WebKit e no
Chromium. Fora desses merges: a medição do item 18 e o laboratório hostil
do item 19. Fora desta rodada: o pentest do item 16 por uma pessoa de fora
do projeto, condição do anúncio.
