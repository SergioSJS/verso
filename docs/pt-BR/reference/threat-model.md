# O modelo de ameaças do servidor (2026-10-09)

O que o Universo — o `verso serve` — protege, de quem e como, como construído no ramo
`feat/web` em 2026-10-09. O [ADR 0073](../adr/0073-self-hosted-server-first.md)
item 6 o pede antes de o servidor ser anunciado a qualquer pessoa além do
mantenedor; o [ADR 0074](../adr/0074-accounts-and-access-on-the-server.md)
nomeia o que ele precisa cobrir do que é seu; o [ADR 0045](../adr/0045-server-and-mcp-security.md)
nomeia o risco de injeção de prompt que ele retoma. Escrito pela Opus 5.5;
não decide nada — onde uma lacuna pede decisão, diz `[ABERTO]`.

Linhas acrescentadas em 2026-10-11 para o que foi construído ou aceito
desde então: cotas por pasta (ADR 0077, construídas), as escritas do sync
pelos aparelhos (ADR 0079, construídas) e as concessões num caminho do
compartilhamento (ADR 0081, aceito, **não construído**). Esta não é a
atualização do modelo inteiro, que o mantenedor pôs em 2026-10-11 depois
do ADR 0082 e do ADR 0080 e antes do ADR 0081 (`docs/roadmap.md`, revisão
6); os `[ABERTO]` do próprio modelo continuam abertos.

## O que é protegido

| Bem | Onde | Por que importa |
|---|---|---|
| As notas e os anexos | as pastas sob `VERSO_FOLDERS_DIR` | o que a pessoa escreveu; uma pasta pode ser compartilhada por várias pessoas |
| Contas e hashes de senha | `server.sqlite` em `VERSO_DATA_DIR` | hashes Argon2id; um roubado é atacado offline |
| Sessões, sessões de aparelho, tokens de acesso pessoal, links de uso único | o mesmo banco, só como SHA-256 | cada um abre uma conta até terminar |
| Credenciais de passkey | o mesmo banco | chaves públicas e contadores; nenhum segredo |
| O registro de auditoria | o mesmo banco | quem fez o quê; a prova de um membro |
| O token de um aparelho num desktop | `servers.json` na pasta de configuração do app, `0600` | abre a conta daquele computador |

## Quem

- **Um estranho na rede** (a internet, ou um Wi-Fi de casa): sem conta.
- **Um membro**: uma conta, com papéis em algumas pastas.
- **Um membro com uma nota hostil**: escreve HTML, SVG, links ou texto
  feitos para a janela ou o agente de outro membro.
- **O admin**: cuida das contas; sem acesso implícito às pastas.
- **Quem hospeda**: quem roda a máquina ou o contêiner. Lê o disco, o
  banco e o log. Fora do escopo como adversário: a documentação diz com
  essas palavras que quem hospeda vê as notas (ADR 0073 item 6, sem
  criptografia de ponta a ponta).
- **Uma página de outro site** aberta no navegador de um membro.

## Fronteiras

1. A rede → o servidor: TLS, `Host`, `Origin`, a sessão.
2. Um membro → outro, dentro de um servidor: papéis por pasta, o
   sanitizador e as políticas da janela, o sandbox dos arquivos.
3. A página do navegador → a API do servidor: o cookie, o token CSRF.
4. O servidor → o disco: `verso-fs`, confinamento de caminhos, symlinks
   mantidos dentro da pasta.
5. O servidor → a internet: só o feed de releases.

## Ameaças e o que responde a elas

### Chegar ao servidor

| Ameaça | Resposta como construída |
|---|---|
| Uma senha ou um token lido no fio | Nada que faça login ou carregue segredo é servido sem TLS — o do próprio servidor (`VERSO_TLS_CERT_FILE`), o de um proxy configurado (`VERSO_TRUSTED_PROXY` com `X-Forwarded-Proto: https`) — ou desta máquina para um servidor que só escuta em loopback. Um segredo por HTTP simples vindo de outro lugar nem é lido. |
| Cabeçalhos encaminhados forjados para parecer seguros | Só são aceitos vindos do endereço de `VERSO_TRUSTED_PROXY`. |
| DNS rebinding: um site resolvendo o próprio nome para o servidor | O cabeçalho `Host` precisa ser o do endereço público ou um nome de loopback; senão, 421. |
| Escutar além de loopback por engano | Recusado na subida sem `VERSO_PUBLIC_URL`; o padrão é `127.0.0.1`. |

### Entrar e continuar dentro

| Ameaça | Resposta como construída |
|---|---|
| Adivinhar senhas | Argon2id (os primeiros parâmetros do OWASP); uma espera que cresce por endereço e por conta, nunca um bloqueio que um estranho possa usar; 12 caracteres no mínimo. |
| Descobrir quem tem conta | Uma senha errada e um e-mail desconhecido são respondidos igual, em tempo parecido (um hash é calculado nos dois casos); o início de uma passkey responde igual a um e-mail desconhecido e a uma conta sem passkey, e dá o desafio a uma conta com passkeys — o que diz que o endereço tem passkeys, nunca que existe uma conta sem elas. |
| Um cookie de sessão roubado | `HttpOnly`, `SameSite=Lax`, `Secure` e `__Host-` em HTTPS; 14 dias parado, 90 no máximo; listado nos Ajustes e encerrado ali; trocar a senha encerra as outras; conferido de novo antes de cada comando de um WebSocket aberto. |
| Requisições de outro site | Toda requisição que muda algo confere o `Origin` contra o do servidor e leva o token CSRF da sessão; o WebSocket confere o `Origin` antes de aceitar o cookie. |
| Um token vazado de um script | Tokens de acesso pessoal limitados a pastas e a ler ou escrever, nunca mais que o papel do membro; nunca admin; com o prefixo `verso_pat_` para os detectores de segredos; guardados como SHA-256; revogáveis. |
| O primeiro admin tomado por quem chegar primeiro | Nenhuma página de configuração aberta a qualquer um: o admin vem do ambiente na primeira subida, ou de um link de configuração de uso único, válido por uma hora, escrito uma vez no log — quem lê o log é quem roda o servidor. |
| Um admin perdido | `universo admin reset <e-mail>` (ou `verso serve admin reset`) na máquina: o acesso à máquina é o último fator; a redefinição fica no registro de auditoria e encerra as sessões da conta. |
| Um link de convite ou de senha nova repassado ou adivinhado | 256 bits, uso único, validade (7 dias, 24 horas), o uso registrado (por quem, quando), encerrável pelo admin antes do uso; tentativas desaceleradas por endereço. |
| Um aparelho aprovado por engano | A página de aprovação mostra o nome do aparelho e o código que o app mostra, pede uma pessoa já dentro no navegador, e a sessão do aparelho é listada e revogável. |
| Passkeys | WebAuthn com verificação do usuário exigida (webauthn-rs); o estado da cerimônia vive cinco minutos na memória; contadores guardados. |

### Um membro contra outro

| Ameaça | Resposta como construída |
|---|---|
| Chegar a uma pasta que não lhe foi dada | Todo comando e todo pedido de arquivo confere o papel do membro na pasta antes de o núcleo agir; uma pasta que não se pode ver responde 404. O admin não é exceção: entrar numa pasta é uma permissão dada a si mesmo, no registro que o dono lê. |
| Um leitor escrevendo | Comandos de escrita, edições de uma nota compartilhada e os ajustes da pasta são recusados abaixo do papel de editor; a janela esconde o que o papel não pode fazer. |
| XSS armazenado por um anexo (HTML, SVG) | Os arquivos são servidos de `/f/` com `Content-Security-Policy: sandbox` e `nosniff`: um documento feito deles não roda script. |
| XSS armazenado pelo HTML de uma nota | O sanitizador do HTML das notas da janela é a fronteira entre membros (ADR 0073 item 6); a política da própria janela, enviada como cabeçalho, só permite scripts do servidor. `[ABERTO]`: uma revisão dedicada do sanitizador contra notas hostis antes do anúncio. |
| Conteúdo remoto revelando quem lê | Imagens remotas e páginas incorporadas seguem o ajuste do próprio leitor, nunca o do autor (a resposta I do mantenedor). |
| Symlinks levando para fora de uma pasta compartilhada | Num servidor, um link só é seguido quando leva para dentro da pasta; um que sai é recusado e listado como problema. |
| Uma edição que apaga o texto de outro | A edição simultânea mescla; uma escrita vinda de fora é mesclada linha a linha ou recusada como mudada; uma mudança feita fora enquanto há edições esperando para a sala para as pessoas escolherem. `[ABERTO]`: histórico, atribuição e recuperação da mudança de outro membro (ADR 0073). |
| Uma mensagem enorme para esgotar a memória | Uma mensagem de WebSocket tem 48 MB no máximo; uma atualização Yjs malformada é recusada. O espaço de uma pasta é limitado pela cota dela (ADR 0077 item 5, aceito e construído em 2026-10-10): uma escrita que a passaria é recusada e nada é escrito. `[ABERTO]`: um limite global de comandos. |

### Um aparelho que sincroniza

| Ameaça | Resposta como construída |
|---|---|
| Um aparelho escrevendo onde a conta dele não pode | Um aparelho sincroniza pela sessão de aparelho dele (ADR 0074 item 8): cada escrita, apagamento e mudança de nome que ele envia é conferido contra o papel da conta na pasta antes de o core agir — o aparelho de um leitor recebe, as mudanças locais dele recusadas (ADR 0079 item 1) — e uma escrita contra a cota da pasta (ADR 0077 item 5). |
| A escrita de um aparelho sobre uma versão mais nova | Toda mudança que um aparelho envia nomeia o hash em que se baseou e é recusada quando o arquivo no servidor não é mais aquele (invariante 11); o aparelho então guarda os dois, o seu como cópia de conflito (ADR 0079 item 8). Decidido em 2026-10-11, não construído: dois acréscimos puros ao fim de uma nota juntados em vez disso, ditos "juntado" no registro do sync. Um limite conhecido: um programa fora do Verso salvando um buffer velho é uma mudança comum (ADR 0079, achado F18); guardar a versão que ele substituiu é o item 12 do ADR 0080, aceito, não construído. |
| Um aparelho apagando os arquivos de uma pasta | Um apagamento que um aparelho envia é conferido contra a base dele como uma escrita e vai para o `.trash/` da pasta no servidor; no computador, uma passada que apagaria mais de um quinto dos arquivos ou mais de 50 (pelo menos 3) pausa e pergunta (ADR 0079 item 9), e um placeholder nunca é um apagamento (ADR 0043). Ver e restaurar a lixeira na janela é o ADR 0080, aceito, não construído. |
| Um token de aparelho roubado | Guardado `0600` no computador (acima), listado entre as sessões da conta e revogável ali; o registro de mudanças nomeia o aparelho ao lado da conta (ADR 0079 item 4). Decidido em 2026-10-11, não construído: um admin pode encerrar as sessões de outra conta e revogar os tokens dela pelo console, com uma linha de auditoria (ADR 0077 item 3). |
| Um arquivo enorme para esgotar a memória | O sync move um arquivo em pedaços abaixo do limite de mensagem, duas transferências por vez em cada sentido por sessão, descartadas depois de dois minutos paradas, e nenhum arquivo maior que 1 GiB (ADR 0079 item 12). |

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

### O alcance do próprio servidor

| Ameaça | Resposta como construída |
|---|---|
| O servidor como proxy aberto | Ele só sai para a rede na checagem de versão: o feed de releases do projeto, uma vez por dia, sem nada além da versão no `User-Agent`; `VERSO_UPDATE_CHECK=off` desliga. |
| Os bancos corrompidos num NAS | Aviso no log e na página de admin quando `VERSO_DATA_DIR` está num sistema de arquivos de rede. |
| Segredos no log | Nenhuma senha, token ou link vai para o log; o link de configuração é o único segredo escrito, uma vez, de propósito. |
| Uma dependência vulnerável ou sem licença | `cargo-deny` (avisos, licenças) e a lista de licenças do npm no CI; um aviso de falta de manutenção com exceção e validade (RUSTSEC-2026-0215, smallstr via yrs). |

### Agentes

A nota de outro membro pode carregar texto escrito para conduzir um agente
que a leia (ADR 0045). O servidor ainda não expõe MCP pela rede
(`[ABERTO]`, ADR 0073 item 11); um membro que sincroniza ou abre uma pasta
compartilhada com um agente local leva esse risco para a própria máquina.
A documentação diz isso onde os agentes são configurados.

## Lacunas antes do anúncio

- `[ABERTO]` Uma revisão do sanitizador do HTML das notas contra membros hostis.
- `[ABERTO]` Histórico e recuperação da mudança ou da remoção feita por outro membro.
- `[ABERTO]` Um limite de taxa além dos logins. *(Cotas por pasta: ADR 0077
  item 5, aceito e construído em 2026-10-10.)*
- `[ABERTO]` O token de aparelho do desktop no chaveiro do sistema em vez de
  um arquivo `0600`.
- `[ABERTO]` O transporte do MCP e sua autorização pela rede.
- Uma revisão externa deste modelo, como o ADR 0073 pede da segurança do
  servidor "por inteiro".
