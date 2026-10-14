# Revisão de segurança do UniVerso (2026-10-13)

- Data: 2026-10-13
- Por quê: o mantenedor pediu, em 2026-10-13, uma análise de segurança do
  UniVerso — *"a aplicação deve ser resistente a ataques hackers, nos
  proteger de acessos a bots e etc."* — e um ADR que a transforme em
  trabalho, o [ADR 0083](../adr/0083-security-hardening-of-universo.md).
  O [ADR 0073](../adr/0073-self-hosted-server-first.md), item 6, pede
  segurança "por inteiro" antes do primeiro usuário que não seja o
  mantenedor.
- Escrita por Fable 5.1 a pedido do mantenedor, uma troca dos papéis do
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md) (documentos são do
  Opus); lida por Opus 5.5 em 2026-10-13 (ADR 0083, Status). Não decide
  nada: cada achado traz uma severidade como recomendação, e o que depende
  do mantenedor está `[ABERTO]` no ADR. A última coluna da tabela de
  achados, acrescentada em 2026-10-13, diz o que fechou cada um.
- Contra o HEAD af4d73a de `feat/universo`. Lido para esta revisão:
  `crates/verso-server/src` (`http.rs`, `auth.rs`, `api.rs`, `device.rs`,
  `passkeys.rs`, `limit.rs`, `listen.rs`, `fair.rs`, `tls.rs`, `rpc.rs`,
  `crypto.rs`, `db.rs`, `config.rs`, `update.rs`, `mail.rs`, `log.rs`,
  `files.rs`, `console.rs`, `collab.rs`, `collab_board.rs`, `scope.rs`,
  `share_links.rs`, `lib.rs`), `crates/verso-service/src/files.rs`,
  `crates/verso-fs/src/lib.rs` e `server.rs`, `app/ui/src/sanitize.ts`,
  `app/ui/src/web/pages.ts`, `app/ui/src/screen/framed.ts`,
  `app/ui/src/pdf.ts`, `app/ui/src/mermaid.ts`, `packaging/server/*`,
  `.github/workflows/*.yml`, `deny.toml`, o modelo de ameaças
  (`threat-model.md`, atualizado em 2026-10-11) e os ADRs 0045 e 0073 a
  0082.
- Como foi verificado: lendo, e rodando `verso serve --web` numa porta de
  loopback deste Mac com um diretório de dados descartável, sondado com
  `curl`, `nc` e um socket em Python (seção 8). Nada gráfico foi rodado;
  nada além desse servidor foi sondado.

O modelo de ameaças de 2026-10-11 é a base: lista o que está construído e
fechou 15 das suas 17 lacunas. Esta revisão não repete as linhas dele;
lê o código mais uma vez com a pergunta do mantenedor na mão — bots,
abuso e ataques de fora — e diz o que está no lugar, o que falta, e o
quanto a lacuna pesa para um lançamento a um primeiro usuário que não
seja o mantenedor, pelos níveis do [ADR 0033](../adr/0033-pr-workflow.md):
BLOQUEANTE (uma invariante, um guardrail, uma decisão, ou dados),
IMPORTANTE (resolvido ou adiado com registro), MENOR (a critério do
autor).

## 1. Resumo

**No lugar, e verificado no servidor rodando:** o `Host` conferido antes
de toda rota (421 senão); o `Origin` em todo pedido que muda algo, no
próprio sign-in (login CSRF) e no WebSocket antes de aceitar o cookie; um
token CSRF por sessão; o cookie `HttpOnly`, `SameSite=Lax`, `Secure` e
`__Host-` sobre HTTPS; Argon2id nos primeiros parâmetros da OWASP, no
pool bloqueante, com o mesmo tempo gasto num endereço desconhecido; um
atraso crescente por endereço e por conta em sign-ins, links, códigos de
aparelho, passkeys e e-mail; o corpo da API em 1 MB no máximo (413 além
disso); os prazos de conexão, cabeçalhos e pedido; os limites do
WebSocket; os arquivos das pastas sob `Content-Security-Policy: sandbox`
e `nosniff`; a política da própria janela como cabeçalho; o confinamento
de caminhos com symlinks mantidos dentro da pasta; o banco `0600`; a
unidade do systemd em sandbox; o contêiner como uid 1000; releases
assinadas com minisign e o instalador conferindo; GitHub Actions fixadas
por commit; `cargo deny` para advisories e licenças.

**Achados por severidade.** Nenhum é BLOQUEANTE: nenhuma invariante,
guardrail ou decisão aceita é violada e nenhum achado perde dados. Os
IMPORTANTES são o que separa este HEAD da "segurança por inteiro" do
item 6 do ADR 0073:

| # | Achado | Severidade | Onde | Fechado por (ADR 0083, 2026-10-13) |
|---|---|---|---|---|
| F1 | Um sign-in que falha não escreve linha no log do servidor: só a tabela de auditoria. fail2ban e CrowdSec não veem nada; uma força bruta é invisível ao host até a página de auditoria ser lida | IMPORTANTE | `api.rs:149-157`; sondado: 12 falhas, o log vazio | item 1: e9dda35 |
| F2 | Nenhum teto sobre tentativas de sign-in além do atraso por chave: a 60 s por chave, uma conta recebe ~1 440 palpites por dia para sempre, de um endereço ou de muitos, e ninguém é avisado | IMPORTANTE | `limit.rs:69-73,101`, `api.rs:124-126` | item 2: 805febb, 97cfd3e |
| F3 | A senha só é conferida pelo tamanho (12): uma senha comum de 12 caracteres passa; sem lista de recusa, sem aviso no sign-in | IMPORTANTE | `api.rs:70-78`, `config.rs:128` | item 3: c77902e |
| F4 | Uma redefinição ou troca de senha encerra as sessões e deixa os tokens de acesso pessoal: o token de um atacante sobrevive à recuperação da pessoa | IMPORTANTE | `api.rs:413-416`, `api.rs:484-487`; o `end_all_of` do admin revoga (`admin.rs:171`) | item 4: ac59422 |
| F5 | Um só endereço de proxy confiável: atrás do Cloudflare, ou de qualquer proxy com vários endereços, os cabeçalhos encaminhados não podem ser acreditados, e todo limite por endereço passa a usar o endereço do proxy — as três falhas de um estranho atrasam o sign-in de todo mundo | IMPORTANTE | `config.rs:171-176`, `auth.rs:99-116` | item 5: 748838d |
| F6 | As entradas do próprio servidor não passam por fuzzing: os pedidos JSON do WebSocket, as atualizações Yjs, os quadros do sync e os estados de presença; só o dialeto e o leitor de canvas passam | IMPORTANTE | `.github/workflows/ci.yml:236-261`; `collab.rs:460`, `rpc.rs:322-331` | item 14: d5ea899 e c1bc4cc (os merges): fec23f4 (`Host`), 606ffeb (os panics do yrs capturados), 40893a6, 658f924, 4e1338f, 75872f9 (contagens, profundidade, sequências sem comprimento), 670a07f, b7ef994 (o próprio cliente da sala), ef1c389 (o que uma janela recebe), 8d419e9, ca4c8a6, 857f4aa (a ordem), bc2b9fc (`config::size`), 060f126 (`-O`) |
| F7 | As dependências npm são conferidas por licença, nunca por advisories; os renderizadores (PDF.js, Mermaid, KaTeX, Excalidraw, Yjs) já tiveram advisories de XSS e prototype pollution | IMPORTANTE | `ci.yml:80-81,142-144`; nenhum `npm audit` em lugar nenhum | item 13: cda7500, b616d12, d160f38 |
| F8 | Nenhum jeito de relatar uma vulnerabilidade: sem `SECURITY.md`, sem `/.well-known/security.txt`, sem política de divulgação ou prazo de resposta declarados | IMPORTANTE | raiz do repositório; `http.rs:266-418` (sem rota) | item 15: cfd382f, e779585 |
| F9 | A revisão externa que o item 6 do ADR 0073 pede continua aberta (lacuna 10 do modelo de ameaças); a revisão do sanitizador pelo modelo que não o escreveu também | IMPORTANTE | `threat-model.md`, lacuna 10 e o primeiro `[ABERTO]` | item 16: o sanitizador lido pelo Fable 5.1 em 2026-10-13 e sua bateria rodada no WebKit e no Chromium (e86eee8, 1e25bcf; 0b5fea1); o pentest pendente, condição do anúncio |
| F10 | Um backup é um tarball em claro com as notas, o banco e o arquivo env (uma senha dentro, talvez); o manual manda copiá-lo para fora da máquina, em claro | IMPORTANTE | `packaging/server/universo.sh:819-879` | item 12: 80f35b3 |
| F11 | Uma caixa de e-mail pode ser inundada com e-mails de sign-in e de redefinição: o atraso usa o endereço do remetente, nunca o endereço de destino | MENOR | `api.rs:650-654,761-764` (lacuna 7 do modelo de ameaças, o resto) | item 8: cb05804 |
| F12 | O buffer de cabeçalhos do hyper é o padrão (~400 KiB): uma linha de cabeçalho de 200 KB foi aceita; 512 conexões × 400 KiB é um quinto do host de 1 GB | MENOR | `listen.rs:264-267`; sondado | item 8: cb05804 |
| F13 | Uma sala de nota aceita uma atualização Yjs de até 48 MB (o limite da mensagem); a sala de board limita uma a 4 MB | MENOR | `rpc.rs:40`, `collab_board.rs:49`; `collab.rs:460` | item 8: cb05804 |
| F14 | As rotas REST não têm ritmo além da família do sign-in: uma inundação de `/api/state` ou da página sem sessão é limitada só pelas conexões | MENOR | `http.rs:266-418`; `fair.rs` cobre só o WebSocket | item 7: 9b4cdf0, 023dcc0, 4bbd292 |
| F15 | Ações sensíveis não pedem prova recente: um token é criado, uma passkey adicionada, uma conta apagada pelo admin, com um cookie de 14 dias | MENOR | `api.rs:548-585`, `passkeys.rs:79`, `admin.rs:118` | item 6: 40de8b5, 1d7c4e4 |
| F16 | `HSTS` sem `includeSubDomains`; `Permissions-Policy` nomeia quatro recursos; `style-src 'unsafe-inline'`, `img-src https:`, `frame-src https:` na política da página | MENOR | `http.rs:446-454,482-486,512` | item 9: 7cd1383 |
| F17 | A rota de poll do aparelho não tem atraso próprio; a página de aprovação tira o código do link, então um link num e-mail ainda chega num botão *Aprovar* (a lacuna 12 fez a página dizer quem pediu) | MENOR | `device.rs:193-231`, `device.rs:159-183` | item 8: cb05804 (a espera do poll); item 17: 73807d2 (o código digitado) |
| F18 | O compose e o manual do Docker põem a senha do primeiro admin em `environment:`, legível com `docker inspect`; a forma `_FILE` existe e não é o exemplo | MENOR | `docker-compose.yml:52-57`, `config.rs:110-125` | item 11: d2af446 |
| F19 | O contêiner não é declarado somente leitura e mantém as capabilities no compose; a unidade poderia somar `ProtectProc`, `SystemCallFilter` | MENOR | `docker-compose.yml:25-59`, `universo.service:33-61` | item 11: d2af446 |
| F20 | Uma pasta é criada com o umask do processo (`0755` visto): num host com outros usuários locais e um diretório de pastas que eles entram, as notas ficam legíveis; o diretório `0750` do pacote as guarda | MENOR | sondado; `postinstall.sh:22-24` | item 11: d2af446 |
| F21 | Um membro escreve 60 linhas de 2 000 caracteres por minuto no log do servidor; a tabela de auditoria cresce sem retenção | MENOR | `rpc.rs:46,592-610`, `db.rs:1417` | item 10: 99683ed (a retenção da tabela de auditoria); o volume do log fechado em 2026-10-13 pelo commit que acrescenta o `logging:` do arquivo compose (rotação deixada às ferramentas do host — o journald para o pacote, os limites do `json-file` do Docker para o arquivo compose — e documentada no guia de instalação; as 60 linhas por minuto que uma janela pode escrever sem mudança; ADR 0083, Como construído) |
| F22 | O PDF.js é aberto com `isEvalSupported` no padrão (true); a política da página não tem `unsafe-eval`, então o compilador de fontes é bloqueado pelo navegador, não pelo código | MENOR | `app/ui/src/pdf.ts:246,443` | sem objeto: o pdfjs-dist 6.3.289 não tem `isEvalSupported` nem eval; teste de guardrail, item 8: 4b892cc |
| F23 | A checagem de atualização segue redirecionamentos (padrão do reqwest): um feed que redirecionasse a um endereço privado seria buscado | MENOR | `update.rs:103-114` | item 8: cb05804 |

## 2. Bots e abuso

### 2.1 Força bruta no sign-in e credential stuffing

**No lugar.** `POST /api/signin` (`api.rs:122-163`) exige um `Origin`
igual ao do servidor mesmo sem sessão (`http.rs:215-221`: login CSRF
fechado), toma o maior de dois atrasos — por endereço `in:<chave>` e por
conta `in:<e-mail normalizado>` — do `limit.rs`: três falhas livres,
depois 1 s dobrando até 60 s, esquecido uma hora depois da última falha,
zerado por um sucesso. Um endereço desconhecido também custa um hash
(`crypto.rs:76-78`). A chave de endereço é o endereço IPv4 ou o /64 do
IPv6 (`limit.rs:24-35`). O mapa de chaves é limitado a 100 000
(`limit.rs:59`).

Sondado (seção 8): três falhas respondidas com 401 em 0,23 s cada, a
quarta com 429 e `Retry-After: 1`; um endereço desconhecido respondido
com 401 em 0,237 s e o conhecido em 0,227 s — o mesmo dentro do ruído.

**Faltando.**

- *O log* (F1). Um sign-in que falha é uma linha de auditoria
  (`ctx.audit("sign_in", …, false)`, `api.rs:152`) e nada na saída de
  erro: `grep log:: api.rs` acha a linha do setup e um erro de e-mail, só.
  As ferramentas do host que banem endereços — fail2ban, CrowdSec, a do
  próprio NAS — leem o journal ou o log do contêiner, nunca o SQLite. O
  429 do limitador também é mudo. Sem uma linha, o atraso do próprio
  servidor é toda a defesa, e ele é por chave: uma botnet paga por
  endereço.
- *Um teto* (F2). O atraso satura em 60 s por chave (`limit.rs:71`), então
  uma única conta pode ser tentada umas 1 440 vezes por dia sem fim, e de
  muitos endereços a chave por conta é o único freio. O item 9 do ADR
  0074 proíbe um bloqueio que um estranho possa usar contra o dono — com
  razão — mas não diz nada sobre avisar o dono, sobre um ritmo global, ou
  sobre um teto depois do qual a conta pede um segundo fator que tenha.
  Ninguém é avisado: nenhum e-mail para a conta, nenhuma linha para o
  admin, nenhum contador no console.
- *A senha em si* (F3). `check_password` (`api.rs:70-78`) é tamanho e
  não-só-espaços. `password1234` tem 12 caracteres. Credential stuffing
  funciona com pares conhecidos: uma lista de recusa das senhas mais
  comuns (as 10 000 de uma lista pública, embutida, algumas centenas de
  kilobytes) no setup, no convite, na redefinição e na troca não custa
  nada na hora do sign-in e não precisa de terceiro; uma checagem por
  k-anonimato contra o Have I Been Pwned seria um pedido de saída que o
  servidor não faz hoje (seção 3.5).

### 2.2 Convites, cadastro e recuperação

**No lugar.** Sem cadastro aberto (ADR 0074 item 4): uma conta nasce de um
convite (`api.rs:277-351`), 256 bits, uso único, 7 dias, encerrável pelo
admin; o link de setup 1 hora, só enquanto não há conta (`api.rs:193-229`,
`lib.rs:103-146`); um link de redefinição 24 horas, uso único, toda sessão
da conta encerrada ao usar (`api.rs:382-419`). Um link errado é atrasado
por endereço (`link:`), 404 e depois 429 — sondado. As rotas de e-mail
respondem antes de procurar o endereço (`api.rs:669-678`), então o tempo
delas não diz nada. O e-mail é normalizado (NFC, minúsculas,
`db.rs:223-227`), então `Admin@` e `admin@` são uma conta só.

**Faltando.**

- *A recuperação deixa tokens vivos* (F4). `reset` define a senha e
  encerra as sessões (`api.rs:413-414`); `password` encerra as outras
  sessões (`api.rs:485`). Nenhum dos dois toca em `tokens`. Uma pessoa
  que se recupera de uma senha roubada continua servindo o token de
  acesso pessoal do ladrão, por até um ano (`api.rs:561`) ou para sempre.
  O `end_sessions` do admin revoga (`db.end_all_of`, `admin.rs:171`): a
  recuperação da própria pessoa deveria fazer o mesmo, ou ao menos dizer
  que os tokens continuam lá.
- *A aceitação diz se um e-mail tem conta* (MENOR, fora da tabela):
  `accept` responde 409 `exists` (`api.rs:307-313`) a quem tem um link de
  convite sem endereço fixo. Só quem tem o link, só um endereço por uso
  do link: baixo.
- *Inundação de caixa de e-mail* (F11): `signin_link` e `forgot` são
  atrasados só pelo /64 do remetente; o endereço de destino não é chave.
  Uma pessoa pode receber um e-mail a cada poucos segundos por /64 que o
  atacante tenha. Uma segunda chave, `mail:<e-mail normalizado>`, com o
  mesmo atraso, fecha isso.

### 2.3 A aprovação por código de aparelho

**No lugar.** O fluxo do `gh auth login` (`device.rs`): um código de 8
letras de um alfabeto de 20 (2,6 × 10¹⁰), 10 minutos, um segredo de poll
de 256 bits comparado em tempo constante, cada início atrasado por
endereço (`device:`, sondado: 200, 200, 200, 429); a página de aprovação
mostra o nome do aparelho, o endereço e a hora do pedido e pergunta *Foi
você que pediu, neste aparelho?* com um *recusar* (lacuna 12, fechada em
2026-10-12); a aprovação exige sessão de navegador com `Origin` e o token
CSRF.

**Faltando (F17).** O código viaja no link (`/device?code=…`,
`device.rs:103`) e a página está a um clique de *Aprovar*: um e-mail
dizendo "o Verso precisa que você confirme seu aparelho" com esse link
ainda é uma página de phishing com uma linha de endereço honesta. O
GitHub faz a pessoa digitar o código. O poll (`device.rs:193`) não tem
atraso: cada poll é um hash e uma busca no mapa sob o mutex dos
aparelhos, barato, e limitado pelos limites de conexão; um atraso
`device:` num segredo errado não custaria nada. Os dois são decisão do
mantenedor: a lacuna 12 foi decidida em 2026-10-12.

### 2.4 Tokens

**No lugar.** Tokens de acesso pessoal com prefixo `verso_pat_`
(scanners de segredo), SHA-256 em repouso, limitados a pastas e a ler ou
escrever dentro do papel do membro (`api.rs:548-585`), nunca as páginas
da conta, as sessões ou as rotas do admin (`http.rs:156-171`); feitos só
no navegador; um ano no máximo ou nenhum prazo dito em vermelho; listados
e revogáveis. Uma sessão de aparelho também é um bearer, presa ao tipo
`device` (`auth.rs:241-250`).

**Faltando.** F4 acima. E um token criado com um cookie de 14 dias e
nada mais (F15): uma senha ou passkey recente antes de um token ser
feito, uma passkey adicionada ou um admin agir é o que fazem os serviços
com que o Verso é comparado ("sudo mode").

### 2.5 Inundações de conexões e de mensagens

**No lugar, e os números.** 512 conexões no servidor e 128 por endereço,
tomadas antes do handshake TLS ou de um byte de HTTP (`listen.rs:32, 38,
102-127`); o handshake 10 s (`tls.rs:26`); cabeçalhos 30 s
(`listen.rs:45`), um pedido 60 s com o corpo (`http.rs:428`); o corpo da
API 1 MB (`http.rs:421`; sondado: 2 MB → 413). O WebSocket: 48 MB por
mensagem (`rpc.rs:40`), 8 pedidos em andamento (`rpc.rs:53`), uma fila de
1024 mensagens e 64 MiB, cada escrita em 30 s mais o tamanho a 32 KiB/s
(`rpc.rs:67-88`), um ping a cada 30 s e fechado depois de dois sem
resposta; 32 conexões por conta e 64 por endereço (`fair.rs:24,31`), 429
além disso; comandos a 100 por segundo por conta e 1 000 no servidor,
esperando a vez além disso (`fair.rs:37-47`); uma presença 16 KB
(`collab.rs:490`); uma atualização de board 4 MB e 10 000 inserções, a
sala 100 000 entradas e 64 MB (`collab_board.rs:49-58`); pedaços de sync
de 1 MiB, duas transferências por sentido. Cada recusa é uma linha de log
por minuto (`listen.rs:130-136`, `fair.rs:171-177`).

**Faltando.**

- *As rotas REST não têm ritmo* (F14): um cliente sem sessão pode pedir
  `/api/state` (um `SELECT COUNT(*)` em contas, `api.rs:28`), as páginas e
  os arquivos da janela tão rápido quanto 128 conexões permitam; o que
  limita é a contagem de conexões e a capacidade do próprio host de 1
  núcleo. O limite de ritmo de um proxy na frente é a resposta usual
  (seção 2.9); um pequeno token bucket por endereço no roteador, com o
  bucket do `fair.rs` já escrito, é a do próprio servidor.
- *A atualização de uma sala de nota* (F13) pode ter 48 MB;
  `Update::decode_v1` (`collab.rs:460`) recusa o que está malformado, mas
  uma atualização bem formada de dezenas de megabytes é integrada à sala
  em memória, e retransmitida a toda janela nela. Os 4 MB da sala de board
  são o precedente.
- *Cabeçalhos* (F12): o `max_buf_size` do hyper é o padrão, uns 400 KiB;
  uma linha de cabeçalho de 200 KB foi aceita (seção 8). Em 512 conexões
  são ~200 MiB de buffers de leitura, um quinto do host de 1 GB. 64 KiB é
  mais do que qualquer navegador manda.
- *Os números são raciocinados, não medidos* no host de 1 núcleo e 1 GB,
  como diz o modelo de ameaças. Uma rodada de estresse com o kit do
  laboratório é a medição que o ADR pede.

### 2.6 Uploads e cotas

**No lugar.** Os bytes de uma escrita são conferidos contra a cota da
pasta antes de qualquer coisa ser escrita (ADR 0077 item 5); o tamanho
declarado de um envio do sync no primeiro pedaço e de novo no último; os
pedaços vão para um arquivo temporário conforme chegam, um em memória por
transferência; 1 GiB por arquivo; a lixeira expira e é limitada pela cota
(ADR 0080 item 8). As lacunas 5 e 9 do modelo de ameaças estão fechadas.

**Faltando.** Nada próprio. Uma pasta sem cota definida
(`VERSO_FOLDER_QUOTA` vazia: nenhuma, `config.rs:54-56`) é limitada pelo
disco; o manual de instalação poderia dizer que uma cota é o padrão a
definir antes do primeiro membro que não seja o dono.

### 2.7 Raspagem e enumeração

**No lugar.** Sem links públicos (ADR 0081, decidido); todo arquivo e todo
comando exigem sessão e papel; uma pasta que não se pode ver responde 404
(sondado: uma travessia `/f/<id>/../../etc/passwd` e sua forma codificada
responderam 404); ids de pasta e de compartilhamento são 12 bytes
aleatórios (`crypto.rs:27`). O sign-in responde desconhecido e errado do
mesmo jeito, no mesmo tempo (sondado); o início de passkey só diz que um
endereço tem passkeys, por desenho; as rotas de e-mail respondem igual. A
exportação de auditoria coloca entre aspas as células que começam com
`=`, `+`, `-`, `@` (`console.rs:482-493`): sem injeção de fórmula no CSV.

**Faltando.** Um leitor é um leitor: um membro com acesso de leitura e um
token de acesso pessoal espelha uma pasta compartilhada a 100 comandos
por segundo, o que é uso legítimo e o servidor não distingue de raspagem.
Sem marca d'água, sem contagem de downloads, sem ritmo de leitura por
pasta. O ADR 0081 deixou o histórico de um arquivo para um ADR próprio;
um registro de leituras por pasta (quem abriu o quê, visível ao dono) é
a única coisa que diria, ao custo de uma linha por leitura. Registrado,
não recomendado agora.

### 2.8 CAPTCHA e prova de trabalho

**Fora do lugar, e não obviamente desejado.** Um CAPTCHA de terceiro
(Cloudflare Turnstile, hCaptcha, reCAPTCHA) traz um script desse terceiro
para a página de sign-in — um pedido que a política da página proíbe hoje
(`script-src 'self'`, `http.rs:448`), um rastreador num servidor
auto-hospedado que não manda nada a lugar nenhum (ADR 0073, "o alcance do
próprio servidor" no modelo de ameaças), e um muro para quem usa leitor
de tela que os compromissos de acessibilidade do projeto não permitem.
Um desafio de prova de trabalho (o navegador calcula hashes até um
prefixo bater, antes do `POST /api/signin`) é auto-hospedado e não precisa
de terceiro, custa a um celular um ou dois segundos, e é amigável a quem
não vê porque é invisível; aumenta o custo de uma botnet por tentativa
nesse segundo e nada mais — é um imposto, não um portão — e custa
bateria.

Os atrasos do servidor já fazem o que uma prova de trabalho faz, no
relógio do servidor em vez da CPU do cliente: depois de três falhas uma
chave espera. O que uma prova de trabalho acrescenta é um custo antes da
primeira falha, que só importa para uma inundação de primeiras tentativas
por muitas chaves — o caso que o teto global de F2 e a linha de log de F1
também respondem, sem a bateria. Recomendado no ADR: nenhum CAPTCHA; uma
prova de trabalho como `[ABERTO]` com um não.

### 2.9 O que um proxy reverso acrescenta

Um proxy na frente — Caddy, Traefik, o próprio do NAS, `tailscale serve`
— é o caminho documentado para o TLS (`server-install.md`, seção 8). O
que ele pode acrescentar, e o que o servidor precisa fazer para isso
funcionar:

- *O endereço.* O servidor acredita no `X-Forwarded-For` de um endereço
  (`VERSO_TRUSTED_PROXY`, `config.rs:171-176`), tomando a última entrada
  (`auth.rs:101-106`), que é a certa para um salto só. Cloudflare na
  frente do Caddy são dois saltos: o Caddy precisa conhecer as faixas do
  Cloudflare e reescrever o cabeçalho, e o Verso confia no Caddy — isso
  funciona hoje e não está escrito em lugar nenhum. Cloudflare direto no
  Verso não dá para configurar (F5): os endereços dele são muitos. O modo
  de falha é silencioso: todo pedido parece vir do proxy, os atrasos por
  endereço usam um endereço só, e três falhas de qualquer um atrasam o
  sign-in de todo mundo atrás dele — o bloqueio de um estranho sobre o
  dono, justamente o que o item 9 do ADR 0074 proíbe. Uma lista de
  endereços ou CIDRs, e um aviso no início quando o proxy está definido e
  um pedido dele não traz `X-Forwarded-For`, fecham isso.
- *Limites de ritmo e banimentos.* O `rate_limit` do Caddy, o `RateLimit`
  do Traefik, o bouncer do CrowdSec e o fail2ban agem sobre uma linha de
  log ou um código de status. O Verso lhes dá o 429 (com `Retry-After`) e
  nada mais: o sign-in que falha não tem linha (F1). A linha que o ADR
  propõe é um formato fixo, uma por falha, com o endereço primeiro:
  `WARN sign-in failed from 203.0.113.9 for a***@example.org (3 in a row)`
  — o endereço como o proxy o encaminhou, o e-mail mascarado, a contagem
  para um filtro banir num limiar. Um filtro do fail2ban
  (`failregex = sign-in failed from <HOST> `) e um parser do CrowdSec são
  poucas linhas cada e pertencem a `packaging/server/`, ao lado da
  unidade.
- *O que um proxy não deve fazer.* Bufferizar o WebSocket (Caddy e
  Traefik não fazem; o nginx precisa de `proxy_read_timeout` acima do
  intervalo do ping), encaminhar `Content-Length` e `Transfer-Encoding`
  juntos (o hyper usa o segundo — sondado, seção 8 — e o proxy precisa
  concordar), ou remover o `Origin`.

## 3. Ataques web

### 3.1 XSS: o sanitizador e os renderizadores

**No lugar.** `app/ui/src/sanitize.ts` é a fronteira entre membros (ADR
0073 item 6), revisado linha a linha por Opus 5.5 em 2026-10-11 com uma
bateria de 76 entradas hostis no `npm test` (*2026-10-13:* 102 casos
desde 1e25bcf, rodados no node e no WebKit e no Chromium); o "O que o sanitizador
garante" do modelo de ameaças diz o que ele mantém. O Mermaid roda em
`securityLevel: "strict"` (`mermaid.ts:27`); o KaTeX com `throwOnError:
false` e o `trust: false` padrão (`render.ts:19`, `live.ts:656,828`),
então `\url` e `\href` para `javascript:` são recusados pelo próprio
KaTeX; uma página embutida no navegador é um `<iframe>` com
`sandbox="allow-scripts allow-same-origin allow-forms allow-popups
allow-popups-to-escape-sandbox"` e `referrerPolicy = "no-referrer"`
(`framed.ts:22-27`), só na web (`sanitize.ts:106-113`), atrás da
aprovação de quem lê; um arquivo SVG ou HTML de uma pasta é servido sob
`Content-Security-Policy: sandbox; default-src 'none'; …`
(`files.rs:23`) com `nosniff` — sondado, seção 8. `<svg>` e `<math>` em
linha numa nota são descartados pelo nome.

**Faltando.**

- A revisão pelo modelo que não escreveu o sanitizador está `[ABERTO]` no
  modelo de ameaças (F9). A bateria roda no happy-dom; uma rodada no
  WebKit e no Chromium pelo harness ainda falta. *2026-10-13:*
  acrescentada em 1e25bcf — os 102 casos rodam no node sobre o happy-dom
  e no WebKit e no Chromium pelo harness (item 16 do ADR 0083).
- PDF.js (F22): `getDocument` é chamado sem `isEvalSupported: false`
  (`pdf.ts:246,443`). Desde a 4.2.67 (CVE-2024-4367) o compilador de
  fontes não avalia mais strings não confiáveis, e o `pdfjs-dist` está na
  6.x; a política da página não tem `unsafe-eval`, então `new Function`
  falha no worker de qualquer jeito. A opção custa uma palavra e faz o
  código dizer isso.
- Excalidraw: os elementos de um board vêm do arquivo de outro membro; o
  `link` de um elemento de texto é aberto pelo Excalidraw via
  `normalizeLink`, que recusa `javascript:`; não verificado nesta revisão
  além da leitura do binding da janela (`web/bridge.ts:240` abre só
  `http(s)`, com `noopener,noreferrer`). Deixado para a revisão do
  sanitizador.
- O `allow` num `<iframe>` de uma nota é mantido pelo sanitizador
  (`sanitize.ts:39`), mas o frame da nota só doa o tamanho
  (`sanitize.ts:278-280`); a `Permissions-Policy` da página nega câmera,
  microfone, geolocalização e pagamento a todo frame (`http.rs:482-486`).
  Bem; `usb`, `bluetooth`, `serial`, `interest-cohort` poderiam entrar na
  lista (F16).

### 3.2 CSP e os outros cabeçalhos

**No lugar** (sondado: `http.rs:458-515`): `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`,
`Cross-Origin-Opener-Policy: same-origin`, uma `Permissions-Policy`, HSTS
`max-age=31536000` quando o endereço é HTTPS, `Cache-Control: no-store`
na página; a política da página `default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
media-src 'self' blob: https:; frame-src 'self' https:; object-src
'none'; connect-src 'self' <origem ws>; worker-src 'self' blob:;
font-src 'self' data:; base-uri 'none'; form-action 'self';
frame-ancestors 'self'`; sob `/f/`, `Cross-Origin-Resource-Policy:
same-origin` e a política de sandbox acima.

**Faltando (F16).** `includeSubDomains` no HSTS (um subdomínio do nome do
servidor poderia definir um cookie para o pai; o `__Host-` já recusa o
que importa); `preload` é escolha do host e não deveria ser enviado por
padrão. `style-src 'unsafe-inline'` é exigido pelos estilos em linha do
renderizador (o sanitizador os doma: sem `fixed`, sem `absolute`,
`url()` só para a web); um nonce exigiria reescrever os estilos da janela
inteira — não vale a pena agora. `img-src https:` e `frame-src https:`
são a resposta I do mantenedor (conteúdo remoto por leitor). Sem
`Cross-Origin-Embedder-Policy`: não é preciso sem `SharedArrayBuffer`.

### 3.3 CSRF, CORS e cookies

**No lugar, sondado.** Um `POST` com o cookie e um `Origin` bom mas sem
`x-verso-csrf` respondeu 403 `csrf`; com o token e um `Origin` estranho,
403 `forbidden`; com os dois, 200. Nenhum cabeçalho `Access-Control-*` é
jamais definido na API (`grep` acha `cors_origin` só na política de
arquivos, sem uso no servidor): uma página de outro site não consegue ler
`/api/me`, e `SameSite=Lax` mantém o cookie fora dos pedidos de
sub-recurso dela. O WebSocket com o cookie e sem `Origin` respondeu 403;
com ele, 101. O cookie: `HttpOnly; SameSite=Lax; Max-Age=7776000`, mais
`Secure` e o prefixo `__Host-` sobre HTTPS (`auth.rs:179-194`); em
loopback puro nenhum dos dois, por desenho, e a sondagem foi em loopback.

**Faltando.** Nada. `SameSite=Strict` quebraria o link vindo de um e-mail
(a primeira navegação não leva cookie sob Strict): `Lax` mais a
conferência do `Origin` mais o token é o conjunto certo.

### 3.4 Clickjacking e redirecionamentos abertos

**No lugar.** `X-Frame-Options: SAMEORIGIN` e `frame-ancestors 'self'` em
toda página. O parâmetro `next` da página de sign-in é resolvido contra a
origem da página e seguido só quando fica nela (`pages.ts:26-36`):
`//evil.example`, `https://evil.example` e `/\evil.example` vão todos
para `/`. O próprio servidor não redireciona a lugar nenhum (nenhum
`Location` em `http.rs`).

### 3.5 SSRF

**No lugar.** O servidor busca duas coisas e nada que um membro nomeie: o
feed de releases num endereço fixo (`update.rs:20`, uma vez por dia,
desligado com `VERSO_UPDATE_CHECK=off`) e o servidor SMTP do host.
Imagens remotas e páginas embutidas são buscadas pelo navegador de quem
lê, nunca pelo servidor. Sem prévia de URL, sem importação por URL, sem
webhook.

**Faltando (F23).** `reqwest::Client::builder()` mantém o padrão de dez
redirecionamentos (`update.rs:103-107`). O feed é a API do GitHub; um
redirecionamento para `http://169.254.169.254/` exigiria que o GitHub o
mandasse. Uma linha — `.redirect(Policy::none())` — elimina a pergunta,
e o corpo da resposta é lido como JSON de forma conhecida, então nada
dele é mostrado a ninguém além da string de versão, que `parse` restringe
a números.

### 3.6 Travessia de caminhos e symlinks

**No lugar.** Todo caminho que uma janela ou um aparelho manda é confinado
antes de o `verso-fs` agir (`..`, `.`, partes vazias e caminhos absolutos
recusados; `scope.rs` para um compartilhamento, `confine.rs` para a
pasta); um symlink num servidor com membros é seguido só quando cai
dentro da pasta (`verso-fs/src/lib.rs:266-305`, `links_inside`), julgado
pelo `symlink_metadata` de cada entrada, com um limite de 40 saltos;
`/f/` recusa uma nota pelo nome em qualquer grafia
(`service/files.rs:117-131`). Sondado: as duas grafias de travessia
responderam 404.

**Faltando.** Nada encontrado. Uma corrida entre a checagem e a leitura
(um symlink trocado no meio) é o limite conhecido das checagens por
caminho em toda plataforma; o servidor roda como um usuário sem outro
escritor no diretório de pastas além dos membros através dele mesmo, e um
membro que consegue criar um symlink já é escritor daquela pasta.

### 3.7 Leitura de pedidos: tamanho, profundidade, tempo

**No lugar.** O corpo da API 1 MB (413 além disso, sondado); JSON pelo
`serde_json`, cujo limite de recursão (128) recusa um corpo profundo —
sondado com 5 000 arrays aninhados: 422; nenhuma camada de descompressão
nos pedidos, então nenhuma bomba de descompressão (`grep decompression`
não acha nada); cabeçalhos em 30 s, o pedido em 60 s; o parser do dialeto
com fuzzing e checado por tempo linear; nenhum crate de regex no
servidor, no core, no service ou no dialeto. `Transfer-Encoding: chunked`
com um `Content-Length` ao lado: o hyper segue o corpo em chunks
(sondado: o segundo pedido dentro do corpo não foi lido como pedido), que
é a escolha da RFC; um proxy na frente precisa fazer o mesmo (o Caddy
faz).

**Faltando.** F12 (o buffer de cabeçalhos do hyper) e F13 (a atualização
Yjs de uma nota). Os quadros do próprio WebSocket são lidos pelo
`tungstenite` com o limite de 48 MB por mensagem; uma mensagem fragmentada
é montada até esse limite.

## 4. Autenticação e sessões

### 4.1 Senhas e Argon2id

**No lugar.** `Argon2::default()` do crate `argon2`: Argon2id, m = 19
MiB, t = 2, p = 1 — o primeiro conjunto recomendado pela OWASP
(`crypto.rs:36-49`); a string PHC carrega os parâmetros, então uma mudança
posterior ainda verifica hashes antigos; um sal aleatório de 16 bytes;
verificação no pool bloqueante no sign-in e na troca de senha (lacuna 16
fechada). 12 caracteres no mínimo.

**Faltando.** F3 (uma lista de recusa). Uma nota para depois: quando os
parâmetros mudarem, um hash feito com os antigos é refeito no próximo
sign-in bem-sucedido — o código ainda não faz isso, e nada precisa disso
até os parâmetros mudarem.

### 4.2 Passkeys

**No lugar.** `webauthn-rs` 0.5 com verificação de usuário exigida, o id
e a origem da relying party de `VERSO_PUBLIC_URL` (`passkeys.rs:42-53`);
o estado da cerimônia 5 minutos em memória, limitado a 10 000
(`passkeys.rs:32,99`); contadores atualizados a cada uso
(`passkeys.rs:225-232`); registro só de uma sessão de navegador; um
handle de usuário opaco e estável a partir do id da conta
(`passkeys.rs:56-61`).

**Faltando.** Nada encontrado. Uma passkey não é um segundo fator para a
senha (o item 3 do ADR 0074 diz que uma passkey já é dois fatores, e que
TOTP vem depois das passkeys se pedido). A recomendação de F2 — depois de
N falhas, uma conta que tem passkey pede a passkey — é onde os dois se
encontram.

### 4.3 Sessões e tokens de aparelho

**No lugar.** Um token de sessão de 256 bits, SHA-256 em repouso,
procurado por hash (`db.rs:703-745`); 14 dias ociosa, 90 no máximo,
sessões de aparelho igual; `last_used` escrito uma vez por minuto;
listadas nos Ajustes com o navegador e o sistema do `User-Agent` (nunca a
string inteira, `auth.rs:273-304`) e o endereço; encerradas uma a uma, ou
todas as outras; uma troca ou redefinição de senha as encerra; o
WebSocket de uma sessão encerrada é avisado e fechado; o token de
aparelho do desktop `0600` em `servers.json` (Windows: as permissões do
perfil, lacuna 17 do modelo de ameaças, aberta).

**Faltando.** F4 (tokens sobrevivem à recuperação), F15 (sem prova
recente para ações sensíveis). O id de sessão não é rotacionado depois do
sign-in — ele nasce novo a cada sign-in (`create_session`), então não há
fixação contra a qual rotacionar.

### 4.4 Admin e fronteiras de privilégio

**No lugar.** `Ctx::admin()` recusa um token (`http.rs:165-171`); o admin
não tem acesso implícito às pastas — entrar numa é uma concessão a si
mesmo no registro da pasta (`admin.rs:343-358`); a escrita de um leitor,
o caminho de um compartilhamento fora da concessão, a pasta de um token
fora da lista são recusados antes de o core agir; os dois vazamentos do
item 11 do ADR 0081 (um aviso nomeando um caminho de fora) foram
fechados em 2026-10-12 (`scope.rs`, com testes); o admin não consegue
encerrar as próprias sessões pelo console (`admin.rs:161-166`); as listas
do console são paginadas no servidor.

**Faltando.** F15 para as rotas do admin. O console mostra a configuração
com os segredos como definidos ou não (`console.rs:572-604`): bem.

### 4.5 O registro de auditoria

**No lugar.** Uma linha por sign-in (falho ou não), sessão encerrada,
token, passkey, convite, concessão, compartilhamento, aparelho, cota, ação
da lixeira — quem, quando, de onde, com `ok`; lido pelo admin e, por
pasta, pelo dono; exportado como CSV com as células de fórmula entre
aspas.

**Faltando.** Resistência a adulteração contra o host está fora do escopo
(o host vê tudo); contra o admin, a API não tem delete nem update de
`audit`, que é o que importa. Sem retenção (F21): a tabela cresce para
sempre; uma linha por sign-in falho sob ataque é uma linha por tentativa
— limitada pelos atrasos, mas um ano delas são milhões. Uma retenção como
a da lixeira (`VERSO_AUDIT_DAYS`, 365 por padrão) é barata. Não auditado:
uma mudança de perfil ou de ajustes, uma leitura — por desenho.

### 4.6 Segredos nos logs e o primeiro admin

**No lugar.** Nenhuma senha, token ou link no log exceto o link de setup,
uma vez, por desenho; as linhas de log de uma janela são uma linha cada
com caracteres de controle substituídos (`rpc.rs:597-606`); o nome de um
aparelho igual (`device.rs:56-64`); o primeiro admin de
`VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD`, lidos só na primeira
inicialização e ignorados depois (`lib.rs:103-146`), ou de `_FILE`; o
arquivo env `0640 root:universo` (nfpm); o manual manda remover a senha
depois que o admin existe.

**Faltando.** F18: o exemplo do compose põe a senha em `environment:`,
que `docker inspect` e o painel mostram; a forma `_FILE` com um segredo
do Docker é a que se deve mostrar primeiro. O servidor poderia zerar as
duas variáveis no próprio ambiente depois de lê-las
(`std::env::remove_var` é unsafe desde o Rust 2024 e `unsafe_code` é
proibido — então não; o arquivo é do host). F21: `log_write` deixa um
membro escrever 120 KB por minuto de linhas que parecem as do próprio
servidor; o prefixo `window <id> (<conta>)` as distingue, o que o filtro
do fail2ban precisa respeitar (o formato de F1 não pode ser forjável por
`log_write`: a linha proposta começa com `sign-in failed from`, e a linha
de uma janela começa com `window`).

## 5. Transporte e implantação

### 5.1 TLS e HTTP puro

**No lugar.** Nada que faça sign-in ou carregue um segredo é lido sobre
HTTP puro de outra máquina (`http.rs:124-130`); o servidor escuta em
loopback a menos que mandem o contrário e recusa escutar além dele sem
`VERSO_PUBLIC_URL` (`lib.rs:173-178`); o TLS próprio é rustls com padrões
seguros (TLS 1.2 e 1.3, sem autenticação de cliente, só `http/1.1`,
`tls.rs:29-51`), o handshake numa tarefa própria com prazo de 10 s; atrás
de um proxy, `X-Forwarded-Proto: https` do endereço confiável torna o
pedido seguro; `tailscale serve` é o caminho documentado para um celular.

**Faltando.** F5 (um endereço de proxy só). ACME embutido é "depois" pelo
item 6 do ADR 0073. O certificado é lido uma vez no início: uma renovação
precisa de reinício (documentado). HTTP/2 não é falado (`alpn:
http/1.1`): bem atrás de um proxy que o fala com o navegador.

### 5.2 A unidade do systemd e o contêiner

**No lugar.** `universo.service`: `User=universo`, `NoNewPrivileges`,
`ProtectSystem=strict` com `ReadWritePaths=/var/lib/universo`,
`ProtectHome=read-only`, `PrivateTmp`, `PrivateDevices`, os
`ProtectKernel*` e `ProtectControlGroups`, `RestrictNamespaces`,
`RestrictRealtime`, `RestrictSUIDSGID`, `LockPersonality`,
`MemoryDenyWriteExecute`, `SystemCallArchitectures=native`,
`RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, nenhuma capability. A
imagem: Alpine fixado por digest, um binário musl estático, `USER
1000:1000`, nenhum shell exigido pelo servidor, `VOLUME` para os dois
diretórios.

**Faltando (F19).** A unidade poderia somar `ProtectProc=invisible`,
`ProcSubset=pid`, `SystemCallFilter=@system-service` (com `~@privileged
@resources`), `UMask=0027`; `CapabilityBoundingSet=` já está lá. O
compose poderia declarar `read_only: true` com `tmpfs: /tmp`, `cap_drop:
[ALL]`, `security_opt: [no-new-privileges:true]`; a imagem roda bem assim
(escreve só sob `/data` e `/folders`). O `run-cloud.sh` e o kit do
laboratório estão fora do pacote e não foram revisados.

### 5.3 Permissões de arquivos, backups

**No lugar.** `server.sqlite` e o journal dele `0600` a cada abertura
(`db.rs:453`, `verso-fs/src/server.rs:112-124`); os arquivos de índice
`0600` em diretórios `0700` (`verso-index/src/lib.rs:127-133`); os
diretórios do pacote `0750 universo:universo` (`postinstall.sh:22-24`); o
arquivo env `0640 root:universo`; o tarball de backup feito sob `umask
077`, recusado dentro do que copia, o serviço parado para uma cópia
consistente (`universo.sh:819-879`).

**Faltando.** F10: o tarball fica em claro e o conselho do manual é
copiá-lo para outro lugar (rclone, scp). O banco tem os hashes de senha e
de sessão; o arquivo env pode ter a senha do admin; as pastas têm toda
nota. Um `--encrypt` com `age` (um binário estático, uma chave pública que
o host guarda) ou uma senha pedida via `openssl enc` custa uma dependência
que o script não tem; o passo mais barato é o aviso nas próprias palavras
do script e um `backup --to-stdout` para encanar na criptografia do
próprio host. F20: uma pasta é criada por `mkdir` com o umask do processo
(`0755` visto neste Mac); sob o pai `0750` do pacote ninguém mais entra,
mas um diretório de pastas numa exportação de NAS ou sob `/home` é o que o
host lhe deu. `UMask=0027` na unidade (F19) e `0750` em `make_folder`
fecham isso.

### 5.4 Atualizações e cadeia de suprimentos

**No lugar.** Releases assinadas com minisign; o instalador confere a
assinatura com a chave pública do projeto, ou o sha256 que o GitHub
publicou, ou recusa a menos que `--insecure-no-verify`
(`universo.sh:447-497`); o servidor nunca se atualiza sozinho, avisa o
admin (ADR 0075 item 7); `cargo deny` para advisories, crates retirados e
licenças com exceções datadas; `Cargo.lock` e `package-lock.json`
versionados e `--locked` no CI; toda GitHub Action fixada por SHA de
commit com a versão em comentário; a lista de licenças npm permitidas; a
base da imagem fixada por digest; o `nfpm` baixado por sha256 no workflow
de release.

**Faltando (F7).** Nenhuma checagem de advisories na árvore npm: `npm
audit` (ou `osv-scanner`, que lê os dois lockfiles) não está no CI nem no
`check.sh`. A janela entrega PDF.js, Mermaid, KaTeX, Excalidraw, Yjs e
CodeMirror ao navegador de todo membro, e esses já tiveram advisories que
o `cargo deny` não enxerga. `npm audit --audit-level=high` no job do
Linux, com a mesma política de exceções do `deny.toml` (um id, um motivo,
uma validade), é o mesmo guardrail na outra metade da árvore.

### 5.5 security.txt e divulgação

**Faltando (F8).** Sem `SECURITY.md` no repositório, sem
`/.well-known/security.txt` servido, sem endereço para escrever, sem
promessa de prazo de resposta, sem declaração do que está no escopo (o
servidor, o app, o site) e do que não está (a própria máquina do host). O
repositório é privado hoje, então isso importa no anúncio; a rota custa
dez linhas (`http.rs`, um texto estático com `Contact:`, `Expires:`,
`Preferred-Languages: pt-BR, en`, `Canonical:`) e o arquivo o mesmo. A
checagem de espelho já espera um gêmeo de `SECURITY.md`
(`scripts/check-docs-mirror.sh`, no comentário dele).

## 6. Dados em repouso e privacidade

O host vê as notas (ADR 0073 item 6, as próprias palavras do compose:
*"Quem hospeda o servidor consegue lê-las: não há criptografia de ponta a
ponta"*). O que um atacante com o disco leva, em ordem de dano: toda nota
e anexo de toda pasta; o banco — e-mails, nomes, idiomas, hashes Argon2id
(atacados offline a 19 MiB e 2 passagens: lento, não seguro para uma
senha fraca, F3), os SHA-256 dos tokens vivos de sessão e de aparelho
(inúteis sem os tokens), chaves públicas de passkey, o registro de
auditoria, o registro de mudanças de cada pasta, os índices das pastas (o
texto das notas de novo, em FTS5); o arquivo env (a senha do admin se
ficou lá, a senha do SMTP, o token de atualização); a lixeira. O que não
leva: uma sessão, um token, uma senha. Criptografia em repouso é do host
(LUKS, a criptografia de volume de um NAS) e o manual deveria dizer isso
numa linha ao lado do conselho de backup.

Telemetria: nenhuma. O servidor alcança o feed de releases com a versão no
`User-Agent` e nada mais, e o servidor SMTP que o host definiu. O console
mostra ao admin as sessões de uma conta com os endereços, e o registro de
auditoria com endereços: dados pessoais sob a LGPD e o GDPR, guardados por
quem hospeda, o que a documentação diz. Uma retenção para o registro de
auditoria (F21) também é uma resposta de privacidade.

## 7. Lacunas de verificação

O que o projeto pode fazer sozinho:

- *Fuzzing das entradas do servidor* (F6): um alvo de `cargo-fuzz` por
  parser que a rede alimenta — o pedido do WebSocket (`rpc.rs:216-221`,
  via `serde_json`), `verso_core::sync::unframe`, `Update::decode_v1` numa
  sala de nota e numa sala de board (via `collab::integrate` e a fusão do
  board), os estados de presença (`collab.rs:490-520`), a leitura de `Host`
  e `Origin` (`auth.rs:121-174`), o `size` do `config.rs` — ao lado dos
  dois que existem, 60 s cada no `main`.
- *Testes de propriedade* do limitador (o atraso nunca passa de 60 s, um
  sucesso zera, o mapa nunca passa de 100 000) e de `address_key`.
- *Uma rodada de estresse* no servidor de 1 núcleo e 1 GB do laboratório
  com o kit (`docs/reference/sync-lab.md`): os números de conexão e de
  comandos medidos, não raciocinados.
- *O harness*: os 76 casos do sanitizador rodando no WebKit e no Chromium
  (`npm run e2e`), o portão de embed clicado.
- *Um teste de cabeçalhos e de cookie* em `tests_bounds.rs` ao lado de
  `the_database_the_files_and_the_version_say_no_more_than_they_must`:
  todo cabeçalho da seção 3.2 afirmado em `/`, `/api/state` e `/f/`.

O que precisa de revisor de fora (lacuna 10 do modelo de ameaças, F9): o
sanitizador pelo modelo que não o escreveu, e o servidor inteiro por uma
pessoa — um pentest da API, do WebSocket e da janela contra um membro
hostil, com o servidor do laboratório como alvo, antes do anúncio.
Auto-hospedado e privado, com o mantenedor como único usuário, não há bug
bounty que valha; um endereço de divulgação (F8) é o mínimo.

## 8. O que foi sondado num servidor local

`verso serve --web` do build deste worktree, em `127.0.0.1:7391`,
`VERSO_UPDATE_CHECK=off`, um `VERSO_DATA_DIR` e um `VERSO_FOLDERS_DIR`
descartáveis, o admin pelo ambiente. HTTP puro em loopback conta como
seguro (`auth.rs:116`), então o sign-in funciona e o cookie não tem a flag
`Secure` — esperado em loopback.

| Sondagem | Resposta | O que mostra |
|---|---|---|
| `GET /api/state`, sem sessão | 200, `version: null`, todo cabeçalho da seção 3.2 | a versão escondida de um estranho (lacuna 15); os cabeçalhos |
| `POST /api/signin` sem `Origin` | 403 | login CSRF fechado |
| `GET /api/state` com `Host: evil.example` | 421 | DNS rebinding recusado |
| 6 senhas erradas, uma conta, um endereço | 401 (0,23 s), 401, 401, depois 429 `Retry-After: 1` em 0,7 ms | três livres, depois o atraso; o log do servidor ficou vazio (F1) |
| e-mail desconhecido vs conhecido, senha errada, limitador zerado | 401 em 0,237 s, 0,227 s, 0,229 s | nenhuma pista de tempo |
| `POST /api/device/start` × 5 | 200, 200, 200, 429, 429 | o atraso de aparelho |
| `POST /api/device/poll`, segredo errado | 410 `link_gone` | o segredo é conferido, a resposta uniforme |
| corpo de sign-in de 2 MB | 413 | o limite do corpo |
| corpo de sign-in com 5 000 arrays aninhados | 422 | o limite de profundidade do serde, sem travar |
| `GET /api/invite/<palpite>` × 5 | 404 × 3, 429 × 2 | links atrasados por endereço |
| `POST /api/forgot`, sem servidor de e-mail | 400 `no_mail` | a rota fica desligada sem SMTP |
| `Content-Length` e `Transfer-Encoding` juntos, um segundo pedido no corpo | uma resposta (405 para o POST), o corpo não lido como pedido | o hyper segue o corpo em chunks |
| uma linha de cabeçalho de 200 000 bytes | 200 | o buffer padrão do hyper aceita (F12) |
| sign-in com a senha certa | 200, `Set-Cookie: verso-session=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000` | as flags do cookie (`Secure` e `__Host-` só sobre HTTPS) |
| `GET /api/state` com o cookie | a versão e o contrato | ditos a quem está com sessão |
| `POST /api/folders` com cookie, `Origin`, sem cabeçalho CSRF | 403 `csrf` | o token é exigido |
| o mesmo com o token e `Origin: https://evil.example` | 403 `forbidden` | a origem é exigida |
| o mesmo com os dois | 200, uma pasta | o caminho feliz |
| `GET /f/<pasta>/x.svg` | 404 com `Content-Security-Policy: sandbox; default-src 'none'; …`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store` | a política dos arquivos, também numa recusa |
| `GET /f/<pasta>/../../etc/passwd`, puro e codificado com `%2F` | 404, 404 | confinamento |
| `GET /api/me` com o cookie e `Origin: https://evil.example` | 200, nenhum cabeçalho `Access-Control-*` | sem CORS: outro site não consegue ler |
| upgrade de WebSocket com o cookie, sem `Origin` | 403 | a origem antes do cookie |
| o mesmo com `Origin` | 101 | o caminho feliz |
| `GET /api/admin/audit?format=csv` | as linhas, `sign_in` com `false` para as falhas | o registro de auditoria, o CSV entre aspas |
| `ls -la` do diretório de dados | `server.sqlite`, `-wal`, `-shm` em `0600`; a pasta `probe` em `0755` | o modo do banco (lacuna 13); o da pasta (F20) |

O servidor foi parado depois da última sondagem; nada dele sobra além do
diretório descartável.

## 9. Não coberto

Não lido nesta revisão, e deixado para o que ela nomeia: os scripts do
kit do laboratório (`docs/reference/sync-lab.md`), `app/src-tauri` (a
superfície própria do host desktop — o protocolo `verso://` e as web views
filhas são do desktop, não do servidor), o tratamento de um board hostil
pelo bundle do Excalidraw além do normalizador de links, o build Windows
do arquivo do token de aparelho (lacuna 17). Não medido: os números da
seção 2.5 no host de 1 GB.

## 10. A segunda revisão (2026-10-13, noite)

- Data: a noite de 2026-10-13, depois de construídos os itens 1 a 17 do
  ADR 0083.
- Feita por Opus 5.5 numa sessão só de leitura que não teve parte em
  escrever o código que leu, com duas sessões auxiliares próprias para o
  código da janela e o empacotamento, cujas afirmações principais ela
  conferiu de novo no código. O código do servidor desta rodada também foi
  escrito por sessões de Opus 5.5: é uma leitura por outra sessão, não a
  leitura pelo outro modelo do
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md).
- Contra o e699b57 de `docs/security-hardening`. Fechada nos merges de
  sec/shares (c816ca5b), sec/pkg (af554af2), sec/bounds (39181303) e
  sec/auth2 (83066f61) nesse branch, e nas decisões do mantenedor de
  2026-10-14, trazidas de sec/decided (c2454064; ADR 0083, Como
  construído).

A revisão supôs um atacante que leu o código público. Leu o código área
por área — entrada e sessões, autorização e compartilhamento, caminhos e
arquivos, tratamento de entradas e limites, pedidos de saída, o código da
janela fora do sanitizador, o empacotamento — e perguntou de cada
checagem que entrada ou sequência passa por ela, em que ela confia sem
dever, e o que acontece nos limites: vazio, enorme, malformado,
concorrente, repetido, fora de ordem, depois de um reinício. Não repetiu
F1 a F23. Nada foi construído, editado ou rodado contra um servidor; uma
auxiliar rodou no node a lógica do `next()` da página de entrada para
confirmar o S8. Cada achado veio com uma correção e um teste a escrever.
O commit de cada correção nomeia o teste que a segura, a maioria visto
falhando antes. Os níveis são os do
[ADR 0033](../adr/0033-pr-workflow.md), como na seção 1.

| # | Achado | Nível | Fechado por |
|---|---|---|---|
| S1 | Um convite para um compartilhamento, aceito depois de o compartilhamento ser removido, dava a pasta inteira em que ele estava: o `ON DELETE SET NULL` da chave estrangeira apagava o compartilhamento que ele nomeava, e o aceite tomava o ramo da pasta inteira | BLOQUEANTE | b90587cd: um convite guarda para o que foi feito (schema 10); um cujo compartilhamento sumiu não está pendente e não dá nada; remover um compartilhamento encerra os convites pendentes dele |
| S2 | Uma nota lida, escrita ou criada por um compartilhamento levava o tipo resolvido sobre a pasta inteira do dono: o caminho de um esquema fora do compartilhamento, com os rótulos e as propriedades dele, chegava a quem recebe ([ADR 0081](../adr/0081-sharing-between-people-on-one-universo.md) item 11) | BLOQUEANTE | 4f5e1e30: o tipo resolvido só sobre as raízes do compartilhamento; o `answer_out` re-enraíza os caminhos de esquema de um tipo e descarta um tipo que nomeie um de fora |
| S3 | O `links` por um compartilhamento respondia um link que resolve fora dele diferente de um link que não resolve em lugar nenhum: quem recebe e escreve links ficava sabendo se uma nota de um dado nome existia fora (ADR 0081 item 11); a revisão anotou que talvez merecesse um nível menor | BLOQUEANTE | 6ac42757: os dois respondem `outside: true`; a janela diz as mesmas palavras para os dois |
| S4 | O Argon2id não tinha limite de quantos rodavam ao mesmo tempo — uns 19 MiB cada, até as 512 threads bloqueantes do runtime, então uma rajada de entradas de um endereço podia tomar a memória do host de 1 GB — e a espera por conta era lida antes do hash e escrita depois dele, então senhas erradas mandadas juntas passavam todas por ela | IMPORTANTE | 8d3982b3: dois lugares por núcleo (dois no mínimo), 503 depois de esperar 5 s; uma tentativa em andamento por chave de entrada, 429 depois de 10 s |
| S5 | Memória por pedido: o `/f/` e as leituras de texto seguravam um arquivo inteiro, e uma cópia escapada, na memória; as respostas ficavam fora do orçamento de bytes da fila; toda mensagem, até 48 MB, era interpretada antes da checagem de papel, 8 por conexão; uma sala de nota não tinha tamanho total, e uma janela podia entrar em toda nota | IMPORTANTE | 74bf5b51 (o `/f/` mandado 256 KiB por vez, um `Range` só); 9868eb00, levado só para o servidor pelo 68745a92 (um texto de 16 MB no máximo); f7917083 (um tamanho por comando, lido antes da interpretação; 128 MB divididos pelas mensagens e respostas acima de 1 MB); 5274f9d4 (uma sala de nota 64 MB, uma janela em 64 salas) |
| S6 | O convite do admin podia levar uma pasta ou um compartilhamento, com qualquer papel até dono, sem a prova recente que entrar numa pasta pede | IMPORTANTE | 3d79d9ad: exige a prova sempre que o corpo nomeia uma pasta ou um compartilhamento |
| S7 | A sessão de um aparelho nascia provada: por dez minutos depois da aprovação, o bearer do app passava por toda rota sensível, as de um admin incluídas, com a prova feita no navegador; e um link com um código levava a uma aprovação de um clique | IMPORTANTE | 463ed1ad (nasce sem prova); 0e9175de (o app desktop prova com a senha quando o servidor pede); 3e39e23c (aprovação só com o código informado a partir da tela do app, decidido em 2026-10-14) |
| S8 | O `next` da entrada conferia a origem do endereço interpretado mas devolvia o caminho dele, que pode ser lido como outro host (`/.//host/`): depois de uma entrada de verdade, o navegador saía do servidor | IMPORTANTE | 307a648d: o caminho lido de novo contra a origem da página; qualquer outro vai para `/` |
| S9 | Escutar em loopback tornava um pedido seguro dissesse o que dissesse um proxy confiável na mesma máquina: por um proxy que repassava `X-Forwarded-Proto: http`, as entradas e o cookie delas passavam por HTTP simples | IMPORTANTE | e1e4629b: por um proxy confiável, só o `X-Forwarded-Proto` decide |
| S10 | Um proxy na mesma máquina deixado fora do `VERSO_TRUSTED_PROXY` fazia de todo visitante `127.0.0.1` sem uma palavra: uma chave para toda espera, e nenhum ritmo | IMPORTANTE | 1a33435e: duas linhas `WARN` que dizem o que definir |
| S11 | As conexões por um proxy confiável contavam só contra as 512 do servidor, e um corpo podia chegar a conta-gotas por 60 s: um cliente atrás do proxy podia ocupar todos os lugares | IMPORTANTE | 33574fe5: 32 pedidos em andamento por endereço percorrido, um corpo em até 10 s |
| S12 | Envios começados juntos eram cada um julgados contra a cota de uma pasta no primeiro pedaço, sem nada reservado: juntos, passavam dela no disco | IMPORTANTE | eff8dd87: uma escrita em andamento reserva o seu espaço na cota até chegar ou ser largada |
| S13 | O `universo.sh restore` extraía o que o arquivo tivesse, como root, sobre `/`: um backup guardado onde outra pessoa pudesse trocá-lo podia levar um arquivo fora dos caminhos do próprio backup, um link ou um arquivo set-id | IMPORTANTE | 6dd0d265: o backup listado antes e recusado inteiro, nada gravado, a não ser que toda entrada seja um arquivo comum ou um diretório sob os caminhos dele |
| S14 | O `backup --encrypt` ou `--passphrase` sem o `age` fazia o tarball simples no lugar, e com `--to-stdout` o mandava antes do aviso | IMPORTANTE | a60ccac2: para e não grava nada (decidido em 2026-10-14) |
| S15 | A jail do fail2ban da receita de Docker casava as linhas por um campo do journal que qualquer programa local pode escrever; o filtro aceitava qualquer prefixo, então uma linha nomeando `0.0.0.0/0` teria banido todo endereço; a jail não nomeava porta, então um banimento fechava o SSH também | IMPORTANTE | 270ff4ad: `_SYSTEMD_UNIT` no casamento, só um endereço IPv4 ou um /64 de IPv6, só http e https |
| S16 | Uma entrada numa conta que o admin criou, ainda sem senha, respondia sem hash: o tempo dizia que tal conta existe | MENOR | ab59886d |
| S17 | As salas de coedição eram indexadas pelo caminho como chegava: `./n.md` e `n.md` eram duas salas para um arquivo, cada uma gravando por cima das edições da outra | MENOR | d12036a4: indexadas pelo caminho confinado |
| S18 | Os mapas de códigos de aparelho, links de entrada e cerimônias de passkey (10 000 cada, saindo o décimo mais antigo) podiam ser girados de muitos endereços, empurrando para fora a cerimônia em andamento de uma pessoa | MENOR | 91e3e0af: 8 entradas por endereço em cada um; muitos endereços ainda enchem um mapa, a um custo maior |
| S19 | O nome de um aparelho guardava caracteres bidirecionais e de largura zero e era dito dentro da frase da página de aprovação, onde podia inverter ou esconder as palavras em volta | MENOR | fa44fb19, 0768690d (o ligador de um emoji mantido), b5a5bc2f (um `<bdi>` nas listas de sessões também) |
| S20 | A página do link de entrada de um e-mail o usava ao carregar: um link que outra pessoa mandou, da conta dela, punha quem o abriu na conta dela sem clique e sem nome (login CSRF por e-mail) | MENOR | 5af9de2c: a página nomeia a conta e espera um clique |
| S21 | Um navegador guardava as configurações da janela de uma conta depois de sair, as origens de página aprovadas entre elas; a próxima conta começava com elas e as salvava como suas | MENOR | 6df0727f: as configurações levam o dono; sair as esquece |
| S22 | Higiene do pacote: o arquivo do cabeçalho do token nascia `0644`; uma assinatura ausente caía no checksum sem aviso; o nome de um backup vinha só do relógio, e a checagem "dentro do que copia" comparava strings; nenhum conselho para o arquivo de identidade do restore; o token digitado onde o histórico do shell o guarda | MENOR | ecf077cc |
| S23 | `VERSO_TRUSTED_PROXY=127.0.0.1` acredita em todo programa local que se conecta à porta, não só no proxy | MENOR | 19ab906e: documentado, com uma regra que deixa a porta só para o usuário do proxy (não rodada) |
| S24 | As sobras do primeiro admin: o link de configuração continua legível no journal, e nada dizia para tirar a senha do admin do ambiente depois que o admin existe | MENOR | 19ab906e: os próximos passos da instalação, o guia e a nota do compose dizem as duas coisas |
| S25 | Um editor podia mudar as regras da varredura, e o nome da nota de pasta, pelos ajustes da pasta, embora só o dono as defina nos outros caminhos | MENOR | 38a47289; 3ff9c2b4 (decidido em 2026-10-14) |

Não é achado da revisão, fechado na mesma rodada: a página de aparelhos
parava num 429 sem nada com que tentar de novo, depois que um endereço
usava as tentativas livres (716d6a12: ela espera os segundos e pergunta
de novo sozinha, dez vezes no máximo).

O que ela achou sólido: tokens de sessão de 256 bits, guardados como
SHA-256 e novos a cada entrada, sob `HttpOnly`, `Lax`, e `Secure` e
`__Host-` em HTTPS, com o token CSRF comparado em tempo constante; links
de senha nova, convite e configuração de uso único, com validade, a senha
nova presa à conta dela; tokens de acesso limitados às pastas deles e a
ler ou escrever, nunca as páginas da própria pessoa nem as rotas do
admin, revogados por uma redefinição, os WebSockets deles conferidos de
novo antes de cada comando; papéis conferidos no REST, no WebSocket, no
`/f/` e no sync, o escopo de um compartilhamento nos argumentos e nos
envios dele (fora o S2 e o S3), o último dono e o último admin mantidos;
o confinamento de caminhos e o percurso dos symlinks, arquivos
temporários criados novos, uma pasta `0750` e o banco `0600`; o percurso
do proxy a partir da direita; destinatários de e-mail tirados de
endereços guardados, com assuntos fixos, e a checagem de versão num
endereço fixo, sem redirecionamento; nenhum segredo no log além do link de
configuração; nenhum ponto de inserção de HTML na janela fora do
`sanitize.ts`, nenhum handler de `message`, `open_url` só para http(s); o
endurecimento da unidade do systemd e do arquivo compose. Ela julgou
sólida a borda do servidor e apontou os três achados BLOQUEANTES como
vazamentos entre pessoas que compartilham uma pasta, nenhum aberto a um
estranho; o pentest do item 16 por uma pessoa de fora do projeto
continua, como ela disse, para essa classe.
