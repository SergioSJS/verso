# ADR 0104 — Sincronizar com uma nuvem que a pessoa já tem: WebDAV, S3, Dropbox, OneDrive e Google Drive, pela sincronização da ADR 0079

- Data: 2026-10-20; reescrita em 2026-10-21
- Origem: um primeiro texto escrito por outra IA (Gemini, no Antigravity) em
  2026-10-20, nunca commitado, a partir das sessões do mantenedor de
  2026-10-19 e 2026-10-20 explorando uma nuvem que a pessoa já tem como
  alternativa a rodar o UniVerso. O mantenedor respondeu às perguntas dele
  em 2026-10-21 (questionário de decisões de 2026-10-20): **na V1** (0104.1,
  opção B, não a recomendada "depois da V1"); uma **revisão independente
  antes do commit** (0104.2, A); provedores *"todos esses mais One Drive"* —
  WebDAV, S3, Dropbox, Google Drive e OneDrive (0104.3); as chaves de
  cliente OAuth decididas quando o primeiro provedor OAuth for escolhido
  (0104.4, A). No mesmo dia, perguntado o que fazer com aquele texto: *"Leia
  a 0104 mas refaça ou corrija o que fizer sentido, confio mais em você que
  Gemini"*. Reescrita pelo Opus 5.5 em 2026-10-21 sobre o que o Verso já
  tem (a sincronização da ADR 0079), com os fatos dos provedores do
  primeiro texto conferidos na documentação pública deles (dois estavam
  errados; ver Contexto). A ser lida pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)) — a revisão que a 0104.2 pede.
- Relacionados: [0079](0079-sync-a-local-folder-with-a-server.md) (a
  sincronização que esta reaproveita),
  [0020](0020-sync-merge-in-core-transports-as-plugins.md) (revisada aqui),
  [0011](0011-config-outside-tree-index-as-cache.md),
  [0012](0012-files-are-source-of-truth.md),
  [0019](0019-generative-opt-in-and-keychain.md) (chaves no chaveiro),
  [0043](0043-placeholder-guard.md), [0050](0050-outbound-network-access.md),
  [0070](0070-what-travels-with-the-folder.md),
  [0080](0080-the-trash-with-expiry-and-restore.md),
  [0035](0035-cross-cutting-requirements.md),
  [0034](0034-roadmap-in-phases.md) (plugins fora da V1).
- Situação no briefing: ausente.

## Contexto

O Verso já sincroniza uma pasta do computador com uma pasta num UniVerso
([0079](0079-sync-a-local-folder-with-a-server.md)): a unidade é o
arquivo; o estado (um hash-base por caminho e um cursor) fica fora da
pasta; uma mudança de um lado só é aplicada no outro de forma atômica; uma
mudança dos dois lados vira uma cópia de conflito ao lado do arquivo
(acréscimos puros ao fim de uma nota são juntados); exclusões vão para
`.trash/`; uma exclusão em massa pausa; a primeira sincronização nunca
apaga; nada é silencioso. O que ela precisa do outro lado é pouco: listar as
mudanças depois de um cursor, ler um arquivo, gravar um arquivo só se ele
ainda for a versão combinada por último, apagar, renomear.

Rodar um servidor é uma barreira para muita gente. A maioria já tem WebDAV
(Nextcloud e afins), um bucket compatível com S3, Dropbox, OneDrive ou
Google Drive. O primeiro texto propôs usá-los como transportes, com os
instintos certos (um escopo estreito de pasta do app por provedor; o
navegador para entrar, nunca uma visão embutida; esperar diante do HTTP
429). Conferidos em 2026-10-21 nas páginas públicas dos provedores, dois
fatos dele estavam errados e um limite faltava:

- O Google classifica o `drive.file` como **não sensível** ("Recommended /
  Non-sensitive", guia "Choose scopes" da API do Drive), não sensível como
  dizia: pede só a verificação básica. O escopo `drive` inteiro é restrito
  (avaliação de segurança). Mas o `drive.file` deixa o app ver só os
  arquivos **que ele criou ou que a pessoa abriu com ele** — um arquivo que
  alguém põe na pasta pela página web do Drive fica invisível para o Verso
  (respostas da comunidade do Google e a documentação do rclone dizem isso;
  inferido da definição do escopo).
- Dropbox: um app em status de desenvolvimento liga até **500** contas, e
  ao ligar **50** tem duas semanas para obter o status de produção (guia do
  desenvolvedor do Dropbox). O tipo de acesso App folder dá uma pasta sob
  `Apps/`, e o Dropbox pede o tipo de menor privilégio.
- OneDrive: `Files.ReadWrite.AppFolder` alcança uma pasta (`approot`) e vale
  para contas **pessoais** (referência de permissões do Microsoft Graph); se
  contas corporativas e de escola permitem, a documentação lida não diz.

O primeiro texto também punha os transportes em plugins (ADR 0020 item
3) — mas plugins estão fora da V1 ([0034](0034-roadmap-in-phases.md)) — e
guardava os tokens no diretório de configuração, onde a
[0019](0019-generative-opt-in-and-keychain.md) põe chaves no chaveiro do
sistema.

## Decisão

Proposta (2026-10-21). Itens marcados `[DECIDIDO 2026-10-21]` são as
respostas do mantenedor citadas na Origem; `[PROPOSTO]` marca uma
recomendação que ele ainda não respondeu; `[ABERTO]`, uma pergunta para ele
(perguntas C.1 a C.3 da lista de decisões de 2026-10-21, tarde).

1. **Na V1, cinco provedores.** `[DECIDIDO 2026-10-21]` (0104.1 B, 0104.3):
   WebDAV, S3 (e compatíveis com S3), Dropbox, OneDrive, Google Drive.

2. **Uma sincronização, vários destinos.** `[PROPOSTO]` Uma nuvem é mais um
   *remoto* da sincronização da
   [0079](0079-sync-a-local-folder-with-a-server.md), não um segundo motor:
   os itens 2, 3 e 6 a 13 da 0079 valem como escritos — o arquivo como
   unidade, o estado fora da pasta (0011), mudanças aplicadas de forma
   atômica pelo `verso-fs` com a checagem de arquivo alterado (invariantes
   9 e 11), cópias de conflito com o nome que a 0079 item 8 dá (a versão da
   nuvem fica com o nome, como a do servidor), acréscimos juntados,
   exclusões para `.trash/` (0080), a pausa na exclusão em massa, a
   primeira sincronização que nunca apaga, o limite de 1 GiB, nada
   silencioso. O que muda é o lado remoto, atrás de uma interface no
   núcleo: **mudanças depois de um cursor, ler, gravar condicionalmente,
   apagar, renomear**, cada adaptador de provedor traduzindo isso para a
   API dele. Uma pasta local sincroniza com **um** remoto — um UniVerso ou
   uma pasta de nuvem — nunca dois ao mesmo tempo (0079 item 1).

3. **Embutidos, não plugins.** `[PROPOSTO]` Os adaptadores são Rust no
   núcleo (um módulo ou crate ao lado do `verso-fs`; o único lugar que toca
   os arquivos da pasta continua sendo o `verso-fs` — invariante 5), no app
   de desktop. Isso revisa o item 3 da
   [0020](0020-sync-merge-in-core-transports-as-plugins.md) ("transportes
   são plugins") para os primeiros transportes: plugins não existem antes
   da V1, e os tokens dos provedores não devem atravessar uma fronteira de
   plugin. Um transporte como plugin continua possível depois da V1.

4. **O lugar mais estreito de cada provedor.** `[PROPOSTO]`
   - **WebDAV**: um endereço e uma pasta que a pessoa informa, com usuário
     e senha (ou uma senha de app); só HTTPS, exceto um endereço da rede
     local que a pessoa confirma (como a
     [0096](0096-this-app-is-a-server.md) faz para HTTP simples).
   - **S3**: endpoint, bucket, prefixo, chave de acesso e segredo que a
     pessoa informa; qualquer serviço compatível com S3.
   - **Dropbox**: o tipo de acesso **App folder** (`Apps/Verso/<pasta>`).
   - **OneDrive**: `Files.ReadWrite.AppFolder` (`Apps/Verso/<pasta>`),
     contas pessoais; contas corporativas e de escola se a Microsoft
     permitir o escopo nelas (conferido ao construir, dito na janela se não).
   - **Google Drive**: só `drive.file` — o escopo `drive` inteiro nunca é
     pedido (restrito; avaliação anual; vê tudo). O limite dele é dito com
     clareza na janela: arquivos postos na pasta pela página web do Drive
     ou por outro app não são vistos pelo Verso; ponha-os pelo Verso.
     `[ABERTO]` C.3: aceitar esse limite.

5. **As mudanças do remoto, por provedor.** `[PROPOSTO]` Dropbox:
   `list_folder` com o cursor e o long-poll dele; OneDrive: a consulta
   `delta`; Google Drive: `changes.list` com um page token; WebDAV e S3 não
   têm um fluxo de mudanças: uma listagem com ETags comparada com o estado,
   no início, ao reconectar e a cada cinco minutos (a rede de segurança da
   0079 item 6), nunca um laço rápido. Uma gravação usa a **gravação
   condicional** do provedor onde ela existe (o modo update do Dropbox com a
   revisão conhecida; o `If-Match` do Graph e do WebDAV sobre o ETag; o put
   condicional do S3 onde o serviço o suporta); onde não existe, ler,
   comparar e gravar, com a janela entre eles registrada, de modo que uma
   corrida perdida vira uma cópia de conflito na passada seguinte, nunca
   uma sobrescrita silenciosa. Um renomear é o mover do provedor onde
   existe; senão, copiar e só então apagar, depois de conferir o hash da
   cópia.

6. **Entrar.** `[PROPOSTO]` Provedores OAuth pelo **navegador do sistema**
   com PKCE e um redirecionamento de loopback em `127.0.0.1` (RFC 8252) —
   nunca uma visão web embutida. Tokens de atualização, senhas de WebDAV e
   segredos de S3 ficam no **chaveiro do sistema**
   ([0019](0019-generative-opt-in-and-keychain.md) item 2), nunca na pasta,
   nunca no arquivo de configuração, nunca num log; "Desconectar" os apaga
   e revoga o token onde o provedor permite. O chaveiro é uma dependência
   nova, justificada no PR que o construir.

7. **As identidades de cliente OAuth.** `[ABERTO]` C.1 — a 0104.4 disse
   "decidir quando o primeiro provedor OAuth for escolhido", e os três
   estão escolhidos agora. Dois caminhos: **o projeto registra seus
   próprios apps** (um app no Dropbox — status de produção passadas 50
   contas; um projeto no Google Cloud — verificação básica para o
   `drive.file`, que pede um domínio verificado, `versomd.com`, e uma
   política de privacidade pública; um registro de app no Microsoft Entra),
   distribuídos como clientes públicos, sem segredo; ou **cada pessoa
   registra o seu** (BYOK) e cola o client id. Recomendado: os do projeto,
   com o BYOK como campo avançado — o primeiro texto descartou o BYOK como
   padrão pelo atrito, e o mantenedor viu isso no questionário.

8. **A rede.** `[PROPOSTO]` Sincronizar com uma nuvem é escolha explícita
   da pessoa, por pasta; o app então fala só com os hosts de API e de
   entrada daquele provedor, listados por adaptador no código e em
   `docs/reference/threat-model.md`. Nada é pedido a um provedor antes de a
   pessoa conectá-lo ([0050](0050-outbound-network-access.md)). HTTP 429 e
   503 são respeitados com o `Retry-After` do provedor e, sem ele, espera
   exponencial com variação aleatória; pouca concorrência por provedor. A
   cota de armazenamento do provedor cheia é um erro de sincronização dito
   na janela (0079 item 13).

9. **O que a pessoa vê.** `[PROPOSTO]` Os ajustes da pasta oferecem
   "Sincronizar com…": um UniVerso (0079) ou uma nuvem; escolher uma nuvem
   pede o provedor, faz a entrada, mostra o espaço e o que a primeira
   sincronização fará (0079 item 11), e pode ser cancelado. A barra de
   status e o log de sincronização são os da 0079. Uma pasta local que já
   está dentro da pasta do cliente de desktop de uma nuvem (Dropbox,
   OneDrive, iCloud) já é sincronizada por esse cliente: o Verso diz isso e
   não oferece uma segunda sincronização dos mesmos arquivos (os
   placeholders da [0043](0043-placeholder-guard.md) continuam protegidos).

10. **Celulares e navegadores não sincronizam** (0079 item 14), nem com um
    servidor nem com uma nuvem.

11. **Ordem de construção.** `[ABERTO]` C.2. Recomendado: WebDAV e S3
    primeiro (sem registro de app, sem verificação; exercitam a interface
    nova do motor), depois Dropbox, OneDrive, Google Drive (o último pede o
    domínio verificado e a política de privacidade publicada).

12. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
    cada passo do "Sincronizar com…" pelo teclado e pelo leitor de tela; o
    passo no navegador anunciado; pt-BR e EN.

## Consequências

- O núcleo ganha uma interface de remoto que a sincronização com servidor
  da 0079 também implementa — uma refatoração do código da 0079, com os
  testes dela verdes — e um adaptador por provedor com os seus testes
  contra uma imitação da API do provedor (nenhum teste alcança um provedor
  de verdade; uma checagem manual por provedor em
  `docs/reference/manual-checks.md`).
- Dependências novas, cada uma justificada no seu PR: o chaveiro, um
  assinador de pedidos S3 (ou o nosso SigV4), um cliente HTTP que o host já
  tem.
- O mantenedor, para os provedores OAuth (C.1 = os do projeto): um app no
  Dropbox, um projeto no Google Cloud com `versomd.com` verificado e uma
  página de política de privacidade, um registro de app no Microsoft
  Entra; a política de privacidade do site diz o que o Verso lê e que nada
  sai do provedor da pessoa.
- `docs/reference/threat-model.md` ganha os hosts dos provedores e os
  segredos do chaveiro.
- O roadmap ganha uma linha para esta ADR na V1.

## Alternativas descartadas

- **Os transportes como plugins** (0020 item 3): considerado na 0020 e no
  primeiro texto; não antes da V1 (acima, item 3).
- **BYOK como único caminho**: considerado no primeiro texto e mostrado ao
  mantenedor no questionário (0104.4); mantido só como opção avançada (item
  7, aberto).
- **O escopo `drive` inteiro do Google**: considerado no primeiro texto;
  restrito, avaliação anual, e vê todo o Drive da pessoa.
- **Arquivos compactados da pasta inteira a cada mudança**: considerado no
  primeiro texto; banda e latência; um backup é outro assunto.

## Situação

Proposta (2026-10-21), reescrita sobre a 0079 pelo Opus 5.5 a pedido do
mantenedor; item 1 decidido; a revisão pelo outro modelo (0104.2) e as
respostas do mantenedor a C.1 a C.3 vêm antes de ela ser aceita.
