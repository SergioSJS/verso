# ADR 0111 — Modo online: uma mesa a partir deste app, por um túnel

- Data: 2026-10-23
- Origem: o mantenedor, em 2026-10-23. Perguntado se uma pessoa que
  transforma o app em servidor poderia montar uma mesa nele: *"se a pessoa
  habilita o aplicativo dela como servidor, ela conseguiria montar uma mesa
  em cima do aplicativo dela? Seria algo parecido com rodar o foundry na
  minha máquina local e compartilhar link com as pessoas ... Às vezes vale
  até a pena a gente simplificar o uso de túnel para poder ser possível
  compartilhar link assim."* Com uma especificação colada (Cloudflare Quick
  Tunnel por `cloudflared tunnel --no-autoupdate --url
  http://127.0.0.1:<PORTA>`, a URL lida do stderr, o servidor só em
  `127.0.0.1`, o processo filho morto ao parar e ao sair), ele disse:
  *"quando ela ativa, bota modo online, seria como se ela tivesse subindo o
  servidor, e ela vai gerar um link pelo Cloudflare Quick ... passa para os
  jogadores, os jogadores logam e tal e usam como se estivesse usando o
  universo"*. Depois da análise do assistente: *"zero problemas o link mudar
  e tal. Inclusive até melhor assim, porque fica mais seguro ... A pessoa
  liga esse modo online quando ela quiser. E já que é um modo de
  desenvolvimento, depois a gente pode até, num segundo momento, implementar
  um modo oficial ... eu concordo de ter um método oficial depois e da gente
  testar desse modo agora"*. Escrita pelo Sonnet 5.5 a pedido da sessão; a
  ser lida pelo outro modelo antes de ser aceita. Nada está construído.
- Relacionadas: [0096](0096-this-app-is-a-server.md) (esta ADR é um segundo
  modo ao lado dela; muda os itens 2, 3 e 5 só para esse modo),
  [0073](0073-self-hosted-server-first.md) (item 6, TLS),
  [0074](0074-accounts-and-access-on-the-server.md) (contas),
  [0075](0075-server-packaging-and-storage.md) (armazenamento),
  [0081](0081-sharing-between-people-on-one-universo.md) (convites,
  compartilhamentos),
  [0083](0083-security-hardening-of-universo.md) (a rodada de segurança),
  [0045](0045-server-and-mcp-security.md) (`Host`, DNS rebinding),
  [0050](0050-outbound-network-access.md) (acesso de saída à rede),
  [0055](0055-in-app-updater.md) (versões),
  [0029](0029-guardrails-in-ci.md) (guardrails),
  [0005](0005-license.md) (licenças),
  [0107](0107-the-table-a-shared-roll-and-chat-log.md) (a Mesa),
  [0110](0110-a-table-is-a-campaign-folder.md) (uma mesa é uma pasta de
  campanha),
  [0058](0058-demo-vault-as-tutorial.md) (o tutorial),
  [0035](0035-cross-cutting-requirements.md) (idiomas, acessibilidade),
  [0069](0069-windows-port.md) e
  [o checklist multiplataforma](../reference/cross-platform-checklist.md).
- Status no briefing: não consta.

## Contexto

**O que existe.** O app de desktop já pode ser servidor na rede local
([0096](0096-this-app-is-a-server.md)): o mesmo serviço do `verso serve`,
iniciado pelo host (`crates/verso-server/src/local`), escutando só em
endereços privados com certificado próprio, sem contas além de um dono local
implícito, celulares pareados por QR code e uma aprovação "Foi você?",
desligado de novo na próxima abertura, sempre visível (marca na barra de
status, bandeja com "Parar" no macOS e no Windows). A janela web roda no
navegador de um celular ([0076](0076-the-window-on-every-screen.md)). O
UniVerso completo tem contas, convites, papéis por pasta, pastas de campanha
e a Mesa ([0074](0074-accounts-and-access-on-the-server.md),
[0081](0081-sharing-between-people-on-one-universo.md),
[0110](0110-a-table-is-a-campaign-folder.md),
[0107](0107-the-table-a-shared-roll-and-chat-log.md)). Suas salas e a
sincronização usam WebSockets (o código da janela usa `WebSocket`; a busca
não achou `EventSource` nem `text/event-stream` em `crates` ou `app/ui/src`;
a confirmar no PR de construção).

**O que falta.** A 0096 serve os celulares do próprio dono na rede do
próprio dono, sem outra pessoa. Um mestre cujos jogadores estão em outras
casas tem hoje duas saídas: alugar ou rodar um UniVerso, ou usar uma VPN como
o Tailscale (o caminho documentado da 0073), que cada jogador precisa
instalar. O mantenedor quer a experiência do Foundry: uma pessoa liga uma
chave no notebook e manda um link. Para isso o notebook precisa ser
alcançável pela internet, o que costuma falhar sozinho: roteadores
domésticos ficam atrás de CGNAT (comum no Brasil), então redirecionar portas
ou UPnP não é confiável.

**O que é um Cloudflare Quick Tunnel, pela página da própria Cloudflare**
(<https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>,
lida em 2026-10-23). O `cloudflared` no notebook faz uma conexão de saída
para a Cloudflare, que dá um nome `*.trycloudflare.com` aleatório e repassa
HTTPS a um endereço local. A página diz (no original, em inglês): "You do not
need a Cloudflare account or domain."; "The hostname changes each time you
create a Quick Tunnel."; "Quick Tunnels are for testing and development.";
"Quick Tunnels have no uptime guarantee."; "Each Quick Tunnel supports up to
200 in-flight requests. Additional requests return a `429` response.";
"Quick Tunnels do not support Server-Sent Events (SSE)." A página não fala
de termos de serviço, de limite de corpo de requisição nem de WebSockets; a
especificação colada pelo mantenedor diz que WebSockets funcionam, o que esta
ADR **não** verificou (item 12).

**A superfície de ataque que isto abre.** Maior que a da 0096. Um nome na
internet aberta, que ninguém adivinha mas qualquer pessoa que receba o link
lê, encaminha ou vaza, chega a um servidor rodando no notebook pessoal de
alguém. Quem tem o link pode tentar entrar, inundar ou atacar a pilha HTTP.
As defesas existem (contas, papéis, os limites da
[0083](0083-security-hardening-of-universo.md)); o novo é quem é o proxy,
onde o TLS termina, qual origem o servidor acredita ter, e um binário de
terceiros iniciado e mantido rodando pelo app.

## Decisão

**Decidido pelo mantenedor em 2026-10-23** (citado acima), três pontos:

- **D1. `[DECIDED 2026-10-23]` Construir agora um modo online sobre Cloudflare
  Quick Tunnels.** O link mudar a cada execução é aceito, até preferido
  (*"zero problemas o link mudar ... fica mais seguro"*).
- **D2. `[DECIDED 2026-10-23]` Só fica ligado quando a pessoa quiser**
  (*"A pessoa liga esse modo online quando ela quiser"*).
- **D3. `[DECIDED 2026-10-23]` Um modo oficial vem depois**, como segundo
  passo (*"depois a gente pode ... implementar um modo oficial"*): qual, é o
  item 13.

Todo o resto é `[OPEN]`, cada item com opções e uma recomendação. Nada está
decidido até o mantenedor dizer. Em todo o texto, a recomendação é a menor
superfície que ainda deixa um grupo de jogadores entrar de suas próprias
casas. Nada disto muda uma ADR Aceita; onde uma precisa de uma linha, o item
diz.

1. **`[DECIDED 2026-10-23]` O que o modo online serve.**
   - (a) Só as pastas que o dono transforma explicitamente em mesas
     ([0110](0110-a-table-is-a-campaign-folder.md)) ou compartilha; nada por
     padrão.
   - (b) O modelo completo do UniVerso para qualquer pasta que o dono marcar,
     como o item 2 da 0096.
   - (c) Toda pasta aberta. (Não recomendado.)
   - Recomendação: **(a)**. É a menor superfície; o túnel é para uma mesa,
     não para as notas do notebook. Pastas que não são mesas não são
     alcançáveis por nenhum id (valem as duas trancas da emenda do item 2 da
     0096).
   - **Decidido pelo mantenedor em 23/10/2026, como no UniVerso:** *"eu
     acho que a pasta servida seria o mesmo funcionamento do universo. É o
     que a pessoa compartilhar. Ele não vai compartilhar tudo, exceto se a
     pessoa quiser compartilhar tudo. É o que ela compartilhar que é o que
     vai ser servido."* O modo online serve o que a pessoa compartilha,
     pelas regras do próprio UniVerso
     ([0074](0074-accounts-and-access-on-the-server.md),
     [0110](0110-a-table-is-a-campaign-folder.md)): uma pasta compartilhada
     com uma conta, ou feita mesa e com entrada por convite, é alcançável
     por essa conta no seu papel; nada é compartilhado por padrão;
     compartilhar todas as pastas é escolha da pessoa, nunca do app. É a
     opção (a) lida como o UniVerso a lê — "compartilha" inclui qualquer
     pasta compartilhada, não só mesas.

2. **`[OPEN]` Contas e como um jogador entra.**
   - (a) Contas no banco do servidor local (o diretório de estado da 0096,
     [0075](0075-server-packaging-and-storage.md)); jogadores convidados por
     link ([0110](0110-a-table-is-a-campaign-folder.md) item 2,
     [0081](0081-sharing-between-people-on-one-universo.md)) e entrando com
     senha sob a [0074](0074-accounts-and-access-on-the-server.md) e a
     [0083](0083-security-hardening-of-universo.md): a lista de senhas, os
     limites por endereço e por conta, a linha de log de login recusado. O
     dono é a pessoa do app, com login implícito no desktop.
   - (b) Um token secreto na URL, sem contas (a ideia da especificação
     colada).
   - Recomendação: **(a)**. A (b) está registrada como descartada abaixo. O
     link de convite é o único segredo num link, é de uso único e não é a
     sessão. Se o e-mail do jogador é necessário num notebook sem servidor de
     e-mail é pergunta para a construção: o convite da 0081 pode precisar de
     um login que funcione sem e-mail. Não decidido aqui.

3. **`[OPEN]` Onde escuta.**
   - (a) `127.0.0.1` numa porta aleatória, nunca um endereço de LAN ou
     público; o único caminho de entrada é o túnel. Independente do modo LAN
     da 0096 (duas chaves; uma, as duas ou nenhuma).
   - (b) O modo online também escuta na LAN.
   - Recomendação: **(a)**, chaves separadas. Isto muda o item 3 da 0096
     (faixas privadas) só para este modo: o loopback é mais estreito.

4. **`[OPEN]` TLS, o proxy e a origem.**
   - Fatos: a Cloudflare termina o HTTPS; o trecho do `cloudflared` ao
     servidor é HTTP simples no loopback, o que o item 6 da
     [0073](0073-self-hosted-server-first.md) permite ("exceto em loopback ou
     atrás de um proxy configurado"). Isto muda o item 5 da 0096 (certificado
     próprio) só para este modo.
   - (a) O servidor aprende sua origem pública em tempo de execução pelo
     `https://<nome>.trycloudflare.com` capturado e a usa para os cookies
     `Secure`, a checagem de `Origin`, os links de convite e de
     compartilhamento; confere o cabeçalho `Host` com esse único nome (DNS
     rebinding, [0045](0045-server-and-mcp-security.md)) e não responde a
     nenhum outro. O único proxy confiável é o loopback
     ([0083](0083-security-hardening-of-universo.md) item 5, `proxy.rs`), e o
     endereço do cliente vem de `CF-Connecting-IP` ou da caminhada do
     `X-Forwarded-For`, para que os limites e a linha do fail2ban vejam o
     jogador, não `127.0.0.1`.
   - (b) Uma lista fixa de origens permitidas numa configuração.
   - Recomendação: **(a)**. Qual de `CF-Connecting-IP` e `X-Forwarded-For` a
     Cloudflare define num Quick Tunnel é **não verificado** (a página acima
     é omissa); a construção deve testar num túnel real antes de escolher, e
     um valor forjado não pode mover um limite.

5. **`[OPEN]` O binário `cloudflared`.**
   - (a) Baixar no primeiro uso uma versão **fixada** para o diretório de
     dados do app, de `github.com/cloudflare/cloudflared/releases`, conferir
     seu SHA-256 (a página da versão lista um para cada arquivo) contra um
     valor escrito no código do Verso e só então executar. Nunca "latest",
     nunca o `PATH` por padrão.
   - (b) Embutir nos instaladores (cerca de 35 MB a mais por plataforma; o
     tamanho não foi verificado).
   - (c) Usar um que já esteja no `PATH`.
   - Recomendação: **(a)**, com (c) só se a pessoa apontar um caminho nos
     Ajustes. A versão fixada anda com as versões do Verso
     ([0055](0055-in-app-updater.md)). Fatos e incógnitas:
     - A versão 2026.10.3 (lida em 2026-10-23) lista, entre outros,
       `cloudflared-darwin-amd64.tgz`, `cloudflared-darwin-arm64.tgz`,
       `cloudflared-windows-amd64.exe`, `cloudflared-linux-amd64` e
       `cloudflared-linux-arm64`, cada um com SHA-256.
     - Licença: o repositório declara Apache-2.0. O `cargo-deny` cobre
       crates Rust, não este binário; se a (b) for escolhida, o texto da
       licença e o aviso viajam no instalador e na tela de licenças do app;
       na (a) o download é da pessoa, mas o aviso aparece mesmo assim na tela
       do modo online. Apache-2.0 está na lista de permitidas do `deny.toml`.
     - Assinatura: **desconhecida.** A página da versão não diz nada sobre
       assinatura de código ou notarização. Um arquivo baixado pelo app não
       leva o atributo de quarentena do macOS, então o Gatekeeper
       normalmente não pergunta, mas isto não foi verificado aqui; em Apple
       silicon um executável sem assinatura pode nem rodar. O SmartScreen e o
       Defender do Windows podem perguntar ou bloquear um `.exe` sem
       assinatura; não precisa de administrador. Linux: `chmod +x`. Os
       quatro a testar nos sistemas reais na construção.
     - Uso de saída: baixar um binário é um uso de saída novo para a
       [0050](0050-outbound-network-access.md), que lista os permitidos; isto
       precisa de uma linha lá (a chave da pessoa, um host, um arquivo
       fixado). O túnel em si é uma conexão de saída nova para a Cloudflare.
     - Onde mora o código: iniciar um subprocesso não está na lista de
       `std::fs`, mas a [0029](0029-guardrails-in-ci.md) diz que um
       subprocesso que faz trabalho negado é a mesma violação. O
       `cloudflared` não toca nenhum arquivo da pasta aberta; recebe uma URL
       de loopback. Dono recomendado: o host Tauri (`app/src-tauri`), que já
       é dono da bandeja e do início do servidor local; `verso-server` e
       `verso-service` continuam sem criar processos. O download e a
       conferência escrevem um arquivo no diretório de dados do app, fora da
       pasta aberta (a configuração fica fora da árvore,
       [0011](0011-config-outside-tree-index-as-cache.md)), mas é uma
       escrita em disco, então passa pelo módulo dono do diretório de
       configuração, nunca pelo `verso-fs`. O crate exato fica para o leitor
       confirmar.

6. **`[OPEN]` Ciclo de vida e visibilidade.**
   - Recomendação: desligado por padrão e desligado de novo na próxima
     abertura (como o item 1 (a) da 0096, sem a chave "manter ligado ao
     abrir"); enquanto ligado, sempre visível: uma marca na barra de status,
     uma entrada na bandeja ou barra de menu com "Parar" (macOS e Windows,
     como a 0096; o Linux não tem bandeja, então barra de status e Ajustes),
     o link com botão de copiar e um QR. Para ao sair do app (o filho é
     morto; no Windows um Job Object, para que uma queda não deixe órfão; no
     Unix o filho também para se o pai morrer, a testar), quando a pessoa
     aperta "Parar", e após um teto de **12 horas** (número para o mantenedor
     confirmar). Se o `cloudflared` sair sozinho, o modo mostra "offline" e
     não reinicia em silêncio; reiniciar dá um **link novo**, e diz isso. O
     que os jogadores veem: suas páginas dizem que a mesa está offline, no
     idioma deles, e oferecem tentar de novo.
   - Alternativas: sem teto; um limite de ociosidade menor; reiniciar na
     falha.

7. **`[OPEN]` Os limites dos Quick Tunnels** (acima, segundo a Cloudflare):
   só para teste e desenvolvimento, sem garantia de disponibilidade, um nome
   novo a cada execução, 200 requisições em andamento com `429` acima disso,
   sem SSE. Para o Verso: as salas e a sincronização usam WebSockets (a
   confirmar que um Quick Tunnel os carrega, e por quanto tempo uma conexão
   vive); uma mesa de poucos jogadores fica muito abaixo de 200 requisições
   em andamento, mas a construção deve medir o primeiro carregamento da janela
   (muitos arquivos de uma vez) contra o teto e servir os arquivos estáticos
   em cache ([0092](0092-the-phone-offline.md)); um eventual limite de corpo
   de upload é desconhecido, então envios de imagens e anexos devem ser
   testados pelo túnel. Risco de termos de uso: o serviço é oferecido para
   teste, e a Cloudflare pode mudá-lo ou encerrá-lo; o modo oficial do item
   13 é a resposta, e a tela diz que é um modo de teste.
   - Recomendação: construir, rotular "modo de teste" nos Ajustes e registrar
     os números medidos em "Como foi construído".

8. **`[OPEN]` Revisão de segurança para o PR de construção.** Recomendação:
   uma lista de checagem, não um desenho. Tudo o que a
   [0083](0083-security-hardening-of-universo.md) lista vale também para este
   servidor (limites, ritmo, fronteiras, o conjunto completo de cabeçalhos, o
   log de auditoria, a lista de senhas, a revogação de tokens); as outras
   pastas do notebook nunca são alcançáveis (item 1); os comandos só do
   desktop (agentes, terminal, revelar no sistema, caminhos locais, o
   atualizador, o proxy de páginas embutidas da
   [0056](0056-embedded-web-pages.md)) não são servidos, nos moldes da lista
   de permitidos dos celulares do item 12 da 0096, com um teste que falha
   quando um comando é adicionado sem veredito; os logs não guardam link de
   convite, cookie nem senha. Um teste para cada guardrail é visto falhando
   antes do merge, como pede a [0029](0029-guardrails-in-ci.md). O trabalho
   multiplataforma lê [o checklist](../reference/cross-platform-checklist.md)
   e a [0069](0069-windows-port.md).

9. **`[OPEN]` Acessibilidade, idiomas e celulares.** Recomendação: a janela
   servida é a janela web existente; a tela do modo online, suas mensagens e
   a página "mesa offline" são escritas em pt-BR e EN
   ([0035](0035-cross-cutting-requirements.md)), alcançáveis por teclado, com
   o link, o QR e o estado legíveis por leitor de tela; jogadores no celular
   a 390x844 alcançam todo painel e todo esconder tem caminho de volta.

10. **`[OPEN]` O tutorial** ([0058](0058-demo-vault-as-tutorial.md)).
    Recomendação: quando construído, uma nota do cofre de demonstração "Mesa
    online" (e seu par em inglês) com os passos reais: ligar, copiar o link,
    convidar, o que os jogadores veem, parar. Seguida no app antes do PR.

11. **`[OPEN]` Convivência com o modo LAN da 0096 e com a sincronização.**
    Recomendação: chaves separadas (item 3); uma pasta que o notebook também
    sincroniza com um UniVerso mantém as regras do item 11 da 0096 para os
    dois modos; o modo online nunca serve uma pasta feita mesa num UniVerso
    que é de outra pessoa.

12. **`[OPEN]` O que não foi verificado.** Suporte a WebSocket num Quick
    Tunnel (a especificação colada diz que sim, a página da Cloudflare é
    omissa), o cabeçalho do endereço do cliente, o limite de upload, a
    assinatura de código dos binários, o comportamento da quarentena, o
    tamanho de um binário embutido. Recomendação: um spike curto (um script,
    sem código de produto) antes do PR de construção, com os resultados
    escritos em "Como foi construído".

13. **`[DECIDED 2026-10-23]` O modo oficial de depois** (para uma ADR futura; sem
    recomendação além da ordem em que parecem mais baratos):
    - (a) Um Cloudflare Tunnel nomeado com a conta e o domínio Cloudflare da
      própria pessoa (link estável, os termos da pessoa).
    - (b) Tailscale Funnel.
    - (c) O UniVerso num host (0073), que é a resposta própria do produto.
    - Ordem de esforço, como o assistente vê: a (c) existe, a (a) e a (b) são
      em grande parte configuração e documentação. Não decidido qual, nem se
      mais de um.
    - **Decidido pelo mantenedor em 23/10/2026** (*"perfeita a lista para
      modo oficial"*): estes três são os candidatos ao modo oficial; qual
      deles, ou mais de um, fica para a sua própria ADR.

## Consequências

- Um mestre pode rodar uma mesa do seu notebook e compartilhar um link, sem
  host, sem domínio e sem conta na Cloudflare. O link muda a cada execução.
- O notebook fica de frente para a internet enquanto o modo está ligado. As
  mitigações são a chave (D2), a escuta só em loopback, no máximo uma pasta
  servida por mesa, contas e os limites da 0083; o risco residual é um bug na
  pilha HTTP alcançável por qualquer um com o link.
- O app baixa e executa um binário de terceiros: versão fixada,
  conferência de hash, diretório de dados. Uma linha nova na
  [0050](0050-outbound-network-access.md) e uma de avisos na tela de
  licenças.
- O app depende de um serviço gratuito de teste sem garantia. Quando ele
  mudar, o modo deixa de funcionar até existir o modo oficial.
- Os itens 2, 3 e 5 da 0096 continuam como decididos para o modo LAN; esta
  ADR acrescenta um segundo modo e não muda nada ali.
- Custo: P para o processo e o link, M para a origem e o proxy, M para o
  fluxo de contas sem servidor de e-mail, mais o spike. Fase 3, dentro do
  escopo do servidor ([0073](0073-self-hosted-server-first.md)).

## Alternativas descartadas

Só alternativas realmente consideradas na sessão:

- **Redirecionamento de portas ou UPnP.** Levantado pelo assistente: falha
  atrás de CGNAT, comum no Brasil, e expõe o endereço do notebook.
- **Um token na URL** (a especificação colada): vaza por capturas de tela,
  histórico do navegador, encaminhamento e prévias de link; substituído por
  contas e um convite de uso único (item 2).
- **Baixar "latest"** (a especificação colada): um binário sem fixação
  executado na máquina da pessoa sem conferência; substituído por versão
  fixada e hash (item 5).

## Status

Proposta (2026-10-23). Escrita pelo Sonnet 5.5 a pedido da sessão; a ser
lida pelo outro modelo antes de ser aceita. D1, D2 e D3 são palavras do
mantenedor de 2026-10-23; os itens 1 e 13 foram decididos pelo mantenedor
no mesmo dia; os itens 2 a 12 são `[OPEN]` e aguardam o mantenedor. Nada está construído.

Fontes: Cloudflare, "Quick Tunnels" (link no Contexto); o repositório
`cloudflared` e sua versão 2026.10.3 no GitHub, lidos em 2026-10-23.
