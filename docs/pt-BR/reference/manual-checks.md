# Checagens manuais no app

- Início: 2026-10-07
- Fonte: o mantenedor, em sessão: "mantenha um documento com toda
  implementação que precisa de um check meu testado local. isso nao deve
  travar nada".

O que os testes automáticos não alcançam por inteiro — o host real, o
macOS, o app instalado — fica listado aqui, uma linha por mudança, para o
mantenedor experimentar no app instalado quando puder. **Nada aqui segura
um commit, um merge ou um beta; as checagens são condição só da
publicação da V1** (o mantenedor, 2026-10-14, `docs/roadmap.md`, Fase 4 —
V1, linha V.15). Cada item diz o que fazer, o que ver
e o commit; um item marcado diz quando. Uma checagem que acha problema
vira conserto, e o item aponta para ele.

O roteiro do cofre de exemplo (`demo-vault-walkthrough.md`) é o passeio
completo pelo app; esta lista é só o que mudou e ainda não foi visto no
app real.

## Ainda não conferido

### O UniVerso achado na rede, e um DNS ruim contornado (ADR 0097, feat/universo-discovery, 2026-10-16)

Precisa do app desktop instalado e de um UniVerso na rede de casa (o ZimaOS do mantenedor); nada disto foi rodado numa rede de verdade quando foi construído.

- [ ] **Descoberta na LAN de casa** (A): na máquina com o UniVerso, com a porta publicada além do loopback e rede host (`network_mode: host`), abra *Ajustes › Servidores* no app desktop: em poucos segundos *Encontrados nesta rede* lista `UniVerso-xxxxxx` com o endereço (`http://<ip>:7340`) e *sem HTTPS*. Clique em *Conectar*: o endereço é preenchido e o navegador abre a página de aprovação do aparelho daquele endereço. Nada aconteceu antes do clique (o log do servidor não mostra requisição deste Mac até então). Feche a seção: a lista some, e o log do app não mostra mais busca. Com o compose como está (rede bridge) a lista fica vazia e diz o que fazer. No servidor, `VERSO_ANNOUNCE=off` e reinício: nada é listado.
- [ ] **O pedido do macOS** (A): na primeira vez no macOS 15 ou posterior, o sistema pede a permissão de **Rede Local** com as palavras do Info.plist (que agora dizem também que o app procura servidores). Negue: diga se a lista fica vazia em silêncio ou se o app diz algo; permita em Ajustes do Sistema › Privacidade e Segurança › Rede Local e a lista enche.
- [ ] **Windows e Linux** (A): no Windows, se o Firewall do Windows Defender pergunta sobre o app na primeira busca (UDP 5353), só redes *Privadas*; se o desktop acha um servidor no mesmo Wi-Fi. No Linux com o Avahi rodando, se a busca e o anúncio do servidor convivem com ele.
- [ ] **Um DNS ruim** (A): aponte um nome para um endereço errado no primeiro servidor DNS do sistema (ou o do roteador, como na rede do mantenedor) enquanto outro servidor da lista tem o certo; no app desktop conecte a `https://<esse nome>`. Conecta, em cerca de um tempo de conexão na primeira vez e na hora depois; o log não tem WARN. Faça nenhum servidor responder: o aviso diz *Não foi possível alcançar o servidor <nome> — … <nome> → <ip>: sem resposta. Confira o DNS desta rede…* e a linha WARN do log nomeia cada IP com a origem (`system`, `dns <servidor>`). Com um nome cujo certificado é de outro nome, nada conecta (o nome é verificado, não o IP).

### Inserir imagem na barra de ferramentas do editor (feat/insert-image, 2026-10-15)

Precisa do app instalado num Mac, num Linux e num Windows, de um iPhone (Safari) e de um Android (Chrome), por um UniVerso e por *Este app é um servidor*; o seletor e a câmera são do sistema e nenhum teste os alcança (os testes de ponta a ponta trocam o seletor de arquivos por um falso).

- [ ] **O seletor de arquivos do computador** (A): numa nota no modo Editar, o último botão da barra abre um menu com *Do computador…* e *Da pasta…* (sem *Tirar foto*). *Do computador…* abre o painel do sistema (o do Finder no macOS, o do Explorer no Windows, o do GTK no Linux), filtrado para imagens; escolha uma: ela aparece em `assets/` (ou na pasta do ajuste *Anexos*) com o nome dela, `![[nome.png]]` está no cursor, a linha de status diz isso, ⌘Z desfaz o embed (o arquivo fica). No Windows e no Linux também: o painel abre, e um arquivo com espaço ou acento no nome é embutido e aparece. Escolha o mesmo arquivo de novo: `nome (2).png`.
- [ ] **Uma imagem grande e um HEIC** (A): uma foto de 20 MB no computador é copiada e aparece; no macOS um `.heic` é copiado como está (o editor só o mostra onde a visualização web consegue).
- [ ] **A galeria e a câmera do celular, Safari no iPhone** (A, por um UniVerso com HTTPS e por *Este app é um servidor*): o menu tem *Fotos e arquivos…*, *Tirar foto* e *Da pasta…*. *Fotos e arquivos…* oferece a fototeca, *Fotografar ou gravar vídeo* e *Escolher arquivo*; a foto escolhida é copiada (`IMG_1234.jpeg` ou `image.jpeg`, como o Safari a nomeia) e embutida. *Tirar foto* abre a câmera direto; a foto é salva como `Foto AAAA-MM-DD HHMMSS.jpg` e embutida. Negar a permissão da câmera deixa a nota como está e a galeria continua funcionando.
- [ ] **A galeria e a câmera do celular, Chrome no Android** (A): as mesmas duas escolhas; *Fotos e arquivos…* oferece a câmera e a galeria; *Tirar foto* abre a câmera.
- [ ] **Mais de 32 MB num servidor** (A): uma imagem de mais de 32 MB por um UniVerso ou por *Este app é um servidor* é recusada na linha de status (no alto do painel, no celular) e nada é copiado.
- [ ] **Quem só lê** (A): como leitor de uma pasta compartilhada, o botão diz *Você só lê esta pasta* e não copia nada.
- [ ] **O servidor fora de alcance** (A): pare o servidor com uma nota aberta e insira uma imagem: a linha de status diz que não foi possível alcançar o servidor, e nenhum embed é escrito. Com a pasta guardada sem rede no celular, a imagem fica guardada com as outras mudanças e sobe quando a rede volta.
- [ ] **O leitor de tela** (A): o botão é anunciado como *Inserir imagem*, um menu; os itens são lidos; o resultado é lido na linha de status.

### Este app é um servidor (ADR 0096, feat/local-server-build, 2026-10-15)

Precisa do app instalado num Mac, num computador Linux ou num Windows, de um celular de verdade (um iPhone e um Android), de um iPad e de uma rede doméstica; nada disto foi rodado num celular nem no app instalado quando foi construído.

- [ ] **A lista de pastas com muitas pastas** (A; ADR 0096, 2026-10-16): com uma dúzia ou mais de pastas recentes, *Ajustes › Este app é um servidor › Pastas servidas* as lista como o seletor de pastas — a mais recente primeiro, uma linha cada, sem grupos — com um campo de filtro acima e *N marcadas de M* no título. Duas pastas de mesmo nome (duas `Caderno`) mostram `em <diretório>` ao lado do nome, e só elas. Marque uma: a contagem muda. Com VoiceOver/Narrator cada caixa é lida com nome (e diretório, quando mostrado). Numa janela estreita nada rola para o lado.
- [ ] **As pastas a servir: este cofre primeiro, as recentes agrupadas** (A; ADR 0096 item 2, 2026-10-16): com 40 pastas recentes, *Pastas servidas* começa com *Este cofre · <nome>* (o aberto na janela) sozinho, com a árvore de pastas aberta sob a caixa depois de marcado; *Recentes · N pastas* está fechado e abre com Enter ou um clique, e fica como foi deixado depois de fechar os Ajustes e reabrir o app. O filtro fica dentro dele e não mexe no cofre aberto. Numa linha, o nome e o diretório (`, em <dir>`) ou a nota de sincronização ficam separados, não colados; com VoiceOver/Narrator a caixa lê o nome e depois as dicas.
- [ ] **Servir só algumas pastas de uma pasta** (A, um celular de verdade; ADR 0096 item 2, emendado em 2026-10-16): num cofre com, por exemplo, `Projetos`, `Diário`, `Segredo` e uma nota na raiz, marque-o e abra *Escolher pastas* na linha dele: a árvore lista as pastas (nenhuma oculta, como `.obsidian`), e a caixa do cofre mostra *parcial* quando uma pasta está marcada. Marque `Projetos` e `Diário` e ligue o servidor (a árvore fica travada enquanto serve). Pareie o celular: o seletor de pastas dele lista *Projetos* e *Diário* como duas pastas e **nenhum cofre**; abra cada uma e busque uma palavra que só existe em `Segredo` ou na nota da raiz: nada. Com a pasta de anexos do cofre configurada como `Anexos` (Obsidian: Arquivos e links), uma imagem de `Anexos` aparece numa nota de `Projetos` e o celular não consegue acrescentar nem mudar nada ali, e nenhuma nota guardada em `Anexos` é listada, buscada nem aberta; a árvore diz qual pasta vai junto. Um link simbólico em `Projetos` para `Segredo` não mostra nada de `Segredo`. Numa nota de `Projetos`, um link para uma nota de `Segredo` aparece como *fora do que foi compartilhado com você*. Faça o celular editor (*Pode editar*): ele escreve dentro de `Projetos`; as outras pastas do cofre ficam como estavam no disco, exceto links reescritos por um renomear de uma nota de `Projetos` (o celular nunca é avisado de quais notas). Duas pastas escolhidas de mesmo nome (`A/Notas`, `B/Notas`) aparecem como *Notas* e *Notas (2)*. Desligue, desmarque todas as pastas da árvore: o cofre volta a ser servido inteiro (toda nota, nada da árvore sobra). Renomeie uma pasta escolhida no disco e ligue: essa pasta fica de fora; apague todas as escolhidas: não liga.
- [ ] **Ligar** (A): *Ajustes › Este app é um servidor*. Nada vem marcado. Marque o vault de demonstração, *Ligar o servidor*: antes vem a explicação do que o sistema vai perguntar (uma vez); depois ele serve, a barra de status mostra *Servindo* com *Parar*, e os Ajustes mostram `endereço:porta`. Feche o app e abra de novo: está desligado (e ligado de novo ao abrir só se *Manter ligado ao abrir o app* estava marcado). *Parar* na barra de status fecha.
- [ ] **Os avisos do macOS** (A): na primeira vez o sistema pergunta pela **Rede Local** e, com o firewall ligado, *Permitir conexões de entrada?* para o Verso (um app sem notarização pergunta; um notarizado pode não perguntar). *Permitir*: o celular conecta. *Negar* (Ajustes do Sistema › Rede › Firewall, tire o Verso): ligue de novo — a seção diz que o computador não alcançou o próprio endereço, com os passos do macOS; permita e ligue de novo. Diga se o autoteste (este computador conectando ao próprio endereço) realmente falha quando o firewall recusa, ou passa enquanto o celular ainda não alcança: isso decide se o aviso basta.
- [ ] **O firewall do Linux** (A): com o `ufw` ligado e a porta fechada, o mesmo aviso com a linha do Linux; `ufw allow from 192.168.0.0/16 to any port <porta> proto tcp` e o celular conecta.
- [ ] **A pergunta do firewall do Windows** (A): no Windows, na primeira vez que escuta, a explicação diz o que o Firewall do Windows Defender vai perguntar (em quais redes; deixe *Pública* desmarcada) e o Windows pergunta *Permitir que o Verso se comunique nestas redes?*; com só *Particular* marcada, um celular no mesmo Wi-Fi conecta, se o Wi-Fi estiver como Particular. Recuse (ou deixe o Wi-Fi como Público): a seção diz que o computador não alcançou o próprio endereço, com os passos do Windows; permita, desligue e ligue o servidor de novo, e funciona. Diga se o autoteste de fato falha quando o firewall recusa.
- [ ] **Parear um celular com um notebook Windows** (A): o pareamento inteiro — QR, código, *Foi você que leu este QR?*, *Permitir* — de um notebook Windows a um iPhone e a um Android; uma nota lida e editada pelo celular; *Revogar*; e o servidor parando sozinho quando o notebook troca de rede (Wi-Fi para um hotspot). O log do app não mostra nenhum ERROR. Também `verso serve` num terminal no Windows (`$env:VERSO_DATA_DIR`, `$env:VERSO_FOLDERS_DIR`), e Ctrl-C o para.
- [ ] **Parear um celular de verdade pelo QR** (A): *Parear um celular* mostra um QR, o endereço, um código e uma contagem a partir de 2:00. A câmera do iPhone lê o QR e abre a página; a página não pede senha. No computador, *Foi você quem leu este QR?* mostra o nome do celular, o endereço dele e a hora; *Permitir* com *Pode editar as notas* desmarcado: o celular abre a janela com a pasta marcada, só leitura (*Você só lê esta pasta*). Abra o diálogo de novo, pareie como editor e edite uma nota no celular: a nota muda no disco do computador e na janela dele.
- [ ] **O código digitado** (A): no celular, abra `https://<endereço>:<porta>/pair` à mão e digite o código: a mesma pergunta no computador. Três códigos errados fecham a janela e o computador diz; o código certo depois disso é recusado.
- [ ] **Expiração e fechar** (A): deixe o diálogo aberto por 2 minutos: ele diz que expirou e o QR não pareia mais; feche o diálogo com um celular esperando: a página do celular diz que foi recusado. Leia o mesmo QR duas vezes: a segunda é recusada.
- [ ] **O aviso do certificado, Safari no iPhone** (A): *Esta Conexão Não É Privada* → *Mostrar Detalhes* → *acessar este site*: a página carrega; uma segunda visita não avisa de novo. Diga se o cookie de sessão (`__Host-…`, Secure) sobrevive a um Safari fechado. A impressão digital do diálogo é a que *Ver Certificado* mostra.
- [ ] **O aviso do certificado, Chrome no Android** (A): *Sua conexão não é particular* → *Avançado* → *Continuar*: a mesma passagem. Um WebSocket sobre o certificado aceito funciona (as notas carregam).
- [ ] **O que o celular não faz** (A): o offline da pasta é declarado indisponível (um service worker não roda num certificado sem confiança); passkeys não são oferecidas; os Ajustes no celular não têm *Servidores* nem página de conta.
- [ ] **Suspender e acordar** (A): com um celular conectado, feche a tampa e abra na mesma rede: o servidor serve de novo (o celular reconecta sozinho); a barra de status continua dizendo *Servindo*. Feche, troque de rede (outro Wi-Fi), abra: o servidor parou sozinho e uma notificação diz por quê; ligar de novo exige que os celulares pareiem de novo (o endereço é uma origem nova).
- [ ] **Uma rede de café** (A): num Wi-Fi com isolamento de clientes (um hotspot de celular com isolamento, ou uma rede de visitantes) o celular não alcança o computador; o app, que alcança a si mesmo, não afirma outra coisa — diga o que o navegador do celular mostra e se o texto do diálogo de pareamento ajuda. Com uma VPN ligando enquanto serve: o servidor para (um endereço novo).
- [ ] **Revogar e esquecer** (A): *Revogar* num celular conectado: a página dele perde a janela na hora e recarregar pede para parear; *Esquecer todos os celulares*; *Substituir a identidade deste computador* (a impressão digital muda; todo celular precisa parear de novo, e o navegador dele avisa de novo).
- [ ] **A notificação** (A): a primeira conexão de um celular pareado levanta *Celular conectado* na janela (um aviso e uma linha na lista), não uma notificação do sistema; a segunda conexão não levanta nada.
- [ ] **mDNS** (A): com o diálogo de pareamento aberto, `dns-sd -B _verso-local._tcp` (macOS) ou `avahi-browse -rt _verso-local._tcp` (Linux) em outra máquina lista `Verso-xxxx` com um TXT de `v` e `port` e mais nada; fechar o diálogo o faz sumir em segundos (o adeus), e com o diálogo fechado nada é anunciado.
- [ ] **O atualizador** (A): com um celular conectado, *Verificar atualizações* › uma versão com *Reiniciar agora*: o cartão diz quantos celulares estão conectados e vão ser desconectados; depois do reinício a página do celular recarrega quando o contrato mudou.
- [ ] **O pacote instalado** (A): o app leva `ui-web` (os arquivos da janela para o celular): sem ele o servidor se recusa a ligar e diz. O `ui-web` não tem nenhum arquivo `*.map` (49 MB em 1 022 arquivos, medido em 2026-10-15; eram 103 MB com eles): a janela do celular continua abrindo e funcionando. Diga o tamanho que o app instalado ganhou.
- [ ] **A marca na barra de menus** (A, macOS e Windows; ADR 0096 item 1, construída em 2026-10-15): enquanto serve, um ícone do livro aparece na barra de menus (macOS: preto numa barra clara, branco numa escura, como o sistema o tinge) ou na área de notificação (Windows). O menu diz *Servindo N pastas…* (cinza), *Parar*, *Abrir Ajustes*, na língua da janela (mude-a nos Ajustes: as palavras acompanham). Um celular que conecta muda a contagem da dica. *Parar* desliga o servidor: o ícone some, e a marca da barra de status da janela some com ele. *Abrir Ajustes* traz uma janela para a frente em *Este app é um servidor*. Parar pelos Ajustes, ou a rede mudar, também tira o ícone; sair do app o tira. Com o VoiceOver (macOS) ou o Narrador (Windows) o ícone é anunciado com a dica e cada linha do menu é lida. No Linux não há ícone, de propósito.
- [ ] **O leitor de tela** (A): o VoiceOver lê o diálogo de pareamento (o QR tem nome; o endereço e o código são texto), a contagem conforme muda, a pergunta *Foi você?* quando aparece, e os botões *Revogar* dos celulares pelo nome.
- [ ] **Uma rede incomum** (A): um computador com o Tailscale rodando: os Ajustes mostram a dica do `tailscale serve`; com o certificado e a chave de `tailscale cert` preenchidos (*Usar meu próprio certificado*), o celular conecta sem aviso, pelo nome dado.
- [ ] **O endereço no diálogo de pareamento** (2026-10-15): num Mac com ZeroTier ou uma VPN, o diálogo nomeia o endereço do Wi-Fi ou do cabo e a interface (por exemplo `192.168.3.122 — en7 (rede local)`), não o virtual; a lista oferece os outros, e escolher um gera um novo QR e código com o qual o celular ainda pareia quando está nessa rede.
- [ ] **Digitar `[[` no teclado do celular** (2026-10-15): numa nota aberta no celular, digite `[[` com o Gboard (Android), com o teclado da Samsung e com o teclado do iOS, uma vez com sugestões de palavras ligadas e outra desligadas: a lista de notas aparece acima do teclado, dentro da tela, e um nome escolhido é escrito. Depois continue digitando uma palavra, `[[por`: no Gboard a palavra fica sublinhada até o espaço, e a lista tem de acompanhar cada letra (a melhor correspondência primeiro), também quando os colchetes e a palavra são uma composição só e com o botão `[[` da fileira de teclas; escolher uma escreve o nome. Aperte Esc: a lista fica fechada até você digitar de novo. O harness do navegador cobre os caminhos de composição do agente Android (EditContext, a palavra em composição, um teclado de mentira) só no Chromium; os teclados de verdade são desta verificação. Digite também `/`, `#` e `![[`.
- [ ] **O papel de um celular** (2026-10-15): pareie um celular como leitor, abra uma nota nele; em *Celulares pareados* marque *Pode editar* para ele — sem recarregar, o celular consegue digitar; desmarque — não consegue, e uma nota que ele editava ao vivo volta a ser lida; os dois aparecem em *O que aconteceu* e no `verso.log`.
- [ ] **O log** (2026-10-15): depois de ligar o servidor, parear, conectar, revogar e desligar, o `~/Library/Application Support/verso/logs/verso.log` tem uma linha para cada (origem `local`) e nenhum token, código, texto do QR ou texto de nota.

- [ ] **Um terceiro aparelho com os conectados no máximo** (A, um Android ou iPhone de verdade; fix/phone-refused-said, 2026-10-16): em *Ajustes › Este app é um servidor* ponha *Aparelhos conectados ao mesmo tempo* em 2, pareie três celulares (ou dois celulares e um navegador de computador pareado como celular) e abra o Verso em dois. Abra no terceiro: ele deve dizer, na sua língua, que o computador já atende 2 aparelhos conectados, o máximo, e o que fazer — não "o arquivo está na nuvem" — e continuar tentando a cada ~15 segundos, sem enxurrada. Feche o Verso em um dos dois (uma aba conta): o terceiro conecta sozinho em ~15 segundos. Suba o número para 3 com o terceiro esperando: ele conecta na próxima tentativa, e ninguém foi desconectado. Baixe o número abaixo da contagem: ninguém é cortado, uma conexão nova é recusada. O log do computador tem a recusa uma vez por minuto, e o log nos Ajustes diz *Celular recusado*, com o nome do celular.

### O celular sem rede (ADR 0092, feat/phone-offline, 2026-10-15)

Precisa de um UniVerso com **HTTPS** (um service worker não roda em HTTP
simples, salvo em `localhost`) e de um celular de verdade; os testes de
ponta a ponta imitam a rede com o modo offline do navegador e uma rota do
WebSocket.

- [ ] **Instalado num iPhone** (A): no Safari, abra o servidor, entre,
  Compartilhar › Adicionar à Tela de Início, abra pelo ícone. Ajustes › Sem
  rede numa pasta: o espaço é dito, *Guardar neste aparelho* funciona, e a
  página diz se o sistema prometeu guardar a cópia (*persisted*). Modo
  avião, feche o app, abra pelo ícone: a janela abre e lista a pasta; uma
  nota abre e é editada; a barra de status diz *Sem conexão* e *1 mudança
  esperando*. Modo avião desligado: *Voltou a rede: 1 mudança enviada*, e a
  nota no servidor tem o texto.
- [ ] **O despejo no iPhone** (A): com a cópia guardada e o armazenamento do
  celular quase cheio (ou passados sete dias sem abrir a página no Safari,
  sem instalar), abra a página sem rede: ou a cópia está lá ou sumiu — diga
  qual, e se a página avisou (*persistDenied*). O que se perde são as
  escritas que não tinham subido; nada no servidor.
- [ ] **Android** (A): Chrome, *Instalar app* (ou Adicionar à tela
  inicial); as mesmas passadas; o *Armazenamento persistente* dos ajustes do
  site no Chrome diz que a cópia não é apagada por falta de espaço.
- [ ] **Um conflito no celular** (A): uma nota editada no celular sem rede
  e num computador enquanto isso; de volta à rede: a versão do servidor
  tem o nome, a do celular é `… (conflito, iPhone · Safari, …).md`, listada
  em Ajustes › Sem rede com a diferença; uma notificação diz.
- [ ] **Sair e um celular perdido** (A): *Sair* diz quantas escritas não
  subiram; depois, Ajustes › Avançado › Dados de Sites do Safari não mostra
  nada do servidor além do código da página. O *Encerrar sessões e tokens*
  do console num celular sem rede: na próxima conexão a cópia é apagada e
  a página diz.
- [ ] **O celular de quem só lê** (A): quem só lê guarda uma pasta com um
  bloco secreto; sem rede, a nota não tem o bloco, e *Ver como leitor* do
  lado do dono mostra o mesmo texto.
- [ ] **O leitor de tela** (A): o VoiceOver/TalkBack leem o estado sem rede
  quando muda (*Sem rede: você edita as notas guardadas…*) e os controles da
  seção pelo nome, nos dois idiomas.
- [ ] **O Mac, WebKit** (A): o Safari no Mac, a mesma primeira passada; o
  WebKit da imagem de e2e não é o Safari.

### Uma página embutida como frame de verdade (fix/web-embed-clip, 2026-10-15)

Precisa do app instalado: a checagem, a política do frame e o guard de
navegação vivem no host, que o harness no navegador não tem. Faça cada uma
no macOS e no Windows. Cabeçalhos lidos com `curl -sI` em 2026-10-15:
`https://example.com/` e `https://en.wikipedia.org/` não enviam
`X-Frame-Options` nem `frame-ancestors` (embutíveis); `https://rolai.app/`
e `https://huggingface.co/` enviam `X-Frame-Options: DENY` (não embutíveis,
então usam a view nativa, como o rolai.app antes desta mudança). Use uma
nota longa com um embed aprovado de cada, alto o bastante para rolar.

- [ ] **Um site embutível** (example.com, ou um artigo da Wikipédia): ele
  aparece na nota como um frame; o tamanho é o da caixa, sem folga e sem
  barra própria além da da página. Rolar a nota o move como qualquer bloco
  da nota.
- [ ] **Um site que recusa** (rolai.app): aparece, na view nativa, como
  antes desta mudança. Diga se está cortado certo nas bordas do painel.
- [ ] **Meio por cima, meio por baixo, na barra de status**: role a nota
  até um embed embutível ficar meio acima do painel, meio abaixo dele, e
  logo sobre a barra de status: a página é cortada nas bordas do painel e a
  barra de status, a barra de abas e o sino ficam descobertos; sem
  piscar, sem atraso (é um frame, nada o segue).
- [ ] **Rolar a nota nunca rola a página**: com o ponteiro sobre o embed,
  role com a roda e com o trackpad: a nota e a página rolam como num
  navegador (a página primeiro enquanto pode, depois a nota); a página
  nunca se move com o ponteiro sobre o texto da nota.
- [ ] **A rolagem própria da página**: role dentro da página e depois role
  a nota: a página mantém a posição.
- [ ] **Painel dividido, Ajustes abertos**: divida a janela e ponha o embed
  perto do divisor: nada o atravessa; abra os Ajustes ou a paleta: a página
  não aparece por baixo (um frame fica sob o overlay como o resto da nota).
- [ ] **Um link e um vídeo dentro da página**: clique num link para outro
  site dentro da página embutida, e toque um vídeo que a própria página
  embute. Espera-se que os dois fiquem em branco por enquanto (o guard de
  navegação não conhece frames; ADR 0056 `[ABERTO]`). Diga o que acontece, e
  se a janela e a página continuaram usáveis.
- [ ] **Redirecionamento**: embuta `http://example.com/` (redireciona para
  https) e a forma com `www.` de um site que redireciona para o nome puro: a
  página carrega, ou usa a view nativa; nunca fica em branco.
- [ ] **Um endereço na rede** (um Calibre-Web, um painel em
  `192.168.x.x`): aparece, num frame ou na view nativa; diga qual.
- [ ] **Sem rede**: sem rede, um embed novo toma o caminho da view nativa
  (a checagem responde não) e não diz nada errado; ao voltar a rede,
  reinicie o app e a página vira frame.
- [ ] **Uma página como aba** (uma nota só com `url`): não muda, uma view
  nativa enchendo o painel.
- [ ] **O log** (`~/Library/Application Support/verso/logs/verso.log`):
  nenhum `ERROR` ao fazer o acima, e nenhum "not allowed" para
  `embed_frameable`.

### Uma página incorporada recortada como um quadro (feat/web-embed-native-clip, 2026-10-15)

Precisa do app instalado: a página é uma visão web filha nativa recortada
por um contêiner nativo (`app/src-tauri/src/web_clip`; ADR 0056 e ADR
0029, revistos em 2026-10-15), que nem o harness do navegador nem teste
algum alcança. Faça cada item no **macOS**, no **Windows** e no
**Linux** (X11 e Wayland; o Linux nunca tinha mostrado uma visão web
filha, então comece por abrir uma). Use uma página incorporada aprovada
de um site que recusa quadros (olddragon.com.br, rolai.app, o
Calibre-Web), alta o bastante para rolar por dentro, numa nota longa o
bastante para rolar. Deixe o log aberto (*Relatar problema*, ou o
`verso.log`): nenhuma linha *cannot be clipped like a frame* deve
aparecer — uma quer dizer que aquela view voltou ao corte antigo, que
mostra o topo da página.

- [ ] **Metade acima do painel**: role a nota até o topo da incorporação
  ficar mais ou menos na metade, acima do topo do painel. Aparece o
  *meio* da página (não o topo de novo), cortado na borda de cima do
  painel; a barra de abas e a barra de ferramentas descobertas. Role
  mais e volte: a página anda com a nota, linha a linha, sem salto, sem
  piscar, e a sua primeira linha volta à vista quando o espaço volta.
- [ ] **Metade abaixo do painel**: o fundo da incorporação abaixo do
  painel: aparece o topo da página, cortado no fundo do painel; a
  **barra de status** (e o sino nela) não fica coberta.
- [ ] **Na barra de status**: role até a borda de baixo da incorporação
  ficar logo abaixo do topo da barra de status: nem um pixel da página
  por cima da barra de status.
- [ ] **Montada para o espaço inteiro**: uma página que ajusta o tamanho
  à altura da sua janela (um player de vídeo, um app de altura inteira):
  no caso da metade, ela é montada para o espaço inteiro e mostra a sua
  metade de baixo — não espremida na parte visível.
- [ ] **A rolagem e os cliques da própria página**: com a incorporação
  meio acima do painel, role dentro da página com a roda ou o trackpad
  sobre a parte visível, clique num link e num botão ali, digite num
  campo: tudo funciona. Depois role a nota (sobre a nota, fora da
  página): a página não rola por dentro, só se move.
- [ ] **Um painel dividido**: divida a janela; a nota no painel da
  direita, a incorporação cortada pelo divisor: a página nunca por cima
  do outro painel, do divisor ou dos painéis laterais; abra e feche os
  painéis da esquerda e da direita com a página à vista.
- [ ] **Ajustes por cima**: no caso da metade, abra os Ajustes (e a
  paleta): a página some; fechados, ela volta no mesmo lugar, ainda
  cortada no painel.
- [ ] **Redimensionar a janela**: arraste um canto com a incorporação
  meio acima do painel: a página acompanha, cortada onde o painel
  termina, e nunca desenhada fora da janela durante o arraste.
- [ ] **Duas telas de escalas diferentes** (uma tela Retina e um monitor
  1×; no Windows 100 % e 150 %): leve a janela de uma para a outra com a
  incorporação na metade: a página mantém lugar e tamanho, nítida em
  cada uma, sem uma faixa dela fora do painel.
- [ ] **Duas incorporações numa nota**: as duas meio visíveis ao mesmo
  tempo (uma cortada em cima, outra embaixo): cada uma mostra a sua
  parte, nenhuma por cima do espaço da outra nem da moldura; feche a
  aba: as duas somem, nada fica por cima da janela.
- [ ] **Uma nota da web** (uma nota com `url`, *Ver página*): a página
  dela preenche a área como antes, acompanha divisões e
  redimensionamentos, some sob os Ajustes.

### Uma página incorporada cortada pelo seu painel (fix/web-embed-clip, 2026-10-15)

*(As verificações do corte que veio antes do recorte nativo. Onde o
recorte nativo está construído, as verificações dele acima substituem
estas; um item aqui que diz que a página é montada para a altura visível
não vale mais.)*

Precisa do app instalado: a página é uma visão web filha nativa, que o
harness do navegador não tem. Faça cada item no macOS e no Windows. Use
uma nota com uma página incorporada aprovada, alta o bastante para
rolar (um artigo longo, com linhas ou títulos numerados para o trecho
mostrado ficar óbvio), numa nota longa o bastante para rolar.

- [ ] **Metade acima do painel**: role a nota até a borda de cima da
  incorporação ficar mais ou menos na metade, acima do topo do painel.
  Veja o *meio* da página (as linhas 3, 4… e não 1, 2, 3), cortada na
  borda de cima do painel, com a barra de abas e a barra de ferramentas
  descobertas. Continue rolando: a página sobe com a nota, sem salto e
  sem piscar; role de volta: a página desce de volta ao começo.
- [ ] **Metade abaixo do painel**: role para o outro lado até o fim da
  incorporação ficar abaixo do painel. O começo da página aparece,
  cortado no fundo do painel; a **barra de status** não é coberta, nem o
  sino dela.
- [ ] **Mais alta que o painel**: uma incorporação mais alta que o
  painel, com o topo e o fim fora da vista: a página mostra o meio, sem
  cobrir nenhuma barra.
- [ ] **A rolagem da própria página**: com a incorporação inteira à vista,
  role dentro da página com a roda; depois role a nota um pouco: a página
  guarda a posição dela somada à da nota, e ainda rola por dentro.
- [ ] **Em um painel dividido**: divida a janela em duas; a nota no painel
  da direita, a incorporação perto da linha divisória e da borda do
  painel da esquerda: a página nunca passa por cima do outro painel, do
  divisor nem dos painéis laterais (abra e feche os painéis da esquerda e
  da direita com a página à vista).
- [ ] **Com os Ajustes (ou a paleta) abertos**: role até o caso da metade,
  abra os Ajustes: a página some, e volta no mesmo trecho quando eles
  fecham.
- [ ] **Abrindo já rolada**: role a nota antes, de modo que o topo da
  incorporação fique meio fora da vista, e então abra a aba (ou troque
  para ela): a página aparece já mostrando a parte de baixo.
- [ ] **Uma página de altura cheia** (que ajusta o tamanho à altura da
  janela, como um player de vídeo): no caso da metade ela aparece
  desenhada para a altura visível; diga se isso é aceitável (um iframe a
  desenharia para a caixa inteira).
- [ ] **Windows**: tudo acima, e mais a janela arrastada para outro
  monitor e redimensionada com a página na metade: a página acompanha sem
  se deslocar.

### Notificações na janela (ADR 0084, feat/notify-ui, 2026-10-14)

- [ ] **O servidor parado e iniciado de novo**: uma pasta deste
  computador que sincroniza com um UniVerso, e então pare o servidor. Em
  segundos, um aviso embaixo à direita, *Sincronização sem conexão*, que
  fica; o sino na barra de status diz *1 notificação não lida*. Inicie o
  servidor: o aviso vira *A sincronização voltou* e some em 6 s; a lista
  do sino tem uma linha, a mais nova. O mesmo com uma pasta do servidor
  aberta na janela: *Conexão com o servidor perdida*, depois *Servidor
  de volta* — uma vez cada, quantas tentativas o host fizer.
- [ ] **Um compartilhamento revogado, numa janela na pasta do servidor**:
  abra, no app do computador, uma pasta que outra conta compartilha com
  você; essa conta revoga. A linha de status e um aviso dizem *Quem
  compartilhou esta pasta, em …, revogou o seu acesso*, nunca *A conexão
  com o servidor caiu; tentando de novo…*.
- [ ] **Um compartilhamento dado por outra conta**: conectado a um
  UniVerso em *Ajustes › Servidores* (ou no navegador), outra conta
  compartilha uma pasta com você: um aviso *Uma pasta foi compartilhada
  com você* — quem, qual, o papel — com *Ver as pastas*, que abre
  *Ajustes › Servidores* (no navegador, o seletor de pastas). Uma vez por
  compartilhamento.
- [ ] **Uma atualização encontrada**: uma versão instalada mais velha que
  a última: um aviso *Nova versão disponível* alguns segundos depois de
  abrir, com *Baixar e atualizar* e *Ver nos Ajustes*; feche e abra de
  novo: nenhum segundo aviso para a mesma versão (a lista do sino ainda a
  tem). Deixado aberto por um dia, uma versão publicada no meio-tempo é
  dita.
- [ ] **A cota numa pasta sincronizada**: uma pasta deste computador
  sincronizada passando de 90 % da cota no servidor, depois de salvar:
  *Pasta quase cheia*, uma vez; apague arquivos até ficar abaixo de
  90 %, reabra a pasta (ou espere um dia), passe de novo: dito de novo.
- [ ] **As notificações do sistema, pedidas e recusadas, em cada sistema**
  (macOS, Windows, Linux, e um navegador por HTTPS): *Ajustes ›
  Notificações › Também nas notificações do sistema* desligado de
  início. No computador o plugin 2.4 do Tauri não pergunta nada e
  responde "permitido"; os ajustes do próprio sistema decidem em
  silêncio, e a linha diz onde ficam (macOS: *Ajustes do Sistema ›
  Notificações › Verso*; Windows: *Configurações › Sistema ›
  Notificações*) — bloqueie o Verso ali e veja que nada aparece. No
  navegador: o pedido dele; permitido, *Ligado.*; recusado (ou bloqueado
  depois nos ajustes do site, e a página recarregada), a linha volta a
  desligado dizendo por quê. Num navegador por HTTP simples a linha diz
  que precisa de HTTPS e não liga; no Safari de um iPhone fora da tela
  inicial, que precisa do app instalado.
- [ ] **O UniVerso por HTTP simples a partir de outro aparelho** (ADR 0073
  item 6 alterado em 2026-10-16; uma caixa ZimaOS ou CasaOS, um celular, um
  iPad): cole o compose publicado sem preencher variável alguma, abra
  `http://<endereço da caixa>:7340` no celular, crie o admin pelo link de
  configuração do log, entre. A página de entrada traz *Conexão sem HTTPS…*
  com *Como ligar o HTTPS*; a janela mostra o aviso que se fecha uma vez;
  *Ajustes › Offline* e *Notificações* dizem que precisam de HTTPS com o
  mesmo link; copiar um link pelo menu funciona; o app de desktop conecta ao
  mesmo endereço `http://` e sincroniza. Ponha o Tailscale ou o Caddy na
  frente, defina só o `VERSO_PUBLIC_URL`: o offline e as notificações
  ligam, o aviso some.
- [ ] **Uma notificação com a janela atrás**: as notificações do sistema
  ligadas, a janela atrás de outro app (ou minimizada, ou em outra aba do
  navegador), e então pare o servidor: uma notificação do sistema
  *Sincronização sem conexão*. Com a janela na frente: só o aviso. Um
  clique na notificação do sistema: no navegador a janela vem para a
  frente e a central abre nela. No computador o plugin 2.4 não avisa a
  página do clique — o clique só traz o app para a frente no macOS e no
  Windows, e a central não abre sozinha (o sino tem a contagem); abri-la
  no clique vem com o plugin 2.6 e o Tauri 2.12, num 0.8.x seguinte
  (decidido em 2026-10-14).
- [ ] **VoiceOver e o teclado**: um aviso é lido uma vez quando chega (um
  erro na hora), o foco ficando onde estava; Tab alcança os botões do
  aviso, Esc o fecha e o foco volta; o sino é lido com a contagem; a
  central é um diálogo, Esc a fecha.

### A lista de checksums assinada (ADR 0055, revisto em 2026-10-14; feat/release-checksums)

- [ ] **A 0.8.3 é a ponte** (quando a 0.8.3-beta.1 for publicada): a
  página da release dela tem 30 arquivos, o `verso-0.8.3-beta.1-SHA256SUMS`
  e o `.sig` dele entre eles, e diz que podem ser ignorados; uma
  0.8.2-beta.1 instalada se atualiza para ela por *Ajustes ›
  Atualizações* como antes (ela lê o `.sig` do próprio arquivo), sem ERROR
  no `verso.log`.
- [ ] **Da 0.8.3 em diante o app se atualiza pela lista** (quando a versão
  depois da ponte for publicada, com `PER_FILE_SIGNATURES` em `false` no
  `scripts/release-page.mjs`): a página dela tem 16 arquivos; a
  0.8.3-beta.1 instalada se atualiza para ela, sem ERROR no `verso.log`.
  Num servidor, `sh universo.sh update` diz *Assinatura e checksum válidos:
  universo-…deb está em verso-…-SHA256SUMS*. Antes dessa release, a cópia
  em `https://versomd.com/universo.sh` (versomd-site, `public/universo.sh`)
  é copiada de novo do `packaging/server/universo.sh`, ou o script do site
  não encontra assinatura nela.

### A prévia ao passar o mouse (ADR 0085, feat/hover-preview, 2026-10-14)

- [ ] **A nota de um link onde o ponteiro para, no app** (A): nota 02,
  *Prévia ao Passar o Mouse*, na Leitura: o ponteiro sobre "as fórmulas do
  Guia de Sintaxe" por meio segundo mostra o cartão, com o título marcado
  no topo; o ponteiro dentro do cartão o rola; fora, ele some; no tema
  escuro o cartão se lê como a nota. Uma nota com uma imagem da pasta
  (nota 06): a imagem aparece no cartão (o protocolo `verso:`, que o
  harness imita). `verso.log`: nenhum ERROR.
- [ ] **⌘ no modo Editar no Mac, Ctrl no Windows** (A): nota 02 no Editar,
  o ponteiro parado sobre um link: nada; ⌘ apertado (Ctrl no WebView2 do
  Windows): o cartão; ⌘-clique ainda segue o link e nenhum cartão fica para
  trás.
- [ ] **Uma nota só no iCloud** (A, ADR 0043): um link para uma nota que o
  macOS deixou sem dados (*Remover Download* no Finder): o cartão diz *A
  nota só está na nuvem: abra-a para baixá-la — a prévia não baixa nada.*,
  e o arquivo continua sem dados (`ls -lO` mostra `dataless`).
- [ ] **Um PDF e uma imagem com link** (A): `[[arquivo.pdf]]` e
  `[[imagem.png]]` com o ponteiro parado mostram o PDF (o pdf.js na web
  view do app) e a imagem no cartão; o console fica limpo enquanto o
  cartão abre e fecha.
- [ ] **O board pelo toque, num iPad** (A): um cartão de um board, um dedo
  parado sobre o nome dele: o cartão da nota; levantado, o board não
  seleciona nada novo nem abre nada. (O toque longo do grafo roda por
  máquina; o do board não.)
- [ ] **VoiceOver** (B): associe uma tecla a *Ver a prévia do link sob o
  cursor* em *Ajustes › Atalhos*, um link na Leitura com o foco pelo Tab,
  a tecla: o cartão é lido como o diálogo *Prévia de …* e o texto dele se
  lê; Esc o fecha e o foco volta ao link. O cartão de um passar de mouse
  não é anunciado e não pega o foco.

### Linkar menções sem link (ADR 0089, feat/link-mentions, 2026-10-14)

- [ ] **Linkar e Linkar todas no app** (A): no cofre de exemplo, abra "Lia
  Torres", painel da direita › *Links* › *Menções sem link*: a linha da
  nota 02, *Linkar* — o destaque da nota 02 passa a ter `[[Lia Torres]]`, a
  linha some, a nota 02 aparece entre os backlinks. Numa pasta sua, uma
  nota com nome de palavra comum (digamos "Mesa") mencionada em várias
  notas, uma delas numa tabela e uma num bloco de código: a do bloco de
  código não aparece; *Linkar todas* mostra o diff de cada nota, *Linkar
  todas* no plano grava, e o link da tabela é `[[Mesa\|mesa]]` com a tabela
  inteira. Mude uma das notas em outro editor com o plano aberto: ela é
  dita como não gravada. Com uma nota que menciona aberta numa aba,
  *Linkar*, e então ⌘Z nessa aba: o link é desfeito e salvo. `verso.log`:
  nenhum ERROR, e nenhum "not allowed" para `unlinked_mentions`.
- [ ] **Num UniVerso** (A): uma dona e um leitor na mesma pasta; uma nota
  com uma menção dentro de `> [!secret]` e outra fora. A dona vê as duas
  linhas com *Linkar*; o leitor vê só a de fora, e nenhum botão. A dona
  linka uma menção numa nota que outro membro tem aberta: o link aparece
  no editor desse membro ao lado do que ele digita, e nenhuma cópia de
  conflito aparece.
- [ ] **Com o VoiceOver** (A): o botão de cada linha é lido como *Linkar
  “texto” em Nota*; *Linkar todas* diz quantas; no plano, o Tab alcança o
  diff de cada nota e ele é lido como uma lista de mudanças.

### Sugestões de link enquanto se digita (ADR 0089 item 5, feat/typing-links, 2026-10-15)

- [ ] **No app, numa pasta sua** (A): Ajustes › Editor mostra "Sugerir links
  enquanto escrevo" desligado, com "Pastas ignoradas" e "Nomes ignorados"
  embaixo. Digitar o nome de uma nota numa nota não mostra nada. Ligue, sem
  reiniciar: digite o nome inteiro de uma nota, depois um apelido, depois o
  nome em outra caixa: "Ligar a [[Nome]]" junto ao cursor a cada vez, o
  texto intacto; Tab escreve `[[Nome]]` ou `[[Nome|texto]]` com o cursor
  depois dele e ⌘Z devolve as palavras digitadas; Enter faz o mesmo; Esc e
  seguir digitando dispensam, e o mesmo nome digitado de novo no parágrafo
  não mostra nada, no parágrafo seguinte mostra. Nada dentro de `` `código` ``,
  de um bloco cercado, de `[[…`, de uma fórmula `$…$`, nem para o nome da
  própria nota. Um nome em "Nomes ignorados" e uma nota numa pasta ignorada
  não são oferecidos. `verso.log`: nenhum ERROR.
- [ ] **Num UniVerso** (A): numa nota ao vivo com outra pessoa nela, aceite
  uma sugestão: o link aparece no editor da outra pessoa e nenhuma cópia de
  conflito surge. Para quem só lê a pasta, digitar é impossível e nenhum
  aviso aparece.
- [ ] **No celular** (A): o aviso aparece acima do cursor, grande o
  bastante para um dedo, sem "Tab"; um toque escreve o link e o teclado
  continua aberto.
- [ ] **Com o VoiceOver** (A): quando o aviso aparece ele é lido uma vez,
  sem interromper, "Sugestão de link: Nome, Tab para aceitar" (no celular
  "toque para aceitar"); depois do Tab, "Link criado para Nome."; ele nunca
  tira o foco do texto.

### O infobox (ADR 0086, feat/infobox, 2026-10-14)

- [ ] **Uma nota tipada num cartão ao lado do texto** (A): abra
  `Lugares/Porto Cinzento` no cofre de demonstração. O cartão fica à
  direita do texto, a imagem do porto no alto, na Leitura e no Editar; o
  VoiceOver (⌃⌥U, Pontos de referência) lista uma região complementar
  "Porto Cinzento" e lê a imagem como "O Porto Cinzento visto do farol".
  O Tab vai de "Abrir o schema" → cada propriedade em
  ordem → "Outras propriedades" → "Adicionar propriedade". Abri-la não
  grava nada (`git status` no cofre, ou a data do arquivo).
- [ ] **Uma edição no cartão chega ao arquivo, nos dois modos** (A): no
  modo Editar, acrescente um habitante com "Adicionar link…" (a lista
  oferece as notas da pasta), mude "Perigo"; o arquivo tem `- "[[…]]"` e
  o número novo, nada mais mudou; ⌘Z desfaz. O mesmo na Leitura. Uma
  figurinha ou uma capa escolhida no modo Editar agora também chega ao
  arquivo (a correção deste ramo).
- [ ] **Um painel estreito** (A): divida o painel (⌘\) até o cartão ir
  para cima do texto, dobrado na imagem e em três propriedades; "Mostrar
  todas as propriedades" abre o resto e diz que está expandido.
- [ ] **Uma imagem da web** (A): ponha em `mapa:` uma imagem `https://`
  de uma origem não aprovada: o cartão mostra o endereço como texto, o
  porquê e "Aprovar <origem>"; nada é buscado (`verso.log`, nenhuma
  requisição). Aprove: a imagem aparece, e a origem está nas origens
  aprovadas dos *Ajustes*. Com "carregar conteúdo remoto" desligado, uma
  origem aprovada mostra "Carregar". Na janela web (UniVerso) uma imagem
  `https:` de origem aprovada aparece; a CSP da página não mudou.
- [ ] **Obsidian** (A): abra o mesmo cofre no Obsidian: as propriedades
  do `Porto Cinzento` aparecem como o Obsidian as mostra, os habitantes
  como links, a nota do schema como um bloco de código.

### Blocos secretos (ADR 0087, feat/secret-blocks, 2026-10-14)

- [ ] **Um leitor nunca vê um bloco secreto** (A): um UniVerso, dois
  navegadores, a dona e uma conta com *leitor*. Uma nota com um bloco
  `> [!secret]`, um link, uma tag e um título dentro dele. O leitor: a
  Leitura, a prévia ao passar o mouse num link para ela, uma incorporação
  dela noutra nota, uma incorporação do título de dentro do bloco (*não
  encontrado*, nunca *secreto*), a busca por uma palavra do bloco, os
  backlinks da nota para a qual o bloco aponta, o painel de tags, o grafo,
  uma base listando `file.tags`: nada do bloco em lugar nenhum. A dona vê
  tudo, o bloco com um cadeado e *Oculto para leitores*.
- [ ] **Uma nota ao vivo** (A): os dois na nota. A dona digita dentro do
  bloco: nada chega ao leitor; fora dele: a nota do leitor acompanha um
  instante depois que a dona para (o salvamento da sala), e o leitor vê o
  nome da dona entre os presentes, mas nenhum cursor. A dona cola um bloco
  secreto novo numa nota que o leitor tem aberta sem nenhum: a aba do
  leitor lê a nota de novo, sem ele. O log do servidor não tem ERROR.
- [ ] **O aparelho de um leitor** (A): o app desktop da conta do leitor
  sincronizando a pasta: o arquivo no disco dele não tem o bloco (`grep`
  por uma palavra dele); a dona muda só o de dentro do bloco: o aparelho
  do leitor não mostra mudança nova; a dona muda uma linha fora dele: o
  aparelho a traz.
- [ ] **Um token que só lê** (A): `verso mcp` ou um programa com um token
  que só lê a pasta: `read_note` e `search` dão a nota sem o bloco.
- [ ] **Um editor que vira leitor estando na nota** (A): a dona torna um
  editor leitor, nos membros da pasta, com a janela dele numa nota com
  bloco secreto: a aba dele lê a nota de novo, sem o bloco.
- [ ] **Um servidor atualizado** (A): um servidor de uma versão anterior
  com uma nota que já tem bloco secreto, atualizado: depois da primeira
  pergunta de sincronização de um aparelho (a pasta percorrida de novo), o
  aparelho de um leitor guarda a nota sem o bloco.
- [ ] **Ver como leitor** (A): no app instalado, uma pasta deste
  computador: o bloco diz *Visível para quem tiver o arquivo*; *Ver como
  leitor* e *Ver a nota inteira*, pelo ponteiro e por Tab e Enter, o
  VoiceOver dizendo a faixa.

### Histórico de versões (ADR 0091, feat/version-history, 2026-10-14)

- [ ] **O histórico de uma nota e uma restauração, no app** (A): no app
  instalado, uma pasta deste computador: abra uma nota, digite dois
  parágrafos, espere, e *⌘⇧P › Histórico de versões* (também no menu da
  aba, no menu da árvore de arquivos e no relógio da barra de status). A
  lista diz *como estava quando o histórico começou* para a nota como
  era, e *<nome do computador> (este computador)* para as edições, na
  hora que o relógio deste Mac mostra. Escolha a primeira: a diferença
  mostra os dois parágrafos como linhas `- `. *Restaurar esta versão*
  pergunta, restaura, diz *Versão de … restaurada.*, e o editor mostra o
  texto antigo; o histórico agora tem uma *restauração* no topo. O
  VoiceOver lê a linha de cabeçalho da tabela, o botão de cada versão, e
  a mudança como *N linhas adicionadas, M removidas*. O arquivo do
  histórico fica no diretório de configuração
  (`~/Library/Application Support/verso/history/<chave>.sqlite`), nunca
  na pasta: `ls -a` na pasta antes e depois. O `verso.log` não tem ERROR.
- [ ] **Um arquivo mudado por outro programa com a diferença aberta**
  (A): abra o histórico de uma nota, escolha uma versão, mude a nota em
  outro editor e salve; *Restaurar esta versão*: a janela diz que o
  arquivo mudou e nada foi escrito, a diferença é refeita, e o texto do
  outro editor está no disco.
- [ ] **Uma restauração numa nota editada junto** (A): dois navegadores
  num UniVerso, duas contas na mesma nota, as duas digitando um tempo. O
  histórico nomeia as duas contas numa versão (dez minutos da sala numa
  só). Uma restaura uma versão antiga: a outra vê o texto mudar na hora,
  sem aviso de conflito; a restauração fica no topo do histórico, com o
  nome de quem restaurou. O registro de auditoria do servidor (console ›
  Registro) tem *restaurou uma versão*.
- [ ] **Quem só lê não tem histórico** (A): quem só lê uma pasta de um
  UniVerso não tem *Histórico de versões* na paleta, nos menus nem na
  barra de status.
- [ ] **Uma pasta sincronizada no computador** (A): uma pasta deste
  computador sincronizada com um UniVerso; abra o histórico de uma nota:
  as versões são as do servidor (outros aparelhos e contas com nome)
  mais, marcada *só neste computador*, uma edição feita com o servidor
  desligado. Desligue o servidor e abra de novo: a janela diz que mostra
  só as versões deste computador. Restaure uma versão do servidor: a
  janela diz que foi restaurada no servidor e que a sincronização a traz.
- [ ] **O console** (A): `/admin` › uma pasta: *Histórico de versões*
  com as versões e o tamanho *fora da cota*; ponha *Dias no histórico*
  em 1 e aplique: as versões mais antigas saem (o log do servidor diz
  quantas); *Usar o padrão* volta ao `VERSO_HISTORY_DAYS`. A visão geral
  mostra o total dos históricos.
- [ ] **O crescimento numa pasta grande** (B): no cofre real do mantenedor
  sincronizado com um UniVerso por uma semana, `du -h
  $VERSO_DATA_DIR/history.sqlite` contra o tamanho do texto da pasta, e o
  número do console.

### Dados e tabelas sorteadas (ADR 0088, feat/dice, 2026-10-14)

- [ ] **Um dado numa nota rola e não escreve nada** (A): no app
  instalado, a nota 24 do cofre de exemplo na Leitura, depois no Editar:
  cada código `dice:` é um dado; um clique e Enter rolam, o cartão mostra o
  total e cada dado, o VoiceOver diz *1d20+5: …* uma vez por rolagem. A
  rolagem da tabela dá uma linha cujo link abre o Capitão Ruy. Feche a
  nota e olhe o arquivo no disco: os mesmos bytes (`shasum` antes e
  depois), e nenhuma linha de `write` dele no `verso.log`.
- [ ] **Numa sala quem rola é o servidor** (A): dois navegadores num
  UniVerso, duas contas na mesma nota com `` `dice: 1d20+3` ``. Uma rola: a
  outra vê o mesmo total com *X rolou* ao lado do dado, e o VoiceOver diz o
  nome; uma terceira janela que abre a nota depois mostra essa rolagem.
  Quem só lê também rola. O log do servidor não tem ERROR. Pare o servidor
  e role: o cartão diz que rolou só nesta janela.
- [ ] **A nota de uma pasta sincronizada, no desktop** (A): uma pasta deste
  computador que sincroniza, a nota aberta em duas janelas do app e num
  navegador: uma rolagem numa janela aparece na outra e no navegador.
- [ ] **⌘⇧P › Rolar dados…** (A): rola uma notação digitada; nada escrito.

### O resto das bases (ADR 0094, feat/bases-rest, 2026-10-14)

- [ ] **O mapa desenha nas web views de verdade** (A): no app instalado no
  macOS (WKWebView), no Windows (WebView2) e no Linux (WebKitGTK), a nota
  04 do cofre de demonstração, *Projetos.base › Mapa*: o contorno do mundo
  nas cores da janela, três marcadores (São Paulo, Lisboa, Recife); um
  clique num marcador abre o projeto; o ponteiro parado nele mostra a
  nota; a lista embaixo nomeia os três. Nenhuma linha `maplibre` ou
  `Failed` no `verso.log`, e o app não fez pedido nenhum para fora (Little
  Snitch ou o log do firewall, se houver). Uma máquina sem WebGL diz *Esta
  tela não consegue desenhar mapas* e mantém a lista. Tema escuro: o
  contorno acompanha.
- [ ] **Tiles só com a sua escolha** (A): *Ajustes › Fundo dos mapas ›
  OpenFreeMap*: o mapa passa a mostrar as ruas do OpenFreeMap; de volta a
  *Contorno do mundo*: o contorno de novo, e nenhum pedido a
  `tiles.openfreemap.org`. Uma base com `mapTiles:
  https://tile.openstreetmap.org/{z}/{x}/{y}.png` pergunta *Esta base pede
  o fundo do mapa a …* antes de buscar qualquer coisa; *Aprovar* carrega.
  *Carregar conteúdo remoto* desligado: só o contorno, dito acima do mapa.
- [ ] **Num UniVerso** (A): a mesma aprovação num navegador no servidor:
  *Recarregar* depois de aprovar, e as tiles carregam; os cabeçalhos da
  resposta de `/` e de `/maplibre-worker.mjs` (o painel de rede do
  navegador) nomeiam a origem aprovada em `connect-src`, e nenhuma outra;
  outra conta no mesmo navegador não aprovou nada e a página dela não nomeia
  nenhuma.
- [ ] **Uma base feita pelo plugin Maps do Obsidian abre como mapa** (A):
  no Obsidian com o plugin Maps, faça uma visão de mapa (ela grava
  `coordinates`, `markerIcon`, `markerColor`, `center`, `defaultZoom`); a
  mesma pasta no Verso mostra os marcadores, ícones e cores; defina o
  centro pelo menu do botão direito do Verso e o Obsidian abre lá. As
  chaves vieram do código público do plugin (`obsidianmd/obsidian-maps` em
  `a5bf456`, `src/map-view.ts`), ainda não vistas numa base que o plugin
  gravou.
- [ ] **Uma expressão regular no núcleo de verdade** (A): nota 04, a coluna
  *Mês* de *Todos os Projetos* mostra `09/2026`; uma fórmula
  `/(?<=a)b/.matches(file.name)` diz *A expressão regular usa
  lookbehind…* nas células e acima da visão.
- [ ] **Uma base incorporada editada no lugar** (A): nota 04 em Leitura, a
  *Todos os Projetos* incorporada: acrescente uma ordenação pela barra
  dela; a *Projetos.base* no disco ganha a ordenação e nada mais muda
  (`git diff`). Com a *Projetos.base* aberta noutra aba e editada sem
  salvar, a mudança da incorporada espera essa aba ou diz que não foi
  gravada. Um leitor num servidor não vê a barra.

### Notas periódicas (ADR 0093, feat/periodic-notes, 2026-10-14)

- [ ] **A semana e o mês no app** (A): no app instalado, no cofre de
  demonstração, ⌘⇧P › Nota desta semana e Nota deste mês criam
  `Diário/2026-W42.md` (do `Templates/Semanal.md`) e `Diário/2026-10.md` no
  disco; o `verso.log` tem as linhas de `create` e nenhum ERROR; o ⌘⇧D
  ainda cria a de hoje. No Calendário do painel da direita, o VoiceOver lê o
  número de uma semana como *Semana 42 de 2026*, ← num domingo chega a ele,
  → volta.
- [ ] **Os ajustes são da pasta** (A): Ajustes › Notas periódicas diz
  *Desta máquina*; mude o início da semana: o `.verso/settings.json` no
  disco ganha `periodic` com a pasta das diárias, o idioma e o `weekStart`;
  a linha diz *Da pasta*. Abra a mesma pasta num segundo computador (ou numa
  cópia sincronizada): as mesmas notas são encontradas. Um formato com `HH`
  é recusado, dizendo qual, e o arquivo não muda (`shasum`).
- [ ] **Os ajustes do Obsidian, oferecidos e nunca gravados** (A): numa
  cópia de um cofre em que as Notas diárias do Obsidian têm pasta e formato
  definidos (e, se houver, uma com o plugin Periodic Notes), Ajustes › Notas
  periódicas oferece *Usar os ajustes do Obsidian* com esses valores;
  aceitar os grava no `.verso/settings.json`. `shasum` de
  `.obsidian/daily-notes.json` e `.obsidian/plugins/periodic-notes/data.json`
  antes e depois: iguais. Com o `.obsidian/` só no iCloud (placeholder), a
  oferta diz que os ajustes estão só na nuvem e nada é baixado.
- [ ] **Dois aparelhos criam a mesma semana sem rede** (A): uma pasta
  sincronizada com um UniVerso em dois computadores; os dois sem rede, cada
  um cria a nota desta semana (template sem `{{time}}`) e escreve uma linha
  sob ele; de volta à rede, os dois têm uma nota com o template uma vez e
  as duas linhas, a do servidor primeiro — sem cópia de conflito, *merged*
  na atividade da sincronização. Com um template que tem `{{time}}`, criado
  em minutos diferentes: uma cópia de conflito, como antes.
- [ ] **Quem só lê** (A): a janela de quem só lê num UniVerso: sem "Nota
  desta semana" na paleta enquanto a semana não tem nota; a semana no
  Calendário diz que ainda não existe; a nota de uma semana que existe abre.
- [ ] **Windows** (A; o `scripts/check-windows.sh` não rodou — nenhum
  código de plataforma mudou): na VM do Windows, o caminho da nota da
  semana com `/` no formato (`gggg/[Semana] ww`) vira pastas, e o
  `.obsidian\daily-notes.json` de um cofre é oferecido.

### O retorno da janela (fix/ui-feedback, 2026-10-14)

- [ ] **Um servidor fora de alcance é dito onde você agiu** (A): uma
  pasta deste computador aberta, conectado a um UniVerso, e então pare o
  servidor. Em *Ajustes › Sincronizar*, acima do botão: *Não foi possível
  alcançar o servidor localhost:7351 — ele está fora do ar ou sem rede.* e
  *Tentar de novo*; aperte *Sincronizar esta pasta*: ele fica ocupado por
  um instante e a mensagem fica. Ligue o servidor, *Tentar de novo*: a
  pasta sincroniza. O mesmo em *Ajustes › Servidores* (no lugar das pastas
  do servidor, e sob *Abrir aqui*) e no seletor de pastas. Uma pasta que
  sincroniza, com o servidor parado: a barra de status diz *Servidor fora
  de alcance: localhost:7351* em segundos, e a seção dela diz por quê, com
  *Sincronizar agora*. `verso.log`: um `WARN host unreachable: the server
  at http://localhost:7351: … Connection refused …` por minuto, nenhum
  ERROR por clique. Não verificado por teste: as falhas do próprio sistema
  para um nome que não existe e um certificado TLS recusado — tente
  `https://naoexiste.invalid` em *Servidores › Conectar*.
- [ ] **Uma janela numa pasta de servidor, com o servidor parado** (A):
  abra uma pasta do UniVerso na janela, pare o servidor: a barra de status
  diz *A conexão com o servidor caiu; tentando de novo…* e, em até 5 s,
  *Servidor fora de alcance: localhost:7351* e *Tentar de novo*.
  `verso.log`: as tentativas a 5, 10, 20, 40 s… (uma linha WARN por
  minuto, não uma por tentativa). Ligue o servidor, *Tentar de novo*: em
  um segundo, *Conectado ao servidor de novo.*, a pasta como está no
  servidor.
- [ ] **A paleta sobre os ajustes** (B): *Ajustes* aberto, um clique numa
  seção, depois ⌘⇧P: a paleta fica por cima com o cursor nela; Esc fecha
  só a paleta, e o foco volta para *Ajustes*; Esc de novo fecha *Ajustes*.
  O mesmo com ⌘P e com *Ajuda › Relatar problema* sobre *Ajustes*.
  VoiceOver, com a paleta aberta: nada de *Ajustes* é lido atrás dela.
- [ ] **A paleta sobre o diálogo de compartilhar** (B): numa pasta de
  UniVerso que é sua, o menu de uma pasta › *Compartilhar…*, digite um
  e-mail, depois ⌘⇧P: a paleta fica por cima com o cursor nela; Esc fecha
  só a paleta, o e-mail ainda digitado e o cursor de volta no campo; Esc
  de novo fecha o diálogo. VoiceOver: o diálogo não é lido atrás da
  paleta.
- [ ] **O console do DevTools diz uma falha** (C): o console aberto
  (⌥⌘I), o servidor parado, *Sincronizar esta pasta*: um aviso, `Verso:
  unreachable: localhost:7351`, e nenhum token ou senha em linha alguma.
- [ ] **A hora do relatório é a do computador** (D): *Relatar problema*:
  a linha *Hora deste computador: 2026-10-14 10:25:24 (UTC−03:00)* é o
  relógio e o fuso do Mac; as linhas do registro abaixo dela estão em UTC
  (`Z`), três horas à frente em São Paulo.

### Endurecimento de segurança (ADR 0083, 2026-10-13)

- [ ] **Uma nota e um board compartilhados editados pelo app desktop
  enquanto outra janela os edita** (8d419e9, ca4c8a6, 857f4aa): no app
  instalado numa pasta de UniVerso, a mesma nota aberta no navegador;
  digite rápido nos dois ao mesmo tempo, depois cole um parágrafo longo
  no app enquanto o navegador digita: cada letra chega nos dois, na
  ordem digitada, nada perdido nem dobrado, a aba ainda *ao vivo* e
  nunca avisada de uma edição que não foi, sem faixa de conflito, o
  arquivo no disco do servidor com o mesmo texto; depois um board, arrastando e desenhando nos dois ao mesmo
  tempo: os dois veem os dois, nada pula de volta. O log do app
  (`verso.log`) e o journal do servidor não têm atualização recusada.
  Não verificado por teste: que o app passa adiante as chamadas de uma
  janela na ordem (ca4c8a6).
- [ ] **"Confirme que é você" antes de um token e antes de aprovar um
  aparelho** (item 6 da ADR 0083; 40de8b5, 1d7c4e4): com o login feito
  há mais de dez minutos, nos *Ajustes* do servidor, *Tokens de acesso*,
  *Criar token*: o diálogo *Confirme que é você* abre, o campo de senha
  com o foco; uma senha errada diz *Senha errada.*; a certa cria o token
  sem perguntar de novo. De novo depois de dez minutos, com *Usar uma
  passkey* (Touch ID no Mac, a passkey do celular): o token é criado. O
  mesmo no *Aprovar este aparelho* da página do aparelho. O Escape fecha
  o diálogo e nada é criado; o VoiceOver lê o título e a linha do
  diálogo.
- [ ] **Conectar o app copia o código, e a página o pede** (decidido em
  2026-10-14, ADR 0083 Como construído): no app instalado, *Ajustes ›
  Servidores*, o endereço do servidor, *Conectar*: a linha diz *Código
  copiado — cole na página que abriu:* com o código, e o navegador abre a
  `/device` do servidor com o campo *Código do aplicativo* vazio; ⌘V
  (Ctrl+V no Windows e no Linux) cola o código, *Continuar* mostra quem
  pediu, *Aprovar este aparelho* conecta o app. No Windows (WebView2) e
  no Linux (WebKitGTK) como no Mac; onde o sistema recusa a cópia, a linha
  diz *Digite este código na página que abriu:* no lugar e o código é
  digitado. Um link `/device?code=…` aberto à mão mostra o mesmo campo
  vazio e não envia nada.
- [ ] **A página do aparelho com um código digitado** (item 17 da ADR
  0083, 73807d2): `/device` aberta à mão pede *Cole o código que o
  aplicativo copiou, ou digite o que ele mostra na tela dele.*; o código
  que o app mostra, digitado em minúsculas e sem o traço, é aceito, e a
  página mostra *Código que você informou* ao lado de quem pediu antes de
  *Aprovar* ou *Não fui eu: recusar*; um código digitado errado diz *Um
  código tem oito letras…* ou responde como desconhecido, e alguns
  errados seguidos fazem a página esperar antes do próximo; o app então
  entra depois de aprovado.
- [ ] **Compartilhar uma pasta do servidor pelo app pede "Confirme que
  é você"** (item 6 da ADR 0083): no app instalado com login num
  UniVerso, numa pasta de que a conta é dona, *Compartilhar…* numa pasta
  da árvore, o e-mail de outra conta e *Compartilhar*: o diálogo *Confirme
  que é você* abre sobre o diálogo de compartilhar, só com a senha (sem
  *Usar uma passkey*: a janela do app não responde pelas passkeys do
  servidor) e o foco no campo; uma senha errada diz *Senha errada.*; a
  certa adiciona a pessoa sem perguntar de novo, e mudar o papel dela em
  dez minutos não pergunta nada. Cancelar a deixa de fora e o diálogo de
  compartilhar diz *Dar ou mudar um papel pede que você confirme que é
  você; nada mudou.* O VoiceOver lê o título e a linha do diálogo; o foco
  volta ao diálogo de compartilhar quando ele fecha.
- [ ] **Os diagramas Mermaid depois da 12.2.0** (item 13 da ADR 0083,
  cda7500): a nota "08 - Diagramas Mermaid" do vault de demonstração no
  app instalado e no navegador: todo diagrama desenha, no claro e no
  escuro; um diagrama com erro de sintaxe mostra a mensagem do próprio
  leitor abaixo de "Syntax error in text"; os nós em círculo cabem no
  rótulo, os rótulos de um mapa mental ficam centrados e legíveis, as
  cardinalidades de um diagrama de classes ficam ao lado das pontas das
  relações.
- [ ] **Os passos do Caddy que o universo.sh imprime, num host que já
  serve outro site** (7755802): num host Linux cujo Caddy já serve um
  site, instale com o `universo.sh` e siga os passos impressos: o outro
  site continua respondendo, o site do UniVerso está em
  `/etc/caddy/Caddyfile.d/universo.caddyfile`, o Caddyfile tem um
  `import Caddyfile.d/*.caddyfile` só (nenhum acrescentado no Fedora ou
  no EPEL, cujo pacote já o tem), o `caddy validate` passa e os dois
  sites respondem por HTTPS.

### Tudo editado junto (item 12 da ADR 0082, feat/coedit-everything, 2026-10-12)

- [ ] **Um board em dois lugares ao mesmo tempo** (21d096a, 5a027db): num
  UniVerso, um board aberto no navegador e no app instalado na pasta do
  servidor; arraste um cartão num enquanto desenha uma forma e escreve um
  texto no outro: os dois veem os dois num instante, o ponteiro do outro
  anda com o nome, o arquivo no disco do servidor tem os dois, sem faixa
  de conflito, sem cópia; apague uma forma num enquanto a arrasta no
  outro: ela continua apagada, e o ⌘Z onde foi apagada a traz de volta nos
  dois.
- [ ] **O board de uma pasta sincronizada entre dois computadores**: a
  pasta sincronizada em dois Macs (ou um Mac e a VM do Windows), o mesmo
  board aberto nos dois com rede: o mesmo de cima, e o arquivo local de
  cada computador segue os salvamentos da sala; tire a rede de um, desenhe,
  a aba diz *local — sem conexão* e o arquivo local tem o desenho; com a
  rede de volta, *O quadro está ao vivo de novo* e o outro computador
  recebe o que foi desenhado, sem cópia.
- [ ] **Um `.txt` e uma base em dois lugares**: um arquivo de texto
  digitado pelo navegador e pelo app ao mesmo tempo, letras juntadas; o
  *Ordenar* e os *Filtros* de uma base mudados num, a visão da base do
  outro se redesenha com eles, e o `.base` no disco os tem.
- [ ] **Uma nota no cartão de um board e numa aba da mesma janela**: a
  nota editada no cartão com a aba dela aberta ao lado, e de um navegador
  ao mesmo tempo: os três mostram o mesmo texto, ninguém é tirado da sala,
  o arquivo acompanha.
- [ ] **Abrir não grava nada**: um board aberto em dois lugares, olhado,
  arrastado e ampliado, fechado: a hora de modificação do arquivo não
  muda.

### As decisões de 2026-10-12 (feat/decisions-2026-10-12)

- [ ] **Um nome que só difere na caixa é recusado** (spec Q8, ADR 0070
  item 3): no app instalado, ao lado de uma nota `Nota`, uma nota nova
  `nota` não é criada e a barra de status diz que um Mac ou o Windows
  guardaria só um dos dois; renomear `Nota` para `nota` funciona; uma
  pasta sincronizada com um UniVerso no Linux com uma nota `nota.md`
  criada ali ao lado de `Nota.md` (à mão no disco do servidor) aparece em
  "Não sincronizados" da sincronização como nome ocupado.
- [ ] **Os favoritos de um leitor ficam neste computador** (ADR 0070
  itens 1–2): conectado como leitor de uma pasta de UniVerso que tem
  `.verso/settings.json`, uma estrela numa nota aparece na hora, continua
  depois de reabrir a pasta, e *Ajustes › Organização › Favoritos* diz
  *Desta máquina*; o `settings.json` do servidor não muda e nenhum erro é
  dito; a mesma pasta sincronizada no desktop como leitor se comporta
  igual.

### Sincronização e UniVerso (feat/universo, 2026-10-11)

- [ ] **Duas pessoas compartilham pastas num UniVerso** (ADR 0081,
  2026-10-11): duas contas, dois navegadores (e o app desktop). Sérgio
  clica com o botão direito numa pasta do vault dele, *Compartilhar…*, o
  e-mail da Ana, *edita*; o botão da pasta da Ana a lista em
  *Compartilhados comigo* como "Pasta (Sérgio)", ela abre numa janela
  própria, uma nota criada ali aparece na pasta do Sérgio, um link para
  uma nota dele de fora diz *Não está no que foi compartilhado com você.*;
  Ana compartilha uma de volta com Sérgio, *lê*. No app desktop a Ana
  sincroniza o compartilhamento com uma pasta vazia do computador dela
  (Ajustes › Servidores › *Sincronizar*), nunca dentro do vault dela.
  Sérgio renomeia a pasta compartilhada na janela dele: a janela e o sync
  da Ana continuam. Notas que incorporam imagens da pasta de anexos do
  vault: o diálogo oferece *Incluir “…”, só leitura*, e a Ana passa a ver
  as imagens sem poder mudá-las. Sérgio tira a Ana: a janela dela fecha a
  pasta na hora, a cópia sincronizada fica e o sync dela desliga, dizendo
  que o compartilhamento foi revogado e quando (`6c7800e`). Também na largura de um celular. A página da pasta no console
  lista o compartilhamento com as pessoas; o log de auditoria tem cada
  passo com o caminho.

- [ ] **A sincronização de um compartilhamento revogado desliga com um
  aviso** (ADR 0081 item 8, `6c7800e`): no app instalado, a Ana
  sincroniza um compartilhamento do Sérgio; o Sérgio a tira em
  *Compartilhar…*. Em segundos o app da Ana mostra um aviso "Quem
  compartilhou … revogou o seu acesso em …", a barra de status diz
  "Desligada: quem compartilhou revogou o acesso em …" (âmbar), e
  *Ajustes › Sincronizar* abre em "Compartilhamento revogado" acima do
  formulário; os arquivos dela estão como estavam; o log do app tem uma
  linha `WARN sync turned off: … its owner revoked the share` e nenhum
  `ERROR`. Feche e abra a pasta de novo: o aviso continua e a
  sincronização não começa. Ligue a sincronização de novo com outra
  pasta: o aviso some.
- [ ] **A página que aprova um aparelho diz quem pediu** (lacuna 12 do
  modelo de ameaças, `5838c10`): *Ajustes › Servidores*, conecte ao
  UniVerso; a página no navegador mostra *Quem pediu* — o nome deste
  computador, o endereço que o servidor vê para ele, a hora — e então
  *Foi você quem pediu, neste aparelho?*, *Aprovar este aparelho: <nome>*
  e *Não fui eu: recusar*. Recuse: o app para de perguntar e não
  entra; conecte de novo e aprove: entra. Com o VoiceOver, os dados e a
  pergunta são lidos antes dos botões. Também na largura de um celular.
- [ ] **Um cursor leva o nome de quem escreve** (lacuna 11 do modelo de
  ameaças, `3bc56ae`): duas contas numa nota, em dois navegadores: cada
  uma vê o cursor da outra com o nome e a cor da conta da outra, como
  antes.

- [ ] **"Guardar os dois" no conflito do editor** (`18da5c7`): numa pasta
  sincronizada, mantenha uma nota aberta em Editar com texto não salvo
  enquanto outro aparelho a muda; a tela "O arquivo mudou em disco…" oferece
  um terceiro botão, "Guardar os dois" — a versão do disco fica com o nome,
  o seu texto vai para `<nota> (conflito, <este computador>, <data>).md`, a
  aba mostra a cópia.
- [ ] **Uma nota apagada fora enquanto a aba está suja** (`e5b3ee0`): apague
  o arquivo no Finder enquanto digita nele; a aba diz "Esta nota foi apagada
  ou movida fora do Verso. O seu texto continua aqui." com "Salvar de novo" e
  "Fechar sem salvar"; sem ERROR no log do app.
- [ ] **Links que um rename não conseguiu atualizar** (`da6ac8e`): renomeie
  uma nota enquanto outro programa edita uma nota que linka para ela; o
  aviso nomeia a nota pulada, e "Tentar de novo" aplica a mudança sobre o
  texto novo.
- [ ] **Um nome em duas formas de acento** (spec Q7, `0cb6dd5`): num
  aparelho Linux ou Windows crie `Café.md` ao lado de um `Café.md` que o
  servidor já tem na outra forma Unicode; o segundo é listado em "nome de
  outro, só mudando…" e nunca enviado; o primeiro continua sincronizando.
- [ ] **Janela numa tela pequena** (`068215e`): numa tela 1280×800 a
  primeira janela abre dentro da tela, barra de status visível.
- [ ] **O nome deste aparelho** (ADR 0079 item 8, 2026-10-11): no app
  instalado, Ajustes › Servidores › "Nome deste aparelho" — vazio, com o
  nome do sistema de placeholder; dê "Estúdio", "Salvar nome": conectado a
  um servidor, diz "os servidores já mostram o nome novo", e o Ajustes ›
  Conta do servidor lista a sessão como "Verso · Estúdio"; um conflito feito
  depois é `<nota> (conflito, Estúdio, <data>).md`; esvaziado e salvo, o
  nome do sistema volta nos dois.
- [ ] **Um admin encerra as sessões de outra conta** (ADR 0077 item 3,
  2026-10-11): no console, a página de uma conta com um aparelho conectado
  e sincronizando e um token — "Encerrar sessões e tokens", confirme; a
  página diz quantas foram; a sincronização do aparelho diz que foi
  desconectada na hora (não na próxima varredura), o navegador dessa conta
  cai na página de entrar, o token dela para de responder, e o registro
  lista "encerrou as sessões e os tokens da conta" sobre essa conta.

### A lixeira (ADR 0080, feat/universo, 2026-10-11)

- [ ] **A lixeira de uma pasta deste computador** (`9c10495`, `173cf7e`):
  no app instalado, apague uma nota e abra *Ajustes › Lixeira* (ou "Abrir
  a lixeira" na paleta, ou o botão direito no espaço vazio da árvore): a
  nota aparece com a data de hoje; "Restaurar" põe o arquivo de volta no
  disco (o Finder mostra) e o log tem uma linha `trash` "restored".
- [ ] **O que uma lixeira antiga guardava** (`8ad89d2`): abra uma pasta cuja
  `.trash` o Obsidian ou um Verso mais antigo encheu; os itens aparecem
  "antes de … (data desconhecida)", nada é apagado na hora; *Manter
  arquivos apagados por* "1 dia", um dia depois, remove-os, cada um uma
  linha "expired" do log; a varredura também roda um dia depois de abrir a
  pasta, enquanto ela fica aberta.
- [ ] **Uma exclusão que a sincronização fez aqui** (`9c10495`): com dois
  computadores sincronizando uma pasta, apague uma nota num deles; no
  outro, a lixeira a lista "pela sincronização com <servidor>".
- [ ] **A lixeira do servidor de teste** (`02903f1`): depois da
  atualização, os 306 MB que já estavam na `.trash` de uma pasta aparecem
  com data desconhecida e nada some antes de 30 dias desde a primeira
  leitura; a página da pasta no console mostra *Lixeira* (quantidade,
  tamanho, "fora da cota") e *Dias na lixeira*; os totais da Visão geral
  somam as lixeiras; quem edita restaura mas não vê "Apagar agora"; a dona
  encurta os dias pela janela e não passa dos da administração.
- [ ] **Uma versão que a escrita de um aparelho substituiu** (`02903f1`,
  F18): num computador sincronizado, deixe outro programa salvar um texto
  antigo por cima de uma nota que a sincronização acabou de atualizar; no
  servidor, a *Lixeira* lista "substituído por <aparelho>", e "Restaurar"
  a põe ao lado da nota como `<nota> (restaurado <data>).md`.
- [ ] **A janela do desktop numa pasta do servidor** (`9c10495`): *Ajustes ›
  Lixeira* mostra a lixeira do servidor, com os limites do papel.

### Versão 0.5 (feat/windows-fs, feat/signed-updates)

- [ ] **Verso para Linux** (ADR 0071, 2026-10-09), nas máquinas do
  `verso-linux-vm`: o `.deb` no Ubuntu e no Debian (GNOME), o `.rpm` no
  Fedora (KDE), o AppImage em qualquer uma — cada um abre uma pasta, edita
  uma nota, abre um board; "Mostrar no gerenciador de arquivos" seleciona o
  arquivo; no AppImage, Ajustes › Terminal e agentes › Instalar põe o
  `verso` em `~/.local/bin`. No desktop do mantenedor, com NVIDIA no
  Wayland: a janela desenha (nenhum painel em branco).
- [ ] **Um board aberto e tocado logo em seguida** (2026-10-09): abrir o
  Tour do Verso, clicar nele, arrastar a vista com Espaço e dar zoom de
  imediato; depois de alguns segundos o arquivo está igual (`git status` na
  pasta de demonstração, ou a data do arquivo), no Mac e no Linux.
- [ ] **A primeira atualização assinada** (ADR 0055, 2026-10-09): da
  versão anterior à primeira release assinada, "Baixar e atualizar" a
  instala no macOS e no Windows; a página da release lista um `.sig` ao
  lado de cada arquivo.
- [ ] **Sem barra de título** (ADR 0072, 2026-10-08): no Mac, tela cheia
  (os botões somem, a faixa da esquerda volta para cima), uma segunda
  janela, arrastar pela barra de abas e pelo topo da barra lateral; no
  Windows, encaixar numa borda da tela e Win+setas, redimensionar por cada
  borda, um duplo clique no espaço vazio da barra de abas; no Linux (GNOME,
  KDE), o mesmo: arrastar, redimensionar por cada borda, Super+setas, um
  duplo clique.
- [ ] **Um servidor de agentes para todo o Verso** (ADR 0054, 2026-10-08):
  em Ajustes › Terminal e agentes escolha "Um servidor para todo o Verso",
  marque duas pastas como visíveis, "Adicionar ao Claude Desktop", feche o
  Verso, reinicie o Claude Desktop; num chat pergunte quais pastas ele vê e
  peça uma busca numa delas — ele nomeia as duas, as lê, e o `agents.log`
  na pasta de configuração do Verso lista cada chamada. No Mac, com uma
  pasta em Documentos ou no iCloud: o macOS pergunta, e nomeando qual app?
- [ ] **O Claude Desktop inicia o servidor do Verso no Windows**
  (2026-10-08): no Mac iniciou; no Windows o log disse "no stdio servers
  connected". Ajustes › Desenvolvedor no Claude Desktop mostra o estado do
  servidor.
- [ ] **A atualização pelo app no Windows** (ADR 0055, 2026-10-08): de um
  beta de Windows para o seguinte, "Atualizar" baixa o instalador, roda-o,
  e a versão nova abre com as notas e os ajustes como estavam. Nunca
  rodada: a primeira versão de Windows é a primeira chance.
- [ ] **Uma nota nos Arquivos Sob Demanda do OneDrive** (ADR 0043,
  2026-10-08): numa máquina Windows com OneDrive, ponha uma pasta de notas
  no OneDrive, botão direito nela, "Liberar espaço"; abra-a no Verso — as
  notas aparecem, o primeiro índice não baixa nada (os ícones de nuvem
  ficam), e abrir uma nota baixa só aquela e mostra o texto dela — nenhum
  "the cloud did not give the file's content" no log. Só o `attrib +O` foi
  testado.
- [ ] **Uma pasta dentro de um cliente de sync de terceiros** (ADR 0029, a
  escrita atômica da feature 2; uma checagem manual desde 2026-10-12, que
  não trava nada): ponha uma pasta de notas dentro do iCloud Drive, do
  Dropbox, do OneDrive ou do Syncthing, abra-a no Verso e salve uma nota
  algumas vezes; em outra máquina, ou na página web do próprio cliente, a
  nota chega como o mesmo arquivo editado — não apagada e criada de novo,
  sem cópia em conflito, com o histórico de versões mantido onde o cliente
  tem um.

### 0.4.0-beta.1

- [ ] **Várias entradas na árvore** (`f3e1af3`): ⌘-clique em duas notas e
  ⇧-clique numa terceira — as linhas entre elas ficam selecionadas; Esc
  limpa. Arraste-as para uma pasta: elas vão; uma nota que apontava para
  elas por caminho aparece num plano só. Botão direito na seleção: Mover
  para…, Copiar caminhos relativos, Mover para a lixeira (uma pergunta).
- [ ] **A largura de uma coluna** (`a6d9fa9`): na tabela da nota 01,
  arraste a borda direita de uma célula de cabeçalho no Editar; troque
  para Leitura e volte, reabra a nota — a largura fica; o `.md` não muda.
- [ ] **O botão direito numa página de pasta** (`6595623`): no espaço
  vazio de uma página de pasta, o menu da árvore, com ícones.
- [ ] **O botão de copiar código em inglês** (`6595623`): Ajustes › Idioma
  › English, e passe o mouse no botão de copiar de um bloco de código:
  "Copy code".
- [ ] **`type:` na busca** (`f3e1af3`, a permissão): busque
  `type:personagem` — os dois personagens aparecem (antes, no app,
  respondia "not allowed").

### Próxima versão

- [ ] **O embed de um bloco** (spec Q3, Q21): nota 02, "Incorporar só um bloco" — o embed mostra só a terceira descoberta; um link `[[Projetos/Pesquisa e Descobertas#^atomica]]` abre a nota naquele item. Na Leitura nenhum `^atomica` aparece, nem no embed nem na nota; no Editar ele aparece apagado.
- [ ] **Templates numa nota nova** (ADR 0068): ⌘N — "Começar com" sob o título; escolha "Nota de Reunião": a nota é o template com a data de hoje; ⌘Z desfaz; uma nota nova com Em branco fica como estava.
- [ ] **O identificador novo mantém os ajustes da janela**: depois de atualizar da 0.4.0-beta.1, o tema, as teclas e a largura de uma coluna estão como eram; o log diz "window data carried over to com.versomd.app.beta" uma vez.
- [ ] **A capa de um PDF na visão de pasta**: abra `assets` do cofre de exemplo, Miniaturas — o PDF mostra a primeira página; troque para Lista e volte para a tabela — os itens continuam.
- [ ] **O ⌘Z do menu com o foco fora do texto**: numa nota no Editar,
  digite duas palavras com um segundo entre elas, clique no botão
  Editar, aperte ⌘Z duas vezes — cada palavra sai por vez; ⌘⇧Z traz a
  última de volta.
- [ ] **Um SVG no Editar**: nota 06 do cofre de exemplo, Editar — o
  diagrama aparece, e continua ao ser selecionado com o texto em volta.
  À esquerda do título de uma nota sem figurinha, um brilho apagado, não
  uma estrela.
- [ ] **A versão no endereço dos arquivos** (cache depois de uma
  atualização): depois de atualizar, a janela mostra a interface da versão
  nova na hora, sem tela antiga; o leitor de PDF e um board continuam
  abrindo.

### O servidor (ADR 0073, 0074, 0075)

Nas máquinas do mantenedor, com o servidor alcançado por HTTPS
(`tailscale serve` ou um proxy); o `scripts/check-server-image.sh` e os
testes de ponta a ponta cobrem o resto.

- [ ] **Passkeys** num aparelho de verdade: adicionada em *Conta* no Mac
  (Touch ID) e no iPhone; *Entrar com passkey* depois do e-mail, no Safari
  e no Chrome.
- [ ] **O celular e o iPad** no navegador, pelo `tailscale serve`: entrar,
  abrir uma pasta, editar uma nota, ver chegarem as edições do outro
  aparelho.
- [ ] **O app desktop numa pasta do servidor** (o app instalado):
  *Ajustes* › *Servidores*, *Conectar*, *Permitir* no navegador, abrir uma
  pasta, editar, uma imagem da pasta aparece; sair e abrir o app de novo: a
  pasta do servidor volta.
- [ ] **CasaOS ou ZimaOS**: o compose instalado pela tela da loja de apps,
  as variáveis do admin preenchidas, as pastas no NAS.
- [ ] **Um `.deb` numa máquina pequena sem Docker**: instalado, o arquivo
  de ambiente editado, `systemctl enable --now universo`.
- [ ] **A conta em Ajustes e o console de administração**, no navegador do
  Mac e do iPhone: o botão da pessoa ao lado da engrenagem abre *Ajustes* ›
  *Conta*, que leva um admin ao `/admin`; as seções do console, a cota de uma
  pasta, o menu no celular; no celular, *Ajustes* e *Conta* no pé da gaveta
  lateral; o cartão de entrar nos dois temas.
- [ ] **Uma pasta perto da cota**: uma nota acrescentada além de 90 % mostra
  o aviso na janela; um arquivo além da cota é recusado com a frase, e
  apagar um arquivo é permitido.
- [ ] **Sincronização entre dois computadores** (ADR 0079), com o app
  instalado no Mac e em outro computador (a VM Windows), os dois
  conectados ao mesmo UniVerso: uma pasta sincronizada do Mac para uma
  pasta nova lá, depois a mesma pasta do servidor sincronizada numa pasta
  vazia do outro computador; uma edição num chega no outro em segundos; uma
  nota editada nos dois com um sem rede volta como a versão do servidor e
  uma cópia *(conflito, …)*, com a diferença em *Ajustes* ›
  *Sincronizar*; um vídeo grande cruza inteiro; o Obsidian, na pasta do
  Mac, vê as mudanças; o log diz o que cruzou e não tem `ERROR`.
- [ ] **Os ajustes de uma pasta em dois computadores** (ADR 0070 itens
  1–2), ao lado da conferência acima: no Mac, uma nota com estrela e
  *Ignorar pastas de build* desligado na pasta sincronizada; no outro
  computador, depois da sincronização, a estrela e a chave estão lá, cada
  uma marcada *Da pasta*, e o `.verso/settings.json` as guarda; mudados
  nos dois com um sem rede, a versão do servidor fica com o nome e o
  `.verso/settings (conflito, …).json` fica ao lado; uma pasta nunca
  marcada nem mudada não tem `.verso/`; uma pasta cujos favoritos o app
  instalado já guardava antes desta versão abre com eles, levados para o
  `.verso/settings.json` uma vez.
- [ ] **Uma nota ao vivo em dois computadores** (ADR 0082), ao lado da
  verificação acima: a mesma nota aberta em Editar na pasta sincronizada
  do Mac, na do outro computador e num navegador; cada um vê o texto dos
  outros enquanto digitam, com os nomes ao lado do título (*ao vivo, com
  …*); os arquivos dos dois computadores seguem a sala em segundos e
  nenhuma cópia *(conflito, …)* aparece. Wi-Fi desligado no Mac enquanto
  digita: *local — sem conexão*, o texto fica e está no arquivo do Mac;
  ligado de novo, a nota volta a *ao vivo* e o texto digitado sem rede
  está nas janelas dos outros, uma vez só. Com duas janelas do Mac em duas
  pastas sincronizadas que têm, cada uma, uma nota com o mesmo nome,
  digitar numa nunca aparece na outra (uma janela ouve só os eventos da
  sua sala). O VoiceOver diz quem entra e sai, e a nota ficando local e
  ao vivo. O log não tem `ERROR`.
- [ ] **Uma gravação numa nota ao vivo só em outro lugar** (ADR 0082, as
  gravações que não são teclas): a nota aberta em Editar só no navegador;
  na pasta sincronizada do Mac, com a nota em nenhuma aba, citar nela um
  trecho de PDF (é a nota de anotações dele), definir uma célula de base
  dela e dar a ela um adesivo na árvore. Cada uma chega ao texto do
  navegador como uma edição enquanto se digita lá, o arquivo segue em
  segundos, e nenhuma cópia *(conflito, …)* aparece em nenhum computador.
  Fechada no navegador, as mesmas gravações vão para o arquivo como antes.
- [ ] **Um botão da faixa oculto e trazido de volta** no app instalado:
  botão direito › *Ocultar este botão*, a barra de status diz onde;
  *Ajustes* › *Aparência* › o switch dele o traz de volta; a engrenagem não
  tem *Ocultar*.

### A janela em toda tela (ADR 0076)

No celular e no iPad do mantenedor, a janela do servidor no navegador
(feat/web). O Playwright não move dedo no WebKit nem abre o teclado do
sistema, e uma página não sabe se um leitor de tela está ligado: isto só
se vê aqui. Antes de o servidor ser anunciado (ADR 0073 item 6).

- [ ] **VoiceOver no iPhone** (ADR 0076 item 9; ADR 0035 item 2): deslize
  pela barra de baixo — cinco botões, cada um com nome (Arquivos, Buscar,
  Nova nota, Voltar, Comandos); abra a gaveta e chegue a uma linha, depois
  ao "…" dela ("Mais ações: …"); tocar duas vezes e segurar numa linha
  abre o menu; no Editar, um toque duplo num link e o cartão depois do
  texto ("Link: …") com Abrir e Editar link; a barra do teclado chamada
  "Ferramentas de escrita"; numa pasta de quem só lê, "Você só lê esta
  pasta" lido em voz alta.
- [ ] **VoiceOver no iPad**, em pé e deitado: o mesmo; acima de 760 px a
  fita e as áreas divididas ficam; os controles do grafo ao lado dele
  deitado, atrás de "Ajustes do grafo" numa área abaixo de 520 px.
- [ ] **TalkBack no Android** (Chrome): os mesmos passos; o tocar duas
  vezes e segurar do TalkBack abre o menu de uma linha (o `contextmenu` do
  próprio Android).
- [ ] **Segurar no iOS**: uma linha segurada e solta abre o menu; segurada
  e movida, arrasta para uma pasta; deslizar rola a árvore e não move
  nada. Um cartão do kanban segurado: o menu, com "Mover para a coluna…";
  deslizar no quadro passa uma coluna por vez.
- [ ] **O teclado na tela** no iPhone e no Android: no Editar, o menu `/`,
  as sugestões de link depois de `[[`, o seletor de figurinhas e o menu de
  uma aba abrem acima do teclado; o cursor fica acima dele, também na
  última linha da nota; a barra do teclado fica sobre o teclado, e os
  botões dela não fecham o teclado (menos "Esconder o teclado").
- [ ] **O entalhe e os cantos**: um iPhone com entalhe, em pé e deitado —
  nada sob o entalhe nem nos cantos arredondados; a barra de baixo acima
  do indicador de início.
- [ ] **A pinça**: sobre o texto a página inteira amplia (e volta); sobre o
  grafo, um board e um PDF, só eles ampliam.
- [ ] **Números de linha**: no celular, uma nota no Fonte não tem; ligados
  em Ajustes › Editor, aparecem.

### Mapas no board (feat/board-maps, 2026-10-15)

Precisa do app instalado, de um servidor, de um celular e de uma segunda
conta: o corte dos ladrilhos roda no host, o board do leitor é do servidor, e
o que um dedo e um mapa de verdade parecem não está no harness do navegador
(ADR 0090). Faça o mapa antes: um PNG de uns 16.000 pixels de lado (um
continente, ou qualquer imagem grande salva como PNG; um JPEG do mesmo
tamanho para a última conferência), posto numa pasta; um board com ele, e
duas notas.

- [ ] **Um mapa grande de verdade, no app desktop**: solte o PNG num board,
  selecione, "Usar como mapa". O cartão diz "Preparando o mapa…" com uma
  porcentagem que cresce, depois a imagem aparece; aproxime a 100 % e
  arraste: ladrilhos nítidos chegam enquanto você anda, sem pausa, e a
  memória da janela fica pequena (Monitor de Atividade: algumas centenas de
  MB, não um gigabyte). Feche o app e abra de novo: o mapa é desenhado na
  hora, nada é cortado de novo. Diga quanto durou o corte e quanto cresceu
  `~/Library/Application Support/verso/index/*.tiles`.
- [ ] **Um mapa grande no servidor**, o host de 1 GB: o mesmo mapa numa pasta
  do servidor, aberto num navegador; "Preparando o mapa…", depois os
  ladrilhos. A memória do servidor (`docker stats` ou `free`) fica abaixo
  do limite enquanto corta; o `VERSO_DATA_DIR` guarda o arquivo `.tiles` e a
  pasta não guarda nenhum ladrilho. Outra pessoa que abra o mesmo board
  enquanto corta vê o mesmo cartão.
- [ ] **Um JPEG desse tamanho** é desenhado inteiro, com o aviso "Imagem
  grande demais…" pedindo um PNG; num celular a página pode recarregar —
  diga o que aconteceu.
- [ ] **Alfinetes**: arraste uma nota da árvore para o mapa (um alfinete, não
  um cartão); "Fixar uma nota aqui…"; aproxime e afaste: o alfinete mantém o
  tamanho e fica no seu ponto; um clique abre a nota; o ponteiro parado nele
  mostra a nota (prévia ao passar o mouse); arrastar o move; "Deixar de
  usar como mapa" (sumário, Mapas) solta a imagem.
- [ ] **Num celular** (iPhone e Android): faça a pinça no mapa — os alfinetes
  não crescem; um toque num alfinete abre a nota; um dedo parado num
  alfinete mostra a nota e a retirada não abre nada; os ladrilhos chegam
  enquanto você arrasta, sem engasgos; leitura: o VoiceOver ou o TalkBack lê
  cada alfinete como "Abrir <nota>" na ordem de leitura, e o sumário os lista
  como links.
- [ ] **Uma conta de leitor**: num servidor, marque um alfinete como "Oculto
  dos leitores". Entre como leitor em outro navegador: o board não tem o
  alfinete secreto; a busca não acha a nota dele pelo texto do alfinete, os
  backlinks da nota não listam o board, e a pasta sincronizada num app
  desktop como esse leitor (um compartilhamento de leitura) tem um arquivo de
  board sem o alfinete (abra num editor de texto). O "Ver como leitor" do
  escritor mostra o mesmo board. Um leitor com o board aberto quando ele é
  marcado o vê mudar, sem o alfinete (ele não está na sala).
- [ ] **O Obsidian abre o mapa**: o board no Obsidian mostra a imagem e os
  alfinetes como cartões de arquivo (o secreto também); edite e salve lá,
  depois abra no Verso: `map`, `pin`, `secret`, `locked` e os grupos continuam
  sob o `verso` de cada nó (a nova observação do O4 na versão do dia, ADR 0090
  Consequências).

## Para reproduzir

Relatados no backlog, mudados desde então, mas sem teste que os cubra; se
ainda acontecem, um passo que os faça acontecer basta.

- [ ] O Exposé do app (⌃↓) lista todas as janelas do Verso (Backlog,
  2026-09-24): uma janela do sistema, que o harness do navegador não
  mostra.

## Conferido

- [x] A busca de notas acha uma nota pelo nome exato do arquivo quando o
  primeiro título a chama de outro jeito, em primeiro na lista; o × limpa
  a busca (feat/web-groundwork, o beta instalado em 0a38c65, conferido
  pelo mantenedor em 2026-10-09).

- [x] O menu de uma imagem: Baixar imagem, Abrir em nova janela; Abrir
  pasta numa segunda janela; uma nota destacada devolvida à janela
  principal (0.4.0-beta.1, conferido pelo mantenedor em 2026-10-07).
- [x] O painel da nota tipada e as nove ferramentas do MCP (0.4.0-beta.1,
  2026-10-07).
- [x] Cobertos por `app/ui/e2e/backlog-repro.spec.mjs` em 2026-10-07, e
  por isso fora desta lista: as setas e o cursor em bullets e checkboxes
  no Editar (nenhuma falha achada); uma aba arrastada para a borda
  direita com as duas barras abertas (nenhuma falha achada); uma janela
  estreita (a barra direita fechada passava 4px da borda — consertado);
  o ⌘Z com o foco fora do texto (não desfazia nada — consertado); e a
  frase incompleta sobre selecionar texto com imagens (um SVG sem
  tamanho próprio era uma linha vazia no Editar — consertado).
