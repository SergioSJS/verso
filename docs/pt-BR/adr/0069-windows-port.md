# ADR 0069 — A versão para Windows: x64, um instalador, testada numa máquina Windows por SSH

- Data: 2026-10-07
- Fonte: o mantenedor, em sessão: "uma das coisas que a gente tem para
  fazer é implementar uma versão para Windows", antes de uma versão estável
  com o máximo de recursos; depois, diante de cinco perguntas, "1. Sim, pode
  já fazer 2. Qual o melhor no nosso caso? Pros e contras 3. Por enquanto
  sim 4. Excelente pergunta, mas não tenho windows arm pra testar 5. Não
  sei"; e, diante dos prós e contras, "Prefiro nsis tb. Deixa win 10 tb,
  muita máquina não recebe a atualização". A máquina de teste foi montada na
  mesma sessão. As cinco perguntas em si não estão neste registro, só as
  respostas; a leitura da resposta 3 abaixo é do autor. Revisado em
  2026-10-07 pela Fable 5.1, aplicando a própria leitura a pedido do
  mantenedor, que decidiu começar agora ("Tô querendo já iniciar windows");
  lido pela Opus 5.5 no mesmo dia e revisado de novo sobre os achados dela
  (ADR 0032). A revisão: ADR 0022 revisado, o app real dirigido por uma
  segunda fixture da suíte ponta a ponta, e as questões abertas abaixo.
- Relacionados: [0022](0022-target-platforms-macos-first.md) (o Windows
  sai, antes do Linux), [0029](0029-guardrails-in-ci.md) (as verificações
  por plataforma e os scripts locais), [0043](0043-placeholder-guard.md) (o
  placeholder do OneDrive, `[ABERTO]`),
  [0051](0051-development-flow-and-releases.md) (as versões, e a assinatura
  de código no Windows adiada), [0055](0055-in-app-updater.md) (o caminho
  do atualizador no Windows, nunca exercitado).
- Status no briefing: não presente

## Contexto

O ADR 0022 decidiu que o Windows sai, antes do Linux e **depois da Fase 2**,
e que entra nas verificações por plataforma do CI em `main` e no
empacotamento de uma versão quando o porte chegar. Não disse como ele é
construído e testado, e nada no repositório decide um formato de instalador,
uma arquitetura ou como o código de Windows roda antes de um push. Em
2026-10-07 o mantenedor antecipou o app de Windows ("Tô querendo já iniciar
windows"): o ADR 0022 e o roadmap levam essa revisão, datada, e este ADR é o
como.

O Windows não roda em Docker num Mac ([0029](0029-guardrails-in-ci.md)), e
por isso o `scripts/check-linux.sh` não tem gêmeo para Windows. Há duas
máquinas Windows à mão: uma máquina virtual Windows 11 no servidor Proxmox
do mantenedor, na rede de casa, montada em 2026-10-07 por scripts que a
instalam sem intervenção e a deixam com o toolchain, SSH e Área de Trabalho
Remota; e um PC de jogos com GPU de verdade. Nessa máquina virtual o
`cargo test -p verso-dialect` passou, 93 testes de 93, com o toolchain
fixado em `rust-toolchain.toml`.

A janela hoje é afinada para o WKWebView: arrastos por eventos de ponteiro
porque o arrastar e soltar do HTML5 está morto lá, embeds em web views
filhas, um cache que sobrevive a atualizações. O WebView2 é Chromium. A
suíte ponta a ponta (`app/ui/e2e`, Playwright) roda só em WebKit.

O que foi conferido fora do repositório em 2026-10-07, para os itens
abaixo: o template NSIS do Tauri (`crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi`
e `utils.nsh` no repositório do Tauri) aceita `/S` (silencioso), `/P`
(passivo) e `/UPDATE`, pergunta se encerra o app em execução e o encerra no
modo silencioso, e detecta uma instalação MSI (WiX) anterior e oferece
desinstalá-la; o `webviewInstallMode` é `downloadBootstrapper` por padrão,
`embedBootstrapper` acrescenta uns 1,8 MB, `offlineInstaller` uns 127 MB
([Windows Installer](https://v2.tauri.app/distribute/windows-installer/)); o `tauri-driver` roda só em Windows e Linux, enquanto o
`@wdio/tauri-service` do WebdriverIO roda um servidor WebDriver embutido no
app em Windows, Linux e macOS
([WebDriver](https://v2.tauri.app/develop/tests/webdriver/)); o Playwright
se liga a um app WebView2 pelo Chrome DevTools Protocol quando o app é
iniciado com `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<porta>`,
uma `WEBVIEW2_USER_DATA_FOLDER` por teste
([Playwright, WebView2](https://playwright.dev/docs/webview2)); o `MoveFileEx`
com `MOVEFILE_WRITE_THROUGH` está documentado em duas frases — "a função não
retorna até o arquivo estar de fato movido no disco" e "definir esse valor
garante que uma movimentação feita como cópia e exclusão seja descarregada
no disco antes de a função retornar" — então a garantia explícita é sobre o
caso de cópia, e sem `MOVEFILE_COPY_ALLOWED` uma movimentação nunca cai para
uma cópia ([MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw));
um minuto de Windows no GitHub Actions custa uns 1,7 de Linux pelo preço
(US$ 0,010 contra US$ 0,006 em runners de 2 núcleos,
[preços do GitHub](https://github.com/pricing/calculator)).

Duas coisas sobre a máquina Windows não foram conferidas e precisam ser, na
`verso-win`, antes de os itens 5 e 7 serem construídos: o `cargo test
--workspace` lá — a escrita atômica sincroniza o diretório com
`File::open(dir)` e `sync_all` (`crates/verso-fs/src/write.rs`), que o
Windows recusa, então toda escrita responderia `durability_not_confirmed` e
os testes que afirmam nenhum aviso falhariam até a primeira entrada do item
9 chegar; e se uma janela iniciada por um comando SSH ganha área de trabalho,
já que o serviço do OpenSSH roda os comandos na sessão 0, sem área de
trabalho interativa — o item 7 pode precisar de uma sessão com login e uma
tarefa agendada, ou de uma sessão de Área de Trabalho Remota aberta, para
iniciar o app.

Medido no `verso-win` em 2026-10-08, pelos primeiros pull requests do
porte. O workspace nem compilava lá: o `xattr` era dependência do
`verso-fs` em todo sistema, e o `verso-fs` parava o build de propósito onde
só existia a metade Unix da sua identidade de diretório. **Um diretório
aberto com acesso de escrita e `FILE_FLAG_BACKUP_SEMANTICS`, pelo
`OpenOptionsExt` estável da std, aceita `FlushFileBuffers` (`sync_all`)**;
aberto só para leitura, é recusado com "Access is denied". Isso é um
`fsync` de diretório no Windows sem `unsafe` e sem dependência, um fato
novo para o primeiro `[OPEN]` do item 9: o porte faz o flush do diretório
assim, e a pergunta continua sendo do mantenedor. O `Path::join` punha `\`
nos caminhos relativos à pasta, e um board e um link foram escritos com
ela. Ler as notas de um diretório levantava um evento de "modificado" do
próprio diretório, o que faria cada passada do índice começar a próxima. O
harness de teste do host desktop morria na partida
(`STATUS_ENTRYPOINT_NOT_FOUND`) sem o manifesto de aplicação que o
tauri-build embute só no app. Uma nota é renomeada por `link` e `unlink`
lá também (o NTFS tem hard links), e o Windows recusa renomear uma pasta
enquanto algum arquivo dentro dela está aberto.

## Decisão

1. **Só x64, Windows 10 e 11.** Windows em ARM não é construído: não há
   máquina para testar. O Windows 10 fica, embora tenha saído do suporte em
   outubro de 2025: muita máquina nunca recebeu a atualização para o 11.
2. **O instalador é NSIS, por usuário.** Instala sem direitos de
   administrador, então o atualizador do app
   ([0055](0055-in-app-updater.md)) roda o novo instalador em silêncio, sem
   prompt de UAC; um só instalador leva pt-BR e EN
   ([0035](0035-cross-cutting-requirements.md)); o "Verso Beta" instala ao
   lado do "Verso" como no macOS
   ([0051](0051-development-flow-and-releases.md)). O bundle de Windows tem
   só o NSIS como alvo. O Windows 11 traz o WebView2 e o Windows 10 pode não
   ter, então o instalador embute o bootstrapper do WebView2 (uns 1,8 MB), que
   o instala quando falta (proposto; o padrão do Tauri baixa o bootstrapper
   na hora da instalação).
3. **Sem assinatura de código por enquanto.** O SmartScreen avisa na
   primeira execução de um instalador não assinado, e isso fica aceito até
   a distribuição pública, onde o
   [0051](0051-development-flow-and-releases.md) já põe a decisão de
   assinatura de código.
4. **Desenvolvido no Mac, construído e testado numa máquina Windows
   alcançada por SSH.** O repositório supõe só um host SSH chamado
   `verso-win`: Windows com OpenSSH, Windows PowerShell como shell, o MSVC
   Build Tools, rustup, Node 22 e Git com `core.autocrlf false`. Os scripts
   que montam a máquina virtual do mantenedor ficam fora do repositório:
   guardam os endereços da rede de casa. O PC de jogos é a verificação em
   hardware real (GPU, DPI alto), à mão, antes de uma versão.
5. **`scripts/check-windows.sh`**, ao lado do `check-linux.sh`: copia a
   árvore de trabalho para o host Windows byte a byte (arquivos rastreados e
   arquivos não rastreados que não são ignorados, sem conversão de fim de
   linha) e roda lá as verificações cuja resposta depende da plataforma:
   `cargo clippy` com `-D warnings` e `cargo test --workspace`. Isso vai
   além do [0029](0029-guardrails-in-ci.md), que dá ao Windows "uma
   verificação do build aqui e os testes no CI": os testes rodam aqui
   também, já que a máquina existe. **Decidido em 2026-10-07 pelo
   mantenedor ("Recomendado")**: obrigatório quando o diff toca código
   que depende da plataforma (`verso-fs`, `app/src-tauri`, caminhos de
   configuração, tudo sob `cfg(windows)`), opcional nos outros casos; para
   código que só o Windows compila, o pull request declara a execução como
   um passo, como faz hoje para código só de macOS
   ([0029](0029-guardrails-in-ci.md)).
6. **CI, quando o porte chegar.** `main` ganha um job de Windows com o
   clippy e os testes numa imagem de runner fixada, e o workflow de versão um
   job de Windows que gera o instalador, no pull request que traz a escrita
   atômica do item 9 — antes dele os testes falham no Windows (Contexto). Os
   pull requests ficam no Linux. Um minuto de Windows custa uns 1,7 de
   Linux. *Feito em 2026-10-08:* o `ci.yml` roda o clippy e os testes no
   `windows-2025` depois de um merge; o `release.yml` gera o instalador
   (`Verso[-Beta]-X.Y.Z-windows-x64-setup.exe`, com o nome que o
   atualizador procura) e o `verso-cli-X.Y.Z-windows-x64.zip`, com a UI
   compilada no bash do Git, e os publica junto com os arquivos do macOS.
7. **O app real testado por máquina no Windows, pela suíte ponta a ponta
   que o repositório já tem** (proposto, pull request próprio). O WebView2 é
   Chromium: iniciado com
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<porta>`,
   a janela real aceita o Playwright pelo Chrome DevTools Protocol. A suíte
   hoje é construída sobre o harness (`e2e/fixtures.mjs` abre
   `harness.html`, lê arquivos, inspeciona chamadas do contrato e emite
   `folder-changed` por `window.__harness`), então isto é uma segunda
   fixture de `app/ui/e2e`, ligada por CDP ao app com uma pasta real por
   teste, rodando as specs que não dependem do core em memória do harness;
   os passos do roteiro que o harness não alcança viram testes lá. Uma pasta
   de dados de usuário por teste (`WEBVIEW2_USER_DATA_FOLDER`), já que o
   controle compartilha uma por padrão; e uma área de trabalho para a janela
   (Contexto). O `tauri-driver` é a alternativa,
   só Windows e Linux; o `@wdio/tauri-service` do WebdriverIO alcançaria a
   janela real também no Mac, com um servidor WebDriver embutido — decisão
   própria, não deste ADR.
8. **Antes de qualquer máquina Windows: a suíte ponta a ponta em Chromium
   no Mac** (proposto, o primeiro passo do porte). Um projeto `chromium` do
   Playwright ao lado do `webkit`, no `scripts/check.sh`; o que difere entre
   os dois motores é a maior parte do que vai diferir no WebView2, e não
   custa runner nem SSH.
9. **O que o porte traz, cada item com um teste.**
   - Escrita atômica: `FlushFileBuffers` no arquivo temporário (`sync_all`),
     depois `MoveFileEx` com `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`
     e sem `MOVEFILE_COPY_ALLOWED`, para que a movimentação bloqueie até
     estar no disco e nunca degrade para uma cópia; e um handle aberto
     (antivírus, OneDrive) fazendo o rename falhar, com a nova tentativa que
     o teste fixa ([0029](0029-guardrails-in-ci.md)). O `std::fs::rename`
     não oferece `MOVEFILE_WRITE_THROUGH`, e chamar `MoveFileExW` com ele
     exige `unsafe`, que o workspace proíbe: o pull request nomeia a
     dependência que embrulha a chamada com segurança (justificada, passando
     no `cargo-deny`) ou a exceção ao guardrail, antes do código (`CLAUDE.md`
     §3). **`[ABERTO]`: o invariante 9 do `CLAUDE.md` e o ADR 0029 pedem um
     `fsync` do diretório depois do rename, e o Windows não tem essa chamada
     num handle de diretório.** Recomendação registrada: no Windows o
     `MOVEFILE_WRITE_THROUGH` faz as vezes do `fsync` do diretório, o mais
     forte que a API documentada oferece para um rename no mesmo volume,
     embora não documentado como equivalente (Contexto); o texto do
     guardrail diz isso. O mantenedor, perguntado em 2026-10-07, ainda não
     sabe ("Não sei"): o porte segue com esta recomendação como fato
     provisório, e o mantenedor decide no pull request que a trouxer.
     **O que o porte faz, 2026-10-08**: o `sync_all` do arquivo temporário,
     depois o `std::fs::rename` (que nunca degrada para uma cópia), depois o
     diretório descarregado — `FlushFileBuffers` num handle aberto com
     acesso de escrita e backup semantics, que o Windows aceita (medido,
     Contexto). Então existe um flush de diretório no Windows e o
     `MOVEFILE_WRITE_THROUGH` não é usado: nenhuma dependência nova, nenhum
     `unsafe`. Um rename que encontra um handle segurado é tentado de novo
     por até uns 2,5 s, e antes de cada tentativa confere-se que o destino
     ainda é o arquivo que foi lido (invariante 11) — mudou, a escrita para
     e o diff aparece. Um destino segurado responde "Access is denied"
     (medido), o mesmo erro que um destino somente leitura dá para sempre:
     o somente leitura é reconhecido antes e falha na hora.
     **Decidido pelo mantenedor em 2026-10-09** ("Recomendado"): este flush
     conta como o `fsync` de diretório do invariante 9 — o mesmo propósito,
     um rename que sobrevive a uma queda de energia, pelos meios da própria
     plataforma; o item 9 do §2 do `CLAUDE.md` diz isso.
   - **O separador de caminho: `/`, decidido definitivo pelo mantenedor em
     2026-10-09** (perguntado se havia motivo contra, não havia). O
     caminho de uma nota cruza o
     contrato como texto relativo à pasta aberta (ADR 0026, regra 4), os
     alvos de wikilink e o índice guardam caminhos, e o
     `docs/reference/mcp-decision.md` escolheu `/` enquanto "o Windows não é
     alvo". Recomendação registrada: `/` em todo caminho relativo à pasta
     aberta — o contrato, o índice, o MCP — e só o `verso-fs` o converte
     para a forma do SO na sua borda; o texto de um link dentro de uma nota
     é conteúdo do arquivo e não é tocado (invariantes 7 e 12). A API
     pública do Obsidian expõe `normalizePath` (`obsidian.d.ts`); a
     documentação dele no pacote da versão 1.14.4 dá
     `normalizePath('foo\\bar'); // foo/bar` — os caminhos do próprio
     Obsidian usam `/` em todo SO, como os do Verso. O
     mantenedor, perguntado em 2026-10-07, ainda não sabe ("Não sei"): o
     porte segue com esta recomendação como fato provisório, e o mantenedor
     decide no pull request que a trouxer, com a Q8 (maiúsculas) ao lado. Os caminhos absolutos da borda de entrada (invariante 4) ficam
     na forma do SO.
   - O watcher (`verso-fs/src/watch.rs`) sobre `ReadDirectoryChangesW`: os
     eventos que um salvamento, uma renomeação e uma hidratação do OneDrive
     levantam, contra o que o `docs/reference/watcher-decision.md` registra
     para o macOS.
   - O placeholder do OneDrive, `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, como
     fixture do `verso-fs`: o mantenedor fecha o `[ABERTO]` desse provedor no
     [0043](0043-placeholder-guard.md) no pull request do porte.
     **Decidido pelo mantenedor em 2026-10-08** ("deveria funcionar igual"
     ao iCloud), registrado no 0043: um arquivo com
     `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, `FILE_ATTRIBUTE_RECALL_ON_OPEN`
     ou `FILE_ATTRIBUTE_OFFLINE`, lidos pelo `file_attributes()` do std
     (sem dependência, sem `unsafe`), é um placeholder. Testado com
     `attrib +O`, já que a máquina de teste não tem conta do OneDrive; um
     placeholder real do OneDrive ainda está por observar.
   - Confinamento de caminhos contra as formas do Windows: letras de drive,
     caminhos UNC, `\`, junctions, nomes reservados (`CON`, `NUL`), nomes
     curtos 8.3, pontos e espaços no fim, e nomes sem distinção de
     maiúsculas (a Q8 da spec do dialeto é `[ABERTO]`). Nomes curtos 8.3,
     2026-10-08: um nome nesse formato (um `~` e um dígito) que nomeia algo
     é procurado na sua pasta, e uma grafia curta de outra entrada —
     `OBSIDI~1` para `.obsidian` — é recusada, para não passar pelas regras
     de oculto e de ignorado.
   - O local da configuração no Windows, com o log e o arquivo do índice
     que no macOS moram ao lado dela (`~/Library/Application Support/verso`):
     `[ABERTO]`; o [0011](0011-config-outside-tree-index-as-cache.md) não tem
     equivalente para Windows. O mantenedor, perguntado em 2026-10-07, ainda
     não sabe ("Não sei"): o porte propõe um local no pull request dele, com
     as razões, e o mantenedor decide ali. **Decidido em 2026-10-08**, o
     mantenedor deixando a escolha com o porte ("pode decidir a melhor
     abordagem que fizer mais sentido, qualquer coisa copia obsidian"):
     `%LOCALAPPDATA%\verso`, depois de `VERSO_CONFIG_DIR` e
     `XDG_CONFIG_HOME` e antes de `HOME`. O que mora lá — o índice, o
     arquivo lateral dele, o log — é a camada da máquina do ADR 0070, nunca
     sincronizada; `%APPDATA%` é o perfil móvel que uma rede de empresa
     copia entre máquinas, e a orientação do Windows deixa caches fora
     dele. As configurações ficam no armazenamento do web view, que o Tauri
     já guarda sob `%LOCALAPPDATA%`. O Obsidian guarda tudo em
     `%APPDATA%\obsidian`; copiá-lo era a saída para a dúvida, e a regra
     da plataforma não deixou nenhuma. A configuração do Claude Desktop,
     que o "Adicionar ao Claude" escreve, é `%APPDATA%\Claude`, dele.
   - O caminho de instalação do atualizador no Windows, que existe e nunca
     rodou ([0055](0055-in-app-updater.md)), e o seu rollback.
   - A linha de comando no `PATH`, e as teclas que o tutorial ensina, com
     Ctrl onde o macOS tem ⌘. **Decidido pelo mantenedor em 2026-10-08**,
     aceitando a recomendação do autor: o instalador põe o `verso.exe` ao
     lado do `verso-app.exe` (o `externalBin` do Tauri), e o "Adicionar ao
     Claude" grava o caminho absoluto dele na configuração do Claude
     Desktop — o caminho da pasta continua não indo a lugar nenhum, só a
     chave dela. No `PATH` ele ainda não é posto. O `externalBin` é dado
     só na hora do pacote, no arquivo de configuração que o
     `scripts/check-windows.sh --bundle` escreve (no `tauri.conf.json` todo
     build precisaria do arquivo); o job de versão do Windows, quando
     existir, passa o mesmo.

## Consequências

- **Ordem do trabalho** (recomendação registrada, decisão do mantenedor): o
  porte nasce de `main` depois do merge do pull request #37; o primeiro
  pull request dele é só infraestrutura — item 8, `scripts/check-windows.sh`,
  um build NSIS que instala e abre — e não toca código do `verso-fs`; o
  `verso-fs` e o job do CI vêm depois, em pull requests grandes como a regra
  1 do ADR 0033 manda até o fluxo inteiro existir, cada item do 9 com o seu
  teste e nomeado no "O quê" do pull request, já que o `verso-fs` é a crate
  sob os invariantes 5, 9 e 11.
- Duas notas de referência contradizem o ADR 0022 como revisado em
  2026-09-23: `docs/reference/mcp-decision.md` ("Windows não é alvo", sobre
  o separador de caminho) e `docs/reference/watcher-decision.md` ("Windows
  (ainda não é alvo)", contra a sua própria tabela). O pull request do
  porte as corrige, ou registra por que não.
- O `README.md` já promete uma verificação do build de Windows ao lado dos
  scripts locais; o item 5 é essa verificação, e mais do que o ADR 0029
  pediu (os testes também). A tabela de plataformas do ADR 0029 ganha a
  linha quando o item 5 chegar.
- A máquina virtual roda a avaliação do Windows 11 Enterprise, que expira em
  90 dias; os seus scripts a remontam sem intervenção.
- A máquina virtual roda o Windows 11. O Windows 10 precisa de uma máquina
  própria para ser testado (proposto: uma segunda máquina virtual, da
  avaliação do Windows 10 Enterprise LTSC); até lá o Windows 10 é suportado
  mas não rodado. **Decidido em 2026-10-07 pelo mantenedor**: a máquina
  fica para depois ("fica pra depois"), o item 1 fica, e o porte é escrito
  com o Windows 10 em mente desde o início ("já desenvolve com win 10 em
  mente"): nenhuma API que só o Windows 11 tem, o WebView2 instalado pelo
  instalador onde falta, e toda escolha sob `cfg(windows)` conferida contra
  a documentação do Windows 10. A primeira beta para Windows pode sair antes
  de o Windows 10 ser rodado; as notas da versão dizem isso.
- **Pedido pelo mantenedor em 2026-10-08**: o que precisou ser corrigido
  para o primeiro build de Windows fica escrito onde os agentes leem, para
  que o trabalho feito no Mac saia certo no Windows na primeira vez
  ("tomar nota de todos os problemas que foram corrigidos para que a versão
  Windows fosse gerada e a gente não repetisse"):
  [`cross-platform-checklist.md`](../reference/cross-platform-checklist.md),
  apontado pelo `CLAUDE.md` §4. Registra hábitos e as suas correções; não
  decide nada novo.
- **Medido em 2026-10-08**: o primeiro índice de 5.000 notas levou 228 s
  na máquina Windows contra 3,4 s no macOS — um commit do SQLite por nota,
  cada um um `FlushFileBuffers` de verdade no Windows. O índice, um cache
  (ADR 0011), agora roda em WAL com `synchronous = NORMAL` e uma transação
  por rodada de índice: 9,1 s no Windows, 2,6 s no macOS. Registrado no
  checklist entre plataformas.
- Sem GPU na máquina virtual: o WebView2 renderiza em software lá. A taxa de
  quadros do board é julgada no PC de jogos.
- Cada job de Windows no CI custa uns 1,7 de um de Linux, só em `main` e
  numa versão.

## Alternativas descartadas

- **O PC de jogos como a máquina Windows.** Tem GPU de verdade, mas é
  dividido com os jogos, não tem snapshots para voltar a uma instalação
  limpa, e fica em outro cômodo. Mantido para as verificações em hardware
  real.
- **Só o CI (`windows-latest`).** Constrói e testa, mas ninguém consegue
  olhar o app, e cada tentativa custa minutos de runner.
- **Compilação cruzada a partir do Mac (`cargo-xwin`).** O suporte do Tauri
  é experimental e só NSIS, e constrói sem rodar nada.
- **MSI (WiX).** Por máquina: o atualizador levantaria um prompt de UAC a
  cada atualização; um MSI por idioma; só constrói no Windows. Serve à
  implantação em empresas, que pode acrescentá-lo depois.
- **Windows em ARM.** Nenhuma máquina para testar.
- **Só Windows 11.** Proposto na sessão, já que o Windows 10 saiu do
  suporte; o mantenedor manteve o Windows 10, porque muita máquina nunca
  recebeu a atualização.

## Status

Proposto. Decidido pelo mantenedor em 2026-10-07: o app de Windows começa
agora e passa à frente do resto do trabalho da Fase 2 — faz parte do escopo
da Fase 2, e sai antes de a Fase 2 fechar ("Vou passar windows na frente";
ADR 0022 e roadmap revisados no mesmo dia); só x64, sem ARM64, e Windows 10
e 11 (item 1); NSIS por usuário (item 2); sem assinatura de código por
enquanto (item 3, lendo o seu "por enquanto sim" como aceite do instalador
não assinado); `scripts/check-windows.sh` obrigatório quando o diff toca
código de plataforma, opcional nos outros casos (item 5, "Recomendado"); a
máquina com Windows 10 depois, o porte escrito com o Windows 10 em mente
desde o início (Consequências). Proposto: o bootstrapper do WebView2
embutido (item 2), os itens 4, 6 a 9, e a ordem do trabalho. `[ABERTO]`, o
mantenedor ainda sem saber ("Não sei") e o porte seguindo com a
recomendação registrada como fato provisório até o pull request dele: o
que o `fsync` do diretório significa no Windows (item 9); o separador de
caminho num caminho relativo à pasta aberta (item 9). Decidido em
2026-10-08: o local da configuração, `%LOCALAPPDATA%\verso` (item 9, a
escolha deixada ao porte); o placeholder do OneDrive tratado como o do
iCloud (item 9, ADR 0043).
